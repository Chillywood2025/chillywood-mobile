#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = process.cwd();
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
};
const SOURCE_ROOT = path.resolve(
  argument("--source-root") || process.env.COGNITIVE_BOOTSTRAP_SOURCE_ROOT || ROOT,
);
const rawSupabaseWorkdir =
  argument("--supabase-workdir") ||
  process.env.COGNITIVE_BOOTSTRAP_SUPABASE_WORKDIR ||
  "";
if (!rawSupabaseWorkdir.trim()) throw new Error("supabase_workdir_required");
const SUPABASE_WORKDIR = path.resolve(rawSupabaseWorkdir);
const SKIP_RESET = process.argv.includes("--skip-reset");
const EXPECTED_SOURCE_HEAD = argument("--expected-source-head");
if (!/^[a-f0-9]{40}$/u.test(EXPECTED_SOURCE_HEAD)) {
  throw new Error("expected_source_head_required");
}
const requiredMigration = path.join(
  SOURCE_ROOT,
  "supabase/migrations/20260724023712_cognitive_zero_state_two_party_bootstrap.sql",
);
if (!fs.existsSync(requiredMigration)) {
  throw new Error("integrated_zero_state_bootstrap_migration_required");
}
for (const [localRelative, sourceRelative] of [
  ["_lib", "_lib"],
  ["config", "config"],
  ["supabase/functions", "supabase/functions"],
  ["supabase/migrations", "supabase/migrations"],
]) {
  const localPath = path.join(SUPABASE_WORKDIR, localRelative);
  const sourcePath = path.join(SOURCE_ROOT, sourceRelative);
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.symlinkSync(sourcePath, localPath, "dir");
  }
  if (fs.realpathSync(localPath) !== fs.realpathSync(sourcePath)) {
    throw new Error(
      `source_lineage_mismatch:${localRelative.replaceAll("/", "_")}`,
    );
  }
}

const privateDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "chillywood-bootstrap-http-"),
);
fs.chmodSync(privateDirectory, 0o700);
const statusFile = path.join(privateDirectory, "supabase-status.json");
const SAFE_ENV = {
  HOME: process.env.HOME ?? "",
  PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
};
const readSourceHead = () => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: SOURCE_ROOT,
    encoding: "utf8",
    env: SAFE_ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const head = result.status === 0 ? result.stdout.trim() : "";
  if (!/^[a-f0-9]{40}$/u.test(head)) throw new Error("source_head_unavailable");
  return head;
};
const sourceHeadAtStart = readSourceHead();
if (sourceHeadAtStart !== EXPECTED_SOURCE_HEAD) {
  throw new Error("source_head_mismatch");
}
const REPOSITORY = "Chillywood2025/chillywood-mobile";
const FUNCTIONS = Object.freeze({
  evaluator: "cognitive-independent-evaluator",
  owner: "cognitive-owner-approval",
  worker: "cognitive-approved-action-worker",
});
const REQUIRED_CASE_NAMES = Object.freeze([
  "zero state before Owner approval: project rows",
  "zero state before Owner approval: task rows",
  "zero state before Owner approval: switch rows",
  "zero state before Owner approval: schedule rows",
  "legacy direct bootstrap RPC is denied",
  "non-Owner cannot record bootstrap approval",
  "worker service credential cannot act as Owner",
  "malformed Owner bootstrap approval is denied",
  "extra-key Owner bootstrap approval is denied",
  "unsafe canonical branch text is denied",
  "exact Owner records zero-state bootstrap approval through Edge",
  "Owner approval target hash matches reviewed tuple",
  "zero state after Owner approval: task rows",
  "Owner cannot claim bootstrap without worker invocation proof",
  "evaluator invocation cannot cross into worker endpoint",
  "worker invocation cannot cross into evaluator endpoint",
  "evaluator endpoint cannot claim bootstrap",
  "worker endpoint cannot self-attest bootstrap evaluator proof",
  "worker claim with wrong target tuple is denied",
  "worker claims exact bootstrap approval through Edge",
  "bootstrap claim replay is denied",
  "worker stage with wrong target hash is denied",
  "worker stages bootstrap through Edge",
  "zero state after worker stage before evaluator proof: project rows",
  "zero state after worker stage before evaluator proof: task rows",
  "zero state after worker stage before evaluator proof: switch rows",
  "zero state after worker stage before evaluator proof: schedule rows",
  "evaluator proof with wrong receipt is denied",
  "independent evaluator records receipt-bound bootstrap proof",
  "zero state after evaluator proof before completion: task rows",
  "worker completion with wrong receipt is denied",
  "worker completion with wrong evaluator proof is denied",
  "worker completes bootstrap only after matching evaluator proof",
  "completion creates exactly one cognitive project",
  "completion creates exactly one bounded control task",
  "completion creates all ten reviewed switches",
  "all ten switches remain off",
  "completion creates five bounded schedules",
  "all five schedules remain off",
  "Level 2 repair remains off",
  "user-derived memory remains off",
  "project production authority remains false",
  "completed bootstrap receipt replay is denied",
  "selected source head remains exact",
]);
const runId = Array.from(
  crypto.randomBytes(16),
  (byte) => "abcdef"[byte % 6],
).join("");
const hash = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const nowPlus = (minutes) =>
  new Date(Date.now() + minutes * 60_000).toISOString();
