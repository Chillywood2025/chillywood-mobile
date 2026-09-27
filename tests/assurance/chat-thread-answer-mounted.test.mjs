import assert from "node:assert/strict";
import test from "node:test";
import { deferred, mountChatAnswer } from "./helpers/chat-thread-answer-mounted-harness.mjs";

test("duplicate foreground Answer resumes only the exact already-accepted invite", async () => {
  const h = await mountChatAnswer();
  h.runtime.invite = { ...h.runtime.invite, status: "accepted" };
  await h.rerender();
  let accepted;
  await h.act(async () => { accepted = await h.runtime.snapshot.acceptIncomingInvite(h.runtime.invite); });
  assert.equal(accepted, true);
  assert.equal(h.runtime.updates.length, 0);
  assert.equal(h.runtime.accepted.length, 1);
  assert.equal(h.runtime.clears.length, 0);
  await h.unmount();
});

test("same-render double Answer starts one authoritative transition", async () => {
  const read = deferred();
  const h = await mountChatAnswer({ readInvite: () => read.promise });
  let first; let second;
  await h.act(async () => {
    const answer = h.runtime.snapshot.acceptIncomingInvite;
    first = answer(h.runtime.invite);
    second = answer(h.runtime.invite);
  });
  await h.act(async () => { read.resolve(h.runtime.invite); await Promise.all([first, second]); });
  assert.equal(h.runtime.updates.length, 1);
  assert.equal(h.runtime.accepted.length, 1);
  assert.equal(h.runtime.snapshot.callBusy, false);
  await h.unmount();
});

for (const [name, patch] of [
  ["account", { currentUserId: "replacement-user" }],
  ["thread", { threadId: "replacement-thread" }],
  ["session", { sessionGeneration: "session-2" }],
]) {
  test(`pending Answer cannot accept or apply after ${name} replacement`, async () => {
    const read = deferred();
    const h = await mountChatAnswer({ readInvite: () => read.promise });
    let operation;
    await h.act(async () => { operation = h.runtime.snapshot.acceptIncomingInvite(h.runtime.invite); });
    await h.rerender(patch);
    await h.act(async () => { read.resolve(h.runtime.invite); await operation; });
    assert.equal(h.runtime.updates.length, 0);
    assert.equal(h.runtime.accepted.length, 0);
    assert.equal(h.runtime.snapshot.callBusy, false);
    await h.unmount();
  });
}

test("pending Answer stops before mutation after unmount", async () => {
  const read = deferred();
  const h = await mountChatAnswer({ readInvite: () => read.promise });
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.acceptIncomingInvite(h.runtime.invite); });
  await h.unmount();
  read.resolve(h.runtime.invite);
  await operation;
  assert.equal(h.runtime.updates.length, 0);
  assert.equal(h.runtime.accepted.length, 0);
});

test("iOS pending presentation cannot request a native answer after account replacement", async () => {
  const presentation = deferred();
  const h = await mountChatAnswer({ platform: "ios", presentation: () => presentation.promise });
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.acceptIncomingInvite(h.runtime.invite); });
  await h.rerender({ currentUserId: "replacement-user" });
  await h.act(async () => { presentation.resolve("presented"); await operation; });
  assert.equal(h.runtime.nativeRequests.length, 0);
  assert.equal(h.runtime.snapshot.callBusy, false);
  await h.unmount();
});

test("late accepted response cannot open media for a replacement account", async () => {
  const update = deferred();
  const h = await mountChatAnswer({ update: () => update.promise });
  const original = h.runtime.invite;
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.acceptIncomingInvite(original); });
  assert.equal(h.runtime.updates.length, 1);
  await h.rerender({ currentUserId: "replacement-user" });
  await h.act(async () => { update.resolve({ ...original, status: "accepted" }); await operation; });
  assert.equal(h.runtime.completions.length, 0);
  assert.equal(h.runtime.accepted.length, 0);
  assert.equal(h.runtime.errors.length, 0);
  await h.unmount();
});

