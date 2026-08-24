import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(path.join(root, ".github/workflows/phase1-ci.yml"), "utf8");
const wrapperPath = path.join(root, "scripts/guard-autonomous-systems-contract.mjs");
const repository = "Chillywood2025/chillywood-mobile";

const allowedFailure = {
  ok: false,
  failures: [
    "finite task runtime candidate failed: FINITE_TASK_EFFECTIVE_RESERVATION_LIVE_AUTHORITY_REQUIRED",
    "source-only autonomous contract requires shared evaluator eligibility",
  ],
};

const fixtureIntegrityFailure = {
  ok: false,
  failures: [
    "finite task runtime candidate failed: FINITE_TASK_TEST_ADAPTATION_FIXTURE_INTEGRITY_INVALID",
  ],
};

const runStubbedWrapper = ({
  coreStderr,
  coreStdout = "",
  draft = true,
  testMutation = null,
}) => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "chillywood-source-readiness-"));
  try {
    cpSync(wrapperPath, path.join(fixtureRoot, "guard-autonomous-systems-contract.mjs"));
    writeFileSync(
      path.join(fixtureRoot, "guard-autonomous-systems-contract-core.mjs"),
      `process.stdout.write(${JSON.stringify(coreStdout)}); process.stderr.write(${JSON.stringify(coreStderr)}); process.exit(1);\n`,
    );
    mkdirSync(path.join(fixtureRoot, "tests"));
    mkdirSync(path.join(fixtureRoot, "supabase", "tests"), { recursive: true });
    writeFileSync(
      path.join(fixtureRoot, "tests", "boundary.test.mjs"),
      'import assert from "node:assert/strict";\nimport test from "node:test";\ntest("boundary", () => assert.equal(true, true));\n',
    );
    writeFileSync(
      path.join(fixtureRoot, "supabase", "tests", "boundary_test.sql"),
      "begin;\nselect plan(1);\nselect ok(current_setting('server_version_num')::integer > 0, 'boundary');\nselect * from finish();\nrollback;\n",
    );
    const git = (...args) => execFileSync("git", args, { cwd: fixtureRoot, stdio: "ignore" });
    git("init");
    git("config", "user.name", "Source Readiness Test");
    git("config", "user.email", "source-readiness@example.invalid");
    git("add", "tests", "supabase/tests");
    git("commit", "-m", "baseline test inventory");
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fixtureRoot,
      encoding: "utf8",
    }).trim();

    if (testMutation === "delete") {
      unlinkSync(path.join(fixtureRoot, "tests", "boundary.test.mjs"));
    } else if (testMutation === "shrink-plan") {
      writeFileSync(
        path.join(fixtureRoot, "supabase", "tests", "boundary_test.sql"),
        "begin;\nselect plan(0);\nselect * from finish();\nrollback;\n",
      );
    } else if (testMutation === "weaken-same-count") {
      writeFileSync(
        path.join(fixtureRoot, "supabase", "tests", "boundary_test.sql"),
        "begin;\nselect plan(1);\nselect ok(true, 'boundary');\nselect * from finish();\nrollback;\n",
      );
    } else {
      writeFileSync(path.join(fixtureRoot, "source.txt"), "draft source change\n");
    }
    git("add", "--all");
    git("commit", "-m", "draft candidate");
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fixtureRoot,
      encoding: "utf8",
    }).trim();

    const eventPath = path.join(fixtureRoot, "event.json");
    writeFileSync(eventPath, JSON.stringify({
      number: 901,
      repository: { full_name: repository },
      pull_request: {
        draft,
        base: { repo: { full_name: repository }, sha: baseSha },
        head: { repo: { full_name: repository }, sha: headSha },
      },
    }));
    return spawnSync(process.execPath, [path.join(fixtureRoot, "guard-autonomous-systems-contract.mjs")], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

test("Phase 1 runs on both directions of the draft/ready lifecycle", () => {
  assert.match(workflow,
    /pull_request:\s*\n\s*types: \[opened, synchronize, reopened, ready_for_review, converted_to_draft\]/u);
  assert.match(workflow,
    /run-name: "phase1 pr=\$\{\{ github\.event\.pull_request\.number \}\} action=\$\{\{ github\.event\.action \}\} draft=\$\{\{ github\.event\.pull_request\.draft \}\}"/u);
});

test("draft source readiness accepts only the core's exact structured stderr receipt", () => {
  const result = runStubbedWrapper({ coreStderr: JSON.stringify(allowedFailure) });
  assert.equal(result.status, 0);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.mode, "DRAFT_SOURCE_READINESS");
  assert.equal(receipt.mergeAuthorityGranted, false);
  assert.deepEqual(receipt.deferredFinalAdmissionFailures, allowedFailure.failures);
});

test("draft source readiness rejects partial logs and unexpected failure identities", () => {
  const partial = runStubbedWrapper({ coreStderr: `diagnostic before JSON\n${JSON.stringify(allowedFailure)}` });
  assert.equal(partial.status, 1);

  const unexpected = runStubbedWrapper({
    coreStderr: JSON.stringify({
      ok: false,
      failures: ["finite task runtime candidate failed: ATTACKER_CONTROLLED_FINDING"],
    }),
  });
  assert.equal(unexpected.status, 1);

  const conflicting = runStubbedWrapper({
    coreStdout: JSON.stringify(allowedFailure),
    coreStderr: JSON.stringify({ ok: false, failures: ["unexpected strict failure"] }),
  });
  assert.equal(conflicting.status, 1);
});

test("a ready PR cannot defer the same final-admission failure", () => {
  const result = runStubbedWrapper({ coreStderr: JSON.stringify(allowedFailure), draft: false });
  assert.equal(result.status, 1);
});

test("draft source readiness rejects deletion of a protected-base test", () => {
  const result = runStubbedWrapper({
    coreStderr: JSON.stringify(allowedFailure),
    testMutation: "delete",
  });
  assert.equal(result.status, 1);
});

test("draft source readiness rejects pgTAP plan and assertion shrinkage", () => {
  const result = runStubbedWrapper({
    coreStderr: JSON.stringify(allowedFailure),
    testMutation: "shrink-plan",
  });
  assert.equal(result.status, 1);
});

test("draft source readiness never defers semantic fixture-integrity failure with unchanged counts", () => {
  const result = runStubbedWrapper({
    coreStderr: JSON.stringify(fixtureIntegrityFailure),
    testMutation: "weaken-same-count",
  });
  assert.equal(result.status, 1);
});
