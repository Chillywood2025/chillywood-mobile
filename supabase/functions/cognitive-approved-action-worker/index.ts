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

const INVOCATION_HEADER = "x-cognitive-worker-invocation";
const SERVICE_IDENTITY = "cognitive_approved_action_worker";
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

const authenticateWorkerInvocation = async (request: Request): Promise<boolean> => {
  const expectedHash = Deno.env.get("COGNITIVE_APPROVED_ACTION_WORKER_INVOKE_SHA256")
    ?.trim() ?? "";
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

const workerAssertion = (): string =>
  readRequiredSecret("COGNITIVE_APPROVED_ACTION_WORKER_ASSERTION");

const claimApprovedAction = async (
  serviceClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await serviceClient.rpc("governance_claim_approved_action", {
    p_approval_hash: toText(payload.approvalHash),
    p_approval_version_id: toText(payload.approvalVersionId),
    p_branch_name: toText(payload.branchName),
    p_budget_hash: toText(payload.budgetHash),
    p_decision_manifest_hash: toText(payload.decisionManifestHash),
    p_environment: toText(payload.environment),
    p_evaluator_requirement_hash: toText(payload.evaluatorRequirementHash),
    p_operation: toText(payload.operation),
    p_plan_snapshot_hash: toText(payload.planSnapshotHash),
    p_platform: toText(payload.platform),
    p_project_id: toText(payload.projectId),
    p_provider: toText(payload.provider),
    p_repository_full_name: toText(payload.repositoryFullName),
    p_rollback_hash: toText(payload.rollbackHash),
    p_service_identity: SERVICE_IDENTITY,
    p_target_resource_hash: toText(payload.targetResourceHash),
    p_task_id: toText(payload.taskId),
    p_tests_hash: toText(payload.testsHash),
    p_worker_assertion: workerAssertion(),
  });
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "approved_action_claim_rejected" });
  }
  return json(200, result.data as JsonObject);
};

const beginApprovedExecution = async (
  serviceClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await serviceClient.rpc("governance_begin_approved_execution", {
    p_execution_id: toText(payload.executionId),
    p_next_state: toText(payload.nextState),
    p_service_identity: SERVICE_IDENTITY,
    p_worker_assertion: workerAssertion(),
  });
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "approved_execution_transition_rejected" });
  }
  return json(200, result.data as JsonObject);
};

const completeApprovedExecution = async (
  serviceClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await serviceClient.rpc("governance_complete_approved_execution", {
    p_evaluator_proof_hash: toText(payload.evaluatorProofHash),
    p_execution_id: toText(payload.executionId),
    p_execution_receipt_hash: toText(payload.executionReceiptHash),
    p_service_identity: SERVICE_IDENTITY,
    p_worker_assertion: workerAssertion(),
  });
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "approved_execution_completion_rejected" });
  }
  return json(200, result.data as JsonObject);
};

const executeApprovedSwitch = async (
  serviceClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await serviceClient.rpc("governance_execute_approved_switch", {
    p_enabled: payload.enabled === true,
    p_execution_id: toText(payload.executionId),
    p_policy_version: toText(payload.policyVersion),
    p_service_identity: SERVICE_IDENTITY,
    p_switch_key: toText(payload.switchKey),
    p_target_resource_hash: toText(payload.targetResourceHash),
    p_worker_assertion: workerAssertion(),
  });
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "approved_switch_execution_rejected" });
  }
  return json(200, result.data as JsonObject);
};

const failApprovedExecution = async (
  serviceClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await serviceClient.rpc("governance_fail_approved_execution", {
    p_execution_id: toText(payload.executionId),
    p_failure_hash: toText(payload.failureHash),
    p_service_identity: SERVICE_IDENTITY,
    p_worker_assertion: workerAssertion(),
  });
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "approved_execution_failure_rejected" });
  }
  return json(200, result.data as JsonObject);
};

const releaseOrQuarantineExecution = async (
  serviceClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await serviceClient.rpc("governance_release_or_quarantine_execution", {
    p_evidence_hash: toText(payload.evidenceHash),
    p_execution_id: toText(payload.executionId),
    p_service_identity: SERVICE_IDENTITY,
    p_transition: toText(payload.transition),
    p_worker_assertion: workerAssertion(),
  });
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "approved_execution_release_rejected" });
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
  if (!await authenticateWorkerInvocation(request)) {
    return json(401, { error: "worker_invocation_required" });
  }
  try {
    const payload = await request.json().catch(() => null);
    if (!isRecord(payload) || !safePayload(payload)) {
      return json(400, { error: "approved_action_payload_rejected" });
    }
    const serviceClient = createServiceClient();
    const action = toText(payload.action);
    if (action === "claim") return await claimApprovedAction(serviceClient, payload);
    if (action === "begin") return await beginApprovedExecution(serviceClient, payload);
    if (action === "execute_switch") {
      return await executeApprovedSwitch(serviceClient, payload);
    }
    if (action === "complete") {
      return await completeApprovedExecution(serviceClient, payload);
    }
    if (action === "fail") return await failApprovedExecution(serviceClient, payload);
    if (action === "release_or_quarantine") {
      return await releaseOrQuarantineExecution(serviceClient, payload);
    }
    return json(400, { error: "unsupported_action" });
  } catch {
    return json(500, { error: "cognitive_approved_action_worker_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
