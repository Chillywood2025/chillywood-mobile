import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  type CanonicalSecurityPolicy,
  classifyCanonicalSecurityPayload,
} from "../../../_lib/cognitivePolicyEngine.ts";
import securityPolicyJson from "../../../config/intelligence/cognitive-security-classification-policy.json" with {
  type: "json",
};

const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});

const REPOSITORY = "Chillywood2025/chillywood-mobile";
const PLATFORM = "shared";
const ENVIRONMENT = "production";
const POLICY_VERSION = "collective-governance-v1";
const SERVICE_IDENTITY = "owner_approval_lifecycle_service";
const SECURITY_POLICY = securityPolicyJson as CanonicalSecurityPolicy;
const RESEARCH_KEYS = Object.freeze([
  "platform_policy_research",
  "repository_architecture_ux",
  "dependency_security_research",
]);
const DELIBERATION_KEYS = Object.freeze([
  "low_risk_ux_deliberation",
  "backend_reliability_deliberation",
  "security_dependency_deliberation",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };
type StaffRole = "owner" | "super_admin" | "scoped_admin";
type SupabaseClientLike = ReturnType<typeof createClient<any>>;
type AuthenticatedActor = Readonly<{
  id: string;
  role: StaffRole;
}>;

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

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((entry, index) => entry === [...expected].sort()[index]);
};

const trustedRecordId = (value: unknown): string | null => {
  const candidate = toText(value);
  return UUID_PATTERN.test(candidate) ? candidate : null;
};

const validServiceIdentityToken = (value: string): boolean =>
  value.length >= 32 && value.length <= 1024;

const matchesTrustedRpcResult = (
  value: unknown,
  expected: Readonly<Record<string, string>>,
  expectedState: "passed" | "configured",
): value is Record<string, unknown> => {
  if (
    !isRecord(value) ||
    value.accepted !== true ||
    value.evaluator_state !== "pass"
  ) {
    return false;
  }
  if (
    expectedState === "passed" &&
    value.result_status !== "passed"
  ) {
    return false;
  }
  if (
    expectedState === "configured" &&
    value.state !== "configured"
  ) {
    return false;
  }
  return Object.entries(expected).every(
    ([key, expectedValue]) => value[key] === expectedValue,
  );
};

const authenticate = async (
  request: Request,
  adminClient: SupabaseClientLike,
  actorClient: SupabaseClientLike,
): Promise<AuthenticatedActor | Response> => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "missing_authorization" });
  }
  const userResult = await actorClient.auth.getUser();
  const userId = userResult.data.user?.id ?? "";
  if (userResult.error || !userId) {
    return json(401, { error: "invalid_authorization" });
  }
  const membership = await adminClient
    .from("platform_role_memberships")
    .select("role")
    .eq("status", "active")
    .eq("user_id", userId)
    .in("role", ["owner", "super_admin"])
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();
  const role = toText(membership.data?.role);
  if (!membership.error && (role === "owner" || role === "super_admin")) {
    return Object.freeze({ id: userId, role: role as StaffRole });
  }
  const permission = await adminClient
    .from("platform_staff_permission_grants")
    .select("id")
    .eq("status", "active")
    .eq("target_user_id", userId)
    .eq("permission_key", "admin.cognitive.read")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1)
    .maybeSingle();
  if (!permission.error && permission.data?.id) {
    return Object.freeze({ id: userId, role: "scoped_admin" });
  }
  return json(403, { error: "cognitive_read_scope_required" });
};

const requireOwner = (actor: AuthenticatedActor): Response | null =>
  actor.role === "owner" ? null : json(403, { error: "exact_owner_required" });

const readCanaryScope = async (
  adminClient: SupabaseClientLike,
): Promise<{ projectId: string; taskId: string } | Response> => {
  const task = await adminClient
    .from("intelligence_tasks")
    .select("id,project_id")
    .eq("repository_full_name", REPOSITORY)
    .eq("task_key", "cognitive-level01-canary-control")
    .eq("platform", PLATFORM)
    .eq("environment", ENVIRONMENT)
    .limit(1)
    .maybeSingle();
  if (task.error || !task.data?.id || !task.data?.project_id) {
    return json(409, { error: "level01_canary_not_bootstrapped" });
  }
  return { projectId: task.data.project_id, taskId: task.data.id };
};

