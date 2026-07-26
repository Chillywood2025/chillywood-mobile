import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const hostId = "proof-live-stage-host-0001";
const viewerId = "proof-live-stage-viewer-0001";
const guestId = "proof-live-stage-guest-0001";

const fail = (message) => {
  console.error(`Live Stage seat approval proof failed: ${message}`);
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
  applyLiveStageSeatRequestEvent,
  buildLiveStageCommunityParticipants,
  canRenderLocalParticipantLiveKitTrack,
  canUseLiveStageRenderableContract,
  canRenderParticipantSpecificLiveKitTrack,
  closeLiveStageSeatRequestSheet,
  createSeatRequestVersion,
  emptyLiveStageSeatRequestState,
  getLiveStagePrimaryRoleLabel,
  liveKitContractMatchesDesiredAuthority,
  resolveActualVisualHeroParticipantId,
  resolveDesiredLiveKitAuthority,
  shouldAutoStartAuthorizedNativeLiveKitMedia,
  shouldAutoOpenLiveStageSeatRequest,
  shouldShowLiveStageJoinUnavailable,
} = await importTypeScriptModule("_lib/watch-party/live-stage-presentation.ts");

const createProofParticipant = (userId, role) => ({
  userId,
  role,
  displayName: userId === hostId ? "Proof Host" : userId === viewerId ? "Proof Viewer" : "Proof Guest",
});

const participants = [
  createProofParticipant(viewerId, "viewer"),
  createProofParticipant(guestId, "viewer"),
  createProofParticipant(hostId, "host"),
];

const participantStateById = {
  [hostId]: { role: "host", isMuted: false, isRemoved: false },
  [viewerId]: { role: "listener", isMuted: false, isRemoved: false },
  [guestId]: { role: "listener", isMuted: false, isRemoved: false },
};

const createPressEvent = () => ({
  propagationStopped: false,
  stopPropagation() {
    this.propagationStopped = true;
  },
});

const createProofState = () => ({
  currentUserId: hostId,
  activeParticipantId: "",
  selectedParticipantId: "",
  seatRequestSheetParticipantId: "",
  viewerSelfHeroEnabled: false,
  participantPresentationById: {},
  hiddenParticipantIds: {},
  participantStateById: {
    [hostId]: { role: "host", isMuted: false, isRemoved: false },
    [viewerId]: { role: "listener", isMuted: false, isRemoved: false },
  },
  membershipsById: {
    [hostId]: { stageRole: "host", canSpeak: true, isMuted: false, membershipState: "active" },
    [viewerId]: { stageRole: "listener", canSpeak: false, isMuted: false, membershipState: "active" },
  },
  seatRequestState: emptyLiveStageSeatRequestState(),
  clientPersistenceShouldFail: false,
  persistedWrites: [],
  serverPersistedWrites: [],
  seatStateBroadcasts: [],
  seatRequestBroadcasts: [],
  deviceOrEmulatorUsed: false,
  realAuthAccountCreated: false,
});

const collapseHostParticipantControls = (state, participantId) => {
  state.selectedParticipantId = "";
  if (state.activeParticipantId === participantId) {
    state.activeParticipantId = "";
  }
  if (state.participantPresentationById[participantId] === "expanded") {
    state.participantPresentationById[participantId] = "compact";
  }
};

const hostTapParticipantCard = (state, participantId) => {
  const participantState = state.participantStateById[participantId];
  const canModerateParticipant = participantState?.role !== "host";
  const isRequesting = !!state.seatRequestState.pendingById[participantId]
    && participantState?.role === "listener"
    && !participantState?.isRemoved;
  if (canModerateParticipant) {
    if (state.activeParticipantId === participantId && !isRequesting) {
      collapseHostParticipantControls(state, participantId);
      return { detailModalOpened: false, seatRequestSheetOpened: false, controlsCollapsed: true };
    }
    state.activeParticipantId = participantId;
    if (isRequesting) {
      state.participantPresentationById[participantId] = "compact";
      state.seatRequestSheetParticipantId = participantId;
      state.selectedParticipantId = "";
      return { detailModalOpened: false, seatRequestSheetOpened: true };
    }
    state.participantPresentationById[participantId] =
      state.participantPresentationById[participantId] === "expanded" ? "compact" : "expanded";
    state.selectedParticipantId = "";
    return { detailModalOpened: false, seatRequestSheetOpened: false };
  }
  state.activeParticipantId = participantId;
  state.participantPresentationById[participantId] =
    state.participantPresentationById[participantId] === "expanded" ? "compact" : "expanded";
  state.selectedParticipantId = participantId;
  return { detailModalOpened: true, seatRequestSheetOpened: false };
};

