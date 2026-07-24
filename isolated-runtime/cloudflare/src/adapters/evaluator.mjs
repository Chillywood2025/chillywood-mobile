import productBaselineJson from "../../../../config/intelligence/chillywood-product-experience-baseline-v1.json" with {
  type: "json",
};
import { blocked, ready } from "./helpers.mjs";

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const SERVICE_IDENTITY = "cognitive_independent_evaluator";
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
    return !expected || observedClassification === expected
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
      accessibilityFinding(
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
    return assessment(
      "accessibility_violation",
      findingProfile("web_touch_target_below_preferred_44csspx", "low"),
    );
  }
  return assessment("false_positive");
};

const evaluatorAssertion = (env) => {
  const assertion =
    typeof env.COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION === "string"
      ? env.COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION.trim()
      : "";
  if (!assertion) throw new Error("evaluator_configuration_rejected");
  return assertion;
};

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
  evaluate_sentinel_detection: blocked(
    [
      "read_product_quality_snapshot",
      "read_active_baseline",
      "compute_detection_hash",
      "record_sentinel_evaluator_proof",
    ],
    "PRODUCT_QUALITY_COMPLETE_SNAPSHOT_RPC_REQUIRED",
  ),
  evaluate_sentinel_resolution: blocked(
    [
      "read_product_quality_snapshot",
      "read_active_baseline",
      "compute_resolution_hash",
      "record_sentinel_evaluator_proof",
    ],
    "PRODUCT_QUALITY_COMPLETE_SNAPSHOT_RPC_REQUIRED",
  ),
});
