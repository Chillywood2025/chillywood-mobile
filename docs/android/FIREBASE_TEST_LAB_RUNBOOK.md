# Firebase Test Lab Android Smoke Runbook

## Current Proof

Status: repo-side Test Lab smoke setup is complete. A prior bounded virtual-device Robo proof passed on 2026-05-30. The 2026-06-05 IAM follow-up cleared the Test Lab catalog authorization blocker with an owner-approved Google user account and completed one bounded virtual-device Robo smoke.

- Proof folder: `/tmp/chillywood-firebase-test-lab-proof-20260530/`
- Google Cloud SDK: installed locally; active project was `chillywood-app`
- Firebase CLI: installed locally
- Enabled APIs observed: `firebase.googleapis.com`, `testing.googleapis.com`
- Billing/quota status: not verified in this lane. The local `gcloud beta billing` command required installing the beta component, and no billing setup or paid-capacity change was made.
- Release build command: `cd android && ./gradlew assembleRelease bundleRelease`
- APK: `android/app/build/outputs/apk/release/app-release.apk`
- APK size: `196M`
- APK SHA-256: `94a5154c5ab894d57ce03009115a6e86ff2888d750d7d7b9423c2df217b82e5e`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- AAB size: `126M`
- AAB SHA-256: `e90211578a50521cdec71b58e9ef379aa1ae636e061282986f94e537b1d1b41b`
- Package: `com.chillywood.mobile`
- Version: `versionName 1.0.0`, `versionCode 8`

Test Lab run:

```bash
gcloud firebase test android run \
  --type robo \
  --app android/app/build/outputs/apk/release/app-release.apk \
  --device model=MediumPhone.arm,version=35,locale=en,orientation=portrait \
  --timeout 5m \
  --results-dir chillywood-smoke-20260530-185453
```

Result:

- Matrix: `matrix-xfre4x5gqc47a`
- Axis: `MediumPhone.arm-35-en-portrait`
- Outcome: `Passed`
- Test time: `308 seconds`
- Firebase Console: `https://console.firebase.google.com/project/chillywood-app/testlab/histories/bh.e9371a121da8f5fe/matrices/6982988100476756190`
- Raw results bucket path: `gs://test-lab-nt3ctukisd678-ykr9mdfzvpc9x/chillywood-smoke-20260530-185453/`
- Downloaded results: `/tmp/chillywood-firebase-test-lab-proof-20260530/results/MediumPhone.arm-35-en-portrait/`
- Downloaded artifacts include `actions.json`, screenshots, `logcat`, `video.mp4`, `robo_results.pb`, `baseline_profile.txt`, and `sitemap.png`.
- Logcat fatal scan: no Chi'llwood app fatal exception or ANR was found. `AndroidRuntime` lines in the scan are system command wrappers and teardown.

Scope proved:

- Cloud install/open smoke on a Firebase Test Lab virtual Android device.
- Release APK starts under Test Lab Robo and exposes the signed-out auth/login surface.
- A short Robo crawl can collect screenshots, logcat, video, and action traces.

Scope not proved:

- Signed-in route coverage.
- Home / Explore / Live / Library / Profile route coverage under a signed-in account.
- LiveKit multi-user, TURN, cellular, reconnect, real microphone/camera, Watch-Party capacity, or heat/battery behavior.
- Google Play acceptance or Play pre-launch report acceptance.
- Physical Test Lab device coverage.

## 2026-06-05 Authorization Blocker

Proof folder:

```text
/tmp/chillywood-firebase-test-lab-proof-20260605/
```

What passed:

- Release APK build completed successfully with `./gradlew assembleRelease bundleRelease`.
- Current APK path: `android/app/build/outputs/apk/release/app-release.apk`.
- APK SHA-256: `c62b6b14a82d0691f86774b094a2fd410cd77cbe38bea1dc0f67679685a97b87`.
- Firebase and Test Lab APIs were visible as enabled for project `chillywood-app`.

What blocked:

