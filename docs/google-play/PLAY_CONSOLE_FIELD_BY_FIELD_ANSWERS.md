# Google Play Console Field-By-Field Answers

Date: 2026-05-30
Lane: Google Play Console Field By Field Completion Assistant
Status: operator packet prepared; Play Console submission remains external

This document tells the owner/operator what to enter in Google Play Console based on current repo evidence. It does not claim Play Console submission, Data Safety completion, content-rating completion, account-deletion acceptance, legal approval, DKIM verification, support staffing, or store listing acceptance.

## Official References

- Data Safety form: https://support.google.com/googleplay/android-developer/answer/10787469
- Account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111
- App content, ads, app access, and target audience: https://support.google.com/googleplay/android-developer/answer/9859455
- Login credentials for app access: https://support.google.com/googleplay/android-developer/answer/15748846
- Content rating: https://support.google.com/googleplay/android-developer/answer/9859655
- Preview assets: https://support.google.com/googleplay/android-developer/answer/9866151
- Sensitive permissions and APIs: https://support.google.com/googleplay/android-developer/answer/16558241
- Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738
- App signing and bundle upload context: https://support.google.com/googleplay/android-developer/answer/9842756

## Evidence Package

| Evidence | Path / value |
| --- | --- |
| Play execution checklist | `docs/google-play/PLAY_CONSOLE_EXECUTION_CHECKLIST.md` |
| Data Safety source map | `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md` |
| Account deletion URL packet | `docs/google-play/ACCOUNT_DELETION_URL_CONTENT.md` |
| Reviewer instructions source | `docs/google-play/REVIEWER_ACCESS_INSTRUCTIONS.md` |
| Store listing asset source | `docs/google-play/STORE_LISTING_ASSET_CHECKLIST.md` |
| Public URL proof | `/tmp/chillywood-google-play-acceptance-closeout-20260530/public-url-check.tsv` |
| Android legal/account proof | `/tmp/chillywood-google-play-acceptance-closeout-20260530/android/` |
| Malware scanner production proof | `/tmp/chillywood-malware-scanner-production-proof-20260530/` |
| DNS/email proof | `/tmp/chillywood-google-play-acceptance-closeout-20260530/dns-email-check.txt` |
| App package | `com.chillywood.mobile` from `app.json` and `android/app/build.gradle` |
| Runtime version | `1.0.0` from `app.json` and runtime validation |
| Android versionCode/versionName | `versionCode 8`, `versionName "1.0.0"` from `android/app/build.gradle` |

## Console Field Answers

