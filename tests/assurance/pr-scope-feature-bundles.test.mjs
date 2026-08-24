import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { architectureFinalSourceOwnerCommentBody, architectureFinalSourceSubject, architectureMaintenanceOwnerCommentBody, architectureMaintenanceSubject, architectureMaintenanceSuccessorOwnerCommentBody, architectureMaintenanceSuccessorSubject, canonicalGitDiffArgs, canonicalGitDiffHash, createImplementationIdentityObservation, createTaskLocalEdgeDisposition, deriveFiniteTaskRuntimeState, evaluateAdmissionClearanceState, evaluateFiniteTaskAdmissionSuccessor, finiteTaskAdmissionOwnerCommentBody, finiteTaskAdmissionSubject, hashValue, terminalTruthSuccessorOwnerCommentBody, terminalTruthSuccessorSubject, terminalTruthSuccessorVerifierRepairOwnerCommentBody, terminalTruthSuccessorVerifierRepairSubject, verifyArchitectureMaintenanceAuthority, verifyTaskLocalGoverningEdgeClosure, verifyTerminalTruthSuccessorAuthority } from "../../scripts/assurance/engineering-closure.mjs";
import { classifyPrScopePaths, deriveFiniteTaskPrRiskAuthority, deriveTaskScopeContext, evaluateHighRiskScope, validateFeatureDomainBundles, validateStaticBindingRecursion } from "../../scripts/assurance/pr-scope-lib.mjs";
import { args, canonicalGitText, createTerminalVerifierRepairInstance, evaluateProtectedMainAdvancement, evaluateTerminalVerifierRepairHistory, HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_HISTORY, HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE, HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS, observeLiveTerminalRepairTaskContext, renderCurrentState, renderNextTask, resolveFiniteTaskEffectiveReservation, sha256, stableJson, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_CLASSIFICATION, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_HISTORY_POLICY_ID, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE } from "../../scripts/assurance/lib.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const policy = JSON.parse(fs.readFileSync(`${root}/config/assurance/pr-scope-policy-v1.json`, "utf8"));
const currentTruthContract = JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-contract-v1.json`, "utf8"));
const registry = JSON.parse(fs.readFileSync(`${root}/config/assurance/feature-registry-v1.json`, "utf8"));
const registeredFeatureIds = registry.features.map(({ featureId }) => featureId);
const policyHighRiskDomains = policy.domains.filter(({ risk }) => risk === "high").map(({ id }) => id);

const githubComment = ({ id, pr, body }) => ({ id, node_id: `IC_${id}`, body, created_at: "2026-08-13T20:00:00Z", updated_at: "2026-08-13T20:00:00Z", user: { login: "Chillywood2025" }, author_association: "OWNER", issue_url: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${pr}`, html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${pr}#issuecomment-${id}` });
const admissionTaskLocalIdentity = (() => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  return { head, tree: execFileSync("git", ["rev-parse", `${head}^{tree}`], { cwd: root, encoding: "utf8" }).trim() };
})();
const admissionTaskLocalSpecs = [
  ["edge-01-supabase-migrations-rls-to-auth-session-password-recovery", "supabase-migrations-rls", "auth-session-password-recovery", [["supabase/migrations/202605070001_user_account_legal_acceptances.sql", "create table if not exists public.\"user_account_legal_acceptances\" ("], ["app/auth/callback.tsx", "export { default } from \"../auth-callback\";"]]],
  ["edge-05-auth-session-password-recovery-to-chilly-chat-inbox-thread", "auth-session-password-recovery", "chilly-chat-inbox-thread", [["app/auth/callback.tsx", "export { default } from \"../auth-callback\";"], ["app/chat/[threadId].tsx", "import { useSession } from \"../../_lib/session\";"]]],
  ["edge-06-auth-session-password-recovery-to-moderation-reporting", "auth-session-password-recovery", "moderation-reporting", [["app/auth/callback.tsx", "export { default } from \"../auth-callback\";"], ["supabase/functions/moderation-safety-operator/index.ts", "systemId: \"moderation_safety_operator\","]]],
  ["edge-07-auth-session-password-recovery-to-revenuecat-premium", "auth-session-password-recovery", "revenuecat-premium", [["app/auth/callback.tsx", "export { default } from \"../auth-callback\";"], ["supabase/functions/revenuecat-webhook/index.ts", "const FUNCTION_NAME = \"revenuecat-webhook\";"]]],
  ["edge-08-auth-session-password-recovery-to-media-upload-image-manipulation", "auth-session-password-recovery", "media-upload-image-manipulation", [["app/auth/callback.tsx", "export { default } from \"../auth-callback\";"], ["scripts/proof-autonomous-systems-contract.mjs", "\"media_automation\","]]],
  ["edge-09-auth-session-password-recovery-to-autonomous-cognitive-governance", "auth-session-password-recovery", "autonomous-cognitive-governance", [["app/auth/callback.tsx", "export { default } from \"../auth-callback\";"], ["scripts/proof-autonomous-systems-contract.mjs", "id: \"security_owner_operator\","]]],
];
const admissionTaskLocalEvidence = {
  taskId: "pre-release-fixture",
  primaryDomain: "auth-session-password-recovery",
  sourceIdentity: admissionTaskLocalIdentity,
  dispositions: admissionTaskLocalSpecs.map(([edgeId, sourceDomain, destinationDomain, subjects]) => createTaskLocalEdgeDisposition({
    edgeId,
    sourceDomain,
    destinationDomain,
    disposition: "VERIFIED_NON_GOVERNING_WITH_EVIDENCE",
    relationshipType: "EXACT_SYMBOL_OR_SELECTOR",
    dataControlTransferred: "historical admission fixture source relationship",
    authorityDirection: "NO_AUTHORITY_DIRECTION_INFERRED",
    mutableState: [],
    lifecycleImplications: ["fixture-boundary"],
    sourceSubjects: subjects.map(([sourcePath, selector]) => ({ sourcePath, selector })),
    negativeWitness: { sourcePath: subjects[1][0], selector: subjects[1][1] },
    exactContract: `historical admission fixture independently binds ${edgeId}`,
  }, { identity: admissionTaskLocalIdentity, root })),
  modelDeltas: [],
};
const admissionTaskLocalClosure = verifyTaskLocalGoverningEdgeClosure(admissionTaskLocalEvidence, { root, runs: 2 });
assert.equal(admissionTaskLocalClosure.classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR", stableJson(admissionTaskLocalClosure.findings));
const admissionFixture = () => {
  const artifactPath = "docs/assurance/tasks/pre-release-identity-entitlement-authority-v1.json"; const seedHead = "1".repeat(40); const seedTree = "2".repeat(40); const planningHead = "3".repeat(40); const planningTree = "4".repeat(40);
  const allowedPaths = [artifactPath, "_lib/session.tsx", "supabase/migrations/202608130001_wave1.sql", "tests/wave1/identity-entitlement-authority.test.mjs"];
  const domains = ["auth-session-password-recovery", "notifications-fcm", "revenuecat-premium", "supabase-migrations-rls"];
  const taskArtifact = { taskId: "pre-release-identity-entitlement-authority-v1", primaryDomain: "auth-session-password-recovery", status: "DEFECT_LEDGER_STABLE", authorizationStatus: "PRODUCT_SOURCE_EDITING_NOT_YET_AUTHORIZED", rootDefects: Array.from({ length: 6 }, (_, index) => `DEFECT-${index}`), closure: { id: "ENGINEERING_CLOSURE_PACKET_V1", classification: "ENGINEERING_CLOSURE_PACKET_V1", packetHash: "5".repeat(64), affectedDomainClosure: { domains } }, certificate: { id: "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1", classification: "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1", certificateHash: "6".repeat(64) }, stateTransitionModel: { states: ["SIGNED_OUT"], transitions: ["SIGN_IN"] }, invariants: Array.from({ length: 30 }, (_, index) => ({ id: `I-${index}`, positiveWitness: `positive-${index}`, negativeWitness: `negative-${index}`, targetedMutant: `mutant-${index}` })), implementationPlan: { allowedPaths, tests: [allowedPaths.at(-1)] }, mutants: Array.from({ length: 30 }, (_, index) => ({ id: `M-${index}` })), rollback: { strategy: "forward correction" }, cleanup: { strategy: "idempotent" }, observability: { strategy: "audit" }, taskLocalEdgeEvidence: structuredClone(admissionTaskLocalEvidence), taskLocalGoverningEdgeClosure: structuredClone(admissionTaskLocalClosure) };
  const implementation = { pr: 229, branch: "codex/pre-release-identity-entitlement-authority-v1", planningHead, planningTree, baseSha: "7".repeat(40), state: "open", draft: true, seedHead, seedTree, observedSeedTree: seedTree, ownerCommentId: 5285464582, taskArtifactPath: artifactPath, changedPaths: [artifactPath] };
  const lease = { leaseId: taskArtifact.taskId, featureId: taskArtifact.primaryDomain, implementationPr: 229, implementationBranch: implementation.branch, admittedSeedHead: seedHead, admittedSeedTree: seedTree, admittedBase: implementation.baseSha, protectedAdmissionPr: 230, ownerAuthorizationCommentId: implementation.ownerCommentId, domain: taskArtifact.primaryDomain, domainOwnership: "ACTIVE", taskState: "ACTIVE_IMPLEMENTATION", allowedPaths, scopeBudget: { maximumFiles: 30, maximumChangedLines: 3600 }, artifactReservation: { closureArtifactPath: artifactPath, allowedDomains: domains, pathGlobs: allowedPaths, testEvidencePaths: [allowedPaths.at(-1)], maximumFiles: 30, maximumLines: 3600, excludedHighRiskPaths: [] }, recursionBudget: { maximumAdmissionPrs: 1, maximumFinalSourceBindingPrs: 0, maximumMergeProvenancePrs: 0, maximumPostMergeTruthPrs: 1 } };
  const finiteTaskLeases = { schemaVersion: 1, policyId: "ASSURANCE_FINITE_TASK_LEASE_V1", terminalMetaPr: 217, recursiveFailureCode: "ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE", providerCodexReview: "OPTIONAL_ADVISORY", authority: { build: false, provider: false, database: false, publicRelease: false }, amendmentPolicy: { marker: "chillywood-assurance-task-lease-amendment-v1", protectedMainUpdateRequired: false, ownerCommentRequired: true, domains: [{ id: "chilly-chat-call-media", amendablePaths: ["_lib/nativeCallTransitionProvenance.mjs"], maximumFiles: 12, maximumChangedLines: 6000 }] }, tasks: [lease] };
  const truthRecord = { preAdmissionEngineeringSeedCapability: { status: "ACTIVE", productMutationAllowed: false }, finiteTaskAdmissionClearanceCapability: { status: "ACTIVE", productMutationBeforeAdmissionMerge: false }, taskLocalGoverningEdgeClosureCapability: { status: "ACTIVE", admissionRequiresClearClosure: true }, finiteTaskLeases, activeTaskBinding: { featureId: taskArtifact.primaryDomain, implementationPr: 229, implementationBranch: implementation.branch, immutableSourceHead: seedHead, immutableSourceTree: seedTree, currentImplementationHead: planningHead, currentImplementationTree: planningTree, phase: "PREIMPLEMENTATION_ENGINEERING_CLEAR", executionState: "PRE_RELEASE_WAVE_1_IMPLEMENTATION_AUTHORIZED", productSourceMutationAllowed: true } };
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
test("admission 40: a future task cannot activate a reserved amendment without one compatible registered policy", () => {
  const args = admissionFixture();
  args.truthRecord.finiteTaskLeases.tasks[0].amendmentMaximum = { maximumFiles: 36, maximumChangedLines: 4500, maximumAmendments: 1 };
  const result = evaluateFiniteTaskAdmissionSuccessor(args);
  assert.equal(result.ok, false);
  assert.equal(result.checks.registryCompatibility, false);
  assert.ok(result.findings.includes("FINITE_TASK_ADMISSION_TO_CLEARANCE_INVALID:registryCompatibility"));
});
test("admission 41: a reserved amendment with exactly one compatible bounded policy remains prospectively admissible", () => {
  const args = admissionFixture();
  args.truthRecord.finiteTaskLeases.tasks[0].amendmentMaximum = { maximumFiles: 36, maximumChangedLines: 4500, maximumAmendments: 1 };
  args.truthRecord.finiteTaskLeases.amendmentPolicy.domains.push({ id: args.truthRecord.finiteTaskLeases.tasks[0].domain, amendablePaths: ["_lib/accessEntitlements.ts"], maximumFiles: 36, maximumChangedLines: 4500 });
  const result = evaluateFiniteTaskAdmissionSuccessor(args);
  assert.equal(result.checks.registryCompatibility, true);
  assert.ok(!result.findings.includes("FINITE_TASK_ADMISSION_TO_CLEARANCE_INVALID:registryCompatibility"));
});
test("admission 42: later admission cannot drop the append-only completion ledger", () => { const args = admissionFixture(); args.priorTruth.finiteTaskLeases.completedLeaseOutcomes = [{ leaseId: "completed-v1" }]; assert.equal(evaluateFiniteTaskAdmissionSuccessor(args).checks.completionLedgerPreserved, false); });
test("admission 40: all 13 Phase 1 checks remain required", () => assert.equal(JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8")).reviewPolicy.requiredPhase1Checks, 13));
test("admission 41: provider review remains optional advisory", () => assert.equal(JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8")).reviewPolicy.classification, "OPTIONAL_ADVISORY"));

const clearanceCases = [
  [1, "unadmitted DEFECT_LEDGER_STABLE remains planning-only", () => assert.equal(evaluateAdmissionClearanceState({ persistedPhase: "DEFECT_LEDGER_STABLE", artifactFrozen: true }).classification, "ENGINEERING_DISCOVERY_RESERVED")],
  [2, "admitted stable plan with a clear computed gate clears", () => assert.equal(evaluateAdmissionClearanceState({ persistedPhase: "DEFECT_LEDGER_STABLE", finiteLeasePresent: true, admissionMerged: true, artifactFrozen: true }).classification, "PREIMPLEMENTATION_ENGINEERING_CLEAR")],
  [3, "admitted stable plan with a finding remains blocked", () => assert.equal(evaluateAdmissionClearanceState({ persistedPhase: "DEFECT_LEDGER_STABLE", finiteLeasePresent: true, admissionMerged: true, artifactFrozen: true, computedGateFindings: ["BLOCK"] }).classification, "BOUND_INCOMPLETE")],
  [4, "phase string alone cannot grant clearance", () => assert.equal(evaluateAdmissionClearanceState({ persistedPhase: "PREIMPLEMENTATION_ENGINEERING_CLEAR" }).productSourceMutationAllowed, false)],
  [5, "caller Boolean is not an input to computed mutation authority", () => assert.equal(evaluateAdmissionClearanceState({ productSourceMutationAllowed: true, persistedPhase: "DEFECT_LEDGER_STABLE" }).productSourceMutationAllowed, false)],
  [6, "missing finite lease cannot clear", () => assert.equal(evaluateAdmissionClearanceState({ admissionMerged: true, artifactFrozen: true }).productSourceMutationAllowed, false)],
  [7, "unmerged admission cannot clear", () => assert.equal(evaluateAdmissionClearanceState({ finiteLeasePresent: true, artifactFrozen: true }).productSourceMutationAllowed, false)],
  [8, "exact PR 229 prospective admission passes", () => assert.equal(evaluateFiniteTaskAdmissionSuccessor(admissionFixture()).ok, true)],
  [9, "admission checkout may differ from implementation PR", () => { const args = admissionFixture(); assert.notEqual(args.identity.pr, args.implementation.pr); assert.equal(evaluateFiniteTaskAdmissionSuccessor(args).ok, true); }],
  [10, "prospective implementation identity remains PR 229", () => assert.equal(evaluateFiniteTaskAdmissionSuccessor(admissionFixture()).futureImplementationPr, 229)],
  [11, "wrong implementation PR fails", () => assert.equal(admissionMutation((args) => { args.implementation.pr = 228; }).ok, false)],
  [12, "wrong implementation branch fails", () => assert.equal(admissionMutation((args) => { args.implementation.branch = "codex/wrong"; }).ok, false)],
  [13, "wrong original seed head fails", () => assert.equal(admissionMutation((args) => { args.implementation.seedHead = "0".repeat(40); }).ok, false)],
  [14, "wrong original seed tree fails", () => assert.equal(admissionMutation((args) => { args.implementation.seedTree = "0".repeat(40); }).ok, false)],
  [15, "wrong planning head fails", () => assert.equal(admissionMutation((args) => { args.implementation.planningHead = "0".repeat(40); }).ok, false)],
  [16, "seed ancestry failure fails", () => assert.equal(admissionMutation((args) => { args.seedIsAncestor = false; }).ok, false)],
  [17, "missing task artifact fails", () => assert.equal(admissionMutation((args) => { args.taskArtifact = null; }).ok, false)],
  [18, "artifact status before DEFECT_LEDGER_STABLE fails", () => assert.equal(admissionMutation((args) => { args.taskArtifact.status = "DOMAIN_DISCOVERY"; }).ok, false)],
  [19, "missing closure packet fails", () => assert.equal(admissionMutation((args) => { args.taskArtifact.closure = null; }).ok, false)],
  [20, "missing completeness certificate fails", () => assert.equal(admissionMutation((args) => { args.taskArtifact.certificate = null; }).ok, false)],
  [21, "unstable six-root ledger fails", () => assert.equal(admissionMutation((args) => { args.taskArtifact.rootDefects.pop(); }).ok, false)],
  [22, "missing invariant evidence fails", () => assert.equal(admissionMutation((args) => { delete args.taskArtifact.invariants[0].negativeWitness; }).ok, false)],
  [23, "wrong domain closure fails", () => assert.equal(admissionMutation((args) => { args.taskArtifact.closure.affectedDomainClosure.domains = []; }).ok, false)],
  [24, "missing path reservation fails", () => assert.equal(admissionMutation((args) => { args.taskArtifact.implementationPlan.allowedPaths = []; }).ok, false)],
  [25, "scope budget substitution fails", () => assert.equal(admissionMutation((args) => { args.truthRecord.finiteTaskLeases.tasks[0].scopeBudget.maximumFiles = 31; }).ok, false)],
  [26, "product source before admission fails", () => assert.equal(admissionMutation((args) => { args.implementation.changedPaths.push("app/index.tsx"); }).ok, false)],
  [27, "competing active task fails", () => assert.equal(admissionMutation((args) => { args.priorTruth.finiteTaskLeases.tasks.push({ implementationPr: 777, taskState: "IMPLEMENTATION" }); }).ok, false)],
  [28, "provider build or release authority cannot be introduced", () => assert.equal(admissionMutation((args) => { args.raw.body = args.raw.body.replace('"providerMutation":false', '"providerMutation":true'); }).ok, false)],
  [29, "exact future binding selects PR 229", () => assert.equal(admissionFixture().truthRecord.activeTaskBinding.implementationPr, 229)],
  [30, "future binding records PREIMPLEMENTATION_ENGINEERING_CLEAR", () => assert.equal(admissionFixture().truthRecord.activeTaskBinding.phase, "PREIMPLEMENTATION_ENGINEERING_CLEAR")],
  [31, "mutation authority begins only after merge", () => { assert.equal(evaluateAdmissionClearanceState({ finiteLeasePresent: true, artifactFrozen: true }).productSourceMutationAllowed, false); assert.equal(evaluateAdmissionClearanceState({ finiteLeasePresent: true, admissionMerged: true, artifactFrozen: true }).productSourceMutationAllowed, true); }],
  [32, "first in-scope product descendant derives IMPLEMENTATION", () => assert.equal(deriveFiniteTaskRuntimeState({ preimplementationClear: true, changedPaths: ["docs/assurance/tasks/task.json", "_lib/session.tsx"], taskArtifactPath: "docs/assurance/tasks/task.json" }), "IMPLEMENTATION")],
  [33, "source descendant retains the finite lease identity", () => { const args = admissionFixture(); const observation = createImplementationIdentityObservation({ repository: args.identity.repository, workflowPr: args.implementation.pr, implementationPr: args.implementation.pr, implementationBranch: args.implementation.branch, implementationHead: args.implementation.planningHead, implementationTree: args.implementation.planningTree, originalSeedHead: args.implementation.seedHead, originalSeedTree: args.implementation.seedTree, protectedBase: args.implementation.baseSha, currentProtectedMain: args.identity.baseSha, finiteLeaseId: args.taskArtifact.taskId, taskArtifactPath: args.implementation.taskArtifactPath, taskArtifactHash: args.taskArtifactHash, implementationChangedPaths: [args.implementation.taskArtifactPath, "_lib/session.tsx"], seedIsAncestor: true, protectedBaseIsAncestor: true, ownerApprovalValid: true, artifactFrozen: true, prospectiveLeasePresent: true, admissionMerged: true }); assert.equal(observation.candidateEligible, true); assert.equal(args.truthRecord.finiteTaskLeases.tasks[0].leaseId, "pre-release-identity-entitlement-authority-v1"); }],
  [34, "source descendant invalidates admission evidence", () => assert.equal(admissionMutation((args) => { args.implementation.changedPaths.push("_lib/session.tsx"); }).ok, false)],
  [35, "source descendant requires no second admission", () => assert.equal(admissionFixture().truthRecord.finiteTaskLeases.tasks[0].recursionBudget.maximumAdmissionPrs, 1)],
  [36, "source descendant requires no clearance PR", () => assert.equal(finiteTaskAdmissionSubject(admissionFixture()).recursion?.postAdmissionClearancePrMaximum ?? 0, 0)],
  [37, "out-of-scope descendant is outside the finite reservation", () => assert.equal(admissionFixture().truthRecord.finiteTaskLeases.tasks[0].allowedPaths.includes("app/out-of-scope.tsx"), false)],
  [38, "package change before admission fails", () => assert.equal(admissionMutation((args) => { args.implementation.changedPaths.push("package.json"); }).ok, false)],
  [39, "duplicate admission fails", () => assert.equal(admissionMutation((args) => { args.priorTruth.finiteTaskLeases.tasks.push({ implementationPr: 229, taskState: "PREIMPLEMENTATION_ENGINEERING_CLEAR" }); }).ok, false)],
  [40, "second clearance transition is prohibited", () => assert.equal(finiteTaskAdmissionSubject(admissionFixture()).recursion?.postAdmissionClearancePrMaximum ?? 0, 0)],
  [41, "historical terminal binding remains historical", () => { const truth = JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8")); const historical = truth.finiteTaskLeases.tasks.find(({ implementationPr }) => implementationPr === 214); assert.deepEqual({ taskState: historical?.taskState, domainOwnership: historical?.domainOwnership }, { taskState: "MERGED_VERIFIED", domainOwnership: "PRESERVED_DEPENDENT" }); }],
  [42, "explicit pre-admission capability remains planning-only", () => assert.equal(JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8")).preAdmissionEngineeringSeedCapability.productMutationAllowed, false)],
  [43, "caller feature injection remains absent from admission subject", () => assert.equal(Object.hasOwn(finiteTaskAdmissionSubject(admissionFixture()), "callerFeature"), false)],
  [44, "static PR binding remains unnecessary", () => assert.equal(JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8")).finiteTaskAdmissionClearanceCapability.staticBindingRequired, false)],
  [45, "current-truth rendering is deterministic three of three", () => { const truth = JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8")); assert.equal(new Set(Array.from({ length: 3 }, () => renderCurrentState(truth))).size, 1); }],
  [46, "prospective clearance is deterministic three of three", () => { const values = Array.from({ length: 3 }, () => stableJson(evaluateFiniteTaskAdmissionSuccessor(admissionFixture()))); assert.equal(new Set(values).size, 1); }],
  [47, "all thirteen Phase 1 checks remain required", () => assert.equal(JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8")).reviewPolicy.requiredPhase1Checks, 13)],
  [48, "provider Codex Review remains optional advisory", () => assert.equal(JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8")).reviewPolicy.classification, "OPTIONAL_ADVISORY")],
];
for (const [number, name, run] of clearanceCases) test(`admission-clearance ${String(number).padStart(2, "0")}: ${name}`, run);

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

test("admission-to-clearance architecture uses one exact Owner comment and one canonical final receipt", () => {
  const paths = ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json", "scripts/assurance/active-task.mjs", "scripts/assurance/engineering-closure.mjs", "scripts/assurance/lib.mjs", "scripts/assurance/pr-scope-lib.mjs", "tests/assurance/pr-scope-feature-bundles.test.mjs"].sort();
  const base = "b".repeat(40);
  const originalIdentity = { repository: "Chillywood2025/chillywood-mobile", pr: 231, branch: "codex/finite-task-admission-clearance-v1", headSha: "a".repeat(40), baseSha: base };
  const originalScope = { paths, additions: 420, deletions: 20, netChangedLines: 400, diffHash: "1".repeat(64) };
  const originalSubject = architectureMaintenanceSubject({ identity: originalIdentity, tree: "c".repeat(40), scope: originalScope, profile: "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1" });
  const rawOriginal = githubComment({ id: 903, pr: 231, body: architectureMaintenanceOwnerCommentBody(originalSubject) });
  const identity = { ...originalIdentity, headSha: "d".repeat(40) };
  const scope = { ...originalScope, additions: 480, deletions: 25, netChangedLines: 455, diffHash: "2".repeat(64) };
  const tree = "f".repeat(40);
  const final = architectureFinalSourceSubject({ identity, tree, scope, originalRaw: rawOriginal });
  const rawFinal = githubComment({ id: 904, pr: 231, body: architectureFinalSourceOwnerCommentBody(final) });
  const result = verifyArchitectureMaintenanceAuthority({ raw: rawOriginal, allComments: [rawOriginal, rawFinal], paginationComplete: true, identity, tree, scope, noCompetingDomainOwner: true, ancestryVerified: true });
  assert.equal(result.ok, true, stableJson(result));
  assert.equal(result.currentFinalSourceReceiptId, 904);
  assert.equal(result.subject.capabilities[0], "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1");
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
const derive = ({ fixture, truth = { finiteTaskLeases: { tasks: [] } }, ownerAuthority = null, finiteTaskAuthority = null, architectureAuthority = null, terminalTruthAuthority = null, protectedMainRuntime = null, taskPolicy = policy, requestedFeature = null, requestedWaiver = null, observedChangedPaths = null, observedCanonicalChangedLines = null }) => deriveTaskScopeContext({ event: fixture.event, readback: fixture.readback, policy: taskPolicy, registry, currentTruth: truth, ownerAuthority, finiteTaskAuthority, architectureAuthority, terminalTruthAuthority, protectedMainRuntime, requestedFeature, requestedWaiver, observedChangedPaths, observedCanonicalChangedLines });
const trustedFiniteTaskProjectionFixture = () => {
  const truth = JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8"));
  const finiteTaskRegistry = structuredClone(truth.finiteTaskLeases);
  const lease = finiteTaskRegistry.tasks.find(({ implementationPr }) => implementationPr === 229);
  delete lease.amendmentMaximum;
  const effectiveReservationResolution = resolveFiniteTaskEffectiveReservation({
    registry: finiteTaskRegistry,
    lease,
    comments: [],
    commentsPaginationComplete: true,
  });
  return {
    lease,
    effectiveReservationResolution,
    finiteTaskPrRiskAuthority: deriveFiniteTaskPrRiskAuthority({
      effectiveReservationResolution,
      registry,
      policy,
      observedChangedPaths: [],
      observedCanonicalChangedLines: 0,
    }),
  };
};
const finiteTaskAuthorityFor = (fixture) => {
  const value = trustedFiniteTaskProjectionFixture();
  return {
    ...value,
    ok: true,
    repository: "Chillywood2025/chillywood-mobile",
    pr: fixture.event.number,
    branch: fixture.event.pull_request.head.ref,
    currentHead: fixture.event.pull_request.head.sha,
    type: "ACTIVE_FINITE_TASK_LEASE",
    authoritySource: "ACTIVE_FINITE_TASK_LEASE",
    featureId: value.lease.featureId,
    objectiveDomains: value.lease.artifactReservation.allowedDomains,
    supportingDomains: ["CI-test-infrastructure"],
    bindingId: `finite-${fixture.event.number}`,
    finiteLeaseId: value.lease.leaseId,
    budget: { maximumFiles: value.effectiveReservationResolution.effectiveReservation.maximumFiles, maximumHandAuthoredNetLines: value.effectiveReservationResolution.effectiveReservation.maximumLines },
  };
};

test("policy bundles reference registered features and known high-risk domains", () => {
  assert.deepEqual(validateFeatureDomainBundles({
    featureDomainBundles: policy.featureDomainBundles,
    registeredFeatureIds,
    policyHighRiskDomains
  }), []);
});

test("finite-task risk policy covers every legacy bundle without changing legacy semantics", () => {
  const mapped = new Map(policy.finiteTaskFeatureRiskProjection.featureRiskMappings.map((entry) => [entry.featureId, entry.authorizedPrRiskDomains]));
  for (const bundle of policy.featureDomainBundles) assert.deepEqual(mapped.get(bundle.featureId), bundle.allowedHighRiskDomains);
});

test("trusted finite-task authority preserves the nine affected features and projects risk separately", () => {
  const value = trustedFiniteTaskProjectionFixture();
  assert.equal(value.effectiveReservationResolution.ok, true, stableJson(value.effectiveReservationResolution.findings));
  assert.equal(value.finiteTaskPrRiskAuthority.ok, true, stableJson(value.finiteTaskPrRiskAuthority.findings));
  assert.equal(value.finiteTaskPrRiskAuthority.primaryFeatureId, "auth-session-password-recovery");
  assert.deepEqual(value.finiteTaskPrRiskAuthority.affectedFeatureIds, [
    "auth-session-password-recovery",
    "chilly-chat-inbox-thread",
    "creator-money-ledger",
    "moderation-reporting",
    "notifications-fcm",
    "payouts-stripe-connect",
    "revenuecat-premium",
    "storekit-google-play-billing",
    "supabase-migrations-rls",
  ]);
  assert.deepEqual(value.finiteTaskPrRiskAuthority.authorizedPrRiskDomains, ["Chat", "RevenueCat-Premium", "auth", "database-RLS", "money-payouts", "notifications-native-calls"]);
  assert.deepEqual(value.finiteTaskPrRiskAuthority.observedPrRiskDomains, []);
  assert.deepEqual(value.finiteTaskPrRiskAuthority.coverage, { required: 9, registered: 9, mapped: 9, result: "9/9", unique: true, complete: true, primaryIncluded: true });
  assert.equal(value.finiteTaskPrRiskAuthority.pathReservationRequiredIndependently, true);
  assert.equal(value.finiteTaskPrRiskAuthority.implementationPartition.maximumFiles, 30);
  assert.equal(value.finiteTaskPrRiskAuthority.testAdaptationPartition, null);
  assert.equal(value.finiteTaskPrRiskAuthority.aggregateCompatibilityProjection.maximumFiles, 30);
});

test("ordinary finite-task scope observes risk from exact reserved paths without requiring a test-adaptation partition", () => {
  const fixture = pullFixture({ pr: 903, branch: "codex/finite-descendant" });
  const finiteTaskAuthority = finiteTaskAuthorityFor(fixture);
  const result = derive({
    fixture,
    finiteTaskAuthority,
    observedChangedPaths: ["app/(auth)/login.tsx"],
    observedCanonicalChangedLines: 12,
  });
  assert.equal(result.ok, true, stableJson(result.findings));
  assert.deepEqual(result.finiteTaskPrRiskAuthority.observedPrRiskDomains, ["auth"]);
  assert.equal(result.finiteTaskPrRiskAuthority.implementationPartition.actualPathCount, 1);
  assert.equal(result.finiteTaskPrRiskAuthority.implementationPartition.canonicalChangedLines, 12);
  assert.equal(result.finiteTaskPrRiskAuthority.testAdaptationPartition, null);
  assert.deepEqual(result.finiteTaskPrRiskAuthority.aggregateCompatibilityProjection, result.finiteTaskPrRiskAuthority.implementationPartition);
});

test("ordinary finite-task scope cannot project risk from a path outside the trusted reservation", () => {
  const fixture = pullFixture({ pr: 903, branch: "codex/finite-descendant" });
  const result = derive({
    fixture,
    finiteTaskAuthority: finiteTaskAuthorityFor(fixture),
    observedChangedPaths: ["ops/unreserved-risk-path.ts"],
    observedCanonicalChangedLines: 1,
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("ASSURANCE_FINITE_TASK_PR_RISK_PATH_RESERVATION_MISMATCH"), stableJson(result.findings));
});

test("shared path classifier supports protected star patterns without expanding the filesystem", () => {
  assert.deepEqual(classifyPrScopePaths([
    "supabase/functions/user-auth-hook/index.ts",
    "supabase/functions/revenuecat-webhook/index.ts",
    "CURRENT_STATE.md",
  ], policy), [
    { file: "supabase/functions/user-auth-hook/index.ts", domains: ["auth"] },
    { file: "supabase/functions/revenuecat-webhook/index.ts", domains: ["RevenueCat-Premium"] },
    { file: "CURRENT_STATE.md", domains: ["documentation-metadata"] },
  ]);
});

const rehashFiniteTaskRiskAuthority = (authority, changes) => {
  const { ok: ignoredOk, findings: ignoredFindings, projectionHash: ignoredHash, ...subject } = authority;
  void ignoredOk; void ignoredFindings; void ignoredHash;
  const changed = { ...subject, ...changes };
  return { ok: true, findings: [], ...changed, projectionHash: sha256(changed) };
};

test("finite-task projection requires an exact path and line observation without trusted partitions", () => {
  const { effectiveReservationResolution } = trustedFiniteTaskProjectionFixture();
  const result = deriveFiniteTaskPrRiskAuthority({ effectiveReservationResolution, registry, policy });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("ASSURANCE_FINITE_TASK_PR_RISK_PATH_OBSERVATION_REQUIRED"));
});

test("finite-task evaluation authorizes exact observed risk without legacy mixed or omitted findings", () => {
  const base = trustedFiniteTaskProjectionFixture().finiteTaskPrRiskAuthority;
  const observed = ["RevenueCat-Premium", "auth", "database-RLS"];
  const authority = rehashFiniteTaskRiskAuthority(base, { observedPrRiskDomains: observed });
  const result = evaluateHighRiskScope({
    highRiskDomains: observed,
    objectiveDomains: authority.authorizedPrRiskDomains,
    featureId: authority.primaryFeatureId,
    featureDomainBundles: policy.featureDomainBundles,
    registeredFeatureIds,
    policyHighRiskDomains,
    finiteTaskPrRiskAuthority: authority,
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, true, stableJson(result.findings));
  assert.deepEqual(result.observedPrRiskDomains, observed);
  assert.equal(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE"), undefined);
  assert.equal(finding(result, "ASSURANCE_OBJECTIVE_OMITS_AFFECTED_DOMAIN"), undefined);
});

test("finite-task evaluation fails closed for observed risk outside frozen feature projection", () => {
  const base = trustedFiniteTaskProjectionFixture().finiteTaskPrRiskAuthority;
  const observed = ["auth", "release-OTA"];
  const authority = rehashFiniteTaskRiskAuthority(base, { observedPrRiskDomains: observed });
  const result = evaluateHighRiskScope({
    highRiskDomains: observed,
    objectiveDomains: authority.authorizedPrRiskDomains,
    featureId: authority.primaryFeatureId,
    featureDomainBundles: policy.featureDomainBundles,
    registeredFeatureIds,
    policyHighRiskDomains,
    finiteTaskPrRiskAuthority: authority,
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.deepEqual(finding(result, "ASSURANCE_FINITE_TASK_PR_RISK_SCOPE_UNAUTHORIZED").domains, ["release-OTA"]);
});

test("finite-task evaluation rejects forged observed-risk mutation by projection hash", () => {
  const authority = structuredClone(trustedFiniteTaskProjectionFixture().finiteTaskPrRiskAuthority);
  authority.observedPrRiskDomains = ["auth"];
  const result = evaluateHighRiskScope({
    highRiskDomains: ["auth"],
    objectiveDomains: authority.authorizedPrRiskDomains,
    featureId: authority.primaryFeatureId,
    featureDomainBundles: policy.featureDomainBundles,
    registeredFeatureIds,
    policyHighRiskDomains,
    finiteTaskPrRiskAuthority: authority,
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.ok(finding(result, "ASSURANCE_FINITE_TASK_PR_RISK_AUTHORITY_INVALID").reasons.includes("ASSURANCE_FINITE_TASK_PR_RISK_PROJECTION_HASH_INVALID"));
});

test("finite-task evaluation rejects a coherently rehashed malformed authority record", () => {
  const base = trustedFiniteTaskProjectionFixture().finiteTaskPrRiskAuthority;
  const authority = rehashFiniteTaskRiskAuthority(base, { classification: "CALLER_FORGED_FINITE_TASK_AUTHORITY" });
  const result = evaluateHighRiskScope({
    highRiskDomains: [],
    objectiveDomains: authority.authorizedPrRiskDomains,
    featureId: authority.primaryFeatureId,
    featureDomainBundles: policy.featureDomainBundles,
    registeredFeatureIds,
    policyHighRiskDomains,
    finiteTaskPrRiskAuthority: authority,
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.ok(finding(result, "ASSURANCE_FINITE_TASK_PR_RISK_AUTHORITY_INVALID").reasons.includes("ASSURANCE_FINITE_TASK_PR_RISK_AUTHORITY_RECORD_INVALID"));
});

test("finite-task projection rejects a universal union across affected-feature mappings", () => {
  const value = trustedFiniteTaskProjectionFixture();
  const hostile = structuredClone(policy);
  const primary = hostile.finiteTaskFeatureRiskProjection.featureRiskMappings.find(({ featureId }) => featureId === "auth-session-password-recovery");
  primary.authorizedPrRiskDomains = [...policyHighRiskDomains];
  const result = deriveFiniteTaskPrRiskAuthority({
    effectiveReservationResolution: value.effectiveReservationResolution,
    registry,
    policy: hostile,
    observedChangedPaths: [],
    observedCanonicalChangedLines: 0,
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("ASSURANCE_FINITE_TASK_PR_RISK_UNIVERSAL_AUTHORITY_FORBIDDEN"));
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
  const fixture = pullFixture({ pr: 231, branch: "codex/typed-context", head: "a".repeat(40), base: "c1f9ec1f71cc8bc4448afd2327c4341cac309573" });
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 231, branch: fixture.event.pull_request.head.ref, baseSha: fixture.event.pull_request.base.sha, headSha: fixture.event.pull_request.head.sha };
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
test("architecture 5: wrong PR fails", () => assert.equal(verifyArchitectureMutation((args) => { args.identity = { ...args.identity, pr: 232 }; }).ok, false));
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
    ["duplicate", (v) => { v.args.allComments.push(rawOwnerComment({ id: v.final.id + 1, pr: v.identity.pr, body: v.final.body })); }],
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
  const duplicate = rawOwnerComment({ id: 5280109324, pr: 227, body: canonical.body });
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
  const scope = { files: [...HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS], netChangedLines: 1500, diffHash: "e".repeat(64) };
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
    changedVerifierPaths: HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS.filter((file) => !oldScope.files.includes(file)),
    singleUse: true,
    authority: { product: false, nativeProduct: false, database: false, providerMutation: false, build: false, submission: false, ota: false, publicRelease: false },
  };
  const currentStateText = renderCurrentState(truthRecord);
  const nextTaskText = renderNextTask(truthRecord);
  const subject = terminalTruthSuccessorVerifierRepairSubject({ identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash, originalRaw: oldRaw, repairProfile: { maximumFiles: 8, maximumNetLines: 1800 } });
  const currentRaw = rawOwnerComment({ id: 6000000228, pr: 228, body: terminalTruthSuccessorVerifierRepairOwnerCommentBody(subject) });
  const args = { raw: oldRaw, allComments: [oldRaw, currentRaw], paginationComplete: true, identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash, truthRecord, currentStateText, nextTaskText, currentMain: identity.baseSha, openTerminalSuccessorCount: 1, transitionPreviouslyConsumed: false };
  return { args, oldRaw, currentRaw, subject, authority: verifyTerminalTruthSuccessorAuthority(args) };
};

test("terminal verifier repair revisions retain one stale receipt and one canonical current receipt", () => {
  const value = terminalRepairFixture();
  assert.equal(value.authority.ok, true, value.authority.findings.join(","));
  assert.equal(value.authority.authoritySource, "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1");
  assert.deepEqual(value.authority.historicalTerminalReceiptIds, [5280368893]);
  assert.equal(value.authority.currentTerminalReceiptId, 6000000228);
  assert.equal(verifyTerminalTruthSuccessorAuthority({ ...value.args, allComments: [...value.args.allComments, rawOwnerComment({ id: 6000000229, pr: 228, body: value.currentRaw.body })] }).ok, false);
  assert.equal(verifyTerminalTruthSuccessorAuthority({ ...value.args, allComments: [value.currentRaw] }).ok, false);
});
test("terminal verifier repair current-valid matrix retains invalid and synchronized history without caller selection", () => {
  const value = terminalRepairFixture();
  const repairRaw = (id, { identity = value.args.identity, tree = value.args.tree, mutateSubject = () => {}, raw = {} } = {}) => {
    const subject = terminalTruthSuccessorVerifierRepairSubject({ identity, tree, scope: value.args.scope, predecessor: value.args.predecessor, predecessorAuthority: value.args.predecessorAuthority, priorTruthHash: value.args.priorTruthHash, originalRaw: value.oldRaw, repairProfile: { maximumFiles: 8, maximumNetLines: 1800 } });
    mutateSubject(subject);
    return { ...rawOwnerComment({ id, pr: value.args.identity.pr, body: terminalTruthSuccessorVerifierRepairOwnerCommentBody(subject) }), ...raw };
  };
  const staleHead = repairRaw(6000000230, { identity: { ...value.args.identity, headSha: "e".repeat(40) }, raw: { created_at: "2026-08-14T06:00:00Z", updated_at: "2026-08-14T06:00:00Z" } });
  const staleTree = repairRaw(6000000231, { tree: "f".repeat(40) });
  const retained = verifyTerminalTruthSuccessorAuthority({ ...value.args, allComments: [staleTree, value.currentRaw, value.oldRaw, staleHead] });
  assert.equal(retained.ok, true, retained.findings.join(","));
  assert.equal(retained.currentTerminalReceiptId, value.currentRaw.id);
  assert.deepEqual(retained.historicalTerminalReceiptIds, [value.oldRaw.id, staleHead.id, staleTree.id].sort((left, right) => left - right));
  assert.equal(verifyTerminalTruthSuccessorAuthority({ ...value.args, allComments: [value.oldRaw] }).ok, false);

  const invalidHistorical = [
    ["malformed newer", { ...rawOwnerComment({ id: 6000000232, pr: 228, body: "<!-- chillywood-terminal-truth-successor-v1 -->\n{malformed" }), created_at: "2026-08-14T07:00:00Z", updated_at: "2026-08-14T07:00:00Z" }],
    ["edited", { ...repairRaw(6000000233), updated_at: "2026-08-13T05:00:01Z" }],
    ["wrong Owner", { ...repairRaw(6000000234), user: { login: "not-owner" } }],
    ["wrong association", { ...repairRaw(6000000235), author_association: "MEMBER" }],
    ["wrong PR", { ...repairRaw(6000000236), issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/229", html_url: "https://github.com/Chillywood2025/chillywood-mobile/pull/229#issuecomment-6000000236" }],
    ["wrong branch", repairRaw(6000000237, { identity: { ...value.args.identity, branch: "codex/wrong-terminal" } })],
    ["wrong authority", repairRaw(6000000238, { mutateSubject: (subject) => { subject.authority.build = true; } })],
    ["wrong classification", repairRaw(6000000239, { mutateSubject: (subject) => { subject.type = "TERMINAL_TRUTH_UNRELATED_V9"; } })],
    ["unrelated historical", rawOwnerComment({ id: 6000000240, pr: 228, body: terminalTruthSuccessorOwnerCommentBody({ ...value.subject, head: "0".repeat(40), tree: "1".repeat(40), type: "TERMINAL_TRUTH_SUCCESSOR_V1" }) })],
  ];
  for (const [label, historical] of invalidHistorical) {
    const withCurrent = verifyTerminalTruthSuccessorAuthority({ ...value.args, allComments: [value.oldRaw, value.currentRaw, historical] });
    assert.equal(withCurrent.ok, true, `${label}: ${withCurrent.findings.join(",")}`);
    assert.equal(withCurrent.currentTerminalReceiptId, value.currentRaw.id, label);
    assert.equal(verifyTerminalTruthSuccessorAuthority({ ...value.args, allComments: [value.oldRaw, historical] }).ok, false, `${label} cannot become current`);
  }
  assert.equal(verifyTerminalTruthSuccessorAuthority({ ...value.args, raw: staleHead, allComments: [value.oldRaw, staleHead, value.currentRaw] }).currentTerminalReceiptId, value.currentRaw.id);
  assert.equal(verifyTerminalTruthSuccessorAuthority({ ...value.args, paginationComplete: false }).ok, false);

  const synchronizedIdentity = { ...value.args.identity, headSha: "2".repeat(40) };
  const synchronizedTree = "3".repeat(40);
  const synchronizedCurrent = repairRaw(6000000241, { identity: synchronizedIdentity, tree: synchronizedTree });
  const synchronized = verifyTerminalTruthSuccessorAuthority({ ...value.args, identity: synchronizedIdentity, tree: synchronizedTree, raw: value.oldRaw, allComments: [value.oldRaw, value.currentRaw, synchronizedCurrent] });
  assert.equal(synchronized.ok, true, synchronized.findings.join(","));
  assert.equal(synchronized.currentTerminalReceiptId, synchronizedCurrent.id);
  assert.ok(synchronized.historicalTerminalReceiptIds.includes(value.currentRaw.id));
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

const terminalRepairClosedAuthority = { product: false, nativeProduct: false, database: false, providerMutation: false, build: false, submission: false, ota: false, publicRelease: false };
const genericTerminalRepairInstance = ({
  ordinal = 2,
  pullRequest = 801,
  branch = "codex/generic-terminal-verifier-repair",
  protectedBase = "1".repeat(40),
  priorCurrentTruthHash = "2".repeat(64),
  priorInstanceId = HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE.instanceId,
  predecessorPullRequest = 800,
  predecessorMerge = "3".repeat(40),
  predecessorFirstParent = "0".repeat(40),
  sourceHead = "4".repeat(40),
  sourceTree = "5".repeat(40),
  authorityCommentId = 7000000800,
  historicalTerminalReceiptId = 7000000801,
  canonicalFinalSourceCommentId = authorityCommentId + 10000,
  authoritySubjectHash = "6".repeat(64),
  authorityBodyHash = "7".repeat(64),
  historicalSubjectHash = "8".repeat(64),
  historicalBodyHash = "9".repeat(64),
  finalSourceSubjectHash = sha256({ kind: "terminal-verifier-repair-final-source-subject", canonicalFinalSourceCommentId }),
  finalSourceBodyHash = sha256({ kind: "terminal-verifier-repair-final-source-body", canonicalFinalSourceCommentId }),
  predecessorDiffHash = "a".repeat(64),
} = {}) => createTerminalVerifierRepairInstance({
  schemaVersion: 1,
  ordinal,
  classification: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_CLASSIFICATION,
  repository: "Chillywood2025/chillywood-mobile",
  pullRequest,
  branch,
  protectedBase,
  priorCurrentTruthHash,
  priorInstanceId,
  predecessor: {
    pullRequest: predecessorPullRequest,
    mergeSha: predecessorMerge,
    firstParent: predecessorFirstParent,
    sourceHead,
    sourceTree,
    authorityCommentId,
    authoritySubjectHash,
    authorityBodyHash,
  },
  receiptBindings: {
    historicalTerminalReceipt: { commentId: historicalTerminalReceiptId, subjectHash: historicalSubjectHash, commentBodyHash: historicalBodyHash, disposition: "HISTORICAL_STALE_TERMINAL_RECEIPT" },
    predecessorReceipts: [
      { commentId: authorityCommentId, subjectHash: authoritySubjectHash, commentBodyHash: authorityBodyHash, disposition: "OWNER_ARCHITECTURE_AUTHORITY" },
      { commentId: canonicalFinalSourceCommentId, subjectHash: finalSourceSubjectHash, commentBodyHash: finalSourceBodyHash, diffHash: predecessorDiffHash, disposition: "CANONICAL_CURRENT" },
    ],
  },
  pendingTransitionPolicyId: "PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1",
  pendingTransitions: [{ pr: predecessorPullRequest, mergeSha: predecessorMerge, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" }],
  expectedNextTask: "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE",
  profile: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE,
  singleUse: true,
  authority: terminalRepairClosedAuthority,
});

const terminalRepairHistoryRecord = (instances) => ({
  classification: "CANONICAL_PREDECESSOR_RECEIPT_SELECTION_REPAIR_V1",
  historicalTerminalReceipt: 5280368893,
  rejectedPredecessorReceipt: 5277679438,
  canonicalPredecessorReceipt: 5280109323,
  rawPredecessorDiffHash: "ea1b96e5c6515b05b7499ff7a528c0440a409e064d65fe0a7e65d44ec64b619b",
  canonicalPredecessorDiffHash: "ce2b3dd4004f7fb8a8a2af4e1a6d83a6c2e17453f714b1eb9ff26a62588490ea",
  changedVerifierPaths: HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS.slice(3),
  singleUse: true,
  authority: terminalRepairClosedAuthority,
  history: { schemaVersion: 1, policyId: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_HISTORY_POLICY_ID, profile: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE, instances },
});

test("terminal verifier repair profile is exactly nine paths and 1800 net lines while PR 228 remains the exact eight-path seed", () => {
  assert.deepEqual([TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS.length, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE.maximumFiles, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE.maximumNetLines], [9, 9, 1800]);
  assert.ok(TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS.includes("tests/assurance/engineering-doctrine.test.mjs"));
  assert.equal(HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS.length, 8);
  assert.equal(HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS.includes("tests/assurance/engineering-doctrine.test.mjs"), false);
  assert.equal(HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE.pullRequest, 228);
  assert.equal(HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE.priorCurrentTruthHash, "035c23f3a5508e9e047cbed60a1826b00ebbe508c2b43b17c074f5de2adf85bc");
  assert.equal(HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE.receiptBindings.historicalTerminalReceipt.commentId, 5280368893);
  assert.deepEqual(HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE.receiptBindings.predecessorReceipts.map(({ commentId }) => commentId), [5277679438, 5280109323]);
  assert.equal(evaluateTerminalVerifierRepairHistory({ repair: { history: HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_HISTORY } }).ok, true);
  assert.match(fs.readFileSync(`${root}/scripts/assurance/lib.mjs`, "utf8"), /if \(added === "-" && deleted === "-"\) return null;[\s\S]*return additions \+ deletions;/u);
  assert.match(fs.readFileSync(`${root}/scripts/assurance/pr-scope.mjs`, "utf8"), /ASSURANCE_GIT_DIFF_BINARY_SCOPE_UNREADABLE[\s\S]*scope\.additions \+ scope\.deletions > TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE\.maximumNetLines/u);
});

test("terminal repair runtime context reuses only exact canonical PR-scope success", () => {
  const taskContext = { ok: true, contextType: "TERMINAL_TRUTH_SUCCESSOR", authoritySource: "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1", budget: { maximumFiles: 9, maximumHandAuthoredNetLines: 1800 }, identity: { pr: 246, headSha: "a".repeat(40) } };
  const observe = (value, expectedIdentity = null) => observeLiveTerminalRepairTaskContext({ environment: { GITHUB_EVENT_PATH: "/exact-event.json" }, run: () => `${stableJson(value)}\n`, expectedIdentity });
  assert.deepEqual(observe({ ok: true, taskContext }), taskContext);
  assert.equal(observe({ ok: true, taskContext: { ...taskContext, budget: { maximumFiles: 9, maximumHandAuthoredNetLines: 1801 } } }), null);
  assert.equal(observe({ ok: true, taskContext }, { repository: undefined, pr: 999, branch: undefined, headSha: taskContext.identity.headSha, baseSha: undefined, baseRef: undefined }), null);
});

test("terminal verifier repair history accepts one independently bound append and rejects replay, duplicate, and ambiguous histories", () => {
  const current = genericTerminalRepairInstance();
  const instances = [HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE, current];
  const expectedCurrent = {
    repository: current.repository,
    pullRequest: current.pullRequest,
    branch: current.branch,
    protectedBase: current.protectedBase,
    priorCurrentTruthHash: current.priorCurrentTruthHash,
    pendingTransitions: current.pendingTransitions,
    expectedNextTask: current.expectedNextTask,
  };
  const exact = evaluateTerminalVerifierRepairHistory({ repair: terminalRepairHistoryRecord(instances), expectedPriorInstances: [instances[0]], expectedCurrent });
  assert.equal(exact.ok, true, exact.findings.join(","));
  const replay = genericTerminalRepairInstance({ ordinal: 3, protectedBase: "b".repeat(40), priorCurrentTruthHash: "c".repeat(64), priorInstanceId: current.instanceId, authorityCommentId: 7000000802, historicalTerminalReceiptId: 7000000803 });
  const replayResult = evaluateTerminalVerifierRepairHistory({ repair: terminalRepairHistoryRecord([...instances, replay]) });
  assert.equal(replayResult.ok, false);
  assert.ok(replayResult.findings.includes("TERMINAL_VERIFIER_REPAIR_HISTORY_DUPLICATE_OR_REPLAY"));
  const duplicate = evaluateTerminalVerifierRepairHistory({ repair: terminalRepairHistoryRecord([...instances, structuredClone(current)]) });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.findings.includes("TERMINAL_VERIFIER_REPAIR_HISTORY_DUPLICATE_OR_REPLAY"));
  const second = genericTerminalRepairInstance({ ordinal: 3, pullRequest: 802, protectedBase: "d".repeat(40), priorCurrentTruthHash: "e".repeat(64), priorInstanceId: current.instanceId, predecessorPullRequest: 803, predecessorMerge: "f".repeat(40), authorityCommentId: 7000000804, historicalTerminalReceiptId: 7000000805 });
  const ambiguous = evaluateTerminalVerifierRepairHistory({ repair: terminalRepairHistoryRecord([...instances, second]), expectedPriorInstances: [instances[0]], expectedCurrent });
  assert.equal(ambiguous.ok, false);
  assert.ok(ambiguous.findings.includes("TERMINAL_VERIFIER_REPAIR_HISTORY_NOT_SINGLE_APPEND"));
  const wrongBase = evaluateTerminalVerifierRepairHistory({ repair: terminalRepairHistoryRecord(instances), expectedPriorInstances: [instances[0]], expectedCurrent: { ...expectedCurrent, protectedBase: "0".repeat(40) } });
  assert.equal(wrongBase.ok, false);
  assert.ok(wrongBase.findings.includes("TERMINAL_VERIFIER_REPAIR_HISTORY_CURRENT_BINDING_INVALID"));
});

test("NEXT_TASK renders validated terminal-verifier repair history as single-use and non-authoritative", () => {
  const baseline = JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8"));
  delete baseline.taskContextArchitecture.terminalVerifierRepair.history;
  assert.doesNotMatch(renderNextTask(baseline), /Terminal-verifier repair history/u);

  const oneInstance = structuredClone(baseline);
  oneInstance.taskContextArchitecture.terminalVerifierRepair = terminalRepairHistoryRecord([
    HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE,
  ]);
  assert.match(
    renderNextTask(oneInstance),
    /Terminal-verifier repair history retains `1` independently bound single-use instance\. No historical instance or receipt is reusable, and this history grants no merge authority\./u,
  );

  const current = genericTerminalRepairInstance();
  const twoInstances = structuredClone(baseline);
  twoInstances.taskContextArchitecture.terminalVerifierRepair = terminalRepairHistoryRecord([
    HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE,
    current,
  ]);
  assert.match(renderNextTask(twoInstances), /retains `2` independently bound single-use instances/u);

  const malformed = structuredClone(twoInstances);
  malformed.taskContextArchitecture.terminalVerifierRepair.history.instances[1].instanceId = "0".repeat(64);
  assert.doesNotMatch(renderNextTask(malformed), /Terminal-verifier repair history/u);
});

const protectedMainMultiRepairEvaluation = ({ mutateCheckpointHistory = () => {}, mutateSecondHistory = () => {}, preprojectFirst = false, stopAfterIntervening = false } = {}) => {
  const record = JSON.parse(fs.readFileSync(`${root}/config/assurance/current-truth-v1.json`, "utf8"));
  const checkpoint = "1".repeat(40);
  const checkpointTree = "2".repeat(40);
  record.mainSha = checkpoint;
  record.protectedMainAuthority.checkpointSha = checkpoint;
  record.protectedMainAuthority.checkpointTree = checkpointTree;
  record.taskContextArchitecture.terminalVerifierRepair = terminalRepairHistoryRecord([HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE]);
  mutateCheckpointHistory(record.taskContextArchitecture.terminalVerifierRepair.history.instances);
  const maintenance = structuredClone(policy.ownerArchitectureMaintenance.pendingTerminalTruthTransition);
  const maintenancePaths = [...maintenance.allowedChangedPaths];
  const pendingOne = { commit: "3".repeat(40), source: "4".repeat(40), tree: "5".repeat(40), pr: 811 };
  const interveningOne = { commit: "0".repeat(40), source: "f".repeat(40), tree: "1".repeat(40), pr: 815 };
  const repairOne = { commit: "6".repeat(40), source: "7".repeat(40), tree: "8".repeat(40), pr: 812 };
  const pendingTwo = { commit: "9".repeat(40), source: "a".repeat(40), tree: "b".repeat(40), pr: 813 };
  const repairTwo = { commit: "c".repeat(40), source: "d".repeat(40), tree: "e".repeat(40), pr: 814 };
  const parentTruthOne = structuredClone(record);
  parentTruthOne.syntheticInterveningImplementation = { pullRequest: interveningOne.pr };
  const first = genericTerminalRepairInstance({
    pullRequest: repairOne.pr,
    branch: "codex/repair-one",
    protectedBase: interveningOne.commit,
    priorCurrentTruthHash: sha256(`${JSON.stringify(parentTruthOne)}\n`),
    predecessorPullRequest: pendingOne.pr,
    predecessorMerge: pendingOne.commit,
    predecessorFirstParent: checkpoint,
    sourceHead: pendingOne.source,
    sourceTree: pendingOne.tree,
    authorityCommentId: 7000000811,
    historicalTerminalReceiptId: 7000000812,
  });
  if (preprojectFirst) record.taskContextArchitecture.terminalVerifierRepair = terminalRepairHistoryRecord([HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE, first]);
  const terminalTruth = ({ parent, pending, repair, instances, authoritySubjectHash, authorityBodyHash, authorityCommentId }) => {
    const truth = structuredClone(parent);
    truth.engineeringDoctrine = { status: "ACTIVE", nextPermittedAction: maintenance.expectedTerminalNextTask };
    truth.taskContextArchitecture = {
      architecturePr: pending.pr,
      sourceHead: pending.source,
      sourceTree: pending.tree,
      mergeSha: pending.commit,
      authorityCommentId,
      authoritySubjectHash,
      authorityBodyHash,
      pendingTransitionPolicyId: "PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1",
      pendingTransitionCountAfterSynchronization: 0,
      terminalTransitionConsumed: true,
      pendingTransitions: [{ pr: pending.pr, mergeSha: pending.commit, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" }],
      terminalVerifierRepair: terminalRepairHistoryRecord(instances),
      authority: { providerMutation: false, build: false, submission: false, ota: false, publicRelease: false },
    };
    truth.mainSha = checkpoint;
    truth.protectedMainAuthority = { ...record.protectedMainAuthority, checkpointSha: checkpoint, checkpointTree };
    return truth;
  };
  const truthOne = terminalTruth({ parent: parentTruthOne, pending: pendingOne, repair: repairOne, instances: [HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE, first], authorityCommentId: 7000000811, authoritySubjectHash: "6".repeat(64), authorityBodyHash: "7".repeat(64) });
  const parentTruthTwo = structuredClone(truthOne);
  const second = genericTerminalRepairInstance({
    ordinal: 3,
    pullRequest: repairTwo.pr,
    branch: "codex/repair-two",
    protectedBase: pendingTwo.commit,
    priorCurrentTruthHash: sha256(`${JSON.stringify(parentTruthTwo)}\n`),
    priorInstanceId: first.instanceId,
    predecessorPullRequest: pendingTwo.pr,
    predecessorMerge: pendingTwo.commit,
    predecessorFirstParent: repairOne.commit,
    sourceHead: pendingTwo.source,
    sourceTree: pendingTwo.tree,
    authorityCommentId: 7000000813,
    historicalTerminalReceiptId: 7000000814,
    authoritySubjectHash: "b".repeat(64),
    authorityBodyHash: "c".repeat(64),
    historicalSubjectHash: "d".repeat(64),
    historicalBodyHash: "e".repeat(64),
    predecessorDiffHash: "f".repeat(64),
  });
  const secondInstances = [HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE, first, second];
  mutateSecondHistory(secondInstances);
  const truthTwo = terminalTruth({ parent: parentTruthTwo, pending: pendingTwo, repair: repairTwo, instances: secondInstances, authorityCommentId: 7000000813, authoritySubjectHash: "b".repeat(64), authorityBodyHash: "c".repeat(64) });
  const observations = [
    { commit: pendingOne.commit, parents: [checkpoint, pendingOne.source], tree: pendingOne.tree, sourceTree: pendingOne.tree, subject: `Merge pull request #${pendingOne.pr} from Chillywood2025/codex/pending-one`, changedPaths: maintenancePaths },
    { commit: interveningOne.commit, parents: [pendingOne.commit, interveningOne.source], tree: interveningOne.tree, subject: `Merge pull request #${interveningOne.pr} from Chillywood2025/codex/intervening-implementation`, changedPaths: ["_lib/accessEntitlements.ts"] },
    { commit: repairOne.commit, parents: [interveningOne.commit, repairOne.source], tree: repairOne.tree, subject: `Merge pull request #${repairOne.pr} from Chillywood2025/codex/repair-one`, changedPaths: [...TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS], netChangedLines: 500 },
    { commit: pendingTwo.commit, parents: [repairOne.commit, pendingTwo.source], tree: pendingTwo.tree, sourceTree: pendingTwo.tree, subject: `Merge pull request #${pendingTwo.pr} from Chillywood2025/codex/pending-two`, changedPaths: maintenancePaths },
    { commit: repairTwo.commit, parents: [pendingTwo.commit, repairTwo.source], tree: repairTwo.tree, subject: `Merge pull request #${repairTwo.pr} from Chillywood2025/codex/repair-two`, changedPaths: [...TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS], netChangedLines: 600 },
  ];
  const truthByCommit = new Map([[pendingOne.commit, record], [interveningOne.commit, parentTruthOne], [repairOne.commit, truthOne], [pendingTwo.commit, parentTruthTwo], [repairTwo.commit, truthTwo]]);
  const truthBlobs = new Map([...truthByCommit].map(([commit, truth]) => {
    const ref = `${commit}:config/assurance/current-truth-v1.json`;
    const text = JSON.stringify(truth);
    const objectId = sha256(ref).slice(0, 40);
    return [ref, { objectId, text, size: Buffer.byteLength(`${text}\n`, "utf8") }];
  }));
  const truthBlobById = new Map([...truthBlobs.values()].map((value) => [value.objectId, value]));
  const maintenanceSources = new Set([pendingOne.source, pendingTwo.source]);
  return evaluateProtectedMainAdvancement({
    record,
    contract: currentTruthContract,
    observedProtectedMainSha: stopAfterIntervening ? interveningOne.commit : repairTwo.commit,
    candidateHead: "f".repeat(40),
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: true },
    advancementObservations: stopAfterIntervening ? observations.slice(0, 2) : observations,
    checkpointTreeObservation: checkpointTree,
    checkpointIsAncestor: true,
    candidateContainsObservedMain: true,
    gitCommand: (argv) => {
      if (argv[0] === "rev-parse") {
        if (truthBlobs.has(argv[1])) return truthBlobs.get(argv[1]).objectId;
        if (argv[1] === `${interveningOne.commit}^{tree}`) return interveningOne.tree;
        return argv[1] === `${repairTwo.commit}^{tree}` ? repairTwo.tree : checkpointTree;
      }
      if (argv[0] === "cat-file" && argv[1] === "-s" && truthBlobById.has(argv[2])) return String(truthBlobById.get(argv[2]).size);
      if (argv[0] === "merge-base") return "";
      if (argv[0] === "diff") return "";
      if (argv[0] !== "show") return "";
      const [commit, file] = String(argv[1]).split(":", 2);
      if (file === "config/assurance/pr-scope-policy-v1.json" && maintenanceSources.has(commit)) return JSON.stringify({ ownerArchitectureMaintenance: { pendingTerminalTruthTransition: maintenance } });
      if (file === "config/assurance/current-truth-v1.json" && truthByCommit.has(commit)) return truthBlobs.get(`${commit}:${file}`).text;
      return "";
    },
  });
};

test("protected-main history accepts independently bound repair instances and rejects a replayed append", () => {
  const exact = protectedMainMultiRepairEvaluation();
  assert.equal(exact.findings.length, 0, exact.findings.join(","));
  assert.equal(exact.protectedAdvancementCount, 5);
  assert.equal(exact.pendingTransitionConsumptionCount, 2);
  assert.equal(exact.terminalVerifierRepairHistory.length, 3);
  assert.equal(new Set(exact.terminalVerifierRepairHistory.map(({ instanceId }) => instanceId)).size, 3);
  assert.equal(exact.advancementClassifications.filter(({ terminalVerifierRepair }) => terminalVerifierRepair).length, 2);
  assert.equal(protectedMainMultiRepairEvaluation({ preprojectFirst: true }).findings.length, 0, "the prospectively embedded current instance must be consumed exactly once at its merge");
  const replay = protectedMainMultiRepairEvaluation({ mutateSecondHistory: (instances) => { instances[2] = structuredClone(instances[1]); } });
  assert.ok(replay.findings.includes("CURRENT_TRUTH_PENDING_TRANSITION_AUTHORITY_INVALID"), stableJson(replay));
  const unresolved = protectedMainMultiRepairEvaluation({ stopAfterIntervening: true });
  assert.ok(unresolved.findings.includes("CURRENT_TRUTH_PENDING_TERMINAL_SUCCESSOR_REQUIRED"), stableJson(unresolved));
  assert.equal(unresolved.pendingTransitionCount, 1);
  assert.equal(unresolved.nextRequiredAction, "CREATE_EXACT_TERMINAL_TRUTH_SUCCESSOR");
  const malformedCheckpoint = protectedMainMultiRepairEvaluation({ stopAfterIntervening: true, mutateCheckpointHistory: (instances) => { instances[0] = { ...instances[0], instanceId: "0".repeat(64) }; } });
  assert.ok(malformedCheckpoint.findings.includes("CURRENT_TRUTH_TERMINAL_VERIFIER_REPAIR_HISTORY_INVALID"), stableJson(malformedCheckpoint));
  assert.equal(malformedCheckpoint.authorityControlEligible, false);
});

test("canonical Git diff identity is newline-independent and shared by both authority callers", () => {
  const range = "c1f9ec1f71cc8bc4448afd2327c4341cac309573...cb4be9ff1e4a956d73cffc1de6902538b79a918c";
  assert.deepEqual(canonicalGitDiffArgs(range), ["diff", "--full-index", "--binary", "--no-ext-diff", range]);
  const raw = execFileSync("git", canonicalGitDiffArgs(range), { cwd: root, encoding: "utf8" });
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
  assert.match(closureSource, /typedGit\(root, canonicalGitDiffArgs/u);
  assert.match(closureSource, /gitRun\(canonicalGitDiffArgs/u);
  assert.match(closureSource, /run\(canonicalGitDiffArgs/u);
  assert.match(scopeSource, /git\(canonicalGitDiffArgs/u);
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
  const finiteTaskAuthority = finiteTaskAuthorityFor(fixture);
  const result = derive({
    fixture,
    finiteTaskAuthority,
    observedChangedPaths: [],
    observedCanonicalChangedLines: 0,
  });
  assert.equal(result.ok, true, stableJson(result.findings));
  assert.equal(result.source, "ACTIVE_FINITE_TASK_LEASE");
  assert.deepEqual(result.budget, finiteTaskAuthority.budget);
  assert.deepEqual(result.affectedFeatureIds, finiteTaskAuthority.finiteTaskPrRiskAuthority.affectedFeatureIds);
  assert.deepEqual(result.objectiveDomains, finiteTaskAuthority.finiteTaskPrRiskAuthority.authorizedPrRiskDomains);
});
test("general 43a: a caller-constructed adapted partition cannot impersonate trusted effective authority", () => {
  const fixture = pullFixture({ pr: 904, branch: "codex/finite-amended-descendant" });
  const baseReservation = { allowedPaths: ["_lib/session.tsx"], pathGlobs: ["_lib/session.tsx"], maximumFiles: 30, maximumLines: 3600, eligiblePathCount: 30, reservationHash: "a".repeat(64) };
  const effectiveReservation = { allowedPaths: ["_lib/accessEntitlements.ts", "_lib/roomRules.ts", "_lib/session.tsx"], pathGlobs: ["_lib/accessEntitlements.ts", "_lib/roomRules.ts", "_lib/session.tsx"], maximumFiles: 32, maximumLines: 4500, eligiblePathCount: 32, reservationHash: "b".repeat(64) };
  const testAdaptationReservation = { allowedPaths: ["supabase/tests/revenuecat_atomic_transactions_test.sql"], pathGlobs: ["supabase/tests/revenuecat_atomic_transactions_test.sql"], maximumFiles: 1, maximumLines: 500, eligiblePathCount: 1, reservationHash: "c".repeat(64) };
  const aggregateReservation = { allowedPaths: [...effectiveReservation.allowedPaths, ...testAdaptationReservation.allowedPaths].sort(), pathGlobs: [...effectiveReservation.pathGlobs, ...testAdaptationReservation.pathGlobs].sort(), maximumFiles: 33, maximumLines: 5000, eligiblePathCount: 33, reservationHash: "d".repeat(64) };
  const scopePartitions = {
    implementation: { reservation: effectiveReservation, actualPaths: [...effectiveReservation.allowedPaths], canonicalChangedLines: 4300 },
    testAdaptation: { reservation: testAdaptationReservation, actualPaths: [...testAdaptationReservation.allowedPaths], canonicalChangedLines: 62 },
    aggregate: { reservation: aggregateReservation, actualPaths: [...aggregateReservation.allowedPaths], canonicalChangedLines: 4362 },
  };
  const finiteTaskAuthority = {
    ok: true,
    repository: "Chillywood2025/chillywood-mobile",
    pr: 904,
    branch: fixture.event.pull_request.head.ref,
    currentHead: fixture.event.pull_request.head.sha,
    type: "ACTIVE_FINITE_TASK_LEASE",
    authoritySource: "ACTIVE_FINITE_TASK_LEASE",
    featureId: "chilly-chat-call-lifecycle",
    objectiveDomains: ["Chat", "notifications-native-calls"],
    supportingDomains: ["CI-test-infrastructure"],
    bindingId: "finite-904",
    finiteLeaseId: "lease-904",
    budget: { maximumFiles: aggregateReservation.maximumFiles, maximumHandAuthoredNetLines: aggregateReservation.maximumLines },
    baseReservation,
    effectiveReservation,
    effectiveReservationHash: effectiveReservation.reservationHash,
    amendmentReceipt: { id: 700030, subjectHash: "e".repeat(64), bodyHash: "f".repeat(64), rawBodyHash: "1".repeat(64) },
    testAdaptationReservation,
    aggregateReservation,
    scopePartitions,
    testAdaptationReceipt: { id: 700031, subjectHash: "2".repeat(64), bodyHash: "3".repeat(64), rawBodyHash: "4".repeat(64) },
  };
  const result = derive({ fixture, finiteTaskAuthority });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("ASSURANCE_FINITE_TASK_PR_RISK_RESOLUTION_UNVERIFIED"));
  assert.deepEqual(result.budget, { maximumFiles: 33, maximumHandAuthoredNetLines: 5000 });
  assert.equal(finiteTaskAuthority.baseReservation.maximumFiles, 30);
  assert.equal(finiteTaskAuthority.effectiveReservationHash, effectiveReservation.reservationHash);
  assert.equal(finiteTaskAuthority.scopePartitions.implementation.reservation.maximumLines, 4500);
  assert.equal(finiteTaskAuthority.scopePartitions.testAdaptation.reservation.maximumLines, 500);
});
test("general 43b: an incomplete live effective-reservation observation fails PR scope closed", () => {
  const fixture = pullFixture({ pr: 905, branch: "codex/finite-amended-incomplete" });
  const finiteTaskAuthority = { ok: false, findings: ["FINITE_TASK_LEASE_AMENDMENT_DISCOVERY_INCOMPLETE"] };
  const result = derive({ fixture, finiteTaskAuthority });
  assert.ok(result.findings.includes("FINITE_TASK_LEASE_AMENDMENT_DISCOVERY_INCOMPLETE"));
  assert.ok(result.findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
});
const rejectedPartitionAuthority = (fixture, finding) => ({
  ok: false,
  repository: "Chillywood2025/chillywood-mobile",
  pr: fixture.event.number,
  branch: fixture.event.pull_request.head.ref,
  currentHead: fixture.event.pull_request.head.sha,
  findings: [finding],
});
test("general 43c: PR scope rejects implementation overflow even when aggregate capacity could cover it", () => {
  const fixture = pullFixture({ pr: 906, branch: "codex/finite-adaptation-implementation-overflow" });
  const result = derive({ fixture, finiteTaskAuthority: rejectedPartitionAuthority(fixture, "FINITE_TASK_IMPLEMENTATION_PARTITION_SCOPE_OVERFLOW") });
  assert.ok(result.findings.includes("FINITE_TASK_IMPLEMENTATION_PARTITION_SCOPE_OVERFLOW"));
  assert.ok(result.findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
});
test("general 43d: PR scope rejects fixture overflow even when implementation capacity could cover it", () => {
  const fixture = pullFixture({ pr: 907, branch: "codex/finite-adaptation-fixture-overflow" });
  const result = derive({ fixture, finiteTaskAuthority: rejectedPartitionAuthority(fixture, "FINITE_TASK_TEST_ADAPTATION_PARTITION_SCOPE_OVERFLOW") });
  assert.ok(result.findings.includes("FINITE_TASK_TEST_ADAPTATION_PARTITION_SCOPE_OVERFLOW"));
  assert.ok(result.findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
});
test("general 43e: PR scope rejects malformed aggregate partition evidence before using its presentation budget", () => {
  const fixture = pullFixture({ pr: 908, branch: "codex/finite-adaptation-partition-invalid" });
  const result = derive({ fixture, finiteTaskAuthority: rejectedPartitionAuthority(fixture, "FINITE_TASK_TEST_ADAPTATION_PARTITION_INVALID") });
  assert.ok(result.findings.includes("FINITE_TASK_TEST_ADAPTATION_PARTITION_INVALID"));
  assert.ok(result.findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
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
