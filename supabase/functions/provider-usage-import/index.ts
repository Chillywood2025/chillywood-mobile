import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type ImportProvider = "cloudflare_r2" | "hetzner_server";
type RequestedProvider = ImportProvider | "all_configured";
type ImportResultStatus = "completed" | "failed" | "not_configured";
type ImportResponseStatus = "completed" | "partial" | "not_configured" | "failed";

type ProviderUsageImportPayload = {
  provider?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  dryRun?: unknown;
};

type ProviderUsageDailyRow = {
  provider: ImportProvider;
  provider_account_id: string;
  usage_date: string;
  resource_type: string;
  resource_name: string;
  metric_key: string;
  quantity: number;
  unit: string;
  metadata: Record<string, unknown>;
  import_id: string | null;
};

type ProviderImportResult = {
  provider: ImportProvider;
  status: ImportResultStatus;
  recordsImported: number;
  providerAccountId: string | null;
  metrics: string[];
  message?: string;
};

type SupabaseClient = ReturnType<typeof createClient>;

const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const PROVIDER_LABELS: Record<ImportProvider, string> = {
  cloudflare_r2: "Cloudflare R2",
  hetzner_server: "Hetzner Servers",
};

const MAX_IMPORT_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 10 * 60 * 1000;
const CLOUDFLARE_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const HETZNER_API_BASE = "https://api.hetzner.cloud/v1";

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

const readOptionalEnv = (key: string) => toText(Deno.env.get(key));

const redactLast4 = (value: string) => {
  const normalized = toText(value);
  if (!normalized) return "missing";
  return `...${normalized.slice(-4)}`;
};

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown provider import error.");
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
  if (normalized === "cloudflare_r2" || normalized === "hetzner_server" || normalized === "all_configured") {
    return normalized;
  }
  return null;
};

