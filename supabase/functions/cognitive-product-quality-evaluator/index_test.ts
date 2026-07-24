import {
  APPROVED_OPTION_C_BASELINE_HASH,
  deterministicDetectionReasons,
  deterministicResolutionReasons,
  deterministicTouchTargetClassification,
  deterministicVisualClassification,
  isStrictSentinelEvaluationPayload,
} from "./index.ts";

type TestJson =
  | null
  | boolean
  | number
  | string
  | TestJson[]
  | { [key: string]: TestJson };
type TestJsonObject = { [key: string]: TestJson };

const validPayload = () => ({
  action: "evaluate_sentinel_detection",
  affectedComponentsHash: "a".repeat(64),
  buildRuntimeHash: "b".repeat(64),
  confidence: 1,
  evidenceHashes: ["c".repeat(64)],
  findingClass: "android_touch_target_below_48dp",
  physicalProofStatus: "installed_ui_observed",
  proposedNextInvestigationHash: "d".repeat(64),
  providerBackendStateHash: "e".repeat(64),
  reproductionState: "confirmed_defect",
  routeOrSurface: "home/main-tab-home",
  sentinelRunId: "11111111-1111-4111-8111-111111111111",
  severity: "medium",
  suspectedLayer: "layout_density",
  userImpactHash: "f".repeat(64),
});
const candidateFromPayload = (
  payload: ReturnType<typeof validPayload>,
) => ({
  affectedComponentsHash: payload.affectedComponentsHash,
  buildRuntimeHash: payload.buildRuntimeHash,
  confidence: payload.confidence,
  evidenceHashes: payload.evidenceHashes,
  findingClass: payload.findingClass,
  physicalProofStatus: payload.physicalProofStatus,
  proposedNextInvestigationHash: payload.proposedNextInvestigationHash,
  providerBackendStateHash: payload.providerBackendStateHash,
  reproductionState: payload.reproductionState,
  routeOrSurface: payload.routeOrSurface,
  severity: payload.severity,
  suspectedLayer: payload.suspectedLayer,
  userImpactHash: payload.userImpactHash,
});
const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const approvedContext = Object.freeze({
  approvedVisualBaselineCount: 1,
  approvedVisualBaselineHash: APPROVED_OPTION_C_BASELINE_HASH,
});
const pendingContext = Object.freeze({
  approvedVisualBaselineCount: 0,
  approvedVisualBaselineHash: null,
});

const optionCVisualMetrics = (
  overrides: TestJsonObject = {},
): TestJsonObject => ({
  accessibilityNamePresent: true,
  accessibilityRolePresent: true,
  aspectRatioClass: "16:9",
  automationStatus: "observed",
  baselineApplicability: "option_c_default",
  baselineComparisonHash: APPROVED_OPTION_C_BASELINE_HASH,
  baselineId: "chillywood-product-experience-baseline-v1",
  baselineState: "approved_baseline",
  baselineVersion: 1,
  cardsAboveFold: 3,
  cardViewportHeightRatio: 200 / 844,
  cardViewportWidthRatio: 252 / 390,
  columnCount: 1,
  columnGap: 0,
  componentIdentityHash: "6".repeat(64),
  contentState: "loaded",
  creatorIdentityVisible: true,
  evidenceQuality: "measured_installed",
  evidenceQualityHash: "7".repeat(64),
  exceptionContractHash: null,
  exceptionType: "none",
  exceptionVersioned: false,
  featuredPlacement: "not_applicable",
  horizontalCardsVisible: 1.42,
  horizontalGap: 12,
  horizontalMargin: 16,
  interactiveApplicableMinimumThreshold: 48,
  interactivePreferredThreshold: 48,
  interactiveTargetHeight: 48,
  interactiveTargetWidth: 48,
  layoutMode: "horizontal_row",
  liveContent: false,
  liveStateVisible: false,
  mediaFrameHeight: 142,
  mediaFrameWidth: 252,
  measurementUnit: "dp",
  metadataBandHeight: 50,
  metadataLineCount: 2,
  observedClassification: "within_baseline",
  orientation: "portrait",
  platform: "android",
  providerState: "healthy",
  referenceViewport: "phone_portrait_390x844",
  routeFamilyMappingHash: "8".repeat(64),
  screenDensityDpi: 420,
  surfaceFamily: "standard_streaming_card",
  titleLineCount: 2,
  totalCardContainerHeight: 200,
  totalCardContainerWidth: 252,
  verticalRowGap: 20,
  viewportHeight: 844,
  viewportWidth: 390,
  windowClass: "compact",
  ...overrides,
});

