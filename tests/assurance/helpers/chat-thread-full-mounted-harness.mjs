import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as mediaPolicy from "../../../_lib/communicationCallMediaPolicy.mjs";
import * as nativeRoutes from "../../../_lib/chillyChatNativeCallRoutes.mjs";
import * as nativeProvenance from "../../../_lib/nativeCallTransitionProvenance.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { createRoot } = require("react-dom/client");
const ts = require("typescript");
const noop = () => undefined;
const settle = async () => { for (let i = 0; i < 160; i += 1) await Promise.resolve(); };

function compile(source, filename, modules, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: {
    esModuleInterop: true, module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  }, fileName: filename }).outputText;
  vm.runInNewContext(code, {
    __DEV__: false, module, exports: module.exports, console, URL, performance,
    setTimeout, clearTimeout, setInterval, clearInterval,
    require: (name) => {
      if (Object.hasOwn(modules, name)) return modules[name];
      throw Error(`Unmodeled full-screen boundary: ${name}`);
    }, ...globals,
  }, { filename });
  return module.exports;
}

// Only the native bridge is modeled. The facade's receipt validation and the
// hook's ownership/lifecycle checks execute from production source.
export function loadOwnedAndroidAudioRoute({ nativeModule, platform = "android", appState, deviceEventEmitter } = {}) {
  const reactNative = { Platform: { OS: platform },
    DeviceEventEmitter: deviceEventEmitter,
    NativeModules: nativeModule ? { LivekitReactNativeModule: nativeModule } : {},
    AppState: appState ?? { currentState: "active", addEventListener: () => ({ remove: noop }) } };
  const facade = compile(fs.readFileSync("_lib/livekit/ownedAudioSession.ts", "utf8"), "_lib/livekit/ownedAudioSession.ts", {
    "react-native": reactNative,
    "./react-native-module": { LiveKitAudioSession: {
      startAudioSession: async () => { throw Error("unexpected non-Android audio acquisition"); },
      stopAudioSession: async () => { throw Error("unexpected non-Android audio release"); },
    } },
  });
  const hook = compile(fs.readFileSync("hooks/use-legacy-android-audio-route.ts", "utf8"), "hooks/use-legacy-android-audio-route.ts", {
    react: React, "react-native": reactNative, "../_lib/livekit/ownedAudioSession": facade,
  });
  return { facade, hook };
}

export async function mountOwnedAndroidAudioRoute(boundary, initialProps = {}) {
  const root = createRoot(container());
  let props = { active: true, identity: "route-owner", video: false, ...initialProps };
  let current;
  function Probe() {
    const result = boundary.hook.useLegacyAndroidAudioRoute(props);
    React.useLayoutEffect(() => { current = result; });
    return null;
  }
  const render = async () => React.act(async () => { root.render(React.createElement(Probe)); await settle(); });
  await render();
  return {
    getResult: () => current,
    async run(fn) { let result; await React.act(async () => { result = await fn(); await settle(); }); return result; },
    async rerender(patch) { props = { ...props, ...patch }; await render(); },
    async unmount() { await React.act(async () => { root.unmount(); await settle(); }); },
  };
}

// Isolate each production watch-party lease effect without replacing its
// startup/cleanup closure. Other watch-party behavior is outside this probe.
export function loadWatchPartyAudioEffect(file, facade, errors) {
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = [];
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect"
      && node.arguments[0]?.getText(ast).includes("createOwnedAudioSession()")) callbacks.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(callbacks.length, 1, "one owned audio lease effect must be observable");
  return compile(`export function enter(joinContract, shouldConnectRoom) { return (${callbacks[0].getText(ast)})(); }`, file, {}, {
    createOwnedAudioSession: facade.createOwnedAudioSession,
    reportRuntimeError: (scope, error) => errors.push({ scope, message: error.message }),
  }).enter;
}

