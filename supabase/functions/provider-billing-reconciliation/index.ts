import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type ReconciliationProvider = "cloudflare_r2" | "hetzner_object_storage" | "hetzner_server";
type RequestedProvider = ReconciliationProvider | "all_configured";
type ReconciliationStatus = "pending" | "matched" | "variance";

type ReconciliationPayload = {
  provider?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  dryRun?: unknown;
};

type ReconciliationDraft = {
  provider: ReconciliationProvider;
  usageClass: "storage_estimate" | "provider_import";
  unit: "bytes" | "request" | "provider_metric";
  internalQuantity: number | null;
  providerQuantity: number | null;
  varianceQuantity: number | null;
  status: ReconciliationStatus;
  sourceMetricKeys: string[];
};

type ReconciliationResult = {
  provider: ReconciliationProvider;
  status: "completed" | "no_source_rows" | "failed";
  rowsPrepared: number;
  rowsWritten: number;
  message?: string;
};

type SupabaseClient = ReturnType<typeof createClient>;

const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const ACTIVE_RECONCILIATION_PROVIDERS: ReconciliationProvider[] = [
  "cloudflare_r2",
  "hetzner_object_storage",
  "hetzner_server",
];

const MAX_RECONCILIATION_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 10 * 60 * 1000;

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

const toText = (value: unknown) => String(value ?? "").trim();

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown provider reconciliation error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{24,}/g, "[redacted]")
    .slice(0, 240);
};

const toPositiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeProvider = (value: unknown): RequestedProvider | null => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "cloudflare_r2"
    || normalized === "hetzner_object_storage"
    || normalized === "hetzner_server"
    || normalized === "all_configured"
  ) {
    return normalized;
  }
  return null;
};

