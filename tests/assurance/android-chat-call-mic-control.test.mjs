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

const contract = JSON.parse(fs.readFileSync("config/assurance/android-chat-call-mic-control-v1.json", "utf8"));
const legacyHookSource = fs.readFileSync("hooks/use-communication-room-session.ts", "utf8");
const legacyRefMarker = "  const microphonePermissionRef = useRef<MediaPermissionSnapshot>(microphonePermission);";
assert.equal(legacyHookSource.split(legacyRefMarker).length - 1, 1, "unique legacy ref exposure marker");
const instrumentedLegacyHookSource = legacyHookSource.replace(
  legacyRefMarker,
  `${legacyRefMarker}\n  (globalThis as any).__chillywoodLegacyMicAssuranceRefs = { channelRef, channelStateRef, identityRef, localStreamRef, micEnabledRef, microphonePermissionRef, peerConnectionsRef, roomRef, setChannelState, setLoading };`,
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
    broadcasts: [],
    cameraPermission: grantedPermission(),
    channels: [],
    cleanupCalls: 0,
    durableMic: false,
    errors: [],
    intervals: [],
    localStreams: [],
    mediaActions: [],
    mediaCreateCalls: [],
    membershipActions: [],
    membershipTouches: [],
    microphonePermission: options.microphonePermission ?? grantedPermission(),
    peerConnectionState: options.peerConnectionState ?? "connected",
    peers: [],
    permissionActions: [],
    presenceTracks: [],
    remoteUserId: "remote-user",
    roomEndCalls: 0,
    roomId: "ROOM-LEGACY",
    senderAdds: 0,
    senderReplacements: 0,
    timeoutCallbacks: [],
    tokenRequests: 0,
    userId: "local-user",
  };

  let nextTrackId = 0;
  let nextStreamId = 0;

  class FakeTrack {
    constructor(kind, trackOptions = {}) {
      this.enabled = trackOptions.enabled ?? true;
      this.id = `${kind}-${++nextTrackId}`;
      this.kind = kind;
      this.muted = false;
      this.readyState = trackOptions.readyState ?? "live";
    }

    stop() {
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
      if (!this.tracks.some((candidate) => candidate.id === track.id)) this.tracks.push(track);
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

    addEventListener(event, listener) { this.listeners.set(event, listener); }
    addIceCandidate() { return Promise.resolve(); }
    addTrack(track) {
      runtime.senderAdds += 1;
      const sender = {
        track,
        replaceTrack: async (replacement) => {
          runtime.senderReplacements += 1;
          sender.track = replacement;
        },
      };
      this.senders.push(sender);
      return sender;
    }
    close() { this.connectionState = "closed"; }
    async createAnswer() { return { sdp: "answer", type: "answer" }; }
    async createOffer() { this.offerCalls += 1; return { sdp: "offer", type: "offer" }; }
    getReceivers() { return this.receivers; }
    getSenders() { return this.senders; }
    getStats() { return Promise.resolve([]); }
    getTransceivers() { return []; }
    async setLocalDescription(description) { this.localDescription = description; }
    async setRemoteDescription() { return undefined; }
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
  runtime.createPeer = () => new FakePeerConnection();

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
    makeMembership(runtime),
    makeMembership(runtime, { userId: runtime.remoteUserId }),
  ];

  class FakeChannel {
    constructor(topic) {
      this.handlers = [];
      this.topic = topic;
      runtime.channels.push(this);
    }

    on(...args) { this.handlers.push(args); return this; }
    presenceState() {
      return {
        [runtime.userId]: [{ displayName: "Local", joinedAt: "2026-08-11T00:00:00.000Z", micOn: runtime.durableMic, userId: runtime.userId }],
        [runtime.remoteUserId]: [{ displayName: "Remote", isHost: true, joinedAt: "2026-08-11T00:00:00.000Z", micOn: false, userId: runtime.remoteUserId }],
      };
    }
    async send(message) { runtime.broadcasts.push(message); return "ok"; }
    subscribe(callback) {
      if (typeof callback === "function") void Promise.resolve().then(() => callback("SUBSCRIBED"));
      return this;
    }
    async track(payload) { runtime.presenceTracks.push(payload); return "ok"; }
    async untrack() { return "ok"; }
  }

  const AppState = {
    addEventListener: () => ({ remove: () => undefined }),
    get currentState() { return runtime.appState; },
  };
  const requestCameraPermission = async () => runtime.cameraPermission;
  const getCameraPermission = async () => runtime.cameraPermission;

  const moduleMocks = {
    "../_lib/accessEntitlements": { resolveRoomAccess: async () => ({ isAllowed: true }) },
    "../_lib/analytics": { trackEvent: () => undefined },
    "../_lib/communication": {
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
      getCommunicationRoomSnapshot: async () => ({ memberships: activeMemberships(), room: makeRoom(runtime) }),
      getCommunicationRTCModule: () => rtc,
      getCommunicationStreamURL: (stream) => stream?.toURL?.() ?? "",
      getCommunicationTrack: getTrack,
      joinCommunicationRoomSession: async () => makeMembership(runtime),
      leaveCommunicationRoomSession: async () => null,
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
        if (action.outcome === "reject") throw new Error("membership rejected");
        if (action.outcome === "null") return null;
        runtime.durableMic = !!input.micEnabled;
        return makeMembership(runtime, { cameraEnabled: !!input.cameraEnabled, micEnabled: runtime.durableMic });
      },
    },
    "../_lib/communicationCallMediaPolicy.mjs": {
      canAttemptNativeCallBackgroundAudio: () => false,
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
      registerActiveMediaSessionStopper: () => () => { runtime.cleanupCalls += 1; },
    },
    "../_lib/performancePolicy": { ROOM_HEARTBEAT_MS: 15_000 },
    "../_lib/roomRules": { normalizeRoomMembershipState: (value) => value },
    "../_lib/supabase": {
      supabase: {
        channel: (topic) => new FakeChannel(topic),
        getChannels: () => runtime.channels,
        removeChannel: () => undefined,
      },
    },
    "expo-av": {
      Audio: {
        getPermissionsAsync: async () => runtime.microphonePermission,
        requestPermissionsAsync: async () => {
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
    clearTimeout: (id) => { runtime.timeoutCallbacks[id - 1] = null; },
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
    setTimeout: (callback) => {
      runtime.timeoutCallbacks.push(callback);
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
  refs.channelRef.current = runtime.createChannel("legacy-mic-exact-channel");
  refs.channelStateRef.current = "live";
  refs.identityRef.current = { avatarUrl: null, displayName: "Local", userId: runtime.userId };
  refs.roomRef.current = makeRoom(runtime);
  refs.peerConnectionsRef.current[runtime.remoteUserId] = runtime.createPeer();
  await act(async () => {
    refs.setLoading(false);
    refs.setChannelState("live");
    await settle(48);
  });
  assert.equal(committedResult?.channelState, "live", "legacy exact hook reaches the release media state");
  assert.equal(runtime.peers.length, 1, "legacy exact hook creates the expected existing remote peer");

  return {
    getResult: () => committedResult,
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
      passed: 10,
      total: 10,
    });
    assert.equal(evidence.legacyReachability.status, "REACHABLE_PUBLIC_DEFAULT");
    assert.equal(evidence.source.files, 4);
  }
  assert.equal(new Set(runs.map((run) => run.deterministicEvidenceSha256)).size, 1);
  assert.equal(uiModel({ micEnabled: true }).next, false);
  assert.equal(liveKitModel({ connected: true, current: false, next: true, audioSession: true, publication: true }).ok, true);
  assert.equal(legacyModel({ current: true, next: false, track: true }).ok, true);
});

test("release-reachable legacy permission recovery attaches exactly one usable microphone sender", async (t) => {
  const runtime = createLegacyMountedRuntime({ microphonePermission: deniedPermission() });
  runtime.queuePermission(grantedPermission());
  const harness = await mountLegacyHook(runtime);
  t.after(() => harness.unmount());

  assert.equal(runtime.peers[0].connectionState, "connected");
  assert.equal(runtime.peers[0].getSenders().filter((sender) => sender.track?.kind === "audio").length, 0);
  assert.equal(harness.getResult().micEnabled, false);

  const updated = await harness.run(() => harness.getResult().setMicrophoneEnabled(true));
  const usableLocalAudio = runtime.localStreams
    .flatMap((stream) => stream.getAudioTracks())
    .filter((track) => track.enabled && track.readyState !== "ended");
  const usableAudioSenders = runtime.peers[0].getSenders()
    .filter((sender) => sender.track?.kind === "audio" && sender.track.enabled && sender.track.readyState !== "ended");

  assert.equal(updated, true, "permission-restored microphone request reports product success");
  assert.equal(harness.getResult().micEnabled, true, "permission-restored microphone request updates UI state");
  assert.equal(runtime.durableMic, true, "permission-restored microphone request updates durable membership");
  assert.equal(usableLocalAudio.length, 1, "permission recovery creates one usable local microphone track");
  assert.equal(runtime.roomEndCalls, 0, "microphone recovery does not terminate the call");
  assert.equal(runtime.tokenRequests, 0, "legacy microphone recovery does not request a provider token");
  assert.equal(
    usableAudioSenders.length,
    1,
    "ANDROID_MIC_LEGACY_NEW_STREAM_NOT_ATTACHED_TO_EXISTING_PEERS: product success requires one usable sender on the connected peer",
  );
});