| Console section | Field / question | Recommended answer | Evidence | Confidence | Owner action | Screenshot / proof needed | Legal review | Blocks submission |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| App details | App name | `Chi'llywood` | `app.json`, store checklist | High | Confirm exact spelling in Play Console | Play app dashboard screenshot | Brand/legal confirmation recommended | Yes |
| App details | Default language | English (United States) unless owner chooses another default | App/legal docs are English | High | Select final default locale | Console screenshot | No | Yes |
| App details | App or game | App | Product is streaming/social app, not a game | High | Select App | Console screenshot | No | Yes |
| App details | Free or paid | Free app, unless owner changes commercial model | Current monetization is subscription/setup, not paid app purchase | Medium | Confirm final price model | Console screenshot | Yes if monetized | Yes |
| App details | Package name | `com.chillywood.mobile` | `app.json`, `android/app/build.gradle` | High | Confirm uploaded artifact package matches | Release artifact proof | No | Yes |
| Store listing | Short description | Draft: `Upload, watch together, go live, and build your creator Platform.` | `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md` | Medium | Owner/legal approve final copy and Play length | Store listing screenshot | Yes | Yes |
| Store listing | Full description | Use the draft in `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md`, with no claims about live payouts, ads, free copyrighted content, fake creator stats, or unproved features | Store listing runbook | Medium | Owner/legal approve final text | Store listing screenshot | Yes | Yes |
| Store listing | Category | Entertainment recommended; Social is alternate if owner chooses community positioning | Store listing checklist and runbook | Medium | Choose final category | Console screenshot | No | Yes |
| Store listing | Tags | Suggested review list: streaming, video, creators, social, entertainment, live, chat, watch party where Play supports them | Store listing runbook | Medium | Use only accurate Play-supported tags | Console screenshot | No | No unless Play requires |
| Store listing | App icon | Upload verified 512x512 Play listing icon exported from approved app icon | `assets/images/icon.png`, store checklist | Medium | Export/verify Play-specific icon | Asset upload proof | Brand review | Yes |
| Store listing | Feature graphic | Missing. Create 1024x500 JPEG or 24-bit PNG, no alpha, from approved brand art | Store checklist | High | Create/upload final graphic | Asset upload proof | Brand/legal copy review | Yes |
| Store listing | Phone screenshots | Use clean release screenshots with no private email, admin data, tokens, raw paths, or unapproved user content | Store checklist; proof screenshots in `/tmp` are evidence but not necessarily store-ready | Medium | Capture/select final store screenshots | Uploaded screenshot proof | Legal/content review | Yes |
| Store listing | Tablet screenshots | Deferred unless Play/device targeting requires them | Store checklist | Medium | Decide Android tablet posture | Console screenshot if used | No | No unless targeting/tablet policy requires |
| Store listing | Release notes | Use only actual current release changes; avoid fake proof or unshipped features | Store checklist | Medium | Enter track-specific release notes | Release page screenshot | No | Yes for release |
| Contact details | Contact email | `support@chillywoodstream.com` | Runtime config, public docs, DNS proof | High | Enter and confirm inbox owner/SLA | Console screenshot | Ops owner required | Yes |
| Contact details | Website | `https://chillywoodstream.com` if owner wants public website field | Public legal site proof | Medium | Confirm final website URL | URL proof | Legal review if marketing copy present | No unless Play requires |
| Contact details | Support URL | `https://chillywoodstream.com/support` | Public URL proof returned HTTP 200 | High | Enter if Play field is available | URL proof | Support SLA owner required | Yes if requested |
| Privacy policy | Privacy Policy URL | `https://chillywoodstream.com/privacy` | URL proof HTTP 200; Android route proof | High | Enter final legal-approved URL | Console screenshot | Yes | Yes |
| App access | Are all or parts restricted by login? | Yes. Public browsing exists, but signed-in account features require login. | Auth routes, reviewer instructions | High | Add app access instructions and test account credentials only in Play Console | App Access saved screenshot | No | Yes |
| App access | Login credentials | Use `docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md`; enter real email/password only in Play Console | Reviewer packet | High | Create stable non-admin test account with no 2FA blocker | Console screenshot, no password in repo | No | Yes |
| Ads | Does the app contain ads? | Recommended: No, only if owner confirms no active ad delivery, no ad SDK, and no paid placements in the submitted build | No ad SDK/AD_ID found; sponsor/ad systems scaffolded disabled | Medium | Owner confirms final build state before saving | Ads declaration screenshot | Yes if sponsorship copy changes | Yes |
| Content rating | Complete questionnaire | Do not self-assign a rating. Use `CONTENT_RATING_QUESTIONNAIRE_PREP.md` and answer UGC/live/chat/upload questions accurately. | Legal runbook and content-rating prep | Medium | Owner completes IARC questionnaire | Rating receipt/screenshot | Yes | Yes |
| Target audience | Target age group | Adult/general audience; current policy says 18+. Do not target children unless product/legal changes. | Legal policies and runbook | Medium | Select target ages with legal review; evaluate Restrict Minor Access if offered | Console screenshot | Yes | Yes |
| News apps | Is this a news app? | No, unless owner changes positioning. Current app is social streaming/creator video, not a news publisher. | Product docs | High | Save No if accurate | Console screenshot | No | Yes if field appears |
| Data Safety | Does the app collect or share user data? | Yes, data is collected. Do not answer "No data collected." | Data Safety evidence map | High | Complete detailed form below | Submitted form proof | Yes | Yes |
| Data Safety | Encryption in transit | Recommended yes for app-server/provider network traffic, but owner must confirm all release endpoints and SDK behavior | HTTPS Supabase/functions/legal URLs; LiveKit WSS | Medium | Confirm no insecure release endpoints | Data Safety screenshot | Security/legal confirmation | Yes |
| Data Safety | Data deletion mechanism | Yes, request-based deletion path exists in app and on web. Do not claim automatic deletion. | Account deletion URL packet and Android proof | High | Enter web URL and in-app path | Data deletion screenshot | Yes | Yes |
| Account deletion | Web URL | `https://chillywoodstream.com/account-deletion` | URL proof HTTP 200 | High | Enter URL and save external proof | Console screenshot | Yes | Yes |
| Account deletion | In-app path | Settings > Legal and Support > Account and Support > Open Account Deletion Policy / Account Deletion and Data Deletion Policy | Android proof and settings code | High | Enter path in Play Console | Screenshot from device | Yes | Yes |
| Account deletion | Deletion type | Request-based deletion/de-identification with identity verification and legal/safety/billing/moderation retention exceptions | Account deletion packet | High | Do not claim instant/automatic deletion | Console screenshot | Yes | Yes |
| UGC / moderation | Does the app have UGC? | Yes: profiles, posts, comments, replies, creator videos, attachments, chat, live/rooms, reports | Legal runbook and app routes | High | Answer UGC questions accurately | App content screenshot | Yes | Yes |
| UGC / moderation | Report/block/moderation | Report flows, Admin Reports, Profile media report/actions, DMCA intake, malware scanner, and block/profile actions exist where backed | Moderation workflow docs | High | Confirm ops owner/SLA; do not claim impossible automated review | Evidence screenshot | Yes | Yes |
| Financial / purchases | In-app purchases | Yes if Premium/RevenueCat/Google Play purchase flow ships enabled; otherwise do not promote paid digital goods | RevenueCat/Google docs, runtime validation shows Android public key not currently configured in local runtime | Medium | Owner confirms final build/provider state before declaring | Console billing proof | Yes if monetized | Yes if monetized |
| Financial / payouts | Creator payouts/live money | Not active. Do not claim payouts, earnings, cash-out, tips, seats, ads revenue, or paid creator sales are live. | Money Center policy and guards | High | Keep live money off | Money guard proof | Yes | Yes if claims appear |
| Permissions | Camera | Used for live/camera room participation where user grants access | `app.json`, Android manifest, LiveKit routes | High | Explain camera use if Play prompts | Permissions declaration proof | No | Yes if prompted |
| Permissions | Microphone | Used for live/audio room participation where user grants access | `app.json`, Android manifest, LiveKit routes | High | Explain microphone use if Play prompts | Permissions declaration proof | No | Yes if prompted |
| Permissions | Notifications | Used for push notifications/reminders where user grants permission | `app.json`, Android manifest, notification helpers | High | Explain notification purpose if Play prompts | Permissions declaration proof | No | Yes if prompted |
| Permissions | Storage/media access | Current native manifest has legacy read/write storage permissions from generated Android project; selected media/files are used for uploads/attachments | Android manifest, picker packages | Medium | Be ready to explain selected-file upload; consider separate native permission cleanup if Play flags legacy permissions | Play warning screenshot if any | No | Yes if Play blocks |
| Release | App bundle upload | Fresh current-HEAD local AAB proof exists, but the local Gradle release is debug-signed. Use owner-approved Play upload signing or corrected release signing before upload. | `android/app/build/outputs/bundle/release/app-release.aab`, `/tmp/chillywood-current-head-play-upload-proof-20260530/`, release checklist | High | Confirm Play upload signing path, then upload signed AAB to closed testing first | AAB upload/pre-launch proof | No | Yes |
| Closed testing | Track | Closed testing recommended before broader public track | Public V1 blocker map | High | Upload AAB to closed testing, add testers, run pre-launch report | Track screenshot | No | Yes before public |
| Reviewer instructions | Review notes | Use `PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md` and note live money/payouts/ads are off/setup-only | Reviewer packet | High | Paste into App Access and release notes where relevant | Console screenshot | No | Yes |