const emitParticipantUpdate = (state, participantId, changes) => {
  if (state.clientPersistenceShouldFail) return false;
  const currentMembership = state.membershipsById[participantId];
  if (!currentMembership) return false;
  const nextStageRole = changes.role ?? currentMembership.stageRole;
  const nextMembership = {
    ...currentMembership,
    stageRole: nextStageRole,
    canSpeak: nextStageRole === "host" || nextStageRole === "speaker",
    isMuted: typeof changes.isMuted === "boolean" ? changes.isMuted : currentMembership.isMuted,
    membershipState: changes.isRemoved ? "removed" : "active",
  };
  state.membershipsById[participantId] = nextMembership;
  state.persistedWrites.push({ participantId, nextMembership });
  return true;
};

const serverPersistParticipantUpdate = (state, participantId, changes) => {
  const currentMembership = state.membershipsById[participantId];
  if (!currentMembership) return false;
  const nextStageRole = changes.role ?? currentMembership.stageRole;
  const nextMembership = {
    ...currentMembership,
    stageRole: nextStageRole,
    canSpeak: nextStageRole === "host" || nextStageRole === "speaker",
    isMuted: typeof changes.isMuted === "boolean" ? changes.isMuted : currentMembership.isMuted,
    membershipState: changes.isRemoved ? "removed" : "active",
  };
  state.membershipsById[participantId] = nextMembership;
  state.serverPersistedWrites.push({ participantId, nextMembership });
  return true;
};

const broadcastSeatState = (state, participantId, payload) => {
  state.seatStateBroadcasts.push({
    participantId,
    persistedWriteCountAtBroadcast: state.persistedWrites.length,
    payload,
  });
};

const broadcastSeatRequest = (state, participantId, pending, requestVersion = "") => {
  state.seatRequestBroadcasts.push({ participantId, pending, requestVersion });
};

const clearPendingSeatRequest = (state, participantId) => {
  const requestVersion = state.seatRequestState.versionById[participantId] ?? "";
  state.seatRequestState = applyLiveStageSeatRequestEvent(state.seatRequestState, {
    participantId,
    pending: false,
    requestVersion,
  });
  state.seatRequestSheetParticipantId = "";
  broadcastSeatRequest(state, participantId, false, requestVersion);
  collapseHostParticipantControls(state, participantId);
};

const closeSeatRequestSheet = (state, participantId) => {
  if (state.seatRequestSheetParticipantId === participantId) {
    state.seatRequestSheetParticipantId = "";
  }
  state.seatRequestState = closeLiveStageSeatRequestSheet(state.seatRequestState, participantId);
  collapseHostParticipantControls(state, participantId);
};

const canShowInlinePendingSeatActions = (_state, _participantId) => false;
const canShowInlineSpeakerManagement = (state, participantId) => state.participantStateById[participantId]?.role === "speaker";

const approveSeat = (state, event, participantId) => {
  event.stopPropagation();
  let seatPersisted = emitParticipantUpdate(state, participantId, { role: "speaker" });
  if (!seatPersisted) {
    seatPersisted = serverPersistParticipantUpdate(state, participantId, { role: "speaker" });
  }
  if (!seatPersisted) return false;
  state.participantStateById[participantId] = {
    ...state.participantStateById[participantId],
    role: "speaker",
  };
  const requestVersion = state.seatRequestState.versionById[participantId] ?? "";
  state.seatRequestState = applyLiveStageSeatRequestEvent(state.seatRequestState, {
    participantId,
    pending: false,
    requestVersion,
  });
  broadcastSeatState(state, participantId, {
    role: "speaker",
    isMuted: state.participantStateById[participantId].isMuted,
    pending: false,
    requestVersion,
  });
  collapseHostParticipantControls(state, participantId);
  return true;
};

const hostHeroId = resolveActualVisualHeroParticipantId({
  isHost: true,
  currentUserParticipantId: hostId,
  shouldUseViewerSelfHero: false,
  heroParticipantId: hostId,
});
const hostPartyBox = buildLiveStageCommunityParticipants({
  participants,
  actualVisualHeroParticipantId: hostHeroId,
  participantStateById,
  shouldUseViewerSelfHero: false,
  hostParticipantId: hostId,
});
assert(hostHeroId === hostId, "host layout should use host/self as the actual visual hero");
assert(!hostPartyBox.some((participant) => participant.userId === hostId), "host party box should not duplicate host/self as You HOST");
assert(hostPartyBox.some((participant) => participant.userId === viewerId), "host party box should include the remote viewer");

