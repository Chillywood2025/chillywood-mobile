import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as lifecycle from "../../_lib/iosNativeCallBridgeLifecycle.mjs";
import * as diagnostics from "../../_lib/nativeCallErrorDiagnostics.mjs";
import * as roomIdentifiers from "../../_lib/communicationRoomIdentifier.mjs";
import * as callMediaPolicy from "../../_lib/communicationCallMediaPolicy.mjs";
import { deferred, mountChatAnswer } from "./helpers/chat-thread-answer-mounted-harness.mjs";

// Execute the production facade and authority parser. Only authenticated RPC /
// row reads, secure install storage, and the iOS module are simulated. These
// tests prove JS ownership and dispatch boundaries, not real CallKit display,
// push delivery, audible media, or physical-device qualification.
const compile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const facadeSource = compile("_lib/iosNativeCalls.ts");
const authoritySource = compile("_lib/accountSessionAuthority.ts");
const ids = Object.freeze({
  user: "10000000-0000-4000-8000-000000000001",
  caller: "10000000-0000-4000-8000-000000000002",
  invite: "10000000-0000-4000-8000-000000000003",
  thread: "10000000-0000-4000-8000-000000000004",
  session: "10000000-0000-4000-8000-000000000005",
  other: "10000000-0000-4000-8000-000000000006",
  room: "valid_room_001",
});
const makeAuthority = () => ({
  userId: ids.user, accountId: ids.user, sessionGeneration: ids.session,
  state: "ACTIVE", restoreOnly: false,
});
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const flush = async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); };

