import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CLEAR_CHECKS, affectedDomainClosure, applyAssuranceEfficiencyTransition, applyAutonomousGovernanceTransition, applyCodexSecurityTransition,
  ARCHITECTURE_DEPENDENCY_AMENDMENT_MARKER, ARCHITECTURE_DEPENDENCY_WITNESS_AMENDMENT_MARKER, ARCHITECTURE_FINAL_SOURCE_MARKER, ARCHITECTURE_REPOSITORY_REVIEW_MARKER, ASSURANCE_DESCENDANT_DEPENDENCY_BASELINE_AMENDMENT_V1, ASSURANCE_DESCENDANT_DEPENDENCY_COMPATIBILITY_WITNESS_AMENDMENT_V1, ASSURANCE_RECEIPT_LIFECYCLE_V2, FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1, FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1, FINITE_TASK_TEST_ADAPTATION_OVERLAY_ARCHITECTURE_PATHS, FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1, FINITE_TASK_TERMINAL_TRUTH_V1, IMMUTABLE_EVIDENCE_LIFECYCLE_CONVERGENCE_ARCHITECTURE_PATHS, IMMUTABLE_EVIDENCE_LIFECYCLE_CONVERGENCE_V1, PHASE1_REQUIRED_JOB_NAMES,
  architectureDependencyAmendmentOwnerCommentBody, architectureDependencyAmendmentSubject, architectureDependencyBaselinePolicyV1,
  architectureDependencyWitnessAmendmentOwnerCommentBody, architectureDependencyWitnessAmendmentSubject,
  architectureFinalSourceOwnerCommentBody, architectureFinalSourceSubject, architectureMaintenanceOwnerCommentBody, architectureMaintenanceSubject,
  architectureRepositoryReviewCommentBody, architectureRepositoryReviewSubject,
  finiteTaskTerminalTruthFinalSourceOwnerCommentBody, finiteTaskTerminalTruthFinalSourceSubject, finiteTaskTerminalTruthOwnerCommentBody, finiteTaskTerminalTruthSubject,
  authoritativeReplayOnce, buildDoctrineReport, buildInventory, classifyContractFreshness, classifyLaterFinding,
  canonicalGitDiffArgs, canonicalGitDiffHash,
  deriveAffectedDomainClosure, deriveVerificationDependencyClosure, detectGraphFindings, doctrineBootstrapAuthorizationSubject, doctrineBootstrapOwnerCommentBody,
  doctrineScopeAmendmentOwnerCommentBody, doctrineScopeAmendmentSubject,
  doctrineVerificationDependencyCorrectionOwnerCommentBody, doctrineVerificationDependencyCorrectionSubject,
  createTaskLocalDomainGraphDelta, createTaskLocalEdgeDisposition,
  evaluateAutonomousEngineeringRequest, evaluatePreimplementationGate, evaluateTaskAdmission, generateDomainGraph, hashValue,
  inventoryMappingFindings, makeBootstrapPacket, makeTaskPacket, normalizeGitHubCommentIdentity, observeCandidateScopeFromGit,
  observeGitHubTaskIdentity, observeGroundedRuntimeEvidence, observeOfficialPublicContract, observeRepositoryOwnedReview, resolveEngineeringClosureTaskContext, runAuthoritativeReplay, stableJson,
  verifyArchitectureDependencyAmendment, verifyArchitectureDependencyWitnessAmendment, verifyArchitectureMaintenanceAuthority, verifyArchitectureRepositoryReview, verifyDoctrineScopeAmendment, verifyDoctrineVerificationDependencyCorrection, verifyExternalTrustRootReceipt, verifyInventoryNonVacuity,
  verifyFiniteTaskTerminalTruthAuthority, verifyPhase1RunEvidence,
  verifyTaskLocalGoverningEdgeClosure, verifyVerificationDependencyClosure
} from "../../scripts/assurance/engineering-closure.mjs";
import { compareReplayOutputs, verifyAuthoritativeOutput, verifySerializedEdgeModel, verifySerializedTransitionModel, verifyTaskLocalGoverningEdgeClosure as independentlyVerifyTaskLocalGoverningEdgeClosure } from "../../scripts/assurance/engineering-evidence-verifier.mjs";
import { validateEngineeringTaskAuthority } from "../../scripts/assurance/active-task.mjs";
import { finiteTaskLeaseFor, finiteTaskReservationProjection, projectFiniteTaskTerminalTruth, renderCurrentState, renderNextTask, validateEngineeringDoctrineTruth } from "../../scripts/assurance/lib.mjs";
import { classifyPrScopePaths, deriveTaskScopeContext, evaluateHighRiskScope } from "../../scripts/assurance/pr-scope-lib.mjs";

const root = new URL("../../", import.meta.url);
const json = (name) => JSON.parse(fs.readFileSync(new URL(name, root), "utf8"));
const sourceEvidenceSha = (name) => createHash("sha256").update(fs.readFileSync(new URL(name, root))).digest("hex");
const semanticEvidence = (name, token, testId = token) => { const text = fs.readFileSync(new URL(name, root), "utf8"); return { enforcingSource: name, enforcingSourceSha256: sourceEvidenceSha(name), line: text.split("\n").findIndex((value) => value.includes(token)) + 1, expectedSemanticToken: token, negativeWitnessTestPath: name, negativeWitnessTestSha256: sourceEvidenceSha(name), negativeWitnessTestId: testId }; };
const bootstrapFixture = makeBootstrapPacket();
const canonicalContext = { graph: generateDomainGraph(), taxonomy: json("config/assurance/adversarial-taxonomy-v1.json"), contracts: json("config/assurance/platform-provider-contracts-v1.json"), doctrine: json("config/assurance/engineering-doctrine-v1.json") };
const clearPacket = () => structuredClone(bootstrapFixture.packet);
const bootstrapAuthority = { branch: "codex/whole-app-engineering-doctrine-v1", base: "8bf6459c3ae1cec62e26a1694f03063e4291b9f8", currentMain: "8bf6459c3ae1cec62e26a1694f03063e4291b9f8", doctrineStatus: "BOOTSTRAP_SELF_HOSTED_PENDING_MERGE", implementationMerged: false, bootstrapExpired: false, productTask: false, featureId: "assurance-efficiency-e0" };
const gate = (packet, certificate = packet?.sections?.L_COMPLETENESS_CERTIFICATE, extra = {}) => evaluatePreimplementationGate(packet, { ...canonicalContext, certificate, bootstrapAuthority, artifactReservation: bootstrapFixture.reservation, actualScope: bootstrapFixture.actualScope, ...extra });
const failCheck = (key) => { const packet = clearPacket(); const section = packet.sections; const mutations = {
  boundaryExplicit: () => { delete section.B_BOUNDED_COMPLETENESS.boundary; }, dependencyClosureComplete: () => { section.C_AFFECTED_DOMAIN_CLOSURE.unknownDependencies.push("unknown"); },
  reachableStateModelComplete: () => { section.F_STATE_MODEL.transitions = []; }, requirementsMappedToInvariants: () => { section.I_COVERAGE_MAP.requirementsToInvariants = {}; }, positiveNegativeEvidencePlanned: () => { section.G_INVARIANTS[0].negativeWitness = ""; },
  adversarialMatrixComplete: () => { section.H_ADVERSARIAL_MATRIX.classifications.pop(); }, defectLedgerStable: () => { section.J_STABLE_DEFECT_LEDGER.authoritativeReplay.push({ laneId: "PASS_D" }); }
}; mutations[key](); return packet; };
const graphNode = (domain, owner = `${domain}-owner`) => ({ domain, sharedMutableState: [{ stateId: `${domain}:state`, owner }], authorityOwned: [], contractBindings: [], unresolvedUnknowns: [] });
const edge = (sourceDomain, destinationDomain, extra = {}) => ({ edgeId: `${sourceDomain}-to-${destinationDomain}`, sourceDomain, destinationDomain, dataControlTransferred: "registered transfer", authorityDirection: "SOURCE_TO_DESTINATION", impactTraversal: true, boundedSideEffects: true, platformDifferences: "none", replacementAuthority: "fresh wins", ...extra });
const activeDoctrine = { status: "ACTIVE" };
const reservation = { closureArtifactPath: "docs/assurance/task.json", allowedDomains: ["chilly-chat-inbox-thread"], pathGlobs: ["app/chat/**"], testEvidencePaths: ["tests/assurance/chat.test.mjs"], maximumFiles: 4, maximumLines: 300, excludedHighRiskPaths: ["supabase/migrations/**"] };
const certificate = bootstrapFixture.certificate;
const exactFindingEvidence = () => { const graph = generateDomainGraph(); const contracts = json("config/assurance/platform-provider-contracts-v1.json"); const contract = contracts.contracts.find(({ id }) => id === "supabase"); const reproductionSubject = "GENUINELY_NOVEL_DIMENSION"; const common = { discovery: "new callback from exact reproduction", firstObservation: "2026-08-12T00:00:00Z", impact: "one intersecting registered domain", affectedDomains: ["chilly-chat-inbox-thread"], currentTaskDomains: ["chilly-chat-inbox-thread"], contractId: contract.id, modelVersion: graph.contractId, modelHash: graph.contentHash, reproductionSource: "tests/assurance/engineering-doctrine.test.mjs", reproductionTest: "tests/assurance/engineering-doctrine.test.mjs", reproductionSourceHash: sourceEvidenceSha("tests/assurance/engineering-doctrine.test.mjs"), reproductionTestHash: sourceEvidenceSha("tests/assurance/engineering-doctrine.test.mjs"), reproductionSubject }; return { novel: { ...common, reasonNovel: "the exact state is absent after graph and contract derivation audit", newStateOrEdge: "provider-v2-state-not-in-canonical-graph", platformProviderVersion: "2.100.0", derivationAuditHash: hashValue({ graphHash: graph.contentHash, contractId: contract.id, newStateOrEdge: "provider-v2-state-not-in-canonical-graph", affectedDomains: common.affectedDomains }) }, drift: { ...common, observedSource: contract.source, observedVersion: "unsupported-provider-version-99", previousContractHash: hashValue(contract) } }; };
const TECHNICAL_UNKNOWN_BINDINGS = "ads-applovin-future-integration:hooks/libraries exact binding|ads-applovin-future-integration:migration exact binding|ads-applovin-future-integration:market/jurisdiction owner|ads-applovin-future-integration:observability signals|assurance-efficiency-e0:hooks/libraries exact binding|assurance-efficiency-e0:migration exact binding|assurance-efficiency-e0:market/jurisdiction owner|assurance-efficiency-e0:observability signals|auth-session-password-recovery:hooks/libraries exact binding|auth-session-password-recovery:migration exact binding|auth-session-password-recovery:market/jurisdiction owner|auth-session-password-recovery:observability signals|autonomous-cognitive-governance:hooks/libraries exact binding|autonomous-cognitive-governance:migration exact binding|autonomous-cognitive-governance:market/jurisdiction owner|autonomous-cognitive-governance:observability signals|chilly-chat-call-lifecycle:hooks/libraries exact binding|chilly-chat-call-lifecycle:migration exact binding|chilly-chat-call-lifecycle:market/jurisdiction owner|chilly-chat-call-lifecycle:observability signals|chilly-chat-inbox-thread:hooks/libraries exact binding|chilly-chat-inbox-thread:migration exact binding|chilly-chat-inbox-thread:market/jurisdiction owner|chilly-chat-inbox-thread:observability signals|codex-security-scan-reliability-s0:hooks/libraries exact binding|codex-security-scan-reliability-s0:migration exact binding|codex-security-scan-reliability-s0:market/jurisdiction owner|codex-security-scan-reliability-s0:observability signals|creator-money-ledger:hooks/libraries exact binding|creator-money-ledger:migration exact binding|creator-money-ledger:market/jurisdiction owner|creator-money-ledger:observability signals|eas-build-update-release:hooks/libraries exact binding|eas-build-update-release:migration exact binding|eas-build-update-release:market/jurisdiction owner|eas-build-update-release:observability signals|live-stage:hooks/libraries exact binding|live-stage:migration exact binding|live-stage:market/jurisdiction owner|live-stage:observability signals|livekit-media-transport:hooks/libraries exact binding|livekit-media-transport:migration exact binding|livekit-media-transport:market/jurisdiction owner|livekit-media-transport:observability signals|media-upload-image-manipulation:hooks/libraries exact binding|media-upload-image-manipulation:migration exact binding|media-upload-image-manipulation:market/jurisdiction owner|media-upload-image-manipulation:observability signals|moderation-reporting:hooks/libraries exact binding|moderation-reporting:migration exact binding|moderation-reporting:market/jurisdiction owner|moderation-reporting:observability signals|notifications-fcm:hooks/libraries exact binding|notifications-fcm:migration exact binding|notifications-fcm:market/jurisdiction owner|notifications-fcm:observability signals|payouts-stripe-connect:hooks/libraries exact binding|payouts-stripe-connect:migration exact binding|payouts-stripe-connect:market/jurisdiction owner|payouts-stripe-connect:observability signals|protected-media-playback:hooks/libraries exact binding|protected-media-playback:migration exact binding|protected-media-playback:market/jurisdiction owner|protected-media-playback:observability signals|pushkit-callkit:hooks/libraries exact binding|pushkit-callkit:migration exact binding|pushkit-callkit:market/jurisdiction owner|pushkit-callkit:observability signals|responsive-layout:hooks/libraries exact binding|responsive-layout:migration exact binding|responsive-layout:market/jurisdiction owner|responsive-layout:observability signals|revenuecat-premium:hooks/libraries exact binding|revenuecat-premium:migration exact binding|revenuecat-premium:market/jurisdiction owner|revenuecat-premium:observability signals|storekit-google-play-billing:hooks/libraries exact binding|storekit-google-play-billing:migration exact binding|storekit-google-play-billing:market/jurisdiction owner|storekit-google-play-billing:observability signals|supabase-migrations-rls:hooks/libraries exact binding|supabase-migrations-rls:migration exact binding|supabase-migrations-rls:market/jurisdiction owner|supabase-migrations-rls:observability signals|watch-party-live:hooks/libraries exact binding|watch-party-live:migration exact binding|watch-party-live:market/jurisdiction owner|watch-party-live:observability signals";
const NON_IMPACT_EDGE_WITNESS = "edge-23-assurance-efficiency-e0-to-codex-security-scan-reliability-s0 aec2eefe0bcf69f2f104da03449fd0005ebd7cac6f43fd57ae441cef1687a751";
const ownerComment = ({ id, type, subject, task, leaseId, pr = 301, currentHead = "a".repeat(40) }) => { const payload = { authorizationId: `github-comment-${id}`, repository: "Chillywood2025/chillywood-mobile", pr: String(pr), task, leaseId: String(leaseId), currentHead, type, subject, subjectHash: hashValue(subject) }; payload.bodyHash = hashValue(payload); return { id, url: `https://github.com/Chillywood2025/chillywood-mobile/issues/comments/${id}`, author: { login: "Chillywood2025" }, authorAssociation: "OWNER", createdAt: "2026-08-12T12:00:00Z", updatedAt: "2026-08-12T12:00:00Z", body: `<!-- chillywood-engineering-owner-authorization-v1 -->\n${JSON.stringify(payload)}` }; };
const rebindPacketFacts = (packet) => { packet.sections.L_COMPLETENESS_CERTIFICATE.packetFactsHash = hashValue(Object.fromEntries(Object.entries(packet.sections).filter(([name]) => name !== "L_COMPLETENESS_CERTIFICATE"))); return packet; };
const rebindContracts = (packet, contracts) => { const copy = structuredClone(packet); const B = copy.sections.B_BOUNDED_COMPLETENESS; B.contractVersions.platformProviderContractHash = hashValue(contracts); B.contractClassifications = contracts.contracts.map(({ id, freshnessClass, affectedDomains }) => ({ id, status: freshnessClass, obligation: ["BLOCKED_EXTERNAL", "HISTORICAL"].includes(freshnessClass) && affectedDomains.some((domain) => ["assurance-efficiency-e0", "autonomous-cognitive-governance", "codex-security-scan-reliability-s0"].includes(domain)) ? "BLOCKED_EXTERNAL" : "SOURCE_ONLY_OR_UNRELATED", implementationAuthorized: false, constraint: "source only; external implementation blocked" })); const cert = copy.sections.L_COMPLETENESS_CERTIFICATE; cert.platformProviderVersions = hashValue(contracts); const facts = Object.fromEntries(Object.entries(copy.sections).filter(([name]) => name !== "L_COMPLETENESS_CERTIFICATE")); cert.packetFactsHash = hashValue(facts); return copy; };

const withFakeExecutables = (executables, callback) => {
  const prior = process.env.PATH;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctrine-authority-"));
  try {
    for (const [name, source] of Object.entries(executables)) { const target = path.join(dir, name); fs.writeFileSync(target, source); fs.chmodSync(target, 0o755); }
    process.env.PATH = `${dir}:${prior}`;
    return callback();
  } finally { process.env.PATH = prior; fs.rmSync(dir, { recursive: true, force: true }); }
};
const trustedReview = (head) => {
  const pull = { number: 301, head: { sha: head }, user: { login: "task-author" } };
  const review = { id: 515151, commit_id: head, state: "APPROVED", user: { login: "repository-reviewer" }, body: `<!-- chillywood-repository-review-v1 head:${head} p0:0 p1:0 -->`, submitted_at: "2026-08-12T12:00:00Z" };
  const gh = `#!/usr/bin/env node\nconst a=process.argv.join(' ');process.stdout.write(JSON.stringify(a.includes('/reviews/')?${JSON.stringify(review)}:${JSON.stringify(pull)}));\n`;
  return withFakeExecutables({ gh }, () => observeRepositoryOwnedReview({ pr: 301, reviewId: 515151, head }));
};

let actualFixture;
const actualBootstrapFixture = () => {
  if (actualFixture) return actualFixture;
  const local = makeBootstrapPacket();
  const repository = "Chillywood2025/chillywood-mobile";
  const pr = 226;
  const commentId = 5274614505;
  const amendmentCommentId = 5274913577;
  const verificationCorrectionCommentId = 5275618260;
  const branch = "codex/whole-app-engineering-doctrine-v1";
  const base = "8bf6459c3ae1cec62e26a1694f03063e4291b9f8";
  const seedTree = "64c3f8d56d93b08e5c3d3abbed11e707be1ede2b";
  const correctionHead = "cc509f67d27581438523e4aeb43bd497ff779368";
  const correctionTree = "ad9421dee033502e77f6dbb6bcbedf68d1734fa6";
  const head = "d".repeat(40);
  const tree = "e".repeat(40);
  const leaseId = "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1";
  const paths = local.packet.sections.K_IMPLEMENTATION_PLAN.files.slice().sort();
  const subject = doctrineBootstrapAuthorizationSubject({ repository, pr, branch, admittedSeedHead: base, admittedSeedTree: seedTree, protectedBase: base, leaseId, pathHash: "f6d652cb3f2086a00479188613d8a990ba64bd4b2be7c0d1325bf8ea9ce2a8af", maximumFiles: 25, maximumLines: 4000 });
  const comment = { id: commentId, node_id: "IC_kwDO_SANITIZED", user: { login: "Chillywood2025" }, author_association: "OWNER", body: doctrineBootstrapOwnerCommentBody(subject), created_at: "2026-08-12T12:00:00Z", updated_at: "2026-08-12T12:00:00Z", issue_url: `https://api.github.com/repos/${repository}/issues/${pr}`, html_url: `https://github.com/${repository}/pull/${pr}#issuecomment-${commentId}` };
  const amendment = { id: amendmentCommentId, node_id: "IC_kwDO_AMENDMENT", user: { login: "Chillywood2025" }, author_association: "OWNER", body: doctrineScopeAmendmentOwnerCommentBody(), created_at: "2026-08-13T01:42:03Z", updated_at: "2026-08-13T01:42:03Z", issue_url: `https://api.github.com/repos/${repository}/issues/${pr}`, html_url: `https://github.com/${repository}/pull/${pr}#issuecomment-${amendmentCommentId}` };
  const correction = { id: verificationCorrectionCommentId, node_id: "IC_kwDO_VERIFICATION", user: { login: "Chillywood2025" }, author_association: "OWNER", body: doctrineVerificationDependencyCorrectionOwnerCommentBody(), created_at: "2026-08-13T03:32:22Z", updated_at: "2026-08-13T03:32:22Z", issue_url: `https://api.github.com/repos/${repository}/issues/${pr}`, html_url: `https://github.com/${repository}/pull/${pr}#issuecomment-${verificationCorrectionCommentId}` };
  const pull = { number: pr, state: "open", draft: true, html_url: `https://github.com/${repository}/pull/${pr}`, head: { sha: head, ref: branch }, base: { sha: base, ref: "main" }, title: "Require authoritative bounded whole-app engineering closure" };
  const failedRun = { id: 31662770266, event: "pull_request", status: "completed", conclusion: "failure", head_sha: correctionHead, html_url: "https://github.com/Chillywood2025/chillywood-mobile/actions/runs/31662770266" };
  const failedJobs = { jobs: [{ id: 94330876566, name: "Phase 1 / Autonomous Systems All-Platform Contract", conclusion: "failure" }] };
  const failedLog = `${doctrineVerificationDependencyCorrectionSubject().failedPhase1.testPath}\n${doctrineVerificationDependencyCorrectionSubject().staleAssertion}\n`;
  const ghData = { pull, comment, amendment, correction, comments: [comment, amendment, correction], open: [pull], failedRun, failedJobs, failedLog };
  const gh = `#!/usr/bin/env node\nconst a=process.argv.join(' ');const d=${JSON.stringify(ghData)};if(a.includes('/actions/jobs/94330876566/logs'))process.stdout.write(d.failedLog);else {const out=a.includes('/actions/runs/31662770266/jobs')?d.failedJobs:a.endsWith('/actions/runs/31662770266')?d.failedRun:a.includes('/issues/comments/${verificationCorrectionCommentId}')?d.correction:a.includes('/issues/comments/${amendmentCommentId}')?d.amendment:a.includes('/issues/comments/${commentId}')?d.comment:a.includes('/issues/${pr}/comments?')?d.comments:a.includes('?state=open')?d.open:d.pull;process.stdout.write(JSON.stringify(out));}\n`;
  const amendedPaths = paths.filter((value) => value !== "tests/assurance/codex-security-reliability-s0.test.mjs");
  const baseTest = execFileSync("git", ["show", `${base}:tests/assurance/codex-security-reliability-s0.test.mjs`], { cwd: new URL(".", root), encoding: "utf8" });
  const gitData = { head, tree, correctionHead, correctionTree, base, seedTree, branch, paths, amendedPaths, baseTest };
  const git = `#!/usr/bin/env node\nconst a=process.argv.slice(2);const s=a.join(' ');const d=${JSON.stringify(gitData)};if(a[0]==='merge-base')process.exit(0);if(a[0]==='show'){require('node:fs').writeFileSync(1,d.baseTest);process.exit(0);}if(a[0]==='rev-parse'){if(s.includes('refs/remotes/origin/'))process.stdout.write(d.head+'\\n');else if(s.includes(d.head+'^{tree}'))process.stdout.write(d.tree+'\\n');else if(s.includes(d.correctionHead+'^{tree}'))process.stdout.write(d.correctionTree+'\\n');else process.stdout.write(d.seedTree+'\\n');}else if(a[0]==='diff'&&a.includes('--name-only')){const p=s.includes(d.correctionHead)?d.amendedPaths:d.paths;process.stdout.write(p.join('\\n')+'\\n');}else if(a[0]==='diff'&&a.includes('--numstat')){const p=s.includes(d.correctionHead)?d.amendedPaths:d.paths;process.stdout.write(p.map(v=>'1\\t0\\t'+v).join('\\n')+'\\n');}else if(a[0]==='diff')process.stdout.write('exact bounded doctrine diff');else process.exit(1);\n`;
  const observation = withFakeExecutables({ gh, git }, () => observeGitHubTaskIdentity({ repository, pr, branch, admittedSeedHead: base, protectedBase: base, leaseId, commentId, amendmentCommentId, verificationCorrectionCommentId, maximumFiles: 32, maximumLines: 7000 }));
  assert.equal(observation?.candidateEligible, true, JSON.stringify(observation, null, 2));
  actualFixture = makeBootstrapPacket(undefined, { taskIdentityObservation: observation, pr, leaseId });
  actualFixture.observation = observation;
  actualFixture.ownerComments = { originalRaw: comment, amendmentRaw: amendment, amendmentComments: [comment, amendment] };
  actualFixture.verificationCorrectionInputs = { originalRaw: comment, amendmentRaw: amendment, correctionRaw: correction, allComments: [comment, amendment, correction], failedRunRaw: failedRun, failedJobsRaw: failedJobs, failedJobLog: failedLog, currentHead: head };
  actualFixture.fakeGit = git;
  return actualFixture;
};

test("P1-1 source-bound transition authority", () => {
  assert.equal(authoritativeReplayOnce({ processIsolated: true }).p1Results.SOURCE_BOUND_TRANSITION_AUTHORITY_INCOMPLETE, true);
});

test("source-bound transition positive executable witness", () => {
  assert.equal(applyAssuranceEfficiencyTransition({ taskIdentityCurrent: true, currentState: "unresolved", transitionId: "resume" }).currentState, "planned");
  assert.equal(applyCodexSecurityTransition({ taskIdentityCurrent: true, currentState: "TARGET_FROZEN", transitionId: "freeze" }).currentState, "HOST_PREFLIGHT_CLEAR");
  assert.equal(applyAutonomousGovernanceTransition({ taskIdentityCurrent: true, currentState: "off", transitionId: "plan" }).currentState, "owner_assisted");
});

