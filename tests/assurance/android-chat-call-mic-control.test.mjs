#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { invokeAccountBoundSupabaseRpc, isAccountBoundSupabaseRpcOutcomeAmbiguous } from "../../_lib/accountBoundSupabaseRpc.mjs";
import * as actualCallMediaPolicy from "../../_lib/communicationCallMediaPolicy.mjs";
import * as nativeCallErrorDiagnostics from "../../_lib/nativeCallErrorDiagnostics.mjs";

import {
  evaluateLegacyReleaseReachability,
  evaluateMicControl,
  legacyModel,
  liveKitModel,
  uiModel,
} from "../../scripts/assurance/android-chat-call-mic-control.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const ts = require("typescript");
const { act, useLayoutEffect } = React;
const { createRoot } = require("react-dom/client");
const { RealtimePresence } = require("@supabase/realtime-js");
const hostClearTimeout = globalThis.clearTimeout;
const hostSetTimeout = globalThis.setTimeout;

const contract = JSON.parse(fs.readFileSync("config/assurance/android-chat-call-mic-control-v1.json", "utf8"));
const legacyHookSource = fs.readFileSync(process.env.CHILLY_LEGACY_HOOK_TEST_SOURCE ?? "hooks/use-communication-room-session.ts", "utf8");
const legacyRefMarker = "  const microphonePermissionRef = useRef<MediaPermissionSnapshot>(microphonePermission);";
assert.equal(legacyHookSource.split(legacyRefMarker).length - 1, 1, "unique legacy ref exposure marker");
const legacyOfferQueueMarker = "  const cleanupRemotePeer = useCallback";
assert.equal(legacyHookSource.split(legacyOfferQueueMarker).length - 1, 1, "unique legacy offer queue exposure marker");
const legacySnapshotMarker = "  const updatePresence = useCallback";
assert.equal(legacyHookSource.split(legacySnapshotMarker).length - 1, 1, "unique legacy snapshot exposure marker");
const legacyPeerSyncMarker = "  const syncPeerConnections = useCallback";
assert.equal(legacyHookSource.split(legacyPeerSyncMarker).length - 1, 1, "unique legacy peer sync exposure marker");
const instrumentedLegacyHookSource = legacyHookSource.replace(
  legacyRefMarker,
  `${legacyRefMarker}\n  (globalThis as any).__chillywoodLegacyMicAssuranceRefs = { acquireOwnedLegacyMedia, appStateLifecycleHandlerRef, auxiliaryStreamsRef, cameraEnabledRef, channelRef, channelStateRef, identityRef, joinedMembershipRef, legacyMicAnswerWaitersRef, legacyMicControlRef, legacyMicLocalPrivacyStopRef, legacySessionGenerationRef, localStreamRef, micEnabledRef, microphonePermissionRef, nativePermissionRequestDepthRef, peerConnectionsRef, roomRef, setChannelState, setLoading, presenceRegistrationRef: typeof presenceRegistrationRef === "undefined" ? null : presenceRegistrationRef };`,
).replace(
  legacyOfferQueueMarker,
  `  Object.assign((globalThis as any).__chillywoodLegacyMicAssuranceRefs, { runSerializedPeerOffer, runSerializedPeerSignaling, peerLocalOffersRef, pendingPeerIceRef });\n${legacyOfferQueueMarker}`,
).replace(
  legacySnapshotMarker,
  `  (globalThis as any).__chillywoodLegacyMicAssuranceRefs.refreshSnapshot = refreshSnapshot;\n${legacySnapshotMarker}`,
).replace(
  legacyPeerSyncMarker,
  `  (globalThis as any).__chillywoodLegacyMicAssuranceRefs.createAndSendOffer = createAndSendOffer;\n${legacyPeerSyncMarker}`,
);
const compiledLegacyHook = ts.transpileModule(instrumentedLegacyHookSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "hooks/use-communication-room-session.ts",
}).outputText;
const compiledCaptureRetirement = ts.transpileModule(fs.readFileSync("_lib/communicationCaptureRetirement.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function createCaptureRetirementCoordinator() {
  const exports = {};
  vm.runInNewContext(compiledCaptureRetirement, { exports });
  return exports;
}

const compiledAdmissionCoordinator = ts.transpileModule(fs.readFileSync("_lib/communicationMembershipAdmission.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const createAdmissionCoordinator = () => {
  const coordinatorModule = { exports: {} };
  vm.runInNewContext(compiledAdmissionCoordinator, { module: coordinatorModule, exports: coordinatorModule.exports });
  return coordinatorModule.exports;
};

const settle = async (turns = 32) => {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
};

const installMinimalDom = () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (globalThis.document?.__chillywoodLegacyMicDocument) return;
  const noop = () => undefined;
  const documentStub = {
    __chillywoodLegacyMicDocument: true,
    addEventListener: noop,
    defaultView: globalThis,
    documentElement: null,
    nodeType: 9,
    removeEventListener: noop,
  };
  const documentElement = {
    addEventListener: noop,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    nodeName: "HTML",
    nodeType: 1,
    ownerDocument: documentStub,
    parentNode: null,
    removeEventListener: noop,
    tagName: "HTML",
  };
  documentStub.documentElement = documentElement;
  globalThis.document = documentStub;
  globalThis.window = globalThis;
  globalThis.HTMLIFrameElement = class HTMLIFrameElement {};
};

const createContainer = () => {
  installMinimalDom();
  const noop = () => undefined;
  return {
    addEventListener: noop,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    nodeName: "DIV",
    nodeType: 1,
    ownerDocument: globalThis.document,
    parentNode: null,
    removeEventListener: noop,
    tagName: "DIV",
  };
};

const grantedPermission = () => ({ canAskAgain: true, granted: true, status: "granted" });
const deniedPermission = () => ({ canAskAgain: false, granted: false, status: "denied" });
const permissionSnapshot = (permission) => ({
  canAskAgain: permission?.canAskAgain !== false,
  shouldOpenSettings: permission?.granted !== true && permission?.canAskAgain === false,
  state: permission?.granted === true
    ? "granted"
    : permission?.canAskAgain === false
      ? "denied"
      : "undetermined",
});

const makeMembership = (runtime, overrides = {}) => ({
  avatarUrl: null,
  cameraEnabled: false,
  displayName: overrides.userId === runtime.remoteUserId ? "Remote" : "Local",
  joinedAt: "2026-08-11T00:00:00.000Z",
  lastSeenAt: "2026-08-11T00:00:00.000Z",
  leftAt: null,
  membershipState: "active",
  membershipGeneration: overrides.userId === runtime.remoteUserId ? runtime.remoteMembershipGeneration : runtime.membershipGeneration,
  micEnabled: false,
  role: overrides.userId === runtime.remoteUserId ? "host" : "participant",
  roomId: runtime.roomId,
  userId: runtime.userId,
  ...overrides,
});

const makeRoom = (runtime) => ({
  callType: "audio",
  createdAt: "2026-08-11T00:00:00.000Z",
  hostUserId: runtime.remoteUserId,
  roomCode: runtime.roomId,
  roomId: runtime.roomId,
  status: "active",
});

function createLegacyMountedRuntime(options = {}) {
  const runtime = {
    appState: options.appState ?? "active",
    appStateListeners: [],
    broadcasts: [],
    cameraPermission: grantedPermission(),
    channels: [],
    clockMs: 0,
    cleanupCalls: 0,
    durableCamera: false,
    durableMic: false,
    errors: [],
    intervals: [],
    joinCalls: [],
    joinActions: [],
    admissionPrepareCalls: [],
    admissionPrepareActions: [],
    heartbeatCalls: [],
    leaveActions: [],
    leaveCalls: 0,
    leaveRequests: [],
    localStreams: [],
    mediaActions: [],
    mediaSessionStopper: null,
    mediaCreateCalls: [],
    membershipActions: [],
    membershipGeneration: "12000000-0000-4000-8000-000000000001",
    ownedAdmission: options.ownedAdmission === true,
    admissionAttempts: new Map(),
    currentAdmissionAttemptId: null,
    membershipTouches: [],
    microphonePermission: options.microphonePermission ?? grantedPermission(),
    permissionRequestCalls: 0,
    peerConnectionState: options.peerConnectionState ?? "connected",
    peers: [],
    negotiationTimeline: [],
    permissionActions: [],
    presenceTracks: [],
    presenceTrackActions: [],
    remoteDurableCamera: !!options.remoteDurableCamera,
    remoteDurableMic: !!options.remoteDurableMic,
    remoteMembershipGeneration: "16000000-0000-4000-8000-000000000001",
    remoteUserId: "remote-user",
    roomEndCalls: 0,
    roomId: "ROOM-LEGACY",
    senderAdds: 0,
    senderRemoves: 0,
    senderReplacements: 0,
    removedChannels: [],
    sendActions: [],
    snapshotActions: [],
    snapshotReads: 0,
    timeoutHandles: [],
    timeoutCallbacks: [],
    timeoutDelays: [],
    tokenRequests: 0,
    userId: "local-user",
  };

  let nextTrackId = 0;
  let nextStreamId = 0;

  class FakeTrack {
    constructor(kind, trackOptions = {}) {
      this._enabled = trackOptions.enabled ?? true;
      this.id = trackOptions.id ?? `${kind}-${++nextTrackId}`;
      this.kind = kind;
      this.muted = false;
      this.readyState = trackOptions.readyState ?? "live";
      this.refuseDisable = !!trackOptions.refuseDisable;
      this.refuseStop = !!trackOptions.refuseStop;
    }

    get enabled() { return this._enabled; }
    set enabled(nextEnabled) {
      if (nextEnabled === false && this.refuseDisable) return;
      this._enabled = nextEnabled;
    }

    stop() {
      if (this.refuseStop) return;
      this.enabled = false;
      this.readyState = "ended";
    }
  }

  class FakeStream {
    constructor(tracks = []) {
      this.id = `stream-${++nextStreamId}`;
      this.tracks = [...tracks];
    }

    addTrack(track) {
      if (!this.tracks.some((candidate) => candidate === track)) this.tracks.push(track);
    }

    getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
    getTracks() { return [...this.tracks]; }
    getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
    release() { return undefined; }
    removeTrack(track) { this.tracks = this.tracks.filter((candidate) => candidate !== track); }
    toURL() { return `stream://${this.id}`; }
  }

  class FakePeerConnection {
    constructor() {
      this.connectionState = runtime.peerConnectionState;
      this.currentLocalDescription = null;
      this.iceConnectionState = "connected";
      this.iceGatheringState = "complete";
      this.listeners = new Map();
      this.localDescription = null;
      this.offerCalls = 0;
      this.pendingLocalDescription = null;
      this.receivers = [];
      this.remoteDescriptionCalls = [];
      this.iceCandidates = [];
      this.senders = [];
      this.signalingState = "stable";
      runtime.peers.push(this);
    }

    addEventListener(event, listener) {
      const listeners = this.listeners.get(event) ?? new Set();
      listeners.add(listener);
      this.listeners.set(event, listeners);
    }
    async addIceCandidate(candidate) {
      if (!this.remoteDescription) throw new Error("remote SDP required before ICE");
      this.iceCandidates.push(candidate);
    }
    addTrack(track) {
      if (this.failAddTrack) throw new Error("addTrack rejected");
      runtime.senderAdds += 1;
      const sender = {
        track,
        replaceTrack: async (replacement) => {
          if (sender.failReplaceTrack) throw new Error("replaceTrack rejected");
          runtime.senderReplacements += 1;
          sender.track = replacement;
        },
      };
      this.senders.push(sender);
      return sender;
    }
    removeTrack(sender) {
      if (this.failRemoveTrack) throw new Error("removeTrack rejected");
      runtime.senderRemoves += 1;
      this.senders = this.senders.filter((candidate) => candidate !== sender);
    }
    close() {
      if (this.deferNativeClose) return;
      this.connectionState = "closed";
      this.emit("connectionstatechange");
    }
    async createAnswer() { return { sdp: "answer", type: "answer" }; }
    async createOffer() {
      this.offerCalls += 1;
      if (this.failCreateOffer) throw new Error("createOffer rejected");
      return { sdp: "offer", type: "offer" };
    }
    getReceivers() { return this.receivers; }
    getSenders() { return this.senders; }
    getStats() { return Promise.resolve([]); }
    getTransceivers() { return []; }
    removeEventListener(event, listener) { this.listeners.get(event)?.delete(listener); }
    emit(event, payload) { for (const listener of this.listeners.get(event) ?? []) listener(payload); }
    async setLocalDescription(description) {
      if (this.failSetLocalDescription && description?.type !== "rollback") throw new Error("setLocalDescription rejected");
      if (this.failRollback && description?.type === "rollback") throw new Error("rollback rejected");
      this.localDescription = description;
      if (description?.type === "offer") this.signalingState = "have-local-offer";
      if (description?.type === "answer") this.signalingState = "stable";
      if (description?.type === "rollback") {
        this.localDescription = null;
        this.signalingState = "stable";
      }
      this.emit("signalingstatechange");
    }
    async setRemoteDescription(description) {
      this.remoteDescription = description;
      this.remoteDescriptionCalls.push(description);
      if (description?.type === "answer") this.signalingState = "stable";
      if (description?.type === "offer") this.signalingState = "have-remote-offer";
      this.emit("signalingstatechange");
    }
  }

  const rtc = {
    MediaStream: FakeStream,
    RTCIceCandidate: class RTCIceCandidate { constructor(value) { Object.assign(this, value); } },
    RTCPeerConnection: FakePeerConnection,
    RTCSessionDescription: class RTCSessionDescription { constructor(value) { Object.assign(this, value); } },
  };

  runtime.queueMedia = (action) => runtime.mediaActions.push(action);
  runtime.queueMembership = (action) => runtime.membershipActions.push(action);
  runtime.queuePermission = (permission) => runtime.permissionActions.push(permission);
  runtime.queueSend = (action) => runtime.sendActions.push(action);
  runtime.queueSnapshot = (action) => runtime.snapshotActions.push(action);
  runtime.queuePresenceTrack = (action) => runtime.presenceTrackActions.push(action);
  runtime.emitAppState = async (nextState) => {
    runtime.appState = nextState;
    for (const listener of runtime.appStateListeners) await listener(nextState);
  };
  runtime.createPeer = () => new FakePeerConnection();
  runtime.createStream = (tracks = []) => new FakeStream(tracks);
  runtime.createTrack = (kind = "audio", trackOptions = {}) => new FakeTrack(kind, trackOptions);

  const createMediaStream = async ({ audio, video }) => {
    runtime.mediaCreateCalls.push({ audio, video });
    const action = runtime.mediaActions.shift() ?? {};
    if (action.wait) await action.wait;
    if (action.outcome === "reject") throw action.error ?? new Error("media creation rejected");
    if (action.outcome === "missing") return null;
    const tracks = [];
    if (audio) tracks.push(new FakeTrack("audio", action.audio));
    if (video) tracks.push(new FakeTrack("video", action.video));
    const stream = new FakeStream(tracks);
    runtime.localStreams.push(stream);
    return stream;
  };

  const getTrack = (stream, kind) => {
    if (!stream) return null;
    const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
    return tracks[0] ?? null;
  };

  const activeMemberships = () => [
    makeMembership(runtime, {
      cameraEnabled: runtime.durableCamera,
      micEnabled: runtime.durableMic,
    }),
    makeMembership(runtime, {
      cameraEnabled: runtime.remoteDurableCamera,
      micEnabled: runtime.remoteDurableMic,
      userId: runtime.remoteUserId,
    }),
  ];

  class FakeChannel {
    constructor(topic, config) {
      this.handlers = [];
      this.subscriptionCallback = null;
      this.topic = topic;
      this.config = config;
      runtime.channels.push(this);
      // Use the installed Presence implementation for metadata reconciliation
      // cases. It emits join + leave when a presence ref is replaced by track(),
      // even though the participant is still present. The old success-only
      // track mock could not expose transport teardown at this boundary.
      const sdkHandlers = new Map();
      this.sdkPresenceTransport = {
        joinRef: () => "test-subscription",
        on: (event, callback) => sdkHandlers.set(event, callback),
        trigger: (event, payload) => {
          if (event === "presence") {
            for (const [type, filter, callback] of this.handlers) {
              if (type === "presence" && filter.event === payload.event) callback(payload);
            }
          } else sdkHandlers.get(event)?.(payload);
        },
      };
      this.sdkPresence = new RealtimePresence({
        channelAdapter: { getChannel: () => this.sdkPresenceTransport },
      });
      this.sdkPresenceEnabled = false;
    }

    on(...args) { this.handlers.push(args); return this; }
    async emitBroadcast(event, payload) {
      const callbacks = this.handlers
        .filter(([type, filter]) => type === "broadcast" && filter?.event === event)
        .map(([, , callback]) => callback);
      // The deployed private relay stamps every media packet. Tests can
      // explicitly supply an old/missing stamp to exercise queued wire data.
      const stampedPayload = event !== "room:end" && event !== "state:update" && !Object.hasOwn(payload, "membershipGeneration")
        ? { ...payload, membershipGeneration: runtime.remoteMembershipGeneration } : payload;
      for (const callback of callbacks) await callback({ payload: stampedPayload });
    }
    presenceState() {
      if (this.sdkPresenceEnabled) return this.sdkPresence.state;
      return {
        [runtime.userId]: [{
          cameraOn: options.staleLocalPresence ? false : runtime.durableCamera,
          displayName: "Local",
          joinedAt: "2026-08-11T00:00:00.000Z",
          micOn: options.staleLocalPresence ? false : runtime.durableMic,
          userId: runtime.userId,
        }],
        [runtime.remoteUserId]: [{
          cameraOn: options.staleRemotePresence ? false : runtime.remoteDurableCamera,
          displayName: "Remote",
          isHost: true,
          joinedAt: "2026-08-11T00:00:00.000Z",
          micOn: options.staleRemotePresence ? false : runtime.remoteDurableMic,
          userId: runtime.remoteUserId,
        }],
      };
    }
    emitPresenceState(state) {
      this.sdkPresenceEnabled = true;
      this.sdkPresenceTransport.trigger("presence_state", state);
    }
    emitPresenceDiff(diff) {
      this.sdkPresenceTransport.trigger("presence_diff", diff);
    }
    async send(message) {
      runtime.broadcasts.push(message);
      const actionIndex = runtime.sendActions.findIndex((candidate) => !candidate.event || candidate.event === message.event);
      const action = actionIndex >= 0 ? runtime.sendActions.splice(actionIndex, 1)[0] : {};
      action.mutate?.({ message, runtime });
      if (action.outcome === "reject") throw new Error("channel send rejected");
      if (action.outcome === "error") return "error";
      if (message.event === "webrtc:offer") {
        const refs = runtime.readAssuranceRefs?.();
        const waiter = refs?.legacyMicAnswerWaitersRef.current[message.payload?.negotiationId];
        const peer = waiter?.peerConnection ?? runtime.peers.find((candidate) => candidate.connectionState !== "closed") ?? runtime.peers[0];
        runtime.negotiationTimeline.push({
          event: "offer",
          micEnabled: runtime.durableMic,
          negotiationId: message.payload?.negotiationId ?? null,
          trackEnabled: peer?.getSenders?.().find((sender) => sender.track?.kind === "audio")?.track?.enabled ?? null,
        });
        if (action.answer !== false) {
          if (waiter) {
            await peer.setRemoteDescription({ type: "answer", sdp: "answer" });
            waiter.resolve(true);
          } else if (peer) {
            await peer.setRemoteDescription({ type: "answer", sdp: "answer" });
          }
        }
      }
      return "ok";
    }
    async emitSubscriptionStatus(status, error) {
      await this.subscriptionCallback?.(status, error);
    }
    subscribe(callback) {
      this.subscriptionCallback = typeof callback === "function" ? callback : null;
      if (this.subscriptionCallback) void Promise.resolve().then(() => this.subscriptionCallback("SUBSCRIBED"));
      return this;
    }
    async track(payload) {
      runtime.presenceTracks.push(payload);
      if (runtime.presenceTracks.length > (options.presenceTrackLimit ?? Infinity)) {
        await this.emitSubscriptionStatus("CLOSED");
        return "error";
      }
      const action = runtime.presenceTrackActions.shift() ?? {};
      action.mutate?.({ payload, runtime });
      if (action.wait) await action.wait;
      if (action.outcome === "reject") throw new Error("presence track rejected");
      if (action.outcome === "error") return "error";
      return "ok";
    }
    async untrack() { return "ok"; }
  }

  const AppState = {
    addEventListener: (_event, listener) => {
      runtime.appStateListeners.push(listener);
      return { remove: () => { runtime.appStateListeners = runtime.appStateListeners.filter((candidate) => candidate !== listener); } };
    },
    get currentState() { return runtime.appState; },
  };
  const requestCameraPermission = async () => runtime.cameraPermission;
  const getCameraPermission = async () => runtime.cameraPermission;

  const moduleMocks = {
    "../_lib/accountBoundSupabaseRpc.mjs": { isAccountBoundSupabaseRpcOutcomeAmbiguous },
    "../_lib/communicationMembershipAdmission": options.admissionCoordinator ?? createAdmissionCoordinator(),
    "../_lib/communicationCaptureRetirement": options.captureRetirementCoordinator ?? createCaptureRetirementCoordinator(),
    "../_lib/accessEntitlements": { resolveRoomAccess: async () => ({ isAllowed: true }) },
    "../_lib/analytics": { trackEvent: () => undefined },
    "../_lib/communication": {
      broadcastCommunicationRoomSignal: async ({ event, payload, roomId, userId, expectedMembershipGeneration }) => {
        const channel = runtime.readAssuranceRefs?.().channelRef.current ?? runtime.channels.at(-1);
        if (!channel) return false;
        if (event !== "room:end") {
          assert.equal(userId, runtime.userId, "media relay must use the frozen sender account");
          assert.equal(expectedMembershipGeneration, runtime.membershipGeneration, "media relay must fence the sender admission");
        }
        const result = await channel.send({
          event,
          payload: {
            ...payload,
            fromUserId: runtime.userId,
            ...(event !== "room:end" ? { membershipGeneration: expectedMembershipGeneration } : {}),
            roomId,
          },
          type: "broadcast",
        });
        return result === "ok";
      },
      buildCommunicationChannelName: (roomId) => `comm-room-${roomId}`,
      buildCommunicationPresencePayload: ({ identity, media }) => ({
        cameraOn: media.cameraEnabled,
        displayName: identity.displayName,
        micOn: media.micEnabled,
        userId: identity.userId,
      }),
      COMMUNICATION_DEFAULT_ICE_SERVERS: [],
      COMMUNICATION_ROOM_MAX_PARTICIPANTS: 4,
      createCommunicationMediaStream: createMediaStream,
      endCommunicationRoom: async () => { runtime.roomEndCalls += 1; return null; },
      getActiveCommunicationMemberships: (memberships) => memberships.filter((membership) => !membership.leftAt),
      getCommunicationRoomSnapshot: async () => {
        runtime.snapshotReads += 1;
        const action = runtime.snapshotActions.shift() ?? {};
        action.mutate?.({ runtime });
        if (action.wait) await action.wait;
        if (action.outcome === "reject") throw new Error("snapshot rejected");
        if (action.outcome === "missing") return null;
        return {
          memberships: action.memberships ?? activeMemberships(),
          room: action.room ?? makeRoom(runtime),
        };
      },
      getCommunicationRTCModule: () => rtc,
      getCommunicationStreamURL: (stream) => stream?.toURL?.() ?? "",
      getCommunicationTrack: getTrack,
      heartbeatCommunicationRoomSession: async (input) => {
        runtime.heartbeatCalls.push({ ...input });
        const action = runtime.membershipActions.shift() ?? {};
        if (action.wait) await action.wait;
        if (input.expectedMembershipGeneration !== runtime.membershipGeneration) throw new Error("heartbeat admission changed");
        if (action.outcome === "reject") throw new Error("heartbeat rejected");
        if (action.outcome === "null") return null;
        return makeMembership(runtime, {
          cameraEnabled: runtime.durableCamera,
          micEnabled: runtime.durableMic,
          roomId: input.roomId,
          userId: input.userId,
        });
      },
      joinCommunicationRoomSession: async (input) => {
        runtime.joinCalls.push({ ...input });
        assert.ok(input.admission?.attemptId, "legacy join needs one prepared durable admission attempt");
        assert.equal(input.admission.roomId, input.roomId);
        assert.equal(input.admission.userId, input.userId);
        if (runtime.ownedAdmission) {
          const prior = runtime.admissionAttempts.get(input.admission.attemptId);
          if (prior) {
            if (runtime.currentAdmissionAttemptId !== input.admission.attemptId) throw new Error("stale_admission_attempt");
            return makeMembership(runtime, { cameraEnabled: runtime.durableCamera, micEnabled: runtime.durableMic });
          }
          if (input.admission.expectedPreviousGeneration !== runtime.membershipGeneration) throw new Error("stale_admission_precondition");
          runtime.membershipGeneration = `14000000-0000-4000-8000-${String(runtime.admissionAttempts.size + 1).padStart(12, "0")}`;
          runtime.currentAdmissionAttemptId = input.admission.attemptId;
          runtime.admissionAttempts.set(input.admission.attemptId, runtime.membershipGeneration);
          runtime.durableCamera = !!input.cameraEnabled;
          runtime.durableMic = !!input.micEnabled;
        }
        const admitted = makeMembership(runtime, {
          cameraEnabled: !!input.cameraEnabled,
          micEnabled: !!input.micEnabled,
          roomId: input.roomId,
          userId: input.userId,
        });
        const action = runtime.joinActions.shift() ?? {};
        if (action.wait) await action.wait;
        if (action.outcome === "reject") throw action.error ?? new Error(action.message ?? "join unavailable");
        if (action.outcome === "null") return null;
        return action.membership ?? admitted;
      },
      prepareCommunicationRoomAdmission: async (input) => {
        const prepared = {
          ...input,
          attemptId: `13000000-0000-4000-8000-${String(runtime.admissionPrepareCalls.length + 1).padStart(12, "0")}`,
          expectedPreviousGeneration: runtime.membershipGeneration,
        };
        runtime.admissionPrepareCalls.push(prepared);
        const action = runtime.admissionPrepareActions.shift() ?? {};
        if (action.wait) await action.wait;
        if (action.outcome === "reject") throw new Error(action.message ?? "admission preparation unavailable");
        return prepared;
      },
      leaveCommunicationRoomSession: async (input) => {
        runtime.leaveCalls += 1;
        runtime.leaveRequests.push({ ...input });
        if (input.userId !== runtime.userId) throw new Error("cleanup account changed");
        if (input.expectedMembershipGeneration !== runtime.membershipGeneration) throw new Error("cleanup membership generation changed");
        const action = runtime.leaveActions.shift() ?? {};
        await options.leaveBarrier;
        if (action.wait) await action.wait;
        if (action.outcome === "reject") throw new Error(action.message ?? "durable leave unavailable");
        if (action.outcome === "null") return null;
        return action.membership ?? makeMembership(runtime, { membershipState: "left", cameraEnabled: false, micEnabled: false, leftAt: new Date().toISOString() });
      },
      readCommunicationIdentity: async () => ({ avatarUrl: null, displayName: "Local", userId: runtime.userId }),
      setCommunicationTrackEnabled: (stream, kind, enabled) => {
        const track = getTrack(stream, kind);
        if (!track) return false;
        track.enabled = enabled;
        return true;
      },
      stopCommunicationStream: (stream) => stream?.getTracks?.().forEach((track) => track.stop()),
      touchCommunicationRoomSession: async (input) => {
        runtime.membershipTouches.push({ ...input });
        const action = runtime.membershipActions.shift() ?? { outcome: "success" };
        action.mutate?.({ input, runtime });
        if (action.wait) await action.wait;
        if (input.expectedMembershipGeneration !== runtime.membershipGeneration) throw new Error("media admission changed");
        if (action.outcome === "reject") throw new Error("membership rejected");
        if (action.outcome === "null") return null;
        runtime.durableCamera = !!input.cameraEnabled;
        runtime.durableMic = !!input.micEnabled;
        return action.membership ?? makeMembership(runtime, {
          cameraEnabled: runtime.durableCamera,
          membershipState: input.membershipState,
          micEnabled: runtime.durableMic,
        });
      },
    },
    "../_lib/communicationCallMediaPolicy.mjs": {
      canAttemptNativeCallBackgroundAudio: options.nativeBackgroundPolicy
        ? actualCallMediaPolicy.canAttemptNativeCallBackgroundAudio : () => false,
      resolveLegacyChatSessionRecovery: options.actualRecoveryPolicy ? actualCallMediaPolicy.resolveLegacyChatSessionRecovery : ({ alreadyRequested, enabled, ending, generationIsCurrent }) => (
        enabled && generationIsCurrent && !ending && !alreadyRequested ? { delayMs: 1 } : null
      ),
      setActiveCommunicationTracksEnabled: (tracks, enabled) => {
        let updated = 0;
        for (const track of tracks) {
          if (String(track.readyState).toLowerCase() === "ended") continue;
          track.enabled = enabled;
          updated += 1;
        }
        return updated;
      },
      shouldPreserveNativeCallBackgroundAudio: options.nativeBackgroundPolicy
        ? actualCallMediaPolicy.shouldPreserveNativeCallBackgroundAudio : () => false,
    },
    "../_lib/nativeCallErrorDiagnostics.mjs": nativeCallErrorDiagnostics,
    "../_lib/internalCallMediaDiagnostics": { reportInternalCallMediaDiagnostic: (phase, input) => {
      (runtime.mediaDiagnostics ??= []).push({ phase, ...input });
    } },
    "../_lib/logger": { reportRuntimeError: (scope, error, metadata) => {
      runtime.errors.push({ message: String(error?.message ?? error), scope, metadata });
      if (options.throwRuntimeErrors) throw new Error("controlled diagnostic reporter failure");
    } },
    "../_lib/mediaPermissions": {
      getMediaPermissionRecoveryMessage: (kind, snapshot) => snapshot.state === "denied" ? `${kind} permission denied` : null,
      resolveMediaPermission: permissionSnapshot,
      UNDETERMINED_MEDIA_PERMISSION: permissionSnapshot({ canAskAgain: true, granted: false }),
    },
    "../_lib/mediaSessionLifecycle": {
      registerActiveMediaSessionStopper: (stopper) => {
        runtime.mediaSessionStopper = stopper;
        return () => {
          runtime.cleanupCalls += 1;
          if (runtime.mediaSessionStopper === stopper) runtime.mediaSessionStopper = null;
        };
      },
    },
    "../_lib/performancePolicy": { ROOM_HEARTBEAT_MS: 15_000 },
    "../_lib/roomRules": { normalizeRoomMembershipState: (value) => value },
    "../_lib/supabase": {
      supabase: {
        channel: (topic, config) => new FakeChannel(topic, config),
        getChannels: () => runtime.channels,
        realtime: { setAuth: async () => undefined },
        removeChannel: (channel) => { runtime.removedChannels.push(channel); },
      },
    },
    "expo-av": {
      Audio: {
        getPermissionsAsync: async () => runtime.microphonePermission,
        requestPermissionsAsync: async () => {
          runtime.permissionRequestCalls += 1;
          if (options.permissionAppStateCycle) {
            runtime.appState = "background";
            runtime.readAssuranceRefs().appStateLifecycleHandlerRef.current?.("background");
            runtime.appState = "active";
            runtime.readAssuranceRefs().appStateLifecycleHandlerRef.current?.("active");
          }
          const pendingPermission = runtime.permissionActions.shift();
          if (pendingPermission?.wait) await pendingPermission.wait;
          runtime.microphonePermission = pendingPermission?.permission ?? pendingPermission ?? runtime.microphonePermission;
          return runtime.microphonePermission;
        },
      },
    },
    "expo-camera": {
      useCameraPermissions: () => [
        runtime.cameraPermission,
        requestCameraPermission,
        getCameraPermission,
      ],
    },
    react: React,
    "react-native": {
      AppState,
      Linking: { openSettings: async () => undefined },
    },
  };

  const commonJsModule = { exports: {} };
  const sandbox = {
    __DEV__: false,
    clearInterval: (id) => { runtime.intervals[id - 1] = null; },
    clearTimeout: (id) => {
      runtime.timeoutCallbacks[id - 1] = null;
      if (runtime.timeoutHandles[id - 1]) hostClearTimeout(runtime.timeoutHandles[id - 1]);
    },
    console,
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: (specifier) => {
      if (Object.hasOwn(moduleMocks, specifier)) return moduleMocks[specifier];
      throw new Error(`UNEXPECTED_LEGACY_HOOK_IMPORT:${specifier}`);
    },
    setInterval: (callback, delay) => {
      runtime.intervals.push({ callback, delay, nextAt: runtime.clockMs + delay });
      return runtime.intervals.length;
    },
    setTimeout: (callback, delay) => {
      runtime.timeoutCallbacks.push(callback);
      runtime.timeoutDelays.push(delay);
      runtime.timeoutHandles.push((options.fireOperationTimeouts && (delay === 3_000 || delay === 4_000)) || (options.fireRetryTimeouts && delay === 250) ? hostSetTimeout(callback, 1) : null);
      return runtime.timeoutCallbacks.length;
    },
  };
  vm.runInNewContext(compiledLegacyHook, sandbox, { filename: "hooks/use-communication-room-session.ts" });
  runtime.useHook = sandbox.module.exports.useCommunicationRoomSession;
  runtime.createChannel = (topic) => new FakeChannel(topic);
  runtime.readAssuranceRefs = () => sandbox.__chillywoodLegacyMicAssuranceRefs;
  return runtime;
}

async function mountLegacyHook(runtime, optionOverrides = {}) {
  const container = createContainer();
  const root = createRoot(container);
  let committedResult = null;
  const options = {
    authenticatedAccessToken: "controlled-test-token",
    authenticatedUserId: runtime.userId,
    allowBackgroundAudio: false,
    enabled: false,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: false },
    mediaActivationSerial: 0,
    onRoomEnded: () => undefined,
    roomId: runtime.roomId,
    ...optionOverrides,
  };

  function Harness() {
    const result = runtime.useHook(options);
    useLayoutEffect(() => { committedResult = result; });
    return null;
  }

  await act(async () => {
    root.render(React.createElement(Harness));
    await settle(96);
  });
  const refs = runtime.readAssuranceRefs();
  assert.ok(refs, "legacy exact hook exposes only its mutable test boundary");
  if (!optionOverrides.naturalLifecycle) {
    refs.channelRef.current ??= runtime.createChannel("legacy-mic-exact-channel");
    refs.channelStateRef.current = "live";
    refs.identityRef.current ??= { avatarUrl: null, displayName: "Local", userId: runtime.userId };
    refs.joinedMembershipRef.current ??= makeMembership(runtime);
    refs.roomRef.current ??= makeRoom(runtime);
    // These unit fixtures explicitly start with an acknowledged subscription;
    // natural lifecycle tests exercise the production registration itself.
    if (refs.presenceRegistrationRef && !refs.presenceRegistrationRef.current) {
      refs.presenceRegistrationRef.current = {
        channel: refs.channelRef.current, generation: refs.legacySessionGenerationRef.current,
        roomId: runtime.roomId, userId: runtime.userId, membershipGeneration: runtime.membershipGeneration,
        subscribed: true, confirmed: true, pending: Promise.resolve(true),
      };
    }
    refs.peerConnectionsRef.current[runtime.remoteUserId] ??= runtime.createPeer();
    await act(async () => {
      refs.setLoading(false);
      refs.setChannelState("live");
      await settle(48);
    });
    if (options.analyticsContext?.surface !== "chat-thread") {
      assert.equal(committedResult?.channelState, "live", "legacy exact hook reaches the release media state");
    }
    assert.ok(runtime.peers.length >= 1, "legacy exact hook creates the expected existing remote peer");
  }

  return {
    getResult: () => committedResult,
    refs,
    rerender: async (nextOptions) => act(async () => {
      Object.assign(options, nextOptions);
      root.render(React.createElement(Harness));
      await settle(96);
    }),
    run: async (operation) => {
      let value;
      let rejection;
      await act(async () => {
        try { value = await operation(); } catch (error) { rejection = error; }
        await settle(48);
      });
      if (rejection) throw rejection;
      return value;
    },
    unmount: async () => act(async () => { root.unmount(); await settle(24); }),
  };
}

