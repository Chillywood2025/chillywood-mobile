import React, { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { getCommunicationRTCModule } from "../../_lib/communication";

type CommunicationPreviewCardProps = {
  displayName: string;
  avatarUrl?: string;
  tagline?: string;
  streamURL?: string;
  cameraEnabled: boolean;
  micEnabled: boolean;
  cameraPermissionState: "unknown" | "granted" | "denied" | "blocked";
  microphonePermissionState: "unknown" | "granted" | "denied" | "blocked";
};

const RTCView = getCommunicationRTCModule()?.RTCView as React.ComponentType<{
  streamURL: string;
  style?: object;
  objectFit?: "cover" | "contain";
  mirror?: boolean;
}> | undefined;

const getInitials = (value: string) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "?";
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  return normalized.slice(0, 2).toUpperCase();
};

const getPermissionLabel = (label: string, state: CommunicationPreviewCardProps["cameraPermissionState"]) => {
  if (state === "granted") return `${label} ready`;
  if (state === "blocked") return `${label} blocked`;
  if (state === "denied") return `${label} denied`;
  return `${label} pending`;
};

export function CommunicationPreviewCard({
  displayName,
  avatarUrl,
  tagline,
  streamURL,
  cameraEnabled,
  micEnabled,
  cameraPermissionState,
  microphonePermissionState,
}: CommunicationPreviewCardProps) {
  const showVideo = !!RTCView && !!streamURL && cameraEnabled;

  useEffect(() => {
    if (!__DEV__) return;
    console.error("[CH_CALL]", "local_preview_render", {
      displayName,
      streamReady: !!streamURL,
      showVideo,
      cameraEnabled,
      micEnabled,
      cameraPermissionState,
      microphonePermissionState,
    });
  }, [cameraEnabled, cameraPermissionState, displayName, micEnabled, microphonePermissionState, showVideo, streamURL]);

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>LOCAL PREVIEW</Text>
      <View style={styles.previewFrame}>
        {showVideo && RTCView ? (
          <RTCView streamURL={streamURL} style={styles.video} objectFit="cover" mirror />
        ) : (
          <View style={styles.fallbackFrame}>
            <View style={styles.avatarShell}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitial}>{getInitials(displayName)}</Text>
              )}
            </View>
            <Text style={styles.fallbackTitle}>{cameraEnabled ? "Camera preview not ready" : "Camera is off"}</Text>
            <Text style={styles.fallbackBody}>
              {cameraEnabled
                ? "Grant camera access or use a development build to show your live preview here."
                : "Turn camera on to send video when you join the room."}
            </Text>
          </View>
        )}
        <View style={styles.overlayRow}>
          <View style={[styles.badge, cameraEnabled ? styles.badgeOn : styles.badgeOff]}>
            <Text style={styles.badgeText}>{cameraEnabled ? "Camera On" : "Camera Off"}</Text>
          </View>
          <View style={[styles.badge, micEnabled ? styles.badgeOn : styles.badgeOff]}>
            <Text style={styles.badgeText}>{micEnabled ? "Mic On" : "Mic Muted"}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.name}>{displayName}</Text>
      {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
      <View style={styles.permissionRow}>
        <View style={styles.permissionPill}>
          <Text style={styles.permissionText}>{getPermissionLabel("Camera", cameraPermissionState)}</Text>
        </View>
        <View style={styles.permissionPill}>
          <Text style={styles.permissionText}>{getPermissionLabel("Mic", microphonePermissionState)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(13,14,20,0.96)",
    padding: 16,
    gap: 12,
  },
  kicker: {
    color: "#75809A",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  previewFrame: {
    position: "relative",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#090B10",
    minHeight: 238,
  },
  video: {
    width: "100%",
    height: 238,
    backgroundColor: "#050608",
  },
  fallbackFrame: {
    minHeight: 238,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    gap: 10,
    backgroundColor: "#090B10",
  },
  avatarShell: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 36,
  },
  avatarInitial: {
    color: "#EFF2FA",
    fontSize: 24,
    fontWeight: "900",
  },
  fallbackTitle: {
    color: "#F2F4FA",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  fallbackBody: {
    color: "#8E99B2",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  overlayRow: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  badgeOn: {
    borderColor: "rgba(70,214,135,0.32)",
    backgroundColor: "rgba(20,70,40,0.78)",
  },
  badgeOff: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(17,20,29,0.82)",
  },
  badgeText: {
    color: "#F4F7FF",
    fontSize: 11,
    fontWeight: "800",
  },
  name: {
    color: "#F3F5FA",
    fontSize: 20,
    fontWeight: "900",
  },
  tagline: {
    color: "#A1ACC2",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  permissionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  permissionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  permissionText: {
    color: "#BAC3D8",
    fontSize: 11,
    fontWeight: "800",
  },
});
