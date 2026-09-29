import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = process.cwd();
const sdkRoot = path.join(root, "node_modules/@livekit/react-native-webrtc/src");
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Execute the installed SDK and complete application capture helper unchanged.
// Only React Native's OS/bridge edge and unrelated application services are
// controlled. This is SDK contract evidence, not native capture/RTP proof.
function runtime({ platform = "android", cameraGranted = true } = {}) {
  const calls = { permissions: [], captures: [], enabled: [], replacements: [] };
  let nextId = 0;
  let replace = async () => true;
  let capture = (constraints, success) => {
    const streamId = `stream-${++nextId}`;
    success(streamId, ["audio", "video"].filter(kind => constraints[kind]).map(kind => ({
      id: `${streamId}-${kind}`, kind, remote: false, enabled: true,
      peerConnectionId: -1, readyState: "live",
      settings: kind === "video" ? { ...constraints.video, deviceId: constraints.video.facingMode === "environment" ? "rear" : "front" } : {},
    })));
  };
  class Emitter {
    addListener() { return { remove() {} }; }
    emit() {}
  }
  const bridge = {
    getUserMedia(constraints, success, failure) {
      calls.captures.push(plain(constraints));
      capture(constraints, success, failure);
    },
    mediaStreamTrackSetEnabled(peer, id, enabled) { calls.enabled.push({ peer, id, enabled }); },
    async senderReplaceTrack(peer, id, track) {
      calls.replacements.push({ peer, id, track });
      return replace(peer, id, track);
    },
    async requestPermission(name) {
      calls.permissions.push(name);
      return name !== "camera" || cameraGranted;
    },
    mediaStreamCreate() {}, mediaStreamAddTrack() {}, mediaStreamRemoveTrack() {},
    mediaStreamRelease() {}, mediaStreamTrackRelease() {},
  };
  const reactNative = {
    NativeModules: { WebRTCModule: bridge }, NativeEventEmitter: Emitter,
    Platform: { OS: platform },
    PermissionsAndroid: {
      PERMISSIONS: { CAMERA: "camera", RECORD_AUDIO: "microphone" },
      RESULTS: { GRANTED: "granted" },
      async request(name) { calls.permissions.push(name); return name !== "camera" || cameraGranted ? "granted" : "denied"; },
    },
  };
  const modules = new Map();
  function loadSdk(file) {
    const candidate = path.resolve(sdkRoot, file);
    const filename = [candidate, `${candidate}.ts`, `${candidate}.js`, path.join(candidate, "index.js")]
      .find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert.ok(filename?.startsWith(`${sdkRoot}/`), `SDK module must remain inside pinned package: ${file}`);
    if (modules.has(filename)) return modules.get(filename).exports;
    const mod = { exports: {} };
    modules.set(filename, mod);
    const source = fs.readFileSync(filename, "utf8");
    const code = filename.endsWith(".ts") ? ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    }, fileName: filename }).outputText : source;
    vm.runInNewContext(code, {
      console, module: mod, exports: mod.exports, setTimeout, clearTimeout,
      require(specifier) {
        if (specifier === "react-native") return reactNative;
        if (specifier === "react-native/Libraries/vendor/emitter/EventEmitter") return Emitter;
        if (specifier === "debug") return require("debug");
        if (specifier.startsWith(".")) return loadSdk(path.resolve(path.dirname(filename), specifier));
        throw Error(`Unexpected installed SDK import: ${specifier}`);
      },
    }, { filename });
    return mod.exports;
  }
  const getUserMedia = loadSdk("getUserMedia").default;
  const Sender = loadSdk("RTCRtpSender").default;
  const mocks = {
    "expo-constants": { __esModule: true, default: { expoConfig: { extra: {} } } },
    "react-native": reactNative,
    "@livekit/react-native-webrtc": { mediaDevices: { getUserMedia } },
    "./appConfig": {}, "./monetization": {}, "./roomRules": {}, "./performancePolicy": {},
    "./supabase": {}, "./userData": {}, "./watchParty": {}, "./accountBoundSupabaseMutation": {},
  };
  const app = { exports: {} };
  const appSource = fs.readFileSync(process.env.CHILLY_CAMERA_CAPTURE_TEST_SOURCE ?? "_lib/communication.ts", "utf8");
  vm.runInNewContext(ts.transpileModule(appSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, {
    console, module: app, exports: app.exports, process: { env: {} },
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw Error(`Unexpected application import: ${specifier}`);
    },
  }, { filename: "_lib/communication.ts" });
  return {
    calls, api: app.exports,
    setCapture(next) { capture = next; },
    setReplace(next) { replace = next; },
    sender(track, id = "video-sender") {
      return new Sender({ peerConnectionId: 42, id, track,
        rtpParameters: { transactionId: "transaction", codecs: [], encodings: [], headerExtensions: [], rtcp: {} } });
    },
  };
}

