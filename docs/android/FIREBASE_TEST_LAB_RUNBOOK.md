# Firebase Test Lab Android Smoke Runbook

## Current Proof

Status: repo-side Test Lab smoke setup is complete, with one bounded virtual-device Robo proof.

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
