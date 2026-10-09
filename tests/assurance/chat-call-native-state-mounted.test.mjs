import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as actualMediaPolicy from "../../_lib/communicationCallMediaPolicy.mjs";
import * as nativeCallErrorDiagnostics from "../../_lib/nativeCallErrorDiagnostics.mjs";
import { mountChatAnswer } from "./helpers/chat-thread-answer-mounted-harness.mjs";
import { mountFullChatThread } from "./helpers/chat-thread-full-mounted-harness.mjs";
const backgroundDeferred = () => { let resolve; const wait = new Promise(done => { resolve = done; }); return { wait, resolve }; };
const backgroundLive = (media, kind) => [...new Set(media.localStreams.flatMap(stream => stream.getTracks()))]
  .filter(track => track.kind === kind && track.readyState === 'live' && track.enabled);
async function fireBackgroundRecovery(h, start) {
  const media = h.runtime.media;
  let fired = 0;
  for (let index = start; index < media.timeoutCallbacks.length; index += 1) {
    if (media.timeoutDelays[index] !== 0 || !media.timeoutCallbacks[index]) continue;
    const callback = media.timeoutCallbacks[index]; media.timeoutCallbacks[index] = null;
    await h.run(callback); fired += 1;
  }
  await h.flush();
  return fired;
}

test('full-screen modeled successful null is preserved at its API seam', async t => {
  const h = await mountFullChatThread({ invite: { status: 'accepted' } });
  t.after(() => h.unmount());
  h.runtime.media.queueSnapshot({ outcome: 'missing' });
  assert.equal(await h.runtime.media.api.getCommunicationRoomSnapshot(h.runtime.roomId), null);
});

for (const ordering of ['before restart', 'after restart', 'explicit End', 'explicit terminal room', 'host invisible room']) {
  test(`full production wrapper background stale-read ${ordering}`, async t => {
    const h = await mountFullChatThread({ invite: { status: 'accepted',
      ...(ordering === 'host invisible room' ? { callerUserId: 'local-user', calleeUserId: 'remote-user' } : {}) },
      configureMedia: media => {
        media.ownedAdmission = true;
        const capture = media.api.createCommunicationMediaStream;
        media.api.createCommunicationMediaStream = async options => {
          const stream = await capture(options);
          for (const track of stream?.getVideoTracks() ?? []) {
            track.getSettings = () => ({ facingMode: options.facingMode ?? 'user' });
          }
          return stream;
        };
      } });
    t.after(() => h.unmount());
    if (ordering === 'host invisible room') await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    const media = h.runtime.media;
    const initialAdmission = media.membershipGeneration;
    const channel = media.readAssuranceRefs().channelRef.current;
    assert.equal(media.joinCalls.length, 1);
    assert.equal(h.runtime.snapshot.activeCallInvite?.status, 'accepted');
    assert.equal(backgroundLive(media, 'audio').length, 1);
    await h.run(() => media.emitAppState('background'));
    assert.equal(backgroundLive(media, 'audio').length, 0);
    assert.equal(backgroundLive(media, 'video').length, 0);
    const pending = backgroundDeferred();
    const existing = media.readAssuranceRefs().roomRef.current;
    media.queueSnapshot({ wait: pending.wait,
      ...(ordering === 'explicit terminal room' ? { room: { ...existing, status: 'ended' } } : { outcome: 'missing' }) });
    await h.run(() => channel.emitBroadcast('state:update', {}));
    const start = media.timeoutCallbacks.length;
    await h.run(() => media.emitAppState('active'));
    assert.ok(media.timeoutDelays.slice(start).includes(0), 'production adapter must schedule its actual foreground restart');
    if (ordering === 'after restart') await fireBackgroundRecovery(h, start);
    await h.run(() => pending.resolve());
    if (ordering !== 'explicit terminal room' && ordering !== 'host invisible room') {
      assert.equal(h.runtime.snapshot.activeCallInvite?.status, 'accepted', 'a lease-expired read cannot invoke screen global End');
      assert.equal(h.runtime.transitions.some(transition => transition.status === 'ended'), false);
    }
    if (ordering === 'explicit End') await h.run(() => h.runtime.snapshot.panelBindings.onLeave());
    if (ordering !== 'after restart') await fireBackgroundRecovery(h, start);
    if (ordering === 'explicit End' || ordering === 'explicit terminal room' || ordering === 'host invisible room') {
      assert.equal(h.runtime.invite.status, 'ended');
      assert.equal(media.joinCalls.length, 1);
      assert.equal(backgroundLive(media, 'audio').length, 0);
      assert.equal(backgroundLive(media, 'video').length, 0);
      assert.ok(h.runtime.leaves.some(leave => leave.expectedMembershipGeneration === initialAdmission));
      return;
    }
    assert.equal(media.joinCalls.length, 2);
    assert.notEqual(media.membershipGeneration, initialAdmission);
    assert.equal(backgroundLive(media, 'audio').length, 1);
    assert.equal(backgroundLive(media, 'video').length, 1);
    assert.equal(h.runtime.snapshot.activeCallInvite?.status, 'accepted');
    assert.equal(h.runtime.transitions.some(transition => transition.status === 'ended'), false);
    assert.equal(h.runtime.snapshot.panelBindings.mediaControlsBusy, false);
    const offReceipt = backgroundDeferred();
    media.queueMembership({ wait: offReceipt.wait });
    await h.run(() => h.runtime.snapshot.panelBindings.onToggleCamera());
    assert.equal(h.runtime.snapshot.panelBindings.mediaControlsBusy, true, 'actual panel shows the pending media operation');
    assert.equal(typeof h.runtime.snapshot.panelBindings.onLeave, 'function', 'End remains bound while media work is pending');
    await h.run(() => offReceipt.resolve());
    assert.equal(h.runtime.snapshot.panelBindings.mediaControlsBusy, false);
    assert.equal(backgroundLive(media, 'video').length, 0, 'actual screen camera handler reaches recovered hook');
    assert.equal(media.durableCamera, false);
    await h.run(() => h.runtime.snapshot.panelBindings.onToggleCamera());
    assert.equal(backgroundLive(media, 'video').length, 1);
    assert.equal(media.durableCamera, true);
    const oldVideo = backgroundLive(media, 'video')[0];
    await h.run(() => h.runtime.snapshot.panelBindings.onSwitchCamera());
    assert.equal(backgroundLive(media, 'video').length, 1);
    assert.notEqual(backgroundLive(media, 'video')[0], oldVideo, 'actual Flip binding replaces the captured video track');
    assert.equal(h.runtime.snapshot.panelBindings.mediaControlsBusy, false);
  });
}


// Reuse the controlled native/API seam of the established exact-hook fixture,
// but start the real hook naturally: no injected live state, identity, peers,
// or media. The actual background policy executes too. OS settings/capture are
// still controlled inputs; these cases are not installed native-device proof.
const fixturePath = new URL("./android-chat-call-mic-control.test.mjs", import.meta.url);
const require = createRequire(fixturePath);
const ts = require("typescript");
const React = require("react");
let fixture = fs.readFileSync(fixturePath, "utf8").split('test("current PR210 contract')[0];
assert.ok(fixture.includes("async function mountLegacyHook("));
fixture = fixture.replace("const require = createRequire(import.meta.url);", "");
fixture = fixture.replace("const getCameraPermission = async () => runtime.cameraPermission;", `const getCameraPermission = async () => {
  const action = runtime.cameraReadActions?.shift();
  if (action?.wait) await action.wait;
  return action?.permission ?? runtime.cameraPermission;
};`);
const seam = "  const commonJsModule = { exports: {} };";
assert.equal(fixture.split(seam).length, 2);
fixture = fixture.replace(seam, `
  Object.assign(moduleMocks["../_lib/communicationCallMediaPolicy.mjs"], actualMediaPolicy);
  runtime.microphoneReads = 0;
  moduleMocks["expo-av"].Audio.getPermissionsAsync = async () => {
    runtime.microphoneReads += 1;
    const action = runtime.microphoneReadActions?.shift();
    if (action?.wait) await action.wait;
    if (runtime.microphoneReadBarrier) await runtime.microphoneReadBarrier;
    return action?.permission ?? runtime.microphonePermission;
  };
  const capture = moduleMocks["../_lib/communication"].createCommunicationMediaStream;
  runtime.captureRequests = [];
  moduleMocks["../_lib/communication"].createCommunicationMediaStream = async options => {
    runtime.captureRequests.push({ ...options });
    const stream = await capture(options);
    for (const track of stream?.getVideoTracks() ?? []) {
      const facingMode = runtime.cameraFacingReceipt ?? options.facingMode ?? "user";
      track.getSettings = () => ({ facingMode });
      track._switchCamera = () => { throw Error("unsupported deprecated camera API must not execute"); };
      track.applyConstraints = () => { throw Error("pinned native SDK does not switch lenses through constraints"); };
    }
    return stream;
  };
  runtime.settingsOpens = 0;
  moduleMocks["react-native"].Linking.openSettings = async () => { runtime.settingsOpens += 1; };
  ${seam}`);
