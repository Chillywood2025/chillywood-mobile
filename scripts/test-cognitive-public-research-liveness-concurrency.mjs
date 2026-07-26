import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";

const container = process.argv[2]
  ?? `supabase_db_${path.basename(process.cwd()).replace(/[^A-Za-z0-9_.-]/gu, "_")}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);

const psqlArgs = [
  "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
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
const startSignaledSession = (sql, marker) => {
  let resolveReady;
  let rejectReady;
  let readyResolved = false;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const result = new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!readyResolved && stdout.includes(marker)) {
        readyResolved = true;
        resolveReady();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (!readyResolved) rejectReady(error);
      reject(error);
    });
    child.on("close", (code) => {
      if (!readyResolved) {
        rejectReady(new Error(`session closed before marker ${marker}`));
      }
      resolve({ code, stderr: stderr.trim(), stdout: stdout.trim() });
    });
    child.stdin.end(sql);
  });
  return { ready, result };
};
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");

const ids = {
  owner: randomUUID(),
  project: randomUUID(),
  task: randomUUID(),
};
const serviceToken = randomBytes(48).toString("base64url");

query(`
begin;
insert into public.cognitive_projects(
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  ${literal(ids.project)},'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off','none',false
);
insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,status,actor_identity,deadman_at,retention_until,
  data_class
) values (
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-public-research-liveness-concurrency',
  ${literal(`public-research-liveness-${ids.task.slice(0, 8)}`)},
  ${literal(hash("public-research-liveness-objective"))},'received',
  'research-liveness-fixture',transaction_timestamp()+interval '1 day',
  transaction_timestamp()+interval '30 days','operational_metadata'
);
insert into public.autonomous_system_emergency_states(
  system_id,status,reason,updated_at,metadata
) values (
  'product_intelligence_operator','active',
  'public research liveness concurrency fixture',transaction_timestamp(),
  '{"fixture":"public-research-liveness-concurrency"}'::jsonb
)
on conflict (system_id) do update
set status=excluded.status,reason=excluded.reason,updated_at=excluded.updated_at,
    metadata=excluded.metadata;
insert into public.cognitive_service_identities(
  service_identity,credential_hash,status,issued_at,expires_at
) values (
  'research_source_broker',${literal(hash(serviceToken))},'active',
  transaction_timestamp(),transaction_timestamp()+interval '1 day'
)
on conflict (service_identity) do update
set credential_hash=excluded.credential_hash,status='active',
    issued_at=excluded.issued_at,expires_at=excluded.expires_at,revoked_at=null;
insert into public.cognitive_retention_policy_states(
  task_id,project_id,platform,environment,policy_hash,policy_state,
  user_derived_memory_allowed,raw_user_reports_allowed,
  raw_private_messages_allowed,raw_private_media_allowed,
  raw_user_analytics_allowed,private_model_input_allowed
) values (
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  ${literal(hash("public-research-liveness-retention"))},
  'owner_counsel_decision_required',false,false,false,false,false,false
);
insert into public.cognitive_governance_switches(
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at,updated_at
) values
  (
    ${literal(ids.task)},${literal(ids.project)},'shared','production',
    'cognitive_research_enabled',true,'research-liveness',
    ${literal(ids.owner)},transaction_timestamp(),transaction_timestamp()
  ),
  (
    ${literal(ids.task)},${literal(ids.project)},'shared','production',
    'cognitive_memory_enabled',true,'research-liveness',
    ${literal(ids.owner)},transaction_timestamp(),transaction_timestamp()
  ),
  (
    ${literal(ids.task)},${literal(ids.project)},'shared','production',
    'cognitive_user_derived_memory_enabled',false,'research-liveness',
    null,null,transaction_timestamp()
  );
