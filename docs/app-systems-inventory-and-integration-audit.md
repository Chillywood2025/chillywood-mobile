# Chi'llywood App Systems Inventory And Integration Audit

## Purpose
This document is a diagnosis-first whole-app systems map for Chi'llywood on `main`.

It exists to answer:
- what systems actually exist
- what each system owns
- what each system depends on
- which systems are fully real vs partial vs foundation-only
- which integrations are solid vs partial vs fragile vs implied-only
- which integration lane matters most next

It does not:
- change route truth
- change schema
- start implementation
- rewrite doctrine

## Preflight Fact Base
- Branch: `main`
- HEAD at audit start: `4231e9bee7055e74479f736cbd5b9b7bb5fd2872`
- `git status --short` at audit start: only `?? supabase/.temp/`
- Audit-only pass: no product implementation was started in this lane

## Fact vs Inference
- Facts below come from current control files, route owners under `app/`, visible surface owners under `components/`, and shared helpers under `_lib/`.
- Status labels and lane ranking are inference based on current repo truth and current Public v1 doctrine.

## Whole-App Systems Inventory

| # | System | Primary owner files / routes | Direct helpers | What it owns | Status | Facing | Branch states it must handle |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | App shell / navigation / discovery | `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, `app/(tabs)/my-list.tsx`, `app/modal.tsx` | `_lib/session.tsx`, `_lib/appConfig.ts`, `_lib/userData.ts`, `_lib/watchParty.ts` | Root auth gate, tab shell, Home/Explore/My List discovery, modal fallback | `FULLY_REAL` | `shared` | signed-in vs signed-out, auth-loading, current user vs guest, saved vs unsaved, live metadata present vs absent |
| 2 | Auth / session | `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`, `app/_layout.tsx` | `_lib/session.tsx`, `_lib/supabase.ts`, `_lib/analytics.ts`, `_lib/logger.ts` | Sign-in, sign-up, root session ownership, signed-out redirects | `FULLY_REAL` | `shared` | signed-in vs signed-out, auth-loading, redirect target present vs absent |
| 3 | Beta / access gating | route-local `BetaAccessScreen` usage in `watch-party`, `communication`, `channel-settings`, `admin`, `support` | `_lib/betaProgram.tsx`, `_lib/runtimeConfig.ts` | Closed-beta membership gating, onboarding ack, beta feedback queue submission | `FULLY_REAL` | `shared` | signed-out, not invited, invited, active, paused, revoked, public-v1 vs closed-beta |
| 4 | Public profile / channel | `app/profile/[userId].tsx` | `_lib/userData.ts`, `_lib/accessEntitlements.ts`, `_lib/chat.ts`, `_lib/friendGraph.ts`, `_lib/liveEvents.ts`, `_lib/notifications.ts`, `_lib/monetization.ts`, `_lib/moderation.ts`, `_lib/officialAccounts.ts`, `_lib/watchParty.ts` | Canonical public/self/official profile, channel presentation, chat handoff, public live/event context | `PARTIALLY_REAL` | `shared` | self vs public, signed-in vs signed-out, official vs member, friend vs non-friend, access summary states, live/event context present vs absent |
| 5 | Creator control | `app/channel-settings.tsx` | `_lib/accessEntitlements.ts`, `_lib/channelReadModels.ts`, `_lib/channelAudience.ts`, `_lib/monetization.ts`, `_lib/liveEvents.ts`, `_lib/notifications.ts`, `_lib/userData.ts`, `_lib/betaProgram.tsx` | Canonical creator control center for identity, access defaults, audience summaries/actions, creator permissions, event editing | `PARTIALLY_REAL` | `creator-facing` | signed-in vs signed-out, beta allowed vs blocked, owner vs unavailable, access summary variants, audience action status, creator permission granted vs blocked |
| 6 | Title / content detail | `app/title/[id].tsx` | `_lib/accessEntitlements.ts`, `_lib/monetization.ts`, `_lib/contentEngagement.ts`, `_lib/moderation.ts`, `_lib/userData.ts`, `_lib/session.tsx` | Canonical title detail, entitlement gate, my-list action, like/share state, report entry, watch-party live handoff | `FULLY_REAL` | `user-facing` | signed-in vs signed-out, entitled vs non-entitled, liked/shared vs not, report sheet open vs closed, live activity present vs absent |
| 7 | Standalone player | `app/player/[id].tsx` | `_lib/accessEntitlements.ts`, `_lib/monetization.ts`, `_lib/contentEngagement.ts`, `_lib/userData.ts`, `_lib/watchParty.ts`, `_lib/livekit/join-boundary.ts`, `_lib/mediaSources.ts` | Solo playback, progress, rights-aware content actions, `Watch-Party Live` escalation, direct `partyId` watch branch | `FULLY_REAL` | `user-facing` | solo vs watch-party context, entitled vs blocked, admitted vs denied direct entry, signed-in vs signed-out, like/share state |
| 8 | Watch-party entry | `app/watch-party/index.tsx` | `_lib/watchParty.ts`, `_lib/accessEntitlements.ts`, `_lib/monetization.ts`, `_lib/betaProgram.tsx`, `_lib/session.tsx`, `_lib/appConfig.ts` | Canonical create/join entry owner for Party Waiting Room and Live Waiting Room | `FULLY_REAL` | `shared` | signed-in vs signed-out, beta allowed vs blocked, create vs join, party vs live mode, locked vs open, entitled vs non-entitled |
| 9 | Party Room | `app/watch-party/[partyId].tsx`, `app/watch-party/_lib/_room-shared.ts`, `app/watch-party/_lib/_waiting-room-shared.ts` | `_lib/watchParty.ts`, `_lib/accessEntitlements.ts`, `_lib/monetization.ts`, `_lib/moderation.ts`, `_lib/session.tsx`, `_lib/userData.ts`, `_lib/livekit/join-boundary.ts` | Canonical party room, host/viewer difference, room membership, party messaging/reactions, party-player handoff, invite/share | `FULLY_REAL` | `shared` | host vs viewer, member vs non-member, locked vs removed vs allowed, entitled vs non-entitled, signed-in vs signed-out |
| 10 | Live Room / Live Stage | `app/watch-party/live-stage/[partyId].tsx`, `components/watch-party-live/livekit-stage-media-surface.tsx`, `app/watch-party/_lib/_room-shared.ts` | `_lib/watchParty.ts`, `_lib/accessEntitlements.ts`, `_lib/livekit/join-boundary.ts`, `_lib/runtimeConfig.ts`, `_lib/moderation.ts`, `_lib/session.tsx` | Canonical live-room owner, stage presentation, hybrid/live-first state, comments/reactions/`CAMERA LOOKS`, stage participant controls | `PARTIALLY_REAL` | `shared` | host vs viewer, member vs non-member, blocked vs admitted, hybrid vs live-first, controls visible vs locked, signed-in vs signed-out |
| 11 | Chi'lly Chat / direct thread | `app/chat/index.tsx`, `app/chat/[threadId].tsx` | `_lib/chat.ts`, `_lib/session.tsx`, `_lib/friendGraph.ts`, `_lib/officialAccounts.ts`, `_lib/moderation.ts`, `_lib/communication.ts` | Canonical inbox and direct thread, message send/read, official starter thread, friendship actions, thread-call handoff | `PARTIALLY_REAL` | `shared` | signed-in vs signed-out, official vs direct thread, friend vs non-friend, thread found vs unavailable, call idle vs in-call handoff |
| 12 | Communication room | `app/communication/index.tsx`, `app/communication/[roomId].tsx`, `components/communication/*`, `hooks/use-communication-room-session.ts` | `_lib/communication.ts`, `_lib/accessEntitlements.ts`, `_lib/betaProgram.tsx`, `_lib/moderation.ts`, `_lib/session.tsx` | Compatibility-only RTC lobby/room for small-room communication and thread-call reuse | `PARTIALLY_REAL` | `shared` | signed-in vs signed-out, beta allowed vs blocked, host vs participant, room full vs ended vs allowed, RTC available vs unavailable |
| 13 | Friend graph | route adoption on `app/profile/[userId].tsx` and `app/chat/[threadId].tsx` | `_lib/friendGraph.ts` | Mutual private-first friendship requests and state transitions | `PARTIALLY_REAL` | `shared` | signed-out, self, official-platform, no relationship, pending incoming/outgoing, active, removed |
| 14 | Audience / follower / subscriber | `app/channel-settings.tsx`, light public posture on `app/profile/[userId].tsx` | `_lib/channelAudience.ts`, `_lib/channelReadModels.ts`, `_lib/userData.ts` | Creator audience summaries and creator-side actions for followers, subscribers, requests, blocked audience | `PARTIALLY_REAL` | `creator-facing` | owner vs operator vs unavailable, follower vs subscriber vs request vs blocked, public visibility enabled vs disabled |
| 15 | Scheduled events / reminders | `app/profile/[userId].tsx`, `app/channel-settings.tsx` | `_lib/liveEvents.ts`, `_lib/notifications.ts` | Creator event records, public event summaries, replay/reminder readiness, reminder enrollment counts | `PARTIALLY_REAL` | `shared` | draft vs scheduled vs live_now vs ended, replay available vs pending vs expired, reminder ready vs not ready, signed-in vs signed-out enrollment |
| 16 | Access / entitlements | shared helper layer consumed by profile, settings, title, player, party, live, communication | `_lib/accessEntitlements.ts`, `_lib/roomRules.ts`, `_lib/monetization.ts`, `_lib/watchParty.ts`, `_lib/communication.ts`, `_lib/userData.ts`, `_lib/officialAccounts.ts` | Canonical channel/content/room access labels, reasons, preview rules, current supported resolver layer | `PARTIALLY_REAL` | `shared` | official/public/private/subscriber_access/mixed_access, identity_required, removed, room_locked, party_pass_required, premium_required |
| 17 | Monetization | `app/title/[id].tsx`, `app/player/[id].tsx`, `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, `app/channel-settings.tsx`, `app/admin.tsx`, `components/monetization/access-sheet.tsx` | `_lib/monetization.ts`, `_lib/revenuecat.ts`, `_lib/partyPass.ts`, `_lib/featureFlags.ts` | Premium, Party Pass, creator permissions, purchase/restore flows, access sheet | `PARTIALLY_REAL` | `shared` | free vs premium, Party Pass unlocked vs blocked, creator grants allowed vs not, snapshot ready vs partial vs disabled |
| 18 | Ads / sponsor foundation | `components/monetization/ad-banner-placeholder.tsx`, `components/monetization/pre-roll-ad-modal.tsx`, `components/monetization/mid-roll-ad-marker.tsx`, admin title/programming controls | `_lib/monetization.ts`, `_lib/featureFlags.ts`, `_lib/appConfig.ts` | Future sponsor/ad slots and labels | `FOUNDATION_ONLY` | `shared` | ads enabled vs off, sponsor placement none vs detail vs player, premium ad-free vs free |
| 19 | Moderation / safety | report entry points on `profile`, `title`, `chat`, `watch-party`, `live-stage`, `communication`; review in `app/admin.tsx`; summary in `app/channel-settings.tsx` | `_lib/moderation.ts`, `_lib/channelReadModels.ts` | Report intake, normalized moderation context, admin queue read, creator safety summary | `PARTIALLY_REAL` | `shared` | member vs official vs operator vs owner, report target type, review access yes vs no |
| 20 | Admin / owner / Rachi | `app/admin.tsx`, `app/profile/[userId].tsx`, `app/chat/*` | `_lib/moderation.ts`, `_lib/officialAccounts.ts`, `_lib/channelReadModels.ts`, `_lib/monetization.ts`, `_lib/appConfig.ts`, `_lib/session.tsx` | Bounded admin/operator console, official Rachi identity, creator grants, programming/config control | `PARTIALLY_REAL` | `internal` | owner vs operator vs moderator vs member, official vs ordinary identity, privileged write allowed vs blocked |
| 21 | Legal / support / account | `app/privacy.tsx`, `app/terms.tsx`, `app/account-deletion.tsx`, `components/legal/legal-page-shell.tsx`, `app/support.tsx`, `app/beta-support.tsx`, `components/system/support-screen.tsx`, `app/settings.tsx` | `_lib/runtimeConfig.ts`, `_lib/betaProgram.tsx`, `_lib/session.tsx` | Public legal content, signed-in support/feedback, legal URL routing, account-deletion instructions | `PARTIALLY_REAL` | `shared` | public legal vs signed-in support, closed-beta vs public-v1, topic-specific support flows |
| 22 | Realtime / media / LiveKit | `components/watch-party-live/livekit-stage-media-surface.tsx`, `app/player/[id].tsx`, `app/watch-party/live-stage/[partyId].tsx`, `_lib/livekit/*` | `_lib/runtimeConfig.ts`, `_lib/livekit/join-boundary.ts`, `_lib/livekit/token-contract.ts`, `_lib/livekit/react-native-module.tsx` | LiveKit bootstrap, join-contract prep, native media surface for Watch-Party Live and Live Stage | `PARTIALLY_REAL` | `shared` | host vs viewer publish posture, contract ready vs unavailable, connected vs fallback, native vs web |
| 23 | Live audio / mic / playback routing | `components/watch-party-live/livekit-stage-media-surface.tsx`, `app/watch-party/live-stage/[partyId].tsx`, `app/player/[id].tsx`, `app/watch-party/[partyId].tsx`, `app/communication/index.tsx`, `app/communication/[roomId].tsx` | `_lib/livekit/react-native-module.tsx`, `hooks/use-communication-room-session.ts`, `_lib/watchParty.ts`, `_lib/communication.ts` | Mic capture, mute/unmute truth, playback output routing, permission handling, connected-vs-silent honesty across live/watch and communication flows | `PARTIALLY_REAL` | `shared` | host vs viewer vs speaker, mic allowed vs denied vs blocked, muted vs unmuted, connected vs connected-but-silent, joined vs left, playback output routed vs not |
| 24 | Runtime / config / env | `app.config.ts`, `_lib/runtimeConfig.ts`, `_lib/appConfig.ts`, `_lib/featureFlags.ts`, `app/_layout.tsx` | Firebase bootstrap helpers, RevenueCat bootstrap, LiveKit bootstrap | Runtime values, app defaults, legal URLs, feature toggles, provider bootstrap | `FULLY_REAL` | `shared` | closed-beta vs public-v1, valid vs invalid runtime config, remote-config default vs override |

## Integration Map

| System | Depends on | Integration status | Connection style | What breaks first if wrong |
| --- | --- | --- | --- | --- |
| App shell / discovery | auth/session, app config, title data, user data, watch-party room metadata | `PARTIAL` | mixed shared truth plus duplicated title reads | Home/Explore/My List drift on title/live metadata |
| Auth / session | Supabase auth, root layout, analytics/crashlytics | `SOLID` | shared truth | sign-in redirects and session identity |
| Beta / access gating | session, runtime env, beta membership tables, support feedback | `SOLID` | shared truth | blocked users reaching beta-only surfaces |
| Public profile / channel | user data, official account truth, access resolver, chat, friend graph, events/reminders, moderation | `PARTIAL` | shared helpers plus route-owned composition | public route can show stale or shallow community/event truth before room/chat follow-through |
| Creator control | session, beta, profile data, audience read models/actions, creator permissions, events/reminders | `PARTIAL` | shared truth | creator settings can look broader than the backed audience/event systems |
| Title / content detail | title rows, access resolver, monetization, engagement, moderation, my-list | `SOLID` | shared truth | title gate or engagement state mismatch |
| Standalone player | title data, access, progress, watch-party handoff, LiveKit boundary | `PARTIAL` | shared truth plus route-only handoff | `partyId` direct-entry or watch-party-live media path |
| Watch-party entry | session, beta, watch-party helper, access resolver, monetization sheet | `SOLID` | shared truth | room create/join gating and mode handoff |
| Party Room | watch-party room truth, access, monetization, moderation, LiveKit join prep | `PARTIAL` | shared room truth plus route-owned handoff | party-to-watch-party-live media path or invite/member context |
| Live Room / Live Stage | watch-party room truth, access resolver, LiveKit runtime, route-local participant state | `FRAGILE` | shared truth plus heavy route-only state | on-stage media/role proof, fallback path, control reliability |
| Chi'lly Chat / direct thread | session, chat helper, official account truth, friend graph, communication room | `PARTIAL` | shared truth | thread-call handoff and friendship continuity |
| Communication room | session, beta, communication helper, access resolver, moderation | `PARTIAL` | mostly separate helper-owned truth | RTC stability, room return path, parity with canonical live/chat surfaces |
| Friend graph | session, Supabase RPCs, profile/chat adoption | `PARTIAL` | shared helper truth with thin route adoption | friend state exists but wider self/private surfaces are absent |
| Audience / follower / subscriber | schema/read models, creator actions, profile visibility posture | `PARTIAL` | shared helper truth with creator-only UI | public/creator audience expectations drift apart |
| Scheduled events / reminders | event helper, reminder helper, profile/channel-settings | `PARTIAL` | helper-only plus route-only connection | events look real but do not yet drive canonical room entry, access, or notification UI |
| Access / entitlements | monetization, room rules, watch-party, communication, user profile defaults, official truth | `SOLID` | shared truth | surface-specific access labels drift if a route bypasses the resolver |
| Monetization | RevenueCat, creator permissions, access sheet, title/player/watch-party routes | `PARTIAL` | shared truth plus partial rollout | purchase/gate copy stays honest, but later sponsor/ad pieces are still not real |
| Ads / sponsor foundation | monetization flags, admin controls, title fields | `FAKE/IMPLIED_ONLY` | partial rollout / placeholder only | public surfaces implying ad capability that does not exist |
| Moderation / safety | report entry routes, admin queue, creator safety summary, official identity | `PARTIAL` | shared truth | review/resolution expectations exceed backed queue/read truth |
| Admin / owner / Rachi | session, beta, moderation, monetization grants, app config, official account truth | `PARTIAL` | shared truth | admin surface feels broader than current owner/Rachi control truth |
| Legal / support / account | legal runtime URLs, support screen, beta feedback, session | `PARTIAL` | public legal routes plus signed-in support | support/account deletion expectations exceed current manual support flow |
| Realtime / media / LiveKit | runtime config, Supabase token function, join-boundary handoff, player/live-stage surfaces | `FRAGILE` | shared truth with route fallback paths | media join/fallback behavior on current live/watch surfaces |
| Live audio / mic / playback routing | LiveKit media surfaces, communication RTC, Expo Audio permissions/session, watch-party room truth | `FRAGILE` | shared truth plus route-local mute/permission state | participants look live or muted while no real local audio is publishing, or audio routes as silent even though the room looks connected |
| Runtime / config / env | Expo config, runtime config, app config, feature flags, provider bootstrap | `SOLID` | shared truth | environment misconfiguration, wrong URLs, wrong feature posture |

## Critical And Major Integration Seams

### 1. Critical blocker
- Systems involved: `Party Room`, `Live Room / Live Stage`, `Standalone player`, `Realtime / media / LiveKit`, `Live audio / mic / playback routing`
- Exact owner files: `app/watch-party/[partyId].tsx`, `app/watch-party/live-stage/[partyId].tsx`, `app/player/[id].tsx`, `components/watch-party-live/livekit-stage-media-surface.tsx`, `_lib/livekit/join-boundary.ts`, `_lib/livekit/react-native-module.tsx`
- Why it matters: this is the one core Public v1 social/live stack whose cross-route media and audio behavior is still only partially integrated and still depends on fallback paths plus later multi-device proof.
- Type: `wiring`, `state-handling`, `structural ownership`
- Safest fix size: `medium`

### 2. Major integration issue
- Systems involved: `Scheduled events / reminders`, `Public profile / channel`, `Creator control`, `Access / entitlements`, `Watch-party entry`
- Exact owner files: `app/profile/[userId].tsx`, `app/channel-settings.tsx`, `_lib/liveEvents.ts`, `_lib/notifications.ts`, `_lib/accessEntitlements.ts`, `app/watch-party/index.tsx`
- Why it matters: creator events and reminder enrollments are backed, but they still do not resolve into canonical room entry, event access, or a real notification surface, so the systems look more connected than they are.
- Type: `logic`, `rollout gap`
- Safest fix size: `medium`

### 3. Major integration issue
- Systems involved: `Communication room`, `Chi'lly Chat / direct thread`, `Realtime / media / LiveKit`
- Exact owner files: `app/communication/index.tsx`, `app/communication/[roomId].tsx`, `hooks/use-communication-room-session.ts`, `_lib/communication.ts`, `app/chat/[threadId].tsx`
- Why it matters: small-room RTC is real, but it still lives as a separate compatibility stack from the LiveKit-backed live/watch systems, so the product can feel like two different realtime systems that only partially meet.
- Type: `structural ownership`, `wiring`
- Safest fix size: `broad/risky`

### 4. Major integration issue
- Systems involved: `App shell / discovery`, `Title / content detail`
- Exact owner files: `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, `app/(tabs)/my-list.tsx`, `app/title/[id].tsx`, `_lib/userData.ts`, `app/lib/_supabase.ts`
- Why it matters: Home, Explore, and My List do not yet share one content read-model path, so title/live metadata can drift and discovery can behave like a separate data system.
- Type: `wiring`, `duplicated truth`
- Safest fix size: `medium`

## Systems Already Solid
- Auth/session root gating is solid: the app shell, login/signup, and signed-out redirects share one real session owner.
- Beta gating is solid on the surfaces that actually use it: blocked membership states, public-v1 bypass, onboarding ack, and feedback submission are real.
- The current access resolver is solid for current channel/content/room truth: profile, settings, title, player, watch-party, live, and communication all call into the same shared access layer for supported current states.
- Title engagement is solid where it is supposed to be real: likes and shares are backed on `app/title/[id].tsx` and `app/player/[id].tsx`.
- Legal/public content is solid for the exact bounded slice: privacy, terms, and account-deletion content owners are real and independent of session state.
- Runtime/config/env is solid: Expo config, runtime config, app config, feature flags, and provider bootstrap are all real shared owners rather than route-local literals.
- Rachi’s canonical official identity is solid: the protected official account is shared across profile/chat/admin-facing truth instead of being split into a ghost route.

## Best Next 3 Systems / Integration Lanes

### 1. Most important next lane
- Lane: `Live/watch-party realtime + audio proof and handoff validation`
- Systems: `Party Room`, `Live Room / Live Stage`, `Standalone player`, `Realtime / media / LiveKit`, `Live audio / mic / playback routing`
- Why first: it is the highest-risk current Public v1 integration seam on a core user-facing stack, and audio truth is part of the same unresolved cross-route live proof.

### 2. Second
- Lane: `Scheduled events / reminders -> canonical room/access integration`
- Systems: `Scheduled events / reminders`, `Public profile / channel`, `Creator control`, `Access / entitlements`
- Why second: the event/reminder helper foundation is already real enough that route adoption can now over-promise if room entry, reminder delivery, and event-access truth stay disconnected for too long.

### 3. Third
- Lane: `Discovery/content-data read-model unification`
- Systems: `App shell / discovery`, `Title / content detail`
- Why third: Home, Explore, and My List still do not consume one clearly shared content truth, which is a quieter but whole-app source of drift.

## Honest Bottom Line
- Chi'llywood already has many real systems, not just screens.
- The most mature shared systems today are session/auth, beta gating, access resolution for current supported states, title/player engagement, legal content, runtime config, and bounded official-account truth.
- The biggest current cross-system risk is not a missing later-phase feature. It is the still-partial live/watch-party realtime and audio integration proof across player, party room, live stage, and LiveKit media/audio handoff.
