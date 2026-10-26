# Brand reference indexed correction — incomplete

This document preserves the built-ins-only candidate and its failed native
measurements through `a3eba4b21459a50efe3954de907ea2d74a43a374`. The approved
source/local-test replacement is tracked in
`BRAND_REFERENCE_NORMALIZED_INDEX_PERFORMANCE.md`; historical results below
do not validate that replacement.

The indexed candidate has not met the runtime budget and has one known write
compatibility edge. It is not ready for publication or deployment. No production
reads, database/index changes, deployment, activation, scanner/media access,
provider operation, or production latency claim is included.

Branch: `codex/brand-reference-scan-perf`. Base:
`39465cef17197229f1bee40f4c66000b37a7544a`. Future migration order is
`20261025114152` (empty-history protocol), `20261025121430` (one-pass matcher),
then `20261025141347` (candidate indexes). Later definitions preserve every exact
review, scan and receipt-bound empty-history exemption. Source approval does not
authorize applying migrations or building live indexes.

## Design and unresolved correctness edge

The index expression uses existing immutable PostgreSQL built-ins to reconstruct
the complete canonical locator JSONB document. It preserves names, nulls,
escaping and serialized boundaries. Percent-free documents are indexed unchanged;
every percent-containing, oversized, deep or uncertain row maps to a mandatory
exact-check sentinel. Encoded references are never discarded by a raw-text
prefilter. Both literal LIKE patterns escape `%`, `_` and the escape character;
the unchanged exact matcher and exemptions recheck candidates.

Every locator table is still enumerated. Unsupported types, inheritance or
partitions, more than 64 columns, NULL/empty needles, missing/invalid indexes and
schema/function/collation mismatches retain the exact fallback. The private
FORCE-RLS registry contains only schema/index/environment metadata, never row
contents or clearance decisions. ACCESS SHARE precedes fingerprinting and lasts
through the scan. Existing latch/advisory order, writer/DDL guards, holds,
generations and error checks remain. No shared helper or writer trigger changes.

The no-grant draft is **not correctness-complete**: a shallow, very large,
heavily escaped JSONB can exceed PostgreSQL's string-buffer limit before the
built-in size check returns the sentinel. Index construction or a previously
accepted write can then fail. This cannot falsely clear references, but violates
the requested unchanged write behavior.

The superseded one-function classifier/EXECUTE proposal remains in the
immutable retrieval package. At this historical checkpoint no proposed helper
or grant had been applied. The current two-helper design and its validation
status are documented in `BRAND_REFERENCE_NORMALIZED_INDEX_PERFORMANCE.md`.

## Preserved baseline

The original 429,749-row synthetic audit fixture had metadata as its only locator
column, id/created_at indexes, 166,141,952 total bytes and 261.97 mean metadata
bytes. It was generated locally, unlogged and percent-free. An unrelated field
contained the reference needle. Details remain in the historical scan report.

| Measurement | Elapsed ms | Outcome |
| --- | ---: | --- |
| Original duplicate scan | 480,000 diagnostic cap | No completed result |
| A, native EXPLAIN ANALYZE/function statistics | 77,792.175 | Over budget |
| A, plain SELECT | 30,014.778 | SQLSTATE 57014 |
| B, column-driven projection | 30,033.022 | SQLSTATE 57014 |
| C, percent-free identity path | 30,156.140 | SQLSTATE 57014 |

Timeouts produced no clearance result and were never success. No baseline was
repeated. Native statistics used no per-row counter writes, sequences or
wrappers. The C migration SHA256 is
`762b812224ec8c817c9676aa6e96890313fdd26ff503e2540285c21a56fae7ab`;
installed matcher body SHA256 is
`a0e77286275e741d5d69c98b54103ea1c9bd94daa26edc2236a3cb0ab9f081cf`.

## Indexed full-schema measurement

Source checkpoint `5dcff864eed4a50d178343e092b8cc3121dd3342` used indexed
migration SHA256
`418d13a40c3a2bd847aed608dc374566c051cfa7fe6456c28e13f8b02c5ed039`.
Installed bodies were asserted equal to source before measurement.