test("current PR210 contract and bounded adapter remain deterministic", () => {
  assert.equal(contract.contractId, "android-chat-call-mic-control-v1");
  assert.equal(Object.keys(contract.sourceBindings).length, 4);
  assert.equal(Object.keys(contract.sourceSlices).length, 4);
  assert.equal(contract.requiredCaseMatrix.length, 38);
  assert.equal(contract.negativeControls.length, 28);
  assert.equal(contract.proofTiers.T2_MODEL, "MODEL_CLEAR_MOUNTED_HOOK_EXECUTION");
  assert.equal(contract.proofTiers.T3_INTEGRATION, "BLOCKED_INTERNAL_NATIVE_AUDIO_MATRIX_INCOMPLETE");

  const reachability = evaluateLegacyReleaseReachability();
  assert.equal(reachability.status, "REACHABLE_PUBLIC_DEFAULT");
  assert.equal(reachability.publicDefaultProvider, "legacy_webrtc");
  assert.equal(reachability.providerContact, false);

  const runs = [evaluateMicControl(), evaluateMicControl(), evaluateMicControl()];
  for (const evidence of runs) {
    assert.deepEqual(evidence.sharedUi, { passed: 10, total: 10 });
    assert.deepEqual(evidence.liveKit, { passed: 20, total: 20 });
    assert.deepEqual(evidence.legacy, { passed: 20, total: 20 });
    assert.deepEqual(evidence.negativeControls, {
      ...evidence.negativeControls,
      passed: 13,
      total: 13,
    });
    assert.equal(evidence.legacyReachability.status, "REACHABLE_PUBLIC_DEFAULT");
    assert.equal(evidence.source.files, 4);
  }
  assert.equal(new Set(runs.map((run) => run.deterministicEvidenceSha256)).size, 1);
  assert.equal(uiModel({ micEnabled: true }).next, false);
  assert.equal(liveKitModel({ connected: true, current: false, next: true, audioSession: true, publication: true }).ok, true);
  assert.equal(legacyModel({ current: true, next: false, track: true }).ok, true);
});

const seedLocalTrack = (runtime, harness, trackOptions = {}, { sender = false, video = false } = {}) => {
  const tracks = [runtime.createTrack("audio", trackOptions)];
  if (video) tracks.unshift(runtime.createTrack("video", { enabled: true }));
  const stream = runtime.createStream(tracks);
  runtime.localStreams.push(stream);
  harness.refs.localStreamRef.current = stream;
  if (sender) runtime.peers[0].addTrack(tracks.find((track) => track.kind === "audio"), stream);
  return { stream, track: tracks.find((candidate) => candidate.kind === "audio") };
};

const usableLocalAudioTracks = (harness) => {
  const streams = new Set([
    ...(harness.refs.localStreamRef.current ? [harness.refs.localStreamRef.current] : []),
    ...harness.refs.auxiliaryStreamsRef.current,
  ]);
  return [...streams].flatMap((stream) => stream.getAudioTracks()).filter((track) => (
    track.enabled && String(track.readyState).toLowerCase() !== "ended"
  ));
};

const legacyFirstTrackCases = [
  {
    id: "permission_restored_first_track",
    runtimeOptions: { microphonePermission: deniedPermission() },
    setup: (runtime) => runtime.queuePermission(grantedPermission()),
    verify: ({ runtime }) => assert.equal(runtime.permissionActions.length, 0),
  },
  {
    id: "permission_granted_first_track",
    verify: ({ runtime }) => assert.equal(runtime.permissionRequestCalls, 0, "already-granted permission is read without launching system UI"),
  },
  {
    id: "permission_prompt_appstate_cycle_is_not_call_background",
    runtimeOptions: {
      microphonePermission: { canAskAgain: true, granted: false, status: "undetermined" },
      permissionAppStateCycle: true,
    },
    setup: (runtime, harness) => {
      runtime.generationBeforePermission = harness.refs.legacySessionGenerationRef.current;
      runtime.queuePermission(grantedPermission());
    },
    verify: ({ harness, runtime }) => {
      assert.equal(runtime.permissionRequestCalls, 1);
      assert.equal(harness.refs.channelStateRef.current, "live");
      assert.equal(harness.refs.legacySessionGenerationRef.current, runtime.generationBeforePermission);
      assert.equal(runtime.peers[0].connectionState, "connected");
    },
  },
  { id: "connected_peer_offer", verify: ({ runtime }) => assert.equal(runtime.peers[0].offerCalls, 1) },
  { id: "connecting_peer_offer", runtimeOptions: { peerConnectionState: "connecting" } },
  { id: "disconnected_peer_offer", runtimeOptions: { peerConnectionState: "disconnected" } },
  {
    id: "reconnecting_session_authority",
    setup: (_runtime, harness) => { harness.refs.channelStateRef.current = "reconnecting"; },
  },
  {
    id: "primary_video_stream_gains_audio",
    setup: (runtime, harness) => {
      const stream = runtime.createStream([runtime.createTrack("video", { enabled: true })]);
      runtime.localStreams.push(stream);
      harness.refs.localStreamRef.current = stream;
    },
    verify: ({ harness }) => assert.equal(harness.refs.localStreamRef.current.getVideoTracks().length, 1),
  },
  {
    id: "ended_primary_track_restored",
    setup: (runtime, harness) => seedLocalTrack(runtime, harness, { enabled: false, readyState: "ended" }),
  },
  {
    id: "ended_sender_replaced",
    setup: (runtime, harness) => seedLocalTrack(runtime, harness, { enabled: false, readyState: "ended" }, { sender: true }),
    verify: ({ runtime }) => assert.ok(runtime.senderReplacements >= 1),
  },
  {
    id: "disabled_live_track_attached",
    setup: (runtime, harness) => seedLocalTrack(runtime, harness, { enabled: false }),
    verify: ({ runtime }) => assert.equal(runtime.mediaCreateCalls.length, 0),
  },
  {
    id: "same_track_sender_reused",
    setup: (runtime, harness) => seedLocalTrack(runtime, harness, { enabled: false }, { sender: true }),
    verify: ({ runtime }) => assert.equal(runtime.senderAdds, 1),
  },
  {
    id: "two_peer_atomic_attach",
    setup: (runtime, harness) => { harness.refs.peerConnectionsRef.current["remote-two"] = runtime.createPeer(); },
    verify: ({ runtime }) => assert.equal(runtime.negotiationTimeline.length, 2),
  },
  {
    id: "three_peer_atomic_attach",
    setup: (runtime, harness) => {
      harness.refs.peerConnectionsRef.current["remote-two"] = runtime.createPeer();
      harness.refs.peerConnectionsRef.current["remote-three"] = runtime.createPeer();
    },
    verify: ({ runtime }) => assert.equal(runtime.negotiationTimeline.length, 3),
  },
  {
    id: "auxiliary_audio_without_primary_attached",
    setup: (runtime, harness) => {
      const stream = runtime.createStream([runtime.createTrack("audio", { enabled: false })]);
      runtime.localStreams.push(stream);
      harness.refs.auxiliaryStreamsRef.current = [stream];
      harness.refs.localStreamRef.current = null;
    },
    verify: ({ harness }) => assert.equal(harness.refs.localStreamRef.current, null),
  },
  {
    id: "camera_true_preserved",
    setup: (_runtime, harness) => { harness.refs.cameraEnabledRef.current = true; },
    verify: ({ harness, runtime }) => {
      assert.equal(harness.refs.cameraEnabledRef.current, true);
      assert.equal(runtime.membershipTouches.at(-1)?.cameraEnabled, true);
    },
  },
  {
    id: "active_membership_commit",
    verify: ({ runtime }) => assert.equal(runtime.membershipTouches.at(-1)?.membershipState, "active"),
  },
  {
    id: "reconnecting_membership_commit",
    setup: (_runtime, harness) => { harness.refs.channelStateRef.current = "reconnecting"; },
    verify: ({ runtime }) => assert.equal(runtime.membershipTouches.at(-1)?.membershipState, "reconnecting"),
  },
  {
    id: "track_disabled_during_offer",
    verify: ({ runtime }) => assert.ok(runtime.negotiationTimeline.every((entry) => entry.trackEnabled === false)),
  },
  {
    id: "offer_is_correlated",
    verify: ({ runtime }) => assert.match(runtime.negotiationTimeline[0].negotiationId, /^legacy-mic:ROOM-LEGACY:local-user:\d+:forward$/u),
  },
  {
    id: "peer_offer_correlations_unique",
    setup: (runtime, harness) => { harness.refs.peerConnectionsRef.current["remote-two"] = runtime.createPeer(); },
    verify: ({ runtime }) => assert.equal(new Set(runtime.negotiationTimeline.map((entry) => entry.negotiationId)).size, 2),
  },
  {
    id: "enable_then_disable_serialized",
    execute: async (harness) => {
      const enabled = await harness.getResult().setMicrophoneEnabled(true);
      const disabled = await harness.getResult().setMicrophoneEnabled(false);
      return { disabled, enabled };
    },
    expected: "disabled",
  },
  {
    id: "repeated_enable_reuses_one_sender",
    execute: async (harness) => {
      const first = await harness.getResult().setMicrophoneEnabled(true);
      const second = await harness.getResult().setMicrophoneEnabled(true);
      return { first, second };
    },
    expected: "repeated",
    verify: ({ result, runtime }) => {
      assert.deepEqual(result, { first: true, second: true });
      assert.equal(runtime.peers[0].getSenders().filter((sender) => sender.track?.kind === "audio").length, 1);
    },
  },
  {
    id: "session_authority_change_denies_commit",
    setup: (runtime) => runtime.queueSend({
      event: "webrtc:offer",
      mutate: () => { runtime.readAssuranceRefs().channelRef.current = runtime.createChannel("replacement-channel"); },
    }),
    expected: false,
  },
  {
    id: "permission_denied_no_false_success",
    runtimeOptions: { microphonePermission: deniedPermission() },
    expected: false,
    verify: ({ harness }) => assert.match(harness.getResult().mediaPermissionMessage, /microphone permission denied/u),
  },
  { id: "media_create_rejection", setup: (runtime) => runtime.queueMedia({ outcome: "reject" }), expected: false },
  { id: "media_create_missing", setup: (runtime) => runtime.queueMedia({ outcome: "missing" }), expected: false },
  { id: "media_created_ended_track", setup: (runtime) => runtime.queueMedia({ audio: { enabled: false, readyState: "ended" } }), expected: false },
  {
    id: "duplicate_usable_local_tracks_denied",
    setup: (runtime, harness) => {
      const stream = runtime.createStream([runtime.createTrack("audio"), runtime.createTrack("audio")]);
      runtime.localStreams.push(stream);
      harness.refs.localStreamRef.current = stream;
    },
    expected: false,
  },
  { id: "closed_peer_denied", setup: (runtime) => { runtime.peers[0].connectionState = "closed"; }, expected: false },
  { id: "missing_remove_track_denied", setup: (runtime) => { runtime.peers[0].removeTrack = undefined; }, expected: false },
  {
    id: "duplicate_audio_senders_denied",
    setup: (runtime) => {
      runtime.peers[0].addTrack(runtime.createTrack("audio"), runtime.createStream());
      runtime.peers[0].addTrack(runtime.createTrack("audio"), runtime.createStream());
    },
    expected: false,
  },
  {
    id: "missing_replace_track_denied",
    setup: (runtime, harness) => {
      const { track, stream } = seedLocalTrack(runtime, harness, { enabled: false, readyState: "ended" }, { sender: true });
      runtime.peers[0].getSenders().find((sender) => sender.track === track).replaceTrack = undefined;
      assert.equal(stream.getAudioTracks().length, 1);
    },
    expected: false,
  },
  { id: "add_track_rejection_rolls_back", setup: (runtime) => { runtime.peers[0].failAddTrack = true; }, expected: false },
  {
    id: "replace_track_rejection_rolls_back",
    setup: (runtime, harness) => {
      seedLocalTrack(runtime, harness, { enabled: false, readyState: "ended" }, { sender: true });
      runtime.peers[0].getSenders()[0].failReplaceTrack = true;
    },
    expected: false,
  },
  { id: "create_offer_rejection_rolls_back", setup: (runtime) => { runtime.peers[0].failCreateOffer = true; }, expected: false },
  { id: "local_description_rejection_rolls_back", setup: (runtime) => { runtime.peers[0].failSetLocalDescription = true; }, expected: false },
  { id: "offer_send_error_rolls_back", setup: (runtime) => runtime.queueSend({ event: "webrtc:offer", outcome: "error" }), expected: false },
  {
    id: "answer_timeout_rolls_back",
    runtimeOptions: { fireOperationTimeouts: true },
    setup: (runtime) => runtime.queueSend({ answer: false, event: "webrtc:offer" }),
    expected: false,
  },
  { id: "durable_rejection_rolls_back", setup: (runtime) => runtime.queueMembership({ outcome: "reject" }), expected: false },
  { id: "durable_null_rolls_back", setup: (runtime) => runtime.queueMembership({ outcome: "null" }), expected: false },
  { id: "retired_presence_registration_compensates", setup: (_runtime, harness) => { harness.refs.presenceRegistrationRef.current.subscribed = false; }, expected: false },
  { id: "media_broadcast_error_compensates", setup: (runtime) => runtime.queueSend({ event: "media:update", outcome: "error" }), expected: false },
];

