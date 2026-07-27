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
  constitution: randomUUID(),
  constitutionVersion: randomUUID(),
  deliberation: randomUUID(),
  evidencePacket: randomUUID(),
  proposal: randomUUID(),
  budget: randomUUID(),
  modelCredential: randomUUID(),
  approval: randomUUID(),
  approvalVersion: randomUUID(),
  execution: randomUUID(),
  evaluatorProof: randomUUID(),
  maintenanceRun: randomUUID(),
  heartbeat: randomUUID(),
};
const fixtureHashes = {
  approval: hash(`retention-approval:${ids.task}`),
  heartbeat: hash(`retention-heartbeat:${ids.task}`),
};
const brokerToken = "research-retention-concurrency-token-000000000000";
const workerAssertion =
  "research-retention-concurrency-worker-assertion-000000000000";
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
insert into public.autonomous_system_emergency_states(
  system_id,status,reason,updated_by,metadata
) values (
  'product_intelligence_operator','active',
  'retention concurrency fixture',${literal(ids.owner)},'{}'::jsonb
) on conflict (system_id) do update set
  status='active',reason=excluded.reason,updated_by=excluded.updated_by,
  updated_at=transaction_timestamp(),metadata=excluded.metadata;
insert into auth.users(id,is_sso_user,is_anonymous)
values (${literal(ids.owner)},false,false);
insert into public.platform_role_memberships(user_id,email,role,status)
values (${literal(ids.owner)},null,'owner','active');

-- Build a complete, current production activation fixture without disabling
-- any trigger or constraint. The immutable decision is backed by real
-- constitution/deliberation/evidence/proposal rows and the reviewed
-- single-provider Owner-advisory exception.
create temporary table retention_activation_fixture as
select
  transaction_timestamp()-interval '12 minutes' as provider_verified_at,
  transaction_timestamp()+interval '30 minutes' as expires_at,
  null::text as activation_hash,
  null::jsonb as owner_decision_result,
  null::jsonb as activation_result;
update retention_activation_fixture set activation_hash =
  public.governance_research_retention_activation_hash_v3(
    ${literal("4fb0853be0e7017e7c369a7281300a8d59a317ab")},
    repeat('b',64),repeat('c',64),repeat('d',64),repeat('2',64),
    provider_verified_at,expires_at
  );
grant select,update on retention_activation_fixture
  to authenticated,service_role;

insert into public.governance_constitutions(
  id,task_id,project_id,platform,environment,constitution_key,title,
  current_version,status,self_amendment_allowed,created_by_identity,created_at
) values (
  ${literal(ids.constitution)},${literal(ids.task)},${literal(ids.project)},
  'shared','production',
  ${literal(`retention-concurrency-${ids.task.slice(0, 8)}`)},
  'Retention concurrency fixture',1,'reviewed_not_active',false,
  'retention-concurrency-fixture',
  transaction_timestamp()-interval '14 minutes'
);
insert into public.governance_constitution_versions(
  id,constitution_id,task_id,project_id,platform,environment,version_number,
  constitution_hash,policy_snapshot,status,proposed_by_identity,
  independent_review_hash,rollback_hash,created_at
) values (
  ${literal(ids.constitutionVersion)},${literal(ids.constitution)},
  ${literal(ids.task)},${literal(ids.project)},'shared','production',1,
  repeat('0',64),'{}'::jsonb,'reviewed','retention-concurrency-fixture',
  repeat('1',64),repeat('f',64),
  transaction_timestamp()-interval '13 minutes 45 seconds'
);
insert into public.governance_deliberations(
  id,task_id,project_id,platform,environment,constitution_version_id,
  deliberation_key,objective_hash,source_commit,architecture_graph_digest,
  risk_level,status,required_quorum,budget_ceiling,deadline_at,decided_at,
  created_at,updated_at
) values (
  ${literal(ids.deliberation)},${literal(ids.task)},${literal(ids.project)},
  'shared','production',${literal(ids.constitutionVersion)},
  ${literal(`retention-activation-${ids.task.slice(0, 8)}`)},repeat('1',64),
  ${literal("4fb0853be0e7017e7c369a7281300a8d59a317ab")},repeat('1',64),
  'low','decided',3,0,transaction_timestamp()+interval '1 hour',
  transaction_timestamp()-interval '10 minutes 45 seconds',
  transaction_timestamp()-interval '13 minutes 30 seconds',
  transaction_timestamp()-interval '10 minutes 45 seconds'
);
insert into public.governance_evidence_packets(
  id,deliberation_id,task_id,project_id,platform,environment,packet_hash,
  source_commit,architecture_graph_digest,research_claim_hashes,
  provider_state_hash,known_unknowns,approval_level,budget_hash,
  rollback_requirements_hash,freshness_deadline,untrusted_text_labeled,
  created_at
) values (
  ${literal(ids.evidencePacket)},${literal(ids.deliberation)},
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  repeat('2',64),
  ${literal("4fb0853be0e7017e7c369a7281300a8d59a317ab")},repeat('1',64),
  '{}'::text[],repeat('d',64),'{}'::jsonb,'owner',repeat('1',64),
  repeat('f',64),transaction_timestamp()+interval '1 hour',true,
  transaction_timestamp()-interval '13 minutes'
);
insert into public.governance_proposals(
  id,deliberation_id,task_id,project_id,platform,environment,option_kind,
  proposal_hash,user_value_score,risk_score,reversibility,cost_estimate,
  proof_burden,rollback_hash,created_at
) select
  ${literal(ids.proposal)},${literal(ids.deliberation)},${literal(ids.task)},
  ${literal(ids.project)},'shared','production','no_action',activation_hash,
  100,0,'full',0,'provider',repeat('f',64),
  transaction_timestamp()-interval '12 minutes 45 seconds'
