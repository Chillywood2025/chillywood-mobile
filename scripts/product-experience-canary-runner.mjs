#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const constitution = JSON.parse(fs.readFileSync(path.join(root, "config/intelligence/product-experience-constitution.json"), "utf8"));
const selectedBaseline = JSON.parse(fs.readFileSync(path.join(root, "config/intelligence/chillywood-product-experience-baseline-v1.json"), "utf8"));
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
    classificationAuthority: "preliminary_local_only",
    remoteGovernedFindingMutationAllowed: false,
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

function classifyInteractiveTarget(evidence, platformTarget) {
  if (
    !evidence.accessibilityNamePresent ||
    !evidence.accessibilityRolePresent ||
    evidence.interactiveTargetWidth < platformTarget.applicableMinimum ||
    evidence.interactiveTargetHeight < platformTarget.applicableMinimum
  ) {
    return "accessibility_violation";
  }
  if (
    evidence.interactiveTargetWidth < platformTarget.preferred ||
    evidence.interactiveTargetHeight < platformTarget.preferred
  ) {
    return "product_preference_deviation";
  }
  return "within_platform_and_product_targets";
}

function classifyVisualDeviations(deviations) {
  if (
    deviations.some((deviation) =>
      [
        "interactive_target_below_platform_floor",
        "accessibility_name_missing",
        "accessibility_role_missing",
      ].includes(deviation)
    )
  ) {
    return "accessibility_violation";
  }
  if (
    deviations.length === 1 &&
    deviations[0] === "interactive_target_below_product_preference"
  ) {
    return "product_preference_deviation";
  }
  return deviations.length === 0
    ? "false_positive"
    : "confirmed_baseline_violation";
}

function classifyLiveKit(evidence) {
  const required = runnerConfig.canaries.livekit_experience.requiredInstalledEvidence;
  const timings = runnerConfig.canaries.livekit_experience.requiredTimingMetrics;
  requireKeys(evidence, [...required, ...timings]);
  const booleanMetrics = [
    "roomRequested",
    "tokenRequested",
    "tokenReturned",
    "websocketConnected",
    "roomConnected",
    "localTrackPublished",
    "remoteParticipantObserved",
    "remoteMediaObserved",
    "uiExitedConnecting",
    "backgrounded",
    "foregrounded",
    "cleanupDisconnected",
  ];
  if (
    ![
      "success_baseline",
      "bounded_failure_fixture",
      "background_foreground_recovery",
    ].includes(evidence.scenarioType)
  ) {
    throw new Error("livekit_scenario_type_required");
  }
  if (typeof evidence.backgroundForegroundRecovery !== "boolean") {
    throw new Error("livekit_boolean_metric_required:backgroundForegroundRecovery");
  }
  const missingBoolean = booleanMetrics.filter(
    (key) => typeof evidence[key] !== "boolean",
  );
  if (missingBoolean.length > 0) throw new Error(`livekit_boolean_metric_required:${missingBoolean.join(",")}`);
  const invalidTiming = timings.filter((key) => !finiteNumber(evidence[key]) || evidence[key] < 0 || evidence[key] > 600_000);
  if (invalidTiming.length > 0) throw new Error(`livekit_timing_out_of_bounds:${invalidTiming.join(",")}`);
  for (const key of [
    "roomRunCorrelationHash",
    "installedParticipantIdentityHash",
    "sourceBuildHash",
    "runtimeIdentityHash",
  ]) {
    if (!validSha256(evidence[key])) {
      throw new Error(`livekit_hash_required:${key}`);
    }
  }
  const observationStartedAt = Date.parse(evidence.observationStartedAt);
  const observationFinishedAt = Date.parse(evidence.observationFinishedAt);
  if (
    !Number.isFinite(observationStartedAt) ||
    !Number.isFinite(observationFinishedAt) ||
    observationFinishedAt < observationStartedAt ||
    observationFinishedAt - observationStartedAt > 600_000
  ) {
    throw new Error("livekit_observation_window_invalid");
  }

  const deadlines = constitution.loadingStateDeadlines;
  const stagesHealthy = booleanMetrics
    .filter((key) => !["backgrounded", "foregrounded"].includes(key))
    .every((key) => bool(evidence[key]));
  const timingsHealthy =
    evidence.tokenIssuedElapsedMs <= deadlines.livekitTokenMs
    && evidence.roomConnectElapsedMs <= deadlines.livekitRoomConnectMs
    && evidence.uiStateResolutionElapsedMs <= deadlines.livekitUiStateResolutionMs
    && evidence.firstRemoteMediaElapsedMs <= deadlines.livekitFirstRemoteMediaMs;
  const recoveryStateHealthy =
    evidence.scenarioType === "background_foreground_recovery"
      ? evidence.backgrounded &&
        evidence.foregrounded &&
        evidence.backgroundForegroundRecovery
      : !evidence.backgrounded &&
        !evidence.foregrounded &&
        !evidence.backgroundForegroundRecovery;
  const healthyObservation =
    stagesHealthy && timingsHealthy && recoveryStateHealthy;

  if (evidence.scenarioType === "bounded_failure_fixture") {
    return {
      ok: false,
      mode: "livekit",
      sentinelKey: runnerConfig.canaries.livekit_experience.sentinelKey,
      resultStatus: "blocked",
      physicalProofStatus: "installed_proof_available",
      reason: "livekit_fixture_plan_required",
      evidenceManifestHash: hashPayload(evidence),
      classificationAuthority: "preliminary_local_only",
      remoteGovernedFindingMutationAllowed: false,
    };
  }

  const pass = evidence.scenarioType !== "bounded_failure_fixture" &&
    healthyObservation;

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
    classificationAuthority: "preliminary_local_only",
    remoteGovernedFindingMutationAllowed: false,
  };
}

