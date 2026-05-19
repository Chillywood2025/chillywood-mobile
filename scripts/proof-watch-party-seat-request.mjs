const PARTY_SEAT_REQUEST_MESSAGE_PREFIX = "__chillywood_party_seat_request_v1__:";
const PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS = 5 * 60 * 1000;

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

const encodeSeatRequest = (participantId, pending, sentAt = now) => (
  `${PARTY_SEAT_REQUEST_MESSAGE_PREFIX}${JSON.stringify({ participantId, pending, sentAt })}`
);

const decodeSeatRequest = (body) => {
  const text = String(body ?? "").trim();
  if (!text.startsWith(PARTY_SEAT_REQUEST_MESSAGE_PREFIX)) return null;
  try {
    const decoded = JSON.parse(text.slice(PARTY_SEAT_REQUEST_MESSAGE_PREFIX.length));
    const participantId = String(decoded.participantId ?? "").trim();
    if (!participantId) return null;
    return {
      participantId,
      pending: decoded.pending !== false,
      sentAt: Number(decoded.sentAt ?? 0),
    };
  } catch {
    return null;
  }
};

const createProofState = () => ({
  hostAuthority: { isHost: true, source: "proof-room-host" },
  pendingSeatRequests: {},
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

const hasPendingSeatRequest = (state, participant) => {
  if (participant.canSpeak) {
    delete state.pendingSeatRequests[participant.id];
    return false;
  }
  const pending = state.pendingSeatRequests[participant.id];
  if (!pending) return false;
  if (pending.sentAt > 0 && now - pending.sentAt > PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS) {
    delete state.pendingSeatRequests[participant.id];
    return false;
  }
  return true;
};

const mergePendingSeatRequests = (state) => {
  state.participants = state.participants.map((participant) => ({
    ...participant,
    isRequestingToSpeak: state.hostAuthority.isHost && hasPendingSeatRequest(state, participant),
  }));
};

const applySeatRequestMarker = (state, body, source) => {
  const marker = decodeSeatRequest(body);
  assert(marker, "seat request marker should decode");
  assert(state.hostAuthority.isHost, "proof host must have approval authority");
  if (marker.pending) {
    state.pendingSeatRequests[marker.participantId] = { sentAt: marker.sentAt || now, source };
  } else {
    delete state.pendingSeatRequests[marker.participantId];
  }
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
const requestMarker = encodeSeatRequest(viewerId, true);
applySeatRequestMarker(state, requestMarker, "proof-message-poll");

const requestedViewer = state.participants.find((participant) => participant.id === viewerId);
assert(requestedViewer?.isRequestingToSpeak === true, "host state should apply the viewer request");

mergePendingSeatRequests(state);
const refreshedViewer = state.participants.find((participant) => participant.id === viewerId);
assert(refreshedViewer?.isRequestingToSpeak === true, "pending request should survive a roster refresh");

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

applySeatRequestMarker(state, encodeSeatRequest(viewerId, false), "proof-clear");
const clearedViewer = state.participants.find((participant) => participant.id === viewerId);
assert(clearedViewer?.isRequestingToSpeak === false, "clearing the request should remove host pending state");

console.log("Watch-Party seat request proof passed");
console.log(JSON.stringify({
  proofHostId: hostId,
  proofViewerId: viewerId,
  deviceOrEmulatorUsed: false,
  hostRequestRendered: true,
  viewerRequestHidden: true,
}, null, 2));
