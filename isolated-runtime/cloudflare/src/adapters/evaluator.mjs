import productBaselineJson from "../../../../config/intelligence/chillywood-product-experience-baseline-v1.json" with {
  type: "json",
};
import { hashJson, sha256Hex } from "../contracts.mjs";
import { ready } from "./helpers.mjs";

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const SERVICE_IDENTITY = "cognitive_product_quality_evaluator";
export const APPROVED_OPTION_C_BASELINE_HASH =
  "34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba";
const PLATFORM_UNITS = Object.freeze({
  android: "dp",
  ios: "pt",
  web: "css_px",
});
const SURFACE_FAMILIES = new Set([
  "standard_streaming_card",
  "live_streaming_card",
  "creator_streaming_card",
  "featured_hero_card",
  "vertical_post_card",
  "compact_media_list_item",
  "non_media_interactive_surface",
]);
const ROUTE_MAPPINGS = new Map(
  productBaselineJson.routeComponentMappings.map((mapping) => [
    mapping.mappingId,
    mapping,
  ]),
);
const ROUTE_MAPPING_HASHES = productBaselineJson.routeComponentMappingHashes;
const EXCEPTION_CONTRACT_HASHES = productBaselineJson.exceptionContractHashes;
const BASELINE_VARIANCE = productBaselineJson.allowedVariance;
const OPTION_C_TARGET_FAMILIES = new Set([
  "standard_streaming_card",
  "live_streaming_card",
  "creator_streaming_card",
]);
const VERSIONED_EXCEPTION_FAMILIES = new Set([
  "featured_hero_card",
  "vertical_post_card",
]);
const DETECTION_KEYS = Object.freeze([
  "action",
  "affectedComponentsHash",
  "buildRuntimeHash",
  "confidence",
  "evidenceHashes",
  "findingClass",
  "physicalProofStatus",
  "proposedNextInvestigationHash",
  "providerBackendStateHash",
  "reproductionState",
  "routeOrSurface",
  "sentinelRunId",
  "severity",
  "suspectedLayer",
  "userImpactHash",
]);
const RESOLUTION_KEYS = Object.freeze([
  "action",
  "findingId",
  "resolutionReasonHash",
  "sentinelRunId",
]);
const FINDING_CLASS = /^[a-z0-9][a-z0-9._-]{2,80}$/u;
const SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);
const REPRODUCTION_STATES = new Set([
  "confirmed_defect",
  "likely_defect",
  "design_baseline_missing",
  "provider_blocked",
  "device_unavailable",
]);
const SUSPECTED_LAYERS = new Set([
  "backend_token",
  "websocket",
  "ice_turn",
  "media_publish",
  "media_subscribe",
  "installed_ui_state",
  "react_state",
  "permission",
  "provider_degradation",
  "layout_density",
  "route_navigation",
  "loading_state",
  "empty_error_offline",
  "platform_drift",
  "unknown",
]);
const PHYSICAL_PROOF_STATUSES = new Set([
  "installed_ui_observed",
  "simulator_observed",
  "source_only",
  "provider_blocked",
  "device_unavailable",
  "new_binary_or_ota_required",
]);
const LIVEKIT_MAX_TIMING_MS = 600_000;
const LIVEKIT_MAX_OBSERVATION_WINDOW_MS = 120_000;
const LIVEKIT_BOOLEAN_METRICS = Object.freeze([
  "backgroundForegroundRecovery",
  "backgrounded",
  "buildRuntimeMatched",
  "cleanupDisconnected",
  "connectingResolved",
  "firstAudioVideoObserved",
  "foregrounded",
  "headlessParticipantUsed",
  "iceCheckingObserved",
  "iceGatheringObserved",
  "installedUiObserved",
  "localTrackPublished",
  "participantIdentityDistinct",
  "peerConnectionEstablished",
  "remoteParticipantJoined",
  "remoteTrackSubscribed",
  "roomConnected",
  "tokenRequestStarted",
  "tokenRequested",
  "tokenReturned",
  "tokenClaimsValidated",
  "websocketConnected",
]);
const LIVEKIT_TIMING_METRICS = Object.freeze([
  "firstRemoteMediaElapsedMs",
  "roomConnectElapsedMs",
  "tokenIssuedElapsedMs",
  "uiStateResolutionElapsedMs",
]);
const LIVEKIT_METRIC_KEYS = Object.freeze([
  ...LIVEKIT_BOOLEAN_METRICS,
  ...LIVEKIT_TIMING_METRICS,
  "headlessObservationFinishedAt",
  "headlessObservationStartedAt",
  "headlessParticipantIdentityHash",
  "iceState",
  "installedUiEvidenceHash",
  "installedObservationFinishedAt",
  "installedObservationStartedAt",
  "installedParticipantIdentityHash",
  "installedRuntimeIdentityHash",
  "installedRoomRunCorrelationHash",
  "installedSourceBuildHash",
  "localMediaSource",
  "networkState",
  "permissionState",
  "providerState",
  "remoteMediaKind",
  "roomRunCorrelationHash",
  "stageFailureCategory",
  "tokenResultStatus",
]);
const LIVEKIT_ICE_STATES = new Set([
  "new",
  "checking",
  "connected",
  "completed",
  "failed",
  "disconnected",
  "closed",
  "unknown",
]);
const LIVEKIT_LOCAL_MEDIA_SOURCES = new Set([
  "test_tone",
  "silent_audio",
  "color_bars",
  "none",
]);
const LIVEKIT_NETWORK_STATES = new Set(["ready", "interrupted", "unknown"]);
const LIVEKIT_PERMISSION_STATES = new Set([
  "granted",
  "denied",
  "unknown",
  "not_applicable",
]);
const LIVEKIT_PROVIDER_STATES = new Set([
  "healthy",
  "degraded",
  "blocked",
  "unknown",
]);
const LIVEKIT_REMOTE_MEDIA_KINDS = new Set([
  "audio",
  "video",
  "audio_video",
  "none",
]);
const LIVEKIT_TOKEN_RESULT_STATES = new Set([
  "success",
  "denied",
  "error",
  "timeout",
  "not_attempted",
]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
};

