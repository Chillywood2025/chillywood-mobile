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

const SERVICE_IDENTITY = "product_experience_baseline_service";
const INVOCATION_HEADER = "x-cognitive-baseline-invocation";
const MAX_REQUEST_BYTES = 24 * 1024;
const BASELINE_ID = "chillywood-product-experience-baseline-v1";
const BASELINE_KEY = "streaming_mobile_content_density";
const SELECTED_OPTION_CODE = "C";
const SELECTED_OPTION = "creator_balanced";
const BASELINE_HASH =
  "34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba";
const SOURCE_OPTIONS_MANIFEST_HASH =
  "7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df";
const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const LOWER_HEX_40 = /^[a-f0-9]{40}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const BRANCH = /^codex\/[a-z0-9][a-z0-9/_-]{2,120}$/u;
const SECURITY_POLICY = securityPolicyJson as CanonicalSecurityPolicy;
const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers":
    `authorization, x-client-info, apikey, content-type, ${INVOCATION_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});

const CLAIM_KEYS = Object.freeze([
  "action",
  "approvalHash",
  "approvalVersionId",
  "baselineHash",
  "baselineId",
  "branchName",
  "budgetHash",
  "decisionManifestHash",
  "environment",
  "evaluatorRequirementHash",
  "operation",
  "planSnapshotHash",
  "platform",
  "projectId",
  "provider",
  "repositoryFullName",
  "rollbackHash",
  "selectedOption",
  "selectedOptionCode",
  "sourceOptionsManifestHash",
  "targetResourceHash",
  "taskId",
  "testsHash",
]);
const TRANSITION_KEYS = Object.freeze(["action", "executionId", "nextState"]);
const STAGE_KEYS = Object.freeze([
  "action",
  "baselineHash",
  "baselineId",
  "executionId",
  "selectedOption",
  "selectedOptionCode",
  "sourceCommit",
  "sourceOptionsManifestHash",
]);
const COMPLETE_KEYS = Object.freeze([
  "action",
  "evaluatorProofHash",
  "executionId",
  "executionReceiptHash",
]);
const PERSIST_KEYS = Object.freeze(["action", "executionId"]);
const FAIL_KEYS = Object.freeze(["action", "executionId", "failureHash"]);
const NEXT_STATES = new Set(["preflight", "executing", "evaluating"]);

const json = (status: number, body: JsonObject): Response =>
  new Response(JSON.stringify(body), { headers: CORS_HEADERS, status });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return keys.length === sorted.length &&
    keys.every((key, index) => key === sorted[index]);
};
const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const safePayload = (value: unknown): boolean =>
  classifyCanonicalSecurityPayload(value, SECURITY_POLICY) === "safe";

const exactSelection = (value: Record<string, unknown>): boolean =>
  value.baselineId === BASELINE_ID &&
  value.selectedOptionCode === SELECTED_OPTION_CODE &&
  value.selectedOption === SELECTED_OPTION &&
  value.baselineHash === BASELINE_HASH &&
  value.sourceOptionsManifestHash === SOURCE_OPTIONS_MANIFEST_HASH;

export const isStrictBaselineExecutorPayload = (
  value: unknown,
): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  if (value.action === "claim") {
    return hasExactKeys(value, CLAIM_KEYS) &&
      UUID.test(text(value.approvalVersionId)) &&
      UUID.test(text(value.taskId)) &&
      UUID.test(text(value.projectId)) &&
      LOWER_HEX_64.test(text(value.decisionManifestHash)) &&
      LOWER_HEX_64.test(text(value.planSnapshotHash)) &&
      LOWER_HEX_64.test(text(value.approvalHash)) &&
      LOWER_HEX_64.test(text(value.targetResourceHash)) &&
      LOWER_HEX_64.test(text(value.budgetHash)) &&
      LOWER_HEX_64.test(text(value.testsHash)) &&
      LOWER_HEX_64.test(text(value.evaluatorRequirementHash)) &&
      LOWER_HEX_64.test(text(value.rollbackHash)) &&
      value.repositoryFullName === "Chillywood2025/chillywood-mobile" &&
      BRANCH.test(text(value.branchName)) &&
      !/(^|\/)(main|master|release)(\/|$)/iu.test(text(value.branchName)) &&
      ["android", "ios", "web", "shared"].includes(text(value.platform)) &&
      value.environment === "production" &&
      value.provider === "visual_sentinel" &&
      value.operation === "visual_experience_canary" &&
      value.targetResourceHash === BASELINE_HASH &&
      exactSelection(value) &&
      safePayload({
        action: value.action,
        branchName: value.branchName,
        repositoryFullName: value.repositoryFullName,
      });
  }
  if (value.action === "transition") {
    return hasExactKeys(value, TRANSITION_KEYS) &&
      UUID.test(text(value.executionId)) &&
      NEXT_STATES.has(text(value.nextState)) &&
      safePayload({ action: value.action, nextState: value.nextState });
  }
  if (value.action === "stage_selection") {
    return hasExactKeys(value, STAGE_KEYS) &&
      UUID.test(text(value.executionId)) &&
      LOWER_HEX_40.test(text(value.sourceCommit)) &&
      exactSelection(value) &&
      safePayload({ action: value.action });
  }
  if (value.action === "complete") {
    return hasExactKeys(value, COMPLETE_KEYS) &&
      UUID.test(text(value.executionId)) &&
      LOWER_HEX_64.test(text(value.executionReceiptHash)) &&
      LOWER_HEX_64.test(text(value.evaluatorProofHash)) &&
      safePayload({ action: value.action });
  }
  if (value.action === "persist") {
    return hasExactKeys(value, PERSIST_KEYS) &&
      UUID.test(text(value.executionId)) &&
      safePayload({ action: value.action });
  }
  if (value.action === "fail") {
    return hasExactKeys(value, FAIL_KEYS) &&
      UUID.test(text(value.executionId)) &&
      LOWER_HEX_64.test(text(value.failureHash)) &&
      safePayload({ action: value.action });
  }
  return false;
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
    diff |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return diff === 0;
};
const authenticateInvocation = async (request: Request): Promise<boolean> => {
  const expectedHash = Deno.env.get(
    "COGNITIVE_PRODUCT_BASELINE_SERVICE_INVOKE_SHA256",
  )?.trim() ?? "";
  const invocation = request.headers.get(INVOCATION_HEADER)?.trim() ?? "";
  return !!expectedHash && !!invocation &&
    constantTimeEqual(await sha256Hex(invocation), expectedHash);
};
const createServiceClient = (): SupabaseClientLike =>
  createClient(
    readRequiredSecret("SUPABASE_URL"),
    readRequiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
const serviceAssertion = (): string =>
  readRequiredSecret("COGNITIVE_PRODUCT_BASELINE_SERVICE_ASSERTION");

const rpcResponse = (
  result: { data: unknown; error: unknown },
  error: string,
): Response =>
  result.error || !isRecord(result.data)
    ? json(409, { error })
    : json(200, result.data as JsonObject);

const dispatch = async (
  client: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  if (payload.action === "claim") {
    return rpcResponse(
      await client.rpc("governance_claim_approved_action", {
        p_approval_hash: text(payload.approvalHash),
        p_approval_version_id: text(payload.approvalVersionId),
        p_branch_name: text(payload.branchName),
        p_budget_hash: text(payload.budgetHash),
        p_decision_manifest_hash: text(payload.decisionManifestHash),
        p_environment: text(payload.environment),
        p_evaluator_requirement_hash: text(payload.evaluatorRequirementHash),
        p_operation: "visual_experience_canary",
        p_plan_snapshot_hash: text(payload.planSnapshotHash),
        p_platform: text(payload.platform),
        p_project_id: text(payload.projectId),
        p_provider: "visual_sentinel",
        p_repository_full_name: "Chillywood2025/chillywood-mobile",
        p_rollback_hash: text(payload.rollbackHash),
        p_service_identity: SERVICE_IDENTITY,
        p_target_resource_hash: BASELINE_HASH,
        p_task_id: text(payload.taskId),
        p_tests_hash: text(payload.testsHash),
        p_worker_assertion: serviceAssertion(),
      }),
      "product_baseline_claim_rejected",
    );
  }
  if (payload.action === "transition") {
    return rpcResponse(
      await client.rpc("governance_begin_approved_execution", {
        p_execution_id: text(payload.executionId),
        p_next_state: text(payload.nextState),
        p_service_identity: SERVICE_IDENTITY,
        p_worker_assertion: serviceAssertion(),
      }),
      "product_baseline_transition_rejected",
    );
  }
  if (payload.action === "stage_selection") {
    return rpcResponse(
      await client.rpc("governance_stage_product_experience_baseline_v1", {
        p_baseline_hash: BASELINE_HASH,
        p_baseline_identifier: BASELINE_ID,
        p_execution_id: text(payload.executionId),
        p_selected_option_code: SELECTED_OPTION_CODE,
        p_selected_option_name: SELECTED_OPTION,
        p_service_identity: SERVICE_IDENTITY,
        p_source_commit: text(payload.sourceCommit),
        p_source_options_manifest_hash: SOURCE_OPTIONS_MANIFEST_HASH,
        p_worker_assertion: serviceAssertion(),
      }),
      "product_baseline_stage_rejected",
    );
  }
  if (payload.action === "complete") {
    return rpcResponse(
      await client.rpc("governance_complete_approved_execution", {
        p_evaluator_proof_hash: text(payload.evaluatorProofHash),
        p_execution_id: text(payload.executionId),
        p_execution_receipt_hash: text(payload.executionReceiptHash),
        p_service_identity: SERVICE_IDENTITY,
        p_worker_assertion: serviceAssertion(),
      }),
      "product_baseline_completion_rejected",
    );
  }
  if (payload.action === "persist") {
    return rpcResponse(
      await client.rpc(
        "governance_product_baseline_persist_completed_execution",
        {
          p_execution_id: text(payload.executionId),
          p_service_identity: SERVICE_IDENTITY,
          p_worker_assertion: serviceAssertion(),
        },
      ),
      "product_baseline_persistence_rejected",
    );
  }
  return rpcResponse(
    await client.rpc("governance_fail_approved_execution", {
      p_execution_id: text(payload.executionId),
      p_failure_hash: text(payload.failureHash),
      p_service_identity: SERVICE_IDENTITY,
      p_worker_assertion: serviceAssertion(),
    }),
    "product_baseline_failure_rejected",
  );
};

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (!await authenticateInvocation(request)) {
    return json(401, { error: "product_baseline_invocation_required" });
  }
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json(413, { error: "product_baseline_payload_too_large" });
    }
    const payload = JSON.parse(rawBody) as unknown;
    if (!isStrictBaselineExecutorPayload(payload)) {
      return json(400, { error: "product_baseline_payload_rejected" });
    }
    return await dispatch(createServiceClient(), payload);
  } catch {
    return json(500, { error: "cognitive_product_baseline_executor_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
