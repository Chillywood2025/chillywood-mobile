# Performance, Crash, And ANR Smoke

This is a smoke lane for launch-critical route health, not a benchmark suite.

## Routes

- Cold app launch: root ready, no crash, no ANR.
- Login: submit, success/failure handling, no endless spinner.
- Home load: visible safe state, no crash.
- Player open: route loads, no raw resolver error, no obvious video freeze on basic playback where media is available.
- Platform open: owner and viewer modes load without ANR.
- Premium open: route selector appears and no raw purchase/provider error.
- Money Center open: sandbox/not-payable copy visible, no payout/live-money claim.
- Watch-Party route open: safe gate or room state, no LiveKit authority regression.

## Crashlytics

Firebase Crashlytics packages are present. After a proof run, check the Crashlytics dashboard for new crashes/ANRs matching the tested build/session when dashboard access is available.

## Must Not Happen

- No crash or ANR.
- No endless spinner beyond the route's documented timeout.
- No raw stack trace or SQL/provider error in user UI.
- No obvious memory spike or app kill during basic route open.
