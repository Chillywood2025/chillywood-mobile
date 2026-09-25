import React from "react";
import { StyleSheet, Text } from "react-native";
import { ChillywoodBrandedSurface, ChillywoodGlassPanel } from "../ui/chillywood-branded-surface";

export function RuntimeUnavailableScreen({ message }: { message: string }) {
  return (
    <ChillywoodBrandedSurface style={styles.outer} variant="app">
      <ChillywoodGlassPanel style={styles.card}>
        <Text style={styles.kicker}>RUNTIME CONFIG REQUIRED</Text>
        <Text style={styles.title}>Chi&apos;llywood is unavailable right now.</Text>
        <Text style={styles.body}>
          {message}
        </Text>
      </ChillywoodGlassPanel>
    </ChillywoodBrandedSurface>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 24,
    borderWidth: 1,
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
