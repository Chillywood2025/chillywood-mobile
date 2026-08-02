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
  canaryA: uuid(),
  canaryB: uuid(),
  providerEventA: uuid(),
  providerEventB: uuid(),
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
  expiredReceipt: null,
  baselineApproval: uuid(),
  baselineExecution: uuid(),
};
const collectorAssertion = hash();
const triageAssertion = hash();
const evaluatorAssertion = hash();
const sourceCommit = "fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6";
const sourceTree = "1abcd5e765a0dcac4ef0b40a2a90efb06f508fec";
const deploymentHash =
  "7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0";
const platformIdentity = {
  android: {
    artifactHash:
      "fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44",
    rollbackHash:
      "0fbe0c0d5bf2fe593b23f8970fe03e85c2e32e9195ec93ac9533d254b9014759",
  },
  ios: {
    artifactHash:
      "24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8",
    rollbackHash:
      "37d14e930e6787973866b0a5f38c28e1484dac0cb187f4ecb5de363147528e48",
  },
};
const h = Array.from({ length: 12 }, hash);
let stage = "setup";
const behavioralWitnesses = [
  "exact_android_preflight", "exact_ios_preflight", "expired_receipt_open_denied", "android_parent_source_commit_denied", "android_diverged_source_commit_denied", "ios_parent_source_commit_denied", "cross_platform_artifact_denied",
  "non_bound_tree_denied", "non_bound_deployment_denied", "concurrent_android_single_winner", "android_switch_isolation", "android_receipt_authorization_tuple_equivalent", "authorization_replay_denied",
  "android_authorization_rollback", "ios_receipt_authorization_tuple_equivalent", "expired_authorization_rollback", "final_outcome_totals", "visual_switches_unchanged", "schedules_unchanged",
];

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
delete from public.access_grants
where provider_event_id in (
  ${literal(ids.providerEventA)}::uuid,
  ${literal(ids.providerEventB)}::uuid
);
delete from public.user_entitlements
where user_id in (${literal(ids.canaryA)},${literal(ids.canaryB)});
delete from public.provider_events
where id in (
  ${literal(ids.providerEventA)}::uuid,
  ${literal(ids.providerEventB)}::uuid
);
delete from public.chat_call_livekit_canary_users
where user_id in (
  ${literal(ids.canaryA)}::uuid,
  ${literal(ids.canaryB)}::uuid
);
delete from public.platform_role_memberships
where user_id=${literal(ids.owner)};
delete from auth.users
where id in (
  ${literal(ids.owner)}::uuid,
  ${literal(ids.canaryA)}::uuid,
  ${literal(ids.canaryB)}::uuid
);
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
insert into auth.users(id,is_sso_user,is_anonymous)
values
  (${literal(ids.owner)}::uuid,false,false),
  (${literal(ids.canaryA)}::uuid,false,false),
  (${literal(ids.canaryB)}::uuid,false,false);
insert into public.platform_role_memberships(user_id,email,role,status)
values (${literal(ids.owner)}::uuid,null,'owner','active');
insert into public.chat_call_livekit_canary_users(
  user_id,enabled,enrolled_by
) values
  (
    ${literal(ids.canaryA)}::uuid,true,
    ${literal(ids.owner)}::uuid
  ),
  (
    ${literal(ids.canaryB)}::uuid,true,
    ${literal(ids.owner)}::uuid
  );
insert into public.provider_events(
  id,provider_event_id,provider,user_id,app_user_id,environment,
  event_type,status,idempotency_key,raw_payload_hash
) values
  (
    ${literal(ids.providerEventA)}::uuid,'b1-livekit-canary-a',
    'revenuecat',${literal(ids.canaryA)}::uuid,
    ${literal(ids.canaryA)},'sandbox','INITIAL_PURCHASE','processed',
    'b1-livekit-canary-a',${literal(h[3])}
  ),
  (
    ${literal(ids.providerEventB)}::uuid,'b1-livekit-canary-b',
    'revenuecat',${literal(ids.canaryB)}::uuid,
    ${literal(ids.canaryB)},'sandbox','INITIAL_PURCHASE','processed',
    'b1-livekit-canary-b',${literal(h[4])}
  );
insert into public.user_entitlements(
  user_id,entitlement_key,status,source,starts_at,expires_at,metadata
) values
  (
    ${literal(ids.canaryA)},'premium','active','revenuecat',
    transaction_timestamp(),transaction_timestamp()+interval '1 hour',
    '{"environment":"sandbox","sandbox":true}'::jsonb
  ),
  (
    ${literal(ids.canaryB)},'premium','active','revenuecat',
    transaction_timestamp(),transaction_timestamp()+interval '1 hour',
    '{"environment":"sandbox","sandbox":true}'::jsonb
  );
