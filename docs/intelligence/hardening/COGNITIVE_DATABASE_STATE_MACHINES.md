# Cognitive database state machines

The migration is undeployed and tested only in disposable local Supabase.

Every task-scoped object carries task, project, platform and environment. Composite
foreign keys prevent cross-scope plans, runs, evaluations, capabilities, research
citations and tool calls. Initial-state triggers reject fabricated terminal state.
Direct client writes are denied; sensitive service-role inserts and all current
state updates are withheld.

Security-definer transition RPCs use an empty `search_path`, schema-qualified
objects, exact scope/expected-state checks, a closed transition graph and immutable
events. Plan snapshots bind approval scope, source commit, required tests, graph
digest, budget and rollback. Runs/evaluations use the snapshot hash rather than a
mutable plan.

Capability consumption and budget reservation/settlement lock the current row,
prove hashed bearer/nonce material, check
cancellation/quarantine/deadline/snapshot-bound approval and fresh preflight, and
consume unique usage IDs atomically. Tool results require a postflight
reauthorization of the consumed call. Findings use `(task_id, finding_key)`,
transactional recurrence counts and immutable detection/resolution events.
Rollback failure atomically quarantines the task, revokes its remaining
capabilities, creates a critical finding and creates an owner-review request.

User-derived content is not immutable raw evidence. Bounded redacted metadata may
expire or be erased; an immutable non-personal tombstone records the lifecycle.
`OWNER_COUNSEL_RETENTION_DECISION_REQUIRED` remains a deployment blocker.