const optionCTouchMetrics = (
  overrides: TestJsonObject = {},
): TestJsonObject => ({
  accessibilityNamePresent: true,
  accessibilityRolePresent: true,
  applicableMinimumThreshold: 48,
  automationStatus: "observed",
  baselineComparisonHash: APPROVED_OPTION_C_BASELINE_HASH,
  baselineId: "chillywood-product-experience-baseline-v1",
  baselineState: "approved_baseline",
  baselineVersion: 1,
  componentIdentityHash: "6".repeat(64),
  contentState: "loaded",
  evidenceQuality: "measured_installed",
  evidenceQualityHash: "7".repeat(64),
  exceptionContractHash: null,
  exceptionType: "none",
  exceptionVersioned: false,
  interactiveAncestorHeight: null,
  interactiveAncestorPresent: false,
  interactiveAncestorWidth: null,
  interactiveTargetHeight: 23.24,
  interactiveTargetWidth: 102.86,
  isActuallyInteractive: true,
  measurementUnit: "dp",
  platform: "android",
  preferredThreshold: 48,
  providerState: "healthy",
  routeFamilyMappingHash: "8".repeat(64),
  screenDensityDpi: 420,
  surfaceFamily: "standard_streaming_card",
  targetClassification: "below_platform_minimum",
  ...overrides,
});

const storedRun = (
  observationKind: string,
  metrics: TestJsonObject,
  overrides: TestJsonObject = {},
) => {
  const payload = validPayload();
  return {
    collector_capability_id: "66666666-6666-4666-8666-666666666666",
    environment: "production",
    erased_at: null,
    evaluation_expires_at: "2026-07-25T00:00:00.000Z",
    evidence_manifest_hash: payload.evidenceHashes[0],
    id: payload.sentinelRunId,
    metric_manifest: {
      metrics,
      observationKind,
    },
    physical_proof_status: payload.physicalProofStatus,
    platform: "android",
    project_id: "22222222-2222-4222-8222-222222222222",
    result_status: "failed",
    route_or_surface: payload.routeOrSurface,
    sentinel_key: "visual_product_experience_sentinel",
    source_build_hash: payload.buildRuntimeHash,
    task_id: "33333333-3333-4333-8333-333333333333",
    ...overrides,
  };
};

Deno.test("sentinel evaluator accepts only an exact bounded detection candidate", () => {
  assert(
    isStrictSentinelEvaluationPayload(validPayload()),
    "valid evaluator payload rejected",
  );
  for (
    const payload of [
      { ...validPayload(), extra: true },
      { ...validPayload(), verdict: "passed" },
      { ...validPayload(), action: "record_sentinel_evaluator_proof" },
      { ...validPayload(), evidenceHashes: ["c".repeat(63)] },
      { ...validPayload(), selfApproval: true },
    ]
  ) {
    assert(
      !isStrictSentinelEvaluationPayload(payload),
      "unsafe evaluator payload accepted",
    );
  }
});

Deno.test("caller cannot supply verdict, assessment hash, or proof hash", () => {
  for (const key of ["verdict", "assessmentHash", "evaluatorProofHash"]) {
    assert(
      !isStrictSentinelEvaluationPayload({
        ...validPayload(),
        [key]: "a".repeat(64),
      }),
      `${key} must be evaluator-derived`,
    );
  }
});

