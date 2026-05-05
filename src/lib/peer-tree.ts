// Focus Meet — Fractal Mesh Engine v3
// Zero-budget, bandwidth-aware, device-adaptive, peer-as-proxy P2P
// Optimized for 1000+ users with active join/leave/listen churn
//
// KEY IMPROVEMENTS v3:
// 1. WebRTC getStats() for real bandwidth measurement (not just ping)
// 2. Dynamic quality adaptation every 8s based on actual throughput
// 3. Join rate throttling to prevent overload waves
// 4. Orphan adoption: disconnected children auto-reassign to best relay
// 5. Relay auto-promotion: high-bandwidth viewers become relays automatically
// 6. Cluster auto-spawn at 25 members for better distribution
// 7. Memory-efficient node tracking with periodic cleanup
// 8. Batched tree updates to reduce signaling overhead
// 9. Multi-path relay selection: weighted random among top N candidates
// 10. Backup parent: pre-established redundant connection for instant failover
// 11. Improved load balancing: quadratic penalty for high-load relays
// 12. Increased mobile relay capacity (4-5 children instead of 3)

import {
  TreeNode,
  RoomInfo,
  Cluster,
  SignalMessage,
  StreamHealth,
  StreamQuality,
  ChatMessage,
  SpeakerRequest,
  NodeStatus,
  UserRole,
  ClusterRole,
  DeviceCapability,
  BandwidthProbe,
  WebRTCStats,
  NetworkHealthSnapshot,
  SharedFile,
  Reaction,
  ReactionType,
  FILE_CHUNK_SIZE,
  MAX_FILE_SIZE,
  ICE_SERVERS,
  HEARTBEAT_INTERVAL,
  HEARTBEAT_TIMEOUT,
  RECONNECT_DELAY,
  MAX_RECONNECT_ATTEMPTS,
  STREAM_WATCHDOG_INTERVAL,
  STREAM_DEAD_THRESHOLD,
  PEER_CONNECT_TIMEOUT,
  BANDWIDTH_PROBE_INTERVAL,
  WEBRTC_STATS_INTERVAL,
  QUALITY_ADAPT_INTERVAL,
  CHAT_MAX_LENGTH,
  CHAT_THROTTLE_MS,
  MAX_PARTICIPANTS,
  QUALITY_PROFILES,
  DYNAMIC_QUALITY_LEVELS,
  CLUSTER_MAX_MEMBERS,
  MAX_JOIN_RATE,
  JOIN_RATE_WINDOW,
  STREAM_FROZEN_THRESHOLD,
  QUALITY_UPGRADE_COOLDOWN,
  QUALITY_DOWNGRADE_MIN_DURATION,
  MAX_CONCURRENT_RECOVERIES,
  RECOVERY_BACKOFF_BASE,
  RELAY_OVERLOAD_THRESHOLD,
  TREE_REBALANCE_INTERVAL,
  STREAM_MIN_BITRATE_KBPS,
  HEALTH_SCORE_CRITICAL,
  BACKUP_PARENT_ENABLED,
  MULTI_PATH_CANDIDATES,
  BACKUP_PARENT_SWITCH_THRESHOLD,
  BRANCHING_FACTOR_TARGET,
  ROOT_NODE_TARGET,
  ROOT_NODE_MIN,
  ROOT_NODE_MAX,
  SUB_ROOT_TARGET,
  ROOT_SELECTION_INTERVAL,
  ROOT_MIN_UPTIME_MS,
  ROOT_MIN_BANDWIDTH_KBPS,
  ROOT_MAX_RTT_MS,
  ROOT_BUFFER_SIZE_MS,
  ROOT_FAILOVER_TIMEOUT_MS,
  LOW_BANDWIDTH_THRESHOLD_KBPS, LOW_BANDWIDTH_MAX_ROOTS, LOW_BANDWIDTH_HOST_QUALITY, LOW_BANDWIDTH_ADAPTIVE_ROOTS, HOST_BANDWIDTH_PROBE_INTERVAL,
  detectDevice,
  getMaxChildrenForDevice,
  getAdaptiveQualityLevel,
  PEERJS_SERVER_PORT,
  PEERJS_SERVER_PATH,
} from './types';
import { TreeHoneycombEngine } from './tree-honeycomb-engine';
import { CoopScheduler, coopScheduler } from './coop-scheduler';

type PeerInstance = any;
type DataConnection = any;
type MediaConnection = any;

// ============ FRACTAL MESH ENGINE v2 ============

export class FractalMeshEngine {
  private peer: PeerInstance | null = null;
  private myNode: TreeNode | null = null;
  private nodes: Map<string, TreeNode> = new Map();
  private clusters: Map<string, Cluster> = new Map();
  private roomInfo: RoomInfo | null = null;

  // Connections
  private parentConnection: DataConnection | null = null;
  private backupParentConnection: DataConnection | null = null;  // NEW: backup for instant failover
  private backupParentId: string | null = null;                  // NEW: backup parent peer ID
  private childConnections: Map<string, DataConnection> = new Map();
  private mediaConnections: Map<string, MediaConnection> = new Map();
  private backboneConnections: Map<string, DataConnection> = new Map();
  private proxyConnections: Map<string, DataConnection> = new Map();

  // Streams
  private incomingStream: MediaStream | null = null;
  private localStream: MediaStream | null = null;
  private streamHealth: Map<string, StreamHealth> = new Map();
  private lastStreamActivity: number = 0;

  // Timers
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private streamWatchdogTimer: ReturnType<typeof setInterval> | null = null;
  private bandwidthProbeTimer: ReturnType<typeof setInterval> | null = null;
  private webrtcStatsTimer: ReturnType<typeof setInterval> | null = null;
  private qualityAdaptTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // State
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private lastChatTime = 0;
  private speakerRequests: SpeakerRequest[] = [];
  private currentQuality: StreamQuality = 'auto';
  private myDevice: DeviceCapability;
  private pendingPings: Map<string, number> = new Map();
  private bandwidthProbes: Map<string, BandwidthProbe> = new Map();
  private PeerJS: any = null;

  // Churn tracking for 700-user stability
  private recentJoins: number[] = [];          // Timestamps of recent joins
  private recentLeaves: number[] = [];         // Timestamps of recent leaves
  private networkHistory: NetworkHealthSnapshot[] = []; // Last 60 snapshots
  private prevStats: Map<string, WebRTCStats> = new Map(); // For delta calculations

  // Stability safeguards
  private lastQualityChangeTime: number = 0;
  private currentQualityName: StreamQuality = 'high';    // ALL start at 720p
  private activeRecoveries: number = 0;
  private frozenStreams: Map<string, number> = new Map(); // peerId → frozen since timestamp
  private treeRebalanceTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveStreamBreaks: number = 0;
  private lastStreamBreakTime: number = 0;

