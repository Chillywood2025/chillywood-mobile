import { Href, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../_lib/analytics";
import { clearExactLocalAuthSession, isCurrentAccountSessionAuthority, readCurrentAccountSessionAuthority, sameAccountSessionAuthority, type AccountSessionAuthorityBinding, type LockedLocalAuthClient } from "../_lib/accountSessionAuthority";
import { consumeApplicationAuthInput, parseApplicationLink } from "../_lib/appLinks";
import { reportRuntimeError } from "../_lib/logger";
import { beginPasswordRecoverySessionQuarantine, cancelPasswordRecoverySessionQuarantine, clearQuarantinedPasswordRecoverySession, persistVerifiedPasswordRecoveryBinding } from "../_lib/session";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../_lib/supabase";
import type { Database } from "../supabase/database.types";

type RecoveryParams = {
  accessToken: string | null;
  code: string | null;
  email: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  refreshToken: string | null;
  token: string | null;
  tokenHash: string | null;
};

type RecoveryStatus = "checking" | "ready" | "missing" | "failed";
type CapturedRecoverySession = AccountSessionAuthorityBinding & { accessToken: string; refreshToken: string };

const PASSWORD_MIN_LENGTH = 8;
const RESET_FLOW_SIGN_OUT_TIMEOUT_MS = 2500;
const RECOVERY_LINK_OPEN_ERROR = "This reset link expired or could not be opened. Request a fresh link.";
type RecoveryParamKey =
  | "access_token"
  | "code"
  | "email"
  | "error"
  | "error_code"
  | "error_description"
  | "refresh_token"
  | "token"
  | "token_hash";

function getPasswordUpdateErrorMessage(error: unknown) {
  const raw = String(
    (error as { message?: unknown; code?: unknown; name?: unknown } | null)?.message
    ?? (error as { code?: unknown } | null)?.code
    ?? (error as { name?: unknown } | null)?.name
    ?? "",
  ).toLowerCase();

  if (raw.includes("weak") || raw.includes("password")) {
    return "Use a stronger password.";
  }
  if (raw.includes("expired") || raw.includes("invalid") || raw.includes("token")) {
    return "This reset link expired. Request a fresh link.";
  }
  return "Unable to update your password right now.";
}

function getSanitizedRecoveryErrorReason(error: unknown) {
  const raw = String(
    (error as { message?: unknown; code?: unknown; name?: unknown } | null)?.message
    ?? (error as { code?: unknown } | null)?.code
    ?? (error as { name?: unknown } | null)?.name
    ?? "",
  ).toLowerCase();

  if (raw.includes("expired") || raw.includes("invalid") || raw.includes("token")) {
    return "expired_or_invalid";
  }
  if (raw.includes("rate") || raw.includes("limit")) {
    return "rate_limited";
  }
  if (raw.includes("network") || raw.includes("fetch")) {
    return "network_error";
  }
  return "auth_error";
}

type VerifiedRecoveryData = { session?: Session | null } | null;

const readParam = (params: URLSearchParams, key: string) => {
  const value = params.get(key);
  return value ? value.trim() : null;
};

const readRouteParam = (
  params: Partial<Record<RecoveryParamKey, string | string[]>>,
  key: RecoveryParamKey,
) => {
  const value = params[key];
  const normalizedValue = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
  return normalizedValue ? normalizedValue.trim() : null;
};

const parseRecoveryUrl = (url: string | null): RecoveryParams | null => {
  if (!url) return null;

  try {
    const link = parseApplicationLink(url);
    if (link?.kind !== "password_reset") return null;
    const parsedUrl = new URL(link.route, "https://chillywoodstream.com");
    const params = new URLSearchParams(parsedUrl.search);
    const fragment = parsedUrl.hash.startsWith("#") ? parsedUrl.hash.slice(1) : parsedUrl.hash;

    if (fragment) {
      const hashParams = new URLSearchParams(fragment);
      hashParams.forEach((value, key) => {
        if (!params.has(key)) params.set(key, value);
      });
    }

    return {
      accessToken: readParam(params, "access_token"),
      code: readParam(params, "code"),
      email: readParam(params, "email"),
      error: readParam(params, "error"),
      errorCode: readParam(params, "error_code"),
      errorDescription: readParam(params, "error_description"),
      refreshToken: readParam(params, "refresh_token"),
      token: readParam(params, "token"),
      tokenHash: readParam(params, "token_hash"),
    };
  } catch {
    return null;
  }
};

const parseRecoveryRouteParams = (
  params: Partial<Record<RecoveryParamKey, string | string[]>>,
): RecoveryParams | null => {
  const recovery = {
    accessToken: readRouteParam(params, "access_token"),
    code: readRouteParam(params, "code"),
    email: readRouteParam(params, "email"),
    error: readRouteParam(params, "error"),
    errorCode: readRouteParam(params, "error_code"),
    errorDescription: readRouteParam(params, "error_description"),
    refreshToken: readRouteParam(params, "refresh_token"),
    token: readRouteParam(params, "token"),
    tokenHash: readRouteParam(params, "token_hash"),
  };

  return Object.values(recovery).some(Boolean) ? recovery : null;
};

const wait = (timeoutMs: number) => new Promise((resolve) => {
  setTimeout(resolve, timeoutMs);
});

const clearResetFlowSession = async (expected: AccountSessionAuthorityBinding | null, expectedAccessToken?: string) => {
  if (!expected || !expectedAccessToken) return clearQuarantinedPasswordRecoverySession(true);
  const cleared = await Promise.race([
    clearExactLocalAuthSession(supabase.auth as unknown as LockedLocalAuthClient, expected.userId, expectedAccessToken).catch(() => false),
    wait(RESET_FLOW_SIGN_OUT_TIMEOUT_MS).then(() => false),
  ]); return cleared ? cancelPasswordRecoverySessionQuarantine() : false;
};

const abandonRecoveryCandidate = async (candidate?: Session | null) => {
  const cleared = !candidate?.access_token || !candidate.user?.id || await Promise.race([
    clearExactLocalAuthSession(supabase.auth as unknown as LockedLocalAuthClient, candidate.user.id, candidate.access_token).catch(() => false),
    wait(RESET_FLOW_SIGN_OUT_TIMEOUT_MS).then(() => false),
  ]);
  return cleared ? cancelPasswordRecoverySessionQuarantine() : false;
};

const updateCapturedRecoveryPassword = async (captured: CapturedRecoverySession, password: string) => {
  const isolated = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data, error } = await isolated.auth.setSession({
    access_token: captured.accessToken, refresh_token: captured.refreshToken,
  });
  if (error || data.session?.user.id !== captured.userId) throw error ?? new Error("recovery_session_authority_mismatch");
  const { error: updateError } = await isolated.auth.updateUser({ password });
  if (updateError) throw updateError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cleanup = await Promise.race([
      isolated.auth.signOut({ scope: "local" }).then(({ error }) => !error, () => false),
      wait(RESET_FLOW_SIGN_OUT_TIMEOUT_MS).then(() => false),
    ]);
    if (cleanup) return true;
  }
  return false;
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<
    Partial<Record<RecoveryParamKey, string | string[]>>
  >();
  const insets = useSafeAreaInsets();
  const expiredActionPendingRef = useRef(false);
  const recoveryInputConsumedRef = useRef(false);
  const recoverySessionRef = useRef<CapturedRecoverySession | null>(null);
  const recoveryProofRef = useRef<AccountSessionAuthorityBinding | null>(null);
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [statusMessage, setStatusMessage] = useState("Checking your reset link...");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [recoveryAuthority, setRecoveryAuthority] = useState<AccountSessionAuthorityBinding | null>(null);

  const canSubmit = useMemo(() => (
    status === "ready"
    && !saving
    && newPassword.length >= PASSWORD_MIN_LENGTH
    && newPassword === confirmPassword
  ), [confirmPassword, newPassword, saving, status]);

  const passwordValidationMessage = useMemo(() => {
    if (status !== "ready") return "";
    if (!newPassword || !confirmPassword) return "Enter and confirm your new password.";
    if (newPassword.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    if (newPassword !== confirmPassword) return "Passwords do not match yet.";
    return "Ready to update.";
  }, [confirmPassword, newPassword, status]);

  const routeRecoveryParams = useMemo(() => (
    parseRecoveryRouteParams(routeParams)
  ), [routeParams]);

  const markRecoveryReady = useCallback(async (flow: string, candidate?: Session | null, verifiedRecovery = false) => {
    const { data: before } = await supabase.auth.getSession();
    const session = candidate ?? before.session;
    if (!session?.access_token || !session.refresh_token) throw new Error("recovery_session_authority_mismatch");
    const binding = await readCurrentAccountSessionAuthority();
    const { data: after } = await supabase.auth.getSession();
    if (!binding || binding.restoreOnly || binding.accountId !== binding.userId || session.user.id !== binding.userId
      || before.session?.access_token !== session.access_token || before.session.refresh_token !== session.refresh_token
      || after.session?.access_token !== session.access_token || after.session.refresh_token !== session.refresh_token
    ) { await abandonRecoveryCandidate(session); throw new Error("recovery_session_authority_mismatch"); }
    if (verifiedRecovery && !await persistVerifiedPasswordRecoveryBinding(binding)) {
      await abandonRecoveryCandidate(session);
      throw new Error("recovery_binding_persistence_failed");
    }
    recoverySessionRef.current = { ...binding, accessToken: session.access_token, refreshToken: session.refresh_token };
    recoveryProofRef.current = binding;
    setRecoveryAuthority(binding);
    setStatus("ready");
    setStatusMessage("Choose a new password for this account.");
    trackEvent("auth_password_recovery_link_opened", {
      flow,
    });
  }, []);

  const markRecoveryFailed = useCallback((error: unknown, flow: string, candidate?: Session | null) => {
    void (candidate ? abandonRecoveryCandidate(candidate) : clearQuarantinedPasswordRecoverySession()).then((cleared) => { if (cleared) { recoveryInputConsumedRef.current = false; recoverySessionRef.current = null; recoveryProofRef.current = null; setRecoveryAuthority(null); } });
    setStatus("failed");
    setStatusMessage(RECOVERY_LINK_OPEN_ERROR);
    trackEvent("auth_password_recovery_link_failed", {
      flow,
      reason: getSanitizedRecoveryErrorReason(error),
    });
  }, []);

  const establishVerifiedRecoverySession = useCallback(async (
    data: VerifiedRecoveryData,
    flow: string,
  ) => {
    const verifiedSession = data?.session;

    if (verifiedSession?.access_token && verifiedSession.refresh_token) {
      await markRecoveryReady(flow, verifiedSession, true);
      return true;
    }

    return false;
  }, [markRecoveryReady]);

  const markMissingRecoveryLink = useCallback(() => {
    void clearQuarantinedPasswordRecoverySession().then((cleared) => { if (cleared) { recoveryInputConsumedRef.current = false; recoverySessionRef.current = null; recoveryProofRef.current = null; setRecoveryAuthority(null); } });
    setStatus("missing");
    setStatusMessage("This reset link is missing or expired. Request a fresh password reset email.");
  }, []);

  const requestNewResetEmail = useCallback(() => {
    if (expiredActionPendingRef.current) return;
    expiredActionPendingRef.current = true;
    setStatus("checking");
    setStatusMessage("Opening password reset request...");

    const email = routeRecoveryParams?.email?.trim();
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    void clearResetFlowSession(recoveryAuthority, recoverySessionRef.current?.accessToken).then((cleared) => {
      if (cleared) router.replace(`/forgot-password?${params.toString()}` as Href); else { setStatus("failed"); setStatusMessage("Unable to safely close the reset session. Try again."); }
    }).finally(() => {
      expiredActionPendingRef.current = false;
    });
  }, [recoveryAuthority, routeRecoveryParams?.email, router]);

  const backToSignIn = useCallback(() => {
    if (expiredActionPendingRef.current) return;
    expiredActionPendingRef.current = true;
    setStatus("checking");
    setStatusMessage("Returning to sign in...");
    void clearResetFlowSession(recoveryAuthority, recoverySessionRef.current?.accessToken).then((cleared) => {
      if (cleared) router.replace("/(auth)/login"); else { setStatus("failed"); setStatusMessage("Unable to safely close the reset session. Try again."); }
    }).finally(() => {
      expiredActionPendingRef.current = false;
    });
  }, [recoveryAuthority, router]);

  const consumeRecoveryParams = useCallback(async (recovery: RecoveryParams | null) => {
    if (!recovery) return false;
    if (recoveryInputConsumedRef.current) return true;
    const query = new URLSearchParams();
    const values: Record<RecoveryParamKey, string | null> = { access_token: recovery.accessToken,
      code: recovery.code, email: recovery.email, error: recovery.error, error_code: recovery.errorCode,
      error_description: recovery.errorDescription, refresh_token: recovery.refreshToken,
      token: recovery.token, token_hash: recovery.tokenHash };
    Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
    const queryString = query.toString();
    const route = `/reset-password${queryString ? `?${queryString}` : ""}`;
    if (!consumeApplicationAuthInput(route, "password_reset")) { markRecoveryFailed(new Error("invalid_recovery_input"), "route"); return true; }
    recoveryInputConsumedRef.current = true;

    if (recovery.error || recovery.errorCode) { markRecoveryFailed(recovery.errorCode || recovery.error, "provider_error"); return true; }

    if (recovery.accessToken && recovery.refreshToken) {
      markRecoveryFailed(new Error("unverified_recovery_session"), "url_session");
      return true;
    }

    if (recovery.code) {
      if (!await beginPasswordRecoverySessionQuarantine()) { markRecoveryFailed(new Error("recovery_quarantine_persistence_failed"), "code"); return true; }
      setStatus("checking");
      setStatusMessage("Opening your reset session...");

      const { data, error } = await supabase.auth.exchangeCodeForSession(recovery.code);
      const redirectType = (data as typeof data & { redirectType?: unknown }).redirectType;

      if (error || redirectType !== "PASSWORD_RECOVERY" || !data.session) {
        markRecoveryFailed(error ?? new Error("unverified_recovery_code"), "code", data.session);
        return true;
      }

      await markRecoveryReady("code", data.session, true);
      return true;
    }

    if (recovery.tokenHash) {
      if (!await beginPasswordRecoverySessionQuarantine()) { markRecoveryFailed(new Error("recovery_quarantine_persistence_failed"), "token_hash"); return true; }
      setStatus("checking");
      setStatusMessage("Opening your reset session...");

      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: recovery.tokenHash,
        type: "recovery",
      });

      if (error) {
        markRecoveryFailed(error, "token_hash", data.session);
        return true;
      }

      const established = await establishVerifiedRecoverySession(data, "token_hash");
      if (!established) {
        markRecoveryFailed(new Error("no_recovery_session"), "token_hash");
      }
      return true;
    }

    if (recovery.token && recovery.email) {
      if (!await beginPasswordRecoverySessionQuarantine()) { markRecoveryFailed(new Error("recovery_quarantine_persistence_failed"), "email_token"); return true; }
      setStatus("checking");
      setStatusMessage("Opening your reset session...");

      const { data, error } = await supabase.auth.verifyOtp({
        email: recovery.email,
        token: recovery.token,
        type: "recovery",
      });

      if (error) {
        markRecoveryFailed(error, "email_token", data.session);
        return true;
      }

      const established = await establishVerifiedRecoverySession(data, "email_token");
      if (!established) {
        markRecoveryFailed(new Error("no_recovery_session"), "email_token");
      }
      return true;
    }

    recoveryInputConsumedRef.current = false; return false;
  }, [establishVerifiedRecoverySession, markRecoveryFailed, markRecoveryReady]);

  const consumeRecoveryUrl = useCallback(async (url: string | null) => (
    consumeRecoveryParams(parseRecoveryUrl(url))
  ), [consumeRecoveryParams]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "PASSWORD_RECOVERY" || !session) return;

      void markRecoveryReady("password_recovery_event", session, true)
        .catch((error) => markRecoveryFailed(error, "password_recovery_event", session));
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [markRecoveryFailed, markRecoveryReady]);

  useEffect(() => {
    let active = true;

    const bootstrapRecovery = async () => {
      try {
        const consumedRouteParams = await consumeRecoveryParams(routeRecoveryParams);
        if (!active || consumedRouteParams) return;

        const initialUrl = await Linking.getInitialURL();
        const consumed = await consumeRecoveryUrl(initialUrl);
        if (!active || consumed) return;
        markMissingRecoveryLink();
      } catch (error) {
        void clearQuarantinedPasswordRecoverySession().then((cleared) => { if (cleared) recoveryInputConsumedRef.current = false; });
        if (!active) return;
        reportRuntimeError("auth-password-recovery-bootstrap", error, {
          source: "reset-password",
        });
        setStatus("failed");
        setStatusMessage("Unable to open this reset link. Request a fresh password reset email.");
      }
    };

    void bootstrapRecovery();

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void consumeRecoveryUrl(url).catch((error) => {
        void clearQuarantinedPasswordRecoverySession().then((cleared) => { if (cleared) recoveryInputConsumedRef.current = false; });
        reportRuntimeError("auth-password-recovery-link", error, {
          source: "reset-password",
        });
        setStatus("failed");
        setStatusMessage("Unable to open this reset link. Request a fresh password reset email.");
      });
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [
    consumeRecoveryParams,
    consumeRecoveryUrl,
    markMissingRecoveryLink,
    markRecoveryReady,
    routeRecoveryParams,
  ]);

  const updatePassword = useCallback(async () => {
    if (saving) return;

    if (status !== "ready") {
      Alert.alert("Reset password", "Open the newest reset email again, then choose a new password.");
      return;
    }

    const captured = recoverySessionRef.current;
    if (!captured || !recoveryAuthority || !sameAccountSessionAuthority(captured, recoveryAuthority)
      || !sameAccountSessionAuthority(recoveryProofRef.current, recoveryAuthority)
      || !(await isCurrentAccountSessionAuthority(recoveryAuthority))) {
      setStatus("failed"); setStatusMessage("This recovery session changed. Request a fresh reset link."); return;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      Alert.alert("Reset password", "Use at least 8 characters for your new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Reset password", "The new passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      try {
        const cleanupConfirmed = await updateCapturedRecoveryPassword(captured, newPassword);
        if (!cleanupConfirmed) {
          setStatus("failed");
          setStatusMessage("Password updated, but reset-session cleanup could not be confirmed. Sign in again before continuing.");
          return;
        }
      } catch (error) {
        trackEvent("auth_password_recovery_update_failed", {
          reason: getSanitizedRecoveryErrorReason(error),
        });
        Alert.alert("Reset password", getPasswordUpdateErrorMessage(error));
        return;
      }

      if (!await clearResetFlowSession(recoveryAuthority, captured.accessToken)) {
        setStatus("failed"); setStatusMessage("The account session changed; no success applies to its replacement."); return;
      }

      setNewPassword("");
      setConfirmPassword("");
      recoverySessionRef.current = null; recoveryProofRef.current = null; setRecoveryAuthority(null);
      trackEvent("auth_password_recovery_update_success", {
        source: "reset-password",
      });
      setStatus("missing");
      setStatusMessage("Password updated. Returning to sign in...");
      router.replace("/(auth)/login");
    } catch (error) {
      reportRuntimeError("auth-password-recovery-update", error, {
        source: "reset-password",
      });
      trackEvent("auth_password_recovery_update_failed", {
        reason: "runtime_error",
      });
      Alert.alert("Reset password", "Unable to update your password right now.");
    } finally {
      setSaving(false);
    }
  }, [confirmPassword, newPassword, recoveryAuthority, router, saving, status]);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardShell}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(insets.top + 40, 72),
            paddingBottom: Math.max(insets.bottom + 40, 72),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.kicker}>CHI&apos;LLYWOOD</Text>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>{statusMessage}</Text>

          {status === "checking" ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color="#DC143C" />
              <Text style={styles.statusText}>Opening reset link...</Text>
            </View>
          ) : null}

          {status === "ready" ? (
            <View testID="reset-password-sheet" collapsable={false}>
              <TextInput
                style={styles.input}
                placeholder="New password"
                placeholderTextColor="#7A859A"
                autoCapitalize="none"
                autoCorrect={false}
                passwordRules="minlength: 8;"
                returnKeyType="next"
                secureTextEntry
                textContentType="newPassword"
                value={newPassword}
                onChangeText={setNewPassword}
                accessibilityLabel="New password"
                testID="reset-password-new-password-input"
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor="#7A859A"
                autoCapitalize="none"
                autoCorrect={false}
                passwordRules="minlength: 8;"
                returnKeyType="done"
                secureTextEntry
                textContentType="newPassword"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onSubmitEditing={() => {
                  void updatePassword();
                }}
                accessibilityLabel="Confirm new password"
                testID="reset-password-confirm-password-input"
              />
              <Text
                style={[
                  styles.validationText,
                  canSubmit ? styles.validationTextReady : styles.validationTextMuted,
                ]}
                testID="reset-password-validation-message"
              >
                {passwordValidationMessage}
              </Text>
              <Pressable
                style={[styles.button, !canSubmit && styles.buttonDisabled]}
                onPress={updatePassword}
                accessibilityRole="button"
                accessibilityLabel="Update password"
                accessibilityState={{ disabled: !canSubmit, busy: saving }}
                testID="reset-password-update-button"
              >
                <Text style={styles.buttonText}>{saving ? "Updating..." : "Update password"}</Text>
              </Pressable>
            </View>
          ) : null}

          {status === "missing" || status === "failed" ? (
            <View testID="reset-password-expired-state" collapsable={false}>
              <Pressable
                style={styles.button}
                onPress={requestNewResetEmail}
                onPressIn={requestNewResetEmail}
                accessibilityRole="button"
                accessibilityLabel="Request new reset email"
                testID="reset-password-request-new-email-button"
              >
                <Text style={styles.buttonText}>Request new reset email</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={backToSignIn}
                onPressIn={backToSignIn}
                accessibilityRole="button"
                accessibilityLabel="Back to sign in"
                testID="reset-password-back-to-sign-in-button"
              >
                <Text style={styles.secondaryButtonText}>Back to sign in</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardShell: {
    flex: 1,
    backgroundColor: "#06070B",
  },
  container: {
    flexGrow: 1,
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
  subtitle: {
    color: "#A9B3C8",
    fontSize: 13.5,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 20,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    color: "white",
    marginBottom: 14,
    padding: 14,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#DC143C",
    borderRadius: 14,
    marginTop: 6,
    padding: 16,
  },
  buttonDisabled: {
    backgroundColor: "rgba(220,20,60,0.42)",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    padding: 15,
  },
  secondaryButtonText: {
    color: "#F4F7FC",
    fontSize: 15,
    fontWeight: "800",
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  statusText: {
    color: "#D7DEEC",
    fontSize: 13,
    fontWeight: "700",
  },
  validationText: {
    fontSize: 12.5,
    fontWeight: "800",
    lineHeight: 18,
    marginBottom: 10,
    marginTop: -2,
  },
  validationTextMuted: {
    color: "#9AA5BA",
  },
  validationTextReady: {
    color: "#8BE4A7",
  },
});
