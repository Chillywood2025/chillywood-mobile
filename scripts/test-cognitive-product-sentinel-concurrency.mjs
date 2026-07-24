import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";

const requestedContainer = process.argv[2]
  ?? `supabase_db_${path.basename(process.cwd()).replace(/[^A-Za-z0-9_.-]/gu, "_")}`;
assert.match(
  requestedContainer,
  /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u,
  "explicit Supabase database container name is invalid",
);

const docker = (args, input = "") => {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `local Postgres test command failed: ${result.stderr.trim()}`,
  );
  return result.stdout.trim();
};

const containers = docker([
  "ps",
  "--filter",
  "label=com.supabase.cli.project",
  "--format",
  "{{.Names}}",
])
  .split("\n")
  .filter((name) => name.startsWith("supabase_db_"));
assert.ok(
  containers.includes(requestedContainer),
  `the selected project-local Supabase database must be running (${requestedContainer})`,
);

const psqlArgs = [
  "exec",
  "-i",
  requestedContainer,
  "psql",
  "-X",
  "-q",
  "-A",
  "-t",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
  "-d",
  "postgres",
];
const query = (sql) => docker(psqlArgs, sql);
const runSession = (sql) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stderr: stderr.trim(), stdout: stdout.trim() });
    });
    child.stdin.end(sql);
  });
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const assertion = () => randomBytes(48).toString("base64url");

const ids = {
  collectorCapability: randomUUID(),
  owner: randomUUID(),
  project: randomUUID(),
  task: randomUUID(),
  triageCapability: randomUUID(),
};
const collectorAssertion = assertion();
const evaluatorAssertion = assertion();
const triageAssertion = assertion();
const buildHash = hash("sentinel-concurrency-build");
const evidenceHashes = [
  hash("sentinel-concurrency-evidence-one"),
  hash("sentinel-concurrency-evidence-two"),
  hash("sentinel-concurrency-evidence-stop-race"),
];
const idempotencyHashes = [
  hash("sentinel-concurrency-idempotency-one"),
  hash("sentinel-concurrency-idempotency-two"),
  hash("sentinel-concurrency-idempotency-stop-race"),
];
const proofHashes = [
  hash(`sentinel-concurrency-proof-one-${ids.task}`),
  hash(`sentinel-concurrency-proof-two-${ids.task}`),
  hash(`sentinel-concurrency-proof-stop-race-${ids.task}`),
];
const outputHashes = [
  hash("sentinel-concurrency-output-one"),
  hash("sentinel-concurrency-output-two"),
  hash("sentinel-concurrency-output-stop-race"),
];
const runtimeHash = hash("sentinel-concurrency-runtime");
const userImpactHash = hash("sentinel-concurrency-impact");
const affectedHash = hash("sentinel-concurrency-affected");
const providerHash = hash("sentinel-concurrency-provider");
const investigationHash = hash("sentinel-concurrency-investigation");

