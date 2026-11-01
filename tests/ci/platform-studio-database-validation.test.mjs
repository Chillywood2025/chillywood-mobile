import {assertDatabaseUpgradeCI} from '../helpers/assert-database-upgrade-ci.mjs';
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { computeValidationPlan } from "../../scripts/ci/required-validation.mjs";

const workflow = parse(fs.readFileSync(".github/workflows/required-validation.yml", "utf8"));
const projectId = fs.readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"\s*$/mu)?.[1];
assert.ok(projectId, "local Supabase project_id is explicit and safe");
const command = `SUPABASE_DB_CONTAINER=supabase_db_${projectId} node scripts/test-platform-studio-authority-concurrency.mjs`;
function assertNativeDatabaseGate(candidate) {
  const job = candidate.jobs.database;
  assert.equal(job.if, "needs.plan.outputs.database == 'true'");
  assert.equal(job["continue-on-error"], undefined);
  const steps = job.steps.filter(step => step.run?.split("\n").includes(command));
  assert.equal(steps.length, 1, "real PostgreSQL concurrency must execute exactly once");
  const step = steps[0];
  assert.equal(step.if, undefined, "concurrency is not an optional sub-gate");
  assert.equal(step["continue-on-error"], undefined, "a concurrency failure blocks required validation");
  assertDatabaseUpgradeCI(step.run);
  const commands = step.run.split("\n");
  const start = commands.indexOf("supabase start"), reset = commands.indexOf("supabase db reset --local --version 20261031204321");
  const pgTap = commands.indexOf("supabase test db"), concurrency = commands.indexOf(command);
  assert.ok(start >= 0 && start < reset && reset < pgTap && pgTap < concurrency,
    "execute real concurrency only after local Supabase start, full migration replay and pgTAP");
}

test("Platform Studio database authority changes require real PostgreSQL concurrency after full schema replay", () => {
  assertNativeDatabaseGate(workflow);
  assert.equal(computeValidationPlan([
    "supabase/migrations/20261015073423_platform_studio_publication_and_audience_authority.sql",
  ]).categories.database, true);
});

test("Studio database CI guard rejects omitted, skipped, swallowed, wrong-target and pre-migration concurrency", () => {
  for (const mutation of ["omit", "skip", "swallow", "wrong-target", "before-reset"]) {
    const changed = structuredClone(workflow);
    const step = changed.jobs.database.steps.find(value => value.run?.split("\n").includes(command));
    if (mutation === "omit") step.run = step.run.replace(command, "");
    else if (mutation === "skip") step.if = "false";
    else if (mutation === "swallow") step["continue-on-error"] = true;
    else if (mutation === "wrong-target") {
      // Other required runners share this container. Mutate this exact command,
      // not the first container occurrence elsewhere in the shell block.
      step.run = step.run.replace(command, command.replace(`supabase_db_${projectId}`, "supabase_db_wrong_checkout_name"));
    }
    else step.run = `${command}\n${step.run.replace(command, "")}`;
    assert.throws(() => assertNativeDatabaseGate(changed), assert.AssertionError, mutation);
  }
});
