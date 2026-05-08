# PRODUCT DOCTRINE

## Purpose
`PRODUCT_DOCTRINE.md` is the single governing home for Chi'llywood's cross-cutting monetization, compliance, product-phase, and profile/channel-platform truth.

It works alongside:
- `MASTER_VISION.md` for identity-level product truth
- `ARCHITECTURE_RULES.md` for architectural constraints and file-placement rules
- `ROOM_BLUEPRINT.md` for room-specific implications only
- `ROADMAP.md` for the current phased planning split

This file does not replace or reinterpret the locked Chi'lly Chat communication doctrine or the locked Rachi official-account doctrine. Those remain carried forward through `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md`.

If older active docs contain scattered cross-cutting monetization, compliance, product-phase, or profile/channel-platform statements that conflict with this file, this file wins unless a narrower room-specific rule in `ROOM_BLUEPRINT.md` intentionally governs that room.

## Monetization Core
- creators can choose whether content is free or paid
- preset price tiers are preferred over arbitrary pricing
- Chi'llywood Premium gates all full live/watch-party access: Live First, Live Watch-Party, and Watch-Party Live
- Live First is no longer free full access
- free users do not get full live/watch-party access, full LiveKit room tokens, or full LiveKit room/connect access
- no free live/watch-party preview mode exists; any future preview must be explicitly designed, limited, low-cost, separately gated, and proved safely
- the current planned Premium price is `$9.99/month` and `$99/year`
- Premium supports expensive live usage
- RevenueCat remains the Premium subscription truth owner
- creators keep 100% of tips
- tips are anonymous to other users but fully traceable in backend and admin records
- Chi'llywood should not take a direct percentage cut from tips
- Chi'llywood's main platform percentage should come from paid content sales
- creator payouts should be calculated from net receipts actually received after app-store fees, taxes, refunds, chargebacks, and adjustments, not gross sticker price
- if app currency is used for tipping, it should be treated as internal app coins or credits, not crypto or blockchain tokens
- the current preferred Chi'llywood platform cut for paid content is 20% of net receipts

## Premium And Ticketed Room Doctrine
- Premium access, ticketed events, and paid room entry are approved Chi'llywood directions, but they must stay compatible with the layered room-participation model defined in `ROOM_BLUEPRINT.md`.
- Paid or premium access should grant room entry, entitlements, and audience privileges first; it should not automatically imply equal live-camera rights, equal visible tiles, or equal room authority.
- Public v1 and near-term room truth must stay honest that large membership scale and true live-seat scale are different.
- Future premium rooms may expand featured capacity, moderation tooling, entitlements, and audience controls, but should still treat host, seated, featured, and audience layers as distinct.
- Future infrastructure may raise simultaneous live-seat limits over time, but ticketed or premium growth should not be described as `500+` equal live feeds until the media stack actually supports that.

## Compliance Standing Rule
- future monetization guidance must proactively stay compliant with Apple and Google billing rules, creator payouts, tax reporting, moderation requirements, and country rollout constraints
- compliance-sensitive design choices must be called out before implementation decisions are made
- app-store billing decisions and creator payout decisions must be evaluated together, but they must not be collapsed into the same system
- Launch is planned as 18+. Public V1 Hardening H1A is pushed as a signup-only, no-migration confirmation: new signup shows `Chi'llywood is for users 18 and older.`, requires `I confirm I am 18 or older.`, and blocks account creation before `supabase.auth.signUp` if unchecked.
- Public V1 Hardening H1B1 is pushed as private legal acceptance schema foundation: migration `supabase/migrations/202605070001_user_account_legal_acceptances.sql` defines `public.user_account_legal_acceptances`, and `_lib/accountLegalAcceptance.ts` defines legal acceptance constants/payload/write helpers.
- H1B1 intentionally keeps age/terms/privacy acceptance timestamps out of `user_profiles`; this data belongs in a private account legal acceptance table with owner-only authenticated RLS.
- H1B2 legal acceptance storage is pushed. Remote migrations `202605070001` and `202605070002` are applied, generated database types are regenerated from the linked remote schema, signup writes age/terms/privacy acceptance timestamps plus versions after account creation succeeds with an authenticated session, and anon access to the table is denied.
- H1B2 does not use `user_profiles`, AsyncStorage, or auth metadata for legal acceptance, does not collect full birthdate or ID verification, does not add first-use enforcement, and does not block existing users.

