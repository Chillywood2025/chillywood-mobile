import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { resolveAcceptedChatCallRoomId } from "../../../_lib/communicationCallMediaPolicy.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { createRoot } = require("react-dom/client");
const ts = require("typescript");
const path = "app/chat/[threadId].tsx";
const source = fs.readFileSync(process.env.CHILLY_CHAT_THREAD_TEST_SOURCE ?? path, "utf8");
const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "ChillyChatThreadScreen");
const names = new Set(["readAcceptableIncomingInvite", "resumeAcceptedIncomingInvite", "acceptIncomingInvite", "handleAcceptIncomingCall"]);
const declarations = screen.body.statements.filter((node) => ts.isVariableStatement(node)
  && node.declarationList.declarations.some((declaration) => names.has(declaration.name.getText(tree))));
if (declarations.length !== names.size) throw new Error("Chat Answer source selection changed; review harness.");
const ownershipHook = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "useChatThreadOperationOwnership");
const microphoneHook = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "useIosNativeMicrophoneAcknowledgements");
const presentationHook = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "useExpiredIncomingCallPresentation");

export const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, reject, resolve };
};
const settle = async () => { for (let turn = 0; turn < 30; turn += 1) await Promise.resolve(); };
const noop = () => undefined;
const installDom = () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
  const element = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: document, parentNode: null, tagName: "DIV" });
  document.documentElement = element();
  globalThis.document = document;
  globalThis.window = globalThis;
  globalThis.HTMLIFrameElement = class {};
  return element();
};

