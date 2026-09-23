import React from "react";
import {
  ImageBackground,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
const CHICAGO_NIGHT_SOURCE = require("../../assets/images/chicago-skyline.jpg");
export const CHILLYWOOD_VISUAL = Object.freeze({
  accentBlue: "#00A8FF",
  accentCrimson: "#F34B74",
  accentPurple: "#6E21FF",
  controlBackground: "rgba(17,15,42,0.76)",
  controlBorder: "rgba(102,61,190,0.72)",
  glassBackground: "rgba(7,5,27,0.91)",
  glassBorder: "rgba(132,40,255,0.88)",
  textMuted: "#B7B3C7",
  textPrimary: "#FFFFFF",
});
type SurfaceVariant = "auth" | "chat" | "legal";
export function ChillywoodBrandedSurface({
  accessibilityLabel,
  children,
  style,
  testID,
  variant = "auth",
}: {
  accessibilityLabel?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: SurfaceVariant;
}) {
  return (
    <ImageBackground
      accessibilityLabel={accessibilityLabel}
      resizeMode="cover"
      source={CHICAGO_NIGHT_SOURCE}
      style={[styles.surface, style]}
      testID={testID}
    >
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.overlay,
          variant === "chat" && styles.chatOverlay,
          variant === "legal" && styles.legalOverlay,
        ]}
      />
      <View pointerEvents="none" style={styles.purpleAtmosphere} />
      <View pointerEvents="none" style={styles.blueAtmosphere} />
      {children}
    </ImageBackground>
  );
}
export function ChillywoodBrandReserve({
  compact = false,
  testID,
}: {
  compact?: boolean;
  testID: string;
}) {
  const { height } = useWindowDimensions();
  const minHeight = compact
    ? Math.max(118, Math.min(height * 0.2, 190))
    : Math.max(170, Math.min(height * 0.28, 280));
  return (
    <View
      accessibilityLabel="Chi'llywood. Stream the City."
      accessibilityRole="header"
      style={[styles.brandReserve, { minHeight }]}
      testID={testID}
    />
  );
}
export function ChillywoodGlassPanel({
  children,
  style,
  testID,
  variant = "auth",
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: "auth" | "legal";
}) {
  return (
    <View
      style={[styles.glassPanel, variant === "legal" && styles.legalPanel, style]}
      testID={testID}
    >
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  surface: {
    flex: 1,
    backgroundColor: "#06070B",
  },
  overlay: {
    backgroundColor: "rgba(4,4,20,0.48)",
  },
  chatOverlay: {
    backgroundColor: "rgba(4,5,18,0.76)",
  },
  legalOverlay: {
    backgroundColor: "rgba(4,4,20,0.66)",
  },
  purpleAtmosphere: {
    position: "absolute",
    top: -120,
    right: -110,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(110,33,255,0.13)",
  },
  blueAtmosphere: {
    position: "absolute",
    bottom: -130,
    left: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(0,168,255,0.09)",
  },
  brandReserve: {
    width: "100%",
  },
  glassPanel: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 560,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.glassBorder,
    backgroundColor: CHILLYWOOD_VISUAL.glassBackground,
    paddingHorizontal: 24,
    paddingVertical: 28,
    shadowColor: "#5B1DFF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 18,
  },
  legalPanel: {
    maxWidth: 520,
    borderColor: "rgba(132,40,255,0.72)",
    backgroundColor: "rgba(7,5,27,0.94)",
  },
});
