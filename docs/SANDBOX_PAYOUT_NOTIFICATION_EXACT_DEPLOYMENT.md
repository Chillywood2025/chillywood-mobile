# Exact sandbox payout notification observer deployment

This is source preparation, not deployment authorization or proof of a phone
notification. The product migration is already immutable:

- Project: `bmkkhihfbmsnnmcqkoly`.
- Version: `20261105010859`.
- Name: `sandbox_cashout_status_notifications`.
- SHA256: `032e549b053e368eef177e23579cd2f6a6db6bce34a908b68ba6ac82b4edb0dc`.

Use only `scripts/sandbox-payout-notification-exact-deploy.mjs`. The older
`sandbox-cashout-exact-deploy.mjs` deploys a different migration and must not be
repurposed. Never use an unversioned migration submission, select another pending
migration, change the timestamp, or edit history to compensate.

## Source and scope

The dedicated wrapper binds a full committed source SHA, immutable migration
bytes, its tool dependency closure, and reviewed before/after selected catalog
contracts. Modified, missing, or uncommitted closure files are rejected. The
contracts bind full selected function definitions and raw ACLs, the live
six-column migration-ledger shape and absence of ledger rewrite rules, and the
definitions, ACLs, owners, enabled states and tags of all eight measured live
DDL event hooks. Those hooks are preserved, never disabled for this rollout. The
read-only planning path does not authorize an apply. With the exact full
committed SHA substituted for `SOURCE`, the command modes are:

```sh
# Offline review packet only; no credentials or network required.
node scripts/sandbox-payout-notification-exact-deploy.mjs --source SOURCE
# Fresh live preflight, read-only.
node scripts/sandbox-payout-notification-exact-deploy.mjs --source SOURCE --check
# Only after separate action-specific authorization.
node scripts/sandbox-payout-notification-exact-deploy.mjs --source SOURCE --apply
```

There is no caller-supplied baseline, migration-path, version, or force override.

After ordinary exact-head Required Validation and diff review, a live apply
still requires explicit action-specific authorization naming the project,
migration, and bounded effects. Source merge permission is not database write
permission. There is no additional admission PR or reviewer requirement beyond
the live repository rules.

The only permitted effects are the notification-type constraint extension,
private observer functions and trigger, and the two notification wrappers in
the exact migration, plus its exact history row. The pre-existing anon SELECT
grant on `public.notification_preferences` is preserved, not silently repaired.
Selected catalog matching does not establish total source/live schema parity.

## Execution and reconciliation

### Changed concurrency contract: fresh deployment approval required

The managed production `cron.job` is owned by `supabase_admin`. The deployment
writer `postgres` has SELECT but no UPDATE, DELETE, TRUNCATE or MAINTAIN privilege
on that table. The earlier procedure attempted an unsupported strong lock and
failed before the migration body. This revised procedure makes no permission or
role change and does not retry that attempt. Its offline packet and execution
receipt label cron as `observed_not_locked`, with
`independentCronEditsExcluded: false` and `freshDeploymentApprovalRequired: true`.
Prior approval for the stronger guarantee must not be reused for execution.

All 26 original application, control and migration-history relations retain
their SHARE ROW EXCLUSIVE locks. Read-only preflight checks the intended writer's
schema usage and strong-lock capabilities on those relations, plus SELECT/USAGE
for cron. The transaction checks capabilities again before acquiring locks.
The immutable migration, selected catalog and history contracts are unchanged.
It contains no schedule, provider, credential or activation operation.

Cron is read before and after DDL, and rows visible to the transaction's writer
remain included in the observed data digest. Visible independent cron edits cause rollback when seen by an
in-transaction check. **Cron is not frozen:** an independent privileged owner/API
can change cron after the final observation and before commit, or immediately
after commit. Such a change does not have to abort the observer transaction.
Readback can therefore find exact committed observer history alongside drift in
the notification worker's schedule, active flag or command hash. That is an unconfirmed outcome requiring reconciliation, never a reason
to resubmit the migration. Do not describe matching snapshots as exclusion of
all concurrent external schedule edits.
The complete visible cron-row digest is transaction-local, not persisted into
post-commit readback. Unrelated cron edits or other fields outside the selected
worker schedule readback may therefore be absent from post-commit diagnostics.

