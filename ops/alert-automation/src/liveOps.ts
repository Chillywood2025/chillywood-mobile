import type { AlertmanagerAlert } from "./jobs.js";

export type LiveOpsRoute = "Live Watch-Party" | "Watch-Party Live" | "Chi'lly Chat";
export type LiveOpsAffectedPurpose =
  | "live-stage"
  | "watch-party-live"
  | "chat-call"
  | "chat-video-call"
  | "chat-audio-call";
export type LiveOpsCallMode = "voice" | "video";
export type LiveOpsConfidence = "low" | "medium" | "high";
export type LiveOpsRiskLevel = "low" | "medium" | "high" | "critical";

export type LiveOpsActionType =
  | "create_github_issue"
  | "create_github_pr"
  | "rerun_github_actions_job"
  | "drain_livekit_server"
  | "block_new_rooms_on_server"
  | "route_to_standby"
  | "clear_stale_room_assignment"
  | "clean_stale_chat_call"
  | "restart_livekit_service"
  | "rollback_last_infra_deploy";

export type LiveOpsIncidentPlan = {
  title: string;
  affectedRoute: LiveOpsRoute;
  affectedPurpose: LiveOpsAffectedPurpose;
  affectedPlatform: string;
  affectedRooms: string[];
  affectedServerId?: string;
  affectedThreadId?: string;
  affectedCallId?: string;
  callMode?: LiveOpsCallMode;
  detectedSymptoms: string[];
  likelyCause: string;
  confidence: LiveOpsConfidence;
  suggestedFix: string;
  riskLevel: LiveOpsRiskLevel;
  recommendedAction: LiveOpsActionType;
  rollbackNote: string;
  runbookPath: string;
  runbookUrl?: string;
  metadata: Record<string, string | number | boolean | null>;
};

const RUNBOOK_PATH = "docs/admin/LIVE_OPS_FIX_CENTER.md";

const TEXT_TRUE = new Set(["1", "true", "yes", "on", "y"]);

const toText = (value: unknown) => String(value ?? "").trim();

const lower = (value: unknown) => toText(value).toLowerCase();

const toNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const truthy = (value: unknown) => TEXT_TRUE.has(lower(value));

const joinedText = (alert: AlertmanagerAlert) =>
  [
    alert.labels.alertname,
    ...Object.values(alert.labels),
    ...Object.values(alert.annotations ?? {})
  ].map(lower).join(" ");

const pickText = (alert: AlertmanagerAlert, keys: string[]) => {
  for (const key of keys) {
    const value = toText(alert.labels[key] ?? alert.annotations?.[key]);
    if (value) return value;
  }
  return "";
};

const pickNumber = (alert: AlertmanagerAlert, keys: string[]) => {
  for (const key of keys) {
    const value = toNumber(alert.labels[key] ?? alert.annotations?.[key]);
    if (value !== null) return value;
  }
  return null;
};

const includesAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

const compact = (items: Array<string | undefined | null>) =>
  [...new Set(items.map((item) => toText(item)).filter(Boolean))];

const callModeFromAlert = (alert: AlertmanagerAlert): LiveOpsCallMode | undefined => {
  const explicit = lower(pickText(alert, ["call_mode", "media_kind", "call_type", "mode"]));
  if (includesAny(explicit, ["video", "camera"])) return "video";
  if (includesAny(explicit, ["voice", "audio", "mic", "microphone"])) return "voice";

  const text = joinedText(alert);
  if (includesAny(text, ["chat-video-call", "video call", "camera publish", "black screen", "no remote video"])) {
    return "video";
  }
  if (includesAny(text, ["chat-audio-call", "audio call", "voice call", "microphone publish"])) {
    return "voice";
  }
  return undefined;
};

const chatPurposeForMode = (mode?: LiveOpsCallMode): LiveOpsAffectedPurpose => {
  if (mode === "video") return "chat-video-call";
  if (mode === "voice") return "chat-audio-call";
  return "chat-call";
};

