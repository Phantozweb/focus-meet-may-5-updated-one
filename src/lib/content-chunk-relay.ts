// Focus Meet — Store-and-Forward Content Chunk Relay
// WHY this file exists: Real-time WebRTC streaming breaks at 10,000+ users because
// every peer can only serve a handful of direct connections. The store-and-forward
// model trades 1-5 minute latency for massive scalability: the host creates
// timestamped content chunks that propagate through the P2P tree like a CDN.
// Each relay node receives, stores, then forwards — never crashing, never
// exceeding memory limits, always prioritizing audio over video.

// ============ TYPES ============

/**
 * The type of content inside a chunk.
 * WHY these categories exist:
 * - video-keyframe: Full frame — needed to decode subsequent delta frames.
 *   Without a keyframe, delta frames are useless. Sent every 5s.
 * - video-delta: Incremental frame — much smaller than keyframes but
 *   depends on the previous keyframe being available.
 * - audio: The highest-priority content. Users tolerate bad video but
 *   NOT bad audio. Sent every 1s for minimal stutter.
 * - slide: Presentation slides — change infrequently but must be pixel-perfect.
 *   Debounced at 500ms to avoid sending 60fps of slide transitions.
 * - annotation: Drawing/pointer on slides — lower priority than the slide itself.
 * - chat: Text messages — lowest urgency, small payload, high volume.
 */
export type ContentChunkType =
  | 'video-keyframe'
  | 'video-delta'
  | 'audio'
  | 'slide'
  | 'annotation'
  | 'chat';

/**
 * Priority levels for content delivery.
 * WHY this ordering: When bandwidth is limited (which is ALWAYS the case at scale),
 * we must decide what to drop. Audio is non-negotiable — a webinar without audio
 * is broken. Slides carry the actual information. Video keyframes unlock all
 * subsequent delta frames. Delta frames are the first to sacrifice.
 *
 * 0 = Critical (audio) — always deliver, never drop
 * 1 = High (slide) — slides carry the presentation content
 * 2 = Normal (video keyframe) — needed to decode delta frames
 * 3 = Low (video delta) — drop first when bandwidth is scarce
 * 4 = Best-effort (annotation, chat) — nice to have, not essential
 */
export type ContentPriority = 0 | 1 | 2 | 3 | 4;

/**
 * A single piece of content that flows through the relay tree.
 *
 * WHY chunk-based instead of streaming: At 10,000+ users, maintaining
 * a continuous stream to every viewer is impossible. Chunks are discrete,
 * deduplicatable, reorderable by priority, and can be forwarded independently.
 * Think of it as HLS (HTTP Live Streaming) but over P2P data channels.
 */
export interface ContentChunk {
  /** Unique identifier: `${chunkType}-${timestamp}-${sequence}`.
   *  WHY: Deduplication requires globally unique IDs. A node might receive
   *  the same chunk from multiple parents (redundant paths) — the ID
   *  lets us discard duplicates without processing them. */
  id: string;

  /** What kind of content this chunk carries. */
  chunkType: ContentChunkType;

  /** When the host created this chunk (host's wall-clock time in ms).
   *  WHY: Viewers need to know the age of content. If a chunk is older
   *  than the TTL, it's stale and should be garbage collected.
   *  Also used to compute end-to-end latency for monitoring. */
  timestamp: number;

  /** Monotonically increasing sequence number within this chunkType.
   *  WHY: Even if timestamps collide (same millisecond), the sequence
   *  guarantees ordering. Viewers reconstruct the stream by sorting
   *  on (timestamp, sequence). */
  sequence: number;

  /** Which room this chunk belongs to.
   *  WHY: A single relay node might serve multiple rooms simultaneously.
   *  Room isolation prevents cross-room content leakage. */
  roomId: string;

  /** The actual content.
   *  WHY ArrayBuffer for video/audio: Binary data is ~50% smaller than base64
   *  strings over WebRTC data channels. For slides/chat, strings are simpler
   *  and the data is small enough that encoding overhead doesn't matter. */
  data: ArrayBuffer | string;

  /** Delivery priority (0=critical → 4=best-effort).
   *  WHY: When the outgoing queue is full, we drop low-priority chunks
   *  before high-priority ones. This ensures audio always gets through
   *  even if video frames are sacrificed. */
  priority: ContentPriority;

  /** Time-to-live in milliseconds.
   *  WHY: Old content is useless — nobody wants to see a slide from 10 minutes
   *  ago. TTL prevents unbounded memory growth. Default 5 minutes matches
   *  the user-accepted maximum latency. */
  ttl: number;

  /** The peer that originally created this chunk.
   *  WHY: For diagnostics and loop prevention. If we see our own peerId
   *  as sourcePeerId on an incoming chunk, something is wrong. */
  sourcePeerId: string;

  /** How many relay hops this chunk has traversed.
   *  WHY: Prevents infinite relay loops. If a chunk has been relayed 7 times,
   *  it's probably going in circles — stop forwarding it. */
  hops: number;

  /** Maximum allowed hops before we stop forwarding.
   *  WHY: The tree has a maximum depth (7 levels at tier5). If a chunk
   *  exceeds maxHops, it means it's either looping or the tree is
   *  deeper than expected — both are error conditions. */
  maxHops: number;
}

/**
 * Operational statistics for the content relay.
 * WHY: Monitoring is essential at scale. These stats let the UI show
 * buffer health, latency estimates, and backpressure warnings.
 * Without visibility, operators can't diagnose why viewers see stale content.
 */
