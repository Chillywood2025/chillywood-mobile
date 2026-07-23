# Memory and Learning Policy

Status: `SECURITY_HARDENED_SCAFFOLD_NOT_DEPLOYED`

The redesigned local-only migration defines the original twenty domain tables plus scoped project, provenance, snapshot, capability, budget, lease, evidence, finding and erasure lifecycle tables.

Direct client writes are denied. Readback requires Owner, Super Admin, or scoped
Admin permission `admin.cognitive.read`; a scoped Admin must also carry exact
project, task, and platform assignments. Immutable evidence is non-personal and
append-only; mutable current state changes only through controlled RPCs. RPC actor
names are bound to authenticated service actor claims rather than trusted from
parameters. User-derived data is bounded/redacted, expiring and erasable with a
non-personal tombstone. Tables outside that erasure protocol structurally reject
`user_derived`.

Learning is closed numeric data only: source/tool reliability, expected duration, test priority, rollback rank, model-routing preference and retry timing. Every update references outcome evidence and an evaluator result.

Learning may never change forbidden scope, approval level, owner authority, money policy, public-release policy, auth/RLS policy, legal policy, or secret policy. Prompt and policy changes require versioning and review. Private user data is not training material.

`OWNER_COUNSEL_RETENTION_DECISION_REQUIRED` remains a deployment blocker.
