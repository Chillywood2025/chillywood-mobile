import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { loadOwnedAndroidAudioRoute, loadWatchPartyAudioEffect, mountFullChatThread, mountOwnedAndroidAudioRoute, readAudioRouteControl } from "./helpers/chat-thread-full-mounted-harness.mjs";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// This fixture models only the native API contract. It does not claim physical
// routing, audible output, Android AudioSwitch execution, or Bluetooth proof.
function nativeAudio(options = {}) {
  const state = { owner: null, selected: "earpiece", available: ["speaker", "earpiece"], supported: true,
    calls: [], retired: new Set(), listeners: new Set(), actions: { acquire: [], read: [], select: [], release: [] }, ...options };
  const receipt = owner => ({ owner, supported: state.supported, selected: state.selected, available: [...state.available] });
  state.emitter = { addListener(event, listener) {
    assert.equal(event, "ChillywoodAndroidAudioRouteChanged");
    state.listeners.add(listener);
    return { remove: () => state.listeners.delete(listener) };
  } };
  state.emit = (value = receipt(state.owner)) => { for (const listener of state.listeners) listener(value); };
  const begin = async (kind, owner, output) => {
    state.calls.push({ kind, owner, ...(output ? { output } : {}) });
    const action = state.actions[kind].shift() ?? {};
    if (action.wait) await action.wait;
    if (action.reject) throw Error(action.reject);
    return action;
  };
  const owns = owner => {
    if (state.owner !== owner || state.retired.has(owner)) throw Error("retired or foreign native owner");
  };
  state.module = {
    async acquireOwnedAudioSession(owner, defaultOutput) {
      const action = await begin("acquire", owner, defaultOutput);
      if (state.retired.has(owner) || (state.owner && state.owner !== owner)) throw Error("native owner is unavailable");
      state.owner = owner;
      if (state.selected !== "other" && state.available.includes(defaultOutput)) state.selected = defaultOutput;
      return action.receipt ?? receipt(owner);
    },
    async readOwnedAudioRoute(owner) {
      const action = await begin("read", owner);
      if (action.lateSuccess) return receipt(owner);
      owns(owner);
      return action.receipt ?? receipt(owner);
    },
    async selectOwnedAudioOutput(owner, output) {
      const action = await begin("select", owner, output);
      // An intentionally malicious/late receipt checks the JS fence independently
      // of the normal modeled native owner check.
      if (action.lateSuccess) return { ...receipt(owner), selected: output };
      owns(owner);
      if (!state.supported || !state.available.includes(output)) throw Error("requested output is unavailable");
      if (action.receipt) return action.receipt;
      state.selected = output;
      return receipt(owner);
    },
    async releaseOwnedAudioSession(owner) {
      state.retired.add(owner);
      const action = await begin("release", owner);
      if (state.owner === owner) state.owner = null;
      return action.result ?? true;
    },
  };
  return state;
}

async function connected(t, { callType = "voice", native = nativeAudio(), ...options } = {}) {
  const h = await mountFullChatThread({ ownedAudioNativeModule: native.module, ownedAudioDeviceEventEmitter: native.emitter,
    invite: { callType, callerUserId: "local-user", calleeUserId: "remote-user", status: "accepted" }, ...options });
  t.after(() => h.unmount());
  await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
  assert.equal(h.runtime.media.joinCalls.length, 1);
  await h.run(() => {
    const peer = h.runtime.media.peers[0];
    peer.connectionState = "connected";
    peer.emit("connectionstatechange");
  });
  assert.equal(h.runtime.snapshot.callChannelState, "live");
  return { h, native };
}

const control = h => readAudioRouteControl(h.runtime.snapshot.panelBindings);
const mediaFootprint = h => {
  const media = h.runtime.media;
  return { joins: media.joinCalls.length, captures: media.mediaCreateCalls.length,
    touches: media.membershipTouches.length, leaves: h.runtime.leaves.length,
    transitions: h.runtime.transitions.length, broadcasts: media.broadcasts.length, streams: [...media.localStreams],
    trackStates: media.localStreams.flatMap(stream => stream.getTracks()).map(track => ({ track, enabled: track.enabled, readyState: track.readyState })) };
};
function assertRoute(h, native, speaker) {
  assert.equal(h.runtime.snapshot.canSetCallMediaSpeaker, true);
  const button = control(h);
  assert.ok(button, "actual route JSX must offer its supported control");
  assert.equal(typeof button.onPress, "function");
  assert.equal(button.disabled, false);
  assert.equal(button.accessibilityLabel, speaker ? "Use phone receiver" : "Use speaker");
  assert.equal(button.accessibilityState.selected, speaker);
  assert.equal(h.runtime.snapshot.panelBindings.speakerEnabled, speaker);
  assert.equal(native.selected, speaker ? "speaker" : "earpiece");
}

