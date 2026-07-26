#!/usr/bin/env node

import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();

const functionPlan = Object.freeze([
  {
    name: "cognitive-governance-control",
    source: "supabase/functions/cognitive-governance-control/index.ts",
    verifyJwt: true,
    verifyJwtSource: "explicit",
  },
  {
    name: "cognitive-owner-approval",
    source: "supabase/functions/cognitive-owner-approval/index.ts",
    verifyJwt: true,
    verifyJwtSource: "explicit",
  },
  {
    name: "cognitive-approved-action-worker",
    source: "supabase/functions/cognitive-approved-action-worker/index.ts",
    verifyJwt: true,
    verifyJwtSource: "explicit",
  },
  {
    name: "cognitive-independent-evaluator",
    source: "supabase/functions/cognitive-independent-evaluator/index.ts",
    verifyJwt: true,
    verifyJwtSource: "default",
  },
  {
    name: "autonomous-approval-request",
    source: "supabase/functions/autonomous-approval-request/index.ts",
    verifyJwt: false,
    verifyJwtSource: "explicit",
  },
]);

const requiredCognitiveSecretNames = Object.freeze([
  "COGNITIVE_APPROVED_ACTION_WORKER_INVOKE_SHA256",
  "COGNITIVE_APPROVED_ACTION_WORKER_ASSERTION",
  "COGNITIVE_INDEPENDENT_EVALUATOR_INVOKE_SHA256",
  "COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION",
]);

const brokerSecretName = "AUTONOMOUS_APPROVAL_REQUEST_TOKEN_SHA256";
const allowedPresence = new Set([...requiredCognitiveSecretNames, brokerSecretName]);

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};

const read = (relativePath) =>
  readFileSync(path.join(root, relativePath), "utf8");

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const randomSecret = () => randomBytes(48).toString("base64url");

const assertIncludes = (failures, text, needle, label) => {
  if (!text.includes(needle)) failures.push(label);
};

const assertExcludes = (failures, text, needle, label) => {
  if (text.includes(needle)) failures.push(label);
};

