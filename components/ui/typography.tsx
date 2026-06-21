import React from "react";
import {
  Platform,
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
  type TextProps,
  type TextStyle,
} from "react-native";

import { color, fontSize, fontWeight } from "./tokens";

type AppTextScale = "caption" | "footnote" | "subhead" | "body" | "title3" | "title2" | "title1" | "display";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const systemFontFamily = Platform.select({
  android: "sans-serif",
  ios: "System",
  default: "system-ui",
});

const scaleStyles: Record<AppTextScale, TextStyle> = {
  body: { fontSize: fontSize.lg, lineHeight: 20 },
  caption: { fontSize: fontSize.xs, lineHeight: 15 },
  display: { fontSize: 40, lineHeight: 46 },
  footnote: { fontSize: fontSize.sm, lineHeight: 17 },
  subhead: { fontSize: fontSize.md, lineHeight: 19 },
  title1: { fontSize: 28, lineHeight: 34 },
  title2: { fontSize: fontSize.icon, lineHeight: 30 },
  title3: { fontSize: fontSize.sectionTitle, lineHeight: 25 },
};

const weightStyles: Record<NonNullable<AppTextProps["weight"]>, TextStyle> = {
  "400": { fontWeight: "400" },
  "500": { fontWeight: "500" },
  "600": { fontWeight: "600" },
  "700": { fontWeight: fontWeight.strong },
  "800": { fontWeight: "800" },
  "900": { fontWeight: fontWeight.heavy },
};

export type AppTextProps = TextProps & {
  scale?: AppTextScale;
  weight?: "400" | "500" | "600" | "700" | "800" | "900";
};

export const AppText = ({
  allowFontScaling = true,
  children,
  maxFontSizeMultiplier = 1.35,
  minimumFontScale = 0.85,
  scale = "body",
  style,
  weight,
  ...props
}: AppTextProps) => {
  const { fontScale } = useWindowDimensions();
  const clampedFontScale = clamp(fontScale || 1, 0.85, 1.35);
  const baseScaleStyle = scaleStyles[scale];
  const dynamicLineHeight = baseScaleStyle.lineHeight
    ? Math.round(baseScaleStyle.lineHeight * clampedFontScale)
    : undefined;

  return (
    <NativeText
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      minimumFontScale={minimumFontScale}
      style={[
        styles.base,
        baseScaleStyle,
        dynamicLineHeight ? { lineHeight: dynamicLineHeight } : null,
        weight ? weightStyles[weight] : null,
        style,
      ]}
      {...props}
    >
      {children}
    </NativeText>
  );
};

const styles = StyleSheet.create({
  base: {
    color: color.textPrimary,
    fontFamily: systemFontFamily,
  },
});
