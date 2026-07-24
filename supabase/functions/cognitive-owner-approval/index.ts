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

const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const BOOTSTRAP_APPROVAL_KEYS = Object.freeze([
  "action",
  "branchName",
  "constitutionHash",
  "evaluatorRequirementHash",
  "policyVersion",
  "repositoryFullName",
  "retentionPolicyHash",
  "rollbackHash",
  "sourceCommit",
  "validitySeconds",
]);
const BOOTSTRAP_BRANCH_PATTERN =
  /^codex\/[a-z0-9][a-z0-9/_-]{2,120}$/u;
const BOOTSTRAP_BRANCH_FORBIDDEN_PATH =
  /(^|\/)(main|master|release)(\/|$)/u;
const LOWER_HEX_40 = /^[a-f0-9]{40}$/u;
const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const BOOTSTRAP_BRANCH_FORBIDDEN_FRAGMENTS = Object.freeze([
  "admin",
  "administrator",
  "anthropic",
  "apikey",
  "authorization",
  "aws",
  "azure",
  "bearer",
  "bypassguard",
  "credential",
  "developerinstruction",
  "developermessage",
  "eas",
  "expo",
  "gcp",
  "gemini",
  "ghp",
  "github",
  "githubpat",
  "iam",
  "ignoreallinstructions",
  "ignoreinstructions",
  "ignoreprevious",
  "jailbreak",
  "livekit",
  "openai",
  "overridepolicy",
  "owner",
  "passwd",
  "password",
  "permission",
  "privatekey",
  "privilege",
  "promptinjection",
  "provider",
  "root",
  "secret",
  "serviceaccount",
  "servicerole",
  "sessioncookie",
  "stripe",
  "sudo",
  "superuser",
  "supabase",
  "systeminstruction",
  "systemprompt",
  "token",
]);

export const isStrictBootstrapApprovalPayload = (
  value: unknown,
): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== BOOTSTRAP_APPROVAL_KEYS.length ||
    BOOTSTRAP_APPROVAL_KEYS.some((key) =>
      !Object.prototype.hasOwnProperty.call(value, key)
    )
  ) {
    return false;
  }
  if (
    value.action !== "record_bootstrap_approval" ||
    value.repositoryFullName !== "Chillywood2025/chillywood-mobile" ||
    value.policyVersion !== "collective-governance-v1" ||
    typeof value.branchName !== "string" ||
    !BOOTSTRAP_BRANCH_PATTERN.test(value.branchName) ||
    BOOTSTRAP_BRANCH_FORBIDDEN_PATH.test(value.branchName) ||
    typeof value.sourceCommit !== "string" ||
    !LOWER_HEX_40.test(value.sourceCommit) ||
    typeof value.retentionPolicyHash !== "string" ||
    !LOWER_HEX_64.test(value.retentionPolicyHash) ||
    typeof value.constitutionHash !== "string" ||
    !LOWER_HEX_64.test(value.constitutionHash) ||
    typeof value.rollbackHash !== "string" ||
    !LOWER_HEX_64.test(value.rollbackHash) ||
    typeof value.evaluatorRequirementHash !== "string" ||
    !LOWER_HEX_64.test(value.evaluatorRequirementHash) ||
    !Number.isSafeInteger(value.validitySeconds) ||
    Number(value.validitySeconds) < 60 ||
    Number(value.validitySeconds) > 86400
  ) {
    return false;
  }
  const compactBranch = value.branchName.replace(/[\/_-]/gu, "");
  if (
    /[a-z0-9]{24,}/u.test(value.branchName) ||
    BOOTSTRAP_BRANCH_FORBIDDEN_FRAGMENTS.some((fragment) =>
      compactBranch.includes(fragment)
    ) ||
    !safePayload(value.branchName)
  ) {
    return false;
  }
  return true;
};

const createActorClient = (authorization: string): SupabaseClientLike => {
  const supabaseUrl = readRequiredSecret("SUPABASE_URL");
  const anonKey = readRequiredSecret("SUPABASE_ANON_KEY");
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
};

const requireAuthenticatedUser = async (
  request: Request,
  actorClient: SupabaseClientLike,
): Promise<Response | null> => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "missing_authorization" });
  }
  const userResult = await actorClient.auth.getUser();
  if (userResult.error || !userResult.data.user?.id) {
    return json(401, { error: "invalid_authorization" });
  }
  return null;
};

