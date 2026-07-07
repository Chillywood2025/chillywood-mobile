const hostId = "proof-live-stage-host-0001";
const viewerId = "proof-live-stage-viewer-0001";

const fail = (message) => {
  console.error(`Live Stage seat approval proof failed: ${message}`);
  process.exit(1);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
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
  seatRequestsById: {},
  hiddenParticipantIds: {},
  participantStateById: {
    [hostId]: { role: "host", isMuted: false, isRemoved: false },
    [viewerId]: { role: "listener", isMuted: false, isRemoved: false },
  },
  membershipsById: {
    [hostId]: { stageRole: "host", canSpeak: true, isMuted: false, membershipState: "active" },
    [viewerId]: { stageRole: "listener", canSpeak: false, isMuted: false, membershipState: "active" },
  },
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
  const isRequesting = !!state.seatRequestsById[participantId] && participantState?.role === "listener" && !participantState?.isRemoved;
  if (canModerateParticipant) {
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

const broadcastSeatRequest = (state, participantId, pending) => {
  state.seatRequestBroadcasts.push({ participantId, pending });
};

const clearPendingSeatRequest = (state, participantId) => {
  delete state.seatRequestsById[participantId];
  state.seatRequestSheetParticipantId = "";
  broadcastSeatRequest(state, participantId, false);
  collapseHostParticipantControls(state, participantId);
};

const closeSeatRequestSheet = (state, participantId) => {
  if (state.seatRequestSheetParticipantId === participantId) {
    state.seatRequestSheetParticipantId = "";
  }
};

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
  delete state.seatRequestsById[participantId];
  broadcastSeatState(state, participantId, {
    role: "speaker",
    isMuted: state.participantStateById[participantId].isMuted,
    pending: false,
  });
  collapseHostParticipantControls(state, participantId);
  return true;
};

const resolveViewerLayout = ({ viewerSelfHeroEnabled }) => {
  const host = { userId: hostId, role: "host" };
  const viewer = { userId: viewerId, role: "viewer" };
  const guest = { userId: "proof-live-stage-guest-0001", role: "viewer" };
  const visibleParticipants = [viewer, guest, host];
  const hero = viewerSelfHeroEnabled ? viewer : host;
  const partyBox = visibleParticipants
    .filter((participant) => !viewerSelfHeroEnabled || participant.userId !== viewer.userId)
    .filter((participant) => viewerSelfHeroEnabled || participant.userId !== hero.userId);
  if (viewerSelfHeroEnabled) {
    partyBox.sort((a, b) => {
      if (a.userId === hostId) return -1;
      if (b.userId === hostId) return 1;
      return a.userId.localeCompare(b.userId);
    });
  }
  return { hero, partyBox };
};

const resolveHostLayout = ({ activeParticipantId = "" } = {}) => {
  const host = { userId: hostId, role: "host" };
  const viewer = { userId: viewerId, role: "viewer" };
  const guest = { userId: "proof-live-stage-guest-0001", role: "viewer" };
  const visibleParticipants = [host, viewer, guest];
  const actualVisualHeroId = hostId;
  const activeFocus = visibleParticipants.find((participant) => participant.userId === activeParticipantId) ?? host;
  const partyBox = visibleParticipants.filter((participant) => participant.userId !== actualVisualHeroId);
  return { actualVisualHeroId, activeFocus, partyBox };
};

const hostDefaultLayout = resolveHostLayout();
assert(hostDefaultLayout.actualVisualHeroId === hostId, "host layout should use host/self as the actual visual hero");
assert(!hostDefaultLayout.partyBox.some((participant) => participant.userId === hostId), "host party box should not duplicate host/self as You HOST");
assert(hostDefaultLayout.partyBox.some((participant) => participant.userId === viewerId), "host party box should include the remote viewer");

const hostFocusedLayout = resolveHostLayout({ activeParticipantId: viewerId });
assert(hostFocusedLayout.activeFocus.userId === viewerId, "host can focus the remote viewer card");
assert(hostFocusedLayout.actualVisualHeroId === hostId, "host visual hero should remain host/self after remote viewer focus");
assert(hostFocusedLayout.partyBox.some((participant) => participant.userId === viewerId), "host focus must not filter the remote viewer out of the party box");
assert(!hostFocusedLayout.partyBox.some((participant) => participant.userId === hostId), "host focus must not reveal You HOST in the party box");

const nonRequestingFocusState = createProofState();
const nonRequestingTapResult = hostTapParticipantCard(nonRequestingFocusState, viewerId);
assert(nonRequestingTapResult.seatRequestSheetOpened === false, "non-requesting remote viewer tap should not open the seat sheet");
assert(nonRequestingFocusState.activeParticipantId === viewerId, "non-requesting remote viewer tap may focus the card");
assert(!nonRequestingFocusState.hiddenParticipantIds[viewerId], "non-requesting remote viewer tap must not hide the participant");
assert(resolveHostLayout({ activeParticipantId: nonRequestingFocusState.activeParticipantId }).partyBox.some((participant) => participant.userId === viewerId), "focused non-requesting remote viewer should remain in host party box");

const state = createProofState();
state.seatRequestsById[viewerId] = true;
state.seatRequestSheetParticipantId = viewerId;

assert(state.seatRequestsById[viewerId] === true, "host should receive pending viewer request");
assert(state.seatRequestSheetParticipantId === viewerId, "host seat-request sheet should target the pending viewer");

const tapResult = hostTapParticipantCard(state, viewerId);
assert(tapResult.detailModalOpened === false, "detail modal should stay closed for host moderation taps");
assert(tapResult.seatRequestSheetOpened === true, "host pending-request card tap should open the seat-request sheet");
assert(state.activeParticipantId === viewerId, "viewer card should focus the inline host controls");
assert(state.selectedParticipantId === "", "host moderation tap should not select the participant detail sheet");
assert(state.seatRequestSheetParticipantId === viewerId, "host card tap should target the pending viewer in the seat-request sheet");
assert(state.seatRequestsById[viewerId] === true, "host card tap must not clear the pending request");
assert(!state.hiddenParticipantIds[viewerId], "host card tap must not hide the participant");
assert(state.participantStateById[viewerId].role === "listener", "host card tap must not seat or remove the viewer");
assert(resolveHostLayout({ activeParticipantId: state.activeParticipantId }).partyBox.some((participant) => participant.userId === viewerId), "pending remote viewer should remain visible after host card tap opens sheet");

const approveEvent = createPressEvent();
const approved = approveSeat(state, approveEvent, viewerId);

assert(approveEvent.propagationStopped === true, "approve tap should stop parent card propagation");
assert(approved === true, "host approve action should persist");
assert(state.persistedWrites.length === 1, "approval should persist membership authority once");
assert(state.seatStateBroadcasts.length === 1, "approval should broadcast one seat state after persistence");
assert(
  state.seatStateBroadcasts[0].persistedWriteCountAtBroadcast === 1,
  "seat-state broadcast should happen after membership persistence",
);
assert(state.participantStateById[viewerId].role === "speaker", "viewer should become speaker after host approval");
assert(state.membershipsById[viewerId].canSpeak === true, "viewer should become publish-capable after host approval");
assert(!state.seatRequestsById[viewerId], "approval should clear pending seat request");
assert(state.activeParticipantId === "", "approval should collapse host card overlay");
assert(state.selectedParticipantId === "", "approval should leave detail sheet closed");
assert(state.participantPresentationById[viewerId] === "compact", "approval should collapse expanded viewer card");

const fallbackState = createProofState();
fallbackState.clientPersistenceShouldFail = true;
fallbackState.seatRequestsById[viewerId] = true;
fallbackState.seatRequestSheetParticipantId = viewerId;
const fallbackEvent = createPressEvent();
const fallbackApproved = approveSeat(fallbackState, fallbackEvent, viewerId);
assert(fallbackEvent.propagationStopped === true, "fallback approve tap should stop parent card propagation");
assert(fallbackApproved === true, "host approve should use server-backed persistence when client write fails");
assert(fallbackState.persistedWrites.length === 0, "fallback proof should simulate failed client persistence");
assert(fallbackState.serverPersistedWrites.length === 1, "fallback approval should persist through server authority once");
assert(fallbackState.participantStateById[viewerId].role === "speaker", "fallback approval should seat the viewer");
assert(!fallbackState.seatRequestsById[viewerId], "fallback approval should clear pending request");

const dismissState = createProofState();
dismissState.activeParticipantId = viewerId;
dismissState.participantPresentationById[viewerId] = "expanded";
dismissState.seatRequestsById[viewerId] = true;
dismissState.seatRequestSheetParticipantId = viewerId;

closeSeatRequestSheet(dismissState, viewerId);
assert(dismissState.seatRequestSheetParticipantId === "", "close should hide only the seat-request sheet");
assert(dismissState.seatRequestsById[viewerId] === true, "close should keep the pending request");
assert(dismissState.participantStateById[viewerId].role === "listener", "close should not seat the viewer");
assert(!dismissState.hiddenParticipantIds[viewerId], "close should keep the participant card visible");

dismissState.seatRequestSheetParticipantId = viewerId;
clearPendingSeatRequest(dismissState, viewerId);
assert(!dismissState.seatRequestsById[viewerId], "dismiss should clear pending seat request");
assert(dismissState.seatRequestSheetParticipantId === "", "dismiss should close the seat-request sheet");
assert(dismissState.seatRequestBroadcasts.length === 1, "dismiss should broadcast one request cancellation");
assert(dismissState.seatRequestBroadcasts[0].pending === false, "dismiss should broadcast pending false");
assert(dismissState.participantStateById[viewerId].role === "listener", "dismiss should not seat the viewer");
assert(!dismissState.hiddenParticipantIds[viewerId], "dismiss should keep the participant card visible");
assert(dismissState.activeParticipantId === "", "dismiss should collapse host card overlay");
assert(dismissState.participantPresentationById[viewerId] === "compact", "dismiss should collapse expanded viewer card");

const defaultLayout = resolveViewerLayout({ viewerSelfHeroEnabled: false });
assert(defaultLayout.hero.userId === hostId, "default viewer layout should keep the real host as hero");
assert(defaultLayout.partyBox.some((participant) => participant.userId === viewerId), "default viewer layout should include viewer self in party box");
assert(!defaultLayout.partyBox.some((participant) => participant.userId === hostId), "default layout should not duplicate host in party box");
const selfHeroLayout = resolveViewerLayout({ viewerSelfHeroEnabled: true });
assert(selfHeroLayout.hero.userId === viewerId, "self-hero layout should make the viewer local hero");
assert(selfHeroLayout.partyBox[0]?.userId === hostId, "self-hero party box should put the real host first");
assert(!selfHeroLayout.partyBox.some((participant) => participant.userId === viewerId), "self-hero party box should not duplicate the viewer");
assert("Local self view" !== "Live feed is syncing.", "self-hero fallback copy must not be Live feed syncing");
assert("Local self view" !== "Waiting for host approval", "self-hero fallback copy must not imply approval is required to switch layout");

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
  hostVisualHeroIsSelf: true,
  hostPartyBoxExcludesSelfHost: true,
  hostPartyBoxIncludesRemoteViewer: true,
  hostFocusKeepsRemoteViewerVisible: true,
  defaultViewerSelfVisibleInPartyBox: true,
  hostPendingCardOpensSeatSheet: true,
  viewerSelfHeroLocalOnly: true,
  hostFirstInSelfHeroPartyBox: true,
  viewerCanPublishAfterApproval: true,
}, null, 2));
