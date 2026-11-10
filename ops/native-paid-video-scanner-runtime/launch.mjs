import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { preflight } from './gate.mjs';
import { acquireRuntimeLock, releaseRuntimeLock } from './state-lock.mjs';
// The protocol CLI owns polling, leases, object reads, scanning, completion and
// uncertainty reconciliation. This wrapper never retries it.
let lock;
try {
  assert.ok(process.argv.length > 2, 'An explicit scanner operation is required');
  await preflight();
  lock = await acquireRuntimeLock('/state');
  const child = spawn('/usr/local/bin/node', ['/app/ops/isolated-paid-video-worker/r2-scanner-cli.mjs', ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env });
  const terminate = () => child.kill('SIGTERM');
  process.on('SIGTERM', terminate); process.on('SIGINT', terminate);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (status, signal) => resolve(signal ? 128 : status ?? 1)); });
  process.off('SIGTERM', terminate); process.off('SIGINT', terminate);
  process.exitCode = code;
} catch {
  process.stderr.write('native_scanner_stopped_before_or_during_job\n'); process.exitCode = 1;
} finally {
  if (lock) await releaseRuntimeLock(lock);
}
// SIGKILL/crash can leave runtime.lock. Never auto-remove it. The operator must
// verify no active process/lease and reconcile pending.json before removal.