// Execute the real control bar's JSX and read its native element props. Its
// development-only effect does not participate in this presentation probe.
// The parent panel's actual route forwarding is checked instead of copied.
export function readAudioRouteControl(panelBindings) {
  const panelFile = "components/communication/in-room-communication-panel.tsx";
  const panel = ts.createSourceFile(panelFile, fs.readFileSync(panelFile, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const forwarded = new Map();
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(panel) === "CommunicationControlBar") {
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute) && ["speakerEnabled", "onToggleAudioRoute"].includes(attribute.name.text)) {
          forwarded.set(attribute.name.text, attribute.initializer.expression.getText(panel));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(panel);
  assert.equal(forwarded.get("speakerEnabled"), "speakerEnabled");
  assert.equal(forwarded.get("onToggleAudioRoute"), "onToggleAudioRoute");
  const file = "components/communication/communication-control-bar.tsx";
  const { CommunicationControlBar } = compile(fs.readFileSync(file, "utf8"), file, {
    react: { ...React, useEffect: noop }, "@expo/vector-icons/MaterialIcons": "Icon",
    "react-native": { StyleSheet: { create: value => value }, Text: "Text", TouchableOpacity: "TouchableOpacity", View: "View" },
  });
  const tree = CommunicationControlBar({ ...panelBindings, disabled: panelBindings.mediaControlsBusy });
  let control;
  const walk = element => {
    if (Array.isArray(element)) { element.forEach(walk); return; }
    if (!element?.props) return;
    if (element.props.testID === "communication-audio-route-toggle") control = element.props;
    walk(element.props.children);
  };
  walk(tree);
  return control;
}

// Reuse the existing native transport fixture, not its mount helper: that helper
// force-promotes refs to live. Here the full screen and real adapter/hook must
// perform startup themselves. This remains a controlled SDK/API boundary test;
// real two-endpoint WebRTC and authenticated SQL have independent integration lanes.
function createMediaRuntime(communication) {
  const fixturePath = path.resolve("tests/assurance/android-chat-call-mic-control.test.mjs");
  let fixture = fs.readFileSync(fixturePath, "utf8").split("async function mountLegacyHook(")[0];
  assert.ok(fixture.includes("function createLegacyMountedRuntime"));
  fixture = fixture.replace("const require = createRequire(import.meta.url);", "");
  const marker = "  const commonJsModule = { exports: {} };";
  assert.equal(fixture.split(marker).length, 2);
  fixture = fixture.replace(marker, `
    Object.assign(moduleMocks["../_lib/communication"], options.communication);
    Object.assign(moduleMocks["../_lib/communicationCallMediaPolicy.mjs"], actualMediaPolicy);
    runtime.api = moduleMocks["../_lib/communication"];
    ${marker}`);
  fixture += "\nexports.makeRuntime = createLegacyMountedRuntime;";
  const fixtureRequire = createRequire(fixturePath);
  const module = { exports: {} };
  const code = ts.transpileModule(fixture, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { require: fixtureRequire, module, exports: module.exports,
    actualMediaPolicy: mediaPolicy, console, process, setTimeout, clearTimeout,
  }, { filename: fixturePath });
  return module.exports.makeRuntime({ communication });
}

function container() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
  const element = () => ({ addEventListener: noop, removeEventListener: noop,
    namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1,
    ownerDocument: doc, parentNode: null, tagName: "DIV" });
  doc.documentElement = element(); globalThis.document = doc; globalThis.window = globalThis;
  globalThis.HTMLIFrameElement = class {};
  return element();
}

