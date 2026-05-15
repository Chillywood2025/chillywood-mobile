import { supabase } from "./supabase";

export const CREATOR_MONETIZATION_SETTINGS_TABLE = "monetization_system_settings";
export const CREATOR_MONETIZATION_PROFILES_TABLE = "creator_monetization_profiles";
export const CREATOR_CONTENT_PRICES_TABLE = "creator_content_prices";
export const PAID_CONTENT_PURCHASES_TABLE = "paid_content_purchases";
export const CONTENT_ACCESS_GRANTS_TABLE = "content_access_grants";
export const CREATOR_PRODUCTS_TABLE = "creator_products";
export const CREATOR_PRODUCT_ORDERS_TABLE = "creator_product_orders";
export const CREATOR_TIP_TRANSACTIONS_TABLE = "creator_tip_transactions";
export const CREATOR_EARNINGS_LEDGER_TABLE = "creator_earnings_ledger";
export const CREATOR_PAYOUT_REQUESTS_TABLE = "creator_payout_requests";
export const MONETIZATION_WEBHOOK_EVENTS_TABLE = "monetization_webhook_events";
export const MONETIZATION_AUDIT_LOG_TABLE = "monetization_audit_log";

export const CREATOR_PAID_CONTENT_CREATOR_SHARE_BPS = 8000;
export const CREATOR_PAID_CONTENT_PLATFORM_SHARE_BPS = 2000;
export const CREATOR_TIP_CREATOR_SHARE_BPS = 10000;
export const CREATOR_INSTANT_CASHOUT_FEE_BPS = 150;
export const CREATOR_INSTANT_CASHOUT_FEE_CAP_CENTS: number | null = null;
export const CREATOR_PAYOUT_HOLD_DAYS_MIN = 7;
export const CREATOR_PAYOUT_HOLD_DAYS_MAX = 30;
export const PREMIUM_SUBSCRIPTION_PRICE_LABEL = "$9.99/month";
export const PREMIUM_REVENUE_OWNER = "platform";
export const PREMIUM_ENTITLEMENT_KEY = "premium";
export const PREMIUM_PRODUCT_ID = "premium_subscription";

export type MonetizationFoundationStatus = "connected" | "not_connected" | "blocked" | "disabled";

export type CreatorMonetizationRuntimeFlags = {
  premiumPurchaseEnabled: boolean;
  paidContentCheckoutEnabled: boolean;
  creatorPricingEnabled: boolean;
  tipsEnabled: boolean;
  merchStoreEnabled: boolean;
  cashoutEnabled: boolean;
  payoutsEnabled: boolean;
  stripeConnectProductionEnabled: boolean;
  liveMoneyEnabled: boolean;
};

export type CreatorEarningsLedgerStatus = "pending" | "held" | "available" | "paid" | "reversed";

export type CreatorEarningsLedgerEntry = {
  ledgerStatus: CreatorEarningsLedgerStatus;
  netCreatorAmountCents: number;
};

export type CreatorEarningsBalances = {
  pendingCents: number;
  heldCents: number;
  availableCents: number;
  paidCents: number;
  reversedCents: number;
};

export type CreatorMonetizationFoundationSummary = {
  status: MonetizationFoundationStatus;
  settings: CreatorMonetizationRuntimeFlags;
  pricingRows: number | null;
  productRows: number | null;
  tipRows: number | null;
  ledgerRows: number | null;
  payoutRequestRows: number | null;
  webhookRows: number | null;
  generatedAt: string;
};

export const DEFAULT_CREATOR_MONETIZATION_RUNTIME_FLAGS: CreatorMonetizationRuntimeFlags = {
  premiumPurchaseEnabled: false,
  paidContentCheckoutEnabled: false,
  creatorPricingEnabled: false,
  tipsEnabled: false,
  merchStoreEnabled: false,
  cashoutEnabled: false,
  payoutsEnabled: false,
  stripeConnectProductionEnabled: false,
  liveMoneyEnabled: false,
};

export const CREATOR_MONETIZATION_DOCTRINE = {
  premiumPrice: PREMIUM_SUBSCRIPTION_PRICE_LABEL,
  premiumEntitlement: PREMIUM_ENTITLEMENT_KEY,
  premiumProduct: PREMIUM_PRODUCT_ID,
  premiumRevenueOwner: PREMIUM_REVENUE_OWNER,
  paidContentCreatorShareBps: CREATOR_PAID_CONTENT_CREATOR_SHARE_BPS,
  paidContentPlatformShareBps: CREATOR_PAID_CONTENT_PLATFORM_SHARE_BPS,
  tipCreatorShareBps: CREATOR_TIP_CREATOR_SHARE_BPS,
  instantCashoutFeeBps: CREATOR_INSTANT_CASHOUT_FEE_BPS,
  instantCashoutFeeCapCents: CREATOR_INSTANT_CASHOUT_FEE_CAP_CENTS,
  payoutHoldDaysMin: CREATOR_PAYOUT_HOLD_DAYS_MIN,
  payoutHoldDaysMax: CREATOR_PAYOUT_HOLD_DAYS_MAX,
} as const;

type CountQueryResult = {
  count: number | null;
  error: unknown;
};

type CountQuery = PromiseLike<CountQueryResult> & {
  eq: (column: string, value: string | number | boolean) => PromiseLike<CountQueryResult>;
};

