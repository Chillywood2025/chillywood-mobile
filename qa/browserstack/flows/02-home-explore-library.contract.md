# 02 Home / Explore / Live / Library / Platform Contract

## Purpose
Prove the main viewer shell opens cleanly and Explore, Live, Saved/Library, and public Platform states are backed, navigable, refreshable, and honest.

## Required Personas
- `normal_viewer`
- creator owner for owner-mode Platform checks
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
19. Open a public Platform as a normal viewer and confirm identity, handle, follower/video/event counts, branding, Follow, Share, Report, View Profile, content shelves, Live Now, Upcoming Events, creator-support offers, and About render only when backed and permitted.
20. Follow and unfollow the Platform and confirm the relationship/count readback updates without changing access authority.
21. Open a public video from Featured/Latest Uploads and return to the same Platform.
22. If a Live Now or Upcoming event exists, tap the event card and confirm the backed `/event/<eventId>` surface opens; return to the Platform.
23. If subscription or VIP sandbox surfaces are present, confirm user-facing copy says `Platform Subscription` / creator Platform and never `Channel Subscription` / creator Channel. Internal `channel_*` identifiers are not visual terminology failures.
24. Open the same Platform in owner mode and confirm Manage Platform routes to Platform Studio, owner-only content actions stay owner-only, creator offers are management actions rather than self-purchase actions, and public-preview/draft-preview modes do not leak owner purchasing authority.
25. Exercise public/private/subscriber-only denial states with backed personas where available and confirm blocked/private/subscriber-only states fail closed without exposing content.
26. Re-open the Platform from Explore, Saved followed Platforms, Profile, and Live/event navigation where backed; confirm each entry resolves to the same Platform identity and usable back navigation.

## Expected Result
Home, Explore, Live, Saved/Library, Platform Studio, and public Platform render stable backed or honest-empty states. Viewer-facing Platform terminology is consistent, public Platform events are actionable, and viewer/owner/access boundaries remain fail-closed.

## Screenshots To Capture
- Home first view.
- Explore search/typeahead.
- Live Now and Upcoming Events state.
- Library state showing all four scopes, including Saved Replays.
- Platform Studio first view plus any monetization surface that previously exposed Channel terminology.
- Public Platform viewer hero/actions/content/events.
- Public Platform owner-mode management state.
- One backed Platform access-denial state where available.

## Logs To Capture
- Sanitized navigation/error logs only.

## Pass Criteria
- Home, Explore, Live, and Saved tabs open.
- Explore search and backed navigation work.
- Live discovery is data-backed or honestly empty.
- Saved replays are present in Library when backed rows exist and open the controlled replay player.
- Followed Platforms navigate correctly.
- No user-facing `Channel` terminology appears in Platform Studio or public Platform surfaces.
- Public Platform Live Now / Upcoming event cards open their backed event route.
- Follow/unfollow, Share, Report, View Profile, content open, owner management, and supported creator-offer actions route correctly.
- Viewer, sandbox tester, owner, public preview, draft preview, blocked, private, and subscriber-only boundaries do not widen authority.
- No fake content claims.
- No layout clipping that blocks navigation.

## Fail/Blocker Criteria
- Crash/blank screen.
- Search input unusable.
- Live shows static/demo content as current live truth.
- Library claims saved replays but does not read/render backed replay rows.
- Backed replay/Platform cards do not navigate.
- Platform Studio or public Platform renders `Channel` as a user-facing product term.
- Public Platform event cards render but cannot open the corresponding backed event.
- Owner-only management or purchase authority appears in viewer mode, or viewer purchase actions appear as owner self-purchase actions.
- Blocked/private/subscriber-only Platform content renders despite denied access.

## Device Count
One device minimum; use a second authenticated persona when validating relationship/access-boundary transitions.

## Google Play Purchase Required
No. Sandbox-only creator-purchase surfaces may be exercised where configured.

## Local Before BrowserStack
Yes.
