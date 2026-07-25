# Cognitive Postflight Receipt Protocol

The postflight authority computes one immutable receipt after a capability-backed
call. It binds task/project/repository/branch/platform/environment, capability and
usage sequence, call, decision manifest, approval, plan snapshot, before/after
state, an untrusted credential-isolated tool-result envelope, actual
bytes/calls/cost, the exact lease consumed by the call, diff, final commit,
rollback state, and completion time.

Postflight rechecks expiration, emergency stop, cancellation, quarantine, approval,
provider, operation, path, leases, and budget. Result and decision hashes are
computed internally. The broker receipt must contain the same before/after state,
diff, final commit, resource type, and resource key. A caller, model, or executor
cannot mark itself complete.

Failure rejects completion and invokes revocation, quarantine, or rollback policy
while preserving sanitized evidence. Success writes a single immutable usage
settlement, releases unused byte/cost reservation and the exact lease, and submits
the receipt to the independent evaluator. Evaluation creates a separate immutable
verdict bound to trusted runner evidence, the final commit, and diff. Only that
verdict may authorize completion or a draft-PR canary.
