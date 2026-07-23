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
const governanceControl = read(
  "supabase/functions/cognitive-governance-control/index.ts",
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
  "create function public.governance_approved_execution_is_live",
  "missing post-claim execution liveness verifier",
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
notContains(
  workerEndpoint,
  "governance_record_owner_approval",
  "worker endpoint can create Owner approval",
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
  "approved switch execution rejects a different switch key",
  "database suite does not prove switch target payload binding",
);
contains(
  dbTest,
  "rollback cannot skip directly from executing to rollback_succeeded",
  "database suite does not prove rollback state skips are rejected",
);
contains(
  dbTest,
  "post-claim Owner revocation blocks rollback and quarantine transition",
  "database suite does not prove rollback/quarantine rechecks liveness",
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
