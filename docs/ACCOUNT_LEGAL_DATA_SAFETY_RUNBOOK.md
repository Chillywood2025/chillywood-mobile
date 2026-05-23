# Account, Legal, And Play Data Safety Runbook

Date: 2026-04-27

Lane: Account deletion / legal URLs / Play Data Safety

Purpose: prepare Chi'llywood's account deletion, legal/support URL, content policy, copyright/DMCA, user-generated-content safety, and Google Play Data Safety readiness without deleting accounts, changing external dashboards, or claiming legal approval.

This runbook is not legal advice and does not complete Google Play Console submission. It is a repo-backed source of truth for what the app currently supports and what a release owner must enter or verify manually.

## Official References To Recheck Before Submission

Use current official docs during final setup because requirements can change:

- Google Play User Generated Content policy: `https://support.google.com/googleplay/android-developer/answer/9876937`
- Google Play Data Safety: `https://support.google.com/googleplay/android-developer/answer/10787469`
- Google Play account deletion requirements: `https://support.google.com/googleplay/android-developer/answer/13327111`
- U.S. Copyright Office DMCA designated agent directory: `https://www.copyright.gov/dmca-directory/`

## Status Key

- Done: implemented and proof captured.
- External Setup Pending: requires hosted URL, legal review, Play Console entry, support process, or public-domain setup.
- Proof Pending: app route or document exists, but release-build/manual proof is still required.
- Unknown / Manual Confirmation Required: repo evidence is insufficient; the owner must confirm before Play submission.

## Current App Route And Link Status

