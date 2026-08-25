import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const requestedContainer = process.argv[2]
  ?? `supabase_db_${path.basename(process.cwd()).replace(/[^A-Za-z0-9_.-]/gu, "_")}`;
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
  const diagnostic = result.stderr
    .split("\n")
    .find((line) => line.includes("ERROR:"))
    ?.replaceAll(/'[^']*'/gu, "'<redacted>'")
    .replaceAll(/[A-Za-z0-9_-]{40,}/gu, "<redacted>")
    ?? "no_sanitized_postgres_error";
  assert.equal(
    result.status,
    0,
    `local Postgres test command failed: ${diagnostic}`,
  );
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
  "exec", "-i", requestedContainer, "psql", "-X", "-q", "-A", "-t",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
];
const query = (sql) => docker(psqlArgs, sql);
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const opaqueProof = () => randomBytes(48).toString("base64url");

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
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
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
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.stdin.end(sql);
  });
  return { ready, result };
};

const runRace = (...sessions) => Promise.all(sessions.map(runSession));
const assertRace = (label, results, expectedSuccesses, rejectedPattern) => {
  const successes = results.filter(({ code }) => code === 0);
  const failures = results.filter(({ code }) => code !== 0);
  assert.equal(successes.length, expectedSuccesses, `${label}: unexpected success count`);
  assert.equal(
    failures.length,
    results.length - expectedSuccesses,
    `${label}: unexpected failure count`,
  );
  for (const failure of failures) {
    assert.match(failure.stderr, rejectedPattern, `${label}: unexpected rejection`);
  }
};

const serviceRoleSql = () => `
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
`;
const ownerRoleSql = (ownerId) => `
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',${sqlLiteral(ownerId)},true);
select set_config(
  'request.jwt.claims',
  ${sqlLiteral(JSON.stringify({ role: "authenticated", sub: ownerId }))},
  true
);
`;
const cognitiveActorSql = (credential) => `
${serviceRoleSql()}
select set_config('request.jwt.claim.cognitive_actor','cognitive_control_plane',true);
select set_config(
  'request.jwt.claim.cognitive_service_credential',
  ${sqlLiteral(credential)},
  true
);
`;

const ids = {
  owner: randomUUID(),
  project: randomUUID(),
  task: randomUUID(),
  leaseTaskA: randomUUID(),
  leaseTaskB: randomUUID(),
  constitution: randomUUID(),
  constitutionVersion: randomUUID(),
  deliberation: randomUUID(),
  evidencePacket: randomUUID(),
  proposal: randomUUID(),
  decision: randomUUID(),
  budget: randomUUID(),
};
const workerAssertion = opaqueProof();
const evaluatorAssertion = opaqueProof();
const baselineAssertion = opaqueProof();
const cognitiveCredential = opaqueProof();
const repository = "Chillywood2025/chillywood-mobile";
const branch = "codex/cognitive-db-concurrency-fixture";
const h1 = "1".repeat(64);
const h2 = "2".repeat(64);
const h3 = "3".repeat(64);
const h4 = "4".repeat(64);
const h5 = "5".repeat(64);
const h6 = "6".repeat(64);
const h7 = "7".repeat(64);
const h8 = "8".repeat(64);
const h9 = "9".repeat(64);
const sourceCommit = "5".repeat(40);

