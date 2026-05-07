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
- Ads Launch Foundation V1A/V1B/V1C as provider-neutral, no-SDK, no-real-rendering infrastructure; the Home native/feed placeholder foundation and placeholder interstitial controller foundation exist but normal runtime keeps them hidden while `ads_enabled=false`, and real ad SDK integration is not live yet
- 18+ launch posture with H1A signup confirmation and H1B2 legal acceptance storage pushed
- Public V1 Hardening H2 upload/content lifecycle polish in Channel Studio Content, with one clear `Video Upload` form, honest no-file/selected/ready/uploading/succeeded/failed local states, and backed draft/published/media-ready labels
- Public V1 Hardening H3 security/compliance/moderation hardening: Settings Support entry, Support sponsorship/ad/scam concern copy, and backed Report Sheet category guidance without new schema/actions
- moderation basics
- analytics, error monitoring, and admin visibility
- layered room participation truth with limited active live seats, scalable participant browsing, and a clear distinction between joined presence and true live-seat media
- Public v1 should stay focused on the core social streaming experience instead of the full long-term platform vision

## Post-v1
- Real AppLovin MAX integration later only after external account/app/ad-unit setup is ready, keeping the provider wrapper architecture and avoiding an AdMob-only path
- Admin V1B1 runtime controls config foundation is pushed; Admin V1B2A enforces `new_accounts_enabled` on signup only; Admin V1B2B enforces `uploads_enabled` on new creator-video upload submit only; Admin V1B2C enforces `comments_enabled` on backed Profile post and creator-video comment submit only; additional kill switch enforcement should come only after each switch has a dedicated app-surface read/proof plan, with no fake toggles
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
- Public V1 Hardening H1A 18+ Signup Confirmation is pushed in `app/(auth)/signup.tsx`: new signup shows the 18+ copy, requires an active checkbox confirmation, blocks before `supabase.auth.signUp` if unchecked, preserves legal links and Sign In handoff, and does not persist age confirmation yet.
- H1B1 private legal acceptance schema foundation is pushed with local migration `supabase/migrations/202605070001_user_account_legal_acceptances.sql` and pure helper `_lib/accountLegalAcceptance.ts`.
- H1B1 defines private table `public.user_account_legal_acceptances` for `age_confirmed_at`, age version, terms/privacy acceptance timestamps, and versions. The table is intentionally separate from `user_profiles` and uses owner-only authenticated RLS.
- H1B2 legal acceptance storage is pushed: remote migrations `202605070001` and `202605070002` are applied, generated database types are regenerated from the linked remote schema, signup writes legal acceptance after account creation succeeds with an authenticated session, and anon reads to the legal acceptance table are denied.
- H1B2 does not write legal acceptance to `user_profiles`, AsyncStorage, or auth metadata; does not collect full birthdate or ID verification; does not add first-use enforcement; and does not block existing users.
- Public V1 Hardening H2 upload/content lifecycle polish is pushed in `app/channel-settings.tsx` and `components/creator-media/creator-video-card.tsx`. It preserves existing picker/upload/storage/metadata/Open Player/Edit/Publish/Unpublish/Delete behavior, adds local-only upload lifecycle states, labels upload progress honestly without fake percentages, and shows backed owner `Published`/`Draft` plus `Media Ready`/`Media Unavailable`.
- H2 does not add fake processing, transcoding, archive, retry, storage billing, revenue, payout, or moderation states; it does not change RLS/storage policies, migrations, generated types, Player, Public Channel, Profile, Watch-Party, Live Stage, ads, RevenueCat, billing, or payout systems.
- H2 duplicate-upload UI correction is pushed: Channel Studio Content has one `Video Upload` form, no extra header/empty-state upload buttons, and `Upload Status` is inline inside the form rather than a second upload-looking box.
- Public V1 Hardening H3 security/compliance/moderation hardening is pushed in `_lib/moderation.ts`, `components/safety/report-sheet.tsx`, `app/settings.tsx`, and `components/system/support-screen.tsx`. It preserves backed `safety_reports` categories, adds clear category guidance for abuse/harassment/impersonation/copyright/safety/other, routes scam/fraud/unsafe product concerns through `Safety`, routes undisclosed sponsorship through `Other`, adds a Settings Support entry, and adds support copy for sponsorship/ad/scam concerns.
- H3 does not add new report schema categories, fake resolve/dismiss/ban/delete actions, unsupported legal-compliance claims, RLS changes, migrations, generated-type edits, admin bypasses, or forbidden surface changes.
- Ads Launch Foundation V1A is pushed with `_lib/ads/adConfig.ts`, `_lib/ads/adEligibility.ts`, `_lib/ads/adProvider.ts`, `_lib/ads/providers/placeholder.ts`, `_lib/ads/adSession.ts`, `hooks/useAdEligibility.ts`, and `hooks/useActiveBrowsingTime.ts`; `app/admin.tsx` only shows read-only/foundation Admin Ads status.
- Ads Launch Foundation V1B is pushed with `components/ads/NativeAdSlot.tsx`, one Home native/feed placeholder foundation in `app/(tabs)/index.tsx`, native/feed long-use cap proof support in `_lib/ads/adSession.ts`, and read-only Admin Ads status copy in `app/admin.tsx`.
- Ads Launch Foundation V1C is pushed with `components/ads/InterstitialController.tsx`, a null-rendering placeholder interstitial controller mounted in `app/_layout.tsx`, and read-only Admin Ads status copy in `app/admin.tsx`.
- Ads V1A defaults `ads_enabled` to false, uses `placeholder` as the default provider, and has a placeholder provider that reports not connected and calls no SDK.
- Ads V1B default runtime remains hidden because `ads_enabled=false`; NativeAdSlot renders only after V1A eligibility passes, Premium/ad-free users never see it or increment counters, base native/feed session cap is 1, long-use unlock allows a second placement after 120 active browsing minutes, daily native/feed cap is 3, and forbidden routes/contexts stay blocked.
- Ads V1C default runtime remains hidden because `ads_enabled=false`; InterstitialController renders `null`, ignores first route mount, considers route transitions only, calls central eligibility with `placementKind: "interstitial"`, records placeholder interstitial shows only after eligibility and placeholder-provider success, respects 180-second first delay, 600-second spacing, session cap 3 plus long-use +2, daily cap 6, and forbidden routes/contexts.
- No AppLovin, Unity LevelPlay, Unity Ads, or AdMob SDK dependency is installed for ads; no real ad IDs, real provider initialization, real ad rendering, CTV inventory, fake ad revenue, sponsor revenue, creator earnings, payout balances, invoices, or CTV revenue exist.
- AppLovin MAX is the primary ad mediation direction; Unity LevelPlay / Unity Ads may be added later through AppLovin MAX; do not build AdMob-only ads.
- All future real ad providers must go through the provider-neutral Chi'llywood ad wrapper; do not make direct screen-level SDK calls.
- launch ad caps: base active session 3 interstitial + 1 native/feed; after 2 active browsing hours +2 interstitial + 1 native/feed; daily cap 6 interstitial + 3 native/feed; Premium sees zero ads
- Ads must not appear inside active LiveKit rooms, during active video playback, while typing/commenting, during upload, on subscribe/payment screens, immediately at app launch, in Admin, in Channel Studio, in Chat, or in Profile/composer contexts unless explicitly redesigned later.
- Launch app ads are platform money at first; RevenueCat remains Premium subscription truth only and does not take ad revenue; Google Play does not take a subscription fee from AppLovin ad payouts.
- Creator-page ad revenue share is later at creator 70% net / Chi'llywood 30% net; creator-sold sponsor slots are later with brand paying Chi'llywood first and creator 80% net / Chi'llywood 20% net. No creator ad revenue ledger, payout ledger, sponsor deal system, or CTV revenue system exists yet.
- CTV ads are future-only for Chi'llywood Originals and network-style content and are not active now.
- Admin Command Center V1A is foundation-honest: no fake revenue, payout balances, invoices, sponsor revenue, network billing, fraud holds, fake live ad provider state, or fake kill switches.
- Admin V1B1 runtime controls config foundation is pushed in `_lib/featureFlags.ts`, `_lib/appConfig.ts`, and read-only `app/admin.tsx` Kill Switches copy. The typed defaults live under `app_configurations.config.runtimeControls`; Admin shows `Configured foundation` and `Not enforced yet`; no runtime enforcement, working toggles, migrations, generated database type edits, RLS changes, Supabase remote changes, or Premium gate weakening were added.
- Admin V1B2A is pushed in `app/(auth)/signup.tsx` and read-only `app/admin.tsx` copy. Signup now reads `runtimeControls.new_accounts_enabled` after email/password and 18+ confirmation and blocks before `supabase.auth.signUp` when false; default true preserves normal signup. No Admin write toggle, migration, generated database type edit, RLS/storage change, Supabase remote change, login/session change, or Premium gate change was added.
- Admin V1B2B is pushed in `app/channel-settings.tsx` and read-only `app/admin.tsx` copy. New creator-video upload submit now reads `runtimeControls.uploads_enabled` after existing missing-title, missing-file, and file-size checks and blocks before `uploadCreatorVideo` or storage work when false; default true preserves normal uploads. Existing video metadata edit, publish/unpublish/delete, Open Player, picker behavior, storage helpers, RLS, migrations, generated types, and one clear Channel Studio `Video Upload` form are unchanged.
- Admin V1B2C is pushed in `app/profile/[userId].tsx`, `app/player/[id].tsx`, and read-only `app/admin.tsx` copy. Backed Profile post comment/reply submit and creator-video comment/reply submit now read `runtimeControls.comments_enabled` after existing validation and block before backed comment create or comment attachment upload when false; default true preserves normal comments. Existing comment reads, deletes, reports, attachment picker selection, Watch-Party comments, Live Stage comments, Chi'lly Chat messages, Chi'lly Circle, profile privacy, Player controls/layout, RLS, migrations, generated types, and Supabase remote state are unchanged.
- storage doctrine: Cloudflare R2 for public/high-download media; Hetzner Object Storage for source/original uploads/drafts/backups/archive/private-held-deleted media; Hetzner/OVH boxes for LiveKit and real-time live/watch-party traffic
- Stripe Connect or equivalent marketplace payout layer for creator cash-out
- creator payout operations and reconciliation from net receipts, not gross sticker price
- tax reporting and finance operations
- moderation, abuse handling, and auditability for monetized surfaces
- country rollout and geography-specific constraints
- explicit separation between app-store subscription billing, RevenueCat entitlement handling, and creator payout infrastructure
