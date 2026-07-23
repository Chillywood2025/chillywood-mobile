# Cognitive capability protocol

A capability is not a model credential. The broker retains credential material;
the model sees only a non-reusable scope description. Opaque bearer material is
stored only as a hash.

Each capability binds:

- capability ID, nonce/JTI, task and project;
- exact repository, branch, platform and non-production environment;
- provider, closed operation and canonical path scopes;
- risk level, issue/not-before/expiry times;
- call, byte and cost ceilings;
- approval request/scope hash and immutable plan snapshot hash;
- lifecycle and revocation state.

Every call atomically verifies the complete scope, a fresh existing owner approval,
emergency-stop/cancellation/quarantine state and remaining budgets. A unique call
ID and usage sequence are consumed before work. The broker rechecks cancellation,
revocation and scope before accepting long-running results. Replays, expiry,
cross-task/project/repository/platform/provider use, stale snapshots and high-risk
path mismatches fail closed.

The undeployed database creates immutable capability events and exposes only the
controlled consumption RPC to `service_role`; clients cannot issue or activate
capabilities.
