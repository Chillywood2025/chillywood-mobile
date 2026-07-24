import {
  deterministicDetectionReasons,
  deterministicResolutionReasons,
  isStrictSentinelEvaluationPayload,
} from "./index.ts";

const validPayload = () => ({
  action: "evaluate_sentinel_detection",
  affectedComponentsHash: "a".repeat(64),
  buildRuntimeHash: "b".repeat(64),
  confidence: 0.99,
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
  const run = {
    collector_capability_id: "66666666-6666-4666-8666-666666666666",
    environment: "production",
    erased_at: null,
    evaluation_expires_at: "2026-07-25T00:00:00.000Z",
    evidence_manifest_hash: payload.evidenceHashes[0],
    id: payload.sentinelRunId,
    metric_manifest: {
      evidenceHashes: payload.evidenceHashes,
      metrics: {
        clickableAncestorPresent: false,
        isActuallyInteractive: true,
        minimumHeightDp: 23.24,
        minimumWidthDp: 102.86,
        thresholdDp: 48,
      },
      observationKind: "touch_target",
      sanitizationVersion: "bounded-nonpersonal-v1",
      schemaVersion: "product-sentinel-v1",
    },
    physical_proof_status: payload.physicalProofStatus,
    platform: "android",
    project_id: "22222222-2222-4222-8222-222222222222",
    result_status: "failed",
    route_or_surface: payload.routeOrSurface,
    sentinel_key: "visual_product_experience_sentinel",
    source_build_hash: payload.buildRuntimeHash,
    task_id: "33333333-3333-4333-8333-333333333333",
  };
  const candidate = candidateFromPayload(payload);
  assert(
    deterministicDetectionReasons(run, candidate).length === 0,
    "reproduced 23.24dp installed target should pass deterministic evaluation",
  );
  assert(
    deterministicDetectionReasons(
      {
        ...run,
        metric_manifest: {
          ...run.metric_manifest,
          metrics: {
            ...run.metric_manifest.metrics,
            minimumHeightDp: 48,
          },
        },
      },
      candidate,
    ).includes("touch_target_classification_rejected"),
    "48dp target must not be classified as undersized",
  );
});

Deno.test("stored metrics bind severity confidence and suspected layer", () => {
  const payload = validPayload();
  const run = {
    collector_capability_id: "66666666-6666-4666-8666-666666666666",
    environment: "production",
    erased_at: null,
    evaluation_expires_at: "2026-07-25T00:00:00.000Z",
    evidence_manifest_hash: payload.evidenceHashes[0],
    id: payload.sentinelRunId,
    metric_manifest: {
      metrics: {
        clickableAncestorPresent: false,
        isActuallyInteractive: true,
        minimumHeightDp: 23.24,
        minimumWidthDp: 102.86,
        thresholdDp: 48,
      },
      observationKind: "touch_target",
    },
    physical_proof_status: payload.physicalProofStatus,
    platform: "android",
    project_id: "22222222-2222-4222-8222-222222222222",
    result_status: "failed",
    route_or_surface: payload.routeOrSurface,
    sentinel_key: "visual_product_experience_sentinel",
    source_build_hash: payload.buildRuntimeHash,
    task_id: "33333333-3333-4333-8333-333333333333",
  };
  for (
    const candidate of [
      { ...candidateFromPayload(payload), severity: "critical" },
      { ...candidateFromPayload(payload), confidence: 0.5 },
      { ...candidateFromPayload(payload), suspectedLayer: "unknown" },
    ]
  ) {
    assert(
      deterministicDetectionReasons(run, candidate).includes(
        "deterministic_finding_profile_mismatch",
      ),
      "caller-selected profile value must be rejected",
    );
  }
});

