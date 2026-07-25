import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  type CanonicalSecurityPolicy,
  classifyCanonicalSecurityPayload,
} from "../../../_lib/cognitivePolicyEngine.ts";
import securityPolicyJson from "../../../config/intelligence/cognitive-security-classification-policy.json" with {
  type: "json",
};
import productBaselineJson from "../../../config/intelligence/chillywood-product-experience-baseline-v1.json" with {
  type: "json",
};
import objectiveAccessibilityBindingsJson from "../../../config/intelligence/product-experience-objective-accessibility-surface-bindings-v1.json" with {
  type: "json",
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };
type SupabaseClientLike = ReturnType<typeof createClient<any>>;

type DetectionCandidate = Readonly<{
  affectedComponentsHash: string;
  buildRuntimeHash: string;
  confidence: number;
  evidenceHashes: readonly string[];
  findingClass: string;
  physicalProofStatus: string;
  proposedNextInvestigationHash: string;
  providerBackendStateHash: string;
  reproductionState: string;
  routeOrSurface: string;
  severity: string;
  suspectedLayer: string;
  userImpactHash: string;
}>;

type ResolutionCandidate = Readonly<{
  findingId: string;
  resolutionReasonHash: string;
  sentinelRunId: string;
}>;

type StoredFinding = Readonly<{
  current_status: string;
  environment: string;
  erased_at: string | null;
  id: string;
  platform: string;
  project_id: string;
  route_or_surface: string;
  sentinel_run_id: string;
  task_id: string;
}>;

type StoredRun = Readonly<{
  collector_capability_id: string | null;
  environment: string;
  erased_at: string | null;
  evaluation_expires_at: string;
  evidence_manifest_hash: string;
  id: string;
  metric_manifest: JsonObject;
  physical_proof_status: string;
  platform: string;
  project_id: string;
  result_status: string;
  route_or_surface: string;
  runtime_identity_hash: string;
  sentinel_key: string;
  source_build_hash: string;
  task_id: string;
}>;

export type DetectionEvaluationContext = Readonly<{
  approvedVisualBaselineCount: number;
  approvedVisualBaselineHash: string | null;
}>;

type DeterministicFindingProfile = Readonly<{
  confidence: number;
  findingClass: string;
  reproductionState: string;
  severity: string;
  suspectedLayer: string;
}>;

export type DeterministicVisualClassification =
  | "accessibility_violation"
  | "automation_failure"
  | "baseline_ambiguity"
  | "confirmed_baseline_violation"
  | "content_data_absent"
  | "false_positive"
  | "insufficient_evidence"
  | "provider_blocked"
  | "route_specific_exception";

type DeterministicVisualAssessment = Readonly<{
  classification: DeterministicVisualClassification;
  profile: DeterministicFindingProfile | null;
}>;

const SERVICE_IDENTITY = "cognitive_product_quality_evaluator";
const INVOCATION_HEADER = "x-cognitive-evaluator-invocation";
const MAX_REQUEST_BYTES = 32 * 1024;
export const APPROVED_OPTION_C_BASELINE_HASH =
  "34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba";
