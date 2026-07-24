import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const migration = read(
  "supabase/migrations/20260723203512_cognitive_two_party_activation_handoff.sql",
);
const ownerEndpoint = read(
  "supabase/functions/cognitive-owner-approval/index.ts",
);
const workerEndpoint = read(
  "supabase/functions/cognitive-approved-action-worker/index.ts",
);
const evaluatorEndpoint = read(
  "supabase/functions/cognitive-independent-evaluator/index.ts",
);
const governanceControl = read(
  "supabase/functions/cognitive-governance-control/index.ts",
);
const autonomousApprovalRequest = read(
  "supabase/functions/autonomous-approval-request/index.ts",
);
const dbTest = read("supabase/tests/cognitive_two_party_activation_handoff_test.sql");

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const contains = (text, needle, message) =>
  assert(text.includes(needle), message);
const notContains = (text, needle, message) =>
  assert(!text.includes(needle), message);
const between = (text, startNeedle, endNeedle) => {
  const start = text.indexOf(startNeedle);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  if (start === -1 || end === -1 || end <= start) return "";
  return text.slice(start, end);
};
const switchExecutionFunction = between(
  migration,
  "create function public.governance_execute_approved_switch",
  "create or replace function public.governance_set_level01_switch",
);

contains(
  migration,
  "create table public.governance_owner_approval_versions",
  "missing immutable Owner approval version table",
);
contains(
  migration,
  "create table public.governance_approved_action_executions",
  "missing service execution receipt table",
);
contains(
  migration,
  "create table public.governance_approved_execution_evaluator_proofs",
  "missing immutable independent evaluator proof table",
);
contains(
  migration,
  "create function public.governance_service_identity_allows_operation",
  "missing service identity to operation allowlist",
);
contains(
  migration,
  "create function public.governance_assert_two_party_service_principal",
  "missing database service-principal verifier",
);
contains(
  migration,
  "create function public.governance_revoke_two_party_service_principal",
  "missing explicit service-principal revocation RPC",
);
contains(
  migration,
  "when 'cognitive_independent_evaluator' then p_operation = 'independent_evaluation'",
  "independent evaluator service identity is not restricted to evaluation",
);
contains(
  migration,
  "create function public.governance_record_approved_execution_evaluator_proof",
  "missing service-only independent evaluator proof RPC",
);
contains(
  migration,
  "proof_value.verdict <> 'passed'",
  "execution completion does not require a passed independent evaluator proof",
);
contains(
  migration,
  "perform public.governance_apply_completed_switch(p_execution_id)",
  "switch activation is not deferred to completion after evaluator proof",
);
contains(
  migration,
  "request_role <> 'service_role'",
  "service-principal verifier does not check the service-role claim",
);
contains(
  migration,
  "assertion.assertion_hash = encode(",
  "service-principal verifier does not bind a server-side assertion hash",
);
contains(
  migration,
  "from public.governance_two_party_service_assertions assertion",
  "service-principal verifier does not read the assertion registry",
);
contains(
  migration,
  "for share;",
  "service-principal verifier does not lock the matched assertion row",
);
contains(
  migration,
  "create function public.governance_approved_execution_is_live",
  "missing post-claim execution liveness verifier",
);
contains(
  migration,
  "create function public.governance_lock_approved_execution_liveness",
  "missing locked service execution liveness verifier",
);
contains(
  migration,
  "create function public.governance_lock_approved_execution_cleanup_scope",
  "missing locked service execution cleanup verifier",
);
contains(
  migration,
  "from public.governance_owner_approval_version_states state",
  "locked liveness verifier does not lock approval version state",
);
contains(
  migration,
  "from public.autonomous_system_emergency_states state",
  "locked liveness verifier does not lock emergency-stop state",
);
contains(
  migration,
  "governance_lock_approved_execution_liveness(p_execution_id)",
  "side-effecting service RPCs do not use the locked liveness verifier",
);
contains(
  migration,
  "governance_lock_approved_execution_cleanup_scope(p_execution_id)",
  "cleanup service RPCs do not use the locked cleanup verifier",
);
contains(
  migration,
  "(execution_value.state = 'postflight' and p_next_state = 'evaluating')",
  "generic begin transitions do not preserve postflight to evaluating handoff",
);
notContains(
  migration,
  "execution_value.state = 'executing' and p_next_state <> 'postflight'",
  "generic begin transition still allows executing to postflight",
);
contains(
  migration,
  "and state.revoked_at is null",
  "post-claim execution liveness does not recheck Owner revocation",
);
contains(
  migration,
  "p_transition = 'rollback_pending'",
  "rollback release RPC does not enforce explicit legal prior states",
);
contains(
  migration,
  "execution_value.state = 'rollback_running'",
  "rollback terminal states are not bound to rollback_running",
);
contains(
  migration,
  "create function public.governance_switch_target_hash",
  "missing deterministic approved switch target binding",
);
contains(
  migration,
  "p_target_resource_hash <> public.governance_switch_target_hash",
  "approved switch execution does not recompute target hash from switch payload",
);
contains(
  switchExecutionFunction,
  "pending_switch_key = p_switch_key",
  "approved switch execution does not stage switch key on the execution row",
);
contains(
  switchExecutionFunction,
  "'staged', true",
  "approved switch execution does not report a staged, non-live switch result",
);
notContains(
  switchExecutionFunction,
  "insert into public.cognitive_governance_switches",
  "approved switch execution still writes a live switch before evaluator completion",
);
contains(
  migration,
  "raise exception 'two_party_owner_approval_required'",
  "legacy direct Owner switch RPC does not fail closed",
);
contains(
  migration,
  "revoke all on function public.governance_record_owner_approval",
  "Owner approval RPC grant is not explicitly revoked before grant",
);
contains(
  migration,
  ") from public, anon, service_role;",
  "Owner approval RPC is not explicitly denied to service_role",
);
contains(
  migration,
  "grant execute on function public.governance_record_owner_approval",
  "Owner approval RPC is not granted to authenticated Owner callers",
);
contains(
  migration,
  "grant execute on function public.governance_claim_approved_action",
  "service claim RPC is not granted to service_role",
);
contains(
  migration,
  "from public, anon, authenticated;",
  "service execution RPCs are not denied to authenticated clients",
);
contains(
  ownerEndpoint,
  "SUPABASE_ANON_KEY",
  "Owner approval endpoint does not use the normal authenticated path",
);
notContains(
  ownerEndpoint,
  "SUPABASE_SERVICE_ROLE_KEY",
  "Owner approval endpoint can read the service-role key",
);
notContains(
  ownerEndpoint,
  "governance_claim_approved_action",
  "Owner approval endpoint can claim service execution",
);
notContains(
  ownerEndpoint,
  "governance_execute_approved_switch",
  "Owner approval endpoint can execute a switch",
);
contains(
  workerEndpoint,
  "COGNITIVE_APPROVED_ACTION_WORKER_INVOKE_SHA256",
  "worker endpoint is missing the server-only invocation proof",
);
contains(
  workerEndpoint,
  "COGNITIVE_APPROVED_ACTION_WORKER_ASSERTION",
  "worker endpoint is missing the service assertion source",
);
contains(
  workerEndpoint,
  "SUPABASE_SERVICE_ROLE_KEY",
  "worker endpoint does not use the service principal path",
);
contains(
  workerEndpoint,
  "switchTargetHash",
  "worker endpoint does not derive switch target hash from exact switch payload",
);
contains(
  workerEndpoint,
  'const BEGIN_STATES = new Set(["preflight", "executing", "evaluating"])',
  "worker endpoint permits postflight as a generic begin transition",
);
notContains(
  workerEndpoint,
  "governance_record_owner_approval",
  "worker endpoint can create Owner approval",
);
notContains(
  workerEndpoint,
  "governance_record_approved_execution_evaluator_proof",
  "worker endpoint can self-attest independent evaluator proof",
);
contains(
  evaluatorEndpoint,
  "COGNITIVE_INDEPENDENT_EVALUATOR_INVOKE_SHA256",
  "independent evaluator endpoint is missing the server-only invocation proof",
);
contains(
  evaluatorEndpoint,
  "COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION",
  "independent evaluator endpoint is missing the service assertion source",
);
contains(
  evaluatorEndpoint,
  "governance_record_approved_execution_evaluator_proof",
  "independent evaluator endpoint cannot record evaluator proof",
);
notContains(
  evaluatorEndpoint,
  "governance_claim_approved_action",
  "independent evaluator endpoint can claim service execution",
);
notContains(
  evaluatorEndpoint,
  "governance_execute_approved_switch",
  "independent evaluator endpoint can execute a switch",
);
notContains(
  evaluatorEndpoint,
  "governance_complete_approved_execution",
  "independent evaluator endpoint can complete service execution",
);
contains(
  governanceControl,
  "two_party_owner_approval_required",
  "legacy governance control endpoint does not reject direct switch writes",
);
contains(
  governanceControl,
  "two_party_service_worker_required",
  "legacy governance control endpoint does not reject direct service writes",
);
contains(
  governanceControl,
  "product_intelligence_operator",
  "governance status endpoint does not read product-intelligence emergency state",
);
contains(
  autonomousApprovalRequest,
  "\"product_intelligence_operator\"",
  "Owner emergency route does not allow product-intelligence emergency stop",
);
contains(
  dbTest,
  "Owner-authenticated requests cannot service-execute an approved action",
  "database suite does not prove Owner cannot service-execute",
);
contains(
  dbTest,
  "service principal cannot create Owner approval",
  "database suite does not prove service principal cannot approve",
);
contains(
  dbTest,
  "Owner can revoke a service-principal assertion through an explicit RPC",
  "database suite does not prove explicit service-principal assertion revocation",
);
contains(
  dbTest,
  "revoked service-principal assertion cannot execute",
  "database suite does not prove revoked service-principal assertions fail closed",
);
contains(
  dbTest,
  "single-use approval cannot replay after first claim",
  "database suite does not prove replay is denied",
);
contains(
  dbTest,
  "post-claim task cancellation blocks execution transition",
  "database suite does not prove cancellation blocks claimed execution",
);
contains(
  dbTest,
  "post-claim Owner revocation blocks execution transition",
  "database suite does not prove revocation blocks claimed execution",
);
contains(
  dbTest,
  "generic begin cannot enter postflight before the approved operation-specific executor runs",
  "database suite does not prove postflight requires the operation-specific executor",
);
contains(
  dbTest,
  "single-use Owner revocation blocks later approved switch execution",
  "database suite does not prove consumed single-use approvals remain revokable while in flight",
);
contains(
  dbTest,
  "single-use Owner revocation blocks completion",
  "database suite does not prove consumed single-use revocation blocks late completion",
);
contains(
  dbTest,
  "side effects and success use locked liveness while cleanup uses locked cleanup scope",
  "database suite does not prove side-effect liveness and cleanup-scope separation",
);
contains(
  dbTest,
  "approved switch execution rejects a different switch key",
  "database suite does not prove switch target payload binding",
);
contains(
  dbTest,
  "approved switch execution stages but does not activate before evaluator proof",
  "database suite does not prove switches stay inactive before evaluator proof",
);
contains(
  dbTest,
  "completion without an independent evaluator proof is rejected",
  "database suite does not prove completion requires evaluator proof",
);
contains(
  dbTest,
  "worker service identity cannot self-attest evaluator proof",
  "database suite does not prove worker cannot self-attest evaluator proof",
);
contains(
  dbTest,
  "independent evaluator proof permits completion and activates staged switch",
  "database suite does not prove evaluator proof gates final switch activation",
);
contains(
  dbTest,
  "rollback cannot skip directly from executing to rollback_succeeded",
  "database suite does not prove rollback state skips are rejected",
);
contains(
  dbTest,
  "emergency stop after side effect permits audited quarantine cleanup",
  "database suite does not prove emergency-stop cleanup after side effects",
);
contains(
  dbTest,
  "single-use Owner revocation permits quarantine cleanup after execution started",
  "database suite does not prove revocation still permits terminal cleanup",
);
contains(
  dbTest,
  "same expired approval version cannot be revalidated twice",
  "database suite does not prove stale approval revalidation is rejected",
);
contains(
  dbTest,
  "stale non-current approval version cannot be claimed after revalidation",
  "database suite does not prove claim requires the current approval version",
);

if (failures.length > 0) {
  console.error("cognitive two-party handoff contract failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("cognitive two-party handoff contract passed");