test("a new incoming invite retires the previous pending Answer without clearing the new banner", async () => {
  const read = deferred();
  const h = await mountChatAnswer({ readInvite: () => read.promise });
  const original = h.runtime.invite;
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.acceptIncomingInvite(original); });
  await h.rerender({ invite: { ...original, id: "new-invite", communicationRoomId: "new-room" } });
  await h.act(async () => { read.resolve({ ...original, status: "ended" }); await operation; });
  assert.equal(h.runtime.updates.length, 0);
  assert.equal(h.runtime.clears.length, 0);
  assert.equal(h.runtime.accepted.length, 0);
  assert.equal(h.runtime.snapshot.callBusy, false);
  await h.unmount();
});

test("iOS native request releases busy so the trusted Answer can continue", async () => {
  const request = deferred();
  const h = await mountChatAnswer({ platform: "ios", requestNative: () => request.promise });
  let foreground;
  await h.act(async () => { foreground = h.runtime.snapshot.acceptIncomingInvite(h.runtime.invite); });
  assert.equal(h.runtime.snapshot.callBusy, true);
  assert.equal(h.runtime.updates.length, 0);
  await h.rerender({ requestedNativeCallUuid: "trusted-native-uuid" });
  await h.act(async () => { request.resolve(true); await foreground; });
  assert.equal(h.runtime.snapshot.callBusy, false);
  await h.act(async () => { await h.runtime.snapshot.acceptIncomingInvite(h.runtime.invite); });
  assert.equal(h.runtime.updates.length, 1);
  assert.equal(h.runtime.accepted.length, 1);
  assert.equal(h.runtime.nativeRequests.length, 1);
  await h.unmount();
});

test("rejected acceptance reports failure, releases busy, and allows a real retry", async () => {
  const h = await mountChatAnswer({ update: async () => { throw new Error("server rejected"); } });
  await h.act(async () => { assert.equal(await h.runtime.snapshot.acceptIncomingInvite(h.runtime.invite), false); });
  assert.deepEqual(h.runtime.errors, ["server rejected"]);
  assert.equal(h.runtime.snapshot.callBusy, false);
  h.runtime.update = async ({ invite }) => ({ ...invite, status: "accepted" });
  await h.act(async () => { assert.equal(await h.runtime.snapshot.acceptIncomingInvite(h.runtime.invite), true); });
  assert.equal(h.runtime.accepted.length, 1);
  await h.unmount();
});

for (const [name, patch] of [
  ["different invite", { id: "other-invite" }],
  ["different room", { communicationRoomId: "other-room" }],
  ["different recipient", { calleeUserId: "other-user" }],
  ["terminal", { status: "ended" }],
  ["expired", { expiresAt: "2000-01-01T00:00:00Z" }],
]) {
  test(`Answer rejects ${name} authoritative read without media`, async () => {
    const h = await mountChatAnswer();
    const original = h.runtime.invite;
    h.runtime.readInvite = async () => ({ ...original, ...patch });
    await h.act(async () => { assert.equal(await h.runtime.snapshot.acceptIncomingInvite(original), false); });
    assert.equal(h.runtime.updates.length, 0);
    assert.equal(h.runtime.accepted.length, 0);
    assert.equal(h.runtime.snapshot.callBusy, false);
    await h.unmount();
  });
}

test("already-accepted invite is not resumed when thread owns a different room", async () => {
  const h = await mountChatAnswer({ readThread: async () => ({ threadId: "thread", activeCommunicationRoomId: "other-room" }) });
  h.runtime.invite = { ...h.runtime.invite, status: "accepted" };
  await h.act(async () => { assert.equal(await h.runtime.snapshot.acceptIncomingInvite(h.runtime.invite), false); });
  assert.equal(h.runtime.updates.length, 0);
  assert.equal(h.runtime.accepted.length, 0);
  await h.unmount();
});

test("mismatched acceptance response never completes native Answer or applies media", async () => {
  const h = await mountChatAnswer({ update: async ({ invite }) => ({ ...invite, id: "other-invite", status: "accepted" }) });
  await h.act(async () => { assert.equal(await h.runtime.snapshot.acceptIncomingInvite(h.runtime.invite), false); });
  assert.equal(h.runtime.completions.length, 0);
  assert.equal(h.runtime.accepted.length, 0);
  assert.equal(h.runtime.errors.length, 1);
  await h.unmount();
});

