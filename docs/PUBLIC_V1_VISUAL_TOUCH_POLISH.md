# Public V1 Visual Touch Polish

Updated: June 5, 2026

This lane applies the modern Owner/Admin interaction direction to public and creator-facing Chi'llywood screens without changing backend behavior, monetization truth, LiveKit behavior, route ownership, Premium gates, content safety, or Admin authority.

Stabilization follow-up: the June 5, 2026 internal testing sweep (`docs/INTERNAL_TESTING_STABILIZATION_SWEEP.md`) rechecked Home, Profile, Explore, Library, Live, Platform Studio, Player, and sandbox routes on Play-installed `R5CR120QCBF`. The only public/creator gate copy fix was signed-in Platform Studio: Premium-gated signed-in users now see `Manage Premium` instead of `Sign In to Continue`. No auth, Premium entitlement, upload, playback, money, or route behavior changed.

## Search And Social Discovery Polish

Search polish work on June 6, 2026 modernizes:

- Chi’lly Chat inbox typeahead/search (`app/chat/index.tsx`) with debounced local thread filtering and debounced `searchPublicPeople` suggestions.
- Chi’lly Circle discovery (`app/chilly-circle.tsx`) with local list/request filtering plus People suggestions, compact sections, and compact official Rachi row.
- Home Explore search/typeahead (`app/(tabs)/explore.tsx`) with debounced query + scope filtering + grouped suggestions and stable clear action.

Search behavior source boundaries remain explicit:

- Chi’lly Chat: local `listChatThreads()` thread rows for existing threads plus `searchPublicPeople` for People suggestions.
- Chi’lly Circle: local `listMyChillyCircle` / request lists for social graph rows plus `searchPublicPeople` for people discovery.
- Explore: existing discovery, titles, creator videos, live/replay/events, and `searchPublicPeople` for public people.

No fake people/threads/relationships were introduced. Current safety remains in existing policy-backed queries and UI-level filtering. Proof path is prepared at `/tmp/chillywood-search-typeahead-social-discovery-proof-20260605/` (capture pending).

## Shared Components

Added `components/ui/app-surface.tsx`:

- `AppSection`: dark modern section wrapper with title, subtitle, status pill, optional action, optional collapse support, and accessible expand/collapse state.
- `AppActionButton`: 44px-minimum touch button with primary, secondary, ghost, danger, success, loading, disabled, pressed, hitSlop, and accessibility state support.
- `AppStatusPill`: compact state labels for public, live, ready, empty, sandbox, warning, premium, and muted states.
- `AppEmptyState`: lighter empty/error/loading surface with optional action and no fake data.
- `AppQuickLinkCard`: whole-card navigation affordance for future creator/public shortcuts.
- `AppStickyActionBar`: elevated form action area for creator edit/publish style forms.

## Screens Audited

Audited surfaces:

- Home
- public Platform / creator page
- login/auth gate
- Platform Studio content tab
- Player
- Watch-Party Live
- Live Watch-Party / Live Stage
- Creator Money Center light-check posture
- Owner/Admin denial posture from prior proof

High-risk playback/room surfaces were audited for no-change status in this lane, then received a focused route-safe touch pass in `docs/PLAYER_LIVE_ROOMS_TOUCH_POLISH.md`.

## Screens Polished

Home:

- Discovery, creator video, and Rachi official rails now use modern sections with status pills.
- Empty/error/loading states use `AppEmptyState`.
- Feed/event/Rachi cards now expose button roles and accessibility labels.
- No feed resolver, content filtering, route ownership, or fake count behavior changed.

Public Platform:

- Hero actions now use modern action buttons for follow, share, report, profile, and Platform Studio.
- Featured, Latest Uploads, Live Now, Upcoming Events, Platform Store, and About now use `AppSection`.
- Empty states now use concise modern copy without fake stats.
- Commerce copy remains not-active/sandbox-honest; no production money or Stripe Android digital checkout was added.

