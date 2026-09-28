import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  BACKPORTS,
  VENDOR_DIRECTORY,
  buildBackports,
  createBackport,
  patchFiles,
  readTarGzip,
} from '../scripts/build-supabase-presence-backport.mjs';

const license = await readFile(path.join(VENDOR_DIRECTORY, 'LICENSE'));
const manifest = JSON.parse(await readFile(path.join(VENDOR_DIRECTORY, 'manifest.json'), 'utf8'));
const fixtures = await Promise.all(BACKPORTS.map(async (definition) => {
  const originalArchive = await readFile(path.join(VENDOR_DIRECTORY, 'upstream', definition.upstreamFile));
  const patchedArchive = await readFile(path.join(VENDOR_DIRECTORY, definition.outputFile));
  return {
    definition,
    originalArchive,
    patchedArchive,
    originalFiles: readTarGzip(originalArchive),
    patchedFiles: readTarGzip(patchedArchive),
  };
}));
const expectedChanges = {
  '@supabase/realtime-js': [
    'LICENSE',
    'dist/main/phoenix/presenceAdapter.js',
    'dist/main/phoenix/presenceAdapter.js.map',
    'dist/module/phoenix/presenceAdapter.js',
    'dist/module/phoenix/presenceAdapter.js.map',
    'package.json',
    'src/phoenix/presenceAdapter.ts',
  ],
  '@supabase/supabase-js': ['LICENSE', 'dist/umd/supabase.js', 'package.json'],
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('Presence backport committed artifacts match the offline deterministic rebuild', async () => {
  assert.deepEqual(await buildBackports(), manifest);
});

for (const fixture of fixtures) {
  const { definition, originalArchive, patchedArchive, originalFiles, patchedFiles } = fixture;
  const label = definition.name;

  test(`${label} backport rebuild is idempotent and does not mutate registry inputs`, () => {
    const originalSnapshot = new Map([...originalFiles].map(([file, bytes]) => [file, Buffer.from(bytes)]));
    const first = createBackport(definition, originalArchive, license);
    const second = createBackport(definition, originalArchive, license);
    assert.deepEqual(first.archive, second.archive);
    assert.deepEqual(first.archive, patchedArchive);
    assert.deepEqual(patchFiles(definition, originalFiles, license), patchedFiles);
    assert.deepEqual(originalFiles, originalSnapshot);
    assert.deepEqual(readTarGzip(originalArchive), originalSnapshot);
    // Applying a patch to an already patched tree is rejected, never double-applied.
    assert.throws(() => patchFiles(definition, patchedFiles, license), /unknown source tree/);
  });

  test(`${label} backport rejects unknown archive, source, metadata, license, and package definitions`, () => {
    const changedArchive = Buffer.from(originalArchive);
    changedArchive[changedArchive.length - 1] ^= 1;
    assert.throws(() => createBackport(definition, changedArchive, license), /registry integrity mismatch/);
    for (const file of [definition.sourcePatches[0].file, 'package.json', 'README.md']) {
      const changedFiles = new Map(originalFiles);
      changedFiles.set(file, Buffer.concat([changedFiles.get(file), Buffer.from('\n')]));
      assert.throws(() => patchFiles(definition, changedFiles, license), /unknown source tree/);
    }
    const extraFiles = new Map(originalFiles);
    extraFiles.set('unexpected.js', Buffer.from('throw new Error("unexpected")'));
    assert.throws(() => patchFiles(definition, extraFiles, license), /unknown source tree/);
    const incompleteFiles = new Map(originalFiles);
    incompleteFiles.delete('README.md');
    assert.throws(() => patchFiles(definition, incompleteFiles, license), /unknown source tree/);
    assert.throws(() => patchFiles(definition, originalFiles, Buffer.concat([license, Buffer.from('\n')])), /LICENSE: unknown source SHA256/);
    assert.throws(() => createBackport({ ...definition, version: '2.100.1' }, originalArchive, license), /Unknown backport definition/);
  });

  test(`${label} backport changes only the reviewed files and records exact hashes`, () => {
    const recorded = manifest.packages.find((entry) => entry.name === label);
    const allFiles = [...new Set([...originalFiles.keys(), ...patchedFiles.keys()])].sort();
    const changed = allFiles.filter((file) => !originalFiles.get(file)?.equals(patchedFiles.get(file) ?? Buffer.alloc(0)));
    assert.deepEqual(changed, expectedChanges[label]);
    assert.deepEqual(recorded.changes.map(({ file }) => file), expectedChanges[label]);
    for (const change of recorded.changes) {
      const original = originalFiles.get(change.file);
      const patched = patchedFiles.get(change.file);
      assert.equal(change.originalSha256, original ? sha256(original) : null);
      assert.equal(change.patchedSha256, patched ? sha256(patched) : null);
      assert.equal(change.action, !original ? 'added' : !patched ? 'removed' : 'modified');
    }
    assert.equal(recorded.output.sha256, sha256(patchedArchive));
    assert.equal(recorded.output.integrity, `sha512-${createHash('sha512').update(patchedArchive).digest('base64')}`);
    assert.deepEqual(patchedFiles.get('LICENSE'), license);
    for (const output of ['dist/main/phoenix/presenceAdapter.js', 'dist/module/phoenix/presenceAdapter.js']) {
      if (label !== '@supabase/realtime-js') continue;
      assert.ok(!patchedFiles.has(`${output}.map`));
      assert.ok(!patchedFiles.get(output).toString('utf8').includes('sourceMappingURL='));
    }
  });

  test(`${label} backport preserves dependencies, entry points, engine requirements, and other package metadata`, () => {
    const original = JSON.parse(originalFiles.get('package.json').toString('utf8'));
    const patched = JSON.parse(patchedFiles.get('package.json').toString('utf8'));
    assert.equal(original.version, '2.100.0');
    assert.equal(patched.version, '2.100.0-chillywood.1');
    assert.deepEqual(patched.chillywoodBackport, {
      upstreamVersion: '2.100.0',
      upstreamCommit: '31dc1b0f4e9b21adb056cb799a2702bf1484919f',
      fix: 'Presence callback metadata descriptor copy (supabase-js#2566)',
    });
    patched.version = original.version;
    delete patched.chillywoodBackport;
    assert.deepEqual(patched, original);
    assert.equal(patched.scripts.postinstall, undefined);
  });
}
