import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { color, fontSize, fontWeight, motion, radius, spacing } from "./tokens";
import { AppText } from "./typography";

type AppTone = "default" | "accent" | "success" | "warning" | "danger" | "muted" | "premium";

const toneStyles: Record<AppTone, { backgroundColor: string; borderColor: string; color: string }> = {
  accent: { backgroundColor: color.accentSurface, borderColor: color.borderPrimarySoft, color: color.textAccent },
  danger: { backgroundColor: color.dangerSurface, borderColor: color.dangerBorder, color: color.textDanger },
  default: { backgroundColor: color.accentBlueSurfaceStrong, borderColor: color.borderBlueMuted, color: color.textLavender },
  muted: { backgroundColor: color.surfaceMuted, borderColor: color.borderStrong, color: color.textMuted },
  premium: { backgroundColor: color.premiumSurface, borderColor: color.premiumBorder, color: color.textPremium },
  success: { backgroundColor: color.successSurface, borderColor: color.successBorder, color: color.textSuccess },
  warning: { backgroundColor: color.warningSurface, borderColor: color.warningBorder, color: color.textWarning },
};

export const AppStatusPill = ({ label, tone = "default" }: { label: string; tone?: AppTone }) => {
  const toneStyle = toneStyles[tone];
  return (
    <View style={[styles.statusPill, { backgroundColor: toneStyle.backgroundColor, borderColor: toneStyle.borderColor }]}>
      <AppText scale="caption" weight="900" style={[styles.statusPillText, { color: toneStyle.color }]}>{label}</AppText>
    </View>
  );
};

export const AppActionButton = ({
  accessibilityLabel,
  disabled = false,
  label,
  loading = false,
  onPress,
  style,
  testID,
  variant = "secondary",
}: {
  accessibilityLabel?: string;
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
}) => (
  <TouchableOpacity
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityRole="button"
    accessibilityState={{ disabled: disabled || loading, busy: loading }}
    activeOpacity={motion.activeOpacity}
    disabled={disabled || loading}
    hitSlop={motion.hitSlop}
    onPress={onPress}
    testID={testID}
    style={[
      styles.actionButton,
      variant === "primary" && styles.actionButtonPrimary,
      variant === "danger" && styles.actionButtonDanger,
      variant === "success" && styles.actionButtonSuccess,
      variant === "ghost" && styles.actionButtonGhost,
      (disabled || loading) && styles.actionButtonDisabled,
      style,
    ]}
  >
    {loading ? <ActivityIndicator color={color.textOnPrimary} size="small" /> : <AppText scale="body" weight="900" style={styles.actionButtonText}>{label}</AppText>}
  </TouchableOpacity>
);

