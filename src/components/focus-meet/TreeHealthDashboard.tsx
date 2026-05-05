'use client';

import { useRoomStore } from '@/store/room-store';
import { TreeNode, RoomInfo } from '@/lib/types';
import { DynamicScalingEngine, ScalingTier, TIER_CONFIGS, ContentDeliveryMode } from '@/lib/dynamic-scaling';
import { ContentRelayStats } from '@/lib/content-chunk-relay';
import {
  Activity, Zap, Shield, Users, TrendingUp, TrendingDown,
  Wifi, WifiOff, Server, AlertTriangle, CheckCircle2, XCircle,
  ArrowUpCircle, ArrowDownCircle, Radio, Gauge, TreePine,
  Clock, Database, HardDrive,
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

const DELIVERY_MODE_COLORS: Record<ContentDeliveryMode, { bg: string; text: string; icon: string }> = {
  realtime: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: '⚡' },
  buffered: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: '⏱' },
  chunked: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: '📦' },
};

/** Log-scale mapping for 0-10000 viewer range */
const LOG_MARKERS = [0, 50, 200, 1000, 5000, 10000];

function viewerToLogPercent(count: number): number {
  if (count <= 0) return 0;
  if (count >= 10000) return 100;
  // Log scale: log(count+1) / log(10001) * 100
  return (Math.log(count + 1) / Math.log(10001)) * 100;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

/**
 * TreeHealthDashboard — Real-time monitoring for 10K user webinars
 * Shows root/sub-root status, bandwidth distribution, relay health,
 * tier-aware capacity metrics, content delivery mode, and purposeful scaling recommendations.
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

  // Content delivery info
  const contentDeliveryConfig = engine?.getContentDeliveryConfig();
  const deliveryMode: ContentDeliveryMode = contentDeliveryConfig?.mode ?? 'realtime';
  const deliveryModeColor = DELIVERY_MODE_COLORS[deliveryMode];
  const maxAcceptableLatency = tierConfig.maxAcceptableLatencyMs;

  // Latency estimate
  const latencyEstimate = engine?.estimateDeliveryLatency();
  const estimatedLatencyMs = latencyEstimate?.estimatedMs ?? 0;
  const withinTolerance = latencyEstimate?.withinTolerance ?? true;
  const latencyBreakdown = latencyEstimate?.breakdown;

  // Content relay stats
  const relayStats: ContentRelayStats | null = engine?.getContentRelayStats() ?? null;
  const bufferUtilizationPct = relayStats ? Math.round(relayStats.bufferUtilization * 100) : 0;
  const bufferColorClass = bufferUtilizationPct < 50 ? 'text-emerald-400' : bufferUtilizationPct < 85 ? 'text-amber-400' : 'text-red-400';
  const bufferBarColorClass = bufferUtilizationPct < 50 ? 'bg-emerald-500' : bufferUtilizationPct < 85 ? 'bg-amber-500' : 'bg-red-500';

  // Capacity estimate — tier-aware
  const capacityForCurrentRoots = rootNodes.length > 0
    ? rootNodes.length * (tierConfig.branchesPerRoot || 1) * (tierConfig.subBranchesPerBranch > 0 ? tierConfig.subBranchesPerBranch * tierConfig.viewersPerSubBranch : tierConfig.viewersPerBranch || tierConfig.rootRelayCapacity)
    : viewerCount > 0 ? tierConfig.maxViewers : 0;
  const rootsNeededForCurrent = Math.ceil(viewerCount / (8 * 10));

  // Network health
  const churnScore = networkHealth?.churnScore ?? 100;
  const joinRate = networkHealth?.joinRate ?? 0;
  const leaveRate = networkHealth?.leaveRate ?? 0;

  // All 5 tiers for the tier progress indicator
  const allTiers: ScalingTier[] = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5'];
  const currentTierIndex = allTiers.indexOf(currentTier);

  return (
    <div className="flex flex-col gap-3 p-4 text-xs select-none">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <TreePine className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-zinc-200">Tree Architecture Health</span>
        <Badge className={`text-[8px] border-0 ${churnScore > 70 ? 'bg-emerald-500/20 text-emerald-400' : churnScore > 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
          {churnScore > 70 ? 'STABLE' : churnScore > 40 ? 'DEGRADED' : 'UNSTABLE'}
        </Badge>
        <Badge className={`text-[8px] border-0 ${tierColor.bg} ${tierColor.text}`}>
          {TIER_LABELS[currentTier]}
        </Badge>
        <Badge className={`text-[8px] border-0 ${deliveryModeColor.bg} ${deliveryModeColor.text}`}>
          {deliveryModeColor.icon} {deliveryMode}
        </Badge>
      </div>

      {/* Tier Progress Indicator */}
      <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3 h-3 text-violet-400" />
          <span className="text-zinc-400 font-medium">Tier Progress</span>
          <span className="text-[9px] text-zinc-600 ml-1">— scaling roadmap</span>
        </div>
        <div className="flex gap-0.5 w-full">
          {allTiers.map((tier, idx) => {
            const config = TIER_CONFIGS[tier];
            const isActive = idx === currentTierIndex;
            const isPast = idx < currentTierIndex;
            const isFuture = idx > currentTierIndex;
            const tColor = TIER_COLORS[tier];
            return (
              <div
                key={tier}
                className={`flex-1 rounded-sm px-1 py-1.5 text-center transition-all ${
                  isActive
                    ? `${tColor.bg} border ${tColor.border}`
                    : isPast
                    ? 'bg-zinc-700/30 border border-zinc-700/50'
                    : 'bg-zinc-800/30 border border-zinc-800/50'
                }`}
              >
                <div className={`text-[9px] font-bold ${isActive ? tColor.text : isPast ? 'text-zinc-500' : 'text-zinc-700'}`}>
                  {config.name}
                </div>
                <div className={`text-[7px] ${isActive ? 'text-zinc-400' : 'text-zinc-700'}`}>
                  {config.minViewers > 0 ? `${config.minViewers}-${config.maxViewers.toLocaleString()}` : `0-${config.maxViewers}`}
                </div>
              </div>
            );
          })}
        </div>
        {/* Viewer count marker on tier bar */}
        <div className="relative mt-1">
          <div className="h-0.5 bg-zinc-800 rounded-full" />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border border-zinc-400 shadow-sm"
            style={{ left: `${Math.max(0, Math.min(98, (currentTierIndex / 4) * 100 + ((viewerCount - tierConfig.minViewers) / Math.max(1, tierConfig.maxViewers - tierConfig.minViewers)) * (100 / 4)))}%` }}
            title={`${viewerCount} viewers`}
          />
        </div>
        <div className="flex justify-between mt-1 text-[8px] text-zinc-600">
          <span>0</span>
          <span>50</span>
          <span>200</span>
          <span>1K</span>
          <span>5K</span>
          <span>10K</span>
        </div>
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

      {/* Capacity Planning — Logarithmic Scale */}
      <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3 h-3 text-violet-400" />
          <span className="text-zinc-400 font-medium">Capacity Planning</span>
          <span className="text-[9px] text-zinc-600 ml-1">— log scale to 10K</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-zinc-200">{capacityForCurrentRoots.toLocaleString()}</div>
            <div className="text-[9px] text-zinc-600">Current Capacity</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${viewerCount > 1000 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {viewerCount > 1000 ? '✓' : '—'}
            </div>
            <div className="text-[9px] text-zinc-600">1K+ Ready</div>
          </div>
          <div>
            <div className="text-lg font-bold text-zinc-200">{rootsNeededForCurrent}</div>
            <div className="text-[9px] text-zinc-600">Roots Needed</div>
          </div>
        </div>
        {/* Capacity bar — logarithmic scale to 10,000 */}
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
            {LOG_MARKERS.map(m => (
              <span key={m}>{m >= 1000 ? `${m / 1000}K` : m}</span>
            ))}
          </div>
          <div className="relative h-3 rounded-full bg-zinc-800 overflow-hidden">
            {/* Viewer count fill */}
            <div
              className="h-full rounded-full bg-emerald-500/40 transition-all"
              style={{ width: `${viewerToLogPercent(viewerCount)}%` }}
            />
            {/* Capacity marker */}
            {capacityForCurrentRoots > 0 && (
              <div
                className="absolute top-0 h-full w-0.5 bg-emerald-400"
                style={{ left: `${Math.min(99, viewerToLogPercent(capacityForCurrentRoots))}%` }}
                title={`Capacity: ${capacityForCurrentRoots.toLocaleString()}`}
              />
            )}
            {/* 1K milestone marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-amber-400/60"
              style={{ left: `${viewerToLogPercent(1000)}%` }}
              title="1,000 users"
            />
            {/* 5K milestone marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-red-400/40"
              style={{ left: `${viewerToLogPercent(5000)}%` }}
              title="5,000 users"
            />
          </div>
          <div className="flex items-center gap-3 mt-1 text-[8px] text-zinc-600">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 inline-block" /> Viewers</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-0.5 bg-emerald-400 inline-block" /> Capacity</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-0.5 bg-amber-400/60 inline-block" /> 1K</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-0.5 bg-red-400/40 inline-block" /> 5K</span>
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

      {/* Content Delivery */}
      <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
        <div className="flex items-center gap-1.5 mb-2">
          <Radio className="w-3 h-3 text-blue-400" />
          <span className="text-zinc-400 font-medium">Content Delivery</span>
        </div>

        {/* Delivery Mode */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {deliveryMode === 'realtime' && <Zap className="w-3 h-3 text-emerald-400" />}
            {deliveryMode === 'buffered' && <Clock className="w-3 h-3 text-amber-400" />}
            {deliveryMode === 'chunked' && <Database className="w-3 h-3 text-blue-400" />}
            <span className="text-zinc-400 text-[11px]">Mode</span>
          </div>
          <Badge className={`text-[9px] border-0 ${deliveryModeColor.bg} ${deliveryModeColor.text}`}>
            {deliveryMode === 'realtime' ? '⚡ Realtime' : deliveryMode === 'buffered' ? '⏱ Buffered' : '📦 Chunked'}
          </Badge>
        </div>

        {/* Latency Info */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 text-[10px]">Max Acceptable</span>
            <span className="text-zinc-300 font-medium text-[11px]">{formatLatency(maxAcceptableLatency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 text-[10px]">Estimated</span>
            <span className={`font-medium text-[11px] ${withinTolerance ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatLatency(estimatedLatencyMs)}
              {!withinTolerance && ' ⚠'}
            </span>
          </div>
        </div>

        {/* Latency Breakdown */}
        {latencyBreakdown && (latencyBreakdown.bufferingMs > 0 || latencyBreakdown.chunkingMs > 0) && (
          <div className="flex gap-1 mb-2 h-2 rounded-full overflow-hidden">
            {latencyBreakdown.networkHopsMs > 0 && (
              <div
                className="bg-blue-500/60"
                style={{ width: `${(latencyBreakdown.networkHopsMs / Math.max(1, estimatedLatencyMs)) * 100}%` }}
                title={`Network: ${formatLatency(latencyBreakdown.networkHopsMs)}`}
              />
            )}
            {latencyBreakdown.processingMs > 0 && (
              <div
                className="bg-violet-500/60"
                style={{ width: `${(latencyBreakdown.processingMs / Math.max(1, estimatedLatencyMs)) * 100}%` }}
                title={`Processing: ${formatLatency(latencyBreakdown.processingMs)}`}
              />
            )}
            {latencyBreakdown.bufferingMs > 0 && (
              <div
                className="bg-amber-500/60"
                style={{ width: `${(latencyBreakdown.bufferingMs / Math.max(1, estimatedLatencyMs)) * 100}%` }}
                title={`Buffering: ${formatLatency(latencyBreakdown.bufferingMs)}`}
              />
            )}
            {latencyBreakdown.chunkingMs > 0 && (
              <div
                className="bg-cyan-500/60"
                style={{ width: `${(latencyBreakdown.chunkingMs / Math.max(1, estimatedLatencyMs)) * 100}%` }}
                title={`Chunking: ${formatLatency(latencyBreakdown.chunkingMs)}`}
              />
            )}
          </div>
        )}
        {latencyBreakdown && (latencyBreakdown.bufferingMs > 0 || latencyBreakdown.chunkingMs > 0) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8px] text-zinc-600 mb-2">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 inline-block" /> Network</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-500/60 inline-block" /> Processing</span>
            {latencyBreakdown.bufferingMs > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 inline-block" /> Buffering</span>}
            {latencyBreakdown.chunkingMs > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500/60 inline-block" /> Chunking</span>}
          </div>
        )}

        {/* Buffer Health */}
        {relayStats && (
          <div className="border-t border-zinc-800 pt-2 mt-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <HardDrive className="w-3 h-3 text-zinc-400" />
              <span className="text-zinc-400 font-medium text-[11px]">Buffer Health</span>
              {relayStats.isBackpressured && (
                <Badge className="text-[8px] bg-red-500/20 text-red-400 border-0 h-4 px-1">BACKPRESSURE</Badge>
              )}
            </div>
            <div className="mb-1.5">
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-zinc-500">Utilization</span>
                <span className={`font-medium ${bufferColorClass}`}>{bufferUtilizationPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${bufferBarColorClass}`}
                  style={{ width: `${bufferUtilizationPct}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-zinc-600">Buffered Chunks</span>
                <span className="text-zinc-300">{relayStats.bufferedChunks}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-600">Queue Depth</span>
                <span className="text-zinc-300">{relayStats.outgoingQueueDepth}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 mt-1.5 text-[9px] text-center">
              <div>
                <div className="text-emerald-400 font-bold">{relayStats.chunksSent}</div>
                <div className="text-zinc-600">Sent</div>
              </div>
              <div>
                <div className="text-blue-400 font-bold">{relayStats.chunksReceived}</div>
                <div className="text-zinc-600">Recv</div>
              </div>
              <div>
                <div className="text-red-400 font-bold">{relayStats.chunksDropped}</div>
                <div className="text-zinc-600">Dropped</div>
              </div>
              <div>
                <div className="text-violet-400 font-bold">{relayStats.chunksDeduplicated}</div>
                <div className="text-zinc-600">Deduped</div>
              </div>
            </div>
          </div>
        )}

        {/* Chunk Config (only for buffered/chunked modes) */}
        {tierConfig.chunkConfig && (
          <div className="border-t border-zinc-800 pt-2 mt-2">
            <div className="text-[10px] text-zinc-500 mb-1">Chunk Config</div>
            <div className="grid grid-cols-3 gap-1.5 text-[9px]">
              <div>
                <div className="text-zinc-300">{tierConfig.chunkConfig.segmentDurationMs}ms</div>
                <div className="text-zinc-600">Segment</div>
              </div>
              <div>
                <div className="text-zinc-300">{tierConfig.chunkConfig.maxBufferSizeMB}MB</div>
                <div className="text-zinc-600">Buffer</div>
              </div>
              <div>
                <div className="text-zinc-300">{tierConfig.chunkConfig.forwardBatchSize}</div>
                <div className="text-zinc-600">Batch Size</div>
              </div>
            </div>
          </div>
        )}
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
          <p>
            📡 Delivery: <span className={deliveryModeColor.text}>{deliveryMode}</span> |
            Est. latency: <span className={withinTolerance ? 'text-emerald-500' : 'text-red-500'}>{formatLatency(estimatedLatencyMs)}</span>
            {withinTolerance ? ' (within tolerance)' : ' (EXCEEDS tolerance!)'}
            {tierConfig.chunkConfig && ` | ${tierConfig.chunkConfig.segmentDurationMs}ms segments, ${tierConfig.chunkConfig.maxBufferSizeMB}MB buffer`}
          </p>
          {isLowBandwidth && <p className="text-amber-500">⚠️ Low bandwidth: max {effectiveMaxRoots} roots (was {tierConfig.maxRoots})</p>}
          {relayStats?.isBackpressured && <p className="text-red-500">🔴 Backpressure active: buffer at {bufferUtilizationPct}%, dropping low-priority chunks</p>}
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