const text = (value) => typeof value === "string" ? value.trim() : "";
const metricObject = (run) => {
  const metrics = run?.metric_manifest?.metrics;
  return isRecord(metrics) ? metrics : null;
};
const metricNumber = (metrics, key) => {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
const finiteMetric = (metrics, key, minimum = 0, maximum = 10_000) => {
  const value = metricNumber(metrics, key);
  return value !== null && value >= minimum && value <= maximum ? value : null;
};
const assessment = (classification, profile = null) =>
  Object.freeze({ classification, profile });
const profile = (
  findingClass,
  suspectedLayer,
  severity,
  confidence,
  reproductionState = "confirmed_defect",
) =>
  Object.freeze({
    confidence,
    findingClass,
    reproductionState,
    severity,
    suspectedLayer,
  });
const findingProfile = (findingClass, severity) =>
  profile(findingClass, "layout_density", severity, 1);

const baselineBindingIsValid = (metrics) => {
  const mappingId = text(metrics.routeFamilyMappingId);
  const mapping = ROUTE_MAPPINGS.get(mappingId);
  if (
    !mapping ||
    text(metrics.routeFamilyMappingHash) !== ROUTE_MAPPING_HASHES[mappingId] ||
    text(metrics.surfaceFamily) !== mapping.family
  ) {
    return false;
  }
  if (mapping.exceptionContractId === null) {
    return metrics.exceptionContractId === null &&
      metrics.exceptionContractHash === null &&
      metrics.exceptionVersioned === false;
  }
  return text(metrics.exceptionContractId) === mapping.exceptionContractId &&
    text(metrics.exceptionContractHash) ===
      EXCEPTION_CONTRACT_HASHES[mapping.exceptionContractId] &&
    metrics.exceptionVersioned === true;
};

const approximately = (value, expected, tolerance) =>
  Math.abs(value - expected) <= tolerance;

const integerMetric = (metrics, key, minimum, maximum) => {
  const value = finiteMetric(metrics, key, minimum, maximum);
  return value !== null && Number.isInteger(value) ? value : null;
};

const visualFinding = (findingClass, severity) =>
  assessment(
    "confirmed_baseline_violation",
    findingProfile(findingClass, severity),
  );

const accessibilityFinding = (findingClass, severity) =>
  assessment(
    "accessibility_violation",
    findingProfile(findingClass, severity),
  );

export const deterministicVisualClassification = (
  run,
  context = Object.freeze({
    approvedVisualBaselineCount: 0,
    approvedVisualBaselineHash: null,
  }),
) => {
  const metrics = metricObject(run);
  if (!metrics) return assessment("insufficient_evidence");
  const observedClassification = text(metrics.observedClassification);
  const expectedObserved = Object.freeze({
    accessibility_violation: "accessibility_violation",
    automation_failure: "automation_failure",
    baseline_ambiguity: "baseline_ambiguity",
    confirmed_baseline_violation: "confirmed_baseline_violation",
    content_data_absent: "content_data_absence",
    false_positive: "within_baseline",
    provider_blocked: "provider_blocked",
    route_specific_exception: "route_specific_exception",
  });
  const conclude = (result) => {
    const expected = expectedObserved[result.classification];
    const observedMatches = result.classification ===
        "confirmed_baseline_violation"
      ? [
        "confirmed_baseline_violation",
        "product_preference_deviation",
      ].includes(observedClassification)
      : observedClassification === expected;
    return !expected || observedMatches
      ? result
      : assessment("baseline_ambiguity");
  };
  if (["failed", "not_available"].includes(text(metrics.automationStatus))) {
    return conclude(assessment("automation_failure"));
  }
  if (text(metrics.automationStatus) !== "observed") {
    return assessment("insufficient_evidence");
  }
  const expectedQuality = run.physical_proof_status === "installed_ui_observed"
    ? "measured_installed"
    : run.physical_proof_status === "simulator_observed"
    ? "measured_simulator"
    : "";
  if (
    text(metrics.evidenceQuality) !== expectedQuality ||
    !HASH.test(text(metrics.evidenceQualityHash))
  ) {
    return assessment("insufficient_evidence");
  }
  if (text(metrics.providerState) === "blocked") {
    return conclude(assessment("provider_blocked"));
  }
  if (["empty", "error"].includes(text(metrics.contentState))) {
    return conclude(assessment("content_data_absent"));
  }
  if (
    !["healthy", "degraded", "not_applicable"].includes(
      text(metrics.providerState),
    ) ||
    !["loaded", "partial", "not_applicable"].includes(
      text(metrics.contentState),
    )
  ) {
    return assessment("insufficient_evidence");
  }
  if (
    text(metrics.baselineState) !== "approved_baseline" ||
    context.approvedVisualBaselineCount !== 1 ||
    context.approvedVisualBaselineHash !== APPROVED_OPTION_C_BASELINE_HASH ||
    text(metrics.baselineComparisonHash) !== APPROVED_OPTION_C_BASELINE_HASH ||
    text(metrics.baselineId) !==
      "chillywood-product-experience-baseline-v1" ||
    metricNumber(metrics, "baselineVersion") !== 1
  ) {
    return conclude(assessment("baseline_ambiguity"));
  }
  const platform = text(metrics.platform);
  const family = text(metrics.surfaceFamily);
  const preferred = run.platform === "android" ? 48 : 44;
  const applicable = run.platform === "web" ? 24 : preferred;
  if (
    platform !== run.platform ||
    text(metrics.measurementUnit) !== PLATFORM_UNITS[run.platform] ||
    !SURFACE_FAMILIES.has(family) ||
    !HASH.test(text(metrics.componentIdentityHash)) ||
    !HASH.test(text(metrics.routeFamilyMappingHash)) ||
    !baselineBindingIsValid(metrics) ||
    metricNumber(metrics, "interactivePreferredThreshold") !== preferred ||
    metricNumber(metrics, "interactiveApplicableMinimumThreshold") !==
      applicable
  ) {
    return conclude(assessment("baseline_ambiguity"));
  }
  if (
    !["portrait", "landscape"].includes(text(metrics.orientation)) ||
    !["compact", "medium", "expanded"].includes(text(metrics.windowClass)) ||
    ![
      "horizontal_row",
      "grid",
      "full_width",
      "compact_list",
      "non_media",
    ].includes(text(metrics.layoutMode)) ||
    ![
      "phone_portrait_390x844",
      "tablet_portrait_1024x1366",
      "non_reference",
    ].includes(text(metrics.referenceViewport)) ||
    !["option_c_default", "explicit_versioned_exception"].includes(
      text(metrics.baselineApplicability),
    ) ||
    !["16:9", "9:16", "4:5", "1:1", "not_applicable"].includes(
      text(metrics.aspectRatioClass),
    ) ||
    typeof metrics.creatorIdentityVisible !== "boolean" ||
    typeof metrics.liveStateVisible !== "boolean" ||
    typeof metrics.liveContent !== "boolean"
  ) {
    return assessment("insufficient_evidence");
  }
  const density = metrics.screenDensityDpi;
  if (
    (
      run.platform === "android" &&
      (
        typeof density !== "number" ||
        !Number.isFinite(density) ||
        density < 72 ||
        density > 1_000
      )
    ) ||
    (run.platform !== "android" && density !== null)
  ) {
    return conclude(assessment("baseline_ambiguity"));
  }
  const targetWidth = finiteMetric(metrics, "interactiveTargetWidth");
  const targetHeight = finiteMetric(metrics, "interactiveTargetHeight");
  if (targetWidth === null || targetHeight === null) {
    return assessment("insufficient_evidence");
  }
  if (
    typeof metrics.accessibilityNamePresent !== "boolean" ||
    typeof metrics.accessibilityRolePresent !== "boolean"
  ) {
    return assessment("insufficient_evidence");
  }
  if (
    metrics.accessibilityNamePresent !== true ||
    metrics.accessibilityRolePresent !== true
  ) {
    return conclude(
      assessment(
        "accessibility_violation",
        profile(
          "visual_accessibility_name_or_role_missing",
          "installed_ui_state",
          "medium",
          1,
        ),
      ),
    );
  }
  const minimumTarget = Math.min(targetWidth, targetHeight);
  if (run.platform === "android" && minimumTarget < 48) {
    return conclude(
      accessibilityFinding("android_touch_target_below_48dp", "medium"),
    );
  }
  if (run.platform === "ios" && minimumTarget < 44) {
    return conclude(
      accessibilityFinding("ios_touch_target_below_44pt", "medium"),
    );
  }
  if (run.platform === "web" && minimumTarget < 24) {
    return conclude(
      accessibilityFinding("web_touch_target_below_wcag_24csspx", "medium"),
    );
  }
  if (run.platform === "web" && minimumTarget < 44) {
    return conclude(
      visualFinding(
        "web_touch_target_below_preferred_44csspx",
        "low",
      ),
    );
  }

  const mediaWidth = finiteMetric(metrics, "mediaFrameWidth");
  const mediaHeight = finiteMetric(metrics, "mediaFrameHeight");
  const containerWidth = finiteMetric(metrics, "totalCardContainerWidth");
  const containerHeight = finiteMetric(metrics, "totalCardContainerHeight");
  const metadataHeight = finiteMetric(metrics, "metadataBandHeight");
  const viewportWidth = finiteMetric(metrics, "viewportWidth");
  const viewportHeight = finiteMetric(metrics, "viewportHeight");
  const widthRatio = finiteMetric(metrics, "cardViewportWidthRatio", 0, 2);
  const heightRatio = finiteMetric(metrics, "cardViewportHeightRatio", 0, 2);
  if (
    [
      mediaWidth,
      mediaHeight,
      containerWidth,
      containerHeight,
      metadataHeight,
      viewportWidth,
      viewportHeight,
      widthRatio,
      heightRatio,
    ].some((value) => value === null)
  ) {
    return assessment("insufficient_evidence");
  }
  const nonMedia = family === "non_media_interactive_surface";
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    (
      nonMedia &&
      (
        mediaWidth !== 0 ||
        mediaHeight !== 0 ||
        metadataHeight !== 0 ||
        text(metrics.aspectRatioClass) !== "not_applicable"
      )
    ) ||
    (
      !nonMedia &&
      (
        mediaWidth <= 0 ||
        mediaHeight <= 0 ||
        containerWidth < mediaWidth ||
        containerHeight < mediaHeight + metadataHeight
      )
    ) ||
    !approximately(widthRatio, containerWidth / viewportWidth, 0.02) ||
    !approximately(heightRatio, containerHeight / viewportHeight, 0.02)
  ) {
    return conclude(assessment("automation_failure"));
  }
  if (VERSIONED_EXCEPTION_FAMILIES.has(family)) {
    const expectedType = family === "featured_hero_card"
      ? "featured_hero"
      : "vertical_short_form";
    if (
      metrics.exceptionVersioned !== true ||
      text(metrics.baselineApplicability) !== "explicit_versioned_exception" ||
      text(metrics.exceptionType) !== expectedType ||
      !HASH.test(text(metrics.exceptionContractHash))
    ) {
      return conclude(assessment("baseline_ambiguity"));
    }
    if (family === "featured_hero_card") {
      return text(metrics.featuredPlacement) === "first_row"
        ? conclude(assessment("route_specific_exception"))
        : conclude(
          visualFinding("visual_featured_hero_outside_first_row", "medium"),
        );
    }
    const verticalRatio = text(metrics.aspectRatioClass) === "9:16"
      ? 9 / 16
      : text(metrics.aspectRatioClass) === "4:5"
      ? 4 / 5
      : null;
    return verticalRatio !== null &&
        mediaHeight > 0 &&
        Math.abs(mediaWidth / mediaHeight - verticalRatio) <= 0.02
      ? conclude(assessment("route_specific_exception"))
      : conclude(
        visualFinding("visual_vertical_post_aspect_ratio_deviation", "medium"),
      );
  }
  if (
    ["compact_media_list_item", "non_media_interactive_surface"].includes(
      family,
    )
  ) {
    const expectedType = family === "compact_media_list_item"
      ? "compact_media_list"
      : "non_media_surface";
    return metrics.exceptionVersioned === true &&
        text(metrics.baselineApplicability) ===
          "explicit_versioned_exception" &&
        text(metrics.exceptionType) === expectedType &&
        HASH.test(text(metrics.exceptionContractHash)) &&
        text(metrics.featuredPlacement) === "not_applicable"
      ? conclude(assessment("route_specific_exception"))
      : conclude(assessment("baseline_ambiguity"));
  }
  if (
    !OPTION_C_TARGET_FAMILIES.has(family) ||
    metrics.exceptionVersioned !== false ||
    text(metrics.baselineApplicability) !== "option_c_default" ||
    text(metrics.exceptionType) !== "none" ||
    metrics.exceptionContractHash !== null ||
    text(metrics.featuredPlacement) !== "not_applicable"
  ) {
    return conclude(assessment("baseline_ambiguity"));
  }
  const horizontalCardsVisible = finiteMetric(
    metrics,
    "horizontalCardsVisible",
    0,
    100,
  );
  const cardsAboveFold = integerMetric(metrics, "cardsAboveFold", 0, 100);
  const horizontalGap = finiteMetric(metrics, "horizontalGap");
  const verticalRowGap = finiteMetric(metrics, "verticalRowGap");
  const titleLineCount = integerMetric(metrics, "titleLineCount", 0, 20);
  const metadataLineCount = integerMetric(
    metrics,
    "metadataLineCount",
    0,
    20,
  );
  const horizontalMargin = finiteMetric(metrics, "horizontalMargin");
  const columnGap = finiteMetric(metrics, "columnGap");
  const columnCount = integerMetric(metrics, "columnCount", 1, 12);
  if (
    [
      horizontalCardsVisible,
      cardsAboveFold,
      horizontalGap,
      verticalRowGap,
      titleLineCount,
      metadataLineCount,
      horizontalMargin,
      columnGap,
      columnCount,
    ].some((value) => value === null)
  ) {
    return assessment("insufficient_evidence");
  }
  if (metrics.creatorIdentityVisible !== true) {
    return conclude(visualFinding("visual_creator_identity_missing", "medium"));
  }
  if (
    (family === "live_streaming_card" || metrics.liveContent === true) &&
    metrics.liveStateVisible !== true
  ) {
    return conclude(visualFinding("visual_live_state_missing", "medium"));
  }
  if (titleLineCount > 2 || metadataLineCount > 2) {
    return conclude(
      visualFinding("visual_option_c_text_band_deviation", "medium"),
    );
  }
  if (
    text(metrics.aspectRatioClass) !== "16:9" ||
    Math.abs(mediaWidth / mediaHeight - 16 / 9) > 0.02
  ) {
    return conclude(
      visualFinding("visual_option_c_aspect_ratio_deviation", "medium"),
    );
  }
  const reference = text(metrics.referenceViewport);
  const orientation = text(metrics.orientation);
  const windowClass = text(metrics.windowClass);
  const layoutMode = text(metrics.layoutMode);
  if (reference === "phone_portrait_390x844") {
    if (
      viewportWidth !== 390 ||
      viewportHeight !== 844 ||
      orientation !== "portrait" ||
      windowClass !== "compact" ||
      layoutMode !== "horizontal_row" ||
      !approximately(
        mediaWidth,
        252,
        BASELINE_VARIANCE.referenceMediaDimensionLogicalUnits,
      ) ||
      !approximately(
        mediaHeight,
        142,
        BASELINE_VARIANCE.referenceMediaDimensionLogicalUnits,
      ) ||
      !approximately(
        horizontalCardsVisible,
        1.42,
        BASELINE_VARIANCE.densityDelta,
      ) ||
      cardsAboveFold < 3 ||
      cardsAboveFold > 4 ||
      !approximately(
        horizontalMargin,
        16,
        BASELINE_VARIANCE.spacingLogicalUnits,
      ) ||
      !approximately(
        horizontalGap,
        12,
        BASELINE_VARIANCE.spacingLogicalUnits,
      ) ||
      !approximately(
        verticalRowGap,
        20,
        BASELINE_VARIANCE.spacingLogicalUnits,
      ) ||
      columnCount !== 1
    ) {
      return conclude(
        visualFinding("visual_option_c_phone_portrait_deviation", "medium"),
      );
    }
  } else if (reference === "tablet_portrait_1024x1366") {
    if (
      viewportWidth !== 1024 ||
      viewportHeight !== 1366 ||
      orientation !== "portrait" ||
      !["medium", "expanded"].includes(windowClass) ||
      layoutMode !== "grid" ||
      !approximately(
        mediaWidth,
        307,
        BASELINE_VARIANCE.referenceMediaDimensionLogicalUnits,
      ) ||
      !approximately(
        mediaHeight,
        173,
        BASELINE_VARIANCE.referenceMediaDimensionLogicalUnits,
      ) ||
      !approximately(
        horizontalCardsVisible,
        3,
        BASELINE_VARIANCE.densityDelta,
      ) ||
      cardsAboveFold < 6 ||
      cardsAboveFold > 9 ||
      !approximately(
        horizontalMargin,
        32,
        BASELINE_VARIANCE.spacingLogicalUnits,
      ) ||
      !approximately(
        columnGap,
        20,
        BASELINE_VARIANCE.spacingLogicalUnits,
      ) ||
      !approximately(
        verticalRowGap,
        24,
        BASELINE_VARIANCE.spacingLogicalUnits,
      ) ||
      columnCount !== 3
    ) {
      return conclude(
        visualFinding("visual_option_c_tablet_portrait_deviation", "medium"),
      );
    }
  } else if (reference === "non_reference") {
    const responsive = (
      windowClass === "compact" &&
      orientation === "portrait" &&
      layoutMode === "horizontal_row" &&
      columnCount === 1
    ) || (
      windowClass === "compact" &&
      orientation === "landscape" &&
      layoutMode === "grid" &&
      columnCount === 2
    ) || (
      ["medium", "expanded"].includes(windowClass) &&
      layoutMode === "grid" &&
      [3, 4].includes(columnCount)
    );
    if (!responsive) {
      return conclude(
        visualFinding("visual_option_c_responsive_deviation", "medium"),
      );
    }
  } else {
    return conclude(assessment("baseline_ambiguity"));
  }
  return conclude(assessment("false_positive"));
};

