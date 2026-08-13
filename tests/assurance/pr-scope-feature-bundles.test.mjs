import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { deriveTaskScopeContext, evaluateHighRiskScope, validateFeatureDomainBundles } from "../../scripts/assurance/pr-scope-lib.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const policy = JSON.parse(fs.readFileSync(`${root}/config/assurance/pr-scope-policy-v1.json`, "utf8"));
const registry = JSON.parse(fs.readFileSync(`${root}/config/assurance/feature-registry-v1.json`, "utf8"));
const registeredFeatureIds = registry.features.map(({ featureId }) => featureId);
const policyHighRiskDomains = policy.domains.filter(({ risk }) => risk === "high").map(({ id }) => id);

const evaluate = ({
  highRiskDomains,
  objectiveDomains = highRiskDomains,
  featureId,
  waiver = null
}) => evaluateHighRiskScope({
  highRiskDomains,
  objectiveDomains,
  featureId,
  featureDomainBundles: policy.featureDomainBundles,
  registeredFeatureIds,
  policyHighRiskDomains,
  waiver
});

const finding = (result, id) => result.findings.find((entry) => entry.id === id);
const pullFixture = ({ pr, branch, head = "a".repeat(40), base = "b".repeat(40), title = "fixture" }) => ({
  event: {
    number: pr,
    repository: { full_name: "Chillywood2025/chillywood-mobile" },
    pull_request: { number: pr, title, state: "open", html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${pr}`, base: { ref: "main", sha: base }, head: { ref: branch, sha: head } }
  },
  readback: { number: pr, repository: "Chillywood2025/chillywood-mobile", baseRef: "main", baseSha: base, headRef: branch, headSha: head, htmlUrl: `https://github.com/Chillywood2025/chillywood-mobile/pull/${pr}`, state: "open" }
});
const derive = ({ fixture, truth = { finiteTaskLeases: { tasks: [] } }, ownerAuthority = null, taskPolicy = policy, requestedFeature = null, requestedWaiver = null }) => deriveTaskScopeContext({ event: fixture.event, readback: fixture.readback, policy: taskPolicy, registry, currentTruth: truth, ownerAuthority, requestedFeature, requestedWaiver });

test("policy bundles reference registered features and known high-risk domains", () => {
  assert.deepEqual(validateFeatureDomainBundles({
    featureDomainBundles: policy.featureDomainBundles,
    registeredFeatureIds,
    policyHighRiskDomains
  }), []);
});

test("policy validation rejects a universal high-risk bundle", () => {
  const findings = validateFeatureDomainBundles({
    featureDomainBundles: [{
      featureId: "livekit-media-transport",
      allowedHighRiskDomains: policyHighRiskDomains
    }],
    registeredFeatureIds,
    policyHighRiskDomains
  });
  assert.equal(findings[0].id, "ASSURANCE_SCOPE_POLICY_INVALID");
  assert.equal(findings[0].universalBundle, true);
});

test("LiveKit source binding may bind Cognitive and database source under its registered feature", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "database-RLS"],
    featureId: "livekit-media-transport"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, true);
  assert.deepEqual(result.findings, []);
});

test("RevenueCat reconciliation may bind provider and database source under its registered feature", () => {
  const result = evaluate({
    highRiskDomains: ["RevenueCat-Premium", "database-RLS"],
    featureId: "revenuecat-premium"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, true);
  assert.deepEqual(result.findings, []);
});

test("PR52-like LiveKit, RevenueCat, and database scope remains mixed", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "RevenueCat-Premium", "database-RLS"],
    featureId: "livekit-media-transport"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.equal(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE").reason, "domain-outside-feature-bundle");
  assert.deepEqual(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE").outsideBundle, ["RevenueCat-Premium"]);
});

test("an objective domain list cannot self-authorize multiple high-risk domains", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "database-RLS"]
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.equal(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE").reason, "explicit-feature-required");
});