test("thread refresh ignores an older message response arriving after a newer read", async () => {
  const older = deferred();
  const newer = deferred();
  let reads = 0;
  const h = await mountChatAnswer({ readMode: true, readMessages: () => (++reads === 1 ? older.promise : newer.promise) });
  let first; let second;
  await h.act(async () => {
    first = h.runtime.snapshot.loadThreadState();
    second = h.runtime.snapshot.loadThreadState();
  });
  await h.act(async () => { newer.resolve([{ id: "new-message" }]); await second; });
  await h.act(async () => { older.resolve([{ id: "old-message" }]); await first; });
  assert.deepEqual(h.runtime.messages, [{ id: "new-message" }]);
  assert.equal(h.runtime.markRead, 1);
  await h.unmount();
});

test("thread refresh cannot project old account data after account replacement", async () => {
  const messages = deferred();
  const h = await mountChatAnswer({ readMode: true, readMessages: () => messages.promise });
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.loadThreadState(); });
  await h.rerender({ currentUserId: "replacement-user" });
  await h.act(async () => { messages.resolve([{ id: "old-account-message" }]); await operation; });
  assert.equal(h.runtime.messages, undefined);
  assert.equal(h.runtime.thread, undefined);
  assert.equal(h.runtime.markRead, undefined);
  await h.unmount();
});

test("thread refresh late reconciliation cannot close a replacement call panel", async () => {
  const snapshot = deferred();
  const h = await mountChatAnswer({ readMode: true, readSnapshot: () => snapshot.promise, panelOpen: true });
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.loadThreadState(); });
  await h.rerender({ threadId: "replacement-thread" });
  await h.act(async () => { snapshot.resolve({ room: { status: "ended" } }); await operation; });
  assert.equal(h.runtime.panelOpen, true);
  assert.equal(h.runtime.clears.length, 0);
  await h.unmount();
});

test("local iPhone mute acknowledgement does not issue a duplicate media mutation", async () => {
  const h = await mountChatAnswer({ micMode: true, platform: "ios", requestedNativeCallUuid: "call-uuid" });
  await h.act(async () => { await h.runtime.snapshot.handleToggleCallMic(); });
  assert.deepEqual(h.runtime.mediaMutations, [true]);
  assert.deepEqual(h.runtime.nativeMuteRequests, [{ callUuid: "call-uuid", muted: false }]);
  await h.unmount();
});

test("unmatched system microphone control still runs media reconciliation", async () => {
  const h = await mountChatAnswer({ micMode: true, platform: "ios", requestedNativeCallUuid: "call-uuid" });
  await h.act(async () => { h.runtime.nativeListener({ callUuid: "call-uuid", type: "unmuted" }); });
  assert.deepEqual(h.runtime.mediaMutations, [true]);
  await h.unmount();
});

test("failed native synchronization cannot suppress the next real system control", async () => {
  const h = await mountChatAnswer({ micMode: true, platform: "ios", requestedNativeCallUuid: "call-uuid", nativeMuteFailure: true });
  await h.act(async () => { await h.runtime.snapshot.handleToggleCallMic(); });
  await h.act(async () => { h.runtime.nativeListener({ callUuid: "call-uuid", type: "unmuted" }); });
  assert.deepEqual(h.runtime.mediaMutations, [true, true]);
  await h.unmount();
});

test("old call mute acknowledgements cannot affect the replacement call", async () => {
  const h = await mountChatAnswer({ micMode: true, platform: "ios", requestedNativeCallUuid: "old-call", deferNativeMuteEvent: true });
  await h.act(async () => { await h.runtime.snapshot.handleToggleCallMic(); });
  await h.rerender({ requestedNativeCallUuid: "new-call" });
  await h.act(async () => { h.runtime.nativeListener({ callUuid: "old-call", type: "unmuted" }); });
  assert.deepEqual(h.runtime.mediaMutations, [true]);
  await h.act(async () => { h.runtime.nativeListener({ callUuid: "new-call", type: "unmuted" }); });
  assert.deepEqual(h.runtime.mediaMutations, [true, true]);
  await h.unmount();
});

