import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { probeClip, renderClip, runMediaProcess } from '../../scripts/lib/clip-render-core.mjs';
import { renderClip as baselineRenderClip } from '../fixtures/clip-render-output-seek-baseline.mjs';

// Rebuilt test helpers, not recovered historical benchmark receipts. Synthetic
// files only; no provider calls and no test wrapper around production FFmpeg.
export async function syntheticSource(dir, name, {
  rate = '30', seconds = 18, audio = true, filter = null, offset = 0,
  width = 320, height = 180, webm = false, sparse = false, mov = false,
  audioDelay = 0, audioRate = 48000, videoDelay = 0,
} = {}) {
  const input = path.join(dir, `${name}.${webm ? 'webm' : mov ? 'mov' : 'mp4'}`);
  const args = ['-nostdin', '-v', 'error'];
  if (videoDelay) args.push('-itsoffset', String(videoDelay));
  args.push('-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=${rate}`);
  if (audio) {
    if (audioDelay) args.push('-itsoffset', String(audioDelay));
    args.push('-f', 'lavfi', '-i', `aevalsrc=0.2*sin(2*PI*(233*t+19*t*t)):s=${audioRate}`);
  }
  if (filter) args.push('-vf', filter, '-fps_mode', 'vfr');
  if (sparse) args.push('-fps_mode', 'passthrough');
  args.push('-t', String(seconds), '-c:v', webm ? 'libvpx-vp9' : 'libx264', '-threads', '1', '-g', '300');
  if (webm) args.push('-deadline', 'realtime', '-cpu-used', '8');
  else args.push('-preset', 'fast', '-sc_threshold', '0');
  if (audio) args.push('-c:a', webm ? 'libopus' : 'aac', '-b:a', '128k');
  if (offset) args.push('-output_ts_offset', String(offset));
  args.push(input);
  await runMediaProcess('ffmpeg', args, { timeoutMs: 60_000 });
  return input;
}

async function decodedMedia(file, dir, name) {
  const probe = await probeClip(file);
  const videoFile = path.join(dir, `${name}.yuv`), audioFile = path.join(dir, `${name}.pcm`);
  await runMediaProcess('ffmpeg', ['-nostdin', '-v', 'error', '-threads', '2', '-filter_threads', '2',
    '-i', file, '-map', '0:v:0', '-pix_fmt', 'yuv420p', '-f', 'rawvideo', videoFile]);
  const video = await readFile(videoFile), stream = probe.streams.find(s => s.codec_type === 'video');
  const audioStream = probe.streams.find(s => s.codec_type === 'audio');
  let audio = null;
  if (audioStream) {
    await runMediaProcess('ffmpeg', ['-nostdin', '-v', 'error', '-threads', '2', '-i', file,
      '-map', '0:a:0', '-c:a', 'pcm_s16le', '-f', 's16le', audioFile]);
    audio = await readFile(audioFile);
  }
  return { probe, stream, audioStream, video, audio };
}

export function assertDecodedVideoEqual(actual, expected, name) {
  assert.equal(actual.length, expected.length, `${name}: decoded video byte count`);
  if (!actual.equals(expected)) {
    let offset = 0;
    while (actual[offset] === expected[offset]) offset++;
    // Never attach multi-megabyte Buffers to AssertionError.actual/expected:
    // Node's test reporter serializes those values over its child-process IPC.
    // The equality requirement is unchanged; only the failure payload is bounded.
    assert.fail(`${name}: decoded video differs at byte ${offset}/${actual.length}; actual=${actual[offset]}, expected=${expected[offset]}`);
  }
}

export async function compareSeekRenders(dir, name, inputPath, edit, watermarkPath = null) {
  const originalDigest = createHash('sha256').update(await readFile(inputPath)).digest('hex');
  const baselinePath = path.join(dir, `${name}-baseline.mp4`), candidatePath = path.join(dir, `${name}-candidate.mp4`);
  await baselineRenderClip({ inputPath, outputPath: baselinePath, edit, watermarkPath });
  await renderClip({ inputPath, outputPath: candidatePath, edit, watermarkPath });
  const baseline = await decodedMedia(baselinePath, dir, `${name}-baseline`);
  const candidate = await decodedMedia(candidatePath, dir, `${name}-candidate`);
  assertDecodedVideoEqual(candidate.video, baseline.video, name);
  for (const field of ['width', 'height', 'pix_fmt', 'r_frame_rate', 'time_base', 'start_time', 'duration', 'nb_frames']) {
    assert.equal(candidate.stream[field], baseline.stream[field], `${name}: video ${field}`);
  }
  assert.equal(candidate.probe.format.duration, baseline.probe.format.duration, `${name}: container duration`);
  assert.equal(Boolean(candidate.audio), Boolean(baseline.audio), `${name}: audio presence`);
  let maximumAudioError = 0;
  if (candidate.audio) {
    assert.equal(candidate.audio.length, baseline.audio.length, `${name}: aligned PCM sample count`);
    for (const field of ['sample_rate', 'channels', 'time_base', 'start_time', 'duration']) {
      assert.equal(candidate.audioStream[field], baseline.audioStream[field], `${name}: audio ${field}`);
    }
    for (let offset = 0; offset < candidate.audio.length; offset += 2) {
      maximumAudioError = Math.max(maximumAudioError, Math.abs(candidate.audio.readInt16LE(offset) - baseline.audio.readInt16LE(offset)));
    }
    assert.ok(maximumAudioError <= 2, `${name}: aligned audio error ${maximumAudioError} exceeds two PCM quantization units`);
  }
  assert.equal(createHash('sha256').update(await readFile(inputPath)).digest('hex'), originalDigest, `${name}: immutable source`);
  return { name, decodedVideoSha256: createHash('sha256').update(candidate.video).digest('hex'),
    decodedVideoBytes: candidate.video.length, pcmBytes: candidate.audio?.length ?? 0, maximumAudioError };
}
