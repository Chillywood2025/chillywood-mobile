# Decision Manifest Protocol

Status: source contract only; no deployed authority.

Each decision manifest binds one task to its source commit, architecture-graph
digest, evidence packet, cited research, proposals, selected and rejected options,
council identities, votes, vetoes, dissent, stakeholder impacts, risk, tests,
capability scope, budget, execution count, rollback, expiration, and owner approval.
The service computes the canonical hash; callers cannot supply a trusted hash.

The content hashes are derived from the normalized relational rows, including the
role assignment and participant identity for assessments and votes. Placeholder
labels are not evidence. A minority cannot finalize merely by reaching a numeric
quorum: supporting votes must also exceed opposing votes.

A manifest is created only after risk-based quorum and all mandatory critic roles.
Any unresolved mandatory veto prevents creation. Changing the source commit,
evidence, graph, scope, budget, tests, rollback, or selected option creates a new
manifest version and invalidates capabilities bound to the old hash.

Capabilities, plan snapshots, approvals, execution receipts, and evaluator results
must reference the same decision hash. The manifest is immutable. Corrections,
appeals, expiration, and reconsideration are append-only events rather than edits.
