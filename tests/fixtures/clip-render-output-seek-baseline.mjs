import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

const FORMATS = { vertical_9_16: 9 / 16, square_1_1: 1, landscape_16_9: 16 / 9 };
export const CLIP_RENDER_VERSION = 'clip-render-v1';
export const CLIP_RENDER_MAX_BYTES = 5 * 1024 ** 3;
const even = n => Math.max(2, Math.floor(n / 2) * 2);
const VIDEO_DEMUXERS = 'mov,matroska,webm';
const IMAGE_DEMUXERS = 'image2,png_pipe,jpeg_pipe,webp_pipe';

export function normalizeClipRenderEdit(edit) {
  if (!edit || !Object.hasOwn(FORMATS, edit.clip_format) || !['fill', 'fit', 'center'].includes(edit.fit_mode)) throw new Error('invalid_render_format');
  const start = edit.trim_start_ms ?? 0;
  const end = edit.trim_end_ms ?? null;
  if (!Number.isSafeInteger(start) || start < 0 || start >= 9_000_000 ||
      (end !== null && (!Number.isSafeInteger(end) || end <= start || end > 9_000_000))) throw new Error('invalid_trim_range');
  if (typeof edit.brand_mark_enabled !== 'boolean') throw new Error('invalid_watermark_choice');
  return { clip_format: edit.clip_format, fit_mode: edit.fit_mode, trim_start_ms: start, trim_end_ms: end,
    brand_mark_enabled: edit.brand_mark_enabled, brand_asset_id: edit.brand_mark_enabled ? edit.brand_asset_id : null };
}

export function buildClipRenderPlan(edit, probe, { watermarkPath = null } = {}) {
  const spec = normalizeClipRenderEdit(edit);
  const stream = probe?.streams?.find(s => s.codec_type === 'video');
  const width = Number(stream?.width), height = Number(stream?.height);
  const duration = Number(probe?.format?.duration);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 16384 || height > 16384 ||
      !Number.isFinite(duration) || duration <= 0 || duration > 9000) throw new Error('invalid_source_probe');
  // ffmpeg autorotates by default. Plan using display dimensions, not coded size.
  const rotation = Number(stream?.side_data_list?.find(s => Number.isFinite(Number(s.rotation)))?.rotation ?? stream?.tags?.rotate ?? 0);
  const rotated = Math.abs(rotation % 180) === 90;
  const sourceW = rotated ? height : width, sourceH = rotated ? width : height;
  const end = spec.trim_end_ms === null ? duration : spec.trim_end_ms / 1000;
  const start = spec.trim_start_ms / 1000;
  if (end > duration + 0.05 || start >= end || end - start < 0.1) throw new Error('trim_outside_source');
  if (spec.brand_mark_enabled && !watermarkPath) throw new Error('watermark_bytes_required');
  const ratio = FORMATS[spec.clip_format];
  // Never upscale the source. The long edge is bounded at 1080 pixels.
  const cropW = Math.min(sourceW, sourceH * ratio), cropH = Math.min(sourceH, sourceW / ratio);
  const factor = Math.min(1, 1080 / Math.max(cropW, cropH));
  const outW = even(cropW * factor), outH = even(cropH * factor);
  const framing = spec.fit_mode === 'fill'
    ? `crop=${even(cropW)}:${even(cropH)},scale=${outW}:${outH}`
    : `scale=${outW}:${outH}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`;
  const base = `${framing},setsar=1,fps=30,format=yuv420p`;
  const filter = spec.brand_mark_enabled
    ? `[0:v:0]${base}[base];[1:v:0]scale=${even(Math.min(outW * 0.18, 240))}:-2,format=rgba[mark];[base][mark]overlay=W-w-12:H-h-12:shortest=1[out]`
    : `[0:v:0]${base}[out]`;
  return { width: outW, height: outH, duration: end - start, start, filter, watermark: spec.brand_mark_enabled };
}

export function runMediaProcess(binary, args, { signal, timeoutMs = 7_200_000, maxOutputBytes = 1_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('render_canceled')); return; }
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let output = '', bytes = 0, failure = null;
    const stop = reason => { failure ??= reason; child.kill('SIGKILL'); };
    const abort = () => stop('render_canceled');
    const timer = setTimeout(() => stop('render_timeout'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > maxOutputBytes) stop('probe_output_limit'); else output += chunk; });
    // Never return raw ffmpeg stderr: source names can contain private details.
    child.stderr.on('data', () => {});
    child.once('error', () => { failure = 'media_binary_unavailable'; });
    child.once('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (failure || code !== 0) reject(new Error(failure || 'media_process_failed')); else resolve(output);
    });
  });
}

export async function probeClip(path, options = {}) {
  const raw = await runMediaProcess(options.ffprobe ?? 'ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', options.image ? IMAGE_DEMUXERS : VIDEO_DEMUXERS, '-show_streams', '-show_format', '-of', 'json', path], { ...options, timeoutMs: 60_000 });
  try { return JSON.parse(raw); } catch { throw new Error('invalid_probe_json'); }
}

/** Local files only. Caller owns trusted source download, lease and immutable upload. */
export async function renderClip({ inputPath, outputPath, watermarkPath = null, edit, signal, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe' }) {
  if (inputPath === outputPath || watermarkPath === outputPath) throw new Error('immutable_source_required');
  const existing = await stat(outputPath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing) throw new Error('render_output_exists');
  const probe = await probeClip(inputPath, { signal, ffprobe });
  if (watermarkPath) {
    const watermark = await probeClip(watermarkPath, { signal, ffprobe, image: true });
    const image = watermark.streams?.find(stream => stream.codec_type === 'video');
    if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1
      || image.width * image.height > 16_777_216) throw new Error('invalid_watermark_probe');
  }
  const plan = buildClipRenderPlan(edit, probe, { watermarkPath });
  // Reject playlist/concat demuxers even when a scanned payload lies about MIME.
  // A local-file protocol allowlist alone does not prevent nested file reads.
  const args = ['-nostdin', '-v', 'error', '-n', '-filter_complex_threads', '2', '-threads', '2', '-protocol_whitelist', 'file,pipe', '-format_whitelist', VIDEO_DEMUXERS, '-i', inputPath];
  if (plan.watermark) args.push('-loop', '1', '-protocol_whitelist', 'file,pipe', '-format_whitelist', IMAGE_DEMUXERS, '-i', watermarkPath);
  args.push('-ss', String(plan.start), '-t', String(plan.duration), '-filter_complex', plan.filter,
    '-map', '[out]', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-threads', '2',
    '-c:a', 'aac', '-b:a', '128k', '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart',
    '-fs', String(CLIP_RENDER_MAX_BYTES), outputPath);
  await runMediaProcess(ffmpeg, args, { signal });
  const output = await probeClip(outputPath, { signal, ffprobe });
  const video = output.streams.find(s => s.codec_type === 'video');
  const actualDuration = Number(output.format.duration);
  const size = (await stat(outputPath)).size;
  if (video?.width !== plan.width || video?.height !== plan.height || video?.codec_name !== 'h264' ||
      !Number.isFinite(actualDuration) || Math.abs(actualDuration - plan.duration) > 0.15 || size <= 0 || size >= CLIP_RENDER_MAX_BYTES) throw new Error('render_output_mismatch');
  await runMediaProcess(ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file,pipe', '-format_whitelist', VIDEO_DEMUXERS, '-i', outputPath, '-f', 'null', '-'], { signal });
  return { width: plan.width, height: plan.height, durationMs: Math.round(actualDuration * 1000), sizeBytes: size, mimeType: 'video/mp4', workerVersion: CLIP_RENDER_VERSION };
}
