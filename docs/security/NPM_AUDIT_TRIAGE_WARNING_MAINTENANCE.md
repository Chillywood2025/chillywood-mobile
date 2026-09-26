# npm Audit Triage — Warning Maintenance

Date: 2026-09-26

This is a sanitized lockfile review. Raw registry responses are intentionally
not committed because advisory databases change over time.

## Current result

The dependency guard now reports every independently locked npm tree in both
all-dependency and production-only modes:

| Tree | Critical | High | Moderate | Reviewed result |
| --- | ---: | ---: | ---: | --- |
| Root mobile application | 0 | 0 | 4 | One unresolved moderate advisory leaf propagates through four package nodes. |
| `ops/alert-automation` | 0 | 0 | 0 | Compatible Vitest, nanoid, and PostCSS patches applied. |
| `isolated-runtime/cloudflare` | 0 | 0 | 0 | Wrangler updated and the resolved sharp/undici leaves verified. |

The existing failure policy remains unchanged: production critical/high
findings fail the guard. Development findings are reported for review without
turning an aggregate development count into a new admission rule.

No automatic audit fix, forced major upgrade, deployment, or provider action was
performed.

## Compatible repairs

- Root: `@humanfs/node` 0.16.8, PostCSS 8.5.23, and an exact
  `xcode@3.0.1` resolution of uuid 11.1.1. The xcode override is intentionally
  nested rather than graph-wide.
- Alert automation: Vitest 4.1.11, nanoid 3.3.18, and PostCSS 8.5.23.
  The registry classified the [nanoid advisory](https://github.com/advisories/GHSA-2v37-7h3g-55p8)
  as high and the [Vitest mocker advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)
  as moderate at review time.
- Isolated Cloudflare tooling: Wrangler 4.141.0, resolving sharp 0.35.4 and
  undici 7.29.0 in that lockfile. Wrangler requires Node.js 22 or newer; only a
  scoped Wrangler job should change runtime. Ordinary application CI remains on
  Node 20 and does not invoke Wrangler.

## Focused compatibility investigation

### `uuid`

The root lockfile contains one uuid copy. Its only declared consumer is
`xcode` 3.0.1 through Expo config tooling. The current xcode source imports
uuid through CommonJS and calls only `uuid.v4()` when generating 24-character
uppercase native-project identifiers. The advisory affects caller-provided
buffers in the v3, v5, and v6 APIs, so that observed call path was not affected.

A nested `xcode` override now resolves uuid 11.1.1, the patched CommonJS-capable
release. Compatibility evidence included:

- Node 20 and Node 24 CommonJS loading;
- 1,000 unique generated identifiers with the existing 24-character uppercase
  hexadecimal contract;
- the upstream xcode 3.0.1 suite with 1,599 assertions, including project parse,
  mutation, identifier generation, and write cases; and
- explicit confirmation that patched v3/v5/v6 buffer bounds reject undersized
  output buffers.

The maintained xcode branch has moved identifier generation to
`crypto.randomUUID()`, but no compatible stable release contains that change;
xcode 3.0.1 remains the latest stable package. Pinning an unreleased branch was
not selected.

### `decode-uri-component`

The root lockfile contains one decoder copy beneath `query-string` 7.1.3.
Both Expo Router 6.0.24 and React Navigation core 7.17.0 consume that
`query-string` installation. Expo Router's active inbound-query fork uses
`URLSearchParams`; its remaining `query-string` use is serialization. React
Navigation's installed generic path parser still has a `queryString.parse`
call, so the transitive decoder cannot be declared unreachable for the whole
graph.

The maintained decoder fix is 0.5.0. It is ESM-only, while `query-string` 7.1.3
does `const decodeComponent = require("decode-uri-component")` and calls the
result as a function. A clean forced override returned a module namespace and
failed actual parsing with `decodeComponent is not a function`. `query-string`
9.5.1 consumes decoder 0.5.0, but it is also ESM-only and changes the shape seen
by Expo Router's compiled CommonJS import: `stringify` is under `default` rather
than at the top level. All Expo Router 6.0 releases, and the current Expo Router
57 release examined during this review, still declare `query-string` 7.1.3.

Behavior probes covered Unicode, malformed encoding, duplicate parameters,
spaces, serialization, app-link routes, verification/recovery regressions, and
navigation policy. In a strict one-second subprocess, the installed
`query-string` decoder timed out with 200 repeated malformed `%ab` tokens;
patched decoder 0.5.0 completed 1,400 tokens promptly. Expo Router's actual
`URLSearchParams` fork completed 5,000 tokens promptly. These results narrow
the product exposure but do not make a whole-graph non-reachability claim.

## Unresolved root advisory

| Leaf | Locked path and evidence | Why it remains | Resolution path |
| --- | --- | --- | --- |
| [`decode-uri-component` 0.2.2](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | `expo-router` and `@react-navigation/core` independently consume `query-string`; malformed percent-encoded input can cause excessive decoding work. | The fixed 0.5.0 line changes the CommonJS module shape expected by `query-string` 7.1.3. The maintained `query-string` line that accepts the fix is also ESM-only and incompatible with Expo Router's compiled import shape. | Prefer a supported Expo Router parent release that removes or compatibly updates this dependency. Reconsider only with Metro, CommonJS, malformed-link, auth/recovery-link, duplicate-key, Unicode, and navigation regression coverage. |

The remaining moderate finding stays visible. It is not evidence of a
demonstrated authorization or payment bypass. No compatible maintained parent
repair was available in the supported Expo line at review time; a future
coordinated router/package migration is a separate compatibility project.