for (const platform of ["android", "ios"]) {
  test(`installed RTC SDK ${platform}: explicit replacement facing crosses real normalization without opening microphone`, async () => {
    const r = runtime({ platform });
    const stream = await r.api.createCommunicationMediaStream({ audio: false, video: true, facingMode: "environment" });
    assert.deepEqual(r.calls.permissions, ["camera"]);
    assert.equal(r.calls.captures.length, 1);
    assert.deepEqual(r.calls.captures[0], { video: { facingMode: "environment", width: 640, height: 480, frameRate: 15 } });
    assert.equal(stream.getAudioTracks().length, 0);
    assert.equal(stream.getVideoTracks()[0].getSettings().facingMode, "environment");
    assert.equal(stream.getVideoTracks()[0].getConstraints().facingMode, "environment");
  });

  test(`installed RTC SDK ${platform}: camera permission denial never invokes native acquisition`, async () => {
    const r = runtime({ platform, cameraGranted: false });
    await assert.rejects(r.api.createCommunicationMediaStream({ audio: false, video: true, facingMode: "environment" }),
      error => error.name === "SecurityError");
    assert.deepEqual(r.calls.permissions, ["camera"]);
    assert.equal(r.calls.captures.length, 0);
  });
}

test("installed RTC SDK capture keeps the existing front-camera default and false-video behavior", async () => {
  const r = runtime();
  const initial = await r.api.createCommunicationMediaStream({ audio: true, video: true });
  assert.equal(initial.getVideoTracks()[0].getSettings().facingMode, "user");
  await r.api.createCommunicationMediaStream({ audio: true, video: false, facingMode: "environment" });
  assert.equal(r.calls.captures[1].video, undefined);
  assert.equal(await r.api.createCommunicationMediaStream({ audio: false, video: false }), null);
  assert.equal(r.calls.captures.length, 2);
});

test("installed RTC SDK native camera acquisition failure is preserved", async () => {
  const r = runtime();
  r.setCapture((_, _success, failure) => failure("NotReadableError", "Camera resource unavailable"));
  await assert.rejects(r.api.createCommunicationMediaStream({ audio: false, video: true, facingMode: "environment" }),
    error => error.name === "NotReadableError" && error.message === "Camera resource unavailable");
});

test("installed RTC SDK replaces only captured video after native acknowledgment and leaves audio identity intact", async () => {
  const r = runtime();
  const initial = await r.api.createCommunicationMediaStream({ audio: true, video: true });
  const oldVideo = initial.getVideoTracks()[0];
  const audio = initial.getAudioTracks()[0];
  const videoSender = r.sender(oldVideo);
  const audioSender = r.sender(audio, "audio-sender");
  oldVideo.stop();
  const replacement = await r.api.createCommunicationMediaStream({ audio: false, video: true, facingMode: "environment" });
  const newVideo = replacement.getVideoTracks()[0];
  const gate = deferred();
  r.setReplace(() => gate.promise);
  let finished = false;
  const swapping = videoSender.replaceTrack(newVideo).then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  assert.equal(videoSender.track, oldVideo);
  gate.resolve(true);
  await swapping;
  assert.equal(videoSender.track, newVideo);
  assert.equal(audioSender.track, audio);
  assert.equal(audio.readyState, "live");
  assert.equal(audio.enabled, true);
  assert.equal(oldVideo.readyState, "ended");
  assert.deepEqual(r.calls.replacements, [{ peer: 42, id: "video-sender", track: newVideo.id }]);
  assert.deepEqual(r.calls.enabled, [{ peer: -1, id: oldVideo.id, enabled: false }]);
});

test("installed RTC SDK native sender rejection resolves but leaves old track: callers must verify the postcondition", async () => {
  const r = runtime();
  const initial = await r.api.createCommunicationMediaStream({ audio: false, video: true });
  const replacement = await r.api.createCommunicationMediaStream({ audio: false, video: true, facingMode: "environment" });
  const sender = r.sender(initial.getVideoTracks()[0]);
  const oldVideo = sender.track;
  r.setReplace(async () => { throw Error("Native sender is closed"); });
  assert.equal(await sender.replaceTrack(replacement.getVideoTracks()[0]), undefined);
  assert.equal(sender.track, oldVideo, "actual SDK swallows rejection; resolved void is not attachment proof");
  assert.notEqual(sender.track, replacement.getVideoTracks()[0]);
});
