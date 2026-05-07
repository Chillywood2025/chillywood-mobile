# NEXT TASK

## Exact Next Recommended Lane
Implement Ads V1C Interstitial controller.

Product direction:

- Ads Launch Foundation V1A is pushed as provider-neutral, no-SDK, no-real-rendering infrastructure.
- Ads Launch Foundation V1B is pushed as native/feed placeholder placement foundation on Home only.
- V1A added central ad config defaults, placeholder provider, eligibility, active browsing time, session caps, daily caps, AsyncStorage daily persistence, and read-only/foundation Admin Ads status.
- V1B added `components/ads/NativeAdSlot.tsx`, one Home native/feed placeholder slot, read-only Admin Ads status copy, and native/feed long-use cap proof support.
- Default runtime still hides ads because `ads_enabled` defaults false.
- V1B did not add real ad rendering, real ad IDs, AppLovin/Unity/AdMob SDKs, provider initialization, interstitials, CTV inventory, or fake ad revenue.
- AppLovin MAX is the primary ad mediation direction.
- Use a placeholder provider until AppLovin IDs are ready.
- Unity LevelPlay / Unity Ads may be added through AppLovin MAX later.
- Do not build an AdMob-only ad system.
- All future real ad providers must go through the provider-neutral Chi'llywood ad wrapper; do not make direct screen-level SDK calls.
- Free users see ads at launch; Premium users see zero ads.
- Ads must never appear inside forbidden contexts: active LiveKit rooms, active video playback, typing/commenting, upload, subscribe/payment screens, immediately at app launch, Admin, Channel Studio, Chat, or Profile/composer contexts unless explicitly redesigned later.
- Admin Ads remains read-only/foundation until a dedicated config/admin-write lane creates real backed controls.

Required proof for that lane:

- placeholder interstitial is controlled by the central V1A/V1B ad config, eligibility, provider, session, daily cap, and forbidden-context helpers
- no interstitial appears immediately at app launch
- first interstitial remains blocked before 180 active browsing seconds
- repeat interstitial remains blocked until 600 seconds after the previous eligible placeholder interstitial show
- session and daily interstitial caps are enforced
- Premium users see no interstitial and do not increment counters
- no interstitial appears in Player, Watch-Party, Live Stage, Profile composer, Chat, Admin, Channel Studio, Subscribe/payment, upload, typing/commenting, active playback, or active LiveKit contexts
- no SDK IDs, secret keys, or provider credentials are committed
- no AdMob-only system is introduced
- no real ad rendering, real provider initialization, fake ad revenue, fake sponsor revenue, fake creator earnings, payout balances, invoices, or CTV inventory is added
- existing `/admin`, `/channel-studio`, `/channel-settings`, `/channel/[userId]`, Profile, Player, Watch-Party, and Live Stage behavior remains intact

## Current Product Lane Order
1. Ads V1C Interstitial controller:
   - placeholder interstitial first
   - safe transitions only
   - no app-launch ad
   - respects 180-second first delay, 600-second spacing, session/daily caps, and forbidden contexts
   - no real SDK
   - no real ad IDs
2. 18+ age gate:
   - account creation confirms user is 18 or older
   - store confirmation safely
3. Upload/content lifecycle polish:
   - upload progress
   - processing/failed states if backed
   - thumbnail handling
   - draft/published status clarity
   - retry only if backed
4. Security/compliance/moderation pass:
   - Terms
   - Privacy Policy
   - Community Guidelines
   - DMCA/copyright policy
   - sponsorship disclosure rules
   - UGC moderation/admin review hardening
5. Real AppLovin MAX integration:
   - only after external AppLovin setup is ready
   - keep provider wrapper architecture
   - Unity LevelPlay / Unity Ads later through AppLovin MAX if needed
   - no AdMob-only path
6. Admin V1B Kill Switches:
   - only after a dedicated schema/config/enforcement plan
   - switches must be real and read by affected app surfaces