fixture += "\nexports.createRuntime = createLegacyMountedRuntime; exports.mount = mountLegacyHook; exports.container = createContainer; exports.createCaptureRetirementCoordinator = createCaptureRetirementCoordinator;";
const code = ts.transpileModule(fixture, { compilerOptions: {
  esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const module = { exports: {} };
vm.runInNewContext(code, { require, module, exports: module.exports, actualMediaPolicy,
  console, process, globalThis, setTimeout, clearTimeout }, { filename: fixturePath.pathname });
const { createRuntime, mount } = module.exports;
const granted = () => ({ granted: true, canAskAgain: true, status: "granted" });
const denied = () => ({ granted: false, canAskAgain: false, status: "denied" });
const live = (runtime, kind) => [...new Set(runtime.localStreams.flatMap(stream => stream.getTracks()))]
  .filter(track => track.kind === kind && track.readyState === "live" && track.enabled);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
for (const previous of [undefined, { cameraEnabled: false, micEnabled: true }, { cameraEnabled: true, micEnabled: true }]) {
  test(`legacy fresh foreground video admission retains requested capture after ${JSON.stringify(previous)}`, async t => {
    const runtime = createRuntime();
    const h = await mount(runtime, { enabled: false, roomId: "", naturalLifecycle: true,
      analyticsContext: { surface: "chat-thread" }, initialMediaPreferences: previous });
    t.after(() => h.unmount());
    await h.rerender({ roomId: runtime.roomId, initialMediaPreferences: { cameraEnabled: true, micEnabled: true } });
    await h.rerender({ enabled: true });
    assert.ok(runtime.captureRequests.some(x => x.video && x.audio), JSON.stringify(runtime.captureRequests));
    assert.equal(h.getResult().cameraEnabled, true);
  });
}
async function start(t, { video = true, backgroundAudio = false, ...options } = {}) {
  const runtime = createRuntime(options);
  if (options.initialAppState) runtime.appState = options.initialAppState;
  if (options.cameraPermission) runtime.cameraPermission = options.cameraPermission;
  const h = await mount(runtime, { enabled: true, naturalLifecycle: true,
    allowBackgroundAudio: backgroundAudio, analyticsContext: { surface: "chat-thread" },
    initialMediaPreferences: { micEnabled: true, cameraEnabled: video } });
  t.after(() => h.unmount());
  return { runtime, h };
}

test("legacy startup diagnostic boundaries distinguish requested capture, permissions, returned tracks and projection", async t => {
  const { runtime } = await start(t);
  const receipt = phase => runtime.mediaDiagnostics.find(item => item.phase === phase);
  assert.equal(receipt("initial_preferences").requestedCamera, true);
  assert.equal(receipt("initial_intent").requestedCamera, true);
  assert.equal(receipt("initial_intent").appState, "active");
  assert.equal(receipt("initial_permissions").canUseCamera, true);
  assert.equal(receipt("capture_requested").wantsCamera, true);
  assert.equal(receipt("capture_received").stream.getVideoTracks().length, 1);
  assert.equal(receipt("initial_projection").provedCamera, true);
});

for (const backgroundAudio of [false, true]) {
  test(`legacy deferred video admission preserves camera intent without claiming background capture: background audio ${backgroundAudio}`, async t => {
    const { runtime, h } = await start(t, { video: true, initialAppState: "background", backgroundAudio });
    assert.equal(live(runtime, "video").length, 0);
    assert.equal(runtime.captureRequests.some(request => request.video), false);
    assert.equal(h.getResult().cameraEnabled, false);
    assert.equal(runtime.durableCamera, false);
    await h.run(() => runtime.emitAppState("active"));
    assert.equal(h.getResult().cameraEnabled, true, JSON.stringify(runtime.captureRequests));
    assert.equal(live(runtime, "video").length, 1);
    assert.equal(runtime.durableCamera, true);
    assert.equal(runtime.joinCalls.length, 1, "foreground uses the original admitted call");
  });

  test(`legacy deferred video camera intent obeys a newer off preference: background audio ${backgroundAudio}`, async t => {
    const { runtime, h } = await start(t, { video: true, initialAppState: "background", backgroundAudio });
    await h.rerender({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
    await h.run(() => runtime.emitAppState("active"));
    assert.equal(h.getResult().cameraEnabled, false);
    assert.equal(runtime.captureRequests.some(request => request.video), false);
    assert.equal(runtime.durableCamera, false);
    assert.equal(h.getResult().micEnabled, true);
  });
}

test("legacy deferred video admission cannot acquire a denied camera", async t => {
  const { runtime, h } = await start(t, { video: true, initialAppState: "background", cameraPermission: denied() });
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(h.getResult().cameraEnabled, false);
  assert.equal(runtime.captureRequests.some(request => request.video), false);
  assert.equal(runtime.durableCamera, false);
  assert.equal(h.getResult().micEnabled, true);
});

test("legacy End retires deferred video intent before foreground", async t => {
  const { runtime, h } = await start(t, { video: true, initialAppState: "background" });
  await h.run(() => h.getResult().leaveRoom());
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(live(runtime, "video").length, 0);
  assert.equal(runtime.captureRequests.some(request => request.video), false);
  assert.equal(runtime.durableCamera, false);
});

test("legacy replacement voice room does not borrow the retired deferred video intent", async t => {
  const { runtime, h } = await start(t, { video: true, initialAppState: "background" });
  await h.run(() => h.getResult().leaveRoom());
  runtime.roomId = "REPLACEMENT-VOICE";
  await h.rerender({ roomId: runtime.roomId, initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(h.getResult().cameraEnabled, false);
  assert.equal(runtime.captureRequests.some(request => request.video), false);
  assert.equal(runtime.durableCamera, false);
});

test("legacy deferred video foreground acquisition respects a newer off preference while capture is pending", async t => {
  const { runtime, h } = await start(t, { video: true, initialAppState: "background" });
  const pending = deferred();
  runtime.queueMedia({ wait: pending.promise });
  await h.run(() => runtime.emitAppState("active"));
  assert.ok(runtime.captureRequests.some(request => request.video), "camera acquisition reached the native seam");
  await h.rerender({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
  pending.resolve();
  await h.run(async () => { for (let i = 0; i < 100; i += 1) await Promise.resolve(); });
  assert.equal(live(runtime, "video").length, 0);
  assert.equal(h.getResult().cameraEnabled, false);
  assert.equal(runtime.durableCamera, false);
  assert.equal(live(runtime, "audio").length, 1, "canceling camera recovery cannot cancel independently authorized microphone recovery");
  assert.equal(runtime.durableMic, true);
});

for (const gate of ["camera permission", "microphone permission", "capture"]) {
  for (const cancellation of ["Camera Off", "background"]) {
    test(`legacy initial video ${cancellation} during ${gate} cancels camera while preserving eligible audio`, async t => {
      const runtime = createRuntime();
      const pending = deferred();
      if (gate === "camera permission") {
        runtime.cameraPermission = { granted: false, canAskAgain: true, status: "undetermined" };
        runtime.cameraReadActions = [{ wait: pending.promise, permission: granted() }];
      } else if (gate === "microphone permission") {
        runtime.microphoneReadActions = [{ permission: granted() }, { wait: pending.promise, permission: granted() }];
      } else runtime.queueMedia({ wait: pending.promise });
      const h = await mount(runtime, { enabled: true, naturalLifecycle: true, allowBackgroundAudio: true,
        analyticsContext: { surface: "chat-thread" }, initialMediaPreferences: { cameraEnabled: true, micEnabled: true } });
      t.after(() => h.unmount());
      assert.equal(runtime.captureRequests.length, Number(gate === "capture"), "initial startup is paused at the intended asynchronous boundary");
      if (cancellation === "Camera Off") await h.rerender({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
      else await h.run(() => runtime.emitAppState("background"));
      if (gate === "camera permission") runtime.cameraPermission = granted();
      pending.resolve();
      await h.run(async () => { for (let i = 0; i < 200; i += 1) await Promise.resolve(); });
      assert.equal(live(runtime, "video").length, 0);
      assert.equal(h.getResult().cameraEnabled, false);
      assert.equal(runtime.durableCamera, false);
      assert.equal(live(runtime, "audio").length, Number(cancellation === "Camera Off"), "Camera Off preserves audio; background without an existing audio track obeys the automatic mute policy");
      assert.equal(runtime.durableMic, cancellation === "Camera Off");
      if (gate !== "capture") assert.equal(runtime.captureRequests.some(request => request.video), false, "canceled video never reaches the native capture boundary");
      else assert.equal(runtime.localStreams[0].getVideoTracks()[0].readyState, "ended");
      if (cancellation === "background") {
        await h.run(() => runtime.emitAppState("active"));
        assert.equal(live(runtime, "video").length, 1, "foreground may recover the retained camera intent");
        assert.equal(runtime.durableCamera, true);
        assert.equal(live(runtime, "audio").length, 1);
        assert.equal(runtime.durableMic, true);
      }
    });
  }
}

for (const refuseDisable of [false, true]) {
  test(`legacy initial Camera Off retains an unproved late video shutdown: disable refusal ${refuseDisable}`, async t => {
    const coordinator = module.exports.createCaptureRetirementCoordinator();
    const runtime = createRuntime({ captureRetirementCoordinator: coordinator });
    const pending = deferred();
    runtime.queueMedia({ wait: pending.promise, video: { refuseStop: true, refuseDisable } });
    const h = await mount(runtime, { enabled: true, naturalLifecycle: true,
      analyticsContext: { surface: "chat-thread" }, initialMediaPreferences: { cameraEnabled: true, micEnabled: true } });
    t.after(() => h.unmount());
    await h.rerender({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
    pending.resolve();
    await h.run(async () => { for (let i = 0; i < 200; i += 1) await Promise.resolve(); });
    const video = runtime.localStreams[0].getVideoTracks()[0];
    assert.equal(coordinator.retryRetiredCommunicationCaptures(), false, "late camera remains owned until stop is proved");
    assert.equal(runtime.channels.length, 0, "unverified initial shutdown cannot become a live call");
    assert.match(h.getResult().error, /[Ss]hutdown.*[Rr]etry End/);
    assert.equal(h.getResult().cameraEnabled, refuseDisable, "projection cannot hide a still-enabled live camera");
    await assert.rejects(() => h.run(() => h.getResult().leaveRoom()), /shutdown/);
    video.refuseStop = false;
    video.refuseDisable = false;
    await h.run(() => h.getResult().leaveRoom());
    assert.equal(video.readyState, "ended");
    assert.equal(coordinator.retryRetiredCommunicationCaptures(), true);
  });
}

test("legacy initial video cancellation cannot erase a later renewed camera preference", async t => {
  const runtime = createRuntime();
  const pending = deferred();
  runtime.queueMedia({ wait: pending.promise });
  const h = await mount(runtime, { enabled: true, naturalLifecycle: true,
    analyticsContext: { surface: "chat-thread" }, initialMediaPreferences: { cameraEnabled: true, micEnabled: true } });
  t.after(() => h.unmount());
  await h.rerender({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
  await h.rerender({ initialMediaPreferences: { cameraEnabled: true, micEnabled: true } });
  pending.resolve();
  await h.run(async () => { for (let i = 0; i < 200; i += 1) await Promise.resolve(); });
  assert.equal(runtime.captureRequests.filter(request => request.video).length, 2, "the canceled attempt cannot be recycled for the new request");
  assert.equal(live(runtime, "video").length, 1, "the newest intent receives its own eligible capture");
  assert.equal(live(runtime, "audio")[0], runtime.localStreams[0].getAudioTracks()[0]);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.durableMic, true);
});

test("legacy automatic camera recovery stops adopted video when a newer off preference arrives during sender replacement", async t => {
  const { runtime, h } = await start(t, { video: true });
  await h.run(() => runtime.emitAppState("background"));
  const sender = runtime.peers[0].getSenders().find(item => item.track?.kind === "video");
  assert.ok(sender);
  const pending = deferred();
  const replaceTrack = sender.replaceTrack.bind(sender);
  let replacing = false;
  sender.replaceTrack = async track => { replacing = true; await pending.promise; return replaceTrack(track); };
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(replacing, true);
  assert.equal(live(runtime, "video").length, 1, "capture was adopted before the pending sender receipt");
  await h.rerender({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
  assert.equal(live(runtime, "video").length, 0, "privacy stop must not wait for native sender completion");
  pending.resolve();
  await h.run(async () => { for (let i = 0; i < 100; i += 1) await Promise.resolve(); });
  assert.equal(live(runtime, "video").length, 0);
  assert.equal(h.getResult().cameraEnabled, false);
  assert.equal(runtime.durableCamera, false);
});

test("legacy background Answer retains requested microphone until the first eligible foreground", async t => {
  const { runtime, h } = await start(t, { video: false, initialAppState: "background" });
  assert.equal(live(runtime, "audio").length, 0, "background startup must not bypass OS eligibility");
  assert.equal(h.getResult().micEnabled, false, "requested intent is not capture proof");
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(h.getResult().micEnabled, true, "foreground retries the original authorized Answer intent");
  assert.equal(live(runtime, "audio").length, 1);
  assert.equal(runtime.durableMic, true);
});

test("legacy automatic foreground microphone waits for the native signaling receipt after a proved answer", async t => {
  const { runtime, h } = await start(t, { video: false, initialAppState: "background" });
  const peer = runtime.peers[0];
  const original = peer.setRemoteDescription.bind(peer);
  let delayedAnswer = null;
  peer.setRemoteDescription = async description => {
    if (description.type !== "answer") return original(description);
    // The installed SDK updates signalingState through an independent native
    // event, not in setRemoteDescription's fulfilled Promise.
    peer.remoteDescription = description;
    peer.remoteDescriptionCalls.push(description);
    delayedAnswer = description;
  };
  await h.run(() => runtime.emitAppState("active"));
  assert.ok(delayedAnswer, "the authenticated answer reached the native description boundary");
  assert.equal(h.getResult().mediaControlError, null,
    "a delayed signalingstatechange receipt is not an immediate failed microphone preparation");
  assert.equal(runtime.durableMic, false, "no unmute success before the independent native receipt");
  peer.signalingState = "stable";
  await h.run(() => peer.emit("signalingstatechange"));
  assert.equal(h.getResult().micEnabled, true);
  assert.equal(runtime.durableMic, true);
  assert.equal(live(runtime, "audio").length, 1);
});

function collideAutomaticMicOffers(runtime, { count = 1, answerBarrier, rejectAnswer = false, holdRetryAnswer = false } = {}) {
  const channel = runtime.channels.at(-1);
  const send = channel.send.bind(channel);
  const state = { offers: [], answerPending: false, restore: () => { channel.send = send; } };
  channel.send = async message => {
    if (message.event === "webrtc:answer" && message.payload.negotiationId?.startsWith("controlled-glare:")) {
      state.answerPending = true;
      if (answerBarrier) await answerBarrier;
      if (rejectAnswer) runtime.queueSend({ event: "webrtc:answer", outcome: "error" });
    }
    if (message.event !== "webrtc:offer" || !message.payload.negotiationId?.startsWith("legacy-mic:")
      || !message.payload.negotiationId.endsWith(":forward")) return send(message);
    state.offers.push(message);
    if (state.offers.length > count) {
      if (holdRetryAnswer) runtime.queueSend({ event: "webrtc:offer", answer: false });
      return send(message);
    }
    runtime.queueSend({ event: "webrtc:offer", answer: false });
    const result = await send(message);
    await channel.emitBroadcast("webrtc:offer", {
      roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId,
      negotiationId: `controlled-glare:${state.offers.length}`,
      description: { type: "offer", sdp: `concurrent-remote-offer:${state.offers.length}` },
    });
    return result;
  };
  return state;
}

test("legacy automatic foreground microphone recovers a polite glare with a new correlated offer", async t => {
  const { runtime, h } = await start(t, { video: false, initialAppState: "background" });
  const collision = collideAutomaticMicOffers(runtime);
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(h.getResult().mediaControlError, null);
  assert.equal(h.getResult().micEnabled, true);
  assert.equal(runtime.durableMic, true);
  assert.equal(live(runtime, "audio").length, 1);
  assert.equal(collision.offers.length, 2, "the replacement offer must obtain its own answer proof");
  assert.notEqual(collision.offers[0].payload.negotiationId, collision.offers[1].payload.negotiationId);
});

test("legacy glare retry rejects the interrupted offer's late answer and requires its own answer", async t => {
  const { runtime, h } = await start(t, { video: false, initialAppState: "background" });
  const collision = collideAutomaticMicOffers(runtime, { holdRetryAnswer: true });
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(collision.offers.length, 2);
  assert.equal(live(runtime, "audio").length, 0);
  assert.equal(runtime.durableMic, false);
  const answer = negotiationId => runtime.channels.at(-1).emitBroadcast("webrtc:answer", {
    roomId: runtime.roomId, targetUserId: runtime.userId, fromUserId: runtime.remoteUserId,
    negotiationId, description: { type: "answer", sdp: "authenticated-answer" },
  });
  await h.run(() => answer(collision.offers[0].payload.negotiationId));
  assert.equal(live(runtime, "audio").length, 0, "old correlation cannot enable capture");
  assert.equal(runtime.durableMic, false);
  await h.run(() => answer(collision.offers[1].payload.negotiationId));
  assert.equal(h.getResult().micEnabled, true);
  assert.equal(live(runtime, "audio").length, 1);
  assert.equal(runtime.durableMic, true);
});

for (const muted of [false, true]) {
  test(`legacy glare waits for its native stable receipt before retry: newer mute ${muted}`, async t => {
    const { runtime, h } = await start(t, { video: false, initialAppState: "background" });
    const peer = runtime.peers[0];
    const setLocal = peer.setLocalDescription.bind(peer);
    peer.setLocalDescription = async description => {
      if (description.type !== "answer") return setLocal(description);
      peer.localDescription = description;
    };
    const collision = collideAutomaticMicOffers(runtime);
    await h.run(() => runtime.emitAppState("active"));
    assert.equal(collision.offers.length, 1, "native answer completion alone cannot trigger a second offer");
    assert.equal(h.getResult().mediaControlError, null);
    assert.equal(live(runtime, "audio").length, 0);
    if (muted) await h.rerender({ initialMediaPreferences: { micEnabled: false, cameraEnabled: false } });
    peer.signalingState = "stable";
    await h.run(() => peer.emit("signalingstatechange"));
    assert.equal(collision.offers.length, muted ? 1 : 2);
    assert.equal(h.getResult().micEnabled, !muted);
    assert.equal(runtime.durableMic, !muted);
    assert.equal(live(runtime, "audio").length, muted ? 0 : 1);
  });
}

for (const failure of ["repeated glare", "answer send failure", "retry answer timeout"]) {
  test(`legacy microphone glare recovery fails closed on ${failure}`, async t => {
    const { runtime, h } = await start(t, {
      video: false, initialAppState: "background", fireOperationTimeouts: failure === "retry answer timeout",
    });
    const collision = collideAutomaticMicOffers(runtime, {
      count: failure === "repeated glare" ? 5 : 1,
      rejectAnswer: failure === "answer send failure",
      holdRetryAnswer: failure === "retry answer timeout",
    });
    await h.run(() => runtime.emitAppState("active"));
    if (failure === "retry answer timeout") await h.run(() => new Promise(resolve => setTimeout(resolve, 10)));
    assert.equal(collision.offers.length, failure === "answer send failure" ? 1 : 2,
      "only one authenticated, successfully answered glare can cause a retry");
    assert.equal(h.getResult().micEnabled, false);
    assert.equal(live(runtime, "audio").length, 0);
    assert.equal(runtime.durableMic, false);
    assert.match(h.getResult().mediaControlError, /Microphone could not start/);
    collision.restore();
    assert.equal(await h.run(() => h.getResult().setMicrophoneEnabled(true)), true,
      "bounded automatic failure leaves a later explicit retry recoverable");
    assert.equal(live(runtime, "audio").length, 1);
  });
}

for (const boundary of ["native stable receipt", "glare answer acknowledgement"]) {
  for (const cancellation of ["muted preference", "explicit Mute", "End", "room replacement", "account replacement"]) {
    test(`legacy microphone ${boundary} cannot resurrect capture after ${cancellation}`, async t => {
      const { runtime, h } = await start(t, { video: false, initialAppState: "background" });
      const peer = runtime.peers[0];
      const pending = deferred();
      let collision;
      let stablePending = false;
      if (boundary === "glare answer acknowledgement") {
        collision = collideAutomaticMicOffers(runtime, { answerBarrier: pending.promise });
      } else {
        const setRemote = peer.setRemoteDescription.bind(peer);
        peer.setRemoteDescription = async description => {
          if (description.type !== "answer" || stablePending) return setRemote(description);
          peer.remoteDescription = description;
          peer.remoteDescriptionCalls.push(description);
          stablePending = true;
        };
      }
      await h.run(() => runtime.emitAppState("active"));
      assert.ok(stablePending || collision?.answerPending, "the selected native/relay receipt is pending");
      let mute;
      const preferences = { micEnabled: false, cameraEnabled: false };
      if (cancellation === "muted preference") await h.rerender({ initialMediaPreferences: preferences });
      if (cancellation === "explicit Mute") await React.act(async () => { mute = h.getResult().setMicrophoneEnabled(false); });
      if (cancellation === "End") await h.run(() => h.getResult().leaveRoom());
      if (cancellation === "room replacement") {
        runtime.roomId = "REPLACEMENT-GLARE-ROOM";
        await h.rerender({ roomId: runtime.roomId, initialMediaPreferences: preferences });
      }
      if (cancellation === "account replacement") {
        runtime.userId = "replacement-glare-user";
        await h.rerender({ authenticatedUserId: runtime.userId, initialMediaPreferences: preferences });
      }
      assert.equal(live(runtime, "audio").length, 0, "capture remains private before old acknowledgement");
      pending.resolve();
      if (stablePending) {
        peer.signalingState = "stable";
        peer.emit("signalingstatechange");
      }
      await h.run(async () => { await mute; for (let i = 0; i < 200; i += 1) await Promise.resolve(); });
      assert.equal(h.getResult().micEnabled, false);
      assert.equal(live(runtime, "audio").length, 0);
      assert.equal(runtime.durableMic, false);
      if (collision) assert.equal(collision.offers.length, 1, "retired intent cannot send a glare retry");
    });
  }
}

test("legacy missing native stable receipt has a bounded failure and cannot publish microphone success", async t => {
  const { runtime, h } = await start(t, { video: false, initialAppState: "background", fireOperationTimeouts: true });
  const peer = runtime.peers[0];
  peer.setRemoteDescription = async description => {
    peer.remoteDescription = description;
    peer.remoteDescriptionCalls.push(description);
  };
  await h.run(() => runtime.emitAppState("active"));
  await h.run(() => new Promise(resolve => setTimeout(resolve, 10)));
  assert.equal(h.getResult().micEnabled, false);
  assert.equal(live(runtime, "audio").length, 0);
  assert.equal(runtime.durableMic, false);
  assert.match(h.getResult().mediaControlError, /Microphone could not start/);
});

test("legacy explicit mute cancels deferred background Answer microphone intent", async t => {
  const { runtime, h } = await start(t, { video: false, initialAppState: "background" });
  await h.run(() => h.getResult().setMicrophoneEnabled(false));
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(h.getResult().micEnabled, false);
  assert.equal(live(runtime, "audio").length, 0);
});

test("legacy deferred background Answer cannot acquire a denied microphone", async t => {
  const { runtime, h } = await start(t, { video: false, initialAppState: "background", microphonePermission: denied() });
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(h.getResult().micEnabled, false);
  assert.equal(live(runtime, "audio").length, 0);
  assert.equal(runtime.durableMic, false);
  assert.equal(runtime.captureRequests.some(request => request.audio), false);
});

test("legacy End retires background Answer while foreground permission read is pending", async t => {
  const { runtime, h } = await start(t, { video: false, initialAppState: "background" });
  const pending = deferred();
  runtime.microphoneReadActions = [{ wait: pending.promise, permission: granted() }];
  await h.run(() => runtime.emitAppState("active"));
  await h.run(() => h.getResult().leaveRoom());
  pending.resolve();
  await h.run(async () => { for (let i = 0; i < 100; i += 1) await Promise.resolve(); });
  assert.equal(live(runtime, "audio").length, 0, "late permission cannot restart an ended call");
  assert.equal(runtime.captureRequests.some(request => request.audio), false);
});

test("legacy deferred background Answer respects a newer muted media preference", async t => {
  const { runtime, h } = await start(t, { video: false, initialAppState: "background" });
  await h.rerender({ initialMediaPreferences: { micEnabled: false, cameraEnabled: false } });
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(h.getResult().micEnabled, false, "new muted preference retires old deferred intent");
  assert.equal(live(runtime, "audio").length, 0);
  assert.equal(runtime.durableMic, false);
});

for (const [gate, cancellation] of ["capture", "durable membership", "media broadcast acknowledgement"]
  .flatMap(gate => ["muted preference", "explicit Mute"].map(cancellation => [gate, cancellation]))) {
  test(`legacy automatic foreground unmute retires during ${gate} after ${cancellation}`, async t => {
    const { runtime, h } = await start(t, { video: false, initialAppState: "background" });
    const pending = deferred();
    let broadcastPending = false;
    if (gate === "capture") runtime.queueMedia({ wait: pending.promise });
    if (gate === "durable membership") runtime.queueMembership({ wait: pending.promise });
    if (gate === "media broadcast acknowledgement") {
      const channel = runtime.channels.at(-1);
      const send = channel.send.bind(channel);
      channel.send = async message => {
        if (message.event === "media:update" && message.payload?.micOn === true && !broadcastPending) {
          broadcastPending = true;
          await pending.promise;
        }
        return send(message);
      };
    }
    const capturesBefore = runtime.captureRequests.length;
    await h.run(() => runtime.emitAppState("active"));
    assert.ok(runtime.captureRequests.length > capturesBefore, "foreground restoration reached real hook capture");
    if (gate === "durable membership") assert.equal(runtime.membershipActions.length, 0);
    if (gate === "media broadcast acknowledgement") assert.equal(broadcastPending, true);
    let mute;
    if (cancellation === "muted preference") {
      await h.rerender({ initialMediaPreferences: { micEnabled: false, cameraEnabled: false } });
    } else {
      await React.act(async () => { mute = h.getResult().setMicrophoneEnabled(false); });
    }
    assert.equal(live(runtime, "audio").length, 0, "new mute is private before old acknowledgement settles");
    pending.resolve();
    await h.run(async () => { await mute; for (let i = 0; i < 200; i += 1) await Promise.resolve(); });
    assert.equal(h.getResult().micEnabled, false, "retired automatic unmute cannot publish success");
    assert.equal(live(runtime, "audio").length, 0, "retired acquisition cannot transmit");
    assert.equal(runtime.durableMic, false, "late durable success is compensated to the current muted preference");
    assert.equal(runtime.broadcasts.filter(message => message.event === "media:update").at(-1)?.payload.micOn, false);
    assert.equal(await h.run(() => h.getResult().setMicrophoneEnabled(true)), true,
      "a later explicit unmute owns a fresh intent and remains recoverable");
    assert.equal(live(runtime, "audio").length, 1);
  });
}

for (const gate of ["sender replacement receipt", "negotiation receipt"]) {
  test(`legacy superseded microphone preparation rolls back its ${gate}`, async t => {
    const { runtime, h } = await start(t, { video: false });
    const priorTrack = live(runtime, "audio")[0];
    priorTrack.stop();
    const pending = deferred();
    let receiptPending = false;
    const sender = runtime.peers[0].getSenders().find(sender => sender.track === priorTrack);
    if (gate === "sender replacement receipt") {
      const replaceTrack = sender.replaceTrack.bind(sender);
      sender.replaceTrack = async track => {
        await replaceTrack(track);
        if (!receiptPending) { receiptPending = true; await pending.promise; }
      };
    } else {
      const channel = runtime.channels.at(-1);
      const send = channel.send.bind(channel);
      channel.send = async message => {
        const result = await send(message);
        if (message.event === "webrtc:offer" && !receiptPending) {
          receiptPending = true;
          await pending.promise;
        }
        return result;
      };
    }
    let unmute;
    await React.act(async () => {
      unmute = h.getResult().setMicrophoneEnabled(true);
      for (let i = 0; i < 96; i += 1) await Promise.resolve();
    });
    assert.equal(receiptPending, true, "the selected native/signaling operation succeeded before its acknowledgement");
    await h.rerender({ initialMediaPreferences: { micEnabled: false, cameraEnabled: false } });
    pending.resolve();
    assert.equal(await h.run(() => unmute), false, "superseded preparation returns a controlled cancellation");
    assert.equal(sender.track, priorTrack, "rollback retains receipts for completed native mutations");
    assert.equal(live(runtime, "audio").length, 0);
    assert.equal(h.getResult().micEnabled, false);
    assert.equal(runtime.durableMic, false);
  });
}

test("legacy failed mute compensation cannot restore a newer muted preference", async t => {
  const { runtime, h } = await start(t, { video: false });
  const pending = deferred();
  runtime.queueMembership({ outcome: "null" });
  runtime.queueMembership({ wait: pending.promise });
  let mute;
  await React.act(async () => {
    mute = h.getResult().setMicrophoneEnabled(false);
    for (let i = 0; i < 96; i += 1) await Promise.resolve();
  });
  assert.equal(runtime.membershipActions.length, 0, "the compensation write reached its held acknowledgement");
  assert.equal(runtime.membershipTouches.at(-1).micEnabled, true);
  await h.rerender({ initialMediaPreferences: { micEnabled: false, cameraEnabled: false } });
  assert.equal(live(runtime, "audio").length, 0);
  pending.resolve();
  assert.equal(await h.run(() => mute), false);
  assert.equal(live(runtime, "audio").length, 0);
  assert.equal(h.getResult().micEnabled, false);
  assert.equal(runtime.durableMic, false);
  assert.equal(runtime.broadcasts.filter(message => message.event === "media:update").at(-1)?.payload.micOn, false);
});

for (const video of [false, true]) {
  test(`legacy initial ${video ? "video" : "voice"} capture cannot revive superseded microphone preferences`, async t => {
    const runtime = createRuntime();
    const pending = deferred();
    runtime.queueMedia({ wait: pending.promise });
    const h = await mount(runtime, { enabled: true, naturalLifecycle: true,
      analyticsContext: { surface: "chat-thread" },
      initialMediaPreferences: { micEnabled: true, cameraEnabled: video } });
    t.after(() => h.unmount());
    assert.equal(runtime.captureRequests.length, 1, "initial getUserMedia reached the held native boundary");
    await h.rerender({ initialMediaPreferences: { micEnabled: false, cameraEnabled: video } });
    const promotion = deferred();
    runtime.queueMembership({ wait: promotion.promise });
    pending.resolve();
    await h.run(async () => { for (let i = 0; i < 200; i += 1) await Promise.resolve(); });
    assert.equal(runtime.membershipActions.length, 0, "the initial membership promotion is pending");
    assert.equal(live(runtime, "audio").length, 0, "cancelled capture stays private before initial promotion completes");
    promotion.resolve();
    await h.run(async () => { for (let i = 0; i < 200; i += 1) await Promise.resolve(); });
    assert.equal(live(runtime, "audio").length, 0, "late initial capture cannot turn on a cancelled microphone");
    assert.equal(h.getResult().micEnabled, false);
    assert.equal(runtime.durableMic, false);
    assert.equal(live(runtime, "video").length, Number(video), "independent authorized camera capture remains usable");
  });
}

for (const producer of ["AppState", "active media stopper"]) {
  for (const gate of ["durable membership", "media broadcast acknowledgement"]) {
    test(`legacy pending ${producer} mute cannot restore intent after a newer muted preference at ${gate}`, async t => {
      const { runtime, h } = await start(t, { video: false });
      const pending = deferred();
      if (gate === "durable membership") runtime.queueMembership({ wait: pending.promise });
      let broadcastPending = false;
      if (gate === "media broadcast acknowledgement") {
        const channel = runtime.channels.at(-1);
        const send = channel.send.bind(channel);
        channel.send = async message => {
          if (message.event === "media:update" && !broadcastPending) {
            broadcastPending = true;
            await pending.promise;
          }
          return send(message);
        };
      }
      const writesBefore = runtime.membershipTouches.length;
      let stop;
      await React.act(async () => {
        if (producer === "AppState") await runtime.emitAppState("background");
        else stop = runtime.mediaSessionStopper("app_background");
        for (let i = 0; i < 96; i += 1) await Promise.resolve();
      });
      assert.ok(runtime.membershipTouches.length > writesBefore,
        "the real automatic mute must reach its awaited commit boundary");
      if (gate === "media broadcast acknowledgement") assert.equal(broadcastPending, true);
      else assert.equal(runtime.membershipActions.length, 0, "the held durable write must have started");
      assert.equal(live(runtime, "audio").length, 0, "capture has already stopped before the acknowledgement");
      await h.rerender({ initialMediaPreferences: { micEnabled: false, cameraEnabled: false } });
      pending.resolve();
      await h.run(async () => {
        await stop;
        for (let i = 0; i < 96; i += 1) await Promise.resolve();
      });
      const capturesBefore = runtime.captureRequests.length;
      if (producer === "active media stopper") await h.run(() => runtime.emitAppState("background"));
      await h.run(() => runtime.emitAppState("active"));
      assert.equal(h.getResult().micEnabled, false, "old automatic mute cannot resurrect superseded unmute intent");
      assert.equal(live(runtime, "audio").length, 0);
      assert.equal(runtime.durableMic, false);
      assert.equal(runtime.captureRequests.length, capturesBefore, "foreground must not reacquire a cancelled microphone");
    });
  }
}

test("legacy overlapping background transitions retain deferred microphone recovery until foreground", async t => {
  const { runtime, h } = await start(t, { video: false });
  const pending = deferred();
  runtime.queueMembership({ wait: pending.promise });
  await h.run(() => runtime.emitAppState("inactive"));
  assert.equal(live(runtime, "audio").length, 0);
  await h.run(() => runtime.emitAppState("background"));
  pending.resolve();
  await h.run(async () => { for (let i = 0; i < 160; i += 1) await Promise.resolve(); });
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(h.getResult().micEnabled, true);
  assert.equal(live(runtime, "audio").length, 1);
  assert.equal(runtime.durableMic, true);
});

for (const producer of ["AppState", "active media stopper"]) {
  for (const cancellation of ["explicit Mute", "End", "room replacement", "account replacement"]) {
    test(`legacy pending ${producer} mute cannot resume after ${cancellation}`, async t => {
      const { runtime, h } = await start(t, { video: false });
      const pending = deferred();
      runtime.queueMembership({ wait: pending.promise });
      let stop;
      await React.act(async () => {
        if (producer === "AppState") await runtime.emitAppState("background");
        else stop = runtime.mediaSessionStopper("app_background");
        for (let i = 0; i < 96; i += 1) await Promise.resolve();
      });
      assert.equal(runtime.membershipActions.length, 0);
      let mute;
      if (cancellation === "explicit Mute") {
        await React.act(async () => { mute = h.getResult().setMicrophoneEnabled(false); });
      } else if (cancellation === "End") {
        await h.run(() => h.getResult().leaveRoom());
      } else {
        const preferences = { micEnabled: false, cameraEnabled: false };
        if (cancellation === "room replacement") {
          runtime.roomId = "ROOM-BACKGROUND-REPLACEMENT";
          await h.rerender({ roomId: runtime.roomId, initialMediaPreferences: preferences });
        } else {
          runtime.userId = "replacement-background-user";
          await h.rerender({ authenticatedUserId: runtime.userId, initialMediaPreferences: preferences });
        }
      }
      pending.resolve();
      await h.run(async () => {
        await stop;
        await mute;
        for (let i = 0; i < 160; i += 1) await Promise.resolve();
      });
      const capturesBefore = runtime.captureRequests.length;
      if (producer === "active media stopper") await h.run(() => runtime.emitAppState("background"));
      await h.run(() => runtime.emitAppState("active"));
      assert.equal(live(runtime, "audio").length, 0);
      if (cancellation !== "End") assert.equal(h.getResult().micEnabled, false);
      assert.equal(runtime.captureRequests.length, capturesBefore);
    });
  }
}

for (const replacement of ["room", "account"]) {
  test(`legacy old active media stopper cannot quarantine the replacement ${replacement}'s microphone`, async t => {
    const { runtime, h } = await start(t, { video: false });
    const pending = deferred();
    runtime.queueMembership({ wait: pending.promise });
    let stop;
    await React.act(async () => {
      stop = runtime.mediaSessionStopper("app_background");
      for (let i = 0; i < 96; i += 1) await Promise.resolve();
    });
    assert.equal(runtime.membershipActions.length, 0);
    if (replacement === "room") {
      runtime.roomId = "ROOM-STOPPER-NEW-OWNER";
      await h.rerender({ roomId: runtime.roomId });
    } else {
      runtime.userId = "stopper-new-account-owner";
      await h.rerender({ authenticatedUserId: runtime.userId });
    }
    const replacementTrack = live(runtime, "audio")[0];
    assert.ok(replacementTrack, "the replacement call established its own microphone before the old write settled");
    pending.resolve();
    await h.run(() => stop);
    assert.equal(live(runtime, "audio").length, 1);
    assert.equal(live(runtime, "audio")[0], replacementTrack, "old failure fallback cannot stop the new owner's capture");
    assert.equal(h.getResult().micEnabled, true);
  });
}

for (const kind of ["microphone", "camera"]) {
  test(`legacy natural lifecycle: ${kind} denial, Settings grant, and explicit recovery preserve ownership`, async t => {
    const { runtime, h } = await start(t, { [kind === "microphone" ? "microphonePermission" : "cameraPermission"]: denied() });
    const mediaKind = kind === "microphone" ? "audio" : "video";
    const control = () => kind === "microphone" ? h.getResult().setMicrophoneEnabled(true) : h.getResult().toggleCamera();
    assert.equal(live(runtime, mediaKind).length, 0, "denial cannot create enabled capture");
    assert.equal(await h.run(control), false, "denied control cannot acknowledge success");
    assert.equal(h.getResult().canOpenMediaSettings, true);
    await h.run(() => h.getResult().openMediaSettings());
    assert.equal(runtime.settingsOpens, 1);
    await h.run(() => runtime.emitAppState("background"));
    runtime[kind === "microphone" ? "microphonePermission" : "cameraPermission"] = granted();
    await h.run(() => runtime.emitAppState("active"));
    if (kind === "microphone" ? !h.getResult().micEnabled : !h.getResult().cameraEnabled) {
      assert.equal(await h.run(control), true, "an explicit user retry after Settings can restore media");
    }
    assert.equal(live(runtime, mediaKind).length, 1);
    assert.equal(kind === "microphone" ? runtime.durableMic : runtime.durableCamera, true);
    assert.equal(runtime.joinCalls.length, 1, "permission recovery retains the admitted call");
    assert.equal(runtime.roomEndCalls, 0);
  });
}

for (const backgroundAudio of [false, true]) {
  for (const video of [false, true]) {
    test(`legacy natural lifecycle: ${video ? "video" : "voice"} background and foreground with background audio ${backgroundAudio}`, async t => {
      const { runtime, h } = await start(t, { video, backgroundAudio });
      assert.equal(live(runtime, "audio").length, 1);
      assert.equal(live(runtime, "video").length, Number(video));
      await h.run(() => runtime.emitAppState("background"));
      assert.equal(live(runtime, "video").length, 0, "background always stops camera capture");
      assert.equal(live(runtime, "audio").length, Number(backgroundAudio));
      assert.equal(runtime.durableCamera, false);
      assert.equal(runtime.durableMic, backgroundAudio);
      await h.run(() => runtime.emitAppState("active"));
      assert.equal(live(runtime, "audio").length, 1);
      assert.equal(live(runtime, "video").length, Number(video));
      assert.equal(runtime.durableMic, true);
      assert.equal(runtime.durableCamera, video);
      assert.equal(runtime.joinCalls.length, 1);
    });
  }
}

test("legacy natural lifecycle: camera acquisition pending at background cannot defeat the newer privacy intent", async t => {
  const { runtime, h } = await start(t, { video: false, backgroundAudio: true });
  const pending = deferred();
  runtime.queueMedia({ wait: pending.promise });
  let camera;
  await React.act(async () => { camera = h.getResult().toggleCamera(); for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  await h.run(() => runtime.emitAppState("background"));
  pending.resolve();
  assert.equal(await h.run(() => camera), false);
  assert.equal(live(runtime, "video").length, 0);
  assert.equal(runtime.durableCamera, false);
  assert.equal(live(runtime, "audio").length, 1, "eligible established audio survives camera cancellation");
});

function nativeRouteFacade(setAudioRouteAsync) {
  const imports = {
    "expo-constants": { default: { expoConfig: { extra: { runtime: { iosNativeCallsEnabled: true } } } } },
    "expo-application": {}, "react-native": { Platform: { OS: "ios" } },
    "../modules/chillywood-native-calls": { default: { setAudioRouteAsync } },
    "./accountSessionAuthority": {}, "./iosNativeCallBridgeLifecycle.mjs": {},
    "./communicationRoomIdentifier.mjs": {},
    "./livekit/bootstrap": {}, "./nativeCallTransitionProvenance.mjs": {},
    "./notifications": {}, "./supabase": {},
    "./logger": { reportRuntimeError() {} }, "./nativeCallErrorDiagnostics.mjs": nativeCallErrorDiagnostics,
  };
  const context = { exports: {}, process: { env: {} }, __DEV__: false,
    require: name => { assert.ok(imports[name], `unmodeled iOS facade import ${name}`); return imports[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("_lib/iosNativeCalls.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: false },
  }).outputText, context, { filename: "_lib/iosNativeCalls.ts" });
  return context.exports;
}

async function startFullIosVoiceCaller(t, setAudioRouteAsync) {
  const facade = nativeRouteFacade(setAudioRouteAsync);
  const h = await mountFullChatThread({ platform: "ios",
    invite: { callType: "voice", callerUserId: "local-user", calleeUserId: "remote-user", status: "accepted" },
    nativeFacade: { setIosNativeCallAudioRoute: facade.setIosNativeCallAudioRoute } });
  t.after(() => h.unmount());
  await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
  assert.equal(h.runtime.media.joinCalls.length, 1);
  await h.run(() => {
    // Deliver the native SDK connection event; do not force screen/hook refs.
    // This fixture proves application routing/error behavior, not physical audio.
    const peer = h.runtime.media.peers[0];
    peer.connectionState = "connected";
    peer.emit("connectionstatechange");
  });
  assert.equal(h.runtime.snapshot.callChannelState, "live");
  return h;
}

test("full legacy iOS screen retains native route rejection after mic cycles and permits explicit retry", async t => {
  const commands = [];
  let speakerFailures = 1;
  const h = await startFullIosVoiceCaller(t, async route => {
    commands.push(route);
    if (route === "speaker" && speakerFailures-- > 0) throw Error("controlled OS route rejection");
  });
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await h.run(() => h.runtime.snapshot.handleToggleCallMic());
    assert.equal(h.runtime.snapshot.micEnabled, false);
    await h.run(() => h.runtime.snapshot.handleToggleCallMic());
    assert.equal(h.runtime.snapshot.micEnabled, true);
  }
  await h.run(() => h.runtime.snapshot.handleToggleNativeAudioRoute());
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, false);
  assert.match(h.runtime.snapshot.callControlError ?? "", /audio output could not be changed/,
    "a successful automatic receiver fallback must not erase a rejected manual speaker request");
  assert.match(h.runtime.snapshot.error ?? "", /audio output could not be changed/);
  await h.run(() => h.runtime.snapshot.handleToggleNativeAudioRoute());
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, true);
  assert.equal(h.runtime.snapshot.callControlError, null);
  assert.deepEqual(commands, ["receiver", "speaker", "speaker"],
    "unrelated screen renders must not issue process-wide native route mutations");
});

test("full legacy iOS screen preserves manual speaker intent across unrelated state and media renders", async t => {
  const commands = [];
  const h = await startFullIosVoiceCaller(t, async route => { commands.push(route); });
  await h.run(() => h.runtime.snapshot.handleToggleNativeAudioRoute());
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, true);
  await h.run(() => h.runtime.snapshot.setDraft("an unrelated local draft"));
  await h.run(() => h.runtime.snapshot.handleToggleCallMic());
  await h.run(() => h.runtime.snapshot.handleToggleCallMic());
  await h.run(() => h.runtime.snapshot.loadThreadState());
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, true);
  assert.deepEqual(commands, ["receiver", "speaker"]);
  await h.run(() => h.runtime.snapshot.handleToggleNativeAudioRoute());
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, false);
  assert.deepEqual(commands, ["receiver", "speaker", "receiver"]);
});

test("full legacy iOS screen does not supersede an issued manual route on unrelated renders", async t => {
  const commands = [];
  const issued = deferred();
  const h = await startFullIosVoiceCaller(t, async route => {
    commands.push(route);
    if (route === "speaker") await issued.promise;
  });
  let operation;
  await h.run(() => { operation = h.runtime.snapshot.handleToggleNativeAudioRoute(); });
  assert.deepEqual(commands, ["receiver", "speaker"]);
  await h.run(() => h.runtime.snapshot.setDraft("still unrelated while native routing is pending"));
  await h.run(() => h.runtime.snapshot.loadThreadState());
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, false, "requested intent is not a native completion");
  await h.run(async () => { issued.resolve(); await operation; });
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, true);
  assert.deepEqual(commands, ["receiver", "speaker"]);
});

test("legacy iOS screen routes through actual JS native facade and permits retry after native rejection", async t => {
  const commands = [];
  const facade = nativeRouteFacade(async route => {
    commands.push(route);
    if (commands.length === 1) throw Error("OS route failed");
  });
  const h = await mountChatAnswer({ controlsMode: true, platform: "ios", callMediaProvider: "legacy_webrtc",
    setNativeRoute: facade.setIosNativeCallAudioRoute });
  t.after(() => h.unmount());
  await h.act(() => h.runtime.snapshot.handleToggleNativeAudioRoute());
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, false);
  await h.act(() => h.runtime.snapshot.handleToggleNativeAudioRoute());
  assert.deepEqual(commands, ["speaker", "speaker"]);
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, true);
});

test("legacy iOS screen and actual JS native facade restore current route after a retired issued command", async t => {
  const commands = [];
  const issued = deferred();
  const facade = nativeRouteFacade(async route => {
    commands.push(route);
    if (commands.length === 1) await issued.promise;
  });
  const h = await mountChatAnswer({ controlsMode: true, platform: "ios", callMediaProvider: "legacy_webrtc",
    setNativeRoute: facade.setIosNativeCallAudioRoute });
  t.after(() => h.unmount());
  let prior;
  await h.act(async () => { prior = h.runtime.snapshot.handleToggleNativeAudioRoute(); });
  assert.deepEqual(commands, ["speaker"]);
  await h.rerender({ invite: { ...h.runtime.invite, id: "replacement", status: "accepted" }, callChannelState: "live" });
  await h.act(async () => { issued.resolve(); await prior; });
  await h.flush();
  assert.deepEqual(commands, ["speaker", "receiver"]);
  assert.equal(h.runtime.snapshot.nativeSpeakerEnabled, false);
});

async function beginFlip(h) {
  let operation;
  await React.act(async () => {
    operation = h.getResult().switchCamera();
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
  });
  return { operation };
}

test("legacy supported camera flip reacquires video only and replaces senders while preserving microphone and call", async t => {
  const { runtime, h } = await start(t);
  const microphone = live(runtime, "audio")[0];
  const initialVideo = live(runtime, "video")[0];
  const initialPeers = [...runtime.peers];
  const initialCommits = runtime.membershipTouches.length;
  const initialOffers = runtime.peers.map(peer => peer.offerCalls);
  for (const facingMode of ["environment", "user"]) {
    assert.equal(await h.run(() => h.getResult().switchCamera()), true);
    const track = live(runtime, "video")[0];
    assert.equal(track.getSettings().facingMode, facingMode);
    assert.equal(live(runtime, "video").length, 1);
    for (const peer of initialPeers) assert.equal(peer.getSenders().find(sender => sender.track?.kind === "video").track, track);
    assert.equal(live(runtime, "audio")[0], microphone);
    assert.equal(runtime.durableCamera, true);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.captureRequests.slice(-2))), [
    { audio: false, video: true, facingMode: "environment" },
    { audio: false, video: true, facingMode: "user" },
  ]);
  assert.equal(initialVideo.readyState, "ended");
  assert.equal(runtime.peers.length, initialPeers.length);
  initialPeers.forEach((peer, index) => assert.equal(runtime.peers[index], peer));
  assert.deepEqual(Array.from(runtime.peers, peer => peer.offerCalls), Array.from(initialOffers), "same-kind sender replacement requires no new offer");
  assert.equal(runtime.membershipTouches.length, initialCommits);
  assert.equal(runtime.joinCalls.length, 1);
});

test("legacy supported camera flip waits for capture and serializes two requested lens transitions", async t => {
  const { runtime, h } = await start(t);
  const pending = deferred();
  runtime.queueMedia({ wait: pending.promise });
  let first, second, firstDone = false;
  await React.act(async () => {
    first = h.getResult().switchCamera(); first.then(() => { firstDone = true; });
    second = h.getResult().switchCamera();
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
  });
  assert.equal(firstDone, false);
  assert.equal(runtime.captureRequests.at(-1).facingMode, "environment");
  pending.resolve();
  assert.equal(await h.run(() => first), true);
  assert.equal(await h.run(() => second), true);
  assert.equal(live(runtime, "video")[0].getSettings().facingMode, "user");
});

for (const failure of ["capture-rejected", "wrong-facing", "sender-rejected", "sender-swallowed", "second-sender-rejected"]) {
  test(`legacy supported camera flip fails truthfully and remains retryable after ${failure}`, async t => {
    const { runtime, h } = await start(t);
    const microphone = live(runtime, "audio")[0];
    if (failure === "capture-rejected") runtime.queueMedia({ outcome: "reject" });
    if (failure === "wrong-facing") runtime.cameraFacingReceipt = "user";
    const sender = runtime.peers[0].getSenders().find(item => item.track?.kind === "video");
    const replace = sender.replaceTrack;
    if (failure === "sender-rejected") sender.replaceTrack = async () => { throw Error("native sender failed"); };
    if (failure === "sender-swallowed") sender.replaceTrack = async () => undefined;
    if (failure === "second-sender-rejected") {
      const secondPeer = runtime.createPeer();
      const track = live(runtime, "video")[0];
      const secondSender = secondPeer.addTrack(track, h.refs.localStreamRef.current);
      secondSender.replaceTrack = async () => { throw Error("second native sender failed"); };
      h.refs.peerConnectionsRef.current["second-peer"] = secondPeer;
    }
    assert.equal(await h.run(() => h.getResult().switchCamera()), false);
    assert.equal(live(runtime, "video").length, 0);
    assert.equal(h.getResult().cameraEnabled, false);
    assert.equal(runtime.durableCamera, false);
    assert.equal(live(runtime, "audio")[0], microphone);
    assert.equal(runtime.roomEndCalls, 0);
    assert.match(h.getResult().mediaControlError, /Camera.*try again/i);
    sender.replaceTrack = replace;
    runtime.cameraFacingReceipt = undefined;
    delete h.refs.peerConnectionsRef.current["second-peer"];
    assert.equal(await h.run(() => h.getResult().toggleCamera()), true);
    assert.equal(live(runtime, "video").length, 1);
    assert.equal(runtime.durableCamera, true);
  });
}

for (const retirement of ["End", "room replacement", "account replacement", "background"]) {
  test(`legacy supported camera flip cannot retain late capture after ${retirement}`, async t => {
    const { runtime, h } = await start(t, { backgroundAudio: true });
    const pending = deferred();
    runtime.queueMedia({ wait: pending.promise });
    const { operation } = await beginFlip(h);
    if (retirement === "End") await assert.rejects(() => h.run(() => h.getResult().leaveRoom()), /shutdown/);
    if (retirement === "room replacement") {
      runtime.roomId = "ROOM-FLIP-REPLACEMENT";
      await h.rerender({ roomId: runtime.roomId });
    }
    if (retirement === "account replacement") {
      runtime.userId = "replacement-user";
      await h.rerender({ authenticatedUserId: runtime.userId });
    }
    if (retirement === "background") await h.run(() => runtime.emitAppState("background"));
    const tracksBefore = new Set(live(runtime, "video"));
    pending.resolve();
    assert.equal(await h.run(() => operation), false);
    if (retirement === "End") await h.run(() => h.getResult().leaveRoom());
    for (const track of live(runtime, "video")) assert.ok(tracksBefore.has(track), "late capture cannot survive into a newer owner or background");
    assert.equal(runtime.roomEndCalls, 0);
    if (retirement === "background") {
      await h.run(() => runtime.emitAppState("active"));
      assert.equal(live(runtime, "video").length, 1, "background cancellation retains the latest foreground camera intent");
      assert.equal(runtime.durableCamera, true);
    }
  });
}

test("legacy supported camera flip validates sender ownership again after pending native replacement", async t => {
  const { runtime, h } = await start(t);
  const sender = runtime.peers[0].getSenders().find(item => item.track?.kind === "video");
  const pending = deferred();
  const original = sender.replaceTrack;
  sender.replaceTrack = async track => { await pending.promise; return original(track); };
  const { operation } = await beginFlip(h);
  await h.run(() => h.getResult().leaveRoom());
  pending.resolve();
  assert.equal(await h.run(() => operation), false);
  assert.equal(live(runtime, "video").length, 0);
  assert.equal(sender.track.readyState, "ended", "even a late old sender acknowledgement cannot retain capture");
});

test("legacy supported camera flip rejects disabled or ended capture without acquisition", async t => {
  const { runtime, h } = await start(t);
  const track = live(runtime, "video")[0];
  const captures = runtime.captureRequests.length;
  track.enabled = false;
  assert.equal(await h.run(() => h.getResult().switchCamera()), false);
  track.enabled = true; track.stop();
  assert.equal(await h.run(() => h.getResult().switchCamera()), false);
  assert.equal(runtime.captureRequests.length, captures);
});

test("legacy old issued sender command cannot block a fresh call media queue or clear its busy state", async t => {
  const { runtime, h } = await start(t);
  const oldNative = deferred();
  const sender = runtime.peers[0].getSenders().find(item => item.track?.kind === "video");
  const originalReplace = sender.replaceTrack;
  sender.replaceTrack = async track => { await oldNative.promise; return originalReplace(track); };
  const { operation: oldFlip } = await beginFlip(h);
  await h.run(() => h.getResult().leaveRoom());
  runtime.roomId = "ROOM-QUEUE-REPLACEMENT";
  await h.rerender({ roomId: runtime.roomId });
  const writesBefore = runtime.membershipTouches.length;
  const newWrite = deferred();
  runtime.queueMembership({ wait: newWrite.promise });
  let freshMute;
  await React.act(async () => {
    freshMute = h.getResult().setMicrophoneEnabled(false);
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
  });
  const newWriteStartedWhileOldPending = runtime.membershipTouches.length > writesBefore;
  const busyBeforeOldSettles = h.getResult().mediaControlsBusy;
  oldNative.resolve();
  assert.equal(await h.run(() => oldFlip), false);
  const busyAfterOldSettles = h.getResult().mediaControlsBusy;
  newWrite.resolve();
  assert.equal(await h.run(() => freshMute), true);
  assert.equal(newWriteStartedWhileOldPending, true);
  assert.equal(busyBeforeOldSettles, true);
  assert.equal(busyAfterOldSettles, true, "old finally cannot clear the new owner's active control count");
  assert.equal(h.getResult().mediaControlsBusy, false);
});

test("actual legacy adapter and screen capability expression do not promise Android app speaker selection", async () => {
  const compile = (file, imports = {}) => {
    const context = { exports: {}, require: name => {
      assert.ok(imports[name], `unmodeled adapter import ${name}`); return imports[name];
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    } }).outputText, context, { filename: file });
    return context.exports;
  };
  const runtime = createRuntime();
  const adapter = compile("hooks/use-chat-call-media-session.ts", {
    react: React,
    "../_lib/chatCallMediaProviderPolicy": compile("_lib/chatCallMediaProviderPolicy.ts"),
    "./use-communication-room-session": { useCommunicationRoomSession: runtime.useHook },
    "./use-livekit-chat-call-session": { useLiveKitChatCallSession: () => ({}) },
  });
  const root = require("react-dom/client").createRoot(module.exports.container());
  let current;
  function Probe() {
    current = adapter.useChatCallMediaSession({ enabled: false, authenticatedAccessToken: "test",
      authenticatedUserId: runtime.userId, roomId: runtime.roomId, threadId: "thread",
      invite: { id: "invite", mediaProvider: "legacy_webrtc" } });
    return null;
  }
  try {
    await React.act(async () => { root.render(React.createElement(Probe)); });
    assert.equal(current.mediaProvider, "legacy_webrtc");
    assert.equal(current.canSetSpeaker, false);
    assert.equal(await current.setSpeaker(true), false);
    const file = "app/chat/[threadId].tsx";
    const source = fs.readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const attributes = [];
    const visit = node => {
      if (ts.isJsxAttribute(node) && node.name.getText(ast) === "onToggleAudioRoute") attributes.push(node);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.equal(attributes.length, 1);
    const expression = attributes[0].initializer.expression.getText(ast);
    const context = { Platform: { OS: "android" }, canSetCallMediaSpeaker: current.canSetSpeaker,
      handleToggleNativeAudioRoute: () => { throw Error("unsupported route must not be offered"); } };
    assert.equal(vm.runInNewContext(expression, context), undefined);
    context.Platform.OS = "ios";
    assert.equal(typeof vm.runInNewContext(expression, context), "function", "iOS retains its separate native route surface");
  } finally { await React.act(async () => root.unmount()); }
});

for (const backgroundAudio of [false, true]) {
  for (const gate of ["permission", "capture"]) {
    for (const order of ["background-before", "background-during", "foreground-before-settle"]) {
      test(`legacy microphone lifecycle ordering: background audio ${backgroundAudio}, ${gate}, ${order}`, async t => {
        const { runtime, h } = await start(t, { backgroundAudio });
        for (const track of live(runtime, "audio")) track.stop();
        if (order === "background-before") await h.run(() => runtime.emitAppState("background"));
        const pending = deferred();
        if (gate === "permission") runtime.microphoneReadBarrier = pending.promise;
        else runtime.queueMedia({ wait: pending.promise });
        const reads = runtime.microphoneReads;
        const acquisitions = runtime.mediaCreateCalls.length;
        let recovery;
        await React.act(async () => {
          recovery = h.getResult().setMicrophoneEnabled(true);
          for (let i = 0; i < 40; i += 1) await Promise.resolve();
        });
        if (order !== "background-before") {
          assert.ok(gate === "permission" ? runtime.microphoneReads > reads : runtime.mediaCreateCalls.length > acquisitions,
            "the production recovery must reach the selected awaited boundary");
          await h.run(() => runtime.emitAppState("background"));
          assert.equal(live(runtime, "video").length, 0, "camera privacy cannot wait for microphone recovery");
          if (order === "foreground-before-settle") await h.run(() => runtime.emitAppState("active"));
        }
        runtime.microphoneReadBarrier = null;
        pending.resolve();
        await h.run(() => recovery);
        await h.run(() => Promise.resolve());
        const foreground = order === "foreground-before-settle";
        assert.equal(live(runtime, "video").length, Number(foreground), "latest AppState owns camera restoration");
        assert.equal(runtime.durableCamera, foreground);
        // An already-ended track cannot be preserved by the background event;
        // that event's queued mute wins until a later foreground request.
        const expectedAudio = foreground || (backgroundAudio && order === "background-before");
        assert.equal(live(runtime, "audio").length, Number(expectedAudio), "audio follows the latest foreground or eligible background request");
        assert.equal(runtime.durableMic, expectedAudio);
        assert.equal(runtime.roomEndCalls, 0);
      });
    }
  }
}


test("legacy foreground permission restoration rereads after a newer Settings return instead of applying stale denial", async t => {
  const { runtime, h } = await start(t, { backgroundAudio: true });
  await h.run(() => runtime.emitAppState("background"));
  const pending = deferred();
  runtime.microphoneReadActions = [{ wait: pending.promise, permission: denied() }];
  await h.run(() => runtime.emitAppState("active"));
  await h.run(() => runtime.emitAppState("background"));
  runtime.microphonePermission = granted();
  await h.run(() => runtime.emitAppState("active"));
  pending.resolve();
  await h.run(async () => { for (let i = 0; i < 100; i += 1) await Promise.resolve(); });
  assert.equal(live(runtime, "audio").length, 1);
  assert.equal(live(runtime, "video").length, 1);
  assert.equal(runtime.durableMic, true);
  assert.equal(runtime.durableCamera, true);
});

test("legacy foreground restoration cannot undo an explicit mute made while permission read is pending", async t => {
  const { runtime, h } = await start(t, { backgroundAudio: true });
  await h.run(() => runtime.emitAppState("background"));
  const pending = deferred();
  runtime.microphoneReadActions = [{ wait: pending.promise, permission: granted() }];
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(await h.run(() => h.getResult().setMicrophoneEnabled(false)), true);
  pending.resolve();
  await h.run(async () => { for (let i = 0; i < 100; i += 1) await Promise.resolve(); });
  assert.equal(live(runtime, "audio").length, 0);
  assert.equal(runtime.durableMic, false);
  assert.equal(h.getResult().micEnabled, false);
});

test("legacy flip retains late unproved capture for explicit End retry when its original peer has retired", async t => {
  const { runtime, h } = await start(t);
  const pending = deferred();
  runtime.queueMedia({ wait: pending.promise, video: { refuseStop: true } });
  const { operation } = await beginFlip(h);
  runtime.peers[0].connectionState = "closed";
  pending.resolve();
  assert.equal(await h.run(() => operation), false);
  const retained = runtime.localStreams.flatMap(stream => stream.getVideoTracks()).find(track => track.refuseStop);
  assert.ok(retained);
  assert.equal(retained.readyState, "live");
  await assert.rejects(() => h.run(() => h.getResult().leaveRoom()));
  retained.refuseStop = false;
  await h.run(() => h.getResult().leaveRoom());
  assert.equal(retained.readyState, "ended", "explicit End still owns the failed late disposal");
});


test("legacy camera retry cannot acknowledge SDK-swallowed sender replacement failure", async t => {
  const { runtime, h } = await start(t);
  runtime.queueMedia({ outcome: "reject" });
  assert.equal(await h.run(() => h.getResult().switchCamera()), false);
  const sender = runtime.peers[0].getSenders().find(item => item.track?.kind === "video");
  sender.replaceTrack = async () => undefined;
  assert.equal(await h.run(() => h.getResult().toggleCamera()), false);
  assert.equal(live(runtime, "video").length, 0);
  assert.equal(runtime.durableCamera, false);
});

test("legacy foreground camera restore cannot acknowledge SDK-swallowed sender replacement failure", async t => {
  const { runtime, h } = await start(t, { backgroundAudio: true });
  const microphone = live(runtime, "audio")[0];
  await h.run(() => runtime.emitAppState("background"));
  const sender = runtime.peers[0].getSenders().find(item => item.track?.kind === "video");
  sender.replaceTrack = async () => undefined;
  await h.run(() => runtime.emitAppState("active"));
  assert.equal(live(runtime, "video").length, 0);
  assert.equal(runtime.durableCamera, false);
  assert.equal(h.getResult().cameraEnabled, false);
  assert.equal(live(runtime, "audio")[0], microphone);
});


for (const gate of ["camera acquisition", "microphone permission prompt"]) {
  test(`legacy foreground restoration preserves a newer explicit mute during ${gate}`, async t => {
    const { runtime, h } = await start(t, { backgroundAudio: true });
    await h.run(() => runtime.emitAppState("background"));
    const pending = deferred();
    if (gate === "camera acquisition") runtime.queueMedia({ wait: pending.promise });
    else {
      runtime.microphonePermission = { status: "undetermined", granted: false, canAskAgain: true };
      runtime.permissionActions.push({ wait: pending.promise, permission: granted() });
    }
    const capturesBefore = runtime.mediaCreateCalls.length;
    const promptsBefore = runtime.permissionRequestCalls;
    await h.run(() => runtime.emitAppState("active"));
    if (gate === "camera acquisition") assert.ok(runtime.mediaCreateCalls.length > capturesBefore);
    else assert.ok(runtime.permissionRequestCalls > promptsBefore);
    assert.equal(await h.run(() => h.getResult().setMicrophoneEnabled(false)), true);
    pending.resolve();
    await h.run(async () => { for (let i = 0; i < 100; i += 1) await Promise.resolve(); });
    assert.equal(live(runtime, "audio").length, 0);
    assert.equal(runtime.durableMic, false);
    assert.equal(h.getResult().micEnabled, false);
  });
}


for (const outcome of ["late success", "late rejection", "failed stop then retry"]) {
  for (const replacement of ["room", "account"]) {
    test(`process-owned capture retirement: ${outcome} across full hook unmount and ${replacement} replacement`, async t => {
      const coordinator = module.exports.createCaptureRetirementCoordinator();
      const { runtime, h } = await start(t, { captureRetirementCoordinator: coordinator });
      const pending = deferred();
      runtime.queueMedia({ wait: pending.promise,
        ...(outcome === "late rejection" ? { outcome: "reject" } : {}),
        ...(outcome === "failed stop then retry" ? { video: { refuseStop: true } } : {}) });
      const { operation } = await beginFlip(h);
      await assert.rejects(() => h.run(() => h.getResult().leaveRoom()), /shutdown/,
        "End cannot claim completion while the native acquisition result is unknown");
      await h.unmount();
      const nextRuntime = createRuntime({ captureRetirementCoordinator: coordinator });
      if (replacement === "room") nextRuntime.roomId = "NEW-ROOM-AFTER-REMOUNT";
      else nextRuntime.userId = "new-account-after-remount";
      const next = await mount(nextRuntime, { enabled: true, naturalLifecycle: true,
        authenticatedUserId: nextRuntime.userId,
        analyticsContext: { surface: "chat-thread" }, initialMediaPreferences: { micEnabled: true, cameraEnabled: true } });
      t.after(() => next.unmount());
      assert.equal(nextRuntime.joinCalls.length, 0, "new owner cannot outrun retired unknown capture");
      assert.equal(nextRuntime.mediaCreateCalls.length, 0);
      pending.resolve();
      assert.equal(await h.run(() => operation), false);
      if (outcome === "failed stop then retry") {
        const track = runtime.localStreams.flatMap(stream => stream.getVideoTracks()).find(item => item.refuseStop);
        assert.ok(track);
        assert.equal(coordinator.retryRetiredCommunicationCaptures(), false);
        await next.rerender({ enabled: false });
        await next.rerender({ enabled: true });
        assert.equal(nextRuntime.mediaCreateCalls.length, 0, "unproved old shutdown remains blocking after remount");
        track.refuseStop = false;
      }
      assert.equal(coordinator.retryRetiredCommunicationCaptures(), true);
      await next.rerender({ enabled: false });
      await next.rerender({ enabled: true });
      assert.equal(nextRuntime.joinCalls.length, 1);
      assert.equal(live(nextRuntime, "video").length, 1);
      assert.equal(live(runtime, "video").length, 0);
      assert.equal(coordinator.retryRetiredCommunicationCaptures(), true);
      assert.equal(live(nextRuntime, "video").length, 1, "old retry never stops adopted replacement capture");
    });
  }
}

for (const [producer, outcome] of [["initial", "success"], ["foreground camera", "rejection"], ["microphone", "failed stop"]]) {
  test(`every legacy capture producer retains unknown native outcome across remount: ${producer}, ${outcome}`, async t => {
    const coordinator = module.exports.createCaptureRetirementCoordinator();
    const runtime = createRuntime({ captureRetirementCoordinator: coordinator });
    const pending = deferred();
    const action = { wait: pending.promise,
      ...(outcome === "rejection" ? { outcome: "reject" } : {}),
      ...(outcome === "failed stop" ? { audio: { refuseStop: true } } : {}) };
    if (producer === "initial") runtime.queueMedia(action);
    const h = await mount(runtime, { enabled: true, naturalLifecycle: true, allowBackgroundAudio: true,
      analyticsContext: { surface: "chat-thread" }, initialMediaPreferences: { micEnabled: true, cameraEnabled: true } });
    t.after(() => h.unmount());
    let control;
    if (producer === "foreground camera") {
      await h.run(() => runtime.emitAppState("background"));
      runtime.queueMedia(action);
      await h.run(() => runtime.emitAppState("active"));
    }
    if (producer === "microphone") {
      for (const track of live(runtime, "audio")) track.stop();
      runtime.queueMedia(action);
      await React.act(async () => {
        control = h.getResult().setMicrophoneEnabled(true);
        for (let i = 0; i < 60; i += 1) await Promise.resolve();
      });
    }
    assert.ok(runtime.mediaCreateCalls.length > 0);
    await assert.rejects(() => h.run(() => h.getResult().leaveRoom()), /shutdown/);
    await h.unmount();
    const nextRuntime = createRuntime({ captureRetirementCoordinator: coordinator });
    nextRuntime.roomId = `REPLACEMENT-${producer.toUpperCase().replaceAll(" ", "-")}`;
    nextRuntime.userId = "new-native-capture-owner";
    const next = await mount(nextRuntime, { enabled: true, naturalLifecycle: true,
      authenticatedUserId: nextRuntime.userId, analyticsContext: { surface: "chat-thread" },
      initialMediaPreferences: { micEnabled: true, cameraEnabled: true } });
    t.after(() => next.unmount());
    assert.equal(nextRuntime.mediaCreateCalls.length, 0);
    assert.equal(nextRuntime.joinCalls.length, 0);
    pending.resolve();
    await h.run(async () => { if (control) await control; for (let i = 0; i < 80; i += 1) await Promise.resolve(); });
    if (outcome === "failed stop") {
      assert.equal(coordinator.retryRetiredCommunicationCaptures(), false);
      const retained = runtime.localStreams.flatMap(stream => stream.getTracks()).find(track => track.refuseStop);
      assert.ok(retained);
      retained.refuseStop = false;
    }
    assert.equal(coordinator.retryRetiredCommunicationCaptures(), true);
    await next.rerender({ enabled: false });
    await next.rerender({ enabled: true });
    assert.equal(live(runtime, "audio").length, 0);
    assert.equal(live(runtime, "video").length, 0);
    assert.equal(live(nextRuntime, "audio").length, 1);
    assert.equal(live(nextRuntime, "video").length, 1);
  });
}


test("adopted camera recovery retains failed rollback disposal after sender rejection removes local refs", async t => {
  const coordinator = module.exports.createCaptureRetirementCoordinator();
  const { runtime, h } = await start(t, { captureRetirementCoordinator: coordinator });
  runtime.queueMedia({ outcome: "reject" });
  assert.equal(await h.run(() => h.getResult().switchCamera()), false);
  const sender = runtime.peers[0].getSenders().find(item => item.track?.kind === "video");
  sender.replaceTrack = async () => undefined;
  runtime.queueMedia({ video: { refuseStop: true } });
  assert.equal(await h.run(() => h.getResult().toggleCamera()), false);
  const retained = runtime.localStreams.flatMap(stream => stream.getVideoTracks()).find(track => track.refuseStop);
  assert.ok(retained);
  assert.equal(coordinator.retryRetiredCommunicationCaptures(), false,
    "retire after adoption must re-register this exact unproved track even after local refs were removed");
  await assert.rejects(() => h.run(() => h.getResult().leaveRoom()), /shutdown/);
  retained.refuseStop = false;
  await h.run(() => h.getResult().leaveRoom());
  assert.equal(retained.readyState, "ended");
  assert.equal(coordinator.retryRetiredCommunicationCaptures(), true);
});

for (const backgroundAudio of [false, true]) {
  test(`legacy current-camera projection follows stopped WebRTC tracks while retaining foreground intent: background audio ${backgroundAudio}`, async t => {
    const { runtime, h } = await start(t, { backgroundAudio });
    const video = live(runtime, "video")[0];
    assert.equal(h.getResult().cameraEnabled, true);
    assert.equal(h.getResult().participants.find(participant => participant.isSelf)?.cameraOn, true);
    // The real browser WebRTC stop() receipt keeps enabled=true while ended.
    // Check both public projection and capture; enabled alone is not liveness.
    video.stop = () => { video.readyState = "ended"; };
    await h.run(() => runtime.emitAppState("background"));
    assert.equal(video.readyState, "ended");
    assert.equal(video.enabled, false, "suppress outgoing frames before stop; the stop receipt itself does not change enabled");
    assert.equal(runtime.durableCamera, false);
    assert.equal(h.getResult().cameraEnabled, false, "public control state must describe current capture rather than retained resume intent");
    assert.equal(h.getResult().participants.find(participant => participant.isSelf)?.cameraOn, false);
    assert.equal(h.refs.cameraEnabledRef.current, true, "retain the admitted call's camera preference for foreground recovery");
    await h.run(() => runtime.emitAppState("active"));
    const restored = live(runtime, "video")[0];
    assert.ok(restored);
    assert.notEqual(restored, video);
    assert.equal(live(runtime, "video").length, 1);
    assert.equal(h.getResult().cameraEnabled, true);
    assert.equal(h.getResult().participants.find(participant => participant.isSelf)?.cameraOn, true);
    assert.equal(runtime.durableCamera, true);
    assert.equal(runtime.joinCalls.length, 1, "projection repair must not re-admit or replace the call");
  });
}

test("legacy camera toggle follows the public off state when foreground capture has ended", async t => {
  const { runtime, h } = await start(t);
  const previous = live(runtime, "video")[0];
  previous.stop = () => { previous.readyState = "ended"; };
  previous.stop();
  await h.rerender({});
  assert.equal(h.getResult().cameraEnabled, false);
  assert.equal(h.getResult().participants.find(participant => participant.isSelf)?.cameraOn, false);
  assert.equal(await h.run(() => h.getResult().toggleCamera()), true);
  const recovered = live(runtime, "video")[0];
  assert.ok(recovered, "one user enable action must reacquire the ended camera shown as off");
  assert.notEqual(recovered, previous);
  assert.equal(h.getResult().cameraEnabled, true);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.joinCalls.length, 1);
});

for (const backgroundAudio of [false, true]) {
 for (const refuseDisable of [false, true]) {
  test(`legacy background failed camera stop remains visible and owned until exact End retry: background audio ${backgroundAudio}, disable failure ${refuseDisable}`, async t => {
    const { runtime, h } = await start(t, { backgroundAudio });
    const video = live(runtime, "video")[0];
    video.refuseStop = true;
    video.refuseDisable = refuseDisable;
    for (const peer of runtime.peers) {
      for (const sender of peer.getSenders()) if (sender.track === video) peer.removeTrack(sender);
    }
    await h.run(() => runtime.emitAppState("background"));
    assert.equal(video.readyState, "live");
    assert.equal(video.enabled, refuseDisable, "disable outgoing frames even if the independent hardware stop is unproved");
    assert.equal(runtime.durableCamera, refuseDisable, "media state must match the disable receipt without claiming capture shutdown");
    assert.equal(h.getResult().cameraEnabled, refuseDisable, "actual still-enabled capture cannot be hidden by background intent");
    assert.equal(h.getResult().participants.find(participant => participant.isSelf)?.cameraOn, refuseDisable);
    assert.ok(h.refs.localStreamRef.current?.getVideoTracks().includes(video)
      || h.refs.auxiliaryStreamsRef.current.some(stream => stream.getVideoTracks().includes(video)),
    "an unbound failed-stop track must remain owned even when no RTP sender references it");
    assert.match(h.getResult().error ?? "", /camera.*(shutdown|stop).*verified/i);
    await assert.rejects(() => h.run(() => h.getResult().leaveRoom()), /shutdown/);
    video.refuseStop = false;
    video.refuseDisable = false;
    await h.run(() => h.getResult().leaveRoom());
    assert.equal(video.readyState, "ended");
    assert.equal(h.getResult().cameraEnabled, false);
    runtime.roomId = "FRESH-AFTER-CAMERA-STOP";
    await h.run(() => runtime.emitAppState("active"));
    await h.rerender({ roomId: runtime.roomId });
    assert.equal(live(runtime, "video").length, 1);
    assert.notEqual(live(runtime, "video")[0], video);
  });
 }
}

test("adopted failed-stop camera remains process-owned across full hook unmount and replacement admission", async t => {
  const coordinator = module.exports.createCaptureRetirementCoordinator();
  const { runtime, h } = await start(t, { captureRetirementCoordinator: coordinator, backgroundAudio: true });
  const video = live(runtime, "video")[0];
  video.refuseStop = true;
  await h.run(() => runtime.emitAppState("background"));
  await h.unmount();
  assert.equal(video.readyState, "live");
  const replacement = createRuntime({ captureRetirementCoordinator: coordinator });
  replacement.roomId = "ADOPTED-CAPTURE-REPLACEMENT";
  const next = await mount(replacement, { enabled: true, naturalLifecycle: true,
    analyticsContext: { surface: "chat-thread" }, initialMediaPreferences: { micEnabled: true, cameraEnabled: true } });
  t.after(() => next.unmount());
  assert.equal(replacement.joinCalls.length, 0, "unmount must not erase an adopted native capture whose shutdown is unproved");
  assert.equal(replacement.mediaCreateCalls.length, 0);
  video.refuseStop = false;
  await next.rerender({ enabled: false });
  await next.rerender({ enabled: true });
  assert.equal(video.readyState, "ended");
  assert.equal(replacement.joinCalls.length, 1);
  assert.equal(live(replacement, "video").length, 1);
  assert.equal(coordinator.retryRetiredCommunicationCaptures(), true);
  assert.equal(live(replacement, "video").length, 1, "retirement retry cannot stop an adopted replacement owner's track");
});

test("legacy background initial audio resolving in foreground preserves requested camera", async t => {
  const runtime = createRuntime(); runtime.appState = "background";
  const h = await mount(runtime, { enabled: false, naturalLifecycle: true, allowBackgroundAudio: true,
    analyticsContext: { surface: "chat-thread" }, initialMediaPreferences: { cameraEnabled: true, micEnabled: true } });
  t.after(() => h.unmount());
  const initialCapture = deferred(); runtime.queueMedia({ wait: initialCapture.promise });
  await h.rerender({ enabled: true });
  assert.ok(runtime.captureRequests.some(r => r.audio && !r.video), "initial acquisition must be background audio only");
  const permissionRead = deferred(); runtime.microphoneReadBarrier = permissionRead.promise;
  await h.run(() => runtime.emitAppState("active"));
  initialCapture.resolve();
  await h.run(async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); });
  runtime.microphoneReadBarrier = null; permissionRead.resolve();
  await h.run(async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); });
  assert.equal(h.getResult().cameraEnabled, true, "background audio-only receipt is not a denied camera receipt");
  assert.equal(live(runtime, "video").length, 1);
  assert.equal(runtime.durableCamera, true);
});

for (const refuseDisable of [false, true]) {
  test(`legacy canceled foreground video retains unverified shutdown: disable refusal ${refuseDisable}`, async t => {
    const coordinator = module.exports.createCaptureRetirementCoordinator();
    const { runtime, h } = await start(t, { video: true, backgroundAudio: true,
      captureRetirementCoordinator: coordinator });
    t.after(async () => {
      for (const stream of runtime.localStreams) for (const track of stream.getVideoTracks()) {
        track.refuseStop = false; track.refuseDisable = false;
      }
      coordinator.retryRetiredCommunicationCaptures();
    });
    await h.run(() => runtime.emitAppState("background"));
    const pending = deferred();
    runtime.queueMedia({ wait: pending.promise, video: { refuseStop: true, refuseDisable } });
    await h.run(() => runtime.emitAppState("active"));
    await h.rerender({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } });
    pending.resolve();
    await h.run(async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); });
    assert.equal(live(runtime, "video").length, Number(refuseDisable), "injected native failure prevents shutdown proof");
    assert.equal(coordinator.retryRetiredCommunicationCaptures(), false, "failed native stop remains process owned");
    assert.equal(h.getResult().cameraEnabled, refuseDisable, "public camera projection cannot hide the still-enabled failed-stop track");
    assert.match(h.getResult().error ?? "", /[Cc]amera.*shutdown.*verified/);
    await assert.rejects(() => h.run(() => h.getResult().leaveRoom()), /shutdown/);
    for (const stream of runtime.localStreams) for (const track of stream.getVideoTracks()) {
      track.refuseStop = false; track.refuseDisable = false;
    }
    await h.run(() => h.getResult().leaveRoom());
    assert.equal(coordinator.retryRetiredCommunicationCaptures(), true);
  });
}