assert.equal(legacyFirstTrackCases.length, 43, "grouped media-lifecycle matrix remains exactly 43 cases");

for (const matrixCase of legacyFirstTrackCases) {
  test(`legacy first-track 43-case matrix: ${matrixCase.id}`, async (t) => {
    const runtime = createLegacyMountedRuntime(matrixCase.runtimeOptions);
    const harness = await mountLegacyHook(runtime);
    t.after(() => harness.unmount());
    await matrixCase.setup?.(runtime, harness);

    const result = await harness.run(() => (
      matrixCase.execute?.(harness, runtime)
      ?? harness.getResult().setMicrophoneEnabled(true)
    ));

    if (matrixCase.expected === "disabled") {
      assert.deepEqual(result, { disabled: true, enabled: true });
      assert.equal(harness.getResult().micEnabled, false);
      assert.equal(runtime.durableMic, false);
    } else if (matrixCase.expected === "repeated") {
      assert.deepEqual(result, { first: true, second: true });
      assert.equal(harness.getResult().micEnabled, true);
      assert.equal(runtime.durableMic, true);
    } else if (matrixCase.expected === false) {
      assert.equal(result, false, `${matrixCase.id}: failed transaction must not report product success`);
      assert.equal(harness.getResult().micEnabled, false, `${matrixCase.id}: UI remains muted`);
      assert.equal(runtime.durableMic, false, `${matrixCase.id}: durable membership remains muted`);
    } else {
      assert.equal(result, true, `${matrixCase.id}: transaction reports success`);
      assert.equal(harness.getResult().micEnabled, true, `${matrixCase.id}: UI reflects enabled mic`);
      assert.equal(runtime.durableMic, true, `${matrixCase.id}: durable membership reflects enabled mic`);
      assert.equal(usableLocalAudioTracks(harness).length, 1, `${matrixCase.id}: exactly one usable local audio track`);
      for (const peerConnection of Object.values(harness.refs.peerConnectionsRef.current)) {
        const usableSenders = peerConnection.getSenders().filter((sender) => (
          sender.track?.kind === "audio"
          && sender.track.enabled
          && String(sender.track.readyState).toLowerCase() !== "ended"
        ));
        assert.equal(usableSenders.length, 1, `${matrixCase.id}: exactly one current usable audio sender per peer`);
      }
    }

    await matrixCase.verify?.({ harness, result, runtime });
    assert.equal(runtime.roomEndCalls, 0, `${matrixCase.id}: microphone control does not end the call`);
    assert.equal(runtime.tokenRequests, 0, `${matrixCase.id}: legacy control does not request provider tokens`);
    if (matrixCase.expected === false && matrixCase.id !== "permission_denied_no_false_success") {
      assert.ok(runtime.errors.length >= 1, `${matrixCase.id}: operational failure remains observable after fail-closed compensation`);
    } else {
      assert.equal(runtime.errors.length, 0, `${matrixCase.id}: no unexpected native/React error path`);
    }
  });
}

test("legacy grouped media lifecycle: a first camera track renegotiates an already connected peer before commit", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: false }, { sender: true });

  const result = await harness.run(() => harness.getResult().toggleCamera());

  assert.equal(result, true);
  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.peers[0].signalingState, "stable");
  assert.equal(runtime.peers[0].offerCalls, 1, "connected peer receives the required renegotiation offer");
  const videoSenders = runtime.peers[0].getSenders().filter((sender) => sender.track?.kind === "video");
  assert.equal(videoSenders.length, 1);
  assert.equal(videoSenders[0].track.enabled, true);
  assert.equal(runtime.broadcasts.at(-1)?.event, "media:update");
  assert.equal(runtime.broadcasts.at(-1)?.payload?.cameraOn, true);
});

test("legacy grouped media lifecycle: membership admission is muted until native tracks are proved", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, {
    authenticatedAccessToken: "exact-access-token",
    authenticatedUserId: runtime.userId,
    enabled: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
  });
  t.after(() => harness.unmount());

  assert.ok(runtime.joinCalls.length >= 1);
  assert.equal(runtime.joinCalls[0].cameraEnabled, false);
  assert.equal(runtime.joinCalls[0].micEnabled, false);
  assert.ok(runtime.mediaCreateCalls.some((call) => call.audio === true && call.video === true));
  assert.ok(runtime.membershipTouches.some((touch) => touch.cameraEnabled === true && touch.micEnabled === true));
  assert.ok(runtime.broadcasts.some((message) => (
    message.event === "media:update"
    && message.payload?.cameraOn === true
    && message.payload?.micOn === true
  )), "proved initial media promotion is relayed to the remote projection seam");
});

test("legacy grouped media lifecycle: same-room snapshot object churn cannot revoke proved initial media", async (t) => {
  const runtime = createLegacyMountedRuntime();
  runtime.queueSend({
    event: "media:update",
    mutate: () => {
      runtime.readAssuranceRefs().roomRef.current = makeRoom(runtime);
    },
  });
  const harness = await mountLegacyHook(runtime, {
    authenticatedAccessToken: "exact-access-token",
    authenticatedUserId: runtime.userId,
    enabled: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
  });
  t.after(() => harness.unmount());

  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(harness.getResult().micEnabled, true);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.durableMic, true);
  assert.equal(runtime.errors.some((entry) => entry.scope === "communication-presence-initial-promotion"), false);
});

test("legacy snapshot authority: an older overlapping response cannot overwrite the newest same-session snapshot", async (t) => {
  let releaseOlder;
  const olderBarrier = new Promise((resolve) => { releaseOlder = resolve; });
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  const olderRoom = { ...makeRoom(runtime), updatedAt: "2026-08-11T00:00:01.000Z" };
  const newerRoom = { ...makeRoom(runtime), updatedAt: "2026-08-11T00:00:02.000Z" };
  runtime.queueSnapshot({ room: olderRoom, wait: olderBarrier });
  runtime.queueSnapshot({ room: newerRoom });

  let olderRead;
  await act(async () => {
    olderRead = harness.refs.refreshSnapshot(runtime.roomId);
    await settle(8);
  });
  await harness.run(() => harness.refs.refreshSnapshot(runtime.roomId));
  releaseOlder();
  await harness.run(() => olderRead);

  assert.equal(harness.refs.roomRef.current.updatedAt, newerRoom.updatedAt);
  assert.equal(harness.getResult().room.updatedAt, newerRoom.updatedAt);
});

test("legacy snapshot authority: private room Realtime terminal status is observable and enters bounded recovery", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, {
    authenticatedAccessToken: "exact-access-token",
    authenticatedUserId: runtime.userId,
    enabled: true,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: false },
    restartDisconnectedSession: true,
  });
  t.after(() => harness.unmount());
  const stateChannel = runtime.channels.find((channel) => channel.topic === `comm-room-${runtime.roomId}`);
  assert.ok(stateChannel);
  assert.equal(stateChannel.config.config.private, true);
  assert.equal(runtime.channels.some((channel) => channel.topic.startsWith("comm-room-state-")), false);
  assert.equal(runtime.channels.some((channel) => channel.handlers.some(([type]) => type === "postgres_changes")), false);

  await harness.run(() => stateChannel.emitSubscriptionStatus("CHANNEL_ERROR", new Error("state channel rejected")));

  assert.equal(runtime.errors.some((entry) => entry.scope === "communication-realtime-subscription"), true);
  assert.ok(runtime.timeoutCallbacks.some(Boolean), "state-channel failure schedules the generation-deduplicated session recovery");
});

test("legacy server state hint: empty private invalidation reads durable media and departure without trusting a row payload", async (t) => {
  const runtime = createLegacyMountedRuntime({ remoteDurableCamera: true, remoteDurableMic: true });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  assert.ok(channel.handlers.some(([type, filter]) => type === "broadcast" && filter.event === "state:update"));
  const reads = runtime.snapshotReads;
  runtime.remoteDurableCamera = false;
  runtime.remoteDurableMic = false;
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  assert.equal(runtime.snapshotReads, reads + 1);
  const remote = harness.getResult().participants.find((participant) => participant.userId === runtime.remoteUserId);
  assert.equal(remote.cameraOn, false);
  assert.equal(remote.micOn, false);
  await harness.run(() => channel.emitBroadcast("state:update", { roomId: "OTHER", status: "ended", cameraOn: true, micOn: true }));
  assert.equal(harness.getResult().room.status, "active", "hint contents cannot replace the authoritative room");
  assert.equal(harness.getResult().participants.find((participant) => participant.userId === runtime.remoteUserId).cameraOn, false);
  runtime.queueSnapshot({ memberships: [makeMembership(runtime)] });
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  assert.equal(peer.connectionState, "closed", "authoritative DELETE readback retires the departed peer");
  assert.equal(harness.getResult().participants.some((participant) => participant.userId === runtime.remoteUserId), false);
});

for (const receipt of ["missing", "ended"]) {
test(`legacy server state hint: authoritative ${receipt} room retires capture but an empty hint alone cannot end the call`, async (t) => {
  const ended = [];
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true }, onRoomEnded: (reason) => ended.push(reason) });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  assert.deepEqual(ended, []);
  runtime.queueSnapshot(receipt === "missing" ? { outcome: "missing" } : { room: { ...makeRoom(runtime), status: "ended" } });
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  assert.deepEqual(ended, ["ended"]);
  assert.ok(runtime.localStreams.flatMap((stream) => stream.getTracks()).every((track) => track.readyState === "ended"));
  assert.ok(runtime.peers.every((peer) => peer.connectionState === "closed"));
  const reads = runtime.snapshotReads;
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  assert.equal(runtime.snapshotReads, reads, "retired terminal subscription cannot read or reopen media");
});
}

test("legacy server state hint: a failed read is not terminal proof and a later successful null retires capture", async (t) => {
  const ended = [];
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true }, onRoomEnded: (reason) => ended.push(reason) });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  runtime.queueSnapshot({ outcome: "reject" });
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  assert.deepEqual(ended, []);
  assert.equal(harness.refs.channelRef.current, channel);
  assert.ok(runtime.localStreams.flatMap((stream) => stream.getTracks()).some((track) => track.readyState === "live" && track.enabled));
  assert.equal(runtime.errors.at(-1)?.scope, "communication-room-state-refresh");
  runtime.queueSnapshot({ outcome: "missing" });
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  assert.deepEqual(ended, ["ended"]);
  assert.ok(runtime.localStreams.flatMap((stream) => stream.getTracks()).every((track) => track.readyState === "ended"));
});

test("legacy server state hint: unavailable room retains failed native shutdown for exact End retry", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true } });
  t.after(() => harness.unmount());
  const track = runtime.localStreams.flatMap((stream) => stream.getTracks())[0];
  track.refuseStop = true;
  const channel = harness.refs.channelRef.current;
  runtime.queueSnapshot({ outcome: "missing" });
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  assert.equal(track.readyState, "live", "controlled failed native stop remains observable");
  assert.equal(track.enabled, false, "terminal retirement still disables the retained capture");
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()));
  track.refuseStop = false;
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(track.readyState, "ended");
  assert.equal(runtime.leaveRequests.at(-1).expectedMembershipGeneration, runtime.membershipGeneration);
});

for (const cancelCamera of [false, true]) {
test(`legacy background resubscription preserves camera intent unless explicitly cancelled: ${cancelCamera}`, async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true, actualRecoveryPolicy: true, nativeBackgroundPolicy: true });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true,
    restartDisconnectedSession: true, initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    analyticsContext: { surface: "chat-thread" } });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  await harness.run(() => runtime.emitAppState("background"));
  await harness.run(() => channel.emitSubscriptionStatus("SUBSCRIBED"));
  assert.equal(runtime.durableCamera, false, "stopped background capture must be projected Off");
  if (cancelCamera) await harness.rerender({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
  await harness.run(() => runtime.emitAppState("active"));
  const liveVideo = [...new Set(runtime.localStreams.flatMap(stream => stream.getVideoTracks()))]
    .filter(track => track.readyState === "live" && track.enabled);
  assert.equal(liveVideo.length, Number(!cancelCamera), "resubscription cannot erase or override deliberate camera intent");
  assert.equal(runtime.durableCamera, !cancelCamera);
});
}

for (const cancellation of ["Camera Off", "account replacement"]) {
test(`legacy delayed background camera projection cannot override ${cancellation}`, async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true, actualRecoveryPolicy: true, nativeBackgroundPolicy: true });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true,
    restartDisconnectedSession: true, initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    analyticsContext: { surface: "chat-thread" } });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  let releaseWrite;
  runtime.queueMembership({ wait: new Promise(resolve => { releaseWrite = resolve; }) });
  await harness.run(() => runtime.emitAppState("background"));
  await harness.run(() => channel.emitSubscriptionStatus("SUBSCRIBED"));
  let releaseCamera;
  runtime.queueMedia({ wait: new Promise(resolve => { releaseCamera = resolve; }) });
  await harness.run(() => runtime.emitAppState("active"));
  assert.equal(runtime.mediaCreateCalls.at(-1).audio, false);
  assert.equal(runtime.mediaCreateCalls.at(-1).video, true);
  if (cancellation === "Camera Off") {
    await harness.rerender({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
  } else {
    runtime.userId = "replacement-user";
    await harness.rerender({ authenticatedUserId: runtime.userId, authenticatedAccessToken: "replacement-token", enabled: false });
  }
  await harness.run(() => releaseWrite());
  await harness.run(() => releaseCamera());
  const enabledVideo = [...new Set(runtime.localStreams.flatMap(stream => stream.getVideoTracks()))]
    .filter(track => track.readyState === "live" && track.enabled);
  assert.equal(enabledVideo.length, 0, "late capture remains retired after the owner cancels its intent");
  assert.equal(runtime.durableCamera, false);
  if (cancellation === "Camera Off") assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.joinCalls.length, 1, "an obsolete projection cannot create a replacement admission");
});
}

for (const outcome of ["recover", "explicit End", "new mute", "admission denied", "native stop failure", "account replacement"]) {
test(`legacy background lease recovery: pending invisible-room read before foreground restart respects ${outcome}`, async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true, actualRecoveryPolicy: true, nativeBackgroundPolicy: true });
  const ended = [];
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true,
    restartDisconnectedSession: true, initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    analyticsContext: { surface: "chat-thread" }, onRoomEnded: reason => ended.push(reason) });
  t.after(() => harness.unmount());
  const live = kind => runtime.localStreams.flatMap(stream => stream.getTracks())
    .filter(track => track.kind === kind && track.readyState === "live" && track.enabled);
  assert.equal(runtime.joinCalls.length, 1);
  assert.equal(live("audio").length, 1);
  const originalAudio = live("audio")[0];
  if (outcome === "native stop failure") originalAudio.refuseStop = true;
  const channel = harness.refs.channelRef.current;
  await harness.run(() => runtime.emitAppState("background"));
  assert.equal(live("audio").length, 0);
  assert.equal(live("video").length, 0);
  let release;
  // The backend denies non-host room SELECT after its own 45s membership
  // lease expires. Model an already-pending response, not instantaneous HTTP.
  runtime.queueSnapshot({ outcome: "missing", wait: new Promise(resolve => { release = resolve; }) });
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  const timerStart = runtime.timeoutCallbacks.length;
  await harness.run(() => runtime.emitAppState("active"));
  await harness.run(async () => { release(); await settle(96); });
  assert.deepEqual(ended, [], "lease invisibility must not end the other participant's accepted call");
  assert.equal(live("audio").length, 0);
  assert.equal(live("video").length, 0);
  const capturesBefore = runtime.mediaCreateCalls.length;
  if (outcome === "explicit End") await harness.run(() => harness.getResult().leaveRoom());
  if (outcome === "new mute") await harness.run(() => harness.getResult().setMicrophoneEnabled(false));
  if (outcome === "admission denied") runtime.admissionPrepareActions.push({ outcome: "reject", message: "communication_chat_call_authority_required" });
  if (outcome === "account replacement") {
    runtime.userId = "replacement-user";
    await harness.rerender({ authenticatedUserId: runtime.userId, authenticatedAccessToken: "replacement-token", enabled: false });
  }
  for (let index = timerStart; index < runtime.timeoutCallbacks.length; index += 1) {
    if (runtime.timeoutDelays[index] === 0 && runtime.timeoutCallbacks[index]) {
      const callback = runtime.timeoutCallbacks[index]; runtime.timeoutCallbacks[index] = null;
      await harness.run(callback);
    }
  }
  await harness.run(() => settle(160));
  assert.deepEqual(ended, []);
  if (outcome === "recover" || outcome === "new mute") {
    assert.equal(runtime.joinCalls.length, 2, "restart must obtain a new authorized admission");
    assert.equal(live("video").length, 1);
    assert.equal(live("audio").length, outcome === "recover" ? 1 : 0);
  } else {
    assert.equal(runtime.joinCalls.length, 1);
    assert.equal(runtime.mediaCreateCalls.length, capturesBefore, "unproved recovery cannot capture");
    assert.equal(live("audio").length, 0);
    assert.equal(live("video").length, 0);
  }
  if (outcome === "admission denied" || outcome === "native stop failure") {
    originalAudio.refuseStop = false;
    await harness.run(() => harness.getResult().leaveRoom());
    assert.equal(runtime.leaveRequests.at(-1)?.expectedMembershipGeneration,
      runtime.membershipGeneration, "End must retain the pre-recovery membership for exact cleanup");
  }
});
}