insert into public.access_grants(
  user_id,grant_type,source_type,source_id,provider,provider_event_id,
  environment,status,starts_at,expires_at
) values
  (
    ${literal(ids.canaryA)}::uuid,'premium','provider_event',
    ${literal(ids.providerEventA)}::uuid,'revenuecat',
    ${literal(ids.providerEventA)}::uuid,'sandbox','sandbox_only',
    transaction_timestamp(),transaction_timestamp()+interval '1 hour'
  ),
  (
    ${literal(ids.canaryB)}::uuid,'premium','provider_event',
    ${literal(ids.providerEventB)}::uuid,'revenuecat',
    ${literal(ids.providerEventB)}::uuid,'sandbox','sandbox_only',
    transaction_timestamp(),transaction_timestamp()+interval '1 hour'
  );
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
const sandboxPremiumProof = readJson(`
select public.cognitive_livekit_sandbox_premium_proof_v1()::text;
`);
assert.equal(sandboxPremiumProof.eligible, true);
assert.equal(sandboxPremiumProof.qualifiedRevenueCatSandboxRowCount, 2);
assert.match(sandboxPremiumProof.proofHash, /^[a-f0-9]{64}$/u);
const prepareReceipt = (platform, validity = "10 minutes", overrides = {}, rejected = false) => {
  const identity = { ...platformIdentity[platform], ...overrides };
  const result = admin(ownerSql(`
select (
  public.governance_prepare_livekit_platform_preflight(
    ${literal(platform)}::public.cognitive_platform,
    ${literal(identity.artifactHash)},
    ${literal(sandboxPremiumProof.proofHash)},${literal(hash())},
    ${literal(collectorAssertion)},${literal(evaluatorAssertion)},
    ${literal(identity.sourceCommit ?? sourceCommit)},
    ${literal(identity.sourceTree ?? sourceTree)},${literal(hash())},
    ${literal(hash())},${literal(identity.deploymentHash ?? deploymentHash)},
    ${literal(identity.rollbackHash)},
    interval ${literal(validity)}
  )
)->>'preflightReceiptId';
  `), true);
  if (rejected) return result;
  const receiptId = result.stdout.trim().split("\n").at(-1);
  assert.equal(result.status, 0);
  assert.match(receiptId, /^[a-f0-9-]{36}$/u);
  return receiptId;
};
ids.androidReceiptA = prepareReceipt("android");
ids.androidReceiptB = prepareReceipt("android");
ids.iosReceipt = prepareReceipt("ios");
ids.expiredReceipt = prepareReceipt("ios", "1 millisecond");
for (const [name, platform, overrides] of [
  ["android_parent_source_commit_denied", "android", { sourceCommit: "268f5d7e93e2cc5044286a956f870fe35dbf2638" }],
  ["android_diverged_source_commit_denied", "android", { sourceCommit: "00acb77770ee5c04ab7bbd5aab64cbb93a7d442f" }],
  ["ios_parent_source_commit_denied", "ios", { sourceCommit: "81039cad0daf601594381d8f35b80f916e5795a2" }],
  ["cross_platform_artifact_denied", "ios", { artifactHash: platformIdentity.android.artifactHash }],
  ["non_bound_tree_denied", "android", { sourceTree: "b94c388e78d6b87669f4063927b568246c23589a" }],
  ["non_bound_deployment_denied", "ios", { deploymentHash: hash() }],
]) {
  assert.notEqual(prepareReceipt(platform, "10 minutes", overrides, true).status, 0, name);
}

try {
  stage = "exact_platform_preflight_readback";
  const preflightReadback = admin(`
select case when (
  select count(*)=4
    and count(*) filter (where receipt.target_platform='android')=2
    and count(*) filter (where receipt.target_platform='ios')=2
  from public.cognitive_livekit_platform_preflight_receipts receipt
  join public.cognitive_livekit_final_source_identity_bindings binding
    on binding.target_platform=receipt.target_platform
  where receipt.id in (
    ${literal(ids.androidReceiptA)}::uuid,
    ${literal(ids.androidReceiptB)}::uuid,
    ${literal(ids.iosReceipt)}::uuid,
    ${literal(ids.expiredReceipt)}::uuid
  )
    and public.cognitive_livekit_final_source_identity_matches_v3(
      receipt.target_platform,receipt.source_commit,receipt.source_tree_hash,
      receipt.deployment_hash,receipt.application_identifier,
      receipt.distribution,receipt.build_number,receipt.runtime_version,
      receipt.channel,receipt.internal_update_id,receipt.installed_artifact_hash,
      binding.expected_source_build_hash,binding.expected_runtime_identity_hash
    )
) then 'MATCH' else 'MISMATCH' end;
`, true);
  assert.equal(preflightReadback.status, 0);
  assert.equal(preflightReadback.stdout.trim(), "MATCH");

  stage = "expired_receipt_open_denial";
  await delay(25);
  const expiredOpen = await session(ownerSql(`
select public.governance_open_livekit_platform_canary(
  ${literal(ids.expiredReceipt)}::uuid,interval '5 minutes'
);
`));
  assert.notEqual(expiredOpen.code, 0);

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
  and not exists (
    select 1 from public.cognitive_level01_schedule_definitions
    where project_id=${literal(ids.project)}::uuid and enabled
  )
  and (
    select count(*)=2
    from public.cognitive_livekit_platform_canary_authorizations authz
    join public.cognitive_livekit_platform_preflight_receipts receipt
      on receipt.id=authz.preflight_receipt_id
    where (authz.shared_task_id,authz.target_task_id,authz.project_id,
      authz.shared_platform,authz.target_platform,authz.environment,authz.owner_user_id,
      authz.baseline_version_id,authz.source_commit,authz.source_tree_hash,
      authz.independent_review_hash,authz.tests_hash,authz.deployment_hash,authz.rollback_hash)
    is not distinct from (receipt.shared_task_id,receipt.target_task_id,receipt.project_id,receipt.shared_platform,receipt.target_platform,receipt.environment,receipt.owner_user_id,receipt.baseline_version_id,receipt.source_commit,
      receipt.source_tree_hash,receipt.independent_review_hash,receipt.tests_hash,receipt.deployment_hash,receipt.rollback_hash)
  )
  then 'MATCH' else 'MISMATCH' end;
`, true);
  assert.equal(finalReadback.status, 0);
  assert.equal(finalReadback.stdout.trim(), "MATCH");
  assert.equal(new Set(behavioralWitnesses).size, 19);
  process.stdout.write(
    "cognitive LiveKit platform authorization concurrency: 19/19\n",
  );
  cleanup();
} catch (error) {
  process.stderr.write(`FAIL:${stage}\n`);
  cleanup();
  throw error;
}
