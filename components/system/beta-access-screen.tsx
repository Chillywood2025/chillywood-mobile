import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { getSupportRoutePath, isClosedBetaEnvironment } from "../../_lib/runtimeConfig";
import { useSession } from "../../_lib/session";

const serializeRedirectTarget = (pathname: string, params: Record<string, unknown>) => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry == null) return;
        search.append(key, String(entry));
      });
      return;
    }
    search.append(key, String(value));
  });

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
};

type BetaAccessScreenProps = {
  title: string;
  body: string;
  operatorOnly?: boolean;
  loadingOverride?: boolean;
  accessState?: "invited" | "not_invited" | "paused" | "revoked" | "error" | null;
};

export function BetaAccessScreen({
  title,
  body,
  operatorOnly = false,
  loadingOverride = false,
  accessState = null,
}: BetaAccessScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const { isLoading } = useSession();

  const redirectTo = useMemo(
    () => serializeRedirectTarget(pathname, params as Record<string, unknown>),
    [params, pathname],
  );

  if (isLoading || loadingOverride) {
    return (
      <View style={styles.outer}>
        <ActivityIndicator color="#DC143C" />
        <Text style={styles.loadingText}>Checking your session…</Text>
      </View>
    );
  }

  const isInviteBlocked = !operatorOnly && !!accessState && isClosedBetaEnvironment();
  const kicker = operatorOnly
    ? "OPERATOR ACCESS"
    : isInviteBlocked
      ? "INVITE-ONLY ACCESS"
      : "SIGNED-IN ACCESS";
  const primaryLabel = isInviteBlocked ? "Open Support Guide" : "Sign In to Continue";

  return (
    <View style={styles.outer}>
      <View style={styles.card}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {!operatorOnly ? (
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.86}
            onPress={() => {
              if (isInviteBlocked) {
                router.push(getSupportRoutePath());
                return;
              }

              router.push({
                pathname: "/(auth)/login",
                params: { redirectTo },
              });
            }}
          >
            <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.82} onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.secondaryButtonText}>{operatorOnly ? "Back to Home" : "Keep Browsing"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#06070B",
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,13,19,0.96)",
    padding: 22,
    gap: 12,
  },
  kicker: {
    color: "#7B869E",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: "#F4F7FC",
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    color: "#A9B3C8",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#C8D0E2",
    fontSize: 13,
    fontWeight: "800",
  },
  loadingText: {
    color: "#C8D0E2",
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
  },
});
