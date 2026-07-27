import assert from "node:assert/strict";
import {
  androidVisualCanaryProof,
  buildAndroidVisualCanary,
  canonicalJson,
} from "./cognitive-android-visual-canary-manifest.mjs";

const first = buildAndroidVisualCanary();
const second = buildAndroidVisualCanary();
const third = buildAndroidVisualCanary();
const proof = androidVisualCanaryProof();

assert.equal(canonicalJson(first), canonicalJson(second));
assert.equal(canonicalJson(second), canonicalJson(third));
assert.equal(proof.canonicalRunsEqual, true);
assert.equal(first.sentinelKey, "visual_product_experience_sentinel");
assert.equal(first.platform, "android");
assert.equal(first.environment, "production");
assert.equal(first.physicalProofStatus, "installed_ui_observed");
assert.equal(first.resultStatus, "failed");
assert.equal(first.metricManifest.observationKind, "touch_target");
assert.equal(
  first.metricManifest.metrics.baselineState,
  "needs_product_baseline_review",
);
assert.equal(first.metricManifest.metrics.baselineComparisonHash, null);
assert.equal(
  first.metricManifest.metrics.evidenceQuality,
  "measured_installed",
);
assert.equal(first.metricManifest.metrics.providerState, "not_applicable");
assert.equal(
  first.metricManifest.evidenceHashes.includes(first.evidenceManifestHash),
  true,
);
assert.equal(Object.keys(first.metricManifest.metrics).length, 35);

console.log(
  JSON.stringify({
    ok: true,
    canonicalRunsEqual: proof.canonicalRunsEqual,
    canonicalBytes: proof.canonicalBytes,
    canonicalHash: proof.canonicalHash,
    metricManifestHash: proof.metricManifestHash,
  }),
);
