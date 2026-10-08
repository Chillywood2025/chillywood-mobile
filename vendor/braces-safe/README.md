# `@chillywood/braces-safe`

Chi'llywood maintains this narrow security backport of MIT-licensed `braces`
3.0.3 for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The npm registry still lists 3.0.3 as latest, with no patched upstream release,
as checked on 2026-10-08. Upstream [PR 72](https://github.com/micromatch/braces/pull/72)
was closed without merge. This is a local maintained derivative, **not an
upstream fixed release**. Its package name alone is not evidence of remediation.

Only the five security-related `lib/` changes are backported to the published
runtime: brace/parenthesis parser nesting and direct AST traversal are capped
at 100 levels; lower finite `maxDepth` values are honored, including fractional
limits; larger and non-finite limits cannot disable the cap. Direct
`compile`, `expand`, and `stringify` calls and their `lib/` entry points retain
their own bounds. Cyclic child trees stop at that bound, and `expand` detects
cyclic parent chains. Excessive string nesting throws `SyntaxError`; excessive
AST depth and cyclic parent chains throw `RangeError` with explicit messages.
Callers must handle rejected input just as they handle the existing input-length
and range-limit errors.

The final PR's fractional-depth, stringify-parent compatibility and cyclic-parent
corrections are included. Unrelated, unreleased parser changes are excluded.
Existing shallow output, original stringify `escapeInvalid` behavior, CommonJS
exports, upstream authorship and MIT license are preserved. This patch does not
claim to bound expansion cardinality, AST width, arbitrary accessor side effects,
or all CPU/memory use; upstream range limits and caller input policies remain
necessary. `fill-range` remains the original dependency.

`package.json` records the release integrity, original artifacts, four patch
commits and runtime hashes. `upstream/` retains those immutable artifacts and
the released and proposed-fix test suites for offline review. Only runtime,
license, package metadata and this README enter the installable tarball.

`node --test tests/braces-safe-compatibility.test.mjs` checks the installed
dependency and every lockfile copy, packaged/source identity, the unchanged
released tests, patch regression cases, deep input and AST rejection, bounded
options, shallow differential behavior, and real micromatch/glob consumers.
The upstream reproduction is a negative control; accepting renamed vulnerable
code must fail the tests. No advisory is allowlisted and the audit threshold
is unchanged.

Chi'llywood owns maintenance of this derivative until a reviewed, compatible
upstream release or dependency replacement removes it. Recheck the advisory
and upstream on dependency refresh. Update provenance, regenerate the tarball,
and run the complete compatibility/security suite for any runtime change.