query(`
begin;
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
values (${sqlLiteral(ids.owner)},false,false,transaction_timestamp())
on conflict (id) do update
set is_sso_user=false,is_anonymous=false,
    email_confirmed_at=excluded.email_confirmed_at;

insert into public.platform_role_memberships(user_id,email,role,status)
values (${sqlLiteral(ids.owner)},null,'owner','active')
on conflict do nothing;

insert into public.cognitive_service_identities(
  service_identity,credential_hash,status,expires_at
) values (
  'cognitive_control_plane',${sqlLiteral(hash(cognitiveCredential))},
  'active',transaction_timestamp()+interval '4 hours'
)
on conflict (service_identity) do update
set credential_hash=excluded.credential_hash,status='active',
    expires_at=excluded.expires_at,revoked_at=null;

insert into public.autonomous_system_emergency_states(
  system_id,status,reason,updated_at,metadata
) values (
  'product_intelligence_operator','active',
  'local database concurrency fixture',transaction_timestamp(),
  '{"fixture":"cognitive-db-concurrency"}'::jsonb
)
on conflict (system_id) do update
set status=excluded.status,reason=excluded.reason,updated_at=excluded.updated_at,
    metadata=excluded.metadata;

insert into public.cognitive_projects(
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  ${sqlLiteral(ids.project)},${sqlLiteral(repository)},
  'collective_governance_source_complete_not_deployed','off','none',false
);

insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,actor_identity,deadman_at
) values
  (
    ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'shared','ci',
    ${sqlLiteral(repository)},${sqlLiteral(branch)},
    ${sqlLiteral(`concurrency-main-${ids.task.slice(0, 8)}`)},${sqlLiteral(h1)},
    'concurrency-fixture',transaction_timestamp()+interval '4 hours'
  ),
  (
    ${sqlLiteral(ids.leaseTaskA)},${sqlLiteral(ids.project)},'shared','ci',
    ${sqlLiteral(repository)},${sqlLiteral(branch)},
    ${sqlLiteral(`concurrency-lease-a-${ids.leaseTaskA.slice(0, 8)}`)},${sqlLiteral(h1)},
    'concurrency-fixture',transaction_timestamp()+interval '4 hours'
  ),
  (
    ${sqlLiteral(ids.leaseTaskB)},${sqlLiteral(ids.project)},'shared','ci',
    ${sqlLiteral(repository)},${sqlLiteral(branch)},
    ${sqlLiteral(`concurrency-lease-b-${ids.leaseTaskB.slice(0, 8)}`)},${sqlLiteral(h1)},
    'concurrency-fixture',transaction_timestamp()+interval '4 hours'
  );

insert into public.governance_constitutions(
  id,task_id,project_id,platform,environment,constitution_key,title,
  current_version,status,created_by_identity
) values (
  ${sqlLiteral(ids.constitution)},${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},
  'shared','ci',${sqlLiteral(`concurrency-constitution-${ids.task.slice(0, 8)}`)},
  'Concurrency Constitution Fixture',1,'active','fixture'
);

insert into public.governance_constitution_versions(
  id,constitution_id,task_id,project_id,platform,environment,
  version_number,constitution_hash,policy_snapshot,status,
  proposed_by_identity,independent_review_hash,owner_approved_by,
  owner_approved_at,activation_not_before,rollback_hash
) values (
  ${sqlLiteral(ids.constitutionVersion)},${sqlLiteral(ids.constitution)},
  ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'shared','ci',1,
  ${sqlLiteral(h1)},'{"activation":"off","twoParty":true}'::jsonb,
  'active','fixture',${sqlLiteral(h2)},${sqlLiteral(ids.owner)},
  transaction_timestamp(),transaction_timestamp()-interval '1 minute',
  ${sqlLiteral(h3)}
);

insert into public.governance_deliberations(
  id,task_id,project_id,platform,environment,constitution_version_id,
  deliberation_key,objective_hash,source_commit,architecture_graph_digest,
  risk_level,status,required_quorum,budget_ceiling,deadline_at,decided_at
) values (
  ${sqlLiteral(ids.deliberation)},${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},
  'shared','ci',${sqlLiteral(ids.constitutionVersion)},
  ${sqlLiteral(`concurrency-deliberation-${ids.task.slice(0, 8)}`)},
  ${sqlLiteral(h4)},${sqlLiteral(sourceCommit)},${sqlLiteral(h6)},
  'low','decided',3,1,transaction_timestamp()+interval '2 days',
  transaction_timestamp()
);

insert into public.governance_evidence_packets(
  id,deliberation_id,task_id,project_id,platform,environment,
  packet_hash,source_commit,architecture_graph_digest,research_claim_hashes,
  provider_state_hash,known_unknowns,approval_level,budget_hash,
  rollback_requirements_hash,freshness_deadline
) values (
  ${sqlLiteral(ids.evidencePacket)},${sqlLiteral(ids.deliberation)},
  ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'shared','ci',
  ${sqlLiteral(h7)},${sqlLiteral(sourceCommit)},${sqlLiteral(h6)},
  '{}'::text[],${sqlLiteral(h8)},'{"fixture":"safe"}'::jsonb,
  'owner',${sqlLiteral(h9)},${sqlLiteral(h1)},
  transaction_timestamp()+interval '1 day'
);

insert into public.governance_proposals(
  id,deliberation_id,task_id,project_id,platform,environment,
  option_kind,proposal_hash,user_value_score,risk_score,reversibility,
  cost_estimate,proof_burden,rollback_hash
) values (
  ${sqlLiteral(ids.proposal)},${sqlLiteral(ids.deliberation)},
  ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'shared','ci',
  'minimal_repair',${sqlLiteral("b".repeat(64))},10,1,'full',0,'source',
  ${sqlLiteral(h3)}
);

insert into public.governance_model_execution_attestations(
  assessment_id,task_id,project_id,platform,environment,council_role,
  provider_identity_hash,model_family,model_version,execution_identity_hash,
  evidence_packet_hash,prompt_template_version_hash,output_hash,
  blind_first_round,correlation_class,cost,latency_ms
) values
  (
    'deliberation-' || encode(extensions.digest(
      convert_to(${sqlLiteral(ids.deliberation)},'UTF8'),'sha256'
    ),'hex'),
    ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'shared','ci',
    'product_user_experience',${sqlLiteral("a".repeat(64))},
    'family-a','model-a',${sqlLiteral("b".repeat(64))},${sqlLiteral("c".repeat(64))},
    ${sqlLiteral("d".repeat(64))},${sqlLiteral("e".repeat(64))},true,
    'cross_provider',0.1,100
  ),
  (
    'deliberation-' || encode(extensions.digest(
      convert_to(${sqlLiteral(ids.deliberation)},'UTF8'),'sha256'
    ),'hex'),
    ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'shared','ci',
    'security_privacy',${sqlLiteral("b".repeat(64))},
    'family-b','model-b',${sqlLiteral("c".repeat(64))},${sqlLiteral("d".repeat(64))},
    ${sqlLiteral("e".repeat(64))},${sqlLiteral("f".repeat(64))},true,
    'cross_provider',0.1,100
  ),
  (
    'deliberation-' || encode(extensions.digest(
      convert_to(${sqlLiteral(ids.deliberation)},'UTF8'),'sha256'
    ),'hex'),
    ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'shared','ci',
    'reliability_release',${sqlLiteral("c".repeat(64))},
    'family-c','model-c',${sqlLiteral("d".repeat(64))},${sqlLiteral("e".repeat(64))},
    ${sqlLiteral("f".repeat(64))},${sqlLiteral("a".repeat(64))},true,
    'cross_provider',0.1,100
  );

-- The retention activation gate intentionally blocks every new collective
-- decision while provider-output retention is unavailable. These concurrency
-- tests exercise downstream locking against a pre-existing reviewed decision,
-- while the gate itself remains covered by its dedicated pgTAP suite.
set local session_replication_role = replica;
insert into public.governance_decision_manifests(
  id,deliberation_id,evidence_packet_id,selected_proposal_id,task_id,
  project_id,platform,environment,decision_key,source_commit,
  architecture_graph_digest,evidence_manifest_hash,research_claim_hashes,
  selected_option_hash,rejected_option_hashes,council_attestation_hash,
  votes_hash,vetoes_hash,dissent_hash,stakeholder_impact_hash,risk_level,
  required_test_ids,capability_scope_hash,budget_hash,maximum_executions,
  rollback_hash,decision_hash,status,expires_at,finalized_at,
  model_independence_assessment_id,model_independence_status,
  model_independence_evidence_hash
) values (
  ${sqlLiteral(ids.decision)},${sqlLiteral(ids.deliberation)},
  ${sqlLiteral(ids.evidencePacket)},${sqlLiteral(ids.proposal)},
  ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'shared','ci',
  ${sqlLiteral(`concurrency-decision-${ids.task.slice(0, 8)}`)},
  ${sqlLiteral(sourceCommit)},${sqlLiteral(h6)},${sqlLiteral("c".repeat(64))},
  '{}'::text[],${sqlLiteral("d".repeat(64))},'{}'::text[],
  ${sqlLiteral("e".repeat(64))},${sqlLiteral("f".repeat(64))},${sqlLiteral(h1)},
  ${sqlLiteral(h2)},${sqlLiteral(h3)},'low',array['concurrency-test'],
  ${sqlLiteral(h4)},${sqlLiteral(h9)},10,${sqlLiteral(h3)},${sqlLiteral(h5)},
  'finalized',transaction_timestamp()+interval '1 day',
  transaction_timestamp(),
  'deliberation-' || encode(extensions.digest(
    convert_to(${sqlLiteral(ids.deliberation)},'UTF8'),'sha256'
  ),'hex'),
  'MODEL_INDEPENDENCE_VERIFIED',${sqlLiteral(h8)}
);
set local session_replication_role = origin;

insert into public.governance_two_party_service_assertions(
  service_identity,assertion_hash,allowed_operations,registered_by,status,
  issued_at,expires_at,revoked_at,revoked_by,revocation_hash
) values
  (
    'cognitive_approved_action_worker',${sqlLiteral(hash(workerAssertion))},
    array['set_switch','bootstrap_control_plane'],${sqlLiteral(ids.owner)},'active',
    transaction_timestamp(),transaction_timestamp()+interval '4 hours',
    null,null,null
  ),
  (
    'cognitive_independent_evaluator',${sqlLiteral(hash(evaluatorAssertion))},
    array['independent_evaluation'],${sqlLiteral(ids.owner)},'active',
    transaction_timestamp(),transaction_timestamp()+interval '4 hours',
    null,null,null
  ),
  (
    'product_experience_baseline_service',${sqlLiteral(hash(baselineAssertion))},
    array['visual_experience_canary'],${sqlLiteral(ids.owner)},'active',
    transaction_timestamp(),transaction_timestamp()+interval '4 hours',
    null,null,null
  )
on conflict (service_identity) do update
set assertion_hash=excluded.assertion_hash,
    allowed_operations=excluded.allowed_operations,
    registered_by=excluded.registered_by,
    status='active',
    issued_at=excluded.issued_at,
    expires_at=excluded.expires_at,
    revoked_at=null,
    revoked_by=null,
    revocation_hash=null;

insert into public.intelligence_budgets(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  summary,evidence_metadata,data_class,retention_until,immutable_ceiling_hash,
  max_model_tokens,max_model_cost,max_tool_calls,max_tool_bytes,max_child_tasks,
  max_recursion_depth,max_retries,max_concurrent_calls,deadline_at
) values (
  ${sqlLiteral(ids.budget)},${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},
  'shared','ci','cognitive_control_plane',
  ${sqlLiteral(`concurrency-budget-${ids.budget.slice(0, 8)}`)},'received',
  '{}'::jsonb,'{}'::jsonb,'operational_metadata',
  transaction_timestamp()+interval '30 days',${sqlLiteral(h1)},
  1000,10,10,10000,2,2,2,1,transaction_timestamp()+interval '4 hours'
);
commit;
`);

const switchTargetHash = (switchKey, enabled, policyVersion) =>
  hash(`set_switch|${switchKey}|${enabled ? "true" : "false"}|${policyVersion}`);

