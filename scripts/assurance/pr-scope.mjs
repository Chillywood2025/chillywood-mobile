#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";

import { args, classifyGitHubExecutionIdentity, emit, evaluateProtectedMainAdvancement, git, readJson, resolveAssuranceControlSourceOnlyProfile, stableJson, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE } from "./lib.mjs";
import { canonicalGitDiffArgs, canonicalGitDiffHash, observeTypedTaskAuthorities } from "./engineering-closure.mjs";
import { classifyPrScopePaths, deriveTaskScopeContext, evaluateHighRiskScope, validatePullRequestEventIdentity } from "./pr-scope-lib.mjs";

const options = args();
const policy = readJson("config/assurance/pr-scope-policy-v1.json");
const registry = readJson("config/assurance/feature-registry-v1.json");
const currentTruth = readJson("config/assurance/current-truth-v1.json");
const currentTruthContract = readJson("config/assurance/current-truth-contract-v1.json");
const protectedMainRuntime = evaluateProtectedMainAdvancement({ record: currentTruth, contract: currentTruthContract });

const readGitScope = (base, head) => {
  const range = `${base}...${head}`;
  const files = git(["diff", "--name-only", range]).split(/\r?\n/gu).filter(Boolean).sort();
  const numstat = git(["diff", "--numstat", range]).split(/\r?\n/gu).filter(Boolean);
  if (numstat.some((line) => line.split("\t", 2).some((value) => value === "-"))) throw new Error("ASSURANCE_GIT_DIFF_BINARY_SCOPE_UNREADABLE");
  const additions = numstat.reduce((sum, line) => sum + (Number(line.split("\t")[0]) || 0), 0);
  const deletions = numstat.reduce((sum, line) => sum + (Number(line.split("\t")[1]) || 0), 0);
  const diff = git(canonicalGitDiffArgs(`${base}...${head}`));
  return { files, additions, deletions, diffHash: canonicalGitDiffHash(diff) };
};
const readPull = (repository, pr) => {
  if (repository !== "Chillywood2025/chillywood-mobile" || !Number.isInteger(pr) || pr < 1) return null;
  const options = { encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 }; const authenticated = spawnSync("gh", ["api", "--method=GET", `repos/${repository}/pulls/${pr}`], options); const result = authenticated.status === 0 ? authenticated : spawnSync("curl", ["--fail", "--silent", "--show-error", "--connect-timeout", "5", "--max-time", "20", "--header", "Accept: application/vnd.github+json", "--header", "X-GitHub-Api-Version: 2022-11-28", "--header", "User-Agent: chillywood-assurance-readonly", `https://api.github.com/repos/${repository}/pulls/${pr}`], options);
  if (result.status !== 0) return null;
  try {
    const pull = JSON.parse(result.stdout);
    return { number: pull.number, repository: pull.base?.repo?.full_name, baseRepository: pull.base?.repo?.full_name, baseRef: pull.base?.ref, baseSha: pull.base?.sha, headRepository: pull.head?.repo?.full_name, headRef: pull.head?.ref, headSha: pull.head?.sha, mergeCommitSha: pull.merge_commit_sha, draft: pull.draft, htmlUrl: pull.html_url, state: pull.state };
  } catch {
    return null;
  }
};

if (typeof options.githubEvent !== "string") {
  const branch = git(["branch", "--show-current"]);
  const exactS0 = branch === "codex/assurance-codex-security-scan-reliability-s0"
    && options.feature === "codex-security-scan-reliability-s0"
    && options.waiver === "config/assurance/codex-security-reliability-s0-scope-waiver-v1.json";
  emit("assurance:pr-scope", false, {
    mode: "TASK_CONTEXT_REQUIRED",
    branch,
    findings: [{ id: exactS0 ? "ASSURANCE_HISTORICAL_S0_EVENT_IDENTITY_REQUIRED" : "ASSURANCE_CALLER_SCOPE_CONTEXT_REJECTED", status: "BLOCKED_INTERNAL" }]
  }, ["PR scope: FAIL — exact GitHub event task context required"]);
  process.exit(1);
}

