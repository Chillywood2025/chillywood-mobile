import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

const requestedContainer =
  process.argv[2] ??
  `supabase_db_${path
    .basename(process.cwd())
    .replace(/[^A-Za-z0-9_.-]/gu, "_")}`;
assert.match(
  requestedContainer,
  /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u,
  "explicit Supabase database container name is invalid",
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
const docker = (args, input = "") => {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    result.stderr.trim() || "local Postgres command failed",
  );
  return result.stdout.trim();
};
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
    child.on("close", (code) =>
      resolve({ code, stderr: stderr.trim(), stdout: stdout.trim() }),
    );
    child.stdin.end(sql);
  });
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const containers = docker([
  "ps",
  "--filter",
  "label=com.supabase.cli.project",
  "--format",
  "{{.Names}}",
]).split("\n");
assert.ok(
  containers.includes(requestedContainer),
  `project-local database is not running (${requestedContainer})`,
);

const brokerToken = "research-live-write-concurrency-token-000000000";
const workerAssertion =
  "research-live-write-concurrency-worker-assertion-000000";
const publishedAt = "2026-07-23T12:00:00.000Z";
const semanticIdentity = "published:2026-07-23T12:00:00.000Z";
const provenanceHash = hash(
  `published_metadata|${publishedAt}|${semanticIdentity}`,
);
const locator = "https://developer.apple.com/test/live-write-concurrency";
const locatorHash = hash(locator);

const makeScope = () => {
  const scope = {
    backup: randomUUID(),
    heartbeat: randomUUID(),
    maintenance: randomUUID(),
    processor: randomUUID(),
    project: randomUUID(),
    revocationExecution: randomUUID(),
    revocationProof: randomUUID(),
    task: randomUUID(),
  };
  scope.attestationHash = hash(`processor:${scope.processor}`);
  scope.heartbeatHash = hash(`heartbeat:${scope.heartbeat}`);
  scope.reasonHash = hash(`reason:${scope.processor}`);
  scope.revocationHash = hash(
    [
      "chillywood-research-retention-processor-revocation-v1",
      "Chillywood2025/chillywood-mobile",
      scope.attestationHash,
      scope.reasonHash,
    ].join("|"),
  );
  scope.sourceReferenceHash = hash(`source:${scope.task}`);
  scope.contentHash = hash(`content:${scope.task}`);
  return scope;
};

const writerFirst = makeScope();
const revokerFirst = makeScope();

