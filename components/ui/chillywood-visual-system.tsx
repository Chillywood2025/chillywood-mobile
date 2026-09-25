import React, { useId } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export const CHILLYWOOD_PRIMARY_GRADIENT = Object.freeze({
  direction: Object.freeze({ x1: "0", x2: "1", y1: "0", y2: "0" }),
  stops: Object.freeze([
    Object.freeze({ offset: "0", color: "#7300D8" }),
    Object.freeze({ offset: "0.54", color: "#321CFF" }),
    Object.freeze({ offset: "1", color: "#00A8FF" }),
  ]),
});

export const CHILLYWOOD_VISUAL = Object.freeze({
  accentBlue: "#00A8FF",
  accentCrimson: "#F34B74",
  accentPurple: "#6E21FF",
  background: "#06070B",
  controlBackground: "rgba(17,15,42,0.76)",
  controlBorder: "rgba(102,61,190,0.72)",
  glassBackground: "rgba(7,5,27,0.91)",
  glassBorder: "rgba(132,40,255,0.88)",
  primaryBorder: "rgba(91,214,255,0.72)",
  primaryGlow: "#241DFF",
  textMuted: "#B7B3C7",
  textPrimary: "#FFFFFF",
});

export function ChillywoodPrimaryActionFill({
  opacity = 1,
  radius = 16,
}: {
  opacity?: number;
  radius?: number;
}) {
  const gradientId = `chillywood-primary-${useId().replace(/[^a-zA-Z0-9_-]/gu, "")}`;

  return (
    <Svg height="100%" opacity={opacity} pointerEvents="none" style={StyleSheet.absoluteFill} width="100%">
      <Defs>
        <LinearGradient id={gradientId} {...CHILLYWOOD_PRIMARY_GRADIENT.direction}>
          {CHILLYWOOD_PRIMARY_GRADIENT.stops.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${gradientId})`} height="100%" rx={radius} ry={radius} width="100%" />
    </Svg>
  );
}

export function ChillywoodPanel({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return <View style={[styles.panel, style]} testID={testID}>{children}</View>;
}

export function ChillywoodInputFrame({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.inputFrame, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  inputFrame: {
    minHeight: 58,
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
    paddingHorizontal: 16,
  },
  panel: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.glassBorder,
    backgroundColor: CHILLYWOOD_VISUAL.glassBackground,
    shadowColor: CHILLYWOOD_VISUAL.primaryGlow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 12,
  },
});