type SelectMaybeSingleQuery<T> = PromiseLike<{
  data: T | null;
  error: unknown;
}>;

const monetizationClient = supabase as unknown as {
  from: (table: string) => {
    select: (
      columns: string,
      options?: { count?: "exact"; head?: boolean },
    ) => CountQuery & {
      maybeSingle: () => SelectMaybeSingleQuery<Record<string, unknown>>;
      eq: (column: string, value: string | number | boolean) => CountQuery;
    };
  };
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>;
};

const safeCount = async (table: string, creatorId?: string | null) => {
  try {
    const query = monetizationClient.from(table).select("id", { count: "exact", head: true });
    const { count, error } = creatorId ? await query.eq("creator_id", creatorId) : await query;
    if (error) throw error;
    return Number(count ?? 0);
  } catch {
    return null;
  }
};

const toRuntimeBoolean = (value: unknown, fallback = false) => (
  typeof value === "boolean" ? value : fallback
);

export const calculateInstantCashoutFeeCents = (amountCents: number) => {
  const normalized = Math.max(0, Math.trunc(Number.isFinite(amountCents) ? amountCents : 0));
  return Math.ceil((normalized * CREATOR_INSTANT_CASHOUT_FEE_BPS) / 10_000);
};

export const deriveCreatorEarningsBalances = (
  entries: readonly CreatorEarningsLedgerEntry[],
): CreatorEarningsBalances => {
  const balances: CreatorEarningsBalances = {
    pendingCents: 0,
    heldCents: 0,
    availableCents: 0,
    paidCents: 0,
    reversedCents: 0,
  };

  entries.forEach((entry) => {
    const amount = Math.trunc(entry.netCreatorAmountCents || 0);
    if (entry.ledgerStatus === "pending") balances.pendingCents += amount;
    if (entry.ledgerStatus === "held") balances.heldCents += amount;
    if (entry.ledgerStatus === "available") balances.availableCents += amount;
    if (entry.ledgerStatus === "paid") balances.paidCents += amount;
    if (entry.ledgerStatus === "reversed") balances.reversedCents += amount;
  });

  return balances;
};

export const formatMonetizationCurrency = (amountCents: number, currency = "usd") => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(Math.trunc(amountCents || 0) / 100);
  } catch {
    return `$${(Math.trunc(amountCents || 0) / 100).toFixed(2)}`;
  }
};

export async function readCreatorMonetizationRuntimeFlags(): Promise<CreatorMonetizationRuntimeFlags> {
  try {
    const { data, error } = await monetizationClient
      .from(CREATOR_MONETIZATION_SETTINGS_TABLE)
      .select("*")
      .maybeSingle();
    if (error || !data) return DEFAULT_CREATOR_MONETIZATION_RUNTIME_FLAGS;
    return {
      premiumPurchaseEnabled: toRuntimeBoolean(data.premium_purchase_enabled),
      paidContentCheckoutEnabled: toRuntimeBoolean(data.paid_content_checkout_enabled),
      creatorPricingEnabled: toRuntimeBoolean(data.creator_pricing_enabled),
      tipsEnabled: toRuntimeBoolean(data.tips_enabled),
      merchStoreEnabled: toRuntimeBoolean(data.merch_store_enabled),
      cashoutEnabled: toRuntimeBoolean(data.cashout_enabled),
      payoutsEnabled: toRuntimeBoolean(data.payouts_enabled),
      stripeConnectProductionEnabled: toRuntimeBoolean(data.stripe_connect_production_enabled),
      liveMoneyEnabled: toRuntimeBoolean(data.live_money_enabled),
    };
  } catch {
    return DEFAULT_CREATOR_MONETIZATION_RUNTIME_FLAGS;
  }
}

export async function readCreatorMonetizationFoundationSummary(
  creatorId?: string | null,
): Promise<CreatorMonetizationFoundationSummary> {
  const [settings, pricingRows, productRows, tipRows, ledgerRows, payoutRequestRows, webhookRows] = await Promise.all([
    readCreatorMonetizationRuntimeFlags(),
    safeCount(CREATOR_CONTENT_PRICES_TABLE, creatorId),
    safeCount(CREATOR_PRODUCTS_TABLE, creatorId),
    safeCount(CREATOR_TIP_TRANSACTIONS_TABLE, creatorId),
    safeCount(CREATOR_EARNINGS_LEDGER_TABLE, creatorId),
    safeCount(CREATOR_PAYOUT_REQUESTS_TABLE, creatorId),
    safeCount(MONETIZATION_WEBHOOK_EVENTS_TABLE),
  ]);

  return {
    status: pricingRows === null
      && productRows === null
      && tipRows === null
      && ledgerRows === null
      && payoutRequestRows === null
      && webhookRows === null
        ? "not_connected"
        : settings.liveMoneyEnabled
          ? "blocked"
          : "disabled",
    settings,
    pricingRows,
    productRows,
    tipRows,
    ledgerRows,
    payoutRequestRows,
    webhookRows,
    generatedAt: new Date().toISOString(),
  };
}

export async function resolveCreatorContentAccess(options: {
  contentType: string;
  contentId: string;
}) {
  const { data, error } = await monetizationClient.rpc("resolve_creator_content_access", {
    p_content_type: options.contentType,
    p_content_id: options.contentId,
  });
  if (error) throw new Error("Content access could not be resolved.");
  return data;
}
