import Constants from "expo-constants";

export type RuntimeEnvironment = "closed-beta" | "public-v1";

export type RevenueCatRuntimeConfig = {
  androidDebugPublicSdkKey: string;
  androidPublicSdkKey: string;
  iosPublicSdkKey: string;
};

export type LiveKitRuntimeConfig = {
  serverUrl: string;
  tokenEndpoint: string;
};

export type LegalRuntimeConfig = {
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
  accountDeletionUrl: string;
  supportEmail: string;
};

export type RuntimeConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  betaOperatorAllowlist: string[];
  betaEnvironment: RuntimeEnvironment;
  legal: LegalRuntimeConfig;
  revenueCat: RevenueCatRuntimeConfig;
  livekit: LiveKitRuntimeConfig;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeRuntimeEnvironment = (value: unknown): RuntimeEnvironment => (
  normalizeText(value).toLowerCase() === "closed-beta" ? "closed-beta" : "public-v1"
);

const normalizeAllowlist = (value: unknown) =>
  normalizeText(value)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const readRuntimeExtra = () => {
  const manifestExtra =
    (Constants as { manifest2?: { extra?: Record<string, unknown> } }).manifest2?.extra
    ?? {};
  const extra =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
    ?? manifestExtra
    ?? {};

  if (!isPlainObject(extra.runtime)) return {};
  return extra.runtime;
};

let cachedConfig: RuntimeConfig | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedConfig) return cachedConfig;

  const runtimeExtra = readRuntimeExtra();
  const legalExtra = isPlainObject(runtimeExtra.legal) ? runtimeExtra.legal : {};
  const revenueCatExtra = isPlainObject(runtimeExtra.revenueCat) ? runtimeExtra.revenueCat : {};
  const liveKitExtra = isPlainObject(runtimeExtra.livekit) ? runtimeExtra.livekit : {};

  cachedConfig = {
    supabaseUrl: normalizeText(process.env.EXPO_PUBLIC_SUPABASE_URL || runtimeExtra.supabaseUrl),
    supabaseAnonKey: normalizeText(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || runtimeExtra.supabaseAnonKey),
    betaOperatorAllowlist: normalizeAllowlist(
      process.env.EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST || runtimeExtra.betaOperatorAllowlist,
    ),
    betaEnvironment: normalizeRuntimeEnvironment(
      process.env.EXPO_PUBLIC_BETA_ENVIRONMENT || runtimeExtra.betaEnvironment,
    ),
    legal: {
      privacyPolicyUrl: normalizeText(
        process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || legalExtra.privacyPolicyUrl,
      ),
      termsOfServiceUrl: normalizeText(
        process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL || legalExtra.termsOfServiceUrl,
      ),
      accountDeletionUrl: normalizeText(
        process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL || legalExtra.accountDeletionUrl,
      ),
      supportEmail: normalizeText(
        process.env.EXPO_PUBLIC_SUPPORT_EMAIL || legalExtra.supportEmail,
      ),
    },
    revenueCat: {
      androidDebugPublicSdkKey: normalizeText(
        process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV || revenueCatExtra.androidDebugPublicSdkKey,
      ),
      androidPublicSdkKey: normalizeText(
        process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY || revenueCatExtra.androidPublicSdkKey,
      ),
      iosPublicSdkKey: normalizeText(
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY || revenueCatExtra.iosPublicSdkKey,
      ),
    },
    livekit: {
      serverUrl: normalizeText(
        process.env.EXPO_PUBLIC_LIVEKIT_URL || liveKitExtra.serverUrl,
      ),
      tokenEndpoint: normalizeText(
        process.env.EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT || liveKitExtra.tokenEndpoint,
      ),
    },
  };

  return cachedConfig;
}

export function getRuntimeConfigIssues(config = getRuntimeConfig()) {
  const issues: string[] = [];
  if (!config.supabaseUrl) issues.push("Missing EXPO_PUBLIC_SUPABASE_URL runtime config.");
  if (!config.supabaseAnonKey) issues.push("Missing EXPO_PUBLIC_SUPABASE_ANON_KEY runtime config.");
  return issues;
}

export function isRuntimeConfigValid(config = getRuntimeConfig()) {
  return getRuntimeConfigIssues(config).length === 0;
}

export function getRuntimeConfigIssueSummary(config = getRuntimeConfig()) {
  const issues = getRuntimeConfigIssues(config);
  if (!issues.length) return "";
  return issues.join(" ");
}

export function isClosedBetaEnvironment(config = getRuntimeConfig()) {
  return config.betaEnvironment === "closed-beta";
}

export function isPublicV1Environment(config = getRuntimeConfig()) {
  return config.betaEnvironment === "public-v1";
}

export function getSupportRoutePath(config = getRuntimeConfig()) {
  return isClosedBetaEnvironment(config) ? "/beta-support" : "/support";
}

export function getRuntimeLegalConfig(config = getRuntimeConfig()) {
  return config.legal;
}

export function getRuntimeLiveKitConfig(config = getRuntimeConfig()) {
  return config.livekit;
}

export function isLiveKitRuntimeConfigured(config = getRuntimeConfig()) {
  return !!config.livekit.serverUrl && !!config.livekit.tokenEndpoint;
}

export function isBetaOperatorIdentity(identity?: {
  userId?: string | null;
  email?: string | null;
}) {
  const config = getRuntimeConfig();
  const allowlist = config.betaOperatorAllowlist;
  if (!allowlist.length) return false;

  const userId = normalizeText(identity?.userId).toLowerCase();
  const email = normalizeText(identity?.email).toLowerCase();

  return allowlist.includes(userId) || allowlist.includes(email);
}