- `gcloud firebase test android models list` and `gcloud firebase test android versions list` returned a project authorization error.
- The bounded Robo run also failed before creating a test matrix with: `ResponseError 403: Not authorized for project chillywood-app`.
- No Firebase Test Lab device run started, no route smoke was executed, and no Test Lab quota was intentionally consumed by the failed authorization attempt.

Cause:

- The active `gcloud` account during the attempt was not authorized to access the Firebase Test Lab environment catalog for project `chillywood-app`.

Fix needed before rerun:

1. Authenticate `gcloud` with an owner-approved Google account that has Firebase Test Lab access for `chillywood-app`, or grant the current automation account the minimum owner-approved Test Lab/project permissions.
2. Do not commit credentials, service-account JSON, refresh tokens, passwords, or owner account details.
3. Rerun `npm run firebase:test-lab:preflight`. The preflight now fails fast if catalog access is still blocked.
4. Only after preflight succeeds, run one bounded cloud smoke with `npm run firebase:test-lab:robo` or `npm run firebase:test-lab:build-robo`.

## 2026-06-05 IAM Smoke Proof

Proof folder:

```text
/tmp/chillywood-firebase-test-lab-iam-smoke-proof-20260605/
```

IAM result:

- The Google Play service account could describe project `chillywood-app`, but still failed Firebase Test Lab model catalog access.
- Switching to the already-authenticated owner-approved Google user account cleared the catalog blocker.
- `gcloud projects describe chillywood-app` succeeded.
- `npm run firebase:test-lab:preflight` succeeded and wrote available virtual models, Android versions, enabled Firebase/Test Lab APIs, APK hash, and the exact bounded command.
- No secrets, OAuth tokens, service-account JSON, keystores, passwords, or API keys were committed.

Bounded smoke command:

```bash
FIREBASE_TEST_LAB_PROOF_DIR=/tmp/chillywood-firebase-test-lab-iam-smoke-proof-20260605 \
FIREBASE_TEST_LAB_RESULTS_DIR=chillywood-iam-smoke-20260605-113243 \
npm run firebase:test-lab:build-robo
```

Result:

- APK build: passed with `./gradlew assembleRelease bundleRelease`.
- APK: `android/app/build/outputs/apk/release/app-release.apk`.
- APK SHA-256: `c62b6b14a82d0691f86774b094a2fd410cd77cbe38bea1dc0f67679685a97b87`.
- Matrix: `matrix-pcl66znev5dca`.
- Axis: `MediumPhone.arm-35-en-portrait`.
- Outcome: `Passed`.
- Test time: `306 seconds`.
- Firebase Console: `https://console.firebase.google.com/project/chillywood-app/testlab/histories/bh.e9371a121da8f5fe/matrices/8784351659501891083`.
- Raw results bucket path: `gs://test-lab-nt3ctukisd678-ykr9mdfzvpc9x/chillywood-iam-smoke-20260605-113243/`.
- Downloaded results: `/tmp/chillywood-firebase-test-lab-iam-smoke-proof-20260605/results/MediumPhone.arm-35-en-portrait/`.
- Downloaded artifacts include `actions.json`, screenshots, `logcat`, `video.mp4`, `robo_results.pb`, `baseline_profile.txt`, and `sitemap.png`.
- Logcat fatal scan found no Chi'llwood app fatal exception or ANR. `AndroidRuntime` lines in the scan were Android command-wrapper process starts/exits.

Scope proved:

- Owner-approved account can access `chillywood-app` and Firebase Test Lab virtual-device catalogs.
- Test Lab can upload the current release APK.
- Test Lab creates and completes a one-device virtual Robo matrix.
- The app installs and launches in Test Lab without a startup crash.
- Test Lab screenshots, video, action trace, sitemap, and logcat are available for inspection.

Scope not proved:

- Signed-in route coverage.
- LiveKit two-session host/viewer behavior.
- Google Play purchase, RevenueCat purchase/restore, Stripe Checkout, Stripe Connect, Owner/Admin drilldown, or Money Center final proof.
- Play internal install proof; this cloud run uses a locally built release APK uploaded to Test Lab.

## 2026-06-05 Robo Artifact Review And Fix Rerun

Artifact review doc:

```text
docs/android/FIREBASE_TEST_LAB_ARTIFACT_REVIEW.md
```

