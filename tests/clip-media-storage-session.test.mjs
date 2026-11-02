import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';
import { deferred } from './helpers/studio-source-harness.mjs';

// Execute both complete production modules. Only filesystem, auth, fetch and
// timers are synthetic; this harness never makes a device or provider request.
const root = process.env.STUDIO_SOURCE_ROOT || process.cwd();
const compile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  fileName: file,
}).outputText;
const storageCode = compile('_lib/mediaStorage.ts');
const sizeCode = compile('_lib/mediaUploadSize.ts');
const object = { provider: 'cloudflare_r2', bucket: 'fixture-bucket', objectKey: 'owner/cover.jpg' };
const uploadUrl = 'https://upload.invalid/synthetic-cover';
const gatewayUrl = 'https://gateway.invalid/functions/v1/media-storage';
const signedUpload = {
  ...object,
  uploadUrl,
  uploadHeaders: { 'Content-Length': '4096', 'Content-Type': 'image/jpeg', 'If-None-Match': '*' },
  expiresAt: '2099-01-01T00:00:00Z',
  reservationExpiresAt: '2099-01-01T00:01:00Z',
};
const verifiedUpload = {
  ...object, verified: true, observedMimeType: 'image/jpeg', observedSizeBytes: 4096,
  verifiedAt: '2099-01-01T00:00:00Z',
};

function fixture(options = {}) {
  const trace = [], paused = deferred(), gate = deferred(), counts = new Map();
  let current = true, timerId = 0;
  const timers = new Map();
  const step = async (name, details = {}) => {
    trace.push({ name, ...details });
    const count = (counts.get(name) || 0) + 1;
    counts.set(name, count);
    if (name === options.pauseAt && count === (options.pauseOccurrence || 1)) {
      paused.resolve();
      await gate.promise;
    }
  };
  const outcome = (name, outcomes) => {
    const result = outcomes?.[(counts.get(name) || 1) - 1] ?? { status: 200 };
    if (result instanceof Error) throw result;
    return result;
  };
  class SyntheticFile {
    constructor(uri) { this.uri = uri; }
  }
  const fileSystem = {
    cacheDirectory: 'file:///synthetic-cache/',
    FileSystemUploadType: { BINARY_CONTENT: 0 },
    copyAsync: async input => { await step('prepare', input); },
    getInfoAsync: async uri => { await step('size', { uri }); return { exists: true, size: 4096 }; },
    deleteAsync: async (uri, input) => { await step('local-cleanup', { uri, input }); },
    uploadAsync: async (url, uri, input) => {
      assert.equal(url, uploadUrl, 'only the synthetic signed upload endpoint is accepted');
      await step('native-upload', { uri, input });
      const result = outcome('native-upload', options.nativeOutcomes);
      return { status: result.status, body: result.body || '' };
    },
  };
  const auth = {
    getSession: async () => {
      await step('session');
      return { data: { session: { access_token: 'current-session-token' } }, error: null };
    },
  };
  const fetch = async (url, input) => {
    if (url === gatewayUrl) {
      assert.equal(input.method, 'POST');
      const body = JSON.parse(input.body), action = body.action;
      assert.ok(['create_upload_url', 'verify_upload', 'delete_object'].includes(action), `Unexpected action: ${action}`);
      await step(`gateway:${action}`, { body, authorization: input.headers.Authorization });
      const configured = options.gateway?.[action] || {};
      const status = configured.status ?? 200;
      return {
        status, ok: status >= 200 && status < 300,
        json: async () => {
          await step(`json:${action}`);
          if (configured.error) throw configured.error;
          return Object.hasOwn(configured, 'payload') ? configured.payload
            : action === 'create_upload_url' ? signedUpload
              : action === 'verify_upload' ? verifiedUpload : { ok: true };
        },
      };
    }
    assert.equal(url, uploadUrl, 'unexpected requests must not escape the synthetic transport');
    assert.equal(input.method, 'PUT');
    const mode = input.body instanceof SyntheticFile ? 'blob-upload' : 'native-body-upload';
    await step(mode, { input });
    const result = outcome(mode, mode === 'blob-upload' ? options.blobOutcomes : options.nativeBodyOutcomes);
    return {
      status: result.status, ok: result.status >= 200 && result.status < 300,
      text: async () => { await step(`${mode}:body`); return result.body || ''; },
    };
  };
  const sizeExports = {};
  vm.runInNewContext(sizeCode, { exports: sizeExports, Error });
  const exports = {};
  const resources = loadStubbed('_lib/mediaPickerResources.ts');
  const copyHelper = loadStubbed('_lib/prepareMediaUploadCopy.ts', {
    'expo-file-system/legacy': fileSystem, './mediaPickerResources': resources,
  });
  vm.runInNewContext(storageCode, {
    exports, Error, AbortController, fetch,
    require: name => {
      if (name === 'expo-file-system') return { File: SyntheticFile };
      if (name === 'expo-file-system/legacy') return fileSystem;
      if (name === './mediaUploadSize') return sizeExports;
      if (name === './mediaPickerResources') return resources;
      if (name === './prepareMediaUploadCopy') return copyHelper;
      if (name === './supabase') return { SUPABASE_FUNCTIONS_URL: 'https://gateway.invalid', supabase: { auth } };
      throw new Error(`Unexpected production import: ${name}`);
    },
    setTimeout: (callback, delay) => {
      const id = ++timerId;
      timers.set(id, callback);
      // Timeout guards remain inert; backoff proceeds without a wall-clock wait.
      if (delay <= 8000) void step('retry-delay', { delay }).then(() => {
        if (timers.has(id)) { timers.delete(id); callback(); }
      });
      return id;
    },
    clearTimeout: id => { timers.delete(id); },
  });
  const operation = {
    accessToken: 'initiating-session-token',
    assertOperationCurrent: () => { if (!current) throw new Error('operation retired'); },
  };
  const upload = overrides => exports.uploadFileToMediaStorage({
    surfaceType: 'creator_video', objectKey: object.objectKey,
    uri: 'content://synthetic-cover', mimeType: 'image/jpeg', fileName: 'cover.jpg',
    ...operation, ...overrides,
  });
  return { api: exports, operation, upload, trace, paused: paused.promise, gate,
    retire: () => { current = false; } };
}

