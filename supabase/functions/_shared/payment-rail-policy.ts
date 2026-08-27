export type PaymentRailPlatform = "android" | "ios" | "web" | "unknown";
export type PaymentRailStore = "app_store" | "google_play" | "web" | "unknown";

export type PaymentRailUseCase =
  | "premium_subscription"
  | "creator_paid_digital_content"
  | "creator_tip_support"
  | "watch_party_seat_pass"
  | "creator_physical_product"
  | "creator_payout_cashout"
  | "creator_sponsor_payment";

export type PaymentRailProvider =
  | "google_play_revenuecat"
  | "revenuecat_google_play"
  | "revenuecat_app_store"
  | "google_play_billing"
  | "approved_external_billing"
  | "stripe_checkout"
  | "stripe_connect"
  | "disabled";

export type PaymentRailDecision = {
  allowed: boolean;
  provider: PaymentRailProvider;
  reason: string;
  requiresServerCheckout: boolean;
  requiresProviderProof: boolean;
  premiumEntitlementSource: "revenuecat" | "none";
  stripeAllowed: boolean;
  revenueCatAllowed: boolean;
  unlocksDigitalAccess: boolean;
  grantsLiveKitAuthority: boolean;
  createsPayableBalance: boolean;
};

export type PaymentRailPolicyInput = {
  useCase: PaymentRailUseCase;
  platform?: PaymentRailPlatform;
  store?: PaymentRailStore;
  environment?: "setup" | "sandbox" | "production";
  liveMoneyEnabled?: boolean;
  providerReady?: boolean;
  appStorePurchasesEnabled?: boolean;
  approvedExternalBillingProof?: boolean;
  unlocksDigitalAccess?: boolean;
};

export const PAYMENT_RAIL_POLICY_VERSION = "2026-05-15";
export const PREMIUM_PAYMENT_RAIL = "google_play_revenuecat";
export const ANDROID_DIGITAL_CREATOR_CONTENT_STRIPE_ENABLED = false;
export const TIPS_MUST_NOT_UNLOCK_DIGITAL_BENEFITS = true;
export const CREATOR_TIP_PAYMENT_RAIL = "google_play_revenuecat";
export const PHYSICAL_PRODUCT_PAYMENT_RAIL = "stripe_checkout";
export const CREATOR_PAYOUT_PAYMENT_RAIL = "stripe_connect";
export const REVENUECAT_GOOGLE_PLAY_PROVIDER = "revenuecat_google_play";
export const REVENUECAT_APP_STORE_PROVIDER = "revenuecat_app_store";
export const APP_STORE_PURCHASES_DEFAULT_ENABLED = false;

export const resolveRevenueCatProviderByPlatform = (platform: PaymentRailPlatform = "unknown") => (
  platform === "ios" ? REVENUECAT_APP_STORE_PROVIDER : REVENUECAT_GOOGLE_PLAY_PROVIDER
);

const blocked = (provider: PaymentRailProvider, reason: string, extra?: Partial<PaymentRailDecision>): PaymentRailDecision => ({
  allowed: false,
  provider,
  reason,
  requiresServerCheckout: true,
  requiresProviderProof: true,
  premiumEntitlementSource: "none",
  stripeAllowed: false,
  revenueCatAllowed: false,
  unlocksDigitalAccess: false,
  grantsLiveKitAuthority: false,
  createsPayableBalance: false,
  ...extra,
});

const providerReady = (input: PaymentRailPolicyInput) => input.liveMoneyEnabled === true && input.providerReady === true;

