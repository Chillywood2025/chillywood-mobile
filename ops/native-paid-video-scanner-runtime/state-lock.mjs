import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
export async function syncDirectory(directory) {
  const handle = await fs.open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function acquireRuntimeLock(directory) {
  assert.ok(path.isAbsolute(directory) && path.resolve(directory) === directory);
  const parent = await fs.lstat(directory);
  assert.ok(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o077) === 0 && parent.uid === process.getuid());
  assert.equal(await fs.realpath(directory), directory, 'State parent must be canonical');
  const file = path.join(directory, 'runtime.lock');
  const handle = await fs.open(file, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    await handle.sync();
    await syncDirectory(directory);
    return { handle, file, directory, identity: await handle.stat() };
  } catch (error) {
    await handle.close();
    await fs.unlink(file);
    await syncDirectory(directory);
    throw error;
  }
}
export async function releaseRuntimeLock(lock) {
  try {
    const current = await fs.lstat(lock.file);
    assert.ok(current.isFile() && !current.isSymbolicLink() && current.nlink === 1
      && current.dev === lock.identity.dev && current.ino === lock.identity.ino, 'Runtime lock changed');
    await fs.unlink(lock.file);
    await syncDirectory(lock.directory);
  } finally { await lock.handle.close(); }
}
