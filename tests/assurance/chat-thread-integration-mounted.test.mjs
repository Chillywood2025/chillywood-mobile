import assert from "node:assert/strict";
import test from "node:test";
import { createDurableChatThreadFixture, mountFullChatThread } from "./helpers/chat-thread-full-mounted-harness.mjs";
import { mountIosRoot, nativeIds as rootNativeIds, makeNativeEvent } from "./helpers/ios-root-thread-handoff-harness.mjs";
import { androidAction, androidIds, mountAndroidRoot } from "./helpers/android-root-thread-handoff-harness.mjs";
import * as nativeProvenance from "../../_lib/nativeCallTransitionProvenance.mjs";

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

test("full iPhone foreground reconciliation preserves an already live microphone without a native mute feedback loop", async () => {
  const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
    invite: { id: nativeIds.inviteId, callType: "video" }, nativeAnswer: { callUuid: nativeIds.callUuid } });
  let observe = true;
  try {
    await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
    await h.run(() => {
      const peer = h.runtime.media.peers[0];
      peer.connectionState = "connected";
      peer.emit("connectionstatechange");
    });
    const stream = h.runtime.media.localStreams[0];
    const audio = stream.getAudioTracks()[0];
    const video = stream.getVideoTracks()[0];
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(audio), "enabled");
    const transitions = [];
    Object.defineProperty(audio, "enabled", {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(value) {
        const before = descriptor.get.call(this);
        descriptor.set.call(this, value);
        if (!observe || before === descriptor.get.call(this)) return;
        transitions.push(value);
        // Controlled OS scheduling counterexample: deliver the observed
        // native Mute/Unmute shapes after actual media transitions. This is
        // not a claim that track.enabled always makes CallKit emit feedback.
        // Bound the modeled loop so its counterexample remains finite.
        if (transitions.length <= 12) queueMicrotask(() => {
          if (observe) h.emitNativeEvent({ type: value ? "unmuted" : "muted", callUuid: nativeIds.callUuid });
        });
      },
    });
    await h.nativeEvent({ type: "applicationActive", callUuid: nativeIds.callUuid });
    await h.flush();
    assert.deepEqual([...transitions], [], "reconciling a live microphone must not insert an Off/On pulse");
    assert.equal(h.runtime.snapshot.micEnabled, true);
    assert.equal(h.runtime.media.durableMic, true);
    assert.equal(audio.enabled, true);
    assert.equal(video.enabled, true);
    assert.equal(h.runtime.media.localStreams.length, 1, "same-session reconciliation must retain its capture");
    await h.nativeEvent({ type: "muted", callUuid: nativeIds.callUuid });
    assert.equal(audio.enabled, false, "a real system Mute remains authoritative after reconciliation");
    assert.equal(h.runtime.snapshot.micEnabled, false);
    assert.equal(h.runtime.media.durableMic, false);
  } finally { observe = false; await h.unmount(); }
});

for (const interruption of ["system Mute", "End", "account replacement"]) {
  test(`full iPhone pending On reconciliation cannot override ${interruption}`, async () => {
    const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
      invite: { id: nativeIds.inviteId, callType: "video" }, nativeAnswer: { callUuid: nativeIds.callUuid } });
    let release;
    try {
      await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
      await h.run(() => {
        const peer = h.runtime.media.peers[0];
        peer.connectionState = "connected";
        peer.emit("connectionstatechange");
      });
      const audio = h.runtime.media.localStreams[0].getAudioTracks()[0];
      const writesBefore = h.runtime.media.membershipTouches.length;
      h.runtime.media.queueMembership({ wait: new Promise(resolve => { release = resolve; }) });
      await h.nativeEvent({ type: "applicationActive", callUuid: nativeIds.callUuid });
      assert.equal(h.runtime.media.membershipTouches.length, writesBefore + 1,
        "the current reconciliation is awaiting its own durable receipt");
      assert.equal(audio.enabled, true, "pending On reconciliation retains the committed microphone");
      if (interruption === "system Mute") {
        await h.nativeEvent({ type: "muted", callUuid: nativeIds.callUuid });
      } else if (interruption === "End") {
        await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
      } else {
        const userId = "10000000-0000-4000-8000-000000000009";
        h.runtime.media.userId = userId;
        h.runtime.media.admissionPrepareActions.push({ outcome: "reject", message: "communication_chat_call_authority_required" });
        await h.rerender({ userId, sessionGeneration: "session-2" });
      }
      assert.equal(audio.enabled, false, "privacy stop precedes settlement of the older On write");
      await h.run(() => release());
      assert.equal(audio.enabled, false, "the old durable continuation cannot re-enable capture");
      if (interruption === "system Mute") {
        assert.equal(h.runtime.snapshot.micEnabled, false);
        assert.equal(h.runtime.media.durableMic, false);
      } else {
        assert.equal(audio.readyState, "ended");
        assert.equal(h.runtime.media.localStreams.some(stream => stream.getAudioTracks().some(track => track.enabled && track.readyState === "live")), false);
      }
    } finally { release?.(); await h.unmount(); }
  });
}

for (const failure of ["durable", "broadcast"]) {
  test(`full iPhone failed ${failure} On reconciliation stops once without a rollback Unmute pulse`, async () => {
    const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
      invite: { id: nativeIds.inviteId, callType: "video" }, nativeAnswer: { callUuid: nativeIds.callUuid } });
    try {
      await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
      await h.run(() => {
        const peer = h.runtime.media.peers[0];
        peer.connectionState = "connected";
        peer.emit("connectionstatechange");
      });
      const audio = h.runtime.media.localStreams[0].getAudioTracks()[0];
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(audio), "enabled");
      const transitions = [];
      Object.defineProperty(audio, "enabled", {
        configurable: true,
        get() { return descriptor.get.call(this); },
        set(value) {
          const before = descriptor.get.call(this);
          descriptor.set.call(this, value);
          if (before !== descriptor.get.call(this)) transitions.push(value);
        },
      });
      if (failure === "durable") h.runtime.media.queueMembership({ outcome: "reject" });
      else h.runtime.media.queueSend({ event: "media:update", outcome: "error" });
      await h.nativeEvent({ type: "applicationActive", callUuid: nativeIds.callUuid });
      assert.deepEqual([...transitions], [false],
        "a fail-closed transaction must not generate an intermediate native Unmute during rollback");
      assert.equal(audio.enabled, false);
      assert.equal(h.runtime.snapshot.micEnabled, false);
      assert.equal(h.runtime.media.durableMic, false);
      await h.nativeEvent({ type: "muted", callUuid: nativeIds.callUuid });
      assert.equal(audio.enabled, false, "the delayed actual Mute receipt cannot create another state change");
      await h.nativeEvent({ type: "unmuted", callUuid: nativeIds.callUuid });
      assert.equal(audio.enabled, true, "a later genuine Unmute remains available after failure settled");
    } finally { await h.unmount(); }
  });
}

test("actual iOS facade acknowledges native Mute requests and foreground reconciliation preserves their committed On state", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  await root.event(makeNativeEvent("incoming"));
  await root.event(makeNativeEvent("answerRequested"));
  const destination = new URL(root.routes[0], "https://test.invalid");
  const h = await mountFullChatThread({ userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session,
    invite: { id: rootNativeIds.invite, callType: "video" },
    routeParams: Object.fromEntries(destination.searchParams), nativeFacade: root.facade });
  t.after(() => h.unmount());
  await h.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  await h.run(() => {
    const peer = h.runtime.media.peers[0];
    peer.connectionState = "connected";
    peer.emit("connectionstatechange");
  });
  root.setStage("os-setMuted", (uuid, muted) => {
    // The OS boundary is controlled. Receipt delivery then passes through
    // the production facade, root bridge and mounted screen subscriber.
    root.emitWithoutWaiting(makeNativeEvent(muted ? "muted" : "unmuted", { callUuid: uuid }));
  });
  const audio = h.runtime.media.localStreams[0].getAudioTracks()[0];
  await h.run(() => h.runtime.snapshot.handleToggleCallMic());
  assert.equal(audio.enabled, false);
  await h.run(() => h.runtime.snapshot.handleToggleCallMic());
  assert.equal(audio.enabled, true);
  assert.deepEqual(Array.from(root.nativeSteps).filter(step => step.name === "setMuted").map(step => [step.uuid, step.muted]),
    [[rootNativeIds.uuid, true], [rootNativeIds.uuid, false]], "UI controls use the real native synchronization facade exactly once each");
  assert.equal(h.runtime.snapshot.callControlError, null);
  const transitions = [];
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(audio), "enabled");
  Object.defineProperty(audio, "enabled", {
    configurable: true,
    get() { return descriptor.get.call(this); },
    set(value) {
      const before = descriptor.get.call(this);
      descriptor.set.call(this, value);
      if (before !== descriptor.get.call(this)) transitions.push(value);
    },
  });
  await h.run(() => root.event(makeNativeEvent("applicationActive")));
  assert.deepEqual([...transitions], [], "recovery through the real facade cannot insert another microphone Off/On pulse");
  assert.equal(h.runtime.snapshot.micEnabled, true);
  assert.equal(h.runtime.media.durableMic, true);
  assert.equal(root.nativeSteps.filter(step => step.name === "setMuted").length, 2);
  await h.run(() => root.event(makeNativeEvent("muted")));
  assert.equal(audio.enabled, false, "an independent native Mute still reaches actual media control");
  assert.equal(h.runtime.media.durableMic, false);
});

