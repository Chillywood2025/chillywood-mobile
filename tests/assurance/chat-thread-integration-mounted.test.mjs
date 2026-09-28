import assert from "node:assert/strict";
import test from "node:test";
import { createDurableChatThreadFixture, mountFullChatThread } from "./helpers/chat-thread-full-mounted-harness.mjs";
import { mountIosRoot, nativeIds as rootNativeIds, makeNativeEvent } from "./helpers/ios-root-thread-handoff-harness.mjs";

test("full screen Answer activates the actual legacy adapter once, only after server acceptance", async () => {
  const h = await mountFullChatThread();
  try {
    assert.equal(h.runtime.media.joinCalls.length, 0);
    assert.equal(h.runtime.media.localStreams.length, 0);
    await h.run(() => Promise.all([
      h.runtime.snapshot.handleAcceptIncomingCall(),
      h.runtime.snapshot.handleAcceptIncomingCall(),
    ]));
    assert.deepEqual(h.runtime.transitions.map(({ status }) => status), ["accepted"]);
    assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
    assert.equal(h.runtime.snapshot.callPanelOpen, true);
    assert.equal(h.runtime.media.joinCalls.length, 1);
    assert.equal(h.runtime.media.localStreams.length, 1);
    assert.equal(h.runtime.media.localStreams[0].getAudioTracks()[0].readyState, "live");
    // No remote frame/connection is fabricated by the screen: accepting alone
    // cannot prove two-way media or make a remote tile connected.
    assert.equal(h.runtime.snapshot.participants.find(p => !p.isSelf).connectionState, "connecting");
  } finally { await h.unmount(); }
});

test("full screen rejects a failed server Answer without starting capture", async () => {
  const h = await mountFullChatThread({ transition: async () => { throw Error("accept rejected"); } });
  try {
    await h.run(() => h.runtime.snapshot.handleAcceptIncomingCall());
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.media.joinCalls.length, 0);
    assert.equal(h.runtime.media.localStreams.length, 0);
    assert.match(h.runtime.snapshot.error, /accept rejected/);
  } finally { await h.unmount(); }
});

test("full screen resumes an accepted call through a fresh admission and keeps controls on its returned generation", async () => {
  const priorGeneration = "12000000-0000-4000-8000-000000000099";
  const h = await mountFullChatThread({
    invite: { status: "accepted" },
    configureMedia: (media) => {
      media.ownedAdmission = true;
      media.membershipGeneration = priorGeneration;
      media.currentAdmissionAttemptId = "13000000-0000-4000-8000-000000000099";
      media.admissionAttempts.set(media.currentAdmissionAttemptId, priorGeneration);
    },
  });
  try {
    const media = h.runtime.media;
    assert.equal(media.admissionPrepareCalls.length, 1);
    assert.equal(media.joinCalls.length, 1);
    assert.equal(media.admissionPrepareCalls[0].expectedPreviousGeneration, priorGeneration);
    assert.strictEqual(media.joinCalls[0].admission, media.admissionPrepareCalls[0]);
    assert.notEqual(media.membershipGeneration, priorGeneration,
      "an accepted invite on a fresh screen cannot inherit the previous durable owner");
    assert.equal(media.localStreams.length, 1);
    const currentGeneration = media.membershipGeneration;
    await h.run(() => h.runtime.snapshot.handleToggleCallMic());
    assert.ok(media.membershipTouches.length > 0);
    for (const request of media.membershipTouches) {
      assert.equal(request.expectedMembershipGeneration, currentGeneration);
    }
    await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(h.runtime.leaves.length, 1);
    assert.equal(h.runtime.leaves[0].expectedMembershipGeneration, currentGeneration);
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    for (const stream of media.localStreams) for (const track of stream.getTracks()) assert.equal(track.readyState, "ended");
  } finally { await h.unmount(); }
});

