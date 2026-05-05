# Task 36-37: Fix remaining waiting room integration bugs

## Work Log

### BUG 1: RoomPage doesn't use engine.isInWaitingRoom() to detect waiting state
**File:** `src/components/focus-meet/RoomPage.tsx`

- Replaced `eng.isWaitingRoomEnabled()` check after `joinRoom()` with `eng.isInWaitingRoom()`
- `isWaitingRoomEnabled()` is a HOST-side setting, not a viewer-side check
- `isInWaitingRoom()` correctly checks if the viewer is in the waiting room based on the `isWaiting` flag from `room-info` signal
- Updated chat message to show waiting room message when viewer is waiting, or connected message when not

### BUG 2: Host never syncs waitingRoomEnabled to engine
**File:** `src/components/focus-meet/Controls.tsx`

- `handleToggleWaitingRoom` already called `engine.setWaitingRoomEnabled()`, but lacked user feedback
- Added `import { toast } from 'sonner'`
- Added `toast.success(newValue ? 'Waiting room enabled' : 'Waiting room disabled')` to the handler
- Changed from `if (engine) engine.setWaitingRoomEnabled(newState)` to `engine?.setWaitingRoomEnabled(newValue)` for cleaner optional chaining

### BUG 3: RoomPage waiting room update callback creates fake device info
**File:** `src/components/focus-meet/RoomPage.tsx`

- Added `DeviceCapability` to the import from `@/lib/types` (was missing but referenced in callback type)
- Added removal logic: attendees no longer in the engine's waiting list are removed from the store via `removeWaitingAttendee()`
- This ensures admitted/denied attendees are properly cleaned up from the UI

### BUG 4: WaitingRoom notification sound creates a new AudioContext each time
**File:** `src/components/focus-meet/WaitingRoom.tsx`

- Added `import { getSharedAudioContext } from '@/lib/audio-context'`
- Replaced `new AudioContext()` with `getSharedAudioContext()` to reuse the singleton AudioContext
- Added `prevNotifCountRef` as a separate ref from `prevCountRef` to fix a race condition where the auto-expand effect updated `prevCountRef.current` before the notification effect could check it
- Both effects now properly track their own "previous count" values
- Wrapped oscillator in `if (ctx)` guard since `getSharedAudioContext()` can return null

### BUG 5: WaitingScreen doesn't detect admission properly
**Verification only — no changes needed.**

The current flow is correct:
1. Viewer joins → engine detects `isWaiting: true` → sets `isInWaitingRoomState = true`
2. RoomPage checks `eng.isInWaitingRoom()` → sets `waitingForAdmission = true`
3. WaitingScreen renders
4. Host admits → engine sends `waiting-admit` → `isInWaitingRoomState = false` → calls `onConnectionStatus('connected')`
5. RoomPage's `setOnConnectionStatus` callback detects `waitingForAdmission` is true → sets to false
6. RoomPage re-renders, no longer shows WaitingScreen

### BUG 6: LandingPage host modal doesn't pass waitingRoom param correctly
**File:** `src/components/focus-meet/RoomPage.tsx`

- The LandingPage HostRoomModal already includes `waitingRoom=${waitingRoom}` in the URL hash (confirmed)
- Added `waitingRoomParam` parsing in RoomPage: `const waitingRoomParam = params.get('waitingRoom') !== 'false'` (defaults to true)
- Added `eng.setWaitingRoomEnabled(waitingRoomParam)` and `setWaitingRoomEnabled(waitingRoomParam)` in the HOST flow after `createRoom()` succeeds
- This ensures the host's waiting room preference from the modal is properly synced to the engine and store

### Files Modified:
- `/home/z/my-project/src/components/focus-meet/RoomPage.tsx` — BUG 1, 3, 6
- `/home/z/my-project/src/components/focus-meet/Controls.tsx` — BUG 2
- `/home/z/my-project/src/components/focus-meet/WaitingRoom.tsx` — BUG 4

### Verification:
- `bun run lint` passes with zero errors
- Dev server running on port 3000 (HTTP 200)
