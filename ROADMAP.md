# ROADMAP

## Planning Rule
`ROADMAP.md` now records Chi'llywood's phased product planning truth rather than older chapter-by-chapter execution history.

- current checkpoint truth belongs in `CURRENT_STATE.md`
- detailed older checkpoint history belongs in `docs/archive/`
- the immediate next working lane belongs in `NEXT_TASK.md`
- Locked Chi'lly Chat communication doctrine and locked Rachi official-account doctrine remain carried forward unchanged and are not reopened by this planning rewrite.

## Public v1
- login, settings, and logout
- home and discovery
- customizable basic profiles
- public Channel route at `/channel/[userId]`
- owner Channel Studio at `/channel-studio` with `/channel-settings` compatibility
- standalone player
- Watch-Party Live core flow
- Live Watch-Party / Live Stage core flow
- all full Live First, Live Watch-Party, and Watch-Party Live access gated by Premium
- no free full LiveKit room/token/connect access and no free preview mode
- comments, reactions, and basic social interaction
- basic Chi'lly Chat or simple direct messaging
- preserved Rachi official seeded-account foundation on the canonical profile and Chi'lly Chat surfaces
- Premium subscription gate
- Admin Command Center V1A on the canonical `/admin` route, protected by signed-in plus beta/platform-role/backend permission checks
- Ads Launch Foundation V1A as provider-neutral, no-SDK, no-real-rendering infrastructure; real ad placements and real ad SDK integration are not live yet
- 18+ launch posture
- moderation basics
- analytics, error monitoring, and admin visibility
- layered room participation truth with limited active live seats, scalable participant browsing, and a clear distinction between joined presence and true live-seat media
- Public v1 should stay focused on the core social streaming experience instead of the full long-term platform vision

## Post-v1
- Ads V1B Native/feed placeholder placement on safe free-user browsing surfaces only, likely Home and/or Explore, with Premium no ads, V1A eligibility/caps, no forbidden contexts, no SDK, and no real ad IDs
- Ads V1C Interstitial controller with placeholder interstitial first, safe transitions only, no app-launch ad, 180-second first delay, 600-second spacing, session/daily caps, and no forbidden contexts
- Real AppLovin MAX integration later only after external account/app/ad-unit setup is ready, keeping the provider wrapper architecture and avoiding an AdMob-only path
- 18+ age gate implementation
- upload/content lifecycle polish
- security/compliance/moderation pass
- Admin V1B Kill Switches only after a dedicated schema/config/enforcement plan; switches must be real and read by affected app surfaces
- usage metering and ledger foundations later: bandwidth, participant-minutes, storage, revenue ledger, payout ledger, network invoices, sponsor deals, and fraud holds
- heavier creator monetization rollout
- fuller creator mini-platform builder
- deeper room personalization
- request-to-speak / request-camera / request-seat flows with host approval queues
- stronger featured-vs-audience room controls and premium/ticketed room tooling
- instant payout / instant cash out lane foundations
- light compliant ad systems
- tighter monetization and creator-ops planning derived from `PRODUCT_DOCTRINE.md`

## Later Phase
- broader Game Live rollout after the Public v1 window
- Game Watch-Party after Game Live has traction
- larger premium or ticketed live-event formats with stronger audience tooling
- higher simultaneous live-seat capacity as media infrastructure improves
- advanced payouts and tax automation
- overseas creator payouts
- broader ad systems
- deeper creator-platform and premium-room expansion once moderation, compliance, and operations are ready

## Dependencies / Blockers / Compliance-Sensitive Areas
- Apple and Google billing constraints
- RevenueCat remains Premium subscription truth
- Ads Launch Foundation V1A is pushed with `_lib/ads/adConfig.ts`, `_lib/ads/adEligibility.ts`, `_lib/ads/adProvider.ts`, `_lib/ads/providers/placeholder.ts`, `_lib/ads/adSession.ts`, `hooks/useAdEligibility.ts`, and `hooks/useActiveBrowsingTime.ts`; `app/admin.tsx` only shows read-only/foundation Admin Ads status.
- Ads V1A defaults `ads_enabled` to false, uses `placeholder` as the default provider, and has a placeholder provider that reports not connected and calls no SDK.
- No AppLovin, Unity LevelPlay, Unity Ads, or AdMob SDK dependency is installed for ads; no real ad IDs, real provider initialization, real ad rendering, CTV inventory, fake ad revenue, sponsor revenue, creator earnings, payout balances, invoices, or CTV revenue exist.
- AppLovin MAX is the primary ad mediation direction; Unity LevelPlay / Unity Ads may be added later through AppLovin MAX; do not build AdMob-only ads.
- All future real ad providers must go through the provider-neutral Chi'llywood ad wrapper; do not make direct screen-level SDK calls.
- launch ad caps: base active session 3 interstitial + 1 native/feed; after 2 active browsing hours +2 interstitial + 1 native/feed; daily cap 6 interstitial + 3 native/feed; Premium sees zero ads
- Ads must not appear inside active LiveKit rooms, during active video playback, while typing/commenting, during upload, on subscribe/payment screens, immediately at app launch, in Admin, in Channel Studio, in Chat, or in Profile/composer contexts unless explicitly redesigned later.
- Launch app ads are platform money at first; RevenueCat remains Premium subscription truth only and does not take ad revenue; Google Play does not take a subscription fee from AppLovin ad payouts.
- Creator-page ad revenue share is later at creator 70% net / Chi'llywood 30% net; creator-sold sponsor slots are later with brand paying Chi'llywood first and creator 80% net / Chi'llywood 20% net. No creator ad revenue ledger, payout ledger, sponsor deal system, or CTV revenue system exists yet.
- CTV ads are future-only for Chi'llywood Originals and network-style content and are not active now.
- Admin Command Center V1A is foundation-honest: no fake revenue, payout balances, invoices, sponsor revenue, network billing, fraud holds, fake live ad provider state, or fake kill switches.
- storage doctrine: Cloudflare R2 for public/high-download media; Hetzner Object Storage for source/original uploads/drafts/backups/archive/private-held-deleted media; Hetzner/OVH boxes for LiveKit and real-time live/watch-party traffic
- Stripe Connect or equivalent marketplace payout layer for creator cash-out
- creator payout operations and reconciliation from net receipts, not gross sticker price
- tax reporting and finance operations
- moderation, abuse handling, and auditability for monetized surfaces
- country rollout and geography-specific constraints
- explicit separation between app-store subscription billing, RevenueCat entitlement handling, and creator payout infrastructure
