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
  project: randomUUID(),
  task: randomUUID(),
  source: randomUUID(),
  claim: randomUUID(),
  owner: randomUUID(),
};
const brokerToken = "research-retention-concurrency-token-000000000000";
const locator = "https://developer.apple.com/documentation/concurrency";
const statement = "Concurrent public research expiry is bounded.";

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
  'codex/cognitive-public-research-retention-concurrency',
  ${literal(`research-retention-concurrency-${ids.task.slice(0, 8)}`)},
  repeat('1',64),'received','research-retention-concurrency',
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
) values
(
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'cognitive_research_enabled',true,'collective-governance-v1',
  ${literal(ids.owner)},transaction_timestamp()
),
(
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'cognitive_memory_enabled',true,'collective-governance-v1',
  ${literal(ids.owner)},transaction_timestamp()
),
(
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'cognitive_user_derived_memory_enabled',false,'collective-governance-v1',
  null,null
);
insert into public.research_sources(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,
  status,summary,evidence_metadata,data_class,retention_until,
  authority_id,canonical_host,ownership_identity,source_reference_hash,
  canonical_url_hash,content_hash,publisher,publication_date,
  publication_provenance,retrieval_date,freshness_deadline,source_type,
  is_primary,bounded_excerpt,citation_metadata,trusted_for_tool_execution
) values (
  ${literal(ids.source)},${literal(ids.task)},${literal(ids.project)},
  'shared','production','research-retention-concurrency',
  ${literal(`expired-source-${ids.source.slice(0, 8)}`)},'accepted',
  '{}'::jsonb,'{}'::jsonb,'research_cache',
  transaction_timestamp()-interval '1 minute',
  'apple-docs','developer.apple.com','apple',
  ${literal(hash(locator))},${literal(hash(locator))},${
  literal(hash(statement))
},
  'Apple',transaction_timestamp()-interval '2 days',
  jsonb_build_object(
    'mode','published_metadata',
    'machineValue','fixture-published-at',
    'semanticIdentity','retention-concurrency-fixture',
    'evidenceHash',repeat('d',64)
  ),
  transaction_timestamp()-interval '1 day',
  transaction_timestamp()+interval '2 hours',
  'official_documentation',true,${literal(statement)},
  jsonb_build_object('title','Concurrency fixture','locator',${
  literal(locator)
}),
  false
);
insert into public.research_retrieval_events(
  source_id,task_id,project_id,platform,environment,request_url_hash,
  resolved_address_hashes,response_hash,result
) values (
  ${literal(ids.source)},${literal(ids.task)},${literal(ids.project)},
  'shared','production',${literal(hash(locator))},array[repeat('3',64)],
  ${literal(hash(statement))},'accepted'
);
insert into public.research_claims(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,
  status,summary,evidence_metadata,data_class,retention_until,
  claim_hash,bounded_claim,confidence,category,freshness_deadline,
  contradiction_state,support_state
) values (
  ${literal(ids.claim)},${literal(ids.task)},${literal(ids.project)},
  'shared','production','research-retention-concurrency',
  ${literal(`expired-claim-${ids.claim.slice(0, 8)}`)},'pending',
  '{}'::jsonb,'{}'::jsonb,'research_cache',
  transaction_timestamp()-interval '1 minute',${literal(hash(statement))},
  ${
  literal(statement)
},0.9,'technical',transaction_timestamp()+interval '1 hour',
  'none','supported'
);
update public.research_claims set status='supported'
where id=${literal(ids.claim)};
insert into public.research_claim_sources(
  claim_id,source_id,task_id,project_id,platform,environment,relationship
) values (
  ${literal(ids.claim)},${literal(ids.source)},${literal(ids.task)},
  ${literal(ids.project)},'shared','production','supports'
);
`);

const expireSql = `
begin;
set local role service_role;
select public.cognitive_expire_public_research(
  ${literal(ids.task)},${literal(ids.project)},'shared','production',10,
  ${literal(brokerToken)}
)::text;
commit;
`;
const results = await Promise.all([
  runSession(expireSql),
  runSession(expireSql),
]);
for (const result of results) {
  assert.equal(result.code, 0, `concurrent expiry failed: ${result.stderr}`);
}
const totalProcessed = results.reduce((sum, result) => {
  const line = result.stdout.split("\n").find((entry) =>
    entry.includes('"total_count"')
  );
  assert.ok(line, "expiry response was not returned");
  return sum + Number(JSON.parse(line).total_count);
}, 0);
assert.equal(totalProcessed, 2, "each expired target must be processed once");

const [eventCount, erasedCount] = query(`
select
  (select count(*) from public.cognitive_research_retention_events
    where target_id in (${literal(ids.source)},${literal(ids.claim)}))::text
  ||'|'||
  (select count(*) from public.cognitive_erasure_events
    where target_id in (${literal(ids.source)},${literal(ids.claim)}))::text;
`).split("|").map(Number);
assert.equal(eventCount, 2, "retention audit must be exactly-once");
assert.equal(erasedCount, 2, "central erasure audit must be exactly-once");

console.log("cognitive public research retention concurrency: 3/3");
