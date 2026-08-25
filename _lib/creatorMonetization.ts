import { supabase } from "./supabase";
import { withAuthorityReadDeadline } from "./entitlementAuthority";

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
export const CREATOR_SCHEDULED_PAYOUT_FEE_BPS = 0;
export const CREATOR_SCHEDULED_PAYOUT_FEE_CENTS = 0;
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

export type CreatorContentAccessResolution = {
  allowed: boolean;
  reason: string;
  requiresPurchase: boolean;
  priceCents: number | null;
  currency: string | null;
  creatorId: string | null;
  resolverStatus: "resolved" | "unavailable";
};

export type CreatorProductListing = {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  status: "draft" | "active" | "paused" | "archived";
  productType: "merch" | "clothing" | "physical" | "digital_link" | "external";
  imagePath: string | null;
  inventoryMode: "not_tracked" | "limited" | "unlimited" | "external";
};

export type CreatorMiniPlatformCommerceSurface = {
  status: MonetizationFoundationStatus;
  settings: CreatorMonetizationRuntimeFlags;
  products: CreatorProductListing[];
  tipsStatus: "disabled" | "enabled_later";
  paidContentCheckoutStatus: "disabled" | "enabled_later";
  merchCheckoutStatus: "disabled" | "enabled_later";
  message: string;
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
  scheduledPayoutFeeBps: CREATOR_SCHEDULED_PAYOUT_FEE_BPS,
  scheduledPayoutFeeCents: CREATOR_SCHEDULED_PAYOUT_FEE_CENTS,
  instantCashoutFeeBps: CREATOR_INSTANT_CASHOUT_FEE_BPS,
  instantCashoutFeeCapCents: CREATOR_INSTANT_CASHOUT_FEE_CAP_CENTS,
  payoutHoldDaysMin: CREATOR_PAYOUT_HOLD_DAYS_MIN,
  payoutHoldDaysMax: CREATOR_PAYOUT_HOLD_DAYS_MAX,
} as const;

type QueryResult<T = Record<string, unknown>[]> = {
  data: T | null;
  count: number | null;
  error: unknown;
};

type SelectMaybeSingleQuery<T> = PromiseLike<{
  data: T | null;
  error: unknown;
}>;

type SelectQuery<T = Record<string, unknown>[]> = PromiseLike<QueryResult<T>> & {
  eq: (column: string, value: string | number | boolean) => SelectQuery<T>;
  maybeSingle: () => SelectMaybeSingleQuery<Record<string, unknown>>;
};

const monetizationClient = supabase as unknown as {
  from: (table: string) => {
    select: <T = Record<string, unknown>[]>(
      columns: string,
      options?: { count?: "exact"; head?: boolean },
    ) => SelectQuery<T>;
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

const toText = (value: unknown) => String(value ?? "").trim();

const toCents = (value: unknown) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.trunc(normalized));
};

const CREATOR_CONTENT_ALLOW_REASONS = new Set([
  "owner",
  "free_content",
  "purchase_grant",
  "active_grant",
  "sandbox_grant",
]);
const CREATOR_CONTENT_DENY_REASONS = new Set([
  "unsupported_content_type",
  "content_unavailable",
  "purchase_required",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createUnknownCreatorContentAccessResolution = (): CreatorContentAccessResolution => ({
  allowed: false,
  reason: "resolver_unavailable",
  requiresPurchase: false,
  priceCents: null,
  currency: null,
  creatorId: null,
  resolverStatus: "unavailable",
});

export const normalizeCreatorContentAccessResolution = (
  payload: unknown,
): CreatorContentAccessResolution => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return createUnknownCreatorContentAccessResolution();
  }

  const body = payload as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const allowed = body.allowed;
  const requiresPurchase = body.requiresPurchase;
  const priceCents = body.priceCents;
  const currency = body.currency;
  const creatorId = body.creatorId;
  const optionalFieldsAreWellFormed = (
    (priceCents == null || (typeof priceCents === "number" && Number.isSafeInteger(priceCents) && priceCents >= 0))
    && (currency == null || (typeof currency === "string" && /^[a-z]{3}$/.test(currency.trim())))
    && (creatorId == null || (typeof creatorId === "string" && UUID_PATTERN.test(creatorId.trim())))
  );
  const reasonMatchesDecision = allowed === true
    ? CREATOR_CONTENT_ALLOW_REASONS.has(reason) && requiresPurchase === false
    : allowed === false
      ? CREATOR_CONTENT_DENY_REASONS.has(reason)
        && (requiresPurchase == null || typeof requiresPurchase === "boolean")
        && (reason !== "purchase_required" || (
          requiresPurchase === true
          && typeof priceCents === "number"
          && Number.isSafeInteger(priceCents)
          && priceCents > 0
          && typeof currency === "string"
          && /^[a-z]{3}$/.test(currency.trim())
          && typeof creatorId === "string"
          && UUID_PATTERN.test(creatorId.trim())
        ))
      : false;

  if (!reasonMatchesDecision || !optionalFieldsAreWellFormed) {
    return createUnknownCreatorContentAccessResolution();
  }

  return {
    allowed: allowed === true,
    reason,
    requiresPurchase: requiresPurchase === true,
    priceCents: typeof priceCents === "number" ? priceCents : null,
    currency: typeof currency === "string" ? currency.trim() : null,
    creatorId: typeof creatorId === "string" ? creatorId.trim() : null,
    resolverStatus: "resolved",
  };
};

