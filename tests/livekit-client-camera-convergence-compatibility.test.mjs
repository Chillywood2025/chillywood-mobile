import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

test("the installed LiveKit client contains the bounded camera-publish convergence fixes", () => {
  const lock = readJson("package-lock.json");
  const reactNativePackage = readJson("node_modules/@livekit/react-native/package.json");
  const transportManager = fs.readFileSync(
    path.join(root, "node_modules/livekit-client/src/room/PCTransportManager.ts"),
    "utf8",
  );
  const localVideoTrack = fs.readFileSync(
    path.join(root, "node_modules/livekit-client/src/room/track/LocalVideoTrack.ts"),
    "utf8",
  );
  const rtcEngine = fs.readFileSync(
    path.join(root, "node_modules/livekit-client/src/room/RTCEngine.ts"),
    "utf8",
  );
  const room = fs.readFileSync(
    path.join(root, "node_modules/livekit-client/src/room/Room.ts"),
    "utf8",
  );

  assert.equal(lock.packages["node_modules/livekit-client"].version, "2.22.0");
  assert.equal(
    lock.packages["node_modules/livekit-client"].integrity,
    "sha512-GLtYQfRh/RsvXaOX1x609bFZ17yyKmKWDqu9JmkMKn9vIFLi2GsapRv9gT8OJO/1R2dsitrkbGmloyUfxWQsaA==",
  );
  assert.equal(lock.packages["node_modules/webrtc-adapter"].version, "9.0.6");
  assert.equal(
    lock.packages["node_modules/webrtc-adapter"].integrity,
    "sha512-CHbl2ZQbxx164IgWRgzJno4hWtM4tFbRam1QfI3Yxhs3w/DvqluVxVWeXs3oL5/fbGkSNLKo0Ty5MgUWceNhog==",
  );
  assert.equal(lock.packages["node_modules/machina"], undefined);
  assert.equal(reactNativePackage.version, "2.10.0");
  assert.equal(reactNativePackage.peerDependencies["livekit-client"], "^2.15.8");

  // Upstream PR #1927 replaced the cycle-level completion listener that could
  // strand setCameraEnabled(true) with an exact offer-id acknowledgement and
  // complete listener cleanup. Keep the installed artifact bound to that fix.
  assert.match(transportManager, /const checkpoint = this\.publisher\.latestOfferId;/u);
  assert.match(transportManager, /PCEvents\.OfferAnswered/u);
  assert.match(transportManager, /this\.publisher\.off\(PCEvents\.OfferAnswered, onAnswered\)/u);
  assert.doesNotMatch(transportManager, /once\(PCEvents\.NegotiationComplete/u);

  // Upstream PR #1902 retains the publisher's video options and recomputes
  // sender encodings after an explicit camera/device track restart.
  assert.match(localVideoTrack, /private async refreshSenderEncodings\(\)/u);
  assert.match(localVideoTrack, /await this\.applyEncodingsToSender\(this\.sender, newEncodings\)/u);

  // Upstream PR #2030 makes a server-observed dead publisher and a transport
  // stuck in CONNECTING converge through the normal full-reconnect lifecycle
  // instead of waiting indefinitely or terminally tearing down the room.
  assert.match(rtcEngine, /const connectionQualityLostTimeout = 10 \* 1000;/u);
  assert.match(rtcEngine, /private scheduleLostQualityReconnect\(\)/u);
  assert.match(rtcEngine, /this\.fullReconnectOnNext = true;/u);
  assert.match(rtcEngine, /transport stuck in connecting state/u);
  assert.match(room, /detected connection state mismatch, attempting full reconnect/u);
});

test("managed camera mute and unmute retain privacy and replace the sender track", async (t) => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalMediaStream = Object.getOwnPropertyDescriptor(globalThis, "MediaStream");
  let trackSequence = 0;

  class FakeMediaStream {
    constructor(tracks = []) {
      this.tracks = [...tracks];
    }

    getTracks() {
      return [...this.tracks];
    }

    getVideoTracks() {
      return this.tracks.filter((track) => track.kind === "video");
    }

    getAudioTracks() {
      return this.tracks.filter((track) => track.kind === "audio");
    }

    addTrack(track) {
      this.tracks.push(track);
    }

    removeTrack(track) {
      this.tracks = this.tracks.filter((candidate) => candidate !== track);
    }

    toURL() {
      return "fake://livekit-camera";
    }
  }

  const createVideoTrack = (width, height) => {
    const listeners = new Map();
    return {
      id: `camera-${trackSequence += 1}`,
      kind: "video",
      enabled: true,
      muted: false,
      readyState: "live",
      getConstraints: () => ({ width, height }),
      getSettings: () => ({ width, height, frameRate: 30 }),
      addEventListener: (event, listener) => listeners.set(event, listener),
      removeEventListener: (event) => listeners.delete(event),
      applyConstraints: async () => undefined,
      clone: () => createVideoTrack(width, height),
      stop() {
        this.readyState = "ended";
      },
    };
  };

  const reacquiredTrack = createVideoTrack(1280, 720);
  Object.defineProperty(globalThis, "MediaStream", {
    configurable: true,
    value: FakeMediaStream,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      product: "ReactNative",
      userAgent: "ReactNative",
      mediaDevices: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        enumerateDevices: async () => [],
        getUserMedia: async () => new FakeMediaStream([reacquiredTrack]),
      },
    },
  });

  t.after(() => {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
    if (originalMediaStream) Object.defineProperty(globalThis, "MediaStream", originalMediaStream);
    else delete globalThis.MediaStream;
  });

  const { LocalVideoTrack, Track, TrackEvent } = require("livekit-client");
  const originalTrack = createVideoTrack(1280, 720);
  const camera = new LocalVideoTrack(
    originalTrack,
    { width: 1280, height: 720, frameRate: 30 },
    false,
  );
  camera.source = Track.Source.Camera;
  await new Promise((resolve) => setImmediate(resolve));

  const replacedTracks = [];
  camera.sender = {
    transport: { state: "connected" },
    replaceTrack: async (track) => replacedTracks.push(track),
    getParameters: () => ({ encodings: [{ active: true }] }),
    setParameters: async () => undefined,
  };
  const events = [];
  camera.on(TrackEvent.Muted, () => events.push("muted"));
  camera.on(TrackEvent.Unmuted, () => events.push("unmuted"));

  await camera.mute();
  assert.equal(originalTrack.readyState, "ended", "camera-off must stop the prior capture track");
  assert.equal(camera.isMuted, true);

  await camera.unmute();
  assert.equal(camera.isMuted, false);
  assert.equal(camera.mediaStreamTrack, reacquiredTrack);
  assert.equal(camera.mediaStreamTrack.readyState, "live");
  assert.equal(camera.mediaStreamTrack.enabled, true);
  assert.equal(replacedTracks.at(-1), reacquiredTrack);
  assert.deepEqual(events, ["muted", "unmuted"]);
});
