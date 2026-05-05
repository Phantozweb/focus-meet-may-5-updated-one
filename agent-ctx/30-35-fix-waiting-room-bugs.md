# Task 30-35: Fix ALL Waiting Room Bugs in FractalMeshEngine

## Summary
Fixed 5 critical bugs in `/home/z/my-project/src/lib/peer-tree.ts` that made the waiting room feature completely non-functional, plus updated RoomPage.tsx to match the new callback type.

## Bugs Fixed

### BUG 1: waitingRoomEnabled defaults to false, but store defaults to true
- **Problem**: Engine had `private waitingRoomEnabled = false` but store had `isWaitingRoomEnabled: true`. When a host creates a room, the engine never enables the waiting room, so ALL viewers bypass it.
- **Fix**: Added `this.waitingRoomEnabled = true;` in `initHost()` method after creating the room.

### BUG 2: admitFromWaitingRoom sends broadcastToChildren but viewer is NOT a child yet
- **Problem**: When admitting from waiting room, the `waiting-admit` signal was sent via `broadcastToChildren()`. But the viewer was never added to `childConnections` because the join was intercepted before `processJoinRoom()`. The admit signal never reached the viewer.
- **Fix**: In `admitFromWaitingRoom()`:
  1. Call `processJoinRoom(conn, joinPayload)` first (which adds the viewer as a child)
  2. Send `waiting-admit` signal DIRECTLY to the admitted viewer via `this.sendSignal(conn, ...)` instead of `broadcastToChildren`
  3. Removed the `broadcastToChildren` call
  4. Removed the `this.myNode.role !== 'host'` guard since co-hosts should also be able to admit

### BUG 3: denyFromWaitingRoom uses childConnections but denied viewer was never a child
- **Problem**: `denyFromWaitingRoom()` used `this.childConnections.get(peerId)` to find the connection, but the denied viewer was in `waitingList`, not in `childConnections`. The signal never reached the viewer.
- **Fix**: In `denyFromWaitingRoom()`:
  1. Find the `waitingEntry` BEFORE removing from the list
  2. Use `waitingEntry.conn` directly instead of `this.childConnections.get(peerId)`
  3. Close the connection after denying with `try { waitingEntry.conn.close(); } catch {}`
  4. Removed both the childConnections lookup and the `broadcastToChildren` call
  5. Removed the `this.myNode.role !== 'host'` guard

### BUG 4: Viewer joinRoom() succeeds before waiting room check
- **Problem**: When the host intercepts for waiting room, it doesn't send `room-info` to the viewer. The viewer's `joinRoom()` promise never resolves because `room-info` never arrives, so the code after `await eng.joinRoom(...)` never executes and `setWaitingForAdmission(true)` is never called.
- **Fix**: Three-part fix:
  1. In `handleJoinRoom()`, when `waitingRoomEnabled` is true, ALSO send `room-info` with `isWaiting: true` flag so the viewer can display the waiting screen with room title and host name
  2. In the viewer's `handleSignal` for `room-info`, check for `isWaiting` flag and set `this.isInWaitingRoomState = true`
  3. Added new property `private isInWaitingRoomState = false` and public method `isInWaitingRoom(): boolean`
  4. In `handleWaitingAdmit()`, when the viewer gets admitted, set `this.isInWaitingRoomState = false`

### BUG 5: Waiting room callback only passes peerId+displayName but WaitingAttendee needs device info
- **Problem**: The `onWaitingRoomUpdate` callback passed `Array<{ peerId: string; displayName: string }>` but `WaitingAttendee` type has `device: DeviceCapability`. The store was creating fake device info.
- **Fix**: Updated all waiting room callback types and calls to include device info:
  1. Changed `onWaitingRoomUpdate` callback type to `Array<{ peerId: string; displayName: string; device: DeviceCapability | null }>`
  2. Updated `setOnWaitingRoomUpdate` method signature
  3. Updated `getWaitingList()` to return device info from `joinPayload`
  4. Updated ALL `this.onWaitingRoomUpdate(...)` calls (5 places) to include `device: w.joinPayload?.device || null`
  5. Updated RoomPage.tsx callback to use `a.device` instead of hardcoded unknown device

## Files Modified
- `/home/z/my-project/src/lib/peer-tree.ts` — All 5 bug fixes applied
- `/home/z/my-project/src/components/focus-meet/RoomPage.tsx` — Updated callback type to match new onWaitingRoomUpdate signature

## Verification
- `bun run lint` passes with zero errors
- Dev server running on port 3000 (HTTP 200)