// Stateful API-boundary fixture shared by two actual mounted screens. It keeps
// messages separate from call rows, enforces member/actor/terminal ownership,
// and can reject or hold writes. SQL/transport behavior has an independent
// authenticated-local integration test; this fixture does not stand in for it.
export function createDurableChatThreadFixture({ threadId = "thread", userIds = ["local-user", "remote-user"] } = {}) {
  const store = { threadId, userIds, messages: [], invite: null, rooms: new Map(),
    transitions: [], sends: [], writeActions: [], listeners: new Set(), serial: 0, reads: [] };
  const member = (userId, requestedThreadId) => {
    if (requestedThreadId !== threadId || !userIds.includes(userId)) throw Error("thread account is not a member");
  };
  store.notify = () => { for (const listener of store.listeners) listener(); };
  store.thread = (userId) => {
    member(userId, threadId);
    const active = store.invite && ["ringing", "accepted"].includes(store.invite.status);
    return { threadId, activeCommunicationRoomId: active ? store.invite.communicationRoomId : null,
      activeCallType: active ? store.invite.callType : null, members: userIds.map(id => ({ userId: id })),
      currentMember: { userId }, otherMember: { userId: userIds.find(id => id !== userId), displayName: "Other" } };
  };
  store.list = (userId, requestedThreadId) => {
    member(userId, requestedThreadId);
    store.reads.push({ userId, threadId: requestedThreadId });
    return store.messages.map(message => ({ ...message }));
  };
  store.send = async (userId, requestedThreadId, body, attachment) => {
    member(userId, requestedThreadId);
    if (!String(body).trim() || attachment) throw Error("fixture requires a nonempty text message");
    const action = store.writeActions.shift() ?? {};
    const request = { userId, threadId: requestedThreadId, body: body.trim() };
    store.sends.push(request);
    if (action.wait) await action.wait;
    if (action.reject) throw Error(action.reject);
    const message = { id: `message-${++store.serial}`, threadId, senderUserId: userId,
      body: body.trim(), messageType: "text", createdAt: new Date(1_790_000_000_000 + store.serial).toISOString(),
      attachments: [], moderationStatus: "clean", isModerationHidden: false };
    store.messages.push(message);
    store.notify();
    return { ...message };
  };
  store.start = (userId, requestedThreadId, callType) => {
    member(userId, requestedThreadId);
    if (store.invite && ["ringing", "accepted"].includes(store.invite.status)) throw Error("call already active");
    if (!["voice", "video"].includes(callType)) throw Error("invalid call type");
    const roomId = `FIXTURE-ROOM-${++store.serial}`;
    store.invite = { id: `invite-${store.serial}`, threadId, communicationRoomId: roomId,
      callerUserId: userId, calleeUserId: userIds.find(id => id !== userId), callType,
      mediaProvider: "legacy_webrtc", status: "ringing", expiresAt: new Date(Date.now() + 90_000).toISOString() };
    store.rooms.set(roomId, { status: "active", callType, hostUserId: userId });
    store.notify();
    return { ...store.invite };
  };
  store.transition = (userId, expectedInvite, status) => {
    member(userId, expectedInvite.threadId);
    const current = store.invite;
    if (!current || expectedInvite.id !== current.id || expectedInvite.communicationRoomId !== current.communicationRoomId) throw Error("stale invite ownership");
    if (current.status === status) return { ...current };
    if (status === "accepted" && (current.status !== "ringing" || userId !== current.calleeUserId || Date.parse(current.expiresAt) <= Date.now())) throw Error("accept authority rejected");
    if (status === "canceled" && (current.status !== "ringing" || userId !== current.callerUserId)) throw Error("cancel authority rejected");
    if (status === "declined" && (current.status !== "ringing" || userId !== current.calleeUserId)) throw Error("decline authority rejected");
    if (status === "ended" && current.status !== "accepted") throw Error("end authority rejected");
    if (status === "missed" && (current.status !== "ringing" || Date.parse(current.expiresAt) > Date.now())) throw Error("expiry authority rejected");
    if (!["accepted", "canceled", "declined", "ended", "missed"].includes(status)) throw Error("unsupported transition");
    store.invite = { ...current, status };
    store.transitions.push({ id: current.id, status, userId });
    if (status !== "accepted") store.rooms.get(current.communicationRoomId).status = "ended";
    store.notify();
    return { ...store.invite };
  };
  return store;
}

