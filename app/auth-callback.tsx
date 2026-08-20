import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../_lib/analytics";
import { clearExactLocalAuthSession, readCurrentAccountSessionAuthority, type LockedLocalAuthClient } from "../_lib/accountSessionAuthority";
import { consumeApplicationAuthInput, parseApplicationLink } from "../_lib/appLinks";
import { reportRuntimeError } from "../_lib/logger";
import { supabase } from "../_lib/supabase";

type AuthCallbackParams = {
  code?: string | string[];
  error?: string | string[];
  error_code?: string | string[];
  error_description?: string | string[];
  access_token?: string | string[];
  refresh_token?: string | string[];
  token?: string | string[];
  token_hash?: string | string[];
  email?: string | string[];
  flow?: string | string[];
  type?: string | string[];
};

type AuthCallbackState = {
  code: string;
  token: string;
  tokenHash: string;
  accessToken: string;
  refreshToken: string;
  error: string;
  errorCode: string;
  errorDescription: string;
  email: string;
  flow: string;
  type: string;
};

const hasAuthCallbackState = (state: AuthCallbackState) => Object.values(state).some((value) => value.trim().length > 0);

const firstParam = (value?: string | string[] | null) => {
  const normalized = Array.isArray(value) ? (value.length === 1 ? value[0] : "__invalid_duplicate__") : value;
  return String(normalized ?? "").trim();
};

const parseAuthCallbackSearchParams = (params: URLSearchParams) => ({
  code: firstParam(params.get("code")),
  token: firstParam(params.get("token")),
  tokenHash: firstParam(params.get("token_hash")),
  accessToken: firstParam(params.get("access_token")),
  refreshToken: firstParam(params.get("refresh_token")),
  error: firstParam(params.get("error")),
  errorCode: firstParam(params.get("error_code")),
  errorDescription: firstParam(params.get("error_description")),
  email: firstParam(params.get("email")),
  flow: firstParam(params.get("flow")),
  type: firstParam(params.get("type")),
});

