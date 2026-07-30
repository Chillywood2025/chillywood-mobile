#!/usr/bin/env node
import fs from "node:fs";
import {
  args,
  emit,
  git,
  implementationRemoteRef,
  isValidGitBranchName,
  providerMode,
  readJson,
  readText,
  rel,
  renderCurrentState,
  renderNextTask,
  verifyCurrentTruthHeadBindings,
  verifyCurrentTruthSynchronization
} from "./lib.mjs";

const options = args();
if (options.dogfood) {
  const dogfood = readJson("config/assurance/dogfood-pr-a-v1.json");
  const subjects = dogfood.subjects.filter(({ type }) => type === "hot_path_document");
  const findings = [];
  for (const subject of subjects) {
    const facts = subject.facts;
    if (facts.recordedMainSha !== undefined && facts.recordedMainSha !== facts.actualMainSha) findings.push({ subject: subject.id, id: "ASSURANCE_CURRENT_TRUTH_MAIN_STALE", status: "BLOCKED_INTERNAL" });
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
  const mergeBase = git(["merge-base", "HEAD", "origin/main"]);
  const currentTruthContract = readJson("config/assurance/current-truth-contract-v1.json");
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
  const headBindings = verifyCurrentTruthHeadBindings({
    openImplementationPrs: record.openImplementationPrs,
    observedRefs: observedImplementationRefs,
    branch,
    head,
    remoteMain,
    explicitBranch: typeof options.implementationBranch === "string" ? options.implementationBranch : "",
    explicitHead: typeof options.implementationHead === "string" ? options.implementationHead : ""
  });
  const mainParents = git(["show", "-s", "--format=%P", remoteMain]).split(/\s+/u).filter(Boolean);
  const mainChangedPaths = mainParents.length
    ? git(["diff", "--name-only", mainParents[0], remoteMain]).split(/\r?\n/gu).filter(Boolean)
    : [];
  const synchronization = verifyCurrentTruthSynchronization({
    recordedMain: record.mainSha,
    remoteMain,
    parents: mainParents,
    changedPaths: mainChangedPaths,
    requiredChangedPaths: currentTruthContract.synchronizationMerge.requiredChangedPaths,
    allowedChangedPaths: currentTruthContract.synchronizationMerge.allowedChangedPaths,
    bootstrapMerge: currentTruthContract.synchronizationMerge.bootstrapMerge
  });
  const mainMatches = synchronization.ok && (branch === "main" || mergeBase === remoteMain);
  const now = options.now ? new Date(options.now) : new Date();
  const freshnessOk = Number.isFinite(now.valueOf()) && now <= new Date(record.freshnessDeadline) && new Date(record.timestamp) <= new Date(record.freshnessDeadline);
  const findings = [...headBindings.findings];
  if (!mainMatches) findings.push({ id: "ASSURANCE_CURRENT_TRUTH_MAIN_STALE", status: "BLOCKED_INTERNAL", expected: remoteMain, recorded: record.mainSha });
  if (!freshnessOk) findings.push({ id: "ASSURANCE_CURRENT_TRUTH_STALE", status: "BLOCKED_INTERNAL", deadline: record.freshnessDeadline });
  for (const [file, expected] of Object.entries(expectedDocs)) {
    if (readText(file) !== expected) findings.push({ id: "ASSURANCE_CURRENT_TRUTH_DOC_DRIFT", status: "BLOCKED_INTERNAL", file });
  }
  if (record.latestMergedImplementationPr.state !== "merged") findings.push({ id: "ASSURANCE_CURRENT_TRUTH_PR_STATE_STALE", status: "BLOCKED_INTERNAL" });
  if (mode === "read-only") {
    const snapshot = readJson(options.providerSnapshot ?? options.snapshot);
    if (snapshot.mainSha !== undefined && snapshot.mainSha !== remoteMain) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_MAINSHA_STALE", status: "BLOCKED_INTERNAL" });
    }
    for (const key of ["latestMergedImplementationPr", "android", "ios", "remoteMigrationHead", "enabledCognitiveSwitches", "enabledSchedules", "effectiveBaselineCount", "blockedProviders"]) {
      if (snapshot[key] !== undefined && JSON.stringify(snapshot[key]) !== JSON.stringify(record[key])) findings.push({ id: `ASSURANCE_CURRENT_TRUTH_${key.toUpperCase()}_STALE`, status: "BLOCKED_INTERNAL" });
    }
  }
  emit("assurance:current-truth", findings.length === 0, {
    mode, branch, head, remoteMain, recordedMain: record.mainSha, timestamp: record.timestamp, freshnessDeadline: record.freshnessDeadline,
    liveProviderReadback: record.liveProviderReadback, generatedDocuments: Object.keys(expectedDocs), headBindings, synchronization, findings
  }, [`current truth: ${findings.length ? "FAIL" : "PASS"} — main ${record.mainSha.slice(0, 8)}, remote migration ${record.remoteMigrationHead}, deadline ${record.freshnessDeadline}`]);
}