let event;
try {
  event = JSON.parse(fs.readFileSync(options.githubEvent, "utf8"));
} catch {
  emit("assurance:pr-scope", false, { findings: [{ id: "ASSURANCE_GITHUB_EVENT_UNREADABLE", status: "BLOCKED_INTERNAL" }] });
  process.exit(1);
}

if (!event.pull_request) {
  const exactProtectedPush = event?.repository?.full_name === "Chillywood2025/chillywood-mobile"
    && event?.ref === "refs/heads/main"
    && /^[0-9a-f]{40}$/u.test(event?.before ?? "")
    && /^[0-9a-f]{40}$/u.test(event?.after ?? "");
  emit("assurance:pr-scope", exactProtectedPush, {
    mode: "PROTECTED_MAIN_PUSH_NO_PULL_REQUEST_SCOPE",
    repository: event?.repository?.full_name ?? null,
    before: event?.before ?? null,
    after: event?.after ?? null,
    findings: exactProtectedPush ? [] : [{ id: "ASSURANCE_GITHUB_EVENT_IDENTITY_INVALID", status: "BLOCKED_INTERNAL" }]
  }, [`PR scope: ${exactProtectedPush ? "PASS" : "FAIL"} — protected-main push context`]);
  if (!exactProtectedPush) process.exitCode = 1;
} else {
  const repository = event.repository?.full_name;
  const pr = event.number;
  const readback = readPull(repository, pr);
  const validatedIdentity = validatePullRequestEventIdentity(event, readback);
  const executionIdentity = validatedIdentity.ok ? classifyGitHubExecutionIdentity({ event, livePullRequest: readback, authoritativeSourceIdentity: validatedIdentity.identity }) : null;
  const base = validatedIdentity.identity?.baseSha ?? event.pull_request?.base?.sha;
  const head = validatedIdentity.identity?.headSha ?? event.pull_request?.head?.sha;
  let scope = { files: [], additions: 0, deletions: 0, netChangedLines: 0 };
  let tree = null;
  try {
    scope = readGitScope(base, head);
    scope.netChangedLines = Math.max(0, scope.additions - scope.deletions);
    tree = git(["rev-parse", `${head}^{tree}`]);
  } catch {}
  const typedAuthorities = validatedIdentity.ok && tree
    ? observeTypedTaskAuthorities({ identity: validatedIdentity.identity, tree, scope, currentTruth })
    : { architectureAuthority: null, terminalTruthAuthority: null, finiteTaskAuthority: null, finiteTaskAdmissionAuthority: null };
  const context = deriveTaskScopeContext({
    event,
    readback,
    policy,
    registry,
    currentTruth,
    protectedMainRuntime,
    ...typedAuthorities,
    requestedFeature: options.feature ?? null,
    requestedWaiver: options.waiver ?? null,
    observedChangedPaths: scope.files,
    observedCanonicalChangedLines: scope.additions + scope.deletions,
  });
  const findings = context.findings.map((id) => ({ id, status: "BLOCKED_INTERNAL" }));
  if (executionIdentity?.relationship?.valid !== true) findings.push({ id: "ASSURANCE_GITHUB_EXECUTION_IDENTITY_INVALID", status: "BLOCKED_INTERNAL", reasons: executionIdentity?.relationship?.findings ?? [] });
  if (!tree) {
    findings.push({ id: "ASSURANCE_GIT_DIFF_CONTEXT_UNREADABLE", status: "BLOCKED_INTERNAL" });
  }
  const classified = classifyPrScopePaths(scope.files, policy);
  const domains = [...new Set(classified.flatMap(({ domains: values }) => values))].sort();
  const highRisk = policy.domains.filter(({ id, risk }) => risk === "high" && domains.includes(id)).map(({ id }) => id);
  const waiver = context.ok && context.historicalWaiverPath ? readJson(context.historicalWaiverPath) : null;
  const budget = context.budget
    ? { files: context.budget.maximumFiles, lines: context.budget.maximumHandAuthoredNetLines, generatedGraphLines: context.budget.maximumGeneratedGraphLines, source: context.authoritySource ?? context.contextType }
    : waiver
      ? { files: waiver.fileBudget.waivedMaximum, lines: waiver.lineBudget.waivedMaximum, source: waiver.contractId }
      : { files: policy.defaultBudget.changedFiles, lines: policy.defaultBudget.netChangedLines, source: "pr-scope-policy-v1" };
  if (context.authoritySource === "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1" && (stableJson(scope.files) !== stableJson(TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS) || scope.files.length !== TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE.maximumFiles || scope.additions + scope.deletions > TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE.maximumNetLines || budget.files !== TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE.maximumFiles || budget.lines !== TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE.maximumNetLines)) {
    findings.push({ id: "ASSURANCE_TERMINAL_VERIFIER_REPAIR_PROFILE_INVALID", status: "BLOCKED_INTERNAL" });
  }
  if (context.authoritySource === "IMMUTABLE_OWNER_ARCHITECTURE_MAINTENANCE" && Number.isInteger(context.budget?.maximumChangedLines)) {
    const profile = resolveAssuranceControlSourceOnlyProfile({ changedPaths: scope.files, budget: context.budget, changedFiles: scope.files.length });
    if (!profile || scope.additions + scope.deletions > profile.maximumChangedLines) findings.push({ id: "ASSURANCE_CONTROL_SOURCE_ONLY_PROFILE_INVALID", status: "BLOCKED_INTERNAL" });
  }
  if (scope.files.length > budget.files) findings.push({ id: "ASSURANCE_PR_FILE_BUDGET_EXCEEDED", status: "BLOCKED_INTERNAL", actual: scope.files.length, maximum: budget.files });
  if (Math.max(0, scope.additions - scope.deletions) > budget.lines) findings.push({ id: "ASSURANCE_PR_LINE_BUDGET_EXCEEDED", status: "BLOCKED_INTERNAL", actual: scope.additions - scope.deletions, maximum: budget.lines });
  const scopeEvaluation = evaluateHighRiskScope({
    highRiskDomains: highRisk,
    objectiveDomains: context.objectiveDomains ?? [],
    featureId: context.featureId,
    featureDomainBundles: policy.featureDomainBundles ?? [],
    registeredFeatureIds: registry.features.map(({ featureId }) => featureId),
    policyHighRiskDomains: policy.domains.filter(({ risk }) => risk === "high").map(({ id }) => id),
    waiver,
    finiteTaskPrRiskAuthority: context.finiteTaskPrRiskAuthority
  });
  findings.push(...scopeEvaluation.findings);
  if (waiver && (waiver.secondHighRiskDomain || !waiver.reviewer || waiver.newTimeboxHours > 8)) findings.push({ id: "ASSURANCE_SCOPE_WAIVER_INVALID", status: "BLOCKED_INTERNAL" });
  emit("assurance:pr-scope", findings.length === 0, {
    mode: "GITHUB_EVENT_TASK_CONTEXT",
    base,
    head,
    taskContext: context,
    changedFiles: scope.files.length,
    additions: scope.additions,
    deletions: scope.deletions,
    netChangedLines: scope.netChangedLines,
    domains,
    highRiskDomains: highRisk,
    primaryFeatureId: context.primaryFeatureId,
    affectedFeatureIds: context.affectedFeatureIds ?? [],
    authorizedPrRiskDomains: scopeEvaluation.authorizedPrRiskDomains ?? [],
    observedPrRiskDomains: scopeEvaluation.observedPrRiskDomains ?? highRisk,
    objectiveDomains: context.objectiveDomains ?? [],
    supportingDomains: context.supportingDomains ?? [],
    featureId: context.featureId,
    finiteTaskPrRiskAuthority: context.finiteTaskPrRiskAuthority,
    featureDomainDecision: scopeEvaluation,
    budget,
    waiver: waiver ? waiver.contractId : null,
    classified,
    executionIdentity,
    findings
  }, [`PR scope: ${findings.length ? "FAIL" : "PASS"} — ${scope.files.length}/${budget.files} files, ${scope.additions - scope.deletions}/${budget.lines} net lines, task ${context.bindingId ?? "unbound"}`]);
}
