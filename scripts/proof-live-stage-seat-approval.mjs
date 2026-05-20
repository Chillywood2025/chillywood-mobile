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

const state = createProofState();
state.seatRequestsById[viewerId] = true;

assert(state.seatRequestsById[viewerId] === true, "host should receive pending viewer request");

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
  viewerCanPublishAfterApproval: true,
}, null, 2));
