import * as Application from "expo-application";
import { Linking, Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  PRODUCT_CATEGORY,
  type CustomerInfo,
  type MakePurchaseResult,
  type PurchasesOfferings,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from "react-native-purchases";
import {
  readCurrentAccountSessionAuthority,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { debugLog, reportRuntimeError } from "./logger";
import { getRuntimeConfig } from "./runtimeConfig";
import { isRevenueCatPurchaseResultForProduct as validatesPurchaseResultForProduct } from "./revenuecatPurchaseClosure";

export type { PurchasesPackage } from "react-native-purchases";

export type RevenueCatConfigurationMode = "disabled" | "android-debug" | "android-release" | "ios-release";

export type RevenueCatProductionReadiness = {
  expectedAndroidPackage: string;
  applicationId: string;
  androidProductionPublicKeyConfigured: boolean;
  androidDebugPublicKeyConfigured: boolean;
  iosPublicKeyConfigured: boolean;
  anyPublicKeyConfigured: boolean;
};

export type RevenueCatConfigurationState = {
  mode: RevenueCatConfigurationMode;
  apiKey: string;
  shouldConfigure: boolean;
  reason?: string;
};

export type RevenueCatIdentityState = {
  status: "disabled" | "anonymous" | "identified" | "unavailable";
  appUserId: string;
  sourceUserId: string | null;
  isAnonymous: boolean;
  matchesSourceUser: boolean;
};

const APPLE_PLATFORM = Platform.OS === "ios";
const ANDROID_PLATFORM = Platform.OS === "android";
const CHILLYWOOD_ANDROID_PACKAGE = "com.chillywood.mobile";
const PLAY_STORE_SUBSCRIPTIONS_URL = "https://play.google.com/store/account/subscriptions";
const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const REVENUECAT_ANONYMOUS_PREFIX = "$RCAnonymousID:";
const INVALID_IDENTITY_LITERALS = new Set(["null", "undefined"]);
const PLAY_STORE_TEST_WARNING = "canMakePayments requires the Google Play Store";

let configuredMode: RevenueCatConfigurationMode | null = null;
let configuredApiKey = "";
let customerInfoListenerInstalled = false;
let logHandlerInstalled = false;
let revenueCatIdentityQueue: Promise<void> = Promise.resolve();

const normalizeText = (value: unknown) => String(value ?? "").trim();
const appStorePurchasesEnabled = () => (
  !APPLE_PLATFORM || getRuntimeConfig().revenueCat.appStorePurchasesEnabled === true
);
const normalizeIdentityText = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "";
  return INVALID_IDENTITY_LITERALS.has(normalized.toLowerCase()) ? "" : normalized;
};
const exactIdentityText = (value: unknown) => {
  const normalized = normalizeIdentityText(value);
  return typeof value === "string" && value === normalized ? normalized : "";
};

const normalizeRevenueCatIdentityState = (
  appUserId: unknown,
  sourceUserId?: string | null,
  available = true,
): RevenueCatIdentityState => {
  const normalizedAppUserId = normalizeIdentityText(appUserId);
  const normalizedSourceUserId = normalizeIdentityText(sourceUserId) || null;
  const status = !available ? "unavailable" : normalizedAppUserId
    ? normalizedAppUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX) ? "anonymous" : "identified"
    : "disabled";
  return {
    status,
    appUserId: normalizedAppUserId,
    sourceUserId: normalizedSourceUserId,
    isAnonymous: status === "anonymous",
    matchesSourceUser: status === "identified" && normalizedAppUserId === normalizedSourceUserId,
  };
};

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isCustomerInfo = (value: unknown): value is CustomerInfo => record(value) && record(value.entitlements)
  && record(value.entitlements.active) && record(value.entitlements.all)
  && Array.isArray(value.activeSubscriptions) && value.activeSubscriptions.every((entry) => !!normalizeIdentityText(entry))
  && !!normalizeIdentityText(value.originalAppUserId);
const isStoreProduct = (value: unknown): value is PurchasesStoreProduct => record(value)
  && !!normalizeIdentityText(value.identifier) && typeof value.price === "number" && Number.isFinite(value.price)
  && typeof value.priceString === "string" && typeof value.title === "string" && typeof value.description === "string";
const isPackage = (value: unknown): value is PurchasesPackage => record(value)
  && !!normalizeIdentityText(value.identifier) && isStoreProduct(value.product);
