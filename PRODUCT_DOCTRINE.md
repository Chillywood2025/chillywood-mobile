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
- Ads Launch Foundation V1A/V1B/V1C is pushed as provider-neutral foundation only
- no real ads render by default; Ads V1B adds a Home native/feed placeholder foundation and Ads V1C adds a placeholder interstitial controller foundation that both stay hidden in normal runtime while `ads_enabled` is false
- no AppLovin SDK, Unity LevelPlay SDK, Unity Ads SDK, or AdMob SDK is installed for ads
- no real ad IDs, real provider initialization, CTV inventory, fake ad revenue, sponsor revenue, creator earnings, payout balances, invoices, or CTV revenue were added by Ads V1A/V1B/V1C
- Ads V1A defaults `ads_enabled` to false and uses a placeholder provider that reports not connected and does not call any SDK
- Ads V1A added central config, eligibility, provider, placeholder provider, session/daily cap, active browsing time, and read-only/foundation Admin Ads status
- Ads V1B added one native/feed placeholder placement on Home through `NativeAdSlot`
- Ads V1B native/feed placement renders only after V1A eligibility passes, Premium/ad-free users never see it, eligible placeholder shows record only once per placement, base native/feed session cap is 1, long-use unlock allows a second native/feed placement after 120 active browsing minutes, and daily native/feed cap is 3
- Ads V1C added a null-rendering placeholder interstitial controller through `components/ads/InterstitialController.tsx` and `app/_layout.tsx`
- Ads V1C ignores first route mount, considers route transitions only, calls central eligibility with `placementKind: "interstitial"`, records placeholder interstitial shows only after eligibility and placeholder-provider success, and preserves Premium zero ads, 180-second first delay, 600-second spacing, session cap 3 plus long-use +2, daily cap 6, and forbidden route/context blocking
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
- no creator ad revenue ledger, payout ledger, sponsor deal system, or CTV revenue system exists yet
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
- Admin V1A is pushed with Home, Reports, Content, Roles, Audit, Rachi, Users, Premium, Kill Switches, Usage, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and System sections.
- Admin V1A preserves backed Reports, Content, Roles, Audit, and Rachi behavior. Audit is a summary, not a full immutable audit-log system, and Rachi does not grant operator permissions.
- Admin V1A foundation areas must stay honest: user search, runtime kill switches, live ad provider state, money, payouts, network billing, sponsor tools, fraud holds, bandwidth metering, LiveKit metering, participant-minute metering, and deeper ledgers are not active unless separately backed.
- Admin V1B1 runtime controls config foundation is pushed. Typed defaults now exist under `app_configurations.config.runtimeControls` for new accounts, uploads, comments, attachments, chat, chat attachments, Live First, Live Watch-Party, Watch-Party Live, ads, creator posting, profile posting, max upload size, Premium Required For Live, and Premium Required For Watch-Party. Admin Kill Switches remains read-only/foundation and shows `Configured foundation` / `Not enforced yet`; no working toggles or app-surface enforcement were added.
- Admin Ads is read-only/foundation after Ads V1A/V1B/V1C: it may show placeholder/not-connected provider status, Home native/feed placeholder foundation status, placeholder interstitial controller foundation status, launch caps, forbidden contexts, AppLovin MAX future direction, Unity-through-MAX future direction, and no-AdMob-only doctrine, but it must not show fake ad revenue, working ad toggles, SDK state, ad IDs, or CTV inventory unless separately backed.
- RevenueCat remains Premium truth. Admin must not add manual Premium toggles or subscription editing unless a future scoped proof adds safe backing.
- Admin must never expose Supabase service-role keys, LiveKit secrets, RevenueCat secrets, app-store keys, provider secret keys, hard-coded credentials, or test-account credentials.
- Any future destructive admin action must require confirmation and reason or audit context where appropriate.

## Public Product Phasing
- Launch is planned as 18+. H1A no-migration signup confirmation and H1B2 legal acceptance storage are pushed.
- Public v1 should focus on the core social streaming experience, not the full long-term platform vision
- Public v1 includes login/settings/logout, home/discovery, customizable basic profiles, standalone player, Watch-Party Live core flow, Live Watch-Party / Live Stage core flow, comments/reactions/basic social interaction, basic Chi'lly Chat or simple direct messaging, Premium subscription gating, moderation basics, and analytics/error monitoring/admin visibility
- Admin Command Center V1A is pushed on `/admin`; Admin V1B1 typed runtime controls config foundation is pushed, but future Admin V1B kill switch enforcement still requires dedicated app-surface reads, proof, and safe admin write behavior before any switch can affect runtime behavior.
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
