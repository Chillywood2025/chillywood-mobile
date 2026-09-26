import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
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

test("workflow runtime correction does not change the project Node 20 matrix or suppress warnings", () => {
  const sources = readWorkflows().map(({ source }) => source).join("\n");
  const configuredNodeVersions = [...sources.matchAll(/node-version:\s*([^,}\s]+)/gu)].map((match) => match[1]);
  assert.ok(configuredNodeVersions.length > 0, "expected explicit project Node versions");
  assert.ok(configuredNodeVersions.every((version) => version === "20"), "project compatibility jobs must remain on Node 20");
  assert.doesNotMatch(sources, /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION|FORCE_JAVASCRIPT_ACTIONS_TO_NODE24/u);
});

test("the protected publisher still evaluates protected-main code", () => {
  const publisher = fs.readFileSync(path.join(workflowDirectory, "required-validation-publisher.yml"), "utf8");
  assert.match(publisher, /ref:\s*\$\{\{\s*github\.event\.repository\.default_branch\s*\}\}/u);
  assert.doesNotMatch(publisher, /pull_request_target/u);
});
