# NEXT TASK

## Exact Next Recommended Lane
Implement Public V1 Hardening H1B2 legal acceptance remote/typegen/runtime wiring only with an explicit, scoped prompt.

Product direction:

- Public V1 Hardening H1A 18+ Signup Confirmation is pushed as a no-migration signup-only gate in `app/(auth)/signup.tsx`.
- H1A shows `Chi'llywood is for users 18 and older.` and requires the user to check `I confirm I am 18 or older.` before `supabase.auth.signUp` is called.
- H1A preserves email/password validation, closed-beta copy, loading state, Terms of Service link, Privacy Policy link, Community Guidelines link, and existing Sign In handoff.
- H1A does not durably store the age confirmation. It does not write Supabase data, AsyncStorage, auth metadata, migrations, generated database types, RLS, or Supabase remote state.
- Launch remains 18+, but durable confirmation requires a schema-backed pass before claiming account-level age acceptance is stored.
- H1B1 private legal acceptance schema foundation is pushed at `e052dc816c12f58d056e01f93867199304bca467`.
- H1B1 added local migration `supabase/migrations/202605070001_user_account_legal_acceptances.sql` and pure helper `_lib/accountLegalAcceptance.ts`.
- The intended storage owner is the private `public.user_account_legal_acceptances` table, not `user_profiles`.
- H1B1 enabled owner-only RLS for authenticated users to select, insert, and update only their own legal acceptance row.
- H1B1 did not apply the migration to remote Supabase, did not regenerate or hand-edit `supabase/database.types.ts`, did not wire runtime writes, did not use AsyncStorage, did not use auth metadata, did not create a first-use gate, and did not block existing signed-in/admin/test users.
- H1B2 must not claim persisted account-level acceptance is live until the migration is applied/proved in the target Supabase environment, generated types are regenerated from the real schema, and runtime writes are wired and proved.
- H1B2 must not collect full birthdate or sensitive ID verification for V1.
- H1B2 must not fake storing acceptance if schema/storage is unavailable.

Required proof for that lane:

- signup still blocks before account creation when the 18+ checkbox is unchecked
- the H1B1 migration is applied only if a dedicated prompt explicitly authorizes touching Supabase remote state
- generated database types are regenerated from the actual schema and are not hand-edited
- signup stores backed age/terms/privacy acceptance only after the user actively checks the confirmation and account creation succeeds
- stored fields are written to `user_account_legal_acceptances`, not AsyncStorage or auth metadata
- Terms, Privacy Policy, Community Guidelines, and Sign In handoff remain intact
- existing account login and signed-in sessions are not interrupted unexpectedly
- admin/test accounts are not blocked by a new production bypass or brittle local-only rule
- no migrations are applied to remote Supabase unless the H1B2 prompt explicitly authorizes it
- generated database types are not edited by hand
- no credentials or secrets are committed
- no unrelated Profile, Channel Studio, Public Channel, Player, Watch-Party, Live Stage, Ads, RevenueCat, storage, RLS, or admin behavior changes are made

## Current Product Lane Order
1. H1B2 legal acceptance remote/typegen/runtime wiring:
   - apply/prove the H1B1 private table migration only with explicit remote authorization
   - regenerate database types from the actual schema, never by hand
   - wire signup to write `age_confirmed_at`, `terms_accepted_at`, `privacy_accepted_at`, and their versions only after successful account creation
   - keep first-use enforcement for existing accounts as a separate decision
   - do not fake persistence if the schema is missing or unavailable
   - do not collect full birthdate or ID verification in V1
2. Upload/content lifecycle polish:
   - upload progress
   - processing/failed states if backed
   - thumbnail handling
   - draft/published status clarity
   - retry only if backed
3. Security/compliance/moderation pass:
   - Terms
   - Privacy Policy
   - Community Guidelines
   - DMCA/copyright policy
   - sponsorship disclosure rules
   - UGC moderation/admin review hardening
4. Ads V1C Interstitial controller:
   - placeholder interstitial first
   - safe transitions only
   - no app-launch ad
   - respects 180-second first delay, 600-second spacing, session/daily caps, and forbidden contexts
   - no real SDK
   - no real ad IDs
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
- Public V1 Hardening H1A 18+ Signup Confirmation is pushed.
- H1A added a no-migration checkbox gate to `app/(auth)/signup.tsx`: signup shows `Chi'llywood is for users 18 and older.`, requires `I confirm I am 18 or older.`, blocks before `supabase.auth.signUp` with the required alert if unchecked, and preserves legal links plus Sign In handoff.
- H1A did not persist age confirmation, add migrations, edit generated types, touch Supabase remote state, write AsyncStorage, use auth metadata, block existing signed-in users, or change login behavior.
- Public V1 Hardening H1B1 private legal acceptance schema foundation is pushed.
- H1B1 added local migration `supabase/migrations/202605070001_user_account_legal_acceptances.sql` and pure helper `_lib/accountLegalAcceptance.ts`.
- H1B1 keeps legal acceptance data out of `user_profiles`, uses a dedicated private table with owner-only authenticated RLS, and does not expose public legal acceptance rows.
- H1B1 did not apply remote migrations, regenerate or hand-edit database types, wire runtime writes, change signup/login/session behavior, write AsyncStorage/auth metadata, or block existing users.

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
- H1A no-migration signup confirmation is pushed.
- H1B1 private legal acceptance schema foundation is pushed locally, but durable acceptance is not live until H1B2 applies/proves the schema and runtime writes in a separately authorized pass.
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
