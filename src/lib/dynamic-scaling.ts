// Focus Meet — Dynamic Scaling Engine
// Every parameter change happens FOR A REASON.
// The tree auto-expands as users grow: roots, sub-roots, branches, and leaves
// all increase proportionally. The host's load stays FLAT.

// ============ SCALING TIERS ============
// Each tier is triggered by viewer count crossing a threshold.
// WHY these tiers exist:
// - Tier 1 (0-50): No infrastructure needed. Host serves directly.
//   REASON: Below 50 users, adding roots would WASTE bandwidth on signaling overhead.
// - Tier 2 (50-200): First roots appear. Host offloads to 3-5 roots.
//   REASON: At 50+ users, host's single connection per viewer becomes a bottleneck.
//   3 roots × ~17 viewers each = manageable.
// - Tier 3 (200-1000): Full root + branch tree. 5-15 roots, 2-level relay.
//   REASON: At 200+ users, roots alone can't handle all viewers — they need branches.
//   Each root serves branches, branches serve viewers. 10 roots × 8 branches × ~3 viewers.
// - Tier 4 (1000-5000): Sub-roots + deep branches. 15-40 roots, 3-level relay.
//   REASON: At 1000+ users, even branches get overloaded. Sub-roots add a backup layer
//   and branches themselves need sub-branches. 30 roots × 8 branches × 8 sub-branches × ~2 viewers.
// - Tier 5 (5000-10000+): Super-roots. 40-80 roots, 4-5 level relay.
//   REASON: At 5000+ users, we need the deepest tree. Super-roots are roots that
//   manage other roots (meta-roots). This is like CDN edge nodes.
//   60 roots × 10 branches × 8 sub-branches × ~3 leaves = 14,400 capacity.

export type ScalingTier = 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5';

/**
 * Content delivery mode for a tier.
 * - 'realtime': Direct WebRTC streaming, no buffering. Used for small audiences where latency must be minimal.
 * - 'buffered': Small buffer on relay nodes for stability. Used for medium audiences where a few seconds of delay
 *   is acceptable in exchange for smoother playback and fewer reconnects.
 * - 'chunked': Store-and-forward delivery using segmented media chunks. Used for large audiences where
 *   1-5 minute latency is acceptable in exchange for reaching 10,000+ users reliably.
 */
export type ContentDeliveryMode = 'realtime' | 'buffered' | 'chunked';

/**
 * Configuration for chunk-based store-and-forward relay.
 * Only applies to tiers using 'chunked' or 'buffered' content delivery modes.
 *
 * WHY chunking exists:
 * At 1000+ viewers, WebRTC's per-connection overhead becomes unsustainable. Instead of trying
 * to maintain thousands of real-time connections, we break the media stream into discrete segments
 * (chunks) that relay nodes can buffer and forward in batches. This trades latency for reliability.
 *
 * The keyframe interval determines how often a full video frame is sent (vs. delta frames),
 * which affects both bandwidth and error recovery. Segment duration controls the granularity
 * of the chunk pipeline. Buffer size limits memory usage per node. Forward batch size controls
 * how many chunks are sent per relay transmission (batching amortizes connection overhead).
 */
export interface ChunkConfig {
  /** How often to send video keyframes (in ms). More frequent keyframes = faster error recovery but higher bandwidth. */
  keyframeIntervalMs: number;
  /** Duration of each video/audio segment (in ms). Shorter segments = lower latency but more overhead. */
  segmentDurationMs: number;
  /** Memory limit per node for chunk buffering (in MB). Prevents relay nodes from being overwhelmed. */
  maxBufferSizeMB: number;
  /** How many chunks to batch-forward at once. Batching amortizes connection setup overhead across multiple chunks. */
  forwardBatchSize: number;
  /** How often to garbage-collect old chunks that have already been forwarded (in ms). */
  garbageCollectIntervalMs: number;
}

export interface TierConfig {
  tier: ScalingTier;
  name: string;
  minViewers: number;
  maxViewers: number;
  
  // Root architecture
  targetRoots: number;        // HOW MANY roots to aim for
  maxRoots: number;           // Upper limit for roots
  minRoots: number;           // Minimum before system is "unstable"
  
  // Sub-root architecture
  targetSubRoots: number;     // Backup roots for failover
  maxSubRoots: number;
  
  // Branch architecture
  branchesPerRoot: number;    // How many branches each root serves
  subBranchesPerBranch: number; // How many sub-branches each branch serves (0 = no sub-branches)
  
  // Leaf/viewer architecture
  viewersPerBranch: number;   // Direct viewers per branch
  viewersPerSubBranch: number; // Viewers per sub-branch (0 = no sub-branches)
  