export const deterministicTouchTargetClassification = (
  run,
  context = Object.freeze({
    approvedVisualBaselineCount: 0,
    approvedVisualBaselineHash: null,
  }),
) => {
  const metrics = metricObject(run);
  if (!metrics) return assessment("insufficient_evidence");
  if (["failed", "not_available"].includes(text(metrics.automationStatus))) {
    return assessment("automation_failure");
  }
  if (text(metrics.automationStatus) !== "observed") {
    return assessment("insufficient_evidence");
  }
  const expectedEvidenceQuality = run.physical_proof_status ===
      "installed_ui_observed"
    ? "measured_installed"
    : run.physical_proof_status === "simulator_observed"
    ? "measured_simulator"
    : "";
  if (
    text(metrics.evidenceQuality) !== expectedEvidenceQuality ||
    !HASH.test(text(metrics.evidenceQualityHash))
  ) {
    return assessment("insufficient_evidence");
  }
  if (text(metrics.providerState) === "blocked") {
    return assessment("provider_blocked");
  }
  if (["empty", "error"].includes(text(metrics.contentState))) {
    return assessment("content_data_absent");
  }
  if (
    !["healthy", "degraded", "not_applicable"].includes(
      text(metrics.providerState),
    ) ||
    !["loaded", "partial", "not_applicable"].includes(
      text(metrics.contentState),
    )
  ) {
    return assessment("insufficient_evidence");
  }
  const preferred = run.platform === "android" ? 48 : 44;
  const applicable = run.platform === "web" ? 24 : preferred;
  const baselineState = text(metrics.baselineState);
  const baselineValid = baselineState === "needs_product_baseline_review"
    ? metrics.baselineComparisonHash === null
    : baselineState === "approved_baseline" &&
      text(metrics.baselineComparisonHash) === APPROVED_OPTION_C_BASELINE_HASH &&
      context.approvedVisualBaselineCount === 1 &&
      context.approvedVisualBaselineHash === APPROVED_OPTION_C_BASELINE_HASH;
  if (
    text(metrics.platform) !== run.platform ||
    text(metrics.measurementUnit) !== PLATFORM_UNITS[run.platform] ||
    !SURFACE_FAMILIES.has(text(metrics.surfaceFamily)) ||
    metricNumber(metrics, "preferredThreshold") !== preferred ||
    metricNumber(metrics, "applicableMinimumThreshold") !== applicable ||
    text(metrics.baselineId) !==
      "chillywood-product-experience-baseline-v1" ||
    metricNumber(metrics, "baselineVersion") !== 1 ||
    !baselineValid ||
    !HASH.test(text(metrics.componentIdentityHash)) ||
    !HASH.test(text(metrics.routeFamilyMappingHash)) ||
    !baselineBindingIsValid(metrics)
  ) {
    return assessment("baseline_ambiguity");
  }
  const density = metrics.screenDensityDpi;
  if (
    (
      run.platform === "android" &&
      (
        typeof density !== "number" ||
        !Number.isFinite(density) ||
        density < 72 ||
        density > 1_000
      )
    ) ||
    (run.platform !== "android" && density !== null)
  ) {
    return assessment("baseline_ambiguity");
  }
  if (metrics.exceptionVersioned === true) {
    if (
      ![
        "featured_hero",
        "vertical_short_form",
        "compact_media_list",
        "non_media_surface",
      ].includes(text(metrics.exceptionType)) ||
      !HASH.test(text(metrics.exceptionContractHash))
    ) {
      return assessment("baseline_ambiguity");
    }
  } else if (
    metrics.exceptionVersioned !== false ||
    text(metrics.exceptionType) !== "none" ||
    metrics.exceptionContractHash !== null
  ) {
    return assessment("baseline_ambiguity");
  }
  const targetWidth = finiteMetric(metrics, "interactiveTargetWidth");
  const targetHeight = finiteMetric(metrics, "interactiveTargetHeight");
  const booleans = [
    "interactiveAncestorPresent",
    "interactiveAncestorActuallyInteractive",
    "interactiveAncestorRolePresent",
    "interactiveAncestorClickActionPresent",
    "interactiveAncestorIsTargetContainer",
    "isActuallyInteractive",
    "accessibilityNamePresent",
    "accessibilityRolePresent",
  ];
  if (
    targetWidth === null ||
    targetHeight === null ||
    booleans.some((key) => typeof metrics[key] !== "boolean")
  ) {
    return assessment("insufficient_evidence");
  }
  if (metrics.isActuallyInteractive !== true) {
    return text(metrics.targetClassification) === "not_interactive"
      ? assessment("false_positive")
      : assessment("automation_failure");
  }
  let effectiveWidth = targetWidth;
  let effectiveHeight = targetHeight;
  if (metrics.interactiveAncestorPresent === true) {
    const ancestorWidth = finiteMetric(metrics, "interactiveAncestorWidth");
    const ancestorHeight = finiteMetric(metrics, "interactiveAncestorHeight");
    if (
      ancestorWidth === null ||
      ancestorHeight === null ||
      metrics.interactiveAncestorActuallyInteractive !== true ||
      metrics.interactiveAncestorRolePresent !== true ||
      metrics.interactiveAncestorClickActionPresent !== true ||
      metrics.interactiveAncestorIsTargetContainer !== true
    ) {
      return assessment("insufficient_evidence");
    }
    effectiveWidth = ancestorWidth;
    effectiveHeight = ancestorHeight;
  } else if (
    metrics.interactiveAncestorWidth !== null ||
    metrics.interactiveAncestorHeight !== null ||
    metrics.interactiveAncestorActuallyInteractive !== false ||
    metrics.interactiveAncestorRolePresent !== false ||
    metrics.interactiveAncestorClickActionPresent !== false ||
    metrics.interactiveAncestorIsTargetContainer !== false
  ) {
    return assessment("automation_failure");
  }
  const derived = run.platform === "web"
    ? effectiveWidth >= 44 && effectiveHeight >= 44
      ? "meets_platform_preferred"
      : effectiveWidth >= 24 && effectiveHeight >= 24
      ? "meets_wcag_aa_minimum_only"
      : "below_wcag_aa_minimum"
    : effectiveWidth >= preferred && effectiveHeight >= preferred
    ? "meets_platform_minimum"
    : "below_platform_minimum";
  if (text(metrics.targetClassification) !== derived) {
    return assessment("automation_failure");
  }
  if (
    metrics.accessibilityNamePresent !== true ||
    metrics.accessibilityRolePresent !== true
  ) {
    return assessment(
      "accessibility_violation",
      Object.freeze({
        confidence: 1,
        findingClass: "touch_target_accessibility_name_or_role_missing",
        reproductionState: "confirmed_defect",
        severity: "medium",
        suspectedLayer: "installed_ui_state",
      }),
    );
  }
  if (derived === "below_platform_minimum") {
    return assessment(
      "accessibility_violation",
      findingProfile(
        run.platform === "android"
          ? "android_touch_target_below_48dp"
          : "ios_touch_target_below_44pt",
        "medium",
      ),
    );
  }
  if (derived === "below_wcag_aa_minimum") {
    return assessment(
      "accessibility_violation",
      findingProfile("web_touch_target_below_wcag_24csspx", "medium"),
    );
  }
  if (derived === "meets_wcag_aa_minimum_only") {
    return baselineState === "approved_baseline" &&
        text(metrics.baselineComparisonHash) ===
          APPROVED_OPTION_C_BASELINE_HASH &&
        context.approvedVisualBaselineCount === 1 &&
        context.approvedVisualBaselineHash ===
          APPROVED_OPTION_C_BASELINE_HASH
      ? visualFinding("web_touch_target_below_preferred_44csspx", "low")
      : assessment("baseline_ambiguity");
  }
  return assessment("false_positive");
};

