# CURRENT STATE

## Hot-Path Control Rule
This file is intentionally compact. Keep current truth here, keep detailed proof output in artifacts or `/tmp`, and do not load archived checkpoint history during normal preflight unless a historical reconciliation task explicitly asks for it.

Full checkpoint history through April 24, 2026 is preserved at `docs/archive/current-state-history-through-2026-04-24.md`. Later detailed proof history is available in git history and task artifacts; this hot-path file should carry only the current governing facts future sessions must not undo.

## Current Checkpoint
Current `main` is production-grade Public v1 hardening with Admin Command Center V1A, Admin V1B1 runtime controls config foundation, Admin V1B2A new-account kill switch enforcement, Ads Launch Foundation V1A/V1B/V1C, Public V1 Hardening H1A 18+ Signup Confirmation, H1B2 legal acceptance storage, H2 upload/content lifecycle polish, and H3 security/compliance/moderation hardening pushed. The Admin V1A checkpoint is committed at `2690367912e4f10309d09d08433be25662028ed3`; the Admin V1B1 runtime controls config foundation checkpoint is committed at `2f6fd450e00fd5f522ad94799416fecfa54bd641`; the Admin V1B2A new-account kill switch checkpoint is committed at `9fca92bd1d47507eaacb7494e945040a032666c9`; the Ads V1A checkpoint is committed at `3bfe82328b4200e86ff15955c95bac7a1e218013`; the Ads V1B native/feed placeholder checkpoint is committed at `c8a21b93d01f8af5d6ed5b229f03a594b9a59832`; the Ads V1C placeholder interstitial controller checkpoint is committed at `2c1af252da391fe0e43a80bd7eaf9ea562fc1293`; the H1A 18+ signup confirmation checkpoint is committed at `b7f9c53a2e505375aa8c04ec4669acf310d78233`; the H1B1 legal acceptance schema foundation checkpoint is committed at `e052dc816c12f58d056e01f93867199304bca467`; the H1B2 legal acceptance storage checkpoint is committed at `2ecbd1f4d2ef66a4be77fba03c6f54d299413cf8`; the H2 upload/content lifecycle polish checkpoint is committed at `d5a4a9143b9443828cd4a81289b68f20b73d4119`; the H2 duplicate-upload UI correction is committed at `3e76cf00aea1bece0910759aefcea27c3f4f6a08`; the H3 public safety/support hardening checkpoint is committed at `0ea39d2af54002e5a47e8577df4ea276c36d7697`.

Already pushed and to be preserved:

