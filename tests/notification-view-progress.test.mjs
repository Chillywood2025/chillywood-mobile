import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationViewProgress, notificationPlaybackRecordId } from '../_lib/notificationViewProgress.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(overrides = {}) {
  let time = 0; let starts = 0; let completes = 0;
  const tracker = createNotificationViewProgress({ now: () => time,
    begin: overrides.begin ?? (async () => { starts++; return 'exact-view'; }),
    complete: overrides.complete ?? (async id => { assert.equal(id, 'exact-view'); completes++; return true; }),
  });
  return { tracker, counts: () => ({ starts, completes }), async sample(position, fields = {}, active = true, step = 1_000) {
    time += step; tracker.observe({ isLoaded: true, isPlaying: true, isBuffering: false, positionMillis: position, ...fields }, active); await flush();
  } };
}
test('ten seconds of real progress qualifies once; continued playback cannot duplicate', async () => {
  const h = harness(); for (let i = 0; i <= 9; i++) await h.sample(i * 1_000);
  assert.deepEqual(h.counts(), { starts: 1, completes: 0 });
  await h.sample(10_000); assert.equal(h.counts().completes, 1);
  for (let i = 11; i <= 30; i++) await h.sample(i * 1_000);
  assert.equal(h.counts().completes, 1);
});
for (const [name, fields, active] of [['paused', { isPlaying: false }, true], ['buffering', { isBuffering: true }, true],
  ['not loaded', { isLoaded: false }, true], ['background or inactive page', {}, false]]) {
  test(`${name} neither starts nor qualifies a view`, async () => {
    const h = harness(); for (let i = 0; i < 20; i++) await h.sample(i * 1_000, fields, active);
    assert.deepEqual(h.counts(), { starts: 0, completes: 0 });
  });
}
test('stationary frames and large forward seeks cannot manufacture watch time', async () => {
  const h = harness(); for (let i = 0; i < 20; i++) await h.sample(0);
  for (let i = 1; i < 20; i++) await h.sample(i * 50_000);
  assert.equal(h.counts().completes, 0);
});
test('long callback gaps and time spent away do not count', async () => {
  const h = harness(); await h.sample(0); await h.sample(100_000, {}, true, 100_000);
  h.tracker.pause(); await h.sample(200_000, {}, true, 100_000);
  assert.equal(h.counts().completes, 0);
});
test('rate-limited definite unsaved completion retries, then stops on exact success', async () => {
  let attempts = 0; const h = harness({ complete: async () => ++attempts >= 2 });
  for (let i = 0; i <= 20; i++) await h.sample(i * 1_000);
  assert.equal(attempts, 2);
});
test('dispose during a held start cannot later complete another account/source', async () => {
  let release; let completions = 0;
  const h = harness({ begin: () => new Promise(resolve => { release = resolve; }), complete: async () => { completions++; return true; } });
  await h.sample(0); h.tracker.dispose(); release('old-view'); await flush();
  for (let i = 0; i < 20; i++) await h.sample(i * 1_000);
  assert.equal(completions, 0);
});
test('begin error is nonfatal and retried at a bounded interval', async () => {
  let calls = 0; const h = harness({ begin: async () => { calls++; throw new Error('offline'); } });
  for (let i = 0; i < 11; i++) await h.sample(i * 1_000);
  assert.equal(calls, 3);
});
test('spectator record extraction keeps only exact project path and drops signed query data', () => {
  const base = 'https://project.supabase.co'; const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(notificationPlaybackRecordId(`${base}/functions/v1/spectator-playback/records/${id}/index.m3u8?token=private`, base), id);
  for (const value of [`https://evil.example/functions/v1/spectator-playback/records/${id}/index.m3u8`,
    `${base}/records/${id}/index.m3u8`, `${base}/functions/v1/spectator-playback/records/${id}/other.m3u8`, 'invalid']) {
    assert.equal(notificationPlaybackRecordId(value, base), null);
  }
});
