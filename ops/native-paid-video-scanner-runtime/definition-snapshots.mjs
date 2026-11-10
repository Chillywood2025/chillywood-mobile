import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { inspectDefinitions } from '../isolated-paid-video-worker/scan.mjs';
export function validateDefinitionPointer(pointer) {
  assert.ok(pointer && Object.keys(pointer).sort().join() === 'manifestSha256,protocol'
    && pointer.protocol === 'scpv-definition-pointer-v1' && /^[a-f0-9]{64}$/u.test(pointer.manifestSha256), 'Invalid definition pointer');
  return pointer.manifestSha256;
}
export async function readDefinitionPointer(root) {
  assert.ok(path.isAbsolute(root) && path.resolve(root) === root);
  const directory = await fs.lstat(root);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && (directory.mode & 0o077) === 0);
  assert.equal(await fs.realpath(root), root, 'Definition root cannot contain symlinks');
  const handle = await fs.open(path.join(root, 'active.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    assert.ok(stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= 1024 && (stat.mode & 0o022) === 0);
    return validateDefinitionPointer(JSON.parse(await handle.readFile('utf8')));
  } finally { await handle.close(); }
}
export async function resolveDefinitionSnapshot({ root, certificateDirectory, sigtool, now = Date.now() }) {
  const manifestSha256 = await readDefinitionPointer(root);
  const directory = path.join(root, 'snapshots', manifestSha256);
  assert.equal(await fs.realpath(directory), directory, 'Definition snapshot cannot contain symlinks');
  const manifest = await inspectDefinitions({ directory, certificateDirectory, sigtool, now });
  assert.equal(manifest.manifestSha256, manifestSha256, 'Definition pointer does not match authenticated snapshot');
  return { directory, manifestSha256 };
}
