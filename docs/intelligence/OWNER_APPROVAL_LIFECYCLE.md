# Owner Approval Lifecycle

The default approval window is exactly 24 hours with an exclusive expiration
boundary. Database time is authoritative after deployment.

An approval version binds objective, project, repository, branch, platform,
environment, provider, resources, actions, paths/tables/functions, maximum risk,
cost, calls, bytes, executions, required tests, evaluator, rollback, decision
manifest, start, and expiration.

Tool capabilities are separate and expire in 15–60 minutes. They may renew during
an active approval only with identical task, decision, scope, target, platform,
provider, budget, tests, and rollback. Renewal cannot widen scope. Cancellation,
resolution, supersession, quarantine, emergency stop, a new blocker, budget
exhaustion, or execution exhaustion blocks renewal.

Owner notifications are bounded to activation, execution start, material
adaptation, provider waits, blockers, rollback, no-work completion, 12-hour and
2-hour warnings, expiration, reinstatement, amendment, and completion.
