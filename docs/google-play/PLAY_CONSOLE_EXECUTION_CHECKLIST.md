# Google Play Console Execution Checklist

Date: 2026-05-30
Lane: Google Play Data Safety Account Deletion Acceptance Closeout
Status: repo-ready execution package; external Play Console submission still required

This checklist is for the owner/operator completing Google Play Console. It does not claim Google Play acceptance, Data Safety completion, content rating completion, legal approval, DKIM verification, account deletion fulfillment, or support staffing.

## Official References

- Data Safety form: https://support.google.com/googleplay/android-developer/answer/10787469
- Account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111
- App content page and ads declaration: https://support.google.com/googleplay/android-developer/answer/9859455
- User Generated Content policy: https://support.google.com/googleplay/android-developer/answer/16543315
- Sensitive permissions: https://support.google.com/googleplay/android-developer/answer/9888170
- Content rating questionnaire: https://support.google.com/googleplay/android-developer/answer/9859655
- Preview assets: https://support.google.com/googleplay/android-developer/answer/9866151
- Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738

## Proof Package

| Evidence | Path / result |
| --- | --- |
| Public URL check | `/tmp/chillywood-google-play-acceptance-closeout-20260530/public-url-check.tsv` |
| Android legal/account route proof | `/tmp/chillywood-google-play-acceptance-closeout-20260530/android/` |
| DNS/email check | `/tmp/chillywood-google-play-acceptance-closeout-20260530/dns-email-check.txt` |
| Earlier release/legal screenshots | `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/` |
| Malware scanner production proof | `/tmp/chillywood-malware-scanner-production-proof-20260530/` |
| Data Safety evidence map | `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md` |
| Field-by-field answers | `docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md` |
| Account deletion URL content | `docs/google-play/ACCOUNT_DELETION_URL_CONTENT.md` |
| Reviewer access instructions | `docs/google-play/REVIEWER_ACCESS_INSTRUCTIONS.md` |
| Reviewer test account packet | `docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md` |
| Content rating prep | `docs/google-play/CONTENT_RATING_QUESTIONNAIRE_PREP.md` |
| Release upload checklist | `docs/google-play/RELEASE_UPLOAD_CHECKLIST.md` |
| Store listing asset checklist | `docs/google-play/STORE_LISTING_ASSET_CHECKLIST.md` |

## Console Checklist