const statusCategory = (status) => {
  if (status >= 200 && status <= 299) return "PASS_HTTP_2XX";
  if ([400, 401, 403, 404, 405, 409].includes(status)) {
    return `FAIL_HTTP_${status}`;
  }
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
const expectBody = (name, observed, expected) =>
  record(name, observed === expected, expected, observed);

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
    throw new Error(
      `${command} ${args[0] ?? ""} failed: ${
        scrub(result.stderr || result.stdout || result.status)
      }`,
    );
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
      if (needles.every((needle) => normalized.includes(needle))) {
        return String(value);
      }
    }
    return "";
  };
  return {
    anonKey: get("anon", "key"),
    apiUrl: get("api", "url"),
    dbUrl: get("db", "url"),
    serviceRoleKey: get("service", "role", "key"),
  };
};
const ensureSupabase = () => {
  try {
    const status = readSupabaseStatus();
    if (status.apiUrl && status.anonKey && status.serviceRoleKey && status.dbUrl) {
      return status;
    }
  } catch {
    // Start the disposable stack below.
  }
  const started = spawnSync("supabase", ["start"], {
    cwd: SUPABASE_WORKDIR,
    env: SAFE_ENV,
    stdio: "ignore",
  });
  if (started.status !== 0) throw new Error("supabase_start_failed");
  return readSupabaseStatus();
};
const waitFor = async (predicate, label, timeoutMs = 120_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label}_timeout`);
};
const httpJson = async (
  url,
  { method = "POST", headers = {}, body, expectJson = true } = {},
) => {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
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
  return {
    category: statusCategory(response.status),
    data,
    status: response.status,
  };
};
const expectHttp = async (name, expectedStatuses, operation) => {
  const response = await operation();
  const observedError =
    typeof response.data?.error === "string" &&
      /^[a-z0-9_]{3,120}$/u.test(response.data.error)
      ? response.data.error
      : undefined;
  record(
    name,
    expectedStatuses.includes(response.status),
    expectedStatuses.map(statusCategory).join("|"),
    response.category,
    { observedError },
  );
  return response;
};
const requireHttp = async (label, operation, expectedStatuses = [200, 201]) => {
  const response = await operation();
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${label}_failed:${response.category}`);
  }
  return response;
};

const localConfig = fs.readFileSync(
  path.join(SUPABASE_WORKDIR, "supabase/config.toml"),
  "utf8",
);
const localProjectId =
  localConfig.match(/^project_id\s*=\s*"([^"]+)"$/mu)?.[1] ?? "";
