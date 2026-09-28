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

export async function mountFullChatThread(options = {}) {
  const runtime = {
    userId: "local-user", remoteUserId: "remote-user", threadId: "thread", roomId: "ROOM-LEGACY",
    platform: "android", sessionGeneration: "session-1", errors: [], transitions: [],
    leaves: [], hostEnds: 0, clears: [], nativeEnds: [], notifications: [], timers: [], intervals: [],
    subscriptions: new Set(), threadSubscriptions: new Set(), ...options,
  };
  runtime.invite = { id: "invite", threadId: runtime.threadId, communicationRoomId: runtime.roomId,
    callerUserId: runtime.remoteUserId, calleeUserId: runtime.userId, status: "ringing",
    callType: "video", mediaProvider: "legacy_webrtc", expiresAt: new Date(Date.now() + 90_000).toISOString(),
    ...options.invite };
  runtime.thread = { threadId: runtime.threadId, activeCommunicationRoomId: runtime.roomId,
    activeCallType: runtime.invite.callType, members: [], otherMember: { userId: runtime.remoteUserId, displayName: "Other" } };
  if (options.noActiveCall) { runtime.thread.activeCommunicationRoomId = null; runtime.thread.activeCallType = null; }
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
    readChillyChatCallInvite: async () => runtime.readInvite ? runtime.readInvite() : ({ ...runtime.invite }),
    readLatestChillyChatCallInviteForRoom: async () => ({ ...runtime.invite }),
    readLatestRingingChillyChatCallInvite: async () => runtime.invite.status === "ringing" ? { ...runtime.invite } : null,
    subscribeToChillyChatCallInvite: (_id, fn) => { runtime.subscriptions.add(fn); return () => runtime.subscriptions.delete(fn); },
    updateChillyChatCallInviteStatus: async ({ invite, status }) => {
      runtime.transitions.push({ id: invite.id, status });
      if (runtime.transition) return runtime.transition({ invite, status });
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
      if (input.roomId !== runtime.roomId || input.userId !== runtime.userId
        || input.expectedMembershipGeneration !== media.membershipGeneration) {
        throw Error("leave does not own current authenticated membership");
      }
      if (runtime.leaveFailure) throw Error("durable cleanup unavailable");
      if (runtime.leaveBarrier) await runtime.leaveBarrier;
      return { roomId: runtime.roomId, userId: runtime.userId, membershipGeneration: input.expectedMembershipGeneration, membershipState: "left", leftAt: new Date().toISOString(), micEnabled: false, cameraEnabled: false };
    },
  });
  Object.assign(media, { userId: runtime.userId, remoteUserId: runtime.remoteUserId, roomId: runtime.roomId });
  runtime.media = media;
  const readSnapshot = media.api.getCommunicationRoomSnapshot;
  media.api.getCommunicationRoomSnapshot = async (...args) => {
    const snapshot = await readSnapshot(...args);
    return { ...snapshot, room: { ...snapshot.room, hostUserId: runtime.invite.callerUserId } };
  };
  const idleLiveKit = () => ({});
  const adapter = compile(fs.readFileSync("hooks/use-chat-call-media-session.ts", "utf8"), "hooks/use-chat-call-media-session.ts", {
    react: React, "../_lib/chatCallMediaProviderPolicy": compile(fs.readFileSync("_lib/chatCallMediaProviderPolicy.ts", "utf8"), "_lib/chatCallMediaProviderPolicy.ts", {}),
    "./use-communication-room-session": { useCommunicationRoomSession: media.useHook },
    "./use-livekit-chat-call-session": { useLiveKitChatCallSession: idleLiveKit },
  });
  const chat = {
    getChatThread: async () => ({ ...runtime.thread }), listChatMessages: async () => [],
    markChatThreadRead: async () => {}, subscribeToThread: (_id, fn) => { runtime.threadSubscriptions.add(fn); return () => runtime.threadSubscriptions.delete(fn); },
    clearEndedChatThreadCall: async (...args) => { runtime.clears.push(args); return { cleared: true, reason: "ended" }; },
    startChatThreadCall: async () => {
      runtime.thread.activeCommunicationRoomId = runtime.roomId;
      runtime.thread.activeCallType = runtime.invite.callType;
      return { thread: { ...runtime.thread }, roomId: runtime.roomId, role: "caller", invite: { ...runtime.invite }, delivery: {} };
    },
  };
  const nativeListeners = new Set();
  const native = {
    isIosNativeCallsRuntimeEnabled: () => false, hasIosNativeCallPresentation: () => false,
    subscribeToIosNativeCallPresentation: () => noop,
    subscribeToIosNativeCallEvents: (fn) => { nativeListeners.add(fn); return () => nativeListeners.delete(fn); },
    readIosNativeApplicationActiveSerial: () => 0,
    waitForIosNativeCallPresentation: async () => "unavailable", requestIosNativeCallAnswer: async () => false,
    endIosNativeCall: async (...args) => { runtime.nativeEnds.push(args); return true; },
    reportIosNativeCallRemoteEnd: async (...args) => { runtime.nativeEnds.push(args); return true; },
    completeIosNativeCallAnswer: async (uuid, connected) => {
      runtime.nativeCompletions.push({ uuid, connected });
      return runtime.completeNative ? runtime.completeNative(uuid, connected) : true;
    },
    setIosNativeCallAudioRoute: async () => true, setIosNativeCallMuted: async () => true,
  };
  const defaults = { runtimeControls: { chat_enabled: true, chat_attachments_enabled: true } };
  const router = { setParams: patch => Object.assign(runtime.params, patch), push: noop, replace: noop, back: noop };
  const modules = {
    react: React, "expo-router": { useFocusEffect: (callback) => React.useEffect(callback, [callback]),
      useLocalSearchParams: () => ({ ...runtime.params, threadId: runtime.threadId }), useRouter: () => router },
    "@expo/vector-icons/MaterialIcons": noop,
    "react-native": { Platform: { OS: runtime.platform }, StyleSheet: { create: (v) => v }, Vibration: { cancel: noop, vibrate: noop } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "../../_lib/analytics": { trackEvent: noop }, "../../_lib/appConfig": { DEFAULT_APP_CONFIG: defaults, readAppConfig: async () => defaults },
    "../../_lib/chillyChatCalls": inviteApi, "../../_lib/chat": chat,
    "../../_lib/communication": { getCommunicationRoomSnapshot: async () => ({ room: { status: runtime.invite.status === "ended" ? "ended" : "active" } }) },
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
    "../../_lib/session": { useSession: () => React.useMemo(() => ({ authority: { userId: runtime.userId, sessionGeneration: runtime.sessionGeneration }, session: { access_token: "test-token" }, user: { id: runtime.userId }, isSignedIn: true, isLoading: false }), [runtime.userId, runtime.sessionGeneration]) },
    "../../_lib/userFacingErrors": { getUserFacingErrorMessage: (error, fallback) => error?.message ?? fallback },
    "../../_lib/usernameHandles": { formatUsernameHandle: () => "" },
    "../../_lib/socialAttachmentPicker": {},
    "../../hooks/use-chat-call-media-session": adapter,
  };
  let source = fs.readFileSync(process.env.CHILLY_CHAT_FULL_THREAD_TEST_SOURCE ?? "app/chat/[threadId].tsx", "utf8");
  // Retain every screen hook/effect/callback. Only the render tree is replaced;
  // no call handlers, response checks, states, or lifecycle effects are replaced.
  const marker = "  if (authLoading || loading) {";
  assert.equal(source.split(marker).length, 2);
  source = source.slice(0, source.indexOf(marker)) + `
    useLayoutEffect(() => { runtime.snapshot = { loading, error, callControlError,
      callBusy, callPanelOpen, activeCallInvite, activeCallRoomId, incomingCallInvite,
      callChannelState, cameraEnabled, micEnabled, participantCount, participants,
      callTitle, callBody, initialCallMediaPreferences,
      handleAcceptIncomingCall, handleJoinOrCloseCall, handleStartCall, handleToggleCallMic,
      handleToggleCallCamera, handleSwitchCallCamera, handleToggleNativeAudioRoute,
      loadThreadState }; });
    return null;
  }`;
  for (const match of source.matchAll(/from "([^\"]+)"/g)) {
    if (match[1].startsWith("../../components/")) modules[match[1]] = {};
  }
  const screen = compile(source, "app/chat/[threadId].tsx", modules, {
    runtime, setTimeout: (fn, delay) => { const timer = { fn, delay }; runtime.timers.push(timer); return timer; },
    clearTimeout: (timer) => { if (timer) timer.canceled = true; },
    setInterval: (fn, delay) => { const timer = { fn, delay }; runtime.intervals.push(timer); return timer; },
    clearInterval: (timer) => { if (timer) timer.canceled = true; },
  });
  const root = createRoot(container());
  const render = async () => React.act(async () => { root.render(React.createElement(screen.default)); await settle(); });
  await render();
  return { runtime, act: React.act,
    async run(fn) { let result; await React.act(async () => { result = await fn(); await settle(); }); return result; },
    async flush() { await React.act(settle); },
    async fireTimer(timer) { timer.canceled = true; await React.act(async () => { await timer.fn(); await settle(); }); },
    async nativeEvent(event) { await React.act(async () => { for (const listener of nativeListeners) listener(event); await settle(); }); },
    async rerender(patch) { Object.assign(runtime, patch); await render(); },
    async terminal(status = "ended") { await React.act(async () => { runtime.invite = { ...runtime.invite, status }; runtime.thread.activeCommunicationRoomId = null; runtime.thread.activeCallType = null; await notifyInvite(); }); },
    async unmount() { await React.act(async () => { root.unmount(); await settle(); }); },
  };
}
