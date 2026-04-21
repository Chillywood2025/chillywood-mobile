import fs from "node:fs";
import path from "node:path";

import type { ConfigContext, ExpoConfig } from "@expo/config";

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeRuntimeEnvironment = (value: unknown) => (
  normalizeText(value).toLowerCase() === "closed-beta" ? "closed-beta" : "public-v1"
);
const CONFIG_DIR = process.cwd();
const DEPLOYED_LIVEKIT_SERVER_URL = "wss://live.chillywoodstream.com";
const DEPLOYED_LIVEKIT_TOKEN_ENDPOINT = "https://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/livekit-token";

const resolveExistingFile = (...candidates: Array<string | undefined>) => {
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
  const iosGoogleServicesFile = resolveExistingFile(
    typeof existingIos.googleServicesFile === "string" ? existingIos.googleServicesFile : undefined,
    "./GoogleService-Info.plist",
  );

  return {
    ...base,
    android: {
      ...base.android,
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
    },
    ios: {
      ...base.ios,
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    },
    plugins: mergePlugins(base.plugins, [
      "@livekit/react-native-expo-plugin",
      "@config-plugins/react-native-webrtc",
      "@react-native-firebase/app",
      "@react-native-firebase/crashlytics",
      "@react-native-firebase/perf",
      [
        "expo-build-properties",
        {
          ios: {
            useFrameworks: "static",
          },
        },
      ],
    ]),
    extra: {
      ...existingExtra,
      runtime: {
        ...existingRuntime,
        supabaseUrl: normalizeText(process.env.EXPO_PUBLIC_SUPABASE_URL || existingRuntime.supabaseUrl),
        supabaseAnonKey: normalizeText(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || existingRuntime.supabaseAnonKey),
        betaOperatorAllowlist: normalizeText(
          process.env.EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST || existingRuntime.betaOperatorAllowlist,
        ),
        betaEnvironment: normalizeRuntimeEnvironment(
          process.env.EXPO_PUBLIC_BETA_ENVIRONMENT || existingRuntime.betaEnvironment,
        ),
        legal: {
          ...existingLegal,
          privacyPolicyUrl: normalizeText(
            process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || existingLegal.privacyPolicyUrl,
          ),
          termsOfServiceUrl: normalizeText(
            process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL || existingLegal.termsOfServiceUrl,
          ),
          accountDeletionUrl: normalizeText(
            process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL || existingLegal.accountDeletionUrl,
          ),
          supportEmail: normalizeText(
            process.env.EXPO_PUBLIC_SUPPORT_EMAIL || existingLegal.supportEmail,
          ),
        },
        communication: {
          ...existingCommunication,
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
