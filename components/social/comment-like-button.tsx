import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useIsFocused } from "@react-navigation/native";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useCommentLike } from "../../hooks/use-comment-like";
import { formatSocialCount, socialCountAccessibilityLabel } from "../../_lib/socialCountPresentation";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

export function CommentLikeButton({ kind, id }: { kind: "profile_post_comment" | "creator_video_comment"; id: string }) {
  const focused = useIsFocused();
  const state = useCommentLike({ kind, id, enabled: focused });
  return <View style={styles.row}>
    <TouchableOpacity style={styles.button} testID="comment-like" accessibilityRole="button"
      accessibilityLabel={`${socialCountAccessibilityLabel("Comment likes", state.likeCount)}. ${state.liked ? "Unlike comment" : "Like comment"}`}
      accessibilityState={{ selected: state.liked, busy: state.busy, disabled: !state.canLike || state.busy }}
      disabled={!state.canLike || state.busy} onPress={() => { void state.toggleLike(); }}>
      {state.busy ? <ActivityIndicator size="small" color={CHILLYWOOD_VISUAL.accentCrimson} /> : <MaterialIcons name={state.liked ? "favorite" : "favorite-border"} size={17} color={state.liked ? CHILLYWOOD_VISUAL.accentCrimson : CHILLYWOOD_VISUAL.textMuted} />}
      <Text style={styles.label}>{formatSocialCount(state.likeCount)}</Text>
    </TouchableOpacity>
    {state.error ? <TouchableOpacity style={styles.button} accessibilityRole="button" accessibilityLabel="Retry comment likes" onPress={() => { void state.refresh(); }}><Text style={styles.label}>Retry likes</Text></TouchableOpacity> : null}
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  button: { minWidth: 48, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 10 },
  label: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 12, fontWeight: "600" },
});
