#!/usr/bin/env node
// Offline, exact-input backport packaging. No install hooks and no network access.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VENDOR_DIRECTORY = path.join(ROOT, 'vendor/supabase-presence-backport');
export const UPSTREAM_COMMIT = '31dc1b0f4e9b21adb056cb799a2702bf1484919f';
export const BACKPORT_VERSION = '2.100.0-chillywood.1';
const LICENSE_SHA256 = '334dd6820e2eaeab2064e7c59001b810566728a28a41a7c1dbf69bbee17d0936';
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;

const originalTs = `function transformState(presences: PresenceState) {
  return presences.metas.map((presence) => {
    presence['presence_ref'] = presence['phx_ref']

    delete presence['phx_ref']
    delete presence['phx_ref_prev']

    return presence
  }) as RealtimePresenceType[]
}`;
const patchedTs = `function transformState(presences: PresenceState) {
  return presences.metas.map((presence) => {
    // Object spread compiles to Object.assign for ES2017, which treats __proto__ as a setter.
    const descriptors = Object.getOwnPropertyDescriptors(presence)
    const transformedPresence = Object.defineProperties({}, descriptors) as typeof presence
    transformedPresence['presence_ref'] = transformedPresence['phx_ref']

    delete transformedPresence['phx_ref']
    delete transformedPresence['phx_ref_prev']

    return transformedPresence
  }) as RealtimePresenceType[]
}`;
const originalJs = `function transformState(presences) {
    return presences.metas.map((presence) => {
        presence['presence_ref'] = presence['phx_ref'];
        delete presence['phx_ref'];
        delete presence['phx_ref_prev'];
        return presence;
    });
}`;
const patchedJs = `function transformState(presences) {
    return presences.metas.map((presence) => {
        // Object spread compiles to Object.assign for ES2017, which treats __proto__ as a setter.
        const descriptors = Object.getOwnPropertyDescriptors(presence);
        const transformedPresence = Object.defineProperties({}, descriptors);
        transformedPresence['presence_ref'] = transformedPresence['phx_ref'];
        delete transformedPresence['phx_ref'];
        delete transformedPresence['phx_ref_prev'];
        return transformedPresence;
    });
}`;
const originalUmd = 'function Fe(e){return e.metas.map(e=>(e.presence_ref=e.phx_ref,delete e.phx_ref,delete e.phx_ref_prev,e))}';
const patchedUmd = 'function Fe(e){return e.metas.map(e=>{const t=Object.getOwnPropertyDescriptors(e),n=Object.defineProperties({},t);return n.presence_ref=n.phx_ref,delete n.phx_ref,delete n.phx_ref_prev,n})}';