export async function mountFullChatThread(options = {}) {
  const runtime = {
    userId: "local-user", remoteUserId: "remote-user", threadId: "thread", roomId: "ROOM-LEGACY",
    platform: "android", sessionGeneration: "session-1", errors: [], transitions: [],
    leaves: [], hostEnds: 0, clears: [], nativeEnds: [], notifications: [], timers: [], intervals: [],
    subscriptions: new Set(), threadSubscriptions: new Set(), ...options,
  };
  runtime.keyboard = { visible: options.keyboardVisible ?? false, dismissals: 0 };
  runtime.appState = options.appState ?? "active";
  runtime.outgoingAudioHandoffs = [];
  runtime.soundClaims = [];
  runtime.soundReleases = [];
  const appStateListeners = new Set();
  runtime.invite = { id: "invite", threadId: runtime.threadId, communicationRoomId: runtime.roomId,
    callerUserId: runtime.remoteUserId, calleeUserId: runtime.userId, status: "ringing",
    callType: "video", mediaProvider: "legacy_webrtc", expiresAt: new Date(Date.now() + 90_000).toISOString(),
    ...options.invite };
  runtime.thread = { threadId: runtime.threadId, activeCommunicationRoomId: runtime.roomId,
    activeCallType: runtime.invite.callType, members: [], otherMember: { userId: runtime.remoteUserId, displayName: "Other" } };
  if (options.noActiveCall) { runtime.thread.activeCommunicationRoomId = null; runtime.thread.activeCallType = null; }
  const durableThread = options.durableThread;
  if (durableThread) {
    Object.defineProperty(runtime, "invite", { get: () => durableThread.invite, set: value => { durableThread.invite = value; } });
    Object.defineProperty(runtime, "thread", { get: () => durableThread.thread(runtime.userId) });
  }
  runtime.params = { threadId: runtime.threadId, ...options.routeParams };
  runtime.nativeCompletions = [];
  if (options.nativeAnswer) {
    nativeProvenance.clearNativeCallTransitionClaims("ios");
    const handler = nativeProvenance.createIosCallKitAnswerRouteHandler({
      getAuthenticatedUserId: () => runtime.userId,
      isActive: () => true,
      completeAnswerFailure: async () => { throw Error("fixture native route was not attested"); },
      replace: destination => {
        const url = new URL(destination, "https://fixture.invalid");
        runtime.params = { threadId: runtime.threadId, ...Object.fromEntries(url.searchParams) };
      },
    });
    assert.equal(await handler({ type: "answerrequested", platform: "ios", callType: runtime.invite.callType,
      callInviteId: runtime.invite.id, threadId: runtime.threadId, callUuid: options.nativeAnswer.callUuid,
      nativeEventGeneration: 1 }), "routed");
  }
  const notifyInvite = async () => { for (const fn of runtime.subscriptions) fn(); await settle(); };
  const inviteApi = {
    listChillyChatCallEvents: async () => [],
    readChillyChatCallInvite: async (id) => runtime.readInvite ? runtime.readInvite(id)
      : runtime.invite?.id === id ? ({ ...runtime.invite }) : null,
    readLatestChillyChatCallInviteForRoom: async (roomId) => runtime.invite?.communicationRoomId === roomId ? ({ ...runtime.invite }) : null,
    readLatestRingingChillyChatCallInvite: async (threadId) => runtime.invite?.threadId === threadId
      && runtime.invite?.status === "ringing" ? { ...runtime.invite } : null,
    subscribeToChillyChatCallInvite: (_id, fn) => { runtime.subscriptions.add(fn); return () => runtime.subscriptions.delete(fn); },
    updateChillyChatCallInviteStatus: async ({ invite, status, actorUserId }) => {
      assert.equal(actorUserId, runtime.userId, "transition must carry the mounted authenticated actor");
      runtime.transitions.push({ id: invite.id, status });
      if (runtime.transition) return runtime.transition({ invite, status });
      if (durableThread) return durableThread.transition(actorUserId, invite, status);
      runtime.invite = { ...runtime.invite, status };
      if (["ended", "canceled", "missed", "declined"].includes(status)) {
        runtime.thread.activeCommunicationRoomId = null;
        runtime.thread.activeCallType = null;
      }
      return { ...runtime.invite };
    },
  };
  const media = createMediaRuntime({
    endCommunicationRoom: async () => { runtime.hostEnds += 1; throw Error("closed room is no longer available to direct host update"); },
    leaveCommunicationRoomSession: async (input) => {
      runtime.leaves.push(input);
      if ((durableThread ? !durableThread.rooms.has(input.roomId) : input.roomId !== runtime.roomId) || input.userId !== runtime.userId
        || input.expectedMembershipGeneration !== media.membershipGeneration) {
        throw Error("leave does not own current authenticated membership");
      }
      if (runtime.leaveFailure) throw Error("durable cleanup unavailable");
      if (runtime.leaveBarrier) await runtime.leaveBarrier;
      return { roomId: input.roomId, userId: runtime.userId, membershipGeneration: input.expectedMembershipGeneration, membershipState: "left", leftAt: new Date().toISOString(), micEnabled: false, cameraEnabled: false };
    },
  });
  Object.assign(media, { userId: runtime.userId, remoteUserId: runtime.remoteUserId, roomId: runtime.roomId });
  runtime.media = media;
  const prepareAdmission = media.api.prepareCommunicationRoomAdmission;
  media.api.prepareCommunicationRoomAdmission = async (input) => {
    if (durableThread) {
      assert.equal(input.userId, runtime.userId, "admission account must match the mounted session");
      assert.equal(durableThread.rooms.get(input.roomId)?.status, "active", "only an active room can admit capture");
      assert.equal(durableThread.invite?.communicationRoomId, input.roomId, "admission must own the active invite room");
      assert.equal(durableThread.invite?.status, "accepted", "ringing cannot admit capture");
      media.roomId = input.roomId;
      runtime.roomId = input.roomId;
    }
    return prepareAdmission(input);
  };
  const readSnapshot = media.api.getCommunicationRoomSnapshot;
  media.api.getCommunicationRoomSnapshot = async (...args) => {
    const snapshot = await readSnapshot(...args);
    if (!snapshot) return null;
    if (!durableThread) return { ...snapshot, room: { ...snapshot.room, hostUserId: runtime.invite?.callerUserId } };
    const room = durableThread.rooms.get(args[0]);
    if (!room) return null;
    return { ...snapshot, memberships: snapshot.memberships.map(member => ({ ...member, roomId: args[0] })),
      room: { ...snapshot.room, ...room, roomId: args[0], roomCode: args[0] } };
  };
  // Scenario-specific state belongs at the modeled API boundary. The screen,
  // adapter, admission coordinator, and legacy hook still execute unchanged.
  options.configureMedia?.(media);
  const idleLiveKit = () => ({});
  const ownedAudio = loadOwnedAndroidAudioRoute({ nativeModule: options.ownedAudioNativeModule, platform: runtime.platform,
    deviceEventEmitter: options.ownedAudioDeviceEventEmitter,
    appState: { get currentState() { return runtime.appState; }, addEventListener: (_event, listener) => {
      appStateListeners.add(listener); return { remove: () => appStateListeners.delete(listener) };
    } } });
  const adapter = compile(options.adapterSource ?? fs.readFileSync("hooks/use-chat-call-media-session.ts", "utf8"), "hooks/use-chat-call-media-session.ts", {
    react: React, "../_lib/chatCallMediaProviderPolicy": compile(fs.readFileSync("_lib/chatCallMediaProviderPolicy.ts", "utf8"), "_lib/chatCallMediaProviderPolicy.ts", {}),
    "./use-communication-room-session": { useCommunicationRoomSession: media.useHook },
    "./use-livekit-chat-call-session": { useLiveKitChatCallSession: idleLiveKit },
    "./use-legacy-android-audio-route": ownedAudio.hook,
  });
  const chat = {
    getChatThread: async (id) => runtime.readThread ? runtime.readThread(id)
      : durableThread && id !== durableThread.threadId ? null : ({ ...runtime.thread }),
    listChatMessages: async (id) => durableThread ? durableThread.list(runtime.userId, id) : [],
    sendChatMessage: async (id, body, attachment) => {
      if (!durableThread) throw Error("message writes require the durable thread fixture");
      return durableThread.send(runtime.userId, id, body, attachment);
    },
    markChatThreadRead: async () => {}, subscribeToThread: (_id, fn) => {
      runtime.threadSubscriptions.add(fn); durableThread?.listeners.add(fn);
      return () => { runtime.threadSubscriptions.delete(fn); durableThread?.listeners.delete(fn); };
    },
    clearEndedChatThreadCall: async (...args) => {
      runtime.clears.push(args);
      return runtime.clearThread ? runtime.clearThread(...args) : { cleared: true, reason: "ended" };
    },
    startChatThreadCall: async (id, callType) => {
      if (durableThread) {
        const invite = durableThread.start(runtime.userId, id, callType);
        runtime.roomId = invite.communicationRoomId;
        media.roomId = runtime.roomId;
        return { thread: { ...runtime.thread }, roomId: runtime.roomId, role: "caller", invite, delivery: {} };
      }
      runtime.thread.activeCommunicationRoomId = runtime.roomId;
      runtime.thread.activeCallType = runtime.invite.callType;
      return { thread: { ...runtime.thread }, roomId: runtime.roomId, role: "caller", invite: { ...runtime.invite }, delivery: {} };
    },
  };
  const nativeListeners = new Set();
  const retainedNativeMedia = new Map();
  const nativeAudioReady = new Set();
  const observeNativeAudio = event => {
    if (event.type === "audioSessionActivated" && event.audioSdkSynchronized !== false) {
      for (const {descriptor} of retainedNativeMedia.values()) {
        if (!event.callUuid || event.callUuid === descriptor.callUuid) nativeAudioReady.add(descriptor.callUuid);
      }
    }
    if (["audioSessionDeactivated", "audioSessionFailed", "audioInterruptionBegan"].includes(event.type)) nativeAudioReady.clear();
  };
  const native = {
    isIosNativeCallsRuntimeEnabled: () => false, hasIosNativeCallPresentation: () => false,
    subscribeToIosNativeCallPresentation: () => noop,
    subscribeToIosNativeCallEvents: (fn) => { nativeListeners.add(fn); return () => nativeListeners.delete(fn); },
    readIosNativeApplicationActiveSerial: () => 0,
    isIosNativeCallAuthorityCurrent: () => true,
    isIosAcceptedNativeMediaAuthorityCurrent: (descriptor, input) => retainedNativeMedia.get(descriptor.inviteId)?.descriptor === descriptor
      && retainedNativeMedia.get(descriptor.inviteId)?.sessionGeneration === input.sessionGeneration,
    readIosAcceptedNativeMediaSession: input => {
      const retained = retainedNativeMedia.get(input.inviteId);
      return retained && retained.sessionGeneration === input.sessionGeneration
        && mediaPolicy.doesIosAcceptedCallKitMediaDescriptorOwnSession({ ...input, descriptor: retained.descriptor })
        ? { ...retained, nativeAuthorityCurrent: true, audioSessionActive: nativeAudioReady.has(retained.descriptor.callUuid) } : null;
    },
    retainIosAcceptedNativeMediaSession: descriptor => {
      retainedNativeMedia.set(descriptor.inviteId, {descriptor, sessionGeneration: runtime.sessionGeneration,
        readinessDeadlineMs: (options.screenPerformance ?? performance).now() + 15_000});
      return true;
    },
    releaseIosAcceptedNativeMediaSession: inviteId => retainedNativeMedia.delete(inviteId),
    ensureIosForegroundIncomingCallPresentation: async () => "stale", requestIosNativeCallAnswer: async () => false,
    endIosNativeCall: async (...args) => { runtime.nativeEnds.push(args); return true; },
    reportIosNativeCallRemoteEnd: async (...args) => { runtime.nativeEnds.push(args); return true; },
    completeIosNativeCallAnswer: async (uuid, connected) => {
      runtime.nativeCompletions.push({ uuid, connected });
      return runtime.completeNative ? runtime.completeNative(uuid, connected) : true;
    },
    setIosNativeCallAudioRoute: async () => true, setIosNativeCallMuted: async () => true,
    createIosOutgoingAudioHandoff: input => {
      const handoff = { input, retired: false, prepareCalls: 0,
        retire() { handoff.retired = true; },
        async prepare(drained) {
          handoff.prepareCalls += 1;
          await drained;
          await options.outgoingAudioPrepare?.(handoff);
        },
      };
      runtime.outgoingAudioHandoffs.push(handoff);
      return handoff;
    },
  };
  // Root-to-thread composition may share the actual production JS native facade.
  // Existing isolated cases keep their explicit native-module boundary fixture.
  if (options.nativeFacade) Object.assign(native, options.nativeFacade);
  const defaults = { runtimeControls: { chat_enabled: true, chat_attachments_enabled: true } };
  const router = { setParams: patch => Object.assign(runtime.params, patch), push: noop, replace: noop, back: noop };
  const modules = {
    "../../_lib/internalCallMediaDiagnostics": { reportInternalCallMediaDiagnostic() {} },
    react: React, "expo-router": { useFocusEffect: (callback) => React.useEffect(callback, [callback]),
      useLocalSearchParams: () => ({ ...runtime.params, threadId: runtime.threadId }), useRouter: () => router },
    "@expo/vector-icons/MaterialIcons": noop,
    "react-native": { Platform: { OS: runtime.platform }, StyleSheet: { create: (v) => v }, Vibration: { cancel: noop, vibrate: noop },
      AppState: { get currentState() { return runtime.appState; }, addEventListener: (_event, listener) => {
        appStateListeners.add(listener); return { remove: () => appStateListeners.delete(listener) };
      } },
      Keyboard: { dismiss: () => { runtime.keyboard.visible = false; runtime.keyboard.dismissals += 1; } } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "../../_lib/analytics": { trackEvent: noop }, "../../_lib/appConfig": { DEFAULT_APP_CONFIG: defaults, readAppConfig: async () => defaults },
    "../../_lib/chillyChatCalls": inviteApi, "../../_lib/chat": chat,
    "../../_lib/communication": { getCommunicationRoomSnapshot: async (roomId) => ({ room: {
      status: durableThread ? durableThread.rooms.get(roomId)?.status ?? "ended"
        : ["ended", "canceled", "declined", "missed", "busy"].includes(runtime.invite?.status) ? "ended" : "active",
    } }) },
    "../../_lib/communicationCallMediaPolicy.mjs": mediaPolicy,
    "../../_lib/chillyChatNativeCallRoutes.mjs": nativeRoutes,
    "../../_lib/communicationRoomIdentifier.mjs": { normalizeCommunicationRoomIdentifier: (v) => String(v ?? "").trim() },
    "../../_lib/chillyChatCallDeliveryCopy": { isChillyChatCallDeviceAlertConfirmed: () => false, getChillyChatCallDeliveryMessage: () => "Waiting for answer" },
    "../../_lib/chillyChatCallSoundAssets": { playChillyChatCallSound: async () => null, stopChillyChatCallSound: async () => {} },
    "../../_lib/displayText": { decodeVisiblePercentEscapes: (v) => v },
    "../../_lib/friendGraph": { readFriendRelationshipState: async () => null },
    "../../_lib/logger": { reportRuntimeError: (scope, error) => runtime.errors.push({ scope, message: error?.message }) },
    "../../_lib/iosNativeCalls": native,
    "../../_lib/nativeCallTransitionProvenance.mjs": nativeProvenance,
    "../../_lib/moderation": {},
    "../../_lib/notifications": {
      dismissChillyChatCallNotificationRows: async (input) => { runtime.notifications.push(input); return 0; },
      dismissPresentedChillyChatCallNotifications: async (input) => { runtime.notifications.push(input); return 0; },
      readNotificationPreferences: async () => ({ chillyChatCallsEnabled: true }),
      requestPushPermissionAndRegister: async () => {}, refreshPushRegistrationIfGranted: async () => {},
    },
    "../../_lib/officialAccounts": { getOfficialPlatformAccount: () => null },
    "../../_lib/performancePolicy": { READ_RECEIPT_THROTTLE_MS: 500 },
    "../../_lib/session": { useSession: () => React.useMemo(() => ({ authority: { userId: runtime.userId, accountId: runtime.userId, sessionGeneration: runtime.sessionGeneration, state: "ACTIVE", restoreOnly: false }, session: { access_token: runtime.accessToken ?? "test-token" }, user: { id: runtime.userId }, isSignedIn: true, isLoading: false }), [runtime.userId, runtime.sessionGeneration, runtime.accessToken]) },
    "../../_lib/userFacingErrors": { getUserFacingErrorMessage: (error, fallback) => error?.message ?? fallback },
    "../../_lib/usernameHandles": { formatUsernameHandle: () => "" },
    "../../_lib/socialAttachmentPicker": {},
    "../../hooks/use-chat-call-media-session": adapter,
  };
  // Execute the actual outgoing hook; only sound/native/authority boundaries
  // are modeled. In particular iOS outgoing readiness is never bypassed.
  modules["../../hooks/use-outgoing-ios-call-audio-handoff"] = compile(
    fs.readFileSync("hooks/use-outgoing-ios-call-audio-handoff.ts", "utf8"),
    "hooks/use-outgoing-ios-call-audio-handoff.ts", {
      react: React, "react-native": modules["react-native"],
      "../_lib/iosNativeCalls": native,
      "../_lib/accountSessionAuthority": {
        getCurrentAccountSessionAuthoritySnapshot: () => ({ userId: runtime.userId, accountId: runtime.userId,
          sessionGeneration: runtime.sessionGeneration, state: "ACTIVE", restoreOnly: false }),
        sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId
          && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration
          && a.state === b.state && a.restoreOnly === b.restoreOnly,
      },
      "../_lib/chillyChatCallSoundAssets": {
        claimChillyChatCallAudioHandoff: (owner, isCurrent) => {
          runtime.soundClaims.push({ owner, isCurrent });
          runtime.soundOwner = owner;
          return Promise.resolve(options.outgoingSoundDrain?.());
        },
        releaseChillyChatCallAudioHandoff: owner => {
          runtime.soundReleases.push(owner);
          if (runtime.soundOwner === owner) runtime.soundOwner = null;
        },
      },
    }, {
      crypto: { getRandomValues: bytes => bytes.fill(runtime.outgoingAudioHandoffs.length + 1) },
      setTimeout: (fn, delay) => { const timer = { fn, delay }; runtime.timers.push(timer); return timer; },
      clearTimeout: timer => { if (timer) timer.canceled = true; },
    });
  let source = fs.readFileSync(process.env.CHILLY_CHAT_FULL_THREAD_TEST_SOURCE ?? "app/chat/[threadId].tsx", "utf8");
  // Preserve the actual screen-to-panel expressions even though native JSX
  // rendering is outside this fixture. Copied handler names would hide a
  // no-op button binding or a permanently busy panel in the production JSX.
  const parsedScreen = ts.createSourceFile("thread.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const panelBindings = new Map();
  const presentationBindings = new Map();
  const requiredPanelBindings = ["showControls", "showMediaControls", "mediaControlsBusy", "onToggleCamera", "onToggleMic", "onSwitchCamera", "onLeave", "onToggleAudioRoute", "speakerEnabled", "mediaControlMessage"];
  const visit = node => {
    if (ts.isJsxElement(node)) {
      const attrs = node.openingElement.attributes.properties;
      const testId = attrs.find(attr => ts.isJsxAttribute(attr) && attr.name.text === "testID")?.initializer?.text;
      if (testId === "chat-thread-incoming-call-banner") {
        let branch = node;
        while (ts.isParenthesizedExpression(branch.parent)) branch = branch.parent;
        assert.ok(ts.isConditionalExpression(branch.parent), "banner visibility must come from its actual JSX condition");
        presentationBindings.set("incomingBannerVisible", `Boolean(${branch.parent.condition.getText(parsedScreen)})`);
      }
      if (["chat-thread-voice-call-button", "chat-thread-video-call-button"].includes(testId)) {
        const disabled = attrs.find(attr => ts.isJsxAttribute(attr) && attr.name.text === "disabled");
        presentationBindings.set(testId.includes("voice") ? "voiceCallDisabled" : "videoCallDisabled", disabled.initializer.expression.getText(parsedScreen));
      }
    }
    if (ts.isCallExpression(node) && node.expression.getText(parsedScreen) === "getThreadStatusLabel") {
      presentationBindings.set("threadStatusLabel", node.getText(parsedScreen));
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsedScreen) === "InRoomCommunicationPanel") {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !requiredPanelBindings.includes(attribute.name.text)) continue;
        assert.ok(attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression);
        assert.equal(panelBindings.has(attribute.name.text), false, "panel binding must be unique");
        panelBindings.set(attribute.name.text, attribute.initializer.expression.getText(parsedScreen));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsedScreen);
  assert.equal(panelBindings.size, requiredPanelBindings.length, "actual panel bindings must remain observable");
  assert.equal(presentationBindings.size, 4, "actual ringing presentation bindings must remain observable");
  const panelBindingSource = [...panelBindings].map(([name, expression]) => `${name}: (${expression})`).join(",");
  const presentationBindingSource = [...presentationBindings].map(([name, expression]) => `${name}: (${expression})`).join(",");
  const screenFunction = parsedScreen.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  const presentationDeclarations = screenFunction.body.statements.filter(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(declaration => ["incomingCallInviteId", "iosNativeCallPresentationOwned", "waitingForIosNativePresentation"].includes(declaration.name.getText(parsedScreen))))
    .map(node => node.getText(parsedScreen)).join("\n");
  // Retain every screen hook/effect/callback. Only the render tree is replaced;
  // no call handlers, response checks, states, or lifecycle effects are replaced.
  const marker = "  if (authLoading || loading) {";
  assert.equal(source.split(marker).length, 2);
  source = source.slice(0, source.indexOf(marker)) + `
    ${presentationDeclarations}
    useLayoutEffect(() => { runtime.snapshot = { loading, error, callControlError,
      panelBindings: { ${panelBindingSource} },
      presentation: { ${presentationBindingSource} },
      callBusy, callPanelOpen, activeCallInvite, activeCallRoomId, incomingCallInvite,
      callChannelState, cameraEnabled, micEnabled, participantCount, participants,
      nativeSpeakerEnabled, canSetCallMediaSpeaker,
      callTitle, callBody, initialCallMediaPreferences, messages, renderedMessages, draft, sending, setDraft,
      handleAcceptIncomingCall, handleJoinOrCloseCall, handleStartCall, handleToggleCallMic,
      handleToggleCallCamera, handleSwitchCallCamera, handleToggleNativeAudioRoute,
      loadThreadState, handleSend, handleDeclineIncomingCall }; });
    return null;
  }`;
  for (const match of source.matchAll(/from "([^\"]+)"/g)) {
    if (match[1].startsWith("../../components/")) modules[match[1]] = {};
  }
  const screen = compile(source, "app/chat/[threadId].tsx", modules, {
    runtime, Date: options.screenDate ?? Date,
    performance: options.screenPerformance ?? performance,
    setTimeout: (fn, delay) => { const timer = { fn, delay }; runtime.timers.push(timer); return timer; },
    clearTimeout: (timer) => { if (timer) timer.canceled = true; },
    setInterval: (fn, delay) => { const timer = { fn, delay }; runtime.intervals.push(timer); return timer; },
    clearInterval: (timer) => { if (timer) timer.canceled = true; },
  });
  const root = createRoot(container());
  const render = async () => React.act(async () => { root.render(React.createElement(screen.default)); await settle(); });
  await render();
  if (durableThread) durableThread.listeners.add(notifyInvite);
  return { runtime, act: React.act,
    async run(fn) { let result; await React.act(async () => { result = await fn(); await settle(); }); return result; },
    async flush() { await React.act(settle); },
    async fireTimer(timer) { timer.canceled = true; await React.act(async () => { await timer.fn(); await settle(); }); },
    async nativeEvent(event) { await React.act(async () => { observeNativeAudio(event); for (const listener of nativeListeners) listener(event); await settle(); }); },
    async appState(state) { await React.act(async () => {
      runtime.appState = state;
      for (const listener of appStateListeners) listener(state);
      await media.emitAppState(state);
      await settle();
    }); },
    emitNativeEvent(event) { observeNativeAudio(event); for (const listener of nativeListeners) listener(event); },
    async rerender(patch) {
      Object.assign(runtime, patch);
      if (durableThread) Object.assign(media, { userId: runtime.userId, remoteUserId: runtime.remoteUserId });
      await render();
    },
    async terminal(status = "ended") { await React.act(async () => { runtime.invite = { ...runtime.invite, status }; runtime.thread.activeCommunicationRoomId = null; runtime.thread.activeCallType = null; await notifyInvite(); }); },
    async unmount() { durableThread?.listeners.delete(notifyInvite); await React.act(async () => { root.unmount(); await settle(); }); },
  };
}
