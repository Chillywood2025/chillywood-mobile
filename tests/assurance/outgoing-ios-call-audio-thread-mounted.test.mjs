import assert from "node:assert/strict";
import test from "node:test";
import { mountFullChatThread } from "./helpers/chat-thread-full-mounted-harness.mjs";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const outgoing = options => mountFullChatThread({ platform: "ios", roomId: "ROOM42",
  invite: { callerUserId: "local-user", calleeUserId: "remote-user", status: "accepted", callType: "voice" },
  nativeFacade: { isIosNativeCallsRuntimeEnabled: () => true }, ...options });

test("actual caller screen waits for outgoing sound drain and native handoff before legacy capture", async () => {
  const sound = deferred(); const native = deferred();
  const h = await outgoing({ outgoingSoundDrain: () => sound.promise, outgoingAudioPrepare: () => native.promise });
  try {
    await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(h.runtime.soundClaims.length, 1);
    assert.equal(h.runtime.outgoingAudioHandoffs.length, 1);
    assert.equal(h.runtime.media.joinCalls.length, 0);
    assert.equal(h.runtime.media.localStreams.length, 0);
    await h.run(() => { sound.resolve(); });
    assert.equal(h.runtime.media.joinCalls.length, 0);
    await h.run(() => { native.resolve(); });
    assert.equal(h.runtime.media.joinCalls.length, 1);
    assert.equal(h.runtime.media.localStreams.length, 1);
    assert.equal(h.runtime.media.localStreams[0].getAudioTracks()[0].readyState, "live");
  } finally { await h.unmount(); }
});

test("actual panel End retires pending handoff before terminal RPC and late prepare cannot capture", async () => {
  const native = deferred(); const terminal = deferred();
  const h = await outgoing({ outgoingAudioPrepare: () => native.promise });
  try {
    await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(h.runtime.snapshot.callPanelOpen, true);
    h.runtime.transition = async ({ invite, status }) => {
      assert.equal(h.runtime.outgoingAudioHandoffs[0].retired, true, "retirement precedes terminal await");
      assert.equal(h.runtime.soundOwner, null);
      await terminal.promise;
      h.runtime.invite = { ...invite, status };
      h.runtime.thread.activeCommunicationRoomId = null;
      return h.runtime.invite;
    };
    await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
    assert.equal(h.runtime.transitions.length, 1);
    await h.run(() => { native.resolve(); });
    assert.equal(h.runtime.media.joinCalls.length, 0);
    assert.equal(h.runtime.media.localStreams.length, 0);
    await h.run(() => { terminal.resolve(); });
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.equal(h.runtime.outgoingAudioHandoffs.length, 1);
  } finally { terminal.resolve(); native.resolve(); await h.unmount(); }
});

test("actual panel End stops ready capture despite rejected terminal RPC and exposes a usable retry without reacquisition", async () => {
  const terminal = deferred();
  const h = await outgoing();
  try {
    await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(h.runtime.media.localStreams.length, 1);
    h.runtime.transition = async () => {
      assert.equal(h.runtime.outgoingAudioHandoffs[0].retired, true);
      await terminal.promise;
      throw Error("terminal unavailable");
    };
    await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
    for (const track of h.runtime.media.localStreams[0].getTracks()) assert.equal(track.readyState, "ended");
    await h.run(() => { terminal.resolve(); });
    assert.equal(h.runtime.snapshot.callPanelOpen, true);
    assert.match(h.runtime.snapshot.callControlError, /Try End Call again/);
    assert.equal(h.runtime.snapshot.panelBindings.showControls, true);
    assert.equal(h.runtime.snapshot.panelBindings.mediaControlsBusy, false);
    assert.equal(h.runtime.outgoingAudioHandoffs.length, 1);
    assert.equal(h.runtime.media.localStreams.length, 1);
    await h.appState("background");
    await h.appState("active");
    assert.equal(h.runtime.outgoingAudioHandoffs.length, 1, "foreground cannot undo explicit End intent");
    assert.equal(h.runtime.media.localStreams.length, 1);
    h.runtime.transition = undefined;
    await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.deepEqual(h.runtime.transitions.map(t => t.status), ["ended", "ended"]);
    assert.equal(h.runtime.outgoingAudioHandoffs.length, 1);
    assert.equal(h.runtime.media.localStreams.length, 1);
  } finally { terminal.resolve(); await h.unmount(); }
});

for (const acceptedWhileCancelPending of [true, false]) {
  test(`actual fresh-call Cancel blocks peer acceptance ${acceptedWhileCancelPending ? "during" : "after"} rejected terminal request`, async () => {
    const terminal = deferred();
    const h = await outgoing({ noActiveCall: true, invite: {
      callerUserId: "local-user", calleeUserId: "remote-user", status: "ringing", callType: "voice",
    } });
    const acceptFromSubscription = () => h.run(() => {
      h.runtime.invite = { ...h.runtime.invite, status: "accepted" };
      for (const notify of h.runtime.subscriptions) notify();
    });
    const assertNoCapture = () => {
      assert.equal(h.runtime.outgoingAudioHandoffs.length, 0);
      assert.equal(h.runtime.media.joinCalls.length, 0);
      assert.equal(h.runtime.media.localStreams.length, 0);
    };
    try {
      await h.run(() => h.runtime.snapshot.handleStartCall("voice"));
      assert.equal(h.runtime.snapshot.activeCallInvite.status, "ringing");
      assert.equal(h.runtime.snapshot.callPanelOpen, true);
      assertNoCapture();
      h.runtime.transition = async ({ status }) => {
        assert.equal(status, "canceled");
        await terminal.promise;
        throw Error("peer acceptance won the terminal request");
      };
      await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
      assert.deepEqual(h.runtime.transitions.map(t => t.status), ["canceled"]);
      if (acceptedWhileCancelPending) {
        await acceptFromSubscription();
        assertNoCapture();
      }
      await h.run(() => { terminal.resolve(); });
      if (!acceptedWhileCancelPending) await acceptFromSubscription();
      await h.flush();
      assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
      assertNoCapture();
      assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage, /Use End Call/);
      assert.equal(h.runtime.snapshot.panelBindings.showControls, true);
      assert.equal(h.runtime.snapshot.panelBindings.mediaControlsBusy, false);
      await h.appState("background");
      await h.appState("active");
      assertNoCapture();
      assert.deepEqual(h.runtime.transitions.map(t => t.status), ["canceled"], "no automatic terminal retry");
      h.runtime.transition = undefined;
      await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
      assert.deepEqual(h.runtime.transitions.map(t => t.status), ["canceled", "ended"]);
      assert.equal(h.runtime.snapshot.callPanelOpen, false);
      assertNoCapture();
    } finally { terminal.resolve(); await h.unmount(); }
  });
}
