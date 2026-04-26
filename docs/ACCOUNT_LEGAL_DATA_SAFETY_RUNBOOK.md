# Account, Legal, And Play Data Safety Runbook

Date: 2026-04-26

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
| Signup acceptance | `app/(auth)/signup.tsx` | N/A | N/A | Signup now shows visible Terms of Service, Privacy Policy, and Community Guidelines acceptance copy with links before account creation; Android/release smoke still pending | Final wording needs attorney/legal approval before launch |
| Privacy Policy | `app/privacy.tsx`; runtime env `EXPO_PUBLIC_PRIVACY_POLICY_URL`; fallback `https://live.chillywoodstream.com/privacy` | Yes; Settings opens configured external URL first, otherwise bundled `/privacy` | Yes | Route exists; configured fallback returned HTTP 200 during this audit; legal review still pending | Final public Privacy Policy URL must be approved and entered in Play Console |
| Terms of Service | `app/terms.tsx`; runtime env `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`; fallback `https://live.chillywoodstream.com/terms` | Yes; Settings opens configured external URL first, otherwise bundled `/terms` | Yes | Route exists; configured fallback returned HTTP 200 during this audit; legal review still pending | Final public Terms URL must be approved and available without login |
| Account Deletion | `app/account-deletion.tsx`; runtime env `EXPO_PUBLIC_ACCOUNT_DELETION_URL`; fallback `https://live.chillywoodstream.com/account-deletion` | Yes; Settings opens configured external URL first, otherwise bundled `/account-deletion` | Yes; signed-in support can start request/help | Request-based; no destructive deletion runs in app; configured fallback returned HTTP 200 during this audit; final backend/support process pending | Final public account deletion URL must be approved, reachable without login where Play requires it, and entered in Play Console |
| Support | `app/support.tsx`, `components/system/support-screen.tsx`; runtime env `EXPO_PUBLIC_SUPPORT_EMAIL` | Settings links to support/account help surfaces indirectly through legal/account controls | Yes | Support route exists; signed-in feedback support is backed by current support queue owner; support email must be confirmed | Public support URL/email and support ownership/SLA must be confirmed |
| Community Guidelines / Content Policy | `app/community-guidelines.tsx` | Yes | Yes | Bundled route exists; legal/content policy review pending | Public hosted URL is recommended before Play listing submission |
| Copyright / DMCA | `app/copyright.tsx` | Yes | Yes | Bundled route exists; copyright contact path uses Chi'llywood Support; legal review pending | Public hosted URL and DMCA contact/process should be confirmed before store submission |
| Report Abuse / Safety Contact | `components/safety/report-sheet.tsx`, `_lib/moderation.ts`, `app/player/[id].tsx`, `app/admin.tsx`, Support route | Contextual report actions, not one global Settings route | Support can collect help requests | Creator-video report/admin safety foundation exists; report/admin proof still pending | Play listing/support materials should explain report-abuse path and support contact |

## Legal And UGC Protection Language Status

This section is not legal advice and does not say Chi'llywood cannot be sued. It records launch-readiness language that reduces avoidable platform-risk gaps and must be approved by an attorney/legal owner before public launch.

Implemented in this lane:

- Signup now states: "By creating an account, you agree to Chi'llywood's Terms of Service, Privacy Policy, and Community Guidelines." It links to the bundled Terms, Privacy, and Community Guidelines routes.
- Terms now say users are responsible for what they upload, stream, post, message, share, or otherwise make available.
- Terms and Community Guidelines now explicitly prohibit uploading or streaming content users do not own or have rights to use, including copyrighted movies, shows, music, clips, images, pirated media, illegal content, sexual exploitation/minor-safety content, harassment, threats, hate, dangerous/violent content, scams, spam, malware, impersonation, and misleading content.
- Terms now state that users keep ownership of their content, and grant Chi'llywood a limited license to host, store, display, stream, process/transcode if later built, distribute within the app, and make content available according to selected visibility settings.
- Terms and Guidelines now state that Chi'llywood may remove or hide content, restrict/suspend/terminate accounts, respond to reports, preserve records when legally required or needed for safety/enforcement, cooperate with lawful requests, and enforce community rules.
- Copyright/DMCA now describes takedown notice information, counter-notice posture, repeat-infringer handling, and the need for final DMCA agent/contact approval.
- Copyright/DMCA now notes that real DMCA safe-harbor readiness should be reviewed by an attorney and may require registering a designated DMCA agent with the U.S. Copyright Office.
- Terms now include launch placeholder language for service provided as-is, no uninterrupted-service guarantee, user-generated-content responsibility limits, limitation of liability, indemnification, and right to change/remove features, all marked for legal review.
- Account Deletion now says some records may be retained for legal, fraud, security, billing, moderation, chargeback, dispute, copyright, or compliance reasons, and that Profile/Channel/upload deletion handling needs final legal/backend approval.

Still pending:

- Attorney/legal approval of final Terms, Privacy, Community Guidelines, Copyright/DMCA, account deletion, and signup acceptance wording.
- Final hosted public URLs for legal/support pages, especially Community Guidelines and Copyright/DMCA if Play listing links to them.
- Final DMCA agent/contact decision and any required U.S. Copyright Office designated-agent registration.
- Final backend deletion/de-identification and retention runbook.
- Release-build proof that signup legal links open correctly and remain readable on Android.

## Account Deletion Decision

Current decision: Public v1 uses an honest request-based account deletion path. The app must not claim automated permanent deletion has completed unless a separate backend/data-retention implementation is built and proved.

What exists now:

- `app/account-deletion.tsx` is a public legal route that can be opened without sign-in.
- `app/_layout.tsx` explicitly allows `/privacy`, `/terms`, `/account-deletion`, `/community-guidelines`, and `/copyright` as public legal paths even if runtime config is incomplete.
- `app/settings.tsx` has `Request Account Deletion`.
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

| Data category | Repo evidence | Collected? | Purpose | Shared with third parties/services? | Optional or required | Deletion request coverage | Play Console note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Account info: email, user id, sign-in identity | Supabase auth, `useSession`, Settings signed-in identity, RevenueCat identity sync | Yes | Account creation, login, access control, support, entitlement/account linking | Supabase; RevenueCat when billing is configured; Firebase identity for diagnostics/analytics helpers if enabled | Required for signed-in features | Covered by account deletion request, subject to retained records | Enter account info / identifiers as collected. Confirm exact Play labels manually. |
| Profile and Channel info | `user_profiles`, `app/profile/[userId].tsx`, `app/channel-settings.tsx` | Yes | Public identity, creator/channel surface, owner/public display | Supabase; visible to other users according to profile/channel visibility | Optional beyond basic account, but required for public profile/channel use | Covered by deletion/de-identification request | Enter user-provided profile/content data where applicable. |
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
| Notifications/reminders | `expo-notifications`, `notifications`, `event_reminders`; delivery proof pending | Partial / Proof Pending | Event/reminder surfaces and future push delivery | Expo/Firebase/APNs/FCM only if push delivery is enabled/configured | Optional; delivery not v1-proved | Account-linked reminders/notifications should be deleted/de-identified | Do not claim push delivery is live until proof exists; disclose if release enables it. |
| Location | No `expo-location`; no app location permission found; route touch coordinates are UI-only, not geographic location | No app-feature evidence | Not used by current product features | Unknown SDK/network-derived approximate location must be checked in provider docs | Not applicable unless SDKs collect it | Not applicable by app-feature truth | Do not select precise/approximate location based on repo feature evidence. Manually confirm SDK/network disclosures. |
| Contacts/address book | No contacts permission/package found | No repo evidence | Not used | None by app-feature truth | Not applicable | Not applicable | Do not select unless future feature adds it. |
| Health/fitness/financial payment card data | No repo evidence of direct collection; purchases are through app store/RevenueCat | No direct app collection evidence | Not used directly | Google Play/RevenueCat handle purchase processing | Not applicable for direct collection | Billing records may be retained externally | Do not claim direct card/financial account collection by app unless later built. |

