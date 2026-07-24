#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const constitution = JSON.parse(fs.readFileSync(path.join(root, "config/intelligence/product-experience-constitution.json"), "utf8"));
const runnerConfig = JSON.parse(fs.readFileSync(path.join(root, "config/intelligence/sentinel-installed-runner.config.json"), "utf8"));
const NEW_BINARY_OR_OTA_REQUIRED = runnerConfig.newBinaryOrOtaRequiredStatus;

const allowedModes = new Set(["livekit", "visual", "journey", "self-test"]);
const sensitiveKeyPattern = /(?:password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|secret|jwt|raw[_-]?log|raw[_-]?screenshot|private[_-]?media|tester[_-]?identity|livekit[_-]?token)$/i;
const allowedTokenMetricKeys = new Set(["tokenRequested", "tokenReturned", "tokenIssuedElapsedMs"]);

function parseArgs(argv) {
  const parsed = { mode: "", evidence: "" };
  for (const arg of argv) {
    if (arg.startsWith("--mode=")) parsed.mode = arg.slice("--mode=".length);
    else if (arg === "--mode") parsed.mode = "missing";
    else if (arg.startsWith("--evidence=")) parsed.evidence = arg.slice("--evidence=".length);
    else if (arg === "--evidence") parsed.evidence = "missing";
    else if (allowedModes.has(arg) && !parsed.mode) parsed.mode = arg;
  }
  parsed.mode ||= "self-test";
  return parsed;
}

function failClosed(mode, reason, detail = {}) {
  return {
    ok: false,
    mode,
    resultStatus: "blocked",
    physicalProofStatus: NEW_BINARY_OR_OTA_REQUIRED,
    reason,
    ...detail,
  };
}