- Premium gate is pushed: all full live/watch-party access is Premium. Live First is no longer free; Live Watch-Party and Watch-Party Live remain Premium. Free users are blocked before full room/session/token/connect, receive no full LiveKit room/token/connect access, and no free preview mode was added. Premium users keep the existing full live/watch-party flows.
- Chi'lly Circle V1 is pushed: request, accept, decline, cancel, remove, My Chi'lly Circle management, Follow separation, and channel-audience block override.
- Chi'lly Circle profile privacy is pushed: Everyone, Chi'lly Circle Only, and Private, with backend/RLS tightening so locked-profile posts, comments, and attachments do not leak through old read paths.
- Channel Studio Phase 1 is pushed: Manage Channel was renamed and organized as Channel Studio.
- Channel Studio Phase 2A is pushed: `/channel-studio` is the preferred owner Studio shell with Home, Content, Live, Audience, Insights, and Brand tabs; `/channel-settings` remains a compatibility route.
- Channel Studio Home dashboard correction is pushed: compact dashboard-first Home, Today's Snapshot before Quick Actions, compact Quick Actions, Needs Attention, Latest Content, and minor Later/Roadmap at the bottom.
- Public Channel Phase 2B is pushed: `/channel/[userId]` is the public viewer-facing Channel route, Profile View Channel routes to `/channel/[userId]`, Studio Preview Channel routes to `/channel/[ownUserId]`, not-found/unavailable states exist, and the public Channel has hero, Featured, Latest Uploads, Live & Upcoming, and About sections.
- Public Channel visual polish and streaming-network visual correction are pushed: the public route is a media/network destination with a channel hero, backed Channel Pulse row, Featured spotlight, Latest Uploads shelf, programming-style Live & Upcoming, and final About card. Public Channel uses viewer-facing `Play`, not owner management labels, never exposes Upload/Edit/Publish/Unpublish/Delete to non-owners, never shows drafts/private/unpublished videos, and may show owner-only Open Channel Studio only to the channel owner.
- Centralized live/watch-party Premium access runs through the existing Premium access helper layer, including `canUseLiveFirst`, `canUseLiveWatchParty`, `canUseWatchPartyLive`, `requireLiveFirstPremium`, `requireLiveWatchPartyPremium`, and `requireWatchPartyLivePremium`. Strict live/watch-party gates ignore dev Premium bypass behavior where needed so free-user blocking can be proved.
- Admin Command Center V1A is pushed on the canonical `/admin` route. Do not create duplicate admin routes such as `/admin-command-center`. Admin is platform owner/operator authority and must remain separate from Channel Studio, Profile Settings, Public Channel, Chi'lly Circle, and future Room Control.
- Admin remains protected by existing signed-in plus beta/platform-role/backend permission checks. Route access, report visibility, and privileged-write boundaries were preserved. Admin V1A did not add a production admin bypass.
- `/admin` now presents as `Admin Command Center` with Home, Reports, Content, Roles, Audit, Rachi, Users, Premium, Kill Switches, Usage, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and System sections. Home includes Platform Snapshot and Needs Attention.
- Existing backed admin areas remain real: Reports uses the existing safety report/admin moderation surfaces; Content preserves creator-video moderation, title programming, and admin content behavior; Roles preserves platform role visibility; Audit is an audit summary, not a full immutable audit-log system; Rachi identity/admin display remains present, but Rachi does not grant operator permissions.
- Admin V1A foundation areas must stay honest: Users search is not connected yet; Premium is read-only/foundation and RevenueCat remains Premium truth; Kill Switches lists foundation rows only; Usage shows DB-estimate live/watch-party/upload signals where available and says bandwidth, LiveKit, and participant-minute metering are not connected yet; Ads is foundation only with AppLovin MAX direction and no SDK/ad IDs/provider init/rendering; Revenue, Payouts, Networks, Sponsors, and Fraud must not show fake money, fake balances, fake invoices, fake sponsor revenue, fake network billing, fake holds, or working payout/sponsor/fraud flows.
- Admin V1B1 runtime controls config foundation is pushed. `_lib/featureFlags.ts` owns typed `APP_RUNTIME_CONTROL_DEFAULTS` and `resolveAppRuntimeControls`; `_lib/appConfig.ts` stores normalized `runtimeControls` under the existing `app_configurations.config` JSON shape; `app/admin.tsx` shows Kill Switches rows as read-only `Configured foundation` / `Not enforced yet` status only. No working admin toggles, no runtime enforcement, no migrations, no generated database type edits, no RLS changes, no Supabase remote changes, and no Premium gate weakening were added.
- Admin V1B2A new-account kill switch enforcement is pushed. `app/(auth)/signup.tsx` reads normalized `runtimeControls.new_accounts_enabled` after email/password and 18+ confirmation pass, and blocks before `supabase.auth.signUp` with `New accounts are paused` when the control is false. The default remains true, so normal signup behavior is unchanged. `app/admin.tsx` updates the New Accounts Kill Switches row as read-only `Enforced on signup`; no working Admin toggle, config write control, migration, generated type edit, RLS/storage change, Supabase remote change, login/session change, legal acceptance storage change, or Premium gate weakening was added.
- Test admin account access may remain active for future proof sessions, but credentials must never be stored, printed, logged, hard-coded, or committed. Admin must never expose Supabase service-role keys, LiveKit secrets, RevenueCat secrets, app-store keys, provider secret keys, or any other secret.
- Ads Launch Foundation V1A is pushed as provider-neutral, no-SDK, no-real-rendering infrastructure. It adds `_lib/ads/adConfig.ts`, `_lib/ads/adEligibility.ts`, `_lib/ads/adProvider.ts`, `_lib/ads/providers/placeholder.ts`, `_lib/ads/adSession.ts`, `hooks/useAdEligibility.ts`, and `hooks/useActiveBrowsingTime.ts`; `app/admin.tsx` was updated only for read-only/foundation Admin Ads status.
- Ads V1A central config defaults exist with `ads_enabled: false`, `ads_provider: placeholder`, interstitial/native enablement defaults, launch caps, 180-second first-interstitial delay, 600-second interstitial spacing, Premium ad-free, and future CTV/creator-page/sponsor flags disabled. The placeholder provider reports not connected and does not call any SDK. Premium/ad-free users are always ineligible and do not increment ad counters. Eligibility blocks forbidden routes/contexts, active browsing time tracking exists for future decisions, session caps exist, and daily caps persist through AsyncStorage.
- Ads V1A did not add AppLovin, Unity LevelPlay, Unity Ads, or AdMob SDKs; did not add real ad IDs, provider initialization, real ad rendering, CTV inventory, fake ad revenue, sponsor revenue, creator earnings, payout balances, invoices, or CTV revenue.
- Ads Launch Foundation V1B is pushed as native/feed placeholder placement foundation only. It adds `components/ads/NativeAdSlot.tsx`, places one native/feed placeholder slot on the Home browsing surface in `app/(tabs)/index.tsx`, updates `_lib/ads/adSession.ts` so placeholder records can use explicit active-browsing seconds for long-use cap proof, and updates Admin Ads copy in `app/admin.tsx` as read-only/foundation status.
- Ads V1B default runtime still hides the Home placeholder because `ads_enabled` defaults false. The placeholder renders only after V1A eligibility passes, Premium/ad-free users never see it and do not increment counters, placeholder native/feed shows record only when eligible, base native/feed session cap is 1, long-use unlock allows a second native/feed placement after 120 active browsing minutes, daily native/feed cap is 3, and forbidden routes/contexts stay blocked.
- Ads V1B did not add real ad rendering, AppLovin/Unity/AdMob SDKs, real ad IDs, provider initialization, interstitials, CTV inventory, fake ad revenue, sponsor revenue, creator earnings, payout balances, invoices, or CTV revenue.
- Ads Launch Foundation V1C is pushed as placeholder interstitial controller foundation only. It adds `components/ads/InterstitialController.tsx`, mounts it in `app/_layout.tsx`, and updates `app/admin.tsx` read-only/foundation Ads copy with `Interstitial placement: placeholder controller foundation` and `No real interstitial ads are live.`
- Ads V1C default runtime still shows no interstitial because `ads_enabled` defaults false and the placeholder provider is not connected. The controller renders `null`, ignores the first route mount so there is no app-launch ad, considers route transitions only, calls central eligibility with `placementKind: "interstitial"`, and records placeholder interstitial shows only after eligibility and placeholder-provider success.
- Ads V1C preserves Premium/ad-free zero ads, 180-second first-interstitial delay, 600-second interstitial spacing, base session cap 3, long-use extra +2 after 120 active browsing minutes, daily cap 6, forbidden route/context blocking, provider-neutral wrapper doctrine, and no direct screen-level SDK calls.
- Ads V1C did not add real ad rendering, AppLovin/Unity/AdMob SDKs, real ad IDs, provider initialization, CTV inventory, fake ad revenue, sponsor revenue, creator earnings, payout balances, invoices, or CTV revenue.
- Public V1 Hardening H1A 18+ Signup Confirmation is pushed as a no-migration signup-only gate in `app/(auth)/signup.tsx`. New account creation now shows `Chi'llywood is for users 18 and older.` and requires the user to actively check `I confirm I am 18 or older.` before `supabase.auth.signUp` is called.
- H1A preserves existing email/password validation order, loading state, closed-beta copy, Terms of Service link, Privacy Policy link, Community Guidelines link, and existing Sign In handoff. If the checkbox is not confirmed, signup shows `18+ confirmation required` with `Confirm you are 18 or older before creating a Chi'llywood account.` and does not call account creation.
- H1A blocks unchecked signup before account creation. H1B2 now provides backed legal acceptance storage for new signups when Supabase returns an authenticated signup session.
- Public V1 Hardening H1B1 private legal acceptance schema foundation is pushed. It adds local migration `supabase/migrations/202605070001_user_account_legal_acceptances.sql` and pure helper `_lib/accountLegalAcceptance.ts`.
- H1B1 creates the intended private table `public.user_account_legal_acceptances` with `user_id`, nullable age/terms/privacy acceptance timestamps and versions, and created/updated timestamps. RLS is enabled with authenticated users allowed to select, insert, and update only their own row. There is no public read, and the table is intentionally separate from `user_profiles` because profile rows are broader social/profile data and are not the right owner for private legal acceptance timestamps.
- Public V1 Hardening H1B2 legal acceptance storage is pushed. Remote Supabase migrations `202605070001_user_account_legal_acceptances.sql` and `202605070002_harden_user_account_legal_acceptance_grants.sql` are applied, `supabase/database.types.ts` was regenerated from the linked remote schema, and signup now writes the accepted age/terms/privacy timestamp plus version to `user_account_legal_acceptances` after account creation succeeds with an authenticated session.
- H1B2 keeps legal acceptance storage out of `user_profiles`, AsyncStorage, and auth metadata. It does not collect full birthdate or ID verification, does not add first-use enforcement, does not block existing signed-in/admin/test users, and does not change login behavior. If Supabase signup returns no authenticated session because email confirmation is required, the app does not fake the write and records no backend acceptance until a later first-use/sign-in persistence lane is explicitly designed.
- H1B2 hardens public access: anon REST reads to `user_account_legal_acceptances` return `401 permission denied`; authenticated users keep owner-only select/insert/update through RLS.
- Public V1 Hardening H2 upload/content lifecycle polish is pushed. It touches `app/channel-settings.tsx` and `components/creator-media/creator-video-card.tsx` only.
- H2 keeps the existing creator-video picker, upload, storage, metadata save, Open Player, Edit, Publish/Unpublish, and Delete paths. It adds local-only Channel Studio Content lifecycle status for `No File Selected`, `File Selected`, `Ready To Upload`, `Uploading...`, `Upload Succeeded`, `Upload Failed`, `Saving Metadata`, and `Editing Metadata`, with honest non-percent upload copy because backed upload progress is not available.
- H2 creator video cards now show owner-facing `Published`/`Draft` status from existing visibility truth and `Media Ready`/`Media Unavailable` from existing source availability. It does not add fake processing, transcoding, archive, retry, storage-billing, payout, revenue, or moderation states; it does not move storage, change RLS/storage policies, change migrations/generated types, or alter Player/Public Channel/Profile/Watch-Party/Live Stage/ads/RevenueCat behavior.
- H2 follow-up duplicate-upload UI correction is pushed. Channel Studio Content now has one clear `Video Upload` form, no extra header/empty-state upload buttons, and `Upload Status` is inline inside that single form instead of reading as a second upload box. The correction touched `app/channel-settings.tsx` only.
- Public V1 Hardening H3 security/compliance/moderation hardening is pushed. It touches `_lib/moderation.ts`, `components/safety/report-sheet.tsx`, `app/settings.tsx`, and `components/system/support-screen.tsx` only.
- H3 keeps the existing backed `safety_reports` categories (`abuse`, `harassment`, `impersonation`, `copyright`, `safety`, `other`) and adds clearer user-facing category descriptions. Scam/fraud/unsafe product/ad concerns are routed honestly through `Safety`; undisclosed sponsorship concerns route through `Other` until a later schema pass. It does not add new report categories, fake moderation actions, fake resolve/dismiss/ban/delete buttons, RLS changes, migrations, generated-type edits, admin bypasses, or unsupported legal-compliance claims.
- H3 adds a direct Settings `Support` entry in the Legal & Support card and adds sponsorship/ad/scam concern copy to Support. Settings still links Privacy Policy, Terms of Use, Community Guidelines, Copyright/DMCA, Account Deletion, and Support; account deletion remains request/help only, not fake destructive deletion.

