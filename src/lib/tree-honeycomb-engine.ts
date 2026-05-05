// Focus Meet — Tree-Honeycomb Architecture Engine
// Biological Tree (Roots→Trunk→Branches→Leaves) + Honeycomb (Queen→Workers→Cells)
// Host uploads to ONLY Roots. Roots absorb and redistribute.
// Bandwidth stays FLAT for host regardless of viewer count.

export type TreeLayer = 'host' | 'root' | 'trunk' | 'branch' | 'sub-branch' | 'leaf';

export interface HoneycombCell {
  cellId: string;
  workerPeerId: string;        // The Root/Worker that owns this cell
  memberPeerIds: string[];     // 4-6 viewers in this cell
  neighborCellIds: string[];   // Up to 6 adjacent cells (hexagonal)
  healthScore: number;         // 0-100
  createdAt: number;
}

export interface RootNode {
  peerId: string;
  displayName: string;
  layer: 'root';
  branchPeerIds: string[];      // Branch nodes under this root
  cells: HoneycombCell[];       // Honeycomb cells managed by this root
  bufferMs: number;             // Stream buffer in milliseconds
  bandwidth: { upKbps: number; downKbps: number; rttMs: number };
  healthScore: number;
  connectedAt: number;
}

export interface BranchNode {
  peerId: string;
  displayName: string;
  layer: 'branch';
  rootPeerId: string;           // Which root this branch belongs to
  subBranchPeerIds: string[];
  cellPeerIds: string[];        // Direct viewer connections
  bandwidth: { upKbps: number; downKbps: number; rttMs: number };
  healthScore: number;
}

export interface TreeTopology {
  hostPeerId: string;
  roots: Map<string, RootNode>;
  branches: Map<string, BranchNode>;
  cells: Map<string, HoneycombCell>;
  leaves: Map<string, { peerId: string; cellId: string; layer: 'leaf' }>;
  
  // Honeycomb grid for adjacency
  honeycombGrid: Map<string, string[]>; // cellId → neighbor cellIds
}

export class TreeHoneycombEngine {
  private topology: TreeTopology;
  private maxRoots = 7;
  private maxBranchesPerRoot = 5;
  private maxViewersPerCell = 6;
  private minViewersPerCell = 3;
  private hostUploadLimit = 7;  // Host NEVER exceeds 7 direct connections
  
  constructor(hostPeerId: string) {
    this.topology = {
      hostPeerId,
      roots: new Map(),
      branches: new Map(),
      cells: new Map(),
      leaves: new Map(),
      honeycombGrid: new Map(),
    };
  }
  
  // ===== ROOT MANAGEMENT =====
  
  // Add a root node (auto-selected from high-bandwidth viewers)
  addRoot(peerId: string, displayName: string, bandwidth: { upKbps: number; downKbps: number; rttMs: number }): RootNode {
    const root: RootNode = {
      peerId, displayName, layer: 'root',
      branchPeerIds: [], cells: [],
      bufferMs: 0, bandwidth, healthScore: 100,
      connectedAt: Date.now(),
    };
    this.topology.roots.set(peerId, root);
    return root;
  }
  
