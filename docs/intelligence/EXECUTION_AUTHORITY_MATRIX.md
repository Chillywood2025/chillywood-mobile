# Cognitive Execution Authority Matrix

Status: `SECURITY_HARDENING_IN_PROGRESS`

This matrix describes cognitive foundation authority only. It does not assert
that owner/operator-controlled manual build, release, or provider workflows are
absent from the repository.

| Action | Foundation authority |
|---|---|
| Create branch | Allowed by validated structured plan |
| Edit allowlisted source | Allowed on a `codex/*` draft branch |
| Add tests and run local validation | Allowed within caps |
| Commit and normal push | Allowed on scoped branch |
| Open/update draft PR | Allowed |
| Produce migration/deployment plans and evidence | Allowed; deployment is not |
| Merge | Forbidden |
| Force-push | Forbidden |
| Direct main write | Forbidden |
| Production deployment | Forbidden |
| Store release or OTA | Forbidden |
| Money movement | Forbidden |
| Auth/RLS, role, or user-rights mutation | Forbidden |
| Provider-product mutation | Forbidden |

Plans require the exact repository/remote/task branch, closed action and canonical path scopes, immutable snapshot/approval hashes, atomic call/time/byte/cost/child/retry caps, expiry, audit and rollback. Raw model text never executes. Process actions use fixed argument arrays with `shell=false`. No self-approval: an executor identity cannot satisfy owner approval. Future high-risk work must be routed to the existing domain operator and approval control plane.

Workflows are permanently outside executor authority. Native/release/migration/auth/RLS/role/money/provider paths require a separate high-risk capability and still cannot be deployed by this scaffold.