Deno.test("visual findings fail closed around immutable Owner baseline state", () => {
  const payload = validPayload();
  const baselineHash = "1".repeat(64);
  const run = {
    collector_capability_id: "66666666-6666-4666-8666-666666666666",
    environment: "production",
    erased_at: null,
    evaluation_expires_at: "2026-07-25T00:00:00.000Z",
    evidence_manifest_hash: payload.evidenceHashes[0],
    id: payload.sentinelRunId,
    metric_manifest: {
      metrics: {
        aspectRatioClass: "16:9",
        baselineComparisonHash: baselineHash,
        baselineState: "needs_product_baseline_review",
        cardsAboveFold: 1,
        cardViewportHeightRatio: 0.4,
        cardViewportWidthRatio: 0.9,
        densityScore: 0.2,
        minimumTouchTargetPt: 44,
        titleLineCount: 2,
      },
      observationKind: "visual_layout",
    },
    physical_proof_status: payload.physicalProofStatus,
    platform: "android",
    project_id: "22222222-2222-4222-8222-222222222222",
    result_status: "failed",
    route_or_surface: payload.routeOrSurface,
    sentinel_key: "visual_product_experience_sentinel",
    source_build_hash: payload.buildRuntimeHash,
    task_id: "33333333-3333-4333-8333-333333333333",
  };
  const missingBaselineCandidate = {
    ...candidateFromPayload(payload),
    confidence: 1,
    findingClass: "visual_product_baseline_missing",
    reproductionState: "design_baseline_missing",
    severity: "info",
  };
  assert(
    deterministicDetectionReasons(
      run,
      missingBaselineCandidate,
      {
        approvedVisualBaselineCount: 0,
        approvedVisualBaselineHash: null,
      },
    ).length === 0,
    "only the missing-baseline classification should pass before approval",
  );
  assert(
    deterministicDetectionReasons(
      run,
      {
        ...missingBaselineCandidate,
        findingClass: "visual_layout_approved_baseline_deviation",
        reproductionState: "confirmed_defect",
        severity: "medium",
      },
      {
        approvedVisualBaselineCount: 0,
        approvedVisualBaselineHash: null,
      },
    ).includes("deterministic_finding_profile_mismatch"),
    "a UI defect must not be inferred before baseline approval",
  );

  const approvedRun = {
    ...run,
    metric_manifest: {
      ...run.metric_manifest,
      metrics: {
        ...run.metric_manifest.metrics,
        baselineState: "approved_baseline",
      },
    },
  };
  const approvedCandidate = {
    ...missingBaselineCandidate,
    findingClass: "visual_layout_approved_baseline_deviation",
    reproductionState: "confirmed_defect",
    severity: "medium",
  };
  assert(
    deterministicDetectionReasons(
      approvedRun,
      approvedCandidate,
      {
        approvedVisualBaselineCount: 0,
        approvedVisualBaselineHash: null,
      },
    ).includes("visual_layout_approved_baseline_required"),
    "an approved-baseline finding must fail when no approved row exists",
  );
  assert(
    deterministicDetectionReasons(
      approvedRun,
      approvedCandidate,
      {
        approvedVisualBaselineCount: 1,
        approvedVisualBaselineHash: "2".repeat(64),
      },
    ).includes("visual_layout_approved_baseline_required"),
    "a mismatched baseline hash must fail closed",
  );
  assert(
    deterministicDetectionReasons(
      approvedRun,
      approvedCandidate,
      {
        approvedVisualBaselineCount: 1,
        approvedVisualBaselineHash: baselineHash,
      },
    ).length === 0,
    "an exact immutable approved baseline hash should admit the deviation",
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
      metrics: {
        clickableAncestorPresent: false,
        isActuallyInteractive: true,
        minimumHeightDp: 23.24,
        minimumWidthDp: 102.86,
        thresholdDp: 48,
      },
      observationKind: "touch_target",
    },
    sentinel_key: "visual_product_experience_sentinel",
  };
  const touchPassingRun = {
    ...passingRun,
    metric_manifest: {
      metrics: {
        clickableAncestorPresent: false,
        isActuallyInteractive: true,
        minimumHeightDp: 48,
        minimumWidthDp: 102.86,
        thresholdDp: 48,
      },
      observationKind: "touch_target",
    },
    sentinel_key: "visual_product_experience_sentinel",
  };
  assert(
    deterministicResolutionReasons(
      touchPassingRun,
      finding,
      touchDetectionRun,
    ).includes("resolution_component_identity_unavailable"),
    "touch-target resolution must fail closed without a component identity",
  );
});