Deno.test("baseline evaluation accepts only receipt-bound execution evidence", () => {
  const payload = {
    action: "evaluate_product_baseline_selection",
    executionId: "11111111-1111-4111-8111-111111111111",
    executionReceiptHash: "a".repeat(64),
  };
  assert(
    isStrictSentinelEvaluationPayload(payload),
    "bounded baseline evaluation rejected",
  );
  for (
    const rejected of [
      { ...payload, selectedOption: "creator_balanced" },
      { ...payload, verdict: "passed" },
      { ...payload, evaluatorProofHash: "b".repeat(64) },
      { ...payload, executionReceiptHash: "a".repeat(63) },
    ]
  ) {
    assert(
      !isStrictSentinelEvaluationPayload(rejected),
      "caller-controlled baseline verdict material accepted",
    );
  }
});

Deno.test("sentinel evaluator accepts only exact bounded resolution evidence", () => {
  const payload = {
    action: "evaluate_sentinel_resolution",
    findingId: "44444444-4444-4444-8444-444444444444",
    resolutionReasonHash: "9".repeat(64),
    sentinelRunId: "55555555-5555-4555-8555-555555555555",
  };
  assert(
    isStrictSentinelEvaluationPayload(payload),
    "valid resolution payload rejected",
  );
  for (
    const rejected of [
      { ...payload, verdict: "passed" },
      { ...payload, resolutionReasonHash: "9".repeat(63) },
      { ...payload, findingId: "not-a-uuid" },
      { ...payload, action: "resolve_finding" },
    ]
  ) {
    assert(
      !isStrictSentinelEvaluationPayload(rejected),
      "unsafe resolution payload accepted",
    );
  }
});

Deno.test("Android touch classification is derived from stored run metrics", () => {
  const payload = validPayload();
  const run = storedRun("touch_target", optionCTouchMetrics());
  const candidate = candidateFromPayload(payload);
  assert(
    deterministicDetectionReasons(run, candidate, approvedContext).length === 0,
    "reproduced 23.24dp installed target should pass deterministic evaluation",
  );
  assert(
    deterministicTouchTargetClassification(
      storedRun(
        "touch_target",
        optionCTouchMetrics({
          interactiveTargetHeight: 48,
          targetClassification: "meets_platform_minimum",
        }),
      ),
      approvedContext,
    ).classification === "false_positive",
    "48dp target must not be classified as undersized",
  );
});

Deno.test("objective touch findings do not require visual baseline approval", () => {
  const payload = validPayload();
  const pendingMetrics = optionCTouchMetrics({
    baselineComparisonHash: null,
    baselineState: "needs_product_baseline_review",
  });
  const pendingRun = storedRun("touch_target", pendingMetrics);
  assert(
    deterministicDetectionReasons(
      pendingRun,
      candidateFromPayload(payload),
      pendingContext,
    ).length === 0,
    "a measured Android target below 48dp must remain reachable before visual approval",
  );
  assert(
    deterministicTouchTargetClassification(
      storedRun(
        "touch_target",
        optionCTouchMetrics({
          baselineComparisonHash: null,
          baselineState: "needs_product_baseline_review",
          interactiveTargetHeight: 48,
          targetClassification: "meets_platform_minimum",
        }),
      ),
      pendingContext,
    ).classification === "false_positive",
    "a compliant pending-baseline target must remain a deterministic false positive",
  );
  assert(
    deterministicTouchTargetClassification(
      storedRun(
        "touch_target",
        optionCTouchMetrics({
          accessibilityNamePresent: false,
          baselineComparisonHash: null,
          baselineState: "needs_product_baseline_review",
          interactiveTargetHeight: 48,
          targetClassification: "meets_platform_minimum",
        }),
      ),
      pendingContext,
    ).profile?.findingClass ===
      "touch_target_accessibility_name_or_role_missing",
    "objective name-role gaps must remain reachable before visual approval",
  );
});

Deno.test("touch baseline state is validated without trusting the caller", () => {
  assert(
    deterministicTouchTargetClassification(
      storedRun(
        "touch_target",
        optionCTouchMetrics({
          baselineComparisonHash: APPROVED_OPTION_C_BASELINE_HASH,
          baselineState: "needs_product_baseline_review",
        }),
      ),
      pendingContext,
    ).classification === "baseline_ambiguity",
    "pending baseline state must carry a null comparison hash",
  );
  assert(
    deterministicTouchTargetClassification(
      storedRun("touch_target", optionCTouchMetrics()),
      pendingContext,
    ).classification === "baseline_ambiguity",
    "caller-claimed approval must require the authenticated approved context",
  );
  assert(
    deterministicTouchTargetClassification(
      storedRun("touch_target", optionCTouchMetrics()),
      approvedContext,
    ).profile?.findingClass === "android_touch_target_below_48dp",
    "exact approved Option C touch evidence must remain accepted",
  );
});

