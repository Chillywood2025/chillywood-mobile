import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the complete production entrypoint, not extracted/copied helpers. Every
// dependency boundary is synthetic: no Deno server, provider, or network starts.
const gatewaySource = readFileSync(new URL('../supabase/functions/media-scan-private-access/index.ts', import.meta.url), 'utf8');
const transpileGateway = (source) => ts.transpileModule(source, {
  fileName: 'media-scan-private-access/index.ts',
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const gatewayJavascript = transpileGateway(gatewaySource);

const JOB_HEADER = 'x-media-scan-job-token';
const OPERATOR_HEADER = 'x-media-scan-operator-token';
const JOB_HASH_ENV = 'MEDIA_SCAN_JOB_TOKEN_SHA256';
const OPERATOR_HASH_ENV = 'MEDIA_SCAN_OPERATOR_TOKEN_SHA256';
const JOB_TOKEN = 'synthetic-job-only-token-for-regression-00000001';
const OPERATOR_TOKEN = 'synthetic-legacy-operator-token-for-regression-02';
const JOB_ID = '10000000-0000-4000-8000-000000000001';
const SOURCE_ID = '20000000-0000-4000-8000-000000000002';
const WORKER_ID = 'synthetic-claimed-worker';
const PROVIDER_BYTES = Buffer.from('Synthetic gateway bytes\u0000\u00ff\n');
const ACTIONS = ['audit_candidate', 'download', 'download_scan_job', 'transcode_download', 'premium_hd_download', 'record_scan_result'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const BASE_ENV = {
  [JOB_HASH_ENV]: hash(JOB_TOKEN),
  [OPERATOR_HASH_ENV]: hash(OPERATOR_TOKEN),
  SUPABASE_URL: 'https://synthetic-project.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-never-used-outside-this-test',
  S3_ENDPOINT: 'https://synthetic-s3.invalid',
  S3_REGION: 'synthetic-region',
  S3_BUCKET: 'synthetic-s3-private',
  S3_ACCESS_KEY_ID: 'synthetic-s3-access-key',
  S3_SECRET_ACCESS_KEY: 'synthetic-s3-secret-key',
  MEDIA_ORIGIN_PRIVATE_ONLY: 'true',
  MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED: 'true',
  MEDIA_ORIGIN_BUCKET: 'synthetic-r2-private',
  MEDIA_ORIGIN_R2_ENDPOINT: 'https://synthetic-r2.invalid',
  MEDIA_ORIGIN_R2_ACCESS_KEY_ID: 'synthetic-r2-access-key',
  MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY: 'synthetic-r2-secret-key',
};
const BASE_JOB = {
  id: JOB_ID, status: 'scanning', claimed_by: WORKER_ID,
  storage_provider: 'supabase', storage_bucket: 'synthetic-private',
  storage_object_key: 'synthetic-owner/scan fixture.bin', size_bytes: PROVIDER_BYTES.length,
};
const BASE_CANDIDATE = {
  id: SOURCE_ID, owner_id: 'synthetic-owner', title: 'Synthetic video',
  visibility: 'public', scan_status: 'pending', moderation_status: 'approved',
  mime_type: 'video/mp4', storage_provider: 'supabase',
  storage_bucket: 'synthetic-private', storage_object_key: 'synthetic-owner/video.mp4',
  storage_path: null, playback_url: null, file_size_bytes: PROVIDER_BYTES.length,
};
const payloadFor = (action = 'download_scan_job') => ({
  action, job_id: JOB_ID, worker_id: WORKER_ID,
  source_type: 'creator_video', source_id: SOURCE_ID,
  scanner_name: 'synthetic-ffprobe', scanner_version: 'synthetic-1',
  scanner_type: 'ffprobe_media_readability', status: 'clean',
  proof: { observedReadable: true, decodedStreams: 1 },
});

function mountGateway(options = {}) {
  const env = { ...BASE_ENV, ...options.env };
  const job = options.job === null ? null : { ...BASE_JOB, ...options.job };
  const candidate = options.candidate === null ? null : { ...BASE_CANDIDATE, ...options.candidate };
  const calls = { client: [], queries: [], writes: [], fetch: [], env: [], events: [], json: 0 };
  let handler;
  const client = {
    from(table) {
      assert.ok(['media_scan_jobs', 'videos', 'creator_content_prices', 'creator_monetization_configs', 'media_renditions', 'media_security_audit_events'].includes(table), `Unexpected table: ${table}`);
      const query = { table, operations: [] };
      calls.queries.push(query);
      const chain = {};
      for (const method of ['select', 'eq', 'not', 'or', 'limit', 'like']) {
        chain[method] = (...args) => { query.operations.push([method, ...args]); return chain; };
      }
      chain.maybeSingle = async () => {
        calls.events.push('database');
        query.operations.push(['maybeSingle']);
        const row = table === 'media_scan_jobs' ? job : table === 'videos' ? candidate : null;
        // Honor actual handler predicates. Missing status/worker filters therefore
        // make negative claim tests return the row and expose the regression.
        const matches = row && query.operations.filter(([method]) => method === 'eq')
          .every(([, key, value]) => row[key] === value);
        return { data: matches ? structuredClone(row) : null, error: options.databaseError ?? null };
      };
      chain.insert = async (value) => {
        assert.equal(table, 'media_security_audit_events');
        calls.writes.push({ table, value: structuredClone(value) });
        return { error: null };
      };
      return chain;
    },
  };
  const createClient = (...args) => { calls.events.push('client'); calls.client.push(args); return client; };
  const sandbox = {
    exports: {},
    require(name) {
      assert.equal(name, 'npm:@supabase/supabase-js@2', 'Unexpected production dependency');
      return { createClient };
    },
    Deno: {
      env: { get(name) { calls.env.push(name); return env[name]; } },
      serve(value) { assert.equal(handler, undefined, 'Entrypoint registered more than once'); handler = value; },
    },
    crypto: webcrypto, TextEncoder, TextDecoder, ArrayBuffer, Uint8Array,
    Request, Response, Headers, URL, URLSearchParams, ReadableStream,
    console: { error() {} },
    fetch: async (url, init) => {
      // Never delegate to the host fetch, even when a URL is unexpected.
      const parsed = new URL(url);
      assert.ok(parsed.hostname.endsWith('.invalid'), 'Only synthetic provider hosts are allowed');
      calls.fetch.push({ url: String(url), init });
      return new Response(PROVIDER_BYTES, { status: options.providerStatus ?? 200, headers: { 'content-type': 'application/octet-stream' } });
    },
  };
  const javascript = options.source === undefined ? gatewayJavascript : transpileGateway(options.source);
  vm.runInNewContext(javascript, sandbox, { filename: 'media-scan-private-access/index.ts' });
  assert.equal(typeof handler, 'function', 'Actual Deno entrypoint must register a handler');
  return {
    calls,
    async request({ headers = { [JOB_HEADER]: JOB_TOKEN }, payload = payloadFor(), rawBody, method = 'POST' } = {}) {
      const request = new Request('https://synthetic-gateway.invalid/media-scan-private-access', {
        method, headers,
        ...(method === 'POST' ? { body: rawBody ?? JSON.stringify(payload) } : {}),
      });
      const readJson = request.json.bind(request);
      request.json = () => { calls.json += 1; calls.events.push('parse'); return readJson(); };
      return handler(request);
    },
  };
}

function assertNoProviderAccess(harness, { parsed = 0 } = {}) {
  assert.equal(harness.calls.json, parsed, 'Body parsing must follow authentication');
  assert.equal(harness.calls.client.length, 0, 'Rejected scope must not construct a privileged client');
  assert.equal(harness.calls.queries.length, 0);
  assert.equal(harness.calls.writes.length, 0);
  assert.equal(harness.calls.fetch.length, 0);
  assert.equal(harness.calls.env.includes('SUPABASE_SERVICE_ROLE_KEY'), false, 'Rejected scope must not read the service-role credential');
}

async function assertJsonError(response, status, error) {
  assert.equal(response.status, status);
  const body = await response.json();
  if (error) assert.equal(body.error, error);
  else assert.equal(typeof body.error, 'string');
  return body;
}

async function assertDownload(response, provider = 'supabase') {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-media-scan-storage-provider'), provider);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PROVIDER_BYTES);
}

test('dedicated credential permits only a claimed job download across the entire six-action matrix', async (t) => {
  for (const action of ACTIONS) await t.test(action, async () => {
    const h = mountGateway();
    const response = await h.request({ payload: payloadFor(action) });
    if (action === 'download_scan_job') {
      await assertDownload(response);
      assert.deepEqual(h.calls.events, ['parse', 'client', 'database']);
      assert.equal(h.calls.client.length, 1);
      assert.equal(h.calls.writes.length, 0);
      assert.deepEqual(h.calls.queries.map(({ table }) => table), ['media_scan_jobs']);
      assert.deepEqual(h.calls.queries[0].operations.filter(([method]) => method === 'eq'), [
        ['eq', 'id', JOB_ID], ['eq', 'status', 'scanning'], ['eq', 'claimed_by', WORKER_ID],
      ]);
      assert.equal(h.calls.fetch.length, 1);
      assert.equal(h.calls.fetch[0].url, `${BASE_ENV.SUPABASE_URL}/storage/v1/object/synthetic-private/synthetic-owner/scan%20fixture.bin`);
      assert.equal(h.calls.fetch[0].init.headers.authorization, `Bearer ${BASE_ENV.SUPABASE_SERVICE_ROLE_KEY}`);
    } else {
      await assertJsonError(response, 403, 'scanner_job_action_forbidden');
      assertNoProviderAccess(h, { parsed: 1 });
    }
  });
});

test('legacy operator credential preserves successful behavior for all six actions', async (t) => {
  for (const action of ACTIONS) await t.test(action, async () => {
    const h = mountGateway({ candidate: { scan_status: ['transcode_download', 'premium_hd_download'].includes(action) ? 'clean' : 'pending' } });
    const response = await h.request({ headers: { [OPERATOR_HEADER]: OPERATOR_TOKEN }, payload: payloadFor(action) });
    assert.equal(response.status, 200);
    assert.equal(h.calls.client.length, 1);
    assert.equal(h.calls.events[0], 'parse');
    if (action === 'audit_candidate') {
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.noSecretsReturned, true);
      assert.equal(body.candidate.sourceId, SOURCE_ID);
      assert.equal(body.candidate.objectKeyRedacted, true);
      assert.equal(h.calls.fetch.length, 0);
    } else if (action === 'record_scan_result') {
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.result.malwareScanStateChanged, false);
      assert.equal(body.result.readabilityStatus, 'readable');
      assert.equal(h.calls.writes.length, 1);
      assert.equal(h.calls.writes[0].value.action, 'media_readability_result_recorded');
      assert.equal(h.calls.fetch.length, 0);
    } else {
      await assertDownload(response);
      assert.equal(h.calls.fetch.length, 1);
    }
  });
});

test('missing, malformed, mismatched, short, or long credentials fail before parsing or client construction', async (t) => {
  const missingHeaders = mountGateway();
  await assertJsonError(await missingHeaders.request({ headers: {}, rawBody: '{invalid' }), 401);
  assertNoProviderAccess(missingHeaders);
  for (const [header, envName, token] of [[JOB_HEADER, JOB_HASH_ENV, JOB_TOKEN], [OPERATOR_HEADER, OPERATOR_HASH_ENV, OPERATOR_TOKEN]]) {
    for (const [label, configuredHash] of [
      ['absent', undefined], ['empty', ''], ['whitespace', ' \t '],
      ['short hash', 'a'.repeat(63)], ['long hash', 'a'.repeat(65)],
      ['nonhex hash', 'g'.repeat(64)], ['prefixed hash', `sha256:${hash(token)}`],
    ]) await t.test(`${header}: ${label}`, async () => {
      const h = mountGateway({ env: { [envName]: configuredHash } });
      await assertJsonError(await h.request({ headers: { [header]: token }, rawBody: '{invalid' }), 401);
      assertNoProviderAccess(h);
    });
    for (const [label, suppliedToken] of [
      ['empty', ''], ['whitespace', ' \t '], ['short', 's'.repeat(31)],
      ['long', 'l'.repeat(513)], ['wrong digest', 'synthetic-incorrect-token-with-valid-length'],
    ]) await t.test(`${header}: ${label} token`, async () => {
      // Even a matching digest must not make out-of-bounds tokens valid.
      const h = mountGateway({ env: { [envName]: label === 'wrong digest' ? hash(token) : hash(suppliedToken.trim()) } });
      await assertJsonError(await h.request({ headers: { [header]: suppliedToken }, rawBody: '{invalid' }), 401);
      assertNoProviderAccess(h);
    });
  }
});

test('token length boundaries and normalized hash/header whitespace remain accepted', async (t) => {
  for (const [header, envName] of [[JOB_HEADER, JOB_HASH_ENV], [OPERATOR_HEADER, OPERATOR_HASH_ENV]]) {
    for (const length of [32, 512]) await t.test(`${header}: ${length} characters`, async () => {
      const token = 's'.repeat(length);
      const h = mountGateway({ env: { [envName]: ` ${hash(token).toUpperCase()} ` } });
      await assertDownload(await h.request({ headers: { [header]: ` \t${token}\t ` } }));
    });
  }
});

test('credentials cannot be swapped between headers or fall back to the other configured hash', async (t) => {
  for (const [header, token] of [[JOB_HEADER, OPERATOR_TOKEN], [OPERATOR_HEADER, JOB_TOKEN]]) {
    for (const action of ACTIONS) await t.test(`${header}: swapped token for ${action}`, async () => {
      const h = mountGateway();
      await assertJsonError(await h.request({ headers: { [header]: token }, payload: payloadFor(action) }), 401);
      assertNoProviderAccess(h);
    });
  }
  for (const configuredHash of [undefined, 'malformed', hash(JOB_TOKEN)]) await t.test(`no legacy fallback with job hash ${configuredHash ? 'configured' : 'absent'}`, async () => {
    const h = mountGateway({ env: { [JOB_HASH_ENV]: configuredHash } });
    await assertJsonError(await h.request({ headers: { [JOB_HEADER]: OPERATOR_TOKEN }, rawBody: '{invalid' }), 401);
    assertNoProviderAccess(h);
  });
});

test('both nonempty authentication headers reject before body parsing, regardless of validity', async (t) => {
  for (const jobToken of [JOB_TOKEN, 'synthetic-invalid-job-token-of-valid-length']) {
    for (const operatorToken of [OPERATOR_TOKEN, 'synthetic-invalid-operator-token-of-valid-length']) await t.test(`job ${jobToken === JOB_TOKEN ? 'valid' : 'invalid'}, operator ${operatorToken === OPERATOR_TOKEN ? 'valid' : 'invalid'}`, async () => {
      const h = mountGateway();
      await assertJsonError(await h.request({ headers: { [JOB_HEADER]: jobToken, [OPERATOR_HEADER]: operatorToken }, rawBody: '{invalid' }), 401);
      assertNoProviderAccess(h);
    });
  }
});

test('empty or whitespace-only second headers count as absent and never change identity', async (t) => {
  for (const blank of ['', ' \t ']) {
    for (const action of ACTIONS) await t.test(`dedicated with blank operator header: ${action} (${blank.length})`, async () => {
      const h = mountGateway();
      const response = await h.request({ headers: { [JOB_HEADER]: JOB_TOKEN, [OPERATOR_HEADER]: blank }, payload: payloadFor(action) });
      if (action === 'download_scan_job') await assertDownload(response);
      else { await assertJsonError(response, 403, 'scanner_job_action_forbidden'); assertNoProviderAccess(h, { parsed: 1 }); }
    });
    await t.test(`legacy with blank job header (${blank.length})`, async () => {
      const h = mountGateway();
      const response = await h.request({ headers: { [JOB_HEADER]: blank, [OPERATOR_HEADER]: OPERATOR_TOKEN }, payload: payloadFor('audit_candidate') });
      assert.equal(response.status, 200);
    });
  }
});

test('equal configured hashes cannot promote the dedicated identity through the legacy header', async (t) => {
  const env = { [JOB_HASH_ENV]: hash(JOB_TOKEN), [OPERATOR_HASH_ENV]: hash(JOB_TOKEN) };
  await t.test('dedicated job download remains scoped and usable', async () => {
    const h = mountGateway({ env });
    await assertDownload(await h.request());
  });
  for (const action of ACTIONS) await t.test(`legacy header rejects dedicated identity for ${action}`, async () => {
    const h = mountGateway({ env });
    await assertJsonError(await h.request({ headers: { [OPERATOR_HEADER]: JOB_TOKEN }, payload: payloadFor(action) }), 401);
    assertNoProviderAccess(h);
  });
});

test('independent credential configuration does not require the other identity to be enabled', async (t) => {
  for (const value of [undefined, 'malformed']) {
    await t.test(`job works without valid legacy hash (${String(value)})`, async () => {
      const h = mountGateway({ env: { [OPERATOR_HASH_ENV]: value } });
      await assertDownload(await h.request());
    });
    await t.test(`legacy works without valid job hash (${String(value)})`, async () => {
      const h = mountGateway({ env: { [JOB_HASH_ENV]: value } });
      assert.equal((await h.request({ headers: { [OPERATOR_HEADER]: OPERATOR_TOKEN }, payload: payloadFor('audit_candidate') })).status, 200);
    });
  }
});

test('authenticated invalid bodies/actions reject without reading provider credentials or constructing clients', async (t) => {
  for (const headers of [{ [JOB_HEADER]: JOB_TOKEN }, { [OPERATOR_HEADER]: OPERATOR_TOKEN }]) {
    for (const rawBody of ['{invalid', 'null', '"not an object"']) await t.test(`invalid body for ${Object.keys(headers)[0]}: ${rawBody}`, async () => {
      const h = mountGateway();
      await assertJsonError(await h.request({ headers, rawBody }), 400, 'invalid_body');
      assertNoProviderAccess(h, { parsed: 1 });
    });
    await t.test(`invalid action for ${Object.keys(headers)[0]}`, async () => {
      const h = mountGateway();
      await assertJsonError(await h.request({ headers, payload: { action: 'not_a_gateway_action' } }), 400, 'invalid_action');
      assertNoProviderAccess(h, { parsed: 1 });
    });
  }
});

test('job downloads require a matching active claim and the exact requested job and worker', async (t) => {
  for (const [label, job] of [
    ['missing job', null], ['wrong job id', { id: SOURCE_ID }],
    ['different worker', { claimed_by: 'another-synthetic-worker' }], ['unclaimed', { claimed_by: null }],
    ['pending', { status: 'pending' }], ['clean', { status: 'clean' }], ['failed', { status: 'scan_failed' }],
  ]) await t.test(label, async () => {
    const h = mountGateway({ job });
    await assertJsonError(await h.request(), 403, 'scan_job_claim_invalid');
    assert.equal(h.calls.fetch.length, 0);
    assert.equal(h.calls.writes.length, 0);
  });
  for (const [label, payload] of [
    ['missing job id', { job_id: undefined }], ['invalid job id', { job_id: 'not-a-uuid' }],
    ['missing worker', { worker_id: undefined }], ['blank worker', { worker_id: ' \t ' }],
    ['overlong worker', { worker_id: 'w'.repeat(256) }],
  ]) await t.test(label, async () => {
    const h = mountGateway();
    await assertJsonError(await h.request({ payload: { ...payloadFor(), ...payload } }), 400, 'scan_job_identity_required');
    assert.equal(h.calls.queries.length, 0);
    assert.equal(h.calls.fetch.length, 0);
  });
});

test('claimed-job storage guards reject unsupported providers, missing buckets, unsafe keys, and excess bytes', async (t) => {
  for (const [label, job] of [
    ['unsupported provider', { storage_provider: 'ftp' }], ['missing provider', { storage_provider: '' }],
    ['missing bucket', { storage_bucket: ' ' }], ['missing key', { storage_object_key: '' }],
    ['absolute key', { storage_object_key: '/private/object' }], ['traversal key', { storage_object_key: 'owner/../object' }],
    ['control character key', { storage_object_key: 'owner/\u0000object' }], ['overlong key', { storage_object_key: 'k'.repeat(1025) }],
    ['oversized object', { size_bytes: 101 }],
  ]) await t.test(label, async () => {
    const h = mountGateway({ job, env: { MEDIA_SCAN_MAX_DOWNLOAD_BYTES: '100' } });
    await assertJsonError(await h.request(), 403, 'scan_job_storage_invalid');
    assert.equal(h.calls.fetch.length, 0);
    assert.equal(h.calls.writes.length, 0);
  });
  await t.test('exact configured size limit remains allowed', async () => {
    const h = mountGateway({ job: { size_bytes: 100 }, env: { MEDIA_SCAN_MAX_DOWNLOAD_BYTES: '100' } });
    await assertDownload(await h.request());
  });
  await t.test('default five GiB size limit remains enforced', async () => {
    const h = mountGateway({ job: { size_bytes: 5 * 1024 * 1024 * 1024 + 1 } });
    await assertJsonError(await h.request(), 403, 'scan_job_storage_invalid');
    assert.equal(h.calls.fetch.length, 0);
  });
});

test('claimed jobs stream only the configured S3 or private R2 bucket and preserve provider failures', async (t) => {
  for (const [provider, bucket, hostname, bucketError] of [
    ['s3', BASE_ENV.S3_BUCKET, `${BASE_ENV.S3_BUCKET}.synthetic-s3.invalid`, 'invalid_s3_bucket'],
    ['cloudflare_r2', BASE_ENV.MEDIA_ORIGIN_BUCKET, `${BASE_ENV.MEDIA_ORIGIN_BUCKET}.synthetic-r2.invalid`, 'invalid_r2_origin_bucket'],
  ]) {
    await t.test(`${provider}: configured bucket`, async () => {
      const h = mountGateway({ job: { storage_provider: provider, storage_bucket: bucket } });
      await assertDownload(await h.request(), provider);
      assert.equal(h.calls.fetch.length, 1);
      const url = new URL(h.calls.fetch[0].url);
      assert.equal(url.hostname, hostname);
      assert.equal(url.pathname, '/synthetic-owner/scan%20fixture.bin');
      assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
      assert.ok(url.searchParams.has('X-Amz-Signature'));
    });
    await t.test(`${provider}: wrong bucket`, async () => {
      const h = mountGateway({ job: { storage_provider: provider, storage_bucket: 'wrong-synthetic-bucket' } });
      await assertJsonError(await h.request(), 403, bucketError);
      assert.equal(h.calls.fetch.length, 0);
    });
  }
  for (const [provider, bucket] of [['supabase', BASE_JOB.storage_bucket], ['s3', BASE_ENV.S3_BUCKET], ['cloudflare_r2', BASE_ENV.MEDIA_ORIGIN_BUCKET]]) {
    await t.test(`${provider}: provider failure`, async () => {
      const h = mountGateway({ job: { storage_provider: provider, storage_bucket: bucket }, providerStatus: 503 });
      await assertJsonError(await h.request(), 502, 'source_download_failed');
      assert.equal(h.calls.fetch.length, 1);
    });
  }
});

test('legacy candidate guards still deny private, premium, original, blocked, and unsuitable sources', async (t) => {
  for (const [label, candidate, reason] of [
    ['private', { visibility: 'private' }, 'private_denied'],
    ['premium', { visibility: 'premium' }, 'premium_denied'],
    ['original master', { storage_object_key: 'synthetic-owner/originals/video.mp4' }, 'original_master_denied'],
    ['moderation blocked', { moderation_status: 'blocked' }, 'moderation_blocked'],
    ['malware detected', { scan_status: 'malware_detected' }, 'scan_blocked'],
    ['unsupported MIME type', { mime_type: 'application/pdf' }, 'unsupported_mime_type'],
    ['unsupported storage', { storage_provider: 'ftp' }, 'unsupported_storage_provider'],
  ]) await t.test(label, async () => {
    const h = mountGateway({ candidate });
    const body = await assertJsonError(await h.request({ headers: { [OPERATOR_HEADER]: OPERATOR_TOKEN }, payload: payloadFor('download') }), 403, 'candidate_not_scannable');
    assert.ok(body.blockedReasons.includes(reason));
    assert.equal(h.calls.fetch.length, 0);
    assert.equal(h.calls.writes.length, 0);
  });
});

test('negative controls prove the real-handler assertions reject scope and credential-fallback regressions', async (t) => {
  const mutateOnce = (needle, replacement) => {
    assert.equal(gatewaySource.split(needle).length, 2, 'Mutation must target exactly one production statement');
    return gatewaySource.replace(needle, replacement);
  };
  await t.test('removing dedicated action scope fails the forbidden-action assertion', async () => {
    const source = mutateOnce('scannerAuthority === "job" && action !== "download_scan_job"', 'false');
    const h = mountGateway({ source });
    const response = await h.request({ payload: payloadFor('audit_candidate') });
    await assert.rejects(assertJsonError(response, 403, 'scanner_job_action_forbidden'),
      (error) => error.code === 'ERR_ASSERTION' && error.actual === 200 && error.expected === 403);
    assert.equal(h.calls.client.length, 1, 'Mutant actually reached the privileged path');
  });
  await t.test('accepting the shared hash as a dedicated fallback fails the unauthorized assertion', async () => {
    const source = mutateOnce('if (!timingSafeEqualHex(actualHash, expectedHash)) return null;',
      'if (!timingSafeEqualHex(actualHash, expectedHash)) return jobToken && timingSafeEqualHex(actualHash, toText(Deno.env.get("MEDIA_SCAN_OPERATOR_TOKEN_SHA256"))) ? "job" : null;');
    const h = mountGateway({ source });
    const response = await h.request({ headers: { [JOB_HEADER]: OPERATOR_TOKEN } });
    await assert.rejects(assertJsonError(response, 401),
      (error) => error.code === 'ERR_ASSERTION' && error.actual === 200 && error.expected === 401);
    assert.equal(h.calls.fetch.length, 1, 'Mutant actually downloaded the claimed source');
  });
});
