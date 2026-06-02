# Google Play External Acceptance Tracker

Date: 2026-06-01
Lane: Google Play External Acceptance Execution Closeout
Status: Play Console App Content saved/actioned; Google review acceptance and release upload remain external

This tracker is the current owner/operator checklist for Google Play acceptance. It now records Play Console saved/actioned proof for App Content, Data Safety, Content Rating, App Access, Privacy Policy, Ads, Advertising ID, Target audience, Health apps, Government apps, and Financial features. It does not claim Google review acceptance, production release approval, production Premium, or production monetization.

Proof folder: `/tmp/chillywood-google-play-external-acceptance-20260601/`
Play Console proof folder: `/tmp/chillywood-google-play-external-acceptance-20260601/play-console-proof/`

Current repo proof:

- `main` starts from pushed commit `54da5c8`.
- `R5CR120QCBF` has `com.chillywood.mobile` installed from Google Play with `installerPackageName=com.android.vending`, versionCode `13`, versionName `1.0.0`, and targetSdk `36`.
- `npm run validate:runtime` reports `revenueCatAndroidPublicKeyConfigured: true`.
- Premium reviewer/test posture is ready-but-closed: purchase shell remains closed by default, prior licensed-tester sandbox purchase/restore/webhook/backend entitlement/Platform Studio unlock/non-Premium denial proof governs, and no new purchase or shell-opening happened in this lane.
- Money Center remains readiness/setup-only with `live_money_enabled` off. Tickets/seats, tips, paid content, payouts, fake balances, and Stripe Android digital checkout remain off.
- Play Console App Content proof from June 1, 2026:
  - Need attention tab shows "You're all caught up": `play-console-proof/12-app-content-overview-after-data-safety.png`.
  - Actioned tab shows `10 actioned declarations`: `play-console-proof/13-app-content-actioned-after-data-safety.png` and `play-console-proof/14-app-content-actioned-lower.png`.
  - Data Safety saved and Play prompted that changes are ready for Publishing overview review: `play-console-proof/11-data-safety-saved.png`.
  - Earlier saved proofs in the same folder cover Privacy Policy, Ads, Advertising ID, Government apps, Health apps, Financial features, App Access, Target audience, and Content Rating.

## Acceptance Matrix

