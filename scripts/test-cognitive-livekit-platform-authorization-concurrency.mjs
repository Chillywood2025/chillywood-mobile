#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const container = process.env.SUPABASE_DB_CONTAINER ||
  `supabase_db_${path.basename(root)}`;
const uuid = () => crypto.randomUUID();
const hash = () => crypto.randomBytes(32).toString("hex");
const literal = (value) =>
  `'${String(value).replaceAll("'", "''")}'`;
const ids = {
  owner: uuid(),
  project: uuid(),
  sharedTask: uuid(),
  androidTask: uuid(),
  iosTask: uuid(),
  baseline: uuid(),
  androidCollect: uuid(),
  androidIssue: uuid(),
  androidConsume: uuid(),
  androidTriage: uuid(),
  iosCollect: uuid(),
  iosIssue: uuid(),
  iosConsume: uuid(),
  iosTriage: uuid(),
  androidReceiptA: null,
  androidReceiptB: null,
  iosReceipt: null,
  baselineApproval: uuid(),
  baselineExecution: uuid(),
};
const collectorAssertion = hash();
const triageAssertion = hash();
const evaluatorAssertion = hash();
const sourceCommit = "a".repeat(40);
const sourceTree = "b".repeat(40);
const h = Array.from({ length: 12 }, hash);
let stage = "setup";

