import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  evaluateStoredResearchClaim,
  type ResearchClaimRecord,
  type ResearchContradictionRecord,
  type ResearchRelationRecord,
  type ResearchRetrievalRecord,
  type ResearchSnapshot,
  type ResearchSourceRecord,
} from "./policy.ts";

type Json = null | boolean | number | string | Json[] | {
  [key: string]: Json;
};
type JsonObject = { [key: string]: Json };
type SupabaseClientLike = ReturnType<typeof createClient<any>>;

const INVOCATION_HEADER = "x-cognitive-research-evaluator-invocation";
export const SUBJECT_EVALUATION_RPC =
  "cognitive_derive_subject_evaluation" as const;
const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const REQUEST_KEYS = Object.freeze([
  "action",
  "environment",
  "platform",
  "projectId",
  "researchClaimId",
  "taskId",
]);
const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers":
    `authorization, x-client-info, apikey, content-type, ${INVOCATION_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});

const json = (status: number, body: JsonObject): Response =>
  new Response(JSON.stringify(body), { headers: CORS_HEADERS, status });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    sortedExpected.every((key, index) => key === actual[index]);
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
  const maximum = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximum; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};

const authenticateInvocation = async (request: Request): Promise<boolean> => {
  const expectedHash = Deno.env.get(
    "COGNITIVE_RESEARCH_EVALUATOR_INVOKE_SHA256",
  )?.trim() ?? "";
  const token = request.headers.get(INVOCATION_HEADER)?.trim() ?? "";
  if (
    !LOWER_HEX_64.test(expectedHash) ||
    new TextEncoder().encode(token).byteLength < 32 ||
    new TextEncoder().encode(token).byteLength > 512
  ) {
    return false;
  }
  return constantTimeEqual(await sha256Hex(token), expectedHash);
};

const readRequiredSecret = (name: string): string => {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error("server_configuration_missing");
  return value;
};

const createServiceClient = (): SupabaseClientLike =>
  createClient(
    readRequiredSecret("SUPABASE_URL"),
    readRequiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

const evaluatorServiceToken = (): string => {
  const token = readRequiredSecret(
    "COGNITIVE_INDEPENDENT_EVALUATOR_SERVICE_TOKEN",
  );
  const length = new TextEncoder().encode(token).byteLength;
  if (length < 32 || length > 512) {
    throw new Error("server_configuration_missing");
  }
  return token;
};

type EvaluationRequest = Readonly<{
  action: "evaluate_research_claim";
  environment: "production";
  platform: "shared";
  projectId: string;
  researchClaimId: string;
  taskId: string;
}>;

const normalizeRequest = (value: unknown): EvaluationRequest | null => {
  if (
    !isRecord(value) || !hasExactKeys(value, REQUEST_KEYS) ||
    value.action !== "evaluate_research_claim" ||
    value.platform !== "shared" || value.environment !== "production" ||
    typeof value.taskId !== "string" || !UUID_PATTERN.test(value.taskId) ||
    typeof value.projectId !== "string" ||
    !UUID_PATTERN.test(value.projectId) ||
    typeof value.researchClaimId !== "string" ||
    !UUID_PATTERN.test(value.researchClaimId)
  ) {
    return null;
  }
  return Object.freeze({
    action: "evaluate_research_claim",
    environment: "production",
    platform: "shared",
    projectId: value.projectId,
    researchClaimId: value.researchClaimId,
    taskId: value.taskId,
  });
};

export const researchEvaluationGateOpen = async (
  serviceClient: SupabaseClientLike,
  request: EvaluationRequest,
): Promise<boolean> => {
  const now = new Date().toISOString();
  const [switches, retention, task, emergency] = await Promise.all([
    serviceClient
      .from("cognitive_governance_switches")
      .select("switch_key,enabled")
      .eq("task_id", request.taskId)
      .eq("project_id", request.projectId)
      .eq("platform", request.platform)
      .eq("environment", request.environment)
      .in("switch_key", [
        "cognitive_research_enabled",
        "cognitive_memory_enabled",
        "cognitive_user_derived_memory_enabled",
      ]),
    serviceClient
      .from("cognitive_retention_policy_states")
      .select(
        "policy_state,user_derived_memory_allowed,raw_user_reports_allowed,raw_private_messages_allowed,raw_private_media_allowed,raw_user_analytics_allowed,private_model_input_allowed",
      )
      .eq("task_id", request.taskId)
      .eq("project_id", request.projectId)
      .eq("platform", request.platform)
      .eq("environment", request.environment)
      .maybeSingle(),
    serviceClient
      .from("intelligence_tasks")
      .select("id,cancelled_at,quarantined_at,deadman_at")
      .eq("id", request.taskId)
      .eq("project_id", request.projectId)
      .eq("platform", request.platform)
      .eq("environment", request.environment)
      .gt("deadman_at", now)
      .is("cancelled_at", null)
      .is("quarantined_at", null)
      .maybeSingle(),
    serviceClient
      .from("autonomous_system_emergency_states")
      .select("system_id,status")
      .eq("system_id", "product_intelligence_operator")
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (
    switches.error || retention.error || task.error || emergency.error ||
    !Array.isArray(switches.data) || switches.data.length !== 3 ||
    !retention.data || !task.data || !emergency.data
  ) {
    return false;
  }
  const switchState = new Map(
    switches.data.map((entry) => [entry.switch_key, entry.enabled === true]),
  );
  return switchState.get("cognitive_research_enabled") === true &&
    switchState.get("cognitive_memory_enabled") === true &&
    switchState.get("cognitive_user_derived_memory_enabled") === false &&
    retention.data.policy_state === "owner_counsel_decision_required" &&
    retention.data.user_derived_memory_allowed === false &&
    retention.data.raw_user_reports_allowed === false &&
    retention.data.raw_private_messages_allowed === false &&
    retention.data.raw_private_media_allowed === false &&
    retention.data.raw_user_analytics_allowed === false &&
    retention.data.private_model_input_allowed === false;
};

export const loadResearchSnapshot = async (
  serviceClient: SupabaseClientLike,
  request: EvaluationRequest,
): Promise<ResearchSnapshot | null> => {
  const claimResult = await serviceClient
    .from("research_claims")
    .select(
      "id,task_id,project_id,platform,environment,status,bounded_claim,claim_hash,confidence,category,freshness_deadline,contradiction_state,support_state",
    )
    .eq("id", request.researchClaimId)
    .eq("task_id", request.taskId)
    .eq("project_id", request.projectId)
    .eq("platform", request.platform)
    .eq("environment", request.environment)
    .maybeSingle();
  if (claimResult.error || !claimResult.data) return null;
  const relationsResult = await serviceClient
    .from("research_claim_sources")
    .select("source_id,relationship")
    .eq("claim_id", request.researchClaimId)
    .eq("task_id", request.taskId)
    .eq("project_id", request.projectId)
    .eq("platform", request.platform)
    .eq("environment", request.environment);
  if (
    relationsResult.error || !Array.isArray(relationsResult.data) ||
    relationsResult.data.length < 1 || relationsResult.data.length > 8
  ) {
    return null;
  }
  const sourceIds = relationsResult.data.map((entry) => entry.source_id);
  if (
    sourceIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id)) ||
    new Set(sourceIds).size !== sourceIds.length
  ) {
    return null;
  }
  const [sourcesResult, retrievalsResult, contradictionsResult] = await Promise
    .all([
      serviceClient
        .from("research_sources")
        .select(
          "id,source_type,is_primary,ownership_identity,canonical_url_hash,content_hash,bounded_excerpt,citation_metadata,freshness_deadline,trusted_for_tool_execution",
        )
        .in("id", sourceIds)
        .eq("task_id", request.taskId)
        .eq("project_id", request.projectId)
        .eq("platform", request.platform)
        .eq("environment", request.environment),
      serviceClient
        .from("research_retrieval_events")
        .select(
          "id,source_id,request_url_hash,resolved_address_hashes,response_hash,result",
        )
        .in("source_id", sourceIds)
        .eq("task_id", request.taskId)
        .eq("project_id", request.projectId)
        .eq("platform", request.platform)
        .eq("environment", request.environment),
      serviceClient
        .from("research_contradictions")
        .select("resolution_state")
        .eq("claim_id", request.researchClaimId)
        .eq("task_id", request.taskId)
        .eq("project_id", request.projectId)
        .eq("platform", request.platform)
        .eq("environment", request.environment),
    ]);
  if (
    sourcesResult.error || retrievalsResult.error ||
    contradictionsResult.error ||
    !Array.isArray(sourcesResult.data) ||
    sourcesResult.data.length !== sourceIds.length ||
    !Array.isArray(retrievalsResult.data) ||
    !Array.isArray(contradictionsResult.data)
  ) {
    return null;
  }
  return Object.freeze({
    claim: claimResult.data as ResearchClaimRecord,
    contradictions: Object.freeze(
      contradictionsResult.data as ResearchContradictionRecord[],
    ),
    relations: Object.freeze(
      relationsResult.data as ResearchRelationRecord[],
    ),
    retrievals: Object.freeze(
      retrievalsResult.data as ResearchRetrievalRecord[],
    ),
    sources: Object.freeze(sourcesResult.data as ResearchSourceRecord[]),
  });
};

export const evaluateAndRecordResearchClaim = async (
  serviceClient: SupabaseClientLike,
  request: EvaluationRequest,
): Promise<Response> => {
  const snapshot = await loadResearchSnapshot(serviceClient, request);
  if (!snapshot) {
    return json(409, { error: "research_evaluation_subject_unavailable" });
  }
  const evaluation = await evaluateStoredResearchClaim(snapshot);
  const result = await serviceClient.rpc(
    SUBJECT_EVALUATION_RPC,
    {
      p_environment: request.environment,
      p_platform: request.platform,
      p_project_id: request.projectId,
      p_service_identity_token: evaluatorServiceToken(),
      p_subject_id: request.researchClaimId,
      p_subject_type: "research_claim",
      p_task_id: request.taskId,
    },
  );
  if (result.error || typeof result.data !== "string") {
    return json(409, { error: "research_evaluation_persistence_rejected" });
  }
  const readback = await serviceClient
    .from("cognitive_subject_evaluations")
    .select(
      "id,subject_type,subject_id,evaluation_status,evidence_hash,evaluator_identity_hash,expires_at",
    )
    .eq("id", result.data)
    .eq("task_id", request.taskId)
    .eq("project_id", request.projectId)
    .eq("platform", request.platform)
    .eq("environment", request.environment)
    .maybeSingle();
  if (
    readback.error || !readback.data ||
    readback.data.subject_type !== "research_claim" ||
    readback.data.subject_id !== request.researchClaimId ||
    readback.data.evaluation_status !== evaluation.status ||
    typeof readback.data.evidence_hash !== "string" ||
    typeof readback.data.evaluator_identity_hash !== "string"
  ) {
    return json(409, { error: "research_evaluation_readback_mismatch" });
  }
  return json(200, {
    canaryAccepted: false,
    evaluationEvidenceHash: evaluation.evidenceHash,
    evaluationStatus: evaluation.status,
    evaluatorIdentityHash: readback.data.evaluator_identity_hash,
    evaluatorRecordHash: await sha256Hex(result.data),
    evaluatorRecordId: result.data,
    expiresAt: String(readback.data.expires_at),
    reasons: [...evaluation.reasons],
    researchClaimId: request.researchClaimId,
    selfApproval: false,
  });
};

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (!await authenticateInvocation(request)) {
    return json(401, { error: "research_evaluator_invocation_required" });
  }
  try {
    const payload = normalizeRequest(await request.json().catch(() => null));
    if (!payload) {
      return json(400, { error: "research_evaluator_payload_rejected" });
    }
    const serviceClient = createServiceClient();
    if (!await researchEvaluationGateOpen(serviceClient, payload)) {
      return json(409, { error: "research_runtime_gate_closed" });
    }
    return await evaluateAndRecordResearchClaim(
      serviceClient,
      payload,
    );
  } catch {
    return json(500, { error: "cognitive_research_evaluator_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
