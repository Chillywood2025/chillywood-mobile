import { Platform } from "react-native";

import { supabase } from "./supabase";
import {
  getRevenueCatProductionReadiness,
  purchaseRevenueCatStoreProduct,
  readRevenueCatNonSubscriptionProducts,
  syncRevenueCatCustomerIdentity,
} from "./revenuecat";
import {
  findIosStoreProductByStableKey,
  findIosStoreProductByProductId,
  resolveIosFiniteAppStoreTier,
} from "./iosAppStoreCommerce";
import { resolvePaymentRailPolicy } from "./paymentRailPolicy";
import { getRuntimeConfig } from "./runtimeConfig";

export type CreatorTipStatus = "setup_incomplete" | "active" | "paused" | "blocked";

export type CreatorTipSettings = {
  id: string;
  creatorId: string;
  tipsEnabled: boolean;
  provider: string;
  providerEnvironment: "test" | "live" | "unknown";
  providerOnboardingStatus: string;
  providerChargesEnabled: boolean;
  providerPayoutsEnabled: boolean;
  defaultAmountCents: number | null;
  suggestedAmountsCents: number[];
  minAmountCents: number;
  maxAmountCents: number;
  currency: string;
  status: CreatorTipStatus;
  lastProviderSyncAt: string | null;
  updatedAt: string | null;
};

export type CreatorTipPublicStatus = {
  canTip: boolean;
  status: CreatorTipStatus | "unknown";
  reason: string;
  creatorId: string | null;
  currency: string;
  suggestedAmountsCents: number[];
  defaultAmountCents: number | null;
  minAmountCents: number;
  maxAmountCents: number;
  providerEnvironment: "test" | "live" | "unknown";
  testMode: boolean;
  liveMoneyEnabled: boolean;
  policyCopy: string;
};

export type CreatorTipTransaction = {
  id: string;
  creatorId: string;
  senderId: string;
  amountCents: number;
  currency: string;
  status: string;
  paymentStatus: string;
  payoutStatus: string;
  platformFeeCents: number;
  providerFeeCents: number;
  creatorNetCents: number | null;
  messagePrivate: string | null;
  provider: string;
  providerEnvironment: string;
  providerCheckoutSessionId: string | null;
  providerPaymentIntentId: string | null;
  createdAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  refundedAt: string | null;
};

export type CreatorTipCheckoutResult = {
  status: string;
  provider: string;
  providerKey: string;
  mode: "test" | "live";
  checkoutCreated: boolean;
  liveMoneyAction: boolean;
  noAccessGranted: boolean;
  pureContributionOnly: boolean;
  tipId: string | null;
  url: string | null;
  message?: string;
  error?: string;
};

export type CreatorTipStorePurchaseResult = {
  ok: boolean;
  intentId: string | null;
  productId: string;
  message: string;
};

/** @deprecated Use CreatorTipStorePurchaseResult for platform-neutral code. */
export type CreatorTipGooglePlayPurchaseResult = CreatorTipStorePurchaseResult;

const CREATOR_TIP_SANDBOX_PRODUCT_KEY = "creator_tip_sandbox_099";
const CREATOR_TIP_SANDBOX_PROVIDER_PRODUCT_ID = "cw_creator_tip_sandbox_099";

const toText = (value: unknown) => String(value ?? "").trim();

const creatorTipsClient = supabase as unknown as {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>;
  functions: {
    invoke: <T = unknown>(
      fn: string,
      options?: { body?: Record<string, unknown> },
    ) => Promise<{ data: T | null; error: unknown }>;
  };
};

const toNumber = (value: unknown, fallback = 0) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Math.trunc(normalized) : fallback;
};

const toNumberArray = (value: unknown, fallback: number[]) => {
  if (!Array.isArray(value)) return fallback;
  const amounts = value
    .map((item) => toNumber(item, 0))
    .filter((amount) => amount > 0);
  return amounts.length ? amounts : fallback;
};

const purchaseErrorText = (error: unknown, key: string) => {
  if (!error || typeof error !== "object") return "";
  return toText((error as Record<string, unknown>)[key]);
};