const candidateMatchesProfile = (candidate, expected) =>
  candidate.findingClass === expected.findingClass &&
  candidate.suspectedLayer === expected.suspectedLayer &&
  candidate.severity === expected.severity &&
  candidate.confidence === expected.confidence &&
  candidate.reproductionState === expected.reproductionState;

const liveKitProfile = (failureCategory) => {
  const normalizedClass = `livekit_${failureCategory}`.replace(
    /[^a-z0-9._-]/gu,
    "_",
  );
  const byFailure = Object.freeze({
    background_foreground_recovery_failed: [
      "installed_ui_state",
      "high",
      0.99,
    ],
    build_runtime_mismatch: ["platform_drift", "high", 1],
    cleanup_failure: ["installed_ui_state", "medium", 0.99],
    deadline_exceeded: ["loading_state", "medium", 0.99],
    first_media_missing: ["media_subscribe", "high", 0.99],
    ice_turn_failure: ["ice_turn", "high", 0.99],
    installed_ui_connecting_stuck: ["react_state", "high", 0.99],
    local_publish_failure: ["media_publish", "high", 0.99],
    network_interruption: ["websocket", "medium", 0.95],
    permission_failure: ["permission", "medium", 1],
    provider_degradation: ["provider_degradation", "low", 0.95],
    remote_participant_missing: ["media_subscribe", "medium", 0.99],
    remote_subscription_failure: ["media_subscribe", "high", 0.99],
    room_connection_failure: ["websocket", "high", 0.99],
    token_backend_failure: ["backend_token", "high", 0.99],
    websocket_failure: ["websocket", "high", 0.99],
  });
  const expected = byFailure[failureCategory];
  return expected
    ? profile(normalizedClass, expected[0], expected[1], expected[2])
    : null;
};