async function harness({ platform = "ios", buildEnabled = true, runtimeEnabled = true,
  ready = true, controlledTimers = false } = {}) {
  const state = {
    authority: makeAuthority(), authorityError: null, authorityReads: 0,
    installId: "private-test-install", active: true, uiCurrent: true,
    invite: {
      id: ids.invite, thread_id: ids.thread, communication_room_id: ids.room,
      caller_user_id: ids.caller, callee_user_id: ids.user, call_type: "voice",
      status: "ringing", expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    thread: {
      id: ids.thread, active_communication_room_id: ids.room,
      members: [ids.user, ids.caller].map((user_id) => ({ user_id, thread_id: ids.thread })),
    },
    rowError: null, onRead: null, onAuthorityRead: null, onReport: null,
    onBackendOperation: null, onNativeStart: null,
    reports: [], queries: [], nativeEvents: [], nativeStarts: [], nativeStops: 0,
    nativeAnswers: [], nativeEnds: [], backendOperations: [], diagnostics: [],
  };
  const timers = new Map();
  let nextTimerId = 0;
  let listener;
  const emit = (type = "incoming", overrides = {}) => {
    const event = { type, callInviteId: ids.invite, callUuid: ids.invite,
      threadId: ids.thread, callType: state.invite?.call_type ?? "voice", ...overrides };
    listener?.(event);
    return event;
  };
  const supabase = {
    rpc: async (name) => {
      assert.equal(name, "wave1_session_authority_readback");
      state.authorityReads += 1;
      if (state.onAuthorityRead) await state.onAuthorityRead(state.authorityReads);
      return { data: state.authority ? { authoritative: true, ...clone(state.authority) } : null,
        error: state.authorityError };
    },
    from: (table) => {
      assert.ok(["chat_call_invites", "chat_threads"].includes(table), `unexpected table ${table}`);
      const query = { table, select: null, filters: [] };
      const builder = {
        select: (columns) => { query.select = columns; return builder; },
        eq: (field, value) => { query.filters.push([field, value]); return builder; },
        maybeSingle: async () => {
          state.queries.push(clone(query));
          if (state.onRead) await state.onRead(table, state.queries.length);
          assert.deepEqual(query.filters, [["id", table === "chat_call_invites" ? ids.invite : ids.thread]]);
          return { data: clone(table === "chat_call_invites" ? state.invite : state.thread), error: state.rowError };
        },
      };
      return builder;
    },
    functions: { invoke: async (name, { body }) => {
      state.backendOperations.push({ name, body: clone(body) });
      assert.equal(name, "ios-voip-push-tokens");
      const response = state.onBackendOperation ? await state.onBackendOperation(body) : undefined;
      if (response !== undefined) return response;
      return { data: {
        ...body, requestAccepted: true, status: body.action === "revoke" ? "revoked" : "registered",
        provider: "apns_voip", platform: "ios", tokenFingerprint: "test-fingerprint",
      }, error: null };
    } },
  };
  const authorityContext = { exports: {}, require: (name) => {
    if (name === "./supabase") return { supabase };
    if (name === "./entitlementAuthority") return { withAuthorityReadDeadline: async (promise) => promise };
    assert.fail(`unexpected authority import ${name}`);
  } };
  vm.runInNewContext(authoritySource, authorityContext, { filename: "_lib/accountSessionAuthority.ts" });
  const nativeModule = {
    isBuildEnabledAsync: async () => buildEnabled,
    isApplicationActiveAsync: async () => state.active,
    startVoipRegistrationAsync: async (...args) => {
      state.nativeStarts.push(args);
      if (state.onNativeStart) await state.onNativeStart(args);
      return true;
    },
    stopVoipRegistrationAsync: async () => { state.nativeStops += 1; return true; },
    addListener: (_event, next) => { listener = next; return { remove: () => { if (listener === next) listener = null; } }; },
    getPendingEventsAsync: async () => [],
    reportForegroundIncomingCallAsync: async (payload, authority) => {
      state.reports.push(clone({ payload, authority }));
      if (state.onReport) return state.onReport(payload, authority);
      emit();
      return ids.invite;
    },
    requestAnswerAsync: async (...args) => { state.nativeAnswers.push(args); return true; },
    completeAnswerAsync: async (...args) => { state.nativeAnswers.push(args); },
    reportRemoteEndAsync: async (...args) => { state.nativeEnds.push(args); },
    endCallAsync: async (...args) => { state.nativeEnds.push(args); },
  };
  const imports = {
    "expo-constants": { default: { expoConfig: { extra: { runtime: { iosNativeCallsEnabled: runtimeEnabled } } } } },
    "expo-application": { nativeApplicationVersion: "test", nativeBuildVersion: "test" },
    "react-native": { Platform: { OS: platform } },
    "../modules/chillywood-native-calls": { default: nativeModule },
    "./accountSessionAuthority": authorityContext.exports,
    "./iosNativeCallBridgeLifecycle.mjs": lifecycle,
    "./communicationRoomIdentifier.mjs": roomIdentifiers,
    "./communicationCallMediaPolicy.mjs": callMediaPolicy,
    "./internalCallMediaDiagnostics": { reportInternalCallMediaDiagnostic() {} },
    "./livekit/bootstrap": { synchronizeLiveKitCallKitAudioSession: () => {} },
    "./nativeCallTransitionProvenance.mjs": { clearNativeCallTransitionClaims: () => {} },
    "./nativeCallErrorDiagnostics.mjs": diagnostics,
    "./logger": { reportRuntimeError: (...args) => state.diagnostics.push(args) },
    "./notifications": {
      createPushOwnershipOperationKey: () => "operation-test",
      getNotificationInstallId: async () => state.installId,
      getNotificationRevocationCredential: async () => "private-test-revocation-credential",
    },
    "./supabase": { supabase },
  };
  const context = { exports: {}, console, process: { env: {} }, __DEV__: false,
    setTimeout: controlledTimers ? (callback, delay) => {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    } : setTimeout,
    clearTimeout: controlledTimers ? (id) => timers.delete(id) : clearTimeout,
    require: (name) => { assert.ok(imports[name], `unexpected facade import ${name}`); return imports[name]; },
  };
  vm.runInNewContext(facadeSource, context, { filename: "_lib/iosNativeCalls.ts" });
  const facade = context.exports;
  const start = () => facade.startIosNativeCallsReadiness(makeAuthority(), (event) => state.nativeEvents.push(clone(event)));
  if (ready && platform === "ios" && buildEnabled && runtimeEnabled) assert.equal((await start()).status, "started");
  state.authorityReads = 0;
  const isCurrent = () => state.uiCurrent;
  return {
    state, facade, nativeModule, emit, start, timers, isCurrent,
    ensure: (overrides = {}) => facade.ensureIosForegroundIncomingCallPresentation({
      inviteId: ids.invite, threadId: ids.thread, roomId: ids.room,
      authority: makeAuthority(), isCurrent, timeoutMs: 20, ...overrides,
    }),
  };
}

const assertNoAnswer = ({ state }) => {
  assert.deepEqual(state.nativeAnswers, [], "presentation does not synthesize a native Answer");
  assert.deepEqual(state.nativeEnds, [], "a canceled foreground screen does not end a concurrent PushKit-owned call");
  assert.deepEqual(state.backendOperations, [], "presentation cannot accept an invite or change server ownership");
};

for (const callType of ["voice", "video"]) {
  test(`foreground ${callType} report succeeds without a PushKit receipt, only after native incoming`, async () => {
    const h = await harness();
    h.state.invite.call_type = callType;
    assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false);
    assert.equal(await h.ensure(), "presented");
    assert.equal(h.state.reports.length, 1);
    const { payload, authority } = h.state.reports[0];
    assert.equal(payload.callInviteId, ids.invite);
    assert.equal(payload.callUuid, ids.invite);
    assert.equal(payload.threadId, ids.thread);
    assert.equal(payload.callType, callType);
    assert.equal(payload.expiresAt, h.state.invite.expires_at);
    assert.deepEqual(authority, { userId: ids.user, accountId: ids.user,
      sessionGeneration: ids.session, installId: h.state.installId });
    for (const forbidden of ["token", "accessToken", "presentationAck", "presentationAckToken", "ackToken", "revocationCredential"]) {
      assert.equal(Object.hasOwn(payload, forbidden), false);
      assert.equal(Object.hasOwn(authority, forbidden), false);
    }
    assert.ok(h.state.queries.filter(({ table }) => table === "chat_call_invites").length >= 2,
      "fresh invite read follows the asynchronous native report");
    assert.ok(h.state.queries.filter(({ table }) => table === "chat_threads").length >= 2,
      "membership and room ownership are rechecked after native completion");
    assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), true);
    assertNoAnswer(h);
  });
}

