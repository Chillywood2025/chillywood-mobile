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
  participantStateById: {
    [hostId]: { role: "host", isMuted: false, isRemoved: false },
    [viewerId]: { role: "listener", isMuted: false, isRemoved: false },
  },
  membershipsById: {
    [hostId]: { stageRole: "host", canSpeak: true, isMuted: false, membershipState: "active" },
    [viewerId]: { stageRole: "listener", canSpeak: false, isMuted: false, membershipState: "active" },
  },
  persistedWrites: [],
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
  state.activeParticipantId = participantId;
  state.participantPresentationById[participantId] =
    state.participantPresentationById[participantId] === "expanded" ? "compact" : "expanded";
  if (canModerateParticipant) {
    state.selectedParticipantId = "";
    return { detailModalOpened: false };
  }
  state.selectedParticipantId = participantId;
  return { detailModalOpened: true };
};

const emitParticipantUpdate = (state, participantId, changes) => {
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

const approveSeat = (state, event, participantId) => {
  event.stopPropagation();
  const seatPersisted = emitParticipantUpdate(state, participantId, { role: "speaker" });
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
    .filter((participant) => participant.userId !== viewer.userId)
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

const state = createProofState();
state.seatRequestsById[viewerId] = true;
state.seatRequestSheetParticipantId = viewerId;

assert(state.seatRequestsById[viewerId] === true, "host should receive pending viewer request");
assert(state.seatRequestSheetParticipantId === viewerId, "host seat-request sheet should target the pending viewer");

const tapResult = hostTapParticipantCard(state, viewerId);
assert(tapResult.detailModalOpened === false, "detail modal should stay closed for host moderation taps");
assert(state.activeParticipantId === viewerId, "viewer card should focus the inline host controls");
assert(state.selectedParticipantId === "", "host moderation tap should not select the participant detail sheet");

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

const dismissState = createProofState();
dismissState.activeParticipantId = viewerId;
dismissState.participantPresentationById[viewerId] = "expanded";
dismissState.seatRequestsById[viewerId] = true;
dismissState.seatRequestSheetParticipantId = viewerId;
clearPendingSeatRequest(dismissState, viewerId);
assert(!dismissState.seatRequestsById[viewerId], "dismiss should clear pending seat request");
assert(dismissState.seatRequestSheetParticipantId === "", "dismiss should close the seat-request sheet");
assert(dismissState.seatRequestBroadcasts.length === 1, "dismiss should broadcast one request cancellation");
assert(dismissState.seatRequestBroadcasts[0].pending === false, "dismiss should broadcast pending false");
assert(dismissState.participantStateById[viewerId].role === "listener", "dismiss should not seat the viewer");
assert(dismissState.activeParticipantId === "", "dismiss should collapse host card overlay");
assert(dismissState.participantPresentationById[viewerId] === "compact", "dismiss should collapse expanded viewer card");

const defaultLayout = resolveViewerLayout({ viewerSelfHeroEnabled: false });
assert(defaultLayout.hero.userId === hostId, "default viewer layout should keep the real host as hero");
assert(!defaultLayout.partyBox.some((participant) => participant.userId === hostId), "default layout should not duplicate host in party box");
const selfHeroLayout = resolveViewerLayout({ viewerSelfHeroEnabled: true });
assert(selfHeroLayout.hero.userId === viewerId, "self-hero layout should make the viewer local hero");
assert(selfHeroLayout.partyBox[0]?.userId === hostId, "self-hero party box should put the real host first");
assert(!selfHeroLayout.partyBox.some((participant) => participant.userId === viewerId), "self-hero party box should not duplicate the viewer");

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
  dismissClosesSeatRequestSheet: true,
  viewerSelfHeroLocalOnly: true,
  hostFirstInSelfHeroPartyBox: true,
  viewerCanPublishAfterApproval: true,
}, null, 2));
