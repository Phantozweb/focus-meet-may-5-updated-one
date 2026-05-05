// Focus Meet — Fractal Mesh Architecture Types
// Zero-budget, bandwidth-aware, device-adaptive, peer-as-proxy P2P
// Optimized for 700+ users with active join/leave churn

export type UserRole = 'host' | 'co-host' | 'speaker' | 'viewer' | 'root';
// 'co-host' = designated co-host with broadcast and moderation privileges
// 'root' = invisible dummy relay node — appears as regular viewer to all users
// Auto-selected from high-bandwidth attendees, keeps webinar alive if host leaves
export type NodeStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
export type StreamQuality = 'auto' | 'high' | 'medium' | 'low' | 'audio-only';
export type DeviceType = 'desktop-high' | 'desktop' | 'tablet' | 'mobile-high' | 'mobile' | 'unknown';
export type ClusterRole = 'supernode' | 'cluster-head' | 'relay' | 'leaf' | 'sub-root';
// 'sub-root' = invisible sub-root node that backs up root nodes

// ============ DEVICE CAPABILITY ============

export interface DeviceCapability {
  deviceType: DeviceType;
  screenResolution: { width: number; height: number };
  cpuCores: number;
  memoryGB: number;
  isMobile: boolean;
  networkType: string;       // 'wifi' | '4g' | '3g' | '2g' | 'unknown'
  downlinkMbps: number;      // navigator.connection.downlink
  rttMs: number;             // navigator.connection.rtt
  saveData: boolean;
}

// ============ BANDWIDTH PROBE ============

export interface BandwidthProbe {
  peerId: string;
  rttMs: number;
  jitterMs: number;
  estimatedDownKbps: number;
  estimatedUpKbps: number;
  packetLoss: number;         // 0-1 scale
  probeTimestamp: number;
  bytesSent: number;          // From WebRTC getStats
  bytesReceived: number;      // From WebRTC getStats
  availableBitrate: number;   // From WebRTC getStats
}

// ============ WEBRTC STATS SNAPSHOT ============

export interface WebRTCStats {
  timestamp: number;
  bytesSent: number;
  bytesReceived: number;
  packetsLost: number;
  packetsSent: number;
  packetsReceived: number;
  currentRoundTripTime: number;
  availableOutgoingBitrate: number;
  framesPerSecond: number;
  frameWidth: number;
  frameHeight: number;
  bitrate: number;           // Calculated from bytesSent delta
  nackCount: number;
  pliCount: number;
  jitter: number;
}

// ============ TREE NODE (ENHANCED) ============

export interface TreeNode {
  peerId: string;
  displayName: string;
  role: UserRole;
  clusterRole: ClusterRole;
  parentId: string | null;
  childrenIds: string[];
  depth: number;
  status: NodeStatus;

  // Cluster info
  clusterId: string;
  isClusterHead: boolean;
  backbonePeers: string[];

  // Capability
  canRelay: boolean;
  maxRelayCapacity: number;
  currentRelayLoad: number;

  // Device & bandwidth
  device: DeviceCapability;
  bandwidth: BandwidthProbe;
  webrtcStats: WebRTCStats | null;

  // Health
  lastHeartbeat: number;
  missedHeartbeats: number;
  connectedAt: number;
  relaySuccessCount: number;
  relayFailCount: number;
  reconnectCount: number;     // How many times this node reconnected

  // Root architecture (invisible to users)
  isRoot: boolean;            // Is this an invisible root relay node?
  isSubRoot: boolean;         // Is this a sub-root backup node?
  rootPriority: number;       // Priority for root selection (0 = not a root)
  streamBufferMs: number;     // How much stream this root has buffered (for failover)
}

// ============ CLUSTER ============

export interface Cluster {
  clusterId: string;
  headPeerId: string;
  parentClusterId: string | null;
  memberIds: string[];
  depth: number;
  maxDepth: number;
  totalViewers: number;
  healthScore: number;        // 0-100
  joinCount: number;          // Total joins in this cluster
  leaveCount: number;         // Total leaves in this cluster
}

// ============ ROOM ============

export interface RoomInfo {
  roomId: string;
  hostPeerId: string;
  hostName: string;
  createdAt: number;
  maxChildrenPerNode: number;
  title: string;
  clusters: Map<string, Cluster>;
  totalParticipants: number;
  peakParticipants: number;   // Track peak for analytics
  totalJoins: number;
  totalLeaves: number;

