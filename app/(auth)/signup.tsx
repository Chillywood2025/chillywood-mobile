import { Link, type Href, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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

const COMMUNITY_GUIDELINES_HREF = "/community-guidelines" as Href;

export default function Signup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectTo?: string }>();
  const insets = useSafeAreaInsets();
  const redirectTo = String(params.redirectTo ?? "").trim() || "/(tabs)";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const signUp = async () => {
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
      });

      if (error) {
        trackEvent("auth_sign_up_failure", {
          reason: error.message,
        });
        Alert.alert("Signup Error", error.message);
        return;
      }

      trackEvent("auth_sign_up_success", {
        hasSession: !!data.session,
      });

      if (data.session?.user?.id) {
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(insets.top + 32, 72),
            paddingBottom: Math.max(insets.bottom + 24, 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.title}>{isClosedBetaEnvironment() ? "Create Closed Beta Account" : "Create Account"}</Text>
        <Text style={styles.subtitle}>
          {isClosedBetaEnvironment()
            ? "Sign up with the invited email for this small Chi'llywood beta. Accounts that are not on the invite list will stay blocked from invite-only flows."
            : "Create an account so you can join rooms, manage your channel, and send in-app support feedback."}
        </Text>
        <View style={styles.ageGateCard}>
          <Text style={styles.ageGateTitle}>Chi&apos;llywood is for users 18 and older.</Text>
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
          By creating an account, you agree to Chi&apos;llywood&apos;s{" "}
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

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          returnKeyType="done"
          value={password}
          onChangeText={setPassword}
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
    justifyContent: "center",
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