const auditSource = ({ quiet = false } = {}) => {
  const failures = [];
  const config = read("supabase/config.toml");
  const owner = read("supabase/functions/cognitive-owner-approval/index.ts");
  const worker = read(
    "supabase/functions/cognitive-approved-action-worker/index.ts",
  );
  const evaluator = read(
    "supabase/functions/cognitive-independent-evaluator/index.ts",
  );
  const governance = read(
    "supabase/functions/cognitive-governance-control/index.ts",
  );
  const autonomous = read(
    "supabase/functions/autonomous-approval-request/index.ts",
  );

  for (const item of functionPlan) {
    try {
      read(item.source);
    } catch {
      failures.push(`${item.name}:SOURCE_MISSING`);
    }
  }

  assertIncludes(
    failures,
    config,
    "[functions.cognitive-governance-control]\nverify_jwt = true",
    "cognitive-governance-control:JWT_CONFIG_MISMATCH",
  );
  assertIncludes(
    failures,
    config,
    "[functions.cognitive-owner-approval]\nverify_jwt = true",
    "cognitive-owner-approval:JWT_CONFIG_MISMATCH",
  );
  assertIncludes(
    failures,
    config,
    "[functions.cognitive-approved-action-worker]\nverify_jwt = true",
    "cognitive-approved-action-worker:JWT_CONFIG_MISMATCH",
  );
  if (config.includes("[functions.cognitive-independent-evaluator]")) {
    assertIncludes(
      failures,
      config,
      "[functions.cognitive-independent-evaluator]\nverify_jwt = true",
      "cognitive-independent-evaluator:JWT_CONFIG_MISMATCH",
    );
  }
  assertIncludes(
    failures,
    config,
    "[functions.autonomous-approval-request]\nverify_jwt = false",
    "autonomous-approval-request:JWT_CONFIG_MISMATCH",
  );

  assertIncludes(
    failures,
    owner,
    'readRequiredSecret("SUPABASE_ANON_KEY")',
    "owner:AUTHENTICATED_CLIENT_MISSING",
  );
  assertExcludes(
    failures,
    owner,
    "SUPABASE_SERVICE_ROLE_KEY",
    "owner:SERVICE_ROLE_PRESENT",
  );
  assertExcludes(
    failures,
    owner,
    "governance_claim_approved_action",
    "owner:WORKER_CLAIM_PRESENT",
  );
  assertExcludes(
    failures,
    owner,
    "governance_execute_approved_switch",
    "owner:WORKER_EXECUTION_PRESENT",
  );

  assertIncludes(
    failures,
    worker,
    "COGNITIVE_APPROVED_ACTION_WORKER_INVOKE_SHA256",
    "worker:INVOCATION_HASH_MISSING",
  );
  assertIncludes(
    failures,
    worker,
    "COGNITIVE_APPROVED_ACTION_WORKER_ASSERTION",
    "worker:ASSERTION_MISSING",
  );
  assertIncludes(
    failures,
    worker,
    "SUPABASE_SERVICE_ROLE_KEY",
    "worker:SERVICE_ROLE_MISSING",
  );
  assertExcludes(
    failures,
    worker,
    "governance_record_owner_approval",
    "worker:OWNER_APPROVAL_PRESENT",
  );
  assertExcludes(
    failures,
    worker,
    "governance_record_approved_execution_evaluator_proof",
    "worker:EVALUATOR_PROOF_PRESENT",
  );

  assertIncludes(
    failures,
    evaluator,
    "COGNITIVE_INDEPENDENT_EVALUATOR_INVOKE_SHA256",
    "evaluator:INVOCATION_HASH_MISSING",
  );
  assertIncludes(
    failures,
    evaluator,
    "COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION",
    "evaluator:ASSERTION_MISSING",
  );
  assertIncludes(
    failures,
    evaluator,
    "governance_record_approved_execution_evaluator_proof",
    "evaluator:PROOF_RPC_MISSING",
  );
  assertExcludes(
    failures,
    evaluator,
    "governance_claim_approved_action",
    "evaluator:WORKER_CLAIM_PRESENT",
  );
  assertExcludes(
    failures,
    evaluator,
    "governance_execute_approved_switch",
    "evaluator:WORKER_EXECUTION_PRESENT",
  );
  assertExcludes(
    failures,
    evaluator,
    "governance_complete_approved_execution",
    "evaluator:WORKER_COMPLETION_PRESENT",
  );

  assertIncludes(
    failures,
    governance,
    "two_party_owner_approval_required",
    "governance:DIRECT_OWNER_EXECUTION_NOT_BLOCKED",
  );
  assertIncludes(
    failures,
    governance,
    "two_party_service_worker_required",
    "governance:DIRECT_SERVICE_EXECUTION_NOT_BLOCKED",
  );
  assertIncludes(
    failures,
    autonomous,
    brokerSecretName,
    "autonomous:BROKER_HASH_MISSING",
  );

  const functions = [owner, worker, evaluator, governance, autonomous];
  for (const [index, source] of functions.entries()) {
    if (source.includes("console.")) {
      failures.push(`${functionPlan[index]?.name ?? index}:CONSOLE_LOG_PRESENT`);
    }
    if (/catch\s*\([^)]*\)\s*\{[\s\S]{0,240}(message|stack)/u.test(source)) {
      failures.push(`${functionPlan[index]?.name ?? index}:RAW_ERROR_RESPONSE`);
    }
  }

  assertIncludes(
    failures,
    owner,
    '"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"',
    "owner:CORS_HEADERS_MISMATCH",
  );
  assertIncludes(
    failures,
    worker,
    "x-cognitive-worker-invocation",
    "worker:CORS_INVOCATION_HEADER_MISSING",
  );
  assertExcludes(
    failures,
    worker,
    "x-cognitive-evaluator-invocation",
    "worker:CORS_EVALUATOR_HEADER_PRESENT",
  );
  assertIncludes(
    failures,
    evaluator,
    "x-cognitive-evaluator-invocation",
    "evaluator:CORS_INVOCATION_HEADER_MISSING",
  );
  assertExcludes(
    failures,
    evaluator,
    "x-cognitive-worker-invocation",
    "evaluator:CORS_WORKER_HEADER_PRESENT",
  );

  if (!quiet) {
    for (const item of functionPlan) {
      process.stdout.write(
        `${item.name} JWT_${item.verifyJwt ? "REQUIRED" : "HANDLER_AUTH"} ${item.verifyJwtSource.toUpperCase()}\n`,
      );
    }
    process.stdout.write(
      `SOURCE_AUTHORITY_SEPARATION ${failures.length === 0 ? "MATCH" : "MISMATCH"}\n`,
    );
    process.stdout.write(
      `SOURCE_CORS ${failures.some((item) => item.includes("CORS")) ? "MISMATCH" : "MATCH"}\n`,
    );
    process.stdout.write(
      `SOURCE_ERROR_SANITIZATION ${failures.some((item) => item.includes("ERROR") || item.includes("CONSOLE")) ? "MISMATCH" : "MATCH"}\n`,
    );
  }

  if (failures.length > 0 && !quiet) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
  }
  return failures;
};

