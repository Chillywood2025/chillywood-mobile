import { Href, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { reportRuntimeError } from "../_lib/logger";
import { supabase } from "../_lib/supabase";

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

const PASSWORD_MIN_LENGTH = 8;
const RECOVERY_LINK_OPEN_ERROR = "This reset link expired or could not be opened. Request a fresh link.";
const RECOVERY_PARAM_KEYS = [
  "access_token",
  "code",
  "email",
  "error",
  "error_code",
  "error_description",
  "refresh_token",
  "token",
  "token_hash",
] as const;

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

type VerifiedRecoveryData = {
  session?: {
    access_token?: string | null;
    refresh_token?: string | null;
  } | null;
} | null;

function getRecoveryParamsKey(recovery: RecoveryParams) {
  if (recovery.accessToken && recovery.refreshToken) {
    return `url_session:${recovery.accessToken}:${recovery.refreshToken}`;
  }
  if (recovery.code) return `code:${recovery.code}`;
  if (recovery.tokenHash) return `token_hash:${recovery.tokenHash}`;
  if (recovery.token && recovery.email) return `email_token:${recovery.email}:${recovery.token}`;
  if (recovery.error || recovery.errorCode) return `error:${recovery.errorCode || recovery.error}`;
  return null;
}

const readParam = (params: URLSearchParams, key: string) => {
  const value = params.get(key);
  return value ? value.trim() : null;
};

const readRouteParam = (
  params: Partial<Record<(typeof RECOVERY_PARAM_KEYS)[number], string | string[]>>,
  key: (typeof RECOVERY_PARAM_KEYS)[number],
) => {
  const value = params[key];
  const normalizedValue = Array.isArray(value) ? value[0] : value;
  return normalizedValue ? normalizedValue.trim() : null;
};

const parseRecoveryUrl = (url: string | null): RecoveryParams | null => {
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
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
  params: Partial<Record<(typeof RECOVERY_PARAM_KEYS)[number], string | string[]>>,
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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<
    Partial<Record<(typeof RECOVERY_PARAM_KEYS)[number], string | string[]>>
  >();
  const insets = useSafeAreaInsets();
  const handledRecoveryKeyRef = useRef<string | null>(null);
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [statusMessage, setStatusMessage] = useState("Checking your reset link...");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

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

  const markRecoveryReady = useCallback((flow: string) => {
    setStatus("ready");
    setStatusMessage("Choose a new password for this account.");
    trackEvent("auth_password_recovery_link_opened", {
      flow,
    });
  }, []);

  const markRecoveryFailed = useCallback((error: unknown, flow: string) => {
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
      const { error } = await supabase.auth.setSession({
        access_token: verifiedSession.access_token,
        refresh_token: verifiedSession.refresh_token,
      });

      if (error) throw error;

      markRecoveryReady(flow);
      return true;
    }

    const { data: currentSession } = await supabase.auth.getSession();

    if (currentSession.session) {
      markRecoveryReady(flow);
      return true;
    }

    return false;
  }, [markRecoveryReady]);

  const markReadyFromExistingSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      markRecoveryReady("existing_session");
      return;
    }

    setStatus("missing");
    setStatusMessage("This reset link is missing or expired. Request a fresh password reset email.");
  }, [markRecoveryReady]);

  const consumeRecoveryParams = useCallback(async (recovery: RecoveryParams | null) => {
    if (!recovery) return false;

    const recoveryKey = getRecoveryParamsKey(recovery);
    if (recoveryKey && handledRecoveryKeyRef.current === recoveryKey) return true;
    handledRecoveryKeyRef.current = recoveryKey;

    if (recovery.error || recovery.errorCode) {
      setStatus("failed");
      setStatusMessage(RECOVERY_LINK_OPEN_ERROR);
      trackEvent("auth_password_recovery_link_failed", {
        reason: getSanitizedRecoveryErrorReason(recovery.errorCode || recovery.error),
      });
      return true;
    }

    if (recovery.accessToken && recovery.refreshToken) {
      setStatus("checking");
      setStatusMessage("Opening your reset session...");

      const { error } = await supabase.auth.setSession({
        access_token: recovery.accessToken,
        refresh_token: recovery.refreshToken,
      });

      if (error) {
        markRecoveryFailed(error, "url_session");
        return true;
      }

      markRecoveryReady("url_session");
      return true;
    }

    if (recovery.code) {
      setStatus("checking");
      setStatusMessage("Opening your reset session...");

      const { error } = await supabase.auth.exchangeCodeForSession(recovery.code);

      if (error) {
        markRecoveryFailed(error, "code");
        return true;
      }

      markRecoveryReady("code");
      return true;
    }

    if (recovery.tokenHash) {
      setStatus("checking");
      setStatusMessage("Opening your reset session...");

      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: recovery.tokenHash,
        type: "recovery",
      });

      if (error) {
        markRecoveryFailed(error, "token_hash");
        return true;
      }

      const established = await establishVerifiedRecoverySession(data, "token_hash");
      if (!established) {
        markRecoveryFailed(new Error("no_recovery_session"), "token_hash");
      }
      return true;
    }

    if (recovery.token && recovery.email) {
      setStatus("checking");
      setStatusMessage("Opening your reset session...");

      const { data, error } = await supabase.auth.verifyOtp({
        email: recovery.email,
        token: recovery.token,
        type: "recovery",
      });

      if (error) {
        markRecoveryFailed(error, "email_token");
        return true;
      }

      const established = await establishVerifiedRecoverySession(data, "email_token");
      if (!established) {
        markRecoveryFailed(new Error("no_recovery_session"), "email_token");
      }
      return true;
    }

    return false;
  }, [establishVerifiedRecoverySession, markRecoveryFailed, markRecoveryReady]);

  const consumeRecoveryUrl = useCallback(async (url: string | null) => (
    consumeRecoveryParams(parseRecoveryUrl(url))
  ), [consumeRecoveryParams]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "PASSWORD_RECOVERY" || !session) return;

      handledRecoveryKeyRef.current = "password_recovery_event";
      markRecoveryReady("password_recovery_event");
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [markRecoveryReady]);

  useEffect(() => {
    let active = true;

    const bootstrapRecovery = async () => {
      try {
        const consumedRouteParams = await consumeRecoveryParams(routeRecoveryParams);
        if (!active || consumedRouteParams) return;

        const initialUrl = await Linking.getInitialURL();
        const consumed = await consumeRecoveryUrl(initialUrl);
        if (!active || consumed) return;
        await markReadyFromExistingSession();
      } catch (error) {
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
  }, [consumeRecoveryParams, consumeRecoveryUrl, markReadyFromExistingSession, routeRecoveryParams]);

  const updatePassword = useCallback(async () => {
    if (saving) return;

    if (status !== "ready") {
      Alert.alert("Reset password", "Open the newest reset email again, then choose a new password.");
      return;
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
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        trackEvent("auth_password_recovery_update_failed", {
          reason: error.name ?? "auth_error",
        });
        Alert.alert("Reset password", getPasswordUpdateErrorMessage(error));
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
      await supabase.auth.signOut().catch(() => null);
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
  }, [confirmPassword, newPassword, router, saving, status]);

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
          <Text style={styles.kicker}>CHI'LLYWOOD</Text>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>{statusMessage}</Text>

          {status === "checking" ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color="#DC143C" />
              <Text style={styles.statusText}>Opening reset link...</Text>
            </View>
          ) : null}

          {status === "ready" ? (
            <>
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
            </>
          ) : null}

          {status === "missing" || status === "failed" ? (
            <>
              <Pressable
                style={styles.button}
                onPress={() => router.replace("/forgot-password" as Href)}
                accessibilityRole="button"
                accessibilityLabel="Request new reset email"
              >
                <Text style={styles.buttonText}>Request new reset email</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.replace("/(auth)/login")}
              >
                <Text style={styles.secondaryButtonText}>Back to sign in</Text>
              </Pressable>
            </>
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