export interface ContentRelayStats {
  /** Number of chunks currently stored in the buffer. */
  bufferedChunks: number;
  /** Total bytes consumed by the buffer. */
  bufferedBytes: number;
  /** Maximum allowed buffer size in bytes. */
  maxBufferBytes: number;
  /** Buffer utilization as a fraction 0-1.
   *  WHY: When this exceeds BACKPRESSURE_THRESHOLD, the relay enters
   *  backpressure mode and starts dropping low-priority chunks. */
  bufferUtilization: number;
  /** Whether the relay is in backpressure mode. */
  isBackpressured: boolean;
  /** Total chunks sent (forwarded to children). */
  chunksSent: number;
  /** Total chunks received (from parent or host). */
  chunksReceived: number;
  /** Chunks discarded because they were already seen. */
  chunksDeduplicated: number;
  /** Chunks dropped due to backpressure (outgoing queue full). */
  chunksDropped: number;
  /** Chunks garbage collected because TTL expired. */
  chunksExpired: number;
  /** Total chunks waiting in all outgoing queues. */
  outgoingQueueDepth: number;
  /** Average age of chunks in the buffer (ms since creation).
   *  WHY: If the average age is approaching TTL, the relay is falling
   *  behind — chunks are being buffered faster than they're consumed. */
  avgChunkAge: number;
  /** Estimated end-to-end delivery latency in ms.
   *  WHY: The user accepted 1-5 min latency. If we're exceeding that,
   *  something is wrong and the operator needs to know. */
  deliveryLatency: number;
}

/**
 * Result of receiving a chunk — tells the caller whether to forward
 * and to which peers.
 * WHY: The receive method is the hot path. It needs to be fast AND
 * provide enough information for the caller to make forwarding decisions
 * without additional lookups.
 */
export interface ReceiveResult {
  /** Whether this chunk was accepted into the buffer. */
  accepted: boolean;
  /** If not accepted, why? Useful for diagnostics. */
  reason?: string;
  /** Peer IDs that should receive this chunk next.
   *  WHY: The caller doesn't need to know about the relay's children —
   *  that's the relay's job. But the relay does need to know which
   *  children still need this chunk, considering backpressure. */
  forwardTo: string[];
}

/**
 * Result of forwarding a chunk to children.
 * WHY: Forwarding can partially succeed — some children accept, others
 * have full queues. The caller needs to know the breakdown.
 */
export interface ForwardResult {
  /** Number of children that received the chunk immediately. */
  forwarded: number;
  /** Number of children whose queues were full — chunk dropped for them. */
  dropped: number;
  /** Number of children where the chunk was queued (will be sent later). */
  queued: number;
}

// ============ CONSTANTS ============

/**
 * Configuration constants for the content chunk relay.
 * WHY each value exists:
 * - VIDEO_KEYFRAME_INTERVAL: Keyframes are expensive but necessary.
 *   Every 5s is a balance — too frequent wastes bandwidth, too rare
 *   means new viewers wait up to 5s before they can decode the stream.
 * - VIDEO_SEGMENT_DURATION: 2s segments match typical HLS segment size.
 *   Short enough for reasonable latency, long enough for compression.
 * - AUDIO_SEGMENT_DURATION: 1s for minimal stutter. Audio chunks are
 *   small (~8KB for Opus at 64kbps), so frequency isn't expensive.
 * - SLIDE_DEBOUNCE: Slides don't change at 60fps. 500ms debounce
 *   prevents sending intermediate transition frames.
 * - DEFAULT_TTL: 5 minutes matches the user's accepted max latency.
 *   Content older than this is definitely stale and should be collected.
 * - MAX_BUFFER_BYTES: 100MB is the memory budget. On a desktop with 8GB,
 *   this is ~1.25%. On mobile with 4GB, it's ~2.5%. Both are acceptable.
 * - MAX_OUTGOING_QUEUE: 50 chunks per peer × ~50KB avg = ~2.5MB per peer.
 *   With 10 children, that's 25MB — well within the 100MB budget.
 * - MAX_HOPS: 7 matches the maximum tree depth in tier5. Any more hops
 *   means the chunk is looping or the tree is broken.
 * - GARBAGE_COLLECT_INTERVAL: 10s is frequent enough to prevent memory
 *   bloat but not so frequent that GC itself becomes a CPU burden.
 * - DEDUP_SET_SIZE: 10,000 IDs ≈ 500KB of memory. Covers ~5 minutes
 *   of audio at 1 chunk/s, which matches the TTL window.
 * - BACKPRESSURE_THRESHOLD: 85% buffer utilization triggers backpressure.
 *   This leaves 15MB of headroom (at 100MB max) for critical-priority
 *   chunks that must not be dropped.
 * - CHUNK_SIZE_LIMIT: 512KB per chunk prevents a single oversized chunk
 *   from consuming too much buffer space or exceeding WebRTC data
 *   channel message limits (typically 256KB with fragmentation).
 */
export const CHUNK_CONFIG = {
  VIDEO_KEYFRAME_INTERVAL: 5000,
  VIDEO_SEGMENT_DURATION: 2000,
  AUDIO_SEGMENT_DURATION: 1000,
  SLIDE_DEBOUNCE: 500,
  DEFAULT_TTL: 300000,
  MAX_BUFFER_BYTES: 100 * 1024 * 1024,
  MAX_OUTGOING_QUEUE: 50,
  MAX_HOPS: 7,
  GARBAGE_COLLECT_INTERVAL: 10000,
  DEDUP_SET_SIZE: 10000,
  BACKPRESSURE_THRESHOLD: 0.85,
  CHUNK_SIZE_LIMIT: 512 * 1024,
} as const;

/**
 * Priority mapping from chunk type to numeric priority.
 * WHY a mapping instead of inline numbers: Single source of truth.
 * If we ever need to reprioritize (e.g., make annotations higher than
 * video-delta for educational webinars), we change it here.
 */
const PRIORITY_MAP: Record<ContentChunkType, ContentPriority> = {
  'video-keyframe': 2,
  'video-delta': 3,
  'audio': 0,
  'slide': 1,
  'annotation': 4,
  'chat': 4,
};

// ============ LRU DEDUPLICATION SET ============

/**
 * A bounded set that evicts the oldest entries when capacity is reached.
 * WHY: A plain Set would grow unboundedly — at 10 chunks/s, a Set
 * would hold 600,000 entries after 16 hours. The LRU Set caps at
 * DEDUP_SET_SIZE (10,000), covering the recent TTL window without
 * unbounded memory growth.
 *
 * Implementation: A Map preserves insertion order, so we delete the
 * first (oldest) entry when we exceed capacity. This is O(1) amortized
 * because Map iteration order is guaranteed by the spec.
 */
class LRUDedupSet {
  private set: Map<string, boolean> = new Map();
  private readonly maxSize: number;

  constructor(maxSize: number = CHUNK_CONFIG.DEDUP_SET_SIZE) {
    this.maxSize = maxSize;
  }