const parseArgs = (values) => {
  const parsed = { positional: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      parsed.positional.push(value);
      continue;
    }
    const name = value.slice(2);
    if (name === "include-broker") {
      parsed.includeBroker = true;
      continue;
    }
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`missing_${name}`);
    parsed[name] = next;
    index += 1;
  }
  return parsed;
};

const assertOutsideAnyGitWorktree = (candidate) => {
  const gitResult = spawnSync(
    "git",
    ["-C", candidate, "rev-parse", "--show-toplevel"],
    {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 1024 * 1024,
    },
  );
  if (gitResult.error) throw new Error("output_dir_git_check_failed");
  if (gitResult.status === 0) {
    throw new Error("output_dir_must_be_outside_any_git_worktree");
  }
  if (gitResult.status !== 128) {
    throw new Error("output_dir_git_check_failed");
  }
};

const assertSafeOutputDirectory = (outputDir) => {
  if (!path.isAbsolute(outputDir)) throw new Error("output_dir_must_be_absolute");
  const resolved = path.resolve(outputDir);
  const repo = realpathSync(root);
  if (resolved === repo || resolved.startsWith(`${repo}${path.sep}`)) {
    throw new Error("output_dir_must_be_outside_git");
  }
  if (resolved === path.parse(resolved).root) {
    throw new Error("output_dir_too_broad");
  }

  const lexicalParent = path.dirname(resolved);
  const realParent = realpathSync(lexicalParent);
  if (realParent !== lexicalParent) {
    throw new Error("output_dir_symlink_parent_rejected");
  }
  const realTarget = path.join(realParent, path.basename(resolved));
  if (realTarget === repo || realTarget.startsWith(`${repo}${path.sep}`)) {
    throw new Error("output_dir_must_be_outside_git");
  }

  let targetExists = false;
  try {
    const target = lstatSync(realTarget);
    targetExists = true;
    if (target.isSymbolicLink()) {
      throw new Error("output_dir_symlink_target_rejected");
    }
    if (!target.isDirectory()) {
      throw new Error("output_dir_already_exists");
    }
    const existingTarget = realpathSync(realTarget);
    if (existingTarget !== realTarget) {
      throw new Error("output_dir_symlink_target_rejected");
    }
    assertOutsideAnyGitWorktree(existingTarget);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  assertOutsideAnyGitWorktree(realParent);
  if (targetExists) throw new Error("output_dir_already_exists");
  return realTarget;
};

const writeOwnerOnlyFile = (filePath, value) => {
  writeFileSync(filePath, value, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(filePath, 0o600);
};

const generateSecrets = ({
  includeBroker = false,
  outputDir,
  secretFactory = randomSecret,
}) => {
  const safeDir = assertSafeOutputDirectory(outputDir);
  mkdirSync(safeDir, { mode: 0o700, recursive: false });
  chmodSync(safeDir, 0o700);

  const workerInvocation = secretFactory();
  const workerAssertion = secretFactory();
  const evaluatorInvocation = secretFactory();
  const evaluatorAssertion = secretFactory();
  const brokerInvocation = includeBroker ? secretFactory() : null;
  const plaintext = [
    workerInvocation,
    workerAssertion,
    evaluatorInvocation,
    evaluatorAssertion,
    ...(brokerInvocation ? [brokerInvocation] : []),
  ];
  if (new Set(plaintext).size !== plaintext.length) {
    throw new Error("generated_secret_independence_failed");
  }

  const remoteSecrets = [
    `COGNITIVE_APPROVED_ACTION_WORKER_INVOKE_SHA256=${sha256(workerInvocation)}`,
    `COGNITIVE_APPROVED_ACTION_WORKER_ASSERTION=${workerAssertion}`,
    `COGNITIVE_INDEPENDENT_EVALUATOR_INVOKE_SHA256=${sha256(evaluatorInvocation)}`,
    `COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION=${evaluatorAssertion}`,
    ...(brokerInvocation
      ? [`${brokerSecretName}=${sha256(brokerInvocation)}`]
      : []),
  ];
  const invocationSecrets = [
    `COGNITIVE_APPROVED_ACTION_WORKER_INVOKE=${workerInvocation}`,
    `COGNITIVE_INDEPENDENT_EVALUATOR_INVOKE=${evaluatorInvocation}`,
    ...(brokerInvocation
      ? [`AUTONOMOUS_APPROVAL_REQUEST_TOKEN=${brokerInvocation}`]
      : []),
  ];
  const ownerRegistration = [
    `COGNITIVE_APPROVED_ACTION_WORKER_ASSERTION_SHA256=${sha256(workerAssertion)}`,
    `COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION_SHA256=${sha256(evaluatorAssertion)}`,
  ];

  writeOwnerOnlyFile(
    path.join(safeDir, "supabase-edge-secrets.env"),
    `${remoteSecrets.join("\n")}\n`,
  );
  writeOwnerOnlyFile(
    path.join(safeDir, "cognitive-invocation-secrets.env"),
    `${invocationSecrets.join("\n")}\n`,
  );
  writeOwnerOnlyFile(
    path.join(safeDir, "cognitive-owner-registration.env"),
    `${ownerRegistration.join("\n")}\n`,
  );

  process.stdout.write("SECRET_DIRECTORY PRESENT\n");
  for (const name of requiredCognitiveSecretNames) {
    process.stdout.write(`${name} PRESENT\n`);
  }
  process.stdout.write(`${brokerSecretName} ${includeBroker ? "PRESENT" : "MISSING"}\n`);
  process.stdout.write("SECRET_INDEPENDENCE MATCH\n");
  process.stdout.write("OWNER_ONLY_MODES MATCH\n");
};

const runSupabaseJson = (args) => {
  const result = spawnSync("supabase", args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error("supabase_read_failed");
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("supabase_read_invalid_json");
  }
};

const remotePresence = (projectRef) => {
  if (!/^[a-z]{20}$/u.test(projectRef ?? "")) {
    throw new Error("project_ref_rejected");
  }
  const rows = runSupabaseJson([
    "secrets",
    "list",
    "--project-ref",
    projectRef,
    "--output",
    "json",
  ]);
  const names = new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => String(row?.name ?? "").trim())
      .filter((name) => allowedPresence.has(name)),
  );
  for (const name of requiredCognitiveSecretNames) {
    process.stdout.write(`${name} ${names.has(name) ? "PRESENT" : "MISSING"}\n`);
  }
  process.stdout.write(
    `${brokerSecretName} ${names.has(brokerSecretName) ? "PRESENT" : "MISSING"}\n`,
  );
};