const parseImportDate = (value: unknown) => {
  const raw = toText(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const toDateFromTimestamp = (value: unknown) => {
  if (typeof value === "number") {
    const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : toIsoDate(date);
  }

  const parsed = parseImportDate(value);
  return parsed ? toIsoDate(parsed) : null;
};

const parseCommaList = (value: string) => value
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const parsePayload = (payload: ProviderUsageImportPayload | null) => {
  if (!payload || typeof payload !== "object") {
    return { error: json(400, { error: "invalid_body", message: "Request body must be a JSON object." }) };
  }

  const provider = normalizeProvider(payload.provider);
  if (!provider) {
    return { error: json(400, { error: "invalid_provider", message: "Provider must be cloudflare_r2, hetzner_server, or all_configured." }) };
  }

  const periodStart = parseImportDate(payload.periodStart);
  const periodEnd = parseImportDate(payload.periodEnd);
  if (!periodStart || !periodEnd) {
    return { error: json(400, { error: "invalid_period", message: "periodStart and periodEnd must be valid dates or ISO timestamps." }) };
  }
  if (periodEnd.getTime() <= periodStart.getTime()) {
    return { error: json(400, { error: "invalid_period", message: "periodEnd must be after periodStart." }) };
  }
  if (periodEnd.getTime() - periodStart.getTime() > MAX_IMPORT_WINDOW_MS) {
    return { error: json(400, { error: "period_too_large", message: "Provider usage imports are limited to a 31 day window." }) };
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
    .select("id")
    .eq("status", "active")
    .in("role", roles)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (userQuery.data?.id) return true;
  if (!user.email) return false;

  const emailQuery = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("status", "active")
    .in("role", roles)
    .ilike("email", user.email)
    .limit(1)
    .maybeSingle();

  return !!emailQuery.data?.id;
};

const providerAccountReference = (provider: ImportProvider) => {
  if (provider === "cloudflare_r2") {
    const accountId = readOptionalEnv("CLOUDFLARE_ACCOUNT_ID");
    return accountId ? `cloudflare:${accountId.slice(-4)}` : "cloudflare:r2";
  }
  return "hetzner:cloud";
};

const upsertProviderAccount = async (
  adminClient: SupabaseClient,
  provider: ImportProvider,
  status: "planned" | "connected",
  metadata: Record<string, unknown>,
) => {
  const accountReference = providerAccountReference(provider);
  const now = new Date().toISOString();
  const existing = await adminClient
    .from("provider_accounts")
    .select("id")
    .eq("provider", provider)
    .eq("account_reference", accountReference)
    .limit(1)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data?.id) {
    const updated = await adminClient
      .from("provider_accounts")
      .update({
        display_name: PROVIDER_LABELS[provider],
        status,
        metadata,
        updated_at: now,
      })
      .eq("id", existing.data.id)
      .select("id")
      .single();
    if (updated.error) throw updated.error;
    return toText(updated.data?.id);
  }

  const inserted = await adminClient
    .from("provider_accounts")
    .insert({
      provider,
      display_name: PROVIDER_LABELS[provider],
      account_reference: accountReference,
      status,
      metadata,
      updated_at: now,
    })
    .select("id")
    .single();

  if (inserted.error) throw inserted.error;
  return toText(inserted.data?.id);
};

const createImportRun = async (
  adminClient: SupabaseClient,
  provider: ImportProvider,
  providerAccountId: string,
  periodStart: Date,
  periodEnd: Date,
) => {
  const inserted = await adminClient
    .from("provider_usage_imports")
    .insert({
      provider,
      provider_account_id: providerAccountId,
      import_type: "usage_daily",
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      status: "running",
      source_reference: `${provider}:${toIsoDate(periodStart)}:${toIsoDate(periodEnd)}`,
      records_imported: 0,
      metadata: {
        source: "provider_usage_import_edge_function",
      },
    })
    .select("id")
    .single();

  if (inserted.error) throw inserted.error;
  return toText(inserted.data?.id);
};

const finishImportRun = async (
  adminClient: SupabaseClient,
  importId: string,
  status: "completed" | "failed",
  recordsImported: number,
  errorMessage?: string,
) => {
  const { error } = await adminClient
    .from("provider_usage_imports")
    .update({
      status,
      records_imported: recordsImported,
      error_message: errorMessage ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", importId);
  if (error) throw error;
};

const upsertProviderUsageDailyRow = async (
  adminClient: SupabaseClient,
  row: ProviderUsageDailyRow,
) => {
  const existing = await adminClient
    .from("provider_usage_daily")
    .select("id")
    .eq("provider", row.provider)
    .eq("provider_account_id", row.provider_account_id)
    .eq("usage_date", row.usage_date)
    .eq("resource_type", row.resource_type)
    .eq("resource_name", row.resource_name)
    .eq("metric_key", row.metric_key)
    .eq("unit", row.unit)
    .limit(1)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const payload = {
    provider: row.provider,
    provider_account_id: row.provider_account_id,
    usage_date: row.usage_date,
    resource_type: row.resource_type,
    resource_name: row.resource_name,
    metric_key: row.metric_key,
    quantity: row.quantity,
    unit: row.unit,
    metadata: row.metadata,
    import_id: row.import_id,
    updated_at: new Date().toISOString(),
  };

  if (existing.data?.id) {
    const { error } = await adminClient
      .from("provider_usage_daily")
      .update(payload)
      .eq("id", existing.data.id);
    if (error) throw error;
    return;
  }

  const { error } = await adminClient
    .from("provider_usage_daily")
    .insert(payload);
  if (error) throw error;
};

const graphQlBucketFilter = (bucketName: string | null) => bucketName ? "bucketName: $bucketName" : "";

const fetchCloudflareBucketRows = async (
  providerAccountId: string,
  periodStart: Date,
  periodEnd: Date,
  bucketName: string | null,
  importId: string | null,
) => {
  const token = readOptionalEnv("CLOUDFLARE_API_TOKEN");
  const accountId = readOptionalEnv("CLOUDFLARE_ACCOUNT_ID");
  if (!token || !accountId) {
    return { status: "not_configured" as const, rows: [] as ProviderUsageDailyRow[] };
  }

  const bucketFilter = graphQlBucketFilter(bucketName);
  const query = `
    query ChiLlywoodR2Usage($accountTag: string!, $startDate: Time, $endDate: Time${bucketName ? ", $bucketName: string" : ""}) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2StorageAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $startDate
              datetime_leq: $endDate
              ${bucketFilter}
            }
            orderBy: [datetime_DESC]
          ) {
            max {
              objectCount
              uploadCount
              payloadSize
              metadataSize
            }
            dimensions {
              datetime
              bucketName
            }
          }
          r2OperationsAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $startDate
              datetime_leq: $endDate
              ${bucketFilter}
            }
          ) {
            sum {
              requests
            }
            dimensions {
              actionType
              bucketName
              datetime
            }
          }
        }
      }
    }
  `;

  const variables: Record<string, unknown> = {
    accountTag: accountId,
    startDate: periodStart.toISOString(),
    endDate: periodEnd.toISOString(),
  };
  if (bucketName) variables.bucketName = bucketName;

  const response = await fetch(CLOUDFLARE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || Array.isArray(body?.errors)) {
    throw new Error(`Cloudflare R2 analytics request failed with status ${response.status}.`);
  }

  const accounts = (((body?.data as Record<string, unknown> | undefined)?.viewer as Record<string, unknown> | undefined)?.accounts ?? []) as Array<Record<string, unknown>>;
  const account = accounts[0] ?? {};
  const storageGroups = (account.r2StorageAdaptiveGroups ?? []) as Array<Record<string, unknown>>;
  const operationGroups = (account.r2OperationsAdaptiveGroups ?? []) as Array<Record<string, unknown>>;

  const rowsByKey = new Map<string, ProviderUsageDailyRow>();
  const addRow = (row: Omit<ProviderUsageDailyRow, "provider" | "provider_account_id" | "import_id">) => {
    const key = [
      row.usage_date,
      row.resource_type,
      row.resource_name,
      row.metric_key,
      row.unit,
    ].join("|");
    const existing = rowsByKey.get(key);
    if (existing) {
      existing.quantity = Math.max(existing.quantity, row.quantity);
      existing.metadata = {
        ...existing.metadata,
        ...row.metadata,
      };
      return;
    }
    rowsByKey.set(key, {
      provider: "cloudflare_r2",
      provider_account_id: providerAccountId,
      import_id: importId,
      ...row,
    });
  };

  for (const group of storageGroups) {
    const dimensions = (group.dimensions ?? {}) as Record<string, unknown>;
    const max = (group.max ?? {}) as Record<string, unknown>;
    const usageDate = toDateFromTimestamp(dimensions.datetime) ?? toIsoDate(periodEnd);
    const resourceName = toText(dimensions.bucketName) || bucketName || "account";
    const resourceType = resourceName === "account" ? "r2_account" : "r2_bucket";
    const sharedMetadata = {
      source: "cloudflare_r2_graphql",
      account: redactLast4(accountId),
      bucket: resourceName,
    };

    addRow({
      usage_date: usageDate,
      resource_type: resourceType,
      resource_name: resourceName,
      metric_key: "storage_payload_bytes",
      quantity: toPositiveNumber(max.payloadSize),
      unit: "bytes",
      metadata: sharedMetadata,
    });
    addRow({
      usage_date: usageDate,
      resource_type: resourceType,
      resource_name: resourceName,
      metric_key: "storage_metadata_bytes",
      quantity: toPositiveNumber(max.metadataSize),
      unit: "bytes",
      metadata: sharedMetadata,
    });
    addRow({
      usage_date: usageDate,
      resource_type: resourceType,
      resource_name: resourceName,
      metric_key: "object_count",
      quantity: toPositiveNumber(max.objectCount),
      unit: "object",
      metadata: sharedMetadata,
    });
    addRow({
      usage_date: usageDate,
      resource_type: resourceType,
      resource_name: resourceName,
      metric_key: "pending_multipart_upload_count",
      quantity: toPositiveNumber(max.uploadCount),
      unit: "object",
      metadata: sharedMetadata,
    });
  }

  const operationTotals = new Map<string, { quantity: number; actionTypes: Record<string, number>; metadata: Record<string, unknown> }>();
  for (const group of operationGroups) {
    const dimensions = (group.dimensions ?? {}) as Record<string, unknown>;
    const sum = (group.sum ?? {}) as Record<string, unknown>;
    const usageDate = toDateFromTimestamp(dimensions.datetime) ?? toIsoDate(periodEnd);
    const resourceName = toText(dimensions.bucketName) || bucketName || "account";
    const resourceType = resourceName === "account" ? "r2_account" : "r2_bucket";
    const actionType = toText(dimensions.actionType) || "unknown";
    const key = [usageDate, resourceType, resourceName].join("|");
    const current = operationTotals.get(key) ?? {
      quantity: 0,
      actionTypes: {},
      metadata: {
        source: "cloudflare_r2_graphql",
        account: redactLast4(accountId),
        bucket: resourceName,
      },
    };
    const requests = toPositiveNumber(sum.requests);
    current.quantity += requests;
    current.actionTypes[actionType] = (current.actionTypes[actionType] ?? 0) + requests;
    operationTotals.set(key, current);
  }

  for (const [key, total] of operationTotals.entries()) {
    const [usageDate, resourceType, resourceName] = key.split("|");
    addRow({
      usage_date: usageDate,
      resource_type: resourceType,
      resource_name: resourceName,
      metric_key: "operation_requests",
      quantity: total.quantity,
      unit: "request",
      metadata: {
        ...total.metadata,
        action_type: "all",
        action_types: total.actionTypes,
      },
    });
  }

  return { status: "completed" as const, rows: [...rowsByKey.values()] };
};

const fetchCloudflareRows = async (
  providerAccountId: string,
  periodStart: Date,
  periodEnd: Date,
  importId: string | null,
) => {
  const buckets = parseCommaList(readOptionalEnv("CLOUDFLARE_R2_BUCKETS"));
  const targets = buckets.length > 0 ? buckets : [null];
  const rows: ProviderUsageDailyRow[] = [];
  for (const bucket of targets) {
    const result = await fetchCloudflareBucketRows(providerAccountId, periodStart, periodEnd, bucket, importId);
    if (result.status === "not_configured") return result;
    rows.push(...result.rows);
  }
  return { status: "completed" as const, rows };
};

const normalizeHetznerSeriesKey = (key: string) => {
  const normalized = key.toLowerCase();
  if (normalized.includes("in") || normalized.includes("rx")) return "server_network_rx";
  if (normalized.includes("out") || normalized.includes("tx")) return "server_network_tx";
  return null;
};

const extractHetznerSeries = (body: Record<string, unknown>) => {
  const metrics = (body.metrics ?? body) as Record<string, unknown>;
  const timeSeries = (metrics.time_series ?? metrics.timeSeries ?? {}) as Record<string, unknown>;
  return Object.entries(timeSeries).flatMap(([seriesKey, seriesValue]) => {
    const valueObject = (seriesValue ?? {}) as Record<string, unknown>;
    const values = (valueObject.values ?? valueObject.data ?? []) as unknown[];
    return [{ key: seriesKey, values }];
  });
};

const fetchHetznerRows = async (
  providerAccountId: string,
  periodStart: Date,
  periodEnd: Date,
  importId: string | null,
) => {
  const token = readOptionalEnv("HETZNER_CLOUD_API_TOKEN");
  const serverIds = parseCommaList(readOptionalEnv("HETZNER_SERVER_IDS"));
  if (!token || serverIds.length === 0) {
    return { status: "not_configured" as const, rows: [] as ProviderUsageDailyRow[] };
  }

  const rows: ProviderUsageDailyRow[] = [];
  for (const serverId of serverIds) {
    const url = new URL(`${HETZNER_API_BASE}/servers/${encodeURIComponent(serverId)}/metrics`);
    url.searchParams.set("type", "network");
    url.searchParams.set("start", periodStart.toISOString());
    url.searchParams.set("end", periodEnd.toISOString());
    url.searchParams.set("step", "86400");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !body) {
      throw new Error(`Hetzner server metrics request failed with status ${response.status}.`);
    }

    const series = extractHetznerSeries(body);
    if (series.length === 0) {
      throw new Error("Hetzner server metrics response did not include a readable time series.");
    }

    const totalsByDay = new Map<string, { rx: number; tx: number; hasRx: boolean; hasTx: boolean }>();
    for (const entry of series) {
      const metricKey = normalizeHetznerSeriesKey(entry.key);
      if (!metricKey) continue;
      for (const point of entry.values) {
        const tuple = Array.isArray(point) ? point : [];
        const usageDate = toDateFromTimestamp(tuple[0]);
        const quantity = toPositiveNumber(tuple[1]);
        if (!usageDate) continue;
        const current = totalsByDay.get(usageDate) ?? { rx: 0, tx: 0, hasRx: false, hasTx: false };
        if (metricKey === "server_network_rx") {
          current.rx += quantity;
          current.hasRx = true;
        } else {
          current.tx += quantity;
          current.hasTx = true;
        }
        totalsByDay.set(usageDate, current);
      }
    }

    for (const [usageDate, totals] of totalsByDay.entries()) {
      const sharedMetadata = {
        source: "hetzner_cloud_server_metrics",
        metric_type: "network",
        server_id: serverId,
      };
      if (totals.hasRx) {
        rows.push({
          provider: "hetzner_server",
          provider_account_id: providerAccountId,
          import_id: importId,
          usage_date: usageDate,
          resource_type: "hetzner_server",
          resource_name: serverId,
          metric_key: "server_network_rx",
          quantity: totals.rx,
          unit: "provider_metric",
          metadata: sharedMetadata,
        });
      }
      if (totals.hasTx) {
        rows.push({
          provider: "hetzner_server",
          provider_account_id: providerAccountId,
          import_id: importId,
          usage_date: usageDate,
          resource_type: "hetzner_server",
          resource_name: serverId,
          metric_key: "server_network_tx",
          quantity: totals.tx,
          unit: "provider_metric",
          metadata: sharedMetadata,
        });
      }
      if (totals.hasRx && totals.hasTx) {
        rows.push({
          provider: "hetzner_server",
          provider_account_id: providerAccountId,
          import_id: importId,
          usage_date: usageDate,
          resource_type: "hetzner_server",
          resource_name: serverId,
          metric_key: "server_network_total",
          quantity: totals.rx + totals.tx,
          unit: "provider_metric",
          metadata: sharedMetadata,
        });
      }
    }
  }

  return { status: "completed" as const, rows };
};

const markNotConfigured = async (
  adminClient: SupabaseClient,
  provider: ImportProvider,
  dryRun: boolean,
) => {
  let providerAccountId: string | null = null;
  if (!dryRun) {
    providerAccountId = await upsertProviderAccount(adminClient, provider, "planned", {
      source: "provider_usage_import_edge_function",
      connection_status: "not_configured",
    });
  }

  return {
    provider,
    status: "not_configured" as const,
    recordsImported: 0,
    providerAccountId,
    metrics: [],
    message: `${PROVIDER_LABELS[provider]} provider import is not configured yet.`,
  };
};

const runProviderImport = async (
  adminClient: SupabaseClient,
  provider: ImportProvider,
  periodStart: Date,
  periodEnd: Date,
  dryRun: boolean,
): Promise<ProviderImportResult> => {
  const configured = provider === "cloudflare_r2"
    ? !!readOptionalEnv("CLOUDFLARE_API_TOKEN") && !!readOptionalEnv("CLOUDFLARE_ACCOUNT_ID")
    : !!readOptionalEnv("HETZNER_CLOUD_API_TOKEN") && parseCommaList(readOptionalEnv("HETZNER_SERVER_IDS")).length > 0;

  if (!configured) return markNotConfigured(adminClient, provider, dryRun);

  let providerAccountId = "";
  let importId: string | null = null;
  try {
    providerAccountId = dryRun
      ? "dry-run"
      : await upsertProviderAccount(adminClient, provider, "connected", {
        source: "provider_usage_import_edge_function",
        connection_status: "configured",
        account_reference: providerAccountReference(provider),
      });
    importId = dryRun ? null : await createImportRun(adminClient, provider, providerAccountId, periodStart, periodEnd);

    const fetchResult = provider === "cloudflare_r2"
      ? await fetchCloudflareRows(providerAccountId, periodStart, periodEnd, importId)
      : await fetchHetznerRows(providerAccountId, periodStart, periodEnd, importId);

    if (fetchResult.status === "not_configured") return markNotConfigured(adminClient, provider, dryRun);

    if (!dryRun) {
      for (const row of fetchResult.rows) {
        await upsertProviderUsageDailyRow(adminClient, row);
      }
      if (importId) {
        await finishImportRun(adminClient, importId, "completed", fetchResult.rows.length);
      }
    }

    return {
      provider,
      status: "completed",
      recordsImported: fetchResult.rows.length,
      providerAccountId: dryRun ? null : providerAccountId,
      metrics: [...new Set(fetchResult.rows.map((row) => row.metric_key))],
    };
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    if (importId) {
      await finishImportRun(adminClient, importId, "failed", 0, message).catch(() => undefined);
    }
    return {
      provider,
      status: "failed",
      recordsImported: 0,
      providerAccountId: providerAccountId || null,
      metrics: [],
      message,
    };
  }
};

const resolveResponseStatus = (results: ProviderImportResult[]): ImportResponseStatus => {
  if (results.every((result) => result.status === "not_configured")) return "not_configured";
  if (results.every((result) => result.status === "completed")) return "completed";
  if (results.some((result) => result.status === "completed")) return "partial";
  return "failed";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST for provider usage imports." });
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
    const canImport = await userHasPlatformRole(adminClient, authResult.user, ["owner", "operator"]);
    if (!canImport) {
      return json(403, { error: "not_authorized", message: "Active owner or operator role required to import provider usage." });
    }

    const payload = await req.json().catch(() => null) as ProviderUsageImportPayload | null;
    const parsed = parsePayload(payload);
    if ("error" in parsed) return parsed.error;

    const { provider, periodStart, periodEnd, dryRun } = parsed.value;
    const providers: ImportProvider[] = provider === "all_configured" ? ["cloudflare_r2", "hetzner_server"] : [provider];
    const results: ProviderImportResult[] = [];
    for (const targetProvider of providers) {
      results.push(await runProviderImport(adminClient, targetProvider, periodStart, periodEnd, dryRun));
    }

    const status = resolveResponseStatus(results);
    return json(status === "failed" ? 500 : 200, {
      status,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      dryRun,
      results,
      errors: results.filter((result) => result.status === "failed").map((result) => ({
        provider: result.provider,
        message: result.message ?? "Provider import failed.",
      })),
    });
  } catch (error) {
    return json(500, {
      error: "provider_usage_import_failed",
      message: sanitizeErrorMessage(error),
    });
  }
});