  // Tree depth
  maxTreeDepth: number;       // Maximum allowed depth in the tree
  
  // Relay capacity per node type
  rootRelayCapacity: number;  // How many children a root can have
  branchRelayCapacity: number;
  subBranchRelayCapacity: number;
  
  // Quality settings
  hostQuality: '720p' | '480p' | '360p';  // What quality the host streams
  adaptiveDeliveryEnabled: boolean;  // Should we downgrade low-bandwidth viewers?
  
  // Timing
  rootSelectionIntervalMs: number;  // How often to re-evaluate roots
  rebalanceIntervalMs: number;      // How often to rebalance the tree
  
  // Reason for this tier's existence
  reason: string;

  // ---- Latency-Aware Content Delivery (added for chunk-based store-and-forward) ----

  /**
   * Content delivery mode for this tier.
   * - 'realtime': Tier 1-2 — Under 200 users, WebRTC direct streaming works fine.
   *   No chunking or buffering needed; connections are few enough to sustain real-time delivery.
   * - 'buffered': Tier 3 — 200-1000 users, 2-5 second buffer on relay nodes for stability.
   *   Relays buffer a few seconds to absorb jitter and prevent cascading reconnects.
   * - 'chunked': Tier 4-5 — 1000+ users, store-and-forward chunks with 1-5 min latency acceptance.
   *   Content is segmented and relayed in batches; viewers accept latency in exchange for reliability.
   */
  contentDeliveryMode: ContentDeliveryMode;

  /**
   * Maximum acceptable end-to-end latency for this tier (in ms).
   * This is the SLA boundary — if estimated latency exceeds this, the system should
   * either restructure the tree or alert the host that viewers may experience delay.
   *
   * - tier1: 500ms (near-realtime — host serves directly, minimal hops)
   * - tier2: 2000ms (2 second max — one relay hop through roots)
   * - tier3: 10000ms (10 second max — small buffer for stability, 2-level relay)
   * - tier4: 120000ms (2 min — chunked delivery, content propagates through deep tree)
   * - tier5: 300000ms (5 min — deep tree with many relay hops, but content arrives reliably)
   */
  maxAcceptableLatencyMs: number;

  /**
   * Configuration for chunk-based store-and-forward relay.
   * Only defined for tiers using 'buffered' or 'chunked' delivery modes.
   * Undefined for 'realtime' tiers (tier1-2) where no chunking is needed.
   *
   * - tier1-2: No chunkConfig (realtime, no chunking needed)
   * - tier3: Small buffer (2MB), short segments (1s video, 500ms audio equivalent)
   * - tier4: Medium buffer (50MB), medium segments (2s video, 1s audio equivalent)
   * - tier5: Large buffer (100MB), longer segments (5s video, 1s audio equivalent) for efficiency
   */
  chunkConfig?: ChunkConfig;
}