for (const pendingStage of ["prepare", "join", "join with wrong cleanup token", "join with refused cleanup"]) {
test(`legacy background lease recovery: End fences the pending ${pendingStage} receipt and retains exact cleanup`, async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true, actualRecoveryPolicy: true, nativeBackgroundPolicy: true });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true,
    restartDisconnectedSession: true, initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    analyticsContext: { surface: "chat-thread" } });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  await harness.run(() => runtime.emitAppState("background"));
  let releaseRead;
  runtime.queueSnapshot({ outcome: "missing", wait: new Promise(resolve => { releaseRead = resolve; }) });
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  const timerStart = runtime.timeoutCallbacks.length;
  await harness.run(() => runtime.emitAppState("active"));
  await harness.run(async () => { releaseRead(); await settle(96); });
  let releaseAdmission;
  const admissionBarrier = new Promise(resolve => { releaseAdmission = resolve; });
  (pendingStage === "prepare" ? runtime.admissionPrepareActions : runtime.joinActions).push({ wait: admissionBarrier });
  const capturesBefore = runtime.mediaCreateCalls.length;
  for (let index = timerStart; index < runtime.timeoutCallbacks.length; index += 1) {
    if (runtime.timeoutDelays[index] === 0 && runtime.timeoutCallbacks[index]) {
      const callback = runtime.timeoutCallbacks[index]; runtime.timeoutCallbacks[index] = null;
      await harness.run(callback);
    }
  }
  assert.equal(runtime.admissionPrepareCalls.length, 2);
  assert.equal(runtime.joinCalls.length, pendingStage === "prepare" ? 1 : 2);
  if (pendingStage === "join with wrong cleanup token") runtime.leaveActions.push({ membership:
    makeMembership(runtime, { membershipState: "left", leftAt: new Date().toISOString(),
      membershipGeneration: "99000000-0000-4000-8000-000000000001", cameraEnabled: false, micEnabled: false }) });
  if (pendingStage === "join with refused cleanup") runtime.leaveActions.push({ outcome: "reject" });
  let end;
  await harness.run(async () => { end = harness.getResult().leaveRoom(); end.catch(() => {}); await settle(32); });
  await harness.run(async () => { releaseAdmission(); await settle(160); });
  if (pendingStage.includes("with")) await assert.rejects(harness.run(() => end));
  else await harness.run(() => end);
  assert.equal(runtime.mediaCreateCalls.length, capturesBefore);
  if (!pendingStage.includes("with")) {
    assert.equal(runtime.leaveRequests.at(-1)?.expectedMembershipGeneration, runtime.membershipGeneration);
  } else {
    assert.ok(runtime.errors.some(entry => entry.scope === "communication-retired-admission-cleanup"));
  }
  assert.ok(runtime.localStreams.flatMap(stream => stream.getTracks()).every(track => track.readyState === "ended"));
});
}

for (const ordering of ["reply while background", "reply after restart", "explicit terminal receipt"]) {
test(`legacy background lease recovery: ${ordering} preserves the authority boundary`, async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true, actualRecoveryPolicy: true, nativeBackgroundPolicy: true });
  const ended = [];
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true,
    restartDisconnectedSession: true, initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    analyticsContext: { surface: "chat-thread" }, onRoomEnded: reason => ended.push(reason) });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  await harness.run(() => runtime.emitAppState("background"));
  let release;
  runtime.queueSnapshot({ ...(ordering === "explicit terminal receipt"
    ? { room: { ...makeRoom(runtime), status: "ended" } } : { outcome: "missing" }),
  wait: new Promise(resolve => { release = resolve; }) });
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  const timerStart = runtime.timeoutCallbacks.length;
  if (ordering === "reply while background") {
    await harness.run(async () => { release(); await settle(96); });
    assert.equal(runtime.joinCalls.length, 1, "background may not renew capture authority");
    assert.deepEqual(ended, []);
  }
  await harness.run(() => runtime.emitAppState("active"));
  if (ordering === "explicit terminal receipt") await harness.run(async () => { release(); await settle(96); });
  for (let index = timerStart; index < runtime.timeoutCallbacks.length; index += 1) {
    if (runtime.timeoutDelays[index] === 0 && runtime.timeoutCallbacks[index]) {
      const callback = runtime.timeoutCallbacks[index]; runtime.timeoutCallbacks[index] = null;
      await harness.run(callback);
    }
  }
  if (ordering === "reply after restart") await harness.run(async () => { release(); await settle(96); });
  const live = kind => runtime.localStreams.flatMap(stream => stream.getTracks())
    .filter(track => track.kind === kind && track.readyState === "live" && track.enabled);
  if (ordering === "explicit terminal receipt") {
    assert.deepEqual(ended, ["ended"]);
    assert.equal(runtime.joinCalls.length, 1);
    assert.equal(live("audio").length, 0);
    assert.equal(live("video").length, 0);
  } else {
    assert.deepEqual(ended, []);
    assert.equal(runtime.joinCalls.length, 2);
    assert.equal(live("audio").length, 1);
    assert.equal(live("video").length, 1);
  }
});
}

test("legacy server state hint: an older null cannot retire a call after a newer active snapshot", async (t) => {
  let release;
  const ended = [];
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true, onRoomEnded: (reason) => ended.push(reason) });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  runtime.queueSnapshot({ outcome: "missing", wait: new Promise((resolve) => { release = resolve; }) });
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  await harness.run(() => channel.emitBroadcast("state:update", {}));
  await harness.run(async () => { release(); await settle(96); });
  assert.deepEqual(ended, []);
  assert.equal(harness.refs.channelRef.current, channel);
  assert.equal(harness.getResult().room.status, "active");
});

test("legacy initial admission: unavailable snapshot prevents capture without claiming an established call ended", async (t) => {
  const ended = [];
  const runtime = createLegacyMountedRuntime();
  runtime.queueSnapshot({ outcome: "missing" });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true }, onRoomEnded: (reason) => ended.push(reason) });
  t.after(() => harness.unmount());
  assert.deepEqual(ended, []);
  assert.equal(runtime.mediaCreateCalls.length, 0);
  assert.equal(runtime.channels.length, 0);
  assert.equal(harness.getResult().channelState, "error");
  assert.match(harness.getResult().error, /unavailable/u);
});

test("legacy server state hint: retired callback and late read cannot change a replacement account session", async (t) => {
  let release;
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  const oldChannel = harness.refs.channelRef.current;
  runtime.queueSnapshot({ outcome: "missing", wait: new Promise((resolve) => { release = resolve; }) });
  await harness.run(() => oldChannel.emitBroadcast("state:update", {}));
  runtime.userId = "replacement-user";
  runtime.membershipGeneration = "12000000-0000-4000-8000-000000000002";
  await harness.rerender({ authenticatedAccessToken: "replacement-token", authenticatedUserId: runtime.userId });
  const replacementChannel = harness.refs.channelRef.current;
  const reads = runtime.snapshotReads;
  await harness.run(async () => { release(); await settle(96); });
  await harness.run(() => oldChannel.emitBroadcast("state:update", {}));
  assert.equal(runtime.snapshotReads, reads);
  assert.equal(harness.refs.channelRef.current, replacementChannel);
  assert.equal(harness.getResult().room.status, "active");
  assert.equal(harness.refs.identityRef.current.userId, runtime.userId);
});

test("legacy media projection: stale local Presence cannot override committed microphone and camera state", async (t) => {
  const runtime = createLegacyMountedRuntime({ staleLocalPresence: true });
  const harness = await mountLegacyHook(runtime, {
    authenticatedAccessToken: "exact-access-token",
    authenticatedUserId: runtime.userId,
    enabled: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
  });
  t.after(() => harness.unmount());

  const self = harness.getResult().participants.find((participant) => participant.isSelf);
  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(harness.getResult().micEnabled, true);
  assert.equal(self?.cameraOn, true, "committed local camera state owns the self projection");
  assert.equal(self?.micOn, true, "committed local microphone state owns the self projection");
});

test("legacy media projection: a server-relayed media update refreshes durable remote membership over stale Presence", async (t) => {
  const runtime = createLegacyMountedRuntime({ staleRemotePresence: true });
  const harness = await mountLegacyHook(runtime, {
    authenticatedAccessToken: "exact-access-token",
    authenticatedUserId: runtime.userId,
    enabled: true,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: false },
  });
  t.after(() => harness.unmount());

  assert.equal(
    harness.getResult().participants.find((participant) => participant.userId === runtime.remoteUserId)?.micOn,
    false,
  );
  runtime.remoteDurableCamera = true;
  runtime.remoteDurableMic = true;
  await harness.run(async () => {
    await harness.refs.channelRef.current.emitBroadcast("media:update", {
      cameraOn: true,
      fromUserId: runtime.remoteUserId,
      micOn: true,
      roomId: runtime.roomId,
    });
  });

  const remote = harness.getResult().participants.find((participant) => participant.userId === runtime.remoteUserId);
  assert.equal(remote?.cameraOn, true, "remote camera projection comes from refreshed durable membership");
  assert.equal(remote?.micOn, true, "remote microphone projection comes from refreshed durable membership");
  const channel = harness.refs.channelRef.current;
  await harness.run(() => channel.emitPresenceState({ [runtime.remoteUserId]: {
    metas: [{ phx_ref: "old-online", userId: runtime.remoteUserId, cameraOn: true, micOn: true }],
  } }));
  runtime.remoteDurableCamera = false;
  runtime.remoteDurableMic = false;
  await harness.run(() => channel.emitBroadcast("media:update", {
    cameraOn: false, fromUserId: runtime.remoteUserId, micOn: false, roomId: runtime.roomId,
  }));
  const mutedRemote = harness.getResult().participants.find((participant) => participant.userId === runtime.remoteUserId);
  assert.equal(mutedRemote?.cameraOn, false, "stale Presence=true cannot override durable camera=false");
  assert.equal(mutedRemote?.micOn, false, "stale Presence=true cannot override durable mic=false");
});

for (const cancelIntent of [false, true]) {
  test(`legacy native background Answer retains foreground mic intent; explicit mute=${cancelIntent}`, async (t) => {
    const runtime = createLegacyMountedRuntime({ appState: "background", nativeBackgroundPolicy: true });
    const harness = await mountLegacyHook(runtime, {
      enabled: true, naturalLifecycle: true, allowBackgroundAudio: true,
      initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    });
    t.after(() => harness.unmount());
    assert.equal(harness.getResult().micEnabled, false, "background permission/capture unavailability is never live mic proof");
    assert.equal(runtime.durableMic, false);
    if (cancelIntent) await harness.run(() => harness.getResult().setMicrophoneEnabled(false));
    await harness.run(() => runtime.emitAppState("inactive"));
    await harness.run(() => runtime.emitAppState("active"));
    assert.equal(harness.getResult().micEnabled, !cancelIntent,
      "foreground restores only the retained Answer intent, without requiring another Unmute");
    assert.equal(runtime.durableMic, !cancelIntent);
    assert.equal(runtime.localStreams.flatMap(stream => stream.getAudioTracks())
      .filter(track => track.enabled && track.readyState !== "ended").length, cancelIntent ? 0 : 1);
  });
}

test("legacy native background Answer cannot restore a microphone denied in Settings", async (t) => {
  const runtime = createLegacyMountedRuntime({ appState: "background", nativeBackgroundPolicy: true });
  const harness = await mountLegacyHook(runtime, {
    enabled: true, naturalLifecycle: true, allowBackgroundAudio: true,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  });
  t.after(() => harness.unmount());
  runtime.microphonePermission = { granted: false, canAskAgain: false, status: "denied" };
  await harness.run(() => runtime.emitAppState("active"));
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(runtime.durableMic, false);
  assert.equal(runtime.localStreams.length, 0);
});

test("legacy native background Answer intent is retired by End before foreground", async (t) => {
  const runtime = createLegacyMountedRuntime({ appState: "background", nativeBackgroundPolicy: true });
  const harness = await mountLegacyHook(runtime, {
    enabled: true, naturalLifecycle: true, allowBackgroundAudio: true,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  });
  t.after(() => harness.unmount());
  await harness.run(() => harness.getResult().leaveRoom());
  const acquisitions = runtime.mediaCreateCalls.length;
  await harness.run(() => runtime.emitAppState("active"));
  assert.equal(runtime.mediaCreateCalls.length, acquisitions);
  assert.equal(runtime.durableMic, false);
});

test("legacy grouped media lifecycle: failed initial media promotion disables tracks and restores muted membership", async (t) => {
  const runtime = createLegacyMountedRuntime();
  runtime.queuePresenceTrack({ outcome: "error" });
  const harness = await mountLegacyHook(runtime, {
    authenticatedAccessToken: "exact-access-token",
    authenticatedUserId: runtime.userId,
    enabled: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
  });
  t.after(() => harness.unmount());

  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(runtime.durableCamera, false);
  assert.equal(runtime.durableMic, false);
  assert.ok(runtime.membershipTouches.some((touch) => touch.cameraEnabled === true && touch.micEnabled === true));
  assert.ok(runtime.membershipTouches.some((touch) => touch.cameraEnabled === false && touch.micEnabled === false));
  assert.ok(runtime.localStreams.flatMap((stream) => stream.getTracks()).every((track) => track.enabled === false));
  assert.equal(runtime.errors.at(-1)?.scope, "communication-presence-initial-promotion");
  assert.equal(runtime.presenceTracks.length, 1, "failed registration compensation never bursts another track call");
  assert.equal(runtime.broadcasts.at(-1)?.payload?.cameraOn, false);
  assert.equal(runtime.broadcasts.at(-1)?.payload?.micOn, false);
});

test("legacy Presence registration: repeated camera and microphone controls stay within the five-call subscription budget", async (t) => {
  const runtime = createLegacyMountedRuntime({ presenceTrackLimit: 5 });
  const harness = await mountLegacyHook(runtime, {
    enabled: true, naturalLifecycle: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
  });
  t.after(() => harness.unmount());
  for (let cycle = 0; cycle < 4; cycle += 1) {
    assert.equal(await harness.run(() => harness.getResult().toggleCamera()), true, `camera off cycle ${cycle}`);
    assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(false)), true, `mic off cycle ${cycle}`);
    assert.equal(runtime.durableCamera, false);
    assert.equal(runtime.durableMic, false);
    assert.equal(await harness.run(() => harness.getResult().toggleCamera()), true, `camera on cycle ${cycle}`);
    assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(true)), true, `mic on cycle ${cycle}`);
    assert.equal(runtime.durableCamera, true);
    assert.equal(runtime.durableMic, true);
    assert.equal(harness.getResult().channelState, "live");
    assert.equal(runtime.broadcasts.at(-1)?.payload?.cameraOn, true);
    assert.equal(runtime.broadcasts.at(-1)?.payload?.micOn, true);
  }
  assert.equal(runtime.presenceTracks.length, 1, "all sixteen media controls reuse the acknowledged online registration");
  assert.equal(Object.hasOwn(runtime.presenceTracks[0], "cameraOn"), false);
  assert.equal(Object.hasOwn(runtime.presenceTracks[0], "micOn"), false);
  assert.ok(runtime.localStreams.flatMap((stream) => stream.getTracks()).filter((track) => track.readyState !== "ended").every((track) => track.enabled));
  assert.equal(runtime.errors.length, 0);
});

for (const status of ["CLOSED", "CHANNEL_ERROR", "TIMED_OUT"]) {
  test(`legacy Presence registration: ${status} revokes success until a genuine rejoin is acknowledged`, async (t) => {
    const runtime = createLegacyMountedRuntime();
    const harness = await mountLegacyHook(runtime, {
      enabled: true, naturalLifecycle: true,
      initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    });
    t.after(() => harness.unmount());
    const channel = harness.refs.channelRef.current;
    const initialReceipt = harness.refs.presenceRegistrationRef.current;
    await harness.run(() => channel.emitSubscriptionStatus("SUBSCRIBED"));
    assert.equal(harness.refs.presenceRegistrationRef.current, initialReceipt);
    assert.equal(runtime.presenceTracks.length, 1, "duplicate callback does not re-register");
    await harness.run(() => channel.emitSubscriptionStatus(status));
    assert.equal(initialReceipt.subscribed, false);
    assert.equal(await harness.run(() => harness.getResult().toggleCamera()), false, "HTTP success cannot prove a closed subscription");
    assert.equal(harness.getResult().cameraEnabled, false);
    assert.equal(runtime.durableCamera, false, "failed camera compensation follows local shutdown with durable privacy state");
    assert.equal(runtime.broadcasts.at(-1)?.payload?.cameraOn, false);
    assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(false)), false);
    assert.equal(runtime.durableMic, false, "privacy-off remains writable after registration loss");
    assert.equal(runtime.presenceTracks.length, 1, "closed-channel controls never retry Presence");
    await harness.run(() => channel.emitSubscriptionStatus("SUBSCRIBED"));
    assert.notEqual(harness.refs.presenceRegistrationRef.current, initialReceipt);
    assert.equal(harness.refs.presenceRegistrationRef.current.confirmed, true);
    assert.equal(runtime.presenceTracks.length, 2, "genuine rejoin gets exactly one new receipt");
    assert.equal(await harness.run(() => harness.getResult().toggleCamera()), true);
    assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(true)), true);
  });
}

test("legacy Presence registration: a late old acknowledgement cannot confirm a new subscription", async (t) => {
  let releaseOld;
  let releaseNew;
  const runtime = createLegacyMountedRuntime();
  runtime.queuePresenceTrack({ wait: new Promise((resolve) => { releaseOld = resolve; }) });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  const oldReceipt = harness.refs.presenceRegistrationRef.current;
  assert.equal(oldReceipt.confirmed, false);
  await harness.run(() => channel.emitSubscriptionStatus("SUBSCRIBED"));
  assert.equal(runtime.presenceTracks.length, 1, "duplicate callback shares the pending receipt");
  await harness.run(() => channel.emitSubscriptionStatus("CLOSED"));
  runtime.queuePresenceTrack({ wait: new Promise((resolve) => { releaseNew = resolve; }) });
  await harness.run(() => channel.emitSubscriptionStatus("SUBSCRIBED"));
  const newReceipt = harness.refs.presenceRegistrationRef.current;
  assert.notEqual(newReceipt, oldReceipt);
  await harness.run(async () => { releaseOld(); await settle(96); });
  assert.equal(oldReceipt.confirmed, false);
  assert.equal(newReceipt.confirmed, false, "the old ACK cannot grant authority while the new ACK is pending");
  assert.equal(runtime.presenceTracks.length, 2);
  await harness.run(async () => { releaseNew(); await settle(96); });
  assert.equal(newReceipt.confirmed, true);
  assert.equal(runtime.presenceTracks.length, 2);
});

test("legacy Presence registration: failed initial registration recovers only after a new subscription", async (t) => {
  const runtime = createLegacyMountedRuntime();
  runtime.queuePresenceTrack({ outcome: "error" });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(true)), false);
  assert.equal(runtime.presenceTracks.length, 1);
  assert.equal(runtime.durableMic, false);
  assert.match(harness.getResult().mediaControlError, /Leave and rejoin/u);
  await harness.run(() => channel.emitSubscriptionStatus("CLOSED"));
  await harness.run(() => channel.emitSubscriptionStatus("SUBSCRIBED"));
  assert.equal(runtime.presenceTracks.length, 2);
  assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(true)), true);
  assert.equal(harness.getResult().mediaControlError, null);
});

test("legacy Presence registration: closure during broadcast cannot commit media success", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  runtime.queueSend({ event: "media:update", mutate: () => {
    void harness.refs.channelRef.current.emitSubscriptionStatus("CLOSED");
  } });
  assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(true)), false);
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(runtime.durableMic, false);
  assert.equal(runtime.broadcasts.at(-1)?.payload?.micOn, false);
  assert.equal(runtime.presenceTracks.length, 1);
});

test("legacy grouped media lifecycle: camera broadcast failure compensates native and durable state", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: false }, { sender: true });
  runtime.queueSend({ event: "media:update", outcome: "error" });

  const result = await harness.run(() => harness.getResult().toggleCamera());

  assert.equal(result, false);
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.durableCamera, false);
  const videoSenders = runtime.peers[0].getSenders().filter((sender) => sender.track?.kind === "video");
  assert.equal(videoSenders.length, 1);
  assert.equal(videoSenders[0].track.enabled, false);
  assert.equal(runtime.errors.at(-1)?.scope, "communication-legacy-camera-commit");
});

test("legacy grouped media lifecycle: strict microphone renegotiation waits for the shared peer offer queue", async (t) => {
  let releaseExistingOffer;
  const existingOfferBarrier = new Promise((resolve) => { releaseExistingOffer = resolve; });
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: false, readyState: "ended" }, { sender: true });
  let queuedOfferStarted = false;
  const queuedOffer = harness.refs.runSerializedPeerOffer(runtime.remoteUserId, async () => {
    queuedOfferStarted = true;
    await existingOfferBarrier;
    return true;
  }, false);
  await settle(12);
  assert.equal(queuedOfferStarted, true);

  let micResultPromise;
  await act(async () => {
    micResultPromise = harness.getResult().setMicrophoneEnabled(true);
    await settle(24);
  });
  assert.equal(runtime.peers[0].offerCalls, 0, "strict renegotiation cannot overlap an existing peer offer operation");
  releaseExistingOffer();
  await queuedOffer;
  const result = await harness.run(() => micResultPromise);

  assert.equal(result, true);
  assert.equal(runtime.peers[0].offerCalls, 1);
  assert.equal(runtime.peers[0].signalingState, "stable");
});

test("legacy recovered controls: delayed initial answer cannot consume and lose one microphone intent", async (t) => {
  const runtime = createLegacyMountedRuntime({ peerConnectionState: "connecting" });
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  runtime.queueSend({ answer: false, event: "webrtc:offer" });

  let initialOffer;
  await act(async () => {
    initialOffer = harness.refs.createAndSendOffer(runtime.remoteUserId, false);
    await settle(24);
  });
  assert.equal(runtime.peers[0].signalingState, "have-local-offer");

  let control;
  await act(async () => {
    control = harness.getResult().setMicrophoneEnabled(true);
    await settle(24);
  });
  assert.equal(runtime.peers[0].offerCalls, 1, "media control waits behind the unanswered initial offer");
  assert.equal(runtime.durableMic, false);

  await runtime.peers[0].setRemoteDescription({ sdp: "initial-answer", type: "answer" });
  assert.equal(await harness.run(() => initialOffer), true);
  assert.equal(await harness.run(() => control), true);
  assert.equal(runtime.peers[0].offerCalls, 2, "mic sender receives a new post-answer offer");
  assert.equal(runtime.durableMic, true);
  assert.equal(harness.getResult().micEnabled, true);
});

test("legacy recovered controls: delayed initial answer cannot falsely commit a camera sender absent from SDP", async (t) => {
  const runtime = createLegacyMountedRuntime({ peerConnectionState: "connecting" });
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  runtime.queueSend({ answer: false, event: "webrtc:offer" });

  let initialOffer;
  await act(async () => {
    initialOffer = harness.refs.createAndSendOffer(runtime.remoteUserId, false);
    await settle(24);
  });
  assert.equal(runtime.peers[0].signalingState, "have-local-offer");
  runtime.queueSend({ answer: false, event: "webrtc:offer" });

  let control;
  await act(async () => {
    control = harness.getResult().toggleCamera();
    await settle(24);
  });
  assert.equal(runtime.peers[0].offerCalls, 1, "camera renegotiation waits behind the unanswered initial offer");
  assert.equal(runtime.durableCamera, false);

  await runtime.peers[0].setRemoteDescription({ sdp: "initial-answer", type: "answer" });
  assert.equal(await harness.run(() => initialOffer), true);
  assert.equal(await harness.run(() => control), true);
  assert.equal(runtime.peers[0].offerCalls, 2, "camera sender receives a new post-answer offer");
  assert.equal(runtime.durableCamera, true);
  assert.equal(harness.getResult().cameraEnabled, true);
});

