#!/usr/bin/env node
// Actual local scanner qualification. No remote media or provider requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { inspectDefinitions, inspectPaidVideo, runBounded, signScanResult } from './scan.mjs';

assert.equal(process.argv.length, 6, 'Use --database /absolute/private/database --certificates /absolute/trusted/certs');
assert.equal(process.argv[2], '--database'); assert.equal(process.argv[4], '--certificates');
const databaseDirectory = process.argv[3], certificateDirectory = process.argv[5];
const binaries = { ffmpeg: '/usr/local/bin/ffmpeg', ffprobe: '/usr/local/bin/ffprobe', clamscan: '/usr/local/bin/clamscan', sigtool: '/usr/local/bin/sigtool' };
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'scpv-scanner-')); await fs.chmod(work, 0o700);
const digest = value => createHash('sha256').update(value).digest('hex');
let report;
try {
  const file = path.join(work, 'generated.mp4');
  const generated = await runBounded(binaries.ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
    'color=c=blue:s=320x180:r=24:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', '-shortest', file]);
  assert.equal(generated.code, 0, generated.stderr);
  const bytes = await fs.readFile(file), expectedSha256 = digest(bytes), expectedByteLength = bytes.length;
  const options = { file, expectedSha256, expectedByteLength, databaseDirectory, certificateDirectory, binaries };
  const clean = await inspectPaidVideo(options); assert.equal(clean.verdict, 'clean');
  assert.equal(clean.moderation, 'unreviewed'); assert.equal(clean.media.videoCodec, 'h264');
  assert.equal(clean.media.audioCodec, 'aac'); assert.equal(clean.byteLength, bytes.length);
  await assert.rejects(inspectPaidVideo({ ...options, expectedSha256: '0'.repeat(64) }), /uploaded_bytes_mismatch/u);
  const invalid = path.join(work, 'invalid.mp4'); await fs.writeFile(invalid, bytes.subarray(0, 100));
  const rejected = await inspectPaidVideo({ ...options, file: invalid, expectedByteLength: 100, expectedSha256: digest(bytes.subarray(0, 100)) });
  assert.equal(rejected.verdict, 'rejected'); assert.equal(rejected.reason, 'media_profile_rejected');
  // Standard harmless antivirus test pattern, generated locally and never uploaded.
  const eicar = path.join(work, 'antivirus-test.txt');
  const pattern = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$' + 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  await fs.writeFile(eicar, pattern);
  const infected = await inspectPaidVideo({ ...options, file: eicar, expectedByteLength: pattern.length, expectedSha256: digest(pattern) });
  assert.equal(infected.verdict, 'rejected'); assert.equal(infected.reason, 'malware_or_scan_limit');
  const daily = clean.definitions.files.find(f => f.filename === 'daily.cvd');
  await assert.rejects(inspectDefinitions({ directory: databaseDirectory, certificateDirectory, sigtool: binaries.sigtool,
    now: Date.parse(daily.createdAt) + 49 * 3600000 }), /definitions_stale/u);
  const link = path.join(work, 'symlink.mp4'); await fs.symlink(file, link);
  await assert.rejects(inspectPaidVideo({ ...options, file: link }));
  const signed = signScanResult({ key: randomBytes(32), ticketId: randomUUID(), uploadId: 'scpv_upload_' + randomUUID(),
    incarnation: randomUUID(), objectVersion: 'fixture-version', result: clean });
  assert.match(signed.signature, /^[a-f0-9]{64}$/u);
  const toolEvidence = {};
  for (const [name, binary] of Object.entries(binaries)) {
    const version = await runBounded(binary, [name === 'ffmpeg' || name === 'ffprobe' ? '-version' : '--version']);
    assert.equal(version.code, 0);
    toolEvidence[name] = { version: (version.stdout || version.stderr).split('\n')[0], executableSha256: digest(await fs.readFile(binary)) };
  }
  report = { status: 'passed', checkedAt: new Date().toISOString(), toolEvidence, cases: [
    'Generated actual H264/AAC progressive MP4 passes real ffprobe, full ffmpeg decode and authenticated fresh ClamAV scan.',
    'Client expectation mismatch rejects before scan.', 'Truncated actual MP4 never becomes clean.',
    'Actual ClamAV detects locally generated harmless EICAR fixture.', 'Injected stale clock rejects definition freshness.',
    'Symlink input rejects.', 'Positive bytes remain moderation-unreviewed; signed result binds ticket/upload/incarnation/version.'
  ], actualCleanScan: clean, actualMalwareTestVerdict: infected.verdict, sourceSha256: digest(await fs.readFile(new URL('./scan.mjs', import.meta.url))),
  trustCertificateSha256: digest(await fs.readFile(path.join(certificateDirectory, 'clamav.crt'))),
  scope: 'Local scanner executable and official signature qualification only. No remote object store, scanner lease, moderation decision, authenticated provider receipt, publication, app playback or deployment qualification.' };
} finally { await fs.rm(work, { recursive: true }); }
process.stdout.write(JSON.stringify({ ...report, cleanup: { privateGeneratedFixturesRemoved: true } }, null, 2) + '\n');
