# Cognitive Platform Architecture

Status: `SECURITY_HARDENING_IN_PROGRESS`

## Shape

`product_intelligence_operator` is the only new top-level system. It coordinates nine registered surfaces/protected control planes:

1. `rachi_cognitive_orchestration` plans and delegates.
2. `research_source_broker` normalizes cited, fresh, untrusted evidence.
3. `intelligence_memory_service` owns deduplicated service-written memory.
4. `architecture_knowledge_graph` builds deterministic impact evidence.
5. `product_experiment_engine` represents hypotheses and non-production experiments.
6. `software_engineering_executor` validates structured draft-branch plans.
7. `independent_evaluation_judge` evaluates without editing source.
8. `capability_and_tool_broker` limits tools, paths, calls, time, and expiry.
9. `model_router_and_budget_controller` caps model calls and cost.

The orchestration flow is:

`objective → research → plan → capability preflight → specialized executor → independent evaluation → owner-visible evidence`

Existing notification, release, observability, installed QA, LiveKit, money, security, recovery, privacy, support, moderation, search, and media systems remain domain executors.

## Authority boundary

The cognitive layer cannot directly own or execute money movement, user-rights changes, auth/RLS, owner-role changes, moderation enforcement, public release, OTA, store release, provider-product mutation, or pricing. It cannot approve itself. Future Level 3/4 work still uses the autonomous approval control plane and target operator.

## Knowledge graph

`scripts/build-cognitive-architecture-graph.mjs` deterministically indexes tracked and pending source files without secret-like filenames. It models routes, screens, components, client methods/hooks, Edge Functions, migrations/RPCs/tables, providers, notifications, LiveKit, purchases, native/build contracts, and tests/guards. Import and definition edges support impact output for callers, dependencies, platforms, roles, user states, data, tests, release impact, and rollback scope.

The committed snapshot is a reproducible source artifact, not production telemetry and not a deployed graph database.

## Promotion gates

- Separate owner-approved deployment task.
- Independent architecture/security and database/RLS review.
- Provider/model credential design that never grants unrestricted root access.
- Production budget, retention, incident, and emergency-stop runbooks.
- Deployed evaluator independence proof.
- No migration/function/scheduler promotion from this branch.

## Security-hardening state

The platform is an undeployed scaffold under hardening, not a cognitive brain.
Closed executor actions, consumable capabilities, immutable snapshots, an
independent evidence evaluator, recursive sanitization, an SSRF-safe mock research
transport, atomic budgets, leases, cancellation and rollback quarantine are
defined in `docs/intelligence/hardening/`. Production activation remains absent.
