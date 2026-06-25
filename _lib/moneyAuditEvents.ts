import {
  CONTENT_ACCESS_GRANTS_TABLE,
  CREATOR_CONTENT_PRICES_TABLE,
  CREATOR_EARNINGS_LEDGER_TABLE,
  CREATOR_PAYOUT_ACCOUNTS_TABLE,
  CREATOR_PAYOUT_AUDIT_LOG_TABLE,
  CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE,
  CREATOR_PAYOUT_PROVIDER_WEBHOOK_EVENTS_TABLE,
  CREATOR_PAYOUT_REQUESTS_TABLE,
  CREATOR_PRODUCTS_TABLE,
  CREATOR_PRODUCT_ORDERS_TABLE,
  CREATOR_REVENUE_SHARE_LEDGER_ENTRIES_TABLE,
  CREATOR_REVENUE_SOURCE_IMPORT_RECORDS_TABLE,
  CREATOR_TIP_TRANSACTIONS_TABLE,
  FRAUD_ACTION_RECORDS_TABLE,
  FRAUD_AUDIT_LOGS_TABLE,
  FRAUD_REVIEW_QUEUE_RECORDS_TABLE,
  MONETIZATION_AUDIT_LOG_TABLE,
  MONETIZATION_WEBHOOK_EVENTS_TABLE,
  PAID_CONTENT_PURCHASES_TABLE,
  PLATFORM_FINANCE_LEDGER_EVENTS_TABLE,
  PLATFORM_FRAUD_HOLDS_TABLE,
  SPONSOR_DISCLOSURE_RECORDS_TABLE,
  SPONSOR_PAYMENT_RECORDS_TABLE,
  SPONSOR_REVIEW_QUEUE_RECORDS_TABLE,
  SPONSOR_SAFETY_REVIEW_RECORDS_TABLE,
  type AdminFinanceReadModel,
} from "./platformFinance";
import {
  getMoneyFeatureStateLabel,
  type MoneyFeatureFlagSummaryRow,
  type PlatformMoneyKillSwitchAuditRow,
  type PlatformMoneyKillSwitchRow,
} from "./moneyFeatureFlags";
import {
  type ProviderReadinessSummaryRow,
} from "./providerReadiness";
import {
  type CreatorMonetizationFoundationSummary,
} from "./creatorMonetization";
import { supabase } from "./supabase";

export type MoneyAuditEnvironment = "production" | "sandbox" | "setup";

export type MoneyAuditCategory =
  | "blocked_actions"
  | "digital_sales"
  | "fraud_risk"
  | "kill_switches"
  | "ledger"
  | "merch"
  | "payouts"
  | "provider_readiness"
  | "revenue_imports"
  | "sponsors_ads"
  | "webhooks";

export type MoneyAuditDetailRow = {
  label: string;
  value: string;
};

export type MoneyAuditEvent = {
  id: string;
  title: string;
  summary: string;
  category: MoneyAuditCategory;
  sourceTable: string;
  sourceLabel: string;
  statusLabel: string;
  environment: MoneyAuditEnvironment;
  payable: boolean;
  actorLabel: string;
  actorUserId: string | null;
  targetUserId: string | null;
  creatorId: string | null;
  provider: string | null;
  capability: string | null;
  providerEventId: string | null;
  idempotencyLabel: string;
  reason: string;
  nextStep: string;
  createdAt: string | null;
  updatedAt: string | null;
  rowCount: number | null;
  badges: string[];
  detailRows: MoneyAuditDetailRow[];
};

export type MoneyAuditSourceRow = {
  id: string;
  table: string;
  sourceLabel: string;
  rowId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  status: string | null;
  eventType: string | null;
  actorUserId: string | null;
  targetUserId: string | null;
  creatorId: string | null;
  provider: string | null;
  capability: string | null;
  providerEventId: string | null;
  idempotencyKeyPresent: boolean;
  reason: string | null;
  environment: MoneyAuditEnvironment;
  safeMetadata: MoneyAuditDetailRow[];
};

type SourceRowsQuery = PromiseLike<{
  data: Record<string, unknown>[] | null;
  error: unknown;
}> & {
  eq: (column: string, value: string | number | boolean) => SourceRowsQuery;
  limit: (count: number) => SourceRowsQuery;
};

const sourceClient = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => SourceRowsQuery;
  };
};

