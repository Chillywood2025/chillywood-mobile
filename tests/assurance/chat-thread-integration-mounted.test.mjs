import assert from "node:assert/strict";
import test from "node:test";
import { mountFullChatThread } from "./helpers/chat-thread-full-mounted-harness.mjs";

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
