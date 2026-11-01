import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createDurableChatThreadFixture, mountFullChatThread } from "./assurance/helpers/chat-thread-full-mounted-harness.mjs";
import { loadStubbed } from "./customer-experience-adversarial-helpers.mjs";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

async function mountStart(t, options = {}) {
  const store = createDurableChatThreadFixture();
  const h = await mountFullChatThread({ durableThread: store, ...options });
  t.after(() => h.unmount());
  return { h, store };
}

function startReceipt(store, userId = "local-user", mode = "voice") {
  const invite = store.start(userId, store.threadId, mode);
  return { invite, thread: store.thread(userId), roomId: invite.communicationRoomId,
    role: "caller", delivery: {} };
}

test("Start single flight rejects repeated taps before React commits busy state", async t => {
  const { h, store } = await mountStart(t);
  const completion = deferred();
  h.runtime.startCall = async (threadId, mode) => {
    const invite = store.start(h.runtime.userId, threadId, mode);
    await completion.promise;
    return { invite, thread: store.thread(h.runtime.userId), roomId: invite.communicationRoomId,
      role: "caller", delivery: {} };
  };
  let first;
  let second;
  await h.run(() => {
    first = h.runtime.snapshot.handleStartCall("voice");
    second = h.runtime.snapshot.handleStartCall("video");
  });
  const requests = h.runtime.startCalls.length;
  const busyWhilePending = h.runtime.snapshot.callBusy;
  await h.run(async () => { completion.resolve(); await Promise.all([first, second]); });
  assert.equal(requests, 1, "one gesture burst must issue one start, not race the backend collision path");
  assert.equal(busyWhilePending, true, "a duplicate completion must not unlock the first pending start");
  assert.equal(store.rooms.size, 1);
  assert.equal(h.runtime.snapshot.activeCallInvite.callType, "voice");
  assert.equal(h.runtime.snapshot.error, null);
});

test("a delayed Start result cannot resurrect ringing after its call ended during dispatch", async t => {
  const { h, store } = await mountStart(t);
  const completion = deferred();
  const binding = { state: "ACTIVE", userId: "local-user", accountId: "local-user", restoreOnly: false };
  // Compose the real screen with real startChatThreadCall. Only the database,
  // canonical begin transaction, and push dispatch are controlled boundaries.
  const api = loadStubbed("_lib/chat.ts", {
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => binding,
      sameAccountSessionAuthority: (a, b) => a === b },
    "./watchParty": { getWritablePartyUserId: async () => binding.userId },
    "./supabase": { supabase: { from: table => {
      const row = () => ({ id: store.threadId, participant_pair_key: store.userIds.join("::"), created_by: "local-user",
        active_communication_room_id: store.thread("local-user").activeCommunicationRoomId,
        active_call_type: store.thread("local-user").activeCallType,
        members: store.userIds.map(user_id => ({ thread_id: store.threadId, user_id, display_name: user_id })) });
      const query = { select: () => query, eq: () => query, in: () => query, returns: () => query,
        maybeSingle: async () => ({ data: row(), error: null }),
        then: resolve => Promise.resolve({ data: table === "user_profiles" ? [] : row(), error: null }).then(resolve) };
      return query;
    } } },
    "./communication": { prepareChatCallRoomCandidate: async () => ({ roomId: "FIXTURE-ROOM-1", capturePolicy: "best_effort" }) },
    "./chillyChatCalls": {
      beginChillyChatCall: async ({ actorUserId, threadId, callType }) => ({
        created: true, role: "caller", invite: store.start(actorUserId, threadId, callType),
      }),
      dispatchChillyChatCallPush: async () => { await completion.promise; return { status: "sent", pushSent: true }; },
    },
    "./userFacingErrors": loadStubbed("_lib/userFacingErrors.ts"),
  });
  let returned;
  h.runtime.startCall = async (...args) => { returned = await api.startChatThreadCall(...args); return returned; };
  let start;
  await h.run(() => { start = h.runtime.snapshot.handleStartCall("video"); });
  await h.run(() => {
    store.transition("remote-user", store.invite, "accepted");
    store.transition("remote-user", store.invite, "ended");
  });
  await h.run(async () => { completion.resolve(); await start; });
  assert.equal(returned.invite.status, "ringing", "the actual API retains its pre-dispatch begin receipt");
  assert.equal(returned.thread.activeCommunicationRoomId, undefined, "the actual API refresh sees the completed End");
  assert.equal(store.invite.status, "ended");
  assert.equal(h.runtime.snapshot.callPanelOpen, false, "the old dispatch receipt cannot reopen the terminal call");
  assert.equal(h.runtime.snapshot.activeCallInvite, null, "no stale ringing identity may block a fresh call");
  assert.equal(h.runtime.snapshot.activeCallRoomId, "");
  assert.equal(h.runtime.media.localStreams.length, 0);
  h.runtime.startCall = null;
  await h.run(() => h.runtime.snapshot.handleStartCall("voice"));
  assert.equal(store.rooms.size, 2, "a settled old call must permit the next real Start");
  assert.equal(store.invite.callType, "voice");
});