| Surface | Route / config | Reachable from Settings | Reachable from Support | Current status | External URL/domain need |
| --- | --- | --- | --- | --- | --- |
| Signup acceptance | `app/(auth)/signup.tsx`; `supabase/migrations/202605070001_user_account_legal_acceptances.sql`; `supabase/migrations/202605070002_harden_user_account_legal_acceptance_grants.sql`; helper `_lib/accountLegalAcceptance.ts` | N/A | N/A | Signup now shows visible 18+ copy, requires the user to check `I confirm I am 18 or older.` before account creation is attempted, and shows Terms of Service, Privacy Policy, and Community Guidelines acceptance copy with links before account creation. H1B2 legal acceptance storage is pushed: remote schema is applied, generated types are regenerated, signup writes age/terms/privacy acceptance after account creation succeeds with an authenticated session, and anon table access is denied. | Final wording needs attorney/legal approval before launch; runtime signup write proof with a safe disposable account and release smoke remain pending |
| Privacy Policy | `app/privacy.tsx`; runtime env `EXPO_PUBLIC_PRIVACY_POLICY_URL`; public URL `https://chillywoodstream.com/privacy` | Yes; Settings opens configured external URL first, otherwise bundled `/privacy` | Yes | Expanded route exists with account/profile/channel, uploads, chat, room, billing, diagnostics, provider, retention, deletion, and safety/legal data categories; `https://chillywoodstream.com/privacy` redirects with HTTP/2 308 to `/privacy/` and then returns HTTP/2 200; legal review still pending | Final Privacy Policy copy must be attorney-approved and entered in Play Console |
| Terms of Service | `app/terms.tsx`; runtime env `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`; public URL `https://chillywoodstream.com/terms` | Yes; Settings opens configured external URL first, otherwise bundled `/terms` | Yes | Expanded route exists with acceptance, Profile/Channel, UGC, creator upload, Watch-Party/Live/Chat, Premium, moderation, liability/indemnification, and public-readable dispute/support language; `https://chillywoodstream.com/terms` redirects with HTTP/2 308 to `/terms/` and then returns HTTP/2 200; legal review still pending | Final Terms copy must be attorney-approved and available without login |
| Account Deletion | `app/account-deletion.tsx`; runtime env `EXPO_PUBLIC_ACCOUNT_DELETION_URL`; public URL candidate `https://chillywoodstream.com/account-deletion` | Yes; Settings opens configured external URL first, otherwise bundled `/account-deletion` | Yes; signed-in support can start request/help | Expanded request-based page exists; no destructive deletion runs in app; `https://chillywoodstream.com/account-deletion` redirects with HTTP/2 308 to `/account-deletion/` and then returns HTTP/2 200; final backend/support process and Play acceptance remain pending | Enter the live URL in Play Console and wait for account deletion acceptance before claiming Google Play compliance |
| Support | `app/support.tsx`, `components/system/support-screen.tsx`; runtime env `EXPO_PUBLIC_SUPPORT_EMAIL`; fallback `support@chillywoodstream.com` | Settings links to support/account help surfaces indirectly through legal/account controls | Yes | Support route exists with support categories, account/billing/upload/safety/copyright/deletion guidance, emergency disclaimer, signed-in feedback handoff, and pending SLA language; public support email is `support@chillywoodstream.com`, Cloudflare routing is configured, inbox receipt proof passed by operator-confirmed destination-inbox receipt for a real test message, and public DNS now proves MX, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, and DMARC `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1` | Public support URL, inbox receipt, SPF, and DMARC baseline are proved; DKIM remains pending until a real outbound mail provider issues selector records; support ownership/SLA and legal approval must still be confirmed |
| Static public legal/support site | `public-site/legal-site/`; build with `npm run legal-site:build`; output `public-site/legal-site/site/`; Cloudflare Pages project `chillywood-legal` | Settings keeps bundled fallbacks and may prefer configured public URLs | Public web surface only | Canonical public policy text now comes from `legal/policies.mjs`. The May 22 build generates 18 static pages: the 12 full legal/policy pages, hosted `/copyright-report` public DMCA form, and compatibility aliases. Cloudflare Pages redeployed the expanded site on May 22, 2026; custom domain `chillywoodstream.com` is active. Apex proof returned HTTP 200 after redirect for `/copyright-report/`; prior May 21 proof remains valid for `/privacy/`, `/creator-monetization/`, `/live-rules/`, `/terms/`, `/account-deletion/`, `/copyright/`, and `/support/` unless later deployment regresses them. Admin Canary legal/DMCA readiness passed with `65 pass / 0 manual / 0 fail` after Legal Intake / Legal Evidence closeout. | Use the live URLs for store entries only after attorney approval; Play Console Data Safety/account deletion acceptance remains pending |
| Community Guidelines / Content Policy | `app/community-guidelines.tsx` | Yes | Yes | Expanded bundled route covers creator uploads, live rooms, Watch-Party, chat/message/comment behavior, copyright/media rights, minor safety, reporting, enforcement, repeat violations, and manual review posture; legal/content policy review pending | Public hosted URL is recommended before Play listing submission |
| Creator Rules | `app/creator-rules.tsx` | Yes | Yes | Bundled public route covers creator ownership, upload rights, Channel identity, files/links, live rules, monetization/payout inactive status, sponsorship disclosures, and enforcement; legal/content policy review pending | Public hosted URL is recommended before Play listing submission |
| Copyright / DMCA | `app/copyright.tsx`, `app/copyright-report.tsx`, `app/counter-notice.tsx`, `_lib/dmca.ts`, `app/admin.tsx`, `supabase/migrations/202605140001_dmca_operational_tooling.sql`, `supabase/migrations/202605140005_dmca_restore_eligibility_court_action_guard.sql`, `supabase/migrations/202605140006_dmca_restore_action_court_action_guard.sql`, `supabase/migrations/202605220001_dmca_public_pipeline_closeout.sql`, `supabase/migrations/202605220002_dmca_attachments_uploader_counter_notice.sql` | Yes | Yes | Expanded bundled route covers takedown notices, required notice information, possible actions, counter-notice workflow, repeat infringer policy, false-notice warning, and designated agent contact for registration `DMCA-1072720`; hosted public notice intake, private evidence attachments, formal notice intake, uploader self-service counter-notice for own cases, Admin case tooling, counter-notice recording/deadlines, court-action restore blocking, strikes, repeat-infringer review, audit history, RLS/private-data denial, and safe proof-content cleanup are backed and live-proof closed; attorney review remains pending | Public hosted URL is live; automated malware scanning remains pending and evidence files are marked pending manual review; outbound email automation if required and attorney review should be completed before broader compliance claims |
| Report Abuse / Safety Contact | `components/safety/report-sheet.tsx`, `_lib/moderation.ts`, `app/player/[id].tsx`, `app/admin.tsx`, Support route | Contextual report actions, not one global Settings route | Support can collect help requests | Creator-video report/admin safety foundation exists; generic `copyright` reports now route/link to formal DMCA intake; DMCA end-to-end proof passed; broader general report lifecycle proof remains pending | Play listing/support materials should explain report-abuse path, copyright-report limits, and support contact |

## Legal And UGC Protection Language Status

This section is not legal advice and does not make legal guarantees. It records launch-readiness language that reduces avoidable platform-risk gaps and must be approved by an attorney/legal owner before public launch.

Implemented in this lane:

- `legal/policies.mjs` is now the canonical production policy bundle for Privacy, Terms, Community Guidelines, Creator Rules, Copyright/DMCA, Support, Account Deletion, Premium Terms, Live/Watch-Party/Chat Rules, Law Enforcement, Moderation/Appeals, and Creator Monetization. The older `docs/legal/` files remain supporting/historical launch documentation and are not the current generated public-site source.
- `public-site/legal-site/` now builds 18 static pages from canonical policy truth: the 12 full legal/policy pages, hosted `/copyright-report` public DMCA form, and compatibility aliases. Cloudflare Pages redeployed the expanded site on May 22, 2026, and Admin Canary legal/DMCA readiness passed with `65 pass / 0 manual / 0 fail` after Legal Intake / Legal Evidence closeout.
- Public app copy now avoids visible draft/placeholder language while still avoiding false compliance claims.
- Settings and Support now link Creator Rules in addition to Privacy, Terms, Community Guidelines, Copyright/DMCA, Account Deletion, and Support.
- Signup now states: "Chi'llywood is for users 18 and older." It requires the user to check "I confirm I am 18 or older." before account creation is attempted. If unchecked, signup blocks before `supabase.auth.signUp` and shows the required 18+ confirmation alert.
- Signup now states: "By creating an account, you agree to Chi'llywood's Terms of Service, Privacy Policy, and Community Guidelines." It links to the bundled Terms, Privacy, and Community Guidelines routes.
- Terms now say users are responsible for what they upload, stream, post, message, share, or otherwise make available, and the page now includes detailed Profile/Channel, creator upload, Watch-Party, Live, Chat, Premium, moderation, suspension, and feature-availability sections.
- Privacy now maps account/profile/channel, creator-uploaded media, file picker, camera/microphone, chat/messages, Watch-Party/Live participation, billing/entitlement, support/report/moderation, diagnostics/crash/performance, provider, sharing, retention, deletion, and minor-safety posture.
- Community Guidelines now read as a full platform content policy covering creator uploads, live rooms, Watch-Party, chat/messages/comments/reactions, copyright/media rights, sexual exploitation/minor safety, harassment/hate/violence, fraud/spam/malware, reporting, enforcement, repeat violations, manual review, and creator responsibility.
- Support now includes support categories, account/billing/upload/safety/copyright/deletion guidance, response-time pending copy, and an emergency disclaimer.
- Terms and Community Guidelines now explicitly prohibit uploading or streaming content users do not own or have rights to use, including copyrighted movies, shows, music, clips, images, pirated media, illegal content, sexual exploitation/minor-safety content, harassment, threats, hate, dangerous/violent content, scams, spam, malware, impersonation, and misleading content.
- Terms now state that users keep ownership of their content, and grant Chi'llywood a limited license to host, store, display, stream, process/transcode if later built, distribute within the app, and make content available according to selected visibility settings.
- Terms and Guidelines now state that Chi'llywood may remove or hide content, restrict/suspend/terminate accounts, respond to reports, preserve records when legally required or needed for safety/enforcement, cooperate with lawful requests, and enforce community rules.
- Copyright/DMCA now describes takedown notice information, counter-notice posture, repeat-infringer handling, and the designated DMCA agent contact.
- DMCA designated agent public contact posting and U.S. Copyright Office registration are recorded complete under registration `DMCA-1072720`; hosted public DMCA notice intake, private evidence attachments with manual scan-review status, formal notice intake, owner/operator Admin case tooling, uploader self-service counter-notices for own cases, Admin-recorded counter-notices/deadlines, court-action restore blocking, strike tracking, repeat-infringer review, audit history, and RLS/private-data denial are backed and live-proof closed. Support inbox receipt proof for `support@chillywoodstream.com` passed by operator-confirmed destination-inbox receipt, and domain email DNS now proves Cloudflare MX, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, and DMARC `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1`. Attorney review, automated malware scanning, outbound email automation, and DKIM after real outbound-provider setup remain pending.
- Terms now include service provided as-is, no uninterrupted-service guarantee, user-generated-content responsibility limits, limitation of liability, indemnification, and right to change/remove features.
- Account Deletion now says some records may be retained for legal, fraud, security, billing, moderation, chargeback, dispute, copyright, or compliance reasons, and that Profile/Channel/upload deletion handling needs final legal/backend approval.

Still pending:

- Attorney/legal approval of final Terms, Privacy, Creator Rules, Community Guidelines, Copyright/DMCA, account deletion, refund/subscription, payout, fraud/forfeiture, sponsor disclosure, banned content, moderation workflow, and signup acceptance wording.
- Runtime signup proof with a safe disposable account. H1B2 wires storage for authenticated signup sessions, but the implementation/proof pass did not create a real account.
- Public legal/support URLs are live on `https://chillywoodstream.com/*`; the May 22 deployment proved `/copyright-report/` returned HTTP 200 after redirect, while May 21 expanded policy proof remains valid for `/privacy/`, `/creator-monetization/`, `/live-rules/`, `/terms/`, `/account-deletion/`, `/copyright/`, and `/support/` unless later deployment regresses them. No LiveKit fallback was reached, and Privacy mentions LiveKit only as policy text.
- Keep the DMCA designated agent contact and U.S. Copyright Office registration current; registration `DMCA-1072720` is recorded complete.
- Live end-to-end backed/Admin/public DMCA proof passed with safe reporter/uploader/admin/viewer accounts and supported content; uploader-facing counter-notice submission and private DMCA evidence attachments are now backed and canary-proved. Automated malware scanning and outbound email automation remain pending unless handled manually through Support/Admin.
- Final backend deletion/de-identification and retention runbook.
- Release-build proof that signup legal links open correctly and remain readable on Android.

## Account Deletion Decision

Current decision: Public v1 uses an honest request-based account deletion path. The app must not claim automated permanent deletion has completed unless a separate backend/data-retention implementation is built and proved.

What exists now:

- `app/account-deletion.tsx` is a public legal route that can be opened without sign-in.
- `app/_layout.tsx` explicitly allows `/privacy`, `/terms`, `/account-deletion`, `/community-guidelines`, `/creator-rules`, and `/copyright` as public legal paths even if runtime config is incomplete.
- `app/settings.tsx` has `Request Account Deletion` and links the public legal/support set.
- Settings prefers the configured external account deletion URL when available and otherwise opens the bundled local route.
- `components/system/support-screen.tsx` supports `topic=account-deletion`; signed-out users are sent to sign in before sending account-specific support feedback.
- The account deletion route now explicitly names Profile, Channel, uploaded videos, Chi'lly Chat messages, Watch-Party/Live room records, billing/subscription records, and moderation/report records as surfaces that may be reviewed during deletion.
- The account deletion route now says final Profile, Channel, uploaded video, storage object, thumbnail, comment, message, report, room, and metadata handling needs legal/backend approval before claiming a purge method or timing.
- No account or data is deleted by this route.

What still needs legal/backend/manual work:

- Finalize whether Public v1 will rely on manual support verification or a self-serve deletion portal.
- Define the backend deletion/de-identification runbook for Supabase auth, `user_profiles`, channel/audience rows, `videos`, creator-video storage objects, chat rows, watch-party memberships/rooms, `user_entitlements`, `billing_events`, `safety_reports`, support rows, notifications/reminders, and logs/backups.
- Define retained-record rules for safety, fraud prevention, moderation, DMCA/copyright, billing/accounting, legal compliance, and dispute resolution.
- Confirm deletion timing/SLA and support owner.
- Confirm subscription cancellation language because app-store subscriptions may require store-side cancellation separate from account deletion.

## Play Data Safety Checklist

This table is a preparation aid for manual Google Play Console entry. Use Google Play's current Data Safety form and third-party SDK disclosures before submission.

Security/IP note: `docs/admin/SECURITY_CONTEXT_IP_AUDIT.md` records the current repo decision for network proof. Chi'llywood should treat IP/network request metadata as restricted security, fraud-prevention, abuse-prevention, account-protection, live-cost-protection, audit-integrity, payout/revenue-integrity, and legal-compliance evidence. The current repo avoids app-owned raw IP columns and has no public IP display. First backend support is applied through the restricted `security_request_context` path with hashed/masked context and `security_context_id` links for selected admin/owner/LiveKit audit events. The linked project has the backend hash pepper configured and default trusted proxy headers disabled; real IP capture still requires a separately proved server-side trusted-header chain. Owner Security and Audit Explorer may show masked network proof only through approved backend summaries for authorized owner/admin contexts; public UI must not show raw IP, and final retention durations remain a legal/product decision.