test("an unknown feature cannot authorize multiple high-risk domains", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "database-RLS"],
    featureId: "unregistered-feature"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.equal(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE").reason, "feature-not-registered");
});

test("a registered feature without a compact bundle cannot authorize multiple high-risk domains", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "database-RLS"],
    featureId: "supabase-migrations-rls"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.equal(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE").reason, "feature-bundle-not-declared");
});

test("hostile objective omission keeps an otherwise matching bundle unauthorized", () => {
  const result = evaluate({
    highRiskDomains: ["RevenueCat-Premium", "database-RLS"],
    objectiveDomains: ["RevenueCat-Premium"],
    featureId: "revenuecat-premium"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.equal(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE"), undefined);
  assert.deepEqual(finding(result, "ASSURANCE_OBJECTIVE_OMITS_AFFECTED_DOMAIN").domains, ["database-RLS"]);
});

test("a scope waiver cannot suppress unrelated mixed high-risk scope", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "RevenueCat-Premium", "database-RLS"],
    featureId: "livekit-media-transport",
    waiver: {
      contractId: "attempted-mixed-scope-waiver",
      reviewer: "independent-reviewer",
      secondHighRiskDomain: false
    }
  });
  assert.equal(result.scopeWaiverAuthorizesMixedRisk, false);
  assert.ok(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE"));
});

test("doctrine PR #226 context resolves from exact event and immutable Owner authority", () => {
  const fixture = pullFixture({ pr: 226, branch: "codex/whole-app-engineering-doctrine-v1", head: "c".repeat(40) });
  const result = derive({ fixture, ownerAuthority: { ok: true, repository: "Chillywood2025/chillywood-mobile", pr: 226, branch: fixture.event.pull_request.head.ref, currentHead: fixture.event.pull_request.head.sha, budget: { maximumFiles: 31, maximumHandAuthoredNetLines: 7000, maximumGeneratedGraphLines: 12000 } } });
  assert.equal(result.ok, true);
  assert.equal(result.featureId, "assurance-efficiency-e0");
  assert.deepEqual(result.objectiveDomains, ["autonomous-operators"]);
  assert.deepEqual(result.supportingDomains, ["CI-test-infrastructure"]);
  assert.equal(result.source, "IMMUTABLE_DOCTRINE_OWNER_AUTHORIZATION");
});

test("actual S0 context resolves only its historical exact waiver", () => {
  const fixture = pullFixture({ pr: 206, branch: "codex/assurance-codex-security-scan-reliability-s0" });
  const result = derive({ fixture });
  assert.equal(result.ok, true);
  assert.equal(result.featureId, "codex-security-scan-reliability-s0");
  assert.equal(result.historicalWaiverPath, "config/assurance/codex-security-reliability-s0-scope-waiver-v1.json");
  assert.equal(result.source, "PROTECTED_TASK_REGISTRY");
});

test("D2A context resolves from the exact finite lease", () => {
  const fixture = pullFixture({ pr: 212, branch: "codex/first-pass-assurance-android-generated-native-lifecycle-instrumentation" });
  const truth = { finiteTaskLeases: { tasks: [{ implementationPr: 212, implementationBranch: fixture.event.pull_request.head.ref, featureId: "chilly-chat-call-lifecycle", leaseId: "d2a-release-critical-pr-212-v1" }] } };
  const result = derive({ fixture, truth });
  assert.equal(result.ok, true);
  assert.equal(result.source, "ACTIVE_FINITE_TASK_LEASE");
  assert.deepEqual(result.objectiveDomains, ["Chat", "notifications-native-calls"]);
});

test("wrong task feature fails closed", () => {
  const fixture = pullFixture({ pr: 212, branch: "codex/first-pass-assurance-android-generated-native-lifecycle-instrumentation" });
  const truth = { finiteTaskLeases: { tasks: [{ implementationPr: 212, implementationBranch: fixture.event.pull_request.head.ref, featureId: "revenuecat-premium", leaseId: "wrong" }] } };
  assert.ok(derive({ fixture, truth }).findings.includes("ASSURANCE_TASK_FEATURE_MISMATCH"));
});

