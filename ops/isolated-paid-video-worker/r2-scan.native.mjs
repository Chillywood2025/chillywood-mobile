#!/usr/bin/env node
// Actual scanner tools; synthetic, explicitly typed R2 transport. No provider.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { runBounded } from './scan.mjs';
import { executeR2ScanTicket } from './r2-job.mjs';
import { verifyR2Raw } from './r2-protocol.mjs';

assert.equal(process.argv.length, 6, 'Use --database /absolute/private/database --certificates /absolute/trusted/certs');
assert.equal(process.argv[2], '--database'); assert.equal(process.argv[4], '--certificates');
const binaries = { ffmpeg: '/usr/local/bin/ffmpeg', ffprobe: '/usr/local/bin/ffprobe', clamscan: '/usr/local/bin/clamscan', sigtool: '/usr/local/bin/sigtool' };
const scanner = { databaseDirectory: process.argv[3], certificateDirectory: process.argv[5], binaries };
const work = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'scpv-r2-scanner-')); await fs.chmod(work, 0o700);
const sha = value => createHash('sha256').update(value).digest('hex');
const identity = { kind: 'r2-native-upload-v1', nativeVersion: 'synthetic-accepted-r2-upload', etag: 'a'.repeat(32) };
const key = randomBytes(32); let report;
try {
  const file = path.join(work, 'generated.mp4');
  const generated = await runBounded(binaries.ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
    'color=c=blue:s=320x180:r=24:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', '-shortest', file]);
  assert.equal(generated.code, 0, generated.stderr);
  const bytes = new Uint8Array(await fs.readFile(file));
  const ticketFor = bytes => { const incarnation = randomUUID(), issued = Date.now(); return { protocol: 'scpv-worker-ticket-r2-v1', ticketId: randomUUID(), uploadId: 'scpv_upload_' + randomUUID(),
    workerId: randomUUID(), qualificationSha256: 'b'.repeat(64), profile: 'scpv-mp4-h264-aac-v1',
    issuedAt: new Date(issued).toISOString(), expiresAt: new Date(issued + 600000).toISOString(), object: {
      provider: 'cloudflare_r2', bucket: 'synthetic-private-bucket', routeId: randomUUID(),
      objectKey: `sandbox-commerce-v1/${randomUUID()}/scv1_resource_${randomUUID()}/scv1_asset_${randomUUID()}/${incarnation}.mp4`,
      incarnation, expectedSha256: sha(bytes), expectedByteLength: bytes.length, identity } }; };
  const ticket = ticketFor(bytes), options = { ticket, workerKey: key, scanner, workDirectory: work };
  let reads = 0;
  const transport = { readForScan: async object => { reads++; assert.deepEqual(object, ticket.object); return { bytes, identity }; } };
  const signed = await executeR2ScanTicket({ ...options, transport }), actual = JSON.parse(signed.raw);
  assert.equal(actual.result.verdict, 'clean'); assert.equal(actual.result.moderation, 'unreviewed');
  assert.deepEqual(actual.object, ticket.object); assert.equal(await verifyR2Raw(signed.raw, signed.signature, key), true);
  assert.equal(reads, 1);
  const replacement = { ...identity, nativeVersion: 'synthetic-same-byte-replacement' };
  await assert.rejects(executeR2ScanTicket({ ...options, transport: { readForScan: async () => ({ bytes, identity: replacement }) } }), /binding_changed/u);
  const changed = new Uint8Array(bytes); changed[changed.length - 1] ^= 1;
  await assert.rejects(executeR2ScanTicket({ ...options, transport: { readForScan: async () => ({ bytes: changed, identity }) } }), /binding_changed/u);
  const mixed = structuredClone(ticket); mixed.object.objectVersion = 'not-an-r2-version';
  await assert.rejects(executeR2ScanTicket({ ...options, ticket: mixed, transport }));
  await assert.rejects(executeR2ScanTicket({ ...options, ticket: { ...ticket, expiresAt: ticket.issuedAt }, transport }));
  const link = path.join(work, 'linked-work'); await fs.symlink(work, link);
  await assert.rejects(executeR2ScanTicket({ ...options, workDirectory: link, transport }), /work_directory_untrusted/u);
  assert.equal(reads, 1, 'Invalid ticket/work directory must not read bytes');
  const malware = new TextEncoder().encode('X5O!P%@AP[4\\PZX54(P^)7CC)7}$' + 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
  const rejected = await executeR2ScanTicket({ ...options, ticket: ticketFor(malware),
    transport: { readForScan: async () => ({ bytes: malware, identity }) } });
  const negative = JSON.parse(rejected.raw);
  assert.equal(negative.result.verdict, 'rejected'); assert.equal(negative.result.reason, 'malware_or_scan_limit');
  assert.equal(await verifyR2Raw(rejected.raw, rejected.signature, key), true);
  assert.equal((await fs.readdir(work)).some(name => name.startsWith('r2-scan-')), false);
  const sources = {};
  for (const name of ['r2-job.mjs', 'r2-native.mjs', 'r2-protocol.mjs', 'scan.mjs', 'r2-scan.native.mjs'])
    sources[name] = sha(await fs.readFile(new URL(name, import.meta.url)));
  report = { status: 'passed', checkedAt: new Date().toISOString(), cases: [
    'Typed accepted R2 ticket passes actual authenticated ClamAV, full FFmpeg decode, and exact signed result binding.',
    'Same-byte different upload identity and different-byte replacement fail before scanner attestation.',
    'Mixed S3 identity, expired ticket and symlink work directory fail before transport reads.',
    'Actual EICAR scan produces signed monotonic rejection; private job files are removed.'
  ], actualCleanScan: actual.result, actualMalwareTestVerdict: negative.result.verdict, sourceSha256: sources,
  scope: 'Local typed scanner wrapper with real tools and synthetic R2 transport. No actual R2 object, SQL lease/completion, service deployment, moderation, publication, provider receipt or playback qualification.' };
} finally { key.fill(0); await fs.rm(work, { recursive: true }); }
process.stdout.write(JSON.stringify({ ...report, cleanup: { privateGeneratedFixturesRemoved: true } }, null, 2) + '\n');
