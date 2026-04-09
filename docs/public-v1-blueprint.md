# Chi'llywood Public V1 Blueprint

## Purpose And Scope
This document turns the current repo truth into a decision-ready Public v1 blueprint without changing doctrine.

It is planning-only.
It does not replace:
- `MASTER_VISION.md` for identity-level truth
- `ARCHITECTURE_RULES.md` for architectural truth
- `PRODUCT_DOCTRINE.md` for cross-cutting product truth
- `ROOM_BLUEPRINT.md` for room-specific truth
- `CURRENT_STATE.md` and `NEXT_TASK.md` for checkpoint and next-lane bookkeeping

This blueprint exists to:
- lock the Public v1 ship boundary
- make Post-v1 and Later-phase boundaries explicit
- turn the current doctrine into a clear implementation sequence
- prevent later prompts from pulling non-v1 work into the launch scope

## Governing Truth Carried Forward
- Chi'llywood remains one premium social streaming platform with locked Party / Live / Profile / Chi'lly Chat semantics.
- Chi'lly Chat remains Chi'llywood's native messaging and communication layer on `/chat` and `/chat/[threadId]`. It is not renamed, downgraded, or reframed here.
- Rachi remains the official seeded concierge/admin/moderation presence on the canonical profile and Chi'lly Chat surfaces. It is not downgraded or reinterpreted here.
- `PRODUCT_DOCTRINE.md` remains canonical for cross-cutting monetization, compliance, product-phase, and profile/channel-platform truth.
- `ROOM_BLUEPRINT.md` remains room-specific only.
- Public v1 is core social streaming first, not the full long-term platform vision.
- Premium remains the recurring premium gate for Watch-Party Live and other recurring premium value.
- Creator paid content, tips, payout scale, light ads, Game Live, Game Watch-Party, and full creator-platform depth remain outside Public v1 unless already stable and intentionally gated.
- Watch-party doctrine remains: real host authority stays separate from each participant's local-only experience controls.
- Premium social watch-party direction remains: a smaller featured visible group is preferred over unlimited equal tiles.

