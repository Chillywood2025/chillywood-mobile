import React from "react";
import { StyleSheet, Text, View } from "react-native";

export const ACCESS_DISCLOSURE_COPY = {
  captureBestEffort: "Capture protection is best-effort on supported devices.",
  futureAccessControls: "Locked access, subscriber entry, and Party Pass options vary by session and are not active purchase flows here.",
  noUniversalBlocking: "Screen capture blocking is not guaranteed on every device.",
  creatorHostPermissions: "Creator and host recording controls are still limited.",
  stagePermissions: "Recording permission and host controls are still limited.",
} as const;

export function getProtectedSessionCopy(
  variant: "watch-player" | "live-player" | "live-stage" | "live-room" | "party-room",
): { title: string; body: string } {
  switch (variant) {
    case "live-player":
      return {
        title: "Protected Live Watch Session",
        body: `${ACCESS_DISCLOSURE_COPY.captureBestEffort} ${ACCESS_DISCLOSURE_COPY.creatorHostPermissions} ${ACCESS_DISCLOSURE_COPY.noUniversalBlocking}`,
      };
    case "live-stage":
      return {
        title: "Protected Live Session",
        body: `${ACCESS_DISCLOSURE_COPY.captureBestEffort} ${ACCESS_DISCLOSURE_COPY.stagePermissions} ${ACCESS_DISCLOSURE_COPY.noUniversalBlocking}`,
      };
    case "live-room":
      return {
        title: "Protected Live Room",
        body: `${ACCESS_DISCLOSURE_COPY.futureAccessControls} ${ACCESS_DISCLOSURE_COPY.captureBestEffort} ${ACCESS_DISCLOSURE_COPY.noUniversalBlocking}`,
      };
    case "party-room":
      return {
        title: "Protected Party Room",
        body: `${ACCESS_DISCLOSURE_COPY.futureAccessControls} ${ACCESS_DISCLOSURE_COPY.captureBestEffort} ${ACCESS_DISCLOSURE_COPY.noUniversalBlocking}`,
      };
    case "watch-player":
    default:
      return {
        title: "Protected Watch Session",
        body: `${ACCESS_DISCLOSURE_COPY.captureBestEffort} ${ACCESS_DISCLOSURE_COPY.creatorHostPermissions} ${ACCESS_DISCLOSURE_COPY.noUniversalBlocking}`,
      };
  }
}

export function ProtectedSessionNote({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(16,16,20,0.76)",
  },
  kicker: {
    color: "#D9DFEE",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  body: {
    color: "#AAB3C7",
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 6,
    fontWeight: "600",
  },
});
