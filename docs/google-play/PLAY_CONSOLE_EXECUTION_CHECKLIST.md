# Google Play Console Execution Checklist

Date: 2026-05-30
Lane: Google Play Data Safety Account Deletion Acceptance Closeout
Status: App Content/listing saved; signed internal/closed draft uploads complete; Google review submission blocked by closed-testing requirements

This checklist is for the owner/operator completing Google Play Console. It records that App Content declarations and store listing assets/copy were saved in Play Console on June 1, 2026, and that signed EAS AAB uploads were completed for internal testing and closed alpha draft testing. It does not claim Google Play review acceptance, production release approval, legal approval, DKIM verification, account deletion fulfillment, or support staffing.

June 1, 2026 external acceptance tracker update: `docs/google-play/EXTERNAL_ACCEPTANCE_TRACKER.md` is the field-level execution tracker for App details, Store listing, Contact details, Privacy Policy, App access, Ads, Content Rating, Target audience, News declaration, Data Safety, Account deletion, UGC/moderation, financial features, permissions, app bundle upload, testing, reviewer instructions, and release notes. Proof lives at `/tmp/chillywood-google-play-external-acceptance-20260601/`, with Play Console screenshots in `/tmp/chillywood-google-play-external-acceptance-20260601/play-console-proof/`, and release/upload proof in `/tmp/chillywood-google-play-release-v14-20260601/`. Play Console App Content now shows no Need attention items and `10 actioned declarations`; saved/actioned sections include Data Safety, Content Rating, Target audience, App Access, Financial features, Health apps, Government apps, Advertising ID, Ads, and Privacy Policy. Contact details/category and the default store listing assets/copy were saved. Signed EAS v14 was submitted to internal testing and signed EAS v15 was submitted to closed alpha as a draft release. Production review remains blocked by Play closed-testing requirements: at least 12 opted-in testers and the required 14-day closed test. Current local repo AAB remains debug-signed and must not be uploaded.

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
| External acceptance tracker | `docs/google-play/EXTERNAL_ACCEPTANCE_TRACKER.md` |

## Console Checklist