for (const [callType, elapsed, duplicateTap] of [
  ...["voice", "video"].flatMap(kind => [0, 11_000].map(delay => [kind, delay, false])),
  ["video", 0, true],
]) {
  test(`full iPhone ${callType} Unmute is not reversed by CallKit feedback during its durable commit after ${elapsed}ms${duplicateTap ? " with a duplicate local tap" : ""}`, async () => {
    const nativeMuteRequests = [];
    let now = Date.now();
    class ScreenDate extends Date { static now() { return now; } }
    const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
      screenDate: ScreenDate,
      invite: { id: nativeIds.inviteId, callType }, nativeAnswer: { callUuid: nativeIds.callUuid },
      nativeFacade: { setIosNativeCallMuted: async (callUuid, muted) => {
        nativeMuteRequests.push({ callUuid, muted });
        return true;
      } } });
    let release;
    try {
      await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
      await h.run(() => {
        const peer = h.runtime.media.peers[0];
        peer.connectionState = "connected";
        peer.emit("connectionstatechange");
      });
      assert.equal(h.runtime.snapshot.callChannelState, "live");
      const stream = h.runtime.media.localStreams[0];
      const audio = stream.getAudioTracks()[0];
      const video = stream.getVideoTracks()[0];
      await h.run(() => h.runtime.snapshot.handleToggleCallMic());
      await h.nativeEvent({ type: "muted", callUuid: nativeIds.callUuid });
      assert.equal(h.runtime.snapshot.micEnabled, false);
      const transitions = [];
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(audio), "enabled");
      Object.defineProperty(audio, "enabled", {
        get() { return descriptor.get.call(this); },
        set(value) {
          const before = descriptor.get.call(this);
          descriptor.set.call(this, value);
          if (before !== descriptor.get.call(this)) transitions.push(value);
        },
      });
      const wait = new Promise(resolve => { release = resolve; });
      h.runtime.media.queueMembership({ wait });
      let unmute;
      await h.run(() => { unmute = h.runtime.snapshot.handleToggleCallMic(); });
      assert.equal(audio.enabled, true, "actual hook reaches track enable before the held durable receipt");
      assert.equal(h.runtime.snapshot.micEnabled, false, "the uncommitted media mutation has not claimed success");
      now += elapsed;
      // A real CallKit bottom-up unmute can precede the app's explicit
      // CXSetMutedCallAction. It must acknowledge this transaction, not create
      // a competing intent that rolls the newly enabled microphone back.
      await h.nativeEvent({ type: "unmuted", callUuid: nativeIds.callUuid });
      await h.nativeEvent({ type: "unmuted", callUuid: nativeIds.callUuid });
      let duplicate;
      if (duplicateTap) await h.run(() => { duplicate = h.runtime.snapshot.handleToggleCallMic(); });
      await h.run(async () => { release(); await unmute; await duplicate; });
      assert.deepEqual([...transitions], [true], "early native feedback must not generate a second native Mute");
      assert.equal(h.runtime.snapshot.micEnabled, true);
      assert.equal(h.runtime.snapshot.callControlError, null);
      assert.equal(h.runtime.media.errors.some(error => error.message === "LEGACY_MIC_DURABLE_COMMIT_FAILED"), false);
      assert.deepEqual(nativeMuteRequests.map(request => request.muted), [true, false]);
      await h.nativeEvent({ type: "unmuted", callUuid: nativeIds.callUuid });
      assert.deepEqual([...transitions], [true], "the later explicit CallKit acknowledgement is also consume-once");
      if (video) {
        assert.equal(video.enabled, true);
        assert.equal(video.readyState, "live");
        assert.equal(stream.getVideoTracks()[0], video, "microphone feedback cannot replace retained video");
      }
    } finally { release?.(); await h.unmount(); }
  });
}

for (const interruption of ["system-mute", "system-mute-with-old-ack", "system-mute-then-unmute", "commit-failure"]) {
  test(`full iPhone pending Unmute reservation preserves ${interruption} and releases for a later system control`, async () => {
    const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
      invite: { id: nativeIds.inviteId, callType: "video" }, nativeAnswer: { callUuid: nativeIds.callUuid } });
    let release;
    try {
      await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
      await h.run(() => {
        const peer = h.runtime.media.peers[0];
        peer.connectionState = "connected";
        peer.emit("connectionstatechange");
      });
      const stream = h.runtime.media.localStreams[0];
      const audio = stream.getAudioTracks()[0];
      const video = stream.getVideoTracks()[0];
      await h.run(() => h.runtime.snapshot.handleToggleCallMic());
      if (interruption !== "system-mute-with-old-ack") {
        await h.nativeEvent({ type: "muted", callUuid: nativeIds.callUuid });
      }
      const wait = new Promise(resolve => { release = resolve; });
      h.runtime.media.queueMembership({ wait, outcome: interruption === "commit-failure" ? "reject" : "success" });
      let unmute;
      await h.run(() => { unmute = h.runtime.snapshot.handleToggleCallMic(); });
      assert.equal(audio.enabled, true);
      await h.nativeEvent({ type: "unmuted", callUuid: nativeIds.callUuid });
      if (interruption.startsWith("system-mute")) {
        await h.nativeEvent({ type: "muted", callUuid: nativeIds.callUuid });
        assert.equal(audio.enabled, false, "an opposite system Mute wins before the old durable write settles");
      }
      if (interruption === "system-mute-then-unmute") {
        await h.nativeEvent({ type: "unmuted", callUuid: nativeIds.callUuid });
      }
      await h.run(async () => { release(); await unmute; });
      const systemChangedBack = interruption === "system-mute-then-unmute";
      assert.equal(h.runtime.snapshot.micEnabled, systemChangedBack);
      assert.equal(audio.enabled, systemChangedBack);
      assert.equal(h.runtime.media.durableMic, systemChangedBack);
      assert.equal(video.enabled, true);
      if (!systemChangedBack) {
        const writesAfterFailure = h.runtime.media.membershipTouches.length;
        await h.nativeEvent({ type: "unmuted", callUuid: nativeIds.callUuid });
        assert.equal(h.runtime.snapshot.micEnabled, true, "a settled failure cannot retain a suppression reservation");
        assert.equal(audio.enabled, true);
        assert.ok(h.runtime.media.membershipTouches.length > writesAfterFailure);
        await h.nativeEvent({ type: "muted", callUuid: nativeIds.callUuid });
        assert.equal(audio.enabled, false, "an old local Mute receipt cannot swallow a later genuine system Mute");
      }
    } finally { release?.(); await h.unmount(); }
  });
}