if (!/^[a-zA-Z0-9._-]{3,120}$/u.test(localProjectId)) {
  throw new Error("local_project_id_invalid");
}
const localDatabaseContainer = `supabase_db_${localProjectId}`;
const psql = (sql) =>
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

const setupAuthUser = async (status, email, password) => {
  const created = await httpJson(`${status.apiUrl}/auth/v1/admin/users`, {
    headers: {
      apikey: status.serviceRoleKey,
      authorization: `Bearer ${status.serviceRoleKey}`,
    },
    body: { email, password, email_confirm: true },
  });
  if (![200, 201].includes(created.status)) {
    throw new Error(`auth_admin_create_user_failed:${created.category}`);
  }
  const signedIn = await httpJson(
    `${status.apiUrl}/auth/v1/token?grant_type=password`,
    { headers: { apikey: status.anonKey }, body: { email, password } },
  );
  if (
    signedIn.status !== 200 ||
    !signedIn.data?.access_token ||
    !signedIn.data?.user?.id
  ) {
    throw new Error(`auth_sign_in_failed:${signedIn.category}`);
  }
  return {
    id: signedIn.data.user.id,
    token: signedIn.data.access_token,
  };
};
const actorHeaders = (status, token) => ({
  apikey: status.anonKey,
  authorization: `Bearer ${token}`,
  prefer: "return=representation",
});
const serviceHeaders = (status) => ({
  apikey: status.serviceRoleKey,
  authorization: `Bearer ${status.serviceRoleKey}`,
  prefer: "return=representation",
});
const restRpc = (status, rpc, body, headers) =>
  httpJson(`${status.apiUrl}/rest/v1/rpc/${rpc}`, { body, headers });
const restSelect = (status, relative, headers = serviceHeaders(status)) =>
  httpJson(`${status.apiUrl}/rest/v1/${relative}`, {
    expectJson: true,
    headers,
    method: "GET",
  });
const edgeCall = (status, fn, body, headers) =>
  httpJson(`${status.apiUrl}/functions/v1/${fn}`, { body, headers });
const ownerEdgeHeaders = (status, token) => ({
  apikey: status.anonKey,
  authorization: `Bearer ${token}`,
});
const serviceEdgeHeaders = (status) => ({
  apikey: status.serviceRoleKey,
  authorization: `Bearer ${status.serviceRoleKey}`,
});

