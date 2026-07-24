import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";

const container = process.argv[2]
  ?? `supabase_db_${path.basename(process.cwd()).replace(/[^A-Za-z0-9_.-]/gu, "_")}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);

const psqlArgs = [
  "exec",
  "-i",
  container,
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
  assert.equal(result.status, 0, result.stderr.trim());
  return result.stdout.trim();
};
const query = (sql) => docker(psqlArgs, sql);
const runSession = (sql) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
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
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");

const ids = {
  capability: randomUUID(),
  owner: randomUUID(),
  project: randomUUID(),
  schedule: randomUUID(),
  task: randomUUID(),
};
const assertion = randomBytes(48).toString("base64url");
const idempotencyHash = hash(`factory-idempotency-${ids.task}`);
const objectiveHash = hash(`factory-objective-${ids.task}`);
const scheduledFor = new Date();
scheduledFor.setUTCHours(14, 0, 0, 0);
if (scheduledFor.getTime() > Date.now() + 5 * 60 * 1000) {
  scheduledFor.setUTCDate(scheduledFor.getUTCDate() - 1);
}

query(`
begin;
insert into public.cognitive_projects(
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  ${literal(ids.project)},'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off','bounded_level01',false
);
insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,status,actor_identity,deadman_at,
  retention_until,data_class
) values (
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-level01-factory-concurrency',
  ${literal(`level01-factory-concurrency-${ids.task.slice(0, 8)}`)},
  ${literal(hash("factory-control-objective"))},'received',
  'factory-concurrency-fixture',transaction_timestamp()+interval '30 days',
  transaction_timestamp()+interval '90 days','operational_metadata'
);
insert into public.autonomous_system_emergency_states(
  system_id,status,reason,updated_at,metadata
) values (
  'product_intelligence_operator','active',
  'child-task factory concurrency fixture',transaction_timestamp(),
  '{"fixture":"child-task-factory-concurrency"}'::jsonb
)
on conflict (system_id) do update
set status=excluded.status,reason=excluded.reason,updated_at=excluded.updated_at,
    metadata=excluded.metadata;
insert into public.cognitive_governance_switches(
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at,updated_at
) values
  (
    ${literal(ids.task)},${literal(ids.project)},'shared','production',
    'cognitive_scheduled_level01_enabled',true,'factory-concurrency',
    ${literal(ids.owner)},transaction_timestamp(),transaction_timestamp()
  ),
  (
    ${literal(ids.task)},${literal(ids.project)},'shared','production',
    'cognitive_user_derived_memory_enabled',false,'factory-concurrency',
    null,null,transaction_timestamp()
  ),
  (
    ${literal(ids.task)},${literal(ids.project)},'shared','production',
    'cognitive_level2_production_repairs_enabled',false,'factory-concurrency',
    null,null,transaction_timestamp()
  );
insert into public.cognitive_level01_schedule_definitions(
  id,task_id,project_id,platform,environment,schedule_key,cadence,
  enabled,maximum_tasks,maximum_cost,timeout_seconds,policy_version
) values (
  ${literal(ids.schedule)},${literal(ids.task)},${literal(ids.project)},
  'shared','production','daily_platform_policy_security','0 14 * * *',
  true,3,5.0000,300,'factory-concurrency'
);
insert into public.cognitive_level01_scheduler_capabilities(
  id,service_identity,operation,schedule_definition_id,parent_task_id,
  project_id,platform,environment,assertion_hash,maximum_executions,
  registered_by,expires_at
) values (
  ${literal(ids.capability)},'cognitive_level01_scheduler',
  'issue_recurring_child_task',${literal(ids.schedule)},${literal(ids.task)},
  ${literal(ids.project)},'shared','production',${literal(hash(assertion))},
  4,${literal(ids.owner)},transaction_timestamp()+interval '1 day'
);
commit;
`);

const call = `
begin;
set local role service_role;
set local "request.jwt.claim.role"='service_role';
select public.cognitive_level01_issue_recurring_child_task(
  ${literal(ids.capability)},${literal(ids.schedule)},${literal(ids.task)},
  ${literal(ids.project)},'shared','production',
  ${literal(scheduledFor.toISOString())}::timestamptz,
  ${literal(idempotencyHash)},${literal(objectiveHash)},
  'work_available',null,'cognitive_level01_scheduler',${literal(assertion)}
);
commit;
`;
const results = await Promise.all([runSession(call), runSession(call)]);
for (const result of results) {
  assert.equal(result.code, 0, result.stderr);
}
const receipts = results.map((result) =>
  JSON.parse(result.stdout.split("\n").at(-1))
);
assert.equal(receipts[0].childTaskId, receipts[1].childTaskId);
assert.deepEqual(
  receipts.map(({ deduplicated }) => deduplicated).sort(),
  [false, true],
);
assert.equal(
  query(`
select concat_ws(
  '|',
  (select count(*) from public.intelligence_tasks
   where parent_task_id=${literal(ids.task)}),
  (select count(*) from public.cognitive_level01_scheduled_task_issuances
   where parent_task_id=${literal(ids.task)}),
  (select count(distinct child_task_id)
   from public.cognitive_level01_scheduled_task_issuances
   where parent_task_id=${literal(ids.task)})
);
`),
  "1|1|1",
);

console.log("cognitive Level01 child-task factory concurrency: 1/1 passed");
