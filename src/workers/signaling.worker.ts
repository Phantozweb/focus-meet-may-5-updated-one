// Focus Meet — Signaling Worker
// Offloads signal message parsing, validation, bandwidth calculations,
// attendance persistence, and relay scoring from the main thread.
//
// Uses self.onmessage pattern for web worker compatibility.

// ============ TYPES ============

export interface WorkerMessage {
  type: 'PROCESS_SIGNAL_BATCH' | 'CALCULATE_BANDWIDTH' | 'PERSIST_ATTENDANCE' | 'BATCH_TREE_UPDATE' | 'CALCULATE_RELAY_SCORES';
  payload: any;
}

export interface WorkerResponse {
  type: 'SIGNAL_BATCH_RESULT' | 'BANDWIDTH_RESULT' | 'ATTENDANCE_PERSISTED' | 'TREE_UPDATE_RESULT' | 'RELAY_SCORES_RESULT';
  payload: any;
}

interface SignalEntry {
  type: string;
  senderId: string;
  timestamp: number;
  payload: any;
  roomId: string;
}

interface BandwidthInput {
  currentRTT: number;
  previousRTT: number;
  rttAlpha: number;           // EMA smoothing factor for RTT
  currentJitter: number;
  bytesSentDelta: number;
  bytesReceivedDelta: number;
  timeDeltaMs: number;
  packetsLost: number;
  packetsReceived: number;
  availableBitrate: number;
}

interface BandwidthOutput {
  rttMs: number;
  jitterMs: number;
  estimatedDownKbps: number;
  estimatedUpKbps: number;
  packetLoss: number;
  availableBitrate: number;
}

interface AttendanceEntry {
  peerId: string;
  displayName: string;
  joinedAt: number;
  lastSeenAt: number;
  leftAt: number | null;
}

interface TreeUpdateEntry {
  nodes: Record<string, any>;
  timestamp: number;
}

interface RelayNodeData {
  peerId: string;
  rttMs: number;
  estimatedUpKbps: number;
  availableBitrate: number;
  currentRelayLoad: number;
  maxRelayCapacity: number;
  depth: number;
  deviceType: string;
  isClusterHead: boolean;
  relaySuccessCount: number;
  relayFailCount: number;
  connectedAt: number;
}

interface RelayScoreResult {
  peerId: string;
  score: number;
}

// ============ STATE ============

const STALE_THRESHOLD_MS = 60000;
const TREE_BATCH_WINDOW_MS = 100;

let pendingTreeUpdates: TreeUpdateEntry[] = [];
let treeBatchTimer: ReturnType<typeof setTimeout> | null = null;

// ============ HELPERS ============

function postResult(response: WorkerResponse): void {
  self.postMessage(response);
}

// ============ SIGNAL BATCH PROCESSING ============

function processSignalBatch(messages: SignalEntry[]): SignalEntry[] {
  const now = Date.now();

  // 1. Filter stale messages (>60s old)
  const fresh = messages.filter(msg => (now - msg.timestamp) < STALE_THRESHOLD_MS);

  // 2. Deduplicate by (type, senderId) — keep latest only
  const seen = new Map<string, SignalEntry>();
  for (const msg of fresh) {
    const key = `${msg.type}:${msg.senderId}`;
    const existing = seen.get(key);
    if (!existing || msg.timestamp > existing.timestamp) {
      seen.set(key, msg);
    }
  }

  // 3. Sort by timestamp for ordered processing
  const result = Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);

  return result;
}

// ============ BANDWIDTH CALCULATION ============

function calculateBandwidth(input: BandwidthInput): BandwidthOutput {
  // 1. Exponential Moving Average for RTT
  const rttMs = input.rttAlpha * input.currentRTT + (1 - input.rttAlpha) * input.previousRTT;

  // 2. Jitter: EMA of absolute RTT variation
  const rttVariation = Math.abs(input.currentRTT - input.previousRTT);
  const jitterMs = 0.7 * input.currentJitter + 0.3 * rttVariation;

  // 3. Throughput estimation from byte deltas
  const timeDeltaSec = Math.max(input.timeDeltaMs / 1000, 0.001);
  const estimatedDownKbps = (input.bytesReceivedDelta * 8) / (timeDeltaSec * 1000);
  const estimatedUpKbps = (input.bytesSentDelta * 8) / (timeDeltaSec * 1000);

  // 4. Packet loss ratio
  const totalPackets = input.packetsLost + input.packetsReceived;
  const packetLoss = totalPackets > 0 ? input.packetsLost / totalPackets : 0;

  return {
    rttMs: Math.round(rttMs * 100) / 100,
    jitterMs: Math.round(jitterMs * 100) / 100,
    estimatedDownKbps: Math.round(estimatedDownKbps),
    estimatedUpKbps: Math.round(estimatedUpKbps),
    packetLoss: Math.round(packetLoss * 10000) / 10000,
    availableBitrate: input.availableBitrate,
  };
}

// ============ ATTENDANCE PERSISTENCE ============