  // Root architecture (invisible to users)
  rootNodes: string[];       // PeerIDs of invisible root relay nodes (5-10)
  subRootNodes: string[];    // PeerIDs of invisible sub-root backup nodes
  hostActive: boolean;       // Is the original host still connected?
  failoverHostPeerId: string | null;  // Current acting host after failover
}

// ============ MESSAGES ============

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: 'chat' | 'system';
}

export interface SpeakerRequest {
  peerId: string;
  displayName: string;
  timestamp: number;
}

export interface StreamHealth {
  peerId: string;
  quality: StreamQuality;
  latency: number;
  packetLoss: number;
  bitrate: number;
  relayHops: number;
  isHealthy: boolean;
  lastUpdated: number;
}

// ============ NETWORK HEALTH SNAPSHOT ============

export interface NetworkHealthSnapshot {
  timestamp: number;
  totalNodes: number;
  activeStreams: number;
  avgRTT: number;
  avgPacketLoss: number;
  totalBandwidthKbps: number;
  clusterCount: number;
  maxDepth: number;
  joinRate: number;           // Joins per minute
  leaveRate: number;          // Leaves per minute
  churnScore: number;         // 0-100 (100 = very stable)
}

// ============ SIGNAL MESSAGES ============

export type SignalMessageType =
  | 'join-room'
  | 'room-info'
  | 'assign-parent'
  | 'parent-assigned'
  | 'request-stream'
  | 'stream-relay'
  | 'stream-quality-update'
  | 'chat-message'
  | 'chat-broadcast'
  | 'speaker-request'
  | 'speaker-approved'
  | 'speaker-denied'
  | 'mute-speaker'
  | 'node-disconnect'
  | 'reassign-parent'
  | 'heartbeat'
  | 'heartbeat-ack'
  | 'tree-update'
  | 'participant-update'
  | 'leave-room'
  | 'ping'
  | 'pong'
  | 'stream-reset'
  | 'bandwidth-probe'
  | 'bandwidth-report'
  | 'device-report'
  | 'cluster-assign'
  | 'cluster-update'
  | 'proxy-request'
  | 'proxy-accept'
  | 'proxy-relay'
  | 'new-cluster-head'
  | 'quality-adapt'
  | 'webrtc-stats-report'
  | 'relay-promote'
  | 'relay-demote'
  | 'file-share-announce'
  | 'file-chunk'
  | 'file-request'
  | 'screen-share-start'
  | 'screen-share-stop'
  | 'reaction'
  | 'root-promote'          // Host tells a viewer it's now an invisible root
  | 'root-demote'           // Root demoted back to viewer
  | 'root-failover'         // Host left, root takes over
  | 'root-heartbeat'        // Special heartbeat for root nodes
  | 'stream-buffer-sync'    // Root syncs stream buffer for instant failover
  | 'hand-raise'
  | 'hand-lower'
  | 'waiting-join'
  | 'waiting-admit'
  | 'waiting-deny'
  | 'moderation-action'
  | 'room-lock'
  | 'room-unlock'
  | 'backup-parent-assign'
  | 'slide-change'
  | 'slide-broadcast'
  | 'annotation-update'
  | 'co-host-assign'
  | 'co-host-revoke';

export interface SignalMessage {
  type: SignalMessageType;
  payload: any;
  senderId: string;
  senderName: string;
  roomId: string;
  timestamp: number;
}

// ============ CONSTANTS ============

// Cluster size before spawning sub-cluster
export const CLUSTER_MAX_MEMBERS = 25;  // Slightly smaller for faster spawn at 700 users
// Max children per relay node (adjusted by device capability)
// IMPROVED: Mobile on WiFi can handle more than before
export const MAX_CHILDREN_DESKTOP_HIGH = 12;  // beefy desktops can handle more
export const MAX_CHILDREN_DESKTOP = 8;
export const MAX_CHILDREN_TABLET = 5;
export const MAX_CHILDREN_MOBILE = 4;          // improved: mobile on WiFi can relay to 4
export const MAX_CHILDREN_MOBILE_HIGH = 5;     // new: high-end mobile can relay to 5
export const MAX_CHILDREN_DEFAULT = 6;

