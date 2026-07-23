import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  classifyCanonicalSecurityPayload,
  validateCanonicalResearchUrl,
  type CanonicalNetworkPolicy,
  type CanonicalSecurityPolicy,
} from "../../../_lib/cognitivePolicyEngine.ts";
import networkPolicyJson from "../../../config/intelligence/cognitive-network-policy.json" with {
  type: "json",
};
import securityPolicyJson from "../../../config/intelligence/cognitive-security-classification-policy.json" with {
  type: "json",
};

const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});

const REPOSITORY = "Chillywood2025/chillywood-mobile";
const PLATFORM = "shared";
const ENVIRONMENT = "production";
const POLICY_VERSION = "collective-governance-v1";
const SECURITY_POLICY = securityPolicyJson as CanonicalSecurityPolicy;
const NETWORK_POLICY = networkPolicyJson as CanonicalNetworkPolicy;
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
const COUNCIL_ROLES = Object.freeze([
  "product_user_experience",
  "architecture_engineering",
  "security_privacy",
  "reliability_release",
  "safety_trust",
  "accessibility_inclusion",
  "money_commercial_policy",
  "research_futures",
  "adversarial_red_team",
]);
const STAKEHOLDERS = Object.freeze([
  "normal_users",
  "creators",
  "subscribers_buyers",
  "minors_safety_sensitive",
  "accessibility_users",
  "moderators_admins",
  "owner_operations",
  "android",
  "ios",
  "web",
  "privacy",
  "security",
  "support",
  "infrastructure_cost",
  "provider_cost",
  "legal_compliance",
]);

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

const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((entry) => entry.toString(16).padStart(2, "0"))
    .join("");
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

