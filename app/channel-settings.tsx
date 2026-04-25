import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  resolveChannelAccess,
  type ChannelAccessResolution,
} from "../_lib/accessEntitlements";
import {
  DEFAULT_APP_CONFIG,
  readAppConfig,
  resolveBrandingConfig,
  resolveFeatureConfig,
  resolveMonetizationConfig,
} from "../_lib/appConfig";
import { getBetaAccessBlockCopy, useBetaProgram } from "../_lib/betaProgram";
import {
  readChannelAudienceSummary,
  readChannelSafetyAdminSummary,
  readCreatorAnalyticsSummary,
  type ChannelReadModelFieldStatus,
  type ChannelAudienceReadModel,
  type ChannelSafetyAdminReadModel,
  type CreatorAnalyticsReadModel,
} from "../_lib/channelReadModels";
import {
  approveChannelAudienceRequest,
  blockChannelAudienceMember,
  cancelChannelAudienceRequest,
  declineChannelAudienceRequest,
  getChannelSubscriberRelationshipActionSupport,
  removeChannelFollower,
  unblockChannelAudienceMember,
  type ChannelAudienceActionResult,
  type ChannelAudienceActionStatus,
} from "../_lib/channelAudience";
import { useSession } from "../_lib/session";
import {
  readCreatorPermissions,
  sanitizeCreatorRoomAccessRule,
  type CreatorPermissionSet,
} from "../_lib/monetization";
import {
  createCreatorEvent,
  updateCreatorEvent,
  type CreatorEventReplayPolicy,
  type CreatorEventStatus,
  type CreatorEventSummary,
  type CreatorEventType,
} from "../_lib/liveEvents";
import {
  deleteCreatorVideo,
  readCreatorVideos,
  updateCreatorVideoMetadata,
  uploadCreatorVideo,
  type CreatorVideo,
  type CreatorVideoFile,
  type CreatorVideoVisibility,
} from "../_lib/creatorVideos";
import {
  readCreatorEventReminderSummaries,
  type CreatorEventReminderSummary,
} from "../_lib/notifications";
import type { UserChannelRole, UserProfile } from "../_lib/userData";
import { normalizeUserProfile, readUserProfile, saveUserProfile } from "../_lib/userData";
import { BetaAccessScreen } from "../components/system/beta-access-screen";

const SKYLINE_SOURCE = require("../assets/images/chicago-skyline.jpg");

type ChannelSettingsSectionStatus = "current" | "near_term" | "later_phase";

type ChannelSettingsSectionModel = {
  title: string;
  status: ChannelSettingsSectionStatus;
  body: string;
};

type ChannelAccessSummaryDetail = {
  label: string;
  value: string;
  body: string;
};

type SummaryMetricCard = {
  label: string;
  value: string;
  body: string;
  tone?: "default" | "unavailable";
};

type CreatorAnalyticsMetricKey = keyof CreatorAnalyticsReadModel["dataStatus"];

type ChannelEventEditorState = {
  editingEventId: string | null;
  eventTitle: string;
  eventType: CreatorEventType;
  status: CreatorEventStatus;
  startsAt: string;
  endsAt: string;
  linkedTitleId: string;
  replayPolicy: CreatorEventReplayPolicy;
  replayAvailableAt: string;
  replayExpiresAt: string;
  reminderReady: boolean;
};

type ChannelVideoEditorState = {
  editingVideoId: string | null;
  title: string;
  description: string;
  thumbUrl: string;
  visibility: CreatorVideoVisibility;
};

const createEmptyEventEditorState = (): ChannelEventEditorState => ({
  editingEventId: null,
  eventTitle: "",
  eventType: "live_first",
  status: "draft",
  startsAt: "",
  endsAt: "",
  linkedTitleId: "",
  replayPolicy: "none",
  replayAvailableAt: "",
  replayExpiresAt: "",
  reminderReady: false,
});

const createEmptyVideoEditorState = (): ChannelVideoEditorState => ({
  editingVideoId: null,
  title: "",
  description: "",
  thumbUrl: "",
  visibility: "draft",
});

const logCreatorVideoUploadUi = (event: string, details?: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log("[creator-video-upload-ui]", event, details ?? {});
};

const formatChannelRoomAccessValue = (value?: ChannelAccessResolution["watchPartyAccessRule"] | null) => {
  if (value === "party_pass") return "Party Pass";
  if (value === "premium") return "Premium";
  return "Public";
};

const formatRoomDefaultAccessLabel = (value: "open" | "party_pass" | "premium") => {
  if (value === "party_pass") return "Party Pass";
  if (value === "premium") return "Premium";
  return "Open";
};

const formatJoinPolicyLabel = (value: "open" | "locked") => (value === "locked" ? "Locked" : "Open");
const formatReactionsPolicyLabel = (value: "enabled" | "muted") => (value === "muted" ? "Muted" : "Enabled");
const formatCapturePolicyLabel = (value: "best_effort" | "host_managed") => (
  value === "host_managed" ? "Host Managed" : "Best Effort"
);

const toDatetimeLocalValue = (value: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized.slice(0, 16);
  const offset = parsed.getTimezoneOffset();
  return new Date(parsed.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

const fromDatetimeLocalValue = (value: string) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString();
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

const formatEventStatusLabel = (value: CreatorEventStatus) => {
  switch (value) {
    case "live_now":
      return "Live Now";
    case "replay_available":
      return "Replay Available";
    default:
      return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
  }
};

const formatReplayPolicyLabel = (value: CreatorEventReplayPolicy) => {
  switch (value) {
    case "indefinite":
      return "Replay Kept";
    case "until_expiration":
      return "Replay Until Expiration";
    default:
      return "No Replay";
  }
};

const formatReminderLabel = (event: CreatorEventSummary) => {
  switch (event.reminder.reason) {
    case "ready":
      return "Reminder Ready";
    case "missing_start_time":
      return "Start Time Needed";
    default:
      return event.status === "scheduled" ? "Reminder Off" : "Not Scheduled";
  }
};

const formatReplayStateLabel = (event: CreatorEventSummary) => {
  if (event.replay.policy === "none") return "No Replay";
  if (event.replay.isReplayExpired) return "Replay Expired";
  if (event.replay.isReplayAvailableNow) return "Replay Available";
  return "Replay Pending";
};

const getChannelAccessSummaryBody = (resolution: ChannelAccessResolution | null) => {
  if (!resolution || resolution.renderState === "loading" || resolution.reason === "missing_channel_context") {
    return "Checking saved defaults and creator grants.";
  }
  if (resolution.reason === "channel_defaults_subscriber") {
    return "Both defaults are gated, so public channel copy should prepare visitors for member-style access.";
  }
  if (resolution.reason === "channel_defaults_private") {
    return "Watch-party entry is locked by default, so private room behavior should stay explicit on public surfaces.";
  }
  if (resolution.reason === "channel_defaults_mixed") {
    return "This channel mixes open and gated defaults, so access changes need to stay visible on public surfaces.";
  }
  return "This channel currently defaults to open communication and open watch-party access.";
};

const formatCount = (value: number | null) => value === null ? "Unavailable" : String(value);
const formatBooleanStatus = (value: boolean) => value ? "Enabled" : "Unavailable";
const formatVisibilitySurface = (value: boolean | null) => value == null ? "Unavailable" : value ? "Visible" : "Hidden";
const formatPublicActivityVisibility = (value: ChannelAudienceReadModel["publicActivityVisibility"]) => {
  switch (value) {
    case "public":
      return "Public";
    case "followers_only":
      return "Followers Only";
    case "subscribers_only":
      return "Subscribers Only";
    case "private":
      return "Private";
    default:
      return "Unavailable";
  }
};

const formatChannelLayoutPresetLabel = (value?: UserProfile["channelLayoutPreset"] | null) => {
  switch (value) {
    case "live_first":
      return "Live First";
    case "library_first":
      return "Library First";
    default:
      return "Spotlight";
  }
};

const getChannelLayoutPresetBody = (value?: UserProfile["channelLayoutPreset"] | null) => {
  switch (value) {
    case "live_first":
      return "The public channel home leads with live presence first.";
    case "library_first":
      return "The public channel home leads with content/library context first.";
    default:
      return "The public channel home keeps the featured spotlight first.";
  }
};

const formatIsoDate = (value: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Unavailable";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toLocaleString();
};

const formatAudienceActionLabel = (value: ChannelAudienceActionResult["action"]) => {
  switch (value) {
    case "approve_request":
      return "Approve Request";
    case "decline_request":
      return "Decline Request";
    case "cancel_request":
      return "Cancel Request";
    case "block":
      return "Block Audience Member";
    case "unblock":
      return "Unblock Audience Member";
    case "remove_follower":
      return "Remove Follower";
    case "follow":
      return "Follow Channel";
    case "unfollow":
      return "Unfollow Channel";
    case "subscriber_relationship_mutation":
      return "Subscriber Relationship";
    default:
      return value.replaceAll("_", " ").replace(/\b\w/g, (match: string) => match.toUpperCase());
  }
};

const formatAudienceActionStatus = (value: ChannelAudienceActionStatus) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (match: string) => match.toUpperCase());
const formatReadModelStatusValue = (value: Exclude<ChannelReadModelFieldStatus, "available">) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (match: string) => match.toUpperCase());

const analyticsUnavailableMetricDefinitions: readonly {
  key: CreatorAnalyticsMetricKey;
  label: string;
  missingBody: string;
  laterBody: string;
}[] = [
  {
    key: "profileVisits",
    label: "Profile Visits",
    missingBody: "Profile analytics are in scope, but no honest aggregate read path exists yet.",
    laterBody: "Profile/channel opens are not treated as creator analytics yet.",
  },
  {
    key: "liveAttendanceTotal",
    label: "Live Attendance",
    missingBody: "Attendance totals still need real aggregate backing before they can be shown.",
    laterBody: "This stays later until live attendance aggregates are supported.",
  },
  {
    key: "contentLaunches",
    label: "Content Launches",
    missingBody: "Creator-facing content-performance aggregates are not backed yet.",
    laterBody: "This stays later until creator content-performance aggregates are supported.",
  },
  {
    key: "continueWatchingReturns",
    label: "Continue Watching Returns",
    missingBody: "The repo does not aggregate return behavior honestly yet.",
    laterBody: "Continue-watching return analytics belong to a later aggregate layer.",
  },
  {
    key: "gatedSurfaceViews",
    label: "Gated Surface Views",
    missingBody: "Access events are emitted, but not yet aggregated into creator-facing conversion reporting.",
    laterBody: "Conversion-style gate views stay later until a real creator conversion read model exists.",
  },
];

