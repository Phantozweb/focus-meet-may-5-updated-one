'use client';

import { useRoomStore } from '@/store/room-store';
import { BenchmarkEngine } from '@/lib/benchmark';
import { BenchmarkResult, StreamQuality, DeviceType } from '@/lib/types';
import {
  X, Play, CheckCircle2, AlertTriangle, XCircle, Cpu, Users, Activity,
  Shield, Wifi, Clock, BarChart3, Monitor, Smartphone, Tablet, Zap,
  ArrowUpRight, ArrowDownRight, Radio, Layers, Database, TrendingDown, Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

// ============ MAIN PANEL ============

export function BenchmarkPanel() {
  const {
    isBenchmarkVisible, setBenchmarkVisible, benchmarkResult, benchmarkRunning, benchmarkProgress,
    setBenchmarkResult, setBenchmarkRunning, setBenchmarkProgress,
  } = useRoomStore();

  const [targetUsers, setTargetUsers] = useState(700);

  if (!isBenchmarkVisible) return null;

  const runBenchmark = async () => {
    setBenchmarkRunning(true);
    setBenchmarkResult(null);
    setBenchmarkProgress({ phase: 'Starting...', progress: 0 });

    try {
      const engine = new BenchmarkEngine();
      const result = await engine.runFullBenchmark(targetUsers, (phase, progress) => {
        setBenchmarkProgress({ phase, progress });
      });
      setBenchmarkResult(result);
    } catch (err) {
      console.error('Benchmark failed:', err);
    } finally {
      setBenchmarkRunning(false);
      setBenchmarkProgress(null);
    }
  };

  const gradeColors: Record<string, string> = {
    'A+': 'from-emerald-400 to-emerald-600 text-emerald-900',
    'A': 'from-emerald-500 to-emerald-700 text-emerald-100',
    'B+': 'from-blue-400 to-blue-600 text-blue-100',
    'B': 'from-blue-500 to-blue-700 text-blue-100',
    'C': 'from-amber-400 to-amber-600 text-amber-900',
    'D': 'from-orange-400 to-orange-600 text-orange-900',
    'F': 'from-red-500 to-red-700 text-red-100',
  };

  return (
    <div className="absolute inset-0 bg-zinc-950/98 backdrop-blur-md z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Stress Test Benchmark</h2>
            <p className="text-xs text-zinc-500">Simulate real-world P2P mesh load with active churn. All devices start at 720p.</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-zinc-300" onClick={() => setBenchmarkVisible(false)}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-zinc-800/50 flex-shrink-0">
        <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-2 border border-zinc-700">
          <Users className="w-4 h-4 text-zinc-400" />
          <span className="text-sm text-zinc-300">Target:</span>
          <input
            type="number"
            value={targetUsers}
            onChange={e => setTargetUsers(Math.max(10, Math.min(2000, parseInt(e.target.value) || 700)))}
            className="w-20 bg-transparent text-sm text-emerald-400 font-bold text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            disabled={benchmarkRunning}
          />
          <span className="text-xs text-zinc-500">users</span>
        </div>

        <Button
          onClick={runBenchmark}
          disabled={benchmarkRunning}
          className={`${benchmarkRunning ? 'bg-zinc-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-semibold px-6`}
        >
          <Play className={`w-4 h-4 mr-2 ${benchmarkRunning ? 'animate-pulse' : ''}`} />
          {benchmarkRunning ? 'Running...' : 'Run Stress Test'}
        </Button>

        {benchmarkRunning && benchmarkProgress && (
          <div className="flex-1 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-400 font-medium">{benchmarkProgress.phase}</span>
                <span className="text-xs text-emerald-400 font-mono">{Math.round(benchmarkProgress.progress * 100)}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${benchmarkProgress.progress * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {benchmarkResult && (
          <div className={`ml-auto px-4 py-1.5 rounded-xl font-black text-2xl bg-gradient-to-r ${gradeColors[benchmarkResult.overallGrade] || 'from-zinc-600 to-zinc-700 text-zinc-200'}`}>
            {benchmarkResult.overallGrade}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Quick Estimate */}
        <QuickEstimate />

        {/* Results */}
        {benchmarkResult && <BenchmarkResults result={benchmarkResult} />}
      </div>
    </div>
  );
}

// ============ QUICK ESTIMATE ============

function QuickEstimate() {
  const estimates = BenchmarkEngine.quickCapacityEstimate();

  return (
    <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-violet-400" />
        Theoretical Capacity (6-ary tree, depth 5, 60% mobile)
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Total Nodes" value={estimates.totalNodes.toLocaleString()} color="emerald" />
        <MiniStat label="Relay Nodes" value={estimates.relayNodes.toLocaleString()} color="violet" />
        <MiniStat label="Clusters" value={estimates.clusterCount} color="amber" />
        <MiniStat label="Max Stable" value={estimates.estimatedMaxStable.toLocaleString()} color="emerald" />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-3">
        <MiniStat label="720p Users" value={estimates.qualityAt720.toLocaleString()} color="emerald" />
        <MiniStat label="480p Users" value={estimates.qualityAt480.toLocaleString()} color="amber" />
        <MiniStat label="420p Users" value={estimates.qualityAt420.toLocaleString()} color="orange" />
        <MiniStat label="Audio Only" value={estimates.audioOnlyAtDepth5.toLocaleString()} color="red" />
      </div>
    </div>
  );
}

// ============ BENCHMARK RESULTS ============

function BenchmarkResults({ result }: { result: BenchmarkResult }) {
  const passed = result.streamStabilityScore >= 80 && result.joinSuccessRate >= 0.95;

  return (
    <div className="space-y-5">
      {/* Hero Section - Overall verdict + Grade Ring */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Verdict Card */}
        <div className={`md:col-span-2 p-5 rounded-xl border-2 ${
          passed ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-red-500/5 border-red-500/30'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            {passed ? (
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-7 h-7 text-red-400" />
            )}
            <span className={`text-xl font-black ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {passed ? 'STABLE' : 'UNSTABLE'}
            </span>
            <span className="text-sm text-zinc-500 font-medium">at {result.totalSimulatedUsers} users</span>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {passed
              ? `Fractal Mesh handles ${result.maxSupportedUsers} concurrent users with ${result.streamStabilityScore}% stream stability and ${(result.joinSuccessRate * 100).toFixed(1)}% join success. ${result.totalAutoRecoveries} auto-recoveries completed. Quality starts at 720p for ALL devices including phones, degrading gracefully only when needed.`
              : `Stream stability is ${result.streamStabilityScore}% at ${result.totalSimulatedUsers} users with ${result.totalStreamBreaks} stream breaks. ${result.phaseResults.filter(p => !p.passed).length} phases showed instability. Consider reducing target or increasing relay capacity.`
            }
          </p>
        </div>

        {/* Grade Ring */}
        <div className="flex flex-col items-center justify-center p-5 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <GradeRing grade={result.overallGrade} />
          <div className="mt-3 text-center">
            <div className="text-xs text-zinc-500">Overall Score</div>
            <div className="text-sm text-zinc-300 font-medium">
              {result.streamStabilityScore * 0.4 + result.joinSuccessRate * 100 * 0.35 + result.churnResistanceScore * 0.25 >= 88 ? 'Excellent' :
               result.streamStabilityScore * 0.4 + result.joinSuccessRate * 100 * 0.35 + result.churnResistanceScore * 0.25 >= 70 ? 'Good' : 'Needs Work'}
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics - Gauge Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GaugeCard
          label="Max Capacity"
          value={result.maxSupportedUsers}
          max={2000}
          unit="users"
          icon={<Users className="w-4 h-4" />}
          color={result.maxSupportedUsers >= 700 ? 'emerald' : result.maxSupportedUsers >= 400 ? 'amber' : 'red'}
        />
        <GaugeCard
          label="Stream Stability"
          value={result.streamStabilityScore}
          max={100}
          unit="%"
          icon={<Activity className="w-4 h-4" />}
          color={result.streamStabilityScore >= 80 ? 'emerald' : result.streamStabilityScore >= 50 ? 'amber' : 'red'}
        />
        <GaugeCard
          label="Join Success"
          value={Math.round(result.joinSuccessRate * 100)}
          max={100}
          unit="%"
          icon={<Zap className="w-4 h-4" />}
          color={result.joinSuccessRate >= 0.95 ? 'emerald' : result.joinSuccessRate >= 0.85 ? 'amber' : 'red'}
        />
        <GaugeCard
          label="Churn Resistance"
          value={result.churnResistanceScore}
          max={100}
          unit="%"
          icon={<Shield className="w-4 h-4" />}
          color={result.churnResistanceScore >= 70 ? 'emerald' : result.churnResistanceScore >= 40 ? 'amber' : 'red'}
        />
      </div>

      {/* Detailed Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<Clock className="w-4 h-4" />} label="Reconnect Time" value={`${result.avgReconnectTime}ms`} subtitle="avg recovery" />
        <MetricCard icon={<Radio className="w-4 h-4" />} label="Orphan Adoption" value={`${result.orphanAdoptionTime}ms`} subtitle="re-parent time" />
        <MetricCard icon={<BarChart3 className="w-4 h-4" />} label="Relay Load" value={`${(result.avgRelayLoad * 100).toFixed(0)}%`} subtitle="avg capacity used" />
        <MetricCard icon={<Layers className="w-4 h-4" />} label="Tree Depth" value={`${result.maxDepth}`} subtitle="max hops" />
        <MetricCard icon={<Users className="w-4 h-4" />} label="Peak Concurrent" value={result.peakConcurrentUsers.toLocaleString()} subtitle="simultaneous users" />
        <MetricCard icon={<Wifi className="w-4 h-4" />} label="Avg Join Time" value={`${Math.round(result.avgJoinTime)}ms`} subtitle="time to connect" />
        <MetricCard icon={<Cpu className="w-4 h-4" />} label="Relay Nodes" value={result.relayNodeCount.toLocaleString()} subtitle="active relays" />
        <MetricCard icon={<Monitor className="w-4 h-4" />} label="Leaf Nodes" value={result.leafNodeCount.toLocaleString()} subtitle="viewers only" />
      </div>

      {/* Quality + Device + Relay Health — 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Quality Distribution */}
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Quality Distribution
          </h3>
          <div className="flex gap-2 items-end h-36">
            <QualityBar label="720p" count={result.qualityDistribution['high'] || 0} total={result.peakConcurrentUsers} color="emerald" />
            <QualityBar label="480p" count={result.qualityDistribution['medium'] || 0} total={result.peakConcurrentUsers} color="amber" />
            <QualityBar label="420p" count={result.qualityDistribution['low'] || 0} total={result.peakConcurrentUsers} color="orange" />
            <QualityBar label="Audio" count={result.qualityDistribution['audio-only'] || 0} total={result.peakConcurrentUsers} color="red" />
          </div>
        </div>

        {/* Device Distribution */}
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-violet-400" />
            Device Mix
          </h3>
          <div className="space-y-2.5">
            <DeviceBar icon={<Monitor className="w-3.5 h-3.5" />} label="Desktop High" count={result.deviceDistribution['desktop-high'] || 0} total={result.totalSimulatedUsers} color="bg-emerald-500" />
            <DeviceBar icon={<Monitor className="w-3.5 h-3.5" />} label="Desktop" count={result.deviceDistribution['desktop'] || 0} total={result.totalSimulatedUsers} color="bg-emerald-400" />
            <DeviceBar icon={<Tablet className="w-3.5 h-3.5" />} label="Tablet" count={result.deviceDistribution['tablet'] || 0} total={result.totalSimulatedUsers} color="bg-amber-500" />
            <DeviceBar icon={<Smartphone className="w-3.5 h-3.5" />} label="Mobile High" count={result.deviceDistribution['mobile-high'] || 0} total={result.totalSimulatedUsers} color="bg-amber-400" />
            <DeviceBar icon={<Smartphone className="w-3.5 h-3.5" />} label="Mobile" count={result.deviceDistribution['mobile'] || 0} total={result.totalSimulatedUsers} color="bg-orange-500" />
          </div>
        </div>

        {/* Relay Health */}
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            Relay Health
          </h3>
          <div className="flex items-center justify-center mb-3">
            <RelayHealthRing
              healthy={result.relayHealthBreakdown.healthy}
              degraded={result.relayHealthBreakdown.degraded}
              overloaded={result.relayHealthBreakdown.overloaded}
            />
          </div>
          <div className="flex justify-center gap-4 text-xs">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Healthy: {result.relayHealthBreakdown.healthy}</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Degraded: {result.relayHealthBreakdown.degraded}</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /> Overloaded: {result.relayHealthBreakdown.overloaded}</div>
          </div>
        </div>
      </div>

      {/* Bandwidth Timeline Chart */}
      {result.bandwidthTimeline.length > 0 && (
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-cyan-400" />
            Network Timeline (Sustained Load Phase)
          </h3>
          <div className="h-48 flex items-end gap-px">
            {result.bandwidthTimeline.map((point, i) => {
              const maxRtt = Math.max(...result.bandwidthTimeline.map(p => p.avgRTT), 1);
              const heightPct = (point.avgRTT / maxRtt) * 100;
              const isLow = point.avgRTT < 200;
              const isMed = point.avgRTT < 400;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-[2px]" style={{ height: '100%' }}>
                  <div
                    className={`w-full rounded-t-sm ${isLow ? 'bg-emerald-500/70' : isMed ? 'bg-amber-500/70' : 'bg-red-500/70'}`}
                    style={{ height: `${Math.max(2, heightPct)}%` }}
                    title={`RTT: ${point.avgRTT}ms | Up: ${point.avgUpKbps}kbps | Down: ${point.avgDownKbps}kbps`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-zinc-600">
            <span>0s</span>
            <span>Avg RTT (green &lt;200ms, amber &lt;400ms, red &gt;400ms)</span>
            <span>5min</span>
          </div>
        </div>
      )}

      {/* User Churn Timeline */}
      {result.userTimeline.length > 0 && (
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            User Count Timeline
          </h3>
          <div className="h-36 relative">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${result.userTimeline.length} 100`}>
              <defs>
                <linearGradient id="userFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={(() => {
                  const maxUsers = Math.max(...result.userTimeline.map(p => p.activeUsers), 1);
                  const points = result.userTimeline.map((p, i) => {
                    const x = i;
                    const y = 100 - (p.activeUsers / maxUsers) * 90;
                    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                  });
                  const lastX = result.userTimeline.length - 1;
                  const maxUsers2 = Math.max(...result.userTimeline.map(p => p.activeUsers), 1);
                  const lastY = 100 - (result.userTimeline[lastX]?.activeUsers || 0) / maxUsers2 * 90;
                  return points.join(' ') + ` L${lastX},100 L0,100 Z`;
                })()}
                fill="url(#userFill)"
              />
              <path
                d={(() => {
                  const maxUsers = Math.max(...result.userTimeline.map(p => p.activeUsers), 1);
                  return result.userTimeline.map((p, i) => {
                    const x = i;
                    const y = 100 - (p.activeUsers / maxUsers) * 90;
                    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                  }).join(' ');
                })()}
                fill="none"
                stroke="rgb(16, 185, 129)"
                strokeWidth="1.5"
              />
            </svg>
            <div className="absolute top-0 right-2 text-[10px] text-emerald-400 font-mono">
              Peak: {result.peakConcurrentUsers}
            </div>
          </div>
        </div>
      )}

      {/* Phase Results */}
      <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          Phase Results ({result.phaseResults.filter(p => p.passed).length}/{result.phaseResults.length} passed)
        </h3>
        <div className="space-y-2">
          {result.phaseResults.map((phase, i) => (
            <PhaseRow key={i} phase={phase} index={i} />
          ))}
        </div>
      </div>

      {/* Recovery Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="Stream Breaks" value={result.totalStreamBreaks} icon={<AlertTriangle className="w-4 h-4 text-red-400" />} />
        <StatBox label="Auto Recoveries" value={result.totalAutoRecoveries} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
        <StatBox label="Clusters" value={result.clusterCount} icon={<Layers className="w-4 h-4 text-violet-400" />} />
        <StatBox label="Memory Peak" value={`${result.peakMemoryMB}MB`} icon={<Cpu className="w-4 h-4 text-amber-400" />} />
      </div>

      {/* Data Consumption Per Hour */}
      <div className="p-5 rounded-xl bg-zinc-900/80 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          Data Consumption Per Hour
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <DataUsageCard quality="720p" mb={result.dataPerHour.at720p} color="emerald" bitrate={2500} />
          <DataUsageCard quality="480p" mb={result.dataPerHour.at480p} color="amber" bitrate={1500} />
          <DataUsageCard quality="420p" mb={result.dataPerHour.at420p} color="orange" bitrate={700} />
          <DataUsageCard quality="Audio Only" mb={result.dataPerHour.audioOnly} color="red" bitrate={100} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-center">
            <div className="text-lg font-bold text-cyan-400">{result.dataPerHour.averageMixed} MB</div>
            <div className="text-[10px] text-zinc-500">Avg Mixed Quality/hr</div>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-center">
            <div className="text-lg font-bold text-emerald-400">{result.dataPerHour.hostUploadPerHour} MB</div>
            <div className="text-[10px] text-zinc-500">Host Upload/hr</div>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-center">
            <div className="text-lg font-bold text-violet-400">{result.dataPerHour.relayUploadPerHour} MB</div>
            <div className="text-[10px] text-zinc-500">Avg Relay Upload/hr</div>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-center">
            <div className="text-lg font-bold text-amber-400">{result.dataPerHour.totalNetworkPerHour} GB</div>
            <div className="text-[10px] text-zinc-500">Total Network/hr</div>
          </div>
        </div>
      </div>

      {/* Bandwidth-Aware Bitrate Adaptation */}
      <div className="p-5 rounded-xl bg-zinc-900/80 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-amber-400" />
          Bandwidth-Aware Bitrate Adaptation
        </h3>
        <p className="text-xs text-zinc-500 mb-4">
          Quality is SOLELY based on real-time bandwidth. If bandwidth recovers, quality immediately upgrades.
          Users with good connections always get 720p. Only low-bandwidth users get reduced bitrate.
        </p>

        {/* Threshold table */}
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-500 py-2 font-medium">Quality</th>
                <th className="text-right text-zinc-500 py-2 font-medium">Min Bandwidth</th>
                <th className="text-right text-zinc-500 py-2 font-medium">Bitrate</th>
                <th className="text-right text-zinc-500 py-2 font-medium">Data/hr</th>
                <th className="text-right text-zinc-500 py-2 font-medium">Users</th>
              </tr>
            </thead>
            <tbody>
              {result.bandwidthAdaptation.thresholds.map(t => {
                const userCount = t.quality === 'high' || t.quality === 'auto' ? result.bandwidthAdaptation.currentAdaptation.usersAt720p :
                  t.quality === 'medium' ? result.bandwidthAdaptation.currentAdaptation.usersAt480p :
                  t.quality === 'low' ? result.bandwidthAdaptation.currentAdaptation.usersAt420p :
                  result.bandwidthAdaptation.currentAdaptation.usersAtAudioOnly;
                const color = t.quality === 'high' ? 'text-emerald-400' :
                  t.quality === 'medium' ? 'text-amber-400' :
                  t.quality === 'low' ? 'text-orange-400' : 'text-red-400';
                return (
                  <tr key={t.quality} className="border-b border-zinc-800/50">
                    <td className={`py-2 font-semibold ${color}`}>{t.quality === 'high' ? '720p' : t.quality === 'medium' ? '480p' : t.quality === 'low' ? '420p' : 'Audio'}</td>
                    <td className="py-2 text-right text-zinc-300">{t.minBandwidthKbps > 0 ? `${t.minBandwidthKbps} kbps` : '< 500 kbps'}</td>
                    <td className="py-2 text-right text-zinc-300">{t.bitrateKbps} kbps</td>
                    <td className="py-2 text-right text-zinc-300">{t.dataPerHourMB} MB</td>
                    <td className="py-2 text-right text-zinc-200 font-medium">{userCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Savings callout */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <TrendingDown className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-emerald-400">
              {result.bandwidthAdaptation.savingsVsNoAdapt}% data saved vs forcing 720p for everyone
            </div>
            <div className="text-[10px] text-zinc-500">
              {result.bandwidthAdaptation.currentAdaptation.pctAt720p}% of users still at 720p — only users with insufficient bandwidth get reduced quality
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ SUB-COMPONENTS ============

function GradeRing({ grade }: { grade: string }) {
  const gradeColors: Record<string, { stroke: string; text: string; glow: string }> = {
    'A+': { stroke: '#10b981', text: 'text-emerald-400', glow: 'shadow-emerald-500/30' },
    'A': { stroke: '#10b981', text: 'text-emerald-400', glow: 'shadow-emerald-500/30' },
    'B+': { stroke: '#3b82f6', text: 'text-blue-400', glow: 'shadow-blue-500/30' },
    'B': { stroke: '#3b82f6', text: 'text-blue-400', glow: 'shadow-blue-500/30' },
    'C': { stroke: '#f59e0b', text: 'text-amber-400', glow: 'shadow-amber-500/30' },
    'D': { stroke: '#f97316', text: 'text-orange-400', glow: 'shadow-orange-500/30' },
    'F': { stroke: '#ef4444', text: 'text-red-400', glow: 'shadow-red-500/30' },
  };
  const c = gradeColors[grade] || gradeColors['C'];
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  // Map grade to percentage for ring fill
  const gradePcts: Record<string, number> = {
    'A+': 0.98, 'A': 0.90, 'B+': 0.82, 'B': 0.72, 'C': 0.55, 'D': 0.40, 'F': 0.20,
  };
  const pct = gradePcts[grade] || 0.5;

  return (
    <div className="relative">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#27272a" strokeWidth="6" />
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={c.stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          transform="rotate(-90 50 50)"
          className="transition-all duration-1000"
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-2xl font-black ${c.text}`}>
        {grade}
      </div>
    </div>
  );
}

function RelayHealthRing({ healthy, degraded, overloaded }: { healthy: number; degraded: number; overloaded: number }) {
  const total = healthy + degraded + overloaded;
  if (total === 0) return <div className="text-zinc-600 text-xs">No relay data</div>;

  const healthyPct = healthy / total;
  const degradedPct = degraded / total;
  const overloadedPct = overloaded / total;

  const radius = 44;
  const circumference = 2 * Math.PI * radius;

  const healthyDash = healthyPct * circumference;
  const degradedDash = degradedPct * circumference;
  const overloadedDash = overloadedPct * circumference;

  const healthyOffset = 0;
  const degradedOffset = -healthyDash;
  const overloadedOffset = -(healthyDash + degradedDash);

  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#27272a" strokeWidth="10" />
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#10b981" strokeWidth="10"
        strokeDasharray={`${healthyDash} ${circumference - healthyDash}`}
        strokeDashoffset={healthyOffset}
        transform="rotate(-90 60 60)" className="transition-all duration-700" />
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#f59e0b" strokeWidth="10"
        strokeDasharray={`${degradedDash} ${circumference - degradedDash}`}
        strokeDashoffset={degradedOffset}
        transform="rotate(-90 60 60)" className="transition-all duration-700" />
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#ef4444" strokeWidth="10"
        strokeDasharray={`${overloadedDash} ${circumference - overloadedDash}`}
        strokeDashoffset={overloadedOffset}
        transform="rotate(-90 60 60)" className="transition-all duration-700" />
      <text x="60" y="56" textAnchor="middle" className="fill-zinc-100 text-lg font-bold" fontSize="16">{total}</text>
      <text x="60" y="72" textAnchor="middle" className="fill-zinc-500" fontSize="9">relays</text>
    </svg>
  );
}

function GaugeCard({ label, value, max, unit, icon, color }: {
  label: string; value: number; max: number; unit: string; icon: React.ReactNode; color: string;
}) {
  const pct = Math.min(1, value / max);
  const colorMap: Record<string, { ring: string; text: string; bg: string }> = {
    emerald: { ring: 'stroke-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500' },
    amber: { ring: 'stroke-amber-500', text: 'text-amber-400', bg: 'bg-amber-500' },
    red: { ring: 'stroke-red-500', text: 'text-red-400', bg: 'bg-red-500' },
  };
  const c = colorMap[color] || colorMap.emerald;

  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - pct);

  return (
    <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center gap-3">
      <div className="relative flex-shrink-0">
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={radius} fill="none" stroke="#27272a" strokeWidth="5" />
          <circle cx="36" cy="36" r={radius} fill="none"
            className={`${c.ring} transition-all duration-1000`}
            strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            transform="rotate(-90 36 36)" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-sm font-bold ${c.text}`}>{value}</span>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1.5 text-zinc-500 mb-0.5">
          {icon}
          <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
        </div>
        <div className="text-[10px] text-zinc-600">{unit}</div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, subtitle, color = 'zinc' }: {
  icon: React.ReactNode; label: string; value: string; subtitle: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400', amber: 'text-amber-400', red: 'text-red-400',
    violet: 'text-violet-400', zinc: 'text-zinc-200',
  };
  return (
    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
      <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-lg font-bold ${colorMap[color] || colorMap.zinc}`}>{value}</div>
      <div className="text-[10px] text-zinc-600">{subtitle}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400', amber: 'text-amber-400', red: 'text-red-400',
    violet: 'text-violet-400', orange: 'text-orange-400',
  };
  return (
    <div className="text-center">
      <div className={`text-sm font-bold ${colorMap[color] || 'text-zinc-200'}`}>{value}</div>
      <div className="text-[9px] text-zinc-600 uppercase">{label}</div>
    </div>
  );
}

function QualityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500', amber: 'bg-amber-500', orange: 'bg-orange-500', red: 'bg-red-500',
  };
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <div className="text-[10px] text-zinc-400">{percent.toFixed(0)}%</div>
      <div className="w-full bg-zinc-800 rounded-sm relative" style={{ height: '96px' }}>
        <div
          className={`absolute bottom-0 left-0 right-0 rounded-sm ${colorMap[color] || 'bg-zinc-500'} transition-all duration-500`}
          style={{ height: `${Math.max(2, percent)}%` }}
        />
      </div>
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-[9px] text-zinc-600">{count}</div>
    </div>
  );
}

function DeviceBar({ icon, label, count, total, color }: {
  icon: React.ReactNode; label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="text-zinc-500 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-zinc-400">{label}</span>
          <span className="text-[10px] text-zinc-500">{count} ({pct.toFixed(0)}%)</span>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-1.5">
          <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${Math.max(1, pct)}%` }} />
        </div>
      </div>
    </div>
  );
}

function PhaseRow({ phase, index }: { phase: BenchmarkResult['phaseResults'][0]; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border ${phase.passed ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <span className="text-[10px] text-zinc-600 font-mono w-5">P{index + 1}</span>
        {phase.passed ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-200">{phase.phase}</span>
            <span className="text-[10px] text-zinc-500">{phase.userCount} users</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0 flex items-center gap-3">
          <div>
            <div className="text-xs text-zinc-400">{phase.activeStreams} streams</div>
            <div className="text-xs text-zinc-500">{phase.avgRTT}ms RTT</div>
          </div>
          <svg className={`w-4 h-4 text-zinc-600 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-zinc-800/50">
          <p className="text-xs text-zinc-500 pt-2">{phase.notes}</p>
          <div className="grid grid-cols-4 gap-2 text-[10px]">
            <div><span className="text-zinc-600">Breaks:</span> <span className="text-red-400">{phase.streamBreaks}</span></div>
            <div><span className="text-zinc-600">Recoveries:</span> <span className="text-emerald-400">{phase.autoRecoveries}</span></div>
            <div><span className="text-zinc-600">Packet Loss:</span> <span className="text-amber-400">{(phase.avgPacketLoss * 100).toFixed(2)}%</span></div>
            <div><span className="text-zinc-600">Duration:</span> <span className="text-zinc-300">{phase.durationSeconds}s</span></div>
          </div>
          {phase.qualityBreakdown && (
            <div className="flex gap-2 text-[10px]">
              <span className="text-emerald-400">720p: {phase.qualityBreakdown['high'] || 0}</span>
              <span className="text-amber-400">480p: {phase.qualityBreakdown['medium'] || 0}</span>
              <span className="text-orange-400">420p: {phase.qualityBreakdown['low'] || 0}</span>
              <span className="text-red-400">Audio: {phase.qualityBreakdown['audio-only'] || 0}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 flex items-center gap-3">
      {icon}
      <div>
        <div className="text-sm font-bold text-zinc-200">{value}</div>
        <div className="text-[10px] text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

function DataUsageCard({ quality, mb, color, bitrate }: {
  quality: string; mb: number; color: string; bitrate: number;
}) {
  const colorMap: Record<string, { text: string; border: string; bg: string }> = {
    emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5' },
    amber: { text: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/5' },
    orange: { text: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/5' },
    red: { text: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/5' },
  };
  const c = colorMap[color] || colorMap.emerald;
  const gb = (mb / 1024).toFixed(1);
  return (
    <div className={`p-3 rounded-lg border ${c.border} ${c.bg}`}>
      <div className={`text-sm font-bold ${c.text}`}>{quality}</div>
      <div className="text-lg font-black text-zinc-200">{mb} MB</div>
      <div className="text-[10px] text-zinc-500">{gb} GB · {bitrate} kbps</div>
      <div className="text-[9px] text-zinc-600">per hour per viewer</div>
    </div>
  );
}