The retained disposable database contains 1,700,000 generated rows across 354
populated synthetic tables, including one with 429,749 rows. Exactly 17,000 rows
(1%) contain percent-encoded metadata. An unrelated field carries the target
needle. All 354 candidate indexes are available and reference guards ready.
Including source tables, clearance enumerates 709 locator tables. Fixture plus
indexes occupy 1,355,563,008 bytes. Setup/index build time is separate from
runtime; no durability settings or real tables were changed.

With other test processes quiescent, the first complete clearance call timed out
at **30,022.156 ms**, inside the largest synthetic table. Effective settings:
`statement_timeout=30s`, `track_functions=none`, isolation `read committed`.
The harness stopped without running the three-call batch or archived authorization
RPC. Those budget checks remain incomplete. The synthetic gate was verified
false afterward and no other fixture sessions remained.

The exact native EXPLAIN identified a sequential scan: EXISTS' early-match
estimate preferred low startup cost despite the available GIN index. A separate
candidate-only diagnostic hit its five-second cap. EXPLAIN without execution
showed a candidate COUNT and a MATERIALIZED candidate CTE instead plan
BitmapOr/GIN scans. Bounded diagnostics completed:

| Diagnostic, at most 100 exact rows | Elapsed ms |
| --- | ---: |
| 100 encoded exact checks | 500.181 |
| 100 percent-free exact checks | 127.190 |
| 100 encoded shared-normalizer calls | 75.787 |

Different primary-key page work and cache state prevent full-path extrapolation.
These samples establish neither absence nor the RPC budget. Independent review
supports a narrow query-shape experiment: a MATERIALIZED `SELECT *` candidate
CTE followed by unchanged exemptions, matcher and scalar column InitPlan in the
same statement. Materialization can add temporary I/O, does not guarantee index
use, and cannot remove the cost of frequent sentinel candidates. Final-plan,
serialization, failure/race and repeated-RPC evidence is still required.

## Reviewed query revision and remaining cost

Commit `aee217ee5ccf57b7b7c4af94278cb2434cc247a8` applies the MATERIALIZED
candidate CTE only when the existing per-table predicate is literally `true`.
Every special predicate retains the exact prior C scan statement. This generic
opt-in also protects future special predicates; no table is excluded from
reference coverage. Migration SHA256:
`b1db4087933a24de0b3e7c89a300c9db6e05258b0508bb2ab41d3d8dd97794f0`.
Installed clearance body SHA256:
`03c28311346f34e95dede9aabe91f0611b27938ea4230da6e00ad717377775c6`.
No index/row rebuild or helper permission change accompanied this revision.

Native rollback-only evidence proved why special predicates require fallback.
A valid synthetic JSON column containing Unicode NUL on `storage.objects`
caused the original review predicate and old C scan to raise `22P05`,
`unsupported Unicode escape sequence`. Candidate filtering on an unrelated
review row suppressed that error and returned false. The unchanged fallback
preserved the original error. The column/transaction was rolled back, the target
remained unchanged, and the fixture was verified idle. Source invariants now
assert the literal special-predicate block and exact fallback SQL/parameters.

The revised component suite passed **5/5** in 73,857.087ms, including 49 base/CTE
row-serialization, 392 matcher and 56 existence comparisons across seven schema
stages. These cover NULLs, quoted Unicode names, dropped/readded/renamed columns,
stored generated values and supported types.

The separately recorded complete native clearance still timed out:
**30,047.838 ms**, SQLSTATE 57014, this time at `brand_reference_perf_015` after
progressing beyond the largest table. Settings remained 30 seconds, tracking
disabled, and read committed. No three-call or archived-RPC measurements ran.
The earlier 30,022.156 ms failure remains preserved, not overwritten.

One bounded native EXPLAIN ANALYZE on that 3,599-row table completed:

- Execution 1,363.152 ms; planning 67.746 ms.
- Candidate Seq Scan 1,131.052 ms, 36 output rows, 3,563 removed.
- Exact matcher 36 calls, 171.936 ms total; normalizer 36 calls, 97.439 ms.
- Locator discovery 1 call, 27.139 ms; scalar InitPlan 1 loop.
- No temporary blocks written. These are instrumented local diagnostics.

The subsequent optional storage-size catalog query exceeded its independent
five-second limit; that diagnostic report is explicitly partial. Its completed
plan/call counts remain valid. No further complete clearance was repeated.

