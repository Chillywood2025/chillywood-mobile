export type IosStoreProductType = "auto_renewable_subscription" | "consumable";
export type IosStoreConcept =
  | "premium"
  | "creator_tip"
  | "seat_pass"
  | "paid_video"
  | "event_pass"
  | "vip_pass"
  | "channel_subscription";
export type IosStoreFiniteTier = "tier1" | "tier2" | "tier3" | "tier4";
export type IosStorePremiumPeriod = "monthly" | "annual";
export type IosChannelSubscriptionSlot = "slot1" | "slot2" | "slot3" | "slot4" | "slot5" | "slot6" | "slot7" | "slot8";
export type IosStoreProductTier = IosStoreFiniteTier | IosStorePremiumPeriod | IosChannelSubscriptionSlot;
export type IosStoreProductKey = string;

export type IosStoreProductRecord = {
  stableKey: IosStoreProductKey;
  concept: IosStoreConcept;
  productId: string;
  conceptTier: IosStoreProductTier;
  productType: IosStoreProductType;
  subscriptionPeriod?: "P1M" | "P1Y";
  subscriptionGroup?: string;
  slotNumber?: number;
  referencePriceMinor: number;
  referencePrice: string;
  entitlement?: string | null;
  offering?: string | null;
  package?: string | null;
};

export type IosFiniteAppStoreConcept = "creator_tip" | "seat_pass" | "paid_video" | "event_pass" | "vip_pass";
export type IosFiniteAppStoreTier = {
  concept: IosFiniteAppStoreConcept;
  productId: string;
  referencePriceMinor: number;
  tier: IosStoreFiniteTier;
};

const FINITE_TIERS = [
  { tier: "tier1" as const, minor: 99, price: "0.99" },
  { tier: "tier2" as const, minor: 299, price: "2.99" },
  { tier: "tier3" as const, minor: 499, price: "4.99" },
  { tier: "tier4" as const, minor: 999, price: "9.99" },
] as const;

const finiteProducts = (
  concept: IosFiniteAppStoreConcept,
  stablePrefix: string,
  productPrefix: string,
  offering: string,
  packagePrefix: string,
): IosStoreProductRecord[] => FINITE_TIERS.map((entry, index) => ({
  stableKey: `${stablePrefix}_tier_${index + 1}`,
  concept,
  productId: `com.chillywood.${productPrefix}.${entry.tier}`,
  conceptTier: entry.tier,
  productType: "consumable",
  referencePriceMinor: entry.minor,
  referencePrice: entry.price,
  offering,
  package: `${packagePrefix}_tier_${index + 1}`,
}));

const channelSubscriptionSlots: IosStoreProductRecord[] = Array.from({ length: 8 }, (_, index) => {
  const slot = index + 1;
  return {
    stableKey: `channel_subscription_slot_${slot}`,
    concept: "channel_subscription",
    productId: `com.chillywood.channel.subscription.slot${slot}`,
    conceptTier: `slot${slot}` as IosChannelSubscriptionSlot,
    productType: "auto_renewable_subscription",
    subscriptionPeriod: "P1M",
    subscriptionGroup: `chillywood_channel_slot_${slot}`,
    slotNumber: slot,
    referencePriceMinor: 499,
    referencePrice: "4.99",
    offering: "channel_subscriptions",
    package: `channel_slot_${slot}`,
  };
});

// Permanent App Store identity. Nothing in this catalog activates money by itself.
export const IOS_APP_STORE_PRODUCTS: readonly IosStoreProductRecord[] = [
  {
    stableKey: "premium_monthly", concept: "premium", productId: "com.chillywood.premium.monthly",
    conceptTier: "monthly", productType: "auto_renewable_subscription", subscriptionPeriod: "P1M",
    subscriptionGroup: "chillywood_premium", referencePriceMinor: 999, referencePrice: "9.99",
    entitlement: "premium", offering: "default", package: "$rc_monthly",
  },
  {
    stableKey: "premium_annual", concept: "premium", productId: "com.chillywood.premium.yearly",
    conceptTier: "annual", productType: "auto_renewable_subscription", subscriptionPeriod: "P1Y",
    subscriptionGroup: "chillywood_premium", referencePriceMinor: 9999, referencePrice: "99.99",
    entitlement: "premium", offering: "default", package: "$rc_annual",
  },
  ...finiteProducts("creator_tip", "tip", "tip", "creator_support", "tip"),
  ...finiteProducts("seat_pass", "seat_pass", "seatpass", "seat_passes", "seat_pass"),
  ...finiteProducts("paid_video", "paid_video", "paidvideo", "paid_video", "paidvideo"),
  ...finiteProducts("event_pass", "event_pass", "eventpass", "event_passes", "eventpass"),
  ...finiteProducts("vip_pass", "vip_pass", "vip", "vip_passes", "vip"),
  ...channelSubscriptionSlots,
] as const;

export const IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY =
  "This App Store product is not configured for this build yet. Nothing was charged.";

const FINITE_CONCEPTS = new Set<IosStoreConcept>(["creator_tip", "seat_pass", "paid_video", "event_pass", "vip_pass"]);
const isFiniteProduct = (entry: IosStoreProductRecord): entry is IosStoreProductRecord & {
  concept: IosFiniteAppStoreConcept;
  conceptTier: IosStoreFiniteTier;
  productType: "consumable";
} => FINITE_CONCEPTS.has(entry.concept) && entry.productType === "consumable";

