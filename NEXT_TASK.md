# NEXT TASK

## Exact Next Recommended Lane
Audit/spec Admin V1B2I-C `chat_enabled` room-native text comment scope before implementation.

AppLovin MAX SDK integration is intentionally paused until external store/AppLovin account/app/ad-unit setup is ready.

Product direction:

- Public V1 Hardening H1A 18+ signup confirmation is pushed.
- Public V1 Hardening H1B2 legal acceptance storage is pushed. New signups with authenticated sessions write age/terms/privacy acceptance timestamps plus versions to `user_account_legal_acceptances`.
- Public V1 Hardening H2 upload/content lifecycle polish is pushed.
- H2 keeps the existing creator-video picker/upload/storage/metadata path, adds honest local upload lifecycle states, clarifies backed draft/published and media-ready/unavailable status, and does not add fake processing/transcoding/archive/retry/storage-billing states.
- H2 duplicate-upload UI correction is pushed. Channel Studio Content has one clear `Video Upload` form, no duplicate upload boxes/buttons, and `Upload Status` is inline inside that form.
- Public V1 Hardening H3 security/compliance/moderation hardening is pushed. Settings has a direct Support entry, Support includes sponsorship/ad/scam concern copy, the Report Sheet explains existing backed categories, and no new report schema/action system was added.
- Ads V1A/V1B/V1C are pushed as provider-neutral, no-SDK, no-real-rendering infrastructure.
- Ads V1C added only placeholder interstitial decision/controller foundation. It did not install SDKs, add real IDs, initialize AppLovin/Unity/AdMob, render real ads, add CTV inventory, show fake ad revenue, or change forbidden surfaces.
- Normal runtime must remain honest: ads stay disabled by default because `ads_enabled=false`.
- Admin V1B1 runtime controls config foundation is pushed. Typed defaults live under `app_configurations.config.runtimeControls`; Admin Kill Switches shows read-only `Configured foundation` and `Not enforced yet`; no working toggles or runtime enforcement were added.
- Admin V1B2A new-account enforcement is pushed. Signup reads `runtimeControls.new_accounts_enabled` after email/password and 18+ confirmation pass, blocks before `supabase.auth.signUp` when false, preserves default true behavior, and updates Admin New Accounts copy as read-only `Enforced on signup`.
- Admin V1B2B upload enforcement is pushed. Channel Studio compatibility route `app/channel-settings.tsx` reads normalized `runtimeControls.uploads_enabled` from existing app config and blocks only new creator-video upload submit before storage/upload work when false. Default true and config-read fallback true preserve normal uploads. Existing video metadata edit, publish/unpublish/delete, Open Player, picker behavior, storage helpers, RLS, migrations, generated types, and the single `Video Upload` form remain unchanged. Admin Uploads copy is read-only `Enforced on upload`; no working Admin toggle was added.
- Admin V1B2C comments enforcement is pushed. Profile post comment/reply submit and creator-video comment/reply submit read normalized `runtimeControls.comments_enabled` after existing validation and before backed comment create or comment attachment upload. Default true preserves normal comments. Existing comment reads, deletes, reports, attachment picker selection, Watch-Party comments, Live Stage comments, Chi'lly Chat messages, Chi'lly Circle, profile privacy, Player controls/layout, RLS, migrations, generated types, and Supabase remote state are unchanged. Admin Comments copy is read-only `Enforced on comments`; no working Admin toggle was added.
- Admin V1B2D profile posting enforcement is pushed. Profile post creation submit reads normalized `runtimeControls.profile_posting_enabled` after owner/busy, empty-body, and length checks and before backed Profile post create or post attachment upload. Default true preserves normal Profile posting. Existing Profile post reads, comments/replies, likes, deletes, reports, attachment picker selection, Chi'lly Circle, profile privacy, creator video upload, Channel Studio, Public Channel, Player, Watch-Party, Live Stage, Chat, RLS, migrations, generated types, and Supabase remote state are unchanged. Admin Profile Posting copy is read-only `Enforced on profile posts`; no working Admin toggle was added.
- Admin V1B2E creator posting enforcement is pushed. Channel Studio compatibility route `app/channel-settings.tsx` reads normalized `runtimeControls.creator_posting_enabled` from existing app config and blocks only new creator event creation before `createCreatorEvent` when false. Default true preserves normal creator event creation. Existing creator event edits through `updateCreatorEvent`, creator-video upload, video metadata edit, publish/unpublish/delete, Profile posts, comments/replies, attachments, Channel Studio layout, Public Channel, Player, Watch-Party, Live Stage, Chat, RLS, migrations, generated types, and Supabase remote state are unchanged. Admin Creator Posting copy is read-only `Enforced on creator events`; no working Admin toggle was added.
- Admin V1B2F social attachment enforcement is pushed. `app/profile/[userId].tsx` and `app/player/[id].tsx` read normalized `runtimeControls.attachments_enabled` and block only selected non-chat social attachments before parent post/comment create and before attachment upload. Profile post attachments, Profile post comment/reply attachments, and creator-video comment/reply attachments are enforced. Text-only Profile posts/comments and creator-video comments remain governed by their existing posting/comment controls. Chat attachments, room attachments, `_lib/socialAttachments.ts`, `_lib/profilePosts.ts`, `_lib/creatorVideoComments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged. Admin Attachments copy is read-only `Enforced on social attachments`; no working Admin toggle was added.
- Admin V1B2G standalone Chi'lly Chat attachment enforcement is pushed. `app/chat/[threadId].tsx` reads normalized `runtimeControls.chat_attachments_enabled` and blocks only selected attachments before optimistic message insertion and before `sendChatMessage` when false. Text-only Chi'lly Chat messages remain allowed. Existing signed-in/thread gates, reads, realtime updates, mark-read behavior, attachment picker selection, room attachments, `_lib/chat.ts`, `_lib/socialAttachments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged. Admin Chat Attachments copy is read-only `Enforced on chat attachments`; no working Admin toggle was added.
- Admin V1B2H room attachment enforcement is pushed. `app/watch-party/[partyId].tsx` and `app/watch-party/live-stage/[partyId].tsx` read normalized `runtimeControls.chat_attachments_enabled` and block only selected room attachments before `sendPartyMessageRecord` and before `createSocialAttachmentForSurface` when false. Text-only room comments remain allowed. Existing room layouts, LiveKit behavior, Premium gates, message reads, room routes, attachment picker selection, `_lib/watchParty.ts`, `_lib/socialAttachments.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged. Admin Chat Attachments copy is read-only `Enforced on chat and room attachments`; no working Admin toggle was added.
- Admin V1B2I-A standalone Chi'lly Chat enforcement is pushed. `app/chat/[threadId].tsx` reads normalized `runtimeControls.chat_enabled` and blocks only standalone message send before optimistic insertion and `sendChatMessage`, and standalone thread call start before `startChatThreadCall`, when false. `app/chat/index.tsx` blocks only the Rachi official starter thread before `getOrCreateDirectThread`, and `app/profile/[userId].tsx` blocks only non-self Profile-to-chat entry before direct thread creation. `/chat` and `/chat/[threadId]` remain readable. Existing inbox reads, thread reads, realtime refresh, mark-read, reports, profile opens, signed-in/thread gates, attachment picker selection, `chat_attachments_enabled`, room comments, room invites, `_lib/chat.ts`, `_lib/watchParty.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged. Admin Chat copy is read-only `Enforced on standalone chat`; no working Admin toggle was added.
- Admin V1B2I-B chat invite enforcement is pushed. `components/chat/internal-invite-sheet.tsx` reads normalized `runtimeControls.chat_enabled` and blocks only room invite direct-message sends before `sendDirectInviteMessage` when false. System share fallback remains available. Existing room text comments, room layouts, LiveKit behavior, Premium gates, invite sheet search, `chat_attachments_enabled`, `_lib/chat.ts`, `_lib/watchParty.ts`, storage helpers, RLS, migrations, generated types, and Supabase remote state are unchanged. Admin Chat copy is read-only `Enforced on chat and invites`; no working Admin toggle was added.