test("failed Start releases only its own latch and permits a deliberate retry", async t => {
  const { h, store } = await mountStart(t);
  h.runtime.startCall = async () => { throw Error("controlled start failure"); };
  await h.run(() => h.runtime.snapshot.handleStartCall("video"));
  assert.equal(h.runtime.snapshot.callBusy, false);
  assert.match(h.runtime.snapshot.error, /controlled start failure/);
  assert.equal(store.rooms.size, 0);
  h.runtime.startCall = null;
  await h.run(() => h.runtime.snapshot.handleStartCall("voice"));
  assert.equal(h.runtime.startCalls.length, 2);
  assert.equal(h.runtime.snapshot.activeCallInvite.callType, "voice");
});

for (const [replacement, patch] of [
  ["account", { userId: "remote-user", remoteUserId: "local-user" }],
  ["session", { sessionGeneration: "replacement-session" }],
  ["thread", { threadId: "replacement-thread" }],
]) {
  test(`pending Start success cannot change the ${replacement} replacement screen`, async t => {
    const { h, store } = await mountStart(t);
    const pending = deferred();
    h.runtime.startCall = () => pending.promise;
    let operation;
    await h.run(() => { operation = h.runtime.snapshot.handleStartCall("video"); });
    const oldReceipt = startReceipt(store);
    store.transition("local-user", store.invite, "canceled");
    await h.rerender(patch);
    const before = h.runtime.snapshot;
    await h.run(async () => { pending.resolve(oldReceipt); await operation; });
    assert.equal(h.runtime.snapshot.activeCallInvite, before.activeCallInvite,
      "retired Start success must not install an old invite into its successor");
    assert.equal(h.runtime.snapshot.callPanelOpen, before.callPanelOpen);
    assert.equal(h.runtime.snapshot.error, before.error);
    assert.equal(h.runtime.media.localStreams.length, 0);
  });

  test(`retained Start callback cannot issue a request after ${replacement} replacement`, async t => {
    const { h } = await mountStart(t);
    const oldStart = h.runtime.snapshot.handleStartCall;
    await h.rerender(patch);
    await h.run(() => oldStart("video"));
    assert.equal(h.runtime.startCalls.length, 0);
  });
}

for (const outcome of ["success", "failure"]) {
  test(`retired Start ${outcome} cannot release a successor Start's busy state`, async t => {
    const { h, store } = await mountStart(t);
    const first = deferred();
    const second = deferred();
    const responses = [first, second];
    h.runtime.startCall = () => responses.shift().promise;
    let oldOperation;
    let newOperation;
    await h.run(() => { oldOperation = h.runtime.snapshot.handleStartCall("video"); });
    await h.rerender({ sessionGeneration: "replacement-session" });
    await h.run(() => { newOperation = h.runtime.snapshot.handleStartCall("voice"); });
    await h.run(async () => {
      if (outcome === "failure") first.reject(Error("retired failure"));
      else first.resolve({ invite: null, thread: store.thread("local-user"), role: "caller", delivery: {} });
      await oldOperation;
    });
    const stillBusy = h.runtime.snapshot.callBusy;
    const preservedError = h.runtime.snapshot.error;
    await h.run(async () => { second.resolve(startReceipt(store)); await newOperation; });
    assert.equal(stillBusy, true, "retired finally must not release the successor Start latch");
    assert.equal(preservedError, null, "retired catch must not overwrite the current screen");
    assert.equal(h.runtime.snapshot.activeCallInvite.callType, "voice");
    assert.equal(h.runtime.snapshot.callBusy, false);
  });
}