for (const scenario of ["no feedback", "matching feedback", "queued retirement", "opposite system control", "settled system mute", "End", "account replacement"]) {
test(`full iPhone background retirement preserves microphone ownership through ${scenario}`, async () => {
  let elapsed = 0;
  const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
    screenPerformance: { now: () => performance.now() + elapsed },
    invite: { id: nativeIds.inviteId, callType: "video" }, nativeAnswer: { callUuid: nativeIds.callUuid } });
  let release;
  let cameraOperation;
  try {
    const media = h.runtime.media;
    const live = kind => media.localStreams.flatMap(stream => stream.getTracks())
      .filter(track => track.kind === kind && track.readyState === "live" && track.enabled);
    await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
    await h.run(() => {
      const peer = media.peers[0];
      peer.connectionState = "connected";
      peer.emit("connectionstatechange");
    });
    assert.equal(h.runtime.snapshot.callChannelState, "live");
    assert.equal(live("audio").length, 1);
    assert.equal(live("video").length, 1);
    // Expire the actual consumed native transition claim through its clock
    // boundary. The accepted session remains current, but no longer has the
    // short-lived background-audio transition authority. Do not replace refs
    // or bypass the screen's production restartDisconnectedSession setting.
    elapsed = 31_000;
    await h.rerender({});
    const wait = new Promise(resolve => { release = resolve; });
    const writesBefore = media.membershipTouches.length;
    media.queueMembership({ wait });
    if (scenario === "queued retirement") {
      await h.run(() => { cameraOperation = h.runtime.snapshot.handleToggleCallCamera(); });
      assert.equal(media.membershipTouches.length, writesBefore + 1, "Camera Off owns the held durable write");
    }
    await h.run(() => media.emitAppState("background"));
    assert.equal(h.runtime.snapshot.callChannelState, "reconnecting");
    assert.equal(live("audio").length, scenario === "queued retirement" ? 1 : 0,
      "queued retirement has not touched audio; executing retirement already blocks it");
    assert.equal(live("video").length, 0);
    if (scenario === "queued retirement") {
      assert.equal(media.membershipTouches.length, writesBefore + 1, "automatic Mute still waits behind Camera Off's durable write");
    } else {
      assert.ok(media.membershipTouches.length > writesBefore, "background retirement reached the held durable write");
    }
    if (scenario !== "no feedback") {
      await h.nativeEvent({ type: "muted", callUuid: nativeIds.callUuid });
    }
    if (scenario === "queued retirement") {
      assert.equal(live("audio").length, 0, "genuine system Mute cannot acknowledge an automatic command that has not started");
    }
    if (scenario === "opposite system control") {
      // The opposite system action is a new user intent. Its subsequent Mute
      // must remain authoritative, rather than looking like retirement feedback.
      await h.nativeEvent({ type: "unmuted", callUuid: nativeIds.callUuid });
      await h.nativeEvent({ type: "muted", callUuid: nativeIds.callUuid });
    }
    await h.run(async () => { release(); await cameraOperation; });
    assert.equal(live("audio").length, 0, "retained intent cannot capture while backgrounded");
    if (scenario === "settled system mute") {
      await h.nativeEvent({ type: "muted", callUuid: nativeIds.callUuid });
    }
    if (scenario === "End") await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    if (scenario === "account replacement") {
      const userId = "10000000-0000-4000-8000-000000000009";
      media.userId = userId; // Authenticated API fixture, not a media-hook ref.
      // The replacement identity is not a participant in this accepted call.
      media.admissionPrepareActions.push({ outcome: "reject", message: "communication_chat_call_authority_required" });
      await h.rerender({ userId, sessionGeneration: "session-2" });
    }
    const capturesBeforeForeground = media.mediaCreateCalls.length;
    const timerStart = media.timeoutCallbacks.length;
    await h.run(() => media.emitAppState("active"));
    for (let index = timerStart; index < media.timeoutCallbacks.length; index += 1) {
      if (media.timeoutDelays[index] === 0 && media.timeoutCallbacks[index]) {
        const callback = media.timeoutCallbacks[index];
        media.timeoutCallbacks[index] = null;
        await h.run(callback);
      }
    }
    await h.flush();
    if (scenario === "End" || scenario === "account replacement") {
      assert.equal(media.mediaCreateCalls.length, capturesBeforeForeground, "retired ownership cannot resume capture");
      assert.equal(live("audio").length, 0);
      assert.equal(live("video").length, 0);
    } else {
      const recoverMic = !["queued retirement", "opposite system control", "settled system mute"].includes(scenario);
      assert.equal(media.joinCalls.length, 2, "foreground recovery obtains a fresh authorized admission");
      assert.equal(live("video").length, scenario === "queued retirement" ? 0 : 1);
      assert.equal(live("audio").length, recoverMic ? 1 : 0,
        "retirement feedback preserves user-on intent; a subsequent system Mute cancels it");
      assert.equal(h.runtime.snapshot.micEnabled, recoverMic);
      assert.equal(media.durableMic, recoverMic);
    }
  } finally { release?.(); await h.unmount(); }
});
}

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

for (const callType of ["voice", "video"]) {
  test(`full iPhone ${callType} native audio wait survives route claim expiry until current activation`, async () => {
    let elapsed = 0;
    const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
      screenPerformance: { now: () => performance.now() + elapsed },
      invite: { id: nativeIds.inviteId, callType }, nativeAnswer: { callUuid: nativeIds.callUuid } });
    try {
      assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
      assert.deepEqual(h.runtime.nativeCompletions, [{ uuid: nativeIds.callUuid, connected: true }]);
      assert.equal(h.runtime.media.joinCalls.length, 0);
      assert.equal(h.runtime.media.localStreams.length, 0);
      // Expire the real consumed navigation claim through its clock boundary.
      // Server acceptance and elapsed time do not manufacture didActivate.
      elapsed = 31_000;
      await h.rerender({});
      assert.equal(h.runtime.media.joinCalls.length, 0, "expired routing authority cannot unlock native audio");
      assert.equal(h.runtime.media.localStreams.length, 0, "no capture without actual audio readiness");
      await h.nativeEvent({ type: "audioSessionActivated", callUuid: "10000000-0000-4000-8000-000000000006" });
      assert.equal(h.runtime.media.localStreams.length, 0, "another native call cannot release the wait");
      await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
      assert.equal(h.runtime.media.joinCalls.length, 1);
      assert.equal(h.runtime.media.localStreams.length, 1);
      assert.equal(h.runtime.media.localStreams[0].getAudioTracks().length, 1);
      assert.equal(h.runtime.media.localStreams[0].getVideoTracks().length, callType === "video" ? 1 : 0);
      await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
      assert.equal(h.runtime.media.localStreams.length, 1, "duplicate readiness cannot repeat capture");
    } finally { await h.unmount(); }
  });
}

for (const retirement of ["End", "account replacement", "call replacement"]) {
  test(`full iPhone native audio wait ignores retired activation after ${retirement}`, async () => {
    let elapsed = 0;
    const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
      screenPerformance: { now: () => performance.now() + elapsed },
      invite: { id: nativeIds.inviteId }, nativeAnswer: { callUuid: nativeIds.callUuid } });
    try {
      elapsed = retirement === "call replacement" ? 0 : 31_000;
      await h.rerender({});
      assert.equal(h.runtime.media.localStreams.length, 0, "claim expiry must leave the accepted call waiting");
      if (retirement === "account replacement") {
        // The replacement account's server snapshot has no call. Do not give
        // the generic media fixture fictitious admission to the retired room.
        h.runtime.invite = null;
        h.runtime.thread.activeCommunicationRoomId = null;
        h.runtime.thread.activeCallType = null;
        h.runtime.media.userId = "10000000-0000-4000-8000-000000000007";
        h.runtime.media.admissionPrepareActions.push({ outcome: "reject", message: "communication_chat_call_authority_required" });
        await h.rerender({ userId: h.runtime.media.userId, sessionGeneration: "session-2" });
      } else {
        await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
        assert.equal(h.runtime.snapshot.callPanelOpen, false);
      }
      if (retirement === "call replacement") {
        // Deliver another real root-issued Answer route on the same screen.
        // The expired claim for the previous call must not own this new wait.
        const nextUuid = "10000000-0000-4000-8000-000000000008";
        const nextInvite = "10000000-0000-4000-8000-000000000009";
        h.runtime.invite = { ...h.runtime.invite, id: nextInvite, status: "ringing",
          communicationRoomId: "ROOM-REPLACEMENT", expiresAt: new Date(Date.now() + 90_000).toISOString() };
        h.runtime.thread.activeCommunicationRoomId = "ROOM-REPLACEMENT";
        h.runtime.thread.activeCallType = "video";
        h.runtime.roomId = h.runtime.media.roomId = "ROOM-REPLACEMENT";
        let params;
        const route = nativeProvenance.createIosCallKitAnswerRouteHandler({
          getAuthenticatedUserId: () => nativeIds.userId, isActive: () => true,
          completeAnswerFailure: async () => { throw Error("replacement route was not attested"); },
          replace: destination => { params = { threadId: nativeIds.threadId,
            ...Object.fromEntries(new URL(destination, "https://fixture.invalid").searchParams) }; },
        });
        assert.equal(await route({ type: "answerrequested", platform: "ios", callType: "video",
          callInviteId: nextInvite, threadId: nativeIds.threadId, callUuid: nextUuid, nativeEventGeneration: 1 }), "routed");
        await h.rerender({ params });
        assert.equal(h.runtime.snapshot.activeCallInvite.id, nextInvite);
        assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
        elapsed = 31_000;
        await h.rerender({});
        assert.equal(h.runtime.media.localStreams.length, 0, "replacement retains its own readiness wait after claim expiry");
        await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
        assert.equal(h.runtime.media.localStreams.length, 0, "old UUID cannot release replacement audio wait");
        await h.nativeEvent({ type: "audioSessionActivated", callUuid: nextUuid });
        assert.equal(h.runtime.media.joinCalls.length, 1);
        assert.equal(h.runtime.media.joinCalls[0].roomId, "ROOM-REPLACEMENT");
        assert.equal(h.runtime.media.localStreams.length, 1);
      } else {
        await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
        assert.equal(h.runtime.media.joinCalls.length, 0);
        assert.equal(h.runtime.media.localStreams.length, 0, "late activation cannot revive retired capture");
      }
    } finally { await h.unmount(); }
  });
}

