# Chi'llywood social engagement and live discovery

## Objective and original design

Robert requested an audit, plan, implementation and deployment of modern native social engagement for content, libraries and live discovery. The three supplied TikTok references were visually inspected: video engagement, creator library tiles, and live viewing. They establish useful information hierarchy, not a design to copy.

Chi'llywood uses its own shared purple-to-blue action gradient, dark glass panels, compact identity labels and a **horizontal social dock**, rather than TikTok's vertical interaction rail. Live cards are cinematic metadata previews with consistent access labels and a clear forward action. They never auto-join a room, start media, or activate camera/microphone. Existing shared branded backgrounds remain intact. Shared layout/components prevent Home, Live and Channel from drifting apart.

## Audit findings

- Profile posts already have server-backed sharded like/comment counts. Reuse their authority rather than invent another post counter.
- Creator video cards have no existing like or total-comment contract. Loading the first 30 comments does not establish a total.
- Title likes/shares are persistent relationships whose visibility follows user privacy settings. Raw client row counts are not global totals.
- Library is an alias for My List, with creator content also on channel/profile grids.
- Discovery already handles session-fenced real-time invalidation, coalescing, stable ordering and fallback refresh. Preserve it.
- Neither private message counts nor arbitrary metadata is a safe public engagement statistic.

## Count semantics

- **Likes:** unique active account-content relationships; idempotent writes, server authorization and no client-supplied count.
- **Comments:** profile-post totals retain their existing server contract. Creator-video **Discussions** count visible top-level threads, not replies or a loaded-page length. Replies remain inside each discussion and have independently authorized likes. Private chat messages are excluded.
- **Shares:** only a real persisted share/repost or confirmed in-app send can contribute to a defined metric. Opening/canceling an OS share sheet never increments a count. Until this contract exists, the action remains usable but its count is unknown.
- **Views:** require qualified playback evidence and deduplication. A thumbnail impression, card open or fabricated activity is not a view.
- **Live audience:** requires current server/provider participant authority. Never relabel likes, historical views or metadata as current viewers.
- Missing, inaccessible or failed data is `null`/unavailable, never fabricated zero. Public counts do not expose private relationship rosters.

## Delivery sequence

1. Shared count presentation and accessible interaction dock; original shared live card; authorized video like/comment read/write API with batch loading.
2. Integrate video card/library and Player controls without bypassing media, Premium, Circle, moderation or source visibility. Preserve existing share/discussion handlers.
3. Define and implement confirmed in-app sharing/reposts, saved video collections, trustworthy qualified views and live reaction/audience counts. These are genuine backend/product features, not decorative counters.
4. Test actual SQL permissions, idempotence, races and lifecycle; mounted UI tests; required exact-head CI; review and merge.
5. Deploy the reviewed migration and compatible internal app release through canonical tooling. Verify on Android and iOS separately. Neither a passing source test nor a published OTA proves installed behavior.

## Scope and safety matrix

Feature registry selections: `protected-media-playback`, `live-stage`, `watch-party-live`, `supabase-migrations-rls`, `moderation-reporting`, with authentication as a shared dependency. This is not Responsive Layout V2 or an ads change.

Routes: Home, Live, Channel Live Now, creator content cards, creator Player, then library/profile surfaces. Shared components own presentation; existing destination resolvers own routing. Native dependencies remain React Native, existing vector icons/SVG, existing image component and native share sheet. No new SDK/provider or financial behavior.

States to verify: signed out; signed in; changed account/session; owner; public/Circle/draft; blocked and moderated content; empty feed; loading/error/retry; stale mutation response; rapid repeated like taps; background/foreground; deleted/unpublished source; live ended while browsing; denied media access. Android and iOS touch targets, screen-reader labels, larger text, keyboard dismissal and safe-area behavior require separate installed checks.

Rollback: disable/remove the new UI reader/writer path without dropping relationship history; forward-only database repair if needed. Keep sandbox/live-money work separate. No production launch is claimed by this document.

## Research informing implementation

- React Native Share: Android resolves `sharedAction` even when delivery is unproven, so it is not a count receipt: https://reactnative.dev/docs/share
- Android recommends at least 48dp touch targets: https://developer.android.com/guide/topics/ui/accessibility/apps
- Apple larger-text guidance requires scalable text and accommodating layouts: https://developer.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria
- Apple button guidance favors clear states and labels: https://developer.apple.com/design/human-interface-guidelines/buttons

