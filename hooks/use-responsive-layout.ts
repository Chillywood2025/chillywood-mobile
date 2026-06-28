import { PixelRatio, Platform, useWindowDimensions, type DimensionValue } from "react-native";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";

export type DeviceClass =
  | "compactPhone"
  | "regularPhone"
  | "tallPhone"
  | "largePhone"
  | "tablet"
  | "foldableOrExpanded"
  | "landscape";

type ResponsiveLayoutInput = {
  width: number;
  height: number;
  fontScale?: number;
  insets: EdgeInsets;
  platform?: typeof Platform.OS;
};

export type ResponsiveLayout = {
  deviceClass: DeviceClass;
  isLandscape: boolean;
  isCompactPhone: boolean;
  isTablet: boolean;
  isExpanded: boolean;
  width: number;
  height: number;
  shortestSide: number;
  longestSide: number;
  fontScale: number;
  clampedFontScale: number;
  safeTopPadding: number;
  safeBottomPadding: number;
  contentMaxWidth: number;
  contentHorizontalPadding: number;
  bottomControlSpacing: number;
  minimumTouchTarget: number;
  videoTileGap: number;
  videoTileMinHeight: number;
  compactVideoTileMinHeight: number;
  metadataBadgeMaxWidth: DimensionValue;
  metadataBadgePaddingHorizontal: number;
  metadataBadgePaddingVertical: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const getDeviceClass = ({ width, height }: Pick<ResponsiveLayoutInput, "width" | "height">): DeviceClass => {
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);
  const isLandscape = width > height;
  if (isLandscape) return "landscape";
  if (shortestSide >= 768) return "tablet";
  if (shortestSide >= 600 || width >= 540) return "foldableOrExpanded";
  if (width >= 430) return "largePhone";
  if (height / Math.max(width, 1) >= 2.05 && height >= 780) return "tallPhone";
  if (width <= 360 || longestSide <= 700) return "compactPhone";
  return "regularPhone";
};

export const responsiveSpacing = (layout: Pick<ResponsiveLayout, "deviceClass">, compact: number, regular: number, expanded: number) => {
  if (layout.deviceClass === "compactPhone") return compact;
  if (layout.deviceClass === "tablet" || layout.deviceClass === "foldableOrExpanded" || layout.deviceClass === "landscape") return expanded;
  return regular;
};

export const responsiveFontSize = (baseSize: number, fontScale: number, minMultiplier = 0.9, maxMultiplier = 1.2) => {
  const multiplier = clamp(fontScale || 1, minMultiplier, maxMultiplier);
  return Math.round(baseSize * multiplier);
};

export const getSafeBottomControlPadding = (insets: EdgeInsets, platform: typeof Platform.OS = Platform.OS) => {
  const platformMinimum = platform === "ios" ? 18 : 14;
  return Math.max(insets.bottom + 10, platformMinimum);
};

export const getContentBottomPadding = (insets: EdgeInsets, controlHeight = 64, platform: typeof Platform.OS = Platform.OS) => (
  controlHeight + getSafeBottomControlPadding(insets, platform) + 12
);

export const responsiveTileHeight = (layout: Pick<ResponsiveLayout, "deviceClass" | "height" | "safeTopPadding" | "safeBottomPadding">) => {
  if (layout.deviceClass === "compactPhone") return 150;
  if (layout.deviceClass === "tallPhone") return 190;
  if (layout.deviceClass === "largePhone") return 205;
  if (layout.deviceClass === "tablet" || layout.deviceClass === "foldableOrExpanded" || layout.deviceClass === "landscape") return 220;
  return 176;
};

export const createResponsiveLayout = ({
  width,
  height,
  fontScale,
  insets,
  platform = Platform.OS,
}: ResponsiveLayoutInput): ResponsiveLayout => {
  const deviceClass = getDeviceClass({ width, height });
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);
  const isLandscape = width > height;
  const isTablet = deviceClass === "tablet";
  const isExpanded = deviceClass === "tablet" || deviceClass === "foldableOrExpanded" || deviceClass === "landscape";
  const isCompactPhone = deviceClass === "compactPhone";
  const resolvedFontScale = fontScale || PixelRatio.getFontScale() || 1;
  const clampedFontScale = clamp(resolvedFontScale, 0.9, isCompactPhone ? 1.12 : 1.2);
  const safeBottomPadding = getSafeBottomControlPadding(insets, platform);
  const safeTopPadding = Math.max(insets.top + responsiveSpacing({ deviceClass }, 8, 10, 14), 10);
  const contentHorizontalPadding = responsiveSpacing({ deviceClass }, 12, 16, 22);
  const contentMaxWidth = isTablet ? 760 : isExpanded ? 680 : width;
  const minimumTouchTarget = platform === "ios" ? 44 : 48;
  const videoTileGap = responsiveSpacing({ deviceClass }, 8, 10, 14);
  const videoTileMinHeight = responsiveTileHeight({ deviceClass, height, safeTopPadding, safeBottomPadding });

  return {
    deviceClass,
    isLandscape,
    isCompactPhone,
    isTablet,
    isExpanded,
    width,
    height,
    shortestSide,
    longestSide,
    fontScale: resolvedFontScale,
    clampedFontScale,
    safeTopPadding,
    safeBottomPadding,
    contentMaxWidth,
    contentHorizontalPadding,
    bottomControlSpacing: responsiveSpacing({ deviceClass }, 6, 8, 10),
    minimumTouchTarget,
    videoTileGap,
    videoTileMinHeight,
    compactVideoTileMinHeight: Math.max(112, Math.round(videoTileMinHeight * 0.72)),
    metadataBadgeMaxWidth: isCompactPhone ? "72%" : "66%",
    metadataBadgePaddingHorizontal: responsiveSpacing({ deviceClass }, 8, 9, 10),
    metadataBadgePaddingVertical: responsiveSpacing({ deviceClass }, 6, 7, 8),
  };
};

export function useResponsiveLayout(): ResponsiveLayout {
  const dimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return createResponsiveLayout({
    width: dimensions.width,
    height: dimensions.height,
    fontScale: dimensions.fontScale,
    insets,
  });
}
