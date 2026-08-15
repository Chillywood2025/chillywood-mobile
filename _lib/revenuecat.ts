import * as Application from "expo-application";
import { Linking, Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  PRODUCT_CATEGORY,
  type LogInResult,
  type MakePurchaseResult,
  type PurchasesOfferings,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from "react-native-purchases";
import {
  readCurrentAccountSessionAuthority,
  sameAccountSessionAuthority,
} from "./accountSessionAuthority";
import { debugLog, reportRuntimeError } from "./logger";
import { getRuntimeConfig } from "./runtimeConfig";

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
let configuredAppUserId = "";
let customerInfoListenerInstalled = false;
let logHandlerInstalled = false;
let latestOfferings: PurchasesOfferings | null = null;
let revenueCatIdentityQueue: Promise<void> = Promise.resolve();

const normalizeText = (value: unknown) => String(value ?? "").trim();
const appStorePurchasesEnabled = () => (
  !APPLE_PLATFORM || getRuntimeConfig().revenueCat.appStorePurchasesEnabled === true
);
const normalizeIdentityText = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  return INVALID_IDENTITY_LITERALS.has(normalized.toLowerCase()) ? "" : normalized;
};

const normalizeRevenueCatIdentityState = (
  appUserId: string,
  sourceUserId?: string | null,
  available = true,
): RevenueCatIdentityState => {
  const normalizedSourceUserId = normalizeIdentityText(sourceUserId) || null;
  const matchesSourceUser = !!normalizedSourceUserId && appUserId === normalizedSourceUserId;
  return {
    status: !available
      ? "unavailable"
      : appUserId
        ? appUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX)
          ? "anonymous"
          : "identified"
        : "disabled",
    appUserId,
    sourceUserId: normalizedSourceUserId,
    isAnonymous: appUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX),
    matchesSourceUser,
  };
};

const serializeRevenueCatIdentityOperation = <T>(operation: () => Promise<T>) => {
  const result = revenueCatIdentityQueue.then(operation, operation);
  revenueCatIdentityQueue = result.then(() => undefined, () => undefined);
  return result;
};

const syncConfiguredAppUserId = async (fallbackAppUserId?: string | null) => {
  const appUserId = normalizeIdentityText(await Purchases.getAppUserID())
    || normalizeIdentityText(fallbackAppUserId)
    || configuredAppUserId;
  configuredAppUserId = appUserId;
  return appUserId;
};

const resetRevenueCatCustomerToAnonymous = async () => {
  const customerInfo = await Purchases.logOut();
  const anonymousAppUserId = await syncConfiguredAppUserId(customerInfo.originalAppUserId);
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
    configuredAppUserId = "";
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
    configuredAppUserId = "";
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
    const appUserId = normalizeIdentityText(await Purchases.getAppUserID());
    if (appUserId) {
      configuredAppUserId = appUserId;
    }
    return configuredAppUserId;
  } catch {
    reportRuntimeError("revenuecat-app-user-id", new Error("RevenueCat identity read failed."), {
      mode: state.mode,
    });
    return "";
  }
}

