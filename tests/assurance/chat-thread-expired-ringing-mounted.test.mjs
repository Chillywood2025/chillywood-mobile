import assert from "node:assert/strict";
import test from "node:test";
import { mountFullChatThread } from "./helpers/chat-thread-full-mounted-harness.mjs";

const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const expectRingingPresentation = h => {
  assert.equal(h.runtime.snapshot.presentation.incomingBannerVisible, true);
  assert.equal(h.runtime.snapshot.presentation.voiceCallDisabled, true);
  assert.equal(h.runtime.snapshot.presentation.videoCallDisabled, true);
};
const expectExpiredPresentation = h => {
  assert.equal(h.runtime.snapshot.presentation.incomingBannerVisible, false,
    "expired ringing must disappear before backend reconciliation settles");
  assert.equal(h.runtime.snapshot.presentation.threadStatusLabel, "Direct thread");
  assert.equal(h.runtime.snapshot.presentation.voiceCallDisabled, false);
  assert.equal(h.runtime.snapshot.presentation.videoCallDisabled, false);
  assert.equal(h.runtime.snapshot.activeCallRoomId, "");
  assert.equal(h.runtime.snapshot.callPanelOpen, false);
  assert.equal(h.runtime.media.joinCalls.length, 0);
  assert.equal(h.runtime.media.localStreams.length, 0);
  assert.equal(h.runtime.hostEnds, 0);
  assert.equal(h.runtime.leaves.length, 0);
};

for (const platform of ["ios", "android"]) {
  for (const callType of ["voice", "video"]) {
    for (const blocked of ["read", "cleanup"]) {
      test(`full ${platform} ${callType} foreground hides expired ringing while ${blocked} is deferred`, async () => {
        let now = Date.now();
        class ScreenDate extends Date { static now() { return now; } }
        const h = await mountFullChatThread({ platform, screenDate: ScreenDate,
          invite: { callType, expiresAt: new Date(now + 60_000).toISOString() } });
        const barrier = deferred();
        let reconciliation;
        try {
          expectRingingPresentation(h);
          await h.appState("background");
          const expiry = h.runtime.timers.find(timer => !timer.canceled && timer.delay === 60_000
            && timer.fn.constructor.name === "AsyncFunction");
          assert.ok(expiry, "the mounted screen owns the server-expiry reconciliation timer");
          // No timer fires while suspended. Resume well after the server deadline.
          now += 210_000;
          if (blocked === "read") h.runtime.readInvite = () => barrier.promise;
          else {
            h.runtime.invite = { ...h.runtime.invite, status: "missed" };
            h.runtime.clearThread = () => barrier.promise;
          }
          await h.run(() => { reconciliation = expiry.fn(); });
          await h.appState("active");
          expectExpiredPresentation(h);
          assert.equal(h.runtime.snapshot.incomingCallInvite.id, "invite",
            "local presentation expiry retains the exact invite for authoritative reconciliation");
          assert.equal(h.runtime.transitions.length, 0);
          assert.equal(h.runtime.clears.length, blocked === "cleanup" ? 1 : 0);
          if (blocked === "cleanup") assert.deepEqual(h.runtime.clears[0].slice(0, 2), ["thread", "ROOM-LEGACY"]);
          h.runtime.invite = { ...h.runtime.invite, status: "missed" };
          h.runtime.thread.activeCommunicationRoomId = null;
          h.runtime.thread.activeCallType = null;
          barrier.resolve(blocked === "read" ? { ...h.runtime.invite } : { cleared: true, reason: "ended" });
          await h.run(() => reconciliation);
          assert.equal(h.runtime.snapshot.incomingCallInvite, null);
        } finally {
          barrier.resolve(null);
          await h.unmount();
        }
      });
    }
  }
}

test("full foreground rechecks the deadline even when no suspended timer has resumed", async () => {
  let now = Date.now();
  class ScreenDate extends Date { static now() { return now; } }
  const h = await mountFullChatThread({ screenDate: ScreenDate,
    invite: { expiresAt: new Date(now + 60_000).toISOString() } });
  try {
    await h.appState("background");
    now += 30_000;
    await h.appState("active");
    expectRingingPresentation(h);
    await h.appState("background");
    now += 31_000;
    await h.appState("active");
    expectExpiredPresentation(h);
    assert.equal(h.runtime.transitions.length, 0);
    assert.equal(h.runtime.clears.length, 0);
    assert.equal(h.runtime.invite.status, "ringing", "the local deadline cannot invent terminal authority");
  } finally { await h.unmount(); }
});

test("full screen deadline removes ringing presentation while its terminal read remains pending", async () => {
  let now = Date.now();
  class ScreenDate extends Date { static now() { return now; } }
  const h = await mountFullChatThread({ screenDate: ScreenDate,
    invite: { expiresAt: new Date(now + 60_000).toISOString() } });
  const barrier = deferred();
  const pending = [];
  try {
    h.runtime.readInvite = () => barrier.promise;
    const deadlineTimers = h.runtime.timers.filter(timer => !timer.canceled && timer.delay === 60_000);
    now += 60_000;
    await h.run(() => { for (const timer of deadlineTimers) pending.push(timer.fn()); });
    expectExpiredPresentation(h);
    assert.equal(h.runtime.clears.length, 0);
    assert.equal(h.runtime.transitions.length, 0);
    barrier.resolve(null);
    await h.run(() => Promise.all(pending));
    assert.ok(h.runtime.timers.some(timer => !timer.canceled && timer.delay === 4_000),
      "local hiding must retain the authoritative retry after a failed exact read");
  } finally { barrier.resolve(null); await h.unmount(); }
});