const readStatus = async (
  actorClient: SupabaseClientLike,
  actor: AuthenticatedActor,
): Promise<Response> => {
  const task = await actorClient
    .from("intelligence_tasks")
    .select("id,project_id,status,platform,environment,created_at")
    .eq("repository_full_name", REPOSITORY)
    .eq("task_key", "cognitive-level01-canary-control")
    .eq("platform", PLATFORM)
    .eq("environment", ENVIRONMENT)
    .limit(1)
    .maybeSingle();
  if (task.error) return json(500, { error: "cognitive_status_read_failed" });
  if (!task.data) {
    return json(200, {
      activation: "off",
      deployment: "not_deployed",
      liveMemory: false,
      liveResearch: false,
      productionAuthority: false,
      scheduler: "none",
      source: "live_readback",
      canManageLevel01: actor.role === "owner",
    });
  }
  const [switches, schedules, canaries, approvals, decisions, emergency] =
    await Promise.all([
      actorClient
        .from("cognitive_governance_switches")
        .select("switch_key,enabled,policy_version,updated_at")
        .eq("task_id", task.data.id)
        .order("switch_key"),
      actorClient
        .from("cognitive_level01_schedule_definitions")
        .select(
          "schedule_key,enabled,maximum_tasks,maximum_cost,timeout_seconds",
        )
        .eq("task_id", task.data.id)
        .order("schedule_key"),
      actorClient
        .from("cognitive_level01_canary_runs")
        .select(
          "canary_key,canary_type,result_status,evaluator_state,created_at",
        )
        .eq("task_id", task.data.id)
        .order("created_at", { ascending: false })
        .limit(30),
      actorClient
        .from("governance_approvals")
        .select("approval_key,status,current_version,updated_at")
        .eq("task_id", task.data.id)
        .order("updated_at", { ascending: false })
        .limit(20),
      actorClient
        .from("governance_decision_manifests")
        .select("id")
        .eq("task_id", task.data.id)
        .limit(100),
      actorClient
        .from("autonomous_system_emergency_states")
        .select("status")
        .eq("system_id", "product_intelligence_operator")
        .limit(1)
        .maybeSingle(),
    ]);
  if (
    switches.error ||
    schedules.error ||
    canaries.error ||
    approvals.error ||
    decisions.error ||
    emergency.error
  ) {
    return json(500, { error: "cognitive_status_read_failed" });
  }
  const switchMap = Object.fromEntries(
    (switches.data ?? []).map((
      entry,
    ) => [String(entry.switch_key), entry.enabled === true]),
  );
  const scheduleRows = schedules.data ?? [];
  return json(200, {
    activation: "bounded_level01",
    approvals: approvals.data ?? [],
    canaries: canaries.data ?? [],
    canManageLevel01: actor.role === "owner",
    deployment: "deployed",
    deploymentState: String(task.data.status),
    emergencyStop: emergency.data?.status !== "active",
    latestDecisionCount: decisions.data?.length ?? 0,
    pendingApprovalCount: (approvals.data ?? []).filter(
      (entry) => entry.status === "pending",
    ).length,
    productionAuthority: false,
    schedulerState: scheduleRows.some((entry) => entry.enabled === true)
      ? "bounded_level01"
      : "none",
    schedules: scheduleRows,
    source: "live_readback",
    switches: switchMap,
  });
};

const setSwitch = async (
  actorClient: SupabaseClientLike,
  scope: { projectId: string; taskId: string },
  payload: Record<string, unknown>,
): Promise<Response> => {
  const switchKey = toText(payload.switchKey);
  const enabled = payload.enabled;
  if (
    typeof enabled !== "boolean" ||
    ![
      "cognitive_research_enabled",
      "cognitive_memory_enabled",
      "cognitive_collective_deliberation_enabled",
      "cognitive_draft_pr_executor_enabled",
      "cognitive_scheduled_level01_enabled",
    ].includes(switchKey)
  ) {
    return json(400, { error: "level01_switch_scope_rejected" });
  }
  if (switchKey === "cognitive_scheduled_level01_enabled" && enabled) {
    const scheduleResult = await actorClient.rpc(
      "cognitive_set_level01_schedule_state",
      {
        p_enabled: true,
        p_environment: ENVIRONMENT,
        p_platform: PLATFORM,
        p_project_id: scope.projectId,
        p_task_id: scope.taskId,
      },
    );
    if (scheduleResult.error) {
      return json(409, { error: "level01_schedule_prerequisites_rejected" });
    }
  }
  const result = await actorClient.rpc("governance_set_level01_switch", {
    p_enabled: enabled,
    p_environment: ENVIRONMENT,
    p_platform: PLATFORM,
    p_policy_version: POLICY_VERSION,
    p_project_id: scope.projectId,
    p_switch_key: switchKey,
    p_task_id: scope.taskId,
  });
  if (result.error) {
    return json(409, { error: "level01_switch_change_rejected" });
  }
  if (switchKey === "cognitive_scheduled_level01_enabled" && !enabled) {
    const scheduleResult = await actorClient.rpc(
      "cognitive_set_level01_schedule_state",
      {
        p_enabled: false,
        p_environment: ENVIRONMENT,
        p_platform: PLATFORM,
        p_project_id: scope.projectId,
        p_task_id: scope.taskId,
      },
    );
    if (scheduleResult.error) {
      return json(409, { error: "level01_schedule_disable_rejected" });
    }
  }
  return json(200, { enabled, ok: true, switchKey });
};

