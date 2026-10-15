import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";

// The actual merged pre-repair source, not a reimplementation of the bug.
// Product CI already checks out full Git history for native cohort regressions.
const beforeRepairs = "985409b4c6cec9e5ed94e5f029894774a40fcc27";
const names = [
  "transient token failure retries unchanged viewer authority, then succeeds",
  "production persisted INSERT displays an ordinary remote comment when sender broadcast is lost",
  "Stage initialization cannot install channels or heartbeat after final snapshot cleanup",
];
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const pattern = `^(${names.map(escaped).join("|")})$`;
const run = ref => {
  const env = { ...process.env };
  delete env.LIVE_ROOM_REVIEW_REF;
  delete env.NODE_TEST_CONTEXT;
  if (ref) env.LIVE_ROOM_REVIEW_REF = ref;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", `--test-name-pattern=${pattern}`,
    "tests/live-room-followup-regressions.test.mjs"], { encoding: "utf8", env, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.error, undefined, "regression subprocess completes");
  return { ...result, output: result.stdout + result.stderr };
};

test("live-room regression expectations pass current source and reject all three actual former production bugs", () => {
  execFileSync("git", ["cat-file", "-e", `${beforeRepairs}^{commit}`]);
  const current = run();
  assert.equal(current.status, 0, current.output);
  for (const name of names) assert.match(current.output, new RegExp(`^ok \\d+ - ${escaped(name)}$`, "mu"));
  const previous = run(beforeRepairs);
  assert.equal(previous.status, 1, previous.output);
  for (const name of names) assert.match(previous.output, new RegExp(`^not ok \\d+ - ${escaped(name)}$`, "mu"));
  assert.equal((previous.output.match(/code: 'ERR_ASSERTION'/gu) ?? []).length, 3, previous.output);
  assert.match(previous.output, /# fail 3\b/u);
  assert.match(previous.output, /persisted remote chat must not depend on a best-effort sender broadcast/u);
  assert.doesNotMatch(previous.output, /ReferenceError|SyntaxError|ERR_MODULE_NOT_FOUND|one complete effect|one declaration/u,
    "former source must fail behavioral expectations, not loading or extraction");
});