function hashPayload(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sanitizeCheck(value, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => sanitizeCheck(entry, [...pathParts, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      if (/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}(?:\.[A-Za-z0-9_-]{8,})?\b/u.test(value)) {
        throw new Error(`unsanitized_jwt_value:${pathParts.join(".")}`);
      }
      if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(value)) {
        throw new Error(`unsanitized_email_value:${pathParts.join(".")}`);
      }
      if (/\b(?:https?|wss?):\/\/[^\s"')]+/iu.test(value)) {
        throw new Error(`unsanitized_url_value:${pathParts.join(".")}`);
      }
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (sensitiveKeyPattern.test(key) && !allowedTokenMetricKeys.has(key)) {
      throw new Error(`unsanitized_sensitive_key:${[...pathParts, key].join(".")}`);
    }
    sanitizeCheck(entry, [...pathParts, key]);
  }
}

function readEvidence(evidencePath, mode) {
  if (!evidencePath || evidencePath === "missing") return null;
  const absolute = path.resolve(root, evidencePath);
  if (!absolute.startsWith(root) && !absolute.startsWith("/tmp/")) {
    throw new Error("evidence_path_must_be_repo_or_tmp");
  }
  const evidence = JSON.parse(fs.readFileSync(absolute, "utf8"));
  sanitizeCheck(evidence);
  return evidence;
}

function requireKeys(evidence, keys) {
  const missing = keys.filter((key) => !(key in evidence));
  if (missing.length > 0) throw new Error(`missing_required_evidence:${missing.join(",")}`);
}

function bool(value) {
  return value === true;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function classifyLiveKit(evidence) {
  const required = runnerConfig.canaries.livekit_experience.requiredInstalledEvidence;
  const timings = runnerConfig.canaries.livekit_experience.requiredTimingMetrics;
  requireKeys(evidence, [...required, ...timings]);
  const missingBoolean = required.filter((key) => typeof evidence[key] !== "boolean");
  if (missingBoolean.length > 0) throw new Error(`livekit_boolean_metric_required:${missingBoolean.join(",")}`);
  const invalidTiming = timings.filter((key) => !finiteNumber(evidence[key]) || evidence[key] < 0 || evidence[key] > 600_000);
  if (invalidTiming.length > 0) throw new Error(`livekit_timing_out_of_bounds:${invalidTiming.join(",")}`);

  const deadlines = constitution.loadingStateDeadlines;
  const pass = required.every((key) => bool(evidence[key]))
    && evidence.tokenIssuedElapsedMs <= deadlines.livekitTokenMs
    && evidence.roomConnectElapsedMs <= deadlines.livekitRoomConnectMs
    && evidence.uiStateResolutionElapsedMs <= deadlines.livekitUiStateResolutionMs
    && evidence.firstRemoteMediaElapsedMs <= deadlines.livekitFirstRemoteMediaMs;

  let suspectedLayer = "unknown";
  if (evidence.tokenReturned && evidence.roomConnected && !evidence.uiExitedConnecting) suspectedLayer = "installed_ui_state";
  else if (evidence.tokenReturned && evidence.roomConnected && !evidence.remoteMediaObserved) suspectedLayer = "remote_media";
  else if (!evidence.tokenReturned) suspectedLayer = "token_boundary";

  return {
    ok: true,
    mode: "livekit",
    sentinelKey: runnerConfig.canaries.livekit_experience.sentinelKey,
    resultStatus: pass ? "passed" : "finding_created",
    physicalProofStatus: "installed_proof_available",
    suspectedLayer,
    evidenceManifestHash: hashPayload(evidence),
  };
}

function classifyVisual(evidence) {
  requireKeys(evidence, runnerConfig.canaries.visual_experience_metrics.requiredInstalledEvidence);
  requireKeys(evidence, runnerConfig.canaries.visual_experience_metrics.requiredMetrics);
  if (!validSha256(evidence.screenshotEvidenceHash)) throw new Error("visual_screenshot_hash_required");
  if (!validSha256(evidence.sourceRuntimeHash)) throw new Error("visual_runtime_hash_required");
  if (!validSha256(evidence.baselineComparisonHash)) throw new Error("visual_baseline_hash_required");
  for (const key of ["cardViewportWidthRatio", "cardViewportHeightRatio", "densityScore", "minimumTouchTargetPt"]) {
    if (!finiteNumber(evidence[key])) throw new Error(`visual_numeric_metric_required:${key}`);
  }
  if (!Number.isInteger(evidence.cardsAboveFold) || evidence.cardsAboveFold < 0) throw new Error("visual_cards_above_fold_invalid");
  if (!Number.isInteger(evidence.titleLineCount) || evidence.titleLineCount < 0) throw new Error("visual_title_line_count_invalid");
  if (!constitution.cardMetrics.acceptedAspectRatios.includes(evidence.aspectRatioClass)) throw new Error("visual_aspect_ratio_not_accepted");

  const deviceClass = String(evidence.deviceClass ?? "").includes("tablet") ? "tablet" : "phone";
  const widthMax = constitution.cardMetrics.maximumCardViewportWidthRatio[deviceClass];
  const heightMax = constitution.cardMetrics.maximumCardViewportHeightRatio[deviceClass];
  const densityOk = evidence.densityScore >= 0 && evidence.densityScore <= 1;
  const cardOk = evidence.cardViewportWidthRatio <= widthMax && evidence.cardViewportHeightRatio <= heightMax;
  const typographyOk = evidence.titleLineCount <= constitution.cardMetrics.maximumTitleLines;
  const touchOk = evidence.minimumTouchTargetPt >= constitution.accessibility.minimumTouchTargetPt;
  const baselineApproved = constitution.status === "approved" && evidence.baselineState === "approved_current";
  const pass = baselineApproved && densityOk && cardOk && typographyOk && touchOk;

  return {
    ok: true,
    mode: "visual",
    sentinelKey: runnerConfig.canaries.visual_experience_metrics.sentinelKey,
    resultStatus: pass ? "passed" : "finding_created",
    physicalProofStatus: "installed_proof_available",
    suspectedLayer: baselineApproved ? (pass ? "none" : "layout_density") : "design_baseline_missing",
    evidenceManifestHash: hashPayload(evidence),
  };
}

function classifyJourney(evidence) {
  requireKeys(evidence, runnerConfig.canaries.installed_journey.requiredInstalledEvidence);
  if (!validSha256(evidence.screenshotEvidenceHash)) throw new Error("journey_screenshot_hash_required");
  if (!validSha256(evidence.sourceRuntimeHash)) throw new Error("journey_runtime_hash_required");
  if (!Number.isInteger(evidence.maxDurationMs) || evidence.maxDurationMs < 1 || evidence.maxDurationMs > 10_000) {
    throw new Error("journey_max_duration_invalid");
  }
  if (!Number.isInteger(evidence.elapsedDurationMs) || evidence.elapsedDurationMs < 0 || evidence.elapsedDurationMs > 600_000) {
    throw new Error("journey_elapsed_duration_invalid");
  }
  if (!Number.isInteger(evidence.journeyStepCount) || evidence.journeyStepCount < 1 || evidence.journeyStepCount > 256) {
    throw new Error("journey_step_count_invalid");
  }
  if (!Number.isInteger(evidence.unresolvedStateCount) || evidence.unresolvedStateCount < 0 || evidence.unresolvedStateCount > evidence.journeyStepCount) {
    throw new Error("journey_unresolved_state_count_invalid");
  }
  const allowedStates = new Set(["success", "loading", "empty", "error", "offline", "permission_blocked", "blocked"]);
  if (!allowedStates.has(evidence.expectedState) || !allowedStates.has(evidence.observedState) || !allowedStates.has(evidence.resultState)) {
    throw new Error("journey_state_invalid");
  }

  const pass = evidence.resultState === "success"
    && evidence.observedState === evidence.expectedState
    && evidence.elapsedDurationMs <= evidence.maxDurationMs
    && evidence.unresolvedStateCount === 0;

  return {
    ok: true,
    mode: "journey",
    sentinelKey: runnerConfig.canaries.installed_journey.sentinelKey,
    resultStatus: pass ? "passed" : "finding_created",
    physicalProofStatus: "installed_proof_available",
    suspectedLayer: pass ? "none" : "installed_journey_state",
    evidenceManifestHash: hashPayload(evidence),
  };
}

function classify(mode, evidence) {
  if (!evidence) return failClosed(mode, "sanitized_installed_evidence_required");
  if (mode === "livekit") return classifyLiveKit(evidence);
  if (mode === "visual") return classifyVisual(evidence);
  if (mode === "journey") return classifyJourney(evidence);
  throw new Error("unsupported_mode");
}

function fixtureHash(seed) {
  return crypto.createHash("sha256").update(seed).digest("hex");
}

function selfTest() {
  const livekitPass = classifyLiveKit({
    roomRequested: true,
    tokenRequested: true,
    tokenReturned: true,
    websocketConnected: true,
    roomConnected: true,
    localTrackPublished: true,
    remoteParticipantObserved: true,
    remoteMediaObserved: true,
    uiExitedConnecting: true,
    backgroundForegroundRecovery: true,
    cleanupDisconnected: true,
    tokenIssuedElapsedMs: 120,
    roomConnectElapsedMs: 900,
    uiStateResolutionElapsedMs: 1100,
    firstRemoteMediaElapsedMs: 1800,
  });
  assert.equal(livekitPass.resultStatus, "passed");

  const visualFinding = classifyVisual({
    screenshotEvidenceHash: fixtureHash("visual-shot"),
    sourceRuntimeHash: fixtureHash("visual-runtime"),
    deviceClass: "phone",
    orientation: "portrait",
    syntheticAccount: true,
    baselineState: "needs_review",
    baselineComparisonHash: fixtureHash("visual-baseline"),
    cardViewportWidthRatio: 0.94,
    cardViewportHeightRatio: 0.5,
    cardsAboveFold: 1,
    densityScore: 0.72,
    aspectRatioClass: "16:9",
    titleLineCount: 2,
    minimumTouchTargetPt: 44,
  });
  assert.equal(visualFinding.resultStatus, "finding_created");
  assert.equal(visualFinding.suspectedLayer, "design_baseline_missing");

  const journeyFinding = classifyJourney({
    journeyName: "home",
    expectedState: "success",
    observedState: "loading",
    maxDurationMs: 3000,
    elapsedDurationMs: 9000,
    resultState: "loading",
    journeyStepCount: 4,
    unresolvedStateCount: 1,
    screenshotEvidenceHash: fixtureHash("journey-shot"),
    sourceRuntimeHash: fixtureHash("journey-runtime"),
  });
  assert.equal(journeyFinding.resultStatus, "finding_created");

  return {
    ok: true,
    mode: "self-test",
    resultStatus: "passed",
    checkedModes: ["livekit", "visual", "journey"],
  };
}

const parsed = parseArgs(process.argv.slice(2));
if (!allowedModes.has(parsed.mode)) {
  console.error(JSON.stringify(failClosed(parsed.mode || "unknown", "unsupported_mode"), null, 2));
  process.exit(2);
}

try {
  const result = parsed.mode === "self-test"
    ? selfTest()
    : classify(parsed.mode, readEvidence(parsed.evidence, parsed.mode));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.resultStatus === "blocked" ? 2 : 0);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    mode: parsed.mode,
    resultStatus: "blocked",
    physicalProofStatus: NEW_BINARY_OR_OTA_REQUIRED,
    reason: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exit(2);
}
