import { supabase } from "./supabase";

export type ProviderReadinessStatus =
  | "missing"
  | "setup_needed"
  | "configured"
  | "ready_for_review"
  | "sandbox_ready"
  | "active"
  | "disabled"
  | "blocked"
  | "error";

export type ProviderReadinessProvider =
  | "revenuecat"
  | "google_play"
  | "stripe"
  | "stripe_connect"
  | "stripe_webhook"
  | "ads"
  | "internal_policy";

export type ProviderReadinessCapability =
  | "premium_entitlement"
  | "google_play_subscription_product"
  | "revenuecat_offering"
  | "revenuecat_entitlement"
  | "stripe_connect_account"
  | "stripe_webhook_signature"
  | "payout_setup"
  | "payout_release"
  | "creator_revenue_imports"
  | "tips"
  | "paid_content"
  | "platform_commerce"
  | "ad_revenue"
  | "creator_monetization_policy";

export type ProviderReadinessSummaryRow = {
  provider: ProviderReadinessProvider;
  capability: ProviderReadinessCapability;
  status: ProviderReadinessStatus;
  displayLabel: string;
  displaySummary: string;
  nextStep: string;
  lastCheckedAt: string | null;
  isLiveMoneyEnabled: boolean;
  publicSafe: boolean;
};

type ProviderReadinessDbRow = {
  provider?: unknown;
  capability?: unknown;
  status?: unknown;
  display_label?: unknown;
  display_summary?: unknown;
  next_step?: unknown;
  last_checked_at?: unknown;
  is_live_money_enabled?: unknown;
  public_safe?: unknown;
};

type ProviderReadinessRpcResult<T> = {
  data: T | null;
  error: unknown;
};

const providerReadinessClient = supabase as unknown as {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<ProviderReadinessRpcResult<T>>;
};

const PROVIDERS = new Set<ProviderReadinessProvider>([
  "revenuecat",
  "google_play",
  "stripe",
  "stripe_connect",
  "stripe_webhook",
  "ads",
  "internal_policy",
]);

const CAPABILITIES = new Set<ProviderReadinessCapability>([
  "premium_entitlement",
  "google_play_subscription_product",
  "revenuecat_offering",
  "revenuecat_entitlement",
  "stripe_connect_account",
  "stripe_webhook_signature",
  "payout_setup",
  "payout_release",
  "creator_revenue_imports",
  "tips",
  "paid_content",
  "platform_commerce",
  "ad_revenue",
  "creator_monetization_policy",
]);

const STATUSES = new Set<ProviderReadinessStatus>([
  "missing",
  "setup_needed",
  "configured",
  "ready_for_review",
  "sandbox_ready",
  "active",
  "disabled",
  "blocked",
  "error",
]);

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeProvider = (value: unknown): ProviderReadinessProvider | null => {
  const text = normalizeText(value) as ProviderReadinessProvider;
  return PROVIDERS.has(text) ? text : null;
};

const normalizeCapability = (value: unknown): ProviderReadinessCapability | null => {
  const text = normalizeText(value) as ProviderReadinessCapability;
  return CAPABILITIES.has(text) ? text : null;
};

const normalizeStatus = (value: unknown): ProviderReadinessStatus => {
  const text = normalizeText(value) as ProviderReadinessStatus;
  return STATUSES.has(text) ? text : "setup_needed";
};

export const getProviderReadinessFallbackSummary = (): ProviderReadinessSummaryRow[] => [
  {
    provider: "internal_policy",
    capability: "creator_monetization_policy",
    status: "setup_needed",
    displayLabel: "Setup needed",
    displaySummary: "Money tools stay locked until server-side readiness can be checked.",
    nextStep: "Reconnect and check readiness again.",
    lastCheckedAt: null,
    isLiveMoneyEnabled: false,
    publicSafe: true,
  },
  {
    provider: "stripe_connect",
    capability: "payout_release",
    status: "disabled",
    displayLabel: "Not active yet",
    displaySummary: "Payout release stays disabled while readiness cannot be checked.",
    nextStep: "Link providers and finish checks before enabling.",
    lastCheckedAt: null,
    isLiveMoneyEnabled: false,
    publicSafe: true,
  },
];

const toSummaryRow = (row: ProviderReadinessDbRow): ProviderReadinessSummaryRow | null => {
  const provider = normalizeProvider(row.provider);
  const capability = normalizeCapability(row.capability);
  if (!provider || !capability) return null;

  return {
    provider,
    capability,
    status: normalizeStatus(row.status),
    displayLabel: normalizeText(row.display_label) || "Setup needed",
    displaySummary: normalizeText(row.display_summary) || "Setup checks are not active yet.",
    nextStep: normalizeText(row.next_step) || "Add provider setup before review.",
    lastCheckedAt: normalizeText(row.last_checked_at) || null,
    isLiveMoneyEnabled: row.is_live_money_enabled === true,
    publicSafe: row.public_safe !== false,
  };
};

export async function readProviderReadinessSummary(): Promise<ProviderReadinessSummaryRow[]> {
  try {
    const { data, error } = await providerReadinessClient.rpc<ProviderReadinessDbRow[]>(
      "get_provider_readiness_summary",
    );
    if (error) throw error;

    const rows = (Array.isArray(data) ? data : [])
      .map(toSummaryRow)
      .filter((row): row is ProviderReadinessSummaryRow => !!row)
      .filter((row) => row.publicSafe);

    return rows.length ? rows : getProviderReadinessFallbackSummary();
  } catch {
    return getProviderReadinessFallbackSummary();
  }
}

export const findProviderReadinessSummary = (
  rows: readonly ProviderReadinessSummaryRow[],
  provider: ProviderReadinessProvider,
  capability: ProviderReadinessCapability,
) => rows.find((row) => row.provider === provider && row.capability === capability) ?? null;

export const getCreatorReadinessLabel = (row: ProviderReadinessSummaryRow | null | undefined, fallback = "Setup needed") => {
  if (!row) return fallback;
  if (row.status === "configured") return "Ready for review";
  if (row.status === "sandbox_ready") return "Ready for review";
  return row.displayLabel || fallback;
};

export const getProviderReadinessTone = (
  row: ProviderReadinessSummaryRow | null | undefined,
): "default" | "unavailable" => {
  if (!row) return "unavailable";
  if (row.status === "active" || row.status === "configured" || row.status === "ready_for_review" || row.status === "sandbox_ready") {
    return "default";
  }
  return "unavailable";
};

export const summarizeProviderReadiness = (
  row: ProviderReadinessSummaryRow | null | undefined,
  fallback = "Setup checks are not active yet.",
) => row?.displaySummary || fallback;
