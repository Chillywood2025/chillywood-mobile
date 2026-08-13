import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { architectureFinalSourceOwnerCommentBody, architectureFinalSourceSubject, architectureMaintenanceOwnerCommentBody, architectureMaintenanceSubject, architectureMaintenanceSuccessorOwnerCommentBody, architectureMaintenanceSuccessorSubject, terminalTruthSuccessorOwnerCommentBody, terminalTruthSuccessorSubject, verifyArchitectureMaintenanceAuthority, verifyTerminalTruthSuccessorAuthority } from "../../scripts/assurance/engineering-closure.mjs";
import { deriveTaskScopeContext, evaluateHighRiskScope, validateFeatureDomainBundles, validateStaticBindingRecursion } from "../../scripts/assurance/pr-scope-lib.mjs";
import { args, renderCurrentState, renderNextTask, stableJson } from "../../scripts/assurance/lib.mjs";

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
const derive = ({ fixture, truth = { finiteTaskLeases: { tasks: [] } }, ownerAuthority = null, finiteTaskAuthority = null, architectureAuthority = null, terminalTruthAuthority = null, protectedMainRuntime = null, taskPolicy = policy, requestedFeature = null, requestedWaiver = null }) => deriveTaskScopeContext({ event: fixture.event, readback: fixture.readback, policy: taskPolicy, registry, currentTruth: truth, ownerAuthority, finiteTaskAuthority, architectureAuthority, terminalTruthAuthority, protectedMainRuntime, requestedFeature, requestedWaiver });

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

test("doctrine PR #226 remains a protected historical exact context", () => {
  const fixture = pullFixture({ pr: 226, branch: "codex/whole-app-engineering-doctrine-v1", head: "c".repeat(40) });
  const result = derive({ fixture, ownerAuthority: { ok: true, repository: "Chillywood2025/chillywood-mobile", pr: 226, branch: fixture.event.pull_request.head.ref, currentHead: fixture.event.pull_request.head.sha, budget: { maximumFiles: 32, maximumHandAuthoredNetLines: 7000, maximumGeneratedGraphLines: 12000 } } });
  assert.equal(result.ok, true);
  assert.equal(result.featureId, "assurance-efficiency-e0");
  assert.deepEqual(result.objectiveDomains, ["autonomous-operators"]);
  assert.deepEqual(result.supportingDomains, ["CI-test-infrastructure"]);
  assert.equal(result.source, "PROTECTED_HISTORICAL_TASK");
});

test("actual S0 context resolves only its historical exact waiver", () => {
  const fixture = pullFixture({ pr: 206, branch: "codex/assurance-codex-security-scan-reliability-s0" });
  const result = derive({ fixture });
  assert.equal(result.ok, true);
  assert.equal(result.featureId, "codex-security-scan-reliability-s0");
  assert.equal(result.historicalWaiverPath, "config/assurance/codex-security-reliability-s0-scope-waiver-v1.json");
  assert.equal(result.source, "PROTECTED_TASK_REGISTRY");
});

test("D2A historical fixture remains an exact protected context", () => {
  const fixture = pullFixture({ pr: 212, branch: "codex/first-pass-assurance-android-generated-native-lifecycle-instrumentation" });
  const truth = { finiteTaskLeases: { tasks: [{ implementationPr: 212, implementationBranch: fixture.event.pull_request.head.ref, featureId: "chilly-chat-call-lifecycle", leaseId: "d2a-release-critical-pr-212-v1" }] } };
  const result = derive({ fixture, truth });
  assert.equal(result.ok, true);
  assert.equal(result.source, "PROTECTED_HISTORICAL_TASK");
  assert.deepEqual(result.objectiveDomains, ["Chat", "notifications-native-calls"]);
});