test("full screen cannot start capture from an accepted invite when admission preparation fails", async () => {
  const h = await mountFullChatThread({
    invite: { status: "accepted" },
    configureMedia: (media) => {
      media.ownedAdmission = true;
      media.admissionPrepareActions.push({ outcome: "reject", message: "admission snapshot offline" });
    },
  });
  try {
    assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
    assert.equal(h.runtime.media.admissionPrepareCalls.length, 1);
    assert.equal(h.runtime.media.joinCalls.length, 0);
    assert.equal(h.runtime.media.localStreams.length, 0);
    assert.equal(h.runtime.media.membershipTouches.length, 0);
    assert.equal(h.runtime.leaves.length, 0);
    assert.notEqual(h.runtime.snapshot.callChannelState, "live");
  } finally { await h.unmount(); }
});

test("full caller screen End after terminal confirmation never repeats a closed-room host mutation", async () => {
  const h = await mountFullChatThread({ invite: { callerUserId: "local-user", calleeUserId: "remote-user", status: "accepted" } });
  try {
    await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(h.runtime.snapshot.callPanelOpen, true);
    assert.equal(h.runtime.media.joinCalls.length, 1);
    await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(h.runtime.hostEnds, 0, "authoritative invite terminal transition already ended the shared room");
    assert.equal(h.runtime.leaves.length, 1);
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    for (const stream of h.runtime.media.localStreams) for (const track of stream.getTracks()) assert.equal(track.readyState, "ended");
  } finally { await h.unmount(); }
});

test("full screen End retains real hook cleanup failure and retry closes the original capture", async () => {
  const h = await mountFullChatThread();
  try {
    await h.run(() => h.runtime.snapshot.handleAcceptIncomingCall());
    h.runtime.leaveFailure = true;
    await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(h.runtime.snapshot.callPanelOpen, true);
    assert.equal(h.runtime.snapshot.activeCallInvite.status, "ended");
    assert.ok(h.runtime.snapshot.error);
    for (const stream of h.runtime.media.localStreams) for (const track of stream.getTracks()) assert.equal(track.readyState, "ended", "capture shutdown cannot wait for DB cleanup");
    const starts = h.runtime.media.localStreams.length;
    h.runtime.leaveFailure = false;
    await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.media.localStreams.length, starts, "Retry End cannot start media again");
  } finally { await h.unmount(); }
});

test("full screen terminal subscription stops actual local media before clearing its call panel", async () => {
  const h = await mountFullChatThread();
  try {
    await h.run(() => h.runtime.snapshot.handleAcceptIncomingCall());
    await h.terminal();
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.ok(h.runtime.leaves.length >= 1);
    for (const stream of h.runtime.media.localStreams) for (const track of stream.getTracks()) assert.equal(track.readyState, "ended");
  } finally { await h.unmount(); }
});

test("full screen keeps video identity during a failed terminal cleanup after server thread projection clears", async () => {
  const h = await mountFullChatThread();
  try {
    await h.run(() => h.runtime.snapshot.handleAcceptIncomingCall());
    h.runtime.leaveFailure = true;
    await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    await h.run(() => h.runtime.snapshot.loadThreadState());
    assert.equal(h.runtime.thread.activeCallType, null);
    assert.equal(h.runtime.snapshot.callPanelOpen, true);
    assert.equal(h.runtime.snapshot.activeCallInvite.callType, "video");
    assert.match(h.runtime.snapshot.callTitle, /^Video call/);
    assert.equal(h.runtime.snapshot.initialCallMediaPreferences.cameraEnabled, true);
  } finally { await h.unmount(); }
});

for (const [field, value] of [["id", "other-invite"], ["communicationRoomId", "OTHER-ROOM"], ["status", "accepted"]]) {
  test(`full screen refuses a mismatched terminal ${field} response before media cleanup`, async () => {
    const h = await mountFullChatThread();
    try {
      await h.run(() => h.runtime.snapshot.handleAcceptIncomingCall());
      h.runtime.transition = async ({ invite }) => ({ ...invite, status: "ended", [field]: value });
      await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
      assert.equal(h.runtime.snapshot.callPanelOpen, true);
      assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
      assert.equal(h.runtime.leaves.length, 0);
      assert.match(h.runtime.snapshot.error, /Unable to end/);
    } finally { await h.unmount(); }
  });
}

