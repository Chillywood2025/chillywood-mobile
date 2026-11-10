import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { acquireRuntimeLock, releaseRuntimeLock } from './state-lock.mjs';
test('exclusive durable lock prevents a concurrent supervisor and safely releases', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-scanner-lock-')); await fs.chmod(root, 0o700);
  try {
    const lock = await acquireRuntimeLock(root);
    assert.equal((await fs.stat(lock.file)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await fs.readFile(lock.file, 'utf8')).pid, process.pid);
    await assert.rejects(acquireRuntimeLock(root), { code: 'EEXIST' });
    await releaseRuntimeLock(lock); await assert.rejects(fs.stat(lock.file), { code: 'ENOENT' });
    const next = await acquireRuntimeLock(root); await releaseRuntimeLock(next);
  } finally { await fs.rm(root, { recursive: true }); }
});
test('state lock rejects a linked parent or a preexisting symlink lock', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-scanner-lock-')); await fs.chmod(root, 0o700);
  try {
    await fs.symlink(root, root + '-link');
    await assert.rejects(acquireRuntimeLock(root + '-link'));
    await fs.symlink('absent', path.join(root, 'runtime.lock'));
    await assert.rejects(acquireRuntimeLock(root), { code: 'EEXIST' });
  } finally { await fs.unlink(root + '-link'); await fs.rm(root, { recursive: true }); }
});