const names = f => f.trace.map(entry => entry.name);
const requests = f => f.trace.filter(entry => entry.name.startsWith('gateway:')
  || ['session', 'native-upload', 'blob-upload', 'native-body-upload'].includes(entry.name));
const gatewayRequests = f => f.trace.filter(entry => entry.name.startsWith('gateway:'));
const assertCleanedOnce = f => {
  const copies = f.trace.filter(entry => entry.name === 'prepare');
  const deleted = f.trace.filter(entry => entry.name === 'local-cleanup');
  assert.equal(deleted.length, 1, 'prepared local copy is always retired exactly once');
  assert.equal(deleted[0].uri, copies[0].to, 'cleanup targets the prepared copy, not the original');
  assert.equal(deleted[0].input.idempotent, true);
};

async function cancelAt(options, overrides) {
  const f = fixture(options);
  const pending = f.upload(overrides);
  const rejected = assert.rejects(pending, /operation retired/);
  await f.paused;
  f.retire();
  const before = requests(f).slice();
  f.gate.resolve();
  await rejected;
  assert.deepEqual(requests(f), before, 'retired operation dispatches no next request or remote cleanup');
  assertCleanedOnce(f);
  return f;
}

for (const pauseAt of [
  'prepare', 'size', 'gateway:create_upload_url', 'json:create_upload_url',
  'native-upload', 'gateway:verify_upload', 'json:verify_upload', 'local-cleanup',
]) {
  test(`private cover upload stops after cancellation during ${pauseAt}`, { timeout: 5000 }, async () => {
    await cancelAt({ pauseAt });
  });
}

test('an already retired operation does not prepare a local file or perform IO', async () => {
  const f = fixture();
  f.retire();
  await assert.rejects(f.upload(), /operation retired/);
  assert.deepEqual(f.trace, []);
});