| Play Console section | Item | Current status | Evidence source | Exact owner action | Play Console location | Proof needed | Blocks closed testing? | Blocks production? | Final status after this lane |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| App details | App name | Repo-ready | `app.json`, `STORE_LISTING_ASSET_CHECKLIST.md` | Confirm spelling `Chi'llywood` | Dashboard / Store presence | Saved app details screenshot | Yes if unset | Yes | External owner action required |
| App details | Package | Repo-ready / Play-installed v13 proved | `app.json`, `android/app/build.gradle`, device proof in `/tmp` | Confirm package `com.chillywood.mobile` matches Play app | App dashboard / App integrity / Release artifact | Package/version proof | Yes | Yes | Repo proof captured; Console confirmation external |
| Store listing | Short/full description | Draft ready | `PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md`, `STORE_LISTING_ASSET_CHECKLIST.md` | Approve final copy and remove unproved claims | Store presence > Main store listing | Store listing screenshot | Yes | Yes | External owner/legal action required |
| Store listing | App icon | Partial | `assets/images/icon.png`, icon guard proof | Export/upload Play listing icon at required dimensions | Store presence > Main store listing | Asset upload proof | Yes | Yes | External asset action required |
| Store listing | Feature graphic | Missing | `STORE_LISTING_ASSET_CHECKLIST.md` | Create/upload approved 1024x500 graphic | Store presence > Main store listing | Asset upload proof | Yes | Yes | External asset action required |
| Store listing | Phone screenshots | Partial | Existing `/tmp` proof screenshots | Select sanitized store-ready screenshots | Store presence > Main store listing | Uploaded screenshots proof | Yes | Yes | External asset action required |
| Store listing | Tablet screenshots | Deferred unless targeting requires | `STORE_LISTING_ASSET_CHECKLIST.md` | Decide tablet targeting/assets | Store presence > Main store listing | Console proof or deferral note | No unless required | Possibly | External owner action required |
| Contact details | Email/support/website | Repo-ready, SLA external | Runtime config, public URL proof, DNS baseline docs | Confirm inbox owner/SLA and enter final fields | Store settings / Main store listing | Contact details screenshot | Yes if Play requires | Yes | External owner action required |
| Privacy Policy | Privacy URL | Saved/actioned in Play Console | `DATA_SAFETY_EVIDENCE_MAP.md`, URL proof from May 30, `play-console-proof/02-privacy-policy-saved.png` | Keep URL current and send changes for review from Publishing overview when owner approves | Policy and programs > App content > Privacy Policy | Saved URL screenshot | Yes | Yes | Saved/actioned; Google review acceptance pending |
| App access | Reviewer credentials/instructions | Saved/actioned in Play Console; password not in repo | `PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md`, `REVIEWER_ACCESS_INSTRUCTIONS.md`, `play-console-proof/08-app-access-saved.png` | Maintain safe non-admin credentials in Play Console only; do not commit password | Policy and programs > App content > App access | Saved instructions screenshot, password redacted if exported | Yes | Yes | Saved/actioned; Google review acceptance pending |
| Ads declaration | Contains ads | Saved/actioned as no ads | No active ad SDK/ad delivery by repo evidence; `play-console-proof/03-ads-saved.png` | Revisit only if ad SDK/ad delivery/paid placements are added | App content > Ads | Saved declaration screenshot | Yes | Yes | Saved/actioned; Google review acceptance pending |
| Content Rating | IARC questionnaire | Completed/saved in Play Console | `CONTENT_RATING_QUESTIONNAIRE_PREP.md`, `play-console-proof/10-content-rating-saved.png` | Keep answers accurate if UGC/live/chat/payment posture changes | App content > Content rating | IARC result/receipt screenshot | Yes | Yes | Saved/actioned; Google review acceptance pending |
| Target audience | Audience/content | Saved/actioned as 18+ | `PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md`, legal docs, `play-console-proof/09-target-audience-saved.png` | Keep adult/general posture; do not target children unless product/legal changes | App content > Target audience and content | Saved questionnaire proof | Yes | Yes | Saved/actioned; Google review acceptance pending |
| News declaration | News app | Prepared answer: no unless owner changes positioning | Field answers doc | Save accurate non-news answer | App content > News apps if shown | Saved answer screenshot | Yes if field appears | Yes | External owner action required |
| Data Safety | Data collection/share form | Completed/saved in Play Console | `DATA_SAFETY_EVIDENCE_MAP.md`, field answers doc, `play-console-proof/11-data-safety-saved.png` | Send saved changes for review from Publishing overview when owner approves; update if SDK/data posture changes | App content > Data safety | Saved Data Safety proof | Yes | Yes | Saved/actioned; Google review acceptance pending |
| Account deletion | Public URL and in-app path | Entered through Data Safety data deletion fields | `ACCOUNT_DELETION_URL_CONTENT.md`, May 30 URL/device proof, `play-console-proof/11-data-safety-saved.png` | Keep request-based deletion URL/process active; do not claim instant deletion | App content > Data deletion / Account deletion | Saved account deletion/data deletion proof | Yes | Yes | Saved/actioned inside Data Safety; Google review acceptance pending |
| UGC/moderation | UGC/report/block/moderation disclosure | Saved in Content Rating/Data Safety where prompted | Moderation docs, scanner proof, report/admin proof, content rating proof | Keep support/moderation SLA accurate | App content / Policy review prompts | Saved answers/proof | Yes | Yes | Saved/actioned where prompted; Google review acceptance pending |
| Financial features | In-app purchases | Sandbox Premium proof passed; production Premium not claimed; shell closed by default | Premium proof docs, Money Center policy, runtime validation | Declare purchases only if submitted artifact intentionally exposes Premium purchase/restore; otherwise keep reviewer copy locked/setup-only | Monetize / Products / App content / Payments policy prompts | Billing/product/shell proof | Yes if purchases exposed | Yes for monetized launch | Ready-but-closed; external approval required |
| Financial features | Tickets/seats/tips/paid content/payouts | Off/setup-only | Money Center policy and guards | Do not declare active. Keep off unless a later approved lane proves provider-backed launch | App content / Store listing / App UI claims | Money-off proof | No if not claimed | Yes if claimed | Closed/off |
| Permissions | Camera/mic/notifications/media | Prepared | `app.json`, native manifest, field answers doc | Explain live/camera/mic and user-selected media if Play prompts | App content / Release review prompts | Prompt response proof | Yes if prompted | Yes if prompted | External if Play prompts |
| App bundle upload | Signed AAB | Current local repo AAB is debug-signed; prior `artifacts/google-play-proof/chillywood-v12.aab` is non-debug-signed; Play-installed v13 already exists | `RELEASE_UPLOAD_CHECKLIST.md`, artifact hash/signing proof in `/tmp` | Do not upload debug-signed repo AAB. Use owner-approved Play/EAS signing or a specific signed AAB with explicit upload approval. | Release > Testing or Production | AAB upload accepted screenshot | Yes for new track/release | Yes | Upload not performed; external approval required |
| Closed/internal testing | Track/testers | Play-installed v13 proved on device; fresh API readback not completed here | Device proof and prior Play proof docs | Confirm tester list and install link in Play Console | Release > Testing > Internal/Closed testing | Track/tester proof | Yes for reviewer purchase tests | Yes for production rollout | External confirmation required |
| Reviewer instructions | Release/App access notes | Ready | Reviewer packet/instructions docs | Paste field-ready instructions; do not include passwords in repo | App access / Release notes | Saved notes proof | Yes | Yes | External owner action required |
| Release notes | Track notes | Template ready | `RELEASE_UPLOAD_CHECKLIST.md` | Enter accurate notes for submitted build only | Release > Track release | Release notes screenshot | Yes for release | Yes | External owner action required |

