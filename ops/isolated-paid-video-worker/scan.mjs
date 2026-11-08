import { isS3ObjectVersion } from './private-object.mjs';
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';

// This worker examines local bytes obtained through a separately authenticated
// immutable-object adapter. It never uploads a sample to a third party.
export const PAID_VIDEO_PROFILE = Object.freeze({
  id: 'scpv-mp4-h264-aac-v1', maxBytes: 16 * 1024 * 1024, maxDurationMs: 60000,
  maxWidth: 1920, maxHeight: 1080, maxFramesPerSecond: 60,
  maxDefinitionAgeMs: 48 * 60 * 60 * 1000, futureToleranceMs: 5 * 60 * 1000,
});
const HEX = /^[a-f0-9]{64}$/u;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };

export async function runBounded(command, args, { timeoutMs = 120000, maxOutputBytes = 262144 } = {}) {
  assert.ok(path.isAbsolute(command), 'An explicit binary path is required');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C', TZ: 'UTC' } });
    const output = { stdout: [], stderr: [] }; let bytes = 0, exceeded = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    for (const name of ['stdout', 'stderr']) child[name].on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) { exceeded = true; child.kill('SIGKILL'); return; }
      output[name].push(chunk);
    });
    child.on('error', () => { clearTimeout(timer); reject(new Error('paid_video_tool_unavailable')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut || exceeded) { reject(new Error((timedOut ? 'paid_video_tool_timeout:' : 'paid_video_tool_output_limit:') + path.basename(command))); return; }
      resolve({ code, stdout: Buffer.concat(output.stdout).toString('utf8'), stderr: Buffer.concat(output.stderr).toString('utf8') });
    });
  });
}

async function immutableFile(file, maxBytes, retainBytes = true) {
  assert.ok(path.isAbsolute(file));
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > maxBytes) fail('paid_video_file_invalid');
    const hash = createHash('sha256'); const chunks = []; let length = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false, highWaterMark: 65536 })) {
      length += chunk.length; if (length > maxBytes) fail('paid_video_file_invalid');
      hash.update(chunk); if (retainBytes) chunks.push(chunk);
    }
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || length !== before.size) fail('paid_video_file_changed');
    return { file, byteLength: length, sha256: hash.digest('hex'), bytes: retainBytes ? Buffer.concat(chunks) : null,
      identity: [before.dev, before.ino, before.size, before.mtimeMs, before.ctimeMs] };
  } finally { await handle.close(); }
}

export function inspectMp4Boxes(bytes) {
  let offset = 0, boxes = 0, ftyp = 0, moov = 0, mdat = 0;
  while (offset < bytes.length) {
    if (++boxes > 512 || bytes.length - offset < 8) fail('paid_video_container_invalid');
    let size = bytes.readUInt32BE(offset); const type = bytes.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (bytes.length - offset < 16) fail('paid_video_container_invalid');
      const large = bytes.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) fail('paid_video_container_invalid');
      size = Number(large); header = 16;
    }
    if (size === 0) size = bytes.length - offset;
    if (size < header || offset + size > bytes.length) fail('paid_video_container_invalid');
    if (type === 'ftyp') { if (offset !== 0 || size < 16) fail('paid_video_container_invalid'); ftyp++; }
    else if (type === 'moov') moov++;
    else if (type === 'mdat') mdat++;
    else if (!['free', 'skip', 'wide'].includes(type)) fail('paid_video_container_profile_unsupported');
    offset += size;
  }
  if (ftyp !== 1 || moov !== 1 || mdat !== 1) fail('paid_video_container_profile_unsupported');
  return { topLevelBoxes: boxes, fragmented: false };
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
export function validateProbe(probe, expectedBytes) {
  if (!probe || !Array.isArray(probe.streams) || !probe.format || Number(probe.format.size) !== expectedBytes
    || !String(probe.format.format_name).split(',').includes('mp4')) fail('paid_video_probe_invalid');
  const video = probe.streams.filter(s => s.codec_type === 'video'), audio = probe.streams.filter(s => s.codec_type === 'audio');
  if (video.length !== 1 || audio.length > 1 || video.length + audio.length !== probe.streams.length) fail('paid_video_stream_profile_unsupported');
  const v = video[0], durationMs = Math.ceil(Number(probe.format.duration) * 1000);
  const rate = /^([0-9]+)\/([1-9][0-9]*)$/u.exec(v.avg_frame_rate ?? '');
  const fps = rate ? Number(rate[1]) / Number(rate[2]) : NaN;
  if (v.codec_name !== 'h264' || v.pix_fmt !== 'yuv420p' || !Number.isInteger(v.width) || !Number.isInteger(v.height)
    || !positive(v.width) || !positive(v.height) || v.width > PAID_VIDEO_PROFILE.maxWidth || v.height > PAID_VIDEO_PROFILE.maxHeight
    || !positive(fps) || fps > PAID_VIDEO_PROFILE.maxFramesPerSecond || !positive(durationMs) || durationMs > PAID_VIDEO_PROFILE.maxDurationMs
    || v.disposition?.attached_pic === 1 || Number(v.start_time ?? 0) < 0) fail('paid_video_video_profile_unsupported');
  if (audio.length) {
    const a = audio[0];
    if (a.codec_name !== 'aac' || ![1, 2].includes(a.channels) || !positive(Number(a.sample_rate))
      || Number(a.sample_rate) > 48000 || Number(a.start_time ?? 0) < 0) fail('paid_video_audio_profile_unsupported');
  }
  return { durationMs, width: v.width, height: v.height, framesPerSecond: fps,
    videoCodec: 'h264', pixelFormat: 'yuv420p', audioCodec: audio.length ? 'aac' : null };
}

