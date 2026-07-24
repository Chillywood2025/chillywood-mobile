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
const assessmentId = "model-router-concurrency-same-scope";
const evidencePacketHash = hash(`evidence-${capabilityId}`);
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
  approval_target_hash,scope_hash,registered_by,expires_at
) values (
  ${sqlLiteral(capabilityId)},
  'db000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','research_futures','cognitive_research_enabled',
  'openai','gpt-5.6','gpt-5.6-luna',
  'dc000000-0000-4000-8000-000000000001',
  3,10000,1,repeat('8',64),${sqlLiteral(scopeHash)},
  'd2000000-0000-4000-8000-000000000001',
  transaction_timestamp()+interval '12 hours'
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

console.log("model router concurrency: 2/2");