export function resolvePaymentRailPolicy(input: PaymentRailPolicyInput): PaymentRailDecision {
  const platform = input.platform ?? "unknown";

  if (input.useCase === "premium_subscription") {
    if (platform === "ios") {
      const appStoreReady = input.providerReady === true && input.appStorePurchasesEnabled === true;
      return blocked("revenuecat_app_store", "ios_premium_requires_revenuecat_app_store_proof", {
        allowed: appStoreReady,
        premiumEntitlementSource: "revenuecat",
        revenueCatAllowed: true,
        requiresProviderProof: !appStoreReady,
      });
    }
    return blocked("google_play_revenuecat", "premium_purchase_proof_required", {
      allowed: input.providerReady === true,
      premiumEntitlementSource: "revenuecat",
      revenueCatAllowed: true,
      requiresProviderProof: input.providerReady !== true,
    });
  }

  if (input.useCase === "creator_paid_digital_content") {
    if (platform === "ios") {
      return blocked("revenuecat_app_store", "ios_creator_paid_digital_uses_finite_app_store_catalog_server_authority", {
        allowed: input.store === "app_store" && input.liveMoneyEnabled !== true,
        requiresProviderProof: true,
        revenueCatAllowed: true,
        unlocksDigitalAccess: true,
        createsPayableBalance: false,
      });
    }
    if (platform === "android" && input.approvedExternalBillingProof !== true) {
      return blocked("google_play_billing", "android_digital_content_requires_play_billing", { unlocksDigitalAccess: true });
    }
    if (input.approvedExternalBillingProof === true) {
      return blocked("approved_external_billing", "approved_external_billing_not_live", {
        allowed: providerReady(input),
        requiresProviderProof: !providerReady(input),
        unlocksDigitalAccess: true,
      });
    }
    return blocked("disabled", "creator_paid_content_checkout_disabled", { unlocksDigitalAccess: true });
  }

  if (input.useCase === "creator_tip_support") {
    if (input.unlocksDigitalAccess === true) return blocked("disabled", "tips_cannot_unlock_digital_access", { unlocksDigitalAccess: true });
    if (platform === "ios") {
      const appStoreReady = input.environment === "sandbox" && input.providerReady === true && input.appStorePurchasesEnabled === true && input.liveMoneyEnabled !== true;
      return blocked("revenuecat_app_store", "creator_tips_use_revenuecat_app_store_sandbox_only", {
        allowed: appStoreReady,
        requiresProviderProof: !appStoreReady,
        revenueCatAllowed: true,
        unlocksDigitalAccess: false,
        createsPayableBalance: false,
      });
    }
    return blocked("google_play_revenuecat", "creator_tips_use_revenuecat_google_play_sandbox_only", {
      allowed: providerReady(input),
      requiresProviderProof: !providerReady(input),
      revenueCatAllowed: true,
      unlocksDigitalAccess: false,
    });
  }

  if (input.useCase === "watch_party_seat_pass") {
    if (platform === "ios") {
      const appStoreReady = input.environment === "sandbox" && input.providerReady === true && input.appStorePurchasesEnabled === true && input.liveMoneyEnabled !== true;
      return blocked("revenuecat_app_store", "ios_seat_pass_uses_finite_app_store_catalog_sandbox_only", {
        allowed: appStoreReady,
        requiresProviderProof: !appStoreReady,
        revenueCatAllowed: true,
        unlocksDigitalAccess: true,
        createsPayableBalance: false,
      });
    }
    return blocked("revenuecat_google_play", "android_seat_pass_uses_existing_google_play_policy", {
      allowed: providerReady(input),
      requiresProviderProof: !providerReady(input),
      revenueCatAllowed: true,
      unlocksDigitalAccess: true,
    });
  }

  if (input.useCase === "creator_physical_product") {
    return blocked("stripe_checkout", "merch_checkout_disabled_until_provider_proof", {
      allowed: providerReady(input), requiresProviderProof: !providerReady(input), stripeAllowed: providerReady(input), unlocksDigitalAccess: false,
    });
  }
  if (input.useCase === "creator_payout_cashout") {
    return blocked("stripe_connect", "payouts_disabled_until_connect_proof", {
      allowed: providerReady(input), requiresProviderProof: !providerReady(input), stripeAllowed: providerReady(input), unlocksDigitalAccess: false,
    });
  }
  return blocked("stripe_connect", "sponsor_payments_disabled_until_provider_proof", {
    allowed: providerReady(input), requiresProviderProof: !providerReady(input), stripeAllowed: providerReady(input), unlocksDigitalAccess: false,
  });
}