export function parseDefinitionInfo(text, filename) {
  const version = /^Version:\s*([1-9][0-9]*)\s*$/mu.exec(text);
  const built = /^Build time:\s*(.+)\s*$/mu.exec(text);
  if (!version || !built || !/Verification OK\.?(?:\s|$)/u.test(text)) fail('paid_video_definition_authenticity_unverified');
  const createdAt = Date.parse(built[1]);
  if (!Number.isFinite(createdAt)) fail('paid_video_definition_date_invalid');
  return { filename, version: Number(version[1]), createdAt: new Date(createdAt).toISOString() };
}

export async function inspectDefinitions({ directory, certificateDirectory, sigtool, now = Date.now() }) {
  assert.ok(path.isAbsolute(directory) && path.isAbsolute(certificateDirectory));
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) fail('paid_video_definition_directory_untrusted');
  const names = (await fs.readdir(directory)).filter(name => /\.(?:cvd|cld|ndb|ldb|hdb|hsb|mdb|msb|fp|sfp|yar|yara)$/iu.test(name)).sort();
  if (JSON.stringify(names) !== JSON.stringify(['bytecode.cvd', 'daily.cvd', 'main.cvd'])) fail('paid_video_definition_set_unqualified');
  const files = [];
  for (const filename of names) {
    const file = await immutableFile(path.join(directory, filename), 512 * 1024 * 1024, false);
    const result = await runBounded(sigtool, ['--info', file.file]);
    if (result.code !== 0) fail('paid_video_definition_authenticity_unverified');
    const info = parseDefinitionInfo(result.stdout, filename);
    const signature = await immutableFile(path.join(directory, `${filename.slice(0, -4)}-${info.version}.cvd.sign`), 65536, false);
    const verified = await runBounded(sigtool, ['--verify', file.file, '--cvdcertsdir=' + certificateDirectory]);
    if (verified.code !== 0 || !/Successfully verified file/u.test(verified.stdout + verified.stderr)) fail('paid_video_definition_authenticity_unverified');
    const after = await immutableFile(file.file, 512 * 1024 * 1024, false);
    if (after.sha256 !== file.sha256 || JSON.stringify(after.identity) !== JSON.stringify(file.identity)) fail('paid_video_definitions_changed');
    const signatureAfter = await immutableFile(signature.file, 65536, false);
    if (signatureAfter.sha256 !== signature.sha256) fail('paid_video_definitions_changed');
    files.push({ ...info, sha256: file.sha256, byteLength: file.byteLength, signatureSha256: signature.sha256 });
  }
  const daily = files.find(f => f.filename === 'daily.cvd'), age = now - Date.parse(daily.createdAt);
  if (age < -PAID_VIDEO_PROFILE.futureToleranceMs || age > PAID_VIDEO_PROFILE.maxDefinitionAgeMs) fail('paid_video_definitions_stale');
  return { protocol: 'scpv-definition-manifest-v1', files, manifestSha256: sha(JSON.stringify(files)) };
}

