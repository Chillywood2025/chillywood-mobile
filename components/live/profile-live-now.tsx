import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { getDiscoveryAccessLabel, getDiscoveryItemDestination } from "../../_lib/discoveryFeed";
import type { ProfileLiveState } from "../../_lib/useProfileLiveState";

/** Shares the Profile header's current read; event cards below retain their reminders and actions. */
export function ProfileLiveNow({ live, displayedEventIds }: {
  live: ProfileLiveState;
  displayedEventIds: readonly string[];
}) {
  const router = useRouter();
  const items = live.items.filter((item) => (
    item.item_type !== "creator_event" || !item.event_id || !displayedEventIds.includes(item.event_id)
  ));
  if (live.status === "unavailable") return null;
  return (
    <View style={styles.list} testID="profile-live-now">
      {live.status === "checking" ? <ActivityIndicator accessibilityLabel="Checking live sessions" /> : null}
      {live.status === "error" ? (
        <View>
          <Text style={styles.body}>Live sessions could not be checked.</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry profile live sessions" onPress={() => { void live.reload(); }}>
            <Text style={styles.title}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {items.map((item) => (
        <TouchableOpacity
          key={item.id} style={styles.card} activeOpacity={0.86}
          testID="profile-live-discovery-open-button" accessibilityRole="button"
          accessibilityLabel={`${item.title || "Live session"}. ${getDiscoveryAccessLabel(item)}. Open live session`}
          onPress={() => router.push(getDiscoveryItemDestination(item) as Parameters<typeof router.push>[0])}
        >
          <Text style={styles.kicker}>LIVE</Text>
          <Text style={styles.title} numberOfLines={2}>{item.title || "Live session"}</Text>
          <Text style={styles.body}>{getDiscoveryAccessLabel(item)} · Open live session</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: "rgba(126,215,255,0.18)", backgroundColor: "rgba(14,20,30,0.96)", padding: 17, gap: 9 },
  kicker: { color: "#7ED7FF", fontSize: 11, fontWeight: "900" },
  title: { color: "#F8FAFF", fontSize: 18, lineHeight: 24, fontWeight: "900" },
  body: { color: "#AEB9CF", fontSize: 13, lineHeight: 19, fontWeight: "700" },
});
