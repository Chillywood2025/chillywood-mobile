import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260723203512_cognitive_two_party_activation_handoff.sql",
  ),
  "utf8",
);
const twoPartyDbTest = fs.readFileSync(
  path.join(root, "supabase/tests/cognitive_two_party_activation_handoff_test.sql"),
  "utf8",
);
const governanceDbTest = fs.readFileSync(
  path.join(root, "supabase/tests/collective_governance_control_plane_test.sql"),
  "utf8",
);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const contains = (needle, message) => assert(migration.includes(needle), message);

const tableStart = migration.indexOf(
  "create table public.governance_model_execution_attestations",
);
const tableEnd = migration.indexOf("create table public.product_experience_baseline_versions");
const tableSql = tableStart >= 0 && tableEnd > tableStart
  ? migration.slice(tableStart, tableEnd)
  : "";

contains(
  "create table public.governance_model_execution_attestations",
  "missing model execution attestation table",
);
for (const column of [
  "assessment_id",
  "council_role",
  "provider_identity_hash",
  "model_family",
  "model_version",
  "execution_identity_hash",
  "evidence_packet_hash",
  "prompt_template_version_hash",
  "output_hash",
  "blind_first_round",
  "correlation_class",
  "cost",
  "latency_ms",
]) {
  assert(tableSql.includes(column), `missing attestation column: ${column}`);
}
assert(
  !/(api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|provider[_-]?credential|model[_-]?credential)/i
    .test(tableSql),
  "model attestation table stores credential-shaped fields",
);
contains(
  "unique (task_id, assessment_id, council_role, execution_identity_hash)",
  "missing duplicate execution identity protection",
);
contains(
  "unique (task_id, assessment_id, output_hash)",
  "missing copied-output dedupe protection",
);
contains(
  "create function public.governance_model_independence_status",
  "missing model independence status function",
);
contains(
  "create function public.governance_enforce_decision_model_independence",
  "missing decision-manifest model independence enforcement trigger",
);
contains(
  "create function public.governance_decision_has_verified_model_independence",
  "missing reusable verified-decision model independence predicate",
);
contains(
  "governance_decision_model_independence_before_insert",
  "decision manifests are not gated by model independence at insert time",
);
contains(
  "governance_approval_versions_model_independence_before_insert",
  "legacy approval versions are not gated by model independence at insert time",
);
contains(
  "governance_decision_capability_model_independence_before_insert",
  "legacy capability bindings are not gated by model independence at insert time",
);
contains(
  "decision_value.model_independence_status <> 'MODEL_INDEPENDENCE_VERIFIED'",
  "Owner approval path does not require verified model independence",
);
contains(
  "count(distinct execution_identity_hash)",
  "independence status does not count distinct executions",
);
contains(
  "count(distinct output_hash)",
  "independence status does not count distinct outputs",
);
contains(
  "count(distinct council_role)",
  "independence status does not count distinct council roles",
);
contains(
  "distinct_roles >= p_required_count",
  "independence status does not require distinct council roles for quorum",
);
contains(
  "provider_count >= 2",
  "independence status does not require cross-provider diversity",
);
contains(
  "correlation_class = 'cross_provider'",
  "independence status does not require cross-provider correlation",
);
contains(
  "MODEL_INDEPENDENCE_PROVIDER_REQUIRED",
  "missing fail-closed provider-required status",
);
assert(
  twoPartyDbTest.includes("duplicate council-role attestations cannot claim independent quorum"),
  "database suite does not prove duplicate council roles fail live quorum",
);
assert(
  governanceDbTest.includes("legacy active approval versions require verified model independence"),
  "database suite does not prove legacy approval activation is gated by model independence",
);
assert(
  governanceDbTest.includes("legacy capability binding cannot attach to an unverified decision"),
  "database suite does not prove legacy capability binding is gated by model independence",
);

const independenceSatisfied = (rows, requiredCount) => {
  const distinctExecutions = new Set(rows.map((row) => row.executionIdentity)).size;
  const distinctOutputs = new Set(rows.map((row) => row.outputHash)).size;
  const distinctRoles = new Set(rows.map((row) => row.councilRole)).size;
  const blindCount = rows.filter((row) => row.blindFirstRound).length;
  const providerCount = new Set(rows.map((row) => row.providerHash)).size;
  const hasIndependentClass = rows.some((row) =>
    row.correlationClass === "cross_provider"
  );
  return rows.length >= requiredCount &&
    distinctExecutions >= requiredCount &&
    distinctOutputs >= requiredCount &&
    distinctRoles >= requiredCount &&
    blindCount >= requiredCount &&
    hasIndependentClass &&
    providerCount >= 2;
};

assert(
  independenceSatisfied([
    {
      executionIdentity: "a",
      outputHash: "1",
      providerHash: "provider-a",
      family: "family-a",
      councilRole: "product_user_experience",
      blindFirstRound: true,
      correlationClass: "cross_provider",
    },
    {
      executionIdentity: "b",
      outputHash: "2",
      providerHash: "provider-b",
      family: "family-b",
      councilRole: "security_privacy",
      blindFirstRound: true,
      correlationClass: "cross_provider",
    },
  ], 2),
  "cross-provider fixture should satisfy independence",
);
assert(
  !independenceSatisfied([
    {
      executionIdentity: "a",
      outputHash: "1",
      providerHash: "provider-a",
      family: "family-a",
      councilRole: "product_user_experience",
      blindFirstRound: true,
      correlationClass: "same_family_isolated_advisory",
    },
    {
      executionIdentity: "a",
      outputHash: "1",
      providerHash: "provider-a",
      family: "family-a",
      councilRole: "product_user_experience",
      blindFirstRound: true,
      correlationClass: "same_family_isolated_advisory",
    },
  ], 2),
  "repeated same-model output fixture should not satisfy independence",
);
assert(
  !independenceSatisfied([
    {
      executionIdentity: "a",
      outputHash: "1",
      providerHash: "provider-a",
      family: "family-a",
      councilRole: "product_user_experience",
      blindFirstRound: true,
      correlationClass: "same_provider_distinct_model_family",
    },
    {
      executionIdentity: "b",
      outputHash: "2",
      providerHash: "provider-a",
      family: "family-b",
      councilRole: "security_privacy",
      blindFirstRound: true,
      correlationClass: "same_provider_distinct_model_family",
    },
  ], 2),
  "same-provider distinct-family fixture should not satisfy independence",
);
assert(
  !independenceSatisfied([
    {
      executionIdentity: "a",
      outputHash: "1",
      providerHash: "provider-a",
      family: "family-a",
      councilRole: "product_user_experience",
      blindFirstRound: true,
      correlationClass: "cross_provider",
    },
    {
      executionIdentity: "b",
      outputHash: "2",
      providerHash: "provider-b",
      family: "family-b",
      councilRole: "product_user_experience",
      blindFirstRound: true,
      correlationClass: "cross_provider",
    },
  ], 2),
  "duplicate council-role fixture should not satisfy independence",
);

if (failures.length > 0) {
  console.error("cognitive model independence contract failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("cognitive model independence contract passed");
