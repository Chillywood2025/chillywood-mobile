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
  canCloseWatchPartyLiveActualPlaybackProof,
  canRenderWatchPartyParticipantSpecificTrack,
  classifyWatchPartyLiveMediaSource,
  closeWatchPartySeatRequestReview,
  createWatchPartySeatRequestVersion,
  decodePartySeatRequestMessage,
  emptyWatchPartyLiveSeatRequestState,
  encodePartySeatRequestMessage,
  shouldTriggerWatchPartyLiveSharedPlaybackRecovery,
  shouldAutoOpenWatchPartySeatRequestReview,
  watchPartyLiveContractMatchesDesiredAuthority,
} = await importTypeScriptModule("_lib/watch-party/watch-party-live-source-truth.ts");

const playerSource = readFileSync(path.join(root, "app/player/[id].tsx"), "utf8");

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

assert(
  watchPartyLiveContractMatchesDesiredAuthority(
    { roomName: "ROOM1", participantRole: "viewer", requestedGrants: { canPublish: false } },
    { participantRole: "speaker", canPublish: true },
    { roomName: "ROOM1" },
  ) === false,
  "speaker desired state must reject viewer/no-publish LiveKit contract",
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
  playerSource.includes('clearPendingPartySeatRequest(participant.id, "seat-request-denied", clearingRequestVersion)'),
  "deny local clear must use the current request version",
);
assert(
  playerSource.includes("broadcastPartySeatRequest(participantId, false, clearingRequestVersion)")
    && playerSource.includes("broadcastPartySeatRequest(participant.id, false, clearingRequestVersion)"),
  "local clear and broadcast clear must share the captured request version",
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
  helperBackedProof: true,
}, null, 2));