test("unbound PR context fails closed", () => {
  const fixture = pullFixture({ pr: 999, branch: "codex/unbound" });
  assert.ok(derive({ fixture }).findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
});

test("branch-name spoofing cannot bind a different PR", () => {
  const fixture = pullFixture({ pr: 999, branch: "codex/whole-app-engineering-doctrine-v1" });
  assert.ok(derive({ fixture }).findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
});

test("PR-title spoofing cannot bind task context", () => {
  const fixture = pullFixture({ pr: 999, branch: "codex/unbound", title: "Require authoritative bounded whole-app engineering closure" });
  assert.ok(derive({ fixture }).findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
});

test("arbitrary feature and waiver injection fail", () => {
  const fixture = pullFixture({ pr: 206, branch: "codex/assurance-codex-security-scan-reliability-s0" });
  const result = derive({ fixture, requestedFeature: "codex-security-scan-reliability-s0", requestedWaiver: "config/assurance/codex-security-reliability-s0-scope-waiver-v1.json" });
  assert.ok(result.findings.includes("ASSURANCE_CALLER_FEATURE_INJECTION_REJECTED"));
  assert.ok(result.findings.includes("ASSURANCE_CALLER_WAIVER_INJECTION_REJECTED"));
});

test("autonomous high-risk paths require affected-domain authority", () => {
  const result = evaluate({ highRiskDomains: ["autonomous-operators"], objectiveDomains: [], featureId: "assurance-efficiency-e0" });
  assert.deepEqual(finding(result, "ASSURANCE_OBJECTIVE_OMITS_AFFECTED_DOMAIN").domains, ["autonomous-operators"]);
});

test("CI-test-infrastructure cannot hide an unrelated high-risk domain", () => {
  const result = evaluate({ highRiskDomains: ["money-payouts"], objectiveDomains: ["CI-test-infrastructure"], featureId: "assurance-efficiency-e0" });
  assert.deepEqual(finding(result, "ASSURANCE_OBJECTIVE_OMITS_AFFECTED_DOMAIN").domains, ["money-payouts"]);
});

test("workflow uses generic event context and contains no hardcoded S0 scope invocation", () => {
  const workflow = fs.readFileSync(`${root}/.github/workflows/phase1-ci.yml`, "utf8");
  assert.match(workflow, /node scripts\/assurance\/pr-scope\.mjs --github-event="\$GITHUB_EVENT_PATH"/u);
  assert.doesNotMatch(workflow, /pr-scope\.mjs --feature=codex-security-scan-reliability-s0/u);
  assert.doesNotMatch(workflow, /pr-scope\.mjs[^\n]*codex-security-reliability-s0-scope-waiver/u);
});

test("all 13 required Phase 1 job names remain unchanged", () => {
  const workflow = fs.readFileSync(`${root}/.github/workflows/phase1-ci.yml`, "utf8");
  const explicit = [...workflow.matchAll(/^\s{4}name: (Phase 1 \/ (?!\$\{\{)[^\n]+)$/gmu)].map((match) => match[1]);
  const matrix = [...workflow.matchAll(/^\s{12}name: ([^\n]+)$/gmu)].map((match) => `Phase 1 / ${match[1]}`);
  const names = [...explicit, ...matrix].sort();
  assert.deepEqual(names, [
    "Phase 1 / Android Regression Guards", "Phase 1 / Autonomous Systems All-Platform Contract", "Phase 1 / Autonomous Systems iOS Contract", "Phase 1 / Cognitive Execution Safety", "Phase 1 / Cognitive Intelligence Contract", "Phase 1 / Expo Doctor", "Phase 1 / Repository Lint", "Phase 1 / Research and Memory Integrity", "Phase 1 / Route Contracts", "Phase 1 / Runtime Validation", "Phase 1 / Supabase Database Integration", "Phase 1 / TypeScript", "Phase 1 / iOS Configuration"
  ].sort());
});
