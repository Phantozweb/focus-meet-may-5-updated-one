# Work Log — Task 3: Auto-Switch Content Type + Update Page Routing for Login

## Agent: full-stack-developer
## Date: 2024-03-04

---

## Task Summary
Add content-based auto-switching to ViewerExperience (mode adapts to presenter's content availability, not just bandwidth), and add `#login` hash routing to page.tsx with a new LoginModal on the LandingPage.

---

## Completed Work

### 1. Updated `/home/z/my-project/src/components/focus-meet/ViewerExperience.tsx`

#### Added `contentBasedMode` useMemo
- New memoized value that determines the best viewer mode based on what content the presenter is actively providing:
  - Camera ON + slides shared → `'full'` (video + slides)
  - Camera ON + no slides → `'full'` (video only)
  - Camera OFF + slides shared → `'slides-audio'` (slides + audio, no video)
  - Camera OFF + no slides → `'audio-only'` (audio only)
- Dependencies: `incomingStream`, `isPresenting`, `slides.length`, `hasRealSlides`

#### Replaced `suggestedMode` logic
- Old: Only considered bandwidth quality (`streamQualityToMode(streamQuality)`) with a single slide-availability check
- New: Two-tier decision:
  1. **Content availability first**: Uses `contentBasedMode` to determine what's possible (can't show video if there's no incoming stream)
  2. **Bandwidth downgrade second**: If content says `full` but bandwidth is poor, downgrades to `slides-audio` or `audio-only`
  3. **Respects content limits**: If content says `audio-only`, stays `audio-only` regardless of bandwidth (there's no video to show)
- Dependencies: `contentBasedMode`, `streamQuality`, `hasRealSlides`, `isPresenting`

#### Replaced toast on mode change effect
- Old: Simple upgrade/downgrade toasts based only on bandwidth changes
- New: Distinguishes between **content-driven** and **bandwidth-driven** mode changes:
  - Content-driven: Shows specific messages like "Video available — switching to full view", "Slides shared — switching to slide view", "Presenter is audio-only"
  - Bandwidth-driven: Shows existing upgrade/downgrade messages
- Skips toasts when `manualOverride` is active
- Dependencies: `activeMode`, `contentBasedMode`, `manualOverride`

#### Removed old toast effect (lines 208-229)
- The old `useEffect` that only handled bandwidth-based mode change toasts is fully replaced by the new content-aware version

### 2. Updated `/home/z/my-project/src/app/page.tsx`

#### Added `PageView` type
- New type: `'landing' | 'room' | 'login'`

#### Added `#login` hash routing
- When hash is `#login` or contains `login=true`, view is set to `'login'`
- When hash contains `room=`, view is set to `'room'`
- Otherwise, view defaults to `'landing'`

#### Login view renders LandingPage with `showLoginOnMount` prop
- `<LandingPage showLoginOnMount />` when view is `'login'`
- `<LandingPage />` when view is `'landing'`

### 3. Updated `/home/z/my-project/src/components/focus-meet/LandingPage.tsx`

#### Added `LoginModal` component
- Full modal with email + password form
- Simulated login (production would call auth API)
- "Forgot password?" link
- "Join as Guest" alternative button
- "Why Sign In?" info banner explaining benefits (attendance tracking, FL Credits, priority access)
- Consistent styling with existing JoinRoomModal and HostRoomModal

#### Updated `LandingPage` component signature
- Added optional `showLoginOnMount` prop: `{ showLoginOnMount?: boolean }`
- Default value: `false`

#### Added `loginModalOpen` state
- Initialized from `showLoginOnMount` prop
- When `#login` is in the URL, the login modal opens automatically on mount

#### Added "Sign In" buttons in navigation
- Desktop nav: Ghost-styled button between "Host" and theme toggle
- Mobile nav: Ghost-styled button in the button row
- Mobile menu: Full-width button labeled "Sign In" with blue color

#### Added LoginModal rendering
- Rendered alongside JoinRoomModal and HostRoomModal at the bottom of the component

### Lint Check
- `bun run lint` — **PASSED** with zero errors

### Dev Server
- Running successfully on port 3000, no compilation errors

---

## Key Design Decisions

1. **Content availability takes priority over bandwidth**: The `contentBasedMode` determines what's *possible* to display. Bandwidth can only *downgrade* from there. This prevents showing a video placeholder when the presenter's camera is off, or showing slides when none are shared.

2. **Manual override preserved**: The `manualOverride` flag still works as before. When a user manually selects a mode, it stays until the auto-suggest logic detects a better mode. The new content-based logic doesn't force-override manual selections.

3. **Content-driven vs bandwidth-driven toasts**: Users get different messages depending on why the mode changed. Content changes ("Presenter is audio-only") are informational, while bandwidth changes ("Switched to Audio Only - Adapting to your connection") help users understand it's a connection issue.

4. **Login modal opens via `showLoginOnMount` prop**: Instead of creating a separate login page component, the LandingPage accepts a prop that pre-opens the login modal. This keeps the landing page content visible behind the modal and avoids duplicating the page layout.

5. **`#login` hash routing**: The hash-based router now supports three views: landing, room, and login. This is consistent with the existing `#room=` pattern and works without a real router library.

6. **LoginModal is a placeholder**: The login form simulates authentication with a 1-second delay. In production, this would call an auth API. The redirect currently goes back to the login hash with the email — ready for a future auth flow to pick up.

---