test("late manual media routing cannot invoke the global native route for a replacement call", async () => {
  const media = deferred();
  const h = await mountChatAnswer({ controlsMode: true, platform: "ios", setSpeaker: () => media.promise });
  let request;
  await h.act(async () => { request = h.runtime.snapshot.handleToggleNativeAudioRoute(); });
  await h.rerender({ invite: { ...h.runtime.invite, id: "new-call", communicationRoomId: "new-room" } });
  await h.act(async () => { media.resolve(true); await request; });
  assert.equal(h.runtime.routeRequests.filter(([type]) => type === "native").length, 0);
  assert.equal(h.runtime.speakerWrites.length, 0);
  await h.unmount();
});

test("automatic routing cannot overwrite a later manual choice when its promise resolves last", async () => {
  const automatic = deferred(); let calls = 0;
  const h = await mountChatAnswer({ controlsMode: true, setSpeaker: () => ++calls === 1 ? automatic.promise : Promise.resolve(true) });
  await h.rerender({ invite: { ...h.runtime.invite, status: "accepted" }, callChannelState: "live" });
  let manual;
  await h.act(async () => { manual = h.runtime.snapshot.handleToggleNativeAudioRoute(); });
  await h.act(async () => { automatic.resolve(true); await manual; });
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, true);
  assert.equal(h.runtime.routeRequests.at(-1)[1], true);
  await h.unmount();
});

test("reconnection preserves the current call's manual audio route", async () => {
  const h = await mountChatAnswer({ controlsMode: true });
  await h.rerender({ invite: { ...h.runtime.invite, status: "accepted" }, callChannelState: "live" });
  await h.act(async () => { await h.runtime.snapshot.handleToggleNativeAudioRoute(); });
  await h.rerender({ callChannelState: "reconnecting" });
  await h.rerender({ callChannelState: "live" });
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, true);
  await h.unmount();
});

for (const [method, option] of [["handleToggleCallCamera", "toggleCamera"], ["handleSwitchCallCamera", "switchCamera"]]) {
  test(`late ${method} failure cannot write an error in the replacement call`, async () => {
    const control = deferred();
    const h = await mountChatAnswer({ controlsMode: true, [option]: () => control.promise });
    let operation;
    await h.act(async () => { operation = h.runtime.snapshot[method](); });
    await h.rerender({ invite: { ...h.runtime.invite, id: "new-call" } });
    await h.act(async () => { control.resolve(false); await operation; });
    assert.equal(h.runtime.controlErrors.length, 0);
    assert.equal(h.runtime.errors.length, 0);
    await h.unmount();
  });
}

test("late Decline response cannot clear a replacement account's thread or notifications", async () => {
  const decline = deferred();
  const h = await mountChatAnswer({ declineMode: true, update: () => decline.promise });
  const original = h.runtime.invite;
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.handleDeclineIncomingCall(); });
  await h.rerender({ currentUserId: "replacement-user" });
  await h.act(async () => { decline.resolve({ ...original, status: "declined" }); await operation; });
  assert.equal(h.runtime.clears.length, 0);
  assert.equal(h.runtime.notifications.length, 0);
  assert.equal(h.runtime.loads, 0);
  await h.unmount();
});

test("Decline cleanup targets the exact invite, account and room", async () => {
  const h = await mountChatAnswer({ declineMode: true, update: async ({ invite }) => ({ ...invite, status: "declined" }) });
  await h.act(async () => { await h.runtime.snapshot.handleDeclineIncomingCall(); });
  assert.equal(h.runtime.notifications.length, 2);
  for (const cleanup of h.runtime.notifications) assert.equal(cleanup.exactInviteOnly, true);
  assert.equal(h.runtime.notifications[1].userId, "callee");
  assert.equal(h.runtime.cleanupArgs[0][1], "room");
  assert.equal(h.runtime.cleanupArgs[0][2].sessionGeneration, "session-1");
  await h.unmount();
});

