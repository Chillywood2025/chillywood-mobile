import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useState } from "react";
import { Alert, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getRuntimeControlBlockedCopy,
  isRuntimeControlBlockedAccess,
  LIVE_FIRST_PREMIUM_UPSELL_COPY,
  requireLiveFirstPremium,
} from "../../_lib/premiumWatchPartyAccess";

type LiveEntry = {
  title: string;
  subtitle: string;
  status: string;
  body: string;
  action: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  tone?: "primary" | "secondary";
};

const CHILLYWOOD_BACKGROUND_SOURCE = require("../../assets/images/chillywood-branded-background.png");

export default function LiveTabScreen() {
  const [detailsOpen, setDetailsOpen] = useState(false);

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
      subtitle: "People-first live room.",
      status: "Live room",
      body: "Start or join a people-first live room.",
      action: "Open Live",
      icon: "videocam",
      tone: "primary",
      onPress: openLiveWatchParty,
    },
    {
      title: "Watch-Party Live",
      subtitle: "Watch content together.",
      status: "Room code",
      body: "Enter a room code or start from content.",
      action: "Enter Code",
      icon: "confirmation-number",
      tone: "secondary",
      onPress: () => {
        router.push({ pathname: "/watch-party", params: { source: "bottom-live-tab" } });
      },
    },
    {
      title: "Find Content",
      subtitle: "Pick a title first.",
      status: "Browse first",
      body: "Pick something first, then watch together.",
      action: "Browse",
      icon: "explore",
      onPress: () => {
        router.push("/(tabs)/explore");
      },
    },
  ];

  return (
    <ImageBackground source={CHILLYWOOD_BACKGROUND_SOURCE} style={styles.screenBackground} resizeMode="cover">
      <View style={styles.backgroundOverlay} pointerEvents="none" />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroHeader}>
            <View style={styles.heroTopRow}>
              <Text style={styles.kicker}>LIVE HUB</Text>
              <View style={styles.statusPill}>
                <View style={styles.statusDot} />
                <Text style={styles.statusPillText}>Ready</Text>
              </View>
            </View>
            <Text style={styles.title}>Live</Text>
            <Text style={styles.heroSubtitle}>Choose how you want to go live or watch together.</Text>
            <View style={styles.choiceChipRow}>
              <View style={styles.choiceChip}><Text style={styles.choiceChipText}>People-first</Text></View>
              <View style={styles.choiceChip}><Text style={styles.choiceChipText}>Watch together</Text></View>
              <View style={styles.choiceChip}><Text style={styles.choiceChipText}>Browse first</Text></View>
            </View>
          </View>

          <View style={styles.actionList}>
            {entries.map((entry) => (
              <View key={entry.title} style={[styles.compactActionCard, entry.tone === "primary" && styles.primaryActionCard]}>
                <View style={styles.actionRow}>
                  <View style={[styles.iconBadge, entry.tone === "primary" && styles.iconBadgePrimary]}>
                    <MaterialIcons name={entry.icon} size={21} color="#FFFFFF" />
                  </View>
                  <View style={styles.actionCopy}>
                    <View style={styles.actionTitleRow}>
                      <Text style={styles.cardTitle}>{entry.title}</Text>
                      <View style={styles.smallStatusPill}>
                        <Text style={styles.smallStatusPillText}>{entry.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardSubtitle}>{entry.subtitle}</Text>
                    <Text style={styles.cardBody}>{entry.body}</Text>
                  </View>
                </View>
                <Pressable
                  style={[styles.cardButton, entry.tone === "primary" ? styles.primaryButton : styles.secondaryButton]}
                  onPress={entry.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={entry.action}
                >
                  <Text style={[styles.cardButtonText, entry.tone !== "primary" && styles.secondaryButtonText]}>{entry.action}</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <View style={styles.disclosureCard}>
            <Pressable
              style={styles.disclosureHeader}
              onPress={() => setDetailsOpen((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={detailsOpen ? "Hide how Live works" : "Show how Live works"}
            >
              <View>
                <Text style={styles.disclosureTitle}>How Live works</Text>
                <Text style={styles.disclosureSubtitle}>A quick guide to each live path.</Text>
              </View>
              <MaterialIcons name={detailsOpen ? "expand-less" : "expand-more"} size={26} color="#FFFFFF" />
            </Pressable>
            {detailsOpen ? (
              <View style={styles.detailList}>
                <Text style={styles.detailText}>Live Watch-Party is for people-first live rooms.</Text>
                <Text style={styles.detailText}>Watch-Party Live is for watching content together.</Text>
                <Text style={styles.detailText}>Find Content lets you start from a title or creator video.</Text>
                <Text style={styles.detailText}>Party Room stays separate after a watch party is created.</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Live discovery</Text>
            <Text style={styles.emptyStateBody}>Backed public live rooms and events can appear here later. Nothing is filled with fake activity.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screenBackground: {
    flex: 1,
    backgroundColor: "#050505",
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.66)",
  },
  safe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 112,
  },
  heroHeader: {
    gap: 8,
    marginBottom: 12,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  kicker: {
    color: "#FF9AA2",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "900",
  },
  heroSubtitle: {
    color: "#C7CEDD",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
  },
  choiceChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 2,
  },
  choiceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  choiceChipText: {
    color: "#D7DDEA",
    fontSize: 11,
    fontWeight: "900",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#59E6A9",
  },
  statusPillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  actionList: {
    gap: 9,
  },
  compactActionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.055)",
    padding: 12,
    gap: 10,
  },
  primaryActionCard: {
    borderColor: "rgba(229,9,20,0.38)",
    backgroundColor: "rgba(229,9,20,0.095)",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  iconBadgePrimary: {
    backgroundColor: "#E50914",
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  actionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  cardSubtitle: {
    color: "#D3DAE8",
    fontSize: 13,
    fontWeight: "800",
  },
  cardBody: {
    color: "#AEB7C8",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  smallStatusPill: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  smallStatusPillText: {
    color: "#DDE4F2",
    fontSize: 10,
    fontWeight: "900",
  },
  cardButton: {
    alignSelf: "flex-start",
    minHeight: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  primaryButton: {
    backgroundColor: "#E50914",
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryButtonText: {
    color: "#F3F5FA",
  },
  disclosureCard: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.052)",
    overflow: "hidden",
  },
  disclosureHeader: {
    minHeight: 58,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  disclosureTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  disclosureSubtitle: {
    color: "#AEB7C8",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  detailList: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    padding: 13,
    gap: 7,
  },
  detailText: {
    color: "#D6DCEA",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  emptyState: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 13,
    gap: 4,
  },
  emptyStateTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  emptyStateBody: {
    color: "#AEB7C8",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
});
