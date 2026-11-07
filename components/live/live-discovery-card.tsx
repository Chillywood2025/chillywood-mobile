import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { getDiscoveryAccessLabel, getDiscoveryItemActionLabel, getDiscoveryLiveLabel, type DiscoveryFeedItem } from "../../_lib/discoveryFeed";
import { StableImage } from "../ui/StableImage";
import { CHILLYWOOD_VISUAL, ChillywoodPrimaryActionFill } from "../ui/chillywood-visual-system";

/** Metadata preview only: never joins a room, starts playback, or changes camera/mic state. */
export function LiveDiscoveryCard({ item, onOpen, style, testID, compact = false, contextLabel }: {
  item: DiscoveryFeedItem;
  onOpen: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  compact?: boolean;
  contextLabel?: string;
}) {
  const title = item.title?.trim() || "Live session";
  const live = item.live_state === "live" && !item.ended_at;
  const access = getDiscoveryAccessLabel(item);
  const action = getDiscoveryItemActionLabel(item);
  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.compact, style]}
      onPress={onOpen}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${getDiscoveryLiveLabel(item)}. ${access}. ${action}`}
      testID={testID}
    >
      <View style={[styles.preview, compact && styles.compactPreview]}>
        <ChillywoodPrimaryActionFill opacity={0.24} radius={0} />
        {item.thumbnail_url ? <StableImage source={{ uri: item.thumbnail_url }} expectedWidth="100%" expectedHeight="100%" containerStyle={StyleSheet.absoluteFill} borderRadius={0} resizeMode="cover" /> : <View style={styles.fallback}><MaterialIcons name={item.item_type === "watch_party" ? "groups" : "live-tv"} size={compact ? 36 : 48} color="#BFC8FF" /></View>}
        <View style={styles.shade} />
        <View style={styles.topRow}>
          <View style={styles.liveBadge}><View style={[styles.dot, !live && styles.inactiveDot]} /><Text style={styles.badgeText}>{getDiscoveryLiveLabel(item)}</Text></View>
          {!compact ? <View style={styles.typeBadge}><Text style={styles.typeText}>{item.item_type === "watch_party" ? "WATCH TOGETHER" : live ? "ON AIR" : "CHI'LLYWOOD"}</Text></View> : null}
        </View>
        <View style={styles.titleBlock}>
          {contextLabel ? <Text style={styles.context}>{contextLabel}</Text> : null}
          <Text style={[styles.title, compact && styles.compactTitle]} numberOfLines={2}>{title}</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <View style={styles.copy}>
          <Text style={styles.access} numberOfLines={2}>{access}</Text>
          {!compact && item.subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{item.subtitle}</Text> : null}
        </View>
        <View style={styles.open}><MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" /></View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", borderRadius: 22, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, backgroundColor: CHILLYWOOD_VISUAL.glassBackground },
  compact: { borderRadius: 18 },
  preview: { minHeight: 190, backgroundColor: CHILLYWOOD_VISUAL.background, justifyContent: "space-between" },
  compactPreview: { minHeight: 174 },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4,4,15,0.30)" },
  topRow: { padding: 12, flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "space-between" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: "rgba(5,4,19,0.88)" },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: CHILLYWOOD_VISUAL.accentCrimson },
  inactiveDot: { backgroundColor: CHILLYWOOD_VISUAL.textMuted },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  typeBadge: { justifyContent: "center", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "rgba(5,4,19,0.88)" },
  typeText: { color: "#B9DFFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  titleBlock: { paddingHorizontal: 14, paddingTop: 20, paddingBottom: 14, backgroundColor: "rgba(5,4,19,0.72)", gap: 5 },
  context: { color: "#9DDCFF", fontSize: 10, fontWeight: "700" },
  title: { color: "#FFFFFF", fontSize: 22, lineHeight: 28, fontWeight: "800" },
  compactTitle: { fontSize: 16, lineHeight: 21 },
  footer: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10, minHeight: 60 },
  copy: { flex: 1, gap: 4 },
  access: { color: "#DDD6F3", fontSize: 12, fontWeight: "700" },
  subtitle: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 12, lineHeight: 17 },
  open: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(110,33,255,0.36)", alignItems: "center", justifyContent: "center" },
});
