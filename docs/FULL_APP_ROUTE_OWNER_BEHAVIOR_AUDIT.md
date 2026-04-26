# Full App Route Owner Behavior Audit

Date: 2026-04-26

Repo root: `/Users/loverslane/chillywood-mobile`

Branch at audit start: `main`

HEAD at audit start: `d0e884850496b5c7d20de5c058a851778465a26d`

Unrelated local dirt at audit start:

- `.gitignore`
- `docs/LIVE_STAGE_TWO_DEVICE_PROOF.md`
- `scripts/proof-live-stage-video-check.sh`
- `supabase/.branches/`

No product code was changed for this audit.

## 1. Executive Summary

Chi'llywood's core route split is mostly aligned with doctrine:

- Profile is the person/social identity and public discovery surface.
- Channel is the creator's mini streaming platform inside the Profile/Channel surface.
- Channel Settings owns owner management, including creator upload/manage controls.
- Creator Media owns upload, source resolution, creator video visibility, management, and player handoff.
- Player owns standalone video watching.
- Player Watch-Party Live owns title/content watch-party entry and routes into the normal Party flow.
- Home Live Watch-Party owns live-first room entry and routes into Live Stage.
- Live Stage owns camera-stage behavior.
- Party Room owns shared video watch-party behavior.
- Chat owns native Chi'lly Chat.
- Admin owns platform/operator controls.

The important recent behavior is correct:

- Creator videos open `/player/[id]?source=creator-video`.
- Creator videos use the same premium Player shell as platform/admin titles.
- Creator-upload Watch-Party linking is built and routes through `/watch-party` and `/watch-party/[partyId]`, not Live Stage.
- Platform/admin title Watch-Party still uses the normal title/content Party flow.
- Remote Supabase schema/RLS for creator-video Watch-Party is applied and proven through `202604260004`.

The biggest audit findings are not broad architecture failures. They are launch-hardening and ownership cleanup items. The highest-priority route/owner hardening findings from this audit were fixed after the initial docs pass:

1. `app/modal.tsx` no longer renders a template modal. It redirects to the canonical tabs surface.
2. `/communication` no longer exposes a standalone lobby/create/join surface. It redirects to `/chat`, while `/communication/[roomId]` remains for guarded call-room compatibility.
3. `app/lib/_supabase.ts` is now only a compatibility shim that re-exports the canonical `_lib/supabase.ts` client, and active route imports were pointed at the canonical owner.
4. Non-creator `/player/[id]` no longer falls back to the first local title or bundled sample media for missing platform ids. Missing platform title routes now show an honest unavailable state.
5. Billing/premium purchase UX now includes an honest `/subscribe` account-owned Premium surface. It reads the existing RevenueCat/entitlement owners, exposes restore/manage only through real helpers, and does not grant Premium locally when store setup is unavailable.
6. Public v1 still needs deferred runtime proof: two-device creator-video Watch-Party, draft/private blocked state, signed-out/non-premium blocked state, and final route smoke.

This audit recommends documentation and targeted follow-up fixes. It does not recommend a route redesign.

## 2. Route Owner Map

### Root, Auth, Legal, and Support

| Route | Owner file | System | What it owns | Must not own | Access | Backend dependencies | Enters | Exits | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Root layout | `app/_layout.tsx` | App shell, auth gate, providers | Session provider, beta provider, root stack, error boundary, LiveKit/Firebase/RevenueCat bootstrap | Screen business rules | Public legal routes bypass session; normal app routes use SessionProvider | Supabase session, beta program, config, monetization bootstraps | App launch | Route stack | V1 core |
| Auth layout | `app/(auth)/_layout.tsx` | Auth | Auth stack grouping | Account settings or app shell | Signed-out primary, signed-in redirected by root gate | Supabase auth | Login/signup | Main app | V1 core |
| Login | `app/(auth)/login.tsx` | Auth | Email/password sign-in, redirectTo support | Entitlement or profile ownership | Signed-out; signed-in redirect by root | Supabase auth | Auth links, route guard | Redirect target or tabs | V1 core |
| Signup | `app/(auth)/signup.tsx` | Auth | Account creation, redirectTo support | Profile/channel setup beyond session | Signed-out; signed-in redirect by root | Supabase auth | Login link | Redirect target | V1 core |
| Privacy | `app/privacy.tsx` | Legal | Privacy copy | Runtime settings | Public legal path | None | Settings/support/web | None | V1 core |
| Terms | `app/terms.tsx` | Legal | Terms copy | Runtime settings | Public legal path | None | Settings/support/web | None | V1 core |
| Account deletion info | `app/account-deletion.tsx` | Legal/support | Public account deletion instructions | Self-serve deletion execution | Public legal path | None | Settings/support/web | Support/account process | V1 support route; self-serve delete still needs launch proof |
| Community Guidelines | `app/community-guidelines.tsx` | Legal/safety | Launch content and conduct rules | Moderation enforcement workflow | Public legal path | None | Settings/support/web | Support/report paths | V1 core; legal review pending |
| Copyright / DMCA | `app/copyright.tsx` | Legal/safety | Copyright contact path and creator-upload rights guidance | Automated takedown adjudication | Public legal path | None | Settings/support/web | Support/report paths | V1 core; legal review pending |
| Support | `app/support.tsx`, `components/system/support-screen.tsx` | Support | Help, feedback entry, sign-in prompt for account deletion support | Legal policy or account deletion execution | Public; richer feedback when signed in/beta | Beta feedback only | Settings, beta-support, beta access | Auth/login, feedback sheet | V1 core |
| Beta support | `app/beta-support.tsx` | Support compatibility | Redirects non-beta env to `/support` | Separate support product | Public | Config | Old support links | `/support` | Compatibility |
| Modal | `app/modal.tsx` | Compatibility redirect | Redirects accidental modal deep links to the canonical tabs surface | Product behavior | Root stack redirect | None | Root stack/deep link | `/(tabs)` | Resolved hardening item |

