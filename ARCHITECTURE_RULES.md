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
- Profile social identity surface: `/profile/[userId]`
- Public Channel surface: `/channel/[userId]`
- Owner Channel Studio surface: `/channel-studio`
- Channel Settings compatibility surface: `/channel-settings`
- Platform owner/operator Admin Command Center: `/admin`
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
- Channel controls the public creator/network viewing experience on `/channel/[userId]`
- Channel Studio controls owner-only creator operations on `/channel-studio`
- Admin Command Center controls platform owner/operator operations on `/admin`; do not create duplicate admin routes such as `/admin-command-center`
- Title and player control reusable rights-aware content actions

If duplicate files or shared constants exist, prove which active surface owns the label before editing.

## Admin Command Center Rule
`/admin` is the canonical platform owner/operator route.

Admin is separate from:
- Channel Studio
- Profile Settings
- Public Channel
- Chi'lly Circle
- Room Control

Admin must remain protected by signed-in plus beta/platform-role/backend permission checks. Future admin work must not weaken route access, report visibility, privileged-write boundaries, RLS, platform_role_memberships, confirmation prompts, reason/audit requirements, or secret handling.

The Login screen may offer an Admin Command Center sign-in entry by setting `redirectTo=/admin`, but that entry must remain normal Supabase authentication followed by the canonical `/admin` platform-role checks. It must not store credentials, print credentials, hard-code admin accounts, add production bypasses, weaken `platform_role_memberships`, or make Admin visible to users who fail backend admin role checks.

Admin V1A is pushed and includes Home, Reports, Content, Roles, Audit, Rachi, Users, Premium, Kill Switches, Usage, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and System. Foundation sections must remain honest and must not show fake revenue, fake usage, fake payouts, fake sponsor money, fake network invoices, fake fraud holds, fake live ad provider state, or fake kill switches.

Admin V1B1 runtime controls config foundation is pushed. Runtime controls are typed defaults stored under the existing `app_configurations.config.runtimeControls` JSON shape, with `_lib/featureFlags.ts` owning defaults/normalization, `_lib/appConfig.ts` owning normalized app-config storage, and `app/admin.tsx` owning read-only Kill Switches status copy only. Admin Kill Switches may show `Configured foundation` and `Not enforced yet`, but must not show working toggles or imply enforcement until affected app surfaces actually read the controls.

