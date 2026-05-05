'use client';

import { useRoomStore } from '@/store/room-store';
import { TreeNode, Cluster } from '@/lib/types';
import { Network, X, TrendingUp, TrendingDown, Shield, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TreeVisualizer() {
  const { nodes, clusters, myNode, isTreeVisible, setTreeVisible, networkHealth } = useRoomStore();
  if (!isTreeVisible) return null;

  const allNodes = Array.from(nodes.values());
  const allClusters = Array.from(clusters.values());
  const rootNodes = allNodes.filter(n => n.parentId === null);

  return (
    <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-sm z-50 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-violet-400" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Fractal Mesh Topology</h2>
            <p className="text-xs text-zinc-500">Clusters auto-spawn sub-rooms. Fastest relay wins. Peer-as-proxy for NAT.</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-zinc-300" onClick={() => setTreeVisible(false)}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="flex justify-center">
          {rootNodes.map(root => (
            <MeshNode key={root.peerId} node={root} allNodes={nodes} myPeerId={myNode?.peerId} depth={0} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-8 px-6 py-4 border-t border-zinc-800 bg-zinc-900/50">
        <Stat label="Nodes" value={nodes.size} />
        <Stat label="Clusters" value={clusters.size} />
        <Stat label="Max Depth" value={getMaxDepth(nodes)} />
        <Stat label="Cluster Heads" value={allNodes.filter(n => n.isClusterHead).length} />
        <Stat label="Avg RTT" value={`${getAvgRTT(nodes)}ms`} />
        <Stat label="Joins/min" value={networkHealth?.joinRate ?? 0} color="emerald" />
        <Stat label="Leaves/min" value={networkHealth?.leaveRate ?? 0} color="amber" />
        <Stat label="Stability" value={`${networkHealth?.churnScore ?? 100}%`} color={churnColor(networkHealth?.churnScore ?? 100)} />
      </div>
    </div>
  );
}

function MeshNode({ node, allNodes, myPeerId, depth }: {
  node: TreeNode; allNodes: Map<string, TreeNode>; myPeerId?: string; depth: number;
}) {
  const children = node.childrenIds.map(id => allNodes.get(id)).filter(Boolean) as TreeNode[];
  const isMe = node.peerId === myPeerId;
  const rttColor = (node.bandwidth?.rttMs ?? 999) < 100 ? 'text-blue-400' :
    (node.bandwidth?.rttMs ?? 999) < 300 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="flex flex-col items-center">
      <div className={`relative flex flex-col items-center justify-center rounded-xl border-2 px-3 py-2 min-w-[90px]
        ${isMe ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/20' :
          node.isClusterHead ? 'border-violet-500 bg-violet-500/10' :
          node.role === 'host' ? 'border-emerald-500 bg-emerald-500/10' :
          node.role === 'speaker' ? 'border-amber-500 bg-amber-500/10' :
          'border-zinc-600 bg-zinc-800'}`}>

        <span className="text-xs font-bold text-zinc-200 truncate max-w-[80px]">{node.displayName}</span>
        <span className="text-[9px] text-zinc-500">{node.role.toUpperCase()} L{depth}</span>
        {node.isClusterHead && <span className="text-[9px] text-violet-400 font-medium">CLUSTER HEAD</span>}
        <span className={`text-[9px] ${rttColor}`}>{node.bandwidth.rttMs}ms</span>
        {node.childrenIds.length > 0 && (
          <span className="text-[9px] text-zinc-600">{node.childrenIds.length} children</span>
        )}

        {isMe && (
          <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-emerald-500 text-[8px] text-white flex items-center justify-center font-bold">U</span>
        )}
      </div>

      {children.length > 0 && (
        <>
          <div className="w-px h-4 bg-zinc-700" />
          <div className="flex gap-3 flex-wrap justify-center">
            {children.map(child => (
              <div key={child.peerId} className="flex flex-col items-center">
                <div className="w-px h-3 bg-zinc-700" />
                <MeshNode node={child} allNodes={allNodes} myPeerId={myPeerId} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const colorClass = color === 'emerald' ? 'text-emerald-400' :
    color === 'amber' ? 'text-amber-400' :
    color === 'red' ? 'text-red-400' : 'text-zinc-200';
  return (
    <div className="flex flex-col items-center">
      <span className={`text-lg font-bold ${colorClass}`}>{value}</span>
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function churnColor(score: number): string {
  return score > 70 ? 'emerald' : score > 40 ? 'amber' : 'red';
}

function getMaxDepth(nodes: Map<string, TreeNode>): number {
  let max = 0; nodes.forEach(n => { if (n.depth > max) max = n.depth; }); return max;
}

function getAvgRTT(nodes: Map<string, TreeNode>): number {
  let total = 0, count = 0;
  nodes.forEach(n => {
    if (n.bandwidth.rttMs > 0 && n.bandwidth.rttMs < 999) {
      total += n.bandwidth.rttMs; count++;
    }
  });
  return count > 0 ? Math.round(total / count) : 0;
}
