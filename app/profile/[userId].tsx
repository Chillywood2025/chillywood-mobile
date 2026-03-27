import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Image,
    ImageBackground,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { titles as localTitles } from "../../_data/titles";
import { buildUserChannelProfile } from "../../_lib/userData";
import { getSafePartyUserId } from "../../_lib/watchParty";

export default function ProfileScreen() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState("");
  const params = useLocalSearchParams<{
    userId?: string;
    displayName?: string;
    avatarUrl?: string;
    tagline?: string;
    role?: string;
    isLive?: string;
    self?: string;
    partyId?: string;
    mode?: string;
    source?: string;
  }>();
  const userId = String(Array.isArray(params.userId) ? params.userId[0] : params.userId ?? "").trim();
  const displayNameParam = String(Array.isArray(params.displayName) ? params.displayName[0] : params.displayName ?? "").trim();
  const avatarUrlParam = String(Array.isArray(params.avatarUrl) ? params.avatarUrl[0] : params.avatarUrl ?? "").trim();
  const taglineParam = String(Array.isArray(params.tagline) ? params.tagline[0] : params.tagline ?? "").trim();
  const roleParam = String(Array.isArray(params.role) ? params.role[0] : params.role ?? "").trim();
  const isLiveParam = String(Array.isArray(params.isLive) ? params.isLive[0] : params.isLive ?? "").trim().toLowerCase();
  const selfParam = String(Array.isArray(params.self) ? params.self[0] : params.self ?? "").trim().toLowerCase();
  const partyIdParam = String(Array.isArray(params.partyId) ? params.partyId[0] : params.partyId ?? "").trim();
  const modeParam = String(Array.isArray(params.mode) ? params.mode[0] : params.mode ?? "").trim();
  const sourceParam = String(Array.isArray(params.source) ? params.source[0] : params.source ?? "").trim();
  const profile = buildUserChannelProfile({
    id: userId,
    displayName: displayNameParam,
    avatarUrl: avatarUrlParam,
    tagline: taglineParam,
    role: roleParam,
    isLive: isLiveParam === "1" || isLiveParam === "true" || isLiveParam === "yes" || isLiveParam === "live",
    fallbackDisplayName: "Channel",
  });
  useEffect(() => {
    let active = true;
    getSafePartyUserId()
      .then((resolvedUserId) => {
        if (active) setCurrentUserId(String(resolvedUserId ?? "").trim());
      })
      .catch(() => {
        if (active) setCurrentUserId("");
      });
    return () => {
      active = false;
    };
  }, []);

  const isSelfProfile = selfParam === "1" || selfParam === "true" || (!!userId && !!currentUserId && userId === currentUserId);
  const roleLabel = profile.role === "creator" ? "Creator" : profile.role === "host" ? "Host" : "Viewer";
  const channelLabel = isSelfProfile
    ? "Your Channel"
    : profile.role === "creator"
      ? "Creator Channel"
      : profile.role === "host"
        ? "Host Channel"
        : "Channel";
  const channelHandle = useMemo(() => {
    const normalizedHandle = profile.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
    if (normalizedHandle) return `@${normalizedHandle}`;
    return isSelfProfile ? "@you" : "@channel";
  }, [isSelfProfile, profile.displayName]);
  const liveActionLabel = profile.isLive ? "Join Live" : "View Live";
  const hasLiveRouteContext = !!partyIdParam;
  const primaryActionLabel = isSelfProfile ? "Manage Channel" : "Follow";
  const secondaryPlaceholderLabel = isSelfProfile ? "Creator Tools Soon" : "Subscribe Soon";
  const liveStateLabel = profile.isLive ? "LIVE NOW" : "OFF AIR";
  const routeContextLabel = hasLiveRouteContext ? "ROOM LINKED" : "CONTEXT NEEDED";
  const liveStatusTitle = profile.isLive ? "Channel is live now" : "Channel is off air";
  const liveStatusBody = hasLiveRouteContext
    ? profile.isLive
      ? "Join Live and Watch Party open from the current room on this profile."
      : "View Live and Watch Party open from the current room on this profile."
    : profile.isLive
      ? "This channel looks live. Open this profile from a room or live session to join from here."
      : "Open this profile from a room or live session to jump into Live or Watch Party from here.";
  const actionFootnote = hasLiveRouteContext
    ? `${liveActionLabel} and Watch Party are connected to this room. ${primaryActionLabel} and ${secondaryPlaceholderLabel} are coming soon.`
    : `${liveActionLabel} and Watch Party open once this profile is launched from a room or live session. ${primaryActionLabel} and ${secondaryPlaceholderLabel} are coming soon.`;
  const contentSections = [
    {
      title: "Live",
      kicker: profile.isLive ? "ON AIR" : "OFF AIR",
      body: profile.isLive
        ? "This channel is live now. Future live entry, creator presence, and access controls can anchor here."
        : "No live room right now. Future live entry and scheduled broadcasts can surface here.",
      accent: profile.isLive ? "live" : "default",
    },
    {
      title: "Videos",
      kicker: "CHANNEL LIBRARY",
      body: "Published videos and clips can land here when creator uploads and catalog structure are ready.",
      accent: "default",
    },
    {
      title: "Watch Parties",
      kicker: "SOCIAL ROOMS",
      body: "Host-led watch parties, room history, and creator-led entry points can grow here next.",
      accent: "default",
    },
    {
      title: "Saved / Locked",
      kicker: "ACCESS NOTES",
      body: "Saved, locked, subscriber, and Party Pass drops can live here as access expands. Payments and entitlements are not active yet, and capture protection stays best-effort on supported devices.",
      accent: "default",
    },
  ] as const;

  const backgroundSource = (() => {
    const first = localTitles[0] as any;
    return first?.image || first?.poster || undefined;
  })();
  const onPressFollow = () => {
    if (isSelfProfile) {
      Alert.alert("Manage Channel", "Manage Channel tools will land here for creator controls, settings, and access.");
      return;
    }
    Alert.alert("Follow", `Follow is coming soon for ${profile.displayName} as channel connections roll out.`);
  };
  const onPressLive = () => {
    if (hasLiveRouteContext) {
      if (profile.isLive) {
        router.push({
          pathname: "/watch-party/live-stage/[partyId]",
          params: {
            partyId: partyIdParam,
            ...(modeParam ? { mode: modeParam } : {}),
            ...(sourceParam ? { source: sourceParam } : {}),
          },
        });
        return;
      }

      router.push({
        pathname: "/watch-party/[partyId]",
        params: {
          partyId: partyIdParam,
          ...(modeParam ? { mode: modeParam } : {}),
        },
      });
      return;
    }

    Alert.alert(liveActionLabel, profile.isLive
      ? "This channel is live. Open this profile from a room or live session to join from here."
      : "View Live becomes available when this profile is opened from a room or live session.");
  };
  const onPressWatchParty = () => {
    if (hasLiveRouteContext) {
      router.push({
        pathname: "/watch-party/[partyId]",
        params: {
          partyId: partyIdParam,
          ...(modeParam ? { mode: modeParam } : {}),
          ...(sourceParam ? { source: sourceParam } : {}),
        },
      });
      return;
    }

    Alert.alert("Watch Party", "Watch Party becomes available when this profile is opened from a room or live session.");
  };
  const onPressSubscribe = () => {
    Alert.alert(secondaryPlaceholderLabel, isSelfProfile
      ? "Creator tools and subscriber access will land here later. Payments and entitlements are not active yet."
      : "Subscriber access will land here later. Payments and entitlements are not active yet.");
  };

  return (
    <View style={styles.outerFlex}>
      {backgroundSource ? (
        <ImageBackground
          source={backgroundSource}
          style={styles.fullBackground}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.fullBackgroundFallback} pointerEvents="none" />
      )}
      <View style={styles.fullBackgroundOverlay} pointerEvents="none" />

      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>CHI'LLYWOOD · CHANNEL</Text>
          <View style={{ width: 18 }} />
        </View>

        <View style={styles.profileCard}>
          <Text style={styles.profileEyebrow}>CHANNEL</Text>
          <View style={styles.heroBadgeRow}>
            <View style={[styles.heroBadge, profile.isLive ? styles.heroBadgeLive : styles.heroBadgeDefault]}>
              <Text style={[styles.heroBadgeText, profile.isLive && styles.heroBadgeTextLive]}>{liveStateLabel}</Text>
            </View>
            <View style={[styles.heroBadge, hasLiveRouteContext ? styles.heroBadgeLinked : styles.heroBadgeDefault]}>
              <Text style={[styles.heroBadgeText, hasLiveRouteContext && styles.heroBadgeTextLinked]}>{routeContextLabel}</Text>
            </View>
          </View>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitial}>{profile.displayName.slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            {profile.isLive ? <View style={styles.avatarLiveDot} /> : null}
          </View>
          <Text style={styles.channelLabel}>{channelLabel}</Text>
          <Text style={styles.username}>{profile.displayName}</Text>
          <Text style={styles.userIdLabel}>{channelHandle}</Text>
          {profile.tagline ? <Text style={styles.profileTagline}>{profile.tagline}</Text> : null}
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{roleLabel}</Text>
            </View>
          </View>
          <Text style={styles.channelSupportText}>Channel home for live drops, rooms, and creator presence.</Text>
          <View style={[styles.statusPanel, profile.isLive && styles.statusPanelLive]}>
            <Text style={styles.statusPanelKicker}>{profile.isLive ? "LIVE STATUS" : "CHANNEL STATUS"}</Text>
            <Text style={styles.statusPanelTitle}>{liveStatusTitle}</Text>
            <Text style={styles.statusPanelBody}>{liveStatusBody}</Text>
          </View>
          <View style={styles.actionCluster}>
            <View style={styles.primaryActionRow}>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} activeOpacity={0.86} onPress={onPressFollow}>
                <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>{primaryActionLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  hasLiveRouteContext
                    ? (profile.isLive ? styles.actionBtnLive : styles.actionBtnConnected)
                    : styles.actionBtnPlaceholder,
                ]}
                activeOpacity={0.86}
                onPress={onPressLive}
              >
                <Text
                  style={[
                    styles.actionBtnText,
                    hasLiveRouteContext
                      ? (profile.isLive ? styles.actionBtnTextLive : styles.actionBtnTextConnected)
                      : styles.actionBtnTextPlaceholder,
                  ]}
                >
                  {liveActionLabel}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.secondaryActionRow}>
              <TouchableOpacity
                style={[styles.actionChip, hasLiveRouteContext ? styles.actionChipConnected : styles.actionChipPlaceholder]}
                activeOpacity={0.82}
                onPress={onPressWatchParty}
              >
                <Text style={[styles.actionChipText, hasLiveRouteContext ? styles.actionChipTextConnected : styles.actionChipTextPlaceholder]}>
                  Watch Party
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionChip, styles.actionChipPlaceholderMuted]} activeOpacity={0.82} onPress={onPressSubscribe}>
                <Text style={[styles.actionChipText, styles.actionChipTextMuted]}>{secondaryPlaceholderLabel}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.actionFootnote}>{actionFootnote}</Text>
          </View>
        </View>

        <View style={styles.sectionStack}>
          {contentSections.map((section) => (
            <View
              key={section.title}
              style={[
                styles.sectionCard,
                section.accent === "live" && styles.sectionCardLive,
              ]}
            >
              <Text style={styles.sectionKicker}>{section.kicker}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerFlex: { flex: 1 },
  fullBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  fullBackgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0B10",
  },
  fullBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  screen: { flex: 1, backgroundColor: "transparent" },
  content: { paddingTop: 56, paddingBottom: 48, paddingHorizontal: 18, gap: 14 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backArrow: { color: "#aaa", fontSize: 20, fontWeight: "700", paddingRight: 8 },
  kicker: { color: "#555", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.2 },

  profileCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 18,
    alignItems: "center",
    gap: 8,
  },
  profileEyebrow: { color: "#7B7B7B", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.5 },
  heroBadgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: -2 },
  heroBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeDefault: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroBadgeLive: {
    borderColor: "rgba(220,20,60,0.32)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  heroBadgeLinked: {
    borderColor: "rgba(115,134,255,0.26)",
    backgroundColor: "rgba(115,134,255,0.12)",
  },
  heroBadgeText: { color: "#A8B0C3", fontSize: 10.5, fontWeight: "900", letterSpacing: 0.8 },
  heroBadgeTextLive: { color: "#FFD5DD" },
  heroBadgeTextLinked: { color: "#D7DDFF" },
  avatarWrap: { position: "relative", marginTop: 2 },
  avatarCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarLiveDot: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(18,18,18,0.96)",
    backgroundColor: "#DC143C",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitial: { color: "#fff", fontSize: 38, fontWeight: "900" },
  channelLabel: { color: "#A7B2C9", fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  username: { color: "#fff", fontSize: 29, fontWeight: "900", letterSpacing: 0.2 },
  userIdLabel: { color: "#A0A0A0", fontSize: 13, fontWeight: "700" },
  profileTagline: { color: "#B8C1D6", fontSize: 13, lineHeight: 18, fontWeight: "600", textAlign: "center" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 2 },
  metaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaPillText: { color: "#D5D5D5", fontSize: 11, fontWeight: "800" },
  livePill: {
    borderColor: "rgba(220,20,60,0.28)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  livePillText: { color: "#F2C1CC" },
  channelSupportText: { color: "#727C91", fontSize: 12.5, lineHeight: 18, fontWeight: "600", textAlign: "center", marginTop: 2 },
  statusPanel: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 4,
  },
  statusPanelLive: {
    borderColor: "rgba(220,20,60,0.16)",
    backgroundColor: "rgba(48,16,24,0.82)",
  },
  statusPanelKicker: { color: "#7A859A", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  statusPanelTitle: { color: "#F3F5FA", fontSize: 16, fontWeight: "900" },
  statusPanelBody: { color: "#9CA5B8", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  actionCluster: { width: "100%", gap: 10, marginTop: 6 },
  primaryActionRow: { flexDirection: "row", gap: 10, width: "100%" },
  secondaryActionRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  actionBtnPrimary: {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "#F3F4F8",
  },
  actionBtnSecondary: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  actionBtnConnected: {
    borderColor: "rgba(115,134,255,0.24)",
    backgroundColor: "rgba(115,134,255,0.14)",
  },
  actionBtnLive: {
    borderColor: "rgba(220,20,60,0.34)",
    backgroundColor: "rgba(220,20,60,0.16)",
  },
  actionBtnPlaceholder: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  actionBtnText: { color: "#E7EAF3", fontSize: 13.5, fontWeight: "900" },
  actionBtnTextPrimary: { color: "#090A0F" },
  actionBtnTextConnected: { color: "#E4E8FF" },
  actionBtnTextLive: { color: "#FFD7DE" },
  actionBtnTextPlaceholder: { color: "#9BA4B7" },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionChipConnected: {
    borderColor: "rgba(115,134,255,0.22)",
    backgroundColor: "rgba(115,134,255,0.12)",
  },
  actionChipPlaceholder: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  actionChipPlaceholderMuted: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  actionChipText: { color: "#DCE2F0", fontSize: 12, fontWeight: "800" },
  actionChipTextConnected: { color: "#DDE4FF" },
  actionChipTextPlaceholder: { color: "#97A1B5" },
  actionChipTextMuted: { color: "#9AA3B7" },
  actionFootnote: { color: "#6D7486", fontSize: 11.5, lineHeight: 16, fontWeight: "600", textAlign: "center" },

  sectionStack: { gap: 12 },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 16,
    gap: 6,
  },
  sectionCardLive: {
    borderColor: "rgba(220,20,60,0.18)",
    backgroundColor: "rgba(28,16,20,0.96)",
  },
  sectionKicker: { color: "#727C91", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  sectionTitle: { color: "#ECECEC", fontSize: 16, fontWeight: "900" },
  sectionBody: { color: "#8B8B8B", fontSize: 13, lineHeight: 18, fontWeight: "600" },
});