const isOffering = (value: unknown) => record(value) && !!normalizeIdentityText(value.identifier)
  && Array.isArray(value.availablePackages) && value.availablePackages.every(isPackage);
const isOfferings = (value: unknown): value is PurchasesOfferings => record(value) && record(value.all)
  && Object.entries(value.all).every(([key, offering]) => !!normalizeIdentityText(key) && isOffering(offering))
  && (value.current === null || isOffering(value.current));
const isPurchaseResultForProduct = (
  value: unknown,
  expectedProductIdentifier: string,
): value is MakePurchaseResult => validatesPurchaseResultForProduct(value, {
  expectedProductIdentifier,
  isCustomerInfo,
});

const serializeRevenueCatIdentityOperation = <T>(operation: () => Promise<T>) => {
  const result = revenueCatIdentityQueue.then(operation, operation);
  revenueCatIdentityQueue = result.then(() => undefined, () => undefined);
  return result;
};

const resetRevenueCatCustomerToAnonymous = async () => {
  await Purchases.logOut();
  const anonymousAppUserId = await getRevenueCatAppUserId();
  if (!anonymousAppUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX)) throw new Error("RevenueCat anonymous identity unavailable.");
  debugLog("revenuecat", "Reset RevenueCat customer to anonymous session");
  return anonymousAppUserId;
};

const installCustomerInfoListener = () => {
  if (customerInfoListenerInstalled) return;
  Purchases.addCustomerInfoUpdateListener(() => {
    debugLog("revenuecat", "Customer info updated", {
      providerPayloadLogged: false,
    });
  });
  customerInfoListenerInstalled = true;
};

const installRevenueCatLogHandler = () => {
  if (logHandlerInstalled) return;

  Purchases.setLogHandler((logLevel, message) => {
    if (!normalizeText(message)) return;
    if (!__DEV__) return;

    if (message.includes(PLAY_STORE_TEST_WARNING)) {
      return;
    }

    const prefixedMessage = "[RevenueCat] SDK diagnostic event (provider message redacted)";
    if (logLevel === LOG_LEVEL.ERROR) {
      console.warn(prefixedMessage);
      return;
    }
    if (logLevel === LOG_LEVEL.WARN) {
      console.warn(prefixedMessage);
      return;
    }
    if (logLevel === LOG_LEVEL.INFO) {
      console.info(prefixedMessage);
      return;
    }
    if (logLevel === LOG_LEVEL.DEBUG) {
      console.debug(prefixedMessage);
      return;
    }
    console.log(prefixedMessage);
  });

  logHandlerInstalled = true;
};

export function getRevenueCatProductionReadiness(): RevenueCatProductionReadiness {
  const runtime = getRuntimeConfig();
  const applicationId = normalizeText(Application.applicationId);
  const androidProductionPublicKeyConfigured = !!runtime.revenueCat.androidPublicSdkKey;
  const androidDebugPublicKeyConfigured = !!runtime.revenueCat.androidDebugPublicSdkKey;
  const iosPublicKeyConfigured = !!runtime.revenueCat.iosPublicSdkKey;

  return {
    expectedAndroidPackage: CHILLYWOOD_ANDROID_PACKAGE,
    applicationId,
    androidProductionPublicKeyConfigured,
    androidDebugPublicKeyConfigured,
    iosPublicKeyConfigured,
    anyPublicKeyConfigured: androidProductionPublicKeyConfigured || androidDebugPublicKeyConfigured || iosPublicKeyConfigured,
  };
}