## Product Truth
- Chi'llywood is production-grade now; future Codex prompts must be exact and scoped, not vague.
- Profile = person/social identity.
- Channel = public mini streaming platform/network.
- Channel Studio = owner-only creator operating system.
- Follow = channel audience.
- Chi'lly Circle = personal mutual friendship/connection.
- Subscribers = monetized channel supporters later.
- Keep Profile, Channel, Channel Studio, Chi'lly Circle, Follow, Subscribers, and Admin concepts separate.
- Public Channel must never show owner-only controls to non-owners.
- Public Channel must never show drafts, private videos, or unpublished content.
- Channel Studio is owner-only.
- `/admin` is the canonical platform owner/operator Admin Command Center route.
- `/channel/[userId]` is the public Channel route.
- `/channel-studio` is the preferred owner Studio route.
- `/channel-settings` remains compatibility and must continue to resolve.

## Locked Business Decisions
- Launch is planned as 18+.
- H1A no-migration signup confirmation is pushed: new signup requires an explicit 18+ checkbox before account creation is attempted.
- H1B2 legal acceptance storage is pushed for new signups with authenticated sessions. The private table is applied remotely, generated database types are regenerated, signup writes age/terms/privacy acceptance timestamps plus versions, and anon table access is denied.
- Free users see ads at launch.
- Premium users see no ads.
- Planned Premium price is `$9.99/month` and `$99/year`.
- Full live/watch-party access is Premium and must not be made free again without an explicit product decision.
- Free users do not get full Live First, Live Watch-Party, Watch-Party Live, or full LiveKit room/token/connect access.
- Free preview was not added. Any future live/watch-party preview must be a separate, explicitly scoped, limited, low-cost, separately gated pass.
- Ads support free browsing.
- Premium supports expensive live usage.
- RevenueCat remains the Premium subscription truth owner.
- AppLovin MAX is the primary ad mediation direction.
- Unity LevelPlay / Unity Ads may be added through AppLovin MAX later.
- Do not build an AdMob-only ad system.
- All future real ad providers must go through the provider-neutral Chi'llywood ad wrapper. Do not make direct screen-level SDK calls.
- Ads launch cap: base active session allows 3 interstitial plus 1 native/feed; after 2 active browsing hours allow +2 interstitial plus +1 native/feed; daily cap is 6 interstitial plus 3 native/feed; Premium sees zero ads.
- Ads must not appear inside active LiveKit rooms, during active video playback, while typing/commenting, during upload, on subscribe/payment screens, immediately at app launch, in Admin, in Channel Studio, in Chat, or in Profile/composer contexts unless explicitly redesigned later.
- Launch app ads are platform money at first. RevenueCat remains Premium subscription truth only and does not take ad revenue. Google Play does not take a subscription fee from AppLovin ad payouts.
- Creator-page ad revenue share is later: creator 70% net and Chi'llywood 30% net. Creator-sold sponsor slots are later: brand pays Chi'llywood first, creator 80% net, and Chi'llywood 20% net. No creator ad revenue ledger, payout ledger, sponsor deal system, or CTV revenue system exists yet.
- CTV ads are future-only for Chi'llywood Originals and network-style content; no CTV inventory is active now.
- Storage doctrine: Cloudflare R2 for public/high-download media; Hetzner Object Storage for source/original uploads, drafts, backups, archive, and private/held/deleted media; Hetzner/OVH boxes for LiveKit and real-time live/watch-party traffic.

