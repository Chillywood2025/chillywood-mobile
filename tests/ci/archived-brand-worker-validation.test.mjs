import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { computeValidationPlan } from "../../scripts/ci/required-validation.mjs";

const workflow = parse(readFileSync(".github/workflows/required-validation.yml", "utf8"));
const build = "docker build --tag chillywood-archived-scanner-test --file ops/malware-scanner-worker/Dockerfile ops/malware-scanner-worker";
const run = 'docker run --rm --network none --entrypoint node --volume "$PWD:/workspace:ro" --workdir /workspace chillywood-archived-scanner-test scripts/test-archived-brand-worker-clamav.mjs';
const unit = "node --test tests/archived-brand-verification.test.mjs tests/archived-brand-worker.test.mjs";

test("standalone archived runner remains explicitly inventoried as source-only manual evidence work", () => {
  const inventory = JSON.parse(readFileSync("config/autonomy/autonomous-components.json", "utf8"));
  const matches = inventory.components.filter(component => component.paths.includes("ops/malware-scanner-worker/archived-brand-worker.mjs"));
  assert.equal(matches.length, 1);
  const component = matches[0];
  assert.equal(component.id, "archived_brand_verification");
  assert.equal(component.componentType, "non_autonomous_utility");
  assert.equal(component.deploymentState, "source_complete");
  assert.equal(component.approvalLevel, 3);
  assert.equal(component.schedulerCadence, "none; explicitly approved one-shot with one or two request IDs, at most three lifetime attempts per request");
  assert.equal(component.killSwitch, "keep archived_verification_enabled=false and ARCHIVED_BRAND_VERIFICATION_ONCE unset");
  assert.deepEqual(component.allowedWrites, ["immutable bounded attempt, observed scanner result, sealed receipt and existing Brand retention proof only"]);
  assert.deepEqual(component.forbiddenScope, ["ordinary scan jobs", "delivery or moderation changes", "tombstone or retention-clock reset",
    "deletion claims or provider deletion", "automatic polling or retries", "credential or raw private output", "fabricated clean evidence"]);
});

