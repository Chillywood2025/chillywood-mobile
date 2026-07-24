import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  type CanonicalSecurityPolicy,
  classifyCanonicalSecurityPayload,
} from "../../../_lib/cognitivePolicyEngine.ts";
import securityPolicyJson from "../../../config/intelligence/cognitive-security-classification-policy.json" with {
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
  sentinel_key: string;
  source_build_hash: string;
  task_id: string;
}>;

const SERVICE_IDENTITY = "cognitive_independent_evaluator";
const INVOCATION_HEADER = "x-cognitive-evaluator-invocation";
const MAX_REQUEST_BYTES = 32 * 1024;
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

export const deterministicDetectionReasons = (
  run: StoredRun,
  candidate: DetectionCandidate,
): readonly string[] => {
  const reasons = new Set<string>();
  const metrics = metricObject(run);
  const observationKind = toText(run.metric_manifest.observationKind);
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
    const threshold = metricNumber(metrics, "thresholdDp");
    const width = metricNumber(metrics, "minimumWidthDp");
    const height = metricNumber(metrics, "minimumHeightDp");
    if (
      run.platform !== "android" ||
      threshold !== 48 ||
      width === null ||
      height === null ||
      (width >= threshold && height >= threshold) ||
      metrics.isActuallyInteractive !== true ||
      metrics.clickableAncestorPresent !== false ||
      candidate.findingClass !== "android_touch_target_below_48dp" ||
      candidate.suspectedLayer !== "layout_density" ||
      candidate.reproductionState !== "confirmed_defect"
    ) {
      reasons.add("touch_target_classification_rejected");
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
      !confirmedGap ||
      candidate.findingClass !== "search_accessibility_interactivity_gap" ||
      candidate.suspectedLayer !== "installed_ui_state"
    ) {
      reasons.add("search_accessibility_classification_rejected");
    }
  } else if (observationKind === "route_timing") {
    if (
      metrics.timeoutObserved !== true ||
      candidate.findingClass !== "route_unresolved_or_error_state" ||
      !["loading_state", "route_navigation", "empty_error_offline"].includes(
        candidate.suspectedLayer,
      )
    ) {
      reasons.add("route_timing_classification_rejected");
    }
  } else if (observationKind === "crash_anr") {
    const fatalCount = metricNumber(metrics, "fatalExceptionCount") ?? 0;
    const anrCount = metricNumber(metrics, "anrCount") ?? 0;
    if (
      fatalCount + anrCount < 1 ||
      candidate.findingClass !== "installed_crash_or_anr" ||
      candidate.suspectedLayer !== "installed_ui_state"
    ) {
      reasons.add("crash_anr_classification_rejected");
    }
  } else if (observationKind === "livekit_experience") {
    const failureCategory = toText(metrics.stageFailureCategory);
    if (
      !failureCategory ||
      failureCategory === "none" ||
      candidate.findingClass !==
        `livekit_${failureCategory}`.replace(/[^a-z0-9._-]/gu, "_")
    ) {
      reasons.add("livekit_classification_rejected");
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
      reasons = deterministicResolutionReasons(run, finding, detectionRun);
      assessmentKind = "finding_resolution";
    } else {
      const candidate = toCandidate(payload);
      assessmentHash = await prepareAssessmentHash(client, run, candidate);
      reasons = deterministicDetectionReasons(run, candidate);
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
          "COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION",
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
