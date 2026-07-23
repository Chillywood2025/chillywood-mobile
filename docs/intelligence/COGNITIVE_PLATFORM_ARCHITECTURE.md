# Cognitive Platform Architecture

Status: `SECURITY_HARDENING_IN_PROGRESS`

## Shape

`product_intelligence_operator` is the only new top-level system. It coordinates the original nine registered surfaces/protected control planes plus the two-party activation and product-experience sentinel surfaces:

1. `rachi_cognitive_orchestration` plans and delegates.
2. `research_source_broker` normalizes cited, fresh, untrusted evidence.
3. `intelligence_memory_service` owns deduplicated service-written memory.
4. `architecture_knowledge_graph` builds deterministic impact evidence.
5. `product_experiment_engine` represents hypotheses and non-production experiments.
6. `software_engineering_executor` validates structured draft-branch plans.
7. `independent_evaluation_judge` evaluates without editing source.
8. `capability_and_tool_broker` limits tools, paths, calls, time, and expiry.
9. `model_router_and_budget_controller` caps model calls and cost.
10. `cognitive_owner_approval_endpoint` records immutable exact Owner approval versions through the authenticated Owner path.
11. `cognitive_approved_action_worker` claims and executes only exact active approval versions through a separately verified service principal.
12. `model_independence_attestation_service` records sanitized model execution attestations and fails closed with `MODEL_INDEPENDENCE_PROVIDER_REQUIRED` when live quorum cannot be proven.
13. `product_experience_baseline_service` versions product-experience baselines only after exact Owner approval.
14. `livekit_experience_sentinel` observes synthetic LiveKit journeys and separates backend, media, and installed UI state.
15. `visual_product_experience_sentinel` measures screenshot/content-density and card-layout metrics against an Owner-reviewed baseline.
16. `installed_journey_sentinel` runs bounded synthetic product journeys for stuck routes, dead taps, blank screens, and unresolved loading states.
17. `product_quality_triage_router` turns sanitized sentinel runs into governance findings.

The orchestration flow is:

`objective → research → plan → decision manifest → exact Owner approval → service-principal claim → bounded execution → independent evaluation → owner-visible evidence`

Existing notification, release, observability, installed QA, LiveKit, money, security, recovery, privacy, support, moderation, search, and media systems remain domain executors.

## Authority boundary

The cognitive layer cannot directly own or execute money movement, user-rights changes, auth/RLS, owner-role changes, moderation enforcement, public release, OTA, store release, provider-product mutation, or pricing. It cannot approve itself. Future Level 3/4 work still uses the autonomous approval control plane and target operator.

## Knowledge graph

`scripts/build-cognitive-architecture-graph.mjs` deterministically indexes regular
source blobs from the exact reviewed Git commit without consulting the ambient
index or working tree and without secret-like filenames. The caller must supply
the expected 40-character commit through `COGNITIVE_EXPECTED_SOURCE_COMMIT` or
`--expected-commit`; missing or mismatched expectations fail closed. CI binds
that value to the immutable checked-out `github.sha`. It models routes,
screens, components, client methods/hooks, Edge Functions,
migrations/RPCs/tables, providers, notifications, LiveKit, purchases,
native/build contracts, and tests/guards. Import and definition edges support
impact output for callers, dependencies, platforms, roles, user states, data,
tests, release impact, and rollback scope.

Only the graph schema, generator, and compact fixture evidence are committed.
The generated compact manifest is a reproducible CI/owner-only artifact, not
production telemetry and not a deployed graph database.

## Promotion gates

- Separate owner-approved deployment task.
- Independent architecture/security and database/RLS review.
- Provider/model credential design that never grants unrestricted root access.
- Production budget, retention, incident, and emergency-stop runbooks.
- Deployed evaluator independence proof.
- No migration/function/scheduler promotion from this branch.

## Security-hardening state

The platform is an undeployed scaffold under security hardening, not a cognitive brain.
Closed executor actions, consumable capabilities, immutable snapshots, an
independent evidence evaluator, recursive sanitization, an SSRF-safe mock research
transport, atomic budgets, leases, cancellation and rollback quarantine are
defined in `docs/intelligence/hardening/`. “Hardened” describes the passing local
source, database, and adversarial contracts only. Production activation, trusted
evidence authorities, credentials, schedulers, and deployed services remain
absent.
