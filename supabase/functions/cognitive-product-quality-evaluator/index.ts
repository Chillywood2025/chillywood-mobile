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

const SERVICE_IDENTITY = "cognitive_independent_evaluator";
const INVOCATION_HEADER = "x-cognitive-evaluator-invocation";
const MAX_REQUEST_BYTES = 16 * 1024;
const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const KEYS = Object.freeze([
  "action",
  "assessmentHash",
  "assessmentKind",
  "evaluatorOutputHash",
  "evaluatorProofHash",
  "evidenceManifestHash",
  "sentinelRunId",
  "verdict",
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

export const isStrictSentinelEvaluationPayload = (
  value: unknown,
): value is Record<string, unknown> => {
  if (!isRecord(value) || !hasExactKeys(value, KEYS)) return false;
  return value.action === "record_sentinel_evaluator_proof" &&
    typeof value.sentinelRunId === "string" &&
    UUID.test(value.sentinelRunId) &&
    ["finding_detection", "finding_resolution"].includes(
      String(value.assessmentKind),
    ) &&
    typeof value.assessmentHash === "string" &&
    LOWER_HEX_64.test(value.assessmentHash) &&
    typeof value.evidenceManifestHash === "string" &&
    LOWER_HEX_64.test(value.evidenceManifestHash) &&
    ["passed", "rejected"].includes(String(value.verdict)) &&
    typeof value.evaluatorOutputHash === "string" &&
    LOWER_HEX_64.test(value.evaluatorOutputHash) &&
    typeof value.evaluatorProofHash === "string" &&
    LOWER_HEX_64.test(value.evaluatorProofHash) &&
    safePayload(value);
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
    const result = await createServiceClient().rpc(
      "product_quality_record_sentinel_evaluator_proof",
      {
        p_assessment_hash: payload.assessmentHash,
        p_assessment_kind: payload.assessmentKind,
        p_evaluator_assertion: readRequiredSecret(
          "COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION",
        ),
        p_evaluator_identity: SERVICE_IDENTITY,
        p_evaluator_output_hash: payload.evaluatorOutputHash,
        p_evaluator_proof_hash: payload.evaluatorProofHash,
        p_evidence_manifest_hash: payload.evidenceManifestHash,
        p_sentinel_run_id: payload.sentinelRunId,
        p_verdict: payload.verdict,
      },
    );
    if (result.error || !isRecord(result.data)) {
      return json(409, { error: "sentinel_evaluator_proof_rejected" });
    }
    return json(200, result.data as JsonObject);
  } catch {
    return json(500, { error: "cognitive_product_quality_evaluator_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
