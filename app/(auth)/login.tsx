import { Link, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { trackEvent } from "../../_lib/analytics";
import { reportRuntimeError } from "../../_lib/logger";
import { isClosedBetaEnvironment } from "../../_lib/runtimeConfig";
import { supabase } from "../../_lib/supabase";

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectTo?: string }>();
  const redirectTo = String(params.redirectTo ?? "").trim() || "/(tabs)";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Enter email and password");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        trackEvent("auth_sign_in_failure", {
          reason: error.message,
        });
        Alert.alert("Login Error", error.message);
        return;
      }

      trackEvent("auth_sign_in_success", {
        redirectTo,
      });
      router.replace(redirectTo as Parameters<typeof router.replace>[0]);
    } catch (error) {
      reportRuntimeError("auth-login", error, {
        redirectTo,
      });
      trackEvent("auth_sign_in_failure", {
        reason: "runtime_error",
      });
      Alert.alert("Login Error", "Unable to sign in right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isClosedBetaEnvironment() ? "Closed Beta Sign In" : "Sign In"}</Text>
      <Text style={styles.subtitle}>
        {isClosedBetaEnvironment()
          ? "Use the invited Chi'llywood account for room access, feedback capture, and rollout verification."
          : "Sign in to join rooms, manage your channel, unlock eligible access, and send support reports."}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
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

      <Pressable style={styles.button} onPress={signIn} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Signing in..." : "Log In"}</Text>
      </Pressable>

      <View style={styles.row}>
        <Text style={styles.muted}>No account?</Text>
        <Link href={{ pathname: "/(auth)/signup", params: { redirectTo } }} style={styles.link}>
          Sign up
        </Link>
      </View>
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
  row: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 16,
  },
  muted: { color: "#9aa0a6" },
  link: { color: "#DC143C", fontWeight: "700" },
});