for (const callType of ["voice", "video"]) {
  test(`actual Android legacy ${callType} route button confirms three speaker/receiver cycles without media mutations`, async t => {
    const { h, native } = await connected(t, { callType });
    const initialSpeaker = callType === "video";
    assertRoute(h, native, initialSpeaker);
    assert.equal(native.calls.find(call => call.kind === "acquire").output, initialSpeaker ? "speaker" : "earpiece");
    assert.equal(native.calls.filter(call => call.kind === "select").length, 0,
      "the initial preference belongs to acquisition; automatic rendering cannot force a built-in output over an accessory");
    const footprint = mediaFootprint(h);
    const selections = native.calls.filter(call => call.kind === "select").length;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await h.run(() => control(h).onPress());
      assertRoute(h, native, !initialSpeaker);
      await h.run(() => control(h).onPress());
      assertRoute(h, native, initialSpeaker);
    }
    assert.equal(native.calls.filter(call => call.kind === "select").length, selections + 6);
    assert.equal(native.calls.filter(call => call.kind === "acquire").length, 1);
    assert.deepEqual(mediaFootprint(h), footprint, "route changes cannot acquire capture, touch membership, or change media tracks");
    assert.equal(h.runtime.snapshot.panelBindings.mediaControlMessage, null);
  });
}

test("native selection rejection keeps the confirmed label and manual error through unrelated renders, then permits explicit retry", async t => {
  const { h, native } = await connected(t);
  const footprint = mediaFootprint(h);
  native.actions.select.push({ reject: "AudioSwitch rejected output" });
  await h.run(() => control(h).onPress());
  assertRoute(h, native, false);
  assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage, /audio output could not be changed/i);
  const attempts = native.calls.length;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await h.run(() => h.runtime.snapshot.setDraft(`unrelated draft ${cycle}`));
    await h.run(() => h.runtime.snapshot.loadThreadState());
    await h.rerender({});
    assertRoute(h, native, false);
    assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage, /audio output could not be changed/i);
  }
  assert.equal(native.calls.length, attempts, "unrelated renders cannot retry a failed manual request automatically");
  await h.run(() => control(h).onPress());
  assertRoute(h, native, true);
  assert.equal(h.runtime.snapshot.panelBindings.mediaControlMessage, null);
  assert.deepEqual(mediaFootprint(h), footprint);
});

test("passive native readiness does not erase an unresolved manual route failure", async t => {
  const { h, native } = await connected(t);
  native.actions.select.push({ reject: "requested speaker route failed" });
  await h.run(() => control(h).onPress());
  assertRoute(h, native, false);
  await h.run(() => h.runtime.snapshot.panelBindings.onToggleMic());
  assert.equal(h.runtime.snapshot.micEnabled, false);
  assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage, /audio output could not be changed/i);
  await h.run(() => native.emit());
  assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage ?? "", /audio output could not be changed/i,
    "a valid receipt of the unchanged receiver route does not resolve a failed manual speaker request");
  await h.appState("active");
  assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage ?? "", /audio output could not be changed/i);
  await h.run(() => control(h).onPress());
  assertRoute(h, native, true);
  assert.equal(h.runtime.snapshot.panelBindings.mediaControlMessage, null);
});

for (const failure of ["acquire", "read"]) {
  test(`native ${failure} rejection hides route capability without disrupting the call`, async t => {
    const native = nativeAudio();
    native.actions[failure].push({ reject: `controlled ${failure} failure` });
    const { h } = await connected(t, { native });
    assert.equal(h.runtime.snapshot.canSetCallMediaSpeaker, false);
    assert.equal(control(h), undefined);
    assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, false);
    assert.equal(h.runtime.snapshot.callChannelState, "live");
    assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage, /audio output controls are unavailable/i);
    assert.equal(native.calls.some(call => call.kind === "select"), false);
    assert.equal(h.runtime.media.joinCalls.length, 1);
  });
}

for (const available of [["speaker"], ["speaker", "other"]]) {
  test(`hardware without an earpiece (${available.join(",")}) cannot advertise a receiver toggle`, async t => {
    const { h, native } = await connected(t, { native: nativeAudio({ available, selected: "speaker" }) });
    assert.equal(h.runtime.snapshot.canSetCallMediaSpeaker, false);
    assert.equal(control(h), undefined);
    assert.equal(native.calls.some(call => call.kind === "select"), false);
  });
}