Deno.test("stored metrics bind severity confidence and suspected layer", () => {
  const payload = validPayload();
  const run = storedRun("touch_target", optionCTouchMetrics());
  for (
    const candidate of [
      { ...candidateFromPayload(payload), severity: "critical" },
      { ...candidateFromPayload(payload), confidence: 0.5 },
      { ...candidateFromPayload(payload), suspectedLayer: "unknown" },
    ]
  ) {
    assert(
      deterministicDetectionReasons(run, candidate, approvedContext).includes(
        "deterministic_finding_profile_mismatch",
      ),
      "caller-selected profile value must be rejected",
    );
  }
});

Deno.test("Option C visual findings require the exact approved baseline hash", () => {
  const payload = validPayload();
  const compliantRun = storedRun("visual_layout", optionCVisualMetrics());
  assert(
    deterministicVisualClassification(
      compliantRun,
      approvedContext,
    ).classification === "false_positive",
    "exact compliant Option C evidence must not create a finding",
  );
  assert(
    deterministicVisualClassification(
      compliantRun,
      {
        approvedVisualBaselineCount: 1,
        approvedVisualBaselineHash: "2".repeat(64),
      },
    ).classification === "baseline_ambiguity",
    "mismatched approved baseline must fail closed",
  );
  assert(
    deterministicVisualClassification(
      storedRun(
        "visual_layout",
        optionCVisualMetrics({
          baselineComparisonHash: null,
          baselineState: "needs_product_baseline_review",
          observedClassification: "baseline_ambiguity",
        }),
      ),
      pendingContext,
    ).classification === "baseline_ambiguity",
    "visual layout must still require authenticated Option C approval",
  );

  const deviationRun = storedRun(
    "visual_layout",
    optionCVisualMetrics({
      mediaFrameHeight: 146.25,
      mediaFrameWidth: 260,
      observedClassification: "confirmed_baseline_violation",
      totalCardContainerWidth: 260,
      cardViewportWidthRatio: 260 / 390,
    }),
  );
  const candidate = {
    ...candidateFromPayload(payload),
    findingClass: "visual_option_c_phone_portrait_deviation",
  };
  const deviationReasons = deterministicDetectionReasons(
    deviationRun,
    candidate,
    approvedContext,
  );
  assert(
    deviationReasons.length === 0,
    `measured Option C phone deviation should admit its exact derived profile: ${
      deviationReasons.join(",")
    }`,
  );
  assert(
    deterministicDetectionReasons(
      deviationRun,
      { ...candidate, severity: "high" },
      approvedContext,
    ).includes("deterministic_finding_profile_mismatch"),
    "caller-authored severity must not override the evaluator profile",
  );
});

Deno.test("visual non-findings remain truthfully distinct", () => {
  const classifications = [
    [
      optionCVisualMetrics({
        automationStatus: "failed",
        observedClassification: "automation_failure",
      }),
      "automation_failure",
    ],
    [
      optionCVisualMetrics({ automationStatus: "partial" }),
      "insufficient_evidence",
    ],
    [
      optionCVisualMetrics({
        baselineComparisonHash: "9".repeat(64),
        observedClassification: "baseline_ambiguity",
      }),
      "baseline_ambiguity",
    ],
    [
      optionCVisualMetrics({
        contentState: "empty",
        observedClassification: "content_data_absence",
      }),
      "content_data_absent",
    ],
    [
      optionCVisualMetrics({
        observedClassification: "provider_blocked",
        providerState: "blocked",
      }),
      "provider_blocked",
    ],
  ] as const;
  for (const [metrics, expected] of classifications) {
    assert(
      deterministicVisualClassification(
        storedRun("visual_layout", metrics),
        approvedContext,
      ).classification === expected,
      `${expected} must remain a distinct evidence-derived outcome`,
    );
  }
});

