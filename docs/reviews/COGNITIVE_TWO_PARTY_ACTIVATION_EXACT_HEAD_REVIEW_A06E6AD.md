# Cognitive Two-Party Activation Exact-Head Review

Reviewed implementation commit: `a06e6ad6d8731451d61569c97a7ac5351107a9f1`

Frozen predecessor: `a1d2ec3545581b1904d94e6a72668789f2065ecb`

Review branch: `codex/cognitive-two-party-activation-review`

Implementation branch: `codex/cognitive-two-party-activation-handoff`

Status: `SOURCE_REVIEW_P0_CLEAR_P1_BLOCKED_DEPLOYMENT`

## Baseline Validation

Local validation on the implementation branch before this review:

- `npm ci`: passed under Node 20 with 23 documented moderate advisories.
- `npm run lint`: passed with 86 pre-existing warnings.
- `npx tsc --noEmit`: passed.
- `npm run validate:runtime`: passed.
- `npm run guard:route-contracts`: passed.
- `npm run guard:autonomous-component-inventory`: passed.
- `npm run proof:autonomous-component-inventory`: passed.
- `npm run guard:autonomous-systems-contract`: passed.
- `npm run proof:autonomous-systems-contract`: passed.
- `npm run guard:autonomous-operating-model`: passed.
- `npm run guard:cognitive-policy-parity`: passed.
- `npm run guard:cognitive-network-policy-parity`: passed.
- `npm run guard:cognitive-credential-path-policy-parity`: passed.
- `npm run guard:cognitive-dependency-advisories`: passed.
- `npm run test:cognitive-red-team`: 40/40 passed.
- `npm run test:cognitive-hardening-regressions`: 104/104 passed.
- `npm run test:cognitive-runtime-authority-regressions`: 11/11 passed.
- `npm run test:cognitive-collective-governance`: 38/38 passed.
- `npm run test:cognitive-governance-adversarial`: 33/33 passed.
- `npm run test:cognitive-two-party-handoff`: passed.
- `npm run test:cognitive-model-independence`: passed.
- `npm run test:cognitive-product-sentinels`: passed.
- `supabase db reset`: passed.
- `supabase test db`: 12 files, 703/703 passed.
- `deno check --no-config --no-lock --node-modules-dir=false --vendor=false` on cognitive Edge Functions: passed.
- `npx expo-doctor`: 18/18 passed.
- `git diff --check`: passed.
- Architecture graph generated three times with identical output.

Architecture graph digest:

- Output SHA-256: `20abba5d1ff207493f993d48a2fd6cdb80374c23e449c6beaa874e385fc6c248`
- Graph digest: `fe2cfa3b0275ae2c85b86c96143b085fefae1c6648a90b6967c81ea7be83c560`
- Node count: 1226
- Edge count: 1195

## Review Independence

Reviewer A, Reviewer B, and Reviewer C used separate clean worktrees or detached checkouts at the same exact commit and did not modify, stage, commit, push, deploy, or approve the implementation.

The review contexts were separate subagent contexts. They are not human approvals.

## Reviewer Decisions

- Reviewer A, architecture/security: `ARCH_SECURITY_CHANGES_REQUIRED`
- Reviewer B, database/RLS/control plane: `DATABASE_RLS_CHANGES_REQUIRED`
- Reviewer C, research/provider/model/tool/release: `RESEARCH_TOOL_CHANGES_REQUIRED`

Reviewer D was not started because P1 blockers were found in A/B. Deployment and canary execution must remain stopped until a successor exact-head review is P0/P1 clear.

## Finding Summary

- P0: 0
- P1: 2 unique blockers
- P2: 5 unique findings
- P3: 1 finding

## P1 Findings

### TPA-P1-001: Stop or Revocation Can Block Rollback/Quarantine Cleanup

Affected component: two-party service execution state machine.

Evidence:

- `supabase/migrations/20260723203512_cognitive_two_party_activation_handoff.sql`
- `governance_execute_approved_switch` mutates `cognitive_governance_switches` before final execution completion.
- `governance_release_or_quarantine_execution`, `governance_complete_approved_execution`, and `governance_fail_approved_execution` all require the locked liveness predicate.
- The locked liveness predicate rejects revoked approvals and inactive emergency state.

Failure scenario:

1. Service worker claims and begins a valid approval.
2. Service worker performs an approved Level 0/1 switch side effect.
3. Owner revokes or emergency stop activates before postflight cleanup.
4. The cleanup, failure, rollback, or quarantine RPC is denied by the same liveness gate.
5. The side effect can remain without a permitted terminal audited cleanup path.

Impact: in-flight approved actions can be stranded after a stop/revoke event.

Merge blocker: yes.

Deployment blocker: yes.

Required remediation: split pre-side-effect liveness from terminal cleanup authority. Stop/revocation must block new side effects while still allowing a tightly scoped rollback, failure, or quarantine transition for an already claimed execution, with immutable audit.

Required regression test: after switch side effect, revoke/emergency stop must deny completion success but permit rollback/quarantine/failure cleanup and prove prior write authority is revoked or quarantined.

### TPA-P1-002: Product-Intelligence Emergency Stop Is Not Reachable Through Existing Owner Emergency Control

