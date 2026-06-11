import { useEffect, useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";

import { trackEvent } from "../_lib/analytics";

type QueryMap = Record<string, string | string[]>;

const hasAuthCallbackData = (params: QueryMap) => {
  return (
    Object.prototype.hasOwnProperty.call(params, "type")
    || Object.prototype.hasOwnProperty.call(params, "flow")
    || Object.prototype.hasOwnProperty.call(params, "code")
    || Object.prototype.hasOwnProperty.call(params, "token")
    || Object.prototype.hasOwnProperty.call(params, "token_hash")
    || Object.prototype.hasOwnProperty.call(params, "access_token")
    || Object.prototype.hasOwnProperty.call(params, "refresh_token")
    || Object.prototype.hasOwnProperty.call(params, "error")
    || Object.prototype.hasOwnProperty.call(params, "error_code")
    || Object.prototype.hasOwnProperty.call(params, "error_description")
    || Object.prototype.hasOwnProperty.call(params, "confirmation_token")
    || Object.prototype.hasOwnProperty.call(params, "recovery_token")
    || Object.prototype.hasOwnProperty.call(params, "email")
  );
};

const isLikelyAuthPath = (pathname: string | null) => {
  if (!pathname) return false;

  const normalized = pathname.toLowerCase().replace(/\/+$/u, "");
  return (
    normalized === "/auth"
    || normalized === "/auth/verify"
    || normalized === "/auth/v1/verify"
    || normalized === "/verify"
    || normalized === "/confirm"
    || normalized === "/auth-callback"
    || normalized === "/callback"
  );
};

const isLikelyRecoveryPath = (pathname: string | null, params: QueryMap) => {
  if (!pathname) return false;
  const normalized = pathname.toLowerCase().replace(/\/+$/u, "");
  const type = String(params.type ?? "").trim().toLowerCase();
  const flow = String(params.flow ?? "").trim().toLowerCase();

  return (
    normalized === "/reset-password"
    || normalized === "/auth/reset-password"
    || type === "recovery"
    || type === "recover"
    || flow === "recovery"
    || flow === "recover"
    || (Object.prototype.hasOwnProperty.call(params, "access_token") && Object.prototype.hasOwnProperty.call(params, "refresh_token"))
  );
};

const toQueryString = (params: QueryMap) => {
  const entries = Object.entries(params).flatMap(([key, value]) => {
    if (!value) return [];
    return Array.isArray(value) ? value.map((v) => [key, String(v)] as const) : [[key, String(value)] as const];
  });

  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries as Array<[string, string]>).toString();
};

export default function NotFoundScreen() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<QueryMap>();
  const router = useRouter();

  const fallbackPath = useMemo(() => {
    if (isLikelyRecoveryPath(pathname, params)) {
      return `/reset-password${toQueryString(params)}`;
    }

    if (hasAuthCallbackData(params) || isLikelyAuthPath(pathname)) {
      return `/auth-callback${toQueryString(params)}`;
    }

    return null;
  }, [params, pathname]);

  useEffect(() => {
    if (fallbackPath) {
      trackEvent("not_found_auth_callback_redirect", {
        fromPath: String(pathname || ""),
        target: fallbackPath.startsWith("/reset-password") ? "reset-password" : "auth-callback",
      });
      router.replace(fallbackPath as Parameters<typeof router.replace>[0]);
    }
  }, [fallbackPath, pathname, router]);

  if (fallbackPath) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 16, color: "#c7c7cf", textAlign: "center" }}>
          Redirecting...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: "#fff" }}>
        Not found
      </Text>
      <Text style={{ marginTop: 12, color: "#b0b0bb", textAlign: "center" }}>
        This screen no longer exists.
      </Text>
    </View>
  );
}