test("legacy recovered controls: an unanswered generic offer releases the queue only through the bounded failure path", async (t) => {
  const runtime = createLegacyMountedRuntime({
    fireOperationTimeouts: true,
    peerConnectionState: "connecting",
  });
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  runtime.queueSend({ answer: false, event: "webrtc:offer" });

  const result = await harness.run(() => harness.refs.createAndSendOffer(runtime.remoteUserId, true));

  assert.equal(result, false);
  assert.equal(runtime.peers[0].signalingState, "have-local-offer");
  assert.equal(runtime.durableMic, false);
  assert.equal(runtime.durableCamera, false);
});

test("legacy recovered controls: a replaced peer cannot inherit a pending offer completion", async (t) => {
  const runtime = createLegacyMountedRuntime({ peerConnectionState: "connecting" });
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  runtime.queueSend({ answer: false, event: "webrtc:offer" });
  const oldPeer = runtime.peers[0];

  let initialOffer;
  await act(async () => {
    initialOffer = harness.refs.createAndSendOffer(runtime.remoteUserId, true);
    await settle(24);
  });
  const replacementPeer = runtime.createPeer();
  harness.refs.peerConnectionsRef.current[runtime.remoteUserId] = replacementPeer;
  await oldPeer.setRemoteDescription({ sdp: "stale-answer", type: "answer" });

  assert.equal(await harness.run(() => initialOffer), false);
  assert.equal(harness.refs.peerConnectionsRef.current[runtime.remoteUserId], replacementPeer);
  assert.equal(replacementPeer.signalingState, "stable");
  assert.equal(runtime.durableMic, false);
  assert.equal(runtime.durableCamera, false);
});

test("legacy call-domain closure: muted privacy quarantines all local and sender-bound audio tracks", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  const first = runtime.createTrack("audio", { id: "object-identity-collision" });
  const second = runtime.createTrack("audio", { id: "object-identity-collision" });
  const senderOnly = runtime.createTrack("audio");
  const primary = runtime.createStream([first, second]);
  const auxiliary = runtime.createStream([runtime.createTrack("audio")]);
  harness.refs.localStreamRef.current = primary;
  harness.refs.auxiliaryStreamsRef.current = [auxiliary];
  runtime.peers[0].addTrack(first, primary);
  runtime.peers[0].addTrack(second, primary);
  runtime.peers[0].addTrack(senderOnly, runtime.createStream());

  const result = await harness.run(() => harness.getResult().setMicrophoneEnabled(true));

  assert.equal(result, false, "duplicate topology cannot report enabled success");
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(runtime.durableMic, false);
  for (const track of [first, second, senderOnly, ...auxiliary.getAudioTracks()]) {
    assert.equal(track.enabled && track.readyState !== "ended", false, `${track.id}: no usable enabled path remains`);
  }
  const remainingSenders = runtime.peers[0].getSenders().filter((sender) => sender.track?.kind === "audio");
  assert.ok(remainingSenders.length <= 1, "duplicate audio senders are removed");
  assert.ok(remainingSenders.every((sender) => sender.track.enabled === false || sender.track.readyState === "ended"));
  assert.ok(runtime.senderRemoves >= 2, "sender topology was quarantined, not only stream topology");
});

test("legacy call-domain closure: unprovable quarantine never claims muted success", async (t) => {
  const runtime = createLegacyMountedRuntime();
  runtime.durableMic = true;
  const harness = await mountLegacyHook(runtime, {
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  });
  t.after(() => harness.unmount());
  const { track } = seedLocalTrack(runtime, harness, {
    enabled: true,
    refuseDisable: true,
    refuseStop: true,
  }, { sender: true });

  const result = await harness.run(() => harness.getResult().setMicrophoneEnabled(false));

  assert.equal(result, false);
  assert.equal(track.enabled, true, "failed readback remains visible to the proof");
  assert.equal(harness.getResult().micEnabled, true, "UI does not falsely claim a proved mute");
  assert.match(harness.getResult().error, /privacy could not be verified/u);
  assert.equal(runtime.membershipTouches.some((touch) => touch.micEnabled === false), false);
});

test("legacy call-domain closure: background lifecycle commits proved camera state and catches controller rejection", () => {
  const stopperBlock = legacyHookSource.match(/registerActiveMediaSessionStopper\(async \(reason\) => \{[\s\S]*?\n    \}\);/u)?.[0] ?? "";
  assert.match(stopperBlock, /try \{[\s\S]*?await applyAutomaticMicrophoneEnabled\(\s*LEGACY_BACKGROUND_MEDIA_STATE\.micEnabled,\s*cameraStopped \? LEGACY_BACKGROUND_MEDIA_STATE\.cameraEnabled : hasUsableLocalTrack\("video"\),\s*\)[\s\S]*?\} catch \(error\) \{/u);
  assert.match(stopperBlock, /catch \(error\) \{\s*if \(!isActiveLegacyGeneration\(generation\)\) return;\s*if \(intentRevision === foregroundMicIntentRevisionRef\.current\) legacyMicLocalPrivacyStopRef\.current\?\.\(\);/u);
  assert.match(stopperBlock, /reportRuntimeError\("communication-media-session-background"/u);
  assert.match(legacyHookSource, /const LEGACY_BACKGROUND_MEDIA_STATE = \{\s*cameraEnabled: false,\s*micEnabled: false,/u);
  assert.match(legacyHookSource, /applyAutomaticMicrophoneEnabled\(true, !cameraStopped && hasUsableLocalTrack\("video"\)\)/u);
});

test("legacy call-domain closure: background pause converges durable camera false without erasing foreground intent", async (t) => {
  const runtime = createLegacyMountedRuntime();
  runtime.durableCamera = true;
  runtime.durableMic = true;
  const harness = await mountLegacyHook(runtime, {
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
  });
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: true }, { sender: true, video: true });

  const result = await harness.run(() => harness.getResult().setMicrophoneEnabled(false, false));

  assert.equal(result, true);
  assert.equal(runtime.durableCamera, false, "background lifecycle writes durable camera=false");
  assert.equal(runtime.durableMic, false);
  assert.equal(harness.getResult().cameraEnabled, true, "foreground camera intent remains available for restoration");
  assert.equal(harness.getResult().micEnabled, false);
});

test("legacy call-domain closure: sender-only mute requires privacy and durable convergence", async (t) => {
  const runtime = createLegacyMountedRuntime();
  runtime.durableMic = true;
  const harness = await mountLegacyHook(runtime, {
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  });
  t.after(() => harness.unmount());
  const senderOnly = runtime.createTrack("audio", { enabled: true });
  runtime.peers[0].addTrack(senderOnly, runtime.createStream());

  const result = await harness.run(() => harness.getResult().setMicrophoneEnabled(false));

  assert.equal(result, true);
  assert.equal(senderOnly.enabled, false);
  assert.equal(runtime.durableMic, false);
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(runtime.broadcasts.at(-1)?.payload?.micOn, false);
});

test("legacy call-domain closure: mute durable failure compensates without split state", async (t) => {
  const runtime = createLegacyMountedRuntime();
  runtime.durableMic = true;
  const harness = await mountLegacyHook(runtime, {
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  });
  t.after(() => harness.unmount());
  const { track } = seedLocalTrack(runtime, harness, { enabled: true }, { sender: true });
  runtime.queueMembership({ outcome: "reject" });

  const result = await harness.run(() => harness.getResult().setMicrophoneEnabled(false));

  assert.equal(result, false);
  assert.equal(track.enabled, true, "local state is restored when the false durable write fails");
  assert.equal(runtime.durableMic, true);
  assert.equal(harness.getResult().micEnabled, true);
  assert.equal(runtime.broadcasts.at(-1)?.payload?.micOn, true, "broadcast state is compensated");
});

test("legacy call-domain closure: same-state recovery requires one sender and stable answer per peer", async (t) => {
  const runtime = createLegacyMountedRuntime();
  runtime.durableMic = true;
  const harness = await mountLegacyHook(runtime, {
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  });
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: false, readyState: "ended" }, { sender: true });

  const result = await harness.run(() => harness.getResult().setMicrophoneEnabled(true));

  assert.equal(result, true);
  assert.equal(runtime.peers[0].offerCalls, 1);
  assert.equal(runtime.negotiationTimeline.length, 1);
  assert.equal(runtime.peers[0].signalingState, "stable");
  const usableSenders = runtime.peers[0].getSenders().filter((sender) => (
    sender.track?.kind === "audio" && sender.track.enabled && sender.track.readyState !== "ended"
  ));
  assert.equal(usableSenders.length, 1);
  assert.equal(harness.getResult().micEnabled, true);
  assert.equal(runtime.durableMic, true);
});

test("legacy call-domain closure: sender-only recovery replaces the orphan with one fresh track", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  const orphanedTrack = runtime.createTrack("audio", { enabled: true });
  runtime.peers[0].addTrack(orphanedTrack, runtime.createStream());

  const result = await harness.run(() => harness.getResult().setMicrophoneEnabled(true));

  assert.equal(result, true);
  assert.equal(orphanedTrack.readyState, "ended");
  const audioSenders = runtime.peers[0].getSenders().filter((sender) => sender.track?.kind === "audio");
  assert.equal(audioSenders.length, 1);
  assert.notEqual(audioSenders[0].track, orphanedTrack);
  assert.equal(audioSenders[0].track.enabled, true);
  assert.equal(audioSenders[0].track.readyState, "live");
  assert.equal(runtime.peers[0].signalingState, "stable");
});

test("legacy call-domain closure: stale mic continuation cannot quarantine replacement topology", async (t) => {
  let releaseMembership;
  const membershipBarrier = new Promise((resolve) => { releaseMembership = resolve; });
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: false }, { sender: true });
  runtime.queueMembership({ wait: membershipBarrier });

  let controlPromise;
  await act(async () => {
    controlPromise = harness.getResult().setMicrophoneEnabled(true);
    await settle(12);
  });
  const replacementChannel = runtime.createChannel("replacement-control-session");
  const replacementPeer = runtime.createPeer();
  const replacementTrack = runtime.createTrack("audio", { enabled: true });
  const replacementStream = runtime.createStream([replacementTrack]);
  replacementPeer.addTrack(replacementTrack, replacementStream);
  harness.refs.legacySessionGenerationRef.current += 1;
  harness.refs.channelRef.current = replacementChannel;
  harness.refs.localStreamRef.current = replacementStream;
  harness.refs.peerConnectionsRef.current[runtime.remoteUserId] = replacementPeer;
  releaseMembership();

  const result = await harness.run(() => controlPromise);
  assert.equal(result, false);
  assert.equal(harness.refs.channelRef.current, replacementChannel);
  assert.equal(harness.refs.localStreamRef.current, replacementStream);
  assert.equal(harness.refs.peerConnectionsRef.current[runtime.remoteUserId], replacementPeer);
  assert.equal(replacementTrack.enabled, true);
  assert.equal(replacementTrack.readyState, "live");
  assert.equal(replacementPeer.connectionState, "connected");
});

test("legacy call-domain closure: stale cleanup preserves replacement session resources", async (t) => {
  let releaseLeave;
  const leaveBarrier = new Promise((resolve) => { releaseLeave = resolve; });
  const runtime = createLegacyMountedRuntime({ leaveBarrier });
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  const oldChannel = harness.refs.channelRef.current;
  const oldPeer = runtime.peers[0];
  const oldStream = runtime.createStream([runtime.createTrack("audio")]);
  harness.refs.localStreamRef.current = oldStream;

  let leavePromise;
  await act(async () => {
    leavePromise = harness.getResult().leaveRoom();
    await settle(12);
  });
  const replacementChannel = runtime.createChannel("replacement-session");
  const replacementPeer = runtime.createPeer();
  const replacementTrack = runtime.createTrack("audio");
  const replacementStream = runtime.createStream([replacementTrack]);
  harness.refs.channelRef.current = replacementChannel;
  harness.refs.localStreamRef.current = replacementStream;
  harness.refs.peerConnectionsRef.current[runtime.remoteUserId] = replacementPeer;
  releaseLeave();
  await harness.run(() => leavePromise);

  assert.equal(harness.refs.channelRef.current, replacementChannel);
  assert.equal(harness.refs.localStreamRef.current, replacementStream);
  assert.equal(harness.refs.peerConnectionsRef.current[runtime.remoteUserId], replacementPeer);
  assert.equal(replacementPeer.connectionState, "connected");
  assert.equal(replacementTrack.readyState, "live");
  assert.equal(runtime.removedChannels.includes(oldChannel), true);
  assert.equal(runtime.removedChannels.includes(replacementChannel), false);
  assert.equal(oldPeer.connectionState, "closed");
});

test("legacy chat readiness: a subscribed signaling channel does not prove a connected peer", async (t) => {
  const runtime = createLegacyMountedRuntime({ peerConnectionState: "connecting" });
  const harness = await mountLegacyHook(runtime, { enabled: true, analyticsContext: { surface: "chat-thread" } });
  t.after(() => harness.unmount());
  assert.equal(harness.getResult().channelState, "connecting");
  assert.equal(harness.getResult().participantCount, 1);
});

test("legacy chat readiness: peer loss stays reconnecting across signaling resubscription and only current peer recovery restores Connected", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, analyticsContext: { surface: "chat-thread" } });
  t.after(() => harness.unmount());
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  await harness.run(async () => peer.emit("connectionstatechange"));
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(harness.getResult().participantCount, 2);
  await harness.run(async () => {
    peer.connectionState = "disconnected";
    peer.emit("connectionstatechange");
  });
  assert.equal(harness.getResult().channelState, "reconnecting");
  assert.equal(harness.getResult().participantCount, 1);
  await harness.run(() => harness.refs.channelRef.current.emitSubscriptionStatus("SUBSCRIBED"));
  assert.equal(harness.getResult().channelState, "reconnecting");
  await harness.run(async () => {
    peer.connectionState = "connected";
    peer.emit("connectionstatechange");
  });
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(harness.getResult().participantCount, 2);
});

test("legacy control ownership: queued mute belongs to its original call and cannot mute a replacement", async (t) => {
  let releaseMembership;
  const membershipBarrier = new Promise((resolve) => { releaseMembership = resolve; });
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: false }, { sender: true });
  runtime.queueMembership({ wait: membershipBarrier });
  let first;
  let queued;
  await act(async () => {
    first = harness.getResult().setMicrophoneEnabled(true);
    await settle(12);
    queued = harness.getResult().setMicrophoneEnabled(false);
  });
  const replacementPeer = runtime.createPeer();
  const replacementTrack = runtime.createTrack("audio", { enabled: true });
  const replacementStream = runtime.createStream([replacementTrack]);
  replacementPeer.addTrack(replacementTrack, replacementStream);
  harness.refs.legacySessionGenerationRef.current += 1;
  harness.refs.channelRef.current = runtime.createChannel("replacement-control-queue");
  harness.refs.localStreamRef.current = replacementStream;
  harness.refs.peerConnectionsRef.current[runtime.remoteUserId] = replacementPeer;
  releaseMembership();
  assert.equal(await harness.run(() => first), false);
  assert.equal(await harness.run(() => queued), false);
  assert.equal(replacementTrack.enabled, true);
  assert.equal(replacementTrack.readyState, "live");
});

test("legacy recoverable control: compensated synchronization failure remains retryable without a fatal room error", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { initialMediaPreferences: { cameraEnabled: false, micEnabled: true }, analyticsContext: { surface: "chat-thread" } });
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: true }, { sender: true });
  runtime.durableMic = true;
  runtime.queueMembership({ outcome: "null" });
  assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(false)), false);
  assert.equal(harness.getResult().error, null);
  assert.match(harness.getResult().mediaControlError, /could not be synchronized/u);
  assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(false)), true);
  assert.equal(harness.getResult().mediaControlError, null);
  assert.equal(harness.getResult().micEnabled, false);
});

test("legacy shared rooms: existing non-chat consumers still receive media synchronization feedback", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: true }, { sender: true });
  runtime.durableMic = true;
  runtime.queueMembership({ outcome: "null" });
  assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(false)), false);
  assert.match(harness.getResult().error, /could not be synchronized/u);
  assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(false)), true);
  assert.equal(harness.getResult().error, null);
});

test("legacy chat readiness: a receiver track before transport connection cannot advertise Connected", async (t) => {
  const runtime = createLegacyMountedRuntime({ peerConnectionState: "connecting" });
  const harness = await mountLegacyHook(runtime, { enabled: true, analyticsContext: { surface: "chat-thread" } });
  t.after(() => harness.unmount());
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  const track = runtime.createTrack("video");
  await harness.run(async () => peer.emit("track", { track, streams: [runtime.createStream([track])] }));
  assert.equal(harness.getResult().channelState, "connecting");
  assert.equal(harness.getResult().participantCount, 1);
});

test("legacy media recovery: an ended camera track is replaced instead of committing a false camera-on state", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  const ended = runtime.createTrack("video", { enabled: false, readyState: "ended" });
  const stream = runtime.createStream([ended]);
  harness.refs.localStreamRef.current = stream;
  runtime.peers[0].addTrack(ended, stream);
  assert.equal(await harness.run(() => harness.getResult().toggleCamera()), true);
  const sender = runtime.peers[0].getSenders().find((entry) => entry.track?.kind === "video");
  assert.notEqual(sender.track, ended);
  assert.equal(sender.track.readyState, "live");
  assert.equal(sender.track.enabled, true);
  assert.equal(runtime.durableCamera, true);
});

test("legacy control serialization: queued mic state preserves the camera state committed ahead of it", async (t) => {
  let releaseMembership;
  const membershipBarrier = new Promise((resolve) => { releaseMembership = resolve; });
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: false }, { sender: true });
  runtime.queueMembership({ wait: membershipBarrier });
  let camera;
  let microphone;
  await act(async () => {
    camera = harness.getResult().toggleCamera();
    await settle(48);
    microphone = harness.getResult().setMicrophoneEnabled(true);
  });
  releaseMembership();
  assert.equal(await harness.run(() => camera), true);
  assert.equal(await harness.run(() => microphone), true);
  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(runtime.durableCamera, true);
});

test("legacy privacy: End stops capture before waiting for the server and rejects further controls", async (t) => {
  let releaseLeave;
  const leaveBarrier = new Promise((resolve) => { releaseLeave = resolve; });
  const runtime = createLegacyMountedRuntime({ leaveBarrier });
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  const { track } = seedLocalTrack(runtime, harness, { enabled: true }, { sender: true });
  let leave;
  await act(async () => {
    leave = harness.getResult().leaveRoom();
    await settle(24);
  });
  const endedBeforeServerResponse = track.readyState;
  const restarted = await harness.run(() => harness.getResult().setMicrophoneEnabled(true));
  releaseLeave();
  await harness.run(() => leave);
  assert.equal(endedBeforeServerResponse, "ended");
  assert.equal(restarted, false);
});

test("legacy privacy: a camera acquisition completing after backgrounding is discarded", async (t) => {
  let releaseMedia;
  const mediaBarrier = new Promise((resolve) => { releaseMedia = resolve; });
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  runtime.queueMedia({ wait: mediaBarrier });
  let camera;
  await act(async () => {
    camera = harness.getResult().toggleCamera();
    await settle(24);
    runtime.appState = "background";
    harness.refs.appStateLifecycleHandlerRef.current("background");
  });
  releaseMedia();
  assert.equal(await harness.run(() => camera), false);
  assert.equal(runtime.localStreams.flatMap((stream) => stream.getVideoTracks()).every((track) => track.readyState === "ended"), true);
  assert.equal(runtime.durableCamera, false);
});

test("legacy chat readiness: ICE loss demotes a previously connected peer before aggregate connection state changes", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, analyticsContext: { surface: "chat-thread" } });
  t.after(() => harness.unmount());
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  await harness.run(async () => peer.emit("connectionstatechange"));
  assert.equal(harness.getResult().channelState, "live");
  await harness.run(async () => {
    peer.iceConnectionState = "disconnected";
    peer.emit("iceconnectionstatechange");
  });
  assert.equal(harness.getResult().channelState, "reconnecting");
  assert.equal(harness.getResult().participantCount, 1);
  await harness.run(async () => {
    peer.iceConnectionState = "connected";
    peer.emit("iceconnectionstatechange");
  });
  assert.equal(harness.getResult().channelState, "live");
});

async function advanceLegacyIntervalClock(harness, runtime, elapsedMs) {
  const target = runtime.clockMs + elapsedMs;
  let fired = 0;
  while (true) {
    const next = runtime.intervals.filter((entry) => entry && entry.nextAt <= target)
      .sort((left, right) => left.nextAt - right.nextAt)[0];
    if (!next) break;
    assert.ok(fired++ < 1_000, "controlled interval clock must make progress");
    runtime.clockMs = next.nextAt;
    next.nextAt += next.delay;
    await harness.run(() => next.callback());
  }
  runtime.clockMs = target;
}

test("legacy heartbeat: frequent authoritative snapshots cannot starve participant liveness", async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true });
  const ended = [];
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    onRoomEnded: (reason) => ended.push(reason) });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  const timer = runtime.intervals.find((entry) => entry?.delay === 15_000);
  assert.ok(timer, "natural admission starts the actual production heartbeat");
  const admission = runtime.membershipGeneration;
  for (let refresh = 0; refresh < 12; refresh += 1) {
    await advanceLegacyIntervalClock(harness, runtime, 8_000);
    await harness.run(() => channel.emitBroadcast("state:update", {}));
  }
  assert.equal(runtime.clockMs, 96_000);
  assert.equal(runtime.heartbeatCalls.length, 6, "liveness continues at 15 seconds despite 8-second invalidations");
  assert.ok(runtime.heartbeatCalls.every((call) => call.expectedMembershipGeneration === admission
    && call.userId === runtime.userId && call.roomId === runtime.roomId));
  assert.equal(runtime.joinCalls.length, 1, "snapshot projection does not reacquire admission");
  assert.equal(runtime.durableMic, true, "heartbeats preserve current media intent");
  assert.deepEqual(ended, []);
});

