# Whole-App Engineering Blueprint V1

Status: governing architecture under Product Intelligence and First-Pass Assurance. This blueprint does not claim that the app or any product domain is complete.

## Contract

The default meaning of build, fix, finish, connect, integrate, close gaps, or make production-ready is `production_complete`. The Owner may explicitly select prototype, temporary, experimental, proof of concept, or source-only foundation. Work begins from one canonical feature-registry domain and expands only through recorded data, authority, mutable-state, native, provider, security/privacy/money/rights, rollback, cleanup, and observability edges.

The completion vocabulary is bounded:

- `BOUND_COMPLETE_FOR_REGISTERED_SCOPE`
- `BOUND_COMPLETE_SOURCE_ONLY`
- `BOUND_COMPLETE_WITH_EXTERNAL_PROOF_BLOCKED`
- `BOUND_INCOMPLETE`
- `BOUND_BLOCKED_NOVEL_DIMENSION`
- `BOUND_BLOCKED_EXTERNAL_CONTRACT_DRIFT`

Never use bare `COMPLETE`. A bounded result names exact source/architecture, primary and transitive domains, reachable states/transitions, authority and ownership, supported platforms/providers, environment/market/jurisdiction, finite taxonomy, T0–T7 obligations, exclusions, blocked proof, and post-launch work. Source, emulator, provider, signed-artifact, installed/physical, and public evidence never substitute for one another.

## Canonical model

`config/assurance/feature-registry-v1.json` remains the domain registry. `config/assurance/whole-app-domain-graph-v1.json` is its deterministic repository-inventory and authority graph projection. Every node records owner, exact registered source bindings, owned data and authority, providers/platforms/markets, upstream and downstream closure, shared mutable state, security/privacy classification, T0–T7 applicability, rollback, and observability ownership. Unknown values stay unknown.

`config/assurance/engineering-evidence-authority-v1.json` is the integrated evidence-authority registry. Doctrine facts have distinct declared, observed, and independently verified layers. Declaration-only JSON cannot clear a gate. Repository evidence is bound to an exact Git tree; GitHub task evidence is read from the actual open PR, remote head, ancestry, diff, finite lease, and immutable Owner comment; external claims retain their official/provider/artifact/runtime proof boundaries.

Every edge records transferred data/control, authority direction, authentication, ordering, retry/idempotency, failure, rollback, platform differences, and evidence ownership. The gate rejects circular or duplicate authority, unowned mutable state, UI/client authority substitution, stale replacement mutation, undocumented platform differences, unregistered provider/autonomous mutation, unbounded side effects, and unexplained affected-scope orphans.

Inventory ownership is computed once from exact registry aliases and graph-derived source bindings. Each asset carries its classification, owner-domain set, ownership status, and content digest; group totals must equal the sum of owned, unknown, and ambiguous members. The source-inventory hash covers member content, classifications, totals, gaps, and provenance-bound reconciled SQL/backend counts. A task may correct an affected canonical ambiguity only in its reserved `TASK_LOCAL_MODEL_SLICE_V1`, bound to the canonical graph hash, exact closure, artifact hash, and repository witnesses. It may not edit the canonical graph before clearance or use that slice to hide an unrelated gap.

Traversal stops at an edge only with `NON_IMPACTING_WITH_EVIDENCE`: exact edge and canonical transfer, finite reason code, enforcing source digest/line/semantic token, negative-witness test digest/ID, and canonical contract. Generic prose cannot sever a graph edge. Repository co-location alone neither includes nor excludes a domain.

## Finite discovery and coverage

Pass A covers architecture, state/transition, authority, data flow, concurrency, and lifecycle. Pass B covers security, privacy, permissions, providers, rollback, cleanup, platform differences, and adversarial behavior. If they disagree, one reconciliation Pass C is allowed. Then affected domains, state dimensions, authority graph, invariants, and initial defect-ledger hash freeze. Remaining instability emits `ENGINEERING_MODEL_UNSTABLE`; there is no fourth pass or recursive control PR.

