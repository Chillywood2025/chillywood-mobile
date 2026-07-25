# Cognitive Rollback and Emergency Stop

The global emergency stop and per-component kill switches are checked before
capability use, after long-running work, and at postflight. Stop cancels child
tasks, revokes remaining capabilities, releases leases and reservations, rejects
late results, and preserves sanitized immutable evidence.

Successful rollback records the restored-state hash, revokes every write capability
used by the failed plan, releases leases, stops child tasks, invalidates the old
snapshot, and requires a new plan and capability. Only a separate read-only
diagnostic capability may remain.

Rollback failure quarantines task, branch, and capabilities; creates a critical
finding and owner escalation; preserves evidence; and stops retrying. Repository
rollback is a scoped revert of the executor’s own commit—never force reset or force
push. Database rollback is forward-corrective when immutable history exists.
