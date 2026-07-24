import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };
type SupabaseClientLike = ReturnType<typeof createClient<any>>;

const REPOSITORY = "Chillywood2025/chillywood-mobile";
const CONTROL_TASK_KEY = "cognitive-level01-canary-control";
const INVOCATION_HEADER = "x-cognitive-level01-scheduler-invocation";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED_RESEARCH_CANARIES = Object.freeze([
  "dependency_security_research",
  "platform_policy_research",
  "repository_architecture_ux",
]);
const REQUIRED_DRAFT_PR_CANARIES = Object.freeze([
  "documentation_draft_pr",
  "low_risk_source_draft_pr",
  "test_only_draft_pr",
]);
const REQUIRED_SCHEDULES = Object.freeze({
  daily_non_personal_support_observability: {
    cadence: "30 14 * * *",
    maximumCost: 3,
    maximumTasks: 2,
    timeoutSeconds: 300,
  },
  daily_platform_policy_security: {
    cadence: "0 14 * * *",
    maximumCost: 5,
    maximumTasks: 3,
    timeoutSeconds: 300,
  },
  weekly_architecture_dependency: {
    cadence: "30 15 * * 1",
    maximumCost: 5,
    maximumTasks: 3,
    timeoutSeconds: 600,
  },
  weekly_experiment_outcome: {
    cadence: "0 16 * * 1",
    maximumCost: 3,
    maximumTasks: 2,
    timeoutSeconds: 300,
  },
  weekly_ux_route_dead_control: {
    cadence: "0 15 * * 1",
    maximumCost: 5,
    maximumTasks: 3,
    timeoutSeconds: 600,
  },
});
const REQUIRED_SWITCHES = Object.freeze([
  "cognitive_collective_deliberation_enabled",
  "cognitive_draft_pr_executor_enabled",
  "cognitive_installed_journey_sentinel_enabled",
  "cognitive_memory_enabled",
  "cognitive_research_enabled",
  "cognitive_scheduled_level01_enabled",
  "cognitive_user_derived_memory_enabled",
  "cognitive_visual_experience_sentinel_enabled",
  "cognitive_level2_production_repairs_enabled",
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
  !!value && typeof value === "object" && !Array.isArray(value);

const toText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readSecret = (name: string): string => Deno.env.get(name)?.trim() ?? "";

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
  const expectedHash = readSecret(
    "COGNITIVE_LEVEL01_SCHEDULER_INVOKE_SHA256",
  );
  const invocation = request.headers.get(INVOCATION_HEADER)?.trim() ?? "";
  if (!expectedHash || !HASH_PATTERN.test(expectedHash) || !invocation) {
    return false;
  }
  return constantTimeEqual(await sha256Hex(invocation), expectedHash);
};

const hasGatewayAuthorization = (request: Request): boolean =>
  /^Bearer [A-Za-z0-9._~-]{20,}$/i.test(
    request.headers.get("authorization")?.trim() ?? "",
  );

const createServiceClient = (): SupabaseClientLike =>
  createClient(
    readSecret("SUPABASE_URL"),
    readSecret("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

type CanaryEvidence = {
  createdAt: string;
  evaluatorState: string;
  key: string;
  resultStatus: string;
  type: string;
};

type ScheduleDefinition = {
  cadence: string;
  enabled: boolean;
  key: string;
  maximumCost: number;
  maximumTasks: number;
  timeoutSeconds: number;
};

export type ScheduleSnapshot = {
  canaries: CanaryEvidence[];
  emergencyActive: boolean;
  freshTaskFactory: {
    controlTaskReuseAllowed: boolean;
    deadmanBounded: boolean;
    factoryIdentity: string;
    freshTaskPerExecution: boolean;
    ready: boolean;
    retentionBounded: boolean;
    version: string;
  };
  githubCredentialConfigured: boolean;
  schedules: ScheduleDefinition[];
  switches: Record<string, boolean>;
  task: {
    cancelled: boolean;
    controlTask: boolean;
    environment: string;
    platform: string;
    quarantined: boolean;
    repository: string;
  };
};

type ScheduleEvaluation = {
  activationEligible: boolean;
  blockers: string[];
  dispatchEligible: boolean;
  enabled: boolean;
  scheduleKey: string;
};

const unique = (values: string[]): string[] => [...new Set(values)].sort();

const freshPassedCanary = (
  snapshot: ScheduleSnapshot,
  key: string,
  maximumAgeDays: number,
  nowMs: number,
): boolean =>
  snapshot.canaries.some((canary) => {
    const createdMs = Date.parse(canary.createdAt);
    return canary.key === key &&
      canary.resultStatus === "passed" &&
      canary.evaluatorState === "pass" &&
      Number.isFinite(createdMs) &&
      createdMs <= nowMs &&
      createdMs >= nowMs - maximumAgeDays * 86_400_000;
  });

const validDefinition = (
  definition: ScheduleDefinition | undefined,
): boolean => {
  if (!definition) return false;
  const expected =
    REQUIRED_SCHEDULES[definition.key as keyof typeof REQUIRED_SCHEDULES];
  return !!expected &&
    definition.cadence === expected.cadence &&
    definition.maximumTasks === expected.maximumTasks &&
    definition.maximumCost === expected.maximumCost &&
    definition.timeoutSeconds === expected.timeoutSeconds;
};

const baseBlockers = (snapshot: ScheduleSnapshot): string[] => {
  const blockers: string[] = [];
  if (
    snapshot.task.repository !== REPOSITORY ||
    snapshot.task.environment !== "production" ||
    snapshot.task.platform !== "shared" ||
    !snapshot.task.controlTask ||
    snapshot.task.cancelled ||
    snapshot.task.quarantined
  ) {
    blockers.push("CONTROL_TASK_SCOPE_REJECTED");
  }
  if (!snapshot.emergencyActive) blockers.push("EMERGENCY_STOP_ACTIVE");
  const factory = snapshot.freshTaskFactory;
  if (
    !factory.ready ||
    factory.factoryIdentity !== "cognitive_level01_scheduler" ||
    !factory.freshTaskPerExecution ||
    factory.controlTaskReuseAllowed ||
    !factory.deadmanBounded ||
    !factory.retentionBounded ||
    !/^v[1-9][0-9]{0,2}$/.test(factory.version)
  ) {
    blockers.push("FRESH_SCHEDULE_TASK_FACTORY_REQUIRED");
  }
  if (
    snapshot.switches.cognitive_user_derived_memory_enabled !== false ||
    snapshot.switches.cognitive_level2_production_repairs_enabled !== false
  ) {
    blockers.push("PERMANENTLY_DISABLED_SWITCH_VIOLATION");
  }
  if (
    Object.keys(REQUIRED_SCHEDULES).some((scheduleKey) =>
      !validDefinition(
        snapshot.schedules.find((schedule) => schedule.key === scheduleKey),
      )
    ) ||
    snapshot.schedules.length !== Object.keys(REQUIRED_SCHEDULES).length
  ) {
    blockers.push("EXACT_SCHEDULE_DEFINITIONS_REQUIRED");
  }
  return blockers;
};

export const evaluateScheduleSnapshot = (
  snapshot: ScheduleSnapshot,
  now = new Date(),
): ScheduleEvaluation[] => {
  const nowMs = now.getTime();
  const common = baseBlockers(snapshot);
  const researchReady = REQUIRED_RESEARCH_CANARIES.every((key) =>
    freshPassedCanary(snapshot, key, 7, nowMs)
  );
  const draftPrReady = REQUIRED_DRAFT_PR_CANARIES.every((key) =>
    freshPassedCanary(snapshot, key, 30, nowMs)
  );
  return Object.keys(REQUIRED_SCHEDULES).sort().map((scheduleKey) => {
    const definition = snapshot.schedules.find((entry) =>
      entry.key === scheduleKey
    );
    const blockers = [...common];
    if (
      !snapshot.switches.cognitive_research_enabled ||
      !snapshot.switches.cognitive_memory_enabled
    ) {
      blockers.push("PUBLIC_RESEARCH_MEMORY_REQUIRED");
    }
    if (
      scheduleKey === "daily_platform_policy_security" &&
      !researchReady
    ) {
      blockers.push("FRESH_RESEARCH_CANARIES_REQUIRED");
    }
    if (
      scheduleKey === "weekly_architecture_dependency" &&
      (
        !freshPassedCanary(
          snapshot,
          "dependency_security_research",
          7,
          nowMs,
        ) ||
        !freshPassedCanary(
          snapshot,
          "repository_architecture_ux",
          7,
          nowMs,
        )
      )
    ) {
      blockers.push("FRESH_ARCHITECTURE_DEPENDENCY_EVIDENCE_REQUIRED");
    }
    if (
      scheduleKey === "weekly_ux_route_dead_control" &&
      (
        !snapshot.switches.cognitive_installed_journey_sentinel_enabled ||
        !snapshot.switches.cognitive_visual_experience_sentinel_enabled
      )
    ) {
      blockers.push("INSTALLED_VISUAL_SENTINELS_REQUIRED");
    }
    if (
      scheduleKey === "weekly_experiment_outcome" &&
      (
        !snapshot.switches.cognitive_collective_deliberation_enabled ||
        !snapshot.switches.cognitive_draft_pr_executor_enabled ||
        !snapshot.githubCredentialConfigured ||
        !draftPrReady
      )
    ) {
      blockers.push("GOVERNED_DRAFT_PR_CANARIES_REQUIRED");
    }
    const finalBlockers = unique(blockers);
    const activationEligible = finalBlockers.length === 0;
    return {
      activationEligible,
      blockers: finalBlockers,
      dispatchEligible: activationEligible &&
        definition?.enabled === true &&
        snapshot.switches.cognitive_scheduled_level01_enabled === true,
      enabled: definition?.enabled === true,
      scheduleKey,
    };
  });
};

const taskFactoryStatus = async (
  client: SupabaseClientLike,
  taskId: string,
  projectId: string,
): Promise<ScheduleSnapshot["freshTaskFactory"]> => {
  const unavailable = {
    controlTaskReuseAllowed: false,
    deadmanBounded: false,
    factoryIdentity: "unavailable",
    freshTaskPerExecution: false,
    ready: false,
    retentionBounded: false,
    version: "unavailable",
  };
  const result = await client.rpc(
    "cognitive_level01_scheduler_task_factory_status",
    {
      p_environment: "production",
      p_platform: "shared",
      p_project_id: projectId,
      p_task_id: taskId,
    },
  );
  if (result.error || !isRecord(result.data)) return unavailable;
  return {
    controlTaskReuseAllowed: result.data.control_task_reuse_allowed === true,
    deadmanBounded: result.data.deadman_bounded === true,
    factoryIdentity: toText(result.data.factory_identity),
    freshTaskPerExecution: result.data.fresh_task_per_execution === true,
    ready: result.data.ready === true,
    retentionBounded: result.data.retention_bounded === true,
    version: toText(result.data.version),
  };
};

const readSnapshot = async (
  client: SupabaseClientLike,
  taskId: string,
  projectId: string,
): Promise<ScheduleSnapshot> => {
  const [
    taskResult,
    switchResult,
    canaryResult,
    scheduleResult,
    credentialResult,
    emergencyResult,
    factory,
  ] = await Promise.all([
    client.from("intelligence_tasks").select(
      "task_key,repository_full_name,platform,environment,cancelled_at,quarantined_at",
    ).eq("id", taskId).eq("project_id", projectId).maybeSingle(),
    client.from("cognitive_governance_switches").select("switch_key,enabled")
      .eq("task_id", taskId).eq("project_id", projectId),
    client.from("cognitive_level01_canary_runs").select(
      "canary_key,canary_type,result_status,evaluator_state,created_at",
    ).eq("task_id", taskId).eq("project_id", projectId),
    client.from("cognitive_level01_schedule_definitions").select(
      "schedule_key,cadence,enabled,maximum_tasks,maximum_cost,timeout_seconds",
    ).eq("task_id", taskId).eq("project_id", projectId),
    client.from("cognitive_level01_credential_attestations").select(
      "state,verified_at,expires_at",
    ).eq("task_id", taskId).eq("project_id", projectId).eq(
      "credential_kind",
      "github_draft_pr",
    ).order("verified_at", { ascending: false }).limit(1),
    client.from("autonomous_system_emergency_states").select("status").eq(
      "system_id",
      "product_intelligence_operator",
    ).maybeSingle(),
    taskFactoryStatus(client, taskId, projectId),
  ]);
  if (
    taskResult.error ||
    switchResult.error ||
    canaryResult.error ||
    scheduleResult.error ||
    credentialResult.error ||
    emergencyResult.error ||
    !isRecord(taskResult.data)
  ) {
    throw new Error("schedule_prerequisite_readback_rejected");
  }
  const switches: Record<string, boolean> = {};
  for (const key of REQUIRED_SWITCHES) switches[key] = false;
  for (const row of switchResult.data ?? []) {
    if (isRecord(row) && typeof row.switch_key === "string") {
      switches[row.switch_key] = row.enabled === true;
    }
  }
  const canaries: CanaryEvidence[] = (canaryResult.data ?? []).flatMap((row) =>
    isRecord(row)
      ? [{
        createdAt: toText(row.created_at),
        evaluatorState: toText(row.evaluator_state),
        key: toText(row.canary_key),
        resultStatus: toText(row.result_status),
        type: toText(row.canary_type),
      }]
      : []
  );
  const schedules: ScheduleDefinition[] = (scheduleResult.data ?? []).flatMap(
    (row) =>
      isRecord(row)
        ? [{
          cadence: toText(row.cadence),
          enabled: row.enabled === true,
          key: toText(row.schedule_key),
          maximumCost: Number(row.maximum_cost),
          maximumTasks: Number(row.maximum_tasks),
          timeoutSeconds: Number(row.timeout_seconds),
        }]
        : [],
  );
  const latestCredential = Array.isArray(credentialResult.data)
    ? credentialResult.data[0]
    : null;
  const credentialExpires = isRecord(latestCredential)
    ? Date.parse(toText(latestCredential.expires_at))
    : Number.NaN;
  const credentialVerified = isRecord(latestCredential)
    ? Date.parse(toText(latestCredential.verified_at))
    : Number.NaN;
  return {
    canaries,
    emergencyActive: emergencyResult.data?.status === "active",
    freshTaskFactory: factory,
    githubCredentialConfigured: isRecord(latestCredential) &&
      latestCredential.state === "configured" &&
      Number.isFinite(credentialVerified) &&
      Number.isFinite(credentialExpires) &&
      credentialVerified <= Date.now() &&
      Date.now() < credentialExpires,
    schedules,
    switches,
    task: {
      cancelled: taskResult.data.cancelled_at !== null,
      controlTask: taskResult.data.task_key === CONTROL_TASK_KEY,
      environment: toText(taskResult.data.environment),
      platform: toText(taskResult.data.platform),
      quarantined: taskResult.data.quarantined_at !== null,
      repository: toText(taskResult.data.repository_full_name),
    },
  };
};

const sanitizedSummary = async (
  evaluation: ScheduleEvaluation[],
): Promise<JsonObject> => {
  const blockerSet = unique(evaluation.flatMap((entry) => entry.blockers));
  const blockerDigest = await sha256Hex(JSON.stringify(blockerSet));
  return {
    activationEligibleCount:
      evaluation.filter((entry) => entry.activationEligible).length,
    blockerDigest,
    blockers: blockerSet,
    dispatchDecision: evaluation.some((entry) => entry.dispatchEligible)
      ? "bounded_dispatch_permitted"
      : "no_work",
    dispatchEligibleCount: evaluation.filter((entry) => entry.dispatchEligible)
      .length,
    notificationPolicy: "notify_on_blocker_digest_change_only",
    ownerDigestRequired: evaluation.some((entry) => entry.dispatchEligible),
    schedules: evaluation.map((entry) => ({
      activationEligible: entry.activationEligible,
      blockers: entry.blockers,
      dispatchEligible: entry.dispatchEligible,
      enabled: entry.enabled,
      scheduleKey: entry.scheduleKey,
    })),
  };
};

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (
    !hasGatewayAuthorization(request) || !await authenticateInvocation(request)
  ) {
    return json(401, { error: "level01_scheduler_invocation_required" });
  }
  const payload = await request.json().catch(() => null);
  if (
    !isRecord(payload) ||
    Object.keys(payload).sort().join(",") !== "action,projectId,taskId" ||
    toText(payload.action) !== "evaluate_prerequisites" ||
    !UUID_PATTERN.test(toText(payload.taskId)) ||
    !UUID_PATTERN.test(toText(payload.projectId))
  ) {
    return json(400, { error: "schedule_scope_rejected" });
  }
  try {
    const snapshot = await readSnapshot(
      createServiceClient(),
      toText(payload.taskId),
      toText(payload.projectId),
    );
    return json(
      200,
      await sanitizedSummary(evaluateScheduleSnapshot(snapshot)),
    );
  } catch {
    return json(503, {
      blockers: ["SCHEDULE_PREREQUISITE_READBACK_REQUIRED"],
      dispatchDecision: "no_work",
      error: "level01_scheduler_prerequisite_readback_failed",
      notificationPolicy: "notify_on_blocker_digest_change_only",
    });
  }
};

if (import.meta.main) Deno.serve(handler);