test("legacy heartbeat: exact session replacement retires its timer and End prevents future mutations", async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  const oldTimer = runtime.intervals.find((entry) => entry?.delay === 15_000);
  const oldAdmission = runtime.membershipGeneration;
  assert.ok(oldTimer);
  await advanceLegacyIntervalClock(harness, runtime, 8_000);
  await harness.rerender({ authenticatedAccessToken: "replacement-test-token" });
  const replacementTimer = runtime.intervals.find((entry) => entry?.delay === 15_000);
  assert.ok(replacementTimer);
  assert.notEqual(replacementTimer, oldTimer);
  assert.notEqual(runtime.membershipGeneration, oldAdmission);
  assert.equal(runtime.intervals.includes(oldTimer), false, "old timer is cleared on session replacement");
  await harness.run(() => oldTimer.callback());
  assert.equal(runtime.heartbeatCalls.length, 0, "a queued retired callback cannot touch either admission");
  await advanceLegacyIntervalClock(harness, runtime, 15_000);
  assert.equal(runtime.heartbeatCalls.length, 1);
  assert.equal(runtime.heartbeatCalls[0].expectedMembershipGeneration, runtime.membershipGeneration);
  await harness.run(() => harness.getResult().leaveRoom());
  const callsAtEnd = runtime.heartbeatCalls.length;
  const readsAtEnd = runtime.snapshotReads;
  await advanceLegacyIntervalClock(harness, runtime, 90_000);
  await harness.run(() => { oldTimer.callback(); replacementTimer.callback(); });
  assert.equal(runtime.heartbeatCalls.length, callsAtEnd, "End retires periodic and queued heartbeat work");
  assert.equal(runtime.snapshotReads, readsAtEnd, "End cannot be followed by heartbeat snapshot resurrection");
});

test("legacy heartbeat: a late liveness response cannot overwrite a newer mute", async (t) => {
  let releaseHeartbeat;
  const heartbeatBarrier = new Promise((resolve) => { releaseHeartbeat = resolve; });
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
  t.after(() => harness.unmount());
  runtime.queueMembership({ wait: heartbeatBarrier });
  await harness.run(async () => {
    const heartbeat = runtime.intervals.filter((entry) => entry?.delay === 15_000).at(-1);
    assert.ok(heartbeat);
    heartbeat.callback();
    await settle(24);
  });
  assert.equal(await harness.run(() => harness.getResult().setMicrophoneEnabled(false)), true);
  assert.equal(runtime.durableMic, false);
  releaseHeartbeat();
  await harness.run(async () => settle(24));
  assert.equal(runtime.durableMic, false);
});

test("legacy heartbeat: a retired heartbeat cannot read its old room into a replacement session", async (t) => {
  let releaseHeartbeat;
  const heartbeatBarrier = new Promise((resolve) => { releaseHeartbeat = resolve; });
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  runtime.queueMembership({ wait: heartbeatBarrier });
  await harness.run(async () => {
    runtime.intervals.filter((entry) => entry?.delay === 15_000).at(-1).callback();
    await settle(12);
  });
  const replacement = { ...harness.refs.roomRef.current, roomId: "ROOM-REPLACEMENT" };
  harness.refs.legacySessionGenerationRef.current += 1;
  harness.refs.roomRef.current = replacement;
  const readsBefore = runtime.snapshotReads;
  releaseHeartbeat();
  await harness.run(async () => settle(24));
  assert.equal(runtime.snapshotReads, readsBefore);
  assert.equal(harness.refs.roomRef.current, replacement);
});

for (const outcome of ["reject", "null"]) {
  test(`legacy End retry: ${outcome} is explicit and permits a later durable retry after capture stopped`, async (t) => {
    const runtime = createLegacyMountedRuntime();
    const harness = await mountLegacyHook(runtime);
    t.after(() => harness.unmount());
    const { track } = seedLocalTrack(runtime, harness, { enabled: true }, { sender: true });
    runtime.leaveActions.push({ outcome });
    await assert.rejects(harness.run(() => harness.getResult().leaveRoom()));
    assert.equal(track.readyState, "ended");
    assert.match(harness.getResult().error, /retry End/u);
    await harness.run(() => harness.getResult().leaveRoom());
    assert.equal(runtime.leaveCalls, 2);
    assert.equal(harness.getResult().error, null);
    await harness.run(() => harness.getResult().leaveRoom());
    assert.equal(runtime.leaveCalls, 2, "completed End is idempotent");
  });
}

test("legacy End retry: repeated End reuses the in-flight durable operation", async (t) => {
  let releaseLeave;
  const leaveBarrier = new Promise((resolve) => { releaseLeave = resolve; });
  const runtime = createLegacyMountedRuntime({ leaveBarrier });
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  let first;
  let second;
  await act(async () => {
    first = harness.getResult().leaveRoom();
    second = harness.getResult().leaveRoom();
    await settle(12);
  });
  assert.equal(runtime.leaveCalls, 1);
  releaseLeave();
  await harness.run(() => Promise.all([first, second]));
  assert.equal(runtime.leaveCalls, 1);
});

test("legacy media serialization: delayed subscription promotion cannot overwrite a later mute", async (t) => {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
  t.after(() => harness.unmount());
  runtime.queueMembership({ wait: barrier });
  let mute;
  await harness.run(async () => {
    const channel = harness.refs.channelRef.current;
    assert.equal(typeof channel.subscriptionCallback, "function", "actual initialized Realtime subscription");
    void channel.emitSubscriptionStatus("SUBSCRIBED");
    await settle(24);
    assert.equal(runtime.membershipActions.length, 0, "promotion is waiting at its durable write");
    mute = harness.getResult().setMicrophoneEnabled(false);
    await settle(24);
  });
  release();
  assert.equal(await harness.run(() => mute), true);
  assert.equal(runtime.durableMic, false);
  assert.equal(harness.getResult().micEnabled, false);
});

test("legacy End privacy: ineffective native stop is explicit and the retained track can be retried", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  const { track } = seedLocalTrack(runtime, harness, { enabled: true, refuseStop: true }, { sender: true });
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()));
  assert.equal(track.enabled, false, "disable is the privacy fallback while native stop is unproved");
  assert.match(harness.getResult().error, /shutdown|cleanup/u);
  track.refuseStop = false;
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(track.readyState, "ended");
  assert.equal(harness.getResult().error, null);
});

test("legacy End ownership: a same-row replacement waits for the old pending leave before joining", async (t) => {
  let releaseLeave;
  const leaveBarrier = new Promise((resolve) => { releaseLeave = resolve; });
  const runtime = createLegacyMountedRuntime({ leaveBarrier });
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  let leave;
  await act(async () => {
    leave = harness.getResult().leaveRoom();
    await settle(12);
  });
  const previousJoins = runtime.joinCalls.length;
  await harness.rerender({ authenticatedAccessToken: "replacement-test-token" });
  const joinsBeforeOldLeaveSettled = runtime.joinCalls.length;
  releaseLeave();
  await harness.run(() => leave);
  assert.equal(joinsBeforeOldLeaveSettled, previousJoins);
  assert.equal(runtime.joinCalls.length, previousJoins + 1);
});

for (const nativeCloseTiming of ["during durable leave", "after durable leave"]) {
  test(`legacy End native ordering: observes asynchronous SDK close ${nativeCloseTiming}`, async (t) => {
    const sdkSource = fs.readFileSync(require.resolve("@livekit/react-native-webrtc/src/RTCPeerConnection.ts"), "utf8");
    const closeBody = sdkSource.slice(sdkSource.indexOf("    close(): void {"), sdkSource.indexOf("    restartIce(): void {"));
    assert.match(closeBody, /WebRTCModule\.peerConnectionClose\(this\._pcId\)/u);
    assert.doesNotMatch(closeBody, /this\.connectionState\s*=(?!=)/u, "locked SDK reports closure asynchronously");
    let releaseLeave;
    const leaveBarrier = new Promise((resolve) => { releaseLeave = resolve; });
    const runtime = createLegacyMountedRuntime({ leaveBarrier });
    const harness = await mountLegacyHook(runtime);
    t.after(() => harness.unmount());
    const peer = runtime.peers.at(-1);
    peer.deferNativeClose = true;
    let completed = false;
    let leaveResult;
    await harness.run(async () => {
      leaveResult = harness.getResult().leaveRoom().then(() => { completed = true; return null; }, (error) => error);
      await settle(24);
    });
    assert.equal(peer.connectionState, "connected", "native close request does not synchronously update state");
    assert.equal(completed, false);
    if (nativeCloseTiming === "after durable leave") {
      releaseLeave();
      await harness.run(async () => settle(24));
      assert.equal(completed, false, "must await observed native closure");
    }
    await harness.run(async () => {
      peer.connectionState = "closed";
      peer.emit("connectionstatechange");
      releaseLeave();
      await settle(24);
    });
    assert.equal(await harness.run(() => leaveResult), null);
    assert.equal(completed, true);
    assert.equal(harness.getResult().error, null);
    assert.equal(peer.listeners.get("connectionstatechange")?.size ?? 0, 0, "temporary shutdown listeners released");
  });
}

test("legacy End native ordering: missing native closure remains a bounded failure and retries retained peers", async (t) => {
  const runtime = createLegacyMountedRuntime({ fireOperationTimeouts: true });
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  const peer = runtime.peers.at(-1);
  peer.deferNativeClose = true;
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()));
  await new Promise((resolve) => hostSetTimeout(resolve, 5));
  await harness.run(async () => settle(24));
  assert.match(harness.getResult().error, /cleanup|shutdown/u);
  assert.equal(peer.listeners.get("connectionstatechange")?.size ?? 0, 0, "timeout releases shutdown listener");
  peer.connectionState = "closed";
  peer.emit("connectionstatechange");
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(harness.getResult().error, null);
  assert.equal(runtime.leaveCalls, 1, "retry does not duplicate a proved durable leave");
});

test("legacy End disabled transition: retry retains failed native capture after terminal media deactivation", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const { track } = seedLocalTrack(runtime, harness, { enabled: true, refuseStop: true }, { sender: true });
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()));
  await harness.rerender({ enabled: false });
  assert.equal(harness.refs.roomRef.current, null, "terminal projection is disabled");
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()), /shutdown|cleanup/u);
  assert.equal(runtime.leaveCalls, 1, "already verified membership is not left again");
  track.refuseStop = false;
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(track.readyState, "ended", "retry observes the original retained native track");
});

test("legacy End disabled transition: durable failure retries the original membership after deactivation", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  runtime.leaveActions.push({ outcome: "reject" });
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()));
  await harness.rerender({ enabled: false });
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(runtime.leaveCalls, 2, "retry performs the unverified original membership leave");
});

test("legacy End disabled transition: server-terminal disable preserves resources before the first End callback", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const { track } = seedLocalTrack(runtime, harness, { enabled: true, refuseStop: true }, { sender: true });
  await harness.rerender({ enabled: false });
  assert.equal(runtime.leaveCalls, 0, "passive teardown does not initiate a durable mutation");
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()), /shutdown|cleanup/u);
  assert.equal(runtime.leaveCalls, 1, "first explicit End still leaves its captured original membership");
  track.refuseStop = false;
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(track.readyState, "ended");
});

test("legacy End disabled transition: an old saved End cannot operate on a replacement account", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const oldEnd = harness.getResult().leaveRoom;
  runtime.userId = "replacement-user";
  await harness.rerender({ authenticatedUserId: runtime.userId, authenticatedAccessToken: "replacement-token" });
  const { track } = seedLocalTrack(runtime, harness, { enabled: true }, { sender: true });
  await assert.rejects(harness.run(() => oldEnd()), /changed/u);
  assert.equal(track.readyState, "live", "old callback must not stop the replacement's capture");
  assert.equal(runtime.leaveCalls, 0);
});

test("legacy End disabled transition: duplicate End still awaits the single original pending leave", async (t) => {
  let releaseLeave;
  const wait = new Promise((resolve) => { releaseLeave = resolve; });
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  runtime.leaveActions.push({ wait });
  let first;
  let second;
  await harness.run(async () => { first = harness.getResult().leaveRoom(); await settle(24); });
  await harness.rerender({ enabled: false });
  await harness.run(async () => { second = harness.getResult().leaveRoom(); await settle(24); });
  assert.equal(runtime.leaveCalls, 1);
  releaseLeave();
  await harness.run(() => Promise.all([first, second]));
  assert.equal(runtime.leaveCalls, 1);
  assert.equal(harness.getResult().error, null);
});

test("legacy End disabled transition: a fresh enabled call must clean its own resources after a completed old End", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  await harness.run(() => harness.getResult().leaveRoom());
  await harness.rerender({ enabled: false });
  await harness.rerender({ enabled: true });
  const { track } = seedLocalTrack(runtime, harness, { enabled: true }, { sender: true });
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(track.readyState, "ended");
  assert.equal(runtime.leaveCalls, 2, "fresh generation cannot reuse a completed older cleanup as proof");
});

test("legacy End disabled transition: a saved old End cannot stop a same-context reenabled session", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const oldEnd = harness.getResult().leaveRoom;
  await harness.run(() => oldEnd());
  await harness.rerender({ enabled: false });
  await harness.rerender({ enabled: true });
  const { track } = seedLocalTrack(runtime, harness, { enabled: true }, { sender: true });
  await assert.rejects(harness.run(() => oldEnd()), /changed/u);
  assert.equal(track.readyState, "live");
  assert.equal(runtime.leaveCalls, 1);
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(track.readyState, "ended");
  assert.equal(runtime.leaveCalls, 2);
});

test("legacy End disabled transition: the original delayed End still owns its terminal disabled call", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const delayedEnd = harness.getResult().leaveRoom;
  await harness.rerender({ enabled: false });
  await harness.run(() => delayedEnd());
  assert.equal(runtime.leaveCalls, 1, "same-call deactivation must not strand its legitimate End callback");
});

test("legacy SDK Presence: a remote metadata ref replacement retains the existing peer and video receiver", async (t) => {
  const runtime = createLegacyMountedRuntime({ remoteDurableCamera: true, remoteDurableMic: true });
  const harness = await mountLegacyHook(runtime, { enabled: true, analyticsContext: { surface: "chat-thread" } });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  await harness.run(() => channel.emitPresenceState({
    [runtime.remoteUserId]: { metas: [{ phx_ref: "remote-before", cameraOn: true, micOn: true }] },
    [runtime.userId]: { metas: [{ phx_ref: "local-before", cameraOn: false, micOn: false }] },
  }));
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  const remoteVideo = runtime.createTrack("video", { enabled: true });
  peer.receivers = [{ track: remoteVideo }];
  await harness.run(() => peer.emit("track", { track: remoteVideo, streams: [runtime.createStream([remoteVideo])] }));
  const streamURL = harness.getResult().participants.find((participant) => participant.userId === runtime.remoteUserId)?.streamURL;
  assert.ok(streamURL, "test has a bound remote video receiver before metadata change");
  const generation = harness.refs.legacySessionGenerationRef.current;
  const originalJoins = runtime.joinCalls.length;
  for (let index = 0; index < 6; index += 1) {
    const previousRef = index === 0 ? "remote-before" : `remote-update-${index - 1}`;
    await harness.run(() => channel.emitPresenceDiff({
      joins: { [runtime.remoteUserId]: { metas: [{ phx_ref: `remote-update-${index}`, micOn: index % 2 === 0, cameraOn: true }] } },
      leaves: { [runtime.remoteUserId]: { metas: [{ phx_ref: previousRef }] } },
    }));
    assert.equal(harness.refs.peerConnectionsRef.current[runtime.remoteUserId], peer, "metadata replacement must not rebuild transport");
    assert.notEqual(peer.connectionState, "closed", "metadata leave is not participant departure");
    assert.equal(harness.getResult().participants.find((participant) => participant.userId === runtime.remoteUserId)?.streamURL, streamURL);
  }
  assert.equal(harness.refs.legacySessionGenerationRef.current, generation);
  assert.equal(runtime.joinCalls.length, originalJoins);
});

test("legacy SDK Presence: removing one of two presences does not disconnect the remaining same-user endpoint", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  await harness.run(() => channel.emitPresenceState({
    [runtime.remoteUserId]: { metas: [{ phx_ref: "remote-1" }, { phx_ref: "remote-2" }] },
  }));
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  await harness.run(() => channel.emitPresenceDiff({ joins: {}, leaves: {
    [runtime.remoteUserId]: { metas: [{ phx_ref: "remote-1" }] },
  } }));
  assert.equal(harness.refs.peerConnectionsRef.current[runtime.remoteUserId], peer);
  assert.notEqual(peer.connectionState, "closed");
});

test("legacy SDK Presence: a signaling-only departure preserves media, but authoritative member leave retires it", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  await harness.run(() => channel.emitPresenceState({
    [runtime.remoteUserId]: { metas: [{ phx_ref: "remote-before" }] },
  }));
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  await harness.run(() => channel.emitPresenceState({}));
  assert.equal(harness.refs.peerConnectionsRef.current[runtime.remoteUserId], peer, "Realtime presence alone cannot override a healthy authorized RTC connection");
  assert.notEqual(peer.connectionState, "closed");
  await harness.run(() => channel.emitPresenceState({
    [runtime.remoteUserId]: { metas: [{ phx_ref: "remote-returned" }] },
  }));
  runtime.queueSnapshot({ memberships: [
    makeMembership(runtime),
    makeMembership(runtime, { userId: runtime.remoteUserId, membershipState: "left", leftAt: "2026-09-28T16:00:00Z" }),
  ] });
  await harness.run(() => channel.emitPresenceState({}));
  assert.equal(peer.connectionState, "closed", "authoritative departure must still retire transport");
  assert.equal(harness.refs.peerConnectionsRef.current[runtime.remoteUserId], undefined);
});

test("legacy SDK Presence: a retired channel's departure cannot refresh or close replacement media", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const retiredChannel = harness.refs.channelRef.current;
  await harness.run(() => retiredChannel.emitPresenceState({
    [runtime.remoteUserId]: { metas: [{ phx_ref: "retired-peer" }] },
  }));
  runtime.roomId = "ROOM-REPLACEMENT";
  await harness.rerender({ roomId: runtime.roomId });
  const currentPeer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  const reads = runtime.snapshotReads;
  await harness.run(() => retiredChannel.emitPresenceState({}));
  assert.equal(runtime.snapshotReads, reads);
  assert.equal(harness.refs.peerConnectionsRef.current[runtime.remoteUserId], currentPeer);
  assert.notEqual(currentPeer.connectionState, "closed");
});

test("legacy cleanup generation: terminal deactivation retains the actual admitted membership token", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const generation = runtime.membershipGeneration;
  await harness.rerender({ enabled: false });
  // A later snapshot/ref update is not permission for this retained End to
  // substitute a newer same-room user's admission token.
  harness.refs.joinedMembershipRef.current = makeMembership(runtime, {
    membershipGeneration: "12000000-0000-4000-8000-000000000002",
  });
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(runtime.leaveRequests[0].expectedMembershipGeneration, generation);
});

test("legacy delayed admission: successful join after unmount leaves its exact admitted row without starting capture", async () => {
  const runtime = createLegacyMountedRuntime();
  let finishJoin;
  runtime.joinActions.push({ wait: new Promise((resolve) => { finishJoin = resolve; }) });
  const generation = runtime.membershipGeneration;
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  assert.equal(runtime.joinCalls.length, 1);
  assert.equal(runtime.mediaCreateCalls.length, 0);
  await harness.unmount();
  await act(async () => { finishJoin(); await settle(96); });
  assert.equal(runtime.leaveCalls, 1);
  assert.equal(runtime.leaveRequests[0].expectedMembershipGeneration, generation);
  assert.equal(runtime.leaveRequests[0].userId, "local-user");
  assert.equal(runtime.mediaCreateCalls.length, 0);
});

test("legacy delayed admission: same-row replacement waits for the retired join and exact cleanup", async (t) => {
  const runtime = createLegacyMountedRuntime();
  let finishJoin;
  let finishLeave;
  runtime.joinActions.push({ wait: new Promise((resolve) => { finishJoin = resolve; }) });
  runtime.leaveActions.push({ wait: new Promise((resolve) => { finishLeave = resolve; }) });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  await harness.rerender({ enabled: false });
  await harness.rerender({ enabled: true });
  assert.equal(runtime.joinCalls.length, 1, "replacement cannot share the pending retired admission");
  await act(async () => { finishJoin(); await settle(96); });
  assert.equal(runtime.leaveCalls, 1);
  assert.equal(runtime.joinCalls.length, 1, "replacement waits for the exact leave result");
  await act(async () => { finishLeave(); await settle(256); });
  assert.equal(runtime.joinCalls.length, 2);
  assert.equal(harness.refs.joinedMembershipRef.current?.userId, runtime.userId);
});

test("legacy delayed admission: account replacement never cleans through the new account or changes its media", async (t) => {
  const runtime = createLegacyMountedRuntime();
  let finishJoin;
  runtime.joinActions.push({ wait: new Promise((resolve) => { finishJoin = resolve; }) });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  runtime.userId = "replacement-user";
  await harness.rerender({ authenticatedUserId: runtime.userId, authenticatedAccessToken: "replacement-token" });
  const currentMembership = harness.refs.joinedMembershipRef.current;
  const currentPeer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  await act(async () => { finishJoin(); await settle(128); });
  assert.equal(runtime.leaveRequests[0].userId, "local-user", "retired result retains its initiating identity");
  assert.equal(harness.refs.joinedMembershipRef.current, currentMembership);
  assert.equal(harness.refs.peerConnectionsRef.current[runtime.remoteUserId], currentPeer);
  assert.ok(runtime.errors.some((entry) => entry.scope === "communication-retired-admission-cleanup"));
});

test("legacy delayed admission: an unresolved retired join bounds replacement waiting and still cleans a late success", async (t) => {
  const runtime = createLegacyMountedRuntime({ fireOperationTimeouts: true });
  let finishJoin;
  runtime.joinActions.push({ wait: new Promise((resolve) => { finishJoin = resolve; }) });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  await harness.rerender({ enabled: false });
  await harness.rerender({ enabled: true });
  await harness.run(() => new Promise((resolve) => hostSetTimeout(resolve, 5)));
  assert.equal(harness.getResult().loading, false);
  assert.equal(harness.getResult().channelState, "error");
  assert.equal(runtime.joinCalls.length, 1);
  await act(async () => { finishJoin(); await settle(128); });
  assert.equal(runtime.leaveCalls, 1, "timeout must not discard eventual cleanup ownership");
  assert.equal(runtime.joinCalls.length, 1, "late completion cannot restart a failed replacement invisibly");
});

