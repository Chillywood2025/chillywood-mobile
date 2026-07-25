# Cognitive Dependency Advisory Review

Observed closeout:

- Root production audit: 0 critical, 0 high, 23 moderate.
- `ops/alert-automation`: 0 critical, 0 high, 0 moderate.
- The root moderate advisories are inherited Expo/build/development tooling. They
  are not a demonstrated Level 0/1 server runtime path and remain tracked for a
  reviewed upstream upgrade.
- No automatic audit fix was run.
- `guard:cognitive-dependency-advisories` fails on any production critical or high
  advisory.

Status: production-reachable critical/high deployment gate closed for the current
Collective Governance dependency state.

No automatic audit fix is permitted. Each advisory is classified by package,
direct/transitive status, severity, fixed version, runtime reachability, shipping
lane, exploit preconditions, and reviewed action.

Deployment is blocked by any production-reachable critical or high advisory. A
high advisory proven limited to non-shipping CI/development tooling requires
documented reachability evidence, an owner-accepted temporary residual risk, and a
tracked upgrade. No critical advisory may remain.

## Reviewed result

The repository has two npm trees.

| Tree | Before | Reviewed change | After |
|---|---|---|---|
| Root mobile | 4 high, 18 moderate, 1 low, 0 critical | Safe leaf updates for Babel, brace expansion, fast-uri, and js-yaml; reviewed `postcss` 8.5.22 override | 0 high, 23 moderate, 0 low, 0 critical |
| Alert automation | 3 high, 1 moderate, 2 low, 0 critical | `nodemailer` 9.0.3, type package 8.0.1, `body-parser` 2.3.0, `qs` 6.15.3, `form-data` 4.0.6, Vitest/Vite 4.1.10/8.1.5, tsx/esbuild 4.23.1/0.28.1 | 0 total |

## Current root inventory

The 2026-07-23 read-only audit reports only the following moderate dependency
chains. `npm audit` offers only Expo/React-Native-Firebase major-line changes (and
in several cases a downgrade) rather than a reviewed SDK 54 patch. No automatic
fix was run.

| Package | Dependency | Shipping/reachability classification | Reviewed action |
| --- | --- | --- | --- |
| `@expo/cli` | transitive | local build/prebuild CLI; not a deployed cognitive server | track with reviewed Expo SDK upgrade |
| `@expo/config` | transitive | build-time configuration | track with reviewed Expo SDK upgrade |
| `@expo/config-plugins` | transitive | build-time native configuration | track with reviewed Expo SDK upgrade |
| `@expo/metro-config` | transitive | local bundler configuration | track with reviewed Expo SDK upgrade |
| `@expo/prebuild-config` | transitive | prebuild/native generation | track with reviewed Expo SDK upgrade |
| `@react-native-firebase/analytics` | direct | mobile telemetry wrapper; no cognitive server execution | review with coordinated RN Firebase upgrade |
| `@react-native-firebase/app` | direct | mobile Firebase bootstrap; no cognitive server execution | review with coordinated RN Firebase upgrade |
| `@react-native-firebase/crashlytics` | direct | mobile crash reporting; no cognitive server execution | review with coordinated RN Firebase upgrade |
| `@react-native-firebase/perf` | direct | mobile performance reporting; no cognitive server execution | review with coordinated RN Firebase upgrade |
| `@react-native-firebase/remote-config` | direct | mobile readback; cognitive canary does not invoke it | review with coordinated RN Firebase upgrade |
| `expo` | direct | mobile framework/build toolchain; not the deployed Edge runtime | coordinated SDK upgrade only |
| `expo-asset` | direct | mobile asset runtime/build chain | coordinated SDK upgrade only |
| `expo-constants` | direct | mobile constants runtime | coordinated SDK upgrade only |
| `expo-dev-client` | direct | development client only | coordinated SDK upgrade only |
| `expo-dev-launcher` | transitive | development launcher only | coordinated SDK upgrade only |
| `expo-linking` | direct | mobile linking runtime | coordinated SDK upgrade only |
| `expo-manifests` | transitive | mobile manifest/update tooling | coordinated SDK upgrade only |
| `expo-notifications` | direct | mobile notification runtime; unrelated to cognitive Edge code | coordinated SDK upgrade only |
| `expo-router` | direct | mobile route runtime; unrelated to cognitive Edge code | coordinated SDK upgrade only |
| `expo-splash-screen` | direct | mobile launch UI | coordinated SDK upgrade only |
| `expo-updates` | direct | mobile update runtime; cognitive authority cannot publish OTA | coordinated SDK upgrade only |
| `uuid` | transitive | reached through Expo/xcode tooling; bounded-buffer advisory requires caller-supplied output buffer | remove through upstream Expo/xcode update |
| `xcode` | transitive | Apple build tooling; not shipped in Android/Edge execution | remove through upstream Expo tooling update |

There is no current critical or high advisory. The moderate set is excluded from
the Level 0/1 deployed Edge dependency graph; it remains mobile/toolchain debt and
does not authorize an unreviewed Expo, React Native, or native dependency change.

The alert upgrade passed clean install, typecheck, build, and 27/27 tests.
`nodemailer` was the only direct production-installed high finding and is closed.
The root findings are Expo/Metro/lint/build-tool paths; the prior highs have been
patched. Remaining moderates are retained as non-runtime dependency debt and do not
include a demonstrated production-reachable critical/high path.

All GitHub Action uses remain pinned to immutable commit SHAs. New cognitive Deno
imports must use exact versions. Mutable release-tool inputs inherited outside this
work remain tracked for a separate release-workflow review.