export function getRevenueCatConfigurationState(): RevenueCatConfigurationState {
  const runtime = getRuntimeConfig();
  const applicationId = normalizeText(Application.applicationId);

  if (ANDROID_PLATFORM && __DEV__) {
    if (applicationId && applicationId !== CHILLYWOOD_ANDROID_PACKAGE) {
      return {
        mode: "disabled",
        apiKey: "",
        shouldConfigure: false,
        reason: "Skip RevenueCat in non-Chi'llywood Android runtimes.",
      };
    }

    return runtime.revenueCat.androidDebugPublicSdkKey
      ? {
          mode: "android-debug",
          apiKey: runtime.revenueCat.androidDebugPublicSdkKey,
          shouldConfigure: true,
        }
      : {
          mode: "disabled",
          apiKey: "",
          shouldConfigure: false,
          reason: "Missing Android debug RevenueCat public SDK key.",
        };
  }

  if (ANDROID_PLATFORM) {
    return runtime.revenueCat.androidPublicSdkKey
      ? {
          mode: "android-release",
          apiKey: runtime.revenueCat.androidPublicSdkKey,
          shouldConfigure: true,
        }
      : {
          mode: "disabled",
          apiKey: "",
          shouldConfigure: false,
          reason: "Android release RevenueCat public SDK key is not configured.",
        };
  }

  if (APPLE_PLATFORM) {
    return runtime.revenueCat.iosPublicSdkKey
      ? {
          mode: "ios-release",
          apiKey: runtime.revenueCat.iosPublicSdkKey,
          shouldConfigure: true,
        }
      : {
          mode: "disabled",
          apiKey: "",
          shouldConfigure: false,
          reason: "Apple RevenueCat public SDK key is not configured.",
        };
  }

  return {
    mode: "disabled",
    apiKey: "",
    shouldConfigure: false,
    reason: "RevenueCat is disabled on this platform.",
  };
}

export function configureRevenueCatOnce() {
  const state = getRevenueCatConfigurationState();
  if (!state.shouldConfigure) {
    debugLog("revenuecat", state.reason ?? "RevenueCat disabled");
    return state;
  }

  if (configuredMode === state.mode && configuredApiKey === state.apiKey) {
    installCustomerInfoListener();
    return state;
  }

  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    installRevenueCatLogHandler();
    Purchases.configure({
      apiKey: state.apiKey,
      appUserID: null,
      diagnosticsEnabled: __DEV__,
    });
    configuredMode = state.mode;
    configuredApiKey = state.apiKey;
    installCustomerInfoListener();
    debugLog("revenuecat", "Configured RevenueCat", {
      isDev: __DEV__,
      mode: state.mode,
      platform: Platform.OS,
    });
    return state;
  } catch (error) {
    configuredMode = null;
    configuredApiKey = "";
    reportRuntimeError("revenuecat-configure", error, {
      mode: state.mode,
      platform: Platform.OS,
    });
    throw error;
  }
}

export async function getRevenueCatAppUserId() {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return "";

  try {
    const appUserId = normalizeIdentityText(await withAuthorityReadDeadline<unknown>(Purchases.getAppUserID(), null));
    if (!appUserId) throw new Error("RevenueCat identity response unavailable.");
    return appUserId;
  } catch {
    reportRuntimeError("revenuecat-app-user-id", new Error("RevenueCat identity read failed."), {
      mode: state.mode,
    });
    return "";
  }
}

const syncRevenueCatCustomerIdentityInternal = async (sourceUserId?: string | null) => {
  const safeUserId = normalizeIdentityText(sourceUserId);
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) {
    return normalizeRevenueCatIdentityState("", safeUserId, !safeUserId);
  }

  const expectedAuthority = safeUserId ? await readCurrentAccountSessionAuthority() : null;
  if (safeUserId && (!expectedAuthority || expectedAuthority.restoreOnly || expectedAuthority.userId !== safeUserId)) {
    return normalizeRevenueCatIdentityState("", safeUserId, false);
  }
  const currentAppUserId = await getRevenueCatAppUserId();
  if (!currentAppUserId) return normalizeRevenueCatIdentityState("", safeUserId, false);
  if (!safeUserId) {
    if (await readCurrentAccountSessionAuthority()) return normalizeRevenueCatIdentityState(currentAppUserId, null, false);
    if (currentAppUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX)) {
      return normalizeRevenueCatIdentityState(currentAppUserId, null);
    }

    try {
      if (await readCurrentAccountSessionAuthority()) return normalizeRevenueCatIdentityState(currentAppUserId, null, false);
      const anonymousAppUserId = await resetRevenueCatCustomerToAnonymous();
      return normalizeRevenueCatIdentityState(anonymousAppUserId, null, !await readCurrentAccountSessionAuthority());
    } catch {
      reportRuntimeError("revenuecat-log-out", new Error("RevenueCat identity reset failed."), {
        mode: state.mode,
      });
      return normalizeRevenueCatIdentityState(currentAppUserId, null, false);
    }
  }

  if (!sameAccountSessionAuthority(expectedAuthority, await readCurrentAccountSessionAuthority())) {
    return normalizeRevenueCatIdentityState(currentAppUserId, safeUserId, false);
  }
  if (currentAppUserId === safeUserId) {
    return normalizeRevenueCatIdentityState(currentAppUserId, safeUserId);
  }

  try {
    const result: unknown = await Purchases.logIn(safeUserId);
    const verifiedAppUserId = await getRevenueCatAppUserId();
    if (!record(result) || typeof result.created !== "boolean" || !isCustomerInfo(result.customerInfo)
      || verifiedAppUserId !== safeUserId
      || !sameAccountSessionAuthority(expectedAuthority, await readCurrentAccountSessionAuthority())) {
      return normalizeRevenueCatIdentityState(verifiedAppUserId, safeUserId, false);
    }
    debugLog("revenuecat", "Synced RevenueCat customer identity", {
      created: result.created,
      identityMatched: true,
    });
    return normalizeRevenueCatIdentityState(verifiedAppUserId, safeUserId);
  } catch {
    reportRuntimeError("revenuecat-log-in", new Error("RevenueCat identity sync failed."), {
      mode: state.mode,
    });
    return normalizeRevenueCatIdentityState(currentAppUserId, safeUserId, false);
  }
};