const isRevenueCatUserCancellation = (error: unknown) => {
  if (error && typeof error === "object" && (error as Record<string, unknown>).userCancelled === true) {
    return true;
  }
  const combined = [
    purchaseErrorText(error, "code"),
    purchaseErrorText(error, "codeName"),
    purchaseErrorText(error, "message"),
    purchaseErrorText(error, "underlyingErrorMessage"),
  ].join(" ").toLowerCase();
  return combined.includes("cancel");
};

const toTipSettings = (row: Record<string, unknown>): CreatorTipSettings => ({
  id: toText(row.id),
  creatorId: toText(row.creator_id),
  tipsEnabled: row.tips_enabled === true,
  provider: toText(row.provider) || "stripe_connect",
  providerEnvironment: (toText(row.provider_environment) || "test") as CreatorTipSettings["providerEnvironment"],
  providerOnboardingStatus: toText(row.provider_onboarding_status) || "setup_required",
  providerChargesEnabled: row.provider_charges_enabled === true,
  providerPayoutsEnabled: row.provider_payouts_enabled === true,
  defaultAmountCents: row.default_amount_cents == null ? null : toNumber(row.default_amount_cents),
  suggestedAmountsCents: toNumberArray(row.suggested_amounts_cents, [100, 300, 500, 1000]),
  minAmountCents: toNumber(row.min_amount_cents, 100),
  maxAmountCents: toNumber(row.max_amount_cents, 50000),
  currency: toText(row.currency) || "usd",
  status: (toText(row.status) || "setup_incomplete") as CreatorTipStatus,
  lastProviderSyncAt: toText(row.last_provider_sync_at) || null,
  updatedAt: toText(row.updated_at) || null,
});

const normalizePublicTipStatus = (payload: unknown): CreatorTipPublicStatus => {
  const row = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  return {
    canTip: row.canTip === true,
    status: (toText(row.status) || "unknown") as CreatorTipPublicStatus["status"],
    reason: toText(row.reason) || "tips_unavailable",
    creatorId: toText(row.creatorId) || null,
    currency: toText(row.currency) || "usd",
    suggestedAmountsCents: toNumberArray(row.suggestedAmountsCents, [100, 300, 500, 1000]),
    defaultAmountCents: row.defaultAmountCents == null ? null : toNumber(row.defaultAmountCents),
    minAmountCents: toNumber(row.minAmountCents, 100),
    maxAmountCents: toNumber(row.maxAmountCents, 50000),
    providerEnvironment: (toText(row.providerEnvironment) || "test") as CreatorTipPublicStatus["providerEnvironment"],
    testMode: row.testMode !== false,
    liveMoneyEnabled: row.liveMoneyEnabled === true,
    policyCopy: toText(row.policyCopy) || "Tips support the creator and do not unlock content, badges, room access, VIP, or perks.",
  };
};

const normalizeTipTransaction = (row: Record<string, unknown>): CreatorTipTransaction => ({
  id: toText(row.id),
  creatorId: toText(row.creator_id),
  senderId: toText(row.sender_id),
  amountCents: toNumber(row.tip_amount_cents),
  currency: toText(row.currency) || "usd",
  status: toText(row.status) || "pending",
  paymentStatus: toText(row.payment_status) || "pending",
  payoutStatus: toText(row.payout_status) || "not_payable",
  platformFeeCents: toNumber(row.platform_fee_cents),
  providerFeeCents: toNumber(row.provider_fee_cents),
  creatorNetCents: row.creator_net_cents == null ? null : toNumber(row.creator_net_cents),
  messagePrivate: toText(row.message_private) || null,
  provider: toText(row.provider) || "stripe_connect",
  providerEnvironment: toText(row.provider_environment) || "test",
  providerCheckoutSessionId: toText(row.provider_checkout_session_id) || null,
  providerPaymentIntentId: toText(row.provider_payment_intent_id) || null,
  createdAt: toText(row.created_at) || null,
  paidAt: toText(row.paid_at) || null,
  failedAt: toText(row.failed_at) || null,
  refundedAt: toText(row.refunded_at) || null,
});

export async function readMyCreatorTipSettings(): Promise<CreatorTipSettings> {
  const { data, error } = await creatorTipsClient.rpc("get_my_creator_tip_settings");
  if (error) throw error;
  return toTipSettings((data ?? {}) as Record<string, unknown>);
}