## Data Safety Field Answers

These are suggested answers for the form. The owner/legal operator must confirm final SDK/provider behavior before submission.

| Data category | Collected? | Shared? | Purpose | Required / optional | Retention / deletion | Security note | Evidence | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Email address | Yes | Service-provider processing; disclose as shared only if Play/provider/legal interpretation requires | Account management, login, support, security | Required for account features | Request-based deletion/de-identification with retention exceptions | Supabase Auth over HTTPS | Supabase Auth, settings/support docs | High |
| User IDs | Yes | Service-provider processing; public display only where designed | App functionality, account linking, security, support | Required for signed-in features | Request-based deletion/de-identification with audit/legal retention | RLS and server-side checks | `_lib/userData.ts`, Supabase docs | High |
| Username/display name | Yes | Visible to other users when public; service providers | Public Profile/Platform identity, app functionality | Optional beyond basic account | Can be changed/de-identified subject to legal/safety retention | Public-safe reads mask private data | Profile docs/code | High |
| Profile photo/background | Yes if user uploads | Visible publicly only when active/public-safe; service providers | Profile personalization, app functionality | Optional | `active` renders; `user_removed`, `flagged`, `admin_removed` masked publicly | Malware/status gates and public masking | Profile media status policy docs | High |
| Bio/profile data | Yes if user provides | Public where user chooses public profile visibility; service providers | Profile identity, social discovery | Optional | Request-based deletion/de-identification | RLS/public RPC boundaries | Profile docs/code | Medium |
| Posts/comments/replies | Yes if user posts | Public/participants depending surface; service providers | UGC/social engagement, moderation | Optional | Delete/hide/request-based deletion subject to retention | Moderation and RLS gates | Profile social docs/code | High |
| Creator videos/uploads | Yes if user uploads | Public only after publish/public-safe gates; service providers | Creator Platform content, Player playback | Optional | Unpublish/delete/request-based deletion with legal/moderation retention | Scan/status/public-safe gates | Creator media and scanner docs | High |
| Photos/videos/files/attachments | Yes when selected/uploaded | Public only where user posts/publishes; service providers | Profile posts, creator uploads, evidence/support where used | Optional | Owner removal/deletion request where backed; legal evidence may be retained | MIME/size/scan/status gates where configured | Picker packages, scanner docs | High |
| Chi'lly Chat messages | Yes if used | Chat participants and service providers; legal/moderation where required | Messaging and safety | Optional | Deletion subject to recipient context and safety/legal retention | RLS/thread membership checks | Chat docs/code | Medium |
| Camera/microphone live participation | Conditional when user grants access and joins live/room features | LiveKit/participants as real-time media service | Live Stage, Watch-Party Live, calls/communication | Optional | No repo claim of retained live recordings unless future feature adds it | LiveKit token/permission guards | App permissions, LiveKit docs/routes | High |
| Playback progress/watch history | Yes/conditional | Service providers | Continue watching, app functionality, personalization | Mixed | Request-based deletion/de-identification where account-linked | RLS/account ownership | User data/playback docs | Medium |
| Search/recent search | Conditional | Service providers only if stored | App functionality, search quality | Optional | Recent Admin search is session-local; public search storage needs owner confirmation | Do not disclose private query content publicly | Search docs/code | Needs owner confirmation |
| Reports/moderation data | Yes when submitted/reviewed | Operators/service providers/legal where required | Safety, compliance, moderation | Optional unless reporting | May be retained for safety/legal/audit even after account deletion | Admin-only read models/audit logs | Moderation workflow docs | High |
| Support/account deletion requests | Yes if submitted | Support operators/service providers/legal where required | Support, account management, compliance | Optional unless requesting help/deletion | Request records may be retained for legal/security/audit | Support workflow, no secrets in docs | Account/legal runbooks | High |
| Purchase/subscription history | Conditional if Premium ships | Google Play/RevenueCat/service providers | Premium entitlement, purchase restore, fraud/accounting | Optional purchase flow | Financial/legal records may be retained | Store/provider controls | RevenueCat/Google docs | Needs owner confirmation |
| Push token/device IDs | Conditional if notifications enabled | Expo/Firebase/Google service providers | Notifications, app functionality, diagnostics | Optional user permission/required for notifications | Revoke/delete where backed in account deletion process | Token not shown publicly | Notification docs/code | Medium |
| Crash/performance diagnostics | Yes if Firebase collection enabled in release | Firebase/Google service provider | Diagnostics, crash reporting, performance | Generally required for app quality if enabled | Provider/project retention plus deletion/de-identification where possible | Do not log secrets/tokens | Firebase packages/config | Needs owner confirmation |
| Analytics/app activity | Yes if Firebase Analytics enabled | Firebase/Google service provider | Analytics, product quality, app functionality | Conditional | Provider/project retention plus deletion/de-identification where possible | Avoid sensitive event payloads | Firebase analytics helpers | Needs owner confirmation |
| Approximate location/IP/security context | Conditional through network/security/provider logs, not app location feature | Service providers/security/legal where required | Security, fraud prevention, compliance | Required for security where recorded | Restricted retention and no public raw IP display | Hashed/masked security context where backed | Security context docs | Needs owner/legal confirmation |
| Contacts/address book | No repo feature evidence | No | Not used | Not applicable | Not applicable | No contacts permission/package found | Package/manifest audit | Medium |
| Precise location | No repo feature evidence | No | Not used | Not applicable | Not applicable | No location permission/package found | Package/manifest audit | Medium |
| Health/fitness/SMS/call logs | No repo feature evidence | No | Not used | Not applicable | Not applicable | No feature owner found | Package/manifest audit | Medium |