export const BACKPORTS = [
  {
    name: '@supabase/realtime-js',
    upstreamVersion: '2.100.0',
    version: BACKPORT_VERSION,
    upstreamFile: 'realtime-js-2.100.0.tgz',
    outputFile: `realtime-js-${BACKPORT_VERSION}.tgz`,
    registryUrl: 'https://registry.npmjs.org/@supabase/realtime-js/-/realtime-js-2.100.0.tgz',
    integrity: 'sha512-2AZs00zzEF0HuCKY8grz5eCYlwEfVi5HONLZFoNR6aDfxQivl8zdQYNjyFoqN2MZiVhQHD7u6XV/xHwM8mCEHw==',
    archiveSha256: '155ab4d7435b20a267853b5e1a45ab5e16082ecc4715952eb611baf2937d3c88',
    treeSha256: '31b7757548f4780cea3aeae79c7399ebbd6f84f61bc494c205cc50ffdd0835a5',
    packageJsonSha256: '189cedcf520a60d8b48ad9b99499ce629535587bc42cbdfe0b586c5b9cee6c4b',
    sourcePatches: [
      { file: 'src/phoenix/presenceAdapter.ts', originalSha256: 'a61f0a609a09d5f8440344d3c4666878b03a19fa14f08cbe7230d3a65a9ab5b7', before: originalTs, after: patchedTs },
      { file: 'dist/main/phoenix/presenceAdapter.js', originalSha256: '70452ba1a66181255f9fcd0d1efeafbfbfc6b05d1c3cacdadfe404f7ac05f6fb', before: originalJs, after: patchedJs, removeSourceMapComment: true },
      { file: 'dist/module/phoenix/presenceAdapter.js', originalSha256: '917d4307b21258afe4a8bb07c0872ff9cb7dc33e16dc249a92287df7647e3dfc', before: originalJs, after: patchedJs, removeSourceMapComment: true },
    ],
    removedSourceMaps: [
      { file: 'dist/main/phoenix/presenceAdapter.js.map', originalSha256: 'eef06a73c4925583e043a8d3f2bbd18ec275d91bc2c1432efa9fee8ad4e2ba8b' },
      { file: 'dist/module/phoenix/presenceAdapter.js.map', originalSha256: '5dc4e7000d2e7b26ca3927f669a985c244b4da730ca4db0d31ea6f87b161881e' },
    ],
  },
  {
    name: '@supabase/supabase-js',
    upstreamVersion: '2.100.0',
    version: BACKPORT_VERSION,
    upstreamFile: 'supabase-js-2.100.0.tgz',
    outputFile: `supabase-js-${BACKPORT_VERSION}.tgz`,
    registryUrl: 'https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.100.0.tgz',
    integrity: 'sha512-r0tlcukejJXJ1m/2eG/Ya5eYs4W8AC7oZfShpG3+SIo/eIU9uIt76ZeYI1SoUwUmcmzlAbgch+HDZDR/toVQPQ==',
    archiveSha256: 'c0413bfffabcbb4bfb6c89c38e38d153220f37aa0d8a159d4bd75aadab103270',
    treeSha256: '4525e98db81843646e90e3b1476d051d9e30a8d6df2393c047481aa4fb1be203',
    packageJsonSha256: 'b8095472adec0b94de0ec57f69cc9f292325d2caf07f53086f045c918116e83d',
    sourcePatches: [
      { file: 'dist/umd/supabase.js', originalSha256: '40a4377dbe54e160177ca220513f660c62634087ff58f626f8109725fec95706', before: originalUmd, after: patchedUmd },
    ],
    removedSourceMaps: [],
  },
];
// Callers cannot silently change the approved identities or transformation contract.
for (const definition of BACKPORTS) {
  definition.sourcePatches.forEach(Object.freeze);
  definition.removedSourceMaps.forEach(Object.freeze);
  Object.freeze(definition.sourcePatches);
  Object.freeze(definition.removedSourceMaps);
  Object.freeze(definition);
}
Object.freeze(BACKPORTS);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function integrity(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}
function treeSha256(files) {
  return sha256([...files.keys()].sort().map((file) => `${file}\0${sha256(files.get(file))}\n`).join(''));
}
function assertHash(bytes, expected, label) {
  assert.ok(Buffer.isBuffer(bytes), `${label}: missing file`);
  assert.equal(sha256(bytes), expected, `${label}: unknown source SHA256`);
}
function assertDefinition(definition) {
  assert.ok(BACKPORTS.includes(definition), 'Unknown backport definition');
}
function tarNumber(header, start, length) {
  const field = header.subarray(start, start + length).toString('ascii').replace(/\0.*$/, '').trim();
  assert.match(field, /^[0-7]+$/, 'Unsupported tar number');
  return Number.parseInt(field, 8);
}
function tarString(header, start, length) {
  return header.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '');
}

/** Parse only regular package files; never extract archive paths to the filesystem. */
export function readTarGzip(archive) {
  assert.ok(Buffer.isBuffer(archive) && archive.length <= MAX_ARCHIVE_BYTES, 'Archive size exceeds bound');
  const tar = gunzipSync(archive, { maxOutputLength: MAX_ARCHIVE_BYTES });
  assert.equal(tar.length % 512, 0, 'Truncated tar archive');
  const files = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      assert.ok(tar.length - offset >= 1024 && tar.subarray(offset).every((byte) => byte === 0), 'Invalid tar terminator');
      return files;
    }
    const checksum = [...header].reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    assert.equal(tarNumber(header, 148, 8), checksum, 'Invalid tar checksum');
    assert.ok(header[156] === 0 || header[156] === 48, 'Only regular tar files are supported');
    assert.equal(tarString(header, 345, 155), '', 'Tar prefix is unsupported');
    const archivePath = tarString(header, 0, 100);
    assert.ok(archivePath.startsWith('package/'), 'Archive file is outside package/');
    const file = archivePath.slice(8);
    assert.ok(file.length > 0 && !file.includes('\\') && file.split('/').every((part) => part && part !== '.' && part !== '..'), 'Unsafe archive path');
    assert.ok(!files.has(file), 'Duplicate archive file');
    const size = tarNumber(header, 124, 12);
    assert.ok(size <= MAX_ARCHIVE_BYTES && offset + 512 + size <= tar.length, 'Truncated archive file');
    files.set(file, Buffer.from(tar.subarray(offset + 512, offset + 512 + size)));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('Missing tar terminator');
}

function replaceOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `${label}: patch anchor must occur exactly once`);
  return source.replace(before, after);
}

/** Inputs must be the complete, exact registry package. Rebuilding is idempotent. */
export function patchFiles(definition, originalFiles, licenseBytes) {
  assertDefinition(definition);
  assert.equal(treeSha256(originalFiles), definition.treeSha256, `${definition.name}: unknown source tree`);
  assertHash(licenseBytes, LICENSE_SHA256, 'Upstream MIT LICENSE');
  const files = new Map([...originalFiles].map(([file, bytes]) => [file, Buffer.from(bytes)]));
  for (const patch of definition.sourcePatches) {
    assertHash(files.get(patch.file), patch.originalSha256, patch.file);
    let source = replaceOnce(files.get(patch.file).toString('utf8'), patch.before, patch.after, patch.file);
    if (patch.removeSourceMapComment) {
      source = replaceOnce(source, '\n//# sourceMappingURL=presenceAdapter.js.map', '', `${patch.file} source map`);
    }
    files.set(patch.file, Buffer.from(source));
  }
  for (const removal of definition.removedSourceMaps) {
    assertHash(files.get(removal.file), removal.originalSha256, removal.file);
    files.delete(removal.file);
  }
  assertHash(files.get('package.json'), definition.packageJsonSha256, `${definition.name} package.json`);
  const packageJson = JSON.parse(files.get('package.json').toString('utf8'));
  assert.equal(packageJson.name, definition.name);
  assert.equal(packageJson.version, definition.upstreamVersion);
  assert.equal(packageJson.license, 'MIT');
  packageJson.version = definition.version;
  packageJson.chillywoodBackport = {
    upstreamVersion: definition.upstreamVersion,
    upstreamCommit: UPSTREAM_COMMIT,
    fix: 'Presence callback metadata descriptor copy (supabase-js#2566)',
  };
  files.set('package.json', Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`));
  assert.ok(!files.has('LICENSE'), 'Unexpected upstream LICENSE must be reviewed');
  files.set('LICENSE', Buffer.from(licenseBytes));
  return files;
}

function writeOctal(header, value, start, length) {
  const digits = value.toString(8).padStart(length - 1, '0');
  assert.ok(digits.length < length, 'Tar number exceeds field');
  header.write(`${digits}\0`, start, length, 'ascii');
}
function createTar(files) {
  const blocks = [];
  for (const file of [...files.keys()].sort()) {
    const name = `package/${file}`;
    assert.ok(Buffer.byteLength(name) < 100, 'Tar filename exceeds fixed format');
    const bytes = files.get(file);
    const header = Buffer.alloc(512);
    header.write(name, 0, 'utf8');
    writeOctal(header, 0o644, 100, 8);
    writeOctal(header, 0, 108, 8);
    writeOctal(header, 0, 116, 8);
    writeOctal(header, bytes.length, 124, 12);
    writeOctal(header, 0, 136, 12);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    header.write(`${[...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Stored DEFLATE blocks trade ~1 MB of repository space for compressor-independent
// bytes on Node 20/24 and every OS. Fixed mtime=0, OS=255, no optional gzip fields.
function deterministicGzip(bytes) {
  const chunks = [Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 255])];
  for (let offset = 0; offset < bytes.length; offset += 65535) {
    const size = Math.min(65535, bytes.length - offset);
    const header = Buffer.alloc(5);
    header[0] = offset + size === bytes.length ? 1 : 0;
    header.writeUInt16LE(size, 1);
    header.writeUInt16LE(size ^ 0xffff, 3);
    chunks.push(header, bytes.subarray(offset, offset + size));
  }
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32LE(crc32(bytes), 0);
  trailer.writeUInt32LE(bytes.length >>> 0, 4);
  return Buffer.concat([...chunks, trailer]);
}

/** Verify a registry archive, apply the fixed backport, and return deterministic bytes. */
export function createBackport(definition, archiveBytes, licenseBytes) {
  assertDefinition(definition);
  assert.equal(integrity(archiveBytes), definition.integrity, `${definition.name}: registry integrity mismatch`);
  assertHash(archiveBytes, definition.archiveSha256, `${definition.name} registry archive`);
  const originalFiles = readTarGzip(archiveBytes);
  const files = patchFiles(definition, originalFiles, licenseBytes);
  const archive = deterministicGzip(createTar(files));
  const changes = [...new Set([...originalFiles.keys(), ...files.keys()])].sort().flatMap((file) => {
    const original = originalFiles.get(file);
    const patched = files.get(file);
    if (original && patched && original.equals(patched)) return [];
    return [{ file, action: !original ? 'added' : !patched ? 'removed' : 'modified', originalSha256: original ? sha256(original) : null, patchedSha256: patched ? sha256(patched) : null }];
  });
  return {
    archive,
    files,
    manifest: {
      name: definition.name,
      version: definition.version,
      upstream: { version: definition.upstreamVersion, registryUrl: definition.registryUrl, file: `upstream/${definition.upstreamFile}`, integrity: definition.integrity, sha256: definition.archiveSha256, treeSha256: definition.treeSha256, fileCount: originalFiles.size },
      output: { file: definition.outputFile, integrity: integrity(archive), sha256: sha256(archive), treeSha256: treeSha256(files), fileCount: files.size, bytes: archive.length },
      changes,
    },
  };
}

/** --check never writes. --write regenerates all outputs from pinned local inputs. */
export async function buildBackports({ directory = VENDOR_DIRECTORY, write = false } = {}) {
  const licenseBytes = await readFile(path.join(directory, 'LICENSE'));
  assertHash(licenseBytes, LICENSE_SHA256, 'Upstream MIT LICENSE');
  const packages = [];
  const artifacts = [];
  for (const definition of BACKPORTS) {
    const input = await readFile(path.join(directory, 'upstream', definition.upstreamFile));
    const result = createBackport(definition, input, licenseBytes);
    const secondBuild = createBackport(definition, input, licenseBytes);
    assert.ok(result.archive.equals(secondBuild.archive), `${definition.name}: non-reproducible build`);
    assert.equal(treeSha256(readTarGzip(result.archive)), treeSha256(result.files), 'Archive round trip changed package contents');
    packages.push(result.manifest);
    artifacts.push([definition.outputFile, result.archive]);
  }
  const manifest = {
    schemaVersion: 1,
    fix: { repository: 'https://github.com/supabase/supabase-js', pullRequest: 'https://github.com/supabase/supabase-js/pull/2566', commit: UPSTREAM_COMMIT, description: 'Copy Presence metadata with Object.getOwnPropertyDescriptors/Object.defineProperties before renaming refs; preserve Phoenix-owned metadata and own __proto__ descriptors.' },
    license: { file: 'LICENSE', source: 'https://raw.githubusercontent.com/supabase/supabase-js/v2.100.0/LICENSE', sha256: LICENSE_SHA256 },
    archiveFormat: { tar: 'POSIX ustar; sorted regular files; mode 0644; uid/gid/mtime zero; empty owner names; two zero end blocks', gzip: 'RFC 1952; stored RFC 1951 DEFLATE blocks (65535 bytes); mtime zero; OS 255; no optional fields' },
    scope: 'Four transform bodies only, two stale JS source maps and their comments removed, package version/provenance metadata, and upstream MIT LICENSE added. All other file bytes and dependency requirements are unchanged. UMD has no source map.',
    packages,
  };
  artifacts.push(['manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)]);
  if (write) await mkdir(directory, { recursive: true });
  for (const [file, expected] of artifacts) {
    const target = path.join(directory, file);
    if (write) await writeFile(target, expected);
    else assert.ok((await readFile(target)).equals(expected), `${file}: committed artifact differs from deterministic rebuild`);
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length <= 1 && (args.length === 0 || ['--check', '--write'].includes(args[0])), 'Usage: node scripts/build-supabase-presence-backport.mjs [--check|--write]');
  await buildBackports({ write: args[0] === '--write' });
  console.log(`Supabase Presence backport ${args[0] === '--write' ? 'built' : 'verified'}: two pinned packages, exact file scope, reproducible archives.`);
}