Use 48-point minimum actions, count labels for assistive technology, text wrapping, no flashing/pulsing animation by default, no automatic audio, and no secondary action nested inside the media navigation target.

## Implemented source slice

- Shared original live cards now cover Home, Live, Explore, Platform Live Now and profile live activity.
- Public creator video cards and Player expose real likes, visible top-level discussion totals and persisted Reposts. Send opens the native share sheet without inventing a delivery count.
- Profile Content has a real paginated Reposts shelf. A privacy/account restriction withdraws publication; restoring public visibility does not automatically republish old reposts.
- Profile posts reuse their existing like/comment authority through the shared dock. Profile and video comments/replies now expose independently authorized comment likes.
- Live Stage labels its existing roster as people in room and its loaded chat page as recent comments. Ephemeral reactions are not converted into durable likes.
- Title aggregate counts, qualified playback totals, private-message counts and watch-only spectator chat are not fabricated or included in this slice.

## Validation and remaining release evidence

Local UI/component checks, TypeScript, lint and complete-schema SQL tests are source-level evidence only. A layout-only Chromium attempt could not run because this cloud container forbids Unix sockets. No Android/iOS installed-device visual, keyboard, accessibility or playback proof is claimed.

The Required Validation workflow adds one command immediately after the existing profile engagement concurrency command: `SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-creator-video-engagement-concurrency.mjs`. Existing checks are unchanged. The runner exercises disposable local PostgreSQL lock races; it refuses remote transport. Local execution is blocked by the same socket restriction, so exact-head CI is required before claiming concurrency success. Workflow policy/review requirements remain applicable.

## Dependency-aware preflight

The first full Product run exposed missing transitive harness and inventory updates. Direct-file tests alone were insufficient. Before the follow-up, the dependency audit follows these paths rather than only rerunning failed test names:

| Changed boundary | Downstream contracts checked |
| --- | --- |
| `LiveDiscoveryCard` | Home, Live, Explore, Platform Live Now, profile activity; canonical destination/accessibility guard; mounted live/upcoming/profile tests and original-style witness |
| `CreatorVideoCard` → content dock/bar | Both shared Platform mounted harnesses and all 25 importing suites; Clip authoring/export/brand, public Platform, paid controls, media ownership and Rachi identity |
| Profile and Player discussion UI | Profile interactions and race barriers, comment-like hook/API, media-submit retirement, timestamps, navigation, direct dock/button state/action tests |
| Reposts shelf and page API | Real shelf state with boundary transports: cursor pagination, retained loaded extent, policy-hidden vs errors, profile/account/focus/background retirement, UUID exclusion, malformed readback, mutation invalidation |
| Content engagement API | Video and title branches, own-user relationship filters, published-source/RLS checks, guest behavior, nullable totals, desired-state mutations and retired responses |
| Two social migrations | Full-schema social SQL tests, current-schema grants/RLS, exact migration tail/catalog, ordinary-profile trigger identities, and all 17 test consumers of the historical deployment fixture through its intermediate helpers |
| CI concurrency command | Singular mandatory command beside the existing profile proof; negative mutation controls; both pre-existing Database contract hashes remain unchanged after removing only the separately asserted new command |

The title API is generic support, not a claim that every title UI now displays social totals. Its ordinary-viewer release visibility remains governed by canonical title RLS. The explicit client inventory adds two read consumers only, not database grants.

The direct shelf tests reproduced lifecycle defects: a mutation hint could be dropped behind an active read, a same-identity session-object renewal reset loaded pagination, and retained controls could issue reads after unmount. The shelf now fences invalidated snapshots, coalesces a follow-up read, keys retirement to semantic session identity rather than object reference, and requires a live mounted identity before dispatch. Account/focus retirement still cancels ownership of old responses; repeated hints coalesce and StrictMode effect replay retains only the current timer.

The dependency sweep is source-level evidence. Exact new-head Required Validation still runs in CI; browser/native socket-dependent proofs and installed Android/iOS interaction remain separate qualifications. No local test-harness pass is a claim of provider delivery or production deployment.