export const AppSection = ({
  action,
  children,
  collapsible = false,
  defaultExpanded = true,
  statusLabel,
  statusTone = "default",
  subtitle,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  statusLabel?: string;
  statusTone?: AppTone;
  subtitle?: string;
  title: string;
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = useCallback(() => {
    if (collapsible) setExpanded((value) => !value);
  }, [collapsible]);

  const header = (
    <View style={styles.sectionHeader}>
      {collapsible ? (
        <View style={styles.chevronBox}>
          <AppText scale="title2" weight="900" style={styles.chevronText}>{expanded ? "v" : ">"}</AppText>
        </View>
      ) : null}
      <View style={styles.sectionCopy}>
        <AppText scale="title3" weight="900" style={styles.sectionTitle}>{title}</AppText>
        {subtitle ? <AppText scale="subhead" weight="700" style={styles.sectionSubtitle}>{subtitle}</AppText> : null}
      </View>
      {statusLabel ? <AppStatusPill label={statusLabel} tone={statusTone} /> : null}
      {action}
    </View>
  );

  return (
    <View style={styles.section}>
      {collapsible ? (
        <TouchableOpacity
          accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title}`}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          activeOpacity={motion.activeOpacity}
          onPress={toggle}
          style={styles.sectionHeaderPressable}
        >
          {header}
        </TouchableOpacity>
      ) : header}
      {expanded ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
};

export const AppEmptyState = ({
  actionLabel,
  body,
  onAction,
  title,
}: {
  actionLabel?: string;
  body: string;
  onAction?: () => void;
  title: string;
}) => (
  <View style={styles.emptyState}>
    <AppText scale="title2" weight="900" style={styles.emptyTitle}>{title}</AppText>
    <AppText scale="subhead" weight="700" style={styles.emptyBody}>{body}</AppText>
    {actionLabel && onAction ? <AppActionButton label={actionLabel} onPress={onAction} variant="ghost" /> : null}
  </View>
);

export const AppQuickLinkCard = ({
  body,
  disabled = false,
  onPress,
  statusLabel,
  statusTone = "default",
  title,
}: {
  body: string;
  disabled?: boolean;
  onPress?: () => void;
  statusLabel?: string;
  statusTone?: AppTone;
  title: string;
}) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    activeOpacity={motion.activeOpacity}
    disabled={disabled}
    hitSlop={motion.hitSlop}
    onPress={onPress}
    style={[styles.quickLinkCard, disabled && styles.actionButtonDisabled]}
  >
    <View style={styles.quickLinkCopy}>
      <View style={styles.quickLinkTitleRow}>
        <AppText scale="title2" weight="900" style={styles.quickLinkTitle}>{title}</AppText>
        {statusLabel ? <AppStatusPill label={statusLabel} tone={statusTone} /> : null}
      </View>
      <AppText scale="subhead" weight="700" style={styles.quickLinkBody}>{body}</AppText>
    </View>
    <AppText scale="title2" weight="900" style={styles.quickLinkArrow}>{">"}</AppText>
  </TouchableOpacity>
);

export const AppStickyActionBar = ({ children, helper }: { children: React.ReactNode; helper?: string }) => (
  <View style={styles.stickyActionBar}>
    {helper ? <AppText scale="footnote" weight="700" style={styles.stickyHelper}>{helper}</AppText> : null}
    <View style={styles.stickyActionRow}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  actionButton: {
    minHeight: spacing.controlMinHeight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surfaceSubtle,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonDanger: {
    borderColor: color.dangerBorderStrong,
    backgroundColor: color.dangerSurfaceStrong,
  },
  actionButtonDisabled: {
    opacity: motion.disabledOpacity,
  },
  actionButtonGhost: {
    backgroundColor: color.accentBlueSurface,
    borderColor: color.borderBlue,
  },
  actionButtonPrimary: {
    backgroundColor: color.primary,
    borderColor: color.borderDefault,
  },
  actionButtonSuccess: {
    backgroundColor: color.successSurfaceStrong,
    borderColor: color.successBorderStrong,
  },
  actionButtonText: {
    color: color.textOnPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.heavy,
  },
  chevronBox: {
    width: spacing.controlMinHeight,
    height: spacing.controlMinHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderMuted,
    backgroundColor: color.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronText: {
    color: color.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.heavy,
  },
  emptyBody: {
    color: color.textSecondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.strong,
    lineHeight: 19,
    textAlign: "center",
  },
  emptyState: {
    minHeight: spacing.emptyStateMinHeight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.borderDefault,
    backgroundColor: color.surfaceSoft,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: color.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    textAlign: "center",
  },
  quickLinkArrow: {
    color: color.textPrimary,
    fontSize: fontSize.icon,
    fontWeight: fontWeight.heavy,
  },
  quickLinkBody: {
    color: color.textSecondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.strong,
    lineHeight: 19,
  },
  quickLinkCard: {
    minHeight: spacing.quickLinkMinHeight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.borderBlueSoft,
    backgroundColor: color.surfaceRaised,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  quickLinkCopy: {
    flex: 1,
    gap: spacing.quickLinkCopyGap,
  },
  quickLinkTitle: {
    color: color.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
  },
  quickLinkTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  section: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xxxl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.surfaceDeep,
    overflow: "hidden",
  },
  sectionBody: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  sectionCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
  },
  sectionHeaderPressable: {
    minHeight: spacing.sectionHeaderMinHeight,
  },
  sectionSubtitle: {
    color: color.textSecondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.strong,
    lineHeight: 19,
  },
  sectionTitle: {
    color: color.textPrimary,
    fontSize: fontSize.sectionTitle,
    fontWeight: fontWeight.heavy,
    lineHeight: 25,
  },
  statusPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.heavy,
  },
  stickyActionBar: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.borderDefault,
    backgroundColor: color.surfaceOverlay,
    padding: spacing.lg,
    gap: spacing.md,
  },
  stickyActionRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  stickyHelper: {
    color: color.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.strong,
    lineHeight: 17,
  },
});
