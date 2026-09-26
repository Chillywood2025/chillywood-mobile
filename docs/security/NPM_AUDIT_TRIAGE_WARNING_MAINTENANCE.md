# npm Audit Triage — Warning Maintenance

Date: 2026-09-26

This is a sanitized lockfile review. Raw registry responses are intentionally
not committed because advisory databases change over time.

## Current result

The dependency guard now reports every independently locked npm tree in both
all-dependency and production-only modes:

| Tree | Critical | High | Moderate | Reviewed result |
| --- | ---: | ---: | ---: | --- |
| Root mobile application | 0 | 0 | 0 | The final decoder leaf is replaced by the reviewed fixed implementation. |
| `ops/alert-automation` | 0 | 0 | 0 | Compatible Vitest, nanoid, and PostCSS patches applied. |
| `isolated-runtime/cloudflare` | 0 | 0 | 0 | Wrangler updated and the resolved sharp/undici leaves verified. |

The existing failure policy remains unchanged: production critical/high
findings fail the guard. Development findings are reported for review without
turning an aggregate development count into a new admission rule.

No automatic audit fix, forced major upgrade, deployment, or provider action was
performed.

## Compatible repairs

- Root: `@humanfs/node` 0.16.8, PostCSS 8.5.23, an exact `xcode@3.0.1`
  resolution of uuid 11.1.1, and the locally packaged decoder repair described
  below. The xcode override is intentionally nested rather than graph-wide.
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

The reviewed graph had one decoder copy beneath `query-string` 7.1.3. Both Expo
Router 6.0.24 and React Navigation core 7.17.0 consume that `query-string`
installation. Expo Router's active inbound-query fork uses `URLSearchParams`,
but React Navigation's installed generic path parser still calls
`queryString.parse`, so the vulnerable transitive decoder was reachable and
could not be dismissed based on the safer Expo Router path.

The official advisory identifies all versions through 0.4.2 as vulnerable and
0.5.0 as the first patched release. Upstream 0.5.0 is ESM-only, while the
supported `query-string` 7.1.3 implementation requires the package and invokes
the result directly as a CommonJS function. A plain 0.5.0 override therefore
fails with `decodeComponent is not a function`. `query-string` 9.5.1 accepts
0.5.0, but its own ESM-only module shape breaks Expo Router's compiled CommonJS
contract. No supported Expo Router parent update removed that incompatibility
at review time.

The repository now packages `@chillywood/decode-uri-component-safe`
0.5.0-chillywood.1 in `vendor/decode-uri-component-safe`. The JavaScript
algorithm portion reconstructs byte-for-byte to upstream 0.5.0 after restoring
its original function name and `export default` declaration. A separate small
wrapper supplies the callable CommonJS boundary and the bounded malformed-input
policy described below; the TypeScript declaration matches that export. The
package retains the upstream MIT license, has no install scripts or
dependencies, and records:

- upstream git head `a12fabaa28303cc8b5b07e93d128f4fc09fc31e5`;
- security-fix commit `fa479dafeede7bedf04e5c89aa78f2a78c664005`;
- upstream registry integrity
  `sha512-1BiQVoK8C9gUbQU6NzAtO/tkz2qOFpEObMWpcFvhx4fYnj4Oc5yzaJN/LD36ihkVUdXyh5ZekzX+yM+ty/SrPg==`;
- upstream tarball SHA-256
  `f42d289f996e6c9f0e33d8f31de1fe9a7a077c612dca489cafdb2df4cbb6122f`;
  and
- committed adapted tarball SHA-256
  `a0c4febc85da02498a9a4e3ff909c074d0322fab383530bc6a0f4f6e557220ed`.

A package-specific root override makes every installed `decode-uri-component`
request resolve to that one committed tarball. This is deliberately not a
Metro alias: Node, Metro, Expo Router, and React Navigation share the same
installed code. Clean `npm ci` succeeds without lifecycle scripts, the lockfile
contains one decoder entry, and no 0.2.2 implementation remains in the resolved
tree.

Independent review found that upstream 0.5.0's outer replacement map can still
be superlinear when malformed input contains thousands of distinct valid
encoded runs. A length-only boundary could also be bypassed by supplying many
separate parameters just under the limit. The package therefore retains the
exact upstream algorithm behind narrow work bounds: the application's existing
8,192-character external-navigation limit, a maximum of 32 separate
percent-encoded runs for malformed fallback, and rejection of malformed runs
that decode to the JavaScript replacement tokens `$&`, `$'`, or the prefix
token (a dollar sign followed by a backtick). Upstream passes decoded runs to
`String.replace` as replacement text; without the last guard those tokens can
duplicate matches, prefixes, or suffixes and
amplify output to exhaustion. Valid components of any length still use the
platform decoder. Malformed components above a bound remain encoded and skip
upstream's best-effort replacement pass. These are fail-closed work guards, not
a replacement decoder. Tests cover values at and across both numeric boundaries
plus two aggregate 100-parameter queries through the actual query-string and
React Navigation parsers: an over-800,000-character distinct-run case and an
over-700,000-character replacement-amplification case under a 64 MiB heap cap.

The committed compatibility suite performs direct differential checks against
the reconstructed exact upstream 0.5.0 source and exercises actual CommonJS,
ESM, query-string, Expo Router, and React Navigation consumers. It covers
Unicode, emoji, malformed/truncated encodings, duplicates, arrays, empty/null
values, plus signs, spaces, encoded separators, fragments,
verification/recovery credentials, parsing/serialization, and boundary cases.
It also executes oversized single-component shapes, the aggregate
multi-parameter bypass, and the replacement-string amplification case in
timeout- and memory-bounded subprocesses. The protected product test invokes
this complete committed suite rather than relying on an unreferenced package
script.

During implementation, separate upstream checkouts also passed all 135 decoder
cases and all 125 `query-string` 7.1.3 cases under its supported Node-era test
runner. Local validation additionally covered Node 20, the current local Node
runtime, Android/iOS/web Expo exports, and Hermes compilation. These broader
local runs supplement—but are distinct from—the reproducible committed suite
and protected exact-head checks.

One upstream semantic correction is explicit: decoder 0.5.0 leaves a literal
`+` unchanged when called directly. `query-string.parse` still turns `+` into a
space for query components before decoding, while a raw, unencoded fragment
parsed through `query-string.parseUrl` now remains `+`. No repository caller of
that fragment-decoding option was found; encoded fragment round trips and the
actual navigation contracts are covered by tests.

The fresh zero-count audits are useful corroboration, not the security proof:
a local package identity is not matched against the registry advisory. The
proof rests on recorded provenance, exact upstream-algorithm equivalence behind
the documented bound, graph inspection, adversarial behavior, and consumer
compatibility. Chi'llywood owns maintenance of this packaging bridge until a
supported Expo Router dependency line removes it. Any upstream refresh or
change to the navigation-input limit must repeat those checks.

No application UI, route, auth/session rule, entitlement, call behavior,
native binary, OTA, or production system changed. Physical-device testing
remains paused and this dependency validation is not native-device proof.