Impossible combinations are removed only by registered reachability, preconditions, authority, mutual exclusion, terminal state, platform, provider, environment, and market constraints. Every remaining pair across state, transition, platform, provider, and market is enumerated with a canonical tuple hash. All ten three-dimension combinations of concurrency, lifecycle, permission, provider-state, and replacement authority are recorded. Authentication/authorization, money/entitlement, privacy/rights, deletion/ownership, permission-to-media, terminal/resurrection, stale/replacement authority, migration/rollback, native provenance, and security trust boundaries bind their affected domains, states/transitions, authority/trust edges, status, and evidence plan.

Aggregate states and transitions are the exact domain-qualified union of the included node models. Coverage entries enumerate the finite expected tuples and bind their count and hash; labels or test counts cannot stand in for those tuples. Exclusion, unknown-resolution, and authority-resolution evidence identifies a real registered subject, safe repository source, exact source digest and line, positive and negative witnesses, and canonical contract.

The adversarial taxonomy is finite and each item is exactly `APPLICABLE`, `NOT_APPLICABLE_WITH_CONSTRAINT`, `BLOCKED_EXTERNAL`, or `POST_LAUNCH`.

## Engineering closure packet

Before product source mutation, `ENGINEERING_CLOSURE_PACKET_V1` records:

1. Owner intent, defaults, non-goals, prohibitions, platforms/environments/markets, and risk.
2. Bounded graph/inventory/contract/taxonomy identities and exclusions.
3. Included closure and evidence-backed exclusions.
4. Current source/architecture/authority/state/defect/platform/proof audit.
5. Initiate, authorize, persist, render, retry, cleanup, terminate, and rollback flow.
6. Reachable state model, preconditions, terminals, replacement behavior, idempotency, and concurrency owner.
7. Invariants with owner, positive/negative witness, mutant, tier, and applicability.
8. Adversarial matrix and pairwise/three-way/exhaustive obligations.
9. Requirement, state, transition, authority, test, mutation, native/provider, and physical coverage maps.
10. Stable defect ledger with coordinated correction and launch disposition.
11. Exact implementation order, atomicity, deployment, rollback, cleanup, observability, proof, and budget.
12. `BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1`.

Local work can reach only `ENGINEERING_PLAN_DRAFTED`. `PREIMPLEMENTATION_ENGINEERING_CLEAR` is computed only after the verifier reads the actual GitHub PR and immutable Owner authorization, replays the exact repository inventory, source-bound transitions, governing-edge closure, and Pass A/B/C receipts, and confirms the finite task scope against the remote candidate.
13. One combined set of stop conditions.

The certificate requires complete mappings for requirements, mutable authority, applicable edges, launch-critical transitions, positive/negative evidence, adversarial classifications, and planned mutant kills; a stable ledger; and no unknown dependency within the affected closure. Test quantity is never a clearance input.

`PREIMPLEMENTATION_ENGINEERING_CLEAR` requires an explicit finite boundary and closure, unique authority, reachable state model, invariant/evidence and adversarial coverage, classified platform/provider/market contracts, known gaps and mutants, stable ledger, and defined rollback/cleanup/observability. Any applicable failure code blocks product source mutation.

## Same-PR convergence

After clearance, the stable bounded defect set is implemented coherently in the same finite lease and PR. Every changed line maps to an invariant, transition, or defect. Source pushes invalidate review/CI evidence, not task authority. Descendants update the reserved task artifact without admission or meta-PR. One immutable Owner lease-amendment comment may expand paths inside the same allowed domain without protected-main mutation.

Pre-clear discovery may change only the reserved closure/model/evidence artifact and constrained tests. Its reservation must match the graph-derived closure and paths, enforce excluded high-risk paths and measured file/line budgets, and cannot point into product source. Implementation and later phases require the derived gate. The doctrine bootstrap is narrower still: exact task, branch, base, governing closure, all 24 authorized paths and budgets, and authoritative pre-merge lifecycle. It fails after protected main advances even if cached truth is stale.

