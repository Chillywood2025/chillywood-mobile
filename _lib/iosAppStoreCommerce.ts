export type IosStoreProductKey =
  | "premium_monthly"
  | "premium_annual"
  | "tip_tier_1"
  | "tip_tier_2"
  | "tip_tier_3"
  | "tip_tier_4"
  | "seat_pass_tier_1"
  | "seat_pass_tier_2"
  | "seat_pass_tier_3"
  | "seat_pass_tier_4";

export type IosStoreProductType = "auto_renewable_subscription" | "consumable";

export type IosStoreConcept = "premium" | "creator_tip" | "seat_pass";
export type IosStoreFiniteTier = "tier1" | "tier2" | "tier3" | "tier4";
export type IosStorePremiumPeriod = "monthly" | "annual";
export type IosStoreProductTier = IosStoreFiniteTier | IosStorePremiumPeriod;

export type IosStoreProductRecord = {
  stableKey: IosStoreProductKey;
  concept: IosStoreConcept;
  productId: string;
  conceptTier: IosStoreProductTier;
  productType: IosStoreProductType;
  subscriptionPeriod?: "P1M" | "P1Y";
  referencePriceMinor: number;
  referencePrice: string;
  entitlement?: string | null;
  offering?: string | null;
  package?: string | null;
};

export type IosFiniteAppStoreConcept = "creator_tip" | "seat_pass";
export type IosFiniteAppStoreTier = {
  concept: IosFiniteAppStoreConcept;
  productId: string;
  referencePriceMinor: number;
  tier: IosStoreFiniteTier;
};

// Keep the permanent catalog as one source of truth for exact App Store identity.
export const IOS_APP_STORE_PRODUCTS: readonly IosStoreProductRecord[] = [
  {
    stableKey: "premium_monthly",
    concept: "premium",
    productId: "com.chillywood.premium.monthly",
    conceptTier: "monthly",
    productType: "auto_renewable_subscription",
    referencePriceMinor: 999,
    referencePrice: "9.99",
    subscriptionPeriod: "P1M",
    entitlement: "premium",
    offering: "default",
    package: "$rc_monthly",
  },
  {
    stableKey: "premium_annual",
    concept: "premium",
    productId: "com.chillywood.premium.yearly",
    conceptTier: "annual",
    productType: "auto_renewable_subscription",
    referencePriceMinor: 9999,
    referencePrice: "99.99",
    subscriptionPeriod: "P1Y",
    entitlement: "premium",
    offering: "default",
    package: "$rc_annual",
  },
  {
    stableKey: "tip_tier_1",
    concept: "creator_tip",
    productId: "com.chillywood.tip.tier1",
    conceptTier: "tier1",
    productType: "consumable",
    referencePriceMinor: 99,
    referencePrice: "0.99",
    offering: "creator_support",
    package: "tip_tier_1",
  },
  {
    stableKey: "tip_tier_2",
    concept: "creator_tip",
    productId: "com.chillywood.tip.tier2",
    conceptTier: "tier2",
    productType: "consumable",
    referencePriceMinor: 299,
    referencePrice: "2.99",
    offering: "creator_support",
    package: "tip_tier_2",
  },
  {
    stableKey: "tip_tier_3",
    concept: "creator_tip",
    productId: "com.chillywood.tip.tier3",
    conceptTier: "tier3",
    productType: "consumable",
    referencePriceMinor: 499,
    referencePrice: "4.99",
    offering: "creator_support",
    package: "tip_tier_3",
  },
  {
    stableKey: "tip_tier_4",
    concept: "creator_tip",
    productId: "com.chillywood.tip.tier4",
    conceptTier: "tier4",
    productType: "consumable",
    referencePriceMinor: 999,
    referencePrice: "9.99",
    offering: "creator_support",
    package: "tip_tier_4",
  },
  {
    stableKey: "seat_pass_tier_1",
    concept: "seat_pass",
    productId: "com.chillywood.seatpass.tier1",
    conceptTier: "tier1",
    productType: "consumable",
    referencePriceMinor: 99,
    referencePrice: "0.99",
    offering: "seat_passes",
    package: "seat_pass_tier_1",
  },
  {
    stableKey: "seat_pass_tier_2",
    concept: "seat_pass",
    productId: "com.chillywood.seatpass.tier2",
    conceptTier: "tier2",
    productType: "consumable",
    referencePriceMinor: 299,
    referencePrice: "2.99",
    offering: "seat_passes",
    package: "seat_pass_tier_2",
  },
  {
    stableKey: "seat_pass_tier_3",
    concept: "seat_pass",
    productId: "com.chillywood.seatpass.tier3",
    conceptTier: "tier3",
    productType: "consumable",
    referencePriceMinor: 499,
    referencePrice: "4.99",
    offering: "seat_passes",
    package: "seat_pass_tier_3",
  },
  {
    stableKey: "seat_pass_tier_4",
    concept: "seat_pass",
    productId: "com.chillywood.seatpass.tier4",
    conceptTier: "tier4",
    productType: "consumable",
    referencePriceMinor: 999,
    referencePrice: "9.99",
    offering: "seat_passes",
    package: "seat_pass_tier_4",
  },
] as const;

