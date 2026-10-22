import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workflowDirectory = path.join(root, ".github/workflows");
const workflowNames = fs.readdirSync(workflowDirectory)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort();

const reviewedActions = new Map([
  ["actions/checkout", {
    sha: "3d3c42e5aac5ba805825da76410c181273ba90b1",
    version: "v7.0.1",
    runtime: "node24",
  }],
  ["actions/setup-node", {
    sha: "820762786026740c76f36085b0efc47a31fe5020",
    version: "v7.0.0",
    runtime: "node24",
  }],
  ["denoland/setup-deno", {
    sha: "22d081ff2d3a40755e97629de92e3bcbfa7cf2ed",
    version: "v2.0.5",
    runtime: "node24",
  }],
  ["expo/expo-github-action", {
    sha: "eab7a230208c952974db8c3245cfd78402c7b385",
    version: "9.0.0",
    runtime: "node24",
  }],
  ["supabase/setup-cli", {
    sha: "afb1b15109756ea5cf9d8985a359d9095235ca2b",
    version: "v2.1.2",
    runtime: "composite-with-node24-setup-bun",
  }],
]);

const readWorkflows = () => workflowNames.map((name) => ({
  name,
  source: fs.readFileSync(path.join(workflowDirectory, name), "utf8"),
}));