Deno.test("versioned featured surfaces are route exceptions, not Option C cards", () => {
  const metrics = optionCVisualMetrics({
    baselineApplicability: "explicit_versioned_exception",
    exceptionContractHash: "9".repeat(64),
    exceptionType: "featured_hero",
    exceptionVersioned: true,
    featuredPlacement: "first_row",
    observedClassification: "route_specific_exception",
    surfaceFamily: "featured_hero_card",
  });
  assert(
    deterministicVisualClassification(
      storedRun("visual_layout", metrics),
      approvedContext,
    ).classification === "route_specific_exception",
    "first-row featured family must remain an explicit versioned exception",
  );
  assert(
    deterministicVisualClassification(
      storedRun("visual_layout", {
        ...metrics,
        featuredPlacement: "second_row",
        observedClassification: "confirmed_baseline_violation",
      }),
      approvedContext,
    ).profile?.findingClass === "visual_featured_hero_outside_first_row",
    "featured content outside the first row must be derived as a violation",
  );
  const verticalMetrics = optionCVisualMetrics({
    aspectRatioClass: "9:16",
    baselineApplicability: "explicit_versioned_exception",
    cardViewportHeightRatio: 210 / 844,
    cardViewportWidthRatio: 90 / 390,
    exceptionContractHash: "a".repeat(64),
    exceptionType: "vertical_short_form",
    exceptionVersioned: true,
    mediaFrameHeight: 160,
    mediaFrameWidth: 90,
    observedClassification: "route_specific_exception",
    surfaceFamily: "vertical_post_card",
    totalCardContainerHeight: 210,
    totalCardContainerWidth: 90,
  });
  assert(
    deterministicVisualClassification(
      storedRun("visual_layout", verticalMetrics),
      approvedContext,
    ).classification === "route_specific_exception",
    "measured 9:16 vertical media must remain an explicit family exception",
  );
});

Deno.test("creator and Live identity are independently evaluated", () => {
  const creatorMissing = deterministicVisualClassification(
    storedRun(
      "visual_layout",
      optionCVisualMetrics({
        creatorIdentityVisible: false,
        observedClassification: "confirmed_baseline_violation",
      }),
    ),
    approvedContext,
  );
  assert(
    creatorMissing.profile?.findingClass === "visual_creator_identity_missing",
    "creator identity absence must be a measured finding",
  );
  const liveMissing = deterministicVisualClassification(
    storedRun(
      "visual_layout",
      optionCVisualMetrics({
        liveContent: true,
        liveStateVisible: false,
        observedClassification: "confirmed_baseline_violation",
        surfaceFamily: "live_streaming_card",
      }),
    ),
    approvedContext,
  );
  assert(
    liveMissing.profile?.findingClass === "visual_live_state_missing",
    "live-state absence must be distinct from general density",
  );
});

Deno.test("platform-specific touch units and web WCAG tiers are not mixed", () => {
  const iosRun = storedRun(
    "touch_target",
    optionCTouchMetrics({
      applicableMinimumThreshold: 44,
      interactiveTargetHeight: 43,
      interactiveTargetWidth: 44,
      measurementUnit: "pt",
      platform: "ios",
      preferredThreshold: 44,
      screenDensityDpi: null,
    }),
    { platform: "ios" },
  );
  assert(
    deterministicTouchTargetClassification(
      iosRun,
      approvedContext,
    ).profile?.findingClass === "ios_touch_target_below_44pt",
    "iOS must use the 44pt threshold",
  );
  const webMinimumOnly = storedRun(
    "touch_target",
    optionCTouchMetrics({
      applicableMinimumThreshold: 24,
      interactiveTargetHeight: 24,
      interactiveTargetWidth: 24,
      measurementUnit: "css_px",
      platform: "web",
      preferredThreshold: 44,
      screenDensityDpi: null,
      targetClassification: "meets_wcag_aa_minimum_only",
    }),
    { platform: "web" },
  );
  assert(
    deterministicTouchTargetClassification(
      webMinimumOnly,
      approvedContext,
    ).profile?.findingClass ===
      "web_touch_target_below_preferred_44csspx",
    "web must distinguish the 24 CSS px WCAG floor from the 44 CSS px preference",
  );
  assert(
    deterministicTouchTargetClassification(
      {
        ...webMinimumOnly,
        metric_manifest: {
          ...webMinimumOnly.metric_manifest,
          metrics: {
            ...webMinimumOnly.metric_manifest.metrics,
            measurementUnit: "pt",
          },
        },
      },
      approvedContext,
    ).classification === "baseline_ambiguity",
    "mixed platform units must fail closed",
  );
});