const sourceCommit = hash(`source-commit:${runId}`).slice(0, 40);
const retentionPolicyHash = hash(`retention-policy:${runId}`);
const constitutionHash = hash(`constitution:${runId}`);
const rollbackHash = hash(`rollback:${runId}`);
const evaluatorRequirementHash = hash(`evaluator-requirement:${runId}`);
const evaluatorProofHash = hash(`evaluator-proof:${runId}`);
const wrongTargetResourceHash = hash(`wrong-target:${runId}`);
const wrongExecutionReceiptHash = hash(`wrong-receipt:${runId}`);
const wrongEvaluatorProofHash = hash(`wrong-evaluator-proof:${runId}`);
const policyVersion = "collective-governance-v1";
const branchName = `codex/zero-state-bootstrap-${runId}`;
const targetResourceHash = hash([
  "bootstrap_control_plane",
  REPOSITORY,
  branchName,
  sourceCommit,
  retentionPolicyHash,
  constitutionHash,
  rollbackHash,
  evaluatorRequirementHash,
  policyVersion,
].join("|"));
const bootstrapApprovalPayload = {
  action: "record_bootstrap_approval",
  branchName,
  constitutionHash,
  evaluatorRequirementHash,
  policyVersion,
  repositoryFullName: REPOSITORY,
  retentionPolicyHash,
  rollbackHash,
  sourceCommit,
  validitySeconds: 3600,
};
const bootstrapClaimPayload = (approval) => ({
  action: "bootstrap_control_plane",
  approvalHash: approval.approvalHash,
  approvalId: approval.approvalId,
  branchName,
  constitutionHash,
  evaluatorRequirementHash,
  phase: "claim",
  policyVersion,
  repositoryFullName: REPOSITORY,
  retentionPolicyHash,
  rollbackHash,
  sourceCommit,
});
const zeroStateRows = async (status) => ({
  projects: (await restSelect(status, "cognitive_projects?select=id")).data ?? [],
  schedules: (
    await restSelect(status, "cognitive_level01_schedule_definitions?select=id")
  ).data ?? [],
  switches: (
    await restSelect(status, "cognitive_governance_switches?select=id")
  ).data ?? [],
  tasks: (await restSelect(status, "intelligence_tasks?select=id")).data ?? [],
});
const assertZeroState = async (status, prefix) => {
  const rows = await zeroStateRows(status);
  expectBody(`${prefix}: project rows`, rows.projects.length, 0);
  expectBody(`${prefix}: task rows`, rows.tasks.length, 0);
  expectBody(`${prefix}: switch rows`, rows.switches.length, 0);
  expectBody(`${prefix}: schedule rows`, rows.schedules.length, 0);
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
          const recovered = readSupabaseStatus();
          return Boolean(
            recovered.apiUrl &&
              recovered.dbUrl &&
              recovered.anonKey &&
              recovered.serviceRoleKey
          );
        } catch {
          return false;
        }
      }, "supabase_db_reset_recovery", 30_000);
    }
  }
  Object.assign(status, readSupabaseStatus());

  const workerAssertion =
    `local-bootstrap-worker-assertion-${runId}-000000000000`;
  const evaluatorAssertion =
    `local-bootstrap-evaluator-assertion-${runId}-0000000000`;
  const workerInvoke =
    `local-bootstrap-worker-invoke-${runId}-00000000000000`;
  const evaluatorInvoke =
    `local-bootstrap-evaluator-invoke-${runId}-000000000000`;
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
  const functionServeStartedAt = Date.now();
  let consecutiveReadyProbes = 0;
  await waitFor(async () => {
    if (
      functionServer.exitCode !== null ||
      Date.now() - functionServeStartedAt < 8_000
    ) {
      return false;
    }
    try {
      const probe = await edgeCall(status, FUNCTIONS.owner, {}, {});
      consecutiveReadyProbes = [401, 403].includes(probe.status)
        ? consecutiveReadyProbes + 1
        : 0;
      return consecutiveReadyProbes >= 3;
    } catch {
      consecutiveReadyProbes = 0;
      return false;
    }
  }, "bootstrap_edge_functions_ready");

  const password = `Local-only-bootstrap-${runId}-password`;
  const owner = await setupAuthUser(
    status,
    `bootstrap-owner-${runId}@local.invalid`,
    password,
  );
  const nonOwner = await setupAuthUser(
    status,
    `bootstrap-non-owner-${runId}@local.invalid`,
    password,
  );
  psql(`
    insert into public.platform_role_memberships(
      user_id, email, role, status, notes
    ) values (
      ${quote(owner.id)}, null, 'owner', 'active',
      'disposable zero-state bootstrap HTTP proof'
    );
  `);

  await assertZeroState(status, "zero state before Owner approval");
  await expectHttp(
    "legacy direct bootstrap RPC is denied",
    [401, 403, 404],
    () =>
      restRpc(
        status,
        "cognitive_bootstrap_level01_canary",
        {
          p_actor_identity: "governance_canary_scheduler",
          p_constitution_hash: constitutionHash,
          p_retention_policy_hash: retentionPolicyHash,
          p_rollback_hash: rollbackHash,
          p_source_commit: sourceCommit,
        },
        serviceHeaders(status),
      ),
  );
  await expectHttp(
    "non-Owner cannot record bootstrap approval",
    [400, 409],
    () =>
      edgeCall(
        status,
        FUNCTIONS.owner,
        bootstrapApprovalPayload,
        ownerEdgeHeaders(status, nonOwner.token),
      ),
  );
  await expectHttp(
    "worker service credential cannot act as Owner",
    [401, 403],
    () =>
      edgeCall(
        status,
        FUNCTIONS.owner,
        bootstrapApprovalPayload,
        serviceEdgeHeaders(status),
      ),
  );
  await expectHttp(
    "malformed Owner bootstrap approval is denied",
    [400],
    () =>
      edgeCall(
        status,
        FUNCTIONS.owner,
        { ...bootstrapApprovalPayload, sourceCommit: "not-a-commit" },
        ownerEdgeHeaders(status, owner.token),
      ),
  );
  await expectHttp(
    "extra-key Owner bootstrap approval is denied",
    [400],
    () =>
      edgeCall(
        status,
        FUNCTIONS.owner,
        { ...bootstrapApprovalPayload, unexpected: "bounded" },
        ownerEdgeHeaders(status, owner.token),
      ),
  );
  await expectHttp(
    "unsafe canonical branch text is denied",
    [400],
    () =>
      edgeCall(
        status,
        FUNCTIONS.owner,
        { ...bootstrapApprovalPayload, branchName: "codex/bypass-rls" },
        ownerEdgeHeaders(status, owner.token),
      ),
  );

  await expectHttp(
    "exact Owner registers bootstrap worker over PostgREST",
    [200],
    () =>
      restRpc(
        status,
        "governance_register_two_party_service_principal",
        {
          p_allowed_operations: ["bootstrap_control_plane"],
          p_assertion_hash: hash(workerAssertion),
          p_expires_at: nowPlus(1440),
          p_service_identity: "cognitive_approved_action_worker",
        },
        actorHeaders(status, owner.token),
      ),
  );
  await expectHttp(
    "exact Owner registers independent evaluator over PostgREST",
    [200],
    () =>
      restRpc(
        status,
        "governance_register_two_party_service_principal",
        {
          p_allowed_operations: ["independent_evaluation"],
          p_assertion_hash: hash(evaluatorAssertion),
          p_expires_at: nowPlus(1440),
          p_service_identity: "cognitive_independent_evaluator",
        },
        actorHeaders(status, owner.token),
      ),
  );
  const approvalResponse = await expectHttp(
    "exact Owner records zero-state bootstrap approval through Edge",
    [200],
    () =>
      edgeCall(
        status,
        FUNCTIONS.owner,
        bootstrapApprovalPayload,
        ownerEdgeHeaders(status, owner.token),
      ),
  );
  const approval = approvalResponse.data;
  expectBody("Owner approval target hash matches reviewed tuple", approval?.targetResourceHash, targetResourceHash);
  expectBody("Owner bootstrap approval state is active", approval?.state, "active");
  await assertZeroState(status, "zero state after Owner approval");

  const workerHeaders = {
    ...serviceEdgeHeaders(status),
    "x-cognitive-worker-invocation": workerInvoke,
  };
  const evaluatorHeaders = {
    ...serviceEdgeHeaders(status),
    "x-cognitive-evaluator-invocation": evaluatorInvoke,
  };
  await expectHttp(
    "Owner cannot claim bootstrap without worker invocation proof",
    [401],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        bootstrapClaimPayload(approval),
        ownerEdgeHeaders(status, owner.token),
      ),
  );
  await expectHttp(
    "evaluator invocation cannot cross into worker endpoint",
    [401],
    () =>
      edgeCall(status, FUNCTIONS.worker, bootstrapClaimPayload(approval), {
        ...serviceEdgeHeaders(status),
        "x-cognitive-worker-invocation": evaluatorInvoke,
      }),
  );
  await expectHttp(
    "worker invocation cannot cross into evaluator endpoint",
    [401],
    () =>
      edgeCall(
        status,
        FUNCTIONS.evaluator,
        { action: "record_bootstrap_evaluator_proof" },
        {
          ...serviceEdgeHeaders(status),
          "x-cognitive-evaluator-invocation": workerInvoke,
        },
      ),
  );
  await expectHttp(
    "evaluator endpoint cannot claim bootstrap",
    [400],
    () =>
      edgeCall(
        status,
        FUNCTIONS.evaluator,
        { action: "bootstrap_control_plane", phase: "claim" },
        evaluatorHeaders,
      ),
  );
  await expectHttp(
    "worker endpoint cannot self-attest bootstrap evaluator proof",
    [400],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        { action: "record_bootstrap_evaluator_proof" },
        workerHeaders,
      ),
  );
  await expectHttp(
    "worker claim with wrong target tuple is denied",
    [409],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        {
          ...bootstrapClaimPayload(approval),
          branchName: `codex/wrong-bootstrap-${runId}`,
        },
        workerHeaders,
      ),
  );
  const claimResponse = await expectHttp(
    "worker claims exact bootstrap approval through Edge",
    [200],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        bootstrapClaimPayload(approval),
        workerHeaders,
      ),
  );
  const executionId = claimResponse.data?.executionId;
  expectBody("worker bootstrap claim state is claimed", claimResponse.data?.state, "claimed");
  await expectHttp(
    "bootstrap claim replay is denied",
    [409],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        bootstrapClaimPayload(approval),
        workerHeaders,
      ),
  );
  await expectHttp(
    "worker stage with wrong target hash is denied",
    [409],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        {
          action: "bootstrap_control_plane",
          approvalHash: approval.approvalHash,
          executionId,
          phase: "stage",
          targetResourceHash: wrongTargetResourceHash,
        },
        workerHeaders,
      ),
  );
  const stageResponse = await expectHttp(
    "worker stages bootstrap through Edge",
    [200],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        {
          action: "bootstrap_control_plane",
          approvalHash: approval.approvalHash,
          executionId,
          phase: "stage",
          targetResourceHash,
        },
        workerHeaders,
      ),
  );
  const executionReceiptHash = stageResponse.data?.executionReceiptHash;
  expectBody("worker bootstrap stage state is staged", stageResponse.data?.state, "staged");
  await assertZeroState(status, "zero state after worker stage before evaluator proof");

  await expectHttp(
    "evaluator proof with wrong receipt is denied",
    [409],
    () =>
      edgeCall(
        status,
        FUNCTIONS.evaluator,
        {
          action: "record_bootstrap_evaluator_proof",
          evaluatorProofHash,
          executionId,
          executionReceiptHash: wrongExecutionReceiptHash,
          verdict: "passed",
        },
        evaluatorHeaders,
      ),
  );
  await expectHttp(
    "independent evaluator records receipt-bound bootstrap proof",
    [200],
    () =>
      edgeCall(
        status,
        FUNCTIONS.evaluator,
        {
          action: "record_bootstrap_evaluator_proof",
          evaluatorProofHash,
          executionId,
          executionReceiptHash,
          verdict: "passed",
        },
        evaluatorHeaders,
      ),
  );
  await assertZeroState(status, "zero state after evaluator proof before completion");

  await expectHttp(
    "worker completion with wrong receipt is denied",
    [409],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        {
          action: "bootstrap_control_plane",
          evaluatorProofHash,
          executionId,
          executionReceiptHash: wrongExecutionReceiptHash,
          phase: "complete",
        },
        workerHeaders,
      ),
  );
  await expectHttp(
    "worker completion with wrong evaluator proof is denied",
    [409],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        {
          action: "bootstrap_control_plane",
          evaluatorProofHash: wrongEvaluatorProofHash,
          executionId,
          executionReceiptHash,
          phase: "complete",
        },
        workerHeaders,
      ),
  );
  const completionResponse = await expectHttp(
    "worker completes bootstrap only after matching evaluator proof",
    [200],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        {
          action: "bootstrap_control_plane",
          evaluatorProofHash,
          executionId,
          executionReceiptHash,
          phase: "complete",
        },
        workerHeaders,
      ),
  );
  expectBody("bootstrap completion state is completed", completionResponse.data?.state, "completed");
  expectBody("bootstrap completion preserves receipt hash", completionResponse.data?.executionReceiptHash, executionReceiptHash);

  const projects = await restSelect(
    status,
    "cognitive_projects?select=id,activation_state,scheduler_state,production_authority",
  );
  const tasks = await restSelect(
    status,
    "intelligence_tasks?task_key=eq.cognitive-level01-canary-control&select=id,project_id,status",
  );
  const switches = await restSelect(
    status,
    "cognitive_governance_switches?select=switch_key,enabled",
  );
  const schedules = await restSelect(
    status,
    "cognitive_level01_schedule_definitions?select=schedule_key,enabled",
  );
  expectBody("completion creates exactly one cognitive project", projects.data?.length, 1);
  expectBody("completion creates exactly one bounded control task", tasks.data?.length, 1);
  expectBody("completion creates all ten reviewed switches", switches.data?.length, 10);
  expectBody(
    "all ten switches remain off",
    switches.data?.filter((entry) => entry.enabled === false).length,
    10,
  );
  expectBody("completion creates five bounded schedules", schedules.data?.length, 5);
  expectBody(
    "all five schedules remain off",
    schedules.data?.filter((entry) => entry.enabled === false).length,
    5,
  );
  expectBody(
    "Level 2 repair remains off",
    switches.data?.find(
      (entry) =>
        entry.switch_key === "cognitive_level2_production_repairs_enabled",
    )?.enabled,
    false,
  );
  expectBody(
    "user-derived memory remains off",
    switches.data?.find(
      (entry) => entry.switch_key === "cognitive_user_derived_memory_enabled",
    )?.enabled,
    false,
  );
  expectBody("project production authority remains false", projects.data?.[0]?.production_authority, false);
  await expectHttp(
    "completed bootstrap receipt replay is denied",
    [409],
    () =>
      edgeCall(
        status,
        FUNCTIONS.worker,
        {
          action: "bootstrap_control_plane",
          evaluatorProofHash,
          executionId,
          executionReceiptHash,
          phase: "complete",
        },
        workerHeaders,
      ),
  );
  expectBody(
    "selected source head remains exact",
    readSourceHead(),
    sourceHeadAtStart,
  );
} catch (error) {
  record("bootstrap harness setup/runtime", false, "PASS", `FAIL:${scrub(error.message)}`);
} finally {
  if (functionServer) {
    functionServer.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!functionServer.killed) functionServer.kill("SIGKILL");
  }
  fs.rmSync(privateDirectory, { recursive: true, force: true });
}