const createApproval = ({
  approvalKey,
  maximumExecutions,
  switchKey,
  enabled = true,
  policyVersion,
  validity = "24 hours",
}) => {
  const targetHash = switchTargetHash(switchKey, enabled, policyVersion);
  const output = query(`
begin;
${ownerRoleSql(ids.owner)}
select public.governance_record_owner_approval(
  ${sqlLiteral(ids.decision)},${sqlLiteral(approvalKey)},${sqlLiteral(h4)},
  ${sqlLiteral(h6)},${sqlLiteral(sourceCommit)},${sqlLiteral(h6)},
  ${sqlLiteral(h4)},${sqlLiteral(repository)},${sqlLiteral(branch)},
  'none','set_switch',${sqlLiteral(targetHash)},
  '{}'::text[],'{}'::text[],'{}'::text[],${sqlLiteral(h9)},
  1,10,1024,${maximumExecutions},${sqlLiteral(h8)},
  array['concurrency-test'],${sqlLiteral(h9)},${sqlLiteral(h3)},
  ${sqlLiteral(validity)}::interval
)::text;
commit;
`);
  const result = JSON.parse(output.split("\n").at(-1));
  return {
    id: result.approvalVersionId,
    approvalHash: result.approvalHash,
    targetHash,
    switchKey,
    enabled,
    policyVersion,
  };
};

const claimSql = (approval, delaySeconds = 0) => `
begin;
${serviceRoleSql()}
${delaySeconds > 0 ? `select pg_sleep(${delaySeconds});` : ""}
select public.governance_claim_approved_action(
  ${sqlLiteral(approval.id)},'cognitive_approved_action_worker',
  ${sqlLiteral(workerAssertion)},${sqlLiteral(h5)},${sqlLiteral(h6)},
  ${sqlLiteral(approval.approvalHash)},${sqlLiteral(ids.task)},
  ${sqlLiteral(ids.project)},${sqlLiteral(repository)},${sqlLiteral(branch)},
  'shared','ci','none','set_switch',${sqlLiteral(approval.targetHash)},
  ${sqlLiteral(h9)},${sqlLiteral(h8)},${sqlLiteral(h9)},${sqlLiteral(h3)}
)::text;
commit;
`;

const claimOne = (approval) => {
  const output = query(claimSql(approval));
  const result = JSON.parse(output.split("\n").at(-1));
  return result.executionId;
};

const beginExecutionSql = (executionId, nextState) => `
select public.governance_begin_approved_execution(
  ${sqlLiteral(executionId)},'cognitive_approved_action_worker',
  ${sqlLiteral(workerAssertion)},${sqlLiteral(nextState)}
);
`;

const stageExecution = (approval, nextState) => {
  const executionId = claimOne(approval);
  query(`
begin;
${serviceRoleSql()}
${beginExecutionSql(executionId, "preflight")}
${beginExecutionSql(executionId, "executing")}
${nextState === "evaluating" ? `
select public.governance_execute_approved_switch(
  ${sqlLiteral(executionId)},'cognitive_approved_action_worker',
  ${sqlLiteral(workerAssertion)},${sqlLiteral(approval.switchKey)},
  ${approval.enabled},${sqlLiteral(approval.policyVersion)},
  ${sqlLiteral(approval.targetHash)}
);
${beginExecutionSql(executionId, "evaluating")}
` : ""}
commit;
`);
  return executionId;
};

const evaluatorProofSql = (executionId, receiptHash, proofHash, delaySeconds = 0) => `
begin;
${serviceRoleSql()}
${delaySeconds > 0 ? `select pg_sleep(${delaySeconds});` : ""}
select public.governance_record_approved_execution_evaluator_proof(
  ${sqlLiteral(executionId)},'cognitive_independent_evaluator',
  ${sqlLiteral(evaluatorAssertion)},${sqlLiteral(receiptHash)},
  ${sqlLiteral(proofHash)},'passed'
);
commit;
`;

const completeSql = (executionId, receiptHash, proofHash, delaySeconds = 0) => `
begin;
${serviceRoleSql()}
${delaySeconds > 0 ? `select pg_sleep(${delaySeconds});` : ""}
select public.governance_complete_approved_execution(
  ${sqlLiteral(executionId)},'cognitive_approved_action_worker',
  ${sqlLiteral(workerAssertion)},${sqlLiteral(receiptHash)},${sqlLiteral(proofHash)}
);
commit;
`;

const cleanupSql = (executionId, transition, evidenceHash, delaySeconds = 0) => `
begin;
${serviceRoleSql()}
${delaySeconds > 0 ? `select pg_sleep(${delaySeconds});` : ""}
select public.governance_release_or_quarantine_execution(
  ${sqlLiteral(executionId)},'cognitive_approved_action_worker',
  ${sqlLiteral(workerAssertion)},${sqlLiteral(transition)},${sqlLiteral(evidenceHash)}
);
commit;
`;

const createBootstrapApproval = (suffix) => {
  const bootstrapBranch = `codex/bootstrap-concurrency-${suffix}`;
  const retentionHash = "a".repeat(64);
  const constitutionHash = "b".repeat(64);
  const rollbackHash = "c".repeat(64);
  const evaluatorRequirementHash = "d".repeat(64);
  const policyVersion = "collective-governance-v1";
  const targetHash = hash([
    "bootstrap_control_plane",
    repository,
    bootstrapBranch,
    sourceCommit,
    retentionHash,
    constitutionHash,
    rollbackHash,
    evaluatorRequirementHash,
    policyVersion,
  ].join("|"));
  const output = query(`
begin;
${ownerRoleSql(ids.owner)}
select public.governance_record_bootstrap_approval(
  ${sqlLiteral(repository)},${sqlLiteral(bootstrapBranch)},
  ${sqlLiteral(sourceCommit)},${sqlLiteral(retentionHash)},
  ${sqlLiteral(constitutionHash)},${sqlLiteral(rollbackHash)},
  ${sqlLiteral(evaluatorRequirementHash)},${sqlLiteral(policyVersion)},3600
)::text;
commit;
`);
  const result = JSON.parse(output.split("\n").at(-1));
  assert.equal(
    result.targetResourceHash,
    targetHash,
    "database and harness must derive the same canonical bootstrap target hash",
  );
  return {
    id: result.approvalId,
    approvalHash: result.approvalHash,
    targetHash,
    branch: bootstrapBranch,
    retentionHash,
    constitutionHash,
    rollbackHash,
    evaluatorRequirementHash,
    policyVersion,
  };
};

const bootstrapClaimSql = (approval, delaySeconds = 0) => `
begin;
${serviceRoleSql()}
${delaySeconds > 0 ? `select pg_sleep(${delaySeconds});` : ""}
select public.governance_claim_bootstrap_control_plane(
  ${sqlLiteral(approval.id)},${sqlLiteral(approval.approvalHash)},
  ${sqlLiteral(approval.targetHash)},${sqlLiteral(repository)},
  ${sqlLiteral(approval.branch)},${sqlLiteral(sourceCommit)},
  ${sqlLiteral(approval.retentionHash)},${sqlLiteral(approval.constitutionHash)},
  ${sqlLiteral(approval.rollbackHash)},
  ${sqlLiteral(approval.evaluatorRequirementHash)},
  ${sqlLiteral(approval.policyVersion)},'cognitive_approved_action_worker',
  ${sqlLiteral(workerAssertion)}
)::text;
commit;
`;

const bootstrapStage = (executionId, approval) => {
  const output = query(`
begin;
${serviceRoleSql()}
select public.governance_stage_bootstrap_control_plane(
  ${sqlLiteral(executionId)},${sqlLiteral(approval.approvalHash)},
  ${sqlLiteral(approval.targetHash)},'cognitive_approved_action_worker',
  ${sqlLiteral(workerAssertion)}
)::text;
commit;
`);
  return JSON.parse(output.split("\n").at(-1)).executionReceiptHash;
};

