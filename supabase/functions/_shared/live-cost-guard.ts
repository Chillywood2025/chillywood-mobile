import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

export type LiveCostGuardMode = "observe_only" | "manual_approval" | "auto_protect";
export type LiveCostGuardSeverity = "normal" | "warning" | "high" | "critical" | "emergency";
export type LiveCostGuardActionType =
  | "shorten_token_ttl"
  | "restrict_publish"
  | "remove_participant"
  | "pause_new_live_rooms"
  | "turn_bandwidth_cap_requested"
  | "restore_normal_mode";

export type LiveCostGuardSettings = {
  cooldownSeconds: number;
  criticalThresholdMbps: number | null;
  emergencyThresholdMbps: number | null;
  enabled: boolean;
  maxEstimatedUsdPerHour: number | null;
  mode: LiveCostGuardMode;
  tokenTtlCriticalSeconds: number;
  tokenTtlWarningSeconds: number;
  warningThresholdMbps: number | null;
};

export type LiveCostGuardActionRequest = {
  actionType: LiveCostGuardActionType;
  roomName?: string | null;
  participantIdentity?: string | null;
  reason: string;
};

export type LiveCostGuardTokenDecision = {
  blockNewLiveRooms: boolean;
  reason: string | null;
  tokenTtlSeconds: number | null;
};

const DEFAULT_SETTINGS: LiveCostGuardSettings = {
  cooldownSeconds: 300,
  criticalThresholdMbps: null,
  emergencyThresholdMbps: null,
  enabled: false,
  maxEstimatedUsdPerHour: null,
  mode: "observe_only",
  tokenTtlCriticalSeconds: 60,
  tokenTtlWarningSeconds: 300,
  warningThresholdMbps: null,
};

export const LIVE_COST_GUARD_JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-chillywood-live-cost-guard-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

export const liveCostGuardJson = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), { headers: LIVE_COST_GUARD_JSON_HEADERS, status });

export const liveCostGuardOptions = () => new Response("ok", { headers: LIVE_COST_GUARD_JSON_HEADERS, status: 200 });

export const toLiveCostGuardText = (value: unknown) => String(value ?? "").trim();

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
};

export const sanitizeLiveCostGuardError = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown Live Cost Guard error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9._~+/=-]+/g, "[redacted-token]")
    .replace(/sk_(test|live)_[A-Za-z0-9_]+/gi, "sk_[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{48,}/g, "[redacted]")
    .slice(0, 280);
};