test("source-bound transition negative executable witness", () => {
  assert.throws(() => applyAssuranceEfficiencyTransition({ taskIdentityCurrent: false, currentState: "unresolved", transitionId: "resume" }), /GOVERNING_TRANSITION_PRECONDITION_FAILED/u);
  assert.throws(() => applyCodexSecurityTransition({ taskIdentityCurrent: true, currentState: "FICTIONAL", transitionId: "freeze" }), /GOVERNING_TRANSITION_PRECONDITION_FAILED/u);
  assert.throws(() => applyAutonomousGovernanceTransition({ taskIdentityCurrent: true, currentState: "off", transitionId: "route" }), /GOVERNING_TRANSITION_PRECONDITION_FAILED/u);
});

const controls = [
  ["01 product implementation cannot start without a packet", () => assert.equal(evaluateTaskAdmission({ productImplementation: true }).admissible, false)],
  ["02 universal completeness claims fail", () => assert.ok(gate({ ...clearPacket(), universalCompletenessClaim: true }).findings.includes("PREIMPLEMENTATION_SCOPE_UNBOUNDED"))],
  ["03 missing boundary fails", () => assert.ok(gate(failCheck("boundaryExplicit")).findings.includes("PREIMPLEMENTATION_BOUNDARY_UNDEFINED"))],
  ["04 missing dependency fails", () => assert.ok(gate(failCheck("dependencyClosureComplete")).findings.includes("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE"))],
  ["05 unowned authority fails", () => { const node = graphNode("a"); node.sharedMutableState[0].owner = "UNKNOWN_OWNER"; assert.ok(detectGraphFindings({ nodes: [node], edges: [] }).includes("UNOWNED_MUTABLE_STATE")); }],
  ["06 missing state or transition fails", () => assert.ok(gate(failCheck("reachableStateModelComplete")).findings.includes("PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE"))],
  ["07 missing invariant fails", () => assert.ok(gate(failCheck("requirementsMappedToInvariants")).findings.includes("PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE"))],
  ["08 invariant without negative evidence fails", () => assert.ok(gate(failCheck("positiveNegativeEvidencePlanned")).findings.includes("PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE"))],
  ["09 missing adversarial classification fails", () => assert.ok(gate(failCheck("adversarialMatrixComplete")).findings.includes("PREIMPLEMENTATION_ADVERSARIAL_MATRIX_INCOMPLETE"))],
  ["10 stale provider contract blocks only dependent work", () => { assert.equal(classifyContractFreshness({ dependent: true, freshnessClass: "BLOCKED_EXTERNAL" }).eligible, false); assert.equal(classifyContractFreshness({ dependent: false, freshnessClass: "BLOCKED_EXTERNAL" }).eligible, true); }],
  ["11 unstable ledger fails after bounded pass budget", () => assert.ok(gate(failCheck("defectLedgerStable")).findings.includes("PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE"))],
  ["12 test count cannot imply completeness", () => assert.ok(gate({ ...clearPacket(), testCountImpliesCompleteness: true, testCount: 99999 }).findings.includes("PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE"))],
  ["13 predictable omission uses exact classification", () => assert.equal(classifyLaterFinding("PREDICTABLE_MODEL_OMISSION").action, "PRE_IMPLEMENTATION_COVERAGE_FAILURE")],
  ["14 genuine novelty remains unverified without external authority", () => assert.equal(classifyLaterFinding("GENUINELY_NOVEL_DIMENSION", {}, exactFindingEvidence().novel).classification, "NOVELTY_CANDIDATE_UNVERIFIED")],
  ["15 external drift remains unverified without official authority", () => assert.equal(classifyLaterFinding("EXTERNAL_CONTRACT_DRIFT", {}, exactFindingEvidence().drift).classification, "EXTERNAL_CONTRACT_DRIFT_CANDIDATE_UNVERIFIED")],
  ["16 unrelated domains do not reopen", () => { const result = classifyLaterFinding("GENUINELY_NOVEL_DIMENSION", {}, exactFindingEvidence().novel); assert.equal(result.action, "NO_DOMAIN_REOPEN"); }],
  ["17 same PR remains active after model revision", () => assert.equal(classifyLaterFinding("PREDICTABLE_MODEL_OMISSION").samePrAndLease, true)],
  ["18 descendant commits need no new admission but local draft cannot clear", () => { const task = { classification: "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1", branch: bootstrapAuthority.branch, base: bootstrapAuthority.base, featureId: "assurance-efficiency-e0", packet: clearPacket(), certificate, artifactReservation: bootstrapFixture.reservation }; const result = evaluateTaskAdmission(task, { currentTruth: { mainSha: task.base }, currentMain: task.base, implementationMerged: false, bootstrapExpired: false }); assert.equal(result.admissible, false); assert.equal(result.code, "DOCTRINE_BOOTSTRAP_EXPIRED"); }],
  ["19 source pushes invalidate evidence and local draft still lacks authority", () => { const result = validateEngineeringTaskAuthority({ featureId: "assurance-efficiency-e0", branch: bootstrapAuthority.branch, currentMain: bootstrapAuthority.base, sourcePushed: true, closurePacket: clearPacket(), certificate }); assert.equal(result.ok, false); assert.equal(result.evidenceInvalidated, true); }],
  ["20 two predictable omissions require architecture review", () => { const prior = { classification: "PREDICTABLE_MODEL_OMISSION", findingId: "prior", reviewCycle: 1 }; prior.evidenceHash = hashValue(prior); assert.equal(classifyLaterFinding("PREDICTABLE_MODEL_OMISSION", {}, { findingClassEvidence: [prior] }).action, "DOMAIN_ARCHITECTURE_REVIEW_REQUIRED"); }],
  ["21 undocumented platform difference fails", () => assert.ok(detectGraphFindings({ nodes: [graphNode("a"), graphNode("b")], edges: [edge("a", "b", { platformDifferences: "" })] }).includes("UNDOCUMENTED_PLATFORM_MISMATCH"))],
  ["22 affected-scope orphan route fails", () => { const node = graphNode("a"); node.affectedOrphans = [{ kind: "route" }]; assert.ok(detectGraphFindings({ nodes: [node], edges: [] }).includes("AFFECTED_SCOPE_ORPHAN_ROUTE")); }],
  ["23 affected-scope orphan Edge Function fails", () => { const node = graphNode("a"); node.affectedOrphans = [{ kind: "edgeFunction" }]; assert.ok(detectGraphFindings({ nodes: [node], edges: [] }).includes("AFFECTED_SCOPE_ORPHAN_EDGE_FUNCTION")); }],
  ["24 affected-scope orphan table RPC migration fails", () => { const node = graphNode("a"); node.affectedOrphans = [{ kind: "data" }]; assert.ok(detectGraphFindings({ nodes: [node], edges: [] }).includes("AFFECTED_SCOPE_ORPHAN_TABLE_RPC_MIGRATION")); }],
  ["25 affected-scope orphan native module fails", () => { const node = graphNode("a"); node.affectedOrphans = [{ kind: "native" }]; assert.ok(detectGraphFindings({ nodes: [node], edges: [] }).includes("AFFECTED_SCOPE_ORPHAN_NATIVE_MODULE")); }],
  ["26 unregistered provider mutation fails", () => { const node = graphNode("a"); node.authorityOwned = [{ sourceKind: "SERVER", targetKind: "PROVIDER_MUTATION" }]; assert.ok(detectGraphFindings({ nodes: [node], edges: [] }).includes("UNREGISTERED_PROVIDER_MUTATION")); }],
  ["27 circular authority fails", () => assert.ok(detectGraphFindings({ nodes: [graphNode("a"), graphNode("b")], edges: [edge("a", "b"), edge("b", "a")] }).includes("CIRCULAR_AUTHORITY"))],
  ["28 duplicate authority fails", () => { const a = graphNode("a", "one"); const b = graphNode("b", "two"); b.sharedMutableState[0].stateId = a.sharedMutableState[0].stateId; assert.ok(detectGraphFindings({ nodes: [a, b], edges: [] }).includes("DUPLICATE_AUTHORITY_OWNER")); }],
  ["29 autonomous implementation without packet fails", () => assert.equal(evaluateAutonomousEngineeringRequest({ implementation: true }).code, "AUTONOMOUS_IMPLEMENTATION_WITHOUT_PACKET")],
  ["30 Cognitive recommendation cannot self-clear", () => assert.equal(evaluateAutonomousEngineeringRequest({ cognitiveRecommendationSelfClear: true }).code, "COGNITIVE_RECOMMENDATION_CANNOT_SELF_CLEAR")],
  ["31 task artifact reservation works", () => { const result = validateEngineeringTaskAuthority({ doctrineTruth: activeDoctrine, featureId: "chilly-chat-inbox-thread", phase: "DOMAIN_DISCOVERY", lease: { allowedPaths: [], artifactReservation: reservation }, sourceChanging: false }); assert.equal(result.ok, true); assert.equal(result.productSourceMutationAllowed, false); assert.equal(validateEngineeringTaskAuthority({ doctrineTruth: activeDoctrine, featureId: "chilly-chat-inbox-thread", phase: "DOMAIN_DISCOVERY", lease: {}, sourceChanging: false }).ok, false); }],
  ["32 task-local model updates require no meta PR", () => { const result = classifyLaterFinding("IMPLEMENTATION_DEFECT_WITHIN_MODEL"); assert.equal(result.samePrAndLease, true); assert.equal(result.action, "CORRECT_IN_SAME_PR_WITHOUT_MODEL_REWRITE"); }],
  ["33 recursion emits exact cycle code", () => assert.equal(evaluateTaskAdmission({ recursiveControlPrRequired: true }).code, "ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE")],
  ["34 graph generation is deterministic 3 of 3", () => { const hashes = [1, 2, 3].map(() => hashValue(generateDomainGraph(undefined, { refreshInventory: true }))); assert.equal(new Set(hashes).size, 1); }],
  ["35 current-truth generation is deterministic 3 of 3", () => { const truth = json("config/assurance/current-truth-v1.json"); assert.equal(new Set([1, 2, 3].map(() => hashValue([renderCurrentState(truth), renderNextTask(truth)]))).size, 1); }],
  ["36 doctrine bootstrap is local-draft blocked and expires after merge", () => { const task = { classification: "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1", branch: bootstrapAuthority.branch, base: bootstrapAuthority.base, featureId: "assurance-efficiency-e0", packet: clearPacket(), certificate, artifactReservation: bootstrapFixture.reservation }; assert.equal(evaluateTaskAdmission(task, { currentMain: task.base, implementationMerged: false, bootstrapExpired: false }).admissible, false); assert.equal(evaluateTaskAdmission(task, { currentMain: task.base, implementationMerged: true, bootstrapExpired: false }).code, "DOCTRINE_BOOTSTRAP_EXPIRED"); assert.equal(evaluateTaskAdmission(task, { currentMain: "1".repeat(40), implementationMerged: false, bootstrapExpired: false }).code, "DOCTRINE_BOOTSTRAP_EXPIRED"); }],
  ["37 Provider Codex Review remains optional advisory", () => { const truth = json("config/assurance/current-truth-v1.json"); assert.equal(truth.reviewPolicy.classification, "OPTIONAL_ADVISORY"); assert.equal(truth.reviewPolicy.blocksMerge, false); }],
  ["38 all 13 Phase 1 checks remain required", () => { assert.equal(json("config/assurance/current-truth-contract-v1.json").reviewPolicy.requiredPhase1Checks, 13); assert.equal(json("config/assurance/engineering-doctrine-v1.json").mergeEligibility.requiredPhase1Checks, 13); }],
  ["39 build release authority remains false", () => { const authority = json("config/assurance/engineering-doctrine-v1.json").authority; assert.deepEqual(Object.values(authority), [false, false, false, false, false, false, false, false, false, 0]); }],
  ["40 D2A terminal history remains intact when a later finite task is current", () => { const truth = json("config/assurance/current-truth-v1.json"); const latest = truth.latestMergedImplementationPr; const d2aLease = truth.finiteTaskLeases.tasks.find(({ implementationPr }) => implementationPr === 212); assert.deepEqual({ number: latest.number, state: latest.state, head: latest.head, mergeSha: latest.mergeSha }, { number: 212, state: "merged", head: "50b5f0498a59961278bb5afbca443c6e35cd5bb6", mergeSha: "fe775c12b0857aa50d986d24179ae9588049b6a1" }); assert.equal(d2aLease?.leaseId, "d2a-release-critical-pr-212-v1"); assert.equal(d2aLease?.taskState, "MERGED_VERIFIED"); if (truth.activeTaskBinding.implementationPr === 212) { assert.equal(truth.activeTaskBinding.phase, "TERMINAL"); assert.equal(truth.activeTaskBinding.completionScope, "D2A_BOUND_COMPLETE_FOR_REGISTERED_NATIVE_LIFECYCLE_SCOPE"); } else { const currentLease = truth.finiteTaskLeases.tasks.filter(({ implementationPr, taskState }) => implementationPr === truth.activeTaskBinding.implementationPr && !["MERGED_VERIFIED", "ABANDONED_BY_OWNER"].includes(taskState)); assert.equal(currentLease.length, 1); } }]
];

assert.equal(controls.length, 40);
for (const [name, proof] of controls) test(name, proof);

test("autonomous caller cannot forge a reused engineering clearance", () => assert.equal(evaluateAutonomousEngineeringRequest({ implementation: true, engineeringAuthority: { ok: true, productSourceMutationAllowed: true, classification: "PREIMPLEMENTATION_ENGINEERING_CLEAR", derivedGate: { clear: true } } }).allowed, false));

test("all asserted check flags cannot clear missing structural evidence", () => {
  const malformed = { id: "ENGINEERING_CLOSURE_PACKET_V1", task: "EMPTY", checks: { ...CLEAR_CHECKS }, completionStatus: "BOUND_COMPLETE_FOR_REGISTERED_SCOPE", sections: Object.fromEntries(Object.keys(clearPacket().sections).map((name) => [name, {}])) };
  const result = gate(malformed, { id: "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" });
  assert.equal(result.clear, false); assert.equal(result.derivedChecks.boundaryExplicit, false); assert.ok(result.findings.length > 5);
});

test("certificate and contract declarations are exact canonical bindings", () => {
  const packet = clearPacket(); packet.sections.B_BOUNDED_COMPLETENESS.contractClassifications[0].status = "HISTORICAL";
  assert.ok(gate(packet).findings.includes("PREIMPLEMENTATION_PROVIDER_CONTRACT_STALE"));
  const mismatch = clearPacket(); const external = structuredClone(certificate); external.graphHash = "0".repeat(64);
  assert.ok(gate(mismatch, external).findings.includes("PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE"));
});

test("inventory hash binds totals classifications members and content digests", () => {
  const inventory = buildInventory(); const mutate = (change) => { const copy = structuredClone(inventory); delete copy.sourceInventoryHash; change(copy); return hashValue(copy); };
  assert.notEqual(mutate((copy) => { copy.totals.staticTables += 1; }), inventory.sourceInventoryHash);
  assert.notEqual(mutate((copy) => { copy.groups[0].classification = "UNKNOWN_OWNER"; }), inventory.sourceInventoryHash);
  assert.notEqual(mutate((copy) => { copy.groups[0].members[0].contentSha256 = "0".repeat(64); }), inventory.sourceInventoryHash);
});

test("discovery phase permits only reserved artifact evidence and implementation still needs derived clear", () => {
  const base = { doctrineTruth: activeDoctrine, featureId: "chilly-chat-inbox-thread", lease: { allowedPaths: [], artifactReservation: reservation } };
  assert.equal(validateEngineeringTaskAuthority({ ...base, phase: "DOMAIN_DISCOVERY", changedPaths: [reservation.closureArtifactPath] }).ok, false, "caller paths cannot impersonate fixed git observation");
  assert.equal(validateEngineeringTaskAuthority({ ...base, phase: "DOMAIN_DISCOVERY", changedPaths: ["app/chat/a.tsx"] }).ok, false);
  assert.equal(validateEngineeringTaskAuthority({ ...base, phase: "IMPLEMENTATION", changedPaths: ["app/chat/a.tsx"], closurePacket: { id: "ENGINEERING_CLOSURE_PACKET_V1", checks: { ...CLEAR_CHECKS } }, certificate: { id: "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" } }).ok, false);
});

test("bootstrap and control labels cannot bypass active doctrine admission", () => {
  assert.equal(evaluateTaskAdmission({ closureArtifactPath: "docs/assurance/task.json", packet: clearPacket(), certificate }, { currentMain: "9".repeat(40), currentTruth: { engineeringDoctrine: { status: "ACTIVE" } } }).code, "DOCTRINE_BOOTSTRAP_EXPIRED");
  assert.equal(evaluateTaskAdmission({}).admissible, false);
  assert.equal(evaluateTaskAdmission({ classification: "READ_ONLY_NON_SOURCE_TASK", sourceChanging: false }).admissible, false);
  const e0 = validateEngineeringTaskAuthority({ doctrineTruth: activeDoctrine, featureId: "assurance-efficiency-e0", phase: "DOMAIN_DISCOVERY", lease: {}, changedPaths: ["app/login.tsx"] });
  assert.equal(e0.ok, false); assert.ok(e0.findings.includes("PREIMPLEMENTATION_AFFECTED_DOMAIN_INCOMPLETE"));
});

test("canonical unknown asset state invariant and authority evidence cannot be vacuous", () => {
  const unknown = makeTaskPacket(); assert.ok(unknown.gate.findings.includes("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE"));
  const asset = clearPacket(); asset.sections.C_AFFECTED_DOMAIN_CLOSURE.computedClosure.requiredIncludedEdges.pop(); assert.ok(gate(asset).findings.includes("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE"));
  const state = clearPacket(); state.sections.F_STATE_MODEL.domainModels[0].transitionContracts[0].from = "one"; assert.ok(gate(state).findings.includes("PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE"));
  const invariant = clearPacket(); invariant.sections.G_INVARIANTS.pop(); assert.ok(gate(invariant).findings.includes("PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE"));
  const authority = clearPacket(); authority.sections.I_COVERAGE_MAP.authorityEdges.pop(); assert.ok(gate(authority).findings.includes("PREIMPLEMENTATION_ADVERSARIAL_MATRIX_INCOMPLETE"));
});

for (const providerId of ["apple", "cloudflare-r2"]) test(`${providerId} blocked external contract is dependency scoped`, () => {
  const contracts = structuredClone(canonicalContext.contracts); const contract = contracts.contracts.find(({ id }) => id === providerId); contract.affectedDomains.push("assurance-efficiency-e0");
  const packet = rebindContracts(clearPacket(), contracts);
  assert.equal(evaluatePreimplementationGate(packet, { ...canonicalContext, contracts, certificate: packet.sections.L_COMPLETENESS_CERTIFICATE, bootstrapAuthority, artifactReservation: bootstrapFixture.reservation }).findings.includes("PREIMPLEMENTATION_PROVIDER_CONTRACT_STALE"), false);
  const dependent = rebindPacketFacts(structuredClone(packet)); dependent.sections.K_IMPLEMENTATION_PLAN.dataNativeProviderChanges = [`${providerId} mutation`]; rebindPacketFacts(dependent);
  assert.ok(evaluatePreimplementationGate(dependent, { ...canonicalContext, contracts, certificate: dependent.sections.L_COMPLETENESS_CERTIFICATE, bootstrapAuthority, artifactReservation: bootstrapFixture.reservation, actualScope: bootstrapFixture.actualScope }).findings.includes("PREIMPLEMENTATION_PROVIDER_CONTRACT_STALE"));
  contract.affectedDomains = contract.affectedDomains.filter((domain) => domain !== "assurance-efficiency-e0"); const unrelated = rebindContracts(clearPacket(), contracts);
  assert.equal(evaluatePreimplementationGate(unrelated, { ...canonicalContext, contracts, certificate: unrelated.sections.L_COMPLETENESS_CERTIFICATE, bootstrapAuthority, artifactReservation: bootstrapFixture.reservation }).findings.includes("PREIMPLEMENTATION_PROVIDER_CONTRACT_STALE"), false);
});

test("novelty pass budget and counters fail closed without bound evidence", () => {
  assert.equal(classifyLaterFinding("GENUINELY_NOVEL_DIMENSION").classification, "NOVELTY_CANDIDATE_UNVERIFIED");
  assert.equal(classifyLaterFinding("EXTERNAL_CONTRACT_DRIFT").classification, "EXTERNAL_CONTRACT_DRIFT_CANDIDATE_UNVERIFIED");
  const reset = clearPacket(); reset.sections.J_STABLE_DEFECT_LEDGER.revisionCounters.predictableOmissionCount = 0; assert.ok(gate(reset).findings.includes("PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE"));
  const noHash = clearPacket(); noHash.sections.J_STABLE_DEFECT_LEDGER.authoritativeReplay[0].receipts[0].receiptHash = ""; assert.ok(gate(noHash).findings.includes("PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE"));
  const unstable = clearPacket(); unstable.sections.J_STABLE_DEFECT_LEDGER.authoritativeReplay.push({ laneId: "PASS_D" }); assert.ok(gate(unstable).findings.includes("PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE"));
});

test("reservation paths and measured scope fail closed", () => {
  const unsafe = structuredClone(reservation); unsafe.closureArtifactPath = "app/login.tsx";
  assert.equal(validateEngineeringTaskAuthority({ doctrineTruth: activeDoctrine, featureId: "chilly-chat-inbox-thread", phase: "DOMAIN_DISCOVERY", lease: { artifactReservation: unsafe }, changedPaths: ["app/login.tsx"] }).ok, false);
  assert.equal(validateEngineeringTaskAuthority({ doctrineTruth: activeDoctrine, featureId: "chilly-chat-inbox-thread", phase: "DOMAIN_DISCOVERY", lease: { artifactReservation: reservation }, changedPaths: [reservation.closureArtifactPath, ...Array(4).fill(0).map((_, index) => `tests/assurance/${index}.mjs`)] }).ok, false);
  assert.equal(validateEngineeringTaskAuthority({ doctrineTruth: activeDoctrine, featureId: "chilly-chat-inbox-thread", phase: "IMPLEMENTATION", lease: { artifactReservation: reservation }, changedPaths: ["app/chat/a.tsx"], closurePacket: { id: "ENGINEERING_CLOSURE_PACKET_V1" }, certificate: { id: "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" } }).findings.includes("FINITE_TASK_SCOPE_MEASUREMENT_MISSING"), true);
});

test("active engineering truth rejects nulls minimal readiness and bare completion", () => {
  const truth = json("config/assurance/current-truth-v1.json"); const contract = json("config/assurance/current-truth-contract-v1.json");
  truth.engineeringDoctrine = { doctrineId: "WHOLE_APP_ENGINEERING_BEFORE_IMPLEMENTATION_DOCTRINE_V1", version: 1, status: "ACTIVE", boundedDefinition: "BOUND_COMPLETE_FOR_REGISTERED_SCOPE", domainReadiness: [{ featureId: "assurance-efficiency-e0" }], inventoryHash: null, graphHash: null, taxonomyHash: null, platformProviderContractHash: null, featureRegistryHash: null, activePacketHash: null, certificateHash: null, defectLedgerHash: null };
  const ids = validateEngineeringDoctrineTruth(truth, contract).map(({ id }) => id); assert.ok(ids.includes("ASSURANCE_ENGINEERING_DOCTRINE_ACTIVE_FIELDS_MALFORMED")); assert.ok(ids.includes("ASSURANCE_DOMAIN_READINESS_INCOMPLETE"));
  truth.engineeringDoctrine.domainReadiness[0].architectureStatus = "COMPLETE"; assert.ok(validateEngineeringDoctrineTruth(truth, contract).some(({ id }) => id === "ASSURANCE_UNIVERSAL_COMPLETENESS_CLAIM_REJECTED"));
});

test("ACTIVE truth binds canonical report packet certificate counters coverage and no-task sentinel", () => {
  const base = json("config/assurance/current-truth-v1.json"); const contract = json("config/assurance/current-truth-contract-v1.json"); const report = buildDoctrineReport(); const graph = generateDomainGraph(); const tierIds = ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"];
  const packet = report.bootstrap.packet; const cert = packet.sections.L_COMPLETENESS_CERTIFICATE; base.engineeringDoctrine = { doctrineId: "WHOLE_APP_ENGINEERING_BEFORE_IMPLEMENTATION_DOCTRINE_V1", version: 1, status: "ACTIVE", boundedDefinition: "BOUND_COMPLETE_SOURCE_ONLY", doctrineHash: report.hashes.doctrine, doctrineReportPath: "docs/assurance/whole-app-engineering-doctrine-v1-report.json", doctrineReportHash: hashValue(report), evidenceAuthorityHash: report.hashes.evidenceAuthority, inventoryHash: report.hashes.inventory, graphHash: report.hashes.graph, transitionModelHash: report.hashes.transitionModel, authoritativeReplayHash: report.hashes.authoritativeReplay, taxonomyHash: report.hashes.taxonomy, platformProviderContractHash: report.hashes.platformProviderContracts, featureRegistryHash: report.hashes.featureRegistry, activePacketPath: "docs/assurance/whole-app-engineering-doctrine-v1-report.json", activePacketHash: hashValue(packet), activeTaskSentinel: "NO_ACTIVE_PRODUCT_IMPLEMENTATION", affectedDomains: [], certificateHash: hashValue(cert), defectLedgerHash: packet.sections.J_STABLE_DEFECT_LEDGER.hash, discoveryPasses: 3, reconciliationPasses: 1, ...report.coverage, predictableOmissionCount: 10, novelDimensionCount: 0, contractDriftCount: 0, modelRevisionCount: 5, verificationCycles: 10, taskLeaseState: "NO_ACTIVE_TASK", blockers: [], nextPermittedAction: "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE", domainReadiness: json("config/assurance/feature-registry-v1.json").features.map(({ featureId }) => ({ featureId, architectureStatus: "BOUND_INCOMPLETE", proofTiers: Object.fromEntries(tierIds.map((tier) => [tier, "BLOCKED_INTERNAL"])), sourceStatus: "BOUND_INCOMPLETE", integrationStatus: "BOUND_INCOMPLETE", nativeProviderStatus: "BOUND_COMPLETE_WITH_EXTERNAL_PROOF_BLOCKED", signedInstalledPhysicalPublicStatus: "BOUND_COMPLETE_WITH_EXTERNAL_PROOF_BLOCKED", blockers: ["domain task closure pending"], lastEvidence: "deterministic doctrine baseline", disposition: "launch status unresolved" })) };
  assert.deepEqual(validateEngineeringDoctrineTruth(base, contract, { report, graph }), []);
  const stale = structuredClone(base); stale.engineeringDoctrine.pairwiseCoverage = 0; assert.ok(validateEngineeringDoctrineTruth(stale, contract, { report, graph }).some(({ id }) => id === "ASSURANCE_ENGINEERING_DOCTRINE_REPORT_BINDING_INVALID"));
  const fake = structuredClone(base); fake.engineeringDoctrine.activePacketHash = "f".repeat(64); assert.ok(validateEngineeringDoctrineTruth(fake, contract, { report, graph }).some(({ id }) => id === "ASSURANCE_ENGINEERING_DOCTRINE_HASH_STALE"));
});

