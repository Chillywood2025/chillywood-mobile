import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {prepareNativeCameraGradle} from '../../scripts/lib/native-camera-gradle-acquisition.mjs';
import {GRADLE_URL, GRADLE_SHA256} from '../../scripts/lib/incoming-call-gradle-download.mjs';
const original = `distributionUrl=${GRADLE_URL.replace(':', '\\:')}\nnetworkTimeout=10000\nvalidateDistributionUrl=true\nnetworkTimeout=60000\n`;
const sha = x => createHash('sha256').update(x).digest('hex');
function fixture(t, contents = original) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'camera-acquisition-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const wrapper = path.join(dir, 'gradle-wrapper.properties');
  fs.writeFileSync(wrapper, contents);return {dir, wrapper};
}

test('verified acquisition precedes local wrapper mutation and receipts bind both wrappers plus helper', t => {
  const {dir, wrapper} = fixture(t);let calls = 0;
  const result = prepareNativeCameraGradle(wrapper, dir, {download: destination => {
    calls++;assert.equal(fs.readFileSync(wrapper, 'utf8'), original);
    assert.equal(destination, path.join(dir, 'camera-gradle-8.14.3-bin.zip'));
    return destination; // Mock only: shared downloader tests prove actual byte verification.
  }});
  const effective = fs.readFileSync(wrapper, 'utf8');
  assert.equal(calls, 1);
  assert.ok(effective.includes(`distributionUrl=${pathToFileURL(path.join(dir, 'camera-gradle-8.14.3-bin.zip')).href}`));
  assert.ok(effective.includes(`distributionSha256Sum=${GRADLE_SHA256}`));
  assert.ok(effective.includes('validateDistributionUrl=true'));
  assert.equal(result.generatedWrapperSha256, sha(original));
  assert.equal(result.effectiveWrapperSha256, sha(effective));
  assert.equal(result.officialUrl, GRADLE_URL);assert.equal(result.artifactSha256, GRADLE_SHA256);
  for (const field of ['acquisitionHelperSha256', 'wrapperAdapterSha256']) assert.match(result[field], /^[a-f0-9]{64}$/u);
});

test('failed acquisition or wrong returned path cannot mutate the wrapper', t => {
  for (const download of [() => {throw Error('SHA mismatch');}, () => '/other.zip']) {
    const {dir, wrapper} = fixture(t);assert.throws(() => prepareNativeCameraGradle(wrapper, dir, {download}));
    assert.equal(fs.readFileSync(wrapper, 'utf8'), original);
  }
});

test('unexpected version, duplicate URL and existing checksum fail before acquisition', t => {
  for (const input of [original.replace('8.14.3', '8.14.4'), original + 'distributionUrl=https://other.example/a.zip\n', original + 'distributionSha256Sum=unexpected\n']) {
    const {dir, wrapper} = fixture(t, input);let calls = 0;
    assert.throws(() => prepareNativeCameraGradle(wrapper, dir, {download: () => {calls++;}}));
    assert.equal(calls, 0);assert.equal(fs.readFileSync(wrapper, 'utf8'), input);
  }
});

test('compiler generation-only remains offline and effective source hash is captured before unchanged Gradle execution', () => {
  const source = fs.readFileSync(new URL('../../scripts/compile-native-camera-effects.mjs', import.meta.url), 'utf8');
  const skip = source.indexOf('if (generateOnly) continue;');
  const acquire = source.indexOf('receipts.android.gradleDistribution = prepareNativeCameraGradle(');
  const effective = source.indexOf('receipts.android.generatedSourceSha256 = effectiveDigest.digest("hex")');
  const compile = source.indexOf('const output = run("./gradlew",');
  assert.ok(skip > 0 && acquire > skip && effective > acquire && compile > effective);
  assert.equal((source.match(/prepareNativeCameraGradle\(/gu) ?? []).length, 1);
  assert.equal((source.match(/const output = run\("\.\/gradlew",/gu) ?? []).length, 1);
  assert.ok(source.includes('receipts.android.generatedBeforeAcquisitionSha256 = receipts.android.generatedSourceSha256'));
});
