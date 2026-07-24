# Cognitive Two-Party Activation Exact-Head Review

Reviewed implementation commit: `a596478bef99d59d4c51f25ecee12a5864cb08a9`

Frozen predecessor: `a1d2ec3545581b1904d94e6a72668789f2065ecb`

Implementation branch: `codex/cognitive-two-party-activation-handoff`

Review branch: `codex/cognitive-two-party-activation-review`

Implementation PR: `#21`

Review PR: `#22`

Status: `SOURCE_REVIEW_P0_P1_CLEAR_DEPLOYMENT_GATES_PENDING`

This report is sanitized review evidence. It is not a merge approval and is not
deployment authorization.

## Baseline Validation

Local validation on the exact implementation head:

- `npm ci`: passed.
- `npm run lint`: passed with 86 existing warnings.
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
- `npm run guard:cognitive-dependency-advisories`: passed; critical/high 0, documented moderate 23.
- `npm run test:cognitive-red-team`: 40/40 passed.
- `npm run test:cognitive-hardening-regressions`: 104/104 passed.
- `npm run test:cognitive-runtime-authority-regressions`: 11/11 passed.
- `npm run test:cognitive-collective-governance`: 38/38 passed.
- `npm run test:cognitive-governance-adversarial`: 33/33 passed.
- `npm run test:cognitive-two-party-handoff`: passed.
- `npm run test:cognitive-model-independence`: passed.
- `npm run test:cognitive-product-sentinels`: passed.
- `supabase db reset`: passed locally.
- `supabase test db`: 12 files, 723/723 passed locally.
- `supabase test db supabase/tests/cognitive_two_party_activation_handoff_test.sql`: 75/75 passed locally.
- Deno check on changed cognitive Edge Functions: passed.
- `npx expo-doctor`: 18/18 passed.
- `git diff --check`: passed.
- PR #21 CI: 13/13 checks passed.

Architecture graph determinism was reproduced three times from clean temporary
outputs at this exact commit.

- Source commit: `a596478bef99d59d4c51f25ecee12a5864cb08a9`
- Node count: 1227
- Edge count: 1197
- File-list digest: `59e950451dccacfdbb2804b0e91be8074de67b15941b58e7230942e376292c81`
- Graph digest: `f04c38d058e805c92d05019b2f44a55dc774df56f938fa3ef6c696cc645f1b3f`
- Normalized output SHA-256: `7e33abcdd793ad8388946ef174fffa656b57b7a3a2adce34c6197ae4405b5e47`

## Review Independence

Reviewer A, Reviewer B, Reviewer C, and Reviewer D ran separate clean review
contexts or detached worktrees at the same exact implementation head. They did
not modify, stage, commit, push, deploy, or approve the implementation.

These were independent agent reviews, not human approvals.

## Reviewer Decisions

- Reviewer A, architecture/security: `ARCH_SECURITY_PASS_FOR_UNDEPLOYED_FOUNDATION`
- Reviewer B, database/RLS/control plane: `DATABASE_RLS_PASS_FOR_UNDEPLOYED_FOUNDATION`
- Reviewer C, research/provider/model/tool/release: `RESEARCH_TOOL_PASS_FOR_UNDEPLOYED_FOUNDATION`
- Reviewer D, adversarial validation: `ADVERSARIAL_PASS_FOR_UNDEPLOYED_FOUNDATION`

No pass authorizes deployment, model/provider credentials, schedules, draft-PR
execution, release action, money movement, auth/RLS mutation, role mutation, or
Level 2 production repair.

## Finding Summary

- P0: 0
- P1: 0
- P2: 0
- P3: 0

The prior P1 regression in the parent-switch disable cascade was retested and is
closed on this exact head. The cascade now clears `enabled_at` when disabling
dependent switches, satisfying the base switch constraint and allowing the
approved safety disable to complete.

## Evidence Highlights

- Owner approval and service execution are separate Edge Function paths:
  `supabase/functions/cognitive-owner-approval/index.ts` and
  `supabase/functions/cognitive-approved-action-worker/index.ts`.
- Independent evaluator proof uses a third action-limited Edge Function:
  `supabase/functions/cognitive-independent-evaluator/index.ts`.
- Service-principal verification requires the service-role caller plus a stored
  assertion hash; it does not rely on caller-supplied actor text:
  `supabase/migrations/20260723203512_cognitive_two_party_activation_handoff.sql`.
- Switch mutation is staged by service execution and applied only after a passed
  independent evaluator proof.
- Two-party pgTAP coverage verifies Owner cannot execute, service cannot approve,
  evaluator cannot execute, replay and wrong-scope cases fail closed, emergency
  stop blocks execution, and dependent-switch disable clears `enabled_at`.
- Model-independence tests verify provider/model/execution identity separation
  and the `MODEL_INDEPENDENCE_PROVIDER_REQUIRED` advisory path when live quorum
  requirements cannot be satisfied.
- Product sentinels remain switch-gated, service-only, read-only/synthetic, and
  proposal/finding oriented.

## Attack Results

- Canonical cognitive attacks: 40/40 passed.
- Governance adversarial attacks: 33/33 passed.
- Two-party handoff pgTAP: 75/75 passed.
- Level 0/1 canary control-plane pgTAP: 24/24 passed.
- Collective governance control-plane pgTAP: 74/74 passed.
- Database concurrency regression: passed; one current finding, two occurrences,
  and two immutable events were preserved.

## Deployment Gate Status

Source review gate: passed for undeployed foundation.

Deployment gate: pending. This review branch does not deploy migrations, Edge
Functions, schedulers, model credentials, GitHub credentials, or Level 0/1
switches.

Before deployment, the deployment branch still must verify linked migration state,
service-principal configuration, Owner authenticated approval recording, service
worker execution, remote RLS/deny checks, Edge Function versions, and canary
rollback evidence through the real target environment.

## Explicit Non-Approval

No reviewer approved their own work. No PR was merged. This report is not
deployment authorization and does not authorize Level 2 production repair.
