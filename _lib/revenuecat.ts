import * as Application from "expo-application";
import { Linking, Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type LogInResult,
  type MakePurchaseResult,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "react-native-purchases";

import { debugLog, reportRuntimeError } from "./logger";
import { getRuntimeConfig } from "./runtimeConfig";

export type RevenueCatConfigurationMode = "disabled" | "android-debug" | "android-release" | "ios-release";

export type RevenueCatConfigurationState = {
  mode: RevenueCatConfigurationMode;
  apiKey: string;
  shouldConfigure: boolean;
  reason?: string;
};

export type RevenueCatIdentityState = {
  status: "disabled" | "anonymous" | "identified";
  appUserId: string;
  sourceUserId: string | null;
  isAnonymous: boolean;
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
let latestCustomerInfo: CustomerInfo | null = null;
let latestOfferings: PurchasesOfferings | null = null;

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeIdentityText = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  return INVALID_IDENTITY_LITERALS.has(normalized.toLowerCase()) ? "" : normalized;
};

const normalizeRevenueCatIdentityState = (
  appUserId: string,
  sourceUserId?: string | null,
): RevenueCatIdentityState => ({
  status: appUserId
    ? appUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX)
      ? "anonymous"
      : "identified"
    : "disabled",
  appUserId,
  sourceUserId: normalizeIdentityText(sourceUserId) || null,
  isAnonymous: appUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX),
});

const syncConfiguredAppUserId = async (fallbackAppUserId?: string | null) => {
  const appUserId = normalizeIdentityText(await Purchases.getAppUserID())
    || normalizeIdentityText(fallbackAppUserId)
    || configuredAppUserId;
  configuredAppUserId = appUserId;
  return appUserId;
};

const resetRevenueCatCustomerToAnonymous = async () => {
  const customerInfo = await Purchases.logOut();
  latestCustomerInfo = customerInfo;
  const anonymousAppUserId = await syncConfiguredAppUserId(customerInfo.originalAppUserId);
  debugLog("revenuecat", "Reset RevenueCat customer to anonymous session", {
    appUserId: anonymousAppUserId,
  });
  return anonymousAppUserId;
};

const installCustomerInfoListener = () => {
  if (customerInfoListenerInstalled) return;
  Purchases.addCustomerInfoUpdateListener((customerInfo) => {
    latestCustomerInfo = customerInfo;
    if (!configuredAppUserId) {
      configuredAppUserId = normalizeIdentityText(customerInfo.originalAppUserId);
    }
    debugLog("revenuecat", "Customer info updated", {
      activeEntitlements: Object.keys(customerInfo.entitlements.active ?? {}).join(","),
      appUserId: configuredAppUserId,
    });
  });
  customerInfoListenerInstalled = true;
};

const installRevenueCatLogHandler = () => {
  if (logHandlerInstalled) return;

  Purchases.setLogHandler((logLevel, message) => {
    const safeMessage = normalizeText(message);
    if (!safeMessage) return;
    if (!__DEV__) return;

    if (safeMessage.includes(PLAY_STORE_TEST_WARNING)) {
      debugLog("revenuecat", safeMessage, {
        level: String(logLevel),
      });
      return;
    }

    const prefixedMessage = `[RevenueCat] ${safeMessage}`;
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
  } catch (error) {
    reportRuntimeError("revenuecat-app-user-id", error, {
      mode: state.mode,
    });
    return configuredAppUserId;
  }
}

export async function syncRevenueCatCustomerIdentity(sourceUserId?: string | null) {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) {
    return normalizeRevenueCatIdentityState("", sourceUserId);
  }

  const safeUserId = normalizeIdentityText(sourceUserId);
  const currentAppUserId = await getRevenueCatAppUserId();
  if (!safeUserId) {
    if (currentAppUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX)) {
      return normalizeRevenueCatIdentityState(currentAppUserId, null);
    }

    try {
      const anonymousAppUserId = await resetRevenueCatCustomerToAnonymous();
      return normalizeRevenueCatIdentityState(anonymousAppUserId, null);
    } catch (error) {
      reportRuntimeError("revenuecat-log-out", error, {
        mode: state.mode,
      });
      return normalizeRevenueCatIdentityState(currentAppUserId, null);
    }
  }

  if (currentAppUserId === safeUserId) {
    return normalizeRevenueCatIdentityState(currentAppUserId, safeUserId);
  }

  try {
    const result: LogInResult = await Purchases.logIn(safeUserId);
    latestCustomerInfo = result.customerInfo;
    configuredAppUserId = await syncConfiguredAppUserId(safeUserId);
    debugLog("revenuecat", "Synced RevenueCat customer identity", {
      appUserId: configuredAppUserId,
      created: result.created,
      sourceUserId: safeUserId,
    });
    return normalizeRevenueCatIdentityState(configuredAppUserId, safeUserId);
  } catch (error) {
    reportRuntimeError("revenuecat-log-in", error, {
      mode: state.mode,
      sourceUserId: safeUserId,
    });
    return normalizeRevenueCatIdentityState(currentAppUserId, safeUserId);
  }
}

export async function readRevenueCatCustomerInfo(options?: { refresh?: boolean }) {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) return null;

  try {
    if (options?.refresh) {
      await Purchases.invalidateCustomerInfoCache();
    }

    const customerInfo = await Purchases.getCustomerInfo();
    latestCustomerInfo = customerInfo;
    if (!configuredAppUserId) {
      configuredAppUserId = await syncConfiguredAppUserId(customerInfo.originalAppUserId);
    }
    return customerInfo;
  } catch (error) {
    reportRuntimeError("revenuecat-customer-info", error, {
      mode: state.mode,
      refresh: !!options?.refresh,
    });
    return latestCustomerInfo;
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

  const result = await Purchases.purchasePackage(pkg);
  latestCustomerInfo = result.customerInfo;
  configuredAppUserId = await getRevenueCatAppUserId() || configuredAppUserId;
  return result;
}

export async function restoreRevenueCatPurchases() {
  const state = configureRevenueCatOnce();
  if (!state.shouldConfigure) {
    throw new Error(state.reason ?? "RevenueCat is not configured.");
  }

  const customerInfo = await Purchases.restorePurchases();
  latestCustomerInfo = customerInfo;
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
