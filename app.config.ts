import fs from "node:fs";
import path from "node:path";

import type { ConfigContext, ExpoConfig } from "@expo/config";

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeRuntimeEnvironment = (value: unknown) => (
  normalizeText(value).toLowerCase() === "closed-beta" ? "closed-beta" : "public-v1"
);
const normalizeBoolean = (value: unknown) => ["1", "true", "yes", "on"].includes(
  normalizeText(value).toLowerCase(),
);
const CONFIG_DIR = process.cwd();
const DEPLOYED_LIVEKIT_SERVER_URL = "wss://live.chillywoodstream.com";
const DEPLOYED_SUPABASE_FUNCTIONS_URL = "https://network-proof.chillywoodstream.com";
const DEPLOYED_LIVEKIT_TOKEN_ENDPOINT = `${DEPLOYED_SUPABASE_FUNCTIONS_URL}/functions/v1/livekit-token`;
const DEPLOYED_PRIVACY_POLICY_URL = "https://chillywoodstream.com/privacy";
const DEPLOYED_TERMS_OF_SERVICE_URL = "https://chillywoodstream.com/terms";
const DEPLOYED_ACCOUNT_DELETION_URL = "https://chillywoodstream.com/account-deletion";
const DEPLOYED_COPYRIGHT_REPORT_URL = "https://chillywoodstream.com/copyright-report";
const DEPLOYED_SUPPORT_EMAIL = "support@chillywoodstream.com";
const IOS_ASSOCIATED_DOMAIN = "applinks:chillywoodstream.com";
const IOS_PRIVACY_MANIFEST_PATH = path.join(CONFIG_DIR, "config", "ios", "privacy-manifest.json");
const ANDROID_RELEASE_MANIFEST_PATH = path.join(CONFIG_DIR, "config", "release", "android-production.json");
const ANDROID_CHAT_QA_RELEASE_MANIFEST_PATH = path.join(
  CONFIG_DIR,
  "config",
  "release",
  "android-chat-livekit-qa.json",
);
const IOS_PHOTO_LIBRARY_USAGE_DESCRIPTION = "Chi'llywood accesses photos you choose for your profile and social images.";
const IOS_RNFIREBASE_STATIC_PODS = [
  "RNFBAnalytics",
  "RNFBApp",
  "RNFBCrashlytics",
  "RNFBPerf",
  "RNFBRemoteConfig",
] as const;
const ANDROID_APP_LINK_HOST = "chillywoodstream.com";
const ANDROID_APP_LINK_EXACT_PATHS = [
  "/auth",
  "/auth-callback",
  "/auth/reset-password",
  "/auth/v1/verify",
  "/auth/verify",
  "/callback",
  "/channel",
  "/confirm",
  "/player",
  "/profile",
  "/reset-password",
  "/spectate",
  "/title",
  "/v1/verify",
  "/verify",
  "/watch-party",
] as const;
const ANDROID_APP_LINK_PATH_PREFIXES = [
  "/auth/",
  "/auth-callback/",
  "/auth/reset-password/",
  "/auth/v1/verify/",
  "/auth/verify/",
  "/callback/",
  "/channel/",
  "/confirm/",
  "/player/",
  "/profile/",
  "/reset-password/",
  "/spectate/",
  "/title/",
  "/v1/verify/",
  "/verify/",
  "/watch-party/",
] as const;
const CHILLY_CHAT_NOTIFICATION_SOUND_FILES = [
  "./assets/sounds/chilly-chat/chilly_ring.wav",
  "./assets/sounds/chilly-chat/skyline_pulse.wav",
  "./assets/sounds/chilly-chat/theater_bell.wav",
  "./assets/sounds/chilly-chat/velvet_knock.wav",
  "./assets/sounds/chilly-chat/quiet_buzz.wav",
  "./assets/sounds/chilly-chat/classic_phone.wav",
] as const;

const resolveExistingFile = (...candidates: (string | undefined)[]) => {
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) continue;

    const absolutePath = path.resolve(CONFIG_DIR, normalized);
    if (fs.existsSync(absolutePath)) return normalized;
  }

  return undefined;
};

const mergePlugins = (
  existingPlugins: ExpoConfig["plugins"],
  nextPlugins: NonNullable<ExpoConfig["plugins"]>,
): NonNullable<ExpoConfig["plugins"]> => {
  const merged = Array.isArray(existingPlugins) ? [...existingPlugins] : [];

  nextPlugins.forEach((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    const currentIndex = merged.findIndex((entry) => (Array.isArray(entry) ? entry[0] : entry) === pluginName);

    if (currentIndex >= 0) {
      merged[currentIndex] = plugin;
      return;
    }

    merged.push(plugin);
  });

  return merged;
};