function classifyVisual(evidence) {
  requireKeys(evidence, runnerConfig.canaries.visual_experience_metrics.requiredInstalledEvidence);
  requireKeys(evidence, runnerConfig.canaries.visual_experience_metrics.requiredMetrics);
  if (!validSha256(evidence.screenshotEvidenceHash)) throw new Error("visual_screenshot_hash_required");
  if (!validSha256(evidence.sourceRuntimeHash)) throw new Error("visual_runtime_hash_required");
  if (
    evidence.baselineComparisonHash !== null &&
    !validSha256(evidence.baselineComparisonHash)
  ) {
    throw new Error("visual_baseline_hash_invalid");
  }
  for (const key of [
    "evidenceQualityHash",
    "componentIdentityHash",
    "routeFamilyMappingHash",
  ]) {
    if (!validSha256(evidence[key])) throw new Error(`visual_hash_required:${key}`);
  }
  if (
    evidence.exceptionContractHash !== null &&
    !validSha256(evidence.exceptionContractHash)
  ) {
    throw new Error("visual_exception_contract_hash_invalid");
  }
  const mapping = selectedBaseline.routeComponentMappings.find(
    (candidate) => candidate.mappingId === evidence.routeFamilyMappingId,
  );
  if (
    !mapping ||
    selectedBaseline.routeComponentMappingHashes[evidence.routeFamilyMappingId] !==
      evidence.routeFamilyMappingHash ||
    mapping.family !== evidence.surfaceFamily
  ) {
    throw new Error("visual_route_family_mapping_contract_mismatch");
  }
  if (
    mapping.exceptionContractId !== evidence.exceptionContractId ||
    (
      mapping.exceptionContractId === null
        ? evidence.exceptionContractHash !== null ||
          evidence.exceptionVersioned !== false
        : selectedBaseline.exceptionContractHashes[mapping.exceptionContractId] !==
            evidence.exceptionContractHash ||
          evidence.exceptionVersioned !== true
    )
  ) {
    throw new Error("visual_exception_contract_mismatch");
  }
  for (const key of [
    "mediaFrameWidth",
    "mediaFrameHeight",
    "totalCardContainerWidth",
    "totalCardContainerHeight",
    "metadataBandHeight",
    "viewportWidth",
    "viewportHeight",
    "cardViewportWidthRatio",
    "cardViewportHeightRatio",
    "horizontalCardsVisible",
    "horizontalMargin",
    "horizontalGap",
    "columnGap",
    "verticalRowGap",
    "columnCount",
    "interactiveTargetWidth",
    "interactiveTargetHeight",
    "interactivePreferredThreshold",
    "interactiveApplicableMinimumThreshold",
  ]) {
    if (!finiteNumber(evidence[key])) throw new Error(`visual_numeric_metric_required:${key}`);
  }
  for (const key of [
    "mediaFrameWidth",
    "mediaFrameHeight",
    "totalCardContainerWidth",
    "totalCardContainerHeight",
    "viewportWidth",
    "viewportHeight",
    "interactiveTargetWidth",
    "interactiveTargetHeight",
  ]) {
    if (evidence[key] <= 0 || evidence[key] > 10_000) {
      throw new Error(`visual_dimension_out_of_bounds:${key}`);
    }
  }
  for (const key of [
    "metadataBandHeight",
    "horizontalMargin",
    "horizontalGap",
    "columnGap",
    "verticalRowGap",
  ]) {
    if (evidence[key] < 0 || evidence[key] > 1_000) {
      throw new Error(`visual_spacing_out_of_bounds:${key}`);
    }
  }
  for (const key of [
    "cardViewportWidthRatio",
    "cardViewportHeightRatio",
  ]) {
    if (evidence[key] < 0 || evidence[key] > 2) {
      throw new Error(`visual_ratio_out_of_bounds:${key}`);
    }
  }
  if (!Number.isInteger(evidence.cardsAboveFold) || evidence.cardsAboveFold < 0) throw new Error("visual_cards_above_fold_invalid");
  if (!Number.isInteger(evidence.titleLineCount) || evidence.titleLineCount < 0) throw new Error("visual_title_line_count_invalid");
  if (!Number.isInteger(evidence.metadataLineCount) || evidence.metadataLineCount < 0) throw new Error("visual_metadata_line_count_invalid");
  if (!Number.isInteger(evidence.columnCount) || evidence.columnCount < 0) throw new Error("visual_column_count_invalid");
  if (!Number.isInteger(evidence.baselineVersion) || evidence.baselineVersion !== 1) throw new Error("visual_baseline_version_invalid");
  for (const key of [
    "creatorIdentityVisible",
    "liveStateVisible",
    "liveContent",
    "accessibilityNamePresent",
    "accessibilityRolePresent",
    "syntheticAccount",
    "exceptionVersioned",
    "interactiveAncestorPresent",
    "interactiveAncestorActuallyInteractive",
    "interactiveAncestorRolePresent",
    "interactiveAncestorClickActionPresent",
    "interactiveAncestorIsTargetContainer",
  ]) {
    if (typeof evidence[key] !== "boolean") throw new Error(`visual_boolean_metric_required:${key}`);
  }
  const allowedFamilies = new Set(Object.keys(selectedBaseline.surfaceFamilies));
  if (!allowedFamilies.has(evidence.surfaceFamily)) throw new Error("visual_surface_family_invalid");
  if (!["android", "ios", "web"].includes(evidence.platform)) throw new Error("visual_platform_invalid");
  if (!["phone", "tablet"].includes(evidence.deviceClass)) throw new Error("visual_device_class_invalid");
  if (!["portrait", "landscape"].includes(evidence.orientation)) throw new Error("visual_orientation_invalid");
  if (!["observed", "partial", "failed", "not_available"].includes(evidence.automationStatus)) throw new Error("visual_automation_status_invalid");
  if (!["healthy", "degraded", "blocked", "unknown", "not_applicable"].includes(evidence.providerState)) throw new Error("visual_provider_state_invalid");
  if (!["loaded", "partial", "empty", "loading", "error", "not_applicable"].includes(evidence.contentState)) throw new Error("visual_content_state_invalid");
  if (!["16:9", "9:16", "4:5", "1:1", "not_applicable"].includes(evidence.aspectRatioClass)) throw new Error("visual_aspect_ratio_not_accepted");
  if (!["option_c_default", "explicit_versioned_exception"].includes(evidence.baselineApplicability)) throw new Error("visual_baseline_applicability_invalid");
  if (!["phone_portrait_390x844", "tablet_portrait_1024x1366", "non_reference"].includes(evidence.referenceViewport)) throw new Error("visual_reference_viewport_invalid");
  if (!["compact", "medium", "expanded"].includes(evidence.windowClass)) throw new Error("visual_window_class_invalid");
  if (!["horizontal_row", "grid", "full_width", "compact_list", "non_media"].includes(evidence.layoutMode)) throw new Error("visual_layout_mode_invalid");
  if (!["measured_installed", "measured_simulator", "bounded_source_only", "insufficient"].includes(evidence.evidenceQuality)) throw new Error("visual_evidence_quality_invalid");
  if (!["needs_product_baseline_review", "approved_baseline"].includes(evidence.baselineState)) throw new Error("visual_baseline_state_invalid");
  if (evidence.baselineId !== selectedBaseline.baselineId) throw new Error("visual_baseline_id_invalid");
  if (!["none", "featured_hero", "vertical_short_form", "compact_media_list", "non_media_surface"].includes(evidence.exceptionType)) throw new Error("visual_exception_type_invalid");
  if (!["first_row", "outside_first_row", "not_applicable"].includes(evidence.featuredPlacement)) throw new Error("visual_featured_placement_invalid");
  if (![
    "within_baseline",
    "confirmed_baseline_violation",
    "product_preference_deviation",
    "accessibility_violation",
    "route_specific_exception",
    "content_data_absence",
    "provider_blocked",
    "automation_failure",
    "baseline_ambiguity",
  ].includes(evidence.observedClassification)) {
    throw new Error("visual_observed_classification_invalid");
  }

  const platformTarget = {
    android: { applicableMinimum: 48, preferred: 48, unit: "dp" },
    ios: { applicableMinimum: 44, preferred: 44, unit: "pt" },
    web: { applicableMinimum: 24, preferred: 44, unit: "css_px" },
  }[evidence.platform];
  if (evidence.measurementUnit !== platformTarget.unit) {
    throw new Error("visual_platform_unit_mismatch");
  }
  if (
    evidence.interactivePreferredThreshold !== platformTarget.preferred ||
    evidence.interactiveApplicableMinimumThreshold !==
      platformTarget.applicableMinimum
  ) {
    throw new Error("visual_platform_threshold_mismatch");
  }
  if (
    evidence.platform === "android" &&
    (
      !finiteNumber(evidence.screenDensityDpi) ||
      evidence.screenDensityDpi < 72 ||
      evidence.screenDensityDpi > 1000
    )
  ) {
    throw new Error("visual_android_density_invalid");
  }
  if (evidence.platform !== "android" && evidence.screenDensityDpi !== null) {
    throw new Error("visual_non_android_density_must_be_null");
  }

  const baseResult = {
    ok: true,
    mode: "visual",
    sentinelKey: runnerConfig.canaries.visual_experience_metrics.sentinelKey,
    physicalProofStatus: "installed_proof_available",
    evidenceManifestHash: hashPayload(evidence),
    classificationAuthority: "preliminary_local_only",
    remoteGovernedFindingMutationAllowed: false,
  };
  if (evidence.evidenceQuality !== "measured_installed") {
    return {
      ...baseResult,
      resultStatus: "blocked",
      suspectedLayer: "unknown",
      classification: "insufficient_evidence",
    };
  }
  if (evidence.automationStatus !== "observed") {
    return {
      ...baseResult,
      resultStatus: "blocked",
      suspectedLayer: "automation",
      classification: "automation_failure",
    };
  }
  const interactiveTargetClassification = classifyInteractiveTarget(
    evidence,
    platformTarget,
  );
  if (interactiveTargetClassification === "accessibility_violation") {
    return {
      ...baseResult,
      resultStatus: "finding_created",
      suspectedLayer: "accessibility",
      classification: "accessibility_violation",
      deviationCount: [
        evidence.interactiveTargetWidth < platformTarget.applicableMinimum ||
          evidence.interactiveTargetHeight < platformTarget.applicableMinimum,
        !evidence.accessibilityNamePresent,
        !evidence.accessibilityRolePresent,
      ].filter(Boolean).length,
    };
  }
  if (evidence.providerState === "blocked") {
    return {
      ...baseResult,
      resultStatus: "blocked",
      suspectedLayer: "provider_degradation",
      classification: "provider_block",
    };
  }
  if (evidence.contentState === "empty") {
    return {
      ...baseResult,
      resultStatus: "blocked",
      suspectedLayer: "empty_error_offline",
      classification: "content_data_absence",
    };
  }
  const baselineApproved =
    constitution.status === "owner_approved" &&
    constitution.ownerApprovalVersion !== null &&
    constitution.approvedBaselineHash === selectedBaseline.baselineHash &&
    evidence.baselineState === "approved_baseline" &&
    evidence.baselineComparisonHash === selectedBaseline.baselineHash;
  if (!baselineApproved) {
    return {
      ...baseResult,
      resultStatus: "blocked",
      suspectedLayer: "layout_density",
      classification: "baseline_ambiguity",
    };
  }

  const optionCTargetFamilies = new Set([
    "standard_streaming_card",
    "live_streaming_card",
    "creator_streaming_card",
  ]);
  if (!optionCTargetFamilies.has(evidence.surfaceFamily)) {
    const explicitException =
      evidence.baselineApplicability === "explicit_versioned_exception" &&
      evidence.exceptionVersioned &&
      evidence.exceptionType !== "none" &&
      validSha256(evidence.exceptionContractHash) &&
      (
        evidence.surfaceFamily !== "featured_hero_card" ||
        evidence.featuredPlacement === "first_row"
      );
    return {
      ...baseResult,
      resultStatus: explicitException ? "passed" : "blocked",
      suspectedLayer: explicitException ? "none" : "layout_density",
      classification: explicitException
        ? "route_specific_exception"
        : "baseline_ambiguity",
    };
  }
  if (
    evidence.baselineApplicability !== "option_c_default" ||
    evidence.exceptionVersioned ||
    evidence.exceptionType !== "none" ||
    evidence.exceptionContractHash !== null
  ) {
    return {
      ...baseResult,
      resultStatus: "blocked",
      suspectedLayer: "layout_density",
      classification: "baseline_ambiguity",
    };
  }

  const deviations = [];
  if (interactiveTargetClassification === "accessibility_violation") {
    deviations.push("interactive_target_below_platform_floor");
  }
  if (interactiveTargetClassification === "product_preference_deviation") {
    deviations.push("interactive_target_below_product_preference");
  }
  if (!evidence.accessibilityNamePresent) {
    deviations.push("accessibility_name_missing");
  }
  if (!evidence.accessibilityRolePresent) {
    deviations.push("accessibility_role_missing");
  }
  if (evidence.totalCardContainerWidth < evidence.mediaFrameWidth) {
    deviations.push("container_width_below_media_frame");
  }
  if (evidence.totalCardContainerHeight < evidence.mediaFrameHeight) {
    deviations.push("container_height_below_media_frame");
  }
  const measuredWidthRatio =
    evidence.totalCardContainerWidth / evidence.viewportWidth;
  const measuredHeightRatio =
    evidence.totalCardContainerHeight / evidence.viewportHeight;
  if (Math.abs(measuredWidthRatio - evidence.cardViewportWidthRatio) > 0.02) {
    deviations.push("width_ratio_inconsistent");
  }
  if (Math.abs(measuredHeightRatio - evidence.cardViewportHeightRatio) > 0.02) {
    deviations.push("height_ratio_inconsistent");
  }
  if (evidence.aspectRatioClass !== "16:9") {
    deviations.push("standard_streaming_aspect_ratio");
  }
  if (evidence.titleLineCount > 2) deviations.push("title_line_limit");
  if (evidence.metadataLineCount > 2) deviations.push("metadata_line_limit");
  if (!evidence.creatorIdentityVisible) deviations.push("creator_identity_missing");
  if (
    evidence.surfaceFamily === "live_streaming_card" &&
    !evidence.liveStateVisible
  ) {
    deviations.push("live_state_missing");
  }
  const reference = evidence.deviceClass === "tablet"
    ? selectedBaseline.canonicalMetrics.tabletPortraitStandardStreamingMedia
    : selectedBaseline.canonicalMetrics.phonePortraitStandardStreamingMedia;
  const referenceViewport = evidence.deviceClass === "tablet"
    ? selectedBaseline.referenceViewports.tabletPortrait
    : selectedBaseline.referenceViewports.phonePortrait;
  const atReferenceViewport =
    evidence.referenceViewport !== "non_reference" &&
    evidence.orientation === "portrait" &&
    Math.abs(evidence.viewportWidth - referenceViewport.width) <= 4 &&
    Math.abs(evidence.viewportHeight - referenceViewport.height) <= 4;
  if (
    evidence.referenceViewport ===
      (evidence.deviceClass === "tablet"
        ? "tablet_portrait_1024x1366"
        : "phone_portrait_390x844") &&
    !atReferenceViewport
  ) {
    deviations.push("reference_viewport_mismatch");
  }
  if (atReferenceViewport) {
    const dimensionDelta =
      selectedBaseline.allowedVariance.referenceMediaDimensionLogicalUnits;
    if (Math.abs(evidence.mediaFrameWidth - reference.mediaFrameWidth) > dimensionDelta) {
      deviations.push("reference_media_width");
    }
    if (Math.abs(evidence.mediaFrameHeight - reference.mediaFrameHeight) > dimensionDelta) {
      deviations.push("reference_media_height");
    }
    if (
      evidence.cardsAboveFold <
        reference.expectedCardsVisibleAboveFold.minimum ||
      evidence.cardsAboveFold >
        reference.expectedCardsVisibleAboveFold.maximum
    ) {
      deviations.push("cards_above_fold");
    }
    const expectedHorizontal = evidence.deviceClass === "tablet"
      ? reference.columns
      : reference.horizontalCardsVisiblePerRow;
    if (
      Math.abs(evidence.horizontalCardsVisible - expectedHorizontal) >
        selectedBaseline.allowedVariance.densityDelta
    ) {
      deviations.push("horizontal_cards_visible");
    }
    const expectedHorizontalGap = evidence.deviceClass === "tablet"
      ? reference.columnGap
      : reference.horizontalGap;
    const expectedVerticalGap = evidence.deviceClass === "tablet"
      ? reference.rowGap
      : reference.verticalRowGap;
    if (
      Math.abs(evidence.horizontalGap - expectedHorizontalGap) >
        selectedBaseline.allowedVariance.spacingLogicalUnits
    ) {
      deviations.push("horizontal_gap");
    }
    if (
      Math.abs(evidence.verticalRowGap - expectedVerticalGap) >
        selectedBaseline.allowedVariance.spacingLogicalUnits
    ) {
      deviations.push("vertical_row_gap");
    }
    const expectedMargin = reference.horizontalMargin;
    if (
      Math.abs(evidence.horizontalMargin - expectedMargin) >
        selectedBaseline.allowedVariance.spacingLogicalUnits
    ) {
      deviations.push("horizontal_margin");
    }
    const expectedColumns = evidence.deviceClass === "tablet" ? 3 : 1;
    if (evidence.columnCount !== expectedColumns) {
      deviations.push("column_count");
    }
    if (
      evidence.deviceClass === "tablet" &&
      Math.abs(evidence.columnGap - reference.columnGap) >
        selectedBaseline.allowedVariance.spacingLogicalUnits
    ) {
      deviations.push("column_gap");
    }
  }

  const pass = deviations.length === 0;
  const finalClassification = classifyVisualDeviations(deviations);

  return {
    ...baseResult,
    resultStatus: pass ? "passed" : "finding_created",
    suspectedLayer:
      finalClassification === "false_positive"
        ? "none"
        : finalClassification === "accessibility_violation"
        ? "accessibility"
        : "layout_density",
    classification: finalClassification,
    deviationCount: deviations.length,
    deviationManifestHash: hashPayload(deviations),
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
    classificationAuthority: "preliminary_local_only",
    remoteGovernedFindingMutationAllowed: false,
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
  const livekitEvidence = {
    roomRunCorrelationHash: fixtureHash("livekit-room-run"),
    installedParticipantIdentityHash: fixtureHash("livekit-installed-participant"),
    sourceBuildHash: fixtureHash("livekit-source-build"),
    runtimeIdentityHash: fixtureHash("livekit-runtime"),
    observationStartedAt: "2026-07-24T10:00:00.000Z",
    observationFinishedAt: "2026-07-24T10:00:02.000Z",
    scenarioType: "success_baseline",
    roomRequested: true,
    tokenRequested: true,
    tokenReturned: true,
    websocketConnected: true,
    roomConnected: true,
    localTrackPublished: true,
    remoteParticipantObserved: true,
    remoteMediaObserved: true,
    uiExitedConnecting: true,
    backgrounded: false,
    foregrounded: false,
    backgroundForegroundRecovery: false,
    cleanupDisconnected: true,
    tokenIssuedElapsedMs: 120,
    roomConnectElapsedMs: 900,
    uiStateResolutionElapsedMs: 1100,
    firstRemoteMediaElapsedMs: 1800,
  };
  const livekitPass = classifyLiveKit(livekitEvidence);
  assert.equal(livekitPass.resultStatus, "passed");
  assert.equal(livekitPass.classificationAuthority, "preliminary_local_only");
  assert.equal(livekitPass.remoteGovernedFindingMutationAllowed, false);
  const connectedNativeCameraPlaceholder = classifyLiveKit({
    ...livekitEvidence,
    uiExitedConnecting: false,
  });
  assert.equal(
    connectedNativeCameraPlaceholder.resultStatus,
    "finding_created",
  );
  assert.equal(
    connectedNativeCameraPlaceholder.suspectedLayer,
    "installed_ui_state",
  );
  assert.equal(
    connectedNativeCameraPlaceholder.remoteGovernedFindingMutationAllowed,
    false,
  );
  const healthyFailureFixture = classifyLiveKit({
    ...livekitEvidence,
    scenarioType: "bounded_failure_fixture",
  });
  assert.equal(healthyFailureFixture.resultStatus, "blocked");
  assert.equal(
    healthyFailureFixture.reason,
    "livekit_fixture_plan_required",
  );
  assert.equal(
    healthyFailureFixture.classificationAuthority,
    "preliminary_local_only",
  );
  assert.equal(
    healthyFailureFixture.remoteGovernedFindingMutationAllowed,
    false,
  );

  const visualEvidence = {
    screenshotEvidenceHash: fixtureHash("visual-shot"),
    sourceRuntimeHash: fixtureHash("visual-runtime"),
    platform: "android",
    measurementUnit: "dp",
    deviceClass: "phone",
    orientation: "portrait",
    syntheticAccount: true,
    surfaceFamily: "standard_streaming_card",
    baselineApplicability: "option_c_default",
    referenceViewport: "phone_portrait_390x844",
    windowClass: "compact",
    layoutMode: "horizontal_row",
    baselineState: "needs_product_baseline_review",
    baselineComparisonHash: null,
    baselineId: selectedBaseline.baselineId,
    baselineVersion: 1,
    evidenceQuality: "measured_installed",
    evidenceQualityHash: fixtureHash("visual-quality"),
    componentIdentityHash: fixtureHash("visual-component"),
    routeFamilyMappingId: "home_standard_discovery_rows",
    routeFamilyMappingHash:
      selectedBaseline.routeComponentMappingHashes.home_standard_discovery_rows,
    automationStatus: "observed",
    providerState: "healthy",
    contentState: "loaded",
    observedClassification: "baseline_ambiguity",
    exceptionVersioned: false,
    exceptionType: "none",
    exceptionContractId: null,
    exceptionContractHash: null,
    featuredPlacement: "not_applicable",
    mediaFrameWidth: 252,
    mediaFrameHeight: 142,
    totalCardContainerWidth: 252,
    totalCardContainerHeight: 190,
    metadataBandHeight: 48,
    viewportWidth: 390,
    viewportHeight: 844,
    cardViewportWidthRatio: 252 / 390,
    cardViewportHeightRatio: 190 / 844,
    horizontalCardsVisible: 1.42,
    cardsAboveFold: 3,
    aspectRatioClass: "16:9",
    horizontalMargin: 16,
    horizontalGap: 12,
    columnGap: 12,
    verticalRowGap: 20,
    columnCount: 1,
    creatorIdentityVisible: true,
    liveStateVisible: false,
    liveContent: false,
    titleLineCount: 2,
    metadataLineCount: 2,
    interactiveTargetWidth: 48,
    interactiveTargetHeight: 48,
    interactivePreferredThreshold: 48,
    interactiveApplicableMinimumThreshold: 48,
    interactiveAncestorPresent: false,
    interactiveAncestorWidth: null,
    interactiveAncestorHeight: null,
    interactiveAncestorActuallyInteractive: false,
    interactiveAncestorRolePresent: false,
    interactiveAncestorClickActionPresent: false,
    interactiveAncestorIsTargetContainer: false,
    accessibilityNamePresent: true,
    accessibilityRolePresent: true,
    screenDensityDpi: 420,
  };
  const visualPendingApproval = classifyVisual(visualEvidence);
  assert.equal(visualPendingApproval.resultStatus, "blocked");
  assert.equal(visualPendingApproval.classification, "baseline_ambiguity");
  const visualAccessibilityFinding = classifyVisual({
    ...visualEvidence,
    interactiveTargetHeight: 23.24,
    observedClassification: "accessibility_violation",
  });
  assert.equal(visualAccessibilityFinding.resultStatus, "finding_created");
  assert.equal(
    visualAccessibilityFinding.classification,
    "accessibility_violation",
  );
  assert.equal(
    classifyInteractiveTarget(
      {
        ...visualEvidence,
        interactiveTargetHeight: 47.99,
      },
      { applicableMinimum: 48, preferred: 48 },
    ),
    "accessibility_violation",
  );
  assert.equal(
    classifyInteractiveTarget(
      {
        ...visualEvidence,
        interactiveTargetHeight: 43.99,
      },
      { applicableMinimum: 44, preferred: 44 },
    ),
    "accessibility_violation",
  );
  assert.equal(
    classifyInteractiveTarget(
      {
        ...visualEvidence,
        interactiveTargetHeight: 23.99,
      },
      { applicableMinimum: 24, preferred: 44 },
    ),
    "accessibility_violation",
  );
  assert.equal(
    classifyInteractiveTarget(
      {
        ...visualEvidence,
        interactiveTargetWidth: 30,
        interactiveTargetHeight: 30,
      },
      { applicableMinimum: 24, preferred: 44 },
    ),
    "product_preference_deviation",
  );
  assert.equal(
    classifyVisualDeviations([
      "interactive_target_below_product_preference",
    ]),
    "product_preference_deviation",
  );
  assert.equal(
    classifyVisualDeviations([
      "interactive_target_below_product_preference",
      "media_frame_width",
    ]),
    "confirmed_baseline_violation",
  );
  assert.equal(
    classifyInteractiveTarget(
      {
        ...visualEvidence,
        accessibilityNamePresent: false,
      },
      { applicableMinimum: 24, preferred: 44 },
    ),
    "accessibility_violation",
  );
  const webPreferencePendingApproval = classifyVisual({
    ...visualEvidence,
    platform: "web",
    measurementUnit: "css_px",
    screenDensityDpi: null,
    interactiveTargetWidth: 30,
    interactiveTargetHeight: 30,
    interactivePreferredThreshold: 44,
    interactiveApplicableMinimumThreshold: 24,
    observedClassification: "baseline_ambiguity",
  });
  assert.equal(webPreferencePendingApproval.resultStatus, "blocked");
  assert.equal(webPreferencePendingApproval.classification, "baseline_ambiguity");
  assert.equal(
    webPreferencePendingApproval.classificationAuthority,
    "preliminary_local_only",
  );
  assert.equal(
    webPreferencePendingApproval.remoteGovernedFindingMutationAllowed,
    false,
  );
  const webWcagFinding = classifyVisual({
    ...visualEvidence,
    platform: "web",
    measurementUnit: "css_px",
    screenDensityDpi: null,
    interactiveTargetWidth: 23.99,
    interactiveTargetHeight: 23.99,
    interactivePreferredThreshold: 44,
    interactiveApplicableMinimumThreshold: 24,
    observedClassification: "accessibility_violation",
  });
  assert.equal(webWcagFinding.resultStatus, "finding_created");
  assert.equal(webWcagFinding.classification, "accessibility_violation");
  const iosTargetFinding = classifyVisual({
    ...visualEvidence,
    platform: "ios",
    measurementUnit: "pt",
    screenDensityDpi: null,
    interactiveTargetWidth: 44,
    interactiveTargetHeight: 43.99,
    interactivePreferredThreshold: 44,
    interactiveApplicableMinimumThreshold: 44,
    observedClassification: "accessibility_violation",
  });
  assert.equal(iosTargetFinding.resultStatus, "finding_created");
  assert.equal(iosTargetFinding.classification, "accessibility_violation");
  const missingAccessibleNameFinding = classifyVisual({
    ...visualEvidence,
    platform: "web",
    measurementUnit: "css_px",
    screenDensityDpi: null,
    interactiveTargetWidth: 44,
    interactiveTargetHeight: 44,
    interactivePreferredThreshold: 44,
    interactiveApplicableMinimumThreshold: 24,
    accessibilityNamePresent: false,
    observedClassification: "accessibility_violation",
  });
  assert.equal(missingAccessibleNameFinding.resultStatus, "finding_created");
  assert.equal(
    missingAccessibleNameFinding.classification,
    "accessibility_violation",
  );

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
  assert.equal(
    journeyFinding.classificationAuthority,
    "preliminary_local_only",
  );
  assert.equal(journeyFinding.remoteGovernedFindingMutationAllowed, false);

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
    classificationAuthority: "preliminary_local_only",
    remoteGovernedFindingMutationAllowed: false,
    reason: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exit(2);
}
