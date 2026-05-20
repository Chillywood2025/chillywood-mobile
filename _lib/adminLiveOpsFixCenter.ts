import { supabase } from "./supabase";

export const LIVE_OPS_FIX_CENTER_ACTIONS = ["approve", "reject", "create_pr_only"] as const;

export type LiveOpsFixCenterAction = typeof LIVE_OPS_FIX_CENTER_ACTIONS[number];
export type LiveOpsAffectedPurpose =
  | "live-stage"
  | "watch-party-live"
  | "chat-call"
  | "chat-video-call"
  | "chat-audio-call";
export type LiveOpsIncidentStatus =
  | "detected"
  | "waiting_approval"
  | "dry_run_completed"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";

export type LiveOpsIncident = {
  id: string;
  opsJobId: string | null;
  idempotencyKey: string;
  status: LiveOpsIncidentStatus;
  title: string;
  affectedRoute: "Live Watch-Party" | "Watch-Party Live" | "Chi'lly Chat";
  affectedPurpose: LiveOpsAffectedPurpose;
  affectedPlatform: string;
  affectedRooms: string[];
  affectedServerId: string | null;
  affectedThreadId: string | null;
  affectedCallId: string | null;
  callMode: "voice" | "video" | null;
  detectedSymptoms: string[];
  likelyCause: string;
  confidence: "low" | "medium" | "high";
  suggestedFix: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  recommendedAction: string;
  rollbackNote: string;
  runbookUrl: string | null;
  runbookPath: string;
  dryRunResult: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  lastActionAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveOpsActionAudit = {
  id: string;
  incidentId: string | null;
  opsJobId: string | null;
  eventType: string;
  actionType: string;
  actorRole: string | null;
  dryRun: boolean;
  success: boolean;
  riskLevel: string;
  rollbackNote: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type LiveOpsFixCenterReadModel = {
  connected: boolean;
  incidents: LiveOpsIncident[];
  audits: LiveOpsActionAudit[];
};

type LiveOpsClient = {
  functions: {
    invoke: (name: string, options?: { body?: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }>;
  };
};

const client = supabase as unknown as LiveOpsClient;

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeStatus = (value: unknown): LiveOpsIncidentStatus => {
  const normalized = toText(value);
  if (
    normalized === "detected"
    || normalized === "waiting_approval"
    || normalized === "dry_run_completed"
    || normalized === "approved"
    || normalized === "rejected"
    || normalized === "executed"
    || normalized === "failed"
  ) return normalized;
  return "detected";
};

const toStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map(toText).filter(Boolean)
    : toText(value)
      ? [toText(value)]
      : []
);

const toObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const normalizePurpose = (value: unknown, affectedRoute: string): LiveOpsAffectedPurpose => {
  const normalized = toText(value);
  if (
    normalized === "live-stage"
    || normalized === "watch-party-live"
    || normalized === "chat-call"
    || normalized === "chat-video-call"
    || normalized === "chat-audio-call"
  ) return normalized;
  if (affectedRoute === "Watch-Party Live") return "watch-party-live";
  if (affectedRoute === "Chi'lly Chat") return "chat-call";
  return "live-stage";
};

const normalizeRoute = (value: unknown): LiveOpsIncident["affectedRoute"] => {
  const normalized = toText(value);
  if (normalized === "Watch-Party Live" || normalized === "Chi'lly Chat") return normalized;
  return "Live Watch-Party";
};

const normalizeCallMode = (value: unknown): LiveOpsIncident["callMode"] => {
  const normalized = toText(value);
  if (normalized === "voice" || normalized === "video") return normalized;
  return null;
};

const parseIncident = (row: Record<string, unknown>): LiveOpsIncident => ({
  affectedCallId: toText(row.affected_call_id) || null,
  affectedPlatform: toText(row.affected_platform) || "mobile",
  affectedPurpose: normalizePurpose(row.affected_purpose, toText(row.affected_route)),
  affectedRooms: toStringArray(row.affected_rooms),
  affectedRoute: normalizeRoute(row.affected_route),
  affectedServerId: toText(row.affected_server_id) || null,
  affectedThreadId: toText(row.affected_thread_id) || null,
  callMode: normalizeCallMode(row.call_mode),
  confidence: toText(row.confidence) === "high" ? "high" : toText(row.confidence) === "medium" ? "medium" : "low",
  createdAt: toText(row.created_at),
  detectedSymptoms: toStringArray(row.detected_symptoms),
  dryRunResult: Object.keys(toObject(row.dry_run_result)).length
    ? toObject(row.dry_run_result)
    : Object.keys(toObject(toObject(row.metadata).dry_run_result)).length
      ? toObject(toObject(row.metadata).dry_run_result)
      : Object.keys(toObject(toObject(row.metadata).execution_result)).length
        ? toObject(toObject(row.metadata).execution_result)
      : null,
  id: toText(row.id),
  idempotencyKey: toText(row.idempotency_key),
  lastActionAt: toText(row.last_action_at) || null,
  likelyCause: toText(row.likely_cause) || "Unknown from available real signals.",
  metadata: toObject(row.metadata),
  opsJobId: toText(row.ops_job_id) || null,
  recommendedAction: toText(row.recommended_action) || "observe",
  riskLevel:
    toText(row.risk_level) === "critical"
      ? "critical"
      : toText(row.risk_level) === "high"
        ? "high"
        : toText(row.risk_level) === "medium"
          ? "medium"
          : "low",
  rollbackNote: toText(row.rollback_note) || "No rollback note provided.",
  runbookPath: toText(row.runbook_path) || "docs/admin/LIVE_OPS_FIX_CENTER.md",
  runbookUrl: toText(row.runbook_url) || null,
  status: normalizeStatus(row.status),
  suggestedFix: toText(row.suggested_fix) || "Open the runbook and keep the action in dry-run until proof is complete.",
  title: toText(row.title) || "Live Ops incident",
  updatedAt: toText(row.updated_at),
});

const parseAudit = (row: Record<string, unknown>): LiveOpsActionAudit => ({
  actionType: toText(row.action_type),
  actorRole: toText(row.actor_role) || null,
  createdAt: toText(row.created_at),
  dryRun: row.dry_run !== false,
  errorMessage: toText(row.error_message) || null,
  eventType: toText(row.event_type),
  id: toText(row.id),
  incidentId: toText(row.incident_id) || null,
  opsJobId: toText(row.ops_job_id) || null,
  riskLevel: toText(row.risk_level) || "low",
  rollbackNote: toText(row.rollback_note) || null,
  success: row.success === true,
});

export async function readLiveOpsFixCenter(limit = 25): Promise<LiveOpsFixCenterReadModel> {
  const { data, error } = await client.functions.invoke("admin-live-ops-fix-center", {
    body: {
      action: "list",
      limit,
    },
  });

  if (error) throw error;
  const payload = toObject(data);
  return {
    audits: Array.isArray(payload.audits) ? payload.audits.map((row) => parseAudit(toObject(row))) : [],
    connected: true,
    incidents: Array.isArray(payload.incidents) ? payload.incidents.map((row) => parseIncident(toObject(row))) : [],
  };
}

export async function requestLiveOpsFixCenterAction(input: {
  action: LiveOpsFixCenterAction;
  incidentId: string;
  reason?: string;
}): Promise<LiveOpsFixCenterReadModel> {
  const { error } = await client.functions.invoke("admin-live-ops-fix-center", {
    body: {
      action: input.action,
      incidentId: input.incidentId,
      reason: input.reason ?? "",
    },
  });

  if (error) throw error;
  return await readLiveOpsFixCenter();
}

export const formatLiveOpsToken = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bPr\b/g, "PR")
    .replace(/\bCi\b/g, "CI");

export const formatLiveOpsTimestamp = (value: string | null | undefined) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
};