export const TIER_CONFIGS: Record<ScalingTier, TierConfig> = {
  tier1: {
    tier: 'tier1',
    name: 'Direct',
    minViewers: 0,
    maxViewers: 50,
    targetRoots: 0,
    maxRoots: 3,
    minRoots: 0,
    targetSubRoots: 0,
    maxSubRoots: 0,
    branchesPerRoot: 0,
    subBranchesPerBranch: 0,
    viewersPerBranch: 0,
    viewersPerSubBranch: 0,
    maxTreeDepth: 3,
    rootRelayCapacity: 6,
    branchRelayCapacity: 4,
    subBranchRelayCapacity: 0,
    hostQuality: '720p',
    adaptiveDeliveryEnabled: false,
    rootSelectionIntervalMs: 60000,
    rebalanceIntervalMs: 60000,
    reason: 'Below 50 users, host can serve everyone directly. Adding roots wastes bandwidth on signaling overhead.',
    // Content delivery: Realtime — host connects to each viewer directly via WebRTC.
    // WHY: Under 50 users, there's no need for buffering or chunking. Direct P2P streaming
    // keeps latency near zero and avoids the complexity of relay infrastructure.
    contentDeliveryMode: 'realtime',
    // Max latency: 500ms — only host-to-viewer network round-trip, no relay hops.
    maxAcceptableLatencyMs: 500,
    // No chunkConfig — realtime mode doesn't use chunking.
  },
  tier2: {
    tier: 'tier2',
    name: 'Roots',
    minViewers: 50,
    maxViewers: 200,
    targetRoots: 5,
    maxRoots: 8,
    minRoots: 3,
    targetSubRoots: 2,
    maxSubRoots: 4,
    branchesPerRoot: 0,       // Roots serve viewers directly
    subBranchesPerBranch: 0,
    viewersPerBranch: 0,
    viewersPerSubBranch: 0,
    maxTreeDepth: 3,
    rootRelayCapacity: 10,
    branchRelayCapacity: 6,
    subBranchRelayCapacity: 0,
    hostQuality: '720p',
    adaptiveDeliveryEnabled: true,
    rootSelectionIntervalMs: 30000,
    rebalanceIntervalMs: 45000,
    reason: 'At 50+ users, host cannot serve everyone directly. 5 roots × ~10 viewers = 50 offloaded. Host only serves 5 streams.',
    // Content delivery: Realtime — roots relay host stream directly to viewers via WebRTC.
    // WHY: At 50-200 users, each root only serves ~10 viewers. WebRTC can handle this
    // without buffering. The relay hop adds ~700ms but stays well within acceptable range.
    contentDeliveryMode: 'realtime',
    // Max latency: 2000ms — one relay hop through a root adds processing + network time.
    maxAcceptableLatencyMs: 2000,
    // No chunkConfig — realtime mode doesn't use chunking.
  },
  tier3: {
    tier: 'tier3',
    name: 'Roots+Branches',
    minViewers: 200,
    maxViewers: 1000,
    targetRoots: 12,
    maxRoots: 20,
    minRoots: 5,
    targetSubRoots: 8,
    maxSubRoots: 12,
    branchesPerRoot: 8,
    subBranchesPerBranch: 0,
    viewersPerBranch: 10,
    viewersPerSubBranch: 0,
    maxTreeDepth: 4,
    rootRelayCapacity: 12,
    branchRelayCapacity: 10,
    subBranchRelayCapacity: 0,
    hostQuality: '720p',
    adaptiveDeliveryEnabled: true,
    rootSelectionIntervalMs: 20000,
    rebalanceIntervalMs: 30000,
    reason: 'At 200+ users, roots alone cannot handle all viewers. Each root gets 8 branches, each branch serves 10 viewers. 12 roots × 8 branches × 10 = 960 capacity.',
    // Content delivery: Buffered — relay nodes hold a 2-5 second buffer for stability.
    // WHY: At 200-1000 users, branches serve 10 viewers each. If a branch has network
    // jitter, all 10 viewers see artifacts. A small buffer absorbs jitter and prevents
    // cascading reconnects that would destabilize the tree.
    contentDeliveryMode: 'buffered',
    // Max latency: 10000ms (10 seconds) — 2-level relay + small buffer per relay level.
    // Each relay level adds ~700ms (processing + network) + ~2s buffer = ~2.7s per hop.
    // With 2 relay hops (root → branch → viewer), that's ~5.4s, well within 10s.
    maxAcceptableLatencyMs: 10000,
    // Chunk config: Small buffer, short segments. Just enough to smooth jitter.
    // WHY: We only need a tiny buffer to absorb jitter — not full chunked delivery.
    // Short segments (1s) keep latency low while still providing stability.
    chunkConfig: {
      keyframeIntervalMs: 2000,     // Keyframe every 2s — fast error recovery for buffered relay
      segmentDurationMs: 1000,      // 1s segments — short for low latency
      maxBufferSizeMB: 2,           // 2MB buffer — small, just enough for jitter absorption
      forwardBatchSize: 1,          // Forward each segment immediately — don't batch for low latency
      garbageCollectIntervalMs: 5000, // Clean up old segments every 5s
    },
  },
  tier4: {
    tier: 'tier4',
    name: 'Deep Tree',
    minViewers: 1000,
    maxViewers: 5000,
    targetRoots: 30,
    maxRoots: 50,
    minRoots: 12,
    targetSubRoots: 15,
    maxSubRoots: 25,
    branchesPerRoot: 8,
    subBranchesPerBranch: 5,
    viewersPerBranch: 0,
    viewersPerSubBranch: 6,
    maxTreeDepth: 5,
    rootRelayCapacity: 15,
    branchRelayCapacity: 8,
    subBranchRelayCapacity: 6,
    hostQuality: '480p',     // Host drops to 480p to serve more roots
    adaptiveDeliveryEnabled: true,
    rootSelectionIntervalMs: 15000,
    rebalanceIntervalMs: 20000,
    reason: 'At 1000+ users, branches need sub-branches. Each root → 8 branches → 5 sub-branches → 6 viewers. 30 × 8 × 5 × 6 = 7,200 capacity. Host streams at 480p to serve 30 roots.',
    // Content delivery: Chunked — store-and-forward with segmented media.
    // WHY: At 1000-5000 users, the tree has 3 levels of relay. Each relay hop adds
    // processing delay. Instead of trying to maintain real-time delivery across 3 hops,
    // we segment the stream into chunks that relay nodes can buffer and forward in batches.
    // This trades latency (2 min acceptable) for reliability (10K+ users reached).
    contentDeliveryMode: 'chunked',
    // Max latency: 120000ms (2 minutes) — chunked delivery through 3-level relay.
    // Each hop processes a chunk before forwarding: ~200ms processing + ~500ms network
    // + segment duration. With 3 hops and 2s segments, propagation takes time but
    // content arrives reliably for thousands of viewers.
    maxAcceptableLatencyMs: 120000,
    // Chunk config: Medium buffer, medium segments. Balanced for 1K-5K viewers.
    // WHY: 2s segments are a good tradeoff — short enough for reasonable latency,
    // long enough for efficient batch forwarding. 50MB buffer holds ~25s of video at
    // 480p/1.5Mbps, enough to handle brief network disruptions without dropping viewers.
    chunkConfig: {
      keyframeIntervalMs: 4000,     // Keyframe every 4s — fewer keyframes save bandwidth at 480p
      segmentDurationMs: 2000,      // 2s segments — medium length for balanced latency/efficiency
      maxBufferSizeMB: 50,          // 50MB buffer — holds ~25s of 480p video for resilience
      forwardBatchSize: 3,          // Batch 3 segments per forward — amortizes connection overhead
      garbageCollectIntervalMs: 10000, // Clean up old segments every 10s
    },
  },
  tier5: {
    tier: 'tier5',
    name: 'Super-Tree',
    minViewers: 5000,
    maxViewers: 10000,
    targetRoots: 60,
    maxRoots: 80,
    minRoots: 20,
    targetSubRoots: 25,
    maxSubRoots: 40,
    branchesPerRoot: 10,
    subBranchesPerBranch: 8,
    viewersPerBranch: 0,
    viewersPerSubBranch: 4,
    maxTreeDepth: 6,
    rootRelayCapacity: 20,
    branchRelayCapacity: 10,
    subBranchRelayCapacity: 6,
    hostQuality: '360p',     // Host at 360p — quality comes from slides, not video
    adaptiveDeliveryEnabled: true,
    rootSelectionIntervalMs: 10000,
    rebalanceIntervalMs: 15000,
    reason: 'At 5000+ users, maximum tree depth needed. 60 roots × 10 branches × 8 sub-branches × 4 viewers = 19,200 capacity. Host at 360p to minimize upload. Slides+audio are primary content.',
    // Content delivery: Chunked — deep store-and-forward with larger segments for efficiency.
    // WHY: At 5000-10000+ users, the tree has 4-5 levels of relay. Real-time delivery is
    // impossible across that many hops. We accept 1-5 minute latency and optimize for
    // reliability and efficiency instead. Longer segments reduce per-segment overhead,
    // larger batches amortize connection setup across more data.
    contentDeliveryMode: 'chunked',
    // Max latency: 300000ms (5 minutes) — deepest tree with many relay hops.
    // With 4-5 relay levels, each adding processing + network + segment duration delay,
    // content takes minutes to reach leaf viewers. But it arrives reliably for 10K+ users.
    // This is acceptable for webinars where slides+audio are primary content.
    maxAcceptableLatencyMs: 300000,
    // Chunk config: Large buffer, longer segments. Optimized for maximum throughput and reliability.
    // WHY: 5s segments minimize overhead at scale — fewer segments means less per-segment
    // processing and header overhead. 100MB buffer holds ~100s of 360p/800kbps video,
    // providing strong resilience against network disruptions. Batch of 5 chunks
    // amortizes connection setup across more data for efficiency.
    chunkConfig: {
      keyframeIntervalMs: 8000,     // Keyframe every 8s — fewer keyframes save bandwidth at 360p
      segmentDurationMs: 5000,      // 5s segments — longer for efficiency at scale
      maxBufferSizeMB: 100,         // 100MB buffer — holds ~100s of 360p video for deep tree resilience
      forwardBatchSize: 5,          // Batch 5 segments per forward — maximum amortization of overhead
      garbageCollectIntervalMs: 15000, // Clean up old segments every 15s
    },
  },
};