// Timing — optimized for high-churn 700-user scenario
export const HEARTBEAT_INTERVAL = 5000;
export const HEARTBEAT_TIMEOUT = 15000;        // 3 missed heartbeats
export const RECONNECT_DELAY = 1000;            // Faster reconnect for churn
export const MAX_RECONNECT_ATTEMPTS = 20;       // More attempts for long webinars
export const STREAM_WATCHDOG_INTERVAL = 6000;   // Faster watchdog for 700 users
export const STREAM_DEAD_THRESHOLD = 20000;      // Quicker dead stream detection
export const PEER_CONNECT_TIMEOUT = 10000;       // 10s connect timeout
export const BANDWIDTH_PROBE_INTERVAL = 10000;   // Probe every 10s (faster for 700 users)
export const WEBRTC_STATS_INTERVAL = 5000;       // Get WebRTC stats every 5s
export const QUALITY_ADAPT_INTERVAL = 8000;      // Adapt quality every 8s based on stats
export const JOIN_RATE_WINDOW = 60000;           // 1-minute window for join rate
export const MAX_JOIN_RATE = 30;                 // Max 30 joins per minute before throttling

// Quality bitrates per device type
// ALL devices start at 720p — degrades to 480p → 420p → audio-only under network stress
export const QUALITY_PROFILES: Record<DeviceType, { width: number; height: number; fps: number; bitrate: number }> = {
  'desktop-high': { width: 1280, height: 720, fps: 30, bitrate: 2500 },
  'desktop':      { width: 1280, height: 720, fps: 24, bitrate: 2000 },  // 720p start
  'tablet':       { width: 1280, height: 720, fps: 20, bitrate: 1500 },  // 720p start
  'mobile-high':  { width: 1280, height: 720, fps: 20, bitrate: 1200 },  // 720p start
  'mobile':       { width: 1280, height: 720, fps: 15, bitrate: 900 },   // 720p start for phones
  'unknown':      { width: 1280, height: 720, fps: 24, bitrate: 1500 },
};

// Dynamic quality levels for network-based adaptation
// 720p → 480p → 420p → audio-only — smooth degradation, never break
// Quality ONLY degrades based on real-time bandwidth. If bandwidth recovers, quality upgrades immediately.
export const DYNAMIC_QUALITY_LEVELS: { name: StreamQuality; width: number; height: number; fps: number; bitrate: number }[] = [
  { name: 'high',        width: 1280, height: 720, fps: 30, bitrate: 2500 },  // 720p — ALL devices stay here if bandwidth allows
  { name: 'medium',      width: 854,  height: 480, fps: 24, bitrate: 1500 },  // 480p — when bandwidth drops
  { name: 'low',         width: 640,  height: 420, fps: 20, bitrate: 700  },   // 420p — low bandwidth
  { name: 'audio-only',  width: 0,    height: 0,   fps: 0,  bitrate: 100  },  // Last resort — audio only
];

// ICE — STUN servers for NAT discovery, TURN servers for symmetric NAT traversal
export const ICE_SERVERS: RTCIceServer[] = [
  // STUN servers for NAT discovery
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  // TURN servers for symmetric NAT traversal (10-20% of users need this)
  // Free metered.ca TURN (5GB/month free tier)
  {
    urls: 'turn:a.relay.metered.ca:80',
    username: 'e8dd65b92f7b828b1d79c8e0',
    credential: 'fRup PFNb0r6gIvF',
  },
  {
    urls: 'turn:a.relay.metered.ca:443',
    username: 'e8dd65b92f7b828b1d79c8e0',
    credential: 'fRup PFNb0r6gIvF',
  },
  {
    urls: 'turn:a.relay.metered.ca:443?transport=tcp',
    username: 'e8dd65b92f7b828b1d79c8e0',
    credential: 'fRup PFNb0r6gIvF',
  },
];

// Chat limits
export const CHAT_MAX_LENGTH = 500;
export const CHAT_THROTTLE_MS = 400;
export const MAX_PARTICIPANTS = 2000;         // Theoretical max (practical ~1200)
export const MAX_RELAY_HOPS = 7;              // Allow deeper trees for 700+

// ============ STABILITY SAFEGUARDS ============
// These constants prevent stream breakage under load

