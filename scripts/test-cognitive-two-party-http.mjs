#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = process.cwd();
const workdirArgumentIndex = process.argv.indexOf("--supabase-workdir");
const SUPABASE_WORKDIR = workdirArgumentIndex >= 0
  ? process.argv[workdirArgumentIndex + 1]
  : process.env.COGNITIVE_HTTP_SUPABASE_WORKDIR || ROOT;
const SKIP_RESET = process.argv.includes("--skip-reset");
if (!SUPABASE_WORKDIR) throw new Error("supabase_workdir_required");
for (const relativeDirectory of ["_lib", "config"]) {
  const sourceDirectory = path.join(ROOT, relativeDirectory);
  const localDirectory = path.join(SUPABASE_WORKDIR, relativeDirectory);
  if (!fs.existsSync(localDirectory)) {
    fs.symlinkSync(sourceDirectory, localDirectory, "dir");
  }
}
const privateDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "chillywood-cognitive-http-"),
);
fs.chmodSync(privateDirectory, 0o700);
const statusFile = path.join(privateDirectory, "supabase-status.json");
const SAFE_ENV = {
  HOME: process.env.HOME ?? "",
  PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
};
const REPO = "Chillywood2025/chillywood-mobile";
const FUNCTIONS = [
  "cognitive-owner-approval",
  "cognitive-approved-action-worker",
  "cognitive-independent-evaluator",
];

const runId = Array.from(
  crypto.randomBytes(16),
  (byte) => "abcdef"[byte % 6],
).join("");
const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const base64UrlJson = (value) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const signLocalServiceJwt = (secret, claims) => {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson(claims);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
};
const hex = (char, length) => char.repeat(length);
const uuidFrom = (label) => {
  const value = hash(`${runId}:${label}`);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const asArray = (items) => `array[${items.map(quote).join(",")}]::text[]`;
const nowPlus = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();
const statusCategory = (status) => {
  if (status >= 200 && status <= 299) return "PASS_HTTP_2XX";
  if (status === 400) return "FAIL_HTTP_400";
  if (status === 401) return "FAIL_HTTP_401";
  if (status === 403) return "FAIL_HTTP_403";
  if (status === 404) return "FAIL_HTTP_404";
  if (status === 405) return "FAIL_HTTP_405";
  if (status === 409) return "FAIL_HTTP_409";
  if (status >= 500) return "FAIL_HTTP_5XX";
  return `HTTP_${status}`;
};
const scrub = (value) => String(value ?? "")
  .replace(/eyJ[A-Za-z0-9._-]+/gu, "[redacted-jwt]")
  .replace(/[A-Za-z0-9._~+/=-]{48,}/gu, "[redacted-long]");

let passed = 0;
let failed = 0;
const cases = [];
const record = (name, ok, expected, observed, detail = {}) => {
  if (ok) passed += 1;
  else failed += 1;
  cases.push({
    name,
    result: ok ? "PASS" : "FAIL",
    expected,
    observed,
    ...detail,
  });
};

const REQUIRED_HTTP_SCENARIOS = Object.freeze([
  [1, "Exact Owner records immutable approval", ["exact Owner records approval through Edge Function"]],
  [2, "Exact Owner cannot worker-execute", ["Owner-authenticated PostgREST caller cannot execute approved action"]],
  [3, "Worker cannot record Owner approval", ["worker/service-role PostgREST caller cannot record Owner approval"]],
  [4, "Worker claims a valid approval", ["approved-action worker claims approval through Edge Function"]],
  [5, "Worker stages an operation", ["worker stages switch but does not make it live"]],
  [6, "Staged operation remains non-live", ["staged switch is not live before evaluator proof"]],
  [7, "Worker cannot self-attest evaluator proof", ["worker cannot record evaluator proof via worker endpoint"]],
  [8, "Evaluator records evaluator proof", ["independent evaluator records passed proof"]],
  [9, "Evaluator cannot claim", ["independent evaluator cannot claim through evaluator endpoint"]],
  [10, "Evaluator cannot execute", ["independent evaluator cannot execute through evaluator endpoint"]],
  [11, "Evaluator cannot complete", ["independent evaluator cannot complete through evaluator endpoint"]],
  [12, "Completion without evaluator proof fails", ["worker cannot complete before evaluator proof"]],
  [13, "Completion with matching passed proof succeeds", ["worker completes after passed independent proof"]],
  [14, "Wrong receipt hash fails", ["completion with wrong receipt hash is rejected"]],
  [15, "Wrong evaluator-requirement hash fails", ["wrong evaluator-requirement hash claim is rejected"]],
  [16, "Wrong proof hash fails", ["completion with wrong proof hash is rejected"]],
  [17, "Non-Owner approval fails", ["non-owner authenticated user cannot record Owner approval"]],
  [18, "Scoped Admin approval fails", ["scoped Admin/operator cannot record Owner approval"]],
  [19, "Anonymous approval/execution fails", [
    "anon owner approval denied by Edge JWT gate",
    "anonymous worker execution is rejected",
  ]],
  [20, "Recycled-email authority fails", ["recycled email without matching owner user_id cannot approve"]],
  [21, "Missing approval fails", ["no-approval claim is rejected"]],
  [22, "Expired approval fails", ["expired approval cannot be claimed"]],
  [23, "Revoked approval fails", ["revoked approval cannot be claimed"]],
  [24, "Superseded approval fails", ["superseded/old approval version cannot be claimed after renewal"]],
  [25, "Consumed approval replay fails", ["consumed approval replay claim is rejected"]],
  [26, "Wrong manifest fails", ["wrong decision manifest hash claim is rejected"]],
  [27, "Wrong snapshot fails", ["wrong plan snapshot hash claim is rejected"]],
  [28, "Wrong exact scope tuple fails", [
    "wrong task binding claim is rejected",
    "wrong project binding claim is rejected",
    "wrong repository binding claim is rejected",
    "wrong branch binding claim is rejected",
    "wrong platform binding claim is rejected",
    "wrong environment binding claim is rejected",
    "wrong provider binding claim is rejected",
    "wrong operation binding claim is rejected",
    "wrong target binding claim is rejected",
  ]],
  [29, "Owner revocation before claim blocks execution", [
    "Owner revokes approval through PostgREST",
    "revoked approval cannot be claimed",
  ]],
  [30, "Owner revocation after side effect blocks success but allows cleanup", [
    "post-side-effect Owner revocation stages an operation",
    "Owner revokes approval after staged side effect",
    "post-side-effect Owner revocation blocks completion",
    "post-side-effect Owner revocation permits quarantine cleanup",
  ]],
  [31, "Emergency stop before claim blocks execution", ["emergency stop blocks worker claim"]],
  [32, "Emergency stop after side effect blocks success but allows cleanup", [
    "post-side-effect emergency stop stages an operation",
    "emergency stop activates after staged side effect",
    "post-side-effect emergency stop blocks completion",
    "post-side-effect emergency stop permits quarantine cleanup",
  ]],
  [33, "Concurrent duplicate worker claim yields exactly one winner", [
    "concurrent claim on single-use approval yields one success and one rejection",
  ]],
  [34, "Late result after cancellation fails", ["cancelled task blocks claimed execution result"]],
  [35, "Equivalent capability renewal remains within scope", ["renewed approval version can be claimed once"]],
  [36, "Widened renewal fails", [
    "widened renewal with changed plan snapshot is rejected",
  ]],
  [37, "Reinstatement creates a new immutable approval version", [
    "reinstatement creates a distinct immutable approval version",
  ]],
  [38, "Material plan change requires amended approval", [
    "amended-scope/material-delta revalidation is rejected",
  ]],
  [39, "Successful rollback revokes old write authority", [
    "successful rollback stages an operation",
    "successful rollback enters rollback pending",
    "successful rollback enters rollback running",
    "successful rollback completes",
    "successful rollback marks approval authority rolled back",
    "successful rollback blocks old write authority",
  ]],
  [40, "Failed rollback quarantines and escalates", [
    "failed rollback stages an operation",
    "failed rollback enters rollback pending",
    "failed rollback enters rollback running",
    "worker records failed rollback evidence",
    "failed rollback transition quarantines task",
    "failed rollback task readback is quarantined",
    "failed rollback creates P1 finding",
    "failed rollback creates pending Owner escalation",
  ]],
]);
const BOOTSTRAP_SECOND_PHASE_ACTIONS = Object.freeze([
  "record_bootstrap_approval",
  "bootstrap_control_plane",
  "record_bootstrap_evaluator_proof",
]);

const spawnChecked = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...SAFE_ENV, ...(options.env ?? {}) },
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
    stdio: options.stdio ?? ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args[0] ?? ""} failed: ${scrub(result.stderr || result.stdout || result.status)}`);
  }
  return result.stdout;
};

const readSupabaseStatus = () => {
  const raw = spawnChecked("supabase", ["status", "-o", "json"], {
    cwd: SUPABASE_WORKDIR,
  });
  fs.writeFileSync(statusFile, raw, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(statusFile, 0o600);
  const parsed = JSON.parse(fs.readFileSync(statusFile, "utf8"));
  const get = (...needles) => {
    for (const [key, value] of Object.entries(parsed)) {
      const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "_");
      if (needles.every((needle) => normalized.includes(needle))) return String(value);
    }
    return "";
  };
  return {
    apiUrl: get("api", "url"),
    dbUrl: get("db", "url"),
    anonKey: get("anon", "key"),
    serviceRoleKey: get("service", "role", "key"),
    jwtSecret: get("jwt", "secret"),
  };
};

const ensureSupabase = () => {
  try {
    const status = readSupabaseStatus();
    if (
      status.apiUrl &&
      status.anonKey &&
      status.serviceRoleKey &&
      status.dbUrl &&
      status.jwtSecret
    ) {
      return status;
    }
  } catch {
    // Start below.
  }
  const start = spawnSync("supabase", ["start"], {
    cwd: SUPABASE_WORKDIR,
    env: SAFE_ENV,
    stdio: "ignore",
  });
  if (start.status !== 0) throw new Error("supabase_start_failed");
  return readSupabaseStatus();
};

const waitFor = async (predicate, label, timeoutMs = 120_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label}_timeout`);
};

