import React, { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type CommunicationControlBarProps = {
  cameraEnabled: boolean;
  micEnabled: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onLeave: () => void;
  leaveLabel?: string;
};

export function CommunicationControlBar({
  cameraEnabled,
  micEnabled,
  onToggleCamera,
  onToggleMic,
  onLeave,
  leaveLabel = "Leave",
}: CommunicationControlBarProps) {
  useEffect(() => {
    if (!__DEV__) return;
    console.log("[CH_CALL]", "control_bar_render", {
      cameraEnabled,
      micEnabled,
      leaveLabel,
    });
  }, [cameraEnabled, leaveLabel, micEnabled]);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.control, cameraEnabled ? styles.controlOn : styles.controlOff]}
        activeOpacity={0.86}
        onPress={() => {
          if (__DEV__) {
            console.error("[CH_CALL]", "toggle_camera_pressed", {
              nextCameraEnabled: !cameraEnabled,
            });
          }
          onToggleCamera();
        }}
      >
        <Text style={styles.controlLabel}>{cameraEnabled ? "Camera On" : "Camera Off"}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.control, micEnabled ? styles.controlOn : styles.controlOff]}
        activeOpacity={0.86}
        onPress={() => {
          if (__DEV__) {
            console.error("[CH_CALL]", "toggle_mic_pressed", {
              nextMicEnabled: !micEnabled,
            });
          }
          onToggleMic();
        }}
      >
        <Text style={styles.controlLabel}>{micEnabled ? "Mic On" : "Mic Muted"}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.control, styles.controlLeave]}
        activeOpacity={0.86}
        onPress={() => {
          if (__DEV__) {
            console.error("[CH_CALL]", "leave_pressed", {
              leaveLabel,
            });
          }
          onLeave();
        }}
      >
        <Text style={[styles.controlLabel, styles.controlLeaveLabel]}>{leaveLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
  },
  control: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  controlOn: {
    borderColor: "rgba(70,214,135,0.3)",
    backgroundColor: "rgba(23,71,43,0.92)",
  },
  controlOff: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,21,29,0.94)",
  },
  controlLeave: {
    borderColor: "rgba(220,20,60,0.36)",
    backgroundColor: "rgba(76,18,29,0.94)",
  },
  controlLabel: {
    color: "#F2F5FB",
    fontSize: 12.5,
    fontWeight: "900",
  },
  controlLeaveLabel: {
    color: "#FFD8DF",
  },
});