| Data category | Repo evidence | Collected? | Purpose | Shared with third parties/services? | Optional or required | Deletion request coverage | Play Console note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Account info: email, user id, sign-in identity | Supabase auth, `useSession`, Settings signed-in identity, RevenueCat identity sync | Yes | Account creation, login, access control, support, entitlement/account linking | Supabase; RevenueCat when billing is configured; Firebase identity for diagnostics/analytics helpers if enabled | Required for signed-in features | Covered by account deletion request, subject to retained records | Enter account info / identifiers as collected. Confirm exact Play labels manually. |
| Profile and Channel info | `user_profiles`, `app/profile/[userId].tsx`, `app/channel/[userId].tsx`, `app/channel-studio/index.tsx`, `app/channel-settings.tsx` compatibility | Yes | Public identity, public Channel surface, owner Platform Studio display/defaults | Supabase; visible to other users according to profile/channel visibility | Optional beyond basic account, but required for public profile/channel use | Covered by deletion/de-identification request | Enter user-provided profile/content data where applicable. |
| Creator-uploaded videos/media | `expo-document-picker`, `_lib/creatorVideos.ts`, `videos`, `creator-videos` storage | Yes when user uploads | Creator channel media, playback, Player, Watch-Party source | Supabase storage/database; visible to other users when public | Optional | Covered by deletion/unpublish/de-identification request, with legal/safety retention exceptions | Enter photos/videos or files/media as user-provided content if Play form asks. |
| Photos/videos selected through picker | `expo-document-picker` for upload; no broad camera-roll import found | Yes when user chooses a file | Upload creator video to Channel/Profile | Supabase storage after upload; local picker selection not globally scanned by app evidence | Optional | Uploaded media covered by deletion; local device files are not deleted by app | Do not imply broad photo library collection beyond selected upload files. |
| Chi'lly Chat messages | `chat_threads`, `chat_thread_members`, `chat_messages`, `/chat` routes | Yes when users message | Direct messaging and communication coordination | Supabase; visible to chat participants; moderation/support may review where needed | Optional but required to use chat | Covered by deletion/de-identification subject to recipient context and safety retention | Enter messages/user-generated content if Play form asks. |
| Watch-Party / Live room participation | `watch_party_rooms`, memberships, LiveKit token flow, room routes | Yes when users create/join rooms | Room access, playback sync, Live Stage, safety, rejoin/recovery | Supabase; LiveKit for live media sessions; visible to room participants | Optional but required to use rooms/live | Covered by deletion/de-identification subject to room/audit/safety retention | Enter app activity/interactions or user-generated room data as applicable. |
| Camera and microphone media | `CAMERA`, `RECORD_AUDIO`, LiveKit/Expo Camera code | Yes during live/camera room use | Live Stage, communication rooms, participant media | LiveKit infrastructure; other room participants receive media in real time | Optional; required only for camera/mic room features | Live media is session behavior; retained recordings are not currently supported by repo truth | Declare camera/microphone use. Do not claim recording/VOD storage unless later built. |
| Purchases/subscription entitlement | RevenueCat, Google Play Billing, `user_entitlements`, `billing_events` | Yes if Premium/billing is configured | Premium access, restore/manage subscription, fraud/accounting | Google Play/RevenueCat; Supabase entitlement tables | Optional unless user purchases Premium | Deletion may not remove retained financial/legal records | Enter purchase history/subscription entitlement if billing ships. |
| Diagnostics/crash/performance data | Firebase Crashlytics/Performance packages/helpers; root bootstraps Firebase | Yes if Firebase collection enabled in release | Crash reporting, performance, stability, quality | Firebase/Google | Generally collected for app quality; confirm opt-out/collection posture | Account-linked diagnostics may be cleared/de-identified where possible; aggregate logs may be retained | Enter diagnostics/performance data and confirm Firebase collection settings. |
| Analytics/app interactions | `_lib/analytics.ts`, Firebase Analytics helpers, route tracking, event tracking | Yes if Firebase analytics collection enabled | Product analytics, route/event understanding, quality improvement | Firebase/Google | Usually collected automatically when enabled; manual confirmation required | Account-linked analytics may be reset/de-identified where possible | Enter app activity/analytics if enabled in release. |
| Device/app info | Expo/Firebase/RevenueCat/Supabase SDKs, app version/runtime config, diagnostics | Yes/likely | Security, fraud prevention, diagnostics, compatibility, billing, crash/performance | Firebase, RevenueCat, Supabase, Google Play as applicable | Required for app operation and diagnostics | May be retained in logs/security records for limited periods | Confirm exact device identifiers/data types in SDK disclosures. |
| Reports/moderation data | `safety_reports`, `_lib/moderation.ts`, report sheet, admin queue | Yes when reports are submitted or reviewed | Abuse reporting, safety review, policy enforcement, audit | Supabase; reviewed by Chi'llywood operators; may be shared if legally required | Optional unless reporting abuse; retained for safety | May be retained after account deletion for safety/legal reasons | Enter support/safety communications and user-generated report content as applicable. |
| Support feedback | `components/system/support-screen.tsx`, `_lib/betaProgram.tsx`, `beta_feedback_items` | Yes when user submits support feedback | Support, triage, launch readiness, account help | Supabase/support operators; email provider if user contacts support email | Optional | Covered by deletion request subject to support/legal retention | Enter customer support/feedback data if Play form asks. |
| Notifications/reminders | `expo-notifications`, `notifications`, `notification_preferences`, `user_push_tokens`, `notification_delivery_attempts`, `event_reminders`; Android delivery proof passed | Implemented / Android Proved | Activity inbox, read/dismiss state, Android push alerts, live/event/upload/replay reminders | Expo/Firebase FCM V1 for Android; APNs/iOS later unless separately scoped | Optional user-controlled notifications | Account-linked reminders/notifications and device tokens should be deleted/de-identified or revoked according to the account deletion process | Android push delivery is live/proved for D9; disclose notification/device token collection and keep raw tokens/secrets out of UI/docs/logs. |
| Location | No `expo-location`; no app location permission found; route touch coordinates are UI-only, not geographic location | No app-feature evidence | Not used by current product features | Unknown SDK/network-derived approximate location must be checked in provider docs | Not applicable unless SDKs collect it | Not applicable by app-feature truth | Do not select precise/approximate location based on repo feature evidence. Manually confirm SDK/network disclosures. |
| Contacts/address book | No contacts permission/package found | No repo evidence | Not used | None by app-feature truth | Not applicable | Not applicable | Do not select unless future feature adds it. |
| Health/fitness/financial payment card data | No repo evidence of direct collection; purchases are through app store/RevenueCat | No direct app collection evidence | Not used directly | Google Play/RevenueCat handle purchase processing | Not applicable for direct collection | Billing records may be retained externally | Do not claim direct card/financial account collection by app unless later built. |