export class DynamicScalingEngine {
  private currentTier: ScalingTier = 'tier1';
  private previousTier: ScalingTier | null = null;
  private lastTierChangeTime: number = 0;
  private tierChangeHistory: Array<{ from: ScalingTier; to: ScalingTier; viewerCount: number; timestamp: number; reason: string }> = [];
  
  /**
   * Get the current tier based on viewer count.
   * WHY: Each tier represents a fundamental shift in architecture.
   * Moving up a tier means adding a new layer to the tree.
   * Moving down means removing a layer (consolidation).
   */
  getTierForViewers(viewerCount: number): ScalingTier {
    if (viewerCount < 50) return 'tier1';
    if (viewerCount < 200) return 'tier2';
    if (viewerCount < 1000) return 'tier3';
    if (viewerCount < 5000) return 'tier4';
    return 'tier5';
  }
  
  /**
   * Update the current tier based on viewer count.
   * Returns true if the tier changed.
   * WHY: Tier changes trigger architectural reorganization.
   */
  updateTier(viewerCount: number): { tierChanged: boolean; newTier: ScalingTier; config: TierConfig; reason: string } {
    const newTier = this.getTierForViewers(viewerCount);
    const tierChanged = newTier !== this.currentTier;
    
    if (tierChanged) {
      // Log the change with reason
      const oldConfig = TIER_CONFIGS[this.currentTier];
      const newConfig = TIER_CONFIGS[newTier];
      
      this.tierChangeHistory.push({
        from: this.currentTier,
        to: newTier,
        viewerCount,
        timestamp: Date.now(),
        reason: newConfig.reason,
      });
      
      // Keep only last 10 tier changes
      if (this.tierChangeHistory.length > 10) this.tierChangeHistory.shift();
      
      this.previousTier = this.currentTier;
      this.currentTier = newTier;
      this.lastTierChangeTime = Date.now();
      
      return {
        tierChanged: true,
        newTier,
        config: newConfig,
        reason: `Tier changed from ${oldConfig.name} to ${newConfig.name}: ${newConfig.reason}`,
      };
    }
    
    return {
      tierChanged: false,
      newTier: this.currentTier,
      config: TIER_CONFIGS[this.currentTier],
      reason: 'No tier change needed.',
    };
  }
  