test("an older Android bridge without owned routing keeps a connected legacy call and hides the route control", async t => {
  const { h } = await connected(t, { ownedAudioNativeModule: undefined });
  assert.equal(h.runtime.snapshot.canSetCallMediaSpeaker, false);
  assert.equal(control(h), undefined);
  assert.equal(h.runtime.snapshot.callChannelState, "live");
  assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage, /audio output controls are unavailable/i);
});

test("missing owned routing cannot block End when no native audio acquisition was possible", async t => {
  const { h } = await connected(t, { ownedAudioNativeModule: undefined });
  await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
  assert.equal(h.runtime.invite.status, "ended");
  assert.equal(h.runtime.leaves.length, 1);
  assert.equal(h.runtime.snapshot.activeCallInvite, null,
    "there is no native lease to clean when the bridge was absent before acquisition");
  assert.equal(h.runtime.snapshot.callControlError, null);
});

test("capability waits for the native read receipt and then follows its confirmed route", async t => {
  const native = nativeAudio();
  const pending = deferred();
  t.after(() => pending.resolve());
  native.actions.read.push({ wait: pending.promise });
  const { h } = await connected(t, { native });
  assert.equal(h.runtime.snapshot.canSetCallMediaSpeaker, false);
  assert.equal(control(h), undefined);
  assert.equal(h.runtime.snapshot.callChannelState, "live");
  assert.equal(native.calls.some(call => call.kind === "select"), false);
  await h.run(() => pending.resolve());
  assertRoute(h, native, false);
});

test("video acquisition preserves a selected accessory and does not issue an automatic built-in selection", async t => {
  const native = nativeAudio({ selected: "other", available: ["speaker", "earpiece", "other"] });
  const { h } = await connected(t, { native, callType: "video" });
  assert.equal(native.calls.find(call => call.kind === "acquire").output, "speaker");
  assert.equal(native.selected, "other");
  assert.equal(native.calls.some(call => call.kind === "select"), false);
  assert.equal(control(h).accessibilityLabel, "Use speaker");
  assert.equal(control(h).accessibilityState.selected, false);
  await h.run(() => control(h).onPress());
  assertRoute(h, native, true);
});

test("a foreground route read failure revokes the control until a successful native read", async t => {
  const { h, native } = await connected(t);
  native.actions.read.push({ reject: "native route state unavailable" });
  const selections = native.calls.filter(call => call.kind === "select").length;
  await h.appState("active");
  assert.equal(h.runtime.snapshot.canSetCallMediaSpeaker, false);
  assert.equal(control(h), undefined);
  assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage, /audio output controls are unavailable/i);
  assert.equal(native.calls.filter(call => call.kind === "select").length, selections);
  await h.appState("active");
  assertRoute(h, native, false);
  assert.equal(h.runtime.snapshot.panelBindings.mediaControlMessage, null);
});

test("a refreshed native route is the basis of the next actual button request", async t => {
  const { h, native } = await connected(t);
  await h.run(() => control(h).onPress());
  assertRoute(h, native, true);
  native.selected = "earpiece";
  await h.appState("active");
  assertRoute(h, native, false);
  await h.run(() => control(h).onPress());
  assert.equal(native.calls.at(-1).output, "speaker", "Use speaker must request speaker after system routing changed");
  assertRoute(h, native, true);
});

test("current native route events update the actual label and next request without a foreground transition", async t => {
  const { h, native } = await connected(t);
  assert.equal(native.listeners.size, 1);
  const footprint = mediaFootprint(h);
  await h.run(() => { native.selected = "speaker"; native.emit(); });
  assertRoute(h, native, true);
  await h.run(() => control(h).onPress());
  assertRoute(h, native, false);
  assert.equal(native.calls.at(-1).output, "earpiece");
  assert.deepEqual(mediaFootprint(h), footprint);
});

test("foreign native route events are ignored and malformed current-owner events revoke capability", async t => {
  const { h, native } = await connected(t);
  await h.run(() => native.emit({ owner: "another-owner", supported: true, selected: "speaker", available: ["speaker", "earpiece"] }));
  assertRoute(h, native, false);
  await h.run(() => native.emit({ owner: "another-owner" }));
  assertRoute(h, native, false);
  await h.run(() => native.emit({ owner: native.owner, supported: true, selected: "invented", available: ["speaker", "earpiece"] }));
  assert.equal(h.runtime.snapshot.canSetCallMediaSpeaker, false);
  assert.equal(control(h), undefined);
  assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage, /audio output controls are unavailable/i);
  await h.run(() => native.emit());
  assertRoute(h, native, false);
});

