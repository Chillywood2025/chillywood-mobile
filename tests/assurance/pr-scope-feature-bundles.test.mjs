import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { architectureFinalSourceOwnerCommentBody, architectureFinalSourceSubject, architectureMaintenanceOwnerCommentBody, architectureMaintenanceSubject, architectureMaintenanceSuccessorOwnerCommentBody, architectureMaintenanceSuccessorSubject, canonicalGitDiffHash, evaluateFiniteTaskAdmissionSuccessor, finiteTaskAdmissionOwnerCommentBody, finiteTaskAdmissionSubject, hashValue, terminalTruthSuccessorOwnerCommentBody, terminalTruthSuccessorSubject, terminalTruthSuccessorVerifierRepairOwnerCommentBody, terminalTruthSuccessorVerifierRepairSubject, verifyArchitectureMaintenanceAuthority, verifyTerminalTruthSuccessorAuthority } from "../../scripts/assurance/engineering-closure.mjs";
import { deriveTaskScopeContext, evaluateHighRiskScope, validateFeatureDomainBundles, validateStaticBindingRecursion } from "../../scripts/assurance/pr-scope-lib.mjs";
import { args, canonicalGitText, renderCurrentState, renderNextTask, stableJson, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS } from "../../scripts/assurance/lib.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const policy = JSON.parse(fs.readFileSync(`${root}/config/assurance/pr-scope-policy-v1.json`, "utf8"));
const registry = JSON.parse(fs.readFileSync(`${root}/config/assurance/feature-registry-v1.json`, "utf8"));
const registeredFeatureIds = registry.features.map(({ featureId }) => featureId);
const policyHighRiskDomains = policy.domains.filter(({ risk }) => risk === "high").map(({ id }) => id);