Proof folder:

```text
/tmp/chillywood-firebase-test-lab-artifact-review-fix-proof-20260605/
```

Reviewed matrix:

- Matrix: `matrix-pcl66znev5dca`.
- Axis: `MediumPhone.arm-35-en-portrait`.
- Outcome: `Passed`.
- Reviewed artifacts: screenshots, `video.mp4`, `actions.json`, `sitemap.png`, `robo_results.pb`, and `logcat`.

Artifact review result:

- No Chi'llwood fatal exception, ANR, blank screen, broken route, unsafe money copy, production purchase button, payout/cash-out button, Stripe Android digital checkout, LiveKit issue, or route-ownership issue was found.
- `AndroidRuntime` matches were Android command-wrapper process starts/exits, not app crashes.
- Robo covered signed-out auth and legal pages only; that is expected for a bounded generic Robo smoke.
- Two low-severity real UI/accessibility issues were confirmed and fixed: dark signup placeholders and low-contrast light-theme legal TOC chip text.

Rerun result:

- Preflight: passed.
- Command: `FIREBASE_TEST_LAB_PROOF_DIR=/tmp/chillywood-firebase-test-lab-artifact-review-fix-proof-20260605 FIREBASE_TEST_LAB_RESULTS_DIR=chillywood-artifact-review-fix-20260605-115352 npm run firebase:test-lab:build-robo`.
- APK build: passed.
- APK SHA-256: `527f803a38cab78fa440020e68d0ef827b7d4cb7b6083e79a7ecb46fe3532d24`.
- Matrix: `matrix-1ovvi4nwvs469`.
- Axis: `MediumPhone.arm-35-en-portrait`.
- Outcome: `Passed`.
- Test time: `306 seconds`.
- Firebase Console: `https://console.firebase.google.com/project/chillywood-app/testlab/histories/bh.e9371a121da8f5fe/matrices/7065165681326020512`.
- Raw results bucket: `gs://test-lab-nt3ctukisd678-ykr9mdfzvpc9x/chillywood-artifact-review-fix-20260605-115352/`.
- Downloaded results: `/tmp/chillywood-firebase-test-lab-artifact-review-fix-proof-20260605/results/MediumPhone.arm-35-en-portrait/`.
- Crash scan: no Chi'llwood fatal exception, ANR, TypeError, ReferenceError, or invariant violation.

Scope remains bounded. This rerun proves cloud APK build/upload/install/launch smoke after the confirmed UI fixes. It does not prove signed-in routes, LiveKit two-session behavior, Google Play purchases, RevenueCat restore, Stripe Checkout, Stripe Connect, Owner/Admin, or Money Center.

## 2026-06-05 Signed-In Device Follow-Up

Signed-in route proof was captured on the Play-installed physical Android device because safe reviewer/test credentials are intentionally not stored in the repo or environment for Firebase Test Lab.

- Doc: `docs/android/SIGNED_IN_DEVICE_SMOKE_PROOF.md`.
- Proof path: `/tmp/chillywood-signed-in-proof-20260605/`.
- Device: `R5CR120QCBF`.
- Package: `com.chillywood.mobile`.
- Installer: `com.android.vending`.
- Version: `1.0.0`, versionCode `25`.
- Screens covered: signed-in Home, Settings, Profile, Watch-Party waiting-room/Premium gate, and route-backed Live seat gate.

This closes the local signed-in route-smoke proof gap, but not the Firebase Test Lab signed-in cloud gap. A Test Lab signed-in run still requires owner-approved credentials or a secure instrumentation/Robo-script path outside committed source.

## Prerequisites

1. Install Google Cloud SDK.
2. Install Firebase CLI if desired for project checks.
3. Authenticate without committing credentials:

```bash
gcloud auth login
gcloud config set project chillywood-app
```

4. Confirm project and APIs:

```bash
gcloud auth list
gcloud config list
gcloud services list --enabled --project chillywood-app \
  --filter='name:(firebase.googleapis.com OR testing.googleapis.com)'
```

5. Confirm billing/quota only with owner approval. Do not enable billing from this runbook without explicit approval.

