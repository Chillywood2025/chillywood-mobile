# Brand global retention integration

This is source integration, not production activation or provider qualification.
All existing settings remain unchanged; the new Brand `batch_enabled` gate
defaults to false. No schedule, deployment, provider request, credential, or
historical scan proof is created by the migration.

Database installation on 2026-10-25 at 03:30:57 UTC recorded canonical version
`20261025033057_platform_brand_global_retention_integration`, with SQL SHA-256
`c91f39dabcc6ba28eb1b8f99e465103bf7ee3b0b006c4e7b1df16a5f418d2128`.
The source filename matches that immutable identity; the SQL is byte-identical.
Installation is not worker deployment, provider qualification or activation.
Post-installation readback at 03:31:47 UTC found all global and Brand activation
gates off and no retention schedule.

## Authority and clocks

Global capture delegates Brand assets to their existing immutable incarnation.
The authoritative removal and retention deadline remain `removed_at` and
`retain_until = removed_at + interval '720 hours'`. A global capture uses those
exact timestamps. Matching older generic records receive an immutable
delegation link without rewriting the historical record or restarting its
clock. The separate Brand due reader always uses the original Brand deadline.

Generic text expiry reports `delegated_brand_lifecycle`; it never hard-deletes
Brand sources, proof, claims, or permanent key-nonreuse tombstones. The generic
text queue excludes delegated Brand work to avoid starving unrelated text work.

The generic dispatcher otherwise preserves the prior text-only implementation
exactly. It never selects, returns, creates or refreshes orphan-stage leases;
those belong only to `list_deleted_content_stage_cleanup_work()`. Missing global
settings fail closed, just like a disabled text gate. The global worker runs the
text pass before cleanup, so leasing stage work here would starve the later pass.

## Admission and coverage

Only the Brand table's former secondary-coverage trigger is replaced. The shared
secondary function and rendition/transcode triggers are unchanged. A new exact
Storage incarnation can register while its scan is pending, so its AFTER trigger
can enqueue the real scanner job. Pending/unclean/unproved assets never become
expiry-authorized by registration or an asset `scan_status` alone.

Global readiness classifies Brand identity/generation and current scanner-byte
proof separately from provider qualification, batch activation and worker health.
Live draft/publication references and legal holds do not erase protocol coverage;
they remain independent deletion blockers in the existing exact claim/recheck.
Unknown locator-bearing tables, missing/conditional/disabled guards, legacy key
aliases, unsupported S3 rows, missing generations, and stale receipts stay blocked.
All non-Brand readiness blockers remain in force.

## Bounded processing and failures

The global worker reads at most 25 due Brand asset IDs. Dispatch is serialized
and each asset waits one hour before redispatch, without moving its retention
deadline. Global capture/media expiry and Brand expiry/batch gates must all be
enabled, and Brand provider/guard qualification must be current. Batch-only
claim/read bridges recheck these gates and the dispatch before delegating to the
existing exact transport. A qualified read is still an irreversible exact claim,
not a cancellation guarantee for an already-issued provider request.

Each selected asset uses the existing version-specific DELETE and HEAD transport.
There is no unversioned fallback, prefix listing, prefix deletion or network retry
on an uncertain RPC. Crashes are recoverable through the existing immutable claim
and scanner evidence, including after Storage metadata disappears. A durable
`observed_absent` transport result ends redispatch; it proves only the provider
API observation, never permanent absence from backups or the underlying provider.

Brand batch outcomes and health are separate from R2. A failed/unconfirmed Brand
claim, transport, receipt or heartbeat yields an unsuccessful worker response;
an R2 success cannot refresh the global success heartbeat over that failure.
Disabled probes prove liveness only. Held/reference/contended results remain
explicit outcomes, not successful deletion claims.

## Lock ordering and verification

Brand operations take SHARE on the existing global reference-fence latch before
advisory lock `(176214,30)`. Global activation/re-enable already takes UPDATE on
that latch before readiness. The three Brand scanner-byte entry paths use this
same helper; other shared retention/security guards are not rewritten. Existing
source/storage/scanner NOWAIT checks avoid waiting on inverse row-lock ordering.
The two inherited Brand removal/registration row waits now also use NOWAIT,
preserving their complete authorization bodies while failing contention with
SQLSTATE 55P03. The migration takes its eventual ACCESS EXCLUSIVE Brand source
lock first, before archive DDL and legacy adoption, so it drains existing
removals without a later relation-lock upgrade cycle.

The full-stack PGlite regression executes actual current global and Brand
migrations. The native disposable PostgreSQL test uses independent backends and
observed lock queues for activation/re-enable versus upload, removal, proof,
holds and references. Native results are supplied by Required Validation, not
inferred from PGlite or static source tests. Provider capability, writer drain,
fresh real scanner evidence, deployment and scheduling remain separately required.

### Pre-deployment correction

The first source integration accidentally restored obsolete stage dispatch in
the generic text reader and changed its missing-settings guard to a nullable
Boolean check. Initial review and tests missed both differences. Read-only live
preflight found them before the Brand migration or worker was deployed. The
unapplied migration was corrected to the predecessor body plus only the Brand
filter; no deployed migration or live setting was changed for that correction.

Regression coverage now compares that complete function definition, exercises
text-first then real cleanup-queue ordering on the full migrated schema, checks
missing-settings behavior with due work, and deliberately reintroduces each bug
in disposable mutation controls. Native pgTAP also checks that fresh and expired
stage leases remain available to their own cleanup queue. These controls test
dispatch isolation, not provider deletion or live qualification.

## Abort and recovery

Source validation does not authorize applying this migration. If an authorized
rollout later needs to stop new batch work, its separately authorized control is
to disable the Brand batch gate; already-issued irreversible claims or requests
are not cancelled by that flag. Keep incarnation, proof, dispatch results and
nonreuse tombstones intact, and use forward-only corrective migrations rather
than removing schema or rewriting prior migrations. Failed migration statements
roll back with their transaction, including legacy delegation adoption.
