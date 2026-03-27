import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { trackEvent } from "../../_lib/analytics";
import { reportRuntimeError } from "../../_lib/logger";
import { isClosedBetaEnvironment } from "../../_lib/runtimeConfig";
import { supabase } from "../../_lib/supabase";

export default function Signup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectTo?: string }>();
  const redirectTo = String(params.redirectTo ?? "").trim() || "/(tabs)";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const signUp = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Enter email and password");
      return;
    }

    setLoading(true);

    try {
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
    <View style={styles.container}>
      <Text style={styles.title}>{isClosedBetaEnvironment() ? "Create Closed Beta Account" : "Create Account"}</Text>
      <Text style={styles.subtitle}>
        {isClosedBetaEnvironment()
          ? "Sign up with the invited email for this small Chi'llywood beta. Accounts that are not on the invite list will stay blocked from invite-only flows."
          : "Create an account so you can join rooms, manage your channel, and send in-app support feedback."}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={styles.button} onPress={signUp} disabled={loading}>
        <Text style={styles.buttonText}>
          {loading ? "Creating..." : "Sign Up"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    marginBottom: 20,
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
});
