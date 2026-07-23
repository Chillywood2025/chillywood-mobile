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

if (failures.length > 0) {
  console.error("cognitive two-party handoff contract failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("cognitive two-party handoff contract passed");