const buildAndroidAppLinkIntentFilters = (): NonNullable<NonNullable<ExpoConfig["android"]>["intentFilters"]> => [
  ...ANDROID_APP_LINK_EXACT_PATHS.map((appLinkPath) => ({
    action: "VIEW",
    autoVerify: true,
    category: ["BROWSABLE", "DEFAULT"],
    data: {
      host: ANDROID_APP_LINK_HOST,
      path: appLinkPath,
      scheme: "https",
    },
  })),
  ...ANDROID_APP_LINK_PATH_PREFIXES.map((pathPrefix) => ({
    action: "VIEW",
    autoVerify: true,
    category: ["BROWSABLE", "DEFAULT"],
    data: {
      host: ANDROID_APP_LINK_HOST,
      pathPrefix,
      scheme: "https",
    },
  })),
];

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const existingExtra = (base.extra ?? {}) as Record<string, unknown>;
  const existingAndroid = (
    base.android && typeof base.android === "object" && !Array.isArray(base.android)
      ? base.android
      : {}
  ) as NonNullable<ExpoConfig["android"]>;
  const existingIos = (
    base.ios && typeof base.ios === "object" && !Array.isArray(base.ios)
      ? base.ios
      : {}
  ) as NonNullable<ExpoConfig["ios"]>;
  const existingIosInfoPlist = (
    existingIos.infoPlist && typeof existingIos.infoPlist === "object" && !Array.isArray(existingIos.infoPlist)
      ? existingIos.infoPlist
      : {}
  ) as Record<string, unknown>;
  const existingIosEntitlements = (
    existingIos.entitlements && typeof existingIos.entitlements === "object" && !Array.isArray(existingIos.entitlements)
      ? existingIos.entitlements
      : {}
  ) as Record<string, unknown>;
  const existingRuntime = (
    existingExtra.runtime && typeof existingExtra.runtime === "object" && !Array.isArray(existingExtra.runtime)
      ? existingExtra.runtime
      : {}
  ) as Record<string, unknown>;
  const existingRevenueCat = (
    existingRuntime.revenueCat && typeof existingRuntime.revenueCat === "object" && !Array.isArray(existingRuntime.revenueCat)
      ? existingRuntime.revenueCat
      : {}
  ) as Record<string, unknown>;
  const existingCommunication = (
    existingRuntime.communication && typeof existingRuntime.communication === "object" && !Array.isArray(existingRuntime.communication)
      ? existingRuntime.communication
      : {}
  ) as Record<string, unknown>;
  const existingLiveKit = (
    existingRuntime.livekit && typeof existingRuntime.livekit === "object" && !Array.isArray(existingRuntime.livekit)
      ? existingRuntime.livekit
      : {}
  ) as Record<string, unknown>;
  const existingLegal = (
    existingRuntime.legal && typeof existingRuntime.legal === "object" && !Array.isArray(existingRuntime.legal)
      ? existingRuntime.legal
      : {}
  ) as Record<string, unknown>;
  const androidGoogleServicesFile = resolveExistingFile(
    typeof existingAndroid.googleServicesFile === "string" ? existingAndroid.googleServicesFile : undefined,
    "./google-services.json",
    "./android/app/google-services.json",
  );
  const configuredIosGoogleServicesFile = normalizeText(process.env.IOS_GOOGLE_SERVICES_FILE);
  const iosGoogleServicesFile = configuredIosGoogleServicesFile || resolveExistingFile(
    typeof existingIos.googleServicesFile === "string" ? existingIos.googleServicesFile : undefined,
    "./GoogleService-Info.plist",
  );
  const iosQaRuntimeVersion = normalizeText(process.env.IOS_QA_RUNTIME_VERSION);
  const androidReleaseManifest = JSON.parse(
    fs.readFileSync(ANDROID_RELEASE_MANIFEST_PATH, "utf8"),
  ) as { packageIdentifier?: unknown; runtimeVersion?: unknown };
  const androidChatQaReleaseManifest = JSON.parse(
    fs.readFileSync(ANDROID_CHAT_QA_RELEASE_MANIFEST_PATH, "utf8"),
  ) as { packageIdentifier?: unknown; runtimeVersion?: unknown };
  const androidRuntimeVersion = normalizeText(androidReleaseManifest.runtimeVersion);
  const androidChatQaRuntimeVersion = normalizeText(
    process.env.ANDROID_CHAT_LIVEKIT_QA_RUNTIME_VERSION,
  );
  if (normalizeText(androidReleaseManifest.packageIdentifier) !== normalizeText(existingAndroid.package)) {
    throw new Error("Android release manifest packageIdentifier does not match app.json.");
  }
  if (!androidRuntimeVersion || androidRuntimeVersion === normalizeText(base.runtimeVersion)) {
    throw new Error("Android release manifest must define a dedicated native runtime different from the shared legacy runtime.");
  }
  if (
    normalizeText(androidChatQaReleaseManifest.packageIdentifier)
    !== normalizeText(existingAndroid.package)
  ) {
    throw new Error("Android Chat QA release manifest packageIdentifier does not match app.json.");
  }
  if (
    androidChatQaRuntimeVersion
    && (
      androidChatQaRuntimeVersion !== normalizeText(androidChatQaReleaseManifest.runtimeVersion)
      || androidChatQaRuntimeVersion === androidRuntimeVersion
      || androidChatQaRuntimeVersion === normalizeText(base.runtimeVersion)
    )
  ) {
    throw new Error("Android Chat QA runtime must match its isolated release manifest and native boundary.");
  }
  const iosAssociatedDomains = [
    ...(Array.isArray(existingIos.associatedDomains) ? existingIos.associatedDomains : []),
    IOS_ASSOCIATED_DOMAIN,
  ].filter((value, index, values) => values.indexOf(value) === index);
  const existingAssociatedDomainEntitlements = Array.isArray(
    existingIosEntitlements["com.apple.developer.associated-domains"],
  )
    ? existingIosEntitlements["com.apple.developer.associated-domains"] as string[]
    : [];
  const iosPrivacyManifests = JSON.parse(
    fs.readFileSync(IOS_PRIVACY_MANIFEST_PATH, "utf8"),
  ) as NonNullable<NonNullable<ExpoConfig["ios"]>["privacyManifests"]>;

  return {
    ...base,
    updates: {
      ...base.updates,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
    android: {
      ...base.android,
      runtimeVersion: androidChatQaRuntimeVersion || androidRuntimeVersion,
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
      intentFilters: [
        ...(Array.isArray(existingAndroid.intentFilters) ? existingAndroid.intentFilters : []),
        ...buildAndroidAppLinkIntentFilters(),
      ],
    },
    ios: {
      ...base.ios,
      ...(iosQaRuntimeVersion ? { runtimeVersion: iosQaRuntimeVersion } : {}),
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
      associatedDomains: iosAssociatedDomains,
      privacyManifests: iosPrivacyManifests,
      entitlements: {
        ...existingIosEntitlements,
        "com.apple.developer.associated-domains": [
          ...existingAssociatedDomainEntitlements,
          IOS_ASSOCIATED_DOMAIN,
        ].filter((value, index, values) => values.indexOf(value) === index),
      },
      infoPlist: {
        ...existingIosInfoPlist,
        NSPhotoLibraryUsageDescription: normalizeText(
          existingIosInfoPlist.NSPhotoLibraryUsageDescription || IOS_PHOTO_LIBRARY_USAGE_DESCRIPTION,
        ),
      },
    },
    plugins: mergePlugins(base.plugins, [
      "expo-asset",
      "@livekit/react-native-expo-plugin",
      "./plugins/withLiveKitIosStaticFrameworkCompatibility",
      [
        "expo-notifications",
        {
          sounds: CHILLY_CHAT_NOTIFICATION_SOUND_FILES,
        },
      ],
      "./plugins/withChillyChatNativeCallNotifications",
      "./plugins/withChillyChatIosNativeCalls",
      "@react-native-firebase/app",
      "@react-native-firebase/crashlytics",
      "@react-native-firebase/perf",
      [
        "expo-build-properties",
        {
          ios: {
            useFrameworks: "static",
            forceStaticLinking: [...IOS_RNFIREBASE_STATIC_PODS],
          },
        },
      ],
    ]),
    extra: {
      ...existingExtra,
      runtime: {
        ...existingRuntime,
        supabaseUrl: normalizeText(process.env.EXPO_PUBLIC_SUPABASE_URL || existingRuntime.supabaseUrl),
        supabaseFunctionsUrl: normalizeText(
          process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL
          || existingRuntime.supabaseFunctionsUrl
          || DEPLOYED_SUPABASE_FUNCTIONS_URL,
        ),
        supabaseAnonKey: normalizeText(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || existingRuntime.supabaseAnonKey),
        betaOperatorAllowlist: normalizeText(
          process.env.EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST || existingRuntime.betaOperatorAllowlist,
        ),
        betaEnvironment: normalizeRuntimeEnvironment(
          process.env.EXPO_PUBLIC_BETA_ENVIRONMENT || existingRuntime.betaEnvironment,
        ),
        legal: {
          ...existingLegal,
          copyrightReportUrl: normalizeText(
            process.env.EXPO_PUBLIC_COPYRIGHT_REPORT_URL
            || process.env.EXPO_PUBLIC_DMCA_URL
            || existingLegal.copyrightReportUrl
            || existingLegal.dmcaUrl
            || DEPLOYED_COPYRIGHT_REPORT_URL,
          ),
          privacyPolicyUrl: normalizeText(
            process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || existingLegal.privacyPolicyUrl || DEPLOYED_PRIVACY_POLICY_URL,
          ),
          termsOfServiceUrl: normalizeText(
            process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL
            || existingLegal.termsOfServiceUrl
            || DEPLOYED_TERMS_OF_SERVICE_URL,
          ),
          accountDeletionUrl: normalizeText(
            process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL
            || existingLegal.accountDeletionUrl
            || DEPLOYED_ACCOUNT_DELETION_URL,
          ),
          supportEmail: normalizeText(
            process.env.EXPO_PUBLIC_SUPPORT_EMAIL || existingLegal.supportEmail || DEPLOYED_SUPPORT_EMAIL,
          ),
        },
        communication: {
          ...existingCommunication,
          // `eas update --environment production` can supply the public
          // production value after command-local values are evaluated. The
          // isolated ios-qa runtime is itself an explicit native-call
          // boundary, so keep its manifest aligned with the build profile.
          iosNativeCallsEnabled: iosQaRuntimeVersion
            ? true
            : normalizeBoolean(
              process.env.EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED || existingCommunication.iosNativeCallsEnabled,
            ),
          iosOrdinaryPushEnabled: normalizeBoolean(
            process.env.EXPO_PUBLIC_IOS_ORDINARY_PUSH_ENABLED || existingCommunication.iosOrdinaryPushEnabled,
          ),
          iceServers: normalizeText(
            process.env.EXPO_PUBLIC_COMMUNICATION_ICE_SERVERS || existingCommunication.iceServers,
          ),
          stunUrls: normalizeText(
            process.env.EXPO_PUBLIC_COMMUNICATION_STUN_URLS || existingCommunication.stunUrls,
          ),
          turnUrls: normalizeText(
            process.env.EXPO_PUBLIC_COMMUNICATION_TURN_URLS || existingCommunication.turnUrls,
          ),
          turnUsername: normalizeText(
            process.env.EXPO_PUBLIC_COMMUNICATION_TURN_USERNAME || existingCommunication.turnUsername,
          ),
          turnCredential: normalizeText(
            process.env.EXPO_PUBLIC_COMMUNICATION_TURN_CREDENTIAL || existingCommunication.turnCredential,
          ),
        },
        revenueCat: {
          ...existingRevenueCat,
          androidDebugPublicSdkKey: normalizeText(
            process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV || existingRevenueCat.androidDebugPublicSdkKey,
          ),
          androidPublicSdkKey: normalizeText(
            process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY || existingRevenueCat.androidPublicSdkKey,
          ),
          iosPublicSdkKey: normalizeText(
            process.env.EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY || existingRevenueCat.iosPublicSdkKey,
          ),
          appStorePurchasesEnabled: normalizeBoolean(
            process.env.EXPO_PUBLIC_REVENUECAT_APP_STORE_ENABLED || existingRevenueCat.appStorePurchasesEnabled,
          ),
        },
        livekit: {
          ...existingLiveKit,
          serverUrl: normalizeText(
            process.env.EXPO_PUBLIC_LIVEKIT_URL || existingLiveKit.serverUrl || DEPLOYED_LIVEKIT_SERVER_URL,
          ),
          tokenEndpoint: normalizeText(
            process.env.EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT || existingLiveKit.tokenEndpoint || DEPLOYED_LIVEKIT_TOKEN_ENDPOINT,
          ),
        },
      },
    },
  };
};