The application locks serialize canonical notification worker configuration and
disable operations at their worker-config write, preventing their config/cron
mutation while this transaction holds the lock. Configure can inspect Vault and
create a missing token before reaching that write: the application lock does
**not** exclude all earlier side effects of another actor's configure call.
Tests use an existing, explicitly synthetic clone token and roll back the
competing calls. Independent cron-owner edits bypass this application lock.

This narrower guarantee is not equivalent to cron immutability. ACCESS SHARE,
advisory locks and SERIALIZABLE do not restore the excluded guarantee: independent
writers need not cooperate, and a one-way serializable dependency can commit.
Review and fresh approval must explicitly accept the concurrent external cron
edit risk. No production grant, role change, cron disable or provider operation
is part of this procedure.

Immediately before applying, obtain fresh read-only history, selected catalog,
control, worker, cron, and data observations. Drift or a partial target blocks
the operation. The wrapper locks its explicit 26 application/control/history
relations with bounded timeouts and
rechecks inside the transaction. DDL, exact version/name/single-statement-array
history insertion, and postchecks commit together or roll back together.

An already-applied exact target is reconciled read-only. A lost or failed write
response is followed by exact readback, never automatic resubmission. An
unconfirmed result is not success and is not permission to retry: independently
reconcile target history/body, catalog, old history, controls, and data first.
Write and reconciliation failures retain only finite allowlisted diagnostic codes
in `writeFailureCode` and `readbackFailureCode`. Arbitrary error messages, SQL,
HTTP bodies and credentials are never included. A classified error does not by
itself establish whether a transaction committed.

No Edge upload, provider call, credential/config change, cashout activation,
backfill, synthetic notification, mobile build, or OTA is included. Do not stop
cron to obtain a lock. The activity worker is already enabled with a 10-second
schedule; future genuine sandbox phase changes can therefore generate attempts
after deployment. Cashout being disabled does not make this observer permanently
dormant.

## Evidence limits

Focused transport tests cover read-only defaults, drift/partial-target refusal,
source binding, already-applied reconciliation, and one-write-only uncertain
outcomes. Disposable full-schema SQL replay tests cover exact history/body,
atomic rollback on mid-apply/postcheck failure, and unchanged prior history,
unrelated catalog, table grants, controls, worker/cron and table data. These are
local fixtures with no provider or production data. PostgreSQL WASM replay is
not native-server lock-concurrency evidence. Run the transport and full-schema
fixtures with:

```sh
node --test tests/sandbox-payout-notification-exact-deploy.test.mjs
node --test tests/sandbox-payout-notification-exact-deploy-postgres.test.mjs
```

The optional `PAYOUT_TEST_PGLITE_DIRECTORY` points only to a local installation
of the pinned PGlite 0.4.6 test engine to replay PostgreSQL 17 in addition to the
repository's PostgreSQL 18 WASM engine. No remote database URL is accepted by
these fixtures. The separate native proof runner uses an owned disposable clone
of the local Supabase CLI database, never a production target. It is wired into
the required Database CI job. It uses real PostgreSQL locks held by a synthetic
worker-table transaction; this is not proof of execution by the scheduled
activity worker. Local WASM checks do not substitute for that native CI result.
The native fixture models the managed cron owner and SELECT-only deployment role
without granting it cron write privileges. It tests success under that actual
capability boundary, canonical worker configuration/disable contention, rollback
when an independent cron edit is visible, and a deterministic after-final-check
edit that can commit alongside the observer. The last test proves the documented
limitation rather than claiming to prevent it. Read-only already-applied
reconciliation remains possible without application strong-lock capability.

Operational proof remains separate: an authentically qualified sandbox provider
flow, the selected account's current login and bound phone registration, the
in-app milestone, physical phone display, and authenticated tap destination.
Provider acceptance alone is not display proof. Recovery after a committed
deployment is a separately reviewed forward migration, never history deletion
or disabling unrelated notification lanes.