from retention_activation_fixture;
insert into public.intelligence_budgets(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,
  status,summary,evidence_metadata,data_class,retention_until,
  immutable_ceiling_hash,max_model_tokens,max_model_cost,max_tool_calls,
  max_tool_bytes,max_child_tasks,max_recursion_depth,max_retries,
  max_concurrent_calls,deadline_at
) values (
  ${literal(ids.budget)},${literal(ids.task)},${literal(ids.project)},
  'shared','production','cognitive_model_router',
  ${literal(`retention-budget-${ids.task.slice(0, 8)}`)},'received',
  '{}'::jsonb,'{}'::jsonb,'operational_metadata',
  transaction_timestamp()+interval '30 days',repeat('1',64),
  1000,0,0,0,0,0,0,1,transaction_timestamp()+interval '1 hour'
);
insert into public.cognitive_level01_credential_attestations(
  id,task_id,project_id,platform,environment,credential_kind,state,
  public_fingerprint_hash,scope_manifest_hash,private_material_stored,
  verified_at,expires_at
) values (
  ${literal(ids.modelCredential)},${literal(ids.task)},
  ${literal(ids.project)},'shared','production','model_provider',
  'configured',repeat('a',64),repeat('b',64),false,
  transaction_timestamp(),transaction_timestamp()+interval '1 hour'
);

-- Use the reviewed single-provider Owner-advisory exception. It is
-- deliberately quorum-ineligible; the active decision trigger records
-- MODEL_INDEPENDENCE_PROVIDER_REQUIRED instead of accepting synthetic quorum.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',${literal(ids.owner)},true);
select set_config(
  'request.jwt.claims',
  ${literal(JSON.stringify({ role: "authenticated", sub: ids.owner }))},
  true
);
update retention_activation_fixture set owner_decision_result =
  public.governance_owner_prepare_model_advisory_decision(
    ${literal(ids.deliberation)},${literal(ids.proposal)},
    ${literal(`retention-owner-decision-${ids.task.slice(0, 8)}`)},
    array['cognitive-model-advisory-independent-evaluation'],
    repeat('8',64),${literal(ids.budget)},repeat('1',64),repeat('f',64),
    interval '1 hour'
  );
reset role;
commit;

