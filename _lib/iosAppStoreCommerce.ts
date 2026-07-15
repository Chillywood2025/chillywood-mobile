export type IosFiniteAppStoreConcept = "creator_tip" | "seat_pass";

export type IosFiniteAppStoreTier = {
  concept: IosFiniteAppStoreConcept;
  productId: string;
  referencePriceMinor: number;
  tier: "tier1" | "tier2" | "tier3" | "tier4";
};

// Keep these permanent identifiers in one runtime-safe module. The iOS commerce
// guard compares this list with config/ios/app-store-products.json so source and
// the provider manifest cannot drift silently.
export const IOS_FINITE_APP_STORE_TIERS: readonly IosFiniteAppStoreTier[] = [
  { concept: "creator_tip", productId: "com.chillywood.tip.tier1", referencePriceMinor: 99, tier: "tier1" },
  { concept: "creator_tip", productId: "com.chillywood.tip.tier2", referencePriceMinor: 299, tier: "tier2" },
  { concept: "creator_tip", productId: "com.chillywood.tip.tier3", referencePriceMinor: 499, tier: "tier3" },
  { concept: "creator_tip", productId: "com.chillywood.tip.tier4", referencePriceMinor: 999, tier: "tier4" },
  { concept: "seat_pass", productId: "com.chillywood.seatpass.tier1", referencePriceMinor: 99, tier: "tier1" },
  { concept: "seat_pass", productId: "com.chillywood.seatpass.tier2", referencePriceMinor: 299, tier: "tier2" },
  { concept: "seat_pass", productId: "com.chillywood.seatpass.tier3", referencePriceMinor: 499, tier: "tier3" },
  { concept: "seat_pass", productId: "com.chillywood.seatpass.tier4", referencePriceMinor: 999, tier: "tier4" },
] as const;

export const IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY =
  "This purchase is not available on iPhone yet. Chi'llywood only enables predeclared App Store products; nothing was charged.";

export const listIosFiniteAppStoreTiers = (concept: IosFiniteAppStoreConcept) => (
  IOS_FINITE_APP_STORE_TIERS.filter((entry) => entry.concept === concept)
);

export const resolveIosFiniteAppStoreTier = (
  concept: IosFiniteAppStoreConcept,
  requestedAmountMinor: number,
): IosFiniteAppStoreTier | null => {
  const amount = Number.isFinite(requestedAmountMinor)
    ? Math.max(0, Math.trunc(requestedAmountMinor))
    : 0;
  if (!amount) return null;

  // Legacy Android setup surfaces use round-dollar cent values (100/300/etc.).
  // Accept only that one-cent display rounding in addition to the exact Apple
  // price; arbitrary creator-defined prices stay fail closed.
  return listIosFiniteAppStoreTiers(concept).find((entry) => (
    amount === entry.referencePriceMinor || amount === entry.referencePriceMinor + 1
  )) ?? null;
};
