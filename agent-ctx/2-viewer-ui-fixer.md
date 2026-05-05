# Task ID: 2 — Agent: viewer-ui-fixer

## Task: Fix viewer-side UI issues

### Issues Fixed

1. **Flickering video** — Replaced inline ref callback with `useRef` + `useEffect` pattern in `ViewerExperience.tsx`
2. **Mobile UI broken** — Added tab-based panel navigation in viewer mobile drawer, made Files button visible on mobile
3. **Audio continuity** — Added always-playing hidden video element for audio in all viewer modes
4. **Fallback slides** — Removed demo/fallback slides, show "Waiting for presenter" when no real content

### Files Modified

- `src/components/focus-meet/ViewerExperience.tsx` — Major changes:
  - Added `videoRef` + `useEffect` for stable srcObject assignment
  - Added always-on audio video element (w-px h-px hidden)
  - Removed FALLBACK_SLIDES, SlideData, activeSlides, fallbackSlide
  - Updated contentBasedMode to only use real slides
  - Updated audio-only mode with "Waiting for presenter" state
  - Updated slide thumbnails to only show for real slides
  - Updated slide title overlay to only show for real slides

- `src/components/focus-meet/RoomPage.tsx` — Changes:
  - Viewer hamburger menu now shows X when drawer is open
  - Viewer mobile drawer now has tab navigation (Chat/People/Files) in header

- `src/components/focus-meet/Controls.tsx` — Changes:
  - Files button now visible on mobile (removed `hidden sm:block` wrapper)

### Lint Status
- All lint checks pass with zero errors