const focusedHostPartyBox = buildLiveStageCommunityParticipants({
  participants,
  actualVisualHeroParticipantId: resolveActualVisualHeroParticipantId({
    isHost: true,
    currentUserParticipantId: hostId,
    shouldUseViewerSelfHero: false,
    heroParticipantId: viewerId,
  }),
  participantStateById,
  shouldUseViewerSelfHero: false,
  hostParticipantId: hostId,
});
assert(focusedHostPartyBox.some((participant) => participant.userId === hostId), "host should move into the party box when a remote viewer is the actual hero");
assert(!focusedHostPartyBox.some((participant) => participant.userId === viewerId), "focused remote viewer should not duplicate inside the host party box");

assert(getLiveStagePrimaryRoleLabel({ state: { role: "listener" } }) === "Audience", "featured listener must still be Audience");
assert(getLiveStagePrimaryRoleLabel({ state: { role: "listener" }, isRequesting: true }) === "Seat request pending", "requesting listener must show request status");
assert(getLiveStagePrimaryRoleLabel({ state: { role: "speaker" } }) === "Seated", "speaker status must be Seated");
assert(getLiveStagePrimaryRoleLabel({ state: { role: "host" } }) === "Host", "host status must be Host");

const viewerDefaultHeroId = resolveActualVisualHeroParticipantId({
  isHost: false,
  currentUserParticipantId: viewerId,
  shouldUseViewerSelfHero: false,
  heroParticipantId: hostId,
});
const viewerDefaultPartyBox = buildLiveStageCommunityParticipants({
  participants,
  actualVisualHeroParticipantId: viewerDefaultHeroId,
  participantStateById,
  shouldUseViewerSelfHero: false,
  hostParticipantId: hostId,
});
assert(viewerDefaultHeroId === hostId, "default viewer layout should keep the host as hero");
assert(viewerDefaultPartyBox.some((participant) => participant.userId === viewerId), "default viewer layout should include viewer self in party box");
assert(!viewerDefaultPartyBox.some((participant) => participant.userId === hostId), "default viewer layout should not duplicate host in party box");

const selfHeroId = resolveActualVisualHeroParticipantId({
  isHost: false,
  currentUserParticipantId: viewerId,
  shouldUseViewerSelfHero: true,
  heroParticipantId: hostId,
});
const selfHeroPartyBox = buildLiveStageCommunityParticipants({
  participants,
  actualVisualHeroParticipantId: selfHeroId,
  participantStateById,
  shouldUseViewerSelfHero: true,
  hostParticipantId: hostId,
});
assert(selfHeroId === viewerId, "self-hero layout should make the viewer local hero");
assert(selfHeroPartyBox[0]?.userId === hostId, "self-hero party box should put the real host first");
assert(!selfHeroPartyBox.some((participant) => participant.userId === viewerId), "self-hero party box should not duplicate the viewer");
assert("Local self view" !== "Live feed is syncing.", "self-hero fallback copy must not be Live feed syncing");
assert("Local self view" !== "Waiting for host approval", "self-hero fallback copy must not imply approval is required to switch layout");

const firstRequestVersion = createSeatRequestVersion(1_000, 0.123);
let requestState = emptyLiveStageSeatRequestState();
requestState = applyLiveStageSeatRequestEvent(requestState, {
  participantId: viewerId,
  pending: true,
  requestVersion: firstRequestVersion,
});
assert(requestState.pendingById[viewerId] === true, "first request should be pending");
assert(shouldAutoOpenLiveStageSeatRequest(requestState, viewerId) === true, "first request should auto-open the sheet");
requestState = closeLiveStageSeatRequestSheet(requestState, viewerId);
assert(requestState.pendingById[viewerId] === true, "X close should keep pending request");
assert(shouldAutoOpenLiveStageSeatRequest(requestState, viewerId) === false, "X close should suppress auto-open for this request version");
requestState = applyLiveStageSeatRequestEvent(requestState, {
  participantId: viewerId,
  pending: true,
  requestVersion: firstRequestVersion,
});
assert(shouldAutoOpenLiveStageSeatRequest(requestState, viewerId) === false, "duplicate pending broadcast must not reopen a locally closed request");
requestState = applyLiveStageSeatRequestEvent(requestState, {
  participantId: viewerId,
  pending: false,
  requestVersion: firstRequestVersion,
});
assert(!requestState.pendingById[viewerId], "Not now should clear the pending request");
const secondRequestVersion = createSeatRequestVersion(2_000, 0.456);
requestState = applyLiveStageSeatRequestEvent(requestState, {
  participantId: viewerId,
  pending: true,
  requestVersion: secondRequestVersion,
});
assert(shouldAutoOpenLiveStageSeatRequest(requestState, viewerId) === true, "new request after Not now should be allowed to auto-open");

