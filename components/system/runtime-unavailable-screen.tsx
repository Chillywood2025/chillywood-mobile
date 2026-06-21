import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function RuntimeUnavailableScreen({ message }: { message: string }) {
  return (
    <View style={styles.outer}>
      <View style={styles.card}>
        <Text style={styles.kicker}>RUNTIME CONFIG REQUIRED</Text>
        <Text style={styles.title}>Chi&apos;llywood is unavailable right now.</Text>
        <Text style={styles.body}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: "#05060A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(14,15,20,0.96)",
    padding: 22,
    gap: 12,
  },
  kicker: {
    color: "#7A859D",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: "#F3F6FB",
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    color: "#A6B0C6",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
});
