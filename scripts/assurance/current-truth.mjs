#!/usr/bin/env node
import fs from "node:fs";
import {
  args,
  baseSynchronizationFirstParentDistance,
  baseSynchronizationReviewReceiptHash,
  emit,
  evaluateFiniteTaskLeaseRuntime,
  evaluateProtectedMainAdvancement,
  git,
  implementationRemoteRef,
  isValidGitBranchName,
  optionalCodexReviewPolicyValid,
  providerMode,
  readJson,
  readText,
  rel,
  renderCurrentState,
  renderNextTask,
  sha256,
  verifyCurrentTruthHeadBindings,
  verifyCompletedImplementationMergeIdentity,
  verifyProviderImplementationSnapshot,
  validateFiniteTaskLeaseRegistry,
  validateEngineeringDoctrineTruth,
  validateProofTierStatuses,
  validateTerminalTaskEvidence
} from "./lib.mjs";
import { validateStructuredBinding } from "./active-task.mjs";
import { validateLateReviewSentinelState } from "./late-review-sentinel.mjs";

function safeGit(gitArgs, fallback = null) {
  try {
    return git(gitArgs);
  } catch {
    return fallback;
  }
}

function splitNullTerminated(value) {
  return typeof value === "string" ? value.split("\0").filter(Boolean) : [];
}

function collectBaseSynchronizationReviewEvidence(reviewEntries) {
  const evidence = [];
  for (const review of Array.isArray(reviewEntries) ? reviewEntries : []) {
    if (!isValidGitBranchName(review?.branch)
      || (review?.disposition !== "never-merge" && !String(review?.disposition ?? "").includes("never-merge"))) continue;
    const reviewRef = implementationRemoteRef(review.branch);
    const reviewRefHead = safeGit(["show-ref", "--verify", "--hash", reviewRef]);
    if (!reviewRefHead) continue;
    const reviewRefTree = safeGit(["rev-parse", `${reviewRefHead}^{tree}`]);
    if (!reviewRefTree) continue;
    const files = safeGit(["ls-tree", "-r", "--name-only", reviewRef, "--", "docs/reviews", "config/assurance/reviews"], "")
      .split(/\r?\n/gu)
      .filter((file) => file.endsWith(".json"));
    for (const file of files) {
      try {
        const manifest = JSON.parse(git(["show", `${reviewRef}:${file}`]));
        if (manifest?.classification !== "BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH") continue;
        const candidate = { ...manifest, reviewRef, reviewRefHead, reviewRefTree };
        if (candidate.reviewReceiptHash !== baseSynchronizationReviewReceiptHash(candidate)) continue;
        evidence.push(candidate);
      } catch {
        // A malformed candidate is ignored and the minimum-evidence gate fails closed.
      }
    }
  }
  return evidence;
}

function inspectBaseSynchronization({ entry, observedHead, currentMain, reviewEvidence }) {
  const parents = safeGit(["show", "-s", "--format=%P", observedHead], "").split(/\s+/u).filter(Boolean);
  const commitDistance = baseSynchronizationFirstParentDistance(entry.head, observedHead);
  const observedTree = safeGit(["rev-parse", `${observedHead}^{tree}`]);
  const mergeBase = safeGit(["merge-base", entry.head, currentMain]);
  let sourceIsAncestor = false;
  try {
    git(["merge-base", "--is-ancestor", entry.head, observedHead]);
    sourceIsAncestor = true;
  } catch {
    sourceIsAncestor = false;
  }
  let canonicalTree = null;
  let mergeConflict = true;
  try {
    canonicalTree = git(["merge-tree", "--write-tree", entry.head, currentMain]);
    mergeConflict = !/^[0-9a-f]{40}$/u.test(canonicalTree);
  } catch {
    canonicalTree = null;
    mergeConflict = true;
  }
  const reviewedSourceDelta = mergeBase ? safeGit(["diff", "--binary", "--no-renames", mergeBase, entry.head]) : null;
  const synchronizedSourceDelta = safeGit(["diff", "--binary", "--no-renames", currentMain, observedHead]);
  const reviewedChangedFileBytes = mergeBase ? safeGit(["diff", "--name-status", "-z", "--no-renames", mergeBase, entry.head]) : null;
  const synchronizedChangedFileBytes = safeGit(["diff", "--name-status", "-z", "--no-renames", currentMain, observedHead]);
  const reviewedChangedPaths = mergeBase ? splitNullTerminated(safeGit(["diff", "--name-only", "-z", "--no-renames", mergeBase, entry.head], "")) : null;
  const synchronizedChangedPaths = splitNullTerminated(safeGit(["diff", "--name-only", "-z", "--no-renames", currentMain, observedHead], ""));
  const currentTruthBindingChangedPaths = splitNullTerminated(safeGit(["diff", "--name-only", "-z", "--no-renames", entry.head, observedHead], ""));
  return {
    sourceIsAncestor,
    commitDistance,
    parents,
    observedTree,
    canonicalTree,
    mergeConflict,
    reviewedSourceDeltaHash: reviewedSourceDelta === null ? null : sha256(reviewedSourceDelta),
    synchronizedSourceDeltaHash: synchronizedSourceDelta === null ? null : sha256(synchronizedSourceDelta),
    reviewedChangedFileHash: reviewedChangedFileBytes === null ? null : sha256(reviewedChangedFileBytes),
    synchronizedChangedFileHash: synchronizedChangedFileBytes === null ? null : sha256(synchronizedChangedFileBytes),
    reviewedChangedPaths,
    synchronizedChangedPaths,
    currentTruthBinding: {
      parents,
      commitDistance,
      synchronizedTree: observedTree,
      changedPaths: currentTruthBindingChangedPaths
    },
    providerHead: observedHead,
    reviewEvidence
  };
}