export function syncRevenueCatCustomerIdentity(sourceUserId?: string | null) {
  const safeUserId = normalizeIdentityText(sourceUserId);
  const queued = serializeRevenueCatIdentityOperation(() => syncRevenueCatCustomerIdentityInternal(sourceUserId));
  return withAuthorityReadDeadline(
    queued,
    normalizeRevenueCatIdentityState("", safeUserId, false),
  );
}

export async function readRevenueCatCustomerInfo(options?: { refresh?: boolean }) {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return null;

  try {
    if (options?.refresh) {
      const invalidated = await withAuthorityReadDeadline(Promise.resolve(Purchases.invalidateCustomerInfoCache()).then(() => true), false);
      if (!invalidated) return null;
    }

    const customerInfo = await withAuthorityReadDeadline<unknown>(Purchases.getCustomerInfo(), null);
    return isCustomerInfo(customerInfo) ? customerInfo : null;
  } catch {
    reportRuntimeError("revenuecat-customer-info", new Error("RevenueCat customer info read failed."), {
      mode: state.mode,
      refresh: !!options?.refresh,
    });
    return null;
  }
}

export async function readRevenueCatOfferings() {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return null;

  try {
    const offerings = await withAuthorityReadDeadline<unknown>(Purchases.getOfferings(), null);
    return isOfferings(offerings) ? offerings : null;
  } catch (error) {
    reportRuntimeError("revenuecat-offerings", error, {
      mode: state.mode,
    });
    return null;
  }
}

export async function canMakeRevenueCatPurchases() {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return false;
  if (!appStorePurchasesEnabled()) return false;

  try {
    return await withAuthorityReadDeadline<unknown>(Purchases.canMakePayments(), false) === true;
  } catch (error) {
    reportRuntimeError("revenuecat-can-make-payments", error, {
      mode: state.mode,
    });
    return false;
  }
}

export async function readRevenueCatNonSubscriptionProducts(productIdentifiers: string[]) {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return [] as PurchasesStoreProduct[];

  const safeIdentifiers = Array.from(new Set(
    productIdentifiers
      .map((entry) => normalizeText(entry))
      .filter(Boolean),
  ));
  if (!safeIdentifiers.length) return [] as PurchasesStoreProduct[];

  try {
    const products = await withAuthorityReadDeadline<unknown>(
      Purchases.getProducts(safeIdentifiers, PRODUCT_CATEGORY.NON_SUBSCRIPTION), null,
    );
    return Array.isArray(products) && products.every(isStoreProduct) ? products : [] as PurchasesStoreProduct[];
  } catch (error) {
    reportRuntimeError("revenuecat-non-subscription-products", error, {
      mode: state.mode,
      productCount: safeIdentifiers.length,
    });
    return [] as PurchasesStoreProduct[];
  }
}