do $$
begin
  if not exists (
    select 1
    from public.governance_decision_manifests decision
    join public.cognitive_model_advisory_owner_decisions advisory
      on advisory.decision_manifest_id = decision.id
    where decision.id = (
      select (owner_decision_result->>'decisionManifestId')::uuid
      from retention_activation_fixture
    )
      and decision.model_independence_status =
        'MODEL_INDEPENDENCE_PROVIDER_REQUIRED'
      and decision.model_independence_assessment_id is null
      and advisory.quorum_eligible = false
  ) then
    raise exception 'retention_concurrency_advisory_state_mismatch';
  end if;
end
$$;

insert into public.governance_owner_approval_records(
  id,decision_manifest_id,task_id,project_id,platform,environment,
  approval_key,objective_hash,owner_user_id,current_version,current_state,
  maximum_executions,executions_claimed,executions_completed,approval_hash,
  created_at,updated_at
) select
  ${literal(ids.approval)},
  (owner_decision_result->>'decisionManifestId')::uuid,
  ${literal(ids.task)},
  ${literal(ids.project)},'shared','production',
  ${literal(`retention-approval-${ids.task.slice(0, 8)}`)},repeat('9',64),
  ${literal(ids.owner)},1,'completed',1,1,1,
  ${literal(fixtureHashes.approval)},
  transaction_timestamp(),transaction_timestamp()
from retention_activation_fixture;
insert into public.governance_owner_approval_versions(
  id,approval_record_id,decision_manifest_id,task_id,project_id,
  platform,environment,version_number,prior_version_id,owner_user_id,
  owner_identity_hash,decision_manifest_hash,plan_snapshot_hash,
  source_commit,architecture_graph_digest,approval_scope_hash,objective_hash,
  repository_full_name,branch_name,provider,operation,target_resource_hash,
  path_scope_hashes,table_scope_hashes,function_scope_hashes,budget_hash,
  maximum_cost,maximum_calls,maximum_bytes,maximum_executions,tests_hash,
  required_test_ids,evaluator_requirement_hash,rollback_hash,approval_hash,
  material_delta,approved_at,valid_from,expires_at,created_at
) select
  ${literal(ids.approvalVersion)},${literal(ids.approval)},
  (owner_decision_result->>'decisionManifestId')::uuid,
  ${literal(ids.task)},${literal(ids.project)},
  'shared','production',1,null,${literal(ids.owner)},repeat('7',64),
  owner_decision_result->>'decisionHash',repeat('2',64),
  ${literal("4fb0853be0e7017e7c369a7281300a8d59a317ab")},repeat('1',64),
  repeat('8',64),repeat('9',64),'Chillywood2025/chillywood-mobile',
  'codex/cognitive-public-research-retention-concurrency','public_research',
  'public_research_ingest',activation_hash,'{}'::text[],'{}'::text[],
  '{}'::text[],repeat('1',64),0,1,4096,1,repeat('a',64),
  array['cognitive-model-advisory-independent-evaluation'],
  repeat('5',64),repeat('f',64),
  ${literal(fixtureHashes.approval)},false,
  transaction_timestamp(),transaction_timestamp(),
  transaction_timestamp()+interval '45 minutes',
  transaction_timestamp()
from retention_activation_fixture;
insert into public.governance_owner_approval_version_states(
  approval_version_id,approval_record_id,task_id,project_id,platform,
  environment,state,maximum_executions,executions_claimed,
  executions_completed,completed_at
) values (
  ${literal(ids.approvalVersion)},${literal(ids.approval)},
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'completed',1,1,1,transaction_timestamp()
);
insert into public.governance_approved_action_executions(
  id,approval_record_id,approval_version_id,task_id,project_id,
  repository_full_name,branch_name,platform,environment,provider,operation,
  claim_sequence,state,service_identity,service_identity_hash,
  worker_assertion_hash,decision_manifest_hash,plan_snapshot_hash,
  approval_hash,target_resource_hash,budget_hash,tests_hash,
  evaluator_requirement_hash,rollback_hash,execution_receipt_hash,
  evaluator_proof_hash,claimed_at,began_at,completed_at,updated_at
) select
  ${literal(ids.execution)},${literal(ids.approval)},
  ${literal(ids.approvalVersion)},${literal(ids.task)},${literal(ids.project)},
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-public-research-retention-concurrency',
  'shared','production','public_research','public_research_ingest',1,
  'completed','cognitive_approved_action_worker',repeat('8',64),
  ${literal(hash(workerAssertion))},
  owner_decision_result->>'decisionHash',
  repeat('2',64),${literal(fixtureHashes.approval)},activation_hash,
  repeat('1',64),repeat('a',64),
  repeat('5',64),repeat('f',64),repeat('6',64),repeat('7',64),
  transaction_timestamp(),transaction_timestamp(),
  transaction_timestamp(),transaction_timestamp()
