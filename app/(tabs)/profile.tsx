import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "../../_lib/session";

export default function ProfileTabScreen() {
  const { isLoading, user } = useSession();
  const userId = String(user?.id ?? "").trim();
  const openedRef = useRef(false);

  useEffect(() => {
    openedRef.current = false;
  }, [userId]);

  const openProfile = useCallback(() => {
    if (!userId) {
      router.push("/(auth)/login");
      return;
    }

    router.push({ pathname: "/profile/[userId]", params: { userId, self: "1" } });
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (isLoading) return;
      if (openedRef.current) return;
      openedRef.current = true;
      openProfile();
    }, [isLoading, openProfile]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        {isLoading ? <ActivityIndicator color="#E50914" /> : null}
        <Text style={styles.title}>{isLoading ? "Opening Profile" : "Profile"}</Text>
        <Text style={styles.body}>
          Profile is your social identity. Platform and Platform Studio stay separate creator surfaces.
        </Text>
        {!isLoading ? (
          <Pressable style={styles.button} onPress={openProfile} accessibilityRole="button" accessibilityLabel="Open Profile">
            <Text style={styles.buttonText}>Open Profile</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#050505",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    gap: 10,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    color: "#BAC3D4",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    textAlign: "center",
  },
  button: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
});