export const IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY =
  "This purchase is not available on iPhone yet. Chi'llywood only enables predeclared App Store products; nothing was charged.";

const isFiniteProduct = (entry: IosStoreProductRecord): entry is IosStoreProductRecord & {
  concept: IosFiniteAppStoreConcept;
  conceptTier: IosStoreFiniteTier;
  productType: "consumable";
} => entry.concept !== "premium";

const IOS_FINITE_APP_STORE_PRODUCTS = IOS_APP_STORE_PRODUCTS.filter(isFiniteProduct);

export const IOS_FINITE_APP_STORE_TIERS: readonly IosFiniteAppStoreTier[] = IOS_FINITE_APP_STORE_PRODUCTS.map((entry) => ({
  concept: entry.concept,
  productId: entry.productId,
  referencePriceMinor: entry.referencePriceMinor,
  tier: entry.conceptTier,
}));

export const listIosFiniteAppStoreTiers = (concept: IosFiniteAppStoreConcept) => (
  IOS_FINITE_APP_STORE_PRODUCTS
    .filter((entry) => entry.concept === concept)
    .map((entry) => ({
      concept: entry.concept,
      productId: entry.productId,
      referencePriceMinor: entry.referencePriceMinor,
      tier: entry.conceptTier,
    }))
);

export const listIosStoreProductsForConcept = (concept: IosStoreConcept) =>
  IOS_APP_STORE_PRODUCTS.filter((entry) => entry.concept === concept);

export const findIosStoreProductByStableKey = (stableKey: unknown): IosStoreProductRecord | null => {
  if (typeof stableKey !== "string") return null;
  const normalized = stableKey.trim();
  if (!normalized) return null;
  return IOS_APP_STORE_PRODUCTS.find((entry) => entry.stableKey === normalized) ?? null;
};

export const findIosStoreProductByProductId = (productId: unknown): IosStoreProductRecord | null => {
  if (typeof productId !== "string") return null;
  const normalized = productId.trim();
  if (!normalized) return null;
  return IOS_APP_STORE_PRODUCTS.find((entry) => entry.productId === normalized) ?? null;
};

export const findIosStoreProduct = (
  concept: IosStoreConcept,
  conceptTier: IosStoreProductTier,
): IosStoreProductRecord | null => {
  return IOS_APP_STORE_PRODUCTS.find((entry) => entry.concept === concept && entry.conceptTier === conceptTier) ?? null;
};

/**
 * Deprecated: retain only as a compatibility fallback where legacy payloads still
 * carry a raw amount. Canonical iOS flows must use findIosStoreProductByStableKey.
 */
export const resolveIosFiniteAppStoreTier = (
  concept: IosFiniteAppStoreConcept,
  requestedAmountMinor: number,
): IosFiniteAppStoreTier | null => {
  const amount = Number.isFinite(requestedAmountMinor)
    ? Math.max(0, Math.trunc(requestedAmountMinor))
    : 0;
  if (!amount) return null;

  // Legacy Android/iOS fallback logic keeps one-cent rounding tolerance.
  return listIosFiniteAppStoreTiers(concept).find((entry) => (
    amount === entry.referencePriceMinor || amount === entry.referencePriceMinor + 1
  )) ?? null;
};