## Prompt Standard
All future Codex prompts for Chi'llywood must be production-grade:

- exact product truth
- exact scope
- exact route/screen purpose
- exact UI layout
- exact buttons/actions
- exact data sources
- exact empty/loading/error states
- exact permissions/gates
- exact backend/RLS/storage limits
- exact forbidden areas
- exact validation/manual proof
- exact report format

Do not accept vague prompts such as "modernize", "polish", "add filters", "add route", or "improve dashboard" unless every behavior is spelled out.

## Current Next Action
Recommended next lanes, in order:

1. Admin V1B2B kill switch enforcement planning: choose the next real runtime control to enforce, likely `uploads_enabled` on the existing creator upload action, prove the exact affected app surface reads `app_configurations.config.runtimeControls`, preserve existing permission/storage/RLS behavior, and keep Admin write controls out unless separately scoped.
2. Real AppLovin MAX readiness/integration planning later: only after external AppLovin account/app/ad units are ready; keep provider wrapper architecture, use Unity LevelPlay / Unity Ads later through AppLovin MAX if needed, and do not create an AdMob-only path.
3. Later usage metering and ledger systems: bandwidth, participant-minutes, storage, revenue ledger, payout ledger, network invoices, sponsor deals, and fraud holds.

## Validation Truth
Latest pushed live access work was checked with `npm run typecheck` and `git diff --check` before commit/push. Free-user runtime proof showed the Home live entry displays the Premium sheet and does not route into `/watch-party`, generate a room code, or request/connect LiveKit; direct `/watch-party?mode=live` was blocked with the same Premium gate. Existing Premium paths were intentionally preserved, but a real entitlement-backed Premium account proof should still be done later when available.

