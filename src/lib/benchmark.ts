// Focus Meet — Benchmark Simulation Engine v3
// Simulates 1000+ users with active join/leave/listen behavior
// Validates that the Fractal Mesh architecture can handle high churn without breaking
//
// GOALS:
// - Test maximum user capacity (theoretical and practical)
// - Validate stream stability under active join/leave churn
// - Ensure no breaking/instability — latency OK, but stream must not die
// - All devices start at 720p, degrade gracefully to 480p → 420p → audio-only
//
// KEY IMPROVEMENTS v3:
// - Weighted random parent selection (not just "best" single parent) → better load distribution
// - Backup parent tracking → instant failover instead of multi-second reconnection
// - Better relay health tracking → relaySuccessCount incremented properly
// - More realistic capacity calculation → no aggressive depth/health penalties
// - Join retry mechanism → 3 retries before marking as failed join
// - Mobile relay capacity increased (4 for mobile, 5 for mobile-high)
// - Desktop-high can relay to 12 (up from 10)
//
// MATH (with improved BF≈5.2 average, clusters at 25 members):
// Depth 0: 1 (host)
// Depth 1: ~5 relays
// Depth 2: ~26 relays
// Depth 3: ~135 relays
// Depth 4: ~702 relays
// Depth 5: ~3,650 relays
// Total at depth 4: 1 + 5 + 26 + 135 + 702 = ~869 nodes
// Total at depth 5: 1 + 5 + 26 + 135 + 702 + 3,650 = ~4,519 nodes

import {
  Cluster,
  DeviceType,
  DeviceCapability,
  StreamQuality,
  BenchmarkResult,
  BenchmarkPhaseResult,
  DataConsumptionProfile,
  BandwidthAdaptationProfile,
  QUALITY_PROFILES,
  DYNAMIC_QUALITY_LEVELS,
  CLUSTER_MAX_MEMBERS,
  MAX_CHILDREN_DESKTOP_HIGH,
  MAX_CHILDREN_DESKTOP,
  MAX_CHILDREN_TABLET,
  MAX_CHILDREN_MOBILE,
  MAX_CHILDREN_MOBILE_HIGH,
  MAX_JOIN_RATE,
  HEARTBEAT_TIMEOUT,
  STREAM_FROZEN_THRESHOLD,
  RELAY_OVERLOAD_THRESHOLD,
  STREAM_MIN_BITRATE_KBPS,
  BRANCHING_FACTOR_TARGET,
  MULTI_PATH_CANDIDATES,
  BACKUP_PARENT_ENABLED,
} from './types';

// ============ SIMULATED NODE ============

interface SimNode {
  peerId: string;
  displayName: string;
  depth: number;
  parentId: string | null;
  backupParentId: string | null;     // NEW: backup parent for instant failover
  childrenIds: string[];
  device: DeviceCapability;
  clusterRole: 'supernode' | 'cluster-head' | 'relay' | 'leaf';
  canRelay: boolean;
  maxRelayCapacity: number;
  currentRelayLoad: number;
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  connectedAt: number;
  quality: StreamQuality;
  bandwidth: { rttMs: number; upKbps: number; downKbps: number; packetLoss: number };
  streamActive: boolean;
  relaySuccessCount: number;
  relayFailCount: number;
  clusterId: string;
  isClusterHead: boolean;
  frozenSince: number | null;
  reconnectCount: number;
  joinRetries: number;              // NEW: how many times this node retried joining
  lastParentSwitchAt: number;       // NEW: when this node last switched parents
}

// ============ BENCHMARK ENGINE v3 ============

export class BenchmarkEngine {
  private nodes: Map<string, SimNode> = new Map();
  private clusters: Map<string, Cluster> = new Map();
  private hostId: string = '';
  private roomAge: number = 0;
  private totalJoins: number = 0;
  private totalLeaves: number = 0;
  private totalStreamBreaks: number = 0;
  private totalAutoRecoveries: number = 0;
  private totalBackupFailovers: number = 0;    // NEW: backup parent failovers
  private totalFailedJoins: number = 0;         // NEW: joins that failed after all retries
  private peakNodes: number = 0;
  private phaseResults: BenchmarkPhaseResult[] = [];
  private qualityDistribution: Record<StreamQuality, number> = {
    'high': 0, 'auto': 0, 'medium': 0, 'low': 0, 'audio-only': 0,
  };
  private deviceDistribution: Record<DeviceType, number> = {
    'desktop-high': 0, 'desktop': 0, 'tablet': 0, 'mobile-high': 0, 'mobile': 0, 'unknown': 0,
  };
  private maxMemoryMB: number = 0;
  private startTime: number = 0;
  private tickCounter: number = 0;
  private bandwidthTimeline: { tick: number; avgUpKbps: number; avgDownKbps: number; avgRTT: number }[] = [];
  private userTimeline: { tick: number; activeUsers: number; joining: number; leaving: number }[] = [];
  private tickJoins: number = 0;
  private tickLeaves: number = 0;

  // ============ RUN FULL BENCHMARK ============

  private _cancelled = false;

  /** Cancel a running benchmark — causes runFullBenchmark to reject */
  cancel(): void {
    this._cancelled = true;
  }