```bash
gcloud components install beta
gcloud beta billing projects describe chillywood-app --format='yaml(billingEnabled)'
```

## Repo Script

The repo now includes a bounded Test Lab helper:

```bash
npm run firebase:test-lab:preflight
```

Preflight writes environment, gcloud auth/config, API status, available virtual models/versions, APK hash if present, and the exact Test Lab command to:

```text
/tmp/chillywood-firebase-test-lab-proof-YYYYMMDD/
```

Preflight does not start a Test Lab run and does not consume quota.

To run one bounded Robo smoke after confirming the APK, project, and quota posture:

```bash
npm run firebase:test-lab:robo
```

To build the release APK first and then run one Robo smoke:

```bash
npm run firebase:test-lab:build-robo
```

To prepare a signed-in Robo smoke, provide credentials only through the current shell or an approved secret store. Do not commit them and do not put them in tracked files:

```bash
export FIREBASE_TEST_LAB_SIGNIN_EMAIL='test-account@example.com'
export FIREBASE_TEST_LAB_SIGNIN_PASSWORD='enter-outside-repo'

npm run firebase:test-lab:signed-in-preflight
```

To run one bounded signed-in Robo after the signed-in preflight passes:

```bash
FIREBASE_TEST_LAB_PROOF_DIR=/tmp/chillywood-firebase-test-lab-signed-in-proof-YYYYMMDD \
FIREBASE_TEST_LAB_RESULTS_DIR=chillywood-signed-in-YYYYMMDD-HHMMSS \
npm run firebase:test-lab:signed-in-build-robo
```

Signed-in Robo uses these stable login resource IDs:

- `login-email-input`
- `login-password-input`
- `login-submit-button`

The helper writes only credential presence booleans and a redacted command to the proof folder. It intentionally fails before any Test Lab run if `FIREBASE_TEST_LAB_SIGNIN_EMAIL` or `FIREBASE_TEST_LAB_SIGNIN_PASSWORD` is missing.

Optional environment overrides:

```bash
FIREBASE_TEST_LAB_PROJECT=chillywood-app
FIREBASE_TEST_LAB_APK=android/app/build/outputs/apk/release/app-release.apk
FIREBASE_TEST_LAB_DEVICE='model=MediumPhone.arm,version=35,locale=en,orientation=portrait'
FIREBASE_TEST_LAB_TIMEOUT=5m
FIREBASE_TEST_LAB_RESULTS_DIR=chillywood-smoke-YYYYMMDD-HHMMSS
FIREBASE_TEST_LAB_PROOF_DIR=/tmp/chillywood-firebase-test-lab-proof-YYYYMMDD
```

Rules:

- Run preflight first.
- Use one virtual device before any physical Test Lab device.
- Keep timeout short.
- Do not put passwords, reviewer credentials, service-account JSON, or provider secrets in command history, scripts, or docs.
- Do not claim signed-in or two-user LiveKit proof from a generic Robo run.
- Signed-in Robo is route smoke only. It still does not prove LiveKit two-session behavior, purchases, Stripe, Owner/Admin, or Money Center.

## Build A Release APK

Use the repo-native Gradle release build:

```bash
cd android
./gradlew assembleRelease bundleRelease
cd ..
```

Record:

- APK path and size.
- AAB path and size.
- SHA-256 hashes.
- `applicationId`, `versionCode`, and `versionName` from `android/app/build.gradle`.

Example:

```bash
shasum -a 256 android/app/build/outputs/apk/release/app-release.apk
shasum -a 256 android/app/build/outputs/bundle/release/app-release.aab
```

## List Test Lab Devices

Use a virtual device first to control cost and risk:

```bash
gcloud firebase test android models list --filter='form=VIRTUAL'
gcloud firebase test android versions list
```

Recommended first matrix:

- One virtual phone.
- One Android API level close to launch target.
- Portrait.
- 5 minute timeout.
- No flaky retries unless debugging an actual failure.

Current proved axis:

- `model=MediumPhone.arm`
- `version=35`
- `locale=en`
- `orientation=portrait`

## Run A Small Robo Test

