import assert from "node:assert/strict";
import test from "node:test";
import productBaseline from "../../../config/intelligence/chillywood-product-experience-baseline-v1.json" with {
  type: "json",
};
import {
  APPROVED_OPTION_C_BASELINE_HASH,
  PRODUCT_QUALITY_EVALUATOR_ADAPTERS,
} from "../src/adapters/evaluator.mjs";

const UUID_RUN_DETECTION = "10000000-0000-4000-8000-000000000001";
const UUID_RUN_RESOLUTION = "20000000-0000-4000-8000-000000000002";
const UUID_FINDING = "30000000-0000-4000-8000-000000000003";
const UUID_TASK = "40000000-0000-4000-8000-000000000004";
const UUID_PROJECT = "50000000-0000-4000-8000-000000000005";
const UUID_CAPABILITY = "60000000-0000-4000-8000-000000000006";
const UUID_PROOF = "70000000-0000-4000-8000-000000000007";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);
const ASSERTION = "independent-evaluator-assertion-not-logged";
const ROUTE = "Home main tab";
const MAPPING_ID = "home_standard_discovery_rows";

const future = (offsetMs = 3_600_000) =>
  new Date(Date.now() + offsetMs).toISOString();

const touchTargetMetrics = (changes = {}) => ({
  accessibilityNamePresent: true,
  accessibilityRolePresent: true,
  applicableMinimumThreshold: 48,
  automationStatus: "observed",
  baselineComparisonHash: APPROVED_OPTION_C_BASELINE_HASH,
  baselineId: "chillywood-product-experience-baseline-v1",
  baselineState: "approved_baseline",
  baselineVersion: 1,
  componentIdentityHash: HASH_A,
  contentState: "loaded",
  evidenceQuality: "measured_installed",
  evidenceQualityHash: HASH_B,
  exceptionContractHash: null,
  exceptionContractId: null,
  exceptionType: "none",
  exceptionVersioned: false,
  interactiveAncestorActuallyInteractive: false,
  interactiveAncestorClickActionPresent: false,
  interactiveAncestorHeight: null,
  interactiveAncestorIsTargetContainer: false,
  interactiveAncestorPresent: false,
  interactiveAncestorRolePresent: false,
  interactiveAncestorWidth: null,
  interactiveTargetHeight: 23.24,
  interactiveTargetWidth: 102.86,
  isActuallyInteractive: true,
  measurementUnit: "dp",
  platform: "android",
  preferredThreshold: 48,
  providerState: "healthy",
  routeFamilyMappingHash:
    productBaseline.routeComponentMappingHashes[MAPPING_ID],
  routeFamilyMappingId: MAPPING_ID,
  screenDensityDpi: 420,
  surfaceFamily: "standard_streaming_card",
  targetClassification: "below_platform_minimum",
  ...changes,
});

const storedRun = ({
  evidenceHash,
  id,
  metrics,
  resultStatus,
}) => ({
  collector_capability_id: UUID_CAPABILITY,
  environment: "production",
  erased_at: null,
  evaluation_expires_at: future(),
  evidence_manifest_hash: evidenceHash,
  id,
  metric_manifest: {
    metrics,
    observationKind: "touch_target",
  },
  physical_proof_status: "installed_ui_observed",
  platform: "android",
  project_id: UUID_PROJECT,
  result_status: resultStatus,
  route_or_surface: ROUTE,
  sentinel_key: "visual_product_experience_sentinel",
  source_build_hash: HASH_C,
  task_id: UUID_TASK,
});

const activeBaseline = Object.freeze({
  baselineHash: APPROVED_OPTION_C_BASELINE_HASH,
  baselineId: "chillywood-product-experience-baseline-v1",
  count: 1,
  selectedOption: "creator_balanced",
  selectedOptionCode: "C",
  status: "owner_approved",
});

const detectionPayload = (changes = {}) => ({
  action: "evaluate_sentinel_detection",
  affectedComponentsHash: HASH_D,
  buildRuntimeHash: HASH_C,
  confidence: 1,
  evidenceHashes: [HASH_A],
  findingClass: "android_touch_target_below_48dp",
  physicalProofStatus: "installed_ui_observed",
  proposedNextInvestigationHash: HASH_E,
  providerBackendStateHash: HASH_B,
  reproductionState: "confirmed_defect",
  routeOrSurface: ROUTE,
  sentinelRunId: UUID_RUN_DETECTION,
  severity: "medium",
  suspectedLayer: "layout_density",
  userImpactHash: HASH_C,
  ...changes,
});