const options = args();
if (options.dogfood) {
  const dogfood = readJson("config/assurance/dogfood-pr-a-v1.json");
  const subjects = dogfood.subjects.filter(({ type }) => type === "hot_path_document");
  const findings = [];
  for (const subject of subjects) {
    const facts = subject.facts;
    if (facts.recordedMainSha !== undefined && facts.recordedMainSha !== facts.actualMainSha && facts.recordedMainIsAncestor === false) findings.push({ subject: subject.id, id: "CURRENT_TRUTH_PROTECTED_MAIN_CHECKPOINT_NOT_ANCESTOR", status: "BLOCKED_INTERNAL" });
    if (facts.recordedAndroidBuild !== undefined && facts.recordedAndroidBuild !== facts.actualAndroidBuild) findings.push({ subject: subject.id, id: "ASSURANCE_CURRENT_TRUTH_ARTIFACT_STALE", status: "BLOCKED_INTERNAL", platform: "android" });
    if (facts.recordedIosUpdate !== undefined && facts.recordedIosUpdate !== facts.actualIosUpdate) findings.push({ subject: subject.id, id: "ASSURANCE_CURRENT_TRUTH_ARTIFACT_STALE", status: "BLOCKED_INTERNAL", platform: "ios" });
    if (facts.resolvedProviderBlockerStillActive) findings.push({ subject: subject.id, id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_STALE", status: "BLOCKED_INTERNAL" });
    if (facts.roleStateClaimStale) findings.push({ subject: subject.id, id: "ASSURANCE_CURRENT_TRUTH_ROLE_STALE", status: "BLOCKED_INTERNAL" });
    if (facts.recordedEnabledVisualSwitches !== undefined && facts.recordedEnabledVisualSwitches !== facts.actualEnabledVisualSwitches) findings.push({ subject: subject.id, id: "ASSURANCE_CURRENT_TRUTH_SWITCH_STALE", status: "BLOCKED_INTERNAL" });
    if (facts.nextTaskMismatch) findings.push({ subject: subject.id, id: "ASSURANCE_NEXT_TASK_STALE", status: "BLOCKED_INTERNAL" });
    findings.push({ subject: subject.id, id: "ASSURANCE_CURRENT_TRUTH_STALE", status: "BLOCKED_INTERNAL" });
  }
  emit("assurance:current-truth", false, { mode: "dogfood", detectorPassed: findings.length >= 8, findings }, [`current-truth dogfood: expected FAIL — ${findings.length} stale-truth findings`]);
}
let mode;
if (!options.dogfood) try {
  mode = providerMode(options);
} catch (error) {
  emit("assurance:current-truth", false, { findings: [{ id: error.message, status: "BLOCKED_INTERNAL" }] }, [`current truth: FAIL — ${error.message}`]);
}

if (mode) {
  const record = readJson("config/assurance/current-truth-v1.json");
  const expectedDocs = { "CURRENT_STATE.md": renderCurrentState(record), "NEXT_TASK.md": renderNextTask(record) };
  if (options.writeDocs) for (const [file, body] of Object.entries(expectedDocs)) fs.writeFileSync(rel(file), body);
  const branch = git(["branch", "--show-current"]);
  const remoteMain = git(["rev-parse", "origin/main"]);
  const head = git(["rev-parse", "HEAD"]);
  const currentTruthContract = readJson("config/assurance/current-truth-contract-v1.json");
  const now = options.now ? new Date(options.now) : new Date();
  const observedImplementationRefs = {};
  const implementationEntries = Array.isArray(record.openImplementationPrs) ? record.openImplementationPrs : [];
  for (const entry of implementationEntries) {
    if (!isValidGitBranchName(entry?.branch)) continue;
    const ref = implementationRemoteRef(entry.branch);
    try {
      observedImplementationRefs[ref] = git(["show-ref", "--verify", "--hash", ref]);
    } catch {
      observedImplementationRefs[ref] = null;
    }
  }
  const baseSynchronizationReviewEvidence = collectBaseSynchronizationReviewEvidence(record.openReviewOnlyPrs);
  const baseSynchronizations = {};
  for (const entry of implementationEntries) {
    if (!isValidGitBranchName(entry?.branch)) continue;
    const ref = implementationRemoteRef(entry.branch);
    const observedHead = observedImplementationRefs[ref];
    if (!observedHead || observedHead === entry.head) continue;
    baseSynchronizations[ref] = inspectBaseSynchronization({
      entry,
      observedHead,
      currentMain: remoteMain,
      reviewEvidence: baseSynchronizationReviewEvidence
    });
  }
  const explicitImplementationBranch = typeof options.implementationBranch === "string" ? options.implementationBranch : "";
  const explicitImplementationHead = typeof options.implementationHead === "string" ? options.implementationHead : "";
  const headBindings = verifyCurrentTruthHeadBindings({
    openImplementationPrs: record.openImplementationPrs,
    observedRefs: observedImplementationRefs,
    finiteTaskLeases: record.finiteTaskLeases,
    branch,
    head,
    remoteMain,
    explicitBranch: explicitImplementationBranch,
    explicitHead: explicitImplementationHead,
    baseSynchronizations,
    minimumBaseSynchronizationReviewEvidence: currentTruthContract.implementationHeadBinding.baseSynchronization.minimumReviewEvidence,
    baseSynchronizationReviewFreshnessHours: currentTruthContract.implementationHeadBinding.baseSynchronization.reviewFreshnessHours,
    evaluationTime: now
  });
  const finiteTaskRuntime = evaluateFiniteTaskLeaseRuntime({
    record,
    contract: currentTruthContract,
    now,
    checkoutHead: head,
    currentProtectedBase: remoteMain
  });
  const protectedMainRuntime = evaluateProtectedMainAdvancement({
    record,
    contract: currentTruthContract,
    observedProtectedMainSha: remoteMain,
    candidateHead: finiteTaskRuntime.candidateHead,
    finiteTaskRuntime
  });
  const claimFreshness = finiteTaskRuntime.claimFreshness;
  const taskFreshness = finiteTaskRuntime.leaseFreshness;
  const proofTierStatusFindings = validateProofTierStatuses(
    record.activeTaskBinding,
    readJson("config/assurance/gate-catalog-v1.json"),
    readJson("config/assurance/feature-registry-v1.json")
  );
  const structuredBindingFindings = validateStructuredBinding(
    record.activeTaskBinding,
    readJson("config/assurance/gate-catalog-v1.json"),
    readJson("config/assurance/feature-registry-v1.json"),
    record.openImplementationPrs,
    record.latestMergedImplementationPr
  ).map((id) => ({ id, status: "BLOCKED_INTERNAL" }));
  const completedMergeFindings = verifyCompletedImplementationMergeIdentity({
    activeTaskBinding: record.activeTaskBinding,
    latestMergedImplementationPr: record.latestMergedImplementationPr,
    remoteMain
  });
  const terminalEvidenceFindings = validateTerminalTaskEvidence(
    record.activeTaskBinding,
    record.latestMergedImplementationPr
  );
  const reviewPolicyFindings = optionalCodexReviewPolicyValid(record.reviewPolicy)
    ? []
    : [{ id: "CODEX_REVIEW_OPTIONAL_ADVISORY_POLICY_INVALID", status: "BLOCKED_INTERNAL" }];
  const finiteLeaseFindings = validateFiniteTaskLeaseRegistry(record.finiteTaskLeases)
    .map((id) => ({ id, status: "BLOCKED_INTERNAL" }));
  const runtimeFindings = finiteTaskRuntime.findings.map((id) => ({ id, status: "BLOCKED_INTERNAL" }));
  const protectedMainFindings = protectedMainRuntime.findings.map((id) => ({ id, status: "BLOCKED_INTERNAL" }));
  const engineeringDoctrineFindings = validateEngineeringDoctrineTruth(record, currentTruthContract, { currentMain: remoteMain, implementationMerged: remoteMain !== "8bf6459c3ae1cec62e26a1694f03063e4291b9f8", protectedMainRuntime });
  const taskContextArchitectureFindings = [];
  if (record.engineeringDoctrine?.status === "ACTIVE") {
    const architecture = record.taskContextArchitecture;
    const sha = (value) => /^[0-9a-f]{40}$/u.test(value ?? "");
    const hash = (value) => /^[0-9a-f]{64}$/u.test(value ?? "");
    let mergeAncestor = false;
    try { mergeAncestor = sha(architecture?.mergeSha) && git(["merge-base", "--is-ancestor", architecture.mergeSha, remoteMain]) === ""; } catch {}
    if (architecture?.contractId !== "TYPED_TASK_CONTEXT_AND_TERMINAL_TRUTH_SUCCESSOR_V1"
      || !Number.isInteger(architecture?.architecturePr)
      || !sha(architecture?.sourceHead)
      || !sha(architecture?.sourceTree)
      || !sha(architecture?.mergeSha)
      || !sha(architecture?.mergeTree)
      || !Number.isInteger(architecture?.authorityCommentId)
      || !hash(architecture?.authorityBodyHash)
      || !hash(architecture?.authoritySubjectHash)
      || architecture?.doctrinePr !== 226
      || architecture?.doctrineMerge !== "c1f9ec1f71cc8bc4448afd2327c4341cac309573"
      || architecture?.terminalTransitionConsumed !== true
      || architecture?.pendingTransitionPolicyId !== "PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1"
      || architecture?.pendingTransitionCountAfterSynchronization !== 0
      || architecture?.pendingTransitions?.length !== 2
      || architecture.pendingTransitions[0]?.pr !== 226
      || architecture.pendingTransitions[0]?.mergeSha !== "c1f9ec1f71cc8bc4448afd2327c4341cac309573"
      || architecture.pendingTransitions[0]?.status !== "CONSUMED_BY_THIS_TERMINAL_TRUTH"
      || architecture.pendingTransitions[1]?.pr !== architecture.architecturePr
      || architecture.pendingTransitions[1]?.mergeSha !== architecture.mergeSha
      || architecture.pendingTransitions[1]?.status !== "CONSUMED_BY_THIS_TERMINAL_TRUTH"
      || architecture?.expectedNextTask !== "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE"
      || !hash(architecture?.verificationDependencyClosureHash)
      || !architecture?.authority
      || Object.values(architecture.authority).some((value) => value !== false)
      || !mergeAncestor) taskContextArchitectureFindings.push({ id: "ASSURANCE_TYPED_TASK_CONTEXT_TERMINAL_TRUTH_INVALID", status: "BLOCKED_INTERNAL" });
  }
  const findings = [...headBindings.findings, ...runtimeFindings, ...protectedMainFindings, ...structuredBindingFindings, ...proofTierStatusFindings, ...terminalEvidenceFindings, ...completedMergeFindings, ...reviewPolicyFindings, ...finiteLeaseFindings, ...engineeringDoctrineFindings, ...taskContextArchitectureFindings, ...validateLateReviewSentinelState(record)];
  let providerImplementationSnapshot = null;
  if (record.liveProviderReadback !== claimFreshness.liveProviderReadback) {
    findings.push({
      id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_FRESHNESS_DERIVATION_MISMATCH",
      status: "BLOCKED_INTERNAL",
      recorded: record.liveProviderReadback,
      derived: claimFreshness.liveProviderReadback
    });
  }
  for (const [file, expected] of Object.entries(expectedDocs)) {
    if (readText(file) !== expected) findings.push({ id: "ASSURANCE_CURRENT_TRUTH_DOC_DRIFT", status: "BLOCKED_INTERNAL", file });
  }
  if (record.latestMergedImplementationPr.state !== "merged") findings.push({ id: "ASSURANCE_CURRENT_TRUTH_PR_STATE_STALE", status: "BLOCKED_INTERNAL" });
  if (mode === "read-only") {
    try {
      const snapshot = readJson(options.providerSnapshot ?? options.snapshot);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        const finding = { id: "ASSURANCE_PROVIDER_SNAPSHOT_ROOT_MALFORMED", status: "BLOCKED_INTERNAL" };
        providerImplementationSnapshot = { ok: false, findings: [finding], record: [], snapshot: [] };
        findings.push(finding);
      } else {
        providerImplementationSnapshot = verifyProviderImplementationSnapshot(
          record.openImplementationPrs,
          snapshot.openImplementationPrs,
          headBindings.acceptedBaseSynchronizations
        );
        findings.push(...providerImplementationSnapshot.findings);
        if (snapshot.mainSha !== undefined && snapshot.mainSha !== remoteMain) {
          findings.push({ id: "ASSURANCE_CURRENT_TRUTH_MAINSHA_STALE", status: "BLOCKED_INTERNAL" });
        }
        for (const key of ["latestMergedImplementationPr", "android", "ios", "remoteMigrationHead", "enabledCognitiveSwitches", "enabledSchedules", "effectiveBaselineCount", "blockedProviders"]) {
          if (snapshot[key] !== undefined && JSON.stringify(snapshot[key]) !== JSON.stringify(record[key])) findings.push({ id: `ASSURANCE_CURRENT_TRUTH_${key.toUpperCase()}_STALE`, status: "BLOCKED_INTERNAL" });
        }
      }
    } catch {
      const finding = { id: "ASSURANCE_PROVIDER_SNAPSHOT_READ_FAILED", status: "BLOCKED_INTERNAL" };
      providerImplementationSnapshot = { ok: false, findings: [finding], record: [], snapshot: [] };
      findings.push(finding);
    }
  }
  emit("assurance:current-truth", findings.length === 0, {
    mode, branch, head, remoteMain, recordedMain: record.mainSha, timestamp: record.timestamp, freshnessDeadline: record.freshnessDeadline,
    protectedMainRuntime,
    liveProviderReadback: claimFreshness.liveProviderReadback,
    finiteTaskRuntime: {
      leaseAuthorityEligible: finiteTaskRuntime.leaseAuthorityEligible,
      candidateEligible: finiteTaskRuntime.candidateEligible,
      candidateHead: finiteTaskRuntime.candidateHead,
      candidateTree: finiteTaskRuntime.candidateTree,
      scopeResult: finiteTaskRuntime.scopeResult,
      sourceOnlyEligible: finiteTaskRuntime.sourceOnlyEligible,
      providerDependentEligible: finiteTaskRuntime.providerDependentEligible,
      findings: finiteTaskRuntime.findings
    },
    lateReviewSentinels: (record.lateReviewSentinels ?? []).map(({ classification, prNumber, reviewedSha, successorCorrectionOwner, findings: lateFindings, blocks }) => ({
      classification,
      prNumber,
      reviewedSha,
      successorCorrectionOwner,
      unresolvedFindings: (lateFindings ?? []).filter(({ disposition }) => disposition !== "RESOLVED").length,
      blocks
    })),
    freshnessClaims: {
      current: claimFreshness.currentClaims.map(({ id, freshnessClass, platform }) => ({ id, freshnessClass, platform })),
      blocked: claimFreshness.blockedClaims.map(({ id, freshnessClass, platform, expiresAt }) => ({ id, freshnessClass, platform, expiresAt }))
    },
    taskFreshness,
    generatedDocuments: Object.keys(expectedDocs), headBindings, providerImplementationSnapshot, synchronization: protectedMainRuntime, findings
  }, [`current truth: ${findings.length ? "FAIL" : "PASS"} — authority checkpoint ${record.protectedMainAuthority.checkpointSha.slice(0, 8)}, observed main ${remoteMain.slice(0, 8)}, remote migration ${record.remoteMigrationHead}`]);
}
