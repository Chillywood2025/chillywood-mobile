import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { LiveCameraEffectsControls } from "../../hooks/use-live-camera-effects";

export function LiveCameraControls({ controls, effectId, intensity, onSelect, onIntensity }: {
  controls: LiveCameraEffectsControls | null;
  effectId: string;
  intensity: number;
  onSelect: (id: string) => void;
  onIntensity: (value: number) => void;
}) {
  const options = [
    { id: "off", label: "Off", available: true },
    { id: "studio-light", label: "Studio Light", available: controls?.capabilities.studioLighting === true },
    { id: "chicago-skyline", label: "Chicago Skyline", available: controls?.capabilities.chicagoSkyline === true },
    { id: "crimson-aura", label: "Crimson Aura", available: controls?.capabilities.crimsonAura === true },
    { id: "neon-edge", label: "Neon Edge", available: controls?.capabilities.neonEdge === true },
    { id: "spotlight", label: "Spotlight", available: controls?.capabilities.spotlight === true },
  ];
  const status = controls?.state === "active" ? "Processing your outgoing camera"
    : controls?.state === "starting" ? "Finding your face or subject. Natural camera stays on while preparing."
      : controls?.reason ?? (effectId === "off" ? "Natural camera" : "Live effects require an active host or speaker camera in the new internal build.");
  return (
    <View style={styles.panel} testID="live-camera-controls">
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Switch between front and back cameras"
        accessibilityState={{ disabled: !controls?.canSwitchCamera || controls.switchingCamera, busy: controls?.switchingCamera ?? false }}
        testID="live-switch-camera"
        disabled={!controls?.canSwitchCamera || controls.switchingCamera}
        onPress={() => { void controls?.switchCamera(); }}
        style={[styles.button, !controls?.canSwitchCamera && styles.disabled]}
      >
        <Text style={styles.label}>{controls?.switchingCamera ? "Switching camera…" : "Switch Camera"}</Text>
      </TouchableOpacity>
      {controls?.cameraSwitchReason ? <Text accessibilityLiveRegion="polite" style={styles.detail}>{controls.cameraSwitchReason}</Text> : null}
      <View style={styles.row}>
        {options.map((option) => (
          <TouchableOpacity key={option.id} accessibilityRole="button"
            accessibilityLabel={option.label === "Off" ? "Turn off live camera effects" : option.label}
            accessibilityState={{ selected: effectId === option.id, disabled: !option.available }}
            testID={`live-camera-effect-${option.id}`} disabled={!option.available}
            style={[styles.button, effectId === option.id && styles.selected, !option.available && styles.disabled]}
            onPress={() => {
              // Off is immediate even before React commits the selection change.
              controls?.select(option.id, intensity);
              onSelect(option.id);
            }}>
            <Text style={styles.label}>{option.label}</Text>
            {!option.available ? <Text style={styles.detail}>Unavailable in this build</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
      {effectId !== "off" ? (
        <View style={styles.row} accessibilityLabel="Effect intensity">
          {[0.25, 0.5, 0.75, 1].map((value) => (
            <TouchableOpacity key={value} accessibilityRole="button"
              accessibilityLabel={`Effect intensity ${Math.round(value * 100)} percent`}
              accessibilityState={{ selected: intensity === value }}
              style={[styles.button, intensity === value && styles.selected]}
              onPress={() => { controls?.select(effectId, value); onIntensity(value); }}>
              <Text style={styles.label}>{Math.round(value * 100)}%</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <Text accessibilityLiveRegion="polite" style={styles.detail} testID="live-camera-effect-status">{status}</Text>
      <Text style={styles.detail}>
        Studio Light follows your face. Chicago Skyline uses person separation and layered 2.5D parallax, without measuring real-world depth. Crimson Aura adds a red silhouette glow; Neon Edge adds bright outlines; Spotlight moves slowly behind you. Camera processing stays on-device; viewers receive the result.
      </Text>
      <Text style={styles.detail}>If tracking is lost or processing slows, your natural camera returns. This is a visual effect, not a privacy background.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { borderRadius: 12, borderWidth: 1, borderColor: "#52627C", padding: 11, minHeight: 44, justifyContent: "center" },
  selected: { borderColor: "#A8C6FF", backgroundColor: "#223456" },
  disabled: { opacity: 0.5 },
  label: { color: "#F5F8FF", fontSize: 12, fontWeight: "700" },
  detail: { color: "#C6D0E2", fontSize: 11, lineHeight: 16 },
});
