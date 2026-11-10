import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateDefinitionPointer, readDefinitionPointer } from './definition-snapshots.mjs';
import { requireMonotonicDefinitions, loadPreviousDefinitionManifest } from './refresh-definitions.mjs';
const hash = 'a'.repeat(64);
test('strict definition pointer admits only its exact content-addressed snapshot', () => {
  assert.equal(validateDefinitionPointer({ protocol: 'scpv-definition-pointer-v1', manifestSha256: hash }), hash);
  for (const value of [null, { protocol: 'scpv-definition-pointer-v1', manifestSha256: '../escape' },
    { protocol: 'scpv-definition-pointer-v1', manifestSha256: hash, directory: '/elsewhere' },
    { protocol: 'other', manifestSha256: hash }]) assert.throws(() => validateDefinitionPointer(value));
});
test('pointer reads require private real root and a non-symlink bounded file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-definition-pointer-')); await fs.chmod(root, 0o700);
  try {
    const pointer = JSON.stringify({ protocol: 'scpv-definition-pointer-v1', manifestSha256: hash });
    await fs.writeFile(path.join(root, 'active.json'), pointer, { mode: 0o600 });
    assert.equal(await readDefinitionPointer(root), hash);
    await fs.rename(path.join(root, 'active.json'), path.join(root, 'real.json'));
    await fs.symlink('real.json', path.join(root, 'active.json'));
    await assert.rejects(readDefinitionPointer(root));
    await fs.unlink(path.join(root, 'active.json'));
    await fs.writeFile(path.join(root, 'active.json'), 'x'.repeat(1025), { mode: 0o600 });
    await assert.rejects(readDefinitionPointer(root));
  } finally { await fs.rm(root, { recursive: true }); }
});
test('snapshot promotion never accepts rollback or same-version substitution', () => {
  const old = { files: [{ filename: 'daily.cvd', version: 10, sha256: hash }] };
  assert.doesNotThrow(() => requireMonotonicDefinitions(old, { files: [{ filename: 'daily.cvd', version: 11, sha256: 'b'.repeat(64) }] }));
  assert.doesNotThrow(() => requireMonotonicDefinitions(old, old));
  for (const files of [[], [{ filename: 'daily.cvd', version: 9, sha256: hash }], [{ filename: 'daily.cvd', version: 10, sha256: 'b'.repeat(64) }]])
    assert.throws(() => requireMonotonicDefinitions(old, { files }));
});
test('broken published pointer cannot be treated as first initialization', async () => {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), 'native-definition-baseline-'));
  const root = await fs.realpath(created); await fs.chmod(root, 0o700);
  try {
    assert.equal(await loadPreviousDefinitionManifest(root), null);
    await fs.writeFile(path.join(root, 'active.json'), JSON.stringify({ protocol: 'scpv-definition-pointer-v1', manifestSha256: hash }), { mode: 0o600 });
    await assert.rejects(loadPreviousDefinitionManifest(root), { code: 'ENOENT' });
    await fs.mkdir(path.join(root, 'snapshots', hash), { recursive: true, mode: 0o700 });
    await assert.rejects(loadPreviousDefinitionManifest(root), { code: 'ENOENT' });
  } finally { await fs.rm(root, { recursive: true }); }
});