## Public V1 Acceptance Matrix
| Area | Owner Route/File(s) Or Owning Surface | Product Purpose | Minimum Shippable Behavior | Explicitly Out Of Scope | Dependencies | Proof Required Before Ship |
| --- | --- | --- | --- | --- | --- | --- |
| Auth / Login / Settings / Logout | `app/(auth)/login.tsx`, `app/settings.tsx`, `app/_layout.tsx`, `_lib/session.tsx` | Establish trusted access and safe session control for sensitive surfaces. | Logged-out entry lands on login, real sign-in succeeds, visible settings exists, real logout returns to `/login`, sensitive flows require auth. | Expanded onboarding funnels, creator onboarding, payout onboarding, account-billing management beyond existing premium handoff. | Session ownership, route gating, analytics for auth events, current sign-in foundations. | Signed-out first open proves `/login`; valid sign-in returns to the correct product path; logout clears session and cold reopen still lands on `/login`. |
| Home / Discovery | `app/(tabs)/index.tsx` as the Home owner, plus canonical handoff into `app/title/[id].tsx` and live entry | Launch content, live, and profile flows cleanly without route drift. | Discovery rails render valid content, title routing works, live/watch-party entry is visible, continue-watching behavior stays stable where progress exists. | Advanced personalization, ad placements, partner rows, creator merchandising, large recommendation experiments. | Title data truth, home-config truth, route integrity, analytics for discovery engagement. | Visible Home rails open valid title detail, player, and live entry paths without `Not found` or dead-end regressions. |
| Customizable Basic Profiles | `app/profile/[userId].tsx` as the canonical profile/channel owner, supported by `_lib/userData.ts` and official-account identity hooks | Provide a social identity hub with meaningful basic customization and channel-home framing. | Self vs other-user vs official profile behavior is clear, basic profile/channel presentation is stable, owner-only controls stay private, Chi'lly Chat handoff works. | Full creator mini-platform builder, merchandising, advanced channel programming, deep community modules, partnership surfaces. | Identity/profile data, official-account protection, room/content relationship context, profile-to-thread continuity. | Self profile, other-user profile, and official Rachi profile each render correctly with no owner-control leakage and working content/chat handoff. |
| Standalone Player | `app/player/[id].tsx` | Deliver solo-first playback with honest access handling and clean social escalation into Watch-Party Live. | Stable playback on valid titles, honest entitlement-aware access behavior, resume/progress clarity, `Watch-Party Live` handoff remains deliberate and route-correct. | Deep co-watch overlays, premium playback perks, advanced second-screen patterns, Game Live, broad creator tools. | Title/media truth, entitlement handling, resume/progress state, rights-aware content actions. | Valid titles load and play correctly, premium-locked titles render honest gate behavior, and `Watch-Party Live` hands off into the correct Party flow. |
| Watch-Party Live Core Flow | `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, `app/player/[id].tsx`, `_lib/roomRules.ts` | Deliver the core shared social watch path from player into room and shared playback. | `Player -> Watch-Party Live -> Party Waiting Room -> Party Room -> shared party player` stays stable; host authority is clear; local-only viewer controls stay local; participant presence is bounded and readable. | Unlimited equal visible tiles, co-host systems, clip packages, trivia, gifts, creator paid-content publishing, ad intrusion in immersive party surfaces. | Room create/join, playback sync, entitlement checks, moderation/report hooks, participant presence. | Party create/join works, Party Room stays distinct from Live, shared playback stays synchronized, and room return paths remain stable. |
| Live Watch-Party / Live Stage Core Flow | `app/watch-party/index.tsx`, `app/watch-party/live-stage/[partyId].tsx`, supporting live state owners | Deliver the core live social room with preserved Live Room and Live Stage boundaries. | `Live Waiting Room -> Live Room -> Live Stage` stays stable; `Live First` and `Live Watch-Party` remain distinct; Live Stage stays presentation-first; stage entry remains clear. | Game Live, Game Watch-Party, backstage roles, advanced stage templates, creator studio sprawl, immersive ads. | Live room state, participant presence, moderation/report, invite/rejoin continuity, analytics for live engagement. | Live create/join lands on the canonical live route, Live Room and Live Stage remain distinct, and the stage flow does not drift into Party behavior. |
| Comments / Reactions / Basic Social Interaction | Owning room/player surfaces: `app/watch-party/[partyId].tsx`, `app/watch-party/live-stage/[partyId].tsx`, `app/player/[id].tsx`, related shared interaction owners | Add lightweight social energy without drowning core viewing or room identity. | Bounded comments/reactions work where core to the owning surface, interaction stays secondary to playback/live presence, and reporting escape paths remain visible. | Full community systems, polls, gifts, creator fan economies, large engagement mechanics. | Signed-in identity, moderation/report systems, analytics for engagement, room/player surface boundaries. | Basic social interaction works on intended surfaces without clutter, route drift, or safety regressions. |
| Basic Chi'lly Chat / Simple Direct Messaging | `app/chat/index.tsx`, `app/chat/[threadId].tsx`, plus profile-to-thread handoff from `app/profile/[userId].tsx` | Provide persistent off-room communication that stays native to Chi'llywood. | Inbox works, direct thread works, profile-to-thread handoff works, direct-message-first behavior stays intact, official Rachi starter presence stays intact. | Group threads, translation, productivity tooling, deep community messaging, replacing room-native interaction. | Thread/member/message data, call-room primitives where already approved, moderation/report, notifications. | `/chat` and `/chat/[threadId]` open cleanly, direct messaging works, profile-to-thread handoff works, and room semantics are not taken over by messaging. |
| Premium Gate | `_lib/monetization.ts`, `_lib/revenuecat.ts`, `components/monetization/access-sheet.tsx`, access decisions in room/player/title owners | Deliver recurring premium access behavior honestly without fake unlocks or creator-payout drift. | Honest premium checks, shared access-sheet behavior, restore/manage paths, Watch-Party Live and other recurring premium value remain gated by premium where already defined. | Creator paid-content publishing, tips rollout, instant payout, creator cash-out, ad monetization rollout, pricing experimentation beyond current doctrine. | RevenueCat subscription/entitlement handling, centralized monetization access logic, store configuration, analytics for gate flows. | Premium-gated routes/surfaces show honest gate behavior, restore/manage flows work, and no fake purchase success or fake unlock path appears. |
| Moderation Basics | `_lib/moderation.ts`, `app/admin.tsx`, report-entry owners on title/profile/chat/party/live surfaces, Rachi official-account protections | Establish minimum public-v1 safety intake and bounded review visibility. | Reporting works across core surfaces, admin visibility is role-aware and bounded, official-account protections remain intact, safety hooks exist across key user paths. | Advanced case management, heavy trust-and-safety automation, broad operator consoles, international moderation expansion. | Safety-report intake, platform-role review, audit-minded action structure, block/report behavior, official-account protections. | One report path per major surface can be exercised without client failure, admin review state resolves correctly, and official-account trust markers stay intact. |
| Analytics / Error Monitoring / Admin Visibility | `_lib/analytics.ts`, root error boundary/system owners, `app/admin.tsx`, existing release-hardening/runtime validation surfaces | Provide enough launch observability to detect failures and monitor core funnel health. | Shared analytics events cover high-value flows, error capture remains visible, admin visibility stays bounded, and release validators remain part of ship-readiness proof. | Full BI stack, deep segmentation, large dashboard program, unrelated vendor expansion. | Analytics owner, release validation, runtime proof harness, role-aware admin visibility. | Core auth/room/player/monetization/report flows emit expected instrumentation, errors do not silently fail, and current release validators still pass. |
| Preserved Rachi Official Presence | `app/profile/[userId].tsx`, `app/chat/index.tsx`, `app/chat/[threadId].tsx`, `_lib/officialAccounts.ts`, `_lib/userData.ts` | Preserve trusted official platform presence inside canonical profile and Chi'lly Chat surfaces. | Rachi remains official, protected, canonical, visible as seeded concierge/help presence, and available through the same profile/chat architecture. | Separate support app, mascot-style drift, unofficial helper personas, hidden admin-only alternate route. | Official-account identity protections, platform-role backing, direct-thread continuity, official markers. | Rachi profile and official thread both render as clearly official, protected, and canonical, with no doctrine drift away from profile/chat foundations. |

## Public V1 Area Details
### 1. Auth / Login / Settings / Logout
- Owner route/file(s) or owning surface: `app/(auth)/login.tsx`, `app/settings.tsx`, `app/_layout.tsx`, `_lib/session.tsx`
- Product purpose: establish reliable sign-in/out and safe access posture for sensitive product surfaces
- Minimum shippable behavior:
- signed-out first open resolves to `/login`
- signed-in navigation resolves cleanly into the app without route drift
- visible `Settings` surface exists
- `Log Out` is real and returns the app to `/login`
- sensitive room, admin, support, and report surfaces remain sign-in gated where required
- Explicitly out of scope:
- payout onboarding
- expanded onboarding flows
- creator monetization account setup
- account-center breadth beyond existing v1 needs
- Dependencies:
- session ownership
- root auth gate
- route protection rules
- auth analytics
- Proof required before ship:
- first open while signed out lands on login
- valid sign-in returns to the intended app path
- logout clears session and cold reopen still lands on login

### 2. Home / Discovery
- Owner route/file(s) or owning surface: `app/(tabs)/index.tsx`, title handoff into `app/title/[id].tsx`, live/watch-party entry ownership from Home
- Product purpose: give users a clean launch layer into titles, live, and profile-connected viewing
- Minimum shippable behavior:
- discovery rails render valid content
- title cards open canonical title detail
- live/watch-party entry is visible and understandable
- continue-watching remains coherent where progress exists
- Explicitly out of scope:
- ad rows
- advanced personalization
- creator promotions or merchandising systems
- large experimentation programs
- Dependencies:
- title data truth
- home-config truth
- canonical routing
- analytics for discovery engagement
- Proof required before ship:
- visible Home rails open valid destinations
- no `Not found` regression on approved content paths
- live and title entry points stay structurally distinct

### 3. Customizable Basic Profiles
- Owner route/file(s) or owning surface: `app/profile/[userId].tsx`, profile identity data, official-account decorators
- Product purpose: preserve profiles as social identity hubs with meaningful but basic customization
- Minimum shippable behavior:
- self, other-user, and official profile states are clear
- channel-home framing feels intentional
- basic owner-facing presentation/customization is possible without building a full creator platform
- Chi'lly Chat handoff from profile works
- Explicitly out of scope:
- full creator mini-platform builder
- deep channel programming
- creator commerce or merchandising
- large community modules
- Dependencies:
- identity/profile data
- official-account protection
- room/content relationship context
- direct-thread handoff
- Proof required before ship:
- self profile, other-user profile, and official profile all render correctly
- owner-only controls do not leak
- profile-to-chat and profile-to-content handoffs work

### 4. Standalone Player
- Owner route/file(s) or owning surface: `app/player/[id].tsx`
- Product purpose: provide solo-first playback while preserving a clean route into social watch
- Minimum shippable behavior:
- stable playback on valid titles
- resume/progress behavior is visible enough for real use
- rights-aware and entitlement-aware access is honest
- `Watch-Party Live` remains a deliberate handoff, not a room takeover
- Explicitly out of scope:
- deep co-watch overlays
- premium playback perk expansion
- second-screen expansion beyond current baseline
- Game Live behavior
- Dependencies:
- media/title truth
- entitlement handling
- resume/progress state
- content-action primitives
- Proof required before ship:
- valid playback paths work
- premium-locked paths stay honest
- the player stays solo-first unless the user intentionally escalates into Party flow

### 5. Watch-Party Live Core Flow
- Owner route/file(s) or owning surface: `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, `app/player/[id].tsx`, `_lib/roomRules.ts`
- Product purpose: deliver the core shared watch experience for Public v1
- Minimum shippable behavior:
- Party Waiting Room, Party Room, and shared party player stay structurally distinct
- host authority remains explicit
- local-only viewer controls remain local-only
- visible group remains bounded and premium-feeling
- room entry, playback sync, and room return flow stay stable
- Explicitly out of scope:
- unlimited equal visible tiles
- co-host scale systems
- clip/highlight expansion
- creator paid-content rollout
- ad insertion into immersive party surfaces
- Dependencies:
- room create/join
- playback sync
- entitlement/access checks
- participant presence
- moderation/report hooks
- Proof required before ship:
- create/join/rejoin party paths work
- Party Room never drifts into Live Stage
- shared playback remains synchronized and intelligible

