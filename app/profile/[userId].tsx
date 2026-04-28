import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  resolveChannelAccess,
  type ChannelAccessResolution,
} from "../../_lib/accessEntitlements";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveFeatureConfig,
} from "../../_lib/appConfig";
import { trackEvent } from "../../_lib/analytics";
import { getOrCreateDirectThread } from "../../_lib/chat";
import {
  readFriendRelationshipState,
  type FriendRelationshipState,
} from "../../_lib/friendGraph";
import {
  type CreatorEventSummary,
  type CreatorEventType,
} from "../../_lib/liveEvents";
import {
  readPublicEventReminderSummaries,
  setEventReminderEnrollment,
  type EventReminderEnrollment,
  type PublicEventReminderSummary,
} from "../../_lib/notifications";
import { reportRuntimeError } from "../../_lib/logger";
import {
  readCreatorPermissions,
  type CreatorPermissionSet,
} from "../../_lib/monetization";
import {
  readCreatorVideos,
  type CreatorVideo,
} from "../../_lib/creatorVideos";
import { buildCreatorVideoDeepLink, isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import { getOfficialPlatformAccount } from "../../_lib/officialAccounts";
import {
    Alert,
    Image,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import {
  buildUserChannelProfile,
  readUserProfile,
  readUserProfileByUserId,
  type UserProfile,
} from "../../_lib/userData";
import { CreatorVideoCard } from "../../components/creator-media/creator-video-card";
import { getWritablePartyUserId } from "../../_lib/watchParty";
import { ReportSheet } from "../../components/safety/report-sheet";

type PublicProfileTabKey = "home" | "content" | "live" | "community" | "about";

type ProfileSurfaceCard = {
  title: string;
  kicker: string;
  body: string;
  accent?: "default" | "live" | "official";
};

type OwnerStatCard = {
  label: string;
  value: string;
  body: string;
  tone?: "default" | "live" | "linked";
};

type OwnerQuickAction = {
  label: string;
  onPress: () => void;
  emphasis?: "default" | "primary";
};

type OwnerPromptCard = {
  kicker: string;
  title: string;
  body: string;
  actionLabel?: string;
  onPress?: () => void;
};

type ProfileAccessDetail = {
  label: string;
  value: string;
  body: string;
};

const resolveChannelLayoutPreset = (value?: UserProfile["channelLayoutPreset"] | null) => {
  if (value === "live_first" || value === "library_first") {
    return value;
  }
  return "spotlight";
};

const formatChannelRoomAccessValue = (value?: ChannelAccessResolution["watchPartyAccessRule"] | null) => {
  if (value === "party_pass") return "Party Pass";
  if (value === "premium") return "Premium";
  return "Open";
};

const getAccessPostureTitle = (resolution: ChannelAccessResolution | null, isOfficialProfile: boolean) => {
  if (isOfficialProfile || resolution?.reason === "official_access") return "Official Access";
  if (!resolution || resolution.renderState === "loading" || resolution.reason === "missing_channel_context") {
    return "Checking Access";
  }
  if (resolution.classification === "subscriber_access") return "Subscriber Access";
  if (resolution.classification === "private") return "Private Entry";
  if (resolution.classification === "mixed_access") return "Mixed Entry";
  return "Open Channel";
};

const formatPublicActivityVisibilityValue = (value?: UserProfile["publicActivityVisibility"] | null) => {
  switch (value) {
    case "followers_only":
      return "Follower-Led";
    case "subscribers_only":
      return "Subscriber-Led";
    case "private":
      return "Quiet";
    default:
      return "Open";
  }
};

const getPublicActivityVisibilityBody = (value?: UserProfile["publicActivityVisibility"] | null) => {
  switch (value) {
    case "followers_only":
      return "Public activity stays follower-led here, so the channel can feel social without pretending the whole audience sees every signal.";
    case "subscribers_only":
      return "Public activity stays channel-subscriber-led here and remains distinct from account-tier premium access.";
    case "private":
      return "Public activity stays quiet here until the creator opens it up.";
    default:
      return "Public activity can show up openly on this channel.";
  }
};

const formatAudienceSurfaceVisibilityValue = (enabled: boolean) => enabled ? "Active" : "Quiet";

const getAudienceSurfaceVisibilityBody = (surface: "followers" | "subscribers", enabled: boolean) => {
  if (surface === "followers") {
    return enabled
      ? "Follower cues can show up here when that relationship is real."
      : "This channel keeps follower-only cues out of public view right now.";
  }
  return enabled
    ? "Subscriber cues can show up here when the channel relationship is real."
    : "This channel keeps subscriber-only cues out of public view right now.";
};

const formatEventDate = (value?: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "TBD";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toLocaleString();
};

const formatEventTypeLabel = (value: CreatorEventType) => {
  switch (value) {
    case "live_watch_party":
      return "Live Watch-Party";
    case "watch_party_live":
      return "Watch-Party Live";
    default:
      return "Live First";
  }
};

const formatEventStatusLabel = (event: CreatorEventSummary) => {
  if (event.isLiveNow) return "Live Now";
  if (event.isUpcoming) return "Upcoming";
  if (event.replay.isReplayAvailableNow) return "Replay Available";
  if (event.replay.isReplayExpired) return "Replay Expired";
  return event.status.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
};

const formatEventReminderLabel = (event: CreatorEventSummary) => {
  if (event.reminder.state === "ready") return "Reminder Ready";
  if (event.reminder.reason === "missing_start_time") return "Start Time Needed";
  return "Reminder Not Ready";
};

const formatEventReminderEnrollmentLabel = (enrollment: EventReminderEnrollment) => {
  switch (enrollment.state) {
    case "active":
      return "Reminder Saved";
    case "canceled":
      return "Reminder Off";
    case "signed_out":
      return "Sign In To Save";
    case "not_ready":
      return "Reminder Unavailable";
    default:
      return "Reminder Available";
  }
};

const getEventReminderEnrollmentBody = (enrollment: EventReminderEnrollment) => {
  switch (enrollment.state) {
    case "active":
      return "You are enrolled for this backed event reminder. Delivery still depends on later notification infrastructure.";
    case "canceled":
      return "Your reminder enrollment is currently off. You can turn it back on while this event stays reminder-ready.";
    case "signed_out":
      return "Sign in to save a real reminder enrollment for this backed event.";
    case "not_ready":
      return "Reminder enrollment stays unavailable until the event is scheduled and marked reminder-ready.";
    default:
      return "This event is reminder-ready and can accept a real reminder enrollment.";
  }
};

const getProfileAccessBody = (resolution: ChannelAccessResolution | null, isOfficialProfile: boolean) => {
  if (isOfficialProfile || resolution?.reason === "official_access") {
    return "Verified help and official follow-up stay public here.";
  }
  if (!resolution || resolution.renderState === "loading" || resolution.reason === "missing_channel_context") {
    return "Checking the channel's current entry posture.";
  }
  if (resolution.reason === "channel_defaults_subscriber") {
    return "This channel stays public to browse while deeper conversation and watch-party entry can be subscriber-led.";
  }
  if (resolution.reason === "channel_defaults_private") {
    return "This channel stays public to browse while deeper room entry stays invite-led.";
  }
  if (resolution.reason === "channel_defaults_mixed") {
    return "Some entry stays open while member-only moments stay protected.";
  }
  return "Conversation and watch-party entry stay open by default on this channel.";
};

const getWatchPartyAccessBody = (resolution: ChannelAccessResolution | null, ready: boolean) => {
  if (!ready || !resolution) return "checking watch-party entry";
  if (resolution.joinPolicy === "locked") return "invite-led room entry by default";
  if (resolution.watchPartyAccessRule === "party_pass") return "Party Pass room entry by default";
  if (resolution.watchPartyAccessRule === "premium") return "Premium room entry by default";
  return "open room entry by default";
};

const getCommunicationAccessBody = (resolution: ChannelAccessResolution | null, ready: boolean) => {
  if (!ready || !resolution) return "checking communication-room posture";
  if (resolution.communicationAccessRule === "party_pass") return "linked communication rooms can stay Party Pass-led by default";
  if (resolution.communicationAccessRule === "premium") return "linked communication rooms can stay Premium-led by default";
  return "linked communication rooms stay open by default";
};

const getBrowseAccessValue = (resolution: ChannelAccessResolution | null, isOfficialProfile: boolean) => {
  if (isOfficialProfile || resolution?.reason === "official_access") return "Verified";
  if (!resolution || resolution.renderState === "loading" || resolution.reason === "missing_channel_context") {
    return "Loading";
  }
  return resolution.previewMode === "teaser" ? "Preview" : "Open";
};

const getBrowseAccessBody = (resolution: ChannelAccessResolution | null, isOfficialProfile: boolean) => {
  if (isOfficialProfile || resolution?.reason === "official_access") {
    return "verified platform-owned public identity";
  }
  if (!resolution || resolution.renderState === "loading" || resolution.reason === "missing_channel_context") {
    return "checking public channel posture";
  }
  if (resolution.reason === "channel_defaults_subscriber") {
    return "the channel stays visible while member access protects deeper entry";
  }
  if (resolution.reason === "channel_defaults_private") {
    return "the channel stays visible even when room entry is invite-led";
  }
  if (resolution.reason === "channel_defaults_mixed") {
    return "the channel stays visible while access changes by surface";
  }
  return "the full channel story stays open to browse";
};

export default function ProfileScreen() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState("");
  const [friendState, setFriendState] = useState<FriendRelationshipState | null>(null);
  const [creatorSettingsEnabled, setCreatorSettingsEnabled] = useState(DEFAULT_APP_CONFIG.features.creatorSettingsEnabled);
  const [avatarQuickActionsOpen, setAvatarQuickActionsOpen] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [creatorVideos, setCreatorVideos] = useState<CreatorVideo[]>([]);
  const [creatorVideosReady, setCreatorVideosReady] = useState(false);
  const [channelAccessProfile, setChannelAccessProfile] = useState<UserProfile | null>(null);
  const [channelAccessPermissions, setChannelAccessPermissions] = useState<CreatorPermissionSet | null>(null);
  const [channelAccessReady, setChannelAccessReady] = useState(false);
  const [channelAccessResolution, setChannelAccessResolution] = useState<ChannelAccessResolution | null>(null);
  const [publicEvents, setPublicEvents] = useState<CreatorEventSummary[]>([]);
  const [publicReminderSummaries, setPublicReminderSummaries] = useState<PublicEventReminderSummary[]>([]);
  const [publicEventsReady, setPublicEventsReady] = useState(false);
  const [reminderActionLoading, setReminderActionLoading] = useState<string | null>(null);
  const [reminderActionNotice, setReminderActionNotice] = useState<string | null>(null);
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
    getWritablePartyUserId()
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

    setPublicEventsReady(false);

    if (!userId) {
      setPublicEvents([]);
      setPublicReminderSummaries([]);
      setPublicEventsReady(true);
      return () => {
        active = false;
      };
    }

    void readPublicEventReminderSummaries(userId, currentUserId || undefined)
      .then((summaries) => {
        if (!active) return;
        setPublicReminderSummaries(summaries);
        setPublicEvents(summaries.map((summary) => summary.event));
        setPublicEventsReady(true);
      })
      .catch(() => {
        if (!active) return;
        setPublicEvents([]);
        setPublicReminderSummaries([]);
        setPublicEventsReady(true);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, userId]);

  useEffect(() => {
    let active = true;

    readAppConfig()
      .then((config) => {
        if (!active) return;
        setCreatorSettingsEnabled(resolveFeatureConfig(config).creatorSettingsEnabled);
      })
      .catch(() => {
        if (!active) return;
        setCreatorSettingsEnabled(DEFAULT_APP_CONFIG.features.creatorSettingsEnabled);
      });

    return () => {
      active = false;
    };
  }, []);

  const requestedSelfProfile = selfParam === "1" || selfParam === "true";
  const isOfficialProfile = profile.identityKind === "official_platform";
  const hasVerifiedSelfIdentity = !!userId && !!currentUserId && userId === currentUserId;
  const isSelfProfile = !profile.isProtectedFromClaim
    && hasVerifiedSelfIdentity
    && (!requestedSelfProfile || hasVerifiedSelfIdentity);

  useEffect(() => {
    let active = true;

    setCreatorVideosReady(false);

    if (isOfficialProfile || !userId) {
      setCreatorVideos([]);
      setCreatorVideosReady(true);
      return () => {
        active = false;
      };
    }

    void readCreatorVideos(userId, { includeDrafts: isSelfProfile, limit: 24 })
      .then((videos) => {
        if (!active) return;
        setCreatorVideos(videos);
        setCreatorVideosReady(true);
      })
      .catch(() => {
        if (!active) return;
        setCreatorVideos([]);
        setCreatorVideosReady(true);
      });

    return () => {
      active = false;
    };
  }, [isOfficialProfile, isSelfProfile, userId]);

  const shareCreatorVideo = async (video: CreatorVideo) => {
    if (!isCreatorVideoPubliclyShareable(video)) {
      Alert.alert("Share unavailable", "Only public creator videos can be shared outside this channel.");
      return;
    }

    const link = buildCreatorVideoDeepLink(video.id);
    try {
      await Share.share({
        message: `Watch ${video.title} on Chi'llywood: ${link}`,
      });
    } catch {
      Alert.alert("Share unavailable", "Unable to open the share sheet right now.");
    }
  };

  useEffect(() => {
    let active = true;

    if (isOfficialProfile || !userId) {
      setChannelAccessProfile(null);
      setChannelAccessPermissions(null);
      setChannelAccessReady(true);
      return () => {
        active = false;
      };
    }

    setChannelAccessReady(false);

    Promise.all([
      isSelfProfile
        ? readUserProfile().catch(() => null)
        : readUserProfileByUserId(userId).catch(() => null),
      readCreatorPermissions(userId).catch(() => null),
    ])
      .then(([resolvedProfile, resolvedPermissions]) => {
        if (!active) return;
        setChannelAccessProfile(resolvedProfile);
        setChannelAccessPermissions(resolvedPermissions);
        setChannelAccessReady(true);
      })
      .catch(() => {
        if (!active) return;
        setChannelAccessProfile(null);
        setChannelAccessPermissions(null);
        setChannelAccessReady(true);
      });

    return () => {
      active = false;
    };
  }, [isOfficialProfile, isSelfProfile, userId]);
  useEffect(() => {
    let active = true;

    if (isOfficialProfile) {
      void resolveChannelAccess({ channelUserId: userId, isOfficial: true })
        .then((resolution) => {
          if (active) setChannelAccessResolution(resolution);
        })
        .catch(() => {
          if (active) setChannelAccessResolution(null);
        });

      return () => {
        active = false;
      };
    }

    if (!userId || !channelAccessReady) {
      setChannelAccessResolution(null);
      return () => {
        active = false;
      };
    }

    void resolveChannelAccess({
      channelUserId: userId,
      profile: channelAccessProfile,
      creatorPermissions: channelAccessPermissions,
    })
      .then((resolution) => {
        if (active) setChannelAccessResolution(resolution);
      })
      .catch(() => {
        if (active) setChannelAccessResolution(null);
      });

    return () => {
      active = false;
    };
  }, [channelAccessPermissions, channelAccessProfile, channelAccessReady, isOfficialProfile, userId]);
  useEffect(() => {
    let active = true;

    if (!userId || isOfficialProfile || isSelfProfile) {
      setFriendState(null);
      return () => {
        active = false;
      };
    }

    readFriendRelationshipState(userId)
      .then((nextState) => {
        if (active) setFriendState(nextState);
      })
      .catch(() => {
        if (active) setFriendState(null);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, isOfficialProfile, isSelfProfile, userId]);
  const [activeTab, setActiveTab] = useState<PublicProfileTabKey>("home");
  const liveNowEvent = useMemo(
    () => publicEvents.find((event) => event.isLiveNow) ?? null,
    [publicEvents],
  );
  const nextUpcomingEvent = useMemo(
    () => publicEvents.find((event) => event.isUpcoming) ?? null,
    [publicEvents],
  );
  const scheduledWatchPartyEvent = useMemo(
    () => publicEvents.find((event) => event.eventType === "watch_party_live" && !!event.linkedTitleId) ?? null,
    [publicEvents],
  );
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
  const profileEyebrow = isOfficialProfile
    ? "OFFICIAL CHANNEL"
    : isSelfProfile
      ? profile.role === "host"
        ? "YOUR HOST CHANNEL"
        : "YOUR CREATOR CHANNEL"
      : profile.role === "creator"
        ? "CREATOR CHANNEL"
        : profile.role === "host"
          ? "HOST CHANNEL"
          : "PUBLIC CHANNEL";
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
  const hasLiveTabEntry = !hasLiveRouteContext && (!!liveNowEvent || !!nextUpcomingEvent || profile.isLive);
  const scheduledWatchPartyTitleId = String(scheduledWatchPartyEvent?.linkedTitleId ?? "").trim();
  const canOpenWatchPartyEntry = hasLiveRouteContext || !!scheduledWatchPartyTitleId;
  const liveActionTitle = hasLiveRouteContext ? liveActionLabel : "Live Events";
  const officialGuidanceTopics = officialAccount?.guidanceTopics ?? [];
  const liveStateLabel = isOfficialProfile ? "CONCIERGE READY" : profile.isLive ? "LIVE NOW" : "OFF AIR";
  const routeContextLabel = isOfficialProfile ? "PROTECTED" : hasLiveRouteContext ? "ROOM LINKED" : "CONTEXT NEEDED";
  const channelHomeBody = isOfficialProfile
    ? officialAccount?.trustSummary
      ?? "Chi'llywood's official channel for trusted help, updates, and auditable follow-up."
    : isSelfProfile
      ? "Your public channel home for your uploaded videos, creator events, live presence, and next follow-up."
      : "A public creator channel where identity, creator videos, live presence, and real follow-up stay easy to read.";
  const liveStatusTitle = isOfficialProfile
    ? "Official concierge is ready"
    : profile.isLive
      ? "Channel is live now"
      : "Channel is off air";
  const liveStatusBody = isOfficialProfile
    ? "Open Chi'lly Chat for trusted help, then return here for the official channel view."
    : hasLiveRouteContext
      ? profile.isLive
        ? "Live and watch-party entry both hand back into the linked room."
        : "Room context is attached, so live and watch-party entry stay pointed at the linked room."
      : hasLiveTabEntry
        ? "Use the Live tab for the current schedule and backed events."
        : "No room context is attached yet, but this channel's live posture still stays visible.";
  const actionFootnote = isOfficialProfile
    ? "Trusted help stays on the canonical profile and Chi'lly Chat paths."
    : hasLiveRouteContext
      ? `${liveActionLabel} and Watch Party stay tied to this room context.`
      : canOpenWatchPartyEntry
        ? "This channel can hand off into a backed Watch-Party Live event."
        : hasLiveTabEntry
          ? "Live status stays visible here even without direct room re-entry."
          : "This channel stays public-first until room context is attached.";
  const communicationFootnote = isSelfProfile
    ? "Chi'lly Chat opens your inbox and direct threads."
    : isOfficialProfile
      ? "Chi'lly Chat opens Rachi's official starter thread."
      : "";
  const showFriendshipHint = !!friendState?.isFriend && !isOfficialProfile && !isSelfProfile;

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

    setActiveTab("live");
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

    if (!scheduledWatchPartyTitleId) return;

    router.push({
      pathname: "/watch-party",
      params: {
        titleId: scheduledWatchPartyTitleId,
      },
    });
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
      const isChatAuthFailure = error instanceof Error
        && error.message === "Chi'lly Chat requires a signed-in user.";
      trackEvent("communication_profile_entry_blocked", {
        entryPath: "profile",
        profileIsSelf: "false",
        reason: isChatAuthFailure ? "auth_required" : "thread_open_failed",
        targetUserId: userId,
      });
      const normalizedError = reportRuntimeError("profile-open-chilly-chat", error, {
        targetUserId: userId,
      });
      Alert.alert(
        "Chi'lly Chat",
        isChatAuthFailure
          ? "Sign in to open Chi'lly Chat from public channels."
          : (normalizedError.message || "Unable to open Chi'lly Chat right now."),
      );
    }
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
  const publicCreatorVideoCount = creatorVideos.filter((video) => video.visibility === "public").length;
  const draftCreatorVideoCount = creatorVideos.filter((video) => video.visibility === "draft").length;
  const hasCreatorVideoTruth = creatorVideos.length > 0;
  const publicEventCount = publicEvents.length;
  const liveEventCount = publicEvents.filter((event) => event.isLiveNow).length;
  const channelSignals = [
    {
      label: isOfficialProfile ? "Identity" : isSelfProfile ? "Videos" : "Role",
      value: isOfficialProfile
        ? "Official"
        : isSelfProfile
          ? (creatorVideosReady ? String(creatorVideos.length) : "...")
          : roleLabel,
      body: isOfficialProfile
        ? "platform-backed identity"
        : isSelfProfile
          ? "uploaded creator videos"
          : "creator-led public surface",
      tone: isOfficialProfile ? "official" : "default",
    },
    {
      label: isOfficialProfile ? "Chat" : isSelfProfile ? "Public" : "Chat",
      value: isOfficialProfile
        ? "Starter"
        : isSelfProfile
          ? (creatorVideosReady ? String(publicCreatorVideoCount) : "...")
          : "Ready",
      body: isOfficialProfile
        ? "trusted thread open"
        : isSelfProfile
          ? "published videos visitors can watch"
          : "direct thread ready",
      tone: "linked",
    },
    {
      label: isOfficialProfile ? "Trust" : "Events",
      value: isOfficialProfile
        ? "Audited"
        : publicEventsReady ? String(publicEventCount) : "...",
      body: isOfficialProfile
        ? "protected official continuity"
        : liveEventCount
          ? "live creator event active now"
          : "creator live/watch-party schedule",
      tone: isOfficialProfile ? "official" : liveEventCount ? "live" : "default",
    },
  ] as const;
  const channelHelper = isOfficialProfile
    ? {
        kicker: "CHANNEL FLOW",
        title: "Verified help starts here",
        body: "Use the official thread for trusted help, then return here for the verified account surface.",
      }
    : isSelfProfile
      ? {
          kicker: "CHANNEL FLOW",
          title: "Lead with your own channel content",
          body: creatorVideosReady
            ? hasCreatorVideoTruth
              ? `Your channel has ${creatorVideos.length} uploaded video${creatorVideos.length === 1 ? "" : "s"}; public videos appear here for visitors and drafts stay owner-only.`
              : "Upload your first video when you are ready for this Channel to become watchable."
            : "Loading your creator-video library."
        }
      : {
          kicker: "CHANNEL FLOW",
          title: "Start with the creator channel, then go deeper",
          body: hasLiveRouteContext
            ? "This visit carries real room context, so live and watch-party handoff stays clean from here."
            : "Start here for the creator's videos, events, and public identity, then move into Chi'lly Chat or a backed room when one exists."
        };
  const contentHomeBody = isSelfProfile
    ? creatorVideosReady
      ? hasCreatorVideoTruth
        ? `Your channel has ${publicCreatorVideoCount} public video${publicCreatorVideoCount === 1 ? "" : "s"} and ${draftCreatorVideoCount} draft${draftCreatorVideoCount === 1 ? "" : "s"}.`
        : "Upload your first video when you are ready to make this channel watchable."
      : "Loading your channel library."
    : isOfficialProfile
      ? "Official account updates and trusted help stay here; Chi'llywood Originals stay in Home, Explore, and title pages."
    : creatorVideosReady
      ? hasCreatorVideoTruth
        ? `${publicCreatorVideoCount} creator video${publicCreatorVideoCount === 1 ? "" : "s"} already give this channel a real library.`
        : "This channel is getting ready."
      : "Loading this channel's creator videos.";
  const contentCreatorVideosBody = isSelfProfile
    ? creatorVideosReady
      ? hasCreatorVideoTruth
        ? "Manage uploaded videos in Channel Settings. Public videos appear here for visitors while drafts stay owner-only."
        : "Upload your first video from Manage Channel."
      : "Loading your creator-video library."
    : isOfficialProfile
      ? "This official account does not host Chi'llywood Originals inside Profile/Channel."
      : creatorVideosReady && hasCreatorVideoTruth
        ? `${publicCreatorVideoCount} creator-uploaded video${publicCreatorVideoCount === 1 ? "" : "s"} are ready to watch.`
        : "This channel is getting ready.";
  const contentCreatorEventsBody = isOfficialProfile
    ? "Official platform programming stays in Home, Explore, dedicated Originals surfaces, title pages, and admin-managed title routes."
    : publicEventsReady
      ? publicEventCount
        ? `${publicEventCount} public creator event${publicEventCount === 1 ? "" : "s"} can appear here when scheduled or live.`
        : "No public creator live or watch-party events are scheduled yet."
      : "Loading this channel's creator events.";
  const quickActions = isOfficialProfile
    ? [
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
        ...(canReportProfile ? [{ label: "Report", onPress: onPressReportProfile }] : []),
      ]
    : isSelfProfile
    ? [
        { label: "Manage Channel", onPress: onPressManageChannel },
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
      ]
    : [
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
        { label: "Voice Call", onPress: () => { void onPressCommunication("voice"); } },
        { label: "Video Call", onPress: () => { void onPressCommunication("video"); } },
        ...(canReportProfile ? [{ label: "Report", onPress: onPressReportProfile }] : []),
      ];
  const communityActions = isSelfProfile
    ? [
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
      ]
    : isOfficialProfile
      ? [
          { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
          ...(canReportProfile ? [{ label: "Report", onPress: onPressReportProfile }] : []),
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
  ] as const satisfies readonly { key: PublicProfileTabKey; label: string }[];
  const featuredSpotlightTitle = isOfficialProfile
    ? "Official Spotlight"
    : isSelfProfile
      ? "Your Channel Spotlight"
      : `${profile.displayName}'s Spotlight`;
  const featuredSpotlightBody = isOfficialProfile
    ? "Verified updates and trusted follow-up start here; platform titles stay in platform surfaces."
    : isSelfProfile
      ? "Lead with your uploaded videos, live events, or the creator cue that best defines your channel right now."
      : "Start here for the creator spotlight, live pulse, and next real creator-video or chat move.";
  const channelLayoutPreset = resolveChannelLayoutPreset(channelAccessProfile?.channelLayoutPreset);
  const homeSectionMap = {
    featured: {
      title: featuredSpotlightTitle,
      kicker: "SPOTLIGHT",
      body: featuredSpotlightBody,
      accent: isOfficialProfile ? "official" : "default",
    },
    live: {
      title: liveStatusTitle,
      kicker: "LIVE",
      body: liveStatusBody,
      accent: profile.isLive ? "live" : "default",
    },
    content: {
      title: isSelfProfile ? "Your Creator Content" : "Creator Content",
      kicker: "CHANNEL CONTENT",
      body: contentHomeBody,
    },
    community: {
      title: "Community Pulse",
      kicker: "COMMUNITY",
      body: isOfficialProfile
        ? "Trusted follow-up stays visible here while direct conversation stays in Chi'lly Chat."
        : "Public follow-up stays visible here while direct conversation stays in Chi'lly Chat.",
    },
    about: {
      title: "Channel Identity",
      kicker: "ABOUT",
      body: `${profile.displayName} should feel like a coherent public channel even before deeper creator shelves arrive.`,
    },
  } satisfies Record<"featured" | "live" | "content" | "community" | "about", ProfileSurfaceCard>;
  const homeSectionOrder = channelLayoutPreset === "live_first"
    ? (["live", "featured", "content", "community", "about"] as const)
    : channelLayoutPreset === "library_first"
      ? (["content", "featured", "live", "community", "about"] as const)
      : (["featured", "live", "content", "community", "about"] as const);
  const homeSections: readonly ProfileSurfaceCard[] = homeSectionOrder.map((key) => homeSectionMap[key]);
  const contentTabSections: readonly ProfileSurfaceCard[] = isOfficialProfile
    ? [
        {
          title: "Official Channel",
          kicker: profile.officialBadgeLabel ?? "OFFICIAL",
          body: contentCreatorVideosBody,
          accent: "official",
        },
        {
          title: "Platform Surface Boundary",
          kicker: "PLATFORM SURFACES",
          body: contentCreatorEventsBody,
        },
      ]
    : [
        {
          title: isSelfProfile ? "Your Creator Videos" : "Creator Videos",
          kicker: isSelfProfile ? "YOUR CHANNEL" : "PUBLIC CHANNEL",
          body: contentCreatorVideosBody,
        },
        {
          title: "Creator Events",
          kicker: "LIVE / WATCH-PARTY",
          body: contentCreatorEventsBody,
        },
      ];
  const liveNowEvents = useMemo(
    () => publicEvents.filter((event) => event.isLiveNow),
    [publicEvents],
  );
  const upcomingEvents = useMemo(
    () => publicEvents.filter((event) => event.isUpcoming),
    [publicEvents],
  );
  const replayReadyEvents = useMemo(
    () => publicEvents.filter((event) => event.replay.isReplayAvailableNow),
    [publicEvents],
  );
  const replayExpiredEvents = useMemo(
    () => publicEvents.filter((event) => event.replay.isReplayExpired),
    [publicEvents],
  );
  const reminderReadyEvents = useMemo(
    () => publicEvents.filter((event) => event.reminder.state === "ready"),
    [publicEvents],
  );
  const publicReminderSummaryByEventId = useMemo(
    () => new Map(publicReminderSummaries.map((summary) => [summary.event.id, summary])),
    [publicReminderSummaries],
  );
  const liveTabSections: readonly ProfileSurfaceCard[] = [
    {
      title: profile.isLive ? "Live Presence" : "Live Status",
      kicker: "LIVE",
      body: liveNowEvent
        ? `${liveNowEvent.eventTitle} is live here now as ${formatEventTypeLabel(liveNowEvent.eventType)}.`
        : profile.isLive
          ? "This channel is showing live presence. Room re-entry appears only when real room context is attached."
          : "No live room is active right now. This tab keeps live status clear without pretending the profile is the room.",
      accent: profile.isLive ? "live" : "default",
    },
    {
      title: nextUpcomingEvent ? formatEventTypeLabel(nextUpcomingEvent.eventType) : "Live Watch-Party",
      kicker: "LIVE FLOW",
      body: nextUpcomingEvent
        ? `${nextUpcomingEvent.eventTitle} is the next backed public event at ${formatEventDate(nextUpcomingEvent.startsAt)}.`
        : "This tab can point people toward Live Watch-Party without absorbing the live-room flow.",
    },
    {
      title: scheduledWatchPartyEvent ? "Watch-Party Live Scheduled" : "Watch-Party Live",
      kicker: "WATCH TOGETHER",
      body: scheduledWatchPartyEvent
        ? `${scheduledWatchPartyEvent.eventTitle} is scheduled for ${formatEventDate(scheduledWatchPartyEvent.startsAt)} and links out to the canonical Watch-Party Live entry.`
        : "Watch-Party Live stays on the canonical watch-together path.",
    },
    {
      title: hasLiveRouteContext ? "Linked Room Context" : "Room Continuity",
      kicker: hasLiveRouteContext ? "ACTIVE CONTEXT" : "WHEN AVAILABLE",
      body: hasLiveRouteContext
        ? "Real room context is attached, so live and watch-party entry can hand off to the correct canonical route."
        : "When a profile is opened from a room or live session, this tab should become the clean re-entry point instead of a fake room shell.",
    },
  ];
  const publicAudienceVisibilitySections: readonly ProfileSurfaceCard[] = useMemo(() => {
    if (isOfficialProfile) return [];

    const sections: ProfileSurfaceCard[] = [];
    const publicActivityVisibility = channelAccessProfile?.publicActivityVisibility;
    const followerSurfaceEnabled = channelAccessProfile?.followerSurfaceEnabled;
    const subscriberSurfaceEnabled = channelAccessProfile?.subscriberSurfaceEnabled;

    if (publicActivityVisibility) {
      sections.push({
        title: "Audience Activity",
        kicker: "PUBLIC ACTIVITY",
        body: `${formatPublicActivityVisibilityValue(publicActivityVisibility)}. ${getPublicActivityVisibilityBody(publicActivityVisibility)}`,
      });
    }

    if (typeof followerSurfaceEnabled === "boolean") {
      sections.push({
        title: "Follower Circle",
        kicker: "FOLLOWERS",
        body: `${formatAudienceSurfaceVisibilityValue(followerSurfaceEnabled)}. ${getAudienceSurfaceVisibilityBody("followers", followerSurfaceEnabled)}`,
      });
    }

    if (typeof subscriberSurfaceEnabled === "boolean") {
      sections.push({
        title: "Subscriber Circle",
        kicker: "SUBSCRIBERS",
        body: `${formatAudienceSurfaceVisibilityValue(subscriberSurfaceEnabled)}. ${getAudienceSurfaceVisibilityBody("subscribers", subscriberSurfaceEnabled)}`,
      });
    }

    return sections;
  }, [
    channelAccessProfile?.followerSurfaceEnabled,
    channelAccessProfile?.publicActivityVisibility,
    channelAccessProfile?.subscriberSurfaceEnabled,
    isOfficialProfile,
  ]);
  const audiencePostureBody = useMemo(() => {
    if (isOfficialProfile) return "";

    const publicActivityVisibility = channelAccessProfile?.publicActivityVisibility;
    const followerSurfaceEnabled = channelAccessProfile?.followerSurfaceEnabled;
    const subscriberSurfaceEnabled = channelAccessProfile?.subscriberSurfaceEnabled;
    const postureLead = publicActivityVisibility === "followers_only"
      ? "Community activity stays follower-led on this channel."
      : publicActivityVisibility === "subscribers_only"
        ? "Community activity stays subscriber-led on this channel."
        : publicActivityVisibility === "private"
          ? "Community activity stays quiet on the public route for now."
          : "Community activity can stay open on this channel.";
    const followerCue = followerSurfaceEnabled
      ? "Follower cues can appear when that relationship is real."
      : "Follower cues stay quiet on the public route.";
    const subscriberCue = subscriberSurfaceEnabled
      ? "Subscriber cues can appear when that relationship is real."
      : "Subscriber cues stay quiet on the public route.";
    return `${postureLead} ${followerCue} ${subscriberCue}`;
  }, [
    channelAccessProfile?.followerSurfaceEnabled,
    channelAccessProfile?.publicActivityVisibility,
    channelAccessProfile?.subscriberSurfaceEnabled,
    isOfficialProfile,
  ]);
  const communityTabSections: readonly ProfileSurfaceCard[] = [
    ...(!isOfficialProfile ? [{
      title: "Audience Posture",
      kicker: "AUDIENCE",
      body: audiencePostureBody,
    }] : []),
    {
      title: "Conversation",
      kicker: "CHI'LLY CHAT",
      body: isSelfProfile
        ? "Keep direct follow-up in Chi'lly Chat so this route can stay public-facing."
        : isOfficialProfile
          ? "Official follow-up stays in canonical Chi'lly Chat so trusted help never turns into a shadow support app."
          : "Direct follow-up from this channel should move into Chi'lly Chat, not hide inside the profile.",
    },
    {
      title: isOfficialProfile ? "Trust And Safety" : "Public Trust",
      kicker: isOfficialProfile ? "SAFETY" : "COMMUNITY",
      body: isOfficialProfile
        ? "Official accounts need protected trust markers, bounded reporting, and auditable follow-up."
        : canReportProfile
          ? "Reporting is already available here, so audience posture and community trust can grow from a real safety floor."
          : "Keep this channel identity-first, socially readable, and ready for real public activity when it exists.",
    },
    ...publicAudienceVisibilitySections,
  ];
  const aboutTabSections: readonly ProfileSurfaceCard[] = isOfficialProfile
    ? [
        {
          title: "Official Identity",
          kicker: profile.platformOwnershipLabel ?? "PLATFORM OWNED",
          body: officialAccount?.conciergeHeadline
            ? `${officialAccount.conciergeHeadline} ${profile.displayName} is Chi'llywood's verified public account.`
            : `${profile.displayName} is Chi'llywood's verified public account, not a claimable owner page.`,
          accent: "official",
        },
        {
          title: "Channel Read",
          kicker: "ABOUT",
          body: "Verified access, trusted follow-up, and official channel posture stay clear on this canonical route.",
        },
        {
          title: "Starter Thread",
          kicker: "CHI'LLY CHAT",
          body: "Open the canonical direct thread for official help, onboarding questions, and future platform follow-up.",
        },
      ]
    : [
        {
          title: "Channel Identity",
          kicker: "ABOUT",
          body: `${profile.displayName} keeps live presence, access posture, and direct follow-up inside one Chi'llywood identity.`,
        },
        {
          title: "Channel Read",
          kicker: "CHANNEL",
          body: isSelfProfile
            ? "Keep this surface public-facing first. Manage Channel stays the deeper editing handoff while access and audience posture stay easy to read here."
            : "This route stays a public channel destination where access posture, audience cues, and follow-up stay easy to read.",
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
  const publicEventSummaryCards: readonly OwnerStatCard[] = [
    {
      label: "Live Now",
      value: String(liveNowEvents.length),
      body: liveNowEvents.length
        ? liveNowEvents.map((event) => event.eventTitle).slice(0, 2).join(" · ")
        : "no public creator event is live now",
      tone: liveNowEvents.length ? "live" : "default",
    },
    {
      label: "Upcoming",
      value: String(upcomingEvents.length),
      body: nextUpcomingEvent
        ? `next: ${nextUpcomingEvent.eventTitle}`
        : "no upcoming public event yet",
      tone: upcomingEvents.length ? "linked" : "default",
    },
    {
      label: "Replay",
      value: String(replayReadyEvents.length),
      body: replayReadyEvents.length
        ? replayReadyEvents.map((event) => event.eventTitle).slice(0, 2).join(" · ")
        : replayExpiredEvents.length
          ? `${replayExpiredEvents.length} replay window${replayExpiredEvents.length === 1 ? "" : "s"} expired`
          : "no public replay currently available",
    },
    {
      label: "Reminders",
      value: String(reminderReadyEvents.length),
      body: reminderReadyEvents.length
        ? "reminder-ready public schedule is backed"
        : "no reminder-ready public event yet",
      tone: reminderReadyEvents.length ? "linked" : "default",
    },
  ];
  const tabIntro = activeTab === "home"
    ? "Spotlight, live pulse, creator content, and community cues in one channel home."
    : activeTab === "content"
      ? "Creator uploads and events that belong to this channel."
      : activeTab === "live"
        ? "Live keeps schedule, current status, and watch-together continuity distinct."
        : activeTab === "community"
          ? "Audience posture, follow-up, and trust signals without turning this route into the inbox."
          : "Identity, access posture, and trust at a glance.";
  const loadPublicReminderEvents = async () => {
    if (!userId) {
      setPublicEvents([]);
      setPublicReminderSummaries([]);
      setPublicEventsReady(true);
      return;
    }

    setPublicEventsReady(false);
    try {
      const summaries = await readPublicEventReminderSummaries(userId, currentUserId || undefined);
      setPublicReminderSummaries(summaries);
      setPublicEvents(summaries.map((summary) => summary.event));
    } finally {
      setPublicEventsReady(true);
    }
  };

  const onToggleReminderEnrollment = async (eventId: string, enabled: boolean) => {
    try {
      setReminderActionLoading(eventId);
      setReminderActionNotice(null);
      const result = await setEventReminderEnrollment(eventId, enabled, currentUserId || undefined);
      setReminderActionNotice(result.message);

      if (result.status === "completed" || result.status === "noop") {
        await loadPublicReminderEvents();
      }
    } catch {
      setReminderActionNotice("Unable to update event reminder enrollment right now.");
    } finally {
      setReminderActionLoading(null);
    }
  };
  const accessPosture = {
    title: getAccessPostureTitle(channelAccessResolution, isOfficialProfile),
    body: getProfileAccessBody(channelAccessResolution, isOfficialProfile),
  };
  const accessDetails: readonly ProfileAccessDetail[] = isOfficialProfile ? [
    {
      label: "Browse",
      value: "Verified",
      body: "official platform-owned identity",
    },
    {
      label: "Chi'lly Chat",
      value: "Official",
      body: "trusted help starts in the official thread",
    },
  ] : [
    {
      label: "Browse",
      value: getBrowseAccessValue(channelAccessResolution, isOfficialProfile),
      body: getBrowseAccessBody(channelAccessResolution, isOfficialProfile),
    },
    {
      label: "Watch Party",
      value: formatChannelRoomAccessValue(channelAccessResolution?.watchPartyAccessRule),
      body: getWatchPartyAccessBody(channelAccessResolution, channelAccessReady),
    },
    {
      label: "Chi'lly Chat",
      value: formatChannelRoomAccessValue(channelAccessResolution?.communicationAccessRule),
      body: getCommunicationAccessBody(channelAccessResolution, channelAccessReady),
    },
  ];
  const ownerStatsRibbon: readonly OwnerStatCard[] = isSelfProfile ? [
    {
      label: "Videos",
      value: creatorVideosReady ? String(creatorVideos.length) : "...",
      body: "uploaded videos in your channel library",
    },
    {
      label: "Public",
      value: creatorVideosReady ? String(publicCreatorVideoCount) : "...",
      body: "published videos visitors can watch",
      tone: "linked",
    },
    {
      label: "Events",
      value: publicEventsReady ? String(publicEventCount) : "...",
      body: "backed creator live/watch-party events",
      tone: publicEventCount ? "live" : "default",
    },
  ] : [];
  const ownerQuickActions: readonly OwnerQuickAction[] = isSelfProfile ? [
    {
      label: "Open Manage Channel",
      onPress: onPressManageChannel,
      emphasis: "primary",
    },
    {
      label: "Upload Video",
      onPress: onPressManageChannel,
      emphasis: "primary",
    },
    {
      label: "Open Chi'lly Chat",
      onPress: () => {
        void onPressCommunication("message");
      },
    },
  ] : [];
  const ownerNextSteps = [
    !profile.tagline ? "add a sharper channel line" : null,
    creatorVideosReady && creatorVideos.length === 0 ? "upload your first video" : null,
  ].filter(Boolean);
  const ownerPromptCards: readonly OwnerPromptCard[] = isSelfProfile ? [
    ...(!creatorSettingsEnabled ? [{
      kicker: "OWNER VIEW",
      title: "Channel editing is currently hidden",
      body: "This route stays focused on the public-facing channel view until deeper creator controls return.",
    }] : []),
    ...(creatorSettingsEnabled && ownerNextSteps.length ? [{
      kicker: "NEXT IN MANAGE CHANNEL",
      title: ownerNextSteps.length > 1 ? "Shape the next public read" : (
        ownerNextSteps[0] === "add a sharper channel line"
          ? "Add a sharper channel line"
          : ownerNextSteps[0] === "upload your first video"
            ? "Upload your first video"
            : "Build the first visible shelf"
      ),
      body: ownerNextSteps.length > 1
        ? "Start by adding a sharper channel line and uploading the first playable channel video."
        : ownerNextSteps[0] === "add a sharper channel line"
          ? "Give visitors a clearer first read on your lane with a short tagline."
          : "Upload a real video so your Channel starts feeling like a mini streaming platform.",
      actionLabel: "Open Manage Channel",
      onPress: onPressManageChannel,
    }] : []),
  ] : [];
  const renderOwnerHandoffCard = () => {
    if (!isSelfProfile) return null;

    return (
      <View style={styles.ownerModeCard}>
        <Text style={styles.ownerModeKicker}>OWNER HANDOFF</Text>
        <Text style={styles.ownerModeTitle}>Keep the public channel in front.</Text>
        <Text style={styles.ownerModeBody}>
          Use Manage Channel for deeper edits while this route keeps the public read, live posture, and access truth easy to scan.
        </Text>
        {ownerQuickActions.length ? (
          <View style={styles.ownerQuickActionRow}>
            {ownerQuickActions.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={[
                  styles.ownerActionChip,
                  action.emphasis === "primary" && styles.ownerActionChipPrimary,
                ]}
                activeOpacity={0.84}
                onPress={action.onPress}
              >
                <Text
                  style={[
                    styles.ownerActionChipText,
                    action.emphasis === "primary" && styles.ownerActionChipTextPrimary,
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {ownerStatsRibbon.length ? (
          <View style={styles.ownerSignalRow}>
            {ownerStatsRibbon.map((card) => (
              <View
                key={card.label}
                style={[
                  styles.ownerSignalChip,
                  card.tone === "linked" && styles.ownerSignalChipLinked,
                  card.tone === "live" && styles.ownerSignalChipLive,
                ]}
              >
                <Text style={styles.ownerSignalValue}>{card.value}</Text>
                <Text style={styles.ownerSignalLabel}>{card.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {ownerPromptCards.length ? (
          <View style={styles.ownerPromptStack}>
            {ownerPromptCards.map((prompt) => (
              <View key={prompt.title} style={styles.ownerPromptCard}>
                <Text style={styles.ownerPromptKicker}>{prompt.kicker}</Text>
                <Text style={styles.ownerPromptTitle}>{prompt.title}</Text>
                <Text style={styles.ownerPromptBody}>{prompt.body}</Text>
                {prompt.actionLabel && prompt.onPress ? (
                  <TouchableOpacity
                    style={styles.ownerPromptAction}
                    activeOpacity={0.84}
                    onPress={prompt.onPress}
                  >
                    <Text style={styles.ownerPromptActionText}>{prompt.actionLabel}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View
      style={styles.outerFlex}
      testID="profile-screen"
      accessibilityLabel="Chi'llywood profile channel screen"
    >
      <View style={styles.fullBackgroundFallback} pointerEvents="none" />
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
          <Text style={styles.profileEyebrow}>{profileEyebrow}</Text>
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
          <Text style={styles.avatarHint}>Tap the avatar for quick actions.</Text>
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
                {isOfficialProfile ? "Official Quick Actions" : isSelfProfile ? "Your Channel Quick Actions" : "Channel Quick Actions"}
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
              {hasLiveRouteContext || hasLiveTabEntry ? (
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    hasLiveRouteContext && profile.isLive ? styles.actionBtnLive : styles.actionBtnConnected,
                  ]}
                  activeOpacity={0.86}
                  onPress={onPressLive}
                >
                  <Text
                    style={[
                      styles.actionBtnText,
                      hasLiveRouteContext && profile.isLive ? styles.actionBtnTextLive : styles.actionBtnTextConnected,
                    ]}
                  >
                    {liveActionTitle}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {canOpenWatchPartyEntry ? (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnConnected]}
                  activeOpacity={0.86}
                  onPress={onPressWatchParty}
                >
                  <Text style={[styles.actionBtnText, styles.actionBtnTextConnected]}>
                    {hasLiveRouteContext ? "Watch Party" : "Watch-Party Live"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {showFriendshipHint || canReportProfile ? (
              <View style={styles.secondaryActionRow}>
                {showFriendshipHint ? (
                  <View style={[styles.actionChip, styles.actionChipConnected]}>
                    <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
                      Friends
                    </Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.actionChip, styles.actionChipReport]}
                  activeOpacity={0.82}
                  onPress={onPressReportProfile}
                >
                  <Text style={[styles.actionChipText, styles.actionChipTextReport]}>
                    Report
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <Text style={styles.actionFootnote}>{communicationFootnote ? `${communicationFootnote} ${actionFootnote}` : actionFootnote}</Text>
          </View>
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
          <View style={styles.accessCard}>
            <Text style={styles.accessKicker}>CHANNEL ACCESS</Text>
            <Text style={styles.accessTitle}>{accessPosture.title}</Text>
            <Text style={styles.accessBody}>{accessPosture.body}</Text>
            <View style={styles.accessDetailRow}>
              {accessDetails.map((detail) => (
                <View key={detail.label} style={styles.accessDetailCard}>
                  <Text style={styles.accessDetailLabel}>{detail.label}</Text>
                  <Text style={styles.accessDetailValue}>{detail.value}</Text>
                  <Text style={styles.accessDetailBody}>{detail.body}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.sectionStack}>
          <View style={styles.tabStripCard}>
            <Text style={styles.tabStripKicker}>CHANNEL NAVIGATION</Text>
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
          {renderOwnerHandoffCard()}
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
          {activeTab === "content" ? (
            <View style={styles.quickActionsCard}>
              <Text style={styles.quickActionsTitle}>
                {isSelfProfile ? "Your Uploaded Videos" : "Creator Videos"}
              </Text>
              {!creatorVideosReady ? (
                <Text style={styles.sectionBody}>Loading creator videos...</Text>
              ) : creatorVideos.length ? (
                <View style={styles.creatorVideoGrid}>
                  {creatorVideos.map((video) => (
                    <CreatorVideoCard
                      key={video.id}
                      video={video}
                      mode={isSelfProfile ? "owner" : "public"}
                      onOpen={() => {
                        router.push({
                          pathname: "/player/[id]",
                          params: {
                            id: video.id,
                            source: "creator-video",
                          },
                        });
                      }}
                      onShare={!isSelfProfile && isCreatorVideoPubliclyShareable(video) ? () => {
                        void shareCreatorVideo(video);
                      } : undefined}
                    />
                  ))}
                </View>
              ) : isSelfProfile ? (
                <View style={styles.creatorVideoEmptyCard}>
                  <Text style={styles.creatorVideoTitle}>Upload your first video</Text>
                  <Text style={styles.creatorVideoBody}>
                    Add a playable video from Manage Channel so this profile becomes a real channel library.
                  </Text>
                  <TouchableOpacity
                    style={styles.ownerPromptAction}
                    activeOpacity={0.84}
                    onPress={onPressManageChannel}
                  >
                    <Text style={styles.ownerPromptActionText}>Upload Video</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.sectionBody}>
                  This channel has not published creator videos yet.
                </Text>
              )}
            </View>
          ) : null}
          {activeTab === "community" && communityActions.length ? (
            <View style={styles.quickActionsCard}>
              <Text style={styles.quickActionsTitle}>Community Follow-Up</Text>
              <View style={styles.quickActionsRow}>
                {communityActions.map((action) => (
                  <TouchableOpacity
                    key={action.label}
                    style={styles.quickActionChip}
                    activeOpacity={0.84}
                    onPress={action.onPress}
                  >
                    <Text style={styles.quickActionChipText}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
          {activeTab === "live" ? (
            <>
              <View style={styles.ownerStatsRow}>
                {publicEventSummaryCards.map((card) => (
                  <View
                    key={card.label}
                    style={[
                      styles.ownerStatCard,
                      card.tone === "linked" && styles.ownerStatCardLinked,
                      card.tone === "live" && styles.ownerStatCardLive,
                    ]}
                  >
                    <Text style={styles.ownerStatLabel}>{card.label}</Text>
                    <Text style={styles.ownerStatValue}>{card.value}</Text>
                    <Text style={styles.ownerStatBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              {!publicEventsReady ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionKicker}>EVENT STATUS</Text>
                  <Text style={styles.sectionTitle}>Loading public event truth</Text>
                  <Text style={styles.sectionBody}>
                    Checking backed creator events before showing live, replay, and reminder state.
                  </Text>
                </View>
              ) : null}
              {publicEventsReady && reminderActionNotice ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionKicker}>REMINDER STATUS</Text>
                  <Text style={styles.sectionBody}>{reminderActionNotice}</Text>
                </View>
              ) : null}
              {publicEventsReady && publicEvents.length ? (
                publicEvents.map((event) => {
                  const reminderSummary = publicReminderSummaryByEventId.get(event.id) ?? null;
                  const enrollment: EventReminderEnrollment = reminderSummary?.enrollment ?? {
                    eventId: event.id,
                    viewerUserId: currentUserId || null,
                    state: currentUserId ? "not_enrolled" : "signed_out",
                    reminderReady: event.reminder.reminderReady,
                    canEnroll: event.reminder.canSetReminder,
                    reason: currentUserId ? "ready" : "signed_out",
                    updatedAt: null,
                  };

                  return (
                    <View
                      key={event.id}
                      style={[
                        styles.sectionCard,
                        (event.isLiveNow || event.isUpcoming) && styles.sectionCardLive,
                      ]}
                    >
                      <Text style={styles.sectionKicker}>{formatEventTypeLabel(event.eventType).toUpperCase()}</Text>
                      <Text style={styles.sectionTitle}>{event.eventTitle}</Text>
                      <Text style={styles.sectionBody}>
                        {formatEventStatusLabel(event)} · Starts {formatEventDate(event.startsAt)} · Ends {formatEventDate(event.endsAt)}{"\n"}
                        {event.replay.isReplayAvailableNow
                          ? "Replay is currently available."
                          : event.replay.isReplayExpired
                            ? "Replay window has expired."
                            : event.replay.policy === "none"
                              ? "Replay is not enabled for this event."
                              : "Replay is configured but not available yet."}{"\n"}
                        {formatEventReminderLabel(event)} · {formatEventReminderEnrollmentLabel(enrollment)}
                        {event.linkedTitleId ? `\nWatch title: ${event.linkedTitleId}` : ""}
                      </Text>
                      <Text style={styles.actionFootnote}>{getEventReminderEnrollmentBody(enrollment)}</Text>
                      {event.reminder.canSetReminder ? (
                        <View style={styles.secondaryActionRow}>
                          {currentUserId ? (
                            <TouchableOpacity
                              style={[
                                styles.actionChip,
                                enrollment.state === "active" && styles.actionChipConnected,
                                reminderActionLoading === event.id && styles.actionChipPlaceholder,
                              ]}
                              onPress={() => onToggleReminderEnrollment(event.id, enrollment.state !== "active")}
                              activeOpacity={0.86}
                              disabled={reminderActionLoading === event.id}
                            >
                              <Text
                                style={[
                                  styles.actionChipText,
                                  enrollment.state === "active" && styles.actionChipTextConnected,
                                  reminderActionLoading === event.id && styles.actionChipTextPlaceholder,
                                ]}
                              >
                                {reminderActionLoading === event.id
                                  ? "Saving…"
                                  : enrollment.state === "active"
                                    ? "Cancel Reminder"
                                    : "Set Reminder"}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })
              ) : publicEventsReady ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionKicker}>EVENT STATUS</Text>
                  <Text style={styles.sectionTitle}>No public event schedule yet</Text>
                  <Text style={styles.sectionBody}>
                    This profile does not currently have any non-draft creator events to show. The route stays honest instead of faking upcoming rooms or reminder state.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
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
  accessCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.16)",
    backgroundColor: "rgba(17,24,40,0.84)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  accessKicker: { color: "#7E8AA0", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  accessTitle: { color: "#F2F5FF", fontSize: 16, fontWeight: "900" },
  accessBody: { color: "#A9B3C7", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  accessDetailRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  accessDetailCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 98,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  accessDetailLabel: { color: "#8590A6", fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
  accessDetailValue: { color: "#F4F7FF", fontSize: 15, fontWeight: "900" },
  accessDetailBody: { color: "#AAB3C7", fontSize: 11.5, lineHeight: 16, fontWeight: "600" },
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
  creatorVideoGrid: {
    gap: 10,
  },
  creatorVideoCard: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 142,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 10,
    gap: 8,
  },
  creatorVideoThumb: {
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(220,20,60,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  creatorVideoThumbImage: {
    width: "100%",
    height: "100%",
  },
  creatorVideoThumbText: {
    color: "#FFE4EB",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  creatorVideoVisibilityBadge: {
    position: "absolute",
    right: 6,
    top: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.66)",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  creatorVideoVisibilityText: {
    color: "#F4F7FF",
    fontSize: 9,
    fontWeight: "900",
  },
  creatorVideoTitle: {
    color: "#F3F6FF",
    fontSize: 13.5,
    fontWeight: "900",
  },
  creatorVideoBody: {
    color: "#AAB3C7",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  creatorVideoEmptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(220,20,60,0.08)",
    padding: 12,
    gap: 8,
  },
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  ownerActionChipPrimary: {
    borderColor: "rgba(115,134,255,0.22)",
    backgroundColor: "rgba(115,134,255,0.12)",
  },
  ownerActionChipText: { color: "#DDE4FF", fontSize: 12.5, fontWeight: "800" },
  ownerActionChipTextPrimary: { color: "#EEF2FF" },
  actionFootnote: { color: "#6D7486", fontSize: 11.5, lineHeight: 16, fontWeight: "600", textAlign: "center" },
  ownerModeCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.12)",
    backgroundColor: "rgba(13,18,32,0.8)",
    padding: 15,
    gap: 10,
  },
  ownerModeKicker: { color: "#8390AB", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  ownerModeTitle: { color: "#F4F7FF", fontSize: 16.5, fontWeight: "900" },
  ownerModeBody: { color: "#B4BDD1", fontSize: 13, lineHeight: 19 },
  ownerSignalRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ownerSignalChip: {
    flexGrow: 1,
    flexBasis: 92,
    minWidth: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  ownerSignalChipLinked: {
    borderColor: "rgba(115,134,255,0.18)",
    backgroundColor: "rgba(115,134,255,0.1)",
  },
  ownerSignalChipLive: {
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(220,20,60,0.1)",
  },
  ownerSignalValue: { color: "#EEF2FF", fontSize: 18, fontWeight: "900" },
  ownerSignalLabel: { color: "#98A3B8", fontSize: 11.5, fontWeight: "800" },
  ownerStatsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ownerStatCard: {
    flexGrow: 1,
    flexBasis: 110,
    minWidth: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 4,
  },
  ownerStatCardLinked: {
    borderColor: "rgba(115,134,255,0.22)",
    backgroundColor: "rgba(115,134,255,0.12)",
  },
  ownerStatCardLive: {
    borderColor: "rgba(220,20,60,0.26)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  ownerStatLabel: { color: "#8F99AE", fontSize: 10.5, fontWeight: "900", letterSpacing: 0.9 },
  ownerStatValue: { color: "#F6F8FF", fontSize: 22, fontWeight: "900" },
  ownerStatBody: { color: "#B1BCD0", fontSize: 12, lineHeight: 17 },
  ownerQuickActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ownerPromptStack: { gap: 10 },
  ownerPromptCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 12,
    gap: 6,
  },
  ownerPromptKicker: { color: "#8B95AA", fontSize: 10.5, fontWeight: "900", letterSpacing: 1 },
  ownerPromptTitle: { color: "#F0F4FF", fontSize: 15, fontWeight: "900" },
  ownerPromptBody: { color: "#B5BED2", fontSize: 12.5, lineHeight: 18 },
  ownerPromptAction: {
    alignSelf: "flex-start",
    marginTop: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.18)",
    backgroundColor: "rgba(115,134,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ownerPromptActionText: { color: "#E4E9FF", fontSize: 12, fontWeight: "800" },

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
