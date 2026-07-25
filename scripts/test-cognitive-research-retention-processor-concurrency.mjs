import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

const requestedContainer = process.argv[2] ??
  `supabase_db_${
    path.basename(process.cwd()).replace(/[^A-Za-z0-9_.-]/gu, "_")
  }`;
assert.match(
  requestedContainer,
  /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u,
  "explicit Supabase database container name is invalid",
);

const docker = (args, input = "") => {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    result.stderr.trim() || "local Postgres command failed",
  );
  return result.stdout.trim();
};
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
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
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
    child.on(
      "close",
      (code) => resolve({ code, stderr: stderr.trim(), stdout: stdout.trim() }),
    );
    child.stdin.end(sql);
  });

const ids = {
  backup: randomUUID(),
  execution: randomUUID(),
  processor: randomUUID(),
  project: randomUUID(),
  proof: randomUUID(),
  task: randomUUID(),
};
const brokerToken = "retention-processor-concurrency-token-000000000000";
const attestationHash = hash("retention-processor-concurrency-attestation");

query(`
insert into public.cognitive_projects(
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  ${literal(ids.project)},'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed','off','none',false
);
insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,status,actor_identity,deadman_at,retention_until,
  data_class
) values (
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-research-retention-processor-concurrency',
  ${literal(`retention-processor-${ids.task.slice(0, 8)}`)},repeat('1',64),
  'received','retention-processor-concurrency',
  transaction_timestamp()+interval '1 day',
  transaction_timestamp()+interval '30 days','operational_metadata'
);
insert into public.cognitive_service_identities(
  service_identity,credential_hash,status,issued_at,expires_at
) values (
  'research_source_broker',${literal(hash(brokerToken))},'active',
  transaction_timestamp(),transaction_timestamp()+interval '1 day'
) on conflict (service_identity) do update set
  credential_hash=excluded.credential_hash,status='active',
  issued_at=excluded.issued_at,expires_at=excluded.expires_at,revoked_at=null;
insert into public.cognitive_retention_policy_states(
  task_id,project_id,platform,environment,policy_hash,policy_state,
  user_derived_memory_allowed,raw_user_reports_allowed,
  raw_private_messages_allowed,raw_private_media_allowed,
  raw_user_analytics_allowed,private_model_input_allowed
) values (
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  repeat('2',64),'owner_counsel_decision_required',
  false,false,false,false,false,false
);
insert into public.cognitive_governance_switches(
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at
) values (
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'cognitive_user_derived_memory_enabled',false,
  'collective-governance-v1',null,null
);
set session_replication_role=replica;
insert into public.cognitive_research_backup_retention_attestations(
  id,execution_id,evaluator_proof_id,task_id,project_id,platform,environment,
  provider,provider_plan,backup_state,backup_window_days,restore_available,
  point_in_time_recovery,restored_data_requires_tombstone_replay,
  provider_evidence_hash,provider_verified_at,expires_at
) values (
  ${literal(ids.backup)},${literal(ids.execution)},${literal(ids.proof)},
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'supabase','free','provider_project_backups_absent',0,false,false,true,
  repeat('3',64),transaction_timestamp(),
  transaction_timestamp()+interval '1 day'
);
insert into public.cognitive_research_retention_processor_attestations(
  id,execution_id,evaluator_proof_id,backup_attestation_id,task_id,project_id,
  platform,environment,repository_full_name,source_commit,runtime_provider,
  worker_name,runtime_principal,database_role,schedule_cron,
  schedule_timezone,batch_limit,maximum_batches,timeout_ms,
  maximum_lag_seconds,retention_policy_id,retention_policy_hash,
  worker_version_hash,provider_configuration_hash,attestation_hash,expires_at
) values (
  ${literal(ids.processor)},${literal(ids.execution)},${literal(ids.proof)},
  ${literal(ids.backup)},${literal(ids.task)},${literal(ids.project)},
  'shared','production','Chillywood2025/chillywood-mobile',repeat('4',40),
  'cloudflare_workers','chillywood-level01-public-research-broker',
  'cognitive_public_research_broker','cognitive_public_research_broker',
  '17 * * * *','UTC',100,1,50000,7200,
  'chillywood-cognitive-retention-v1',repeat('2',64),repeat('5',64),
  repeat('6',64),${literal(attestationHash)},
  transaction_timestamp()+interval '1 day'
);
set session_replication_role=origin;
`);

const scheduledAt = query(`
select (
  case
    when date_trunc('hour',transaction_timestamp())+interval '17 minutes'
      <= transaction_timestamp()
    then date_trunc('hour',transaction_timestamp())+interval '17 minutes'
    else date_trunc('hour',transaction_timestamp())-interval '43 minutes'
  end
)::text;
`);
const runSql = `
begin;
select public.cognitive_run_attested_research_retention_maintenance(
  ${literal(ids.processor)},${literal(ids.task)},${literal(ids.project)},
  'shared','production',${literal(scheduledAt)}::timestamptz,100,
  ${literal(brokerToken)}
)::text;
commit;
`;
const results = await Promise.all([runSession(runSql), runSession(runSql)]);
const readbacks = results.map((result) => {
  assert.equal(
    result.code,
    0,
    result.stderr || "concurrent retention processor call failed",
  );
  const line = result.stdout.split("\n").find((entry) =>
    entry.includes('"heartbeat_id"')
  );
  assert.ok(line, "retention processor readback was not returned");
  return JSON.parse(line);
});
assert.deepEqual(
  readbacks.map((readback) => readback.replayed).sort(),
  [false, true],
  "one scheduled execution must win and one must replay",
);

const [maintenanceRuns, heartbeats] = query(`
select
  (select count(*) from public.cognitive_research_maintenance_runs
    where task_id=${literal(ids.task)})::text
  ||'|'||
  (select count(*) from public.cognitive_research_retention_processor_heartbeats
    where processor_attestation_id=${literal(ids.processor)})::text;
`).split("|").map(Number);
assert.equal(maintenanceRuns, 1, "one maintenance run must be created");
assert.equal(heartbeats, 1, "one immutable heartbeat must be created");

console.log("cognitive research retention processor concurrency: 4/4");
