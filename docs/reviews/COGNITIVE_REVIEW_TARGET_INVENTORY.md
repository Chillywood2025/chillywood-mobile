# Cognitive Foundation Review Target Inventory

## Locked target

- Implementation PR: `#14` (open, draft, unmerged)
- Head: `bd8fd0c709db8ff843b69fa9b9a5039a74d09a94`
- Base branch: `codex/ios-integration-90`
- Base commit: `deb8996bd720893c877b3bf03accd54e54802489`
- Required checks at review start: 13/13 passed
- Changed files independently enumerated: 30
- Generated native-directory changes: none
- Review context: three isolated clean worktrees plus a later adversarial worktree; these are independent agent contexts, not independent human approvals.

## Changed-file inventory

| File | Category | Review relevance |
| --- | --- | --- |
| `.github/workflows/phase1-ci.yml` | CI | Adds three cognitive checks and local database execution. |
| `_lib/autonomousSystemsRegistry.ts` | registry or policy | Registers the top-level system and surfaces. |
| `_lib/cognitivePlatformFoundation.ts` | cognitive implementation | Research, execution, evaluation, learning, and owner-control contracts. |
| `_lib/ownerCommandOperator.ts` | cognitive implementation | Adds cognitive owner-command classification. |
| `app/admin.tsx` | Admin UI | Adds the Cognitive Intelligence tab to the existing Admin route. |
| `components/admin/cognitive-control-center.tsx` | Admin UI | Read-only status and disabled placeholder controls. |
| `config/autonomy/autonomous-components.json` | registry or policy | Canonical component definitions and deployment state. |
| `config/intelligence/architecture-knowledge-graph.json` | generated evidence | Committed repository graph snapshot. |
| `config/intelligence/cognitive-platform.json` | registry or policy | Budgets, forbidden direct execution, and component contracts. |
| `docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md` | documentation | Registry narrative. |
| `docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md` | documentation | Operating-model narrative. |
| `docs/intelligence/COGNITIVE_PLATFORM_ARCHITECTURE.md` | documentation | Foundation architecture. |
| `docs/intelligence/COGNITIVE_PLATFORM_BASELINE.md` | documentation | Claimed pre-foundation inventory. |
| `docs/intelligence/COGNITIVE_ROLLBACK_PLAN.md` | documentation | Source-only rollback description. |
| `docs/intelligence/COGNITIVE_SECURITY_MODEL.md` | documentation | Security-boundary description. |
| `docs/intelligence/EXECUTION_AUTHORITY_MATRIX.md` | documentation | Allowed/forbidden executor authority. |
| `docs/intelligence/EXPERIMENT_ENGINE.md` | documentation | Experiment proposal boundary. |
| `docs/intelligence/MEMORY_AND_LEARNING_POLICY.md` | documentation | Memory and learning boundary. |
| `docs/intelligence/OWNER_CONTROL_CENTER.md` | documentation | Admin surface boundary. |
| `docs/intelligence/PRODUCT_AND_UX_INTELLIGENCE_CONTRACT.md` | documentation | Product/UX proposal authority. |
| `docs/intelligence/RESEARCH_SOURCE_POLICY.md` | documentation | Research provenance and trust policy. |
| `package.json` | test/guard/proof | Adds cognitive scripts. No dependency entry changed. |
| `scripts/build-cognitive-architecture-graph.mjs` | architecture graph | Builds/checks deterministic graph output. |
| `scripts/cognitive-contract-suite.mjs` | test/guard/proof | Static and behavioral contract suite. |
| `scripts/guard-autonomous-component-inventory.mjs` | test/guard/proof | Extends accepted deployment states. |
| `scripts/proof-autonomous-component-inventory.mjs` | test/guard/proof | Extends component proof. |
| `scripts/test-cognitive-execution-safety.mjs` | test/guard/proof | Execution-safety test entry point. |
| `supabase/functions/owner-command-operator/index.ts` | cognitive implementation | Adds cognitive command vocabulary; source change claimed undeployed. |
| `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql` | migration/database | Undeployed schema, grants, RLS, and evidence triggers. |
| `supabase/tests/cognitive_intelligence_foundation_test.sql` | test/guard/proof | Initial 44-assertion database contract test. |

## Claim-verification matrix

The final status column is completed only from source, local reproduction, linked readback, and the four review reports. Documentation and PR prose are not treated as evidence.

