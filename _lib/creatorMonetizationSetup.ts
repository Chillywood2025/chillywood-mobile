import { Linking, Platform } from "react-native";

import {
  purchaseRevenueCatStoreProduct,
  readRevenueCatNonSubscriptionProducts,
  syncRevenueCatCustomerIdentity,
} from "./revenuecat";
import { IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY } from "./iosAppStoreCommerce";
import {
  REVENUECAT_APP_STORE_PROVIDER,
  REVENUECAT_GOOGLE_PLAY_PROVIDER,
  resolvePaymentRailPolicy,
} from "./paymentRailPolicy";
import { SUPABASE_URL, supabase } from "./supabase";
import {
  canCreateCreatorMoneyExposure,
  parseCreatorEligibilityReadback,
  type CreatorEligibilityDecision,
} from "./creatorEligibility";
import {
  readCurrentAccountSessionAuthority,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import { withAuthorityReadDeadline } from "./entitlementAuthority";

export type CreatorMonetizationSetupSourceType =
  | "paid_content"
  | "watch_party_live"
  | "live_watch_party_access"
  | "live_watch_party_seat"
  | "creator_tip"
  | "channel_subscription"
  | "vip_pass"
  | "event"
  | "merch_physical_good";

export type CreatorMonetizationSetupTier = {
  key: string;
  label: string;
  sourceType: CreatorMonetizationSetupSourceType;
  productType: string;
  providerProductId: string;
  priceLabel: string;
  providerRail: "revenuecat_google_play" | "revenuecat_app_store" | "stripe_physical_goods";
  unlocks: string;
  safety: string;
};

export type CreatorMonetizationConfig = {
  id: string;
  creatorId: string;
  sourceType: CreatorMonetizationSetupSourceType;
  sourceId: string;
  productKey: string;
  productType: string;
  provider: string;
  providerProductId: string;
  displayName: string;
  priceLabel: string;
  environment: "sandbox";
  status: "sandbox" | "setup" | "disabled" | "revoked";
  payableState: "not_payable";
  productionEnabled: boolean;
  payoutEnabled: boolean;
  createsDigitalAccess: boolean;
  grantsLiveKitPublish: boolean;
  grantsHostAuthority: boolean;
  requiresHostApproval: boolean;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

const resolveProviderRail = () => (
  Platform.OS === "ios" ? REVENUECAT_APP_STORE_PROVIDER : REVENUECAT_GOOGLE_PLAY_PROVIDER
);

export const APPROVED_CREATOR_SANDBOX_TIERS: CreatorMonetizationSetupTier[] = [
  {
    key: "paid_content_access_sandbox_099",
    label: "Paid content access",
    sourceType: "paid_content",
    productType: "paid_content_access",
    providerProductId: "cw_paid_content_access_sandbox_099",
    priceLabel: "$0.99 sandbox/test",
    providerRail: resolveProviderRail(),
    unlocks: "Unlocks this content only when it remains public and safe.",
    safety: "Private, draft, deleted, admin-removed, malware, and blocked states still deny.",
  },
  {
    key: "watch_party_live_ticket_sandbox_099",
    label: "Party Room Pass",
    sourceType: "watch_party_live",
    productType: "watch_party_live_ticket",
    providerProductId: "cw_watch_party_live_ticket_sandbox_099",
    priceLabel: "$0.99 sandbox/test",
    providerRail: resolveProviderRail(),
    unlocks: "Allows viewer entry only when room policy allows.",
    safety: "Does not grant mic, camera, publish, host, speaker, moderator, or admin authority.",
  },
  {
    key: "live_watch_party_access_pass_sandbox_099",
    label: "Live Stage Pass",
    sourceType: "live_watch_party_access",
    productType: "live_watch_party_access_pass",
    providerProductId: "cw_live_watch_party_access_sandbox_099",
    priceLabel: "$0.99 sandbox/test",
    providerRail: REVENUECAT_GOOGLE_PLAY_PROVIDER,
    unlocks: "Allows viewer/listener entry only.",
    safety: "No host, speaker, moderator, admin, or LiveKit publish authority is granted.",
  },
  {
    key: "live_watch_party_seat_pass_sandbox_099",
    label: "Live Stage Seat Pass",
    sourceType: "live_watch_party_seat",
    productType: "live_watch_party_seat_pass",
    providerProductId: "cw_live_watch_party_seat_sandbox_099",
    priceLabel: "$0.99 sandbox/test",
    providerRail: REVENUECAT_GOOGLE_PLAY_PROVIDER,
    unlocks: "Makes a viewer eligible to request a speaking seat on one exact Live Stage.",
    safety: "Host approval and current persisted speaker membership are still required before mic/camera/publish can turn on.",
  },
  {
    key: "creator_tip_sandbox_099",
    label: "Creator tip",
    sourceType: "creator_tip",
    productType: "creator_tip",
    providerProductId: "cw_creator_tip_sandbox_099",
    priceLabel: "$0.99 sandbox/test",
    providerRail: resolveProviderRail(),
    unlocks: "Records sandbox creator support activity only.",
    safety: "Tips do not create access grants, payable balance, payout, cash-out, withdrawal, or transfer.",
  },
  {
    key: "channel_subscription_sandbox_monthly_499",
    label: "Platform subscription",
    sourceType: "channel_subscription",
    productType: "channel_subscription",
    providerProductId: "channel_subscription_sandbox_monthly_499",
    priceLabel: "$4.99/month sandbox/test",
    providerRail: resolveProviderRail(),
    unlocks: "Creates subscriber status and temporary access to this creator's ordinary Paid Videos while active.",
    safety: "Does not create permanent Paid Video ownership or unlock Chi'llywood Premium, VIP-only videos, Party Room Passes, Live Stage Passes, Live Stage Seat Passes, Event Passes, LiveKit authority, or other creators.",
  },
  {
    key: "vip_pass_sandbox_499",
    label: "VIP pass",
    sourceType: "vip_pass",
    productType: "vip_pass",
    providerProductId: "cw_vip_pass_sandbox_499",
    priceLabel: "$4.99 sandbox/test",
    providerRail: resolveProviderRail(),
    unlocks: "Creates exactly 30 days of VIP status and VIP-only shelf access for this creator.",
    safety: "Does not auto-renew or unlock Premium, ordinary Paid Video ownership, Event Passes, platform subscriptions, Party Room Passes, Live Stage Passes, Live Stage Seat Passes, LiveKit authority, or other creators.",
  },
  {
    key: "event_pass_sandbox_099",
    label: "Event Pass",
    sourceType: "event",
    productType: "event_pass",
    providerProductId: "cw_event_pass_sandbox_099",
    priceLabel: "$0.99 sandbox/test",
    providerRail: resolveProviderRail(),
    unlocks: "Allows viewing/entry only while the event remains active and allowed.",
    safety: "Canceled, ended, removed, disabled, unsafe, and blocked states still deny.",
  },
  {
    key: "cw_merch_test_tee_sandbox",
    label: "Physical merch readiness",
    sourceType: "merch_physical_good",
    productType: "merch_physical_good",
    providerProductId: "cw_merch_test_tee_sandbox",
    priceLabel: "$9.99 Stripe sandbox/test",
    providerRail: "stripe_physical_goods",
    unlocks: "Opens Stripe sandbox checkout for physical merch only.",
    safety: "Merch does not unlock app access, Premium, RevenueCat entitlement, or payouts.",
  },
];

export const CREATOR_MONETIZATION_SETUP_POLICY = {
  arbitraryAndroidPricesAllowed: false,
  approvedSandboxTiersOnly: true,
  liveMoneyEnabled: false,
  payoutsEnabled: false,
  cashOutEnabled: false,
  withdrawalEnabled: false,
  transferEnabled: false,
  stripeAndroidDigitalCheckoutEnabled: false,
  stripeIosDigitalCheckoutEnabled: false,
  payoutExecutionReadOnly: true,
  liveKitPublishGrantedByPayment: false,
  hostApprovalBypassedBySeatPass: false,
} as const;

const STRIPE_MERCH_CHECKOUT_URL = `${SUPABASE_URL.replace(/\/+$/g, "")}/functions/v1/stripe-merch-checkout`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toText = (value: unknown) => String(value ?? "").trim();
const exactText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const currentAuthorityRequired = async (expected: AccountSessionAuthorityBinding) => {
  if (expected.restoreOnly || !sameAccountSessionAuthority(expected, await readCurrentAccountSessionAuthority())) {
    throw new Error("Account changed while creator money authority was loading.");
  }
};

const creatorMonetizationSetupClient = supabase as unknown as {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>;
};

export async function readMyCreatorEligibilityAuthority(): Promise<CreatorEligibilityDecision> {
  const before = await readCurrentAccountSessionAuthority();
  if (!before || before.restoreOnly) return parseCreatorEligibilityReadback(null);
  const result = await withAuthorityReadDeadline<unknown>(
    creatorMonetizationSetupClient.rpc("wave1_creator_eligibility_readback"), null,
  );
  if (!result || typeof result !== "object" || Array.isArray(result)) return parseCreatorEligibilityReadback(null);
  const { data, error } = result as { data?: unknown; error?: unknown };
  const after = await readCurrentAccountSessionAuthority();
  const row = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  if (error || !sameAccountSessionAuthority(before, after) || after?.restoreOnly
    || exactText(row.userId) !== before.userId || exactText(row.accountId) !== before.accountId
    || exactText(row.sessionGeneration) !== before.sessionGeneration) {
    return parseCreatorEligibilityReadback(null);
  }
  return parseCreatorEligibilityReadback(data);
}

export async function assertCreatorMoneyExposureAllowed() {
  const eligibility = await readMyCreatorEligibilityAuthority();
  if (!canCreateCreatorMoneyExposure(eligibility)) {
    throw new Error("Creator money setup is unavailable until server verification is complete.");
  }
  return eligibility;
}

const normalizeConfig = (value: unknown): CreatorMonetizationConfig | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = toText(row.id);
  const sourceType = toText(row.sourceType) as CreatorMonetizationSetupSourceType;
  const sourceId = toText(row.sourceId);
  const productKey = toText(row.productKey);
  if (!id || !sourceType || !sourceId || !productKey) return null;
  return {
    id,
    creatorId: toText(row.creatorId),
    sourceType,
    sourceId,
    productKey,
    productType: toText(row.productType),
    provider: toText(row.provider),
    providerProductId: toText(row.providerProductId),
    displayName: toText(row.displayName),
    priceLabel: toText(row.priceLabel) || "$0.99 sandbox/test",
    environment: "sandbox",
    status: toText(row.status) as CreatorMonetizationConfig["status"],
    payableState: "not_payable",
    productionEnabled: row.productionEnabled === true,
    payoutEnabled: row.payoutEnabled === true,
    createsDigitalAccess: row.createsDigitalAccess === true,
    grantsLiveKitPublish: row.grantsLiveKitPublish === true,
    grantsHostAuthority: row.grantsHostAuthority === true,
    requiresHostApproval: row.requiresHostApproval === true,
    updatedAt: toText(row.updatedAt),
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
  };
};

export const isValidCreatorMonetizationSourceId = (value: string) => UUID_PATTERN.test(toText(value));

export const getCreatorSandboxTier = (key: string) => (
  APPROVED_CREATOR_SANDBOX_TIERS.find((tier) => tier.key === key) ?? APPROVED_CREATOR_SANDBOX_TIERS[0]
);

export async function saveCreatorSandboxMonetizationConfig(input: {
  displayName?: string;
  metadata?: Record<string, unknown>;
  productKey: string;
  sourceId: string;
  sourceType: CreatorMonetizationSetupSourceType;
}) {
  await assertCreatorMoneyExposureAllowed();
  const tier = getCreatorSandboxTier(input.productKey);
  if (tier.key !== input.productKey) throw new Error("Choose an approved sandbox product tier.");
  if (tier.sourceType !== input.sourceType) throw new Error("Source type does not match the selected product tier.");
  if (!isValidCreatorMonetizationSourceId(input.sourceId)) throw new Error("Enter a real source UUID before saving.");

  const { data, error } = await creatorMonetizationSetupClient.rpc("save_creator_sandbox_monetization_config", {
    p_display_name: input.displayName || tier.label,
    p_metadata: {
      ...(input.metadata ?? {}),
      in_app_creator_setup: true,
      approved_product_tier: true,
      arbitrary_android_price: false,
      sandbox_only: true,
      not_payable: true,
    },
    p_product_key: input.productKey,
    p_source_id: input.sourceId,
    p_source_type: input.sourceType,
  });
  if (error) throw error;
  const config = normalizeConfig(data);
  if (!config) throw new Error("Creator sandbox config was not returned.");
  return config;
}

export async function listMyCreatorSandboxMonetizationConfigs() {
  const { data, error } = await creatorMonetizationSetupClient.rpc("list_my_creator_sandbox_monetization_configs");
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map(normalizeConfig).filter((row): row is CreatorMonetizationConfig => !!row);
}

export async function adminListCreatorSandboxMonetizationConfigs() {
  const { data, error } = await creatorMonetizationSetupClient.rpc("admin_list_creator_sandbox_monetization_configs");
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map(normalizeConfig).filter((row): row is CreatorMonetizationConfig => !!row);
}

export async function launchCreatorSandboxDigitalPurchase(input: {
  config: CreatorMonetizationConfig;
  userId: string;
}) {
  const operationAuthority = await readCurrentAccountSessionAuthority();
  if (!operationAuthority || operationAuthority.restoreOnly || exactText(input.userId) !== operationAuthority.userId) {
    throw new Error("Creator purchase authority is unavailable for the current account.");
  }
  await assertCreatorMoneyExposureAllowed();
  await currentAuthorityRequired(operationAuthority);
  const tier = getCreatorSandboxTier(input.config.productKey);
  if (Platform.OS === "ios") {
    const decision = resolvePaymentRailPolicy({
      environment: "sandbox",
      liveMoneyEnabled: false,
      platform: "ios",
      store: "app_store",
      unlocksDigitalAccess: tier.sourceType !== "creator_tip",
      useCase: tier.sourceType === "creator_tip" ? "creator_tip_support" : "creator_paid_digital_content",
    });
    if (!decision.allowed) throw new Error(IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY);
    throw new Error("Use the dedicated contextual App Store checkout for this creator product. Nothing was charged.");
  }
  if (tier.providerRail !== REVENUECAT_GOOGLE_PLAY_PROVIDER && tier.providerRail !== REVENUECAT_APP_STORE_PROVIDER) {
    throw new Error("Digital sandbox purchases must use Google Play / RevenueCat.");
  }
  if (!isValidCreatorMonetizationSourceId(input.config.sourceId)) {
    throw new Error("The saved config source is not valid.");
  }
  const identity = await syncRevenueCatCustomerIdentity(operationAuthority.userId);
  if (identity.status !== "identified" || !identity.matchesSourceUser) {
    throw new Error("Billing identity is unavailable for the current account.");
  }
  await currentAuthorityRequired(operationAuthority);

  const { data: intent, error } = await supabase.rpc("create_money_purchase_intent", {
    p_metadata: {
      amount_minor: "99",
      currency: "usd",
      creator_id: input.config.creatorId,
      creator_monetization_config_id: input.config.id,
      in_app_creator_setup: true,
      not_payable: true,
      sandbox_only: true,
    },
    p_product_key: input.config.productKey,
    p_source_id: input.config.sourceId,
    p_source_type: input.config.sourceType,
  });
  if (error) throw error;
  const intentRow = intent && typeof intent === "object" && !Array.isArray(intent)
    ? intent as Record<string, unknown>
    : null;
  if (intentRow?.alreadyPurchased === true || intentRow?.alreadySubscribed === true) {
    return {
      intentId: toText(intentRow.id),
      productId: toText(intentRow.providerProductId) || input.config.providerProductId,
      alreadyOwned: true,
    };
  }
  await currentAuthorityRequired(operationAuthority);

  const products = await readRevenueCatNonSubscriptionProducts([input.config.providerProductId]);
  await currentAuthorityRequired(operationAuthority);
  const storeProduct = products.find((entry) => toText(entry.identifier) === input.config.providerProductId);
  if (!storeProduct) throw new Error(`RevenueCat product ${input.config.providerProductId} is not available on this build/account.`);
  const purchase = await purchaseRevenueCatStoreProduct(storeProduct, { authority: operationAuthority });
  await currentAuthorityRequired(operationAuthority);
  return {
    intentId: toText(intentRow?.id),
    productId: toText(purchase.productIdentifier) || input.config.providerProductId,
    alreadyOwned: false,
  };
}

export async function launchCreatorMerchSandboxCheckout() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error("Sign in again before starting Stripe physical merch sandbox checkout.");
  }

  const response = await fetch(STRIPE_MERCH_CHECKOUT_URL, {
    body: JSON.stringify({
      product_key: "cw_merch_test_tee_sandbox",
      quantity: 1,
    }),
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const safeMessage = toText((data as { message?: unknown } | null)?.message)
      || "Stripe physical merch sandbox checkout could not be created.";
    throw new Error(safeMessage);
  }
  const payload = data as { checkoutCreated?: boolean; orderId?: string; url?: string } | null;
  const checkoutUrl = toText(payload?.url);
  if (!payload?.checkoutCreated || !checkoutUrl) {
    throw new Error("Stripe sandbox checkout did not return a checkout URL.");
  }
  await Linking.openURL(checkoutUrl);
  return {
    orderId: toText(payload.orderId) || "created",
  };
}
