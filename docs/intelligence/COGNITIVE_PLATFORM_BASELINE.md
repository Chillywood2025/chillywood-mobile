# Cognitive Platform Baseline

Status: `SECURITY_HARDENED_SCAFFOLD_NOT_DEPLOYED`

The baseline is the existing autonomous control plane at Android closeout commit `deb8996bd720893c877b3bf03accd54e54802489`. It has fourteen active specialized domain systems, one foundation-only ads system, the Owner Command router, registered workers/surfaces, platform-scoped approvals, User Report Router, bounded schedulers, immutable audit evidence, and provider-specific readback.

## Current responsibility map

| Capability | Existing owner | Current behavior |
|---|---|---|
| Detection | Domain operators, provider adapters, User Report Router | Bounded platform/provider probes and sanitized report clustering |
| Planning | Domain operator plans and Owner Command | Registry-scoped plans with approval levels |
| Execution | Specialized domain operators and manual engineering workflows | Narrow actions only; high-risk work is blocked or approval-gated |
| Evaluation | Guards, proofs, pgTAP, CI, installed-QA evidence | Domain-specific checks; no shared independent cognitive judge existed |
| Research | Human/Codex task process | No durable normalized source broker existed |
| Memory | Operator tables, current findings, append-only audit | Domain-specific; no shared research/decision/lesson schema existed |
| Learning | Manual documentation and runbooks | No bounded machine-learning policy existed |
| Rollback | Domain kill switches, forward migrations, normal Git revert | Specialized and audited |
| Owner approval | Autonomous approval control plane | Platform/action/scope-bound, expiring, no self-approval |

## Capability inventory

- GitHub: guarded draft-branch source, CI, PR, and review workflows. No autonomous merge or main write.
- Supabase: migrations, RLS, Edge Functions, Cron, queues, and operator audit. Cognitive objects in this branch remain local-only.
- EAS/store providers: read-only release adapters and separately approved build/release operations. Cognitive foundation receives no provider credential.
- Owner Command: routes explicit owner intent to registered specialized systems; it is not a god panel.
- User Report Router: support-owned, sanitized, thresholded routing into existing operators.
- Existing learning state: finding occurrence/dedupe, provider capability state, operator audit, rollback readiness, and runbooks.

## Gap closed by this branch

`product_intelligence_operator` adds a single planning/evidence/evaluation layer above specialized executors. It does not duplicate them and has no production scheduler, deployed function, model credential, database deployment, or direct high-risk authority.
