# ARCHITECTURE RULES

## Source of Truth Rule
Repo control files are the source of truth for:
- naming
- routing
- room semantics
- communication behavior
- product ownership
- profile behavior
- cross-cutting monetization doctrine
- cross-cutting compliance and product-phase doctrine
- content-action behavior

If code, comments, older docs, screenshots, or stale assumptions conflict with these control files, the control files win until they are intentionally updated.

If an older communication-specific assumption says standalone communication is disallowed or room-only, that older assumption is obsolete and the current Chi'lly Chat rule wins.

If an older monetization, compliance, product-phase, or profile/channel-platform assumption conflicts with `PRODUCT_DOCTRINE.md`, `PRODUCT_DOCTRINE.md` wins unless `ROOM_BLUEPRINT.md` intentionally narrows the rule for a specific room.

## Canonical Routes
- Party Room: `/watch-party/[partyId]`
- Live Room / Live Stage: `/watch-party/live-stage/[partyId]`
- Party Waiting Room routes into Party Room
- Live Waiting Room routes into Live Room
- Profile / Channel surface: `/profile/[userId]`
- Chi'lly Chat inbox lives on `/chat`
- Chi'lly Chat direct threads live on `/chat/[threadId]`

These are the approved user-facing destinations.

## Room Communication Rule
There must not be a separate user-facing room-communication destination in normal flow.

That means:
- `/communication` is not a normal destination
- `/communication/[roomId]` is not a normal destination
- if retained, those routes are compatibility-only

Room-grade communication belongs inside:
- Party Room
- Live Room

Not in:
- a separate competing room page
- a duplicate room layer
- a ghost communication destination

## Chi'lly Chat Rule
Standalone Chi'lly Chat is approved product architecture.

Chi'lly Chat:
- is Chi'llywood's native communication layer for inbox, direct threads, room-linked conversations, and creator/fan/community coordination
- is distinct from room-native communication
- must not reuse `/communication` as its route identity
- must not rebrand Party Room or Live Room as a separate messenger product
- must not collapse back into a room-only widget

Embedded room chat:
- is a Chi'lly Chat surface
- is not the definition of Chi'lly Chat
- is not the final messenger UX reference for `/chat`

## Chi'lly Chat MVP Rule
Chi'lly Chat is the platform's built-in messenger layer.

It must not be treated as:
- just an in-room side panel
- a separate second app

Locked MVP architecture:
- `/chat` is the standalone inbox route
- `/chat/[threadId]` is the standalone direct-thread route
- the direct-thread MVP owns header, messages, composer, timestamps, optimistic sending, realtime updates, and mark-read on open/focus
- the MVP data model is `chat_threads`, `chat_thread_members`, and `chat_messages`
- profile surfaces may open or create direct Chi'lly Chat threads
- thread-based voice/video calls must reuse shared communication-room primitives instead of inventing a disconnected calling stack
- MVP starts with direct messaging first and expands later into broader social/community communication

## Approved Wording Table
- title/player CTA = `Watch-Party Live`
- home-screen flow label = `Live Watch-Party`
- profile/channel communication entry = `Chi'lly Chat`

These labels are locked and are not runtime-branding experiments.

## Active-Surface Ownership
- Home controls `Live Watch-Party`
- Player/title surfaces control `Watch-Party Live`
- Party Room controls the shared watch-party player and room-native controls
- Live Room controls `Live First` and `Live Watch-Party`
- `/chat` controls standalone Chi'lly Chat copy and behavior
- Party Room and Live Room control room-native communication copy and behavior
- Profile controls social identity and public/private social relationship visibility
- Title and player control reusable rights-aware content actions

If duplicate files or shared constants exist, prove which active surface owns the label before editing.

## Branded Background Rule
- `assets/images/chillywood-branded-background.png` is the exact source-of-truth Chi'llywood branded-background asset for the current nighttime city direction
- `assets/images/chicago-skyline.jpg` remains the shared runtime owner path that active branded shells and skyline-style fallback posters currently import, and it should stay visually aligned with the source-of-truth asset
- active branded shells such as login, support, admin, and channel settings should converge on that shared runtime asset path instead of drifting to unrelated imagery
- room/content owners such as Party Room, Live Room / Live Stage, Player, Profile / Channel, Home rails, Explore, and Chi'lly Chat should keep their own room- or content-specific background treatments unless those owners are intentionally updated together