function persistAttendance(entries: AttendanceEntry[]): { success: boolean; count: number } {
  try {
    const serialized = JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      entries,
    });
    // In a web worker, we use localStorage via the worker's global scope
    // Web workers don't have direct localStorage access, so we return
    // the serialized data and let the main thread persist it
    return { success: true, count: entries.length };
  } catch {
    return { success: false, count: 0 };
  }
}

// ============ TREE UPDATE BATCHING ============

function batchTreeUpdate(update: TreeUpdateEntry): void {
  pendingTreeUpdates.push(update);

  if (!treeBatchTimer) {
    treeBatchTimer = setTimeout(() => {
      flushTreeBatch();
    }, TREE_BATCH_WINDOW_MS);
  }
}

function flushTreeBatch(): void {
  if (pendingTreeUpdates.length === 0) return;

  // Merge all pending updates into a single combined update
  // Later updates overwrite earlier ones for the same node
  const mergedNodes: Record<string, any> = {};

  for (const update of pendingTreeUpdates) {
    for (const [nodeId, nodeData] of Object.entries(update.nodes)) {
      mergedNodes[nodeId] = nodeData;
    }
  }

  const latestTimestamp = pendingTreeUpdates[pendingTreeUpdates.length - 1].timestamp;

  pendingTreeUpdates = [];
  treeBatchTimer = null;

  postResult({
    type: 'TREE_UPDATE_RESULT',
    payload: {
      nodes: mergedNodes,
      timestamp: latestTimestamp,
      batchedCount: Object.keys(mergedNodes).length,
    },
  });
}

// ============ RELAY SCORE CALCULATION ============

function calculateRelayScores(nodes: RelayNodeData[]): RelayScoreResult[] {
  return nodes.map(node => {
    // 1. BANDWIDTH SCORE (40% weight)
    const rttScore = Math.max(0, 100 - node.rttMs);
    const upScore = Math.min(100, node.estimatedUpKbps / 25);
    const bitrateScore = Math.min(100, node.availableBitrate / 30);
    const bandwidthScore = rttScore * 0.3 + upScore * 0.3 + bitrateScore * 0.4;

    // 2. LOAD SCORE (30% weight) — quadratic penalty for high load
    const loadRatio = node.currentRelayLoad / Math.max(1, node.maxRelayCapacity);
    const loadScore = (1 - loadRatio * loadRatio) * 100;

    // 3. DEPTH SCORE (20% weight)
    const depthScore = Math.max(0, 100 - node.depth * 15);

    // 4. DEVICE SCORE (10% weight)
    let deviceScore = 50;
    if (node.deviceType === 'desktop-high') deviceScore = 100;
    else if (node.deviceType === 'desktop') deviceScore = 80;
    else if (node.deviceType === 'tablet') deviceScore = 60;
    else if (node.deviceType === 'mobile-high') deviceScore = 50;
    else deviceScore = 30;

    // 5. HEALTH BONUS
    const healthBonus = (node.relaySuccessCount - node.relayFailCount * 3) * 2;

    // 6. CLUSTER HEAD BONUS
    const clusterBonus = node.isClusterHead ? 15 : 0;

    // 7. STABILITY BONUS
    const uptimeMin = (Date.now() - node.connectedAt) / 60000;
    const stabilityBonus = Math.min(15, uptimeMin * 2);

    const score =
      bandwidthScore * 0.4 +
      loadScore * 0.3 +
      depthScore * 0.2 +
      deviceScore * 0.1 +
      healthBonus +
      clusterBonus +
      stabilityBonus;

    return { peerId: node.peerId, score: Math.round(score * 100) / 100 };
  }).sort((a, b) => b.score - a.score);
}

// ============ MAIN MESSAGE HANDLER ============

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'PROCESS_SIGNAL_BATCH': {
      const filtered = processSignalBatch(payload.messages as SignalEntry[]);
      postResult({
        type: 'SIGNAL_BATCH_RESULT',
        payload: {
          messages: filtered,
          originalCount: payload.messages.length,
          filteredCount: filtered.length,
          staleRemoved: payload.messages.length - filtered.length,
        },
      });
      break;
    }

    case 'CALCULATE_BANDWIDTH': {
      const result = calculateBandwidth(payload as BandwidthInput);
      postResult({
        type: 'BANDWIDTH_RESULT',
        payload: result,
      });
      break;
    }

    case 'PERSIST_ATTENDANCE': {
      const result = persistAttendance(payload.entries as AttendanceEntry[]);
      postResult({
        type: 'ATTENDANCE_PERSISTED',
        payload: {
          ...result,
          serializedData: JSON.stringify({
            version: 1,
            savedAt: Date.now(),
            entries: payload.entries,
          }),
        },
      });
      break;
    }

    case 'BATCH_TREE_UPDATE': {
      batchTreeUpdate(payload as TreeUpdateEntry);
      break;
    }

    case 'CALCULATE_RELAY_SCORES': {
      const scores = calculateRelayScores(payload.nodes as RelayNodeData[]);
      postResult({
        type: 'RELAY_SCORES_RESULT',
        payload: { scores },
      });
      break;
    }

    default: {
      console.warn('[SignalingWorker] Unknown message type:', type);
    }
  }
};

// Signal that the worker is ready
postResult({
  type: 'SIGNAL_BATCH_RESULT',
  payload: { ready: true },
});