### Tab and Discovery Routes

| Route | Owner file | System | What it owns | Must not own | Access | Backend dependencies | Enters | Exits | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tabs layout | `app/(tabs)/_layout.tsx` | App navigation | Home/explore/my-list tab shell | Route-level business rules | Root auth gate redirects signed-out tab access | None | Root stack | Tab screens | V1 core |
| Home `/` | `app/(tabs)/index.tsx` | Home/discovery | Featured titles, continue watching, live watch-party entry, own profile/settings shortcuts | Creator upload management, Party Room logic, Live Stage logic | Signed-in by root tab guard | `titles`, `watch_history`, `watch_party_rooms`, `user_profiles`, app config | Tabs | `/player/[id]`, `/title/[id]`, `/watch-party?mode=live`, `/profile/[userId]`, `/settings` | V1 core |
| Explore | `app/(tabs)/explore.tsx` | Discovery | Browse platform/admin titles | Creator upload management | Signed-in by root tab guard | `titles`, active title room metadata | Tabs | `/title/[id]` | V1 core |
| My List | `app/(tabs)/my-list.tsx` | Saved content | User saved/listed platform titles | Creator upload management | Signed-in by root tab guard | `user_list`, `titles` | Tabs | `/title/[id]` | V1 core |

### Profile, Channel, Creator Media, Title, and Player

| Route | Owner file | System | What it owns | Must not own | Access | Backend dependencies | Enters | Exits | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Profile/Channel `/profile/[userId]` | `app/profile/[userId].tsx` | Profile + Channel surface | Public identity, owner/public channel surface, creator video display, profile actions, channel empty states | Upload/save/delete logic, Player playback, admin moderation writes | Signed-in normal app route; public viewer vs owner behavior is user-id based | `user_profiles`, `videos`, creator events, audience summaries, room snapshots, safety reports | Home, Chat, Party Room, Live Stage, creator cards | `/channel-settings`, `/player/[id]?source=creator-video`, `/title/[id]`, `/watch-party`, `/watch-party/[partyId]`, `/watch-party/live-stage/[partyId]`, `/chat`, `/chat/[threadId]` | V1 core |
| Channel Settings `/channel-settings` | `app/channel-settings.tsx` | Channel owner controls | Owner channel management, creator upload/manage, profile/channel settings, creator events, audience summaries, safety/admin summaries | Public channel display, standalone playback, admin platform-title ownership | Signed-in active beta user only | `user_profiles`, `creator_permissions`, `videos`, creator video storage, `creator_events`, `channel_*`, `safety_reports`, admin summaries | Owner profile/settings | `/player/[id]?source=creator-video` | V1 core |
| Title detail `/title/[id]` | `app/title/[id].tsx` | Platform/Admin Title detail | Platform title metadata, access sheet, title play, title Watch-Party entry, title report | Creator upload/player source, Live Stage | Signed-in normal app route; access checks through content entitlements | `titles`, access entitlements, engagement, safety reports | Home, Explore, My List, Profile linked content | `/player/[id]`, `/watch-party?titleId=...` | V1 core |
| Platform Player `/player/[id]` | `app/player/[id].tsx` | Player | Premium standalone platform title playback, title Watch-Party start, report title/player content, party playback when `partyId` present | Upload management, Profile display, Live Stage room creation | Signed-in route; access sheet/premium checks | `titles`, media sources, watch history, engagement, watch-party rooms, safety reports | Home/title/party room/admin | `/watch-party`, `/watch-party/[partyId]` | V1 core; missing platform ids now show honest unavailable state |
| Creator Video Player `/player/[id]?source=creator-video` | `app/player/[id].tsx`, `_lib/creatorVideos.ts`, `_lib/watchPartyContentSources.ts` | Creator Media + Player | Standalone creator video playback in premium shell, creator-video Watch-Party start, creator-video report, honest unavailable state | Platform fallback, upload management | Signed-in route; owner/public visibility follows video query/RLS | `videos`, `creator-videos` storage, watch-party source model, safety reports | Profile/Channel, Channel Settings | `/watch-party`, `/watch-party/[partyId]` | V1 core; two-device and blocked-state proof deferred |

### Watch-Party, Live Stage, and Communication

