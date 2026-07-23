# Cognitive Postflight Receipt Protocol

The postflight authority computes one immutable receipt after a capability-backed
call. It binds task/project/repository/branch/platform/environment, capability and
usage sequence, call, decision manifest, approval, plan snapshot, before/after
state, untrusted tool-result envelope, actual bytes/calls/cost, leases, diff, final
commit, rollback state, evaluator state, and completion time.

Postflight rechecks expiration, emergency stop, cancellation, quarantine, approval,
provider, operation, path, leases, and budget. Result hashes are computed
internally. A caller, model, or executor cannot mark itself complete.

Failure rejects completion and invokes revocation, quarantine, or rollback policy
while preserving sanitized evidence. Success settles budget, releases leases, and
submits the receipt to the independent evaluator, which alone can return
`PASS`, `FAIL`, `INCOMPLETE`, or `BLOCKED`.
