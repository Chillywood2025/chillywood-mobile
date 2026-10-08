// Offline, exact-input local repair. No install hook, registry mutation or network.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTarGzip } from '../../scripts/build-supabase-presence-backport.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
export const OUTPUT = 'chillywood-node-forge-safe-1.4.0-chillywood.1.tgz';
const sourceIntegrity = 'sha512-LarFH0+6VfriEhqMMcLX2F7SwSXeWwnEAJEsYm5QKWchiVYVvJyV9v7UDvUv+w5HO23ZpQTXDv/GxdDdMyOuoQ==';
const sourceSha256 = 'bf9d7ca0d774235354697bd4b5e642af6505e7ce2066762c3b855138cf870820';
const sourceTreeSha256 = '0f7eccb60abe54fbb129532f52c28d1ce8f2c5b221c9d942500b221c531d75fe';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const integrity = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const treeHash = files => sha256([...files.keys()].sort().map(file => `${file}\0${sha256(files.get(file))}\n`).join(''));
const patches = [
  {
    file: 'lib/rsa.js', sha256: 'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50',
    before: '            obj.value.length !== 2) {',
    after: `            obj.value.length !== 2 ||
            obj.value[0].value.length !== (('parameters' in capture) ? 2 : 1) ||
            ('parameters' in capture && capture.parameters !== '')) {`,
  },
  {
    file: 'dist/forge.all.min.js', sha256: 'cb9ba4045a81825f8edb646c38d53a1ac30ce07665bf26042c8dea86d7208642',
    before: '!s.validate(a,d,o,c)||2!==a.value.length',
    after: '!s.validate(a,d,o,c)||2!==a.value.length||a.value[0].value.length!==("parameters"in o?2:1)||("parameters"in o&&o.parameters!=="")',
  },
  {
    file: 'dist/forge.min.js', sha256: 'd9b9074e6861200d676e25dcfe97889db5e8f4150bb766d29c491ad709a51b58',
    before: '!s.validate(n,d,o,c)||2!==n.value.length',
    after: '!s.validate(n,d,o,c)||2!==n.value.length||n.value[0].value.length!==("parameters"in o?2:1)||("parameters"in o&&o.parameters!=="")',
  },
];