test("late room End invite response cannot clear the replacement call", async () => {
  const ended = deferred();
  const h = await mountChatAnswer({ endedMode: true, update: () => ended.promise });
  await h.rerender({ invite: { ...h.runtime.invite, status: "accepted" } });
  const original = h.runtime.invite;
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.onRoomEnded("remote_end"); });
  await h.rerender({ invite: { ...original, id: "new-call", communicationRoomId: "new-room" } });
  await h.act(async () => { ended.resolve({ ...original, status: "ended" }); await operation; });
  assert.equal(h.runtime.activeWrites?.length ?? 0, 0);
  assert.equal(h.runtime.clears.length, 0);
  assert.equal(h.runtime.panelOpen, undefined);
  await h.unmount();
});

test("late room End thread cleanup cannot close the replacement panel", async () => {
  const cleanup = deferred();
  const h = await mountChatAnswer({ endedMode: true, clearThread: () => cleanup.promise, update: async ({ invite }) => ({ ...invite, status: "ended" }) });
  await h.rerender({ invite: { ...h.runtime.invite, status: "accepted" } });
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.onRoomEnded("remote_end"); });
  assert.equal(h.runtime.clears.length, 1);
  await h.rerender({ invite: { ...h.runtime.invite, id: "new-call", communicationRoomId: "new-room" } });
  await h.act(async () => { cleanup.resolve(); await operation; });
  assert.equal(h.runtime.panelOpen, undefined);
  assert.equal(h.runtime.released?.length ?? 0, 0);
  assert.equal(h.runtime.loads, 0);
  await h.unmount();
});

for (const action of ["end", "decline"]) {
  test(`trusted native ${action} cannot continue cleanup after account replacement`, async () => {
    const response = deferred();
    const invite = { id: "invite", threadId: "thread", communicationRoomId: "room", callerUserId: "caller", calleeUserId: "callee", status: action === "end" ? "accepted" : "ringing", callType: "voice" };
    const h = await mountChatAnswer({ nativeMode: true, nativeAction: action, incomingInvite: null, invite, update: () => response.promise });
    assert.equal(h.runtime.updates.length, 1);
    await h.rerender({ currentUserId: "replacement-user" });
    await h.act(async () => { response.resolve({ ...invite, status: action === "end" ? "ended" : "declined" }); });
    assert.equal(h.runtime.clears.length, 0);
    assert.equal(h.runtime.leaves ?? 0, 0);
    assert.equal(h.runtime.notifications.length, 0);
    assert.equal(h.runtime.activeWrites?.length ?? 0, 0);
    await h.unmount();
  });
}

test("accepted media failure cleanup cannot close the replacement call after its RPC", async () => {
  const cleanup = deferred();
  const h = await mountChatAnswer({ settlementMode: true, clearThread: () => cleanup.promise, descriptor: { inviteId: "invite", roomId: "room", threadId: "thread" } });
  let operation;
  await h.act(async () => { operation = h.runtime.settlement.clearLocal(h.runtime.descriptor); });
  assert.equal(h.runtime.clears.length, 1);
  await h.rerender({ invite: { ...h.runtime.invite, id: "replacement" }, descriptor: { inviteId: "replacement", roomId: "room", threadId: "thread" } });
  await h.act(async () => { cleanup.resolve(); await operation; });
  assert.equal(h.runtime.activeWrites?.length ?? 0, 0);
  assert.equal(h.runtime.panelOpen, undefined);
  assert.equal(h.runtime.loads, 0);
  await h.unmount();
});

test("manual End response cannot leave or close the replacement call", async () => {
  const response = deferred();
  const h = await mountChatAnswer({ joinMode: true, update: () => response.promise });
  await h.rerender({ invite: { ...h.runtime.invite, status: "accepted" } });
  const original = h.runtime.invite;
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.handleJoinOrCloseCall(); });
  await h.rerender({ invite: { ...original, id: "replacement", communicationRoomId: "other-room" } });
  await h.act(async () => { response.resolve({ ...original, status: "ended" }); await operation; });
  assert.equal(h.runtime.leaves ?? 0, 0);
  assert.equal(h.runtime.clears.length, 0);
  assert.equal(h.runtime.activeWrites?.length ?? 0, 0);
  await h.unmount();
});