const canonicalLiveKitTimestamp = (value) => {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
};

const nullableLiveKitHash = (value) =>
  value === null || (typeof value === "string" && HASH.test(value));

const nullableLiveKitTimestamp = (value) =>
  value === null || canonicalLiveKitTimestamp(value) !== null;

const liveKitMetricContractIsValid = (metrics) => {
  if (
    !exactKeys(metrics, LIVEKIT_METRIC_KEYS) ||
    LIVEKIT_BOOLEAN_METRICS.some(
      (key) => typeof metrics[key] !== "boolean",
    ) ||
    LIVEKIT_TIMING_METRICS.some((key) => {
      const value = metrics[key];
      return !Number.isInteger(value) ||
        value < 0 ||
        value > LIVEKIT_MAX_TIMING_MS;
    }) ||
    !LIVEKIT_ICE_STATES.has(metrics.iceState) ||
    !LIVEKIT_LOCAL_MEDIA_SOURCES.has(metrics.localMediaSource) ||
    !LIVEKIT_NETWORK_STATES.has(metrics.networkState) ||
    !LIVEKIT_PERMISSION_STATES.has(metrics.permissionState) ||
    !LIVEKIT_PROVIDER_STATES.has(metrics.providerState) ||
    !LIVEKIT_REMOTE_MEDIA_KINDS.has(metrics.remoteMediaKind) ||
    !LIVEKIT_TOKEN_RESULT_STATES.has(metrics.tokenResultStatus) ||
    !HASH.test(text(metrics.roomRunCorrelationHash)) ||
    !nullableLiveKitHash(metrics.headlessParticipantIdentityHash) ||
    !nullableLiveKitHash(metrics.installedUiEvidenceHash) ||
    !nullableLiveKitHash(metrics.installedParticipantIdentityHash) ||
    !nullableLiveKitHash(metrics.installedRuntimeIdentityHash) ||
    !nullableLiveKitHash(metrics.installedRoomRunCorrelationHash) ||
    !nullableLiveKitHash(metrics.installedSourceBuildHash) ||
    !nullableLiveKitTimestamp(metrics.installedObservationStartedAt) ||
    !nullableLiveKitTimestamp(metrics.installedObservationFinishedAt)
  ) {
    return false;
  }
  const headlessStarted = canonicalLiveKitTimestamp(
    metrics.headlessObservationStartedAt,
  );
  const headlessFinished = canonicalLiveKitTimestamp(
    metrics.headlessObservationFinishedAt,
  );
  const installedStarted = canonicalLiveKitTimestamp(
    metrics.installedObservationStartedAt,
  );
  const installedFinished = canonicalLiveKitTimestamp(
    metrics.installedObservationFinishedAt,
  );
  if (
    headlessStarted === null ||
    headlessFinished === null ||
    headlessStarted > headlessFinished ||
    headlessFinished - headlessStarted >
      LIVEKIT_MAX_OBSERVATION_WINDOW_MS ||
    (
      metrics.installedUiObserved &&
      (
        installedStarted === null ||
        installedFinished === null ||
        installedStarted > installedFinished ||
        installedFinished - installedStarted >
          LIVEKIT_MAX_OBSERVATION_WINDOW_MS
      )
    )
  ) {
    return false;
  }
  const installedBound = metrics.installedUiObserved;
  const identitiesDiffer =
    metrics.headlessParticipantIdentityHash !== null &&
    metrics.installedParticipantIdentityHash !== null &&
    metrics.headlessParticipantIdentityHash !==
      metrics.installedParticipantIdentityHash;
  return (
    installedBound === (metrics.installedUiEvidenceHash !== null) &&
    installedBound === (metrics.installedObservationStartedAt !== null) &&
    installedBound === (metrics.installedObservationFinishedAt !== null) &&
    installedBound === (metrics.installedParticipantIdentityHash !== null) &&
    installedBound === (metrics.installedRuntimeIdentityHash !== null) &&
    installedBound ===
      (metrics.installedRoomRunCorrelationHash !== null) &&
    installedBound === (metrics.installedSourceBuildHash !== null) &&
    (
      !installedBound ||
      metrics.installedRoomRunCorrelationHash ===
        metrics.roomRunCorrelationHash
    ) &&
    metrics.participantIdentityDistinct === identitiesDiffer &&
    (
      !metrics.tokenReturned ||
      (
        metrics.tokenClaimsValidated &&
        metrics.headlessParticipantIdentityHash !== null
      )
    ) &&
    (
      metrics.tokenReturned ||
      (
        !metrics.tokenClaimsValidated &&
        metrics.headlessParticipantIdentityHash === null
      )
    ) &&
    (
      !metrics.tokenReturned ||
      !installedBound ||
      metrics.participantIdentityDistinct
    ) &&
    metrics.firstAudioVideoObserved ===
      (metrics.remoteMediaKind !== "none") &&
    metrics.tokenReturned === (metrics.tokenResultStatus === "success") &&
    metrics.tokenRequested === metrics.tokenRequestStarted &&
    (!metrics.websocketConnected || metrics.tokenReturned) &&
    (!metrics.peerConnectionEstablished || metrics.websocketConnected) &&
    (!metrics.roomConnected || metrics.peerConnectionEstablished) &&
    (!metrics.localTrackPublished || metrics.roomConnected) &&
    (!metrics.remoteParticipantJoined || metrics.roomConnected) &&
    (!metrics.remoteTrackSubscribed || metrics.remoteParticipantJoined) &&
    (!metrics.firstAudioVideoObserved || metrics.remoteTrackSubscribed) &&
    (
      !metrics.backgroundForegroundRecovery ||
      (
        installedBound &&
        metrics.backgrounded &&
        metrics.foregrounded
      )
    )
  );
};

export const deriveIndependentLiveKitFailureCategory = (metrics) => {
  if (!liveKitMetricContractIsValid(metrics)) return null;
  if (metrics.permissionState === "denied") return "permission_failure";
  if (!metrics.buildRuntimeMatched) return "build_runtime_mismatch";
  if (metrics.networkState === "interrupted") return "network_interruption";
  if (!metrics.tokenReturned) return "token_backend_failure";
  if (!metrics.websocketConnected) return "websocket_failure";
  if (["failed", "disconnected", "closed"].includes(metrics.iceState)) {
    return "ice_turn_failure";
  }
  if (!metrics.roomConnected) {
    return metrics.iceCheckingObserved
      ? "ice_turn_failure"
      : "room_connection_failure";
  }
  if (!metrics.localTrackPublished) return "local_publish_failure";
  if (!metrics.remoteParticipantJoined) return "remote_participant_missing";
  if (!metrics.remoteTrackSubscribed) return "remote_subscription_failure";
  if (!metrics.firstAudioVideoObserved) return "first_media_missing";
  if (metrics.installedUiObserved && !metrics.connectingResolved) {
    return "installed_ui_connecting_stuck";
  }
  if (
    metrics.installedUiObserved &&
    (
      !metrics.backgrounded ||
      !metrics.foregrounded ||
      !metrics.backgroundForegroundRecovery
    )
  ) {
    return "background_foreground_recovery_failed";
  }
  if (!metrics.cleanupDisconnected) return "cleanup_failure";
  if (["blocked", "degraded"].includes(metrics.providerState)) {
    return "provider_degradation";
  }
  if (
    metrics.tokenIssuedElapsedMs > 3_000 ||
    metrics.roomConnectElapsedMs > 12_000 ||
    metrics.uiStateResolutionElapsedMs > 15_000 ||
    metrics.firstRemoteMediaElapsedMs > 20_000
  ) {
    return "deadline_exceeded";
  }
  return "none";
};