  /** Check if an ID has been seen before. O(1). */
  has(id: string): boolean {
    return this.set.has(id);
  }

  /** Mark an ID as seen. Evicts oldest entry if at capacity. O(1) amortized. */
  add(id: string): void {
    if (this.set.has(id)) return;
    this.set.set(id, true);
    if (this.set.size > this.maxSize) {
      // Delete the oldest entry (first key in insertion order)
      const oldest = this.set.keys().next().value;
      if (oldest !== undefined) {
        this.set.delete(oldest);
      }
    }
  }

  /** Current size of the set. */
  get size(): number {
    return this.set.size;
  }

  /** Clear all entries. */
  clear(): void {
    this.set.clear();
  }
}

// ============ CONTENT CHUNK RELAY ============

/**
 * Store-and-forward content relay for massive-scale webinar delivery.
 *
 * ARCHITECTURE:
 * ```
 * Host → creates ContentChunks every 2-5 seconds
 * Host → sends chunks to Root nodes via data channels
 * Root → stores chunks in buffer → forwards to Branch nodes
 * Branch → stores chunks in buffer → forwards to Sub-Branch nodes
 * Sub-Branch → stores chunks in buffer → delivers to Leaf viewers
 * Leaf → receives chunks → assembles into playable stream
 * ```
 *
 * WHY this class exists: WebRTC real-time streaming caps out around 50-100
 * direct connections per peer. The store-and-forward model turns each relay
 * node into a mini-CDN edge: it receives content, persists it locally, then
 * forwards to its children. The 1-5 minute latency budget gives us enormous
 * flexibility — we can batch, prioritize, deduplicate, and rate-limit without
 * worrying about real-time deadlines.
 *
 * NEVER CRASH guarantees:
 * - Memory is bounded by maxBytesBuffered (default 100MB)
 * - Backpressure activates at 85% utilization, dropping low-priority chunks
 * - Outgoing queues are per-peer with hard limits (50 chunks)
 * - Chunk size is capped at 512KB to prevent any single chunk from consuming
 *   too much buffer space
 * - Deduplication set is LRU-bounded to prevent unbounded growth
 * - Garbage collection runs every 10s to reclaim expired chunks
 * - Eviction policy removes oldest/lowest-priority chunks first when memory is needed
 */
export class ContentChunkRelay {
  // ============ STORAGE ============

  /**
   * Main content buffer: chunkId → ContentChunk.
   * WHY a Map instead of array: O(1) lookup by ID for deduplication checks,
   * O(1) deletion for garbage collection, and natural ordering by insertion time.
   */
  private chunkBuffer: Map<string, ContentChunk> = new Map();

  /**
   * Deduplication history: set of recently seen chunk IDs.
   * WHY: In a tree topology, a node might receive the same chunk from multiple
   * parents (e.g., during failover when reconnecting to a new parent that
   * already sent the same content). The dedup set prevents processing
   * the same chunk twice, which would waste bandwidth on re-forwarding.
   */
  private receivedChunkIds: LRUDedupSet = new LRUDedupSet();

  /**
   * Total bytes currently stored in the buffer.
   * WHY: We track this incrementally (add on receive, subtract on evict/expire)
   * instead of iterating the entire buffer each time. At 10,000 chunks,
   * iterating would be expensive; a counter is O(1).
   */
  private totalBytesBuffered: number = 0;

  /**
   * Maximum bytes allowed in the buffer.
   * WHY: Without a hard limit, a relay node could consume all available memory
   * if the host is producing chunks faster than children can consume them.
   * 100MB is enough for ~5 minutes of content at typical bitrates.
   */
  private maxBytesBuffered: number;

  // ============ STATISTICS ============

  private chunksSent: number = 0;
  private chunksReceived: number = 0;
  private chunksDeduplicated: number = 0;
  private chunksDropped: number = 0;
  private chunksExpired: number = 0;

  // ============ BACKPRESSURE ============

  /**
   * Per-peer outgoing queues: peerId → array of chunks waiting to be sent.
   * WHY: When a child's data channel is congested (bufferedAmount is high),
   * we can't send immediately. Instead of blocking the relay, we queue
   * chunks per-peer. This isolates congestion — a slow child doesn't
   * block delivery to fast children.
   */
  private outgoingQueue: Map<string, ContentChunk[]> = new Map();

  /**
   * Maximum number of chunks queued per peer.
   * WHY: An unbounded per-peer queue could consume all memory if a child
   * goes offline without closing the data channel. 50 chunks × ~50KB avg
   * = ~2.5MB per peer. With 20 children, that's 50MB — manageable.
   */
  private maxOutgoingQueueSize: number;

  /**
   * Whether the relay is in backpressure mode.
   * WHY: Backpressure mode changes forwarding behavior — instead of
   * queuing all chunks, we drop low-priority ones and only queue
   * critical/high priority. This prevents memory exhaustion while
   * ensuring essential content (audio, slides) always gets through.
   */
  private isBackpressured: boolean = false;

  // ============ GARBAGE COLLECTION ============

  /** Timer handle for periodic garbage collection. */
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * This relay node's peer ID, used in chunk creation.
   * WHY: When creating chunks, we need to stamp them with our identity
   * so downstream nodes can trace the origin and detect loops.
   */
  private peerId: string;

  /**
   * The room this relay is serving.
   * WHY: Each relay instance serves one room. Room isolation prevents
   * content from one webinar leaking into another.
   */
  private roomId: string;

  // ============ SEQUENCE TRACKERS ============

  /**
   * Per-type sequence counters for chunk creation.
   * WHY: Each chunk type needs its own monotonically increasing sequence.
   * Audio at sequence 100 and video at sequence 100 are independent —
   * viewers reconstruct each type's stream separately.
   */
  private sequenceCounters: Map<ContentChunkType, number> = new Map();

  // ============ CONSTRUCTOR ============

