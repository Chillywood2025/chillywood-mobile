import React, { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const logCallDebug = (..._args: unknown[]) => {};

type CommunicationControlBarProps = {
  cameraEnabled: boolean;
  cameraStatus?: "off" | "connecting" | "on";
  micEnabled: boolean;
  disabled?: boolean;
  speakerEnabled?: boolean;
  minimumTouchTarget?: number;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onToggleAudioRoute?: () => void;
  onSwitchCamera?: () => void;
  onLeave: () => void;
  leaveLabel?: string;
  showMediaControls?: boolean;
};

export function CommunicationControlBar({
  cameraEnabled,
  cameraStatus,
  micEnabled,
  disabled = false,
  speakerEnabled = false,
  minimumTouchTarget = 48,
  onToggleCamera,
  onToggleMic,
  onToggleAudioRoute,
  onSwitchCamera,
  onLeave,
  leaveLabel = "Leave",
  showMediaControls = true,
}: CommunicationControlBarProps) {
  useEffect(() => {
    if (!__DEV__) return;
    logCallDebug("[CH_CALL]", "control_bar_render", {
      cameraEnabled,
      cameraStatus,
      micEnabled,
      leaveLabel,
      minimumTouchTarget,
    });
  }, [cameraEnabled, cameraStatus, leaveLabel, micEnabled, minimumTouchTarget]);

  const resolvedCameraStatus = cameraStatus ?? (cameraEnabled ? "on" : "off");
  const cameraLabel = resolvedCameraStatus === "connecting"
    ? "Camera Connecting"
    : resolvedCameraStatus === "on"
      ? "Camera On"
      : "Camera Off";

  return (
    <View style={styles.row}>
      {showMediaControls ? (
        <TouchableOpacity
          style={[
            styles.control,
            { minHeight: minimumTouchTarget },
            resolvedCameraStatus === "on" ? styles.controlOn : resolvedCameraStatus === "connecting" ? styles.controlPending : styles.controlOff,
            disabled && styles.controlDisabled,
          ]}
          activeOpacity={0.86}
          disabled={disabled}
          onPress={() => {
            if (__DEV__) {
              logCallDebug("[CH_CALL]", "toggle_camera_pressed", {
                nextCameraEnabled: !cameraEnabled,
              });
            }
            onToggleCamera();
          }}
        >
          <Text style={styles.controlLabel}>{cameraLabel}</Text>
        </TouchableOpacity>
      ) : null}
      {showMediaControls && cameraEnabled && onSwitchCamera ? (
        <TouchableOpacity
          accessibilityLabel="Switch between front and rear camera"
          style={[styles.control, { minHeight: minimumTouchTarget }, styles.controlOff, disabled && styles.controlDisabled]}
          activeOpacity={0.86}
          onPress={onSwitchCamera}
          disabled={disabled}
        >
          <Text style={styles.controlLabel}>Flip Camera</Text>
        </TouchableOpacity>
      ) : null}
      {showMediaControls ? (
        <TouchableOpacity
          style={[styles.control, { minHeight: minimumTouchTarget }, micEnabled ? styles.controlOn : styles.controlOff, disabled && styles.controlDisabled]}
          activeOpacity={0.86}
          disabled={disabled}
          onPress={() => {
            if (__DEV__) {
              logCallDebug("[CH_CALL]", "toggle_mic_pressed", {
                nextMicEnabled: !micEnabled,
              });
            }
            onToggleMic();
          }}
        >
          <Text style={styles.controlLabel}>{micEnabled ? "Mic On" : "Mic Muted"}</Text>
        </TouchableOpacity>
      ) : null}
      {showMediaControls && onToggleAudioRoute ? (
        <TouchableOpacity
          accessibilityLabel={speakerEnabled ? "Use phone receiver" : "Use speaker"}
          style={[styles.control, { minHeight: minimumTouchTarget }, speakerEnabled ? styles.controlOn : styles.controlOff, disabled && styles.controlDisabled]}
          activeOpacity={0.86}
          onPress={onToggleAudioRoute}
          disabled={disabled}
        >
          <Text style={styles.controlLabel}>{speakerEnabled ? "Speaker On" : "Receiver"}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        accessibilityLabel={leaveLabel}
        style={[styles.control, { minHeight: minimumTouchTarget }, styles.controlLeave]}
        activeOpacity={0.86}
        onPress={() => {
          if (__DEV__) {
            logCallDebug("[CH_CALL]", "leave_pressed", {
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
  controlPending: {
    borderColor: "rgba(255,211,107,0.28)",
    backgroundColor: "rgba(72,53,19,0.92)",
  },
  controlLeave: {
    borderColor: "rgba(220,20,60,0.36)",
    backgroundColor: "rgba(76,18,29,0.94)",
  },
  controlDisabled: {
    opacity: 0.58,
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