## Account Deletion Field Copy

| Play field | Field-ready answer |
| --- | --- |
| Account deletion URL | `https://chillywoodstream.com/account-deletion` |
| In-app path | Settings > Legal and Support > Account and Support > Open Account Deletion Policy. The page is titled Account Deletion and Data Deletion Policy. |
| Can users request deletion outside the app? | Yes. Users can email `support@chillywoodstream.com` from the email associated with their account or use the public account deletion page. |
| Is deletion automatic? | No. Current flow is request-based with identity verification and manual/ops processing. |
| What data is deleted/de-identified? | Account profile identity, public profile fields, Profile media, account-linked app activity, push tokens/device records, posts/comments/uploads/attachments/creator content where legally and technically permitted. |
| What may be retained? | Records needed for security, fraud prevention, abuse prevention, moderation, legal compliance, copyright/DMCA handling, tax/billing/payment disputes, chargebacks, audit logs, backups, and safety investigations. |
| Processing time | Owner/legal must set final SLA. Current docs must not claim instant or automatic deletion. |
| Support contact | `support@chillywoodstream.com` |

## Consistency Check Findings

| Finding | Impact | Required action |
| --- | --- | --- |
| Privacy/legal policy source still contains some historical creator-surface wording from the older product model. | Play listing and app copy now use "Platform"; legal text should be reviewed so user-facing public policy terminology matches current product language before submission. | Owner/legal approves terminology cleanup in `legal/policies.mjs` or explicitly accepts legacy policy wording. |
| Data Safety evidence says Firebase analytics/diagnostics may be active, but final collection settings are not externally proved in this lane. | Incorrect Data Safety answers could cause Play rejection or policy issue. | Owner confirms Firebase Analytics, Crashlytics, Performance, and Remote Config collection state for the submitted build. |
| Fresh current-HEAD local AAB is debug-signed. | Uploading a build signed with the wrong certificate can fail Play upload or mismatch the Play app signing setup. | Use EAS production/Play upload signing or a corrected release signing config unless owner confirms the current certificate is accepted. |
| Support direct deep link did not resolve in the May 30 Android proof, though public support URL returned HTTP 200 and earlier support proof exists. | Reviewer may need clear Settings path and support URL. | Use Settings > Legal and Support path in reviewer instructions; recapture Support route in next release smoke. |
| Ads systems are scaffolded/admin-visible as disabled, but final release configuration remains owner-confirmed. | Ads declaration must be exact. | Select "No ads" only if the submitted build still has no ad SDK/ad delivery/paid placement. |
| Account deletion SLA is not staffed/approved in repo. | Account deletion answer must avoid guaranteed timing unless the owner commits ops staffing. | Owner/legal sets public SLA and support owner before broad launch. |
| DKIM remains unverified externally. | Support email can receive via MX/SPF/DMARC baseline, but outbound legal/support reliability is not fully proved. | Complete outbound provider/DKIM setup if owner requires it before launch. |

## Owner Confirmation Checklist

- Confirm final Play app name and category.
- Approve or revise short/full description.
- Provide final feature graphic and sanitized screenshots.
- Create a stable non-admin reviewer account and enter credentials only in Play Console.
- Confirm final Ads answer.
- Confirm Firebase/RevenueCat/Google Play SDK collection and provider disclosures.
- Confirm whether Premium purchase flow ships enabled in the uploaded artifact.
- Complete Content Rating and Target Audience with legal review.
- Enter account deletion URL and request-based wording.
- Save all Play Console acceptance proof outside repo and update docs only with non-secret status.

## Remaining P0

P0 remains external until Google Play Console accepts Data Safety, account deletion, app content declarations, content rating, store listing/release entries, and owner/legal approves the legal and operational claims.