### 6. Live Watch-Party / Live Stage Core Flow
- Owner route/file(s) or owning surface: `app/watch-party/index.tsx`, `app/watch-party/live-stage/[partyId].tsx`
- Product purpose: deliver the core live-room experience with preserved room/stage boundaries
- Minimum shippable behavior:
- Live Waiting Room, Live Room, and Live Stage remain distinct
- `Live First` and `Live Watch-Party` remain distinct in-room modes
- stage entry is visible and stable
- Live Stage remains presentation-first
- Explicitly out of scope:
- Game Live
- Game Watch-Party
- backstage and co-host expansion
- creator studio sprawl
- immersive-room ad placements
- Dependencies:
- live room state
- participant presence
- moderation/report
- invite and rejoin continuity
- analytics for live engagement
- Proof required before ship:
- live create/join works on canonical live routes
- Live Room and Live Stage do not collapse into each other
- Live flow does not drift into Party flow

### 7. Comments / Reactions / Basic Social Interaction
- Owner route/file(s) or owning surface: room/player owning surfaces where comments and reactions are already core
- Product purpose: add social energy without overwhelming playback or room clarity
- Minimum shippable behavior:
- comments and reactions work on intended owning surfaces
- social interaction remains additive rather than dominant
- report/escape paths remain visible
- Explicitly out of scope:
- gifts
- polls
- creator economy overlays
- broad social/community systems
- Dependencies:
- signed-in identity
- moderation/report
- analytics for engagement
- room/player interaction boundaries
- Proof required before ship:
- intended interaction surfaces work without clutter or route drift
- moderation/report remains reachable from social entry points