## Payout Direction
- standard scheduled creator payouts remain free
- the monetized fee lane is `Instant Payout` / `Instant Cash Out`
- `up to $25`: about `$0.50-$0.75`
- `$25.01-$200`: `$1.99`
- `above $200`: small percentage with a cap rather than a flat fee; the preferred example is `1.5%` capped at `$4.99`
- the fee must be clearly labeled and clearly disclosed as `Instant Payout` / `Instant Cash Out`
- creator payout infrastructure should assume Stripe Connect or an equivalent marketplace payout layer
- creator payouts must remain separate from app-store billing and separate from RevenueCat

## Ads Direction
- ads are a secondary revenue stream, not the core business model
- Premium remains ad-free
- free users see ads at launch
- Premium users see zero ads
- ads support free browsing
- Ads Launch Foundation V1A/V1B/V1C and Ads Config V1D1/V1D2 are pushed as provider-neutral foundation only
- no real ads render by default; Ads V1B adds a Home native/feed placeholder foundation and Ads V1C adds a placeholder interstitial controller foundation that both stay hidden in normal runtime while `ads_enabled` is false
- Ads Config V1D1 adds optional normalized `app_configurations.config.adsLaunch` foundation under `_lib/appConfig.ts`, defaulting through code-owned `ADS_LAUNCH_CONFIG_DEFAULTS`; Admin Ads reads it only for read-only status copy
- Ads V1D2 wires Native/feed and Interstitial runtime fallback reads to normalized `app_configurations.config.adsLaunch` through `hooks/useAdsLaunchConfig.ts`; default runtime still hides ads because `ads_enabled=false` and the placeholder provider is not connected
- Admin `runtimeControls.ads_enabled` is not currently the Ads Launch source of truth and must not be layered into Ads Launch runtime without a separate source-of-truth decision
- no AppLovin SDK, Unity LevelPlay SDK, Unity Ads SDK, or AdMob SDK is installed for ads
- no real ad IDs, real provider initialization, CTV inventory, fake ad revenue, sponsor revenue, creator earnings, payout balances, invoices, or CTV revenue were added by Ads V1A/V1B/V1C/V1D1/V1D2
- Ads V1A defaults `ads_enabled` to false and uses a placeholder provider that reports not connected and does not call any SDK
- Ads V1A added central config, eligibility, provider, placeholder provider, session/daily cap, active browsing time, and read-only/foundation Admin Ads status
- Ads V1B added one native/feed placeholder placement on Home through `NativeAdSlot`
- Ads V1B native/feed placement renders only after V1A eligibility passes, Premium/ad-free users never see it, eligible placeholder shows record only once per placement, base native/feed session cap is 1, long-use unlock allows a second native/feed placement after 120 active browsing minutes, and daily native/feed cap is 3
- Ads V1C added a null-rendering placeholder interstitial controller through `components/ads/InterstitialController.tsx` and `app/_layout.tsx`
- Ads V1C ignores first route mount, considers route transitions only, calls central eligibility with `placementKind: "interstitial"`, records placeholder interstitial shows only after eligibility and placeholder-provider success, and preserves Premium zero ads, 180-second first delay, 600-second spacing, session cap 3 plus long-use +2, daily cap 6, and forbidden route/context blocking
- Ads V1D2 did not add working Admin ad toggles, did not use Admin `runtimeControls.ads_enabled`, and did not change the default hidden runtime; it only lets `NativeAdSlot` and `InterstitialController` read normalized `app_config.adsLaunch` when no explicit proof/test config override is provided
- AppLovin MAX is the primary ad mediation direction
- Unity LevelPlay / Unity Ads may be added through AppLovin MAX later
- do not build an AdMob-only ad system
- all future real ad providers must go through the provider-neutral Chi'llywood ad wrapper
- do not make direct screen-level SDK calls
- launch ad cap: base active session allows 3 interstitial plus 1 native/feed; after 2 active browsing hours allow +2 interstitial plus +1 native/feed; daily cap is 6 interstitial plus 3 native/feed
- Premium/ad-free users are always ineligible for ads and must not increment ad counters
- ads must not appear inside active LiveKit rooms, during active video playback, while typing/commenting, during upload, on subscribe/payment screens, immediately at app launch, in Admin, in Channel Studio, in Chat, or in Profile/composer contexts unless explicitly redesigned later
- rewarded ads and carefully integrated native ads are preferred over disruptive formats
- aggressive or unexpected full-screen interstitials are not approved doctrine
- launch app ads are platform money at first; RevenueCat remains Premium subscription truth only and does not take ad revenue
- Google Play does not take a subscription fee from AppLovin ad payouts
- creator-page ad revenue share is later: creator 70% net and Chi'llywood 30% net
- creator-sold sponsor slots are later: brand pays Chi'llywood first, creator 80% net, and Chi'llywood 20% net
- Ledger Systems 4A-4D finance foundation is pushed as schema/helper/Admin read-only foundation only. The finance migration is now applied to Supabase remote, generated database types include the finance foundation tables, current-build Admin proof shows the finance panels as read-only/foundation counts only, and no provider-backed creator ad revenue ledger, payout execution, sponsor deal execution, invoice action, fraud enforcement, or CTV revenue system is active.
- CTV ads are future-only for Chi'llywood Originals and network-style content and are not active now
- room-specific ad cautions belong in `ROOM_BLUEPRINT.md`, not here