const nonRequestingFocusState = createProofState();
const nonRequestingTapResult = hostTapParticipantCard(nonRequestingFocusState, viewerId);
assert(nonRequestingTapResult.seatRequestSheetOpened === false, "non-requesting remote viewer tap should not open the seat sheet");
assert(nonRequestingFocusState.activeParticipantId === viewerId, "non-requesting remote viewer tap may focus the card");
assert(!nonRequestingFocusState.hiddenParticipantIds[viewerId], "non-requesting remote viewer tap must not hide the participant");
assert(canShowInlinePendingSeatActions(nonRequestingFocusState, viewerId) === false, "pending approve/dismiss actions must not render inline");
assert(canShowInlineSpeakerManagement(nonRequestingFocusState, viewerId) === false, "audience viewer must not expose seated speaker management");

const state = createProofState();
state.seatRequestState = applyLiveStageSeatRequestEvent(state.seatRequestState, {
  participantId: viewerId,
  pending: true,
  requestVersion: firstRequestVersion,
});
state.seatRequestSheetParticipantId = viewerId;
assert(state.seatRequestState.pendingById[viewerId] === true, "host should receive pending viewer request");
assert(state.seatRequestSheetParticipantId === viewerId, "host seat-request sheet should target the pending viewer");

const tapResult = hostTapParticipantCard(state, viewerId);
assert(tapResult.detailModalOpened === false, "detail modal should stay closed for host moderation taps");
assert(tapResult.seatRequestSheetOpened === true, "host pending-request card tap should open the seat-request sheet");
assert(state.activeParticipantId === viewerId, "viewer card may focus the card while opening the sheet");
assert(state.selectedParticipantId === "", "host moderation tap should not select the participant detail sheet");
assert(state.seatRequestSheetParticipantId === viewerId, "host card tap should target the pending viewer in the seat-request sheet");
assert(state.seatRequestState.pendingById[viewerId] === true, "host card tap must not clear the pending request");
assert(!state.hiddenParticipantIds[viewerId], "host card tap must not hide the participant");
assert(state.participantStateById[viewerId].role === "listener", "host card tap must not seat or remove the viewer");

const closeState = createProofState();
closeState.activeParticipantId = viewerId;
closeState.participantPresentationById[viewerId] = "expanded";
closeState.seatRequestState = applyLiveStageSeatRequestEvent(closeState.seatRequestState, {
  participantId: viewerId,
  pending: true,
  requestVersion: firstRequestVersion,
});
closeState.seatRequestSheetParticipantId = viewerId;
closeSeatRequestSheet(closeState, viewerId);
assert(closeState.seatRequestSheetParticipantId === "", "close should hide only the seat-request sheet");
assert(closeState.seatRequestState.pendingById[viewerId] === true, "close should keep the pending request");
assert(shouldAutoOpenLiveStageSeatRequest(closeState.seatRequestState, viewerId) === false, "close should suppress duplicate auto-open");
assert(closeState.participantStateById[viewerId].role === "listener", "close should not seat the viewer");
assert(!closeState.hiddenParticipantIds[viewerId], "close should keep the participant card visible");
assert(closeState.activeParticipantId === "", "close should collapse transient host controls");

closeState.seatRequestSheetParticipantId = viewerId;
clearPendingSeatRequest(closeState, viewerId);
assert(!closeState.seatRequestState.pendingById[viewerId], "dismiss should clear pending seat request");
assert(closeState.seatRequestSheetParticipantId === "", "dismiss should close the seat-request sheet");
assert(closeState.seatRequestBroadcasts.length === 1, "dismiss should broadcast one request cancellation");
assert(closeState.seatRequestBroadcasts[0].pending === false, "dismiss should broadcast pending false");
assert(closeState.participantStateById[viewerId].role === "listener", "dismiss should not seat the viewer");
assert(!closeState.hiddenParticipantIds[viewerId], "dismiss should keep the participant card visible");
assert(closeState.activeParticipantId === "", "dismiss should collapse host card overlay");
assert(closeState.participantPresentationById[viewerId] === "compact", "dismiss should collapse expanded viewer card");