### 8. Basic Chi'lly Chat / Simple Direct Messaging
- Owner route/file(s) or owning surface: `app/chat/index.tsx`, `app/chat/[threadId].tsx`, profile-to-thread handoff from `app/profile/[userId].tsx`
- Product purpose: keep communication native to Chi'llywood before, during, and after room participation
- Minimum shippable behavior:
- inbox works
- direct thread works
- profile-to-thread handoff works
- direct-message-first posture remains intact
- official Rachi starter presence remains intact
- Explicitly out of scope:
- group threads
- translation
- full productivity/messenger suite
- replacing room-native interaction as the main social layer
- Dependencies:
- thread/member/message data
- moderation/report
- notifications
- preserved direct-thread and official-thread architecture
- Proof required before ship:
- `/chat` and `/chat/[threadId]` open cleanly
- profile-to-thread handoff works
- official Rachi thread remains canonical and clearly official

### 9. Premium Gate
- Owner route/file(s) or owning surface: `_lib/monetization.ts`, `_lib/revenuecat.ts`, `components/monetization/access-sheet.tsx`, gate decisions in title/player/room owners
- Product purpose: deliver recurring premium access honestly without expanding into creator monetization scale
- Minimum shippable behavior:
- honest premium checks and gate messaging
- shared access-sheet behavior
- restore/manage entry remains real
- recurring premium value stays gated where already defined in the product truth
- Explicitly out of scope:
- creator paid-content publishing
- tips rollout
- instant payout
- creator cash-out
- ad monetization systems
- Dependencies:
- RevenueCat entitlement handling
- centralized access logic
- real store configuration
- monetization analytics
- Proof required before ship:
- premium-gated surfaces show honest gate outcomes
- restore/manage flows work
- no fake purchase success or fake unlock path appears