Affected component: emergency stop control plane.

Evidence:

- `supabase/migrations/20260723203512_cognitive_two_party_activation_handoff.sql` gates cognitive task writes on `autonomous_system_emergency_states` row `product_intelligence_operator`.
- `supabase/functions/cognitive-governance-control/index.ts` reads `product_intelligence_operator` emergency state.
- `supabase/functions/autonomous-approval-request/index.ts` `ALLOWED_SYSTEM_IDS` does not include `product_intelligence_operator` and rejects unknown system IDs.
- Legacy SQL emergency setter is limited to older systems.

Failure scenario:

1. Cognitive Level 0/1 actions depend on `product_intelligence_operator` emergency state.
2. Owner or super-admin attempts to pause the cognitive system through the existing emergency-control path.
3. The path rejects the system ID because it is not in the allowlist.
4. The intended kill switch cannot be tripped through the normal backed control plane.

Impact: emergency stop exists as a database gate but is not operable through the existing owner emergency route.

Merge blocker: yes.

Deployment blocker: yes.

Required remediation: add the protected cognitive system ID to the reviewed emergency-control allowlist and prove pause/resume works through the existing authenticated owner/super-admin path without broadening authority.

Required regression test: owner/super-admin emergency pause/resume accepts `product_intelligence_operator`; ordinary users and unsupported IDs remain denied.

## P2 Findings

### TPA-P2-001: Service Assertion Revocation Has State But No Explicit Revoke RPC

Affected component: two-party service-principal assertion lifecycle.

Evidence:

- `governance_two_party_service_assertions` includes `active/revoked` and `revoked_at`.
- `governance_assert_two_party_service_principal` rejects revoked assertions.
- Runtime table DML is revoked.
- Only registration/upsert is implemented.

Impact: assertion rotation can invalidate an assertion, but the kill-switch semantics lack a dedicated auditable revoke path.

Required remediation: add an owner-controlled or emergency-controlled revoke RPC with immutable lifecycle evidence.

### TPA-P2-002: Installed-Journey Evidence Does Not Fully Validate Hash and Metric Shapes

Affected component: installed journey sentinel evidence validation.

Evidence:

- `product_experience_record_sentinel_run` requires installed journey keys but does not validate `screenshotEvidenceHash` and `sourceRuntimeHash` as lowercase SHA-256 strings.
- It does not bound `journeyStepCount`.
- It requires expected/observed state presence, but not a closed state grammar.

Impact: a valid service assertion could record weak or malformed installed-journey proof.

Required remediation: mirror the visual sentinel hash validation, bound step counts, and use a closed expected/observed state vocabulary.

### TPA-P2-003: Sentinel Retention Metadata Is Not Enforceable

Affected component: sentinel run and product quality finding retention.

Evidence:

- `product_experience_sentinel_runs` and `product_quality_findings` include `retention_until`, `legal_hold`, and `erased_at`.
- Both tables require `erased_at is null`.
- Both tables are protected by immutable before update/delete triggers.
- No cleanup or erasure RPC exists.

Impact: expired sentinel evidence cannot be deleted or tombstoned through the database control plane.

Required remediation: either make these rows explicitly immutable security evidence with documented owner/counsel retention rationale, or implement a controlled expiry/tombstone path that preserves immutable audit without retaining private evidence. Level 0/1 remains non-user-derived.

### TPA-P2-004: Model-Independence Predicate Is Provider-Diverse But Not Model-Family Diverse

Affected component: live collective quorum attestation.

Evidence:

- `governance_verify_model_independence` computes provider and family counts.
- The satisfied predicate requires two providers and `cross_provider`, but not multiple model families or versions.

Impact: quorum can overstate model independence when the same model family is routed through two providers.

Required remediation: require model-family diversity for live quorum or rename/narrow the claim to provider-backed independence.

### TPA-P2-005: Product Finding Routing Can Create Non-Defect Findings From Passed Runs

Affected component: product-quality finding router.

Evidence:

- `governance_product_quality_record_finding` requires non-pass sentinel status for `confirmed_defect` or `likely_defect`.
- Other reproduction states, including `design_baseline_missing`, can be recorded against a passed run.

Impact: governance can be polluted by baseline/non-defect findings that are not tied to an actual sentinel finding state.

Required remediation: bind reproduction states to compatible sentinel run statuses and sentinel keys.

## P3 Finding

### TPA-P3-001: Admin Status Readback Uses Legacy Approval Table

Affected component: Cognitive Admin status endpoint.

Evidence:

- `cognitive-governance-control` status reads `governance_approvals`.
- New two-party approvals are stored in `governance_owner_approval_records` and `governance_owner_approval_versions`.

Impact: owner-visible handoff state and pending approval readback can be misleading, but this does not create execution authority.

Required remediation: include two-party approval readback in the status endpoint before deployment.

## Deployment Decision

Do not deploy this exact head.

Do not enable Level 0/1 switches, canaries, schedules, model/provider credentials, draft-PR executor authority, or production functions from this exact head.

Final status: `REVIEW_BLOCKED_P1`

## Explicit Non-Approval

No reviewer approved the implementation. This report is not a merge approval and is not deployment authorization.

