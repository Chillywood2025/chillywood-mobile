#!/usr/bin/env node
import { createR2ScannerRuntime, readScannerSecret, superviseR2Scanner } from './r2-scanner-runtime.mjs';

// Explicit operator invocation only. No credentials are provisioned, saved or
// discovered; no JSON/token/object details are printed. All configuration and
// actual host qualification remain separate launch prerequisites.
const args = process.argv.slice(2), allowed = new Set(['--config', '--upload', '--result', '--supervise']);
const options = {};
for (let i = 0; i < args.length; i++) {
  const name = args[i];
  if (!allowed.has(name) || Object.hasOwn(options, name)) throw Error('Invalid scanner arguments');
  options[name] = name === '--supervise' ? true : args[++i];
}
if (!options['--config'] || !options['--result'] || Boolean(options['--upload']) === Boolean(options['--supervise'])) throw Error('Use --config /private/config.json --result /private/result.json and either --upload scpv_upload_UUID or --supervise');
try {
  const config = JSON.parse(await readScannerSecret(options['--config'], 16384));
  const rpcToken = await readScannerSecret(process.env.PAID_VIDEO_R2_SCANNER_RPC_TOKEN_FILE);
  const text = await readScannerSecret(process.env.PAID_VIDEO_R2_SCANNER_KEY_FILE, 128);
  if (!/^[a-f0-9]{64}$/u.test(text)) throw Error('Scanner key unavailable');
  const runtime = createR2ScannerRuntime({ ...config, rpcToken, workerKey: Uint8Array.from(text.match(/../gu), value => Number.parseInt(value, 16)) });
  const controller = new AbortController();
  process.once('SIGTERM', () => controller.abort()); process.once('SIGINT', () => controller.abort());
  if (options['--supervise']) await superviseR2Scanner({ runtime, resultPath: options['--result'], signal: controller.signal });
  else await runtime.run({ uploadId: options['--upload'], resultPath: options['--result'] });
  process.stdout.write(JSON.stringify({ protocol: 'scpv-r2-scanner-cli-v1', state: 'completed' }) + '\n');
} catch {
  // Keep signed evidence private for explicit recovery. Never erase or retry an
  // uncertain completion, and never present scanner failure as clean media.
  process.stderr.write('Native scanner stopped. Review private pending state before restarting.\n'); process.exitCode = 1;
}
