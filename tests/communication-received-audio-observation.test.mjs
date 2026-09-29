import assert from "node:assert/strict";
import test from "node:test";
import { createLegacyBrowserSilenceObservation } from "./assurance/helpers/legacy-paired-browser-harness.mjs";

const sample = (samples, energy, packets, sampleRate = 48_000) => ({ samples, energy, packets, sampleRate });

test("received silence waits for buffered audible PCM to drain, then measures 300 ms of actual silent input", () => {
  const observation = createLegacyBrowserSilenceObservation();
  assert.equal(observation.inspect(sample(4096, 0.02, 8)), false);
  // Muting the sender does not erase already decoded/queued receiver audio.
  assert.equal(observation.inspect(sample(8192, 0.04, 12)), false);
  assert.equal(observation.inspect(sample(12288, 0.05, 16)), false);
  assert.equal(observation.inspect(sample(20480, 0.05, 24)), false, "171 ms is too short");
  assert.equal(observation.inspect(sample(28672, 0.05, 32)), true);
  assert.equal(observation.read().noisyWindows, 2);
  assert.ok(observation.read().lastWindow.durationSeconds >= 0.3);
});

test("continuous audible input is a failed control even with advancing real sample and packet counters", () => {
  const observation = createLegacyBrowserSilenceObservation();
  for (let report = 0; report <= 40; report += 1) {
    assert.equal(observation.inspect(sample(report * 4800, report * 0.01, report * 5)), false,
      "the caller's three-second deadline must expire for a still-audible source");
  }
  assert.equal(observation.read().noisyWindows, 40);
});

test("delayed or missing PCM observations never prove silence even when RTP keeps arriving", () => {
  const observation = createLegacyBrowserSilenceObservation();
  for (let report = 0; report <= 40; report += 1) {
    assert.equal(observation.inspect(sample(4096, 0.02, 10 + report)), false);
  }
  assert.equal(observation.read().lastWindow.samples, 0);
});

test("silent PCM without any newly received RTP cannot pass", () => {
  const observation = createLegacyBrowserSilenceObservation();
  for (let report = 0; report <= 40; report += 1) {
    assert.equal(observation.inspect(sample(4096 + report * 4800, 0.02, 10)), false);
  }
  assert.equal(observation.read().lastWindow.packets, 0);
});

test("the original strict energy ceiling is retained and a noisy interval restarts the sustained observation", () => {
  const observation = createLegacyBrowserSilenceObservation();
  assert.equal(observation.inspect(sample(0, 0, 0)), false);
  assert.equal(observation.inspect(sample(14_400, 0.0001, 15)), false, "equal to the ceiling is not silence");
  assert.equal(observation.inspect(sample(19_200, 0.0001, 20)), false, "previous samples cannot count toward the new silent interval");
  assert.equal(observation.inspect(sample(28_800, 0.0001, 30)), true);
});

test("PCM duration follows the receiver sample rate, not the runner's polling interval", () => {
  const observation = createLegacyBrowserSilenceObservation();
  assert.equal(observation.inspect(sample(0, 0, 0, 44_100)), false);
  assert.equal(observation.inspect(sample(13_229, 0, 10, 44_100)), false);
  assert.equal(observation.inspect(sample(13_230, 0, 11, 44_100)), true);
});

for (const invalid of [
  { samples: null }, { samples: -1 }, { energy: Number.NaN }, { packets: null }, { sampleRate: 0 },
]) {
  test(`unavailable PCM/RTP fields fail explicitly: ${Object.keys(invalid)[0]}=${String(Object.values(invalid)[0])}`, () => {
    const observation = createLegacyBrowserSilenceObservation();
    assert.throws(() => observation.inspect({ ...sample(4096, 0.02, 10), ...invalid }), /Missing or invalid/);
  });
}

for (const replacement of [sample(2048, 0.02, 10), sample(4096, 0.01, 10), sample(4096, 0.02, 5), sample(4096, 0.02, 10, 44_100)]) {
  test(`changed receiver counters cannot be mistaken for silence: ${JSON.stringify(replacement)}`, () => {
    const observation = createLegacyBrowserSilenceObservation();
    observation.inspect(sample(4096, 0.02, 10));
    assert.throws(() => observation.inspect(replacement), /changed identity or moved backwards/);
  });
}