const httpJson = async (url, { method = "POST", headers = {}, body, expectJson = true } = {}) => {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (expectJson && text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { parse: "NON_JSON" };
    }
  }
  return { status: response.status, category: statusCategory(response.status), data };
};

const setupLocalAuthUser = async ({ apiUrl, anonKey, serviceRoleKey }, email, password) => {
  const create = await httpJson(`${apiUrl}/auth/v1/admin/users`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    body: { email, password, email_confirm: true },
  });
  if (![200, 201].includes(create.status)) {
    const signUp = await httpJson(`${apiUrl}/auth/v1/signup`, {
      headers: { apikey: anonKey },
      body: { email, password },
    });
    if (![200, 201].includes(signUp.status)) {
      throw new Error(`auth_user_create_failed:${create.category}:${signUp.category}`);
    }
    if (signUp.data?.access_token && signUp.data?.user?.id) {
      return { id: signUp.data.user.id, token: signUp.data.access_token };
    }
  }
  const signIn = await httpJson(`${apiUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey },
    body: { email, password },
  });
  if (signIn.status !== 200 || !signIn.data?.access_token || !signIn.data?.user?.id) {
    throw new Error(`auth_sign_in_failed:${signIn.category}`);
  }
  return { id: signIn.data.user.id, token: signIn.data.access_token };
};

const acceptanceExitCode = ({
  assertionFailures,
  scenarioFailures,
  scenarioNotRun,
}) =>
  assertionFailures === 0 && scenarioFailures === 0 && scenarioNotRun === 0
    ? 0
    : 1;

if (process.argv.includes("--self-test-required-scenario-gate")) {
  const gateCases = [
    [{ assertionFailures: 0, scenarioFailures: 0, scenarioNotRun: 0 }, 0],
    [{ assertionFailures: 1, scenarioFailures: 0, scenarioNotRun: 0 }, 1],
    [{ assertionFailures: 0, scenarioFailures: 1, scenarioNotRun: 0 }, 1],
    [{ assertionFailures: 0, scenarioFailures: 0, scenarioNotRun: 1 }, 1],
  ];
  for (const [input, expected] of gateCases) {
    if (acceptanceExitCode(input) !== expected) {
      throw new Error("required_scenario_gate_regression");
    }
  }
  fs.rmSync(privateDirectory, { recursive: true, force: true });
  console.log("HTTP required-scenario gate: 4/4 passed");
  process.exit(0);
}

const localConfig = fs.readFileSync(
  path.join(SUPABASE_WORKDIR, "supabase", "config.toml"),
  "utf8",
);
const localProjectId = localConfig.match(/^project_id\s*=\s*"([^"]+)"$/mu)?.[1] ?? "";
if (!/^[a-zA-Z0-9._-]{3,120}$/u.test(localProjectId)) {
  throw new Error("local_project_id_invalid");
}
const localDatabaseContainer = `supabase_db_${localProjectId}`;
const psql = (_dbUrl, sql) =>
  spawnChecked(
    "docker",
    [
      "exec",
      "-i",
      localDatabaseContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-f",
      "-",
    ],
    { input: sql },
  );

const restHeaders = (status, token) => ({
  apikey: status.anonKey,
  authorization: `Bearer ${token}`,
  prefer: "return=representation",
});
const serviceRestHeaders = (status) => ({
  apikey: status.serviceRoleKey,
  authorization: `Bearer ${status.serviceRoleKey}`,
  prefer: "return=representation",
});
const edgeHeaders = (status, token) => ({
  apikey: status.anonKey,
  authorization: `Bearer ${token}`,
});
const serviceEdgeHeaders = (status) => ({
  apikey: status.serviceRoleKey,
  authorization: `Bearer ${status.serviceRoleKey}`,
});

const restRpc = (status, rpc, body, headers) =>
  httpJson(`${status.apiUrl}/rest/v1/rpc/${rpc}`, { headers, body });
const restSelect = (status, path, headers) =>
  httpJson(`${status.apiUrl}/rest/v1/${path}`, { method: "GET", headers, expectJson: true });
const restInsert = (status, table, body, headers = serviceRestHeaders(status)) =>
  httpJson(`${status.apiUrl}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body,
  });
const restUpdate = (status, path, body, headers = serviceRestHeaders(status)) =>
  httpJson(`${status.apiUrl}/rest/v1/${path}`, {
    method: "PATCH",
    headers,
    body,
  });
const edgeCall = (status, fn, body, headers) =>
  httpJson(`${status.apiUrl}/functions/v1/${fn}`, { headers, body });