const bootstrapEvaluatorSql = (
  executionId,
  receiptHash,
  proofHash,
  delaySeconds = 0,
) => `
begin;
${serviceRoleSql()}
${delaySeconds > 0 ? `select pg_sleep(${delaySeconds});` : ""}
select public.governance_record_bootstrap_evaluator_proof(
  ${sqlLiteral(executionId)},${sqlLiteral(receiptHash)},
  ${sqlLiteral(proofHash)},'passed','cognitive_independent_evaluator',
  ${sqlLiteral(evaluatorAssertion)}
);
commit;
`;

const bootstrapCompleteSql = (
  executionId,
  receiptHash,
  proofHash,
  delaySeconds = 0,
) => `
begin;
${serviceRoleSql()}
${delaySeconds > 0 ? `select pg_sleep(${delaySeconds});` : ""}
select public.governance_complete_bootstrap_control_plane(
  ${sqlLiteral(executionId)},${sqlLiteral(receiptHash)},
  ${sqlLiteral(proofHash)},'cognitive_approved_action_worker',
  ${sqlLiteral(workerAssertion)}
);
commit;
`;

const results = [];
const recordPass = (name, detail) => {
  results.push({ name, detail });
  console.log(`PASS ${name}: ${detail}`);
};

// 1. Approval allowance claim: two concurrent allowances may be consumed, but
// a third claimant observes the locked counter and is rejected.
const allowanceApproval = createApproval({
  approvalKey: `allowance-${ids.task.slice(0, 8)}`,
  maximumExecutions: 2,
  switchKey: "cognitive_livekit_experience_sentinel_enabled",
  policyVersion: "concurrency-allowance",
});
const allowanceRace = await runRace(
  claimSql(allowanceApproval, 0.05),
  claimSql(allowanceApproval, 0.05),
  claimSql(allowanceApproval, 0.05),
);
assertRace(
  "approval allowance claim",
  allowanceRace,
  2,
  /two_party_approved_action_claim_rejected/u,
);
assert.deepEqual(
  query(`
select executions_claimed::text
from public.governance_owner_approval_version_states
where approval_version_id=${sqlLiteral(allowanceApproval.id)};
select count(*)::text
from public.governance_approved_action_executions
where approval_version_id=${sqlLiteral(allowanceApproval.id)};
`).split("\n"),
  ["2", "2"],
  "approval allowance must have exactly two durable claims",
);
recordPass("approval allowance claim", "2 winners / 1 rejection");

// 2. Service assertion revocation: the verifier's FOR SHARE waits behind the
// revocation update and must reject after the revocation commits.
const serviceRevocationMarker = `service-revocation-${randomUUID()}`;
const serviceRevocationWriter = startSignaledSession(`
begin;
${ownerRoleSql(ids.owner)}
select public.governance_revoke_two_party_service_principal(
  'product_experience_baseline_service',${sqlLiteral(h2)}
);
select ${sqlLiteral(serviceRevocationMarker)};
select pg_sleep(0.35);
commit;
`, serviceRevocationMarker);
await serviceRevocationWriter.ready;
const serviceRevocationRace = await Promise.all([
  serviceRevocationWriter.result,
  runSession(`
begin;
${serviceRoleSql()}
select public.governance_assert_two_party_service_principal(
  'product_experience_baseline_service',${sqlLiteral(baselineAssertion)},
  'visual_experience_canary'
);
commit;
`),
]);
assert.equal(serviceRevocationRace[0].code, 0, "service revocation must commit");
assert.notEqual(serviceRevocationRace[1].code, 0, "revoked assertion must not verify");
assert.match(
  serviceRevocationRace[1].stderr,
  /two_party_service_principal_required/u,
  "service verifier must reject after concurrent revocation",
);
assert.equal(
  query(`
select status || ':' || (revoked_at is not null)::text
from public.governance_two_party_service_assertions
where service_identity='product_experience_baseline_service';
`),
  "revoked:true",
  "service assertion must remain revoked",
);
recordPass("service assertion revocation", "revocation wins before authorization");

// 3. Evaluator proof race: the execution lock and immutable unique receipt
// permit one proof record only.
const evaluatorApproval = createApproval({
  approvalKey: `evaluator-${ids.task.slice(0, 8)}`,
  maximumExecutions: 1,
  switchKey: "cognitive_visual_experience_sentinel_enabled",
  policyVersion: "concurrency-evaluator",
});
const evaluatorExecution = stageExecution(evaluatorApproval, "evaluating");
const evaluatorReceipt = "a".repeat(64);
const evaluatorProof = "b".repeat(64);
const evaluatorRace = await runRace(
  evaluatorProofSql(evaluatorExecution, evaluatorReceipt, evaluatorProof, 0.05),
  evaluatorProofSql(evaluatorExecution, evaluatorReceipt, evaluatorProof, 0.05),
);
assertRace("evaluator proof", evaluatorRace, 1, /duplicate key value/u);
assert.equal(
  query(`
select count(*)::text
from public.governance_approved_execution_evaluator_proofs
where execution_id=${sqlLiteral(evaluatorExecution)};
`),
  "1",
  "evaluator race must retain exactly one immutable proof",
);
recordPass("evaluator proof race", "1 immutable proof / 1 duplicate rejection");

// 4. Switch completion: completion and switch application are atomic and one
// concurrent completion is rejected after observing the terminal state.
const completionApproval = createApproval({
  approvalKey: `completion-${ids.task.slice(0, 8)}`,
  maximumExecutions: 1,
  switchKey: "cognitive_livekit_experience_sentinel_enabled",
  policyVersion: "concurrency-completion",
});
const completionExecution = stageExecution(completionApproval, "evaluating");
const completionReceipt = "c".repeat(64);
const completionProof = "d".repeat(64);
query(evaluatorProofSql(completionExecution, completionReceipt, completionProof));
const completionRace = await runRace(
  completeSql(completionExecution, completionReceipt, completionProof, 0.05),
  completeSql(completionExecution, completionReceipt, completionProof, 0.05),
);
assertRace(
  "switch completion",
  completionRace,
  1,
  /two_party_execution_completion_rejected/u,
);
assert.deepEqual(
  query(`
select state
from public.governance_approved_action_executions
where id=${sqlLiteral(completionExecution)};
select enabled::text
from public.cognitive_governance_switches
where task_id=${sqlLiteral(ids.task)}
  and switch_key='cognitive_livekit_experience_sentinel_enabled';
select count(*)::text
from public.governance_owner_approval_lifecycle_events
where execution_id=${sqlLiteral(completionExecution)}
  and event_type='completed';
`).split("\n"),
  ["completed", "true", "1"],
  "switch completion must apply once with one immutable completion event",
);
recordPass("switch completion race", "1 atomic completion / 1 terminal rejection");