export async function saveMyCreatorTipSettings(input: {
  tipsEnabled: boolean;
  suggestedAmountsCents: number[];
  defaultAmountCents?: number | null;
  minAmountCents: number;
  maxAmountCents: number;
  currency?: string;
}): Promise<CreatorTipSettings> {
  const { data, error } = await creatorTipsClient.rpc("upsert_my_creator_tip_settings", {
    p_currency: input.currency ?? "usd",
    p_default_amount_cents: input.defaultAmountCents ?? null,
    p_max_amount_cents: input.maxAmountCents,
    p_min_amount_cents: input.minAmountCents,
    p_suggested_amounts_cents: input.suggestedAmountsCents,
    p_tips_enabled: input.tipsEnabled,
  });
  if (error) throw error;
  return toTipSettings((data ?? {}) as Record<string, unknown>);
}

export async function readCreatorTipPublicStatus(creatorId: string): Promise<CreatorTipPublicStatus> {
  const { data, error } = await creatorTipsClient.rpc("get_creator_tip_public_status", { p_creator_id: creatorId });
  if (error) throw error;
  return normalizePublicTipStatus(data);
}

export async function listMyCreatorTipTransactions(limit = 25): Promise<CreatorTipTransaction[]> {
  const { data, error } = await creatorTipsClient.rpc("list_my_creator_tip_transactions", { p_limit: limit });
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeTipTransaction((row ?? {}) as Record<string, unknown>))
    .filter((row) => !!row.id);
}

export async function readMyTipTransactionStatus(tipId: string) {
  const { data, error } = await creatorTipsClient.rpc("get_my_tip_transaction_status", {
    p_tip_transaction_id: tipId,
  });
  if (error) throw error;
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : { status: "not_found" };
}

export async function createCreatorTipCheckout(input: {
  creatorId: string;
  amountCents: number;
  currency?: string;
  privateNote?: string | null;
  returnUrl: string;
  cancelUrl: string;
}): Promise<CreatorTipCheckoutResult> {
  if (Platform.OS === "ios") {
    return {
      status: "ios_app_store_required",
      provider: "revenuecat",
      providerKey: "revenuecat_app_store",
      mode: "test",
      checkoutCreated: false,
      liveMoneyAction: false,
      noAccessGranted: true,
      pureContributionOnly: true,
      tipId: null,
      url: null,
      message: "Use the finite App Store tip flow on iOS. No Stripe checkout was created.",
    };
  }

  const { data, error } = await creatorTipsClient.functions.invoke("create-creator-tip-checkout", {
    body: {
      amount_cents: input.amountCents,
      cancel_url: input.cancelUrl,
      creator_id: input.creatorId,
      currency: input.currency ?? "usd",
      private_note: input.privateNote ?? null,
      return_url: input.returnUrl,
    },
  });
  if (error) throw error;
  const row = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return {
    status: toText(row.status),
    provider: toText(row.provider) || "stripe",
    providerKey: toText(row.providerKey) || "stripe_connect",
    mode: (toText(row.mode) || "test") as CreatorTipCheckoutResult["mode"],
    checkoutCreated: row.checkoutCreated === true,
    liveMoneyAction: row.liveMoneyAction === true,
    noAccessGranted: row.noAccessGranted === true,
    pureContributionOnly: row.pureContributionOnly === true,
    tipId: toText(row.tipId) || null,
    url: toText(row.url) || null,
    message: toText(row.message) || undefined,
    error: toText(row.error) || undefined,
  };
}

