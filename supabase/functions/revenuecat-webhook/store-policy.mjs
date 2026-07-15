const normalizeText = (value) => String(value ?? "").trim();

export const REVENUECAT_STORES = Object.freeze({
  APP_STORE: "APP_STORE",
  MAC_APP_STORE: "MAC_APP_STORE",
  PLAY_STORE: "PLAY_STORE",
});

export const REVENUECAT_PROVIDERS = Object.freeze({
  APP_STORE: "revenuecat_app_store",
  GENERIC: "revenuecat",
  GOOGLE_PLAY: "revenuecat_google_play",
});

export function resolveRevenueCatStorePolicy(storeValue) {
  const store = normalizeText(storeValue).toUpperCase();

  if (store === REVENUECAT_STORES.APP_STORE || store === REVENUECAT_STORES.MAC_APP_STORE) {
    return Object.freeze({
      platform: "ios",
      provider: REVENUECAT_PROVIDERS.APP_STORE,
      store: "app_store",
      rawStore: store,
      supportsGoogleBasePlans: false,
    });
  }

  if (store === REVENUECAT_STORES.PLAY_STORE) {
    return Object.freeze({
      platform: "android",
      provider: REVENUECAT_PROVIDERS.GOOGLE_PLAY,
      store: "google_play",
      rawStore: store,
      supportsGoogleBasePlans: true,
    });
  }

  return Object.freeze({
    platform: "unknown",
    provider: REVENUECAT_PROVIDERS.GENERIC,
    store: "unknown",
    rawStore: store,
    supportsGoogleBasePlans: false,
  });
}

export function providerProductIdCandidatesForStore(productIdValue, storeValue) {
  const productId = normalizeText(productIdValue);
  if (!productId) return [];

  const policy = typeof storeValue === "object" && storeValue
    ? storeValue
    : resolveRevenueCatStorePolicy(storeValue);

  // Apple product identifiers are permanent exact identifiers. A colon is not
  // an App Store base-plan delimiter and must never be stripped.
  if (!policy.supportsGoogleBasePlans) return [productId];

  const withoutBasePlan = productId.includes(":") ? productId.split(":")[0] : productId;
  return Array.from(new Set([
    productId,
    withoutBasePlan,
    `${withoutBasePlan}:monthly`,
  ].map(normalizeText).filter(Boolean)));
}

export function appStoreSwitchAllowsEnvironment(switchStateValue, environmentValue) {
  const switchState = normalizeText(switchStateValue).toLowerCase();
  const environment = normalizeText(environmentValue).toLowerCase();
  if (switchState === "on") return true;
  return switchState === "sandbox_only" && environment === "sandbox";
}

export function isSafeStoreMapping(mapping) {
  if (!mapping || typeof mapping !== "object") return false;
  if (mapping.grants_livekit_authority === true || mapping.creates_payable_balance === true) return false;
  if (mapping.concept === "creator_tip") return mapping.unlocks_digital_access !== true;
  return true;
}