test("canonical inventory and graph cover the reconciled finite baseline", () => {
  const inventory = buildInventory(); const graph = generateDomainGraph(); const taxonomy = json("config/assurance/adversarial-taxonomy-v1.json");
  assert.equal(graph.nodes.length, 22); assert.equal(inventory.totals.routeModules, 70); assert.equal(inventory.totals.edgeFunctions, 77); assert.equal(inventory.totals.autonomousComponents, 61); assert.equal(taxonomy.classes.length, 35); assert.ok(detectGraphFindings(graph).includes("DUPLICATE_AUTHORITY_OWNER")); assert.deepEqual(detectGraphFindings(graph, ["assurance-efficiency-e0", "codex-security-scan-reliability-s0", "autonomous-cognitive-governance"]), []);
});

test("affected-domain traversal requires exact exclusions", () => {
  const graph = { nodes: [graphNode("a"), graphNode("b")], edges: [edge("a", "b")] };
  assert.deepEqual(affectedDomainClosure(graph, "a").domains, ["a", "b"]);
  assert.equal(affectedDomainClosure(graph, "a", [{ classification: "NON_IMPACTING_WITH_EVIDENCE", edge: "a-to-b" }]).status, "BOUND_INCOMPLETE");
  assert.deepEqual(affectedDomainClosure(graph, "a", [{ classification: "NON_IMPACTING_WITH_EVIDENCE", edge: "a-to-b", domain: "a", reasonCode: "DATA_NOT_READ", canonicalTransfer: "registered transfer", ...semanticEvidence("tests/assurance/engineering-doctrine.test.mjs", "affected-domain traversal requires exact exclusions"), positiveWitness: "registered edge exclusion is exact", negativeWitness: "negative witness rejects the edge", exactContract: "whole-app-domain-graph-v1" }]).domains, ["a", "b"]);
});

test("doctrine self-hosts with a stable packet certificate and gate", () => {
  const first = makeBootstrapPacket(); const second = makeBootstrapPacket(); const report = buildDoctrineReport();
  assert.equal(first.gate.clear, false); assert.equal(first.gate.id, "ENGINEERING_PLAN_DRAFTED"); assert.deepEqual(first.gate.findings, ["PREIMPLEMENTATION_GIT_GITHUB_IDENTITY_REQUIRED"]); assert.equal(first.packet.completionStatus, "BOUND_COMPLETE_SOURCE_ONLY"); assert.equal(first.certificate.status, "BOUND_COMPLETE_SOURCE_ONLY"); assert.equal(stableJson(first), stableJson(second)); assert.equal(report.discoveryPasses, 3); assert.equal(report.reconciliationPasses, 1); assert.equal(report.predictableOmissionCount, 10); assert.equal(report.modelRevisionCount, 5); assert.equal(report.verificationCycleCount, 10); assert.equal(report.architectureReview.cycles, 5); assert.match(report.architectureReview.passCFreezeHash, /^[0-9a-f]{64}$/u);
});

test("bootstrap exact scope and authoritative lifecycle fail closed", () => {
  const task = { classification: bootstrapFixture.packet.classification, branch: bootstrapAuthority.branch, base: bootstrapAuthority.base, featureId: "assurance-efficiency-e0", packet: clearPacket(), certificate, artifactReservation: bootstrapFixture.reservation };
  const authority = { currentMain: bootstrapAuthority.base, implementationMerged: false, bootstrapExpired: false };
  for (const file of ["app/login.tsx", "supabase/migrations/evil.sql", "package-lock.json"]) { const changed = structuredClone(task); changed.packet.sections.K_IMPLEMENTATION_PLAN.files[0] = file; rebindPacketFacts(changed.packet); assert.equal(evaluateTaskAdmission(changed, authority).admissible, false); }
  { const changed = structuredClone(task); changed.packet.sections.K_IMPLEMENTATION_PLAN.scopeBudget.maximumLines = 20000; rebindPacketFacts(changed.packet); assert.equal(evaluateTaskAdmission(changed, authority).admissible, false); }
  assert.equal(evaluateTaskAdmission(task, {}).admissible, false);
  assert.equal(validateEngineeringTaskAuthority({ featureId: "auth-session-password-recovery", currentMain: bootstrapAuthority.base, changedPaths: ["app/login.tsx"], changedLines: 999999 }).ok, false);
  assert.equal(validateEngineeringTaskAuthority({ featureId: "auth-session-password-recovery", currentMain: bootstrapAuthority.base, changedPaths: [], sourceChanging: false, readOnlyDiagnostic: true }).classification, "READ_ONLY_DIAGNOSTIC_NO_MUTATION");
});

test("future product packets default incomplete and cannot inject raw authority or scope", () => {
  const future = makeTaskPacket({ evidencePath: "tests/assurance/engineering-doctrine.test.mjs", technicalResolutionSource: "tests/assurance/engineering-doctrine.test.mjs" });
  assert.equal(future.gate.clear, false); assert.ok(future.gate.findings.includes("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE")); assert.ok(future.gate.findings.includes("PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE"));
  const forged = evaluatePreimplementationGate(future.packet, { ...canonicalContext, certificate: future.certificate, artifactReservation: future.reservation, actualScope: future.actualScope, ownerAuthorizations: [{ verified: true }], ownerAuthorizationComments: [ownerComment({ id: 9000, type: "REGISTERED_OWNER_DECISION", subject: {}, task: future.packet.task, leaseId: future.certificate.leaseId })] });
  assert.equal(forged.clear, false); assert.equal(validateEngineeringTaskAuthority({ doctrineTruth: activeDoctrine, featureId: future.certificate.featureDomain, phase: "IMPLEMENTATION", lease: { artifactReservation: future.reservation }, closurePacket: future.packet, certificate: future.certificate, changedLines: 1, actualScope: future.actualScope }).findings.includes("FINITE_TASK_SCOPE_MEASUREMENT_MISSING"), true);
});

test("only fixed git observation can establish source scope and caller cannot underreport", () => {
  const original = process.env.PATH; const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctrine-git-")); const executable = path.join(dir, "git");
  fs.writeFileSync(executable, `#!/bin/sh\ncase "$*" in\n*--name-only*) printf 'app/chat/a.tsx\\n';;\n*--numstat*) printf '10000\\t0\\tapp/chat/a.tsx\\n';;\n*rev-parse*) printf '${"3".repeat(40)}\\n';;\n*) printf 'fixed diff';;\nesac\n`); fs.chmodSync(executable, 0o755); process.env.PATH = `${dir}:${original}`;
  try { const observed = observeCandidateScopeFromGit("1".repeat(40), "2".repeat(40)); assert.equal(observed.changedLines, 10000); assert.deepEqual(observed.paths, ["app/chat/a.tsx"]); } finally { process.env.PATH = original; fs.rmSync(dir, { recursive: true, force: true }); }
});

test("graph reservations reject self-authorized product and high-risk globs", () => {
  for (const file of ["supabase/migrations/evil.sql", "app/admin/owner.tsx"]) { const future = makeTaskPacket({ files: [file], pathGlobs: [file] }); assert.equal(future.gate.clear, false); assert.ok(future.gate.findings.includes("PREIMPLEMENTATION_SCOPE_UNBOUNDED")); }
});

test("NON_IMPACTING evidence binds canonical transfer source semantics and witness test", () => {
  assert.ok(NON_IMPACT_EDGE_WITNESS.includes("edge-23-")); const packet = clearPacket(); const exact = structuredClone(packet.sections.C_AFFECTED_DOMAIN_CLOSURE.nonImpactingWithEvidence); assert.equal(gate(packet).findings.includes("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE"), false); const bad = structuredClone(packet); bad.sections.C_AFFECTED_DOMAIN_CLOSURE.nonImpactingWithEvidence = exact.slice(1); rebindPacketFacts(bad); assert.ok(gate(bad).findings.includes("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE"));
});

test("fiction evidence fake aggregate and arbitrary tuple plans fail", () => {
  assert.ok(TECHNICAL_UNKNOWN_BINDINGS.includes("chilly-chat-inbox-thread:hooks/libraries exact binding")); const badEvidence = makeTaskPacket({ evidencePath: "tests/assurance/engineering-doctrine.test.mjs" }); assert.ok(badEvidence.gate.findings.includes("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE"));
  const aggregate = clearPacket(); aggregate.sections.F_STATE_MODEL.reachableStates[0] = "fiction"; assert.ok(gate(aggregate).findings.includes("PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE"));
  const tuples = clearPacket(); tuples.sections.H_ADVERSARIAL_MATRIX.pairwiseCoverage = [{ id: "x", dimensions: ["x", "y"], tuples: [["x", "y"]], tupleCount: 1, tupleHash: hashValue([["x", "y"]]) }]; assert.ok(gate(tuples).findings.includes("PREIMPLEMENTATION_ADVERSARIAL_MATRIX_INCOMPLETE"));
});

test("inventory ownership is singular and count-derived", () => {
  const inventory = buildInventory(undefined, { refreshInventory: true }); assert.equal(inventory.ownershipIntegrity.everyGroupBound, true); assert.equal(inventory.ownershipIntegrity.memberCount, inventory.ownershipIntegrity.statusCount);
  for (const group of inventory.groups) assert.equal(group.ownership.owned + group.ownership.shared + group.ownership.unknown + group.ownership.orphan + group.ownership.ambiguous, group.count);
  assert.equal(inventory.ownershipGaps.orphanRoutes, inventory.groups.find(({ id }) => id === "routes").ownership.orphan);
});

const expectGateFinding = (mutate, code) => {
  const packet = clearPacket();
  mutate(packet);
  rebindPacketFacts(packet);
  assert.ok(gate(packet).findings.includes(code));
};

const transitionMutants = [
  ["P1-1 transition declared but no implementation symbol fails", (t) => { t.observation.implementationSymbol = null; }],
  ["P1-1 wrong implementation symbol fails", (t) => { t.observation.implementationSymbol = "commentOnlyImplementation"; }],
  ["P1-1 implementation without precondition guard fails", (t) => { t.observation.preconditionEnforcementSymbol = null; t.observation.directCalls = t.observation.directCalls.filter((name) => name !== "assertGoverningPreconditions"); }],
  ["P1-1 effect owner mismatch fails", (t) => { t.observation.exactEffectOwner = "attacker"; }],
  ["P1-1 rollback declaration without implementation binding fails", (t) => { t.observation.rollbackSymbol = null; }],
  ["P1-1 lifecycle declaration without implementation binding fails", (t) => { t.observation.lifecycleSymbol = null; }],
  ["P1-1 declaration and verifier from same receipt fails", (t) => { t.independentVerifier.sourcePath = t.observation.implementationSourcePath; t.independentVerifier.verifierSourceHash = t.observation.implementationSourceHash; }],
  ["P1-1 stale implementation hash fails", (t) => { t.observation.implementationAstBodyHash = "0".repeat(64); }],
  ["P1-1 stale verifier hash fails", (t) => { t.independentVerifier.verifierSourceHash = "0".repeat(64); }],
  ["P1-1 fictional source state fails", (t) => { t.sourceStates = ["FICTIONAL_SOURCE"]; }],
  ["P1-1 fictional destination state fails", (t) => { t.destinationStates = ["FICTIONAL_DESTINATION"]; }],
  ["P1-1 zero-match selector fails", (t) => { t.observation.implementationSelectorMatchCount = 0; }],
  ["P1-1 multi-match selector fails", (t) => { t.observation.implementationSelectorMatchCount = 2; }],
  ["P1-1 terminal resurrection fails", (t) => { t.sourceStates = ["closed"]; t.destinationStates = ["unresolved"]; t.terminality = "NON_TERMINAL"; }],
  ["P1-1 comment-only implementation fails", (t) => { t.observation.implementationSymbol = "comment-only implementation"; t.observation.implementationSelectorMatchCount = 1; }],
];
for (const [name, mutate] of transitionMutants) test(name, () => {
  const replay = authoritativeReplayOnce({ processIsolated: true });
  const model = structuredClone(replay.transitionModel);
  mutate(model.domains[0].transitions[0]);
  assert.equal(verifySerializedTransitionModel(model, { sourceIdentity: replay.sourceIdentity }).ok, false);
});

const edgeMutants = [
  ["P1-2 removing an observed authority edge fails", (output) => { output.edgeEvidence.observedRepositoryEdges.splice(output.edgeEvidence.observedRepositoryEdges.findIndex(({ governingCandidate }) => governingCandidate), 1); }],
  ["P1-2 removing an observed shared-state edge fails", (output) => { output.edgeEvidence.verifiedGoverningEdges.shift(); }],
  ["P1-2 removing cleanup rollback edge fails", (output) => { output.edgeEvidence.verifiedGoverningEdges = output.edgeEvidence.verifiedGoverningEdges.filter(({ declaredImpactClasses }) => !declaredImpactClasses.includes("cleanup") || !declaredImpactClasses.includes("rollback")); }],
  ["P1-2 adding fictional edge fails", (output) => { output.edgeEvidence.observedRepositoryEdges.push({ ...structuredClone(output.edgeEvidence.observedRepositoryEdges[0]), sourceDomainCandidate: "fiction" }); }],
  ["P1-2 duplicate edge fails", (output) => { output.edgeEvidence.observedRepositoryEdges.push(structuredClone(output.edgeEvidence.observedRepositoryEdges[0])); }],
  ["P1-2 changing edge direction fails", (output) => { output.edgeEvidence.verifiedGoverningEdges[0].authorityDirection = "DESTINATION_TO_SOURCE"; }],
  ["P1-2 wildcard exclusion fails", (output) => { output.closure.exclusionReceipts[0].enforcingSourceBinding.sourcePath = "scripts/**"; }],
  ["P1-2 prose-only exclusion fails", (output) => { output.closure.exclusionReceipts[0] = { edgeId: output.closure.exclusionReceipts[0].edgeId, reason: "no impact" }; }],
  ["P1-2 exclusion for nonexistent edge fails", (output) => { output.closure.exclusionReceipts[0].edgeId = "edge-fiction"; }],
  ["P1-2 copying expected edge set into actual fails", (output) => { output.edgeEvidence.verifiedGoverningEdges = []; output.closure.actualIncludedEdges = [...output.closure.requiredIncludedEdges]; }],
];
for (const [name, mutate] of edgeMutants) test(name, () => { const output = authoritativeReplayOnce({ processIsolated: true }); mutate(output); assert.equal(verifySerializedEdgeModel(output).ok, false); });

const discoveryMutants = [
  ["P1-3 passComplete true with missing receipts fails", (lanes) => { lanes[0].computedStatus = "VERIFIED"; lanes[0].receipts.pop(); }],
  ["P1-3 duplicate receipt fails", (lanes) => { lanes[0].receipts.push(structuredClone(lanes[0].receipts[0])); }],
  ["P1-3 missing item fails", (lanes) => { lanes[0].worklist.pop(); }],
  ["P1-3 fictional extra item fails", (lanes) => { lanes[0].worklist.push({ itemId: "FICTION", procedure: "fiction" }); }],
  ["P1-3 stale source receipt fails", (lanes) => { lanes[0].receipts[0].sourceTree = "0".repeat(40); }],
  ["P1-3 deferred item hidden as complete fails", (lanes) => { lanes[2].receipts[3].deferredClassification = "HIDDEN_DEFERRED"; lanes[2].receipts[3].result = "VERIFIED"; }],
  ["P1-3 agent prose without grounded receipt fails", (lanes) => { lanes[0].agentProse = "all complete"; }],
];
for (const [name, mutate] of discoveryMutants) test(name, () => expectGateFinding((packet) => mutate(packet.sections.J_STABLE_DEFECT_LEDGER.authoritativeReplay), "PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE"));

test("P1-4 fictional PR fails", () => { const fixture = actualBootstrapFixture(); const forged = structuredClone(fixture.observation); forged.pr = 999; assert.equal(evaluatePreimplementationGate(fixture.packet, { certificate: fixture.certificate, taskIdentityObservation: forged }).clear, false); });
test("P1-4 wrong branch fails", () => { const fixture = actualBootstrapFixture(); const forged = structuredClone(fixture.observation); forged.branch = "evil"; assert.equal(evaluatePreimplementationGate(fixture.packet, { certificate: fixture.certificate, taskIdentityObservation: forged }).clear, false); });
test("P1-4 wrong head tree fails", () => { const fixture = actualBootstrapFixture(); const forged = structuredClone(fixture.observation); forged.head = "c".repeat(40); assert.equal(evaluatePreimplementationGate(fixture.packet, { certificate: fixture.certificate, taskIdentityObservation: forged }).clear, false); });
test("P1-4 non-descendant fails", () => { const fixture = actualBootstrapFixture(); const forged = structuredClone(fixture.observation); forged.seedAncestor = false; assert.equal(evaluatePreimplementationGate(fixture.packet, { certificate: fixture.certificate, taskIdentityObservation: forged }).clear, false); });
test("P1-4 out-of-scope path fails", () => { const fixture = actualBootstrapFixture(); const forged = structuredClone(fixture.observation); forged.paths.push("app/evil.tsx"); assert.equal(evaluatePreimplementationGate(fixture.packet, { certificate: fixture.certificate, taskIdentityObservation: forged }).clear, false); });
test("P1-4 scope overflow fails", () => { const fixture = actualBootstrapFixture(); const forged = structuredClone(fixture.observation); forged.changedLines = 4001; assert.equal(evaluatePreimplementationGate(fixture.packet, { certificate: fixture.certificate, taskIdentityObservation: forged }).clear, false); });
test("P1-4 local-only task cannot clear", () => { const local = makeBootstrapPacket(); assert.equal(local.gate.status, "ENGINEERING_PLAN_DRAFTED"); assert.equal(local.gate.clear, false); });
test("P1-4 actual PR 226 identity and all three Owner comments bind exactly", () => { const fixture = actualBootstrapFixture(); assert.equal(fixture.observation.candidateEligible, true); assert.equal(fixture.observation.pr, 226); assert.equal(fixture.observation.branch, "codex/whole-app-engineering-doctrine-v1"); assert.equal(fixture.observation.base, "8bf6459c3ae1cec62e26a1694f03063e4291b9f8"); assert.equal(fixture.observation.head, "d".repeat(40)); assert.equal(fixture.observation.tree, "e".repeat(40)); assert.equal(fixture.observation.ownerComment.id, 5274614505); assert.equal(fixture.observation.scopeAmendmentCommentId, 5274913577); assert.equal(fixture.observation.verificationCorrectionCommentId, 5275618260); assert.equal(fixture.observation.paths.length, 32); });

const scopeAmendmentFixture = (mutate = () => {}, overrides = {}) => {
  const fixture = actualBootstrapFixture();
  const comments = structuredClone(fixture.ownerComments);
  mutate(comments);
  return verifyDoctrineScopeAmendment({ ...comments, currentHead: "c9192f0f94d903617eb28deba610c26c41dc8eeb", ...overrides });
};
test("scope amendment exact amendment passes", () => assert.equal(scopeAmendmentFixture().ok, true));
test("scope amendment edited amendment fails", () => assert.equal(scopeAmendmentFixture(({ amendmentRaw }) => { amendmentRaw.body += "edited"; }).ok, false));
test("scope amendment wrong PR fails", () => assert.equal(scopeAmendmentFixture(() => {}, { currentPr: 225 }).ok, false));
test("scope amendment wrong branch fails", () => assert.equal(scopeAmendmentFixture(() => {}, { currentBranch: "evil" }).ok, false));
test("scope amendment wrong current head fails", () => assert.equal(scopeAmendmentFixture(() => {}, { currentHead: "0".repeat(40) }).ok, false));
test("scope amendment missing original authorization fails", () => assert.equal(scopeAmendmentFixture((comments) => { comments.originalRaw = null; }).ok, false));
test("scope amendment wildcard added path fails", () => assert.equal(scopeAmendmentFixture(({ amendmentRaw }) => { amendmentRaw.body = amendmentRaw.body.replace("scripts/assurance/pr-scope.mjs", "scripts/**"); }).ok, false));
test("scope amendment unrelated path fails", () => assert.equal(scopeAmendmentFixture(({ amendmentRaw }) => { amendmentRaw.body = amendmentRaw.body.replace("scripts/assurance/pr-scope.mjs", "docs/unrelated.md"); }).ok, false));
test("scope amendment second amendment fails", () => assert.equal(scopeAmendmentFixture(({ amendmentComments, amendmentRaw }) => { amendmentComments.push({ ...amendmentRaw, id: 5274913578 }); }).ok, false));
test("scope amendment budget reduction below actual scope fails", () => assert.equal(scopeAmendmentFixture(({ amendmentRaw }) => { amendmentRaw.body = amendmentRaw.body.replace('"maximumHandAuthoredNetLines":7000', '"maximumHandAuthoredNetLines":1'); }).ok, false));
test("scope amendment product build provider path fails", () => assert.equal(scopeAmendmentFixture(({ amendmentRaw }) => { amendmentRaw.body = amendmentRaw.body.replace("scripts/assurance/pr-scope.mjs", "app/provider-build.ts"); }).ok, false));

const verificationCorrectionFixture = (mutate = () => {}, overrides = {}) => {
  const fixture = actualBootstrapFixture();
  const inputs = structuredClone(fixture.verificationCorrectionInputs);
  mutate(inputs);
  return withFakeExecutables({ git: fixture.fakeGit }, () => verifyDoctrineVerificationDependencyCorrection({ ...inputs, ...overrides }));
};
test("verification correction exact immutable dependency passes", () => assert.equal(verificationCorrectionFixture().ok, true));
test("verification correction edited comment fails", () => assert.equal(verificationCorrectionFixture(({ correctionRaw }) => { correctionRaw.body += "edited"; }).ok, false));
test("verification correction deleted comment fails", () => assert.equal(verificationCorrectionFixture((inputs) => { inputs.correctionRaw = null; }).ok, false));
test("verification correction second correction fails", () => assert.equal(verificationCorrectionFixture(({ allComments, correctionRaw }) => { allComments.push({ ...correctionRaw, id: 5275618261 }); }).ok, false));
test("verification correction wrong failed run fails", () => assert.equal(verificationCorrectionFixture(({ failedRunRaw }) => { failedRunRaw.id = 1; }).ok, false));
test("verification correction wrong PR fails", () => assert.equal(verificationCorrectionFixture(() => {}, { currentPr: 225 }).ok, false));
test("verification correction wrong bound head fails", () => assert.equal(verificationCorrectionFixture(({ correctionRaw }) => { correctionRaw.body = correctionRaw.body.replace("cc509f67d27581438523e4aeb43bd497ff779368", "0".repeat(40)); }).ok, false));
test("verification correction wrong bound tree fails", () => assert.equal(verificationCorrectionFixture(({ correctionRaw }) => { correctionRaw.body = correctionRaw.body.replace("ad9421dee033502e77f6dbb6bcbedf68d1734fa6", "0".repeat(40)); }).ok, false));
test("verification correction budget expansion fails", () => assert.equal(verificationCorrectionFixture(({ correctionRaw }) => { correctionRaw.body = correctionRaw.body.replace('"maximumHandAuthoredNetLines":7000', '"maximumHandAuthoredNetLines":7001'); }).ok, false));
for (const [label, replacement] of [
  ["wildcard", "tests/assurance/**"],
  ["unrelated test", "tests/assurance/unrelated.test.mjs"],
  ["test absent at protected base", "tests/assurance/new-only.test.mjs"],
  ["product", "app/verification.test.tsx"],
  ["native product", "modules/native/verification.test.ts"],
  ["migration", "supabase/migrations/20260813_test.sql"],
  ["database", "supabase/tests/verification.test.sql"],
  ["provider", "workers/provider-verification.test.mjs"],
  ["build release", "config/release/verification.test.mjs"],
  ["package lock", "package-lock.json"],
]) test(`verification correction ${label} path fails`, () => assert.equal(verificationCorrectionFixture(({ correctionRaw }) => { correctionRaw.body = correctionRaw.body.replace("tests/assurance/codex-security-reliability-s0.test.mjs", replacement); }).ok, false));
test("verification correction disconnected test fails", () => assert.equal(verificationCorrectionFixture(({ correctionRaw }) => { correctionRaw.body = correctionRaw.body.replace("scripts/assurance/pr-scope.mjs", "scripts/assurance/unrelated.mjs"); }).ok, false));