test("full screen expiry retries a rejected server transition and settles only confirmed missed", async () => {
  const h = await mountFullChatThread({ invite: { expiresAt: new Date(Date.now() - 1_000).toISOString() } });
  try {
    h.runtime.transition = async () => { throw Error("temporary network failure"); };
    await h.fireTimer(h.runtime.timers.find(timer => !timer.canceled && timer.delay === 0));
    assert.equal(h.runtime.snapshot.incomingCallInvite.status, "ringing");
    assert.equal(h.runtime.clears.length, 0);
    const retry = h.runtime.timers.find(timer => !timer.canceled && timer.delay === 4_000);
    assert.ok(retry, "a transient failed expiry must not strand an actionable invite indefinitely");
    h.runtime.transition = null;
    await h.fireTimer(retry);
    assert.equal(h.runtime.invite.status, "missed");
    assert.equal(h.runtime.snapshot.incomingCallInvite, null);
    assert.equal(h.runtime.media.localStreams.length, 0);
  } finally { await h.unmount(); }
});

test("full screen expiry cannot treat a failed read as proof the call ended", async () => {
  const h = await mountFullChatThread({ invite: { expiresAt: new Date(Date.now() - 1_000).toISOString() } });
  try {
    h.runtime.readInvite = async () => { throw Error("read offline"); };
    await h.fireTimer(h.runtime.timers.find(timer => !timer.canceled && timer.delay === 0));
    assert.equal(h.runtime.snapshot.incomingCallInvite.id, "invite");
    assert.equal(h.runtime.clears.length, 0);
    assert.ok(h.runtime.timers.some(timer => !timer.canceled && timer.delay === 4_000));
  } finally { await h.unmount(); }
});

test("full caller expiry retries failed authority and never acquires media for an unanswered call", async () => {
  const h = await mountFullChatThread({ noActiveCall: true, invite: { callerUserId: "local-user", calleeUserId: "remote-user",
    expiresAt: new Date(Date.now() - 1_000).toISOString() } });
  try {
    h.runtime.transition = async () => { throw Error("transient missed mutation failure"); };
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    const deadline = h.runtime.timers.find(timer => !timer.canceled && timer.delay === 0);
    assert.ok(deadline, "actual caller start schedules the expired server deadline");
    await h.fireTimer(deadline);
    assert.equal(h.runtime.invite.status, "ringing");
    assert.equal(h.runtime.clears.length, 0);
    const retry = h.runtime.timers.find(timer => !timer.canceled && timer.delay === 4_000);
    assert.ok(retry, "caller expiry must survive one failed server transition");
    h.runtime.transition = null;
    await h.fireTimer(retry);
    assert.equal(h.runtime.invite.status, "missed");
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.equal(h.runtime.media.localStreams.length, 0);
  } finally { await h.unmount(); }
});

test("full incoming subscription rejects another invite response before activating media", async () => {
  const h = await mountFullChatThread();
  try {
    h.runtime.readInvite = async () => ({ ...h.runtime.invite, id: "replacement", status: "accepted" });
    await h.run(async () => { for (const listener of h.runtime.subscriptions) listener(); });
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.media.joinCalls.length, 0);
    assert.equal(h.runtime.snapshot.incomingCallInvite.id, "invite");
  } finally { await h.unmount(); }
});

const nativeIds = {
  userId: "10000000-0000-4000-8000-000000000001",
  remoteUserId: "10000000-0000-4000-8000-000000000002",
  threadId: "10000000-0000-4000-8000-000000000003",
  inviteId: "10000000-0000-4000-8000-000000000004",
  callUuid: "10000000-0000-4000-8000-000000000005",
};

