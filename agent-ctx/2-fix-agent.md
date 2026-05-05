# Task 2 - Fix Agent: FractalMeshEngine P2P Core

## Summary
Fixed all 11 critical issues in `/home/z/my-project/src/lib/peer-tree.ts` and updated `/home/z/my-project/src/lib/types.ts`.

## Changes Made

### types.ts
- Added `'co-host'` to `UserRole` type
- Added 5 new signal types: `slide-change`, `slide-broadcast`, `annotation-update`, `co-host-assign`, `co-host-revoke`

### peer-tree.ts (3793 → 4355 lines)
1. **PeerJS Server**: Switched from custom server to `0.peerjs.com` as primary, added `debug: 1`
2. **Map Serialization**: Added `deserializeRoomInfo()`, applied at both `room-info` receive points
3. **Signal Handlers**: Added 5 new cases + handler methods in `handleSignal()` switch
4. **Stream Relay**: Fixed `handleIncomingChildConn()` to store child connections for relay nodes
5. **Chat Relay**: Added `relayChatMessage()` for bidirectional chat relay (up + down)
6. **Co-Host Support**: Added `promoteToCoHost()`, `demoteCoHost()`, `isCoHost`, signal handlers
7. **Slide/Annotation**: Added `broadcastSlideChange()`, `broadcastAnnotation()` public methods
8. **Waiting Room**: Added `waitingRoomEnabled`, `waitingList`, `admitFromWaitingRoom()`, `denyFromWaitingRoom()`, `setWaitingRoomEnabled()`, integrated into `handleJoinRoom()`
9. **Public Methods**: Added `getRoomInfo()`, `isHostNode()`, `isCoHostNode()`, `getParticipants()`, `lockRoom()`, `unlockRoom()`, `muteParticipant()`, `removeParticipant()`, `raiseHand()`, `lowerHand()`, `toggleAudioEnabled()`, `toggleVideoEnabled()`
10. **File Sharing**: Forwarded announcements/chunks/requests through tree, added `requestFile()`, `shareFileMetadata()`
11. **Callbacks**: Added `setOnSlideChange()`, `setOnAnnotation()`, `setOnCoHostUpdate()`, `setOnWaitingRoomUpdate()`, `setOnHandRaiseUpdate()`

## Verification
- `bun run lint` passes with zero errors
- Dev server running on port 3000
