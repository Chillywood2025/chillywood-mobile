import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const GRADLE_URL = 'https://services.gradle.org/distributions/gradle-8.14.3-bin.zip';
export const GRADLE_SHA256 = 'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531';
const MAX_BYTES = 160 * 1024 * 1024;
const NETWORK_ERRORS = new Set([5, 6, 7, 18, 28, 35, 52, 55, 56]);
const TRANSIENT_HTTP = new Set([408, 500, 502, 503, 504]);
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sleep = milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

// Only artifact acquisition retries. A digest mismatch, filesystem failure or
// non-transient HTTP response is fatal; Gradle compilation/tests never retry.
export function downloadIncomingCallGradle(destination, { run = spawnSync, now = Date.now, wait = sleep, sha256 = digest } = {}) {
  const partial = `${destination}.partial`, deadline = now() + 360_000;
  assert(!fs.existsSync(destination), 'Gradle destination must be fresh.');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      fs.rmSync(partial, { force: true });
      const remaining = deadline - now();
      assert(remaining > 1000, 'Gradle acquisition exceeded six-minute budget.');
      const timeout = Math.min(111_000, remaining);
      const result = run('curl', ['--fail', '--location', '--silent', '--show-error',
        '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '15',
        '--max-time', String(Math.floor((timeout - 1000) / 1000)), '--max-filesize', String(MAX_BYTES),
        '--output', partial, '--write-out', '%{http_code}', GRADLE_URL],
      { encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
      const http = Number(String(result.stdout ?? '').trim());
      if (!result.error && result.status === 0 && http === 200) {
        const size = fs.statSync(partial).size;
        assert(size > 0 && size <= MAX_BYTES, 'Invalid Gradle distribution size.');
        assert.equal(sha256(partial), GRADLE_SHA256, 'Gradle distribution SHA256 mismatch.');
        assert(now() < deadline, 'Gradle acquisition exceeded six-minute budget.');
        fs.renameSync(partial, destination);
        return destination;
      }
      // Parent process timeouts are bounded network acquisition failures. Other
      // spawn failures (missing curl, permissions, buffer overflow) are fatal.
      const transient = result.error ? result.error.code === 'ETIMEDOUT'
        : NETWORK_ERRORS.has(result.status) || result.status === 22 && TRANSIENT_HTTP.has(http);
      assert(transient && attempt < 2, `Gradle download failed (curl=${result.status}, HTTP=${http}): ${result.error?.message ?? result.stderr ?? ''}`);
      const delay = 1000 * (attempt + 1);
      assert(deadline - now() > delay + 1000, 'Gradle acquisition exceeded six-minute budget.');
      wait(delay);
    }
    throw Error('Gradle acquisition attempts exhausted.');
  } finally {
    fs.rmSync(partial, { force: true });
  }
}
