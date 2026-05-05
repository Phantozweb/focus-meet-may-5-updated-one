---
Task ID: 1
Agent: Main Agent
Task: Fix critical Focus Meet bugs — viewers stuck connecting, host can't see waiting people, mute/video/reactions/chat not working, no admin panel

Work Log:
- Diagnosed ROOT CAUSE: `joinRoom()` Promise never resolved because `initViewer()` stored `resolve/reject` callbacks but never called `resolve()` when room-info arrived
- Added `joinRoomResolve`/`joinRoomReject` fields to FractalMeshEngine
- Updated `initViewer` to store resolve/reject
- Updated `handleSignal` to call `resolve()` when room-info is received (both early-return block and switch case)
- Updated `handleWaitingAdmit` to resolve the promise when viewer is admitted from waiting room
- Updated `handleWaitingDeny` to reject the promise when viewer is denied
- Fixed `admitFromWaitingRoom` to send `waiting-admit` signal directly via conn BEFORE calling processJoinRoom (which might close the conn)
- Fixed `denyFromWaitingRoom` to send deny signal directly via conn instead of using unreliable broadcast
- Fixed reactions: Controls `handleReaction` now calls `engine.sendReaction(type)` in addition to local `addReaction()`
- Added `media-state-update` signal type for broadcasting audio/video toggle state
- Added `sendMediaStateUpdate()` and `handleMediaStateUpdate()` methods to FractalMeshEngine
- Updated Controls `handleToggleAudio`/`handleToggleVideo` to call `engine.sendMediaStateUpdate()`
- Redesigned host side panel with tabbed admin view (Waiting/People/Chat/Health tabs) with HostTabButton component
- Added `standalone` prop to ChatPanel so it renders without requiring `isChatOpen` when in tab panel
- WaitingRoom now defaults to expanded state
- Added role parameter to `joinRoom()` and `initViewer()` — passes role through join-room signal
- Speakers and moderators now bypass the waiting room
- processJoinRoom now assigns proper UserRole based on join role (speaker/moderator → 'speaker', others → 'viewer')
- RoomPage reads `role` param from URL hash and passes to joinRoom

Stage Summary:
- CRITICAL FIX: Viewers no longer stuck in connecting loop — joinRoom Promise now properly resolves
- Host admin panel now has tabbed view with Waiting Room, People, Chat, Health tabs
- Reactions now propagate via P2P network
- Audio/video toggle state broadcasts to other participants
- Waiting room flow works: viewer → waiting screen → host admits → viewer enters room
- Speakers/moderators bypass waiting room
- All lint checks pass