export const recordResearchFromTrustedRecords = async (
  adminClient: SupabaseClientLike,
  scope: { projectId: string; taskId: string },
  ownerActorId: string,
  serviceIdentityToken: string,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const canaryKey = toText(payload.canaryKey);
  const brokerReceiptId = trustedRecordId(payload.brokerReceiptId);
  const researchClaimId = trustedRecordId(payload.researchClaimId);
  const evaluatorRecordId = trustedRecordId(payload.evaluatorRecordId);
  if (
    !hasExactKeys(payload, [
      "action",
      "brokerReceiptId",
      "canaryKey",
      "evaluatorRecordId",
      "researchClaimId",
    ]) ||
    !RESEARCH_KEYS.includes(canaryKey) ||
    !brokerReceiptId ||
    !researchClaimId ||
    !evaluatorRecordId ||
    !validServiceIdentityToken(serviceIdentityToken)
  ) {
    return json(400, { error: "trusted_research_records_required" });
  }
  const result = await adminClient.rpc(
    "cognitive_accept_verified_research_canary",
    {
      p_broker_receipt_id: brokerReceiptId,
      p_canary_key: canaryKey,
      p_environment: ENVIRONMENT,
      p_evaluator_record_id: evaluatorRecordId,
      p_owner_actor_id: ownerActorId,
      p_platform: PLATFORM,
      p_project_id: scope.projectId,
      p_research_claim_id: researchClaimId,
      p_service_identity: SERVICE_IDENTITY,
      p_service_identity_token: serviceIdentityToken,
      p_task_id: scope.taskId,
    },
  );
  if (
    result.error ||
    !matchesTrustedRpcResult(
      result.data,
      {
        broker_receipt_id: brokerReceiptId,
        canary_key: canaryKey,
        evaluator_record_id: evaluatorRecordId,
        research_claim_id: researchClaimId,
      },
      "passed",
    )
  ) {
    return json(409, { error: "trusted_research_records_rejected" });
  }
  return json(200, {
    canaryKey,
    result: "passed",
    runId: toText(result.data.canary_run_id),
    source: "verified_database_records",
  });
};

export const recordDeliberationFromTrustedRecords = async (
  adminClient: SupabaseClientLike,
  scope: { projectId: string; taskId: string },
  ownerActorId: string,
  serviceIdentityToken: string,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const canaryKey = toText(payload.canaryKey);
  const deliberationId = trustedRecordId(payload.deliberationId);
  const decisionManifestId = trustedRecordId(payload.decisionManifestId);
  const evaluatorRecordId = trustedRecordId(payload.evaluatorRecordId);
  if (
    !hasExactKeys(payload, [
      "action",
      "canaryKey",
      "decisionManifestId",
      "deliberationId",
      "evaluatorRecordId",
    ]) ||
    !DELIBERATION_KEYS.includes(canaryKey) ||
    !deliberationId ||
    !decisionManifestId ||
    !evaluatorRecordId ||
    !validServiceIdentityToken(serviceIdentityToken)
  ) {
    return json(400, { error: "trusted_deliberation_records_required" });
  }
  const result = await adminClient.rpc(
    "cognitive_accept_verified_deliberation_canary",
    {
      p_canary_key: canaryKey,
      p_decision_manifest_id: decisionManifestId,
      p_deliberation_id: deliberationId,
      p_environment: ENVIRONMENT,
      p_evaluator_record_id: evaluatorRecordId,
      p_owner_actor_id: ownerActorId,
      p_platform: PLATFORM,
      p_project_id: scope.projectId,
      p_service_identity: SERVICE_IDENTITY,
      p_service_identity_token: serviceIdentityToken,
      p_task_id: scope.taskId,
    },
  );
  if (
    result.error ||
    !matchesTrustedRpcResult(
      result.data,
      {
        canary_key: canaryKey,
        decision_manifest_id: decisionManifestId,
        deliberation_id: deliberationId,
        evaluator_record_id: evaluatorRecordId,
      },
      "passed",
    )
  ) {
    return json(409, { error: "trusted_deliberation_records_rejected" });
  }
  return json(200, {
    canaryKey,
    result: "passed",
    runId: toText(result.data.canary_run_id),
    source: "verified_database_records",
  });
};