test("End removes native route observation and rejects a previously queued event from its retired owner", async t => {
  const { h, native } = await connected(t);
  const owner = native.owner;
  const queued = [...native.listeners];
  await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
  assert.equal(native.listeners.size, 0);
  await h.run(() => {
    for (const listener of queued) listener({ owner, supported: true, selected: "speaker", available: ["speaker", "earpiece"] });
  });
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, false);
  assert.equal(control(h), undefined);
  assert.equal(h.runtime.invite.status, "ended");
});

test("two taps while a native selection is pending serialize the latest intent without optimistic labels", async t => {
  const { h, native } = await connected(t);
  const pending = deferred();
  t.after(() => pending.resolve());
  native.actions.select.push({ wait: pending.promise });
  await h.run(() => control(h).onPress());
  assertRoute(h, native, false);
  await h.run(() => control(h).onPress());
  assert.equal(native.calls.filter(call => call.kind === "select").length, 1);
  assertRoute(h, native, false);
  await h.run(() => pending.resolve());
  assert.deepEqual(native.calls.filter(call => call.kind === "select").map(call => call.output), ["speaker", "earpiece"]);
  assertRoute(h, native, false);
});

test("End revokes a pending acquisition without waiting for it or acquiring media again", async t => {
  const native = nativeAudio();
  const pending = deferred();
  t.after(() => pending.resolve());
  native.actions.acquire.push({ wait: pending.promise });
  const { h } = await connected(t, { native });
  const owner = native.calls.find(call => call.kind === "acquire").owner;
  const captures = h.runtime.media.mediaCreateCalls.length;
  await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
  assert.equal(h.runtime.invite.status, "ended");
  assert.equal(h.runtime.leaves.length, 1);
  assert.ok(native.retired.has(owner));
  await h.run(() => pending.resolve());
  assert.equal(native.owner, null);
  assert.equal(control(h), undefined);
  assert.equal(h.runtime.media.mediaCreateCalls.length, captures);
});

test("owned facade requires a true release receipt and permits retry without reviving the owner", async () => {
  const native = nativeAudio();
  const { facade } = loadOwnedAndroidAudioRoute({ nativeModule: native.module });
  const lease = facade.createOwnedAudioSession();
  await lease.start();
  native.actions.release.push({ result: false });
  await assert.rejects(() => lease.stop(), /cleanup could not be confirmed/);
  await assert.rejects(() => lease.select("speaker"), /ended/);
  await lease.stop();
  assert.equal(native.calls.filter(call => call.kind === "release").length, 2);
  assert.equal(native.calls.filter(call => call.kind === "acquire").length, 1);
});

test("full End retry retains the exact native lease after all automatic release attempts fail", async t => {
  const native = nativeAudio();
  let releaseFails = true;
  native.module.releaseOwnedAudioSession = async owner => {
    native.calls.push({ kind: "release", owner });
    if (releaseFails) throw Error("native audio shutdown was not confirmed");
    if (native.owner === owner) native.owner = null;
    return true;
  };
  const { h } = await connected(t, { native });
  const owner = native.owner;
  await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
  assert.equal(native.owner, owner, "injected native failure leaves its exact resource unsettled");
  assert.ok(h.runtime.snapshot.activeCallInvite, "the failed End must retain a retry surface");
  assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage ?? "", /shutdown|cleanup/i);
  const attempts = native.calls.filter(call => call.kind === "release").length;
  releaseFails = false;
  await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
  assert.ok(native.calls.filter(call => call.kind === "release").length > attempts,
    "End retry must retry the retained lease instead of forgetting it when media became inactive");
  assert.equal(native.owner, null);
  assert.equal(h.runtime.snapshot.activeCallInvite, null);
});

