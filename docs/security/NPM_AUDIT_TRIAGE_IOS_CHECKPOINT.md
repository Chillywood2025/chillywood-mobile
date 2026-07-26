# npm Audit Triage — iOS 90% Checkpoint

Date: 2026-07-15

This report is a sanitized summary. Raw audit JSON is intentionally not committed.

## Root application

`npm audit --omit=dev` reports:

- critical: 0
- high: 0
- moderate: 21
- low: 1

The Expo SDK 54 patch alignment and supported lockfile refresh removed every critical
and high production advisory without a major framework upgrade or an automatic
audit fix.

The final audit refresh briefly reported one new critical transitive advisory and
it was remediated before the replacement final builds:

| Package | Relationship | Path | Affected version | Fixed version | Non-breaking update | Remediation |
| --- | --- | --- | --- | --- | --- | --- |
| `websocket-driver` | Transitive | Production path through `@react-native-firebase/app` → `firebase` → `@firebase/database` → `faye-websocket` | `0.7.4`; affected below `0.7.5` | `0.7.5` | Yes, patch-only and within the parent's declared range | Lockfile-only update in `d6a95ed5`; fresh Simulator and production/TestFlight artifacts are required from that source. No separate major remediation PR is needed. |

After that exact update, both `npm audit --omit=dev --json` and the full root audit
report 0 critical, 0 high, 21 moderate, and 1 low. No dependency manifest changed.

## Nested alert automation package

The independently locked `ops/alert-automation` production package reports one
high advisory group:

| Package | Relationship | Path | Installed / affected | First safe line | Non-breaking update | Separate remediation |
| --- | --- | --- | --- | --- | --- | --- |
| `nodemailer` | Direct | Production dependency of `ops/alert-automation` | `8.0.7`; advisories affect versions through `8.0.7`, `8.0.8`, or `9.0.0` depending on the issue | `9.0.1` or newer; current registry release observed during triage: `9.0.3` | No. The fix crosses the declared `^8.0.7` major range. | Upgrade Nodemailer in a dedicated alerting-security PR, test SMTP/OAuth2, attachment/file-access restrictions, header construction, and delivery failure behavior, then deploy the alerting worker independently. |

The affected advisory group covers message-header injection, file/URL access
restriction bypasses, OAuth2 TLS certificate validation, and raw-message access
bypasses. The alerting package is not bundled into the mobile application, but it
is production tooling and therefore remains a tracked security follow-up.

## Policy decisions

- No `npm audit fix` or `npm audit fix --force` was run.
- No major dependency update was forced into the iOS integration branch.
- Moderate and low findings remain visible in the package-manager output and are
  not suppressed; they should be handled in dependency-owner follow-up work.
- The root mobile application currently has no high or critical production
  advisory.
