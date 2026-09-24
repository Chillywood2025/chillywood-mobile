#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const instructionFiles = [
  "AGENTS.md",
  ".github/AGENTS.md",
  ".agents/skills/chillywood-assurance/SKILL.md",
  "app/AGENTS.md",
  "plugins/AGENTS.md",
  "scripts/assurance/AGENTS.md",
  "supabase/AGENTS.md",
];
const workflowFiles = fs.readdirSync(path.join(root, ".github/workflows"))
  .filter((file) => /\.ya?ml$/u.test(file))
  .map((file) => `.github/workflows/${file}`);
const activeFiles = [...instructionFiles, ...workflowFiles];
const forbidden = [
  "scripts/assurance/active-task.mjs",
  "scripts/assurance/current-truth.mjs",
  "scripts/assurance/engineering-closure.mjs",
  "scripts/assurance/jurisdiction-policy.mjs",
  "scripts/assurance/late-review-sentinel.mjs",
  "scripts/assurance/phase1-admission.mjs",
  "scripts/assurance/pr-scope.mjs",
];

for (const file of activeFiles) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`ACTIVE_FILE_MISSING:${file}`);
  else for (const needle of forbidden) if (read(file).includes(needle)) failures.push(`RETIRED_CALLER:${file}:${needle}`);
}

for (const removed of [".github/workflows/phase1-ci.yml", ".github/workflows/phase1-admission.yml", ".github/workflows/codex-review-exact-head.yml"]) {
  if (fs.existsSync(path.join(root, removed))) failures.push(`RETIRED_WORKFLOW_PRESENT:${removed}`);
}

const packageJson = JSON.parse(read("package.json"));
const retiredPattern = /CURRENT_STATE\.md|NEXT_TASK\.md|config\/assurance\/current-truth-v1\.json|scripts\/assurance\/(?:active-task|current-truth|engineering-closure|jurisdiction-policy|pr-scope|control-plane-lifecycle|phase1-admission)/u;
const commandFiles = (command) => [...command.matchAll(/(?:node\s+)(?:\.\/)?(scripts\/[A-Za-z0-9_./-]+\.(?:mjs|js))/gu)].map((match) => match[1]);
const commandScripts = (command) => [...command.matchAll(/npm run ([\w:-]+)/gu)]
  .filter((match) => {
    const commandTail = command.slice(match.index + match[0].length).split(/&&|\|\||;/u, 1)[0];
    return !/(?:^|\s)--prefix(?:\s|=)/u.test(commandTail);
  })
  .map((match) => match[1]);
const reachableFiles = (initial) => {
  const pending = [...initial];
  const seen = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file) || !fs.existsSync(path.join(root, file))) continue;
    seen.add(file);
    const source = read(file);
    for (const match of source.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*["'](\.[^"']+)["']/gu)) {
      const base = path.normalize(path.join(path.dirname(file), match[1]));
      for (const candidate of [base, `${base}.mjs`, `${base}.js`, `${base}.ts`]) if (fs.existsSync(path.join(root, candidate))) pending.push(candidate);
    }
  }
  return seen;
};
const reachableScripts = (initial) => {
  const pending = [...initial];
  const seen = new Set();
  const files = [];
  while (pending.length) {
    const name = pending.pop();
    if (seen.has(name) || !packageJson.scripts[name]) continue;
    seen.add(name);
    files.push(...commandFiles(packageJson.scripts[name]));
    pending.push(...commandScripts(packageJson.scripts[name]));
  }
  return reachableFiles(files);
};

for (const name of Object.keys(packageJson.scripts)) {
  if (retiredPattern.test(packageJson.scripts[name])) failures.push(`ACTIVE_COMMAND_RETIRED_DEPENDENCY:${name}:package.json`);
  for (const dependency of commandScripts(packageJson.scripts[name])) if (!packageJson.scripts[dependency]) failures.push(`ACTIVE_COMMAND_MISSING_SCRIPT:${name}:${dependency}`);
  for (const file of reachableScripts([name])) if (retiredPattern.test(read(file))) failures.push(`ACTIVE_COMMAND_RETIRED_DEPENDENCY:${name}:${file}`);
}

for (const workflow of activeFiles.filter((file) => file.startsWith(".github/workflows/"))) {
  const source = read(workflow);
  if (retiredPattern.test(source)) failures.push(`ACTIVE_WORKFLOW_RETIRED_DEPENDENCY:${workflow}:workflow-source`);
  const files = commandFiles(source);
  const scripts = commandScripts(source);
  for (const name of scripts) if (!packageJson.scripts[name]) failures.push(`ACTIVE_WORKFLOW_MISSING_SCRIPT:${workflow}:${name}`);
  for (const file of new Set([...reachableFiles(files), ...reachableScripts(scripts)])) if (retiredPattern.test(read(file))) failures.push(`ACTIVE_WORKFLOW_RETIRED_DEPENDENCY:${workflow}:${file}`);
}

const requiredWorkflow = read(".github/workflows/required-validation.yml");
if (/pull_request_target|workflow_run/u.test(requiredWorkflow)) failures.push("UNTRUSTED_SOURCE_WORKFLOW_PRIVILEGED_TRIGGER");
if (!requiredWorkflow.includes("Validation / Results") || !requiredWorkflow.includes("if: always()")) failures.push("SOURCE_FINAL_RESULT_MISSING");
const publisher = read(".github/workflows/required-validation-publisher.yml");
if (!publisher.includes("workflow_run") || !publisher.includes("scripts/ci/required-validation.mjs --publish")
  || !publisher.includes("environment: phase1-admission-publisher") || !publisher.includes("PHASE1_ADMISSION_APP_PRIVATE_KEY")) failures.push("TRUSTED_PUBLISHER_INVALID");
if (requiredWorkflow.includes("Chi'llywood / Required Validation")) failures.push("SOURCE_WORKFLOW_FORGES_REQUIRED_NAME");
if (requiredWorkflow.includes("PHASE1_ADMISSION_APP_") || requiredWorkflow.includes("phase1-admission-publisher")) failures.push("SOURCE_WORKFLOW_HAS_PUBLISHER_AUTHORITY");
const validationPolicy = JSON.parse(read("config/ci/required-validation-v1.json"));
const rulesetTarget = JSON.parse(read("config/ci/main-ruleset-v2.json"));
if (validationPolicy.publisherApp?.integrationId !== 4707730
  || JSON.stringify(validationPolicy.publisherApp?.permissions) !== JSON.stringify({ checks: "write", metadata: "read" })
  || rulesetTarget.requiredStatusChecks?.length !== 1
  || rulesetTarget.requiredStatusChecks[0]?.context !== validationPolicy.requiredCheckName
  || rulesetTarget.requiredStatusChecks[0]?.integrationId !== validationPolicy.publisherApp.integrationId
  || rulesetTarget.permanentBypassActors?.length !== 0) failures.push("REQUIRED_PUBLISHER_PROVENANCE_INVALID");

const result = { ok: failures.length === 0, failures };
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.ok) process.exitCode = 1;
