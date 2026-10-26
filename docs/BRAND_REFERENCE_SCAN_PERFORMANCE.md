# Brand reference scan performance correction — historical candidate C

This preserves the first full-scan experiment. Current indexed work, remaining
blockers, and later native evidence are in
[BRAND_REFERENCE_INDEX_PERFORMANCE.md](BRAND_REFERENCE_INDEX_PERFORMANCE.md).

Candidate C has independent semantic-equivalence evidence, but its plain native
scan still exceeded the hard 30-second limit. This is an incomplete source
experiment, not a demonstrated runtime fix or a deployment-ready change.
Implementation and benchmarks have stopped pending review of the remaining cost
and a concrete next design. No production deployment, activation, database
mutation, index change, provider access, or production latency claim is included.

The isolated source work is based on merged main
`39465cef17197229f1bee40f4c66000b37a7544a`. The forward migration dependency is
**`20261025114152_platform_brand_empty_test_disposition.sql` →
`20261025121430_platform_brand_reference_scan_performance.sql`**. Both replace
`private.platform_brand_retention_references_clear`; the optimization must retain
the earlier migration's exact empty-history predicate.

## Current candidate C and preserved boundaries

The new private matcher enumerates the supplied exact locator-column array with
`unnest`, includes only keys present in the row, and builds the same coalesced
`jsonb_object_agg` projection. An explicit `jsonb_each` error guard preserves
non-object JSONB failures, including when the column array is empty or NULL.
SQL NULL rows still project to `{}`.

Candidate C serializes the complete projected document, including its keys. When
that text contains no percent sign, the shared normalizer would return it
unchanged, so C uses that identity path directly. Every percent-containing
document still goes through the unchanged shared normalizer. The original two
`strpos` comparisons and SQL `OR` remain intact; neither needle is normalized,
NULL is not coerced to false, and no `COLLATE` override is introduced.

The column lookup remains an outer uncorrelated scalar subquery inside each
dynamic table SELECT. Its ordinary relation lock protects the scan's column
snapshot. There is no lasting column or clearance cache, raw reference prefilter,
new table exclusion, row limit, index, or lock order. Absence still requires the
complete applicable scan. The pre-existing race between initial table
enumeration and later DDL is not broadened into this performance patch.

`references_clear` remains VOLATILE and SECURITY DEFINER, with the unchanged
latch-before-advisory-lock call first. Its table enumeration, unknown-reference
and trigger-coverage checks, profile/publication checks, exact review exclusions,
proved/claimed scan exclusions, and receipt-bound empty-history exclusion remain
unchanged. Existing hold, generation, claim, locking, and error safeguards are
preserved. The source invariant test compares the prior/current function with
only the final scan expression substituted.

The new matcher is IMMUTABLE, SECURITY INVOKER, and not STRICT. Its default
EXECUTE privilege is revoked from PUBLIC, anon, authenticated, and service_role;
existing authorized definer paths retain access. Shared helper definitions and
their semantics are unchanged.

## Semantic and concurrency evidence

The focused PGlite suite passed both tests for candidate C, covering **312 Boolean
cases, 15 error cases, and 13 array/serialization cases**. Independent native
checks passed **312 Boolean cases, 15 error cases, 12 array cases, and 84
default/explicit nondeterministic-collation and NULL/nonnull/empty-needle
controls**, comparing results and SQLSTATE/message behavior.

The corpus covers nested keys and values, JSON escape and Unicode forms,
serialized punctuation-spanning matches, empty and NULL needles/values,
percent-encoding depths 1–5, mixed/malformed/nonprintable encodings, unusual column
names, unrelated fields, empty/unknown locator inventories, and array shape,
lower-bound, NULL, and duplicate-name cases. The oracle executes the original SQL
helpers, rather than approximating their behavior in JavaScript.

Earlier native evidence demonstrated the outer column InitPlan and scan-first
ADD/RENAME/DROP serialization, DDL-first committed/rolled-back ADD behavior, and
bounded writer/isolation controls. That evidence remains tied to its recorded
source hashes; it is not a substitute for final candidate C complete-path proof.

The expanded native full-stack replay stopped before the Brand migrations and
benchmark fixture load because the source migration rejected a pre-existing
`cognitive_product_baseline_executor` cluster role. The SQL failure surfaced as
an EPIPE in the replay process. The retained partial database had an empty audit
table and no Brand matcher or clearance function. It was not used as a benchmark,
and the role guard was not bypassed. **Successful full-path and repeated-clearance
timing evidence is absent.**

## Native timing results and limits

The isolated PostgreSQL 17.6 fixture contained **429,749 synthetic rows**,
**166,141,952 total bytes**, and **261.97 mean metadata bytes**. Metadata was the
only locator column; the only indexes were id and created_at. This generated
audit fixture was explicitly UNLOGGED. No durability setting or existing table
was changed. Metadata contained ASCII routing/status fields with no percent
encodings; an unrelated field deliberately contained the reference needle.