const scopeFixtureSql = (scope) => `
insert into public.cognitive_projects(
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  ${literal(scope.project)},'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed','off','none',false
);
insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,status,actor_identity,deadman_at,retention_until,
  data_class
) values (
  ${literal(scope.task)},${literal(scope.project)},'shared','production',
  'Chillywood2025/chillywood-mobile',
  'codex/research-live-write-revocation-concurrency',
  ${literal(`live-write-${scope.task.slice(0, 8)}`)},repeat('1',64),
  'received','research-live-write-concurrency',
  clock_timestamp()+interval '1 day',
  clock_timestamp()+interval '30 days','operational_metadata'
);
insert into public.cognitive_retention_policy_states(
  task_id,project_id,platform,environment,policy_hash,policy_state,
  user_derived_memory_allowed,raw_user_reports_allowed,
  raw_private_messages_allowed,raw_private_media_allowed,
  raw_user_analytics_allowed,private_model_input_allowed
) values (
  ${literal(scope.task)},${literal(scope.project)},'shared','production',
  repeat('2',64),'owner_counsel_decision_required',
  false,false,false,false,false,false
);
insert into public.cognitive_governance_switches(
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at
) values
(
  ${literal(scope.task)},${literal(scope.project)},'shared','production',
  'cognitive_research_enabled',true,'collective-governance-v1',
  'e0000000-0000-4000-8000-000000000001',clock_timestamp()
),
(
  ${literal(scope.task)},${literal(scope.project)},'shared','production',
  'cognitive_memory_enabled',true,'collective-governance-v1',
  'e0000000-0000-4000-8000-000000000001',clock_timestamp()
),
(
  ${literal(scope.task)},${literal(scope.project)},'shared','production',
  'cognitive_user_derived_memory_enabled',false,'collective-governance-v1',
  null,null
);
set session_replication_role=replica;
insert into public.cognitive_research_backup_retention_attestations(
  id,execution_id,evaluator_proof_id,task_id,project_id,platform,environment,
  provider,provider_plan,backup_state,backup_window_days,restore_available,
  point_in_time_recovery,restored_data_requires_tombstone_replay,
  provider_evidence_hash,provider_verified_at,expires_at
) values (
  ${literal(scope.backup)},${literal(randomUUID())},${literal(randomUUID())},
  ${literal(scope.task)},${literal(scope.project)},'shared','production',
  'supabase','free','provider_project_backups_absent',0,false,false,true,
  repeat('3',64),clock_timestamp()-interval '1 minute',
  clock_timestamp()+interval '1 day'
);
insert into public.cognitive_research_retention_processor_attestations(
  id,execution_id,evaluator_proof_id,backup_attestation_id,task_id,project_id,
  platform,environment,repository_full_name,source_commit,runtime_provider,
  worker_name,runtime_principal,database_role,schedule_cron,
  schedule_timezone,batch_limit,maximum_batches,timeout_ms,
  maximum_lag_seconds,retention_policy_id,retention_policy_hash,
  worker_version_hash,provider_configuration_hash,attestation_hash,expires_at
) values (
  ${literal(scope.processor)},${literal(randomUUID())},${literal(randomUUID())},
  ${literal(scope.backup)},${literal(scope.task)},${literal(scope.project)},
  'shared','production','Chillywood2025/chillywood-mobile',repeat('4',40),
  'cloudflare_workers','chillywood-level01-public-research-broker',
  'cognitive_public_research_broker','cognitive_public_research_broker',
  '17 * * * *','UTC',100,1,50000,7200,
  'chillywood-cognitive-retention-v1',repeat('2',64),repeat('5',64),
  repeat('6',64),${literal(scope.attestationHash)},
  clock_timestamp()+interval '1 day'
);
insert into public.cognitive_research_retention_processor_heartbeats(
  id,processor_attestation_id,maintenance_run_id,task_id,project_id,
  platform,environment,scheduled_at,source_count,claim_count,total_count,
  no_work,attestation_hash,event_hash,completed_at,created_at
) values (
  ${literal(scope.heartbeat)},${literal(scope.processor)},
  ${literal(scope.maintenance)},${literal(scope.task)},
  ${literal(scope.project)},'shared','production',
  date_trunc('hour',clock_timestamp())-interval '43 minutes',
  0,0,0,true,${literal(scope.attestationHash)},${literal(scope.heartbeatHash)},
  clock_timestamp(),clock_timestamp()
);
insert into public.governance_approved_action_executions(
  id,approval_record_id,approval_version_id,task_id,project_id,
  repository_full_name,branch_name,platform,environment,provider,operation,
  claim_sequence,state,service_identity,service_identity_hash,
  worker_assertion_hash,decision_manifest_hash,plan_snapshot_hash,
  approval_hash,target_resource_hash,budget_hash,tests_hash,
  evaluator_requirement_hash,rollback_hash,execution_receipt_hash,
  evaluator_proof_hash,claimed_at,began_at,completed_at,updated_at
) values (
  ${literal(scope.revocationExecution)},${literal(randomUUID())},
  ${literal(randomUUID())},${literal(scope.task)},${literal(scope.project)},
  'Chillywood2025/chillywood-mobile',
  'codex/research-live-write-revocation-concurrency',
  'shared','production','public_research','public_research_ingest',1,
  'completed','cognitive_approved_action_worker',repeat('8',64),
  repeat('9',64),repeat('a',64),repeat('b',64),repeat('c',64),
  ${literal(scope.revocationHash)},repeat('d',64),repeat('e',64),
  repeat('f',64),repeat('0',64),repeat('1',64),repeat('2',64),
  clock_timestamp()-interval '3 minutes',
  clock_timestamp()-interval '2 minutes',
  clock_timestamp()-interval '1 minute',clock_timestamp()
);
insert into public.governance_approved_execution_evaluator_proofs(
  id,execution_id,approval_record_id,approval_version_id,task_id,project_id,
  platform,environment,evaluator_identity,evaluator_identity_hash,
  execution_receipt_hash,evaluator_proof_hash,evaluator_requirement_hash,
  verdict,created_at
) select
  ${literal(scope.revocationProof)},execution.id,
  execution.approval_record_id,execution.approval_version_id,
  execution.task_id,execution.project_id,execution.platform,
  execution.environment,'cognitive_independent_evaluator',repeat('3',64),
  execution.execution_receipt_hash,execution.evaluator_proof_hash,
  execution.evaluator_requirement_hash,'passed',
  clock_timestamp()-interval '30 seconds'
from public.governance_approved_action_executions execution
where execution.id=${literal(scope.revocationExecution)};
set session_replication_role=origin;
`;

const sourceCallSql = (scope) => `
select public.cognitive_record_public_research_source_v2(
  ${literal(scope.task)},${literal(scope.project)},'shared','production',
  'apple-docs','developer.apple.com','official_documentation','Apple','apple',
  ${literal(scope.sourceReferenceHash)},${literal(locatorHash)},
  ${literal(scope.contentHash)},${literal(publishedAt)}::timestamptz,
  jsonb_build_object(
    'mode','published_metadata',
    'machineValue',${literal(publishedAt)},
    'semanticIdentity',${literal(semanticIdentity)},
    'evidenceHash',${literal(provenanceHash)}
  ),
  clock_timestamp(),clock_timestamp()+interval '1 day',true,
  'bounded public research concurrency evidence',
  jsonb_build_object('title','Concurrency fixture','locator',${literal(locator)}),
  array[repeat('4',64)],${literal(brokerToken)}
)::text;
`;
const revokeCallSql = (scope) => `
select public.governance_revoke_research_retention_activation(
  ${literal(scope.revocationExecution)},${literal(scope.processor)},
  ${literal(scope.reasonHash)},'cognitive_approved_action_worker',
  ${literal(workerAssertion)}
)::text;
`;
const scopeLockSql = (scope) => `
select pg_catalog.pg_advisory_xact_lock(
  public.cognitive_research_retention_scope_lock_key(
    ${literal(scope.task)},${literal(scope.project)},'shared','production'
  )
);
`;

