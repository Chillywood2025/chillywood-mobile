import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  LocalAudioTrack,
  LocalParticipant,
  LocalTrackPublication,
  LocalVideoTrack,
  Track,
} = require('livekit-client');

// Exercise the installed SDK, not the mounted-hook fixture's implementation of
// enable/unmute/restart. Only the native capture boundary is replaced. This is
// a JavaScript SDK contract test; it makes no physical capture or delivery claim.
class CaptureStream {
  constructor(tracks) {
    this.tracks = tracks;
  }

  getTracks() {
    return [...this.tracks];
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

function captureTrack(kind, id) {
  return {
    id,
    kind,
    readyState: 'live',
    enabled: true,
    muted: false,
    getConstraints: () => ({}),
    getSettings: () => (kind === 'video' ? { width: 640, height: 480 } : {}),
    applyConstraints: async () => {},
    addEventListener() {},
    removeEventListener() {},
    // stop() is irreversible for this MediaStreamTrack. It does not emit ended
    // or reset enabled; only obtaining a different track can restore capture.
    stop() {
      this.readyState = 'ended';
    },
  };
}

async function withPublishedTrack(kind, run) {
  const originals = new Map(
    ['MediaStream', 'navigator'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const captures = [];
  const senderReplacements = [];
  let track;
  let publication;
  try {
    Object.defineProperty(globalThis, 'MediaStream', {
      configurable: true,
      value: CaptureStream,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          async getUserMedia(constraints) {
            assert.equal(Boolean(constraints.audio), kind === 'audio');
            assert.equal(Boolean(constraints.video), kind === 'video');
            const captured = captureTrack(kind, `replacement-${kind}-${captures.length}`);
            captures.push(captured);
            return new CaptureStream([captured]);
          },
        },
      },
    });

    const original = captureTrack(kind, `original-${kind}`);
    const TrackClass = kind === 'audio' ? LocalAudioTrack : LocalVideoTrack;
    track = new TrackClass(original, undefined, false);
    track.source = kind === 'audio' ? Track.Source.Microphone : Track.Source.Camera;
    // The SDK's constructor initializes its media stream asynchronously.
    await new Promise((resolve) => setImmediate(resolve));
    track.sender = {
      transport: { state: 'connected' },
      getParameters: () => ({ encodings: [] }),
      setParameters: async () => {},
      async replaceTrack(replacement) {
        senderReplacements.push(replacement);
      },
    };
    publication = new LocalTrackPublication(
      kind === 'audio' ? Track.Kind.Audio : Track.Kind.Video,
      { sid: `publication-${kind}`, name: kind, source: Track.sourceToProto(track.source) },
      track,
    );
    // Keep the actual LocalParticipant enable implementation and actual
    // LocalTrackPublication delegation. The participant has no provider session.
    const participant = {
      republishPromise: null,
      log: { debug() {} },
      getTrackPublication(source) {
        assert.equal(source, track.source);
        return publication;
      },
      setTrackEnabled: LocalParticipant.prototype.setTrackEnabled,
    };
    const method = kind === 'audio' ? 'setMicrophoneEnabled' : 'setCameraEnabled';
    const enable = () => LocalParticipant.prototype[method].call(participant, true);
    await run({ track, original, publication, captures, senderReplacements, enable });
  } finally {
    publication?.setTrack(undefined);
    track?.stop();
    for (const captured of captures) captured.stop();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test('installed LiveKit capture lifetime contract', { concurrency: false }, async (t) => {
  for (const kind of ['audio', 'video']) {
    await t.test(`${kind}: enabling an already-unmuted ended track does not reacquire it`, async () => {
      await withPublishedTrack(kind, async ({ track, original, captures, senderReplacements, enable }) => {
        original.stop();
        assert.equal(track.isMuted, false);
        await enable();
        assert.equal(track.mediaStreamTrack, original);
        assert.equal(track.mediaStreamTrack.readyState, 'ended');
        assert.equal(track.isMuted, false);
        assert.equal(captures.length, 0);
        assert.equal(senderReplacements.length, 0);
      });
    });

    await t.test(`${kind}: a muted SDK-managed ended track is reacquired on enable`, async () => {
      await withPublishedTrack(kind, async ({ track, original, captures, senderReplacements, enable }) => {
        await track.mute();
        original.stop();
        assert.equal(track.isMuted, true);
        await enable();
        assert.equal(captures.length, 1);
        assert.equal(track.mediaStreamTrack, captures[0]);
        assert.equal(track.mediaStreamTrack.readyState, 'live');
        assert.equal(track.mediaStreamTrack.enabled, true);
        assert.equal(track.isMuted, false);
        assert.equal(original.readyState, 'ended');
        assert.deepEqual(senderReplacements, [captures[0]]);
      });
    });

    await t.test(`${kind}: local stop preserves publication and sender for explicit restart`, async () => {
      await withPublishedTrack(kind, async ({ track, original, publication, captures, senderReplacements }) => {
        const sender = track.sender;
        track.stop();
        assert.equal(original.readyState, 'ended');
        assert.equal(track.sender, sender, 'stop does not detach the sender required by unpublishTrack');
        assert.equal(publication.track, track, 'stop does not remove its publication association');
        assert.equal(track.isMuted, false, 'stop and SDK mute state are separate');
        assert.equal(senderReplacements.length, 0, 'stop does not replace the sender with null');
        await track.restartTrack();
        assert.equal(captures.length, 1);
        assert.equal(publication.track, track);
        assert.equal(track.sender, sender);
        assert.equal(track.mediaStreamTrack, captures[0]);
        assert.equal(track.mediaStreamTrack.readyState, 'live');
        assert.equal(track.mediaStreamTrack.enabled, true);
        assert.equal(track.isMuted, false);
        assert.equal(original.readyState, 'ended');
        assert.deepEqual(senderReplacements, [captures[0]]);
      });
    });
  }
});