| Candidate and measurement | Elapsed ms | Outcome |
| --- | ---: | --- |
| A: row-driven projection, EXPLAIN ANALYZE and native function statistics | 77,792.175 | Completed the full synthetic absence scan; exceeded the 25–30 second budget |
| A: plain SELECT, function tracking disabled | 30,014.778 | Canceled at the hard 30-second limit, SQLSTATE 57014 |
| B: column-driven projection, plain SELECT | 30,033.022 | Canceled at the same limit, SQLSTATE 57014 |
| C: column-driven projection plus no-percent identity path, plain SELECT | 30,156.140 | Canceled at the same limit, SQLSTATE 57014 |

The original pre-change scan also failed to complete within its eight-minute
diagnostic bound. No exact old/new speedup is established. Each 30-second timeout
produced **no absence result** and was never treated as successful clearance.
No timeout was expanded to make candidates A, B, or C pass.

A's instrumented scan recorded one column lookup, one scalar InitPlan loop, and
429,749 matcher and normalizer calls. Instrumentation consisted only of native
`pg_stat_user_functions` with `track_functions=all` and EXPLAIN ANALYZE node
timers: no wrappers, sequences, or per-row counter writes. The subsequent plain
SELECTs verified `track_functions=none`, read-only execution, and the 30-second
statement timeout; psql timed only the SELECT. They used no EXPLAIN timers.

The runtime was a local network-disabled Docker PostgreSQL instance with no
mounts or production rows. The host reported x86-64 and the image amd64 Linux;
architecture emulation was not independently established. These measurements
cannot establish production latency. Both the 25-second reference-clearance
target and 30-second archive RPC budget remain unresolved, including repeated
calls and all other tables and protocol work.

## Bounded diagnostic profile and next design for review

After C failed, three read-only queries examined **exactly synthetic ids 1–1000**
with a five-second limit per query. All completed and confirmed 1,000 rows:

| Instrumented diagnostic | Elapsed ms |
| --- | ---: |
| Full-row `to_jsonb` conversion and text length | 33.186 |
| Actual candidate C matcher | 176.943 |
| Inline lateral projection over materialized row JSONB | 86.982 |

C recorded 1,000 matcher calls with 81.461 ms total/self time, one column lookup
at 30.923 ms, and zero shared-normalizer calls. The inline diagnostic made no
matcher calls, one column lookup at 3.700 ms, and zero normalizer calls. Catalog
timing, cache order, and query-shape differences prevent attributing the whole gap
to dispatch/SPI overhead. Function self-time includes internal SQL and built-ins;
it does not isolate their individual costs. These small-range measurements are
**diagnostics only, never absence proof or a full-size latency extrapolation**.

The concrete next design for review is a single planned Brand scan with lateral
projection/normalization, preserving the outer column InitPlan and every existing
predicate, lock, and guard while avoiding per-row PL/pgSQL/SPI execution. The
diagnostic's whole-result MATERIALIZED CTEs must not be adopted without review:
full-size materialization could spill or alter early-match execution. No such
source implementation has been made. Any proposed version requires independent
equivalence/error/collation review, native plan and race evidence, and successful
complete-path/repeated-call budget proof before readiness can be claimed.

## Evidence, validation, and handoff

The task workspace retains the exact SQL, reports, and source hashes:

- `brand-reference-native-optimized-results.json`: candidate A instrumented plan,
  counts, fixture details, and earlier native checks.
- `brand-reference-native-baseline-timeout.json`: incomplete original baseline.
- `brand-reference-uninstrumented-results.json`: candidate A plain timeout.
- `brand-reference-column-driven-plain-results.json`: candidate B plain timeout.
- `brand-reference-fastpath-plain-results.json`: candidate C plain timeout.
- `brand-reference-bounded-profile.sql` and
  `brand-reference-bounded-profile-results.json`: the bounded diagnostic.

The tested C migration SHA256 is
`762b812224ec8c817c9676aa6e96890313fdd26ff503e2540285c21a56fae7ab`.
The final read-only installed-definition audit matched C to source exactly; its
body SHA256 is
`a0e77286275e741d5d69c98b54103ea1c9bd94daa26edc2236a3cb0ab9f081cf`.
B and C also had immediate installed-body assertions. A has its recorded source
installation and subsequent B-run body readback, rather than a contemporaneous
installed-definition attestation.

Earlier disposable benchmark databases were automatically dropped. After those
outcomes were reconciled, one necessary replacement minimal fixture was created
and retained for A/B/C plain probes. That retained fixture and the partial
full-stack replay database are preserved for the handoff; no further benchmark,
implementation, deployment, or cleanup is requested by this document.

Repository validation entry points are the focused
`node --test tests/brand-reference-scan-performance.test.mjs` suite and
`node scripts/ci/required-validation.mjs --plan --base=origin/main`. Planning and
focused evidence do not establish successful exact-head Required Validation.
Complete selected checks, independent review, and the unresolved native
complete-path evidence remain necessary before merge. This task does not merge
or deploy the patch, and it must not be published as a completed performance fix.

Deployed migrations remain immutable. Any later rollback must be a reviewed
forward migration restoring the prior Brand scan while retaining the empty-test
protocol and every existing guard. This candidate changes no persisted clearance
state or application data.