test("a report UUID without an incoming or recovered receipt cannot manufacture presentation", async () => {
  const h = await harness();
  h.state.onReport = async () => ids.invite;
  assert.equal(await h.ensure(), "timeout");
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false);
  assertNoAnswer(h);
});

test("a recovered receipt is eligible without a fabricated Answer event", async () => {
  const h = await harness();
  h.state.onReport = async () => { h.emit("recovered"); return ids.invite; };
  assert.equal(await h.ensure(), "presented");
  assert.equal(h.state.nativeEvents.some(({ type }) => type === "answerRequested"), false);
  assertNoAnswer(h);
});

for (const [label, receipt] of [
  ["another invite", { callInviteId: ids.other, callUuid: ids.other }],
  ["another UUID for this invite", { callUuid: ids.other }],
]) {
  test(`${label} cannot satisfy the exact foreground report`, async () => {
    const h = await harness();
    h.state.onReport = async () => { h.emit("incoming", receipt); return ids.invite; };
    assert.ok(["stale", "timeout"].includes(await h.ensure()));
    assertNoAnswer(h);
  });
}

test("native rejection blocks foreground admission", async () => {
  const h = await harness();
  h.state.onReport = async () => { throw new Error("CallKit declined this report"); };
  assert.equal(await h.ensure(), "stale");
  assertNoAnswer(h);
});

test("a noncanonical native report result is rejected even with an incoming receipt", async () => {
  const h = await harness();
  h.state.onReport = async () => { h.emit(); return ids.other; };
  assert.equal(await h.ensure(), "stale");
  assertNoAnswer(h);
});

const invalidRows = [
  ["missing invite", (s) => { s.invite = null; }],
  ["missing thread", (s) => { s.thread = null; }],
  ["read error", (s) => { s.rowError = { message: "temporary read failure" }; }],
  ["wrong invite ID", (s) => { s.invite.id = ids.other; }],
  ["wrong invite thread", (s) => { s.invite.thread_id = ids.other; }],
  ["wrong thread ID", (s) => { s.thread.id = ids.other; }],
  ["wrong recipient", (s) => { s.invite.callee_user_id = ids.other; }],
  ["self call", (s) => { s.invite.caller_user_id = ids.user; }],
  ["empty caller", (s) => { s.invite.caller_user_id = ""; }],
  ["accepted invite", (s) => { s.invite.status = "accepted"; }],
  ["ended invite", (s) => { s.invite.status = "ended"; }],
  ["case-normalized status", (s) => { s.invite.status = "RINGING"; }],
  ["missing call type", (s) => { delete s.invite.call_type; }],
  ["unsupported call type", (s) => { s.invite.call_type = "conference"; }],
  ["case-normalized call type", (s) => { s.invite.call_type = "VOICE"; }],
  ["wrong invite room", (s) => { s.invite.communication_room_id = "other_room_001"; }],
  ["inactive thread room", (s) => { s.thread.active_communication_room_id = null; }],
  ["replaced thread room", (s) => { s.thread.active_communication_room_id = "other_room_001"; }],
  ["absent membership", (s) => { s.thread.members = null; }],
  ["recipient outside thread", (s) => { s.thread.members = s.thread.members.filter(({ user_id }) => user_id !== ids.user); }],
  ["caller outside thread", (s) => { s.thread.members = s.thread.members.filter(({ user_id }) => user_id !== ids.caller); }],
  ["membership from another thread", (s) => { s.thread.members[0].thread_id = ids.other; }],
  ["expired invite", (s) => { s.invite.expires_at = new Date(Date.now() - 1_000).toISOString(); }],
  ["missing expiry", (s) => { delete s.invite.expires_at; }],
  ["informal date expiry", (s) => { s.invite.expires_at = "December 31, 2099 23:59:59"; }],
  ["numeric expiry", (s) => { s.invite.expires_at = Date.now() + 60_000; }],
  ["impossible calendar expiry", (s) => { s.invite.expires_at = "2099-02-30T00:00:00Z"; }],
];
for (const [label, mutate] of invalidRows) {
  test(`${label} cannot report or admit a foreground call`, async () => {
    const h = await harness();
    mutate(h.state);
    assert.equal(await h.ensure(), "stale");
    assert.equal(h.state.reports.length, 0);
    assertNoAnswer(h);
  });
}

const staleContext = [
  ["foreground UI canceled", (s) => { s.uiCurrent = false; }],
  ["native application backgrounded", (s) => { s.active = false; }],
  ["unknown authority", (s) => { s.authority = null; }],
  ["failed authority RPC", (s) => { s.authorityError = { message: "offline" }; }],
  ["different account", (s) => { s.authority.userId = ids.other; s.authority.accountId = ids.other; }],
  ["different session", (s) => { s.authority.sessionGeneration = ids.other; }],
  ["restore-only session", (s) => { s.authority.restoreOnly = true; }],
  ["different install", (s) => { s.installId = "replacement-install"; }],
];
for (const [label, mutate] of staleContext) {
  test(`${label} before report blocks native presentation`, async () => {
    const h = await harness();
    mutate(h.state);
    assert.equal(await h.ensure(), "stale");
    assert.equal(h.state.reports.length, 0);
    assertNoAnswer(h);
  });
  test(`${label} during native report prevents stale completion from granting admission`, async () => {
    const h = await harness();
    h.state.onReport = async () => { mutate(h.state); h.emit(); return ids.invite; };
    assert.equal(await h.ensure(), "stale");
    assert.equal(h.state.reports.length, 1);
    assertNoAnswer(h);
  });
}