  /**
   * Calculate the exact number of roots needed for current viewer count.
   * WHY: Too few roots = host overloaded. Too many = wasted signaling.
   */
  calculateNeededRoots(viewerCount: number): number {
    const config = TIER_CONFIGS[this.getTierForViewers(viewerCount)];
    
    if (config.tier === 'tier1') {
      // Tier 1: No roots needed
      return 0;
    }
    
    if (config.tier === 'tier2') {
      // Tier 2: Roots serve viewers directly
      // Each root handles ~10 viewers
      return Math.min(config.maxRoots, Math.max(config.minRoots, Math.ceil(viewerCount / 10)));
    }
    
    // Tier 3+: Roots serve branches, branches serve viewers
    // Capacity per root = branchesPerRoot × (subBranchesPerBranch × viewersPerSubBranch + viewersPerBranch)
    let capacityPerRoot: number;
    if (config.subBranchesPerBranch > 0) {
      capacityPerRoot = config.branchesPerRoot * config.subBranchesPerBranch * config.viewersPerSubBranch;
    } else {
      capacityPerRoot = config.branchesPerRoot * config.viewersPerBranch;
    }
    
    const needed = Math.ceil(viewerCount / capacityPerRoot);
    return Math.min(config.maxRoots, Math.max(config.minRoots, needed));
  }
  
  /**
   * Calculate the maximum capacity for a given number of roots.
   * WHY: This tells us when we're approaching the limit and need more roots.
   */
  calculateCapacity(rootCount: number, tier: ScalingTier): number {
    const config = TIER_CONFIGS[tier];
    
    if (config.subBranchesPerBranch > 0) {
      return rootCount * config.branchesPerRoot * config.subBranchesPerBranch * config.viewersPerSubBranch;
    } else if (config.branchesPerRoot > 0) {
      return rootCount * config.branchesPerRoot * config.viewersPerBranch;
    } else {
      // Roots serve viewers directly
      return rootCount * config.rootRelayCapacity;
    }
  }
  
  /**
   * Get the relay capacity for a specific node based on its role and current tier.
   * WHY: Different tiers need different capacities. A root in tier5 needs more capacity
   * than a root in tier2 because it manages more infrastructure.
   */
  getRelayCapacity(role: 'root' | 'sub-root' | 'branch' | 'sub-branch' | 'leaf'): number {
    const config = TIER_CONFIGS[this.currentTier];
    
    switch (role) {
      case 'root': return config.rootRelayCapacity;
      case 'sub-root': return Math.ceil(config.rootRelayCapacity * 0.8); // Sub-roots slightly less
      case 'branch': return config.branchRelayCapacity;
      case 'sub-branch': return config.subBranchRelayCapacity;
      case 'leaf': return 0;
    }
  }
  
