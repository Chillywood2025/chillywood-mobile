import assert from "node:assert/strict";
import test from "node:test";
import { mountFullChatThread } from "./assurance/helpers/chat-thread-full-mounted-harness.mjs";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const state = (status, viewerUserId = "local-user", otherUserId = "remote-user") => ({
  viewerUserId, otherUserId, availability: "available", status,
  isFriend: status === "active", pendingDirection: status === "pending" ? "outgoing" : null,
  canRequest: status === "none", canAccept: false, canDecline: false,
  canCancel: status === "pending", canRemove: status === "active",
});
async function mount(t, options = {}) {
  let current = state("pending");
  const reads = [];
  const queued = [];
  const mutations = [];
  const h = await mountFullChatThread({ noActiveCall: true, invite: { status: "ended" }, ...options,
    friendGraph: {
      readFriendRelationshipState: async peer => {
        reads.push(peer);
        const result = queued.length ? queued.shift() : current;
        if (result instanceof Error) throw result;
        return result;
      },
      cancelChillyCircleRequest: async peer => { mutations.push(peer); return options.mutate ? options.mutate(peer) : state("none"); },
    },
  });
  t.after(() => h.unmount());
  return Object.assign(h, { reads, queued, mutations, setState(next) { current = next; } });
}
const snapshot = h => h.runtime.snapshot;
const assertConnected = h => {
  assert.equal(snapshot(h).friendStatusSummary.pill, "In Chi'lly Circle");
  assert.equal(snapshot(h).circleControls.cancel.visible, false);
  assert.equal(snapshot(h).circleControls.remove.visible, true);
  assert.equal(snapshot(h).circleControls.remove.disabled, false);
};

test("same-peer Circle acceptance is refreshed on chat refocus", async t => {
  const h = await mount(t);
  assert.equal(snapshot(h).friendStatusSummary.pill, "Request sent");
  await h.rerender({ focused: false });
  h.setState(state("active"));
  await h.rerender({ focused: true });
  assertConnected(h);
  assert.equal(h.reads.length, 2);
});

test("foreground return refreshes Circle only while the chat is focused", async t => {
  const h = await mount(t);
  await h.appState("background");
  h.setState(state("active"));
  await h.appState("active");
  assertConnected(h);
  await h.rerender({ focused: false });
  const reads = h.reads.length;
  await h.appState("background");
  await h.appState("active");
  assert.equal(h.reads.length, reads);
});

test("opening thread actions checks Circle and disables unresolved stale actions", async t => {
  const h = await mount(t);
  const held = deferred();
  h.queued.push(held.promise);
  await h.run(() => snapshot(h).circleToggle());
  assert.equal(snapshot(h).friendLoading, true);
  assert.equal(snapshot(h).circleControls.cancel.disabled, true);
  await h.run(() => snapshot(h).handleFriendAction("cancel"));
  assert.equal(h.mutations.length, 0);
  await h.run(() => held.resolve(state("active")));
  assertConnected(h);
});

test("failed refresh never presents an actionable missing relationship", async t => {
  const h = await mount(t);
  h.queued.push(new Error("Circle unavailable"));
  await h.run(() => snapshot(h).circleToggle());
  assert.equal(snapshot(h).friendStatusSummary.pill, "Circle unavailable");
  assert.equal(Object.values(snapshot(h).circleControls).some(control => control.visible && !control.disabled), false);
  await h.run(() => snapshot(h).handleFriendAction("cancel"));
  assert.equal(h.mutations.length, 0);
  // Closing and reopening actions retries a read, without another mutation.
  await h.run(() => snapshot(h).circleToggle());
  h.setState(state("active"));
  await h.run(() => snapshot(h).circleToggle());
  assertConnected(h);
});

test("late pre-blur read cannot replace the new focus relationship", async t => {
  const h = await mount(t);
  const held = deferred();
  h.queued.push(held.promise);
  await h.run(() => snapshot(h).circleToggle());
  await h.rerender({ focused: false });
  h.setState(state("active"));
  await h.rerender({ focused: true });
  assertConnected(h);
  await h.run(() => held.resolve(state("pending")));
  assertConnected(h);
});