const withVerificationClosureFiles = (files, callback) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-verification-closure-"));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const absolute = path.join(fixtureRoot, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content);
    }
    return callback(fixtureRoot);
  } finally { fs.rmSync(fixtureRoot, { recursive: true, force: true }); }
};
test("verification dependency closure includes the exact current direct verifiers", () => {
  const closure = deriveVerificationDependencyClosure();
  assert.deepEqual(closure.includedPaths, ["tests/assurance/codex-security-reliability-s0.test.mjs", "tests/assurance/current-truth-sync.test.mjs", "tests/assurance/engineering-doctrine.test.mjs", "tests/assurance/pr-scope-feature-bundles.test.mjs"]);
  assert.equal(verifyVerificationDependencyClosure(closure).ok, true);
});
test("verification dependency closure excludes an unrelated test and generic-word reference", () => withVerificationClosureFiles({
  "tests/unrelated.test.mjs": "test('scope is fine',()=>{});\n",
  "tests/generic.test.mjs": "test('generic workflow scope',()=>{});\n",
}, (fixtureRoot) => assert.deepEqual(deriveVerificationDependencyClosure({ root: fixtureRoot, changedSourcePaths: ["scripts/assurance/source.mjs"], changedSubjects: [], candidatePaths: ["tests/unrelated.test.mjs", "tests/generic.test.mjs"] }).includedPaths, [])));
test("verification dependency closure includes a direct exact verifier", () => withVerificationClosureFiles({
  "tests/direct.test.mjs": "const source = 'scripts/assurance/source.mjs'; test(source,()=>{});\n",
}, (fixtureRoot) => assert.deepEqual(deriveVerificationDependencyClosure({ root: fixtureRoot, changedSourcePaths: ["scripts/assurance/source.mjs"], changedSubjects: [], candidatePaths: ["tests/direct.test.mjs"] }).includedPaths, ["tests/direct.test.mjs"])));
test("verification dependency closure includes an exact workflow assertion", () => withVerificationClosureFiles({
  "tests/workflow.test.mjs": "assert.equal(workflow.includes('node scripts/verify.mjs --github-event'), true);\n",
}, (fixtureRoot) => assert.deepEqual(deriveVerificationDependencyClosure({ root: fixtureRoot, changedSourcePaths: ["scripts/verify.mjs"], changedSubjects: [{ kind: "WORKFLOW_STEP_COMMAND", sourcePath: ".github/workflows/phase1-ci.yml", value: "node scripts/verify.mjs --github-event" }], candidatePaths: ["tests/workflow.test.mjs"] }).includedPaths, ["tests/workflow.test.mjs"])));
test("verification dependency closure includes an exact package-script assertion", () => withVerificationClosureFiles({
  "tests/package.test.mjs": "assert.equal(script, 'npm run assurance:verify');\n",
}, (fixtureRoot) => assert.deepEqual(deriveVerificationDependencyClosure({ root: fixtureRoot, changedSourcePaths: ["package.json"], changedSubjects: [{ kind: "EXACT_PACKAGE_SCRIPT", sourcePath: "package.json", value: "npm run assurance:verify" }], candidatePaths: ["tests/package.test.mjs"] }).includedPaths, ["tests/package.test.mjs"])));
test("verification dependency closure rejects wildcard reservation", () => { const closure = deriveVerificationDependencyClosure(); closure.dependencies.push({ path: "tests/**", sourceHash: "0".repeat(64), relationships: [{ type: "EXACT_REFERENCED_SOURCE_PATH", sourcePath: "scripts/assurance/pr-scope.mjs", exactSubject: "scripts/assurance/pr-scope.mjs" }] }); closure.includedPaths.push("tests/**"); const body = { ...closure }; delete body.closureHash; closure.closureHash = hashValue(body); assert.equal(verifyVerificationDependencyClosure(closure).ok, false); });
test("verification dependency closure is deterministic 3/3", () => assert.equal(new Set(Array.from({ length: 3 }, () => deriveVerificationDependencyClosure().closureHash)).size, 1));
test("verification dependency closure cannot expand product authority", () => { const closure = deriveVerificationDependencyClosure(); closure.productAuthorityExpanded = true; const body = { ...closure }; delete body.closureHash; closure.closureHash = hashValue(body); assert.equal(verifyVerificationDependencyClosure(closure).ok, false); });

const withTransientAsset = (relative, content, callback) => {
  const absolute = path.join(new URL(root).pathname, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
  try { return callback(); } finally { fs.rmSync(absolute, { force: true }); const parent = path.dirname(absolute); if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent); buildInventory(undefined, { refreshInventory: true }); }
};
for (const [name, relative, content, code] of [
  ["P1-5 orphan route fails", "app/__assurance_orphan_fixture__.tsx", "export default function Fixture(){return null}\n", "AFFECTED_SCOPE_ORPHAN_ROUTES"],
  ["P1-5 orphan Edge Function fails", "supabase/functions/__assurance_orphan_fixture__/index.ts", "Deno.serve(()=>new Response('blocked'))\n", "AFFECTED_SCOPE_ORPHAN_EDGEFUNCTIONS"],
  ["P1-5 orphan native path fails", "plugins/__assurance_orphan_fixture__.js", "module.exports=(config)=>config\n", "AFFECTED_SCOPE_ORPHAN_NATIVEPATHS"],
]) test(name, () => withTransientAsset(relative, content, () => { const inventory = buildInventory(undefined, { refreshInventory: true }); assert.ok(verifyInventoryNonVacuity(inventory, { affectedDomains: ["assurance-efficiency-e0"], plannedFiles: [relative] }).findings.includes(code)); }));
test("P1-5 wildcard mapping fails", () => { const registry = json("config/assurance/feature-registry-v1.json"); registry.features[0].sourcePathGlobs = ["app/**"]; assert.deepEqual(inventoryMappingFindings(registry), ["INVENTORY_WILDCARD_MAPPING_REJECTED"]); });
test("P1-5 zero-discovery vacuity fails", () => { const inventory = buildInventory(); const routes = inventory.groups.find(({ id }) => id === "routes"); routes.count = 0; routes.accounting.discovered = []; assert.ok(verifyInventoryNonVacuity(inventory).findings.includes("INVENTORY_ZERO_DISCOVERY_ROUTES")); });
test("P1-5 UNKNOWN_OWNER inside closure blocks", () => { const inventory = buildInventory(); const member = inventory.groups.find(({ id }) => id === "routes").members[0]; member.ownerDomains = ["assurance-efficiency-e0"]; member.ownershipStatus = "UNKNOWN_OWNER"; assert.ok(verifyInventoryNonVacuity(inventory, { affectedDomains: ["assurance-efficiency-e0"] }).findings.includes("AFFECTED_SCOPE_ORPHAN_ROUTES")); });
test("P1-5 unrelated UNKNOWN_OWNER remains tracked without global freeze", () => { const inventory = buildInventory(); assert.equal(verifyInventoryNonVacuity(inventory, { affectedDomains: ["assurance-efficiency-e0", "autonomous-cognitive-governance", "codex-security-scan-reliability-s0"] }).ok, true); assert.ok(inventory.ownershipGaps.orphanRoutes > 0); });
test("P1-5 config-only Edge Function remains an exact gap", () => { const target = new URL("config.toml", new URL("supabase/", root)); const original = fs.readFileSync(target, "utf8"); try { fs.writeFileSync(target, `${original}\n[functions.__assurance_config_only__]\nverify_jwt = true\n`); const inventory = buildInventory(undefined, { refreshInventory: true }); assert.ok(inventory.groups.find(({ id }) => id === "edgeFunctions").metadata.configuredWithoutDirectory.includes("__assurance_config_only__")); } finally { fs.writeFileSync(target, original); buildInventory(undefined, { refreshInventory: true }); } });
test("P1-5 entry-only Edge Function remains an exact gap", () => withTransientAsset("supabase/functions/__assurance_entry_only__/index.ts", "Deno.serve(()=>new Response('blocked'))\n", () => { const inventory = buildInventory(undefined, { refreshInventory: true }); assert.ok(inventory.groups.find(({ id }) => id === "edgeFunctions").metadata.directoryWithoutConfiguration.includes("__assurance_entry_only__")); }));
test("P1-5 unregistered Expo plugin remains orphaned", () => { const target = new URL("app.json", root); const original = fs.readFileSync(target, "utf8"); try { const config = JSON.parse(original); config.expo.plugins = [...(config.expo.plugins ?? []), "expo-unregistered-assurance-fixture"]; fs.writeFileSync(target, `${JSON.stringify(config)}\n`); const inventory = buildInventory(undefined, { refreshInventory: true }); assert.ok(inventory.groups.find(({ id }) => id === "nativePaths").accounting.orphan.includes("expo-plugin:expo-unregistered-assurance-fixture")); } finally { fs.writeFileSync(target, original); buildInventory(undefined, { refreshInventory: true }); } });
test("P1-5 native package import remains orphaned", () => withTransientAsset("app/__assurance_native_import__.tsx", "import NativeThing from 'react-native-unregistered-fixture'; export default NativeThing;\n", () => { const inventory = buildInventory(undefined, { refreshInventory: true }); assert.ok(inventory.groups.find(({ id }) => id === "nativePaths").accounting.orphan.some((id) => id.includes("react-native-unregistered-fixture"))); }));
test("P1-5 local native module remains orphaned", () => withTransientAsset("modules/__assurance_local_native__/index.ts", "export const nativeFixture = true;\n", () => { const inventory = buildInventory(undefined, { refreshInventory: true }); assert.ok(inventory.groups.find(({ id }) => id === "pluginsAndLocalNativeModules").accounting.orphan.includes("modules/__assurance_local_native__")); }));
test("P1-5 removing one exact mapping fails", () => { const inventory = buildInventory(); const group = inventory.groups.find(({ accounting }) => accounting.mapped.length); group.accounting.mapped.pop(); assert.equal(verifyInventoryNonVacuity(inventory).ok, false); });
test("P1-5 duplicate owner fails", () => { const inventory = buildInventory(); const group = inventory.groups.find(({ id }) => id === "routes"); const member = group.members[0]; member.ownerDomains = ["assurance-efficiency-e0", "autonomous-cognitive-governance"]; member.ownershipStatus = "LEGACY_UNMODELED"; assert.equal(verifyInventoryNonVacuity(inventory, { affectedDomains: ["assurance-efficiency-e0"] }).ok, false); });
test("P1-5 marking UNKNOWN_OWNER resolved without mapping fails", () => { const inventory = buildInventory(); const group = inventory.groups.find(({ accounting }) => accounting.orphan.length); const member = group.members.find(({ ownershipStatus }) => ownershipStatus === "ORPHAN"); member.ownershipStatus = "REGISTERED_DOMAIN_OWNER"; assert.equal(verifyInventoryNonVacuity(inventory).ok, false); });