const recordOwnerApproval = async (
  actorClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await actorClient.rpc("governance_record_owner_approval", {
    p_approval_key: toText(payload.approvalKey),
    p_approval_scope_hash: toText(payload.approvalScopeHash),
    p_architecture_graph_digest: toText(payload.architectureGraphDigest),
    p_branch_name: toText(payload.branchName),
    p_budget_hash: toText(payload.budgetHash),
    p_decision_manifest_id: toText(payload.decisionManifestId),
    p_evaluator_requirement_hash: toText(payload.evaluatorRequirementHash),
    p_function_scope_hashes: Array.isArray(payload.functionScopeHashes)
      ? payload.functionScopeHashes
      : [],
    p_maximum_bytes: payload.maximumBytes,
    p_maximum_calls: payload.maximumCalls,
    p_maximum_cost: payload.maximumCost,
    p_maximum_executions: payload.maximumExecutions,
    p_objective_hash: toText(payload.objectiveHash),
    p_operation: toText(payload.operation),
    p_path_scope_hashes: Array.isArray(payload.pathScopeHashes)
      ? payload.pathScopeHashes
      : [],
    p_plan_snapshot_hash: toText(payload.planSnapshotHash),
    p_provider: toText(payload.provider),
    p_repository_full_name: toText(payload.repositoryFullName),
    p_required_test_ids: Array.isArray(payload.requiredTestIds)
      ? payload.requiredTestIds
      : [],
    p_rollback_hash: toText(payload.rollbackHash),
    p_source_commit: toText(payload.sourceCommit),
    p_table_scope_hashes: Array.isArray(payload.tableScopeHashes)
      ? payload.tableScopeHashes
      : [],
    p_target_resource_hash: toText(payload.targetResourceHash),
    p_tests_hash: toText(payload.testsHash),
  });
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "owner_approval_rejected" });
  }
  return json(200, result.data as JsonObject);
};

const recordBootstrapApproval = async (
  actorClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await actorClient.rpc("governance_record_bootstrap_approval", {
    p_branch_name: toText(payload.branchName),
    p_constitution_hash: toText(payload.constitutionHash),
    p_evaluator_requirement_hash: toText(payload.evaluatorRequirementHash),
    p_policy_version: toText(payload.policyVersion),
    p_repository_full_name: toText(payload.repositoryFullName),
    p_retention_policy_hash: toText(payload.retentionPolicyHash),
    p_rollback_hash: toText(payload.rollbackHash),
    p_source_commit: toText(payload.sourceCommit),
    p_validity_seconds: payload.validitySeconds,
  });
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "bootstrap_owner_approval_rejected" });
  }
  return json(200, result.data as JsonObject);
};

const revokeOwnerApproval = async (
  actorClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await actorClient.rpc("governance_revoke_owner_approval", {
    p_approval_version_id: toText(payload.approvalVersionId),
    p_reason_hash: toText(payload.reasonHash),
  });
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "owner_approval_revoke_rejected" });
  }
  return json(200, result.data as JsonObject);
};

const revalidateOwnerApproval = async (
  actorClient: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const result = await actorClient.rpc("governance_revalidate_owner_approval", {
    p_current_decision_manifest_hash: toText(payload.currentDecisionManifestHash),
    p_current_plan_snapshot_hash: toText(payload.currentPlanSnapshotHash),
    p_current_source_commit: toText(payload.currentSourceCommit),
    p_expired_version_id: toText(payload.expiredVersionId),
    p_material_delta: payload.materialDelta === true,
    p_revalidation_hash: toText(payload.revalidationHash),
  });
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "owner_approval_revalidation_rejected" });
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
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const actorClient = createActorClient(authorization);
    const authError = await requireAuthenticatedUser(request, actorClient);
    if (authError) return authError;
    const payload = await request.json().catch(() => null);
    if (!isRecord(payload)) {
      return json(400, { error: "owner_approval_payload_rejected" });
    }
    const action = toText(payload.action);
    if (action === "record_bootstrap_approval") {
      if (!isStrictBootstrapApprovalPayload(payload)) {
        return json(400, { error: "owner_approval_payload_rejected" });
      }
      return await recordBootstrapApproval(actorClient, payload);
    }
    if (!safePayload(payload)) {
      return json(400, { error: "owner_approval_payload_rejected" });
    }
    if (action === "record_owner_approval") {
      return await recordOwnerApproval(actorClient, payload);
    }
    if (action === "revoke_owner_approval") {
      return await revokeOwnerApproval(actorClient, payload);
    }
    if (action === "revalidate_owner_approval") {
      return await revalidateOwnerApproval(actorClient, payload);
    }
    return json(400, { error: "unsupported_action" });
  } catch {
    return json(500, { error: "cognitive_owner_approval_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