const purposeFromAlert = (alert: AlertmanagerAlert): LiveOpsAffectedPurpose | null => {
  const explicit = lower(pickText(alert, [
    "affected_purpose",
    "purpose",
    "surface",
    "room_type",
    "affected_route",
    "route",
  ]));
  const mode = callModeFromAlert(alert);

  if (includesAny(explicit, ["chat-video-call", "chat_video_call"])) return "chat-video-call";
  if (includesAny(explicit, ["chat-audio-call", "chat_audio_call", "chat-voice-call", "chat_voice_call"])) {
    return "chat-audio-call";
  }
  if (includesAny(explicit, ["chat-call", "chat_call", "communication", "chilly chat", "chi'lly chat"])) {
    return chatPurposeForMode(mode);
  }
  if (includesAny(explicit, ["watch-party-live", "watch_party_live", "party room"])) return "watch-party-live";
  if (includesAny(explicit, ["live-stage", "live_stage", "live watch-party", "live_watch_party"])) return "live-stage";

  const text = joinedText(alert);
  if (includesAny(text, [
    "chat-call",
    "chat_call",
    "chat video call",
    "chat audio call",
    "chilly chat call",
    "chi'lly chat call",
    "communication room",
    "communication_rooms",
  ])) {
    return chatPurposeForMode(mode);
  }
  if (includesAny(text, ["watch-party live", "watch_party_live", "party room"])) return "watch-party-live";
  if (includesAny(text, ["live watch-party", "live_watch_party", "live stage", "live-stage", "live_stage"])) return "live-stage";
  if (includesAny(text, ["liveops", "live ops", "livekit", "turn", "signaling", "blank feed", "join failure"])) {
    return "live-stage";
  }
  return null;
};

const routeFromPurpose = (purpose: LiveOpsAffectedPurpose): LiveOpsRoute => {
  if (purpose === "watch-party-live") return "Watch-Party Live";
  if (purpose.startsWith("chat-")) return "Chi'lly Chat";
  return "Live Watch-Party";
};

const platformFromAlert = (alert: AlertmanagerAlert) => {
  const platform = lower(pickText(alert, ["affected_platform", "platform", "os", "client_platform"]));
  if (platform.includes("android")) return "Android";
  if (platform.includes("ios") || platform.includes("iphone") || platform.includes("ipad")) return "iOS";
  if (platform.includes("cellular")) return "mobile cellular";
  return toText(pickText(alert, ["affected_platform", "platform", "os", "client_platform"])) || "mobile";
};

const roomsFromAlert = (alert: AlertmanagerAlert) =>
  compact([
    alert.labels.room,
    alert.labels.livekit_room,
    alert.labels.livekit_room_name,
    alert.labels.app_room_id,
    alert.labels.party_id,
    alert.annotations?.room,
    alert.annotations?.livekit_room_name,
    alert.annotations?.app_room_id,
    alert.annotations?.party_id,
  ]);

const callIdFromAlert = (alert: AlertmanagerAlert) =>
  toText(pickText(alert, ["affected_call_id", "call_id", "communication_room_id", "communication_room", "room_id"]));

const threadIdFromAlert = (alert: AlertmanagerAlert) =>
  toText(pickText(alert, ["affected_thread_id", "thread_id", "chat_thread_id"]));

const metadataFromAlert = (alert: AlertmanagerAlert): Record<string, string | number | boolean | null> => {
  const safeKeys = [
    "alertname",
    "severity",
    "route",
    "affected_route",
    "purpose",
    "affected_purpose",
    "surface",
    "room_type",
    "platform",
    "affected_platform",
    "server_id",
    "standby_server_id",
    "github_job_id",
    "fix_branch",
    "room",
    "livekit_room_name",
    "app_room_id",
    "assignment_id",
    "thread_id",
    "chat_thread_id",
    "call_id",
    "communication_room_id",
    "call_mode",
    "media_kind",
  ];
  const output: Record<string, string | number | boolean | null> = {};
  for (const key of safeKeys) {
    const value = alert.labels[key] ?? alert.annotations?.[key];
    if (value != null && toText(value)) output[key] = toText(value);
  }
  return output;
};