test('cancellation while gateway authentication is pending prevents its first request', { timeout: 5000 }, async () => {
  const f = await cancelAt({ pauseAt: 'session' }, { accessToken: undefined });
  assert.equal(gatewayRequests(f).length, 0);
});

test('standalone signed creation and deletion guard their asynchronous auth boundary', { timeout: 5000 }, async () => {
  for (const method of ['createSignedMediaUpload', 'deleteStoredMediaObject']) {
    const f = fixture({ pauseAt: 'session' });
    const pending = f.api[method]({
      ...object, surfaceType: 'creator_video', mimeType: 'image/jpeg', sizeBytes: 4096,
      assertOperationCurrent: f.operation.assertOperationCurrent,
    });
    const rejected = assert.rejects(pending, /operation retired/);
    await f.paused;
    f.retire(); f.gate.resolve();
    await rejected;
    assert.deepEqual(names(f), ['session']);
  }
});

for (const pauseAt of ['gateway:verify_upload', 'json:verify_upload']) {
  test(`a failed verification response after cancellation during ${pauseAt} cannot delete remotely`, { timeout: 5000 }, async () => {
    const f = await cancelAt({ pauseAt, gateway: { verify_upload: { status: 503, payload: { error: 'unavailable' } } } });
    assert.equal(names(f).includes('gateway:delete_object'), false);
  });
}

test('active verification failure deletes the uploaded object using the initiating token', async () => {
  const f = fixture({ gateway: { verify_upload: { status: 503, payload: { error: 'unavailable' } } } });
  await assert.rejects(f.upload(), /Media upload is not available/);
  assert.deepEqual(gatewayRequests(f).map(entry => entry.body.action), ['create_upload_url', 'verify_upload', 'delete_object']);
  for (const entry of gatewayRequests(f)) assert.equal(entry.authorization, 'Bearer initiating-session-token');
  assert.equal(names(f).includes('session'), false, 'no replacement-session token can enter the operation');
  assertCleanedOnce(f);
});

test('active verification mismatch preserves remote cleanup and local cleanup', async () => {
  const f = fixture({ gateway: { verify_upload: { payload: { ...verifiedUpload, observedSizeBytes: 2048 } } } });
  await assert.rejects(f.upload(), /did not match its verified reservation/);
  assert.deepEqual(gatewayRequests(f).map(entry => entry.body.action), ['create_upload_url', 'verify_upload', 'delete_object']);
  assertCleanedOnce(f);
});

test('a failed remote cleanup still removes the local prepared copy', async () => {
  const f = fixture({ gateway: {
    verify_upload: { status: 500, payload: { error: 'verify unavailable' } },
    delete_object: { status: 500, payload: { error: 'cleanup unavailable' } },
  } });
  await assert.rejects(f.upload(), /Media upload is not available/);
  assert.equal(names(f).filter(name => name === 'gateway:delete_object').length, 1);
  assertCleanedOnce(f);
});

test('cancellation while cleanup authentication is pending blocks remote deletion', { timeout: 5000 }, async () => {
  const f = fixture({ pauseAt: 'session', pauseOccurrence: 3,
    gateway: { verify_upload: { status: 500, payload: { error: 'verify unavailable' } } } });
  const pending = f.upload({ accessToken: undefined });
  const rejected = assert.rejects(pending, /Media upload is not available|operation retired/);
  await f.paused;
  f.retire();
  const before = requests(f).slice();
  f.gate.resolve();
  await rejected;
  assert.deepEqual(requests(f), before);
  assert.equal(names(f).includes('gateway:delete_object'), false);
  assertCleanedOnce(f);
});