const proofReadback = (assessmentKind, sentinelRunId, verdict) => ({
  assessmentKind,
  evaluatorProofId: UUID_PROOF,
  sentinelRunId,
  validUntil: future(),
  verdict,
});

test("detection recomputes the Android 23.24dp classification and records a bound passing proof", async () => {
  const run = storedRun({
    evidenceHash: HASH_A,
    id: UUID_RUN_DETECTION,
    metrics: touchTargetMetrics(),
    resultStatus: "failed",
  });
  const calls = [];
  const result = await PRODUCT_QUALITY_EVALUATOR_ADAPTERS
    .evaluate_sentinel_detection.execute({
      database: {
        call: async (id, parameters) => {
          calls.push({ id, parameters });
          if (id === "productQualityEvaluatorSnapshot") {
            return {
              activeBaseline,
              detectionRun: null,
              finding: null,
              run,
            };
          }
          if (id === "productQualityDetectionAssessmentHash") return HASH_D;
          if (id === "productQualityRecordEvaluatorProof") {
            return proofReadback(
              "finding_detection",
              UUID_RUN_DETECTION,
              "passed",
            );
          }
          throw new Error(`unexpected:${id}`);
        },
      },
      env: {
        COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION: ASSERTION,
      },
      payload: detectionPayload(),
    });

  assert.equal(
    PRODUCT_QUALITY_EVALUATOR_ADAPTERS.evaluate_sentinel_detection.ready,
    true,
  );
  assert.deepEqual(result.reasons, []);
  assert.equal(result.verdict, "passed");
  assert.equal(result.assessmentHash, HASH_D);
  assert.equal(result.selfApproval, false);
  assert.deepEqual(calls.map(({ id }) => id), [
    "productQualityEvaluatorSnapshot",
    "productQualityDetectionAssessmentHash",
    "productQualityRecordEvaluatorProof",
  ]);
  assert.deepEqual(calls[0].parameters, [UUID_RUN_DETECTION, null]);
  assert.equal(calls[1].parameters.length, 14);
  assert.deepEqual(calls[1].parameters.slice(0, 7), [
    UUID_RUN_DETECTION,
    calls[1].parameters[1],
    ROUTE,
    HASH_C,
    "medium",
    HASH_C,
    [HASH_A],
  ]);
  assert.match(calls[1].parameters[1], /^pqf_[a-f0-9]{48}$/u);
  assert.deepEqual(calls[2].parameters.slice(0, 5), [
    UUID_RUN_DETECTION,
    "finding_detection",
    HASH_D,
    HASH_A,
    "passed",
  ]);
  assert.deepEqual(calls[2].parameters.slice(7), [
    "cognitive_product_quality_evaluator",
    ASSERTION,
  ]);
});

test("candidate assertions cannot override the deterministic classification", async () => {
  const run = storedRun({
    evidenceHash: HASH_A,
    id: UUID_RUN_DETECTION,
    metrics: touchTargetMetrics(),
    resultStatus: "failed",
  });
  let recordedVerdict = null;
  const result = await PRODUCT_QUALITY_EVALUATOR_ADAPTERS
    .evaluate_sentinel_detection.execute({
      database: {
        call: async (id, parameters) => {
          if (id === "productQualityEvaluatorSnapshot") {
            return {
              activeBaseline,
              detectionRun: null,
              finding: null,
              run,
            };
          }
          if (id === "productQualityDetectionAssessmentHash") return HASH_D;
          if (id === "productQualityRecordEvaluatorProof") {
            recordedVerdict = parameters[4];
            return proofReadback(
              "finding_detection",
              UUID_RUN_DETECTION,
              parameters[4],
            );
          }
          throw new Error(`unexpected:${id}`);
        },
      },
      env: {
        COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION: ASSERTION,
      },
      payload: detectionPayload({ severity: "high" }),
    });

  assert.equal(recordedVerdict, "rejected");
  assert.equal(result.verdict, "rejected");
  assert.deepEqual(result.reasons, [
    "deterministic_finding_profile_mismatch",
  ]);
});