The current blockers are therefore distinct: small-table candidate plans still
choose costly sequential expression evaluation; every encoded row still needs
an exact call; the oversized escaped-JSONB write edge remains; and complete
repeated-RPC budget proof is absent. One table's sample must not be extrapolated
as measured total latency or production performance.

### Next design for review — not implemented

The next useful experiment is an index over the **exact versioned normalized
canonical document**, so ordinary encoded irrelevant rows do not all become
mandatory candidates. Keep the current exact row recheck, type/schema/index
fallback, special-predicate fallback, locks and full table enumeration. Deep,
oversized or uncertain rows would still require the original checker.

This requires review of two pure immutable function responsibilities: bounded
JSONB sizing before projection, and a Brand-only frozen copy of the existing
four-pass normalization over the complete projected text. No shared helper may
be relabeled or changed. Indexed function bodies must be versioned and rebuilt
with their indexes when implementation changes. Ordinary write identities need
EXECUTE on index functions; this is **broader than the still-pending one-size-
helper permission proposal**, and is not authorized or implemented here.

Validate exact helper ACL scope, native function volatility/collation/errors,
writer maintenance overhead, function/version invalidation, and actual GIN use
on both large and small tables without planner-setting overrides. New helper
cost metadata may change planning, but no speedup is established until measured.
The expected benefit is fewer exact-check candidates, not an evidence-backed
full-RPC latency prediction. Representative repeated-call evidence and current
source guards must pass before publication. No timeout, row cap, table omission,
cached clearance or new live action is proposed.

## Validation and retained evidence

The fresh native replay applied 465 migrations. Ninety unchanged pgTAP checks,
14 base guards and 20 indexed guards/races passed at the source hashes recorded
in their reports. Coverage includes real authenticated/service-role writes
without new grants, both writer/clearance lock orders and commit/rollback,
retirement fences, ADD/RENAME/DROP races, new-column fallback, missing and truly
invalid indexes, disabled guards and isolation. The later 64-column cap had a
separate native source assertion; all 213 source indexes stayed available.
This does not claim all races passed on a subsequent source revision.

Indexed differential tests passed 307 corpus rows (28 percent-free canonical
documents, 279 mandatory encoded candidates), literal LIKE controls, uncertain
rows, schema/type/index fallback, grants and exemptions. The 64/65-column
boundary passed separately. Earlier native checks cover 312 Boolean cases,
15 errors and 84 collation/needle controls. Managed Storage lifecycle validation
remains absent where the fixture lacks native managed statement protection; no
fake pass substitutes for it.

Core planning, lint, TypeScript, runtime, routes, UX and discovery passed at
`5dcff864`. Expo failed before application checks: npm registry DNS returned
ENOTFOUND. Archived verification 9/9, empty disposition 16/16, global retention
15/15 and 86 historical retention controls passed against the pre-CTE migration hash.
Those reports are not full-suite or native-race proof for the later CTE revision.
Full selected
database/product/sensitive checks and exact-head hosted Required Validation
remain pending. There is no PR, merge or deployment.

Persistent evidence beside the checkout:

- `brand-reference-index-performance-results.json` and setup/measure logs:
  fixture, exact query/settings, source/installed hashes and failed full call.
- `brand-reference-index-bounded-profile.json` and
  `brand-reference-index-plan-diagnostic.json`: native plans and bounded samples.
- `brand-reference-index-performance-cte-results.json`,
  `brand-reference-index-cte-residual-profile.json`,
  `brand-reference-index-cte-equivalence-results.json` and
  `brand-reference-special-predicate-error-proof.json`: the query revision's
  failed complete call, partial diagnostic, component pass and native error proof.
- Native guards/races, cap and differential reports with `brand-reference-index-`
  prefixes; Core logs in `brand-reference-index-core-validation/`.
- `brand-reference-index-checkpoint.patch` and its SHA256 manifest.

Current synthetic container/database:
`brand-ref-perf-index-20261025` / `brand_guard_90588_6b4c16fcf077`.
Old fixture: `brand-ref-perf-20261025` /
`brand_reference_plain_82020_a5e32d4c7806`. PostgreSQL is 17.6; host/image report
x86-64. Containers have no network or mounts. Local timing does not establish
production performance. Preserve fixtures and reconcile saved state before any
restart or cleanup.