const syncRevenueCatCustomerIdentityInternal = async (sourceUserId?: string | null) => {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) {
    return normalizeRevenueCatIdentityState("", sourceUserId);
  }

  const safeUserId = normalizeIdentityText(sourceUserId);
  const expectedAuthority = safeUserId ? await readCurrentAccountSessionAuthority() : null;
  if (safeUserId && (!expectedAuthority || expectedAuthority.restoreOnly || expectedAuthority.userId !== safeUserId)) {
    return normalizeRevenueCatIdentityState("", safeUserId, false);
  }
  const currentAppUserId = await getRevenueCatAppUserId();
  if (!safeUserId) {
    if (currentAppUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX)) {
      return normalizeRevenueCatIdentityState(currentAppUserId, null);
    }

    try {
      const anonymousAppUserId = await resetRevenueCatCustomerToAnonymous();
      return normalizeRevenueCatIdentityState(anonymousAppUserId, null);
    } catch {
      reportRuntimeError("revenuecat-log-out", new Error("RevenueCat identity reset failed."), {
        mode: state.mode,
      });
      return normalizeRevenueCatIdentityState(currentAppUserId, null, false);
    }
  }

  if (currentAppUserId === safeUserId) {
    return normalizeRevenueCatIdentityState(currentAppUserId, safeUserId);
  }

  try {
    const result: LogInResult = await Purchases.logIn(safeUserId);
    configuredAppUserId = await syncConfiguredAppUserId(safeUserId);
    if (!sameAccountSessionAuthority(expectedAuthority, await readCurrentAccountSessionAuthority())) {
      return normalizeRevenueCatIdentityState(configuredAppUserId, safeUserId, false);
    }
    debugLog("revenuecat", "Synced RevenueCat customer identity", {
      created: result.created,
      identityMatched: configuredAppUserId === safeUserId,
    });
    return normalizeRevenueCatIdentityState(configuredAppUserId, safeUserId);
  } catch {
    reportRuntimeError("revenuecat-log-in", new Error("RevenueCat identity sync failed."), {
      mode: state.mode,
    });
    return normalizeRevenueCatIdentityState(currentAppUserId, safeUserId, false);
  }
};

export function syncRevenueCatCustomerIdentity(sourceUserId?: string | null) {
  return serializeRevenueCatIdentityOperation(() => syncRevenueCatCustomerIdentityInternal(sourceUserId));
}

export async function readRevenueCatCustomerInfo(options?: { refresh?: boolean }) {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return null;

  try {
    if (options?.refresh) {
      await Purchases.invalidateCustomerInfoCache();
    }

    const customerInfo = await Purchases.getCustomerInfo();
    if (!configuredAppUserId) {
      configuredAppUserId = await syncConfiguredAppUserId(customerInfo.originalAppUserId);
    }
    return customerInfo;
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
    const offerings = await Purchases.getOfferings();
    latestOfferings = offerings;
    return offerings;
  } catch (error) {
    reportRuntimeError("revenuecat-offerings", error, {
      mode: state.mode,
    });
    return latestOfferings;
  }
}

export async function canMakeRevenueCatPurchases() {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return false;
  if (!appStorePurchasesEnabled()) return false;

  try {
    return await Purchases.canMakePayments();
  } catch (error) {
    reportRuntimeError("revenuecat-can-make-payments", error, {
      mode: state.mode,
    });
    return false;
  }
}

export async function purchaseRevenueCatPackage(pkg: PurchasesPackage): Promise<MakePurchaseResult> {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) {
    throw new Error(state.reason ?? "RevenueCat is not configured.");
  }
  if (!appStorePurchasesEnabled()) {
    throw new Error("App Store purchases are disabled for this build.");
  }

  const result = await Purchases.purchasePackage(pkg);
  configuredAppUserId = await getRevenueCatAppUserId() || configuredAppUserId;
  return result;
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
    return await Purchases.getProducts(safeIdentifiers, PRODUCT_CATEGORY.NON_SUBSCRIPTION);
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
    return await Purchases.getProducts(safeIdentifiers, PRODUCT_CATEGORY.SUBSCRIPTION);
  } catch (error) {
    reportRuntimeError("revenuecat-subscription-products", error, {
      mode: state.mode,
      productCount: safeIdentifiers.length,
    });
    return [] as PurchasesStoreProduct[];
  }
}

export async function purchaseRevenueCatStoreProduct(product: PurchasesStoreProduct): Promise<MakePurchaseResult> {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) {
    throw new Error(state.reason ?? "RevenueCat is not configured.");
  }
  if (!appStorePurchasesEnabled()) {
    throw new Error("App Store purchases are disabled for this build.");
  }

  const result = await Purchases.purchaseStoreProduct(product);
  configuredAppUserId = await getRevenueCatAppUserId() || configuredAppUserId;
  return result;
}

export async function restoreRevenueCatPurchases() {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) {
    throw new Error(state.reason ?? "RevenueCat is not configured.");
  }

  const customerInfo = await Purchases.restorePurchases();
  configuredAppUserId = await getRevenueCatAppUserId() || configuredAppUserId;
  return customerInfo;
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