Deno.test("installed journey failure classes are derived only from stored metrics", () => {
  const payload = validPayload();
  const baseRun = {
    collector_capability_id: "66666666-6666-4666-8666-666666666666",
    environment: "production",
    erased_at: null,
    evaluation_expires_at: "2026-07-25T00:00:00.000Z",
    evidence_manifest_hash: payload.evidenceHashes[0],
    id: payload.sentinelRunId,
    metric_manifest: {
      metrics: {
        elapsedDurationMs: 10000,
        expectedState: "home_feed_visible",
        journeyStepCount: 4,
        maxDurationMs: 10000,
        observedState: "loading",
        resultState: "loading",
        screenshotEvidenceHash: "1".repeat(64),
        sourceRuntimeHash: "2".repeat(64),
        unresolvedStateCount: 1,
      },
      observationKind: "installed_journey",
    },
    physical_proof_status: payload.physicalProofStatus,
    platform: "android",
    project_id: "22222222-2222-4222-8222-222222222222",
    result_status: "failed",
    route_or_surface: payload.routeOrSurface,
    sentinel_key: "installed_journey_sentinel",
    source_build_hash: payload.buildRuntimeHash,
    task_id: "33333333-3333-4333-8333-333333333333",
  };
  const cases = [
    [
      "loading",
      "loading",
      "installed_journey_unresolved_loading",
      "loading_state",
      "medium",
    ],
    [
      "error",
      "error",
      "installed_journey_error_state",
      "empty_error_offline",
      "medium",
    ],
    [
      "blocked",
      "unknown_blocked",
      "installed_journey_blocked",
      "unknown",
      "medium",
    ],
    [
      "offline",
      "offline",
      "installed_journey_offline_state",
      "empty_error_offline",
      "low",
    ],
    [
      "permission_denied",
      "permission_denied",
      "installed_journey_permission_denied",
      "permission",
      "medium",
    ],
    [
      "blank",
      "blank",
      "installed_journey_blank_state",
      "installed_ui_state",
      "high",
    ],
    [
      "crashed",
      "crashed",
      "installed_journey_crashed",
      "installed_ui_state",
      "high",
    ],
    [
      "blocked",
      "no_state_change",
      "installed_journey_no_state_change",
      "route_navigation",
      "medium",
    ],
    [
      "blocked",
      "route_unavailable",
      "installed_journey_route_unavailable",
      "route_navigation",
      "high",
    ],
  ] as const;
  for (
    const [resultState, observedState, findingClass, suspectedLayer, severity]
      of cases
  ) {
    const run = {
      ...baseRun,
      metric_manifest: {
        ...baseRun.metric_manifest,
        metrics: {
          ...baseRun.metric_manifest.metrics,
          observedState,
          resultState,
        },
      },
    };
    const candidate = {
      ...candidateFromPayload(payload),
      confidence: 1,
      findingClass,
      severity,
      suspectedLayer,
    };
    assert(
      deterministicDetectionReasons(run, candidate).length === 0,
      `${findingClass} should be derived from the stored result state`,
    );
  }
  const earlyLoading = {
    ...baseRun,
    metric_manifest: {
      ...baseRun.metric_manifest,
      metrics: {
        ...baseRun.metric_manifest.metrics,
        elapsedDurationMs: 9999,
      },
    },
  };
  assert(
    deterministicDetectionReasons(
      earlyLoading,
      {
        ...candidateFromPayload(payload),
        confidence: 1,
        findingClass: "installed_journey_unresolved_loading",
        severity: "medium",
        suspectedLayer: "loading_state",
      },
    ).includes("installed_journey_classification_rejected"),
    "loading before the stored deadline must not be classified as unresolved",
  );
});