export const STREAM_FROZEN_THRESHOLD = 5000;    // 5s no frames = frozen stream
export const QUALITY_UPGRADE_COOLDOWN = 15000;   // Wait 15s before upgrading quality (prevent flapping)
export const QUALITY_DOWNGRADE_MIN_DURATION = 30000; // Stay at lower quality for at least 30s
export const MAX_CONCURRENT_RECOVERIES = 10;     // Max simultaneous stream recoveries
export const RECOVERY_BACKOFF_BASE = 2000;       // 2s base backoff for recovery retries
export const RELAY_OVERLOAD_THRESHOLD = 0.9;    // 90% load = overloaded relay
export const TREE_REBALANCE_INTERVAL = 30000;    // Rebalance tree every 30s for optimal paths
export const STREAM_MIN_BITRATE_KBPS = 300;      // Below this, switch to audio-only to prevent break
export const HEALTH_SCORE_CRITICAL = 30;         // Below 30% health = critical intervention

// ============ MULTI-PATH & BACKUP PARENT ============
// Redundant connections for instant failover

export const BACKUP_PARENT_ENABLED = true;       // Pre-establish backup parent connection
export const MULTI_PATH_CANDIDATES = 3;          // Evaluate top 3 relay candidates
export const BACKUP_PARENT_SWITCH_THRESHOLD = 5000; // Switch to backup if primary silent for 5s
export const BRANCHING_FACTOR_TARGET = 5;        // Target branching factor for optimal tree spread

// ============ ROOT ARCHITECTURE ============
// Invisible dummy relay nodes that keep the webinar alive

export const ROOT_NODE_TARGET = 7;               // Target 7 root nodes (5-10 range)
export const ROOT_NODE_MIN = 5;                   // Minimum 5 roots before stable
export const ROOT_NODE_MAX = 10;                  // Maximum 10 root nodes
export const SUB_ROOT_TARGET = 5;                 // Target 5 sub-root backup nodes
export const ROOT_SELECTION_INTERVAL = 30000;     // Re-evaluate roots every 30s
export const ROOT_MIN_UPTIME_MS = 20000;          // Must be connected 20s before eligible
export const ROOT_MIN_BANDWIDTH_KBPS = 2000;      // Minimum 2Mbps upload to be a root
export const ROOT_MAX_RTT_MS = 200;               // Max RTT to be a root
export const ROOT_BUFFER_SIZE_MS = 10000;         // Roots buffer 10s of stream for failover
export const ROOT_FAILOVER_TIMEOUT_MS = 5000;     // 5s to detect host left and failover

// Low-bandwidth host adaptive settings
export const LOW_BANDWIDTH_THRESHOLD_KBPS = 5000; // Host upload < 5 Mbps = low bandwidth
export const LOW_BANDWIDTH_MAX_ROOTS = 3;         // Fewer roots for low-bandwidth hosts
export const LOW_BANDWIDTH_HOST_QUALITY: StreamQuality = 'medium'; // Start at 480p for low-bw host
export const LOW_BANDWIDTH_ADAPTIVE_ROOTS = true;  // Dynamically adjust root count based on host bandwidth
export const HOST_BANDWIDTH_PROBE_INTERVAL = 15000; // Re-probe host bandwidth every 15s

// ============ JOIN OPTIMIZATION ============
// Improve join success rate under high load

export const JOIN_RETRY_ATTEMPTS = 3;             // Retry join up to 3 times before failing
export const JOIN_RETRY_DELAY = 2000;              // 2s between join retries
export const JOIN_QUEUE_ENABLED = true;            // Queue joins instead of rejecting when throttled

// ============ BENCHMARK TYPES ============

export interface BenchmarkResult {
  totalSimulatedUsers: number;
  maxSupportedUsers: number;
  joinSuccessRate: number;        // 0-1
  streamStabilityScore: number;    // 0-100
  avgReconnectTime: number;        // ms
  orphanAdoptionTime: number;      // ms
  maxDepth: number;
  avgRelayLoad: number;            // 0-1
  churnResistanceScore: number;    // 0-100
  qualityDistribution: Record<StreamQuality, number>;
  clusterCount: number;
  peakMemoryMB: number;
  totalTimeSeconds: number;
  phaseResults: BenchmarkPhaseResult[];
  // Enhanced metrics
  deviceDistribution: Record<DeviceType, number>;
  relayHealthBreakdown: { healthy: number; degraded: number; overloaded: number };
  bandwidthTimeline: { tick: number; avgUpKbps: number; avgDownKbps: number; avgRTT: number }[];
  userTimeline: { tick: number; activeUsers: number; joining: number; leaving: number }[];
  peakConcurrentUsers: number;
  totalStreamBreaks: number;
  totalAutoRecoveries: number;
  avgJoinTime: number;             // ms — simulated time to join
  relayNodeCount: number;
  leafNodeCount: number;
  maxRelayHops: number;
  overallGrade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
  // Data consumption metrics
  dataPerHour: DataConsumptionProfile;
  bandwidthAdaptation: BandwidthAdaptationProfile;
}