const currentNativeAudioDeadline = h => {
  // Initial acceptance may render more than once. Its retained 15s deadline
  // reschedules the remaining interval; other screen timers are <=5s or ~90s.
  const timers = h.runtime.timers.filter(timer => !timer.canceled && timer.delay > 14_000 && timer.delay <= 15_001);
  assert.equal(timers.length, 1, `one accepted native session owns the bounded audio readiness timer; active delays: ${h.runtime.timers.filter(timer => !timer.canceled).map(timer => timer.delay).join(",")}`);
  return timers[0];
};
const runNativeAudioDeadline = async (h, timer = currentNativeAudioDeadline(h)) => {
  // Run a controlled callback; this is not elapsed wall time or an OS deadline.
  await h.run(() => { timer.canceled = true; void timer.fn(); });
  // The production terminal coordinator has bounded 200ms retry boundaries.
  // Release only those boundaries, without advancing unrelated call timers.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const delay = h.runtime.timers.find(candidate => !candidate.canceled && candidate.delay === 200);
    if (!delay) break;
    await h.fireTimer(delay);
  }
  await h.flush();
};

for (const callType of ["voice", "video"]) {
  test(`full iPhone ${callType} native audio deadline ends only the accepted call without capture`, async () => {
    const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
      invite: { id: nativeIds.inviteId, callType }, nativeAnswer: { callUuid: nativeIds.callUuid } });
    try {
      assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
      assert.equal(h.runtime.snapshot.callPanelOpen, true);
      assert.equal(h.runtime.snapshot.panelBindings.showControls, true, "End is reachable while waiting for native audio");
      assert.equal(h.runtime.media.localStreams.length, 0);
      await runNativeAudioDeadline(h);
      assert.equal(h.runtime.invite.status, "ended", "timeout needs an authoritative terminal server transition");
      assert.deepEqual(h.runtime.transitions.map(({ id, status }) => ({ id, status })), [
        { id: nativeIds.inviteId, status: "accepted" }, { id: nativeIds.inviteId, status: "ended" },
      ]);
      assert.ok(h.runtime.nativeEnds.some(([uuid]) => uuid === nativeIds.callUuid));
      assert.ok(h.runtime.clears.length > 0, "terminal settlement clears the exact thread projection");
      assert.ok(h.runtime.clears.every(([threadId, roomId]) => threadId === nativeIds.threadId && roomId === "ROOM-LEGACY"));
      assert.equal(h.runtime.snapshot.activeCallInvite, null);
      assert.equal(h.runtime.snapshot.callPanelOpen, false);
      assert.equal(h.runtime.media.joinCalls.length, 0);
      assert.equal(h.runtime.media.localStreams.length, 0);
      await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
      assert.equal(h.runtime.media.localStreams.length, 0, "late readiness cannot revive a safely closed call");
    } finally { await h.unmount(); }
  });
}

test("full iPhone native audio deadline is canceled by current activation just before its callback", async () => {
  let elapsed = 0;
  const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
    screenPerformance: { now: () => performance.now() + elapsed },
    invite: { id: nativeIds.inviteId }, nativeAnswer: { callUuid: nativeIds.callUuid } });
  try {
    const deadline = currentNativeAudioDeadline(h);
    elapsed = 14_999;
    await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
    assert.equal(deadline.canceled, true);
    assert.equal(h.runtime.media.localStreams.length, 1);
    await runNativeAudioDeadline(h, deadline);
    assert.equal(h.runtime.invite.status, "accepted", "an already queued canceled callback cannot terminate a ready call");
    assert.equal(h.runtime.nativeEnds.length, 0);
    assert.deepEqual(h.runtime.transitions.map(({ status }) => status), ["accepted"]);
    assert.equal(h.runtime.media.localStreams.length, 1);
  } finally { await h.unmount(); }
});

test("full iPhone native audio deadline keeps its remaining interval across an access-token refresh render", async () => {
  let elapsed = 0;
  const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
    screenPerformance: { now: () => performance.now() + elapsed },
    invite: { id: nativeIds.inviteId }, nativeAnswer: { callUuid: nativeIds.callUuid } });
  try {
    const original = currentNativeAudioDeadline(h);
    elapsed = 5_000;
    // A token refresh changes actual cleanup callback ownership without
    // replacing the account, native accepted descriptor, or call identity.
    await h.rerender({ accessToken: "refreshed-test-token" });
    assert.equal(original.canceled, true);
    const remaining = h.runtime.timers.filter(timer => !timer.canceled && timer.delay > 9_000 && timer.delay <= 10_001);
    assert.equal(remaining.length, 1, "the rerender schedules only the original deadline's remaining interval");
    // The independent incoming-presentation expiry timer can legitimately
    // remain scheduled later. Reject a renewed audio wait in its own window.
    assert.equal(h.runtime.timers.some(timer => !timer.canceled && timer.delay > 14_000 && timer.delay <= 15_001), false,
      "an incidental render must not grant a new 15 seconds");
    await runNativeAudioDeadline(h, remaining[0]);
    assert.equal(h.runtime.invite.status, "ended");
    assert.equal(h.runtime.media.localStreams.length, 0);
  } finally { await h.unmount(); }
});

test("full iPhone native audio deadline observes matching activation before React commits it", async () => {
  const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
    invite: { id: nativeIds.inviteId }, nativeAnswer: { callUuid: nativeIds.callUuid } });
  try {
    const deadline = currentNativeAudioDeadline(h);
    await h.run(() => {
      // Native receipt and already queued timer can arrive before React's
      // passive-effect cleanup. The observed activation must win this order.
      h.emitNativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
      deadline.canceled = true;
      void deadline.fn();
    });
    assert.equal(h.runtime.invite.status, "accepted");
    assert.equal(h.runtime.nativeEnds.length, 0, "an observed current activation must prevent native End before effect cleanup");
    assert.deepEqual(h.runtime.transitions.map(({ status }) => status), ["accepted"]);
    assert.equal(h.runtime.media.localStreams.length, 1);
  } finally { await h.unmount(); }
});