const SOURCE_LABELS: Record<string, string> = {
  [PLATFORM_FINANCE_LEDGER_EVENTS_TABLE]: "Financial event",
  [CREATOR_REVENUE_SOURCE_IMPORT_RECORDS_TABLE]: "Revenue import readiness entry",
  [CREATOR_REVENUE_SHARE_LEDGER_ENTRIES_TABLE]: "Share ledger setup entry",
  [CREATOR_EARNINGS_LEDGER_TABLE]: "Creator earnings ledger entry",
  [CREATOR_PAYOUT_ACCOUNTS_TABLE]: "Payout account readiness entry",
  [CREATOR_PAYOUT_PROVIDER_WEBHOOK_EVENTS_TABLE]: "Payout provider webhook event",
  [CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE]: "Payout provider transfer entry",
  [CREATOR_PAYOUT_AUDIT_LOG_TABLE]: "Payout audit entry",
  [CREATOR_PAYOUT_REQUESTS_TABLE]: "Payout request entry",
  [CREATOR_CONTENT_PRICES_TABLE]: "Paid content setup entry",
  [PAID_CONTENT_PURCHASES_TABLE]: "Paid content purchase entry",
  [CONTENT_ACCESS_GRANTS_TABLE]: "Content access grant entry",
  [CREATOR_TIP_TRANSACTIONS_TABLE]: "Tip setup entry",
  [CREATOR_PRODUCTS_TABLE]: "Merch product setup entry",
  [CREATOR_PRODUCT_ORDERS_TABLE]: "Merch order entry",
  [MONETIZATION_WEBHOOK_EVENTS_TABLE]: "Digital provider webhook event",
  [MONETIZATION_AUDIT_LOG_TABLE]: "Creator monetization audit entry",
  [SPONSOR_REVIEW_QUEUE_RECORDS_TABLE]: "Sponsor review queue entry",
  [SPONSOR_DISCLOSURE_RECORDS_TABLE]: "Sponsor disclosure entry",
  [SPONSOR_SAFETY_REVIEW_RECORDS_TABLE]: "Sponsor safety review entry",
  [SPONSOR_PAYMENT_RECORDS_TABLE]: "Sponsor payment readiness entry",
  [FRAUD_REVIEW_QUEUE_RECORDS_TABLE]: "Fraud review queue entry",
  [FRAUD_ACTION_RECORDS_TABLE]: "Fraud action entry",
  [FRAUD_AUDIT_LOGS_TABLE]: "Fraud audit entry",
  [PLATFORM_FRAUD_HOLDS_TABLE]: "Payment risk hold entry",
};

const ADMIN_SOURCE_TABLES = [
  PLATFORM_FINANCE_LEDGER_EVENTS_TABLE,
  CREATOR_REVENUE_SOURCE_IMPORT_RECORDS_TABLE,
  CREATOR_REVENUE_SHARE_LEDGER_ENTRIES_TABLE,
  CREATOR_EARNINGS_LEDGER_TABLE,
  CREATOR_PAYOUT_ACCOUNTS_TABLE,
  CREATOR_PAYOUT_PROVIDER_WEBHOOK_EVENTS_TABLE,
  CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE,
  CREATOR_PAYOUT_AUDIT_LOG_TABLE,
  CREATOR_PAYOUT_REQUESTS_TABLE,
  CREATOR_CONTENT_PRICES_TABLE,
  PAID_CONTENT_PURCHASES_TABLE,
  CONTENT_ACCESS_GRANTS_TABLE,
  CREATOR_TIP_TRANSACTIONS_TABLE,
  CREATOR_PRODUCTS_TABLE,
  CREATOR_PRODUCT_ORDERS_TABLE,
  MONETIZATION_WEBHOOK_EVENTS_TABLE,
  MONETIZATION_AUDIT_LOG_TABLE,
  SPONSOR_REVIEW_QUEUE_RECORDS_TABLE,
  SPONSOR_DISCLOSURE_RECORDS_TABLE,
  SPONSOR_SAFETY_REVIEW_RECORDS_TABLE,
  SPONSOR_PAYMENT_RECORDS_TABLE,
  FRAUD_REVIEW_QUEUE_RECORDS_TABLE,
  FRAUD_ACTION_RECORDS_TABLE,
  FRAUD_AUDIT_LOGS_TABLE,
  PLATFORM_FRAUD_HOLDS_TABLE,
] as const;

const CREATOR_SOURCE_TABLES: readonly { table: string; creatorColumn: string }[] = [
  { table: CREATOR_CONTENT_PRICES_TABLE, creatorColumn: "creator_id" },
  { table: PAID_CONTENT_PURCHASES_TABLE, creatorColumn: "creator_id" },
  { table: CONTENT_ACCESS_GRANTS_TABLE, creatorColumn: "creator_id" },
  { table: CREATOR_TIP_TRANSACTIONS_TABLE, creatorColumn: "creator_id" },
  { table: CREATOR_EARNINGS_LEDGER_TABLE, creatorColumn: "creator_id" },
  { table: CREATOR_PAYOUT_REQUESTS_TABLE, creatorColumn: "creator_id" },
  { table: CREATOR_PRODUCTS_TABLE, creatorColumn: "creator_id" },
  { table: CREATOR_PRODUCT_ORDERS_TABLE, creatorColumn: "creator_id" },
];

const SENSITIVE_FIELD_PARTS = [
  "authorization",
  "client_secret",
  "payload",
  "private",
  "raw",
  "secret",
  "service_role",
  "signature",
  "token",
  "webhook_secret",
];

