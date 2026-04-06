import type { ConfigContext, ExpoConfig } from "@expo/config";

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeRuntimeEnvironment = (value: unknown) => (
  normalizeText(value).toLowerCase() === "closed-beta" ? "closed-beta" : "public-v1"
);

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const existingExtra = (base.extra ?? {}) as Record<string, unknown>;
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

  return {
    ...base,
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
      },
    },
  };
};
