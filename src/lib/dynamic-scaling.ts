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
}
