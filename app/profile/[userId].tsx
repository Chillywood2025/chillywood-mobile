import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveFeatureConfig,
} from "../../_lib/appConfig";
import { trackEvent } from "../../_lib/analytics";
import { useBetaProgram } from "../../_lib/betaProgram";
import { getOrCreateDirectThread } from "../../_lib/chat";
import { reportRuntimeError } from "../../_lib/logger";
import { getSupportRoutePath } from "../../_lib/runtimeConfig";
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
  const { isActive: hasSupportAccess } = useBetaProgram();
  const [currentUserId, setCurrentUserId] = useState("");
  const [creatorSettingsEnabled, setCreatorSettingsEnabled] = useState(DEFAULT_APP_CONFIG.features.creatorSettingsEnabled);
  const [avatarQuickActionsOpen, setAvatarQuickActionsOpen] = useState(false);
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

  useEffect(() => {
    let active = true;

    readAppConfig()
      .then((config) => {
        if (active) setCreatorSettingsEnabled(resolveFeatureConfig(config).creatorSettingsEnabled);
      })
      .catch(() => {
        if (active) setCreatorSettingsEnabled(DEFAULT_APP_CONFIG.features.creatorSettingsEnabled);
      });

    return () => {
      active = false;
    };
  }, []);

  const isSelfProfile = selfParam === "1" || selfParam === "true" || (!!userId && !!currentUserId && userId === currentUserId);
  const [activeProfileView, setActiveProfileView] = useState<"owner" | "profile" | "channel">(
    selfParam === "1" || selfParam === "true" ? "owner" : "profile",
  );
  const roleLabel = profile.role === "creator" ? "Creator" : profile.role === "host" ? "Host" : "Viewer";
  useEffect(() => {
    setActiveProfileView((current) => {
      if (isSelfProfile) {
        return current === "profile" ? "owner" : current;
      }
      return current === "owner" ? "profile" : current;
    });
  }, [isSelfProfile]);
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
  const showManageChannelAction = isSelfProfile && creatorSettingsEnabled;
  const canOpenLinkedRoomActions = hasLiveRouteContext;
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
    ? `${liveActionLabel} and Watch Party are connected to this room.`
    : "Open this profile from a room or live session to jump back into linked live and watch-party surfaces from here.";
  const communicationFootnote = isSelfProfile
    ? "Chi'lly Chat opens your native Chi'llywood inbox and direct threads."
    : "";
  const ownerSections = [
    {
      title: "Profile Studio",
      kicker: "IDENTITY",
      body: "Edit profile presentation, update channel voice, and keep your public owner identity in one place.",
      actionLabel: "Edit Profile",
      actionKind: "edit-profile" as const,
    },
    {
      title: "Channel Scope",
      kicker: "CHANNEL CONTROLS",
      body: "Manage channel defaults, room inheritance, and the creator-facing scope already anchored to this profile system.",
      actionLabel: "Manage Channel",
      actionKind: "manage-channel" as const,
    },
    {
      title: "Monetization",
      kicker: "EARNINGS SCOPE",
      body: "Keep monetization entry points attached to your owner page so future payouts, access products, and creator offers stay native.",
      actionLabel: "Monetization",
      actionKind: "monetization" as const,
    },
    {
      title: "Creator Controls",
      kicker: "PLATFORM SCOPE",
      body: "Review creator permissions, platform controls, and room policy defaults without leaving your channel home.",
      actionLabel: "Creator Controls",
      actionKind: "creator-controls" as const,
    },
  ] as const;
  const profileSections = [
    {
      title: "Profile Snapshot",
      kicker: "ABOUT",
      body: `${profile.displayName} keeps live presence, rooms, and direct communication inside one Chi'llywood identity instead of splitting them across disconnected surfaces.`,
    },
    {
      title: "Channel Entry",
      kicker: "NEXT STEP",
      body: "Open the channel-home view to browse live drops, featured titles, and the creator-facing streaming identity tied to this profile.",
    },
  ] as const;
  const contentSections = [
    {
      title: "Live",
      kicker: profile.isLive ? "ON AIR" : "OFF AIR",
      body: profile.isLive
        ? "This channel is live now, and linked room entry appears here when the profile is opened from an active session."
        : "No live room is active right now. Live state and linked room entry appear here when a session is running.",
      accent: profile.isLive ? "live" : "default",
    },
    {
      title: "Videos",
      kicker: "CHANNEL LIBRARY",
      body: "Published titles and featured picks can anchor this channel identity without adding a separate social layer yet.",
      accent: "default",
    },
    {
      title: "Watch Parties",
      kicker: "SOCIAL ROOMS",
      body: "Room-linked watch-party entry is available from active sessions, while deeper social history stays outside v1 scope.",
      accent: "default",
    },
    {
      title: "Saved / Locked",
      kicker: "ACCESS NOTES",
      body: "Eligible titles and rooms can still enforce access rules in-context, and capture protection remains best-effort on supported devices.",
      accent: "default",
    },
  ] as const;

  const backgroundSource = (() => {
    const first = localTitles[0] as any;
    return first?.image || first?.poster || undefined;
  })();
  const onPressManageChannel = () => {
    if (!creatorSettingsEnabled) {
      Alert.alert("Manage Channel", "Creator channel settings are currently hidden by app configuration.");
      return;
    }
    router.push("/channel-settings");
  };
  const onPressOwnerScaffold = (surface: "edit-profile" | "monetization" | "creator-controls") => {
    const label = surface === "edit-profile"
      ? "Edit Profile"
      : surface === "monetization"
        ? "Monetization"
        : "Creator Controls";
    Alert.alert(
      label,
      `${label} stays anchored to this owner page. The dedicated depth for this control is queued next without splitting profile/channel truth into a second app surface.`,
    );
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
      : "Open this profile from a room or live session to jump into the linked live surface from here.");
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

    Alert.alert("Watch Party", "Open this profile from a room or live session to jump into the linked watch party from here.");
  };
  const onPressCommunication = async (entryMode: "message" | "voice" | "video" = "message") => {
    if (isSelfProfile) {
      trackEvent("communication_profile_entry_requested", {
        targetRoute: "/chat",
        entryPath: "profile",
        profileIsSelf: "true",
        entryMode,
      });
      router.push("/chat");
      return;
    }

    if (!userId) {
      trackEvent("communication_profile_entry_blocked", {
        entryPath: "profile",
        profileIsSelf: "false",
        reason: "missing_target_user",
      });
      Alert.alert("Chi'lly Chat", "This channel is missing the identity needed to open a direct thread.");
      return;
    }

    try {
      trackEvent("communication_profile_entry_requested", {
        targetRoute: "/chat/[threadId]",
        entryPath: "profile",
        profileIsSelf: "false",
        targetUserId: userId,
        entryMode,
      });

      const thread = await getOrCreateDirectThread({
        userId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        tagline: profile.tagline,
      });

      router.push({
        pathname: "/chat/[threadId]",
        params: {
          threadId: thread.threadId,
          ...(entryMode === "voice" || entryMode === "video" ? { startCall: entryMode } : {}),
        },
      });
    } catch (error) {
      trackEvent("communication_profile_entry_blocked", {
        entryPath: "profile",
        profileIsSelf: "false",
        reason: "thread_open_failed",
        targetUserId: userId,
      });
      reportRuntimeError("profile-open-chilly-chat", error, {
        targetUserId: userId,
      });
      Alert.alert(
        "Chi'lly Chat",
        error instanceof Error ? error.message : "Unable to open Chi'lly Chat right now.",
      );
    }
  };
  const onPressBetaSupport = () => {
    router.push(getSupportRoutePath());
  };
  const quickActions = isSelfProfile
    ? [
        { label: "Edit Profile", onPress: () => onPressOwnerScaffold("edit-profile") },
        { label: "Channel Scope", onPress: onPressManageChannel },
        { label: "Monetization", onPress: () => onPressOwnerScaffold("monetization") },
        { label: "Creator Controls", onPress: () => onPressOwnerScaffold("creator-controls") },
      ]
    : [
        { label: "Open Profile", onPress: () => setActiveProfileView("profile") },
        { label: "Open Channel Home", onPress: () => setActiveProfileView("channel") },
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
        { label: "Voice Call", onPress: () => { void onPressCommunication("voice"); } },
        { label: "Video Call", onPress: () => { void onPressCommunication("video"); } },
      ];

  return (
    <View
      style={styles.outerFlex}
      testID="profile-screen"
      accessibilityLabel="Chi'llywood profile channel screen"
    >
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
          <Text style={styles.kicker}>CHI&apos;LLYWOOD · CHANNEL</Text>
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
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setAvatarQuickActionsOpen((current) => !current)}
              onLongPress={() => setAvatarQuickActionsOpen((current) => !current)}
              delayLongPress={220}
            >
              <View style={styles.avatarCircle}>
                {profile.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitial}>{profile.displayName.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              {profile.isLive ? <View style={styles.avatarLiveDot} /> : null}
            </TouchableOpacity>
          </View>
          <Text style={styles.avatarHint}>Long-press the avatar for quick actions.</Text>
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
          {avatarQuickActionsOpen ? (
            <View style={styles.quickActionsCard}>
              <Text style={styles.quickActionsTitle}>{isSelfProfile ? "Owner Quick Actions" : "Profile Quick Actions"}</Text>
              <View style={styles.quickActionsRow}>
                {quickActions.map((action) => (
                  <TouchableOpacity
                    key={action.label}
                    style={styles.quickActionChip}
                    activeOpacity={0.84}
                    onPress={() => {
                      setAvatarQuickActionsOpen(false);
                      action.onPress();
                    }}
                  >
                    <Text style={styles.quickActionChipText}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
          <View style={[styles.statusPanel, profile.isLive && styles.statusPanelLive]}>
            <Text style={styles.statusPanelKicker}>{profile.isLive ? "LIVE STATUS" : "CHANNEL STATUS"}</Text>
            <Text style={styles.statusPanelTitle}>{liveStatusTitle}</Text>
            <Text style={styles.statusPanelBody}>{liveStatusBody}</Text>
          </View>
          <View style={styles.viewSwitchRow}>
            <TouchableOpacity
              style={[
                styles.viewSwitchChip,
                activeProfileView === (isSelfProfile ? "owner" : "profile") && styles.viewSwitchChipActive,
              ]}
              activeOpacity={0.84}
              onPress={() => setActiveProfileView(isSelfProfile ? "owner" : "profile")}
            >
              <Text
                style={[
                  styles.viewSwitchChipText,
                  activeProfileView === (isSelfProfile ? "owner" : "profile") && styles.viewSwitchChipTextActive,
                ]}
              >
                {isSelfProfile ? "Owner" : "Profile"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewSwitchChip,
                activeProfileView === "channel" && styles.viewSwitchChipActive,
              ]}
              activeOpacity={0.84}
              onPress={() => setActiveProfileView("channel")}
            >
              <Text
                style={[
                  styles.viewSwitchChipText,
                  activeProfileView === "channel" && styles.viewSwitchChipTextActive,
                ]}
              >
                Channel Home
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actionCluster}>
            {showManageChannelAction || canOpenLinkedRoomActions ? (
              <View style={styles.primaryActionRow}>
                {showManageChannelAction ? (
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} activeOpacity={0.86} onPress={onPressManageChannel}>
                    <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Manage Channel</Text>
                  </TouchableOpacity>
                ) : null}
                {canOpenLinkedRoomActions ? (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      profile.isLive ? styles.actionBtnLive : styles.actionBtnConnected,
                    ]}
                    activeOpacity={0.86}
                    onPress={onPressLive}
                  >
                    <Text
                      style={[
                        styles.actionBtnText,
                        profile.isLive ? styles.actionBtnTextLive : styles.actionBtnTextConnected,
                      ]}
                    >
                      {liveActionLabel}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {isSelfProfile || !!userId || canOpenLinkedRoomActions ? (
              <View style={styles.secondaryActionRow}>
                {isSelfProfile || !!userId ? (
                  <TouchableOpacity
                    testID="profile-chilly-chat-button"
                    accessibilityLabel="Open Chi'lly Chat"
                    style={[styles.actionChip, styles.actionChipConnected]}
                    activeOpacity={0.82}
                    onPress={() => {
                      void onPressCommunication("message");
                    }}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
                      Chi'lly Chat
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {isSelfProfile && hasSupportAccess ? (
                  <TouchableOpacity
                    style={[styles.actionChip, styles.actionChipConnected]}
                    activeOpacity={0.82}
                    onPress={onPressBetaSupport}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
                      Support
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {canOpenLinkedRoomActions ? (
                  <TouchableOpacity
                    style={[styles.actionChip, styles.actionChipConnected]}
                    activeOpacity={0.82}
                    onPress={onPressWatchParty}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
                      Watch Party
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.actionFootnote}>{communicationFootnote ? `${communicationFootnote} ${actionFootnote}` : actionFootnote}</Text>
          </View>
        </View>

        <View style={styles.sectionStack}>
          {activeProfileView === "channel" ? contentSections.map((section) => (
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
          )) : null}
          {activeProfileView === "owner" ? ownerSections.map((section) => (
            <View key={section.title} style={styles.sectionCard}>
              <Text style={styles.sectionKicker}>{section.kicker}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
              <TouchableOpacity
                style={[styles.actionChip, styles.ownerActionChip]}
                activeOpacity={0.84}
                onPress={() => {
                  if (section.actionKind === "manage-channel") {
                    onPressManageChannel();
                    return;
                  }
                  onPressOwnerScaffold(section.actionKind);
                }}
              >
                <Text style={[styles.actionChipText, styles.ownerActionChipText]}>{section.actionLabel}</Text>
              </TouchableOpacity>
            </View>
          )) : null}
          {activeProfileView === "profile" ? profileSections.map((section) => (
            <View key={section.title} style={styles.sectionCard}>
              <Text style={styles.sectionKicker}>{section.kicker}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          )) : null}
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
  avatarHint: { color: "#7C879C", fontSize: 11, fontWeight: "700" },
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
  quickActionsCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.2)",
    backgroundColor: "rgba(24,34,58,0.88)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  quickActionsTitle: { color: "#F2F5FD", fontSize: 14, fontWeight: "900" },
  quickActionsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  quickActionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.24)",
    backgroundColor: "rgba(115,134,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  quickActionChipText: { color: "#E0E7FF", fontSize: 12, fontWeight: "800" },
  viewSwitchRow: { flexDirection: "row", gap: 10, width: "100%" },
  viewSwitchChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 9,
    alignItems: "center",
  },
  viewSwitchChipActive: {
    borderColor: "rgba(115,134,255,0.28)",
    backgroundColor: "rgba(115,134,255,0.14)",
  },
  viewSwitchChipText: { color: "#B5BED1", fontSize: 12.5, fontWeight: "800" },
  viewSwitchChipTextActive: { color: "#E4E9FF" },
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
  ownerActionChip: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  ownerActionChipText: { color: "#DDE4FF" },
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
