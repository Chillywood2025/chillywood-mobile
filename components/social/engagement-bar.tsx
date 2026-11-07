import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { formatSocialCount, socialCountAccessibilityLabel } from "../../_lib/socialCountPresentation";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

export type EngagementBarProps = {
  likes?: number | null;
  comments?: number | null;
  commentsLabel?: string;
  shares?: number | null;
  liked?: boolean;
  reposted?: boolean;
  busy?: boolean;
  error?: string | null;
  onLike?: () => void;
  onComments?: () => void;
  onShare?: () => void;
  onRepost?: () => void;
  onRetry?: () => void;
  compact?: boolean;
};

/** Chi'llywood's horizontal social dock. Private messages never become public metrics. */
export function EngagementBar({ likes, comments, commentsLabel = "Comments", shares, liked, reposted, busy, error, onLike, onComments, onShare, onRepost, onRetry, compact }: EngagementBarProps) {
  const actions = [
    { key: "like", label: "Likes", icon: liked ? "favorite" : "favorite-border", count: likes, onPress: onLike, selected: !!liked },
    { key: "comments", label: commentsLabel, icon: "chat-bubble-outline", count: comments, onPress: onComments, selected: false },
    { key: "repost", label: "Reposts", icon: "repeat", count: shares, onPress: onRepost, selected: !!reposted },
    { key: "share", label: "Send", icon: "ios-share", count: undefined, onPress: onShare, selected: false },
  ] as const;
  return (
    <View style={styles.container}>
      <View style={[styles.dock, compact && styles.compact]} testID="social-engagement-bar">
        {actions.filter(action => action.key !== "repost" || shares !== undefined || !!onRepost).map((action) => (
          <TouchableOpacity
            key={action.key}
            testID={`social-${action.key}`}
            style={[styles.action, action.selected && styles.selected]}
            onPress={action.onPress}
            disabled={!action.onPress || ((action.key === "like" || action.key === "repost") && busy)}
            accessibilityRole="button"
            accessibilityLabel={action.key === "share" ? "Send content using the share sheet" : `${socialCountAccessibilityLabel(action.label, action.count)}. ${action.key === "like" ? liked ? "Unlike" : "Like" : action.key === "repost" ? reposted ? "Remove your repost" : "Repost to your profile" : "Open discussion"}`}
            accessibilityState={{ selected: action.key === "like" || action.key === "repost" ? action.selected : undefined, disabled: !action.onPress || ((action.key === "like" || action.key === "repost") && !!busy), busy: (action.key === "like" || action.key === "repost") && !!busy }}
          >
            {action.key === "like" && busy ? <ActivityIndicator size="small" color={CHILLYWOOD_VISUAL.accentCrimson} /> : <MaterialIcons name={action.icon} size={20} color={action.selected ? CHILLYWOOD_VISUAL.accentCrimson : CHILLYWOOD_VISUAL.textPrimary} />}
            <Text style={[styles.count, action.selected && styles.selectedText]}>{action.key === "share" ? "Send" : formatSocialCount(action.count)}</Text>
            {!compact && action.key !== "share" ? <Text style={styles.label}>{action.label}</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
      {error ? (
        <View style={styles.status}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>Engagement unavailable</Text>
          {onRetry ? <TouchableOpacity onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry engagement counts" style={styles.retry}><Text style={styles.retryText}>Retry</Text></TouchableOpacity> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  dock: { flexDirection: "row", flexWrap: "wrap", borderRadius: 18, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, backgroundColor: CHILLYWOOD_VISUAL.glassBackground, padding: 4, gap: 4 },
  compact: { borderRadius: 0, borderWidth: 0, borderTopWidth: 1, paddingHorizontal: 2 },
  action: { flex: 1, minWidth: 48, minHeight: 48, paddingHorizontal: 5, paddingVertical: 6, justifyContent: "center", alignItems: "center", gap: 3, borderRadius: 14 },
  selected: { backgroundColor: "rgba(243,75,116,0.12)" },
  count: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  selectedText: { color: "#FF9CB5" },
  label: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 11 },
  status: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
  error: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 11 },
  retry: { minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center" },
  retryText: { color: "#7ED7FF", fontSize: 12, fontWeight: "700" },
});