## Live Stage Toggle Rule
`Live First / Live Watch-Party` is in-screen Live Room state only.

It is not:
- a separate route
- a separate room product
- a Party Room label

Locked meanings:
- `Live First` = creator/live-room style live mode
- `Live Watch-Party` = social live-viewing mode in Live Room
- `Watch-Party Live` = title/player watch-together flow

## Party / Live Split Rule
- Party Waiting Room routes into Party Room on `/watch-party/[partyId]`
- Live Waiting Room routes into Live Room on `/watch-party/live-stage/[partyId]`
- Party flow is `Player -> Watch-Party Live -> Party Waiting Room -> Party Room -> shared watch-party player`
- Live Stage belongs only to the separate Live flow
- Party Room must not hand off to Live Stage

## Room Blueprint Rule
- `ROOM_BLUEPRINT.md` is the durable room-by-room product reference for Chi'llywood's major rooms and surfaces
- future room-by-room feature work must align with `ROOM_BLUEPRINT.md` unless the control files are intentionally updated together
- every major room or surface must answer four questions:
  1. Why am I here?
  2. What can I do here that I cannot do elsewhere?
  3. Who can see or control what here?
  4. What AI help belongs here without getting in the way?
- the blueprint must define purpose, entry/exit, controls, permissions/visibility, room-specific AI behavior, MVP scope, later expansion, anti-patterns, and product success tests without contradicting locked naming, routes, or room ownership

## Product Doctrine Rule
- `PRODUCT_DOCTRINE.md` is the single governing home for cross-cutting monetization, compliance, product-phase, and profile/channel-platform truth
- `MASTER_VISION.md` should stay identity-level, `ARCHITECTURE_RULES.md` should stay architectural, and `ROOM_BLUEPRINT.md` should only carry room-specific implications of that cross-cutting truth
- when a product question is not room-specific and is not purely naming/routing/ownership architecture, resolve it in `PRODUCT_DOCTRINE.md`

## Room Feature Fit Rule
Before adding a feature to a room or room-adjacent surface, prove:
1. it fits that room's purpose
2. it improves clarity, identity, moderation, monetization, engagement, or usability without clutter
3. it belongs in current scope, near-term expansion, or later expansion
4. it does not overlap or conflict with another room owner
5. its permissions, safety, and audit posture are clear when relevant

Do not use active rooms as feature buckets just because they already have UI space.

## Room AI Placement Rule
AI in Chi'llywood must be room-specific, role-aware, and maturity-aware.

That means:
- visible AI should appear only when it directly helps the active room task
- background AI may support moderation, summaries, ranking, recommendations, or recovery without taking over the room
- AI must not blur locked room meanings or invent new authority over hosts, moderators, official accounts, rights, or entitlements
- AI features that fit later expansion must stay documented in `ROOM_BLUEPRINT.md` without being treated as approved current-scope implementation work

## Compliance-Sensitive Design Rule
Before making implementation choices around monetization, billing, payouts, ads, taxes, moderation-sensitive revenue features, or geography, call out the compliance-sensitive constraints first.

Do not:
- assume Apple or Google billing approval without checking the current product shape
- assume creator payout, tax-reporting, moderation, or country rollout feasibility without surfacing the constraint
- bury compliance-sensitive tradeoffs inside later implementation details

## Player Rule
Player is playback-only.

Player must not become:
- a ghost room
- a second live room
- a fallback communication room

Playback handoff is valid. Structural drift is not.

## Profile Social Identity Rule
Profiles must be treated as social identity hubs, not static cards.

Locked MVP direction:
- likes are first-class content relationships
- shares and reposts are first-class content relationships
- profile surfaces must be designed to show liked content, shared content, saved/public activity, and creator/community identity where policy allows
- future uploads/clips, public lists, and fan/community activity must extend the same profile system instead of inventing a separate profile model

## Profile / Channel Rule
Profiles are not simple account pages.