export default function ChannelSettingsScreen() {
  const router = useRouter();
  const { isLoading: authLoading, isSignedIn, user } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsEnabled, setSettingsEnabled] = useState(true);
  const [appDisplayName, setAppDisplayName] = useState(DEFAULT_APP_CONFIG.branding.appDisplayName);
  const [monetizationConfig, setMonetizationConfig] = useState(DEFAULT_APP_CONFIG.monetization);
  const [creatorPermissions, setCreatorPermissions] = useState<CreatorPermissionSet | null>(null);
  const [audienceSummary, setAudienceSummary] = useState<ChannelAudienceReadModel | null>(null);
  const [safetyAdminSummary, setSafetyAdminSummary] = useState<ChannelSafetyAdminReadModel | null>(null);
  const [creatorAnalyticsSummary, setCreatorAnalyticsSummary] = useState<CreatorAnalyticsReadModel | null>(null);
  const [channelAccessResolution, setChannelAccessResolution] = useState<ChannelAccessResolution | null>(null);
  const [creatorEvents, setCreatorEvents] = useState<CreatorEventSummary[]>([]);
  const [creatorVideos, setCreatorVideos] = useState<CreatorVideo[]>([]);
  const [creatorReminderSummaries, setCreatorReminderSummaries] = useState<CreatorEventReminderSummary[]>([]);
  const [audienceActionNotice, setAudienceActionNotice] = useState<string | null>(null);
  const [audienceActionResult, setAudienceActionResult] = useState<ChannelAudienceActionResult | null>(null);
  const [audienceActionLoading, setAudienceActionLoading] = useState<ChannelAudienceActionResult["action"] | null>(null);
  const [audienceRequestIdInput, setAudienceRequestIdInput] = useState("");
  const [audienceFollowerUserIdInput, setAudienceFollowerUserIdInput] = useState("");
  const [audienceTargetUserIdInput, setAudienceTargetUserIdInput] = useState("");
  const [audienceBlockReasonInput, setAudienceBlockReasonInput] = useState("");
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [eventNotice, setEventNotice] = useState<string | null>(null);
  const [eventEditor, setEventEditor] = useState<ChannelEventEditorState>(createEmptyEventEditorState);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videoSaving, setVideoSaving] = useState(false);
  const [videoNotice, setVideoNotice] = useState<string | null>(null);
  const [videoEditor, setVideoEditor] = useState<ChannelVideoEditorState>(createEmptyVideoEditorState);
  const [selectedVideoFile, setSelectedVideoFile] = useState<CreatorVideoFile | null>(null);
  const videoTitleReady = videoEditor.title.trim().length > 0;
  const videoSubmitRequirement = videoEditor.editingVideoId
    ? videoTitleReady
      ? ""
      : "Enter a title to update this video."
    : !selectedVideoFile
      ? "Choose a video file to enable upload."
      : videoTitleReady
        ? ""
        : "Enter a title to enable upload.";
  const isVideoSubmitDisabled = videoSaving || !!videoSubmitRequirement;
  const canUseChannelSettings = isSignedIn && isActive && !!user?.id;
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Channel settings");
  const subscriberMutationSupport = getChannelSubscriberRelationshipActionSupport();

  useEffect(() => {
    if (!canUseChannelSettings) {
      setLoading(false);
      return;
    }
    let active = true;

    Promise.all([
      readUserProfile(),
      readAppConfig().catch(() => DEFAULT_APP_CONFIG),
      readCreatorPermissions().catch(() => null),
      readChannelAudienceSummary(String(user?.id ?? "")).catch(() => null),
      readChannelSafetyAdminSummary(String(user?.id ?? "")).catch(() => null),
      readCreatorAnalyticsSummary(String(user?.id ?? "")).catch(() => null),
    ])
      .then(([
        resolvedProfile,
        resolvedConfig,
        resolvedPermissions,
        resolvedAudienceSummary,
        resolvedSafetyAdminSummary,
        resolvedCreatorAnalyticsSummary,
      ]) => {
        if (!active) return;
        setProfile(normalizeUserProfile(resolvedProfile));
        setSettingsEnabled(resolveFeatureConfig(resolvedConfig).creatorSettingsEnabled);
        setAppDisplayName(resolveBrandingConfig(resolvedConfig).appDisplayName);
        setMonetizationConfig(resolveMonetizationConfig(resolvedConfig));
        setCreatorPermissions(resolvedPermissions);
        setAudienceSummary(resolvedAudienceSummary);
        setSafetyAdminSummary(resolvedSafetyAdminSummary);
        setCreatorAnalyticsSummary(resolvedCreatorAnalyticsSummary);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setProfile(normalizeUserProfile({ username: "", avatarIndex: 0 }));
        setMonetizationConfig(DEFAULT_APP_CONFIG.monetization);
        setAudienceSummary(null);
        setSafetyAdminSummary(null);
        setCreatorAnalyticsSummary(null);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canUseChannelSettings, user?.id]);
  useEffect(() => {
    let active = true;

    if (!canUseChannelSettings || loading) {
      setChannelAccessResolution(null);
      return () => {
        active = false;
      };
    }

    void resolveChannelAccess({
      channelUserId: String(user?.id ?? ""),
      profile,
      creatorPermissions,
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
  }, [canUseChannelSettings, creatorPermissions, loading, profile, user?.id]);

  useEffect(() => {
    let active = true;

    if (!canUseChannelSettings) {
      setCreatorEvents([]);
      setCreatorReminderSummaries([]);
      setCreatorVideos([]);
      setEventsLoading(false);
      setVideosLoading(false);
      return () => {
        active = false;
      };
    }

    setEventsLoading(true);

    void readCreatorEventReminderSummaries(String(user?.id ?? ""))
      .then((summaries) => {
        if (!active) return;
        setCreatorReminderSummaries(summaries);
        setCreatorEvents(summaries.map((summary) => summary.event));
        setEventsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setCreatorEvents([]);
        setCreatorReminderSummaries([]);
        setEventsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canUseChannelSettings, user?.id]);

  useEffect(() => {
    let active = true;

    if (!canUseChannelSettings || !user?.id) {
      setCreatorVideos([]);
      setVideosLoading(false);
      return () => {
        active = false;
      };
    }

    setVideosLoading(true);
    void readCreatorVideos(String(user.id), { includeDrafts: true, limit: 50 })
      .then((videos) => {
        if (!active) return;
        setCreatorVideos(videos);
        setVideosLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setCreatorVideos([]);
        setVideosLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canUseChannelSettings, user?.id]);

  const updateProfile = (patch: Partial<UserProfile>) => {
    setProfile((prev) => normalizeUserProfile({ ...(prev ?? {}), ...patch }));
    setNotice(null);
  };

  const updateEventEditor = (patch: Partial<ChannelEventEditorState>) => {
    setEventEditor((prev) => ({ ...prev, ...patch }));
    setEventNotice(null);
  };

  const updateVideoEditor = (patch: Partial<ChannelVideoEditorState>) => {
    setVideoEditor((prev) => ({ ...prev, ...patch }));
    setVideoNotice(null);
  };

  const refreshAudienceSummary = async () => {
    if (!user?.id) {
      setAudienceSummary(null);
      return;
    }

    const nextSummary = await readChannelAudienceSummary(String(user.id)).catch(() => null);
    setAudienceSummary(nextSummary);
  };

  const runAudienceAction = async (
    action: ChannelAudienceActionResult["action"],
    execute: () => Promise<ChannelAudienceActionResult>,
  ) => {
    try {
      setAudienceActionLoading(action);
      setAudienceActionNotice(null);
      const result = await execute();
      setAudienceActionResult(result);
      setAudienceActionNotice(result.message);

      if (result.status === "completed") {
        await refreshAudienceSummary();
      }

      return result;
    } catch {
      const fallback: ChannelAudienceActionResult = {
        action,
        status: "error",
        reason: "update_failed",
        message: "Unable to complete this audience action right now.",
        actorScope: "channel_owner",
        requiredScope: "owner_or_operator",
        channelUserId: String(user?.id ?? "") || null,
        viewerUserId: String(user?.id ?? "") || null,
        targetUserId: null,
        requestId: null,
        requestKind: null,
        requestStatus: null,
      };
      setAudienceActionResult(fallback);
      setAudienceActionNotice(fallback.message);
      return fallback;
    } finally {
      setAudienceActionLoading(null);
    }
  };

  const resetEventEditor = () => {
    setEventEditor(createEmptyEventEditorState());
  };

  const loadCreatorEvents = async () => {
    if (!user?.id) {
      setCreatorEvents([]);
      setCreatorReminderSummaries([]);
      return;
    }

    setEventsLoading(true);
    try {
      const summaries = await readCreatorEventReminderSummaries(String(user.id));
      setCreatorReminderSummaries(summaries);
      setCreatorEvents(summaries.map((summary) => summary.event));
    } finally {
      setEventsLoading(false);
    }
  };

  const loadCreatorVideos = async () => {
    if (!user?.id) {
      setCreatorVideos([]);
      return;
    }

    setVideosLoading(true);
    try {
      const videos = await readCreatorVideos(String(user.id), { includeDrafts: true, limit: 50 });
      setCreatorVideos(videos);
    } finally {
      setVideosLoading(false);
    }
  };

  const resetVideoEditor = () => {
    setVideoEditor(createEmptyVideoEditorState());
    setSelectedVideoFile(null);
  };

  const onPickVideoFile = async () => {
    try {
      setVideoNotice(null);
      logCreatorVideoUploadUi("picker_open");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        logCreatorVideoUploadUi("picker_canceled");
        return;
      }
      const asset = result.assets[0];
      if (!asset?.uri) {
        logCreatorVideoUploadUi("picker_missing_asset");
        setVideoNotice("Choose a video file before uploading.");
        return;
      }

      const pickedFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      };

      setSelectedVideoFile(pickedFile);
      logCreatorVideoUploadUi("picker_selected", {
        name: pickedFile.name ?? "unnamed",
        mimeType: pickedFile.mimeType ?? null,
        size: pickedFile.size ?? null,
      });
      setVideoNotice(`Selected ${pickedFile.name || "video file"}. Enter a title, then tap Upload Video.`);
      if (!videoEditor.title.trim() && asset.name) {
        updateVideoEditor({ title: asset.name.replace(/\.[^.]+$/, "") });
      }
    } catch (error) {
      logCreatorVideoUploadUi("picker_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setVideoNotice("Unable to open the video picker right now.");
    }
  };

  const onEditVideo = (video: CreatorVideo) => {
    setVideoEditor({
      editingVideoId: video.id,
      title: video.title,
      description: video.description,
      thumbUrl: video.thumbnailUrl,
      visibility: video.visibility,
    });
    setSelectedVideoFile(null);
    setVideoNotice(null);
  };

  const onSaveVideo = async () => {
    if (!videoEditor.title.trim()) {
      logCreatorVideoUploadUi("submit_blocked", { reason: "missing_title" });
      setVideoNotice(videoEditor.editingVideoId ? "Enter a title before updating." : "Enter a title before uploading.");
      return;
    }

    if (!videoEditor.editingVideoId && !selectedVideoFile) {
      logCreatorVideoUploadUi("submit_blocked", { reason: "missing_file" });
      setVideoNotice("Choose a video file before uploading.");
      return;
    }

    const fileToUpload = selectedVideoFile;

    try {
      setVideoSaving(true);
      setVideoNotice(videoEditor.editingVideoId ? "Saving creator video..." : "Uploading creator video...");
      logCreatorVideoUploadUi("submit_start", {
        mode: videoEditor.editingVideoId ? "edit" : "upload",
        fileName: selectedVideoFile?.name ?? null,
        fileSize: selectedVideoFile?.size ?? null,
        visibility: videoEditor.visibility,
      });

      if (videoEditor.editingVideoId) {
        await updateCreatorVideoMetadata(videoEditor.editingVideoId, {
          title: videoEditor.title,
          description: videoEditor.description,
          thumbUrl: videoEditor.thumbUrl,
          visibility: videoEditor.visibility,
        });
        setVideoNotice("Creator video updated.");
      } else {
        const uploadedVideo = await uploadCreatorVideo({
          file: fileToUpload!,
          title: videoEditor.title,
          description: videoEditor.description,
          thumbUrl: videoEditor.thumbUrl,
          visibility: videoEditor.visibility,
        });
        setVideoNotice(`Creator video uploaded: ${uploadedVideo.title}.`);
      }

      await loadCreatorVideos();
      resetVideoEditor();
    } catch (error) {
      logCreatorVideoUploadUi("submit_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setVideoNotice(error instanceof Error ? error.message : "Unable to save creator video right now.");
    } finally {
      setVideoSaving(false);
    }
  };

  const onDeleteVideo = (video: CreatorVideo) => {
    Alert.alert(
      "Delete Video",
      `Remove "${video.title}" from your channel?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                setVideoSaving(true);
                setVideoNotice(null);
                await deleteCreatorVideo(video);
                await loadCreatorVideos();
                if (videoEditor.editingVideoId === video.id) resetVideoEditor();
                setVideoNotice("Creator video deleted.");
              } catch {
                setVideoNotice("Unable to delete creator video right now.");
              } finally {
                setVideoSaving(false);
              }
            })();
          },
        },
      ],
    );
  };

  const onEditEvent = (event: CreatorEventSummary) => {
    setEventEditor({
      editingEventId: event.id,
      eventTitle: event.eventTitle,
      eventType: event.eventType,
      status: event.status,
      startsAt: toDatetimeLocalValue(event.startsAt),
      endsAt: toDatetimeLocalValue(event.endsAt),
      linkedTitleId: event.linkedTitleId ?? "",
      replayPolicy: event.replayPolicy,
      replayAvailableAt: toDatetimeLocalValue(event.replayAvailableAt),
      replayExpiresAt: toDatetimeLocalValue(event.replayExpiresAt),
      reminderReady: event.reminderReady,
    });
    setEventNotice(null);
  };

  const onSaveEvent = async () => {
    if (!user?.id) return;

    try {
      setEventSaving(true);
      const payload = {
        hostUserId: String(user.id),
        eventTitle: eventEditor.eventTitle,
        eventType: eventEditor.eventType,
        status: eventEditor.status,
        startsAt: fromDatetimeLocalValue(eventEditor.startsAt),
        endsAt: fromDatetimeLocalValue(eventEditor.endsAt),
        linkedTitleId:
          eventEditor.eventType === "watch_party_live"
            ? String(eventEditor.linkedTitleId).trim() || null
            : null,
        replayPolicy: eventEditor.replayPolicy,
        replayAvailableAt: fromDatetimeLocalValue(eventEditor.replayAvailableAt),
        replayExpiresAt: fromDatetimeLocalValue(eventEditor.replayExpiresAt),
        reminderReady: eventEditor.reminderReady,
      };

      const result = eventEditor.editingEventId
        ? await updateCreatorEvent(eventEditor.editingEventId, payload)
        : await createCreatorEvent(payload);

      if ("error" in result) {
        setEventNotice(result.error.message);
        return;
      }

      await loadCreatorEvents();
      resetEventEditor();
      setEventNotice(eventEditor.editingEventId ? "Creator event updated." : "Creator event created.");
    } catch {
      setEventNotice("Unable to save creator event right now.");
    } finally {
      setEventSaving(false);
    }
  };

  const onSave = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      const normalized = normalizeUserProfile({
        ...profile,
        defaultWatchPartyContentAccessRule: sanitizeCreatorRoomAccessRule(
          profile.defaultWatchPartyContentAccessRule,
          creatorPermissions,
        ),
        defaultCommunicationContentAccessRule: sanitizeCreatorRoomAccessRule(
          profile.defaultCommunicationContentAccessRule,
          creatorPermissions,
        ),
      });
      await saveUserProfile(normalized);
      setProfile(normalized);
      setNotice("Channel settings saved.");
    } catch {
      setNotice("Unable to save channel settings right now.");
    } finally {
      setSaving(false);
    }
  };

  const sectionMap: readonly ChannelSettingsSectionModel[] = [
    {
      title: "Identity",
      status: "current",
      body: "Name, tagline, and role.",
    },
    {
      title: "Layout",
      status: "current",
      body: "Home emphasis and layout preset.",
    },
    {
      title: "Access & Monetization",
      status: "current",
      body: "Room defaults and creator grants.",
    },
    {
      title: "Live Events",
      status: "current",
      body: "Schedule live sessions and replays.",
    },
    {
      title: "Content",
      status: "current",
      body: "Upload and manage creator videos.",
    },
    {
      title: "Audience",
      status: "current",
      body: "Followers, requests, blocks, and visibility.",
    },
    {
      title: "Analytics",
      status: "current",
      body: "Backed room, event, and audience signals.",
    },
    {
      title: "Safety/Admin",
      status: "current",
      body: "Role, report, and admin reach.",
    },
    {
      title: "Design",
      status: "near_term",
      body: "Hero, avatar, and brand treatment.",
    },
  ];
  const currentSectionMap = sectionMap.filter((section) => section.status === "current");
  const buildNextSectionMap = sectionMap.filter((section) => section.status !== "current");
  const designSectionHighlights = [
    "Hero treatment",
    "Avatar framing",
    "Accent direction",
    "Brand presence",
  ] as const;
  const layoutSectionHighlights = [
    "Home block order",
    "Default tab emphasis",
    "Shelf hierarchy",
    "Live module priority",
  ] as const;
  const accessSummary = {
    title: channelAccessResolution?.label ?? "Loading Access",
    body: getChannelAccessSummaryBody(channelAccessResolution),
  };
  const resolvedCreatorPermissions = channelAccessResolution?.creatorPermissions ?? creatorPermissions;
  const adRuntimeEnabled =
    monetizationConfig.sponsorPlacementsEnabled
    || monetizationConfig.playerBannerEnabled
    || monetizationConfig.playerMidRollEnabled;
  const adGrantEnabled =
    !!resolvedCreatorPermissions?.canUseSponsorPlacements
    || !!resolvedCreatorPermissions?.canUsePlayerAds;
  const accessSummaryDetails: readonly ChannelAccessSummaryDetail[] = [
    {
      label: "Watch Party",
      value: formatChannelRoomAccessValue(channelAccessResolution?.watchPartyAccessRule),
      body: channelAccessResolution?.joinPolicy === "locked" ? "locked join policy" : "open join policy",
    },
    {
      label: "Communication",
      value: formatChannelRoomAccessValue(channelAccessResolution?.communicationAccessRule),
      body: "Chi'lly Chat stays canonical even when default room access is gated",
    },
  ];
  const creatorGrantDetails: readonly ChannelAccessSummaryDetail[] = [
    {
      label: "Party Pass Rooms",
      value: !resolvedCreatorPermissions
        ? "Loading"
        : resolvedCreatorPermissions.canUsePartyPassRooms
          ? "Ready"
          : "Open Only",
      body: !resolvedCreatorPermissions
        ? "checking whether Party Pass room defaults are available"
        : resolvedCreatorPermissions.canUsePartyPassRooms
          ? "Party Pass room defaults can stay active on this route"
          : "Party Pass defaults fall back to open until the creator grant is enabled",
    },
    {
      label: "Premium Rooms",
      value: !resolvedCreatorPermissions
        ? "Loading"
        : resolvedCreatorPermissions.canUsePremiumRooms
          ? "Ready"
          : "Open Only",
      body: !resolvedCreatorPermissions
        ? "checking whether Premium room defaults are available"
        : resolvedCreatorPermissions.canUsePremiumRooms
          ? "Premium room defaults can stay active on this route"
          : "Premium room defaults stay hidden until the creator grant is enabled",
    },
    {
      label: "Ad Readiness",
      value: !resolvedCreatorPermissions
        ? "Loading"
        : adGrantEnabled
          ? (adRuntimeEnabled ? "Prepared" : "Foundation Only")
          : "Later",
      body: !resolvedCreatorPermissions
        ? "checking sponsor and player-ad groundwork"
        : adGrantEnabled
          ? (
              adRuntimeEnabled
                ? "Sponsor groundwork is granted here, but public rollout still needs a later route-owned chapter"
                : "Sponsor or player-ad groundwork can be granted here, but public placements still stay off in this build"
            )
          : "Sponsor placements and player ads are still later for this creator and are not live on public routes",
    },
    {
      label: "Premium Playback",
      value: "Ad-Free",
      body: `${appDisplayName} Premium stays ad-free even when creator-side sponsorship deepens later`,
    },
  ];
  const audienceSummaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Followers",
      value: formatCount(audienceSummary?.followerCount ?? null),
      body: "Real channel follower relationships from the landed audience schema.",
    },
    {
      label: "Subscribers",
      value: formatCount(audienceSummary?.subscriberCount ?? null),
      body: "Creator/channel subscriber truth only, not account-tier premium.",
    },
    {
      label: "Requests",
      value: formatCount(audienceSummary?.pendingRequestCount ?? null),
      body: "Pending audience requests waiting on channel review.",
    },
    {
      label: "Blocked",
      value: formatCount(audienceSummary?.blockedAudienceCount ?? null),
      body: "Blocked audience rows already supported by current schema truth.",
    },
  ];
  const audienceVisibilityCards: readonly SummaryMetricCard[] = [
    {
      label: "Public Activity",
      value: formatPublicActivityVisibility(audienceSummary?.publicActivityVisibility ?? null),
      body: "Profile-backed audience visibility truth now lives on the channel profile record.",
    },
    {
      label: "Follower Surface",
      value: formatVisibilitySurface(audienceSummary?.followerSurfaceEnabled ?? null),
      body: "Shows whether follower visibility can appear on the channel surface from current backed truth.",
    },
    {
      label: "Subscriber Surface",
      value: formatVisibilitySurface(audienceSummary?.subscriberSurfaceEnabled ?? null),
      body: "Shows whether subscriber visibility can appear on the channel surface from current backed truth.",
    },
  ];
  const audienceUnavailableCards: readonly SummaryMetricCard[] = [
    {
      label: "VIP / Mod / Co-Host",
      value: "Later",
      body: "Audience-role rosters are not backed yet.",
      tone: "unavailable",
    },
  ];
  const audienceActionSummaryCards: readonly SummaryMetricCard[] = audienceActionResult
    ? [
      {
        label: "Last Action",
        value: formatAudienceActionLabel(audienceActionResult.action),
        body: audienceActionResult.message,
      },
      {
        label: "Result",
        value: formatAudienceActionStatus(audienceActionResult.status),
        body: `Required scope: ${audienceActionResult.requiredScope.replaceAll("_", " ")}`,
      },
      {
        label: "Request State",
        value: audienceActionResult.requestStatus
          ? audienceActionResult.requestStatus.replaceAll("_", " ").replace(/\b\w/g, (match: string) => match.toUpperCase())
          : "N/A",
        body: audienceActionResult.requestId
          ? `Request #${audienceActionResult.requestId}`
          : "No request id is attached to the latest action.",
      },
    ]
    : [];
  const analyticsSummaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Watch-Party Sessions",
      value: formatCount(creatorAnalyticsSummary?.watchPartySessionsHosted ?? null),
      body: "Hosted title-driven watch-party rooms.",
    },
    {
      label: "Live Sessions",
      value: formatCount(creatorAnalyticsSummary?.liveSessionsHosted ?? null),
      body: "Hosted live-room sessions.",
    },
    {
      label: "Communication Rooms",
      value: formatCount(creatorAnalyticsSummary?.communicationRoomsHosted ?? null),
      body: "Hosted communication-room sessions.",
    },
    {
      label: "Active Hosted Rooms",
      value: formatCount(creatorAnalyticsSummary?.activeHostedRooms ?? null),
      body: "Current active rooms across watch-party/live and communication.",
    },
    {
      label: "Latest Hosted Activity",
      value: formatIsoDate(creatorAnalyticsSummary?.latestHostedActivityAt ?? null),
      body: "Most recent hosted room activity timestamp across landed room tables.",
    },
    {
      label: "Follower Signal",
      value: formatCount(creatorAnalyticsSummary?.followerCount ?? null),
      body: "Follower signal from the landed audience model.",
    },
    {
      label: "Subscriber Signal",
      value: formatCount(creatorAnalyticsSummary?.subscriberCount ?? null),
      body: "Subscriber signal from creator/channel subscriber truth.",
    },
  ];
  const analyticsUnavailableCards: readonly SummaryMetricCard[] = analyticsUnavailableMetricDefinitions.reduce<SummaryMetricCard[]>((cards, definition) => {
      const status = creatorAnalyticsSummary?.dataStatus?.[definition.key] ?? "missing";
      if (status === "available") {
        return cards;
      }
      cards.push({
        label: definition.label,
        value: formatReadModelStatusValue(status),
        body: status === "later" ? definition.laterBody : definition.missingBody,
        tone: "unavailable" as const,
      });
      return cards;
    }, []);
  const safetySummaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Actor Role",
      value: String(safetyAdminSummary?.actorRole ?? "member").replaceAll("_", " ").toUpperCase(),
      body: "Current moderation role truth from the existing access model.",
    },
    {
      label: "Admin Access",
      value: formatBooleanStatus(!!safetyAdminSummary?.canAccessAdmin),
      body: "Current admin reach stays grounded in operator/platform doctrine.",
    },
    {
      label: "Safety Review",
      value: formatBooleanStatus(!!safetyAdminSummary?.canReviewSafetyReports),
      body: "Report review access only appears when current moderation truth allows it.",
    },
    {
      label: "Official Protection",
      value: safetyAdminSummary?.isOfficial ? "Official" : "Member",
      body: safetyAdminSummary?.auditOwnerKey
        ? `Audit owner key: ${safetyAdminSummary.auditOwnerKey}`
        : "No official or operator audit key is attached to this channel context.",
    },
  ];
  const safetySummarySecondaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Platform Roles",
      value: safetyAdminSummary?.platformRoles?.length
        ? safetyAdminSummary.platformRoles.map((role) => role.toUpperCase()).join(" · ")
        : "None",
      body: "Current platform-role memberships for the signed-in identity.",
    },
    {
      label: "Recent Safety Reports",
      value: safetyAdminSummary?.recentSafetyReportCount == null
        ? "Unavailable"
        : String(safetyAdminSummary?.recentSafetyReportCount),
      body: safetyAdminSummary?.recentSafetyReportCount == null
        ? "The current account does not have report-queue review access."
        : "Current review-queue summary from the existing safety-report foundation.",
      tone: safetyAdminSummary?.recentSafetyReportCount == null ? "unavailable" : "default",
    },
    {
      label: "Queue Sources",
      value: safetyAdminSummary?.recentSourceSurfaces == null
        ? "Unavailable"
        : safetyAdminSummary.recentSourceSurfaces.length
          ? safetyAdminSummary.recentSourceSurfaces.map((surface) => surface.replaceAll("-", " ").toUpperCase()).join(" · ")
          : "None",
      body: safetyAdminSummary?.recentSourceSurfaces == null
        ? "Recent review-source mix appears only when the current account can see the queue."
        : "Current source surfaces represented in the recent review queue slice.",
      tone: safetyAdminSummary?.recentSourceSurfaces == null ? "unavailable" : "default",
    },
    {
      label: "Platform Targets",
      value: safetyAdminSummary?.recentPlatformOwnedTargetCount == null
        ? "Unavailable"
        : String(safetyAdminSummary.recentPlatformOwnedTargetCount),
      body: safetyAdminSummary?.recentPlatformOwnedTargetCount == null
        ? "Platform-owned target count appears only when the current account can see the queue."
        : "Current number of platform-owned targets in the recent review queue slice.",
      tone: safetyAdminSummary?.recentPlatformOwnedTargetCount == null ? "unavailable" : "default",
    },
  ];
  const upcomingEvents = useMemo(
    () => creatorEvents.filter((event) => event.isUpcoming),
    [creatorEvents],
  );
  const liveNowEvents = useMemo(
    () => creatorEvents.filter((event) => event.isLiveNow),
    [creatorEvents],
  );
  const replayReadyEvents = useMemo(
    () => creatorEvents.filter((event) => event.replay.isReplayAvailableNow),
    [creatorEvents],
  );
  const reminderReadyEvents = useMemo(
    () => creatorEvents.filter((event) => event.reminder.state === "ready"),
    [creatorEvents],
  );
  const creatorReminderSummaryByEventId = useMemo(
    () => new Map(creatorReminderSummaries.map((summary) => [summary.event.id, summary])),
    [creatorReminderSummaries],
  );
  const activeReminderEnrollments = useMemo(
    () => creatorReminderSummaries.reduce((total, summary) => total + summary.activeReminderCount, 0),
    [creatorReminderSummaries],
  );
  const eventsWithReminderInterest = useMemo(
    () => creatorReminderSummaries.filter((summary) => summary.activeReminderCount > 0),
    [creatorReminderSummaries],
  );
  const analyticsEventSignalCards: readonly SummaryMetricCard[] = [
    {
      label: "Upcoming Events",
      value: String(upcomingEvents.length),
      body: "Scheduled creator events with future start times.",
    },
    {
      label: "Live Now Events",
      value: String(liveNowEvents.length),
      body: "Creator events currently marked live now.",
    },
    {
      label: "Replay Available",
      value: String(replayReadyEvents.length),
      body: "Ended creator events with replay open now.",
    },
    {
      label: "Reminder Enrollments",
      value: String(activeReminderEnrollments),
      body: "Active reminder enrollments across reminder-ready events.",
    },
  ];
  const nextUpcomingEvent = upcomingEvents[0] ?? null;
  const eventSummaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Upcoming",
      value: String(upcomingEvents.length),
      body: nextUpcomingEvent
        ? `Next up: ${nextUpcomingEvent.eventTitle}`
        : "No future scheduled event is currently backed by creator event truth.",
    },
    {
      label: "Live Now",
      value: String(liveNowEvents.length),
      body: liveNowEvents.length
        ? liveNowEvents.map((event) => event.eventTitle).slice(0, 2).join(" · ")
        : "No creator event is currently marked live now.",
    },
    {
      label: "Replay Ready",
      value: String(replayReadyEvents.length),
      body: replayReadyEvents.length
        ? "Replay is backed for ended events currently open for viewing."
        : "No creator event replay is currently available.",
    },
    {
      label: "Reminder Ready",
      value: String(reminderReadyEvents.length),
      body: reminderReadyEvents.length
        ? "Scheduled events with start times are reminder-ready."
        : "No scheduled event is currently reminder-ready.",
    },
  ];
  const reminderEnrollmentCards: readonly SummaryMetricCard[] = [
    {
      label: "Reminder Enrollments",
      value: String(activeReminderEnrollments),
      body: activeReminderEnrollments
        ? `${activeReminderEnrollments} active reminder enrollment${activeReminderEnrollments === 1 ? "" : "s"} now back this creator schedule.`
        : "No viewer has enrolled in a reminder yet.",
    },
    {
      label: "Events With Interest",
      value: String(eventsWithReminderInterest.length),
      body: eventsWithReminderInterest.length
        ? eventsWithReminderInterest.map((summary) => summary.event.eventTitle).slice(0, 2).join(" · ")
        : "No creator event currently shows reminder interest.",
      tone: eventsWithReminderInterest.length ? "default" : "unavailable",
    },
  ];

  if (authLoading || betaLoading) {
    return (
      <BetaAccessScreen
        title="Loading channel access"
        body="Checking your signed-in identity before opening channel settings."
        loadingOverride
      />
    );
  }

  if (!isSignedIn) {
    return (
      <BetaAccessScreen
        title="Sign in to manage your channel"
        body="Channel settings stay behind signed-in access because they change creator defaults and room options."
      />
    );
  }

  if (!isActive) {
    return (
      <BetaAccessScreen
        title={blockedBetaCopy.title}
        body={blockedBetaCopy.body}
        accessState={accessState.status === "loading" || accessState.status === "signed_out" || accessState.status === "active" ? null : accessState.status}
      />
    );
  }

  return (
    <ImageBackground source={SKYLINE_SOURCE} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>{appDisplayName.toUpperCase()} · CHANNEL</Text>
          <View style={{ width: 18 }} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Manage Channel</Text>
          <Text style={styles.heroBody}>
            Run public identity, room defaults, scheduling, audience workflows, and creator summaries from this route. Public channel presentation stays on `/profile/[userId]`.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading channel settings…</Text>
          </View>
        ) : !settingsEnabled ? (
          <View style={styles.disabledCard}>
            <Text style={styles.disabledTitle}>Channel settings are hidden</Text>
            <Text style={styles.disabledBody}>
              The creator settings entry is currently disabled in global app config.
            </Text>
          </View>
        ) : profile ? (
          <>
            {notice ? (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}

            <View style={styles.sectionMapCard}>
              <Text style={styles.sectionMapKicker}>CONTROL LANES</Text>
              <Text style={styles.sectionMapTitle}>Current controls first</Text>
              <Text style={styles.sectionMapBody}>
                Run what is already live here first. Build-next lanes stay visible without crowding the creator tools that already work.
              </Text>
              <Text style={styles.sectionMapSubheading}>Ready Now</Text>
              <View style={styles.sectionMapGrid}>
                {currentSectionMap.map((section) => (
                  <View key={section.title} style={styles.sectionMapItem}>
                    <View style={styles.sectionMapHeader}>
                      <Text style={styles.sectionMapItemTitle}>{section.title}</Text>
                      <View
                        style={[
                          styles.sectionStatusChip,
                          section.status === "current" && styles.sectionStatusChipCurrent,
                          section.status === "near_term" && styles.sectionStatusChipNearTerm,
                          section.status === "later_phase" && styles.sectionStatusChipLaterPhase,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sectionStatusChipText,
                            section.status === "current" && styles.sectionStatusChipTextCurrent,
                            section.status === "near_term" && styles.sectionStatusChipTextNearTerm,
                            section.status === "later_phase" && styles.sectionStatusChipTextLaterPhase,
                          ]}
                        >
                          {section.status === "current"
                            ? "CURRENT"
                            : section.status === "near_term"
                              ? "BUILD NEXT"
                              : "LATER"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.sectionMapItemBody}>{section.body}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.sectionMapSubheading}>Build Next</Text>
              <View style={styles.sectionMapGrid}>
                {buildNextSectionMap.map((section) => (
                  <View key={section.title} style={styles.sectionMapItem}>
                    <View style={styles.sectionMapHeader}>
                      <Text style={styles.sectionMapItemTitle}>{section.title}</Text>
                      <View
                        style={[
                          styles.sectionStatusChip,
                          section.status === "current" && styles.sectionStatusChipCurrent,
                          section.status === "near_term" && styles.sectionStatusChipNearTerm,
                          section.status === "later_phase" && styles.sectionStatusChipLaterPhase,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sectionStatusChipText,
                            section.status === "current" && styles.sectionStatusChipTextCurrent,
                            section.status === "near_term" && styles.sectionStatusChipTextNearTerm,
                            section.status === "later_phase" && styles.sectionStatusChipTextLaterPhase,
                          ]}
                        >
                          {section.status === "current"
                            ? "CURRENT"
                            : section.status === "near_term"
                              ? "BUILD NEXT"
                              : "LATER"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.sectionMapItemBody}>{section.body}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Identity</Text>
                <Text style={styles.panelStatus}>CURRENT CONTROL</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Display name"
                placeholderTextColor="#8d8d8d"
                value={profile.displayName ?? ""}
                onChangeText={(text) => updateProfile({ displayName: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Tagline"
                placeholderTextColor="#8d8d8d"
                value={profile.tagline ?? ""}
                onChangeText={(text) => updateProfile({ tagline: text })}
              />
              <Text style={styles.sectionLabel}>Channel Role</Text>
              <View style={styles.chipRow}>
                {(["viewer", "host", "creator"] as UserChannelRole[]).map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[styles.chip, profile.channelRole === role && styles.chipActive]}
                    onPress={() => updateProfile({ channelRole: role })}
                  >
                    <Text style={[styles.chipText, profile.channelRole === role && styles.chipTextActive]}>
                      {role.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Layout</Text>
                <Text style={styles.panelStatus}>CURRENT CONTROL</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Layout preset is already live here. Bigger shelf and tab controls can deepen later on this same route.
              </Text>
              <Text style={styles.sectionLabel}>Channel Layout Preset</Text>
              <View style={styles.chipRow}>
                {(["spotlight", "live_first", "library_first"] as const).map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.chip, (profile.channelLayoutPreset ?? "spotlight") === preset && styles.chipActive]}
                    onPress={() => updateProfile({ channelLayoutPreset: preset })}
                  >
                    <Text style={[styles.chipText, (profile.channelLayoutPreset ?? "spotlight") === preset && styles.chipTextActive]}>
                      {formatChannelLayoutPresetLabel(preset).toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.permissionCopy}>{getChannelLayoutPresetBody(profile.channelLayoutPreset)}</Text>
              <View style={styles.previewChipRow}>
                {layoutSectionHighlights.map((item) => (
                  <View key={item} style={styles.previewChip}>
                    <Text style={styles.previewChipText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Access &amp; Monetization</Text>
                <Text style={styles.panelStatus}>CURRENT CONTROL</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Lead with what is live now: room defaults are active here today, creator grants decide which paid defaults can stay on, and ad readiness still stays preparation-only.
              </Text>
              <View style={styles.accessSummaryCard}>
                <Text style={styles.accessSummaryKicker}>CURRENT ACCESS POSTURE</Text>
                <Text style={styles.accessSummaryTitle}>{accessSummary.title}</Text>
                <Text style={styles.accessSummaryBody}>{accessSummary.body}</Text>
                <View style={styles.accessSummaryRow}>
                  {accessSummaryDetails.map((detail) => (
                    <View key={detail.label} style={styles.accessSummaryDetailCard}>
                      <Text style={styles.accessSummaryDetailLabel}>{detail.label}</Text>
                      <Text style={styles.accessSummaryDetailValue}>{detail.value}</Text>
                      <Text style={styles.accessSummaryDetailBody}>{detail.body}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.accessSummaryKicker}>CURRENT CREATOR GRANTS</Text>
                <View style={styles.accessSummaryRow}>
                  {creatorGrantDetails.map((detail) => (
                    <View key={detail.label} style={styles.accessSummaryDetailCard}>
                      <Text style={styles.accessSummaryDetailLabel}>{detail.label}</Text>
                      <Text style={styles.accessSummaryDetailValue}>{detail.value}</Text>
                      <Text style={styles.accessSummaryDetailBody}>{detail.body}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Watch Party Defaults</Text>
                <Text style={styles.panelStatus}>ACTIVE DEFAULTS</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Set the shared-room posture creators can actually use now. Party Pass and Premium only stay selectable when the matching creator grant is active.
              </Text>
              <Text style={styles.sectionLabel}>Join Policy</Text>
              <View style={styles.chipRow}>
                {(["open", "locked"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, profile.defaultWatchPartyJoinPolicy === value && styles.chipActive]}
                    onPress={() => updateProfile({ defaultWatchPartyJoinPolicy: value })}
                  >
                    <Text style={[styles.chipText, profile.defaultWatchPartyJoinPolicy === value && styles.chipTextActive]}>
                      {formatJoinPolicyLabel(value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Reactions</Text>
              <View style={styles.chipRow}>
                {(["enabled", "muted"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, profile.defaultWatchPartyReactionsPolicy === value && styles.chipActive]}
                    onPress={() => updateProfile({ defaultWatchPartyReactionsPolicy: value })}
                  >
                    <Text style={[styles.chipText, profile.defaultWatchPartyReactionsPolicy === value && styles.chipTextActive]}>
                      {formatReactionsPolicyLabel(value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Content Access</Text>
              <View style={styles.chipRow}>
                {(["open", "party_pass", "premium"] as const).map((value) => {
                  const blocked =
                    (value === "party_pass" && creatorPermissions?.canUsePartyPassRooms === false)
                    || (value === "premium" && creatorPermissions?.canUsePremiumRooms === false);

                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.chip,
                        profile.defaultWatchPartyContentAccessRule === value && styles.chipActive,
                        blocked && styles.chipDisabled,
                      ]}
                      onPress={() => {
                        if (blocked) return;
                        updateProfile({ defaultWatchPartyContentAccessRule: value });
                      }}
                      disabled={blocked}
                    >
                      <Text style={[styles.chipText, profile.defaultWatchPartyContentAccessRule === value && styles.chipTextActive]}>
                        {formatRoomDefaultAccessLabel(value)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Capture Policy</Text>
              <View style={styles.chipRow}>
                {(["best_effort", "host_managed"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, profile.defaultWatchPartyCapturePolicy === value && styles.chipActive]}
                    onPress={() => updateProfile({ defaultWatchPartyCapturePolicy: value })}
                  >
                    <Text style={[styles.chipText, profile.defaultWatchPartyCapturePolicy === value && styles.chipTextActive]}>
                      {formatCapturePolicyLabel(value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Communication Defaults</Text>
                <Text style={styles.panelStatus}>ACTIVE DEFAULTS</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Use the same grant-backed access posture for Chi&apos;lly Chat-linked entry without promising broader monetization or live ads yet.
              </Text>

              <Text style={styles.sectionLabel}>Content Access</Text>
              <View style={styles.chipRow}>
                {(["open", "party_pass", "premium"] as const).map((value) => {
                  const blocked =
                    (value === "party_pass" && creatorPermissions?.canUsePartyPassRooms === false)
                    || (value === "premium" && creatorPermissions?.canUsePremiumRooms === false);

                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.chip,
                        profile.defaultCommunicationContentAccessRule === value && styles.chipActive,
                        blocked && styles.chipDisabled,
                      ]}
                      onPress={() => {
                        if (blocked) return;
                        updateProfile({ defaultCommunicationContentAccessRule: value });
                      }}
                      disabled={blocked}
                    >
                      <Text style={[styles.chipText, profile.defaultCommunicationContentAccessRule === value && styles.chipTextActive]}>
                        {formatRoomDefaultAccessLabel(value)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Capture Policy</Text>
              <View style={styles.chipRow}>
                {(["best_effort", "host_managed"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, profile.defaultCommunicationCapturePolicy === value && styles.chipActive]}
                    onPress={() => updateProfile({ defaultCommunicationCapturePolicy: value })}
                  >
                    <Text style={[styles.chipText, profile.defaultCommunicationCapturePolicy === value && styles.chipTextActive]}>
                      {formatCapturePolicyLabel(value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Content</Text>
                <Text style={styles.panelStatus}>CURRENT CONTROL</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Upload playable videos to your public channel. Drafts stay visible only to you; public videos can appear on your Profile/Channel and open in Player.
              </Text>

              {videoNotice ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.noticeText}>{videoNotice}</Text>
                </View>
              ) : null}

              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Videos</Text>
                  <Text style={styles.summaryValue}>{videosLoading ? "..." : String(creatorVideos.length)}</Text>
                  <Text style={styles.summaryBody}>creator-owned uploads in this channel library</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Public</Text>
                  <Text style={styles.summaryValue}>
                    {videosLoading ? "..." : String(creatorVideos.filter((video) => video.visibility === "public").length)}
                  </Text>
                  <Text style={styles.summaryBody}>visible to public profile visitors</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Drafts</Text>
                  <Text style={styles.summaryValue}>
                    {videosLoading ? "..." : String(creatorVideos.filter((video) => video.visibility === "draft").length)}
                  </Text>
                  <Text style={styles.summaryBody}>owner-only until published</Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Current Videos</Text>
              {videosLoading ? (
                <View style={styles.loadingCard}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.loadingText}>Loading creator videos...</Text>
                </View>
              ) : creatorVideos.length ? (
                <View style={styles.eventList}>
                  {creatorVideos.map((video) => (
                    <View key={video.id} style={styles.eventCard}>
                      <View style={styles.eventCardHeader}>
                        <View style={styles.eventCardCopy}>
                          <Text style={styles.eventCardTitle}>{video.title}</Text>
                          <Text style={styles.eventCardMeta}>{video.visibility === "public" ? "Public" : "Draft"}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.eventActionButton}
                          onPress={() => onEditVideo(video)}
                          activeOpacity={0.86}
                        >
                          <Text style={styles.eventActionButtonText}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.eventCardBody}>
                        {video.description || "No description yet."}
                        {video.fileSizeBytes ? `\nFile size: ${Math.round(video.fileSizeBytes / 1024 / 1024)} MB` : ""}
                      </Text>
                      <View style={styles.eventActionRow}>
                        <TouchableOpacity
                          style={styles.eventSecondaryButton}
                          activeOpacity={0.86}
                          onPress={() => router.push({ pathname: "/player/[id]", params: { id: video.id, source: "creator-video" } })}
                        >
                          <Text style={styles.eventSecondaryButtonText}>Open Player</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.eventSecondaryButton}
                          activeOpacity={0.86}
                          disabled={videoSaving}
                          onPress={() => {
                            void updateCreatorVideoMetadata(video.id, {
                              visibility: video.visibility === "public" ? "draft" : "public",
                            })
                              .then(() => loadCreatorVideos())
                              .then(() => setVideoNotice(video.visibility === "public" ? "Video moved to draft." : "Video published."))
                              .catch(() => setVideoNotice("Unable to update video visibility right now."));
                          }}
                        >
                          <Text style={styles.eventSecondaryButtonText}>
                            {video.visibility === "public" ? "Unpublish" : "Publish"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.eventSecondaryButton}
                          activeOpacity={0.86}
                          disabled={videoSaving}
                          onPress={() => onDeleteVideo(video)}
                        >
                          <Text style={styles.eventSecondaryButtonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>Upload your first video</Text>
                  <Text style={styles.eventEmptyBody}>
                    Your channel can now start with a real creator-owned video. Draft first, then publish when it is ready.
                  </Text>
                </View>
              )}

              <Text style={styles.sectionLabel}>
                {videoEditor.editingVideoId ? "Edit Video" : "Upload Video"}
              </Text>
              {!videoEditor.editingVideoId ? (
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  activeOpacity={0.86}
                  onPress={onPickVideoFile}
                  disabled={videoSaving}
                >
                  <Text style={styles.eventSecondaryButtonText} numberOfLines={2}>
                    {selectedVideoFile?.name ? selectedVideoFile.name : "Choose Video File"}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {selectedVideoFile && !videoEditor.editingVideoId ? (
                <Text style={styles.videoSelectedFileText} numberOfLines={2}>
                  Selected: {selectedVideoFile.name || "video file"}
                </Text>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="Video title"
                placeholderTextColor="#8d8d8d"
                value={videoEditor.title}
                onChangeText={(text) => updateVideoEditor({ title: text })}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Description"
                placeholderTextColor="#8d8d8d"
                value={videoEditor.description}
                onChangeText={(text) => updateVideoEditor({ description: text })}
                multiline
              />
              <TextInput
                style={styles.input}
                placeholder="Thumbnail URL (optional)"
                placeholderTextColor="#8d8d8d"
                value={videoEditor.thumbUrl}
                onChangeText={(text) => updateVideoEditor({ thumbUrl: text })}
                autoCapitalize="none"
              />
              <Text style={styles.sectionLabel}>Visibility</Text>
              <View style={styles.chipRow}>
                {(["draft", "public"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, videoEditor.visibility === value && styles.chipActive]}
                    onPress={() => updateVideoEditor({ visibility: value })}
                    disabled={videoSaving}
                  >
                    <Text style={[styles.chipText, videoEditor.visibility === value && styles.chipTextActive]}>
                      {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {videoSubmitRequirement ? (
                <Text style={styles.videoRequirementText}>{videoSubmitRequirement}</Text>
              ) : null}
              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={[styles.eventPrimaryButton, isVideoSubmitDisabled && styles.eventPrimaryButtonDisabled]}
                  onPress={onSaveVideo}
                  activeOpacity={0.88}
                  disabled={isVideoSubmitDisabled}
                >
                  {videoSaving ? (
                    <View style={styles.eventPrimaryButtonBusyRow}>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.eventPrimaryButtonText}>
                        {videoEditor.editingVideoId ? "Saving..." : "Uploading..."}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>
                      {videoEditor.editingVideoId ? "Update Video" : "Upload Video"}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  onPress={resetVideoEditor}
                  activeOpacity={0.88}
                  disabled={videoSaving}
                >
                  <Text style={styles.eventSecondaryButtonText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Live Events</Text>
                <Text style={styles.panelStatus}>CURRENT CONTROL</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Schedule live sessions here now. Event access and reminder delivery still stay later.
              </Text>

              {eventNotice ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.noticeText}>{eventNotice}</Text>
                </View>
              ) : null}

              <View style={styles.summaryGrid}>
                {eventSummaryCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.summaryGrid}>
                {reminderEnrollmentCards.map((card) => (
                  <View
                    key={card.label}
                    style={[styles.summaryCard, card.tone === "unavailable" && styles.summaryCardUnavailable]}
                  >
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.permissionCopy}>
                Reminder delivery still stays later. This surface shows only real reminder-ready event truth and viewer enrollment interest.
              </Text>

              <View style={styles.eventSnapshotCard}>
                <Text style={styles.accessSummaryKicker}>NEXT REAL EVENT</Text>
                <Text style={styles.accessSummaryTitle}>
                  {nextUpcomingEvent ? nextUpcomingEvent.eventTitle : "No upcoming event scheduled"}
                </Text>
                <Text style={styles.accessSummaryBody}>
                  {nextUpcomingEvent
                    ? `${formatEventTypeLabel(nextUpcomingEvent.eventType)} · ${formatIsoDate(nextUpcomingEvent.startsAt)}`
                    : "Create the first scheduled event here. Countdown, reminder delivery, and event access still stay later."}
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Current Events</Text>
              {eventsLoading ? (
                <View style={styles.loadingCard}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.loadingText}>Loading creator events…</Text>
                </View>
              ) : creatorEvents.length ? (
                <View style={styles.eventList}>
                  {creatorEvents.map((event) => {
                    const reminderSummary = creatorReminderSummaryByEventId.get(event.id);

                    return (
                    <View key={event.id} style={styles.eventCard}>
                      <View style={styles.eventCardHeader}>
                        <View style={styles.eventCardCopy}>
                          <Text style={styles.eventCardTitle}>{event.eventTitle}</Text>
                          <Text style={styles.eventCardMeta}>
                            {formatEventTypeLabel(event.eventType)} · {formatEventStatusLabel(event.status)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.eventActionButton}
                          onPress={() => onEditEvent(event)}
                          activeOpacity={0.86}
                        >
                          <Text style={styles.eventActionButtonText}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.eventCardBody}>
                        Starts: {formatIsoDate(event.startsAt)}{"\n"}
                        Ends: {formatIsoDate(event.endsAt)}{"\n"}
                        Replay: {formatReplayPolicyLabel(event.replayPolicy)} · {formatReplayStateLabel(event)}{"\n"}
                        Reminder: {formatReminderLabel(event)} · {reminderSummary?.activeReminderCount ?? 0} active enrollment{(reminderSummary?.activeReminderCount ?? 0) === 1 ? "" : "s"}
                        {reminderSummary?.canceledReminderCount
                          ? `\nCanceled reminders: ${reminderSummary.canceledReminderCount}`
                          : ""}
                        {event.linkedTitleId ? `\nLinked title: ${event.linkedTitleId}` : ""}
                      </Text>
                    </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>No creator events yet</Text>
                  <Text style={styles.eventEmptyBody}>
                    Scheduled event truth is backed, but nothing has been created for this channel yet.
                  </Text>
                </View>
              )}

              <Text style={styles.sectionLabel}>
                {eventEditor.editingEventId ? "Edit Event" : "Create Event"}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Event title"
                placeholderTextColor="#8d8d8d"
                value={eventEditor.eventTitle}
                onChangeText={(text) => updateEventEditor({ eventTitle: text })}
              />

              <Text style={styles.sectionLabel}>Event Type</Text>
              <View style={styles.chipRow}>
                {(["live_first", "live_watch_party", "watch_party_live"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, eventEditor.eventType === value && styles.chipActive]}
                    onPress={() => updateEventEditor({ eventType: value })}
                  >
                    <Text style={[styles.chipText, eventEditor.eventType === value && styles.chipTextActive]}>
                      {formatEventTypeLabel(value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Status</Text>
              <View style={styles.chipRow}>
                {(["draft", "scheduled", "live_now", "ended", "replay_available", "expired", "canceled"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, eventEditor.status === value && styles.chipActive]}
                    onPress={() => updateEventEditor({ status: value, reminderReady: value === "scheduled" ? eventEditor.reminderReady : false })}
                  >
                    <Text style={[styles.chipText, eventEditor.status === value && styles.chipTextActive]}>
                      {formatEventStatusLabel(value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.input}
                placeholder="Starts at (YYYY-MM-DDTHH:mm)"
                placeholderTextColor="#8d8d8d"
                value={eventEditor.startsAt}
                onChangeText={(text) => updateEventEditor({ startsAt: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Ends at (YYYY-MM-DDTHH:mm)"
                placeholderTextColor="#8d8d8d"
                value={eventEditor.endsAt}
                onChangeText={(text) => updateEventEditor({ endsAt: text })}
              />

              {eventEditor.eventType === "watch_party_live" ? (
                <TextInput
                  style={styles.input}
                  placeholder="Linked title id"
                  placeholderTextColor="#8d8d8d"
                  value={eventEditor.linkedTitleId}
                  onChangeText={(text) => updateEventEditor({ linkedTitleId: text })}
                />
              ) : null}

              <Text style={styles.sectionLabel}>Replay Policy</Text>
              <View style={styles.chipRow}>
                {(["none", "indefinite", "until_expiration"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, eventEditor.replayPolicy === value && styles.chipActive]}
                    onPress={() => updateEventEditor({ replayPolicy: value })}
                  >
                    <Text style={[styles.chipText, eventEditor.replayPolicy === value && styles.chipTextActive]}>
                      {formatReplayPolicyLabel(value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {eventEditor.replayPolicy !== "none" ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Replay available at (YYYY-MM-DDTHH:mm)"
                    placeholderTextColor="#8d8d8d"
                    value={eventEditor.replayAvailableAt}
                    onChangeText={(text) => updateEventEditor({ replayAvailableAt: text })}
                  />
                  {eventEditor.replayPolicy === "until_expiration" ? (
                    <TextInput
                      style={styles.input}
                      placeholder="Replay expires at (YYYY-MM-DDTHH:mm)"
                      placeholderTextColor="#8d8d8d"
                      value={eventEditor.replayExpiresAt}
                      onChangeText={(text) => updateEventEditor({ replayExpiresAt: text })}
                    />
                  ) : null}
                </>
              ) : null}

              <Text style={styles.sectionLabel}>Reminder Readiness</Text>
              <View style={styles.chipRow}>
                {(["off", "ready"] as const).map((value) => {
                  const active = value === "ready" ? eventEditor.reminderReady : !eventEditor.reminderReady;
                  const disabled = value === "ready" && eventEditor.status !== "scheduled";

                  return (
                    <TouchableOpacity
                      key={value}
                      style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
                      onPress={() => {
                        if (disabled) return;
                        updateEventEditor({ reminderReady: value === "ready" });
                      }}
                      disabled={disabled}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {value === "ready" ? "READY" : "OFF"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.permissionCopy}>
                Reminder readiness is only honest for scheduled events with a real start time. Delivery still lands later.
              </Text>

              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={styles.eventPrimaryButton}
                  onPress={onSaveEvent}
                  activeOpacity={0.88}
                  disabled={eventSaving}
                >
                  {eventSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>
                      {eventEditor.editingEventId ? "Update Event" : "Create Event"}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  onPress={() => {
                    resetEventEditor();
                    setEventNotice(null);
                  }}
                  activeOpacity={0.86}
                  disabled={eventSaving}
                >
                  <Text style={styles.eventSecondaryButtonText}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Audience</Text>
                <Text style={styles.panelStatus}>CURRENT CONTROL</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Counts and visibility values come from the landed audience read model. Deeper audience-role systems still stay later.
              </Text>
              <View style={styles.summaryGrid}>
                {audienceSummaryCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.summaryGrid}>
                {audienceVisibilityCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.summaryGrid}>
                {audienceUnavailableCards.map((card) => (
                  <View key={card.label} style={[styles.summaryCard, styles.summaryCardUnavailable]}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.eventSnapshotCard}>
                <Text style={styles.accessSummaryKicker}>LIVE WORKFLOWS</Text>
                <Text style={styles.accessSummaryTitle}>Real audience actions live here now</Text>
                <Text style={styles.accessSummaryBody}>
                  Follower removal, request review, and block workflows are real here now. Subscriber mutation and VIP/mod/co-host systems still stay later.
                </Text>
              </View>

              {audienceActionNotice ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.noticeText}>{audienceActionNotice}</Text>
                </View>
              ) : null}

              {audienceActionSummaryCards.length ? (
                <View style={styles.summaryGrid}>
                  {audienceActionSummaryCards.map((card) => (
                    <View key={card.label} style={styles.summaryCard}>
                      <Text style={styles.summaryLabel}>{card.label}</Text>
                      <Text style={styles.summaryValue}>{card.value}</Text>
                      <Text style={styles.summaryBody}>{card.body}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>Request Review</Text>
              <Text style={styles.permissionCopy}>
                Enter a backed request id to approve, decline, or cancel it. `follow` requests are real now; `subscriber_access` stays unsupported until subscriber mutation truth exists.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Audience request id"
                placeholderTextColor="#8d8d8d"
                value={audienceRequestIdInput}
                onChangeText={(text) => {
                  setAudienceRequestIdInput(text);
                  setAudienceActionNotice(null);
                }}
                keyboardType="number-pad"
              />
              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={styles.eventPrimaryButton}
                  onPress={() => {
                    const requestId = Number.parseInt(audienceRequestIdInput, 10);
                    if (!Number.isFinite(requestId) || requestId <= 0) {
                      setAudienceActionNotice("Enter a valid audience request id before approving.");
                      return;
                    }
                    void runAudienceAction("approve_request", async () => {
                      const result = await approveChannelAudienceRequest(requestId);
                      if (result.status === "completed" || result.status === "unsupported" || result.status === "noop") {
                        setAudienceRequestIdInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.88}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "approve_request" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>Approve</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  onPress={() => {
                    const requestId = Number.parseInt(audienceRequestIdInput, 10);
                    if (!Number.isFinite(requestId) || requestId <= 0) {
                      setAudienceActionNotice("Enter a valid audience request id before declining.");
                      return;
                    }
                    void runAudienceAction("decline_request", async () => {
                      const result = await declineChannelAudienceRequest(requestId);
                      if (result.status === "completed" || result.status === "noop") {
                        setAudienceRequestIdInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.86}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "decline_request" ? (
                    <ActivityIndicator color="#D9E0EE" />
                  ) : (
                    <Text style={styles.eventSecondaryButtonText}>Decline</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  onPress={() => {
                    const requestId = Number.parseInt(audienceRequestIdInput, 10);
                    if (!Number.isFinite(requestId) || requestId <= 0) {
                      setAudienceActionNotice("Enter a valid audience request id before canceling.");
                      return;
                    }
                    void runAudienceAction("cancel_request", async () => {
                      const result = await cancelChannelAudienceRequest(requestId);
                      if (result.status === "completed" || result.status === "noop") {
                        setAudienceRequestIdInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.86}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "cancel_request" ? (
                    <ActivityIndicator color="#D9E0EE" />
                  ) : (
                    <Text style={styles.eventSecondaryButtonText}>Cancel</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>Follower Relationship</Text>
              <Text style={styles.permissionCopy}>
                Remove a backed follower relationship by follower user id when creator-side cleanup is needed. This stays separate from viewer-side follow or unfollow actions and does not invent subscriber mutation.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Follower user id"
                placeholderTextColor="#8d8d8d"
                value={audienceFollowerUserIdInput}
                onChangeText={(text) => {
                  setAudienceFollowerUserIdInput(text);
                  setAudienceActionNotice(null);
                }}
                autoCapitalize="none"
              />
              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={styles.eventPrimaryButton}
                  onPress={() => {
                    const followerUserId = String(audienceFollowerUserIdInput).trim();
                    if (!followerUserId) {
                      setAudienceActionNotice("Enter a follower user id before removing a follower relationship.");
                      return;
                    }
                    void runAudienceAction("remove_follower", async () => {
                      const result = await removeChannelFollower({
                        channelUserId: String(user?.id ?? ""),
                        followerUserId,
                      });
                      if (result.status === "completed" || result.status === "noop") {
                        setAudienceFollowerUserIdInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.88}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "remove_follower" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>Remove Follower</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>Blocked Audience</Text>
              <Text style={styles.permissionCopy}>
                Block and unblock use the real channel-owned audience boundary already backed by schema truth. VIP, moderator, and co-host roles still stay out.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Audience member user id"
                placeholderTextColor="#8d8d8d"
                value={audienceTargetUserIdInput}
                onChangeText={(text) => {
                  setAudienceTargetUserIdInput(text);
                  setAudienceActionNotice(null);
                }}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Block reason (optional)"
                placeholderTextColor="#8d8d8d"
                value={audienceBlockReasonInput}
                onChangeText={(text) => {
                  setAudienceBlockReasonInput(text);
                  setAudienceActionNotice(null);
                }}
              />
              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={styles.eventPrimaryButton}
                  onPress={() => {
                    const blockedUserId = String(audienceTargetUserIdInput).trim();
                    if (!blockedUserId) {
                      setAudienceActionNotice("Enter an audience member user id before blocking.");
                      return;
                    }
                    void runAudienceAction("block", async () => {
                      const result = await blockChannelAudienceMember({
                        channelUserId: String(user?.id ?? ""),
                        blockedUserId,
                        reason: String(audienceBlockReasonInput).trim() || null,
                      });
                      if (result.status === "completed" || result.status === "noop") {
                        setAudienceTargetUserIdInput("");
                        setAudienceBlockReasonInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.88}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "block" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>Block</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  onPress={() => {
                    const blockedUserId = String(audienceTargetUserIdInput).trim();
                    if (!blockedUserId) {
                      setAudienceActionNotice("Enter an audience member user id before unblocking.");
                      return;
                    }
                    void runAudienceAction("unblock", async () => {
                      const result = await unblockChannelAudienceMember({
                        channelUserId: String(user?.id ?? ""),
                        blockedUserId,
                      });
                      if (result.status === "completed" || result.status === "noop") {
                        setAudienceTargetUserIdInput("");
                        setAudienceBlockReasonInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.86}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "unblock" ? (
                    <ActivityIndicator color="#D9E0EE" />
                  ) : (
                    <Text style={styles.eventSecondaryButtonText}>Unblock</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={[styles.summaryCard, styles.summaryCardUnavailable, styles.audienceWorkflowLimitCard]}>
                <Text style={styles.summaryLabel}>Later</Text>
                <Text style={styles.summaryValue}>Subscriber / VIP / Roles</Text>
                <Text style={styles.summaryBody}>
                  {subscriberMutationSupport.message} VIP/mod/co-host workflows also stay out until the chapter lands real supporting helper truth.
                </Text>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Analytics</Text>
                <Text style={styles.panelStatus}>CURRENT SUMMARY</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Only backed creator analytics render here. Unsupported metrics stay unavailable instead of being zeroed or fabricated.
              </Text>
              <Text style={styles.sectionLabel}>Room And Audience Signals</Text>
              <View style={styles.summaryGrid}>
                {analyticsSummaryCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.sectionLabel}>Live / Event Signals</Text>
              <View style={styles.summaryGrid}>
                {analyticsEventSignalCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.sectionLabel}>Unavailable / Later</Text>
              <View style={styles.summaryGrid}>
                {analyticsUnavailableCards.map((card) => (
                  <View key={card.label} style={[styles.summaryCard, styles.summaryCardUnavailable]}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Safety/Admin</Text>
                <Text style={styles.panelStatus}>CURRENT SUMMARY</Text>
              </View>
              <Text style={styles.permissionCopy}>
                This section shows only the role, access, and report signals the current moderation model already supports.
              </Text>
              <View style={styles.summaryGrid}>
                {safetySummaryCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.summaryGrid}>
                {safetySummarySecondaryCards.map((card) => (
                  <View
                    key={card.label}
                    style={[
                      styles.summaryCard,
                      card.tone === "unavailable" && styles.summaryCardUnavailable,
                    ]}
                  >
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.panel, styles.panelSubtle]}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Design</Text>
                <Text style={styles.panelStatusMuted}>BUILD NEXT</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Hero, avatar framing, accent tone, and visible brand treatment can deepen here later without leaving this route.
              </Text>
              <View style={styles.previewChipRow}>
                {designSectionHighlights.map((item) => (
                  <View key={item} style={styles.previewChip}>
                    <Text style={styles.previewChipText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={onSave} activeOpacity={0.88} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Channel Settings</Text>}
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,8,14,0.8)",
  },
  content: {
    paddingTop: 54,
    paddingBottom: 44,
    paddingHorizontal: 16,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backArrow: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  kicker: {
    color: "#AAB3C7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,24,0.88)",
    padding: 16,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
  },
  heroBody: {
    color: "#B8C1D6",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontWeight: "600",
  },
  permissionCopy: {
    color: "#93A0B8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  loadingCard: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: "rgba(14,18,26,0.88)",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#D5DDED",
    fontSize: 13,
    fontWeight: "700",
  },
  disabledCard: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: "rgba(25,18,18,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  disabledTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  disabledBody: {
    color: "#C4CAD7",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  noticeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(45,153,92,0.45)",
    backgroundColor: "rgba(45,153,92,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    color: "#F4FFF7",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionMapCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.16)",
    backgroundColor: "rgba(10,14,24,0.9)",
    padding: 16,
    gap: 10,
  },
  sectionMapKicker: {
    color: "#8D98B1",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  sectionMapTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  sectionMapBody: {
    color: "#BBC4D8",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  sectionMapSubheading: {
    color: "#AAB6CD",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 2,
  },
  sectionMapGrid: {
    gap: 10,
  },
  sectionMapItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 6,
  },
  sectionMapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionMapItemTitle: {
    color: "#F3F6FF",
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 1,
  },
  sectionMapItemBody: {
    color: "#AFB8CD",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  sectionStatusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sectionStatusChipCurrent: {
    borderColor: "rgba(45,153,92,0.4)",
    backgroundColor: "rgba(45,153,92,0.16)",
  },
  sectionStatusChipNearTerm: {
    borderColor: "rgba(115,134,255,0.28)",
    backgroundColor: "rgba(115,134,255,0.14)",
  },
  sectionStatusChipLaterPhase: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  sectionStatusChipText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionStatusChipTextCurrent: {
    color: "#D9FFE6",
  },
  sectionStatusChipTextNearTerm: {
    color: "#E1E7FF",
  },
  sectionStatusChipTextLaterPhase: {
    color: "#B0BACD",
  },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,24,0.9)",
    padding: 16,
  },
  panelSubtle: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(10,14,22,0.74)",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  panelTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },
  panelStatus: {
    color: "#D6FFE4",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  panelStatusMuted: {
    color: "#97A4BE",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  sectionLabel: {
    color: "#AAB6CD",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: "#DC143C",
    backgroundColor: "rgba(220,20,60,0.22)",
  },
  chipDisabled: {
    opacity: 0.42,
  },
  chipText: {
    color: "#DADFEA",
    fontSize: 11,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#fff",
  },
  previewChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.2)",
    backgroundColor: "rgba(115,134,255,0.1)",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  previewChipText: {
    color: "#E1E7FF",
    fontSize: 11,
    fontWeight: "700",
  },
  accessSummaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.18)",
    backgroundColor: "rgba(17,24,40,0.82)",
    padding: 14,
    gap: 8,
  },
  accessSummaryKicker: {
    color: "#8D97AD",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  accessSummaryTitle: {
    color: "#F4F7FF",
    fontSize: 18,
    fontWeight: "900",
  },
  accessSummaryBody: {
    color: "#B8C0D4",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  accessSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  accessSummaryDetailCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 96,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  accessSummaryDetailLabel: {
    color: "#8590A6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  accessSummaryDetailValue: {
    color: "#F3F6FF",
    fontSize: 15,
    fontWeight: "900",
  },
  accessSummaryDetailBody: {
    color: "#ACB5C9",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  summaryCardUnavailable: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  summaryLabel: {
    color: "#8590A6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  summaryValue: {
    color: "#F3F6FF",
    fontSize: 15,
    fontWeight: "900",
  },
  summaryBody: {
    color: "#ACB5C9",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  audienceWorkflowLimitCard: {
    marginTop: 12,
  },
  eventSnapshotCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(31,15,22,0.84)",
    padding: 14,
    marginTop: 10,
    marginBottom: 12,
    gap: 8,
  },
  eventList: {
    gap: 10,
    marginBottom: 10,
  },
  eventCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  eventCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  eventCardCopy: {
    flex: 1,
    gap: 4,
  },
  eventCardTitle: {
    color: "#F3F6FF",
    fontSize: 15,
    fontWeight: "900",
  },
  eventCardMeta: {
    color: "#98A5C0",
    fontSize: 11.5,
    fontWeight: "800",
  },
  eventCardBody: {
    color: "#B8C0D4",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  eventActionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.24)",
    backgroundColor: "rgba(115,134,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  eventActionButtonText: {
    color: "#E1E7FF",
    fontSize: 11.5,
    fontWeight: "800",
  },
  eventEmptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 4,
  },
  eventEmptyTitle: {
    color: "#F3F6FF",
    fontSize: 14,
    fontWeight: "900",
  },
  eventEmptyBody: {
    color: "#ACB5C9",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  eventActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  eventPrimaryButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#DC143C",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  eventPrimaryButtonDisabled: {
    backgroundColor: "rgba(220,20,60,0.38)",
  },
  eventPrimaryButtonBusyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  eventPrimaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  eventSecondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  eventSecondaryButtonText: {
    color: "#D9E0EE",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  videoSelectedFileText: {
    color: "#ACB5C9",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  videoRequirementText: {
    color: "#F4B4C0",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  saveButton: {
    borderRadius: 14,
    backgroundColor: "#DC143C",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
});