Admin V1B2A is pushed as the first real runtime control enforcement. Signup reads `runtimeControls.new_accounts_enabled` after email/password and 18+ confirmation pass and before `supabase.auth.signUp`; when false, account creation is paused before a Supabase auth account is created. Admin may label New Accounts as `Enforced on signup`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B2B is pushed as the second real runtime control enforcement. Channel Studio's compatibility implementation in `app/channel-settings.tsx` reads `runtimeControls.uploads_enabled` from the existing normalized app-config load and blocks only new creator-video upload submit before `uploadCreatorVideo`, storage upload, or metadata insert when false. Existing video metadata edit, publish/unpublish/delete, Open Player, picker behavior, storage helpers, RLS, migrations, generated types, and the single `Video Upload` form remain unchanged. Admin may label Uploads as `Enforced on upload`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B2C is pushed as the third real runtime control enforcement. Profile post comment/reply submit in `app/profile/[userId].tsx` and creator-video comment/reply submit in `app/player/[id].tsx` read `runtimeControls.comments_enabled` after existing validation and before backed comment create or comment attachment upload. Existing comment read/display, delete, report, attachment picker selection, Watch-Party comments, Live Stage comments, Chi'lly Chat messages, Chi'lly Circle, profile privacy, Player controls/layout, RLS, migrations, generated types, and Supabase remote state remain unchanged. Admin may label Comments as `Enforced on comments`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B2D is pushed as the fourth real runtime control enforcement. Profile post creation submit in `app/profile/[userId].tsx` reads `runtimeControls.profile_posting_enabled` after owner/busy, empty-body, and length checks and before backed Profile post create or post attachment upload. Existing Profile post read/display, comments/replies, likes, deletes, reports, attachment picker selection, Chi'lly Circle, profile privacy, creator video upload, Channel Studio, Public Channel, Player, Watch-Party, Live Stage, Chat, RLS, migrations, generated types, and Supabase remote state remain unchanged. Admin may label Profile Posting as `Enforced on profile posts`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B2E is pushed as the fifth real runtime control enforcement. New creator event creation in `app/channel-settings.tsx` reads `runtimeControls.creator_posting_enabled` before `createCreatorEvent`; when false, only new event creation is paused. Existing `updateCreatorEvent` edits, creator-video upload, video metadata edit, publish/unpublish/delete, Profile posts, comments/replies, attachments, Channel Studio layout, Public Channel, Player, Watch-Party, Live Stage, Chat, RLS, migrations, generated types, and Supabase remote state remain unchanged. Admin may label Creator Posting as `Enforced on creator events`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B2F is pushed as the sixth real runtime control enforcement. Non-chat social attachment submits in `app/profile/[userId].tsx` and `app/player/[id].tsx` read `runtimeControls.attachments_enabled` before parent create and attachment upload; when false, only selected attachments are paused for Profile posts, Profile post comments/replies, and creator-video comments/replies. Text-only posts/comments remain controlled by their existing posting/comment controls. Chat attachments, room attachments, attachment reads, deletes, reports, Profile privacy, Chi'lly Circle, `_lib/socialAttachments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state remain unchanged. Admin may label Attachments as `Enforced on social attachments`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B2G is pushed as the seventh real runtime control enforcement. Standalone Chi'lly Chat attachment submit in `app/chat/[threadId].tsx` reads `runtimeControls.chat_attachments_enabled` before optimistic message insertion and before `sendChatMessage`; when false, only selected chat attachments are paused. Text-only Chi'lly Chat messages remain allowed. Room attachments, signed-in/thread gates, reads, realtime updates, mark-read behavior, `_lib/chat.ts`, `_lib/socialAttachments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state remain unchanged. Admin may label Chat Attachments as `Enforced on chat attachments`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B2H is pushed as the eighth real runtime control enforcement. Watch-Party and Live Stage room attachment submits in `app/watch-party/[partyId].tsx` and `app/watch-party/live-stage/[partyId].tsx` read `runtimeControls.chat_attachments_enabled` before `sendPartyMessageRecord` and before `createSocialAttachmentForSurface`; when false, only selected room attachments are paused. Text-only room comments remain allowed. Room layouts, LiveKit behavior, Premium gates, message reads, room routes, `_lib/watchParty.ts`, `_lib/socialAttachments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state remain unchanged. Admin may label Chat Attachments as `Enforced on chat and room attachments`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B2I-A is pushed as the ninth real runtime control enforcement. Standalone Chi'lly Chat message sends and thread call starts in `app/chat/[threadId].tsx` read `runtimeControls.chat_enabled` before optimistic message insertion, `sendChatMessage`, or `startChatThreadCall`; when false, only new standalone chat writes/call starts are paused. Rachi official starter thread creation in `app/chat/index.tsx` and non-self Profile-to-chat entry in `app/profile/[userId].tsx` also read the same control before `getOrCreateDirectThread`. `/chat` and `/chat/[threadId]` remain readable. Inbox reads, thread reads, realtime refresh, mark-read, reports, profile opens, signed-in/thread gates, `chat_attachments_enabled`, room comments, room invites, `_lib/chat.ts`, `_lib/watchParty.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state remain unchanged. Admin may label Chat as `Enforced on standalone chat`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B2I-B is pushed as the tenth real runtime control enforcement. Room invite direct-message sends in `components/chat/internal-invite-sheet.tsx` read `runtimeControls.chat_enabled` before `sendDirectInviteMessage`; when false, only invite direct-message sends are paused and system share fallback remains available. Watch-Party room text comments, Live Stage room text comments, room layouts, LiveKit behavior, Premium gates, invite sheet search, `chat_attachments_enabled`, `_lib/chat.ts`, `_lib/watchParty.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state remain unchanged. Admin may label Chat as `Enforced on chat and invites`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B2I-C is pushed as the eleventh real runtime control enforcement. Watch-Party and Live Stage room-native text/comment submits in `app/watch-party/[partyId].tsx` and `app/watch-party/live-stage/[partyId].tsx` read `runtimeControls.chat_enabled` before `sendPartyMessageRecord`; when false, only new room-native text/comment writes are paused. Existing room message reads, room layouts, LiveKit behavior, Premium gates, invite behavior/system share, `chat_attachments_enabled`, attachment picker behavior, `_lib/watchParty.ts`, `_lib/chat.ts`, `_lib/socialAttachments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state remain unchanged. Admin may label Chat as `Enforced on chat, invites, and room comments`, but must still avoid working toggles unless a future prompt scopes backed write permissions, confirmation/proof, and affected-surface behavior.

Admin V1B runtimeControls closeout truth is recorded. `new_accounts_enabled`, `uploads_enabled`, `comments_enabled`, `attachments_enabled`, `chat_enabled`, `chat_attachments_enabled`, `creator_posting_enabled`, and `profile_posting_enabled` are enforced only on the scoped pushed surfaces listed above. `live_first_enabled`, `live_watch_party_enabled`, `watch_party_live_enabled`, and `max_upload_size_mb` are configured foundation-only and must not be described as enforced. Admin `runtimeControls.ads_enabled` is not the current Ads Launch source of truth; Ads V1D2 runtime owners read normalized `app_config.adsLaunch` and remain disabled by default while `ads_enabled=false`. `premium_required_for_live` and `premium_required_for_watch_party` are not runtime switches; Premium access remains enforced by the Premium helper layer and must not be weakened.

Admin Usage Metering Foundations 37-39 is pushed. Current owners are `_lib/platformUsage.ts`, `app/admin.tsx` Usage readouts, and local migration `supabase/migrations/202605070003_platform_usage_metering_foundation.sql`. The migration defines future `platform_usage_metering_events` and `platform_usage_daily_rollups` tables but was not applied remotely in the foundation pass, and generated database types were not edited. Admin Usage must remain read-only until a future prompt explicitly scopes writes, remote migration application, generated type refresh, and proof.

Admin Usage estimate doctrine: live room counts, watch-party counts, uploads today, and participant-minutes are DB estimates; storage is a metadata estimate from existing app rows; bandwidth remains `Not connected yet` unless future real metering events/provider logs exist. These values are not cost, billing, payout, creator earnings, ad revenue, storage-billing, LiveKit invoice, or provider-log truth.

Admin must never expose Supabase service-role keys, LiveKit secrets, RevenueCat secrets, app-store keys, provider secret keys, hard-coded credentials, or test-account credentials.

## Ads Launch Foundation Rule
Ads Launch Foundation V1A/V1B/V1C and Ads Config V1D1/V1D2 are pushed as provider-neutral, no-SDK, no-real-rendering infrastructure.

Current Ads V1A owners:
- `_lib/ads/adConfig.ts`
- `_lib/ads/adEligibility.ts`
- `_lib/ads/adProvider.ts`
- `_lib/ads/providers/placeholder.ts`
- `_lib/ads/adSession.ts`
- `hooks/useAdEligibility.ts`
- `hooks/useActiveBrowsingTime.ts`
- `app/admin.tsx` for read-only/foundation Admin Ads status only

Current Ads V1B owners:
- `components/ads/NativeAdSlot.tsx`
- `app/(tabs)/index.tsx` for the Home native/feed placeholder placement only
- `_lib/ads/adSession.ts` for explicit active-browsing seconds in placeholder cap recording
- `app/admin.tsx` for read-only/foundation Admin Ads status copy only

Current Ads V1C owners:
- `components/ads/InterstitialController.tsx`
- `app/_layout.tsx` for mounting the null-rendering placeholder controller only
- `app/admin.tsx` for read-only/foundation Admin Ads status copy only

Current Ads Config V1D1 owners:
- `_lib/appConfig.ts` for optional normalized `app_configurations.config.adsLaunch` under existing app config JSON
- `app/admin.tsx` for read-only/foundation Admin Ads source/status copy only

Current Ads V1D2 owners:
- `hooks/useAdsLaunchConfig.ts` for cached/default-first normalized `adsLaunch` runtime reads
- `components/ads/NativeAdSlot.tsx` for Native/feed fallback to normalized app-config Ads Launch settings when no explicit proof/test config is passed
- `components/ads/InterstitialController.tsx` for Interstitial fallback to normalized app-config Ads Launch settings when no explicit proof/test config is passed
- `app/admin.tsx` for read-only/foundation Admin Ads source/status copy only

Ads V1A defaults `ads_enabled` to false and `ads_provider` to `placeholder`. The placeholder provider reports not connected and must not call any SDK, use real ad unit IDs, initialize providers, or render real ads.

Ads Config V1D1 normalizes `config.adsLaunch` through code-owned `ADS_LAUNCH_CONFIG_DEFAULTS`. Ads V1D2 wires `NativeAdSlot` and `InterstitialController` fallback runtime reads to normalized `app_config.adsLaunch` through `hooks/useAdsLaunchConfig.ts`. Normal runtime must still stay hidden by default because `ads_enabled` defaults false and the placeholder provider is not connected. Admin `runtimeControls.ads_enabled` is not the Ads Launch runtime source.

Ads V1B adds one native/feed placeholder foundation slot on Home. Normal runtime still hides it because `ads_enabled` defaults false. `NativeAdSlot` may render only after central eligibility passes, Premium/ad-free users must never see it or increment counters, native/feed base session cap is 1, long-use unlock allows a second native/feed placement after 120 active browsing minutes, daily native/feed cap is 3, and forbidden routes/contexts stay blocked.

Ads V1C adds a placeholder interstitial controller foundation. Normal runtime still shows no interstitial because `ads_enabled` defaults false and the placeholder provider is not connected. `InterstitialController` must render `null`, ignore first route mount, consider route transitions only, call central eligibility with `placementKind: "interstitial"`, and record placeholder interstitial shows only after eligibility and placeholder-provider success. It must preserve the 180-second first delay, 600-second spacing, base session cap 3, long-use extra +2 after 120 active browsing minutes, daily cap 6, Premium zero ads, and forbidden route/context blocking.

Premium/ad-free users must always be ineligible for ads and must not increment ad counters. Future ad placements must call the central ad config, eligibility, session/cap, and provider wrapper layers instead of making direct screen-level SDK calls.

AppLovin MAX remains the primary future ad platform. Unity LevelPlay / Unity Ads may be added later through AppLovin MAX. Do not build an AdMob-only path.

Ads must be blocked inside active LiveKit rooms, during active video playback, while typing/commenting, during upload, on subscribe/payment screens, immediately at app launch, in Admin, in Channel Studio, in Chat, and in Profile/composer contexts unless a future prompt explicitly redesigns and proves a safe surface.

CTV ads are future-only for Chi'llywood Originals and network-style content. Do not add CTV inventory, fake CTV revenue, fake ad revenue, creator earnings, sponsor revenue, payout balances, invoices, or creator revenue ledgers without a separately backed implementation.

## 18+ Signup Confirmation Rule
Launch is planned as 18+.

Public V1 Hardening H1A is pushed as a no-migration signup-only confirmation in `app/(auth)/signup.tsx`. Signup must show `Chi'llywood is for users 18 and older.`, require the user to actively confirm `I confirm I am 18 or older.`, and block before `supabase.auth.signUp` with the required 18+ confirmation alert if unchecked.