export async function inspectPaidVideo({ file, expectedSha256, expectedByteLength, databaseDirectory, certificateDirectory, binaries, now = () => Date.now() }) {
  if (!HEX.test(expectedSha256) || !Number.isSafeInteger(expectedByteLength)
    || expectedByteLength < 1 || expectedByteLength > PAID_VIDEO_PROFILE.maxBytes) fail('paid_video_expectation_invalid');
  const parent = await fs.lstat(path.dirname(file));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0) fail('paid_video_work_directory_untrusted');
  const initial = await immutableFile(file, PAID_VIDEO_PROFILE.maxBytes);
  if (initial.sha256 !== expectedSha256 || initial.byteLength !== expectedByteLength) fail('paid_video_uploaded_bytes_mismatch');
  const definitions = await inspectDefinitions({ directory: databaseDirectory, certificateDirectory, sigtool: binaries.sigtool, now: now() });
  const malware = await runBounded(binaries.clamscan, ['--database=' + databaseDirectory, '--infected', '--no-summary',
    '--max-filesize=16M', '--max-scansize=32M', '--max-recursion=4', '--alert-exceeds-max=yes', file]);
  const checkedAt = new Date(now()).toISOString();
  const base = { protocol: 'scpv-byte-scan-v1', profile: PAID_VIDEO_PROFILE.id, sha256: initial.sha256,
    byteLength: initial.byteLength, checkedAt, definitions, moderation: 'unreviewed' };
  if (malware.code === 1) return { ...base, verdict: 'rejected', reason: 'malware_or_scan_limit', media: null };
  if (malware.code !== 0) fail('paid_video_malware_scan_incomplete');
  let media;
  try {
    inspectMp4Boxes(initial.bytes);
    const probe = await runBounded(binaries.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-enable_drefs', '0', '-use_absolute_path', '0',
      '-show_streams', '-show_format', '-of', 'json', file]);
    if (probe.code !== 0) fail('paid_video_probe_failed');
    media = validateProbe(JSON.parse(probe.stdout), initial.byteLength);
    const decode = await runBounded(binaries.ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file,pipe',
      '-enable_drefs', '0', '-use_absolute_path', '0', '-i', file,
      '-map', '0:v:0', '-map', '0:a:0?', '-f', 'null', '-']);
    if (decode.code !== 0 || decode.stderr.trim()) fail('paid_video_decode_failed');
  } catch { return { ...base, verdict: 'rejected', reason: 'media_profile_rejected', media: null }; }
  const after = await immutableFile(file, PAID_VIDEO_PROFILE.maxBytes);
  if (after.sha256 !== initial.sha256 || JSON.stringify(after.identity) !== JSON.stringify(initial.identity)) fail('paid_video_file_changed');
  const finalDefinitions = await inspectDefinitions({ directory: databaseDirectory, certificateDirectory, sigtool: binaries.sigtool, now: now() });
  if (finalDefinitions.manifestSha256 !== definitions.manifestSha256) fail('paid_video_definitions_changed');
  return { ...base, checkedAt: new Date(now()).toISOString(), verdict: 'clean', reason: 'exact_bytes_scanned', media };
}

// The scanner key belongs only in server/worker configuration. It is never an
// app capability or a generic service-role assertion that media is clean.
export function signScanResult({ key, ticketId, uploadId, incarnation, objectVersion, result }) {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) fail('paid_video_worker_key_invalid');
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
  if (!uuid.test(ticketId) || !uuid.test(incarnation) || !/^scpv_upload_[a-f0-9-]{36}$/u.test(uploadId)
    || !uuid.test(uploadId.slice(12)) || !isS3ObjectVersion(objectVersion)
    || result?.protocol !== 'scpv-byte-scan-v1' || !['clean', 'rejected'].includes(result.verdict)
    || result.profile !== PAID_VIDEO_PROFILE.id || !HEX.test(result.sha256)) fail('paid_video_result_binding_invalid');
  const raw = JSON.stringify({ protocol: 'scpv-worker-result-v1', ticketId, uploadId, incarnation, objectVersion, result });
  return { raw, signature: createHmac('sha256', key).update(raw).digest('hex') };
}