### 10. Moderation Basics
- Owner route/file(s) or owning surface: `_lib/moderation.ts`, `app/admin.tsx`, report-entry owners across title/profile/chat/live/party surfaces
- Product purpose: give Public v1 enough safety infrastructure to operate without broad dashboard sprawl
- Minimum shippable behavior:
- report intake works across major user surfaces
- role-aware admin visibility resolves honestly
- official-account protections stay intact
- safety/report context remains auditable enough for v1
- Explicitly out of scope:
- advanced case management
- large trust-and-safety operations tooling
- broad moderation automation
- international expansion of safety systems
- Dependencies:
- report intake paths
- platform-role review
- audit-minded action structure
- official-account protection
- Proof required before ship:
- report paths work on major surfaces
- admin visibility resolves without backend drift
- official-account trust markers remain intact

### 11. Analytics / Error Monitoring / Admin Visibility
- Owner route/file(s) or owning surface: `_lib/analytics.ts`, root error/system owners, bounded admin visibility surfaces
- Product purpose: keep launch-risk visible and measurable without a broad analytics platform rewrite
- Minimum shippable behavior:
- high-value flows emit shared analytics events
- runtime failures surface clearly enough for follow-up
- bounded admin/operator visibility exists where product truth already expects it
- release validation remains part of ship readiness
- Explicitly out of scope:
- large BI stack
- segmentation platform sprawl
- broad new vendor expansion
- nonessential dashboards
- Dependencies:
- analytics owner
- error boundary/system visibility
- release validators
- operator/admin route integrity
- Proof required before ship:
- core auth, room, player, monetization, and report events are visible
- runtime failures do not silently disappear
- release validators still pass on the ship candidate

### 12. Preserved Rachi Official Presence
- Owner route/file(s) or owning surface: `app/profile/[userId].tsx`, `app/chat/index.tsx`, `app/chat/[threadId].tsx`, `_lib/officialAccounts.ts`, `_lib/userData.ts`
- Product purpose: preserve trusted official onboarding/help/moderation-ready presence inside canonical profile and Chi'lly Chat surfaces
- Minimum shippable behavior:
- Rachi remains official, protected, canonical, and visibly platform-owned
- Rachi stays discoverable through the same profile/chat system
- official thread and profile remain usable for starter/help continuity
- Explicitly out of scope:
- separate support app
- mascot drift
- non-canonical special route
- unofficial or shadow helper personas
- Dependencies:
- official-account protection
- platform-role ownership behind the scenes
- direct-thread continuity
- official markers and identity data
- Proof required before ship:
- Rachi profile and official thread render as clearly official and protected
- no drift away from canonical profile/chat architecture appears

## Post-v1 Boundary
Post-v1 is the next meaningful expansion layer after the Public v1 acceptance matrix is closed.

Approved Post-v1 direction:
- light creator monetization rollout with preset paid-content tiers
- creator tips with 100 percent creator retention and backend traceability
- stronger creator profile/channel customization inside the canonical profile system
- payout onboarding groundwork and eligibility states
- limited compliant free-tier ad placements outside premium-feeling immersive rooms
- expanded messaging/social depth that still preserves Chi'lly Chat doctrine
- gated creator tools for approved creators

Still not Public v1 even if technically easy:
- self-serve creator paid-content scale rollout
- broad tipping economy surfaces
- instant payout scale
- wide ad placements
- full creator operating system depth

## Later-Phase Boundary
Later phase is reserved for traction-dependent, ops-heavy, compliance-heavy, or partnership-heavy work.

Approved Later-phase direction:
- full creator mini-platform builder
- advanced payout and tax automation
- overseas creator payouts
- Game Live after the core live product is stable and justified
- Game Watch-Party after Game Live
- deeper personal room layouts and richer local room-experience systems
- broader ad systems
- heavier monetization scale features
- partnership-dependent or traction-dependent creator expansion