| Route | Owner file | System | What it owns | Must not own | Access | Backend dependencies | Enters | Exits | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Watch-Party entry/waiting `/watch-party` | `app/watch-party/index.tsx` | Party Waiting Room + Live Waiting Room | Create/join room, room code handling, split title/content Party flow from live-first flow, source_type/source_id handoff | Shared Party Room playback, Live Stage media rendering | Signed-in active beta; access gate handles premium/party-pass | `watch_party_rooms`, `watch_party_room_memberships`, source resolver, access entitlements | Home Live, Player Watch-Party, Title Watch-Party, direct join code | `/watch-party/[partyId]` or `/watch-party/live-stage/[partyId]` based on room type | V1 core |
| Party Room `/watch-party/[partyId]` | `app/watch-party/[partyId].tsx` | Shared video Watch-Party room | Shared title/content room, membership, chat/reactions, watch together, room state, handoff into Player | Live Stage media rendering except explicit live room CTA, upload management | Signed-in active beta; room access resolved before join | `watch_party_rooms`, `watch_party_room_memberships`, messages, sync events, source resolver, access entitlements | Waiting room/deep link | `/player/[id]`, `/player/[id]?source=creator-video`, `/watch-party/live-stage/[partyId]`, profile/chat | V1 core |
| Live Stage `/watch-party/live-stage/[partyId]` | `app/watch-party/live-stage/[partyId].tsx`, `components/watch-party-live/livekit-stage-media-surface.tsx` | Live Watch-Party / LiveKit | Live camera stage, Live First/Live Watch-Party mode, LiveKit join contract, participant media, live-stage reporting | Creator video party player, platform title source model | Signed-in active beta; room access resolved before join | `watch_party_rooms`, memberships, LiveKit token contract, safety reports | Home Live waiting room, live room CTA, profile linked live | `/watch-party/[partyId]`, profile, chat, `/watch-party?mode=live` | V1 core; separate from creator-video Watch-Party |
| Chat inbox `/chat` | `app/chat/index.tsx` | Chi'lly Chat | Native chat inbox, official starter, direct thread entry | Room media rendering, Profile ownership | Signed-in route behavior expected; empty/signed-out state is local | `chat_threads`, `chat_thread_members`, `chat_messages`, profiles | Profile self/public, room invites | `/chat/[threadId]`, `/profile/[userId]` | V1 core |
| Chat thread `/chat/[threadId]` | `app/chat/[threadId].tsx` | Chi'lly Chat | Direct messages, message send, thread membership, profile/report/call actions | Channel settings, Party Room playback | Signed-in thread member | `chat_threads`, `chat_thread_members`, `chat_messages`, profiles, communication room helpers | Chat inbox/profile | `/profile/[userId]`, communication call helpers | V1 core |
| Communication lobby `/communication` | `app/communication/index.tsx` | Communication compatibility redirect | Redirects old communication lobby hits to canonical Chi'lly Chat | Normal Chat destination, normal Watch-Party destination, standalone call-room creation | Redirect only | None | Direct/legacy route | `/chat` | Resolved hardening item |
| Communication room `/communication/[roomId]` | `app/communication/[roomId].tsx` | Communication compatibility/calls | Call room media, membership, return to linked watch-party/live route | Watch-Party or Live Stage ownership | Signed-in active beta plus feature/native gates | `communication_rooms`, memberships, safety reports | Chat/call helpers/direct communication lobby | Return to `/watch-party/[partyId]`, `/watch-party/live-stage/[partyId]`, `/communication` | Compatibility; guard retained |

### Admin, Settings, Data, and Route-Local Helpers

| Route/file | Owner file | System | What it owns | Must not own | Access | Backend dependencies | Enters | Exits | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Admin `/admin` | `app/admin.tsx` | Admin/Operator | App config, platform title programming, creator grants, role visibility, safety queue, creator-video moderation actions | Public user flow, hidden-button-only admin security | Signed-in active beta plus platform role gate | `platform_role_memberships`, `titles`, `app_configurations`, `creator_permissions`, `safety_reports`, `videos` | Direct/admin tooling | `/player/[id]` for preview | V1 core; backend-enforced roles required |
| Settings `/settings` | `app/settings.tsx` | Account settings | Logout, Profile/Channel shortcuts, support/legal links, Premium status handoff | Billing entitlement truth, creator upload execution | Signed-in; redirects to login if signed out | Supabase auth, monetization snapshot | Home/profile | `/profile/[userId]`, `/channel-settings`, `/subscribe`, `/support`, legal routes, login | V1 core |
| Subscribe `/subscribe` | `app/subscribe.tsx` | Premium / Billing UX | Account-owned Premium status, purchase/restore/manage handoff through existing monetization owners, honest unavailable states | Backend entitlement writes, fake purchase success, store configuration | Signed-in for actions; signed-out sees sign-in prompt | RevenueCat configuration, monetization snapshot, backend entitlement truth | Settings, access-gate surfaces | Login, platform subscription manager | V1 Premium surface; store proof pending |
| Local title data | `app/data/titles.ts` | Compatibility sample data | Legacy sample assets | Production source of truth | Not route | Bundled assets | Imported by legacy paths if any | N/A | Compatibility-only |
| Local Supabase duplicate | `app/lib/_supabase.ts` | Data client compatibility shim | Re-exports canonical `_lib/supabase.ts` for any legacy imports | Second client creation, separate storage key, separate runtime config | Not route | Canonical `_lib/supabase.ts` | Legacy imports only | N/A | Resolved hardening item |
| Watch-party shared helper | `app/watch-party/_lib/_room-shared.ts` | Route-local helper | UI helpers, source marker, participant display helpers | Backend session ownership | Not route | None/direct helpers | Watch-party route files | N/A | V1 helper |
| Waiting-room shared helper | `app/watch-party/_lib/_waiting-room-shared.ts` | Route-local helper | Waiting room participant/status helpers | Backend session ownership | Not route | None/direct helpers | Waiting room/live route files | N/A | V1 helper |

## 3. System Owner Map

