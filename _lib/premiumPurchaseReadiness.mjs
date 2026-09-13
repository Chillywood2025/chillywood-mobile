const normalizeText = (value) => String(value ?? "").trim();

/**
 * Resolve the single, user-facing reason that controls whether the Premium
 * purchase path may open. This stays provider-agnostic so the exact same
 * policy can be exercised by Node fixtures and the native application.
 */
export function resolvePremiumPurchaseReadiness(input) {
  const storeName = normalizeText(input.storeName) || "Store";

  if (!input.isSignedIn) {
    return {
      ready: false,
      code: "sign_in_required",
      message: "Sign in before starting a Premium purchase.",
    };
  }

  if (input.hasPremium) {
    return {
      ready: false,
      code: "premium_already_active",
      message: "Premium is already active.",
    };
  }

  if (!input.purchaseShellAvailable) {
    return {
      ready: false,
      code: "purchase_shell_unavailable",
      message: `Premium purchases are not available through ${storeName} right now.`,
    };
  }

  if (input.purchaseMode === "internal_tester_sandbox") {
    if (!input.storePurchaseRailReadbackComplete) {
      return {
        ready: false,
        code: "store_rail_readback_unavailable",
        message: `Unable to verify ${storeName} purchase availability. Try again.`,
      };
    }

    if (input.storePurchaseRailState !== "sandbox_only") {
      return {
        ready: false,
        code: "store_rail_not_sandbox",
        message: `${storeName} purchases are not available right now.`,
      };
    }
  }

  if (!input.revenueCatConfigured) {
    return {
      ready: false,
      code: "revenuecat_not_configured",
      message: `Premium purchases are not available through ${storeName} right now.`,
    };
  }

  if (!input.canMakePayments) {
    return {
      ready: false,
      code: "store_payments_unavailable",
      message: `${storeName} billing cannot make purchases on this device/account right now.`,
    };
  }

  if (!input.offeringAvailable) {
    return {
      ready: false,
      code: "premium_offering_missing",
      message: "Premium purchase details could not be loaded for this account.",
    };
  }

  if (!(Number(input.packageCount) > 0)) {
    return {
      ready: false,
      code: "premium_packages_missing",
      message: "A purchasable Premium plan is not available right now.",
    };
  }

  return {
    ready: true,
    code: "ready",
    message: `${storeName} purchase is available.`,
  };
}