const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const FINDING_CLASS = /^[a-z0-9][a-z0-9._-]{2,80}$/u;
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
const BASELINE_EVALUATION_KEYS = Object.freeze([
  "action",
  "executionId",
  "executionReceiptHash",
]);
const NO_FINDING_KEYS = Object.freeze(["action", "sentinelRunId"]);
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
const DEFAULT_ROUTE_RESOLUTION_MS = 10_000;
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
] as const);
const LIVEKIT_TIMING_METRICS = Object.freeze([
  "firstRemoteMediaElapsedMs",
  "roomConnectElapsedMs",
  "tokenIssuedElapsedMs",
  "uiStateResolutionElapsedMs",
] as const);
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
  "scenarioType",
  "stageFailureCategory",
  "tokenResultStatus",
] as const);
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
const LIVEKIT_SCENARIO_TYPES = new Set([
  "success_baseline",
  "bounded_failure_fixture",
  "background_foreground_recovery",
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
const SURFACE_FAMILIES = new Set([
  "standard_streaming_card",
  "live_streaming_card",
  "creator_streaming_card",
  "featured_hero_card",
  "vertical_post_card",
  "compact_media_list_item",
  "non_media_interactive_surface",
]);
const OPTION_C_TARGET_FAMILIES = new Set([
  "standard_streaming_card",
  "live_streaming_card",
  "creator_streaming_card",
]);
const ROUTE_MAPPING_HASHES = productBaselineJson
  .routeComponentMappingHashes as Record<string, string>;
const EXCEPTION_CONTRACT_HASHES = productBaselineJson
  .exceptionContractHashes as Record<string, string>;
const ROUTE_MAPPINGS = new Map(
  productBaselineJson.routeComponentMappings.map((mapping) => [
    mapping.mappingId,
    mapping,
  ]),
);
const OBJECTIVE_ACCESSIBILITY_BINDINGS = new Map(
  objectiveAccessibilityBindingsJson.canonicalBindingPayload.bindings.map(
    (binding) => [binding.bindingId, binding],
  ),
);
const OBJECTIVE_ACCESSIBILITY_COMPONENT_SET_HASH =
  objectiveAccessibilityBindingsJson.canonicalBindingPayload.componentSetHash;
const BASELINE_VARIANCE = productBaselineJson.allowedVariance;

const baselineContractBindingIsValid = (
  run: StoredRun,
  metrics: Record<string, unknown>,
): boolean => {
  const mappingId = toText(metrics.routeFamilyMappingId);
  const mapping = ROUTE_MAPPINGS.get(mappingId);
  if (
    !mapping ||
    toText(run.route_or_surface) !== mapping.route ||
    toText(metrics.routeFamilyMappingHash) !==
      ROUTE_MAPPING_HASHES[mappingId] ||
    toText(metrics.surfaceFamily) !== mapping.family
  ) {
    return false;
  }
  const exceptionId = mapping.exceptionContractId;
  if (exceptionId === null) {
    return metrics.exceptionContractId === null &&
      metrics.exceptionContractHash === null &&
      metrics.exceptionVersioned === false;
  }
  return toText(metrics.exceptionContractId) === exceptionId &&
    toText(metrics.exceptionContractHash) ===
      EXCEPTION_CONTRACT_HASHES[exceptionId] &&
    metrics.exceptionVersioned === true;
};
const objectiveAccessibilityBindingIsValid = (
  run: StoredRun,
  metrics: Record<string, unknown>,
): boolean => {
  const binding = OBJECTIVE_ACCESSIBILITY_BINDINGS.get(
    toText(metrics.routeFamilyMappingId),
  );
  return !!binding &&
    binding.objectiveAccessibilityOnly === true &&
    binding.allowsVisualDensityComparison === false &&
    toText(run.route_or_surface) === binding.routeOrSurface &&
    toText(metrics.routeFamilyMappingHash) === binding.bindingHash &&
    toText(metrics.componentIdentityHash) ===
      OBJECTIVE_ACCESSIBILITY_COMPONENT_SET_HASH &&
    toText(metrics.surfaceFamily) === binding.surfaceFamily &&
    toText(metrics.exceptionContractId) === binding.exceptionContractId &&
    toText(metrics.exceptionContractHash) ===
      EXCEPTION_CONTRACT_HASHES[binding.exceptionContractId] &&
    metrics.exceptionVersioned === true &&
    toText(metrics.exceptionType) === "non_media_surface" &&
    toText(metrics.targetClassification) !== "meets_wcag_aa_minimum_only";
};
const VERSIONED_EXCEPTION_FAMILIES = new Set([
  "featured_hero_card",
  "vertical_post_card",
]);
const PLATFORM_MEASUREMENT_UNITS = Object.freeze({
  android: "dp",
  ios: "pt",
  web: "css_px",
});
const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers":
    `authorization, x-client-info, apikey, content-type, ${INVOCATION_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});
const SECURITY_POLICY = securityPolicyJson as CanonicalSecurityPolicy;

const json = (status: number, body: JsonObject): Response =>
  new Response(JSON.stringify(body), { headers: CORS_HEADERS, status });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const toText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index]);
};
const safePayload = (value: unknown): boolean =>
  classifyCanonicalSecurityPayload(value, SECURITY_POLICY) === "safe";
const hashesAreBounded = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= 64 &&
  value.every((item) => typeof item === "string" && LOWER_HEX_64.test(item));

export const isStrictSentinelEvaluationPayload = (
  value: unknown,
): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  if (value.action === "evaluate_product_baseline_selection") {
    return hasExactKeys(value, BASELINE_EVALUATION_KEYS) &&
      typeof value.executionId === "string" &&
      UUID.test(value.executionId) &&
      typeof value.executionReceiptHash === "string" &&
      LOWER_HEX_64.test(value.executionReceiptHash) &&
      safePayload({ action: value.action });
  }
  if (value.action === "evaluate_sentinel_resolution") {
    return hasExactKeys(value, RESOLUTION_KEYS) &&
      typeof value.findingId === "string" &&
      UUID.test(value.findingId) &&
      typeof value.sentinelRunId === "string" &&
      UUID.test(value.sentinelRunId) &&
      typeof value.resolutionReasonHash === "string" &&
      LOWER_HEX_64.test(value.resolutionReasonHash) &&
      safePayload({ action: value.action });
  }
  if (value.action === "evaluate_sentinel_no_finding") {
    return hasExactKeys(value, NO_FINDING_KEYS) &&
      typeof value.sentinelRunId === "string" &&
      UUID.test(value.sentinelRunId) &&
      safePayload({ action: value.action });
  }
  if (!hasExactKeys(value, DETECTION_KEYS)) return false;
  return value.action === "evaluate_sentinel_detection" &&
    typeof value.sentinelRunId === "string" &&
    UUID.test(value.sentinelRunId) &&
    typeof value.findingClass === "string" &&
    FINDING_CLASS.test(value.findingClass) &&
    typeof value.routeOrSurface === "string" &&
    value.routeOrSurface.length >= 1 &&
    value.routeOrSurface.length <= 160 &&
    typeof value.buildRuntimeHash === "string" &&
    LOWER_HEX_64.test(value.buildRuntimeHash) &&
    SEVERITIES.has(toText(value.severity)) &&
    typeof value.userImpactHash === "string" &&
    LOWER_HEX_64.test(value.userImpactHash) &&
    hashesAreBounded(value.evidenceHashes) &&
    SUSPECTED_LAYERS.has(toText(value.suspectedLayer)) &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    REPRODUCTION_STATES.has(toText(value.reproductionState)) &&
    typeof value.affectedComponentsHash === "string" &&
    LOWER_HEX_64.test(value.affectedComponentsHash) &&
    typeof value.providerBackendStateHash === "string" &&
    LOWER_HEX_64.test(value.providerBackendStateHash) &&
    typeof value.proposedNextInvestigationHash === "string" &&
    LOWER_HEX_64.test(value.proposedNextInvestigationHash) &&
    PHYSICAL_PROOF_STATUSES.has(toText(value.physicalProofStatus)) &&
    safePayload({
      action: value.action,
      findingClass: value.findingClass,
      physicalProofStatus: value.physicalProofStatus,
      reproductionState: value.reproductionState,
      routeOrSurface: value.routeOrSurface,
      severity: value.severity,
      suspectedLayer: value.suspectedLayer,
    });
};

const toCandidate = (payload: Record<string, unknown>): DetectionCandidate => ({
  affectedComponentsHash: String(payload.affectedComponentsHash),
  buildRuntimeHash: String(payload.buildRuntimeHash),
  confidence: Number(payload.confidence),
  evidenceHashes: Object.freeze([...(payload.evidenceHashes as string[])]),
  findingClass: String(payload.findingClass),
  physicalProofStatus: String(payload.physicalProofStatus),
  proposedNextInvestigationHash: String(payload.proposedNextInvestigationHash),
  providerBackendStateHash: String(payload.providerBackendStateHash),
  reproductionState: String(payload.reproductionState),
  routeOrSurface: String(payload.routeOrSurface),
  severity: String(payload.severity),
  suspectedLayer: String(payload.suspectedLayer),
  userImpactHash: String(payload.userImpactHash),
});

const toResolutionCandidate = (
  payload: Record<string, unknown>,
): ResolutionCandidate => ({
  findingId: String(payload.findingId),
  resolutionReasonHash: String(payload.resolutionReasonHash),
  sentinelRunId: String(payload.sentinelRunId),
});

const metricObject = (run: StoredRun): Record<string, unknown> | null => {
  const value = run.metric_manifest.metrics;
  return isRecord(value) ? value : null;
};

const metricNumber = (
  metrics: Record<string, unknown>,
  key: string,
): number | null => {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const ROUTE_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/u;
const ROUTE_FAMILY_ID = /^[a-z0-9][a-z0-9._/-]{1,79}$/u;
const ROUTE_RESOLUTION_STATES = Object.freeze({
  content_state: "content_loaded",
  empty_state: "empty_state",
  reviewed_error_state: "reviewed_error_state",
} as const);
const ROUTE_INTERACTION_EVIDENCE = new Set([
  "accessibility_tree",
  "direct_interaction",
  "both",
]);

export const routeTimingNoFindingReasons = (
  run: StoredRun,
  metrics: Record<string, unknown>,
): readonly string[] => {
  const reasons = new Set<string>();
  const navigationStarted = metricNumber(
    metrics,
    "navigationStartMonotonicMs",
  );
  const firstRendered = metricNumber(metrics, "firstRenderedMonotonicMs");
  const firstInteractive = metricNumber(
    metrics,
    "firstInteractiveMonotonicMs",
  );
  const resolvedAt = metricNumber(metrics, "resolvedStateMonotonicMs");
  const elapsedDuration = metricNumber(metrics, "elapsedDurationMs");
  const maximumDuration = metricNumber(metrics, "maximumDurationMs");
  const resolutionKind = toText(metrics.resolutionKind);
  const expectedFinalState =
    ROUTE_RESOLUTION_STATES[
      resolutionKind as keyof typeof ROUTE_RESOLUTION_STATES
    ];
  const evidenceHashes = run.metric_manifest.evidenceHashes;

  if (
    !ROUTE_IDENTITY.test(toText(metrics.appVersion)) ||
    !ROUTE_IDENTITY.test(toText(metrics.appBuild)) ||
    !ROUTE_IDENTITY.test(toText(metrics.runtimeVersion)) ||
    !ROUTE_IDENTITY.test(toText(metrics.channel))
  ) {
    reasons.add("route_timing_app_identity_required");
  }
  if (
    toText(metrics.platform) !== run.platform ||
    toText(metrics.routeOrSurface) !== run.route_or_surface ||
    !ROUTE_FAMILY_ID.test(toText(metrics.routeFamilyId)) ||
    !LOWER_HEX_64.test(toText(metrics.routeFamilyBindingHash))
  ) {
    reasons.add("route_timing_route_family_binding_required");
  }
  if (
    toText(metrics.runtimeIdentityHash) !== run.runtime_identity_hash ||
    toText(metrics.buildRuntimeHash) !== run.source_build_hash ||
    toText(metrics.sanitizedEvidenceHash) !== run.evidence_manifest_hash ||
    !Array.isArray(evidenceHashes) ||
    !evidenceHashes.includes(run.evidence_manifest_hash)
  ) {
    reasons.add("route_timing_evidence_binding_required");
  }
  if (
    toText(metrics.installedProofStatus) !== run.physical_proof_status ||
    !["installed_ui_observed", "simulator_observed"].includes(
      run.physical_proof_status,
    ) ||
    metrics.syntheticAccount !== true
  ) {
    reasons.add("route_timing_installed_synthetic_proof_required");
  }
  if (
    metrics.networkReadyBeforeNavigation !== true ||
    toText(metrics.networkState) !== "ready" ||
    metrics.timeoutObserved !== false ||
    metricNumber(metrics, "unresolvedStateCount") !== 0
  ) {
    reasons.add("resolved_route_timing_required");
  }
  if (
    navigationStarted === null ||
    firstRendered === null ||
    firstInteractive === null ||
    resolvedAt === null ||
    navigationStarted < 0 ||
    firstRendered < navigationStarted ||
    firstInteractive < firstRendered ||
    resolvedAt < firstInteractive ||
    elapsedDuration === null ||
    maximumDuration === null ||
    maximumDuration < 1 ||
    maximumDuration > DEFAULT_ROUTE_RESOLUTION_MS ||
    elapsedDuration < 0 ||
    elapsedDuration > maximumDuration ||
    resolvedAt - navigationStarted !== elapsedDuration
  ) {
    reasons.add("route_timing_monotonic_stages_required");
  }
  if (
    !expectedFinalState ||
    toText(metrics.finalObservedState) !== expectedFinalState ||
    (resolutionKind === "reviewed_error_state") !==
      (metrics.reviewedErrorState === true)
  ) {
    reasons.add("route_timing_resolved_state_required");
  }
  if (
    !ROUTE_INTERACTION_EVIDENCE.has(
      toText(metrics.interactionEvidenceKind),
    ) ||
    !LOWER_HEX_64.test(toText(metrics.interactionEvidenceHash))
  ) {
    reasons.add("route_timing_interaction_evidence_required");
  }
  if (toText(metrics.findingDisposition) !== "no_finding") {
    reasons.add("route_timing_no_finding_linkage_required");
  }
  return Object.freeze([...reasons].sort());
};

const DEFAULT_EVALUATION_CONTEXT: DetectionEvaluationContext = Object.freeze({
  approvedVisualBaselineCount: 0,
  approvedVisualBaselineHash: null,
});

const profile = (
  findingClass: string,
  suspectedLayer: string,
  severity: string,
  confidence: number,
  reproductionState = "confirmed_defect",
): DeterministicFindingProfile =>
  Object.freeze({
    confidence,
    findingClass,
    reproductionState,
    severity,
    suspectedLayer,
  });

const candidateMatchesProfile = (
  candidate: DetectionCandidate,
  expected: DeterministicFindingProfile,
): boolean =>
  candidate.findingClass === expected.findingClass &&
  candidate.suspectedLayer === expected.suspectedLayer &&
  candidate.severity === expected.severity &&
  candidate.confidence === expected.confidence &&
  candidate.reproductionState === expected.reproductionState;

const visualAssessment = (
  classification: DeterministicVisualClassification,
  expectedProfile: DeterministicFindingProfile | null = null,
): DeterministicVisualAssessment =>
  Object.freeze({ classification, profile: expectedProfile });

const finiteMetric = (
  metrics: Record<string, unknown>,
  key: string,
  minimum = 0,
  maximum = 100_000,
): number | null => {
  const value = metricNumber(metrics, key);
  return value !== null && value >= minimum && value <= maximum ? value : null;
};

const integerMetric = (
  metrics: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
): number | null => {
  const value = finiteMetric(metrics, key, minimum, maximum);
  return value !== null && Number.isInteger(value) ? value : null;
};

const approximately = (
  value: number,
  expected: number,
  tolerance: number,
): boolean => Math.abs(value - expected) <= tolerance;

const requiredVisualNumber = (
  metrics: Record<string, unknown>,
  key: string,
): number | null => finiteMetric(metrics, key, 0, 10_000);

const visualFinding = (
  findingClass: string,
  severity: string,
): DeterministicVisualAssessment =>
  visualAssessment(
    "confirmed_baseline_violation",
    profile(findingClass, "layout_density", severity, 1),
  );

const accessibilityFinding = (
  findingClass: string,
  severity: string,
): DeterministicVisualAssessment =>
  visualAssessment(
    "accessibility_violation",
    profile(findingClass, "layout_density", severity, 1),
  );

export const deterministicVisualClassification = (
  run: StoredRun,
  context: DetectionEvaluationContext = DEFAULT_EVALUATION_CONTEXT,
): DeterministicVisualAssessment => {
  const metrics = metricObject(run);
  if (!metrics) return visualAssessment("insufficient_evidence");

  const observedClassification = toText(metrics.observedClassification);
  const conclude = (
    assessment: DeterministicVisualAssessment,
  ): DeterministicVisualAssessment => {
    const expectedByClassification: Readonly<
      Partial<Record<DeterministicVisualClassification, string>>
    > = Object.freeze({
      accessibility_violation: "accessibility_violation",
      automation_failure: "automation_failure",
      baseline_ambiguity: "baseline_ambiguity",
      confirmed_baseline_violation: "confirmed_baseline_violation",
      content_data_absent: "content_data_absence",
      false_positive: "within_baseline",
      provider_blocked: "provider_blocked",
      route_specific_exception: "route_specific_exception",
    });
    const expectedObservedClassification =
      expectedByClassification[assessment.classification];
    const observedMatches = assessment.classification ===
        "confirmed_baseline_violation"
      ? [
        "confirmed_baseline_violation",
        "product_preference_deviation",
      ].includes(observedClassification)
      : observedClassification === expectedObservedClassification;
    return !expectedObservedClassification || observedMatches
      ? assessment
      : visualAssessment("baseline_ambiguity");
  };

  const automationStatus = toText(metrics.automationStatus);
  if (["failed", "not_available"].includes(automationStatus)) {
    return conclude(visualAssessment("automation_failure"));
  }
  if (automationStatus !== "observed") {
    return visualAssessment("insufficient_evidence");
  }

  const evidenceQuality = toText(metrics.evidenceQuality);
  const expectedEvidenceQuality = run.physical_proof_status ===
      "installed_ui_observed"
    ? "measured_installed"
    : run.physical_proof_status === "simulator_observed"
    ? "measured_simulator"
    : "";
  if (
    evidenceQuality !== expectedEvidenceQuality ||
    !LOWER_HEX_64.test(toText(metrics.evidenceQualityHash))
  ) {
    return visualAssessment("insufficient_evidence");
  }

  const providerState = toText(metrics.providerState);
  const contentState = toText(metrics.contentState);
  if (providerState === "blocked") {
    return conclude(visualAssessment("provider_blocked"));
  }
  if (["empty", "error"].includes(contentState)) {
    return conclude(visualAssessment("content_data_absent"));
  }
  if (
    !["healthy", "degraded", "not_applicable"].includes(providerState) ||
    !["loaded", "partial", "not_applicable"].includes(contentState)
  ) {
    return visualAssessment("insufficient_evidence");
  }

  const baselineState = toText(metrics.baselineState);
  const comparisonHash = toText(metrics.baselineComparisonHash);
  if (
    baselineState !== "approved_baseline" ||
    context.approvedVisualBaselineCount !== 1 ||
    context.approvedVisualBaselineHash !== APPROVED_OPTION_C_BASELINE_HASH ||
    comparisonHash !== APPROVED_OPTION_C_BASELINE_HASH ||
    toText(metrics.baselineId) !==
      "chillywood-product-experience-baseline-v1" ||
    metricNumber(metrics, "baselineVersion") !== 1
  ) {
    return conclude(visualAssessment("baseline_ambiguity"));
  }

  const platform = toText(metrics.platform);
  const measurementUnit = toText(metrics.measurementUnit);
  const expectedMeasurementUnit = PLATFORM_MEASUREMENT_UNITS[
    run.platform as keyof typeof PLATFORM_MEASUREMENT_UNITS
  ];
  const surfaceFamily = toText(metrics.surfaceFamily);
  const componentIdentityHash = toText(metrics.componentIdentityHash);
  const routeFamilyMappingHash = toText(metrics.routeFamilyMappingHash);
  const preferredThreshold = metricNumber(
    metrics,
    "interactivePreferredThreshold",
  );
  const applicableMinimumThreshold = metricNumber(
    metrics,
    "interactiveApplicableMinimumThreshold",
  );
  const expectedPreferredThreshold = run.platform === "android" ? 48 : 44;
  const expectedApplicableMinimum = run.platform === "web"
    ? 24
    : expectedPreferredThreshold;
  if (
    platform !== run.platform ||
    !expectedMeasurementUnit ||
    measurementUnit !== expectedMeasurementUnit ||
    !SURFACE_FAMILIES.has(surfaceFamily) ||
    !LOWER_HEX_64.test(componentIdentityHash) ||
    !LOWER_HEX_64.test(routeFamilyMappingHash) ||
    !baselineContractBindingIsValid(run, metrics) ||
    preferredThreshold !== expectedPreferredThreshold ||
    applicableMinimumThreshold !== expectedApplicableMinimum
  ) {
    return conclude(visualAssessment("baseline_ambiguity"));
  }
  if (
    !["portrait", "landscape"].includes(toText(metrics.orientation)) ||
    !["compact", "medium", "expanded"].includes(toText(metrics.windowClass)) ||
    ![
      "horizontal_row",
      "grid",
      "full_width",
      "compact_list",
      "non_media",
    ].includes(toText(metrics.layoutMode)) ||
    ![
      "phone_portrait_390x844",
      "tablet_portrait_1024x1366",
      "non_reference",
    ].includes(toText(metrics.referenceViewport)) ||
    !["option_c_default", "explicit_versioned_exception"].includes(
      toText(metrics.baselineApplicability),
    ) ||
    !["16:9", "9:16", "4:5", "1:1", "not_applicable"].includes(
      toText(metrics.aspectRatioClass),
    ) ||
    typeof metrics.creatorIdentityVisible !== "boolean" ||
    typeof metrics.liveStateVisible !== "boolean" ||
    typeof metrics.liveContent !== "boolean"
  ) {
    return visualAssessment("insufficient_evidence");
  }
  const screenDensityDpi = metrics.screenDensityDpi;
  if (
    (
      run.platform === "android" &&
      (
        typeof screenDensityDpi !== "number" ||
        !Number.isFinite(screenDensityDpi) ||
        screenDensityDpi < 72 ||
        screenDensityDpi > 1000
      )
    ) ||
    (run.platform !== "android" && screenDensityDpi !== null)
  ) {
    return conclude(visualAssessment("baseline_ambiguity"));
  }

  const interactiveTargetWidth = requiredVisualNumber(
    metrics,
    "interactiveTargetWidth",
  );
  const interactiveTargetHeight = requiredVisualNumber(
    metrics,
    "interactiveTargetHeight",
  );
  if (
    interactiveTargetWidth === null ||
    interactiveTargetHeight === null
  ) {
    return visualAssessment("insufficient_evidence");
  }
  if (
    typeof metrics.accessibilityNamePresent !== "boolean" ||
    typeof metrics.accessibilityRolePresent !== "boolean"
  ) {
    return visualAssessment("insufficient_evidence");
  }
  if (
    metrics.accessibilityNamePresent !== true ||
    metrics.accessibilityRolePresent !== true
  ) {
    return conclude(
      visualAssessment(
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
  const minimumInteractiveTarget = Math.min(
    interactiveTargetWidth,
    interactiveTargetHeight,
  );
  if (run.platform === "android" && minimumInteractiveTarget < 48) {
    return conclude(
      accessibilityFinding("android_touch_target_below_48dp", "medium"),
    );
  }
  if (run.platform === "ios" && minimumInteractiveTarget < 44) {
    return conclude(
      accessibilityFinding("ios_touch_target_below_44pt", "medium"),
    );
  }
  if (run.platform === "web" && minimumInteractiveTarget < 24) {
    return conclude(
      accessibilityFinding(
        "web_touch_target_below_wcag_24csspx",
        "medium",
      ),
    );
  }
  if (run.platform === "web" && minimumInteractiveTarget < 44) {
    return conclude(
      visualFinding(
        "web_touch_target_below_preferred_44csspx",
        "low",
      ),
    );
  }

  {
    const mediaWidth = requiredVisualNumber(metrics, "mediaFrameWidth");
    const mediaHeight = requiredVisualNumber(metrics, "mediaFrameHeight");
    const containerWidth = requiredVisualNumber(
      metrics,
      "totalCardContainerWidth",
    );
    const containerHeight = requiredVisualNumber(
      metrics,
      "totalCardContainerHeight",
    );
    const metadataHeight = requiredVisualNumber(metrics, "metadataBandHeight");
    const measuredViewportWidth = requiredVisualNumber(
      metrics,
      "viewportWidth",
    );
    const measuredViewportHeight = requiredVisualNumber(
      metrics,
      "viewportHeight",
    );
    const measuredWidthRatio = finiteMetric(
      metrics,
      "cardViewportWidthRatio",
      0,
      2,
    );
    const measuredHeightRatio = finiteMetric(
      metrics,
      "cardViewportHeightRatio",
      0,
      2,
    );
    if (
      mediaWidth === null ||
      mediaHeight === null ||
      containerWidth === null ||
      containerHeight === null ||
      metadataHeight === null ||
      measuredViewportWidth === null ||
      measuredViewportHeight === null ||
      measuredWidthRatio === null ||
      measuredHeightRatio === null
    ) {
      return visualAssessment("insufficient_evidence");
    }
    const nonMedia = surfaceFamily === "non_media_interactive_surface";
    if (
      measuredViewportWidth <= 0 ||
      measuredViewportHeight <= 0 ||
      containerWidth <= 0 ||
      containerHeight <= 0 ||
      (
        nonMedia &&
        (
          mediaWidth !== 0 ||
          mediaHeight !== 0 ||
          metadataHeight !== 0 ||
          toText(metrics.aspectRatioClass) !== "not_applicable"
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
      !approximately(
        measuredWidthRatio,
        containerWidth / measuredViewportWidth,
        0.02,
      ) ||
      !approximately(
        measuredHeightRatio,
        containerHeight / measuredViewportHeight,
        0.02,
      )
    ) {
      return conclude(visualAssessment("automation_failure"));
    }
  }

  const exceptionVersioned = metrics.exceptionVersioned;
  if (VERSIONED_EXCEPTION_FAMILIES.has(surfaceFamily)) {
    const expectedExceptionType = surfaceFamily === "featured_hero_card"
      ? "featured_hero"
      : "vertical_short_form";
    if (
      exceptionVersioned !== true ||
      toText(metrics.baselineApplicability) !==
        "explicit_versioned_exception" ||
      toText(metrics.exceptionType) !== expectedExceptionType ||
      !LOWER_HEX_64.test(toText(metrics.exceptionContractHash))
    ) {
      return conclude(visualAssessment("baseline_ambiguity"));
    }
    if (surfaceFamily === "featured_hero_card") {
      return toText(metrics.featuredPlacement) === "first_row"
        ? conclude(visualAssessment("route_specific_exception"))
        : conclude(
          visualFinding("visual_featured_hero_outside_first_row", "medium"),
        );
    }
    const aspectRatioClass = toText(metrics.aspectRatioClass);
    const verticalMediaWidth = requiredVisualNumber(metrics, "mediaFrameWidth");
    const verticalMediaHeight = requiredVisualNumber(
      metrics,
      "mediaFrameHeight",
    );
    const expectedVerticalRatio = aspectRatioClass === "9:16"
      ? 9 / 16
      : aspectRatioClass === "4:5"
      ? 4 / 5
      : null;
    return expectedVerticalRatio !== null &&
        verticalMediaWidth !== null &&
        verticalMediaHeight !== null &&
        verticalMediaHeight > 0 &&
        Math.abs(
            verticalMediaWidth / verticalMediaHeight - expectedVerticalRatio,
          ) <= 0.02
      ? conclude(visualAssessment("route_specific_exception"))
      : conclude(
        visualFinding("visual_vertical_post_aspect_ratio_deviation", "medium"),
      );
  }
  if (
    ["compact_media_list_item", "non_media_interactive_surface"].includes(
      surfaceFamily,
    )
  ) {
    const expectedExceptionType = surfaceFamily === "compact_media_list_item"
      ? "compact_media_list"
      : "non_media_surface";
    return exceptionVersioned === true &&
        toText(metrics.baselineApplicability) ===
          "explicit_versioned_exception" &&
        toText(metrics.exceptionType) === expectedExceptionType &&
        LOWER_HEX_64.test(toText(metrics.exceptionContractHash)) &&
        toText(metrics.featuredPlacement) === "not_applicable"
      ? conclude(visualAssessment("route_specific_exception"))
      : conclude(visualAssessment("baseline_ambiguity"));
  }
  if (
    !OPTION_C_TARGET_FAMILIES.has(surfaceFamily) ||
    exceptionVersioned !== false ||
    toText(metrics.baselineApplicability) !== "option_c_default" ||
    toText(metrics.exceptionType) !== "none" ||
    metrics.exceptionContractHash !== null ||
    toText(metrics.featuredPlacement) !== "not_applicable"
  ) {
    return conclude(visualAssessment("baseline_ambiguity"));
  }

  const mediaFrameWidth = requiredVisualNumber(metrics, "mediaFrameWidth");
  const mediaFrameHeight = requiredVisualNumber(metrics, "mediaFrameHeight");
  const totalCardContainerWidth = requiredVisualNumber(
    metrics,
    "totalCardContainerWidth",
  );
  const totalCardContainerHeight = requiredVisualNumber(
    metrics,
    "totalCardContainerHeight",
  );
  const metadataBandHeight = requiredVisualNumber(
    metrics,
    "metadataBandHeight",
  );
  const viewportWidth = requiredVisualNumber(metrics, "viewportWidth");
  const viewportHeight = requiredVisualNumber(metrics, "viewportHeight");
  const cardViewportWidthRatio = finiteMetric(
    metrics,
    "cardViewportWidthRatio",
    0,
    10,
  );
  const cardViewportHeightRatio = finiteMetric(
    metrics,
    "cardViewportHeightRatio",
    0,
    10,
  );
  const horizontalCardsVisible = finiteMetric(
    metrics,
    "horizontalCardsVisible",
    0,
    100,
  );
  const cardsAboveFold = integerMetric(metrics, "cardsAboveFold", 0, 100);
  const horizontalGap = requiredVisualNumber(metrics, "horizontalGap");
  const verticalRowGap = requiredVisualNumber(metrics, "verticalRowGap");
  const titleLineCount = integerMetric(metrics, "titleLineCount", 0, 20);
  const metadataLineCount = integerMetric(metrics, "metadataLineCount", 0, 20);
  const horizontalMargin = requiredVisualNumber(metrics, "horizontalMargin");
  const columnGap = requiredVisualNumber(metrics, "columnGap");
  const columnCount = integerMetric(metrics, "columnCount", 1, 12);
  if (
    mediaFrameWidth === null ||
    mediaFrameHeight === null ||
    totalCardContainerWidth === null ||
    totalCardContainerHeight === null ||
    metadataBandHeight === null ||
    viewportWidth === null ||
    viewportHeight === null ||
    cardViewportWidthRatio === null ||
    cardViewportHeightRatio === null ||
    horizontalCardsVisible === null ||
    cardsAboveFold === null ||
    horizontalGap === null ||
    verticalRowGap === null ||
    titleLineCount === null ||
    metadataLineCount === null ||
    horizontalMargin === null ||
    columnGap === null ||
    columnCount === null ||
    typeof metrics.creatorIdentityVisible !== "boolean" ||
    typeof metrics.liveStateVisible !== "boolean" ||
    typeof metrics.liveContent !== "boolean"
  ) {
    return visualAssessment("insufficient_evidence");
  }
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    mediaFrameWidth <= 0 ||
    mediaFrameHeight <= 0 ||
    totalCardContainerWidth < mediaFrameWidth ||
    totalCardContainerHeight < mediaFrameHeight + metadataBandHeight ||
    !approximately(
      cardViewportWidthRatio,
      totalCardContainerWidth / viewportWidth,
      0.02,
    ) ||
    !approximately(
      cardViewportHeightRatio,
      totalCardContainerHeight / viewportHeight,
      0.02,
    )
  ) {
    return conclude(visualAssessment("automation_failure"));
  }
  if (metrics.creatorIdentityVisible !== true) {
    return conclude(
      visualFinding("visual_creator_identity_missing", "medium"),
    );
  }
  if (
    (
      surfaceFamily === "live_streaming_card" ||
      metrics.liveContent === true
    ) &&
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
    toText(metrics.aspectRatioClass) !== "16:9" ||
    Math.abs(mediaFrameWidth / mediaFrameHeight - 16 / 9) > 0.02
  ) {
    return conclude(
      visualFinding("visual_option_c_aspect_ratio_deviation", "medium"),
    );
  }

  const referenceViewport = toText(metrics.referenceViewport);
  const orientation = toText(metrics.orientation);
  const windowClass = toText(metrics.windowClass);
  const layoutMode = toText(metrics.layoutMode);
  if (referenceViewport === "phone_portrait_390x844") {
    if (
      viewportWidth !== 390 ||
      viewportHeight !== 844 ||
      orientation !== "portrait" ||
      windowClass !== "compact" ||
      layoutMode !== "horizontal_row" ||
      !approximately(
        mediaFrameWidth,
        252,
        BASELINE_VARIANCE.referenceMediaDimensionLogicalUnits,
      ) ||
      !approximately(
        mediaFrameHeight,
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
        visualFinding(
          "visual_option_c_phone_portrait_deviation",
          "medium",
        ),
      );
    }
  } else if (referenceViewport === "tablet_portrait_1024x1366") {
    if (
      viewportWidth !== 1024 ||
      viewportHeight !== 1366 ||
      orientation !== "portrait" ||
      !["medium", "expanded"].includes(windowClass) ||
      layoutMode !== "grid" ||
      !approximately(
        mediaFrameWidth,
        307,
        BASELINE_VARIANCE.referenceMediaDimensionLogicalUnits,
      ) ||
      !approximately(
        mediaFrameHeight,
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
      !approximately(columnGap, 20, BASELINE_VARIANCE.spacingLogicalUnits) ||
      !approximately(
        verticalRowGap,
        24,
        BASELINE_VARIANCE.spacingLogicalUnits,
      ) ||
      columnCount !== 3
    ) {
      return conclude(
        visualFinding(
          "visual_option_c_tablet_portrait_deviation",
          "medium",
        ),
      );
    }
  } else if (referenceViewport === "non_reference") {
    const responsiveLayoutValid = (
      windowClass === "compact" &&
      orientation === "portrait" &&
      layoutMode === "horizontal_row" &&
      columnCount === 1
    ) ||
      (
        windowClass === "compact" &&
        orientation === "landscape" &&
        layoutMode === "grid" &&
        columnCount === 2
      ) ||
      (
        ["medium", "expanded"].includes(windowClass) &&
        layoutMode === "grid" &&
        [3, 4].includes(columnCount)
      );
    if (!responsiveLayoutValid) {
      return conclude(
        visualFinding("visual_option_c_responsive_deviation", "medium"),
      );
    }
  } else {
    return conclude(visualAssessment("baseline_ambiguity"));
  }
  return conclude(visualAssessment("false_positive"));
};

const touchTargetBaselineBindingIsValid = (
  metrics: Record<string, unknown>,
  context: DetectionEvaluationContext,
): boolean => {
  const baselineState = toText(metrics.baselineState);
  if (baselineState === "needs_product_baseline_review") {
    return metrics.baselineComparisonHash === null;
  }
  return baselineState === "approved_baseline" &&
    toText(metrics.baselineComparisonHash) ===
      APPROVED_OPTION_C_BASELINE_HASH &&
    context.approvedVisualBaselineCount === 1 &&
    context.approvedVisualBaselineHash === APPROVED_OPTION_C_BASELINE_HASH;
};

export const deterministicTouchTargetClassification = (
  run: StoredRun,
  context: DetectionEvaluationContext = DEFAULT_EVALUATION_CONTEXT,
): DeterministicVisualAssessment => {
  const metrics = metricObject(run);
  if (!metrics) return visualAssessment("insufficient_evidence");

  const automationStatus = toText(metrics.automationStatus);
  if (["failed", "not_available"].includes(automationStatus)) {
    return visualAssessment("automation_failure");
  }
  if (automationStatus !== "observed") {
    return visualAssessment("insufficient_evidence");
  }
  const expectedEvidenceQuality = run.physical_proof_status ===
      "installed_ui_observed"
    ? "measured_installed"
    : run.physical_proof_status === "simulator_observed"
    ? "measured_simulator"
    : "";
  if (
    toText(metrics.evidenceQuality) !== expectedEvidenceQuality ||
    !LOWER_HEX_64.test(toText(metrics.evidenceQualityHash))
  ) {
    return visualAssessment("insufficient_evidence");
  }
  if (toText(metrics.providerState) === "blocked") {
    return visualAssessment("provider_blocked");
  }
  if (["empty", "error"].includes(toText(metrics.contentState))) {
    return visualAssessment("content_data_absent");
  }
  if (
    !["healthy", "degraded", "not_applicable"].includes(
      toText(metrics.providerState),
    ) ||
    !["loaded", "partial", "not_applicable"].includes(
      toText(metrics.contentState),
    )
  ) {
    return visualAssessment("insufficient_evidence");
  }

  const expectedMeasurementUnit = PLATFORM_MEASUREMENT_UNITS[
    run.platform as keyof typeof PLATFORM_MEASUREMENT_UNITS
  ];
  const expectedPreferredThreshold = run.platform === "android" ? 48 : 44;
  const expectedApplicableMinimum = run.platform === "web"
    ? 24
    : expectedPreferredThreshold;
  if (
    toText(metrics.platform) !== run.platform ||
    !expectedMeasurementUnit ||
    toText(metrics.measurementUnit) !== expectedMeasurementUnit ||
    !SURFACE_FAMILIES.has(toText(metrics.surfaceFamily)) ||
    metricNumber(metrics, "preferredThreshold") !==
      expectedPreferredThreshold ||
    metricNumber(metrics, "applicableMinimumThreshold") !==
      expectedApplicableMinimum ||
    toText(metrics.baselineId) !==
      "chillywood-product-experience-baseline-v1" ||
    metricNumber(metrics, "baselineVersion") !== 1 ||
    !touchTargetBaselineBindingIsValid(metrics, context) ||
    !LOWER_HEX_64.test(toText(metrics.componentIdentityHash)) ||
    !LOWER_HEX_64.test(toText(metrics.routeFamilyMappingHash)) ||
    !(
      baselineContractBindingIsValid(run, metrics) ||
      objectiveAccessibilityBindingIsValid(run, metrics)
    )
  ) {
    return visualAssessment("baseline_ambiguity");
  }
  const screenDensityDpi = metrics.screenDensityDpi;
  if (
    (
      run.platform === "android" &&
      (
        typeof screenDensityDpi !== "number" ||
        !Number.isFinite(screenDensityDpi) ||
        screenDensityDpi < 72 ||
        screenDensityDpi > 1000
      )
    ) ||
    (run.platform !== "android" && screenDensityDpi !== null)
  ) {
    return visualAssessment("baseline_ambiguity");
  }

  const exceptionVersioned = metrics.exceptionVersioned;
  if (exceptionVersioned === true) {
    if (
      ![
        "featured_hero",
        "vertical_short_form",
        "compact_media_list",
        "non_media_surface",
      ].includes(toText(metrics.exceptionType)) ||
      !LOWER_HEX_64.test(toText(metrics.exceptionContractHash))
    ) {
      return visualAssessment("baseline_ambiguity");
    }
  } else if (
    exceptionVersioned !== false ||
    toText(metrics.exceptionType) !== "none" ||
    metrics.exceptionContractHash !== null
  ) {
    return visualAssessment("baseline_ambiguity");
  }

  const targetWidth = requiredVisualNumber(metrics, "interactiveTargetWidth");
  const targetHeight = requiredVisualNumber(metrics, "interactiveTargetHeight");
  if (
    targetWidth === null ||
    targetHeight === null ||
    typeof metrics.interactiveAncestorPresent !== "boolean" ||
    typeof metrics.interactiveAncestorActuallyInteractive !== "boolean" ||
    typeof metrics.interactiveAncestorRolePresent !== "boolean" ||
    typeof metrics.interactiveAncestorClickActionPresent !== "boolean" ||
    typeof metrics.interactiveAncestorIsTargetContainer !== "boolean" ||
    typeof metrics.isActuallyInteractive !== "boolean" ||
    typeof metrics.accessibilityNamePresent !== "boolean" ||
    typeof metrics.accessibilityRolePresent !== "boolean"
  ) {
    return visualAssessment("insufficient_evidence");
  }
  if (metrics.isActuallyInteractive !== true) {
    return toText(metrics.targetClassification) === "not_interactive"
      ? visualAssessment("false_positive")
      : visualAssessment("automation_failure");
  }
  let effectiveWidth = targetWidth;
  let effectiveHeight = targetHeight;
  if (metrics.interactiveAncestorPresent === true) {
    const ancestorWidth = requiredVisualNumber(
      metrics,
      "interactiveAncestorWidth",
    );
    const ancestorHeight = requiredVisualNumber(
      metrics,
      "interactiveAncestorHeight",
    );
    if (
      ancestorWidth === null ||
      ancestorHeight === null ||
      metrics.interactiveAncestorActuallyInteractive !== true ||
      metrics.interactiveAncestorRolePresent !== true ||
      metrics.interactiveAncestorClickActionPresent !== true ||
      metrics.interactiveAncestorIsTargetContainer !== true
    ) {
      return visualAssessment("insufficient_evidence");
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
    return visualAssessment("automation_failure");
  }

  const derivedTargetClassification = run.platform === "web"
    ? effectiveWidth >= 44 && effectiveHeight >= 44
      ? "meets_platform_preferred"
      : effectiveWidth >= 24 && effectiveHeight >= 24
      ? "meets_wcag_aa_minimum_only"
      : "below_wcag_aa_minimum"
    : effectiveWidth >= expectedPreferredThreshold &&
        effectiveHeight >= expectedPreferredThreshold
    ? "meets_platform_minimum"
    : "below_platform_minimum";
  if (toText(metrics.targetClassification) !== derivedTargetClassification) {
    return visualAssessment("automation_failure");
  }
  if (
    metrics.accessibilityNamePresent !== true ||
    metrics.accessibilityRolePresent !== true
  ) {
    return visualAssessment(
      "accessibility_violation",
      profile(
        "touch_target_accessibility_name_or_role_missing",
        "installed_ui_state",
        "medium",
        1,
      ),
    );
  }
  if (derivedTargetClassification === "below_platform_minimum") {
    return accessibilityFinding(
      run.platform === "android"
        ? "android_touch_target_below_48dp"
        : "ios_touch_target_below_44pt",
      "medium",
    );
  }
  if (derivedTargetClassification === "below_wcag_aa_minimum") {
    return accessibilityFinding(
      "web_touch_target_below_wcag_24csspx",
      "medium",
    );
  }
  if (derivedTargetClassification === "meets_wcag_aa_minimum_only") {
    return toText(metrics.baselineState) === "approved_baseline" &&
        toText(metrics.baselineComparisonHash) ===
          APPROVED_OPTION_C_BASELINE_HASH &&
        context.approvedVisualBaselineCount === 1 &&
        context.approvedVisualBaselineHash ===
          APPROVED_OPTION_C_BASELINE_HASH
      ? visualFinding("web_touch_target_below_preferred_44csspx", "low")
      : visualAssessment("baseline_ambiguity");
  }
  return visualAssessment("false_positive");
};

const liveKitProfile = (
  failureCategory: string,
): DeterministicFindingProfile | null => {
  const normalizedClass = `livekit_${failureCategory}`.replace(
    /[^a-z0-9._-]/gu,
    "_",
  );
  const byFailure: Readonly<
    Record<string, readonly [string, string, number]>
  > = Object.freeze({
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

const parseCanonicalLiveKitTimestamp = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
};

const nullableLiveKitHash = (value: unknown): boolean =>
  value === null ||
  (typeof value === "string" && LOWER_HEX_64.test(value));

const nullableLiveKitTimestamp = (value: unknown): boolean =>
  value === null || parseCanonicalLiveKitTimestamp(value) !== null;

const liveKitMetricContractIsValid = (
  metrics: Record<string, unknown>,
): boolean => {
  if (
    !hasExactKeys(metrics, LIVEKIT_METRIC_KEYS) ||
    LIVEKIT_BOOLEAN_METRICS.some(
      (key) => typeof metrics[key] !== "boolean",
    ) ||
    LIVEKIT_TIMING_METRICS.some((key) => {
      const value = metrics[key];
      return !Number.isInteger(value) ||
        Number(value) < 0 ||
        Number(value) > LIVEKIT_MAX_TIMING_MS;
    }) ||
    !LIVEKIT_ICE_STATES.has(toText(metrics.iceState)) ||
    !LIVEKIT_LOCAL_MEDIA_SOURCES.has(toText(metrics.localMediaSource)) ||
    !LIVEKIT_NETWORK_STATES.has(toText(metrics.networkState)) ||
    !LIVEKIT_PERMISSION_STATES.has(toText(metrics.permissionState)) ||
    !LIVEKIT_PROVIDER_STATES.has(toText(metrics.providerState)) ||
    !LIVEKIT_SCENARIO_TYPES.has(toText(metrics.scenarioType)) ||
    !LIVEKIT_REMOTE_MEDIA_KINDS.has(toText(metrics.remoteMediaKind)) ||
    !LIVEKIT_TOKEN_RESULT_STATES.has(toText(metrics.tokenResultStatus)) ||
    !LOWER_HEX_64.test(toText(metrics.roomRunCorrelationHash)) ||
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
  const headlessStarted = parseCanonicalLiveKitTimestamp(
    metrics.headlessObservationStartedAt,
  );
  const headlessFinished = parseCanonicalLiveKitTimestamp(
    metrics.headlessObservationFinishedAt,
  );
  const installedStarted = parseCanonicalLiveKitTimestamp(
    metrics.installedObservationStartedAt,
  );
  const installedFinished = parseCanonicalLiveKitTimestamp(
    metrics.installedObservationFinishedAt,
  );
  if (
    headlessStarted === null ||
    headlessFinished === null ||
    headlessStarted > headlessFinished ||
    headlessFinished - headlessStarted >
      LIVEKIT_MAX_OBSERVATION_WINDOW_MS ||
    (
      metrics.installedUiObserved === true &&
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
  const installedBound = metrics.installedUiObserved === true;
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
      metrics.tokenReturned !== true ||
      (
        metrics.tokenClaimsValidated === true &&
        metrics.headlessParticipantIdentityHash !== null
      )
    ) &&
    (
      metrics.tokenReturned === true ||
      (
        metrics.tokenClaimsValidated === false &&
        metrics.headlessParticipantIdentityHash === null
      )
    ) &&
    (
      metrics.tokenReturned !== true ||
      !installedBound ||
      metrics.participantIdentityDistinct === true
    ) &&
    metrics.firstAudioVideoObserved ===
      (metrics.remoteMediaKind !== "none") &&
    metrics.tokenReturned === (metrics.tokenResultStatus === "success") &&
    metrics.tokenRequested === metrics.tokenRequestStarted &&
    metrics.headlessParticipantUsed === true &&
    (
      metrics.scenarioType !== "bounded_failure_fixture" ||
      metrics.stageFailureCategory !== "none"
    ) &&
    (
      metrics.scenarioType === "background_foreground_recovery" ||
      (
        metrics.backgrounded === false &&
        metrics.foregrounded === false &&
        metrics.backgroundForegroundRecovery === false
      )
    ) &&
    (
      metrics.websocketConnected !== true ||
      metrics.tokenReturned === true
    ) &&
    (
      metrics.peerConnectionEstablished !== true ||
      metrics.websocketConnected === true
    ) &&
    (
      metrics.roomConnected !== true ||
      metrics.peerConnectionEstablished === true
    ) &&
    (
      metrics.localTrackPublished !== true ||
      metrics.roomConnected === true
    ) &&
    (
      metrics.remoteParticipantJoined !== true ||
      metrics.roomConnected === true
    ) &&
    (
      metrics.remoteTrackSubscribed !== true ||
      metrics.remoteParticipantJoined === true
    ) &&
    (
      metrics.firstAudioVideoObserved !== true ||
      metrics.remoteTrackSubscribed === true
    ) &&
    (
      metrics.backgroundForegroundRecovery !== true ||
      (
        installedBound &&
        metrics.backgrounded === true &&
        metrics.foregrounded === true
      )
    )
  );
};

export const deriveIndependentLiveKitFailureCategory = (
  metrics: Record<string, unknown>,
): string | null => {
  if (!liveKitMetricContractIsValid(metrics)) return null;
  if (metrics.permissionState === "denied") return "permission_failure";
  if (metrics.buildRuntimeMatched !== true) return "build_runtime_mismatch";
  if (metrics.networkState === "interrupted") return "network_interruption";
  if (metrics.tokenReturned !== true) return "token_backend_failure";
  if (metrics.websocketConnected !== true) return "websocket_failure";
  if (
    ["failed", "disconnected", "closed"].includes(toText(metrics.iceState))
  ) {
    return "ice_turn_failure";
  }
  if (metrics.roomConnected !== true) {
    return metrics.iceCheckingObserved === true
      ? "ice_turn_failure"
      : "room_connection_failure";
  }
  if (metrics.localTrackPublished !== true) return "local_publish_failure";
  if (metrics.remoteParticipantJoined !== true) {
    return "remote_participant_missing";
  }
  if (metrics.remoteTrackSubscribed !== true) {
    return "remote_subscription_failure";
  }
  if (metrics.firstAudioVideoObserved !== true) return "first_media_missing";
  if (
    metrics.installedUiObserved === true &&
    metrics.connectingResolved !== true
  ) {
    return "installed_ui_connecting_stuck";
  }
  if (
    metrics.scenarioType === "background_foreground_recovery" &&
    metrics.installedUiObserved === true &&
    (
      metrics.backgrounded !== true ||
      metrics.foregrounded !== true ||
      metrics.backgroundForegroundRecovery !== true
    )
  ) {
    return "background_foreground_recovery_failed";
  }
  if (metrics.cleanupDisconnected !== true) return "cleanup_failure";
  if (["blocked", "degraded"].includes(toText(metrics.providerState))) {
    return "provider_degradation";
  }
  if (
    Number(metrics.tokenIssuedElapsedMs) > 3_000 ||
    Number(metrics.roomConnectElapsedMs) > 12_000 ||
    Number(metrics.uiStateResolutionElapsedMs) > 15_000 ||
    Number(metrics.firstRemoteMediaElapsedMs) > 20_000
  ) {
    return "deadline_exceeded";
  }
  return "none";
};

const installedJourneyProfile = (
  metrics: Record<string, unknown>,
): DeterministicFindingProfile | null => {
  const expectedState = toText(metrics.expectedState);
  const observedState = toText(metrics.observedState);
  const resultState = toText(metrics.resultState);
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
  run: StoredRun,
  candidate: DetectionCandidate,
  context: DetectionEvaluationContext = DEFAULT_EVALUATION_CONTEXT,
): readonly string[] => {
  const reasons = new Set<string>();
  const metrics = metricObject(run);
  const observationKind = toText(run.metric_manifest.observationKind);
  let expectedProfile: DeterministicFindingProfile | null = null;
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
    const assessment = deterministicTouchTargetClassification(run, context);
    expectedProfile = assessment.profile;
    if (!expectedProfile) {
      reasons.add(`touch_target_${assessment.classification}`);
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
    if (
      !confirmedGap
    ) {
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
      const networkState = toText(metrics.networkState);
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
    if (
      fatalCount + anrCount < 1
    ) {
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
    } else if (toText(metrics.stageFailureCategory) !== failureCategory) {
      reasons.add("livekit_failure_category_mismatch");
    } else if (toText(metrics.scenarioType) === "bounded_failure_fixture") {
      reasons.add("livekit_synthetic_fixture_not_product_finding");
    } else {
      expectedProfile = liveKitProfile(failureCategory);
    }
    if (
      failureCategory &&
      toText(metrics.stageFailureCategory) === failureCategory &&
      toText(metrics.scenarioType) !== "bounded_failure_fixture" &&
      !expectedProfile
    ) {
      reasons.add("livekit_classification_rejected");
    }
  } else if (observationKind === "visual_layout") {
    const assessment = deterministicVisualClassification(run, context);
    expectedProfile = assessment.profile;
    if (!expectedProfile) {
      reasons.add(`visual_${assessment.classification}`);
    }
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

export const deterministicNoFindingReasons = (
  run: StoredRun,
  context: DetectionEvaluationContext = DEFAULT_EVALUATION_CONTEXT,
): readonly string[] => {
  const reasons = new Set<string>();
  const metrics = metricObject(run);
  const observationKind = toText(run.metric_manifest.observationKind);
  if (
    run.result_status !== "passed" ||
    !["installed_ui_observed", "simulator_observed"].includes(
      run.physical_proof_status,
    )
  ) {
    reasons.add("passing_physical_run_required");
  }
  if (!metrics) {
    reasons.add("metric_manifest_missing");
    return Object.freeze([...reasons].sort());
  }
  if (observationKind === "search_accessibility") {
    for (
      const key of [
        "inputPresent",
        "inputFocusable",
        "inputClickable",
        "accessibilityLabelPresent",
        "queryAccepted",
        "clearSucceeded",
        "keyboardDismissed",
      ]
    ) {
      if (metrics[key] !== true) {
        reasons.add(`search_accessibility_${key}_required`);
      }
    }
  } else if (observationKind === "route_timing") {
    for (const reason of routeTimingNoFindingReasons(run, metrics)) {
      reasons.add(reason);
    }
  } else if (observationKind === "crash_anr") {
    if (
      metricNumber(metrics, "fatalExceptionCount") !== 0 ||
      metricNumber(metrics, "anrCount") !== 0
    ) {
      reasons.add("zero_crash_anr_observation_required");
    }
  } else if (observationKind === "installed_journey") {
    const elapsedDuration = metricNumber(metrics, "elapsedDurationMs");
    const maximumDuration = metricNumber(metrics, "maxDurationMs");
    if (
      toText(metrics.resultState) !== "success" ||
      toText(metrics.expectedState) !== toText(metrics.observedState) ||
      metricNumber(metrics, "unresolvedStateCount") !== 0 ||
      elapsedDuration === null ||
      maximumDuration === null ||
      elapsedDuration > maximumDuration
    ) {
      reasons.add("resolved_installed_journey_required");
    }
  } else if (observationKind === "touch_target") {
    if (
      deterministicTouchTargetClassification(run, context).classification !==
        "false_positive"
    ) {
      reasons.add("compliant_touch_target_required");
    }
  } else if (observationKind === "visual_layout") {
    if (
      !["false_positive", "route_specific_exception"].includes(
        deterministicVisualClassification(run, context).classification,
      )
    ) {
      reasons.add("compliant_visual_layout_required");
    }
  } else if (observationKind === "livekit_experience") {
    const failureCategory = deriveIndependentLiveKitFailureCategory(metrics);
    if (
      toText(metrics.scenarioType) === "bounded_failure_fixture" ||
      failureCategory !== "none" ||
      metrics.installedUiObserved !== true ||
      metrics.connectingResolved !== true
    ) {
      reasons.add("healthy_installed_livekit_experience_required");
    }
  } else {
    reasons.add("unsupported_observation_kind");
  }
  return Object.freeze([...reasons].sort());
};

export const deterministicResolutionReasons = (
  run: StoredRun,
  finding: StoredFinding,
  detectionRun: StoredRun,
  context: DetectionEvaluationContext = DEFAULT_EVALUATION_CONTEXT,
): readonly string[] => {
  const reasons = new Set<string>();
  if (
    finding.id.length === 0 ||
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
    toText(run.metric_manifest.observationKind) !==
      toText(detectionRun.metric_manifest.observationKind)
  ) {
    reasons.add("resolution_observation_kind_mismatch");
  }
  const observationKind = toText(detectionRun.metric_manifest.observationKind);
  const resolutionMetrics = metricObject(run);
  const detectionMetrics = metricObject(detectionRun);
  if (!resolutionMetrics || !detectionMetrics) {
    reasons.add("resolution_metric_manifest_missing");
    if (observationKind === "livekit_experience") {
      reasons.add("resolution_livekit_metric_manifest_rejected");
    }
  } else if (observationKind === "touch_target") {
    if (
      toText(resolutionMetrics.componentIdentityHash) !==
        toText(detectionMetrics.componentIdentityHash) ||
      toText(resolutionMetrics.routeFamilyMappingHash) !==
        toText(detectionMetrics.routeFamilyMappingHash) ||
      toText(resolutionMetrics.surfaceFamily) !==
        toText(detectionMetrics.surfaceFamily) ||
      toText(resolutionMetrics.platform) !==
        toText(detectionMetrics.platform) ||
      toText(resolutionMetrics.measurementUnit) !==
        toText(detectionMetrics.measurementUnit) ||
      toText(resolutionMetrics.baselineId) !==
        toText(detectionMetrics.baselineId) ||
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
  } else if (observationKind === "livekit_experience") {
    if (
      toText(detectionMetrics.scenarioType) === "bounded_failure_fixture" ||
      toText(resolutionMetrics.scenarioType) === "bounded_failure_fixture"
    ) {
      reasons.add("livekit_synthetic_fixture_not_product_finding");
    }
    if (
      toText(resolutionMetrics.scenarioType) !==
        toText(detectionMetrics.scenarioType) ||
      toText(resolutionMetrics.localMediaSource) !==
        toText(detectionMetrics.localMediaSource) ||
      toText(resolutionMetrics.installedRuntimeIdentityHash) !==
        run.runtime_identity_hash ||
      toText(resolutionMetrics.installedSourceBuildHash) !==
        run.source_build_hash
    ) {
      reasons.add("resolution_measurement_identity_mismatch");
    }
    const failureCategory =
      deriveIndependentLiveKitFailureCategory(resolutionMetrics);
    if (!failureCategory) {
      reasons.add("resolution_livekit_metric_manifest_rejected");
    } else if (
      toText(resolutionMetrics.stageFailureCategory) !== failureCategory
    ) {
      reasons.add("resolution_livekit_failure_category_mismatch");
    } else if (failureCategory !== "none") {
      reasons.add("resolution_livekit_experience_not_satisfied");
    }
  } else if (observationKind === "visual_layout") {
    if (
      toText(resolutionMetrics.componentIdentityHash) !==
        toText(detectionMetrics.componentIdentityHash) ||
      toText(resolutionMetrics.routeFamilyMappingHash) !==
        toText(detectionMetrics.routeFamilyMappingHash) ||
      toText(resolutionMetrics.surfaceFamily) !==
        toText(detectionMetrics.surfaceFamily) ||
      toText(resolutionMetrics.platform) !==
        toText(detectionMetrics.platform) ||
      toText(resolutionMetrics.measurementUnit) !==
        toText(detectionMetrics.measurementUnit) ||
      toText(resolutionMetrics.baselineId) !==
        toText(detectionMetrics.baselineId) ||
      metricNumber(resolutionMetrics, "baselineVersion") !==
        metricNumber(detectionMetrics, "baselineVersion") ||
      toText(resolutionMetrics.referenceViewport) !==
        toText(detectionMetrics.referenceViewport) ||
      toText(resolutionMetrics.baselineState) !== "approved_baseline" ||
      toText(resolutionMetrics.baselineComparisonHash) !==
        toText(detectionMetrics.baselineComparisonHash)
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
      toText(resolutionMetrics.expectedState) !==
        toText(detectionMetrics.expectedState) ||
      toText(resolutionMetrics.sourceRuntimeHash) !==
        toText(detectionMetrics.sourceRuntimeHash) ||
      metricNumber(resolutionMetrics, "journeyStepCount") !==
        metricNumber(detectionMetrics, "journeyStepCount")
    ) {
      reasons.add("resolution_measurement_identity_mismatch");
    }
  } else if (observationKind === "route_timing") {
    for (
      const reason of routeTimingNoFindingReasons(run, resolutionMetrics)
    ) {
      reasons.add(reason);
    }
  }
  return Object.freeze([...reasons].sort());
};

const readRequiredSecret = (name: string): string => {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error("server_configuration_missing");
  return value;
};
const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
const stableJson = (value: Json): string => {
  const normalize = (entry: Json): Json => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (isRecord(entry)) {
      return Object.fromEntries(
        Object.keys(entry).sort().map((key) => [
          key,
          normalize(entry[key] as Json),
        ]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
};
const constantTimeEqual = (left: string, right: string): boolean => {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return diff === 0;
};
const authenticateInvocation = async (request: Request): Promise<boolean> => {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const expectedHash = Deno.env.get(
    "COGNITIVE_INDEPENDENT_EVALUATOR_INVOKE_SHA256",
  )?.trim() ?? "";
  const invocation = request.headers.get(INVOCATION_HEADER)?.trim() ?? "";
  if (
    !authorization.toLowerCase().startsWith("bearer ") ||
    !expectedHash ||
    !LOWER_HEX_64.test(expectedHash) ||
    !invocation
  ) {
    return false;
  }
  return constantTimeEqual(await sha256Hex(invocation), expectedHash);
};
const createServiceClient = (): SupabaseClientLike =>
  createClient(
    readRequiredSecret("SUPABASE_URL"),
    readRequiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

const readStoredRun = async (
  client: SupabaseClientLike,
  sentinelRunId: string,
): Promise<StoredRun | null> => {
  const result = await client
    .from("product_experience_sentinel_runs")
    .select(
      "id,task_id,project_id,platform,environment,sentinel_key,route_or_surface,source_build_hash,evidence_manifest_hash,metric_manifest,result_status,physical_proof_status,evaluation_expires_at,collector_capability_id,erased_at",
    )
    .eq("id", sentinelRunId)
    .maybeSingle();
  if (result.error || !isRecord(result.data)) return null;
  if (!isRecord(result.data.metric_manifest)) return null;
  return result.data as unknown as StoredRun;
};

const readStoredFinding = async (
  client: SupabaseClientLike,
  findingId: string,
): Promise<StoredFinding | null> => {
  const result = await client
    .from("product_quality_findings")
    .select(
      "id,sentinel_run_id,task_id,project_id,platform,environment,route_or_surface,current_status,erased_at",
    )
    .eq("id", findingId)
    .maybeSingle();
  return !result.error && isRecord(result.data)
    ? result.data as unknown as StoredFinding
    : null;
};

const readDetectionEvaluationContext = async (
  client: SupabaseClientLike,
  run: StoredRun,
): Promise<DetectionEvaluationContext | null> => {
  const observationKind = toText(run.metric_manifest.observationKind);
  if (!["visual_layout", "touch_target"].includes(observationKind)) {
    return DEFAULT_EVALUATION_CONTEXT;
  }
  if (observationKind === "touch_target") {
    const metrics = metricObject(run);
    if (toText(metrics?.baselineState) !== "approved_baseline") {
      return DEFAULT_EVALUATION_CONTEXT;
    }
  }
  const result = await client.rpc(
    "product_experience_resolve_current_active_baseline",
    {
      p_baseline_key: "streaming_mobile_content_density",
      p_environment: run.environment,
      p_platform: run.platform,
      p_project_id: run.project_id,
      p_task_id: run.task_id,
    },
  );
  if (result.error) return null;
  if (result.data === null) {
    return Object.freeze({
      approvedVisualBaselineCount: 0,
      approvedVisualBaselineHash: null,
    });
  }
  if (!isRecord(result.data)) return null;
  const resolvedHash = toText(result.data.baselineHash);
  if (
    result.data.baselineId !== "chillywood-product-experience-baseline-v1" ||
    result.data.selectedOptionCode !== "C" ||
    result.data.selectedOption !== "creator_balanced" ||
    result.data.status !== "owner_approved" ||
    !LOWER_HEX_64.test(resolvedHash)
  ) {
    return null;
  }
  return Object.freeze({
    approvedVisualBaselineCount: 1,
    approvedVisualBaselineHash: resolvedHash,
  });
};

const prepareAssessmentHash = async (
  client: SupabaseClientLike,
  run: StoredRun,
  candidate: DetectionCandidate,
): Promise<string | null> => {
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
  const result = await client.rpc(
    "product_quality_detection_assessment_hash",
    {
      p_affected_components_hash: candidate.affectedComponentsHash,
      p_build_runtime_hash: candidate.buildRuntimeHash,
      p_confidence: candidate.confidence,
      p_evidence_hashes: candidate.evidenceHashes,
      p_finding_key: findingKey,
      p_physical_proof_status: candidate.physicalProofStatus,
      p_proposed_next_investigation_hash:
        candidate.proposedNextInvestigationHash,
      p_provider_backend_state_hash: candidate.providerBackendStateHash,
      p_reproduction_state: candidate.reproductionState,
      p_route_or_surface: candidate.routeOrSurface,
      p_sentinel_run_id: run.id,
      p_severity: candidate.severity,
      p_suspected_layer: candidate.suspectedLayer,
      p_user_impact_hash: candidate.userImpactHash,
    },
  );
  return !result.error && typeof result.data === "string" &&
      LOWER_HEX_64.test(result.data)
    ? result.data
    : null;
};

const prepareResolutionAssessmentHash = async (
  client: SupabaseClientLike,
  run: StoredRun,
  candidate: ResolutionCandidate,
): Promise<string | null> => {
  const result = await client.rpc(
    "product_quality_resolution_assessment_hash",
    {
      p_finding_id: candidate.findingId,
      p_resolution_evidence_hash: run.evidence_manifest_hash,
      p_resolution_reason_hash: candidate.resolutionReasonHash,
      p_sentinel_run_id: run.id,
    },
  );
  return !result.error && typeof result.data === "string" &&
      LOWER_HEX_64.test(result.data)
    ? result.data
    : null;
};

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (!await authenticateInvocation(request)) {
    return json(401, { error: "independent_evaluator_invocation_required" });
  }
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json(413, { error: "sentinel_evaluation_payload_too_large" });
    }
    const payload = JSON.parse(rawBody) as unknown;
    if (!isStrictSentinelEvaluationPayload(payload)) {
      return json(400, { error: "sentinel_evaluation_payload_rejected" });
    }
    const client = createServiceClient();
    if (payload.action === "evaluate_product_baseline_selection") {
      const result = await client.rpc(
        "governance_evaluate_product_experience_baseline_v1",
        {
          p_evaluator_assertion: readRequiredSecret(
            "COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION",
          ),
          p_evaluator_identity: SERVICE_IDENTITY,
          p_execution_id: String(payload.executionId),
          p_execution_receipt_hash: String(payload.executionReceiptHash),
        },
      );
      if (result.error || !isRecord(result.data)) {
        return json(409, { error: "product_baseline_evaluation_rejected" });
      }
      return json(200, result.data as JsonObject);
    }
    if (payload.action === "evaluate_sentinel_no_finding") {
      return json(409, {
        error: "isolated_product_quality_evaluator_runtime_required",
      });
    }
    const run = await readStoredRun(client, String(payload.sentinelRunId));
    if (
      !run ||
      Date.parse(run.evaluation_expires_at) <= Date.now()
    ) {
      return json(409, { error: "sentinel_evaluation_run_rejected" });
    }
    const isResolution = payload.action === "evaluate_sentinel_resolution";
    let assessmentHash: string | null;
    let reasons: readonly string[];
    let assessmentKind: "finding_detection" | "finding_resolution";
    if (isResolution) {
      const candidate = toResolutionCandidate(payload);
      const finding = await readStoredFinding(client, candidate.findingId);
      const detectionRun = finding
        ? await readStoredRun(client, finding.sentinel_run_id)
        : null;
      if (!finding || !detectionRun) {
        return json(409, { error: "sentinel_resolution_finding_rejected" });
      }
      assessmentHash = await prepareResolutionAssessmentHash(
        client,
        run,
        candidate,
      );
      const context = await readDetectionEvaluationContext(client, run);
      if (!context) {
        return json(409, { error: "sentinel_baseline_read_rejected" });
      }
      reasons = deterministicResolutionReasons(
        run,
        finding,
        detectionRun,
        context,
      );
      assessmentKind = "finding_resolution";
    } else {
      const candidate = toCandidate(payload);
      const context = await readDetectionEvaluationContext(client, run);
      if (!context) {
        return json(409, { error: "sentinel_baseline_read_rejected" });
      }
      assessmentHash = await prepareAssessmentHash(client, run, candidate);
      reasons = deterministicDetectionReasons(run, candidate, context);
      assessmentKind = "finding_detection";
    }
    if (!assessmentHash) {
      return json(409, { error: "sentinel_evaluation_hash_rejected" });
    }
    const verdict = reasons.length === 0 ? "passed" : "rejected";
    const evaluatorOutputHash = await sha256Hex(stableJson({
      assessmentKind,
      assessmentHash,
      observationKind: String(run.metric_manifest.observationKind),
      reasons: [...reasons],
      sentinelRunId: run.id,
      verdict,
    }));
    const evaluatorProofHash = await sha256Hex([
      "product-sentinel-evaluator-v1",
      SERVICE_IDENTITY,
      run.id,
      assessmentHash,
      run.evidence_manifest_hash,
      verdict,
      evaluatorOutputHash,
    ].join("|"));
    const result = await client.rpc(
      "product_quality_record_sentinel_evaluator_proof",
      {
        p_assessment_hash: assessmentHash,
        p_assessment_kind: assessmentKind,
        p_evaluator_assertion: readRequiredSecret(
          "COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION",
        ),
        p_evaluator_identity: SERVICE_IDENTITY,
        p_evaluator_output_hash: evaluatorOutputHash,
        p_evaluator_proof_hash: evaluatorProofHash,
        p_evidence_manifest_hash: run.evidence_manifest_hash,
        p_sentinel_run_id: run.id,
        p_verdict: verdict,
      },
    );
    if (result.error || !isRecord(result.data)) {
      return json(409, { error: "sentinel_evaluator_proof_rejected" });
    }
    return json(200, {
      ...result.data,
      assessmentHash,
      evaluatorOutputHash,
      evaluatorProofHash,
      reasons: [...reasons],
      selfApproval: false,
    });
  } catch {
    return json(500, { error: "cognitive_product_quality_evaluator_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
