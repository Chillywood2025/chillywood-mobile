import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Link, type Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createActionSingleFlightLatch } from "../../_lib/actionSingleFlight.mjs";
import { trackEvent } from "../../_lib/analytics";
import { reportRuntimeError } from "../../_lib/logger";
import { isClosedBetaEnvironment } from "../../_lib/runtimeConfig";
import { completePendingSignupProfile } from "../../_lib/signupProfileCompletion";
import { supabase } from "../../_lib/supabase";
import { getUserFacingErrorMessage } from "../../_lib/userFacingErrors";
import { AppActionButton, AppStatusPill } from "../../components/ui/app-surface";
import {
  ChillywoodBrandedSurface,
  ChillywoodBrandReserve,
  ChillywoodGlassPanel,
} from "../../components/ui/chillywood-branded-surface";

const PENDING_CONFIRMATION_MESSAGE = "A previous confirmation request is still pending. Check your inbox. You can sign in, but another email request must wait.";

function NeonSignInButton({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityLabel="Log in"
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      activeOpacity={0.82}
      disabled={loading}
      onPress={onPress}
      style={[styles.primaryButton, loading && styles.controlDisabled]}
      testID="auth-login-submit-button"
    >
      <Svg height="100%" pointerEvents="none" style={StyleSheet.absoluteFill} width="100%">
        <Defs>
          <LinearGradient id="loginButtonGradient" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="#7300D8" />
            <Stop offset="0.54" stopColor="#321CFF" />
            <Stop offset="1" stopColor="#00A8FF" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#loginButtonGradient)" height="100%" rx="16" width="100%" />
      </Svg>
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <View style={styles.primaryButtonContent}>
          <Text style={styles.primaryButtonText}>Log In</Text>
          <MaterialIcons accessibilityElementsHidden importantForAccessibility="no-hide-descendants" color="#FFFFFF" name="arrow-forward" size={24} />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectId?: string }>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const signInLatchRef = useRef(createActionSingleFlightLatch());
  const resendLatchRef = useRef(createActionSingleFlightLatch());
  const resendGenerationRef = useRef(0);
  const resendFocusedRef = useRef(false);
  const resendEmailRef = useRef("");
  const resendAttemptTimesRef = useRef(new Map<string, number>());
  const resendWaitExpiredRef = useRef(false);
  const resendWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectId = String(params.redirectId ?? "").trim();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendWaitExpired, setResendWaitExpired] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const closedBeta = isClosedBetaEnvironment();

  useFocusEffect(useCallback(() => {
    resendFocusedRef.current = true;
    resendGenerationRef.current += 1;
    setResending(resendLatchRef.current.isActive());
    setResendWaitExpired(resendWaitExpiredRef.current);
    setResendMessage(resendLatchRef.current.isActive() && resendWaitExpiredRef.current
      ? PENDING_CONFIRMATION_MESSAGE
      : "");
    return () => {
      resendFocusedRef.current = false;
      resendGenerationRef.current += 1;
    };
  }, []));

  useEffect(() => () => {
    if (resendWaitTimerRef.current !== null) clearTimeout(resendWaitTimerRef.current);
  }, []);

  const changeEmail = (value: string) => {
    resendEmailRef.current = value;
    resendGenerationRef.current += 1;
    setResendMessage(resendLatchRef.current.isActive() && resendWaitExpiredRef.current
      ? PENDING_CONFIRMATION_MESSAGE
      : "");
    setEmail(value);
  };

  const resendConfirmation = async () => {
    if (!resendFocusedRef.current || signInLatchRef.current.isActive()) return;
    const targetEmail = resendEmailRef.current.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setResendMessage("Enter your account email above, then request a confirmation link.");
      return;
    }
    if (!resendLatchRef.current.tryAcquire()) return;
    const generation = resendGenerationRef.current;
    const isCurrent = () => resendFocusedRef.current && resendGenerationRef.current === generation;
    const now = Date.now();
    const previousAttempt = resendAttemptTimesRef.current.get(targetEmail);
    if (previousAttempt !== undefined && now - previousAttempt < 60_000) {
      resendLatchRef.current.release();
      setResendMessage("Wait at least a minute between requests and check your inbox and spam before trying again.");
      return;
    }
    resendAttemptTimesRef.current.set(targetEmail, now);
    setResending(true);
    resendWaitExpiredRef.current = false;
    setResendWaitExpired(false);
    setResendMessage("");
    // This bounds the UI wait only. Keep the send latch until actual settlement:
    // a timeout does not prove the email request was canceled or never received.
    resendWaitTimerRef.current = setTimeout(() => {
      resendWaitExpiredRef.current = true;
      if (resendFocusedRef.current) {
        setResendWaitExpired(true);
        if (isCurrent()) {
          setResendMessage("The confirmation request is taking longer than expected. Its outcome is not confirmed; check your inbox. You can sign in, but another email request must wait.");
        } else setResendMessage(PENDING_CONFIRMATION_MESSAGE);
      }
    }, 15_000);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: targetEmail,
        options: { emailRedirectTo: "https://chillywoodstream.com/auth-callback" },
      });
      if (!isCurrent()) return;
      const code = String(error?.code ?? "").toLowerCase();
      const message = String(error?.message ?? "").toLowerCase();
      if (error?.status === 429 || code.includes("rate_limit") || message.includes("rate limit") || message.includes("security purposes")) {
        setResendMessage("Too many email requests. Wait a few minutes and check your inbox before trying again.");
      } else if (error && ((error.status ?? 0) >= 500 || message.includes("network") || message.includes("fetch") || message.includes("timeout") || message.includes("timed out"))) {
        setResendMessage("We couldn't confirm whether an email was sent. Check your inbox and connection, then wait before trying again.");
      } else {
        // Do not reveal whether this email has an account or is already verified.
        setResendMessage("If this email is eligible for signup confirmation, check its inbox and spam for a new link. If nothing arrives, wait before trying again.");
      }
    } catch {
      if (isCurrent()) {
        setResendMessage("We couldn't confirm whether an email was sent. Check your inbox and connection, then wait before trying again.");
      }
    } finally {
      if (resendWaitTimerRef.current !== null) clearTimeout(resendWaitTimerRef.current);
      resendWaitTimerRef.current = null;
      resendWaitExpiredRef.current = false;
      resendLatchRef.current.release();
      if (resendFocusedRef.current) {
        setResending(false);
        setResendWaitExpired(false);
        if (!isCurrent()) {
          setResendMessage((current) => current === PENDING_CONFIRMATION_MESSAGE ? "" : current);
        }
      }
    }
  };

  const signIn = async () => {
    if (resendLatchRef.current.isActive() && !resendWaitExpiredRef.current) return;
    if (!email || !password) {
      Alert.alert("Error", "Enter email and password");
      return;
    }

    if (!signInLatchRef.current.tryAcquire()) return;
    resendGenerationRef.current += 1;
    setResendMessage("");
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        trackEvent("auth_sign_in_failure", {
          reason: error.code ?? error.name ?? "auth_error",
        });
        Alert.alert(
          "Login Error",
          getUserFacingErrorMessage(error, "Unable to sign in right now."),
        );
        return;
      }

      trackEvent("auth_sign_in_success", {
        hasRedirect: !!redirectId,
      });

      const profileResult = await completePendingSignupProfile({
        user: data.user,
      });
      if (!profileResult.ok) {
        Alert.alert("Finish account setup", profileResult.message);
      }
    } catch (error) {
      reportRuntimeError("auth-login", error, {
        hasRedirect: !!redirectId,
      });
      trackEvent("auth_sign_in_failure", {
        reason: "runtime_error",
      });
      Alert.alert("Login Error", "Unable to sign in right now.");
    } finally {
      signInLatchRef.current.release();
      setLoading(false);
    }
  };

  return (
    <ChillywoodBrandedSurface testID="auth-login-branded-surface">
      <KeyboardAvoidingView
        style={styles.keyboardShell}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.container,
            {
              paddingTop: Math.max(insets.top + 12, 32),
              paddingBottom: Math.max(insets.bottom + 42, 68),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <ChillywoodBrandReserve testID="auth-login-branding-clearance" />
          <ChillywoodGlassPanel testID="auth-login-glass-panel">
            <View style={styles.headerRow}>
              <Text style={styles.kicker}>WELCOME BACK</Text>
              {closedBeta ? <AppStatusPill label="Closed Beta" tone="accent" /> : null}
            </View>
            <Text style={styles.title}>
              <Text style={styles.titleLight}>Sign </Text>
              <Text style={styles.titleAccent}>In</Text>
            </Text>
            <Text style={styles.subtitle}>
              {closedBeta
                ? "Use your invited Chi'llywood account to join rooms and keep up with your favorite creators."
                : "Access your account, join rooms, and keep up with your favorite creators."}
            </Text>

            <View style={styles.inputShell}>
              <MaterialIcons accessibilityElementsHidden importantForAccessibility="no-hide-descendants" color="#B9B6D1" name="mail-outline" size={25} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#8D8AA5"
                accessibilityLabel="Login email"
                accessibilityHint="Enter the email address for your Chi'llywood account"
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                returnKeyType="next"
                testID="auth-login-email-input"
                value={email}
                onChangeText={changeEmail}
                onFocus={() => {
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                }}
              />
            </View>

            <View style={styles.inputShell}>
              <MaterialIcons accessibilityElementsHidden importantForAccessibility="no-hide-descendants" color="#B9B6D1" name="lock-outline" size={25} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#8D8AA5"
                accessibilityLabel="Login password"
                accessibilityHint="Enter your Chi'llywood account password"
                secureTextEntry
                returnKeyType="done"
                testID="auth-login-password-input"
                value={password}
                onChangeText={setPassword}
                onFocus={() => {
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                }}
                onSubmitEditing={() => {
                  void signIn();
                }}
              />
            </View>

            <NeonSignInButton loading={loading || (resending && !resendWaitExpired)} onPress={() => { void signIn(); }} />

            <Text style={styles.muted}>Need to confirm your account? Send a new signup link to the email entered above.</Text>
            <AppActionButton
              accessibilityLabel="Resend signup confirmation email"
              label={resending ? (resendWaitExpired ? "Confirmation request pending" : "Requesting confirmation...") : "Resend confirmation email"}
              disabled={loading || resending}
              onPress={() => { void resendConfirmation(); }}
              testID="login-resend-confirmation-button"
              variant="secondary"
            />
            {resendMessage ? (
              <Text style={styles.muted} accessibilityLiveRegion="polite" testID="login-resend-confirmation-message">
                {resendMessage}
              </Text>
            ) : null}

            <AppActionButton
              accessibilityLabel="Forgot password"
              label="Forgot password?"
              onPress={() => {
                const query = new URLSearchParams();
                if (email.trim()) query.set("email", email.trim());
                if (redirectId) query.set("redirectId", redirectId);
                router.push(`/forgot-password?${query.toString()}` as Href);
              }}
              style={styles.forgotPasswordButton}
              testID="login-forgot-password-button"
              variant="secondary"
            />

            <View style={styles.row}>
              <Text style={styles.muted}>No account?</Text>
              <Link href={{ pathname: "/(auth)/signup", params: redirectId ? { redirectId } : {} }} style={styles.link}>
                Sign up
              </Link>
            </View>
          </ChillywoodGlassPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </ChillywoodBrandedSurface>
  );
}

const styles = StyleSheet.create({
  keyboardShell: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  kicker: {
    color: "#D2CFE2",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2.4,
  },
  title: {
    fontSize: 42,
    fontWeight: "900",
    lineHeight: 49,
    marginBottom: 8,
  },
  titleLight: {
    color: "#FFFFFF",
  },
  titleAccent: {
    color: "#6E21FF",
  },
  subtitle: {
    color: "#B7B3C7",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    marginBottom: 24,
  },
  inputShell: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(17,15,42,0.76)",
    borderWidth: 1,
    borderColor: "rgba(102,61,190,0.72)",
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    minHeight: 58,
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    paddingVertical: 12,
  },
  primaryButton: {
    minHeight: 58,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(91,214,255,0.72)",
    marginBottom: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#241DFF",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.46,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  controlDisabled: {
    opacity: 0.62,
  },
  forgotPasswordButton: {
    minHeight: 54,
    borderColor: "rgba(94,71,174,0.76)",
    backgroundColor: "rgba(13,12,36,0.58)",
  },
  row: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 22,
  },
  muted: { color: "#A8A4B7", fontSize: 15 },
  link: { color: "#8B20FF", fontSize: 15, fontWeight: "900" },
});