Required proof before the next Admin V1B2 runtime-control enforcement:

- choose exactly one target control and prove the affected app surface already has a safe read path or can receive one without broad rewrites
- block only the exact submit/action path when false; do not hide or duplicate existing surfaces unless explicitly scoped
- preserve existing signed-in, beta, platform-role, RLS, Premium, privacy, and route gates
- preserve existing privacy, comment, attachment, upload, channel, profile, and room behavior unless the prompt explicitly scopes that surface
- do not expose working Admin write controls unless the prompt also scopes backed config save permissions and manual proof
- do not change migrations, generated database types, RLS, Supabase remote state, storage, LiveKit config, ads SDKs, RevenueCat setup, or forbidden surfaces
- if a runtime control cannot be read safely, leave it as `Configured foundation` / `Not enforced yet`

## Current Product Lane Order
1. Admin V1B2I-C Chat Kill Switch Audit/Spec:
   - audit before implementation because V1B2I-A enforced `chat_enabled` only on standalone Chi'lly Chat send/call/profile-entry/starter-thread paths, and V1B2I-B enforced it only on room invite direct-message sends
   - map Watch-Party room text comments and Live Stage room text comments separately
   - decide whether room-native text comments should read `chat_enabled`, `comments_enabled`, a future room-specific runtime control, or remain unaffected; do not assume standalone Chat enforcement automatically owns room-native communication
   - recommend a phased implementation that preserves room layouts, LiveKit behavior, Premium gates, existing message reads, `chat_attachments_enabled`, room invite behavior, RLS, migrations, generated types, and Supabase remote state
   - do not add room comment blocking without exact copy, proof, and fallback behavior
   - keep Admin toggles read-only unless a separate backed write-control prompt is provided
