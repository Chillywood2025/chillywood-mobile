# Dependency repairs for the consolidated internal call candidate

CI's existing production dependency gate first stopped at shell-quote's critical
advisory. After correcting that dependency, the unchanged gate exposed additional
high findings. These source changes repair the affected leaves while keeping the
Expo, React Native, Firebase, Metro, and Jest versions unchanged. They do not
authorize or perform any deployment, OTA, or provider change.

| Package | Previous resolution | Candidate resolution | Primary advisory |
| --- | --- | --- | --- |
| shell-quote | 1.10.0 | 1.11.0 | [GHSA-pqg4-j6r4-53mv](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv) |
| brace-expansion | 1.1.18 / 2.1.4 / 5.0.9 | 1.1.21 / 2.1.7 / 5.0.12, scoped to the existing minimatch API lines | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) |
| compression | 1.8.1 | 1.8.2 | [GHSA-vc2v-76pw-4v95](https://github.com/expressjs/compression/security/advisories/GHSA-vc2v-76pw-4v95) |
| source-map-js | 1.2.1 | 1.2.2 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| @grpc/grpc-js | 1.9.16 | 1.13.6 | [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) |
| braces | 3.0.3 | @chillywood/braces-safe 3.0.3-chillywood.1 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| node-forge | 1.4.0 | @chillywood/node-forge-safe 1.4.0-chillywood.1 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) |
| proxy-addr (ops alert automation only) | 2.0.7 | 2.0.8 | [GHSA-jqcg-44mw-7w3h](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h) |

The braces and node-forge advisories had no published patched upstream version.
Their checked-in vendor directories contain actual code repairs, licenses,
upstream provenance, deterministic packaging, and focused regression tests.
They are explicitly named local forks, not claims of an upstream security release.
See `vendor/braces-safe/README.md` and `vendor/node-forge-safe/README.md`.

The gRPC update is within major version 1 but outside Firestore 4.12.0's declared
`~1.9.0` range. Its exact override is deliberate. The only new root package is
gRPC's declared `@js-sdsl/ordered-map` 4.4.2 dependency; the existing proto-loader
version remains unchanged. Compression adds an edge to the already installed
destroy 1.2.0 package. The other registry upgrades satisfy their consumers'
existing version ranges. No broad `npm audit fix` or framework upgrade was used.

Validation of the installed consumer resolutions includes:

- React Native devtools' shell-quote rejects all four post-comment line
  terminators, including parsed comment tokens and intervening safe tokens;
  ordinary escaped arguments still round-trip. No generated shell text is run.
- Expo's compression performs an ordinary gzip response and destroys its real
  zlib streams after three premature response closes.
- PostCSS's source-map-js rejects invalid and excessive indexed offsets,
  including nested aggregate offsets, and preserves ordinary mappings.
- Firestore's resolved gRPC loads the real consumer and completes unary and
  bidirectional streaming requests with metadata against a local fixture server.
  This is client compatibility evidence, not a production Firebase connection.
- The brace-expansion guard retains separate CommonJS/ESM API-line checks,
  exact graph identity and negative controls; it adds nested recursion and
  rewrite-path adversarial inputs and rejects the newly vulnerable old versions.
- Express's actual proxy resolution rejects spoofed forwarding through short
  IPv6 subnet prefixes and preserves explicit loopback and valid subnet trust.
  Ops tests: 31 passed; TypeScript passed.

On the completed local dependency graph, the unchanged
`scripts/guard-cognitive-dependency-advisories.mjs` passed all eight audit scopes:

| Tree | All dependencies (critical / high / moderate) | Production (critical / high / moderate) |
| --- | --- | --- |
| Application | 0 / 0 / 12 | 0 / 0 / 11 |
| Alert automation | 0 / 1 / 0 | 0 / 0 / 0 |
| Isolated Cloudflare runtime | 0 / 3 / 0 | 0 / 0 / 0 |
| Real peer browser tests | 0 / 0 / 0 | 0 / 0 / 0 |

These counts reflect that registry read, not a guarantee about future advisories.
The existing gate rejects production high/critical findings; its thresholds and
failure behavior are unchanged. Moderate production and development-only
findings remain reported. Native source digests must be resealed because the
root manifest, lock and vendor bytes are native compatibility inputs. CI,
signed internal builds, and physical call qualification remain separate gates.
