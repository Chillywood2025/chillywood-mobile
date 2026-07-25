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

const SERVICE_IDENTITY = "cognitive_product_quality_triage";
const INVOCATION_HEADER = "x-cognitive-product-quality-triage-invocation";
const MAX_REQUEST_BYTES = 32 * 1024;
const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const FINDING_CLASS = /^[a-z0-9][a-z0-9._-]{2,80}$/u;
const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers":
    `authorization, x-client-info, apikey, content-type, ${INVOCATION_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});
const SECURITY_POLICY = securityPolicyJson as CanonicalSecurityPolicy;
const DETECTION_KEYS = Object.freeze([
  "action",
  "affectedComponentsHash",
  "buildRuntimeHash",
  "confidence",
  "evaluatorProofHash",
  "evaluatorProofId",
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
  "evaluatorProofHash",
  "evaluatorProofId",
  "findingId",
  "resolutionReasonHash",
  "sentinelRunId",
]);
const NO_FINDING_KEYS = Object.freeze([
  "action",
  "evaluatorProofHash",
  "evaluatorProofId",
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
const hashesAreBounded = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= 64 &&
  value.every((item) => typeof item === "string" && LOWER_HEX_64.test(item));
const safePayload = (value: unknown): boolean =>
  classifyCanonicalSecurityPayload(value, SECURITY_POLICY) === "safe";

export const isStrictProductQualityDetectionPayload = (
  value: unknown,
): value is Record<string, unknown> => {
  if (!isRecord(value) || !hasExactKeys(value, DETECTION_KEYS)) return false;
  return value.action === "triage_detection" &&
    typeof value.sentinelRunId === "string" &&
    UUID.test(value.sentinelRunId) &&
    typeof value.evaluatorProofId === "string" &&
    UUID.test(value.evaluatorProofId) &&
    typeof value.evaluatorProofHash === "string" &&
    LOWER_HEX_64.test(value.evaluatorProofHash) &&
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

export const isStrictProductQualityResolutionPayload = (
  value: unknown,
): value is Record<string, unknown> => {
  if (!isRecord(value) || !hasExactKeys(value, RESOLUTION_KEYS)) return false;
  return value.action === "triage_resolution" &&
    typeof value.findingId === "string" &&
    UUID.test(value.findingId) &&
    typeof value.sentinelRunId === "string" &&
    UUID.test(value.sentinelRunId) &&
    typeof value.evaluatorProofId === "string" &&
    UUID.test(value.evaluatorProofId) &&
    typeof value.evaluatorProofHash === "string" &&
    LOWER_HEX_64.test(value.evaluatorProofHash) &&
    typeof value.resolutionReasonHash === "string" &&
    LOWER_HEX_64.test(value.resolutionReasonHash) &&
    safePayload({ action: value.action });
};

export const isStrictProductQualityNoFindingPayload = (
  value: unknown,
): value is Record<string, unknown> => {
  if (!isRecord(value) || !hasExactKeys(value, NO_FINDING_KEYS)) return false;
  return value.action === "triage_no_finding" &&
    typeof value.sentinelRunId === "string" &&
    UUID.test(value.sentinelRunId) &&
    typeof value.evaluatorProofId === "string" &&
    UUID.test(value.evaluatorProofId) &&
    typeof value.evaluatorProofHash === "string" &&
    LOWER_HEX_64.test(value.evaluatorProofHash) &&
    safePayload({ action: value.action });
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
const constantTimeEqual = (left: string, right: string): boolean => {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
};
const authenticateInvocation = async (request: Request): Promise<boolean> => {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const expectedHash = Deno.env.get(
    "COGNITIVE_PRODUCT_QUALITY_TRIAGE_INVOKE_SHA256",
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
const triageAssertion = (): string =>
  readRequiredSecret("COGNITIVE_PRODUCT_QUALITY_TRIAGE_ASSERTION");

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (!await authenticateInvocation(request)) {
    return json(401, { error: "product_quality_triage_invocation_required" });
  }
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json(413, { error: "product_quality_triage_payload_too_large" });
    }
    const payload = JSON.parse(rawBody) as unknown;
    const serviceClient = createServiceClient();
    if (isStrictProductQualityDetectionPayload(payload)) {
      const result = await serviceClient.rpc(
        "product_quality_triage_detection",
        {
          p_affected_components_hash: payload.affectedComponentsHash,
          p_build_runtime_hash: payload.buildRuntimeHash,
          p_confidence: payload.confidence,
          p_evaluator_proof_hash: payload.evaluatorProofHash,
          p_evaluator_proof_id: payload.evaluatorProofId,
          p_evidence_hashes: payload.evidenceHashes,
          p_finding_class: payload.findingClass,
          p_physical_proof_status: payload.physicalProofStatus,
          p_proposed_next_investigation_hash:
            payload.proposedNextInvestigationHash,
          p_provider_backend_state_hash: payload.providerBackendStateHash,
          p_reproduction_state: payload.reproductionState,
          p_route_or_surface: payload.routeOrSurface,
          p_sentinel_run_id: payload.sentinelRunId,
          p_service_assertion: triageAssertion(),
          p_service_identity: SERVICE_IDENTITY,
          p_severity: payload.severity,
          p_suspected_layer: payload.suspectedLayer,
          p_user_impact_hash: payload.userImpactHash,
        },
      );
      if (result.error || !isRecord(result.data)) {
        return json(409, { error: "product_quality_detection_rejected" });
      }
      return json(200, result.data as JsonObject);
    }
    if (isStrictProductQualityResolutionPayload(payload)) {
      const result = await serviceClient.rpc(
        "product_quality_triage_resolution",
        {
          p_evaluator_proof_hash: payload.evaluatorProofHash,
          p_evaluator_proof_id: payload.evaluatorProofId,
          p_finding_id: payload.findingId,
          p_resolution_reason_hash: payload.resolutionReasonHash,
          p_sentinel_run_id: payload.sentinelRunId,
          p_service_assertion: triageAssertion(),
          p_service_identity: SERVICE_IDENTITY,
        },
      );
      if (result.error || !isRecord(result.data)) {
        return json(409, { error: "product_quality_resolution_rejected" });
      }
      return json(200, result.data as JsonObject);
    }
    if (isStrictProductQualityNoFindingPayload(payload)) {
      const result = await serviceClient.rpc(
        "product_quality_triage_no_finding",
        {
          p_evaluator_proof_hash: payload.evaluatorProofHash,
          p_evaluator_proof_id: payload.evaluatorProofId,
          p_sentinel_run_id: payload.sentinelRunId,
          p_service_assertion: triageAssertion(),
          p_service_identity: SERVICE_IDENTITY,
        },
      );
      if (result.error || !isRecord(result.data)) {
        return json(409, { error: "product_quality_no_finding_rejected" });
      }
      return json(200, result.data as JsonObject);
    }
    return json(400, { error: "product_quality_triage_payload_rejected" });
  } catch {
    return json(500, { error: "cognitive_product_quality_triage_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