## Profile / Channel Platform Direction
- profiles remain Chi'llywood's social identity hubs
- Profile and Channel are connected but different product layers: Profile is personal/social identity, while Channel is the public mini streaming platform/network
- Channel Studio is the owner-only creator operating system
- `/channel/[userId]` is the public Channel route
- `/channel-studio` is the preferred owner Studio route
- `/channel-settings` remains compatibility
- Profile View Channel routes to `/channel/[userId]`
- Channel Studio Preview Channel routes to `/channel/[ownUserId]`
- every user can have the option to build their own mini streaming platform or channel inside Chi'llywood, but platform-building is optional
- a user/creator Channel must show that creator's own channel content only: creator uploads, creator videos, creator events, creator live/watch-party content, and creator shelves/sections when those are backed
- Chi'llywood Originals and platform/admin `titles` belong to platform surfaces such as Home, Explore, dedicated Originals surfaces, platform title/player routes, and admin-managed title surfaces
- Chi'llywood Originals must not be used as filler inside user/creator Channels
- users who do not want to build a full channel or platform should still have meaningful profile customization
- customizable branding, layout, featured rows, sections, and channel identity are approved direction inside the canonical profile/channel system
- platform-inspired creator surfaces are approved; direct copies of third-party streaming services are not
- creator-channel customization is preferred over relying on third-party streaming account connections
- users should be able to start with the base profile experience and expand later without losing that base experience
- profiles remain social identity hubs even when creator-platform mode grows deeper
- Public Channel must never show owner-only controls to non-owners
- Public Channel must never show drafts, private videos, or unpublished content

## Official Presence And Social Graph Truth
- Rachi remains Chi'llywood's protected official platform concierge presence on the canonical `/profile/[userId]` and Chi'lly Chat routes.
- owner authority remains above Rachi; Rachi is not owner authority, not a hidden admin override, and not the final decision-maker for platform actions.
- current creator/channel relationship truth is `followers`, creator/channel `subscribers`, audience `requests`, and `blocked` audience boundaries.
- Follow is channel audience.
- Chi'lly Circle is personal mutual friendship/connection.
- Subscribers are later monetized channel supporters.
- creator/channel subscriber truth remains distinct from account-tier Premium entitlement truth.
- a native Chi'llywood friend list is distinct from followers and creator/channel subscribers.
- current repo truth does not yet include a native friend relationship, friend-list read model, or public friend-list surface.
- if product language uses `Rachi as your first friend`, that currently means official starter presence on the canonical profile/chat system, not a backed friend-graph relationship.
- when a native friend system lands, it should be a mutual person-to-person social relationship with privacy-aware visibility rules instead of a rename of follower, subscriber, or admin truth.