Deno.test("journey resolution binds the exact stored measurement identity", () => {
  const finding = {
    current_status: "open",
    environment: "production",
    erased_at: null,
    id: "44444444-4444-4444-8444-444444444444",
    platform: "android",
    project_id: "22222222-2222-4222-8222-222222222222",
    route_or_surface: "home/main-tab-home",
    sentinel_run_id: "11111111-1111-4111-8111-111111111111",
    task_id: "33333333-3333-4333-8333-333333333333",
  };
  const measurement = {
    elapsedDurationMs: 10000,
    expectedState: "home_feed_visible",
    journeyStepCount: 4,
    maxDurationMs: 10000,
    observedState: "loading",
    resultState: "loading",
    screenshotEvidenceHash: "1".repeat(64),
    sourceRuntimeHash: "2".repeat(64),
    unresolvedStateCount: 1,
  };
  const detectionRun = {
    collector_capability_id: "66666666-6666-4666-8666-666666666666",
    environment: finding.environment,
    erased_at: null,
    evaluation_expires_at: "2026-07-25T00:00:00.000Z",
    evidence_manifest_hash: "7".repeat(64),
    id: finding.sentinel_run_id,
    metric_manifest: {
      metrics: measurement,
      observationKind: "installed_journey",
    },
    physical_proof_status: "installed_ui_observed",
    platform: finding.platform,
    project_id: finding.project_id,
    result_status: "failed",
    route_or_surface: finding.route_or_surface,
    sentinel_key: "installed_journey_sentinel",
    source_build_hash: "8".repeat(64),
    task_id: finding.task_id,
  };
  const passingRun = {
    ...detectionRun,
    evidence_manifest_hash: "9".repeat(64),
    id: "55555555-5555-4555-8555-555555555555",
    metric_manifest: {
      metrics: {
        ...measurement,
        elapsedDurationMs: 500,
        observedState: "home_feed_visible",
        resultState: "success",
        unresolvedStateCount: 0,
      },
      observationKind: "installed_journey",
    },
    result_status: "passed",
  };
  assert(
    deterministicResolutionReasons(
      passingRun,
      finding,
      detectionRun,
    ).length === 0,
    "same journey/runtime measurement should support resolution",
  );
  assert(
    deterministicResolutionReasons(
      {
        ...passingRun,
        metric_manifest: {
          ...passingRun.metric_manifest,
          metrics: {
            ...passingRun.metric_manifest.metrics,
            sourceRuntimeHash: "3".repeat(64),
          },
        },
      },
      finding,
      detectionRun,
    ).includes("resolution_measurement_identity_mismatch"),
    "a different runtime measurement must not resolve the finding",
  );
});

Deno.test("visual resolution binds component, family, and Option C baseline", () => {
  const finding = {
    current_status: "open",
    environment: "production",
    erased_at: null,
    id: "44444444-4444-4444-8444-444444444444",
    platform: "android",
    project_id: "22222222-2222-4222-8222-222222222222",
    route_or_surface: "home/main-tab-home",
    sentinel_run_id: "11111111-1111-4111-8111-111111111111",
    task_id: "33333333-3333-4333-8333-333333333333",
  };
  const detectionRun = storedRun(
    "visual_layout",
    optionCVisualMetrics({
      creatorIdentityVisible: false,
      observedClassification: "confirmed_baseline_violation",
    }),
  );
  const passingRun = {
    ...detectionRun,
    evidence_manifest_hash: "9".repeat(64),
    id: "55555555-5555-4555-8555-555555555555",
    metric_manifest: {
      metrics: optionCVisualMetrics(),
      observationKind: "visual_layout",
    },
    result_status: "passed",
  };
  assert(
    deterministicResolutionReasons(
      passingRun,
      finding,
      detectionRun,
    ).length === 0,
    "compliant repeat evidence should resolve the exact Option C component",
  );
  assert(
    deterministicResolutionReasons(
      {
        ...passingRun,
        metric_manifest: {
          ...passingRun.metric_manifest,
          metrics: optionCVisualMetrics({
            componentIdentityHash: "a".repeat(64),
          }),
        },
      },
      finding,
      detectionRun,
    ).includes("resolution_measurement_identity_mismatch"),
    "a different visual component must not resolve the finding",
  );
});