test("full iPhone screen consumes real native provenance and waits for exact audio activation before capture", async () => {
  const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
    invite: { id: nativeIds.inviteId }, nativeAnswer: { callUuid: nativeIds.callUuid } });
  try {
    assert.deepEqual(h.runtime.transitions.map(({ status }) => status), ["accepted"]);
    assert.deepEqual(h.runtime.nativeCompletions, [{ uuid: nativeIds.callUuid, connected: true }]);
    assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
    assert.equal(h.runtime.media.joinCalls.length, 0, "server acceptance cannot bypass native audio readiness");
    await h.nativeEvent({ type: "audioSessionActivated", callUuid: "10000000-0000-4000-8000-000000000006" });
    assert.equal(h.runtime.media.localStreams.length, 0, "another native call cannot unlock capture");
    await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
    assert.equal(h.runtime.media.joinCalls.length, 1);
    assert.equal(h.runtime.media.localStreams.length, 1);
    assert.equal(h.runtime.snapshot.participants.find(p => !p.isSelf).connectionState, "connecting");
    await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.equal(h.runtime.hostEnds, 0);
    assert.equal(h.runtime.leaves.length, 1);
  } finally { await h.unmount(); }
});

test("full iPhone screen rejects unissued route claims without accepting or capturing", async () => {
  const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
    invite: { id: nativeIds.inviteId }, routeParams: { callInviteId: nativeIds.inviteId,
      nativeCallUuid: nativeIds.callUuid, nativeCallClaim: "f".repeat(64) } });
  try {
    await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
    assert.equal(h.runtime.transitions.length, 0);
    assert.equal(h.runtime.media.joinCalls.length, 0);
    assert.equal(h.runtime.nativeCompletions.length, 0);
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
  } finally { await h.unmount(); }
});

async function mountMessagingPair(t) {
  const store = createDurableChatThreadFixture();
  const caller = await mountFullChatThread({ durableThread: store, noActiveCall: true });
  // These paired screens prove participant-role and message/call state changes.
  // Both use the JS Answer path; the real-provenance iOS cases above independently
  // cover native handoff. Two mounted screens are not two physical platforms.
  const callee = await mountFullChatThread({ durableThread: store, noActiveCall: true,
    userId: "remote-user", remoteUserId: "local-user" });
  t.after(async () => { await caller.unmount(); await callee.unmount(); });
  return { store, caller, callee };
}

async function exchangeScreenMessages(store, caller, callee, label) {
  await caller.run(() => caller.runtime.snapshot.handleSend(`${label}:caller`));
  await callee.flush();
  await callee.run(() => callee.runtime.snapshot.handleSend(`${label}:callee`));
  await caller.flush();
  const expected = store.messages.map(({ id, body, senderUserId }) => ({ id, body, senderUserId }));
  for (const screen of [caller, callee]) {
    assert.deepEqual(screen.runtime.snapshot.messages.map(({ id, body, senderUserId }) => ({ id, body, senderUserId })), expected);
    assert.equal(screen.runtime.snapshot.messages.some(message => message.id.startsWith("temp-")), false);
  }
}

for (const terminal of ["cancel", "decline", "End", "replacement"]) {
  test(`actual paired screens preserve durable bidirectional messages before and after ${terminal}`, async (t) => {
    const { store, caller, callee } = await mountMessagingPair(t);
    await exchangeScreenMessages(store, caller, callee, "before");
    await caller.run(() => caller.runtime.snapshot.handleStartCall("video"));
    await callee.flush();
    assert.equal(store.invite.status, "ringing");
    assert.equal(caller.runtime.media.localStreams.length, 0, "ringing caller must not capture");
    assert.equal(callee.runtime.media.localStreams.length, 0, "ringing callee must not capture");
    if (["End", "replacement"].includes(terminal)) {
      await callee.run(() => callee.runtime.snapshot.handleAcceptIncomingCall());
      await caller.flush();
      assert.equal(store.invite.status, "accepted");
      assert.ok(caller.runtime.media.localStreams.length > 0);
      assert.ok(callee.runtime.media.localStreams.length > 0);
    }
    if (terminal === "decline") await callee.run(() => callee.runtime.snapshot.handleDeclineIncomingCall());
    else await caller.run(() => caller.runtime.snapshot.handleJoinOrCloseCall());
    await caller.flush(); await callee.flush();
    assert.equal(store.invite.status, terminal === "cancel" ? "canceled" : terminal === "decline" ? "declined" : "ended");
    assert.equal(caller.runtime.snapshot.callPanelOpen, false);
    assert.equal(callee.runtime.snapshot.callPanelOpen, false);
    for (const screen of [caller, callee]) for (const stream of screen.runtime.media.localStreams) {
      for (const track of stream.getTracks()) assert.equal(track.readyState, "ended");
    }
    if (terminal === "replacement") {
      const oldInvite = store.invite.id;
      await callee.run(() => callee.runtime.snapshot.handleStartCall("voice"));
      await caller.flush();
      assert.notEqual(store.invite.id, oldInvite);
      await caller.run(() => caller.runtime.snapshot.handleAcceptIncomingCall());
      await callee.flush();
      assert.equal(store.invite.status, "accepted");
      assert.equal(store.invite.callType, "voice");
    }
    await exchangeScreenMessages(store, caller, callee, "after");
    assert.equal(store.messages.length, 4, "call cleanup/replacement must preserve all committed messages");
    assert.equal(new Set(store.messages.map(message => message.id)).size, 4);
  });
}

