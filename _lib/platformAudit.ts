import { supabase } from "./supabase";

export const PLATFORM_ADMIN_AUDIT_LOGS_TABLE = "platform_admin_audit_logs";

export type PlatformAdminAuditLogRow = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  actionCategory: string;
  targetType: string | null;
  targetId: string | null;
  targetUserId: string | null;
  targetChannelUserId: string | null;
  reason: string | null;
  severity: string;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  foundationProof: boolean;
};

export type AdminImmutableAuditReadModel = {
  auditLogCount: number | null;
  latestRows: PlatformAdminAuditLogRow[];
  connected: boolean;
  generatedAt: string;
};

type AuditLogDbRow = {
  id?: string | null;
  actor_user_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  action?: string | null;
  action_category?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  target_user_id?: string | null;
  target_channel_user_id?: string | null;
  reason?: string | null;
  severity?: string | null;
  metadata?: unknown;
  created_at?: string | null;
};

type AuditQueryResult = {
  data: AuditLogDbRow[] | null;
  count: number | null;
  error: unknown;
};

type AuditLimitBuilder = PromiseLike<AuditQueryResult>;

type AuditOrderBuilder = {
  limit: (limit: number) => AuditLimitBuilder;
};

type AuditSelectBuilder = PromiseLike<AuditQueryResult> & {
  order: (column: string, options?: { ascending?: boolean }) => AuditOrderBuilder;
};

const auditClient = supabase as unknown as {
  from: (table: string) => {
    select: (
      columns: string,
      options?: { count?: "exact" },
    ) => AuditSelectBuilder;
  };
};

const normalizePositiveLimit = (value: unknown, fallback: number, max: number) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(normalized)));
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const toAuditLogRow = (row: AuditLogDbRow): PlatformAdminAuditLogRow | null => {
  const id = normalizeText(row.id);
  const action = normalizeText(row.action);
  const actionCategory = normalizeText(row.action_category);

  if (!id || !action || !actionCategory) return null;

  const metadata = isPlainObject(row.metadata) ? row.metadata : {};

  return {
    id,
    actorUserId: normalizeText(row.actor_user_id),
    actorEmail: normalizeText(row.actor_email),
    actorRole: normalizeText(row.actor_role),
    action,
    actionCategory,
    targetType: normalizeText(row.target_type),
    targetId: normalizeText(row.target_id),
    targetUserId: normalizeText(row.target_user_id),
    targetChannelUserId: normalizeText(row.target_channel_user_id),
    reason: normalizeText(row.reason),
    severity: normalizeText(row.severity) ?? "info",
    metadata,
    createdAt: normalizeText(row.created_at),
    foundationProof:
      metadata.admin_audit_foundation_proof === true
      || metadata.foundation_only === true,
  };
};

export const formatAdminAuditFoundationCount = (value: number | null) => {
  if (value === null) return "Not connected yet";
  return `${value} ${value === 1 ? "audit row" : "audit rows"} found.`;
};

export async function readAdminImmutableAuditReadModel(options?: {
  limit?: number;
}): Promise<AdminImmutableAuditReadModel> {
  const limit = normalizePositiveLimit(options?.limit, 8, 25);

  try {
    const { data, count, error } = await auditClient
      .from(PLATFORM_ADMIN_AUDIT_LOGS_TABLE)
      .select(
        "id,actor_user_id,actor_email,actor_role,action,action_category,target_type,target_id,target_user_id,target_channel_user_id,reason,severity,metadata,created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const latestRows = (data ?? [])
      .map(toAuditLogRow)
      .filter((row): row is PlatformAdminAuditLogRow => !!row);

    return {
      auditLogCount: Number(count ?? latestRows.length),
      latestRows,
      connected: true,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      auditLogCount: null,
      latestRows: [],
      connected: false,
      generatedAt: new Date().toISOString(),
    };
  }
}