| Item | Status | Play Console location | Exact evidence needed | Current repo evidence | Owner/operator action | Blocks public release |
| --- | --- | --- | --- | --- | --- | --- |
| App package | repo_ready | App dashboard / App integrity / Releases | Confirm package `com.chillywood.mobile` matches artifact and listing | `app.json`, Android manifest, fresh current-HEAD APK/AAB proof | Confirm in Play Console before release upload | Yes |
| Privacy Policy | saved_actioned, review_pending | Policy and programs > App content > Privacy Policy | Saved privacy URL screenshot | `https://chillywoodstream.com/privacy` returned HTTP 200; proof `play-console-proof/02-privacy-policy-saved.png` | Keep URL current; send changes for review only with owner approval | Yes |
| Data Safety | saved_actioned, review_pending | Policy and programs > App content > Data safety | Saved Data Safety screenshot/export | `DATA_SAFETY_EVIDENCE_MAP.md`; proof `play-console-proof/11-data-safety-saved.png` | Keep SDK/data answers current; send changes for review only with owner approval | Yes |
| Ads declaration | saved_actioned, review_pending | Policy and programs > App content > Ads | Saved answer screenshot | No active ad delivery; proof `play-console-proof/03-ads-saved.png` | Revisit if ads/paid placements are added | Yes |
| App access | saved_actioned, review_pending | Policy and programs > App content > App access | Reviewer instructions saved, test account entered only in Play Console | `REVIEWER_ACCESS_INSTRUCTIONS.md`; proof `play-console-proof/08-app-access-saved.png` | Keep credentials only in Play Console; never commit password | Yes |
| Target audience and content | saved_actioned, review_pending | Policy and programs > App content > Target audience and content | Saved questionnaire screenshot | Adult-oriented social streaming with UGC/live/chat; proof `play-console-proof/09-target-audience-saved.png` | Keep 18+ posture accurate | Yes |
| Content rating | saved_actioned, review_pending | Policy and programs > App content > Content rating | IARC ratings receipt | UGC/live/chat/video/report/purchase answers saved; proof `play-console-proof/10-content-rating-saved.png` | Revisit if content/payment posture changes | Yes |
| Account deletion | saved_actioned_via_data_safety, review_pending | Policy and programs > App content > Data deletion/account deletion | Saved web URL/data deletion proof | In-app Settings route and `https://chillywoodstream.com/account-deletion`; proof `play-console-proof/11-data-safety-saved.png` | Keep request-based process active; do not claim instant deletion | Yes |
| Store listing | saved, review_pending | Grow users > Store presence > Main store listing | Saved screenshots, feature graphic, icon, descriptions, contact fields | Store assets/copy saved from `/tmp/chillywood-google-play-release-v14-20260601/store-assets/` | Replace only if owner/legal wants different assets/copy; wait for review acceptance | Yes |
| App bundle/release | internal_submitted_closed_draft_submitted, production_blocked | Release > Testing/Production | Uploaded AAB, pre-launch report, release notes | EAS v14 internal submit `5ff5a508-b283-42ac-819f-7049681c126c`; EAS v15 closed alpha draft submit `aa048c3c-054d-46fc-9e2c-2887543ac7ce`; local Gradle build is debug-signed | Complete closed testing production-access requirements; do not upload local debug-signed AAB | Yes |
| Data collection declarations | repo_ready, external_required | Data Safety form | Owner/legal confirmed answers | Evidence map created | Confirm analytics/crash/push/billing/live/chat disclosures | Yes |
| Permissions review | repo_ready, external_required | App bundle review / App content if prompted | No unresolved sensitive permission declaration | Manifest has camera, mic, notifications, storage legacy entries from native generation | Explain camera/mic/live/selected-file upload use; remove any unnecessary native permissions in a separate native config lane if Play flags them | Yes if Play flags |
| UGC and moderation | repo_ready, external_required | App content / Policy review | Report/block/moderation policy evidence | Report flows, Admin Reports, DMCA, Profile media report/action, scanner proof | Confirm policy answers and moderation owner/SLA | Yes |
| Digital goods/billing | partial | Monetize / Products / App content / Payments policy | Play Billing setup and subscriptions if Premium ships | RevenueCat/Google setup exists but provider proof remains setup/sandbox; live money off | Keep paid digital goods inactive unless Google Play Billing/RevenueCat proof is complete | Yes for monetized launch |
| Support contact | repo_ready, external_required | Store settings / Main store listing | Saved support email/URL proof | `support@chillywoodstream.com`, support URL HTTP 200, MX/SPF/DMARC baseline | Confirm inbox owner and SLA; do not claim DKIM verified | Yes |
| Legal review | external_required | Outside Play Console | Attorney/legal approval receipt | Draft policies and public URLs are repo-ready | Owner/legal counsel signs off before broad launch | Yes |
| Closed testing | draft_uploaded, tester_duration_required | Release > Testing | Active track, testers, feedback path, app access | Closed alpha v15 draft uploaded through EAS | Add/confirm at least 12 opted-in testers and run required 14-day closed test before production review | Yes for public release track |

## Submission Order

1. Use the signed EAS artifacts for future upload work; do not use the local debug-signed Gradle AAB.
2. Enter Privacy Policy URL.
3. Review saved Data Safety/App Content changes in Publishing overview and send for review only with owner approval.
4. Keep saved store listing assets/descriptions current.
5. Complete closed testing production-access requirements with at least 12 opted-in testers and the required 14-day closed test.
6. Run pre-launch report and fix only actual blockers.
7. Save all external proof outside repo; update docs only with non-secret status.

## Current Blocker Status

June 1, 2026 API readiness check: Google Play API edit/read access is available through the external service-account credential at `/Users/loverslane/secrets/chillywood/revenuecat-google-play-service-account.json` and legacy ADC for `chillywood-revenuecat-play@chillywood-app.iam.gserviceaccount.com`; no credential values were printed or committed. The active user gcloud token still lacks Android Publisher scope, but the service-account path can create/read/delete edits. Internal track currently reports completed release `1.0.0` with versionCode `12`. Do not upload the current repo-built AAB because it is debug-signed; a prior non-debug signed candidate exists at `artifacts/google-play-proof/chillywood-v12.aab`. No upload, edit commit, track change, or tester change was performed. Do not commit service account JSON, OAuth tokens, keystores, or tester passwords.

P0 remains **closed-testing production access / Publishing overview / Google review acceptance / legal acceptance**. App Content/Data Safety/account-deletion URL/App Access/Content Rating/store listing are saved/actioned in Play Console, signed v14 internal and v15 closed alpha draft uploads are complete, but Google review acceptance is not complete. The repo-side execution package is ready.
