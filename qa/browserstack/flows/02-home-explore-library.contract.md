# 02 Home / Explore / Live / Library Contract

## Purpose
Prove the main viewer shell opens cleanly and Explore, Live, and Saved/Library states are backed, navigable, refreshable, and honest.

## Required Personas
- `normal_viewer`
- signed-out user optional

## Required Runtime
Play/internal runtime only.

## Preconditions
- App launches.
- Network is available.

## Steps
1. Open Home and confirm no crash, blank view, or fake live/money claim.
2. Open Explore.
3. Run a basic search/typeahead smoke across Content, People, Platforms, Live, and Events.
4. Open an available title, Platform, creator-video, Live, or event result and return to Explore.
5. Pull to refresh Explore; confirm backed results or honest-empty states remain usable.
6. Open Live.
7. Confirm Live Now is backed by public discovery/public event data and does not render demo rooms as live truth.
8. If a Live Now card is available, open it and confirm it routes to the backed spectator/player/Platform destination. Return to Live.
9. Confirm Upcoming Events is backed by public event data, or shows the honest empty state.
10. Pull to refresh Live and confirm loading/error/empty states recover without losing navigation.
11. Confirm Start Live, Enter Code, and Explore actions remain reachable; do not require a purchase to validate the tab itself.
12. Open Saved / My Library from the bottom tab.
13. Confirm Saved titles, Continue Watching, Saved Replays, and followed Platforms each show backed rows or an honest empty state.
14. If a saved replay exists, open it and confirm `/player/replay/[replayId]` is reached; return to Saved.
15. If a followed Platform exists, open it and confirm the public Platform route opens; return to Saved.
16. Pull to refresh Saved and confirm the four scope counts remain consistent with rendered rows.
17. Switch Home, Explore, Live, and Saved repeatedly and confirm stable layout and preserved bottom navigation.
18. Open Platform Studio with an eligible creator/operator account and confirm rendered user-facing copy uses `Platform`, not `Channel`; internal route/API identifiers are out of scope for visual terminology.

## Expected Result
Home, Explore, Live, Saved/Library, and Platform Studio render stable backed or honest-empty states. Viewer-facing Platform terminology is consistent.

## Screenshots To Capture
- Home first view.
- Explore search/typeahead.
- Live Now and Upcoming Events state.
- Library state showing all four scopes, including Saved Replays.
- Platform Studio first view plus any monetization surface that previously exposed Channel terminology.

## Logs To Capture
- Sanitized navigation/error logs only.

## Pass Criteria
- Home, Explore, Live, and Saved tabs open.
- Explore search and backed navigation work.
- Live discovery is data-backed or honestly empty.
- Saved replays are present in Library when backed rows exist and open the controlled replay player.
- Followed Platforms navigate correctly.
- No user-facing `Channel` terminology appears in Platform Studio.
- No fake content claims.
- No layout clipping that blocks navigation.

## Fail/Blocker Criteria
- Crash/blank screen.
- Search input unusable.
- Live shows static/demo content as current live truth.
- Library claims saved replays but does not read/render backed replay rows.
- Backed replay/Platform cards do not navigate.
- Platform Studio renders `Channel` as a user-facing product term.

## Device Count
One device.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Yes.