export async function purchaseCreatorTipWithStore(input: {
  creatorId: string;
  userId: string;
  amountCents: number;
  currency?: string;
  iosStoreProductKey?: string;
  privateNote?: string | null;
  sourceSurface?: string;
}): Promise<CreatorTipStorePurchaseResult> {
  const creatorId = toText(input.creatorId);
  const userId = toText(input.userId);
  const legacyIosTipProduct = Platform.OS === "ios"
    ? resolveIosFiniteAppStoreTier("creator_tip", input.amountCents)
    : null;
  const legacyIosProductId = legacyIosTipProduct?.productId ?? null;
  const iosTipProduct = Platform.OS === "ios"
    ? findIosStoreProductByStableKey(input.iosStoreProductKey) ??
      (legacyIosProductId ? findIosStoreProductByProductId(legacyIosProductId) : null)
    : null;
  const productId = iosTipProduct?.productId ?? legacyIosProductId ?? CREATOR_TIP_SANDBOX_PROVIDER_PRODUCT_ID;
  if (!creatorId || !userId) {
    return {
      ok: false,
      intentId: null,
      productId,
      message: "Sign in again before sending a sandbox tip.",
    };
  }

  if (Platform.OS === "ios") {
    if (!iosTipProduct || iosTipProduct.concept !== "creator_tip") {
      return {
        ok: false,
        intentId: null,
        productId,
        message: "Choose one of the available App Store tip tiers. Nothing was charged.",
      };
    }
    const runtime = getRuntimeConfig();
    const readiness = getRevenueCatProductionReadiness();
    const decision = resolvePaymentRailPolicy({
      appStorePurchasesEnabled: runtime.revenueCat.appStorePurchasesEnabled,
      environment: "sandbox",
      liveMoneyEnabled: false,
      platform: "ios",
      providerReady: readiness.iosPublicKeyConfigured,
      store: "app_store",
      unlocksDigitalAccess: false,
      useCase: "creator_tip_support",
    });
    if (!decision.allowed || decision.provider !== "revenuecat_app_store") {
      return {
        ok: false,
        intentId: null,
        productId,
        message: "App Store sandbox tips are disabled for this build. Nothing was charged.",
      };
    }
  }

  await syncRevenueCatCustomerIdentity(userId);

  const intentRpc = Platform.OS === "ios"
    ? "create_ios_app_store_purchase_intent"
    : "create_money_purchase_intent";
  const intentArgs = Platform.OS === "ios"
    ? {
        p_metadata: {
          amount_minor: String(iosTipProduct?.referencePriceMinor ?? 0),
          creator_id: creatorId,
          currency: "usd",
          no_access_grant: true,
          no_live_payout: true,
          not_payable: true,
          private_note_present: !!toText(input.privateNote),
          sandbox_only: true,
          source_surface: toText(input.sourceSurface) || "creator_tip_sheet",
        },
        p_provider_product_id: productId,
        p_source_id: creatorId,
        p_source_type: "creator_tip",
      }
    : {
        p_metadata: {
          amount_minor: String(Math.max(0, Math.trunc(input.amountCents))),
          creator_id: creatorId,
          currency: toText(input.currency) || "usd",
          no_access_grant: true,
          no_live_payout: true,
          not_payable: true,
          private_note_present: !!toText(input.privateNote),
          sandbox_only: true,
          source_surface: toText(input.sourceSurface) || "creator_tip_sheet",
        },
        p_product_key: CREATOR_TIP_SANDBOX_PRODUCT_KEY,
        p_source_id: creatorId,
        p_source_type: "creator_tip",
      };
  const { data: intent, error } = await creatorTipsClient.rpc<{ id?: unknown }>(intentRpc, intentArgs);
  if (error) {
    return {
      ok: false,
      intentId: null,
      productId,
      message: "Sandbox tip could not be started right now.",
    };
  }

  const products = await readRevenueCatNonSubscriptionProducts([productId]);
  const storeProduct = products.find((entry) => toText(entry.identifier) === productId);
  if (!storeProduct) {
    return {
      ok: false,
      intentId: toText(intent?.id) || null,
      productId,
      message: Platform.OS === "ios"
        ? "App Store sandbox tip product is not available on this device yet."
        : "Google Play sandbox tip product is not available on this device yet.",
    };
  }

  let purchase;
  try {
    purchase = await purchaseRevenueCatStoreProduct(storeProduct);
  } catch (error) {
    return {
      ok: false,
      intentId: toText(intent?.id) || null,
      productId,
      message: isRevenueCatUserCancellation(error)
        ? "Tip canceled. Nothing changed."
        : Platform.OS === "ios"
          ? "App Store tip could not be completed. Try again later."
          : "Google Play tip could not be completed. Try again later.",
    };
  }
  return {
    ok: true,
    intentId: toText(intent?.id) || null,
    productId: toText(purchase.productIdentifier) || productId,
    message: "Sandbox tip complete.",
  };
}

/** @deprecated Use purchaseCreatorTipWithStore for platform-neutral call sites. */
export const purchaseCreatorTipWithGooglePlay = purchaseCreatorTipWithStore;
