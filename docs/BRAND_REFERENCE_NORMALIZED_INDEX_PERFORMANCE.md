# Brand reference performance recovery and qualification

The recovered source addresses repeated canonical-document projection and
normalization during absence checks. It normalizes bounded locator documents
when maintaining a GIN expression index, materializes possible matches, and
retains the exact reference matcher for every candidate. Qualification requires
all native gates below to pass for the exact proposed commit. The canonical
CI run and its source-hashed artifacts are authoritative for subsequent native
results; the initial recovery evidence below does not establish a native pass.
No production operation occurred during recovery or qualification.

## Source and correctness boundaries

The two new, undeployed migrations are
`20261025121430_platform_brand_reference_scan_performance.sql` and
`20261025141347_platform_brand_reference_candidate_indexes.sql`. The latter's
tested SHA256 is
`1e8614232cbbd1df2190034c63f3e7367c122616c180cd3808d2c32d7f5230fd`.
The original shared normalizer remains unchanged.

Two immutable, invoker functions perform supplied-data computation only. The
size helper returns the exact serialized byte count up to 1 MiB or an
exact-check marker for deeper/oversized data. It catches only SQLSTATE 54000;
54001, cancellation, memory exhaustion and other errors propagate. The frozen
normalizer copies the shared four-pass body literally. These functions receive
PUBLIC EXECUTE so existing writers can maintain indexes, without added schema
usage or data authority.

The integrated DDL guard in `extensions` freezes helper bodies, attributes,
owners and OID-based ACLs. It survives a cascade of `private`. Deliberately
disabling/removing the guard, including its `extensions` namespace, remains
outside its active lifetime guarantee.

The guard is bound to the installed helpers' catalog identities. A logical
dump copied into another database cannot reuse its serialized OID fingerprint.
The disposable-clone adapter in `scripts/lib/brand-guard-clone-restore.mjs`
validates and replaces only that serialized guard with the identical migration
installer under its original owner after restoring the clone. It requires both
event bindings and rejected helper mutations before the clone is used. This
also respects Supabase's requirement that an event-trigger creator and its
function owner have matching superuser status. A general logical restore needs
the same explicit reinstallation and verification procedure; a bare dump
restore is not qualified. Restored index-registry OIDs do not transfer index
qualification, so mismatched entries retain the exact scan.

