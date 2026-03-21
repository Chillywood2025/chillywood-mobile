import React from "react";
import { StyleSheet, Text, View } from "react-native";

type AdBannerPlaceholderProps = {
  label?: string;
};

export default function AdBannerPlaceholder({ label = "Sponsored" }: AdBannerPlaceholderProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>{label.toUpperCase()}</Text>
      <Text style={styles.title}>Ad Placeholder</Text>
      <Text style={styles.sub}>Banner slot ready for ad network integration</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  kicker: {
    color: "#888",
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "800",
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  sub: {
    color: "#999",
    fontSize: 11,
  },
});