Pass findings are classified exactly:

- `PREDICTABLE_MODEL_OMISSION`: emit `PRE_IMPLEMENTATION_COVERAGE_FAILURE`, return to design in the same PR, and update the entire affected class. Two emit `DOMAIN_ARCHITECTURE_REVIEW_REQUIRED`.
- `GENUINELY_NOVEL_DIMENSION`: record reproduction, first observation, version, new state/edge and impact; reopen intersecting domains only.
- `EXTERNAL_CONTRACT_DRIFT`: update the applicable contract and intersecting domains only.
- `IMPLEMENTATION_DEFECT_WITHIN_MODEL`: correct in the same PR without rewriting the model.

The state machine is `INTENT_CAPTURED → DOMAIN_DISCOVERY → ARCHITECTURE_DESIGNED → DEFECT_LEDGER_STABLE → PREIMPLEMENTATION_ENGINEERING_CLEAR → IMPLEMENTATION → VERIFY → NATIVE_PROVIDER_PROOF (when applicable) → MERGE_ELIGIBLE → MERGED_VERIFIED → CLOSED`. Verify may return to design or implementation in the same PR.

Merge eligibility requires a clear bounded certificate; P0=0, P1=0, no launch-impacting P2; positive and negative evidence for every invariant; killed or justified mutants; exercised or explicitly blocked launch-critical transitions; two full verification passes with no new defect class; repository-owned exact-head review; all 13 Phase 1 checks; and exact merge provenance. Provider Codex Review remains optional advisory.

## E0, S0, autonomy, and truth

E0 carries only the closure slice. S0 consumes authority/trust/protected-data/failure/adversarial/rollback fields from that slice. Autonomous and Cognitive systems refuse implementation without clearance, include cross-system effects plus rollback/cleanup/quarantine/observability, preserve Level 3/4 boundaries, and never self-approve scope expansion.

When the doctrine is active, current truth records doctrine/config hashes, packet/certificate/ledger identities, closure domains, discovery and verification counters, coverage, lease state, blockers, next action, and honest readiness for all registered features. Readiness distinguishes architecture, source, integration, native/provider, signed, installed, physical, and public tiers. D2A remains terminal historical truth; T5–T7 are not promoted by this doctrine.

No-active-task truth uses one explicit sentinel and the canonical doctrine report. Active-task truth instead binds the reserved packet artifact, certificate, exact affected domains, finite lease, counters, and coverage. The final reconciliation Pass C freezes five immutable review-cycle finding-set hashes: ten predictable model omissions, five model revisions, and ten verification cycles. Those historical bootstrap findings do not contaminate a clean future task, whose counters begin at zero; the report binds the frozen graph, Pass C, review evidence, and counters in one freeze hash.

Packet text never grants Owner authority. A registered-owner choice, jurisdiction decision, or path amendment is accepted only from an immutable GitHub comment read back for the exact repository, PR, task, lease, and current head, authored by `Chillywood2025` with `OWNER` association and a body/subject hash validated outside the packet. Canonical technical unknowns remain unknown unless deterministic task-local source evidence binds the exact domain and unknown; the governing bootstrap alone derives a source-only not-applicable constraint because it cannot touch product, native, provider, build, or release paths.

## Bootstrap and authority

`OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1` is single-use for this doctrine PR, its self-hosted validation, and one three-file post-merge truth synchronization. It expires at implementation merge and cannot authorize product/native/provider/database/build/release/money/rights/auth/RLS mutation. It creates no admission, source-binding, provenance, review-only, prerequisite, or recursive PR.

Android/iOS builds and submissions, OTA, production stores, external TestFlight, public release, and signed candidates remain unauthorized. The next action after doctrine truth synchronization is exactly `WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE`.