2. Real AppLovin MAX readiness/integration planning:
   - later only after external AppLovin/store setup is ready
   - keep provider wrapper architecture
   - Unity LevelPlay / Unity Ads later through AppLovin MAX if needed
   - no AdMob-only path
3. Usage metering / ledger systems later:
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
- Admin V1B1 runtime controls config foundation is pushed. `_lib/featureFlags.ts` owns typed defaults and normalization, `_lib/appConfig.ts` persists normalized `runtimeControls` under existing `app_configurations.config`, and `app/admin.tsx` updates Kill Switches copy only as read-only `Configured foundation` / `Not enforced yet`. No runtime behavior, Premium gate, migration, generated type, RLS, storage, Supabase remote, or Admin permission boundary changed.
- Admin V1B2A new-account enforcement is pushed. `app/(auth)/signup.tsx` blocks before `supabase.auth.signUp` if `runtimeControls.new_accounts_enabled` is false, after existing email/password and 18+ checks. Admin marks New Accounts as read-only `Enforced on signup`; no working toggle, login change, legal acceptance storage change, migration, generated type edit, RLS/storage change, Supabase remote change, or Premium gate change was added.
- Admin V1B2B upload enforcement is pushed. `app/channel-settings.tsx` blocks only new creator-video upload submit when `runtimeControls.uploads_enabled` is false, after existing missing-title, missing-file, and file-size checks and before `uploadCreatorVideo` or storage work. Existing video metadata edits, publish/unpublish/delete, Open Player, picker behavior, storage helpers, RLS, migrations, generated types, and one clear Channel Studio `Video Upload` form are unchanged. Admin marks Uploads as read-only `Enforced on upload`; no working toggle was added.
- Admin V1B2C comments enforcement is pushed. `app/profile/[userId].tsx` blocks only Profile post comment/reply submit when `runtimeControls.comments_enabled` is false, after signed-in, engageable-post, empty-body, and length checks and before `createProfilePostComment` or comment attachment upload. `app/player/[id].tsx` blocks only creator-video comment/reply submit when the same control is false, after creator-video route/source, signed-in, empty-body, and length checks and before `createCreatorVideoComment` or comment attachment upload. Admin marks Comments as read-only `Enforced on comments`; no working toggle was added.
- Admin V1B2D profile posting enforcement is pushed. `app/profile/[userId].tsx` blocks only Profile post creation submit when `runtimeControls.profile_posting_enabled` is false, after owner/busy, empty-body, and length checks and before `createProfilePost` or post attachment upload. Admin marks Profile Posting as read-only `Enforced on profile posts`; no working toggle was added.
- Admin V1B2E creator posting enforcement is pushed. `app/channel-settings.tsx` blocks only new creator event creation when `runtimeControls.creator_posting_enabled` is false, before `createCreatorEvent`. Existing `updateCreatorEvent` edits, creator-video upload, metadata edit, publish/unpublish/delete, Profile posts, comments/replies, attachments, Channel Studio layout, Public Channel, Player, Watch-Party, Live Stage, Chat, RLS, migrations, generated types, and Supabase remote state are unchanged. Admin marks Creator Posting as read-only `Enforced on creator events`; no working toggle was added.
- Admin V1B2F social attachment enforcement is pushed. `app/profile/[userId].tsx` and `app/player/[id].tsx` block selected non-chat social attachments when `runtimeControls.attachments_enabled` is false, before parent post/comment create and before attachment upload. Text-only posts/comments remain allowed where existing controls allow them. Admin marks Attachments as read-only `Enforced on social attachments`; no working toggle was added.
- Admin V1B2G standalone Chi'lly Chat attachment enforcement is pushed. `app/chat/[threadId].tsx` blocks selected attachments when `runtimeControls.chat_attachments_enabled` is false, before optimistic message insertion and before `sendChatMessage`. Text-only messages remain allowed. Admin marks Chat Attachments as read-only `Enforced on chat attachments`; no working toggle was added.
- Admin V1B2H room attachment enforcement is pushed. `app/watch-party/[partyId].tsx` and `app/watch-party/live-stage/[partyId].tsx` block selected room attachments when `runtimeControls.chat_attachments_enabled` is false, before room message insert and before attachment upload. Text-only room comments remain allowed. Admin marks Chat Attachments as read-only `Enforced on chat and room attachments`; no working toggle was added.
- Ads Launch Foundation V1A is pushed.
- Ads V1A is provider-neutral foundation only. No real ads render yet, no AppLovin SDK was installed, no Unity LevelPlay SDK was installed, no Unity Ads SDK was installed, no AdMob SDK was installed, no real ad IDs were added, no real provider initialization was added, and no CTV inventory was added.
- Ads V1A behavior to preserve: central defaults, `ads_enabled: false`, `ads_provider: placeholder`, placeholder provider not connected/no SDK calls, Premium/ad-free always ineligible, Premium/ad-free counters do not increment, forbidden routes/contexts block eligibility, active browsing time tracking exists, session caps exist, daily caps persist through AsyncStorage, and Admin Ads remains read-only/foundation.
- Ads V1B is pushed.
- Ads V1B added one native/feed placeholder placement on Home through `components/ads/NativeAdSlot.tsx` and `app/(tabs)/index.tsx`.
- Ads V1B behavior to preserve: normal runtime hides the placeholder because `ads_enabled=false`; `NativeAdSlot` renders only after V1A eligibility passes; Premium/ad-free users never see it and do not increment counters; placeholder native/feed records only when eligible; base native/feed session cap is 1; long-use unlock allows a second placement after 120 active browsing minutes; daily native/feed cap is 3; forbidden routes/contexts remain blocked; Admin Ads stays read-only/foundation.
- Ads V1B did not add real ad rendering, SDKs, real IDs, provider initialization, interstitials, CTV inventory, fake revenue, or payout/sponsor/creator earnings systems.
- Ads V1C is pushed.
- Ads V1C added `components/ads/InterstitialController.tsx`, mounted it in `app/_layout.tsx`, and updated Admin Ads read-only/foundation copy in `app/admin.tsx`.
- Ads V1C behavior to preserve: normal runtime shows no interstitial because `ads_enabled=false` and placeholder provider is not connected; the controller renders `null`, ignores first route mount, considers route transitions only, calls central eligibility with `placementKind: "interstitial"`, records placeholder interstitial shows only after eligibility and placeholder-provider success, blocks Premium/ad-free users, respects 180-second first delay, 600-second spacing, session cap 3 plus long-use +2 after 120 active browsing minutes, daily cap 6, and forbidden routes/contexts.
- Ads V1C did not add real ad rendering, SDKs, real IDs, provider initialization, CTV inventory, fake revenue, or payout/sponsor/creator earnings systems.
- Public V1 Hardening H1A 18+ Signup Confirmation is pushed.
- H1A added a no-migration checkbox gate to `app/(auth)/signup.tsx`: signup shows `Chi'llywood is for users 18 and older.`, requires `I confirm I am 18 or older.`, blocks before `supabase.auth.signUp` with the required alert if unchecked, and preserves legal links plus Sign In handoff.
- H1B2 legal acceptance storage is pushed.
- H1B2 applied remote migrations `202605070001` and `202605070002`, regenerated database types from the linked remote schema, wires signup writes through `_lib/accountLegalAcceptance.ts`, and keeps anon access to the legal acceptance table denied.
- H1B2 writes only after signup returns an authenticated session. If email confirmation returns no session, the app does not fake the write.
- Public V1 Hardening H2 upload/content lifecycle polish is pushed.
- H2 changed only `app/channel-settings.tsx` and `components/creator-media/creator-video-card.tsx`.
- H2 keeps existing picker/upload/storage/metadata/Open Player/Edit/Publish/Unpublish/Delete behavior, adds honest local upload lifecycle copy, clarifies backed `Published`/`Draft` and `Media Ready`/`Media Unavailable` states, and does not add fake processing/transcoding/archive/retry/storage-billing states.
- H2 follow-up duplicate-upload UI correction changed only `app/channel-settings.tsx`; keep one clear Channel Studio `Video Upload` form and do not reintroduce separate header/empty-state upload boxes.
- Public V1 Hardening H3 security/compliance/moderation hardening is pushed.
- H3 changed only `_lib/moderation.ts`, `components/safety/report-sheet.tsx`, `app/settings.tsx`, and `components/system/support-screen.tsx`.
- H3 preserves the existing backed `safety_reports` categories and explains them more clearly. Scam/fraud/unsafe product/ad concerns use `Safety`; undisclosed sponsorship uses `Other` until a later schema pass. H3 does not add new schema categories, fake moderation actions, fake legal claims, RLS changes, migrations, generated-type edits, or admin bypasses.

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
- H1B2 legal acceptance storage is pushed for new signups with authenticated sessions.
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
