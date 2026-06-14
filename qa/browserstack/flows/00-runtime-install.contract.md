# 00 Runtime Install Contract

## Purpose
Prove BrowserStack is using the correct Play/internal launch-candidate runtime before any feature regression starts.

## Required Personas
- Any signed-out or signed-in test user.

## Required Runtime
- package `com.chillywood.mobile`
- installer `com.android.vending`
- latest internal `versionCode`
- not Expo Dev Launcher

## Preconditions
- User has approved BrowserStack execution.
- BrowserStack device can install or access the Play/internal app.
- Expected versionCode is recorded in the run notes.

## Steps
1. Install/open Chi'llwood on BrowserStack device.
2. Record device model and Android version.
3. Confirm package is `com.chillywood.mobile`.
4. Confirm installer is `com.android.vending`.
5. Confirm versionCode is the current internal candidate.
6. Launch the app.
7. Confirm Home or login/auth state opens without crash, blank screen, or endless spinner.

## Expected Result
The app runs as a Play/internal install and is not Expo Dev Launcher.

## Screenshots To Capture
- App info/version proof where available.
- First successful app screen.

## Logs To Capture
- Sanitized device/app launch logs only.

## Pass Criteria
- Correct package, installer, and versionCode.
- App launches cleanly.

## Fail/Blocker Criteria
- Installer is not `com.android.vending`.
- App is Expo Dev Launcher.
- VersionCode is stale.
- Crash/ANR/blank first screen.

## Device Count
One device.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Yes, via physical Play/internal install proof.