Unsupported types, depth, size, relation shapes, schema changes, changed helper
or index metadata, and special reference predicates retain the exact full scan.
Every table, writer guard, hold, generation and latch check remains in place.
There is no cached clearance decision. A recovery correction additionally
disables candidate filtering when `gin_fuzzy_search_limit` is nonzero:
[PostgreSQL documents that this setting can return a random subset of GIN results](https://github.com/postgres/postgres/blob/REL_17_STABLE/doc/src/sgml/gin.sgml),
which cannot establish absence. The original exact scan then remains active.

## Initial recovery evidence

All runs below used synthetic PGlite PostgreSQL 18.3/WASM component fixtures;
they do not prove native PostgreSQL 17.6 plans, concurrency or latency.

| Initial component check | Result | Evidence in the recovery workspace |
| --- | --- | --- |
| Normalized expression, helper/ACL/error equivalence, uncertain-row fallback and lossy GIN setting fallback | 5/5 passed | `brand-repair-normalized-components.log` |
| Matcher parity, candidate/index invalidation, literal needles, CTE/exemption behavior | 7/7 passed | `brand-repair-scan-index-components.log` |
| Helper mutation, owner/ACL changes, private-schema cascades and atomic restoration | 28 checks passed | `brand-reference-normalized-ddl-pglite-cascade-repair.json` |

The DDL report was generated before a report-description correction: its text
claiming the guard is outside the migration is stale. The report's
`guardIntegratedInMigration: true`, source SHA256 and executed SQL identify the
actual integrated source. Its measured SQL has not been relabeled as native.

The Docker CLI returned its version, but the local engine's read-only ping
timed out. No original container was restarted or modified. An official
PostgreSQL 17.6 source archive was downloaded and its published SHA256 verified
for a task-local build. Compilation of configure's first test succeeded; running
that test stalled for over five minutes in macOS `U` state with zero CPU time.
Only the task's build processes received TERM. No PostgreSQL server or new
native database was created. The configure log remains under
`brand-native-runtime/`; this was a local environment blocker, not a passed build or
evidence about query performance.

## Historical evidence and the rollback correction

The preserved October 25 normalized pilot passed on 3,599 synthetic rows with
3.895 ms execution and 4.278 ms planning. Building the normalized index on
429,749 rows then reached its 180-second setup timeout at 17:33:28 UTC, before
its query ran. The earlier complete-clearance implementation had already
failed at 30,047.838 ms under the unchanged 30-second runtime limit.

A **later historical audit at 17:37:54.079 UTC** recorded
`rollbackVerified: true` for that failed large normalized index transaction:
the previous large-table index OID 40004 was restored, valid and ready, with
matching expression metadata. The successful small pilot and prior helper
installation remained committed. That is a recorded audit of that transaction,
not a fresh recovery-time database check or a rollback of all prior work.
See the immutable retrieval package's `rollback-evidence-scope.json` and
`preserved-artifacts/brand-reference-normalized-pilot-audit.json`.

## Native acceptance gates

Native harnesses require `BRAND_REFERENCE_TEST_CONTAINER` to name a new
`brand-ref-perf-recovery-*` or `brand-ref-normalized-recovery-*` fixture.
Historical evidence alone cannot select a target. A task-local PostgreSQL
transport is supported through an explicit `BRAND_REFERENCE_LOCAL_PG` manifest;
it verifies task-owned files, a private socket, no TCP listener, and the fresh
cluster system identifier. It reports that runtime honestly as native macOS,
separate from the Supabase Docker image. Initial local checks established syntax
only. Subsequent native execution and outcomes must be read from the exact-commit
canonical CI artifacts described below.

Complete these gates on a responsive isolated native runtime, preserving
source hashes and each attempt's evidence:

1. Replay the source chain in a fresh cluster; pass native guards, pgTAP,
   semantic/collation parity and immutable-helper DDL checks. The canonical
   managed Supabase database lane remains a separate requirement.
2. Pass ordinary writer/index maintenance, trigger/generation races, and the
   corrected `--failure-tail` isolation/lock-timeout checks. SQLSTATE 25000 is
   the expected isolation rejection; historical preceding writer checks do
   not establish that corrected tail passed.
3. Run `brand-reference-normalized-pilot-native.mjs`. Its 3,599/429,749-row
   pilots create new synthetic objects, keep setup at 180 seconds and queries
   at 30 seconds, use default planner settings, and always roll back. Independent
   catalog/registry readback is required after each transaction.
4. Only after both pilots and rollback checks pass, run the complete native
   benchmark setup and measurements: 1.7 million rows across 354 populated
   tables, 17,000 encoded documents, single and repeated complete clearance and
   archived authorization calls within the unchanged 30-second budget. Verify
   actual indexed plans and zero exact matching/normalization for absent
   bounded candidate sets. A setup failure records its own rollback readback;
   earlier committed batches are explicitly outside that rollback's scope.
5. Prove actual >1-GiB escaped JSONB serialization returns 54000 and the helper
   returns 1,048,577 in a separate memory-bounded container. The supplied
   overflow harness never targets the retained benchmark. OOM, cancellation,
   inadequate headroom or unavailable Docker is incomplete evidence, never a
   pass. Do not run the large allocation concurrently with other test loads.

The historical large index timeout requires native measurement. PostgreSQL
notes that [GIN build time is sensitive to maintenance work memory](https://github.com/postgres/postgres/blob/REL_17_STABLE/doc/src/sgml/gin.sgml);
that possibility was not established as the root cause by the initial component
tests. Raising timeouts or weakening exact fallback is not an accepted repair.
No publication, deployment or production performance claim follows from these
component results.

## Isolated GitHub Actions qualification

The `database-brand-native` job (`Validation / Brand Native PostgreSQL 17.6`)
in `.github/workflows/required-validation.yml` runs the concrete
`tests/brand-reference-native-ci.mjs` sequence on a fresh Ubuntu runner when a
database-applicable pull request is opened or updated. It uses `contents: read`, no secrets,
no deployment, pinned actions and a 75-minute overall deadline. The source
checkout/setup pins come from the repository's existing workflow; upload-artifact
v7.0.2 was resolved through its official GitHub ref to
`cf430e030ddbb5b0abf93d22962f4752f3646cd9`, and its pinned `action.yml` confirms
Node 24. The job depends on the conservative database plan, contributes to
`Validation / Results`, and is included in the protected publisher's expected
jobs for that same applicability. Brand harness/fixture paths select the
database category. Failed, missing and stale applicable runs fail closed.
For the pull request introducing this policy update, its exact native run must
also be reviewed before merge while protected main still has the prior policy.

The historical `public.ecr.aws/supabase/postgres:17.6.1.159` resolves to registry
manifest digest `sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f`.
The runner pulls `ghcr.io/supabase/postgres@` followed by that exact digest,
without a floating-tag fallback, and verifies it in `RepoDigests`. Docker's local
image/config ID is recorded separately and checked against the created
container. Historical evidence sometimes labeled the manifest digest as an
image ID; the first CI attempt exposed that distinction before creating any
fixture. The next attempt hit ECR's anonymous download limit before any fixture
was created. Supabase's [official mirror workflow](https://github.com/supabase/postgres/blob/920bb634698fef8dee6e78d738330d2dd8e489c5/.github/workflows/mirror.yml)
publishes to both ECR and GHCR. An anonymous read of GHCR returned the identical
OCI index bytes and digest; its linux/amd64 manifest is
`sha256:617b62a16858dc8436c1ded1970fa13e33539feb4c98b580cf6274b46b2ab1ef`
and config ID is `sha256:1131ee74b2d711ec69ebb078a3ea87042c5bde7a5849aaa21ea868371be21fc7`.
The registry change needs no credentials and leaves runtime verification intact.
It verifies amd64, native server
170006 and no TCP listener. The newly named main container has no network,
mounts or published ports, 4 GiB memory and no swap. Existing fixtures cannot be
adopted. The source replay has managed-service doubles and does not replace the
canonical managed Supabase lane.

The runner executes native guard/pgTAP replay, semantic and DDL checks, writer
and DDL races, corrected failure-tail tests, both rollback-verified pilots, then
the full 1.7-million-row setup and single/repeated clearance and archived RPC
measurements. It stops at the first failed gate. The main server must stop
gracefully before a separate 3-GiB/no-swap overflow container runs, with at least
4 GiB observed headroom. This capacity covers the historical 1.5–3 GiB estimate;
the actual overflow statement retains its 30-second limit. OOM still fails.
Shutdown requires independent exited/no-OOM/zero-exit container state and fresh
smart-shutdown/completion logs bounded by the request and container finish time.
The waiting `pg_ctl` client may exit 137 when PostgreSQL PID 1 exits; that client
status is accepted only with all of this independent clean-shutdown evidence.

Every attempt copies JSON reports and stage/PostgreSQL logs, with SHA256s, into
`brand-native-evidence` inside the checkout and uploads that directory even on
failure. The collector also runs in an unconditional workflow step; artifact
upload never uses parent-directory patterns, which upload-artifact v7 rejects.
The top-level report is `brand-native-ci-summary.json`; detailed native results
include `brand-reference-index-native-guards.json`,
`brand-reference-index-native-races.json`,
`brand-reference-normalized-pilot-native.json`,
`brand-reference-index-performance-results.json`, writer/failure-tail JSON, and
`brand-reference-normalized-overflow-native.json`. Artifact names alone are not
claims that CI passed: inspect the exact commit, summary, every gate and cleanup
result. The local `--plan` command and
syntax checks do not run Docker or establish native performance.