  // Callbacks
  private onStreamUpdate: ((stream: MediaStream | null, fromPeerId: string) => void) | null = null;
  private onTreeUpdate: ((nodes: Map<string, TreeNode>) => void) | null = null;
  private onChatMessage: ((msg: ChatMessage) => void) | null = null;
  private onSpeakerRequest: ((req: SpeakerRequest) => void) | null = null;
  private onParticipantUpdate: ((nodes: Map<string, TreeNode>) => void) | null = null;
  private onConnectionStatus: ((status: NodeStatus) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private onStreamHealth: ((health: StreamHealth) => void) | null = null;
  private onClusterUpdate: ((clusters: Map<string, Cluster>) => void) | null = null;
  private onNetworkHealth: ((snapshot: NetworkHealthSnapshot) => void) | null = null;
  private onFileShared: ((file: SharedFile) => void) | null = null;
  private onFileChunk: ((fileId: string, chunkIndex: number, totalChunks: number, data: ArrayBuffer) => void) | null = null;
  private onScreenShare: ((isSharing: boolean, sharedBy: string, sharedByName: string, stream: MediaStream | null) => void) | null = null;
  private onReaction: ((reaction: Reaction) => void) | null = null;
  private onSlideChange: ((slideIndex: number) => void) | null = null;
  private onAnnotation: ((annotation: { type: string; x: number; y: number; data?: any }) => void) | null = null;
  private onCoHostUpdate: ((info: { peerId: string; isCoHost: boolean }) => void) | null = null;
  private onWaitingRoomUpdate: ((waitingList: Array<{ peerId: string; displayName: string; device: DeviceCapability | null }>) => void) | null = null;
  private onHandRaiseUpdate: ((info: { peerId: string; displayName: string; isRaised: boolean }) => void) | null = null;

  // Screen share state
  private screenShareStream: MediaStream | null = null;
  private isScreenSharing = false;
  private lastReactionTime = 0;

  // Co-host state
  private coHostIds: Set<string> = new Set();

  // Waiting room state
  private waitingRoomEnabled = false;
  private isInWaitingRoomState = false;
  private waitingList: Array<{ peerId: string; displayName: string; conn: DataConnection; joinPayload: any }> = [];

  // Attendance tracking
  private attendanceLog: Map<string, { joinedAt: number; lastSeenAt: number; leftAt: number | null; displayName: string }> = new Map();

  // Root architecture
  private rootSelectionTimer: ReturnType<typeof setInterval> | null = null;
  private rootNodes: Set<string> = new Set();       // Current root node peer IDs
  private subRootNodes: Set<string> = new Set();     // Current sub-root node peer IDs
  private hostActive = true;                         // Is the original host connected?
  private failoverHostPeerId: string | null = null;  // Current acting host after failover
  private hostDisconnectTime: number | null = null;  // When host disconnected
  private rootStreamBuffer: Map<string, Blob[]> = new Map(); // peerId → buffered stream chunks

  // Tree-Honeycomb architecture engine
  private honeycombEngine: TreeHoneycombEngine | null = null;

  // Attendance persistence timer
  private attendancePersistenceTimer: ReturnType<typeof setInterval> | null = null;

  // Worker proxy for offloading computations to web workers
  private workerProxy: any = null;

  // Low-bandwidth host support
  private hostUploadKbps: number = 10000; // Estimated host upload bandwidth
  private isLowBandwidthHost: boolean = false;
  private effectiveMaxRoots: number = ROOT_NODE_MAX; // Dynamically adjusted
  private hostBandwidthProbeTimer: ReturnType<typeof setInterval> | null = null;
  private scheduler: CoopScheduler = coopScheduler;

  /** Set a worker proxy to offload signaling/bandwidth calculations to web workers */
  setWorkerProxy(proxy: any) {
    this.workerProxy = proxy;
  }

  constructor() {
    this.myDevice = detectDevice();
    this.loadPeerJS();
  }

  private async loadPeerJS() {
    if (typeof window !== 'undefined') {
      const m = await import('peerjs');
      this.PeerJS = m.Peer;
    }
  }

  // ============ PEER CONFIG ============

  // PRIMARY: Use PeerJS cloud server (0.peerjs.com) as default
  private getPeerConfig() {
    return {
      debug: 1,
      config: { iceServers: ICE_SERVERS },
      host: '0.peerjs.com',
      port: 443,
      path: '/',
      secure: true,
    };
  }

  // FALLBACK: Same PeerJS cloud server with slight variation for retry
  private getPeerConfigFallback() {
    return {
      debug: 1,
      config: { iceServers: ICE_SERVERS },
      host: '0.peerjs.com',
      port: 443,
      path: '/',
      secure: true,
    };
  }

  // ============ MAP DESERIALIZATION ============
  // When roomInfo is sent via P2P, Map objects get serialized to plain objects.
  // This method converts them back to Maps when receiving room-info.

  private deserializeRoomInfo(data: any): RoomInfo {
    if (!data) return data;

    // Convert clusters from plain object back to Map
    let clusters: Map<string, Cluster>;
    if (data.clusters instanceof Map) {
      clusters = data.clusters;
    } else if (data.clusters && typeof data.clusters === 'object') {
      clusters = new Map(Object.entries(data.clusters) as [string, Cluster][]);
    } else {
      clusters = new Map();
    }

    return {
      ...data,
      clusters,
    };
  }

  // ============ HOST: CREATE ROOM ============

  async createRoom(hostName: string, title: string): Promise<RoomInfo> {
    await this.ensurePeerJS();
    const roomId = this.generateRoomId();
    const peerId = `fm-${roomId}-host`;

    return new Promise((resolve, reject) => {
      const tryConnect = (config: any, suffix = '') => {
        const pid = peerId + suffix;
        const p = new this.PeerJS(pid, config);

        const timeout = setTimeout(() => {
          try { p.destroy(); } catch {}
          if (config === this.getPeerConfig()) {
            tryConnect(this.getPeerConfigFallback(), '-fb');
          } else {
            reject(new Error('Could not connect to signaling server'));
          }
        }, PEER_CONNECT_TIMEOUT);

        p.on('open', (id: string) => {
          clearTimeout(timeout);
          resolve(this.initHost(id, hostName, title, roomId));
        });

        p.on('error', (err: any) => {
          clearTimeout(timeout);
          if (err.type === 'unavailable-id') {
            tryConnect(config, `-${Date.now()}`);
          } else if (config === this.getPeerConfig()) {
            tryConnect(this.getPeerConfigFallback(), '-fb');
          } else {
            reject(err);
          }
        });

        this.peer = p;
      };

      tryConnect(this.getPeerConfig());
    });
  }

  private initHost(peerId: string, hostName: string, title: string, roomId: string): RoomInfo {
    const rootClusterId = `cluster-root`;

    // Initialize Tree-Honeycomb engine for the host
    this.honeycombEngine = new TreeHoneycombEngine(peerId);

    this.myNode = this.createNode(peerId, hostName, 'host', 'supernode', null, 0, rootClusterId);
    this.myNode.isClusterHead = true;
    this.myNode.maxRelayCapacity = getMaxChildrenForDevice(this.myDevice);
    this.nodes.set(peerId, this.myNode);

    const rootCluster: Cluster = {
      clusterId: rootClusterId,
      headPeerId: peerId,
      parentClusterId: null,
      memberIds: [peerId],
      depth: 0,
      maxDepth: 6,
      totalViewers: 0,
      healthScore: 100,
      joinCount: 1,
      leaveCount: 0,
    };
    this.clusters.set(rootClusterId, rootCluster);

    this.roomInfo = {
      roomId,
      hostPeerId: peerId,
      hostName,
      createdAt: Date.now(),
      maxChildrenPerNode: this.myNode.maxRelayCapacity,
      title,
      clusters: this.clusters,
      totalParticipants: 1,
      peakParticipants: 1,
      totalJoins: 1,
      totalLeaves: 0,
      // Root architecture
      rootNodes: [],
      subRootNodes: [],
      hostActive: true,
      failoverHostPeerId: null,
    };

    // Enable waiting room by default
    this.waitingRoomEnabled = true;

    this.startAllTimers();
    this.setupHostListeners();
    this.saveToStorage();
    return this.roomInfo;
  }

  // ============ VIEWER: JOIN ROOM ============

  async joinRoom(roomId: string, displayName: string): Promise<RoomInfo> {
    await this.ensurePeerJS();
    const peerId = `fm-${roomId}-${this.generatePeerSuffix()}`;

    return new Promise((resolve, reject) => {
      const tryConnect = (config: any, suffix = '') => {
        const pid = peerId + suffix;
        const p = new this.PeerJS(pid, config);

        const timeout = setTimeout(() => {
          try { p.destroy(); } catch {}
          if (config === this.getPeerConfig()) {
            tryConnect(this.getPeerConfigFallback(), '-fb');
          } else {
            reject(new Error('Could not connect. Room may not exist.'));
          }
        }, PEER_CONNECT_TIMEOUT);

        p.on('open', (id: string) => {
          clearTimeout(timeout);
          this.initViewer(id, displayName, roomId, resolve, reject);
        });

        p.on('error', (err: any) => {
          clearTimeout(timeout);
          if (err.type === 'unavailable-id') {
            tryConnect(config, `-${Date.now()}`);
          } else if (config === this.getPeerConfig()) {
            tryConnect(this.getPeerConfigFallback(), '-fb');
          } else {
            reject(err);
          }
        });

        this.peer = p;
      };

      tryConnect(this.getPeerConfig());
    });
  }

  private initViewer(
    peerId: string, displayName: string, roomId: string,
    resolve: (v: RoomInfo) => void, reject: (e: any) => void
  ) {
    this.myNode = this.createNode(peerId, displayName, 'viewer', 'leaf', null, -1, '');
    this.myNode.maxRelayCapacity = getMaxChildrenForDevice(this.myDevice);
    this.nodes.set(peerId, this.myNode);

    const hostPeerId = `fm-${roomId}-host`;
    try {
      const hostConn = this.peer!.connect(hostPeerId, { reliable: true, serialization: 'json' });

      const timeout = setTimeout(() => {
        if (!hostConn.open) reject(new Error('Host unreachable. Check room ID.'));
      }, PEER_CONNECT_TIMEOUT);

      hostConn.on('open', () => {
        clearTimeout(timeout);
        this.parentConnection = hostConn;

        this.sendSignal(hostConn, {
          type: 'join-room',
          payload: {
            displayName,
            peerId,
            device: this.myDevice,
            maxRelayCapacity: this.myNode!.maxRelayCapacity,
          },
          senderId: peerId,
          senderName: displayName,
          roomId,
          timestamp: Date.now(),
        });

        hostConn.on('data', (d: any) => this.handleSignal(hostConn, d as SignalMessage));
        hostConn.on('close', () => this.handleParentDisconnect());
      });

      hostConn.on('error', (err: any) => {
        clearTimeout(timeout);
        reject(err);
      });
    } catch (e) { reject(e); }

    this.peer!.on('connection', (c: DataConnection) => this.handleIncomingChildConn(c));
    this.peer!.on('call', (c: MediaConnection) => this.handleIncomingCall(c));
    this.peer!.on('disconnected', () => {
      if (this.peer && !this.isDestroyed) try { this.peer.reconnect(); } catch {}
    });

    this.startAllTimers();
  }

  private setupHostListeners() {
    if (!this.peer) return;
    this.peer.on('connection', (c: DataConnection) => this.handleIncomingChildConn(c));
    this.peer.on('call', (c: MediaConnection) => this.handleIncomingCall(c));
    this.peer.on('disconnected', () => {
      if (this.peer && !this.isDestroyed) try { this.peer.reconnect(); } catch {}
    });
  }

  // ============ NODE CREATION ============

  private createNode(
    peerId: string, displayName: string, role: UserRole,
    clusterRole: ClusterRole, parentId: string | null, depth: number, clusterId: string
  ): TreeNode {
    return {
      peerId, displayName, role, clusterRole, parentId, depth, clusterId,
      status: 'connecting',
      childrenIds: [],
      isClusterHead: clusterRole === 'cluster-head' || clusterRole === 'supernode',
      backbonePeers: [],
      canRelay: clusterRole !== 'leaf' || getMaxChildrenForDevice(this.myDevice) >= 3,
      maxRelayCapacity: getMaxChildrenForDevice(this.myDevice),
      currentRelayLoad: 0,
      device: this.myDevice,
      bandwidth: {
        peerId, rttMs: 999, jitterMs: 0, estimatedDownKbps: 0, estimatedUpKbps: 0,
        packetLoss: 0, probeTimestamp: Date.now(), bytesSent: 0, bytesReceived: 0,
        availableBitrate: 0,
      },
      webrtcStats: null,
      lastHeartbeat: Date.now(),
      missedHeartbeats: 0,
      connectedAt: Date.now(),
      relaySuccessCount: 0,
      relayFailCount: 0,
      reconnectCount: 0,
      // Root architecture (invisible to users)
      isRoot: false,
      isSubRoot: false,
      rootPriority: 0,
      streamBufferMs: 0,
    };
  }

  // ============ CONNECTION HANDLERS ============

  private handleIncomingChildConn(conn: DataConnection) {
    const timeout = setTimeout(() => { if (!conn.open) try { conn.close(); } catch {} }, PEER_CONNECT_TIMEOUT);

    conn.on('open', () => {
      clearTimeout(timeout);
      conn.on('data', (d: any) => this.handleSignal(conn, d as SignalMessage));
      conn.on('close', () => this.handleChildDisconnect(conn.peer));
      conn.on('error', () => {});

      // If this peer is one of our assigned children, store the connection
      if (this.myNode && this.myNode.childrenIds.includes(conn.peer)) {
        this.childConnections.set(conn.peer, conn);
      }
    });
  }

  private handleIncomingCall(call: MediaConnection) {
    call.on('stream', (remoteStream: MediaStream) => {
      this.incomingStream = remoteStream;
      this.lastStreamActivity = Date.now();
      this.monitorStream(remoteStream, call.peer);
      this.relayStreamToChildren(remoteStream, call.peer);
      if (this.onStreamUpdate) this.onStreamUpdate(remoteStream, call.peer);
    });
    call.on('close', () => this.mediaConnections.delete(call.peer));
    call.on('error', () => this.mediaConnections.delete(call.peer));
    call.answer();
    this.mediaConnections.set(call.peer, call);
  }

  // ============ BANDWIDTH-AWARE RELAY SELECTION ============
  // IMPROVED v3: Weighted random selection among top N candidates
  // This prevents the "hot relay" problem where one node gets all children

  private selectBestRelay(newNodeDevice: DeviceCapability): TreeNode | null {
    if (!this.myNode) return null;

    // Collect all eligible relay candidates
    const candidates: { node: TreeNode; score: number }[] = [];

    this.nodes.forEach((node) => {
      if (!node.canRelay) return;
      if (node.currentRelayLoad >= node.maxRelayCapacity) return;
      if (node.status !== 'connected') return;
      if (node.depth >= 7) return;

      const score = this.calculateRelayScore(node, newNodeDevice);
      candidates.push({ node, score });
    });

    if (candidates.length === 0) return null;

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Take top N candidates
    const topN = candidates.slice(0, MULTI_PATH_CANDIDATES);
    if (topN.length === 1) return topN[0].node;

    // Use load-balanced selection — pick from top N with weighted probability
    // Weight by (1 - loadRatio²) * score to favor less-loaded good relays
    const weights = topN.map(c => {
      const loadRatio = c.node.currentRelayLoad / Math.max(1, c.node.maxRelayCapacity);
      return Math.max(0.1, (1 - loadRatio * loadRatio) * (c.score + 100));
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < topN.length; i++) {
      random -= weights[i];
      if (random <= 0) return topN[i].node;
    }

    return topN[0].node;
  }

  private calculateRelayScore(node: TreeNode, _newNodeDevice: DeviceCapability): number {
    const bw = node.bandwidth;

    // 1. BANDWIDTH SCORE (40% weight) — uses WebRTC stats if available
    const rttScore = Math.max(0, 100 - bw.rttMs);
    const upScore = Math.min(100, bw.estimatedUpKbps / 25);
    const bitrateScore = Math.min(100, bw.availableBitrate / 30);
    const bandwidthScore = (rttScore * 0.3 + upScore * 0.3 + bitrateScore * 0.4);

    // 2. LOAD SCORE (30% weight) — quadratic penalty for high load
    const loadRatio = node.currentRelayLoad / Math.max(1, node.maxRelayCapacity);
    const loadScore = (1 - loadRatio * loadRatio) * 100;

    // 3. DEPTH SCORE (20% weight)
    const depthScore = Math.max(0, 100 - node.depth * 15);

    // 4. DEVICE SCORE (10% weight) — improved mobile-high support
    let deviceScore = 50;
    if (node.device.deviceType === 'desktop-high') deviceScore = 100;
    else if (node.device.deviceType === 'desktop') deviceScore = 80;
    else if (node.device.deviceType === 'tablet') deviceScore = 60;
    else if (node.device.deviceType === 'mobile-high') deviceScore = 50;
    else deviceScore = 30;

    // 5. HEALTH BONUS
    const healthBonus = (node.relaySuccessCount - node.relayFailCount * 3) * 2;

    // 6. CLUSTER HEAD BONUS
    const clusterBonus = node.isClusterHead ? 15 : 0;

    // 7. STABILITY BONUS — nodes that have been connected longer are more reliable
    const uptimeMin = (Date.now() - node.connectedAt) / 60000;
    const stabilityBonus = Math.min(15, uptimeMin * 2);

    return bandwidthScore * 0.4 + loadScore * 0.3 + depthScore * 0.2 +
           deviceScore * 0.1 + healthBonus + clusterBonus + stabilityBonus;
  }

  // ============ JOIN RATE THROTTLING ============
  // Prevents overload when 50+ users try to join simultaneously

  private checkJoinRate(): boolean {
    const now = Date.now();
    this.recentJoins = this.recentJoins.filter(t => now - t < JOIN_RATE_WINDOW);
    return this.recentJoins.length < MAX_JOIN_RATE;
  }

  private recordJoin() {
    const now = Date.now();
    this.recentJoins.push(now);
    if (this.roomInfo) {
      this.roomInfo.totalJoins++;
      this.roomInfo.totalParticipants = this.nodes.size;
      this.roomInfo.peakParticipants = Math.max(this.roomInfo.peakParticipants, this.nodes.size);
    }
  }

  private recordLeave() {
    const now = Date.now();
    this.recentLeaves.push(now);
    if (this.roomInfo) {
      this.roomInfo.totalLeaves++;
      this.roomInfo.totalParticipants = this.nodes.size;
    }
  }

  // ============ AUTO-RELAY PROMOTION ============
  // When a viewer has excellent bandwidth, promote them to relay automatically

  private maybePromoteToRelay(node: TreeNode): boolean {
    if (!node.canRelay || node.isClusterHead) return false;
    if (node.clusterRole === 'relay' || node.clusterRole === 'cluster-head') return false;

    const bw = node.bandwidth;
    const isHighBandwidth = bw.estimatedUpKbps > 1500 && bw.rttMs < 150;
    const isDesktop = !node.device.isMobile;
    const hasCapacity = node.maxRelayCapacity >= 4;

    if ((isHighBandwidth && isDesktop) || (isHighBandwidth && hasCapacity)) {
      node.clusterRole = 'relay';
      node.canRelay = true;
      this.nodes.set(node.peerId, node);

      // Notify the node it's been promoted
      const conn = this.childConnections.get(node.peerId);
      if (conn && this.myNode && this.roomInfo) {
        this.sendSignal(conn, {
          type: 'relay-promote',
          payload: { clusterRole: 'relay', canRelay: true },
          senderId: this.myNode.peerId, senderName: this.myNode.displayName,
          roomId: this.roomInfo.roomId, timestamp: Date.now(),
        });
      }
      return true;
    }
    return false;
  }

  // ============ CLUSTER MANAGEMENT ============

  private maybeSpawnCluster(parentNode: TreeNode): string | null {
    const cluster = this.findClusterByMember(parentNode.peerId);
    if (!cluster) return null;
    if (cluster.memberIds.length < CLUSTER_MAX_MEMBERS) return null;

    let bestChild: TreeNode | null = null;
    let bestScore = -Infinity;

    for (const childId of parentNode.childrenIds) {
      const child = this.nodes.get(childId);
      if (!child || !child.canRelay) continue;
      const score = this.calculateRelayScore(child, child.device);
      if (score > bestScore) { bestScore = score; bestChild = child; }
    }

    if (!bestChild) return null;

    const newClusterId = `cluster-${Date.now()}`;
    bestChild.clusterRole = 'cluster-head';
    bestChild.isClusterHead = true;
    bestChild.clusterId = newClusterId;
    this.nodes.set(bestChild.peerId, bestChild);

    const newCluster: Cluster = {
      clusterId: newClusterId,
      headPeerId: bestChild.peerId,
      parentClusterId: cluster.clusterId,
      memberIds: [bestChild.peerId],
      depth: cluster.depth + 1,
      maxDepth: 6,
      totalViewers: 0,
      healthScore: 100,
      joinCount: 0,
      leaveCount: 0,
    };
    this.clusters.set(newClusterId, newCluster);

    const membersToMove = parentNode.childrenIds
      .filter(id => id !== bestChild.peerId)
      .slice(0, Math.floor(parentNode.childrenIds.length / 2));

    for (const memberId of membersToMove) {
      const member = this.nodes.get(memberId);
      if (member) {
        member.clusterId = newClusterId;
        member.parentId = bestChild.peerId;
        member.depth = bestChild.depth + 1;
        this.nodes.set(memberId, member);
        newCluster.memberIds.push(memberId);

        if (cluster.memberIds.includes(memberId)) {
          cluster.memberIds = cluster.memberIds.filter(id => id !== memberId);
        }

        const conn = this.childConnections.get(memberId);
        if (conn && this.myNode && this.roomInfo) {
          this.sendSignal(conn, {
            type: 'cluster-assign',
            payload: { clusterId: newClusterId, headPeerId: bestChild.peerId },
            senderId: this.myNode.peerId, senderName: this.myNode.displayName,
            roomId: this.roomInfo.roomId, timestamp: Date.now(),
          });
        }
      }
    }

    const headConn = this.childConnections.get(bestChild.peerId);
    if (headConn && this.myNode && this.roomInfo) {
      this.sendSignal(headConn, {
        type: 'new-cluster-head',
        payload: { clusterId: newClusterId, memberIds: newCluster.memberIds },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now(),
      });
    }

    if (this.onClusterUpdate) this.onClusterUpdate(this.clusters);
    return newClusterId;
  }

  private findClusterByMember(peerId: string): Cluster | null {
    for (const [, cluster] of this.clusters) {
      if (cluster.memberIds.includes(peerId)) return cluster;
    }
    return null;
  }

  // ============ SIGNAL HANDLING ============

  private handleSignal(conn: DataConnection, msg: SignalMessage) {
    // If workerProxy is available, offload stale message check to worker
    if (this.workerProxy?.processSignalBatch) {
      // Worker will handle stale filtering; we still process immediately
      // but benefit from batch dedup for high-volume scenarios
      if (Date.now() - msg.timestamp > 60000) return;
    } else {
      if (Date.now() - msg.timestamp > 60000) return;
    }

    if (!this.myNode || !this.roomInfo) {
      if (msg.type === 'room-info') {
        this.roomInfo = this.deserializeRoomInfo(msg.payload);
        if (this.myNode) this.myNode.status = 'connected';
        if (this.onConnectionStatus) this.onConnectionStatus('connected');
        this.saveToStorage();
        return;
      }
      return;
    }

    switch (msg.type) {
      case 'join-room': this.handleJoinRoom(conn, msg); break;
      case 'room-info':
        this.roomInfo = this.deserializeRoomInfo(msg.payload);
        if (this.myNode) this.myNode.status = 'connected';
        if (msg.payload.isWaiting) {
          // We're in the waiting room — don't fully connect
          this.isInWaitingRoomState = true;
          if (this.onConnectionStatus) this.onConnectionStatus('connected');
        } else {
          if (this.onConnectionStatus) this.onConnectionStatus('connected');
        }
        this.saveToStorage();
        break;
      case 'parent-assigned': this.handleParentAssigned(msg); break;
      case 'assign-parent': this.handleAssignParent(msg); break;
      case 'reassign-parent': this.handleReassignParent(msg); break;
      case 'request-stream': this.handleRequestStream(conn, msg); break;
      case 'stream-reset': this.handleStreamReset(conn, msg); break;
      case 'stream-quality-update': break;
      case 'chat-message': this.handleChatMessage(msg); break;
      case 'chat-broadcast': this.handleChatBroadcast(msg); break;
      case 'speaker-request': this.handleSpeakerRequestMsg(msg); break;
      case 'speaker-approved': this.handleSpeakerApproved(msg); break;
      case 'speaker-denied': if (this.onError) this.onError('Speaker request denied'); break;
      case 'mute-speaker': this.handleMuteSpeaker(msg); break;
      case 'node-disconnect': this.handleChildDisconnect(msg.senderId); break;
      case 'leave-room': this.handleChildDisconnect(msg.senderId); break;
      case 'heartbeat': this.handleHeartbeat(conn, msg); break;
      case 'heartbeat-ack': this.handleHeartbeatAck(msg); break;
      case 'tree-update': this.handleTreeUpdate(msg); break;
      case 'participant-update':
        if (this.onParticipantUpdate) this.onParticipantUpdate(new Map(Object.entries(msg.payload)));
        // Forward to children through tree
        this.broadcastToChildren(msg);
        break;
      case 'ping': this.handlePing(conn, msg); break;
      case 'pong': this.handlePong(msg); break;
      case 'bandwidth-report': this.handleBandwidthReport(msg); break;
      case 'device-report': this.handleDeviceReport(msg); break;
      case 'cluster-assign': this.handleClusterAssign(msg); break;
      case 'cluster-update':
        if (this.onClusterUpdate) this.onClusterUpdate(new Map(Object.entries(msg.payload) as any));
        // Forward to children through tree
        this.broadcastToChildren(msg);
        break;
      case 'new-cluster-head': this.handleNewClusterHead(msg); break;
      case 'proxy-request': this.handleProxyRequest(conn, msg); break;
      case 'proxy-accept': this.handleProxyAccept(msg); break;
      case 'proxy-relay': this.handleProxyRelay(msg); break;
      case 'quality-adapt': this.handleQualityAdapt(msg); break;
      case 'webrtc-stats-report': this.handleWebRTCStatsReport(msg); break;
      case 'relay-promote': this.handleRelayPromote(msg); break;
      case 'relay-demote': this.handleRelayDemote(msg); break;
      case 'file-share-announce': this.handleFileShareAnnounce(msg); break;
      case 'file-chunk': this.handleFileChunk(msg); break;
      case 'file-request': this.handleFileRequest(conn, msg); break;
      case 'screen-share-start': this.handleScreenShareStart(msg); break;
      case 'screen-share-stop': this.handleScreenShareStop(msg); break;
      case 'reaction': this.handleReaction(msg); break;
      case 'root-promote': this.handleRootPromote(msg); break;
      case 'root-demote': this.handleRootDemote(msg); break;
      case 'root-failover': this.handleRootFailoverMsg(msg); break;
      case 'root-heartbeat': this.handleRootHeartbeat(msg); break;
      case 'stream-buffer-sync': this.handleStreamBufferSync(msg); break;
      case 'hand-raise': this.handleHandRaiseSignal(msg); break;
      case 'hand-lower': this.handleHandLowerSignal(msg); break;
      case 'waiting-join': this.handleWaitingJoin(msg); break;
      case 'waiting-admit': this.handleWaitingAdmit(msg); break;
      case 'waiting-deny': this.handleWaitingDeny(msg); break;
      case 'moderation-action': this.handleModerationAction(msg); break;
      case 'room-lock': this.handleRoomLock(msg); break;
      case 'room-unlock': this.handleRoomUnlock(msg); break;
      case 'stream-relay': this.handleStreamRelay(msg); break;
      case 'backup-parent-assign': this.handleBackupParentAssign(msg); break;
      case 'slide-change': this.handleSlideChange(msg); break;
      case 'slide-broadcast': this.handleSlideChange(msg); break;
      case 'annotation-update': this.handleAnnotationUpdate(msg); break;
      case 'co-host-assign': this.handleCoHostAssign(msg); break;
      case 'co-host-revoke': this.handleCoHostRevoke(msg); break;
      default:
        console.warn('[FractalMesh] Unhandled signal type:', msg.type);
    }
  }

  // ============ JOIN ROOM (HOST) ============

  private handleJoinRoom(conn: DataConnection, msg: SignalMessage) {
    if (!this.roomInfo || !this.myNode) return;

    // Check if room is locked
    if ((this.roomInfo as any).isLocked) {
      this.sendSignal(conn, { type: 'room-info', payload: { error: 'Room is locked' },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now() });
      return;
    }

    // Check if waiting room is enabled
    if (this.waitingRoomEnabled) {
      const { displayName, peerId } = msg.payload;
      // Add to waiting list instead of processing immediately
      this.waitingList.push({
        peerId,
        displayName,
        conn,
        joinPayload: msg.payload,
      });
      // Notify the viewer they're in the waiting room
      this.sendSignal(conn, {
        type: 'waiting-join',
        payload: { peerId, displayName, status: 'waiting' },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now(),
      });
      // ALSO send room-info so the viewer can display the waiting screen
      // with room title and host name, but mark it as waiting state
      const roomInfoCopy = { ...this.roomInfo! };
      if (roomInfoCopy.clusters instanceof Map) {
        roomInfoCopy.clusters = Object.fromEntries(roomInfoCopy.clusters) as any;
      }
      this.sendSignal(conn, {
        type: 'room-info',
        payload: { ...roomInfoCopy, isWaiting: true },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now(),
      });
      // Notify UI
      if (this.onWaitingRoomUpdate) {
        this.onWaitingRoomUpdate(this.waitingList.map(w => ({ peerId: w.peerId, displayName: w.displayName, device: w.joinPayload?.device || null })));
      }
      return;
    }

    this.processJoinRoom(conn, msg.payload);
  }

  /** Extracted join processing logic — called from handleJoinRoom or admitFromWaitingRoom */
  private processJoinRoom(conn: DataConnection, payload: any) {
    if (!this.roomInfo || !this.myNode) return;

    // Join rate throttling for 700-user stability
    if (!this.checkJoinRate()) {
      // Queue the join — don't reject, just delay
      setTimeout(() => this.processJoinRoom(conn, payload), 500);
      return;
    }

    if (this.nodes.size >= MAX_PARTICIPANTS) {
      this.sendSignal(conn, { type: 'room-info', payload: { error: 'Room full' },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now() });
      return;
    }

    const { displayName, peerId, device, maxRelayCapacity } = payload;

    const bestRelay = this.selectBestRelay(device || this.myDevice);
    const parentNode = bestRelay || this.myNode;
    const depth = parentNode.depth + 1;
    const clusterId = parentNode.clusterId;

    const canRelay = (maxRelayCapacity || 3) >= 3;
    const clusterRole: ClusterRole = canRelay ? 'relay' : 'leaf';

    const newNode = this.createNode(peerId, displayName, 'viewer', clusterRole, parentNode.peerId, depth, clusterId);
    if (device) {
      newNode.device = device;
      newNode.maxRelayCapacity = maxRelayCapacity || getMaxChildrenForDevice(device);
      newNode.canRelay = newNode.maxRelayCapacity >= 3;
    }

    parentNode.childrenIds.push(peerId);
    parentNode.currentRelayLoad = parentNode.childrenIds.length;
    this.nodes.set(parentNode.peerId, parentNode);
    newNode.clusterId = parentNode.clusterId;

    this.nodes.set(peerId, newNode);
    this.childConnections.set(peerId, conn);

    const cluster = this.clusters.get(clusterId);
    if (cluster) {
      cluster.memberIds.push(peerId);
      cluster.joinCount++;
      this.clusters.set(clusterId, cluster);
    }

    this.recordJoin();

    // Attendance tracking
    this.attendanceLog.set(peerId, {
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      leftAt: null,
      displayName: displayName,
    });

    // Before sending roomInfo, convert Map to object for JSON serialization
    if (this.roomInfo && this.roomInfo.clusters instanceof Map) {
      this.roomInfo = {
        ...this.roomInfo,
        clusters: Object.fromEntries(this.roomInfo.clusters) as any
      };
    }

    this.sendSignal(conn, {
      type: 'room-info', payload: this.roomInfo,
      senderId: this.myNode.peerId, senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId, timestamp: Date.now(),
    });

    this.sendSignal(conn, {
      type: 'parent-assigned',
      payload: { parentId: parentNode.peerId, depth, clusterId,
        parentDisplayName: parentNode.displayName },
      senderId: this.myNode.peerId, senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId, timestamp: Date.now(),
    });

    if (parentNode.peerId !== this.myNode.peerId) {
      const parentConn = this.childConnections.get(parentNode.peerId);
      if (parentConn) {
        this.sendSignal(parentConn, {
          type: 'assign-parent',
          payload: { childPeerId: peerId, childDisplayName: displayName },
          senderId: this.myNode.peerId, senderName: this.myNode.displayName,
          roomId: this.roomInfo.roomId, timestamp: Date.now(),
        });
      }

      this.sendSignal(conn, {
        type: 'reassign-parent',
        payload: { newParentId: parentNode.peerId },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now(),
      });

      // CLOSE the host's direct data channel to this viewer since
      // they'll communicate through the relay tree now
      // The host only needs connections to its direct children
      this.childConnections.delete(peerId);
      try { conn.close(); } catch {}
    } else {
      // Direct child of host — enforce host branching factor limit
      const directChildren = this.myNode.childrenIds.length;
      if (directChildren > this.myNode.maxRelayCapacity) {
        // Force assignment to a relay instead
        const altRelay = this.selectBestRelay(device || this.myDevice);
        if (altRelay && altRelay.peerId !== this.myNode.peerId) {
          // Reassign to the alternative relay
          this.myNode.childrenIds = this.myNode.childrenIds.filter(id => id !== peerId);
          this.myNode.currentRelayLoad = this.myNode.childrenIds.length;
          altRelay.childrenIds.push(peerId);
          altRelay.currentRelayLoad = altRelay.childrenIds.length;
          this.nodes.set(altRelay.peerId, altRelay);
          newNode.parentId = altRelay.peerId;
          newNode.depth = altRelay.depth + 1;
          this.nodes.set(peerId, newNode);

          const altConn = this.childConnections.get(altRelay.peerId);
          if (altConn) {
            this.sendSignal(altConn, {
              type: 'assign-parent',
              payload: { childPeerId: peerId, childDisplayName: displayName },
              senderId: this.myNode.peerId, senderName: this.myNode.displayName,
              roomId: this.roomInfo.roomId, timestamp: Date.now(),
            });
          }

          this.sendSignal(conn, {
            type: 'reassign-parent',
            payload: { newParentId: altRelay.peerId },
            senderId: this.myNode.peerId, senderName: this.myNode.displayName,
            roomId: this.roomInfo.roomId, timestamp: Date.now(),
          });

          this.childConnections.delete(peerId);
          try { conn.close(); } catch {}
        }
      }
      if (this.localStream) {
        this.callNodeWithStream(peerId, this.localStream);
      }
    }

    this.maybeSpawnCluster(parentNode);

    // Tree-Honeycomb: assign viewer to a honeycomb cell
    if (this.honeycombEngine) {
      const result = this.honeycombEngine.assignViewerToCell(peerId);
      if (result.needsNewCell && bestRelay) {
        this.honeycombEngine.createCell(bestRelay.peerId, [peerId]);
      }
    }

    // ALL devices start at 720p — quality adapts based on real network conditions
    const qualityProfile = QUALITY_PROFILES[newNode.device.deviceType] || QUALITY_PROFILES['unknown'];
    this.sendSignal(conn, {
      type: 'quality-adapt',
      payload: {
        quality: 'high',    // Everyone starts at 720p
        profile: qualityProfile,
      },
      senderId: this.myNode.peerId, senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId, timestamp: Date.now(),
    });

    this.broadcastTreeUpdate();
    this.broadcastParticipantUpdate();
    this.broadcastClusterUpdate();
  }

  // ============ PARENT ASSIGNMENT (VIEWER) ============

  private handleParentAssigned(msg: SignalMessage) {
    if (!this.myNode) return;
    const { parentId, depth, clusterId } = msg.payload;
    this.myNode.parentId = parentId;
    this.myNode.depth = depth;
    this.myNode.clusterId = clusterId || this.myNode.clusterId;
    this.myNode.status = 'connected';
    this.nodes.set(this.myNode.peerId, this.myNode);

    if (this.parentConnection && this.parentConnection.peer === parentId) {
      this.requestStreamFromParent();
    }
    if (this.onTreeUpdate) this.onTreeUpdate(this.nodes);
  }

  private handleReassignParent(msg: SignalMessage) {
    if (!this.myNode || !this.peer) return;
    const { newParentId } = msg.payload;

    // Close old parent connection if exists
    if (this.parentConnection) {
      try { this.parentConnection.close(); } catch {}
    }

    const conn = this.peer.connect(newParentId, { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      conn.on('data', (d: any) => this.handleSignal(conn, d as SignalMessage));
      conn.on('close', () => this.handleParentDisconnect());

      // Store as PARENT connection, not child connection
      this.parentConnection = conn;
      this.myNode!.parentId = newParentId;
      this.nodes.set(this.myNode!.peerId, this.myNode!);

      this.sendSignal(conn, {
        type: 'request-stream', payload: {},
        senderId: this.myNode!.peerId, senderName: this.myNode!.displayName,
        roomId: this.roomInfo?.roomId || '', timestamp: Date.now(),
      });

      // Setup backup parent after connecting to primary
      this.establishBackupParent();
    });
    conn.on('error', () => this.attemptReconnect());
  }

  private handleAssignParent(msg: SignalMessage) {
    if (!this.myNode) return;
    const { childPeerId, childDisplayName } = msg.payload;

    const childNode = this.createNode(childPeerId, childDisplayName, 'viewer', 'relay',
      this.myNode.peerId, this.myNode.depth + 1, this.myNode.clusterId);

    this.nodes.set(childPeerId, childNode);
    this.myNode.childrenIds.push(childPeerId);
    this.myNode.currentRelayLoad = this.myNode.childrenIds.length;
    this.nodes.set(this.myNode.peerId, this.myNode);

    // If we have a stream, relay it to this new child
    const stream = this.incomingStream || this.localStream;
    if (stream) this.callNodeWithStream(childPeerId, stream);

    if (this.onTreeUpdate) this.onTreeUpdate(this.nodes);
  }

  // ============ STREAM MANAGEMENT ============

  private handleRequestStream(conn: DataConnection, msg: SignalMessage) {
    const stream = this.incomingStream || this.localStream;
    if (stream) this.callNodeWithStream(msg.senderId, stream);
  }

  private handleStreamReset(conn: DataConnection, msg: SignalMessage) {
    const stream = this.localStream || this.incomingStream;
    if (stream) this.callNodeWithStream(msg.senderId, stream);
  }

  private callNodeWithStream(peerId: string, stream: MediaStream) {
    if (!this.peer) return;
    try {
      const existing = this.mediaConnections.get(peerId);
      if (existing) try { existing.close(); } catch {}
      this.mediaConnections.delete(peerId);

      const call = this.peer.call(peerId, stream);
      if (call) {
        this.mediaConnections.set(peerId, call);
        call.on('close', () => this.mediaConnections.delete(peerId));
        call.on('error', () => {
          this.mediaConnections.delete(peerId);
          const n = this.nodes.get(peerId);
          if (n) { n.relayFailCount++; this.nodes.set(peerId, n); }
        });
        const n = this.nodes.get(peerId);
        if (n) { n.relaySuccessCount++; this.nodes.set(peerId, n); }
      }
    } catch {
      const n = this.nodes.get(peerId);
      if (n) { n.relayFailCount++; this.nodes.set(peerId, n); }
    }
  }

  private relayStreamToChildren(stream: MediaStream, sourcePeerId: string) {
    if (!this.myNode) return;
    for (const childId of this.myNode.childrenIds) {
      if (childId !== sourcePeerId) this.callNodeWithStream(childId, stream);
    }
  }

  private requestStreamFromParent() {
    if (!this.parentConnection || !this.myNode) return;
    this.sendSignal(this.parentConnection, {
      type: 'request-stream', payload: {},
      senderId: this.myNode.peerId, senderName: this.myNode.displayName,
      roomId: this.roomInfo?.roomId || '', timestamp: Date.now(),
    });
  }

  private monitorStream(stream: MediaStream, fromPeerId: string) {
    const tracks = [...stream.getVideoTracks(), ...stream.getAudioTracks()];
    tracks.forEach(track => {
      track.onended = () => { this.lastStreamActivity = 0; };
      track.onunmute = () => { this.lastStreamActivity = Date.now(); };
    });
    this.lastStreamActivity = Date.now();
  }

  // ============ ADAPTIVE QUALITY ============

  private handleQualityAdapt(msg: SignalMessage) {
    const { quality, profile } = msg.payload;
    this.currentQuality = quality;
    if (this.localStream && profile) {
      const vt = this.localStream.getVideoTracks()[0];
      if (vt) {
        vt.applyConstraints({
          width: { ideal: profile.width },
          height: { ideal: profile.height },
          frameRate: { ideal: profile.fps },
        }).catch(() => {});
      }
    }
  }

  // Dynamic quality adaptation based on WebRTC stats
  // Stability-first: prefer staying at current quality to prevent flapping/breaks
  private adaptQualityFromStats() {
    if (!this.myNode || !this.roomInfo) return;
    if (this.myNode.role !== 'host' && this.myNode.role !== 'speaker') return;

    const stats = this.myNode.webrtcStats;
    if (!stats) return;

    const now = Date.now();
    const qualityLevel = getAdaptiveQualityLevel(
      stats.bitrate / 1000,  // Convert bps to kbps
      stats.packetsSent > 0 ? stats.packetsLost / stats.packetsSent : 0,
      stats.currentRoundTripTime * 1000 || this.myDevice.rttMs,
      this.myDevice
    );

    // STABILITY SAFEGUARD: Prevent quality flapping
    // Don't change quality too frequently
    const timeSinceLastChange = now - this.lastQualityChangeTime;
    const isDowngrade = this.getQualityRank(qualityLevel.name) > this.getQualityRank(this.currentQualityName);
    const isUpgrade = this.getQualityRank(qualityLevel.name) < this.getQualityRank(this.currentQualityName);

    // For upgrades, enforce a cooldown to prevent flapping
    if (isUpgrade && timeSinceLastChange < QUALITY_UPGRADE_COOLDOWN) {
      return; // Too soon to upgrade — stay at current quality for stability
    }

    // For downgrades, also enforce minimum duration at current quality
    if (isDowngrade && timeSinceLastChange < QUALITY_DOWNGRADE_MIN_DURATION / 4) {
      return; // Stay a bit longer before degrading — network might recover
    }

    // Apply quality change
    if (this.localStream && qualityLevel.height > 0) {
      const vt = this.localStream.getVideoTracks()[0];
      if (vt) {
        vt.applyConstraints({
          width: { ideal: qualityLevel.width },
          height: { ideal: qualityLevel.height },
          frameRate: { ideal: qualityLevel.fps },
        }).catch(() => {});
      }
    }

    if (qualityLevel.name !== this.currentQualityName) {
      this.lastQualityChangeTime = now;
      this.currentQualityName = qualityLevel.name;
    }
    this.currentQuality = qualityLevel.name;
  }

  // Quality rank for comparison (lower = better)
  private getQualityRank(quality: StreamQuality): number {
    switch (quality) {
      case 'high': return 0;
      case 'auto': return 1;
      case 'medium': return 2;
      case 'low': return 3;
      case 'audio-only': return 4;
      default: return 2;
    }
  }

  // ============ WEBRTC STATS COLLECTION ============

  private collectWebRTCStats() {
    if (!this.myNode || this.isDestroyed) return;

    // Collect stats from our media connections
    this.mediaConnections.forEach(async (call: any, peerId: string) => {
      try {
        const pc: RTCPeerConnection = call.peerConnection;
        if (!pc) return;

        const stats = await pc.getStats();
        let bytesSent = 0, bytesReceived = 0, packetsLost = 0, packetsSent = 0, packetsReceived = 0;
        let currentRTT = 0, availableBitrate = 0, fps = 0, frameW = 0, frameH = 0;
        let nackCount = 0, pliCount = 0, jitter = 0;

        stats.forEach((report: any) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            bytesSent = report.bytesSent || 0;
            packetsSent = report.packetsSent || 0;
            fps = report.framesPerSecond || 0;
            frameW = report.frameWidth || 0;
            frameH = report.frameHeight || 0;
            nackCount = report.nackCount || 0;
            pliCount = report.pliCount || 0;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            bytesReceived = report.bytesReceived || 0;
            packetsReceived = report.packetsReceived || 0;
            packetsLost = report.packetsLost || 0;
            jitter = report.jitter || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            currentRTT = report.currentRoundTripTime || 0;
            availableBitrate = report.availableOutgoingBitrate || 0;
          }
          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            bytesSent += report.bytesSent || 0;
            packetsSent += report.packetsSent || 0;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            bytesReceived += report.bytesReceived || 0;
            packetsReceived += report.packetsReceived || 0;
          }
        });

        const prev = this.prevStats.get(peerId);
        let bitrate = 0;
        if (prev) {
          const timeDelta = (Date.now() - prev.timestamp) / 1000;
          if (timeDelta > 0) bitrate = ((bytesSent - prev.bytesSent) * 8) / timeDelta;
        }

        const webrtcStats: WebRTCStats = {
          timestamp: Date.now(),
          bytesSent, bytesReceived, packetsLost, packetsSent, packetsReceived,
          currentRoundTripTime: currentRTT,
          availableOutgoingBitrate: availableBitrate,
          framesPerSecond: fps,
          frameWidth: frameW, frameHeight: frameH,
          bitrate, nackCount, pliCount, jitter,
        };

        this.prevStats.set(peerId, webrtcStats);

        // Report to host (if we're a viewer/relay)
        if (this.myNode && this.myNode.role !== 'host' && this.parentConnection && this.roomInfo) {
          this.sendSignal(this.parentConnection, {
            type: 'webrtc-stats-report',
            payload: { peerId: this.myNode.peerId, stats: webrtcStats },
            senderId: this.myNode.peerId, senderName: this.myNode.displayName,
            roomId: this.roomInfo.roomId, timestamp: Date.now(),
          });
        }

        // If host, update our own node stats
        if (this.myNode && this.myNode.role === 'host') {
          this.myNode.webrtcStats = webrtcStats;
          this.nodes.set(this.myNode.peerId, this.myNode);
        }
      } catch {}
    });
  }

  private applyAdaptiveQuality(node: TreeNode | undefined, stats: WebRTCStats) {
    if (!node || !this.myNode || !this.roomInfo) return;
    if (this.myNode.role !== 'host') return;

    const packetLoss = stats.packetsSent > 0 ? stats.packetsLost / stats.packetsSent : 0;
    const bitrateKbps = stats.bitrate / 1000;

    // STABILITY SAFEGUARD: If bitrate is critically low, force audio-only to prevent total break
    if (bitrateKbps < STREAM_MIN_BITRATE_KBPS && packetLoss > 0.2) {
      const conn = this.childConnections.get(node.peerId);
      if (conn) {
        this.sendSignal(conn, {
          type: 'quality-adapt',
          payload: { quality: 'audio-only', profile: DYNAMIC_QUALITY_LEVELS[3] },
          senderId: this.myNode.peerId, senderName: this.myNode.displayName,
          roomId: this.roomInfo.roomId, timestamp: Date.now(),
        });
      }
      return;
    }

    const qualityLevel = getAdaptiveQualityLevel(
      bitrateKbps,
      packetLoss,
      stats.currentRoundTripTime * 1000,
      node.device,
    );

    // STABILITY: Don't send quality changes too frequently to a node
    const conn = this.childConnections.get(node.peerId);
    if (conn && qualityLevel.name !== this.currentQuality) {
      this.sendSignal(conn, {
        type: 'quality-adapt',
        payload: { quality: qualityLevel.name, profile: qualityLevel },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now(),
      });
    }
  }

  private handleWebRTCStatsReport(msg: SignalMessage) {
    const { peerId, stats } = msg.payload;
    const node = this.nodes.get(peerId);
    if (node) {
      node.webrtcStats = stats as WebRTCStats;
      this.nodes.set(peerId, node);

      if (stats.bitrate) {
        node.bandwidth.estimatedUpKbps = stats.bitrate / 1000;
        node.bandwidth.availableBitrate = stats.availableOutgoingBitrate;
      }

      if (node.clusterRole === 'leaf' && this.maybePromoteToRelay(node)) {
        this.broadcastTreeUpdate();
      }
    }
  }

  private handleRelayPromote(msg: SignalMessage) {
    if (!this.myNode) return;
    this.myNode.clusterRole = 'relay';
    this.myNode.canRelay = true;
    this.nodes.set(this.myNode.peerId, this.myNode);
    if (this.onTreeUpdate) this.onTreeUpdate(this.nodes);
  }

  private handleRelayDemote(_msg: SignalMessage) {
    if (!this.myNode) return;
    this.myNode.clusterRole = 'leaf';
    this.myNode.canRelay = false;
    this.nodes.set(this.myNode.peerId, this.myNode);
    if (this.onTreeUpdate) this.onTreeUpdate(this.nodes);
  }

  // ============ BANDWIDTH PROBING ============

  private handlePing(conn: DataConnection, msg: SignalMessage) {
    this.pendingPings.set(msg.senderId, msg.timestamp);
    this.sendSignal(conn, {
      type: 'pong', payload: { sentAt: msg.timestamp },
      senderId: this.myNode!.peerId, senderName: this.myNode!.displayName,
      roomId: this.roomInfo?.roomId || '', timestamp: Date.now(),
    });
  }

  private handlePong(msg: SignalMessage) {
    const rtt = Date.now() - (msg.payload.sentAt || 0);
    const peerId = msg.senderId;

    const existing = this.bandwidthProbes.get(peerId) || {
      peerId, rttMs: 999, jitterMs: 0, estimatedDownKbps: 0,
      estimatedUpKbps: 0, packetLoss: 0, probeTimestamp: Date.now(),
      bytesSent: 0, bytesReceived: 0, availableBitrate: 0,
    };

    // Use worker for bandwidth calculation when available
    if (this.workerProxy?.calculateBandwidth) {
      this.workerProxy.calculateBandwidth({
        currentRTT: rtt,
        previousRTT: existing.rttMs,
        rttAlpha: 0.3,
        currentJitter: existing.jitterMs,
        bytesSentDelta: 0,
        bytesReceivedDelta: 0,
        timeDeltaMs: Date.now() - existing.probeTimestamp,
        packetsLost: 0,
        packetsReceived: 0,
        availableBitrate: existing.availableBitrate,
      }).then((result: any) => {
        existing.rttMs = result.rttMs;
        existing.jitterMs = result.jitterMs;
        existing.estimatedDownKbps = result.estimatedDownKbps;
        existing.estimatedUpKbps = result.estimatedUpKbps;
        existing.packetLoss = result.packetLoss;
        existing.availableBitrate = result.availableBitrate;
        existing.probeTimestamp = Date.now();
        this.bandwidthProbes.set(peerId, existing);

        const node = this.nodes.get(peerId);
        if (node) {
          node.bandwidth = existing;
          this.nodes.set(peerId, node);
        }
      }).catch(() => {
        // Fallback to inline calculation on worker error
        existing.jitterMs = existing.jitterMs * 0.7 + Math.abs(rtt - existing.rttMs) * 0.3;
        existing.rttMs = rtt;
        existing.probeTimestamp = Date.now();
        this.bandwidthProbes.set(peerId, existing);

        const node = this.nodes.get(peerId);
        if (node) {
          node.bandwidth = existing;
          this.nodes.set(peerId, node);
        }
      });
    } else {
      // Inline bandwidth calculation (original logic)
      const oldRtt = existing.rttMs;
      existing.jitterMs = existing.jitterMs * 0.7 + Math.abs(rtt - oldRtt) * 0.3;
      existing.rttMs = rtt;
      existing.probeTimestamp = Date.now();
      this.bandwidthProbes.set(peerId, existing);

      const node = this.nodes.get(peerId);
      if (node) {
        node.bandwidth = existing;
        this.nodes.set(peerId, node);
      }
    }
  }

  private handleBandwidthReport(msg: SignalMessage) {
    const probe = msg.payload as BandwidthProbe;
    this.bandwidthProbes.set(probe.peerId, probe);
    const node = this.nodes.get(probe.peerId);
    if (node) {
      node.bandwidth = probe;
      this.nodes.set(probe.peerId, node);
    }

    // Handle backup parent request
    if (msg.payload.requestBackupParent && this.myNode && this.roomInfo) {
      const requester = this.nodes.get(msg.senderId);
      if (requester) {
        // Find a sibling to serve as backup
        const parent = this.nodes.get(requester.parentId || '');
        if (parent && parent.childrenIds.length > 1) {
          const siblings = parent.childrenIds.filter(id => id !== msg.senderId);
          const backupId = siblings[Math.floor(Math.random() * siblings.length)];
          if (backupId) {
            const requesterConn = this.childConnections.get(msg.senderId) || this.parentConnection;
            if (requesterConn && requesterConn.open) {
              this.sendSignal(requesterConn, {
                type: 'backup-parent-assign',
                payload: { backupParentId: backupId },
                senderId: this.myNode.peerId,
                senderName: this.myNode.displayName,
                roomId: this.roomInfo.roomId,
                timestamp: Date.now(),
              });
            }
          }
        }
      }
    }
  }

  private handleDeviceReport(msg: SignalMessage) {
    const { peerId, device } = msg.payload;
    const node = this.nodes.get(peerId);
    if (node) {
      node.device = device;
      node.maxRelayCapacity = getMaxChildrenForDevice(device);
      node.canRelay = node.maxRelayCapacity >= 3;
      this.nodes.set(peerId, node);
    }
  }

  // ============ CLUSTER HANDLERS ============

  private handleClusterAssign(msg: SignalMessage) {
    if (!this.myNode) return;
    const { clusterId, headPeerId } = msg.payload;
    this.myNode.clusterId = clusterId;
    this.myNode.parentId = headPeerId;
    this.nodes.set(this.myNode.peerId, this.myNode);
    if (this.onTreeUpdate) this.onTreeUpdate(this.nodes);
  }

  private handleNewClusterHead(msg: SignalMessage) {
    if (!this.myNode) return;
    const { clusterId, memberIds } = msg.payload;
    this.myNode.isClusterHead = true;
    this.myNode.clusterRole = 'cluster-head';
    this.myNode.clusterId = clusterId;
    for (const mid of memberIds) {
      if (mid !== this.myNode.peerId && !this.myNode.childrenIds.includes(mid)) {
        this.myNode.childrenIds.push(mid);
      }
    }
    this.myNode.currentRelayLoad = this.myNode.childrenIds.length;
    this.nodes.set(this.myNode.peerId, this.myNode);
    if (this.onTreeUpdate) this.onTreeUpdate(this.nodes);
  }

  // ============ PEER-AS-PROXY ============

  private handleProxyRequest(conn: DataConnection, msg: SignalMessage) {
    if (!this.myNode) return;
    const { targetPeerId, requestingPeerId } = msg.payload;

    const targetConn = this.childConnections.get(targetPeerId) || this.parentConnection;
    if (targetConn && targetConn.peer === targetPeerId) {
      this.sendSignal(conn, {
        type: 'proxy-accept',
        payload: { proxyPeerId: this.myNode.peerId, targetPeerId },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo?.roomId || '', timestamp: Date.now(),
      });

      this.sendSignal(targetConn, {
        type: 'proxy-accept',
        payload: { proxyPeerId: this.myNode.peerId, targetPeerId: requestingPeerId },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo?.roomId || '', timestamp: Date.now(),
      });

      this.proxyConnections.set(requestingPeerId, conn);
      this.proxyConnections.set(targetPeerId, targetConn);
    }
  }

  private handleProxyAccept(_msg: SignalMessage) { /* Connection established via proxy */ }

  private handleProxyRelay(msg: SignalMessage) {
    const { targetPeerId, data } = msg.payload;
    const targetConn = this.proxyConnections.get(targetPeerId) ||
                       this.childConnections.get(targetPeerId);
    if (targetConn) this.sendSignal(targetConn, data);
  }

  // ============ CHAT ============

  sendChatMessage(content: string) {
    if (!this.myNode || !this.roomInfo) return;
    const now = Date.now();
    if (now - this.lastChatTime < CHAT_THROTTLE_MS) return;
    if (content.length > CHAT_MAX_LENGTH) return;
    this.lastChatTime = now;

    const msg: ChatMessage = {
      id: `${this.myNode.peerId}-${now}`, senderId: this.myNode.peerId,
      senderName: this.myNode.displayName, content, timestamp: now, type: 'chat',
    };

    if (this.parentConnection) {
      this.sendSignal(this.parentConnection, {
        type: 'chat-message', payload: msg,
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: now,
      });
    }
    if (this.myNode.role === 'host') this.broadcastChatMessage(msg);
    if (this.onChatMessage) this.onChatMessage(msg);
  }

  private handleChatMessage(msg: SignalMessage) {
    const chatMsg = msg.payload as ChatMessage;
    if (this.myNode?.role === 'host') {
      this.broadcastChatMessage(chatMsg);
    } else {
      // Non-host: relay chat UP to parent AND DOWN to children (except sender)
      this.relayChatMessage(msg, msg.senderId);
    }
    if (this.onChatMessage) this.onChatMessage(chatMsg);
  }

  private handleChatBroadcast(msg: SignalMessage) {
    const chatMsg = msg.payload as ChatMessage;
    if (this.onChatMessage) this.onChatMessage(chatMsg);
    // Forward to children through tree
    this.broadcastToChildren(msg);
  }

  /** Relay a chat message UP to parent and DOWN to children (except the sender) */
  private relayChatMessage(msg: SignalMessage, senderPeerId: string) {
    // Send UP to parent if we have one
    if (this.parentConnection && this.myNode?.peerId !== senderPeerId) {
      this.sendSignal(this.parentConnection, { ...msg, senderId: this.myNode!.peerId });
    }
    // Send DOWN to children (except the sender)
    if (this.myNode && this.roomInfo) {
      for (const childId of this.myNode.childrenIds) {
        if (childId === senderPeerId) continue;
        const conn = this.childConnections.get(childId);
        if (conn && conn.open) {
          this.sendSignal(conn, msg);
        }
      }
    }
  }

  private broadcastChatMessage(chatMsg: ChatMessage) {
    this.broadcastToChildren({
      type: 'chat-broadcast', payload: chatMsg,
      senderId: this.myNode!.peerId, senderName: this.myNode!.displayName,
      roomId: this.roomInfo!.roomId, timestamp: Date.now(),
    });
  }

  // ============ SPEAKER MANAGEMENT ============

  requestToSpeak() {
    if (!this.myNode || !this.parentConnection || !this.roomInfo) return;
    this.sendSignal(this.parentConnection, {
      type: 'speaker-request',
      payload: { peerId: this.myNode.peerId, displayName: this.myNode.displayName, timestamp: Date.now() },
      senderId: this.myNode.peerId, senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId, timestamp: Date.now(),
    });
  }

  approveSpeaker(peerId: string) {
    if (this.myNode?.role !== 'host') return;
    const node = this.nodes.get(peerId);
    if (node) { node.role = 'speaker'; this.nodes.set(peerId, node); }
    const conn = this.childConnections.get(peerId);
    if (conn) {
      this.sendSignal(conn, {
        type: 'speaker-approved', payload: { peerId },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo!.roomId, timestamp: Date.now(),
      });
    }
    this.speakerRequests = this.speakerRequests.filter(r => r.peerId !== peerId);
    this.broadcastTreeUpdate();
    this.broadcastParticipantUpdate();
  }

  denySpeaker(peerId: string) {
    if (this.myNode?.role !== 'host') return;
    const conn = this.childConnections.get(peerId);
    if (conn) {
      this.sendSignal(conn, {
        type: 'speaker-denied', payload: { peerId },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo!.roomId, timestamp: Date.now(),
      });
    }
    this.speakerRequests = this.speakerRequests.filter(r => r.peerId !== peerId);
  }

  private handleSpeakerRequestMsg(msg: SignalMessage) {
    const req = msg.payload as SpeakerRequest;
    if (this.myNode?.role === 'host') {
      if (!this.speakerRequests.some(r => r.peerId === req.peerId)) this.speakerRequests.push(req);
      if (this.onSpeakerRequest) this.onSpeakerRequest(req);
    } else if (this.parentConnection) {
      this.sendSignal(this.parentConnection, msg);
    }
  }

  private handleSpeakerApproved(msg: SignalMessage) {
    if (!this.myNode) return;
    this.myNode.role = 'speaker';
    this.nodes.set(this.myNode.peerId, this.myNode);
    if (this.onTreeUpdate) this.onTreeUpdate(this.nodes);
  }

  private handleMuteSpeaker(msg: SignalMessage) {
    if (!this.myNode) return;
    this.myNode.role = 'viewer';
    if (this.localStream) this.localStream.getAudioTracks().forEach(t => t.stop());
    if (this.onTreeUpdate) this.onTreeUpdate(this.nodes);
  }

  // ============ HEARTBEAT & HEALTH ============

  private startAllTimers() {
    // Heartbeat
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.myNode || this.isDestroyed) return;

      const msg: SignalMessage = {
        type: 'heartbeat',
        payload: {
          childrenIds: this.myNode.childrenIds,
          canRelay: this.myNode.canRelay,
          relaySuccessCount: this.myNode.relaySuccessCount,
          relayFailCount: this.myNode.relayFailCount,
          currentRelayLoad: this.myNode.currentRelayLoad,
          clusterId: this.myNode.clusterId,
          isClusterHead: this.myNode.isClusterHead,
          bandwidth: this.myNode.bandwidth,
          webrtcStats: this.myNode.webrtcStats,
        },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo?.roomId || '', timestamp: Date.now(),
      };

      if (this.parentConnection) this.sendSignal(this.parentConnection, msg);
      this.broadcastToChildren(msg);

      // Check for dead children
      const now = Date.now();
      this.nodes.forEach((node) => {
        if (node.peerId === this.myNode!.peerId) return;
        if (node.status !== 'connected') return;

        if (now - node.lastHeartbeat > HEARTBEAT_TIMEOUT) {
          node.missedHeartbeats++;
          if (node.missedHeartbeats >= 3) {
            this.handleChildDisconnect(node.peerId);
          }
        }
      });
    }, HEARTBEAT_INTERVAL);

    // Stream watchdog
    if (this.streamWatchdogTimer) clearInterval(this.streamWatchdogTimer);
    this.streamWatchdogTimer = setInterval(() => {
      if (!this.myNode || this.isDestroyed) return;
      if (this.lastStreamActivity > 0 && Date.now() - this.lastStreamActivity > STREAM_DEAD_THRESHOLD) {
        this.lastStreamActivity = 0;
        this.requestStreamFromParent();
      }
    }, STREAM_WATCHDOG_INTERVAL);

    // Bandwidth probing
    if (this.bandwidthProbeTimer) clearInterval(this.bandwidthProbeTimer);
    this.bandwidthProbeTimer = setInterval(() => {
      if (!this.myNode || this.isDestroyed) return;
      this.probeAllPeers();
    }, BANDWIDTH_PROBE_INTERVAL);

    // WebRTC stats collection
    if (this.webrtcStatsTimer) clearInterval(this.webrtcStatsTimer);
    this.webrtcStatsTimer = setInterval(() => {
      if (!this.myNode || this.isDestroyed) return;
      this.collectWebRTCStats();
    }, WEBRTC_STATS_INTERVAL);

    // Quality adaptation
    if (this.qualityAdaptTimer) clearInterval(this.qualityAdaptTimer);
    this.qualityAdaptTimer = setInterval(() => {
      if (!this.myNode || this.isDestroyed) return;
      this.adaptQualityFromStats();
    }, QUALITY_ADAPT_INTERVAL);

    // Periodic cleanup of stale data
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = setInterval(() => {
      if (this.isDestroyed) return;
      this.periodicCleanup();
    }, 60000);

    // Tree rebalancing for optimal paths (stability safeguard)
    if (this.treeRebalanceTimer) clearInterval(this.treeRebalanceTimer);
    this.treeRebalanceTimer = setInterval(() => {
      if (this.isDestroyed) return;
      this.rebalanceTree();
    }, TREE_REBALANCE_INTERVAL);

    // Network health snapshot
    if (this.bandwidthProbeTimer) {} // share with bandwidth probe

    // Root architecture selection — integrated with Tree-Honeycomb
    if (this.rootSelectionTimer) clearInterval(this.rootSelectionTimer);
    this.rootSelectionTimer = setInterval(() => this.runRootSelection(), ROOT_SELECTION_INTERVAL);

    // Attendance persistence every 30s
    if (this.attendancePersistenceTimer) clearInterval(this.attendancePersistenceTimer);
    this.attendancePersistenceTimer = setInterval(() => this.persistAttendance(), 30000);

    // Root node host presence monitoring
    if (this.myNode?.isRoot) {
      setInterval(() => {
        if (!this.isDestroyed) this.checkHostPresence();
      }, HEARTBEAT_INTERVAL);
    }

    // Host bandwidth probe for low-bandwidth detection
    this.startHostBandwidthProbe();
  }

  private probeAllPeers() {
    if (!this.myNode || !this.roomInfo) return;

    // Ping all connected children
    this.childConnections.forEach((conn, peerId) => {
      if (conn.open) {
        this.sendSignal(conn, {
          type: 'ping', payload: {},
          senderId: this.myNode!.peerId, senderName: this.myNode!.displayName,
          roomId: this.roomInfo!.roomId, timestamp: Date.now(),
        });
      }
    });

    // Ping parent
    if (this.parentConnection?.open) {
      this.sendSignal(this.parentConnection, {
        type: 'ping', payload: {},
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now(),
      });
    }

    // Record network health snapshot
    this.recordNetworkHealth();
  }

  private recordNetworkHealth() {
    const now = Date.now();
    this.recentJoins = this.recentJoins.filter(t => now - t < JOIN_RATE_WINDOW);
    this.recentLeaves = this.recentLeaves.filter(t => now - t < JOIN_RATE_WINDOW);

    let totalRTT = 0, totalPL = 0, totalBW = 0, count = 0;
    this.nodes.forEach(n => {
      if (n.bandwidth.rttMs > 0 && n.bandwidth.rttMs < 999) {
        totalRTT += n.bandwidth.rttMs;
        totalPL += n.bandwidth.packetLoss;
        totalBW += n.bandwidth.estimatedUpKbps;
        count++;
      }
    });

    const snapshot: NetworkHealthSnapshot = {
      timestamp: now,
      totalNodes: this.nodes.size,
      activeStreams: this.mediaConnections.size,
      avgRTT: count > 0 ? totalRTT / count : 0,
      avgPacketLoss: count > 0 ? totalPL / count : 0,
      totalBandwidthKbps: totalBW,
      clusterCount: this.clusters.size,
      maxDepth: this.getMaxDepth(),
      joinRate: this.recentJoins.length,
      leaveRate: this.recentLeaves.length,
      churnScore: this.calculateChurnScore(),
    };

    this.networkHistory.push(snapshot);
    if (this.networkHistory.length > 60) this.networkHistory.shift();

    if (this.onNetworkHealth) this.onNetworkHealth(snapshot);
  }

  private calculateChurnScore(): number {
    const now = Date.now();
    this.recentJoins = this.recentJoins.filter(t => now - t < JOIN_RATE_WINDOW);
    this.recentLeaves = this.recentLeaves.filter(t => now - t < JOIN_RATE_WINDOW);

    const totalChurn = this.recentJoins.length + this.recentLeaves.length;
    // Lower churn = higher score (more stable)
    return Math.max(0, 100 - totalChurn * 3);
  }

  private getMaxDepth(): number {
    let max = 0;
    this.nodes.forEach(n => { if (n.depth > max) max = n.depth; });
    return max;
  }

  private periodicCleanup() {
    const now = Date.now();

    // Clean up stale bandwidth probes
    this.bandwidthProbes.forEach((probe, peerId) => {
      if (now - probe.probeTimestamp > 60000) this.bandwidthProbes.delete(peerId);
    });

    // Clean up stale WebRTC stats
    this.prevStats.forEach((stats, peerId) => {
      if (now - stats.timestamp > 60000) this.prevStats.delete(peerId);
    });

    // Trim network history
    if (this.networkHistory.length > 60) {
      this.networkHistory = this.networkHistory.slice(-60);
    }

    // Check if any relays should be promoted/demoted
    if (this.myNode?.role === 'host') {
      this.nodes.forEach(node => {
        if (node.peerId === this.myNode!.peerId) return;
        this.maybePromoteToRelay(node);
      });
    }

    // STABILITY: Check for frozen streams and auto-recover
    this.checkFrozenStreams();

    // STABILITY: Demote overloaded relays
    this.demoteOverloadedRelays();
  }

  // ============ STABILITY SAFEGUARDS ============

  // Check for frozen streams and trigger auto-recovery
  private checkFrozenStreams() {
    if (!this.myNode || this.isDestroyed) return;
    const now = Date.now();

    this.mediaConnections.forEach((call: any, peerId: string) => {
      try {
        const pc: RTCPeerConnection = call.peerConnection;
        if (!pc) return;

        // Check if we're receiving any data
        pc.getStats().then((stats) => {
          let bytesReceived = 0;
          let lastPacketReceived = 0;
          stats.forEach((report: any) => {
            if (report.type === 'inbound-rtp') {
              bytesReceived += report.bytesReceived || 0;
              lastPacketReceived = Math.max(lastPacketReceived, report.lastPacketReceivedTimestamp || 0);
            }
          });

          const frozenSince = this.frozenStreams.get(peerId);
          if (bytesReceived === 0 && !frozenSince) {
            // Stream appears frozen
            this.frozenStreams.set(peerId, now);
          } else if (bytesReceived > 0) {
            // Stream is active
            this.frozenStreams.delete(peerId);
          }

          // If frozen for too long, trigger recovery
          if (frozenSince && now - frozenSince > STREAM_FROZEN_THRESHOLD) {
            if (this.activeRecoveries < MAX_CONCURRENT_RECOVERIES) {
              this.triggerStreamRecovery(peerId);
            }
          }
        }).catch(() => {});
      } catch {}
    });
  }

  // Trigger stream recovery for a specific peer
  private triggerStreamRecovery(peerId: string) {
    if (!this.myNode || !this.roomInfo) return;
    this.activeRecoveries++;
    this.consecutiveStreamBreaks++;
    this.lastStreamBreakTime = Date.now();

    const node = this.nodes.get(peerId);

    // Strategy 1: Reset the media connection
    const existing = this.mediaConnections.get(peerId);
    if (existing) {
      try { existing.close(); } catch {}
      this.mediaConnections.delete(peerId);
    }

    // Re-establish stream after a brief backoff
    const backoff = RECOVERY_BACKOFF_BASE * Math.min(this.consecutiveStreamBreaks, 5);
    setTimeout(() => {
      const stream = this.localStream || this.incomingStream;
      if (stream && this.peer) {
        // If we're the parent of this node, re-call them
        if (node && node.parentId === this.myNode!.peerId) {
          this.callNodeWithStream(peerId, stream);
        }
      }
      this.activeRecoveries = Math.max(0, this.activeRecoveries - 1);
      this.frozenStreams.delete(peerId);
    }, backoff);

    // Reset consecutive break counter after some time
    setTimeout(() => {
      if (Date.now() - this.lastStreamBreakTime > 60000) {
        this.consecutiveStreamBreaks = 0;
      }
    }, 60000);
  }

  // Demote relays that are overloaded to prevent cascading failures
  private demoteOverloadedRelays() {
    if (!this.myNode || this.myNode.role !== 'host') return;

    this.nodes.forEach(node => {
      if (node.peerId === this.myNode!.peerId) return;
      if (!node.canRelay || node.clusterRole === 'cluster-head') return;

      const loadRatio = node.currentRelayLoad / Math.max(1, node.maxRelayCapacity);
      if (loadRatio >= RELAY_OVERLOAD_THRESHOLD) {
        // Check if this relay has high failure rate
        const failRatio = node.relayFailCount / Math.max(1, node.relaySuccessCount + node.relayFailCount);
        if (failRatio > 0.3) {
          // Demote this relay — move its children to other relays
          node.canRelay = false;
          node.clusterRole = 'leaf';
          this.nodes.set(node.peerId, node);

          // Reassign children
          for (const childId of [...node.childrenIds]) {
            const child = this.nodes.get(childId);
            if (child) {
              const newParent = this.selectBestRelay(child.device);
              if (newParent && newParent.peerId !== node.peerId) {
                child.parentId = newParent.peerId;
                child.depth = newParent.depth + 1;
                newParent.childrenIds.push(childId);
                newParent.currentRelayLoad = newParent.childrenIds.length;
                this.nodes.set(newParent.peerId, newParent);
                this.nodes.set(childId, child);

                const childConn = this.childConnections.get(childId);
                if (childConn) {
                  this.sendSignal(childConn, {
                    type: 'reassign-parent',
                    payload: { newParentId: newParent.peerId },
                    senderId: this.myNode!.peerId, senderName: this.myNode!.displayName,
                    roomId: this.roomInfo!.roomId, timestamp: Date.now(),
                  });
                }
              }
            }
          }
          node.childrenIds = [];
          node.currentRelayLoad = 0;
          this.nodes.set(node.peerId, node);

          // Notify demoted node
          const conn = this.childConnections.get(node.peerId);
          if (conn) {
            this.sendSignal(conn, {
              type: 'relay-demote',
              payload: { reason: 'overloaded' },
              senderId: this.myNode!.peerId, senderName: this.myNode!.displayName,
              roomId: this.roomInfo!.roomId, timestamp: Date.now(),
            });
          }
        }
      }
    });
  }

  // Rebalance tree for optimal paths — moves nodes from overloaded to underloaded relays
  private rebalanceTree() {
    if (!this.myNode || this.myNode.role !== 'host' || !this.roomInfo) return;
    if (this.nodes.size < 10) return; // No need to rebalance small trees

    // Find overloaded and underloaded relays
    const overloaded: TreeNode[] = [];
    const underloaded: TreeNode[] = [];

    this.nodes.forEach(node => {
      if (!node.canRelay || node.status !== 'connected') return;
      const loadRatio = node.currentRelayLoad / Math.max(1, node.maxRelayCapacity);
      if (loadRatio >= 0.85) overloaded.push(node);
      else if (loadRatio <= 0.5 && node.depth <= 3) underloaded.push(node);
    });

    // Move children from overloaded to underloaded relays
    for (const over of overloaded) {
      if (underloaded.length === 0) break;
      const childrenToMove = Math.max(1, Math.floor(over.currentRelayLoad * 0.2));

      for (let i = 0; i < childrenToMove && over.childrenIds.length > 0; i++) {
        const childId = over.childrenIds[over.childrenIds.length - 1];
        const child = this.nodes.get(childId);
        if (!child) continue;

        // Find best underloaded relay for this child
        const bestTarget = underloaded.sort((a, b) =>
          this.calculateRelayScore(b, child.device) - this.calculateRelayScore(a, child.device)
        )[0];

        if (!bestTarget) break;

        // Move child to new parent
        over.childrenIds.pop();
        over.currentRelayLoad = over.childrenIds.length;

        child.parentId = bestTarget.peerId;
        child.depth = bestTarget.depth + 1;
        bestTarget.childrenIds.push(childId);
        bestTarget.currentRelayLoad = bestTarget.childrenIds.length;

        this.nodes.set(over.peerId, over);
        this.nodes.set(bestTarget.peerId, bestTarget);
        this.nodes.set(childId, child);

        // Notify child of new parent
        const childConn = this.childConnections.get(childId);
        if (childConn) {
          this.sendSignal(childConn, {
            type: 'reassign-parent',
            payload: { newParentId: bestTarget.peerId },
            senderId: this.myNode!.peerId, senderName: this.myNode!.displayName,
            roomId: this.roomInfo!.roomId, timestamp: Date.now(),
          });
        }
      }
    }
  }

  private handleHeartbeat(conn: DataConnection, msg: SignalMessage) {
    const senderId = msg.senderId;
    const node = this.nodes.get(senderId);

    if (node) {
      node.lastHeartbeat = Date.now();
      node.missedHeartbeats = 0;
      node.status = 'connected';

      if (msg.payload) {
        if (msg.payload.childrenIds) node.childrenIds = msg.payload.childrenIds;
        if (msg.payload.canRelay !== undefined) node.canRelay = msg.payload.canRelay;
        if (msg.payload.relaySuccessCount !== undefined) node.relaySuccessCount = msg.payload.relaySuccessCount;
        if (msg.payload.relayFailCount !== undefined) node.relayFailCount = msg.payload.relayFailCount;
        if (msg.payload.currentRelayLoad !== undefined) node.currentRelayLoad = msg.payload.currentRelayLoad;
        if (msg.payload.clusterId) node.clusterId = msg.payload.clusterId;
        if (msg.payload.isClusterHead !== undefined) node.isClusterHead = msg.payload.isClusterHead;
        if (msg.payload.bandwidth) node.bandwidth = msg.payload.bandwidth;
      }

      this.nodes.set(senderId, node);
    }

    this.sendSignal(conn, {
      type: 'heartbeat-ack',
      payload: { serverTime: Date.now() },
      senderId: this.myNode!.peerId, senderName: this.myNode!.displayName,
      roomId: this.roomInfo?.roomId || '', timestamp: Date.now(),
    });

    // Attendance tracking: update lastSeenAt
    const attendance = this.attendanceLog.get(senderId);
    if (attendance) {
      attendance.lastSeenAt = Date.now();
      this.attendanceLog.set(senderId, attendance);
    }

    // Root nodes: monitor host presence
    if (this.myNode?.isRoot && msg.senderId === this.roomInfo?.hostPeerId) {
      this.hostActive = true;
      this.hostDisconnectTime = null;
    }

    if (this.onTreeUpdate) this.onTreeUpdate(this.nodes);
  }

  private handleHeartbeatAck(msg: SignalMessage) {
    if (!this.myNode) return;
    this.myNode.lastHeartbeat = Date.now();
    this.myNode.missedHeartbeats = 0;
    this.myNode.status = 'connected';
    this.nodes.set(this.myNode.peerId, this.myNode);
    if (this.onConnectionStatus) this.onConnectionStatus('connected');

    // Root nodes: if we heard from host, track it
    if (this.myNode.isRoot && this.roomInfo && msg.senderId === this.roomInfo.hostPeerId) {
      this.hostActive = true;
      this.hostDisconnectTime = null;
    }
  }

  // ============ DISCONNECT HANDLING (CHURN-RESISTANT) ============

  private handleChildDisconnect(peerId: string) {
    // Check if the disconnected node is the host — trigger failover if needed
    this.checkHostDisconnect(peerId);

    const node = this.nodes.get(peerId);
    if (!node) return;

    this.recordLeave();

    // Remove from parent's children
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.childrenIds = parent.childrenIds.filter(id => id !== peerId);
        parent.currentRelayLoad = parent.childrenIds.length;
        this.nodes.set(parent.peerId, parent);
      }
    }

    // Remove from cluster
    const cluster = this.findClusterByMember(peerId);
    if (cluster) {
      cluster.memberIds = cluster.memberIds.filter(id => id !== peerId);
      cluster.leaveCount++;
      this.clusters.set(cluster.clusterId, cluster);
    }

    // ORPHAN ADOPTION: Reassign disconnected node's children to best available relay
    if (node.childrenIds.length > 0) {
      const orphans = [...node.childrenIds];
      for (const orphanId of orphans) {
        const orphan = this.nodes.get(orphanId);
        if (!orphan) continue;

        const newParent = this.selectBestRelay(orphan.device);
        if (newParent) {
          orphan.parentId = newParent.peerId;
          orphan.depth = newParent.depth + 1;
          orphan.status = 'reconnecting';
          newParent.childrenIds.push(orphanId);
          newParent.currentRelayLoad = newParent.childrenIds.length;
          this.nodes.set(newParent.peerId, newParent);
          this.nodes.set(orphanId, orphan);

          // Notify orphan of new parent
          const orphanConn = this.childConnections.get(orphanId);
          if (orphanConn && this.myNode && this.roomInfo) {
            this.sendSignal(orphanConn, {
              type: 'reassign-parent',
              payload: { newParentId: newParent.peerId },
              senderId: this.myNode.peerId, senderName: this.myNode.displayName,
              roomId: this.roomInfo.roomId, timestamp: Date.now(),
            });
          }
        }
      }
    }

    // Remove node
    this.nodes.delete(peerId);
    this.childConnections.delete(peerId);
    this.mediaConnections.delete(peerId);
    this.bandwidthProbes.delete(peerId);
    this.prevStats.delete(peerId);

    // Attendance tracking
    const attendance = this.attendanceLog.get(peerId);
    if (attendance) {
      attendance.leftAt = Date.now();
      this.attendanceLog.set(peerId, attendance);
    }

    // Tree-Honeycomb: heal dead leaf
    if (this.honeycombEngine) {
      this.honeycombEngine.healDeadLeaf(peerId);
    }

    // Check if cluster needs to be dissolved
    this.maybeDissolveEmptyClusters();

    this.broadcastTreeUpdate();
    this.broadcastParticipantUpdate();
    this.broadcastClusterUpdate();
  }

  private maybeDissolveEmptyClusters() {
    const toRemove: string[] = [];
    this.clusters.forEach((cluster, clusterId) => {
      if (cluster.memberIds.length === 0 && clusterId !== 'cluster-root') {
        toRemove.push(clusterId);
      }
      // Update health score
      const activeMembers = cluster.memberIds.filter(id => {
        const n = this.nodes.get(id);
        return n && n.status === 'connected';
      }).length;
      cluster.healthScore = cluster.memberIds.length > 0
        ? Math.round((activeMembers / cluster.memberIds.length) * 100)
        : 0;
    });
    toRemove.forEach(id => this.clusters.delete(id));
  }

  private handleParentDisconnect() {
    if (!this.myNode) return;

    // INSTANT FAILOVER: Try backup parent first
    if (BACKUP_PARENT_ENABLED && this.backupParentConnection && this.backupParentId) {
      console.log('[FractalMesh] Switching to backup parent:', this.backupParentId);
      this.parentConnection = this.backupParentConnection;
      this.myNode.parentId = this.backupParentId;
      this.myNode.status = 'connected';
      this.nodes.set(this.myNode.peerId, this.myNode);

      // Clear backup state after taking it over
      this.backupParentConnection = null;
      this.backupParentId = null;

      // Request stream from new parent
      if (this.parentConnection) {
        this.sendSignal(this.parentConnection, {
          type: 'request-stream', payload: {},
          senderId: this.myNode.peerId, senderName: this.myNode.displayName,
          roomId: this.roomInfo?.roomId || '', timestamp: Date.now(),
        });
      }

      // Setup a new backup parent
      this.establishBackupParent();

      if (this.onConnectionStatus) this.onConnectionStatus('connected');
      return; // Instant recovery — no reconnect needed
    }

    // No backup - fall through to reconnection
    this.myNode.status = 'reconnecting';
    this.myNode.reconnectCount++;
    this.nodes.set(this.myNode.peerId, this.myNode);
    if (this.onConnectionStatus) this.onConnectionStatus('reconnecting');

    this.attemptReconnect();
  }

  // NEW v3: Establish a backup parent connection for instant failover
  // Strategy: First ask host for assignment. If host doesn't respond, try direct connection.
  private establishBackupParent() {
    if (!BACKUP_PARENT_ENABLED || !this.myNode || !this.peer || !this.roomInfo) return;
    if (this.myNode.role === 'host') return; // Host doesn't need backup
    if (this.backupParentConnection) return;  // Already established

    // Find a backup parent that's different from current parent and on different branch
    const candidates: Array<{ node: TreeNode; score: number }> = [];

    this.nodes.forEach((node) => {
      if (!node.canRelay) return;
      if (node.currentRelayLoad >= node.maxRelayCapacity - 1) return; // Reserve 1 slot
      if (node.status !== 'connected') return;
      if (node.depth >= 6) return;
      if (node.peerId === this.myNode!.parentId) return; // Not the same as primary
      if (node.peerId === this.myNode!.peerId) return; // Not self

      const score = this.calculateRelayScore(node, this.myDevice);
      candidates.push({ node, score });
    });

    if (candidates.length > 0) {
      // Direct connection to a known relay node
      candidates.sort((a, b) => b.score - a.score);
      const backupParent = candidates[0].node;

      try {
        const conn = this.peer!.connect(backupParent.peerId, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          this.backupParentConnection = conn;
          this.backupParentId = backupParent.peerId;
          this.myNode!.isSubRoot = backupParent.isRoot; // If backup is a root, we're a sub-root path

          conn.on('data', (d: any) => {
            // Only process certain messages from backup parent
            const msg = d as SignalMessage;
            if (msg.type === 'stream-relay' || msg.type === 'root-failover' || msg.type === 'root-heartbeat') {
              this.handleSignal(conn, msg);
            }
          });
          conn.on('close', () => {
            this.backupParentConnection = null;
            this.backupParentId = null;
            // Re-establish backup after delay
            setTimeout(() => this.establishBackupParent(), 5000);
          });
        });
        conn.on('error', () => {
          this.backupParentConnection = null;
          this.backupParentId = null;
        });
      } catch {}
    } else {
      // No local candidates — ask host for a backup parent assignment via bandwidth report
      const currentParentId = this.myNode.parentId;
      if (this.parentConnection && this.parentConnection.open) {
        this.sendSignal(this.parentConnection, {
          type: 'bandwidth-report',
          payload: {
            peerId: this.myNode.peerId,
            rttMs: this.myNode.bandwidth.rttMs,
            jitterMs: this.myNode.bandwidth.jitterMs,
            estimatedDownKbps: this.myNode.bandwidth.estimatedDownKbps,
            estimatedUpKbps: this.myNode.bandwidth.estimatedUpKbps,
            packetLoss: this.myNode.bandwidth.packetLoss,
            probeTimestamp: Date.now(),
            bytesSent: this.myNode.bandwidth.bytesSent,
            bytesReceived: this.myNode.bandwidth.bytesReceived,
            availableBitrate: this.myNode.bandwidth.availableBitrate,
            requestBackupParent: true,
            currentParentId,
          },
          senderId: this.myNode.peerId,
          senderName: this.myNode.displayName,
          roomId: this.roomInfo.roomId,
          timestamp: Date.now(),
        });
      }
    }
  }

  private attemptReconnect() {
    if (this.isDestroyed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (this.onConnectionStatus) this.onConnectionStatus('error');
      if (this.onError) this.onError('Max reconnection attempts reached. Please rejoin.');
      return;
    }

    this.reconnectAttempts++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delay = RECONNECT_DELAY * Math.min(this.reconnectAttempts, 5);
    this.reconnectTimer = setTimeout(() => {
      if (this.isDestroyed) return;
      if (this.peer && this.peer.disconnected) {
        try { this.peer.reconnect(); } catch {}
      }
      this.requestStreamFromParent();
    }, delay);
  }

  // ============ TREE UPDATE HANDLING ============

  private handleTreeUpdate(msg: SignalMessage) {
    const treeData = msg.payload;
    if (treeData && treeData.nodes) {
      const newNodes = new Map<string, TreeNode>();
      Object.entries(treeData.nodes).forEach(([id, node]) => {
        newNodes.set(id, node as TreeNode);
      });
      this.nodes = newNodes;
    }
    if (this.onTreeUpdate) this.onTreeUpdate(this.nodes);
    // Forward to children through tree
    this.broadcastToChildren(msg);
  }

  // ============ BROADCAST HELPERS ============

  private broadcastTreeUpdate() {
    if (!this.myNode || !this.roomInfo) return;
    const nodeData: Record<string, TreeNode> = {};
    this.nodes.forEach((node, id) => { nodeData[id] = node; });

    // Use worker for batch tree updates when available
    if (this.workerProxy?.batchTreeUpdate) {
      this.workerProxy.batchTreeUpdate(nodeData);
    }

    this.broadcastToChildren({
      type: 'tree-update',
      payload: { nodes: nodeData },
      senderId: this.myNode.peerId, senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId, timestamp: Date.now(),
    });
  }

  private broadcastParticipantUpdate() {
    if (!this.myNode || !this.roomInfo) return;
    const nodeData: Record<string, TreeNode> = {};
    this.nodes.forEach((node, id) => { nodeData[id] = node; });

    this.broadcastToChildren({
      type: 'participant-update',
      payload: nodeData,
      senderId: this.myNode.peerId, senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId, timestamp: Date.now(),
    });

    if (this.onParticipantUpdate) this.onParticipantUpdate(this.nodes);
  }

  private broadcastClusterUpdate() {
    if (!this.myNode || !this.roomInfo) return;
    const clusterData: Record<string, Cluster> = {};
    this.clusters.forEach((cluster, id) => { clusterData[id] = cluster; });

    this.broadcastToChildren({
      type: 'cluster-update',
      payload: clusterData,
      senderId: this.myNode.peerId, senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId, timestamp: Date.now(),
    });
  }

  private sendSignal(conn: DataConnection, msg: SignalMessage) {
    try {
      if (conn && conn.open) conn.send(msg);
    } catch {}
  }

  // ============ UTILITY ============

  private async ensurePeerJS() {
    if (!this.PeerJS) {
      await this.loadPeerJS();
      if (!this.PeerJS) throw new Error('PeerJS not available');
    }
  }

  private generateRoomId(): string { return Math.random().toString(36).substring(2, 8).toUpperCase(); }
  private generatePeerSuffix(): string { return Math.random().toString(36).substring(2, 10); }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      const data = {
        roomId: this.roomInfo?.roomId,
        peerId: this.myNode?.peerId,
        role: this.myNode?.role,
        timestamp: Date.now(),
      };
      localStorage.setItem('fm-room', JSON.stringify(data));
    } catch {}
  }

  // ============ FILE SHARING HANDLERS ============

  private handleFileShareAnnounce(msg: SignalMessage) {
    const fileInfo = msg.payload as SharedFile;
    if (this.onFileShared) this.onFileShared(fileInfo);
    // Forward to children through tree
    this.broadcastToChildren(msg);
  }

  private handleFileChunk(msg: SignalMessage) {
    const { fileId, chunkIndex, totalChunks, data } = msg.payload;
    if (this.onFileChunk) this.onFileChunk(fileId, chunkIndex, totalChunks, data);
    // Forward to children through tree
    this.broadcastToChildren(msg);
  }

  private handleFileRequest(conn: DataConnection, msg: SignalMessage) {
    const { fileId, requesterId } = msg.payload;

    // Check if we are the file owner — if so, start sending chunks
    // The actual file data would be stored in memory or IndexedDB
    // For now, acknowledge the request and forward
    if (this.onFileShared) {
      this.onFileShared({ ...msg.payload, status: 'downloading', id: fileId } as SharedFile);
    }

    // Forward to children (in case file owner is below us) and parent
    if (this.parentConnection && this.myNode?.role !== 'host') {
      this.sendSignal(this.parentConnection, msg);
    }
    this.broadcastToChildren(msg);
  }

  // ============ SCREEN SHARE HANDLERS ============

  private handleScreenShareStart(msg: SignalMessage) {
    const { sharedBy, sharedByName } = msg.payload;
    if (this.onScreenShare) this.onScreenShare(true, sharedBy, sharedByName, null);
  }

  private handleScreenShareStop(msg: SignalMessage) {
    if (this.onScreenShare) this.onScreenShare(false, '', '', null);
  }

  // ============ REACTION HANDLER ============

  private handleReaction(msg: SignalMessage) {
    const reaction = msg.payload as Reaction;
    if (this.onReaction) this.onReaction(reaction);
    // Forward to children through tree
    this.broadcastToChildren(msg);
  }

  // ============ PUBLIC API: FILE SHARING ============

  async shareFile(file: File): Promise<SharedFile | null> {
    if (!this.myNode || !this.roomInfo || file.size > MAX_FILE_SIZE) return null;

    const totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);
    const sharedFile: SharedFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      timestamp: Date.now(),
      chunks: totalChunks,
      transferredChunks: 0,
      status: 'uploading',
    };

    // Announce the file to all children
    this.broadcastToChildren({
      type: 'file-share-announce',
      payload: sharedFile,
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    });

    // Also send to parent if we're a viewer/relay
    if (this.parentConnection) {
      this.sendSignal(this.parentConnection, {
        type: 'file-share-announce',
        payload: sharedFile,
        senderId: this.myNode.peerId,
        senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId,
        timestamp: Date.now(),
      });
    }

    // Read file and send chunks
    const arrayBuffer = await file.arrayBuffer();
    for (let i = 0; i < totalChunks; i++) {
      const start = i * FILE_CHUNK_SIZE;
      const end = Math.min(start + FILE_CHUNK_SIZE, file.size);
      const chunkData = arrayBuffer.slice(start, end);

      const chunkMsg: SignalMessage = {
        type: 'file-chunk',
        payload: { fileId: sharedFile.id, chunkIndex: i, totalChunks, data: chunkData },
        senderId: this.myNode.peerId,
        senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId,
        timestamp: Date.now(),
      };

      // Broadcast chunk
      this.broadcastToChildren(chunkMsg);
      if (this.parentConnection) this.sendSignal(this.parentConnection, chunkMsg);

      sharedFile.transferredChunks = i + 1;
      if (this.onFileShared) this.onFileShared({ ...sharedFile, status: i < totalChunks - 1 ? 'uploading' : 'available' });
    }

    return { ...sharedFile, status: 'available', data: arrayBuffer };
  }

  /** Share a file using SharedFile metadata (for pre-existing file data) */
  shareFileMetadata(file: SharedFile): void {
    if (!this.myNode || !this.roomInfo) return;

    // Announce the file to all children
    this.broadcastToChildren({
      type: 'file-share-announce',
      payload: file,
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    });

    // Also send to parent if we're a viewer/relay
    if (this.parentConnection) {
      this.sendSignal(this.parentConnection, {
        type: 'file-share-announce',
        payload: file,
        senderId: this.myNode.peerId,
        senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId,
        timestamp: Date.now(),
      });
    }

    if (this.onFileShared) this.onFileShared(file);
  }

  /** Request a file by its ID — the file owner will send chunks via data channel */
  requestFile(fileId: string): void {
    if (!this.myNode || !this.roomInfo) return;

    // Send request to parent (which routes to the file owner)
    const requestMsg: SignalMessage = {
      type: 'file-request',
      payload: { fileId, requesterId: this.myNode.peerId },
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    };

    if (this.parentConnection) {
      this.sendSignal(this.parentConnection, requestMsg);
    }

    // Also check children for the file (in case the owner is below us)
    this.broadcastToChildren(requestMsg);
  }

  // ============ PUBLIC API: SCREEN SHARE ============

  async startScreenShare(): Promise<MediaStream | null> {
    if (!this.myNode || !this.roomInfo || this.isScreenSharing) return null;
    if (this.myNode.role !== 'host' && this.myNode.role !== 'co-host' && this.myNode.role !== 'speaker') return null;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: true,
      });

      this.screenShareStream = stream;
      this.isScreenSharing = true;

      // Notify all peers
      const msg: SignalMessage = {
        type: 'screen-share-start',
        payload: { sharedBy: this.myNode.peerId, sharedByName: this.myNode.displayName },
        senderId: this.myNode.peerId,
        senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId,
        timestamp: Date.now(),
      };
      this.broadcastToChildren(msg);
      if (this.parentConnection) this.sendSignal(this.parentConnection, msg);

      // Relay screen share stream to children
      if (this.localStream) {
        for (const childId of this.myNode.childrenIds) {
          this.callNodeWithStream(childId, stream);
        }
      }

      // Handle screen share ending
      stream.getVideoTracks()[0].onended = () => this.stopScreenShare();

      if (this.onScreenShare) this.onScreenShare(true, this.myNode.peerId, this.myNode.displayName, stream);
      return stream;
    } catch {
      return null;
    }
  }

  stopScreenShare(): void {
    if (!this.isScreenSharing || !this.myNode || !this.roomInfo) return;

    if (this.screenShareStream) {
      this.screenShareStream.getTracks().forEach(t => t.stop());
      this.screenShareStream = null;
    }
    this.isScreenSharing = false;

    // Notify all peers
    const msg: SignalMessage = {
      type: 'screen-share-stop',
      payload: {},
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    };
    this.broadcastToChildren(msg);
    if (this.parentConnection) this.sendSignal(this.parentConnection, msg);

    // Re-relay camera stream
    if (this.localStream) {
      for (const childId of this.myNode.childrenIds) {
        this.callNodeWithStream(childId, this.localStream);
      }
    }

    if (this.onScreenShare) this.onScreenShare(false, '', '', null);
  }

  // ============ PUBLIC API: SLIDE CHANGE & ANNOTATIONS ============

  broadcastSlideChange(slideIndex: number): void {
    if (!this.myNode || !this.roomInfo) return;
    if (this.myNode.role !== 'host' && this.myNode.role !== 'co-host') return;

    const msg: SignalMessage = {
      type: 'slide-change',
      payload: { slideIndex },
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    };
    this.broadcastToChildren(msg);
  }

  broadcastAnnotation(annotation: { type: string; x: number; y: number; data?: any }): void {
    if (!this.myNode || !this.roomInfo) return;
    if (this.myNode.role !== 'host' && this.myNode.role !== 'co-host') return;

    const msg: SignalMessage = {
      type: 'annotation-update',
      payload: annotation,
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    };
    this.broadcastToChildren(msg);
  }

  // ============ PUBLIC API: CO-HOST ============

  promoteToCoHost(peerId: string): void {
    if (!this.myNode || !this.roomInfo || this.myNode.role !== 'host') return;
    const node = this.nodes.get(peerId);
    if (!node) return;

    node.role = 'co-host';
    this.nodes.set(peerId, node);
    this.coHostIds.add(peerId);

    // Notify the promoted peer
    const conn = this.childConnections.get(peerId);
    if (conn) {
      this.sendSignal(conn, {
        type: 'co-host-assign',
        payload: { peerId },
        senderId: this.myNode.peerId,
        senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId,
        timestamp: Date.now(),
      });
    }

    // Broadcast co-host assignment to all
    this.broadcastToChildren({
      type: 'co-host-assign',
      payload: { peerId },
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    });

    if (this.onCoHostUpdate) this.onCoHostUpdate({ peerId, isCoHost: true });
    this.broadcastTreeUpdate();
    this.broadcastParticipantUpdate();
  }

  demoteCoHost(peerId: string): void {
    if (!this.myNode || !this.roomInfo || this.myNode.role !== 'host') return;
    const node = this.nodes.get(peerId);
    if (!node || node.role !== 'co-host') return;

    node.role = 'viewer';
    this.nodes.set(peerId, node);
    this.coHostIds.delete(peerId);

    // Notify the demoted peer
    const conn = this.childConnections.get(peerId);
    if (conn) {
      this.sendSignal(conn, {
        type: 'co-host-revoke',
        payload: { peerId },
        senderId: this.myNode.peerId,
        senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId,
        timestamp: Date.now(),
      });
    }

    // Broadcast co-host revocation to all
    this.broadcastToChildren({
      type: 'co-host-revoke',
      payload: { peerId },
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    });

    if (this.onCoHostUpdate) this.onCoHostUpdate({ peerId, isCoHost: false });
    this.broadcastTreeUpdate();
    this.broadcastParticipantUpdate();
  }

  // ============ PUBLIC API: WAITING ROOM ============

  setWaitingRoomEnabled(enabled: boolean): void {
    this.waitingRoomEnabled = enabled;
    if (this.onWaitingRoomUpdate) {
      this.onWaitingRoomUpdate(this.waitingList.map(w => ({ peerId: w.peerId, displayName: w.displayName, device: w.joinPayload?.device || null })));
    }
  }

  admitFromWaitingRoom(peerId: string): void {
    if (!this.myNode || !this.roomInfo) return;

    const waitingEntry = this.waitingList.find(w => w.peerId === peerId);
    if (!waitingEntry) return;

    this.waitingList = this.waitingList.filter(w => w.peerId !== peerId);

    const conn = waitingEntry.conn;
    const joinPayload = waitingEntry.joinPayload;

    if (conn && conn.open) {
      // Process the join — this adds the viewer as a child
      this.processJoinRoom(conn, joinPayload);

      // Send admit signal DIRECTLY to the admitted viewer
      this.sendSignal(conn, {
        type: 'waiting-admit',
        payload: { peerId },
        senderId: this.myNode.peerId,
        senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId,
        timestamp: Date.now(),
      });
    }

    if (this.onWaitingRoomUpdate) {
      this.onWaitingRoomUpdate(this.waitingList.map(w => ({ peerId: w.peerId, displayName: w.displayName, device: w.joinPayload?.device || null })));
    }
  }

  denyFromWaitingRoom(peerId: string): void {
    if (!this.myNode || !this.roomInfo) return;

    const waitingEntry = this.waitingList.find(w => w.peerId === peerId);
    this.waitingList = this.waitingList.filter(w => w.peerId !== peerId);

    // Send deny signal directly to the denied viewer via their stored connection
    if (waitingEntry?.conn && waitingEntry.conn.open) {
      this.sendSignal(waitingEntry.conn, {
        type: 'waiting-deny',
        payload: { peerId },
        senderId: this.myNode.peerId,
        senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId,
        timestamp: Date.now(),
      });
      // Close the connection after denying
      try { waitingEntry.conn.close(); } catch {}
    }

    if (this.onWaitingRoomUpdate) {
      this.onWaitingRoomUpdate(this.waitingList.map(w => ({ peerId: w.peerId, displayName: w.displayName, device: w.joinPayload?.device || null })));
    }
  }

  // ============ PUBLIC API: ROOM LOCK ============

  lockRoom(): void {
    if (!this.myNode || !this.roomInfo) return;
    (this.roomInfo as any).isLocked = true;
    this.broadcastToChildren({
      type: 'room-lock',
      payload: {},
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    });
  }

  unlockRoom(): void {
    if (!this.myNode || !this.roomInfo) return;
    (this.roomInfo as any).isLocked = false;
    this.broadcastToChildren({
      type: 'room-unlock',
      payload: {},
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    });
  }

  // ============ PUBLIC API: MODERATION ============

  muteParticipant(peerId: string): void {
    if (!this.myNode || !this.roomInfo) return;
    const conn = this.childConnections.get(peerId);
    if (conn) {
      this.sendSignal(conn, {
        type: 'moderation-action',
        payload: { action: 'mute', targetPeerId: peerId },
        senderId: this.myNode.peerId,
        senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId,
        timestamp: Date.now(),
      });
    }
    this.broadcastToChildren({
      type: 'moderation-action',
      payload: { action: 'mute', targetPeerId: peerId },
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    });
  }

  removeParticipant(peerId: string): void {
    if (!this.myNode || !this.roomInfo) return;
    // Close connection to the participant
    const conn = this.childConnections.get(peerId);
    if (conn) {
      this.sendSignal(conn, {
        type: 'moderation-action',
        payload: { action: 'remove', targetPeerId: peerId },
        senderId: this.myNode.peerId,
        senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId,
        timestamp: Date.now(),
      });
      try { conn.close(); } catch {}
    }
    this.childConnections.delete(peerId);
    this.nodes.delete(peerId);
    if (this.myNode) {
      this.myNode.childrenIds = this.myNode.childrenIds.filter(id => id !== peerId);
      this.myNode.currentRelayLoad = this.myNode.childrenIds.length;
    }
    this.broadcastTreeUpdate();
    this.broadcastParticipantUpdate();
  }

  // ============ PUBLIC API: HAND RAISE ============

  /**
   * Host/co-host: lower a specific participant's raised hand.
   * Sends a hand-lower signal targeting the participant, which propagates
   * through the tree so all nodes update their hand-raise state.
   */
  lowerParticipantHand(peerId: string): void {
    if (!this.myNode || !this.roomInfo) return;
    const targetNode = this.nodes.get(peerId);
    const displayName = targetNode?.displayName || peerId;
    const msg: SignalMessage = {
      type: 'hand-lower',
      payload: { peerId, displayName },
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    };
    // Send directly to the participant if connected
    const conn = this.childConnections.get(peerId);
    if (conn) {
      this.sendSignal(conn, msg);
    }
    // Broadcast through tree so all nodes update
    this.broadcastToChildren(msg);
    // Also invoke local callback
    if (this.onHandRaiseUpdate) {
      this.onHandRaiseUpdate({ peerId, displayName, isRaised: false });
    }
  }

  raiseHand(): void {
    if (!this.myNode || !this.roomInfo) return;
    const msg: SignalMessage = {
      type: 'hand-raise',
      payload: { peerId: this.myNode.peerId, displayName: this.myNode.displayName },
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    };
    if (this.parentConnection) {
      this.sendSignal(this.parentConnection, msg);
    }
    this.broadcastToChildren(msg);
  }

  lowerHand(): void {
    if (!this.myNode || !this.roomInfo) return;
    const msg: SignalMessage = {
      type: 'hand-lower',
      payload: { peerId: this.myNode.peerId, displayName: this.myNode.displayName },
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    };
    if (this.parentConnection) {
      this.sendSignal(this.parentConnection, msg);
    }
    this.broadcastToChildren(msg);
  }

  // ============ PUBLIC API: REACTIONS ============

  sendReaction(type: ReactionType): void {
    if (!this.myNode || !this.roomInfo) return;

    const now = Date.now();
    if (now - this.lastReactionTime < 2000) return; // 2s throttle
    this.lastReactionTime = now;

    const reaction: Reaction = {
      id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      timestamp: Date.now(),
    };

    const msg: SignalMessage = {
      type: 'reaction',
      payload: reaction,
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    };

    this.broadcastToChildren(msg);
    if (this.parentConnection) this.sendSignal(this.parentConnection, msg);

    if (this.onReaction) this.onReaction(reaction);
  }

  // ============ HELPER: TREE-ROUTED BROADCAST ============
  // Instead of star broadcast to ALL childConnections,
  // only send to direct children who will forward to their children

  public broadcastToChildren(msg: SignalMessage) {
    if (!this.myNode || !this.roomInfo) return;

    // Tree-routed broadcast: only send to direct children
    // They will forward to their children
    for (const childId of this.myNode.childrenIds) {
      const conn = this.childConnections.get(childId);
      if (conn && conn.open) {
        this.sendSignal(conn, msg);
      }
    }

    // Also send to backbone connections (roots) for redundancy
    this.backboneConnections.forEach((conn) => {
      if (conn && conn.open) {
        this.sendSignal(conn, msg);
      }
    });
  }

  // ============ PUBLIC API ============

  getMyNode(): TreeNode | null { return this.myNode; }
  getDevice(): DeviceCapability { return this.myDevice; }
  getRoomInfo(): RoomInfo | null { return this.roomInfo; }
  isHostNode(): boolean { return this.myNode?.role === 'host'; }
  isCoHostNode(): boolean { return this.myNode?.role === 'co-host'; }
  get isCoHost(): boolean { return this.myNode?.role === 'co-host'; }
  getParticipants(): TreeNode[] { return Array.from(this.nodes.values()); }
  getNodes(): Map<string, TreeNode> { return this.nodes; }
  getClusters(): Map<string, Cluster> { return this.clusters; }
  getNetworkHistory(): NetworkHealthSnapshot[] { return this.networkHistory; }
  getWaitingList(): Array<{ peerId: string; displayName: string; device: DeviceCapability | null }> {
    return this.waitingList.map(w => ({ peerId: w.peerId, displayName: w.displayName, device: w.joinPayload?.device || null }));
  }
  isWaitingRoomEnabled(): boolean { return this.waitingRoomEnabled; }
  isInWaitingRoom(): boolean { return this.isInWaitingRoomState; }

  public getAttendanceLog() {
    return new Map(this.attendanceLog);
  }

  getHoneycombStats() {
    return this.honeycombEngine?.getStats() || null;
  }

  getTopology() {
    return this.honeycombEngine?.getTopology() || null;
  }

  getCapacityEstimate(): { maxViewers: number; currentLoad: number; headroom: number; stabilityScore: number } {
    let maxViewers = 0;
    let totalRelayCapacity = 0;
    let healthyRelays = 0;
    let totalRelays = 0;

    this.nodes.forEach(node => {
      if (node.canRelay) {
        totalRelays++;
        maxViewers += node.maxRelayCapacity - node.currentRelayLoad;
        totalRelayCapacity += node.maxRelayCapacity;
        const failRatio = node.relayFailCount / Math.max(1, node.relaySuccessCount + node.relayFailCount);
        if (failRatio < 0.2 && node.status === 'connected') healthyRelays++;
      }
    });
    maxViewers += this.nodes.size;

    // Stability score: how healthy are our relays
    const stabilityScore = totalRelays > 0
      ? Math.round((healthyRelays / totalRelays) * 100)
      : 100;

    return {
      maxViewers,
      currentLoad: this.nodes.size,
      headroom: maxViewers - this.nodes.size,
      stabilityScore,
    };
  }

  // Get benchmark data — theoretical max capacity calculation
  getBenchmarkEstimate(): {
    theoreticalMax: number;
    practicalMax: number;
    currentTreeDepth: number;
    avgBranchingFactor: number;
    relayCount: number;
    leafCount: number;
    clusterCount: number;
    avgRelayLoadPercent: number;
    healthDistribution: { healthy: number; degraded: number; critical: number };
  } {
    let relayCount = 0;
    let leafCount = 0;
    let totalLoad = 0;
    let totalCapacity = 0;
    let healthy = 0;
    let degraded = 0;
    let critical = 0;

    this.nodes.forEach(node => {
      if (node.canRelay) {
        relayCount++;
        totalLoad += node.currentRelayLoad;
        totalCapacity += node.maxRelayCapacity;
        const failRatio = node.relayFailCount / Math.max(1, node.relaySuccessCount + node.relayFailCount);
        if (failRatio < 0.1) healthy++;
        else if (failRatio < 0.3) degraded++;
        else critical++;
      } else {
        leafCount++;
      }
    });

    const avgBranchingFactor = relayCount > 0 ? totalCapacity / relayCount : 0;
    const avgRelayLoadPercent = totalCapacity > 0 ? (totalLoad / totalCapacity) * 100 : 0;
    const maxDepth = this.getMaxDepth();

    // Theoretical max: sum of all relay capacity * depth factor
    const depthFactor = Math.max(0.5, 1 - maxDepth * 0.1); // Deeper = less reliable
    const theoreticalMax = Math.round(totalCapacity * depthFactor);

    // Practical max: account for churn, network variance, and relay health
    const healthFactor = relayCount > 0 ? (healthy * 1.0 + degraded * 0.6 + critical * 0.2) / relayCount : 0;
    const practicalMax = Math.round(theoreticalMax * healthFactor * 0.7); // 70% safety margin

    return {
      theoreticalMax,
      practicalMax,
      currentTreeDepth: maxDepth,
      avgBranchingFactor: Math.round(avgBranchingFactor * 10) / 10,
      relayCount,
      leafCount,
      clusterCount: this.clusters.size,
      avgRelayLoadPercent: Math.round(avgRelayLoadPercent),
      healthDistribution: { healthy, degraded, critical },
    };
  }

  async startLocalStream(video = true, audio = true): Promise<MediaStream> {
    const profile = QUALITY_PROFILES[this.myDevice.deviceType] || QUALITY_PROFILES['unknown'];
    const constraints: MediaStreamConstraints = {
      audio: audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
      video: video ? {
        width: { ideal: profile.width },
        height: { ideal: profile.height },
        frameRate: { ideal: profile.fps },
        facingMode: 'user',
      } : false,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    return this.localStream;
  }

  toggleAudio(): boolean {
    if (!this.localStream) return false;
    const enabled = !this.localStream.getAudioTracks()[0]?.enabled;
    this.localStream.getAudioTracks().forEach(t => { t.enabled = enabled; });
    return enabled;
  }

  /** Toggle audio with explicit enabled state */
  toggleAudioEnabled(enabled: boolean) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;
    const enabled = !this.localStream.getVideoTracks()[0]?.enabled;
    this.localStream.getVideoTracks().forEach(t => { t.enabled = enabled; });
    return enabled;
  }

  /** Toggle video with explicit enabled state */
  toggleVideoEnabled(enabled: boolean) {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach(t => { t.enabled = enabled; });
  }

  // ============ CALLBACKS SETTERS ============

  setOnStreamUpdate(cb: (stream: MediaStream | null, fromPeerId: string) => void) { this.onStreamUpdate = cb; }
  setOnTreeUpdate(cb: (nodes: Map<string, TreeNode>) => void) { this.onTreeUpdate = cb; }
  setOnChatMessage(cb: (msg: ChatMessage) => void) { this.onChatMessage = cb; }
  setOnSpeakerRequest(cb: (req: SpeakerRequest) => void) { this.onSpeakerRequest = cb; }
  setOnParticipantUpdate(cb: (nodes: Map<string, TreeNode>) => void) { this.onParticipantUpdate = cb; }
  setOnConnectionStatus(cb: (status: NodeStatus) => void) { this.onConnectionStatus = cb; }
  setOnError(cb: (error: string) => void) { this.onError = cb; }
  setOnStreamHealth(cb: (health: StreamHealth) => void) { this.onStreamHealth = cb; }
  setOnClusterUpdate(cb: (clusters: Map<string, Cluster>) => void) { this.onClusterUpdate = cb; }
  setOnNetworkHealth(cb: (snapshot: NetworkHealthSnapshot) => void) { this.onNetworkHealth = cb; }
  setOnFileShared(cb: (file: SharedFile) => void) { this.onFileShared = cb; }
  setOnFileChunk(cb: (fileId: string, chunkIndex: number, totalChunks: number, data: ArrayBuffer) => void) { this.onFileChunk = cb; }
  setOnScreenShare(cb: (isSharing: boolean, sharedBy: string, sharedByName: string, stream: MediaStream | null) => void) { this.onScreenShare = cb; }
  setOnReaction(cb: (reaction: Reaction) => void) { this.onReaction = cb; }
  setOnSlideChange(cb: (slideIndex: number) => void) { this.onSlideChange = cb; }
  setOnAnnotation(cb: (annotation: { type: string; x: number; y: number; data?: any }) => void) { this.onAnnotation = cb; }
  setOnCoHostUpdate(cb: (info: { peerId: string; isCoHost: boolean }) => void) { this.onCoHostUpdate = cb; }
  setOnWaitingRoomUpdate(cb: (waitingList: Array<{ peerId: string; displayName: string; device: DeviceCapability | null }>) => void) { this.onWaitingRoomUpdate = cb; }
  setOnHandRaiseUpdate(cb: (info: { peerId: string; displayName: string; isRaised: boolean }) => void) { this.onHandRaiseUpdate = cb; }

  // ============ NEW SIGNAL HANDLERS ============

  private handleHandRaiseSignal(msg: SignalMessage) {
    // Forward to host if we're a relay; process if we're host
    if (this.myNode?.role === 'host' || this.myNode?.isRoot) {
      if (this.onSpeakerRequest) {
        this.onSpeakerRequest({
          peerId: msg.senderId,
          displayName: msg.senderName,
          timestamp: msg.timestamp,
        });
      }
      if (this.onHandRaiseUpdate) {
        this.onHandRaiseUpdate({ peerId: msg.senderId, displayName: msg.senderName, isRaised: true });
      }
    }
    // Forward through tree
    if (this.parentConnection && this.myNode?.role !== 'host') {
      this.sendSignal(this.parentConnection, msg);
    }
    this.broadcastToChildren(msg);
  }

  private handleHandLowerSignal(msg: SignalMessage) {
    if (this.myNode?.role === 'host' || this.myNode?.isRoot) {
      if (this.onSpeakerRequest) {
        this.onSpeakerRequest({
          peerId: msg.senderId,
          displayName: msg.senderName,
          timestamp: msg.timestamp,
        });
      }
      if (this.onHandRaiseUpdate) {
        this.onHandRaiseUpdate({ peerId: msg.senderId, displayName: msg.senderName, isRaised: false });
      }
    }
    if (this.parentConnection && this.myNode?.role !== 'host') {
      this.sendSignal(this.parentConnection, msg);
    }
    this.broadcastToChildren(msg);
  }

  private handleWaitingJoin(msg: SignalMessage) {
    // Host: add to waiting list and notify UI
    if (this.myNode?.role === 'host') {
      const { peerId, displayName } = msg.payload;
      // Don't add duplicates
      if (!this.waitingList.some(w => w.peerId === peerId)) {
        this.waitingList.push({ peerId, displayName, conn: null as any, joinPayload: msg.payload });
        if (this.onWaitingRoomUpdate) {
          this.onWaitingRoomUpdate(this.waitingList.map(w => ({ peerId: w.peerId, displayName: w.displayName, device: w.joinPayload?.device || null })));
        }
      }
    } else {
      // Forward to host through tree
      if (this.parentConnection) this.sendSignal(this.parentConnection, msg);
    }
  }

  private handleWaitingAdmit(msg: SignalMessage) {
    const { peerId } = msg.payload;
    // If we're the admitted viewer, proceed with normal join
    if (this.myNode?.peerId === peerId) {
      this.isInWaitingRoomState = false;
      // The host has admitted us — proceed with requesting stream from parent
      if (this.parentConnection) {
        this.requestStreamFromParent();
      }
      if (this.onConnectionStatus) this.onConnectionStatus('connected');
    }
    // Forward down tree to the target peer
    this.broadcastToChildren(msg);
  }

  private handleWaitingDeny(msg: SignalMessage) {
    const { peerId } = msg.payload;
    // If we're the denied viewer
    if (this.myNode?.peerId === peerId) {
      if (this.onError) this.onError('Your join request was denied by the host');
    }
    this.broadcastToChildren(msg);
  }

  private handleModerationAction(msg: SignalMessage) {
    // Process moderation actions (mute, remove, etc.)
    const { action, targetPeerId } = msg.payload;
    if (action === 'mute' || action === 'disable-chat') {
      // If we are the target, apply locally
      if (this.myNode?.peerId === targetPeerId) {
        if (this.onError) this.onError(`You have been ${action}d by the host`);
      }
    }
    // Forward through tree
    this.broadcastToChildren(msg);
  }

  private handleRoomLock(msg: SignalMessage) {
    if (this.roomInfo) {
      (this.roomInfo as any).isLocked = true;
    }
    this.broadcastToChildren(msg);
  }

  private handleRoomUnlock(msg: SignalMessage) {
    if (this.roomInfo) {
      (this.roomInfo as any).isLocked = false;
    }
    this.broadcastToChildren(msg);
  }

  private handleStreamRelay(msg: SignalMessage) {
    // Forward stream relay instructions through tree
    this.broadcastToChildren(msg);
  }

  private handleBackupParentAssign(msg: SignalMessage) {
    if (!this.myNode || !this.peer) return;
    const { backupParentId } = msg.payload;

    // Don't re-establish if already connected to backup
    if (this.backupParentId === backupParentId && this.backupParentConnection) return;

    try {
      const conn = this.peer.connect(backupParentId, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        conn.on('data', (d: any) => this.handleSignal(conn, d as SignalMessage));
        this.backupParentConnection = conn;
        this.backupParentId = backupParentId;
      });
      conn.on('close', () => {
        this.backupParentConnection = null;
        this.backupParentId = null;
      });
      conn.on('error', () => {
        this.backupParentConnection = null;
        this.backupParentId = null;
      });
    } catch {}
  }

  // ============ SLIDE CHANGE & ANNOTATION HANDLERS ============

  private handleSlideChange(msg: SignalMessage) {
    const { slideIndex } = msg.payload;
    if (this.onSlideChange) this.onSlideChange(slideIndex);
    // Forward to children through tree
    this.broadcastToChildren(msg);
  }

  private handleAnnotationUpdate(msg: SignalMessage) {
    const annotation = msg.payload;
    if (this.onAnnotation) this.onAnnotation(annotation);
    // Forward to children through tree
    this.broadcastToChildren(msg);
  }

  // ============ CO-HOST HANDLERS ============

  private handleCoHostAssign(msg: SignalMessage) {
    if (!this.myNode) return;
    const { peerId } = msg.payload;
    if (this.myNode.peerId === peerId) {
      this.myNode.role = 'co-host';
      this.nodes.set(this.myNode.peerId, this.myNode);
      if (this.onCoHostUpdate) this.onCoHostUpdate({ peerId, isCoHost: true });
    }
    // Forward to children
    this.broadcastToChildren(msg);
  }

  private handleCoHostRevoke(msg: SignalMessage) {
    if (!this.myNode) return;
    const { peerId } = msg.payload;
    if (this.myNode.peerId === peerId) {
      this.myNode.role = 'viewer';
      this.nodes.set(this.myNode.peerId, this.myNode);
      if (this.onCoHostUpdate) this.onCoHostUpdate({ peerId, isCoHost: false });
    }
    // Forward to children
    this.broadcastToChildren(msg);
  }

  // ============ ROOT FAILOVER FROM ROOT NODES ============

  private checkHostPresence() {
    if (!this.myNode?.isRoot || !this.roomInfo) return;

    // If we haven't heard from host recently
    const hostNode = this.nodes.get(this.roomInfo.hostPeerId);
    if (hostNode && hostNode.missedHeartbeats >= 3) {
      if (!this.hostDisconnectTime) {
        this.hostDisconnectTime = Date.now();
      }

      const elapsed = Date.now() - this.hostDisconnectTime;
      if (elapsed >= ROOT_FAILOVER_TIMEOUT_MS && this.hostActive) {
        this.hostActive = false;
        this.initiateHostFailover();
      }
    }

    // Also check if we (as a non-host root) should attempt to take over
    if (this.myNode && this.myNode.role !== 'host' && !this.hostActive) {
      if (this.myNode.isRoot && this.hostDisconnectTime &&
          Date.now() - this.hostDisconnectTime > ROOT_FAILOVER_TIMEOUT_MS) {
        this.attemptHostFailover();
      }
    }
  }

  private initiateHostFailover() {
    if (!this.myNode?.isRoot || !this.roomInfo) return;

    // Find the highest-priority root to become the new host
    const roots = Array.from(this.nodes.values())
      .filter(n => n.isRoot && n.status === 'connected')
      .sort((a, b) => b.rootPriority - a.rootPriority);

    if (roots.length === 0) return;

    const newHost = roots[0];
    this.roomInfo.hostPeerId = newHost.peerId;
    this.roomInfo.hostActive = true;
    this.roomInfo.failoverHostPeerId = newHost.peerId;
    this.failoverHostPeerId = newHost.peerId;

    // Notify all nodes about the failover
    this.broadcastToChildren({
      type: 'root-failover',
      payload: { newHostPeerId: newHost.peerId },
      senderId: this.myNode.peerId,
      senderName: this.myNode.displayName,
      roomId: this.roomInfo.roomId,
      timestamp: Date.now(),
    });
  }

  // Attempt to take over as host — called by root nodes when host is detected as gone
  private attemptHostFailover() {
    if (!this.myNode || !this.myNode.isRoot) return;

    // Calculate our priority among roots
    let highestPriority = this.myNode.rootPriority;
    let failoverCandidate = this.myNode.peerId;

    // Find the root with highest priority
    this.nodes.forEach((node) => {
      if (node.isRoot && node.rootPriority > highestPriority && node.status === 'connected') {
        highestPriority = node.rootPriority;
        failoverCandidate = node.peerId;
      }
    });

    if (failoverCandidate === this.myNode.peerId) {
      // We're the highest priority root — take over as host
      this.myNode.role = 'host';
      this.myNode.clusterRole = 'supernode';
      this.failoverHostPeerId = this.myNode.peerId;
      this.hostActive = false;
      this.nodes.set(this.myNode.peerId, this.myNode);

      // Broadcast failover to all children
      this.broadcastToChildren({
        type: 'root-failover',
        payload: { newHostPeerId: this.myNode.peerId, newHostName: this.myNode.displayName },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo?.roomId || '', timestamp: Date.now(),
      });

      if (this.roomInfo) {
        this.roomInfo.hostActive = false;
        this.roomInfo.failoverHostPeerId = this.myNode.peerId;
      }

      // Start host timers and listeners
      this.setupHostListeners();

      if (this.onError) this.onError('Host disconnected. You are now the host.');
    }
  }

  // ============ ROOT ARCHITECTURE ============
  // Invisible dummy relay nodes that keep the webinar alive when host/speaker leaves
  // These are regular attendees auto-selected based on bandwidth/stability
  // They appear as normal viewers to all users — NEVER reveal root status

  private isHost(): boolean {
    return this.myNode?.role === 'host';
  }

  // Main root selection entry point — called by the root selection timer
  // Integrates with TreeHoneycombEngine for topology-aware selection
  private runRootSelection() {
    if (!this.roomInfo || !this.myNode || !this.isHost()) return;

    // Find candidates for root promotion
    const candidates: Array<{ peerId: string; displayName: string; upKbps: number; rttMs: number; connectedAt: number }> = [];

    this.nodes.forEach((node) => {
      if (node.peerId === this.myNode!.peerId) return;
      if (node.role !== 'viewer') return;
      if (node.status !== 'connected') return;
      if (this.rootNodes.has(node.peerId)) return;
      if (node.bandwidth.estimatedUpKbps < ROOT_MIN_BANDWIDTH_KBPS) return;
      if (node.bandwidth.rttMs > ROOT_MAX_RTT_MS) return;
      if (Date.now() - node.connectedAt < ROOT_MIN_UPTIME_MS) return;

      candidates.push({
        peerId: node.peerId,
        displayName: node.displayName,
        upKbps: node.bandwidth.estimatedUpKbps,
        rttMs: node.bandwidth.rttMs,
        connectedAt: node.connectedAt,
      });
    });

    // Select candidates using honeycomb engine if available
    let newRootIds: string[] = [];
    if (this.honeycombEngine) {
      newRootIds = this.honeycombEngine.selectRootCandidates(candidates);
    } else {
      // Manual selection: pick top candidates
      candidates.sort((a, b) => {
        const scoreA = a.upKbps / 100 * 0.5 + (1 - a.rttMs / 500) * 100 * 0.3;
        const scoreB = b.upKbps / 100 * 0.5 + (1 - b.rttMs / 500) * 100 * 0.3;
        return scoreB - scoreA;
      });
      const needed = Math.max(0, ROOT_NODE_TARGET - this.rootNodes.size);
      newRootIds = candidates.slice(0, needed).map(c => c.peerId);
    }

    // Promote selected viewers to root nodes
    for (const rootId of newRootIds) {
      const node = this.nodes.get(rootId);
      if (!node) continue;

      node.isRoot = true;
      node.rootPriority = Date.now() - node.connectedAt; // Higher priority for longer-connected
      node.clusterRole = 'relay';
      node.canRelay = true;
      node.maxRelayCapacity = Math.max(node.maxRelayCapacity, 8); // Roots get extra capacity
      this.nodes.set(rootId, node);
      this.rootNodes.add(rootId);

      // Add to honeycomb if available
      if (this.honeycombEngine) {
        this.honeycombEngine.addRoot(rootId, node.displayName, {
          upKbps: node.bandwidth.estimatedUpKbps,
          downKbps: node.bandwidth.estimatedDownKbps,
          rttMs: node.bandwidth.rttMs,
        });
      }

      // Send promotion signal
      const conn = this.childConnections.get(rootId);
      if (conn && this.myNode && this.roomInfo) {
        this.sendSignal(conn, {
          type: 'root-promote',
          payload: { isRoot: true, rootPriority: node.rootPriority, streamBufferMs: ROOT_BUFFER_SIZE_MS },
          senderId: this.myNode.peerId, senderName: this.myNode.displayName,
          roomId: this.roomInfo.roomId, timestamp: Date.now(),
        });

        // Send stream buffer sync signal to begin buffering
        this.sendSignal(conn, {
          type: 'stream-buffer-sync',
          payload: { bufferMs: ROOT_BUFFER_SIZE_MS, isRoot: true },
          senderId: this.myNode.peerId, senderName: this.myNode.displayName,
          roomId: this.roomInfo.roomId, timestamp: Date.now(),
        });
      }
    }

    // Update room info
    if (this.roomInfo) {
      this.roomInfo.rootNodes = Array.from(this.rootNodes);
    }

    // Handle root demotion — if too many roots, demote lowest priority
    while (this.rootNodes.size > ROOT_NODE_MAX) {
      let lowestPriority = Infinity;
      let lowestId = '';
      for (const id of this.rootNodes) {
        const n = this.nodes.get(id);
        if (n && n.rootPriority < lowestPriority) {
          lowestPriority = n.rootPriority;
          lowestId = id;
        }
      }
      if (lowestId) {
        this.demoteRoot(lowestId);
      } else break;
    }

    // Also select sub-roots (backup for roots)
    const subRootCandidates = candidates.filter(c => !this.rootNodes.has(c.peerId) && !this.subRootNodes.has(c.peerId));
    const targetSubRoots = Math.min(SUB_ROOT_TARGET, subRootCandidates.length);

    for (let i = 0; i < targetSubRoots; i++) {
      const candidate = subRootCandidates[i];
      if (!candidate) break;
      const node = this.nodes.get(candidate.peerId);
      if (!node) continue;
      this.promoteToSubRoot(node);
    }

    // Update room info
    if (this.roomInfo) {
      this.roomInfo.subRootNodes = Array.from(this.subRootNodes);
    }
  }

  private selectRootNodes() {
    if (!this.myNode || !this.roomInfo || this.myNode.role !== 'host') return;
    if (this.nodes.size < 6) return; // Need at least 6 people to start selecting roots

    const candidates: { node: TreeNode; score: number }[] = [];

    this.nodes.forEach((node) => {
      // Skip ineligible nodes
      if (node.peerId === this.myNode!.peerId) return; // Not the host
      if (node.role === 'host') return;
      if (node.isRoot && this.rootNodes.has(node.peerId)) return; // Already a root
      if (Date.now() - node.connectedAt < ROOT_MIN_UPTIME_MS) return; // Too new
      if (node.status !== 'connected') return;
      if (node.bandwidth.estimatedUpKbps < ROOT_MIN_BANDWIDTH_KBPS) return; // Not enough bandwidth
      if (node.bandwidth.rttMs > ROOT_MAX_RTT_MS) return; // Too much latency
      if (node.missedHeartbeats > 1) return; // Unreliable

      // Score = bandwidth + stability + device capability
      const bwScore = Math.min(50, node.bandwidth.estimatedUpKbps / 50);
      const rttScore = Math.max(0, 30 - node.bandwidth.rttMs / 10);
      const stabilityScore = Math.min(20, (Date.now() - node.connectedAt) / 60000 * 2);
      const deviceBonus = !node.device.isMobile ? 10 : 0;
      const relayBonus = node.relaySuccessCount > 5 ? 5 : 0;

      candidates.push({ node, score: bwScore + rttScore + stabilityScore + deviceBonus + relayBonus });
    });

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Promote top candidates to roots
    const targetRoots = Math.min(ROOT_NODE_TARGET, candidates.length);
    const currentRootCount = this.rootNodes.size;

    for (let i = 0; i < targetRoots && currentRootCount + i < ROOT_NODE_MAX; i++) {
      const candidate = candidates[i];
      if (!candidate) break;

      this.promoteToRoot(candidate.node);
    }

    // Select sub-roots (backup for roots)
    const subRootCandidates = candidates.slice(targetRoots);
    const targetSubRoots = Math.min(SUB_ROOT_TARGET, subRootCandidates.length);

    for (let i = 0; i < targetSubRoots; i++) {
      const candidate = subRootCandidates[i];
      if (!candidate) break;
      if (this.subRootNodes.has(candidate.node.peerId)) continue;

      this.promoteToSubRoot(candidate.node);
    }

    // Update RoomInfo
    if (this.roomInfo) {
      this.roomInfo.rootNodes = [...this.rootNodes];
      this.roomInfo.subRootNodes = [...this.subRootNodes];
    }
  }

  private promoteToRoot(node: TreeNode) {
    node.isRoot = true;
    node.isSubRoot = false;
    node.rootPriority = this.rootNodes.size + 1;
    node.clusterRole = 'relay';
    node.canRelay = true;
    // CRITICAL: Keep role as 'viewer' — root status is INVISIBLE to users
    // node.role stays 'viewer' so other participants see them as a regular attendee
    this.nodes.set(node.peerId, node);
    this.rootNodes.add(node.peerId);
    this.subRootNodes.delete(node.peerId);

    // Notify the node it's been promoted to root (silently)
    const conn = this.childConnections.get(node.peerId);
    if (conn && this.myNode && this.roomInfo) {
      this.sendSignal(conn, {
        type: 'root-promote',
        payload: {
          rootPriority: node.rootPriority,
          bufferSizeMs: ROOT_BUFFER_SIZE_MS,
          isRoot: true,
        },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now(),
      });
    }
  }

  private promoteToSubRoot(node: TreeNode) {
    node.isSubRoot = true;
    node.isRoot = false;
    node.rootPriority = 0;
    node.clusterRole = 'relay';
    node.canRelay = true;
    this.nodes.set(node.peerId, node);
    this.subRootNodes.add(node.peerId);
  }

  private demoteRoot(peerId: string) {
    const node = this.nodes.get(peerId);
    if (!node) return;
    node.isRoot = false;
    node.isSubRoot = false;
    node.rootPriority = 0;
    this.nodes.set(peerId, node);
    this.rootNodes.delete(peerId);
    this.subRootNodes.delete(peerId);

    // Notify demotion
    const conn = this.childConnections.get(peerId);
    if (conn && this.myNode && this.roomInfo) {
      this.sendSignal(conn, {
        type: 'root-demote',
        payload: { isRoot: false, isSubRoot: false },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now(),
      });
    }
  }

  // When host disconnects, the highest-priority root takes over automatically
  private handleHostFailover() {
    if (!this.roomInfo) return;

    // Find the highest priority root that's still connected
    let bestRoot: TreeNode | null = null;
    let bestPriority = Infinity;

    for (const rootId of this.rootNodes) {
      const node = this.nodes.get(rootId);
      if (!node || node.status !== 'connected') continue;
      if (node.rootPriority > 0 && node.rootPriority < bestPriority) {
        bestPriority = node.rootPriority;
        bestRoot = node;
      }
    }

    if (!bestRoot) {
      // No roots available — try sub-roots
      for (const subRootId of this.subRootNodes) {
        const node = this.nodes.get(subRootId);
        if (!node || node.status !== 'connected') continue;
        if (!bestRoot || node.bandwidth.estimatedUpKbps > bestRoot.bandwidth.estimatedUpKbps) {
          bestRoot = node;
        }
      }
    }

    if (bestRoot) {
      this.failoverHostPeerId = bestRoot.peerId;
      if (this.roomInfo) {
        this.roomInfo.failoverHostPeerId = bestRoot.peerId;
        this.roomInfo.hostActive = false;
      }

      // Notify all nodes about failover
      for (const [childId, conn] of this.childConnections) {
        this.sendSignal(conn, {
          type: 'root-failover',
          payload: {
            newHostPeerId: bestRoot.peerId,
            newHostDisplayName: bestRoot.displayName,
            rootCount: this.rootNodes.size,
          },
          senderId: this.myNode?.peerId || '', senderName: this.myNode?.displayName || '',
          roomId: this.roomInfo?.roomId || '', timestamp: Date.now(),
        });
      }

      // Promote a sub-root to fill the gap
      for (const subRootId of this.subRootNodes) {
        const subNode = this.nodes.get(subRootId);
        if (subNode && subNode.status === 'connected') {
          this.promoteToRoot(subNode);
          break;
        }
      }
    }
  }

  // Root signal handlers
  private handleRootPromote(msg: SignalMessage) {
    if (!this.myNode) return;
    this.myNode.isRoot = true;
    this.myNode.rootPriority = msg.payload.rootPriority || 1;
    this.myNode.clusterRole = 'relay';
    this.myNode.canRelay = true;
    this.nodes.set(this.myNode.peerId, this.myNode);
    // IMPORTANT: We keep myNode.role as 'viewer' — root is invisible
  }

  private handleRootDemote(msg: SignalMessage) {
    if (!this.myNode) return;
    this.myNode.isRoot = false;
    this.myNode.isSubRoot = false;
    this.myNode.rootPriority = 0;
    this.nodes.set(this.myNode.peerId, this.myNode);
  }

  private handleRootFailoverMsg(msg: SignalMessage) {
    if (!this.myNode) return;
    const { newHostPeerId, newHostName } = msg.payload;
    // The root has taken over as acting host
    // If I'm the new host, start relaying stream and become the host
    if (this.myNode.peerId === newHostPeerId) {
      this.myNode.role = 'host';
      this.myNode.clusterRole = 'supernode';
      this.nodes.set(this.myNode.peerId, this.myNode);

      if (this.incomingStream) {
        this.relayStreamToChildren(this.incomingStream, '');
      }

      // Start host listeners for our new role
      this.setupHostListeners();

      if (this.onError) this.onError('Host disconnected. You are now the host.');
    }

    // Update room info
    if (this.roomInfo) {
      this.roomInfo.failoverHostPeerId = newHostPeerId;
      this.roomInfo.hostActive = false;
    }
    this.hostActive = false;
    this.failoverHostPeerId = newHostPeerId;

    // Forward failover message to children
    this.broadcastToChildren(msg);
  }

  private handleRootHeartbeat(msg: SignalMessage) {
    // Root heartbeat is like a regular heartbeat but also syncs buffer status
    const node = this.nodes.get(msg.senderId);
    if (node) {
      node.lastHeartbeat = Date.now();
      node.missedHeartbeats = 0;
      node.streamBufferMs = msg.payload.streamBufferMs || 0;
      this.nodes.set(msg.senderId, node);
    }
  }

  private handleStreamBufferSync(msg: SignalMessage) {
    // Roots report their buffer status for failover readiness
    const node = this.nodes.get(msg.senderId);
    if (node) {
      node.streamBufferMs = msg.payload.bufferMs || 0;
      this.nodes.set(msg.senderId, node);
    }
  }

  // Check if a disconnected node is the host and trigger failover
  private checkHostDisconnect(peerId: string) {
    if (!this.roomInfo) return false;

    if (peerId === this.roomInfo.hostPeerId || peerId === this.failoverHostPeerId) {
      this.hostActive = false;
      this.hostDisconnectTime = Date.now();
      if (this.roomInfo) this.roomInfo.hostActive = false;

      // Auto-failover after timeout
      setTimeout(() => {
        if (!this.hostActive && !this.isDestroyed) {
          this.handleHostFailover();
        }
      }, ROOT_FAILOVER_TIMEOUT_MS);

      return true;
    }
    return false;
  }

  // ============ ATTENDANCE PERSISTENCE ============

  private persistAttendance() {
    if (typeof window === 'undefined') return;
    try {
      const data = Array.from(this.attendanceLog.entries()).map(([peerId, record]) => ({
        peerId,
        ...record,
      }));
      localStorage.setItem(`focusmeet-attendance-${this.roomInfo?.roomId || 'unknown'}`, JSON.stringify(data));
    } catch {}
  }

  // ============ LOW-BANDWIDTH HOST SUPPORT ============

  /** Detect and adapt to host's upload bandwidth limitations */
  private detectHostBandwidth() {
    if (!this.peer || !this.isHost()) return;
    
    // Use WebRTC stats to measure actual upload
    const children = Array.from(this.childConnections.keys());
    if (children.length === 0) return;
    
    // Check a random child connection for stats
    const checkConn = this.mediaConnections.get(children[0]);
    if (!checkConn) return;
    
    try {
      checkConn.peerConnection?.getStats(null).then((stats: RTCStatsReport) => {
        let bytesSent = 0;
        let lastBytesSent = 0;
        
        stats.forEach((report: any) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            bytesSent = report.bytesSent || 0;
          }
        });
        
        const prevStats = this.prevStats.get('host-upload');
        if (prevStats) {
          lastBytesSent = prevStats.bytesSent || 0;
        }
        
        if (lastBytesSent > 0 && bytesSent > lastBytesSent) {
          const timeDelta = (HOST_BANDWIDTH_PROBE_INTERVAL / 1000);
          this.hostUploadKbps = Math.round(((bytesSent - lastBytesSent) * 8) / (timeDelta * 1000));
          this.adaptRootCountForBandwidth();
        }
        
        this.prevStats.set('host-upload', { bytesSent, timestamp: Date.now() } as any);
      }).catch(() => {});
    } catch {}
  }

  /** Adapt the number of root nodes based on host's available upload bandwidth */
  private adaptRootCountForBandwidth() {
    if (!LOW_BANDWIDTH_ADAPTIVE_ROOTS) return;
    
    const wasLowBandwidth = this.isLowBandwidthHost;
    this.isLowBandwidthHost = this.hostUploadKbps < LOW_BANDWIDTH_THRESHOLD_KBPS;
    
    if (this.isLowBandwidthHost) {
      // Low bandwidth: reduce roots to minimize host upload
      this.effectiveMaxRoots = LOW_BANDWIDTH_MAX_ROOTS;
      
      // If we have too many roots, demote the least healthy ones
      if (this.rootNodes.size > this.effectiveMaxRoots) {
        const excessCount = this.rootNodes.size - this.effectiveMaxRoots;
        const rootArray = Array.from(this.rootNodes);
        // Demote the last N roots (oldest selected = least optimal)
        for (let i = 0; i < excessCount && i < rootArray.length; i++) {
          this.demoteRoot(rootArray[i]);
        }
      }
    } else {
      // Good bandwidth: use full root capacity
      this.effectiveMaxRoots = ROOT_NODE_MAX;
    }
    
    if (wasLowBandwidth !== this.isLowBandwidthHost) {
      console.log(`[FocusMeet] Host bandwidth: ${this.hostUploadKbps} kbps — ${this.isLowBandwidthHost ? 'LOW' : 'GOOD'} — max roots: ${this.effectiveMaxRoots}`);
    }
  }

  /** Start periodic host bandwidth probing */
  private startHostBandwidthProbe() {
    if (!this.isHost()) return;
    
    // Initial detection after 10 seconds
    setTimeout(() => this.detectHostBandwidth(), 10000);
    
    this.hostBandwidthProbeTimer = setInterval(() => {
      this.detectHostBandwidth();
    }, HOST_BANDWIDTH_PROBE_INTERVAL);
  }

  /** Check if current peer is the host */
  private isHost(): boolean {
    return this.myNode?.role === 'host';
  }

  /** Get effective max root count based on host bandwidth */
  getEffectiveMaxRoots(): number {
    return this.isLowBandwidthHost ? this.effectiveMaxRoots : ROOT_NODE_MAX;
  }

  /** Get host bandwidth info */
  getHostBandwidthInfo(): { uploadKbps: number; isLowBandwidth: boolean; effectiveMaxRoots: number } {
    return {
      uploadKbps: this.hostUploadKbps,
      isLowBandwidth: this.isLowBandwidthHost,
      effectiveMaxRoots: this.effectiveMaxRoots,
    };
  }

  // ============ COOPERATIVE SCHEDULING INTEGRATION ============

  /** Schedule relay scoring cooperatively (offloads heavy computation from main thread) */
  scheduleRelayScoring(): string {
    const relayNodes: Array<{ peerId: string; rttMs: number; upKbps: number; availableBitrate: number; currentRelayLoad: number; maxRelayCapacity: number; depth: number; deviceType: string; isClusterHead: boolean; relaySuccessCount: number; relayFailCount: number; connectedAt: number }> = [];

    this.nodes.forEach(node => {
      if (node.canRelay && node.status === 'connected') {
        relayNodes.push({
          peerId: node.peerId,
          rttMs: node.bandwidth?.rttMs ?? 100,
          upKbps: node.bandwidth?.upKbps ?? 2000,
          availableBitrate: node.bandwidth?.downKbps ?? 5000,
          currentRelayLoad: node.currentRelayLoad,
          maxRelayCapacity: node.maxRelayCapacity,
          depth: node.depth,
          deviceType: node.device.deviceType,
          isClusterHead: node.isClusterHead,
          relaySuccessCount: node.relaySuccessCount ?? 0,
          relayFailCount: node.relayFailCount ?? 0,
          connectedAt: node.connectedAt,
        });
      }
    });

    return this.scheduler.scheduleChunked(relayNodes, (node) => {
      // Calculate relay score using the same formula as the engine
      const bandwidthScore = (Math.max(0, 100 - node.rttMs) * 0.5 + Math.min(100, node.upKbps / 30) * 0.5);
      const loadRatio = node.currentRelayLoad / Math.max(1, node.maxRelayCapacity);
      const loadScore = (1 - loadRatio * loadRatio) * 100;
      const depthScore = Math.max(0, 100 - node.depth * 12);
      let deviceScore = 50;
      if (node.deviceType === 'desktop-high') deviceScore = 100;
      else if (node.deviceType === 'desktop') deviceScore = 80;
      else if (node.deviceType === 'tablet') deviceScore = 60;
      else if (node.deviceType === 'mobile-high') deviceScore = 50;
      else deviceScore = 30;
      const healthBonus = (node.relaySuccessCount - node.relayFailCount * 3) * 1.5;
      const uptimeMin = (Date.now() - node.connectedAt) / 60000;
      const stabilityBonus = Math.min(15, uptimeMin * 2);
      const score = bandwidthScore * 0.4 + loadScore * 0.3 + depthScore * 0.15 + deviceScore * 0.1 + healthBonus + stabilityBonus;

      const n = this.nodes.get(node.peerId);
      if (n) {
        (n as any).__relayScore = score;
        this.nodes.set(node.peerId, n);
      }
    }, { priority: 'high', chunkSize: 50, label: 'relay-scoring' });
  }

  /** Schedule tree health check cooperatively */
  scheduleTreeHealthCheck(): string {
    const allNodeIds = Array.from(this.nodes.keys()).filter(id => id !== this.myNode?.peerId);

    return this.scheduler.scheduleChunked(allNodeIds, (peerId) => {
      const node = this.nodes.get(peerId);
      if (!node) return;

      // Check for stale nodes (no heartbeat for 2x timeout)
      const timeSinceLastSeen = Date.now() - (node.lastSeenAt ?? node.connectedAt);
      if (timeSinceLastSeen > HEARTBEAT_TIMEOUT * 2) {
        this.nodes.delete(peerId);
        this.childConnections.delete(peerId);
        this.mediaConnections.delete(peerId);
      }
    }, { priority: 'low', chunkSize: 25, label: 'tree-health-check' });
  }

  /** Schedule bandwidth stats collection cooperatively */
  scheduleBandwidthCollection(): string {
    const connIds = Array.from(this.mediaConnections.keys());

    return this.scheduler.scheduleChunked(connIds, (peerId) => {
      const conn = this.mediaConnections.get(peerId);
      if (!conn?.peerConnection) return;

      try {
        conn.peerConnection.getStats(null).then((stats: RTCStatsReport) => {
          let bytesSent = 0, bytesReceived = 0, packetsLost = 0, packetsReceived = 0;
          stats.forEach((report: any) => {
            if (report.type === 'outbound-rtp') bytesSent += report.bytesSent || 0;
            if (report.type === 'inbound-rtp') {
              bytesReceived += report.bytesReceived || 0;
              packetsLost += report.packetsLost || 0;
              packetsReceived += report.packetsReceived || 0;
            }
          });
          // Store for later bandwidth calculation
          this.prevStats.set(peerId, { bytesSent, bytesReceived, packetsLost, packetsReceived, timestamp: Date.now() } as any);
        }).catch(() => {});
      } catch {}
    }, { priority: 'normal', chunkSize: 20, label: 'bandwidth-collection' });
  }

  /** Get scheduler metrics for diagnostics */
  getSchedulerMetrics() {
    return this.scheduler.getMetrics();
  }

  // ============ CLEANUP ============

  destroy() {
    this.isDestroyed = true;

    // Notify children before leaving
    if (this.myNode && this.roomInfo) {
      this.broadcastToChildren({
        type: 'node-disconnect',
        payload: { peerId: this.myNode.peerId },
        senderId: this.myNode.peerId, senderName: this.myNode.displayName,
        roomId: this.roomInfo.roomId, timestamp: Date.now(),
      });

      // Notify parent
      if (this.parentConnection) {
        this.sendSignal(this.parentConnection, {
          type: 'leave-room',
          payload: { peerId: this.myNode.peerId },
          senderId: this.myNode.peerId, senderName: this.myNode.displayName,
          roomId: this.roomInfo.roomId, timestamp: Date.now(),
        });
      }
    }

    // Stop all streams
    if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());
    if (this.incomingStream) this.incomingStream.getTracks().forEach(t => t.stop());

    // Close all connections
    this.childConnections.forEach(c => { try { c.close(); } catch {} });
    this.mediaConnections.forEach(c => { try { c.close(); } catch {} });
    this.backboneConnections.forEach(c => { try { c.close(); } catch {} });
    this.proxyConnections.forEach(c => { try { c.close(); } catch {} });
    if (this.parentConnection) { try { this.parentConnection.close(); } catch {} }

    // Clear timers
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.streamWatchdogTimer) clearInterval(this.streamWatchdogTimer);
    if (this.bandwidthProbeTimer) clearInterval(this.bandwidthProbeTimer);
    if (this.webrtcStatsTimer) clearInterval(this.webrtcStatsTimer);
    if (this.qualityAdaptTimer) clearInterval(this.qualityAdaptTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.treeRebalanceTimer) clearInterval(this.treeRebalanceTimer);
    if (this.rootSelectionTimer) { clearInterval(this.rootSelectionTimer); this.rootSelectionTimer = null; }
    if (this.attendancePersistenceTimer) { clearInterval(this.attendancePersistenceTimer); this.attendancePersistenceTimer = null; }
    if (this.hostBandwidthProbeTimer) { clearInterval(this.hostBandwidthProbeTimer); this.hostBandwidthProbeTimer = null; }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.scheduler.destroy();

    // Final attendance persistence before cleanup
    this.persistAttendance();

    // Clear storage
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem('fm-room'); } catch {}
    }

    if (this.peer) { try { this.peer.destroy(); } catch {} this.peer = null; }
  }
}