test("same-peer account/session replacement rejects the old held relationship", async t => {
  const h = await mount(t);
  const held = deferred();
  h.queued.push(held.promise);
  await h.run(() => snapshot(h).circleToggle());
  h.setState(state("active", "replacement-user"));
  await h.rerender({ userId: "replacement-user", sessionGeneration: "session-2" });
  assertConnected(h);
  await h.run(() => held.resolve(state("pending")));
  assert.equal(snapshot(h).friendState.viewerUserId, "replacement-user");
  assertConnected(h);
});

test("a fresh pending relationship still permits exactly one existing cancel action", async t => {
  const pending = deferred();
  const h = await mount(t, { mutate: () => pending.promise });
  await h.run(() => { snapshot(h).circleControls.cancel.onPress(); snapshot(h).circleControls.cancel.onPress(); });
  assert.equal(h.mutations.length, 1);
  await h.run(() => pending.resolve(state("none")));
  assert.equal(snapshot(h).circleControls.cancel.visible, false);
  assert.equal(snapshot(h).circleControls.request.visible, true);
});

test("a late old read cannot replace a newer read or a subsequent mutation", async t => {
  const mutation = deferred();
  const h = await mount(t, { mutate: () => mutation.promise });
  const oldRead = deferred();
  h.queued.push(oldRead.promise);
  await h.run(() => snapshot(h).circleToggle());
  await h.appState("background");
  await h.appState("active");
  await h.run(() => snapshot(h).circleControls.cancel.onPress());
  assert.equal(h.mutations.length, 1);
  await h.run(() => oldRead.resolve(state("active")));
  assert.equal(snapshot(h).friendBusy, "cancel");
  assert.equal(snapshot(h).friendState.status, "pending");
  await h.run(() => mutation.resolve(state("none")));
  assert.equal(snapshot(h).friendState.status, "none");
});

test("an old rendered action cannot cancel a newly accepted relationship", async t => {
  const h = await mount(t);
  const oldPress = snapshot(h).circleControls.cancel.onPress;
  h.setState(state("active"));
  await h.run(() => snapshot(h).circleToggle());
  await h.run(oldPress);
  assert.equal(h.mutations.length, 0);
  assertConnected(h);
});

test("same-account session renewal retires held reads and actions", async t => {
  const h = await mount(t);
  const oldAction = snapshot(h).handleFriendAction;
  const held = deferred();
  h.queued.push(held.promise);
  await h.run(() => snapshot(h).circleToggle());
  h.setState(state("active"));
  await h.rerender({ sessionGeneration: "session-2" });
  await h.run(() => oldAction("cancel"));
  await h.run(() => held.resolve(state("pending")));
  assert.equal(h.mutations.length, 0);
  assertConnected(h);
});

test("peer/thread replacement retires the old peer read", async t => {
  const h = await mount(t);
  const held = deferred();
  h.queued.push(held.promise);
  await h.run(() => snapshot(h).circleToggle());
  h.setState(state("active", "local-user", "new-peer"));
  await h.rerender({ threadId: "new-thread", thread: { threadId: "new-thread", members: [], otherMember: { userId: "new-peer", displayName: "New peer" } } });
  await h.run(() => held.resolve(state("pending")));
  assert.equal(snapshot(h).friendState.otherUserId, "new-peer");
  assertConnected(h);
});

test("retired mutation completion cannot clear the new account's relationship", async t => {
  const mutation = deferred();
  const h = await mount(t, { mutate: () => mutation.promise });
  await h.run(() => snapshot(h).circleControls.cancel.onPress());
  h.setState(state("active", "replacement-user"));
  await h.rerender({ userId: "replacement-user", sessionGeneration: "session-2" });
  assertConnected(h);
  await h.run(() => mutation.resolve(state("none")));
  assert.equal(snapshot(h).friendState.viewerUserId, "replacement-user");
  assertConnected(h);
});

