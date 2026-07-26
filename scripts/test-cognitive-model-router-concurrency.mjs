import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const requestedContainer = process.argv[2]
  ?? `supabase_db_${
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
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, "local Postgres test command failed");
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
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.stdin.end(sql);
  });
const runSignaledSession = (sql, marker) => {
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const completion = new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let signaled = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!signaled && stdout.includes(marker)) {
        signaled = true;
        resolveReady();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      rejectReady(error);
      reject(error);
    });
    child.on("close", (code) => {
      if (!signaled) {
        rejectReady(new Error(`session closed before ${marker}`));
      }
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.stdin.end(sql);
  });
  return { ready, completion };
};
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");

const fixtureSource = readFileSync(
  "supabase/tests/cognitive_model_router_governance_test.sql",
  "utf8",
);
const fixtureMatch = fixtureSource.match(
  /-- MODEL_ROUTER_FIXTURE_BEGIN\n(?<fixture>[\s\S]*?)-- MODEL_ROUTER_FIXTURE_END/u,
);
assert.ok(fixtureMatch?.groups?.fixture, "model router SQL fixture markers missing");
const capabilityId = randomUUID();
const serviceToken = "model-router-service-token-test-only-0001";
const assessmentId = "model-router-assessment-0001";
const evidencePacketHash = "e".repeat(64);
const scopeHash = hash(
  [
    "cognitive-model-assessment-scope-v1",
    "d3000000-0000-4000-8000-000000000001",
    "d1000000-0000-4000-8000-000000000001",
    "shared",
    "production",
    "research_futures",
    assessmentId,
    evidencePacketHash,
  ].join("|"),
);
const configuredModelIdentityHash = hash(
  ["openai", "gpt-5.6", "gpt-5.6-luna"].join("|"),
);

query(`
begin;
${fixtureMatch.groups.fixture}
insert into public.cognitive_model_router_capabilities(
  id,approved_execution_id,task_id,project_id,platform,environment,
  council_role,required_switch_key,provider_family,model_family,model_name,
  budget_id,maximum_calls,maximum_model_tokens,maximum_model_cost,
  approval_target_hash,scope_hash,registered_by,expires_at,
  credential_attestation_id,credential_public_fingerprint_hash,
  credential_scope_manifest_hash,credential_expires_at
) values (
  ${sqlLiteral(capabilityId)},
  (select execution_id from model_owner_chain_fixture),
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','research_futures','cognitive_research_enabled',
  'openai','gpt-5.6','gpt-5.6-luna',
  'dc000000-0000-4000-8000-000000000001',
  3,10000,1,repeat('8',64),${sqlLiteral(scopeHash)},
  'd2000000-0000-4000-8000-000000000001',
  transaction_timestamp()+interval '12 hours',
  'de000000-0000-4000-8000-000000000001',
  repeat('b',64),repeat('c',64),transaction_timestamp()+interval '1 day'
);
commit;
`);

const reserveSql = (suffix) => `
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.cognitive_model_router_reserve(
  ${sqlLiteral(capabilityId)},
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','research_futures',
  'openai','gpt-5.6','gpt-5.6-luna',
  ${sqlLiteral(assessmentId)},
  ${sqlLiteral(hash(`idempotency-${capabilityId}-${suffix}`))},
  ${sqlLiteral(hash(`request-${capabilityId}-${suffix}`))},
  ${sqlLiteral(evidencePacketHash)},
  ${sqlLiteral(hash(`template-${capabilityId}-${suffix}`))},
  ${sqlLiteral(configuredModelIdentityHash)},
  repeat('8',64),
  ${sqlLiteral(scopeHash)},
  repeat('b',64),
  1000,0.1,${sqlLiteral(serviceToken)}
)::text;
commit;
`;

const race = await Promise.all([
  runSession(reserveSql("a")),
  runSession(reserveSql("b")),
]);
const winners = race.filter(({ code }) => code === 0);
const losers = race.filter(({ code }) => code !== 0);
assert.equal(winners.length, 1, "concurrent model reservation must have one winner");
assert.equal(losers.length, 1, "concurrent model reservation must reject one caller");
assert.match(
  losers[0].stderr,
  /model_router_replay_denied/u,
  "concurrency loser failed for an unexpected reason",
);

const preflightId = query(`
select id::text
from public.cognitive_model_router_preflight_audits
where capability_id=${sqlLiteral(capabilityId)};
`);
assert.match(preflightId, /^[a-f0-9-]{36}$/u, "winner preflight missing");
assert.equal(
  query(`