test("a newer incoming call owns the UI when an older outgoing Start rejects", async t => {
  const { h, store } = await mountStart(t);
  const completion = deferred();
  h.runtime.startCall = () => completion.promise;
  let operation;
  await h.run(() => { operation = h.runtime.snapshot.handleStartCall("voice"); });
  await h.run(() => store.start("remote-user", store.threadId, "video"));
  assert.equal(h.runtime.snapshot.incomingCallInvite.id, store.invite.id);
  await h.run(async () => { completion.reject(Error("old outgoing response")); await operation; });
  assert.equal(h.runtime.snapshot.incomingCallInvite.id, store.invite.id);
  assert.equal(h.runtime.snapshot.callBusy, false);
  assert.equal(h.runtime.snapshot.error, null);
  await h.run(() => h.runtime.snapshot.handleAcceptIncomingCall());
  assert.equal(store.invite.status, "accepted", "invalidating Start must leave the newer Answer usable");
  assert.equal(h.runtime.media.localStreams.length, 1);
});

for (const status of ["ringing", "accepted"]) {
  test(`same-batch ${status} incoming projection cannot be overwritten by an old Start reply before layout`, async t => {
    const { h, store } = await mountStart(t);
    const completion = deferred();
    h.runtime.startCall = () => completion.promise;
    let operation;
    await h.run(() => { operation = h.runtime.snapshot.handleStartCall("voice"); });
    const oldReceipt = startReceipt(store);
    const snapshotBeforeBatch = h.runtime.snapshot;
    let newerInvite;
    await h.run(async () => {
      store.transition("local-user", store.invite, "canceled");
      newerInvite = store.start("remote-user", store.threadId, "video");
      if (status === "accepted") newerInvite = store.transition("local-user", newerInvite, "accepted");
      await h.runtime.snapshot.loadThreadState();
      assert.strictEqual(h.runtime.snapshot, snapshotBeforeBatch,
        "the newer projection has run but React must not commit/layout before the stale completion");
      completion.resolve(oldReceipt);
      await operation;
    });
    assert.equal(h.runtime.snapshot.activeCallRoomId, newerInvite.communicationRoomId,
      "the old Start reply cannot overwrite a newer call projection in the same batch");
    if (status === "ringing") assert.equal(h.runtime.snapshot.incomingCallInvite?.id, newerInvite.id);
    else assert.equal(h.runtime.snapshot.activeCallInvite?.id, newerInvite.id);
    assert.notEqual(h.runtime.snapshot.activeCallInvite?.id, oldReceipt.invite.id);
  });
}

test("same-batch incoming then End projection retires Start even when no invite reaches layout", async t => {
  const { h, store } = await mountStart(t);
  const completion = deferred();
  h.runtime.startCall = () => completion.promise;
  let operation;
  await h.run(() => { operation = h.runtime.snapshot.handleStartCall("voice"); });
  const oldReceipt = startReceipt(store);
  const snapshotBeforeBatch = h.runtime.snapshot;
  await h.run(async () => {
    store.transition("local-user", store.invite, "canceled");
    store.start("remote-user", store.threadId, "video");
    await h.runtime.snapshot.loadThreadState();
    store.transition("local-user", store.invite, "accepted");
    store.transition("remote-user", store.invite, "ended");
    await h.runtime.snapshot.loadThreadState();
    assert.strictEqual(h.runtime.snapshot, snapshotBeforeBatch, "neither projection may reach layout first");
    completion.resolve(oldReceipt);
    await operation;
  });
  assert.equal(h.runtime.snapshot.activeCallRoomId, "", "the terminal projection must survive the old Start reply");
  assert.equal(h.runtime.snapshot.activeCallInvite, null);
  assert.equal(h.runtime.snapshot.incomingCallInvite, null);
  assert.equal(h.runtime.snapshot.callPanelOpen, false);
  h.runtime.startCall = null;
  await h.run(() => h.runtime.snapshot.handleStartCall("voice"));
  assert.equal(store.rooms.size, 3, "settled terminal projection still permits an explicit fresh Start");
});