Login:

- Login card now shows a compact Public V1 / Closed Beta status pill.
- Primary sign-in action now uses the shared modern action button with loading/disabled state.
- Sign-in behavior and auth gates are unchanged.

Platform Studio:

- Content tab Add Video action uses the shared action button.
- Creator video error/empty states use `AppEmptyState`.
- Video edit save/clear actions use `AppStickyActionBar` with disabled/loading states.
- Clip Studio remains the upload path; media lifecycle and Premium gates are unchanged.

## No-Change Audited Surfaces

Player:

- Playback behavior, resolver logic, paid/private/draft/deleted/admin_removed/malware/blocked denial states, storage path privacy, and Watch-Party CTA ownership were not changed. Later focused passes polished Player touch affordance, comments/replies, unavailable/access cards, standalone overlay controls, and fullscreen sizing without changing those behaviors. Standalone Player proof is in `docs/STANDALONE_PLAYER_OVERLAY_FULLSCREEN_PROOF.md`.

Watch-Party Live:

- LiveKit token issuer, old-room handling, ticket viewer-only behavior, host approval, blocked/ended/stale denial, and Party Room behavior were not changed. A later focused pass polished waiting-room controls and shared room control accessibility only.

Live Watch-Party / Live Stage:

- Access pass entry/viewing, seat eligibility, host approval for publish authority, route ownership, LiveKit token issuer, and blocked/ended/stale denial behavior were not changed. A later focused pass polished Live Stage unavailable gates and shared room controls without changing route ownership or LiveKit authority.

Money Center:

- Creator and Owner/Admin money truth remains unchanged: production live money off, payouts off, no cash-out/withdraw/transfer, no fake balance, sandbox rows not payable, Google Play / RevenueCat for Android digital goods, Stripe only for physical merch and payout readiness.

## Proof

Android proof path:

`/tmp/chillywood-public-v1-visual-touch-polish-proof-20260604/`

EAS Update:

- group `3f98fb2e-2cfb-4a13-89e7-b0e32609707f`
- Android update `019e9273-c86e-7789-9b1a-6a9aed785f16`
- runtime `1.0.0`
- Play-installed device `R5CR120QCBF`, package `com.chillywood.mobile`, versionCode `23`, versionName `1.0.0`, installer `com.android.vending`

Screenshots captured:

- Home top with modern Live Now section and empty state
- Home Rachi Official Updates section with official status pill and backed public creator video card
- backed public Player route from Rachi official creator video
- Platform Studio Premium/signed-in gate
- Watch-Party Live route with existing Premium/live access gate
- Live Watch-Party / Live Stage unavailable route with existing old-room fallback
- creator monetization legal/no-automatic-payment route
- Admin denial with no active admin role

No screenshots are committed.

## Safety

This lane does not change:

- backend behavior
- database schema
- Premium gates
- content safety resolvers
- LiveKit token issuer
- Watch-Party Live route ownership
- Live Watch-Party / Live Stage route ownership
- Party Room behavior
- old-room handling
- Player playback behavior
- Owner/Admin authority
- money state
- production live money
- payouts/cash-out/withdraw/transfer
- Stripe Android digital checkout policy
- terminology doctrine

## Remaining UI Gaps

- Player, Watch-Party Live, and Live Watch-Party / Live Stage have focused touch-polish proof in `docs/PLAYER_LIVE_ROOMS_TOUCH_POLISH.md`; standalone Player overlay/fullscreen proof is in `docs/STANDALONE_PLAYER_OVERLAY_FULLSCREEN_PROOF.md`. Future work there should be deeper layout composition only, with the same no-behavior-change boundary.
- Some older deep creator settings sections still use legacy row styling; the shared public components are available for targeted follow-up replacement.
- True viewport-sticky bottom actions remain a future layout pass where screens are split into smaller route-level forms.