for (const retirement of ["End", "account replacement", "call replacement"]) {
  test(`full iPhone native audio deadline callback is inert after ${retirement}`, async () => {
    const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
      invite: { id: nativeIds.inviteId }, nativeAnswer: { callUuid: nativeIds.callUuid } });
    try {
      const deadline = currentNativeAudioDeadline(h);
      if (retirement === "account replacement") {
        h.runtime.invite = null;
        h.runtime.thread.activeCommunicationRoomId = null;
        h.runtime.thread.activeCallType = null;
        h.runtime.media.userId = "10000000-0000-4000-8000-000000000007";
        h.runtime.media.admissionPrepareActions.push({ outcome: "reject", message: "communication_chat_call_authority_required" });
        await h.rerender({ userId: h.runtime.media.userId, sessionGeneration: "session-2" });
      } else {
        assert.equal(h.runtime.snapshot.panelBindings.showControls, true);
        await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
        assert.equal(h.runtime.invite.status, "ended");
        assert.equal(h.runtime.snapshot.callPanelOpen, false);
      }
      if (retirement === "call replacement") {
        const nextInvite = "10000000-0000-4000-8000-000000000009";
        h.runtime.invite = { ...h.runtime.invite, id: nextInvite, status: "ringing",
          communicationRoomId: "ROOM-REPLACEMENT", expiresAt: new Date(Date.now() + 90_000).toISOString() };
        h.runtime.thread.activeCommunicationRoomId = "ROOM-REPLACEMENT";
        h.runtime.thread.activeCallType = "video";
        h.runtime.roomId = h.runtime.media.roomId = "ROOM-REPLACEMENT";
        let params;
        const route = nativeProvenance.createIosCallKitAnswerRouteHandler({
          getAuthenticatedUserId: () => nativeIds.userId, isActive: () => true,
          completeAnswerFailure: async () => { throw Error("replacement route was not attested"); },
          replace: destination => { params = { threadId: nativeIds.threadId,
            ...Object.fromEntries(new URL(destination, "https://fixture.invalid").searchParams) }; },
        });
        assert.equal(await route({ type: "answerrequested", platform: "ios", callType: "video",
          callInviteId: nextInvite, threadId: nativeIds.threadId,
          callUuid: "10000000-0000-4000-8000-000000000008", nativeEventGeneration: 1 }), "routed");
        await h.rerender({ params });
        assert.equal(h.runtime.snapshot.activeCallInvite.id, nextInvite);
        assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
        assert.notStrictEqual(currentNativeAudioDeadline(h), deadline, "replacement owns a new deadline");
      }
      assert.equal(deadline.canceled, true);
      const before = { transitions: h.runtime.transitions.length, nativeEnds: h.runtime.nativeEnds.length, clears: h.runtime.clears.length };
      await runNativeAudioDeadline(h, deadline);
      assert.deepEqual({ transitions: h.runtime.transitions.length, nativeEnds: h.runtime.nativeEnds.length, clears: h.runtime.clears.length }, before);
      assert.equal(h.runtime.media.localStreams.length, 0);
      if (retirement === "call replacement") {
        assert.equal(h.runtime.invite.status, "accepted");
        assert.equal(h.runtime.snapshot.activeCallInvite.id, h.runtime.invite.id);
        currentNativeAudioDeadline(h);
        await h.nativeEvent({ type: "audioSessionActivated", callUuid: "10000000-0000-4000-8000-000000000008" });
        assert.equal(h.runtime.media.localStreams.length, 1, "stale callback does not block the replacement's valid activation");
      }
    } finally { await h.unmount(); }
  });
}

for (const failure of ["server transition", "native cleanup"]) {
  test(`full iPhone native audio deadline retains reachable End after failed ${failure}`, async () => {
    let failNative = failure === "native cleanup";
    const nativeEnds = [];
    const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
      invite: { id: nativeIds.inviteId }, nativeAnswer: { callUuid: nativeIds.callUuid },
      nativeFacade: { endIosNativeCall: async (...args) => { nativeEnds.push(args); return !failNative; } } });
    try {
      if (failure === "server transition") h.runtime.transition = async () => { throw Error("terminal transition unavailable"); };
      await runNativeAudioDeadline(h);
      assert.equal(h.runtime.snapshot.callPanelOpen, true, "failed cleanup keeps the real call panel open");
      assert.equal(h.runtime.snapshot.panelBindings.showControls, true, "actual panel expression keeps End reachable");
      assert.ok(h.runtime.snapshot.error, "the failed deadline must expose a retryable error");
      assert.equal(h.runtime.media.localStreams.length, 0);
      assert.equal(h.runtime.invite.status, failure === "server transition" ? "accepted" : "ended");
      await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
      assert.equal(h.runtime.media.localStreams.length, 0, "late activation cannot bypass failed terminal cleanup");
      failNative = false;
      h.runtime.transition = null;
      await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
      assert.equal(h.runtime.invite.status, "ended");
      assert.equal(h.runtime.snapshot.callPanelOpen, false);
      assert.equal(h.runtime.snapshot.activeCallInvite, null);
      assert.ok(nativeEnds.length > 0 && nativeEnds.every(([uuid]) => uuid === nativeIds.callUuid));
      assert.equal(h.runtime.media.localStreams.length, 0);
    } finally { await h.unmount(); }
  });
}

test("full iPhone native audio deadline starts after accepted descriptor rather than pending server acceptance", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
    invite: { id: nativeIds.inviteId }, nativeAnswer: { callUuid: nativeIds.callUuid },
    transition: async () => pending });
  try {
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.snapshot.callBusy, true);
    assert.equal(h.runtime.timers.some(timer => !timer.canceled && timer.delay > 14_000 && timer.delay <= 15_001), false);
    assert.equal(h.runtime.nativeCompletions.length, 0);
    await h.run(() => {
      h.runtime.invite = { ...h.runtime.invite, status: "accepted" };
      h.runtime.transition = null;
      release({ ...h.runtime.invite });
    });
    assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
    assert.equal(h.runtime.nativeCompletions.length, 1);
    currentNativeAudioDeadline(h);
    assert.equal(h.runtime.media.localStreams.length, 0);
  } finally { release?.(null); await h.unmount(); }
});

test("full iPhone delayed native audio deadline callback cannot turn elapsed claim time into readiness", async () => {
  let elapsed = 0;
  const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
    screenPerformance: { now: () => performance.now() + elapsed },
    invite: { id: nativeIds.inviteId }, nativeAnswer: { callUuid: nativeIds.callUuid } });
  try {
    const deadline = currentNativeAudioDeadline(h);
    elapsed = 31_000;
    // Model delayed callback delivery, without firing any hook or OS callback.
    // The same callback must still settle the accepted session after claim TTL.
    await runNativeAudioDeadline(h, deadline);
    assert.equal(h.runtime.invite.status, "ended");
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.equal(h.runtime.media.localStreams.length, 0);
    assert.equal(h.runtime.media.joinCalls.length, 0);
  } finally { await h.unmount(); }
});

for (const replacement of [false, true]) {
  test(`full iPhone native audio deadline pending terminal write ${replacement ? "cannot continue under replacement authority" : "blocks late activation until safe close"}`, async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
      invite: { id: nativeIds.inviteId }, nativeAnswer: { callUuid: nativeIds.callUuid } });
    try {
      const accepted = { ...h.runtime.invite };
      h.runtime.transition = async () => pending;
      await runNativeAudioDeadline(h);
      assert.equal(h.runtime.transitions.at(-1).status, "ended");
      assert.equal(h.runtime.invite.status, "accepted", "pending request alone is not terminal authority");
      await h.nativeEvent({ type: "audioSessionActivated", callUuid: nativeIds.callUuid });
      assert.equal(h.runtime.media.localStreams.length, 0, "timeout blocks activation before terminal acknowledgment");
      const before = { nativeEnds: h.runtime.nativeEnds.length, clears: h.runtime.clears.length };
      if (replacement) {
        h.runtime.invite = null;
        h.runtime.thread.activeCommunicationRoomId = null;
        h.runtime.thread.activeCallType = null;
        h.runtime.media.userId = "10000000-0000-4000-8000-000000000007";
        h.runtime.media.admissionPrepareActions.push({ outcome: "reject", message: "communication_chat_call_authority_required" });
        await h.rerender({ userId: h.runtime.media.userId, sessionGeneration: "session-2" });
      } else {
        h.runtime.invite = { ...accepted, status: "ended" };
        h.runtime.thread.activeCommunicationRoomId = null;
        h.runtime.thread.activeCallType = null;
      }
      await h.run(() => { release({ ...accepted, status: "ended" }); });
      // Continue only the existing coordinator's settlement delays.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const delay = h.runtime.timers.find(timer => !timer.canceled && timer.delay === 200);
        if (!delay) break;
        await h.fireTimer(delay);
      }
      await h.flush();
      assert.equal(h.runtime.media.localStreams.length, 0);
      if (replacement) {
        assert.deepEqual({ nativeEnds: h.runtime.nativeEnds.length, clears: h.runtime.clears.length }, before,
          "retired completion cannot issue another native operation or clear the replacement account");
        assert.equal(h.runtime.invite, null);
      } else {
        assert.equal(h.runtime.invite.status, "ended");
        assert.equal(h.runtime.snapshot.callPanelOpen, false);
      }
    } finally { release?.(null); await h.unmount(); }
  });
}

