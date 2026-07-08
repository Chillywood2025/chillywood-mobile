import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const hostId = process.env.WATCH_PARTY_PROOF_HOST_ID || "proof-host-user-0001";
const viewerId = process.env.WATCH_PARTY_PROOF_VIEWER_ID || "proof-viewer-user-0001";
const now = Date.now();

const fail = (message) => {
  console.error(`Watch-Party seat request proof failed: ${message}`);
  process.exit(1);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const importTypeScriptModule = async (relativePath) => {
  const sourcePath = path.join(root, relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    fileName: sourcePath,
  }).outputText;
  const encoded = Buffer.from(transpiled, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
};

const {
  applyWatchPartySeatRequestEvent,
  buildWatchPartyLiveParticipantRoster,
  canCloseWatchPartyLiveActualPlaybackProof,
  canRenderWatchPartyParticipantSpecificTrack,
  canUseWatchPartyLiveRenderableContract,
  classifyWatchPartyLiveMediaSource,
  closeWatchPartySeatRequestReview,
  createWatchPartySeatRequestVersion,
  decodePartySeatRequestMessage,
  emptyWatchPartyLiveSeatRequestState,
  encodePartySeatRequestMessage,
  mergeWatchPartyLiveRoster,
  resolveWatchPartyLiveParticipantRole,
  shouldTriggerWatchPartyLiveSharedPlaybackRecovery,
  shouldAutoOpenWatchPartySeatRequestReview,
  watchPartyLiveContractMatchesDesiredAuthority,
} = await importTypeScriptModule("_lib/watch-party/watch-party-live-source-truth.ts");

const playerSource = readFileSync(path.join(root, "app/player/[id].tsx"), "utf8");
const partyRoomSource = readFileSync(path.join(root, "app/watch-party/[partyId].tsx"), "utf8");
const livekitSurfaceSource = readFileSync(path.join(root, "components/watch-party-live/livekit-stage-media-surface.tsx"), "utf8");
const watchPartySource = readFileSync(path.join(root, "_lib/watchParty.ts"), "utf8");

const createProofState = () => ({
  hostAuthority: { isHost: true, source: "proof-room-host" },
  seatRequestState: emptyWatchPartyLiveSeatRequestState(),
  participants: [
    {
      id: hostId,
      name: "Proof Host",
      role: "host",
      stageRole: "host",
      canSpeak: true,
      muted: false,
      isSpeaking: true,
      isRequestingToSpeak: false,
    },
    {
      id: viewerId,
      name: "Proof Viewer",
      role: "viewer",
      stageRole: "listener",
      canSpeak: false,
      muted: false,
      isSpeaking: false,
      isRequestingToSpeak: false,
    },
  ],
});

const mergePendingSeatRequests = (state) => {
  state.participants = state.participants.map((participant) => ({
    ...participant,
    isRequestingToSpeak: state.hostAuthority.isHost
      && !participant.canSpeak
      && !!state.seatRequestState.pendingById[participant.id],
  }));
};

const applySeatRequestMarker = (state, body, source) => {
  const marker = decodePartySeatRequestMessage(body);
  assert(marker, "seat request marker should decode");
  assert(state.hostAuthority.isHost, "proof host must have approval authority");
  state.seatRequestState = applyWatchPartySeatRequestEvent(state.seatRequestState, {
    participantId: marker.participantId,
    pending: marker.pending,
    sentAt: marker.sentAt,
    requestedAt: marker.requestedAt,
    requestVersion: marker.requestVersion,
    source,
  });
  mergePendingSeatRequests(state);
};

const renderRoster = (state, showRequestIndicators) => (
  state.participants.map((participant) => {
    const role = participant.role === "host"
      ? "host"
      : participant.canSpeak || participant.stageRole === "speaker"
        ? "speaker"
        : "viewer";
    return {
      identity: participant.id,
      label: participant.id === hostId ? "Proof Host" : "Proof Viewer",
      role,
      canPublish: role !== "viewer" && !participant.muted,
      isRequestingToSpeak: showRequestIndicators && participant.isRequestingToSpeak && role === "viewer",
    };
  })
);

const state = createProofState();
const requestVersion = createWatchPartySeatRequestVersion(now, 0.42);
const requestMarker = encodePartySeatRequestMessage(viewerId, true, { requestVersion, sentAt: now });
applySeatRequestMarker(state, requestMarker, "proof-message-poll");

const requestedViewer = state.participants.find((participant) => participant.id === viewerId);
assert(requestedViewer?.isRequestingToSpeak === true, "host state should apply the viewer request");
assert(
  shouldAutoOpenWatchPartySeatRequestReview(state.seatRequestState, viewerId) === true,
  "new pending request should auto-open host review",
);

state.seatRequestState = closeWatchPartySeatRequestReview(state.seatRequestState, viewerId);
applySeatRequestMarker(state, requestMarker, "duplicate-proof-message-poll");
assert(
  state.seatRequestState.pendingById[viewerId] === true,
  "X close should preserve the pending request",
);
assert(
  shouldAutoOpenWatchPartySeatRequestReview(state.seatRequestState, viewerId) === false,
  "duplicate pending request version must not reopen after X close",
);

applySeatRequestMarker(
  state,
  encodePartySeatRequestMessage(viewerId, false, { requestVersion, sentAt: now + 1 }),
  "proof-clear",
);
const clearedViewer = state.participants.find((participant) => participant.id === viewerId);
assert(clearedViewer?.isRequestingToSpeak === false, "clearing the request should remove host pending state");

const secondRequestVersion = createWatchPartySeatRequestVersion(now + 2, 0.84);
applySeatRequestMarker(
  state,
  encodePartySeatRequestMessage(viewerId, true, { requestVersion: secondRequestVersion, sentAt: now + 2 }),
  "proof-new-request",
);
applySeatRequestMarker(
  state,
  encodePartySeatRequestMessage(viewerId, false, { requestVersion, sentAt: now + 3 }),
  "proof-stale-clear",
);
assert(
  shouldAutoOpenWatchPartySeatRequestReview(state.seatRequestState, viewerId) === true,
  "old clear event must not clear a newer request version",
);
applySeatRequestMarker(
  state,
  encodePartySeatRequestMessage(viewerId, false, { sentAt: now + 4 }),
  "proof-unversioned-stale-clear",
);
assert(
  shouldAutoOpenWatchPartySeatRequestReview(state.seatRequestState, viewerId) === true,
  "unversioned local/legacy clear must not clear a newer versioned request",
);

const hostRoster = renderRoster(state, true);
const viewerRoster = renderRoster(state, false);
assert(
  hostRoster.find((entry) => entry.identity === viewerId)?.isRequestingToSpeak === true,
  "host roster should show the viewer request",
);
assert(
  viewerRoster.find((entry) => entry.identity === viewerId)?.isRequestingToSpeak === false,
  "viewer roster should hide request indicators",
);
const approvedRosterParticipants = [
  {
    id: hostId,
    liveKitIdentity: "lk-host-device",
    name: "Proof Host",
    role: "host",
    stageRole: "host",
    canSpeak: true,
    muted: false,
    isRequestingToSpeak: false,
  },
  {
    id: viewerId,
    liveKitIdentity: "lk-viewer-device",
    name: "Proof Viewer",
    role: "viewer",
    stageRole: "speaker",
    canSpeak: true,
    muted: false,
    isRequestingToSpeak: false,
  },
];
const approvedMemberships = [
  {
    userId: hostId,
    role: "host",
    stageRole: "host",
    canSpeak: true,
    isMuted: false,
    membershipState: "active",
    displayName: "Proof Host",
  },
  {
    userId: viewerId,
    role: "viewer",
    stageRole: "speaker",
    canSpeak: true,
    isMuted: false,
    membershipState: "active",
    displayName: "Proof Viewer",
  },
];
const hostMergedRoster = mergeWatchPartyLiveRoster({
  memberships: approvedMemberships,
  presenceParticipants: [
    {
      id: hostId,
      liveKitIdentity: "lk-host-device",
      name: "Proof Host",
      role: "host",
      stageRole: "host",
      canSpeak: true,
      isSpeaking: true,
    },
  ],
  currentUserId: hostId,
  currentLiveKitIdentity: "lk-host-device",
  roomHostUserId: hostId,
});
assert(hostMergedRoster.length === 2, "host device roster must keep the approved viewer even if viewer presence is briefly missing");
assert(
  hostMergedRoster.find((entry) => entry.id === hostId)?.role === "host",
  "host device roster must keep the real host as host",
);
assert(
  hostMergedRoster.find((entry) => entry.id === viewerId)?.stageRole === "speaker",
  "host device roster must keep the approved viewer visible as speaker from membership",
);
assert(
  new Set(hostMergedRoster.map((entry) => entry.id)).size === 2,
  "host device roster must not duplicate self fallback when membership already has the host",
);
const viewerMergedRoster = mergeWatchPartyLiveRoster({
  memberships: approvedMemberships,
  presenceParticipants: [
    {
      id: viewerId,
      liveKitIdentity: "lk-viewer-device",
      name: "Proof Viewer",
      role: "viewer",
      stageRole: "listener",
      canSpeak: false,
      isSpeaking: true,
    },
  ],
  currentUserId: viewerId,
  currentLiveKitIdentity: "lk-viewer-device",
  roomHostUserId: hostId,
});
assert(viewerMergedRoster.length === 2, "viewer device roster must keep the host even if host presence is briefly missing");
assert(
  viewerMergedRoster.find((entry) => entry.id === hostId)?.role === "host",
  "viewer device roster must keep the real host visible as host from membership",
);
assert(
  viewerMergedRoster.find((entry) => entry.id === viewerId)?.stageRole === "speaker",
  "viewer device roster must prefer approved speaker membership over stale viewer presence",
);
assert(
  new Set(viewerMergedRoster.map((entry) => entry.id)).size === 2,
  "viewer device roster must contain exactly two unique participants after approval",
);
assert(
  resolveWatchPartyLiveParticipantRole({
    participantId: hostId,
    roomHostUserId: hostId,
    membershipRole: "host",
    membershipStageRole: "host",
    membershipCanSpeak: true,
    presenceRole: "viewer",
    presenceStageRole: "speaker",
    presenceCanSpeak: true,
  }).role === "host",
  "stale presence must not demote the room host",
);
assert(
  resolveWatchPartyLiveParticipantRole({
    participantId: viewerId,
    roomHostUserId: hostId,
    membershipRole: "viewer",
    membershipStageRole: "speaker",
    membershipCanSpeak: true,
    presenceRole: "viewer",
    presenceStageRole: "listener",
    presenceCanSpeak: false,
  }).stageRole === "speaker",
  "approved speaker membership must override stale listener presence",
);
const hostDeviceRoster = buildWatchPartyLiveParticipantRoster({
  participants: approvedRosterParticipants,
  currentUserId: hostId,
  currentLiveKitIdentity: "lk-host-device",
  showRequestIndicators: true,
});
assert(hostDeviceRoster.length === 2, "host device roster should include host and approved viewer");
assert(
  hostDeviceRoster.find((entry) => entry.participantId === hostId)?.label === "You",
  "host device should label only the host participant as You",
);
assert(
  hostDeviceRoster.find((entry) => entry.participantId === viewerId)?.role === "speaker",
  "host device should keep the approved viewer visible as a speaker",
);
assert(
  hostDeviceRoster.find((entry) => entry.participantId === viewerId)?.identity === "lk-viewer-device",
  "host device should use the viewer LiveKit identity for identity-safe track mapping",
);
const viewerDeviceRoster = buildWatchPartyLiveParticipantRoster({
  participants: approvedRosterParticipants,
  currentUserId: viewerId,
  currentLiveKitIdentity: "lk-viewer-device",
  showRequestIndicators: false,
});
assert(viewerDeviceRoster.length === 2, "viewer device roster should include viewer and host");
assert(
  viewerDeviceRoster.find((entry) => entry.participantId === viewerId)?.label === "You",
  "viewer device should label only the viewer participant as You",
);
assert(
  viewerDeviceRoster.find((entry) => entry.participantId === hostId)?.role === "host",
  "viewer device should keep the real host visible as host",
);
assert(
  viewerDeviceRoster.every((entry) => entry.identityAliases.includes(entry.participantId)),
  "roster entries should alias app participant ids for stable taps and labels",
);
const collidingViewerMergedRoster = mergeWatchPartyLiveRoster({
  memberships: approvedMemberships,
  presenceParticipants: [
    {
      id: hostId,
      liveKitIdentity: "lk-viewer-device",
      name: "Proof Host",
      role: "host",
      stageRole: "host",
      canSpeak: true,
    },
    {
      id: viewerId,
      liveKitIdentity: "lk-viewer-device",
      name: "Proof Viewer",
      role: "viewer",
      stageRole: "speaker",
      canSpeak: true,
    },
  ],
  currentUserId: viewerId,
  currentLiveKitIdentity: "lk-viewer-device",
  roomHostUserId: hostId,
});
assert(
  collidingViewerMergedRoster.length === 2,
  "identity collision recovery must keep both host and viewer visible",
);
assert(
  collidingViewerMergedRoster.find((entry) => entry.id === hostId)?.liveKitIdentity === hostId,
  "remote host must not keep a LiveKit identity that collides with the viewer current identity",
);
const collidingViewerDeviceRoster = buildWatchPartyLiveParticipantRoster({
  participants: collidingViewerMergedRoster,
  currentUserId: viewerId,
  currentLiveKitIdentity: "lk-viewer-device",
  showRequestIndicators: false,
});
assert(
  collidingViewerDeviceRoster.length === 2,
  "colliding identities must not collapse the viewer device roster to only self",
);
assert(
  collidingViewerDeviceRoster.filter((entry) => entry.label === "You").length === 1,
  "only the durable current user participant may be labeled You",
);
assert(
  collidingViewerDeviceRoster.find((entry) => entry.participantId === hostId)?.role === "host",
  "identity collision must not mix host/viewer roles",
);
assert(
  collidingViewerDeviceRoster.find((entry) => entry.participantId === viewerId)?.role === "speaker",
  "identity collision must keep the approved viewer as speaker",
);

assert(
  watchPartyLiveContractMatchesDesiredAuthority(
    { roomName: "ROOM1", participantRole: "viewer", requestedGrants: { canPublish: false } },
    { participantRole: "speaker", canPublish: true },
    { roomName: "ROOM1" },
  ) === false,
  "speaker desired state must reject viewer/no-publish LiveKit contract",
);
assert(
  canUseWatchPartyLiveRenderableContract(
    { roomName: "ROOM1", participantRole: "viewer", requestedGrants: { canPublish: false } },
    { roomName: "ROOM1", isExpired: false },
  ) === true,
  "downgraded viewer/no-publish contract may keep the LiveKit bubble surface rendered during speaker authority refresh",
);
assert(
  canUseWatchPartyLiveRenderableContract(
    { roomName: "OTHER", participantRole: "viewer", requestedGrants: { canPublish: false } },
    { roomName: "ROOM1", isExpired: false },
  ) === false,
  "renderable contract cache must not leak across rooms",
);
assert(
  canUseWatchPartyLiveRenderableContract(
    { roomName: "ROOM1", participantRole: "viewer", requestedGrants: { canPublish: false } },
    { roomName: "ROOM1", isExpired: true },
  ) === false,
  "expired renderable contracts must not keep the LiveKit bubble surface alive",
);
assert(
  watchPartyLiveContractMatchesDesiredAuthority(
    { roomName: "ROOM1", participantRole: "speaker", requestedGrants: { canPublish: true } },
    { participantRole: "speaker", canPublish: true },
    { roomName: "ROOM1" },
  ) === true,
  "speaker desired state should accept speaker/canPublish LiveKit contract",
);
assert(
  canRenderWatchPartyParticipantSpecificTrack({
    participantId: viewerId,
    localParticipantIdentity: hostId,
    trackParticipantIdentity: viewerId,
  }) === true,
  "participant card may render an exact identity-matched remote track",
);
assert(
  canRenderWatchPartyParticipantSpecificTrack({
    participantId: viewerId,
    localParticipantIdentity: hostId,
    trackParticipantIdentity: "other-viewer",
  }) === false,
  "participant card must not borrow a different participant track",
);
assert(
  classifyWatchPartyLiveMediaSource({
    sourceType: "creator-video",
    sourceId: "creator-real-home-demo",
    displayName: "Home Demo",
    playbackUrl: "https://media.example.invalid/redacted.mp4",
    usedBundledFallback: false,
  }) === "real-media",
  "real media classification should require a non-fixture playback URL",
);
assert(
  classifyWatchPartyLiveMediaSource({
    sourceType: "platform-title",
    sourceId: "fixture-title",
    displayName: "Proof Fixture",
    playbackUrl: "https://media.example.invalid/redacted.mp4",
    usedBundledFallback: false,
  }) === "fixture-or-proof",
  "fixture/proof media must not count as real Home media proof",
);
assert(
  classifyWatchPartyLiveMediaSource({
    sourceType: "platform-title",
    sourceId: "local-title",
    displayName: "Local Title",
    playbackUrl: "",
    usedBundledFallback: true,
  }) === "bundled-fallback",
  "bundled fallback must not count as real non-fixture media proof",
);
assert(
  classifyWatchPartyLiveMediaSource({
    sourceType: "creator-video",
    sourceId: "missing-source",
    displayName: "Missing Source",
    playbackUrl: "",
    usedBundledFallback: false,
  }) === "missing-source",
  "missing source must not count as real non-fixture media proof",
);
assert(
  playerSource.includes("watchPartyLiveMediaSourceDebugMetadata"),
  "Player must wire runtime Watch-Party Live media classification metadata",
);
assert(
  shouldTriggerWatchPartyLiveSharedPlaybackRecovery({
    isSharedPartyPlayback: true,
    platform: "android",
    sourceClassification: "real-media",
    playbackUrlPresent: true,
    usedBundledFallback: false,
    shouldBePlaying: true,
    sourceLoadFired: false,
    durationMillis: 0,
    positionMillis: 0,
    lastProgressAtMillis: 0,
    sessionStartedAtMillis: now,
    nowMillis: now + 5000,
    recoveryCount: 0,
    maxRecoveries: 2,
    watchdogTimeoutMillis: 4500,
  }) === true,
  "real-media Android shared playback should recover when sync says playing but no source load/progress appears",
);
assert(
  shouldTriggerWatchPartyLiveSharedPlaybackRecovery({
    isSharedPartyPlayback: true,
    platform: "android",
    sourceClassification: "fixture-or-proof",
    playbackUrlPresent: true,
    usedBundledFallback: false,
    shouldBePlaying: true,
    sourceLoadFired: false,
    durationMillis: 0,
    positionMillis: 0,
    lastProgressAtMillis: 0,
    sessionStartedAtMillis: now,
    nowMillis: now + 5000,
    recoveryCount: 0,
    maxRecoveries: 2,
    watchdogTimeoutMillis: 4500,
  }) === false,
  "fixture media must not drive strict real-media playback recovery proof",
);
assert(
  canCloseWatchPartyLiveActualPlaybackProof({
    isSharedPartyPlayback: true,
    platform: "android",
    sourceClassification: "real-media",
    playbackUrlPresent: true,
    usedBundledFallback: false,
    shouldBePlaying: true,
    sourceLoadFired: false,
    durationMillis: 0,
    positionMillis: 0,
    lastProgressAtMillis: 0,
    renderWatchdogActive: false,
    visualPlaybackObserved: true,
  }) === false,
  "Synced Playing alone must not close actual video playback proof",
);
assert(
  canCloseWatchPartyLiveActualPlaybackProof({
    isSharedPartyPlayback: true,
    platform: "android",
    sourceClassification: "real-media",
    playbackUrlPresent: true,
    usedBundledFallback: false,
    shouldBePlaying: true,
    sourceLoadFired: true,
    durationMillis: 52000,
    positionMillis: 4200,
    lastProgressAtMillis: now + 4200,
    renderWatchdogActive: false,
    visualPlaybackObserved: true,
  }) === true,
  "actual video playback proof requires real media plus loaded duration/progress and visual observation",
);
assert(
  playerSource.includes("playbackUrlPresent") && playerSource.includes("usedBundledFallback") && playerSource.includes("classification"),
  "Player classification log must include redacted source-readiness metadata",
);
assert(
  playerSource.includes('playbackUrl: playbackUrlPresent ? "redacted-present" : ""'),
  "Player classification must not log full playback URLs",
);
assert(
  playerSource.includes("shouldShowRegularSharedComments || partyCommentsOpen")
    && playerSource.includes('testID={shouldShowRegularSharedComments ? "shared-player-visible-comments" : undefined}'),
  "regular Shared Player must mount visible comments instead of hiding comments behind the Room Comments button",
);
assert(
  playerSource.includes("watch-party-live shared video watchdog check")
    && playerSource.includes("watch-party-live shared video recovery")
    && playerSource.includes("watch-party-live shared video render stalled"),
  "Player must log bounded Android shared-video render watchdog and recovery states",
);
assert(
  playerSource.includes("setSharedAndroidVideoFallbackMode(\"expo-av\")"),
  "Android shared playback must fall back to the stable expo-av renderer if expo-video stays black/stalled",
);
assert(
  playerSource.includes('clearPendingPartySeatRequest(participantId, "seat-state-persisted", clearingRequestVersion)'),
  "approval persistence local clear must use the current request version",
);
assert(
  playerSource.includes('surface: "watch-party-live"')
    && playerSource.includes("persistMembershipState: true")
    && playerSource.includes("refreshedSnapshot?.memberships.find((membership) => membership.userId === participantId)"),
  "Watch-Party Live approval must fall back to server-backed membership persistence before claiming speaker state",
);
assert(
  playerSource.includes('clearPendingPartySeatRequest(participant.id, "seat-request-denied", clearingRequestVersion)'),
  "deny local clear must use the current request version",
);
assert(
  playerSource.includes("broadcastPartySeatRequest(participantId, false, clearingRequestVersion)")
    && playerSource.includes("broadcastPartySeatRequest(participant.id, false, clearingRequestVersion)"),
  "local clear and broadcast clear must share the captured request version",
);
assert(
  playerSource.includes("shared-player-request-camera-button")
    && playerSource.includes("shared-player-request-camera-pending")
    && playerSource.includes("shared-player-camera-request-error"),
  "regular Shared Player must expose explicit Request Camera ready/pending/error proof targets",
);
assert(
  playerSource.includes('onPressSharedPlayerRequestCamera("dock")')
    && playerSource.includes('onPressSharedPlayerRequestCamera("bubble")')
    && playerSource.includes("const requestPartySeat = useCallback(async (participantIdOverride?: string)")
    && playerSource.includes("await requestPartySeat(currentWatchPartyParticipant.id);"),
  "explicit Request Camera and bubble taps must pass the visible participant id into the versioned request path",
);
assert(
  playerSource.includes("Camera request sent. Waiting for host.")
    && playerSource.includes("Request pending. Waiting for host.")
    && playerSource.includes("Camera request unavailable. Try again in a moment."),
  "viewer Request Camera must show safe sent, duplicate-pending, and failure feedback",
);
assert(
  watchPartySource.includes("export async function setOwnPartyParticipantMuteState")
    && watchPartySource.includes(".eq(\"user_id\", writableUserId)")
    && watchPartySource.includes("is_muted: nextIsMuted")
    && watchPartySource.includes("camera_enabled: nextCanPublishMedia")
    && watchPartySource.includes("mic_enabled: nextCanPublishMedia"),
  "seated participants must have a narrow self-mute membership helper that only updates their own mute/media flags",
);
assert(
  playerSource.includes("shared-player-self-mute-button")
    && playerSource.includes("shared-player-self-unmute-button")
    && playerSource.includes("shared-player-self-mute-error")
    && playerSource.includes("await setOwnPartyParticipantMuteState(partyId, nextMuted)")
    && playerSource.includes("setWatchPartyLiveKitAuthorityRetrySerial((value) => value + 1)")
    && playerSource.includes("showLivePresenceEvent(updatedMembership.isMuted ? \"You muted yourself\" : \"You unmuted yourself\")"),
  "seated Watch-Party Live viewers must expose durable self mute/unmute controls and refresh LiveKit authority",
);
assert(
  playerSource.includes("shared-player-host-request-card")
    && playerSource.includes("shared-player-host-request-approve")
    && playerSource.includes("shared-player-host-request-deny")
    && playerSource.includes("shared-player-host-request-close"),
  "host request review card must expose stable installed-proof targets",
);
assert(
  playerSource.includes("buildWatchPartyLiveParticipantRoster")
    && playerSource.includes("mergeWatchPartyLiveRoster")
    && playerSource.includes("memberships: Object.values(partyMembershipMapRef.current)")
    && playerSource.includes("liveBubbleParticipants.find((participant) => participant.id === trackedUserId)")
    && playerSource.includes("currentParticipantIdentity={watchPartyLiveKitIdentity || trackedUserId}")
    && playerSource.includes("currentParticipantIdentityAliases={[trackedUserId, watchPartyLiveKitIdentityRef.current].filter(Boolean)}"),
  "Player must merge membership-authoritative roster state and pass explicit current identity aliases into the LiveKit bubble surface",
);
assert(
  playerSource.includes("partyMembershipRosterPollRef.current = setInterval")
    && playerSource.includes("refreshMembershipRosterFromAuthority(true).catch(() => null);"),
  "Shared Player must periodically refresh the membership-authoritative roster, not depend only on presence",
);
const sharedPlayerHostReviewStart = playerSource.indexOf("const renderWatchPartyLiveHostReviewCard = () => {");
const sharedPlayerHostReviewEnd = playerSource.indexOf("const renderWatchPartySocialPanel =", sharedPlayerHostReviewStart);
const sharedPlayerHostReviewSource =
  sharedPlayerHostReviewStart >= 0 && sharedPlayerHostReviewEnd > sharedPlayerHostReviewStart
    ? playerSource.slice(sharedPlayerHostReviewStart, sharedPlayerHostReviewEnd)
    : "";
assert(
  sharedPlayerHostReviewSource.includes("const renderHostReviewActions = () => (")
    && sharedPlayerHostReviewSource.indexOf("{isRequesting ? renderHostReviewActions() : null}")
      < sharedPlayerHostReviewSource.indexOf("<Text style={styles.watchPartyHostReviewBody}>"),
  "pending host request approve/deny actions must render before explanatory body for installed reachability",
);
assert(
  playerSource.includes("shared-player-comment-input")
    && playerSource.includes("shared-player-comment-send")
    && playerSource.includes("shared-player-visible-comments")
    && playerSource.includes("renderPartyCommentsContent(false, shouldShowRegularSharedComments && !partyCommentsOpen)"),
  "regular Shared Player comments must expose visible compact input/send proof targets",
);
assert(
  playerSource.includes('testID="shared-player-lower-dock-scroll"')
    && playerSource.includes('keyboardShouldPersistTaps="handled"')
    && playerSource.includes('keyboardDismissMode="on-drag"')
    && playerSource.includes("titleParticipantFeedDockContentKeyboard"),
  "regular Shared Player lower dock must be scrollable and keyboard-safe so comments are not cut off",
);
assert(
  playerSource.includes('titleParticipantFeedDock: {\n    marginTop: 4,\n    position: "relative",\n    zIndex: 120,\n    elevation: 120,')
    && playerSource.includes('sharedAndroidVideoTapTarget: {\n    ...StyleSheet.absoluteFillObject,\n    bottom: 56,\n    zIndex: 1,\n    elevation: 1,'),
  "regular Shared Player lower dock must sit above the Android shared-video tap target so comments/reactions/request controls remain reachable",
);
assert(
  playerSource.includes("const sharedPartyCommentsKeyboardActive = isSharedPartyPlayback && !isPlayerFullscreen && watchPartyCommentKeyboardOpen;")
    && playerSource.includes("setWatchPartyCommentKeyboardOpen(true);")
    && playerSource.includes("setPartyCommentsOpen(true);"),
  "regular Shared Player default visible comment input must activate keyboard-safe comment mode",
);
assert(
  playerSource.includes("sharedPartyCommentsKeyboardActive && styles.videoWrapWatchPartyTitleKeyboard")
    && playerSource.includes("videoWrapWatchPartyTitleKeyboard: {"),
  "regular Shared Player keyboard comment mode must shrink the shared video so the composer and Send row stay above the Android keyboard",
);
const sharedPlayerDockSource = playerSource.slice(
  playerSource.indexOf("const renderTitleParticipantExpandedPanel = () => ("),
  playerSource.indexOf("const renderCreatorVideoCommentsPanel = () => {"),
);
assert(
  sharedPlayerDockSource.includes("{sharedPartyCommentsKeyboardActive ? null : (")
    && sharedPlayerDockSource.includes("!sharedPartyCommentsKeyboardActive && watchPartyMenuOpen")
    && sharedPlayerDockSource.indexOf("{sharedPartyCommentsKeyboardActive ? null : (")
      < sharedPlayerDockSource.indexOf('testID={shouldShowRegularSharedComments ? "shared-player-visible-comments" : undefined}')
    && sharedPlayerDockSource.indexOf('testID={shouldShowRegularSharedComments ? "shared-player-visible-comments" : undefined}')
      < sharedPlayerDockSource.indexOf("!sharedPartyCommentsKeyboardActive && watchPartyMenuOpen"),
  "regular Shared Player keyboard comment mode must prioritize the composer above action/control rows",
);
assert(
  playerSource.includes('testID="shared-player-regular-controls"')
    && !playerSource.slice(
      playerSource.indexOf("const renderTitleParticipantExpandedPanel = () => ("),
      playerSource.indexOf("const renderCreatorVideoCommentsPanel = () => {"),
    ).includes('pointerEvents={effectiveControlsVisible ? "auto" : "none"}')
    && !playerSource.slice(
      playerSource.indexOf("const renderTitleParticipantExpandedPanel = () => ("),
      playerSource.indexOf("const renderCreatorVideoCommentsPanel = () => {"),
    ).includes("partyOverlayControlsOpacity"),
  "regular Shared Player request/comment/reaction controls must be mounted outside the hidden auto-hide overlay gate",
);
assert(
  playerSource.slice(
    playerSource.indexOf("const renderPartyCommentsContent = (compactFullscreenRail = false, compactSharedDock = false) => ("),
    playerSource.indexOf("const renderSharedFullscreenCommentsRail = () => ("),
  ).includes("!compactSharedDock ? ("),
  "regular Shared Player compact comments should prioritize reachable input/send over a clipped title/list",
);
assert(
  playerSource.includes("shared-player-reaction-button")
    && playerSource.includes("onPressSharedPlayerQuickReaction")
    && playerSource.includes('event: "reaction"')
    && playerSource.includes("watch-party-live reaction received")
    && playerSource.includes('author: "Reaction"'),
  "regular Shared Player viewer reactions must be reachable, broadcast, and visible on receiver devices",
);
const partyRoomSharedPlayerMainCta = partyRoomSource.slice(
  partyRoomSource.indexOf('testID="watch-party-open-shared-player-button"'),
  partyRoomSource.indexOf("<Text style={styles.watchCTAText}", partyRoomSource.indexOf('testID="watch-party-open-shared-player-button"')),
);
const partyRoomSharedPlayerDockAction = partyRoomSource.slice(
  partyRoomSource.indexOf('testID="watch-party-action-player-button"'),
  partyRoomSource.indexOf('<MaterialIcons name="play-arrow"', partyRoomSource.indexOf('testID="watch-party-action-player-button"')),
);
assert(
  partyRoomSharedPlayerMainCta.includes("onPress={onWatchTogether}")
    && partyRoomSharedPlayerMainCta.includes('accessibilityRole="button"')
    && partyRoomSharedPlayerMainCta.includes("hitSlop={12}")
    && partyRoomSharedPlayerMainCta.includes("onLongPress={onWatchTogether}")
    && partyRoomSharedPlayerMainCta.includes("disabled={watchPartyLiveOpening}")
    && partyRoomSharedPlayerDockAction.includes("onPress={onWatchTogether}")
    && partyRoomSharedPlayerDockAction.includes('accessibilityRole="button"')
    && partyRoomSharedPlayerDockAction.includes("hitSlop={10}")
    && partyRoomSharedPlayerDockAction.includes("onLongPress={onWatchTogether}")
    && partyRoomSharedPlayerDockAction.includes("disabled={watchPartyLiveOpening}"),
  "Party Room Shared Player entry buttons must expose stable button/testID taps wired to the real guarded handoff handler",
);
assert(
  partyRoomSource.includes('"shared player open requested"'),
  "Party Room shared-player handoff must log a redacted request event before LiveKit preparation",
);
assert(
  !partyRoomSource.includes("await prepareLiveKitJoinBoundary({")
    && !partyRoomSource.includes('"Live feed unavailable"')
    && partyRoomSource.includes("watch-party-live prewarm unavailable; player will retry"),
  "Party Room Shared Player entry must route after Premium/source validation and let Player retry LiveKit prewarm failures",
);
assert(
  playerSource.includes("selfParticipantId")
    && playerSource.indexOf("selfParticipantId")
      < playerSource.indexOf("activeParticipantId", playerSource.indexOf("selfParticipantId")),
  "regular Shared Player local reactions must be associated with the sender before falling back to active/host participants",
);
assert(
  livekitSurfaceSource.includes("getBubblePlaceholderStatus(item)")
    && livekitSurfaceSource.includes("Camera preparing")
    && !livekitSurfaceSource.includes('item.canPublish ? "Seated"'),
  "approved Watch-Party Live speakers without identity-matched camera tracks must show camera-preparing, not a complete seated video state",
);
assert(
  playerSource.includes('const playerMediaIsInteractive = playerAppState === "active";')
    && !playerSource.includes('playerAppState === "active" && (Platform.OS !== "android" || playerHasAndroidFocus)'),
  "Shared Player must keep Watch-Party LiveKit active through transient Android blur while foregrounded",
);
assert(
  livekitSurfaceSource.includes('const appIsInteractive = appState === "active";')
    && !livekitSurfaceSource.includes('appState === "active" && (Platform.OS !== "android" || hasAndroidFocus)'),
  "LiveKit bubble surface must not disconnect on transient Android focus blur",
);
assert(
  livekitSurfaceSource.indexOf('if (item.canPublish) return "Camera preparing";') >= 0
    && livekitSurfaceSource.indexOf('if (item.canPublish) return "Camera preparing";') < livekitSurfaceSource.indexOf('if (item.role === "host") return "Host";'),
  "publish-capable host/speaker bubbles without a track must show Camera preparing instead of hiding missing media behind role text",
);
assert(
  playerSource.includes("sharedPlayerLowerDockScrollRef.current?.scrollToEnd({ animated: true });"),
  "Shared Player comments composer must scroll into view when the keyboard opens",
);
assert(
  !playerSource.slice(
    playerSource.indexOf("const renderPartyCommentsContent = (compactFullscreenRail = false) => ("),
    playerSource.indexOf("const renderSharedFullscreenCommentsRail = () => ("),
  ).includes("Share.share"),
  "regular Shared Player comment send must not route through Android Share",
);
assert(
  !playerSource.slice(
    playerSource.indexOf("const onPressSharedPlayerRequestCamera = useCallback(async"),
    playerSource.indexOf("const watchPartyLiveSharedPlaybackControlsLocked"),
  ).includes("Share.share"),
  "regular Shared Player Request Camera must not route through Android Share",
);

console.log("Watch-Party seat request proof passed");
console.log(JSON.stringify({
  proofHostId: hostId,
  proofViewerId: viewerId,
  deviceOrEmulatorUsed: false,
  hostRequestRendered: true,
  duplicateRequestSuppressedAfterClose: true,
  staleLocalClearPreservedNewRequest: true,
  syncedPlayingAloneRejectedAsPlaybackProof: true,
  sharedAndroidVideoRecoveryGuarded: true,
  viewerRequestHidden: true,
  runtimeMediaClassificationWired: true,
  explicitRequestCameraControl: true,
  regularControlsMountedOutsideAutoHideGate: true,
  compactCommentsInputPrioritized: true,
  hostRequestReviewTargets: true,
  commentSendReachableWithoutShare: true,
  reactionReachableWithoutShare: true,
  reactionReceiverEventProof: true,
  viewerSelfMuteProofTargets: true,
  approvedSpeakerMissingTrackCameraPreparing: true,
  foregroundBlurDoesNotDisableLiveKit: true,
  keyboardComposerScrollsIntoView: true,
  postApprovalRosterConvergenceGuarded: true,
  partyRoomSharedPlayerTestIds: true,
  helperBackedProof: true,
}, null, 2));
