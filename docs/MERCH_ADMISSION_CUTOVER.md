# One-time approved checkout admission pause

This operational artifact is separate from migration history. It makes no
payment/provider request and changes no financial flag, cron, order, inventory,
session, credential or webhook. Only the retained old service-role reservation
entrypoint loses execution permission. No automatic undo is permitted.

## Preconditions and execution boundary

Use the exact reviewed commit and passing canonical native CI, target project
`bmkkhihfbmsnnmcqkoly`, and explicit pause/deployment approval. Confirm the two
forward migrations remain unapplied and the old reservation definitions/owners
and effective grants match reviewed source. Confirm the new reserve RPC is not
yet service-callable: otherwise this step alone is NOT a global admission pause.
Keep live money/payout/cashout and driver activation OFF; preserve other existing
switches and all cron jobs exactly. Do not terminate transactions.

Execute `scripts/operations/merch-checkout-admission-pause.sql` as one explicit
`BEGIN; <complete file>; COMMIT;` transaction. The global retention latch is
first. Lock/statement timeout or failed grant assertions roll back the whole
operation; confirm outcome read-only before any retry. After acknowledged commit,
sample the primary database clock and record that timestamp as the cutoff.
Do NOT use transaction start, revoke statement start or deployment completion.

## Drain proof

Run `scripts/operations/merch-checkout-admission-drain.sql` in fresh standalone
read-only observations on the same primary/database. Require primary=true,
trackActivities=on, readAllStats=true, hiddenActivityRows=0, unknownActivityRows=0.
Bind systemIdentifier, database/databaseOid, postmasterStart, serverAddress and
serverPort to the pre-pause baseline; any change invalidates the drain evidence.
Use the pure `assessMerchAdmissionDrain` validator with that baseline and the
post-commit cutoff. Disabled activity tracking on another session fails closed.
Any missing field,
database/failover ambiguity or loss of visibility stops the procedure.

Wait for every transaction with transactionStart <= the recorded cutoff to end,
including idle-in-transaction sessions and lock waiters. Treat a null timestamp
on a reported ambiguous waiter as unresolved. Prepared transactions must be zero.
The query deliberately does not filter SQL text, application names or owners;
only its own observation backend is excluded. Record PID plus backendStart to
avoid PID-reuse confusion. A function call can pass its ACL check before waiting
on the latch, then allocate AFTER the revoke commits. The native test demonstrates
this case. Requests not yet admitted to PostgreSQL cannot have passed its ACL.

After database drain is established, wait at least 400 seconds using a monotonic
timer and retain server-clock observations bracketing that interval. Confirm the
hosted worker limit still applies to this project before execution. Supabase's
official limits distinguish maximum worker lifetime (150s Free/400s paid) from
the 150s request idle timeout; the latter is not a drain guarantee:
https://supabase.com/docs/guides/functions/limits
Logs/version readback corroborate, but do not replace, the database cutoff and
worker bound. Do not infer global old-version retirement from ACTIVE metadata.

Recheck effective old grants and database drain at the end. Any old allocations
or provider ambiguity remain historical and are never released/reclassified by
this operation. No live worker/provider invocation is used as a smoke test.

## Forward cutover and failure posture

Keep admission paused while deploying the exact new checkout closure against
old schema (it fails before allocation). Apply the reviewed provenance migration
`20261101045810` atomically with its exact history entry only after drain; this
grants the new reserve RPC and therefore ends the database admission pause.
Apply `20261101045816` atomically with its exact history entry and deploy the
matching cost worker then driver closures. Preserve JWT config and flags.
Read back exact schema/grants/history/deployed closures and baseline controls.

On failure before new admission is installed, leave old execution revoked. Do
not automatically restore it or roll back to unsafe old Edge. A forward recovery
decision needs review. App OTA recognizes exact authoritative aborts only; it
must never retry or replace an ambiguous attempt automatically.

## Evidence boundaries

The registered disposable-clone native runner retains all ten existing schedules
and adds a real preauthorized waiter under the latch, actual revoke, post-commit
denial, idle transaction visibility and retained new owner-wrapper compatibility.
The full-schema PGlite test checks artifact rollback/grants, not contention or
worker lifetime. Production pause/drain and the 400-second wait are separate
deployment evidence; neither local tests nor CI claim those have occurred.
