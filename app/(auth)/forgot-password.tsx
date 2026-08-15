import { Link, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { trackEvent } from "../../_lib/analytics";
import { reportRuntimeError } from "../../_lib/logger";
import { isClosedBetaEnvironment } from "../../_lib/runtimeConfig";
import { supabase } from "../../_lib/supabase";
import { AppActionButton, AppStatusPill } from "../../components/ui/app-surface";

const LOGIN_BACKGROUND_SOURCE = require("../../assets/images/chicago-skyline.jpg");
const PASSWORD_RESET_REDIRECT_URL = "chillywoodmobile://reset-password";

function getPasswordResetErrorMessage(error: unknown) {
  const raw = String(
    (error as { message?: unknown; code?: unknown; name?: unknown } | null)?.message
    ?? (error as { code?: unknown } | null)?.code
    ?? (error as { name?: unknown } | null)?.name
    ?? "",
  ).toLowerCase();

  if (raw.includes("email rate") || raw.includes("over_email_send_rate_limit") || raw.includes("rate limit")) {
    return "Too many reset emails were requested. Wait a few minutes, then try again.";
  }
  if (raw.includes("invalid") && raw.includes("email")) {
    return "Enter a valid email address.";
  }
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("offline") || raw.includes("timeout")) {
    return "Couldn't reach password reset. Check your connection and try again.";
  }
  return "Unable to send a reset link right now.";
}

async function requestPasswordResetEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: PASSWORD_RESET_REDIRECT_URL,
  });

  if (error) throw error;
}

export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string; redirectId?: string }>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const redirectId = String(params.redirectId ?? "").trim();
  const [email, setEmail] = useState(String(params.email ?? "").trim());
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const sendPasswordReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      Alert.alert("Reset password", "Enter the email for your Chi'llywood account.");
      return;
    }

    setLoading(true);

    try {
      await requestPasswordResetEmail(normalizedEmail);
      setSent(true);
      trackEvent("auth_password_reset_requested", {
        source: "forgot_password_screen",
      });
      Alert.alert("Reset password", "Check your email for a password reset link. It may take a minute to arrive.");
    } catch (error) {
      reportRuntimeError("auth-password-reset", error, {
        source: "forgot_password_screen",
      });
      trackEvent("auth_password_reset_failure", {
        reason: "runtime_error",
      });
      Alert.alert("Reset password", getPasswordResetErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={LOGIN_BACKGROUND_SOURCE} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardShell}
      >
        <ScrollView
          ref={scrollRef}
          bounces={false}
          contentContainerStyle={[
            styles.container,
            {
              paddingTop: Math.max(insets.top + 32, 72),
              paddingBottom: Math.max(insets.bottom + 96, 120),
            },
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.kicker}>CHI&apos;LLYWOOD</Text>
              <AppStatusPill label={isClosedBetaEnvironment() ? "Closed Beta" : "Public V1"} tone="accent" />
            </View>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>
              Enter your account email. Chi&apos;llywood will send a reset link that opens the app reset screen.
            </Text>

            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              onFocus={() => {
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
              }}
              onSubmitEditing={() => {
                void sendPasswordReset();
              }}
              placeholder="Email"
              placeholderTextColor="#7A859A"
              returnKeyType="send"
              style={styles.input}
              testID="forgot-password-email-input"
              value={email}
              accessibilityLabel="Password reset email"
              accessibilityHint="Enter the email address for your Chi'llywood account"
            />

            {sent ? (
              <View style={styles.sentBox} testID="forgot-password-sent-state">
                <Text style={styles.sentTitle}>Reset link sent</Text>
                <Text style={styles.sentBody}>
                  Open the newest email from Chi&apos;llywood. After you update your password, the app returns to login.
                </Text>
              </View>
            ) : null}

            <AppActionButton
              accessibilityLabel="Send password reset email"
              label={loading ? "Sending..." : "Send reset link"}
              loading={loading}
              onPress={sendPasswordReset}
              testID="forgot-password-submit-button"
              variant="primary"
            />

            <Link
              href={{ pathname: "/(auth)/login", params: redirectId ? { redirectId } : {} }}
              style={styles.backLink}
            >
              Back to login
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: "#06070B",
  },
  backLink: {
    color: "#F2F5FB",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 18,
    textAlign: "center",
  },
  card: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(7,10,16,0.88)",
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  input: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  keyboardShell: {
    flex: 1,
  },
  kicker: {
    color: "#AAB4C8",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,10,16,0.74)",
  },
  sentBody: {
    color: "#B8C2D8",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  sentBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.36)",
    backgroundColor: "rgba(34,197,94,0.12)",
    gap: 6,
    marginBottom: 14,
    padding: 14,
  },
  sentTitle: {
    color: "#D9FFE8",
    fontSize: 15,
    fontWeight: "900",
  },
  subtitle: {
    color: "#B8C2D8",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
    marginBottom: 22,
  },
  title: {
    color: "#F2F5FB",
    fontSize: 38,
    fontWeight: "900",
    marginBottom: 14,
  },
});