const githubComment = ({ id, pr, body }) => ({ id, node_id: `IC_${id}`, body, created_at: "2026-08-13T20:00:00Z", updated_at: "2026-08-13T20:00:00Z", user: { login: "Chillywood2025" }, author_association: "OWNER", issue_url: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${pr}`, html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${pr}#issuecomment-${id}` });
const admissionFixture = () => {
  const artifactPath = "docs/assurance/tasks/pre-release-identity-entitlement-authority-v1.json"; const seedHead = "1".repeat(40); const seedTree = "2".repeat(40); const planningHead = "3".repeat(40); const planningTree = "4".repeat(40);
  const allowedPaths = [artifactPath, "_lib/session.tsx", "supabase/migrations/202608130001_wave1.sql", "tests/wave1/identity-entitlement-authority.test.mjs"];
  const domains = ["auth-session-password-recovery", "notifications-fcm", "revenuecat-premium", "supabase-migrations-rls"];
  const taskArtifact = { taskId: "pre-release-identity-entitlement-authority-v1", primaryDomain: "auth-session-password-recovery", status: "DEFECT_LEDGER_STABLE", authorizationStatus: "PRODUCT_SOURCE_EDITING_NOT_YET_AUTHORIZED", rootDefects: Array.from({ length: 6 }, (_, index) => `DEFECT-${index}`), closure: { classification: "ENGINEERING_CLOSURE_PACKET_V1", packetHash: "5".repeat(64), affectedDomainClosure: { domains } }, certificate: { classification: "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1", certificateHash: "6".repeat(64) }, stateTransitionModel: { states: ["SIGNED_OUT"], transitions: ["SIGN_IN"] }, invariants: Array.from({ length: 30 }, (_, index) => ({ id: `I-${index}` })), implementationPlan: { allowedPaths, tests: [allowedPaths.at(-1)] }, mutants: Array.from({ length: 30 }, (_, index) => ({ id: `M-${index}` })), rollback: { strategy: "forward correction" }, cleanup: { strategy: "idempotent" }, observability: { strategy: "audit" } };
  const implementation = { pr: 229, branch: "codex/pre-release-identity-entitlement-authority-v1", planningHead, planningTree, baseSha: "7".repeat(40), state: "open", draft: true, seedHead, seedTree, observedSeedTree: seedTree, ownerCommentId: 5285464582, taskArtifactPath: artifactPath, changedPaths: [artifactPath] };
  const lease = { leaseId: taskArtifact.taskId, featureId: taskArtifact.primaryDomain, implementationPr: 229, implementationBranch: implementation.branch, admittedSeedHead: seedHead, admittedSeedTree: seedTree, admittedBase: implementation.baseSha, protectedAdmissionPr: 230, ownerAuthorizationCommentId: implementation.ownerCommentId, domain: taskArtifact.primaryDomain, domainOwnership: "ACTIVE", taskState: "ACTIVE_IMPLEMENTATION", allowedPaths, scopeBudget: { maximumFiles: 30, maximumChangedLines: 3600 }, artifactReservation: { closureArtifactPath: artifactPath, allowedDomains: domains, pathGlobs: allowedPaths, testEvidencePaths: [allowedPaths.at(-1)], maximumFiles: 30, maximumLines: 3600, excludedHighRiskPaths: [] }, recursionBudget: { maximumAdmissionPrs: 1, maximumFinalSourceBindingPrs: 0, maximumMergeProvenancePrs: 0, maximumPostMergeTruthPrs: 1 } };
  const truthRecord = { preAdmissionEngineeringSeedCapability: { status: "ACTIVE", productMutationAllowed: false }, finiteTaskLeases: { tasks: [lease] }, activeTaskBinding: { featureId: taskArtifact.primaryDomain, implementationPr: 229, implementationBranch: implementation.branch, immutableSourceHead: seedHead, immutableSourceTree: seedTree, currentImplementationHead: planningHead, currentImplementationTree: planningTree, phase: "DEFECT_LEDGER_STABLE", executionState: "PRE_RELEASE_WAVE_1_PREIMPLEMENTATION_ADMITTED" } };
  const ownerSubject = { primaryFeature: taskArtifact.primaryDomain, admittedSeed: { head: seedHead, tree: seedTree } }; const ownerBase = { subject: ownerSubject, subjectHash: hashValue(ownerSubject) }; const ownerPayload = { ...ownerBase, bodyHash: hashValue(ownerBase) }; const ownerApproval = { id: implementation.ownerCommentId, body: `<!-- chillywood-pre-release-plan-wave1-owner-approval-v1 -->\n${stableJson(ownerPayload)}` };
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 230, branch: "codex/pre-release-identity-entitlement-authority-admission-v1", headSha: "8".repeat(40), baseRef: "main", baseSha: "9".repeat(40) }; const tree = "a".repeat(40); const scope = { files: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"], netChangedLines: 500 }; const taskArtifactHash = hashValue(taskArtifact);
  const subject = finiteTaskAdmissionSubject({ identity, tree, scope, implementation, taskArtifact, taskArtifactHash }); const raw = githubComment({ id: 9901, pr: identity.pr, body: finiteTaskAdmissionOwnerCommentBody(subject) });
  return { raw, allComments: [raw], paginationComplete: true, identity, tree, scope, implementation, taskArtifact, taskArtifactHash, truthRecord, priorTruth: { finiteTaskLeases: { tasks: [] } }, ownerApproval, seedIsAncestor: true, implementationBaseIsAncestor: true };
};
const admissionMutation = (mutate) => { const args = admissionFixture(); mutate(args); return evaluateFiniteTaskAdmissionSuccessor(args); };