{
  query(`
insert into public.cognitive_service_identities(
  service_identity,credential_hash,status,issued_at,expires_at
) values (
  'research_source_broker',${literal(hash(brokerToken))},'active',
  clock_timestamp(),clock_timestamp()+interval '1 day'
) on conflict (service_identity) do update set
  credential_hash=excluded.credential_hash,status='active',
  issued_at=excluded.issued_at,expires_at=excluded.expires_at,revoked_at=null;
insert into public.governance_two_party_service_assertions(
  service_identity,assertion_hash,allowed_operations,registered_by,
  status,issued_at,expires_at
) values (
  'cognitive_approved_action_worker',${literal(hash(workerAssertion))},
  array['public_research_ingest'],
  'e0000000-0000-4000-8000-000000000001','active',
  clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day'
) on conflict (service_identity) do update set
  assertion_hash=excluded.assertion_hash,
  allowed_operations=excluded.allowed_operations,status='active',
  issued_at=excluded.issued_at,expires_at=excluded.expires_at,
  revoked_at=null,revoked_by=null,revocation_hash=null;
insert into public.autonomous_system_emergency_states(
  system_id,status,reason,updated_at,metadata
) values (
  'product_intelligence_operator','active',
  'research live-write concurrency fixture',clock_timestamp(),
  '{"fixture":"research-live-write-concurrency"}'::jsonb
) on conflict (system_id) do update set
  status=excluded.status,reason=excluded.reason,updated_at=excluded.updated_at,
  metadata=excluded.metadata;
${scopeFixtureSql(writerFirst)}
${scopeFixtureSql(revokerFirst)}
`);

  const writerFirstSql = `
begin;
select set_config('request.jwt.claim.role','service_role',true);
${scopeLockSql(writerFirst)}
select pg_sleep(0.35);
${sourceCallSql(writerFirst)}
commit;
`;
  const writerFirstPromise = runSession(writerFirstSql);
  await sleep(75);
  const writerFirstRevokePromise = runSession(`
begin;
select set_config('request.jwt.claim.role','service_role',true);
${revokeCallSql(writerFirst)}
commit;
`);
  const [writerFirstResult, writerFirstRevokeResult] = await Promise.all([
    writerFirstPromise,
    writerFirstRevokePromise,
  ]);
  assert.equal(
    writerFirstResult.code,
    0,
    writerFirstResult.stderr || "writer-first mutation failed",
  );
  assert.equal(
    writerFirstRevokeResult.code,
    0,
    writerFirstRevokeResult.stderr || "writer-first revocation failed",
  );
  assert.equal(
    query(`
select
  (select count(*) from public.research_sources
    where task_id=${literal(writerFirst.task)})::text
  ||'|'||
  (select count(*)
   from public.cognitive_research_retention_processor_revocations
   where processor_attestation_id=${literal(writerFirst.processor)})::text;
`),
    "1|1",
    "writer-first ordering must commit one write before one revocation",
  );

  const revokerFirstPromise = runSession(`
begin;
select set_config('request.jwt.claim.role','service_role',true);
${scopeLockSql(revokerFirst)}
${revokeCallSql(revokerFirst)}
select pg_sleep(0.35);
commit;
`);
  await sleep(75);
  const revokerFirstWriterPromise = runSession(`
begin;
select set_config('request.jwt.claim.role','service_role',true);
${sourceCallSql(revokerFirst)}
commit;
`);
  const [revokerFirstResult, revokerFirstWriterResult] = await Promise.all([
    revokerFirstPromise,
    revokerFirstWriterPromise,
  ]);
  assert.equal(
    revokerFirstResult.code,
    0,
    revokerFirstResult.stderr || "revoker-first revocation failed",
  );
  assert.notEqual(
    revokerFirstWriterResult.code,
    0,
    "revoker-first writer must fail closed",
  );
  assert.match(
    revokerFirstWriterResult.stderr,
    /cognitive_research_retention_processor_required/u,
    "revoker-first writer must fail at the post-lock readiness recheck",
  );
  assert.equal(
    query(`
select
  (select count(*) from public.research_sources
    where task_id=${literal(revokerFirst.task)})::text
  ||'|'||
  (select count(*)
   from public.cognitive_research_retention_processor_revocations
   where processor_attestation_id=${literal(revokerFirst.processor)})::text;
`),
    "0|1",
    "revoker-first ordering must persist revocation and reject the write",
  );

  console.log("cognitive research live-write/revocation concurrency: 6/6");
}
