# Cognitive Level 0/1 Rollback Plan

Status: source rollback controls implemented; deployment rollback not exercised.

Fail-safe controls:

- all new sentinel switches default false;
- legacy direct Owner switch RPC fails closed;
- service claims require active immutable approval version;
- expired, revoked, consumed, wrong-scope, and replay claims fail closed;
- emergency stop is rechecked before claim and during execution transitions;
- post-side-effect Owner revocation or emergency stop blocks success completion
  but still permits cleanup-only rollback/quarantine settlement;
- failed rollback can quarantine the execution and preserve immutable evidence.

Rollback states:

- `rollback_pending`
- `rollback_running`
- `rollback_succeeded`
- `rollback_failed`
- `quarantined`

Rollback success marks the approval version `rolled_back`. Rollback failure marks
the approval record failed/quarantined and requires Owner review before further
authority can be issued.

Discard procedure for this source branch:

1. Do not merge the successor PR.
2. Delete the successor branch if no longer needed.
3. Leave frozen PR #18 and review-only PR #20 untouched.
4. Do not deploy the additive migration or Edge Functions.
