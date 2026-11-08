import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { downloadIncomingCallGradle, GRADLE_URL, GRADLE_SHA256 } from '../../scripts/lib/incoming-call-gradle-download.mjs';

test('incoming-call acquisition retries only bounded transport failures and verifies the pinned artifact before wrapper use', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'incoming-wrapper-test-'));
  let serial = 0;
  const fixture = (responses, { badDigest = false, actualDigest = false, duration = 100 } = {}) => {
    const destination = path.join(directory, `${serial++}.zip`), calls = [], delays = [];
    let time = 0, verified = false;
    const deps = {
      now: () => time, wait: delay => { delays.push(delay); time += delay; },
      run(command, args, options) {
        assert.equal(command, 'curl'); assert.equal(args.at(-1), GRADLE_URL);
        assert.ok(args.includes('--proto-redir')); assert.ok(args.includes('--max-filesize'));
        assert.equal(args.includes('--retry'), false); assert.ok(options.timeout <= 111_000);
        const partial = args[args.indexOf('--output') + 1];
        assert.equal(fs.existsSync(destination), false); assert.equal(fs.existsSync(partial), false);
        fs.writeFileSync(partial, 'fixture'); calls.push({ args, options }); time += duration;
        return responses[Math.min(calls.length - 1, responses.length - 1)];
      },
      ...(!actualDigest ? { sha256(file) { assert.equal(file, `${destination}.partial`); assert.equal(fs.existsSync(destination), false); verified = true; return badDigest ? 'wrong' : GRADLE_SHA256; } } : {}),
    };
    return { destination, calls, delays, run: () => downloadIncomingCallGradle(destination, deps), verified: () => verified };
  };
  const success = { status: 0, stdout: '200' };
  try {
    for (const response of [
      ...[5, 6, 7, 18, 28, 35, 52, 55, 56].map(status => ({ status, stdout: '000' })),
      ...[408, 500, 502, 503, 504].map(http => ({ status: 22, stdout: String(http) })),
      { status: null, error: { code: 'ETIMEDOUT' } },
    ]) {
      const f = fixture([response, success]); assert.equal(f.run(), f.destination);
      assert.equal(f.calls.length, 2); assert.deepEqual(f.delays, [1000]); assert.equal(f.verified(), true);
      assert.equal(fs.existsSync(`${f.destination}.partial`), false); assert.equal(fs.readFileSync(f.destination, 'utf8'), 'fixture');
    }
    for (const response of [
      ...[400, 401, 403, 404, 429, 501].map(http => ({ status: 22, stdout: String(http) })),
      ...[23, 26, 60, 63].map(status => ({ status, stdout: '000' })),
      { status: null, error: { code: 'ENOENT' } }, { status: 0, stdout: '206' },
    ]) {
      const f = fixture([response, success]); assert.throws(f.run); assert.equal(f.calls.length, 1);
      assert.equal(fs.existsSync(f.destination), false); assert.equal(fs.existsSync(`${f.destination}.partial`), false);
    }
    for (const options of [{ badDigest: true }, { actualDigest: true }]) {
      const f = fixture([success], options); assert.throws(f.run, /SHA256 mismatch/); assert.equal(f.calls.length, 1);
      assert.equal(fs.existsSync(f.destination), false); assert.equal(fs.existsSync(`${f.destination}.partial`), false);
    }
    const late = fixture([success], { duration: 360_001 }); assert.throws(late.run, /six-minute budget/);
    assert.equal(late.calls.length, 1); assert.equal(fs.existsSync(late.destination), false); assert.equal(fs.existsSync(`${late.destination}.partial`), false);
    const existing = fixture([success]); fs.writeFileSync(existing.destination, 'already-owned');
    assert.throws(existing.run, /destination must be fresh/); assert.equal(existing.calls.length, 0);
    assert.equal(fs.readFileSync(existing.destination, 'utf8'), 'already-owned');
    const exhausted = fixture([{ status: 28 }]); assert.throws(exhausted.run); assert.equal(exhausted.calls.length, 3); assert.deepEqual(exhausted.delays, [1000, 2000]);
    const budget = fixture([{ status: 28 }], { duration: 359_000 }); assert.throws(budget.run, /six-minute budget/); assert.equal(budget.calls.length, 1);
    const source = fs.readFileSync(new URL('../../scripts/test-android-incoming-call-deadline.mjs', import.meta.url), 'utf8');
    assert.equal(GRADLE_URL, 'https://services.gradle.org/distributions/gradle-8.14.3-bin.zip');
    assert.equal(GRADLE_SHA256, 'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531');
    assert.match(source, /const distribution = downloadIncomingCallGradle\(path.join\(output, "gradle-8.14.3-bin.zip"\)\);/u);
    assert.match(source, /distributionUrl=\$\{pathToFileURL\(distribution\).href\}.*distributionSha256Sum=\$\{GRADLE_SHA256\}/u);
    assert.ok(source.indexOf('downloadIncomingCallGradle(path.join') < source.indexOf('fs.appendFileSync(propertiesPath'));
    const integration = source.slice(source.indexOf('  const distribution ='), source.indexOf('  const versions ='));
    for (const failsVerification of [false, true]) {
      const writes = [], local = path.join(directory, 'verified distribution.zip'); let verified = false;
      const execute = () => vm.runInNewContext(integration, {
        path, pathToFileURL, output: directory, propertiesPath: 'wrapper.properties', GRADLE_SHA256,
        downloadIncomingCallGradle() { if (failsVerification) throw Error('SHA256 mismatch'); verified = true; return local; },
        fs: { appendFileSync(file, value) { assert.equal(verified, true); writes.push([file, value]); } },
      });
      if (failsVerification) { assert.throws(execute, /SHA256 mismatch/); assert.equal(writes.length, 0); }
      else { execute(); assert.deepEqual(writes, [['wrapper.properties', `\nnetworkTimeout=60000\ndistributionUrl=${pathToFileURL(local).href}\ndistributionSha256Sum=${GRADLE_SHA256}\n`]]); }
    }

    assert.match(source, /assert\(properties\.includes\("gradle-8\.14\.3-bin\.zip"\)/u);
    assert.match(source, /testDebugUnitTest[\s\S]*?timeout: 20 \* 60_000/u);
    for (const key of ['failures', 'errors', 'skipped']) assert.ok(source.includes(`${key}="0"`));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