const safePayload = (value: unknown): boolean =>
  classifyCanonicalSecurityPayload(value, SECURITY_POLICY) === "safe";

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
  actor.role === "owner"
    ? null
    : json(403, { error: "exact_owner_required" });

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
  const [switches, schedules, canaries, approvals, decisions, emergency] = await Promise.all([
    actorClient
      .from("cognitive_governance_switches")
      .select("switch_key,enabled,policy_version,updated_at")
      .eq("task_id", task.data.id)
      .order("switch_key"),
    actorClient
      .from("cognitive_level01_schedule_definitions")
      .select("schedule_key,enabled,maximum_tasks,maximum_cost,timeout_seconds")
      .eq("task_id", task.data.id)
      .order("schedule_key"),
    actorClient
      .from("cognitive_level01_canary_runs")
      .select("canary_key,canary_type,result_status,evaluator_state,created_at")
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
    (switches.data ?? []).map((entry) => [String(entry.switch_key), entry.enabled === true]),
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
  if (result.error) return json(409, { error: "level01_switch_change_rejected" });
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

const recordResearch = async (
  adminClient: SupabaseClientLike,
  scope: { projectId: string; taskId: string },
  payload: Record<string, unknown>,
): Promise<Response> => {
  const canaryKey = toText(payload.canaryKey);
  const sourceCommit = toText(payload.sourceCommit);
  const category = toText(payload.category);
  const claim = toText(payload.claim);
  const contradictionState = toText(payload.contradictionState) || "none";
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  if (
    !RESEARCH_KEYS.includes(canaryKey) ||
    !/^[a-f0-9]{40}$/u.test(sourceCommit) ||
    !["technical", "platform_policy", "consequential_news", "product", "security"].includes(
      category,
    ) ||
    !["none", "detected", "unresolved", "resolved"].includes(contradictionState) ||
    sources.length < 1 ||
    sources.length > 8 ||
    !safePayload({ canaryKey, category, claim, contradictionState })
  ) {
    return json(400, { error: "research_canary_payload_rejected" });
  }
  const sourceIds: string[] = [];
  for (const rawSource of sources) {
    if (!isRecord(rawSource)) {
      return json(400, { error: "research_source_payload_rejected" });
    }
    const reference = toText(rawSource.reference);
    const urlBlockers = validateCanonicalResearchUrl(reference, NETWORK_POLICY);
    if (urlBlockers.length > 0 || !safePayload(rawSource)) {
      return json(400, { error: "research_source_payload_rejected" });
    }
    const sourceResult = await adminClient.rpc("cognitive_record_research_source", {
      p_actor_identity: "research_source_broker",
      p_authority_id: toText(rawSource.authorityId),
      p_bounded_excerpt: toText(rawSource.boundedExcerpt),
      p_citation_locator: toText(rawSource.citationLocator),
      p_citation_title: toText(rawSource.citationTitle),
      p_environment: ENVIRONMENT,
      p_freshness_deadline: toText(rawSource.freshnessDeadline),
      p_is_primary: rawSource.isPrimary === true,
      p_platform: PLATFORM,
      p_project_id: scope.projectId,
      p_publication_date: toText(rawSource.publicationDate) || null,
      p_publisher: toText(rawSource.publisher),
      p_reference: reference,
      p_resolved_address_hashes: Array.isArray(rawSource.transportReceiptHashes)
        ? rawSource.transportReceiptHashes.map(toText)
        : [],
      p_retrieval_date: toText(rawSource.retrievalDate),
      p_source_type: toText(rawSource.sourceType),
      p_task_id: scope.taskId,
    });
    if (sourceResult.error || !sourceResult.data) {
      return json(409, { error: "research_source_ingestion_rejected" });
    }
    sourceIds.push(String(sourceResult.data));
  }
  const freshnessDeadline = toText(payload.freshnessDeadline);
  const claimResult = await adminClient.rpc("cognitive_record_public_research_claim", {
    p_actor_identity: "research_source_broker",
    p_bounded_claim: claim,
    p_canary_key: canaryKey,
    p_category: category,
    p_confidence: typeof payload.confidence === "number" ? payload.confidence : 0,
    p_contradiction_state: contradictionState,
    p_environment: ENVIRONMENT,
    p_freshness_deadline: freshnessDeadline,
    p_platform: PLATFORM,
    p_project_id: scope.projectId,
    p_source_commit: sourceCommit,
    p_source_ids: sourceIds,
    p_task_id: scope.taskId,
  });
  if (claimResult.error || !claimResult.data) {
    return json(409, { error: "research_claim_ingestion_rejected" });
  }
  return json(200, {
    canaryKey,
    claimId: String(claimResult.data),
    result: contradictionState === "unresolved" ? "blocked" : "passed",
  });
};

const recordDeliberation = async (
  adminClient: SupabaseClientLike,
  scope: { projectId: string; taskId: string },
  payload: Record<string, unknown>,
): Promise<Response> => {
  const canaryKey = toText(payload.canaryKey);
  const sourceCommit = toText(payload.sourceCommit);
  const topic = toText(payload.topic);
  if (
    !DELIBERATION_KEYS.includes(canaryKey) ||
    !/^[a-f0-9]{40}$/u.test(sourceCommit) ||
    topic.length < 8 ||
    topic.length > 500 ||
    !safePayload({ canaryKey, topic })
  ) {
    return json(400, { error: "deliberation_canary_payload_rejected" });
  }
  const evidencePacketHash = await sha256(`${sourceCommit}:${canaryKey}:${topic}`);
  const blindAssessments = await Promise.all(
    COUNCIL_ROLES.map(async (role) => ({
      assessmentHash: await sha256(`${evidencePacketHash}:${role}`),
      blindRound: 1,
      confidence: role === "adversarial_red_team" ? 0.72 : 0.78,
      role,
    })),
  );
  const alternatives = [
    { option: "no_action", risk: "none" },
    { option: "minimal_repair", risk: "low" },
    { option: "moderate_improvement", risk: "medium" },
  ];
  const criticisms = [
    { role: "security_privacy", status: "reviewed" },
    { role: "reliability_release", status: "reviewed" },
    { role: "product_user_experience", status: "reviewed" },
    { role: "adversarial_red_team", status: "reviewed" },
  ];
  const votes = blindAssessments.map(({ role }) => ({
    position: role === "money_commercial_policy" ? "abstain" : "support",
    role,
  }));
  const manifestWithoutHash = {
    alternatives,
    blindAssessments,
    criticisms,
    dissent: [
      {
        condition: "reconsider_if_scope_changes",
        role: "adversarial_red_team",
        state: "accepted_residual_risk",
      },
    ],
    evidencePacketHash,
    mandatoryVetoes: [],
    selectedOption: "minimal_repair",
    stakeholderImpacts: STAKEHOLDERS,
    topicHash: await sha256(topic),
    votes,
  };
  const decisionHash = await sha256(JSON.stringify(canonicalize(manifestWithoutHash)));
  const decisionManifest = { ...manifestWithoutHash, decisionHash };
  const result = await adminClient.rpc("cognitive_record_level01_deliberation_canary", {
    p_actor_identity: "deliberation_orchestrator",
    p_canary_key: canaryKey,
    p_decision_manifest: decisionManifest,
    p_environment: ENVIRONMENT,
    p_platform: PLATFORM,
    p_project_id: scope.projectId,
    p_source_commit: sourceCommit,
    p_task_id: scope.taskId,
  });
  if (result.error || !result.data) {
    return json(409, { error: "deliberation_canary_rejected" });
  }
  return json(200, {
    canaryKey,
    decisionHash,
    result: "passed",
    runId: String(result.data),
  });
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
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
    if (action === "set_switch") return await setSwitch(actorClient, scope, payload);
    if (action === "record_public_research_canary") {
      return await recordResearch(adminClient, scope, payload);
    }
    if (action === "record_collective_deliberation_canary") {
      return await recordDeliberation(adminClient, scope, payload);
    }
    return json(400, { error: "unsupported_action" });
  } catch {
    return json(500, { error: "cognitive_governance_control_failed" });
  }
});