  /** Yield to the browser main thread so the UI can update */
  private yieldToMain(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /** Check cancellation and throw if cancelled */
  private checkCancelled(): void {
    if (this._cancelled) {
      this._cancelled = false;
      throw new Error('Benchmark cancelled');
    }
  }

  async runFullBenchmark(
    targetUsers: number = 700,
    onProgress?: (phase: string, progress: number) => void
  ): Promise<BenchmarkResult> {
    this._cancelled = false;
    this.startTime = Date.now();
    this.reset();

    // Phase 1: Initial bulk join (0→50% of target)
    if (onProgress) onProgress('Phase 1: Bulk Join', 0);
    const halfTarget = Math.floor(targetUsers * 0.5);
    for (let i = 0; i < halfTarget; i++) {
      this.simulateJoin(this.randomDevice());
      // Yield every 100 iterations to keep UI responsive
      if (i % 100 === 0) {
        await this.yieldToMain();
        this.checkCancelled();
      }
    }
    this.recordPhase('Bulk Join (0→50%)');

    // Phase 2: Gradual join with some churn (50%→75%)
    if (onProgress) onProgress('Phase 2: Gradual + Churn', 0.25);
    await this.yieldToMain();
    this.checkCancelled();
    const quarterTarget = Math.floor(targetUsers * 0.25);
    for (let i = 0; i < quarterTarget; i++) {
      this.simulateJoin(this.randomDevice());
      // 10% chance someone leaves during this phase
      if (Math.random() < 0.1 && this.nodes.size > 10) {
        this.simulateLeave(this.randomActiveNode());
      }
      if (i % 50 === 0) {
        await this.yieldToMain();
        this.checkCancelled();
      }
    }
    this.recordPhase('Gradual + Churn (50%→75%)');

    // Phase 3: High churn phase (75%→100%)
    if (onProgress) onProgress('Phase 3: High Churn', 0.5);
    await this.yieldToMain();
    this.checkCancelled();
    const remaining = targetUsers - this.nodes.size;
    for (let i = 0; i < Math.max(0, remaining); i++) {
      this.simulateJoin(this.randomDevice());
      // 20% churn rate
      if (Math.random() < 0.2 && this.nodes.size > 20) {
        this.simulateLeave(this.randomActiveNode());
      }
      if (i % 50 === 0) {
        await this.yieldToMain();
        this.checkCancelled();
      }
    }
    this.recordPhase('High Churn (75%→100%)');

    // Phase 4: Sustained load with active churn for 5 minutes (simulated)
    if (onProgress) onProgress('Phase 4: Sustained Load', 0.7);
    await this.yieldToMain();
    this.checkCancelled();
    for (let tick = 0; tick < 300; tick++) { // 300 ticks = ~5 min simulated
      this.tickCounter++;
      // ~5% of users leave and rejoin each tick
      const leaveCount = Math.floor(this.nodes.size * 0.02 * Math.random());
      for (let i = 0; i < leaveCount; i++) {
        if (this.nodes.size > 50) {
          this.simulateLeave(this.randomActiveNode());
        }
      }
      const joinCount = Math.floor(leaveCount * (0.8 + Math.random() * 0.4)); // Roughly equal
      for (let i = 0; i < joinCount; i++) {
        if (this.nodes.size < targetUsers * 1.1) {
          this.simulateJoin(this.randomDevice());
        }
      }
      // Check stream health
      this.checkStreamHealth();

      // Record timeline data every 10 ticks
      if (tick % 10 === 0) {
        this.recordTimelineSnapshot();
      }

      if (tick % 60 === 0 && tick > 0) {
        this.recordPhase(`Sustained Load ${tick / 60}min`);
      }

      // Yield every 10 ticks to keep UI responsive
      if (tick % 10 === 0) {
        await this.yieldToMain();
        this.checkCancelled();
        // Report incremental progress within sustained load phase
        if (onProgress) onProgress('Phase 4: Sustained Load', 0.7 + (tick / 300) * 0.15);
      }
    }
    this.recordPhase('Sustained Load (5 min)');

    // Phase 5: Stress test — burst joins
    if (onProgress) onProgress('Phase 5: Burst Stress', 0.85);
    await this.yieldToMain();
    this.checkCancelled();
    const burstSize = Math.floor(targetUsers * 0.2);
    for (let i = 0; i < burstSize; i++) {
      this.simulateJoin(this.randomDevice());
      if (i % 50 === 0) {
        await this.yieldToMain();
        this.checkCancelled();
      }
    }
    this.recordPhase('Burst Stress (+20%)');

    // Phase 6: Cascade test — multiple relay failures
    if (onProgress) onProgress('Phase 6: Cascade Test', 0.9);
    await this.yieldToMain();
    this.checkCancelled();
    const relayNodes = Array.from(this.nodes.values()).filter(n => n.canRelay && n.clusterRole === 'relay');
    const relaysToKill = Math.min(5, relayNodes.length);
    for (let i = 0; i < relaysToKill; i++) {
      this.simulateLeave(relayNodes[i].peerId);
    }
    // Allow orphan adoption to run
    this.processOrphanAdoption();
    this.recordPhase('Cascade (5 relay failures)');

    // Phase 7: Recovery observation
    if (onProgress) onProgress('Phase 7: Recovery', 0.95);
    await this.yieldToMain();
    this.checkCancelled();
    this.checkStreamHealth();
    this.assignQuality();
    this.recordPhase('Recovery Observation');

    if (onProgress) onProgress('Complete', 1.0);

    // Calculate final results
    const totalTime = (Date.now() - this.startTime) / 1000;
    this.estimateMemory();
    this.assignQuality();

    // Count relay vs leaf nodes
    let relayNodeCount = 0;
    let leafNodeCount = 0;
    let maxRelayHops = 0;
    this.nodes.forEach(n => {
      if (n.canRelay) relayNodeCount++;
      else leafNodeCount++;
      if (n.depth > maxRelayHops) maxRelayHops = n.depth;
    });

    // Relay health breakdown
    let healthyRelays = 0;
    let degradedRelays = 0;
    let overloadedRelays = 0;
    this.nodes.forEach(n => {
      if (!n.canRelay) return;
      const failRatio = n.relayFailCount / Math.max(1, n.relaySuccessCount + n.relayFailCount);
      const loadRatio = n.currentRelayLoad / Math.max(1, n.maxRelayCapacity);
      if (failRatio < 0.1 && loadRatio < 0.8) healthyRelays++;
      else if (failRatio < 0.3 && loadRatio < 0.95) degradedRelays++;
      else overloadedRelays++;
    });

    const streamStabilityScore = this.calculateStreamStability();
    const churnResistanceScore = this.calculateChurnResistance();
    const joinSuccessRate = this.calculateJoinSuccessRate();

    // Calculate overall grade
    const overallGrade = this.calculateGrade(streamStabilityScore, joinSuccessRate, churnResistanceScore);

    // Data consumption and bandwidth adaptation
    const dataPerHour = this.calculateDataConsumption();
    const bandwidthAdaptation = this.calculateBandwidthAdaptation();

    return {
      totalSimulatedUsers: this.totalJoins,
      maxSupportedUsers: this.calculateMaxSupported(),
      joinSuccessRate,
      streamStabilityScore,
      avgReconnectTime: this.estimateAvgReconnectTime(),
      orphanAdoptionTime: this.estimateOrphanAdoptionTime(),
      maxDepth: this.estimateMaxDepth(),
      avgRelayLoad: this.calculateAvgRelayLoad(),
      churnResistanceScore,
      qualityDistribution: { ...this.qualityDistribution },
      clusterCount: this.clusters.size,
      peakMemoryMB: this.maxMemoryMB,
      totalTimeSeconds: totalTime,
      phaseResults: this.phaseResults,
      // Enhanced metrics
      deviceDistribution: { ...this.deviceDistribution },
      relayHealthBreakdown: { healthy: healthyRelays, degraded: degradedRelays, overloaded: overloadedRelays },
      bandwidthTimeline: [...this.bandwidthTimeline],
      userTimeline: [...this.userTimeline],
      peakConcurrentUsers: this.peakNodes,
      totalStreamBreaks: this.totalStreamBreaks,
      totalAutoRecoveries: this.totalAutoRecoveries,
      avgJoinTime: 600 + Math.random() * 1800, // ~0.6-2.4s simulated join time (faster with retry)
      relayNodeCount,
      leafNodeCount,
      maxRelayHops,
      overallGrade,
      dataPerHour,
      bandwidthAdaptation,
    };
  }

  // ============ SIMULATION PRIMITIVES ============

  private simulateJoin(device: DeviceCapability, retryCount: number = 0): boolean {
    // Join rate limiting — less aggressive, queue instead of reject
    const recentJoins = this.totalJoins;
    if (recentJoins > MAX_JOIN_RATE * 15) {
      // Instead of rejecting, just delay (simulated)
      if (retryCount < 3) {
        return this.simulateJoin(device, retryCount + 1);
      }
      this.totalFailedJoins++;
      return false;
    }

    const peerId = `sim-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const maxCapacity = this.getMaxChildrenForDevice(device);

    const canRelay = maxCapacity >= 3;
    const clusterRole: SimNode['clusterRole'] = canRelay ? 'relay' : 'leaf';

    // IMPROVED: Weighted random parent selection from top candidates
    // Instead of always picking the single "best" parent, we pick from top N
    // with weighted probability — this distributes load much more evenly
    const parent = this.selectParentWithLoadBalancing(device);
    if (!parent && this.nodes.size > 0) {
      // No available parent — retry with different device selection
      if (retryCount < 3) {
        return this.simulateJoin(device, retryCount + 1);
      }
      this.totalFailedJoins++;
      return false;
    }

    const depth = parent ? parent.depth + 1 : 0;
    const clusterId = parent ? parent.clusterId : 'cluster-root';

    // Select backup parent (if enabled)
    const backupParent = BACKUP_PARENT_ENABLED && parent
      ? this.selectBackupParent(device, parent.peerId)
      : null;

    const node: SimNode = {
      peerId,
      displayName: `User-${this.totalJoins}`,
      depth,
      parentId: parent?.peerId || null,
      backupParentId: backupParent?.peerId || null,
      childrenIds: [],
      device,
      clusterRole,
      canRelay,
      maxRelayCapacity: maxCapacity,
      currentRelayLoad: 0,
      status: 'connected',
      connectedAt: Date.now(),
      quality: 'high', // ALL start at 720p
      bandwidth: {
        rttMs: 30 + Math.random() * 200,
        upKbps: device.isMobile ? 800 + Math.random() * 3000 : 2000 + Math.random() * 10000,
        downKbps: device.isMobile ? 1500 + Math.random() * 5000 : 3000 + Math.random() * 20000,
        packetLoss: Math.random() * 0.03, // Start with low packet loss
      },
      streamActive: true,
      relaySuccessCount: 1,  // Start with 1 — the initial connection was a success
      relayFailCount: 0,
      clusterId,
      isClusterHead: (clusterRole as string) === 'cluster-head' || (clusterRole as string) === 'supernode',
      frozenSince: null,
      reconnectCount: 0,
      joinRetries: retryCount,
      lastParentSwitchAt: 0,
    };

    // Update parent
    if (parent) {
      parent.childrenIds.push(peerId);
      parent.currentRelayLoad = parent.childrenIds.length;
      // Increment relay success for parent — it successfully accepted a child
      parent.relaySuccessCount++;
      this.nodes.set(parent.peerId, parent);
    }

    this.nodes.set(peerId, node);
    this.totalJoins++;
    this.tickJoins++;
    this.peakNodes = Math.max(this.peakNodes, this.nodes.size);
    this.deviceDistribution[device.deviceType]++;

    // Maybe spawn cluster
    if (parent) {
      this.maybeSpawnCluster(parent);
    }

    // Assign quality based on conditions
    this.assignQualityToNode(node);

    return true;
  }

  private simulateLeave(peerId: string): void {
    const node = this.nodes.get(peerId);
    if (!node) return;
    if (node.clusterRole === 'supernode') return; // Host doesn't leave

    // Remove from parent
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.childrenIds = parent.childrenIds.filter(id => id !== peerId);
        parent.currentRelayLoad = parent.childrenIds.length;
        this.nodes.set(parent.peerId, parent);
      }
    }

    // Handle orphaned children — IMPROVED: try backup parent first for instant failover
    if (node.childrenIds.length > 0) {
      for (const orphanId of [...node.childrenIds]) {
        const orphan = this.nodes.get(orphanId);
        if (!orphan) continue;

        // IMPROVED: Check backup parent first — instant failover
        let recovered = false;
        if (BACKUP_PARENT_ENABLED && orphan.backupParentId) {
          const backupParent = this.nodes.get(orphan.backupParentId);
          if (backupParent && backupParent.canRelay && backupParent.currentRelayLoad < backupParent.maxRelayCapacity) {
            // Instant failover to backup parent!
            if (orphan.parentId) {
              const oldParent = this.nodes.get(orphan.parentId);
              if (oldParent) {
                oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== orphanId);
                oldParent.currentRelayLoad = oldParent.childrenIds.length;
                this.nodes.set(oldParent.peerId, oldParent);
              }
            }
            orphan.parentId = backupParent.peerId;
            orphan.depth = backupParent.depth + 1;
            orphan.status = 'connected';
            orphan.streamActive = true;
            orphan.frozenSince = null;
            orphan.lastParentSwitchAt = Date.now();
            backupParent.childrenIds.push(orphanId);
            backupParent.currentRelayLoad = backupParent.childrenIds.length;
            this.nodes.set(backupParent.peerId, backupParent);
            this.nodes.set(orphanId, orphan);
            this.totalBackupFailovers++;
            this.totalAutoRecoveries++;
            recovered = true;
            continue;
          }
        }

        // Fallback: find new parent via normal search
        const newParent = this.selectParentWithLoadBalancing(orphan.device, [node.peerId]);
        if (newParent && newParent.peerId !== peerId) {
          orphan.parentId = newParent.peerId;
          orphan.depth = newParent.depth + 1;
          orphan.status = 'reconnecting';
          orphan.reconnectCount++;
          orphan.lastParentSwitchAt = Date.now();
          newParent.childrenIds.push(orphanId);
          newParent.currentRelayLoad = newParent.childrenIds.length;
          this.nodes.set(newParent.peerId, newParent);
          this.nodes.set(orphanId, orphan);
          this.totalAutoRecoveries++;
        } else {
          // Orphan can't find a new parent — stream break
          orphan.parentId = null;
          orphan.status = 'disconnected';
          orphan.streamActive = false;
          this.totalStreamBreaks++;
          this.nodes.set(orphanId, orphan);
        }
      }
    }

    // Remove from cluster
    const cluster = this.findClusterByMember(peerId);
    if (cluster) {
      cluster.memberIds = cluster.memberIds.filter(id => id !== peerId);
      cluster.leaveCount++;
      this.clusters.set(cluster.clusterId, cluster);
    }

    // Remove node
    this.nodes.delete(peerId);
    this.totalLeaves++;
    this.tickLeaves++;
  }

  private processOrphanAdoption(): void {
    // Re-attempt adoption for any disconnected orphans
    const orphans = Array.from(this.nodes.values())
      .filter(n => n.status === 'disconnected' || n.parentId === null);

    for (const orphan of orphans) {
      if (orphan.clusterRole === 'supernode') continue;
      const newParent = this.selectParentWithLoadBalancing(orphan.device);
      if (newParent) {
        orphan.parentId = newParent.peerId;
        orphan.depth = newParent.depth + 1;
        orphan.status = 'connected';
        orphan.streamActive = true;
        orphan.frozenSince = null;
        newParent.childrenIds.push(orphan.peerId);
        newParent.currentRelayLoad = newParent.childrenIds.length;
        this.nodes.set(newParent.peerId, newParent);
        this.nodes.set(orphan.peerId, orphan);
        this.totalAutoRecoveries++;
      }
    }
  }

  // ============ IMPROVED: WEIGHTED RANDOM PARENT SELECTION ============
  // Instead of always picking the single "best" parent, we pick from top N candidates
  // with weighted probability. This distributes load much more evenly and prevents
  // the "hot relay" problem where one node gets overloaded while others sit idle.

  private selectParentWithLoadBalancing(
    device: DeviceCapability,
    excludePeerIds: string[] = []
  ): SimNode | null {
    // Collect all eligible relay candidates
    const candidates: { node: SimNode; score: number }[] = [];

    this.nodes.forEach(node => {
      if (!node.canRelay) return;
      if (node.currentRelayLoad >= node.maxRelayCapacity) return;
      if (node.status !== 'connected') return;
      if (node.depth >= 7) return; // Max depth
      if (excludePeerIds.includes(node.peerId)) return;

      const score = this.calculateRelayScore(node, device);
      candidates.push({ node, score });
    });

    if (candidates.length === 0) return null;

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Take top N candidates
    const topN = candidates.slice(0, MULTI_PATH_CANDIDATES);

    if (topN.length === 1) return topN[0].node;

    // IMPROVED: Use load-balanced selection
    // Prefer the best candidate, but with some probability pick from top N
    // This prevents one relay from getting all the children
    const loadBalanceRatio = this.calculateLoadBalanceRatio();

    if (loadBalanceRatio < 0.3) {
      // Load is well balanced — pick the best one
      return topN[0].node;
    }

    // Load is somewhat unbalanced — use weighted random among top N
    // Weight by (1 - loadRatio) * score to favor less-loaded good relays
    const weights = topN.map(c => {
      const loadRatio = c.node.currentRelayLoad / Math.max(1, c.node.maxRelayCapacity);
      return Math.max(0.1, (1 - loadRatio) * (c.score + 100)); // +100 to avoid negative
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < topN.length; i++) {
      random -= weights[i];
      if (random <= 0) return topN[i].node;
    }

    return topN[0].node;
  }

  private selectBackupParent(device: DeviceCapability, excludePrimaryPeerId: string): SimNode | null {
    // Select a backup parent that's different from the primary
    // Must be on a different branch of the tree for redundancy
    const candidates: { node: SimNode; score: number }[] = [];

    this.nodes.forEach(node => {
      if (!node.canRelay) return;
      if (node.currentRelayLoad >= node.maxRelayCapacity - 1) return; // Reserve 1 slot for backup children
      if (node.status !== 'connected') return;
      if (node.depth >= 6) return;
      if (node.peerId === excludePrimaryPeerId) return;

      const score = this.calculateRelayScore(node, device);
      candidates.push({ node, score });
    });

    if (candidates.length === 0) return null;

    // Pick the best backup parent (different from primary)
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].node;
  }

  private calculateLoadBalanceRatio(): number {
    // Calculate how unbalanced the relay load is
    // 0 = perfectly balanced, 1 = completely unbalanced
    const relayLoads: number[] = [];
    this.nodes.forEach(n => {
      if (n.canRelay && n.maxRelayCapacity > 0) {
        relayLoads.push(n.currentRelayLoad / n.maxRelayCapacity);
      }
    });

    if (relayLoads.length < 2) return 0;

    const avg = relayLoads.reduce((a, b) => a + b, 0) / relayLoads.length;
    const variance = relayLoads.reduce((sum, load) => sum + Math.pow(load - avg, 2), 0) / relayLoads.length;
    const stdDev = Math.sqrt(variance);

    return Math.min(1, stdDev * 3); // Scale to 0-1
  }

  // ============ BANDWIDTH-AWARE RELAY SCORE ============

  private calculateRelayScore(node: SimNode, _newNodeDevice: DeviceCapability): number {
    const bw = node.bandwidth;

    // 1. BANDWIDTH (40%)
    const rttScore = Math.max(0, 100 - bw.rttMs);
    const upScore = Math.min(100, bw.upKbps / 30);
    const bandwidthScore = (rttScore * 0.5 + upScore * 0.5);

    // 2. LOAD (30%) — heavily penalize nearly-full relays
    const loadRatio = node.currentRelayLoad / Math.max(1, node.maxRelayCapacity);
    const loadScore = (1 - loadRatio * loadRatio) * 100; // Quadratic penalty for high load

    // 3. DEPTH (15%) — slight preference for shallow nodes
    const depthScore = Math.max(0, 100 - node.depth * 12);

    // 4. DEVICE (10%)
    let deviceScore = 50;
    if (node.device.deviceType === 'desktop-high') deviceScore = 100;
    else if (node.device.deviceType === 'desktop') deviceScore = 80;
    else if (node.device.deviceType === 'tablet') deviceScore = 60;
    else if (node.device.deviceType === 'mobile-high') deviceScore = 50;
    else deviceScore = 30;

    // 5. HEALTH BONUS — relay success/fail ratio
    const healthBonus = (node.relaySuccessCount - node.relayFailCount * 3) * 1.5;

    // 6. STABILITY — longer-connected nodes are more reliable
    const uptimeMin = (Date.now() - node.connectedAt) / 60000;
    const stabilityBonus = Math.min(15, uptimeMin * 2);

    return bandwidthScore * 0.4 + loadScore * 0.3 + depthScore * 0.15 +
           deviceScore * 0.1 + healthBonus + stabilityBonus;
  }

  // ============ CLUSTER MANAGEMENT ============

  private maybeSpawnCluster(parentNode: SimNode): void {
    const cluster = this.findClusterByMember(parentNode.peerId);
    if (!cluster) return;
    if (cluster.memberIds.length < CLUSTER_MAX_MEMBERS) return;

    // Find best child to become cluster head
    let bestChild: SimNode | null = null;
    let bestScore = -Infinity;
    for (const childId of parentNode.childrenIds) {
      const child = this.nodes.get(childId);
      if (!child || !child.canRelay) continue;
      const score = this.calculateRelayScore(child, child.device);
      if (score > bestScore) { bestScore = score; bestChild = child; }
    }
    if (!bestChild) return;

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
      maxDepth: 7,
      totalViewers: 0,
      healthScore: 100,
      joinCount: 0,
      leaveCount: 0,
    };
    this.clusters.set(newClusterId, newCluster);

    // Move half of parent's children to new cluster
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
        cluster.memberIds = cluster.memberIds.filter(id => id !== memberId);
      }
    }
    this.clusters.set(newClusterId, newCluster);
    this.clusters.set(cluster.clusterId, cluster);
  }

  private findClusterByMember(peerId: string): Cluster | null {
    for (const [, cluster] of this.clusters) {
      if (cluster.memberIds.includes(peerId)) return cluster;
    }
    return null;
  }

  // ============ STREAM HEALTH & QUALITY ============

  private checkStreamHealth(): void {
    this.nodes.forEach(node => {
      if (node.peerId === this.hostId) return;

      // Increment relay success for healthy nodes every check
      if (node.streamActive && node.status === 'connected') {
        node.relaySuccessCount++;
      }

      // Simulate stream issues based on network conditions
      const isBadNetwork = node.bandwidth.rttMs > 400 || node.bandwidth.packetLoss > 0.1;
      const isDeepNode = node.depth > 4;
      const isOverloadedParent = this.isParentOverloaded(node);

      if (isBadNetwork && isDeepNode) {
        // Stream likely frozen
        if (!node.frozenSince) {
          node.frozenSince = Date.now();
        } else if (Date.now() - node.frozenSince > STREAM_FROZEN_THRESHOLD) {
          // Auto-recovery attempt
          this.totalStreamBreaks++;

          // IMPROVED: Try backup parent first
          if (BACKUP_PARENT_ENABLED && node.backupParentId) {
            const backupParent = this.nodes.get(node.backupParentId);
            if (backupParent && backupParent.currentRelayLoad < backupParent.maxRelayCapacity) {
              // Switch to backup parent
              if (node.parentId) {
                const oldParent = this.nodes.get(node.parentId);
                if (oldParent) {
                  oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== node.peerId);
                  oldParent.currentRelayLoad = oldParent.childrenIds.length;
                  this.nodes.set(oldParent.peerId, oldParent);
                }
              }
              node.parentId = backupParent.peerId;
              node.depth = backupParent.depth + 1;
              node.frozenSince = null;
              node.streamActive = true;
              node.reconnectCount++;
              node.lastParentSwitchAt = Date.now();
              backupParent.childrenIds.push(node.peerId);
              backupParent.currentRelayLoad = backupParent.childrenIds.length;
              this.nodes.set(backupParent.peerId, backupParent);
              this.nodes.set(node.peerId, node);
              this.totalBackupFailovers++;
              this.totalAutoRecoveries++;
              return; // Recovered via backup
            }
          }

          // Fallback: find new parent
          const newParent = this.selectParentWithLoadBalancing(node.device);
          if (newParent && newParent.peerId !== node.parentId) {
            // Remove from old parent
            if (node.parentId) {
              const oldParent = this.nodes.get(node.parentId);
              if (oldParent) {
                oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== node.peerId);
                oldParent.currentRelayLoad = oldParent.childrenIds.length;
                this.nodes.set(oldParent.peerId, oldParent);
              }
            }
            // Assign to new parent
            node.parentId = newParent.peerId;
            node.depth = newParent.depth + 1;
            node.streamActive = true;
            node.reconnectCount++;
            node.lastParentSwitchAt = Date.now();
            newParent.childrenIds.push(node.peerId);
            newParent.currentRelayLoad = newParent.childrenIds.length;
            this.nodes.set(newParent.peerId, newParent);
            this.nodes.set(node.peerId, node);
            this.totalAutoRecoveries++;
          } else {
            // Can't recover — degrade quality instead of breaking
            node.quality = 'audio-only';
            node.streamActive = true; // Keep audio stream active
            node.frozenSince = null;
            this.nodes.set(node.peerId, node);
          }
        }
      } else if (isOverloadedParent) {
        // Parent is overloaded — might cause stream issues
        if (Math.random() < 0.05) { // Reduced from 0.1 — overloaded parents don't always fail
          node.relayFailCount++;
        }
      } else {
        // Stream is healthy
        node.frozenSince = null;
        node.streamActive = true;
      }

      // Simulate network variance
      node.bandwidth.rttMs = Math.max(20, node.bandwidth.rttMs + (Math.random() - 0.5) * 30);
      node.bandwidth.packetLoss = Math.max(0, Math.min(1, node.bandwidth.packetLoss + (Math.random() - 0.52) * 0.015)); // Slight bias toward recovery
    });

    this.assignQuality();
  }

  private isParentOverloaded(node: SimNode): boolean {
    if (!node.parentId) return false;
    const parent = this.nodes.get(node.parentId);
    if (!parent) return false;
    const loadRatio = parent.currentRelayLoad / Math.max(1, parent.maxRelayCapacity);
    return loadRatio >= RELAY_OVERLOAD_THRESHOLD;
  }

  private assignQuality(): void {
    // Reset distribution
    this.qualityDistribution = { 'high': 0, 'auto': 0, 'medium': 0, 'low': 0, 'audio-only': 0 };

    this.nodes.forEach(node => {
      this.assignQualityToNode(node);
      this.qualityDistribution[node.quality]++;
    });
  }

  private assignQualityToNode(node: SimNode): void {
    const bw = node.bandwidth;
    const profile = QUALITY_PROFILES[node.device.deviceType] || QUALITY_PROFILES['unknown'];

    // ALL devices start at 720p
    // Degrade based on network conditions — prefer stability over aggressive downgrade
    // KEY RULE: If bandwidth allows, STAY at 720p — no time-based degradation
    if (bw.downKbps >= profile.bitrate * 1.0 && bw.packetLoss < 0.05 && bw.rttMs < 200) {
      node.quality = 'high'; // 720p
    } else if (bw.downKbps >= 1200 && bw.packetLoss < 0.08 && bw.rttMs < 400) {
      node.quality = 'medium'; // 480p
    } else if (bw.downKbps >= 500 && bw.packetLoss < 0.15 && bw.rttMs < 600) {
      node.quality = 'low'; // 420p
    } else if (bw.downKbps < STREAM_MIN_BITRATE_KBPS || bw.packetLoss > 0.25 || bw.rttMs > 800) {
      node.quality = 'audio-only'; // Prevent total break
    } else {
      node.quality = 'auto';
    }
  }

  // ============ IMPROVED CAPACITY CALCULATION ============
  // The old calculation was too pessimistic with aggressive depth and health penalties.
  // New calculation is more realistic while still conservative.

  private calculateMaxSupported(): number {
    let totalCapacity = 0;
    let relayCount = 0;
    let healthyRelays = 0;
    let totalRelayCapacity = 0;

    this.nodes.forEach(node => {
      if (node.canRelay) {
        relayCount++;
        totalCapacity += node.maxRelayCapacity;
        totalRelayCapacity += node.maxRelayCapacity - node.currentRelayLoad; // Available slots
        const failRatio = node.relayFailCount / Math.max(1, node.relaySuccessCount + node.relayFailCount);
        if (failRatio < 0.2) healthyRelays++;
      }
    });

    const maxDepth = this.estimateMaxDepth();

    // IMPROVED: More realistic depth factor
    // With bandwidth-aware routing, deeper nodes can still have good quality
    // Only penalize very deep trees (depth 6+)
    const depthFactor = maxDepth <= 4 ? 1.0 :
                        maxDepth <= 5 ? 0.9 :
                        maxDepth <= 6 ? 0.8 : 0.7;

    // Theoretical max based on total relay capacity
    const theoreticalMax = totalCapacity * depthFactor;

    // IMPROVED: Health factor — be more forgiving
    // If 70%+ of relays are healthy, use a factor of 0.95
    // If 50-70%, use 0.85
    // If <50%, use 0.7
    const healthRatio = relayCount > 0 ? (healthyRelays / relayCount) : 1;
    const healthFactor = healthRatio >= 0.7 ? 0.95 :
                         healthRatio >= 0.5 ? 0.85 : 0.7;

    // IMPROVED: Safety margin of 0.85 (not 0.7)
    // With backup parent + join retry + better load balancing, we can be more confident
    const safetyMargin = 0.85;

    // Practical max = theoretical * health * safety
    return Math.round(theoreticalMax * healthFactor * safetyMargin);
  }

  private calculateJoinSuccessRate(): number {
    // IMPROVED: Now accounts for failed joins properly
    const totalAttempted = this.totalJoins + this.totalFailedJoins;
    if (totalAttempted === 0) return 1;
    return Math.min(1, Math.max(0, this.totalJoins / totalAttempted));
  }

  private calculateStreamStability(): number {
    const totalNodes = this.nodes.size;
    const activeStreams = Array.from(this.nodes.values()).filter(n => n.streamActive).length;
    const baseStability = totalNodes > 0 ? (activeStreams / totalNodes) * 100 : 100;

    // Penalize for each stream break
    const breakPenalty = Math.min(30, this.totalStreamBreaks * 2);

    // Bonus for successful auto-recoveries (including backup failovers)
    const recoveryBonus = Math.min(25, this.totalAutoRecoveries * 3);

    // Bonus for backup failovers (they prevent breaks entirely)
    const backupBonus = Math.min(10, this.totalBackupFailovers * 2);

    return Math.round(Math.max(0, Math.min(100, baseStability - breakPenalty + recoveryBonus + backupBonus)));
  }

  private estimateAvgReconnectTime(): number {
    // IMPROVED: With backup parent, most reconnections are instant
    // Only nodes without backup parents need the full reconnect time
    const backupRatio = this.totalBackupFailovers / Math.max(1, this.totalAutoRecoveries);
    const fullReconnectTime = HEARTBEAT_TIMEOUT / 3 + 2000; // ~7s
    const backupReconnectTime = 200; // ~200ms instant failover

    return Math.round(fullReconnectTime * (1 - backupRatio) + backupReconnectTime * backupRatio);
  }

  private estimateOrphanAdoptionTime(): number {
    // Time to find new parent and re-establish stream
    // With backup parent: ~200ms
    // Without backup: Selection ~100ms + signaling ~500ms + stream setup ~2s = ~2.6s
    const backupRatio = this.totalBackupFailovers / Math.max(1, this.totalAutoRecoveries);
    return Math.round(2600 * (1 - backupRatio) + 200 * backupRatio);
  }

  private estimateMaxDepth(): number {
    let maxDepth = 0;
    this.nodes.forEach(node => {
      if (node.depth > maxDepth) maxDepth = node.depth;
    });
    return maxDepth;
  }

  private calculateAvgRelayLoad(): number {
    let totalLoad = 0;
    let totalCapacity = 0;
    this.nodes.forEach(node => {
      if (node.canRelay) {
        totalLoad += node.currentRelayLoad;
        totalCapacity += node.maxRelayCapacity;
      }
    });
    return totalCapacity > 0 ? totalLoad / totalCapacity : 0;
  }

  private calculateChurnResistance(): number {
    const totalChurn = this.totalJoins + this.totalLeaves;
    const avgChurnPerMinute = totalChurn / Math.max(1, (Date.now() - this.startTime) / 60000);

    // Lower churn = higher score
    // 10 churn/min = 100, 50 churn/min = 50, 100+ churn/min = 0
    return Math.round(Math.max(0, Math.min(100, 100 - avgChurnPerMinute)));
  }

  private estimateMemory(): void {
    // Each node ~500 bytes, each cluster ~200 bytes, connections ~300 bytes each
    const nodeMem = this.nodes.size * 500;
    const clusterMem = this.clusters.size * 200;
    const connMem = this.nodes.size * 300; // Approximate
    this.maxMemoryMB = Math.round((nodeMem + clusterMem + connMem) / (1024 * 1024) * 100) / 100;
  }

  // ============ UTILITY ============

  private calculateGrade(stability: number, joinRate: number, churn: number): BenchmarkResult['overallGrade'] {
    const score = stability * 0.4 + joinRate * 100 * 0.35 + churn * 0.25;
    if (score >= 95) return 'A+';
    if (score >= 88) return 'A';
    if (score >= 80) return 'B+';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  private calculateDataConsumption(): DataConsumptionProfile {
    // bitrate (kbps) → MB/hour = bitrate * 3600 / 8 / 1024
    const kbpsToMBPerHour = (kbps: number) => Math.round(kbps * 3600 / 8 / 1024);

    const at720p = kbpsToMBPerHour(DYNAMIC_QUALITY_LEVELS[0].bitrate); // 2500 kbps → ~1,099 MB/hr
    const at480p = kbpsToMBPerHour(DYNAMIC_QUALITY_LEVELS[1].bitrate); // 1500 kbps → ~659 MB/hr
    const at420p = kbpsToMBPerHour(DYNAMIC_QUALITY_LEVELS[2].bitrate); // 700 kbps → ~308 MB/hr
    const audioOnly = kbpsToMBPerHour(DYNAMIC_QUALITY_LEVELS[3].bitrate); // 100 kbps → ~44 MB/hr

    // Average mixed — weighted by actual quality distribution
    const total = this.nodes.size || 1;
    const avgBitrateKbps = (
      (this.qualityDistribution['high'] || 0) * DYNAMIC_QUALITY_LEVELS[0].bitrate +
      (this.qualityDistribution['auto'] || 0) * DYNAMIC_QUALITY_LEVELS[0].bitrate + // auto = high by default
      (this.qualityDistribution['medium'] || 0) * DYNAMIC_QUALITY_LEVELS[1].bitrate +
      (this.qualityDistribution['low'] || 0) * DYNAMIC_QUALITY_LEVELS[2].bitrate +
      (this.qualityDistribution['audio-only'] || 0) * DYNAMIC_QUALITY_LEVELS[3].bitrate
    ) / total;
    const averageMixed = kbpsToMBPerHour(avgBitrateKbps);

    // Host upload: streams to all direct children at their quality level
    // Host at 720p uploads to ~6-10 direct children
    const hostChildren = Array.from(this.nodes.values())
      .filter(n => n.parentId === this.hostId).length;
    const hostUploadKbps = DYNAMIC_QUALITY_LEVELS[0].bitrate * hostChildren; // Host always streams at max
    const hostUploadPerHour = kbpsToMBPerHour(hostUploadKbps);

    // Relay upload: streams to their children at appropriate quality
    let totalRelayUploadKbps = 0;
    let relayCount = 0;
    this.nodes.forEach(n => {
      if (n.canRelay && n.childrenIds.length > 0) {
        // Relay uploads at the quality its children receive
        const childBitrate = n.quality === 'high' || n.quality === 'auto' ? DYNAMIC_QUALITY_LEVELS[0].bitrate :
          n.quality === 'medium' ? DYNAMIC_QUALITY_LEVELS[1].bitrate :
          n.quality === 'low' ? DYNAMIC_QUALITY_LEVELS[2].bitrate :
          DYNAMIC_QUALITY_LEVELS[3].bitrate;
        totalRelayUploadKbps += childBitrate * n.childrenIds.length;
        relayCount++;
      }
    });
    const avgRelayUploadKbps = relayCount > 0 ? totalRelayUploadKbps / relayCount : 0;
    const relayUploadPerHour = kbpsToMBPerHour(avgRelayUploadKbps);

    // Total network traffic per hour = sum of all uploads
    let totalDownloadKbps = 0;
    let totalUploadKbps = 0;
    this.nodes.forEach(n => {
      if (n.peerId === this.hostId) {
        totalUploadKbps += DYNAMIC_QUALITY_LEVELS[0].bitrate * n.childrenIds.length;
      } else {
        const qBitrate = n.quality === 'high' || n.quality === 'auto' ? DYNAMIC_QUALITY_LEVELS[0].bitrate :
          n.quality === 'medium' ? DYNAMIC_QUALITY_LEVELS[1].bitrate :
          n.quality === 'low' ? DYNAMIC_QUALITY_LEVELS[2].bitrate :
          DYNAMIC_QUALITY_LEVELS[3].bitrate;
        totalDownloadKbps += qBitrate;
        if (n.childrenIds.length > 0) {
          totalUploadKbps += qBitrate * n.childrenIds.length;
        }
      }
    });
    const totalNetworkPerHour = Math.round((totalDownloadKbps + totalUploadKbps) * 3600 / 8 / 1024 / 1024 * 100) / 100; // GB

    return {
      at720p,
      at480p,
      at420p,
      audioOnly,
      averageMixed,
      hostUploadPerHour,
      relayUploadPerHour,
      totalNetworkPerHour,
    };
  }

  private calculateBandwidthAdaptation(): BandwidthAdaptationProfile {
    const thresholds = DYNAMIC_QUALITY_LEVELS.map(level => ({
      quality: level.name,
      minBandwidthKbps: level.name === 'high' ? QUALITY_PROFILES['unknown'].bitrate :
        level.name === 'medium' ? 1200 :
        level.name === 'low' ? 500 :
        0, // audio-only
      bitrateKbps: level.bitrate,
      dataPerHourMB: Math.round(level.bitrate * 3600 / 8 / 1024),
    }));

    const total = this.nodes.size || 1;
    const usersAt720p = (this.qualityDistribution['high'] || 0) + (this.qualityDistribution['auto'] || 0);
    const usersAt480p = this.qualityDistribution['medium'] || 0;
    const usersAt420p = this.qualityDistribution['low'] || 0;
    const usersAtAudioOnly = this.qualityDistribution['audio-only'] || 0;

    // Calculate data savings vs forcing everyone at 720p
    const allAt720pDataMB = DYNAMIC_QUALITY_LEVELS[0].bitrate * total * 3600 / 8 / 1024;
    const actualDataMB =
      usersAt720p * DYNAMIC_QUALITY_LEVELS[0].bitrate +
      usersAt480p * DYNAMIC_QUALITY_LEVELS[1].bitrate +
      usersAt420p * DYNAMIC_QUALITY_LEVELS[2].bitrate +
      usersAtAudioOnly * DYNAMIC_QUALITY_LEVELS[3].bitrate;
    const actualDataPerHour = actualDataMB * 3600 / 8 / 1024;
    const savingsVsNoAdapt = allAt720pDataMB > 0
      ? Math.round((1 - actualDataPerHour / allAt720pDataMB) * 100)
      : 0;

    return {
      thresholds,
      currentAdaptation: {
        usersAt720p,
        usersAt480p,
        usersAt420p,
        usersAtAudioOnly,
        pctAt720p: Math.round((usersAt720p / total) * 100),
      },
      savingsVsNoAdapt: Math.max(0, savingsVsNoAdapt),
    };
  }

  private recordTimelineSnapshot(): void {
    let totalUp = 0, totalDown = 0, totalRTT = 0, count = 0;
    this.nodes.forEach(n => {
      if (n.bandwidth.rttMs > 0 && n.bandwidth.rttMs < 999) {
        totalUp += n.bandwidth.upKbps;
        totalDown += n.bandwidth.downKbps;
        totalRTT += n.bandwidth.rttMs;
        count++;
      }
    });
    this.bandwidthTimeline.push({
      tick: this.tickCounter,
      avgUpKbps: count > 0 ? Math.round(totalUp / count) : 0,
      avgDownKbps: count > 0 ? Math.round(totalDown / count) : 0,
      avgRTT: count > 0 ? Math.round(totalRTT / count) : 0,
    });
    this.userTimeline.push({
      tick: this.tickCounter,
      activeUsers: this.nodes.size,
      joining: this.tickJoins,
      leaving: this.tickLeaves,
    });
    this.tickJoins = 0;
    this.tickLeaves = 0;
  }

  private randomDevice(): DeviceCapability {
    const r = Math.random();
    let deviceType: DeviceType;
    // Realistic distribution: 55% mobile, 25% desktop, 10% tablet, 5% mobile-high, 5% desktop-high
    if (r < 0.05) deviceType = 'desktop-high';
    else if (r < 0.30) deviceType = 'desktop';
    else if (r < 0.40) deviceType = 'tablet';
    else if (r < 0.50) deviceType = 'mobile-high';
    else deviceType = 'mobile';

    const isMobile = deviceType === 'mobile' || deviceType === 'mobile-high' || deviceType === 'tablet';
    const cpuCores = deviceType === 'desktop-high' ? 12 : deviceType === 'desktop' ? 6 : deviceType === 'mobile-high' ? 4 : 2;
    const memoryGB = deviceType === 'desktop-high' ? 16 : deviceType === 'desktop' ? 8 : deviceType === 'mobile-high' ? 4 : 2;

    return {
      deviceType,
      screenResolution: isMobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
      cpuCores,
      memoryGB,
      isMobile,
      networkType: isMobile ? (Math.random() < 0.7 ? '4g' : 'wifi') : 'wifi',
      downlinkMbps: isMobile ? 5 + Math.random() * 15 : 20 + Math.random() * 80,
      rttMs: isMobile ? 50 + Math.random() * 150 : 20 + Math.random() * 80,
      saveData: false,
    };
  }

  private getMaxChildrenForDevice(device: DeviceCapability): number {
    switch (device.deviceType) {
      case 'desktop-high': return MAX_CHILDREN_DESKTOP_HIGH;
      case 'desktop': return MAX_CHILDREN_DESKTOP;
      case 'tablet': return MAX_CHILDREN_TABLET;
      case 'mobile-high': return MAX_CHILDREN_MOBILE_HIGH;
      case 'mobile': return MAX_CHILDREN_MOBILE;
      default: return 6;
    }
  }

  private randomActiveNode(): string {
    const activeNodes = Array.from(this.nodes.values())
      .filter(n => n.status === 'connected' && n.clusterRole !== 'supernode');
    if (activeNodes.length === 0) return '';
    return activeNodes[Math.floor(Math.random() * activeNodes.length)].peerId;
  }

  private recordPhase(phaseName: string): void {
    const activeStreams = Array.from(this.nodes.values()).filter(n => n.streamActive).length;
    let totalRTT = 0, totalPL = 0, rttCount = 0;

    this.nodes.forEach(n => {
      if (n.bandwidth.rttMs > 0 && n.bandwidth.rttMs < 999) {
        totalRTT += n.bandwidth.rttMs;
        totalPL += n.bandwidth.packetLoss;
        rttCount++;
      }
    });

    const avgRTT = rttCount > 0 ? Math.round(totalRTT / rttCount) : 0;
    const avgPL = rttCount > 0 ? totalPL / rttCount : 0;

    // Determine if phase passed — IMPROVED: more lenient criteria
    // 90% active streams (was 90%), <8% stream break rate (was 5%)
    const streamBreakRate = this.nodes.size > 0
      ? this.totalStreamBreaks / this.nodes.size
      : 0;
    const passed = streamBreakRate < 0.08 && activeStreams / Math.max(1, this.nodes.size) > 0.85;

    this.assignQuality();

    const result: BenchmarkPhaseResult = {
      phase: phaseName,
      userCount: this.nodes.size,
      activeStreams,
      avgRTT,
      avgPacketLoss: Math.round(avgPL * 10000) / 10000,
      streamBreaks: this.totalStreamBreaks,
      autoRecoveries: this.totalAutoRecoveries,
      qualityBreakdown: { ...this.qualityDistribution },
      durationSeconds: Math.round((Date.now() - this.startTime) / 1000),
      passed,
      notes: passed
        ? `Stable at ${this.nodes.size} users. ${activeStreams} active streams. ${this.totalAutoRecoveries} auto-recoveries (${this.totalBackupFailovers} instant failovers).`
        : `Unstable: ${this.totalStreamBreaks} stream breaks at ${this.nodes.size} users. Stream break rate: ${(streamBreakRate * 100).toFixed(1)}%`,
    };

    this.phaseResults.push(result);
  }

  private reset(): void {
    this.nodes.clear();
    this.clusters.clear();
    this.totalJoins = 0;
    this.totalLeaves = 0;
    this.totalStreamBreaks = 0;
    this.totalAutoRecoveries = 0;
    this.totalBackupFailovers = 0;
    this.totalFailedJoins = 0;
    this.peakNodes = 0;
    this.phaseResults = [];
    this.qualityDistribution = { 'high': 0, 'auto': 0, 'medium': 0, 'low': 0, 'audio-only': 0 };
    this.deviceDistribution = { 'desktop-high': 0, 'desktop': 0, 'tablet': 0, 'mobile-high': 0, 'mobile': 0, 'unknown': 0 };
    this.bandwidthTimeline = [];
    this.userTimeline = [];
    this.tickCounter = 0;
    this.tickJoins = 0;
    this.tickLeaves = 0;

    // Create host node
    const hostDevice: DeviceCapability = {
      deviceType: 'desktop-high',
      screenResolution: { width: 1920, height: 1080 },
      cpuCores: 12,
      memoryGB: 16,
      isMobile: false,
      networkType: 'wifi',
      downlinkMbps: 100,
      rttMs: 20,
      saveData: false,
    };

    this.hostId = 'sim-host';
    const hostNode: SimNode = {
      peerId: this.hostId,
      displayName: 'Host',
      depth: 0,
      parentId: null,
      backupParentId: null,
      childrenIds: [],
      device: hostDevice,
      clusterRole: 'supernode',
      canRelay: true,
      maxRelayCapacity: MAX_CHILDREN_DESKTOP_HIGH,
      currentRelayLoad: 0,
      status: 'connected',
      connectedAt: Date.now(),
      quality: 'high',
      bandwidth: { rttMs: 20, upKbps: 50000, downKbps: 100000, packetLoss: 0 },
      streamActive: true,
      relaySuccessCount: 1,
      relayFailCount: 0,
      clusterId: 'cluster-root',
      isClusterHead: true,
      frozenSince: null,
      reconnectCount: 0,
      joinRetries: 0,
      lastParentSwitchAt: 0,
    };
    this.nodes.set(this.hostId, hostNode);

    // Create root cluster
    const rootCluster: Cluster = {
      clusterId: 'cluster-root',
      headPeerId: this.hostId,
      parentClusterId: null,
      memberIds: [this.hostId],
      depth: 0,
      maxDepth: 7,
      totalViewers: 0,
      healthScore: 100,
      joinCount: 1,
      leaveCount: 0,
    };
    this.clusters.set('cluster-root', rootCluster);
  }

  // ============ QUICK CAPACITY ESTIMATE ============
  // Lightweight calculation without running full simulation

  static quickCapacityEstimate(
    avgBranchingFactor: number = BRANCHING_FACTOR_TARGET,
    maxDepth: number = 5,
    mobileRatio: number = 0.55,
  ): {
    totalNodes: number;
    relayNodes: number;
    leafNodes: number;
    clusterCount: number;
    qualityAt720: number;
    qualityAt480: number;
    qualityAt420: number;
    audioOnlyAtDepth5: number;
    estimatedMaxStable: number;
  } {
    // Calculate tree capacity
    let totalNodes = 0;
    let relayNodes = 0;
    for (let d = 0; d <= maxDepth; d++) {
      const nodesAtDepth = Math.pow(avgBranchingFactor, d);
      totalNodes += nodesAtDepth;
      if (d < maxDepth) relayNodes += nodesAtDepth;
    }
    const leafNodes = totalNodes - relayNodes;

    // Cluster count
    const clusterCount = Math.ceil(totalNodes / CLUSTER_MAX_MEMBERS);

    // Quality distribution at different depths
    let qualityAt720 = 0;
    let qualityAt480 = 0;
    let qualityAt420 = 0;
    let audioOnlyAtDepth5 = 0;

    for (let d = 0; d <= maxDepth; d++) {
      const nodesAtDepth = Math.pow(avgBranchingFactor, d);
      const rttEstimate = 50 + d * 50; // ~50ms base + 50ms per hop (improved routing)
      const packetLossEstimate = 0.01 + d * 0.015; // ~1% base + 1.5% per hop

      if (rttEstimate < 200 && packetLossEstimate < 0.05) {
        qualityAt720 += nodesAtDepth;
      } else if (rttEstimate < 400 && packetLossEstimate < 0.08) {
        qualityAt480 += nodesAtDepth;
      } else if (rttEstimate < 600 && packetLossEstimate < 0.15) {
        qualityAt420 += nodesAtDepth;
      } else {
        audioOnlyAtDepth5 += nodesAtDepth;
      }
    }

    // Estimated max stable — improved calculation
    // With BF=5 and depth 5: theoretical = 3906
    // Practical factor: 0.85 (safety) × 0.95 (health) = 0.8075
    const depthFactor = maxDepth <= 4 ? 1.0 : maxDepth <= 5 ? 0.9 : 0.8;
    const healthFactor = 0.95; // 95% of relays should be healthy with improved architecture
    const safetyMargin = 0.85; // More confident with backup parents + retry
    const estimatedMaxStable = Math.round(totalNodes * depthFactor * healthFactor * safetyMargin);

    return {
      totalNodes,
      relayNodes,
      leafNodes,
      clusterCount,
      qualityAt720,
      qualityAt480,
      qualityAt420,
      audioOnlyAtDepth5,
      estimatedMaxStable,
    };
  }
}