for (const mode of ["voice", "video"]) {
  test(`full same-thread fresh ${mode} call starts only after terminal cleanup with preserved messages`, async (t) => {
    const { store, caller, callee } = await mountMessagingPair(t);
    await exchangeScreenMessages(store, caller, callee, "retained");
    await caller.run(() => caller.runtime.snapshot.handleStartCall(mode));
    await callee.flush();
    await callee.run(() => callee.runtime.snapshot.handleAcceptIncomingCall());
    await caller.flush();
    const oldRoom = store.invite.communicationRoomId;
    await callee.run(() => callee.runtime.snapshot.handleJoinOrCloseCall());
    await caller.flush();
    for (const screen of [caller, callee]) for (const stream of screen.runtime.media.localStreams) {
      for (const track of stream.getTracks()) assert.equal(track.readyState, "ended");
    }
    await caller.run(() => caller.runtime.snapshot.handleStartCall(mode));
    await callee.flush();
    assert.notEqual(store.invite.communicationRoomId, oldRoom);
    await callee.run(() => callee.runtime.snapshot.handleAcceptIncomingCall());
    await caller.flush();
    assert.equal(store.invite.status, "accepted");
    for (const screen of [caller, callee]) {
      assert.equal(screen.runtime.snapshot.initialCallMediaPreferences.cameraEnabled, mode === "video");
      const current = screen.runtime.media.localStreams.filter(stream => stream.getTracks().some(track => track.readyState === "live"));
      assert.ok(current.length > 0);
      assert.equal(current.some(stream => stream.getVideoTracks().some(track => track.readyState === "live")), mode === "video");
      assert.equal(screen.runtime.snapshot.messages.length, 2);
    }
  });
}

test("full screen rejected message write removes only its optimistic row and preserves committed history", async (t) => {
  const { store, caller, callee } = await mountMessagingPair(t);
  await exchangeScreenMessages(store, caller, callee, "committed");
  store.writeActions.push({ reject: "message write rejected" });
  await caller.run(() => caller.runtime.snapshot.handleSend("uncommitted"));
  assert.equal(store.messages.length, 2);
  assert.equal(caller.runtime.snapshot.messages.length, 2);
  assert.equal(caller.runtime.snapshot.sending, false);
  assert.match(caller.runtime.snapshot.error, /message write rejected/);
  await exchangeScreenMessages(store, caller, callee, "retry");
  assert.equal(store.messages.length, 4);
});

function deferredMessageWrite() {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  return { wait, release };
}

