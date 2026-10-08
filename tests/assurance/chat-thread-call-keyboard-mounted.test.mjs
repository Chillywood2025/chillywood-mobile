import assert from "node:assert/strict";
import test from "node:test";
import { createDurableChatThreadFixture, mountFullChatThread } from "./helpers/chat-thread-full-mounted-harness.mjs";

// Execute the production screen's hooks and call handlers. Keyboard is the
// modeled native boundary; visibility and control geometry need device evidence.
for (const platform of ["ios", "android"]) {
  for (const mode of ["voice", "video"]) {
    test(`${platform} ${mode} start after messaging dismisses the keyboard and preserves an unsent draft`, async () => {
      const store = createDurableChatThreadFixture();
      const h = await mountFullChatThread({ platform, durableThread: store, noActiveCall: true, keyboardVisible: true });
      try {
        assert.equal(h.runtime.keyboard.dismissals, 0, "opening a thread must leave its composer alone");
        await h.run(() => h.runtime.snapshot.handleSend("Before the call"));
        assert.equal(store.messages.length, 1);
        assert.equal(h.runtime.keyboard.visible, true, "sending a message alone is not a call-panel transition");
        await h.run(() => h.runtime.snapshot.setDraft("Keep this draft"));
        await h.run(() => h.runtime.snapshot.handleStartCall(mode));
        assert.equal(h.runtime.snapshot.callPanelOpen, true);
        assert.equal(h.runtime.keyboard.visible, false);
        assert.equal(h.runtime.keyboard.dismissals, 1);
        assert.equal(h.runtime.snapshot.draft, "Keep this draft");
        assert.equal(store.invite.status, "ringing");
        assert.equal(h.runtime.media.localStreams.length, 0, "dismissal cannot start unaccepted media");

        await h.run(() => h.runtime.snapshot.loadThreadState());
        assert.equal(h.runtime.keyboard.dismissals, 1, "an ordinary call refresh does not repeat dismissal");
        await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
        assert.equal(h.runtime.snapshot.callPanelOpen, false);
        assert.equal(h.runtime.keyboard.dismissals, 1, "closing the panel does not dismiss again");
        assert.equal(h.runtime.snapshot.draft, "Keep this draft");
        assert.equal(store.invite.status, "canceled");
      } finally { await h.unmount(); }
    });
  }

  if (platform === "android") test("Android incoming Answer dismisses the composer keyboard", async () => {
    const h = await mountFullChatThread({ platform, keyboardVisible: true });
    try {
      assert.equal(h.runtime.snapshot.callPanelOpen, false);
      assert.equal(h.runtime.keyboard.dismissals, 0, "an incoming banner must not interrupt typing");
      await h.run(() => h.runtime.snapshot.setDraft("Reply after the call"));
      await h.run(() => h.runtime.snapshot.handleAcceptIncomingCall());
      assert.equal(h.runtime.snapshot.callPanelOpen, true);
      assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
      assert.equal(h.runtime.keyboard.visible, false);
      assert.equal(h.runtime.keyboard.dismissals, 1);
      assert.equal(h.runtime.snapshot.draft, "Reply after the call");
    } finally { await h.unmount(); }
  });

  test(`${platform} opening an existing accepted caller panel dismisses the keyboard`, async () => {
    const h = await mountFullChatThread({ platform, keyboardVisible: true,
      invite: { callerUserId: "local-user", calleeUserId: "remote-user", status: "accepted" } });
    try {
      assert.equal(h.runtime.snapshot.callPanelOpen, false);
      assert.equal(h.runtime.keyboard.dismissals, 0);
      await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
      assert.equal(h.runtime.snapshot.callPanelOpen, true);
      assert.equal(h.runtime.keyboard.visible, false);
      assert.equal(h.runtime.keyboard.dismissals, 1);
      assert.equal(h.runtime.transitions.length, 0, "opening controls does not transition the accepted invite");
    } finally { await h.unmount(); }
  });
}

test("trusted iPhone native Answer also dismisses the composer before audio activation", async () => {
  const h = await mountFullChatThread({ platform: "ios", keyboardVisible: true,
    userId: "10000000-0000-4000-8000-000000000001",
    remoteUserId: "10000000-0000-4000-8000-000000000002",
    threadId: "10000000-0000-4000-8000-000000000003",
    invite: { id: "10000000-0000-4000-8000-000000000004" },
    nativeAnswer: { callUuid: "10000000-0000-4000-8000-000000000005" } });
  try {
    assert.equal(h.runtime.snapshot.callPanelOpen, true);
    assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
    assert.equal(h.runtime.keyboard.visible, false);
    assert.equal(h.runtime.keyboard.dismissals, 1);
    assert.equal(h.runtime.media.localStreams.length, 0, "keyboard handling cannot bypass native audio activation");
  } finally { await h.unmount(); }
});