export function patchFiles(originalFiles) {
  assert.equal(treeHash(originalFiles), sourceTreeSha256, 'Unknown upstream node-forge tree');
  const files = new Map([...originalFiles].map(([file, bytes]) => [file, Buffer.from(bytes)]));
  for (const patch of patches) {
    assert.equal(sha256(files.get(patch.file)), patch.sha256, `Unknown ${patch.file}`);
    let source = files.get(patch.file).toString('utf8');
    assert.equal(source.split(patch.before).length, 2, `Ambiguous patch anchor: ${patch.file}`);
    source = source.replace(patch.before, patch.after);
    if (patch.file.startsWith('dist/')) {
      const comment = `\n//# sourceMappingURL=${path.basename(patch.file)}.map`;
      assert.equal(source.split(comment).length, 2, `Unknown source map: ${patch.file}`);
      source = source.replace(comment, '');
      assert.equal(files.delete(`${patch.file}.map`), true);
    }
    files.set(patch.file, Buffer.from(source));
  }
  const metadata = JSON.parse(files.get('package.json'));
  assert.equal(metadata.name, 'node-forge');
  assert.equal(metadata.version, '1.4.0');
  metadata.name = '@chillywood/node-forge-safe';
  metadata.version = '1.4.0-chillywood.1';
  metadata.private = true;
  metadata.chillywoodBackport = {
    upstreamPackage: 'node-forge@1.4.0',
    upstreamIntegrity: sourceIntegrity,
    advisory: 'GHSA-86w9-cpqp-85rv',
    proposedUpstreamRepairs: [
      { pullRequest: 'https://github.com/digitalbazaar/forge/pull/1152', commit: 'ceba34402e329f0365134f23fe19898756527d65' },
      { pullRequest: 'https://github.com/digitalbazaar/forge/pull/1157', commit: '683ab3344899cc08a581e4d5675a33e87aff7b04' },
    ],
    status: 'Locally maintained repair; upstream proposals were unmerged on 2026-10-08.',
    scope: 'Require exact nested DigestAlgorithm element count and an empty optional NULL in CommonJS and both browser bundles.',
  };
  files.set('package.json', Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`));
  return files;
}

function octal(header, value, start, length) {
  const digits = value.toString(8).padStart(length - 1, '0');
  assert.ok(digits.length < length);
  header.write(`${digits}\0`, start, length, 'ascii');
}
function tar(files) {
  const blocks = [];
  for (const file of [...files.keys()].sort()) {
    const name = `package/${file}`;
    assert.ok(Buffer.byteLength(name) < 100);
    const bytes = files.get(file), header = Buffer.alloc(512);
    header.write(name, 0, 'utf8');
    octal(header, 0o644, 100, 8); octal(header, 0, 108, 8); octal(header, 0, 116, 8);
    octal(header, bytes.length, 124, 12); octal(header, 0, 136, 12);
    header.fill(32, 148, 156); header[156] = 48;
    header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii');
    header.write(`${[...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function gzip(bytes) {
  // Stored DEFLATE avoids compressor/version-dependent release artifact bytes.
  const chunks = [Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 255])];
  for (let offset = 0; offset < bytes.length; offset += 65535) {
    const size = Math.min(65535, bytes.length - offset), header = Buffer.alloc(5);
    header[0] = offset + size === bytes.length ? 1 : 0;
    header.writeUInt16LE(size, 1); header.writeUInt16LE(size ^ 0xffff, 3);
    chunks.push(header, bytes.subarray(offset, offset + size));
  }
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32LE(crc32(bytes), 0); trailer.writeUInt32LE(bytes.length >>> 0, 4);
  return Buffer.concat([...chunks, trailer]);
}

export async function build({ write = false } = {}) {
  const originalArchive = await readFile(path.join(directory, 'upstream/node-forge-1.4.0.tgz'));
  assert.equal(integrity(originalArchive), sourceIntegrity, 'Registry integrity mismatch');
  assert.equal(sha256(originalArchive), sourceSha256, 'Registry archive mismatch');
  const originalFiles = readTarGzip(originalArchive);
  const files = patchFiles(originalFiles), archive = gzip(tar(files));
  assert.deepEqual(archive, gzip(tar(patchFiles(originalFiles))), 'Non-deterministic build');
  const changes = [...new Set([...originalFiles.keys(), ...files.keys()])].sort().flatMap(file => {
    const before = originalFiles.get(file), after = files.get(file);
    return before && after && before.equals(after) ? [] : [{ file, action: after ? 'modified' : 'removed',
      originalSha256: before ? sha256(before) : null, patchedSha256: after ? sha256(after) : null }];
  });
  const manifest = { schemaVersion: 1,
    upstream: { package: 'node-forge@1.4.0', registryUrl: 'https://registry.npmjs.org/node-forge/-/node-forge-1.4.0.tgz',
      integrity: sourceIntegrity, sha256: sourceSha256, treeSha256: sourceTreeSha256, fileCount: originalFiles.size },
    output: { package: '@chillywood/node-forge-safe@1.4.0-chillywood.1', file: OUTPUT,
      integrity: integrity(archive), sha256: sha256(archive), treeSha256: treeHash(files), fileCount: files.size, bytes: archive.length },
    upstreamRsaTests: { repository: 'digitalbazaar/forge', ref: 'v1.4.0', path: 'tests/unit/rsa.js',
      gitBlob: '17433ccf30611e9d8fd5b1b4ff609e2bb772c295', sha256: '77c425e50c0cd19529636bb45d33f1707e1ce56b6132c4fe1cc19612184f355d' },
    archiveFormat: 'Sorted regular POSIX ustar files; fixed mode 0644, uid/gid/mtime zero; gzip stored DEFLATE, mtime zero, OS255.',
    changes };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(sha256(await readFile(path.join(directory, 'upstream/rsa.test.txt'))), manifest.upstreamRsaTests.sha256);
  if (write) {
    await writeFile(path.join(directory, OUTPUT), archive);
    await writeFile(path.join(directory, 'manifest.json'), manifestBytes);
  } else {
    assert.deepEqual(await readFile(path.join(directory, OUTPUT)), archive, 'Committed backport differs from verified rebuild');
    assert.deepEqual(await readFile(path.join(directory, 'manifest.json')), manifestBytes, 'Backport manifest differs');
  }
  return { archive, files, manifest };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.slice(2).every(arg => ['--check', '--write'].includes(arg)));
  const result = await build({ write: process.argv.includes('--write') });
  process.stdout.write(`${result.manifest.output.package}: verified ${result.manifest.changes.length} changes; ${result.manifest.output.sha256}\n`);
}