test("full screen account replacement releases the retired send slot without inheriting its error", async (t) => {
  const { store, caller } = await mountMessagingPair(t);
  const oldWrite = deferredMessageWrite();
  store.writeActions.push({ wait: oldWrite.wait, reject: "retired account write rejected" });
  let oldOperation;
  await caller.run(() => { oldOperation = caller.runtime.snapshot.handleSend("old account pending"); });
  assert.equal(caller.runtime.snapshot.sending, true);
  await caller.rerender({ userId: "remote-user", remoteUserId: "local-user", sessionGeneration: "session-2" });
  const replacementWasBlocked = caller.runtime.snapshot.sending;
  await caller.run(async () => { oldWrite.release(); await oldOperation; });
  assert.equal(replacementWasBlocked, false, "a new account must not inherit the old account's in-flight send slot");
  assert.equal(caller.runtime.snapshot.error, null, "a retired write failure cannot become the replacement account's error");
  assert.equal(store.messages.length, 0);
  assert.equal(caller.runtime.snapshot.messages.length, 0);
});

test("full screen late retired message failure cannot alter a replacement account's pending send", async (t) => {
  const { store, caller } = await mountMessagingPair(t);
  const oldWrite = deferredMessageWrite();
  const newWrite = deferredMessageWrite();
  store.writeActions.push({ wait: oldWrite.wait, reject: "retired account write rejected" });
  let oldOperation;
  await caller.run(() => { oldOperation = caller.runtime.snapshot.handleSend("old account pending"); });
  await caller.rerender({ userId: "remote-user", remoteUserId: "local-user", sessionGeneration: "session-2" });
  store.writeActions.push({ wait: newWrite.wait });
  let newOperation;
  await caller.run(() => { newOperation = caller.runtime.snapshot.handleSend("new account pending"); });
  const newWriteStarted = store.sends.length === 2;
  await caller.run(async () => { oldWrite.release(); await oldOperation; });
  const replacementStillSending = caller.runtime.snapshot.sending;
  const replacementError = caller.runtime.snapshot.error;
  await caller.run(async () => { newWrite.release(); await newOperation; });
  assert.equal(newWriteStarted, true, "the replacement account can issue its own controlled write");
  assert.equal(replacementStillSending, true, "old finally cannot release the new account's send slot");
  assert.equal(replacementError, null, "old catch cannot overwrite the replacement's state");
  assert.deepEqual(store.messages.map(message => [message.senderUserId, message.body]), [["remote-user", "new account pending"]]);
  assert.equal(caller.runtime.snapshot.sending, false);
});

for (const replacement of ["account", "session"]) {
  test(`full screen retained send callback cannot submit after ${replacement} replacement`, async (t) => {
    const { store, caller } = await mountMessagingPair(t);
    const staleSend = caller.runtime.snapshot.handleSend;
    await caller.rerender(replacement === "account"
      ? { userId: "remote-user", remoteUserId: "local-user", sessionGeneration: "session-2" }
      : { sessionGeneration: "session-2" });
    await caller.run(() => staleSend("stale callback"));
    assert.equal(store.sends.length, 0, "a callback from retired identity cannot start a mutation");
    await caller.run(() => caller.runtime.snapshot.handleSend("current callback"));
    assert.equal(store.sends.length, 1);
    assert.equal(store.messages[0].senderUserId, caller.runtime.userId);
    assert.equal(store.messages[0].body, "current callback");
  });
}

test("full screen same-account renewed session preserves its pending send when an older successful write settles", async (t) => {
  const { store, caller } = await mountMessagingPair(t);
  const oldWrite = deferredMessageWrite();
  const newWrite = deferredMessageWrite();
  store.writeActions.push({ wait: oldWrite.wait });
  let oldOperation;
  await caller.run(() => { oldOperation = caller.runtime.snapshot.handleSend("old dispatched write"); });
  await caller.rerender({ sessionGeneration: "session-2" });
  store.writeActions.push({ wait: newWrite.wait });
  let newOperation;
  await caller.run(() => { newOperation = caller.runtime.snapshot.handleSend("new dispatched write"); });
  await caller.run(() => caller.runtime.snapshot.setDraft("new session next draft"));
  await caller.run(async () => { oldWrite.release(); await oldOperation; });
  assert.equal(store.messages[0].body, "old dispatched write", "a dispatched original write may commit normally");
  assert.equal(caller.runtime.snapshot.sending, true, "retired success/finally cannot unlock the current operation");
  assert.equal(caller.runtime.snapshot.draft, "new session next draft");
  await caller.run(async () => { newWrite.release(); await newOperation; });
  assert.deepEqual(store.messages.map(message => message.body), ["old dispatched write", "new dispatched write"]);
  assert.equal(caller.runtime.snapshot.sending, false);
});