const installedJourneyProfile = (metrics) => {
  const expectedState = text(metrics.expectedState);
  const observedState = text(metrics.observedState);
  const resultState = text(metrics.resultState);
  const unresolvedStateCount = metricNumber(metrics, "unresolvedStateCount");
  if (
    !expectedState ||
    !observedState ||
    expectedState === observedState ||
    unresolvedStateCount === null ||
    unresolvedStateCount < 1
  ) {
    return null;
  }
  if (resultState === "loading" && observedState === "loading") {
    const elapsedDurationMs = metricNumber(metrics, "elapsedDurationMs");
    const maxDurationMs = metricNumber(metrics, "maxDurationMs");
    return elapsedDurationMs !== null &&
        maxDurationMs !== null &&
        elapsedDurationMs >= maxDurationMs
      ? profile(
        "installed_journey_unresolved_loading",
        "loading_state",
        "medium",
        1,
      )
      : null;
  }
  if (resultState === "error" && observedState === "error") {
    return profile(
      "installed_journey_error_state",
      "empty_error_offline",
      "medium",
      1,
    );
  }
  if (resultState === "offline" && observedState === "offline") {
    return profile(
      "installed_journey_offline_state",
      "empty_error_offline",
      "low",
      1,
    );
  }
  if (
    resultState === "permission_denied" &&
    observedState === "permission_denied"
  ) {
    return profile(
      "installed_journey_permission_denied",
      "permission",
      "medium",
      1,
    );
  }
  if (resultState === "blank" && observedState === "blank") {
    return profile(
      "installed_journey_blank_state",
      "installed_ui_state",
      "high",
      1,
    );
  }
  if (resultState === "crashed" && observedState === "crashed") {
    return profile(
      "installed_journey_crashed",
      "installed_ui_state",
      "high",
      1,
    );
  }
  if (resultState !== "blocked") return null;
  if (observedState === "no_state_change") {
    return profile(
      "installed_journey_no_state_change",
      "route_navigation",
      "medium",
      1,
    );
  }
  if (observedState === "route_unavailable") {
    return profile(
      "installed_journey_route_unavailable",
      "route_navigation",
      "high",
      1,
    );
  }
  return observedState === "unknown_blocked"
    ? profile(
      "installed_journey_blocked",
      "unknown",
      "medium",
      1,
    )
    : null;
};

export const deterministicDetectionReasons = (
  run,
  candidate,
  context,
) => {
  const reasons = new Set();
  const metrics = metricObject(run);
  const observationKind = text(run.metric_manifest?.observationKind);
  let expectedProfile = null;
  if (
    run.route_or_surface !== candidate.routeOrSurface ||
    run.source_build_hash !== candidate.buildRuntimeHash ||
    run.physical_proof_status !== candidate.physicalProofStatus ||
    !candidate.evidenceHashes.includes(run.evidence_manifest_hash)
  ) {
    reasons.add("run_binding_mismatch");
  }
  if (
    run.result_status !== "failed" ||
    !["installed_ui_observed", "simulator_observed"].includes(
      run.physical_proof_status,
    )
  ) {
    reasons.add("failed_physical_run_required");
  }
  if (!metrics) {
    reasons.add("metric_manifest_missing");
    return Object.freeze([...reasons].sort());
  }
  if (observationKind === "touch_target") {
    const result = deterministicTouchTargetClassification(run, context);
    expectedProfile = result.profile;
    if (!expectedProfile) {
      reasons.add(`touch_target_${result.classification}`);
    }
  } else if (observationKind === "search_accessibility") {
    const confirmedGap = metrics.inputPresent === true &&
      (
        metrics.inputFocusable !== true ||
        metrics.inputClickable !== true ||
        metrics.accessibilityLabelPresent !== true ||
        metrics.queryAccepted !== true ||
        metrics.clearSucceeded !== true
      );
    if (!confirmedGap) {
      reasons.add("search_accessibility_classification_rejected");
    } else {
      expectedProfile = profile(
        "search_accessibility_interactivity_gap",
        "installed_ui_state",
        "medium",
        0.99,
      );
    }
  } else if (observationKind === "route_timing") {
    if (metrics.timeoutObserved !== true) {
      reasons.add("route_timing_classification_rejected");
    } else {
      const networkState = text(metrics.networkState);
      expectedProfile = networkState === "offline"
        ? profile(
          "route_unresolved_or_error_state",
          "empty_error_offline",
          "low",
          1,
        )
        : networkState === "provider_blocked"
        ? profile(
          "route_unresolved_or_error_state",
          "provider_degradation",
          "low",
          0.95,
          "provider_blocked",
        )
        : ["ready", "degraded", "unknown"].includes(networkState)
        ? profile(
          "route_unresolved_or_error_state",
          "loading_state",
          "medium",
          0.99,
        )
        : null;
      if (!expectedProfile) {
        reasons.add("route_timing_classification_rejected");
      }
    }
  } else if (observationKind === "crash_anr") {
    const fatalCount = metricNumber(metrics, "fatalExceptionCount") ?? 0;
    const anrCount = metricNumber(metrics, "anrCount") ?? 0;
    if (fatalCount + anrCount < 1) {
      reasons.add("crash_anr_classification_rejected");
    } else {
      expectedProfile = profile(
        "installed_crash_or_anr",
        "installed_ui_state",
        "high",
        1,
      );
    }
  } else if (observationKind === "livekit_experience") {
    const failureCategory = deriveIndependentLiveKitFailureCategory(metrics);
    if (!failureCategory) {
      reasons.add("livekit_metric_manifest_rejected");
    } else if (text(metrics.stageFailureCategory) !== failureCategory) {
      reasons.add("livekit_failure_category_mismatch");
    } else {
      expectedProfile = liveKitProfile(failureCategory);
      if (!expectedProfile) reasons.add("livekit_classification_rejected");
    }
  } else if (observationKind === "visual_layout") {
    const result = deterministicVisualClassification(run, context);
    expectedProfile = result.profile;
    if (!expectedProfile) reasons.add(`visual_${result.classification}`);
  } else if (observationKind === "installed_journey") {
    expectedProfile = installedJourneyProfile(metrics);
    if (!expectedProfile) {
      reasons.add("installed_journey_classification_rejected");
    }
  } else {
    reasons.add("unsupported_observation_kind");
  }
  if (
    expectedProfile &&
    !candidateMatchesProfile(candidate, expectedProfile)
  ) {
    reasons.add("deterministic_finding_profile_mismatch");
  }
  return Object.freeze([...reasons].sort());
};