test("full iPhone foreground fallback without CallKit still captures after accepted Answer", async () => {
  const h = await mountFullChatThread({ ...nativeIds, platform: "ios",
    invite: { id: nativeIds.inviteId },
    nativeFacade: { ensureIosForegroundIncomingCallPresentation: async () => "not_expected" } });
  try {
    await h.run(() => h.runtime.snapshot.handleAcceptIncomingCall());
    assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
    assert.equal(h.runtime.nativeCompletions.length, 0);
    assert.equal(h.runtime.media.joinCalls.length, 1);
    assert.equal(h.runtime.media.localStreams.length, 1);
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

test("accepted native iOS call remains audio-gated when its thread screen remounts without route claims", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  await root.event(makeNativeEvent("incoming"));
  await root.event(makeNativeEvent("answerRequested"));
  const destination = new URL(root.routes[0], "https://test.invalid");
  const options = { userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session, nativeFacade: root.facade };
  const initial = await mountFullChatThread({ ...options, invite: { id: rootNativeIds.invite },
    routeParams: Object.fromEntries(destination.searchParams) });
  assert.equal(initial.runtime.snapshot.activeCallInvite.status, "accepted");
  assert.equal(initial.runtime.media.localStreams.length, 0);
  const acceptedInvite = { ...initial.runtime.invite };
  const readInput = { authenticatedUserId: rootNativeIds.user, sessionGeneration: rootNativeIds.session, inviteId: acceptedInvite.id,
    inviteStatus: "accepted", mediaProvider: acceptedInvite.mediaProvider,
    roomId: acceptedInvite.communicationRoomId, threadId: rootNativeIds.thread };
  const retained = root.facade.readIosAcceptedNativeMediaSession(readInput);
  assert.ok(retained);
  assert.equal(retained.audioSessionActive, false);
  await initial.unmount();
  assert.equal(root.facade.hasIosNativeCallPresentation(rootNativeIds.invite), true,
    "the exact native call still owns its presentation after route-local refs retire");
  const replacement = await mountFullChatThread({ ...options, invite: acceptedInvite,
    screenPerformance: { now: () => retained.readinessDeadlineMs - 5_000 } });
  t.after(() => replacement.unmount());
  assert.equal(replacement.runtime.snapshot.activeCallInvite.status, "accepted");
  assert.equal(replacement.runtime.media.localStreams.length, 0,
    "server acceptance on a fresh screen must not bypass the existing CallKit audio prerequisite");
  const timeout = replacement.runtime.timers.find(timer => !timer.canceled && timer.delay === 5_000);
  assert.ok(timeout, "remount must retain the original deadline, not grant another fifteen seconds");
  await replacement.fireTimer(timeout);
  const retry = replacement.runtime.timers.find(timer => !timer.canceled && timer.delay === 200);
  if (retry) await replacement.fireTimer(retry);
  await replacement.flush();
  assert.equal(replacement.runtime.invite.status, "ended");
  assert.deepEqual(Array.from(root.nativeSteps).filter(step => step.name === "end").map(({uuid, reason}) => ({uuid, reason})),
    [{uuid: rootNativeIds.uuid, reason: "native_audio_activation_timeout"}]);
  assert.equal(replacement.runtime.media.localStreams.length, 0);
  assert.equal(root.facade.readIosAcceptedNativeMediaSession(readInput), null,
    "exact completed cleanup releases the retained descriptor");
});

for (const activationTiming of ["before unmount", "between screens"]) {
  test(`accepted native iOS remount reuses observed audio readiness ${activationTiming} and preserves exact controls`, async (t) => {
    const root = await mountIosRoot(t, { realFacade: true });
    await root.event(makeNativeEvent("incoming"));
    await root.event(makeNativeEvent("answerRequested"));
    const destination = new URL(root.routes[0], "https://test.invalid");
    const options = { userId: rootNativeIds.user,
      remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
      platform: "ios", sessionGeneration: rootNativeIds.session, nativeFacade: root.facade };
    const initial = await mountFullChatThread({ ...options, invite: { id: rootNativeIds.invite },
      routeParams: Object.fromEntries(destination.searchParams) });
    const acceptedInvite = { ...initial.runtime.invite };
    if (activationTiming === "before unmount") await initial.run(() => root.event(makeNativeEvent("audioSessionActivated")));
    await initial.unmount();
    if (activationTiming === "between screens") await root.event(makeNativeEvent("audioSessionActivated"));
    const replacement = await mountFullChatThread({ ...options, invite: acceptedInvite });
    t.after(() => replacement.unmount());
    assert.equal(replacement.runtime.media.localStreams.length, 1,
      "the exact retained SDK synchronization receipt can satisfy a remounted screen");
    assert.equal(root.nativeSteps.filter(step => step.name === "answer").length, 1,
      "remount must not repeat the one-use native Answer");
    await replacement.run(() => replacement.runtime.snapshot.handleToggleCallMic());
    assert.deepEqual(Array.from(root.nativeSteps).filter(step => step.name === "setMuted").map(({uuid, muted}) => ({uuid, muted})),
      [{uuid: rootNativeIds.uuid, muted: true}], "Mute retains the native UUID without route parameters");
    await replacement.run(() => replacement.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(replacement.runtime.invite.status, "ended");
    assert.deepEqual(Array.from(root.nativeSteps).filter(step => step.name === "end").map(({uuid}) => uuid), [rootNativeIds.uuid]);
  });
}

test("actual iOS SDK audio synchronization failure remains gated and is observable without private fields", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  await root.event(makeNativeEvent("incoming"));
  await root.event(makeNativeEvent("answerRequested"));
  const destination = new URL(root.routes[0], "https://test.invalid");
  const screen = await mountFullChatThread({ userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session, nativeFacade: root.facade,
    invite: { id: rootNativeIds.invite }, routeParams: Object.fromEntries(destination.searchParams) });
  t.after(() => screen.unmount());
  root.setStage("sdk-audio-sync", () => false);
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  assert.equal(screen.runtime.media.localStreams.length, 0, "native receipt alone cannot conceal failed SDK handoff");
  const diagnostic = root.mediaDiagnostics.find(item => item.phase === "native_audio_activation_received");
  assert.deepEqual(Object.keys(diagnostic).sort(), ["enabled", "phase"]);
  assert.equal(diagnostic.enabled, false);
  root.setStage("sdk-audio-sync", () => true);
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  assert.equal(screen.runtime.media.localStreams.length, 1);
});

test("retained iOS accepted audio authority rejects copied descriptors and different call/account/session ownership", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  await root.event(makeNativeEvent("incoming"));
  await root.event(makeNativeEvent("answerRequested"));
  const destination = new URL(root.routes[0], "https://test.invalid");
  const screen = await mountFullChatThread({ userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session, nativeFacade: root.facade,
    invite: { id: rootNativeIds.invite }, routeParams: Object.fromEntries(destination.searchParams) });
  const accepted = screen.runtime.invite;
  const input = { authenticatedUserId: rootNativeIds.user, sessionGeneration: rootNativeIds.session, inviteId: accepted.id, inviteStatus: "accepted",
    mediaProvider: accepted.mediaProvider, roomId: accepted.communicationRoomId, threadId: rootNativeIds.thread };
  const retained = root.facade.readIosAcceptedNativeMediaSession(input);
  assert.ok(retained);
  assert.equal(root.facade.retainIosAcceptedNativeMediaSession({ ...retained.descriptor }), false);
  for (const change of [{authenticatedUserId: "other-user"}, {sessionGeneration: "replacement-session"}, {inviteId: rootNativeIds.replacementUuid},
    {roomId: "OTHER-ROOM"}, {threadId: rootNativeIds.replacementUuid}, {mediaProvider: "livekit"}, {inviteStatus: "ringing"}]) {
    assert.equal(root.facade.readIosAcceptedNativeMediaSession({ ...input, ...change }), null);
  }
  assert.equal(root.facade.releaseIosAcceptedNativeMediaSession(accepted.id, rootNativeIds.replacementUuid, input), false);
  assert.equal(root.facade.releaseIosAcceptedNativeMediaSession(accepted.id, rootNativeIds.uuid,
    { ...input, sessionGeneration: "replacement-session" }), false);
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  assert.equal(root.facade.readIosAcceptedNativeMediaSession(input).audioSessionActive, true);
  await screen.unmount();
  await root.event(makeNativeEvent("audioSessionDeactivated"));
  assert.equal(root.facade.readIosAcceptedNativeMediaSession(input).audioSessionActive, false,
    "a stale activation receipt cannot survive a real deactivation");
  await root.rerender({ authority: { userId: rootNativeIds.user, accountId: rootNativeIds.user,
    sessionGeneration: "replacement-session", state: "ACTIVE", restoreOnly: false } });
  assert.equal(root.facade.readIosAcceptedNativeMediaSession(input), null);
  assert.equal(root.facade.releaseIosAcceptedNativeMediaSession(accepted.id, rootNativeIds.uuid, input), false);
});

test("long healthy iOS call survives quarantine and remount from current native recovery without a second activation callback", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true, controlledRetryTimers: true });
  let advancedTime;
  const clock = { now: () => advancedTime ?? performance.now() };
  root.setStage("monotonic-now", clock.now);
  await root.event(makeNativeEvent("incoming"));
  await root.event(makeNativeEvent("answerRequested"));
  const destination = new URL(root.routes[0], "https://test.invalid");
  const options = { userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session, nativeFacade: root.facade, screenPerformance: clock };
  const initial = await mountFullChatThread({ ...options, invite: { id: rootNativeIds.invite },
    routeParams: Object.fromEntries(destination.searchParams) });
  const acceptedInvite = { ...initial.runtime.invite };
  await initial.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  const audio = initial.runtime.media.localStreams[0].getAudioTracks()[0];
  advancedTime = performance.now() + 60_000;
  root.setStage("authority-read", async () => null);
  await initial.run(() => root.activate());
  assert.equal(audio.readyState, "ended", "historical screen activation cannot bypass a quarantined facade gate");
  await initial.unmount();
  const replacement = await mountFullChatThread({ ...options, invite: acceptedInvite });
  t.after(() => replacement.unmount());
  assert.equal(replacement.runtime.media.localStreams.length, 0, "quarantine retains a restriction without granting authority");
  assert.ok(replacement.runtime.timers.some(timer => !timer.canceled && Math.abs(timer.delay - 15_000) < 0.001),
    "a previously healthy call gets a bounded recovery deadline instead of its expired initial deadline");
  root.setStage("authority-read", async () => ({ userId: rootNativeIds.user, accountId: rootNativeIds.user,
    sessionGeneration: rootNativeIds.session, state: "ACTIVE", restoreOnly: false }));
  await replacement.run(() => root.activate());
  assert.equal(root.facade.hasIosNativeCallPresentation(acceptedInvite.id), true);
  assert.equal(replacement.runtime.media.localStreams.length, 1);
  assert.equal(root.nativeSteps.filter(step => step.name === "end").length, 0);
  assert.ok(root.mediaDiagnostics.some(receipt => receipt.phase === "native_audio_recovered" && receipt.enabled === true),
    "the actual recovered native current-state receipt, with another SDK sync, releases the gate");
});

