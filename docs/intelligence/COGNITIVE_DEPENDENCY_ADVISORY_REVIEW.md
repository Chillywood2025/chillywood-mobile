# Cognitive Dependency Advisory Review

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

The alert upgrade passed clean install, typecheck, build, and 27/27 tests.
`nodemailer` was the only direct production-installed high finding and is closed.
The root findings are Expo/Metro/lint/build-tool paths; the prior highs have been
patched. Remaining moderates are retained as non-runtime dependency debt and do not
include a demonstrated production-reachable critical/high path.

All GitHub Action uses remain pinned to immutable commit SHAs. New cognitive Deno
imports must use exact versions. Mutable release-tool inputs inherited outside this
work remain tracked for a separate release-workflow review.