from retention_activation_fixture;
insert into public.governance_approved_execution_evaluator_proofs(
  id,execution_id,approval_record_id,approval_version_id,task_id,project_id,
  platform,environment,evaluator_identity,evaluator_identity_hash,
  execution_receipt_hash,evaluator_proof_hash,evaluator_requirement_hash,
  verdict,created_at
) values (
  ${literal(ids.evaluatorProof)},${literal(ids.execution)},
  ${literal(ids.approval)},${literal(ids.approvalVersion)},
  ${literal(ids.task)},${literal(ids.project)},'shared','production',
  'cognitive_independent_evaluator',repeat('9',64),repeat('6',64),
  repeat('7',64),repeat('5',64),'passed',
  (
    select completed_at
    from public.governance_approved_action_executions
    where id=${literal(ids.execution)}
  )
);
insert into public.governance_two_party_service_assertions(
  service_identity,assertion_hash,allowed_operations,registered_by,
  status,issued_at,expires_at
) values (
  'cognitive_approved_action_worker',${literal(hash(workerAssertion))},
  array['public_research_ingest'],${literal(ids.owner)},'active',
  transaction_timestamp()-interval '10 minutes',
  transaction_timestamp()+interval '1 day'
) on conflict (service_identity) do update set
  assertion_hash=excluded.assertion_hash,
  allowed_operations=excluded.allowed_operations,
  registered_by=excluded.registered_by,status='active',
  issued_at=excluded.issued_at,expires_at=excluded.expires_at,
  revoked_at=null,revoked_by=null,revocation_hash=null;

begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update retention_activation_fixture set activation_result =
  public.governance_persist_research_retention_activation(
    ${literal(ids.execution)},
    ${literal("4fb0853be0e7017e7c369a7281300a8d59a317ab")},
    repeat('b',64),repeat('c',64),repeat('d',64),provider_verified_at,
    repeat('2',64),expires_at,'cognitive_approved_action_worker',
    ${literal(workerAssertion)}
  );
reset role;
commit;

insert into public.cognitive_research_maintenance_runs(
  id,task_id,project_id,platform,environment,requested_limit,source_count,
  claim_count,total_count,retention_policy_id,processor_identity_hash
) values (
  ${literal(ids.maintenanceRun)},${literal(ids.task)},${literal(ids.project)},
  'shared','production',100,0,0,0,'chillywood-cognitive-retention-v1',
  ${literal(hash("research_source_broker:expire_public_memory"))}
);
insert into public.cognitive_research_retention_processor_heartbeats(
  id,processor_attestation_id,maintenance_run_id,task_id,project_id,
  platform,environment,scheduled_at,source_count,claim_count,total_count,
  no_work,attestation_hash,event_hash,completed_at,created_at
) select
  ${literal(ids.heartbeat)},
  (activation_result->>'processor_attestation_id')::uuid,
  ${literal(ids.maintenanceRun)},${literal(ids.task)},${literal(ids.project)},
  'shared','production',
  date_trunc('hour',transaction_timestamp())-interval '43 minutes',
  0,0,0,true,activation_hash,${literal(fixtureHashes.heartbeat)},
  transaction_timestamp(),transaction_timestamp()
from retention_activation_fixture;
do $$
begin
  if not public.cognitive_research_retention_processor_ready(
    ${literal(ids.task)},${literal(ids.project)},'shared','production'
  ) then
    raise exception 'retention_concurrency_processor_not_ready';
  end if;
end
$$;
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
