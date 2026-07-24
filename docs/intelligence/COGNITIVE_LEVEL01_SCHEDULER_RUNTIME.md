# Cognitive Level 0/1 Scheduler Runtime

Status: `SOURCE_READY_ACTIVATION_PREREQUISITES_BLOCKED`

The `cognitive-level01-scheduler` Edge Function evaluates the five existing
schedule definitions and can dispatch one due occurrence through the reviewed
child-task factory. It cannot enable a switch or definition and cannot mutate
product state.

## Exact evaluation behavior

The evaluator reads the exact control task, switches, canary receipts,
credential attestation, emergency state, and five definitions. It verifies:

- repository, project, platform, and production environment scope;
- active emergency state;
- exact cadence, task, cost, and timeout caps;
- fresh evaluator-passed canary evidence;
- prerequisite research, memory, sentinel, deliberation, and draft-PR
  switches;
- a current GitHub credential attestation for draft-PR outcomes;
- `cognitive_user_derived_memory_enabled=false`;
- `cognitive_level2_production_repairs_enabled=false`;
- a reviewed fresh-task factory.

Activation eligibility is separate from dispatch eligibility. A definition can
be ready for Owner activation while dispatch remains impossible until both the
master switch and that exact definition are enabled.

Blocked evaluation returns `dispatchDecision=no_work`. Blocker output has a
deterministic digest and the policy
`notify_on_blocker_digest_change_only`, so an unchanged provider/device/control
blocker does not generate repeated noise.

## Fresh task requirement

Recurring research cannot reuse the long-lived
`cognitive-level01-canary-control` task. Existing source and claim uniqueness is
`(task_id, dedupe_key)`, so control-task reuse would make a valid refreshed
source collide with an earlier retrieval.

Every scheduled execution receives a new bounded child
`intelligence_tasks` row with:

- the same project, repository, platform, and environment;
- a parent objective/scope binding;
- a schedule-key plus due-window dedupe key;
- a bounded deadman;
- bounded non-personal retention;
- maximum task/cost/time inherited from the definition;
- a dedicated `intelligence_budgets` row with immutable model-cost,
  model-token, tool-call, tool-byte, child-task, concurrency, and deadline
  ceilings;
- no private or user-derived data;
- cancellation, quarantine, emergency-stop, and evaluator requirements;
- no authority to reuse the control task.

The new forward migration adds the closed
`cognitive_level01_issue_recurring_child_task(...)` RPC. The runtime probes
`cognitive_level01_scheduler_task_factory_status(...)` and treats a missing or
incomplete result as `FRESH_SCHEDULE_TASK_FACTORY_REQUIRED`.

Dispatch additionally requires the server-only
`COGNITIVE_LEVEL01_SCHEDULER_ASSERTION`, an Owner-issued expiring and revocable
capability for the exact definition, exact minute-aligned due time, exact
idempotency and objective hashes, and a database recheck of all prerequisites.
The RPC rejects replay, stale windows, altered scope, extended budgets,
control-task reuse, Level 2, user-derived memory, and
disabled/emergency-stopped schedules.

## Per-schedule prerequisites

| Schedule | Additional prerequisites |
|---|---|
| `daily_platform_policy_security` | research and non-personal memory switches; all three research canaries fresh within seven days |
| `daily_non_personal_support_observability` | research and non-personal memory switches; fresh platform-policy and repository-architecture research |
| `weekly_ux_route_dead_control` | installed-journey and approved-baseline visual sentinel switches; fresh evaluated installed Android/iOS evidence |
| `weekly_architecture_dependency` | fresh repository-architecture and dependency-security evidence |
| `weekly_experiment_outcome` | collective deliberation, draft-PR executor, current GitHub attestation, and all three evaluated draft-PR canaries within 30 days |

Missing canaries, model independence, GitHub credential, installed evidence, or
Owner activation do not prevent one-off sentinel, research, LiveKit, iOS, or
credential work from continuing independently. All five schedule definitions
and the master schedule switch remain off until their actual prerequisites
pass.