test("full caller Cancel keeps the exact ringing invite after rejection and retries without capture or message loss", async (t) => {
  const { store, caller, callee } = await mountMessagingPair(t);
  await exchangeScreenMessages(store, caller, callee, "retained");
  await caller.run(() => caller.runtime.snapshot.handleStartCall("voice"));
  await callee.flush();
  const inviteId = store.invite.id;
  caller.runtime.transition = async () => { throw Error("cancel transaction unavailable"); };
  await caller.run(() => caller.runtime.snapshot.handleJoinOrCloseCall());
  assert.equal(store.invite.id, inviteId);
  assert.equal(store.invite.status, "ringing");
  assert.equal(caller.runtime.snapshot.callPanelOpen, true);
  assert.equal(callee.runtime.snapshot.incomingCallInvite.id, inviteId);
  assert.equal(caller.runtime.media.localStreams.length, 0);
  assert.equal(callee.runtime.media.localStreams.length, 0);
  assert.equal(store.messages.length, 2);
  caller.runtime.transition = null;
  await caller.run(() => caller.runtime.snapshot.handleJoinOrCloseCall());
  await callee.flush();
  assert.equal(store.invite.status, "canceled");
  assert.equal(store.transitions.filter(transition => transition.status === "canceled").length, 1);
  assert.equal(caller.runtime.snapshot.callPanelOpen, false);
  assert.equal(callee.runtime.snapshot.incomingCallInvite, null);
  await exchangeScreenMessages(store, caller, callee, "after retry");
});

for (const [mode, endRole] of [["voice", "callee"], ["video", "caller"]]) {
  test(`full paired screens block fresh ${mode} start while ${endRole} End cleanup is unresolved`, async (t) => {
    const { store, caller, callee } = await mountMessagingPair(t);
    await caller.run(() => caller.runtime.snapshot.handleStartCall(mode));
    await callee.flush();
    await callee.run(() => callee.runtime.snapshot.handleAcceptIncomingCall());
    await caller.flush();
    assert.equal(store.invite.status, "accepted");
    const retiredInviteId = store.invite.id;
    const retiredRoomId = store.invite.communicationRoomId;
    const ending = endRole === "caller" ? caller : callee;
    const other = endRole === "caller" ? callee : caller;
    const cleanup = deferredMessageWrite();
    ending.runtime.leaveBarrier = cleanup.wait;
    let pendingEnd;
    await ending.run(() => { pendingEnd = ending.runtime.snapshot.handleJoinOrCloseCall(); });
    await other.flush();
    assert.equal(store.invite.status, "ended", "the server terminal response alone cannot settle local cleanup");
    assert.ok(ending.runtime.leaves.length > 0, "actual hook must reach the held exact membership cleanup");
    assert.equal(ending.runtime.snapshot.callPanelOpen, true);
    const acquisitions = ending.runtime.media.localStreams.length;
    const roomCount = store.rooms.size;
    await ending.run(() => ending.runtime.snapshot.handleStartCall(mode));
    assert.equal(store.rooms.size, roomCount, "pending End must not create a replacement invite/room");
    assert.equal(store.invite.id, retiredInviteId);
    assert.equal(ending.runtime.media.localStreams.length, acquisitions, "pending End cannot acquire replacement capture");
    for (const stream of ending.runtime.media.localStreams) {
      for (const track of stream.getTracks()) assert.equal(track.readyState, "ended", "local privacy stop precedes the held backend leave");
    }
    await ending.run(async () => { cleanup.release(); await pendingEnd; });
    await other.flush();
    assert.equal(ending.runtime.snapshot.callPanelOpen, false);
    ending.runtime.leaveBarrier = null;
    await ending.run(() => ending.runtime.snapshot.handleStartCall(mode));
    await other.flush();
    assert.notEqual(store.invite.id, retiredInviteId);
    assert.notEqual(store.invite.communicationRoomId, retiredRoomId);
    assert.equal(store.rooms.size, roomCount + 1);
    await other.run(() => other.runtime.snapshot.handleAcceptIncomingCall());
    await ending.flush();
    assert.equal(store.invite.status, "accepted");
    for (const screen of [ending, other]) {
      assert.equal(screen.runtime.snapshot.initialCallMediaPreferences.cameraEnabled, mode === "video");
      assert.ok(screen.runtime.media.localStreams.some(stream => stream.getAudioTracks().some(track => track.readyState === "live")),
        "settled cleanup permits real hook initialization of the fresh call");
    }
  });
}

