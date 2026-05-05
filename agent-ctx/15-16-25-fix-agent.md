# Task 15-16-25: Fix Critical Bugs

## Summary

Fixed three critical bug categories in the Focus Meet project:

### CRITICAL FIX 1: Slide Sync Broken for Viewers
- **SlidePresentation.tsx**: Removed `_onSlideChange` monkey-patch and `engineRef`. Replaced `engAny.broadcastToChildren()` with `engine.broadcastSlideChange()`. Viewers now rely on store's `currentSlideIndex` which RoomPage keeps in sync via `eng.setOnSlideChange()`.
- **SlideViewer.tsx**: Removed `_onSlideChange` monkey-patch and `engineRef`. Replaced `(engine as any).broadcastToChildren()` with `engine.broadcastSlideChange()`.
- **SlideViewerWithUpload**: Removed local slide state, now uses store's `slides`, `currentSlideIndex`, `setSlides`, `setCurrentSlideIndex`. Removed `_onSlideChange` monkey-patch. Replaced bracket notation with `engine.broadcastSlideChange()`.

### CRITICAL FIX 2: handleLowerHand Calls Wrong Method
- **peer-tree.ts**: Added `lowerParticipantHand(peerId)` public API method that sends `hand-lower` signal to target and broadcasts through tree.
- **ParticipantList.tsx**: Replaced `engine.muteParticipant(peerId)` (which MUTES the participant!) with `engine.lowerParticipantHand(peerId)`.
- **HandRaise.tsx**: Replaced `engine['broadcastToChildren']?.({type: 'hand-lower', ...})` with `engine.lowerHand()`. Replaced `engine['broadcastToChildren']?.({type: 'hand-raise', ...})` with `engine.raiseHand()`.

### CRITICAL FIX 3: HostControls bracket notation
- **HostControls.tsx**: Replaced all 4 `engine['broadcastToChildren']?.(...)` calls:
  - Lock room → `engine.lockRoom()` / `engine.unlockRoom()`
  - Mute all → `engine.muteParticipant(peerId)` for each participant
  - Lower all hands → `engine.lowerParticipantHand(hr.peerId)` for each raised hand
  - End for all → `engine.destroy()` + `reset()` + navigate away

## Verification
- `bun run lint` passes with zero errors
- Dev server running on port 3000 (HTTP 200)