select concat_ws(
  ':',
  (select count(*) from public.cognitive_model_router_preflight_audits
   where capability_id=${sqlLiteral(capabilityId)}),
  (select active_concurrent_calls from public.intelligence_budgets
   where id='dc000000-0000-4000-8000-000000000001'),
  (select reserved_calls from public.cognitive_model_router_capabilities
   where id=${sqlLiteral(capabilityId)})
);
`),
  "1:1:1",
  "reservation race did not preserve atomic counters",
);

query(`
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.cognitive_model_router_settle(
  ${sqlLiteral(preflightId)},'provider_failed',1000,0.1,
  null,null,null,null,null,${sqlLiteral(hash("provider_failed"))},
  ${sqlLiteral(hash(`result-${preflightId}`))},10,${sqlLiteral(serviceToken)}
);
commit;
`);
assert.equal(
  query(`
select concat_ws(
  ':',
  (select active_concurrent_calls from public.intelligence_budgets
   where id='dc000000-0000-4000-8000-000000000001'),
  (select settled_calls from public.cognitive_model_router_capabilities
   where id=${sqlLiteral(capabilityId)})
);
`),
  "0:1",
  "failure settlement did not close the winning reservation",
);

const recoveredPreflightId = randomUUID();
const otherPreflightId = randomUUID();
const recoveredReservationKey = hash(`recovered-${capabilityId}`);
const otherReservationKey = hash(`other-${capabilityId}`);
query(`
begin;
update public.intelligence_budgets
set max_concurrent_calls=2,
    used_model_tokens=used_model_tokens+2000,
    used_model_cost=used_model_cost+0.2,
    active_concurrent_calls=2
where id='dc000000-0000-4000-8000-000000000001';
update public.cognitive_model_router_capabilities
set reserved_calls=2,
    reserved_model_tokens=2000,
    reserved_model_cost=0.2