## User-Generated Content Safety Readiness

Current repo-ready posture:

- Signup now presents Terms, Privacy Policy, and Community Guidelines acceptance copy with links before account creation.
- Signup now presents the H1A 18+ checkbox confirmation before account creation. H1B2 writes backed age/terms/privacy acceptance after account creation succeeds with an authenticated session. If signup returns no session because email confirmation is required, the app does not fake the write.
- Community Guidelines route exists and covers creator uploads, profiles, Chi'lly Chat, Watch-Party rooms, Live Stage, reports, and enforcement.
- Creator Rules route exists and covers creator ownership, rights clearance, Channel identity, upload/live rules, inactive payouts, sponsor disclosure, and enforcement.
- Copyright/DMCA route exists and explains takedown notice information, review, removal, counter-notice posture, repeat-infringer posture, and designated agent registration/contact truth; attorney review remains pending.
- Creator-video reports exist through Player/report sheet ownership.
- Admin/operator moderation surface exists in `app/admin.tsx`.
- Safety reports use `safety_reports`; creator-video moderation uses `videos.moderation_status`.
- Hidden/removed creator videos are intended not to appear publicly or play publicly.

Still proof-pending:

- Report creator video writes a real `safety_reports` row in the launch backend.
- Non-admin cannot perform admin moderation actions.
- Admin/operator can hide/remove/restore creator videos in the launch backend.
- Hidden/removed creator videos are absent from public Profile/Channel and Player routes in Android/runtime proof.
- Support/account deletion feedback reaches the expected support queue.
- Public hosted Community Guidelines and Copyright/DMCA pages are reachable without login if Play Store listing links to them.
- Public hosted Creator Rules page is reachable without login if Play Store listing or support copy links to it.
- Runtime signup proof with a safe disposable account confirms a real `user_account_legal_acceptances` row is written after account creation succeeds with an authenticated session.

## Manual Play Console Steps

1. In Play Console, open the verified Chi'llywood app for package `com.chillywood.mobile`; Android developer/package verification is complete, but Data Safety/account deletion acceptance is not.
2. Complete App content / Privacy Policy with the final public Privacy Policy URL.
3. Complete App content / Data Safety using the data-category table above plus current SDK provider disclosures.
4. Complete the account deletion section with the final public account deletion URL.
5. Confirm the account deletion URL:
   - is public and opens without login where Play requires it
   - describes how users request deletion
   - describes data deleted/de-identified
   - describes data retained and why
   - gives a support/contact path
6. Complete any user-generated-content policy questions:
   - signup acceptance copy links to Terms, Privacy Policy, and Community Guidelines
   - content policy exists
   - in-app report abuse path exists
   - moderation/admin review path exists
   - DMCA/copyright process exists
   - repeat abuse/takedown process is defined
