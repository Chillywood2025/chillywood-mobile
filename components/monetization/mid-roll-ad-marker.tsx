import React from "react";
import { StyleSheet, Text, View } from "react-native";

type MidRollAdMarkerProps = {
  visible: boolean;
};

export default function MidRollAdMarker({ visible }: MidRollAdMarkerProps) {
  if (!visible) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>Mid-roll Ad</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    right: 12,
    top: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(0,0,0,0.48)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