  /**
   * Should a viewer be promoted to a specific role?
   * WHY: Promotions happen for a reason — the system needs more infrastructure.
   */
  shouldPromote(currentViewerCount: number, role: 'root' | 'sub-root' | 'branch'): { shouldPromote: boolean; reason: string } {
    const config = TIER_CONFIGS[this.currentTier];
    const neededRoots = this.calculateNeededRoots(currentViewerCount);
    const currentCapacity = this.calculateCapacity(neededRoots, this.currentTier);
    
    switch (role) {
      case 'root': {
        // REASON: We need more roots when current capacity < viewer count + safety margin
        const safetyMargin = Math.max(50, currentViewerCount * 0.2);
        const needsMoreRoots = currentViewerCount + safetyMargin > currentCapacity;
        return {
          shouldPromote: needsMoreRoots,
          reason: needsMoreRoots
            ? `Capacity (${currentCapacity}) cannot handle ${currentViewerCount}+ viewers with safety margin. More roots needed.`
            : `Current capacity (${currentCapacity}) sufficient for ${currentViewerCount} viewers.`,
        };
      }
      case 'sub-root': {
        // REASON: Sub-roots are needed for failover. 1 sub-root per 2-3 roots.
        const targetSubRoots = Math.ceil(neededRoots / 2.5);
        return {
          shouldPromote: true, // Always promote sub-roots up to target
          reason: `Sub-roots ensure failover. Target: ${targetSubRoots} for ${neededRoots} roots.`,
        };
      }
      case 'branch': {
        // REASON: Branches are needed when roots are near capacity
        return {
          shouldPromote: currentViewerCount > config.minViewers,
          reason: `Branches distribute load from roots. Needed at ${config.minViewers}+ viewers.`,
        };
      }
    }
  }
  
  /**
   * Get recommended quality for host based on tier.
   * WHY: Higher tiers need more roots, which means more outbound streams from host.
   * Lower quality = less bandwidth per stream = more roots can be served.
   */
  getHostQuality(): { width: number; height: number; fps: number; bitrateKbps: number; reason: string } {
    const config = TIER_CONFIGS[this.currentTier];
    
    switch (config.hostQuality) {
      case '720p':
        return { width: 1280, height: 720, fps: 30, bitrateKbps: 2500, reason: 'Tier 1-3: Under 1000 viewers. 720p is fine — host serves few enough roots.' };
      case '480p':
        return { width: 854, height: 480, fps: 24, bitrateKbps: 1500, reason: 'Tier 4: 1000-5000 viewers. 480p reduces bandwidth per root so host can serve 30+ roots.' };
      case '360p':
        return { width: 640, height: 360, fps: 20, bitrateKbps: 800, reason: 'Tier 5: 5000+ viewers. 360p is necessary — host must serve 60+ roots. Slides are primary content.' };
    }
  }
  
  /**
   * Get scaling recommendations for the UI.
   */
  getRecommendations(currentRoots: number, currentViewers: number): Array<{ action: string; reason: string; priority: 'critical' | 'high' | 'normal' | 'low' }> {
    const config = TIER_CONFIGS[this.currentTier];
    const neededRoots = this.calculateNeededRoots(currentViewers);
    const capacity = this.calculateCapacity(currentRoots, this.currentTier);
    const recommendations: Array<{ action: string; reason: string; priority: 'critical' | 'high' | 'normal' | 'low' }> = [];
    
    // Critical: Not enough roots
    if (currentRoots < config.minRoots && currentViewers > config.minViewers) {
      recommendations.push({
        action: `Need ${config.minRoots - currentRoots} more root nodes urgently`,
        reason: `Below minimum roots (${currentRoots}/${config.minRoots}). System unstable at ${currentViewers} viewers.`,
        priority: 'critical',
      });
    }
    
    // High: Approaching capacity
    if (currentViewers > capacity * 0.8) {
      recommendations.push({
        action: `Promote ${neededRoots - currentRoots} more roots`,
        reason: `At ${Math.round(currentViewers / capacity * 100)}% capacity. Need more roots before hitting limit.`,
        priority: 'high',
      });
    }
    
    // Normal: Quality adaptation
    if (config.hostQuality !== '720p') {
      recommendations.push({
        action: `Host quality set to ${config.hostQuality}`,
        reason: TIER_CONFIGS[this.currentTier].reason,
        priority: 'normal',
      });
    }
    
    // Low: Sub-root provisioning
    const targetSubRoots = Math.ceil(currentRoots / 2.5);
    if (targetSubRoots > 0) {
      recommendations.push({
        action: `Provision ${targetSubRoots} sub-root backups`,
        reason: `${targetSubRoots} sub-roots needed for ${currentRoots} roots failover.`,
        priority: 'low',
      });
    }
    
    return recommendations;
  }
  
  // Getters
  getCurrentTier(): ScalingTier { return this.currentTier; }
  getCurrentConfig(): TierConfig { return TIER_CONFIGS[this.currentTier]; }
  getTierChangeHistory() { return [...this.tierChangeHistory]; }
  getLastTierChangeTime() { return this.lastTierChangeTime; }
  