test("a captured old route stop and selection cannot operate on a replacement owner", async t => {
  const native = nativeAudio();
  const boundary = loadOwnedAndroidAudioRoute({ nativeModule: native.module, deviceEventEmitter: native.emitter });
  const h = await mountOwnedAndroidAudioRoute(boundary, { identity: "old-call" });
  t.after(() => h.unmount());
  const old = h.getResult();
  const oldOwner = native.owner;
  await h.rerender({ identity: "replacement-call" });
  const newOwner = native.owner;
  assert.notEqual(newOwner, oldOwner);
  const releases = native.calls.filter(call => call.kind === "release").length;
  await h.run(() => old.stop());
  assert.equal(native.owner, newOwner);
  assert.equal(native.calls.filter(call => call.kind === "release").length, releases);
  assert.equal(await h.run(() => old.setSpeaker(true)), false);
  assert.equal(await h.run(() => h.getResult().setSpeaker(true)), true);
  assert.equal(native.owner, newOwner);
  assert.equal(native.selected, "speaker");
});

test("failed component teardown stays process-owned and blocks a successor until exact cleanup succeeds", async t => {
  const native = nativeAudio();
  let releaseFails = true;
  native.module.releaseOwnedAudioSession = async owner => {
    native.calls.push({ kind: "release", owner });
    if (releaseFails) throw Error("retired native audio still active");
    if (native.owner === owner) native.owner = null;
    return true;
  };
  const boundary = loadOwnedAndroidAudioRoute({ nativeModule: native.module, deviceEventEmitter: native.emitter });
  const first = await mountOwnedAndroidAudioRoute(boundary, { identity: "first-component" });
  const oldOwner = native.owner;
  await first.unmount();
  assert.equal(native.owner, oldOwner);
  assert.equal(native.listeners.size, 0);
  const next = await mountOwnedAndroidAudioRoute(boundary, { identity: "next-component" });
  t.after(() => next.unmount());
  assert.equal(next.getResult().canSetSpeaker, false);
  assert.equal(native.calls.filter(call => call.kind === "acquire").length, 1,
    "a failed retained stop must settle before any successor invokes native acquire");
  releaseFails = false;
  await next.rerender({ active: false });
  await next.rerender({ active: true });
  assert.equal(next.getResult().canSetSpeaker, true);
  assert.notEqual(native.owner, oldOwner);
  const newAcquireIndex = native.calls.findIndex(call => call.kind === "acquire" && call.owner !== oldOwner);
  assert.ok(newAcquireIndex > 0);
  assert.equal(native.calls[newAcquireIndex - 1].kind, "release");
  assert.equal(native.calls[newAcquireIndex - 1].owner, oldOwner);
});

for (const file of ["app/watch-party/live-stage/[partyId].tsx", "components/watch-party-live/livekit-stage-media-surface.tsx"]) {
  test(`production watch-party lease effect retains failed teardown and cannot stop a successor: ${file}`, async () => {
    const native = nativeAudio();
    const boundary = loadOwnedAndroidAudioRoute({ nativeModule: native.module });
    const errors = [];
    const enter = loadWatchPartyAudioEffect(file, boundary.facade, errors);
    const settle = async () => { for (let i = 0; i < 100; i += 1) await Promise.resolve(); };
    let stopFails = true;
    native.module.releaseOwnedAudioSession = async owner => {
      native.calls.push({ kind: "release", owner });
      if (stopFails) throw Error("watch-party native stop failed");
      if (native.owner === owner) native.owner = null;
      return true;
    };
    const leaveInactive = enter({ roomName: "inactive", participantRole: "viewer" }, false);
    leaveInactive();
    await settle();
    assert.equal(native.calls.length, 0);
    const leaveFirst = enter({ roomName: "first", participantRole: "viewer" }, true);
    await settle();
    const firstOwner = native.owner;
    assert.ok(firstOwner);
    leaveFirst();
    await settle();
    const leaveBlocked = enter({ roomName: "blocked", participantRole: "speaker" }, true);
    await settle();
    assert.equal(native.owner, firstOwner);
    assert.equal(native.calls.filter(call => call.kind === "acquire").length, 1);
    assert.ok(errors.some(error => /stop failed/.test(error.message)));
    leaveBlocked();
    await settle();
    stopFails = false;
    const leaveCurrent = enter({ roomName: "current", participantRole: "speaker" }, true);
    await settle();
    const currentOwner = native.owner;
    assert.ok(currentOwner);
    assert.notEqual(currentOwner, firstOwner);
    assert.equal(native.calls.filter(call => call.kind === "acquire").length, 2);
    leaveFirst();
    leaveBlocked();
    await settle();
    assert.equal(native.owner, currentOwner, "late old effect cleanup cannot stop the current component's native owner");
    leaveCurrent();
    await settle();
    assert.equal(native.owner, null);
  });
}

