# Chat and Circle Collapsible Layout Update (June 6, 2026)

## Why this change
Users reported that Chi’lly Chat and Chi’lly Circle pages become too long when there are many users.  
This pass adds controlled collapsible behavior so core sections can be compacted without changing data sources or business logic.

## Files changed
- `app/chat/index.tsx`
- `app/chilly-circle.tsx`

## Chat behavior now
- Added a thread collapse threshold at:
  - `CHAT_THREAD_PREVIEW_LIMIT = 8`
- When no search query is active and filtered threads exceed the limit:
  - render only the first 8 threads initially
  - show an inline toggle button:
    - `Show {n} more threads`
    - `Show fewer threads`
- When search is active, all matching threads are shown (no forced collapse) to preserve discoverability.
- Thread source, sort order, and actions were unchanged.

## Circle behavior now
- Added collapsible controls for the three user sections:
  - `My Chi’lly Circle`
  - `Incoming requests`
  - `Sent requests`
- Default collapsed state is data-driven for large sections:
  - collapsed by default when the section count exceeds `6`
- Users can expand/collapse each section independently with in-header `Expand` / `Collapse` control.
- When search is active, sections auto-uncollapse so filtered results remain visible.
- Section content, profile actions, and request handling logic were unchanged.
- The compact Rachi row remains a single tappable official profile row (no separate action button).

## Safety checks
- No data synthesis/fallback participants were introduced.
- No LiveKit token issuer, route ownership, or money logic changes were made.
- Chat and Circle existing API/helpers were reused:
  - `searchPublicPeople`
  - `listMyChillyCircle`
  - `listIncomingChillyCircleRequests`
  - `listOutgoingChillyCircleRequests`
  - `listChatThreads`

## Repo docs/update trace
- This document is the work log for this collapsible UI polish pass.
- Related operational checkpoint should be updated in `CURRENT_STATE.md` with final commit hash and OTA info when deployed.