test("an unregistered finite-task feature fails closed", () => {
  const fixture = pullFixture({ pr: 901, branch: "codex/finite-task" });
  const finiteTaskAuthority = { ok: true, repository: "Chillywood2025/chillywood-mobile", pr: 901, branch: fixture.event.pull_request.head.ref, currentHead: fixture.event.pull_request.head.sha, type: "ACTIVE_FINITE_TASK_LEASE", source: "ACTIVE_FINITE_TASK_LEASE", authoritySource: "ACTIVE_FINITE_TASK_LEASE", featureId: "wrong", objectiveDomains: [], supportingDomains: ["CI-test-infrastructure"], bindingId: "finite-test" };
  assert.ok(derive({ fixture, finiteTaskAuthority }).findings.includes("ASSURANCE_TASK_FEATURE_UNREGISTERED"));
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

const rawOwnerComment = ({ id, pr, body }) => ({
  id,
  node_id: `IC_${id}`,
  user: { login: "Chillywood2025" },
  author_association: "OWNER",
  body,
  created_at: "2026-08-13T05:00:00Z",
  updated_at: "2026-08-13T05:00:00Z",
  issue_url: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${pr}`,
  html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${pr}#issuecomment-${id}`
});
const architectureFixture = () => {
  const fixture = pullFixture({ pr: 901, branch: "codex/typed-context", head: "a".repeat(40), base: "c1f9ec1f71cc8bc4448afd2327c4341cac309573" });
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 901, branch: fixture.event.pull_request.head.ref, baseSha: fixture.event.pull_request.base.sha, headSha: fixture.event.pull_request.head.sha };
  const tree = "b".repeat(40);
  const scope = { files: ["scripts/assurance/pr-scope-lib.mjs", "tests/assurance/pr-scope-feature-bundles.test.mjs"], netChangedLines: 700 };
  const subject = architectureMaintenanceSubject({ identity, tree, scope });
  const raw = rawOwnerComment({ id: 6000000001, pr: identity.pr, body: architectureMaintenanceOwnerCommentBody(subject) });
  const authority = verifyArchitectureMaintenanceAuthority({ raw, allComments: [raw], paginationComplete: true, identity, tree, scope });
  return { fixture, identity, tree, scope, subject, raw, authority };
};
const verifyArchitectureMutation = (mutate = () => {}) => {
  const value = architectureFixture();
  const args = { raw: value.raw, allComments: [value.raw], paginationComplete: true, identity: value.identity, tree: value.tree, scope: value.scope, noCompetingDomainOwner: true, ancestryVerified: true };
  mutate(args, value);
  return verifyArchitectureMaintenanceAuthority(args);
};

test("architecture 1: exact immutable Owner architecture comment passes", () => assert.equal(architectureFixture().authority.ok, true));
test("architecture 2: arbitrary unbound architecture PR fails", () => assert.ok(derive({ fixture: architectureFixture().fixture }).findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND")));
test("architecture 3: edited comment fails", () => assert.equal(verifyArchitectureMutation((args) => { args.raw = { ...args.raw, body: `${args.raw.body} ` }; args.allComments = [args.raw]; }).ok, false));
test("architecture 4: source push preserves original authority but invalidates merge eligibility", () => { const result = verifyArchitectureMutation((args) => { args.identity = { ...args.identity, headSha: "c".repeat(40) }; }); assert.equal(result.authorizationOk, true); assert.equal(result.mergeEligible, false); });
test("architecture 5: wrong PR fails", () => assert.equal(verifyArchitectureMutation((args) => { args.identity = { ...args.identity, pr: 902 }; }).ok, false));
test("architecture 6: wrong branch fails", () => assert.equal(verifyArchitectureMutation((args) => { args.identity = { ...args.identity, branch: "codex/wrong" }; }).ok, false));
test("architecture 7: wrong tree fails", () => assert.equal(verifyArchitectureMutation((args) => { args.tree = "d".repeat(40); }).ok, false));
test("architecture 8: extra path fails", () => assert.equal(verifyArchitectureMutation((args) => { args.scope = { ...args.scope, files: [...args.scope.files, "README.md"] }; }).ok, false));
test("architecture 9: product path fails", () => assert.equal(verifyArchitectureMutation((args) => { args.scope = { ...args.scope, files: ["app/index.tsx"] }; }).ok, false));
test("architecture 10: package-lock fails", () => assert.equal(verifyArchitectureMutation((args) => { args.scope = { ...args.scope, files: ["package-lock.json"] }; }).ok, false));
test("architecture 11: provider, build, release, and workflow paths fail", () => {
  for (const file of ["supabase/functions/provider/index.ts", "eas.json", "config/release/prod.json", ".github/workflows/phase1-ci.yml"]) assert.equal(verifyArchitectureMutation((args) => { args.scope = { ...args.scope, files: [file] }; }).ok, false);
});
test("architecture 12: unread comment pagination fails", () => assert.equal(verifyArchitectureMutation((args) => { args.paginationComplete = false; }).ok, false));
test("architecture 13: no static policy entry is required", () => {
  const value = architectureFixture();
  const result = derive({ fixture: value.fixture, architectureAuthority: value.authority });
  assert.equal(result.ok, true);
  assert.equal(result.source, "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE");
  assert.equal(policy.historicalExactTaskBindings.some(({ pr }) => pr === value.identity.pr), false);
});

const architectureSuccessorFixture = () => {
  const originalScope = { files: [
    "config/assurance/pr-scope-policy-v1.json", "scripts/assurance/current-truth.mjs", "scripts/assurance/engineering-closure.mjs",
    "scripts/assurance/pr-scope-lib.mjs", "scripts/assurance/pr-scope.mjs", "tests/assurance/pr-scope-feature-bundles.test.mjs"
  ].sort(), netChangedLines: 431 };
  const originalIdentity = { repository: "Chillywood2025/chillywood-mobile", pr: 227, branch: "codex/typed-task-context-terminal-successor-v1", baseSha: "c1f9ec1f71cc8bc4448afd2327c4341cac309573", headSha: "16c2421ec41786979c4fce9741efed8c66632c09" };
  const original = { identity: originalIdentity, tree: "80ae1d92b735e6554a93e4df16a9746027b680c3", scope: originalScope };
  original.subject = architectureMaintenanceSubject(original);
  original.raw = rawOwnerComment({ id: 5276216820, pr: original.identity.pr, body: architectureMaintenanceOwnerCommentBody(original.subject) });
  const historicalIdentity = { ...original.identity, headSha: "63cadbe5ac97c9d4358bf9bdf9069384f1f2b8f9" };
  const historicalTree = "42818b41c363d3b528d125c1612f283bf8caf483";
  const scope = { files: [
    ...original.scope.files, "scripts/assurance/lib.mjs", "tests/assurance/active-task-binding-a1.test.mjs"
  ].sort(), netChangedLines: 1200, diffHash: "e".repeat(64) };
  const historicalSubject = architectureMaintenanceSuccessorSubject({ identity: historicalIdentity, tree: historicalTree, scope: { ...scope, netChangedLines: 1015 }, originalRaw: original.raw });
  const successor = rawOwnerComment({ id: 5277054532, pr: historicalIdentity.pr, body: architectureMaintenanceSuccessorOwnerCommentBody(historicalSubject) });
  const identity = { ...original.identity, headSha: "c".repeat(40) }; const tree = "d".repeat(40);
  const subject = architectureFinalSourceSubject({ identity, tree, scope, originalRaw: original.raw, historicalRaw: successor });
  const final = rawOwnerComment({ id: 6000000003, pr: identity.pr, body: architectureFinalSourceOwnerCommentBody(subject) });
  const args = { raw: original.raw, allComments: [original.raw, successor, final], paginationComplete: true, identity, tree, scope, ancestryVerified: true };
  return { original, identity, tree, scope, subject, successor, final, args, authority: verifyArchitectureMaintenanceAuthority(args) };
};
test("architecture final source: one current receipt and one historical stale receipt pass", () => { const value = architectureSuccessorFixture(); assert.equal(value.authority.ok, true, value.authority.findings.join(",")); assert.equal(value.authority.staleLegacyReceiptId, 5277054532); });
test("architecture final source: edited, duplicate, stale, over-budget, ninth-path, and wildcard receipts fail", () => {
  const mutations = [
    ["edited", (v) => { v.args.allComments[2].body += " "; }],
    ["duplicate", (v) => { v.args.allComments.push({ ...v.final, id: v.final.id + 1, node_id: `IC_${v.final.id + 1}` }); }],
    ["stale", (v) => { v.args.identity.headSha = "e".repeat(40); }],
    ["over-budget", (v) => { v.args.scope.netChangedLines = 1801; }],
    ["ninth-path", (v) => { v.args.scope.files.push("README.md"); }],
    ["wildcard", (v) => { v.args.scope.files = [...v.args.scope.files.slice(0, -1), "tests/assurance/*"]; }]
  ];
  for (const [label, mutate] of mutations) {
    const value = architectureSuccessorFixture();
    mutate(value);
    assert.equal(verifyArchitectureMaintenanceAuthority(value.args).ok, false, label);
  }
});
test("architecture successor: exact PR 227 is the only bootstrap recovery context while doctrine truth is pending", () => {
  const value = architectureSuccessorFixture();
  const runtime = { pendingTerminalTruth: true, terminalSuccessorRequired: true, pendingTransitionCount: 1 };
  assert.equal(derive({ fixture: value.original.fixture ?? pullFixture({ pr: 227, branch: value.identity.branch, head: value.identity.headSha, base: value.identity.baseSha }), architectureAuthority: value.authority, protectedMainRuntime: runtime }).ok, true);
  const unrelated = architectureFixture();
  assert.ok(derive({ fixture: unrelated.fixture, architectureAuthority: unrelated.authority, protectedMainRuntime: runtime }).findings.includes("CURRENT_TRUTH_PENDING_TERMINAL_SUCCESSOR_REQUIRED"));
});

const terminalFixture = () => {
  const architecture = architectureFixture();
  const fixture = pullFixture({ pr: 902, branch: "codex/post-doctrine-truth", head: "c".repeat(40), base: "d".repeat(40) });
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 902, branch: fixture.event.pull_request.head.ref, baseSha: fixture.event.pull_request.base.sha, headSha: fixture.event.pull_request.head.sha };
  const tree = "e".repeat(40);
  const scope = { files: ["config/assurance/current-truth-v1.json", "CURRENT_STATE.md", "NEXT_TASK.md"], netChangedLines: 900 };
  const predecessor = { valid: true, pr: architecture.identity.pr, mergeSha: identity.baseSha, firstParent: "c1f9ec1f71cc8bc4448afd2327c4341cac309573", sourceHead: architecture.identity.headSha, sourceTree: architecture.tree };
  const predecessorAuthority = architecture.authority;
  const priorTruthHash = "f".repeat(64);
  const truthRecord = JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8"));
  truthRecord.engineeringDoctrine = { status: "ACTIVE", nextPermittedAction: "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE" };
  truthRecord.openImplementationPrs = [];
  truthRecord.taskContextArchitecture = {
    architecturePr: predecessor.pr, sourceHead: predecessor.sourceHead, sourceTree: predecessor.sourceTree, mergeSha: predecessor.mergeSha,
    terminalTransitionConsumed: true, pendingTransitionPolicyId: "PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1", pendingTransitionCountAfterSynchronization: 0,
    pendingTransitions: [
      { pr: 226, mergeSha: "c1f9ec1f71cc8bc4448afd2327c4341cac309573", status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" },
      { pr: predecessor.pr, mergeSha: predecessor.mergeSha, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" }
    ],
    authority: { providerMutation: false, build: false, submission: false, ota: false, publicRelease: false }
  };
  const currentStateText = renderCurrentState(truthRecord);
  const nextTaskText = renderNextTask(truthRecord);
  const subject = terminalTruthSuccessorSubject({ identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash });
  const raw = rawOwnerComment({ id: 6000000002, pr: identity.pr, body: terminalTruthSuccessorOwnerCommentBody(subject) });
  const args = { raw, allComments: [raw], paginationComplete: true, identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash, truthRecord, currentStateText, nextTaskText, currentMain: identity.baseSha, openTerminalSuccessorCount: 1, transitionPreviouslyConsumed: false };
  const authority = verifyTerminalTruthSuccessorAuthority(args);
  return { fixture, identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash, truthRecord, currentStateText, nextTaskText, subject, raw, args, authority };
};
const verifyTerminalMutation = (mutate = () => {}) => {
  const value = terminalFixture();
  const args = structuredClone(value.args);
  mutate(args, value);
  return verifyTerminalTruthSuccessorAuthority(args);
};

test("terminal 14: exact three-file successor passes", () => assert.equal(terminalFixture().authority.ok, true));
test("terminal 15: fourth file fails", () => assert.equal(verifyTerminalMutation((args) => { args.scope.files.push("README.md"); }).ok, false));
test("terminal 16: missing current-truth file fails", () => assert.equal(verifyTerminalMutation((args) => { args.scope.files = args.scope.files.filter((file) => file !== "config/assurance/current-truth-v1.json"); }).ok, false));
test("terminal 17: wrong base fails", () => assert.equal(verifyTerminalMutation((args) => { args.identity.baseSha = "1".repeat(40); }).ok, false));
test("terminal 18: non-current base fails", () => assert.equal(verifyTerminalMutation((args) => { args.currentMain = "1".repeat(40); }).ok, false));
test("terminal 19: one-parent predecessor fails", () => assert.equal(verifyTerminalMutation((args) => { args.predecessor.valid = false; args.predecessor.parentCount = 1; }).ok, false));
test("terminal 20: octopus predecessor fails", () => assert.equal(verifyTerminalMutation((args) => { args.predecessor.valid = false; args.predecessor.parentCount = 3; }).ok, false));
test("terminal 21: wrong predecessor PR fails", () => assert.equal(verifyTerminalMutation((args) => { args.predecessor.pr += 1; }).ok, false));
test("terminal 22: wrong predecessor head or tree fails", () => {
  assert.equal(verifyTerminalMutation((args) => { args.predecessor.sourceHead = "1".repeat(40); }).ok, false);
  assert.equal(verifyTerminalMutation((args) => { args.predecessor.sourceTree = "1".repeat(40); }).ok, false);
});
test("terminal 23: predecessor without terminalTruthRequired fails", () => assert.equal(verifyTerminalMutation((args) => { args.predecessorAuthority.subject.terminalTruthRequired = false; }).ok, false));
test("terminal 24: edited successor comment fails", () => assert.equal(verifyTerminalMutation((args) => { args.raw.body += " "; args.allComments = [args.raw]; }).ok, false));
test("terminal 25: stale successor comment fails", () => assert.equal(verifyTerminalMutation((args) => { args.identity.headSha = "1".repeat(40); }).ok, false));
test("terminal 26: expected next-task mismatch fails", () => assert.equal(verifyTerminalMutation((args) => { args.truthRecord.engineeringDoctrine.nextPermittedAction = "WRONG"; }).ok, false));
test("terminal 27: doctrine ACTIVE missing fails", () => assert.equal(verifyTerminalMutation((args) => { delete args.truthRecord.engineeringDoctrine; }).ok, false));
test("terminal 28: build authority true fails", () => assert.equal(verifyTerminalMutation((args) => { args.truthRecord.taskContextArchitecture.authority.build = true; }).ok, false));
test("terminal 29: OTA authority true fails", () => assert.equal(verifyTerminalMutation((args) => { args.truthRecord.taskContextArchitecture.authority.ota = true; }).ok, false));
test("terminal 30: public-release authority true fails", () => assert.equal(verifyTerminalMutation((args) => { args.truthRecord.taskContextArchitecture.authority.publicRelease = true; }).ok, false));
test("terminal 31: generated CURRENT_STATE mismatch fails", () => assert.equal(verifyTerminalMutation((args) => { args.currentStateText += "stale"; }).ok, false));
test("terminal 32: generated NEXT_TASK mismatch fails", () => assert.equal(verifyTerminalMutation((args) => { args.nextTaskText += "stale"; }).ok, false));
test("terminal 33: duplicate successor fails", () => assert.equal(verifyTerminalMutation((args) => { args.openTerminalSuccessorCount = 2; }).ok, false));
test("terminal 34: second successor after merge fails", () => assert.equal(verifyTerminalMutation((args) => { args.transitionPreviouslyConsumed = true; }).ok, false));
test("terminal 35: no taskContextBindings entry is required", () => {
  const value = terminalFixture();
  const result = derive({ fixture: value.fixture, terminalTruthAuthority: value.authority });
  assert.equal(result.ok, true);
  assert.equal(result.source, "TERMINAL_TRUTH_SUCCESSOR_V1");
  assert.equal(Object.hasOwn(policy, "taskContextBindings"), false);
});
test("terminal successor remains eligible for the exact two-transition pending chain", () => {
  const value = terminalFixture();
  const result = derive({ fixture: value.fixture, terminalTruthAuthority: value.authority, protectedMainRuntime: { pendingTerminalTruth: true, terminalSuccessorRequired: true, pendingTransitionCount: 2 } });
  assert.equal(result.ok, true, result.findings.join(","));
});

test("general 36-40: arbitrary and spoofed PRs plus injected feature or waiver remain blocked", () => {
  const arbitrary = pullFixture({ pr: 999, branch: "codex/unbound", title: "S0 terminal truth architecture" });
  assert.ok(derive({ fixture: arbitrary }).findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
  assert.ok(derive({ fixture: pullFixture({ pr: 999, branch: "codex/assurance-codex-security-scan-reliability-s0" }) }).findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
  assert.ok(derive({ fixture: arbitrary, requestedFeature: "assurance-efficiency-e0" }).findings.includes("ASSURANCE_CALLER_FEATURE_INJECTION_REJECTED"));
  assert.ok(derive({ fixture: arbitrary, requestedWaiver: "config/assurance/codex-security-reliability-s0-scope-waiver-v1.json" }).findings.includes("ASSURANCE_CALLER_WAIVER_INJECTION_REJECTED"));
});
test("general 43: a new finite task resolves without a static PR entry", () => {
  const fixture = pullFixture({ pr: 903, branch: "codex/finite-descendant" });
  const finiteTaskAuthority = { ok: true, repository: "Chillywood2025/chillywood-mobile", pr: 903, branch: fixture.event.pull_request.head.ref, currentHead: fixture.event.pull_request.head.sha, type: "ACTIVE_FINITE_TASK_LEASE", authoritySource: "ACTIVE_FINITE_TASK_LEASE", featureId: "chilly-chat-call-lifecycle", objectiveDomains: ["Chat", "notifications-native-calls"], supportingDomains: ["CI-test-infrastructure"], bindingId: "finite-903", finiteLeaseId: "lease-903" };
  assert.equal(derive({ fixture, finiteTaskAuthority }).source, "ACTIVE_FINITE_TASK_LEASE");
});
test("general 44: typed-context ambiguity fails", () => {
  const value = architectureFixture();
  const finiteTaskAuthority = { ...value.authority, type: "ACTIVE_FINITE_TASK_LEASE", authoritySource: "ACTIVE_FINITE_TASK_LEASE", bindingId: "ambiguous-finite" };
  assert.ok(derive({ fixture: value.fixture, architectureAuthority: value.authority, finiteTaskAuthority }).findings.includes("ASSURANCE_TASK_CONTEXT_AMBIGUOUS"));
});
test("general 45: typed context generation is deterministic 3/3", () => {
  const value = terminalFixture();
  const outputs = Array.from({ length: 3 }, () => stableJson(derive({ fixture: value.fixture, terminalTruthAuthority: value.authority })));
  assert.equal(new Set(outputs).size, 1);
});
test("static-binding recursion guard rejects new active PR bindings", () => {
  assert.deepEqual(validateStaticBindingRecursion(policy), []);
  assert.deepEqual(validateStaticBindingRecursion({ ...policy, taskContextBindings: [] }), ["ASSURANCE_STATIC_TASK_BINDING_RECURSION"]);
  assert.deepEqual(validateStaticBindingRecursion({ ...policy, taskContextBindings: [{ pr: 999 }] }), ["ASSURANCE_STATIC_TASK_BINDING_RECURSION"]);
  assert.deepEqual(validateStaticBindingRecursion({ ...policy, historicalExactTaskBindings: [...policy.historicalExactTaskBindings, { bindingId: "new", pr: 999, authoritySource: "PROTECTED_HISTORICAL_TASK" }] }), ["ASSURANCE_STATIC_TASK_BINDING_RECURSION"]);
});

test("workflow uses generic event context and contains no hardcoded S0 scope invocation", () => {
  const workflow = fs.readFileSync(`${root}/.github/workflows/phase1-ci.yml`, "utf8");
  assert.match(workflow, /node scripts\/assurance\/pr-scope\.mjs --github-event="\$GITHUB_EVENT_PATH"/u);
  assert.doesNotMatch(workflow, /pr-scope\.mjs --feature=codex-security-scan-reliability-s0/u);
  assert.doesNotMatch(workflow, /pr-scope\.mjs[^\n]*codex-security-reliability-s0-scope-waiver/u);
  const permissionsBlock = /^permissions:\n(?:(?:  [^\n]+\n)+)/mu.exec(workflow)?.[0] ?? "";
  assert.match(permissionsBlock, /^  actions: read$/mu);
  assert.doesNotMatch(permissionsBlock, /^  actions: write$/mu);
});

test("generic event CLI binds the canonical parser key used by the scope entrypoint", () => {
  assert.deepEqual(args(["--github-event=/tmp/exact-pull-request-event.json"]), {
    githubEvent: "/tmp/exact-pull-request-event.json"
  });
  const entrypoint = fs.readFileSync(`${root}/scripts/assurance/pr-scope.mjs`, "utf8");
  assert.match(entrypoint, /typeof options\.githubEvent !== "string"/u);
  assert.match(entrypoint, /readFileSync\(options\.githubEvent, "utf8"\)/u);
  assert.doesNotMatch(entrypoint, /options\["github-event"\]/u);
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