test("resolution uses the later passing run plus the original detection run", async () => {
  const detectionRun = storedRun({
    evidenceHash: HASH_A,
    id: UUID_RUN_DETECTION,
    metrics: touchTargetMetrics(),
    resultStatus: "failed",
  });
  const run = storedRun({
    evidenceHash: HASH_B,
    id: UUID_RUN_RESOLUTION,
    metrics: touchTargetMetrics({
      interactiveTargetHeight: 48,
      targetClassification: "meets_platform_minimum",
    }),
    resultStatus: "passed",
  });
  const finding = {
    current_status: "open",
    environment: "production",
    erased_at: null,
    id: UUID_FINDING,
    platform: "android",
    project_id: UUID_PROJECT,
    route_or_surface: ROUTE,
    sentinel_run_id: UUID_RUN_DETECTION,
    task_id: UUID_TASK,
  };
  const calls = [];
  const result = await PRODUCT_QUALITY_EVALUATOR_ADAPTERS
    .evaluate_sentinel_resolution.execute({
      database: {
        call: async (id, parameters) => {
          calls.push({ id, parameters });
          if (id === "productQualityEvaluatorSnapshot") {
            return { activeBaseline, detectionRun, finding, run };
          }
          if (id === "productQualityResolutionAssessmentHash") return HASH_E;
          if (id === "productQualityRecordEvaluatorProof") {
            return proofReadback(
              "finding_resolution",
              UUID_RUN_RESOLUTION,
              "passed",
            );
          }
          throw new Error(`unexpected:${id}`);
        },
      },
      env: {
        COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION: ASSERTION,
      },
      payload: {
        action: "evaluate_sentinel_resolution",
        findingId: UUID_FINDING,
        resolutionReasonHash: HASH_C,
        sentinelRunId: UUID_RUN_RESOLUTION,
      },
    });

  assert.equal(
    PRODUCT_QUALITY_EVALUATOR_ADAPTERS.evaluate_sentinel_resolution.ready,
    true,
  );
  assert.deepEqual(result.reasons, []);
  assert.equal(result.verdict, "passed");
  assert.deepEqual(calls[0].parameters, [
    UUID_RUN_RESOLUTION,
    UUID_FINDING,
  ]);
  assert.deepEqual(calls[1].parameters, [
    UUID_FINDING,
    UUID_RUN_RESOLUTION,
    HASH_B,
    HASH_C,
  ]);
  assert.deepEqual(calls[2].parameters.slice(0, 5), [
    UUID_RUN_RESOLUTION,
    "finding_resolution",
    HASH_E,
    HASH_B,
    "passed",
  ]);
});

test("resolution fails closed before hashing when the original detection run is absent", async () => {
  const run = storedRun({
    evidenceHash: HASH_B,
    id: UUID_RUN_RESOLUTION,
    metrics: touchTargetMetrics({
      interactiveTargetHeight: 48,
      targetClassification: "meets_platform_minimum",
    }),
    resultStatus: "passed",
  });
  const finding = {
    current_status: "open",
    environment: "production",
    erased_at: null,
    id: UUID_FINDING,
    platform: "android",
    project_id: UUID_PROJECT,
    route_or_surface: ROUTE,
    sentinel_run_id: UUID_RUN_DETECTION,
    task_id: UUID_TASK,
  };
  const calls = [];
  await assert.rejects(
    PRODUCT_QUALITY_EVALUATOR_ADAPTERS.evaluate_sentinel_resolution.execute({
      database: {
        call: async (id) => {
          calls.push(id);
          return {
            activeBaseline,
            detectionRun: null,
            finding,
            run,
          };
        },
      },
      env: {
        COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION: ASSERTION,
      },
      payload: {
        action: "evaluate_sentinel_resolution",
        findingId: UUID_FINDING,
        resolutionReasonHash: HASH_C,
        sentinelRunId: UUID_RUN_RESOLUTION,
      },
    }),
    /sentinel_resolution_snapshot_rejected/u,
  );
  assert.deepEqual(calls, ["productQualityEvaluatorSnapshot"]);
});
