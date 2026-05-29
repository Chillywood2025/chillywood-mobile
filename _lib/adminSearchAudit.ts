import { supabase } from "./supabase";

export type AdminSearchAuditStatus = "searched" | "blocked" | "denied" | "failed";

export type AdminSearchAuditEventName =
  | "admin_search_query"
  | "admin_search_email_lookup"
  | "admin_search_denied"
  | "admin_search_result_opened";

export type AdminSearchAuditReceipt = {
  ok: boolean;
  auditLogId: string | null;
  status: AdminSearchAuditStatus;
  eventName: AdminSearchAuditEventName;
  searchScope: string;
  queryType: "email" | "id" | "text" | string;
  queryPreview: string | null;
  resultCount: number | null;
  createdAt: string | null;
  error?: string | null;
};

type AdminSearchAuditRpcResponse = {
  ok?: unknown;
  auditLogId?: unknown;
  status?: unknown;
  eventName?: unknown;
  searchScope?: unknown;
  queryType?: unknown;
  queryPreview?: unknown;
  resultCount?: unknown;
  createdAt?: unknown;
  error?: unknown;
};

type AdminSearchAuditInput = {
  searchScope: string;
  query: string;
  resultCount?: number | null;
  status?: AdminSearchAuditStatus;
  eventName?: AdminSearchAuditEventName | null;
  reason?: string | null;
  resultRef?: string | null;
};

const adminSearchAuditClient = supabase as unknown as {
  rpc: (
    functionName: "write_admin_search_audit",
    params: Record<string, unknown>,
  ) => Promise<{ data: AdminSearchAuditRpcResponse | null; error: unknown }>;
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeStatus = (value: unknown): AdminSearchAuditStatus => {
  if (value === "blocked" || value === "denied" || value === "failed") return value;
  return "searched";
};

const normalizeEventName = (value: unknown): AdminSearchAuditEventName => {
  if (
    value === "admin_search_email_lookup"
    || value === "admin_search_denied"
    || value === "admin_search_result_opened"
  ) {
    return value;
  }
  return "admin_search_query";
};

const normalizeResultCount = (value: unknown) => {
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  return Math.max(0, Math.floor(count));
};

export async function writeAdminSearchAudit(input: AdminSearchAuditInput): Promise<AdminSearchAuditReceipt> {
  const { data, error } = await adminSearchAuditClient.rpc("write_admin_search_audit", {
    p_search_scope: input.searchScope,
    p_query: input.query,
    p_result_count: input.resultCount ?? null,
    p_status: input.status ?? "searched",
    p_event_name: input.eventName ?? null,
    p_reason: input.reason ?? null,
    p_result_ref: input.resultRef ?? null,
    p_metadata: {
      app_surface: "admin_search",
      client_written_full_query: false,
    },
  });

  if (error) throw error;

  const response = data ?? {};

  return {
    ok: response.ok === true,
    auditLogId: normalizeText(response.auditLogId),
    status: normalizeStatus(response.status),
    eventName: normalizeEventName(response.eventName),
    searchScope: normalizeText(response.searchScope) ?? input.searchScope,
    queryType: normalizeText(response.queryType) ?? "text",
    queryPreview: normalizeText(response.queryPreview),
    resultCount: normalizeResultCount(response.resultCount),
    createdAt: normalizeText(response.createdAt),
    error: normalizeText(response.error),
  };
}