export async function mountChatAnswer(options = {}) {
  const runtime = {
    currentUserId: "callee", threadId: "thread", sessionGeneration: "session-1", isSignedIn: true,
    platform: "android", requestedNativeCallUuid: "", accepted: [], errors: [], delivery: [], updates: [],
    clears: [], notifications: [], completions: [], nativeRequests: [], loads: 0,
    invite: { id: "invite", threadId: "thread", communicationRoomId: "room", callerUserId: "caller", calleeUserId: "callee", status: "ringing", callType: "voice", mediaProvider: "legacy_webrtc", expiresAt: new Date(Date.now() + 90_000).toISOString() },
    ...options,
  };
  runtime.readInvite = options.readInvite ?? (async () => runtime.invite);
  runtime.readThread = options.readThread ?? (async () => ({ threadId: runtime.threadId, activeCommunicationRoomId: "room" }));
  runtime.update = options.update ?? (async ({ invite }) => ({ ...invite, status: "accepted" }));
  runtime.presentation = options.presentation ?? (async () => "presented");
  runtime.requestNative = options.requestNative ?? (async () => true);
  runtime.micEnabled = options.micEnabled ?? false;
  runtime.mediaMutations = [];
  runtime.nativeMuteRequests = [];
  runtime.readMessages = options.readMessages ?? (async () => []);
  runtime.readSnapshot = options.readSnapshot ?? (async () => ({ room: { status: "active" } }));
  runtime.routeRequests = []; runtime.speakerWrites = []; runtime.controlErrors = [];
  runtime.setSpeaker = options.setSpeaker ?? (async () => true);
  runtime.setNativeRoute = options.setNativeRoute ?? (async () => true);
  runtime.toggleCamera = options.toggleCamera ?? (async () => true);
  runtime.switchCamera = options.switchCamera ?? (async () => true);
  runtime.clearThread = options.clearThread ?? (async () => {});
  runtime.callChannelState = options.callChannelState ?? "connecting";
  runtime.activeCallRoomId = options.activeCallRoomId ?? "room";
  runtime.callMediaProvider = options.callMediaProvider ?? "livekit";
  runtime.activeCallType = options.activeCallType ?? "voice";
  runtime.nativeMediaActivationSerial = 0;
  runtime.timeouts = [];
  const controlNames = new Set(["nativeAudioRouteQueueRef", "nativeAudioRouteIntentRef", "applyCallAudioRoute", "handleToggleNativeAudioRoute", "handleToggleCallCamera", "handleSwitchCallCamera"]);
  const declineNames = new Set(["requestAuthoritativeIncomingCallDecline", "handleDeclineIncomingCall"]);
  const mediaDeclaration = screen.body.statements.find((node) => ts.isVariableStatement(node) && node.getText(tree).includes("= useChatCallMediaSession({"));
  const mediaCall = mediaDeclaration.declarationList.declarations[0].initializer;
  const endedCallback = mediaCall.arguments[0].properties.find((node) => node.name?.getText(tree) === "onRoomEnded").initializer;
  const readNames = new Set(["reconcileEndedCallState", "loadThreadState"]);
  const panel = (() => {
    let found;
    const visit = node => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "InRoomCommunicationPanel") found = node; ts.forEachChild(node, visit); };
    visit(screen);
    return Object.fromEntries(["showControls", "showMediaControls"].map(name => [name, found.attributes.properties.find(attribute => attribute.name?.getText(tree) === name).initializer.expression.getText(tree)]));
  })();
  const selected = options.terminalMode ? screen.body.statements.filter(node => (ts.isExpressionStatement(node) && (options.terminalMode === "active" ? node.getText(tree).includes("const reconcileActiveInvite =") : node.getText(tree).includes("const applyInviteState ="))) || (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(tree) === "handleJoinOrCloseCall")))
    : options.timerMode ? screen.body.statements.filter((node) => ts.isExpressionStatement(node)
    && node.getText(tree).includes("incomingCallTimeoutRef.current = setTimeout(async"))
    : options.nativeMode ? screen.body.statements.filter((node) => (
    ts.isExpressionStatement(node) && node.getText(tree).includes('const action = ["answer", "decline", "end", "mute", "unmute"]')
  ) || (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(tree) === "requestAuthoritativeIncomingCallDecline")))
    : options.settlementMode ? screen.body.statements.filter((node) => ts.isExpressionStatement(node) && node.getText(tree).includes("const candidate = acceptedIosNativeMediaDescriptorRef.current"))
    : options.joinMode ? screen.body.statements.filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(tree) === "handleJoinOrCloseCall"))
    : options.controlsMode ? screen.body.statements.filter((node) => (
    ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => controlNames.has(declaration.name.getText(tree)))
  ) || (ts.isExpressionStatement(node) && node.getText(tree).includes("const route = resolveIosChatCallAudioRoute")))
    : options.declineMode ? screen.body.statements.filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declineNames.has(declaration.name.getText(tree))))
    : options.endedMode ? [] : options.micMode ? screen.body.statements.filter((node) => (
    ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => ["microphoneControlOperationRef", "handleToggleCallMic"].includes(declaration.name.getText(tree)))
  ) || (ts.isExpressionStatement(node) && node.getText(tree).includes("return subscribeToIosNativeCallEvents")))
    : options.readMode ? screen.body.statements.filter((node) => ts.isVariableStatement(node)
      && node.declarationList.declarations.some((declaration) => readNames.has(declaration.name.getText(tree)))) : declarations;
  const compiled = ts.transpileModule(`
    ${ownershipHook?.getText(tree) ?? ""}
    ${microphoneHook?.getText(tree) ?? ""}
    ${presentationHook?.getText(tree) ?? ""}
    exports.Component = function Component() {
      const { currentUserId, threadId, isSignedIn, sessionGeneration, requestedNativeCallUuid } = runtime;
      const activeIosNativeAudioCallUuid = runtime.requestedNativeCallUuid;
      const [callBusy, setCallBusy] = useState(false);
      const [nativeSpeakerEnabled, setNativeSpeakerState] = useState(false);
      const setNativeSpeakerEnabled = useCallback((value) => { runtime.speakerWrites.push(value); setNativeSpeakerState(value); }, []);
      const { callChannelState, activeCallRoomId, callMediaProvider, nativeMediaActivationSerial } = runtime;
      const canSetCallMediaSpeaker = runtime.canSetSpeaker ?? callMediaProvider === "livekit";
      const callMediaSpeakerEnabled = runtime.speakerEnabled ?? false;
      const activeCallInvite = runtime.invite;
      const thread = { activeCallType: runtime.activeCallType, activeCommunicationRoomId: runtime.threadRoomId ?? null };
      const resolvedCallType = thread.activeCallType;
      const authority = { userId: currentUserId, accountId: currentUserId, sessionGeneration, state: "ACTIVE", restoreOnly: false };
      const incomingCallInvite = runtime.incomingInvite === null ? null : runtime.invite;
      const outgoingCallInvite = runtime.terminalMode === "outgoing" && runtime.outgoingPresent !== false ? runtime.invite : null;
      ${screen.body.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ["expiredIncomingCallPresentation", "incomingCallPresentationExpired", "presentedThread"].includes(declaration.name.getText(tree)))).map(node => node.getText(tree)).join("\n")}
      const outgoingCallRinging = outgoingCallInvite?.status === "ringing";
      const callError = null; const callLoading = false;
      const callPanelOpen = runtime.callPanelOpen ?? true;
      const callRoom = { hostUserId: 'caller' };
      const officialAccount = false;
      const loading = false;
      const requestedNativeCallAction = runtime.nativeAction ?? 'end';
      const requestedNativeCallRequestKey = runtime.nativeMode ? 'native-request' : '';
      const requestedNativeCallIdentity = requestedNativeCallUuid;
      const trustedNativeCallClaim = {};
      const nativeCallActionHandledRef = useRef('');
      const activeNativeCallActionRequestKeyRef = useRef(requestedNativeCallRequestKey);
      useLayoutEffect(() => () => { activeNativeCallActionRequestKeyRef.current = ''; }, []);
      const handledActiveTerminalInviteIdsRef = useRef(new Set());
      const acceptedIosNativeMediaDescriptorRef = useRef(null);
      acceptedIosNativeMediaDescriptorRef.current = runtime.descriptor;
      const acceptedIosNativeMediaSettlementInFlightRef = useRef(null);
      const micEnabled = runtime.micEnabled;
      const canOpenMediaSettings = false;
      const requestedCallInviteId = runtime.invite.id;
      const incomingCallSoundRef = useRef(null);
      const incomingCallTimeoutRef = useRef(null);
      const activeCallInviteRef = useRef(null);
      if (runtime.controlsMode || runtime.endedMode || runtime.joinMode || runtime.nativeMode || runtime.settlementMode || runtime.terminalMode || runtime.activeReadInvite) activeCallInviteRef.current = runtime.noActiveInvite ? null : activeCallInvite;
      const handledIncomingInviteIdsRef = useRef(new Set());
      const handledIncomingRoomIdsRef = useRef(new Set());
      const ownership = ${ownershipHook ? "useChatThreadOperationOwnership({currentUserId, threadId, sessionGeneration, isSignedIn, setCallBusy, visibleInviteId: incomingCallInvite?.id ?? ''})" : "{}"};
      const { beginAnswerOperation, isAnswerOperationCurrent, finishAnswerOperation, beginThreadRead, isThreadReadCurrent, invalidateThreadReads, captureCallOperation } = ownership;
      const microphone = ${microphoneHook ? "useIosNativeMicrophoneAcknowledgements(JSON.stringify([currentUserId, threadId, sessionGeneration, isSignedIn, activeCallInvite?.id, activeCallInvite?.communicationRoomId]), requestedNativeCallUuid)" : "{}"};
      const { rememberNativeMicAck, consumeNativeMicAck, forgetNativeMicAck, isNativeMicContextCurrent } = microphone;
      ${(options.terminalMode || options.nativeMode || options.endedMode) ? screen.body.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(tree) === "finishTerminalInviteCleanup")).getText(tree) : ""}
      ${selected.map((node) => node.getText(tree)).join("\n")}
      ${options.endedMode ? `const onRoomEnded = ${endedCallback.getText(tree)};` : ""}
      useLayoutEffect(() => { runtime.snapshot = {callBusy, nativeSpeakerEnabled, resolvedCallRoomId: ${screen.body.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(tree) === "activeCallRoomId")).declarationList.declarations[0].initializer.getText(tree)}, showControls: ${panel.showControls}, showMediaControls: ${panel.showMediaControls}, ${options.timerMode || options.nativeMode || options.settlementMode ? "" : (options.joinMode || options.terminalMode) ? "handleJoinOrCloseCall" : options.controlsMode ? "handleToggleNativeAudioRoute, handleToggleCallCamera, handleSwitchCallCamera" : options.declineMode ? "handleDeclineIncomingCall" : options.endedMode ? "onRoomEnded" : options.micMode ? "handleToggleCallMic" : options.readMode ? "loadThreadState, invalidateThreadReads" : "acceptIncomingInvite, resumeAcceptedIncomingInvite, handleAcceptIncomingCall"}}; });
      return null;
    };
  `, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module, runtime,
    useCallback: React.useCallback, useEffect: React.useEffect, useLayoutEffect: React.useLayoutEffect, useMemo: React.useMemo, useRef: React.useRef, useState: React.useState,
    ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS: 4000,
    setInterval: callback => { runtime.interval = callback; return 1; }, clearInterval: noop,
    subscribeToChillyChatCallInvite: (_id, callback) => { runtime.inviteListener = callback; return () => {}; },
    reportIosNativeCallRemoteEnd: async () => runtime.nativeEndResult ?? true,
    Date, Promise, setTimeout: options.timerMode ? (callback, delay) => { const timer = { callback, delay }; runtime.timeouts.push(timer); return timer; } : setTimeout, clearTimeout: options.timerMode ? noop : clearTimeout,
    resolveAcceptedChatCallRoomId,
    Platform: { OS: runtime.platform }, Vibration: { cancel: noop },
    AppState: { addEventListener: () => ({ remove: noop }) },
    readChillyChatCallInvite: (id) => runtime.readInvite(id),
    getChatThread: (id) => runtime.readThread(id),
    listChatMessages: (id) => runtime.readMessages(id),
    listChillyChatCallEvents: async () => [],
    readLatestRingingChillyChatCallInvite: async () => null,
    readLatestChillyChatCallInviteForRoom: () => runtime.readInvite(),
    readNotificationPreferences: async () => ({}),
    getCommunicationRoomSnapshot: (id) => runtime.readSnapshot(id),
    shouldApplyAuthoritativeChatCallCleanup: () => true,
    shouldKeepAcceptedChatCallPanelOpen: ({ wasOpen }) => wasOpen,
    markThreadReadWithThrottle: async () => { runtime.markRead = (runtime.markRead ?? 0) + 1; },
    stopOutgoingRingback: noop,
    reportRuntimeError: noop,
    setThread: (thread) => { runtime.thread = thread; },
    setMessages: (messages) => { runtime.messages = messages; },
    setCallEvents: noop, setCallPreferences: noop, setLoading: noop,
    setIncomingCallInvite: noop, setActiveCallInvite: (value) => { runtime.activeWrites ??= []; runtime.activeWrites.push(value); }, setOutgoingCallInvite: value => { runtime.outgoingPresent = !!value; },
    setCallPanelOpen: (value) => { runtime.panelOpen = typeof value === "function" ? value(runtime.panelOpen) : value; },
    updateChillyChatCallInviteStatus: (input) => { runtime.updates.push(input); return runtime.update(input); },
    ensureIosForegroundIncomingCallPresentation: (input) => runtime.presentation(input.inviteId, input),
    resolveIosForegroundIncomingAnswerAuthority: (outcome) => outcome === "presented" ? "native_answer" : outcome === "not_expected" ? "foreground_answer" : "blocked",
    requestIosNativeCallAnswer: (id, isCurrent) => { runtime.nativeRequests.push(id); return runtime.requestNative(id, isCurrent); },
    setMicrophoneEnabled: async (enabled) => { runtime.mediaMutations.push(enabled); runtime.micEnabled = enabled; return true; },
    consumeAutomaticMicrophoneFeedback: () => false,
    setIosNativeCallMuted: async (callUuid, muted) => {
      runtime.nativeMuteRequests.push({ callUuid, muted });
      if (runtime.nativeMuteFailure) return false;
      if (!runtime.deferNativeMuteEvent) runtime.nativeListener?.({ callUuid, type: muted ? "muted" : "unmuted" });
      return true;
    },
    subscribeToIosNativeCallEvents: (listener) => { runtime.nativeListener = listener; return () => { runtime.nativeListener = null; }; },
    setCallControlError: (message) => { runtime.controlErrors.push(message); },
    toggleCamera: () => runtime.toggleCamera(), switchCamera: () => runtime.switchCamera(),
    setCallMediaSpeaker: (value) => { runtime.routeRequests.push(["media", value]); return runtime.setSpeaker(value); },
    setIosNativeCallAudioRoute: (value) => { runtime.routeRequests.push(["native", value]); return runtime.setNativeRoute(value); },
    resolveIosChatCallAudioRoute: (type) => type === "video" ? "speaker" : "receiver",
    doesNativeCallActionOwnTransition: () => true,
    setTrustedNativeCallClaim: noop, setTrustedNativeCallClaimAccountId: noop,
    setIosNativeAnswerRecoveryBlocked: noop,
    completeIosNativeCallAnswer: async () => true,
    acceptIncomingInvite: async () => true, resumeAcceptedIncomingInvite: async () => true,
    handleDeclineIncomingCall: async () => {},
    leaveRoom: async () => { runtime.leaves = (runtime.leaves ?? 0) + 1; await options.leaveRoom?.(); },
    handleStartCall: async () => {},
    exactIosAcceptedMediaInvite: (invite, descriptor) => invite?.id === descriptor?.inviteId && invite?.communicationRoomId === descriptor?.roomId,
    terminateAcceptedIosNativeAnswer: async () => true,
    settleIosAcceptedCallKitMediaFailure: async (_failure, operations) => { runtime.settlement = operations; return { status: 'ignored' }; },
    setNativeMediaActivationSerial: noop, setNativeApplicationActiveSerial: noop, setNativeAudioSessionCallUuid: noop,
    readIosNativeApplicationActiveSerial: () => 0,
    normalizeCommunicationRoomIdentifier: (value) => String(value ?? "").trim(),
    resolveIncomingCallRoomJoinAction: ({ inviteBelongsToCurrentCallee, inviteStatus }) => inviteBelongsToCurrentCallee && inviteStatus === "accepted" ? "resume" : "blocked",
    clearEndedChatThreadCall: async (...args) => { runtime.clears.push(args[0]); runtime.cleanupArgs ??= []; runtime.cleanupArgs.push(args); await runtime.clearThread(...args); },
    clearVisibleIncomingCallState: (invite) => { runtime.clears.push(invite?.id); },
    setCallDeliveryStatus: (message) => { runtime.delivery.push(message); },
    stopChillyChatCallSound: async () => {},
    completeTrustedIosNativeAnswer: async (invite) => { runtime.completions.push(invite); return true; },
    applyAcceptedIncomingInviteState: (invite) => { runtime.accepted.push(invite); return true; },
    dismissPresentedChillyChatCallNotifications: async (input) => { runtime.notifications.push(input); return 0; },
    dismissChillyChatCallNotificationRows: async (input) => { runtime.notifications.push(input); return 0; },
    rememberHandledIncomingInvite: (invite) => { runtime.handled ??= []; runtime.handled.push(invite); },
    resolveAuthoritativeNativeCallDecline: ({ invite }) => invite?.status === "declined" ? invite : null,
    TERMINAL_CHAT_CALL_INVITE_STATUSES: new Set(["declined", "ended", "missed", "canceled", "busy"]),
    endIosNativeCall: async (...args) => { runtime.nativeEnds ??= []; runtime.nativeEnds.push(args); return runtime.nativeEndResult ?? true; },
    releaseTrustedNativeCallSession: (id) => { runtime.released ??= []; runtime.released.push(id); },
    loadThreadState: async () => { runtime.loads += 1; },
    setError: (message) => { runtime.errors.push(message); },
    getUserFacingErrorMessage: (error, fallback) => error?.message ?? fallback,
    trackEvent: noop, logChatCall: noop, logChatThread: noop,
  }, { filename: path });
  const root = createRoot(installDom());
  const render = async () => React.act(async () => { root.render(React.createElement(module.exports.Component)); await settle(); });
  await render();
  return {
    runtime,
    act: React.act,
    flush: async () => React.act(settle),
    async rerender(patch = {}) { Object.assign(runtime, patch); await render(); },
    async unmount() { await React.act(async () => { root.unmount(); await settle(); }); },
  };
}
