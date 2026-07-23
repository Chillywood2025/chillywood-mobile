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
| `source_complete_not_deployed` | `config/intelligence/cognitive-platform.json`; component inventory | `scripts/cognitive-contract-suite.mjs` | Under review | “Source complete” may overstate contracts that have no executable broker/capability implementation. | Pending synthesis |
| Activation is off | cognitive config; registry activation mode | cognitive contract guard | Source value reproduced | None at baseline | Pending synthesis |
| Scheduler is none | cognitive config; component inventory; repository scheduler search | inventory guard | Source value reproduced | None at baseline | Pending synthesis |
| Production model credentials are none | cognitive config/registry and repository credential-reference search | cognitive contract guard | Repository absence only; provider state requires separate evidence | Repository inspection cannot prove every external secret store is empty. | Pending synthesis |
| Production tool credentials are none | cognitive config/registry and provider-reference search | cognitive contract guard | Repository absence only; provider state requires separate evidence | Repository inspection cannot prove every external secret store is empty. | Pending synthesis |
| Cognitive migrations are undeployed | linked migration history | local migration test | Linked readback required | None at baseline | Pending synthesis |
| Cognitive Edge Functions are undeployed | function inventory and PR diff | Deno check only | Remote function readback required | Existing Owner Command function predates this PR; changed source must be distinguished from its deployed version. | Pending synthesis |
| Production execution is disabled | execution validator, registry/config, Admin UI | execution-safety suite | Under adversarial review | Contract constants are not equivalent to a complete capability enforcement path. | Pending synthesis |
| Admin foundation is read-only | Admin component and containing route gate | TypeScript/static guard | Under route/RPC review | UI `disabled` alone is not an authorization control. | Pending synthesis |
| No authority over money, rights, auth/RLS, roles, moderation, release/OTA, pricing, or provider products | registry/config/validator/owner command restrictions | cognitive execution tests | Under architecture and control-plane review | Path/action allowlists and downstream delegation must be checked independently. | Pending synthesis |
| No self-approval | execution validator and registry | execution-safety suite | Under approval/capability review | Current check only compares two optional identifiers. | Pending synthesis |
| No unrestricted credential | registry/config and source scan | cognitive contract guard | Under provider/tool review | External credential absence cannot be proven solely from Git. | Pending synthesis |