// Data consumption per hour at each quality level
export interface DataConsumptionProfile {
  at720p: number;          // MB per hour at 720p
  at480p: number;          // MB per hour at 480p
  at420p: number;          // MB per hour at 420p
  audioOnly: number;       // MB per hour audio-only
  averageMixed: number;    // MB per hour with realistic quality mix
  hostUploadPerHour: number;  // MB per hour the host uploads
  relayUploadPerHour: number; // MB per hour a relay node uploads
  totalNetworkPerHour: number; // GB per hour total network traffic for all users
}

// How the system adapts bitrate based on available bandwidth
export interface BandwidthAdaptationProfile {
  thresholds: {
    quality: StreamQuality;
    minBandwidthKbps: number;
    bitrateKbps: number;
    dataPerHourMB: number;
  }[];
  currentAdaptation: {
    usersAt720p: number;
    usersAt480p: number;
    usersAt420p: number;
    usersAtAudioOnly: number;
    pctAt720p: number;
  };
  savingsVsNoAdapt: number;  // % data saved vs forcing 720p for everyone
}

export interface BenchmarkPhaseResult {
  phase: string;
  userCount: number;
  activeStreams: number;
  avgRTT: number;
  avgPacketLoss: number;
  streamBreaks: number;
  autoRecoveries: number;
  qualityBreakdown: Record<StreamQuality, number>;
  durationSeconds: number;
  passed: boolean;
  notes: string;
}

// PeerJS server config
export const PEERJS_SERVER_HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
export const PEERJS_SERVER_PORT = 9001;
export const PEERJS_SERVER_PATH = '/focusmeet';

// ============ FILE SHARING TYPES ============

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  type: string;           // MIME type
  senderId: string;
  senderName: string;
  timestamp: number;
  chunks: number;
  transferredChunks: number;
  status: 'uploading' | 'available' | 'downloading' | 'downloaded';
  data?: ArrayBuffer;     // Only for fully downloaded files
}

export interface FileChunk {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  data: ArrayBuffer;
}

// ============ ATTENDANCE TYPES ============

export interface AttendanceRecord {
  peerId: string;
  displayName: string;
  joinedAt: number;
  lastSeenAt: number;
  leftAt: number | null;
  attendancePercent: number; // calculated based on session duration
}

// ============ REACTION TYPES ============

export type ReactionType = 'thumbsup' | 'clap' | 'heart' | 'laugh' | 'fire' | 'wave';

export interface Reaction {
  id: string;
  type: ReactionType;
  senderId: string;
  senderName: string;
  timestamp: number;
}

// ============ SCREEN SHARE TYPES ============

export interface ScreenShareState {
  isSharing: boolean;
  sharedBy: string | null;
  sharedByName: string | null;
  stream: MediaStream | null;
}

// ============ VIEW MODE ============

export type ViewMode = 'speaker' | 'gallery';

// ============ FILE TRANSFER CONSTANTS ============

export const FILE_CHUNK_SIZE = 16 * 1024; // 16KB chunks for reliable P2P transfer
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB max file size

// ============ REACTION THROTTLE ============

export const REACTION_THROTTLE_MS = 2000; // 2 seconds between reactions

// ============ DEVICE DETECTION HELPERS ============