for (const [label, mutate] of invalidRows.filter(([label]) => [
  "accepted invite", "expired invite", "caller outside thread", "replaced thread room", "read error",
].includes(label))) {
  test(`${label} during native completion cannot reuse an earlier valid row`, async () => {
    const h = await harness();
    h.state.onReport = async () => { mutate(h.state); h.emit(); return ids.invite; };
    assert.equal(await h.ensure(), "stale");
    assert.equal(h.state.reports.length, 1);
    assertNoAnswer(h);
  });
}

test("an existing exact PushKit receipt is reused only after fresh authority and row validation", async () => {
  const h = await harness();
  h.emit();
  assert.equal(await h.ensure(), "presented");
  assert.equal(h.state.reports.length, 0);
  assert.ok(h.state.queries.some(({ table }) => table === "chat_call_invites"));
  assert.ok(h.state.queries.some(({ table }) => table === "chat_threads"));
  assertNoAnswer(h);
});

for (const [label, mutate] of [
  ...staleContext,
  ...invalidRows.filter(([label]) => ["ended invite", "expired invite", "caller outside thread", "replaced thread room"].includes(label)),
]) {
  test(`a confirmed PushKit presentation does not bypass ${label}`, async () => {
    const h = await harness();
    h.emit();
    mutate(h.state);
    assert.equal(await h.ensure(), "stale");
    assert.equal(h.state.reports.length, 0);
    assertNoAnswer(h);
  });
}

test("wrong-UUID PushKit ownership cannot be admitted for the foreground invite", async () => {
  const h = await harness();
  h.emit("incoming", { callUuid: ids.other });
  assert.equal(await h.ensure(), "stale");
  assert.equal(h.state.reports.length, 0);
  assertNoAnswer(h);
});

test("missing native foreground method fails closed with iOS calls enabled", async () => {
  const h = await harness();
  delete h.nativeModule.reportForegroundIncomingCallAsync;
  assert.equal(await h.ensure(), "stale");
  assertNoAnswer(h);
});

for (const options of [{ platform: "android" }, { runtimeEnabled: false }]) {
  test(`disabled native path remains not_expected: ${JSON.stringify(options)}`, async () => {
    const h = await harness(options);
    assert.equal(await h.ensure(), "not_expected");
    assert.equal(h.state.reports.length, 0);
    assertNoAnswer(h);
  });
}

test("a native-disabled binary with runtime calls enabled cannot downgrade to foreground-only Answer", async () => {
  const h = await harness({ buildEnabled: false });
  assert.equal(await h.ensure(), "stale");
  assert.equal(h.state.reports.length, 0);
  assertNoAnswer(h);
});

test("no owned readiness lifecycle cannot report a foreground call", async () => {
  const h = await harness({ ready: false });
  assert.equal(await h.ensure(), "stale");
  assert.equal(h.state.reports.length, 0);
  assertNoAnswer(h);
});

test("equivalent-authority transient failure quarantines JS but preserves and recovers native registration", async () => {
  const h = await harness();
  h.emit("voipTokenUpdated", { token: "simulated-native-token" });
  await flush();
  assert.equal(h.state.backendOperations.filter(({ body }) => body.action === "register").length, 1);
  const startsBefore = h.state.nativeStarts.length;
  const stopsBefore = h.state.nativeStops;
  h.state.authority = null;
  assert.equal((await h.start()).status, "error");
  assert.equal(h.state.nativeStops, stopsBefore, "indeterminate read must not unregister PushKit");
  assert.equal(await h.ensure(), "stale");
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false);
  assert.equal(h.state.backendOperations.some(({ body }) => body.action === "revoke"), false);
  h.state.authority = makeAuthority();
  assert.equal((await h.start()).status, "started");
  assert.ok(h.state.nativeStarts.length > startsBefore, "a successful retry rebinds native ownership and listeners");
  assert.equal(await h.ensure(), "presented");
  assert.deepEqual(h.state.nativeAnswers, []);
});

test("an indeterminate post-start authority read preserves native registration until a verified retry", async () => {
  const h = await harness({ ready: false });
  h.state.onAuthorityRead = (read) => { if (read === 2) h.state.authority = null; };
  assert.equal((await h.start()).status, "error");
  assert.equal(h.state.nativeStarts.length, 1);
  assert.equal(h.state.nativeStops, 0);
  assert.equal(await h.ensure(), "stale");
  assert.equal(h.state.reports.length, 0);
  h.state.authority = makeAuthority();
  h.state.onAuthorityRead = null;
  assert.equal((await h.start()).status, "started");
  assert.equal(await h.ensure(), "presented");
  assertNoAnswer(h);
});