test("admission 21: exact three-file successor succeeds", () => { const result = evaluateFiniteTaskAdmissionSuccessor(admissionFixture()); assert.equal(result.ok, true, stableJson(result)); });
test("admission 22: fourth file fails", () => assert.equal(admissionMutation((args) => { args.scope.files.push("README.md"); }).ok, false));
test("admission 23: missing task artifact fails", () => assert.equal(admissionMutation((args) => { args.taskArtifact = null; }).ok, false));
test("admission 24: unstable closure fails", () => assert.equal(admissionMutation((args) => { args.taskArtifact.status = "DOMAIN_DISCOVERY"; }).ok, false));
test("admission 25: missing certificate fails", () => assert.equal(admissionMutation((args) => { args.taskArtifact.certificate = null; }).ok, false));
test("admission 26: Owner comment mismatch fails", () => assert.equal(admissionMutation((args) => { args.ownerApproval.id = 1; }).ok, false));
test("admission 27: wrong implementation PR fails", () => assert.equal(admissionMutation((args) => { args.implementation.pr = 228; }).ok, false));
test("admission 28: wrong planning identity fails", () => assert.equal(admissionMutation((args) => { args.truthRecord.activeTaskBinding.currentImplementationHead = "0".repeat(40); }).ok, false));
test("admission 29: seed ancestry failure fails", () => assert.equal(admissionMutation((args) => { args.seedIsAncestor = false; }).ok, false));
test("admission 30: product source before admission fails", () => assert.equal(admissionMutation((args) => { args.implementation.changedPaths.push("app/index.tsx"); }).ok, false));
test("admission 31: wrong domains fail", () => assert.equal(admissionMutation((args) => { args.truthRecord.finiteTaskLeases.tasks[0].artifactReservation.allowedDomains = ["auth-session-password-recovery"]; }).ok, false));
test("admission 32: scope budget mismatch fails", () => assert.equal(admissionMutation((args) => { args.truthRecord.finiteTaskLeases.tasks[0].scopeBudget.maximumFiles = 31; }).ok, false));
test("admission 33: package authority fails", () => assert.equal(admissionMutation((args) => { args.raw.body = args.raw.body.replace('"packageChanges":false', '"packageChanges":true'); }).ok, false));
test("admission 34: provider authority fails", () => assert.equal(admissionMutation((args) => { args.raw.body = args.raw.body.replace('"providerMutation":false', '"providerMutation":true'); }).ok, false));
test("admission 35: duplicate admission fails", () => assert.equal(admissionMutation((args) => { args.priorTruth.finiteTaskLeases.tasks.push({ implementationPr: 229 }); }).ok, false));
test("admission 36: static PR binding is not required", () => { const args = admissionFixture(); args.policy = {}; assert.equal(evaluateFiniteTaskAdmissionSuccessor(args).ok, true); });
test("admission 37: future implementation binding validates on admission branch", () => { const result = evaluateFiniteTaskAdmissionSuccessor(admissionFixture()); assert.equal(result.ok, true); assert.equal(result.featureId, "auth-session-password-recovery"); });
test("admission 38: merged successor leaves normal finite-task identity", () => { const args = admissionFixture(); assert.equal(args.truthRecord.activeTaskBinding.implementationPr, 229); assert.equal(args.truthRecord.finiteTaskLeases.tasks[0].implementationPr, 229); });
test("admission 39: source push invalidates admission evidence without losing lease", () => { const args = admissionFixture(); args.implementation.changedPaths.push("_lib/session.tsx"); assert.equal(evaluateFiniteTaskAdmissionSuccessor(args).ok, false); assert.equal(args.truthRecord.finiteTaskLeases.tasks.length, 1); });
test("admission 40: all 13 Phase 1 checks remain required", () => assert.equal(JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8")).reviewPolicy.requiredPhase1Checks, 13));
test("admission 41: provider review remains optional advisory", () => assert.equal(JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8")).reviewPolicy.classification, "OPTIONAL_ADVISORY"));

test("generic architecture descendant uses one exact-head final-source receipt", () => {
  const originalIdentity = { repository: "Chillywood2025/chillywood-mobile", pr: 230, branch: "codex/generic-pre-admission-engineering-seed-v1", headSha: "a".repeat(40), baseSha: "b".repeat(40) };
  const original = architectureMaintenanceSubject({ identity: originalIdentity, tree: "c".repeat(40), scope: { files: [] }, profile: "PRE_ADMISSION_ENGINEERING_SEED_AND_ADMISSION_SUCCESSOR_V1" });
  const rawOriginal = githubComment({ id: 901, pr: 230, body: architectureMaintenanceOwnerCommentBody(original) });
  const identity = { ...originalIdentity, headSha: "d".repeat(40) };
  const scope = { paths: ["scripts/assurance/engineering-closure.mjs", "tests/assurance/pr-scope-feature-bundles.test.mjs"], handAuthoredLines: 22, diffHash: "e".repeat(64) };
  const tree = "f".repeat(40);
  const receipt = architectureFinalSourceSubject({ identity, tree, scope, originalRaw: rawOriginal });
  const rawReceipt = githubComment({ id: 902, pr: 230, body: architectureFinalSourceOwnerCommentBody(receipt) });
  const result = verifyArchitectureMaintenanceAuthority({ raw: rawOriginal, allComments: [rawOriginal, rawReceipt], paginationComplete: true, identity, tree, scope, noCompetingDomainOwner: true });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.currentFinalSourceReceiptId, 902);
  assert.deepEqual(result.subject.changedPaths, scope.paths);
});

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
test("canonical predecessor receipt selection is content-derived and order-independent", () => {
  const value = architectureSuccessorFixture();
  const canonical = rawOwnerComment({ id: 5280109323, pr: 227, body: value.final.body });
  const rejectedSubject = architectureFinalSourceSubject({ ...value, scope: { ...value.scope, diffHash: "ea1b96e5c6515b05b7499ff7a528c0440a409e064d65fe0a7e65d44ec64b619b" }, originalRaw: value.original.raw, historicalRaw: value.successor });
  const rejected = rawOwnerComment({ id: 5277679438, pr: 227, body: architectureFinalSourceOwnerCommentBody(rejectedSubject) });
  const comments = [value.original.raw, value.successor, rejected, canonical];
  for (const ordered of [comments, [...comments].reverse()]) {
    const authority = verifyArchitectureMaintenanceAuthority({ ...value.args, allComments: ordered });
    assert.equal(authority.ok, true, authority.findings.join(","));
    assert.equal(authority.currentFinalSourceReceiptId, 5280109323);
    assert.deepEqual(authority.rejectedFinalSourceReceiptIds, [5277679438]);
    assert.ok(authority.historicalFinalSourceReceiptIds.includes(5277054532));
  }
  const duplicate = { ...canonical, id: 5280109324, node_id: "IC_5280109324" };
  assert.equal(verifyArchitectureMaintenanceAuthority({ ...value.args, allComments: [...comments, duplicate] }).ok, false);
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

const terminalRepairFixture = () => {
  const base = terminalFixture();
  const predecessorAuthority = {
    ...base.predecessorAuthority,
    ok: true,
    commentId: 5280109323,
    commentBodyHash: "08aa4e3239ca36cd07e5d2535b351e97f894b5021b1f20a9b20c7335229b92e9",
    subjectHash: "866da37ef99aea7452e77e0071225dfbea143d3e170f66e401210ca7085098f5",
    subject: { ...base.predecessorAuthority.subject, currentHead: "cb4be9ff1e4a956d73cffc1de6902538b79a918c", currentTree: "b8e7f4b47cd838496adcd398744426dc80ff9461", terminalTruthRequired: true },
  };
  const predecessor = { valid: true, pr: 227, mergeSha: "5506f1c2c227c0d3383131db7f818fef1aae2541", firstParent: "c1f9ec1f71cc8bc4448afd2327c4341cac309573", sourceHead: predecessorAuthority.subject.currentHead, sourceTree: predecessorAuthority.subject.currentTree };
  const priorTruthHash = "035c23f3a5508e9e047cbed60a1826b00ebbe508c2b43b17c074f5de2adf85bc";
  const oldIdentity = { repository: "Chillywood2025/chillywood-mobile", pr: 228, branch: "codex/post-whole-app-engineering-doctrine-truth", baseSha: predecessor.mergeSha, headSha: "abe9d599b79459ac067901ac3baf4db16b1cc5d0" };
  const oldTree = "bc13b7c24fdca4525dff3a4aa677762bd7cfd0ea";
  const oldScope = { files: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"], netChangedLines: 110 };
  const oldSubject = terminalTruthSuccessorSubject({ identity: oldIdentity, tree: oldTree, scope: oldScope, predecessor, predecessorAuthority, priorTruthHash });
  const oldRaw = rawOwnerComment({ id: 5280368893, pr: 228, body: terminalTruthSuccessorOwnerCommentBody(oldSubject) });
  const identity = { ...oldIdentity, headSha: "c".repeat(40) };
  const tree = "d".repeat(40);
  const scope = { files: [...TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS], netChangedLines: 1500, diffHash: "e".repeat(64) };
  const truthRecord = structuredClone(base.truthRecord);
  truthRecord.taskContextArchitecture.architecturePr = 227;
  truthRecord.taskContextArchitecture.sourceHead = predecessor.sourceHead;
  truthRecord.taskContextArchitecture.sourceTree = predecessor.sourceTree;
  truthRecord.taskContextArchitecture.mergeSha = predecessor.mergeSha;
  truthRecord.taskContextArchitecture.pendingTransitions[1].pr = 227;
  truthRecord.taskContextArchitecture.pendingTransitions[1].mergeSha = predecessor.mergeSha;
  truthRecord.taskContextArchitecture.terminalVerifierRepair = {
    classification: "CANONICAL_PREDECESSOR_RECEIPT_SELECTION_REPAIR_V1",
    historicalTerminalReceipt: 5280368893,
    rejectedPredecessorReceipt: 5277679438,
    canonicalPredecessorReceipt: 5280109323,
    rawPredecessorDiffHash: "ea1b96e5c6515b05b7499ff7a528c0440a409e064d65fe0a7e65d44ec64b619b",
    canonicalPredecessorDiffHash: "ce2b3dd4004f7fb8a8a2af4e1a6d83a6c2e17453f714b1eb9ff26a62588490ea",
    changedVerifierPaths: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS.filter((file) => !oldScope.files.includes(file)),
    singleUse: true,
    authority: { product: false, nativeProduct: false, database: false, providerMutation: false, build: false, submission: false, ota: false, publicRelease: false },
  };
  const currentStateText = renderCurrentState(truthRecord);
  const nextTaskText = renderNextTask(truthRecord);
  const subject = terminalTruthSuccessorVerifierRepairSubject({ identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash, originalRaw: oldRaw });
  const currentRaw = rawOwnerComment({ id: 6000000228, pr: 228, body: terminalTruthSuccessorVerifierRepairOwnerCommentBody(subject) });
  const args = { raw: oldRaw, allComments: [oldRaw, currentRaw], paginationComplete: true, identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash, truthRecord, currentStateText, nextTaskText, currentMain: identity.baseSha, openTerminalSuccessorCount: 1, transitionPreviouslyConsumed: false };
  return { args, oldRaw, currentRaw, authority: verifyTerminalTruthSuccessorAuthority(args) };
};

test("terminal verifier repair revisions retain one stale receipt and one canonical current receipt", () => {
  const value = terminalRepairFixture();
  assert.equal(value.authority.ok, true, value.authority.findings.join(","));
  assert.equal(value.authority.authoritySource, "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1");
  assert.deepEqual(value.authority.historicalTerminalReceiptIds, [5280368893]);
  assert.equal(value.authority.currentTerminalReceiptId, 6000000228);
  assert.equal(verifyTerminalTruthSuccessorAuthority({ ...value.args, allComments: [...value.args.allComments, { ...value.currentRaw, id: 6000000229, node_id: "IC_6000000229" }] }).ok, false);
  assert.equal(verifyTerminalTruthSuccessorAuthority({ ...value.args, allComments: [value.currentRaw] }).ok, false);
});
test("terminal verifier repair scope rejects expansion, product, dependency, workflow, provider, release, and budget mutations", () => {
  const mutations = [
    (args) => { args.scope.files.push("README.md"); },
    (args) => { args.scope.files = [...args.scope.files.slice(0, -1), "app/index.tsx"]; },
    (args) => { args.scope.files = [...args.scope.files.slice(0, -1), "package-lock.json"]; },
    (args) => { args.scope.files = [...args.scope.files.slice(0, -1), ".github/workflows/phase1-ci.yml"]; },
    (args) => { args.scope.files = [...args.scope.files.slice(0, -1), "supabase/functions/provider/index.ts"]; },
    (args) => { args.scope.files = [...args.scope.files.slice(0, -1), "eas.json"]; },
    (args) => { args.scope.netChangedLines = 1801; },
  ];
  for (const mutate of mutations) {
    const value = terminalRepairFixture();
    mutate(value.args);
    assert.equal(verifyTerminalTruthSuccessorAuthority(value.args).ok, false);
  }
  assert.equal(terminalFixture().authority.ok, true);
});

test("canonical Git diff identity is newline-independent and shared by both authority callers", () => {
  const raw = execFileSync("git", ["diff", "--full-index", "--no-ext-diff", "c1f9ec1f71cc8bc4448afd2327c4341cac309573...cb4be9ff1e4a956d73cffc1de6902538b79a918c"], { cwd: root, encoding: "utf8" });
  const expected = "ce2b3dd4004f7fb8a8a2af4e1a6d83a6c2e17453f714b1eb9ff26a62588490ea";
  assert.equal(canonicalGitDiffHash(raw), expected);
  assert.equal(canonicalGitDiffHash(canonicalGitText(raw)), expected);
  assert.equal(canonicalGitDiffHash(raw.replace(/\n$/u, "")), expected);
  assert.equal(canonicalGitDiffHash(raw.replace(/\n/gu, "\r\n")), expected);
  assert.notEqual(canonicalGitDiffHash(raw.replace("diff --git", "diff  --git")), expected);
  assert.throws(() => canonicalGitText(Buffer.from(raw)), /ASSURANCE_CANONICAL_GIT_TEXT_REQUIRES_STRING/u);
  const closureSource = fs.readFileSync(`${root}/scripts/assurance/engineering-closure.mjs`, "utf8");
  const scopeSource = fs.readFileSync(`${root}/scripts/assurance/pr-scope.mjs`, "utf8");
  assert.doesNotMatch(closureSource, /hashValue\(diffRun\.stdout\)/u);
  assert.match(closureSource, /canonicalGitDiffHash\(diffRun\.stdout\)/u);
  assert.match(scopeSource, /canonicalGitDiffHash\(diff\)/u);
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