test("legacy delayed admission: initial loading times out while an eventual successful join is still compensated", async (t) => {
  const runtime = createLegacyMountedRuntime({ fireOperationTimeouts: true });
  let finishJoin;
  runtime.joinActions.push({ wait: new Promise((resolve) => { finishJoin = resolve; }) });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  await harness.run(() => new Promise((resolve) => hostSetTimeout(resolve, 5)));
  assert.equal(harness.getResult().loading, false);
  assert.equal(harness.getResult().channelState, "error");
  await act(async () => { finishJoin(); await settle(128); });
  assert.equal(runtime.leaveCalls, 1);
  assert.equal(runtime.mediaCreateCalls.length, 0);
  assert.equal(harness.refs.joinedMembershipRef.current, null);
});

test("legacy ambiguous admission: missing transport outcome cannot silently repeat the same room/user join", async (t) => {
  const runtime = createLegacyMountedRuntime();
  runtime.joinActions.push({ outcome: "reject", message: "account_bound_rpc_unavailable" });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  assert.equal(harness.getResult().channelState, "error");
  assert.equal(runtime.joinCalls.length, 1);
  await harness.rerender({ enabled: false });
  await harness.rerender({ enabled: true });
  assert.equal(runtime.joinCalls.length, 1, "ambiguous failure retains the exact same-row reservation");
  runtime.roomId = "NEW-INDEPENDENT-ROOM";
  await harness.rerender({ roomId: runtime.roomId });
  assert.equal(runtime.joinCalls.length, 2, "another room has independent admission authority");
});

for (const status of [502, 504]) {
  test(`legacy actual gateway ${status}: unconfirmed join retains the exact row barrier after HTTP response`, async (t) => {
    const reply = await invokeAccountBoundSupabaseRpc({
      supabaseUrl: "https://example.invalid", anonKey: "test-anon", accessToken: "test-token", functionName: "join_communication_room_session",
      fetchImpl: async () => ({ ok: false, status, json: async () => { throw new Error("gateway returned HTML"); } }),
    });
    assert.equal(isAccountBoundSupabaseRpcOutcomeAmbiguous(reply.error), true);
    const runtime = createLegacyMountedRuntime({ fireOperationTimeouts: true });
    runtime.joinActions.push({ outcome: "reject", message: reply.error.message });
    const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
    t.after(() => harness.unmount());
    assert.equal(runtime.joinCalls.length, 1);
    await harness.rerender({ enabled: false });
    await harness.rerender({ enabled: true });
    await harness.run(() => new Promise((resolve) => hostSetTimeout(resolve, 5)));
    assert.equal(runtime.joinCalls.length, 1, "gateway completion is not durable rollback proof");
    assert.equal(harness.getResult().channelState, "error");
    runtime.roomId = "FRESH-GATEWAY-ROOM";
    await harness.rerender({ roomId: runtime.roomId });
    assert.equal(runtime.joinCalls.length, 2);
  });
}

test("legacy actual malformed admission receipt: unknown row postcondition retains the shared barrier", async (t) => {
  const { loadCommunicationApiSource } = await import("./helpers/communication-api-source.mjs");
  const api = loadCommunicationApiSource({}, async () => ({ data: [{}], error: null }));
  let receiptError;
  try {
    await api.joinCommunicationRoomSession({
      roomId: "ROOM-LEGACY", userId: "11111111-1111-4111-8111-111111111111", cameraEnabled: false, micEnabled: false,
      admission: { roomId: "ROOM-LEGACY", userId: "11111111-1111-4111-8111-111111111111", attemptId: "13000000-0000-4000-8000-000000000001", expectedPreviousGeneration: null },
    });
  } catch (error) { receiptError = error; }
  assert.ok(receiptError);
  assert.equal(isAccountBoundSupabaseRpcOutcomeAmbiguous(receiptError), true);
  const runtime = createLegacyMountedRuntime({ fireOperationTimeouts: true });
  runtime.joinActions.push({ outcome: "reject", error: receiptError });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  await harness.rerender({ enabled: false });
  await harness.rerender({ enabled: true });
  await harness.run(() => new Promise((resolve) => hostSetTimeout(resolve, 5)));
  assert.equal(runtime.joinCalls.length, 1, "invalid success rows cannot prove safe repeat admission");
  assert.equal(harness.getResult().channelState, "error");
});

test("legacy durable admission: retry keeps one prepared attempt and a new owner rotates ACTIVE generation", async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true, fireRetryTimeouts: true });
  const previousGeneration = runtime.membershipGeneration;
  runtime.joinActions.push({ outcome: "null" });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  await harness.run(() => new Promise((resolve) => hostSetTimeout(resolve, 5)));
  assert.equal(runtime.admissionPrepareCalls.length, 1);
  assert.equal(runtime.joinCalls.length, 2);
  assert.equal(runtime.joinCalls[0].admission, runtime.joinCalls[1].admission);
  assert.equal(runtime.joinCalls[0].admission.expectedPreviousGeneration, previousGeneration);
  const firstGeneration = harness.refs.joinedMembershipRef.current.membershipGeneration;
  assert.notEqual(firstGeneration, previousGeneration);
  assert.ok(runtime.membershipTouches.every((input) => input.expectedMembershipGeneration === firstGeneration));
  await harness.rerender({ enabled: false });
  await harness.rerender({ enabled: true });
  assert.equal(runtime.admissionPrepareCalls.length, 2);
  assert.notEqual(runtime.joinCalls.at(-1).admission.attemptId, runtime.joinCalls[0].admission.attemptId);
  assert.equal(runtime.joinCalls.at(-1).admission.expectedPreviousGeneration, firstGeneration);
  assert.notEqual(harness.refs.joinedMembershipRef.current.membershipGeneration, firstGeneration);
});

test("legacy durable media: a delayed old-generation mute cannot change the replacement's server media", async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true });
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  seedLocalTrack(runtime, harness, { enabled: true }, { sender: true });
  const oldGeneration = harness.refs.joinedMembershipRef.current.membershipGeneration;
  let finishWrite;
  runtime.queueMembership({ wait: new Promise((resolve) => { finishWrite = resolve; }) });
  const previousWrites = runtime.membershipTouches.length;
  let muting;
  await act(async () => { muting = harness.getResult().setMicrophoneEnabled(false); await settle(64); });
  runtime.membershipGeneration = "14000000-0000-4000-8000-000000000099";
  runtime.durableMic = true;
  runtime.durableCamera = true;
  await harness.run(async () => { finishWrite(); await muting; });
  assert.equal(runtime.durableMic, true);
  assert.equal(runtime.durableCamera, true);
  assert.ok(runtime.membershipTouches.slice(previousWrites).every((input) => input.expectedMembershipGeneration === oldGeneration));
  assert.equal(harness.refs.joinedMembershipRef.current.membershipGeneration, oldGeneration, "an old hook cannot adopt a newer server generation to retry its mutation");
});

test("legacy durable heartbeat: old-generation liveness cannot refresh after replacement admission", async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true });
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const oldGeneration = harness.refs.joinedMembershipRef.current.membershipGeneration;
  let finishHeartbeat;
  runtime.queueMembership({ wait: new Promise((resolve) => { finishHeartbeat = resolve; }) });
  const heartbeat = runtime.intervals.filter((entry) => entry?.delay === 15_000).at(-1);
  await harness.run(() => heartbeat.callback());
  const previousReads = runtime.snapshotReads;
  runtime.membershipGeneration = "14000000-0000-4000-8000-000000000099";
  await harness.run(async () => { finishHeartbeat(); await settle(96); });
  assert.equal(runtime.heartbeatCalls.at(-1).expectedMembershipGeneration, oldGeneration);
  assert.equal(runtime.snapshotReads, previousReads);
  assert.ok(runtime.errors.some((entry) => entry.scope === "communication-membership-heartbeat"));
});

test("legacy sender ownership: a queued old-owner offer cannot reach native SDP after the peer's durable replacement", async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true, peerConnectionState: "connecting" });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  const oldRemoteGeneration = "16000000-0000-4000-8000-000000000001";
  const newRemoteGeneration = "16000000-0000-4000-8000-000000000002";
  runtime.remoteMembershipGeneration = newRemoteGeneration;
  runtime.snapshotActions.push({ memberships: [
    makeMembership(runtime),
    makeMembership(runtime, { userId: runtime.remoteUserId, membershipGeneration: newRemoteGeneration }),
  ] });
  await harness.run(() => harness.refs.refreshSnapshot(runtime.roomId));
  const nativeDescriptions = peer.remoteDescriptionCalls.length;
  const answers = runtime.broadcasts.filter((message) => message.event === "webrtc:answer").length;
  await harness.run(() => channel.emitBroadcast("webrtc:offer", {
    roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId,
    membershipGeneration: oldRemoteGeneration, negotiationId: "retired-owner-offer",
    description: { type: "offer", sdp: "queued-retired-owner-offer" },
  }));
  assert.deepEqual({
    nativeDescriptions: peer.remoteDescriptionCalls.length - nativeDescriptions,
    answers: runtime.broadcasts.filter((message) => message.event === "webrtc:answer").length - answers,
  }, { nativeDescriptions: 0, answers: 0 }, "a known retired sender cannot rewrite native SDP or obtain an answer from the current call");
  assert.equal(peer.connectionState, "closed", "an authoritative new owner retires the previous native endpoint");
  assert.notEqual(harness.refs.peerConnectionsRef.current[runtime.remoteUserId], peer);
});

test("legacy sender ownership: first SDP from a new owner refreshes truth once and replaces only its old peer", async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true, peerConnectionState: "connecting" });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  const oldPeer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  const localStream = harness.refs.localStreamRef.current;
  const previousReads = runtime.snapshotReads;
  runtime.remoteMembershipGeneration = "16000000-0000-4000-8000-000000000002";
  const offer = { roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId,
    membershipGeneration: runtime.remoteMembershipGeneration, negotiationId: "replacement-owner-offer",
    description: { type: "offer", sdp: "replacement-owner-offer" } };
  await harness.run(() => channel.emitBroadcast("webrtc:offer", offer));
  const replacement = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  assert.equal(runtime.snapshotReads, previousReads + 1);
  assert.equal(oldPeer.connectionState, "closed");
  assert.notEqual(replacement, oldPeer);
  assert.equal(harness.refs.localStreamRef.current, localStream, "remote ownership change preserves local capture");
  assert.equal(replacement.remoteDescription.sdp, offer.description.sdp);
  assert.ok(runtime.broadcasts.some((message) => message.event === "webrtc:answer" && message.payload.negotiationId === offer.negotiationId));
  await harness.run(() => channel.emitBroadcast("webrtc:offer", offer));
  assert.equal(runtime.snapshotReads, previousReads + 1, "known current ownership does not cause another read");
});

for (const event of ["webrtc:offer", "webrtc:answer", "webrtc:ice"]) {
  test(`legacy sender ownership: ${event} rechecks the sender after waiting for the native queue`, async (t) => {
    const runtime = createLegacyMountedRuntime({ peerConnectionState: "connecting" });
    const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
    t.after(() => harness.unmount());
    const channel = harness.refs.channelRef.current;
    const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
    if (event === "webrtc:answer") {
      await peer.setLocalDescription({ type: "offer", sdp: "current-offer" });
      harness.refs.peerLocalOffersRef.current[runtime.remoteUserId] = {
        generation: harness.refs.legacySessionGenerationRef.current, peerConnection: peer, sdp: "current-offer", negotiationId: "current-offer",
      };
    }
    let releaseQueue;
    const queue = harness.refs.runSerializedPeerSignaling(runtime.remoteUserId, () => new Promise((resolve) => { releaseQueue = resolve; }));
    await settle(24);
    let packet;
    await act(async () => {
      packet = channel.emitBroadcast(event, {
        roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId,
        membershipGeneration: runtime.remoteMembershipGeneration, negotiationId: "current-offer",
        description: { type: event === "webrtc:offer" ? "offer" : "answer", sdp: "retired-queued-sdp" },
        candidate: { candidate: "candidate:retired-owner" },
      });
      await settle(40);
    });
    const beforeDescriptions = peer.remoteDescriptionCalls.length;
    runtime.remoteMembershipGeneration = "16000000-0000-4000-8000-000000000002";
    await harness.run(() => harness.refs.refreshSnapshot(runtime.roomId));
    await harness.run(async () => { releaseQueue(); await queue; await packet; });
    assert.equal(peer.remoteDescriptionCalls.length, beforeDescriptions);
    assert.equal(peer.connectionState, "closed");
    assert.equal(harness.refs.pendingPeerIceRef.current[runtime.remoteUserId], undefined);
  });
}

test("legacy sender ownership: missing stamps cannot reach native SDP, ICE, or media refresh", async (t) => {
  const runtime = createLegacyMountedRuntime({ peerConnectionState: "connecting" });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  const before = { descriptions: peer.remoteDescriptionCalls.length, reads: runtime.snapshotReads };
  for (const event of ["webrtc:offer", "webrtc:answer", "webrtc:ice", "media:update"]) {
    await harness.run(() => channel.emitBroadcast(event, {
      roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId,
      membershipGeneration: null, description: { type: "offer", sdp: "unstamped-offer" },
      candidate: { candidate: "candidate:unstamped" },
    }));
  }
  assert.deepEqual({ descriptions: peer.remoteDescriptionCalls.length, reads: runtime.snapshotReads }, before);
});

for (const refuseStop of [false, true]) {
  test(`legacy observed ownership replacement: retires only old local media and reports native stop ${refuseStop ? "failure" : "success"}`, async (t) => {
    const runtime = createLegacyMountedRuntime({ ownedAdmission: true });
    let terminalEvents = 0;
    const harness = await mountLegacyHook(runtime, { enabled: true, onRoomEnded: () => { terminalEvents += 1; } });
    t.after(() => harness.unmount());
    const { track } = seedLocalTrack(runtime, harness, { enabled: true, refuseStop }, { sender: true });
    const previousGeneration = harness.refs.joinedMembershipRef.current.membershipGeneration;
    const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
    runtime.membershipGeneration = "14000000-0000-4000-8000-000000000099";
    const writes = runtime.membershipTouches.length;
    await harness.run(() => harness.refs.refreshSnapshot(runtime.roomId));
    assert.equal(peer.connectionState, "closed");
    assert.equal(track.enabled, false);
    assert.equal(track.readyState, refuseStop ? "live" : "ended");
    assert.equal(harness.getResult().channelState, "error");
    assert.match(harness.getResult().error, refuseStop ? /unverified/u : /local media was stopped/u);
    assert.equal(runtime.membershipTouches.length, writes);
    assert.equal(runtime.leaveCalls, 0);
    assert.equal(runtime.roomEndCalls, 0);
    assert.equal(terminalEvents, 0, "ownership replacement must not terminate the shared call invite");
    assert.equal(harness.refs.joinedMembershipRef.current.membershipGeneration, previousGeneration);
    if (refuseStop) {
      track.refuseStop = false;
      await assert.rejects(harness.run(() => harness.getResult().leaveRoom()), /generation/u);
      assert.equal(track.readyState, "ended", "retained local privacy retry does not require borrowing the replacement token");
    }
  });
}

test("legacy admission preparation: timed-out read cannot later join or block a fresh owner before mutation", async (t) => {
  const runtime = createLegacyMountedRuntime({ ownedAdmission: true, fireOperationTimeouts: true });
  let finishRead;
  runtime.admissionPrepareActions.push({ wait: new Promise((resolve) => { finishRead = resolve; }) });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  await harness.run(() => new Promise((resolve) => hostSetTimeout(resolve, 5)));
  assert.equal(runtime.joinCalls.length, 0);
  await harness.rerender({ enabled: false });
  await harness.rerender({ enabled: true });
  assert.equal(runtime.joinCalls.length, 1);
  const currentGeneration = harness.refs.joinedMembershipRef.current.membershipGeneration;
  await harness.run(async () => { finishRead(); await settle(96); });
  assert.equal(runtime.joinCalls.length, 1);
  assert.equal(harness.refs.joinedMembershipRef.current.membershipGeneration, currentGeneration);
});

test("legacy admission across mounts: a replacement cannot pass a retired join and its cleanup", async (t) => {
  const admissionCoordinator = createAdmissionCoordinator();
  const oldRuntime = createLegacyMountedRuntime({ admissionCoordinator });
  let finishJoin;
  oldRuntime.joinActions.push({ wait: new Promise((resolve) => { finishJoin = resolve; }) });
  const oldHarness = await mountLegacyHook(oldRuntime, { enabled: true, naturalLifecycle: true });
  await oldHarness.unmount();
  const newRuntime = createLegacyMountedRuntime({ admissionCoordinator });
  const replacement = await mountLegacyHook(newRuntime, { enabled: true, naturalLifecycle: true });
  t.after(() => replacement.unmount());
  assert.equal(newRuntime.joinCalls.length, 0);
  await act(async () => { finishJoin(); await settle(256); });
  assert.equal(oldRuntime.leaveCalls, 1);
  assert.equal(newRuntime.joinCalls.length, 1);
  assert.equal(oldRuntime.mediaCreateCalls.length, 0);
});

test("legacy retired admission: one ambiguous cleanup response retries the exact token before releasing replacement", async (t) => {
  const admissionCoordinator = createAdmissionCoordinator();
  const oldRuntime = createLegacyMountedRuntime({ admissionCoordinator });
  let finishJoin;
  oldRuntime.joinActions.push({ wait: new Promise((resolve) => { finishJoin = resolve; }) });
  oldRuntime.leaveActions.push({ outcome: "reject", message: "account_bound_rpc_unavailable" });
  const oldHarness = await mountLegacyHook(oldRuntime, { enabled: true, naturalLifecycle: true });
  await oldHarness.unmount();
  const newRuntime = createLegacyMountedRuntime({ admissionCoordinator });
  const replacement = await mountLegacyHook(newRuntime, { enabled: true, naturalLifecycle: true });
  t.after(() => replacement.unmount());
  assert.equal(newRuntime.joinCalls.length, 0);
  await act(async () => { finishJoin(); await settle(256); });
  assert.equal(oldRuntime.leaveCalls, 2);
  assert.deepEqual(oldRuntime.leaveRequests[0], oldRuntime.leaveRequests[1], "retry cannot acquire a different membership authority");
  assert.equal(newRuntime.joinCalls.length, 1);
  assert.equal(oldRuntime.mediaCreateCalls.length, 0);
});

test("legacy retired admission: two ambiguous cleanup responses retain the barrier without an endless retry loop", async (t) => {
  const admissionCoordinator = createAdmissionCoordinator();
  const oldRuntime = createLegacyMountedRuntime({ admissionCoordinator });
  let finishJoin;
  oldRuntime.joinActions.push({ wait: new Promise((resolve) => { finishJoin = resolve; }) });
  oldRuntime.leaveActions.push(
    { outcome: "reject", message: "account_bound_rpc_unavailable" },
    { outcome: "reject", message: "account_bound_rpc_unavailable" },
  );
  const oldHarness = await mountLegacyHook(oldRuntime, { enabled: true, naturalLifecycle: true });
  await oldHarness.unmount();
  const newRuntime = createLegacyMountedRuntime({ admissionCoordinator, fireOperationTimeouts: true });
  const replacement = await mountLegacyHook(newRuntime, { enabled: true, naturalLifecycle: true });
  t.after(() => replacement.unmount());
  await act(async () => { finishJoin(); await settle(256); });
  await replacement.run(() => new Promise((resolve) => hostSetTimeout(resolve, 5)));
  assert.equal(oldRuntime.leaveCalls, 2);
  assert.equal(newRuntime.joinCalls.length, 0);
  assert.equal(replacement.getResult().channelState, "error");
  newRuntime.roomId = "SEPARATE-FRESH-ROOM";
  await replacement.rerender({ roomId: newRuntime.roomId });
  assert.equal(newRuntime.joinCalls.length, 1);
});

test("legacy cleanup across mounts: actual pending End remains ahead of replacement admission", async (t) => {
  const admissionCoordinator = createAdmissionCoordinator();
  const oldRuntime = createLegacyMountedRuntime({ admissionCoordinator });
  const oldHarness = await mountLegacyHook(oldRuntime, { enabled: true });
  let finishLeave;
  oldRuntime.leaveActions.push({ wait: new Promise((resolve) => { finishLeave = resolve; }) });
  let ending;
  await act(async () => { ending = oldHarness.getResult().leaveRoom(); await settle(64); });
  assert.equal(oldRuntime.leaveCalls, 1);
  await oldHarness.unmount();
  const newRuntime = createLegacyMountedRuntime({ admissionCoordinator });
  const replacement = await mountLegacyHook(newRuntime, { enabled: true, naturalLifecycle: true });
  t.after(() => replacement.unmount());
  assert.equal(newRuntime.joinCalls.length, 0);
  await act(async () => { finishLeave(); await ending; await settle(256); });
  assert.equal(newRuntime.joinCalls.length, 1);
});

test("legacy ambiguous cleanup: exact-generation End retry resolves the shared admission barrier", async (t) => {
  const admissionCoordinator = createAdmissionCoordinator();
  const oldRuntime = createLegacyMountedRuntime({ admissionCoordinator });
  const oldHarness = await mountLegacyHook(oldRuntime, { enabled: true });
  t.after(() => oldHarness.unmount());
  oldRuntime.leaveActions.push({ outcome: "reject", message: "account_bound_rpc_unavailable" });
  await assert.rejects(oldHarness.run(() => oldHarness.getResult().leaveRoom()), /unavailable/u);
  const newRuntime = createLegacyMountedRuntime({ admissionCoordinator });
  const replacement = await mountLegacyHook(newRuntime, { enabled: true, naturalLifecycle: true });
  t.after(() => replacement.unmount());
  assert.equal(newRuntime.joinCalls.length, 0);
  await oldHarness.run(() => oldHarness.getResult().leaveRoom());
  await replacement.run(() => settle(256));
  assert.equal(oldRuntime.leaveCalls, 2);
  assert.equal(newRuntime.joinCalls.length, 1);
});

