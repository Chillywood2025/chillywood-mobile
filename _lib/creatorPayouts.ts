import { supabase } from "./supabase";

export const CREATOR_PAYOUT_LEDGER_ENTRIES_TABLE = "creator_payout_ledger_entries";

export type CreatorPayoutSetupRequirement = {
  label: string;
  value: string;
};

export type CreatorPayoutLedgerFoundationRow = {
  id: string;
  status: string;
  statusLabel: string;
  entryType: string;
  entryTypeLabel: string;
  amountMinor: number;
  currency: string;
  createdAt: string | null;
  holdUntil: string | null;
  holdReason: string | null;
  foundationOnly: boolean;
  notPayable: true;
};

export type CreatorPayoutDashboardReadModel = {
  status: "not_active";
  setupStatus: "not_active";
  ledgerConnected: boolean;
  ledgerRowCount: number | null;
  latestRows: CreatorPayoutLedgerFoundationRow[];
  generatedAt: string;
};

type CreatorPayoutLedgerDbRow = {
  id?: number | string | null;
  entry_type?: string | null;
  amount_minor?: number | null;
  currency?: string | null;
  status?: string | null;
  hold_reason?: string | null;
  hold_until?: string | null;
  created_at?: string | null;
  metadata?: unknown;
};

type CreatorPayoutQueryResult = {
  data: CreatorPayoutLedgerDbRow[] | null;
  count: number | null;
  error: unknown;
};

type CreatorPayoutLimitBuilder = PromiseLike<CreatorPayoutQueryResult>;

type CreatorPayoutOrderBuilder = {
  limit: (limit: number) => CreatorPayoutLimitBuilder;
};

type CreatorPayoutFilterBuilder = {
  order: (column: string, options?: { ascending?: boolean }) => CreatorPayoutOrderBuilder;
};

type CreatorPayoutSelectBuilder = {
  eq: (column: string, value: string) => CreatorPayoutFilterBuilder;
};

const payoutClient = supabase as unknown as {
  from: (table: string) => {
    select: (
      columns: string,
      options?: { count?: "exact" },
    ) => CreatorPayoutSelectBuilder;
  };
};

export const CREATOR_PAYOUT_REQUIREMENTS: readonly CreatorPayoutSetupRequirement[] = [
  { label: "Payout provider", value: "Stripe Connect later" },
  { label: "KYC", value: "Not connected yet" },
  { label: "Tax forms", value: "Not connected yet" },
  { label: "Payout account", value: "Not connected yet" },
  { label: "Fraud review", value: "Required before release" },
  { label: "Hold period", value: "7–30 days" },
  { label: "Minimum payout", value: "Undecided" },
];

const normalizePositiveLimit = (value: unknown, fallback: number, max: number) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(normalized)));
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const normalizeAmountMinor = (value: unknown) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return 0;
  return Math.floor(normalized);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

export const formatCreatorPayoutLedgerCount = (value: number | null) => {
  if (value === null) return "Not connected";
  return `${value} ${value === 1 ? "foundation row" : "foundation rows"}`;
};

export const formatCreatorPayoutFoundationAmount = (amountMinor: number, currency: string) => {
  const code = String(currency || "usd").trim().toUpperCase();
  return `${code} ${(Math.max(0, amountMinor) / 100).toFixed(2)}`;
};

const formatEntryTypeLabel = (value: string) => {
  switch (value) {
    case "hold":
      return "Hold foundation record";
    case "release":
      return "Release foundation record";
    case "payout":
      return "Payout foundation record";
    case "reversal":
      return "Reversal foundation record";
    case "adjustment":
      return "Adjustment foundation record";
    default:
      return "Foundation ledger record";
  }
};

const formatStatusLabel = (value: string) => {
  switch (value) {
    case "pending":
      return "Pending foundation record";
    case "held":
      return "Held foundation record";
    case "available":
      return "Foundation record";
    case "scheduled":
      return "Scheduled foundation record";
    case "paid":
      return "Read-only historical record";
    case "canceled":
      return "Canceled foundation record";
    case "reversed":
      return "Reversed foundation record";
    default:
      return value ? value.replaceAll("_", " ") : "Foundation record";
  }
};

const toCreatorPayoutLedgerRow = (row: CreatorPayoutLedgerDbRow): CreatorPayoutLedgerFoundationRow | null => {
  const id = normalizeText(row.id);
  if (!id) return null;

  const entryType = normalizeText(row.entry_type) ?? "payable";
  const status = normalizeText(row.status) ?? "pending";
  const currency = normalizeText(row.currency) ?? "usd";
  const metadata = isPlainObject(row.metadata) ? row.metadata : {};

  return {
    id,
    status,
    statusLabel: formatStatusLabel(status),
    entryType,
    entryTypeLabel: formatEntryTypeLabel(entryType),
    amountMinor: normalizeAmountMinor(row.amount_minor),
    currency,
    createdAt: normalizeText(row.created_at),
    holdUntil: normalizeText(row.hold_until),
    holdReason: normalizeText(row.hold_reason),
    foundationOnly:
      metadata.creator_payout_dashboard_proof === true
      || metadata.finance_foundation_proof === true
      || metadata.foundation_only === true
      || metadata.not_live_money === true,
    notPayable: true,
  };
};

export function createEmptyCreatorPayoutDashboardReadModel(): CreatorPayoutDashboardReadModel {
  return {
    status: "not_active",
    setupStatus: "not_active",
    ledgerConnected: false,
    ledgerRowCount: null,
    latestRows: [],
    generatedAt: new Date().toISOString(),
  };
}

export async function readCreatorPayoutDashboardSummary(options: {
  creatorUserId: string | null | undefined;
  limit?: number;
}): Promise<CreatorPayoutDashboardReadModel> {
  const creatorUserId = String(options.creatorUserId ?? "").trim();
  const limit = normalizePositiveLimit(options.limit, 5, 12);

  if (!creatorUserId) {
    return createEmptyCreatorPayoutDashboardReadModel();
  }

  try {
    const { data, count, error } = await payoutClient
      .from(CREATOR_PAYOUT_LEDGER_ENTRIES_TABLE)
      .select(
        "id,entry_type,amount_minor,currency,status,hold_reason,hold_until,created_at,metadata",
        { count: "exact" },
      )
      .eq("creator_user_id", creatorUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const latestRows = (data ?? [])
      .map(toCreatorPayoutLedgerRow)
      .filter((row): row is CreatorPayoutLedgerFoundationRow => !!row);

    return {
      status: "not_active",
      setupStatus: "not_active",
      ledgerConnected: true,
      ledgerRowCount: Number(count ?? latestRows.length),
      latestRows,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return createEmptyCreatorPayoutDashboardReadModel();
  }
}
