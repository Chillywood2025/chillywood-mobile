import { Link, type Href, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { recordAccountLegalAcceptance } from "../../_lib/accountLegalAcceptance";
import { trackEvent } from "../../_lib/analytics";
import { readAppConfig } from "../../_lib/appConfig";
import { reportRuntimeError } from "../../_lib/logger";
import { isClosedBetaEnvironment } from "../../_lib/runtimeConfig";
import { supabase } from "../../_lib/supabase";
import { completePendingSignupProfile } from "../../_lib/signupProfileCompletion";
import {
  buildUsernameSuggestions,
  checkUsernameAvailability,
  formatUsernameHandle,
  normalizeUsernameHandle,
  validateUsernameHandle,
  type UsernameAvailability,
} from "../../_lib/usernameHandles";

const COMMUNITY_GUIDELINES_HREF = "/community-guidelines" as Href;

function getSignupErrorMessage(error: unknown) {
  const raw = String(
    (error as { message?: unknown; code?: unknown; name?: unknown } | null)?.message
    ?? (error as { code?: unknown } | null)?.code
    ?? (error as { name?: unknown } | null)?.name
    ?? "",
  ).toLowerCase();

  if (raw.includes("email rate") || raw.includes("over_email_send_rate_limit") || raw.includes("rate limit")) {
    return "Too many signup attempts. Try again later.";
  }
  if (raw.includes("already registered") || raw.includes("already exists")) {
    return "An account already exists for this email. Sign in instead.";
  }
  if (raw.includes("invalid") && raw.includes("email")) {
    return "Enter a valid email address.";
  }
  if (raw.includes("password")) {
    return "Use a stronger password.";
  }
  return "Unable to sign up right now.";
}

export default function Signup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectTo?: string }>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const redirectTo = String(params.redirectTo ?? "").trim() || "/(tabs)";
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailability>({
    username: "",
    available: false,
    status: "idle",
    message: "Choose your username",
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const usernameSuggestions = useMemo(() => buildUsernameSuggestions(displayName), [displayName]);
  const scrollSignupTo = (y: number) => {
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 160);
  };
  const scrollSignupIdentityIntoView = () => scrollSignupTo(180);
  const scrollSignupEmailIntoView = () => scrollSignupTo(360);
  const scrollSignupPasswordIntoView = () => scrollSignupTo(460);

  useEffect(() => {
    const local = validateUsernameHandle(username);
    setUsernameAvailability(local);
    if (!local.available) return;

    setUsernameAvailability({ ...local, status: "checking", available: false, message: "Checking..." });
    const timeout = setTimeout(() => {
      void checkUsernameAvailability(local.username)
        .then(setUsernameAvailability)
        .catch(() => {
          setUsernameAvailability({
            username: local.username,
            available: false,
            status: "not_allowed",
            message: "Not available",
          });
        });
    }, 400);

    return () => clearTimeout(timeout);
  }, [username]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const signUp = async () => {
    const normalizedDisplayName = displayName.trim();
    const normalizedUsername = normalizeUsernameHandle(username);

    if (!normalizedDisplayName) {
      Alert.alert("Choose your display name", "Add the name people should see on your Profile.");
      return;
    }

    if (!usernameAvailability.available || usernameAvailability.username !== normalizedUsername) {
      Alert.alert("Choose your username", usernameAvailability.message || "Choose an available username.");
      return;
    }

    if (!email || !password) {
      Alert.alert("Error", "Enter email and password");
      return;
    }

    if (!ageConfirmed) {
      Alert.alert(
        "18+ confirmation required",
        "Confirm you are 18 or older before creating a Chi'llywood account.",
      );
      return;
    }

    setLoading(true);

    try {
      const appConfig = await readAppConfig();

      if (appConfig.runtimeControls.new_accounts_enabled === false) {
        trackEvent("auth_sign_up_blocked", {
          reason: "new_accounts_paused",
        });
        Alert.alert(
          "New accounts are paused",
          "Chi'llywood account creation is temporarily paused. Please try again later.",
        );
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: normalizedDisplayName,
            username: normalizedUsername,
          },
        },
      });

      if (error) {
        trackEvent("auth_sign_up_failure", {
          reason: error.code ?? error.name ?? "auth_error",
        });
        Alert.alert("Signup Error", getSignupErrorMessage(error));
        return;
      }

      trackEvent("auth_sign_up_success", {
        hasSession: !!data.session,
      });

      if (data.session?.user?.id) {
        const profileResult = await completePendingSignupProfile({
          user: data.session.user,
          username: normalizedUsername,
          displayName: normalizedDisplayName,
        });
        if (!profileResult.ok) {
          Alert.alert("Choose your username", profileResult.message);
          return;
        }

        const acceptanceResult = await recordAccountLegalAcceptance(
          supabase,
          data.session.user.id,
        );

        if (!acceptanceResult.ok) {
          reportRuntimeError(
            "auth-signup-legal-acceptance",
            new Error(acceptanceResult.errorMessage),
            {
              code: acceptanceResult.code ?? "unknown",
            },
          );
          trackEvent("auth_legal_acceptance_failure", {
            reason: acceptanceResult.code ?? "write_failed",
          });
          Alert.alert(
            "Signup Error",
            "Your account was created, but Chi'llywood could not store the required 18+ and legal acceptance. Sign in and contact support if this continues.",
          );
          return;
        }

        trackEvent("auth_legal_acceptance_recorded", {
          source: "signup",
        });
      } else if (data.user?.id) {
        trackEvent("auth_legal_acceptance_deferred", {
          reason: "signup_session_unavailable",
        });
      }

      if (data.session?.user) {
        router.replace(redirectTo as Parameters<typeof router.replace>[0]);
        return;
      }

      Alert.alert(
        "Success",
        isClosedBetaEnvironment()
          ? "Check your email to confirm signup. Closed-beta access only activates if this email is on the invite list."
          : "Check your email to confirm signup before signing in.",
      );
    } catch (error) {
      reportRuntimeError("auth-signup", error, {
        redirectTo,
      });
      trackEvent("auth_sign_up_failure", {
        reason: "runtime_error",
      });
      Alert.alert("Signup Error", "Unable to sign up right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardShell}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(insets.top + 32, 72),
            paddingBottom: Math.max(insets.bottom + (keyboardVisible ? 188 : 128), keyboardVisible ? 208 : 152),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.title}>{isClosedBetaEnvironment() ? "Create Closed Beta Account" : "Create Account"}</Text>
        <Text style={styles.subtitle}>
          {isClosedBetaEnvironment()
            ? "Sign up with the invited email for this small Chi'llywood beta. Accounts that are not on the invite list will stay blocked from invite-only flows."
            : "Create an account so you can join rooms, manage your Platform, and send in-app support feedback."}
        </Text>
        <View style={styles.ageGateCard}>
          <Text style={styles.ageGateTitle}>Chi'llywood is for users 18 and older.</Text>
          <Pressable
            style={styles.ageGateRow}
            onPress={() => setAgeConfirmed((current) => !current)}
            disabled={loading}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ageConfirmed, disabled: loading }}
          >
            <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
              {ageConfirmed ? <View style={styles.checkboxDot} /> : null}
            </View>
            <Text style={styles.ageGateLabel}>I confirm I am 18 or older.</Text>
          </Pressable>
        </View>
        <Text style={styles.legalNotice}>
          By creating an account, you agree to Chi'llywood's{" "}
          <Link href="/terms" style={styles.legalLink}>
            Terms of Service
          </Link>
          {", "}
          <Link href="/privacy" style={styles.legalLink}>
            Privacy Policy
          </Link>
          {" and "}
          <Link href={COMMUNITY_GUIDELINES_HREF} style={styles.legalLink}>
            Community Guidelines
          </Link>
          {"."}
        </Text>
        <View style={styles.usernameCard}>
          <Text style={styles.usernameTitle}>Choose your username</Text>
          <Text style={styles.usernameHelper}>This is how people find you.</Text>
          <TextInput
            style={styles.input}
            placeholder="Display name"
            autoCapitalize="words"
            autoCorrect
            returnKeyType="next"
            value={displayName}
            onChangeText={setDisplayName}
            onFocus={scrollSignupIdentityIntoView}
          />
          <View style={styles.usernameInputWrap}>
            <Text style={styles.atPrefix}>@</Text>
            <TextInput
              style={styles.usernameInput}
              placeholder="creatorname"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              value={username}
              onChangeText={(value) => setUsername(normalizeUsernameHandle(value))}
              onFocus={scrollSignupIdentityIntoView}
            />
          </View>
          <View style={styles.usernameStatusRow}>
            <View style={[
              styles.usernameStatusPill,
              usernameAvailability.available && styles.usernameStatusPillAvailable,
              (usernameAvailability.status === "taken" || usernameAvailability.status === "reserved" || usernameAvailability.status === "not_allowed") && styles.usernameStatusPillBlocked,
            ]}>
              <Text style={[
                styles.usernameStatusText,
                usernameAvailability.available && styles.usernameStatusTextAvailable,
                (usernameAvailability.status === "taken" || usernameAvailability.status === "reserved" || usernameAvailability.status === "not_allowed") && styles.usernameStatusTextBlocked,
              ]}>
                {usernameAvailability.message}
              </Text>
            </View>
            {usernameAvailability.username ? (
              <Text style={styles.usernamePreview}>{formatUsernameHandle(usernameAvailability.username)}</Text>
            ) : null}
          </View>
          {usernameSuggestions.length ? (
            <View style={styles.suggestionRow}>
              {usernameSuggestions.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  style={styles.suggestionChip}
                  onPress={() => setUsername(suggestion)}
                  disabled={loading}
                >
                  <Text style={styles.suggestionChipText}>@{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
          onFocus={scrollSignupEmailIntoView}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          returnKeyType="done"
          value={password}
          onChangeText={setPassword}
          onFocus={scrollSignupPasswordIntoView}
          onSubmitEditing={() => {
            void signUp();
          }}
        />

        <Pressable style={styles.button} onPress={signUp} disabled={loading}>
          <Text style={styles.buttonText}>
            {loading ? "Creating..." : "Sign Up"}
          </Text>
        </Pressable>

        <View style={styles.row}>
          <Text style={styles.muted}>Already have an account?</Text>
          <Link href={{ pathname: "/(auth)/login", params: { redirectTo } }} style={styles.link}>
            Sign in
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardShell: {
    flex: 1,
    backgroundColor: "#0B0B0F",
  },
  container: {
    flexGrow: 1,
    backgroundColor: "#0B0B0F",
    padding: 24,
    justifyContent: "flex-start",
  },
  title: {
    color: "#DC143C",
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 10,
  },
  subtitle: {
    color: "#A9B3C8",
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "600",
    marginBottom: 14,
  },
  legalNotice: {
    color: "#A9B3C8",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    marginBottom: 20,
  },
  ageGateCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  ageGateTitle: {
    color: "#F4F7FC",
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: "800",
  },
  ageGateRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: "#FF5A76",
    backgroundColor: "rgba(220,20,60,0.28)",
  },
  checkboxDot: {
    width: 10,
    height: 10,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  ageGateLabel: {
    flex: 1,
    color: "#D9E3F9",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  legalLink: {
    color: "#FF5A76",
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  usernameCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    marginBottom: 16,
  },
  usernameTitle: {
    color: "#F8FAFF",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  usernameHelper: {
    color: "#A9B3C8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  usernameInputWrap: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: "#1A1A22",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  atPrefix: {
    color: "#FF5A76",
    fontSize: 16,
    fontWeight: "900",
    marginRight: 2,
  },
  usernameInput: {
    flex: 1,
    color: "white",
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "700",
  },
  usernameStatusRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  usernameStatusPill: {
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.16)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  usernameStatusPillAvailable: {
    backgroundColor: "rgba(34,197,94,0.18)",
  },
  usernameStatusPillBlocked: {
    backgroundColor: "rgba(248,113,113,0.16)",
  },
  usernameStatusText: {
    color: "#B8C2D6",
    fontSize: 11.5,
    fontWeight: "800",
  },
  usernameStatusTextAvailable: {
    color: "#7EF0A1",
  },
  usernameStatusTextBlocked: {
    color: "#FF9AA8",
  },
  usernamePreview: {
    color: "#DDE6F8",
    fontSize: 12,
    fontWeight: "800",
    flexShrink: 1,
  },
  suggestionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  suggestionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  suggestionChipText: {
    color: "#F4F7FC",
    fontSize: 12,
    fontWeight: "800",
  },
  input: {
    backgroundColor: "#1A1A22",
    color: "white",
    padding: 14,
    borderRadius: 10,
    marginBottom: 14,
  },
  button: {
    backgroundColor: "#DC143C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },
  muted: {
    color: "#8B94A6",
    fontSize: 13,
    fontWeight: "600",
  },
  link: {
    color: "#FF5A76",
    fontSize: 13,
    fontWeight: "800",
  },
});
