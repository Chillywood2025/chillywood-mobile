import { ready } from "./helpers.mjs";

const SERVICE_IDENTITY = "cognitive_product_quality_triage";

export const PRODUCT_QUALITY_TRIAGE_ADAPTERS = Object.freeze({
  triage_detection: ready(
    ["triage_detection"],
    ({ database, env, payload }) =>
      database.call("triageDetection", [
        payload.sentinelRunId,
        payload.evaluatorProofId,
        payload.evaluatorProofHash,
        payload.findingClass,
        payload.routeOrSurface,
        payload.buildRuntimeHash,
        payload.severity,
        payload.userImpactHash,
        payload.evidenceHashes,
        payload.suspectedLayer,
        payload.confidence,
        payload.reproductionState,
        payload.affectedComponentsHash,
        payload.providerBackendStateHash,
        payload.proposedNextInvestigationHash,
        payload.physicalProofStatus,
        SERVICE_IDENTITY,
        env.COGNITIVE_PRODUCT_QUALITY_TRIAGE_ASSERTION,
      ]),
  ),
  triage_resolution: ready(
    ["triage_resolution"],
    ({ database, env, payload }) =>
      database.call("triageResolution", [
        payload.findingId,
        payload.sentinelRunId,
        payload.evaluatorProofId,
        payload.evaluatorProofHash,
        payload.resolutionReasonHash,
        SERVICE_IDENTITY,
        env.COGNITIVE_PRODUCT_QUALITY_TRIAGE_ASSERTION,
      ]),
  ),
  triage_no_finding: ready(
    ["triage_no_finding"],
    ({ database, env, payload }) =>
      database.call("triageNoFinding", [
        payload.sentinelRunId,
        payload.evaluatorProofId,
        payload.evaluatorProofHash,
        SERVICE_IDENTITY,
        env.COGNITIVE_PRODUCT_QUALITY_TRIAGE_ASSERTION,
      ]),
  ),
});
