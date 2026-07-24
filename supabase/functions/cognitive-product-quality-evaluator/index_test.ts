import {
  deterministicDetectionReasons,
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

Deno.test("Android touch classification is derived from stored run metrics", () => {
  const payload = validPayload();
  const run = {
    environment: "production",
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