test("explicit lifecycle revocation during native report invalidates its later receipt", async () => {
  const h = await harness();
  h.state.onReport = async () => {
    await h.facade.revokeIosVoipRegistration();
    h.emit();
    return ids.invite;
  };
  assert.equal(await h.ensure(), "stale");
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false);
  assert.equal(h.state.nativeStops, 1);
  assert.equal(h.state.backendOperations.filter(({ body }) => body.action === "revoke").length, 1);
  assert.deepEqual(h.state.nativeAnswers, []);
  assert.deepEqual(h.state.nativeEnds, []);
});

test("an authoritative different session revokes the old registry instead of preserving it as unknown", async () => {
  const h = await harness();
  h.state.authority.sessionGeneration = ids.other;
  assert.equal((await h.start()).status, "error");
  assert.equal(h.state.nativeStops, 1);
  assert.equal(h.state.backendOperations.filter(({ body }) => body.action === "revoke").length, 1);
  assert.equal(await h.ensure(), "stale");
  assert.deepEqual(h.state.nativeAnswers, []);
});

for (const expiry of ["2099-12-31T23:59:59.123456Z", "2099-12-31T23:59:59.123456+05:30"]) {
  test(`valid ISO expiry retains PostgreSQL fractional seconds and offset support: ${expiry}`, async () => {
    const h = await harness();
    h.state.invite.expires_at = expiry;
    assert.equal(await h.ensure(), "presented");
    assert.equal(h.state.reports[0].payload.expiresAt, expiry);
    assertNoAnswer(h);
  });
}

test("a freshly verified presentation permits the explicit native Answer request, without accepting the server invite", async () => {
  const h = await harness();
  assert.equal(await h.ensure(), "presented");
  assertNoAnswer(h);
  const readsBeforeAnswer = h.state.queries.length;
  assert.equal(await h.facade.requestIosNativeCallAnswer(ids.invite, h.isCurrent), true);
  assert.deepEqual(h.state.nativeAnswers, [[ids.invite, ids.invite]]);
  assert.ok(h.state.queries.length > readsBeforeAnswer, "Answer revalidates the invite after presentation");
  assert.deepEqual(h.state.backendOperations, [], "a native request never substitutes for server acceptance");
});

for (const [label, mutate] of [
  ...staleContext,
  ...invalidRows.filter(([label]) => ["ended invite", "expired invite", "caller outside thread", "replaced thread room"].includes(label)),
]) {
  test(`${label} while awaiting Answer authority prevents native Answer dispatch`, async () => {
    const h = await harness();
    assert.equal(await h.ensure(), "presented");
    h.state.onAuthorityRead = () => { mutate(h.state); };
    assert.equal(await h.facade.requestIosNativeCallAnswer(ids.invite, h.isCurrent), false);
    assertNoAnswer(h);
  });
}

test("native terminal receipt while awaiting Answer authority invalidates exact UUID ownership", async () => {
  const h = await harness();
  assert.equal(await h.ensure(), "presented");
  h.state.onAuthorityRead = () => { h.emit("remoteEnded"); };
  assert.equal(await h.facade.requestIosNativeCallAnswer(ids.invite, h.isCurrent), false);
  assertNoAnswer(h);
});

test("a withheld native completion has a bounded deadline and its late receipt cannot resume the Answer tap", async () => {
  const h = await harness({ controlledTimers: true });
  let completeNativeReport;
  h.state.onReport = () => new Promise((resolve) => { completeNativeReport = resolve; });
  const pending = h.ensure();
  for (let turns = 0; turns < 10 && h.timers.size === 0; turns += 1) await flush();
  const [id, deadline] = [...h.timers].find(([, timer]) => timer.delay === 5_000) ?? [];
  assert.ok(deadline, "the native callback has its own bounded deadline");
  h.timers.delete(id);
  deadline.callback();
  assert.equal(await pending, "timeout");
  assertNoAnswer(h);
  h.state.uiCurrent = false;
  h.emit();
  completeNativeReport(ids.invite);
  await flush();
  assert.equal(h.state.reports.length, 1);
  assert.equal(h.timers.size, 0);
  assertNoAnswer(h);
});

test("a native receipt without an exact foreground validation cannot dispatch Answer", async () => {
  const h = await harness();
  h.emit();
  assert.equal(await h.facade.requestIosNativeCallAnswer(ids.invite, h.isCurrent), false);
  assertNoAnswer(h);
});

test("an equivalent but different UI callback cannot consume another operation's validation", async () => {
  const h = await harness();
  assert.equal(await h.ensure(), "presented");
  assert.equal(await h.facade.requestIosNativeCallAnswer(ids.invite, () => h.state.uiCurrent), false);
  assertNoAnswer(h);
  assert.equal(await h.facade.requestIosNativeCallAnswer(ids.invite, h.isCurrent), true);
  assert.deepEqual(h.state.nativeAnswers, [[ids.invite, ids.invite]]);
});

test("one foreground validation can be consumed by only one native Answer request", async () => {
  const h = await harness();
  assert.equal(await h.ensure(), "presented");
  assert.equal(await h.facade.requestIosNativeCallAnswer(ids.invite, h.isCurrent), true);
  assert.equal(await h.facade.requestIosNativeCallAnswer(ids.invite, h.isCurrent), false);
  assert.deepEqual(h.state.nativeAnswers, [[ids.invite, ids.invite]]);
});

