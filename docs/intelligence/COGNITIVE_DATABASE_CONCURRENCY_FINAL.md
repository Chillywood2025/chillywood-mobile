# Cognitive Database Concurrency Final

Date: 2026-07-23

Scope: disposable local Supabase only. No remote database mutation was performed.

## Source and migration preservation

- Starting source: `7d4e822c87d95594d11d7ee06d5e72e185abc8cc`
- Branch: `agent/cognitive-database-concurrency-final`
- Applied local migration head: `20260723203512`
- The five deployed cognitive migration files were not edited.
- No corrective migration was required for the tested concurrency invariants.

## Clean local verification

The dedicated local database was reset from the tracked migration history before
the final verification run.

- Full pgTAP: `723/723`
- pgTAP failures: `0`
- Parallel-session concurrency races: `13/13`

The concurrency runner is:

```text
scripts/test-cognitive-db-concurrency.mjs
```

It discovers and validates an explicit project-local Supabase Postgres container.
Every identity assertion and local service credential used by the runner is
generated in memory for that invocation and is neither printed nor committed.

## Parallel-session matrix

| Race | Required invariant | Result |
|---|---|---|
| Approval allowance claim | Two bounded allowances yield two winners; a third claimant is rejected | PASS |
| Service assertion revocation | A verifier waiting behind revocation cannot authorize after revocation commits | PASS |
| Evaluator proof | One immutable evaluator proof is accepted; the duplicate is rejected | PASS |
| Switch completion | One atomic completion applies the switch; the duplicate completion is rejected | PASS |
| Emergency stop during execution | Completion is rejected after the concurrent emergency stop; staged state remains non-live | PASS |
| Cancellation during execution | The pending side effect is rejected after concurrent task cancellation | PASS |
| Budget reservation | One reservation fits the concurrency ceiling; the competing reservation is rejected | PASS |
| Lease acquisition | One hierarchical write lease wins; the conflicting lease is rejected | PASS |
| Rollback-success authority revocation | One terminal rollback succeeds and the prior approval authority becomes `rolled_back` | PASS |
| Failed rollback quarantine | One terminal quarantine wins and the approval state becomes `failed` | PASS |
| Finding lifecycle | One current finding retains two occurrences and two immutable lifecycle events | PASS |
| Approval reinstatement | One immutable successor version is created; the competing stale renewal is rejected | PASS |
| Single-use replay | One claim wins and the replay is rejected | PASS |

## Zero-state bootstrap assessment

Severity: **P1 activation blocker**. The current implementation fails closed; this
is not an authorization bypass.

The deployed source cannot start the required Owner → worker → evaluator chain
from a database with zero Level 0/1 rows:

1. `cognitive_bootstrap_level01_canary` is a legacy service-role actor RPC. It
   directly creates the project, task, all-off switches, disabled schedules, and
   constitution before any two-party execution exists.
2. The Owner approval RPC requires an existing finalized,
   model-independence-verified decision manifest.
3. Decision manifests and their governance evidence are scoped to the Level 0/1
   task and project that do not yet exist.
4. The worker database allowlist names `bootstrap_control_plane`, but the reviewed
   worker Edge Function exposes no bootstrap action or bootstrap-specific staged
   execution RPC.
5. The governance-control Edge Function rejects non-status actions when the
   Level 0/1 task is absent.

Calling the legacy service-role bootstrap first would not satisfy the required
real two-party bootstrap. Exempting the bootstrap from model independence or
directly inserting live control-plane state would weaken reviewed boundaries.

A safe correction requires a coordinated forward-only database migration and
reviewed Edge changes that introduce a narrowly scoped exact-Owner bootstrap
intent, worker claim/staging, independent evaluator proof, atomic all-off
scaffolding completion, revocation, emergency-stop, replay, and concurrency
regressions. No such correction was added in this isolated database lane because
it crosses ownership boundaries and requires a new exact-head security review.

## Deployment conclusion

The database concurrency implementation is verified. Production activation must
remain stopped until the P1 zero-state bootstrap cycle is corrected and reviewed.