function assertEngineGate(candidate) {
  const job = candidate.jobs.database;
  assert.equal(job.if, "needs.plan.outputs.database == 'true'");
  assert.equal(job["continue-on-error"], undefined);
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.equal(candidate.defaults?.run?.shell, undefined, "do not replace the fail-fast hosted shell");
  assert.equal(job.defaults?.run?.shell, undefined);
  let owner;
  for (const command of [build, run]) {
    const steps = job.steps.filter(step => step.run?.split("\n").includes(command));
    assert.equal(steps.length, 1, "real-engine build and invocation must execute exactly once");
    const step = steps[0];
    assert.equal(step.if, undefined, "real engine qualification is not optional");
    assert.equal(step["continue-on-error"], undefined, "engine failures fail required validation");
    assert.equal(step.shell, undefined, "retain the hosted fail-fast shell, not a failure-swallowing override");
    assert.equal(step.run.split("\n").filter(line => line === command).length, 1);
    assert.doesNotMatch(step.run, /(?:\|\||&&|;|(?:^|\n)\s*(?:set\s+\+|if\b|then\b|fi\b|for\b|while\b|until\b|case\b|exit\b|return\b|trap\b|function\b|[A-Za-z_][A-Za-z0-9_]*\s*\(\)\s*\{))/,
      "required proof must not be conditionally skipped, shadowed, or have errors swallowed");
    if (owner) assert.equal(step, owner, "build and isolated run belong in the same required block");
    owner = step;
  }
  const lines = owner.run.split("\n");
  const start = lines.indexOf("supabase start"), reset = lines.indexOf("supabase db reset"), tap = lines.indexOf("supabase test db");
  assert.ok(start >= 0 && start < reset && reset < tap && tap < lines.indexOf(unit) && lines.indexOf(unit) < lines.indexOf(build));
  assert.equal(lines.indexOf(run), lines.indexOf(build) + 1, "the freshly built scanner image is used immediately, without setup or signature updates");
}

test("archived worker requires real ClamAV in the existing image, network-none, explicit node entrypoint and readonly checkout", () => {
  assertEngineGate(workflow);
  for (const path of ["ops/malware-scanner-worker/archived-brand-worker.mjs", "ops/malware-scanner-worker/Dockerfile",
    "tests/archived-brand-worker.test.mjs", "tests/helpers/archived-brand-worker-fixture.mjs",
    "scripts/test-archived-brand-worker-clamav.mjs", "tests/ci/archived-brand-worker-validation.test.mjs"]) {
    assert.equal(computeValidationPlan([path]).categories.database, true, path);
  }
});

test("real-engine gate mutation controls reject omission, duplicates, skips, swallowed failures and reordered qualification", () => {
  for (const command of [build, run]) for (const mode of ["omit", "duplicate-step", "duplicate-line", "skip-job", "skip-step",
    "swallow-job", "swallow-step", "shell-swallow", "disable-errexit", "conditional-wrapper", "shadow-docker", "shell-override",
    "job-shell-override", "workflow-shell-override", "before-reset", "separate-step"]) {
    const changed = structuredClone(workflow), job = changed.jobs.database;
    const step = job.steps.find(value => value.run?.split("\n").includes(command));
    const remove = () => { step.run = step.run.split("\n").filter(line => line !== command).join("\n"); };
    if (mode === "omit") remove();
    if (mode === "duplicate-step") job.steps.push({ run: command });
    if (mode === "duplicate-line") step.run += `\n${command}`;
    if (mode === "skip-job") job.if = "false";
    if (mode === "skip-step") step.if = "false";
    if (mode === "swallow-job") job["continue-on-error"] = true;
    if (mode === "swallow-step") step["continue-on-error"] = true;
    if (mode === "shell-swallow") step.run = step.run.replace(command, `${command} || true`);
    if (mode === "disable-errexit") step.run = `set +e\n${step.run}`;
    if (mode === "conditional-wrapper") step.run = `if false; then\n${step.run}\nfi`;
    if (mode === "shadow-docker") step.run = `docker() { true; }\n${step.run}`;
    if (mode === "shell-override") step.shell = "bash {0}";
    if (mode === "job-shell-override") job.defaults = { run: { shell: "bash {0}" } };
    if (mode === "workflow-shell-override") changed.defaults = { run: { shell: "bash {0}" } };
    if (mode === "before-reset") { remove(); step.run = `${command}\n${step.run}`; }
    if (mode === "separate-step") { remove(); job.steps.push({ run: command }); }
    assert.throws(() => assertEngineGate(changed), assert.AssertionError, `${command}: ${mode}`);
  }
});

test("real-engine gate rejects another build context, writable mount, network, entrypoint, image, script or credential injection", () => {
  for (const [command, replacement] of [
    [build, build.replace("--file ops/malware-scanner-worker/Dockerfile", "--file other/Dockerfile")],
    [build, build.replace(/ops\/malware-scanner-worker$/, ".")],
    [build, build.replace("chillywood-archived-scanner-test", "prebuilt-unverified-scanner")],
    [run, run.replace("--network none", "--network host")],
    [run, run.replace("--network none ", "")],
    [run, run.replace(":/workspace:ro", ":/workspace:rw")],
    [run, run.replace("--entrypoint node", "--entrypoint ./worker.mjs")],
    [run, run.replace("--entrypoint node ", "")],
    [run, run.replace("--workdir /workspace", "--workdir /app")],
    [run, run.replace("chillywood-archived-scanner-test", "prebuilt-unverified-scanner")],
    [run, run.replace("scripts/test-archived-brand-worker-clamav.mjs", "tests/archived-brand-worker.test.mjs")],
    [run, run.replace("docker run ", "docker run --env SUPABASE_SERVICE_ROLE_KEY ")],
    [run, `${run} || true`],
  ]) {
    const changed = structuredClone(workflow);
    const step = changed.jobs.database.steps.find(value => value.run?.split("\n").includes(command));
    step.run = step.run.replace(command, replacement);
    assert.throws(() => assertEngineGate(changed), assert.AssertionError, replacement);
  }
  const changed = structuredClone(workflow);
  const step = changed.jobs.database.steps.find(value => value.run?.split("\n").includes(build));
  step.run = step.run.replace(`${build}\n${run}`, `${run}\n${build}`);
  assert.throws(() => assertEngineGate(changed), assert.AssertionError, "run must follow this exact image build");
});