  getStats() {
    const config = TIER_CONFIGS[this.currentTier];
    return {
      currentTier: this.currentTier,
      tierName: config.name,
      tierReason: config.reason,
      previousTier: this.previousTier,
      tierChangeCount: this.tierChangeHistory.length,
      lastTierChange: this.lastTierChangeTime,
      config,
    };
  }

  // ============ LATENCY-AWARE CONTENT DELIVERY ============

  /**
   * Get the content delivery configuration for a given viewer count.
   *
   * WHY: As viewer count grows, the delivery strategy must shift from realtime
   * to buffered to chunked. This method provides the current mode, maximum
   * acceptable latency, and chunk configuration (if applicable) for the tier
   * that corresponds to the given viewer count.
   *
   * @param viewerCount - Current number of viewers in the session
   * @returns Object containing delivery mode, max latency, chunk config, and a human-readable reason
   *
   * @example
   * ```typescript
   * const engine = new DynamicScalingEngine();
   * const config = engine.getContentDeliveryConfig(500);
   * // config.mode === 'buffered'
   * // config.maxLatencyMs === 10000
   * // config.chunkConfig.keyframeIntervalMs === 2000
   * ```
   */
  getContentDeliveryConfig(viewerCount: number): {
    mode: ContentDeliveryMode;
    maxLatencyMs: number;
    chunkConfig: TierConfig['chunkConfig'];
    reason: string;
  } {
    const tier = this.getTierForViewers(viewerCount);
    const config = TIER_CONFIGS[tier];

    // Build a reason string explaining why this delivery mode is used
    let reason: string;
    switch (config.contentDeliveryMode) {
      case 'realtime':
        reason = `Tier ${tier} (${config.name}): ${viewerCount} viewers use realtime delivery. ` +
          `Under ${config.maxViewers} users, WebRTC direct streaming works without buffering or chunking. ` +
          `Max acceptable latency: ${config.maxAcceptableLatencyMs}ms.`;
        break;
      case 'buffered':
        reason = `Tier ${tier} (${config.name}): ${viewerCount} viewers use buffered delivery. ` +
          `At ${config.minViewers}+ users, relay nodes buffer ${config.chunkConfig?.segmentDurationMs ?? 'N/A'}ms segments ` +
          `for stability. Max acceptable latency: ${config.maxAcceptableLatencyMs}ms ` +
          `(${Math.round(config.maxAcceptableLatencyMs / 1000)}s).`;
        break;
      case 'chunked':
        reason = `Tier ${tier} (${config.name}): ${viewerCount} viewers use chunked store-and-forward delivery. ` +
          `At ${config.minViewers}+ users, content is segmented into ${config.chunkConfig?.segmentDurationMs ?? 'N/A'}ms chunks ` +
          `and batch-forwarded (${config.chunkConfig?.forwardBatchSize ?? 'N/A'} per batch). ` +
          `Max acceptable latency: ${config.maxAcceptableLatencyMs}ms ` +
          `(${Math.round(config.maxAcceptableLatencyMs / 60000)}min).`;
        break;
    }

    return {
      mode: config.contentDeliveryMode,
      maxLatencyMs: config.maxAcceptableLatencyMs,
      chunkConfig: config.chunkConfig,
      reason,
    };
  }

