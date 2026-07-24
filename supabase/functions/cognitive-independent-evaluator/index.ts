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

const INVOCATION_HEADER = "x-cognitive-evaluator-invocation";
const SERVICE_IDENTITY = "cognitive_independent_evaluator";
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

const readRequiredSecret = (name: string): string => {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error("server_configuration_missing");
  return value;
};

const safePayload = (value: unknown): boolean =>
  classifyCanonicalSecurityPayload(value, SECURITY_POLICY) === "safe";

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

const authenticateEvaluatorInvocation = async (
  request: Request,
): Promise<boolean> => {
  const expectedHash = Deno.env.get(
    "COGNITIVE_INDEPENDENT_EVALUATOR_INVOKE_SHA256",
  )?.trim() ?? "";
  const token = request.headers.get(INVOCATION_HEADER)?.trim() ?? "";
  if (!expectedHash || !token) return false;
  return constantTimeEqual(await sha256Hex(token), expectedHash);
};

const createServiceClient = (): SupabaseClientLike => {
  const supabaseUrl = readRequiredSecret("SUPABASE_URL");
  const serviceRoleKey = readRequiredSecret("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

const evaluatorAssertion = (): string =>
  readRequiredSecret("COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION");

const recordEvaluatorProof = async (
  serviceClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await serviceClient.rpc(
    "governance_record_approved_execution_evaluator_proof",
    {
      p_evaluator_assertion: evaluatorAssertion(),
      p_evaluator_identity: SERVICE_IDENTITY,
      p_evaluator_proof_hash: toText(payload.evaluatorProofHash),
      p_execution_id: toText(payload.executionId),
      p_execution_receipt_hash: toText(payload.executionReceiptHash),
      p_verdict: toText(payload.verdict),
    },
  );
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "approved_execution_evaluator_proof_rejected" });
  }
  return json(200, result.data as JsonObject);
};

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (!await authenticateEvaluatorInvocation(request)) {
    return json(401, { error: "evaluator_invocation_required" });
  }
  try {
    const payload = await request.json().catch(() => null);
    if (!isRecord(payload) || !safePayload(payload)) {
      return json(400, { error: "independent_evaluator_payload_rejected" });
    }
    if (toText(payload.action) !== "record_evaluator_proof") {
      return json(400, { error: "unsupported_action" });
    }
    return await recordEvaluatorProof(createServiceClient(), payload);
  } catch {
    return json(500, { error: "cognitive_independent_evaluator_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
