import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const jobToken = 'synthetic-dedicated-job-token-not-a-real-secret';
const operatorToken = 'synthetic-legacy-operator-token-not-a-real-secret';
const workerPath = fileURLToPath(new URL('../ops/malware-scanner-worker/worker.mjs', import.meta.url));

async function runWorker({ provider = 'cloudflare_r2', dedicated = jobToken, legacy = operatorToken, denied = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'scanner-job-token-test-'));
  const data = Buffer.from('Harmless synthetic private-origin fixture\n');
  const calls = [];
  const job = { id: '10000000-0000-4000-8000-000000000001', target_table: 'videos', target_column: 'playback_url',
    storage_provider: provider, storage_bucket: 'synthetic-private', storage_object_key: 'fixture/private.bin', attempt_count: 1 };
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const name = req.url.split('/').at(-1);
    const payload = raw ? JSON.parse(raw) : null;
    calls.push({ name, payload, headers: req.headers });
    if (name === 'media-scan-private-access') {
      res.writeHead(denied ? 401 : 200, { 'content-type': 'application/octet-stream' });
      // Exercise credential redaction if an error response echoes the credential.
      res.end(denied ? jobToken : data);
      return;
    }
    res.setHeader('content-type', 'application/json');
    const responses = { recover_media_scan_jobs: {}, claim_media_scan_jobs: [job], complete_media_scan_job: { status: payload?.p_status } };
    res.end(JSON.stringify(responses[name] ?? null));
  });
  try {
    const scanner = join(directory, 'synthetic-scanner.mjs');
    // This executable checks real worker-downloaded bytes. It is not ClamAV efficacy proof.
    await writeFile(scanner, `#!/usr/bin/env node\nimport {readFileSync} from 'node:fs';\nif(process.argv.includes('--version'))console.log('ClamAV fixture/123');else if(readFileSync(process.argv.at(-1)).toString('hex')!==${JSON.stringify(data.toString('hex'))})process.exit(2);\n`, { mode: 0o700 });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const child = spawn(process.execPath, [workerPath], {
      env: { PATH: process.env.PATH, SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-local-service-key',
        WORKER_ID: 'synthetic-job-worker', SCAN_ONCE: 'true', FRESHCLAM_ON_START: 'false', CLAMSCAN_BIN: scanner,
        MEDIA_SCAN_JOB_TOKEN: dedicated, MEDIA_SCAN_OPERATOR_TOKEN: legacy },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    let code;
    try { code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); }
    finally { clearTimeout(timer); }
    assert.equal(code, 0, output);
    assert.ok(!output.includes(jobToken), 'dedicated credential must never appear in output');
    assert.ok(!output.includes(operatorToken), 'legacy credential must never appear in output');
    return { calls, output, data, job };
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

for (const provider of ['s3', 'cloudflare_r2']) {
  test(`real worker uses only dedicated gateway header for ${provider}`, async () => {
    const result = await runWorker({ provider });
    const downloads = result.calls.filter(call => call.name === 'media-scan-private-access');
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].headers['x-media-scan-job-token'], jobToken);
    assert.equal(downloads[0].headers['x-media-scan-operator-token'], undefined);
    assert.equal(downloads[0].headers.authorization, undefined);
    assert.equal(downloads[0].headers.apikey, undefined);
    assert.deepEqual(downloads[0].payload, { action: 'download_scan_job', job_id: result.job.id, worker_id: 'synthetic-job-worker' });
    const completions = result.calls.filter(call => call.name === 'complete_media_scan_job');
    assert.equal(completions.length, 1);
    assert.equal(completions[0].payload.p_status, 'clean');
    const completed = result.output.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(entry => entry.event === 'media_scan_completed');
    assert.equal(completed.sha256, createHash('sha256').update(result.data).digest('hex'));
    assert.equal(completed.bytes, result.data.length);
    assert.equal(completed.byteReceiptId, null, 'private-origin jobs do not claim Supabase brand receipts');
  });
}

test('real worker does not fall back to a populated shared key when the dedicated key is absent', async () => {
  const result = await runWorker({ dedicated: '' });
  assert.equal(result.calls.filter(call => call.name === 'media-scan-private-access').length, 0);
  const completions = result.calls.filter(call => call.name === 'complete_media_scan_job');
  assert.equal(completions.length, 1);
  assert.equal(completions[0].payload.p_status, 'scan_failed');
  assert.equal(completions[0].payload.p_error_message, 'media_scan_job_token_required');
});

test('real worker treats dedicated-key denial as failure, redacts it and never retries with shared key', async () => {
  const result = await runWorker({ denied: true });
  assert.equal(result.calls.filter(call => call.name === 'media-scan-private-access').length, 1);
  const completions = result.calls.filter(call => call.name === 'complete_media_scan_job');
  assert.equal(completions.length, 1);
  assert.equal(completions[0].payload.p_status, 'scan_failed');
  assert.equal(completions[0].payload.p_error_message, 'download_failed_401: [redacted]');
});
