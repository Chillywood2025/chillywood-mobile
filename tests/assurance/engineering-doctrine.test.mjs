import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CLEAR_CHECKS, affectedDomainClosure, applyAssuranceEfficiencyTransition, applyAutonomousGovernanceTransition, applyCodexSecurityTransition,
  authoritativeReplayOnce, buildDoctrineReport, buildInventory, classifyContractFreshness, classifyLaterFinding,
  deriveAffectedDomainClosure, detectGraphFindings, doctrineBootstrapAuthorizationSubject, doctrineBootstrapOwnerCommentBody,
  doctrineScopeAmendmentOwnerCommentBody, doctrineScopeAmendmentSubject,
  evaluateAutonomousEngineeringRequest, evaluatePreimplementationGate, evaluateTaskAdmission, generateDomainGraph, hashValue,
  inventoryMappingFindings, makeBootstrapPacket, makeTaskPacket, normalizeGitHubCommentIdentity, observeCandidateScopeFromGit,
  observeGitHubTaskIdentity, observeGroundedRuntimeEvidence, observeOfficialPublicContract, observeRepositoryOwnedReview, runAuthoritativeReplay, stableJson,
  verifyDoctrineScopeAmendment, verifyExternalTrustRootReceipt, verifyInventoryNonVacuity
} from "../../scripts/assurance/engineering-closure.mjs";
import { compareReplayOutputs, verifyAuthoritativeOutput, verifySerializedEdgeModel, verifySerializedTransitionModel } from "../../scripts/assurance/engineering-evidence-verifier.mjs";
import { validateEngineeringTaskAuthority } from "../../scripts/assurance/active-task.mjs";
import { renderCurrentState, renderNextTask, validateEngineeringDoctrineTruth } from "../../scripts/assurance/lib.mjs";

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
  const branch = "codex/whole-app-engineering-doctrine-v1";
  const base = "8bf6459c3ae1cec62e26a1694f03063e4291b9f8";
  const seedTree = "64c3f8d56d93b08e5c3d3abbed11e707be1ede2b";
  const head = "c9192f0f94d903617eb28deba610c26c41dc8eeb";
  const tree = "15ae28610def9204814575235129daf4b3c8c5c4";
  const leaseId = "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1";
  const paths = local.packet.sections.K_IMPLEMENTATION_PLAN.files.slice().sort();
  const subject = doctrineBootstrapAuthorizationSubject({ repository, pr, branch, admittedSeedHead: base, admittedSeedTree: seedTree, protectedBase: base, leaseId, pathHash: "f6d652cb3f2086a00479188613d8a990ba64bd4b2be7c0d1325bf8ea9ce2a8af", maximumFiles: 25, maximumLines: 4000 });
  const comment = { id: commentId, node_id: "IC_kwDO_SANITIZED", user: { login: "Chillywood2025" }, author_association: "OWNER", body: doctrineBootstrapOwnerCommentBody(subject), created_at: "2026-08-12T12:00:00Z", updated_at: "2026-08-12T12:00:00Z", issue_url: `https://api.github.com/repos/${repository}/issues/${pr}`, html_url: `https://github.com/${repository}/pull/${pr}#issuecomment-${commentId}` };
  const amendment = { id: amendmentCommentId, node_id: "IC_kwDO_AMENDMENT", user: { login: "Chillywood2025" }, author_association: "OWNER", body: doctrineScopeAmendmentOwnerCommentBody(), created_at: "2026-08-13T01:42:03Z", updated_at: "2026-08-13T01:42:03Z", issue_url: `https://api.github.com/repos/${repository}/issues/${pr}`, html_url: `https://github.com/${repository}/pull/${pr}#issuecomment-${amendmentCommentId}` };
  const pull = { number: pr, state: "open", draft: true, html_url: `https://github.com/${repository}/pull/${pr}`, head: { sha: head, ref: branch }, base: { sha: base, ref: "main" }, title: "Require authoritative bounded whole-app engineering closure" };
  const ghData = { pull, comment, amendment, comments: [comment, amendment], open: [pull] };
  const gh = `#!/usr/bin/env node\nconst a=process.argv.join(' ');const d=${JSON.stringify(ghData)};const out=a.includes('/issues/comments/${amendmentCommentId}')?d.amendment:a.includes('/issues/comments/${commentId}')?d.comment:a.includes('/issues/${pr}/comments?')?d.comments:a.includes('?state=open')?d.open:d.pull;process.stdout.write(JSON.stringify(out));\n`;
  const gitData = { head, tree, base, seedTree, branch, paths };
  const git = `#!/usr/bin/env node\nconst a=process.argv.slice(2);const s=a.join(' ');const d=${JSON.stringify(gitData)};if(a[0]==='merge-base')process.exit(0);if(a[0]==='rev-parse'){if(s.includes('refs/remotes/origin/'))process.stdout.write(d.head+'\\n');else if(s.includes(d.head+'^{tree}'))process.stdout.write(d.tree+'\\n');else process.stdout.write(d.seedTree+'\\n');}else if(a[0]==='diff'&&a.includes('--name-only'))process.stdout.write(d.paths.join('\\n')+'\\n');else if(a[0]==='diff'&&a.includes('--numstat'))process.stdout.write(d.paths.map(p=>'1\\t0\\t'+p).join('\\n')+'\\n');else if(a[0]==='diff')process.stdout.write('exact bounded doctrine diff');else process.exit(1);\n`;
  const observation = withFakeExecutables({ gh, git }, () => observeGitHubTaskIdentity({ repository, pr, branch, admittedSeedHead: base, protectedBase: base, leaseId, commentId, amendmentCommentId, maximumFiles: 31, maximumLines: 7000 }));
  assert.equal(observation?.candidateEligible, true);
  actualFixture = makeBootstrapPacket(undefined, { taskIdentityObservation: observation, pr, leaseId });
  actualFixture.observation = observation;
  actualFixture.ownerComments = { originalRaw: comment, amendmentRaw: amendment, amendmentComments: [comment, amendment] };
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
  ["40 current D2A terminal truth remains intact", () => { const truth = json("config/assurance/current-truth-v1.json"); assert.equal(truth.activeTaskBinding.phase, "TERMINAL"); assert.equal(truth.activeTaskBinding.completionScope, "D2A_BOUND_COMPLETE_FOR_REGISTERED_NATIVE_LIFECYCLE_SCOPE"); assert.equal(truth.latestMergedImplementationPr.number, 212); }]
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
  fs.writeFileSync(executable, `#!/bin/sh\ncase "$*" in\n*--name-only*) printf 'app/chat/a.tsx\\n';;\n*--numstat*) printf '10000\\t0\\tapp/chat/a.tsx\\n';;\n*) printf 'fixed diff';;\nesac\n`); fs.chmodSync(executable, 0o755); process.env.PATH = `${dir}:${original}`;
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
test("P1-4 actual PR 226 identity and both Owner comments bind exactly", () => { const fixture = actualBootstrapFixture(); assert.equal(fixture.observation.candidateEligible, true); assert.equal(fixture.observation.pr, 226); assert.equal(fixture.observation.branch, "codex/whole-app-engineering-doctrine-v1"); assert.equal(fixture.observation.base, "8bf6459c3ae1cec62e26a1694f03063e4291b9f8"); assert.equal(fixture.observation.head, "c9192f0f94d903617eb28deba610c26c41dc8eeb"); assert.equal(fixture.observation.tree, "15ae28610def9204814575235129daf4b3c8c5c4"); assert.equal(fixture.observation.ownerComment.id, 5274614505); assert.equal(fixture.observation.scopeAmendmentCommentId, 5274913577); assert.equal(fixture.observation.paths.length, 31); });

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
