import { useLocalSearchParams, useRouter } from "expo-router";
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
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  refreshToken: string | null;
};

type RecoveryStatus = "checking" | "ready" | "missing" | "failed";

const PASSWORD_MIN_LENGTH = 8;
const RECOVERY_PARAM_KEYS = [
  "access_token",
  "code",
  "error",
  "error_code",
  "error_description",
  "refresh_token",
] as const;

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
      error: readParam(params, "error"),
      errorCode: readParam(params, "error_code"),
      errorDescription: readParam(params, "error_description"),
      refreshToken: readParam(params, "refresh_token"),
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
    error: readRouteParam(params, "error"),
    errorCode: readRouteParam(params, "error_code"),
    errorDescription: readRouteParam(params, "error_description"),
    refreshToken: readRouteParam(params, "refresh_token"),
  };

  return Object.values(recovery).some(Boolean) ? recovery : null;
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<
    Partial<Record<(typeof RECOVERY_PARAM_KEYS)[number], string | string[]>>
  >();
  const insets = useSafeAreaInsets();
  const handledRecoveryRef = useRef(false);
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

  const routeRecoveryParams = useMemo(() => (
    parseRecoveryRouteParams(routeParams)
  ), [routeParams]);

  const markReadyFromExistingSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      setStatus("ready");
      setStatusMessage("Choose a new password for this account.");
      return;
    }

    setStatus("missing");
    setStatusMessage("This reset link is missing or expired. Request a fresh password reset email.");
  }, []);

  const consumeRecoveryParams = useCallback(async (recovery: RecoveryParams | null) => {
    if (handledRecoveryRef.current) return true;
    if (!recovery) return false;

    if (recovery.error || recovery.errorCode) {
      handledRecoveryRef.current = true;
      setStatus("failed");
      setStatusMessage(recovery.errorDescription || "This reset link could not be used. Request a fresh link.");
      trackEvent("auth_password_recovery_link_failed", {
        reason: recovery.errorCode || recovery.error || "unknown",
      });
      return true;
    }

    if (recovery.accessToken && recovery.refreshToken) {
      handledRecoveryRef.current = true;
      setStatus("checking");
      setStatusMessage("Opening your reset session...");

      const { error } = await supabase.auth.setSession({
        access_token: recovery.accessToken,
        refresh_token: recovery.refreshToken,
      });

      if (error) {
        setStatus("failed");
        setStatusMessage("This reset link could not be opened. Request a fresh link.");
        trackEvent("auth_password_recovery_link_failed", {
          reason: error.message,
        });
        return true;
      }

      setStatus("ready");
      setStatusMessage("Choose a new password for this account.");
      trackEvent("auth_password_recovery_link_opened", {
        flow: "token",
      });
      return true;
    }

    if (recovery.code) {
      handledRecoveryRef.current = true;
      setStatus("checking");
      setStatusMessage("Opening your reset session...");

      const { error } = await supabase.auth.exchangeCodeForSession(recovery.code);

      if (error) {
        setStatus("failed");
        setStatusMessage("This reset link could not be opened. Request a fresh link.");
        trackEvent("auth_password_recovery_link_failed", {
          reason: error.message,
        });
        return true;
      }

      setStatus("ready");
      setStatusMessage("Choose a new password for this account.");
      trackEvent("auth_password_recovery_link_opened", {
        flow: "code",
      });
      return true;
    }

    return false;
  }, []);

  const consumeRecoveryUrl = useCallback(async (url: string | null) => (
    consumeRecoveryParams(parseRecoveryUrl(url))
  ), [consumeRecoveryParams]);

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
          reason: error.message,
        });
        Alert.alert("Reset password", error.message);
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
      trackEvent("auth_password_recovery_update_success", {
        source: "reset-password",
      });
      Alert.alert("Reset password", "Your password has been updated.", [
        {
          text: "Continue",
          onPress: () => router.replace("/"),
        },
      ]);
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
  }, [confirmPassword, newPassword, router, saving]);

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
                secureTextEntry
                textContentType="newPassword"
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor="#7A859A"
                secureTextEntry
                textContentType="newPassword"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onSubmitEditing={() => {
                  void updatePassword();
                }}
              />
              <Pressable
                style={[styles.button, !canSubmit && styles.buttonDisabled]}
                onPress={updatePassword}
                disabled={!canSubmit}
              >
                <Text style={styles.buttonText}>{saving ? "Updating..." : "Update password"}</Text>
              </Pressable>
            </>
          ) : null}

          {status === "missing" || status === "failed" ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.replace("/(auth)/login")}
            >
              <Text style={styles.secondaryButtonText}>Back to sign in</Text>
            </Pressable>
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
});