test("mutation failure clears stale actions and preserves a visible retry state", async t => {
  const h = await mount(t, { mutate: async () => { throw new Error("not available"); } });
  await h.run(() => snapshot(h).handleFriendAction("cancel"));
  assert.equal(snapshot(h).friendStatusSummary.pill, "Circle unavailable");
  assert.equal(snapshot(h).friendBusy, null);
  assert.equal(Object.values(snapshot(h).circleControls).some(control => control.visible), false);
  assert.equal(h.runtime.errors.filter(error => error.alert).length, 1);
  h.setState(state("active"));
  await h.run(() => snapshot(h).circleToggle());
  assertConnected(h);
});

test("wrong-pair read result fails closed instead of exposing relationship actions", async t => {
  const h = await mount(t);
  h.setState(state("active", "different-user"));
  await h.run(() => snapshot(h).circleToggle());
  assert.equal(snapshot(h).friendStatusSummary.pill, "Circle unavailable");
  assert.equal(Object.values(snapshot(h).circleControls).some(control => control.visible), false);
});

test("mutation spanning blur and refocus cannot apply its prior-lifetime result", async t => {
  const mutation = deferred();
  const freshRead = deferred();
  const h = await mount(t, { mutate: () => mutation.promise });
  await h.run(() => snapshot(h).circleControls.cancel.onPress());
  await h.rerender({ focused: false });
  await h.rerender({ focused: true });
  h.queued.push(freshRead.promise);
  await h.run(() => mutation.resolve(state("none")));
  assert.equal(snapshot(h).friendLoading, true, "the current focus must reconcile after the old mutation settles");
  assert.equal(Object.values(snapshot(h).circleControls).some(control => control.visible && !control.disabled), false);
  await h.run(() => freshRead.resolve(state("active")));
  assertConnected(h);
});

test("mutation settled in background is refreshed on the next foreground", async t => {
  const mutation = deferred();
  const h = await mount(t, { mutate: () => mutation.promise });
  await h.run(() => snapshot(h).circleControls.cancel.onPress());
  await h.appState("background");
  await h.run(() => mutation.resolve(state("none")));
  h.setState(state("active"));
  await h.appState("active");
  assertConnected(h);
});

test("mutation spanning foreground return is reconciled even when it rejects", async t => {
  const mutation = deferred();
  const h = await mount(t, { mutate: () => mutation.promise });
  await h.run(() => snapshot(h).circleControls.cancel.onPress());
  await h.appState("background");
  await h.appState("active");
  h.setState(state("active"));
  await h.run(() => mutation.reject(new Error("old operation failed")));
  assertConnected(h);
  assert.equal(h.runtime.errors.filter(error => error.alert).length, 0, "retired operation must not alert the new foreground");
});

for (const outcome of ["success", "error"]) {
  test(`same-turn read ${outcome} retires the old action before React commits`, async t => {
    const h = await mount(t);
    const oldPress = snapshot(h).circleControls.cancel.onPress;
    const held = deferred();
    h.queued.push(held.promise);
    await h.run(async () => {
      snapshot(h).circleToggle();
      if (outcome === "success") held.resolve(state("active"));
      else held.reject(new Error("read failed"));
      // Unwind the real asynchronous reader inside the same React batch.
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      oldPress();
    });
    assert.equal(h.mutations.length, 0);
  });

  test(`same-turn mutation ${outcome} retires the old action before React commits`, async t => {
    const held = deferred();
    const h = await mount(t, { mutate: () => held.promise });
    const oldPress = snapshot(h).circleControls.cancel.onPress;
    await h.run(async () => {
      oldPress();
      if (outcome === "success") held.resolve(state("none"));
      else held.reject(new Error("mutation failed"));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      oldPress();
    });
    assert.equal(h.mutations.length, 1);
  });
}