export function detectDevice(): DeviceCapability {
  if (typeof window === 'undefined') {
    return {
      deviceType: 'unknown',
      screenResolution: { width: 1920, height: 1080 },
      cpuCores: 4,
      memoryGB: 4,
      isMobile: false,
      networkType: 'unknown',
      downlinkMbps: 10,
      rttMs: 50,
      saveData: false,
    };
  }

  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

  const screenW = window.screen.width;
  const screenH = window.screen.height;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  const cpuCores = nav.hardwareConcurrency || 2;
  const memoryGB = nav.deviceMemory || 4;

  let deviceType: DeviceType = 'unknown';
  if (!isMobile) {
    deviceType = (cpuCores >= 8 && memoryGB >= 8) ? 'desktop-high' : 'desktop';
  } else if (/iPad|Android 3|Tablet/i.test(nav.userAgent) || (screenW >= 768 && screenH >= 768)) {
    deviceType = 'tablet';
  } else if (cpuCores >= 4 && memoryGB >= 4) {
    deviceType = 'mobile-high';
  } else {
    deviceType = 'mobile';
  }

  return {
    deviceType,
    screenResolution: { width: screenW, height: screenH },
    cpuCores,
    memoryGB,
    isMobile,
    networkType: conn?.effectiveType || 'unknown',
    downlinkMbps: conn?.downlink || 10,
    rttMs: conn?.rtt || 50,
    saveData: conn?.saveData || false,
  };
}

export function getMaxChildrenForDevice(device: DeviceCapability): number {
  if (device.deviceType === 'desktop-high') return MAX_CHILDREN_DESKTOP_HIGH;
  if (device.deviceType === 'desktop') return MAX_CHILDREN_DESKTOP;
  if (device.deviceType === 'tablet') return MAX_CHILDREN_TABLET;
  if (device.deviceType === 'mobile-high') return MAX_CHILDREN_MOBILE_HIGH;
  if (device.isMobile) return MAX_CHILDREN_MOBILE;
  return MAX_CHILDREN_DEFAULT;
}

// Get the right quality profile for current network conditions
// ALL devices start at 720p. Quality is SOLELY based on real-time bandwidth.
// If bandwidth recovers, quality immediately upgrades — no artificial cooldown or time-based degradation.

// ============ HAND RAISE ============

export interface HandRaise {
  peerId: string;
  displayName: string;
  raisedAt: number;
  isRaised: boolean;
}

// ============ WAITING ROOM ============

export interface WaitingAttendee {
  peerId: string;
  displayName: string;
  joinedAt: number;
  device: DeviceCapability;
}

// ============ MODERATION ============

export interface ModerationAction {
  type: 'mute' | 'mute-video' | 'remove' | 'block' | 'disable-chat' | 'lower-hand';
  targetPeerId: string;
  targetName: string;
  performedBy: string;
  timestamp: number;
  reason?: string;
}

// ============ ROOM LOCK ============

export interface RoomLock {
  isLocked: boolean;
  lockedAt: number | null;
  lockedBy: string | null;
}

export function getAdaptiveQualityLevel(
  currentBandwidthKbps: number,
  currentPacketLoss: number,
  currentRTT: number,
  device: DeviceCapability
): typeof DYNAMIC_QUALITY_LEVELS[number] {
  // Start from device max quality (ALL 720p now)
  const deviceProfile = QUALITY_PROFILES[device.deviceType] || QUALITY_PROFILES['unknown'];

  // If network is excellent, keep 720p
  if (currentBandwidthKbps >= deviceProfile.bitrate * 1.5 && currentPacketLoss < 0.02 && currentRTT < 100) {
    return { name: 'high', ...deviceProfile };
  }

  // If network is good enough for 720p, stay high — BANDWIDTH IS KING
  if (currentBandwidthKbps >= deviceProfile.bitrate * 1.0 && currentPacketLoss < 0.05 && currentRTT < 200) {
    return { name: 'high', ...deviceProfile };
  }

  // Step down to 480p ONLY when bandwidth can't sustain 720p
  if (currentBandwidthKbps >= 1200 && currentPacketLoss < 0.08 && currentRTT < 400) {
    return DYNAMIC_QUALITY_LEVELS[1]; // medium (480p)
  }

  // Step down to 420p when bandwidth is low
  if (currentBandwidthKbps >= 500 && currentPacketLoss < 0.15 && currentRTT < 600) {
    return DYNAMIC_QUALITY_LEVELS[2]; // low (420p)
  }

  // Audio only as last resort — prevents total break
  if (currentBandwidthKbps < 300 || currentPacketLoss > 0.25 || currentRTT > 800) {
    return DYNAMIC_QUALITY_LEVELS[3]; // audio-only
  }

  // Default: stay at current quality (auto) — prefer stability over aggressive downgrade
  return { name: 'auto', ...deviceProfile };
}