7. Usage metering / ledger systems later:
   - bandwidth
   - participant-minutes
   - storage
   - revenue ledger
   - payout ledger
   - network invoices
   - sponsor deals
   - fraud holds

## Current Pushed Truth To Preserve
- Premium gate is pushed.
- Free vs Premium full live/watch-party gate is pushed: all full Live First, Live Watch-Party, and Watch-Party Live access is Premium.
- Free users are blocked before full room/session/token/connect and receive no full LiveKit room/token/connect access.
- No free live/watch-party preview mode was added.
- Chi'lly Circle V1 is pushed.
- Chi'lly Circle profile privacy is pushed.
- Channel Studio Phase 1 rename/organization is pushed.
- Channel Studio Phase 2A shell is pushed at `/channel-studio`.
- `/channel-settings` compatibility is preserved.
- Channel Studio Home dashboard correction is pushed.
- Public Channel Phase 2B is pushed at `/channel/[userId]`.
- Public Channel visual polish and streaming-network correction are pushed.
- Profile View Channel routes to `/channel/[userId]`.
- Studio Preview Channel routes to `/channel/[ownUserId]`.
- Admin Command Center V1A is pushed at `/admin`.
- `/admin` is the canonical platform owner/operator route; do not create duplicate admin routes like `/admin-command-center`.
- Admin is separate from Channel Studio, Profile Settings, Public Channel, Chi'lly Circle, and future Room Control.
- Admin remains protected by existing signed-in plus beta/platform-role/backend permission checks. Route access, report visibility, and privileged-write boundaries were preserved, and no production admin bypass was added.
- Admin V1A sections are Home, Reports, Content, Roles, Audit, Rachi, Users, Premium, Kill Switches, Usage, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and System.
- Admin V1A keeps Reports, Content, Roles, Audit, and Rachi backed behavior working. Users, Premium, Kill Switches, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and parts of Usage/System are foundation or read-only where not backed.
- Admin V1A must not be expanded with fake money, fake usage, fake payouts, fake sponsor revenue, fake network invoices, fake fraud holds, fake live ad provider state, fake kill switches, or hard-coded credentials.
- Ads Launch Foundation V1A is pushed.
- Ads V1A is provider-neutral foundation only. No real ads render yet, no AppLovin SDK was installed, no Unity LevelPlay SDK was installed, no Unity Ads SDK was installed, no AdMob SDK was installed, no real ad IDs were added, no real provider initialization was added, and no CTV inventory was added.
- Ads V1A added `_lib/ads/adConfig.ts`, `_lib/ads/adEligibility.ts`, `_lib/ads/adProvider.ts`, `_lib/ads/providers/placeholder.ts`, `_lib/ads/adSession.ts`, `hooks/useAdEligibility.ts`, and `hooks/useActiveBrowsingTime.ts`. `app/admin.tsx` was updated only for read-only/foundation Admin Ads status.
- Ads V1A behavior to preserve: central defaults, `ads_enabled: false`, `ads_provider: placeholder`, placeholder provider not connected/no SDK calls, Premium/ad-free always ineligible, Premium/ad-free counters do not increment, forbidden routes/contexts block eligibility, active browsing time tracking exists, session caps exist, daily caps persist through AsyncStorage, and Admin Ads remains read-only/foundation.
- Ads V1B is pushed.
- Ads V1B added one native/feed placeholder placement on Home through `components/ads/NativeAdSlot.tsx` and `app/(tabs)/index.tsx`.
- Ads V1B behavior to preserve: normal runtime hides the placeholder because `ads_enabled=false`; `NativeAdSlot` renders only after V1A eligibility passes; Premium/ad-free users never see it and do not increment counters; placeholder native/feed records only when eligible; base native/feed session cap is 1; long-use unlock allows a second placement after 120 active browsing minutes; daily native/feed cap is 3; forbidden routes/contexts remain blocked; Admin Ads stays read-only/foundation.
- Ads V1B did not add real ad rendering, SDKs, real IDs, provider initialization, interstitials, CTV inventory, fake revenue, or payout/sponsor/creator earnings systems.