const casesByName = new Map(cases.map((testCase) => [testCase.name, testCase]));
const missingRequiredCases = REQUIRED_CASE_NAMES.filter(
  (name) => !casesByName.has(name),
);
const failingRequiredCases = REQUIRED_CASE_NAMES.filter(
  (name) => casesByName.has(name) && casesByName.get(name)?.result !== "PASS",
);
record(
  "required zero-state bootstrap HTTP case gate",
  missingRequiredCases.length === 0 && failingRequiredCases.length === 0,
  "MATCH",
  missingRequiredCases.length === 0 && failingRequiredCases.length === 0
    ? "MATCH"
    : "MISMATCH",
  {
    observedCategory:
      `required_${REQUIRED_CASE_NAMES.length}_missing_${missingRequiredCases.length}_failed_${failingRequiredCases.length}`,
  },
);
for (const testCase of cases) {
  const suffix = [
    testCase.observedError ? `error_${testCase.observedError}` : "",
  ].filter(Boolean).join(" ");
  console.log(
    `${testCase.result} ${testCase.name} expected=${testCase.expected} observed=${testCase.observed}${suffix}`,
  );
}
console.log(
  `REQUIRED_SUMMARY PASS=${
    REQUIRED_CASE_NAMES.length -
    failingRequiredCases.length -
    missingRequiredCases.length
  } FAIL=${failingRequiredCases.length} MISSING=${missingRequiredCases.length} TOTAL=${REQUIRED_CASE_NAMES.length}`,
);
console.log(`SUMMARY PASS=${passed} FAIL=${failed} TOTAL=${passed + failed}`);
process.exitCode = failed === 0 ? 0 : 1;
