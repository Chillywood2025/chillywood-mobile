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
  const candidate = {
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
  };
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
        metric_manifest: { observationKind: "search_accessibility" },
      },
      finding,
      detectionRun,
    ).includes("resolution_observation_kind_mismatch"),
    "unrelated passing observation must not resolve a finding",
  );
});
