#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

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
const hostClearTimeout = globalThis.clearTimeout;
const hostSetTimeout = globalThis.setTimeout;

const contract = JSON.parse(fs.readFileSync("config/assurance/android-chat-call-mic-control-v1.json", "utf8"));
const legacyHookSource = fs.readFileSync("hooks/use-communication-room-session.ts", "utf8");
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
  `${legacyRefMarker}\n  (globalThis as any).__chillywoodLegacyMicAssuranceRefs = { appStateLifecycleHandlerRef, auxiliaryStreamsRef, cameraEnabledRef, channelRef, channelStateRef, identityRef, legacyMicAnswerWaitersRef, legacyMicControlRef, legacyMicLocalPrivacyStopRef, legacySessionGenerationRef, localStreamRef, micEnabledRef, microphonePermissionRef, nativePermissionRequestDepthRef, peerConnectionsRef, roomRef, setChannelState, setLoading };`,
).replace(
  legacyOfferQueueMarker,
  `  (globalThis as any).__chillywoodLegacyMicAssuranceRefs.runSerializedPeerOffer = runSerializedPeerOffer;\n${legacyOfferQueueMarker}`,
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
    appState: "active",
    appStateListeners: [],
    broadcasts: [],
    cameraPermission: grantedPermission(),
    channels: [],
    cleanupCalls: 0,
    durableCamera: false,
    durableMic: false,
    errors: [],
    intervals: [],
    joinCalls: [],
    localStreams: [],
    mediaActions: [],
    mediaSessionStopper: null,
    mediaCreateCalls: [],
    membershipActions: [],
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
    remoteUserId: "remote-user",
    roomEndCalls: 0,
    roomId: "ROOM-LEGACY",
    senderAdds: 0,
    senderRemoves: 0,
    senderReplacements: 0,
    removedChannels: [],
    sendActions: [],
    snapshotActions: [],
    timeoutHandles: [],
    timeoutCallbacks: [],
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
      this.senders = [];
      this.signalingState = "stable";
      runtime.peers.push(this);
    }

    addEventListener(event, listener) {
      const listeners = this.listeners.get(event) ?? new Set();
      listeners.add(listener);
      this.listeners.set(event, listeners);
    }
    addIceCandidate() { return Promise.resolve(); }
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
    close() { this.connectionState = "closed"; }
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
    emit(event) { for (const listener of this.listeners.get(event) ?? []) listener(); }
    async setLocalDescription(description) {
      if (this.failSetLocalDescription && description?.type !== "rollback") throw new Error("setLocalDescription rejected");
      if (this.failRollback && description?.type === "rollback") throw new Error("rollback rejected");
      this.localDescription = description;
      if (description?.type === "offer") this.signalingState = "have-local-offer";
      if (description?.type === "rollback") {
        this.localDescription = null;
        this.signalingState = "stable";
      }
      this.emit("signalingstatechange");
    }
    async setRemoteDescription(description) {
      if (description?.type === "answer") this.signalingState = "stable";
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
    if (action.outcome === "reject") throw new Error("media creation rejected");
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
    constructor(topic) {
      this.handlers = [];
      this.subscriptionCallback = null;
      this.topic = topic;
      runtime.channels.push(this);
    }

    on(...args) { this.handlers.push(args); return this; }
    async emitBroadcast(event, payload) {
      const callbacks = this.handlers
        .filter(([type, filter]) => type === "broadcast" && filter?.event === event)
        .map(([, , callback]) => callback);
      for (const callback of callbacks) await callback({ payload });
    }
    presenceState() {
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
      const action = runtime.presenceTrackActions.shift() ?? {};
      action.mutate?.({ payload, runtime });
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
    "../_lib/accessEntitlements": { resolveRoomAccess: async () => ({ isAllowed: true }) },
    "../_lib/analytics": { trackEvent: () => undefined },
    "../_lib/communication": {
      broadcastCommunicationRoomSignal: async ({ event, payload, roomId }) => {
        const channel = runtime.readAssuranceRefs?.().channelRef.current ?? runtime.channels.at(-1);
        if (!channel) return false;
        const result = await channel.send({
          event,
          payload: {
            ...payload,
            fromUserId: runtime.userId,
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
      joinCommunicationRoomSession: async (input) => {
        runtime.joinCalls.push({ ...input });
        return makeMembership(runtime, {
          cameraEnabled: !!input.cameraEnabled,
          micEnabled: !!input.micEnabled,
        });
      },
      leaveCommunicationRoomSession: async () => {
        await options.leaveBarrier;
        return null;
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
      canAttemptNativeCallBackgroundAudio: () => false,
      resolveLegacyChatSessionRecovery: ({ alreadyRequested, enabled, ending, generationIsCurrent }) => (
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
      shouldPreserveNativeCallBackgroundAudio: () => false,
    },
    "../_lib/logger": { reportRuntimeError: (scope, error) => runtime.errors.push({ message: String(error?.message ?? error), scope }) },
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
        channel: (topic) => new FakeChannel(topic),
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
          runtime.microphonePermission = runtime.permissionActions.shift() ?? runtime.microphonePermission;
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
    clearInterval: () => undefined,
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
    setInterval: (callback) => {
      runtime.intervals.push(callback);
      return runtime.intervals.length;
    },
    setTimeout: (callback, delay) => {
      runtime.timeoutCallbacks.push(callback);
      runtime.timeoutHandles.push(options.fireOperationTimeouts && (delay === 3_000 || delay === 4_000) ? hostSetTimeout(callback, 1) : null);
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
  refs.channelRef.current ??= runtime.createChannel("legacy-mic-exact-channel");
  refs.channelStateRef.current = "live";
  refs.identityRef.current ??= { avatarUrl: null, displayName: "Local", userId: runtime.userId };
  refs.roomRef.current ??= makeRoom(runtime);
  refs.peerConnectionsRef.current[runtime.remoteUserId] ??= runtime.createPeer();
  await act(async () => {
    refs.setLoading(false);
    refs.setChannelState("live");
    await settle(48);
  });
  assert.equal(committedResult?.channelState, "live", "legacy exact hook reaches the release media state");
  assert.ok(runtime.peers.length >= 1, "legacy exact hook creates the expected existing remote peer");

  return {
    getResult: () => committedResult,
    refs,
    run: async (operation) => {
      let value;
      await act(async () => {
        value = await operation();
        await settle(48);
      });
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
  { id: "presence_track_error_compensates", setup: (runtime) => runtime.queuePresenceTrack({ outcome: "error" }), expected: false },
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

test("legacy snapshot authority: room-state Realtime terminal status is observable and enters bounded recovery", async (t) => {
  const runtime = createLegacyMountedRuntime();
  const harness = await mountLegacyHook(runtime, {
    authenticatedAccessToken: "exact-access-token",
    authenticatedUserId: runtime.userId,
    enabled: true,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: false },
    restartDisconnectedSession: true,
  });
  t.after(() => harness.unmount());
  const stateChannel = runtime.channels.find((channel) => channel.topic === `comm-room-state-${runtime.roomId}`);
  assert.ok(stateChannel);

  await harness.run(() => stateChannel.emitSubscriptionStatus("CHANNEL_ERROR", new Error("state channel rejected")));

  assert.equal(runtime.errors.some((entry) => entry.scope === "communication-snapshot-subscription"), true);
  assert.ok(runtime.timeoutCallbacks.some(Boolean), "state-channel failure schedules the generation-deduplicated session recovery");
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

test("legacy call-domain closure: background lifecycle commits camera false and catches controller rejection", () => {
  const stopperBlock = legacyHookSource.match(/registerActiveMediaSessionStopper\(async \(reason\) => \{[\s\S]*?\n    \}\);/u)?.[0] ?? "";
  assert.match(stopperBlock, /try \{[\s\S]*?await legacyMicControlRef\.current\?\.\(\s*LEGACY_BACKGROUND_MEDIA_STATE\.micEnabled,\s*LEGACY_BACKGROUND_MEDIA_STATE\.cameraEnabled,\s*\)[\s\S]*?\} catch \(error\) \{/u);
  assert.match(stopperBlock, /catch \(error\) \{\s*legacyMicLocalPrivacyStopRef\.current\?\.\(\);/u);
  assert.match(stopperBlock, /reportRuntimeError\("communication-media-session-background"/u);
  assert.match(legacyHookSource, /const LEGACY_BACKGROUND_MEDIA_STATE = \{\s*cameraEnabled: false,\s*micEnabled: false,/u);
  assert.match(legacyHookSource, /legacyMicControlRef\.current\?\.\(true, false\)/u);
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
