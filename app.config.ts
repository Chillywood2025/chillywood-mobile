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
      },
    },
  };
};