test("full screen never presents an already-expired ringing invite on initial load", async () => {
  const h = await mountFullChatThread({ invite: { expiresAt: new Date(Date.now() - 1_000).toISOString() } });
  try {
    expectExpiredPresentation(h);
    assert.equal(h.runtime.snapshot.incomingCallInvite.id, "invite");
    assert.equal(h.runtime.clears.length, 0);
    assert.equal(h.runtime.transitions.length, 0);
  } finally { await h.unmount(); }
});

test("full screen late thread read cannot restore ringing presentation after its deadline", async () => {
  let now = Date.now();
  class ScreenDate extends Date { static now() { return now; } }
  const h = await mountFullChatThread({ screenDate: ScreenDate,
    invite: { expiresAt: new Date(now + 60_000).toISOString() } });
  const barrier = deferred();
  let loading;
  try {
    h.runtime.readThread = () => barrier.promise;
    await h.run(() => { loading = h.runtime.snapshot.loadThreadState(); });
    now += 61_000;
    barrier.resolve({ ...h.runtime.thread });
    await h.run(() => loading);
    expectExpiredPresentation(h);
  } finally { barrier.resolve(null); await h.unmount(); }
});

test("full screen terminal refresh cannot revive an expired room when cleanup rejects", async () => {
  let now = Date.now();
  class ScreenDate extends Date { static now() { return now; } }
  const h = await mountFullChatThread({ screenDate: ScreenDate,
    invite: { expiresAt: new Date(now + 60_000).toISOString() } });
  try {
    await h.appState("background");
    now += 61_000;
    await h.appState("active");
    expectExpiredPresentation(h);
    h.runtime.invite = { ...h.runtime.invite, status: "missed" };
    h.runtime.clearThread = async () => { throw Error("thread cleanup unavailable"); };
    await h.run(() => h.runtime.snapshot.loadThreadState());
    assert.equal(h.runtime.snapshot.incomingCallInvite, null);
    assert.equal(h.runtime.thread.activeCommunicationRoomId, "ROOM-LEGACY");
    expectExpiredPresentation(h);
    assert.equal(h.runtime.transitions.length, 0);
  } finally { await h.unmount(); }
});

for (const replacement of ["new ringing", "accepted"]) {
  test(`full screen expiry does not suppress ${replacement} ownership or let late cleanup erase it`, async () => {
    let now = Date.now();
    class ScreenDate extends Date { static now() { return now; } }
    const h = await mountFullChatThread({ screenDate: ScreenDate,
      invite: { expiresAt: new Date(now + 60_000).toISOString() } });
    const barrier = deferred();
    let reconciliation;
    try {
      await h.appState("background");
      const expiredInvite = { ...h.runtime.invite, status: "missed" };
      const expiry = h.runtime.timers.find(timer => !timer.canceled && timer.delay === 60_000
        && timer.fn.constructor.name === "AsyncFunction");
      now += 61_000;
      h.runtime.invite = expiredInvite;
      h.runtime.clearThread = () => barrier.promise;
      await h.run(() => { reconciliation = expiry.fn(); });
      await h.appState("active");
      expectExpiredPresentation(h);
      h.runtime.invite = replacement === "accepted"
        ? { ...expiredInvite, status: "accepted" }
        : { ...expiredInvite, id: "replacement", communicationRoomId: "NEW-ROOM", status: "ringing",
          expiresAt: new Date(now + 90_000).toISOString() };
      h.runtime.thread.activeCommunicationRoomId = h.runtime.invite.communicationRoomId;
      await h.run(() => h.runtime.snapshot.loadThreadState());
      barrier.resolve({ cleared: true, reason: "ended" });
      await h.run(() => reconciliation);
      assert.equal(h.runtime.snapshot.activeCallRoomId, h.runtime.invite.communicationRoomId);
      assert.equal(h.runtime.snapshot.presentation.voiceCallDisabled, true);
      assert.equal(h.runtime.snapshot.presentation.videoCallDisabled, true);
      if (replacement === "accepted") {
        assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
        assert.equal(h.runtime.snapshot.callPanelOpen, true);
        assert.equal(h.runtime.snapshot.presentation.incomingBannerVisible, false);
      } else {
        assert.equal(h.runtime.snapshot.incomingCallInvite.id, "replacement");
        expectRingingPresentation(h);
        assert.equal(h.runtime.media.joinCalls.length, 0);
      }
      assert.equal(h.runtime.hostEnds, 0);
      assert.equal(h.runtime.transitions.length, 0);
    } finally { barrier.resolve(null); await h.unmount(); }
  });
}