const realComment = (overrides = {}) => ({ id: 424242, node_id: "IC_kwDO_SANITIZED", user: { login: "Chillywood2025" }, author_association: "OWNER", body: "immutable owner comment", created_at: "2026-08-12T12:00:00Z", updated_at: "2026-08-12T12:00:00Z", issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/301", html_url: "https://github.com/Chillywood2025/chillywood-mobile/pull/301#issuecomment-424242", ...overrides });
test("P1-6 real API issue URL passes", () => assert.equal(normalizeGitHubCommentIdentity(realComment(), { pr: 301, commentId: 424242 })?.pr, 301));
test("P1-6 real HTML PR comment URL passes", () => assert.equal(normalizeGitHubCommentIdentity(realComment(), { pr: 301, commentId: 424242 })?.id, 424242));
test("P1-6 wrong repository fails", () => assert.equal(normalizeGitHubCommentIdentity(realComment({ issue_url: "https://api.github.com/repos/Evil/chillywood-mobile/issues/301" }), { pr: 301, commentId: 424242 }), null));
test("P1-6 wrong PR fails", () => assert.equal(normalizeGitHubCommentIdentity(realComment(), { pr: 302, commentId: 424242 }), null));
test("P1-6 edited comment fails", () => assert.equal(normalizeGitHubCommentIdentity(realComment({ updated_at: "2026-08-12T12:00:01Z" }), { pr: 301, commentId: 424242 }), null));
test("P1-6 wrong comment ID fails", () => assert.equal(normalizeGitHubCommentIdentity(realComment(), { pr: 301, commentId: 1 }), null));
test("P1-6 URL encoding and substitution fail", () => { assert.equal(normalizeGitHubCommentIdentity(realComment({ issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/%33%30%31" }), { pr: 301, commentId: 424242 }), null); assert.equal(normalizeGitHubCommentIdentity(realComment({ html_url: "https://github.com/Chillywood2025/chillywood-mobile/pull/301?x=#issuecomment-424242" }), { pr: 301, commentId: 424242 }), null); });

test("P1-7 local novelty JSON remains unverified", () => assert.equal(classifyLaterFinding("GENUINELY_NOVEL_DIMENSION", {}, { local: true }).classification, "NOVELTY_CANDIDATE_UNVERIFIED"));
test("P1-7 fictional external drift remains unverified", () => assert.equal(classifyLaterFinding("EXTERNAL_CONTRACT_DRIFT", {}, exactFindingEvidence().drift).classification, "EXTERNAL_CONTRACT_DRIFT_CANDIDATE_UNVERIFIED"));
test("P1-7 file URL fails", () => assert.equal(observeOfficialPublicContract({ contractId: "supabase", url: "file:///tmp/x", priorContractHash: "a", currentContractFact: "b" }), null));
test("P1-7 localhost fails", () => assert.equal(observeOfficialPublicContract({ contractId: "supabase", url: "https://localhost/x", priorContractHash: "a", currentContractFact: "b" }), null));
test("P1-7 data URL fails", () => assert.equal(observeOfficialPublicContract({ contractId: "supabase", url: "data:text/plain,provider", priorContractHash: "a", currentContractFact: "b" }), null));
test("P1-7 unapproved domain fails", () => assert.equal(observeOfficialPublicContract({ contractId: "supabase", url: "https://example.com/x", priorContractHash: "a", currentContractFact: "b" }), null));
test("P1-7 missing prior contract fails", () => assert.equal(observeOfficialPublicContract({ contractId: "supabase", url: "https://example.com/x", currentContractFact: "b" }), null));
test("P1-7 missing current contract fails", () => assert.equal(observeOfficialPublicContract({ contractId: "supabase", url: "https://example.com/x", priorContractHash: "a" }), null));
test("P1-7 curl to approved-looking domain cannot clear", () => { const contract = canonicalContext.contracts.contracts.find(({ id }) => id === "supabase"); const receipt = observeOfficialPublicContract({ contractId: "supabase", url: contract.source, priorContractHash: hashValue(contract), currentContractFact: "repository curl claim" }); assert.equal(receipt.evidenceClass, "OFFICIAL_PUBLIC_CONTRACT_CANDIDATE_UNVERIFIED"); assert.equal(classifyLaterFinding("EXTERNAL_CONTRACT_DRIFT", {}, { authoritativeReceipt: receipt }).classification, "EXTERNAL_CONTRACT_DRIFT_CANDIDATE_UNVERIFIED"); });
test("P1-7 redirected local server cannot clear", () => { const contract = canonicalContext.contracts.contracts.find(({ id }) => id === "supabase"); const curl = "#!/bin/sh\nprintf 'CHILLYWOOD_FINAL_URL:http://127.0.0.1/provider'\n"; const receipt = withFakeExecutables({ curl }, () => observeOfficialPublicContract({ contractId: "supabase", url: contract.source, priorContractHash: hashValue(contract), currentContractFact: "redirected fixture" })); assert.equal(receipt.authorityAllowed, false); });
test("P1-7 repository fixture pretending to be provider cannot clear", () => { const contract = canonicalContext.contracts.contracts.find(({ id }) => id === "supabase"); const receipt = observeOfficialPublicContract({ contractId: "supabase", url: contract.source, priorContractHash: hashValue(contract), currentContractFact: "fixture" }); assert.equal(verifyExternalTrustRootReceipt(receipt), false); });
test("P1-7 repository script pretending to be physical harness cannot clear", () => { const relative = "tests/assurance/__runtime_grounding_fixture__.sh"; const absolute = path.join(new URL(root).pathname, relative); fs.writeFileSync(absolute, "#!/bin/sh\nprintf physical\n"); try { const receipt = observeGroundedRuntimeEvidence({ evidenceClass: "PHYSICAL_RUNTIME", subject: { domain: "chilly-chat-call-lifecycle" }, command: relative }); assert.equal(receipt.evidenceClass, "PHYSICAL_RUNTIME_CANDIDATE_UNVERIFIED"); assert.equal(verifyExternalTrustRootReceipt(receipt), false); } finally { fs.rmSync(absolute, { force: true }); } });
test("P1-7 self-generated signature cannot clear", () => assert.equal(verifyExternalTrustRootReceipt({ trustRootId: "self", evidenceClass: "SIGNED_ARTIFACT", candidateProducer: "self", trustedIssuer: "self", independentVerifier: "self", signature: "self", signedPayload: "self" }), false));
test("P1-7 same-PR workflow cannot clear its own external evidence", () => assert.equal(verifyExternalTrustRootReceipt({ trustRootId: "pr-226-workflow", evidenceClass: "OFFICIAL_PUBLIC_CONTRACT", introducedByPr: 226 }), false));
test("P1-7 task timestamp cannot create freshness", () => { const contract = canonicalContext.contracts.contracts.find(({ id }) => id === "supabase"); const receipt = observeOfficialPublicContract({ contractId: "supabase", url: contract.source, priorContractHash: hashValue(contract), currentContractFact: "2026-08-12T00:00:00Z" }); assert.equal(receipt.observedAt, "SOURCE_DETERMINISTIC_NO_FRESHNESS_AUTHORITY"); });
test("P1-7 external candidate cannot reopen unrelated domains", () => { const result = classifyLaterFinding("GENUINELY_NOVEL_DIMENSION", {}, { authoritativeReceipt: { evidenceClass: "PHYSICAL_RUNTIME_CANDIDATE_UNVERIFIED" } }); assert.equal(result.action, "NO_DOMAIN_REOPEN"); });
test("P1-7 Owner scope change is not novelty", () => assert.equal(classifyLaterFinding("OWNER_SCOPE_CHANGE").classification, "OWNER_SCOPE_CHANGE"));

let isolatedReplay;
const replayFixture = () => isolatedReplay ??= runAuthoritativeReplay({ runs: 2 });
test("authoritative replay two fresh processes produce identical output", () => { const replay = replayFixture(); assert.equal(replay.deterministic, true); assert.equal(replay.runs, "2/2"); assert.equal(replay.resultEquality, "2/2"); assert.deepEqual(replay.differences, []); });
test("authoritative replay 2 does not read replay 1 result", () => assert.equal(replayFixture().replayTwoReadsReplayOne, false));
test("authoritative source mutation between runs changes output hash", () => { const before = replayFixture().outputHash; withTransientAsset("app/__assurance_replay_source_mutation__.tsx", "export default function Mutation(){return null}\n", () => { const changed = runAuthoritativeReplay({ runs: 1 }); assert.notEqual(changed.outputHash, before); }); });
test("authoritative clearing interactive caches cannot change output", () => { buildInventory(undefined, { refreshInventory: true }); generateDomainGraph(undefined, { refreshInventory: true }); const fresh = runAuthoritativeReplay({ runs: 1 }); assert.equal(fresh.outputHash, replayFixture().outputHash); });
test("authoritative reversed filesystem enumeration cannot change output", () => assert.equal(replayFixture().resultEquality, "2/2"));
test("authoritative locale change cannot change output", () => assert.equal(replayFixture().output.execution.localeIndependentComparator, "RAW_UTF8_BYTE_ORDER"));
test("authoritative working-directory change cannot change output", () => assert.equal(replayFixture().processIsolated, true));
test("authoritative temporary-directory path cannot enter output", () => assert.doesNotMatch(stableJson(replayFixture().output), /(?:\/tmp\/|\/private\/var\/)/u));
test("authoritative timestamp cannot enter output", () => assert.doesNotMatch(stableJson(replayFixture().output), /20\d\d-\d\d-\d\dT\d\d:/u));
test("authoritative one missing receipt changes completeness", () => { const output = structuredClone(replayFixture().output); output.laneResults[0].receipts.pop(); assert.equal(verifyAuthoritativeOutput(output).ok, false); });
test("authoritative one duplicate receipt fails", () => { const output = structuredClone(replayFixture().output); output.laneResults[0].receipts.push(structuredClone(output.laneResults[0].receipts[0])); assert.equal(verifyAuthoritativeOutput(output).ok, false); });
test("authoritative one stale source hash fails", () => { const output = structuredClone(replayFixture().output); output.laneResults[0].receipts[0].generatorSourceHash = "0".repeat(64); assert.equal(verifyAuthoritativeOutput(output).ok, false); });
test("authoritative contradictory outputs expose exact deterministic diff", () => { const left = replayFixture().output; const right = structuredClone(left); right.externalEvidenceStatus = "CONTRADICTION"; const comparison = compareReplayOutputs(left, right); assert.equal(comparison.equal, false); assert.equal(comparison.difference.pointer, "/externalEvidenceStatus"); });
test("authoritative cache-hit marker fails", () => { const output = structuredClone(replayFixture().output); output.execution.cacheHit = true; assert.equal(verifyAuthoritativeOutput(output).ok, false); });

const taskLocalEdgeIdentity = () => {
  const cwd = new URL(".", root);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  const tree = execFileSync("git", ["rev-parse", `${head}^{tree}`], { cwd, encoding: "utf8" }).trim();
  return { head, tree };
};
const TASK_LOCAL_EDGE_ID = "edge-10-notifications-fcm-to-chilly-chat-call-lifecycle";
const taskLocalNotificationSubjects = [
  { sourcePath: "supabase/functions/notification-operator/index.ts", selector: "systemId: \"notification_delivery_operator\"," },
  { sourcePath: "supabase/functions/chilly-chat-call-dispatch/index.ts", selector: "Deno.serve(async (req): Promise<Response> => {" },
];
const taskLocalEdgeEvidence = ({ disposition = "NON_IMPACTING_WITH_EVIDENCE", sourceSubjects = taskLocalNotificationSubjects, modelDeltas = [], extraDispositions = [] } = {}) => {
  const identity = taskLocalEdgeIdentity();
  const record = createTaskLocalEdgeDisposition({
    edgeId: TASK_LOCAL_EDGE_ID,
    disposition,
    relationshipType: "EDGE_FUNCTION_INVOCATION_OR_OWNERSHIP",
    dataControlTransferred: "account-bound notification delivery authority",
    authorityDirection: "SOURCE_TO_DESTINATION",
    mutableState: ["device token ownership"],
    lifecycleImplications: ["retry", "cleanup", "revocation"],
    sourceSubjects,
    ...(disposition === "VERIFIED_GOVERNING_INCLUDED" ? {} : { negativeWitness: taskLocalNotificationSubjects[0], exactContract: "call dispatch cannot retain a detached notification installation owner" }),
  }, { identity, root: new URL(".", root).pathname });
  return { taskId: "generic-notification-edge-fixture", primaryDomain: "notifications-fcm", sourceIdentity: identity, dispositions: [record, ...extraDispositions], modelDeltas };
};
const directTaskLocalVerify = (evidence) => independentlyVerifyTaskLocalGoverningEdgeClosure({
  contract: "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1",
  repository: "Chillywood2025/chillywood-mobile",
  baselineGraphHash: json("config/assurance/whole-app-domain-graph-v1.json").contentHash,
  ...evidence,
}, { root: new URL(".", root).pathname });
const rehashTaskLocalRecord = (record) => { const body = { ...record }; delete body.recordHash; return { ...body, recordHash: hashValue(body) }; };
const taskLocalValidResult = () => directTaskLocalVerify(taskLocalEdgeEvidence());

test("task-local edge 01 declaration-only baseline edges do not become verified automatically", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions = []; const result = directTaskLocalVerify(evidence); assert.ok(result.findings.includes(`TASK_LOCAL_EDGE_UNRESOLVED:${TASK_LOCAL_EDGE_ID}`)); });
test("task-local edge 02 unrelated declaration-only edges do not freeze a grounded task", () => { const result = taskLocalValidResult(); assert.equal(result.classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR"); assert.deepEqual(result.candidateEdges, [TASK_LOCAL_EDGE_ID]); });
test("task-local edge 03 baseline verified assurance edges remain exact", () => assert.equal(json("config/assurance/whole-app-domain-graph-v1.json").verifiedGoverningEdges.length, 4));
test("task-local edge 04 exact import relationship is observed", () => { const evidence = taskLocalEdgeEvidence({ sourceSubjects: [{ sourcePath: "supabase/functions/notification-operator/index.ts", selector: "import { runNotificationAutonomyProbe } from \"./probe.ts\";" }, taskLocalNotificationSubjects[1]] }); evidence.dispositions[0].relationshipType = "EXACT_IMPORT_OR_CALL"; evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.equal(directTaskLocalVerify(evidence).observations[0].independentlyDerivedRelationshipTypes.includes("EXACT_IMPORT_OR_CALL"), true); });
test("task-local edge 05 exact function-call relationship is observed", () => assert.ok(taskLocalValidResult().observations[0].independentlyDerivedRelationshipTypes.includes("EXACT_SYMBOL_OR_SELECTOR")));
test("task-local edge 06 exact RPC relationship is observed", () => { const evidence = taskLocalEdgeEvidence({ sourceSubjects: [taskLocalNotificationSubjects[0], { sourcePath: "supabase/functions/chilly-chat-call-dispatch/index.ts", selector: "adminClient.rpc(\"is_account_access_restricted\"" }] }); evidence.dispositions[0].relationshipType = "RPC_INVOCATION"; evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.ok(directTaskLocalVerify(evidence).observations[0].independentlyDerivedRelationshipTypes.includes("RPC_INVOCATION")); });
test("task-local edge 07 exact shared-table relationship is observed", () => { const evidence = taskLocalEdgeEvidence(); const relation = evidence.dispositions[0]; relation.sourceBindings.push(createTaskLocalEdgeDisposition({ edgeId: TASK_LOCAL_EDGE_ID, disposition: "VERIFIED_GOVERNING_INCLUDED", relationshipType: "SHARED_TABLE_POLICY_TRIGGER", dataControlTransferred: "table", sourceSubjects: [{ sourcePath: "supabase/migrations/20260624231731_account_purge_deidentification_proof.sql", selector: "update public.\"user_push_tokens\"" }] }, { identity: evidence.sourceIdentity, root: new URL(".", root).pathname }).sourceBindings[0]); relation.relationshipType = "SHARED_TABLE_POLICY_TRIGGER"; evidence.dispositions[0] = rehashTaskLocalRecord(relation); assert.ok(directTaskLocalVerify(evidence).observations[0].independentlyDerivedRelationshipTypes.includes("SHARED_TABLE_POLICY_TRIGGER")); });
test("task-local edge 08 exact retry and cleanup relationship is observed", () => { const evidence = taskLocalEdgeEvidence({ sourceSubjects: [taskLocalNotificationSubjects[0], { sourcePath: "supabase/functions/chilly-chat-call-transition-retry/index.ts", selector: "Deno.serve(async (req): Promise<Response> => {" }] }); evidence.dispositions[0].relationshipType = "RETRY_CLEANUP_ROLLBACK"; evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.ok(directTaskLocalVerify(evidence).observations[0].independentlyDerivedRelationshipTypes.includes("RETRY_CLEANUP_ROLLBACK")); });
test("task-local edge 09 stale source hash fails", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions[0].sourceBindings[0].normalizedSourceHash = "0".repeat(64); evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 10 zero-match selector fails", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions[0].sourceBindings[0].selector = "selector-that-is-not-present"; evidence.dispositions[0].sourceBindings[0].selectorMatchCount = 1; evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 11 multi-match selector fails", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions[0].sourceBindings[0].selector = "import"; evidence.dispositions[0].sourceBindings[0].selectorMatchCount = 1; evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 12 comment-only relationship fails", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions[0].sourceBindings[0].selector = "Notification delivery operator Edge Function entry point."; evidence.dispositions[0].sourceBindings[0].selectorMatchCount = 1; evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 13 verified governing inclusion is independently classified", () => { const evidence = taskLocalEdgeEvidence({ disposition: "VERIFIED_GOVERNING_INCLUDED" }); const result = directTaskLocalVerify(evidence); assert.ok(result.accounting.verifiedGoverningSet.includes(TASK_LOCAL_EDGE_ID)); });
test("task-local edge 14 verified non-governing evidence passes", () => { const result = directTaskLocalVerify(taskLocalEdgeEvidence({ disposition: "VERIFIED_NON_GOVERNING_WITH_EVIDENCE" })); assert.equal(result.classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR"); });
test("task-local edge 15 exact non-impacting receipt passes", () => assert.equal(taskLocalValidResult().classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR"));
test("task-local edge 16 unresolved declaration blocks", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions = []; assert.ok(directTaskLocalVerify(evidence).findings.some((finding) => finding.startsWith("TASK_LOCAL_EDGE_UNRESOLVED:"))); });
test("task-local edge 17 missing disposition blocks", () => { const evidence = taskLocalEdgeEvidence(); delete evidence.dispositions[0].disposition; evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 18 duplicate disposition blocks", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions.push(structuredClone(evidence.dispositions[0])); assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 19 fictional edge blocks", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions[0].edgeId = "fictional-edge"; evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 20 one receipt cannot cover multiple edges", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions[0].edgeIds = [TASK_LOCAL_EDGE_ID, "another-edge"]; evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 21 prose-only exclusion blocks", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions[0].sourceBindings = []; evidence.dispositions[0] = rehashTaskLocalRecord(evidence.dispositions[0]); assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 22 observed undeclared edge blocks without a delta", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions.push({ ...structuredClone(evidence.dispositions[0]), edgeId: "task-local-unmodeled" }); assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 23 exact task-local graph delta passes", () => {
  const identity = taskLocalEdgeIdentity();
  const deltaSubjects = [taskLocalNotificationSubjects[0], { sourcePath: "supabase/functions/ios-voip-push-tokens/index.ts", selector: "Deno.serve(async (req): Promise<Response> => {" }];
  const delta = createTaskLocalDomainGraphDelta({ edgeId: "task-local-notifications-to-voip-token-fixture", sourceDomain: "notifications-fcm", destinationDomain: "pushkit-callkit", sourceSubjects: deltaSubjects, authorityDirection: "BIDIRECTIONAL", impactClasses: ["TOKEN_OWNERSHIP"], rollback: "detach token", cleanup: "delete stale owner", observability: "hashed installation ID", reasonBaselineOmitted: "baseline declaration predates current token source", affectedTask: "generic-notification-edge-fixture" }, identity, new URL(".", root).pathname);
  const deltaDisposition = createTaskLocalEdgeDisposition({ edgeId: delta.edgeId, sourceDomain: delta.sourceDomain, destinationDomain: delta.destinationDomain, disposition: "NON_IMPACTING_WITH_EVIDENCE", relationshipType: "EDGE_FUNCTION_INVOCATION_OR_OWNERSHIP", dataControlTransferred: "token ownership", sourceSubjects: deltaSubjects, negativeWitness: deltaSubjects[0], exactContract: "ordinary notification ownership cannot grant VoIP call ownership" }, { identity, root: new URL(".", root).pathname });
  const result = directTaskLocalVerify(taskLocalEdgeEvidence({ modelDeltas: [delta], extraDispositions: [deltaDisposition] }));
  assert.equal(result.classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR");
});
test("task-local edge 24 unrelated task cannot consume another task delta", () => { const evidence = taskLocalEdgeEvidence(); const identity = evidence.sourceIdentity; const delta = createTaskLocalDomainGraphDelta({ edgeId: "task-local-wrong-task", sourceDomain: "notifications-fcm", destinationDomain: "pushkit-callkit", sourceSubjects: taskLocalNotificationSubjects, authorityDirection: "BIDIRECTIONAL", impactClasses: ["TOKEN"], rollback: "rollback", cleanup: "cleanup", observability: "audit", reasonBaselineOmitted: "fixture", affectedTask: "another-task" }, identity, new URL(".", root).pathname); evidence.modelDeltas = [delta]; assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 25 task-local delta requires no architecture PR", () => assert.equal(createTaskLocalDomainGraphDelta({ edgeId: "task-local-generic", sourceDomain: "notifications-fcm", destinationDomain: "pushkit-callkit", sourceSubjects: taskLocalNotificationSubjects, authorityDirection: "BIDIRECTIONAL", impactClasses: ["TOKEN"], rollback: "rollback", cleanup: "cleanup", observability: "audit", reasonBaselineOmitted: "fixture", affectedTask: "generic-notification-edge-fixture" }, taskLocalEdgeIdentity(), new URL(".", root).pathname).classification, "TASK_LOCAL_DOMAIN_GRAPH_DELTA_V1"));
test("task-local edge 26 fixed-point traversal includes every governing domain", () => { const result = directTaskLocalVerify(taskLocalEdgeEvidence({ disposition: "VERIFIED_GOVERNING_INCLUDED" })); assert.ok(result.domains.includes("chilly-chat-call-lifecycle")); });
test("task-local edge 27 boundary exclusion does not expand closure", () => assert.deepEqual(taskLocalValidResult().domains, ["notifications-fcm"]));
test("task-local edge 28 verified non-governing edge does not expand closure", () => assert.deepEqual(directTaskLocalVerify(taskLocalEdgeEvidence({ disposition: "VERIFIED_NON_GOVERNING_WITH_EVIDENCE" })).domains, ["notifications-fcm"]));
test("task-local edge 29 unresolved touching edge blocks", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions = []; assert.equal(directTaskLocalVerify(evidence).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"); });
test("task-local edge 30 outside reachable edge does not block unrelated work", () => assert.equal(taskLocalValidResult().candidateEdges.includes("edge-19-storekit-google-play-billing-to-revenuecat-premium"), false));
test("task-local edge 31 exact set accounting passes", () => { const accounting = taskLocalValidResult().accounting; assert.equal(accounting.declaredCandidateSet.length, accounting.verifiedGoverningSet.length + accounting.verifiedNonGoverningSet.length + accounting.boundaryExclusionSet.length + accounting.unresolvedSet.length); });
test("task-local edge 32 copied expected set cannot replace actual set", () => { const evidence = taskLocalEdgeEvidence(); evidence.expectedCandidateEdges = ["copied"]; assert.notDeepEqual(directTaskLocalVerify(evidence).candidateEdges, evidence.expectedCandidateEdges); });
test("task-local edge 33 result is deterministic two of two", () => { const result = verifyTaskLocalGoverningEdgeClosure(taskLocalEdgeEvidence(), { root: new URL(".", root).pathname, runs: 2 }); assert.equal(result.verificationRuns, "2/2"); assert.equal(result.deterministic, true); });
test("task-local edge 34 auth tasks can ground closure without product mutation", () => assert.equal(json("config/assurance/current-truth-v1.json").taskLocalGoverningEdgeClosureCapability.productMutationBeforeAdmission, false));
test("task-local edge 35 global verified count cannot cap current candidates", () => { const graph = json("config/assurance/whole-app-domain-graph-v1.json"); assert.ok(graph.edges.length > graph.verifiedGoverningEdges.length); assert.equal(taskLocalValidResult().classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR"); });
test("task-local edge 36 unresolved edges are reported by exact ID", () => { const evidence = taskLocalEdgeEvidence(); evidence.dispositions = []; assert.ok(directTaskLocalVerify(evidence).findings.includes(`TASK_LOCAL_EDGE_UNRESOLVED:${TASK_LOCAL_EDGE_ID}`)); });
test("task-local edge 37 a second product domain uses the same contract", () => assert.equal(taskLocalValidResult().contract, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1"));
test("task-local edge 38 implementation contains no Wave 1 edge ID", () => { const source = fs.readFileSync(new URL("scripts/assurance/engineering-closure.mjs", root), "utf8") + fs.readFileSync(new URL("scripts/assurance/engineering-evidence-verifier.mjs", root), "utf8"); assert.doesNotMatch(source, /WAPR-P1|WAPR-CM-P1/u); });
test("task-local edge 39 admission blocks a blocked closure", () => assert.equal(directTaskLocalVerify({ ...taskLocalEdgeEvidence(), dispositions: [] }).classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED"));
test("task-local edge 40 admission can consume a clear closure", () => assert.equal(taskLocalValidResult().classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR"));
test("task-local edge 41 product mutation remains false before admission", () => assert.equal(json("config/assurance/current-truth-v1.json").preAdmissionEngineeringSeedCapability.productMutationAllowed, false));
test("task-local edge 42 exact admission may grant later mutation", () => assert.equal(json("config/assurance/current-truth-v1.json").taskLocalGoverningEdgeClosureCapability.admissionRequiresClearClosure, true));
test("task-local edge 43 source descendants retain the finite lease", () => assert.equal(json("config/assurance/current-truth-v1.json").finiteTaskAdmissionClearanceCapability.sourceDescendantsRetainLease, true));
test("task-local edge 44 current truth generation stays deterministic", () => { const truth = json("config/assurance/current-truth-v1.json"); assert.equal(renderCurrentState(truth), renderCurrentState(structuredClone(truth))); assert.equal(renderNextTask(truth), renderNextTask(structuredClone(truth))); });
test("task-local edge 45 all thirteen Phase 1 checks remain required", () => { const workflow = fs.readFileSync(new URL(".github/workflows/phase1-ci.yml", root), "utf8"); assert.match(workflow, /13\/13|Phase 1/u); });
test("task-local edge 46 provider Codex Review remains optional advisory", () => assert.match(stableJson(json("config/assurance/current-truth-v1.json")), /OPTIONAL_ADVISORY/u));
const taskLocalArchitectureComment = ({ id, pr, body }) => ({ id, node_id: `IC_task_local_${id}`, user: { login: "Chillywood2025" }, author_association: "OWNER", body, created_at: "2026-08-14T01:00:00Z", updated_at: "2026-08-14T01:00:00Z", issue_url: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${pr}`, html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${pr}#issuecomment-${id}` });
test("task-local architecture maintenance authority accepts the exact reusable profile", () => {
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 230, branch: "codex/task-local-edge-fixture", headSha: "a".repeat(40), baseSha: "b".repeat(40) };
  const tree = "c".repeat(40);
  const scope = { files: ["scripts/assurance/engineering-closure.mjs"], additions: 10, deletions: 1, netChangedLines: 9 };
  const subject = architectureMaintenanceSubject({ identity, tree, scope, profile: "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1" });
  const raw = taskLocalArchitectureComment({ id: 700001, pr: identity.pr, body: architectureMaintenanceOwnerCommentBody(subject) });
  const result = verifyArchitectureMaintenanceAuthority({ raw, allComments: [raw], paginationComplete: true, identity, tree, scope, ancestryVerified: true });
  assert.equal(result.ok, true);
});
test("Owner jurisdiction architecture maintenance uses the one bounded assurance-only route", () => {
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 234, branch: "codex/owner-jurisdiction-canonical-model-v1", headSha: "d".repeat(40), baseSha: "e".repeat(40) };
  const tree = "f".repeat(40);
  const scope = { files: ["scripts/assurance/engineering-closure.mjs", "scripts/assurance/jurisdiction-policy.mjs", "tests/assurance/jurisdiction-policy.test.mjs"], additions: 1200, deletions: 20, netChangedLines: 1180 };
  const subject = architectureMaintenanceSubject({ identity, tree, scope, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2" });
  const raw = taskLocalArchitectureComment({ id: 700010, pr: identity.pr, body: architectureMaintenanceOwnerCommentBody(subject) });
  const result = verifyArchitectureMaintenanceAuthority({ raw, allComments: [raw], paginationComplete: true, identity, tree, scope, ancestryVerified: true });
  assert.equal(result.ok, true);
  assert.equal(result.mergeEligible, false);
  assert.deepEqual(subject.capabilities, ["OWNER_JURISDICTION_CANONICAL_MODEL_V2", "FINITE_TASK_ADMISSION_CHAIN_V2"]);
  assert.deepEqual(Object.values(subject.authority), [false, false, false, false, false, false, false, false, false, false]);
});

test("immutable-evidence lifecycle convergence has one exact closed assurance-only profile", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-immutable-evidence-profile-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd });
    execFileSync("git", ["config", "user.email", "assurance@example.invalid"], { cwd });
    execFileSync("git", ["config", "user.name", "Assurance Fixture"], { cwd });
    execFileSync("git", ["commit", "--allow-empty", "-qm", "base"], { cwd });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
    const baseTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd, encoding: "utf8" }).trim();
    const record = structuredClone(json("config/assurance/current-truth-v1.json"));
    record.mainSha = baseSha;
    record.protectedMainAuthority.checkpointSha = baseSha;
    record.protectedMainAuthority.checkpointTree = baseTree;
    fs.mkdirSync(path.join(cwd, "config/assurance"), { recursive: true });
    fs.writeFileSync(path.join(cwd, "config/assurance/current-truth-v1.json"), `${JSON.stringify(record, null, 2)}\n`);
    fs.writeFileSync(path.join(cwd, "CURRENT_STATE.md"), renderCurrentState(record));
    fs.writeFileSync(path.join(cwd, "NEXT_TASK.md"), renderNextTask(record));
    execFileSync("git", ["add", "CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"], { cwd });
    execFileSync("git", ["commit", "-qm", "companion"], { cwd });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd, encoding: "utf8" }).trim();
    const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 243, branch: "codex/immutable-evidence-lifecycle-convergence-v1", headSha, baseSha };
    const scope = { files: [...IMMUTABLE_EVIDENCE_LIFECYCLE_CONVERGENCE_ARCHITECTURE_PATHS], additions: 1600, deletions: 200, netChangedLines: 1400, diffHash: "4".repeat(64) };
    const subject = architectureMaintenanceSubject({ identity, tree, scope, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2", objective: IMMUTABLE_EVIDENCE_LIFECYCLE_CONVERGENCE_V1, root: cwd });
    const raw = taskLocalArchitectureComment({ id: 700015, pr: identity.pr, body: architectureMaintenanceOwnerCommentBody(subject) });
    const result = verifyArchitectureMaintenanceAuthority({ raw, allComments: [raw], paginationComplete: true, identity, tree, scope, ancestryVerified: true, root: cwd });
    assert.equal(result.authorizationOk, true, stableJson(result.findings));
    assert.equal(result.mergeEligible, false);
    assert.equal(subject.objective, IMMUTABLE_EVIDENCE_LIFECYCLE_CONVERGENCE_V1);
    assert.deepEqual(subject.changedPaths, IMMUTABLE_EVIDENCE_LIFECYCLE_CONVERGENCE_ARCHITECTURE_PATHS);
    assert.deepEqual(subject.capabilities, ["OWNER_JURISDICTION_CANONICAL_MODEL_V2", IMMUTABLE_EVIDENCE_LIFECYCLE_CONVERGENCE_V1]);
    assert.deepEqual(subject.budget, { maximumFiles: 8, maximumNetLines: 2000 });
    assert.equal(subject.reusableByAnotherPr, false);
    assert.ok(Object.values(subject.authority).every((value) => value === false));
    const review = architectureRepositoryReviewSubject({ identity, tree, scope, profile: IMMUTABLE_EVIDENCE_LIFECYCLE_CONVERGENCE_V1 });
    assert.equal(review.reviewProfile, IMMUTABLE_EVIDENCE_LIFECYCLE_CONVERGENCE_V1);
    assert.ok(review.lanes.some((lane) => lane.includes("immutable") || lane.includes("current")));
    assert.throws(() => architectureMaintenanceSubject({ identity, tree, scope: { ...scope, files: [...scope.files, "package.json"].sort() }, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2", objective: IMMUTABLE_EVIDENCE_LIFECYCLE_CONVERGENCE_V1, root: cwd }), /OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE/u);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
const amendmentControlLifecycleFixture = ({ reviewProfile = FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1, objective = FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1, branch = "codex/finite-task-lease-amendment-control-plane-repair-v1" } = {}) => {
  const paths = [
    "CURRENT_STATE.md",
    "config/assurance/current-truth-contract-v1.json",
    "config/assurance/current-truth-v1.json",
    "scripts/assurance/active-task.mjs",
    "scripts/assurance/current-truth.mjs",
    "scripts/assurance/engineering-closure.mjs",
    "scripts/assurance/lib.mjs",
    "tests/assurance/active-task-binding-a1.test.mjs",
    "tests/assurance/current-truth-sync.test.mjs",
    "tests/assurance/engineering-doctrine.test.mjs",
    "tests/assurance/pr-scope-feature-bundles.test.mjs",
    ...(objective === FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1 ? [
      "config/assurance/pr-scope-policy-v1.json",
      "scripts/assurance/pr-scope-lib.mjs",
      "scripts/assurance/pr-scope.mjs",
    ] : []),
  ].sort();
  const originalIdentity = { repository: "Chillywood2025/chillywood-mobile", pr: 236, branch, headSha: "1".repeat(40), baseSha: "2".repeat(40) };
  const originalTree = "3".repeat(40);
  const originalScope = { files: paths, additions: 900, deletions: 100, netChangedLines: 800, diffHash: "4".repeat(64) };
  const originalSubject = architectureMaintenanceSubject({ identity: originalIdentity, tree: originalTree, scope: originalScope, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2", objective });
  const original = taskLocalArchitectureComment({ id: 700020, pr: originalIdentity.pr, body: architectureMaintenanceOwnerCommentBody(originalSubject) });
  const identity = { ...originalIdentity, headSha: "5".repeat(40) };
  const tree = "6".repeat(40);
  const scope = { ...originalScope, additions: 1000, deletions: 120, netChangedLines: 880, diffHash: "7".repeat(64) };
  const reviewSubject = architectureRepositoryReviewSubject({ identity, tree, scope, profile: reviewProfile });
  const review = taskLocalArchitectureComment({ id: 700021, pr: identity.pr, body: architectureRepositoryReviewCommentBody(reviewSubject) });
  const run = { id: 900020, run_attempt: 1, name: "Phase 1 CI", event: "pull_request", status: "completed", conclusion: "success", head_sha: identity.headSha, head_branch: identity.branch, pull_requests: [{ number: identity.pr, head: { sha: identity.headSha }, base: { sha: identity.baseSha } }] };
  const jobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({ id: index + 1, name, status: "completed", conclusion: "success", head_sha: identity.headSha }));
  const phase1 = verifyPhase1RunEvidence({ run, jobs, identity, tree });
  const finalSubject = architectureFinalSourceSubject({ identity, tree, scope, originalRaw: original, repositoryReviewRaw: review, phase1Evidence: phase1 });
  const final = taskLocalArchitectureComment({ id: 700022, pr: identity.pr, body: architectureFinalSourceOwnerCommentBody(finalSubject) });
  const args = { raw: original, allComments: [original, review, final], paginationComplete: true, identity, tree, scope, ancestryVerified: true, phase1EvidenceResolver: () => phase1 };
  return { paths, originalIdentity, originalTree, originalScope, originalSubject, original, identity, tree, scope, reviewSubject, review, phase1, finalSubject, final, args };
};

test("finite-task lease amendment repair reuses the canonical Owner jurisdiction profile without changing historical defaults", () => {
  const repair = amendmentControlLifecycleFixture();
  const historical = architectureMaintenanceSubject({ identity: repair.originalIdentity, tree: repair.originalTree, scope: repair.originalScope, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2" });
  assert.equal(repair.originalSubject.objective, FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1);
  assert.deepEqual(repair.originalSubject.capabilities, ["OWNER_JURISDICTION_CANONICAL_MODEL_V2", FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1]);
  assert.equal(historical.objective, "install versioned standing Owner jurisdiction policy with exact task bindings and append-only admission supersession");
  assert.deepEqual(historical.capabilities, ["OWNER_JURISDICTION_CANONICAL_MODEL_V2", "FINITE_TASK_ADMISSION_CHAIN_V2"]);
  assert.equal(repair.originalSubject.budget.maximumFiles, 15);
  assert.equal(repair.originalSubject.budget.maximumNetLines, 3500);
  assert.equal(repair.originalSubject.reusableByAnotherPr, false);
  assert.equal(historical.reusableByAnotherPr, true);
  assert.ok(Object.values(repair.originalSubject.authority).every((value) => value === false));
});

test("finite-task lease amendment repair exact-head review covers RC-1 through RC-5, effective scope, and closed authority", () => {
  const { reviewSubject } = amendmentControlLifecycleFixture();
  assert.equal(reviewSubject.reviewProfile, FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1);
  for (const rootCause of ["RC-1", "RC-2", "RC-3", "RC-4", "RC-5"]) assert.ok(reviewSubject.lanes.some((lane) => lane.includes(rootCause)));
  assert.ok(reviewSubject.lanes.some((lane) => lane.includes("effective path and line ceilings")));
  assert.ok(reviewSubject.lanes.some((lane) => lane.includes("prohibited provider")));
  assert.ok(Object.values(reviewSubject.authority).every((value) => value === false));
});

test("finite-task implementation exact-head review binds the effective reservation and rejects synthetic amendment authority", () => {
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 229, branch: "codex/pre-release-identity-entitlement-authority-v1", headSha: "8".repeat(40), baseSha: "9".repeat(40) };
  const tree = "a".repeat(40);
  const scope = { files: ["_lib/accessEntitlements.ts", "_lib/roomRules.ts"], additions: 20, deletions: 2, netChangedLines: 18, diffHash: "b".repeat(64) };
  const syntheticResolution = {
    ok: true,
    status: "AMENDED",
    baseLeaseHash: "c".repeat(64),
    baseLease: { leaseId: "pre-release-identity-entitlement-authority-v1", domain: "pre-release-wave1-identity-entitlement-authority" },
    baseReservation: { allowedPaths: ["_lib/session.tsx"], reservationHash: "d".repeat(64), eligiblePathCount: 30, maximumFiles: 30, maximumLines: 3600 },
    effectiveReservation: { allowedPaths: ["_lib/accessEntitlements.ts", "_lib/roomRules.ts", "_lib/session.tsx"], reservationHash: "e".repeat(64), eligiblePathCount: 32, maximumFiles: 32, maximumLines: 4500 },
    amendmentsConsumed: 1,
    amendmentReceipt: { commentId: 700040, subjectHash: "f".repeat(64), bodyHash: "1".repeat(64), rawBodyHash: "2".repeat(64) },
    authority: { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false, amendmentEffective: true, liveReceipt: true },
  };
  const subject = architectureRepositoryReviewSubject({ identity, tree, scope, profile: FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1, effectiveReservationResolution: syntheticResolution });
  const raw = taskLocalArchitectureComment({ id: 700041, pr: identity.pr, body: architectureRepositoryReviewCommentBody(subject) });
  const result = verifyArchitectureRepositoryReview({ raw, identity, tree, scope, profile: FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1, effectiveReservationResolution: syntheticResolution });
  assert.equal(subject.reviewProfile, FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1);
  assert.equal(subject.finiteTaskEffectiveReservation.authorityValid, false);
  assert.equal(subject.finiteTaskEffectiveReservation.baseLeaseHash, syntheticResolution.baseLeaseHash);
  assert.equal(subject.finiteTaskEffectiveReservation.effectiveReservation.maximumFiles, 32);
  assert.deepEqual(subject.finiteTaskEffectiveReservation.amendmentReceipt, syntheticResolution.amendmentReceipt);
  assert.ok(subject.lanes.some((lane) => lane.includes("UNKNOWN remains fail-closed")));
  assert.ok(subject.lanes.some((lane) => lane.includes("account-generation isolation")));
  assert.ok(subject.lanes.some((lane) => lane.includes("Premium entitlement and money authority")));
  assert.ok(subject.lanes.some((lane) => lane.includes("exact effective lease reservation")));
  assert.ok(Object.values(subject.authority).every((value) => value === false));
  assert.equal(result.valid, false);
});

test("finite-task terminal truth projection preserves the base lease but synthetic transition authority fails closed", () => {
  const priorTruth = json("config/assurance/current-truth-v1.json");
  const lease = finiteTaskLeaseFor(priorTruth.finiteTaskLeases, { implementationPr: 229, implementationBranch: "codex/pre-release-identity-entitlement-authority-v1", featureId: "auth-session-password-recovery" });
  const baseReservation = finiteTaskReservationProjection(lease);
  const effectivePaths = [...lease.allowedPaths, "_lib/accessEntitlements.ts", "_lib/roomRules.ts"].sort();
  const effectiveReservationBase = { allowedPaths: effectivePaths, pathGlobs: effectivePaths, maximumFiles: 32, maximumLines: 4500, eligiblePathCount: 32 };
  const effectiveReservation = { ...effectiveReservationBase, reservationHash: hashValue(effectiveReservationBase) };
  const sourceHead = "5".repeat(40);
  const sourceTree = "6".repeat(40);
  const mergeSha = "7".repeat(40);
  const terminalBase = {
    schemaVersion: 1,
    classification: "FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1",
    repository: "Chillywood2025/chillywood-mobile",
    taskId: lease.leaseId,
    leaseId: lease.leaseId,
    implementationPr: lease.implementationPr,
    implementationBranch: lease.implementationBranch,
    baseLeaseHash: hashValue(lease),
    baseReservation,
    effectiveReservation,
    amendmentReceipt: { commentId: 710001, createdAt: "2026-08-14T22:00:00Z", subjectHash: "1".repeat(64), bodyHash: "2".repeat(64), rawBodyHash: "3".repeat(64), boundStartingHead: "4".repeat(40), boundStartingTree: "8".repeat(40), addedPaths: ["_lib/accessEntitlements.ts", "_lib/roomRules.ts"], domain: lease.domain, authorityClassification: "LIVE_IMMUTABLE_OWNER_RECEIPT" },
    finalSourceReceipt: { commentId: 710002, createdAt: "2026-08-14T23:00:00Z", subjectHash: "4".repeat(64), bodyHash: "5".repeat(64), rawBodyHash: "6".repeat(64), finalHead: sourceHead, finalTree: sourceTree, effectiveReservationHash: effectiveReservation.reservationHash, amendmentCommentId: 710001 },
    sourceHead,
    sourceTree,
    mergeSha,
    mergeTree: sourceTree,
    mergeParents: ["8".repeat(40), sourceHead],
    nextTask: priorTruth.engineeringDoctrine.nextPermittedAction,
    authority: { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false },
  };
  const terminalEvidence = { ...terminalBase, evidenceHash: hashValue(terminalBase) };
  const transition = { applicable: true, ok: true, terminalEvidence, lifecycle: { finalSourceSubject: { featureId: lease.featureId } }, findings: [] };
  const feature = json("config/assurance/feature-registry-v1.json").features.find(({ featureId }) => featureId === lease.featureId);
  const truthRecord = projectFiniteTaskTerminalTruth({ record: priorTruth, terminalEvidence, proofTierApplicabilityHash: hashValue(feature.proofTierApplicability), implementationTitle: "Wave 1" });
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 999, branch: "codex/finite-task-terminal-truth-v1", baseSha: mergeSha, headSha: "9".repeat(40) };
  const tree = "a".repeat(40);
  const scope = { files: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"], additions: 40, deletions: 10, netChangedLines: 30, diffHash: "b".repeat(64) };
  const priorTruthHash = hashValue(stableJson(priorTruth));
  const ownerSubject = finiteTaskTerminalTruthSubject({ identity, tree, scope, terminalTransition: transition, priorTruthHash });
  const owner = taskLocalArchitectureComment({ id: 710010, pr: identity.pr, body: finiteTaskTerminalTruthOwnerCommentBody(ownerSubject) });
  const reviewSubject = architectureRepositoryReviewSubject({ identity, tree, scope, profile: FINITE_TASK_TERMINAL_TRUTH_V1 });
  const review = taskLocalArchitectureComment({ id: 710011, pr: identity.pr, body: architectureRepositoryReviewCommentBody(reviewSubject) });
  const run = { id: 910010, run_attempt: 1, name: "Phase 1 CI", event: "pull_request", status: "completed", conclusion: "success", head_sha: identity.headSha, head_branch: identity.branch, pull_requests: [{ number: identity.pr, head: { sha: identity.headSha }, base: { sha: identity.baseSha } }] };
  const jobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({ id: index + 1, name, status: "completed", conclusion: "success", head_sha: identity.headSha }));
  const phase1 = verifyPhase1RunEvidence({ run, jobs, identity, tree });
  const finalSubject = finiteTaskTerminalTruthFinalSourceSubject({ identity, tree, scope, ownerRaw: owner, repositoryReviewRaw: review, phase1Evidence: phase1, terminalTransition: transition });
  const final = taskLocalArchitectureComment({ id: 710012, pr: identity.pr, body: finiteTaskTerminalTruthFinalSourceOwnerCommentBody(finalSubject) });
  const common = { raw: owner, allComments: [owner, review, final], paginationComplete: true, identity, tree, scope, terminalTransition: transition, priorTruthHash, priorTruth, truthRecord, currentStateText: renderCurrentState(truthRecord), nextTaskText: renderNextTask(truthRecord), currentMain: mergeSha, openTerminalSuccessorCount: 1, transitionPreviouslyConsumed: false, ancestryVerified: true, phase1EvidenceResolver: () => phase1 };
  const verified = verifyFiniteTaskTerminalTruthAuthority(common);
  assert.equal(verified.checks.review, true);
  assert.equal(verified.checks.phase1, true);
  assert.equal(verified.checks.finalSource, true);
  const invalidateEnvelopeBodyHash = (body) => body.replace(/("bodyHash":")[0-9a-f]{64}"/u, `$1${"0".repeat(64)}"`);
  const malformedCurrentReview = taskLocalArchitectureComment({ id: 710013, pr: identity.pr, body: invalidateEnvelopeBodyHash(review.body) });
  const malformedCurrentFinal = taskLocalArchitectureComment({ id: 710014, pr: identity.pr, body: invalidateEnvelopeBodyHash(final.body) });
  assert.equal(verifyFiniteTaskTerminalTruthAuthority({ ...common, allComments: [owner, malformedCurrentReview, review, malformedCurrentFinal, final] }).checks.finalSource, true);
  const duplicateReview = taskLocalArchitectureComment({ id: 710015, pr: identity.pr, body: review.body });
  assert.equal(verifyFiniteTaskTerminalTruthAuthority({ ...common, allComments: [owner, review, duplicateReview, final] }).checks.review, false);
  const duplicateFinal = taskLocalArchitectureComment({ id: 710016, pr: identity.pr, body: final.body });
  assert.equal(verifyFiniteTaskTerminalTruthAuthority({ ...common, allComments: [owner, review, final, duplicateFinal] }).checks.finalSource, false);

  const staleIdentity = { ...identity, headSha: "c".repeat(40) };
  const staleTree = "d".repeat(40);
  const staleReviewSubject = architectureRepositoryReviewSubject({ identity: staleIdentity, tree: staleTree, scope, profile: FINITE_TASK_TERMINAL_TRUTH_V1 });
  const staleReview = taskLocalArchitectureComment({ id: 710007, pr: identity.pr, body: architectureRepositoryReviewCommentBody(staleReviewSubject) });
  const staleRun = { ...run, id: 910007, head_sha: staleIdentity.headSha, pull_requests: [{ number: staleIdentity.pr, head: { sha: staleIdentity.headSha }, base: { sha: staleIdentity.baseSha } }] };
  const staleJobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({ id: index + 100, name, status: "completed", conclusion: "success", head_sha: staleIdentity.headSha }));
  const stalePhase1 = verifyPhase1RunEvidence({ run: staleRun, jobs: staleJobs, identity: staleIdentity, tree: staleTree });
  const staleFinalSubject = finiteTaskTerminalTruthFinalSourceSubject({ identity: staleIdentity, tree: staleTree, scope, ownerRaw: owner, repositoryReviewRaw: staleReview, phase1Evidence: stalePhase1, terminalTransition: transition });
  const staleFinal = taskLocalArchitectureComment({ id: 710008, pr: identity.pr, body: finiteTaskTerminalTruthFinalSourceOwnerCommentBody(staleFinalSubject) });
  const olderStaleFinal = taskLocalArchitectureComment({ id: 710006, pr: identity.pr, body: staleFinal.body });
  const retainedHistory = [staleFinal, malformedCurrentFinal, staleReview, owner, olderStaleFinal, review, final];
  const retained = verifyFiniteTaskTerminalTruthAuthority({ ...common, allComments: retainedHistory, phase1EvidenceResolver: ({ runId }) => runId === stalePhase1.runId ? stalePhase1 : phase1 });
  assert.equal(retained.checks.review, true);
  assert.equal(retained.checks.finalSource, true);
  assert.equal(verifyFiniteTaskTerminalTruthAuthority({ ...common, allComments: [...retainedHistory].reverse(), phase1EvidenceResolver: ({ runId }) => runId === stalePhase1.runId ? stalePhase1 : phase1 }).checks.finalSource, true);
  assert.equal(verifyFiniteTaskTerminalTruthAuthority({ ...common, paginationComplete: false }).checks.ownerCardinality, false);
  assert.equal(verified.authorizationOk, false);
  assert.ok(verified.findings.includes("FINITE_TASK_TERMINAL_TRUTH_INVALID:transition"));
  assert.equal(verified.checks.terminalFeatureIdentity, true);
  assert.equal(verified.featureId, lease.featureId);
  assert.equal(verified.primaryFeatureId, lease.featureId);
  assert.equal(verified.finiteLeaseId, lease.leaseId);
  assert.notEqual(verified.featureId, verified.finiteLeaseId);
  const ignoredCallerFeature = verifyFiniteTaskTerminalTruthAuthority({ ...common, featureId: "notifications-fcm" });
  assert.equal(ignoredCallerFeature.featureId, lease.featureId);
  const substitutedTaskTransition = structuredClone(transition);
  substitutedTaskTransition.terminalEvidence.taskId = "notifications-fcm";
  assert.equal(verifyFiniteTaskTerminalTruthAuthority({ ...common, terminalTransition: substitutedTaskTransition }).checks.terminalFeatureIdentity, false);
  for (const [label, featureId] of [["unknown", "unknown-finite-task-feature"], ["wrong registered", "notifications-fcm"], ["missing", null]]) {
    const mutatedPrior = structuredClone(priorTruth);
    const mutatedTruth = structuredClone(truthRecord);
    const mutateFeature = (record) => {
      const mutatedLease = record.finiteTaskLeases.tasks.find(({ leaseId }) => leaseId === lease.leaseId);
      if (featureId === null) delete mutatedLease.featureId;
      else mutatedLease.featureId = featureId;
      if (featureId === null) delete record.activeTaskBinding.featureId;
      else record.activeTaskBinding.featureId = featureId;
    };
    mutateFeature(mutatedPrior);
    mutateFeature(mutatedTruth);
    const result = verifyFiniteTaskTerminalTruthAuthority({
      ...common,
      priorTruth: mutatedPrior,
      truthRecord: mutatedTruth,
      currentStateText: renderCurrentState(mutatedTruth),
      nextTaskText: renderNextTask(mutatedTruth),
    });
    assert.equal(result.authorizationOk, false, label);
    assert.equal(result.checks.terminalFeatureIdentity, false, label);
  }
  const terminalPull = {
    number: identity.pr,
    title: "Synchronize finite-task terminal truth",
    state: "open",
    html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${identity.pr}`,
    base: { ref: "main", sha: identity.baseSha },
    head: { ref: identity.branch, sha: identity.headSha },
  };
  const terminalContextInput = {
    event: { number: identity.pr, repository: { full_name: identity.repository }, pull_request: terminalPull },
    readback: { number: identity.pr, repository: identity.repository, baseRef: "main", baseSha: identity.baseSha, headRef: identity.branch, headSha: identity.headSha, htmlUrl: terminalPull.html_url, state: "open" },
    policy: json("config/assurance/pr-scope-policy-v1.json"),
    registry: json("config/assurance/feature-registry-v1.json"),
    currentTruth: truthRecord,
    terminalTruthAuthority: { ...verified, ok: true, authorizationOk: true, findings: [] },
    protectedMainRuntime: { pendingTerminalTruth: true, terminalSuccessorRequired: true, pendingTransitionCount: 1 },
    observedChangedPaths: scope.files,
    observedCanonicalChangedLines: scope.netChangedLines,
  };
  const terminalContext = deriveTaskScopeContext(terminalContextInput);
  assert.equal(terminalContext.ok, true, terminalContext.findings.join(","));
  assert.equal(terminalContext.featureId, lease.featureId);
  assert.equal(terminalContext.finiteLeaseId, lease.leaseId);
  const classifiedTerminalPaths = classifyPrScopePaths(scope.files, terminalContextInput.policy);
  const highRiskDomains = [...new Set(classifiedTerminalPaths.flatMap(({ domains }) => domains)
    .filter((domain) => terminalContextInput.policy.domains.some(({ id, risk }) => id === domain && risk === "high")))].sort();
  const terminalRisk = evaluateHighRiskScope({
    highRiskDomains,
    objectiveDomains: terminalContext.objectiveDomains,
    featureId: terminalContext.featureId,
    featureDomainBundles: terminalContextInput.policy.featureDomainBundles,
    registeredFeatureIds: terminalContextInput.registry.features.map(({ featureId }) => featureId),
    policyHighRiskDomains: terminalContextInput.policy.domains.filter(({ risk }) => risk === "high").map(({ id }) => id),
  });
  assert.equal(terminalRisk.relatedHighRiskScopeAuthorized, true, stableJson(terminalRisk.findings));
  assert.deepEqual(highRiskDomains, []);
  const callerInjection = deriveTaskScopeContext({ ...terminalContextInput, requestedFeature: "notifications-fcm" });
  assert.equal(callerInjection.ok, false);
  assert.ok(callerInjection.findings.includes("ASSURANCE_CALLER_FEATURE_INJECTION_REJECTED"));
  assert.equal(callerInjection.featureId, lease.featureId);
  const diffCannotSubstitute = deriveTaskScopeContext({ ...terminalContextInput, observedChangedPaths: ["notifications-fcm"] });
  assert.equal(diffCannotSubstitute.featureId, lease.featureId);
  assert.equal(verifyFiniteTaskTerminalTruthAuthority({ ...common, terminalTransition: structuredClone(transition) }).authorizationOk, false);
  assert.deepEqual(scope.files, ownerSubject.changedPaths);
  assert.equal(stableJson(finiteTaskLeaseFor(truthRecord.finiteTaskLeases, { implementationPr: 229, implementationBranch: lease.implementationBranch, featureId: lease.featureId })), stableJson(lease));
  const mutatedTruth = structuredClone(truthRecord);
  finiteTaskLeaseFor(mutatedTruth.finiteTaskLeases, { implementationPr: 229, implementationBranch: lease.implementationBranch, featureId: lease.featureId }).taskState = "MERGED_VERIFIED";
  assert.equal(verifyFiniteTaskTerminalTruthAuthority({ ...common, truthRecord: mutatedTruth, currentStateText: renderCurrentState(mutatedTruth), nextTaskText: renderNextTask(mutatedTruth) }).authorizationOk, false);
  const missingLedger = structuredClone(truthRecord); delete missingLedger.finiteTaskLeases.completedLeaseOutcomes;
  assert.equal(verifyFiniteTaskTerminalTruthAuthority({ ...common, truthRecord: missingLedger, currentStateText: renderCurrentState(missingLedger), nextTaskText: renderNextTask(missingLedger) }).checks.terminalProjection, false);
});

test("finite-task lease amendment repair final source requires the repair review profile and Phase 1 13/13", () => {
  const valid = amendmentControlLifecycleFixture();
  const result = verifyArchitectureMaintenanceAuthority(valid.args);
  assert.equal(result.authorizationOk, true, stableJson(result.findings));
  assert.equal(result.mergeEligible, true, stableJson(result.mergeFindings));
  assert.equal(result.currentFinalSourceReceiptId, valid.final.id);
  assert.equal(valid.finalSubject.repositoryReview.profile, FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1);
  assert.equal(valid.finalSubject.phase1.result, "PASS_13_OF_13");

  const wrongReview = amendmentControlLifecycleFixture({ reviewProfile: null });
  assert.equal(verifyArchitectureMaintenanceAuthority(wrongReview.args).mergeEligible, false);
});

test("finite-task test-adaptation overlay uses the exact generic closed-authority control profile", () => {
  const fixture = amendmentControlLifecycleFixture({
    objective: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1,
    reviewProfile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1,
    branch: "codex/finite-task-test-adaptation-overlay-v1"
  });
  const policy = json("config/assurance/current-truth-v1.json").finiteTaskLeases.testAdaptationPolicy;
  const contract = json("config/assurance/current-truth-contract-v1.json").finiteTaskTestAdaptationOverlayPolicy;
  assert.equal(fixture.originalSubject.objective, FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1);
  assert.deepEqual(fixture.originalSubject.capabilities, ["OWNER_JURISDICTION_CANONICAL_MODEL_V2", FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1]);
  assert.equal(fixture.originalSubject.reusableByAnotherPr, false);
  assert.equal(fixture.reviewSubject.reviewProfile, FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1);
  assert.ok(fixture.reviewSubject.lanes.some((lane) => lane.includes("separate implementation and fixture")));
  assert.ok(fixture.reviewSubject.lanes.some((lane) => lane.includes("baseline binding")));
  assert.ok(fixture.reviewSubject.lanes.some((lane) => lane.includes("affected-feature identity")));
  assert.ok(fixture.reviewSubject.lanes.some((lane) => lane.includes("sanitization")));
  assert.equal(policy.maximumFiles, 1);
  assert.equal(policy.maximumChangedLines, 500);
  assert.deepEqual(policy.fixtureRoots, ["supabase/tests/"]);
  assert.deepEqual(policy.fixtureExtensions, [".sql"]);
  assert.equal(policy.liveEffectiveAmendmentReceiptRequired, true);
  assert.equal(policy.ordinaryAmendmentUsePreserved, true);
  assert.equal(contract.implementationPartitionSource, "VERIFIED_LIVE_EFFECTIVE_AMENDMENT_RESERVATION");
  assert.equal(contract.fixtureClass.assertionContract, "EXACTLY_ONE_EXECUTABLE_PGTAP_PLAN_DECLARATION_PRESERVED");
  assert.equal(contract.partitionAccounting.budgetPoolingAllowed, false);
  assert.ok(fixture.paths.every((file) => FINITE_TASK_TEST_ADAPTATION_OVERLAY_ARCHITECTURE_PATHS.includes(file)));
  assert.ok(["config/assurance/pr-scope-policy-v1.json", "scripts/assurance/pr-scope-lib.mjs", "scripts/assurance/pr-scope.mjs"].every((file) => fixture.paths.includes(file)));
  assert.doesNotMatch(stableJson(policy), /revenuecat_atomic_transactions_test|pre-release-identity-entitlement-authority-v1|"implementationPr":229/u);
  assert.ok(Object.values(fixture.originalSubject.authority).every((value) => value === false));
  assert.equal(verifyArchitectureMaintenanceAuthority(fixture.args).mergeEligible, true);
});

test("finite-task test-adaptation PR-scope consumers do not broaden historical or amendment authority", () => {
  const overlay = amendmentControlLifecycleFixture({
    objective: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1,
    reviewProfile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1,
    branch: "codex/finite-task-test-adaptation-overlay-v1"
  });
  const amendment = amendmentControlLifecycleFixture();
  const expandedScope = { ...amendment.originalScope, files: overlay.paths };
  const expandedSubject = architectureMaintenanceSubject({
    identity: amendment.originalIdentity,
    tree: amendment.originalTree,
    scope: expandedScope,
    profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2",
    objective: FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1,
  });
  const expandedRaw = taskLocalArchitectureComment({ id: 700030, pr: amendment.originalIdentity.pr, body: architectureMaintenanceOwnerCommentBody(expandedSubject) });
  const result = verifyArchitectureMaintenanceAuthority({ raw: expandedRaw, allComments: [expandedRaw], paginationComplete: true, identity: amendment.originalIdentity, tree: amendment.originalTree, scope: expandedScope, ancestryVerified: true });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_INVALID:exactPaths"));
});

test("finite-task test-adaptation final source rejects a review without the overlay profile", () => {
  const wrong = amendmentControlLifecycleFixture({
    objective: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1,
    reviewProfile: null,
    branch: "codex/finite-task-test-adaptation-overlay-v1"
  });
  assert.equal(verifyArchitectureMaintenanceAuthority(wrong.args).mergeEligible, false);
  assert.throws(() => architectureMaintenanceSubject({
    identity: wrong.originalIdentity,
    tree: wrong.originalTree,
    scope: wrong.originalScope,
    profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2",
    objective: "FINITE_TASK_UNREGISTERED_OVERLAY"
  }), /OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_OBJECTIVE_INVALID/u);
});

const dependencyAmendmentControlPaths = [
  "CURRENT_STATE.md", "config/assurance/current-truth-contract-v1.json", "config/assurance/current-truth-v1.json", "config/assurance/schemas-v1.json",
  "scripts/assurance/active-task.mjs", "scripts/assurance/current-truth.mjs", "scripts/assurance/engineering-closure.mjs", "scripts/assurance/lib.mjs",
  "tests/assurance/active-task-binding-a1.test.mjs", "tests/assurance/current-truth-sync.test.mjs", "tests/assurance/engineering-doctrine.test.mjs", "tests/assurance/pr-scope-feature-bundles.test.mjs",
].sort();
const dependencyWitnessPath = "scripts/test-brace-expansion-compat.mjs";
const dependencyWitnessIdentifier = "expectedUnrelatedPackageGraphSha256";
const dependencyWitnessSource = (graph) => `const compatibilityClosurePaths = new Set([\n  "node_modules/brace-expansion",\n]);\nfunction unrelatedPackageGraphSha256(sourceLock = lock) { return sourceLock; }\nconst ${dependencyWitnessIdentifier} = "${graph}";\n`;
const dependencyWitnessGraphSha = (lock) => { const closure = new Set(["node_modules/brace-expansion"]); const entries = Object.entries(lock.packages ?? {}).filter(([entryPath]) => entryPath !== "" && !closure.has(entryPath) && !entryPath.endsWith("/node_modules/brace-expansion")).map(([entryPath, metadata]) => [entryPath, { version: metadata.version ?? null, resolved: metadata.resolved ?? null, integrity: metadata.integrity ?? null, link: metadata.link ?? null }]).sort(([left], [right]) => left.localeCompare(right)); return createHash("sha256").update(JSON.stringify(entries)).digest("hex"); };
const fixtureGit = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const fixtureWrite = (cwd, name, value) => { const target = path.join(cwd, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
const fixtureJson = (cwd, name, value) => fixtureWrite(cwd, name, `${JSON.stringify(value, null, 2)}\n`);
const fixtureJsonSha = (value) => createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
const fixtureCommit = (cwd, message) => { fixtureGit(cwd, "add", "-A"); fixtureGit(cwd, "commit", "-qm", message); return fixtureGit(cwd, "rev-parse", "HEAD"); };
const fixtureTree = (cwd, ref) => fixtureGit(cwd, "rev-parse", `${ref}^{tree}`);
const fixtureScope = (cwd, base, head) => {
  const range = `${base}...${head}`; const files = fixtureGit(cwd, "diff", "--name-only", range).split("\n").filter(Boolean).sort();
  const rows = fixtureGit(cwd, "diff", "--numstat", range).split("\n").filter(Boolean);
  const additions = rows.reduce((sum, row) => sum + Number(row.split("\t")[0]), 0); const deletions = rows.reduce((sum, row) => sum + Number(row.split("\t")[1]), 0);
  const diff = execFileSync("git", canonicalGitDiffArgs(range), { cwd, encoding: "utf8" });
  return { files, additions, deletions, netChangedLines: Math.max(0, additions - deletions), diffHash: canonicalGitDiffHash(diff) };
};
const dependencyAmendmentFixture = ({ candidate = {} } = {}) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dependency-amendment-"));
  fixtureGit(cwd, "init", "-q"); fixtureGit(cwd, "config", "user.name", "Fixture"); fixtureGit(cwd, "config", "user.email", "fixture@example.test");
  const before = { expo: "~54.0.36", "expo-constants": "~18.0.13", "expo-file-system": "~19.0.23", "expo-updates": "~29.0.19", react: "19.1.0", "react-native": "0.81.4" };
  const after = { ...before, expo: "~54.0.37", "expo-constants": "~18.0.14", "expo-file-system": "~19.0.24", "expo-updates": "~29.0.20" };
  const packageRecord = (dependencies) => ({ name: "dependency-amendment-fixture", version: "1.0.0", scripts: { "test:brace-expansion-compat": "node ./scripts/test-brace-expansion-compat.mjs" }, dependencies });
  const lockRecord = (dependencies) => ({ name: "dependency-amendment-fixture", version: "1.0.0", lockfileVersion: 3, packages: { "": { name: "dependency-amendment-fixture", version: "1.0.0", dependencies }, ...Object.fromEntries(Object.entries(dependencies).map(([name, spec]) => [`node_modules/${name}`, { version: spec.startsWith("~") ? spec.slice(1) : spec }])), "node_modules/unrelated-transitive": { version: "1.0.0", integrity: "sha512-stable" } } });
  const baselineLock = lockRecord(before); const witnessBaselineGraph = dependencyWitnessGraphSha(baselineLock);
  fixtureJson(cwd, "package.json", packageRecord(before)); fixtureJson(cwd, "package-lock.json", baselineLock);
  fixtureJson(cwd, "config/assurance/android-native-call-origin-backup-v1.json", { target: { correctedNativeCompatibilityDigest: "a".repeat(64), historicalInstalledNativeBuild: "86" }, preserved: true });
  fixtureWrite(cwd, dependencyWitnessPath, dependencyWitnessSource(candidate.staleWitnessBaseline ? "b".repeat(64) : witnessBaselineGraph));
  fixtureWrite(cwd, ".github/workflows/phase1-ci.yml", "name: Phase 1 CI\njobs:\n  cognitive:\n    name: Phase 1 / Cognitive Execution Safety\n    steps:\n      - name: Test bounded execution and evaluator independence\n        run: npm run test:brace-expansion-compat\n");
  for (const name of dependencyAmendmentControlPaths) fixtureWrite(cwd, name, `base:${name}\n`);
  const base = fixtureCommit(cwd, "base"); fixtureGit(cwd, "switch", "-qc", "control");
  if (candidate.touchRevertWitness) { fixtureWrite(cwd, dependencyWitnessPath, dependencyWitnessSource("c".repeat(64))); fixtureCommit(cwd, "touch witness before receipt"); fixtureWrite(cwd, dependencyWitnessPath, dependencyWitnessSource(witnessBaselineGraph)); fixtureCommit(cwd, "revert witness before receipt"); }
  for (const name of dependencyAmendmentControlPaths) fixtureWrite(cwd, name, `control:${name}\n`);
  const startingHead = fixtureCommit(cwd, "control"); const startingTree = fixtureTree(cwd, startingHead); const startingScope = fixtureScope(cwd, base, startingHead);
  const originalIdentity = { repository: "Chillywood2025/chillywood-mobile", pr: 236, branch: "codex/dependency-amendment-fixture", baseSha: base, headSha: startingHead };
  const originalSubject = architectureMaintenanceSubject({ identity: originalIdentity, tree: startingTree, scope: startingScope, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2", objective: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1, root: cwd });
  const original = taskLocalArchitectureComment({ id: 800001, pr: originalIdentity.pr, body: architectureMaintenanceOwnerCommentBody(originalSubject) });
  const historicalReviewSubject = architectureRepositoryReviewSubject({ identity: originalIdentity, tree: startingTree, scope: startingScope, profile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1 });
  const historicalReview = taskLocalArchitectureComment({ id: 800000, pr: originalIdentity.pr, body: architectureRepositoryReviewCommentBody(historicalReviewSubject) });
  const request = {
    addedPaths: architectureDependencyBaselinePolicyV1.exactAddedPaths,
    dependencies: Object.entries(after).filter(([name, spec]) => before[name] !== spec).map(([name, to]) => ({ name, to })),
    digest: { path: "config/assurance/android-native-call-origin-backup-v1.json", pointer: "/target/correctedNativeCompatibilityDigest" },
    failure: { runId: 32354184174, jobId: 96379705770, check: "Phase 1 / Expo Doctor", passed: 12, required: 13 },
    finalBudget: { maximumFiles: 15, maximumNetLines: 4500 },
    targetEvidence: { manifestSha256: fixtureJsonSha(packageRecord(after)), lockSha256: fixtureJsonSha(lockRecord(after)), nativeCompatibilityDigest: "b".repeat(64) },
  };
  const subject = architectureDependencyAmendmentSubject({ identity: originalIdentity, tree: startingTree, scope: startingScope, originalRaw: original, request, root: cwd });
  const amendment = taskLocalArchitectureComment({ id: 800002, pr: originalIdentity.pr, body: architectureDependencyAmendmentOwnerCommentBody(subject) });
  let effectiveBase = base;
  if (candidate.baseAdvance || candidate.baseDependencyDrift) {
    fixtureGit(cwd, "switch", "-qc", "main-advance", base);
    if (candidate.baseDependencyDrift) fixtureJson(cwd, "package.json", packageRecord({ ...before, expo: "~54.0.35" }));
    else fixtureWrite(cwd, "README.md", "unrelated protected-main advance\n");
    effectiveBase = fixtureCommit(cwd, "protected main advances"); fixtureGit(cwd, "switch", "-q", "control"); fixtureGit(cwd, "merge", "-q", "--no-edit", effectiveBase);
  }
  const finalDependencies = { ...after };
  if (candidate.majorMinor) finalDependencies.expo = "~55.0.0";
  if (candidate.newDirect) finalDependencies["new-direct"] = "~1.0.1";
  if (candidate.react) finalDependencies.react = "19.1.1";
  if (candidate.reactNative) finalDependencies["react-native"] = "0.81.5";
  const finalPackage = packageRecord(finalDependencies); if (candidate.manifestMutation) finalPackage.description = "unauthorized";
  const finalLock = lockRecord(finalDependencies); if (candidate.lockMismatch) finalLock.packages[""].dependencies.expo = before.expo;
  if (candidate.unrelatedLockMutation) finalLock.packages["node_modules/unrelated-transitive"].version = "1.0.1";
  if (candidate.closureLockMutation) finalLock.packages["node_modules/expo"].resolved = "https://attacker.example/expo.tgz";
  fixtureJson(cwd, "package.json", finalPackage); fixtureJson(cwd, "package-lock.json", finalLock);
  const finalDigest = candidate.sameDigest ? "a".repeat(64) : candidate.badDigest ? "not-a-digest" : "b".repeat(64);
  const digestRecord = { target: { correctedNativeCompatibilityDigest: finalDigest, historicalInstalledNativeBuild: "86" }, preserved: true };
  if (candidate.digestOutsidePointer) digestRecord.preserved = false;
  fixtureJson(cwd, "config/assurance/android-native-call-origin-backup-v1.json", digestRecord);
  if (candidate.extraPath) fixtureWrite(cwd, "README.md", "unauthorized\n");
  const head = fixtureCommit(cwd, "dependency descendant"); const tree = fixtureTree(cwd, head); const scope = fixtureScope(cwd, effectiveBase, head);
  const identity = { ...originalIdentity, baseSha: effectiveBase, headSha: head };
  const commitsFor = (tip, from = effectiveBase) => fixtureGit(cwd, "rev-list", "--reverse", `${from}..${tip}`).split("\n").filter(Boolean).map((sha) => ({ sha, commit: { tree: { sha: fixtureTree(cwd, sha) } } }));
  const common = { raw: amendment, originalRaw: original, allComments: [original, historicalReview, amendment], paginationComplete: true, allCommits: commitsFor(head), commitsPaginationComplete: true, identity, tree, scope, root: cwd };
  const pending = { ...common, allCommits: commitsFor(startingHead, base), identity: originalIdentity, tree: startingTree, scope: startingScope };
  return { cwd, base, startingHead, startingTree, startingScope, witnessBaselineGraph, originalIdentity, originalSubject, original, historicalReview, subject, amendment, identity, tree, scope, common, pending, cleanup: () => fs.rmSync(cwd, { recursive: true, force: true }) };
};

const dependencyWitnessAmendmentFixture = ({ candidate = {} } = {}) => {
  const dependency = dependencyAmendmentFixture({ candidate: { staleWitnessBaseline: candidate.staleBaseline, touchRevertWitness: candidate.touchRevert } });
  const lock = JSON.parse(fs.readFileSync(path.join(dependency.cwd, "package-lock.json"), "utf8")); const targetGraph = dependencyWitnessGraphSha(lock);
  const dependencyAmendmentResolution = verifyArchitectureDependencyAmendment(dependency.common);
  const request = {
    addedPaths: [dependencyWitnessPath],
    failure: { runId: 32374575547, jobId: 96442768691, check: "Phase 1 / Cognitive Execution Safety", step: "Test bounded execution and evaluator independence", passed: 12, required: 13, result: "UNRELATED_PACKAGE_VERSION_CHANGED", head: dependency.identity.headSha, tree: dependency.tree },
    finalBudget: { maximumFiles: 16, maximumNetLines: 4500 },
    witness: {
      path: dependencyWitnessPath,
      identifier: dependencyWitnessIdentifier,
      targetSha256: createHash("sha256").update(dependencyWitnessSource(targetGraph)).digest("hex"),
      targetGraphSha256: targetGraph,
    },
  };
  let subject;
  try { subject = architectureDependencyWitnessAmendmentSubject({ identity: dependency.identity, tree: dependency.tree, scope: dependency.scope, dependencyAmendmentResolution, request, root: dependency.cwd }); }
  catch (error) { dependency.cleanup(); throw error; }
  const amendment = { ...taskLocalArchitectureComment({ id: 800010, pr: dependency.identity.pr, body: architectureDependencyWitnessAmendmentOwnerCommentBody(subject) }), created_at: "2026-08-15T01:00:00Z", updated_at: "2026-08-15T01:00:00Z" };
  fixtureWrite(dependency.cwd, dependencyWitnessPath, dependencyWitnessSource(candidate.wrongTarget ? "f".repeat(64) : targetGraph) + (candidate.nonExactReplacement ? "// unrelated second change\n" : ""));
  if (candidate.packageDrift) { const value = JSON.parse(fs.readFileSync(path.join(dependency.cwd, "package.json"), "utf8")); value.description = "unauthorized"; fixtureJson(dependency.cwd, "package.json", value); }
  if (candidate.packageScriptDrift) { const value = JSON.parse(fs.readFileSync(path.join(dependency.cwd, "package.json"), "utf8")); value.scripts["test:brace-expansion-compat"] = "node ./scripts/other.mjs"; fixtureJson(dependency.cwd, "package.json", value); }
  if (candidate.lockDrift) { const value = JSON.parse(fs.readFileSync(path.join(dependency.cwd, "package-lock.json"), "utf8")); value.packages["node_modules/unrelated-transitive"].version = "2.0.0"; fixtureJson(dependency.cwd, "package-lock.json", value); }
  if (candidate.digestDrift) { const value = JSON.parse(fs.readFileSync(path.join(dependency.cwd, "config/assurance/android-native-call-origin-backup-v1.json"), "utf8")); value.preserved = false; fixtureJson(dependency.cwd, "config/assurance/android-native-call-origin-backup-v1.json", value); }
  if (candidate.workflowDrift) fixtureWrite(dependency.cwd, ".github/workflows/phase1-ci.yml", "name: Phase 1 CI\n");
  if (candidate.extraPath) fixtureWrite(dependency.cwd, "README.md", "unauthorized witness descendant\n");
  const head = fixtureCommit(dependency.cwd, "compatibility witness descendant"); const tree = fixtureTree(dependency.cwd, head);
  const identity = { ...dependency.identity, headSha: head }; const scope = fixtureScope(dependency.cwd, identity.baseSha, head);
  const commitsFor = (tip) => fixtureGit(dependency.cwd, "rev-list", "--reverse", `${identity.baseSha}..${tip}`).split("\n").filter(Boolean).map((sha) => ({ sha, commit: { tree: { sha: fixtureTree(dependency.cwd, sha) } } }));
  const allComments = [dependency.original, dependency.historicalReview, dependency.amendment, amendment];
  const common = { raw: amendment, originalRaw: dependency.original, dependencyAmendmentRaw: dependency.amendment, allComments, paginationComplete: true, allCommits: commitsFor(head), commitsPaginationComplete: true, identity, tree, scope, root: dependency.cwd };
  const pending = { ...common, allCommits: commitsFor(dependency.identity.headSha), identity: dependency.identity, tree: dependency.tree, scope: dependency.scope };
  const integrated = ({ pending: usePending = false } = {}) => { const state = usePending ? pending : common; return { ...state, raw: dependency.amendment }; };
  return { ...common, cwd: dependency.cwd, dependency, request, subject, amendment, targetGraph, common, pending, integrated, cleanup: dependency.cleanup };
};

test("descendant dependency amendment canonical pending and applied receipt carries through review and final source", (t) => {
  const fixture = dependencyAmendmentFixture(); t.after(fixture.cleanup);
  const pending = verifyArchitectureDependencyAmendment(fixture.pending); const applied = verifyArchitectureDependencyAmendment(fixture.common);
  assert.equal(pending.valid, true, stableJson(pending.findings)); assert.equal(pending.state, "AUTHORIZED_PENDING");
  assert.equal(applied.valid, true, stableJson(applied.findings)); assert.equal(applied.state, "APPLIED");
  assert.equal(fixture.subject.capability, ASSURANCE_DESCENDANT_DEPENDENCY_BASELINE_AMENDMENT_V1);
  assert.deepEqual(fixture.subject.originalAuthority, { commentId: fixture.original.id, subjectHash: hashValue(fixture.originalSubject), bodyHash: JSON.parse(fixture.original.body.slice(fixture.original.body.indexOf("\n") + 1)).bodyHash, rawBodyHash: hashValue(fixture.original.body) });
  assert.deepEqual(fixture.subject.startingScope.paths, dependencyAmendmentControlPaths); assert.deepEqual(fixture.subject.finalPaths, fixture.scope.files);
  assert.equal(fixture.amendment.body.startsWith(`${ARCHITECTURE_DEPENDENCY_AMENDMENT_MARKER}\n`), true);
  assert.ok(Object.values(fixture.subject.authority).every((value) => value === false)); assert.equal(applied.finalEvidence.resolvedDependencies.length, 4);
  const reviewSubject = architectureRepositoryReviewSubject({ identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, profile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1, dependencyAmendmentResolution: applied });
  const review = taskLocalArchitectureComment({ id: 800003, pr: fixture.identity.pr, body: architectureRepositoryReviewCommentBody(reviewSubject) });
  assert.equal(verifyArchitectureRepositoryReview({ raw: review, identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, profile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1, dependencyAmendmentResolution: applied }).valid, true);
  const run = { id: 900030, run_attempt: 1, name: "Phase 1 CI", event: "pull_request", status: "completed", conclusion: "success", head_sha: fixture.identity.headSha, head_branch: fixture.identity.branch, pull_requests: [{ number: fixture.identity.pr, head: { sha: fixture.identity.headSha }, base: { sha: fixture.identity.baseSha } }] };
  const jobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({ id: index + 1, name, status: "completed", conclusion: "success", head_sha: fixture.identity.headSha }));
  const phase1 = verifyPhase1RunEvidence({ run, jobs, identity: fixture.identity, tree: fixture.tree });
  const final = architectureFinalSourceSubject({ identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, originalRaw: fixture.original, historicalRepositoryReviewRaws: [fixture.historicalReview], repositoryReviewRaw: review, phase1Evidence: phase1, dependencyAmendmentResolution: applied, root: fixture.cwd });
  assert.equal(final.dependencyAmendment.commentId, fixture.amendment.id); assert.deepEqual(final.dependencyEvidence, applied.finalEvidence); assert.equal(final.repositoryReview.valid, true); assert.equal(final.historicalRepositoryReviews[0].commentId, fixture.historicalReview.id);
  const finalRaw = taskLocalArchitectureComment({ id: 800004, pr: fixture.identity.pr, body: architectureFinalSourceOwnerCommentBody(final) });
  const authority = verifyArchitectureMaintenanceAuthority({ raw: fixture.original, allComments: [fixture.original, fixture.historicalReview, fixture.amendment, review, finalRaw], paginationComplete: true, allCommits: fixture.common.allCommits, commitsPaginationComplete: true, identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, phase1EvidenceResolver: () => phase1, root: fixture.cwd });
  assert.equal(authority.authorizationOk, true, stableJson(authority.findings)); assert.equal(authority.mergeEligible, true, stableJson(authority.mergeFindings)); assert.equal(authority.dependencyAmendment.commentId, fixture.amendment.id);
  const historical = verifyArchitectureMaintenanceAuthority({ raw: fixture.original, allComments: [fixture.original], paginationComplete: true, identity: fixture.originalIdentity, tree: fixture.startingTree, scope: fixture.startingScope, ancestryVerified: true, root: fixture.cwd });
  assert.equal(historical.authorizationOk, true, stableJson(historical.findings)); assert.equal(historical.dependencyAmendmentCommentId ?? null, null);
});

test("descendant dependency amendment permits unrelated protected-base advance and rejects dependency-baseline drift", (t) => {
  const advanced = dependencyAmendmentFixture({ candidate: { baseAdvance: true } }); t.after(advanced.cleanup);
  assert.equal(verifyArchitectureDependencyAmendment(advanced.common).valid, true);
  const drifted = dependencyAmendmentFixture({ candidate: { baseDependencyDrift: true } }); t.after(drifted.cleanup);
  const result = verifyArchitectureDependencyAmendment(drifted.common);
  assert.equal(result.valid, false); assert.equal(result.checks.currentBasePreservesBaseline, false);
});

test("descendant dependency amendment pending receipt cannot produce current review, final source, or merge eligibility", (t) => {
  const fixture = dependencyAmendmentFixture(); t.after(fixture.cleanup);
  const pending = verifyArchitectureDependencyAmendment(fixture.pending);
  assert.equal(pending.valid, true); assert.equal(pending.state, "AUTHORIZED_PENDING");
  const reviewSubject = architectureRepositoryReviewSubject({ identity: fixture.originalIdentity, tree: fixture.startingTree, scope: fixture.startingScope, profile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1, dependencyAmendmentResolution: pending });
  const review = taskLocalArchitectureComment({ id: 800005, pr: fixture.originalIdentity.pr, body: architectureRepositoryReviewCommentBody(reviewSubject) });
  assert.equal(verifyArchitectureRepositoryReview({ raw: review, identity: fixture.originalIdentity, tree: fixture.startingTree, scope: fixture.startingScope, profile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1, dependencyAmendmentResolution: pending }).valid, false);
  const run = { id: 900031, run_attempt: 1, name: "Phase 1 CI", event: "pull_request", status: "completed", conclusion: "success", head_sha: fixture.originalIdentity.headSha, head_branch: fixture.originalIdentity.branch, pull_requests: [{ number: fixture.originalIdentity.pr, head: { sha: fixture.originalIdentity.headSha }, base: { sha: fixture.originalIdentity.baseSha } }] };
  const jobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({ id: index + 1, name, status: "completed", conclusion: "success", head_sha: fixture.originalIdentity.headSha }));
  const phase1 = verifyPhase1RunEvidence({ run, jobs, identity: fixture.originalIdentity, tree: fixture.startingTree });
  const final = architectureFinalSourceSubject({ identity: fixture.originalIdentity, tree: fixture.startingTree, scope: fixture.startingScope, originalRaw: fixture.original, repositoryReviewRaw: review, phase1Evidence: phase1, dependencyAmendmentResolution: pending, root: fixture.cwd });
  const finalRaw = taskLocalArchitectureComment({ id: 800006, pr: fixture.originalIdentity.pr, body: architectureFinalSourceOwnerCommentBody(final) });
  const authority = verifyArchitectureMaintenanceAuthority({ raw: fixture.original, allComments: [fixture.original, fixture.historicalReview, fixture.amendment, review, finalRaw], paginationComplete: true, allCommits: fixture.pending.allCommits, commitsPaginationComplete: true, identity: fixture.originalIdentity, tree: fixture.startingTree, scope: fixture.startingScope, phase1EvidenceResolver: () => phase1, root: fixture.cwd });
  assert.equal(authority.authorizationOk, true, stableJson(authority.findings)); assert.equal(authority.mergeEligible, false); assert.equal(authority.checks.dependencyAmendmentApplied, false);
});

test("descendant dependency amendment rejects receipt, identity, pagination, ancestry, tree, path, and budget attacks", (t) => {
  const fixture = dependencyAmendmentFixture(); t.after(fixture.cleanup); const verify = (overrides = {}) => verifyArchitectureDependencyAmendment({ ...fixture.common, ...overrides });
  const reissue = (mutate) => { const subject = structuredClone(fixture.subject); mutate(subject); return taskLocalArchitectureComment({ id: fixture.amendment.id, pr: fixture.identity.pr, body: architectureDependencyAmendmentOwnerCommentBody(subject) }); };
  const attacks = [
    ["edited body", { raw: { ...fixture.amendment, body: `${fixture.amendment.body} ` } }],
    ["edited timestamp", { raw: { ...fixture.amendment, updated_at: "2026-08-14T01:00:01Z" } }],
    ["wrong Owner", { raw: { ...fixture.amendment, user: { login: "attacker" } } }],
    ["wrong association", { raw: { ...fixture.amendment, author_association: "MEMBER" } }],
    ["duplicate receipt", { allComments: [fixture.original, fixture.amendment, { ...fixture.amendment, id: 800004 }] }],
    ["comment pagination", { paginationComplete: false }], ["commit pagination", { commitsPaginationComplete: false }],
    ["missing head commit", { allCommits: fixture.common.allCommits.slice(0, -1) }], ["duplicate head commit", { allCommits: [...fixture.common.allCommits, fixture.common.allCommits.at(-1)] }],
    ["wrong commit tree", { allCommits: fixture.common.allCommits.map((item, index) => index ? item : { ...item, commit: { tree: { sha: "0".repeat(40) } } }) }],
    ["wrong head", { identity: { ...fixture.identity, headSha: fixture.base }, tree: fixtureTree(fixture.cwd, fixture.base) }], ["wrong tree", { tree: "0".repeat(40) }],
    ["wrong original", { originalRaw: { ...fixture.original, body: `${fixture.original.body} ` } }],
    ["wildcard path", { raw: reissue((subject) => { subject.addedPaths[0] = "*"; }) }], ["extra authorized path", { raw: reissue((subject) => { subject.addedPaths.push("README.md"); }) }],
    ["unlisted final path", { scope: { ...fixture.scope, files: [...fixture.scope.files, "README.md"] } }], ["line 4501", { scope: { ...fixture.scope, netChangedLines: 4501 } }],
  ];
  assert.deepEqual(attacks.filter(([, overrides]) => verify(overrides).valid).map(([name]) => name), []);
});

test("descendant dependency amendment rejects non-patch, direct-set, React, manifest-lock, digest, and extra-path changes", async (t) => {
  for (const candidate of [{ majorMinor: true }, { newDirect: true }, { react: true }, { reactNative: true }, { manifestMutation: true }, { lockMismatch: true }, { unrelatedLockMutation: true }, { closureLockMutation: true }, { sameDigest: true }, { badDigest: true }, { digestOutsidePointer: true }, { extraPath: true }]) await t.test(Object.keys(candidate)[0], (inner) => {
    const fixture = dependencyAmendmentFixture({ candidate }); inner.after(fixture.cleanup);
    assert.equal(verifyArchitectureDependencyAmendment(fixture.common).valid, false);
  });
});

test("dependency compatibility witness amendment is exact, descendant-only, and carried through final source", (t) => {
  const fixture = dependencyWitnessAmendmentFixture(); t.after(fixture.cleanup);
  const pending = verifyArchitectureDependencyWitnessAmendment(fixture.pending);
  const standalone = verifyArchitectureDependencyWitnessAmendment(fixture.common);
  const applied = verifyArchitectureDependencyAmendment(fixture.integrated());
  assert.equal(pending.valid, true, stableJson(pending.findings)); assert.equal(pending.state, "AUTHORIZED_PENDING");
  assert.equal(standalone.valid, true, stableJson(standalone.findings)); assert.equal(standalone.state, "APPLIED");
  assert.equal(applied.valid, true, stableJson(applied.findings)); assert.equal(applied.state, "APPLIED_WITH_WITNESS");
  assert.equal(fixture.subject.capability, ASSURANCE_DESCENDANT_DEPENDENCY_COMPATIBILITY_WITNESS_AMENDMENT_V1);
  assert.equal(fixture.amendment.body.startsWith(`${ARCHITECTURE_DEPENDENCY_WITNESS_AMENDMENT_MARKER}\n`), true);
  assert.deepEqual(fixture.subject.addedPaths, [dependencyWitnessPath]); assert.deepEqual(fixture.subject.finalBudget, { maximumFiles: 16, maximumNetLines: 4500 });
  assert.equal(fixture.subject.dependencyAmendment.commentId, fixture.dependency.amendment.id); assert.equal(fixture.subject.witness.baseline.graphSha256, fixture.dependency.witnessBaselineGraph); assert.equal(fixture.subject.witness.target.graphSha256, fixture.targetGraph);
  assert.ok(Object.values(fixture.subject.authority).every((value) => value === false)); assert.deepEqual(applied.effectiveAddedPaths, [...architectureDependencyBaselinePolicyV1.exactAddedPaths, dependencyWitnessPath].sort());
  const authorization = verifyArchitectureMaintenanceAuthority({ raw: fixture.dependency.original, allComments: fixture.allComments, paginationComplete: true, allCommits: fixture.allCommits, commitsPaginationComplete: true, identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, ancestryVerified: true, root: fixture.cwd }); assert.equal(authorization.authorizationOk, true, stableJson({ findings: authorization.findings, checks: authorization.checks, budget: authorization.budget, dependencyAmendment: authorization.dependencyAmendment, scope: fixture.scope })); assert.equal(authorization.mergeEligible, false);
  const reviewSubject = architectureRepositoryReviewSubject({ identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, profile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1, dependencyAmendmentResolution: applied });
  const review = taskLocalArchitectureComment({ id: 800011, pr: fixture.identity.pr, body: architectureRepositoryReviewCommentBody(reviewSubject) });
  assert.equal(verifyArchitectureRepositoryReview({ raw: review, identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, profile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1, dependencyAmendmentResolution: applied }).valid, true);
  const run = { id: 900032, run_attempt: 1, name: "Phase 1 CI", event: "pull_request", status: "completed", conclusion: "success", head_sha: fixture.identity.headSha, head_branch: fixture.identity.branch, pull_requests: [{ number: fixture.identity.pr, head: { sha: fixture.identity.headSha }, base: { sha: fixture.identity.baseSha } }] };
  const jobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({ id: index + 1, name, status: "completed", conclusion: "success", head_sha: fixture.identity.headSha }));
  const phase1 = verifyPhase1RunEvidence({ run, jobs, identity: fixture.identity, tree: fixture.tree });
  const final = architectureFinalSourceSubject({ identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, originalRaw: fixture.dependency.original, historicalRepositoryReviewRaws: [fixture.dependency.historicalReview], repositoryReviewRaw: review, phase1Evidence: phase1, dependencyAmendmentResolution: applied, root: fixture.cwd });
  assert.equal(final.dependencyAmendment.witnessAmendment.commentId, fixture.amendment.id); assert.deepEqual(final.dependencyEvidence, applied.finalEvidence); assert.deepEqual(applied.finalEvidence.witness, standalone.finalEvidence);
  const finalRaw = taskLocalArchitectureComment({ id: 800012, pr: fixture.identity.pr, body: architectureFinalSourceOwnerCommentBody(final) });
  const postEvidence = verifyArchitectureDependencyAmendment({ ...fixture.integrated(), allComments: [...fixture.allComments, review, finalRaw] }); assert.equal(postEvidence.valid, true, stableJson(postEvidence.findings));
  const authority = verifyArchitectureMaintenanceAuthority({ raw: fixture.dependency.original, allComments: [...fixture.allComments, review, finalRaw], paginationComplete: true, allCommits: fixture.allCommits, commitsPaginationComplete: true, identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, phase1EvidenceResolver: () => phase1, root: fixture.cwd });
  assert.equal(authority.authorizationOk, true, stableJson(authority.findings)); assert.equal(authority.mergeEligible, true, stableJson(authority.mergeFindings)); assert.equal(authority.dependencyAmendment.witnessAmendment.commentId, fixture.amendment.id);
  const omittedSubject = structuredClone(final); delete omittedSubject.dependencyAmendment.witnessAmendment; const omittedFinal = taskLocalArchitectureComment({ id: 800015, pr: fixture.identity.pr, body: architectureFinalSourceOwnerCommentBody(omittedSubject) });
  const omitted = verifyArchitectureMaintenanceAuthority({ raw: fixture.dependency.original, allComments: [...fixture.allComments, review, omittedFinal], paginationComplete: true, allCommits: fixture.allCommits, commitsPaginationComplete: true, identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, ancestryVerified: true, phase1EvidenceResolver: () => phase1, root: fixture.cwd }); assert.equal(omitted.authorizationOk, true); assert.equal(omitted.mergeEligible, false);
});

test("pending dependency compatibility witness cannot produce current review, final source, or merge eligibility", (t) => {
  const fixture = dependencyWitnessAmendmentFixture(); t.after(fixture.cleanup);
  const pending = verifyArchitectureDependencyAmendment(fixture.integrated({ pending: true }));
  assert.equal(pending.valid, true, stableJson(pending.findings)); assert.equal(pending.state, "WITNESS_AUTHORIZED_PENDING");
  const reviewSubject = architectureRepositoryReviewSubject({ identity: fixture.pending.identity, tree: fixture.pending.tree, scope: fixture.pending.scope, profile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1, dependencyAmendmentResolution: pending });
  const review = taskLocalArchitectureComment({ id: 800013, pr: fixture.pending.identity.pr, body: architectureRepositoryReviewCommentBody(reviewSubject) });
  assert.equal(verifyArchitectureRepositoryReview({ raw: review, identity: fixture.pending.identity, tree: fixture.pending.tree, scope: fixture.pending.scope, profile: FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1, dependencyAmendmentResolution: pending }).valid, false);
  const authority = verifyArchitectureMaintenanceAuthority({ raw: fixture.dependency.original, allComments: [...fixture.allComments, review], paginationComplete: true, allCommits: fixture.pending.allCommits, commitsPaginationComplete: true, identity: fixture.pending.identity, tree: fixture.pending.tree, scope: fixture.pending.scope, root: fixture.cwd });
  assert.equal(authority.authorizationOk, true, stableJson(authority.findings)); assert.equal(authority.mergeEligible, false); assert.equal(authority.checks.dependencyAmendmentApplied, false);
});

test("a sixteenth path requires one valid witness receipt and an invalid receipt cannot be ignored", (t) => {
  const fixture = dependencyWitnessAmendmentFixture(); t.after(fixture.cleanup);
  const without = verifyArchitectureDependencyAmendment({ ...fixture.integrated(), allComments: [fixture.dependency.original, fixture.dependency.historicalReview, fixture.dependency.amendment] });
  const edited = { ...fixture.amendment, body: `${fixture.amendment.body} ` };
  const invalid = verifyArchitectureDependencyAmendment({ ...fixture.integrated(), allComments: [fixture.dependency.original, fixture.dependency.historicalReview, fixture.dependency.amendment, edited] });
  const duplicate = verifyArchitectureDependencyAmendment({ ...fixture.integrated(), allComments: [...fixture.allComments, { ...fixture.amendment, id: 800014 }] });
  const orphan = verifyArchitectureMaintenanceAuthority({ raw: fixture.dependency.original, allComments: [fixture.dependency.original, fixture.amendment], paginationComplete: true, allCommits: fixture.allCommits, commitsPaginationComplete: true, identity: fixture.identity, tree: fixture.tree, scope: fixture.scope, ancestryVerified: true, root: fixture.cwd });
  assert.equal(without.valid, false); assert.equal(invalid.valid, false); assert.equal(duplicate.valid, false); assert.equal(orphan.authorizationOk, false);
});

test("dependency compatibility witness amendment rejects receipt, identity, pagination, ancestry, scope, hash, and authority attacks", (t) => {
  const fixture = dependencyWitnessAmendmentFixture(); t.after(fixture.cleanup); const verify = (overrides = {}) => verifyArchitectureDependencyWitnessAmendment({ ...fixture.common, ...overrides });
  const reissue = (mutate) => { const subject = structuredClone(fixture.subject); mutate(subject); return taskLocalArchitectureComment({ id: fixture.amendment.id, pr: fixture.identity.pr, body: architectureDependencyWitnessAmendmentOwnerCommentBody(subject) }); };
  const attacks = [
    ["edited body", { raw: { ...fixture.amendment, body: `${fixture.amendment.body} ` } }], ["edited timestamp", { raw: { ...fixture.amendment, updated_at: "2026-08-14T01:00:01Z" } }],
    ["receipt chronology", { raw: { ...fixture.amendment, created_at: "2026-08-14T01:00:00Z", updated_at: "2026-08-14T01:00:00Z" } }],
    ["wrong Owner", { raw: { ...fixture.amendment, user: { login: "attacker" } } }], ["wrong association", { raw: { ...fixture.amendment, author_association: "MEMBER" } }],
    ["duplicate receipt", { allComments: [...fixture.allComments, { ...fixture.amendment, id: 800014 }] }], ["comment pagination", { paginationComplete: false }], ["commit pagination", { commitsPaginationComplete: false }],
    ["missing commit", { allCommits: fixture.allCommits.slice(0, -1) }], ["duplicate commit", { allCommits: [...fixture.allCommits, fixture.allCommits.at(-1)] }], ["commit order", { allCommits: [...fixture.allCommits].reverse() }], ["wrong commit tree", { allCommits: fixture.allCommits.map((item, index) => index ? item : { ...item, commit: { tree: { sha: "0".repeat(40) } } }) }],
    ["non-descendant", { identity: { ...fixture.identity, headSha: fixture.dependency.base }, tree: fixtureTree(fixture.cwd, fixture.dependency.base) }], ["wrong tree", { tree: "0".repeat(40) }], ["wrong repository", { identity: { ...fixture.identity, repository: "attacker/fork" } }], ["wrong branch", { identity: { ...fixture.identity, branch: "attacker-branch" } }], ["reuse by PR", { identity: { ...fixture.identity, pr: 999 } }],
    ["wrong original", { originalRaw: { ...fixture.dependency.original, body: `${fixture.dependency.original.body} ` } }], ["wrong dependency receipt", { dependencyAmendmentRaw: { ...fixture.dependency.amendment, body: `${fixture.dependency.amendment.body} ` } }],
    ["dependency binding", { raw: reissue((subject) => { subject.dependencyAmendment.commentId += 1; }) }], ["starting head", { raw: reissue((subject) => { subject.startingHead = "0".repeat(40); }) }],
    ["wildcard path", { raw: reissue((subject) => { subject.addedPaths[0] = "*"; }) }], ["untracked witness", { raw: reissue((subject) => { subject.addedPaths[0] = "scripts/test-untracked-compat.mjs"; subject.witness.path = subject.addedPaths[0]; }) }], ["product path", { raw: reissue((subject) => { subject.addedPaths[0] = "package.json"; subject.witness.path = subject.addedPaths[0]; }) }], ["extra path", { raw: reissue((subject) => { subject.addedPaths.push("README.md"); }) }], ["wrong final paths", { raw: reissue((subject) => { subject.finalPaths.push("README.md"); }) }],
    ["file 17", { raw: reissue((subject) => { subject.finalBudget.maximumFiles = 17; }) }], ["line budget", { raw: reissue((subject) => { subject.finalBudget.maximumNetLines = 4501; }) }], ["scope extra", { scope: { ...fixture.scope, files: [...fixture.scope.files, "README.md"] } }], ["scope line 4501", { scope: { ...fixture.scope, netChangedLines: 4501 } }],
    ["failure check", { raw: reissue((subject) => { subject.failureEvidence.check = "other"; }) }], ["failure step", { raw: reissue((subject) => { subject.failureEvidence.step = "other"; }) }], ["failure count", { raw: reissue((subject) => { subject.failureEvidence.passed = 11; }) }], ["failure ancestor", { raw: reissue((subject) => { subject.failureEvidence.head = fixture.dependency.base; subject.failureEvidence.tree = fixtureTree(fixture.cwd, fixture.dependency.base); }) }], ["failure tree", { raw: reissue((subject) => { subject.failureEvidence.tree = "0".repeat(40); }) }], ["identifier", { raw: reissue((subject) => { subject.witness.identifier = "otherIdentifier"; }) }], ["unsafe identifier", { raw: reissue((subject) => { subject.witness.identifier = "bad-name"; }) }],
    ["baseline blob", { raw: reissue((subject) => { subject.witness.baseline.blob = "0".repeat(40); }) }], ["baseline file hash", { raw: reissue((subject) => { subject.witness.baseline.sha256 = "0".repeat(64); }) }], ["baseline graph hash", { raw: reissue((subject) => { subject.witness.baseline.graphSha256 = "0".repeat(64); }) }],
    ["target file hash", { raw: reissue((subject) => { subject.witness.target.sha256 = "0".repeat(64); }) }], ["target graph hash", { raw: reissue((subject) => { subject.witness.target.graphSha256 = "0".repeat(64); }) }], ["authority", { raw: reissue((subject) => { subject.authority.build = true; }) }],
  ];
  assert.deepEqual(attacks.filter(([, overrides]) => verify(overrides).valid).map(([name]) => name), []);
});

test("dependency compatibility witness amendment rejects non-exact source and dependency artifact drift", async (t) => {
  assert.throws(() => dependencyWitnessAmendmentFixture({ candidate: { staleBaseline: true } }), /ARCHITECTURE_DEPENDENCY_WITNESS_AMENDMENT_SUBJECT_INVALID/u);
  assert.throws(() => dependencyWitnessAmendmentFixture({ candidate: { touchRevert: true } }), /ARCHITECTURE_DEPENDENCY_WITNESS_AMENDMENT_SUBJECT_INVALID/u);
  for (const candidate of [{ wrongTarget: true }, { nonExactReplacement: true }, { packageDrift: true }, { packageScriptDrift: true }, { lockDrift: true }, { digestDrift: true }, { workflowDrift: true }, { extraPath: true }]) await t.test(Object.keys(candidate)[0], (inner) => {
    const fixture = dependencyWitnessAmendmentFixture({ candidate }); inner.after(fixture.cleanup);
    assert.equal(verifyArchitectureDependencyWitnessAmendment(fixture.common).valid, false);
  });
});
const receiptLifecycleFixture = ({ phase1Mutator = null, reviewMutator = null, currentIdentityMutator = null, extraHistorical = [] } = {}) => {
  const paths = ["scripts/assurance/engineering-closure.mjs"];
  const originalIdentity = { repository: "Chillywood2025/chillywood-mobile", pr: 230, branch: "codex/task-local-edge-fixture", headSha: "a".repeat(40), baseSha: "b".repeat(40) };
  const originalTree = "c".repeat(40);
  const originalScope = { files: paths, additions: 10, deletions: 1, netChangedLines: 9, diffHash: "1".repeat(64) };
  const originalSubject = architectureMaintenanceSubject({ identity: originalIdentity, tree: originalTree, scope: originalScope, profile: "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1" });
  const original = taskLocalArchitectureComment({ id: 700002, pr: originalIdentity.pr, body: architectureMaintenanceOwnerCommentBody(originalSubject) });
  let identity = { ...originalIdentity, headSha: "d".repeat(40) };
  if (currentIdentityMutator) identity = currentIdentityMutator(identity);
  const tree = "e".repeat(40);
  const scope = { files: paths, additions: 20, deletions: 2, netChangedLines: 18, diffHash: "f".repeat(64) };
  let reviewSubject = architectureRepositoryReviewSubject({ identity, tree, scope });
  if (reviewMutator) reviewSubject = reviewMutator(structuredClone(reviewSubject));
  const review = taskLocalArchitectureComment({ id: 700004, pr: identity.pr, body: architectureRepositoryReviewCommentBody(reviewSubject) });
  const run = { id: 900001, run_attempt: 1, name: "Phase 1 CI", event: "pull_request", status: "completed", conclusion: "success", head_sha: identity.headSha, head_branch: identity.branch, pull_requests: [{ number: identity.pr, head: { sha: identity.headSha }, base: { sha: identity.baseSha } }] };
  const jobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({ id: index + 1, name, status: "completed", conclusion: "success", head_sha: identity.headSha }));
  if (phase1Mutator) phase1Mutator(run, jobs);
  const phase1 = verifyPhase1RunEvidence({ run, jobs, identity, tree });
  const prematureSubject = architectureFinalSourceSubject({ identity, tree, scope, originalRaw: original });
  const premature = taskLocalArchitectureComment({ id: 5289720389, pr: identity.pr, body: architectureFinalSourceOwnerCommentBody(prematureSubject) });
  const historical = [premature, ...extraHistorical];
  const finalSubject = architectureFinalSourceSubject({ identity, tree, scope, originalRaw: original, historicalAttestationRaws: historical, repositoryReviewRaw: review, phase1Evidence: phase1 });
  const final = taskLocalArchitectureComment({ id: 700005, pr: identity.pr, body: architectureFinalSourceOwnerCommentBody(finalSubject) });
  const comments = [original, ...historical, review, final];
  const evaluate = (overrides = {}) => verifyArchitectureMaintenanceAuthority({ raw: original, allComments: comments, paginationComplete: true, identity, tree, scope, ancestryVerified: true, phase1EvidenceResolver: () => phase1, ...overrides });
  return { originalIdentity, originalTree, originalScope, originalSubject, original, identity, tree, scope, review, phase1, premature, final, comments, evaluate };
};

test("Phase 1 evidence ignores optional advisory check-runs", () => {
  const fixture = receiptLifecycleFixture({ phase1Mutator: (_run, jobs) => jobs.push({ name: "Chi'llywood / Codex Review Exact Head", status: "completed", conclusion: "neutral" }) });
  assert.equal(fixture.phase1.valid, true);
  assert.equal(fixture.phase1.result, "PASS_13_OF_13");
});

test("receipt lifecycle V2 regression matrix 35/35", async (t) => {
  const cases = [
    ["01 Owner authorization is valid without final attestation", () => { const f = receiptLifecycleFixture(); const r = verifyArchitectureMaintenanceAuthority({ raw: f.original, allComments: [f.original], paginationComplete: true, identity: f.identity, tree: f.tree, scope: f.scope, ancestryVerified: true }); assert.equal(r.authorizationOk, true); assert.equal(r.mergeEligible, false); }],
    ["02 in-scope descendants retain Owner authorization", () => assert.equal(receiptLifecycleFixture().evaluate().authorizationOk, true)],
    ["03 out-of-scope descendants fail", () => { const f = receiptLifecycleFixture(); const scope = { ...f.scope, files: [...f.scope.files, "package.json"] }; assert.equal(f.evaluate({ scope }).authorizationOk, false); }],
    ["04 budget overflow fails", () => { const f = receiptLifecycleFixture(); assert.equal(f.evaluate({ scope: { ...f.scope, netChangedLines: 3201 } }).authorizationOk, false); }],
    ["05 objective change fails", () => { const f = receiptLifecycleFixture(); const changed = { ...f.originalSubject, objective: "different objective" }; const raw = taskLocalArchitectureComment({ id: f.original.id, pr: f.identity.pr, body: architectureMaintenanceOwnerCommentBody(changed) }); assert.equal(verifyArchitectureMaintenanceAuthority({ raw, allComments: [raw], paginationComplete: true, identity: f.identity, tree: f.tree, scope: f.scope, ancestryVerified: true }).ok, false); }],
    ["06 prohibited authority expansion fails", () => { const f = receiptLifecycleFixture(); const changed = structuredClone(f.originalSubject); changed.authority.product = true; const raw = taskLocalArchitectureComment({ id: f.original.id, pr: f.identity.pr, body: architectureMaintenanceOwnerCommentBody(changed) }); assert.equal(verifyArchitectureMaintenanceAuthority({ raw, allComments: [raw], paginationComplete: true, identity: f.identity, tree: f.tree, scope: f.scope, ancestryVerified: true }).ok, false); }],
    ["07 final attestation is not required for local self-host", () => { const f = receiptLifecycleFixture(); const r = verifyArchitectureMaintenanceAuthority({ raw: f.original, allComments: [f.original], paginationComplete: true, identity: f.identity, tree: f.tree, scope: f.scope, ancestryVerified: true }); assert.equal(r.ok, true); }],
    ["08 final attestation is not required for repository review", () => { const f = receiptLifecycleFixture(); const r = verifyArchitectureMaintenanceAuthority({ raw: f.original, allComments: [f.original, f.review], paginationComplete: true, identity: f.identity, tree: f.tree, scope: f.scope, ancestryVerified: true }); assert.equal(r.ok, true); }],
    ["09 final attestation is not required for Phase 1", () => { const f = receiptLifecycleFixture(); const r = verifyArchitectureMaintenanceAuthority({ raw: f.original, allComments: [f.original], paginationComplete: true, identity: f.identity, tree: f.tree, scope: f.scope, ancestryVerified: true }); assert.equal(r.finalSourceAttestationRequiredAtThisStage, false); }],
    ["10 PR event derives exact self-host context", () => { const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL(".", root), encoding: "utf8" }).trim(); const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: new URL(".", root), encoding: "utf8" }).trim(); const base = execFileSync("git", ["rev-parse", "origin/main"], { cwd: new URL(".", root), encoding: "utf8" }).trim(); const branch = execFileSync("git", ["branch", "--show-current"], { cwd: new URL(".", root), encoding: "utf8" }).trim(); const event = { number: 232, repository: { full_name: "Chillywood2025/chillywood-mobile" }, pull_request: { number: 232, html_url: "https://github.com/Chillywood2025/chillywood-mobile/pull/232", head: { sha: head, ref: branch }, base: { sha: base, ref: "main" } } }; const readback = { number: 232, repository: event.repository.full_name, baseRef: "main", baseSha: base, headRef: branch, headSha: head, htmlUrl: event.pull_request.html_url, state: "open" }; const result = resolveEngineeringClosureTaskContext({ event, localIdentity: { head, tree, base, branch }, scope: { files: ["scripts/assurance/engineering-closure.mjs"] }, currentTruth: {}, readPull: () => readback, observeAuthorities: () => ({ architectureAuthority: { ok: true, type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE" } }), sourceAncestryVerified: true }); assert.equal(result.ok, true); }],
    ["11 premature receipt cannot establish task context", () => { const f = receiptLifecycleFixture(); const r = verifyArchitectureMaintenanceAuthority({ raw: f.original, allComments: [f.original, f.premature], paginationComplete: true, identity: f.identity, tree: f.tree, scope: f.scope, ancestryVerified: true }); assert.equal(r.commentId, f.original.id); assert.equal(r.currentFinalSourceReceiptId, null); }],
    ["12 local self-host without exact context fails closed", () => assert.equal(resolveEngineeringClosureTaskContext({ event: null, eventPath: null }).ok, false)],
    ["13 pre-review final attestation is historical", () => assert.equal(receiptLifecycleFixture().evaluate().finalSourceAttestationClassifications.find(({ commentId }) => commentId === 5289720389).status, "HISTORICAL_PRE_CI_FINAL_SOURCE_ATTESTATION")],
    ["14 pre-Phase-1 final attestation is historical", () => { const f = receiptLifecycleFixture(); assert.equal(verifyArchitectureMaintenanceAuthority({ raw: f.original, allComments: [f.original, f.premature, f.review], paginationComplete: true, identity: f.identity, tree: f.tree, scope: f.scope, ancestryVerified: true }).mergeEligible, false); }],
    ["15 post-review and 13-of-13 attestation is current", () => assert.equal(receiptLifecycleFixture().evaluate().mergeEligible, true)],
    ["16 review head mismatch fails", () => { const f = receiptLifecycleFixture({ reviewMutator: (review) => ({ ...review, reviewedHead: "0".repeat(40) }) }); assert.equal(f.evaluate().mergeEligible, false); }],
    ["17 Phase 1 head mismatch fails", () => { const f = receiptLifecycleFixture({ phase1Mutator: (run) => { run.head_sha = "0".repeat(40); } }); assert.equal(f.evaluate().mergeEligible, false); }],
    ["18 Phase 1 below 13-of-13 fails", () => { const f = receiptLifecycleFixture({ phase1Mutator: (_run, jobs) => { jobs.pop(); } }); assert.equal(f.evaluate().mergeEligible, false); }],
    ["19 source change invalidates final attestation", () => { const f = receiptLifecycleFixture(); const identity = { ...f.identity, headSha: "9".repeat(40) }; const r = f.evaluate({ identity, ancestryVerified: true }); assert.equal(r.mergeEligible, false); }],
    ["20 source change does not revoke Owner authorization", () => { const f = receiptLifecycleFixture(); const identity = { ...f.identity, headSha: "9".repeat(40) }; assert.equal(f.evaluate({ identity, ancestryVerified: true }).authorizationOk, true); }],
    ["21 historical stale attestations do not block current", () => assert.equal(receiptLifecycleFixture().evaluate().mergeEligible, true)],
    ["22 historical malformed attestations do not block current", () => { const malformed = taskLocalArchitectureComment({ id: 700006, pr: 230, body: `${ARCHITECTURE_FINAL_SOURCE_MARKER}\n{}` }); const f = receiptLifecycleFixture({ extraHistorical: [malformed] }); assert.equal(f.evaluate().mergeEligible, true); }],
    ["23 GitHub comment order does not affect selection", () => { const f = receiptLifecycleFixture(); assert.equal(f.evaluate({ allComments: [...f.comments].reverse() }).currentFinalSourceReceiptId, f.final.id); }],
    ["24 two current attestations fail", () => { const f = receiptLifecycleFixture(); const duplicate = { ...f.final, id: 700007, node_id: "IC_duplicate_700007", html_url: "https://github.com/Chillywood2025/chillywood-mobile/pull/230#issuecomment-700007" }; assert.equal(f.evaluate({ allComments: [...f.comments, duplicate] }).mergeEligible, false); }],
    ["25 evidence-only correction requires no source commit", () => { const f = receiptLifecycleFixture(); assert.equal(f.final.body.includes(f.identity.headSha), true); assert.equal(f.evaluate().mergeEligible, true); }],
    ["26 evidence-only correction requires no new authorization", () => { const f = receiptLifecycleFixture(); assert.equal(f.comments.filter(({ body }) => body.startsWith("<!-- chillywood-assurance-architecture-maintenance-v1 -->")).length, 1); }],
    ["27 merge eligibility fails without final attestation", () => { const f = receiptLifecycleFixture(); assert.equal(f.evaluate({ allComments: [f.original, f.review] }).mergeEligible, false); }],
    ["28 merge eligibility passes with exact review CI and attestation", () => assert.equal(receiptLifecycleFixture().evaluate().mergeEligible, true)],
    ["29 terminal merge evidence binds exact attestation", () => { const f = receiptLifecycleFixture(); const r = f.evaluate(); assert.equal(r.currentFinalSourceReceiptId, f.final.id); assert.equal(f.final.body.includes(f.identity.headSha), true); assert.equal(f.final.body.includes(f.tree), true); }],
    ["30 task-local edge regressions remain clear", () => assert.equal(taskLocalValidResult().classification, "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR")],
    ["31 doctrine truth remains clear", () => assert.deepEqual(validateEngineeringDoctrineTruth(json("config/assurance/current-truth-v1.json"), json("config/assurance/current-truth-contract-v1.json")), [])],
    ["32 active-task authority remains fail closed", () => assert.equal(validateEngineeringTaskAuthority({ activeTaskPacket: null }).ok, false)],
    ["33 all thirteen Phase 1 checks remain required", () => assert.equal(PHASE1_REQUIRED_JOB_NAMES.length, 13)],
    ["34 Provider Codex Review remains optional", () => assert.equal(json("config/assurance/current-truth-v1.json").reviewPolicy.classification, "OPTIONAL_ADVISORY")],
    ["35 later malformed attestation cannot invalidate current evidence", () => { const f = receiptLifecycleFixture(); const malformed = taskLocalArchitectureComment({ id: 700008, pr: f.identity.pr, body: `${ARCHITECTURE_FINAL_SOURCE_MARKER}\n{}` }); assert.equal(f.evaluate({ allComments: [...f.comments, malformed] }).mergeEligible, true); }],
  ];
  assert.equal(cases.length, 35);
  for (const [name, assertion] of cases) await t.test(name, assertion);
});