H1A must preserve existing signup email/password validation, closed-beta copy, loading state, Terms of Service link, Privacy Policy link, Community Guidelines link, and Sign In handoff.

H1B2 legal acceptance storage is pushed. Signup writes backed age/terms/privacy acceptance timestamps plus versions to `public.user_account_legal_acceptances` after account creation succeeds with an authenticated session. Do not collect full birthdate or sensitive ID verification for V1 unless a future exact legal/compliance prompt explicitly changes that product decision.

Public V1 Hardening H1B1 is pushed as private legal acceptance schema foundation only. It owns local migration `supabase/migrations/202605070001_user_account_legal_acceptances.sql` and pure helper `_lib/accountLegalAcceptance.ts`.

The intended durable storage owner is `public.user_account_legal_acceptances`, not `user_profiles`. Legal acceptance timestamps are private account/compliance data, not social profile data. The table uses owner-only authenticated RLS for select, insert, and update, and must not gain public read policies.

H1B2 applied remote migrations `202605070001` and `202605070002`, regenerated `supabase/database.types.ts` from the linked remote schema, and hardened anon table access. Anon REST reads to `user_account_legal_acceptances` must return permission denied. Legal acceptance must not be stored in `user_profiles`, AsyncStorage, or auth metadata.

H1B2 does not add first-use enforcement and must not block existing users, admin users, or test accounts. If signup returns no authenticated session because email confirmation is required, do not fake the backend write; a later first-use/sign-in persistence lane must be explicitly designed if needed.

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