test("workflows use only reviewed immutable Node 24-compatible action pins", () => {
  const seen = new Set();
  for (const { name, source } of readWorkflows()) {
    for (const match of source.matchAll(/^\s*(?:-\s*)?uses:\s*([^@\s]+)@([^\s#]+)(?:\s*#\s*(\S+))?\s*$/gmu)) {
      const [, action, ref, version] = match;
      const reviewed = reviewedActions.get(action);
      assert.ok(reviewed, `${name}: unreviewed external action ${action}`);
      assert.match(ref, /^[a-f0-9]{40}$/u, `${name}: mutable action reference ${action}@${ref}`);
      assert.equal(ref, reviewed.sha, `${name}: ${action} is not pinned to its reviewed commit`);
      assert.equal(version, reviewed.version, `${name}: ${action} has an inaccurate version comment`);
      assert.ok(reviewed.runtime.includes("node24"), `${name}: ${action} lacks Node 24 runtime evidence`);
      seen.add(action);
    }
  }
  assert.deepEqual(seen, new Set(reviewedActions.keys()));
});

const sdkTail = [
  { name: "Set up isolated notification Edge SDK runtime",
    uses: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    with: { "node-version": 22, cache: "npm" } },
  { name: "Install exact notification Edge SDK fixture",
    run: "npm ci --ignore-scripts --no-audit --no-fund --prefix isolated-runtime/notification-edge-sdk" },
  { name: "Test exact notification Edge SDK transport",
    run: "node --test tests/edge-sdk/notification-registration-sdk-transport.test.mjs" },
];
function assertProjectRuntimeContract(workflows) {
  let sdkTails = 0, configuredVersions = 0;
  for (const { name, source } of workflows) {
    assert.doesNotMatch(source, /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION|FORCE_JAVASCRIPT_ACTIONS_TO_NODE24/u);
    const workflow = parse(source);
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      const isolated = name === "required-validation.yml" && jobName === "product";
      if (isolated) {
        sdkTails++;
        assert.equal(job.if, "needs.plan.outputs.product == 'true'", "Product selection must remain unchanged");
        assert.equal(job.needs, "plan");
        assert.equal(job["continue-on-error"], undefined, "Product cannot suppress failures");
        assert.equal(job.steps.length, 9, "SDK tail must be the only added Product steps");
        // Exact six pre-existing Node20 steps from reviewed main 4826e06a.
        // Includes every original glob, mounted test, real-peer command and its failure semantics.
        assert.equal(createHash("sha256").update(JSON.stringify(job.steps.slice(0, 6))).digest("hex"),
          "d73e43704e1073610958b349417de704db6aa5e11a51cca6311f1a3925b0b504",
          "Existing Node20 Product checks must remain exact and precede the SDK tail");
        assert.deepEqual(job.steps.slice(6), sdkTail, "SDK-only tail must run unconditionally with exact supported runtime and commands");
      }
      for (const [index, step] of (job.steps ?? []).entries()) {
        if (step.with?.["node-version"] !== undefined) {
          configuredVersions++;
          const expected = isolated && index === 6 ? 22 : 20;
          assert.equal(String(step.with["node-version"]), String(expected), "Only the exact isolated SDK tail may use Node22");
        }
      }
    }
  }
  assert.equal(sdkTails, 1, "Required isolated SDK suite must be discovered exactly once");
  assert.ok(configuredVersions > 0, "expected explicit project Node versions");
}

test("existing project checks remain Node20 with one exact isolated supported SDK tail", () => {
  assertProjectRuntimeContract(readWorkflows());
  assert.ok(fs.existsSync(path.join(root, "tests/edge-sdk/notification-registration-sdk-transport.test.mjs")));
  assert.equal(fs.existsSync(path.join(root, "tests/notification-registration-sdk-transport.test.mjs")), false,
    "Node20 root glob must not also load the Node22-only SDK suite");
});

const runtimeMutations = [
  ["original Product runtime upgraded", j => { j.steps[1].with["node-version"] = 22; }],
  ["SDK runtime downgraded", j => { j.steps[6].with["node-version"] = 20; }],
  ["SDK runtime changed", j => { j.steps[6].with["node-version"] = 24; }],
  ["SDK command missing", j => { j.steps.pop(); }],
  ["SDK command skipped", j => { j.steps[8].if = "false"; }],
  ["SDK command suppressed", j => { j.steps[8]["continue-on-error"] = true; }],
  ["SDK install skipped", j => { j.steps[7].if = "false"; }],
  ["SDK setup conditional", j => { j.steps[6].if = "false"; }],
  ["SDK install ignores failure", j => { j.steps[7].run += " || true"; }],
  ["SDK tests replaced", j => { j.steps[8].run = "echo skipped"; }],
  ["SDK tail moved before existing tests", j => { j.steps.splice(5, 0, ...j.steps.splice(6)); }],
  ["extra Node22 step", j => { j.steps.push(structuredClone(j.steps[6])); }],
  ["job suppresses failure", j => { j["continue-on-error"] = true; }],
  ["job skips tests", j => { j.if = "false"; }],
  ["existing root glob omitted", j => { j.steps[5].run = j.steps[5].run.replace("node --test tests/*.test.mjs\n", ""); }],
];
for (const [label, mutate] of runtimeMutations) {
  test(`runtime contract rejects ${label}`, () => {
    const workflows = readWorkflows();
    const entry = workflows.find(item => item.name === "required-validation.yml");
    const parsed = parse(entry.source);
    mutate(parsed.jobs.product);
    // JSON is valid YAML; exercise the same parser and contract on real workflow mutations.
    entry.source = JSON.stringify(parsed);
    assert.throws(() => assertProjectRuntimeContract(workflows), { code: "ERR_ASSERTION" });
  });
}
test("runtime contract rejects Node22 in another project lane", () => {
  const workflows = readWorkflows();
  const entry = workflows.find(item => item.name === "required-validation.yml");
  const parsed = parse(entry.source);
  parsed.jobs.core.steps.find(step => step.with?.["node-version"]).with["node-version"] = 22;
  entry.source = JSON.stringify(parsed);
  assert.throws(() => assertProjectRuntimeContract(workflows), { code: "ERR_ASSERTION" });
});

test("the protected publisher still evaluates protected-main code", () => {
  const publisher = fs.readFileSync(path.join(workflowDirectory, "required-validation-publisher.yml"), "utf8");
  assert.match(publisher, /ref:\s*\$\{\{\s*github\.event\.repository\.default_branch\s*\}\}/u);
  assert.doesNotMatch(publisher, /pull_request_target/u);
});
