#!/usr/bin/env node
import { args, emit, git, readJson } from "./lib.mjs";
import { evaluateHighRiskScope } from "./pr-scope-lib.mjs";

const options = args();
const base = options.base ?? "origin/main";
const policy = readJson("config/assurance/pr-scope-policy-v1.json");
const registry = readJson("config/assurance/feature-registry-v1.json");
const branch = git(["branch", "--show-current"]);
const waiverPath = options.waiver || (branch === "codex/first-pass-assurance-foundation" ? "config/assurance/pr-a-scope-waiver-v1.json" : null);
const waiver = waiverPath ? readJson(waiverPath) : null;
const files = git(["diff", "--name-only", base]).split(/\r?\n/gu).filter(Boolean);
const numstat = git(["diff", "--numstat", base]).split(/\r?\n/gu).filter(Boolean);
const additions = numstat.reduce((sum, line) => sum + (Number(line.split(/\s+/u)[0]) || 0), 0);
const deletions = numstat.reduce((sum, line) => sum + (Number(line.split(/\s+/u)[1]) || 0), 0);
const instruction = (file) => /(^|\/)AGENTS\.md$/u.test(file) || ["CURRENT_STATE.md", "NEXT_TASK.md"].includes(file);
const classified = files.map((file) => ({
  file,
  domains: instruction(file) ? ["documentation-metadata"] : policy.domains.filter(({ paths }) => paths.some((prefix) => file === prefix || file.startsWith(prefix))).map(({ id }) => id)
}));
const domains = [...new Set(classified.flatMap(({ domains: values }) => values))].sort();
const highRisk = policy.domains.filter(({ id, risk }) => risk === "high" && domains.includes(id)).map(({ id }) => id);
const objectiveDomains = String(options.objectiveDomains ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
const featureId = typeof options.feature === "string" ? options.feature : null;
const budget = waiver ? { files: waiver.fileBudget.waivedMaximum, lines: waiver.lineBudget.waivedMaximum } : { files: policy.defaultBudget.changedFiles, lines: policy.defaultBudget.netChangedLines };
const findings = [];
if (files.length > budget.files) findings.push({ id: "ASSURANCE_PR_FILE_BUDGET_EXCEEDED", status: "BLOCKED_INTERNAL", actual: files.length, maximum: budget.files });
if (Math.max(0, additions - deletions) > budget.lines) findings.push({ id: "ASSURANCE_PR_LINE_BUDGET_EXCEEDED", status: "BLOCKED_INTERNAL", actual: additions - deletions, maximum: budget.lines });
const scopeEvaluation = evaluateHighRiskScope({
  highRiskDomains: highRisk,
  objectiveDomains,
  featureId,
  featureDomainBundles: policy.featureDomainBundles ?? [],
  registeredFeatureIds: registry.features.map(({ featureId: id }) => id),
  policyHighRiskDomains: policy.domains.filter(({ risk }) => risk === "high").map(({ id }) => id),
  waiver
});
findings.push(...scopeEvaluation.findings);
if (waiver && (waiver.secondHighRiskDomain || !waiver.reviewer || waiver.newTimeboxHours > 8)) findings.push({ id: "ASSURANCE_SCOPE_WAIVER_INVALID", status: "BLOCKED_INTERNAL" });
emit("assurance:pr-scope", findings.length === 0, {
  base, objective: options.objective ?? waiver?.objective ?? null, changedFiles: files.length, additions, deletions, netChangedLines: additions - deletions,
  domains, highRiskDomains: highRisk, objectiveDomains, featureId, featureDomainDecision: scopeEvaluation, budget, waiver: waiver ? waiver.contractId : null, classified, findings
}, [`PR scope: ${findings.length ? "FAIL" : "PASS"} — ${files.length}/${budget.files} files, ${additions - deletions}/${budget.lines} net lines, domains ${domains.join(", ") || "none"}`]);
