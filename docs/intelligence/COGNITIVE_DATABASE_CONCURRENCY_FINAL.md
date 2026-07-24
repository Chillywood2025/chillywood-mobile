# Cognitive Database Concurrency Final

Date: 2026-07-23

Scope: disposable local Supabase only. No remote database mutation was performed.

## Source and migration preservation

- Starting source: `7d4e822c87d95594d11d7ee06d5e72e185abc8cc`
- Branch: `agent/cognitive-database-concurrency-final`
- Applied local migration head: `20260724023712`
- The five deployed cognitive migration files were not edited.
- New forward-only correction:
  `20260724023712_cognitive_zero_state_two_party_bootstrap.sql`

## Clean local verification

The dedicated local database was reset from the tracked migration history before
the final verification run.

- Preserved pgTAP baseline: `723/723`
- Zero-state bootstrap pgTAP: `46/46`
- Full pgTAP: `769/769`
- pgTAP failures: `0`
- Parallel-session concurrency races: `17/17`

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
| Bootstrap claim | One pre-task worker claim wins; the duplicate claim is rejected and no live task exists | PASS |
| Bootstrap revocation | Owner revocation wins before the waiting evaluator; no evaluator proof or live task is created | PASS |
| Bootstrap emergency stop | Completion waiting behind emergency stop is rejected with no partial task or switch rows | PASS |
| Bootstrap completion | One completion atomically creates the all-off control plane; the concurrent replay is rejected | PASS |

## Zero-state bootstrap correction

The prior zero-state cycle was confirmed as a **P1 activation blocker**. The new
forward-only migration corrects it locally without changing the five deployed
migration files.

The correction adds an isolated pre-task domain with FORCE RLS and no direct
table privileges for `anon`, `authenticated`, or `service_role`:

1. Exact Owner records an immutable, 24-hour-bounded bootstrap approval.
2. The approved-action worker claims exactly once.
3. Worker staging derives an execution receipt inside Postgres and creates no
   project, task, constitution, switch, or schedule.
4. The distinct independent evaluator records one receipt-bound verdict.
5. Completion accepts only the matching passed proof and atomically creates the
   control plane with ten switches off and five schedules disabled.

The forward migration revokes `service_role` access to the legacy
`cognitive_bootstrap_level01_canary` RPC. A regression proves that invoking that
legacy entry point is denied and creates zero live rows.

Owner revocation and the exact-Owner cognitive emergency stop remain unilateral
fail-closed controls. Concurrent claim, revocation/evaluator,
emergency/completion, and duplicate completion races are covered by real
parallel Postgres sessions.

## Sanitized Edge contract

- Owner:
  `governance_record_bootstrap_approval(repository, branch, source commit, retention hash, constitution hash, rollback hash, evaluator requirement hash, policy version, validity seconds)`
- Worker claim:
  `governance_claim_bootstrap_control_plane(approval ID/hash, target hash, exact approved tuple, worker identity/assertion)`
- Worker stage:
  `governance_stage_bootstrap_control_plane(execution ID, approval hash, target hash, worker identity/assertion)`
- Evaluator:
  `governance_record_bootstrap_evaluator_proof(execution ID, receipt hash, proof hash, verdict, evaluator identity/assertion)`
- Worker completion:
  `governance_complete_bootstrap_control_plane(execution ID, receipt hash, proof hash, worker identity/assertion)`

The canonical target is the SHA-256 digest of the UTF-8, pipe-delimited tuple:

```text
bootstrap_control_plane|repository|branch|sourceCommit|retentionHash|constitutionHash|rollbackHash|evaluatorRequirementHash|policyVersion
```

## Deployment conclusion

The database correction is locally verified. It has not been applied remotely.
Production activation must remain stopped until the exact combined database and
Edge source passes final security review and this forward-only migration is
deployed through the authorized coordinator.
