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
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import { getOfficialPlatformAccount } from "../../_lib/officialAccounts";
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
import { buildUserChannelProfile, readMergedWatchProgress, readMyListIds } from "../../_lib/userData";
import { getSafePartyUserId } from "../../_lib/watchParty";
import { ReportSheet } from "../../components/safety/report-sheet";

type PublicProfileTabKey = "home" | "content" | "live" | "community" | "about";

type ProfileSurfaceCard = {
  title: string;
  kicker: string;
  body: string;
  accent?: "default" | "live" | "official";
};

export default function ProfileScreen() {
  const router = useRouter();
  const { isActive: hasSupportAccess } = useBetaProgram();
  const [currentUserId, setCurrentUserId] = useState("");
  const [creatorSettingsEnabled, setCreatorSettingsEnabled] = useState(DEFAULT_APP_CONFIG.features.creatorSettingsEnabled);
  const [avatarQuickActionsOpen, setAvatarQuickActionsOpen] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [savedTitleCount, setSavedTitleCount] = useState(0);
  const [continueWatchingCount, setContinueWatchingCount] = useState(0);
  const [channelSignalsReady, setChannelSignalsReady] = useState(false);
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
  const officialAccount = getOfficialPlatformAccount(userId);
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

  const requestedSelfProfile = selfParam === "1" || selfParam === "true";
  const isOfficialProfile = profile.identityKind === "official_platform";
  const isSelfProfile = !profile.isProtectedFromClaim
    && (requestedSelfProfile || (!!userId && !!currentUserId && userId === currentUserId));
  useEffect(() => {
    let active = true;

    if (!isSelfProfile) {
      setSavedTitleCount(0);
      setContinueWatchingCount(0);
      setChannelSignalsReady(true);
      return () => {
        active = false;
      };
    }

    setChannelSignalsReady(false);

    Promise.all([readMyListIds(), readMergedWatchProgress()])
      .then(([savedIds, progressMap]) => {
        if (!active) return;
        setSavedTitleCount(savedIds.length);
        setContinueWatchingCount(
          Object.values(progressMap).filter((entry) => (entry?.positionMillis ?? 0) > 0).length,
        );
        setChannelSignalsReady(true);
      })
      .catch(() => {
        if (!active) return;
        setSavedTitleCount(0);
        setContinueWatchingCount(0);
        setChannelSignalsReady(true);
      });

    return () => {
      active = false;
    };
  }, [isSelfProfile]);
  const [activeTab, setActiveTab] = useState<PublicProfileTabKey>("home");
  const roleLabel = isOfficialProfile
    ? profile.platformRoleLabel ?? "Official"
    : profile.role === "creator"
      ? "Creator"
      : profile.role === "host"
        ? "Host"
        : "Viewer";
  const channelLabel = isOfficialProfile
    ? "Official Concierge"
    : isSelfProfile
      ? "Your Channel"
      : profile.role === "creator"
        ? "Creator Channel"
        : profile.role === "host"
          ? "Host Channel"
          : "Channel";
  const channelHandle = useMemo(() => {
    if (profile.handle) return profile.handle;
    const normalizedHandle = profile.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
    if (normalizedHandle) return `@${normalizedHandle}`;
    return isSelfProfile ? "@you" : "@channel";
  }, [isSelfProfile, profile.displayName, profile.handle]);
  const liveActionLabel = profile.isLive ? "Join Live" : "View Live";
  const hasLiveRouteContext = !!partyIdParam;
  const canReportProfile = !isSelfProfile && !!userId;
  const canOpenLinkedRoomActions = hasLiveRouteContext;
  const officialGuidanceTopics = officialAccount?.guidanceTopics ?? [];
  const liveStateLabel = isOfficialProfile ? "CONCIERGE READY" : profile.isLive ? "LIVE NOW" : "OFF AIR";
  const routeContextLabel = isOfficialProfile ? "PROTECTED" : hasLiveRouteContext ? "ROOM LINKED" : "CONTEXT NEEDED";
  const channelHomeBody = isOfficialProfile
    ? officialAccount?.trustSummary
      ?? "This protected profile doubles as Chi'llywood's official channel surface so trusted help, announcements, and future moderation-aware follow-up stay on the canonical route."
    : isSelfProfile
      ? "Your profile is also your public-facing channel home. Owner controls stay here, while Settings and Chi'lly Chat stay separate."
      : "This viewer-facing channel home explains who this person is across live rooms, watch parties, and direct communication without turning into a room or an inbox.";
  const liveStatusTitle = isOfficialProfile
    ? "Official concierge is ready"
    : profile.isLive
      ? "Channel is live now"
      : "Channel is off air";
  const liveStatusBody = isOfficialProfile
    ? "Open Chi'lly Chat for trusted welcome help, account guidance, safety follow-up, and future official updates without leaving the canonical profile and thread routes."
    : hasLiveRouteContext
      ? profile.isLive
        ? "Join Live and Watch Party open from the current room on this profile."
        : "View Live and Watch Party open from the current room on this profile."
      : profile.isLive
        ? "This channel looks live. Open this profile from a room or live session to join from here."
        : "Open this profile from a room or live session to jump into Live or Watch Party from here.";
  const actionFootnote = isOfficialProfile
    ? "Rachi stays on the canonical profile and Chi'lly Chat paths so future help, moderation, and official announcements remain platform-owned and auditable."
    : hasLiveRouteContext
      ? `${liveActionLabel} and Watch Party are connected to this room.`
      : "Open this profile from a room or live session to jump back into linked live and watch-party surfaces from here.";
  const communicationFootnote = isSelfProfile
    ? "Chi'lly Chat opens your native Chi'llywood inbox and direct threads."
    : isOfficialProfile
      ? "Chi'lly Chat opens Rachi's official starter thread for welcome help, platform guidance, and future moderation-aware follow-up."
      : "";

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
      const normalizedError = reportRuntimeError("profile-open-chilly-chat", error, {
        targetUserId: userId,
      });
      Alert.alert(
        "Chi'lly Chat",
        normalizedError.message || "Unable to open Chi'lly Chat right now.",
      );
    }
  };
  const onPressBetaSupport = () => {
    router.push(getSupportRoutePath());
  };
  const onPressSettings = () => {
    router.push("/settings");
  };
  const onPressReportProfile = () => {
    if (!canReportProfile) return;
    trackModerationActionUsed({
      surface: "profile",
      action: "open_safety_report",
      targetType: "participant",
      targetId: userId,
      sourceRoute: `/profile/${userId}`,
      targetAuditOwnerKey: profile.auditOwnerKey ?? null,
      platformOwnedTarget: isOfficialProfile,
    });
    setReportVisible(true);
  };
  const onSubmitProfileReport = async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!canReportProfile) return;
    setReportBusy(true);
    try {
      await submitSafetyReport({
        targetType: "participant",
        targetId: userId,
        category: input.category,
        note: input.note,
        context: buildSafetyReportContext({
          sourceSurface: "profile",
          sourceRoute: `/profile/${userId}`,
          targetLabel: profile.displayName,
          targetRoleLabel: roleLabel,
          targetAuditOwnerKey: profile.auditOwnerKey ?? null,
          platformOwnedTarget: isOfficialProfile,
          context: {
            identityKind: profile.identityKind,
            channelHandle,
          },
        }),
      });
      setReportVisible(false);
    } finally {
      setReportBusy(false);
    }
  };
  const channelSignals = [
    {
      label: isOfficialProfile ? "Identity" : isSelfProfile ? "Saved" : "Role",
      value: isOfficialProfile
        ? "Official"
        : isSelfProfile
          ? (channelSignalsReady ? String(savedTitleCount) : "...")
          : roleLabel,
      body: isOfficialProfile
        ? "platform-owned"
        : isSelfProfile
          ? "titles in your channel orbit"
          : "channel-facing identity",
      tone: isOfficialProfile ? "official" : "default",
    },
    {
      label: isOfficialProfile ? "Chat" : isSelfProfile ? "Resume" : "Chat",
      value: isOfficialProfile
        ? "Starter"
        : isSelfProfile
          ? (channelSignalsReady ? String(continueWatchingCount) : "...")
          : "Ready",
      body: isOfficialProfile
        ? "canonical thread"
        : isSelfProfile
          ? "in-progress cues"
          : "Chi'lly Chat handoff",
      tone: "linked",
    },
    {
      label: "Room",
      value: isOfficialProfile
        ? "Audited"
        : hasLiveRouteContext ? "Linked" : (profile.isLive ? "Live" : "No Link"),
      body: isOfficialProfile
        ? "platform-owned follow-up"
        : hasLiveRouteContext
          ? "real room context attached"
          : profile.isLive
            ? "live state visible"
            : "context unlocks room entry",
      tone: isOfficialProfile ? "official" : hasLiveRouteContext ? "linked" : (profile.isLive ? "live" : "default"),
    },
  ] as const;
  const channelHelper = isOfficialProfile
    ? {
        kicker: "CHANNEL HELPER",
        title: "Keep official help on the canonical route",
        body: `${officialAccount?.trustSummary ?? "Open Chi'lly Chat for trusted help, then return here for the protected official profile and channel identity."} This surface stays official, not social-roleplay and not a separate support app.`,
      }
    : isSelfProfile
      ? {
          kicker: "CHANNEL HELPER",
          title: "Owner controls live here. Messaging does not.",
          body: channelSignalsReady
            ? `Use Owner for channel control, Channel Home for public identity, and Chi'lly Chat for direct conversation. Right now your channel home is anchored by ${savedTitleCount} saved title${savedTitleCount === 1 ? "" : "s"} and ${continueWatchingCount} resume cue${continueWatchingCount === 1 ? "" : "s"}.`
            : "Use Owner for channel control, Channel Home for public identity, and Chi'lly Chat for direct conversation. Loading the current saved and resume signals now."
        }
      : {
          kicker: "CHANNEL HELPER",
          title: "This profile is a channel home, not a settings page",
          body: hasLiveRouteContext
            ? "Use linked room actions only when real room context exists, and use Chi'lly Chat for persistent contact. This page should explain the channel, not replace the room."
            : "Use this page to understand the channel identity first, then move into Chi'lly Chat or a real linked room when that context exists."
        };
  const quickActions = isOfficialProfile
    ? [
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
        ...(canReportProfile ? [{ label: "Report", onPress: onPressReportProfile }] : []),
      ]
    : isSelfProfile
    ? [
        { label: "Manage Channel", onPress: onPressManageChannel },
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
        { label: "Settings", onPress: onPressSettings },
        ...(hasSupportAccess ? [{ label: "Support", onPress: onPressBetaSupport }] : []),
      ]
    : [
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
        { label: "Voice Call", onPress: () => { void onPressCommunication("voice"); } },
        { label: "Video Call", onPress: () => { void onPressCommunication("video"); } },
        ...(canReportProfile ? [{ label: "Report", onPress: onPressReportProfile }] : []),
      ];
  const publicProfileTabs = [
    { key: "home", label: "Home" },
    { key: "content", label: "Content" },
    { key: "live", label: "Live" },
    { key: "community", label: "Community" },
    { key: "about", label: "About" },
  ] as const satisfies ReadonlyArray<{ key: PublicProfileTabKey; label: string }>;
  const featuredSpotlightTitle = isOfficialProfile
    ? "Official Spotlight"
    : isSelfProfile
      ? "Your Channel Spotlight"
      : `${profile.displayName}'s Spotlight`;
  const featuredSpotlightBody = isOfficialProfile
    ? "This protected profile is Chi'llywood's official concierge and announcement surface. Trusted updates stay here and Chi'lly Chat stays the canonical follow-up path."
    : isSelfProfile
      ? "This unified profile now acts as your public channel surface. Use it to frame your identity, what people should watch, and where they should go next."
      : "This unified profile now acts as the public channel surface. It should explain the creator identity first, then guide people into real content, live presence, and Chi'lly Chat.";
  const homeSections: readonly ProfileSurfaceCard[] = [
    {
      title: featuredSpotlightTitle,
      kicker: "FEATURED SPOTLIGHT",
      body: featuredSpotlightBody,
      accent: isOfficialProfile ? "official" : "default",
    },
    {
      title: liveStatusTitle,
      kicker: "LIVE MODULE",
      body: liveStatusBody,
      accent: profile.isLive ? "live" : "default",
    },
    {
      title: isSelfProfile ? "Content Shelves" : "Content Preview",
      kicker: "CONTENT",
      body: isSelfProfile
        ? channelSignalsReady
          ? `Your current public channel foundation can already point to ${savedTitleCount} saved title${savedTitleCount === 1 ? "" : "s"} and ${continueWatchingCount} resume cue${continueWatchingCount === 1 ? "" : "s"} without splitting profile and channel into separate surfaces.`
          : "Loading the current saved and in-progress signals that can anchor your first channel shelves."
        : "This public channel foundation keeps content honest for now: featured shelves, liked/saved activity, or creator programming should grow here without inventing fake uploads.",
    },
    {
      title: "Community Preview",
      kicker: "COMMUNITY",
      body: isOfficialProfile
        ? "Official presence can route people into trusted Chi'lly Chat follow-up, platform notices, and later moderation-aware contact without becoming an inbox-first surface."
        : "Community stays visible here through identity, public activity, and follow-up cues, while persistent messaging still belongs to Chi'lly Chat.",
    },
    {
      title: "About Snapshot",
      kicker: "ABOUT",
      body: `${profile.displayName} should feel like a coherent social identity and channel surface here, even before deeper creator programming or community systems arrive.`,
    },
  ];
  const contentTabSections: readonly ProfileSurfaceCard[] = isOfficialProfile
    ? [
        {
          title: "Official Network",
          kicker: profile.officialBadgeLabel ?? "OFFICIAL",
          body: officialAccount?.trustSummary
            ?? "This channel surface is reserved for Chi'llywood's official welcome guidance, platform notes, and future announcement drops without inventing a separate network page.",
          accent: "official",
        },
        {
          title: "Content Library Behavior",
          kicker: "CONTENT",
          body: "Official content and platform signals can surface here later, but the route stays honest until real drops, featured rows, or official programming are ready.",
        },
        {
          title: "Public Access Boundary",
          kicker: "CURRENT TRUTH",
          body: "This tab should show real official programming and content shelves only when those assets exist. It must not fake a library just to make the surface feel full.",
        },
      ]
    : [
        {
          title: isSelfProfile ? "Programming Surface" : "Channel Library",
          kicker: isSelfProfile ? "OWNER SIGNAL" : "PUBLIC SIGNAL",
          body: isSelfProfile
            ? channelSignalsReady
              ? `Your first public content surface can build from ${savedTitleCount} saved title${savedTitleCount === 1 ? "" : "s"} and ${continueWatchingCount} active resume cue${continueWatchingCount === 1 ? "" : "s"} while deeper creator programming grows later.`
              : "Loading the saved and in-progress title signals that can anchor your first channel content shelves."
            : "This tab should grow into featured rows, liked or saved relationships, and creator programming when those signals are real.",
        },
        {
          title: "Library Behavior",
          kicker: "CONTENT TAB",
          body: "The content tab is the channel library surface. It should prefer real shelves, curated rows, and honest empty states over fake uploads or placeholder catalogs.",
        },
        {
          title: "Current MVP Boundary",
          kicker: "MVP ORDER",
          body: "Public v1 keeps the content surface lightweight and truthful. The route should frame channel content now without pretending the full creator platform already exists.",
        },
      ];
  const liveTabSections: readonly ProfileSurfaceCard[] = [
    {
      title: profile.isLive ? "Live Presence" : "Live Status",
      kicker: "LIVE",
      body: profile.isLive
        ? "This channel currently shows live presence. Use the linked live entry only when real room context is attached to this profile route."
        : "No live room is active right now. This tab should keep Live status clear without pretending the profile is a room.",
      accent: profile.isLive ? "live" : "default",
    },
    {
      title: "Live Watch-Party",
      kicker: "LIVE FLOW",
      body: "Live Watch-Party belongs to Home and Live Room semantics. This tab may point people there, but it must not rename or absorb the live-room flow.",
    },
    {
      title: "Watch-Party Live",
      kicker: "WATCH TOGETHER",
      body: "Watch-Party Live remains the title/player-driven watch-together path. This tab can show continuity into party flow without blurring it into the live label.",
    },
    {
      title: hasLiveRouteContext ? "Linked Room Context" : "Room Continuity",
      kicker: hasLiveRouteContext ? "ACTIVE CONTEXT" : "WHEN AVAILABLE",
      body: hasLiveRouteContext
        ? "This profile was opened with real room context, so live and watch-party entry can hand off to the correct canonical route without drift."
        : "When a profile is opened from a room or live session, this tab should become the clean re-entry point instead of a fake room shell.",
    },
  ];
  const communityTabSections: readonly ProfileSurfaceCard[] = [
    {
      title: "Chi'lly Chat Entry",
      kicker: "COMMUNITY",
      body: isSelfProfile
        ? "Your inbox and direct-thread continuity still live on Chi'lly Chat. Community on this route should support identity and follow-up, not replace the messenger."
        : isOfficialProfile
          ? "Official community follow-up stays on canonical Chi'lly Chat routes so trusted help never turns into a shadow support app."
          : "Community follow-up from this profile should hand off to Chi'lly Chat instead of burying messaging inside the profile surface.",
    },
    {
      title: "Public Activity Boundary",
      kicker: "VISIBILITY",
      body: "Community should grow here through public-safe activity, room follow-up, and creator identity signals when real data exists. It should not invent fake engagement.",
    },
    {
      title: isOfficialProfile ? "Trust And Safety" : "Safety And Follow-Up",
      kicker: "SAFETY",
      body: isOfficialProfile
        ? "Official accounts need protected trust markers, bounded reporting, and auditable follow-up without leaving the canonical profile and Chi'lly Chat architecture."
        : canReportProfile
          ? "This profile already supports reporting when something feels unsafe. Community growth should stay consistent with that safety posture."
          : "Safety hooks stay available when needed, but this community surface should remain identity-first instead of turning into a moderation console.",
    },
  ];
  const aboutTabSections: readonly ProfileSurfaceCard[] = isOfficialProfile
    ? [
        {
          title: "Official Concierge",
          kicker: profile.platformOwnershipLabel ?? "PLATFORM OWNED",
          body: officialAccount?.conciergeHeadline
            ? `${officialAccount.conciergeHeadline} ${profile.displayName} is not a random user-created profile and not a claimable owner page.`
            : `${profile.displayName} is Chi'llywood's official seeded platform account, not a random user-created profile and not a claimable owner page.`,
          accent: "official",
        },
        {
          title: "Canonical Official Identity",
          kicker: "ABOUT",
          body: "This official profile and channel surface stays on the same canonical route as every other profile. Protected official behavior is additive, not a separate app.",
        },
        {
          title: "Starter Path",
          kicker: "CHI'LLY CHAT",
          body: "Open the canonical direct thread to ask how to get started, request official help, and follow future platform announcements without leaving native Chi'lly Chat.",
        },
      ]
    : [
        {
          title: "Profile Snapshot",
          kicker: "ABOUT",
          body: `${profile.displayName} keeps live presence, rooms, and direct communication inside one Chi'llywood identity instead of splitting them across disconnected surfaces.`,
        },
        {
          title: "Channel Boundary",
          kicker: "ROOM RULE",
          body: "This profile explains the person or network behind the rooms. Messaging still belongs to Chi'lly Chat, and live/watch entry only appears when real room context exists.",
        },
        {
          title: isSelfProfile ? "Owner Boundary" : "Identity Boundary",
          kicker: isSelfProfile ? "OWNER MODE LATER" : "PUBLIC SURFACE",
          body: isSelfProfile
            ? "Owner mode stays on this same route, but the shared public profile/channel structure still comes first."
            : "This route should feel like a public channel surface first, not a settings page or an inbox.",
        },
      ];
  const activeTabSections = activeTab === "home"
    ? homeSections
    : activeTab === "content"
      ? contentTabSections
      : activeTab === "live"
        ? liveTabSections
        : activeTab === "community"
          ? communityTabSections
          : aboutTabSections;
  const tabIntro = activeTab === "home"
    ? "Home curates the overview: spotlight, live status, content direction, community preview, and about context."
    : activeTab === "content"
      ? "Content is the library surface for shelves, programming, and honest empty states."
      : activeTab === "live"
        ? "Live keeps live and watch-together paths distinct while preserving the correct room handoffs."
        : activeTab === "community"
          ? "Community supports public follow-up and Chi'lly Chat continuity without turning profile into the inbox."
          : "About keeps durable identity, trust, and channel framing visible even when content depth is still light.";

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
          <Text style={styles.profileEyebrow}>
            {isOfficialProfile ? "OFFICIAL PLATFORM PRESENCE" : isSelfProfile ? "OWNER CHANNEL" : "PUBLIC CHANNEL"}
          </Text>
          <View style={styles.heroBadgeRow}>
            {isOfficialProfile ? (
              <View style={[styles.heroBadge, styles.heroBadgeOfficial]}>
                <Text style={[styles.heroBadgeText, styles.heroBadgeTextOfficial]}>
                  {profile.officialBadgeLabel ?? officialAccount?.officialBadgeLabel ?? "OFFICIAL"}
                </Text>
              </View>
            ) : null}
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
            {isOfficialProfile ? (
              <View style={[styles.metaPill, styles.metaPillOfficial]}>
                <Text style={[styles.metaPillText, styles.metaPillTextOfficial]}>
                  {profile.platformOwnershipLabel ?? officialAccount?.platformOwnershipLabel ?? "PLATFORM OWNED"}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.channelSupportText}>{channelHomeBody}</Text>
          {avatarQuickActionsOpen ? (
            <View style={styles.quickActionsCard}>
              <Text style={styles.quickActionsTitle}>
                {isOfficialProfile ? "Official Quick Actions" : isSelfProfile ? "Owner Quick Actions" : "Channel Quick Actions"}
              </Text>
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
            <Text style={styles.statusPanelKicker}>{isOfficialProfile ? "OFFICIAL STATUS" : profile.isLive ? "LIVE STATUS" : "CHANNEL STATUS"}</Text>
            <Text style={styles.statusPanelTitle}>{liveStatusTitle}</Text>
            <Text style={styles.statusPanelBody}>{liveStatusBody}</Text>
          </View>
          <View style={styles.channelSignalGrid}>
            {channelSignals.map((signal) => (
              <View
                key={signal.label}
                style={[
                  styles.channelSignalCard,
                  signal.tone === "live" && styles.channelSignalCardLive,
                  signal.tone === "linked" && styles.channelSignalCardLinked,
                  signal.tone === "official" && styles.channelSignalCardOfficial,
                ]}
              >
                <Text style={styles.channelSignalLabel}>{signal.label}</Text>
                <Text style={styles.channelSignalValue}>{signal.value}</Text>
                <Text style={styles.channelSignalBody}>{signal.body}</Text>
              </View>
            ))}
          </View>
          <View style={styles.channelGuideCard}>
            <Text style={styles.channelGuideKicker}>{channelHelper.kicker}</Text>
            <Text style={styles.channelGuideTitle}>{channelHelper.title}</Text>
            <Text style={styles.channelGuideBody}>{channelHelper.body}</Text>
            {isOfficialProfile && officialGuidanceTopics.length ? (
              <View style={styles.officialTopicRow}>
                {officialGuidanceTopics.map((topic) => (
                  <View key={topic} style={styles.officialTopicChip}>
                    <Text style={styles.officialTopicChipText}>{topic}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.actionCluster}>
            <View style={styles.primaryActionRow}>
              <TouchableOpacity
                testID="profile-chilly-chat-button"
                accessibilityLabel="Open Chi'lly Chat"
                style={[styles.actionBtn, styles.actionBtnConnected]}
                activeOpacity={0.86}
                onPress={() => {
                  void onPressCommunication("message");
                }}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnTextConnected]}>
                  Chi&apos;lly Chat
                </Text>
              </TouchableOpacity>
              {canOpenLinkedRoomActions ? (
                <>
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
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnConnected]}
                    activeOpacity={0.86}
                    onPress={onPressWatchParty}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnTextConnected]}>
                      Watch Party
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
            {isSelfProfile || !!userId || canOpenLinkedRoomActions ? (
              <View style={styles.secondaryActionRow}>
                {isSelfProfile ? (
                  <TouchableOpacity
                    style={[styles.actionChip, styles.actionChipConnected]}
                    activeOpacity={0.82}
                    onPress={onPressSettings}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
                      Settings
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
                {canReportProfile ? (
                  <TouchableOpacity
                    style={[styles.actionChip, styles.actionChipReport]}
                    activeOpacity={0.82}
                    onPress={onPressReportProfile}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextReport]}>
                      Report
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.actionFootnote}>{communicationFootnote ? `${communicationFootnote} ${actionFootnote}` : actionFootnote}</Text>
          </View>
        </View>

        <View style={styles.sectionStack}>
          <View style={styles.tabStripCard}>
            <Text style={styles.tabStripKicker}>TAB STRIP</Text>
            <View style={styles.tabStripRow}>
              {publicProfileTabs.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tabChip,
                    activeTab === tab.key && styles.tabChipActive,
                  ]}
                  activeOpacity={0.84}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text
                    style={[
                      styles.tabChipText,
                      activeTab === tab.key && styles.tabChipTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.tabIntro}>{tabIntro}</Text>
          </View>
          {activeTabSections.map((section) => (
            <View
              key={section.title}
              style={[
                styles.sectionCard,
                section.accent === "live" && styles.sectionCardLive,
                section.accent === "official" && styles.sectionCardOfficial,
              ]}
            >
              <Text style={styles.sectionKicker}>{section.kicker}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </View>
        <ReportSheet
          visible={reportVisible}
          title={isOfficialProfile ? "Report official account concern" : "Report profile or participant"}
          description={isOfficialProfile
            ? `Send a safety report for ${profile.displayName} if an official platform interaction feels unsafe, misleading, or compromised.`
            : `Send a safety report for ${profile.displayName} if this identity feels abusive, unsafe, or misrepresented.`}
          busy={reportBusy}
          onSubmit={onSubmitProfileReport}
          onClose={() => setReportVisible(false)}
        />
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
  heroBadgeOfficial: {
    borderColor: "rgba(242,194,91,0.38)",
    backgroundColor: "rgba(242,194,91,0.14)",
  },
  heroBadgeLinked: {
    borderColor: "rgba(115,134,255,0.26)",
    backgroundColor: "rgba(115,134,255,0.12)",
  },
  heroBadgeText: { color: "#A8B0C3", fontSize: 10.5, fontWeight: "900", letterSpacing: 0.8 },
  heroBadgeTextLive: { color: "#FFD5DD" },
  heroBadgeTextOfficial: { color: "#FFE6A6" },
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
  metaPillOfficial: {
    borderColor: "rgba(242,194,91,0.34)",
    backgroundColor: "rgba(242,194,91,0.12)",
  },
  metaPillTextOfficial: {
    color: "#FFE6A6",
  },
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
  channelSignalGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  channelSignalCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  channelSignalCardLive: {
    borderColor: "rgba(220,20,60,0.2)",
    backgroundColor: "rgba(50,16,24,0.78)",
  },
  channelSignalCardLinked: {
    borderColor: "rgba(115,134,255,0.22)",
    backgroundColor: "rgba(23,31,52,0.78)",
  },
  channelSignalCardOfficial: {
    borderColor: "rgba(242,194,91,0.28)",
    backgroundColor: "rgba(46,34,18,0.78)",
  },
  channelSignalLabel: { color: "#7E889D", fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
  channelSignalValue: { color: "#F3F5FA", fontSize: 17, fontWeight: "900" },
  channelSignalBody: { color: "#9FA8BA", fontSize: 11, lineHeight: 15, fontWeight: "600" },
  channelGuideCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 5,
  },
  officialTopicRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  officialTopicChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.3)",
    backgroundColor: "rgba(242,194,91,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  officialTopicChipText: {
    color: "#FFE6A6",
    fontSize: 10.5,
    fontWeight: "900",
  },
  channelGuideKicker: { color: "#7A859A", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  channelGuideTitle: { color: "#F4F7FF", fontSize: 15, fontWeight: "900" },
  channelGuideBody: { color: "#A2ABBD", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
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
  tabStripCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 16,
    gap: 12,
  },
  tabStripKicker: { color: "#727C91", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  tabStripRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tabChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  tabChipActive: {
    borderColor: "rgba(115,134,255,0.28)",
    backgroundColor: "rgba(115,134,255,0.14)",
  },
  tabChipText: { color: "#B5BED1", fontSize: 12.5, fontWeight: "800" },
  tabChipTextActive: { color: "#E4E9FF" },
  tabIntro: { color: "#9FA8BA", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
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
  actionChipReport: {
    borderColor: "rgba(220,20,60,0.24)",
    backgroundColor: "rgba(220,20,60,0.12)",
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
  actionChipTextReport: { color: "#FFD6DE" },
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
  sectionCardOfficial: {
    borderColor: "rgba(242,194,91,0.22)",
    backgroundColor: "rgba(28,23,14,0.96)",
  },
  sectionKicker: { color: "#727C91", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  sectionTitle: { color: "#ECECEC", fontSize: 16, fontWeight: "900" },
  sectionBody: { color: "#8B8B8B", fontSize: 13, lineHeight: 18, fontWeight: "600" },
});