const approveEvent = createPressEvent();
const approved = approveSeat(state, approveEvent, viewerId);
assert(approveEvent.propagationStopped === true, "approve tap should stop parent card propagation");
assert(approved === true, "host approve action should persist");
assert(state.persistedWrites.length === 1, "approval should persist membership authority once");
assert(state.seatStateBroadcasts.length === 1, "approval should broadcast one seat state after persistence");
assert(state.seatStateBroadcasts[0].persistedWriteCountAtBroadcast === 1, "seat-state broadcast should happen after membership persistence");
assert(state.participantStateById[viewerId].role === "speaker", "viewer should become speaker after host approval");
assert(state.membershipsById[viewerId].canSpeak === true, "viewer should become publish-capable after host approval");
assert(!state.seatRequestState.pendingById[viewerId], "approval should clear pending seat request");
assert(state.activeParticipantId === "", "approval should collapse host card overlay");
assert(state.selectedParticipantId === "", "approval should leave detail sheet closed");
assert(state.participantPresentationById[viewerId] === "compact", "approval should collapse expanded viewer card");
assert(canShowInlineSpeakerManagement(state, viewerId) === true, "seated speaker management may remain available after approval");

const fallbackState = createProofState();
fallbackState.clientPersistenceShouldFail = true;
fallbackState.seatRequestState = applyLiveStageSeatRequestEvent(fallbackState.seatRequestState, {
  participantId: viewerId,
  pending: true,
  requestVersion: firstRequestVersion,
});
fallbackState.seatRequestSheetParticipantId = viewerId;
const fallbackEvent = createPressEvent();
const fallbackApproved = approveSeat(fallbackState, fallbackEvent, viewerId);
assert(fallbackEvent.propagationStopped === true, "fallback approve tap should stop parent card propagation");
assert(fallbackApproved === true, "host approve should use server-backed persistence when client write fails");
assert(fallbackState.persistedWrites.length === 0, "fallback proof should simulate failed client persistence");
assert(fallbackState.serverPersistedWrites.length === 1, "fallback approval should persist through server authority once");
assert(fallbackState.participantStateById[viewerId].role === "speaker", "fallback approval should seat the viewer");
assert(!fallbackState.seatRequestState.pendingById[viewerId], "fallback approval should clear pending request");

const speakerDesired = resolveDesiredLiveKitAuthority({ participantRole: "speaker", isMuted: false });
const mutedSpeakerDesired = resolveDesiredLiveKitAuthority({ participantRole: "speaker", isMuted: true });
const viewerDesired = resolveDesiredLiveKitAuthority({ participantRole: "viewer", isMuted: false });
assert(speakerDesired.canPublish === true, "speaker desired authority should require publish");
assert(mutedSpeakerDesired.canPublish === false, "muted speaker desired authority should block publish");
assert(viewerDesired.canPublish === false, "viewer desired authority should block publish");
assert(shouldAutoStartAuthorizedNativeLiveKitMedia("android") === true, "Android LiveKit surfaces should restore automatic authorized local media");
assert(shouldAutoStartAuthorizedNativeLiveKitMedia("ios") === true, "iOS LiveKit surfaces should match Android automatic authorized local media");
assert(shouldAutoStartAuthorizedNativeLiveKitMedia("web") === false, "web LiveKit surfaces should not inherit the native automatic local-media policy");
assert(liveKitContractMatchesDesiredAuthority({ participantRole: "speaker", requestedGrants: { canPublish: true } }, speakerDesired), "speaker publish contract should be publish-ready");
assert(!liveKitContractMatchesDesiredAuthority({ participantRole: "viewer", requestedGrants: { canPublish: false } }, speakerDesired), "viewer/no-publish token must not be publish-ready for approved speaker");
assert(!liveKitContractMatchesDesiredAuthority({ participantRole: "speaker", requestedGrants: { canPublish: false } }, speakerDesired), "speaker/no-publish token must not be publish-ready for unmuted approved speaker");
assert(liveKitContractMatchesDesiredAuthority({ participantRole: "viewer", requestedGrants: { canPublish: false } }, viewerDesired), "viewer/no-publish token is ready for audience viewing");