for (const loss of ["audioSessionDeactivated", "audioInterruptionBegan", "audioSessionFailed", "failed SDK synchronization"]) {
  test(`mounted iOS native readiness immediately closes on ${loss} after a successful activation`, async (t) => {
    const root = await mountIosRoot(t, { realFacade: true });
    await root.event(makeNativeEvent("incoming"));
    await root.event(makeNativeEvent("answerRequested"));
    const destination = new URL(root.routes[0], "https://test.invalid");
    const screen = await mountFullChatThread({ userId: rootNativeIds.user,
      remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
      platform: "ios", sessionGeneration: rootNativeIds.session, nativeFacade: root.facade,
      invite: { id: rootNativeIds.invite }, routeParams: Object.fromEntries(destination.searchParams) });
    t.after(() => screen.unmount());
    await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
    const audio = screen.runtime.media.localStreams[0].getAudioTracks()[0];
    if (loss === "failed SDK synchronization") root.setStage("sdk-audio-sync", () => false);
    await screen.run(() => root.event(makeNativeEvent(loss === "failed SDK synchronization" ? "audioSessionActivated" : loss)));
    assert.equal(audio.readyState, "ended", "the event itself must close the mounted gate without an unrelated rerender");
    assert.equal(screen.runtime.media.localStreams.length, 1);
  });
}

test("screen-first same-user session replacement cannot retain native activation, controls, or capture", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  await root.event(makeNativeEvent("incoming"));
  await root.event(makeNativeEvent("answerRequested"));
  const destination = new URL(root.routes[0], "https://test.invalid");
  const screen = await mountFullChatThread({ userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session, nativeFacade: root.facade,
    invite: { id: rootNativeIds.invite }, routeParams: Object.fromEntries(destination.searchParams) });
  t.after(() => screen.unmount());
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  const audio = screen.runtime.media.localStreams[0].getAudioTracks()[0];
  await screen.rerender({ sessionGeneration: "replacement-session" });
  assert.equal(audio.readyState, "ended");
  assert.equal(screen.runtime.media.localStreams.length, 1, "the old native owner cannot authorize replacement-session capture");
  const nativeControls = root.nativeSteps.filter(step => step.name === "setMuted").length;
  await screen.run(() => screen.runtime.snapshot.handleToggleCallMic());
  assert.equal(root.nativeSteps.filter(step => step.name === "setMuted").length, nativeControls);
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  assert.equal(screen.runtime.media.localStreams.length, 1, "a delayed old-facade receipt cannot unlock the replacement screen");
});

test("root-first same-user session replacement fences capture, End, Mute, and old readiness timers", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  await root.event(makeNativeEvent("incoming"));
  await root.event(makeNativeEvent("answerRequested"));
  const destination = new URL(root.routes[0], "https://test.invalid");
  const screen = await mountFullChatThread({ userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session, nativeFacade: root.facade,
    invite: { id: rootNativeIds.invite }, routeParams: Object.fromEntries(destination.searchParams) });
  t.after(() => screen.unmount());
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  const audio = screen.runtime.media.localStreams[0].getAudioTracks()[0];
  await screen.run(() => root.rerender({ authority: { userId: rootNativeIds.user, accountId: rootNativeIds.user,
    sessionGeneration: "replacement-session", state: "ACTIVE", restoreOnly: false } }));
  assert.equal(audio.readyState, "ended");
  const before = root.nativeSteps.filter(step => step.name === "end" || step.name === "setMuted").length;
  await screen.run(() => screen.runtime.snapshot.handleToggleCallMic());
  await screen.run(() => screen.runtime.snapshot.handleJoinOrCloseCall());
  for (const timer of [...screen.runtime.timers].filter(timer => !timer.canceled && timer.delay <= 15_000)) await screen.fireTimer(timer);
  assert.equal(root.nativeSteps.filter(step => step.name === "end" || step.name === "setMuted").length, before);
  assert.equal(screen.runtime.invite.status, "accepted", "retired screen cannot mutate server state while its session props lag");
  assert.equal(screen.runtime.media.localStreams.length, 1);
});

test("native-enabled iOS accepted callee cannot capture before queued native ownership discovery", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  root.queue(makeNativeEvent("recovered"));
  const screen = await mountFullChatThread({ userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session, nativeFacade: root.facade,
    invite: { id: rootNativeIds.invite, status: "accepted" } });
  t.after(() => screen.unmount());
  assert.equal(screen.runtime.media.localStreams.length, 0);
  await screen.run(() => root.facade.drainIosNativeCallPendingEvents());
  assert.equal(root.facade.hasIosNativeCallPresentation(rootNativeIds.invite), true);
  assert.equal(screen.runtime.media.localStreams.length, 0, "presentation discovery is not accepted media authority");
});

test("native receipt generations reject delayed activation, terminal, and recovery for a replaced UUID generation", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  await root.event(makeNativeEvent("incoming"));
  await root.event(makeNativeEvent("answerRequested"));
  const destination = new URL(root.routes[0], "https://test.invalid");
  const screen = await mountFullChatThread({ userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session, nativeFacade: root.facade,
    invite: { id: rootNativeIds.invite }, routeParams: Object.fromEntries(destination.searchParams) });
  t.after(() => screen.unmount());
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  const generation = "00000000-0000-4000-8000-000000000088";
  await screen.run(() => root.event(makeNativeEvent("incoming", { nativeCallGeneration: generation })));
  assert.equal(screen.runtime.media.localStreams[0].getAudioTracks()[0].readyState, "ended");
  for (const type of ["audioSessionActivated", "ended", "recovered"]) {
    await screen.run(() => root.event(makeNativeEvent(type, { audioSessionActive: true })));
    assert.equal(root.facade.hasIosNativeCallPresentation(rootNativeIds.invite), true);
    assert.equal(screen.runtime.media.localStreams.length, 1);
  }
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated", { nativeCallGeneration: generation })));
  assert.equal(screen.runtime.media.localStreams.length, 1, "new generation activation cannot authorize the old accepted descriptor");
  const ends = root.nativeSteps.filter(step => step.name === "end").length;
  await screen.run(() => screen.runtime.snapshot.handleJoinOrCloseCall());
  assert.equal(root.nativeSteps.filter(step => step.name === "end").length, ends);
});