// 5. Emergency stop during execution: the emergency-state writer holds its row
// lock until commit; the concurrent completion waits and then rejects.
const emergencyApproval = createApproval({
  approvalKey: `emergency-${ids.task.slice(0, 8)}`,
  maximumExecutions: 1,
  switchKey: "cognitive_installed_journey_sentinel_enabled",
  policyVersion: "concurrency-emergency",
});
const emergencyExecution = stageExecution(emergencyApproval, "evaluating");
const emergencyReceipt = "e".repeat(64);
const emergencyProof = "f".repeat(64);
query(evaluatorProofSql(emergencyExecution, emergencyReceipt, emergencyProof));
const emergencyMarker = `emergency-stop-${randomUUID()}`;
const emergencyWriter = startSignaledSession(`
begin;
update public.autonomous_system_emergency_states
set status='emergency_stop',reason='concurrent emergency stop',
    updated_at=transaction_timestamp()
where system_id='product_intelligence_operator';
select ${sqlLiteral(emergencyMarker)};
select pg_sleep(0.35);
commit;
`, emergencyMarker);
await emergencyWriter.ready;
const emergencyRace = await Promise.all([
  emergencyWriter.result,
  runSession(completeSql(emergencyExecution, emergencyReceipt, emergencyProof)),
]);
assert.equal(emergencyRace[0].code, 0, "emergency stop must commit");
assert.notEqual(emergencyRace[1].code, 0, "completion must fail behind emergency stop");
assert.match(
  emergencyRace[1].stderr,
  /two_party_execution_completion_rejected/u,
  "emergency stop must reject success",
);
assert.deepEqual(
  query(`
select state
from public.governance_approved_action_executions
where id=${sqlLiteral(emergencyExecution)};
select count(*)::text
from public.cognitive_governance_switches
where task_id=${sqlLiteral(ids.task)}
  and switch_key='cognitive_installed_journey_sentinel_enabled';
`).split("\n"),
  ["evaluating", "0"],
  "emergency stop must preserve staged non-live state",
);
query(`
update public.autonomous_system_emergency_states
set status='active',reason='local database concurrency fixture',
    updated_at=transaction_timestamp()
where system_id='product_intelligence_operator';
`);
recordPass("emergency stop during execution", "completion rejected; switch stayed non-live");

// 6. Cancellation during execution: cancellation commits while the worker waits
// for the task liveness lock, then the pending side effect is rejected.
const cancellationApproval = createApproval({
  approvalKey: `cancellation-${ids.task.slice(0, 8)}`,
  maximumExecutions: 1,
  switchKey: "cognitive_installed_journey_sentinel_enabled",
  policyVersion: "concurrency-cancellation",
});
const cancellationExecution = stageExecution(cancellationApproval, "executing");
const cancellationMarker = `task-cancellation-${randomUUID()}`;
const cancellationWriter = startSignaledSession(`
begin;
update public.intelligence_tasks
set cancelled_at=transaction_timestamp(),updated_at=transaction_timestamp()
where id=${sqlLiteral(ids.task)};
select ${sqlLiteral(cancellationMarker)};
select pg_sleep(0.35);
commit;
`, cancellationMarker);
await cancellationWriter.ready;
const cancellationRace = await Promise.all([
  cancellationWriter.result,
  runSession(`
begin;
${serviceRoleSql()}
select public.governance_execute_approved_switch(
  ${sqlLiteral(cancellationExecution)},'cognitive_approved_action_worker',
  ${sqlLiteral(workerAssertion)},${sqlLiteral(cancellationApproval.switchKey)},
  ${cancellationApproval.enabled},${sqlLiteral(cancellationApproval.policyVersion)},
  ${sqlLiteral(cancellationApproval.targetHash)}
);
commit;
`),
]);
assert.equal(cancellationRace[0].code, 0, "task cancellation must commit");
assert.notEqual(cancellationRace[1].code, 0, "side effect must fail after cancellation");
assert.match(
  cancellationRace[1].stderr,
  /two_party_switch_execution_rejected/u,
  "cancelled task must reject side effect",
);
assert.equal(
  query(`
select state
from public.governance_approved_action_executions
where id=${sqlLiteral(cancellationExecution)};
`),
  "executing",
  "cancelled execution must not advance to postflight",
);
query(`
update public.intelligence_tasks
set cancelled_at=null,updated_at=transaction_timestamp()
where id=${sqlLiteral(ids.task)};
`);
recordPass("cancellation during execution", "side effect rejected before postflight");

// 7. Budget reservation: a row lock serializes concurrent reservations against
// the same max-concurrency ceiling.
const budgetRace = await runRace(
  `
begin;
${cognitiveActorSql(cognitiveCredential)}
select pg_sleep(0.05);
select public.cognitive_reserve_budget(
  ${sqlLiteral(ids.budget)},${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},
  'shared','ci','budget-race-a',1,0,1,1,0,0,0,1,
  ${sqlLiteral("a".repeat(64))},${sqlLiteral("b".repeat(64))}
);
commit;
`,
  `
begin;
${cognitiveActorSql(cognitiveCredential)}
select pg_sleep(0.05);
select public.cognitive_reserve_budget(
  ${sqlLiteral(ids.budget)},${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},
  'shared','ci','budget-race-b',1,0,1,1,0,0,0,1,
  ${sqlLiteral("c".repeat(64))},${sqlLiteral("d".repeat(64))}
);
commit;
`,
);
assertRace(
  "budget reservation",
  budgetRace,
  1,
  /cognitive_budget_reservation_rejected/u,
);
assert.deepEqual(
  query(`
select active_concurrent_calls::text
from public.intelligence_budgets where id=${sqlLiteral(ids.budget)};
select count(*)::text
from public.cognitive_budget_events
where budget_id=${sqlLiteral(ids.budget)} and event_type='reserved';
`).split("\n"),
  ["1", "1"],
  "budget ceiling must retain exactly one active reservation",
);
recordPass("budget reservation race", "1 bounded reservation / 1 ceiling rejection");

// 8. Lease acquisition: the hierarchy-wide advisory lock serializes conflicting
// write leases held by different tasks.
const leaseRace = await runRace(
  `
begin;
${cognitiveActorSql(cognitiveCredential)}
select pg_sleep(0.05);
select public.cognitive_acquire_resource_lease(
  ${sqlLiteral(ids.leaseTaskA)},${sqlLiteral(ids.project)},'shared','ci',
  'path','path:docs/concurrency','write',
  transaction_timestamp()+interval '1 hour',${sqlLiteral("a".repeat(64))}
);
commit;
`,
  `
begin;
${cognitiveActorSql(cognitiveCredential)}
select pg_sleep(0.05);
select public.cognitive_acquire_resource_lease(
  ${sqlLiteral(ids.leaseTaskB)},${sqlLiteral(ids.project)},'shared','ci',
  'path','path:docs/concurrency/child','write',
  transaction_timestamp()+interval '1 hour',${sqlLiteral("b".repeat(64))}
);
commit;
`,
);
assertRace("lease acquisition", leaseRace, 1, /resource_lease_conflict/u);
assert.equal(
  query(`
select count(*)::text from public.cognitive_resource_leases
where project_id=${sqlLiteral(ids.project)}
  and resource_key in ('path:docs/concurrency','path:docs/concurrency/child')
  and revoked_at is null;
`),
  "1",
  "conflicting hierarchy must retain one active write lease",
);
recordPass("lease acquisition race", "1 active hierarchical write lease");

// 9. Successful rollback: two completion attempts race from rollback_running;
// one terminal transition wins and revokes the approval's old write authority.
const rollbackApproval = createApproval({
  approvalKey: `rollback-success-${ids.task.slice(0, 8)}`,
  maximumExecutions: 1,
  switchKey: "cognitive_visual_experience_sentinel_enabled",
  policyVersion: "concurrency-rollback-success",
});
const rollbackExecution = stageExecution(rollbackApproval, "executing");
query(cleanupSql(rollbackExecution, "rollback_pending", "a".repeat(64)));
query(cleanupSql(rollbackExecution, "rollback_running", "b".repeat(64)));
const rollbackRace = await runRace(
  cleanupSql(rollbackExecution, "rollback_succeeded", "c".repeat(64), 0.05),
  cleanupSql(rollbackExecution, "rollback_succeeded", "d".repeat(64), 0.05),
);
assertRace(
  "rollback-success authority revocation",
  rollbackRace,
  1,
  /two_party_execution_release_rejected/u,
);
assert.deepEqual(
  query(`
select state from public.governance_approved_action_executions
where id=${sqlLiteral(rollbackExecution)};
select state from public.governance_owner_approval_version_states
where approval_version_id=${sqlLiteral(rollbackApproval.id)};
select current_state from public.governance_owner_approval_records record
join public.governance_owner_approval_versions version
  on version.approval_record_id=record.id
where version.id=${sqlLiteral(rollbackApproval.id)};
`).split("\n"),
  ["rollback_succeeded", "rolled_back", "rolled_back"],
  "successful rollback must revoke old approval authority",
);
recordPass("rollback-success authority revocation", "1 terminal winner; authority rolled back");