## User-Generated Content Safety Readiness

Current repo-ready posture:

- Signup now presents Terms, Privacy Policy, and Community Guidelines acceptance copy with links before account creation.
- Community Guidelines route exists and covers creator uploads, profiles, Chi'lly Chat, Watch-Party rooms, Live Stage, reports, and enforcement.
- Copyright/DMCA route exists and explains takedown notice information, review, removal, counter-notice posture, repeat-infringer posture, and pending DMCA agent/legal approval.
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

## Manual Play Console Steps

1. In Play Console, open the Chi'llywood app for package `com.chillywood.mobile`.
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
| Privacy Policy | `https://live.chillywoodstream.com/privacy` | HTTP 200 during this audit | Proof Pending | Legal owner must approve final copy and enter URL in Play Console. |
| Terms of Service | `https://live.chillywoodstream.com/terms` | HTTP 200 during this audit | Proof Pending | Legal owner must approve final copy and enter URL wherever required. |
| Account Deletion | `https://live.chillywoodstream.com/account-deletion` | HTTP 200 during this audit | External Setup Pending | Confirm deletion process/SLA/backend runbook, then enter URL in Play Console account deletion section. |
| Community Guidelines | Bundled route `/community-guidelines` | App route exists; no external fallback env exists | External Setup Pending | Publish/confirm hosted URL if Play listing or web support needs a public link. |
| Copyright / DMCA | Bundled route `/copyright` | App route exists; no external fallback env exists | External Setup Pending | Publish/confirm hosted URL and final DMCA contact/process. |
| Support | `EXPO_PUBLIC_SUPPORT_EMAIL` and `/support` | Route exists; support email is env-driven | External Setup Pending | Confirm public support email/URL and support owner/SLA. |

## Completion Status

Done:

- Signup acceptance copy now links Terms, Privacy Policy, and Community Guidelines before account creation.
- Bundled legal routes exist for Privacy, Terms, Account Deletion, Community Guidelines, and Copyright/DMCA.
- Settings links to privacy, terms, community guidelines, copyright/DMCA, and account deletion.
- Support route provides account-deletion help and signed-in feedback handoff.
- Configured privacy, terms, and account-deletion fallback URLs returned HTTP 200 in this audit.
- Data Safety preparation categories are documented for manual Play Console entry.
- Draft UGC responsibility, platform moderation rights, user-content license, DMCA/copyright, repeat-infringer, limitation/disclaimer, and deletion-retention language is documented in-app and marked pending attorney/legal approval.

External Setup Pending:

- Final legal review and approval of Privacy, Terms, Community Guidelines, Copyright/DMCA, and account deletion copy.
- Final legal review and approval of signup acceptance wording.
- Final DMCA agent/contact process and any required designated-agent registration.
- Final public support email/URL and account deletion support process/SLA.
- Final backend deletion/de-identification and retention runbook.
- Play Console Data Safety form entry.
- Play Console account deletion URL entry.
- Public hosted URLs for Community Guidelines, Copyright/DMCA, and Support if required for listing/support.

Proof Pending:

- Signup legal-link route smoke on Android/release build.
- Android Settings legal/support/account deletion route smoke.
- Release build opens configured URLs correctly.
- Support/account deletion request lands in expected backend/support queue.
- Creator-video report/admin moderation proof for UGC safety readiness.
- Legal URLs remain reachable from a non-authenticated browser at release time.

## Exact Next Action

Legal/support owner should finalize the signup acceptance wording, account deletion process, DMCA agent/contact process, and public URL set, then manually complete Google Play Data Safety, UGC, copyright, and account deletion entries using this runbook. Engineering should not implement destructive account deletion until the backend deletion/de-identification and retention plan is explicitly approved.