test("independent foreground validations retain their own fresh server check after another is consumed", async () => {
  const h = await harness();
  const anotherOperation = () => h.state.uiCurrent;
  assert.equal(await h.ensure(), "presented");
  assert.equal(await h.ensure({ isCurrent: anotherOperation }), "presented");
  assert.equal(await h.facade.requestIosNativeCallAnswer(ids.invite, h.isCurrent), true);
  h.state.invite.status = "ended";
  assert.equal(await h.facade.requestIosNativeCallAnswer(ids.invite, anotherOperation), false);
  assert.deepEqual(h.state.nativeAnswers, [[ids.invite, ids.invite]]);
});

const displayInvite = (raw) => ({
  id: raw.id, threadId: raw.thread_id, communicationRoomId: raw.communication_room_id,
  callerUserId: raw.caller_user_id, calleeUserId: raw.callee_user_id,
  status: raw.status, callType: raw.call_type, expiresAt: raw.expires_at,
  mediaProvider: "legacy_webrtc",
});

async function mountFacadeAnswer(t, h) {
  const mounted = await mountChatAnswer({
    platform: "ios", currentUserId: ids.user, threadId: ids.thread, sessionGeneration: ids.session,
    invite: displayInvite(h.state.invite),
    readInvite: async () => displayInvite(h.state.invite),
    readThread: async () => ({ threadId: h.state.thread.id,
      activeCommunicationRoomId: h.state.thread.active_communication_room_id }),
    update: async () => { h.state.invite.status = "accepted"; return displayInvite(h.state.invite); },
    presentation: (_id, input) => h.facade.ensureIosForegroundIncomingCallPresentation({ ...input, timeoutMs: 20 }),
    requestNative: (id, isCurrent) => h.facade.requestIosNativeCallAnswer(id, isCurrent),
  });
  const originalUnmount = mounted.unmount;
  let unmounted = false;
  mounted.unmount = async () => { if (!unmounted) { unmounted = true; await originalUnmount(); } };
  t.after(() => mounted.unmount());
  return mounted;
}

test("mounted production Answer without PushKit uses the real facade and waits for trusted routing before acceptance", async (t) => {
  const h = await harness();
  const mounted = await mountFacadeAnswer(t, h);
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false);
  await mounted.act(async () => {
    assert.equal(await mounted.runtime.snapshot.acceptIncomingInvite(mounted.runtime.invite), true);
  });
  assert.equal(h.state.reports.length, 1);
  assert.equal(h.state.nativeEvents.filter(({ type }) => type === "incoming").length, 1);
  assert.deepEqual(h.state.nativeAnswers, [[ids.invite, ids.invite]]);
  assert.deepEqual(mounted.runtime.nativeRequests, [ids.invite]);
  assert.equal(mounted.runtime.updates.length, 0);
  assert.equal(mounted.runtime.accepted.length, 0);
  assert.equal(mounted.runtime.completions.length, 0);
  assert.equal(mounted.runtime.snapshot.callBusy, false);

  // Trusted route admission is supplied at its already-tested route boundary.
  // This mounted seam must not mistake the preceding report/request receipts
  // for that admission or mutate the server before it arrives.
  await mounted.rerender({ requestedNativeCallUuid: ids.invite });
  await mounted.act(async () => {
    assert.equal(await mounted.runtime.snapshot.acceptIncomingInvite(mounted.runtime.invite), true);
  });
  assert.equal(mounted.runtime.updates.length, 1);
  assert.equal(mounted.runtime.accepted.length, 1);
  assert.equal(mounted.runtime.completions.length, 1);
  assert.deepEqual(mounted.runtime.nativeRequests, [ids.invite]);
  assert.deepEqual(h.state.nativeEnds, []);
});

test("mounted production Answer blocks a returned report UUID without its real native receipt", async (t) => {
  const h = await harness();
  h.state.onReport = async () => ids.invite;
  const mounted = await mountFacadeAnswer(t, h);
  await mounted.act(async () => {
    assert.equal(await mounted.runtime.snapshot.acceptIncomingInvite(mounted.runtime.invite), false);
  });
  assert.equal(h.state.reports.length, 1);
  assert.deepEqual(mounted.runtime.nativeRequests, []);
  assert.equal(mounted.runtime.updates.length, 0);
  assert.equal(mounted.runtime.accepted.length, 0);
  assert.equal(mounted.runtime.snapshot.callBusy, false);
  assert.ok(mounted.runtime.errors.some((error) => /Unable to hand this call to iPhone/u.test(error)));
  assertNoAnswer(h);
});