test("actual root native Answer route is consumed by the actual screen once and waits for its exact audio activation", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  assert.equal(root.routes.length, 0, "no chat screen is mounted before the root event");
  await root.event(makeNativeEvent("incoming"));
  await root.event(makeNativeEvent("answerRequested"));
  await root.event(makeNativeEvent("answerRequested"));
  assert.equal(root.routes.length, 1, "duplicate native Answer emits one root navigation intent");
  const destination = new URL(root.routes[0], "https://test.invalid");
  assert.equal(destination.pathname, `/chat/${rootNativeIds.thread}`);
  // The router boundary is explicit: feed its unmodified production destination
  // into the destination screen. No claim is reissued or generated by this test.
  const screen = await mountFullChatThread({ userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session,
    invite: { id: rootNativeIds.invite },
    routeParams: Object.fromEntries(destination.searchParams), nativeFacade: root.facade });
  t.after(() => screen.unmount());
  assert.deepEqual(screen.runtime.transitions.map(({ status }) => status), ["accepted"]);
  assert.equal(screen.runtime.snapshot.activeCallInvite.id, rootNativeIds.invite);
  assert.deepEqual(Array.from(root.nativeSteps).filter(step => step.name === "answer").map(({ uuid, connected }) => ({ uuid, connected })),
    [{ uuid: rootNativeIds.uuid, connected: true }], "the screen completes the same native Answer through the shared production facade");
  assert.equal(screen.runtime.media.localStreams.length, 0, "root navigation and server acceptance are not media readiness");
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated", { callUuid: rootNativeIds.replacementUuid })));
  assert.equal(screen.runtime.media.localStreams.length, 0, "another native UUID cannot activate this call");
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  assert.equal(screen.runtime.media.joinCalls.length, 1);
  assert.equal(screen.runtime.media.localStreams.length, 1);
  assert.equal(screen.runtime.media.localStreams[0].getAudioTracks()[0].readyState, "live");
  assert.equal(screen.runtime.snapshot.participants.find(participant => !participant.isSelf).connectionState, "connecting",
    "successful JS handoff does not fabricate remote media or physical connection proof");
  await screen.run(() => root.event(makeNativeEvent("answerRequested")));
  assert.equal(root.routes.length, 1);
  assert.equal(screen.runtime.transitions.length, 1);
  assert.equal(screen.runtime.media.localStreams.length, 1);
});

test("actual root-issued native Answer route cannot be consumed by a replacement-account screen", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  await root.event(makeNativeEvent("incoming"));
  await root.event(makeNativeEvent("answerRequested"));
  assert.equal(root.routes.length, 1);
  const destination = new URL(root.routes[0], "https://test.invalid");
  const screen = await mountFullChatThread({ userId: "00000000-0000-4000-8000-000000000098",
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: "replacement-session",
    invite: { id: rootNativeIds.invite, calleeUserId: rootNativeIds.user },
    routeParams: Object.fromEntries(destination.searchParams), nativeFacade: root.facade });
  t.after(() => screen.unmount());
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  assert.equal(screen.runtime.transitions.length, 0, "a real claim is still restricted to its original account");
  assert.equal(screen.runtime.media.joinCalls.length, 0);
  assert.equal(screen.runtime.media.localStreams.length, 0);
  assert.equal(screen.runtime.snapshot.activeCallInvite, null);
});