  /**
   * Estimate the actual end-to-end delivery latency based on tree depth and tier.
   *
   * WHY: The tier's maxAcceptableLatencyMs is an SLA boundary, but the ACTUAL latency
   * depends on the tree depth (number of relay hops). This method estimates real latency
   * so we can determine whether the current tree structure is within tolerance.
   *
   * Latency model:
   * - Each relay hop adds ~200ms processing (encode/decode/mux) + ~500ms network (transit + jitter).
   * - Tier 3 (buffered): adds 2s buffer per relay level to absorb jitter.
   * - Tier 4-5 (chunked): adds segment duration per relay level (each node must receive
   *   a full segment before it can forward it).
   *
   * Note: The first hop (host → root) is counted as relay level 1.
   * Tree depth of 3 means: host → root → branch → viewer (2 relay hops after host).
   *
   * @param viewerCount - Current number of viewers (determines tier)
   * @param treeDepth - Current tree depth (number of levels from host to deepest leaf)
   * @returns Estimated latency with breakdown and tolerance check
   *
   * @example
   * ```typescript
   * const engine = new DynamicScalingEngine();
   * const estimate = engine.estimateDeliveryLatency(3000, 5);
   * // estimate.estimatedMs ≈ 4 * 700 + 4 * 2000 = 10800ms for tier4 with depth 5
   * // estimate.withinTolerance depends on maxAcceptableLatencyMs
   * ```
   */
  estimateDeliveryLatency(viewerCount: number, treeDepth: number): {
    /** Estimated end-to-end latency in milliseconds */
    estimatedMs: number;
    /** Whether the estimated latency is within the tier's maxAcceptableLatencyMs */
    withinTolerance: boolean;
    /** Breakdown of latency components for debugging and UI display */
    breakdown: {
      /** Latency from network transit across all relay hops (~500ms per hop) */
      networkHopsMs: number;
      /** Latency from processing at each relay node (~200ms per hop) */
      processingMs: number;
      /** Latency from buffering at relay nodes (tier3: 2s per level, tier4-5: 0) */
      bufferingMs: number;
      /** Latency from chunked segment forwarding (tier4-5: segmentDurationMs per level) */
      chunkingMs: number;
    };
    /** Human-readable explanation of the estimate */
    reason: string;
  } {
    const tier = this.getTierForViewers(viewerCount);
    const config = TIER_CONFIGS[tier];

    // Number of relay hops = treeDepth - 1 (host is level 1, so depth 3 = 2 relay hops)
    // But we also count the hop from host to first relay node, so relay hops = treeDepth - 1.
    // However, for latency estimation, we consider each relay node adds delay.
    // Host → root is 1 hop, root → branch is 1 hop, etc.
    // So relay hops = treeDepth - 1 (the host doesn't add relay delay).
    const relayHops = Math.max(0, treeDepth - 1);

    // Per-hop constants
    const PROCESSING_PER_HOP_MS = 200;  // Encode/decode/mux at each relay node
    const NETWORK_PER_HOP_MS = 500;     // Network transit + jitter per hop

    // Calculate base latency from network and processing
    const networkHopsMs = relayHops * NETWORK_PER_HOP_MS;
    const processingMs = relayHops * PROCESSING_PER_HOP_MS;

    // Calculate tier-specific latency
    let bufferingMs = 0;
    let chunkingMs = 0;

    switch (config.contentDeliveryMode) {
      case 'realtime':
        // No buffering or chunking — just network + processing
        bufferingMs = 0;
        chunkingMs = 0;
        break;

      case 'buffered':
        // Tier 3: 2-second buffer per relay level to absorb jitter.
        // WHY: Each relay level holds a small buffer before forwarding.
        // This prevents jitter at one level from cascading to viewers downstream.
        bufferingMs = relayHops * 2000;
        chunkingMs = 0;
        break;

      case 'chunked':
        // Tier 4-5: segment duration per relay level for store-and-forward.
        // WHY: Each relay node must receive a COMPLETE segment before it can forward it.
        // With 2s segments and 3 relay hops, that's 6s of chunking delay alone.
        // This is the fundamental tradeoff of chunked delivery.
        bufferingMs = 0;
        const segmentDurationMs = config.chunkConfig?.segmentDurationMs ?? 2000;
        chunkingMs = relayHops * segmentDurationMs;
        break;
    }

    const estimatedMs = networkHopsMs + processingMs + bufferingMs + chunkingMs;
    const withinTolerance = estimatedMs <= config.maxAcceptableLatencyMs;

    // Build reason string
    const latencySources: string[] = [];
    if (relayHops > 0) {
      latencySources.push(`${relayHops} relay hops × ${NETWORK_PER_HOP_MS}ms network = ${networkHopsMs}ms`);
      latencySources.push(`${relayHops} relay hops × ${PROCESSING_PER_HOP_MS}ms processing = ${processingMs}ms`);
    }
    if (bufferingMs > 0) {
      latencySources.push(`${relayHops} levels × 2000ms buffer = ${bufferingMs}ms`);
    }
    if (chunkingMs > 0) {
      latencySources.push(`${relayHops} levels × ${config.chunkConfig?.segmentDurationMs ?? 'N/A'}ms chunking = ${chunkingMs}ms`);
    }

    const toleranceNote = withinTolerance
      ? `Within tolerance (≤ ${config.maxAcceptableLatencyMs}ms for ${tier}).`
      : `EXCEEDS tolerance (${config.maxAcceptableLatencyMs}ms for ${tier})! Consider reducing tree depth or increasing segment duration.`;

    const reason = latencySources.length > 0
      ? `Estimated ${estimatedMs}ms latency for ${viewerCount} viewers at depth ${treeDepth} (${config.contentDeliveryMode} mode). ` +
        `Breakdown: ${latencySources.join(', ')}. ${toleranceNote}`
      : `Estimated ${estimatedMs}ms latency for ${viewerCount} viewers at depth ${treeDepth} (direct delivery, no relay hops). ${toleranceNote}`;

    return {
      estimatedMs,
      withinTolerance,
      breakdown: {
        networkHopsMs,
        processingMs,
        bufferingMs,
        chunkingMs,
      },
      reason,
    };
  }
}
