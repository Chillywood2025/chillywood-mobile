import { router } from "expo-router";
import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getRuntimeControlBlockedCopy,
  isRuntimeControlBlockedAccess,
  LIVE_FIRST_PREMIUM_UPSELL_COPY,
  requireLiveFirstPremium,
} from "../../_lib/premiumWatchPartyAccess";

type LiveEntry = {
  title: string;
  kicker: string;
  body: string;
  action: string;
  onPress: () => void;
  tone?: "live" | "party";
};

export default function LiveTabScreen() {
  const openLiveWatchParty = async () => {
    const access = await requireLiveFirstPremium({ accessKey: "bottom-live-tab" }).catch(() => null);
    if (!access?.allowed) {
      if (isRuntimeControlBlockedAccess(access)) {
        const copy = getRuntimeControlBlockedCopy(access);
        Alert.alert(copy.title, copy.message);
        return;
      }

      Alert.alert(
        LIVE_FIRST_PREMIUM_UPSELL_COPY.title,
        access?.monetization.issues[0] ?? LIVE_FIRST_PREMIUM_UPSELL_COPY.message,
      );
      return;
    }

    router.push({ pathname: "/watch-party", params: { mode: "live", source: "bottom-live-tab" } });
  };

  const entries: LiveEntry[] = [
    {
      title: "Live Watch-Party",
      kicker: "People-first live room",
      body: "Start or join the Live Room path. This opens the existing Live Waiting Room and keeps Live Stage ownership unchanged.",
      action: "Open Live",
      tone: "live",
      onPress: openLiveWatchParty,
    },
    {
      title: "Watch-Party Live",
      kicker: "Content-first watch together",
      body: "Enter an existing party code here. New Watch-Party Live rooms still start from a title, creator video, Player, or Spectator source.",
      action: "Enter Code",
      tone: "party",
      onPress: () => {
        router.push({ pathname: "/watch-party", params: { source: "bottom-live-tab" } });
      },
    },
    {
      title: "Find Content",
      kicker: "Start from a title",
      body: "Browse titles first, then start Watch-Party Live from the title or Player when access is allowed.",
      action: "Browse Explore",
      onPress: () => {
        router.push("/(tabs)/explore");
      },
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>LIVE</Text>
          <Text style={styles.title}>Live</Text>
          <Text style={styles.body}>
            Choose the live path by intent. Live Watch-Party is people-first; Watch-Party Live is content-first; Party Room stays the room shell after a watch party is created.
          </Text>
        </View>

        <View style={styles.cardStack}>
          {entries.map((entry) => (
            <View key={entry.title} style={[styles.card, entry.tone === "live" && styles.cardLive, entry.tone === "party" && styles.cardParty]}>
              <Text style={styles.cardKicker}>{entry.kicker}</Text>
              <Text style={styles.cardTitle}>{entry.title}</Text>
              <Text style={styles.cardBody}>{entry.body}</Text>
              <Pressable style={styles.cardButton} onPress={entry.onPress} accessibilityRole="button" accessibilityLabel={entry.action}>
                <Text style={styles.cardButtonText}>{entry.action}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#050505",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 112,
  },
  header: {
    gap: 8,
    marginBottom: 16,
  },
  kicker: {
    color: "#FF9AA2",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "900",
  },
  body: {
    color: "#C7CEDD",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  cardStack: {
    gap: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
    padding: 16,
    gap: 9,
  },
  cardLive: {
    borderColor: "rgba(229,9,20,0.42)",
    backgroundColor: "rgba(229,9,20,0.13)",
  },
  cardParty: {
    borderColor: "rgba(139,184,255,0.35)",
    backgroundColor: "rgba(57,93,160,0.14)",
  },
  cardKicker: {
    color: "#A8B3C7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
  },
  cardBody: {
    color: "#CBD3E3",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  cardButton: {
    alignSelf: "flex-start",
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    marginTop: 2,
  },
  cardButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
});