```bash
RESULTS_DIR="chillywood-smoke-$(date +%Y%m%d-%H%M%S)"

gcloud firebase test android run \
  --type robo \
  --app android/app/build/outputs/apk/release/app-release.apk \
  --device model=MediumPhone.arm,version=35,locale=en,orientation=portrait \
  --timeout 5m \
  --results-dir "$RESULTS_DIR"
```

Rules:

- Start with one virtual device.
- Do not run repeated paid tests without approval.
- Do not add real reviewer credentials to command history, scripts, or committed files.
- Do not claim signed-in coverage from a generic Robo test unless credentials/scripts are provided safely outside the repo.

## Retrieve Results

The run output prints a Firebase Console URL and raw GCS bucket path.

Download the axis artifacts only:

```bash
mkdir -p /tmp/chillywood-firebase-test-lab-proof-YYYYMMDD/results

gsutil -m cp -r \
  gs://<RESULT_BUCKET>/<RESULTS_DIR>/<AXIS_DIR> \
  /tmp/chillywood-firebase-test-lab-proof-YYYYMMDD/results/
```

Recommended local proof files:

- `00-environment.txt`
- `02-gradle-release-build.log`
- `03-build-artifacts.txt`
- `04-test-lab-models.txt`
- `05-test-lab-versions.txt`
- `07-services-status.txt`
- `08-test-lab-robo-run.log`
- `10-gcs-results-list.txt`
- `11-download-results.log`
- `12-logcat-crash-scan.txt`
- `13-downloaded-file-sizes.txt`

Crash scan:

```bash
LOG=/tmp/chillywood-firebase-test-lab-proof-YYYYMMDD/results/<AXIS_DIR>/logcat
rg -n 'FATAL EXCEPTION|AndroidRuntime|ANR in com\\.chillywood\\.mobile|Process com\\.chillywood\\.mobile has died|Force finishing activity com\\.chillywood\\.mobile' "$LOG" || true
```

Review `actions.json`, screenshots, and `video.mp4` to identify which app surfaces Robo reached.

## Instrumentation Path

Use instrumentation only when real tests already exist. Do not create empty tests just to get a green result.

Command pattern:

```bash
gcloud firebase test android run \
  --type instrumentation \
  --app android/app/build/outputs/apk/release/app-release.apk \
  --test <TEST_APK_PATH> \
  --device model=MediumPhone.arm,version=35,locale=en,orientation=portrait \
  --timeout 10m
```

Future useful instrumentation can cover:

- Signed-out route smoke.
- Sign-in with safe test credentials supplied through Test Lab secrets or owner-managed secure setup.
- Home / Explore / Live / Library / Profile route smoke.
- Legal/account deletion route smoke.

Do not commit reviewer/test account passwords.

## Cost And Quota Controls

- Use virtual devices first.
- Use one axis for smoke.
- Keep timeout short.
- Avoid repeated runs while iterating locally.
- Use physical Test Lab devices only after owner approval for quota/cost.
- Do not enable billing from this repo lane.
- Save result links and logs so the same proof is not rerun unnecessarily.

## What Test Lab Proves

Firebase Test Lab Robo smoke can prove:

- Release APK installs in the cloud.
- App opens on a cloud Android device.
- Basic unauthenticated UI surfaces do not crash during a Robo crawl.
- Logcat, screenshot, video, and action artifacts can be captured for release proof.

Firebase Test Lab Robo smoke does not prove:

- Real signed-in route coverage unless credentials/scripts are configured safely.
- Real LiveKit multi-user behavior.
- TURN or cellular behavior.
- Real microphone/camera behavior.
- Watch-Party capacity or speech/audio mixing.
- Physical-device heat, battery, camera, or OEM-specific behavior.
- Play Console submission acceptance.

## Next Recommended Improvements

1. Add a bounded signed-out route smoke instrumentation test.
2. Add a signed-in route smoke only after safe test credentials are managed outside the repo.
3. Run one physical Test Lab device matrix only after owner quota/cost approval.
4. Keep LiveKit capacity, TURN/cellular, and real mic/camera proof in separate device/runtime lanes.
