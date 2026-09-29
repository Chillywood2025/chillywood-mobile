import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

// This checks that the review map stays complete and its references remain
// referenced in required CI run scripts. Conditions and actual execution still
// require the exact candidate's job results. This cannot prove adequacy, turn
// a controlled boundary into hardware proof, or change a physical verdict.
const matrix = fs.readFileSync("docs/chat/PR532_AUDITED_CASES.tsv", "utf8").trim().split("\n");
const columns = matrix.shift().split("\t");
const historical = matrix.map((line) => Object.fromEntries(line.split("\t").map((value, index) => [columns[index], value])));
const coverage = JSON.parse(fs.readFileSync("docs/chat/PR532_AUTOMATED_COVERAGE.json", "utf8"));
const workflow = fs.readFileSync(".github/workflows/required-validation.yml", "utf8");
const scripts = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts;
function commandsFor(lane, source = workflow) {
  const job = Object.values(parse(source).jobs).find((entry) => entry.name === lane);
  assert.ok(job, `required CI lane exists: ${lane}`);
  return job.steps.flatMap((step) => typeof step.run === "string" ? step.run.split("\n") : [])
    .map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).flatMap((line) => {
    const npm = line.match(/^npm run ([\w:-]+)(?:\s|$)/u);
    return npm ? [line, scripts[npm[1]] ?? ""] : [line];
  }).flatMap((line) => line.split("&&").map((command) => command.trim()));
}

function executes(file, commands) {
  const nodeCommands = commands.filter((line) => /^(?:[A-Z_][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*node\s/u.test(line));
  if (["tests/native/ChillywoodIncomingCallDeadlineTests.swift", "tests/native/ChillywoodNativeAudioTests.swift"].includes(file)) {
    const runner = file.endsWith("NativeAudioTests.swift")
      ? "scripts/test-ios-native-call-audio.mjs" : "scripts/test-ios-native-call-deadline.mjs";
    return commands.some((line) => /^node\s/u.test(line) && line.split(/\s+/u).includes(runner))
      && fs.readFileSync(runner, "utf8").includes(`readFileSync(join(root, "${file}"), "utf8")`);
  }
  if (file === "tests/assurance/ios-native-audio-root-mounted.test.mjs") {
    const runner = "scripts/test-ios-native-call-audio.mjs";
    return nodeCommands.some((line) => line.split(/\s+/u).includes(runner))
      && fs.readFileSync(runner, "utf8").includes(`["--test", "${file}"]`);
  }
  if (file.startsWith("supabase/tests/") && file.endsWith(".sql")) {
    return commands.some((line) => /^supabase\s+test\s+db(?:\s|$)/u.test(line));
  }
  if (file.startsWith("tools/android-native-call-harness/") && file.endsWith("Test.kt")) {
    const runner = "scripts/test-android-incoming-call-deadline.mjs";
    return nodeCommands.some((line) => line.includes(`${runner} --android`))
      && fs.readFileSync(runner, "utf8").includes(`"${path.posix.basename(file)}"`);
  }
  return nodeCommands.some((line) => {
    const tokens = line.split(/\s+|&&|;/u).map((token) => token.replace(/^\.\//u, ""));
    return tokens.includes(file) || (
      tokens.includes("tests/*.test.mjs") && /^tests\/[^/]+\.test\.mjs$/u.test(file)
    );
  });
}

test("all 104 historical cases retain individual software proof and physical limitations", () => {
  assert.equal(historical.length, 104);
  assert.equal(coverage.physical_qualification, "NOT QUALIFIED");
  assert.equal(new Set(coverage.rows.map((row) => row.case_id)).size, 104);
  assert.deepEqual(coverage.rows.map((row) => row.case_id), historical.map((row) => row.case_id));
  const statuses = new Set(["AUTOMATED_MECHANISM", "PARTIAL_AUTOMATION", "PHYSICAL_ONLY", "UNSUPPORTED_CAPABILITY"]);
  for (const [index, row] of coverage.rows.entries()) {
    const original = historical[index];
    assert.equal(row.original_scenario, original.original_scenario, row.case_id);
    assert.equal(row.reported_status, original.reported_status, `${row.case_id}: no historical status promotion`);
    assert.ok(statuses.has(row.coverage_status), row.case_id);
    for (const field of ["software_proof", "controlled_assumptions", "physical_remainder", "software_gap"]) {
      assert.equal(typeof row[field], "string", `${row.case_id}.${field}`);
      assert.ok(row[field].trim().length > 0, `${row.case_id}.${field} must be explicit`);
    }
    assert.ok(Array.isArray(row.automated_refs), row.case_id);
    if (row.coverage_status === "AUTOMATED_MECHANISM") assert.ok(row.automated_refs.length > 0, row.case_id);
  }
});

test("a commented command or step title cannot stand in for an executed coverage entry", () => {
  const file = "tests/assurance/example.test.mjs";
  const source = `jobs:\n  product:\n    name: Validation / Product\n    steps:\n      - name: node --test ${file}\n        run: |\n          # node --test ${file}\n          echo node --test ${file}\n`;
  assert.equal(executes(file, commandsFor("Validation / Product", source)), false);
  assert.equal(executes("supabase/tests/example.sql", ["echo supabase test db"]), false);
  assert.equal(executes("tools/android-native-call-harness/ChillyChatIncomingCallNotificationTest.kt",
    ["echo node scripts/test-android-incoming-call-deadline.mjs --android"]), false);
});

test("coverage references point to existing assertions in their named CI run scripts", () => {
  const checked = new Set();
  for (const row of coverage.rows) for (const reference of row.automated_refs) {
    const key = JSON.stringify(reference);
    if (checked.has(key)) continue;
    checked.add(key);
    const { file, anchor, ci_lane: lane } = reference;
    assert.ok(/^(tests|scripts|supabase\/tests|tools\/android-native-call-harness)\//u.test(file), `${row.case_id}: test source only`);
    assert.equal(path.posix.normalize(file), file, `${row.case_id}: confined reference`);
    assert.ok(!file.split("/").includes(".."), `${row.case_id}: confined reference`);
    assert.ok(typeof anchor === "string" && anchor.trim().length > 0, file);
    assert.ok(fs.readFileSync(file, "utf8").includes(anchor), `${row.case_id}: stale assertion reference in ${file}: ${anchor}`);
    assert.ok(executes(file, commandsFor(lane)), `${row.case_id}: ${file} is not an entry point in ${lane}`);
  }
});
