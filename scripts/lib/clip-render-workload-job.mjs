// Local synthetic qualification only; this is not a queue/storage worker.
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { renderClip } from './clip-render-core.mjs';

const spec = JSON.parse(await readFile(process.argv[2], 'utf8'));
const controller = new AbortController();
process.on('SIGUSR1', () => controller.abort());
const started = performance.now();
let result;
try {
  const output = await renderClip({ ...spec.render, signal: controller.signal });
  result = { ok: !spec.expectedError, output, expectedError: spec.expectedError ?? null };
} catch (error) {
  // Do not retain source paths or raw FFmpeg stderr in qualification receipts.
  const allowed = ['render_canceled', 'media_process_failed', 'render_timeout', 'render_output_mismatch'];
  const code = allowed.includes(error?.message) ? error.message : 'unexpected_render_error';
  result = { ok: code === spec.expectedError, error: code, expectedError: spec.expectedError ?? null };
}
result.render_elapsed_seconds = (performance.now() - started) / 1000;
result.measurement = spec.expectedError === 'render_canceled' ? 'direct_core_cancellation' : 'local_core_with_phase_meter';
await writeFile(spec.resultPath, JSON.stringify(result, null, 2) + '\n');
process.exitCode = result.ok ? 0 : 1;