Admin Command Center V1A was checked with `npm run typecheck` and `git diff --check`, then runtime-smoked on Android. Proof passed for signed-out denial, admin/operator access through backend membership, default Home, all Admin V1A tabs opening, foundation-only honesty, no fake money/action systems, System not exposing secrets in UI, and route smoke for Channel Studio, Channel Settings, public Channel, Profile, Player, Watch-Party, and Live Stage. Separate non-admin denial proof with a known non-admin account remains pending.

Ads Launch Foundation V1A was checked with `npm run typecheck` and `git diff --check`, helper-level eligibility/cap proof, and Admin Ads foundation proof. It remains no-SDK, no-real-ad, no-real-provider, no-real-revenue foundation only.

Ads Launch Foundation V1B was checked with `npm run typecheck`, `git diff --check`, helper-level native/feed eligibility/cap proof, current-build Android runtime proof for default Home hidden state, Admin Ads read-only/foundation status, and route smoke for Channel Studio, Channel Settings, public Channel, Profile, Player, Watch-Party, and Live Stage. It remains no-SDK, no-real-ad, no-real-provider, no-real-revenue foundation only.

Ads Launch Foundation V1C was checked with `npm run typecheck`, `git diff --check`, scoped forbidden-file/dependency scans, and helper-level placeholder interstitial proof. Proof passed for default hidden runtime, initial route mount blocked, safe free-user eligibility after 180 active browsing seconds, Premium/ad-free blocking, 600-second spacing, base and long-use session caps, daily cap, forbidden routes, forbidden contexts, unknown context blocking, background app blocking, and provider-not-connected blocking. It remains no-SDK, no-real-ad, no-real-provider, no-real-revenue foundation only.