7. Confirm camera/microphone permission declarations match Live Stage/communication room behavior.
8. Confirm subscription/billing disclosures if Premium ships in the same release.
9. Save final Play Console screenshots or exported notes outside the repo if they contain account details.
10. Update `docs/EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST.md` only after proof, without exposing secrets or personal data.

## External URL Checklist

| URL / contact | Current repo fallback | Audit result | Status | Exact next action |
| --- | --- | --- | --- | --- |
| Privacy Policy | `https://chillywoodstream.com/privacy` | HTTP/2 308 to `/privacy/`, then HTTP/2 200 | Live URL / Legal Review Pending | Legal owner must approve final copy and enter URL in Play Console. |
| Terms of Service | `https://chillywoodstream.com/terms` | HTTP/2 308 to `/terms/`, then HTTP/2 200 | Live URL / Legal Review Pending | Legal owner must approve final copy and enter URL wherever required. |
| Account Deletion | `https://chillywoodstream.com/account-deletion` | HTTP/2 308 to `/account-deletion/`, then HTTP/2 200 | Live URL Candidate / Play Acceptance Pending | Confirm deletion process/SLA/backend runbook, then enter URL in Play Console account deletion section and wait for acceptance. |
| Community Guidelines | Bundled route `/community-guidelines` | App route exists; no external fallback env exists | External Setup Pending | Publish/confirm hosted URL if Play listing or web support needs a public link. |
| Creator Rules | Bundled route `/creator-rules` | App route exists; no external fallback env exists | External Setup Pending | Publish/confirm hosted URL if Play listing or web support needs a public link. |
| Copyright / DMCA | `https://chillywoodstream.com/copyright` and `https://chillywoodstream.com/copyright-report` | HTTP/2 308 to trailing-slash routes, then HTTP/2 200 | Live URLs / Public DMCA Form Live / DMCA Agent Registered / DMCA Tooling Live-Proved / Support Inbox Proved / Attorney Review Pending | Copyright page lists designated agent contact and registration `DMCA-1072720`; hosted public notice intake, private evidence attachments with pending manual scan review, formal notice intake, uploader self-service counter-notices for own cases, Admin case tooling, Admin-recorded counter-notices, strike tracking, repeat-infringer review, audit history, supported content hide/restore, and court-action restore blocking are backed and live-proof closed. Support inbox receipt proof for `support@chillywoodstream.com` passed. Attorney review, automated malware scanning, and outbound email automation remain pending. |
| Support | `https://chillywoodstream.com/support` and `support@chillywoodstream.com` | HTTP/2 308 to `/support/`, then HTTP/2 200; Cloudflare destination/routing is configured; operator-confirmed destination-inbox receipt passed; public DNS proves MX, SPF, and DMARC baseline | Live URL / Inbox Receipt Proof Passed / DMARC Baseline Proved | Real test message subject `Chi'llywood Support Receipt Proof - 2026-05-13` was sent to `support@chillywoodstream.com` and confirmed received. No screenshots, raw headers, inbox exports, private contents, sender private details, credentials, tokens, DKIM private keys, or email secrets are committed. Public MX is present, SPF is `v=spf1 include:_spf.mx.cloudflare.net ~all`, and DMARC is `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1`. DKIM remains pending until a real outbound mail provider for `@chillywoodstream.com` issues selector records. |
| Expanded static legal site | `public-site/legal-site/site/`, `https://0c365932.chillywood-legal.pages.dev`, and `https://chillywoodstream.com` | May 22 Cloudflare Pages deployment generated 18 pages from `legal/policies.mjs`; apex proof passed for `/copyright-report/`; May 21 proof remains valid for `/privacy/`, `/creator-monetization/`, `/live-rules/`, `/terms/`, `/account-deletion/`, `/copyright/`, and `/support/` unless later deployment regresses them | Apex Legal URLs Live / Public DMCA Form Live / Legal Canary Passed / Legal Intake And Evidence Live-Proof Closed / Store Acceptance Pending | Use `https://chillywoodstream.com/account-deletion` as the live Google Play account deletion URL candidate, `https://chillywoodstream.com/copyright-report` as public DMCA notice intake, and enter/verify required legal/support URLs in Play Console after attorney approval. |

## Completion Status

Done:

- Signup acceptance copy now links Terms, Privacy Policy, and Community Guidelines before account creation.
- H1A 18+ signup confirmation is pushed and current-build Android-proved: unchecked signup shows the 18+ required alert before account creation, checked signup falls through to the existing signup validation path, and the signup legal links plus Sign In handoff still work.
- H1B1 private legal acceptance schema foundation is pushed locally: `public.user_account_legal_acceptances` is defined with owner-only authenticated RLS, and `_lib/accountLegalAcceptance.ts` provides pure version/payload helpers. The foundation intentionally avoids `user_profiles` for private legal timestamps.
- H1B2 legal acceptance storage is pushed: remote migrations `202605070001` and `202605070002` are applied, generated database types are regenerated, signup writes backed age/terms/privacy acceptance for authenticated signup sessions, and anon reads to the table return permission denied.
- Bundled legal routes exist for Privacy, Terms, Account Deletion, Community Guidelines, Creator Rules, and Copyright/DMCA.
- Privacy, Terms, Account Deletion, Community Guidelines, Creator Rules, Copyright/DMCA, and Support are expanded beyond placeholder pages and now contain structured, launch-ready public copy.
- `legal/policies.mjs` contains the canonical production policy bundle; each full page remains attorney-review-required before public launch.
- `public-site/legal-site/` generates 18 static public pages for the complete requested URL surface; the May 22 Cloudflare Pages deployment is live on `chillywoodstream.com`, and Admin Canary legal/DMCA readiness passed with `65 pass / 0 manual / 0 fail` after Legal Intake / Legal Evidence closeout.
- Settings links to privacy, terms, community guidelines, creator rules, copyright/DMCA, support, and account deletion.
- Support route provides account-deletion help and signed-in feedback handoff.
- Configured privacy, terms, and account-deletion fallback URLs returned HTTP 200 in this audit.
- Data Safety preparation categories are documented for manual Play Console entry.
- Production UGC responsibility, platform moderation rights, user-content license, DMCA/copyright, repeat-infringer, limitation/disclaimer, deletion-retention, premium/subscription, creator monetization disclaimer, live/chat rules, law-enforcement intake, and moderation/appeals language is documented in `legal/policies.mjs` and remains pending attorney/legal approval before public launch.

External Setup Pending:

- Final legal review and approval of Privacy, Terms, Creator Rules, Community Guidelines, Copyright/DMCA, Account Deletion, Refunds/Subscriptions, Creator Payouts, Fraud/Forfeiture, Sponsor Disclosure, Banned Content, and Moderation workflow copy.
- Final legal review and approval of signup acceptance wording.
- Runtime signup acceptance write proof with a safe disposable account, plus release-build proof.
- DMCA designated agent registration/contact maintenance; registration `DMCA-1072720` is recorded complete, backed/Admin/public DMCA tooling is live-proof closed, private evidence attachment/uploader counter-notice proof passed, support inbox receipt proof passed, and domain MX/SPF/DMARC baseline is proved; attorney review, automated malware scanning, outbound email automation, and DKIM after real outbound-provider setup remain pending.
- Final account deletion support process/SLA and support ownership approval; public support URL, verified `support@chillywoodstream.com` inbox receipt, SPF, and DMARC baseline are proved.
- Final backend deletion/de-identification and retention runbook.
- Play Console Data Safety form entry; package verification for `com.chillywood.mobile` is complete, but Data Safety acceptance remains pending.
- Play Console account deletion URL entry; package verification for `com.chillywood.mobile` is complete, but account deletion URL acceptance remains pending.
- Play Console entry and acceptance for the live public hosted URLs, including the account deletion URL candidate `https://chillywoodstream.com/account-deletion`; production apex proof has passed for the expanded May 21 policy bundle and core legal/support URLs.

Proof Pending:

- Signup H1A route smoke passed on the current Android dev-client build for legal links, 18+ unchecked blocking, checked fallback to existing validation, and Sign In handoff; release-build proof and real existing-account login proof remain pending.
- H1B2 schema/type/runtime wiring was typecheck/diff-check validated before commit, remote migration alignment was proved, and anon REST denial was proved. Runtime signup write proof with a safe disposable account and release proof remain pending.
- Android Settings legal/support/Creator Rules/account deletion route smoke.
- Release build opens configured URLs correctly.
- Support/account deletion request lands in expected backend/support queue.
- Creator-video report/admin moderation proof for UGC safety readiness.
- Legal URLs remain reachable from a non-authenticated browser at release time.

## Exact Next Action

Legal/support owner should finalize the signup acceptance wording, attorney-reviewed policy set, account deletion process, DMCA agent/contact process, and public URL set, then manually complete Google Play Data Safety, UGC, copyright, and account deletion entries using this runbook. Engineering should run a safe disposable-account runtime proof for H1B2 legal acceptance writes and release-route proof for Settings/Support legal links before marking launch legal routing fully runtime-proved. Engineering should not implement destructive account deletion, live payouts, sponsor payments, or refund systems until the required backend/legal/provider plans are explicitly approved and proved.
