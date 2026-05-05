# Task 4b: ImpersonatePanel Component

## Task
Create the ImpersonatePanel component for host to chat/interact on behalf of any user

## Work Summary
- Created `/home/z/my-project/src/components/focus-meet/ImpersonatePanel.tsx` with the exact component as specified
- Verified all imports align with existing store (useRoomStore) and types (ReactionType)
- Verified engine API methods exist in peer-tree.ts: `sendImpersonatedChat`, `sendImpersonatedReaction`, `impersonateHandRaise`
- Lint check passed with zero errors

## Component Features
1. Header with "Impersonate" title and "Host Only" badge
2. Impersonation active banner with target user avatar, display name, and stop button
3. Chat input to send messages as the impersonated user (Enter key + Send button)
4. Quick reaction buttons (6 emoji options)
5. Hand raise toggle (auto-lowers after 5s)
6. Warning about messages appearing from impersonated user
7. Participant search by name or peerId
8. Scrollable participants list excluding self and host
9. Visual distinction for fake users (violet styling + "Fake" badge)
10. Active impersonation indicator (eye icon + amber highlight)
