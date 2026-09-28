import assert from "node:assert/strict";
import test from "node:test";
import { mountIosRoot, nativeIds, makeNativeEvent } from "./helpers/ios-root-thread-handoff-harness.mjs";

// Execute the production root bridge and complete production native JS facade.
// Inputs are controlled OS notification receipts, not real AVAudioSession /
// Bluetooth events. This checks navigation/presentation ownership only; actual
// device audio interruption, selected output and resumed sound remain physical.
const readPresentations = h => Array.from(h.facade.readIosNativeCallPresentations(), value => ({
  callInviteId: value.callInviteId, callUuid: value.callUuid,
}));
const expectedPresentation = callUuid => [{ callInviteId: nativeIds.invite, callUuid }];
const assertNoTerminalWork = h => {
  assert.equal(h.ends.length, 0);
  assert.equal(h.terminalSteps.length, 0);
  assert.equal(h.nativeSteps.some(step => step.name === "remoteEnd" || step.name === "terminal" || step.name === "answer"), false);
};

test("actual iOS root audio interruption receipts retain the current Answer route and presentation", async t => {
  const h = await mountIosRoot(t, { realFacade: true });
  await h.event(makeNativeEvent("incoming"));
  await h.event(makeNativeEvent("answerRequested"));
  assert.equal(h.routes.length, 1, "control: real root bridge routed one Answer before interruption");
  const route = h.routes[0];
  const watcher = h.subscriptions.get(nativeIds.invite);
  assert.equal(typeof watcher, "function");
  const observed = [];
  t.after(h.facade.subscribeToIosNativeCallEvents(event => observed.push(event)));

  for (const type of ["audioInterruptionBegan", "audioInterruptionEnded"]) {
    await h.event(makeNativeEvent(type));
    assert.deepEqual(Array.from(h.routes), [route], `${type} cannot replace/duplicate the call screen`);
    assert.deepEqual(readPresentations(h), expectedPresentation(nativeIds.uuid));
    assert.equal(h.subscriptions.get(nativeIds.invite), watcher, "the exact terminal watcher stays installed");
    assertNoTerminalWork(h);
  }
  assert.deepEqual(observed.map(event => event.type), ["audioInterruptionBegan", "audioInterruptionEnded"]);
  assert.ok(observed.every(event => event.callUuid === nativeIds.uuid && Number.isInteger(event.nativeEventGeneration)),
    "actual facade forwards the sanitized current lifecycle receipt without synthesizing terminal completion");
});

test("actual iOS root raw audio route change preserves call ownership without manufacturing a call identity", async t => {
  const h = await mountIosRoot(t, { realFacade: true });
  await h.event(makeNativeEvent("incoming"));
  const watcher = h.subscriptions.get(nativeIds.invite);
  const observed = [];
  t.after(h.facade.subscribeToIosNativeCallEvents(event => observed.push(event)));

  // The real Swift route-change observer emits a raw event with no call UUID.
  await h.event({ type: "audioRouteChanged" });
  await h.event({ type: "audioRouteChanged" });
  assert.equal(h.routes.length, 0);
  assert.deepEqual(readPresentations(h), expectedPresentation(nativeIds.uuid));
  assert.equal(h.subscriptions.get(nativeIds.invite), watcher);
  assertNoTerminalWork(h);
  assert.deepEqual(observed.map(event => event.type), ["audioRouteChanged", "audioRouteChanged"]);
  assert.ok(observed.every(event => !event.callUuid && !event.callInviteId), "route notifications do not borrow a current call identity");
});

test("actual iOS root delayed audio receipts cannot erase or navigate a replacement CallKit UUID", async t => {
  const h = await mountIosRoot(t, { realFacade: true });
  await h.event(makeNativeEvent("incoming"));
  await h.event(makeNativeEvent("recovered", { callUuid: nativeIds.replacementUuid }));
  const watcher = h.subscriptions.get(nativeIds.invite);
  assert.deepEqual(readPresentations(h), expectedPresentation(nativeIds.replacementUuid));

  for (const event of [
    makeNativeEvent("audioInterruptionBegan"),
    makeNativeEvent("audioInterruptionEnded"),
    { type: "audioRouteChanged" },
    makeNativeEvent("audioInterruptionBegan", { callUuid: nativeIds.replacementUuid }),
    makeNativeEvent("audioInterruptionEnded", { callUuid: nativeIds.replacementUuid }),
  ]) {
    await h.event(event);
    assert.deepEqual(readPresentations(h), expectedPresentation(nativeIds.replacementUuid));
    assert.equal(h.subscriptions.get(nativeIds.invite), watcher);
    assert.equal(h.routes.length, 0);
    assertNoTerminalWork(h);
  }
  await h.event(makeNativeEvent("answerRequested", { callUuid: nativeIds.replacementUuid }));
  assert.equal(h.routes.length, 1, "replacement keeps real facade readiness and root Answer routing");
  const destination = new URL(h.routes[0], "https://test.invalid");
  assert.equal(destination.pathname, `/chat/${nativeIds.thread}`);
  assert.equal(destination.searchParams.get("nativeCallUuid"), nativeIds.replacementUuid);
});

test("actual iOS root audio receipts with no active presentation do not create or terminate a call", async t => {
  const h = await mountIosRoot(t, { realFacade: true });
  for (const type of ["audioInterruptionBegan", "audioInterruptionEnded", "audioRouteChanged"]) {
    await h.event({ type });
    assert.deepEqual(readPresentations(h), []);
    assert.equal(h.subscriptions.size, 0);
    assert.equal(h.routes.length, 0);
    assertNoTerminalWork(h);
  }
  await h.event(makeNativeEvent("incoming"));
  await h.event(makeNativeEvent("answerRequested"));
  assert.equal(h.routes.length, 1, "irrelevant OS receipts do not suppress a later legitimate Answer");
  assert.deepEqual(readPresentations(h), expectedPresentation(nativeIds.uuid));
});