Public V1 Hardening H1A 18+ Signup Confirmation was checked with `npm run typecheck`, `git diff --check`, and current-build Android dev-client proof. Runtime proof confirmed the signup screen shows the 18+ copy and unchecked checkbox, pressing Sign Up while unchecked shows the required 18+ alert before account creation, checking the box falls through to the existing signup validation path, Terms/Privacy/Community Guidelines links still open, and the Sign In handoff still returns to Login. Real existing-account login proof and release-build signup proof remain pending.

Public V1 Hardening H1B1 private legal acceptance schema foundation was checked with `npm run typecheck` and `git diff --check` before commit/push. It added only the local migration and pure helper, did not apply remote migrations, did not hand-edit generated database types, and did not change runtime app behavior.

Public V1 Hardening H1B2 legal acceptance storage was checked with `npm run typecheck`, `git diff --check`, `supabase migration list`, generated type inspection, and anon REST denial proof. Remote migrations `202605070001` and `202605070002` are applied. Anon REST reads to `user_account_legal_acceptances` return `401 permission denied`. Runtime signup write proof with a safe disposable account is still pending because no test signup identity was provided in the implementation/proof pass.

Public V1 Hardening H2 upload/content lifecycle polish was checked with `npm run typecheck`, `git diff --check`, scoped forbidden-file diff checks, and current-build Android dev-client no-mutation proof. Runtime proof confirmed a disposable signed-in proof account could open `/channel-studio?tab=content`, the Content tab rendered summary cards and empty Creator Library truth, the upload panel showed `Upload Status`, `No File Selected`, honest no-file guidance, `Choose Video File`, title/description fields, and no fake percent progress or processing/transcoding/archive/retry states. The proof account had no videos, so publish/unpublish/delete confirmation modals still need safe-media proof later.

Public V1 Hardening H3 security/compliance/moderation hardening was checked with `npm run typecheck`, `git diff --check`, scoped forbidden-file and secret-string scans, and current-build Android dev-client smoke. Runtime proof confirmed Settings shows Privacy Policy, Terms of Use, Community Guidelines, Copyright/DMCA, Support, and Request Account Deletion; Support opens and shows sponsorship/ad/scam concern copy; a backed title Report Sheet opens with backed category chips and honest later-schema copy; and a non-admin account is denied from `/admin` without exposing Admin Command Center content or privileged actions. Longer report submission and admin queue workflow proof remain pending.

## Staging Discipline
- Work on current `main` only.
- Keep unrelated local dirt out of the checkpoint.
- Never stage `artifacts/`.
- Never stage `supabase/.temp/`.
- Stage only task-pure files for the active lane.