query(`
begin;
insert into public.cognitive_projects(
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  ${sqlLiteral(ids.project)},'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed','off','none',false
);
insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,actor_identity,deadman_at
) values (
  ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'android','production',
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-product-sentinel-concurrency',
  ${sqlLiteral(`sentinel-concurrency-${hash(ids.task).slice(0, 16)}`)},${sqlLiteral(hash("objective"))},
  'sentinel-concurrency-fixture',transaction_timestamp()+interval '4 hours'
);
insert into public.autonomous_system_emergency_states(
  system_id,status,reason,updated_at,metadata
) values (
  'product_intelligence_operator','active',
  'sentinel concurrency local fixture',transaction_timestamp(),
  '{"fixture":"sentinel-concurrency"}'::jsonb
)
on conflict (system_id) do update
set status=excluded.status,reason=excluded.reason,updated_at=excluded.updated_at,
    metadata=excluded.metadata;
insert into public.cognitive_governance_switches(
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at,updated_at
) values (
  ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'android','production',
  'cognitive_installed_journey_sentinel_enabled',true,
  'sentinel-concurrency-fixture',${sqlLiteral(ids.owner)},
  transaction_timestamp(),transaction_timestamp()
);
insert into public.cognitive_product_quality_service_capabilities(
  id,service_identity,operation,task_id,project_id,platform,environment,
  assertion_hash,allowed_sentinel_keys,registered_by,expires_at
) values
  (
    ${sqlLiteral(ids.collectorCapability)},'cognitive_sentinel_collector',
    'collect_sentinel_run',${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},
    'android','production',${sqlLiteral(hash(collectorAssertion))},
    array['installed_journey_sentinel'],${sqlLiteral(ids.owner)},
    transaction_timestamp()+interval '4 hours'
  ),
  (
    ${sqlLiteral(ids.triageCapability)},'cognitive_product_quality_triage',
    'triage_product_quality',${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},
    'android','production',${sqlLiteral(hash(triageAssertion))},
    '{}'::text[],${sqlLiteral(ids.owner)},
    transaction_timestamp()+interval '4 hours'
  );
insert into public.governance_two_party_service_assertions(
  service_identity,assertion_hash,allowed_operations,registered_by,expires_at
) values (
  'cognitive_independent_evaluator',${sqlLiteral(hash(evaluatorAssertion))},
  array['independent_evaluation'],${sqlLiteral(ids.owner)},
  transaction_timestamp()+interval '4 hours'
)
on conflict (service_identity) do update
set assertion_hash=excluded.assertion_hash,
    allowed_operations=excluded.allowed_operations,
    registered_by=excluded.registered_by,
    expires_at=excluded.expires_at,
    revoked_at=null;
commit;
`);

const metricManifest = (evidenceHash, elapsedDurationMs) =>
  JSON.stringify({
    evidenceHashes: [evidenceHash],
    metrics: { elapsedDurationMs, networkState: "ready" },
    observationKind: "route_timing",
    sanitizationVersion: "bounded-nonpersonal-v1",
    schemaVersion: "product-sentinel-v1",
  });
const serviceRoleSql = `
set local role service_role;
set local "request.jwt.claim.role"='service_role';
`;

const runIds = evidenceHashes.map((evidenceHash, index) =>
  query(`
begin;
${serviceRoleSql}
select public.product_experience_collect_sentinel_run(
  ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'android','production',
  'installed_journey_sentinel','home',${sqlLiteral(runtimeHash)},
  ${sqlLiteral(buildHash)},${sqlLiteral(evidenceHash)},
  ${sqlLiteral(metricManifest(evidenceHash, 12000 + index))}::jsonb,
  'failed','installed_ui_observed',
  transaction_timestamp()-interval '2 minutes',
  transaction_timestamp()-interval '1 minute',
  transaction_timestamp()+interval '1 hour',
  ${sqlLiteral(idempotencyHashes[index])},'cognitive_sentinel_collector',
  ${sqlLiteral(collectorAssertion)}
)->>'sentinelRunId';
commit;
`)
);
runIds.forEach((runId) => assert.match(runId, /^[a-f0-9-]{36}$/u));

const findingKey = query(`
select public.product_quality_expected_finding_key(
  ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'android','production',
  'home','route.loading.unresolved'
);
`);
const assessmentHashes = runIds.map((runId, index) =>
  query(`
select public.product_quality_detection_assessment_hash(
  ${sqlLiteral(runId)},${sqlLiteral(findingKey)},'home',
  ${sqlLiteral(buildHash)},'medium',${sqlLiteral(userImpactHash)},
  array[${sqlLiteral(evidenceHashes[index])}],'loading_state',0.9500,
  'confirmed_defect',${sqlLiteral(affectedHash)},${sqlLiteral(providerHash)},
  ${sqlLiteral(investigationHash)},'installed_ui_observed'
);
`)
);
const proofIds = runIds.map((runId, index) =>
  query(`
begin;
${serviceRoleSql}
select public.product_quality_record_sentinel_evaluator_proof(
  ${sqlLiteral(runId)},'finding_detection',
  ${sqlLiteral(assessmentHashes[index])},${sqlLiteral(evidenceHashes[index])},
  'passed',${sqlLiteral(outputHashes[index])},${sqlLiteral(proofHashes[index])},
  'cognitive_independent_evaluator',${sqlLiteral(evaluatorAssertion)}
)->>'evaluatorProofId';
commit;
`)
);
proofIds.forEach((proofId) => assert.match(proofId, /^[a-f0-9-]{36}$/u));