commit;
`);

const sourceCall = (suffix) => {
  const locator = `https://developer.apple.com/documentation/${suffix}`;
  const excerpt = `Official public platform guidance for ${suffix} is current.`;
  const retrieved = new Date(Date.now() - 60_000);
  const published = new Date(retrieved.getTime() - 86_400_000);
  const freshUntil = new Date(retrieved.getTime() + 86_400_000);
  const publicationMachineValue = published.toISOString();
  const publicationSemanticIdentity = `published-at:${suffix}`;
  const publicationEvidenceHash = hash(
    [
      "published_metadata",
      publicationMachineValue,
      publicationSemanticIdentity,
    ].join("|"),
  );
  return `
begin;
set local role service_role;
set local "request.jwt.claim.role"='service_role';
select public.cognitive_record_public_research_source_v2(
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'apple-docs','developer.apple.com','official_documentation',
  'Apple','apple',${literal(hash(locator))},${literal(hash(locator))},
  ${literal(hash(excerpt))},${literal(published.toISOString())}::timestamptz,
  jsonb_build_object(
    'mode','published_metadata',
    'machineValue',${literal(publicationMachineValue)},
    'semanticIdentity',${literal(publicationSemanticIdentity)},
    'evidenceHash',${literal(publicationEvidenceHash)}
  ),
  ${literal(retrieved.toISOString())}::timestamptz,
  ${literal(freshUntil.toISOString())}::timestamptz,true,${literal(excerpt)},
  jsonb_build_object('title','Official documentation','locator',${literal(locator)}),
  array[${literal(hash(`resolved-address-${suffix}`))}],
  ${literal(serviceToken)}
);
commit;
`;
};
const assertRejectedWithoutPersistence = async (race, suffix) => {
  const result = await runSession(sourceCall(suffix));
  assert.notEqual(result.code, 0, result.stdout);
  assert.match(result.stderr, /public_research_source_v2_rejected/u);
  assert.equal((await race.result).code, 0);
  assert.equal(
    query(`select count(*) from public.research_sources
      where task_id=${literal(ids.task)};`),
    "0",
  );
};

const emergencyMarker = `research-emergency-${randomUUID()}`;
const emergencyRace = startSignaledSession(`
begin;
update public.autonomous_system_emergency_states
set status='emergency_stop',updated_at=transaction_timestamp()
where system_id='product_intelligence_operator';
select ${literal(emergencyMarker)};
select pg_sleep(0.75);
commit;
`, emergencyMarker);
await emergencyRace.ready;
await assertRejectedWithoutPersistence(emergencyRace, "emergency-race");
query(`
update public.autonomous_system_emergency_states
set status='active',updated_at=transaction_timestamp()
where system_id='product_intelligence_operator';
`);

const switchMarker = `research-switch-${randomUUID()}`;
const switchRace = startSignaledSession(`
begin;
update public.cognitive_governance_switches
set enabled=false,enabled_by=null,enabled_at=null,
    disabled_at=transaction_timestamp(),updated_at=transaction_timestamp()
where task_id=${literal(ids.task)}
  and switch_key='cognitive_research_enabled';
select ${literal(switchMarker)};
select pg_sleep(0.75);
commit;
`, switchMarker);
await switchRace.ready;
await assertRejectedWithoutPersistence(switchRace, "switch-race");
query(`
update public.cognitive_governance_switches
set enabled=true,enabled_by=${literal(ids.owner)},
    enabled_at=transaction_timestamp(),disabled_at=null,
    updated_at=transaction_timestamp()
where task_id=${literal(ids.task)}
  and switch_key='cognitive_research_enabled';
`);

const taskMarker = `research-task-${randomUUID()}`;
const taskRace = startSignaledSession(`
begin;
update public.intelligence_tasks
set cancelled_at=transaction_timestamp(),updated_at=transaction_timestamp()
where id=${literal(ids.task)};
select ${literal(taskMarker)};
select pg_sleep(0.75);
commit;
`, taskMarker);
await taskRace.ready;
await assertRejectedWithoutPersistence(taskRace, "task-race");

process.stdout.write("cognitive public research liveness concurrency: 3/3 passed\n");
