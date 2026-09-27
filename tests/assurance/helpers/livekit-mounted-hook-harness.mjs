import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const ts = require("typescript");
const { act, useLayoutEffect } = React;
const { createRoot } = require("react-dom/client");

const hookSource = fs.readFileSync("hooks/use-livekit-chat-call-session.ts", "utf8");
const compiledHook = ts.transpileModule(hookSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "hooks/use-livekit-chat-call-session.ts",
}).outputText;

const audioRoutingSource = fs.readFileSync("_lib/livekit/audioRouting.ts", "utf8");
const compiledAudioRouting = ts.transpileModule(audioRoutingSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "_lib/livekit/audioRouting.ts",
}).outputText;

const loadActualAudioRouting = (LiveKitAudioSession, platformOS) => {
  const commonJsModule = { exports: {} };
  vm.runInNewContext(compiledAudioRouting, {
    console,
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: (specifier) => {
      if (specifier === "./react-native-module") return { LiveKitAudioSession };
      if (specifier === "react-native") return { Platform: { OS: platformOS } };
      throw new Error(`UNEXPECTED_AUDIO_ROUTING_IMPORT:${specifier}`);
    },
  }, { filename: "_lib/livekit/audioRouting.ts" });
  return commonJsModule.exports;
};

export const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, reject, resolve };
};

const settle = async (turns = 16) => {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
};