test("same-thread iOS Answer consumes a native route arriving before the request promise settles", async (t) => {
  const root = await mountIosRoot(t, { realFacade: true });
  await root.event(makeNativeEvent("incoming"));
  const screen = await mountFullChatThread({ userId: rootNativeIds.user,
    remoteUserId: "00000000-0000-4000-8000-000000000099", threadId: rootNativeIds.thread,
    platform: "ios", sessionGeneration: rootNativeIds.session,
    invite: { id: rootNativeIds.invite, callType: "voice" }, nativeFacade: root.facade });
  t.after(() => screen.unmount());
  const nativeRequest = deferredMessageWrite();
  root.setStage("os-requestAnswer", () => nativeRequest.wait.then(() => true));
  let answer;
  await screen.run(() => { answer = screen.runtime.snapshot.handleAcceptIncomingCall(); });
  assert.equal(screen.runtime.snapshot.callBusy, true);
  assert.equal(root.nativeSteps.filter(step => step.name === "requestAnswer").length, 1);
  assert.equal(screen.runtime.transitions.length, 0, "queueing the native request cannot accept the server invite");
  await root.event(makeNativeEvent("answerRequested"));
  assert.equal(root.routes.length, 1);
  const destination = new URL(root.routes[0], "https://test.invalid");
  await screen.rerender({ params: { threadId: rootNativeIds.thread, ...Object.fromEntries(destination.searchParams) } });
  assert.equal(screen.runtime.transitions.length, 0, "the in-flight UI request retains its single operation slot");
  await screen.run(async () => { nativeRequest.release(); await answer; });
  assert.deepEqual(screen.runtime.transitions.map(({ status }) => status), ["accepted"]);
  assert.equal(screen.runtime.snapshot.callBusy, false);
  assert.equal(screen.runtime.media.localStreams.length, 0, "Answer waits for actual native audio activation");
  await screen.run(() => root.event(makeNativeEvent("audioSessionActivated")));
  assert.equal(screen.runtime.media.joinCalls.length, 1);
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

async function consumeAndroidRootDestination(t, root, options = {}) {
  assert.equal(root.destinations.length, 1);
  const destination = new URL(root.destinations[0], "https://test.invalid");
  assert.equal(destination.pathname, `/chat/${androidIds.thread}`);
  const screen = await mountFullChatThread({ userId: androidIds.user, remoteUserId: androidIds.other,
    threadId: androidIds.thread, platform: "android", invite: { id: androidIds.invite },
    routeParams: Object.fromEntries(destination.searchParams), ...options });
  t.after(() => screen.unmount());
  return screen;
}

test("actual Android root consumes native store Answer and the destination screen accepts once before capture", async t => {
  const payload = androidAction();
  const root = await mountAndroidRoot(t, { pending: [payload] });
  const screen = await consumeAndroidRootDestination(t, root);
  assert.deepEqual(screen.runtime.transitions.map(({ status }) => status), ["accepted"]);
  assert.equal(screen.runtime.snapshot.activeCallInvite.id, androidIds.invite);
  assert.equal(screen.runtime.media.joinCalls.length, 1);
  assert.equal(screen.runtime.media.localStreams.length, 1);
  assert.equal(screen.runtime.snapshot.participants.find(participant => !participant.isSelf).connectionState, "connecting",
    "native-store handoff does not fabricate received media proof");
  root.pending.push(payload);
  await screen.run(() => root.emit());
  assert.equal(root.destinations.length, 1, "repeated native receipt cannot create a second route");
  assert.equal(screen.runtime.transitions.length, 1);
  assert.equal(screen.runtime.media.localStreams.length, 1);
});

test("actual Android root defers background native availability until foreground then hands off from elsewhere", async t => {
  const root = await mountAndroidRoot(t);
  await root.appState("background");
  const attemptsBefore = root.attempts.length;
  root.pending.push(androidAction());
  await root.emit();
  assert.equal(root.attempts.length, attemptsBefore);
  assert.equal(root.destinations.length, 0, "no destination screen exists while the app is elsewhere/backgrounded");
  await root.appState("active");
  const screen = await consumeAndroidRootDestination(t, root);
  assert.deepEqual(screen.runtime.transitions.map(({ status }) => status), ["accepted"]);
  assert.equal(screen.runtime.media.joinCalls.length, 1);
  await root.appState("active");
  await root.emit();
  assert.equal(root.destinations.length, 1);
});

test("actual Android root lets the focused same-thread screen consume Answer without replacing its route", async t => {
  const root = await mountAndroidRoot(t);
  const screen = await mountFullChatThread({ userId: androidIds.user, remoteUserId: androidIds.other,
    threadId: androidIds.thread, platform: "android", invite: { id: androidIds.invite } });
  t.after(() => screen.unmount());
  root.pending.push(androidAction());
  await screen.run(() => root.emit());
  assert.equal(root.destinations.length, 0, "the actual focused screen consumes the shared production claim synchronously");
  assert.deepEqual(screen.runtime.transitions.map(({ status }) => status), ["accepted"]);
  assert.equal(screen.runtime.media.joinCalls.length, 1);
});

test("actual Android root retires a deferred native receipt after account replacement without navigation or capture", async t => {
  const held = deferredMessageWrite();
  const root = await mountAndroidRoot(t, { pending: [() => held.wait.then(() => androidAction())] });
  await root.rerender({ user: { id: androidIds.other } });
  await root.run(() => held.release());
  assert.equal(root.destinations.length, 0);
  const screen = await mountFullChatThread({ userId: androidIds.other, remoteUserId: androidIds.user,
    threadId: androidIds.thread, platform: "android", invite: { id: androidIds.invite, calleeUserId: androidIds.user } });
  t.after(() => screen.unmount());
  assert.equal(screen.runtime.transitions.length, 0);
  assert.equal(screen.runtime.media.localStreams.length, 0);
});

test("actual Android root leaves queued native Answer untouched during auth loading then drains on sign-in", async t => {
  const root = await mountAndroidRoot(t, { pending: [androidAction()], session: { isLoading: true, isSignedIn: false, user: null } });
  assert.equal(root.attempts.length, 0);
  assert.equal(root.destinations.length, 0);
  await root.rerender({ isLoading: false, isSignedIn: true, user: { id: androidIds.user } });
  const screen = await consumeAndroidRootDestination(t, root);
  assert.equal(screen.runtime.transitions.length, 1);
  assert.equal(screen.runtime.media.joinCalls.length, 1);
});

test("actual Android root revokes the exact Answer claim when router transport rejects", async t => {
  const observed = [];
  const root = await mountAndroidRoot(t, { rejectNavigation: true });
  const remove = nativeProvenance.subscribeToTrustedAndroidNativeActionRoutes(route => { observed.push(route); return false; });
  t.after(remove);
  root.pending.push(androidAction());
  await root.emit();
  assert.equal(observed.length, 1);
  assert.equal(root.destinations.length, 0);
  assert.deepEqual(root.errors.map(({ message }) => message), ["Android native call route unavailable."]);
  const route = observed[0];
  assert.equal(nativeProvenance.consumeMountedAndroidNativeCallRoute({ authenticatedUserId: androidIds.user,
    authLoading: false, isSignedIn: true, platform: "android", claimId: route.claimId,
    inviteId: route.inviteId, requestKey: route.nativeIdentity, threadId: route.threadId }), null,
  "a failed navigation cannot leave an actionable claim for a later screen");
});

test("Android root handoff mutation control detects a retired effect routing the old account receipt", async t => {
  const held = deferredMessageWrite();
  const root = await mountAndroidRoot(t, { pending: [() => held.wait.then(() => androidAction())], mutateRoot: source => {
    assert.equal(source.split("active = false;").length, 2);
    return source.replace("active = false;", "active = true;");
  } });
  await root.rerender({ user: { id: androidIds.other } });
  await root.run(() => held.release());
  assert.equal(root.destinations.length, 1,
    "removing actual effect retirement violates the passing test's no-stale-navigation postcondition");
});