  /**
   * Create a new ContentChunkRelay.
   *
   * @param peerId - This relay node's unique peer identifier
   * @param roomId - The room this relay serves
   * @param options - Optional overrides for buffer size and queue limits
   *
   * WHY constructor injection: The peerId and roomId are fundamental to
   * the relay's identity and must be provided at construction time.
   * Memory limits can be overridden for testing or constrained environments.
   */
  constructor(
    peerId: string,
    roomId: string,
    options?: {
      maxBytesBuffered?: number;
      maxOutgoingQueueSize?: number;
    }
  ) {
    this.peerId = peerId;
    this.roomId = roomId;
    this.maxBytesBuffered = options?.maxBytesBuffered ?? CHUNK_CONFIG.MAX_BUFFER_BYTES;
    this.maxOutgoingQueueSize = options?.maxOutgoingQueueSize ?? CHUNK_CONFIG.MAX_OUTGOING_QUEUE;

    // Initialize sequence counters for all chunk types
    for (const chunkType of [
      'video-keyframe',
      'video-delta',
      'audio',
      'slide',
      'annotation',
      'chat',
    ] as ContentChunkType[]) {
      this.sequenceCounters.set(chunkType, 0);
    }

    // Start periodic garbage collection
    // WHY: Without periodic GC, expired chunks accumulate until the next
    // receiveChunk call triggers eviction. But if no new chunks arrive
    // (e.g., host pauses), memory is never reclaimed.
    this.gcTimer = setInterval(() => {
      this.garbageCollect();
    }, CHUNK_CONFIG.GARBAGE_COLLECT_INTERVAL);
  }

  // ============ CHUNK CREATION ============

  /**
   * Create a new content chunk from local data (typically called by the host).
   *
   * WHY a factory method instead of raw object creation:
   * 1. Auto-generates the unique ID from type + timestamp + sequence
   * 2. Auto-increments the sequence counter
   * 3. Auto-assigns priority based on chunk type
   * 4. Validates chunk size against the limit
   * 5. Sets roomId and sourcePeerId consistently
   *
   * This eliminates a whole class of bugs where chunks have duplicate IDs,
   * wrong priorities, or missing fields.
   *
   * @param chunkType - What kind of content this is
   * @param data - The content payload (ArrayBuffer for video/audio, string for slides/chat)
   * @param options - Optional overrides for TTL and priority
   * @returns The created ContentChunk, or null if the chunk exceeds size limits
   */
  createChunk(
    chunkType: ContentChunkType,
    data: ArrayBuffer | string,
    options?: {
      ttl?: number;
      priority?: ContentPriority;
    }
  ): ContentChunk | null {
    // Validate chunk size
    // WHY: A single oversized chunk (e.g., an uncompressed 1080p frame at 6MB)
    // would consume 6% of the entire 100MB buffer. The 512KB limit ensures
    // any single chunk is at most 0.5% of the buffer.
    const dataBytes =
      data instanceof ArrayBuffer ? data.byteLength : new TextEncoder().encode(data).byteLength;

    if (dataBytes > CHUNK_CONFIG.CHUNK_SIZE_LIMIT) {
      console.warn(
        `[ContentChunkRelay] Chunk size ${dataBytes} exceeds limit ${CHUNK_CONFIG.CHUNK_SIZE_LIMIT}. ` +
          `Chunk type: ${chunkType}. Split into smaller segments.`
      );
      return null;
    }

    const now = Date.now();
    const sequence = this.sequenceCounters.get(chunkType) ?? 0;
    this.sequenceCounters.set(chunkType, sequence + 1);

    const chunk: ContentChunk = {
      id: `${chunkType}-${now}-${sequence}`,
      chunkType,
      timestamp: now,
      sequence,
      roomId: this.roomId,
      data,
      priority: options?.priority ?? PRIORITY_MAP[chunkType],
      ttl: options?.ttl ?? CHUNK_CONFIG.DEFAULT_TTL,
      sourcePeerId: this.peerId,
      hops: 0,
      maxHops: CHUNK_CONFIG.MAX_HOPS,
    };

    return chunk;
  }

  // ============ CHUNK RECEIPT ============

  /**
   * Receive a chunk from an upstream node (parent or host).
   *
   * This is the HOT PATH — called for every chunk that arrives.
   * Optimized for speed: O(1) dedup check, O(1) buffer insertion.
   *
   * WHY the return type includes forwardTo: The caller (typically the
   * P2P layer) needs to know which children should receive this chunk,
   * but it shouldn't have to query the relay's child list separately.
   * Bundling this info in the response avoids a second lookup.
   *
   * Rejection reasons (returned when accepted=false):
   * - "duplicate": Already processed this chunk — no action needed
   * - "max_hops_exceeded": Chunk has been relayed too many times — possible loop
   * - "chunk_too_large": Exceeds CHUNK_SIZE_LIMIT — corrupted or malicious
   * - "wrong_room": Chunk belongs to a different room — misrouting
   * - "buffer_full": Memory limit reached and eviction failed — system overloaded
   *
   * @param chunk - The chunk to receive
   * @returns Whether it was accepted and which peers to forward to
   */
  receiveChunk(chunk: ContentChunk): ReceiveResult {
    this.chunksReceived++;

    // === Deduplication check ===
    // WHY first: This is the cheapest check and eliminates the majority
    // of redundant work in a tree topology with redundant paths.
    if (this.receivedChunkIds.has(chunk.id)) {
      this.chunksDeduplicated++;
      return { accepted: false, reason: 'duplicate', forwardTo: [] };
    }

    // === Hop count check ===
    // WHY second: A chunk that's been relayed too many times is either
    // looping (bug) or the tree is too deep (misconfiguration).
    // Forwarding it further wastes bandwidth and could create infinite loops.
    if (chunk.hops >= chunk.maxHops) {
      return { accepted: false, reason: 'max_hops_exceeded', forwardTo: [] };
    }

    // === Chunk size validation ===
    // WHY: Even though the creator validates size, intermediate nodes
    // must also validate. A malicious or buggy upstream node could
    // send oversized chunks that would consume too much buffer space.
    const dataBytes =
      chunk.data instanceof ArrayBuffer
        ? chunk.data.byteLength
        : new TextEncoder().encode(chunk.data).byteLength;

    if (dataBytes > CHUNK_CONFIG.CHUNK_SIZE_LIMIT) {
      return { accepted: false, reason: 'chunk_too_large', forwardTo: [] };
    }

    // === Room isolation ===
    // WHY: Content must not leak between rooms. If a chunk arrives
    // for the wrong room, it's a routing error.
    if (chunk.roomId !== this.roomId) {
      return { accepted: false, reason: 'wrong_room', forwardTo: [] };
    }

    // === Memory management ===
    // WHY: Before accepting, we must ensure there's room. If the buffer
    // is full, we try to evict old/low-priority chunks. If that fails
    // (everything in the buffer is high priority and recent), we reject.
    if (!this.ensureBufferSpace(dataBytes)) {
      this.chunksDropped++;
      return { accepted: false, reason: 'buffer_full', forwardTo: [] };
    }

    // === Accept the chunk ===
    this.chunkBuffer.set(chunk.id, chunk);
    this.totalBytesBuffered += dataBytes;
    this.receivedChunkIds.add(chunk.id);

    // Update backpressure state
    this.isBackpressured = this.checkBackpressure();

    // Determine which children to forward to
    // WHY: Even in backpressure mode, we still forward — we just
    // drop low-priority chunks from the outgoing queue, not from
    // the acceptance path. The forwarding method handles queue limits.
    const forwardTo = Array.from(this.outgoingQueue.keys());

    return { accepted: true, forwardTo };
  }

