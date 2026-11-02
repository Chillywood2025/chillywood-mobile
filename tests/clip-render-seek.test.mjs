import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clipRenderInputSeek, hasSeekableVideoStart, probeClip, runMediaProcess } from '../scripts/lib/clip-render-core.mjs';
import { syntheticSource, compareSeekRenders } from './helpers/clip-render-seek-fixtures.mjs';

const edit = { clip_format: 'square_1_1', fit_mode: 'fill', trim_start_ms: 11123,
  trim_end_ms: 13123, brand_mark_enabled: false };
test('frozen baseline is the recovered pre-seek renderer, not a rewritten comparison', async () => {
  const source = await readFile(new URL('./fixtures/clip-render-output-seek-baseline.mjs', import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'), 'f7f1b2fa705f0aa518c58ff4ff18d80dd54917dc3e05c345431ac26d864cde67');
});
test('hybrid seeking stays limited to MOV H264 plus AAC-LC or no audio', () => {
  const video = { codec_type: 'video', codec_name: 'h264' };
  const audio = { codec_type: 'audio', codec_name: 'aac', profile: 'LC' };
  const probe = { streams: [video, audio], format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' } };
  assert.equal(clipRenderInputSeek({ start: 11.123 }, probe), 10);
  assert.equal(clipRenderInputSeek({ start: 0.9 }, probe), 0);
  assert.equal(clipRenderInputSeek({ start: 11.123 }, { ...probe, streams: [video] }), 10);
  for (const codec_name of ['hevc', 'av1', 'vp9']) assert.equal(clipRenderInputSeek({ start: 11.123 }, { ...probe, streams: [{ ...video, codec_name }, audio] }), 0);
  for (const codec_name of ['opus', 'mp3', 'pcm_s16le']) assert.equal(clipRenderInputSeek({ start: 11.123 }, { ...probe, streams: [video, { ...audio, codec_name }] }), 0);
  for (const profile of ['HE-AAC', undefined]) assert.equal(clipRenderInputSeek({ start: 11.123 }, { ...probe, streams: [video, { ...audio, profile }] }), 0);
  assert.equal(clipRenderInputSeek({ start: 11.123 }, { ...probe, format: { format_name: 'matroska,webm' } }), 0);
});
test('first-packet guard is bounded, fails back for unknown/negative PTS and preserves cancellation', async () => {
  for (const [pts_time, expected] of [['0', true], ['0.317', true], ['-0.317', false], ['', false], ['NaN', false], [undefined, false]]) {
    assert.equal(await hasSeekableVideoStart('/local/input', {}, async (_binary, args, options) => {
      assert.ok(args.includes('%+#1')); assert.equal(options.maxOutputBytes, 4096); assert.equal(options.timeoutMs, 60_000);
      return JSON.stringify({ packets: [{ pts_time }] });
    }), expected);
  }
  for (const output of ['{}', '{broken']) assert.equal(await hasSeekableVideoStart('/local/input', {}, async () => output), false);
  for (const message of ['render_timeout', 'probe_output_limit', 'media_process_failed']) assert.equal(await hasSeekableVideoStart('/local/input', {}, async () => { throw new Error(message); }), false);
  await assert.rejects(hasSeekableVideoStart('/local/input', {}, async () => { throw new Error('render_canceled'); }), /render_canceled/);
});
test('rebuilt real-media matrix compares exact decoded frames and aligned audio against frozen baseline', { timeout: 180000 }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'clip-seek-rebuilt-'));
  try {
    const source = await syntheticSource(dir, 'source');
    const receipt = [];
    for (const [name, start, end] of [['zero', 0, 2000], ['early-fractional', 123, 2123], ['integer', 4000, 6000],
      ['keyframe', 10000, 12000], ['after-keyframe', 10001, 12001], ['fractional-late', 15123, 17123], ['remainder', 16123, null]]) {
      receipt.push(await compareSeekRenders(dir, name, source, { ...edit, trim_start_ms: start, trim_end_ms: end }));
    }
    const mark = path.join(dir, 'mark.png');
    await runMediaProcess('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=white:size=40x40', '-frames:v', '1', '-threads', '1', mark]);
    for (const [name, patch] of [['fit-watermark', { fit_mode: 'fit', clip_format: 'vertical_9_16', brand_mark_enabled: true }],
      ['center', { fit_mode: 'center', clip_format: 'landscape_16_9' }]]) {
      receipt.push(await compareSeekRenders(dir, name, source, { ...edit, ...patch }, patch.brand_mark_enabled ? mark : null));
    }
    for (const [name, options] of [['24fps', { rate: '24' }], ['25fps', { rate: '25' }], ['ntsc', { rate: '30000/1001' }],
      ['vfr', { filter: "select='if(lt(t,6),not(mod(n,2)),not(mod(n,3)))'" }],
      ['sparse', { rate: '1/5', audio: false, sparse: true }], ['no-audio', { audio: false }],
      ['positive-pts', { offset: 5.125 }], ['mov-delayed-audio', { mov: true, audioDelay: 0.317, audioRate: 44100 }],
      ['delayed-video', { videoDelay: 0.317 }], ['webm-opus', { webm: true }]]) {
      const input = await syntheticSource(dir, name, options);
      if (options.offset) assert.ok(Number((await probeClip(input)).format.start_time) > 5);
      if (options.videoDelay) assert.ok(Number((await probeClip(input)).streams.find(s => s.codec_type === 'video').start_time) > 0.3);
      receipt.push(await compareSeekRenders(dir, name, input, { ...edit,
        ...(name === 'sparse' ? { trim_start_ms: 14123, trim_end_ms: 16123 } : {}) }));
    }
    const rotated = path.join(dir, 'phone-rotation.mp4');
    await runMediaProcess('ffmpeg', ['-nostdin', '-v', 'error', '-display_rotation:v:0', '90', '-i', source, '-c', 'copy', rotated]);
    assert.ok((await probeClip(rotated)).streams[0].side_data_list?.some(data => Math.abs(Number(data.rotation)) === 90));
    receipt.push(await compareSeekRenders(dir, 'phone-rotation', rotated, { ...edit, clip_format: 'vertical_9_16', fit_mode: 'fit' }));
    const editList = path.join(dir, 'negative-pts-edit-list.mp4');
    await runMediaProcess('ffmpeg', ['-nostdin', '-v', 'error', '-ss', '0.317', '-i', source, '-t', '17', '-c', 'copy', '-avoid_negative_ts', 'disabled', editList]);
    const packet = JSON.parse(await runMediaProcess('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-read_intervals', '%+#1', '-show_packets', '-show_entries', 'packet=pts_time', '-of', 'json', editList]));
    assert.ok(Number(packet.packets[0].pts_time) < 0); assert.equal(await hasSeekableVideoStart(editList), false);
    receipt.push(await compareSeekRenders(dir, 'negative-pts-fallback', editList, edit));
    assert.equal(receipt.length, 21);
    t.diagnostic(JSON.stringify({ evidence: 'fresh rebuilt synthetic comparison, not recovered historical receipts', cases: receipt }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