const buildIncident = (
  alert: AlertmanagerAlert,
  fields: Omit<
    LiveOpsIncidentPlan,
    | "affectedCallId"
    | "affectedPlatform"
    | "affectedPurpose"
    | "affectedRooms"
    | "affectedRoute"
    | "affectedThreadId"
    | "callMode"
    | "metadata"
    | "runbookPath"
    | "runbookUrl"
  >,
): LiveOpsIncidentPlan | null => {
  const affectedPurpose = purposeFromAlert(alert);
  if (!affectedPurpose) return null;

  const runbookUrl = toText(alert.annotations?.runbook_url || alert.labels.runbook_url);
  const callMode = callModeFromAlert(alert)
    ?? (affectedPurpose === "chat-video-call" ? "video" : affectedPurpose === "chat-audio-call" ? "voice" : undefined);
  const affectedCallId = callIdFromAlert(alert);
  const affectedThreadId = threadIdFromAlert(alert);
  return {
    ...fields,
    affectedCallId: affectedCallId || undefined,
    affectedPlatform: platformFromAlert(alert),
    affectedPurpose,
    affectedRooms: roomsFromAlert(alert),
    affectedRoute: routeFromPurpose(affectedPurpose),
    affectedThreadId: affectedThreadId || undefined,
    callMode,
    metadata: metadataFromAlert(alert),
    runbookPath: RUNBOOK_PATH,
    runbookUrl: runbookUrl || undefined,
  };
};