| Item | Status | Play Console location | Exact evidence needed | Current repo evidence | Owner/operator action | Blocks public release |
| --- | --- | --- | --- | --- | --- | --- |
| App package | repo_ready | App dashboard / App integrity / Releases | Confirm package `com.chillywood.mobile` matches artifact and listing | `app.json`, Android manifest, fresh current-HEAD APK/AAB proof | Confirm in Play Console before release upload | Yes |
| Privacy Policy | repo_ready, external_required | Policy and programs > App content > Privacy Policy | Accepted privacy URL screenshot | `https://chillywoodstream.com/privacy` returned HTTP 200; Android privacy route captured | Enter final approved URL after legal signoff | Yes |
| Data Safety | repo_ready, external_required | Policy and programs > App content > Data safety | Completed and accepted Data Safety form screenshot/export | `DATA_SAFETY_EVIDENCE_MAP.md` | Complete form using owner/legal confirmed data categories and SDK disclosures | Yes |
| Ads declaration | repo_ready, external_required | Policy and programs > App content > Ads | Saved answer screenshot | No AdMob/AD_ID permission found; ads/sponsor systems are scaffolded and default-disabled | Declare "No ads" only if owner confirms no active ad display in release; change if live ads are added | Yes |
| App access | repo_ready, external_required | Policy and programs > App content > App access | Reviewer instructions saved, test account entered only in Play Console | `REVIEWER_ACCESS_INSTRUCTIONS.md` | Provide safe non-admin test credentials in Play Console only | Yes |
| Target audience and content | repo_ready, external_required | Policy and programs > App content > Target audience and content | Saved questionnaire screenshot | App is adult-oriented social streaming with UGC/live/chat; signup has 18+ confirmation | Complete accurately; do not target children unless product/legal changes | Yes |
| Content rating | repo_ready, external_required | Policy and programs > App content > Content rating | IARC ratings receipt | UGC, live, chat, video, report/moderation policies documented | Complete questionnaire with owner/legal review | Yes |
| Account deletion | repo_ready, external_required | Policy and programs > App content > Data deletion/account deletion | Accepted web URL and in-app path answers | In-app Settings route and `https://chillywoodstream.com/account-deletion` returned HTTP 200 | Enter URL, confirm request-based deletion process and SLA | Yes |
| Store listing | partial | Grow users > Store presence > Main store listing | Final screenshots, feature graphic, icon, descriptions, contact fields | App icon exists; release screenshots exist outside repo; feature graphic missing as final asset | Upload approved assets and copy | Yes |
| App bundle/release | partial | Release > Testing/Production | Uploaded AAB, pre-launch report, release notes | Fresh current-HEAD local AAB/APK proof exists at `/tmp/chillywood-current-head-play-upload-proof-20260530/`; local Gradle build is debug-signed | Upload owner-approved Play-signed AAB to intended track and run review | Yes |
| Data collection declarations | repo_ready, external_required | Data Safety form | Owner/legal confirmed answers | Evidence map created | Confirm analytics/crash/push/billing/live/chat disclosures | Yes |
| Permissions review | repo_ready, external_required | App bundle review / App content if prompted | No unresolved sensitive permission declaration | Manifest has camera, mic, notifications, storage legacy entries from native generation | Explain camera/mic/live/selected-file upload use; remove any unnecessary native permissions in a separate native config lane if Play flags them | Yes if Play flags |
| UGC and moderation | repo_ready, external_required | App content / Policy review | Report/block/moderation policy evidence | Report flows, Admin Reports, DMCA, Profile media report/action, scanner proof | Confirm policy answers and moderation owner/SLA | Yes |
| Digital goods/billing | partial | Monetize / Products / App content / Payments policy | Play Billing setup and subscriptions if Premium ships | RevenueCat/Google setup exists but provider proof remains setup/sandbox; live money off | Keep paid digital goods inactive unless Google Play Billing/RevenueCat proof is complete | Yes for monetized launch |
| Support contact | repo_ready, external_required | Store settings / Main store listing | Saved support email/URL proof | `support@chillywoodstream.com`, support URL HTTP 200, MX/SPF/DMARC baseline | Confirm inbox owner and SLA; do not claim DKIM verified | Yes |
| Legal review | external_required | Outside Play Console | Attorney/legal approval receipt | Draft policies and public URLs are repo-ready | Owner/legal counsel signs off before broad launch | Yes |
| Closed testing | partial | Release > Testing | Active track, testers, feedback path, app access | Current Android proof exists | Upload release candidate and invite testers | Yes for public release track |

## Submission Order

1. Confirm final Play-upload-signed AAB artifact and package `com.chillywood.mobile`.
2. Enter Privacy Policy URL.
3. Complete Data Safety, including account deletion answers.
4. Complete app access reviewer instructions.
5. Complete ads, target audience, and content rating declarations.
6. Upload store listing assets and descriptions.
7. Upload AAB to closed testing or intended track.
8. Run pre-launch report and fix only actual blockers.
9. Save all external proof outside repo; update docs only with non-secret status.

## Current Blocker Status

June 1, 2026 API readiness check: Google Play API edit/read access is available through the external service-account credential at `/Users/loverslane/secrets/chillywood/revenuecat-google-play-service-account.json` and legacy ADC for `chillywood-revenuecat-play@chillywood-app.iam.gserviceaccount.com`; no credential values were printed or committed. The active user gcloud token still lacks Android Publisher scope, but the service-account path can create/read/delete edits. Internal track currently reports completed release `1.0.0` with versionCode `12`. Do not upload the current repo-built AAB because it is debug-signed; a prior non-debug signed candidate exists at `artifacts/google-play-proof/chillywood-v12.aab`. No upload, edit commit, track change, or tester change was performed. Do not commit service account JSON, OAuth tokens, keystores, or tester passwords.

P0 remains **external Play/Data Safety/account-deletion/legal acceptance** until Play Console accepts the entries and legal owner approves the claims. The repo-side execution package is ready.
