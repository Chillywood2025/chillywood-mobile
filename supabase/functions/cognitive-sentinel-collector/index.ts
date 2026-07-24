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

const SERVICE_IDENTITY = "cognitive_sentinel_collector";
const INVOCATION_HEADER = "x-cognitive-sentinel-collector-invocation";
const MAX_REQUEST_BYTES = 96 * 1024;
const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers":
    `authorization, x-client-info, apikey, content-type, ${INVOCATION_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});
const SECURITY_POLICY = securityPolicyJson as CanonicalSecurityPolicy;
const PAYLOAD_KEYS = Object.freeze([
  "action",
  "collectionIdempotencyHash",
  "environment",
  "evaluationExpiresAt",
  "evidenceManifestHash",
  "metricManifest",
  "observationFinishedAt",
  "observationStartedAt",
  "physicalProofStatus",
  "platform",
  "projectId",
  "resultStatus",
  "routeOrSurface",
  "runtimeIdentityHash",
  "sentinelKey",
  "sourceBuildHash",
  "taskId",
]);
const SENTINELS = new Set([
  "livekit_experience_sentinel",
  "visual_product_experience_sentinel",
  "installed_journey_sentinel",
]);
const RESULT_STATUSES = new Set(["passed", "blocked", "failed"]);
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
const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 20 &&
  value.length <= 40 &&
  Number.isFinite(Date.parse(value));
const safePayload = (value: unknown): boolean =>
  classifyCanonicalSecurityPayload(value, SECURITY_POLICY) === "safe";

export const isStrictSentinelCollectionPayload = (
  value: unknown,
): value is Record<string, unknown> => {
  if (!isRecord(value) || !hasExactKeys(value, PAYLOAD_KEYS)) return false;
  if (
    value.action !== "collect_sentinel_run" ||
    typeof value.taskId !== "string" ||
    !UUID.test(value.taskId) ||
    typeof value.projectId !== "string" ||
    !UUID.test(value.projectId) ||
    !["shared", "ios", "android", "web", "unknown"].includes(
      toText(value.platform),
    ) ||
    !["local", "ci", "preview", "production"].includes(
      toText(value.environment),
    ) ||
    !SENTINELS.has(toText(value.sentinelKey)) ||
    typeof value.routeOrSurface !== "string" ||
    value.routeOrSurface.length < 1 ||
    value.routeOrSurface.length > 160 ||
    typeof value.runtimeIdentityHash !== "string" ||
    !LOWER_HEX_64.test(value.runtimeIdentityHash) ||
    typeof value.sourceBuildHash !== "string" ||
    !LOWER_HEX_64.test(value.sourceBuildHash) ||
    typeof value.evidenceManifestHash !== "string" ||
    !LOWER_HEX_64.test(value.evidenceManifestHash) ||
    typeof value.collectionIdempotencyHash !== "string" ||
    !LOWER_HEX_64.test(value.collectionIdempotencyHash) ||
    !isRecord(value.metricManifest) ||
    value.metricManifest.schemaVersion !== "product-sentinel-v1" ||
    value.metricManifest.sanitizationVersion !== "bounded-nonpersonal-v1" ||
    !RESULT_STATUSES.has(toText(value.resultStatus)) ||
    !PHYSICAL_PROOF_STATUSES.has(toText(value.physicalProofStatus)) ||
    !isIsoTimestamp(value.observationStartedAt) ||
    !isIsoTimestamp(value.observationFinishedAt) ||
    !isIsoTimestamp(value.evaluationExpiresAt)
  ) {
    return false;
  }
  return safePayload(value);
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
    "COGNITIVE_SENTINEL_COLLECTOR_INVOKE_SHA256",
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

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (!await authenticateInvocation(request)) {
    return json(401, { error: "sentinel_collector_invocation_required" });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json(413, { error: "sentinel_collection_payload_too_large" });
  }
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json(413, { error: "sentinel_collection_payload_too_large" });
    }
    const payload = JSON.parse(rawBody) as unknown;
    if (!isStrictSentinelCollectionPayload(payload)) {
      return json(400, { error: "sentinel_collection_payload_rejected" });
    }
    const result = await createServiceClient().rpc(
      "product_experience_collect_sentinel_run",
      {
        p_collection_idempotency_hash: payload.collectionIdempotencyHash,
        p_environment: payload.environment,
        p_evaluation_expires_at: payload.evaluationExpiresAt,
        p_evidence_manifest_hash: payload.evidenceManifestHash,
        p_metric_manifest: payload.metricManifest,
        p_observation_finished_at: payload.observationFinishedAt,
        p_observation_started_at: payload.observationStartedAt,
        p_physical_proof_status: payload.physicalProofStatus,
        p_platform: payload.platform,
        p_project_id: payload.projectId,
        p_result_status: payload.resultStatus,
        p_route_or_surface: payload.routeOrSurface,
        p_runtime_identity_hash: payload.runtimeIdentityHash,
        p_sentinel_key: payload.sentinelKey,
        p_service_assertion: readRequiredSecret(
          "COGNITIVE_SENTINEL_COLLECTOR_ASSERTION",
        ),
        p_service_identity: SERVICE_IDENTITY,
        p_source_build_hash: payload.sourceBuildHash,
        p_task_id: payload.taskId,
      },
    );
    if (result.error || !isRecord(result.data)) {
      return json(409, { error: "sentinel_collection_rejected" });
    }
    return json(200, result.data as JsonObject);
  } catch {
    return json(500, { error: "cognitive_sentinel_collector_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