// 10. Failed rollback quarantine: competing quarantine attempts from
// rollback_running produce one terminal quarantine and a failed approval state.
const quarantineApproval = createApproval({
  approvalKey: `rollback-quarantine-${ids.task.slice(0, 8)}`,
  maximumExecutions: 1,
  switchKey: "cognitive_visual_experience_sentinel_enabled",
  policyVersion: "concurrency-rollback-quarantine",
});
const quarantineExecution = stageExecution(quarantineApproval, "executing");
query(cleanupSql(quarantineExecution, "rollback_pending", "e".repeat(64)));
query(cleanupSql(quarantineExecution, "rollback_running", "f".repeat(64)));
const quarantineRace = await runRace(
  cleanupSql(quarantineExecution, "quarantined", "1".repeat(64), 0.05),
  cleanupSql(quarantineExecution, "quarantined", "2".repeat(64), 0.05),
);
assertRace(
  "failed rollback quarantine",
  quarantineRace,
  1,
  /two_party_execution_release_rejected/u,
);
assert.deepEqual(
  query(`
select state from public.governance_approved_action_executions
where id=${sqlLiteral(quarantineExecution)};
select state from public.governance_owner_approval_version_states
where approval_version_id=${sqlLiteral(quarantineApproval.id)};
select current_state from public.governance_owner_approval_records record
join public.governance_owner_approval_versions version
  on version.approval_record_id=record.id
where version.id=${sqlLiteral(quarantineApproval.id)};
`).split("\n"),
  ["quarantined", "failed", "failed"],
  "failed rollback must end quarantined with failed approval authority",
);
recordPass("failed rollback quarantine", "1 terminal quarantine; approval failed");

// 11. Finding lifecycle: concurrent recurrence retains one current row and two
// immutable lifecycle events.
const findingKey = `concurrent-finding-${ids.task.slice(0, 8)}`;
const findingRace = await runRace(
  `
begin;
${cognitiveActorSql(cognitiveCredential)}
select pg_sleep(0.05);
select public.cognitive_record_finding(
  ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'shared','ci',
  ${sqlLiteral(findingKey)},'concurrency','path:docs/concurrency','p1',
  ${sqlLiteral("a".repeat(64))}
);
commit;
`,
  `
begin;
${cognitiveActorSql(cognitiveCredential)}
select pg_sleep(0.05);
select public.cognitive_record_finding(
  ${sqlLiteral(ids.task)},${sqlLiteral(ids.project)},'shared','ci',
  ${sqlLiteral(findingKey)},'concurrency','path:docs/concurrency','p1',
  ${sqlLiteral("b".repeat(64))}
);
commit;
`,
);
assertRace("finding lifecycle", findingRace, 2, /$^/u);
assert.deepEqual(
  query(`
select occurrence_count::text
from public.cognitive_current_findings
where task_id=${sqlLiteral(ids.task)} and finding_key=${sqlLiteral(findingKey)};
select count(*)::text
from public.finding_lifecycle_events event
join public.cognitive_current_findings finding on finding.id=event.finding_id
where finding.task_id=${sqlLiteral(ids.task)}
  and finding.finding_key=${sqlLiteral(findingKey)};
`).split("\n"),
  ["2", "2"],
  "finding recurrence must retain two immutable lifecycle events",
);
recordPass("finding lifecycle race", "1 current finding / 2 occurrences / 2 events");

// 12. Approval reinstatement: equivalent concurrent renewals of the same
// expired version create one immutable successor only.
const reinstatementApproval = createApproval({
  approvalKey: `reinstatement-${ids.task.slice(0, 8)}`,
  maximumExecutions: 1,
  switchKey: "cognitive_visual_experience_sentinel_enabled",
  policyVersion: "concurrency-reinstatement",
  validity: "250 milliseconds",
});
await delay(400);
const revalidateSql = (revalidationHash) => `
begin;
${ownerRoleSql(ids.owner)}
select public.governance_revalidate_owner_approval(
  ${sqlLiteral(reinstatementApproval.id)},${sqlLiteral(revalidationHash)},
  ${sqlLiteral(h5)},${sqlLiteral(sourceCommit)},${sqlLiteral(h6)},
  false,interval '12 hours'
);
commit;
`;
const reinstatementRace = await runRace(
  revalidateSql("3".repeat(64)),
  revalidateSql("4".repeat(64)),
);
assertRace(
  "approval reinstatement",
  reinstatementRace,
  1,
  /two_party_reinstatement_requires_amended_approval/u,
);
assert.deepEqual(
  query(`
select count(*)::text
from public.governance_owner_approval_versions successor
where successor.approval_record_id=(
  select original.approval_record_id
  from public.governance_owner_approval_versions original
  where original.id=${sqlLiteral(reinstatementApproval.id)}
);
select count(*)::text
from public.governance_owner_approval_version_states state
where state.approval_record_id=(
  select original.approval_record_id
  from public.governance_owner_approval_versions original
  where original.id=${sqlLiteral(reinstatementApproval.id)}
) and state.state='active';
select current_version::text
from public.governance_owner_approval_records record
join public.governance_owner_approval_versions original
  on original.approval_record_id=record.id
where original.id=${sqlLiteral(reinstatementApproval.id)};
`).split("\n"),
  ["2", "1", "2"],
  "reinstatement must create exactly one active immutable successor",
);
recordPass("approval reinstatement race", "1 immutable successor / 1 stale rejection");

// 13. Single-use replay: simultaneous duplicate claims against one allowance
// yield exactly one execution and one replay rejection.
const replayApproval = createApproval({
  approvalKey: `single-use-replay-${ids.task.slice(0, 8)}`,
  maximumExecutions: 1,
  switchKey: "cognitive_visual_experience_sentinel_enabled",
  policyVersion: "concurrency-replay",
});
const replayRace = await runRace(
  claimSql(replayApproval, 0.05),
  claimSql(replayApproval, 0.05),
);
assertRace(
  "single-use replay",
  replayRace,
  1,
  /two_party_approved_action_claim_rejected/u,
);
assert.deepEqual(
  query(`
select executions_claimed::text
from public.governance_owner_approval_version_states
where approval_version_id=${sqlLiteral(replayApproval.id)};
select count(*)::text
from public.governance_approved_action_executions
where approval_version_id=${sqlLiteral(replayApproval.id)};
`).split("\n"),
  ["1", "1"],
  "single-use approval must retain one durable execution",
);
recordPass("single-use replay race", "1 winner / 1 replay rejection");

// 14. Zero-state bootstrap claim: the pre-task approval-state row serializes
// duplicate worker claims and preserves a single execution.
const bootstrapApproval = createBootstrapApproval("claim");
const bootstrapClaimRace = await runRace(
  bootstrapClaimSql(bootstrapApproval, 0.05),
  bootstrapClaimSql(bootstrapApproval, 0.05),
);
assertRace(
  "bootstrap claim",
  bootstrapClaimRace,
  1,
  /governance_bootstrap_claim_rejected/u,
);
const bootstrapExecution = query(`
select id::text
from public.governance_bootstrap_executions
where approval_id=${sqlLiteral(bootstrapApproval.id)};
`);
assert.match(bootstrapExecution, /^[a-f0-9-]{36}$/u, "bootstrap claim must persist one execution");
assert.deepEqual(
  query(`
select state
from public.governance_bootstrap_approval_states
where approval_id=${sqlLiteral(bootstrapApproval.id)};
select count(*)::text
from public.governance_bootstrap_executions
where approval_id=${sqlLiteral(bootstrapApproval.id)};
select count(*)::text
from public.intelligence_tasks
where task_key='cognitive-level01-canary-control'
  and platform='shared' and environment='production';
`).split("\n"),
  ["claimed", "1", "0"],
  "bootstrap claim must be single-use and remain pre-task",
);
recordPass("bootstrap claim race", "1 worker claim / 1 replay rejection / 0 live tasks");

