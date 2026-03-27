import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  normalizeCapturePolicy,
  normalizeContentAccessRule,
  type CapturePolicy,
  type ContentAccessRule,
} from "../../_lib/roomRules";

export const ACCESS_DISCLOSURE_COPY = {
  captureBestEffort: "Capture protection is best-effort on supported devices.",
  futureAccessControls: "Premium and Party Pass rules can apply to eligible rooms and titles, with entitlement handled in-context only when the session requires it.",
  noUniversalBlocking: "Screen capture blocking is not guaranteed across every device, OS version, or external display path.",
  creatorHostPermissions: "Host and creator capture rules are reflected in room policy, but they are not DRM or universal device enforcement.",
  stagePermissions: "Live-stage capture rules are reflected in room policy, but they remain best-effort rather than guaranteed device blocking.",
  hostManagedCapture: "Host-managed capture policy is active for this session, while device-level blocking still remains best-effort.",
} as const;

type ProtectedSessionOptions = {
  contentAccessRule?: ContentAccessRule | string | null;
  capturePolicy?: CapturePolicy | string | null;
};

const buildPolicyPrefix = (options?: ProtectedSessionOptions) => {
  const contentAccessRule = normalizeContentAccessRule(options?.contentAccessRule);
  if (contentAccessRule === "party_pass" || contentAccessRule === "premium") {
    return ACCESS_DISCLOSURE_COPY.futureAccessControls;
  }
  return "";
};

const buildCaptureCopy = (variant: "watch-player" | "live-player" | "live-stage" | "live-room" | "party-room", options?: ProtectedSessionOptions) => {
  const capturePolicy = normalizeCapturePolicy(options?.capturePolicy);
  if (capturePolicy === "host_managed") {
    return ACCESS_DISCLOSURE_COPY.hostManagedCapture;
  }

  if (variant === "live-stage") return ACCESS_DISCLOSURE_COPY.stagePermissions;
  return variant === "live-player" || variant === "watch-player"
    ? ACCESS_DISCLOSURE_COPY.creatorHostPermissions
    : ACCESS_DISCLOSURE_COPY.captureBestEffort;
};

export function getProtectedSessionCopy(
  variant: "watch-player" | "live-player" | "live-stage" | "live-room" | "party-room",
  options?: ProtectedSessionOptions,
): { title: string; body: string } {
  const prefix = buildPolicyPrefix(options);
  const captureCopy = buildCaptureCopy(variant, options);
  const baseCaptureCopy = normalizeCapturePolicy(options?.capturePolicy) === "host_managed"
    ? ACCESS_DISCLOSURE_COPY.hostManagedCapture
    : ACCESS_DISCLOSURE_COPY.captureBestEffort;

  switch (variant) {
    case "live-player":
      return {
        title: "Protected Live Watch Session",
        body: `${[prefix, baseCaptureCopy, captureCopy, ACCESS_DISCLOSURE_COPY.noUniversalBlocking].filter(Boolean).join(" ")}`,
      };
    case "live-stage":
      return {
        title: "Protected Live Session",
        body: `${[prefix, baseCaptureCopy, captureCopy, ACCESS_DISCLOSURE_COPY.noUniversalBlocking].filter(Boolean).join(" ")}`,
      };
    case "live-room":
      return {
        title: "Protected Live Room",
        body: `${[prefix || ACCESS_DISCLOSURE_COPY.futureAccessControls, baseCaptureCopy, ACCESS_DISCLOSURE_COPY.noUniversalBlocking].filter(Boolean).join(" ")}`,
      };
    case "party-room":
      return {
        title: "Protected Party Room",
        body: `${[prefix || ACCESS_DISCLOSURE_COPY.futureAccessControls, baseCaptureCopy, ACCESS_DISCLOSURE_COPY.noUniversalBlocking].filter(Boolean).join(" ")}`,
      };
    case "watch-player":
    default:
      return {
        title: "Protected Watch Session",
        body: `${[prefix, baseCaptureCopy, captureCopy, ACCESS_DISCLOSURE_COPY.noUniversalBlocking].filter(Boolean).join(" ")}`,
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
