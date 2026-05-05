'use client';

import { useRoomStore } from '@/store/room-store';
import { TreeNode, RoomInfo } from '@/lib/types';
import { DynamicScalingEngine, ScalingTier, TIER_CONFIGS } from '@/lib/dynamic-scaling';
import {
  Activity, Zap, Shield, Users, TrendingUp, TrendingDown,
  Wifi, WifiOff, Server, AlertTriangle, CheckCircle2, XCircle,
  ArrowUpCircle, ArrowDownCircle, Radio, Gauge, TreePine,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const TIER_COLORS: Record<ScalingTier, { bg: string; text: string; border: string }> = {
  tier1: { bg: 'bg-zinc-500/20', text: 'text-zinc-400', border: 'border-zinc-600' },
  tier2: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-600' },
  tier3: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-600' },
  tier4: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-600' },
  tier5: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-600' },
};

const TIER_LABELS: Record<ScalingTier, string> = {
  tier1: 'Direct',
  tier2: 'Roots',
  tier3: 'Roots+Branches',
  tier4: 'Deep Tree',
  tier5: 'Super-Tree',
};

/**
 * TreeHealthDashboard — Real-time monitoring for 10K user webinars
 * Shows root/sub-root status, bandwidth distribution, relay health,
 * tier-aware capacity metrics, and purposeful scaling recommendations.
 * Essential for hosts on mobile devices.
 */
export function TreeHealthDashboard() {
  const { nodes, roomInfo, myNode, networkHealth, engine } = useRoomStore();

  if (!roomInfo || !myNode) return null;

  const allNodes = Array.from(nodes.values());
  const rootNodes = allNodes.filter(n => n.isRoot);
  const subRootNodes = allNodes.filter(n => n.isSubRoot);
  const relayNodes = allNodes.filter(n => n.canRelay && n.status === 'connected');
  const leafNodes = allNodes.filter(n => !n.canRelay || n.clusterRole === 'leaf');
  const viewerCount = allNodes.filter(n => n.role === 'viewer').length;

  // Bandwidth calculations
  const hostBwInfo = engine?.getHostBandwidthInfo();
  const isLowBandwidth = hostBwInfo?.isLowBandwidth ?? false;
  const hostUploadKbps = hostBwInfo?.uploadKbps ?? 0;
  const effectiveMaxRoots = hostBwInfo?.effectiveMaxRoots ?? 20;

  // Tree depth
  const maxDepth = Math.max(0, ...allNodes.map(n => n.depth));

  // Root health breakdown
  const healthyRoots = rootNodes.filter(r => r.bandwidth.rttMs < 150 && r.currentRelayLoad < r.maxRelayCapacity * 0.9).length;
  const degradedRoots = rootNodes.filter(r => r.bandwidth.rttMs >= 150 && r.bandwidth.rttMs < 300).length;
  const criticalRoots = rootNodes.filter(r => r.bandwidth.rttMs >= 300 || r.currentRelayLoad >= r.maxRelayCapacity * 0.9).length;

  // Total relay capacity
  const totalRelayCapacity = relayNodes.reduce((sum, n) => sum + n.maxRelayCapacity, 0);
  const totalRelayLoad = relayNodes.reduce((sum, n) => sum + n.currentRelayLoad, 0);
  const utilizationPct = totalRelayCapacity > 0 ? Math.round((totalRelayLoad / totalRelayCapacity) * 100) : 0;

  // Bandwidth distribution
  const avgRtt = allNodes.filter(n => n.bandwidth.rttMs > 0 && n.bandwidth.rttMs < 999)
    .reduce((sum, n, _, arr) => {
      if (arr.length === 0) return 0;
      return sum + n.bandwidth.rttMs;
    }, 0) / Math.max(1, allNodes.filter(n => n.bandwidth.rttMs > 0 && n.bandwidth.rttMs < 999).length);

  // Dynamic scaling info
  const scalingInfo = engine?.getScalingInfo();
  const currentTier = (scalingInfo?.tier as ScalingTier) ?? 'tier1';
  const tierConfig = TIER_CONFIGS[currentTier];
  const tierColor = TIER_COLORS[currentTier];
  const recommendations = scalingInfo?.recommendations ?? [];

  // Capacity estimate — tier-aware
  const capacityForCurrentRoots = rootNodes.length > 0
    ? rootNodes.length * (tierConfig.branchesPerRoot || 1) * (tierConfig.subBranchesPerBranch > 0 ? tierConfig.subBranchesPerBranch * tierConfig.viewersPerSubBranch : tierConfig.viewersPerBranch || tierConfig.rootRelayCapacity)
    : 0;
  const rootsNeededFor1000 = Math.ceil(1000 / (8 * 10)); // 13 roots for 1000 viewers
  const rootsNeededForCurrent = Math.ceil(viewerCount / (8 * 10));

  // Network health
  const churnScore = networkHealth?.churnScore ?? 100;
  const joinRate = networkHealth?.joinRate ?? 0;
  const leaveRate = networkHealth?.leaveRate ?? 0;

  return (
    <div className="flex flex-col gap-3 p-4 text-xs select-none">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TreePine className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-zinc-200">Tree Architecture Health</span>
        <Badge className={`text-[8px] border-0 ${churnScore > 70 ? 'bg-emerald-500/20 text-emerald-400' : churnScore > 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
          {churnScore > 70 ? 'STABLE' : churnScore > 40 ? 'DEGRADED' : 'UNSTABLE'}
        </Badge>
        <Badge className={`text-[8px] border-0 ${tierColor.bg} ${tierColor.text}`}>
          {TIER_LABELS[currentTier]}
        </Badge>
      </div>

      {/* Capacity Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <MetricCard icon={<Users className="w-3.5 h-3.5 text-blue-400" />} label="Viewers" value={viewerCount} subtext={`of ${roomInfo.peakParticipants} peak`} color="blue" />
        <MetricCard icon={<Zap className="w-3.5 h-3.5 text-emerald-400" />} label="Roots" value={rootNodes.length} subtext={`Target: ${tierConfig.targetRoots}`} color="emerald" />
        <MetricCard icon={<Shield className="w-3.5 h-3.5 text-cyan-400" />} label="Sub-Roots" value={subRootNodes.length} subtext={`Target: ${tierConfig.targetSubRoots}`} color="cyan" />
        <MetricCard icon={<Gauge className="w-3.5 h-3.5 text-violet-400" />} label="Utilization" value={`${utilizationPct}%`} subtext={`${totalRelayLoad}/${totalRelayCapacity} relay`} color={utilizationPct > 80 ? 'red' : utilizationPct > 50 ? 'amber' : 'emerald'} />
        <MetricCard icon={<Activity className="w-3.5 h-3.5 text-amber-400" />} label="Tier" value={TIER_LABELS[currentTier]} subtext={`Max ${tierConfig.maxViewers.toLocaleString()}`} color={currentTier === 'tier5' ? 'red' : currentTier === 'tier4' ? 'amber' : 'emerald'} />
      </div>

      {/* Host Bandwidth */}
      <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-zinc-400 font-medium">Host Upload</span>
          <div className="flex items-center gap-1.5">
            <ArrowUpCircle className={`w-3 h-3 ${isLowBandwidth ? 'text-amber-400' : 'text-emerald-400'}`} />
            <span className={`font-bold ${isLowBandwidth ? 'text-amber-400' : 'text-emerald-400'}`}>
              {hostUploadKbps} kbps
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isLowBandwidth ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (hostUploadKbps / 10000) * 100)}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-zinc-600">
          <span>Max roots: {effectiveMaxRoots}</span>
          <span>{isLowBandwidth ? '⚡ Low bandwidth mode' : '✓ Good bandwidth'}</span>
        </div>
      </div>

      {/* Root Nodes Detail */}
      <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-zinc-400 font-medium flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-emerald-400" />
            Root Nodes
          </span>
          <div className="flex items-center gap-1">
            {healthyRoots > 0 && <Badge className="text-[8px] bg-emerald-500/20 text-emerald-400 border-0 h-4 px-1">{healthyRoots} ✓</Badge>}
            {degradedRoots > 0 && <Badge className="text-[8px] bg-amber-500/20 text-amber-400 border-0 h-4 px-1">{degradedRoots} ⚠</Badge>}
            {criticalRoots > 0 && <Badge className="text-[8px] bg-red-500/20 text-red-400 border-0 h-4 px-1">{criticalRoots} ✗</Badge>}
          </div>
        </div>

        {rootNodes.length === 0 ? (
          <div className="text-center py-4 text-zinc-600">
            <Server className="w-6 h-6 mx-auto mb-1 opacity-40" />
            <p>No root nodes yet</p>
            <p className="text-[10px] mt-1">Roots are auto-selected from high-bandwidth viewers after 20s</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
            {rootNodes.map(root => (
              <RootNodeRow key={root.peerId} node={root} />
            ))}
          </div>
        )}
      </div>

      {/* Capacity Planning */}
      <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3 h-3 text-violet-400" />
          <span className="text-zinc-400 font-medium">Capacity Planning</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-zinc-200">{capacityForCurrentRoots}</div>
            <div className="text-[9px] text-zinc-600">Current Capacity</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${rootNodes.length >= rootsNeededFor1000 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {rootNodes.length >= rootsNeededFor1000 ? '✓' : '✗'}
            </div>
            <div className="text-[9px] text-zinc-600">1000+ Ready</div>
          </div>
          <div>
            <div className="text-lg font-bold text-zinc-200">{rootsNeededForCurrent}</div>
            <div className="text-[9px] text-zinc-600">Roots Needed</div>
          </div>
        </div>
        {/* Capacity bar */}
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
            <span>0</span>
            <span>500</span>
            <span>1000</span>
            <span>2000</span>
          </div>
          <div className="relative h-3 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500/40 transition-all"
              style={{ width: `${Math.min(100, (viewerCount / 2000) * 100)}%` }}
            />
            <div
              className="absolute top-0 h-full w-0.5 bg-emerald-400"
              style={{ left: `${Math.min(100, (capacityForCurrentRoots / 2000) * 100)}%` }}
            />
            <div
              className="absolute top-0 h-full w-0.5 bg-amber-400"
              style={{ left: '50%' }}
              title="1000 users"
            />
          </div>
        </div>
      </div>

      {/* Network Metrics */}
      <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
        <div className="flex items-center gap-1.5 mb-2">
          <Activity className="w-3 h-3 text-blue-400" />
          <span className="text-zinc-400 font-medium">Network Metrics</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NetworkMetric label="Avg RTT" value={`${Math.round(avgRtt)}ms`} good={avgRtt < 150} />
          <NetworkMetric label="Max Depth" value={`${maxDepth}`} good={maxDepth <= 4} />
          <NetworkMetric label="Join Rate" value={`${joinRate}/min`} good={joinRate < 30} />
          <NetworkMetric label="Leave Rate" value={`${leaveRate}/min`} good={leaveRate < 10} />
          <NetworkMetric label="Relay Nodes" value={`${relayNodes.length}`} good={relayNodes.length >= 5} />
          <NetworkMetric label="Leaf Nodes" value={`${leafNodes.length}`} good />
        </div>
      </div>

      {/* Scaling Recommendations — WHY things happen */}
      {recommendations.length > 0 && (
        <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3 h-3 text-violet-400" />
            <span className="text-zinc-400 font-medium">Scaling Actions</span>
            <span className="text-[9px] text-zinc-600 ml-1">— why things happen</span>
          </div>
          <div className="space-y-1.5">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 py-1.5 px-2 rounded bg-zinc-800/50">
                <span className={`text-[9px] font-bold mt-0.5 ${
                  rec.priority === 'critical' ? 'text-red-400' :
                  rec.priority === 'high' ? 'text-amber-400' :
                  rec.priority === 'normal' ? 'text-blue-400' : 'text-zinc-500'
                }`}>
                  {rec.priority.toUpperCase()}
                </span>
                <div className="flex-1">
                  <div className="text-[11px] text-zinc-300">{rec.action}</div>
                  <div className="text-[9px] text-zinc-600 italic">{rec.reason}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Architecture Summary */}
      <div className="bg-zinc-900/40 rounded-lg p-3 border border-zinc-800/50">
        <div className="text-[10px] text-zinc-600 space-y-0.5">
          <p>🏗️ Tier {currentTier.replace('tier', '')}: {tierConfig.reason}</p>
          <p>🌳 Tree: Host → {rootNodes.length} Roots → Branches → Leaves (depth ≤ {tierConfig.maxTreeDepth})</p>
          <p>📡 Host quality: {tierConfig.hostQuality} | {rootNodes.length > 0 ? `Only uploads to ${rootNodes.length} roots` : 'Serves viewers directly'}</p>
          <p>🛡️ {subRootNodes.length} sub-roots ready for instant failover</p>
          <p>📊 Capacity: {capacityForCurrentRoots.toLocaleString()} viewers | Target: {tierConfig.maxViewers.toLocaleString()}</p>
          {isLowBandwidth && <p className="text-amber-500">⚠️ Low bandwidth: max {effectiveMaxRoots} roots (was {tierConfig.maxRoots})</p>}
        </div>
      </div>
    </div>
  );
}

// Sub-components

function MetricCard({ icon, label, value, subtext, color }: {
  icon: React.ReactNode; label: string; value: string | number; subtext: string; color: string;
}) {
  const valueColorClass =
    color === 'emerald' ? 'text-emerald-400' :
    color === 'red' ? 'text-red-400' :
    color === 'amber' ? 'text-amber-400' :
    color === 'cyan' ? 'text-cyan-400' :
    color === 'violet' ? 'text-violet-400' :
    color === 'blue' ? 'text-blue-400' : 'text-zinc-200';

  return (
    <div className="bg-zinc-900/60 rounded-lg p-2.5 border border-zinc-800">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold ${valueColorClass}`}>{value}</div>
      <div className="text-[9px] text-zinc-600 mt-0.5">{subtext}</div>
    </div>
  );
}

function RootNodeRow({ node }: { node: TreeNode }) {
  const loadPct = node.maxRelayCapacity > 0
    ? Math.round((node.currentRelayLoad / node.maxRelayCapacity) * 100)
    : 0;
  const isHealthy = node.bandwidth.rttMs < 150 && loadPct < 90;
  const isDegraded = node.bandwidth.rttMs >= 150 && node.bandwidth.rttMs < 300;

  const statusIcon = isHealthy
    ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
    : isDegraded
    ? <AlertTriangle className="w-3 h-3 text-amber-400" />
    : <XCircle className="w-3 h-3 text-red-400" />;

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-zinc-800/50">
      {statusIcon}
      <span className="text-zinc-300 truncate max-w-[80px] text-[11px]">{node.displayName}</span>
      <div className="flex-1" />
      <span className="text-[9px] text-zinc-500">{node.bandwidth.estimatedUpKbps}↑</span>
      <span className={`text-[9px] ${node.bandwidth.rttMs < 150 ? 'text-emerald-500' : node.bandwidth.rttMs < 300 ? 'text-amber-500' : 'text-red-500'}`}>
        {Math.round(node.bandwidth.rttMs)}ms
      </span>
      <div className="w-12 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${loadPct >= 90 ? 'bg-red-500' : loadPct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${loadPct}%` }}
        />
      </div>
      <span className="text-[9px] text-zinc-500 w-8 text-right">{node.currentRelayLoad}/{node.maxRelayCapacity}</span>
    </div>
  );
}

function NetworkMetric({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-medium ${good ? 'text-emerald-400' : 'text-amber-400'}`}>{value}</span>
    </div>
  );
}