test("manual join read cannot open a previous account's call", async () => {
  const response = deferred();
  const h = await mountChatAnswer({ joinMode: true, callPanelOpen: false, incomingInvite: null, noActiveInvite: true, readInvite: () => response.promise });
  // Force authoritative lookup rather than a locally hydrated invite.
  await h.rerender({ invite: { ...h.runtime.invite, communicationRoomId: "different-room" } });
  let operation;
  await h.act(async () => { operation = h.runtime.snapshot.handleJoinOrCloseCall("requested"); });
  await h.rerender({ currentUserId: "replacement-user" });
  await h.act(async () => { response.resolve({ ...h.runtime.invite, id: "requested", communicationRoomId: "room", status: "accepted" }); await operation; });
  assert.equal(h.runtime.activeWrites?.length ?? 0, 0);
  assert.equal(h.runtime.panelOpen, undefined);
  await h.unmount();
});

test("invalid incoming expiry schedules immediate reconciliation instead of a fresh 45 seconds", async () => {
  const h = await mountChatAnswer({ timerMode: true });
  await h.rerender({ invite: { ...h.runtime.invite, expiresAt: "invalid" } });
  assert.equal(h.runtime.timeouts.at(-1).delay, 0);
  await h.unmount();
});

test("incoming expiry uses the remaining server deadline, not a new local window", async () => {
  const h = await mountChatAnswer({ timerMode: true });
  await h.rerender({ invite: { ...h.runtime.invite, expiresAt: new Date(Date.now() + 12_000).toISOString() } });
  assert.ok(h.runtime.timeouts.at(-1).delay > 11_000 && h.runtime.timeouts.at(-1).delay <= 12_000);
  await h.unmount();
});

test("rejected missed transition does not clear incoming state or thread authority", async () => {
  const h = await mountChatAnswer({ timerMode: true, update: async () => { throw new Error("rejected"); } });
  await h.act(async () => { await h.runtime.timeouts.at(-1).callback().catch(() => null); });
  assert.equal(h.runtime.clears.length, 0);
  assert.equal(h.runtime.loads, 0);
  await h.unmount();
});

test("late incoming expiry read cannot apply an accepted call to a replacement account", async () => {
  const read = deferred();
  const h = await mountChatAnswer({ timerMode: true, readInvite: () => read.promise });
  let callback;
  await h.act(async () => { callback = h.runtime.timeouts.at(-1).callback(); });
  await h.rerender({ currentUserId: "replacement-user" });
  await h.act(async () => { read.resolve({ ...h.runtime.invite, status: "accepted" }); await callback; });
  assert.equal(h.runtime.accepted.length, 0);
  await h.unmount();
});

test("failed manual audio route can retry the same displayed choice", async () => {
  let attempt = 0;
  const h = await mountChatAnswer({ controlsMode: true, setSpeaker: async () => ++attempt > 1 });
  await h.act(async () => { await h.runtime.snapshot.handleToggleNativeAudioRoute(); });
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, false);
  await h.act(async () => { await h.runtime.snapshot.handleToggleNativeAudioRoute(); });
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, true);
  await h.unmount();
});

test("already-issued old native route is followed by the replacement's current route", async () => {
  const issued = deferred(); let nativeCalls = 0;
  const h = await mountChatAnswer({ controlsMode: true, platform: "ios", setNativeRoute: async () => ++nativeCalls === 1 ? issued.promise : true });
  let old;
  await h.act(async () => { old = h.runtime.snapshot.handleToggleNativeAudioRoute(); });
  assert.equal(h.runtime.routeRequests.at(-1)[1], "speaker");
  await h.rerender({ invite: { ...h.runtime.invite, id: "replacement", status: "accepted" }, callChannelState: "live" });
  await h.act(async () => { issued.resolve(true); await old; });
  await h.flush();
  assert.equal(h.runtime.routeRequests.at(-1)[1], "receiver");
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, false);
  await h.unmount();
});