Not to be pulled forward without an explicit doctrine update:
- Game Live
- Game Watch-Party
- full creator monetization scale
- broad ads
- advanced payout automation
- global payout rollout

## Dependencies / Blockers / Compliance-Sensitive Areas
### Product dependencies
- a locked Public v1 acceptance matrix
- preserved Party / Live / Profile / Chi'lly Chat / Rachi semantics
- explicit separation between Public v1, Post-v1, and Later phase

### Technical dependencies
- stable auth/session gating
- canonical route integrity across login, home, title, player, party, live, profile, and chat
- room sync and participant presence stability
- centralized entitlement handling
- moderation/report and admin visibility foundations
- analytics and error visibility on core paths

### Business / Ops dependencies
- creator payout onboarding and KYC planning before payout rollout
- tax reporting and finance operations before payout scale
- ad operations before even limited free-tier ad rollout
- official-account operations and moderation staffing for public usage growth

### Compliance-sensitive decisions
- Apple and Google billing must stay separate from creator payout architecture
- RevenueCat handles subscription and entitlement behavior, not creator payouts
- Stripe Connect or equivalent handles creator payout/cash-out behavior, not subscriptions
- moderation, reporting, and block behavior must be sufficient before monetized or larger-scale social usage
- country rollout constraints can block payouts, monetization, and ads even if core social streaming is ready
- Public v1 must not accidentally drag in later-phase compliance dependencies through creator monetization, ads, or payout shortcuts

## Recommended Implementation Order
1. Lock the Public v1 acceptance matrix and proof plan in docs first.
2. Close core Public v1 user-path gaps across auth, home, profiles, player, party, live, and basic Chi'lly Chat.
3. Close moderation/report/admin visibility and analytics/error-monitoring gaps immediately after core user-path stability is proved.
4. Keep Premium subscription gating as the only active v1 monetization lane.
5. Move into Post-v1 creator identity/customization and gated creator-tool expansion only after Public v1 ship criteria are closed.
6. Add payout onboarding groundwork after creator-tool foundations, not before.
7. Hold even limited ads until premium-feeling immersive rooms, moderation posture, and placement policy are clearly protected.
8. Hold Game Live, Game Watch-Party, deeper room personalization, and monetization scale features for later phase.

Can run in parallel after the v1 matrix is locked:
- profile/chat continuity work
- live/party/player continuity work

Should remain gated:
- creator paid content
- tips rollout
- instant payout
- ads in or around immersive rooms
- Game Live
- Game Watch-Party
- full creator mini-platform depth

## Exact Next 3 Execution Lanes
### Lane 1
- Goal: lock this Public v1 blueprint and acceptance matrix as the planning artifact for upcoming implementation work
- Why it comes now: implementation should not resume until the v1 ship boundary is fixed in one place
- Exact allowed file categories: planning docs only
- Exact forbidden changes: runtime app files, Maestro flows, migrations, packages, env, configs, assets, doctrine/control/checkpoint rewrites
- Proof expected before moving on: one approved planning artifact, no other file edits, and clear v1/post-v1/later-phase boundaries

### Lane 2
- Goal: close the highest-priority Public v1 core social-streaming gaps across auth, discovery, profiles, player, party, live, and basic Chi'lly Chat continuity
- Why it comes now: these are the ship-critical user paths and must be stable before launch-hardening and proof closure
- Exact allowed file categories: runtime route owners, directly related shared UI/lib owners, and checkpoint docs only after proof
- Exact forbidden changes: creator monetization rollout, payout onboarding, ads, Game Live, Game Watch-Party, doctrine rewrites, unrelated refactors
- Proof expected before moving on: `npm run typecheck` plus targeted runtime proof on each touched Public v1 path

### Lane 3
- Goal: close Public v1 moderation/report/admin visibility and analytics/error-monitoring proof from the locked acceptance matrix
- Why it comes now: launch observability and safety should follow core path stability, not precede it
- Exact allowed file categories: moderation/admin/analytics/error-visibility owners, tightly related proof docs if needed, and checkpoint docs only after proof
- Exact forbidden changes: creator payouts, creator paid-content rollout, ads, Game Live, full creator-platform builder, broad unrelated refactors
- Proof expected before moving on: working report/admin/analytics/error flows across the accepted v1 matrix with no unresolved blockers