## Data Safety Execution Summary

The Data Safety form must not say "No data collected." Current repo evidence supports yes/conditional collection for account info, user ids, profile data, UGC, media uploads, chat/messaging if used, camera/microphone live participation, playback/activity data, reports/moderation data, support/account deletion requests, push/device identifiers where notifications are enabled, diagnostics/analytics where Firebase collection is enabled, security/IP context through providers, and purchase/subscription data if Premium purchase/restore is exposed to testers or users.

Final owner/legal confirmations still required:

- Firebase Analytics, Crashlytics, Performance, and Remote Config collection state for the uploaded build.
- RevenueCat/Google Play purchase-shell state for the submitted build.
- Search history storage posture.
- Support/account deletion SLA and retention wording.
- SDK/provider disclosure wording for Supabase, LiveKit, Firebase, RevenueCat, Google Play, Expo notifications, and malware scanning infrastructure.

## Content Rating Execution Summary

The questionnaire must account for UGC, public profiles, creator uploads, video content, chat/messaging, live camera/microphone participation, report/block/moderation flows, and current adult/general audience posture. Do not answer as child-directed. Do not claim active ads, active payouts, tips, tickets/seats, paid creator content, or live money.

## Account Deletion Execution Summary

Use:

- URL: `https://chillywoodstream.com/account-deletion`
- In-app path: Settings > Legal and Support > Account and Support > Account Deletion and Data Deletion Policy
- Wording: request-based deletion/de-identification with identity verification, support processing, and legal/safety/billing/moderation/copyright retention exceptions.

Do not claim instant or automatic deletion until staffing and backend process proof exist.

## AAB And Upload Status

- Current local repo AAB: `android/app/build/outputs/bundle/release/app-release.aab`, SHA-256 `57f8f8da17f21959ef7d3f4abb661fad5135757caa277d2b9a03ddec192ad199`, debug-signed with `CN=Android Debug`. Do not upload.
- Current local repo APK: `android/app/build/outputs/apk/release/app-release.apk`, SHA-256 `f56a393e541f8deef91a4adab8651f52efa38d35ceaae5522305b950313ec62c`.
- Prior signed candidate: `artifacts/google-play-proof/chillywood-v12.aab`, SHA-256 `e256d62de976fbf1b930e5c81cda921f2798ce55f0e4b421139f624e5d2956c1`, non-debug signer summary captured in the proof folder. This file is under untracked `artifacts/` and was not touched or committed.
- Device proof: `R5CR120QCBF` currently has Play-installed versionCode `13`.

No upload, Play edit commit, track mutation, production release submission, or tester mutation was performed in this lane.

## Final Status

Play Console App Content P0 is saved/actioned, and the Need attention tab is clear. P0 remains open for Publishing overview send-for-review/Google acceptance, final store listing assets, owner-approved signed AAB/release handling, and legal approval. Do not claim Google acceptance or production release approval until Play confirms it.
