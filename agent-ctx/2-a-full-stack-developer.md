# Task 2-a: Fix FractalMeshEngine Root Relay

## Agent: full-stack-developer
## Date: 2026-03-04

## Problem
The FractalMeshEngine in `src/lib/peer-tree.ts` did NOT actually make root nodes relay streams. When a viewer was promoted to root, it stayed in its tree position and didn't receive a direct stream from the host. The host still bore ALL the upload load. For 1000+ users on a mobile device, this would crash.

## Changes Made

### 1. Fix `promoteToRoot()` (line ~3914)
- **Before**: Simply set `isRoot=true` and sent a `root-promote` signal. Root stayed under its old parent and never received the host's stream.
- **After**: 
  - If the root is NOT already a direct child of the host, it is reassigned as a direct child
  - The old parent connection is closed and a new one is created from the host
  - The host sends its `localStream` directly to the root via `callNodeWithStream()`
  - The `root-promote` signal is sent on the new connection's `open` event
  - If the root is already a direct child, stream and signal are sent on the existing connection

### 2. Fix `processJoinRoom()` (line ~948)
- **Before**: New viewers were assigned to `selectBestRelay()` result or the host, ignoring roots entirely.
- **After**: 
  - If root nodes exist, the least-loaded root (`selectBestRoot()`) is preferred as the parent
  - Only falls back to `selectBestRelay()` or the host when all roots are full
  - This ensures new viewers get the stream from roots, not the host

### 3. Fix `handleRootPromote()` (line ~4035) - VIEWER SIDE
- **Before**: Only set `isRoot=true` and `canRelay=true` on the local node.
- **After**:
  - Sets `maxRelayCapacity` to at least 10 (roots get extra capacity)
  - Sets `streamBufferMs` from the promotion payload
  - If `incomingStream` exists, immediately calls `relayStreamToChildren()` to start relaying
  - Also relays `localStream` if available
  - Re-registers `peer.on('connection')` and `peer.on('call')` handlers to accept incoming children

### 4. Fix `handleAssignParent()` (line ~1170)
- **Before**: Relayed stream if available, but silently failed if stream hadn't arrived yet.
- **After**: Added a 2-second retry via `setTimeout()` for the race condition where `assign-parent` arrives before the stream from the host. This ensures roots can relay to their children even if the stream is delayed.

### 5. Fix `handleChildDisconnect()` (line ~2300) - Root failover
- **Before**: Orphan adoption used generic `selectBestRelay()` for all children, with no root-specific logic.
- **After**: Added a dedicated root-healing section after the general orphan adoption:
  - Removes the dead root from `rootNodes` and `subRootNodes`
  - Calls `honeycombEngine.healDeadRoot()` for honeycomb topology repair
  - Promotes the first connected sub-root to fill the gap
  - Reassigns the dead root's children to OTHER roots using `selectBestRoot()`, NOT the host
  - Sends `assign-parent` to the new root and `reassign-parent` to the orphan
  - Updates `roomInfo.rootNodes` and `roomInfo.subRootNodes`

### 6. Add `selectBestRoot()` method (line ~557)
- New O(roots) method to find the best root for a new child
- Scores roots by: `(1 - loadRatio) * 50 + upKbps/100 + (100 - rttMs) * 0.2`
- Supports `excludePeerId` parameter (used during root failover to avoid assigning to the dead root)

### 7. Optimize `selectBestRelay()` for scale (line ~582)
- **Before**: Iterated ALL nodes O(n), problematic for 1000+ users.
- **After**: 
  - For rooms with >50 nodes, only considers roots, cluster heads, and nodes with `maxRelayCapacity >= 6`
  - Reduces O(n) to O(roots + cluster_heads) ≈ O(20) for large rooms
  - Small rooms still use the full scan

## Files Modified
- `/home/z/my-project/src/lib/peer-tree.ts` — All 7 changes above

## Lint Status
✅ Clean — `bun run lint` passes with no errors.

## Dev Server
✅ Running on port 3000, no compilation errors.