export const deterministicResolutionReasons = (
  run,
  finding,
  detectionRun,
  context,
) => {
  const reasons = new Set();
  if (
    text(finding.id).length === 0 ||
    finding.current_status !== "open" ||
    finding.erased_at !== null
  ) {
    reasons.add("open_finding_required");
  }
  if (
    run.task_id !== finding.task_id ||
    run.project_id !== finding.project_id ||
    run.platform !== finding.platform ||
    run.environment !== finding.environment ||
    run.route_or_surface !== finding.route_or_surface ||
    run.collector_capability_id === null ||
    run.erased_at !== null
  ) {
    reasons.add("resolution_run_binding_mismatch");
  }
  if (
    detectionRun.id !== finding.sentinel_run_id ||
    detectionRun.task_id !== finding.task_id ||
    detectionRun.project_id !== finding.project_id ||
    detectionRun.platform !== finding.platform ||
    detectionRun.environment !== finding.environment ||
    detectionRun.route_or_surface !== finding.route_or_surface
  ) {
    reasons.add("detection_run_binding_mismatch");
  }
  if (
    run.result_status !== "passed" ||
    !["installed_ui_observed", "simulator_observed"].includes(
      run.physical_proof_status,
    )
  ) {
    reasons.add("passing_physical_run_required");
  }
  if (
    run.sentinel_key !== detectionRun.sentinel_key ||
    text(run.metric_manifest?.observationKind) !==
      text(detectionRun.metric_manifest?.observationKind)
  ) {
    reasons.add("resolution_observation_kind_mismatch");
  }
  const observationKind = text(detectionRun.metric_manifest?.observationKind);
  const resolutionMetrics = metricObject(run);
  const detectionMetrics = metricObject(detectionRun);
  if (!resolutionMetrics || !detectionMetrics) {
    reasons.add("resolution_metric_manifest_missing");
  } else if (observationKind === "touch_target") {
    if (
      text(resolutionMetrics.componentIdentityHash) !==
        text(detectionMetrics.componentIdentityHash) ||
      text(resolutionMetrics.routeFamilyMappingHash) !==
        text(detectionMetrics.routeFamilyMappingHash) ||
      text(resolutionMetrics.surfaceFamily) !==
        text(detectionMetrics.surfaceFamily) ||
      text(resolutionMetrics.platform) !== text(detectionMetrics.platform) ||
      text(resolutionMetrics.measurementUnit) !==
        text(detectionMetrics.measurementUnit) ||
      text(resolutionMetrics.baselineId) !==
        text(detectionMetrics.baselineId) ||
      metricNumber(resolutionMetrics, "baselineVersion") !==
        metricNumber(detectionMetrics, "baselineVersion") ||
      metricNumber(resolutionMetrics, "preferredThreshold") !==
        metricNumber(detectionMetrics, "preferredThreshold") ||
      metricNumber(resolutionMetrics, "applicableMinimumThreshold") !==
        metricNumber(detectionMetrics, "applicableMinimumThreshold")
    ) {
      reasons.add("resolution_measurement_identity_mismatch");
    }
    if (
      deterministicTouchTargetClassification(run, context).classification !==
        "false_positive"
    ) {
      reasons.add("resolution_accessibility_target_not_satisfied");
    }
  } else if (observationKind === "visual_layout") {
    if (
      text(resolutionMetrics.componentIdentityHash) !==
        text(detectionMetrics.componentIdentityHash) ||
      text(resolutionMetrics.routeFamilyMappingHash) !==
        text(detectionMetrics.routeFamilyMappingHash) ||
      text(resolutionMetrics.surfaceFamily) !==
        text(detectionMetrics.surfaceFamily) ||
      text(resolutionMetrics.platform) !== text(detectionMetrics.platform) ||
      text(resolutionMetrics.measurementUnit) !==
        text(detectionMetrics.measurementUnit) ||
      text(resolutionMetrics.baselineId) !==
        text(detectionMetrics.baselineId) ||
      metricNumber(resolutionMetrics, "baselineVersion") !==
        metricNumber(detectionMetrics, "baselineVersion") ||
      text(resolutionMetrics.referenceViewport) !==
        text(detectionMetrics.referenceViewport) ||
      text(resolutionMetrics.baselineState) !== "approved_baseline" ||
      text(resolutionMetrics.baselineComparisonHash) !==
        text(detectionMetrics.baselineComparisonHash)
    ) {
      reasons.add("resolution_measurement_identity_mismatch");
    }
    if (
      deterministicVisualClassification(run, {
        approvedVisualBaselineCount: 1,
        approvedVisualBaselineHash: APPROVED_OPTION_C_BASELINE_HASH,
      }).classification !== "false_positive"
    ) {
      reasons.add("resolution_visual_baseline_not_satisfied");
    }
  } else if (observationKind === "installed_journey") {
    if (
      text(resolutionMetrics.expectedState) !==
        text(detectionMetrics.expectedState) ||
      text(resolutionMetrics.sourceRuntimeHash) !==
        text(detectionMetrics.sourceRuntimeHash) ||
      metricNumber(resolutionMetrics, "journeyStepCount") !==
        metricNumber(detectionMetrics, "journeyStepCount")
    ) {
      reasons.add("resolution_measurement_identity_mismatch");
    }
  }
  return Object.freeze([...reasons].sort());
};

const evaluatorAssertion = (env) => {
  const assertion =
    typeof env.COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION === "string"
      ? env.COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION.trim()
      : "";
  if (!assertion) throw new Error("evaluator_configuration_rejected");
  return assertion;
};

const normalizeDetection = (payload) => {
  if (
    !exactKeys(payload, DETECTION_KEYS) ||
    payload.action !== "evaluate_sentinel_detection" ||
    typeof payload.sentinelRunId !== "string" ||
    !UUID.test(payload.sentinelRunId) ||
    typeof payload.findingClass !== "string" ||
    !FINDING_CLASS.test(payload.findingClass) ||
    typeof payload.routeOrSurface !== "string" ||
    payload.routeOrSurface.length < 1 ||
    payload.routeOrSurface.length > 160 ||
    typeof payload.buildRuntimeHash !== "string" ||
    !HASH.test(payload.buildRuntimeHash) ||
    !SEVERITIES.has(payload.severity) ||
    typeof payload.userImpactHash !== "string" ||
    !HASH.test(payload.userImpactHash) ||
    !Array.isArray(payload.evidenceHashes) ||
    payload.evidenceHashes.length < 1 ||
    payload.evidenceHashes.length > 64 ||
    payload.evidenceHashes.some((value) =>
      typeof value !== "string" || !HASH.test(value)
    ) ||
    !SUSPECTED_LAYERS.has(payload.suspectedLayer) ||
    typeof payload.confidence !== "number" ||
    !Number.isFinite(payload.confidence) ||
    payload.confidence < 0 ||
    payload.confidence > 1 ||
    !REPRODUCTION_STATES.has(payload.reproductionState) ||
    typeof payload.affectedComponentsHash !== "string" ||
    !HASH.test(payload.affectedComponentsHash) ||
    typeof payload.providerBackendStateHash !== "string" ||
    !HASH.test(payload.providerBackendStateHash) ||
    typeof payload.proposedNextInvestigationHash !== "string" ||
    !HASH.test(payload.proposedNextInvestigationHash) ||
    !PHYSICAL_PROOF_STATUSES.has(payload.physicalProofStatus)
  ) {
    return null;
  }
  return Object.freeze({
    affectedComponentsHash: payload.affectedComponentsHash,
    buildRuntimeHash: payload.buildRuntimeHash,
    confidence: payload.confidence,
    evidenceHashes: Object.freeze([...payload.evidenceHashes]),
    findingClass: payload.findingClass,
    physicalProofStatus: payload.physicalProofStatus,
    proposedNextInvestigationHash: payload.proposedNextInvestigationHash,
    providerBackendStateHash: payload.providerBackendStateHash,
    reproductionState: payload.reproductionState,
    routeOrSurface: payload.routeOrSurface,
    sentinelRunId: payload.sentinelRunId,
    severity: payload.severity,
    suspectedLayer: payload.suspectedLayer,
    userImpactHash: payload.userImpactHash,
  });
};

const normalizeResolution = (payload) =>
  exactKeys(payload, RESOLUTION_KEYS) &&
    payload.action === "evaluate_sentinel_resolution" &&
    typeof payload.findingId === "string" &&
    UUID.test(payload.findingId) &&
    typeof payload.sentinelRunId === "string" &&
    UUID.test(payload.sentinelRunId) &&
    typeof payload.resolutionReasonHash === "string" &&
    HASH.test(payload.resolutionReasonHash)
    ? Object.freeze({
      findingId: payload.findingId,
      resolutionReasonHash: payload.resolutionReasonHash,
      sentinelRunId: payload.sentinelRunId,
    })
    : null;