const normalizeCreatorProductListing = (row: Record<string, unknown>): CreatorProductListing | null => {
  const id = toText(row.id);
  const title = toText(row.title);
  const creatorId = toText(row.creator_id);
  if (!id || !title || !creatorId) return null;
  const status = toText(row.status) as CreatorProductListing["status"];
  const productType = toText(row.product_type) as CreatorProductListing["productType"];
  const inventoryMode = toText(row.inventory_mode) as CreatorProductListing["inventoryMode"];
  return {
    id,
    creatorId,
    title,
    description: toText(row.description),
    priceCents: toCents(row.price_cents),
    currency: toText(row.currency) || "usd",
    status: status === "active" || status === "paused" || status === "archived" ? status : "draft",
    productType: productType === "clothing"
      || productType === "physical"
      || productType === "digital_link"
      || productType === "external"
      ? productType
      : "merch",
    imagePath: toText(row.image_path) || null,
    inventoryMode: inventoryMode === "limited"
      || inventoryMode === "unlimited"
      || inventoryMode === "external"
      ? inventoryMode
      : "not_tracked",
  };
};

export const calculateInstantCashoutFeeCents = (amountCents: number) => {
  const normalized = Math.max(0, Math.trunc(Number.isFinite(amountCents) ? amountCents : 0));
  return Math.ceil((normalized * CREATOR_INSTANT_CASHOUT_FEE_BPS) / 10_000);
};

export const calculateScheduledPayoutFeeCents = () => CREATOR_SCHEDULED_PAYOUT_FEE_CENTS;

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

export async function readCreatorMiniPlatformCommerceSurface(
  creatorId: string,
): Promise<CreatorMiniPlatformCommerceSurface> {
  const normalizedCreatorId = toText(creatorId);
  const settings = await readCreatorMonetizationRuntimeFlags();
  if (!normalizedCreatorId) {
    return {
      status: "blocked",
      settings,
      products: [],
      tipsStatus: "disabled",
      paidContentCheckoutStatus: "disabled",
      merchCheckoutStatus: "disabled",
      message: "Platform commerce needs a creator id.",
    };
  }

  try {
    const { data, error } = await monetizationClient
      .from(CREATOR_PRODUCTS_TABLE)
      .select("id,creator_id,title,description,price_cents,currency,status,product_type,image_path,inventory_mode")
      .eq("creator_id", normalizedCreatorId)
      .eq("status", "active");

    if (error) throw error;

    const products = Array.isArray(data)
      ? data.map((row) => normalizeCreatorProductListing(row as Record<string, unknown>)).filter((row): row is CreatorProductListing => !!row)
      : [];

    return {
      status: settings.liveMoneyEnabled ? "blocked" : "disabled",
      settings,
      products,
      tipsStatus: settings.tipsEnabled && settings.liveMoneyEnabled ? "enabled_later" : "disabled",
      paidContentCheckoutStatus: settings.paidContentCheckoutEnabled && settings.liveMoneyEnabled ? "enabled_later" : "disabled",
      merchCheckoutStatus: settings.merchStoreEnabled && settings.liveMoneyEnabled ? "enabled_later" : "disabled",
      message: settings.liveMoneyEnabled
        ? "Platform commerce still needs provider and legal readiness before checkout can open."
        : "Platform commerce status is active; checkout, tips, orders, and cash-out remain blocked until owner-approved provider readiness.",
    };
  } catch {
    return {
      status: "not_connected",
      settings,
      products: [],
      tipsStatus: "disabled",
      paidContentCheckoutStatus: "disabled",
      merchCheckoutStatus: "disabled",
      message: "Platform commerce status is active, but the provider readback could not be reached.",
    };
  }
}

