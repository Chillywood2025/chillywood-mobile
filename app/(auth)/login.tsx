import { Link, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
  ImageBackground,
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
import { trackEvent } from "../../_lib/analytics";
import { reportRuntimeError } from "../../_lib/logger";
import { isClosedBetaEnvironment } from "../../_lib/runtimeConfig";
import { supabase } from "../../_lib/supabase";

const LOGIN_BACKGROUND_SOURCE = require("../../assets/images/chicago-skyline.jpg");

export default function Login() {
  const params = useLocalSearchParams<{ redirectTo?: string }>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const redirectTo = String(params.redirectTo ?? "").trim() || "/";
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
    <ImageBackground source={LOGIN_BACKGROUND_SOURCE} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} />

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
              paddingBottom: Math.max(insets.bottom + 96, 120),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.card}>
            <Text style={styles.kicker}>CHI&apos;LLYWOOD</Text>
            <Text style={styles.title}>{isClosedBetaEnvironment() ? "Closed Beta Sign In" : "Sign In"}</Text>
            <Text style={styles.subtitle}>
              {isClosedBetaEnvironment()
                ? "Use the invited Chi'llywood account for room access, feedback capture, and rollout verification."
                : "Sign in to join rooms, manage your channel, unlock eligible access, and send support reports."}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#7A859A"
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              returnKeyType="next"
              value={email}
              onChangeText={setEmail}
              onFocus={() => {
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
              }}
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#7A859A"
              secureTextEntry
              returnKeyType="done"
              value={password}
              onChangeText={setPassword}
              onFocus={() => {
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
              }}
              onSubmitEditing={() => {
                void signIn();
              }}
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,10,16,0.74)",
  },
  keyboardShell: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,13,19,0.94)",
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
    lineHeight: 20,
    fontWeight: "600",
    marginBottom: 20,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    color: "white",
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  button: {
    backgroundColor: "#DC143C",
    padding: 16,
    borderRadius: 14,
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
    marginTop: 18,
  },
  muted: { color: "#9aa0a6" },
  link: { color: "#DC143C", fontWeight: "700" },
});
