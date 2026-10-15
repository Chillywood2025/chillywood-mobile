import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { computeValidationPlan } from "../../scripts/ci/required-validation.mjs";

const workflow = parse(fs.readFileSync(".github/workflows/required-validation.yml", "utf8"));
const commands = [
  "deno test --node-modules-dir=none --no-lock supabase/functions/_shared/livekit-seat-session-enforcement_test.ts supabase/functions/_shared/watch-party-livekit-authority_test.ts",
  "deno check --node-modules-dir=none --no-lock supabase/functions/livekit-token/index.ts supabase/functions/livekit-heartbeat-monitor/index.ts",
];
function validateCanonicalLane(candidate) {
  const sensitive = candidate.jobs.sensitive;
  assert.equal(sensitive.if, "needs.plan.outputs.sensitive == 'true'");
  assert.equal(sensitive["continue-on-error"], undefined);
  assert.ok(sensitive.steps.some(step => /^denoland\/setup-deno@[a-f0-9]{40}$/u.test(step.uses ?? "")));
  const canonical = sensitive.steps.filter(step => step.name === "Run canonical Live Stage and Watch-Party Edge authority checks");
  assert.equal(canonical.length, 1, "one dedicated canonical runtime step");
  assert.equal(canonical[0].shell, "bash --noprofile --norc -eo pipefail {0}", "explicit failure propagation overrides inherited shell defaults");
  assert.equal(canonical[0].run.trim(), commands.join("\n"), "commands must execute directly without inert blocks, early exit or swallowed failures");
  for (const command of commands) {
    const steps = sensitive.steps.filter(step => step.run?.split("\n").includes(command));
    assert.equal(steps.length, 1, `canonical command must execute exactly once: ${command}`);
    assert.equal(steps[0].if, undefined, "no optional sub-gate may skip the actual runtime check");
    assert.equal(steps[0]["continue-on-error"], undefined, "canonical failures must block the job");
  }
}

test("canonical Deno authority tests and both real Edge entry typechecks recur in required validation", () => {
  validateCanonicalLane(workflow);
  for (const path of ["supabase/functions/_shared/livekit-seat-session-enforcement.ts",
    "supabase/functions/_shared/watch-party-livekit-authority.ts", "supabase/functions/livekit-token/index.ts",
    "supabase/functions/livekit-heartbeat-monitor/index.ts", "app/player/[id].tsx",
    "app/watch-party/live-stage/[partyId].tsx", "_lib/watch-party/watch-party-live-source-truth.ts"])
    assert.equal(computeValidationPlan([path]).categories.sensitive, true, path);
  for (const path of ["app/player/[id].tsx", "app/watch-party/live-stage/[partyId].tsx",
    "_lib/watch-party/watch-party-live-source-truth.ts", "_lib/watch-party/live-stage-presentation.ts"])
    assert.equal(computeValidationPlan([path]).categories.product, true, `mounted regressions run for ${path}`);
});

test("canonical CI wiring rejects removal, optional execution and swallowed failures", () => {
  for (const command of commands) for (const mutation of ["remove", "skip", "swallow"]) {
    const changed = structuredClone(workflow);
    const step = changed.jobs.sensitive.steps.find(value => value.run?.split("\n").includes(command));
    if (mutation === "remove") step.run = step.run.replace(command, "");
    else if (mutation === "skip") step.if = "false";
    else step["continue-on-error"] = true;
    assert.throws(() => validateCanonicalLane(changed), assert.AssertionError, `${mutation}: ${command}`);
  }
  for (const mutation of ["inert", "exit", "ignore", "shell", "job-swallow"]) {
    const changed = structuredClone(workflow);
    const step = changed.jobs.sensitive.steps.find(value => value.name === "Run canonical Live Stage and Watch-Party Edge authority checks");
    if (mutation === "inert") step.run = `if false; then\n${step.run}\nfi`;
    else if (mutation === "exit") step.run = `exit 0\n${step.run}`;
    else if (mutation === "ignore") step.run = `set +e\n${step.run}\ntrue`;
    else if (mutation === "shell") step.shell = "bash {0}";
    else changed.jobs.sensitive["continue-on-error"] = true;
    assert.throws(() => validateCanonicalLane(changed), assert.AssertionError, mutation);
  }
});