test("a retained Start callback cannot race a same-batch incoming projection before layout", async t => {
  const { h, store } = await mountStart(t);
  const oldStart = h.runtime.snapshot.handleStartCall;
  const before = h.runtime.snapshot;
  await h.run(async () => {
    store.start("remote-user", store.threadId, "video");
    await h.runtime.snapshot.loadThreadState();
    assert.strictEqual(h.runtime.snapshot, before);
    await oldStart("voice");
  });
  assert.equal(h.runtime.startCalls.length, 0);
  assert.equal(h.runtime.snapshot.incomingCallInvite.id, store.invite.id);
});

test("a retained Start callback cannot issue after its screen unmounts", async () => {
  const store = createDurableChatThreadFixture();
  const h = await mountFullChatThread({ durableThread: store });
  const oldStart = h.runtime.snapshot.handleStartCall;
  await h.unmount();
  await oldStart("voice");
  assert.equal(h.runtime.startCalls.length, 0);
});

for (const [name, pattern, mutate, assertion] of [
  ["synchronous latch", "Start single flight rejects repeated taps before React commits busy state",
    source => source.replace("|| operationRef.current || startOperationRef.current || visibleInviteRef.current)",
      "|| operationRef.current || visibleInviteRef.current)"), "one gesture burst must issue one start"],
  ["terminal result fence", "a delayed Start result cannot resurrect ringing after its call ended during dispatch",
    source => source.replace('if (result.invite?.status !== "busy"', 'if (false && result.invite?.status !== "busy"'),
    "the old dispatch receipt cannot reopen the terminal call"],
  ["retired completion fence", "retired Start failure cannot release a successor Start's busy state",
    source => source.replace("startOperationRef.current === operation && contextRef.current === operation.context", "true"),
    "retired finally must not release the successor Start latch"],
  ["event-boundary retirement", "same-batch ringing incoming projection cannot be overwritten by an old Start reply before layout",
    source => source.replace("if (visibleIncomingInvite) observeIncomingCallProjection(visibleIncomingInvite.id);", ""),
    "the old Start reply cannot overwrite a newer call projection in the same batch"],
  ["unchanged-id commit reconciliation", "same-batch incoming then End projection retires Start even when no invite reaches layout",
    source => source.replace("    operationRef.current = null;\n    setCallBusy(false);\n  });",
      "    operationRef.current = null;\n    setCallBusy(false);\n  }, [setCallBusy, visibleInviteId]);"),
    "settled terminal projection still permits an explicit fresh Start"],
]) {
  test(`Start lifecycle oracle rejects removal of the ${name}`, () => {
    const source = fs.readFileSync("app/chat/[threadId].tsx", "utf8");
    const mutated = mutate(source);
    assert.notEqual(mutated, source, "mutation must alter its exact production guard");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chat-start-control-"));
    try {
      const filename = path.join(directory, "thread.tsx");
      fs.writeFileSync(filename, mutated);
      const env = { ...process.env, CHILLY_CHAT_FULL_THREAD_TEST_SOURCE: filename };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ["--test", "--test-name-pattern", pattern,
        "tests/chat-thread-start-lifecycle-mounted.test.mjs"], {
        encoding: "utf8", env,
      });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.ok((result.stdout + result.stderr).includes(assertion), result.stdout + result.stderr);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
}