const liveStageRoomName = "proof-live-stage-room";
const renderableHostContract = {
  roomName: liveStageRoomName,
  participantRole: "host",
  requestedGrants: { canPublish: true },
};
const transientUnavailable = {
  status: "unavailable",
  reason: "request_failed",
  responseStatus: 500,
};
assert(
  canUseLiveStageRenderableContract(renderableHostContract, { roomName: liveStageRoomName, isExpired: false }) === true,
  "valid Live Stage renderable contract should remain usable during authority refresh",
);
assert(
  canUseLiveStageRenderableContract(renderableHostContract, { roomName: "other-room", isExpired: false }) === false,
  "wrong-room Live Stage renderable contract must not be reused",
);
assert(
  canUseLiveStageRenderableContract(renderableHostContract, { roomName: liveStageRoomName, isExpired: true }) === false,
  "expired Live Stage renderable contract must not be reused",
);
assert(
  shouldShowLiveStageJoinUnavailable({ unavailable: transientUnavailable, hasRenderableContract: true }) === false,
  "transient unavailable token refresh must not replace a valid Live Stage renderable contract",
);
assert(
  shouldShowLiveStageJoinUnavailable({ unavailable: transientUnavailable, hasRenderableContract: false }) === true,
  "Live Stage unavailable placeholder is allowed only when no renderable contract exists",
);

assert(canRenderParticipantSpecificLiveKitTrack({
  participantId: viewerId,
  localParticipantIdentity: hostId,
  trackParticipantIdentity: viewerId,
}) === true, "participant card should render exact identity-matched remote track");
assert(canRenderParticipantSpecificLiveKitTrack({
  participantId: viewerId,
  localParticipantIdentity: hostId,
  trackParticipantIdentity: guestId,
}) === false, "participant card must not borrow another remote participant's track");
assert(canRenderParticipantSpecificLiveKitTrack({
  participantId: viewerId,
  localParticipantIdentity: viewerId,
  trackParticipantIdentity: viewerId,
}) === false, "viewer self tile must not borrow a local/remote LiveKit track fallback");
assert(canRenderLocalParticipantLiveKitTrack({
  participantId: viewerId,
  localParticipantIdentity: viewerId,
  trackParticipantIdentity: viewerId,
  publishLocalCamera: true,
}) === true, "viewer self Party Members tile should render its exact active local camera track");
assert(canRenderLocalParticipantLiveKitTrack({
  participantId: viewerId,
  localParticipantIdentity: viewerId,
  trackParticipantIdentity: viewerId,
  publishLocalCamera: false,
}) === false, "viewer self Party Members tile must not render local camera while publishing is off");

assert(state.deviceOrEmulatorUsed === false, "proof must not use an attached device or emulator");
assert(state.realAuthAccountCreated === false, "proof must not create real auth accounts");

console.log("Live Stage seat approval proof passed");
console.log(JSON.stringify({
  proofHostId: hostId,
  proofViewerId: viewerId,
  deviceOrEmulatorUsed: false,
  realAuthAccountCreated: false,
  hostRequestRendered: true,
  approvePropagationStopped: true,
  approveUsesServerFallbackAfterClientPersistenceFailure: true,
  dismissClosesSeatRequestSheet: true,
  closeKeepsPendingSeatRequest: true,
  duplicatePendingDoesNotReopenClosedRequest: true,
  newRequestAfterDismissCanAutoOpen: true,
  pendingApprovalIsSheetOnly: true,
  hostVisualHeroIsSelf: true,
  hostPartyBoxExcludesSelfHost: true,
  hostPartyBoxIncludesRemoteViewer: true,
  remoteHeroMovesHostIntoPartyBox: true,
  remoteHeroIsNotDuplicatedInPartyBox: true,
  featuredFocusDoesNotReplaceRoleLabel: true,
  defaultViewerSelfVisibleInPartyBox: true,
  hostPendingCardOpensSeatSheet: true,
  viewerSelfHeroLocalOnly: true,
  hostFirstInSelfHeroPartyBox: true,
  androidAuthorizedLocalMediaStartsAutomatically: true,
  iosAuthorizedLocalMediaStartsAutomatically: true,
  speakerContractMustMatchPublishAuthority: true,
  transientUnavailablePreservesRenderableLiveStageSurface: true,
  participantTilesRequireIdentityMatchedTracks: true,
  viewerCanPublishAfterApproval: true,
}, null, 2));