const nativeUnavailable = () => new Error('synthetic native uploader unsupported');
const blobUnavailable = () => new Error('synthetic Blob uploader unsupported');
const slowDown = { status: 503, body: '<Error><Code>SlowDown</Code></Error>' };
for (const [label, config] of [
  ['native uploader rejection', { pauseAt: 'native-upload', nativeOutcomes: [nativeUnavailable()] }],
  ['Blob uploader rejection', { pauseAt: 'blob-upload', nativeOutcomes: [nativeUnavailable()], blobOutcomes: [blobUnavailable()] }],
  ['React Native body response', { pauseAt: 'native-body-upload', nativeOutcomes: [nativeUnavailable()], blobOutcomes: [blobUnavailable()] }],
  ['Blob error response body', { pauseAt: 'blob-upload:body', nativeOutcomes: [nativeUnavailable()], blobOutcomes: [{ status: 400, body: 'synthetic invalid upload' }] }],
  ['React Native error response body', { pauseAt: 'native-body-upload:body', nativeOutcomes: [nativeUnavailable()], blobOutcomes: [blobUnavailable()], nativeBodyOutcomes: [{ status: 400, body: 'synthetic invalid upload' }] }],
  ['native backoff', { pauseAt: 'retry-delay', nativeOutcomes: [slowDown] }],
  ['Blob backoff', { pauseAt: 'retry-delay', nativeOutcomes: [nativeUnavailable()], blobOutcomes: [slowDown] }],
  ['React Native backoff', { pauseAt: 'retry-delay', nativeOutcomes: [nativeUnavailable()], blobOutcomes: [blobUnavailable()], nativeBodyOutcomes: [slowDown] }],
]) {
  test(`cancellation during ${label} prevents fallback, retry and verification`, { timeout: 5000 }, async () => {
    const f = await cancelAt(config);
    assert.equal(names(f).includes('gateway:verify_upload'), false);
    assert.equal(names(f).includes('gateway:delete_object'), false);
  });
}

for (const [label, config, expectedUploads] of [
  ['native', {}, ['native-upload']],
  ['Blob fallback', { nativeOutcomes: [nativeUnavailable()] }, ['native-upload', 'blob-upload']],
  ['React Native fallback', { nativeOutcomes: [nativeUnavailable()], blobOutcomes: [blobUnavailable()] }, ['native-upload', 'blob-upload', 'native-body-upload']],
  ['native slowdown retry', { nativeOutcomes: [slowDown] }, ['native-upload', 'native-upload']],
  ['Blob slowdown retry', { nativeOutcomes: [nativeUnavailable()], blobOutcomes: [slowDown] }, ['native-upload', 'blob-upload', 'blob-upload']],
  ['React Native slowdown retry', { nativeOutcomes: [nativeUnavailable()], blobOutcomes: [blobUnavailable()], nativeBodyOutcomes: [slowDown] }, ['native-upload', 'blob-upload', 'native-body-upload', 'native-body-upload']],
]) {
  test(`current-session ${label} upload keeps the verified happy path`, async () => {
    const f = fixture(config);
    const result = await f.upload();
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { ...object, sizeBytes: 4096 });
    assert.deepEqual(names(f).filter(name => ['native-upload', 'blob-upload', 'native-body-upload'].includes(name)), expectedUploads);
    assert.deepEqual(gatewayRequests(f).map(entry => entry.body.action), ['create_upload_url', 'verify_upload']);
    for (const entry of gatewayRequests(f)) {
      assert.equal(entry.authorization, 'Bearer initiating-session-token');
      assert.equal(Object.hasOwn(entry.body, 'accessToken'), false, 'credentials remain in authorization headers only');
      assert.equal(Object.hasOwn(entry.body, 'assertOperationCurrent'), false);
    }
    assert.equal(names(f).includes('session'), false);
    assertCleanedOnce(f);
  });
}

test('existing callers without an operation guard or pinned token still upload and verify', async () => {
  const f = fixture();
  const result = await f.upload({ accessToken: undefined, assertOperationCurrent: undefined });
  assert.equal(result.sizeBytes, 4096);
  assert.equal(names(f).filter(name => name === 'session').length, 2);
  for (const entry of gatewayRequests(f)) assert.equal(entry.authorization, 'Bearer current-session-token');
  assertCleanedOnce(f);
});
