# npm Audit Triage — Warning Maintenance

Date: 2026-09-25

This is a sanitized lockfile review. Raw registry responses are intentionally
not committed because advisory databases change over time.

## Current result

The dependency guard now reports every independently locked npm tree in both
all-dependency and production-only modes:

| Tree | Critical | High | Moderate | Reviewed result |
| --- | ---: | ---: | ---: | --- |
| Root mobile application | 0 | 0 | 26 | Two unresolved moderate advisory leaves propagate through Expo packages. |
| `ops/alert-automation` | 0 | 0 | 0 | Compatible Vitest, nanoid, and PostCSS patches applied. |
| `isolated-runtime/cloudflare` | 0 | 0 | 0 | Wrangler updated and the resolved sharp/undici leaves verified. |

The existing failure policy remains unchanged: production critical/high
findings fail the guard. Development findings are reported for review without
turning an aggregate development count into a new admission rule.

No automatic audit fix, forced major upgrade, deployment, or provider action was
performed.

## Compatible repairs

- Root: `@humanfs/node` 0.16.8 and PostCSS 8.5.23.
- Alert automation: Vitest 4.1.11, nanoid 3.3.18, and PostCSS 8.5.23.
  The registry classified the [nanoid advisory](https://github.com/advisories/GHSA-2v37-7h3g-55p8)
  as high and the [Vitest mocker advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)
  as moderate at review time.
- Isolated Cloudflare tooling: Wrangler 4.141.0, resolving sharp 0.35.4 and
  undici 7.29.0 in that lockfile. Wrangler requires Node.js 22 or newer; only a
  scoped Wrangler job should change runtime. Ordinary application CI remains on
  Node 20 and does not invoke Wrangler.

## Unresolved root advisories

| Leaf | Locked path and evidence | Why it remains | Resolution path |
| --- | --- | --- | --- |
| [`decode-uri-component` 0.2.2](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | `expo-router` → `@react-navigation/core` → `query-string`; malformed percent-encoded input can cause excessive decoding work. | The fixed 0.5.0 line crosses the consumer's 0.x range. A trial override failed the real CommonJS `query-string` consumer because the module shape changed (`decodeComponent is not a function`). | Prefer an Expo Router / React Navigation parent release that resolves a compatible fixed decoder. Reconsider a narrow override only with Metro, CommonJS, malformed-link, auth/recovery-link, duplicate-key, and Unicode regression coverage. |
| [`uuid` 7.0.3](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Expo config tooling → `xcode`; the advisory affects v3/v5/v6 buffer handling. The locked `xcode` implementation was statically checked and calls only `uuid.v4()`. | The advisory-fixed line is uuid 11.1.1 and crosses major versions. The inspected consumer path is not affected, but this is not a claim that every possible future caller is unreachable. | Prefer an upstream Expo/xcode update. Do not force a graph-wide uuid major override merely to change the audit count. |

These moderate findings remain visible. They are not evidence of a demonstrated
authorization or payment bypass, and the current audit offers only coordinated
Expo/package-line changes for their parent graph. A future Expo SDK migration is
a separate compatibility project.