// 15. Bootstrap revocation after staging: Owner revocation holds the approval
// state lock; the evaluator waits and then rejects without producing proof.
const revokedBootstrapApproval = createBootstrapApproval("revocation");
query(bootstrapClaimSql(revokedBootstrapApproval));
const revokedBootstrapExecution = query(`
select id::text
from public.governance_bootstrap_executions
where approval_id=${sqlLiteral(revokedBootstrapApproval.id)};
`);
const revokedBootstrapReceipt = bootstrapStage(
  revokedBootstrapExecution,
  revokedBootstrapApproval,
);
const bootstrapRevocationMarker = `bootstrap-revocation-${randomUUID()}`;
const bootstrapRevocationWriter = startSignaledSession(`
begin;
${ownerRoleSql(ids.owner)}
select public.governance_revoke_bootstrap_approval(
  ${sqlLiteral(revokedBootstrapApproval.id)},${sqlLiteral("e".repeat(64))}
);
select ${sqlLiteral(bootstrapRevocationMarker)};
select pg_sleep(0.35);
commit;
`, bootstrapRevocationMarker);
await bootstrapRevocationWriter.ready;
const bootstrapRevocationRace = await Promise.all([
  bootstrapRevocationWriter.result,
  runSession(bootstrapEvaluatorSql(
    revokedBootstrapExecution,
    revokedBootstrapReceipt,
    "f".repeat(64),
  )),
]);
assert.equal(bootstrapRevocationRace[0].code, 0, "bootstrap revocation must commit");
assert.notEqual(
  bootstrapRevocationRace[1].code,
  0,
  "evaluator progression must fail behind bootstrap revocation",
);
assert.match(
  bootstrapRevocationRace[1].stderr,
  /governance_bootstrap_evaluator_proof_rejected/u,
  "revoked bootstrap must reject evaluator progression",
);
assert.deepEqual(
  query(`
select state
from public.governance_bootstrap_approval_states
where approval_id=${sqlLiteral(revokedBootstrapApproval.id)};
select count(*)::text
from public.governance_bootstrap_evaluator_proofs
where execution_id=${sqlLiteral(revokedBootstrapExecution)};
select count(*)::text
from public.intelligence_tasks
where task_key='cognitive-level01-canary-control'
  and platform='shared' and environment='production';
`).split("\n"),
  ["revoked", "0", "0"],
  "revocation must leave staged bootstrap non-live and proof-free",
);
recordPass("bootstrap revocation race", "Owner revocation wins / evaluator rejected / 0 live tasks");

const bootstrapReceipt = bootstrapStage(bootstrapExecution, bootstrapApproval);
const bootstrapProof = "7".repeat(64);
query(bootstrapEvaluatorSql(
  bootstrapExecution,
  bootstrapReceipt,
  bootstrapProof,
));

// 16. Bootstrap emergency stop: the stop writer owns the emergency row first;
// completion blocks, rechecks, and rejects with no partial materialization.
const bootstrapEmergencyMarker = `bootstrap-emergency-${randomUUID()}`;
const bootstrapEmergencyWriter = startSignaledSession(`
begin;
${ownerRoleSql(ids.owner)}
select public.governance_set_cognitive_emergency_state(
  'emergency_stop',${sqlLiteral("8".repeat(64))}
);
select ${sqlLiteral(bootstrapEmergencyMarker)};
select pg_sleep(0.35);
commit;
`, bootstrapEmergencyMarker);
await bootstrapEmergencyWriter.ready;
const bootstrapEmergencyRace = await Promise.all([
  bootstrapEmergencyWriter.result,
  runSession(bootstrapCompleteSql(
    bootstrapExecution,
    bootstrapReceipt,
    bootstrapProof,
  )),
]);
assert.equal(bootstrapEmergencyRace[0].code, 0, "bootstrap emergency stop must commit");
assert.notEqual(
  bootstrapEmergencyRace[1].code,
  0,
  "bootstrap completion must fail behind emergency stop",
);
assert.match(
  bootstrapEmergencyRace[1].stderr,
  /governance_bootstrap_completion_rejected/u,
  "emergency-stopped bootstrap must reject completion",
);
assert.deepEqual(
  query(`
select state
from public.governance_bootstrap_approval_states
where approval_id=${sqlLiteral(bootstrapApproval.id)};
select count(*)::text
from public.intelligence_tasks
where task_key='cognitive-level01-canary-control'
  and platform='shared' and environment='production';
select count(*)::text
from public.cognitive_governance_switches switch
join public.intelligence_tasks task on task.id=switch.task_id
where task.task_key='cognitive-level01-canary-control'
  and task.platform='shared' and task.environment='production';
`).split("\n"),
  ["evaluated", "0", "0"],
  "emergency race must leave evaluated staging with no partial task or switch",
);
query(`
begin;
${ownerRoleSql(ids.owner)}
select public.governance_set_cognitive_emergency_state(
  'active',${sqlLiteral("9".repeat(64))}
);
commit;
`);
recordPass("bootstrap emergency race", "completion rejected / 0 partial rows");

// 17. Bootstrap completion: the advisory lock plus approval/execution locks
// permit one atomic materialization and reject the concurrent replay.
const bootstrapCompletionRace = await runRace(
  bootstrapCompleteSql(bootstrapExecution, bootstrapReceipt, bootstrapProof, 0.05),
  bootstrapCompleteSql(bootstrapExecution, bootstrapReceipt, bootstrapProof, 0.05),
);
assertRace(
  "bootstrap completion",
  bootstrapCompletionRace,
  1,
  /governance_bootstrap_completion_rejected/u,
);
assert.deepEqual(
  query(`
select state
from public.governance_bootstrap_approval_states
where approval_id=${sqlLiteral(bootstrapApproval.id)};
select count(*)::text
from public.intelligence_tasks
where task_key='cognitive-level01-canary-control'
  and platform='shared' and environment='production';
select count(*)::text
from public.cognitive_governance_switches switch
join public.intelligence_tasks task on task.id=switch.task_id
where task.task_key='cognitive-level01-canary-control'
  and task.platform='shared' and task.environment='production';
select count(*)::text
from public.cognitive_governance_switches switch
join public.intelligence_tasks task on task.id=switch.task_id
where task.task_key='cognitive-level01-canary-control'
  and task.platform='shared' and task.environment='production'
  and switch.enabled;
select count(*)::text
from public.cognitive_level01_schedule_definitions schedule
join public.intelligence_tasks task on task.id=schedule.task_id
where task.task_key='cognitive-level01-canary-control'
  and task.platform='shared' and task.environment='production';
select count(*)::text
from public.cognitive_level01_schedule_definitions schedule
join public.intelligence_tasks task on task.id=schedule.task_id
where task.task_key='cognitive-level01-canary-control'
  and task.platform='shared' and task.environment='production'
  and schedule.enabled;
select count(*)::text
from public.governance_bootstrap_events
where approval_id=${sqlLiteral(bootstrapApproval.id)}
  and event_type='completed';
`).split("\n"),
  ["completed", "1", "10", "0", "5", "0", "1"],
  "bootstrap completion must materialize exactly once with all authority off",
);
recordPass("bootstrap completion race", "1 atomic completion / 1 replay rejection / all authority off");

