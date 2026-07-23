# Memory and Learning Policy

Status: `SECURITY_HARDENING_IN_PROGRESS`

The redesigned local-only migration defines the original twenty domain tables plus scoped project, provenance, snapshot, capability, budget, lease, evidence, finding and erasure lifecycle tables.

Direct client writes are denied. Readback requires Owner, Super Admin, or scoped Admin permission `admin.cognitive.read`. Immutable evidence is non-personal and append-only; mutable current state changes only through controlled RPCs. User-derived data is bounded/redacted, expiring and erasable with a non-personal tombstone.

Learning is closed numeric data only: source/tool reliability, expected duration, test priority, rollback rank, model-routing preference and retry timing. Every update references outcome evidence and an evaluator result.

Learning may never change forbidden scope, approval level, owner authority, money policy, public-release policy, auth/RLS policy, legal policy, or secret policy. Prompt and policy changes require versioning and review. Private user data is not training material.

`OWNER_COUNSEL_RETENTION_DECISION_REQUIRED` remains a deployment blocker.