## Product Truth To Preserve
- Profile = person/social identity.
- Channel = public mini streaming platform/network.
- Channel Studio = owner-only creator operating system.
- Follow = channel audience.
- Chi'lly Circle = personal mutual friendship/connection.
- Subscribers = monetized channel supporters later.
- Public Channel must not leak owner-only controls to non-owners.
- Public Channel must not show drafts/private/unpublished content.
- Channel Studio is owner-only.
- Admin is platform/operator authority, not creator/channel owner authority.
- `/admin` is the only Admin Command Center route.
- Admin must not expose Supabase service-role keys, LiveKit secrets, RevenueCat secrets, app-store keys, provider secret keys, or any other secret.
- Test admin credentials must never be stored, printed, logged, hard-coded, or committed.

## Locked Business Decisions
- Launch planned as 18+.
- Free users see ads at launch.
- Premium users see no ads.
- Planned Premium price: `$9.99/month` and `$99/year`.
- Full live/watch-party access is Premium and must not be made free again without an explicit product decision.
- Free users may only get live/watch-party preview in a separate future pass if explicitly designed safely; no preview mode exists now.
- Ads support free browsing.
- Premium supports expensive live usage.
- RevenueCat remains Premium subscription truth.
- AppLovin MAX is primary ad mediation direction; Unity LevelPlay / Unity Ads may come through AppLovin MAX later.
- Do not build AdMob-only ads.
- Do not make direct screen-level SDK calls; future real providers must use the Chi'llywood provider-neutral ad wrapper.
- Ads launch cap: base active session 3 interstitial + 1 native/feed; after 2 active browsing hours +2 interstitial + 1 native/feed; daily cap 6 interstitial + 3 native/feed; Premium sees zero ads.
- Ads must not appear inside active LiveKit rooms, during active video playback, while typing/commenting, during upload, on subscribe/payment screens, immediately at app launch, in Admin, in Channel Studio, in Chat, or in Profile/composer contexts unless explicitly redesigned later.
- Launch app ads are platform money at first. RevenueCat remains Premium subscription truth only and does not take ad revenue. Google Play does not take a subscription fee from AppLovin ad payouts.
- Creator-page ad revenue share is later: creator 70% net and Chi'llywood 30% net. Creator-sold sponsor slots are later: brand pays Chi'llywood first, creator 80% net, and Chi'llywood 20% net.
- No creator ad revenue ledger, payout ledger, sponsor deal system, or CTV revenue system exists yet.
- CTV ads are future-only for Chi'llywood Originals and network-style content and are not active now.
- Storage doctrine: Cloudflare R2 for public/high-download media; Hetzner Object Storage for source/original uploads, drafts, backups, archive, private/held/deleted media; Hetzner/OVH boxes for LiveKit and real-time live/watch-party traffic.

## Prompt Standard
Future Chi'llywood prompts must be production-grade and include exact product truth, exact scope, route/screen purpose, UI layout, buttons/actions, data sources, empty/loading/error states, permissions/gates, backend/RLS/storage limits, forbidden areas, validation/manual proof, and report format.

Do not proceed from vague prompts like "modernize", "polish", "add filters", "add route", or "improve dashboard" unless every behavior is spelled out.

## Validation Baseline
Use the lane-specific prompt for validation. Default baseline remains:

- `git status --short`
- branch and HEAD
- scoped diff check
- `npm run typecheck` for app/runtime code changes
- `git diff --check`
- targeted Android/manual proof when UI, routing, gates, or device behavior changed

## Staging Discipline
- Do not stage `artifacts/`.
- Do not stage `supabase/.temp/`.
- Stage only task-pure files.
- Before commit, show `git diff --cached --name-only` and confirm no unrelated files are staged.