## Admin Operations Truth
- `/admin` is the canonical Admin Command Center route for platform owner/operator operations.
- Admin is separate from Channel Studio, Profile Settings, Public Channel, Chi'lly Circle, and future Room Control.
- Admin must remain protected by signed-in plus beta/platform-role/backend permission checks, including separate route access, report visibility, and privileged-write boundaries.
- The Login screen can present an Admin Command Center sign-in entry that routes successful normal auth to `/admin`, but it is not an admin bypass. Credentials must never be stored, printed, logged, hard-coded, or committed, and backend platform-role checks remain the only Admin access truth.
- Admin V1A is pushed with Home, Reports, Content, Roles, Audit, Rachi, Users, Premium, Kill Switches, Usage, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and System sections.
- Admin V1A preserves backed Reports, Content, Roles, Audit, and Rachi behavior. Audit is a summary, not a full immutable audit-log system, and Rachi does not grant operator permissions.
- Admin V1A foundation areas must stay honest: user search, runtime kill switches, live ad provider state, money, payouts, network billing, sponsor tools, fraud holds, bandwidth metering, LiveKit metering, participant-minute metering, and deeper ledgers are not active unless separately backed.
- Admin Usage Metering Foundation V1 remote/provider schema is pushed. Admin may show schema-connected/read-only counts for internal usage and provider-import/reconciliation foundation tables. Admin Usage Writer V1A0/V1A1/V1A2 is pushed and runtime-proved for successful creator-video upload usage only: it records app-side `video_uploaded` and `storage_bytes` metadata after a backed `videos` row exists, through the secure idempotent RPC and a non-fatal upload helper call, and V1A2 can roll those already-backed rows into `usage_daily_summaries` through an owner/operator-only RPC. V1A1 proof showed one usage row, one storage metadata row, and replay skipping without double-counting; V1A2 proof rolled up May 7, 2026 rows and replayed idempotently. No provider API imports, provider billing truth, bandwidth writer, participant-minute writer, reconciliation jobs, overage calculation, customer invoices, payout/revenue writers, or cost truth are active. Provider rows must stay `Not connected yet` until real imports exist.
- Admin finance foundation may show safe row counts for future finance ledger, payout ledger, network billing, sponsor deals, and fraud holds now that the schema is applied and readable to platform roles. Counts are not live money totals and must not imply payout availability, invoice execution, sponsor checkout, payout split execution, fraud enforcement, provider reconciliation, or creator-facing balances.
- Admin V1B1 runtime controls config foundation is pushed. Typed defaults now exist under `app_configurations.config.runtimeControls` for new accounts, uploads, comments, attachments, chat, chat attachments, Live First, Live Watch-Party, Watch-Party Live, ads, creator posting, profile posting, max upload size, Premium Required For Live, and Premium Required For Watch-Party. Admin Kill Switches remains read-only/foundation and shows `Configured foundation` / `Not enforced yet`; no working toggles or app-surface enforcement were added.
- Admin V1B2A new-account enforcement is pushed. `new_accounts_enabled` is now enforced only on signup: if false, signup blocks before `supabase.auth.signUp`; if missing or unreadable, normalized defaults keep it true. Existing signed-in users, login, legal acceptance storage, Premium gates, rooms, uploads, and Admin permission boundaries are unchanged.
- Admin V1B2B upload enforcement is pushed. `uploads_enabled` is now enforced only on new creator-video upload submit in `app/channel-settings.tsx`: if false, the submit path blocks before `uploadCreatorVideo`, storage upload, or metadata insert; if missing or unreadable, normalized defaults keep it true. Existing video metadata edit, publish/unpublish/delete, Open Player, picker behavior, storage helpers, RLS, migrations, generated types, and Channel Studio's single `Video Upload` form are unchanged.
- Admin V1B2C comments enforcement is pushed. `comments_enabled` is now enforced only on backed Profile post comment/reply submit in `app/profile/[userId].tsx` and creator-video comment/reply submit in `app/player/[id].tsx`: if false, those submit paths block after existing validation and before backed comment create or comment attachment upload; if missing or unreadable, normalized defaults keep it true. Existing comment reads, deletes, reports, attachment picker selection, Watch-Party comments, Live Stage comments, Chi'lly Chat messages, Chi'lly Circle, profile privacy, Player controls/layout, RLS, migrations, generated types, and Supabase remote state are unchanged.
- Admin V1B2D profile posting enforcement is pushed. `profile_posting_enabled` is now enforced only on backed Profile post creation submit in `app/profile/[userId].tsx`: if false, that submit path blocks after owner/busy, empty-body, and length checks and before backed Profile post create or post attachment upload; if missing or unreadable, normalized defaults keep it true. Existing Profile post reads, comments/replies, likes, deletes, reports, attachment picker selection, Chi'lly Circle, profile privacy, creator video upload, Channel Studio, Public Channel, Player, Watch-Party, Live Stage, Chat, RLS, migrations, generated types, and Supabase remote state are unchanged.
- Admin V1B2E creator posting enforcement is pushed. `creator_posting_enabled` is now enforced only on new creator event creation in `app/channel-settings.tsx`: if false, that submit path blocks before `createCreatorEvent`; if missing or unreadable, normalized defaults keep it true. Existing `updateCreatorEvent` edits, creator-video upload, video metadata edit, publish/unpublish/delete, Profile posts, comments/replies, attachments, Channel Studio layout, Public Channel, Player, Watch-Party, Live Stage, Chat, RLS, migrations, generated types, and Supabase remote state are unchanged.
- Admin V1B2F social attachment enforcement is pushed. `attachments_enabled` is now enforced only on selected non-chat social attachments in `app/profile/[userId].tsx` and `app/player/[id].tsx`: if false, Profile post attachments, Profile post comment/reply attachments, and creator-video comment/reply attachments block before parent create and attachment upload; if missing or unreadable, normalized defaults keep it true. Text-only posts/comments remain allowed where existing posting/comment controls allow them. Chat attachments, room attachments, `_lib/socialAttachments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged.
- Admin V1B2G standalone Chi'lly Chat attachment enforcement is pushed. `chat_attachments_enabled` is now enforced only on selected standalone Chi'lly Chat attachments in `app/chat/[threadId].tsx`: if false, selected attachments block before optimistic message insertion and before `sendChatMessage`; if missing or unreadable, normalized defaults keep it true. Text-only messages remain allowed. Room attachments, `_lib/chat.ts`, `_lib/socialAttachments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged.
- Admin V1B2H room attachment enforcement is pushed. `chat_attachments_enabled` is now also enforced on selected Watch-Party and Live Stage room attachments in `app/watch-party/[partyId].tsx` and `app/watch-party/live-stage/[partyId].tsx`: if false, selected room attachments block before `sendPartyMessageRecord` and before `createSocialAttachmentForSurface`; if missing or unreadable, normalized defaults keep it true. Text-only room comments remain allowed. Room layouts, LiveKit behavior, Premium gates, `_lib/watchParty.ts`, `_lib/socialAttachments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged.
- Admin V1B2I-A standalone Chi'lly Chat enforcement is pushed. `chat_enabled` is now enforced only on standalone Chi'lly Chat message send/call-start/profile-entry/starter-thread paths: if false, `/chat/[threadId]` blocks before optimistic message insertion, `sendChatMessage`, or `startChatThreadCall`, `/chat` blocks the Rachi starter thread before `getOrCreateDirectThread`, and Profile blocks non-self Profile-to-chat entry before direct thread creation; if missing or unreadable, normalized defaults keep it true. `/chat` and `/chat/[threadId]` remain readable. Room comments, room invites, `chat_attachments_enabled`, `_lib/chat.ts`, `_lib/watchParty.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged.
- Admin V1B2I-B chat invite enforcement is pushed. `chat_enabled` is now also enforced on room invite direct-message sends in `components/chat/internal-invite-sheet.tsx`: if false, invite sends block before `sendDirectInviteMessage`; if missing or unreadable, normalized defaults keep it true. System share fallback remains available. Room text comments, room layouts, LiveKit behavior, Premium gates, `chat_attachments_enabled`, `_lib/chat.ts`, `_lib/watchParty.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged.
- Admin V1B2I-C room comment enforcement is pushed. `chat_enabled` is now also enforced on Watch-Party and Live Stage room-native text/comment submits in `app/watch-party/[partyId].tsx` and `app/watch-party/live-stage/[partyId].tsx`: if false, room comment submits block before `sendPartyMessageRecord`; if missing or unreadable, normalized defaults keep it true. Existing room reads, room layouts, LiveKit behavior, Premium gates, invite behavior/system share, `chat_attachments_enabled`, attachment picker behavior, `_lib/watchParty.ts`, `_lib/chat.ts`, `_lib/socialAttachments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged.
- Admin V1B runtimeControls closeout truth is recorded. `new_accounts_enabled`, `uploads_enabled`, `comments_enabled`, `attachments_enabled`, `chat_enabled`, `chat_attachments_enabled`, `creator_posting_enabled`, and `profile_posting_enabled` are enforced only on their scoped pushed surfaces. `live_first_enabled`, `live_watch_party_enabled`, `watch_party_live_enabled`, and `max_upload_size_mb` are configured foundation-only and not enforced. Admin `runtimeControls.ads_enabled` requires Ads Launch source-of-truth reconciliation before use. `premium_required_for_live` and `premium_required_for_watch_party` are not runtime switches because Premium gates are enforced separately through the Premium access helpers and must not be weakened.
- Admin Ads is read-only/foundation after Ads V1A/V1B/V1C: it may show placeholder/not-connected provider status, Home native/feed placeholder foundation status, placeholder interstitial controller foundation status, launch caps, forbidden contexts, AppLovin MAX future direction, Unity-through-MAX future direction, and no-AdMob-only doctrine, but it must not show fake ad revenue, working ad toggles, SDK state, ad IDs, or CTV inventory unless separately backed.
- RevenueCat remains Premium truth. Admin must not add manual Premium toggles or subscription editing unless a future scoped proof adds safe backing.
- Admin must never expose Supabase service-role keys, LiveKit secrets, RevenueCat secrets, app-store keys, provider secret keys, hard-coded credentials, or test-account credentials.
- Any future destructive admin action must require confirmation and reason or audit context where appropriate.