const SAFE_METADATA_FIELDS = [
  "status",
  "review_status",
  "execution_status",
  "provider",
  "provider_environment",
  "environment",
  "livemode",
  "capability",
  "event_type",
  "type",
  "reason",
  "failure_reason",
  "source",
  "source_type",
  "provider_event_id",
  "stripe_event_id",
  "revenuecat_event_id",
  "google_play_event_id",
  "created_at",
  "updated_at",
];

const BLOCKED_STATUSES = new Set(["blocked", "failed", "ignored", "not_executable", "needs_evidence_later"]);
const PAYABLE_STATUSES = new Set(["available", "paid", "payable", "eligible_for_payouts"]);

const toText = (value: unknown) => String(value ?? "").trim();

const compactText = (value: string | null | undefined, length = 96) => {
  const text = toText(value);
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length - 3)}...` : text;
};

const firstText = (row: Record<string, unknown>, candidates: readonly string[]) => {
  for (const key of candidates) {
    const value = toText(row[key]);
    if (value) return value;
  }
  return null;
};

const firstBoolean = (row: Record<string, unknown>, candidates: readonly string[]) => {
  for (const key of candidates) {
    if (typeof row[key] === "boolean") return row[key] as boolean;
  }
  return null;
};

const inferEnvironment = (row: Record<string, unknown>): MoneyAuditEnvironment => {
  const liveMode = firstBoolean(row, ["livemode", "live_mode", "is_live", "production"]);
  if (liveMode === true) return "production";
  if (liveMode === false) return "sandbox";
  const text = [
    firstText(row, ["environment", "provider_environment", "mode", "status", "review_status", "event_type", "source"]),
    firstText(row, ["provider_event_id", "stripe_event_id", "revenuecat_event_id", "google_play_event_id"]),
  ].filter(Boolean).join(" ").toLowerCase();
  if (text.includes("sandbox") || text.includes("test")) return "sandbox";
  if (text.includes("prod") || text.includes("live")) return "production";
  return "setup";
};

const eventCategoryForTable = (table: string): MoneyAuditCategory => {
  if (table === CREATOR_REVENUE_SOURCE_IMPORT_RECORDS_TABLE) return "revenue_imports";
  if (table === CREATOR_PAYOUT_ACCOUNTS_TABLE
    || table === CREATOR_PAYOUT_REQUESTS_TABLE
    || table === CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE
    || table === CREATOR_PAYOUT_AUDIT_LOG_TABLE) return "payouts";
  if (table === CREATOR_PAYOUT_PROVIDER_WEBHOOK_EVENTS_TABLE || table === MONETIZATION_WEBHOOK_EVENTS_TABLE) return "webhooks";
  if (table === CREATOR_CONTENT_PRICES_TABLE
    || table === PAID_CONTENT_PURCHASES_TABLE
    || table === CONTENT_ACCESS_GRANTS_TABLE
    || table === CREATOR_TIP_TRANSACTIONS_TABLE) return "digital_sales";
  if (table === CREATOR_PRODUCTS_TABLE || table === CREATOR_PRODUCT_ORDERS_TABLE) return "merch";
  if (table.startsWith("sponsor_")) return "sponsors_ads";
  if (table.includes("fraud") || table === PLATFORM_FRAUD_HOLDS_TABLE) return "fraud_risk";
  return "ledger";
};

const statusLabelForEvent = (environment: MoneyAuditEnvironment, status: string | null, payable: boolean) => {
  if (payable) return "Available";
  const normalized = toText(status).toLowerCase();
  if (environment === "sandbox") return "Sandbox only";
  if (BLOCKED_STATUSES.has(normalized)) return "Blocked";
  if (normalized.includes("disabled")) return "Disabled";
  if (normalized.includes("pending")) return "Pending setup";
  return "Setup only";
};

const payableForRow = (
  row: Record<string, unknown>,
  environment: MoneyAuditEnvironment,
  liveMoneyEnabled: boolean,
) => {
  if (!liveMoneyEnabled || environment !== "production") return false;
  const status = firstText(row, ["ledger_status", "status", "payout_status", "review_status"]);
  return PAYABLE_STATUSES.has(toText(status).toLowerCase());
};

const sourceRowFromRecord = (
  table: string,
  row: Record<string, unknown>,
  liveMoneyEnabled: boolean,
): MoneyAuditSourceRow | null => {
  const rowId = firstText(row, ["id", "event_id", "provider_event_id", "stripe_event_id"]);
  const createdAt = firstText(row, ["created_at", "createdAt", "received_at", "recorded_at"]);
  const updatedAt = firstText(row, ["updated_at", "updatedAt", "processed_at"]);
  const environment = inferEnvironment(row);
  const status = firstText(row, ["status", "ledger_status", "review_status", "execution_status", "payout_status"]);
  const eventType = firstText(row, ["event_type", "type", "action", "source_type"]);
  const provider = firstText(row, ["provider", "payment_provider", "rail", "source_provider"]);
  const capability = firstText(row, ["capability", "product_type", "feature_key", "switch_key"]);
  const providerEventId = firstText(row, ["provider_event_id", "stripe_event_id", "revenuecat_event_id", "google_play_event_id"]);
  const actorUserId = firstText(row, ["actor_user_id", "created_by", "updated_by", "reviewer_user_id", "user_id"]);
  const targetUserId = firstText(row, ["target_user_id", "user_id", "account_user_id"]);
  const creatorId = firstText(row, ["creator_id", "creator_user_id", "channel_user_id"]);
  const reason = firstText(row, ["reason", "failure_reason", "review_reason", "notes", "status_reason"]);
  const idempotencyKeyPresent = firstText(row, ["idempotency_key", "idempotencyKey", "dedupe_key", "provider_event_id"]) !== null;
  const safeMetadata = SAFE_METADATA_FIELDS
    .filter((key) => Object.prototype.hasOwnProperty.call(row, key))
    .filter((key) => !SENSITIVE_FIELD_PARTS.some((part) => key.toLowerCase().includes(part)) || key === "provider_event_id")
    .map((key) => ({ label: key, value: compactText(toText(row[key]), 160) }))
    .filter((entry) => entry.value.length > 0)
    .slice(0, 10);

  if (!rowId && !createdAt && !status && !eventType) return null;

  return {
    id: `${table}:${rowId || providerEventId || createdAt || eventType || status || "source-row"}`,
    table,
    sourceLabel: SOURCE_LABELS[table] ?? table,
    rowId,
    createdAt,
    updatedAt,
    status,
    eventType,
    actorUserId,
    targetUserId,
    creatorId,
    provider,
    capability,
    providerEventId,
    idempotencyKeyPresent,
    reason,
    environment,
    safeMetadata: [
      ...safeMetadata,
      { label: "payable", value: payableForRow(row, environment, liveMoneyEnabled) ? "Yes" : "No" },
    ],
  };
};

const readSourceRows = async (
  table: string,
  options: { creatorId?: string | null; creatorColumn?: string; liveMoneyEnabled?: boolean; limit?: number } = {},
) => {
  try {
    let query = sourceClient.from(table).select("*").limit(options.limit ?? 5);
    if (options.creatorId && options.creatorColumn) {
      query = query.eq(options.creatorColumn, options.creatorId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (Array.isArray(data) ? data : [])
      .map((row) => sourceRowFromRecord(table, row, options.liveMoneyEnabled === true))
      .filter((row): row is MoneyAuditSourceRow => row !== null)
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
  } catch {
    return [];
  }
};

export async function readAdminMoneyAuditSourceRows(liveMoneyEnabled = false): Promise<MoneyAuditSourceRow[]> {
  const rows = await Promise.all(
    ADMIN_SOURCE_TABLES.map((table) => readSourceRows(table, { liveMoneyEnabled, limit: 4 })),
  );
  return rows.flat().slice(0, 80);
}

export async function readCreatorMoneyAuditSourceRows(creatorId: string): Promise<MoneyAuditSourceRow[]> {
  if (!creatorId.trim()) return [];
  const rows = await Promise.all(
    CREATOR_SOURCE_TABLES.map((source) => readSourceRows(source.table, {
      creatorId,
      creatorColumn: source.creatorColumn,
      liveMoneyEnabled: false,
      limit: 4,
    })),
  );
  return rows.flat().slice(0, 32);
}

const eventFromSourceRow = (
  source: MoneyAuditSourceRow,
  options: { liveMoneyEnabled: boolean; creatorSafe?: boolean } = { liveMoneyEnabled: false },
): MoneyAuditEvent => {
  const payable = false;
  const sourceStatus = source.status || source.eventType || "setup";
  const statusLabel = statusLabelForEvent(source.environment, sourceStatus, payable);
  const category = eventCategoryForTable(source.table);
  const reason = source.reason
    || (source.environment === "sandbox"
      ? "Sandbox provider activity is not payable and cannot create a creator balance."
      : "Setup and readiness activity does not create a creator balance.");

  return {
    id: source.id,
    title: source.eventType ? `${source.sourceLabel}: ${source.eventType}` : source.sourceLabel,
    summary: `${statusLabel}. ${payable ? "Payable." : "Not payable."}`,
    category,
    sourceTable: source.table,
    sourceLabel: source.sourceLabel,
    statusLabel,
    environment: source.environment,
    payable,
    actorLabel: options.creatorSafe ? "Chi'llywood system" : source.actorUserId ? "Recorded actor" : "System/setup",
    actorUserId: options.creatorSafe ? null : source.actorUserId,
    targetUserId: options.creatorSafe ? null : source.targetUserId,
    creatorId: options.creatorSafe ? null : source.creatorId,
    provider: source.provider,
    capability: source.capability,
    providerEventId: options.creatorSafe ? (source.providerEventId ? "Recorded" : null) : source.providerEventId,
    idempotencyLabel: source.idempotencyKeyPresent ? "Duplicate-safe source recorded" : "No duplicate key returned",
    reason,
    nextStep: "Keep provider checks, safety switches, and ledger verification separate before any live-money lane.",
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    rowCount: null,
    badges: [
      source.environment === "sandbox" ? "Sandbox only" : source.environment === "production" ? "Production" : "Setup only",
      "Not payable",
    ],
    detailRows: [
      { label: "Source", value: source.sourceLabel },
      { label: "Table", value: source.table },
      { label: "Event id", value: source.rowId || "not returned" },
      { label: "Status", value: sourceStatus },
      { label: "Environment", value: source.environment },
      { label: "Payable", value: "No" },
      { label: "Provider", value: source.provider || "No provider" },
      { label: "Capability", value: source.capability || "not returned" },
      { label: "Provider event id", value: options.creatorSafe ? (source.providerEventId ? "Recorded" : "not returned") : (source.providerEventId || "not returned") },
      { label: "Idempotency", value: source.idempotencyKeyPresent ? "Duplicate-safe source recorded" : "No duplicate key returned" },
      { label: "Reason", value: reason },
      ...source.safeMetadata.filter((entry) => !options.creatorSafe || !entry.label.includes("user_id")),
    ],
  };
};

const eventFromCount = ({
  id,
  title,
  category,
  sourceTable,
  count,
  generatedAt,
  environment = "setup",
  reason,
  nextStep,
}: {
  id: string;
  title: string;
  category: MoneyAuditCategory;
  sourceTable: string;
  count: number | null;
  generatedAt: string;
  environment?: MoneyAuditEnvironment;
  reason: string;
  nextStep: string;
}): MoneyAuditEvent => {
  const countLabel = count === null ? "Source not connected" : `${count} ${count === 1 ? "entry" : "entries"}`;
  const statusLabel = environment === "sandbox" ? "Sandbox only" : count && count > 0 ? "Setup only" : "No payable balance";
  return {
    id,
    title,
    summary: `${countLabel}. Not payable.`,
    category,
    sourceTable,
    sourceLabel: SOURCE_LABELS[sourceTable] ?? sourceTable,
    statusLabel,
    environment,
    payable: false,
    actorLabel: "System/setup",
    actorUserId: null,
    targetUserId: null,
    creatorId: null,
    provider: null,
    capability: null,
    providerEventId: null,
    idempotencyLabel: "Count summary only",
    reason,
    nextStep,
    createdAt: generatedAt,
    updatedAt: null,
    rowCount: count,
    badges: [
      environment === "sandbox" ? "Sandbox only" : "Setup only",
      "Not payable",
    ],
    detailRows: [
      { label: "Source", value: SOURCE_LABELS[sourceTable] ?? sourceTable },
      { label: "Table", value: sourceTable },
      { label: "Rows", value: countLabel },
      { label: "Environment", value: environment },
      { label: "Payable", value: "No" },
      { label: "Reason", value: reason },
      { label: "Next step", value: nextStep },
    ],
  };
};

export function buildCreatorMoneyAuditEvents({
  summary,
  sourceRows,
  providerRows,
  moneyFlags,
  generatedAt,
}: {
  summary: CreatorMonetizationFoundationSummary | null;
  sourceRows: readonly MoneyAuditSourceRow[];
  providerRows: readonly ProviderReadinessSummaryRow[];
  moneyFlags: readonly MoneyFeatureFlagSummaryRow[];
  generatedAt: string;
}): MoneyAuditEvent[] {
  const events = sourceRows.map((row) => eventFromSourceRow(row, { liveMoneyEnabled: false, creatorSafe: true }));
  const sourceTables = new Set(sourceRows.map((row) => row.table));
  const liveMoneyOn = moneyFlags.find((row) => row.key === "live_money_enabled")?.state === "on";
  const addCreatorCount = (
    sourceTable: string,
    count: number | null | undefined,
    title: string,
    category: MoneyAuditCategory,
    reason: string,
  ) => {
    if (sourceTables.has(sourceTable)) return;
    events.push(eventFromCount({
      id: `creator-count:${sourceTable}`,
      title,
      category,
      sourceTable,
      count: count ?? null,
      generatedAt,
      reason,
      nextStep: "Use provider checks and verified production ledger entries before any payable balance can appear.",
    }));
  };

  addCreatorCount(CREATOR_EARNINGS_LEDGER_TABLE, summary?.ledgerRows, "Creator balance detail", "ledger", "No verified production ledger amount is available to show.");
  addCreatorCount(CREATOR_PAYOUT_REQUESTS_TABLE, summary?.payoutRequestRows, "Payout request detail", "payouts", "Payout requests are not withdrawable while payouts and live money are off.");
  addCreatorCount(CREATOR_TIP_TRANSACTIONS_TABLE, summary?.tipRows, "Tips setup detail", "digital_sales", "Tips are setup/planned only until store/provider products are proven.");
  addCreatorCount(CREATOR_CONTENT_PRICES_TABLE, summary?.pricingRows, "Paid content setup detail", "digital_sales", "Paid content setup does not unlock checkout or access.");
  addCreatorCount(CREATOR_PRODUCTS_TABLE, summary?.productRows, "Merch setup detail", "merch", "Merch setup is physical-goods planning and does not create digital access.");

  providerRows.forEach((row) => {
    const label = row.status === "sandbox_ready"
      ? "Sandbox only"
      : row.status === "active" && !liveMoneyOn
        ? "Ready for review"
        : row.displayLabel || "Setup needed";
    events.push({
      id: `creator-provider:${row.provider}:${row.capability}`,
      title: `${label}: ${row.provider}`,
      summary: `${label}. Not payable.`,
      category: "provider_readiness",
      sourceTable: "get_provider_readiness_summary",
      sourceLabel: "Provider readiness",
      statusLabel: label,
      environment: row.status === "sandbox_ready" ? "sandbox" : row.status === "active" ? "production" : "setup",
      payable: false,
      actorLabel: "Provider readiness check",
      actorUserId: null,
      targetUserId: null,
      creatorId: null,
      provider: row.provider,
      capability: row.capability,
      providerEventId: null,
      idempotencyLabel: "Readiness summary only",
      reason: row.status === "active" && !liveMoneyOn
        ? "Provider checks may be active, but live money is still off and this does not create a payable balance."
        : row.displaySummary || "Provider checks are the source of readiness truth.",
      nextStep: row.nextStep || "Complete provider checks before activation.",
      createdAt: row.lastCheckedAt || generatedAt,
      updatedAt: row.lastCheckedAt,
      rowCount: null,
      badges: [
        row.status === "sandbox_ready" ? "Sandbox only" : row.status === "active" ? "Production status" : "Setup only",
        "Not payable",
      ],
      detailRows: [
        { label: "Provider", value: row.provider },
        { label: "Capability", value: row.capability },
        { label: "Status", value: row.status },
        { label: "Environment", value: row.status === "sandbox_ready" ? "sandbox" : row.status === "active" ? "production" : "setup" },
        { label: "Live money allowed", value: row.isLiveMoneyEnabled && liveMoneyOn ? "Provider says yes; action guards still required" : "No" },
        { label: "Payable", value: "No" },
        { label: "Next step", value: row.nextStep || "Complete provider checks before activation." },
      ],
    });
  });

  moneyFlags
    .filter((row) => ["live_money_enabled", "payouts_enabled", "digital_sales_enabled", "provider_webhooks_enabled"].includes(row.key))
    .forEach((row) => {
      events.push({
        id: `creator-switch:${row.key}`,
        title: row.key === "live_money_enabled" ? "Live money lock" : row.displayLabel,
        summary: `${getMoneyFeatureStateLabel(row.state)}. Not payable.`,
        category: row.key === "payouts_enabled" ? "payouts" : row.key === "provider_webhooks_enabled" ? "webhooks" : "kill_switches",
        sourceTable: "get_money_feature_flag_summary",
        sourceLabel: "Money feature flag",
        statusLabel: row.state === "sandbox_only" ? "Sandbox only" : getMoneyFeatureStateLabel(row.state),
        environment: row.state === "sandbox_only" ? "sandbox" : "setup",
        payable: false,
        actorLabel: "Owner/Admin controls",
        actorUserId: null,
        targetUserId: null,
        creatorId: null,
        provider: null,
        capability: row.key,
        providerEventId: null,
        idempotencyLabel: "Switch state only",
        reason: row.displaySummary || "Turned off by owner.",
        nextStep: "Provider readiness and owner/admin switches must both allow the capability.",
        createdAt: row.updatedAt || generatedAt,
        updatedAt: row.updatedAt,
        rowCount: null,
        badges: [
          row.state === "sandbox_only" ? "Sandbox only" : "Setup only",
          "Not payable",
        ],
        detailRows: [
          { label: "Switch", value: row.key },
          { label: "State", value: row.state },
          { label: "Payable", value: "No" },
          { label: "Reason", value: row.displaySummary || "Turned off by owner." },
        ],
      });
    });

  return events.slice(0, 40);
}

export function buildAdminMoneyAuditEvents({
  readModel,
  sourceRows,
  providerRows,
  moneySwitches,
  moneySwitchAuditRows,
}: {
  readModel: AdminFinanceReadModel & { loading?: boolean };
  sourceRows: readonly MoneyAuditSourceRow[];
  providerRows: readonly ProviderReadinessSummaryRow[];
  moneySwitches: readonly PlatformMoneyKillSwitchRow[];
  moneySwitchAuditRows: readonly PlatformMoneyKillSwitchAuditRow[];
}): MoneyAuditEvent[] {
  const liveMoneyEnabled = moneySwitches.find((row) => row.key === "live_money_enabled")?.state === "on";
  const events = sourceRows.map((row) => eventFromSourceRow(row, { liveMoneyEnabled }));
  const sourceTables = new Set(sourceRows.map((row) => row.table));
  const addCountFallback = (
    sourceTable: string,
    count: number | null,
    title: string,
    category: MoneyAuditCategory,
    reason: string,
    environment: MoneyAuditEnvironment = "setup",
  ) => {
    if (sourceTables.has(sourceTable) || count === 0) return;
    events.push(eventFromCount({
      id: `admin-count:${sourceTable}`,
      title,
      category,
      sourceTable,
      count,
      generatedAt: readModel.generatedAt,
      environment,
      reason,
      nextStep: "Use source entries, provider checks, and audited switches before any production money action.",
    }));
  };

  addCountFallback(PLATFORM_FINANCE_LEDGER_EVENTS_TABLE, readModel.financeLedgerEventCount, "Financial events", "ledger", "Financial event entries are setup/readiness only until provider-backed production ledger checks pass.");
  addCountFallback(CREATOR_REVENUE_SOURCE_IMPORT_RECORDS_TABLE, readModel.creatorRevenueSourceImportRecordCount, "Revenue imports", "revenue_imports", "Revenue imports are not connected to production money yet.");
  addCountFallback(CREATOR_REVENUE_SHARE_LEDGER_ENTRIES_TABLE, readModel.creatorRevenueShareLedgerEntryCount, "Share ledger", "ledger", "Share ledger entries are not payable without verified production source revenue.");
  addCountFallback(CREATOR_EARNINGS_LEDGER_TABLE, readModel.creatorEarningsLedgerCount, "Creator earnings ledger", "ledger", "Creator earnings entries must be verified before any balance is payable.");
  addCountFallback(CREATOR_PAYOUT_PROVIDER_WEBHOOK_EVENTS_TABLE, readModel.creatorPayoutProviderWebhookEventCount, "Payout provider webhook events", "webhooks", "Sandbox/test webhook entries are readiness-only and do not release payouts.", "sandbox");
  addCountFallback(MONETIZATION_WEBHOOK_EVENTS_TABLE, readModel.monetizationWebhookEventCount, "Digital provider webhook events", "webhooks", "Digital provider webhooks cannot activate live money while switches are off.", "sandbox");
  addCountFallback(SPONSOR_REVIEW_QUEUE_RECORDS_TABLE, readModel.sponsorReviewQueueRecordCount, "Sponsor review queue", "sponsors_ads", "Sponsor review queue entries are review/setup only.");
  addCountFallback(SPONSOR_PAYMENT_RECORDS_TABLE, readModel.sponsorPaymentRecordCount, "Sponsor payment readiness", "sponsors_ads", "Sponsor payment entries do not create brand charge or creator split.");
  addCountFallback(FRAUD_REVIEW_QUEUE_RECORDS_TABLE, readModel.fraudReviewQueueRecordCount, "Fraud review queue", "fraud_risk", "Fraud review entries are setup-only and do not clear or block money automatically.");
  addCountFallback(PLATFORM_FRAUD_HOLDS_TABLE, readModel.platformFraudHoldCount, "Payment risk holds", "fraud_risk", "Risk hold entries do not pause payouts unless a future enforcement action applies them.");

  providerRows.forEach((row) => {
    const environment: MoneyAuditEnvironment = row.status === "sandbox_ready" ? "sandbox" : row.status === "active" ? "production" : "setup";
    events.push({
      id: `admin-provider:${row.provider}:${row.capability}`,
      title: `${row.provider} / ${row.capability}`,
      summary: `${row.displayLabel}. ${row.isLiveMoneyEnabled && liveMoneyEnabled ? "Capability still requires action guards." : "Not payable."}`,
      category: "provider_readiness",
      sourceTable: "get_provider_readiness_summary",
      sourceLabel: "Provider readiness",
      statusLabel: environment === "sandbox" ? "Sandbox only" : row.displayLabel,
      environment,
      payable: false,
      actorLabel: "Provider readiness check",
      actorUserId: null,
      targetUserId: null,
      creatorId: null,
      provider: row.provider,
      capability: row.capability,
      providerEventId: null,
      idempotencyLabel: "Readiness summary only",
      reason: row.displaySummary || "Provider readiness remains source of truth.",
      nextStep: row.nextStep || "Complete provider checks before activation.",
      createdAt: row.lastCheckedAt || readModel.generatedAt,
      updatedAt: row.lastCheckedAt,
      rowCount: null,
      badges: [
        environment === "sandbox" ? "Sandbox only" : environment === "production" ? "Production readiness" : "Setup only",
        "Not payable",
      ],
      detailRows: [
        { label: "Provider", value: row.provider },
        { label: "Capability", value: row.capability },
        { label: "Status", value: row.status },
        { label: "Environment", value: environment },
        { label: "Proof source", value: "get_provider_readiness_summary" },
        { label: "Live money allowed", value: row.isLiveMoneyEnabled && liveMoneyEnabled ? "Provider and global switch allow; action guards still required" : "No" },
        { label: "Blocked by live_money_enabled", value: liveMoneyEnabled ? "No" : "Yes" },
        { label: "Next step", value: row.nextStep || "Complete provider checks before activation." },
      ],
    });
  });

  moneySwitches.forEach((row) => {
    events.push({
      id: `admin-switch:${row.key}`,
      title: row.displayLabel,
      summary: `${getMoneyFeatureStateLabel(row.state)}. Current enforced switch state.`,
      category: "kill_switches",
      sourceTable: "platform_money_kill_switches",
      sourceLabel: "Money kill switch",
      statusLabel: row.state === "sandbox_only" ? "Sandbox only" : getMoneyFeatureStateLabel(row.state),
      environment: row.state === "sandbox_only" ? "sandbox" : "setup",
      payable: false,
      actorLabel: row.updatedBy ? "Last updated by user" : "System/default",
      actorUserId: row.updatedBy,
      targetUserId: null,
      creatorId: null,
      provider: null,
      capability: row.key,
      providerEventId: null,
      idempotencyLabel: "Switch state only",
      reason: row.reason || row.latestAuditReason || "No reason returned.",
      nextStep: "Use the audited state-change flow for any switch change.",
      createdAt: row.updatedAt || row.createdAt || readModel.generatedAt,
      updatedAt: row.updatedAt,
      rowCount: null,
      badges: [
        row.state === "sandbox_only" ? "Sandbox only" : "Control plane",
        "Not payable",
      ],
      detailRows: [
        { label: "Switch", value: row.key },
        { label: "Current state", value: row.state },
        { label: "Last changed by", value: row.updatedBy || "not returned" },
        { label: "Last changed at", value: row.updatedAt || "not returned" },
        { label: "Reason", value: row.reason || "No reason returned." },
        { label: "Latest audit reason", value: row.latestAuditReason || "No audit reason returned." },
      ],
    });
  });

  moneySwitchAuditRows.forEach((row) => {
    events.push({
      id: `admin-switch-audit:${row.id}`,
      title: `${row.switchKey} switch audit`,
      summary: `${row.oldState ?? "unset"} -> ${row.newState}. Not payable.`,
      category: "kill_switches",
      sourceTable: "platform_money_kill_switch_audit",
      sourceLabel: "Kill switch audit",
      statusLabel: row.newState === "sandbox_only" ? "Sandbox only" : "Audit entry",
      environment: row.newState === "sandbox_only" ? "sandbox" : "setup",
      payable: false,
      actorLabel: row.actorUserId ? "Admin actor" : "System/default",
      actorUserId: row.actorUserId,
      targetUserId: null,
      creatorId: null,
      provider: null,
      capability: row.switchKey,
      providerEventId: null,
      idempotencyLabel: "Immutable audit entry",
      reason: row.reason,
      nextStep: "Review switch history before enabling any high-risk capability.",
      createdAt: row.createdAt || readModel.generatedAt,
      updatedAt: null,
      rowCount: null,
      badges: ["Audit", "Not payable"],
      detailRows: [
        { label: "Audit id", value: row.id },
        { label: "Switch", value: row.switchKey },
        { label: "Old state", value: row.oldState ?? "unset" },
        { label: "New state", value: row.newState },
        { label: "Actor user id", value: row.actorUserId || "not returned" },
        { label: "Reason", value: row.reason },
      ],
    });
  });

  if (!liveMoneyEnabled) {
    events.unshift({
      id: "admin-blocked-live-money",
      title: "Live money blocked",
      summary: "live_money_enabled is off. No live checkout, balance release, payout, transfer, or withdrawal can be treated as active.",
      category: "blocked_actions",
      sourceTable: "platform_money_kill_switches",
      sourceLabel: "Live money kill switch",
      statusLabel: "Disabled",
      environment: "setup",
      payable: false,
      actorLabel: "Owner/Admin controls",
      actorUserId: null,
      targetUserId: null,
      creatorId: null,
      provider: null,
      capability: "live_money_enabled",
      providerEventId: null,
      idempotencyLabel: "Global block",
      reason: "Global live-money switch remains off.",
      nextStep: "Keep sandbox and setup checks separate from production money activation.",
      createdAt: readModel.generatedAt,
      updatedAt: null,
      rowCount: null,
      badges: ["Blocked", "Not payable"],
      detailRows: [
        { label: "Switch", value: "live_money_enabled" },
        { label: "State", value: "off" },
        { label: "Payable", value: "No" },
        { label: "Blocked actions", value: "checkout, payout release, transfer, withdrawal, cash-out, payable balance" },
      ],
    });
  }

  return events
    .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""))
    .slice(0, 140);
}
