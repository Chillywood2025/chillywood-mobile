import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const baseline = "934db4003e604e9ac42aa6feb9d4511e1c80a97b";
const current = () => readFileSync(new URL("_lib/watchParty.ts", root), "utf8");
const replace = (source, before, after) => {
  assert.ok(source.includes(before), `Missing mutation target: ${before}`);
  return source.replaceAll(before, after);
};
const controls = [
  {
    name: "old production adapter", pattern: "creation validates|same-session token refresh|uncertain 502/23505",
    failure: /not ok \d+ - creation validates the supplied initiating host and active authority before IO/u,
    source: () => execFileSync("git", ["show", `${baseline}:_lib/watchParty.ts`], { cwd: root, encoding: "utf8" }),
  },
  {
    name: "removed frozen Authorization", pattern: "same-session token refresh",
    failure: /not ok \d+ - same-session token refresh never replaces the frozen initiating transport token/u,
    source: () => replace(current(), '.setHeader("Authorization", `Bearer ${subject.accessToken}`)', ""),
  },
  {
    name: "removed awaiting-session guards", pattern: "no creation after session changes while awaiting premium",
    failure: /not ok \d+ - no creation after session changes while awaiting premium/u,
    source: () => replace(replace(current(), "assertInitiatingAuthority();", ""), "assertAccountBoundSupabaseMutationSubjectCurrent(subject);", ""),
  },
  {
    name: "removed session single-flight key", pattern: "duplicates share one creation",
    failure: /not ok \d+ - duplicates share one creation but a new session does not inherit the old promise/u,
    source: () => replace(current(), "  authority.sessionGeneration,", ""),
  },
  {
    name: "falsely retryable dispatched creation", pattern: "delayed creation acknowledgement",
    failure: /not ok \d+ - delayed creation acknowledgement is never returned to a replacement session/u,
    source: () => replace(current(), "dispatchState.mutationDispatched = true;", ""),
  },
  {
    name: "stale rejection proof after fallback", pattern: "rejection proof resets before each later insert",
    failure: /not ok \d+ - rejection proof resets before each later insert with an ambiguous result/u,
    source: () => replace(current(), "dispatchState.mutationRejected = false;", ""),
  },
];

for (const control of controls) test(`creation negative control rejects ${control.name}`, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "party-create-control-"));
  try {
    const filename = path.join(directory, "watchParty.ts");
    writeFileSync(filename, control.source());
    const env = { ...process.env, PARTY_CREATE_SOURCE: filename };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--test", "--test-reporter=tap", `--test-name-pattern=${control.pattern}`,
      "tests/watch-party-create-authority-adapter.test.mjs",
    ], { cwd: root, env, encoding: "utf8", timeout: 30_000 });
    const output = result.stdout + result.stderr;
    assert.equal(result.error, undefined, output);
    assert.equal(result.status, 1, output);
    assert.match(result.stdout, control.failure);
    assert.match(result.stdout, /failureType: 'testCodeFailure'/u);
    assert.match(result.stdout, /ERR_ASSERTION/u);
    assert.doesNotMatch(output, /SyntaxError|ReferenceError|TypeError|Cannot find module|Unmodeled dependency/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