const requireSetupHttp = async (label, operation, expectedStatuses = [200, 201]) => {
  const response = await operation();
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${label}_failed:${response.category}`);
  }
  return response;
};

const ids = {
  project: uuidFrom("project"),
  task: uuidFrom("task"),
  constitution: uuidFrom("constitution"),
  constitutionVersion: uuidFrom("constitution-version"),
  deliberation: uuidFrom("deliberation"),
  evidencePacket: uuidFrom("evidence-packet"),
  proposal: uuidFrom("proposal"),
  decision: uuidFrom("decision"),
};

const sourceCommit = hex("5", 40);
const architectureGraphDigest = hex("6", 64);
const objectiveHash = hex("4", 64);
const planSnapshotHash = hex("6", 64);
const approvalScopeHash = hex("4", 64);
const budgetHash = hex("9", 64);
const testsHash = hex("8", 64);
const evaluatorRequirementHash = hex("9", 64);
const rollbackHash = hex("3", 64);
const decisionHash = hex("5", 64);
const branchName = `codex/cognitive-http-edge-${runId}`;
const switchKey = "cognitive_livekit_experience_sentinel_enabled";
const policyVersion = `http-proof-${runId}`;
const switchTargetHash = hash(`set_switch|${switchKey}|true|${policyVersion}`);
const requiredTestIds = ["two-party-http-proof"];

const approvalPayload = (key) => ({
  action: "record_owner_approval",
  approvalKey: key,
  approvalScopeHash,
  architectureGraphDigest,
  branchName,
  budgetHash,
  decisionManifestId: ids.decision,
  evaluatorRequirementHash,
  functionScopeHashes: [],
  maximumBytes: 1024,
  maximumCalls: 1,
  maximumCost: 1,
  maximumExecutions: 1,
  objectiveHash,
  operation: "set_switch",
  pathScopeHashes: [],
  planSnapshotHash,
  provider: "none",
  repositoryFullName: REPO,
  requiredTestIds,
  rollbackHash,
  sourceCommit,
  tableScopeHashes: [],
  targetResourceHash: switchTargetHash,
  testsHash,
});
const ownerApprovalRpcPayload = (key, validity = "24 hours") => ({
  p_decision_manifest_id: ids.decision,
  p_approval_key: key,
  p_objective_hash: objectiveHash,
  p_plan_snapshot_hash: planSnapshotHash,
  p_source_commit: sourceCommit,
  p_architecture_graph_digest: architectureGraphDigest,
  p_approval_scope_hash: approvalScopeHash,
  p_repository_full_name: REPO,
  p_branch_name: branchName,
  p_provider: "none",
  p_operation: "set_switch",
  p_target_resource_hash: switchTargetHash,
  p_path_scope_hashes: [],
  p_table_scope_hashes: [],
  p_function_scope_hashes: [],
  p_budget_hash: budgetHash,
  p_maximum_cost: 1,
  p_maximum_calls: 1,
  p_maximum_bytes: 1024,
  p_maximum_executions: 1,
  p_tests_hash: testsHash,
  p_required_test_ids: requiredTestIds,
  p_evaluator_requirement_hash: evaluatorRequirementHash,
  p_rollback_hash: rollbackHash,
  p_validity: validity,
});
const claimPayload = (approval) => ({
  action: "claim",
  approvalHash: approval.approvalHash,
  approvalVersionId: approval.approvalVersionId,
  branchName,
  budgetHash,
  decisionManifestHash: decisionHash,
  environment: "production",
  evaluatorRequirementHash,
  operation: "set_switch",
  planSnapshotHash,
  platform: "shared",
  projectId: ids.project,
  provider: "none",
  repositoryFullName: REPO,
  rollbackHash,
  targetResourceHash: switchTargetHash,
  taskId: ids.task,
  testsHash,
});

const expectHttp = async (name, expectedStatuses, operation, detail = {}) => {
  const response = await operation();
  const ok = expectedStatuses.includes(response.status);
  const observedError = typeof response.data?.error === "string" &&
      /^[a-z0-9_]{3,120}$/u.test(response.data.error)
    ? response.data.error
    : undefined;
  record(name, ok, expectedStatuses.map(statusCategory).join("|"), response.category, {
    ...detail,
    observedError,
  });
  return response;
};
const expectBody = (name, value, expected, detail = {}) => {
  const ok = value === expected;
  record(name, ok, expected, value, detail);
};

let functionServer = null;
try {
  const status = ensureSupabase();
  if (!SKIP_RESET) {
    const reset = spawnSync("supabase", ["db", "reset", "--local"], {
      cwd: SUPABASE_WORKDIR,
      env: SAFE_ENV,
      stdio: "ignore",
    });
    if (reset.status !== 0) {
      await waitFor(async () => {
        try {
          const postReset = readSupabaseStatus();
          return Boolean(
            postReset.apiUrl &&
            postReset.dbUrl &&
            postReset.anonKey &&
            postReset.serviceRoleKey
          );
        } catch {
          return false;
        }
      }, "supabase_db_reset_recovery", 30_000);
    }
  }
  Object.assign(status, readSupabaseStatus());

  const workerAssertion = `local-worker-assertion-${runId}-000000000000000000`;
  const evaluatorAssertion = `local-evaluator-assertion-${runId}-000000000000000`;
  const modelAssertion = `local-model-assertion-${runId}-0000000000000000000`;
  const workerInvoke = `local-worker-invoke-${runId}-00000000000000000000`;
  const evaluatorInvoke = `local-evaluator-invoke-${runId}-000000000000000000`;
  const cognitiveOperatorCredential =
    `local-cognitive-operator-${runId}-000000000000000000`;
  const cognitiveOperatorToken = signLocalServiceJwt(status.jwtSecret, {
    aud: "authenticated",
    cognitive_actor: "product_intelligence_operator",
    cognitive_service_credential: cognitiveOperatorCredential,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: "supabase-demo",
    role: "service_role",
  });
  const functionEnvironmentFile = path.join(privateDirectory, "function.env");
  fs.writeFileSync(
    functionEnvironmentFile,
    [
      `COGNITIVE_APPROVED_ACTION_WORKER_ASSERTION=${workerAssertion}`,
      `COGNITIVE_APPROVED_ACTION_WORKER_INVOKE_SHA256=${hash(workerInvoke)}`,
      `COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION=${evaluatorAssertion}`,
      `COGNITIVE_INDEPENDENT_EVALUATOR_INVOKE_SHA256=${hash(evaluatorInvoke)}`,
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
  fs.chmodSync(functionEnvironmentFile, 0o600);
  functionServer = spawn(
    "supabase",
    [
      "functions",
      "serve",
      "--no-verify-jwt",
      "--env-file",
      functionEnvironmentFile,
    ],
    {
    cwd: SUPABASE_WORKDIR,
    env: SAFE_ENV,
    stdio: "ignore",
    },
  );
  await waitFor(async () => {
    try {
      const probe = await edgeCall(status, FUNCTIONS[0], {}, {});
      return [401, 403].includes(probe.status);
    } catch {
      return false;
    }
  }, "edge_functions_ready");

  const password = `Local-only-proof-${runId}-password`;
  const owner = await setupLocalAuthUser(status, `owner-${runId}@local.invalid`, password);
  const nonOwner = await setupLocalAuthUser(status, `non-owner-${runId}@local.invalid`, password);
  const admin = await setupLocalAuthUser(status, `operator-${runId}@local.invalid`, password);
  const superAdmin = await setupLocalAuthUser(status, `super-admin-${runId}@local.invalid`, password);
  const recycled = await setupLocalAuthUser(status, `recycled-${runId}@local.invalid`, password);

  psql(status.dbUrl, `
    begin;
    insert into public.cognitive_projects(
      id, repository_full_name, source_state, activation_state,
      scheduler_state, production_authority
    ) values (
      ${quote(ids.project)}, ${quote(REPO)},
      'collective_governance_source_complete_not_deployed',
      'off', 'none', false
    );
    insert into public.intelligence_tasks(
      id, project_id, platform, environment, repository_full_name, branch_name,
      task_key, objective_hash, actor_identity, deadman_at
    ) values (
      ${quote(ids.task)}, ${quote(ids.project)}, 'shared', 'production',
      ${quote(REPO)}, ${quote(branchName)}, ${quote(`http-proof-${runId}`)},
      ${quote(objectiveHash)}, 'http-proof', transaction_timestamp()+interval '2 days'
    );
    insert into public.platform_role_memberships(user_id, email, role, status, notes)
    values
      (${quote(owner.id)}, null, 'owner', 'active', 'local-http-proof'),
      (${quote(admin.id)}, null, 'operator', 'active', 'local-http-proof'),
      (${quote(superAdmin.id)}, null, 'super_admin', 'active', 'local-http-proof'),
      (${quote(uuidFrom("old-owner"))}, ${quote(`recycled-${runId}@local.invalid`)}, 'owner', 'active', 'recycled-email-fixture');
    insert into public.autonomous_system_emergency_states(
      system_id, status, reason, updated_at, metadata
    ) values (
      'product_intelligence_operator', 'active',
      'local http proof active emergency state',
      transaction_timestamp(), '{"fixture":true}'::jsonb
    )
    on conflict (system_id) do update
    set status=excluded.status, updated_at=excluded.updated_at, metadata=excluded.metadata;
    insert into public.cognitive_service_identities(
      service_identity, credential_hash, status, expires_at
    ) values (
      'product_intelligence_operator',
      ${quote(hash(cognitiveOperatorCredential))},
      'active',
      transaction_timestamp()+interval '1 day'
    );
    insert into public.governance_constitutions(
      id, task_id, project_id, platform, environment, constitution_key, title,
      current_version, status, created_by_identity
    ) values (
      ${quote(ids.constitution)}, ${quote(ids.task)}, ${quote(ids.project)},
      'shared','production', ${quote(`http-constitution-${runId}`)},
      'HTTP Two Party Proof', 1, 'active', 'http-proof'
    );
    insert into public.governance_constitution_versions(
      id, constitution_id, task_id, project_id, platform, environment,
      version_number, constitution_hash, policy_snapshot, status,
      proposed_by_identity, independent_review_hash, owner_approved_by,
      owner_approved_at, activation_not_before, rollback_hash
    ) values (
      ${quote(ids.constitutionVersion)}, ${quote(ids.constitution)},
      ${quote(ids.task)}, ${quote(ids.project)}, 'shared','production', 1,
      ${quote(hex("1", 64))}, '{"activation":"off","twoParty":true}'::jsonb,
      'active', 'http-proof', ${quote(hex("2", 64))}, ${quote(owner.id)},
      transaction_timestamp(), transaction_timestamp()-interval '1 minute',
      ${quote(rollbackHash)}
    );
    insert into public.governance_deliberations(
      id, task_id, project_id, platform, environment, constitution_version_id,
      deliberation_key, objective_hash, source_commit, architecture_graph_digest,
      risk_level, status, required_quorum, budget_ceiling, deadline_at, decided_at
    ) values (
      ${quote(ids.deliberation)}, ${quote(ids.task)}, ${quote(ids.project)},
      'shared','production', ${quote(ids.constitutionVersion)},
      ${quote(`http-deliberation-${runId}`)}, ${quote(objectiveHash)},
      ${quote(sourceCommit)}, ${quote(architectureGraphDigest)}, 'low',
      'decided', 3, 1, transaction_timestamp()+interval '2 days',
      transaction_timestamp()
    );
    insert into public.governance_evidence_packets(
      id, deliberation_id, task_id, project_id, platform, environment,
      packet_hash, source_commit, architecture_graph_digest, research_claim_hashes,
      provider_state_hash, known_unknowns, approval_level, budget_hash,
      rollback_requirements_hash, freshness_deadline
    ) values (
      ${quote(ids.evidencePacket)}, ${quote(ids.deliberation)},
      ${quote(ids.task)}, ${quote(ids.project)}, 'shared','production',
      ${quote(hex("7", 64))}, ${quote(sourceCommit)},
      ${quote(architectureGraphDigest)}, '{}'::text[], ${quote(hex("8", 64))},
      '{"fixture":"safe"}'::jsonb, 'owner', ${quote(budgetHash)},
      ${quote(rollbackHash)}, transaction_timestamp()+interval '1 day'
    );
    insert into public.governance_proposals(
      id, deliberation_id, task_id, project_id, platform, environment,
      option_kind, proposal_hash, user_value_score, risk_score, reversibility,
      cost_estimate, proof_burden, rollback_hash
    ) values (
      ${quote(ids.proposal)}, ${quote(ids.deliberation)}, ${quote(ids.task)},
      ${quote(ids.project)}, 'shared','production', 'minimal_repair',
      ${quote(hex("b", 64))}, 10, 1, 'full', 0, 'source',
      ${quote(rollbackHash)}
    );
    insert into public.governance_model_execution_attestations(
      assessment_id, task_id, project_id, platform, environment, council_role,
      provider_identity_hash, model_family, model_version,
      execution_identity_hash, evidence_packet_hash,
      prompt_template_version_hash, output_hash, blind_first_round,
      correlation_class, cost, latency_ms
    ) values
      (
        ${quote(`deliberation-${hash(ids.deliberation)}`)},
        ${quote(ids.task)}, ${quote(ids.project)}, 'shared', 'production',
        'product_user_experience', ${quote(hex("a", 64))},
        'family-a', 'model-a', ${quote(hex("b", 64))},
        ${quote(hex("c", 64))}, ${quote(hex("d", 64))},
        ${quote(hex("e", 64))}, true, 'cross_provider', 0.1, 100
      ),
      (
        ${quote(`deliberation-${hash(ids.deliberation)}`)},
        ${quote(ids.task)}, ${quote(ids.project)}, 'shared', 'production',
        'security_privacy', ${quote(hex("b", 64))},
        'family-b', 'model-b', ${quote(hex("c", 64))},
        ${quote(hex("d", 64))}, ${quote(hex("e", 64))},
        ${quote(hex("f", 64))}, true, 'cross_provider', 0.1, 100
      ),
      (
        ${quote(`deliberation-${hash(ids.deliberation)}`)},
        ${quote(ids.task)}, ${quote(ids.project)}, 'shared', 'production',
        'reliability_release', ${quote(hex("c", 64))},
        'family-c', 'model-c', ${quote(hex("d", 64))},
        ${quote(hex("e", 64))}, ${quote(hex("f", 64))},
        ${quote(hex("a", 64))}, true, 'cross_provider', 0.1, 100
      );
    -- The retention gate intentionally blocks new collective decisions while
    -- provider-output retention is unavailable. This HTTP harness exercises
    -- the already-reviewed downstream two-party contract against a
    -- pre-existing finalized decision; the retention gate itself remains
    -- covered by its dedicated pgTAP and activation-hold suites.
    set local session_replication_role = replica;
    insert into public.governance_decision_manifests(
      id, deliberation_id, evidence_packet_id, selected_proposal_id, task_id,
      project_id, platform, environment, decision_key, source_commit,
      architecture_graph_digest, evidence_manifest_hash, research_claim_hashes,
      selected_option_hash, rejected_option_hashes, council_attestation_hash,
      votes_hash, vetoes_hash, dissent_hash, stakeholder_impact_hash, risk_level,
      required_test_ids, capability_scope_hash, budget_hash, maximum_executions,
      rollback_hash, decision_hash, status, expires_at, finalized_at,
      model_independence_assessment_id, model_independence_status,
      model_independence_evidence_hash
    ) values (
      ${quote(ids.decision)}, ${quote(ids.deliberation)},
      ${quote(ids.evidencePacket)}, ${quote(ids.proposal)},
      ${quote(ids.task)}, ${quote(ids.project)}, 'shared','production',
      ${quote(`http-decision-${runId}`)}, ${quote(sourceCommit)},
      ${quote(architectureGraphDigest)}, ${quote(hex("c", 64))},
      '{}'::text[], ${quote(hex("d", 64))}, '{}'::text[],
      ${quote(hex("e", 64))}, ${quote(hex("f", 64))},
      ${quote(hex("1", 64))}, ${quote(hex("2", 64))},
      ${quote(hex("3", 64))}, 'low', ${asArray(requiredTestIds)},
      ${quote(approvalScopeHash)}, ${quote(budgetHash)}, 1,
      ${quote(rollbackHash)}, ${quote(decisionHash)}, 'finalized',
      transaction_timestamp()+interval '1 day', transaction_timestamp(),
      ${quote(`deliberation-${hash(ids.deliberation)}`)}, 'MODEL_INDEPENDENCE_VERIFIED',
      ${quote(hash(`model-independence:${runId}`))}
    );
    set local session_replication_role = origin;
    commit;
  `);

  await expectHttp("anon owner approval denied by Edge JWT gate", [401, 403], () =>
    edgeCall(status, FUNCTIONS[0], approvalPayload(`anon-${runId}`), { apikey: status.anonKey }));
  await expectHttp("anonymous worker execution is rejected", [401], () =>
    edgeCall(status, FUNCTIONS[1], { action: "claim" }, { apikey: status.anonKey }));
  await expectHttp("non-owner authenticated user cannot record Owner approval", [400, 409], () =>
    edgeCall(status, FUNCTIONS[0], approvalPayload(`nonowner-${runId}`), edgeHeaders(status, nonOwner.token)));
  await expectHttp("scoped Admin/operator cannot record Owner approval", [400, 409], () =>
    edgeCall(status, FUNCTIONS[0], approvalPayload(`operator-${runId}`), edgeHeaders(status, admin.token)));
  await expectHttp("super-admin cannot record Owner approval", [400, 409], () =>
    edgeCall(status, FUNCTIONS[0], approvalPayload(`super-admin-${runId}`), edgeHeaders(status, superAdmin.token)));
  await expectHttp("recycled email without matching owner user_id cannot approve", [400, 409], () =>
    edgeCall(status, FUNCTIONS[0], approvalPayload(`recycled-${runId}`), edgeHeaders(status, recycled.token)));

  await expectHttp("Owner registers approved-action worker service assertion over PostgREST", [200], () =>
    restRpc(status, "governance_register_two_party_service_principal", {
      p_service_identity: "cognitive_approved_action_worker",
      p_assertion_hash: hash(workerAssertion),
      p_allowed_operations: ["set_switch"],
      p_expires_at: nowPlus(1440),
    }, restHeaders(status, owner.token)));
  await expectHttp("Owner registers independent evaluator service assertion over PostgREST", [200], () =>
    restRpc(status, "governance_register_two_party_service_principal", {
      p_service_identity: "cognitive_independent_evaluator",
      p_assertion_hash: hash(evaluatorAssertion),
      p_allowed_operations: ["independent_evaluation"],
      p_expires_at: nowPlus(1440),
    }, restHeaders(status, owner.token)));
  await expectHttp("scoped Admin/operator cannot register service principal", [401, 403], () =>
    restRpc(status, "governance_register_two_party_service_principal", {
      p_service_identity: "cognitive_approved_action_worker",
      p_assertion_hash: hash("operator-attempt"),
      p_allowed_operations: ["set_switch"],
      p_expires_at: nowPlus(1440),
    }, restHeaders(status, admin.token)));
  for (const [name, action] of [
    ["independent evaluator cannot claim through evaluator endpoint", "claim"],
    ["independent evaluator cannot execute through evaluator endpoint", "execute_switch"],
    ["independent evaluator cannot complete through evaluator endpoint", "complete"],
  ]) {
    await expectHttp(name, [400], () =>
      edgeCall(status, FUNCTIONS[2], {
        action,
        executionId: uuidFrom(`evaluator-${action}`),
      }, {
        ...serviceEdgeHeaders(status),
        "x-cognitive-evaluator-invocation": evaluatorInvoke,
      }));
  }

  const approvalResponse = await expectHttp("exact Owner records approval through Edge Function", [200], () =>
    edgeCall(status, FUNCTIONS[0], approvalPayload(`main-${runId}`), edgeHeaders(status, owner.token)));
  const approval = approvalResponse.status === 200
    ? approvalResponse.data
    : (await requireSetupHttp("owner_postgrest_approval_fixture", () =>
      restRpc(
        status,
        "governance_record_owner_approval",
        ownerApprovalRpcPayload(`main-fallback-${runId}`),
        restHeaders(status, owner.token),
      ), [200])).data;
  expectBody("Owner approval HTTP fixture state is active", approval?.status, "active");

  await expectHttp("Owner-authenticated PostgREST caller cannot execute approved action", [401, 403, 404], () =>
    restRpc(status, "governance_claim_approved_action", {
      p_approval_version_id: approval.approvalVersionId,
      p_service_identity: "cognitive_approved_action_worker",
      p_worker_assertion: workerAssertion,
      p_decision_manifest_hash: decisionHash,
      p_plan_snapshot_hash: planSnapshotHash,
      p_approval_hash: approval.approvalHash,
      p_task_id: ids.task,
      p_project_id: ids.project,
      p_repository_full_name: REPO,
      p_branch_name: branchName,
      p_platform: "shared",
      p_environment: "production",
      p_provider: "none",
      p_operation: "set_switch",
      p_target_resource_hash: switchTargetHash,
      p_budget_hash: budgetHash,
      p_tests_hash: testsHash,
      p_evaluator_requirement_hash: evaluatorRequirementHash,
      p_rollback_hash: rollbackHash,
    }, restHeaders(status, owner.token)));
  await expectHttp("worker/service-role PostgREST caller cannot record Owner approval", [401, 403, 404], () =>
    restRpc(status, "governance_record_owner_approval", {}, serviceRestHeaders(status)));
  await expectHttp("worker Edge call without invocation header is rejected", [401], () =>
    edgeCall(status, FUNCTIONS[1], claimPayload(approval), serviceEdgeHeaders(status)));
  await expectHttp("worker Edge call with wrong invocation header is rejected", [401], () =>
    edgeCall(status, FUNCTIONS[1], claimPayload(approval), {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": `wrong-${runId}`,
    }));
  await expectHttp("no-approval claim is rejected", [409], () =>
    edgeCall(status, FUNCTIONS[1], {
      ...claimPayload({
        approvalVersionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        approvalHash: hex("a", 64),
      }),
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  for (const [name, changedBinding] of [
    ["wrong evaluator-requirement hash claim is rejected", { evaluatorRequirementHash: hex("a", 64) }],
    ["wrong decision manifest hash claim is rejected", { decisionManifestHash: hex("a", 64) }],
    ["wrong plan snapshot hash claim is rejected", { planSnapshotHash: hex("a", 64) }],
    ["wrong task binding claim is rejected", { taskId: uuidFrom("wrong-task") }],
    ["wrong project binding claim is rejected", { projectId: uuidFrom("wrong-project") }],
    ["wrong repository binding claim is rejected", { repositoryFullName: "Chillywood2025/not-mobile" }],
    ["wrong branch binding claim is rejected", { branchName: `codex/wrong-scope-${runId}` }],
    ["wrong platform binding claim is rejected", { platform: "android" }],
    ["wrong environment binding claim is rejected", { environment: "preview" }],
    ["wrong provider binding claim is rejected", { provider: "internal" }],
    ["wrong operation binding claim is rejected", { operation: "read_switch" }],
    ["wrong target binding claim is rejected", { targetResourceHash: hex("a", 64) }],
  ]) {
    await expectHttp(name, [409], () =>
      edgeCall(status, FUNCTIONS[1], {
        ...claimPayload(approval),
        ...changedBinding,
      }, {
        ...serviceEdgeHeaders(status),
        "x-cognitive-worker-invocation": workerInvoke,
      }));
  }
  await expectHttp("wrong approval hash claim is rejected", [409], () =>
    edgeCall(status, FUNCTIONS[1], {
      ...claimPayload(approval),
      approvalHash: hex("a", 64),
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  const claimResponse = await expectHttp("approved-action worker claims approval through Edge Function", [200], () =>
    edgeCall(status, FUNCTIONS[1], claimPayload(approval), {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  const executionId = claimResponse.data?.executionId;
  expectBody("worker claim response state is claimed", claimResponse.data?.state, "claimed");
  await expectHttp("consumed approval replay claim is rejected", [409], () =>
    edgeCall(status, FUNCTIONS[1], claimPayload(approval), {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  await expectHttp("invalid begin transition from claimed to executing is rejected", [409], () =>
    edgeCall(status, FUNCTIONS[1], { action: "begin", executionId, nextState: "executing" }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  await expectHttp("worker begins preflight", [200], () =>
    edgeCall(status, FUNCTIONS[1], { action: "begin", executionId, nextState: "preflight" }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  await expectHttp("duplicate preflight replay is rejected", [409], () =>
    edgeCall(status, FUNCTIONS[1], { action: "begin", executionId, nextState: "preflight" }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  await expectHttp("worker begins executing", [200], () =>
    edgeCall(status, FUNCTIONS[1], { action: "begin", executionId, nextState: "executing" }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  await expectHttp("worker cannot record evaluator proof via worker endpoint", [400], () =>
    edgeCall(status, FUNCTIONS[1], { action: "record_evaluator_proof", executionId }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  await expectHttp("independent evaluator cannot proof before postflight/evaluating", [409], () =>
    edgeCall(status, FUNCTIONS[2], {
      action: "record_evaluator_proof",
      executionId,
      executionReceiptHash: hex("b", 64),
      evaluatorProofHash: hex("c", 64),
      verdict: "passed",
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-evaluator-invocation": evaluatorInvoke,
    }));
  await expectHttp("wrong switch target binding is rejected", [409], () =>
    edgeCall(status, FUNCTIONS[1], {
      action: "execute_switch",
      executionId,
      switchKey,
      enabled: true,
      policyVersion: `wrong-${runId}`,
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  await expectHttp("worker stages switch but does not make it live", [200], () =>
    edgeCall(status, FUNCTIONS[1], {
      action: "execute_switch",
      executionId,
      switchKey,
      enabled: true,
      policyVersion,
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  const preProofSwitchRows = await restSelect(
    status,
    `cognitive_governance_switches?task_id=eq.${ids.task}&switch_key=eq.${switchKey}&select=enabled`,
    serviceRestHeaders(status),
  );
  expectBody("staged switch is not live before evaluator proof", preProofSwitchRows.data?.length ?? -1, 0);
  await expectHttp("worker cannot complete before evaluator proof", [409], () =>
    edgeCall(status, FUNCTIONS[1], {
      action: "complete",
      executionId,
      executionReceiptHash: hex("b", 64),
      evaluatorProofHash: hex("c", 64),
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  await expectHttp("independent evaluator proof missing invocation header is rejected", [401], () =>
    edgeCall(status, FUNCTIONS[2], {
      action: "record_evaluator_proof",
      executionId,
      executionReceiptHash: hex("b", 64),
      evaluatorProofHash: hex("c", 64),
      verdict: "passed",
    }, serviceEdgeHeaders(status)));
  await expectHttp("independent evaluator proof before evaluating is rejected", [409], () =>
    edgeCall(status, FUNCTIONS[2], {
      action: "record_evaluator_proof",
      executionId,
      executionReceiptHash: hex("b", 64),
      evaluatorProofHash: hex("c", 64),
      verdict: "passed",
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-evaluator-invocation": evaluatorInvoke,
    }));
  await expectHttp("worker begins evaluating after postflight", [200], () =>
    edgeCall(status, FUNCTIONS[1], { action: "begin", executionId, nextState: "evaluating" }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  const receiptHash = hex("b", 64);
  const proofHash = hex("c", 64);
  await expectHttp("independent evaluator records passed proof", [200], () =>
    edgeCall(status, FUNCTIONS[2], {
      action: "record_evaluator_proof",
      executionId,
      executionReceiptHash: receiptHash,
      evaluatorProofHash: proofHash,
      verdict: "passed",
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-evaluator-invocation": evaluatorInvoke,
    }));
  await expectHttp("completion with wrong receipt hash is rejected", [409], () =>
    edgeCall(status, FUNCTIONS[1], {
      action: "complete",
      executionId,
      executionReceiptHash: hex("a", 64),
      evaluatorProofHash: proofHash,
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  await expectHttp("completion with wrong proof hash is rejected", [409], () =>
    edgeCall(status, FUNCTIONS[1], {
      action: "complete",
      executionId,
      executionReceiptHash: receiptHash,
      evaluatorProofHash: hex("d", 64),
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  await expectHttp("worker completes after passed independent proof", [200], () =>
    edgeCall(status, FUNCTIONS[1], {
      action: "complete",
      executionId,
      executionReceiptHash: receiptHash,
      evaluatorProofHash: proofHash,
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  const liveSwitchRows = await restSelect(
    status,
    `cognitive_governance_switches?task_id=eq.${ids.task}&switch_key=eq.${switchKey}&select=enabled,policy_version`,
    serviceRestHeaders(status),
  );
  expectBody("completed proof makes staged switch live", liveSwitchRows.data?.[0]?.enabled, true);
  await expectHttp("completion replay is rejected", [409], () =>
    edgeCall(status, FUNCTIONS[1], {
      action: "complete",
      executionId,
      executionReceiptHash: receiptHash,
      evaluatorProofHash: proofHash,
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));

  const approve = async (label) => {
    const response = await restRpc(
      status,
      "governance_record_owner_approval",
      ownerApprovalRpcPayload(`${label}-${runId}`),
      restHeaders(status, owner.token),
    );
    if (response.status !== 200) throw new Error(`approval_fixture_failed:${label}:${response.category}`);
    return response.data;
  };
  const claim = (approvalValue) => edgeCall(status, FUNCTIONS[1], claimPayload(approvalValue), {
    ...serviceEdgeHeaders(status),
    "x-cognitive-worker-invocation": workerInvoke,
  });
  const workerCall = (payload) => edgeCall(status, FUNCTIONS[1], payload, {
    ...serviceEdgeHeaders(status),
    "x-cognitive-worker-invocation": workerInvoke,
  });
  const evaluatorCall = (payload) => edgeCall(status, FUNCTIONS[2], payload, {
    ...serviceEdgeHeaders(status),
    "x-cognitive-evaluator-invocation": evaluatorInvoke,
  });
  const prepareStagedExecution = async (label, stageCaseName) => {
    const approvalValue = await approve(label);
    const claimResponseValue = await requireSetupHttp(
      `${label}_claim_fixture`,
      () => claim(approvalValue),
      [200],
    );
    const executionIdValue = claimResponseValue.data?.executionId;
    await requireSetupHttp(`${label}_preflight_fixture`, () =>
      workerCall({
        action: "begin",
        executionId: executionIdValue,
        nextState: "preflight",
      }), [200]);
    await requireSetupHttp(`${label}_executing_fixture`, () =>
      workerCall({
        action: "begin",
        executionId: executionIdValue,
        nextState: "executing",
      }), [200]);
    await expectHttp(stageCaseName, [200], () =>
      workerCall({
        action: "execute_switch",
        executionId: executionIdValue,
        switchKey,
        enabled: true,
        policyVersion,
      }));
    return { approval: approvalValue, executionId: executionIdValue };
  };
  const prepareEvaluatedSideEffect = async (label, stageCaseName) => {
    const staged = await prepareStagedExecution(label, stageCaseName);
    await requireSetupHttp(`${label}_evaluating_fixture`, () =>
      workerCall({
        action: "begin",
        executionId: staged.executionId,
        nextState: "evaluating",
      }), [200]);
    const executionReceiptHash = hash(`${label}:receipt:${runId}`);
    const evaluatorProofHash = hash(`${label}:proof:${runId}`);
    await requireSetupHttp(`${label}_evaluator_fixture`, () =>
      evaluatorCall({
        action: "record_evaluator_proof",
        executionId: staged.executionId,
        executionReceiptHash,
        evaluatorProofHash,
        verdict: "passed",
      }), [200]);
    return { ...staged, evaluatorProofHash, executionReceiptHash };
  };
  const rollbackTransition = (executionIdValue, transition, evidenceHash) =>
    workerCall({
      action: "release_or_quarantine",
      executionId: executionIdValue,
      transition,
      evidenceHash,
    });

  const revokedApproval = await approve("revoked");
  await expectHttp("Owner revokes approval through PostgREST", [200], () =>
    restRpc(status, "governance_revoke_owner_approval", {
      p_approval_version_id: revokedApproval.approvalVersionId,
      p_reason_hash: hash(`revoked:${runId}`),
    }, restHeaders(status, owner.token)));
  await expectHttp("revoked approval cannot be claimed", [409], () => claim(revokedApproval));

  const expiredResponse = await requireSetupHttp("expired_approval_fixture", () =>
    restRpc(
      status,
      "governance_record_owner_approval",
      ownerApprovalRpcPayload(`expired-${runId}`, "1 second"),
      restHeaders(status, owner.token),
    ), [200]);
  const expiredApproval = expiredResponse.data;
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  await expectHttp("expired approval cannot be claimed", [409], () => claim(expiredApproval));
  await expectHttp("widened renewal with changed plan snapshot is rejected", [400, 409], () =>
    restRpc(status, "governance_revalidate_owner_approval", {
      p_expired_version_id: expiredApproval.approvalVersionId,
      p_revalidation_hash: hash(`widened-renewal:${runId}`),
      p_current_decision_manifest_hash: decisionHash,
      p_current_source_commit: sourceCommit,
      p_current_plan_snapshot_hash: hex("a", 64),
      p_material_delta: false,
    }, restHeaders(status, owner.token)));
  await expectHttp("amended-scope/material-delta revalidation is rejected", [400, 409], () =>
    restRpc(status, "governance_revalidate_owner_approval", {
      p_expired_version_id: expiredApproval.approvalVersionId,
      p_revalidation_hash: hash(`material-delta:${runId}`),
      p_current_decision_manifest_hash: decisionHash,
      p_current_source_commit: sourceCommit,
      p_current_plan_snapshot_hash: planSnapshotHash,
      p_material_delta: true,
    }, restHeaders(status, owner.token)));
  const renewal = await expectHttp("expired unchanged approval can be reinstated by Owner", [200], () =>
    restRpc(status, "governance_revalidate_owner_approval", {
      p_expired_version_id: expiredApproval.approvalVersionId,
      p_revalidation_hash: hash(`renewal:${runId}`),
      p_current_decision_manifest_hash: decisionHash,
      p_current_source_commit: sourceCommit,
      p_current_plan_snapshot_hash: planSnapshotHash,
      p_material_delta: false,
    }, restHeaders(status, owner.token)));
  expectBody(
    "reinstatement creates a distinct immutable approval version",
    renewal.data?.approvalVersionId !== expiredApproval.approvalVersionId,
    true,
  );
  await expectHttp("superseded/old approval version cannot be claimed after renewal", [409], () => claim(expiredApproval));
  await expectHttp("renewed approval version can be claimed once", [200], () => claim({
    ...expiredApproval,
    approvalVersionId: renewal.data?.approvalVersionId,
    approvalHash: renewal.data?.approvalHash,
  }));

  const emergencyApproval = await approve("emergency");
  await requireSetupHttp("emergency_stop_fixture", () =>
    restUpdate(
      status,
      "autonomous_system_emergency_states?system_id=eq.product_intelligence_operator",
      { status: "emergency_stop", updated_at: new Date().toISOString() },
    ));
  await expectHttp("emergency stop blocks worker claim", [409], () => claim(emergencyApproval));
  await requireSetupHttp("emergency_active_fixture", () =>
    restUpdate(
      status,
      "autonomous_system_emergency_states?system_id=eq.product_intelligence_operator",
      { status: "active", updated_at: new Date().toISOString() },
    ));

  const cancellationApproval = await approve("cancelled");
  psql(status.dbUrl, `
    update public.intelligence_tasks
    set cancelled_at = transaction_timestamp()
    where id = ${quote(ids.task)};
  `);
  await expectHttp("cancelled task blocks worker claim", [409], () => claim(cancellationApproval));
  psql(status.dbUrl, `
    update public.intelligence_tasks
    set cancelled_at = null
    where id = ${quote(ids.task)};
  `);

  const lateCancellationApproval = await approve("late-cancelled");
  const lateCancellationClaim = await requireSetupHttp(
    "late_cancellation_claim_fixture",
    () => claim(lateCancellationApproval),
    [200],
  );
  const lateCancellationExecutionId = lateCancellationClaim.data?.executionId;
  await requireSetupHttp("late_cancellation_preflight_fixture", () =>
    edgeCall(status, FUNCTIONS[1], {
      action: "begin",
      executionId: lateCancellationExecutionId,
      nextState: "preflight",
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }), [200]);
  await requireSetupHttp("late_cancellation_executing_fixture", () =>
    edgeCall(status, FUNCTIONS[1], {
      action: "begin",
      executionId: lateCancellationExecutionId,
      nextState: "executing",
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }), [200]);
  psql(status.dbUrl, `
    update public.intelligence_tasks
    set cancelled_at = transaction_timestamp()
    where id = ${quote(ids.task)};
  `);
  await expectHttp("cancelled task blocks claimed execution result", [409], () =>
    edgeCall(status, FUNCTIONS[1], {
      action: "execute_switch",
      executionId: lateCancellationExecutionId,
      switchKey,
      enabled: true,
      policyVersion,
    }, {
      ...serviceEdgeHeaders(status),
      "x-cognitive-worker-invocation": workerInvoke,
    }));
  psql(status.dbUrl, `
    update public.intelligence_tasks
    set cancelled_at = null
    where id = ${quote(ids.task)};
  `);

  const concurrentApproval = await approve("concurrent");
  const concurrentResults = await Promise.all([claim(concurrentApproval), claim(concurrentApproval)]);
  const concurrent2xx = concurrentResults.filter((result) => result.status === 200).length;
  const concurrent409 = concurrentResults.filter((result) => result.status === 409).length;
  record(
    "concurrent claim on single-use approval yields one success and one rejection",
    concurrent2xx === 1 && concurrent409 === 1,
    "MATCH",
    concurrent2xx === 1 && concurrent409 === 1 ? "MATCH" : "MISMATCH",
    { observedCategory: `success_${concurrent2xx}_reject_${concurrent409}` },
  );

  const revokedAfterSideEffect = await prepareEvaluatedSideEffect(
    "revoked-after-side-effect",
    "post-side-effect Owner revocation stages an operation",
  );
  await expectHttp("Owner revokes approval after staged side effect", [200], () =>
    restRpc(status, "governance_revoke_owner_approval", {
      p_approval_version_id: revokedAfterSideEffect.approval.approvalVersionId,
      p_reason_hash: hash(`revoked-after-side-effect:${runId}`),
    }, restHeaders(status, owner.token)));
  await expectHttp("post-side-effect Owner revocation blocks completion", [409], () =>
    workerCall({
      action: "complete",
      executionId: revokedAfterSideEffect.executionId,
      executionReceiptHash: revokedAfterSideEffect.executionReceiptHash,
      evaluatorProofHash: revokedAfterSideEffect.evaluatorProofHash,
    }));
  await expectHttp("post-side-effect Owner revocation permits quarantine cleanup", [200], () =>
    rollbackTransition(
      revokedAfterSideEffect.executionId,
      "quarantined",
      hash(`revocation-cleanup:${runId}`),
    ));

  const emergencyAfterSideEffect = await prepareEvaluatedSideEffect(
    "emergency-after-side-effect",
    "post-side-effect emergency stop stages an operation",
  );
  await expectHttp("emergency stop activates after staged side effect", [200, 204], () =>
    restUpdate(
      status,
      "autonomous_system_emergency_states?system_id=eq.product_intelligence_operator",
      { status: "emergency_stop", updated_at: new Date().toISOString() },
    ));
  await expectHttp("post-side-effect emergency stop blocks completion", [409], () =>
    workerCall({
      action: "complete",
      executionId: emergencyAfterSideEffect.executionId,
      executionReceiptHash: emergencyAfterSideEffect.executionReceiptHash,
      evaluatorProofHash: emergencyAfterSideEffect.evaluatorProofHash,
    }));
  await expectHttp("post-side-effect emergency stop permits quarantine cleanup", [200], () =>
    rollbackTransition(
      emergencyAfterSideEffect.executionId,
      "quarantined",
      hash(`emergency-cleanup:${runId}`),
    ));
  await requireSetupHttp("post_side_effect_emergency_reset_fixture", () =>
    restUpdate(
      status,
      "autonomous_system_emergency_states?system_id=eq.product_intelligence_operator",
      { status: "active", updated_at: new Date().toISOString() },
    ), [200, 204]);

  const successfulRollback = await prepareStagedExecution(
    "successful-rollback",
    "successful rollback stages an operation",
  );
  await expectHttp("successful rollback enters rollback pending", [200], () =>
    rollbackTransition(
      successfulRollback.executionId,
      "rollback_pending",
      hash(`successful-rollback-pending:${runId}`),
    ));
  await expectHttp("successful rollback enters rollback running", [200], () =>
    rollbackTransition(
      successfulRollback.executionId,
      "rollback_running",
      hash(`successful-rollback-running:${runId}`),
    ));
  await expectHttp("successful rollback completes", [200], () =>
    rollbackTransition(
      successfulRollback.executionId,
      "rollback_succeeded",
      hash(`successful-rollback-complete:${runId}`),
    ));
  const successfulRollbackAuthority = await restSelect(
    status,
    `governance_owner_approval_version_states?approval_version_id=eq.${successfulRollback.approval.approvalVersionId}&select=state`,
    serviceRestHeaders(status),
  );
  expectBody(
    "successful rollback marks approval authority rolled back",
    successfulRollbackAuthority.data?.[0]?.state,
    "rolled_back",
  );
  await expectHttp("successful rollback blocks old write authority", [409], () =>
    workerCall({
      action: "execute_switch",
      executionId: successfulRollback.executionId,
      switchKey,
      enabled: true,
      policyVersion,
    }));

  const failedRollback = await prepareStagedExecution(
    "failed-rollback",
    "failed rollback stages an operation",
  );
  await expectHttp("failed rollback enters rollback pending", [200], () =>
    rollbackTransition(
      failedRollback.executionId,
      "rollback_pending",
      hash(`failed-rollback-pending:${runId}`),
    ));
  await expectHttp("failed rollback enters rollback running", [200], () =>
    rollbackTransition(
      failedRollback.executionId,
      "rollback_running",
      hash(`failed-rollback-running:${runId}`),
    ));
  const failedRollbackEvidenceHash = hash(`failed-rollback-evidence:${runId}`);
  await expectHttp("worker records failed rollback evidence", [200], () =>
    rollbackTransition(
      failedRollback.executionId,
      "rollback_failed",
      failedRollbackEvidenceHash,
    ));
  psql(status.dbUrl, `
    update public.intelligence_tasks
    set status = 'rollback_running',
        cancelled_at = null,
        quarantined_at = null,
        updated_at = transaction_timestamp()
    where id = ${quote(ids.task)};
  `);
  const failedRollbackTaskTransition = await expectHttp(
    "failed rollback transition quarantines task",
    [200],
    () => restRpc(status, "cognitive_transition_task", {
      p_task_id: ids.task,
      p_project_id: ids.project,
      p_platform: "shared",
      p_environment: "production",
      p_expected: "rollback_running",
      p_next: "rollback_failed",
      p_actor_identity: "product_intelligence_operator",
      p_transition_hash: failedRollbackEvidenceHash,
      p_approval_request_id: null,
      p_snapshot_hash: null,
    }, restHeaders(status, cognitiveOperatorToken)),
  );
  expectBody(
    "failed rollback task readback is quarantined",
    failedRollbackTaskTransition.data,
    "quarantined",
  );
  const failedRollbackFindings = await restSelect(
    status,
    `cognitive_current_findings?task_id=eq.${ids.task}&finding_key=eq.rollback-failed-quarantine&select=severity,current_status`,
    serviceRestHeaders(status),
  );
  expectBody(
    "failed rollback creates P1 finding",
    failedRollbackFindings.data?.[0]?.severity,
    "p1",
  );
  const failedRollbackEscalations = await restSelect(
    status,
    `cognitive_owner_review_requests?task_id=eq.${ids.task}&request_type=eq.rollback_failed&select=request_status`,
    serviceRestHeaders(status),
  );
  expectBody(
    "failed rollback creates pending Owner escalation",
    failedRollbackEscalations.data?.[0]?.request_status,
    "pending",
  );
} catch (error) {
  record("harness setup/runtime", false, "PASS", `FAIL:${scrub(error.message)}`);
} finally {
  if (functionServer) {
    functionServer.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!functionServer.killed) functionServer.kill("SIGKILL");
  }
  fs.rmSync(privateDirectory, { recursive: true, force: true });
}

for (const testCase of cases) {
  const suffix = [
    testCase.observedCategory,
    testCase.observedError ? `error_${testCase.observedError}` : "",
  ].filter(Boolean).join(" ");
  console.log(`${testCase.result} ${testCase.name} expected=${testCase.expected} observed=${testCase.observed}${suffix}`);
}
console.log(`SUMMARY PASS=${passed} FAIL=${failed} TOTAL=${passed + failed}`);
let scenarioPassed = 0;
let scenarioFailed = 0;
let scenarioNotRun = 0;
const casesByName = new Map(cases.map((testCase) => [testCase.name, testCase]));
for (const [id, description, requiredCaseNames] of REQUIRED_HTTP_SCENARIOS) {
  if (!requiredCaseNames) {
    scenarioNotRun += 1;
    console.log(`SCENARIO NOT_RUN ${String(id).padStart(2, "0")} ${description}`);
    continue;
  }
  const requiredCases = requiredCaseNames.map((name) => casesByName.get(name));
  if (requiredCases.some((testCase) => !testCase)) {
    scenarioNotRun += 1;
    console.log(`SCENARIO NOT_RUN ${String(id).padStart(2, "0")} ${description}`);
    continue;
  }
  if (requiredCases.every((testCase) => testCase.result === "PASS")) {
    scenarioPassed += 1;
    console.log(`SCENARIO PASS ${String(id).padStart(2, "0")} ${description}`);
  } else {
    scenarioFailed += 1;
    console.log(`SCENARIO FAIL ${String(id).padStart(2, "0")} ${description}`);
  }
}
console.log(
  `SCENARIO_SUMMARY PASS=${scenarioPassed} FAIL=${scenarioFailed} NOT_RUN=${scenarioNotRun} TOTAL=${REQUIRED_HTTP_SCENARIOS.length}`,
);
console.log(
  `BOOTSTRAP_SECOND_PHASE NOT_RUN reason=coordinator_integration_required actions=${BOOTSTRAP_SECOND_PHASE_ACTIONS.join(",")}`,
);
process.exitCode = acceptanceExitCode({
  assertionFailures: failed,
  scenarioFailures: scenarioFailed,
  scenarioNotRun,
});
