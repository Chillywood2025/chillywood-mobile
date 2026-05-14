import { supabase } from "./supabase";

export const LIVE_COST_GUARD_MODES = ["observe_only", "manual_approval", "auto_protect"] as const;
export const LIVE_COST_GUARD_SEVERITIES = ["normal", "warning", "high", "critical", "emergency"] as const;
export const LIVE_COST_GUARD_SOURCES = ["prometheus", "alertmanager", "manual", "system"] as const;
export const LIVE_COST_GUARD_ACTION_TYPES = [
  "shorten_token_ttl",
  "restrict_publish",
  "remove_participant",
  "pause_new_live_rooms",
  "turn_bandwidth_cap_requested",
  "restore_normal_mode",
] as const;

export type LiveCostGuardMode = typeof LIVE_COST_GUARD_MODES[number];
export type LiveCostGuardSeverity = typeof LIVE_COST_GUARD_SEVERITIES[number];
export type LiveCostGuardSource = typeof LIVE_COST_GUARD_SOURCES[number];
export type LiveCostGuardActionType = typeof LIVE_COST_GUARD_ACTION_TYPES[number];

export type LiveCostGuardSettings = {
  id: string | null;
  mode: LiveCostGuardMode;
  warningThresholdMbps: number | null;
  criticalThresholdMbps: number | null;
  emergencyThresholdMbps: number | null;
  maxEstimatedUsdPerHour: number | null;
  tokenTtlWarningSeconds: number;
  tokenTtlCriticalSeconds: number;
  cooldownSeconds: number;
  enabled: boolean;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type LiveCostGuardSettingsReadModel = {
  connected: boolean;
  settings: LiveCostGuardSettings;
  metricsStatus: "connected" | "not_configured";
  alertmanagerWebhookStatus: "configured" | "not_configured";
  turnCapStatus: "request_only";
};

export type LiveCostGuardMetricSnapshot = {
  estimatedTurnMbps?: number | null;
  estimatedUsdPerHour?: number | null;
};

export type LiveCostGuardEvent = {
  id: string;
  createdAt: string;
  severity: LiveCostGuardSeverity;
  source: LiveCostGuardSource;
  roomName: string | null;
  participantIdentity: string | null;
  metricSnapshot: Record<string, unknown>;
  estimatedUsdPerHour: number | null;
  recommendedAction: string | null;
  actionTaken: string | null;
  actionStatus: string;
  adminActorId: string | null;
};

export type LiveCostGuardAction = {
  id: string;
  createdAt: string;
  actionType: LiveCostGuardActionType | string;
  roomName: string | null;
  participantIdentity: string | null;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  success: boolean;
  errorMessage: string | null;
  actorType: "system" | "admin";
  actorId: string | null;
};

export type LiveCostGuardManualEventInput = {
  severity: LiveCostGuardSeverity;
  roomName?: string | null;
  participantIdentity?: string | null;
  metricSnapshot?: Record<string, unknown>;
  estimatedUsdPerHour?: number | null;
  recommendedAction?: string | null;
  actionTaken?: string | null;
  actionStatus?: string;
};

export type LiveCostGuardActionRequestInput = {
  actionType: LiveCostGuardActionType;
  roomName?: string | null;
  participantIdentity?: string | null;
  reason: string;
};

type LiveCostGuardClient = {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  from: (table: string) => any;
  functions: {
    invoke: (name: string, options?: { body?: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }>;
  };
};

const client = supabase as unknown as LiveCostGuardClient;

export const DEFAULT_LIVE_COST_GUARD_SETTINGS: LiveCostGuardSettings = {
  id: null,
  mode: "observe_only",
  warningThresholdMbps: null,
  criticalThresholdMbps: null,
  emergencyThresholdMbps: null,
  maxEstimatedUsdPerHour: null,
  tokenTtlWarningSeconds: 300,
  tokenTtlCriticalSeconds: 60,
  cooldownSeconds: 300,
  enabled: false,
  updatedBy: null,
  createdAt: null,
  updatedAt: null,
};

const toText = (value: unknown) => String(value ?? "").trim();

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

const normalizeMode = (value: unknown): LiveCostGuardMode => {
  const normalized = toText(value).toLowerCase();
  return LIVE_COST_GUARD_MODES.includes(normalized as LiveCostGuardMode)
    ? normalized as LiveCostGuardMode
    : "observe_only";
};

const normalizeSeverity = (value: unknown): LiveCostGuardSeverity => {
  const normalized = toText(value).toLowerCase();
  return LIVE_COST_GUARD_SEVERITIES.includes(normalized as LiveCostGuardSeverity)
    ? normalized as LiveCostGuardSeverity
    : "normal";
};

const normalizeSource = (value: unknown): LiveCostGuardSource => {
  const normalized = toText(value).toLowerCase();
  return LIVE_COST_GUARD_SOURCES.includes(normalized as LiveCostGuardSource)
    ? normalized as LiveCostGuardSource
    : "system";
};

const parseObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const parseSettings = (row: any): LiveCostGuardSettings => ({
  id: toText(row?.id) || null,
  mode: normalizeMode(row?.mode),
  warningThresholdMbps: toNumberOrNull(row?.warning_threshold_mbps),
  criticalThresholdMbps: toNumberOrNull(row?.critical_threshold_mbps),
  emergencyThresholdMbps: toNumberOrNull(row?.emergency_threshold_mbps),
  maxEstimatedUsdPerHour: toNumberOrNull(row?.max_estimated_usd_per_hour),
  tokenTtlWarningSeconds: toPositiveInteger(row?.token_ttl_warning_seconds, DEFAULT_LIVE_COST_GUARD_SETTINGS.tokenTtlWarningSeconds),
  tokenTtlCriticalSeconds: toPositiveInteger(row?.token_ttl_critical_seconds, DEFAULT_LIVE_COST_GUARD_SETTINGS.tokenTtlCriticalSeconds),
  cooldownSeconds: Math.max(0, toPositiveInteger(row?.cooldown_seconds, DEFAULT_LIVE_COST_GUARD_SETTINGS.cooldownSeconds)),
  enabled: row?.enabled === true,
  updatedBy: toText(row?.updated_by) || null,
  createdAt: toText(row?.created_at) || null,
  updatedAt: toText(row?.updated_at) || null,
});

const parseEvent = (row: any): LiveCostGuardEvent => ({
  id: toText(row?.id),
  createdAt: toText(row?.created_at),
  severity: normalizeSeverity(row?.severity),
  source: normalizeSource(row?.source),
  roomName: toText(row?.room_name) || null,
  participantIdentity: toText(row?.participant_identity) || null,
  metricSnapshot: parseObject(row?.metric_snapshot_json),
  estimatedUsdPerHour: toNumberOrNull(row?.estimated_usd_per_hour),
  recommendedAction: toText(row?.recommended_action) || null,
  actionTaken: toText(row?.action_taken) || null,
  actionStatus: toText(row?.action_status) || "logged",
  adminActorId: toText(row?.admin_actor_id) || null,
});

const parseAction = (row: any): LiveCostGuardAction => ({
  id: toText(row?.id),
  createdAt: toText(row?.created_at),
  actionType: toText(row?.action_type) || "shorten_token_ttl",
  roomName: toText(row?.room_name) || null,
  participantIdentity: toText(row?.participant_identity) || null,
  reason: toText(row?.reason),
  before: parseObject(row?.before_json),
  after: parseObject(row?.after_json),
  success: row?.success === true,
  errorMessage: toText(row?.error_message) || null,
  actorType: toText(row?.actor_type) === "system" ? "system" : "admin",
  actorId: toText(row?.actor_id) || null,
});

export const formatEstimatedLiveCost = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Not configured";
  return `$${Number(value).toFixed(2)}/hr`;
};

export const classifyLiveCostSeverity = (
  snapshot: LiveCostGuardMetricSnapshot,
  settings: LiveCostGuardSettings = DEFAULT_LIVE_COST_GUARD_SETTINGS,
): LiveCostGuardSeverity => {
  const mbps = toNumberOrNull(snapshot.estimatedTurnMbps);
  const usdPerHour = toNumberOrNull(snapshot.estimatedUsdPerHour);

  if (
    (settings.maxEstimatedUsdPerHour !== null && usdPerHour !== null && usdPerHour >= settings.maxEstimatedUsdPerHour)
    || (settings.emergencyThresholdMbps !== null && mbps !== null && mbps >= settings.emergencyThresholdMbps)
  ) {
    return "emergency";
  }

  if (settings.criticalThresholdMbps !== null && mbps !== null && mbps >= settings.criticalThresholdMbps) {
    return "critical";
  }

  if (
    settings.warningThresholdMbps !== null
    && settings.criticalThresholdMbps !== null
    && mbps !== null
    && mbps >= ((settings.warningThresholdMbps + settings.criticalThresholdMbps) / 2)
  ) {
    return "high";
  }

  if (settings.warningThresholdMbps !== null && mbps !== null && mbps >= settings.warningThresholdMbps) {
    return "warning";
  }

  return "normal";
};

export async function getLiveCostGuardSettings(): Promise<LiveCostGuardSettingsReadModel> {
  try {
    const { data, error } = await client
      .from("admin_live_cost_guard_settings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return {
      alertmanagerWebhookStatus: "not_configured",
      connected: true,
      metricsStatus: "not_configured",
      settings: data ? parseSettings(data) : DEFAULT_LIVE_COST_GUARD_SETTINGS,
      turnCapStatus: "request_only",
    };
  } catch {
    return {
      alertmanagerWebhookStatus: "not_configured",
      connected: false,
      metricsStatus: "not_configured",
      settings: DEFAULT_LIVE_COST_GUARD_SETTINGS,
      turnCapStatus: "request_only",
    };
  }
}

export async function updateLiveCostGuardSettings(
  settings: LiveCostGuardSettings,
): Promise<LiveCostGuardSettingsReadModel> {
  const { data: userData } = await client.auth.getUser();
  const patch = {
    cooldown_seconds: settings.cooldownSeconds,
    critical_threshold_mbps: settings.criticalThresholdMbps,
    emergency_threshold_mbps: settings.emergencyThresholdMbps,
    enabled: settings.enabled,
    max_estimated_usd_per_hour: settings.maxEstimatedUsdPerHour,
    mode: settings.mode,
    token_ttl_critical_seconds: settings.tokenTtlCriticalSeconds,
    token_ttl_warning_seconds: settings.tokenTtlWarningSeconds,
    updated_by: userData.user?.id ?? null,
    warning_threshold_mbps: settings.warningThresholdMbps,
  };

  const query = settings.id
    ? client
      .from("admin_live_cost_guard_settings")
      .update(patch)
      .eq("id", settings.id)
      .select("*")
      .single()
    : client
      .from("admin_live_cost_guard_settings")
      .insert(patch)
      .select("*")
      .single();

  const { data, error } = await query;
  if (error) throw error;

  return {
    alertmanagerWebhookStatus: "not_configured",
    connected: true,
    metricsStatus: "not_configured",
    settings: parseSettings(data),
    turnCapStatus: "request_only",
  };
}

export async function listLiveCostGuardEvents(limit = 50): Promise<LiveCostGuardEvent[]> {
  const { data, error } = await client
    .from("admin_live_cost_guard_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(parseEvent);
}

export async function listLiveCostGuardActions(limit = 50): Promise<LiveCostGuardAction[]> {
  const { data, error } = await client
    .from("admin_live_cost_guard_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(parseAction);
}

export async function createManualLiveCostGuardEvent(input: LiveCostGuardManualEventInput): Promise<LiveCostGuardEvent> {
  const { data: userData } = await client.auth.getUser();
  const { data, error } = await client
    .from("admin_live_cost_guard_events")
    .insert({
      action_status: input.actionStatus ?? "logged",
      action_taken: input.actionTaken ?? null,
      admin_actor_id: userData.user?.id ?? null,
      estimated_usd_per_hour: input.estimatedUsdPerHour ?? null,
      metric_snapshot_json: input.metricSnapshot ?? {},
      participant_identity: input.participantIdentity ?? null,
      recommended_action: input.recommendedAction ?? null,
      room_name: input.roomName ?? null,
      severity: input.severity,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) throw error;
  return parseEvent(data);
}

export async function requestLiveCostGuardAction(input: LiveCostGuardActionRequestInput): Promise<LiveCostGuardAction | null> {
  const { data, error } = await client.functions.invoke("admin-live-cost-guard-action", {
    body: {
      actionType: input.actionType,
      participantIdentity: input.participantIdentity ?? null,
      reason: input.reason,
      roomName: input.roomName ?? null,
    },
  });

  if (error) throw error;
  const action = data && typeof data === "object" ? (data as Record<string, unknown>).action : null;
  return action ? parseAction(action) : null;
}