const installMinimalDom = () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (globalThis.document?.__chillywoodMountedHookDocument) return;
  const noop = () => undefined;
  const documentStub = {
    __chillywoodMountedHookDocument: true,
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

const membership = (runtime, overrides = {}) => ({
  avatarUrl: null,
  cameraEnabled: runtime.durableCamera,
  displayName: "Local",
  joinedAt: "2026-08-11T00:00:00.000Z",
  lastSeenAt: "2026-08-11T00:00:00.000Z",
  leftAt: null,
  membershipState: "active",
  micEnabled: runtime.durableMic,
  role: "participant",
  roomId: runtime.roomId,
  userId: runtime.userId,
  ...overrides,
});

const productRoom = (runtime, overrides = {}) => ({
  callType: "audio",
  createdAt: "2026-08-11T00:00:00.000Z",
  hostUserId: "remote-user",
  mediaProvider: "livekit",
  roomCode: runtime.roomId,
  roomId: runtime.roomId,
  status: "active",
  ...overrides,
});

const makeTrack = (kind, onStop = () => undefined) => ({
  kind,
  mediaStreamTrack: { readyState: "live" },
  stop() {
    this.mediaStreamTrack.readyState = "ended";
    onStop();
  },
});

const makePublication = (enabled, kind, track = makeTrack(kind)) => enabled
  ? { isMuted: false, source: kind, track }
  : undefined;

export function createLiveKitMountedRuntime(options = {}) {
  const acceptedMediaDescriptors = new WeakSet();
  const runtime = {
    appState: "active",
    appStateListener: null,
    audioOutputActions: [],
    audioOutputCalls: [],
    audioOutputEnumerationActions: [],
    audioOutputEnumerations: 0,
    nativeAudioOutput: null,
    nativeAudioOutputCommands: [],
    nativeAudioSelectionActions: [],
    audioResetActions: [],
    audioResetCalls: 0,
    audioStopActions: [],
    audioStopCalls: 0,
    iosAudioConfigurationActive: false,
    nativeAudioSessionActive: false,
    cameraActions: [],
    cameraCalls: [],
    cameraLifecycleEvents: [],
    cameraUnpublishActions: [],
    cameraUnpublishes: [],
    cameraPermissionActions: [],
    cameraPermissionReads: 0,
    cameraPermissionState: options.cameraPermissionState ?? "denied",
    cleanupRegistrations: [],
    durableCamera: options.initialCamera ?? false,
    durableMic: options.initialMic ?? false,
    disconnectActions: [],
    errors: [],
    heartbeatCallbacks: [],
    identityReads: 0,
    intervalsCleared: 0,
    liveKitDataPublishes: [],
    membershipLeaveActions: [],
    membershipLeaves: 0,
    membershipTouches: [],
    mediaBroadcasts: [],
    micCalls: [],
    microphonePermissionReads: 0,
    microphonePermissionState: options.microphonePermissionState ?? "denied",
    microphonePermissionActions: [],
    nativeApplicationActive: options.nativeApplicationActive ?? true,
    nativeApplicationActiveActions: [],
    nativeApplicationActiveReads: 0,
    platformOS: options.platformOS ?? "android",
    realtimeAuthTokens: [],
    realtimeChannels: [],
    realtimeRemovedChannels: [],
    remoteIncludedInSnapshot: options.snapshotRemoteParticipant ?? options.initialRemoteParticipant ?? false,
    remoteUserId: options.remoteUserId ?? "remote-user",
    remoteDurableCamera: options.remoteCamera ?? true,
    remoteDurableMic: options.remoteMic ?? true,
    remoteCameraConverged: true,
    nativeActions: [],
    trackRestartActions: [],
    trackRestarts: [],
    nextSnapshotActions: [],
    nextTouchActions: [],
    providerTokenCalls: 0,
    roomId: "ROOM-1",
    rooms: [],
    snapshotReads: 0,
    stages: [],
    settingsCalls: 0,
    timeoutCallbacks: [],
    timeoutDelays: [],
    userId: options.userId ?? "local-user",
  };

  runtime.createAcceptedMediaDescriptor = (overrides = {}) => {
    const descriptor = Object.freeze({
      authenticatedUserId: runtime.userId,
      callUuid: "call-uuid",
      claimId: "claim-id",
      inviteId: "invite-1",
      mediaProvider: "livekit",
      nativeEventGeneration: 1,
      platform: "ios",
      roomId: runtime.roomId,
      source: "ios_callkit_native_event",
      threadId: "thread-1",
      ...overrides,
    });
    acceptedMediaDescriptors.add(descriptor);
    return descriptor;
  };

  runtime.queueCamera = (action) => runtime.cameraActions.push(action);
  runtime.queueCameraUnpublish = (action) => runtime.cameraUnpublishActions.push(action);
  runtime.queueCameraPermission = (action) => runtime.cameraPermissionActions.push(action);
  runtime.queueDisconnect = (action) => runtime.disconnectActions.push(action);
  runtime.queueAudioOutput = (action) => runtime.audioOutputActions.push(action);
  runtime.queueAudioOutputEnumeration = (action) => runtime.audioOutputEnumerationActions.push(action);
  runtime.queueNativeAudioSelection = (action) => runtime.nativeAudioSelectionActions.push(action);
  runtime.queueAudioReset = (action) => runtime.audioResetActions.push(action);
  runtime.queueAudioStop = (action) => runtime.audioStopActions.push(action);
  runtime.queueMembershipLeave = (action) => runtime.membershipLeaveActions.push(action);
  runtime.queueNativeApplicationActive = (action) => runtime.nativeApplicationActiveActions.push(action);
  runtime.queueNative = (action) => runtime.nativeActions.push(action);
  runtime.queueTrackRestart = (action) => runtime.trackRestartActions.push(action);
  runtime.queueMicrophonePermission = (action) => runtime.microphonePermissionActions.push(action);
  runtime.queueSnapshot = (action) => runtime.nextSnapshotActions.push(action);
  runtime.queueTouch = (action) => runtime.nextTouchActions.push(action);
  runtime.interruptLocalCapture = (source) => {
    const participant = runtime.rooms.at(-1)?.localParticipant;
    if (!participant) throw new Error("MOUNTED_LIVEKIT_ROOM_NOT_READY");
    const wasUnmuted = participant.getTrackPublication(source)?.isMuted === false;
    if (source === "camera") {
      participant.cameraTrack.stop();
      participant.cameraEnabled = false;
      participant.interruptedUnmutedCameraPublication = wasUnmuted;
      runtime.remoteCameraConverged = false;
    } else {
      participant.micTrack.stop();
      participant.micEnabled = false;
      participant.interruptedUnmutedMicrophonePublication = wasUnmuted;
    }
  };
  runtime.publishCameraLate = () => {
    const room = runtime.rooms.at(-1);
    if (!room) throw new Error("MOUNTED_LIVEKIT_ROOM_NOT_READY");
    room.localParticipant.cameraEnabled = true;
    room.localParticipant.cameraPublicationPresent = true;
    room.localParticipant.cameraTrack.mediaStreamTrack.readyState = "live";
    return {
      isMuted: false,
      source: "camera",
      track: room.localParticipant.cameraTrack,
    };
  };
  runtime.dropCameraPublication = () => {
    const room = runtime.rooms.at(-1);
    if (!room) throw new Error("MOUNTED_LIVEKIT_ROOM_NOT_READY");
    room.localParticipant.cameraEnabled = false;
    room.localParticipant.cameraPublicationPresent = false;
    room.localParticipant.cameraTrack.mediaStreamTrack.readyState = "ended";
  };
  runtime.deferNative = () => {
    const gate = deferred();
    runtime.queueNative({ gate, outcome: "success" });
    return gate;
  };
  runtime.deferAudioOutput = () => {
    const gate = deferred();
    runtime.queueAudioOutput({ gate, outcome: "success" });
    return gate;
  };
  runtime.deferAudioOutputEnumeration = () => {
    const gate = deferred();
    runtime.queueAudioOutputEnumeration({ gate, outcome: "success" });
    return gate;
  };
  runtime.deferNativeAudioSelection = () => {
    const gate = deferred();
    runtime.queueNativeAudioSelection({ gate, outcome: "success" });
    return gate;
  };
  runtime.deferAudioStop = () => {
    const gate = deferred();
    runtime.queueAudioStop({ gate, outcome: "success" });
    return gate;
  };
  runtime.deferAudioReset = () => {
    const gate = deferred();
    runtime.queueAudioReset({ gate, outcome: "success" });
    return gate;
  };
  runtime.deferNativeApplicationActive = (outcome = true) => {
    const gate = deferred();
    runtime.queueNativeApplicationActive({ gate, outcome });
    return gate;
  };
  runtime.deferCamera = () => {
    const gate = deferred();
    runtime.queueCamera({ gate, outcome: "success" });
    return gate;
  };
  runtime.deferCameraPermission = (state = runtime.cameraPermissionState) => {
    const gate = deferred();
    runtime.queueCameraPermission({ gate, state });
    return gate;
  };
  runtime.deferMicrophonePermission = (state = runtime.microphonePermissionState) => {
    const gate = deferred();
    runtime.queueMicrophonePermission({ gate, state });
    return gate;
  };
  runtime.deferTouch = (outcome = "success") => {
    const gate = deferred();
    runtime.queueTouch({ gate, outcome });
    return gate;
  };
  runtime.deferSnapshot = () => {
    const gate = deferred();
    runtime.queueSnapshot({ gate, outcome: "active" });
    return gate;
  };

  class FakeRemoteParticipant {
    constructor() {
      this.identity = runtime.remoteUserId;
      this.name = "Remote";
      this.cameraEnabled = options.remoteCamera ?? true;
      this.micEnabled = options.remoteMic ?? true;
      this.cameraTrack = makeTrack("video");
      this.micTrack = makeTrack("audio");
    }

    getTrackPublication(source) {
      return source === "camera"
        ? makePublication(this.cameraEnabled, "video", this.cameraTrack)
        : makePublication(this.micEnabled, "audio", this.micTrack);
    }
  }

  class FakeLocalParticipant {
    constructor() {
      this.identity = runtime.userId;
      this.name = "Local";
      this.cameraEnabled = runtime.durableCamera;
      this.cameraGeneration = runtime.durableCamera ? 1 : 0;
      this.cameraPublicationPresent = runtime.durableCamera;
      this.cameraWasMuted = false;
      this.micEnabled = runtime.durableMic;
      this.cameraTrack = this.createLocalTrack("video");
      this.micTrack = this.createLocalTrack("audio");
    }

    createLocalTrack(kind) {
      const participant = this;
      let stopGeneration = 0;
      const track = makeTrack(kind, () => {
        stopGeneration += 1;
        // LocalTrack.stop ends capture but does not mute/remove its publication.
        // An obsolete track object cannot change a newer publication's state.
        if (kind === "video" && participant.cameraTrack === track) {
          participant.interruptedUnmutedCameraPublication ||= participant.cameraEnabled;
          participant.cameraEnabled = false;
        } else if (kind === "audio" && participant.micTrack === track) {
          participant.interruptedUnmutedMicrophonePublication ||= participant.micEnabled;
          participant.micEnabled = false;
        }
      });
      track.restartTrack = async () => {
        const generationBeforeRestart = stopGeneration;
        runtime.trackRestarts.push({ kind, participant, track });
        const action = runtime.trackRestartActions.shift() ?? { outcome: "success" };
        if (action.gate) await action.gate.promise;
        if (action.outcome === "reject") throw new Error("native track restart rejected");
        if (action.outcome === "mismatch") return;
        // A supported SDK restart acquires a new underlying track. Merely asking
        // an already-unmuted publication to enable itself does not do this.
        track.mediaStreamTrack = { readyState: "live" };
        // LocalTrack.restart itself stops newly acquired capture when stop()
        // arrived while getUserMedia/setMediaStreamTrack was pending.
        if (stopGeneration !== generationBeforeRestart) {
          track.stop();
          return;
        }
        if (kind === "video" && participant.cameraTrack === track) {
          participant.cameraEnabled = true;
          participant.interruptedUnmutedCameraPublication = false;
          runtime.remoteCameraConverged = true;
        } else if (kind === "audio" && participant.micTrack === track) {
          participant.micEnabled = true;
          participant.interruptedUnmutedMicrophonePublication = false;
        }
      };
      return track;
    }

    getTrackPublication(source) {
      // LocalTrack mute state and underlying MediaStreamTrack lifetime are
      // separate in the locked SDK. Native capture ending does not unpublish or
      // mute an existing publication, and its unmute method can remain a no-op.
      if (source === "camera" && this.interruptedUnmutedCameraPublication) {
        return { isMuted: false, source, track: this.cameraTrack };
      }
      if (source === "microphone" && this.interruptedUnmutedMicrophonePublication) {
        return { isMuted: false, source, track: this.micTrack };
      }
      if (
        source === "camera"
        && options.retainMutedCameraPublication
        && this.cameraPublicationPresent
      ) {
        return {
          isMuted: !this.cameraEnabled,
          source: "camera",
          track: this.cameraTrack,
        };
      }
      return source === "camera"
        ? makePublication(this.cameraEnabled, "video", this.cameraTrack)
        : makePublication(this.micEnabled, "audio", this.micTrack);
    }

    async setCameraEnabled(enabled) {
      runtime.cameraCalls.push(enabled);
      runtime.cameraLifecycleEvents.push(`set-camera:${enabled}`);
      if (enabled && this.interruptedUnmutedCameraPublication) {
        return this.getTrackPublication("camera");
      }
      const action = runtime.cameraActions.shift() ?? { outcome: "success" };
      if (action.gate) await action.gate.promise;
      if (action.interruptLatestOnCompletion) {
        const latestParticipant = runtime.rooms.at(-1)?.localParticipant;
        if (latestParticipant && latestParticipant !== this) {
          runtime.interruptLocalCapture("camera");
        }
      }
      if (action.outcome === "permission-denied") {
        const error = new Error("camera permission denied");
        error.name = "NotAllowedError";
        throw error;
      }
      if (action.outcome === "reject") throw new Error("native camera rejected");
      const nextEnabled = action.outcome === "mismatch" ? !enabled : enabled;
      const reusedMutedPublication = enabled
        && this.cameraPublicationPresent
        && this.cameraWasMuted;
      if (nextEnabled && !this.cameraPublicationPresent) {
        this.cameraGeneration += 1;
        this.cameraTrack = this.createLocalTrack("video");
        this.cameraPublicationPresent = true;
      }
      this.cameraEnabled = nextEnabled;
      if (this.cameraEnabled) {
        if (this.cameraTrack.mediaStreamTrack.readyState === "ended") {
          this.cameraTrack.mediaStreamTrack = { readyState: "live" };
        }
        runtime.remoteCameraConverged = !(
          options.managedCameraUnmuteStallsRemote
          && reusedMutedPublication
        );
        this.cameraWasMuted = false;
      } else if (enabled === false && action.outcome !== "mismatch") {
        this.interruptedUnmutedCameraPublication = false;
        this.cameraWasMuted = true;
        this.cameraTrack.stop();
        runtime.remoteCameraConverged = false;
      }
      if (action.outcome === "missing") return undefined;
      return this.getTrackPublication("camera");
    }

    async unpublishTrack(track, stopOnUnpublish) {
      runtime.cameraUnpublishes.push({
        generation: this.cameraGeneration,
        stopOnUnpublish,
        track,
      });
      runtime.cameraLifecycleEvents.push(`unpublish-camera:${this.cameraGeneration}`);
      const action = runtime.cameraUnpublishActions.shift() ?? { outcome: "success" };
      if (action.gate) await action.gate.promise;
      if (action.outcome === "reject") throw new Error("native camera unpublish rejected");
      if (action.outcome === "mismatch") return undefined;
      if (track === this.cameraTrack) {
        this.cameraTrack.stop();
        this.cameraEnabled = false;
        this.cameraPublicationPresent = false;
        this.interruptedUnmutedCameraPublication = false;
        runtime.remoteCameraConverged = false;
      }
      if (action.outcome === "reject-after-removal") {
        throw new Error("native camera unpublish negotiation rejected");
      }
      return { isMuted: true, source: "camera", track };
    }

    async setMicrophoneEnabled(enabled) {
      runtime.micCalls.push(enabled);
      if (enabled && this.interruptedUnmutedMicrophonePublication) {
        return this.getTrackPublication("microphone");
      }
      const action = runtime.nativeActions.shift() ?? { outcome: "success" };
      if (action.gate) await action.gate.promise;
      if (action.interruptLatestOnCompletion) {
        const latestParticipant = runtime.rooms.at(-1)?.localParticipant;
        if (latestParticipant && latestParticipant !== this) {
          runtime.interruptLocalCapture("microphone");
        }
      }
      if (action.outcome === "permission-denied") {
        const error = new Error("microphone permission denied");
        error.name = "NotAllowedError";
        throw error;
      }
      if (action.outcome === "reject") throw new Error("native microphone rejected");
      this.micEnabled = action.outcome === "mismatch" ? !enabled : enabled;
      if (!this.micEnabled) this.interruptedUnmutedMicrophonePublication = false;
      if (this.micEnabled && this.micTrack.mediaStreamTrack.readyState === "ended") {
        this.micTrack.mediaStreamTrack = { readyState: "live" };
      }
      if (action.outcome === "missing") return undefined;
      return makePublication(enabled, "audio", this.micTrack);
    }

    async publishData(data, publishOptions) {
      runtime.liveKitDataPublishes.push({
        data: Array.from(data),
        options: { ...publishOptions },
      });
      if (options.rejectLiveKitDataBroadcast) {
        throw new Error("fixture LiveKit data broadcast rejected");
      }
    }

    getTrackPublications() {
      return [];
    }
  }

  class FakeRoom {
    constructor() {
      this.handlers = new Map();
      this.localParticipant = new FakeLocalParticipant();
      this.remoteParticipants = new Map();
      this.state = "disconnected";
      runtime.rooms.push(this);
    }

    on(event, handler) {
      this.handlers.set(event, handler);
      return this;
    }

    async connect() {
      this.state = "connected";
      if (options.initialRemoteParticipant) {
        const remote = new FakeRemoteParticipant();
        this.remoteParticipants.set(remote.identity, remote);
      }
    }

    async disconnect(stopTracks = true) {
      runtime.roomDisconnects = (runtime.roomDisconnects ?? 0) + 1;
      const action = runtime.disconnectActions.shift() ?? { outcome: "success" };
      if (action.gate) await action.gate.promise;
      if (action.outcome === "reject") throw new Error("room disconnect rejected");
      if (action.outcome === "mismatch") return;
      if (stopTracks) {
        this.localParticipant.cameraTrack.stop();
        this.localParticipant.cameraPublicationPresent = false;
        this.localParticipant.interruptedUnmutedCameraPublication = false;
        this.localParticipant.micTrack.stop();
        this.localParticipant.interruptedUnmutedMicrophonePublication = false;
      }
      this.state = "disconnected";
    }
  }

  runtime.removeRemoteParticipant = () => {
    const room = runtime.rooms.at(-1);
    const remote = room?.remoteParticipants.get(runtime.remoteUserId);
    room?.remoteParticipants.delete(runtime.remoteUserId);
    return remote ?? null;
  };
  runtime.restoreRemoteParticipant = () => {
    const room = runtime.rooms.at(-1);
    if (!room) throw new Error("MOUNTED_LIVEKIT_ROOM_NOT_READY");
    const remote = new FakeRemoteParticipant();
    room.remoteParticipants.set(remote.identity, remote);
    return remote;
  };
  runtime.setRoomState = (state) => {
    const room = runtime.rooms.at(-1);
    if (!room) throw new Error("MOUNTED_LIVEKIT_ROOM_NOT_READY");
    room.state = state;
  };

  runtime.emitMembershipChange = (payloadOverrides = {}) => {
    const channel = runtime.realtimeChannels.findLast((candidate) => !candidate.removed);
    if (!channel) throw new Error("MOUNTED_MEMBERSHIP_CHANNEL_NOT_READY");
    channel.handlers
      .filter((entry) => entry.event === "broadcast")
      .filter((entry) => entry.filter?.event === "media:update")
      .forEach((entry) => entry.callback({
        payload: {
          cameraOn: runtime.remoteDurableCamera,
          fromUserId: runtime.remoteUserId,
          micOn: runtime.remoteDurableMic,
          roomId: runtime.roomId,
          ...payloadOverrides,
        },
      }));
  };

  runtime.emitMembershipSubscriptionStatus = (status, error) => {
    const channel = runtime.realtimeChannels.findLast((candidate) => !candidate.removed);
    if (!channel) throw new Error("MOUNTED_MEMBERSHIP_CHANNEL_NOT_READY");
    channel.subscriptionCallback?.(status, error);
  };

  runtime.emitLiveKitMediaInvalidation = (overrides = {}) => {
    const room = runtime.rooms.at(-1);
    if (!room) throw new Error("MOUNTED_LIVEKIT_ROOM_NOT_READY");
    const handler = room.handlers.get("DataReceived");
    if (!handler) throw new Error("MOUNTED_LIVEKIT_DATA_HANDLER_NOT_READY");
    const participant = overrides.missingParticipant
      ? undefined
      : { identity: overrides.fromUserId ?? runtime.remoteUserId };
    handler(
      new Uint8Array(overrides.payload ?? [1]),
      participant,
      undefined,
      overrides.topic ?? "chillywood.media-state.v1",
    );
  };

  const getSnapshot = async (requestedRoomId = runtime.roomId) => {
    runtime.snapshotReads += 1;
    const action = runtime.nextSnapshotActions.shift() ?? { outcome: "active" };
    if (action.gate) await action.gate.promise;
    if (action.outcome === "reject") throw new Error("snapshot rejected");
    if (action.outcome === "null") return null;
    const resolvedRoomId = action.outcome === "changed-room"
      ? "ROOM-2"
      : action.roomId ?? requestedRoomId;
    const resolvedStatus = action.outcome === "terminal" ? "ended" : "active";
    const resolvedUserId = action.outcome === "changed-user" ? "replacement-user" : runtime.userId;
    const memberships = [membership(runtime, { roomId: resolvedRoomId, userId: resolvedUserId })];
    if (runtime.remoteIncludedInSnapshot) {
      memberships.push(membership(runtime, {
        cameraEnabled: action.remoteCamera ?? runtime.remoteDurableCamera,
        displayName: "Remote",
        micEnabled: action.remoteMic ?? runtime.remoteDurableMic,
        role: "host",
        roomId: resolvedRoomId,
        userId: runtime.remoteUserId,
      }));
    }
    return {
      memberships,
      room: productRoom(runtime, { roomId: resolvedRoomId, roomCode: resolvedRoomId, status: resolvedStatus }),
    };
  };

  const touchMembership = async (touchOptions) => {
    const call = { ...touchOptions };
    runtime.membershipTouches.push(call);
    const action = runtime.nextTouchActions.shift() ?? { outcome: "success" };
    if (action.gate) await action.gate.promise;
    if (action.outcome === "reject") throw new Error("membership rejected");
    if (action.outcome === "null") return null;
    if (action.outcome === "lost") {
      runtime.durableCamera = !!touchOptions.cameraEnabled;
      runtime.durableMic = !!touchOptions.micEnabled;
      return null;
    }
    if (action.outcome === "inconsistent") {
      return membership(runtime, {
        cameraEnabled: !!touchOptions.cameraEnabled,
        micEnabled: !touchOptions.micEnabled,
      });
    }
    runtime.durableCamera = !!touchOptions.cameraEnabled;
    runtime.durableMic = !!touchOptions.micEnabled;
    return membership(runtime, {
      cameraEnabled: runtime.durableCamera,
      membershipState: touchOptions.membershipState,
      micEnabled: runtime.durableMic,
      roomId: touchOptions.roomId,
      userId: touchOptions.userId,
    });
  };

  const AppState = {
    addEventListener: (_event, listener) => {
      runtime.appStateListener = listener;
      return { remove: () => { if (runtime.appStateListener === listener) runtime.appStateListener = null; } };
    },
    get currentState() { return runtime.appState; },
  };

  const RoomEvent = new Proxy({}, { get: (_target, property) => String(property) });
  const Track = {
    Kind: { Audio: "audio", Video: "video" },
    Source: { Camera: "camera", Microphone: "microphone" },
  };
  const ConnectionState = {
    Connected: "connected",
    Connecting: "connecting",
    Disconnected: "disconnected",
    Reconnecting: "reconnecting",
  };

  class FakeRealtimeChannel {
    constructor(topic, config) {
      this.config = config;
      this.handlers = [];
      this.removed = false;
      this.subscriptionCallback = null;
      this.topic = topic;
    }

    on(event, filter, callback) {
      this.handlers.push({ callback, event, filter });
      return this;
    }

    subscribe(callback) {
      this.subscriptionCallback = callback;
      if (!options.deferRealtimeSubscribe) callback?.("SUBSCRIBED");
      return this;
    }
  }

  const liveKitAudioSession = {
    getAudioOutputs: async () => {
      runtime.audioOutputEnumerations += 1;
      const action = runtime.audioOutputEnumerationActions.shift() ?? { outcome: "success" };
      if (action.gate) await action.gate.promise;
      if (action.outcome === "reject") throw new Error("audio output enumeration rejected");
      return action.outputs ?? ["bluetooth", "default", "earpiece", "force_speaker", "headset", "speaker"];
    },
    selectAudioOutput: async (output) => {
      runtime.nativeAudioOutputCommands.push(output);
      const action = runtime.nativeAudioSelectionActions.shift() ?? { outcome: "success" };
      if (action.gate) await action.gate.promise;
      if (action.outcome === "reject") throw new Error("native audio output rejected");
      if (action.outcome !== "mismatch") runtime.nativeAudioOutput = output;
    },
    startAudioSession: async () => {
      runtime.nativeAudioSessionActive = true;
    },
    stopAudioSession: async () => {
      runtime.audioStopCalls += 1;
      const action = runtime.audioStopActions.shift() ?? { outcome: "success" };
      if (action.gate) await action.gate.promise;
      if (action.outcome === "reject") throw new Error("audio stop rejected");
      runtime.nativeAudioSessionActive = false;
    },
  };
  const actualAudioRouting = loadActualAudioRouting(liveKitAudioSession, runtime.platformOS);

  const moduleMocks = {
    "expo-camera": {
      Camera: {
        getCameraPermissionsAsync: async () => {
          runtime.cameraPermissionReads += 1;
          const action = runtime.cameraPermissionActions.shift() ?? {};
          if (action.gate) await action.gate.promise;
          const state = action.state ?? runtime.cameraPermissionState;
          return {
            canAskAgain: state === "undetermined",
            granted: state === "granted",
            status: state,
          };
        },
        getMicrophonePermissionsAsync: async () => {
          runtime.microphonePermissionReads += 1;
          const action = runtime.microphonePermissionActions.shift() ?? {};
          if (action.gate) await action.gate.promise;
          const state = action.state ?? runtime.microphonePermissionState;
          return {
            canAskAgain: state === "undetermined",
            granted: state === "granted",
            status: state,
          };
        },
      },
    },
    "../_lib/chatCallLiveKitTelemetry": {
      emitChatCallLiveKitStage: (stage) => runtime.stages.push(stage),
    },
    "../_lib/chillyChatCalls": {},
    "../_lib/communicationCallMediaPolicy.mjs": {
      doesIosAcceptedCallKitMediaDescriptorOwnSession: (input) => (
        !!input?.descriptor
        && acceptedMediaDescriptors.has(input.descriptor)
        && input.inviteStatus === "accepted"
        && input.descriptor.authenticatedUserId === input.authenticatedUserId
        && input.descriptor.inviteId === input.inviteId
        && input.descriptor.mediaProvider === input.mediaProvider
        && input.descriptor.roomId === input.roomId
        && input.descriptor.threadId === input.threadId
      ),
    },
    "../_lib/communication": {
      broadcastCommunicationRoomSignal: async (request) => {
        runtime.mediaBroadcasts.push(request);
        if (options.rejectMediaBroadcast) throw new Error("fixture media broadcast rejected");
        if (options.broadcastCommunicationRoomSignal) {
          return options.broadcastCommunicationRoomSignal(request);
        }
        return true;
      },
      buildCommunicationChannelName: (roomId) => `comm-room-${roomId}`,
      endCommunicationRoom: async () => undefined,
      getActiveCommunicationMemberships: (memberships) => memberships.filter((entry) => !entry.leftAt),
      getCommunicationRoomSnapshot: getSnapshot,
      joinCommunicationRoomSession: async (joinOptions) => membership(runtime, {
        cameraEnabled: !!joinOptions.cameraEnabled,
        micEnabled: !!joinOptions.micEnabled,
        roomId: joinOptions.roomId,
        userId: joinOptions.userId,
      }),
      leaveCommunicationRoomSession: async ({ roomId, userId }) => {
        runtime.membershipLeaves += 1;
        const action = runtime.membershipLeaveActions.shift() ?? { outcome: "success" };
        if (action.gate) await action.gate.promise;
        if (action.outcome === "reject") throw new Error("membership leave rejected");
        if (action.outcome === "null") return null;
        runtime.durableCamera = false;
        runtime.durableMic = false;
        return membership(runtime, {
          cameraEnabled: false,
          leftAt: "2026-08-11T00:01:00.000Z",
          membershipState: "left",
          micEnabled: false,
          roomId,
          userId,
        });
      },
      readCommunicationIdentity: async () => {
        runtime.identityReads += 1;
        return { avatarUrl: null, displayName: "Local", userId: runtime.userId };
      },
      touchCommunicationRoomSession: touchMembership,
    },
    "../_lib/livekit/audioRouting": options.useActualAudioRouting ? actualAudioRouting : {
      selectLiveKitAudioOutput: async (output) => {
        runtime.audioOutputCalls.push(output);
        const action = runtime.audioOutputActions.shift() ?? { outcome: "success" };
        if (action.gate) await action.gate.promise;
        if (action.outcome === "reject") throw new Error("audio output rejected");
        return action.outcome !== "mismatch";
      },
    },
    "../_lib/livekit/react-native-module": {
      configureLiveKitIosAudioSession: async () => {
        runtime.iosAudioConfigurationActive = true;
      },
      LiveKitAudioSession: liveKitAudioSession,
      resetLiveKitIosAudioSession: async () => {
        runtime.audioResetCalls += 1;
        const action = runtime.audioResetActions.shift() ?? { outcome: "success" };
        if (action.gate) await action.gate.promise;
        if (action.outcome === "reject") throw new Error("audio reset rejected");
        runtime.iosAudioConfigurationActive = false;
      },
    },
    "../_lib/livekit/token-contract": {
      requestLiveKitParticipantToken: async (request) => {
        runtime.providerTokenCalls += 1;
        return {
          participantRole: "speaker",
          participantToken: "fixture-token",
          requestedGrants: { canPublish: true, canPublishData: true, canSubscribe: true, roomJoin: true },
          roomName: request.roomName,
          serverUrl: "wss://fixture.invalid",
          status: "ready",
        };
      },
      validateChatCallLiveKitTokenClaims: () => true,
    },
    "../_lib/logger": {
      reportRuntimeError: (scope, error) => runtime.errors.push({ message: String(error?.message ?? error), scope }),
    },
    "../_lib/mediaPermissions": {
      resolveMediaPermission: (permission) => ({
        canAskAgain: permission?.canAskAgain !== false,
        shouldOpenSettings: permission?.status === "denied" || permission?.status === "restricted",
        state: permission?.granted === true ? "granted" : String(permission?.status ?? "undetermined"),
      }),
    },
    "../_lib/iosNativeCalls": {
      readIosNativeApplicationActive: async () => {
        runtime.nativeApplicationActiveReads += 1;
        const action = runtime.nativeApplicationActiveActions.shift();
        if (action?.gate) await action.gate.promise;
        return action ? !!action.outcome : !!runtime.nativeApplicationActive;
      },
    },
    "../_lib/mediaSessionLifecycle": {
      registerActiveMediaSessionStopper: (stopper) => {
        runtime.cleanupRegistrations.push(stopper);
        return () => undefined;
      },
    },
    "../_lib/supabase": {
      supabase: {
        auth: {
          getSession: async () => ({
            data: {
              session: {
                access_token: "fixture-access-token",
                user: { id: options.realtimeSessionUserId ?? runtime.userId },
              },
            },
          }),
        },
        channel: (topic, config) => {
          const channel = new FakeRealtimeChannel(topic, config);
          runtime.realtimeChannels.push(channel);
          return channel;
        },
        realtime: {
          setAuth: async (token) => { runtime.realtimeAuthTokens.push(token); },
        },
        removeChannel: (channel) => {
          channel.removed = true;
          runtime.realtimeRemovedChannels.push(channel);
        },
      },
    },
    "../_lib/performancePolicy": {
      createLiveKitV1RoomOptions: (value) => value,
      LIVE_VIDEO_CAPTURE_OPTIONS: {},
      ROOM_HEARTBEAT_MS: 15_000,
    },
    "../_lib/livekit/dom-exception-polyfill": {},
    "livekit-client": { ConnectionState, Room: FakeRoom, RoomEvent, Track },
    "react": React,
    "react-native": {
      AppState,
      Linking: { openSettings: async () => { runtime.settingsCalls += 1; } },
      Platform: { OS: runtime.platformOS },
    },
  };

  const commonJsModule = { exports: {} };
  const sandbox = {
    clearInterval: () => { runtime.intervalsCleared += 1; },
    clearTimeout: (id) => { runtime.timeoutCallbacks[id - 1] = null; },
    console,
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: (specifier) => {
      if (Object.hasOwn(moduleMocks, specifier)) return moduleMocks[specifier];
      throw new Error(`UNEXPECTED_MOUNTED_HOOK_IMPORT:${specifier}`);
    },
    setInterval: (callback) => {
      runtime.heartbeatCallbacks.push(callback);
      return runtime.heartbeatCallbacks.length;
    },
    setTimeout: (callback, delay) => {
      runtime.timeoutCallbacks.push(callback);
      runtime.timeoutDelays.push(delay);
      return runtime.timeoutCallbacks.length;
    },
  };
  vm.runInNewContext(compiledHook, sandbox, { filename: "hooks/use-livekit-chat-call-session.ts" });
  runtime.useHook = sandbox.module.exports.useLiveKitChatCallSession;
  runtime.getSnapshot = getSnapshot;
  runtime.touchMembership = touchMembership;
  return runtime;
}

export const defaultHookOptions = (overrides = {}) => ({
  allowBackgroundAudio: false,
  authenticatedUserId: "local-user",
  enabled: true,
  initialMediaPreferences: { cameraEnabled: false, micEnabled: false },
  invite: {
    callType: "audio",
    calleeUserId: "local-user",
    callerUserId: "remote-user",
    communicationRoomId: "ROOM-1",
    id: "invite-1",
    mediaProvider: "livekit",
    status: "accepted",
    threadId: "thread-1",
  },
  iosAcceptedCallKitMediaDescriptor: null,
  mediaActivationSerial: 0,
  nativeForegroundActivationInviteId: "",
  nativeForegroundActivationSerial: 0,
  onRoomEnded: () => undefined,
  roomId: "ROOM-1",
  threadId: "thread-1",
  ...overrides,
});

export async function mountLiveKitHook(runtime, initialOptions = defaultHookOptions(), mountOptions = {}) {
  const container = createContainer();
  const root = createRoot(container);
  let committedResult = null;
  let renderCount = 0;
  const never = new Promise(() => undefined);

  function Harness({ hookOptions, suspend }) {
    const result = runtime.useHook(hookOptions);
    renderCount += 1;
    useLayoutEffect(() => {
      committedResult = result;
    });
    if (suspend) throw never;
    return null;
  }

  const render = async (hookOptions, options = {}) => {
    await act(async () => {
      root.render(React.createElement(Harness, { hookOptions, suspend: !!options.suspend }));
      await settle(options.turns ?? 24);
    });
  };

  await render(initialOptions, { turns: mountOptions.turns ?? 48 });
  if (mountOptions.requireLive !== false) {
    for (let turn = 0; turn < 12 && committedResult?.channelState !== "live"; turn += 1) {
      await act(async () => settle(24));
    }
    if (committedResult?.channelState !== "live") {
      throw new Error(`MOUNTED_HOOK_DID_NOT_REACH_LIVE:${committedResult?.channelState}`);
    }
  }

  return {
    abandonRender: async (hookOptions) => {
      const before = renderCount;
      await act(async () => {
        React.startTransition(() => {
          root.render(React.createElement(Harness, { hookOptions, suspend: true }));
        });
        await new Promise((resolve) => setImmediate(resolve));
      });
      for (let turn = 0; turn < 24 && renderCount === before; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (renderCount === before) throw new Error("ABANDONED_RENDER_NOT_ATTEMPTED");
    },
    commitRender: render,
    fireAppState: async (nextState) => {
      runtime.appState = nextState;
      await act(async () => {
        runtime.appStateListener?.(nextState);
        await settle(24);
      });
    },
    fireHeartbeat: async () => {
      const callback = runtime.heartbeatCallbacks.at(-1);
      if (!callback) throw new Error("MOUNTED_HEARTBEAT_NOT_REGISTERED");
      await act(async () => {
        callback();
        await settle(24);
      });
    },
    fireMembershipChange: async (payloadOverrides) => {
      await act(async () => {
        runtime.emitMembershipChange(payloadOverrides);
        await settle(24);
      });
    },
    fireMembershipChangeBurst: async (count, payloadOverrides) => {
      await act(async () => {
        for (let index = 0; index < count; index += 1) {
          runtime.emitMembershipChange(payloadOverrides);
        }
        await settle(24);
      });
    },
    fireMembershipSubscriptionStatus: async (status, error) => {
      await act(async () => {
        runtime.emitMembershipSubscriptionStatus(status, error);
        await settle(24);
      });
    },
    fireLiveKitMediaInvalidation: async (overrides) => {
      await act(async () => {
        runtime.emitLiveKitMediaInvalidation(overrides);
        await settle(24);
      });
    },
    fireLiveKitMediaInvalidationBurst: async (count, overrides) => {
      await act(async () => {
        for (let index = 0; index < count; index += 1) {
          runtime.emitLiveKitMediaInvalidation(overrides);
        }
        await settle(24);
      });
    },
    fireMediaWriteTimeout: async () => {
      const callback = runtime.timeoutCallbacks.find((candidate) => typeof candidate === "function");
      if (!callback) throw new Error("MOUNTED_MEDIA_WRITE_TIMEOUT_NOT_REGISTERED");
      runtime.timeoutCallbacks[runtime.timeoutCallbacks.indexOf(callback)] = null;
      await act(async () => {
        callback();
        await settle(24);
      });
    },
    fireMediaWriteTimeoutAt: async (activeIndex) => {
      const callbacks = runtime.timeoutCallbacks
        .map((callback, index) => ({ callback, index }))
        .filter(({ callback }) => typeof callback === "function");
      const selected = callbacks[activeIndex];
      if (!selected) throw new Error("MOUNTED_MEDIA_WRITE_TIMEOUT_NOT_REGISTERED");
      runtime.timeoutCallbacks[selected.index] = null;
      await act(async () => {
        selected.callback();
        await settle(24);
      });
    },
    fireLatestTimeout: async () => {
      const selectedIndex = runtime.timeoutCallbacks.findLastIndex(
        (callback) => typeof callback === "function",
      );
      if (selectedIndex < 0) throw new Error("MOUNTED_TIMEOUT_NOT_REGISTERED");
      const callback = runtime.timeoutCallbacks[selectedIndex];
      runtime.timeoutCallbacks[selectedIndex] = null;
      await act(async () => {
        callback();
        await settle(24);
      });
    },
    fireStopper: async (reason) => {
      const stopper = runtime.cleanupRegistrations.at(-1);
      if (!stopper) throw new Error("MOUNTED_MEDIA_STOPPER_NOT_REGISTERED");
      await act(async () => {
        stopper(reason);
        await settle(24);
      });
    },
    flush: async (turns = 24) => act(async () => settle(turns)),
    getResult: () => committedResult,
    getRenderCount: () => renderCount,
    resolveDeferred: async (gate, value) => act(async () => {
      gate.resolve(value);
      await settle(24);
    }),
    emitRoom: async (event, value) => act(async () => {
      runtime.rooms.at(-1)?.handlers.get(event)?.(value);
      await settle(24);
    }),
    startOperation: async (callback) => {
      let operation;
      await act(() => {
        operation = callback();
      });
      return { operation };
    },
    unmount: async () => act(async () => {
      root.unmount();
      await settle(24);
    }),
  };
}

export async function settleOperation(operation, harness, turns = 48) {
  let result;
  await act(async () => {
    result = await (operation?.operation ?? operation);
    await settle(turns);
  });
  return result;
}