export function classifyLiveOpsIncident(alert: AlertmanagerAlert): LiveOpsIncidentPlan | null {
  if ((alert.status ?? "firing") !== "firing") return null;

  const text = joinedText(alert);
  const alertname = lower(alert.labels.alertname);
  const affectedPurpose = purposeFromAlert(alert);
  const isChatCall = affectedPurpose?.startsWith("chat-") === true;
  const serverId = pickText(alert, ["server_id", "instance", "livekit_server_id"]);
  const joinFailures = pickNumber(alert, ["join_failures", "join_failure_count", "failed_joins", "call_start_failures"]);
  const tokenErrors = pickNumber(alert, ["token_errors", "token_error_count", "token_issue_failures"]);
  const signalingErrors = pickNumber(alert, ["signaling_errors", "signaling_error_count"]);
  const joinedUsers = pickNumber(alert, ["joined_users", "participants_joined", "active_participants", "call_joined_users"]);
  const blankFeeds = pickNumber(alert, ["blank_feeds", "blank_feed_count", "black_video_count", "blank_screen_count"]);
  const relayBytes = pickNumber(alert, ["relay_bytes", "turn_relay_bytes", "relay_bytes_per_second"]);
  const normalRelay = truthy(alert.labels.relay_bytes_normal ?? alert.annotations?.relay_bytes_normal);
  const lowRelay = truthy(alert.labels.low_relay_bytes ?? alert.annotations?.low_relay_bytes)
    || (relayBytes !== null && relayBytes <= 0);
  const bothJoined = truthy(alert.labels.both_users_joined ?? alert.annotations?.both_users_joined)
    || (joinedUsers !== null && joinedUsers >= 2)
    || includesAny(text, ["both users joined", "caller and callee joined"]);
  const noRemoteMedia = includesAny(text, [
    "remote audio/video never established",
    "remote media never established",
    "no remote media",
    "no remote video",
    "black screen",
    "blank screen",
  ]) || (blankFeeds ?? 0) > 0;

  if (
    includesAny(text, ["bad node", "node unhealthy", "single node", "livekit node"])
    || alertname.includes("livekitnodeunhealthy")
    || truthy(alert.labels.bad_node ?? alert.annotations?.bad_node)
  ) {
    return buildIncident(alert, {
      title: isChatCall ? "Chat call LiveKit node health degradation" : "LiveKit node health degradation",
      affectedServerId: serverId || undefined,
      confidence: serverId ? "high" : "medium",
      detectedSymptoms: compact(["one LiveKit node reported unhealthy", serverId ? `server ${serverId}` : null]),
      likelyCause: "One LiveKit node is unhealthy while routing can keep new rooms and calls away from it.",
      recommendedAction: "drain_livekit_server",
      riskLevel: "medium",
      rollbackNote: "Set the server back to active after heartbeat, media, and join checks pass.",
      suggestedFix: "Mark the unhealthy server draining so existing sessions stay put while new sessions avoid it.",
    });
  }

  if (
    isChatCall
    && (
      includesAny(text, ["ended call still joinable", "ended call joinable", "stale active call", "call cleanup failed"])
      || truthy(alert.labels.ended_call_joinable ?? alert.annotations?.ended_call_joinable)
      || truthy(alert.labels.stale_active_call ?? alert.annotations?.stale_active_call)
      || truthy(alert.labels.call_cleanup_failed ?? alert.annotations?.call_cleanup_failed)
    )
  ) {
    const endedJoinable = includesAny(text, ["ended call still joinable", "ended call joinable"])
      || truthy(alert.labels.ended_call_joinable ?? alert.annotations?.ended_call_joinable);
    return buildIncident(alert, {
      title: endedJoinable ? "Chi'lly Chat ended call still joinable" : "Chi'lly Chat stale call cleanup needed",
      affectedServerId: serverId || undefined,
      confidence: "high",
      detectedSymptoms: compact([
        endedJoinable ? "ended call still appears joinable" : "stale call still appears active",
        truthy(alert.labels.call_cleanup_failed ?? alert.annotations?.call_cleanup_failed) ? "call cleanup failed" : null,
      ]),
      likelyCause: endedJoinable
        ? "Call lifecycle/security state is out of sync with communication room truth."
        : "Cleanup/expiration left a stale active call reference.",
      recommendedAction: "clean_stale_chat_call",
      riskLevel: "high",
      rollbackNote: "If the call is still valid, leave state unchanged and allow the normal chat call flow to refresh it.",
      suggestedFix: "Dry-run stale call cleanup, then clear only server-proven expired or ended call state after approval.",
    });
  }

  if (
    isChatCall
    && (
      includesAny(text, ["call start failed", "start call failed", "room create failed"])
      || (joinFailures !== null && includesAny(text, ["call start", "start call"]))
    )
  ) {
    return buildIncident(alert, {
      title: "Chi'lly Chat call start failures",
      affectedServerId: serverId || undefined,
      confidence: joinFailures !== null ? "high" : "medium",
      detectedSymptoms: compact([joinFailures !== null ? `${joinFailures} call start failures` : "call start failed"]),
      likelyCause: "Chat call room creation, thread call state, or LiveKit handoff is failing.",
      recommendedAction: "create_github_issue",
      riskLevel: "medium",
      rollbackNote: "No production code is merged or deployed by the issue action.",
      suggestedFix: "Create a code-level issue for chat call start, room creation, and thread active-call state proof.",
    });
  }

  if (
    isChatCall
    && includesAny(text, ["token", "signaling", "signal"])
    && (joinFailures === null || joinFailures > 0)
    && ((tokenErrors ?? 0) > 0 || (signalingErrors ?? 0) > 0 || includesAny(text, ["token issue failed", "signaling failed"]))
  ) {
    return buildIncident(alert, {
      title: tokenErrors !== null && tokenErrors > 0 ? "Chi'lly Chat call token failures" : "Chi'lly Chat call signaling failures",
      affectedServerId: serverId || undefined,
      confidence: tokenErrors !== null || signalingErrors !== null ? "high" : "medium",
      detectedSymptoms: compact([
        joinFailures !== null ? `${joinFailures} call join/start failures` : "call join/start failures",
        tokenErrors !== null ? `${tokenErrors} token errors` : includesAny(text, ["token"]) ? "token errors" : null,
        signalingErrors !== null ? `${signalingErrors} signaling errors` : includesAny(text, ["signaling", "signal"]) ? "signaling errors" : null,
      ]),
      likelyCause: tokenErrors !== null && tokenErrors > 0
        ? "Chat-call token issuer/config problem."
        : "LiveKit signaling/server problem for chat-call.",
      recommendedAction: "create_github_issue",
      riskLevel: "medium",
      rollbackNote: "No production code is merged or deployed by the issue action.",
      suggestedFix: "Create a code-level issue for chat-call token/signaling proof without changing call permissions.",
    });
  }

  if (
    isChatCall
    && (
      includesAny(text, ["caller joined but callee did not", "callee did not join"])
      || (truthy(alert.labels.caller_joined ?? alert.annotations?.caller_joined)
        && !truthy(alert.labels.callee_joined ?? alert.annotations?.callee_joined))
    )
  ) {
    return buildIncident(alert, {
      title: "Chi'lly Chat caller joined but callee did not",
      affectedServerId: serverId || undefined,
      confidence: "medium",
      detectedSymptoms: ["Caller joined the call but the callee did not establish a matching session."],
      likelyCause: "Call invitation, membership, signaling, or client wake/join path issue.",
      recommendedAction: "create_github_issue",
      riskLevel: "low",
      rollbackNote: "No production route or call state is changed by the issue action.",
      suggestedFix: "Create a code issue for chat-call invite, membership, and callee join proof.",
    });
  }

  if (isChatCall && bothJoined && noRemoteMedia && lowRelay) {
    return buildIncident(alert, {
      title: "Chi'lly Chat call joined with no remote media and low relay bytes",
      affectedServerId: serverId || undefined,
      confidence: "high",
      detectedSymptoms: ["Both call users joined.", "Remote media never established.", "TURN/media relay bytes are low."],
      likelyCause: "TURN/media path problem for chat-call.",
      recommendedAction: "create_github_issue",
      riskLevel: "medium",
      rollbackNote: "No production route change is applied by the issue action.",
      suggestedFix: "Create a TURN/media-path proof issue and keep any server drain as a separate approved action.",
    });
  }

  if (isChatCall && bothJoined && noRemoteMedia && (normalRelay || (relayBytes !== null && relayBytes > 0))) {
    return buildIncident(alert, {
      title: "Chi'lly Chat call joined with blank remote media and normal relay bytes",
      affectedServerId: serverId || undefined,
      confidence: normalRelay ? "high" : "medium",
      detectedSymptoms: ["Both call users joined.", "Remote media is blank or missing.", "Relay bytes are normal."],
      likelyCause: "Client render/subscription problem for chat-call.",
      recommendedAction: "create_github_issue",
      riskLevel: "low",
      rollbackNote: "No production route change is applied by the issue action.",
      suggestedFix: "Create a client render/subscription issue without changing the existing call layout.",
    });
  }

  if (
    isChatCall
    && (
      includesAny(text, ["audio-only failure", "remote audio failed", "camera publish failure", "microphone publish failure"])
      || truthy(alert.labels.audio_failure ?? alert.annotations?.audio_failure)
      || truthy(alert.labels.camera_publish_failed ?? alert.annotations?.camera_publish_failed)
      || truthy(alert.labels.microphone_publish_failed ?? alert.annotations?.microphone_publish_failed)
    )
  ) {
    return buildIncident(alert, {
      title: "Chi'lly Chat call media publish failure",
      affectedServerId: serverId || undefined,
      confidence: "medium",
      detectedSymptoms: compact([
        includesAny(text, ["audio-only failure", "remote audio failed"]) || truthy(alert.labels.audio_failure ?? alert.annotations?.audio_failure)
          ? "audio path failed"
          : null,
        includesAny(text, ["camera publish failure"]) || truthy(alert.labels.camera_publish_failed ?? alert.annotations?.camera_publish_failed)
          ? "camera publish failed"
          : null,
        includesAny(text, ["microphone publish failure"]) || truthy(alert.labels.microphone_publish_failed ?? alert.annotations?.microphone_publish_failed)
          ? "microphone publish failed"
          : null,
      ]),
      likelyCause: "Client device, permission, app build, or LiveKit SDK publish path issue.",
      recommendedAction: "create_github_issue",
      riskLevel: "low",
      rollbackNote: "No production call state is changed by the issue action.",
      suggestedFix: "Create a code issue for device permissions, publisher state, and LiveKit SDK proof.",
    });
  }

  if (
    includesAny(text, ["token", "signaling", "signal"])
    && (joinFailures === null || joinFailures > 0)
    && ((tokenErrors ?? 0) > 0 || (signalingErrors ?? 0) > 0 || includesAny(text, ["join failure", "join failures"]))
  ) {
    return buildIncident(alert, {
      title: "Live join failures from token/signaling errors",
      confidence: tokenErrors !== null || signalingErrors !== null ? "high" : "medium",
      detectedSymptoms: compact([
        joinFailures !== null ? `${joinFailures} join failures` : "high join failures",
        tokenErrors !== null ? `${tokenErrors} token errors` : "token errors",
        signalingErrors !== null ? `${signalingErrors} signaling errors` : "signaling errors",
      ]),
      likelyCause: "Token issuance, LiveKit signaling, or auth/session handoff is failing.",
      recommendedAction: "create_github_issue",
      riskLevel: "medium",
      rollbackNote: "No production code is merged or deployed by the issue action.",
      suggestedFix: "Create a code-level issue/PR lane for token and signaling proof; rerun failed CI only by explicit job id.",
    });
  }

  if ((joinedUsers ?? 0) > 0 && (blankFeeds ?? 0) > 0 && lowRelay) {
    return buildIncident(alert, {
      title: "Joined users see blank feeds with low relay bytes",
      confidence: "high",
      detectedSymptoms: ["Users joined successfully.", "Feeds are blank.", "TURN/media relay bytes are low."],
      likelyCause: "TURN/media path failure after join.",
      recommendedAction: "create_github_issue",
      riskLevel: "medium",
      rollbackNote: "No production route change is applied by the issue action.",
      suggestedFix: "Open a TURN/media-path proof issue and keep any server drain as a separate approved action.",
    });
  }

  if ((joinedUsers ?? 0) > 0 && (blankFeeds ?? 0) > 0 && (normalRelay || (relayBytes !== null && relayBytes > 0))) {
    return buildIncident(alert, {
      title: "Joined users see blank feeds with normal relay bytes",
      confidence: normalRelay ? "high" : "medium",
      detectedSymptoms: ["Users joined successfully.", "Feeds are blank.", "Relay bytes are normal."],
      likelyCause: "Client render, track subscription, or LiveKit SDK rendering path issue.",
      recommendedAction: "create_github_issue",
      riskLevel: "low",
      rollbackNote: "No production route change is applied by the issue action.",
      suggestedFix: "Create a client render/subscription issue and attach route/platform proof.",
    });
  }

  if (
    includesAny(text, ["cellular-only", "cellular only", "mobile carrier"])
    || truthy(alert.labels.cellular_only ?? alert.annotations?.cellular_only)
  ) {
    return buildIncident(alert, {
      title: isChatCall ? "Cellular-only Chi'lly Chat call failures" : "Cellular-only Live media failures",
      confidence: "medium",
      detectedSymptoms: ["Failures are isolated to cellular/mobile-carrier paths."],
      likelyCause: "TURN/cellular proof failure or carrier-specific relay path issue.",
      recommendedAction: "create_github_issue",
      riskLevel: "low",
      rollbackNote: "No production route change is applied by the issue action.",
      suggestedFix: "Create a code/runbook issue with device, carrier, TURN, and LiveKit proof requirements.",
    });
  }

  if (
    includesAny(text, ["android-only", "android only", "livekit sdk android"])
    || truthy(alert.labels.android_only ?? alert.annotations?.android_only)
  ) {
    return buildIncident(alert, {
      title: isChatCall ? "Android-only Chi'lly Chat call failures" : "Android-only Live reliability failures",
      confidence: "medium",
      detectedSymptoms: ["Failures are isolated to Android clients."],
      likelyCause: "Android app/client build path or LiveKit SDK behavior.",
      recommendedAction: "create_github_issue",
      riskLevel: "low",
      rollbackNote: "No production route change is applied by the issue action.",
      suggestedFix: "Create a code issue for Android LiveKit SDK, subscription, and render proof.",
    });
  }

  if (alertname.includes("githubactionsfailed") || includesAny(text, ["github actions failed", "ci failed"])) {
    return buildIncident(alert, {
      title: "Live reliability CI guard failed",
      confidence: "medium",
      detectedSymptoms: ["A Live reliability CI job failed."],
      likelyCause: "A code-level guard or test failed before release.",
      recommendedAction: "rerun_github_actions_job",
      riskLevel: "low",
      rollbackNote: "Rerunning a failed job does not merge, deploy, or change production traffic.",
      suggestedFix: "Rerun the explicit failed GitHub Actions job if the failure is known flaky; otherwise open an issue.",
    });
  }

  if (alertname.includes("livestaleassignment") || includesAny(text, ["stale room assignment", "stale livekit assignment"])) {
    return buildIncident(alert, {
      title: "Stale LiveKit room assignment",
      confidence: "medium",
      detectedSymptoms: ["A room assignment appears stale."],
      likelyCause: "A previously ended room assignment still blocks clean routing state.",
      recommendedAction: "clear_stale_room_assignment",
      riskLevel: "high",
      rollbackNote: "Recreate the assignment through normal token routing if the room is still valid.",
      suggestedFix: "Clear the stale assignment only after the server-side safety checks prove the room is inactive.",
    });
  }

  return null;
}
