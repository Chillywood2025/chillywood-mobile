export type PremiumPurchaseReadinessCode =
  | "sign_in_required"
  | "premium_already_active"
  | "purchase_shell_unavailable"
  | "store_rail_readback_unavailable"
  | "store_rail_not_sandbox"
  | "revenuecat_not_configured"
  | "store_payments_unavailable"
  | "premium_offering_missing"
  | "premium_packages_missing"
  | "ready";

export type PremiumPurchaseReadiness = {
  ready: boolean;
  code: PremiumPurchaseReadinessCode;
  message: string;
};

export function resolvePremiumPurchaseReadiness(input: {
  isSignedIn: boolean;
  hasPremium: boolean;
  purchaseMode: "public" | "internal_tester_sandbox";
  purchaseShellAvailable: boolean;
  sandboxModeReason?: string | null;
  storeName: string;
  storePurchaseRailReadbackComplete: boolean;
  storePurchaseRailState: "off" | "on" | "locked" | "maintenance" | "sandbox_only";
  revenueCatConfigured: boolean;
  configurationReason?: string | null;
  canMakePayments: boolean;
  offeringAvailable: boolean;
  packageCount: number;
}): PremiumPurchaseReadiness;
