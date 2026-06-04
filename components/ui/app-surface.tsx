import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type AppTone = "default" | "accent" | "success" | "warning" | "danger" | "muted" | "premium";

const toneStyles: Record<AppTone, { backgroundColor: string; borderColor: string; color: string }> = {
  accent: { backgroundColor: "rgba(220,20,60,0.16)", borderColor: "rgba(220,20,60,0.46)", color: "#FFE6EC" },
  danger: { backgroundColor: "rgba(239,68,68,0.14)", borderColor: "rgba(239,68,68,0.42)", color: "#FFE4E6" },
  default: { backgroundColor: "rgba(116,130,255,0.13)", borderColor: "rgba(116,130,255,0.32)", color: "#E8ECFF" },
  muted: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)", color: "#D7DEEC" },
  premium: { backgroundColor: "rgba(245,158,11,0.16)", borderColor: "rgba(245,158,11,0.38)", color: "#FFF2C7" },
  success: { backgroundColor: "rgba(34,197,94,0.14)", borderColor: "rgba(34,197,94,0.36)", color: "#C9FFE1" },
  warning: { backgroundColor: "rgba(245,158,11,0.14)", borderColor: "rgba(245,158,11,0.36)", color: "#FFE8A3" },
};

export const AppStatusPill = ({ label, tone = "default" }: { label: string; tone?: AppTone }) => {
  const toneStyle = toneStyles[tone];
  return (
    <View style={[styles.statusPill, { backgroundColor: toneStyle.backgroundColor, borderColor: toneStyle.borderColor }]}>
      <Text style={[styles.statusPillText, { color: toneStyle.color }]}>{label}</Text>
    </View>
  );
};

export const AppActionButton = ({
  disabled = false,
  label,
  loading = false,
  onPress,
  style,
  variant = "secondary",
}: {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
}) => (
  <TouchableOpacity
    accessibilityLabel={label}
    accessibilityRole="button"
    accessibilityState={{ disabled: disabled || loading, busy: loading }}
    activeOpacity={0.84}
    disabled={disabled || loading}
    hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
    onPress={onPress}
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
    {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.actionButtonText}>{label}</Text>}
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
          <Text style={styles.chevronText}>{expanded ? "v" : ">"}</Text>
        </View>
      ) : null}
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
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
          activeOpacity={0.84}
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
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyBody}>{body}</Text>
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
    activeOpacity={0.84}
    disabled={disabled}
    hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
    onPress={onPress}
    style={[styles.quickLinkCard, disabled && styles.actionButtonDisabled]}
  >
    <View style={styles.quickLinkCopy}>
      <View style={styles.quickLinkTitleRow}>
        <Text style={styles.quickLinkTitle}>{title}</Text>
        {statusLabel ? <AppStatusPill label={statusLabel} tone={statusTone} /> : null}
      </View>
      <Text style={styles.quickLinkBody}>{body}</Text>
    </View>
    <Text style={styles.quickLinkArrow}>{">"}</Text>
  </TouchableOpacity>
);

export const AppStickyActionBar = ({ children, helper }: { children: React.ReactNode; helper?: string }) => (
  <View style={styles.stickyActionBar}>
    {helper ? <Text style={styles.stickyHelper}>{helper}</Text> : null}
    <View style={styles.stickyActionRow}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  actionButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonDanger: {
    borderColor: "rgba(239,68,68,0.44)",
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  actionButtonDisabled: {
    opacity: 0.48,
  },
  actionButtonGhost: {
    backgroundColor: "rgba(116,130,255,0.12)",
    borderColor: "rgba(116,130,255,0.3)",
  },
  actionButtonPrimary: {
    backgroundColor: "#DC143C",
    borderColor: "rgba(255,255,255,0.12)",
  },
  actionButtonSuccess: {
    backgroundColor: "rgba(34,197,94,0.22)",
    borderColor: "rgba(34,197,94,0.45)",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  chevronBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  chevronText: {
    color: "#F8FAFF",
    fontSize: 18,
    fontWeight: "900",
  },
  emptyBody: {
    color: "#AAB4C8",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
  },
  emptyState: {
    minHeight: 116,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(10,14,22,0.76)",
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: "#F8FAFF",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  quickLinkArrow: {
    color: "#F8FAFF",
    fontSize: 24,
    fontWeight: "900",
  },
  quickLinkBody: {
    color: "#AAB4C8",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  quickLinkCard: {
    minHeight: 88,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(116,130,255,0.24)",
    backgroundColor: "rgba(13,17,28,0.82)",
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quickLinkCopy: {
    flex: 1,
    gap: 7,
  },
  quickLinkTitle: {
    color: "#F8FAFF",
    fontSize: 16,
    fontWeight: "900",
  },
  quickLinkTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(8,12,20,0.62)",
    overflow: "hidden",
  },
  sectionBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  sectionCopy: {
    flex: 1,
    gap: 5,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  sectionHeaderPressable: {
    minHeight: 72,
  },
  sectionSubtitle: {
    color: "#AAB4C8",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  sectionTitle: {
    color: "#F8FAFF",
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 25,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "900",
  },
  stickyActionBar: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(9,12,20,0.92)",
    padding: 12,
    gap: 10,
  },
  stickyActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  stickyHelper: {
    color: "#AAB4C8",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
});
