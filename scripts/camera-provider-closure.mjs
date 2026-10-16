import assert from 'node:assert/strict';

// Checks the resolved application runtime closure, not declarations alone.
// Firebase's unrelated transport libraries are outside this camera-provider gate.
export function assertLocalCameraProviderClosure(artifacts, manifests, runtime) {
  assert.ok(Array.isArray(artifacts) && artifacts.length > 0, 'Actual runtime artifacts are required');
  for (const artifact of artifacts) {
    assert.equal(typeof artifact.group, 'string');
    assert.equal(typeof artifact.name, 'string');
    const {group, name} = artifact;
    const forbidden = group === 'com.google.mlkit'
      || /mlkit|code-scanner/iu.test(name)
      || (group === 'com.google.mediapipe' && /^tasks-/u.test(name))
      || (group === 'com.google.android.gms' && /tflite/iu.test(name));
    assert.equal(forbidden, false, `Forbidden camera provider: ${group}:${name}`);
  }
  assert.ok(runtime && typeof runtime === 'object', 'Reviewed runtime pins are required');
  for (const [coordinate, sha256] of [[runtime.coordinate, runtime.sha256], [runtime.apiCoordinate, runtime.apiSha256]]) {
    assert.equal(typeof coordinate, 'string');
    assert.match(sha256, /^[a-f0-9]{64}$/u);
    const [group, name, version] = coordinate.split(':');
    const matches = artifacts.filter(value => value.group === group && value.name === name);
    assert.equal(matches.length, 1, `Exactly one resolved runtime required: ${coordinate}`);
    assert.equal(matches[0].version, version, `Resolved runtime version must match reviewed artifact: ${coordinate}`);
    assert.equal(matches[0].sha256, sha256, `Resolved runtime bytes must match reviewed AAR: ${coordinate}`);
  }
  assert.ok(Array.isArray(manifests) && manifests.length > 0, 'Actual merged app manifests are required');
  for (const source of manifests) {
    assert.equal(typeof source, 'string');
    assert.match(source, /<manifest\b/u, 'Inspect actual merged XML');
    assert.doesNotMatch(source, /com\.google\.mlkit|barcode_ui|com\.google\.mediapipe|play-services-tflite/iu,
      'No camera provider/downloader metadata may enter the merged application');
  }
}