## Public Product Phasing
- Launch is planned as 18+. H1A no-migration signup confirmation and H1B2 legal acceptance storage are pushed.
- Public v1 should focus on the core social streaming experience, not the full long-term platform vision
- Public v1 includes login/settings/logout, home/discovery, customizable basic profiles, standalone player, Watch-Party Live core flow, Live Watch-Party / Live Stage core flow, comments/reactions/basic social interaction, basic Chi'lly Chat or simple direct messaging, Premium subscription gating, moderation basics, and analytics/error monitoring/admin visibility
- Admin Command Center V1A is pushed on `/admin`; Admin V1B1 typed runtime controls config foundation is pushed; Admin V1B2A enforces `new_accounts_enabled` on signup only; Admin V1B2B enforces `uploads_enabled` on new creator-video upload submit only; Admin V1B2C enforces `comments_enabled` on backed Profile post and creator-video comment submit only; Admin V1B2D enforces `profile_posting_enabled` on backed Profile post creation submit only; Admin V1B2E enforces `creator_posting_enabled` on new creator event creation only; Admin V1B2F enforces `attachments_enabled` on selected non-chat social attachments only; Admin V1B2G/V1B2H enforce `chat_attachments_enabled` on selected standalone Chi'lly Chat and room attachments only; Admin V1B2I-A enforces `chat_enabled` on standalone Chi'lly Chat send/call/profile-entry/starter-thread paths only; Admin V1B2I-B enforces `chat_enabled` on room invite direct-message sends only; Admin V1B2I-C enforces `chat_enabled` on Watch-Party and Live Stage room-native text/comment submits only. Future Admin V1B kill switch enforcement still requires dedicated app-surface reads, proof, and safe admin write behavior before any additional switch can affect runtime behavior.
- Ads Launch Foundation V1A/V1B/V1C is pushed as no-SDK, no-real-rendering, provider-neutral infrastructure; real AppLovin MAX integration remains later and requires external account/app/ad-unit readiness.
- Public v1 should keep room-scale truth honest: `500+` joined presence can be a valid product target, but Public v1 does not assume `500+` equal live camera feeds.
- Post-v1 can expand into real AppLovin MAX integration after external setup, heavier creator monetization rollout, a fuller creator mini-platform builder, deeper room personalization, request/promote room controls, premium/ticketed room tooling, and instant payout lane foundations
- Later phase holds Game Live rollout beyond the Public v1 window, Game Watch-Party after Game Live, larger premium stages, higher simultaneous live-seat capacity as infrastructure improves, advanced payouts and tax automation, overseas creator payouts, and broader ad systems
- `ROADMAP.md` should operationalize the active Public v1 / Post-v1 / Later phase split and the current dependencies, blockers, and compliance-sensitive areas

## Storage And Infrastructure Doctrine
- Cloudflare R2 is the direction for public/high-download media.
- Hetzner Object Storage is the direction for source/original uploads, drafts, backups, archive, and private/held/deleted media.
- Hetzner/OVH boxes are the direction for LiveKit and real-time live/watch-party traffic.
- Do not move storage, LiveKit, or real-time infrastructure doctrine ad hoc inside feature prompts; require exact scope, proof, and rollback posture.
