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

const makePublication = (enabled, kind) => enabled
  ? { isMuted: false, source: kind, track: { kind } }
  : undefined;

export function createLiveKitMountedRuntime(options = {}) {
  const runtime = {
    appState: "active",
    appStateListener: null,
    cameraActions: [],
    cameraCalls: [],
    cleanupRegistrations: [],
    durableCamera: options.initialCamera ?? false,
    durableMic: options.initialMic ?? false,
    errors: [],
    heartbeatCallbacks: [],
    identityReads: 0,
    intervalsCleared: 0,
    membershipLeaves: 0,
    membershipTouches: [],
    micCalls: [],
    nativeActions: [],
    nextSnapshotActions: [],
    nextTouchActions: [],
    providerTokenCalls: 0,
    roomId: "ROOM-1",
    rooms: [],
    snapshotReads: 0,
    stages: [],
    settingsCalls: 0,
    userId: "local-user",
  };

  runtime.queueCamera = (action) => runtime.cameraActions.push(action);
  runtime.queueNative = (action) => runtime.nativeActions.push(action);
  runtime.queueSnapshot = (action) => runtime.nextSnapshotActions.push(action);
  runtime.queueTouch = (action) => runtime.nextTouchActions.push(action);
  runtime.deferNative = () => {
    const gate = deferred();
    runtime.queueNative({ gate, outcome: "success" });
    return gate;
  };
  runtime.deferCamera = () => {
    const gate = deferred();
    runtime.queueCamera({ gate, outcome: "success" });
    return gate;
  };
  runtime.deferTouch = () => {
    const gate = deferred();
    runtime.queueTouch({ gate, outcome: "success" });
    return gate;
  };

  class FakeLocalParticipant {
    constructor() {
      this.identity = runtime.userId;
      this.name = "Local";
      this.cameraEnabled = runtime.durableCamera;
      this.micEnabled = runtime.durableMic;
    }

    getTrackPublication(source) {
      return source === "camera"
        ? makePublication(this.cameraEnabled, "video")
        : makePublication(this.micEnabled, "audio");
    }

    async setCameraEnabled(enabled) {
      runtime.cameraCalls.push(enabled);
      const action = runtime.cameraActions.shift() ?? { outcome: "success" };
      if (action.gate) await action.gate.promise;
      if (action.outcome === "permission-denied") {
        const error = new Error("camera permission denied");
        error.name = "NotAllowedError";
        throw error;
      }
      if (action.outcome === "reject") throw new Error("native camera rejected");
      this.cameraEnabled = action.outcome === "mismatch" ? !enabled : enabled;
      if (action.outcome === "missing") return undefined;
      return makePublication(enabled, "video");
    }

    async setMicrophoneEnabled(enabled) {
      runtime.micCalls.push(enabled);
      const action = runtime.nativeActions.shift() ?? { outcome: "success" };
      if (action.gate) await action.gate.promise;
      if (action.outcome === "permission-denied") {
        const error = new Error("microphone permission denied");
        error.name = "NotAllowedError";
        throw error;
      }
      if (action.outcome === "reject") throw new Error("native microphone rejected");
      this.micEnabled = action.outcome === "mismatch" ? !enabled : enabled;
      if (action.outcome === "missing") return undefined;
      return makePublication(enabled, "audio");
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
    }

    async disconnect() {
      runtime.roomDisconnects = (runtime.roomDisconnects ?? 0) + 1;
      this.state = "disconnected";
    }
  }

  const getSnapshot = async () => {
    runtime.snapshotReads += 1;
    const action = runtime.nextSnapshotActions.shift() ?? { outcome: "active" };
    if (action.gate) await action.gate.promise;
    if (action.outcome === "reject") throw new Error("snapshot rejected");
    if (action.outcome === "null") return null;
    const resolvedRoomId = action.outcome === "changed-room" ? "ROOM-2" : runtime.roomId;
    const resolvedStatus = action.outcome === "terminal" ? "ended" : "active";
    const resolvedUserId = action.outcome === "changed-user" ? "replacement-user" : runtime.userId;
    return {
      memberships: [membership(runtime, { roomId: resolvedRoomId, userId: resolvedUserId })],
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

  const moduleMocks = {
    "../_lib/chatCallLiveKitTelemetry": {
      emitChatCallLiveKitStage: (stage) => runtime.stages.push(stage),
    },
    "../_lib/chillyChatCalls": {},
    "../_lib/communication": {
      endCommunicationRoom: async () => null,
      getActiveCommunicationMemberships: (memberships) => memberships.filter((entry) => !entry.leftAt),
      getCommunicationRoomSnapshot: getSnapshot,
      joinCommunicationRoomSession: async (joinOptions) => membership(runtime, {
        cameraEnabled: !!joinOptions.cameraEnabled,
        micEnabled: !!joinOptions.micEnabled,
      }),
      leaveCommunicationRoomSession: async () => { runtime.membershipLeaves += 1; return null; },
      readCommunicationIdentity: async () => {
        runtime.identityReads += 1;
        return { avatarUrl: null, displayName: "Local", userId: runtime.userId };
      },
      touchCommunicationRoomSession: touchMembership,
    },
    "../_lib/livekit/audioRouting": { selectLiveKitAudioOutput: async () => true },
    "../_lib/livekit/react-native-module": {
      configureLiveKitIosAudioSession: async () => undefined,
      LiveKitAudioSession: {
        startAudioSession: async () => undefined,
        stopAudioSession: async () => undefined,
      },
      resetLiveKitIosAudioSession: async () => undefined,
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
    "../_lib/mediaSessionLifecycle": {
      registerActiveMediaSessionStopper: (stopper) => {
        runtime.cleanupRegistrations.push(stopper);
        return () => undefined;
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
      Platform: { OS: "android" },
    },
  };

  const commonJsModule = { exports: {} };
  const sandbox = {
    clearInterval: () => { runtime.intervalsCleared += 1; },
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
  };
  vm.runInNewContext(compiledHook, sandbox, { filename: "hooks/use-livekit-chat-call-session.ts" });
  runtime.useHook = sandbox.module.exports.useLiveKitChatCallSession;
  runtime.getSnapshot = getSnapshot;
  runtime.touchMembership = touchMembership;
  return runtime;
}

export const defaultHookOptions = (overrides = {}) => ({
  allowBackgroundAudio: false,
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
  mediaActivationSerial: 0,
  onRoomEnded: () => undefined,
  roomId: "ROOM-1",
  threadId: "thread-1",
  ...overrides,
});

export async function mountLiveKitHook(runtime, initialOptions = defaultHookOptions()) {
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

  await render(initialOptions, { turns: 48 });
  for (let turn = 0; turn < 12 && committedResult?.channelState !== "live"; turn += 1) {
    await act(async () => settle(24));
  }
  if (committedResult?.channelState !== "live") {
    throw new Error(`MOUNTED_HOOK_DID_NOT_REACH_LIVE:${committedResult?.channelState}`);
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