Locked product direction:
- profiles are Chi'llywood social identity hubs
- cross-cutting profile/channel-platform doctrine lives in `PRODUCT_DOCTRINE.md`
- the authenticated user's own profile opens their own channel/profile surface
- viewing another user's profile should support opening or creating a direct Chi'lly Chat thread
- photos/videos, likes, saved movies/videos, creator/channel identity, and community interaction must extend the same profile/channel system over time

## Billing / Payout Separation Rule
- app-store subscriptions and in-app billing are not the creator payout system
- creator payout infrastructure should assume Stripe Connect or an equivalent marketplace payout layer that stays separate from app-store billing
- RevenueCat can support subscription and entitlement behavior, but it is not the creator payout layer

## Official Platform Account Rule
Rachi is Chi'llywood's official platform-owned seeded account.

Architecture requirements:
- Rachi must use the canonical `/profile/[userId]` profile/channel route and the canonical Chi'lly Chat thread path instead of a disconnected special route
- Rachi must not be treated as an ordinary self-editable or user-claimable profile
- Rachi must carry explicit official/platform markers in both UI and logic
- future moderation, admin, announcement, and audit-minded behavior must build on the same protected official-account foundation
- official starter presence and direct-thread entry should remain additive to the existing messenger/profile architecture rather than rewriting it

## Content Action Primitive Rule
Like, share/repost, download/save, and cast eligibility are reusable content primitives.

These primitives:
- must be rights-aware and entitlement-aware
- must be reusable across title, player, profile, and later room-linked surfaces
- must not expose blocked share, download, or cast actions for restricted content
- must keep standalone-player cast / TV handoff scoped to allowed playback surfaces unless intentionally expanded later

## Messenger UX Rule
Room-linked conversations and direct conversations must share message primitives and visual language.

Do:
- evolve `/chat` toward inbox-first, thread-first messenger UX
- let embedded room chat inherit from the same Chi'lly Chat system

Do not:
- treat the current room utility panel as the final messenger reference
- regress standalone Chi'lly Chat into room-only behavior

## Home Title Routing Rule
Valid Home title cards must resolve to real title/player destinations.

They must not:
- render successfully on Home but fail to rehydrate in destination screens
- fall through to `Not found` for valid titles such as `Chicago Streets`

## Runtime Naming Lock Rule
Locked product naming must not be runtime-overridable through admin/config.

The following are locked:
- `appDisplayName`
- `watchPartyLabel`
- `liveWaitingRoomTitle`
- `partyWaitingRoomTitle`
- `liveRoomTitle`
- `partyRoomTitle`

Non-doctrinal admin copy may still be configurable.

## Structure-Stable Change Rule
Prefer minimal, targeted changes.

Do:
- preserve canonical routes
- fix drift at the source
- reuse existing primitives when they safely support the product need

Do not:
- broad-refactor without approval
- rename concepts to hide drift
- add extra wrappers or destinations to work around unclear routing

## Proof-First Debugging Rule
Before editing a route, label, button, or communication behavior:
1. prove the active file
2. prove the active render path
3. prove the active navigation source
4. prove whether behavior is route state, local state, or compatibility logic

Do not guess when duplicate surfaces may exist.

## File Placement Rule
- identity-level product truth belongs in `MASTER_VISION.md`
- architectural product truth belongs in `ARCHITECTURE_RULES.md`
- cross-cutting monetization, compliance, product-phase, and profile/channel-platform doctrine belongs in `PRODUCT_DOCTRINE.md`
- durable room/surface blueprint doctrine belongs in `ROOM_BLUEPRINT.md`
- roadmap/phasing belongs in `ROADMAP.md`
- current implementation truth belongs in `CURRENT_STATE.md`
- immediate execution scope belongs in `NEXT_TASK.md`
- session guardrails belong in `SESSION_START_PROTOCOL.md`
- temporary ADB/device/emulator debugging does not belong in permanent product doctrine

## Proof Status Bookkeeping Rule
- locked product truth must stay separate from current checkpoint truth
- current checkpoint truth must stay separate from current-build proved items and still-pending proof items
- a flow, batch, or stage only counts as passed/done when current terminal/workflow output proves it on the current build
- do not mark a stage complete while an active local proof item or required cloud rerun is still pending
- do not invent a final human verification gate unless the control files explicitly require one