## Premium Live Access Rule
Full `Live First`, `Live Watch-Party`, and `Watch-Party Live` access is Premium.

This must be enforced at visible actions, route/deep-link entry, room/session creation or join, and any LiveKit token/connect path the app controls. Free users must be blocked before full room/session/token/connect and must not receive full LiveKit room/token/connect access.

No free live/watch-party preview mode exists. Do not add preview behavior unless a future prompt explicitly defines the limited preview UX, token restrictions, cost boundary, and proof.

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
- public channels are creator-owned mini streaming platforms/networks on `/channel/[userId]`, not platform-title shelves
- Channel Studio is the owner-only creator operating system on `/channel-studio`
- `/channel-settings` remains compatibility only and must continue to resolve
- Profile `View Channel` routes to `/channel/[userId]`
- Studio `Preview Channel` routes to `/channel/[ownUserId]`
- cross-cutting profile/channel-platform doctrine lives in `PRODUCT_DOCTRINE.md`
- the authenticated user's own profile opens their own channel/profile surface
- viewing another user's profile should support opening or creating a direct Chi'lly Chat thread
- photos/videos, likes, saved movies/videos, creator/channel identity, and community interaction must extend the same profile/channel system over time, but Chi'llywood Originals/platform `titles` must stay in platform surfaces and must not be used as creator-channel filler
- public Channel must not expose owner-only Studio controls, upload, edit, publish, unpublish, delete, audience management, analytics, admin controls, drafts, private videos, or unpublished videos to non-owners