for (const replacement of ["navigation", "account", "unmount"]) {
  test(`mounted ${replacement} during actual native reporting cancels Answer without ending shared native ownership`, async (t) => {
    const h = await harness();
    const reportStarted = deferred();
    const report = deferred();
    h.state.onReport = () => { reportStarted.resolve(); return report.promise; };
    const mounted = await mountFacadeAnswer(t, h);
    let operation;
    await mounted.act(async () => {
      operation = mounted.runtime.snapshot.acceptIncomingInvite(mounted.runtime.invite);
      await reportStarted.promise;
    });
    if (replacement === "navigation") await mounted.rerender({ threadId: ids.other });
    else if (replacement === "account") {
      h.state.authority = { ...makeAuthority(), userId: ids.other, accountId: ids.other };
      await mounted.rerender({ currentUserId: ids.other });
    } else await mounted.unmount();
    await mounted.act(async () => { h.emit(); report.resolve(ids.invite); assert.equal(await operation, false); });
    assert.deepEqual(mounted.runtime.nativeRequests, []);
    assert.equal(mounted.runtime.updates.length, 0);
    assert.equal(mounted.runtime.accepted.length, 0);
    assert.deepEqual(mounted.runtime.nativeEnds ?? [], []);
    assert.deepEqual(mounted.runtime.errors, []);
    assertNoAnswer(h);
  });
}

test("same-render mounted Answer taps reach the real facade and native module only once", async (t) => {
  const h = await harness();
  const reportStarted = deferred();
  const report = deferred();
  h.state.onReport = () => { reportStarted.resolve(); return report.promise; };
  const mounted = await mountFacadeAnswer(t, h);
  let first;
  let duplicate;
  await mounted.act(async () => {
    const answer = mounted.runtime.snapshot.acceptIncomingInvite;
    first = answer(mounted.runtime.invite);
    duplicate = answer(mounted.runtime.invite);
    await reportStarted.promise;
  });
  await mounted.act(async () => {
    h.emit(); report.resolve(ids.invite);
    assert.equal(await first, true);
    assert.equal(await duplicate, false);
  });
  assert.equal(h.state.reports.length, 1);
  assert.deepEqual(h.state.nativeAnswers, [[ids.invite, ids.invite]]);
  assert.equal(mounted.runtime.updates.length, 0);
  assert.equal(mounted.runtime.accepted.length, 0);
  assert.equal(mounted.runtime.snapshot.callBusy, false);
});

const tokenOperations = (h, action) => h.state.backendOperations.filter(({ body }) => body.action === action).length;
const flushTokenWork = async () => { for (let turn = 0; turn < 10; turn += 1) await flush(); };
const fireTokenRetry = async (h, delay) => {
  await flushTokenWork();
  const matches = [...h.timers].filter(([, timer]) => timer.delay === delay);
  assert.equal(matches.length, 1, `exactly one token retry is scheduled after ${delay} ms`);
  const [id, timer] = matches[0];
  h.timers.delete(id);
  timer.callback();
  await flushTokenWork();
};
const emitSyntheticToken = (h) => h.emit("voipTokenUpdated", { token: "synthetic-test-only-token" });

test("indeterminate post-registration authority preserves the backend token and retries after recovery", async () => {
  const h = await harness({ controlledTimers: true });
  h.state.onBackendOperation = (body) => {
    if (body.action === "register") h.state.authority = null;
  };
  emitSyntheticToken(h);
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 1);
  assert.equal(tokenOperations(h, "revoke"), 0,
    "a timed-out authority read must not revoke a successful exact backend registration");
  assert.equal(h.state.nativeStops, 0);
  h.state.authority = makeAuthority();
  h.state.onBackendOperation = null;
  await fireTokenRetry(h, 1_000);
  assert.equal(tokenOperations(h, "register"), 2);
  assert.equal(tokenOperations(h, "revoke"), 0);
  assert.equal(h.timers.size, 0, "successful recovery ends the retry sequence");
});

test("backend token registration failure retries only at one and three seconds", async () => {
  const h = await harness({ controlledTimers: true });
  h.state.onBackendOperation = (body) => body.action === "register"
    ? { data: null, error: { message: "simulated unavailable endpoint" } } : undefined;
  emitSyntheticToken(h);
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 1);
  await fireTokenRetry(h, 1_000);
  assert.equal(tokenOperations(h, "register"), 2);
  await fireTokenRetry(h, 3_000);
  assert.equal(tokenOperations(h, "register"), 3);
  assert.equal(h.timers.size, 0, "failure cannot create an unbounded background retry loop");
  assert.equal(tokenOperations(h, "revoke"), 0);
  assert.equal(h.state.nativeStops, 0);
});

test("session replacement while token retry is pending cannot register under the retired session", async () => {
  const h = await harness({ controlledTimers: true });
  h.state.onBackendOperation = (body) => body.action === "register"
    ? { data: null, error: { message: "simulated unavailable endpoint" } } : undefined;
  emitSyntheticToken(h);
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 1);
  h.state.authority.sessionGeneration = ids.other;
  h.state.onBackendOperation = null;
  await fireTokenRetry(h, 1_000);
  if ([...h.timers.values()].some(({ delay }) => delay === 3_000)) await fireTokenRetry(h, 3_000);
  assert.equal(tokenOperations(h, "register"), 1);
  assert.equal(h.timers.size, 0);
});