const parseReconciliationDate = (value: unknown) => {
  const raw = toText(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const parsePayload = (payload: ReconciliationPayload | null) => {
  if (!payload || typeof payload !== "object") {
    return { error: json(400, { error: "invalid_body", message: "Request body must be a JSON object." }) };
  }

  const provider = normalizeProvider(payload.provider);
  if (!provider) {
    return {
      error: json(400, {
        error: "invalid_provider",
        message: "Provider must be cloudflare_r2, hetzner_object_storage, hetzner_server, or all_configured.",
      }),
    };
  }

  const periodStart = parseReconciliationDate(payload.periodStart);
  const periodEnd = parseReconciliationDate(payload.periodEnd);
  if (!periodStart || !periodEnd) {
    return { error: json(400, { error: "invalid_period", message: "periodStart and periodEnd must be valid dates or ISO timestamps." }) };
  }
  if (periodEnd.getTime() < periodStart.getTime()) {
    return { error: json(400, { error: "invalid_period", message: "periodEnd must be on or after periodStart." }) };
  }
  if (periodEnd.getTime() - periodStart.getTime() > MAX_RECONCILIATION_WINDOW_MS) {
    return { error: json(400, { error: "period_too_large", message: "Provider reconciliation is limited to a 31 day window." }) };
  }
  if (periodEnd.getTime() > Date.now() + FUTURE_SKEW_MS) {
    return { error: json(400, { error: "future_period", message: "periodEnd cannot be in the future." }) };
  }

  return {
    value: {
      provider,
      periodStart,
      periodEnd,
      dryRun: payload.dryRun === true,
    },
  };
};

const authenticateRequest = async (req: Request, supabaseUrl: string, supabaseAnonKey: string) => {
  const authorization = toText(req.headers.get("Authorization"));
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: json(401, { error: "missing_authorization", message: "Bearer authorization is required." }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const { data, error } = await authClient.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId) {
    return { error: json(401, { error: "invalid_session", message: "Supabase could not verify the current user session." }) };
  }

  return {
    user: {
      id: userId,
      email: toText(data.user?.email).toLowerCase(),
    },
  };
};

const userHasPlatformRole = async (
  adminClient: SupabaseClient,
  user: { id: string; email: string },
  roles: string[],
) => {
  const userQuery = await adminClient
    .from("platform_role_memberships")
    .select("id,role")
    .eq("status", "active")
    .in("role", roles)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (userQuery.data?.id) return { allowed: true, role: toText(userQuery.data.role) };
  if (!user.email) return { allowed: false, role: null };

  const emailQuery = await adminClient
    .from("platform_role_memberships")
    .select("id,role")
    .eq("status", "active")
    .in("role", roles)
    .ilike("email", user.email)
    .limit(1)
    .maybeSingle();

  return {
    allowed: !!emailQuery.data?.id,
    role: emailQuery.data?.role ? toText(emailQuery.data.role) : null,
  };
};

const sumProviderUsage = async (
  adminClient: SupabaseClient,
  provider: ReconciliationProvider,
  startDate: string,
  endDate: string,
  metricKeys: string[],
  unit: string,
) => {
  const { data, error } = await adminClient
    .from("provider_usage_daily")
    .select("quantity,metric_key")
    .eq("provider", provider)
    .eq("unit", unit)
    .in("metric_key", metricKeys)
    .gte("usage_date", startDate)
    .lte("usage_date", endDate)
    .limit(10000);

  if (error) throw error;
  const rows = Array.isArray(data) ? data as Array<{ quantity?: unknown; metric_key?: unknown }> : [];
  return rows.reduce((sum, row) => sum + toPositiveNumber(row.quantity), 0);
};

const sumInternalStorageEstimate = async (
  adminClient: SupabaseClient,
  startDate: string,
  endDate: string,
) => {
  const { data, error } = await adminClient
    .from("usage_daily_summaries")
    .select("quantity")
    .eq("usage_class", "storage_estimate")
    .eq("unit", "bytes")
    .gte("usage_date", startDate)
    .lte("usage_date", endDate)
    .limit(10000);

  if (error) throw error;
  const rows = Array.isArray(data) ? data as Array<{ quantity?: unknown }> : [];
  return rows.reduce((sum, row) => sum + toPositiveNumber(row.quantity), 0);
};

const resolveReconciliationStatus = (
  internalQuantity: number | null,
  providerQuantity: number | null,
): ReconciliationStatus => {
  if (internalQuantity === null || providerQuantity === null) return "pending";
  return Math.abs(providerQuantity - internalQuantity) === 0 ? "matched" : "variance";
};

const writeAuditRow = async (
  adminClient: SupabaseClient,
  input: {
    user: { id: string; email: string };
    role: string | null;
    action: string;
    targetId?: string | null;
    reason: string;
    metadata: Record<string, unknown>;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
  },
) => {
  const { error } = await adminClient
    .from("platform_admin_audit_logs")
    .insert({
      actor_user_id: input.user.id,
      actor_email: input.user.email || null,
      actor_role: input.role,
      action: input.action,
      action_category: "usage",
      target_type: "provider_usage_reconciliation",
      target_id: input.targetId ?? null,
      reason: input.reason,
      severity: "notice",
      before_state: input.beforeState ?? null,
      after_state: input.afterState ?? null,
      metadata: {
        provider_billing_reconciliation_foundation: true,
        backend_only: true,
        live_money_action: false,
        customer_charge: false,
        invoice_sent: false,
        payment_link_created: false,
        provider_bill_imported: false,
        ...input.metadata,
      },
    });
  if (error) throw error;
};

const buildProviderDrafts = async (
  adminClient: SupabaseClient,
  provider: ReconciliationProvider,
  startDate: string,
  endDate: string,
): Promise<ReconciliationDraft[]> => {
  if (provider === "cloudflare_r2") {
    const storageMetricKeys = ["storage_payload_bytes", "storage_metadata_bytes"];
    const requestMetricKeys = ["operation_requests"];
    const [providerStorageBytes, providerRequests, internalStorageBytes] = await Promise.all([
      sumProviderUsage(adminClient, provider, startDate, endDate, storageMetricKeys, "bytes"),
      sumProviderUsage(adminClient, provider, startDate, endDate, requestMetricKeys, "request"),
      sumInternalStorageEstimate(adminClient, startDate, endDate),
    ]);

    return [
      {
        provider,
        usageClass: "storage_estimate",
        unit: "bytes",
        internalQuantity: internalStorageBytes > 0 ? internalStorageBytes : null,
        providerQuantity: providerStorageBytes > 0 ? providerStorageBytes : null,
        varianceQuantity: providerStorageBytes > 0 && internalStorageBytes > 0 ? providerStorageBytes - internalStorageBytes : null,
        status: resolveReconciliationStatus(internalStorageBytes > 0 ? internalStorageBytes : null, providerStorageBytes > 0 ? providerStorageBytes : null),
        sourceMetricKeys: storageMetricKeys,
      },
      {
        provider,
        usageClass: "provider_import",
        unit: "request",
        internalQuantity: null,
        providerQuantity: providerRequests > 0 ? providerRequests : null,
        varianceQuantity: null,
        status: "pending",
        sourceMetricKeys: requestMetricKeys,
      },
    ];
  }

  if (provider === "hetzner_object_storage") {
    const metricKeys = ["s3_inventory_storage_bytes"];
    const [providerStorageBytes, internalStorageBytes] = await Promise.all([
      sumProviderUsage(adminClient, provider, startDate, endDate, metricKeys, "bytes"),
      sumInternalStorageEstimate(adminClient, startDate, endDate),
    ]);

    return [{
      provider,
      usageClass: "storage_estimate",
      unit: "bytes",
      internalQuantity: internalStorageBytes > 0 ? internalStorageBytes : null,
      providerQuantity: providerStorageBytes > 0 ? providerStorageBytes : null,
      varianceQuantity: providerStorageBytes > 0 && internalStorageBytes > 0 ? providerStorageBytes - internalStorageBytes : null,
      status: resolveReconciliationStatus(internalStorageBytes > 0 ? internalStorageBytes : null, providerStorageBytes > 0 ? providerStorageBytes : null),
      sourceMetricKeys: metricKeys,
    }];
  }

  const metricKeys = ["server_network_total"];
  const providerNetworkMetric = await sumProviderUsage(adminClient, provider, startDate, endDate, metricKeys, "provider_metric");
  return [{
    provider,
    usageClass: "provider_import",
    unit: "provider_metric",
    internalQuantity: null,
    providerQuantity: providerNetworkMetric > 0 ? providerNetworkMetric : null,
    varianceQuantity: null,
    status: "pending",
    sourceMetricKeys: metricKeys,
  }];
};

const upsertReconciliationDraft = async (
  adminClient: SupabaseClient,
  draft: ReconciliationDraft,
  startDate: string,
  endDate: string,
) => {
  const existing = await adminClient
    .from("provider_usage_reconciliation")
    .select("id,status,internal_quantity,provider_quantity,variance_quantity,metadata")
    .eq("provider", draft.provider)
    .eq("period_start", startDate)
    .eq("period_end", endDate)
    .eq("usage_class", draft.usageClass)
    .eq("unit", draft.unit)
    .limit(1)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const payload = {
    period_start: startDate,
    period_end: endDate,
    provider: draft.provider,
    usage_class: draft.usageClass,
    internal_quantity: draft.internalQuantity,
    provider_quantity: draft.providerQuantity,
    variance_quantity: draft.varianceQuantity,
    unit: draft.unit,
    status: draft.status,
    notes: "Foundation reconciliation only. No invoice send, customer charge, payment link, provider bill import, or billing execution.",
    metadata: {
      provider_billing_reconciliation_foundation_proof: true,
      created_by: "provider_billing_reconciliation_edge_function",
      backend_only: true,
      foundation_only: true,
      live_money_action: false,
      customer_charge: false,
      invoice_sent: false,
      payment_link_created: false,
      provider_bill_imported: false,
      source_tables: ["provider_usage_daily", "usage_daily_summaries"],
      source_metric_keys: draft.sourceMetricKeys,
    },
    updated_at: new Date().toISOString(),
  };

  if (existing.data?.id) {
    const { error } = await adminClient
      .from("provider_usage_reconciliation")
      .update(payload)
      .eq("id", existing.data.id);
    if (error) throw error;
    return {
      id: toText(existing.data.id),
      beforeState: existing.data as Record<string, unknown>,
      afterState: payload,
    };
  }

  const inserted = await adminClient
    .from("provider_usage_reconciliation")
    .insert(payload)
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return {
    id: toText(inserted.data?.id),
    beforeState: null,
    afterState: payload,
  };
};

const runProviderReconciliation = async (
  adminClient: SupabaseClient,
  provider: ReconciliationProvider,
  startDate: string,
  endDate: string,
  dryRun: boolean,
  auditContext: { user: { id: string; email: string }; role: string | null },
): Promise<ReconciliationResult> => {
  try {
    const drafts = (await buildProviderDrafts(adminClient, provider, startDate, endDate))
      .filter((draft) => draft.providerQuantity !== null || draft.internalQuantity !== null);

    if (dryRun) {
      return {
        provider,
        status: drafts.length > 0 ? "completed" : "no_source_rows",
        rowsPrepared: drafts.length,
        rowsWritten: 0,
      };
    }

    let rowsWritten = 0;
    for (const draft of drafts) {
      const written = await upsertReconciliationDraft(adminClient, draft, startDate, endDate);
      rowsWritten += 1;
      await writeAuditRow(adminClient, {
        ...auditContext,
        action: "provider_billing_reconciliation_row_upserted",
        targetId: written.id,
        reason: "Provider billing reconciliation foundation row upserted.",
        beforeState: written.beforeState,
        afterState: written.afterState,
        metadata: {
          provider,
          usage_class: draft.usageClass,
          unit: draft.unit,
          status: draft.status,
          period_start: startDate,
          period_end: endDate,
        },
      });
    }

    return {
      provider,
      status: rowsWritten > 0 ? "completed" : "no_source_rows",
      rowsPrepared: drafts.length,
      rowsWritten,
    };
  } catch (error) {
    return {
      provider,
      status: "failed",
      rowsPrepared: 0,
      rowsWritten: 0,
      message: sanitizeErrorMessage(error),
    };
  }
};

const resolveResponseStatus = (results: ReconciliationResult[]) => {
  if (results.some((result) => result.status === "failed")) return "failed";
  if (results.every((result) => result.status === "no_source_rows")) return "no_source_rows";
  return "completed";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST for provider billing reconciliation." });
  }

  try {
    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const platformRole = await userHasPlatformRole(adminClient, authResult.user, ["owner", "operator"]);
    if (!platformRole.allowed) {
      return json(403, { error: "not_authorized", message: "Active owner or operator role required to reconcile provider billing foundations." });
    }

    const payload = await req.json().catch(() => null) as ReconciliationPayload | null;
    const parsed = parsePayload(payload);
    if ("error" in parsed) return parsed.error;

    const { provider, periodStart, periodEnd, dryRun } = parsed.value;
    const startDate = toIsoDate(periodStart);
    const endDate = toIsoDate(periodEnd);
    const providers = provider === "all_configured" ? ACTIVE_RECONCILIATION_PROVIDERS : [provider];

    if (!dryRun) {
      await writeAuditRow(adminClient, {
        user: authResult.user,
        role: platformRole.role,
        action: "provider_billing_reconciliation_requested",
        reason: "Provider billing reconciliation foundation requested.",
        metadata: {
          provider,
          period_start: startDate,
          period_end: endDate,
        },
      });
    }

    const results: ReconciliationResult[] = [];
    for (const targetProvider of providers) {
      results.push(await runProviderReconciliation(
        adminClient,
        targetProvider,
        startDate,
        endDate,
        dryRun,
        { user: authResult.user, role: platformRole.role },
      ));
    }

    const status = resolveResponseStatus(results);
    if (!dryRun) {
      await writeAuditRow(adminClient, {
        user: authResult.user,
        role: platformRole.role,
        action: status === "failed"
          ? "provider_billing_reconciliation_failed"
          : "provider_billing_reconciliation_completed",
        reason: "Provider billing reconciliation foundation completed.",
        metadata: {
          provider,
          period_start: startDate,
          period_end: endDate,
          status,
          rows_written: results.reduce((sum, result) => sum + result.rowsWritten, 0),
          failed_providers: results
            .filter((result) => result.status === "failed")
            .map((result) => result.provider),
        },
      });
    }

    return json(status === "failed" ? 500 : 200, {
      status,
      providerBillingImportActive: false,
      billingExecutionActive: false,
      invoiceCreated: false,
      customerCharged: false,
      paymentLinkCreated: false,
      providerBillImported: false,
      periodStart: startDate,
      periodEnd: endDate,
      dryRun,
      results,
    });
  } catch (error) {
    return json(500, {
      error: "provider_billing_reconciliation_failed",
      message: sanitizeErrorMessage(error),
    });
  }
});