for (const mode of ["endedMode", "joinMode", "nativeMode"]) {
  test(`current ${mode} completes owned call cleanup normally`, async () => {
    const invite = { id: "invite", threadId: "thread", communicationRoomId: "room", callerUserId: "caller", calleeUserId: "callee", status: "accepted", callType: "voice" };
    const h = await mountChatAnswer({ [mode]: true, invite, update: async () => ({ ...invite, status: "ended" }) });
    if (mode === "endedMode") await h.act(async () => { await h.runtime.snapshot.onRoomEnded("remote_end"); });
    if (mode === "joinMode") await h.act(async () => { await h.runtime.snapshot.handleJoinOrCloseCall(); });
    await h.flush();
    assert.equal(h.runtime.panelOpen, false);
    assert.equal(h.runtime.cleanupArgs[0][1], "room");
    assert.equal(h.runtime.cleanupArgs[0][2].sessionGeneration, "session-1");
    assert.equal(h.runtime.loads, 1);
    await h.unmount();
  });
}


test("saved microphone control cannot mutate a replacement call", async () => {
  const h = await mountChatAnswer({ micMode: true });
  const oldToggle = h.runtime.snapshot.handleToggleCallMic;
  await h.rerender({ invite: { ...h.runtime.invite, id: "replacement" } });
  await h.act(async () => { await oldToggle(); });
  assert.equal(h.runtime.mediaMutations.length, 0);
  await h.unmount();
});

test("native End keeps failed cleanup open for manual retry", async () => {
  const invite = { id: "invite", threadId: "thread", communicationRoomId: "room", callerUserId: "caller", calleeUserId: "callee", status: "accepted", callType: "voice" };
  const h = await mountChatAnswer({ nativeMode: true, invite, update: async () => ({ ...invite, status: "ended" }), leaveRoom: async () => { throw Error("cleanup pending"); } });
  assert.notEqual(h.runtime.panelOpen, false);
  assert.equal(h.runtime.clears.length, 0);
  assert.ok(h.runtime.errors.some(Boolean));
  await h.unmount();
});

test("ended invite retains End control while disabling media controls", async () => {
  const h = await mountChatAnswer({ joinMode: true });
  await h.rerender({ invite: { ...h.runtime.invite, status: "ended" } });
  assert.equal(h.runtime.snapshot.showControls, true);
  assert.equal(h.runtime.snapshot.showMediaControls, false);
  assert.equal(h.runtime.snapshot.resolvedCallRoomId, "room");
  await h.unmount();
});

for (const mode of ["active", "outgoing"]) {
  test(`${mode} terminal reconciliation retains failed cleanup and retries End`, async () => {
    let leaves = 0;
    const invite = { id: "invite", threadId: "thread", communicationRoomId: "room", callerUserId: "caller", calleeUserId: "callee", status: mode === "active" ? "accepted" : "ringing", callType: "voice" };
    const terminal = { ...invite, status: "ended" };
    const h = await mountChatAnswer({ terminalMode: mode, invite, readInvite: async () => terminal, leaveRoom: async () => { if (++leaves === 1) throw Error("cleanup pending"); } });
    assert.notEqual(h.runtime.panelOpen, false);
    assert.equal(h.runtime.clears.length, 0);
    assert.ok(h.runtime.errors.some(Boolean));
    await h.rerender({ invite: terminal });
    await h.act(async () => { await h.runtime.snapshot.handleJoinOrCloseCall(); });
    assert.equal(h.runtime.panelOpen, false);
    assert.equal(leaves, 2);
    assert.equal(h.runtime.cleanupArgs[0][1], "room");
    await h.unmount();
  });
}


test("thread refresh preserves an ended call's cleanup retry surface after server projection clears", async () => {
  const invite = { id: "invite", threadId: "thread", communicationRoomId: "room", callerUserId: "caller", calleeUserId: "callee", status: "ended", callType: "voice" };
  const h = await mountChatAnswer({ readMode: true, activeReadInvite: true, invite, readThread: async () => ({ threadId: "thread", activeCommunicationRoomId: null }) });
  await h.act(async () => { await h.runtime.snapshot.loadThreadState(); });
  assert.equal(h.runtime.panelOpen, true);
  assert.equal(h.runtime.clears.length, 0);
  assert.equal(h.runtime.activeWrites?.length ?? 0, 0);
  await h.unmount();
});

