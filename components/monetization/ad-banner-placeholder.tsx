import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

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
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  kicker: {
    color: CHILLYWOOD_VISUAL.accentBlue,
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
    color: CHILLYWOOD_VISUAL.textMuted,
    fontSize: 11,
  },
});