## Relationship Separation Rule
- Follow is channel audience.
- Chi'lly Circle is personal mutual connection/friendship.
- Subscribers are later monetized channel supporters.
- Account-tier Premium is a subscription entitlement.
- Admin is platform/operator authority.

Do not rename one relationship into another, reuse one backend truth as another, or imply one relationship grants permissions owned by another system.

## Billing / Payout Separation Rule
- app-store subscriptions and in-app billing are not the creator payout system
- creator payout infrastructure should assume Stripe Connect or an equivalent marketplace payout layer that stays separate from app-store billing
- RevenueCat can support subscription and entitlement behavior, but it is not the creator payout layer

## Official Platform Account Rule
Rachi is Chi'llywood's official platform-owned seeded account.

Architecture requirements:
- Rachi must use the canonical `/profile/[userId]` Profile route, `/channel/[userId]` public Channel route where channel presentation is needed, and the canonical Chi'lly Chat thread path instead of disconnected special routes
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

## Production Prompt Rule
Future Codex prompts for Chi'llywood must be production-grade. They need exact product truth, scope, route/screen purpose, UI layout, buttons/actions, data sources, empty/loading/error states, permissions/gates, backend/RLS/storage limits, forbidden areas, validation/manual proof, and report format. Vague prompts such as "modernize", "polish", "add filters", "add route", or "improve dashboard" are not enough unless every behavior is spelled out.
- immediate execution scope belongs in `NEXT_TASK.md`
- session guardrails belong in `SESSION_START_PROTOCOL.md`
- temporary ADB/device/emulator debugging does not belong in permanent product doctrine

## Proof Status Bookkeeping Rule
- locked product truth must stay separate from current checkpoint truth
- current checkpoint truth must stay separate from current-build proved items and still-pending proof items
- a flow, batch, or stage only counts as passed/done when current terminal/workflow output proves it on the current build
- do not mark a stage complete while an active local proof item or required cloud rerun is still pending
- do not invent a final human verification gate unless the control files explicitly require one