for (const receipt of [
  { owner: "foreign-owner", supported: true, selected: "speaker", available: ["speaker", "earpiece"] },
  { supported: true, selected: "earpiece", available: ["speaker", "earpiece"] },
  { supported: false, selected: "speaker", available: ["speaker", "earpiece"] },
  { supported: true, selected: "speaker", available: ["earpiece"] },
]) {
  test(`native fake success cannot set the speaker UI: ${JSON.stringify(receipt)}`, async t => {
    const { h, native } = await connected(t);
    native.actions.select.push({ receipt: { owner: native.owner, ...receipt } });
    await h.run(() => control(h).onPress());
    assertRoute(h, native, false);
    assert.match(h.runtime.snapshot.panelBindings.mediaControlMessage, /audio output could not be changed/i);
  });
}

for (const replacement of ["End", "room", "account"]) {
  test(`late native selection success after ${replacement} cannot update the retired screen owner`, async t => {
    const { h, native } = await connected(t);
    const oldOwner = native.owner;
    const pending = deferred();
    t.after(() => pending.resolve());
    native.actions.select.push({ wait: pending.promise, lateSuccess: true });
    await h.run(() => control(h).onPress());
    assert.equal(native.calls.at(-1).kind, "select");
    assertRoute(h, native, false);
    if (replacement === "End") {
      await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
    } else if (replacement === "account") {
      await h.rerender({ userId: "replacement-user", sessionGeneration: "replacement-session" });
    } else {
      await h.run(() => {
        h.runtime.invite = { ...h.runtime.invite, id: "replacement-invite", communicationRoomId: "REPLACEMENT-ROOM",
          callerUserId: "remote-user", calleeUserId: "local-user" };
        h.runtime.thread = { ...h.runtime.thread, activeCommunicationRoomId: "REPLACEMENT-ROOM" };
        return h.runtime.snapshot.loadThreadState();
      });
    }
    assert.ok(native.retired.has(oldOwner), `${replacement} must revoke the previous native owner before a held selection settles`);
    if (replacement === "room") assert.equal(h.runtime.snapshot.activeCallRoomId, "REPLACEMENT-ROOM");
    const afterReplacement = h.runtime.snapshot.nativeSpeakerEnabled;
    await h.run(() => pending.resolve());
    assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, afterReplacement, "a completed old native promise cannot publish route success");
    assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, false);
    assert.equal(native.calls.filter(call => call.kind === "acquire" && call.owner === oldOwner).length, 1);
    if (replacement === "End") {
      assert.equal(h.runtime.invite.status, "ended");
      assert.equal(h.runtime.leaves.length, 1);
      assert.equal(control(h), undefined);
    }
  });
}

test("owned facade rejects read and selection receipts that resolve after stop, without reacquiring", async () => {
  for (const kind of ["read", "select"]) {
    const native = nativeAudio();
    const { facade } = loadOwnedAndroidAudioRoute({ nativeModule: native.module });
    const lease = facade.createOwnedAudioSession();
    await lease.start();
    const pending = deferred();
    native.actions[kind].push({ wait: pending.promise, lateSuccess: true });
    const operation = kind === "read" ? lease.readRoute() : lease.select("speaker");
    const rejection = assert.rejects(operation, /ended|retired|foreign/);
    await lease.stop();
    pending.resolve();
    await rejection;
    await assert.rejects(() => lease.start(), /ended/);
    assert.equal(native.owner, null);
    assert.equal(native.calls.filter(call => call.kind === "acquire").length, 1);
  }
});

test("the mounted route oracle rejects the v8 false-capability/no-op control counterexample", async t => {
  // The v8 adapter returned exactly these three values. Apply that historical
  // behavior to the actual current adapter while retaining the full screen and
  // route hook, so the new regression oracle must fail closed.
  const source = fs.readFileSync("hooks/use-chat-call-media-session.ts", "utf8");
  const needle = "setSpeaker: legacyAudio.setSpeaker,\n    speakerEnabled: legacyAudio.speakerEnabled,\n    canSetSpeaker: legacyAudio.canSetSpeaker,";
  assert.equal(source.split(needle).length, 2);
  const adapterSource = source.replace(needle, "setSpeaker: async () => false,\n    speakerEnabled: false,\n    canSetSpeaker: false,");
  const { h, native } = await connected(t, { adapterSource });
  assert.equal(control(h), undefined);
  assert.throws(() => assertRoute(h, native, false), /false !== true/,
    "the old hidden control must not satisfy the same mounted capability assertion");
  assert.equal(native.calls.some(call => call.kind === "select"), false);
});