export const recordCredentialFromTrustedRecords = async (
  adminClient: SupabaseClientLike,
  scope: { projectId: string; taskId: string },
  ownerActorId: string,
  serviceIdentityToken: string,
  payload: Record<string, unknown>,
): Promise<Response> => {
  const credentialKind = toText(payload.credentialKind);
  const providerAttestationId = trustedRecordId(payload.providerAttestationId);
  const providerReadbackId = trustedRecordId(payload.providerReadbackId);
  const evaluatorRecordId = trustedRecordId(payload.evaluatorRecordId);
  if (
    !hasExactKeys(payload, [
      "action",
      "credentialKind",
      "evaluatorRecordId",
      "providerAttestationId",
      "providerReadbackId",
    ]) ||
    !["model_provider", "github_draft_pr"].includes(credentialKind) ||
    !providerAttestationId ||
    !providerReadbackId ||
    !evaluatorRecordId ||
    !validServiceIdentityToken(serviceIdentityToken)
  ) {
    return json(400, { error: "trusted_credential_records_required" });
  }
  const result = await adminClient.rpc(
    "cognitive_accept_verified_credential_attestation",
    {
      p_credential_kind: credentialKind,
      p_environment: ENVIRONMENT,
      p_evaluator_record_id: evaluatorRecordId,
      p_owner_actor_id: ownerActorId,
      p_platform: PLATFORM,
      p_project_id: scope.projectId,
      p_provider_attestation_id: providerAttestationId,
      p_provider_readback_id: providerReadbackId,
      p_service_identity: SERVICE_IDENTITY,
      p_service_identity_token: serviceIdentityToken,
      p_task_id: scope.taskId,
    },
  );
  if (
    result.error ||
    !matchesTrustedRpcResult(
      result.data,
      {
        credential_kind: credentialKind,
        evaluator_record_id: evaluatorRecordId,
        provider_attestation_id: providerAttestationId,
        provider_readback_id: providerReadbackId,
      },
      "configured",
    )
  ) {
    return json(409, { error: "trusted_credential_records_rejected" });
  }
  return json(200, {
    credentialKind,
    result: "configured",
    source: "verified_database_records",
  });
};

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  try {
    const supabaseUrl = readRequiredSecret("SUPABASE_URL");
    const anonKey = readRequiredSecret("SUPABASE_ANON_KEY");
    const serviceRoleKey = readRequiredSecret("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const actorClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const actor = await authenticate(request, adminClient, actorClient);
    if (actor instanceof Response) return actor;
    const payload = await request.json().catch(() => null);
    if (!isRecord(payload) || !safePayload(payload)) {
      return json(400, { error: "cognitive_payload_rejected" });
    }
    const action = toText(payload.action);
    if (action === "status") return await readStatus(actorClient, actor);
    const ownerError = requireOwner(actor);
    if (ownerError) return ownerError;
    const scope = await readCanaryScope(adminClient);
    if (scope instanceof Response) return scope;
    if (action === "set_switch") {
      return await setSwitch(actorClient, scope, payload);
    }
    if (action === "record_public_research_canary") {
      const governanceControlIdentityToken = readRequiredSecret(
        "COGNITIVE_GOVERNANCE_CONTROL_IDENTITY_TOKEN",
      );
      return await recordResearchFromTrustedRecords(
        adminClient,
        scope,
        actor.id,
        governanceControlIdentityToken,
        payload,
      );
    }
    if (action === "record_collective_deliberation_canary") {
      const governanceControlIdentityToken = readRequiredSecret(
        "COGNITIVE_GOVERNANCE_CONTROL_IDENTITY_TOKEN",
      );
      return await recordDeliberationFromTrustedRecords(
        adminClient,
        scope,
        actor.id,
        governanceControlIdentityToken,
        payload,
      );
    }
    if (action === "record_level01_credential_attestation") {
      const governanceControlIdentityToken = readRequiredSecret(
        "COGNITIVE_GOVERNANCE_CONTROL_IDENTITY_TOKEN",
      );
      return await recordCredentialFromTrustedRecords(
        adminClient,
        scope,
        actor.id,
        governanceControlIdentityToken,
        payload,
      );
    }
    return json(400, { error: "unsupported_action" });
  } catch {
    return json(500, { error: "cognitive_governance_control_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