export async function readRevenueCatSubscriptionProducts(productIdentifiers: string[]) {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return [] as PurchasesStoreProduct[];

  const safeIdentifiers = Array.from(new Set(
    productIdentifiers
      .map((entry) => normalizeText(entry))
      .filter(Boolean),
  ));
  if (!safeIdentifiers.length) return [] as PurchasesStoreProduct[];

  try {
    const products = await withAuthorityReadDeadline<unknown>(
      Purchases.getProducts(safeIdentifiers, PRODUCT_CATEGORY.SUBSCRIPTION), null,
    );
    return Array.isArray(products) && products.every(isStoreProduct) ? products : [] as PurchasesStoreProduct[];
  } catch (error) {
    reportRuntimeError("revenuecat-subscription-products", error, {
      mode: state.mode,
      productCount: safeIdentifiers.length,
    });
    return [] as PurchasesStoreProduct[];
  }
}

export type RevenueCatMutationOptions = { authority?: AccountSessionAuthorityBinding | null };
const requireRevenueCatMutationAuthority = async (options?: RevenueCatMutationOptions) => {
  const current = await readCurrentAccountSessionAuthority();
  const expected = options?.authority === undefined ? current : options.authority;
  const appUserId = expected && !expected.restoreOnly ? await getRevenueCatAppUserId() : "";
  if (!expected || expected.restoreOnly || appUserId !== expected.userId
    || !sameAccountSessionAuthority(expected, await readCurrentAccountSessionAuthority())) {
    throw new Error("RevenueCat mutation authority is unavailable for the current account.");
  }
  return expected;
};
const runRevenueCatMutation = <T>(options: RevenueCatMutationOptions | undefined, operation: () => Promise<unknown>, valid: (value: unknown) => value is T) => (
  serializeRevenueCatIdentityOperation(async () => {
    const authority = await requireRevenueCatMutationAuthority(options);
    const result = await operation();
    if (!valid(result)) throw new Error("RevenueCat returned a malformed mutation result.");
    await requireRevenueCatMutationAuthority({ authority });
    return result;
  })
);

export function purchaseRevenueCatPackage(pkg: PurchasesPackage, options?: RevenueCatMutationOptions): Promise<MakePurchaseResult> {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return Promise.reject(new Error(state.reason ?? "RevenueCat is not configured."));
  if (!appStorePurchasesEnabled()) return Promise.reject(new Error("App Store purchases are disabled for this build."));
  if (!isPackage(pkg)) return Promise.reject(new Error("RevenueCat package is malformed."));
  const expectedProductIdentifier = normalizeIdentityText(pkg.product.identifier);
  if (pkg.product.identifier !== expectedProductIdentifier) {
    return Promise.reject(new Error("RevenueCat package product identity is malformed."));
  }
  return runRevenueCatMutation(
    options,
    () => Purchases.purchasePackage(pkg),
    (value): value is MakePurchaseResult => isPurchaseResultForProduct(value, expectedProductIdentifier),
  );
}

export function purchaseRevenueCatStoreProduct(product: PurchasesStoreProduct, options?: RevenueCatMutationOptions): Promise<MakePurchaseResult> {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return Promise.reject(new Error(state.reason ?? "RevenueCat is not configured."));
  if (!appStorePurchasesEnabled()) return Promise.reject(new Error("App Store purchases are disabled for this build."));
  if (!isStoreProduct(product)) return Promise.reject(new Error("RevenueCat product is malformed."));
  const expectedProductIdentifier = normalizeIdentityText(product.identifier);
  if (product.identifier !== expectedProductIdentifier) {
    return Promise.reject(new Error("RevenueCat product identity is malformed."));
  }
  return runRevenueCatMutation(
    options,
    () => Purchases.purchaseStoreProduct(product),
    (value): value is MakePurchaseResult => isPurchaseResultForProduct(value, expectedProductIdentifier),
  );
}

export function restoreRevenueCatPurchases(options?: RevenueCatMutationOptions): Promise<CustomerInfo> {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return Promise.reject(new Error(state.reason ?? "RevenueCat is not configured."));
  return runRevenueCatMutation(options, () => Purchases.restorePurchases(), isCustomerInfo);
}

export async function openRevenueCatManageSubscriptions() {
  const applicationId = normalizeText(Application.applicationId) || CHILLYWOOD_ANDROID_PACKAGE;
  const url = ANDROID_PLATFORM
    ? `${PLAY_STORE_SUBSCRIPTIONS_URL}?package=${encodeURIComponent(applicationId)}`
    : APPLE_SUBSCRIPTIONS_URL;

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch (error) {
    reportRuntimeError("revenuecat-manage-subscriptions", error, {
      platform: Platform.OS,
      url,
    });
    return false;
  }
}
