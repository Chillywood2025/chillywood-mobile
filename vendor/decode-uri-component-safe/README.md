# `@chillywood/decode-uri-component-safe`

This is Chi'llywood's CommonJS-compatible distribution of
[`decode-uri-component`](https://github.com/SamVerschueren/decode-uri-component)
0.5.0. It exists because `query-string` 7.1.3 requires this dependency as a
callable CommonJS export, while the upstream security-fixed release is
ESM-only.

The parsing implementation is the exact upstream 0.5.0 algorithm. The runtime
adaptation adds the callable CommonJS export that `query-string` requires and a
fail-closed work boundary for malformed components. Components longer than
8,192 characters (matching Chi'llywood's external-navigation limit) or with
more than 32 separate percent-encoded runs remain encoded instead of entering
upstream's best-effort replacement pass. Malformed values that encode the
JavaScript replacement-string tokens `$&`, `$'`, or the prefix token (a dollar
sign followed by a backtick) also remain encoded because upstream passes
decoded runs to `String.replace` as replacement text;
those tokens can otherwise duplicate matches, prefixes, or suffixes. Valid
inputs of any length still use the platform decoder. Bounding component size,
fallback-run count, and replacement amplification keeps multi-parameter parser
work proportional to total input size. The type declaration is adjusted to the
matching `export =` contract. The package retains the upstream MIT license.

Source provenance and hashes are recorded in `package.json`. Chi'llywood owns
maintenance of this packaging bridge until Expo Router no longer requires
`query-string` 7.x or another maintained upstream dependency supplies a
compatible fixed CommonJS contract. Do not change the decoder algorithm or
refresh the upstream source or change the malformed-input boundary without
updating the provenance record and running the full compatibility and
adversarial test suite.