  // Select best candidates for root from available viewers
  selectRootCandidates(viewers: Array<{ peerId: string; displayName: string; upKbps: number; rttMs: number; connectedAt: number }>): string[] {
    const currentRootCount = this.topology.roots.size;
    const needed = Math.max(0, this.maxRoots - currentRootCount);
    if (needed === 0) return [];
    
    // Score each viewer: prefer high upload, low RTT, long uptime
    const scored = viewers
      .filter(v => v.upKbps >= 2000 && v.rttMs <= 200 && (Date.now() - v.connectedAt) >= 20000)
      .map(v => ({
        peerId: v.peerId,
        score: (v.upKbps / 100) * 0.5 + (1 - v.rttMs / 500) * 100 * 0.3 + Math.min(20, (Date.now() - v.connectedAt) / 60000 * 2) * 0.2,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, needed);
    
    return scored.map(s => s.peerId);
  }
  
  // ===== BRANCH MANAGEMENT =====
  
  addBranch(peerId: string, displayName: string, rootPeerId: string, bandwidth: { upKbps: number; downKbps: number; rttMs: number }): BranchNode | null {
    const root = this.topology.roots.get(rootPeerId);
    if (!root) return null;
    if (root.branchPeerIds.length >= this.maxBranchesPerRoot) return null;
    
    const branch: BranchNode = {
      peerId, displayName, layer: 'branch',
      rootPeerId, subBranchPeerIds: [], cellPeerIds: [],
      bandwidth, healthScore: 100,
    };
    root.branchPeerIds.push(peerId);
    this.topology.branches.set(peerId, branch);
    return branch;
  }
  
  // ===== HONEYCOMB CELL MANAGEMENT =====
  
  // Create a new hexagonal cell
  createCell(workerPeerId: string, initialMembers: string[] = []): HoneycombCell {
    const cellId = `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cell: HoneycombCell = {
      cellId, workerPeerId,
      memberPeerIds: initialMembers,
      neighborCellIds: [],
      healthScore: 100,
      createdAt: Date.now(),
    };
    
    this.topology.cells.set(cellId, cell);
    this.topology.honeycombGrid.set(cellId, []);
    
    // Link to neighbors (hexagonal adjacency)
    this.linkCellToNeighbors(cellId);
    
    // Register cell with root
    const root = this.topology.roots.get(workerPeerId);
    if (root) root.cells.push(cell);
    
    return cell;
  }
  
  // Assign a viewer to the best cell (nearest, least loaded)
  assignViewerToCell(viewerPeerId: string): { cellId: string; needsNewCell: boolean } {
    // Find cell with fewest members that's not full
    let bestCellId: string | null = null;
    let bestScore = -Infinity;
    
    this.topology.cells.forEach((cell, cellId) => {
      if (cell.memberPeerIds.length >= this.maxViewersPerCell) return;
      
      // Score: prefer cells with more members (better efficiency) but not full
      const loadFactor = cell.memberPeerIds.length / this.maxViewersPerCell;
      const score = (1 - Math.abs(loadFactor - 0.6)) * 100 + cell.healthScore * 0.3;
      
      if (score > bestScore) {
        bestScore = score;
        bestCellId = cellId;
      }
    });
    
    const bestCell = bestCellId ? this.topology.cells.get(bestCellId) ?? null : null;
    if (bestCell && bestCellId) {
      bestCell.memberPeerIds.push(viewerPeerId);
      this.topology.leaves.set(viewerPeerId, { peerId: viewerPeerId, cellId: bestCellId, layer: 'leaf' });
      return { cellId: bestCellId, needsNewCell: false };
    }
    
    // No cell available — need a new cell
    return { cellId: '', needsNewCell: true };
  }
  
  // Link a cell to its hexagonal neighbors
  private linkCellToNeighbors(cellId: string): void {
    const allCells = Array.from(this.topology.cells.keys());
    if (allCells.length <= 1) return;
    
    // Simple adjacency: link to up to 6 nearest cells by creation time / position
    const others = allCells.filter(id => id !== cellId);
    const neighbors = others.slice(-6); // Last 6 cells are "nearby"
    
    const cell = this.topology.cells.get(cellId);
    if (cell) {
      cell.neighborCellIds = neighbors.slice(-6);
      this.topology.honeycombGrid.set(cellId, neighbors.slice(-6));
    }
    
    // Make the adjacency bidirectional
    for (const nId of neighbors.slice(-6)) {
      const nCell = this.topology.cells.get(nId);
      if (nCell && !nCell.neighborCellIds.includes(cellId)) {
        nCell.neighborCellIds.push(cellId);
        if (nCell.neighborCellIds.length > 6) nCell.neighborCellIds.shift();
        this.topology.honeycombGrid.set(nId, nCell.neighborCellIds);
      }
    }
  }
  
  // ===== SELF-HEALING =====
  
  // When a root dies, redistribute its cells to neighboring roots
  healDeadRoot(deadRootPeerId: string): { cellsMoved: number; newRootPeerIds: string[] } {
    const deadRoot = this.topology.roots.get(deadRootPeerId);
    if (!deadRoot) return { cellsMoved: 0, newRootPeerIds: [] };
    
    const survivingRoots = Array.from(this.topology.roots.values()).filter(r => r.peerId !== deadRootPeerId);
    const newRootPeerIds: string[] = [];
    let cellsMoved = 0;
    
    // Redistribute cells across surviving roots
    for (let i = 0; i < deadRoot.cells.length; i++) {
      const targetRoot = survivingRoots[i % survivingRoots.length];
      if (!targetRoot) continue;
      
      const cell = deadRoot.cells[i];
      cell.workerPeerId = targetRoot.peerId;
      targetRoot.cells.push(cell);
      newRootPeerIds.push(targetRoot.peerId);
      cellsMoved++;
    }
    
    // Move branches to surviving roots
    for (const branchId of deadRoot.branchPeerIds) {
      const branch = this.topology.branches.get(branchId);
      if (!branch) continue;
      
      const targetRoot = survivingRoots.find(r => r.branchPeerIds.length < this.maxBranchesPerRoot);
      if (targetRoot) {
        branch.rootPeerId = targetRoot.peerId;
        targetRoot.branchPeerIds.push(branchId);
      }
    }
    
    // Remove dead root
    this.topology.roots.delete(deadRootPeerId);
    
    return { cellsMoved, newRootPeerIds };
  }
  
  // When a cell member drops, rebalance the cell
  healDeadLeaf(deadPeerId: string): { mergedCell: boolean } {
    const leaf = this.topology.leaves.get(deadPeerId);
    if (!leaf) return { mergedCell: false };
    
    const cell = this.topology.cells.get(leaf.cellId);
    if (!cell) return { mergedCell: false };
    
    // Remove from cell
    cell.memberPeerIds = cell.memberPeerIds.filter(id => id !== deadPeerId);
    this.topology.leaves.delete(deadPeerId);
    
    // If cell is too small, merge with neighbor
    if (cell.memberPeerIds.length < this.minViewersPerCell && cell.neighborCellIds.length > 0) {
      const neighborId = cell.neighborCellIds[0];
      const neighbor = this.topology.cells.get(neighborId);
      if (neighbor && neighbor.memberPeerIds.length + cell.memberPeerIds.length <= this.maxViewersPerCell) {
        // Merge into neighbor
        for (const memberId of cell.memberPeerIds) {
          neighbor.memberPeerIds.push(memberId);
          const memberLeaf = this.topology.leaves.get(memberId);
          if (memberLeaf) memberLeaf.cellId = neighborId;
        }
        
        // Remove empty cell
        this.topology.cells.delete(leaf.cellId);
        this.topology.honeycombGrid.delete(leaf.cellId);
        
        // Update neighbor references
        for (const nId of cell.neighborCellIds) {
          const n = this.topology.cells.get(nId);
          if (n) {
            n.neighborCellIds = n.neighborCellIds.filter(id => id !== leaf.cellId);
          }
        }
        
        return { mergedCell: true };
      }
    }
    
    return { mergedCell: false };
  }
  
  // ===== BANDWIDTH CALCULATIONS =====
  
  getHostUploadLoad(): number {
    // Host only uploads to roots — 1 stream per root
    const roots = this.topology.roots.size;
    return roots * 2500; // 2500 kbps per root at 720p
  }
  
  getRootUploadLoad(rootPeerId: string): number {
    const root = this.topology.roots.get(rootPeerId);
    if (!root) return 0;
    // Root uploads to its branches
    return root.branchPeerIds.length * 2500;
  }
  
  getBranchUploadLoad(branchPeerId: string): number {
    const branch = this.topology.branches.get(branchPeerId);
    if (!branch) return 0;
    return branch.cellPeerIds.length * 2500;
  }
  
  // Can host accept more roots?
  canAddRoot(): boolean {
    return this.topology.roots.size < this.maxRoots;
  }
  
  // Get viewer's content delivery mode based on bandwidth
  getDeliveryMode(viewerBandwidthKbps: number): 'full' | 'slides-audio' | 'audio-only' {
    if (viewerBandwidthKbps >= 1500) return 'full';          // Video + slides + audio
    if (viewerBandwidthKbps >= 300) return 'slides-audio';   // Slides + audio (no video)
    return 'audio-only';                                       // Audio only
  }
  
  // ===== TOPOLOGY STATS =====
  
  getStats() {
    return {
      roots: this.topology.roots.size,
      branches: this.topology.branches.size,
      cells: this.topology.cells.size,
      leaves: this.topology.leaves.size,
      totalViewers: this.topology.leaves.size,
      hostUploadKbps: this.getHostUploadLoad(),
      maxCapacity: this.topology.roots.size * this.maxBranchesPerRoot * this.maxViewersPerCell,
    };
  }
  
  getTopology(): TreeTopology {
    return this.topology;
  }
}