test("legacy SDP answer ownership: a queued answer cannot settle an offer that replaced it", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  await peer.setLocalDescription({ type: "offer", sdp: "old-offer" });
  const oldOffer = { generation: harness.refs.legacySessionGenerationRef.current, peerConnection: peer, sdp: "old-offer", negotiationId: "old-offer-id" };
  harness.refs.peerLocalOffersRef.current[runtime.remoteUserId] = oldOffer;
  let releaseNativeQueue;
  const nativeQueue = harness.refs.runSerializedPeerSignaling(runtime.remoteUserId, () => new Promise((resolve) => { releaseNativeQueue = resolve; }));
  await settle(24);
  let answerEvent;
  await act(async () => {
    answerEvent = channel.emitBroadcast("webrtc:answer", {
      roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId,
      negotiationId: oldOffer.negotiationId, description: { type: "answer", sdp: "old-answer" },
    });
    await settle(24);
  });
  const before = peer.remoteDescriptionCalls.length;
  harness.refs.peerLocalOffersRef.current[runtime.remoteUserId] = { ...oldOffer, sdp: "new-offer", negotiationId: "new-offer-id" };
  await harness.run(async () => { releaseNativeQueue(); await nativeQueue; await answerEvent; });
  assert.equal(peer.remoteDescriptionCalls.length, before);
  assert.equal(peer.signalingState, "have-local-offer");
  await harness.run(() => channel.emitBroadcast("webrtc:answer", {
    roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId,
    negotiationId: "new-offer-id", description: { type: "answer", sdp: "current-answer" },
  }));
  assert.equal(peer.signalingState, "stable");
  assert.equal(peer.remoteDescription.sdp, "current-answer");
});

for (const incomingDescriptionType of ["offer", "answer"]) {
  test(`legacy ICE ordering: candidates arriving before ${incomingDescriptionType} wait for exact peer SDP`, async (t) => {
    const runtime = createLegacyMountedRuntime({ peerConnectionState: "connecting" });
    const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
    t.after(() => harness.unmount());
    const channel = harness.refs.channelRef.current;
    const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
    assert.equal(peer.remoteDescription, undefined);
    if (incomingDescriptionType === "answer") {
      await peer.setLocalDescription({ type: "offer", sdp: "initial-offer" });
      harness.refs.peerLocalOffersRef.current[runtime.remoteUserId] = {
        generation: harness.refs.legacySessionGenerationRef.current, peerConnection: peer,
        sdp: "initial-offer", negotiationId: "initial-offer-id",
      };
    }
    const envelope = { roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId };
    await harness.run(() => channel.emitBroadcast("webrtc:ice", { ...envelope, candidate: { candidate: "candidate:early", sdpMid: "0", sdpMLineIndex: 0 } }));
    await harness.run(() => channel.emitBroadcast("webrtc:ice", { ...envelope, candidate: { candidate: "candidate:early", sdpMid: "0", sdpMLineIndex: 0 } }));
    assert.equal(peer.iceCandidates.length, 0, "native ICE must wait for remote SDP");
    await harness.run(() => channel.emitBroadcast(`webrtc:${incomingDescriptionType}`, {
      ...envelope, negotiationId: "initial-offer-id", description: { type: incomingDescriptionType, sdp: "initial-sdp" },
    }));
    assert.equal(peer.iceCandidates.length, 1, "buffer drains once, including duplicate relay suppression");
    assert.equal(peer.iceCandidates[0].candidate, "candidate:early");
    assert.equal(runtime.errors.filter((entry) => entry.scope === "communication-webrtc-ice-candidate").length, 0);
  });
}

test("legacy ICE ownership: queued candidates from a retired native peer cannot reach its replacement", async (t) => {
  const runtime = createLegacyMountedRuntime({ peerConnectionState: "connecting" });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  const oldPeer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  const envelope = { roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId };
  await harness.run(() => channel.emitBroadcast("webrtc:ice", { ...envelope, candidate: { candidate: "candidate:retired", sdpMid: "0", sdpMLineIndex: 0 } }));
  const replacement = runtime.createPeer();
  harness.refs.peerConnectionsRef.current[runtime.remoteUserId] = replacement;
  await harness.run(() => channel.emitBroadcast("webrtc:offer", { ...envelope, description: { type: "offer", sdp: "replacement-offer" } }));
  assert.equal(oldPeer.iceCandidates.length, 0);
  assert.equal(replacement.iceCandidates.length, 0);
  await harness.run(() => channel.emitBroadcast("webrtc:ice", { ...envelope, candidate: { candidate: "candidate:current", sdpMid: "0", sdpMLineIndex: 0 } }));
  assert.equal(replacement.iceCandidates[0]?.candidate, "candidate:current");
});

test("legacy ICE bounds: pending relay candidates are deduplicated and capped before SDP", async (t) => {
  const runtime = createLegacyMountedRuntime({ peerConnectionState: "connecting" });
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  t.after(() => harness.unmount());
  const channel = harness.refs.channelRef.current;
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  const envelope = { roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId };
  await harness.run(async () => {
    for (let index = 0; index < 80; index += 1) {
      await channel.emitBroadcast("webrtc:ice", { ...envelope, candidate: { candidate: `candidate:${index}`, sdpMid: "0", sdpMLineIndex: 0 } });
    }
    await channel.emitBroadcast("webrtc:offer", { ...envelope, description: { type: "offer", sdp: "current-offer" } });
  });
  assert.equal(peer.iceCandidates.length, 64);
});

test("legacy cleanup generation: missing or replaced admission cannot claim cleanup success", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  const { track } = seedLocalTrack(runtime, harness, { enabled: true }, { sender: true });
  harness.refs.joinedMembershipRef.current = null;
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()), /generation/u);
  assert.equal(track.readyState, "ended", "native privacy shutdown remains independent of unavailable server authority");
  assert.equal(runtime.leaveRequests[0].expectedMembershipGeneration, undefined);
});

test("legacy cleanup generation: a wrong-generation terminal response is not accepted", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());
  runtime.leaveActions.push({ membership: makeMembership(runtime, {
    membershipGeneration: "12000000-0000-4000-8000-000000000002",
    membershipState: "left", leftAt: "2026-09-28T16:00:00Z", cameraEnabled: false, micEnabled: false,
  }) });
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()), /cleanup/u);
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(runtime.leaveCalls, 2, "a verified retry is still possible");
});

test("legacy remote End: retained capture remains verifiable after the authenticated room-end broadcast", async (t) => {
  const runtime = createLegacyMountedRuntime();
  let ended = 0;
  const harness = await mountLegacyHook(runtime, { enabled: true, onRoomEnded: () => { ended += 1; } });
  t.after(() => harness.unmount());
  const { track } = seedLocalTrack(runtime, harness, { enabled: true, refuseStop: true }, { sender: true });
  const channel = harness.refs.channelRef.current;
  await harness.run(() => channel.emitBroadcast("room:end", { fromUserId: runtime.remoteUserId, roomId: runtime.roomId, reason: "host-left" }));
  assert.equal(ended, 1);
  assert.equal(runtime.leaveCalls, 0, "broadcast captures cleanup, explicit End owns the durable mutation");
  await harness.rerender({ enabled: false });
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()), /cleanup|shutdown/u);
  assert.equal(runtime.leaveCalls, 1);
  track.refuseStop = false;
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(track.readyState, "ended");
});


// Actual mounted hook lifecycle with controlled SDK scheduling. These cases
// exercise cancellation and resource ownership, not native-device teardown.
async function mountRetiredMicrophoneCase(t) {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, { enabled: true, naturalLifecycle: true });
  assert.equal(harness.getResult().channelState, "live", "normal admission/channel startup must establish the call");
  const peer = harness.refs.peerConnectionsRef.current[runtime.remoteUserId];
  assert.ok(peer, "actual startup creates the remote peer without forcing live refs");
  let retired = false;
  const retire = async () => { if (!retired) { retired = true; await harness.unmount(); } };
  t.after(retire);
  return { runtime, harness, peer, retire };
}

async function startPendingMicrophone(harness) {
  let settlement;
  await act(async () => {
    settlement = harness.getResult().setMicrophoneEnabled(true)
      .then((value) => ({ value }), (error) => ({ error: String(error?.message ?? error) }));
    await settle(160);
  });
  return { settlement };
}

test("legacy retired microphone: pending forward SDP cancels without touching closed senders", async (t) => {
  const { runtime, harness, peer, retire } = await mountRetiredMicrophoneCase(t);
  seedLocalTrack(runtime, harness, { enabled: false, readyState: "ended" }, { sender: true });
  const sender = peer.getSenders().find((item) => item.track?.kind === "audio");
  const originalReplace = sender.replaceTrack;
  let closedSenderWrites = 0;
  sender.replaceTrack = async (track) => {
    if (peer.connectionState === "closed") { closedSenderWrites++; throw Error("closed sender cannot restore tracks"); }
    return originalReplace(track);
  };
  runtime.queueSend({ event: "webrtc:offer", answer: false });
  const { settlement } = await startPendingMicrophone(harness);
  assert.ok(runtime.negotiationTimeline.some((entry) => entry.event === "offer"));
  const acquired = peer.getSenders().find((item) => item.track?.kind === "audio").track;
  await retire();
  assert.deepEqual(await settlement, { value: false });
  assert.equal(closedSenderWrites, 0);
  assert.equal(acquired.readyState, "ended", "a target moved out of its created stream is still disposed");
  assert.equal(acquired.enabled, false);
});

test("legacy retired microphone: replacement-track completion cannot restore a retired transaction", async (t) => {
  const { runtime, harness, peer, retire } = await mountRetiredMicrophoneCase(t);
  seedLocalTrack(runtime, harness, { enabled: false, readyState: "ended" }, { sender: true });
  const sender = peer.getSenders().find((item) => item.track?.kind === "audio");
  const originalReplace = sender.replaceTrack;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let writes = 0;
  let acquired;
  sender.replaceTrack = async (track) => { writes++; acquired = track; await barrier; return originalReplace(track); };
  const { settlement } = await startPendingMicrophone(harness);
  assert.equal(writes, 1);
  await retire();
  await act(async () => { release(); await settle(160); });
  assert.deepEqual(await settlement, { value: false });
  assert.equal(writes, 1, "late completion cannot issue a second sender restoration");
  assert.equal(acquired.readyState, "ended");
});

test("legacy retired microphone: retirement during awaited rollback prevents later sender restorations", async (t) => {
  const { runtime, harness, peer, retire } = await mountRetiredMicrophoneCase(t);
  const { track, stream } = seedLocalTrack(runtime, harness, { enabled: false, readyState: "ended" }, { sender: true });
  const secondPeer = runtime.createPeer();
  harness.refs.peerConnectionsRef.current["zz-remote"] = secondPeer;
  const secondSender = secondPeer.addTrack(track, stream);
  const firstSender = peer.getSenders().find((item) => item.track?.kind === "audio");
  const firstReplace = firstSender.replaceTrack;
  const secondReplace = secondSender.replaceTrack;
  let firstWrites = 0;
  let secondWrites = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  firstSender.replaceTrack = async (next) => { firstWrites++; return firstReplace(next); };
  secondSender.replaceTrack = async (next) => {
    secondWrites++;
    if (secondWrites === 2) await barrier;
    return secondReplace(next);
  };
  runtime.queueSend({ event: "webrtc:offer", outcome: "error" });
  const { settlement } = await startPendingMicrophone(harness);
  assert.equal(secondWrites, 2, "the current owner reached its genuine rollback before retirement");
  assert.equal(firstWrites, 1);
  await retire();
  await act(async () => { release(); await settle(160); });
  assert.deepEqual(await settlement, { value: false });
  assert.equal(firstWrites, 1, "retirement during one native await prevents rollback of the next old sender");
});

test("legacy retired microphone: stale restore never re-enables a previously enabled captured track", async (t) => {
  const { runtime, harness, retire } = await mountRetiredMicrophoneCase(t);
  const { track } = seedLocalTrack(runtime, harness, { enabled: true });
  runtime.queueSend({ event: "webrtc:offer", answer: false });
  const { settlement } = await startPendingMicrophone(harness);
  assert.equal(track.enabled, false, "preparation locally mutes the existing track");
  await retire();
  assert.deepEqual(await settlement, { value: false });
  assert.equal(track.enabled, false, "retired rollback cannot replay the older enabled bit");
  assert.equal(track.readyState, "ended");
});

test("legacy retired microphone: unproved transaction capture disposal remains an explicit failure", async (t) => {
  const { runtime, harness, retire } = await mountRetiredMicrophoneCase(t);
  runtime.queueMedia({ audio: { refuseStop: true } });
  runtime.queueSend({ event: "webrtc:offer", answer: false });
  const { settlement } = await startPendingMicrophone(harness);
  const acquired = harness.refs.localStreamRef.current.getAudioTracks()[0];
  t.after(() => { acquired.refuseStop = false; acquired.stop(); });
  await retire();
  assert.deepEqual(await settlement, { error: "LEGACY_MIC_RETIRED_CAPTURE_DISPOSAL_UNVERIFIED" });
  assert.equal(acquired.readyState, "live", "an ignored native stop is not cleanup proof");
});

test("legacy current microphone: genuine rollback failure retains fail-closed error", async (t) => {
  const { runtime, harness, peer } = await mountRetiredMicrophoneCase(t);
  seedLocalTrack(runtime, harness, { enabled: false, readyState: "ended" }, { sender: true });
  const sender = peer.getSenders().find((item) => item.track?.kind === "audio");
  const originalReplace = sender.replaceTrack;
  let writes = 0;
  sender.replaceTrack = async (track) => { writes++; if (writes > 1) throw Error("native restoration rejected"); return originalReplace(track); };
  runtime.queueSend({ event: "webrtc:offer", outcome: "error" });
  const { settlement } = await startPendingMicrophone(harness);
  assert.deepEqual(await settlement, { error: "LEGACY_MIC_ROLLBACK_UNVERIFIED" });
  assert.equal(harness.refs.channelStateRef.current, "live", "this failure was not cancellation of a retired owner");
  assert.equal(runtime.durableMic, false);
  for (const stream of runtime.localStreams) for (const track of stream.getAudioTracks()) assert.equal(track.enabled, false);
});

test("legacy retired microphone: a late permission grant cannot acquire capture", async (t) => {
  const { runtime, harness, retire } = await mountRetiredMicrophoneCase(t);
  runtime.microphonePermission = deniedPermission();
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  runtime.queuePermission({ wait: barrier, permission: grantedPermission() });
  const capturesBefore = runtime.mediaCreateCalls.length;
  const requestsBefore = runtime.permissionRequestCalls;
  const { settlement } = await startPendingMicrophone(harness);
  assert.equal(runtime.permissionRequestCalls, requestsBefore + 1, "the real permission await is in flight");
  await retire();
  await act(async () => { release(); await settle(160); });
  assert.deepEqual(await settlement, { value: false });
  assert.equal(runtime.mediaCreateCalls.length, capturesBefore, "retired permission completion cannot start native capture");
});

async function mountEndingGenerationCase(t) {
  const runtime = createLegacyMountedRuntime({ remoteDurableCamera: true, remoteDurableMic: true });
  const harness = await mountLegacyHook(runtime, {
    enabled: true,
    naturalLifecycle: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
  });
  t.after(() => harness.unmount());
  assert.equal(harness.getResult().channelState, "live");
  assert.ok(runtime.localStreams.some((stream) => stream.getTracks().some((track) => track.readyState === "live")));
  return { runtime, harness };
}

function assertEndedGenerationHasNoMedia(runtime, harness, captures, peers) {
  assert.equal(harness.getResult().channelState, "idle");
  assert.equal(runtime.mediaCreateCalls.length, captures, "the retained ending generation cannot acquire new capture");
  assert.equal(runtime.peers.length, peers, "the retained ending generation cannot create a new native peer");
  assert.ok(runtime.localStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")));
  assert.ok(runtime.peers.every((peer) => peer.connectionState === "closed"));
}

test("legacy ending generation: post-End snapshot and presence render cannot resurrect capture", async (t) => {
  const { runtime, harness } = await mountEndingGenerationCase(t);
  const captures = runtime.mediaCreateCalls.length;
  const peers = runtime.peers.length;
  const channel = harness.refs.channelRef.current;
  await harness.run(() => harness.getResult().leaveRoom());
  const reads = runtime.snapshotReads;
  await harness.run(() => harness.refs.refreshSnapshot(runtime.roomId));
  await harness.run(() => channel.emitPresenceState({
    [runtime.remoteUserId]: { metas: [{ phx_ref: "remote-after-end", cameraOn: true, micOn: true }] },
  }));
  assertEndedGenerationHasNoMedia(runtime, harness, captures, peers);
  assert.equal(runtime.snapshotReads, reads, "ended retained state must not launch another authoritative read");
});

test("legacy ending generation: a pending Presence render cannot start peers after End", async (t) => {
  const { runtime, harness } = await mountEndingGenerationCase(t);
  const captures = runtime.mediaCreateCalls.length;
  const peers = runtime.peers.length;
  const channel = harness.refs.channelRef.current;
  await act(async () => {
    channel.emitPresenceState({
      [runtime.remoteUserId]: { metas: [{ phx_ref: "remote-at-end", cameraOn: true, micOn: true }] },
      [runtime.userId]: { metas: [{ phx_ref: "local-at-end", cameraOn: true, micOn: true }] },
    });
    await harness.getResult().leaveRoom();
    await settle(160);
  });
  assertEndedGenerationHasNoMedia(runtime, harness, captures, peers);
});

test("legacy ending generation: getUserMedia begun before End disposes its late capture", async (t) => {
  const runtime = createLegacyMountedRuntime();
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  runtime.queueMedia({ wait: barrier });
  const harness = await mountLegacyHook(runtime, {
    enabled: true,
    naturalLifecycle: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
  });
  t.after(() => harness.unmount());
  assert.equal(runtime.mediaCreateCalls.length, 1, "actual initial acquisition is pending");
  assert.equal(runtime.localStreams.length, 0);
  assert.ok(harness.refs.joinedMembershipRef.current, "authority was admitted before acquisition");
  await assert.rejects(() => harness.run(() => harness.getResult().leaveRoom()), /shutdown/,
    "End cannot claim native completion before the pending acquisition returns");
  await act(async () => { release(); await settle(160); });
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(runtime.localStreams.length, 1, "the delayed native result actually arrived");
  assertEndedGenerationHasNoMedia(runtime, harness, 1, 0);
  assert.equal(runtime.channels.length, 0, "retired initialization cannot subscribe after capture arrives");
});

test("legacy ending generation: a snapshot queued before End cannot project afterward", async (t) => {
  const { runtime, harness } = await mountEndingGenerationCase(t);
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  runtime.queueSnapshot({ wait: barrier });
  let pending;
  await act(async () => { pending = harness.refs.refreshSnapshot(runtime.roomId); await settle(32); });
  const captures = runtime.mediaCreateCalls.length;
  const peers = runtime.peers.length;
  await harness.run(() => harness.getResult().leaveRoom());
  await act(async () => { release(); await pending; await settle(160); });
  assertEndedGenerationHasNoMedia(runtime, harness, captures, peers);
});

test("legacy ending generation: foreground and retained heartbeat after End cannot restart work", async (t) => {
  const { runtime, harness } = await mountEndingGenerationCase(t);
  const captures = runtime.mediaCreateCalls.length;
  const peers = runtime.peers.length;
  const heartbeatCallbacks = runtime.intervals.filter((entry) => entry?.delay === 15_000).map((entry) => entry.callback);
  assert.ok(heartbeatCallbacks.length, "actual mounted lifecycle installed its membership heartbeat");
  await harness.run(() => harness.getResult().leaveRoom());
  const heartbeats = runtime.heartbeatCalls.length;
  await harness.run(() => runtime.emitAppState("background"));
  await harness.run(() => runtime.emitAppState("active"));
  await harness.run(() => { for (const callback of heartbeatCallbacks) callback(); });
  assertEndedGenerationHasNoMedia(runtime, harness, captures, peers);
  assert.equal(runtime.heartbeatCalls.length, heartbeats);
});

test("legacy ending generation: failed End stays terminal locally and exact End remains retryable", async (t) => {
  const { runtime, harness } = await mountEndingGenerationCase(t);
  runtime.leaveActions.push({ outcome: "reject" });
  const captures = runtime.mediaCreateCalls.length;
  const peers = runtime.peers.length;
  await assert.rejects(harness.run(() => harness.getResult().leaveRoom()), /durable leave unavailable/u);
  await harness.run(() => harness.refs.refreshSnapshot(runtime.roomId));
  assertEndedGenerationHasNoMedia(runtime, harness, captures, peers);
  await harness.run(() => harness.getResult().leaveRoom());
  assert.equal(runtime.leaveCalls, 2);
  assert.equal(runtime.leaveRequests[1].expectedMembershipGeneration, runtime.leaveRequests[0].expectedMembershipGeneration);
  assertEndedGenerationHasNoMedia(runtime, harness, captures, peers);
});

test("legacy ending generation: an explicit new room can establish fresh media after End", async (t) => {
  const { runtime, harness } = await mountEndingGenerationCase(t);
  await harness.run(() => harness.getResult().leaveRoom());
  const captures = runtime.mediaCreateCalls.length;
  const peers = runtime.peers.length;
  runtime.roomId = "ROOM-FRESH-AFTER-END";
  await harness.rerender({ roomId: runtime.roomId });
  assert.equal(harness.getResult().channelState, "live");
  assert.ok(runtime.mediaCreateCalls.length > captures);
  assert.ok(runtime.peers.length > peers);
  assert.ok(runtime.localStreams.some((stream) => stream.getTracks().some((track) => track.readyState === "live")));
  assert.equal(runtime.joinCalls.at(-1).roomId, runtime.roomId);
});

for (const throwRuntimeErrors of [false, true]) {
  test(`legacy capture preserves the identical native rejection and one bounded report: reporter throws ${throwRuntimeErrors}`, async t => {
    const runtime = createLegacyMountedRuntime({ throwRuntimeErrors });
    const harness = await mountLegacyHook(runtime);
    t.after(() => harness.unmount());
    const original = Object.assign(new Error("PRIVATE-CAPTURE-DETAIL-AND-TOKEN"), {
      name: "NotReadableError", domain: "AVFoundationErrorDomain", code: -11819,
    });
    runtime.queueMedia({ outcome: "reject", error: original });
    await assert.rejects(() => harness.run(() => harness.refs.acquireOwnedLegacyMedia({
      audio: true, video: false, facingMode: "environment",
    })), error => error === original, "diagnostic reporting cannot replace the native exception");
    const reports = runtime.errors.filter(report => report.scope === "communication-native-capture");
    assert.equal(reports.length, 1, "the acquisition boundary reports the cause exactly once");
    assert.equal(reports[0].metadata.nativeErrorName, "NotReadableError");
    assert.equal(reports[0].metadata.nativeErrorCode, -11819);
    assert.equal(reports[0].metadata.audio, true);
    assert.equal(reports[0].metadata.video, false);
    assert.equal(reports[0].metadata.appState, "active");
    assert.equal(JSON.stringify(reports).includes(original.message), false);
  });
}