| System | Route owners | Logic/helper owners | Backend/storage owners | Current status | V1 status | Later status | Must not own | Proof before v1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Auth / Session | `app/_layout.tsx`, `app/(auth)/*` | `_lib/session.tsx`, `_lib/supabase.ts` | Supabase auth | Working | Required | SSO/social later if desired | Premium entitlement truth | Login/signup/logout, redirect, protected deep-link behavior |
| Profile | `app/profile/[userId].tsx` | `_lib/userData.ts`, `_lib/channelReadModels.ts` | `user_profiles`, audience summary tables | Working | Required | Public channel alias later | Upload management | Owner/public route proof |
| Channel | `app/profile/[userId].tsx`, `app/channel-settings.tsx` | `_lib/channelReadModels.ts`, `_lib/channelAudience.ts` | `user_profiles`, `channel_followers`, `channel_subscribers`, `channel_audience_requests`, `channel_audience_blocks` | Working foundation | Required | Full roster later | Player playback | Owner/public/manage proof |
| Creator Media | `app/channel-settings.tsx`, `app/profile/[userId].tsx`, `app/player/[id].tsx` | `_lib/creatorVideos.ts`, `_lib/watchPartyContentSources.ts` | `videos`, `creator-videos` storage/RLS | Upload/play/watch-party linking built | Required | Advanced creator studio, transcoding later | Platform title creation | Draft/public/non-owner/two-device proof |
| Player | `app/player/[id].tsx` | `_lib/mediaSources.ts`, `_lib/watchPartyContentSources.ts` | `titles`, `videos`, media storage/source URLs | Premium shell unified | Required | Ads, subscriber playback later | Upload/edit/delete | Platform and creator playback proof |
| Platform/Admin Titles | `app/title/[id].tsx`, `app/admin.tsx` | `_lib/mediaSources.ts`, `_lib/contentEngagement.ts` | `titles`, `user_content_relationships`, `watch_history` | Working | Required | Editorial programming later | Creator upload storage | Chicago Streets/platform route proof |
| Watch-Party Live / Party Room | `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, `app/player/[id].tsx` | `_lib/watchParty.ts`, `_lib/watchPartyContentSources.ts`, `_lib/accessEntitlements.ts`, `_lib/roomRules.ts` | `watch_party_rooms`, memberships, messages, sync events | Platform and creator-video source model built | Required | Larger sync/multidevice hardening | Live Stage camera ownership | Platform/creator start, join, rejoin, access gates |
| Live Watch-Party / Live Stage / LiveKit | `app/watch-party/index.tsx`, `app/watch-party/live-stage/[partyId].tsx` | LiveKit helpers under `_lib/livekit/*`, `_lib/watchParty.ts` | `watch_party_rooms`, memberships, LiveKit token backend/config | Working from prior proof | Required | Native game streaming later | Creator-video party source | Live First/Live Watch-Party proof |
| Chat / Communication | `app/chat/*`, compatibility `app/communication/*` | `_lib/chat.ts`, `_lib/communication.ts` | `chat_threads`, `chat_messages`, `communication_rooms`, memberships | Chat working; communication route compatibility | Required for chat; call routes should stay guarded | Full call product later | Normal Party/Live routing | Thread access, send, report, no route drift |
| Admin / Operator | `app/admin.tsx` | `_lib/moderation.ts`, `_lib/appConfig.ts`, `_lib/userData.ts` | `platform_role_memberships`, `app_configurations`, `titles`, `creator_permissions`, `safety_reports`, `videos` | Working foundation | Required | Rich admin workbench later | Public user controls | Non-admin denial and admin action proof |
| Premium / Access Gate | `components/monetization/access-sheet.tsx`, route-level guards | `_lib/accessEntitlements.ts`, `_lib/premiumEntitlements.ts`, `_lib/monetization.ts`, `_lib/revenuecat.ts`, `_lib/roomRules.ts` | `user_entitlements`, `user_subscriptions`, `watch_party_pass_unlocks`, `app_configurations` | Foundation exists | Required for premium Watch-Party | Tiers/ad-free/subscriber tools later | Purchase internals alone | Signed-out/non-premium/deep-link block proof |
| Billing / Entitlements | Access sheet/settings | `_lib/revenuecat.ts`, `_lib/monetization.ts`, `_lib/premiumEntitlements.ts` | `user_entitlements`, `billing_events`, `user_subscriptions` | Entitlement foundation, RevenueCat helper | Required if premium live | Paid creator media later | Route ownership | Restore/purchase/expiry truth |
| Moderation / Safety | `app/admin.tsx`, `app/player/[id].tsx`, `app/profile/[userId].tsx`, room routes | `_lib/moderation.ts`, `components/safety/report-sheet.tsx` | `safety_reports`, `videos.moderation_status`, platform roles | Creator-video safety foundation exists | Required | Full moderation center, channel bans later | Upload itself | Report/hide/remove/non-admin proof |
| Audience Role Roster | Profile/Channel/Channel Settings | `_lib/channelAudience.ts`, `_lib/channelReadModels.ts` | `channel_followers`, `channel_subscribers`, `channel_audience_requests`, `channel_audience_blocks` | Documented and partial-backed | Honest summaries only for v1 | Unified roster, VIP, mods, teams later | Creator media security | No fake VIP/mod/sub controls |
| Comments / Reactions | Title/player/profile pieces | `_lib/contentEngagement.ts`, watch-party messages | `user_content_relationships`, room messages; no full comment-media storage | Text/engagement partial | Text/reactions where backed | Comment media post-v1 | Creator upload security | No fake comment media upload |
| Notifications / Reminders | No dedicated route found | `_lib/notifications.ts`, `_lib/liveEvents.ts` | `notifications`, `event_reminders`, `creator_events` | Backend helpers exist | Optional/non-blocking unless surfaced | Push/deep reminders later | Billing/admin | Owner-scoped RLS proof if surfaced |
| Search / Discovery | Home, Explore | `_lib/mediaSources.ts`, direct Supabase reads | `titles`, active room metadata | Platform title discovery | Required for title browsing | Creator video global discovery later | Upload management | Route smoke |
| Settings / Delete / Support | `/settings`, `/support`, legal routes | Support/legal components | Supabase auth, external support URLs/config | Working support/legal surface | Required | Self-serve deletion later | Billing entitlement writes | Store links, logout, support/deletion proof |
| Supabase/RLS Security | All routes | `_lib/supabase.ts`, generated types | All migrations/policies/storage | Local/remote proof in progress | Required | Ongoing | UI-only security | Live/local RLS proof |
| Native Game Streaming | No v1 route | Future only | Future LiveKit/screen capture owners | Not built | Not v1 | Later phase | Current Live Stage | Do not implement before v1 |
| Monetization Later | No dedicated payout route | `_lib/monetization.ts` foundation | Later ledger/payout tables absent | Premium foundation only | Premium only | Paid media/tips/coins/payouts/ads | Basic playback/upload | Do not fake paid controls |

## 4. Navigation Transition Map

### A. Home Live Watch-Party Flow

Expected:

`Home` -> `/watch-party?mode=live` -> Live Waiting Room -> Live Room -> `/watch-party/live-stage/[partyId]`.

Observed:

- `app/(tabs)/index.tsx` pushes `/watch-party` with `mode: "live"`.
- `app/watch-party/index.tsx` treats `mode === "live"` as live entry mode.
- `navigateToRoom` sends live rooms to `/watch-party/live-stage/[partyId]`.
- Wrong-code guard prevents a title/content room from being treated as live.

Status: correct. This flow must not enter `/watch-party/[partyId]` as a shared video Party Room except when the user explicitly opens the linked room context.

### B. Platform Title Watch-Party Flow

Expected:

`/title/[id]` or `/player/[id]` -> Watch-Party Live -> `/watch-party` -> `/watch-party/[partyId]` -> shared platform title player.

Observed:

- Title detail pushes `/watch-party` with `titleId`.
- Player creates or starts a party room with `sourceType: "platform_title"` and source id.
- Waiting Room preserves `sourceType/sourceId`.
- Party Room routes watch-together playback into `/player/[id]` with `partyId`.

Status: correct. It does not route to Live Stage unless the room type is live.

### C. Creator Uploaded Video Watch-Party Flow

Expected:

`/player/[id]?source=creator-video` -> Watch-Party Live -> `/watch-party` -> `/watch-party/[partyId]` -> source_type `creator_video`.

Observed:

- Profile and Channel Settings creator video cards route to `/player/[id]` with `source: "creator-video"`.
- Player creates party rooms with `sourceType: "creator_video"` and `sourceId` equal to creator video id.
- Waiting Room preserves source handoff.
- Party Room resolves creator-video source and routes playback to `/player/[id]?source=creator-video&partyId=...`.
- Current state says Android single-device proof passed and Live Stage was not used.

Status: correct, with deferred proof for two-device join/rejoin, draft/private blocked state, and signed-out/non-premium blocked state.

### D. Creator Video Player Flow

Expected:

Profile/Channel creator card -> `/player/[id]?source=creator-video` -> premium Player shell -> creator video source.

Observed:

- `app/profile/[userId].tsx` and `app/channel-settings.tsx` include `source: "creator-video"`.
- `app/player/[id].tsx` treats explicit creator-video routes as creator source routes and does not use the platform/sample fallback when that explicit source is missing.

Status: correct.

### E. Channel Settings / Creator Media Flow

Expected:

Owner Profile -> `/channel-settings` -> Content panel -> upload/manage videos.

Observed:

- Profile owner CTA routes to `/channel-settings`.
- Channel Settings owns video selection, upload, edit, publish/unpublish, delete, and open-player actions.
- Public Profile does not show upload/manage controls.

Status: correct.

### F. Profile / Channel Flow

Expected:

Profile shows person identity plus channel content. Owner sees owner CTAs. Public viewer sees public channel content only.

Observed:

- Owner is determined from the authenticated user id, not just route params.
- Owner gets manage/upload CTAs and draft inclusion.
- Public viewer sees public videos/events only and does not see owner controls.

Status: correct.

### G. Admin Flow

Expected:

Admin route opens only for admin/operator and admin actions are backend-protected.

Observed:

- `app/admin.tsx` checks signed-in, active beta state, and platform roles.
- Admin write helpers are tied to platform role logic and migration-backed policies.

Status: correct foundation. Runtime proof of non-admin denial remains a launch proof item.

### H. Premium / Protected Flows

Expected:

Protected routes/actions check entitlement; signed-out/non-premium users are blocked honestly; deep links cannot bypass.

Observed:

- Watch-Party waiting/room/live routes resolve access using entitlement and room rules.
- Title and Player use access resolution/access sheet.
- Communication routes use access gates.
- Signed-out/non-premium blocked-state proof for creator-video Watch-Party remains deferred.

Status: foundation exists; full public v1 proof still required.

## 5. Route Logic / Behavior Map

| Area | Route behavior | Logic owner | User sees | Must not happen | Finding |
| --- | --- | --- | --- | --- | --- |
| Home Live entry | Home sends `mode=live` to waiting room | Home + waiting room | Live waiting room/live room path | Title Party Room or creator-video source | Correct |
| Title watch party | Title/Player send platform source to waiting room | Player + watch-party helpers | Party Waiting Room then Party Room | Live Stage route | Correct |
| Creator-video watch party | Creator Player sends creator source to waiting room | Player + `_lib/watchParty.ts` + source resolver | Party Waiting Room then Party Room | Live Stage, sample fallback, platform fallback | Correct, more proof needed |
| Creator upload | Channel Settings owns upload/edit/delete | `_lib/creatorVideos.ts` | Upload modal/state/error/list | Public owner controls, fake upload success | Correct |
| Profile display | Profile shows public or owner channel surface | Profile + read models | Owner/public variants | Management logic in Profile | Correct |
| Admin | Admin route is role-gated | `_lib/moderation.ts` and platform roles | Admin studio or denied state | Hidden-button-only admin security | Correct foundation |
| Premium gate | Access sheet and route guards decide | Access/entitlement helpers | Paywall/blocked/loading states | Premium by button hiding only | Foundation exists, proof needed |
| Chat | Chat routes own native messages | `_lib/chat.ts` | Inbox/thread | `/communication` as normal chat destination | Chat correct, communication compatibility needs guard discipline |
| Legal/support | Public legal/support routes | Legal/support components | Static policy/support content | Runtime account deletion execution | Correct; deletion process proof still needed |

## 6. Access and Security Route Map

| Protected route/action | UI guard | Route guard | Backend/RLS owner | Deep-link risk | Status |
| --- | --- | --- | --- | --- | --- |
| Upload video | Owner-only Channel Settings | Channel Settings requires signed-in active beta | `videos`, storage policies | Low | Correct foundation |
| Edit/delete/publish creator video | Owner-only actions | Channel Settings requires signed-in owner context | `videos` owner policies plus moderation trigger | Low | Correct foundation |
| Creator video public read | Public card query | Profile helper includes drafts only for owner | `videos` select policy and storage select policy | Medium until blocked-state proof | Needs final proof |
| Draft/private video player | Owner/public read helper | Player source resolver | `videos` RLS | Medium | Proof deferred |
| Report creator video | Player/Profile report actions | Requires signed-in before submit | `safety_reports` insert policy | Low | Correct foundation |
| Admin hide/remove/restore | Admin UI role gate | Admin route role gate | `platform_role_memberships`, `videos` moderation policy | Medium | Non-admin proof required |
| Start platform Watch-Party | Player/title CTA | Waiting room/room access | `watch_party_rooms`, memberships, entitlements | Medium | Correct foundation |
| Start creator-video Watch-Party | Creator Player CTA | Waiting room/room access | `watch_party_rooms.source_type/source_id`, trigger, RLS | Medium | Single-device proof passed; more proof needed |
| Join Party Room | Room entry access sheet | Party Room bootstrap resolves access | Room membership policies | Medium | Proof required for signed-out/non-premium |
| Live Stage entry | Waiting room routes live rooms only | Live Stage bootstrap resolves access | Watch-party rooms/memberships, LiveKit token contract | Medium | Prior proof good; keep separate |
| Channel Settings | Signed-in active beta | Route state denies not signed in/inactive | Creator/user table policies | Low | Correct |
| Admin | Signed-in active beta plus role | Route state denies non-admin | Platform role policies | Medium | Correct foundation |
| Billing/entitlement writes | No public write UI | Access sheet/RevenueCat helper only | `user_entitlements`, `billing_events` operator policies | Medium | Store/backend proof required |
| Communication lobby/room | Signed-in/beta/native/feature gates | Route guards | `communication_rooms` policies | Medium | Compatibility-only, should not be broad nav destination |

## 7. Backend Dependency Map

| System | Tables/storage/functions | Current use | Risk/gap |
| --- | --- | --- | --- |
| Auth/Profile | Supabase auth, `user_profiles` | Session, identity, channel surface | Public profile/channel proof needed |
| Channel audience | `channel_followers`, `channel_subscribers`, `channel_audience_requests`, `channel_audience_blocks` | Backed summaries/actions | Full roster roles are not backed and must not be faked |
| Creator media | `videos`, `creator-videos` storage | Upload/list/play/manage | Draft/private/non-owner proof remains |
| Creator media moderation | `videos.moderation_status`, `safety_reports`, `platform_role_memberships` | Report/admin hide/remove/restore foundation | Admin/non-admin proof remains |
| Platform titles | `titles`, local title compatibility data | Home/explore/title/player | Non-creator player fallback should be tightened |
| Watch-party | `watch_party_rooms`, `watch_party_room_memberships`, messages, sync events | Platform and creator-video room/session source model | Two-device creator-video proof remains |
| Live Stage | Watch-party room tables, LiveKit token contract/config | Live camera stage | Keep separate from title/content party route |
| Chat | `chat_threads`, `chat_thread_members`, `chat_messages` | Inbox/thread/direct messages | Migration startup was fixed; runtime proof still useful |
| Communication | `communication_rooms`, `communication_room_memberships` | Compatibility call/lobby route | Doctrine says do not make `/communication` a normal destination |
| Premium/Billing | `user_entitlements`, `billing_events`, `user_subscriptions`, `watch_party_pass_unlocks`, RevenueCat | Entitlement/access foundation | Store validation and blocked-state proof remain |
| Notifications | `notifications`, `event_reminders`, `creator_events` | Helpers/events | No dedicated route; optional v1 |
| Admin | `platform_role_memberships`, `app_configurations`, `creator_permissions`, `titles`, reports | Admin studio | Non-admin proof required |
| Engagement | `user_content_relationships`, `watch_history`, `user_list` | Like/share/list/history | Needs final route smoke |
| Config | `app_configurations`, feature flags | Beta/runtime gates | Remote/local drift proof as needed |

## 8. Missing Routes and Recommended Additions

| Missing route | Needed now? | Recommended owner | Why | Recommendation |
| --- | --- | --- | --- | --- |
| `/subscribe` | Not necessarily | Premium/Billing | A dedicated subscription route may be useful if store purchase UX grows beyond the access sheet | Do not add until billing proof requires it. Current access sheet can own v1 paywall if real purchase/restore works. |
| `/admin/reports` | No | Admin/Safety | Could split safety queue from large Admin screen later | Keep reports in `/admin` for v1 unless Admin becomes unusable. |
| `/channel/[userId]` or `/channel/[handle]` | No | Profile/Channel | Could make Channel feel distinct later | Do not add now. Current doctrine says Profile/Channel is connected; avoid duplicate owner until product proves confusion. |
| `/creator-media` or `/creator-dashboard` | No | Channel Settings/Creator Media | Could reduce Channel Settings density later | Do not add now. Channel Settings is the v1 management owner. |
| `/account/delete` self-serve | Maybe launch-dependent | Settings/Account | Current route is public instruction page, not account deletion execution | If store/public launch requires in-app deletion execution, add a scoped route later. Otherwise keep support/legal path and prove links. |
| `/report` global route | No | Moderation/Safety | Current report sheets are contextual | Do not add. Reports should stay target-aware. |
| Game streaming routes | No | Native Game Streaming later | Later feature only | Document only. |
| Monetization/payout routes | No | Monetization later | Later feature only | Document only. |

## 9. Legacy, Dead, Duplicate, or Compatibility Findings

### Resolved hardening items

1. `app/modal.tsx` no longer ships the template modal UI.
   - Resolution: accidental modal deep links redirect to `/(tabs)`.
   - Remaining note: keep it as a compatibility redirect unless the route is removed intentionally later.

2. `/communication` no longer owns standalone call-room creation/join UI.
   - Resolution: `/communication` redirects to `/chat`.
   - Remaining note: `/communication/[roomId]` stays as guarded compatibility for direct/thread call rooms.

3. `app/lib/_supabase.ts` no longer creates a duplicate Supabase client.
   - Resolution: active imports use `_lib/supabase.ts`, and the old file only re-exports the canonical client.

4. Platform Player missing ids no longer fall back to a sample/local first title.
   - Resolution: unresolved platform ids show a "Title unavailable" Player state, and valid local `Chicago Streets` playback remains available by its actual local id.

### Risky but non-blocking

1. `/communication/[roomId]` is still a guarded compatibility route. Doctrine allows compatibility-only retention, but new product navigation should continue to use `/chat`, Party Room, and Live Room.

2. `docs/public-v1-release-checklist.md` appears older than the current migration chain and should be refreshed later.
   - Fix recommendation: update checklist after this audit, but do not mix that work into runtime owners.

## 10. Public v1 Blockers

1. Complete creator-video Watch-Party proof:
   - two-device join/rejoin
   - draft/private blocked state
   - signed-out/non-premium blocked state
2. Prove creator media visibility/security:
   - public sees public only
   - owner sees drafts
   - non-owner cannot manage
   - hidden/removed content does not play publicly
3. Prove premium/access gates:
   - signed-out blocked
   - non-premium blocked where premium required
   - deep links cannot bypass
   - restore/purchase path is honest
4. Prove admin/operator protection:
   - non-admin cannot enter or execute admin actions
   - admin safety actions are backend-protected
5. Prove support/settings/account requirements:
   - logout works
   - privacy/terms/support/deletion links are reachable and accurate
6. Run final Android release build and route smoke.

## 11. Risky but Non-Blocking Issues

1. `/communication/[roomId]` compatibility should stay guarded and should not become a second chat/call product owner.
2. Home/Explore/My List discover platform titles only. Creator videos appear on Profile/Channel, which is acceptable for v1, but global creator-video discovery is a later product decision.
3. `/subscribe` now exists as an account-owned Premium status and restore/purchase handoff. Store product configuration and live purchase proof remain pending.
4. Notification/reminder helpers exist without a dedicated notification center route. This is not a v1 blocker unless surfaced elsewhere.

## 12. Later-Phase Route and System Recommendations

1. Add a public Channel alias only if user testing shows Profile/Channel is not clear enough.
2. Add a Creator Dashboard only when Channel Settings becomes too dense for owner workflows.
3. Add `/admin/reports` when report volume justifies a dedicated moderation queue.
4. Add Native Game Streaming routes only after Public v1:
   - `/live/game-start`
   - `/live/game-stage/[streamId]`
5. Add monetization/payout routes only after ledger, KYC/tax, and payout backend owners exist.
6. Add comment media upload only after moderation/storage limits and report flows are designed.
7. Add full Audience Role Roster routes only after a unified backend roster and role audit model exist.

## 13. Recommended Fix Order

1. Finish creator media proof:
   - draft/public
   - edit
   - publish/unpublish
   - delete/unpublish
   - non-owner cannot manage
2. Finish creator-video Watch-Party proof:
   - two-device join/rejoin
   - draft/private blocked
   - signed-out/non-premium blocked
3. Prove premium/access gates for Watch-Party Live.
4. Prove admin/safety non-admin denial and admin moderation writes.
5. Prove settings/support/account deletion/store link readiness.
6. Keep `/communication/[roomId]` compatibility guarded; decide after v1 whether to redirect or remove it.
7. Final Android release build and route smoke.

## 14. Manual Android Route Proof Checklist

Use bounded logs/screenshots and save artifacts under `/tmp`.

### Creator Media

- Owner opens `/channel-settings`.
- Owner uploads/selects real video.
- Owner sees video in Channel Settings.
- Owner sees draft/private video on Profile/Channel with badge.
- Public viewer does not see draft/private video.
- Public viewer sees public video.
- Non-owner sees no upload/manage controls.
- Creator video card opens `/player/[id]?source=creator-video`.
- Player uses creator source and not sample/platform fallback.

### Creator-video Watch-Party

- Open creator video Player.
- Tap Watch-Party Live.
- Confirm route enters `/watch-party`, then `/watch-party/[partyId]`.
- Confirm it never enters `/watch-party/live-stage/[partyId]`.
- Confirm Party Room source is `creator_video`.
- Confirm no sample/platform fallback.
- Device B joins the room code and sees the same creator video.
- Leave/rejoin preserves source.
- Draft/private creator video cannot start public Watch-Party.
- Signed-out/non-premium behavior is blocked honestly where premium is required.

### Platform Title Watch-Party

- Open known platform title, preferably Chicago Streets.
- Open `/player/[id]`.
- Tap Watch-Party Live.
- Confirm Party Waiting Room and Party Room work.
- Confirm source is `platform_title`.
- Confirm Live Stage is not used.

### Home Live Watch-Party

- Home -> Live Watch-Party.
- Confirm Live Waiting Room appears.
- Confirm Live Stage route is `/watch-party/live-stage/[partyId]`.
- Confirm Live First and Live Watch-Party modes still show camera participants correctly.

### Admin and Safety

- Non-admin attempts `/admin` and is denied.
- Admin opens `/admin`.
- Creator video report can be submitted.
- Admin can hide/remove/restore creator video if role allows.
- Public cannot play hidden/removed video.
- Logs do not expose signed URLs or secrets.

### Settings and Support

- Settings opens for signed-in user.
- Logout returns to login.
- Support, Privacy, Terms, and Account Deletion routes are reachable.
- Account deletion path is accurate for store/public policy.

## 15. Files Read for This Audit

Control and planning docs:

- `SESSION_START_PROTOCOL.md`
- `MASTER_VISION.md`
- `ARCHITECTURE_RULES.md`
- `PRODUCT_DOCTRINE.md`
- `ROADMAP.md`
- `CURRENT_STATE.md`
- `NEXT_TASK.md`
- `ROOM_BLUEPRINT.md`
- `docs/PROFILE_CHANNEL_CONTENT_AUDIT.md`
- `docs/AUDIENCE_ROLE_ROSTER_SYSTEM.md`
- `docs/PUBLIC_V1_AND_LATER_SYSTEMS_PLAN.md`
- `docs/public-v1-release-checklist.md`
- `docs/public-v1-blueprint.md`

Route and owner files inspected through direct reads and repository-wide route/navigation searches:

- `app/_layout.tsx`
- `app/(auth)/_layout.tsx`
- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`
- `app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/explore.tsx`
- `app/(tabs)/my-list.tsx`
- `app/profile/[userId].tsx`
- `app/channel-settings.tsx`
- `app/title/[id].tsx`
- `app/player/[id].tsx`
- `app/watch-party/index.tsx`
- `app/watch-party/[partyId].tsx`
- `app/watch-party/live-stage/[partyId].tsx`
- `app/watch-party/_lib/_room-shared.ts`
- `app/watch-party/_lib/_waiting-room-shared.ts`
- `app/chat/index.tsx`
- `app/chat/[threadId].tsx`
- `app/communication/index.tsx`
- `app/communication/[roomId].tsx`
- `app/admin.tsx`
- `app/settings.tsx`
- `app/support.tsx`
- `app/beta-support.tsx`
- `app/privacy.tsx`
- `app/terms.tsx`
- `app/account-deletion.tsx`
- `app/modal.tsx`
- `app/data/titles.ts`
- `app/lib/_supabase.ts`

Logic/helper/backend files inspected through direct reads and repository-wide ownership searches:

- Files under `_lib/`, especially `accessEntitlements`, `premiumEntitlements`, `monetization`, `revenuecat`, `roomRules`, `watchParty`, `watchPartyContentSources`, `creatorVideos`, `mediaSources`, `channelReadModels`, `channelAudience`, `contentEngagement`, `moderation`, `chat`, `communication`, `liveEvents`, `notifications`, `userData`, `session`, and `supabase`.
- Route-level behavior components under `components/`, especially monetization access sheet, safety report sheet, system support/access screens, communication components, room components, and LiveKit stage media surface.
- Supabase generated types.
- Supabase migrations from `202604190004_baseline_current_schema_truth.sql` through `202604260004_tighten_watch_party_room_rls.sql`.

## 16. Final Audit Decision

Do not build new routes broadly right now.

The current app has a coherent v1 route backbone. The next work should be narrow:

- remove the accidental modal route,
- finish deferred creator media/watch-party proof,
- prove premium/admin/security gates,
- tighten two compatibility surfaces,
- then run final Android release smoke.

Anything involving full Audience Role Roster, native game streaming, paid creator media, tips, coins, payouts, ads, advanced creator studio, or comment media upload remains post-v1 unless a separate product decision changes scope.