const triageSql = (index) => `
begin;
${serviceRoleSql}
select public.product_quality_triage_detection(
  ${sqlLiteral(runIds[index])},${sqlLiteral(proofIds[index])},
  ${sqlLiteral(proofHashes[index])},'route.loading.unresolved','home',
  ${sqlLiteral(buildHash)},'medium',${sqlLiteral(userImpactHash)},
  array[${sqlLiteral(evidenceHashes[index])}],'loading_state',0.9500,
  'confirmed_defect',${sqlLiteral(affectedHash)},${sqlLiteral(providerHash)},
  ${sqlLiteral(investigationHash)},'installed_ui_observed',
  'cognitive_product_quality_triage',${sqlLiteral(triageAssertion)}
);
commit;
`;
const raceResults = await Promise.all([runSession(triageSql(0)), runSession(triageSql(1))]);
for (const result of raceResults) {
  assert.equal(result.code, 0, `concurrent triage failed: ${result.stderr}`);
}

const counts = query(`
select concat_ws(
  '|',
  (select count(*) from public.product_quality_findings
   where task_id=${sqlLiteral(ids.task)}),
  (select occurrence_count from public.product_quality_findings
   where task_id=${sqlLiteral(ids.task)}),
  (select count(*) from public.product_quality_finding_events
   where task_id=${sqlLiteral(ids.task)}),
  (select count(distinct event_type) from public.product_quality_finding_events
   where task_id=${sqlLiteral(ids.task)}
     and event_type in ('detected','recurred')),
  (select count(*) from public.product_experience_sentinel_evaluator_proof_consumptions
   where task_id=${sqlLiteral(ids.task)})
);
`);
assert.equal(
  counts,
  "1|2|2|2|2",
  "concurrent detections must produce one current finding, occurrence count two, two immutable event types, and two proof consumptions",
);

const cancellationSession = runSession(`
begin;
update public.intelligence_tasks
set cancelled_at=transaction_timestamp()
where id=${sqlLiteral(ids.task)};
select pg_sleep(1);
commit;
`);
await new Promise((resolve) => setTimeout(resolve, 150));
const stoppedTriage = await runSession(triageSql(2));
const cancellationResult = await cancellationSession;
assert.equal(
  cancellationResult.code,
  0,
  `task cancellation fixture failed: ${cancellationResult.stderr}`,
);
assert.notEqual(
  stoppedTriage.code,
  0,
  "triage must not commit after a concurrent task cancellation wins the task lock",
);
assert.match(
  stoppedTriage.stderr,
  /product_quality_task_not_live/u,
  "cancelled-task triage must fail at the lock-safe write boundary",
);
assert.equal(
  query(`
select concat_ws(
  '|',
  (select occurrence_count from public.product_quality_findings
   where task_id=${sqlLiteral(ids.task)}),
  (select count(*) from public.product_quality_finding_events
   where task_id=${sqlLiteral(ids.task)}),
  (select count(*) from public.product_experience_sentinel_evaluator_proof_consumptions
   where task_id=${sqlLiteral(ids.task)})
);
`),
  "2|2|2",
  "a cancellation-winning race must leave finding state, events, and proof consumption unchanged",
);

console.log("cognitive product sentinel concurrency: 2/2 passed");