const remoteFunctions = (projectRef) => {
  if (!/^[a-z]{20}$/u.test(projectRef ?? "")) {
    throw new Error("project_ref_rejected");
  }
  const rows = runSupabaseJson([
    "functions",
    "list",
    "--project-ref",
    projectRef,
    "--output",
    "json",
  ]);
  const byName = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [
      String(row?.slug ?? row?.name ?? "").trim(),
      row,
    ]),
  );
  for (const item of functionPlan) {
    const row = byName.get(item.name);
    if (!row) {
      process.stdout.write(`${item.name} MISSING\n`);
      continue;
    }
    const status = String(row.status ?? "UNKNOWN")
      .replace(/[^A-Za-z0-9_-]/gu, "")
      .toUpperCase();
    const version = Number.isSafeInteger(Number(row.version))
      ? Number(row.version)
      : "UNKNOWN";
    process.stdout.write(
      `${item.name} PRESENT STATUS_${status || "UNKNOWN"} VERSION_${version}\n`,
    );
  }
};

const selfTest = () => {
  const failures = auditSource({ quiet: true });
  if (failures.length > 0) throw new Error("source_audit_failed");

  const testDir = realpathSync(
    mkdtempSync(
      path.join(tmpdir(), "cognitive-edge-prep-self-test-"),
    ),
  );
  chmodSync(testDir, 0o700);
  try {
    const otherRepo = path.join(testDir, "other-repo");
    mkdirSync(otherRepo, { mode: 0o700 });
    const gitInit = spawnSync("git", ["init", "--quiet", otherRepo], {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    if (gitInit.status !== 0) throw new Error("self_test_git_init_failed");
    try {
      assertSafeOutputDirectory(path.join(otherRepo, "generated"));
      throw new Error("other_git_worktree_not_rejected");
    } catch (error) {
      if (error?.message !== "output_dir_must_be_outside_any_git_worktree") {
        throw error;
      }
    }

    const physicalParent = path.join(testDir, "physical-parent");
    const symlinkParent = path.join(testDir, "symlink-parent");
    mkdirSync(physicalParent, { mode: 0o700 });
    symlinkSync(physicalParent, symlinkParent, "dir");
    try {
      assertSafeOutputDirectory(path.join(symlinkParent, "generated"));
      throw new Error("symlink_parent_not_rejected");
    } catch (error) {
      if (error?.message !== "output_dir_symlink_parent_rejected") {
        throw error;
      }
    }

    const generatedDir = path.join(testDir, "generated");
    let syntheticSequence = 0;
    const originalWrite = process.stdout.write;
    process.stdout.write = () => true;
    try {
      generateSecrets({
        includeBroker: true,
        outputDir: generatedDir,
        secretFactory: () => {
          syntheticSequence += 1;
          return `synthetic-self-test-${syntheticSequence}-${"x".repeat(48)}`;
        },
      });
    } finally {
      process.stdout.write = originalWrite;
    }
    if ((statSync(generatedDir).mode & 0o777) !== 0o700) {
      throw new Error("directory_mode_failed");
    }
    for (const fileName of [
      "supabase-edge-secrets.env",
      "cognitive-invocation-secrets.env",
      "cognitive-owner-registration.env",
    ]) {
      if ((statSync(path.join(generatedDir, fileName)).mode & 0o777) !== 0o600) {
        throw new Error("file_mode_failed");
      }
    }
    const remoteFile = readFileSync(
      path.join(generatedDir, "supabase-edge-secrets.env"),
      "utf8",
    );
    for (const name of [...requiredCognitiveSecretNames, brokerSecretName]) {
      if (!remoteFile.includes(`${name}=`)) {
        throw new Error("secret_name_missing");
      }
    }
  } finally {
    rmSync(testDir, { force: true, recursive: true });
  }
  process.stdout.write("SELF_TEST PASS\n");
};

const usage = () => {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/cognitive-edge-deployment-prep.mjs audit-source",
      "  node scripts/cognitive-edge-deployment-prep.mjs generate-secrets --output-dir /absolute/outside-git/path [--include-broker]",
      "  node scripts/cognitive-edge-deployment-prep.mjs remote-presence --project-ref <ref>",
      "  node scripts/cognitive-edge-deployment-prep.mjs remote-functions --project-ref <ref>",
      "  node scripts/cognitive-edge-deployment-prep.mjs self-test",
      "",
    ].join("\n"),
  );
};

try {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0] ?? "";
  if (command === "audit-source") {
    const failures = auditSource();
    if (failures.length > 0) process.exitCode = 1;
  } else if (command === "generate-secrets") {
    generateSecrets({
      includeBroker: args.includeBroker === true,
      outputDir: args["output-dir"],
    });
  } else if (command === "remote-presence") {
    remotePresence(args["project-ref"]);
  } else if (command === "remote-functions") {
    remoteFunctions(args["project-ref"]);
  } else if (command === "self-test") {
    selfTest();
  } else {
    usage();
    if (command) process.exitCode = 1;
  }
} catch {
  fail("COGNITIVE_EDGE_PREP FAILED");
}