export const readLiveCostGuardRequiredEnv = (key: string) => {
  const value = toLiveCostGuardText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const readLiveCostGuardOptionalEnv = (key: string) => toLiveCostGuardText(Deno.env.get(key)) || null;

export const createLiveCostGuardAdminClient = () => {
  const supabaseUrl = readLiveCostGuardRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = readLiveCostGuardRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
};

export async function authenticateLiveCostGuardAdmin(req: Request) {
  const supabaseUrl = readLiveCostGuardRequiredEnv("SUPABASE_URL");
  const anonKey = readLiveCostGuardRequiredEnv("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: liveCostGuardJson(401, { error: "missing_authorization" }) };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await authClient.auth.getUser();
  const userId = toLiveCostGuardText(data.user?.id);
  if (error || !userId) {
    return { error: liveCostGuardJson(401, { error: "unauthenticated" }) };
  }

  const adminClient = createLiveCostGuardAdminClient();
  const hasOperatorRole = await userHasLiveCostGuardRole(adminClient, {
    email: data.user?.email ?? null,
    id: userId,
  });
  if (!hasOperatorRole) {
    return { error: liveCostGuardJson(403, { error: "live_ops_permission_required" }) };
  }

  return { adminClient, userId };
}

export async function userHasLiveCostGuardRole(
  adminClient: SupabaseClientLike,
  user: { email: string | null; id: string },
) {
  const normalizedEmail = toLiveCostGuardText(user.email).toLowerCase();
  const { data, error } = await adminClient
    .from("platform_role_memberships")
    .select("role")
    .eq("status", "active")
    .in("role", ["owner", "operator"])
    .or(normalizedEmail ? `user_id.eq.${user.id},email.ilike.${normalizedEmail}` : `user_id.eq.${user.id}`)
    .limit(1);

  if (error || !Array.isArray(data) || data.length === 0) return false;
  if (data.some((row: any) => row.role === "owner")) return true;
  if (!data.some((row: any) => row.role === "operator")) return false;

  let permissionQuery = adminClient
    .from("platform_staff_permission_grants")
    .select("id,expires_at")
    .eq("status", "active")
    .eq("permission_key", "live_ops");
  if (normalizedEmail) {
    permissionQuery = permissionQuery.or(`target_user_id.eq.${user.id},target_email.ilike.${normalizedEmail}`);
  } else {
    permissionQuery = permissionQuery.eq("target_user_id", user.id);
  }

  const permissionResult = await permissionQuery.limit(10);
  if (permissionResult.error) return false;
  const now = Date.now();
  return ((permissionResult.data ?? []) as JsonObject[]).some((row) => {
    const expiresAt = toLiveCostGuardText(row.expires_at);
    return !expiresAt || Date.parse(expiresAt) > now;
  });
}

const normalizeMode = (value: unknown): LiveCostGuardMode => {
  const normalized = toLiveCostGuardText(value).toLowerCase();
  if (normalized === "manual_approval" || normalized === "auto_protect") return normalized;
  return "observe_only";
};

export const normalizeLiveCostGuardSeverity = (value: unknown): LiveCostGuardSeverity => {
  const normalized = toLiveCostGuardText(value).toLowerCase();
  if (normalized === "warning" || normalized === "high" || normalized === "critical" || normalized === "emergency") {
    return normalized;
  }
  return "normal";
};

export const normalizeLiveCostGuardActionType = (value: unknown): LiveCostGuardActionType | null => {
  const normalized = toLiveCostGuardText(value).toLowerCase();
  if (
    normalized === "shorten_token_ttl"
    || normalized === "restrict_publish"
    || normalized === "remove_participant"
    || normalized === "pause_new_live_rooms"
    || normalized === "turn_bandwidth_cap_requested"
    || normalized === "restore_normal_mode"
  ) return normalized;
  return null;
};

const parseSettings = (row: any): LiveCostGuardSettings => ({
  cooldownSeconds: Math.max(0, toPositiveInteger(row?.cooldown_seconds, DEFAULT_SETTINGS.cooldownSeconds)),
  criticalThresholdMbps: toNumberOrNull(row?.critical_threshold_mbps),
  emergencyThresholdMbps: toNumberOrNull(row?.emergency_threshold_mbps),
  enabled: row?.enabled === true,
  maxEstimatedUsdPerHour: toNumberOrNull(row?.max_estimated_usd_per_hour),
  mode: normalizeMode(row?.mode),
  tokenTtlCriticalSeconds: toPositiveInteger(row?.token_ttl_critical_seconds, DEFAULT_SETTINGS.tokenTtlCriticalSeconds),
  tokenTtlWarningSeconds: toPositiveInteger(row?.token_ttl_warning_seconds, DEFAULT_SETTINGS.tokenTtlWarningSeconds),
  warningThresholdMbps: toNumberOrNull(row?.warning_threshold_mbps),
});

export async function readLiveCostGuardSettings(adminClient: SupabaseClientLike): Promise<LiveCostGuardSettings> {
  const { data, error } = await adminClient
    .from("admin_live_cost_guard_settings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return DEFAULT_SETTINGS;
  return parseSettings(data);
}

export const classifyLiveCostGuardSeverity = (
  snapshot: { estimatedTurnMbps?: number | null; estimatedUsdPerHour?: number | null },
  settings: LiveCostGuardSettings,
): LiveCostGuardSeverity => {
  const mbps = toNumberOrNull(snapshot.estimatedTurnMbps);
  const usdPerHour = toNumberOrNull(snapshot.estimatedUsdPerHour);
  if (
    (settings.maxEstimatedUsdPerHour !== null && usdPerHour !== null && usdPerHour >= settings.maxEstimatedUsdPerHour)
    || (settings.emergencyThresholdMbps !== null && mbps !== null && mbps >= settings.emergencyThresholdMbps)
  ) return "emergency";
  if (settings.criticalThresholdMbps !== null && mbps !== null && mbps >= settings.criticalThresholdMbps) return "critical";
  if (
    settings.warningThresholdMbps !== null
    && settings.criticalThresholdMbps !== null
    && mbps !== null
    && mbps >= ((settings.warningThresholdMbps + settings.criticalThresholdMbps) / 2)
  ) return "high";
  if (settings.warningThresholdMbps !== null && mbps !== null && mbps >= settings.warningThresholdMbps) return "warning";
  return "normal";
};

export const recommendedLiveCostGuardAction = (severity: LiveCostGuardSeverity): LiveCostGuardActionType | null => {
  if (severity === "warning") return "shorten_token_ttl";
  if (severity === "high") return "restrict_publish";
  if (severity === "critical") return "remove_participant";
  if (severity === "emergency") return "pause_new_live_rooms";
  return null;
};

const redactMetadata = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .filter(([key, entry]) => {
        const normalized = key.toLowerCase();
        if (
          normalized.includes("secret")
          || normalized.includes("token")
          || normalized.includes("password")
          || normalized.includes("credential")
          || normalized.includes("key")
          || normalized.includes("url")
        ) return false;
        return typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null;
      })
      .slice(0, 32),
  );
};

export async function recordLiveCostGuardEvent(
  adminClient: SupabaseClientLike,
  input: {
    actionStatus?: string;
    actionTaken?: string | null;
    adminActorId?: string | null;
    estimatedUsdPerHour?: number | null;
    metricSnapshot?: JsonObject;
    participantIdentity?: string | null;
    recommendedAction?: string | null;
    roomName?: string | null;
    securityContextId?: string | null;
    securityContextMetadata?: JsonObject;
    severity: LiveCostGuardSeverity;
    source: "prometheus" | "alertmanager" | "manual" | "system";
  },
) {
  const { data, error } = await adminClient
    .from("admin_live_cost_guard_events")
    .insert({
      action_status: input.actionStatus ?? "logged",
      action_taken: input.actionTaken ?? null,
      admin_actor_id: input.adminActorId ?? null,
      estimated_usd_per_hour: input.estimatedUsdPerHour ?? null,
      metric_snapshot_json: redactMetadata({
        ...(input.metricSnapshot ?? {}),
        ...(input.securityContextMetadata ?? {}),
      }),
      participant_identity: input.participantIdentity ?? null,
      recommended_action: input.recommendedAction ?? null,
      room_name: input.roomName ?? null,
      security_context_id: input.securityContextId ?? null,
      severity: input.severity,
      source: input.source,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function recordLiveCostGuardAction(
  adminClient: SupabaseClientLike,
  input: {
    actionType: LiveCostGuardActionType;
    actorId?: string | null;
    actorType: "system" | "admin";
    after?: JsonObject;
    before?: JsonObject;
    errorMessage?: string | null;
    participantIdentity?: string | null;
    reason: string;
    roomName?: string | null;
    securityContextId?: string | null;
    securityContextMetadata?: JsonObject;
    success: boolean;
  },
) {
  const { data, error } = await adminClient
    .from("admin_live_cost_guard_actions")
    .insert({
      action_type: input.actionType,
      actor_id: input.actorId ?? null,
      actor_type: input.actorType,
      after_json: redactMetadata({
        ...(input.after ?? {}),
        ...(input.securityContextMetadata ?? {}),
      }),
      before_json: redactMetadata(input.before ?? {}),
      error_message: input.errorMessage ?? null,
      participant_identity: input.participantIdentity ?? null,
      reason: input.reason,
      room_name: input.roomName ?? null,
      security_context_id: input.securityContextId ?? null,
      success: input.success,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

const createRoomService = () => {
  const livekitUrl = readLiveCostGuardOptionalEnv("LIVEKIT_URL");
  const apiKey = readLiveCostGuardOptionalEnv("LIVEKIT_API_KEY");
  const apiSecret = readLiveCostGuardOptionalEnv("LIVEKIT_API_SECRET");
  if (!livekitUrl || !apiKey || !apiSecret) return null;
  return new RoomServiceClient(livekitUrl, apiKey, apiSecret);
};

export async function applyLiveCostGuardAction(
  adminClient: SupabaseClientLike,
  settings: LiveCostGuardSettings,
  input: LiveCostGuardActionRequest,
  actor: {
    actorId?: string | null;
    actorType: "system" | "admin";
    securityContextId?: string | null;
    securityContextMetadata?: JsonObject;
  },
) {
  if (!settings.enabled) {
    return recordLiveCostGuardAction(adminClient, {
      ...input,
      ...actor,
      after: { mode: settings.mode, enabled: false },
      before: {},
      errorMessage: "Live Cost Guard is disabled.",
      success: false,
    });
  }

  if (settings.mode === "observe_only") {
    return recordLiveCostGuardAction(adminClient, {
      ...input,
      ...actor,
      after: { mode: settings.mode, wouldHaveRun: input.actionType },
      before: {},
      errorMessage: "Observe-only mode logs the request without running it.",
      success: false,
    });
  }

  if (input.actionType === "turn_bandwidth_cap_requested") {
    return recordLiveCostGuardAction(adminClient, {
      ...input,
      ...actor,
      after: {
        runbook: "Operator must apply a TURN cap manually from docs/admin/LIVE_COST_GUARD.md.",
      },
      before: {},
      success: true,
    });
  }

  if (input.actionType === "shorten_token_ttl" || input.actionType === "pause_new_live_rooms" || input.actionType === "restore_normal_mode") {
    return recordLiveCostGuardAction(adminClient, {
      ...input,
      ...actor,
      after: {
        cooldownSeconds: settings.cooldownSeconds,
        mode: settings.mode,
        tokenTtlCriticalSeconds: settings.tokenTtlCriticalSeconds,
        tokenTtlWarningSeconds: settings.tokenTtlWarningSeconds,
      },
      before: {},
      success: true,
    });
  }

  if (!input.roomName) {
    return recordLiveCostGuardAction(adminClient, {
      ...input,
      ...actor,
      after: {},
      before: {},
      errorMessage: "Room name is required for this action.",
      success: false,
    });
  }

  if ((input.actionType === "restrict_publish" || input.actionType === "remove_participant") && !input.participantIdentity) {
    return recordLiveCostGuardAction(adminClient, {
      ...input,
      ...actor,
      after: {},
      before: {},
      errorMessage: "Participant identity is required for this action.",
      success: false,
    });
  }

  const roomService = createRoomService();
  if (!roomService) {
    return recordLiveCostGuardAction(adminClient, {
      ...input,
      ...actor,
      after: {},
      before: {},
      errorMessage: "LiveKit server API credentials are not configured for remediation.",
      success: false,
    });
  }

  try {
    if (input.actionType === "restrict_publish") {
      await roomService.updateParticipant(input.roomName, input.participantIdentity ?? "", undefined, {
        canPublish: false,
        canPublishData: true,
        canSubscribe: true,
      });
    } else if (input.actionType === "remove_participant") {
      await roomService.removeParticipant(input.roomName, input.participantIdentity ?? "");
    }

    return recordLiveCostGuardAction(adminClient, {
      ...input,
      ...actor,
      after: { livekitApiCalled: true },
      before: { livekitApiCalled: false },
      success: true,
    });
  } catch (error) {
    return recordLiveCostGuardAction(adminClient, {
      ...input,
      ...actor,
      after: { livekitApiCalled: true },
      before: { livekitApiCalled: false },
      errorMessage: sanitizeLiveCostGuardError(error),
      success: false,
    });
  }
}

const severityRank: Record<LiveCostGuardSeverity, number> = {
  normal: 0,
  warning: 1,
  high: 2,
  critical: 3,
  emergency: 4,
};

const isoBeforeSeconds = (seconds: number) => new Date(Date.now() - Math.max(0, seconds) * 1000).toISOString();

export async function readLiveCostGuardTokenDecision(
  adminClient: SupabaseClientLike,
  surface: string,
): Promise<LiveCostGuardTokenDecision> {
  if (surface !== "live-stage" && surface !== "watch-party-live") {
    return { blockNewLiveRooms: false, reason: null, tokenTtlSeconds: null };
  }

  const settings = await readLiveCostGuardSettings(adminClient);
  if (!settings.enabled || settings.mode === "observe_only") {
    return { blockNewLiveRooms: false, reason: null, tokenTtlSeconds: null };
  }

  const cooldownStart = isoBeforeSeconds(settings.cooldownSeconds);
  const [{ data: events }, { data: actions }] = await Promise.all([
    adminClient
      .from("admin_live_cost_guard_events")
      .select("severity,created_at")
      .gte("created_at", cooldownStart)
      .order("created_at", { ascending: false })
      .limit(20),
    adminClient
      .from("admin_live_cost_guard_actions")
      .select("action_type,created_at,success")
      .gte("created_at", cooldownStart)
      .eq("success", true)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const successfulActions = Array.isArray(actions) ? actions : [];
  const latestRestore = successfulActions.find((action) => action.action_type === "restore_normal_mode");
  const afterLatestRestore = (createdAt: unknown) => {
    if (!latestRestore?.created_at) return true;
    return Date.parse(toLiveCostGuardText(createdAt)) > Date.parse(toLiveCostGuardText(latestRestore.created_at));
  };

  const activePause = successfulActions.some((action) => (
    action.action_type === "pause_new_live_rooms" && afterLatestRestore(action.created_at)
  ));
  if (activePause) {
    return {
      blockNewLiveRooms: true,
      reason: "Live Cost Guard is temporarily pausing new Live Watch-Party and Watch-Party Live tokens.",
      tokenTtlSeconds: null,
    };
  }

  const activeTtlAction = successfulActions.some((action) => (
    action.action_type === "shorten_token_ttl" && afterLatestRestore(action.created_at)
  ));
  const strongestSeverity = (Array.isArray(events) ? events : [])
    .filter((event) => afterLatestRestore(event.created_at))
    .map((event) => normalizeLiveCostGuardSeverity(event.severity))
    .sort((left, right) => severityRank[right] - severityRank[left])[0] ?? "normal";

  if (strongestSeverity === "critical" || strongestSeverity === "emergency") {
    return { blockNewLiveRooms: false, reason: "critical_live_cost_guard_ttl", tokenTtlSeconds: settings.tokenTtlCriticalSeconds };
  }

  if (activeTtlAction || strongestSeverity === "warning" || strongestSeverity === "high") {
    return { blockNewLiveRooms: false, reason: "warning_live_cost_guard_ttl", tokenTtlSeconds: settings.tokenTtlWarningSeconds };
  }

  return { blockNewLiveRooms: false, reason: null, tokenTtlSeconds: null };
}
