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

export const REVENUECAT_TERMINAL_LIFECYCLE_EVENTS = Object.freeze(new Set([
  "CANCELLATION",
  "EXPIRATION",
  "REFUND",
  "REVOCATION",
  "SUBSCRIPTION_PAUSED",
]));

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

export function isTerminalRevenueCatLifecycleEvent(eventTypeValue) {
  return REVENUECAT_TERMINAL_LIFECYCLE_EVENTS.has(normalizeText(eventTypeValue).toUpperCase());
}

export function shouldProcessRevenueCatAppStoreEvent(
  switchStateValue,
  environmentValue,
  eventTypeValue,
) {
  return appStoreSwitchAllowsEnvironment(switchStateValue, environmentValue)
    || isTerminalRevenueCatLifecycleEvent(eventTypeValue);
}

export function canReconcileExistingProviderEventIntent(
  intent,
  providerEventIdValue,
  eventOccurredAtValue,
) {
  if (!intent || typeof intent !== "object") return false;

  const providerEventId = normalizeText(providerEventIdValue);
  if (!providerEventId) return false;

  const status = normalizeText(intent.status).toLowerCase();
  if (status === "consumed") {
    const metadata = intent.metadata && typeof intent.metadata === "object"
      ? intent.metadata
      : {};
    return normalizeText(metadata.consumed_by_provider_event_id) === providerEventId;
  }

  if (status !== "pending") return false;
  const eventTime = Date.parse(normalizeText(eventOccurredAtValue));
  const expiryTime = Date.parse(normalizeText(intent.expires_at));
  return Number.isFinite(eventTime) && Number.isFinite(expiryTime) && eventTime <= expiryTime;
}

export function isValidPremiumStoreProductResolution(
  resolution,
  expectedProductIdValue,
  environmentValue,
  eventTypeValue,
) {
  if (!resolution || typeof resolution !== "object") return false;
  if (!resolution.product || typeof resolution.product !== "object") return false;
  if (!normalizeText(resolution.product.id)) return false;
  if (normalizeText(resolution.product.product_type) !== "premium_subscription") return false;

  const storePolicy = resolution.storePolicy && typeof resolution.storePolicy === "object"
    ? resolution.storePolicy
    : {};
  const provider = normalizeText(storePolicy.provider);
  const expectedProductId = normalizeText(expectedProductIdValue);
  if (provider === REVENUECAT_PROVIDERS.GOOGLE_PLAY) {
    const productProvider = normalizeText(resolution.product.provider);
    if (![REVENUECAT_PROVIDERS.GOOGLE_PLAY, REVENUECAT_PROVIDERS.GENERIC].includes(productProvider)) {
      return false;
    }
    const resolvedProviderProductId = normalizeText(
      resolution.providerProductId || resolution.product.provider_product_id,
    );
    return providerProductIdCandidatesForStore(expectedProductId, storePolicy)
      .includes(resolvedProviderProductId);
  }
  if (provider !== REVENUECAT_PROVIDERS.APP_STORE) {
    return provider === REVENUECAT_PROVIDERS.GENERIC
      && normalizeText(resolution.product.provider) === REVENUECAT_PROVIDERS.GENERIC
      && normalizeText(resolution.product.provider_product_id) === expectedProductId;
  }

  const mapping = resolution.mapping && typeof resolution.mapping === "object"
    ? resolution.mapping
    : null;
  if (!mapping || !isSafeStoreMapping(mapping)) return false;
  if (normalizeText(mapping.platform) !== "ios") return false;
  if (normalizeText(mapping.store) !== "app_store") return false;
  if (normalizeText(mapping.provider) !== REVENUECAT_PROVIDERS.APP_STORE) return false;
  if (normalizeText(mapping.concept) !== "premium") return false;
  if (normalizeText(mapping.provider_product_id) !== expectedProductId) return false;
  if (mapping.unlocks_digital_access !== true) return false;

  if (isTerminalRevenueCatLifecycleEvent(eventTypeValue)) return true;

  const environment = normalizeText(environmentValue).toLowerCase();
  if (environment === "sandbox") {
    return normalizeText(mapping.environment) === "sandbox"
      && normalizeText(mapping.status) === "sandbox";
  }
  if (environment === "production") {
    // Production access requires an independently activated mapping. The
    // database active-proof constraint additionally requires provider proof
    // and explicit owner release approval before this state can exist.
    return normalizeText(mapping.environment) === "production"
      && normalizeText(mapping.status) === "active";
  }
  return false;
}

export function isSafeStoreMapping(mapping) {
  if (!mapping || typeof mapping !== "object") return false;
  if (mapping.grants_livekit_authority === true || mapping.creates_payable_balance === true) return false;
  if (mapping.concept === "creator_tip") return mapping.unlocks_digital_access !== true;
  return true;
}