  // ============ CHUNK FORWARDING ============

  /**
   * Forward a chunk to child peers.
   *
   * WHY separate from receiveChunk: Forwarding is a different concern
   * from receiving. The caller might want to:
   * 1. Receive a chunk (store it) without forwarding (e.g., leaf node)
   * 2. Forward a stored chunk to new children (e.g., late-joining child)
   * 3. Re-forward after backpressure clears
   *
   * The forwarding logic handles:
   * - Incrementing the hop counter on the forwarded chunk
   * - Per-peer queue limits
   * - Priority-based dropping when queues are full
   * - Backpressure-aware forwarding (drop low-priority under pressure)
   *
   * @param chunk - The chunk to forward
   * @param childPeerIds - Peer IDs of children to forward to
   * @returns Breakdown of forwarding results
   */
  forwardChunk(chunk: ContentChunk, childPeerIds: string[]): ForwardResult {
    let forwarded = 0;
    let dropped = 0;
    let queued = 0;

    // Increment hop count for the forwarded copy
    // WHY: Each relay hop increments the counter so downstream nodes
    // know how far this chunk has traveled. We create a new object
    // instead of mutating the original — the original stays in our
    // buffer with its original hop count for playback purposes.
    const forwardedChunk: ContentChunk = {
      ...chunk,
      hops: chunk.hops + 1,
    };

    for (const peerId of childPeerIds) {
      // Skip if this peer is the source — prevent loops
      // WHY: In rare cases (network reconfiguration), a child might
      // also be a parent. Forwarding back to the source creates a loop.
      if (peerId === chunk.sourcePeerId) {
        continue;
      }

      const queue = this.outgoingQueue.get(peerId);

      // If peer not in our outgoing map, skip (not our child)
      if (!queue) {
        continue;
      }

      // Under backpressure, drop low-priority chunks
      // WHY: When the system is under memory pressure, we must be
      // selective. Audio (priority 0) and slides (priority 1) always
      // get through. Video-delta (priority 3) and annotation/chat
      // (priority 4) are sacrificed first.
      if (this.isBackpressured && chunk.priority >= 3) {
        this.chunksDropped++;
        dropped++;
        continue;
      }

      if (queue.length < this.maxOutgoingQueueSize) {
        queue.push(forwardedChunk);
        queued++;
      } else {
        // Queue is full — try to make room by dropping the lowest-priority
        // chunk in the queue, but only if the new chunk is higher priority
        // WHY: A full queue of audio chunks shouldn't be evicted for a
        // video-delta chunk. But a full queue of video-delta chunks
        // SHOULD be evicted for an audio chunk.
        const lowestPriorityIndex = this.findLowestPriorityIndex(queue);
        if (
          lowestPriorityIndex !== -1 &&
          queue[lowestPriorityIndex].priority > forwardedChunk.priority
        ) {
          // Replace the lowest-priority chunk with the new higher-priority one
          queue[lowestPriorityIndex] = forwardedChunk;
          this.chunksDropped++; // Count the evicted chunk as dropped
          queued++;
        } else {
          // New chunk is same or lower priority — drop it
          this.chunksDropped++;
          dropped++;
        }
      }
    }

    this.chunksSent += queued;
    return { forwarded, dropped, queued };
  }

  // ============ PLAYBACK RETRIEVAL ============