// 18. Model provider overruns and ordinary settlements serialize on the same
// preflight row. Reuse the canonical governed-model setup instead of copying a
// second authority fixture into this harness.
const modelFixtureSource = readFileSync(
  path.join(
    process.cwd(),
    "supabase/tests/cognitive_model_router_governance_test.sql",
  ),
  "utf8",
);
const modelFixtureMatch = modelFixtureSource.match(
  /-- MODEL_ROUTER_FIXTURE_BEGIN\n(?<fixture>[\s\S]*?)\n-- MODEL_ROUTER_FIXTURE_END/u,
);
assert.ok(modelFixtureMatch?.groups?.fixture, "canonical model fixture is missing");

const modelIds = new Map([
  ["d2000000-0000-4000-8000-000000000001", randomUUID()],
  ["d1000000-0000-4000-8000-000000000001", randomUUID()],
  ["d3000000-0000-4000-8000-000000000001", randomUUID()],
  ["d4000000-0000-4000-8000-000000000001", randomUUID()],
  ["d4000000-0000-4000-8000-000000000002", randomUUID()],
  ["d5000000-0000-4000-8000-000000000001", randomUUID()],
  ["d6000000-0000-4000-8000-000000000001", randomUUID()],
  ["d7000000-0000-4000-8000-000000000001", randomUUID()],
  ["dc000000-0000-4000-8000-000000000001", randomUUID()],
  ["de000000-0000-4000-8000-000000000001", randomUUID()],
]);
const modelOwnerId = modelIds.get("d2000000-0000-4000-8000-000000000001");
const modelProjectId = modelIds.get("d1000000-0000-4000-8000-000000000001");
const modelTaskId = modelIds.get("d3000000-0000-4000-8000-000000000001");
const modelBudgetId = modelIds.get("dc000000-0000-4000-8000-000000000001");
const modelServiceAssertion = opaqueProof();
const modelWorkerAssertion = opaqueProof();
const modelEvaluatorAssertion = opaqueProof();
const modelSuffix = modelTaskId.slice(0, 8);

let modelFixture = modelFixtureMatch.groups.fixture;
for (const [fixedId, generatedId] of modelIds) {
  modelFixture = modelFixture.replaceAll(fixedId, generatedId);
}
modelFixture = modelFixture
  .replaceAll(
    "model-router-service-token-test-only-0001",
    modelServiceAssertion,
  )
  .replaceAll(
    "model-worker-assertion-test-only-000000000000",
    modelWorkerAssertion,
  )
  .replaceAll(
    "model-evaluator-assertion-test-only-000000000",
    modelEvaluatorAssertion,
  )
  .replaceAll(
    "codex/cognitive-model-router-test",
    `codex/cognitive-model-router-concurrency-${modelSuffix}`,
  )
  .replaceAll(
    "cognitive-model-router-governance-test",
    `cognitive-model-router-concurrency-${modelSuffix}`,
  )
  .replaceAll(
    "model-router-budget-fixture",
    `model-router-budget-${modelSuffix}`,
  );
query(`begin;\n${modelFixture}\ncommit;`);

const modelScopeHash = hash([
  "cognitive-model-assessment-scope-v1",
  modelTaskId,
  modelProjectId,
  "shared",
  "production",
  "research_futures",
  "model-router-assessment-0001",
  "e".repeat(64),
].join("|"));
const modelIdentityHash = hash([
  "openai",
  "gpt-5.6",
  "gpt-5.6-luna",
].join("|"));
const modelCapabilityId = query(`
begin;
${ownerRoleSql(modelOwnerId)}
select public.governance_owner_register_model_router_capability(
  (
    select id
    from public.governance_approved_action_executions
    where task_id=${sqlLiteral(modelTaskId)}
      and provider='model'
      and operation='model_advisory'
      and state='executing'
    limit 1
  ),
  ${sqlLiteral(modelBudgetId)},'research_futures',
  'cognitive_research_enabled','openai','gpt-5.6','gpt-5.6-luna',
  3,10000,1,${sqlLiteral(modelScopeHash)},
  transaction_timestamp()+interval '12 hours'
)::text;
commit;
`).split("\n").at(-1);
assert.match(modelCapabilityId, /^[0-9a-f-]{36}$/u);

const modelPreflight = JSON.parse(query(`
begin;
${serviceRoleSql()}
select public.cognitive_model_router_reserve(
  ${sqlLiteral(modelCapabilityId)},${sqlLiteral(modelTaskId)},
  ${sqlLiteral(modelProjectId)},'shared','production','research_futures',
  'openai','gpt-5.6','gpt-5.6-luna','model-router-assessment-0001',
  repeat('c',64),repeat('d',64),repeat('e',64),repeat('f',64),
  ${sqlLiteral(modelIdentityHash)},repeat('8',64),${sqlLiteral(modelScopeHash)},
  repeat('b',64),1000,0.1,${sqlLiteral(modelServiceAssertion)}
)::text;
commit;
`).split("\n").at(-1));
const modelPreflightId = modelPreflight.preflightId;
assert.match(modelPreflightId, /^[0-9a-f-]{36}$/u);

const modelOverrunSql = (delaySeconds = 0) => `
begin;
select public.cognitive_model_router_record_provider_overrun(
  ${sqlLiteral(modelPreflightId)},100050,0.1001,'gpt-5.6-luna',
  repeat('2',64),repeat('3',64),repeat('4',64),250,
  ${sqlLiteral(modelServiceAssertion)}
);
${delaySeconds > 0 ? `select pg_sleep(${delaySeconds});` : ""}
select public.cognitive_model_router_settle(
  ${sqlLiteral(modelPreflightId)},'provider_rejected',1000,0.1,
  null,null,null,null,null,repeat('3',64),repeat('a',64),250,
  ${sqlLiteral(modelServiceAssertion)}
);
commit;
`;
const modelCompletedSql = (delaySeconds = 0) => `
begin;
${delaySeconds > 0 ? `select pg_sleep(${delaySeconds});` : ""}
select public.cognitive_model_router_settle(
  ${sqlLiteral(modelPreflightId)},'completed',700,0.05,
  'gpt-5.6-luna',repeat('2',64),repeat('5',64),repeat('6',64),
  repeat('7',64),null,repeat('6',64),250,
  ${sqlLiteral(modelServiceAssertion)}
);
commit;
`;
const modelOverrunRace = await runRace(
  modelOverrunSql(0.35),
  modelCompletedSql(0.08),
);
assertRace(
  "model overrun settlement",
  modelOverrunRace,
  1,
  /model_router_(settlement_replay_denied|overrun_settlement_rejected)/u,
);
assert.deepEqual(
  query(`
select count(*)::text
from public.cognitive_model_provider_overrun_audits
where preflight_id=${sqlLiteral(modelPreflightId)};
select count(*)::text
from public.cognitive_model_router_result_audits
where preflight_id=${sqlLiteral(modelPreflightId)}
  and result_status='provider_rejected'
  and actual_model_tokens=1000
  and actual_model_cost=0.1;
select count(*)::text
from public.cognitive_model_router_recovery_audits
where preflight_id=${sqlLiteral(modelPreflightId)};
select concat_ws(
  '|',reserved_calls,settled_calls,reserved_model_tokens,
  reserved_model_cost
)
from public.cognitive_model_router_capabilities
where id=${sqlLiteral(modelCapabilityId)};
select active_concurrent_calls::text
from public.intelligence_budgets
where id=${sqlLiteral(modelBudgetId)};
select count(*)::text
from public.cognitive_budget_events
where budget_id=${sqlLiteral(modelBudgetId)}
  and event_type in ('reserved','settled');
`).split("\n"),
  ["1", "1", "0", "0|1|0|0.0000", "0", "2"],
  "model overrun race must commit one conservative terminal result",
);
recordPass(
  "model provider overrun race",
  "1 provider_rejected winner / 1 concurrent settlement rejection",
);

assert.equal(results.length, 18, "all requested database concurrency races must run");
console.log(`cognitive database concurrency verified (${results.length}/18 races passed)`);