const parseAuthCallbackUrl = (url: string | null) => {
  if (!url) return null;

  try {
    const link = parseApplicationLink(url);
    if (!link || (link.kind !== "auth_callback" && link.kind !== "password_reset")) return null;
    const parsedUrl = new URL(link.route, "https://chillywoodstream.com");
    const params = new URLSearchParams(parsedUrl.search);
    const fragment = parsedUrl.hash.startsWith("#") ? parsedUrl.hash.slice(1) : parsedUrl.hash;

    if (fragment) {
      const fragmentParams = new URLSearchParams(fragment);
      fragmentParams.forEach((value, key) => {
        if (!params.has(key)) {
          params.set(key, value);
        }
      });
    }

    return parseAuthCallbackSearchParams(params);
  } catch {
    return null;
  }
};

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<AuthCallbackParams>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(true);
  const [title, setTitle] = useState("Confirming your account");
  const [message, setMessage] = useState("Opening your Chi'llywood email verification...");
  const [urlState, setUrlState] = useState<AuthCallbackState | null>(null);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const processingStartedRef = useRef(false);

  const routeState = useMemo<AuthCallbackState>(() => ({
    code: firstParam(params.code),
    token: firstParam(params.token),
    tokenHash: firstParam(params.token_hash),
    accessToken: firstParam(params.access_token),
    refreshToken: firstParam(params.refresh_token),
    error: firstParam(params.error),
    errorCode: firstParam(params.error_code),
    errorDescription: firstParam(params.error_description),
    email: firstParam(params.email),
    flow: firstParam(params.flow),
    type: firstParam(params.type),
  }), [params]);

  const callbackState = useMemo(() => hasAuthCallbackState(routeState) ? routeState : urlState ?? routeState, [routeState, urlState]);

  const hydrateUrlState = useCallback(async () => {
    try {
      const initialUrl = await Linking.getInitialURL();
      const parsed = parseAuthCallbackUrl(initialUrl);
      if (parsed) {
        setUrlState(parsed);
      }
    } finally {
      setUrlHydrated(true);
    }
  }, []);

  useEffect(() => {
    void hydrateUrlState();
  }, [hydrateUrlState]);

  const isRecoveryCallback = useMemo(() => {
    const normalizedType = String(callbackState.type ?? "").trim().toLowerCase();
    const normalizedFlow = String(callbackState.flow ?? "").trim().toLowerCase();
    return (
      normalizedType === "recovery"
      || normalizedType === "recover"
      || normalizedFlow === "recovery"
      || normalizedFlow === "recover"
    );
  }, [callbackState.flow, callbackState.type]);

  const recoveryRouteQuery = useMemo(() => {
    const query = new URLSearchParams();

    if (callbackState.code) query.set("code", callbackState.code);
    if (callbackState.token) query.set("token", callbackState.token);
    if (callbackState.tokenHash) query.set("token_hash", callbackState.tokenHash);
    if (callbackState.accessToken) query.set("access_token", callbackState.accessToken);
    if (callbackState.refreshToken) query.set("refresh_token", callbackState.refreshToken);
    if (callbackState.error) query.set("error", callbackState.error);
    if (callbackState.errorCode) query.set("error_code", callbackState.errorCode);
    if (callbackState.errorDescription) query.set("error_description", callbackState.errorDescription);
    if (callbackState.email) query.set("email", callbackState.email);
    if (callbackState.type) query.set("type", callbackState.type);
    if (callbackState.flow) query.set("flow", callbackState.flow);
    return query.toString();
  }, [callbackState]);

  const resolveOtpType = (flowOrType?: string) => {
    const normalized = String(flowOrType ?? "").trim().toLowerCase();
    if (normalized === "signup" || normalized === "email" || normalized === "email_change" || normalized === "invite" || normalized === "magiclink") {
      return normalized as
        | "signup"
        | "email"
        | "email_change"
        | "invite"
        | "magiclink";
    }

    if (normalized === "recovery" || normalized === "recover") {
      return "recovery";
    }

    return "signup";
  };

  const finishWithAuthSuccess = () => {
    setTitle("Email verified");
    setMessage("Your account is verified. Sign in with your email and password to continue.");
    goToLogin();
  };

  const finishWithFailure = (text: string, reason?: string) => {
    setTitle("Verification link problem");
    setMessage(text || "This email link could not be verified. Try signing in or request a fresh email.");
    trackEvent("auth_email_callback_failed", {
      reason: reason || "unknown",
    });
  };

  const goToLogin = () => {
    router.replace("/(auth)/login");
  };

  useEffect(() => {
    let active = true;

    const finishCallback = async () => {
      if (!urlHydrated || processingStartedRef.current) return;

      try {
        if (isRecoveryCallback) {
          const hasRecoveryLinkData = (
            callbackState.code
            || callbackState.token
            || callbackState.tokenHash
            || callbackState.error
            || callbackState.errorCode
            || (callbackState.accessToken && callbackState.refreshToken)
          );

          if (hasRecoveryLinkData) {
            const targetRoute = recoveryRouteQuery ? `/reset-password?${recoveryRouteQuery}` : "/reset-password";
            if (parseApplicationLink(targetRoute)?.kind !== "password_reset") {
              finishWithFailure("This recovery link is malformed. Request a fresh link.", "malformed_recovery_link");
              return;
            }
            processingStartedRef.current = true;
            router.replace(targetRoute as Parameters<typeof router.replace>[0]);
            if (!active) return;
            setChecking(false);
            return;
          }
        }

        const callbackRoute = recoveryRouteQuery ? `/auth-callback?${recoveryRouteQuery}` : "/auth-callback";
        if (!consumeApplicationAuthInput(callbackRoute, "auth_callback")) {
          finishWithFailure("This verification link is malformed or was already used.", "invalid_or_replayed_link");
          return;
        }
        processingStartedRef.current = true;

        if (callbackState.error || callbackState.errorCode) {
          finishWithFailure(
            callbackState.errorDescription || "This email link could not be verified. Try signing in or request a fresh email.",
            callbackState.errorCode || callbackState.error || "unknown",
          );
          return;
        }

        if (callbackState.accessToken && callbackState.refreshToken && !callbackState.tokenHash) {
          const { error } = await supabase.auth.setSession({
            access_token: callbackState.accessToken,
            refresh_token: callbackState.refreshToken,
          });

          if (error) {
            finishWithFailure(
              "This email link could not be opened. Request a fresh link if your email is still unverified.",
              error.message,
            );
            return;
          }
        }

        const hasVerificationCredential = !!(
          callbackState.code
          || callbackState.tokenHash
          || callbackState.token
          || (callbackState.accessToken && callbackState.refreshToken)
        );

        if (callbackState.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(callbackState.code);
          if (error) {
            finishWithFailure(
              "This email link could not be opened. Try signing in, or request a fresh email if the account is still unverified.",
              error.message,
            );
            return;
          }
        } else if (callbackState.tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: callbackState.tokenHash,
            type: resolveOtpType(callbackState.type || callbackState.flow),
          });

          if (error) {
            finishWithFailure(
              "This email link could not be opened. Request a fresh link if your email is still unverified.",
              error.message,
            );
            return;
          }
        } else if (callbackState.token && callbackState.email) {
          const { error } = await supabase.auth.verifyOtp({
            email: callbackState.email,
            token: callbackState.token,
            type: resolveOtpType(callbackState.type || callbackState.flow),
          });

          if (error) {
            finishWithFailure(
              "This email link could not be opened. Request a fresh link if your email is still unverified.",
              error.message,
            );
            return;
          }
        } else if (callbackState.token && !callbackState.email) {
          setMessage("This verification link is missing an email value. Request a fresh link if needed.");
          trackEvent("auth_email_callback_failed", {
            reason: "missing_email_for_token",
          });
          return;
        } else if (!hasVerificationCredential) {
          if (!active) return;
          setTitle("Go to login");
          setMessage("Use this screen after confirming your email. Sign in to continue.");
          goToLogin();
          return;
        }

        const { data: currentAuth } = await supabase.auth.getSession();
        const capturedSession = currentAuth.session;
        const verifiedAuthority = await readCurrentAccountSessionAuthority();
        if (!capturedSession?.access_token || !verifiedAuthority || verifiedAuthority.restoreOnly
          || capturedSession.user.id !== verifiedAuthority.userId
          || !await clearExactLocalAuthSession(supabase.auth as unknown as LockedLocalAuthClient,
            verifiedAuthority.userId, capturedSession.access_token)) {
          finishWithFailure("The verified account session changed before completion. Sign in again.", "stale_session");
          return;
        }
        if (!active) return;

        finishWithAuthSuccess();
        trackEvent("auth_email_callback_success", {
          flow: callbackState.flow || callbackState.type || "signup",
          method: callbackState.code ? "code" : callbackState.tokenHash ? "token_hash" : callbackState.token ? "token" : "no_credentials",
        });
      } catch (error) {
        if (!active) return;
        reportRuntimeError("auth-email-callback", error, {
          flow: callbackState.flow || callbackState.type || "unknown",
        });
        finishWithFailure(
          "Unable to finish email verification right now. Try signing in, or request a fresh email if needed.",
          "runtime_error",
        );
      } finally {
        if (active) setChecking(false);
      }
    };

    void finishCallback();

    return () => {
      active = false;
    };
  }, [callbackState, urlHydrated]);

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: Math.max(insets.top + 28, 56),
          paddingBottom: Math.max(insets.bottom + 28, 56),
        },
      ]}
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>CHI&apos;LLYWOOD</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        {checking ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color="#DC143C" />
            <Text style={styles.statusText}>Checking link...</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable
              style={styles.button}
              onPress={goToLogin}
              accessibilityRole="button"
              accessibilityLabel="Go to login"
            >
              <Text style={styles.buttonText}>Go to login</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#06070B",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,13,19,0.96)",
    padding: 22,
  },
  kicker: {
    color: "#7B869E",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  title: {
    color: "#DC143C",
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 10,
  },
  message: {
    color: "#A9B3C8",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginBottom: 20,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  statusText: {
    color: "#D7DEEC",
    fontSize: 13,
    fontWeight: "800",
  },
  actions: {
    gap: 10,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#DC143C",
    borderRadius: 14,
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
});