  /**
   * Get chunks for playback, optionally filtered by type and time.
   *
   * WHY: The viewer's playback system needs to reconstruct the stream
   * from buffered chunks. It asks for chunks since a given timestamp
   * (its last playback position) and optionally filters by type
   * (e.g., only audio for audio-only mode).
   *
   * Chunks are returned sorted by (timestamp, sequence) to ensure
   * correct playback order regardless of arrival order.
   *
   * @param sinceTimestamp - Only return chunks created after this time
   * @param type - Optional filter by chunk type
   * @returns Sorted array of content chunks
   */
  getChunksForPlayback(sinceTimestamp: number, type?: ContentChunkType): ContentChunk[] {
    const results: ContentChunk[] = [];

    for (const chunk of this.chunkBuffer.values()) {
      if (chunk.timestamp <= sinceTimestamp) continue;
      if (type !== undefined && chunk.chunkType !== type) continue;
      results.push(chunk);
    }

    // Sort by timestamp, then sequence for stable ordering
    results.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.sequence - b.sequence;
    });

    return results;
  }

  // ============ GARBAGE COLLECTION ============

  /**
   * Remove expired chunks from the buffer.
   *
   * WHY: Without GC, the buffer grows until eviction is forced during
   * receiveChunk — but that's the hot path and should be fast. GC runs
   * on a timer (every 10s) and cleanly removes chunks whose TTL has
   * expired, keeping the buffer healthy.
   *
   * TTL expiration means: `Date.now() - chunk.timestamp > chunk.ttl`
   * A chunk created 5 minutes ago with a 5-minute TTL is expired.
   *
   * @returns Number of chunks removed
   */
  garbageCollect(): number {
    const now = Date.now();
    let collected = 0;
    const keysToDelete: string[] = [];

    for (const [id, chunk] of this.chunkBuffer) {
      if (now - chunk.timestamp > chunk.ttl) {
        keysToDelete.push(id);
        const dataBytes =
          chunk.data instanceof ArrayBuffer
            ? chunk.data.byteLength
            : new TextEncoder().encode(chunk.data).byteLength;
        this.totalBytesBuffered -= dataBytes;
        collected++;
      }
    }

    for (const id of keysToDelete) {
      this.chunkBuffer.delete(id);
    }

    this.chunksExpired += collected;

    // Update backpressure state after collection
    this.isBackpressured = this.checkBackpressure();

    return collected;
  }

  // ============ OUTGOING QUEUE MANAGEMENT ============

  /**
   * Register a child peer for outgoing chunk delivery.
   *
   * WHY: The relay needs to know which peers to forward to. Registering
   * a child creates its outgoing queue. Unregistering removes it.
   * This is called when a child connects/disconnects in the P2P layer.
   *
   * @param peerId - The child peer's ID
   */
  registerChild(peerId: string): void {
    if (!this.outgoingQueue.has(peerId)) {
      this.outgoingQueue.set(peerId, []);
    }
  }

  /**
   * Unregister a child peer and drop its outgoing queue.
   *
   * WHY: When a child disconnects, its queued chunks are orphaned.
   * Removing the queue prevents memory leaks and ensures we don't
   * try to forward to a dead peer.
   *
   * @param peerId - The child peer's ID
   * @returns The chunks that were in the queue (for potential re-routing)
   */
  unregisterChild(peerId: string): ContentChunk[] {
    const queue = this.outgoingQueue.get(peerId) ?? [];
    this.outgoingQueue.delete(peerId);
    return queue;
  }

  /**
   * Drain the outgoing queue for a specific peer.
   *
   * WHY: The P2P layer calls this when a data channel's bufferedAmount
   * drops below threshold, meaning it's ready to send more data.
   * Draining returns all queued chunks and clears the queue.
   *
   * Chunks are returned in priority order (highest priority first)
   * so the P2P layer sends the most important content first.
   *
   * @param peerId - The child peer's ID
   * @returns Prioritized array of chunks to send
   */
  drainOutgoingQueue(peerId: string): ContentChunk[] {
    const queue = this.outgoingQueue.get(peerId);
    if (!queue || queue.length === 0) return [];

    // Sort by priority (lowest number = highest priority)
    const sorted = this.prioritizeChunks([...queue]);
    this.outgoingQueue.set(peerId, []);
    return sorted;
  }

  /**
   * Peek at the outgoing queue size for a specific peer.
   * WHY: The P2P layer needs to know if there's data waiting without
   * actually draining the queue (e.g., to check if it should
   * allocate bandwidth to this peer).
   */
  getOutgoingQueueSize(peerId: string): number {
    return this.outgoingQueue.get(peerId)?.length ?? 0;
  }

  // ============ STATISTICS ============

  /**
   * Get operational statistics for monitoring and diagnostics.
   *
   * WHY: At 10,000+ users, you can't debug problems by reading logs.
   * Stats give the UI real-time visibility into:
   * - Buffer health (is the relay keeping up?)
   * - Backpressure (is the network congested?)
   * - Delivery latency (are we within the 1-5 min budget?)
   * - Deduplication rate (are there redundant paths?)
   */
  getStats(): ContentRelayStats {
    const now = Date.now();
    let totalAge = 0;
    let chunkCount = 0;

    for (const chunk of this.chunkBuffer.values()) {
      totalAge += now - chunk.timestamp;
      chunkCount++;
    }

    const avgChunkAge = chunkCount > 0 ? totalAge / chunkCount : 0;

    // Estimate delivery latency based on the oldest chunk in the buffer
    // WHY: The oldest chunk represents the maximum latency a viewer
    // might experience. If the oldest chunk is 4 minutes old, some
    // viewer is seeing 4-minute-old content.
    let oldestAge = 0;
    for (const chunk of this.chunkBuffer.values()) {
      const age = now - chunk.timestamp;
      if (age > oldestAge) oldestAge = age;
    }

    // Count total outgoing queue depth
    let outgoingQueueDepth = 0;
    for (const queue of this.outgoingQueue.values()) {
      outgoingQueueDepth += queue.length;
    }

    return {
      bufferedChunks: this.chunkBuffer.size,
      bufferedBytes: this.totalBytesBuffered,
      maxBufferBytes: this.maxBytesBuffered,
      bufferUtilization:
        this.maxBytesBuffered > 0 ? this.totalBytesBuffered / this.maxBytesBuffered : 0,
      isBackpressured: this.isBackpressured,
      chunksSent: this.chunksSent,
      chunksReceived: this.chunksReceived,
      chunksDeduplicated: this.chunksDeduplicated,
      chunksDropped: this.chunksDropped,
      chunksExpired: this.chunksExpired,
      outgoingQueueDepth,
      avgChunkAge,
      deliveryLatency: oldestAge,
    };
  }

  // ============ LIFECYCLE ============

  /**
   * Stop the relay and release all resources.
   * WHY: When a peer leaves the room or the page closes, we must
   * clean up the GC timer and release all buffered memory.
   * Without this, the timer keeps running and memory is never reclaimed.
   */
  destroy(): void {
    if (this.gcTimer !== null) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    this.chunkBuffer.clear();
    this.outgoingQueue.clear();
    this.receivedChunkIds.clear();
    this.totalBytesBuffered = 0;
    this.sequenceCounters.clear();
  }

  // ============ PRIVATE: MEMORY MANAGEMENT ============

  /**
   * Check if the buffer is approaching its memory limit.
   *
   * WHY: Backpressure is a proactive measure. We don't wait until
   * the buffer is 100% full to start dropping — by then it's too late
   * and critical chunks might get rejected. The 85% threshold gives
   * us a 15MB safety margin (at 100MB max) to keep accepting audio
   * and slides while dropping video deltas.
   */
  private checkBackpressure(): boolean {
    return (
      this.maxBytesBuffered > 0 &&
      this.totalBytesBuffered / this.maxBytesBuffered >= CHUNK_CONFIG.BACKPRESSURE_THRESHOLD
    );
  }

  /**
   * Ensure there's enough buffer space for incoming data.
   *
   * WHY: This is called BEFORE accepting a chunk. If the buffer is
   * full, we try to make room by evicting old/low-priority chunks.
   * If eviction can't free enough space (e.g., buffer is full of
   * recent high-priority chunks), we reject the new chunk.
   *
   * @param bytesNeeded - Bytes required for the incoming chunk
   * @returns Whether space is available (or was made available)
   */
  private ensureBufferSpace(bytesNeeded: number): boolean {
    // If there's already enough space, no action needed
    if (this.totalBytesBuffered + bytesNeeded <= this.maxBytesBuffered) {
      return true;
    }

    // Try to evict enough chunks to make room
    const bytesToFree = this.totalBytesBuffered + bytesNeeded - this.maxBytesBuffered;
    const freedBytes = this.evictOldestChunks(bytesToFree);

    return this.totalBytesBuffered + bytesNeeded <= this.maxBytesBuffered;
  }

  /**
   * Evict the oldest chunks from the buffer to free memory.
   *
   * EVICTION POLICY (in order):
   * 1. Expired chunks (past TTL) — free dead weight first
   * 2. Lowest-priority chunks (video-delta, then annotation/chat) —
   *    sacrifice quality before sacrificing essential content
   * 3. Oldest chunks within the same priority level — FIFO within priority
   *
   * WHY this order: Expired chunks are useless and should go first.
   * Then we sacrifice video quality (delta frames) because audio and
   * slides carry the actual webinar content. Within the same priority,
   * older chunks are less valuable because they're further from
   * real-time playback.
   *
   * @param bytesNeeded - Minimum bytes to free
   * @returns Number of bytes actually freed
   */
  private evictOldestChunks(bytesNeeded: number): number {
    let bytesFreed = 0;

    // Phase 1: Remove expired chunks first (cheapest eviction)
    const now = Date.now();
    const expiredIds: string[] = [];
    for (const [id, chunk] of this.chunkBuffer) {
      if (now - chunk.timestamp > chunk.ttl) {
        expiredIds.push(id);
        const dataBytes =
          chunk.data instanceof ArrayBuffer
            ? chunk.data.byteLength
            : new TextEncoder().encode(chunk.data).byteLength;
        bytesFreed += dataBytes;
      }
    }
    for (const id of expiredIds) {
      this.chunkBuffer.delete(id);
    }
    this.chunksExpired += expiredIds.length;

    if (bytesFreed >= bytesNeeded) {
      this.totalBytesBuffered -= bytesFreed;
      return bytesFreed;
    }

    // Phase 2: Evict by priority level (lowest priority = highest number = evict first)
    // Process from priority 4 (best-effort) down to priority 1 (high)
    // WHY we skip priority 0: Audio (priority 0) is NEVER evicted.
    // A webinar without audio is broken — we'd rather drop video entirely.
    for (let priority = 4; priority >= 1; priority--) {
      if (bytesFreed >= bytesNeeded) break;

      // Find chunks at this priority level, sorted oldest first
      const candidates: Array<{ id: string; timestamp: number; bytes: number }> = [];
      for (const [id, chunk] of this.chunkBuffer) {
        if (chunk.priority === priority) {
          const dataBytes =
            chunk.data instanceof ArrayBuffer
              ? chunk.data.byteLength
              : new TextEncoder().encode(chunk.data).byteLength;
          candidates.push({ id, timestamp: chunk.timestamp, bytes: dataBytes });
        }
      }

      // Sort oldest first — FIFO within priority level
      candidates.sort((a, b) => a.timestamp - b.timestamp);

      for (const candidate of candidates) {
        if (bytesFreed >= bytesNeeded) break;
        this.chunkBuffer.delete(candidate.id);
        bytesFreed += candidate.bytes;
        this.chunksExpired++;
      }
    }

    this.totalBytesBuffered -= bytesFreed;
    return bytesFreed;
  }

  // ============ PRIVATE: PRIORITY ORDERING ============

  /**
   * Sort chunks by priority (highest priority = lowest number = first).
   *
   * WHY: When the outgoing queue is drained or when we need to decide
   * which chunks to drop, priority ordering ensures audio always
   * goes first, followed by slides, then video keyframes, then deltas.
   *
   * Within the same priority level, we sort by timestamp (oldest first)
   * to maintain temporal ordering — you can't play chunk #5 before #3.
   */
  private prioritizeChunks(chunks: ContentChunk[]): ContentChunk[] {
    return chunks.sort((a, b) => {
      // Primary sort: priority (lower number = higher priority)
      if (a.priority !== b.priority) return a.priority - b.priority;
      // Secondary sort: timestamp (older = higher delivery priority)
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      // Tertiary sort: sequence (stable ordering within same ms)
      return a.sequence - b.sequence;
    });
  }

  /**
   * Find the index of the lowest-priority chunk in a queue.
   * Used for priority-based eviction from outgoing queues.
   *
   * WHY: When a high-priority chunk needs to enter a full queue,
   * we find and evict the lowest-priority chunk. This ensures
   * audio can always displace video-delta from the queue.
   *
   * @returns Index of the lowest-priority chunk, or -1 if queue is empty
   */
  private findLowestPriorityIndex(queue: ContentChunk[]): number {
    if (queue.length === 0) return -1;

    let lowestIdx = 0;
    let lowestPriority = queue[0].priority;

    for (let i = 1; i < queue.length; i++) {
      if (queue[i].priority > lowestPriority) {
        lowestPriority = queue[i].priority;
        lowestIdx = i;
      }
    }

    return lowestIdx;
  }

  // ============ SIMULATION / TESTING ============

  /**
   * Generate a stream of fake chunks for testing and demo purposes.
   *
   * WHY: Testing the relay with real WebRTC connections is expensive
   * and slow. This method generates realistic-looking chunks that
   * exercise all code paths: different priorities, binary and string
   * data, varying sizes, proper sequencing.
   *
   * Usage:
   * ```typescript
   * const relay = new ContentChunkRelay('test-host', 'room-1');
   * const simulate = relay.simulateChunkStream({
   *   durationMs: 60000,  // 1 minute of content
   *   includeVideo: true,
   *   includeAudio: true,
   *   includeSlides: true,
   * });
   * for (const chunk of simulate) {
   *   relay.receiveChunk(chunk);
   * }
   * console.log(relay.getStats());
   * ```
   *
   * @param options - Simulation parameters
   * @returns Generator that yields ContentChunks
   */
  *simulateChunkStream(options?: {
    durationMs?: number;
    includeVideo?: boolean;
    includeAudio?: boolean;
    includeSlides?: boolean;
    includeChat?: boolean;
    includeAnnotations?: boolean;
    roomId?: string;
    sourcePeerId?: string;
  }): Generator<ContentChunk> {
    const durationMs = options?.durationMs ?? 60000; // Default 1 minute
    const includeVideo = options?.includeVideo ?? true;
    const includeAudio = options?.includeAudio ?? true;
    const includeSlides = options?.includeSlides ?? true;
    const includeChat = options?.includeChat ?? true;
    const includeAnnotations = options?.includeAnnotations ?? false;
    const simRoomId = options?.roomId ?? this.roomId;
    const simSourcePeerId = options?.sourcePeerId ?? 'sim-host';

    const startTime = Date.now();
    let videoKeyframeSeq = 0;
    let videoDeltaSeq = 0;
    let audioSeq = 0;
    let slideSeq = 0;
    let chatSeq = 0;
    let annotationSeq = 0;

    let elapsed = 0;
    while (elapsed < durationMs) {
      const now = Date.now();
      elapsed = now - startTime;

      // === Audio: every 1s ===
      if (includeAudio && elapsed > 0 && elapsed % CHUNK_CONFIG.AUDIO_SEGMENT_DURATION < 50) {
        // Simulated Opus audio: ~8KB per second at 64kbps
        const fakeAudio = new ArrayBuffer(8 * 1024);
        yield {
          id: `audio-${now}-${audioSeq}`,
          chunkType: 'audio',
          timestamp: now,
          sequence: audioSeq++,
          roomId: simRoomId,
          data: fakeAudio,
          priority: 0,
          ttl: CHUNK_CONFIG.DEFAULT_TTL,
          sourcePeerId: simSourcePeerId,
          hops: 0,
          maxHops: CHUNK_CONFIG.MAX_HOPS,
        };
      }

      // === Video keyframe: every 5s ===
      if (
        includeVideo &&
        elapsed > 0 &&
        elapsed % CHUNK_CONFIG.VIDEO_KEYFRAME_INTERVAL < 50
      ) {
        // Simulated H.264 keyframe: ~50KB at 360p
        const fakeKeyframe = new ArrayBuffer(50 * 1024);
        yield {
          id: `video-keyframe-${now}-${videoKeyframeSeq}`,
          chunkType: 'video-keyframe',
          timestamp: now,
          sequence: videoKeyframeSeq++,
          roomId: simRoomId,
          data: fakeKeyframe,
          priority: 2,
          ttl: CHUNK_CONFIG.DEFAULT_TTL,
          sourcePeerId: simSourcePeerId,
          hops: 0,
          maxHops: CHUNK_CONFIG.MAX_HOPS,
        };
        // Reset delta counter after keyframe
        videoDeltaSeq = 0;
      }

      // === Video delta: every 2s ===
      if (includeVideo && elapsed > 0 && elapsed % CHUNK_CONFIG.VIDEO_SEGMENT_DURATION < 50) {
        // Skip if we just sent a keyframe (same time slot)
        if (elapsed % CHUNK_CONFIG.VIDEO_KEYFRAME_INTERVAL >= 50) {
          // Simulated H.264 delta: ~10KB
          const fakeDelta = new ArrayBuffer(10 * 1024);
          yield {
            id: `video-delta-${now}-${videoDeltaSeq}`,
            chunkType: 'video-delta',
            timestamp: now,
            sequence: videoDeltaSeq++,
            roomId: simRoomId,
            data: fakeDelta,
            priority: 3,
            ttl: CHUNK_CONFIG.DEFAULT_TTL,
            sourcePeerId: simSourcePeerId,
            hops: 0,
            maxHops: CHUNK_CONFIG.MAX_HOPS,
          };
        }
      }

      // === Slide: every 10s ===
      if (includeSlides && elapsed > 0 && elapsed % 10000 < 50) {
        // Simulated slide as base64-ish string: ~20KB
        const fakeSlide = 'data:image/png;base64,' + 'A'.repeat(20 * 1024);
        yield {
          id: `slide-${now}-${slideSeq}`,
          chunkType: 'slide',
          timestamp: now,
          sequence: slideSeq++,
          roomId: simRoomId,
          data: fakeSlide,
          priority: 1,
          ttl: CHUNK_CONFIG.DEFAULT_TTL,
          sourcePeerId: simSourcePeerId,
          hops: 0,
          maxHops: CHUNK_CONFIG.MAX_HOPS,
        };
      }

      // === Annotation: every 3s ===
      if (includeAnnotations && elapsed > 0 && elapsed % 3000 < 50) {
        const fakeAnnotation = JSON.stringify({
          type: 'draw',
          points: [
            { x: 100, y: 200 },
            { x: 150, y: 250 },
          ],
          color: '#ff0000',
          strokeWidth: 2,
        });
        yield {
          id: `annotation-${now}-${annotationSeq}`,
          chunkType: 'annotation',
          timestamp: now,
          sequence: annotationSeq++,
          roomId: simRoomId,
          data: fakeAnnotation,
          priority: 4,
          ttl: CHUNK_CONFIG.DEFAULT_TTL,
          sourcePeerId: simSourcePeerId,
          hops: 0,
          maxHops: CHUNK_CONFIG.MAX_HOPS,
        };
      }

      // === Chat: every 5s ===
      if (includeChat && elapsed > 0 && elapsed % 5000 < 50) {
        const fakeChat = JSON.stringify({
          sender: 'viewer-123',
          message: 'Great presentation!',
          timestamp: now,
        });
        yield {
          id: `chat-${now}-${chatSeq}`,
          chunkType: 'chat',
          timestamp: now,
          sequence: chatSeq++,
          roomId: simRoomId,
          data: fakeChat,
          priority: 4,
          ttl: CHUNK_CONFIG.DEFAULT_TTL,
          sourcePeerId: simSourcePeerId,
          hops: 0,
          maxHops: CHUNK_CONFIG.MAX_HOPS,
        };
      }

      // Yield to the event loop — in a real scenario, chunks arrive asynchronously
      // In testing, callers can just iterate the generator
    }
  }
}