for (const mode of ["active", "outgoing"]) {
  test(`${mode} terminal cleanup cannot close a replacement account after pending leave`, async () => {
    const leave = deferred();
    const invite = { id: "invite", threadId: "thread", communicationRoomId: "room", callerUserId: "caller", calleeUserId: "callee", status: mode === "active" ? "accepted" : "ringing", callType: "voice" };
    const h = await mountChatAnswer({ terminalMode: mode, invite, readInvite: async () => ({ ...invite, status: "ended" }), leaveRoom: () => leave.promise });
    assert.equal(h.runtime.leaves, 1);
    await h.rerender({ currentUserId: "replacement-user" });
    await h.act(async () => { leave.resolve(); });
    assert.equal(h.runtime.clears.length, 0);
    assert.notEqual(h.runtime.panelOpen, false);
    await h.unmount();
  });
}


test("room End preserves retry when owned media cleanup rejects", async () => {
  const invite = { id: "invite", threadId: "thread", communicationRoomId: "room", callerUserId: "caller", calleeUserId: "callee", status: "accepted", callType: "voice" };
  const h = await mountChatAnswer({ endedMode: true, invite, update: async () => ({ ...invite, status: "ended" }), leaveRoom: async () => { throw Error("stop failed"); } });
  await h.act(async () => { await h.runtime.snapshot.onRoomEnded("ended"); });
  assert.equal(h.runtime.leaves, 1);
  assert.equal(h.runtime.panelOpen, true);
  assert.equal(h.runtime.clears.length, 0);
  await h.unmount();
});

test("room End with unconfirmed invite still stops local media and preserves retry", async () => {
  const invite = { id: "invite", threadId: "thread", communicationRoomId: "room", callerUserId: "caller", calleeUserId: "callee", status: "accepted", callType: "voice" };
  const h = await mountChatAnswer({ endedMode: true, invite, update: async () => null });
  await h.act(async () => { await h.runtime.snapshot.onRoomEnded("ended"); });
  assert.equal(h.runtime.leaves, 1);
  assert.equal(h.runtime.panelOpen, true);
  assert.equal(h.runtime.clears.length, 0);
  await h.unmount();
});

test("room End retains retry if native call cleanup is not confirmed", async () => {
  const invite = { id: "invite", threadId: "thread", communicationRoomId: "room", callerUserId: "caller", calleeUserId: "callee", status: "accepted", callType: "voice" };
  const h = await mountChatAnswer({ endedMode: true, invite, requestedNativeCallUuid: "uuid", nativeEndResult: false, update: async () => ({ ...invite, status: "ended" }) });
  await h.act(async () => { await h.runtime.snapshot.onRoomEnded("ended"); });
  assert.equal(h.runtime.panelOpen, true);
  assert.equal(h.runtime.clears.length, 0);
  await h.unmount();
});

test("dismissed terminal cleanup surface can be reopened without starting a fresh call", async () => {
  const h = await mountChatAnswer({ joinMode: true, callPanelOpen: false });
  await h.rerender({ invite: { ...h.runtime.invite, status: "ended" } });
  await h.act(async () => { await h.runtime.snapshot.handleJoinOrCloseCall(); });
  assert.equal(h.runtime.panelOpen, true);
  assert.equal(h.runtime.leaves ?? 0, 0);
  assert.equal(h.runtime.updates.length, 0);
  await h.unmount();
});


test("manual End cannot claim success while native cleanup still fails", async () => {
  const h = await mountChatAnswer({ joinMode: true, requestedNativeCallUuid: "uuid", nativeEndResult: false });
  await h.rerender({ invite: { ...h.runtime.invite, status: "ended" } });
  await h.act(async () => { await h.runtime.snapshot.handleJoinOrCloseCall(); });
  assert.notEqual(h.runtime.panelOpen, false);
  assert.equal(h.runtime.clears.length, 0);
  assert.ok(h.runtime.errors.some(Boolean));
  await h.unmount();
});
