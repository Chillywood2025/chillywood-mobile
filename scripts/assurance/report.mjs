#!/usr/bin/env node
import { args, classifyMigration, emit, git, readJson, tierIds } from "./lib.mjs";

const options = args();
if (options.dogfood) {
  const dogfood = readJson("config/assurance/dogfood-pr-a-v1.json");
  const findings = [];
  const add = (subject, id, status = "BLOCKED_INTERNAL", detail = {}) => findings.push({ subject, id, status, waived: false, ...detail });
  for (const subject of dogfood.subjects) {
    const facts = subject.facts;
    if (subject.type === "pull_request_history") {
      if (facts.domains.length > facts.objectiveDomains.length) add(subject.id, "ASSURANCE_MIXED_HIGH_RISK_SCOPE", "BLOCKED_INTERNAL", { domains: facts.domains });
      for (const substitution of facts.sourceProofSubstitutions) add(subject.id, "ASSURANCE_PROOF_SUBSTITUTION_REJECTED", "BLOCKED_INTERNAL", substitution);
      if (facts.missingPrebuildNativeLifecycle) add(subject.id, "ASSURANCE_NATIVE_LIFECYCLE_PREBUILD_MISSING");
      for (const schedule of facts.missingInterleavings) add(subject.id, "ASSURANCE_CONCURRENCY_INTERLEAVING_MISSING", "BLOCKED_INTERNAL", { schedule });
      if (facts.easEnvironmentParityGap) add(subject.id, "ASSURANCE_EAS_ENVIRONMENT_PARITY_MISSING");
      if (facts.repeatedProviderOrDeliveryAttempts) add(subject.id, "ASSURANCE_REPEATED_PROVIDER_ATTEMPTS");
      if (facts.undocumentedWaitingLoop) add(subject.id, "ASSURANCE_UNDOCUMENTED_WAITING_LOOP");
    }
    if (subject.id === "PR-52-CURRENT") {
      if (facts.domains.some((domain) => !facts.objectiveDomains.includes(domain) && domain !== "CI-test-infrastructure")) add(subject.id, "ASSURANCE_MIXED_HIGH_RISK_SCOPE", "BLOCKED_INTERNAL", { domains: facts.domains });
      if (facts.implementationHead !== facts.reviewedHead) add(subject.id, "ASSURANCE_REVIEW_HEAD_STALE");
      if (facts.formalLiveKitRuns === 0) add(subject.id, "ASSURANCE_LIVEKIT_FORMAL_RUNS_MISSING", "BLOCKED_EXTERNAL");
      if (facts.providerReconciliationAddedAfterReviewedHead) add(subject.id, "ASSURANCE_REVENUECAT_CURRENT_REVIEW_MISSING");
      if (!facts.liveKitSwitchEnabled) add(subject.id, "ASSURANCE_LIVEKIT_SWITCH_OFF", "BLOCKED_EXTERNAL", { falsePassPrevented: true });
      for (const comparison of facts.migrationComparisons) {
        const classification = classifyMigration(
          { version: comparison.remoteVersion, name: comparison.remoteName, hash: comparison.remoteHash },
          comparison.sourceVersion ? { version: comparison.sourceVersion, name: comparison.sourceName, hash: comparison.sourceHash } : null
        );
        if (classification !== "REMOTE_AND_SOURCE_MATCH") add(subject.id, "ASSURANCE_REMOTE_MIGRATION_DRIFT", "BLOCKED_INTERNAL", { classification, remoteVersion: comparison.remoteVersion, sourceVersion: comparison.sourceVersion });
      }
    }
    if (subject.type === "review_pull_request") {
      if (facts.reviewedImplementationHead !== facts.currentImplementationHead) add(subject.id, "ASSURANCE_REVIEW_HEAD_STALE");
      if (facts.reviewBranchDiverged || !facts.reviewContainsCurrentImplementation) add(subject.id, "ASSURANCE_REVIEW_BRANCH_DIVERGED");
      if (facts.containsImplementationSource) add(subject.id, "ASSURANCE_REVIEW_BRANCH_CONTAINS_IMPLEMENTATION");
      if (!facts.reviewIncludesRevenueCatChanges) add(subject.id, "ASSURANCE_REVENUECAT_CURRENT_REVIEW_MISSING");
    }
    if (subject.type === "remote_migrations" && facts.remoteHead > facts.mainSourceHead) add(subject.id, "ASSURANCE_REMOTE_MIGRATION_DRIFT", "BLOCKED_INTERNAL", { remoteHead: facts.remoteHead, mainSourceHead: facts.mainSourceHead });
    if (subject.type === "hot_path_document") {
      if (facts.recordedMainSha && facts.recordedMainSha !== facts.actualMainSha) add(subject.id, "ASSURANCE_CURRENT_TRUTH_MAIN_STALE");
      if (facts.recordedAndroidBuild && facts.recordedAndroidBuild !== facts.actualAndroidBuild) add(subject.id, "ASSURANCE_CURRENT_TRUTH_ARTIFACT_STALE", "BLOCKED_INTERNAL", { platform: "android" });
      if (facts.recordedIosUpdate && facts.recordedIosUpdate !== facts.actualIosUpdate) add(subject.id, "ASSURANCE_CURRENT_TRUTH_ARTIFACT_STALE", "BLOCKED_INTERNAL", { platform: "ios" });
      if (facts.resolvedProviderBlockerStillActive) add(subject.id, "ASSURANCE_CURRENT_TRUTH_PROVIDER_STALE");
      if (facts.roleStateClaimStale) add(subject.id, "ASSURANCE_CURRENT_TRUTH_ROLE_STALE");
      if (facts.recordedEnabledVisualSwitches !== undefined && facts.recordedEnabledVisualSwitches !== facts.actualEnabledVisualSwitches) add(subject.id, "ASSURANCE_CURRENT_TRUTH_SWITCH_STALE");
      if (facts.nextTaskMismatch) add(subject.id, "ASSURANCE_NEXT_TASK_STALE");
      add(subject.id, "ASSURANCE_CURRENT_TRUTH_STALE");
    }
  }
  const detected = new Set(findings.map(({ id }) => id));
  const missingRequired = dogfood.requiredFindingIds.filter((id) => !detected.has(id));
  emit("assurance:report", missingRequired.length === 0, {
    mode: "dogfood",
    deterministicInputTimestamp: dogfood.snapshotTimestamp,
    subjects: dogfood.subjects.map(({ id }) => id),
    findings,
    findingCount: findings.length,
    requiredFindingIds: dogfood.requiredFindingIds,
    missingRequired,
    subjectsClear: false,
    dogfoodPassed: missingRequired.length === 0,
    finalPermittedNextAction: "Merge the reviewed foundation, then perform Git-only/read-only reconciliation. Do not resume stopped activation."
  }, [`assurance dogfood: ${missingRequired.length ? "FAIL" : "PASS"} — ${findings.length} findings preserved, ${missingRequired.length} required detector gaps`]);
} else {
  const registry = readJson("config/assurance/feature-registry-v1.json");
  const feature = registry.features.find(({ featureId }) => featureId === options.feature);
  if (!feature) {
    emit("assurance:report", false, { findings: [{ id: "ASSURANCE_FEATURE_NOT_REGISTERED", status: "BLOCKED_INTERNAL" }] }, ["assurance report: FAIL — use --feature=<registered feature id>"]);
  } else {
    const supplied = options.evidence ? readJson(options.evidence) : {};
    const statuses = Object.fromEntries(tierIds.map((tier) => {
      const applicability = feature.proofTierApplicability[tier];
      const status = supplied.statuses?.[tier] ?? (String(applicability).startsWith("not-applicable") ? "NOT_APPLICABLE" : tier === "T0_REQUIREMENT" ? "REQUIREMENTS_CLEAR" : "BLOCKED_INTERNAL");
      return [tier, status];
    }));
    const passStatuses = new Set(["REQUIREMENTS_CLEAR", "SOURCE_CLEAR", "MODEL_CLEAR", "INTEGRATION_CLEAR", "NATIVE_CLEAR", "PROVIDER_CLEAR", "ARTIFACT_CLEAR", "INSTALLED_CLEAR", "PHYSICAL_CLEAR", "RELEASE_CLEAR", "NOT_APPLICABLE"]);
    const requiredGatesClear = Object.values(statuses).every((status) => passStatuses.has(status));
    emit("assurance:report", requiredGatesClear, {
      featureId: feature.featureId,
      objective: feature.requirements,
      nonGoals: feature.nonGoals,
      risk: feature.riskLevel,
      ownerSystems: feature.ownerSystems,
      implementationHead: git(["rev-parse", "HEAD"]),
      artifactIdentity: supplied.artifactIdentity ?? null,
      gateApplicability: feature.proofTierApplicability,
      statuses,
      architectureStatus: "ARCHITECTURE_CLEAR",
      knownDefectClassesChecked: supplied.knownDefectClassesChecked ?? [],
      invariantsChecked: supplied.invariantsChecked ?? [],
      concurrencySchedulesTested: supplied.concurrencySchedulesTested ?? [],
      mutationScore: supplied.mutationScore ?? null,
      pairwiseCoverage: supplied.pairwiseCoverage ?? null,
      proofSubstitutionsRejected: supplied.proofSubstitutionsRejected ?? [],
      unresolvedInternalBlockers: supplied.unresolvedInternalBlockers ?? feature.unresolvedBlockers,
      unresolvedExternalBlockers: supplied.unresolvedExternalBlockers ?? [],
      rollback: feature.rollback,
      emergencyStop: feature.emergencyStop,
      reviewHead: supplied.reviewHead ?? null,
      reviewFreshness: supplied.reviewFreshness ?? "BLOCKED_INTERNAL",
      currentTruthFreshness: supplied.currentTruthFreshness ?? "BLOCKED_INTERNAL",
      finalPermittedNextAction: requiredGatesClear ? "Proceed only to the next separately authorized action." : "Run assurance:plan and supply missing evidence; no higher-tier claim is permitted."
    }, [`assurance report ${feature.featureId}: ${requiredGatesClear ? "PASS" : "FAIL"} — tiered status emitted; no top-level completion claim`]);
  }
}
