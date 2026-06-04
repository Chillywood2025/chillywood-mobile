export type PaymentRailPlatform = "android" | "ios" | "web" | "unknown";

export type PaymentRailUseCase =
  | "premium_subscription"
  | "creator_paid_digital_content"
  | "creator_tip_support"
  | "creator_physical_product"
  | "creator_payout_cashout"
  | "creator_sponsor_payment";

export type PaymentRailProvider =
  | "google_play_revenuecat"
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
};

export type PaymentRailPolicyInput = {
  useCase: PaymentRailUseCase;
  platform?: PaymentRailPlatform;
  liveMoneyEnabled?: boolean;
  providerReady?: boolean;
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

const blocked = (
  provider: PaymentRailProvider,
  reason: string,
  extra?: Partial<PaymentRailDecision>,
): PaymentRailDecision => ({
  allowed: false,
  provider,
  reason,
  requiresServerCheckout: true,
  requiresProviderProof: true,
  premiumEntitlementSource: "none",
  stripeAllowed: false,
  revenueCatAllowed: false,
  unlocksDigitalAccess: false,
  ...extra,
});

const providerReady = (input: PaymentRailPolicyInput) =>
  input.liveMoneyEnabled === true && input.providerReady === true;

export function resolvePaymentRailPolicy(input: PaymentRailPolicyInput): PaymentRailDecision {
  const platform = input.platform ?? "unknown";

  if (input.useCase === "premium_subscription") {
    return blocked("google_play_revenuecat", "premium_purchase_proof_required", {
      allowed: input.providerReady === true,
      premiumEntitlementSource: "revenuecat",
      revenueCatAllowed: true,
      requiresProviderProof: input.providerReady !== true,
    });
  }

  if (input.useCase === "creator_paid_digital_content") {
    if (platform === "android" && input.approvedExternalBillingProof !== true) {
      return blocked("google_play_billing", "android_digital_content_requires_play_billing", {
        unlocksDigitalAccess: true,
      });
    }

    if (input.approvedExternalBillingProof === true) {
      return blocked("approved_external_billing", "approved_external_billing_not_live", {
        allowed: providerReady(input),
        requiresProviderProof: !providerReady(input),
        unlocksDigitalAccess: true,
      });
    }

    return blocked("disabled", "creator_paid_content_checkout_disabled", {
      unlocksDigitalAccess: true,
    });
  }

  if (input.useCase === "creator_tip_support") {
    if (input.unlocksDigitalAccess === true) {
      return blocked("disabled", "tips_cannot_unlock_digital_access", {
        unlocksDigitalAccess: true,
      });
    }

    return blocked("google_play_revenuecat", "creator_tips_use_revenuecat_google_play_sandbox_only", {
      allowed: providerReady(input),
      requiresProviderProof: !providerReady(input),
      revenueCatAllowed: true,
      unlocksDigitalAccess: false,
    });
  }

  if (input.useCase === "creator_physical_product") {
    return blocked("stripe_checkout", "merch_checkout_disabled_until_provider_proof", {
      allowed: providerReady(input),
      requiresProviderProof: !providerReady(input),
      stripeAllowed: providerReady(input),
      unlocksDigitalAccess: false,
    });
  }

  if (input.useCase === "creator_payout_cashout") {
    return blocked("stripe_connect", "payouts_disabled_until_connect_proof", {
      allowed: providerReady(input),
      requiresProviderProof: !providerReady(input),
      stripeAllowed: providerReady(input),
      unlocksDigitalAccess: false,
    });
  }

  return blocked("stripe_connect", "sponsor_payments_disabled_until_provider_proof", {
    allowed: providerReady(input),
    requiresProviderProof: !providerReady(input),
    stripeAllowed: providerReady(input),
    unlocksDigitalAccess: false,
  });
}