| Claim | Primary source location | Existing test location | Independent review status | Contradictory evidence | Final conclusion |
| --- | --- | --- | --- | --- | --- |
| `source_complete_not_deployed` | `config/intelligence/cognitive-platform.json`; component inventory | `scripts/cognitive-contract-suite.mjs` | Disproved by A/B/C | The broker, capability verifier, evaluator independence, task isolation, state machines, URL broker, and model/provider controls are declarations or absent. | Source is undeployed, but “source complete” is false. |
| Activation is off | cognitive config; registry activation mode | cognitive contract guard | Verified by source and repository-wide caller search | No cognitive activation caller found. | Verified for reviewed commit. |
| Scheduler is none | cognitive config; component inventory; repository scheduler search | inventory guard | Verified locally and by linked marker readback | No cognitive scheduler marker found remotely. | Verified for reviewed commit/provider readback. |
| Production model credentials are none | cognitive config/registry and repository credential-reference search | cognitive contract guard | Verified by source plus sanitized linked name readback | The statement is limited to cognitive-bound credentials; existing non-cognitive provider credentials are outside this claim. | Verified for reviewed state; not permission to add one. |
| Production tool credentials are none | cognitive config/registry and provider-reference search | cognitive contract guard | Verified by source plus sanitized linked name readback | No tool broker exists to isolate a future credential. | Verified for reviewed state; future credentialing is blocked. |
| Cognitive migrations are undeployed | linked migration history | local migration test | Verified by linked readback | Migration `20260723001845` is local-only. | Verified. |
| Cognitive Edge Functions are undeployed | function inventory and PR diff | Deno check only | Verified by linked function-name readback | Existing Owner Command deployment predates the reviewed cognitive source change. | Verified for cognitive function deployment; modified source remains undeployed. |
| Production execution is disabled | execution validator, registry/config, Admin UI | execution-safety suite | Current inert state verified; structural claim disproved | Validator accepts forbidden runtime actions, workflow/migration edits, traversal shapes, missing approval, and caller-asserted evidence. | Disabled now because no executor exists; unsafe to deploy. |
| Admin foundation is read-only | Admin component and containing route gate | TypeScript/static guard | Verified as static UI | Status is hard-coded, not live backend truth; copy overstates completeness/independence. | Read-only placeholder verified; operational readback claim rejected. |
| No authority over money, rights, auth/RLS, roles, moderation, release/OTA, pricing, or provider products | registry/config/validator/owner command restrictions | cognitive execution tests | Current inert state verified; future enforcement disproved | Broad workflow/migration/source paths and caller risk flags can represent indirect privileged effects. | No present authority; permanent boundary is not yet enforceable. |
| No self-approval | execution validator and registry | execution-safety suite | Disproved as a complete control | Missing approval IDs pass; distinct caller-supplied IDs pass; no FK/fresh approval/capability/evaluator identity exists. | Equality check is not a no-self-approval control. |
| No unrestricted credential | registry/config and source scan | cognitive contract guard | Current absence verified | Capability/tool broker is declarative and cannot safely bind any future credential. | No current cognitive credential; credential addition remains blocked. |

## Independent report index

| Report | Decision/result | Findings |
| --- | --- | --- |
| `COGNITIVE_ARCHITECTURE_SECURITY_REVIEW.md` | `ARCH_SECURITY_CHANGES_REQUIRED` | 3 P1, 4 P2, 2 P3 |
| `COGNITIVE_DATABASE_RLS_CONTROL_PLANE_REVIEW.md` | `DATABASE_RLS_CHANGES_REQUIRED` | 2 P1, 7 P2, 1 P3 |
| `COGNITIVE_RESEARCH_TOOL_PROVIDER_REVIEW.md` | `RESEARCH_TOOL_CHANGES_REQUIRED` | 1 P1, 8 P2, 1 P3 |
| `COGNITIVE_ADVERSARIAL_RED_TEAM_REPORT.md` | 17 pass / 23 fail | 19 P1, 4 P2 |
| `COGNITIVE_FOUNDATION_INDEPENDENT_REVIEW_SYNTHESIS.md` | `REVIEW_BLOCKED_P1` | aggregate 0 P0, 25 P1, 23 P2, 4 P3 |

No report is an approval. The isolated reviewers did not modify the implementation
and Reviewer D froze its attack plan before A/B/C findings were available to it.