const IOS_FINITE_APP_STORE_PRODUCTS = IOS_APP_STORE_PRODUCTS.filter(isFiniteProduct);
export const IOS_FINITE_APP_STORE_TIERS: readonly IosFiniteAppStoreTier[] = IOS_FINITE_APP_STORE_PRODUCTS.map((entry) => ({
  concept: entry.concept, productId: entry.productId, referencePriceMinor: entry.referencePriceMinor, tier: entry.conceptTier,
}));

export const listIosFiniteAppStoreTiers = (concept: IosFiniteAppStoreConcept) =>
  IOS_FINITE_APP_STORE_PRODUCTS.filter((entry) => entry.concept === concept).map((entry) => ({
    concept: entry.concept, productId: entry.productId, referencePriceMinor: entry.referencePriceMinor, tier: entry.conceptTier,
  }));

export const listIosChannelSubscriptionSlots = () => channelSubscriptionSlots.slice();
export const listIosStoreProductsForConcept = (concept: IosStoreConcept) => IOS_APP_STORE_PRODUCTS.filter((entry) => entry.concept === concept);

export const findIosStoreProductByStableKey = (stableKey: unknown): IosStoreProductRecord | null => {
  const normalized = typeof stableKey === "string" ? stableKey.trim() : "";
  return normalized ? IOS_APP_STORE_PRODUCTS.find((entry) => entry.stableKey === normalized) ?? null : null;
};
export const findIosStoreProductByProductId = (productId: unknown): IosStoreProductRecord | null => {
  const normalized = typeof productId === "string" ? productId.trim() : "";
  return normalized ? IOS_APP_STORE_PRODUCTS.find((entry) => entry.productId === normalized) ?? null : null;
};
export const findIosStoreProduct = (concept: IosStoreConcept, conceptTier: IosStoreProductTier): IosStoreProductRecord | null =>
  IOS_APP_STORE_PRODUCTS.find((entry) => entry.concept === concept && entry.conceptTier === conceptTier) ?? null;

/** Catalog support is not slot allocation or provider availability. The server
 * must still bind an exact slot to the buyer/creator and checkout must verify
 * the live store quote before purchasing. */
export const isExactIosChannelSubscriptionProduct = (
  productId: unknown,
  amountMinor: number,
  currency: string,
): boolean => {
  if (typeof productId !== "string" || productId !== productId.trim()
    || currency !== "usd" || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) return false;
  const product = findIosStoreProductByProductId(productId);
  if (!product || product.concept !== "channel_subscription") return false;
  const slot = product.slotNumber;
  return product.productType === "auto_renewable_subscription"
    && product.subscriptionPeriod === "P1M"
    && typeof slot === "number" && Number.isSafeInteger(slot) && slot >= 1 && slot <= 8
    && product.referencePriceMinor === amountMinor
    && product.conceptTier === `slot${slot}`
    && product.productId === `com.chillywood.channel.subscription.slot${slot}`
    && product.subscriptionGroup === `chillywood_channel_slot_${slot}`;
};

export const isIosChannelSubscriptionPriceSupported = (amountMinor: number, currency: string): boolean =>
  listIosChannelSubscriptionSlots().some(product =>
    isExactIosChannelSubscriptionProduct(product.productId, amountMinor, currency));

/** A server-issued, immutable creator/offer/catalog version, not a client SKU
 * template. New products need an approved server binding AND an exact live
 * store quote. This does not provision products or claim provider verification. */
export const isExactChannelSubscriptionCatalogBinding = (value: unknown, expected: {
  creatorId: string; offerId: string; providerProductId: string;
  amountMinor: number; currency: string; platform: "ios" | "android";
  environment: string;
}): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return Number.isSafeInteger(binding.version) && Number(binding.version) > 0
    && typeof binding.bindingId === "string" && uuid.test(binding.bindingId)
    && typeof binding.priceId === "string" && uuid.test(binding.priceId)
    && binding.creatorId === expected.creatorId && uuid.test(expected.creatorId)
    && binding.offerId === expected.offerId && uuid.test(expected.offerId)
    && typeof expected.providerProductId === "string" && expected.providerProductId.length > 0
    && expected.providerProductId === expected.providerProductId.trim()
    && binding.providerProductId === expected.providerProductId
    && Number.isSafeInteger(expected.amountMinor) && expected.amountMinor > 0
    && binding.amountMinor === expected.amountMinor
    && binding.currency === "usd" && binding.currency === expected.currency
    && binding.platform === expected.platform
    && (expected.environment === "sandbox" || expected.environment === "production")
    && binding.environment === expected.environment && binding.subscriptionPeriod === "P1M";
};

export const resolveIosFiniteAppStoreTier = (
  concept: IosFiniteAppStoreConcept,
  requestedAmountMinor: number,
): IosFiniteAppStoreTier | null => {
  if (!Number.isSafeInteger(requestedAmountMinor) || requestedAmountMinor <= 0) return null;
  return listIosFiniteAppStoreTiers(concept).find((entry) =>
    requestedAmountMinor === entry.referencePriceMinor
  ) ?? null;
};