const validateRun = (run, expectedId, now) => {
  if (
    !isRecord(run) ||
    run.id !== expectedId ||
    !UUID.test(text(run.id)) ||
    !UUID.test(text(run.task_id)) ||
    !UUID.test(text(run.project_id)) ||
    !["android", "ios", "web"].includes(run.platform) ||
    run.environment !== "production" ||
    ![
      "livekit_experience_sentinel",
      "visual_product_experience_sentinel",
      "installed_journey_sentinel",
    ].includes(run.sentinel_key) ||
    typeof run.route_or_surface !== "string" ||
    run.route_or_surface.length < 1 ||
    run.route_or_surface.length > 160 ||
    !HASH.test(text(run.source_build_hash)) ||
    !HASH.test(text(run.evidence_manifest_hash)) ||
    !isRecord(run.metric_manifest) ||
    typeof run.metric_manifest.observationKind !== "string" ||
    !["passed", "finding_created", "blocked", "failed"].includes(
      run.result_status,
    ) ||
    !PHYSICAL_PROOF_STATUSES.has(run.physical_proof_status) ||
    !UUID.test(text(run.collector_capability_id)) ||
    run.erased_at !== null
  ) {
    return false;
  }
  const expiresAt = Date.parse(run.evaluation_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now;
};

const validateFinding = (finding, expectedId) =>
  isRecord(finding) &&
  finding.id === expectedId &&
  UUID.test(text(finding.id)) &&
  UUID.test(text(finding.sentinel_run_id)) &&
  UUID.test(text(finding.task_id)) &&
  UUID.test(text(finding.project_id)) &&
  ["android", "ios", "web"].includes(finding.platform) &&
  finding.environment === "production" &&
  typeof finding.route_or_surface === "string" &&
  finding.route_or_surface.length >= 1 &&
  finding.route_or_surface.length <= 160 &&
  ["open", "resolved"].includes(finding.current_status) &&
  (finding.erased_at === null || typeof finding.erased_at === "string");

const readSnapshotContext = (snapshot) => {
  if (!isRecord(snapshot?.activeBaseline)) return null;
  const baseline = snapshot.activeBaseline;
  if (baseline.count === 0 && exactKeys(baseline, ["count"])) {
    return Object.freeze({
      approvedVisualBaselineCount: 0,
      approvedVisualBaselineHash: null,
    });
  }
  if (
    !exactKeys(baseline, [
      "baselineHash",
      "baselineId",
      "count",
      "selectedOption",
      "selectedOptionCode",
      "status",
    ]) ||
    baseline.count !== 1 ||
    baseline.baselineId !== "chillywood-product-experience-baseline-v1" ||
    baseline.selectedOptionCode !== "C" ||
    baseline.selectedOption !== "creator_balanced" ||
    baseline.baselineHash !== APPROVED_OPTION_C_BASELINE_HASH ||
    baseline.status !== "owner_approved"
  ) {
    return null;
  }
  return Object.freeze({
    approvedVisualBaselineCount: 1,
    approvedVisualBaselineHash: baseline.baselineHash,
  });
};

const readDetectionSnapshot = (snapshot, request, now = Date.now()) => {
  if (
    !isRecord(snapshot) ||
    !validateRun(snapshot.run, request.sentinelRunId, now) ||
    snapshot.finding !== null ||
    snapshot.detectionRun !== null
  ) {
    return null;
  }
  const context = readSnapshotContext(snapshot);
  return context
    ? Object.freeze({ context, run: snapshot.run })
    : null;
};

const readResolutionSnapshot = (snapshot, request, now = Date.now()) => {
  if (
    !isRecord(snapshot) ||
    !validateRun(snapshot.run, request.sentinelRunId, now) ||
    !validateFinding(snapshot.finding, request.findingId) ||
    !validateRun(
      snapshot.detectionRun,
      snapshot.finding.sentinel_run_id,
      Number.NEGATIVE_INFINITY,
    )
  ) {
    return null;
  }
  const context = readSnapshotContext(snapshot);
  return context
    ? Object.freeze({
      context,
      detectionRun: snapshot.detectionRun,
      finding: snapshot.finding,
      run: snapshot.run,
    })
    : null;
};

const assessmentHashForDetection = async (database, run, candidate) => {
  const findingKey = `pqf_${
    (await sha256Hex([
      run.task_id,
      run.project_id,
      run.platform,
      run.environment,
      candidate.routeOrSurface,
      candidate.findingClass,
    ].join("|"))).slice(0, 48)
  }`;
  const result = await database.call("productQualityDetectionAssessmentHash", [
    run.id,
    findingKey,
    candidate.routeOrSurface,
    candidate.buildRuntimeHash,
    candidate.severity,
    candidate.userImpactHash,
    [...candidate.evidenceHashes],
    candidate.suspectedLayer,
    candidate.confidence,
    candidate.reproductionState,
    candidate.affectedComponentsHash,
    candidate.providerBackendStateHash,
    candidate.proposedNextInvestigationHash,
    candidate.physicalProofStatus,
  ]);
  return typeof result === "string" && HASH.test(result) ? result : null;
};

const assessmentHashForResolution = async (database, run, candidate) => {
  const result = await database.call("productQualityResolutionAssessmentHash", [
    candidate.findingId,
    run.id,
    run.evidence_manifest_hash,
    candidate.resolutionReasonHash,
  ]);
  return typeof result === "string" && HASH.test(result) ? result : null;
};

const recordEvaluatorProof = async ({
  assessmentHash,
  assessmentKind,
  database,
  env,
  reasons,
  run,
}) => {
  const verdict = reasons.length === 0 ? "passed" : "rejected";
  const evaluatorOutputHash = await hashJson({
    assessmentHash,
    assessmentKind,
    observationKind: run.metric_manifest.observationKind,
    reasons: [...reasons],
    sentinelRunId: run.id,
    verdict,
  });
  const evaluatorProofHash = await sha256Hex([
    "product-sentinel-evaluator-v1",
    SERVICE_IDENTITY,
    run.id,
    assessmentHash,
    run.evidence_manifest_hash,
    verdict,
    evaluatorOutputHash,
  ].join("|"));
  const result = await database.call("productQualityRecordEvaluatorProof", [
    run.id,
    assessmentKind,
    assessmentHash,
    run.evidence_manifest_hash,
    verdict,
    evaluatorOutputHash,
    evaluatorProofHash,
    SERVICE_IDENTITY,
    evaluatorAssertion(env),
  ]);
  if (
    !isRecord(result) ||
    !UUID.test(text(result.evaluatorProofId)) ||
    result.sentinelRunId !== run.id ||
    result.assessmentKind !== assessmentKind ||
    result.verdict !== verdict ||
    !Number.isFinite(Date.parse(result.validUntil)) ||
    Date.parse(result.validUntil) <= Date.now()
  ) {
    throw new Error("sentinel_evaluator_proof_readback_rejected");
  }
  return Object.freeze({
    ...result,
    assessmentHash,
    evaluatorOutputHash,
    evaluatorProofHash,
    reasons: Object.freeze([...reasons]),
    selfApproval: false,
  });
};

const evaluateDetection = ready(
  [
    "read_product_quality_snapshot",
    "compute_detection_hash",
    "record_sentinel_evaluator_proof",
  ],
  async ({ database, env, payload }) => {
    const request = normalizeDetection(payload);
    if (!request) throw new Error("sentinel_detection_payload_rejected");
    const snapshot = await database.call("productQualityEvaluatorSnapshot", [
      request.sentinelRunId,
      null,
    ]);
    const selected = readDetectionSnapshot(snapshot, request);
    if (!selected) throw new Error("sentinel_detection_snapshot_rejected");
    const assessmentHash = await assessmentHashForDetection(
      database,
      selected.run,
      request,
    );
    if (!assessmentHash) {
      throw new Error("sentinel_detection_assessment_hash_rejected");
    }
    return recordEvaluatorProof({
      assessmentHash,
      assessmentKind: "finding_detection",
      database,
      env,
      reasons: deterministicDetectionReasons(
        selected.run,
        request,
        selected.context,
      ),
      run: selected.run,
    });
  },
);

const evaluateResolution = ready(
  [
    "read_product_quality_snapshot",
    "compute_resolution_hash",
    "record_sentinel_evaluator_proof",
  ],
  async ({ database, env, payload }) => {
    const request = normalizeResolution(payload);
    if (!request) throw new Error("sentinel_resolution_payload_rejected");
    const snapshot = await database.call("productQualityEvaluatorSnapshot", [
      request.sentinelRunId,
      request.findingId,
    ]);
    const selected = readResolutionSnapshot(snapshot, request);
    if (!selected) throw new Error("sentinel_resolution_snapshot_rejected");
    const assessmentHash = await assessmentHashForResolution(
      database,
      selected.run,
      request,
    );
    if (!assessmentHash) {
      throw new Error("sentinel_resolution_assessment_hash_rejected");
    }
    return recordEvaluatorProof({
      assessmentHash,
      assessmentKind: "finding_resolution",
      database,
      env,
      reasons: deterministicResolutionReasons(
        selected.run,
        selected.finding,
        selected.detectionRun,
        selected.context,
      ),
      run: selected.run,
    });
  },
);

const evaluateBaseline = ready(
  ["evaluate_product_baseline"],
  async ({ database, env, payload }) => {
    if (
      !exactKeys(payload, [
        "action",
        "executionId",
        "executionReceiptHash",
      ]) ||
      payload.action !== "evaluate_product_baseline_selection" ||
      typeof payload.executionId !== "string" ||
      !UUID.test(payload.executionId) ||
      typeof payload.executionReceiptHash !== "string" ||
      !HASH.test(payload.executionReceiptHash)
    ) {
      throw new Error("product_baseline_evaluation_payload_rejected");
    }
    const result = await database.call("evaluateProductBaseline", [
      payload.executionId,
      SERVICE_IDENTITY,
      evaluatorAssertion(env),
      payload.executionReceiptHash,
    ]);
    if (!isRecord(result)) {
      throw new Error("product_baseline_evaluation_readback_rejected");
    }
    return Object.freeze({ ...result });
  },
);

export const PRODUCT_QUALITY_EVALUATOR_ADAPTERS = Object.freeze({
  evaluate_product_baseline_selection: evaluateBaseline,
  evaluate_sentinel_detection: evaluateDetection,
  evaluate_sentinel_resolution: evaluateResolution,
});
