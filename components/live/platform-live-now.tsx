import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { getDiscoveryAccessLabel, getDiscoveryItemDestination, isDiscoveryFeedItemEligibleForRanking } from "../../_lib/discoveryFeed";
import { useLiveDiscoveryFeed } from "../../_lib/useLiveDiscoveryFeed";
import { AppActionButton, AppEmptyState, AppSection } from "../ui/app-surface";

/** Current canonical live sources, including standalone stages with no Event. */
export function PlatformLiveNow({ creatorUserId, enabled }: { creatorUserId: string; enabled: boolean }) {
  const router = useRouter();
  const feed = useLiveDiscoveryFeed({
    surface: "channel", creatorUserId, enabled: enabled && !!creatorUserId,
    includeCircle: false, liveOnly: true, limit: 24,
  });
  const items = enabled ? feed.items.filter((item) => (
    item.live_state === "live"
    && (item.owner_user_id === creatorUserId || item.channel_user_id === creatorUserId)
    && isDiscoveryFeedItemEligibleForRanking(item)
  )) : [];

  return (
    <AppSection title="Live Now">
      {feed.error ? (
        <View style={styles.list} testID="platform-live-discovery-error">
          <Text style={styles.body}>Live sessions could not be checked. Try again.</Text>
          <AppActionButton label="Retry live sessions" onPress={() => { void feed.reload(); }} />
        </View>
      ) : feed.loading && !items.length ? (
        <ActivityIndicator accessibilityLabel="Checking live sessions" />
      ) : items.length ? (
        <View style={styles.list}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              activeOpacity={0.86}
              testID="platform-live-discovery-open-button"
              accessibilityRole="button"
              accessibilityLabel={`${item.title || "Live session"}. ${getDiscoveryAccessLabel(item)}. Open live session`}
              onPress={() => router.push(getDiscoveryItemDestination(item) as Parameters<typeof router.push>[0])}
            >
              <Text style={styles.kicker}>LIVE</Text>
              <Text style={styles.title} numberOfLines={2}>{item.title || "Live session"}</Text>
              {item.subtitle ? <Text style={styles.body}>{item.subtitle}</Text> : null}
              <Text style={styles.body}>{getDiscoveryAccessLabel(item)} · Open live session</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <AppEmptyState title="No public live room" body="Public live rooms and events appear here only while they are active." />
      )}
    </AppSection>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: {
    borderRadius: 18, borderWidth: 1, borderColor: "rgba(126,215,255,0.18)",
    backgroundColor: "rgba(14,20,30,0.96)", padding: 17, gap: 9,
  },
  kicker: { color: "#7ED7FF", fontSize: 11, fontWeight: "900" },
  title: { color: "#F8FAFF", fontSize: 18, lineHeight: 24, fontWeight: "900" },
  body: { color: "#AEB9CF", fontSize: 13, lineHeight: 19, fontWeight: "700" },
});