export async function resolveCreatorContentAccess(options: {
  contentType: string;
  contentId: string;
}): Promise<CreatorContentAccessResolution> {
  try {
    const result = await withAuthorityReadDeadline<unknown>(
      monetizationClient.rpc("resolve_creator_content_access", {
        p_content_type: options.contentType,
        p_content_id: options.contentId,
      }),
      null,
    );
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return createUnknownCreatorContentAccessResolution();
    }
    const { data, error } = result as { data?: unknown; error?: unknown };
    if (error) return createUnknownCreatorContentAccessResolution();
    return normalizeCreatorContentAccessResolution(data);
  } catch {
    return createUnknownCreatorContentAccessResolution();
  }
}

export async function setCreatorContentPrice(input: {
  contentType: string;
  contentId: string;
  isPaid: boolean;
  priceCents: number;
  currency?: string;
}) {
  const { data, error } = await monetizationClient.rpc("set_creator_content_price", {
    p_content_type: input.contentType,
    p_content_id: input.contentId,
    p_is_paid: input.isPaid,
    p_price_cents: Math.max(0, Math.trunc(input.priceCents || 0)),
    p_currency: input.currency ?? "usd",
  });
  if (error) throw new Error("Creator pricing status is active, but the backed pricing save path is not reachable.");
  return data;
}

export async function createCreatorProductListing(input: {
  title: string;
  description?: string;
  priceCents: number;
  productType?: CreatorProductListing["productType"];
  currency?: string;
}) {
  const { data, error } = await monetizationClient.rpc("create_creator_product_listing", {
    p_title: input.title,
    p_description: input.description ?? "",
    p_price_cents: Math.max(0, Math.trunc(input.priceCents || 0)),
    p_product_type: input.productType ?? "merch",
    p_currency: input.currency ?? "usd",
  });
  if (error) throw new Error("Product listing status is active, but the backed listing save path is not reachable.");
  return data;
}

export async function readCreatorPayoutBalances(creatorId?: string | null): Promise<CreatorEarningsBalances | null> {
  const { data, error } = await monetizationClient.rpc<Record<string, unknown>>("calculate_creator_payout_balances", {
    p_creator_id: creatorId ?? null,
  });
  if (error || !data) return null;
  return {
    pendingCents: toCents(data.pendingCents),
    heldCents: toCents(data.heldCents),
    availableCents: toCents(data.availableCents),
    paidCents: toCents(data.paidCents),
    reversedCents: toCents(data.reversedCents),
  };
}

export async function requestCreatorPayout(input: {
  amountCents: number;
  payoutType: "scheduled" | "instant";
}) {
  const { data, error } = await monetizationClient.rpc("request_creator_payout", {
    p_amount_cents: Math.max(0, Math.trunc(input.amountCents || 0)),
    p_payout_type: input.payoutType,
  });
  if (error) throw new Error("Creator payout status is active, but payout movement remains unavailable.");
  return data;
}

export async function creatorMonetizationCheckoutPreflight(input: {
  checkoutType: "paid_content" | "tip" | "product";
  targetId?: string | null;
  amountCents?: number | null;
}) {
  const { data, error } = await monetizationClient.rpc("creator_monetization_checkout_preflight", {
    p_checkout_type: input.checkoutType,
    p_target_id: input.targetId ?? null,
    p_amount_cents: input.amountCents == null ? null : Math.max(0, Math.trunc(input.amountCents || 0)),
  });
  if (error) throw new Error("Checkout preflight status is active, but the backed preflight path is not reachable.");
  return data;
}