where id=${sqlLiteral(capabilityId)};
insert into public.cognitive_model_router_runtime_credential_proofs(
  capability_id,idempotency_key,request_hash,task_id,project_id,platform,
  environment,credential_attestation_id,runtime_credential_fingerprint_hash,
  credential_scope_manifest_hash,service_identity
) values
(
  ${sqlLiteral(capabilityId)},${sqlLiteral(recoveredReservationKey)},
  ${sqlLiteral(hash(`request-recovered-${capabilityId}`))},
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001','shared','production',
  'de000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),
  'cognitive_model_router'
),
(
  ${sqlLiteral(capabilityId)},${sqlLiteral(otherReservationKey)},
  ${sqlLiteral(hash(`request-other-${capabilityId}`))},
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001','shared','production',
  'de000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),
  'cognitive_model_router'
);
insert into public.cognitive_model_router_preflight_audits(
  id,capability_id,approved_execution_id,task_id,project_id,platform,
  environment,council_role,required_switch_key,provider_family,model_family,
  model_name,budget_id,assessment_id,idempotency_key,request_hash,
  evidence_packet_hash,prompt_template_hash,configured_model_identity_hash,
  approval_target_hash,scope_hash,lease_expires_at,reserved_model_tokens,
  reserved_model_cost,service_identity,created_at
) values
(
  ${sqlLiteral(recoveredPreflightId)},${sqlLiteral(capabilityId)},
  (select approved_execution_id from public.cognitive_model_router_capabilities
   where id=${sqlLiteral(capabilityId)}),
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','research_futures','cognitive_research_enabled',
  'openai','gpt-5.6','gpt-5.6-luna',
  'dc000000-0000-4000-8000-000000000001',
  'model-router-race-recovered',${sqlLiteral(recoveredReservationKey)},
  ${sqlLiteral(hash(`request-recovered-${capabilityId}`))},
  ${sqlLiteral(hash(`evidence-recovered-${capabilityId}`))},
  ${sqlLiteral(hash(`template-recovered-${capabilityId}`))},
  ${sqlLiteral(configuredModelIdentityHash)},repeat('8',64),
  ${sqlLiteral(scopeHash)},transaction_timestamp()-interval '1 minute',
  1000,0.1,'cognitive_model_router',
  transaction_timestamp()-interval '3 minutes'
),
(
  ${sqlLiteral(otherPreflightId)},${sqlLiteral(capabilityId)},
  (select approved_execution_id from public.cognitive_model_router_capabilities
   where id=${sqlLiteral(capabilityId)}),
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','research_futures','cognitive_research_enabled',
  'openai','gpt-5.6','gpt-5.6-luna',
  'dc000000-0000-4000-8000-000000000001',
  'model-router-race-other',${sqlLiteral(otherReservationKey)},
  ${sqlLiteral(hash(`request-other-${capabilityId}`))},
  ${sqlLiteral(hash(`evidence-other-${capabilityId}`))},
  ${sqlLiteral(hash(`template-other-${capabilityId}`))},
  ${sqlLiteral(configuredModelIdentityHash)},repeat('8',64),
  ${sqlLiteral(scopeHash)},transaction_timestamp()+interval '1 minute',
  1000,0.1,'cognitive_model_router',transaction_timestamp()
);
insert into public.cognitive_budget_events(
  budget_id,task_id,project_id,platform,environment,reservation_id,
  event_type,usage
) values
(
  'dc000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',${sqlLiteral(recoveredReservationKey)},'reserved',
  '{"model_tokens":1000,"model_cost":0.1,"model_calls":1,"service_identity":"cognitive_model_router"}'::jsonb
),
(
  'dc000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',${sqlLiteral(otherReservationKey)},'reserved',
  '{"model_tokens":1000,"model_cost":0.1,"model_calls":1,"service_identity":"cognitive_model_router"}'::jsonb
);
commit;
`);

const recoveryMarker = "MODEL_RECOVERY_LOCKED";
const recoverySession = runSignaledSession(`
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.cognitive_model_router_recover_expired(
  ${sqlLiteral(capabilityId)},1,${sqlLiteral(hash("race-recovery-batch"))},
  ${sqlLiteral(serviceToken)}
);
\\echo ${recoveryMarker}
select pg_sleep(1);
commit;
`, recoveryMarker);
await recoverySession.ready;
const lateSettlementPromise = runSession(`
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.cognitive_model_router_settle(
  ${sqlLiteral(recoveredPreflightId)},'provider_failed',1000,0.1,
  null,null,null,null,null,${sqlLiteral(hash("late-provider-failed"))},
  ${sqlLiteral(hash(`late-result-${recoveredPreflightId}`))},10,
  ${sqlLiteral(serviceToken)}
);
commit;
`);
const [recoveryRace, lateSettlement] = await Promise.all([
  recoverySession.completion,
  lateSettlementPromise,
]);
assert.equal(recoveryRace.code, 0, "expired reservation recovery failed");
assert.notEqual(
  lateSettlement.code,
  0,
  "late settlement succeeded after recovery",
);
assert.match(
  lateSettlement.stderr,
  /model_router_settlement_recovered/u,
  "late settlement failed for an unexpected reason",
);
assert.equal(
  query(`
select concat_ws(
  ':',
  (select reserved_calls from public.cognitive_model_router_capabilities
   where id=${sqlLiteral(capabilityId)}),
  (select settled_calls from public.cognitive_model_router_capabilities
   where id=${sqlLiteral(capabilityId)}),
  (select active_concurrent_calls from public.intelligence_budgets
   where id='dc000000-0000-4000-8000-000000000001'),
  (select count(*) from public.cognitive_model_router_recovery_audits
   where preflight_id=${sqlLiteral(recoveredPreflightId)}),
  (select count(*) from public.cognitive_model_router_result_audits
   where preflight_id=${sqlLiteral(recoveredPreflightId)})
);
`),
  "1:2:1:1:0",
  "recovery/settlement race consumed the other outstanding reservation",
);

query(`
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.cognitive_model_router_settle(
  ${sqlLiteral(otherPreflightId)},'provider_failed',1000,0.1,
  null,null,null,null,null,${sqlLiteral(hash("other-provider-failed"))},
  ${sqlLiteral(hash(`other-result-${otherPreflightId}`))},10,
  ${sqlLiteral(serviceToken)}
);
commit;
`);
assert.equal(
  query(`
select concat_ws(
  ':',
  (select reserved_calls from public.cognitive_model_router_capabilities
   where id=${sqlLiteral(capabilityId)}),
  (select settled_calls from public.cognitive_model_router_capabilities
   where id=${sqlLiteral(capabilityId)}),
  (select active_concurrent_calls from public.intelligence_budgets
   where id='dc000000-0000-4000-8000-000000000001')
);
`),
  "0:3:0",
  "independent outstanding reservation did not settle exactly once",
);

console.log("model router concurrency: 5/5");