Deno.test("resolution proof requires a matching passing observation", () => {
  const finding = {
    current_status: "open",
    environment: "production",
    erased_at: null,
    id: "44444444-4444-4444-8444-444444444444",
    platform: "android",
    project_id: "22222222-2222-4222-8222-222222222222",
    route_or_surface: "home/main-tab-home",
    sentinel_run_id: "11111111-1111-4111-8111-111111111111",
    task_id: "33333333-3333-4333-8333-333333333333",
  };
  const detectionRun = {
    collector_capability_id: "66666666-6666-4666-8666-666666666666",
    environment: finding.environment,
    erased_at: null,
    evaluation_expires_at: "2026-07-25T00:00:00.000Z",
    evidence_manifest_hash: "7".repeat(64),
    id: finding.sentinel_run_id,
    metric_manifest: {
      metrics: {
        elapsedDurationMs: 10001,
        networkState: "ready",
        timeoutObserved: true,
      },
      observationKind: "route_timing",
    },
    physical_proof_status: "installed_ui_observed",
    platform: finding.platform,
    project_id: finding.project_id,
    result_status: "failed",
    route_or_surface: finding.route_or_surface,
    sentinel_key: "installed_journey_sentinel",
    source_build_hash: "8".repeat(64),
    task_id: finding.task_id,
  };
  const passingRun = {
    ...detectionRun,
    evidence_manifest_hash: "9".repeat(64),
    id: "55555555-5555-4555-8555-555555555555",
    metric_manifest: {
      metrics: {
        elapsedDurationMs: 500,
        networkState: "ready",
        timeoutObserved: false,
      },
      observationKind: "route_timing",
    },
    result_status: "passed",
  };
  assert(
    deterministicResolutionReasons(
      passingRun,
      finding,
      detectionRun,
    ).length === 0,
    "matching passing observation should support resolution",
  );
  assert(
    deterministicResolutionReasons(
      {
        ...passingRun,
        metric_manifest: {
          ...passingRun.metric_manifest,
          observationKind: "search_accessibility",
        },
      },
      finding,
      detectionRun,
    ).includes("resolution_observation_kind_mismatch"),
    "unrelated passing observation must not resolve a finding",
  );

  const touchDetectionRun = {
    ...detectionRun,
    metric_manifest: {
      metrics: optionCTouchMetrics({
        baselineComparisonHash: null,
        baselineState: "needs_product_baseline_review",
      }),
      observationKind: "touch_target",
    },
    sentinel_key: "visual_product_experience_sentinel",
  };
  const touchPassingRun = {
    ...passingRun,
    metric_manifest: {
      metrics: optionCTouchMetrics({
        baselineComparisonHash: null,
        baselineState: "needs_product_baseline_review",
        interactiveTargetHeight: 48,
        targetClassification: "meets_platform_minimum",
      }),
      observationKind: "touch_target",
    },
    sentinel_key: "visual_product_experience_sentinel",
  };
  assert(
    deterministicResolutionReasons(
      touchPassingRun,
      finding,
      touchDetectionRun,
    ).length === 0,
    "pending-baseline touch resolution must bind the exact component, family, and platform unit",
  );
  assert(
    deterministicResolutionReasons(
      {
        ...touchPassingRun,
        metric_manifest: {
          ...touchPassingRun.metric_manifest,
          metrics: optionCTouchMetrics({
            interactiveTargetHeight: 48,
            targetClassification: "meets_platform_minimum",
          }),
        },
      },
      finding,
      touchDetectionRun,
      approvedContext,
    ).length === 0,
    "later visual approval must not invalidate an objective touch resolution",
  );
  assert(
    deterministicResolutionReasons(
      {
        ...touchPassingRun,
        metric_manifest: {
          ...touchPassingRun.metric_manifest,
          metrics: {
            ...touchPassingRun.metric_manifest.metrics,
            componentIdentityHash: "a".repeat(64),
          },
        },
      },
      finding,
      touchDetectionRun,
    ).includes("resolution_measurement_identity_mismatch"),
    "a different component identity must not resolve a touch finding",
  );
});