test("explicit revocation does not wait on retry timers or permit a late token registration", async () => {
  const h = await harness({ controlledTimers: true });
  h.state.onBackendOperation = (body) => body.action === "register"
    ? { data: null, error: { message: "simulated unavailable endpoint" } } : undefined;
  emitSyntheticToken(h);
  await flushTokenWork();
  const delayedRetry = [...h.timers.values()].find(({ delay }) => delay === 1_000);
  assert.ok(delayedRetry);
  let revoked = false;
  const revocation = h.facade.revokeIosVoipRegistration().then(() => { revoked = true; });
  await flushTokenWork();
  assert.equal(revoked, true, "revocation completes without advancing a delayed retry");
  await revocation;
  h.state.onBackendOperation = null;
  delayedRetry.callback();
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 1);
  assert.equal(tokenOperations(h, "revoke"), 1);
  assert.equal(h.state.nativeStops, 1);
});

test("authoritative session replacement after registration revokes the old backend owner", async () => {
  const h = await harness({ controlledTimers: true });
  h.state.onBackendOperation = (body) => {
    if (body.action === "register") h.state.authority.sessionGeneration = ids.other;
  };
  emitSyntheticToken(h);
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 1);
  assert.equal(tokenOperations(h, "revoke"), 1,
    "a positively different session is not treated as a temporary unknown read");
  for (const delay of [1_000, 3_000]) {
    if ([...h.timers.values()].some((timer) => timer.delay === delay)) await fireTokenRetry(h, delay);
  }
  assert.equal(tokenOperations(h, "register"), 1);
  assert.equal(h.timers.size, 0);
});

test("same-authority readiness rebind replays the native current token after exhausted registration retries", async () => {
  const h = await harness({ controlledTimers: true });
  h.state.onBackendOperation = (body) => body.action === "register"
    ? { data: null, error: { message: "simulated unavailable endpoint" } } : undefined;
  emitSyntheticToken(h);
  await fireTokenRetry(h, 1_000);
  await fireTokenRetry(h, 3_000);
  assert.equal(tokenOperations(h, "register"), 3);
  assert.equal(h.timers.size, 0);
  const startsBefore = h.state.nativeStarts.length;
  h.state.onBackendOperation = null;
  h.state.onNativeStart = () => { emitSyntheticToken(h); };
  assert.equal((await h.start()).status, "started");
  await flushTokenWork();
  assert.equal(h.state.nativeStarts.length, startsBefore + 1,
    "same-authority readiness asks the retained native registry for its current token");
  assert.equal(tokenOperations(h, "register"), 4);
  assert.equal(tokenOperations(h, "revoke"), 0);
  assert.equal(h.state.nativeStops, 0);
  assert.equal(h.timers.size, 0);
});

test("confirmed token replay is deduplicated while rotation and invalidation still register the current token", async () => {
  const h = await harness({ controlledTimers: true });
  let currentNativeToken = "synthetic-original-token";
  const replayCurrentToken = () => h.emit("voipTokenUpdated", { token: currentNativeToken });
  replayCurrentToken();
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 1);
  h.state.onNativeStart = replayCurrentToken;
  for (let activation = 0; activation < 3; activation += 1) {
    assert.equal((await h.start()).status, "started");
    await flushTokenWork();
  }
  assert.equal(tokenOperations(h, "register"), 1,
    "foreground rebinds do not repeat a confirmed same-lifecycle backend registration");
  currentNativeToken = "synthetic-rotated-token";
  replayCurrentToken();
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 2, "a rotated token requires fresh registration");
  assert.equal((await h.start()).status, "started");
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 2);
  h.emit("voipTokenInvalidated");
  await flushTokenWork();
  assert.equal(tokenOperations(h, "revoke"), 1);
  assert.equal((await h.start()).status, "started");
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 3,
    "an invalidated marker cannot suppress registration of the next native current-token replay");
  assert.equal(h.state.nativeStops, 0);
  assert.equal(h.timers.size, 0);
});

test("transient lifecycle quarantine clears a confirmed token marker before verified recovery", async () => {
  const h = await harness({ controlledTimers: true });
  emitSyntheticToken(h);
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 1);
  h.state.authority = null;
  assert.equal((await h.start()).status, "error");
  h.state.authority = makeAuthority();
  assert.equal((await h.start()).status, "started");
  emitSyntheticToken(h);
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 2,
    "an earlier lifecycle's marker cannot suppress a fresh verified registration");
  assert.equal(tokenOperations(h, "revoke"), 0);
  assert.equal(h.state.nativeStops, 0);
  assert.equal(h.timers.size, 0);
});

test("a mismatched backend receipt never establishes the confirmed-token deduplication marker", async () => {
  const h = await harness({ controlledTimers: true });
  h.state.onBackendOperation = (body) => body.action === "register" ? {
    data: { ...body, requestAccepted: true, status: "registered", platform: "ios",
      provider: "apns_voip", sessionGeneration: ids.other }, error: null,
  } : undefined;
  emitSyntheticToken(h);
  await fireTokenRetry(h, 1_000);
  await fireTokenRetry(h, 3_000);
  assert.equal(tokenOperations(h, "register"), 3);
  h.state.onBackendOperation = null;
  emitSyntheticToken(h);
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 4,
    "only an exact authoritative backend receipt can suppress later identical-token registration");
  emitSyntheticToken(h);
  await flushTokenWork();
  assert.equal(tokenOperations(h, "register"), 4);
  assert.equal(h.timers.size, 0);
});