const psqlArgs = [
  "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
];
const admin = (sql, capture = false) => {
  const result = spawnSync("docker", psqlArgs, {
    cwd: root,
    encoding: "utf8",
    input: sql,
    stdio: ["pipe", capture ? "pipe" : "ignore", "pipe"],
  });
  return result;
};
const readJson = (sql) => {
  const result = admin(sql, true);
  assert.equal(result.status, 0);
  return JSON.parse(result.stdout.trim() || "null");
};
const evaluatorAssertionBefore = readJson(`
select coalesce(
  (
    select row_to_json(assertion)
    from public.governance_two_party_service_assertions assertion
    where assertion.service_identity='cognitive_product_quality_evaluator'
  ),
  'null'::json
)::text;
`);
const emergencyStateBefore = readJson(`
select coalesce(
  (
    select row_to_json(emergency)
    from public.autonomous_system_emergency_states emergency
    where emergency.system_id='product_intelligence_operator'
  ),
  'null'::json
)::text;
`);
let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  const restoreEvaluator = evaluatorAssertionBefore === null
    ? `
delete from public.governance_two_party_service_assertions
where service_identity='cognitive_product_quality_evaluator'
  and assertion_hash=${literal(evaluatorAssertion)};
`
    : `
insert into public.governance_two_party_service_assertions
select restored.*
from json_populate_record(
  null::public.governance_two_party_service_assertions,
  ${literal(JSON.stringify(evaluatorAssertionBefore))}::json
) restored
on conflict (service_identity) do update set
  assertion_hash=excluded.assertion_hash,
  allowed_operations=excluded.allowed_operations,
  registered_by=excluded.registered_by,
  status=excluded.status,
  issued_at=excluded.issued_at,
  expires_at=excluded.expires_at,
  revoked_at=excluded.revoked_at,
  revoked_by=excluded.revoked_by,
  revocation_hash=excluded.revocation_hash,
  created_at=excluded.created_at;
`;
  const restoreEmergency = emergencyStateBefore === null
    ? `
delete from public.autonomous_system_emergency_states
where system_id='product_intelligence_operator'
  and metadata @> '{"fixture":true}'::jsonb;
`
    : `
insert into public.autonomous_system_emergency_states
select restored.*
from json_populate_record(
  null::public.autonomous_system_emergency_states,
  ${literal(JSON.stringify(emergencyStateBefore))}::json
) restored
on conflict (system_id) do update set
  status=excluded.status,
  reason=excluded.reason,
  updated_by=excluded.updated_by,
  updated_at=excluded.updated_at,
  metadata=excluded.metadata;
`;
  const result = admin(`
begin;
set local session_replication_role=replica;
do $cleanup$
declare target record;
begin
  for target in
    select columns.table_name
    from information_schema.columns columns
    join information_schema.tables tables
      on tables.table_schema=columns.table_schema
     and tables.table_name=columns.table_name
    where columns.table_schema='public'
      and columns.column_name='project_id'
      and tables.table_type='BASE TABLE'
  loop
    execute format(
      'delete from public.%I where project_id=$1',
      target.table_name
    ) using ${literal(ids.project)}::uuid;
  end loop;
end
$cleanup$;
delete from public.cognitive_projects
where id=${literal(ids.project)}::uuid;
delete from public.platform_role_memberships
where user_id=${literal(ids.owner)};
${restoreEvaluator}
${restoreEmergency}
commit;
`);
  if (result.status !== 0) {
    const diagnostic = result.stderr
      .split("\n")
      .find((line) => line.includes("ERROR:"))
      ?.replaceAll(/'[^']*'/gu, "'<redacted>'")
      .replaceAll(/[A-Fa-f0-9-]{36,}/gu, "<redacted>")
      ?? "no_sanitized_postgres_error";
    throw new Error(`platform authorization cleanup failed: ${diagnostic}`);
  }
  cleaned = true;
};
process.on("exit", () => {
  if (!cleaned) cleanup();
});
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));
const session = (sql) =>
  new Promise((resolve) => {
    const child = spawn("docker", psqlArgs, {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.end(sql);
  });
const ownerSql = (statement) => `
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',${literal(ids.owner)},true);
select set_config(
  'request.jwt.claims',
  ${literal(JSON.stringify({
    role: "authenticated",
    sub: ids.owner,
  }))},
  true
);
${statement}
commit;
`;
const capabilityRows = (task, platform, collect, issue, consume, triage) => `
(
  ${literal(collect)}::uuid,'cognitive_livekit_experience_collector',
  'collect_livekit_sentinel_run',${literal(task)}::uuid,
  ${literal(ids.project)}::uuid,${literal(platform)},'production',
  ${literal(collectorAssertion)},
  array['livekit_experience_sentinel'],${literal(ids.owner)}::uuid,
  transaction_timestamp()+interval '1 hour'
),
(
  ${literal(issue)}::uuid,'cognitive_livekit_experience_collector',
  'issue_livekit_failure_fixture',${literal(task)}::uuid,
  ${literal(ids.project)}::uuid,${literal(platform)},'production',
  ${literal(collectorAssertion)},
  array['livekit_experience_sentinel'],${literal(ids.owner)}::uuid,
  transaction_timestamp()+interval '1 hour'
),
(
  ${literal(consume)}::uuid,'cognitive_livekit_experience_collector',
  'consume_livekit_failure_fixture',${literal(task)}::uuid,
  ${literal(ids.project)}::uuid,${literal(platform)},'production',
  ${literal(collectorAssertion)},
  array['livekit_experience_sentinel'],${literal(ids.owner)}::uuid,
  transaction_timestamp()+interval '1 hour'
),
(
  ${literal(triage)}::uuid,'cognitive_product_quality_triage',
  'triage_product_quality',${literal(task)}::uuid,
  ${literal(ids.project)}::uuid,${literal(platform)},'production',
  ${literal(triageAssertion)},'{}'::text[],${literal(ids.owner)}::uuid,
  transaction_timestamp()+interval '1 hour'
)
`;
const setup = admin(`
begin;
set local session_replication_role=replica;
insert into public.platform_role_memberships(user_id,email,role,status)
values (${literal(ids.owner)}::uuid,null,'owner','active');
insert into public.cognitive_projects(
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  ${literal(ids.project)}::uuid,'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off','none',false
);
insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,actor_identity,deadman_at
) values
(
  ${literal(ids.sharedTask)}::uuid,${literal(ids.project)}::uuid,
  'shared','production','Chillywood2025/chillywood-mobile',
  'codex/livekit-platform-authorization-concurrency',
  'cognitive-level01-canary-control',${literal(h[0])},
  'fixture-runner',transaction_timestamp()+interval '1 day'
),
(
  ${literal(ids.androidTask)}::uuid,${literal(ids.project)}::uuid,
  'android','production','Chillywood2025/chillywood-mobile',
  'codex/livekit-platform-authorization-concurrency',
  'cognitive-level01-canary-control',${literal(h[1])},
  'fixture-runner',transaction_timestamp()+interval '1 day'
),
(
  ${literal(ids.iosTask)}::uuid,${literal(ids.project)}::uuid,
  'ios','production','Chillywood2025/chillywood-mobile',
  'codex/livekit-platform-authorization-concurrency',
  'cognitive-level01-canary-control',${literal(h[2])},
  'fixture-runner',transaction_timestamp()+interval '1 day'
);
insert into public.product_experience_baseline_versions(
  id,task_id,project_id,platform,environment,baseline_key,
  baseline_version,baseline_hash,status,owner_approval_version_id,
  approved_at,approved_execution_id,baseline_manifest_hash,
  baseline_option,baseline_identifier,baseline_option_name,source_commit
) values (
  ${literal(ids.baseline)}::uuid,${literal(ids.sharedTask)}::uuid,
  ${literal(ids.project)}::uuid,'shared','production',
  'streaming_mobile_content_density',1,
  '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
  'owner_approved',${literal(ids.baselineApproval)}::uuid,
  transaction_timestamp(),${literal(ids.baselineExecution)}::uuid,
  '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df',
  'C','chillywood-product-experience-baseline-v1',
  'creator_balanced',${literal(sourceCommit)}
);
insert into public.cognitive_product_sentinel_platform_scopes(
  shared_task_id,platform_task_id,project_id,shared_platform,platform,
  environment,scope_hash,source_commit,policy_version,
  retention_policy_hash,materialized_by
) values
(
  ${literal(ids.sharedTask)}::uuid,${literal(ids.androidTask)}::uuid,
  ${literal(ids.project)}::uuid,'shared','android','production',
  ${literal(hash())},${literal(sourceCommit)},
  'livekit-platform-canary-concurrency-v1',${literal(hash())},
  ${literal(ids.owner)}::uuid
),
(
  ${literal(ids.sharedTask)}::uuid,${literal(ids.iosTask)}::uuid,
  ${literal(ids.project)}::uuid,'shared','ios','production',
  ${literal(hash())},${literal(sourceCommit)},
  'livekit-platform-canary-concurrency-v1',${literal(hash())},
  ${literal(ids.owner)}::uuid
);
insert into public.autonomous_system_emergency_states(
  system_id,status,reason,updated_at,metadata
) values (
  'product_intelligence_operator','active',
  'LiveKit platform authorization concurrency fixture',
  transaction_timestamp(),'{"fixture":true}'::jsonb
) on conflict (system_id) do update set
  status='active',reason=excluded.reason,updated_at=excluded.updated_at,
  metadata=excluded.metadata;
insert into public.governance_two_party_service_assertions(
  service_identity,assertion_hash,allowed_operations,registered_by,
  status,expires_at
) values (
  'cognitive_product_quality_evaluator',${literal(evaluatorAssertion)},
  array['independent_evaluation'],${literal(ids.owner)}::uuid,
  'active',transaction_timestamp()+interval '1 hour'
) on conflict (service_identity) do update set
  assertion_hash=excluded.assertion_hash,
  allowed_operations=excluded.allowed_operations,
  registered_by=excluded.registered_by,status='active',
  expires_at=excluded.expires_at,revoked_at=null,revoked_by=null,
  revocation_hash=null;
insert into public.cognitive_product_quality_service_capabilities(
  id,service_identity,operation,task_id,project_id,platform,
  environment,assertion_hash,allowed_sentinel_keys,registered_by,
  expires_at
) values
${capabilityRows(
  ids.androidTask,
  "android",
  ids.androidCollect,
  ids.androidIssue,
  ids.androidConsume,
  ids.androidTriage,
)},
${capabilityRows(
  ids.iosTask,
  "ios",
  ids.iosCollect,
  ids.iosIssue,
  ids.iosConsume,
  ids.iosTriage,
)};
insert into public.cognitive_governance_switches(
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at,disabled_at
) values
(
  ${literal(ids.sharedTask)}::uuid,${literal(ids.project)}::uuid,
  'shared','production','cognitive_livekit_experience_sentinel_enabled',
  false,'collective-governance-v1',null,null,transaction_timestamp()
),
(
  ${literal(ids.androidTask)}::uuid,${literal(ids.project)}::uuid,
  'android','production','cognitive_livekit_experience_sentinel_enabled',
  false,'collective-governance-v1',null,null,transaction_timestamp()
),
(
  ${literal(ids.iosTask)}::uuid,${literal(ids.project)}::uuid,
  'ios','production','cognitive_livekit_experience_sentinel_enabled',
  false,'collective-governance-v1',null,null,transaction_timestamp()
),
(
  ${literal(ids.androidTask)}::uuid,${literal(ids.project)}::uuid,
  'android','production','cognitive_visual_experience_sentinel_enabled',
  true,'provider-independent-visual-live-v2',
  ${literal(ids.owner)}::uuid,transaction_timestamp(),null
),
(
  ${literal(ids.iosTask)}::uuid,${literal(ids.project)}::uuid,
  'ios','production','cognitive_visual_experience_sentinel_enabled',
  true,'provider-independent-ios-visual-live-v1',
  ${literal(ids.owner)}::uuid,transaction_timestamp(),null
);
commit;
`);
const setupDiagnostic = setup.stderr
  .split("\n")
  .find((line) => line.includes("ERROR:"))
  ?.replaceAll(/'[^']*'/gu, "'<redacted>'")
  .replaceAll(/[A-Fa-f0-9-]{36,}/gu, "<redacted>")
  ?? "no_sanitized_postgres_error";
assert.equal(
  setup.status,
  0,
  `platform authorization fixture setup failed: ${setupDiagnostic}`,
);
const prepareReceipt = (platform) => {
  const result = admin(ownerSql(`
select (
  public.governance_prepare_livekit_platform_preflight(
    ${literal(platform)}::public.cognitive_platform,
    ${literal(hash())},${literal(hash())},${literal(hash())},
    ${literal(collectorAssertion)},${literal(evaluatorAssertion)},
    ${literal(sourceCommit)},${literal(sourceTree)},${literal(hash())},
    ${literal(hash())},${literal(hash())},${literal(hash())},
    interval '10 minutes'
  )
)->>'preflightReceiptId';
`), true);
  const receiptId = result.stdout.trim().split("\n").at(-1);
  assert.equal(result.status, 0);
  assert.match(receiptId, /^[a-f0-9-]{36}$/u);
  return receiptId;
};
ids.androidReceiptA = prepareReceipt("android");
ids.androidReceiptB = prepareReceipt("android");
ids.iosReceipt = prepareReceipt("ios");

try {
  stage = "concurrent_android_open";
  const openA = ownerSql(`
select public.governance_open_livekit_platform_canary(
  ${literal(ids.androidReceiptA)}::uuid,interval '5 minutes'
);
`);
  const openB = ownerSql(`
select public.governance_open_livekit_platform_canary(
  ${literal(ids.androidReceiptB)}::uuid,interval '5 minutes'
);
`);
  const race = await Promise.all([session(openA), session(openB)]);
  assert.equal(race.filter(({ code }) => code === 0).length, 1);
  assert.equal(race.filter(({ code }) => code !== 0).length, 1);

  stage = "android_scope_readback";
  const androidReadback = admin(`
select case when
  (
    select count(*)=1
    from public.cognitive_livekit_platform_canary_authorizations
    where target_task_id=${literal(ids.androidTask)}::uuid
      and target_platform='android'
  )
  and (
    select enabled
    from public.cognitive_governance_switches
    where task_id=${literal(ids.androidTask)}::uuid
      and switch_key='cognitive_livekit_experience_sentinel_enabled'
  )
  and not (
    select enabled
    from public.cognitive_governance_switches
    where task_id=${literal(ids.iosTask)}::uuid
      and switch_key='cognitive_livekit_experience_sentinel_enabled'
  )
  then 'MATCH' else 'MISMATCH' end;
`, true);
  assert.equal(androidReadback.status, 0);
  assert.equal(androidReadback.stdout.trim(), "MATCH");

  stage = "authorization_replay";
  assert.notEqual((await session(openA)).code, 0);
  assert.notEqual((await session(openB)).code, 0);

  stage = "android_rollback";
  const androidAuthorization = admin(`
select id
from public.cognitive_livekit_platform_canary_authorizations
where target_task_id=${literal(ids.androidTask)}::uuid;
`, true).stdout.trim();
  const androidRollback = admin(ownerSql(`
select public.governance_finalize_livekit_platform_canary(
  ${literal(androidAuthorization)}::uuid,false,
  ${literal(h[7])},${literal(h[8])},${literal(h[9])}
);
`));
  assert.equal(androidRollback.status, 0);

  stage = "ios_expiry";
  const iosOpen = admin(ownerSql(`
select public.governance_open_livekit_platform_canary(
  ${literal(ids.iosReceipt)}::uuid,interval '1 second'
);
`));
  assert.equal(iosOpen.status, 0);
  await delay(1200);
  const iosAuthorization = admin(`
select id
from public.cognitive_livekit_platform_canary_authorizations
where target_task_id=${literal(ids.iosTask)}::uuid;
`, true).stdout.trim();
  const iosExpiry = admin(ownerSql(`
select public.governance_finalize_livekit_platform_canary(
  ${literal(iosAuthorization)}::uuid,false,
  ${literal(h[7])},${literal(h[10])},${literal(h[11])}
);
`));
  assert.equal(iosExpiry.status, 0);

  stage = "final_scope_readback";
  const finalReadback = admin(`
select case when
  (
    select count(*)=2
    from public.cognitive_livekit_platform_activation_outcomes
    where project_id=${literal(ids.project)}::uuid
      and enabled=false
  )
  and not exists (
    select 1 from public.cognitive_governance_switches
    where project_id=${literal(ids.project)}::uuid
      and switch_key='cognitive_livekit_experience_sentinel_enabled'
      and enabled
  )
  and (
    select count(*)=2 from public.cognitive_governance_switches
    where project_id=${literal(ids.project)}::uuid
      and switch_key='cognitive_visual_experience_sentinel_enabled'
      and enabled
  )
  then 'MATCH' else 'MISMATCH' end;
`, true);
  assert.equal(finalReadback.status, 0);
  assert.equal(finalReadback.stdout.trim(), "MATCH");

  process.stdout.write(
    "cognitive LiveKit platform authorization concurrency: 7/7\n",
  );
  cleanup();
} catch (error) {
  process.stderr.write(`FAIL:${stage}\n`);
  cleanup();
  throw error;
}
