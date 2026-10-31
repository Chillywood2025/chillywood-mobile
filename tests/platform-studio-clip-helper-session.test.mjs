import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';
import { deferred, loadStudioFunctions } from './helpers/studio-source-harness.mjs';

// Execute current production helpers. All native, auth, storage and database
// boundaries are synthetic; this suite makes no provider or account requests.
const root = process.env.STUDIO_SOURCE_ROOT || process.cwd();
const source = `${root}/_lib/clipStudio.ts`;
const firstAuthority = { userId: 'owner', accountId: 'owner', sessionGeneration: 'first', state: 'ACTIVE', restoreOnly: false };
const { sameAccountSessionAuthority } = loadStudioFunctions('_lib/accountSessionAuthority.ts', ['sameAccountSessionAuthority'], {});

function harness({ stage, failureStage, metadataError = false, readbackCommitted = false, readbackResult, provider = 's3', bound = true } = {}) {
  let authority = { ...firstAuthority }, currentToken = 'initiating-token', uploadedPath = '', localCleanups = 0;
  const gate = deferred(), reached = deferred(), calls = [], requests = [], forwarded = [], authTokens = [];
  const assertOperationCurrent = () => {
    if (!sameAccountSessionAuthority(firstAuthority, authority)) throw new Error('Clip operation retired');
  };
  const options = bound ? { assertOperationCurrent, accessToken: 'initiating-token' } : undefined;
  const boundary = async name => {
    calls.push(name);
    if (name === stage) { reached.resolve(); await gate.promise; }
    if (name === failureStage) throw new Error(`Synthetic ${name} failure`);
  };
  const supabase = {
    auth: { getUser: async token => {
      authTokens.push(token);
      await boundary('auth');
      return { data: { user: { id: 'owner' } }, error: null };
    } },
    from(table) {
      let action = 'select', selected = '', payload, header;
      const request = {
        select(value) { selected = value; return request; },
        eq() { return request; }, is() { return request; },
        single() { return request; }, maybeSingle() { return request; }, returns() { return request; },
        update(value) { action = 'update'; payload = value; return request; },
        upsert(value) { action = 'upsert'; payload = value; return request; },
        setHeader(name, value) { assert.equal(name, 'Authorization'); header = value; return request; },
        then(resolve, reject) {
          const name = table === 'creator_clip_edits' ? 'edit-write' : action === 'update' ? 'metadata-write'
            : selected.includes('owner_id') ? 'owner-read' : 'metadata-readback';
          requests.push({ name, header, tokenAtDispatch: currentToken });
          return boundary(name).then(() => {
            if (name === 'owner-read') return { data: { id: 'video', owner_id: 'owner', thumb_storage_path: 'owner/video/cover-old.jpg', storage_provider: provider, storage_bucket: 'private' }, error: null };
            if (name === 'metadata-write') return metadataError
              ? { data: null, error: new Error('Metadata response lost') }
              : { data: { thumb_storage_path: payload.thumb_storage_path }, error: null };
            if (name === 'metadata-readback') return readbackResult ?? { data: { thumb_storage_path: readbackCommitted ? uploadedPath : 'owner/video/cover-old.jpg' }, error: null };
            return { data: payload, error: null };
          }).then(resolve, reject);
        },
      };
      return request;
    },
    storage: { from: () => ({ remove: async () => { await boundary('legacy-delete'); } }) },
  };
  const api = loadStubbed(source, {
    'expo-file-system/legacy': { cacheDirectory: 'fixture:cache/', copyAsync: async () => boundary('prepare'),
      deleteAsync: async () => { localCleanups++; await boundary('local-cleanup'); } },
    './supabase': { supabase },
    './imageUploadNormalization': { normalizeImageUploadFile: async file => ({
      file: { ...file, uri: 'file:///converted.jpg', name: 'converted.jpg', mimeType: 'image/jpeg', size: 120 },
      cleanup: async () => { localCleanups++; await boundary('normalization-cleanup'); },
    }) },
    './creatorVideos': { CREATOR_VIDEO_BUCKET: 'private', formatCreatorVideoFileSize: value => String(value) },
    './mediaStorage': {
      normalizeMediaStorageProvider: value => value, getMediaStorageProviderBucket: () => 'private',
      usesPrivateOriginMediaGateway: value => value === 's3' || value === 'cloudflare_r2',
      uploadFileToMediaStorage: async input => {
        forwarded.push(input); uploadedPath = input.objectKey; await boundary('cover-upload');
        return { provider: 's3', bucket: 'private', objectKey: uploadedPath, sizeBytes: 100 };
      },
      deleteStoredMediaObject: async input => { forwarded.push(input); await boundary('remote-delete'); },
    },
  });
  return {
    api, calls, requests, forwarded, authTokens, reached: reached.promise, release: gate.resolve,
    save: () => api.saveClipStudioEdit('video', { titleOverlayText: 'Edited' }, options),
    cover: (file = { uri: 'content://fixture-cover', name: 'cover.jpg', mimeType: 'image/jpeg', size: 100 }) => api.uploadClipStudioCoverImage({ videoId: 'video', file, ...options }),
    replace(value = { ...firstAuthority, sessionGeneration: 'replacement' }) { authority = value; currentToken = 'replacement-token'; },
    refreshToken() { currentToken = 'refreshed-token'; },
    localCleanups: () => localCleanups,
    assertOperationCurrent,
  };
}

for (const replacement of [null, { ...firstAuthority, userId: 'other', accountId: 'other' },
  { ...firstAuthority, sessionGeneration: 'replacement' }, { ...firstAuthority, restoreOnly: true }]) {
  test(`Clip edit stops after deferred auth for ${JSON.stringify(replacement)}`, async () => {
    const h = harness({ stage: 'auth' }), operation = h.save();
    await h.reached; h.replace(replacement); h.release();
    await assert.rejects(operation, /retired/);
    assert.deepEqual(h.calls, ['auth']);
  });
}

test('Clip edit never acknowledges an already-dispatched write after replacement', async () => {
  const h = harness({ stage: 'edit-write' }), operation = h.save();
  await h.reached; h.replace(); h.release();
  await assert.rejects(operation, /retired/);
  assert.deepEqual(h.calls, ['auth', 'edit-write']);
});

test('Already-retired Clip operations cannot begin auth or storage requests', async () => {
  for (const operationName of ['cover', 'save']) {
    const h = harness(); h.replace();
    await assert.rejects(h[operationName](), /retired/);
    assert.deepEqual(h.calls, []);
  }
});

for (const stage of ['auth', 'owner-read', 'prepare', 'cover-upload', 'local-cleanup', 'metadata-write']) {
  test(`Clip cover stops downstream requests after replacement during ${stage}`, async () => {
    const h = harness({ stage }), operation = h.cover();
    await h.reached;
    const before = h.calls.filter(name => name !== 'local-cleanup');
    h.replace(); h.release();
    await assert.rejects(operation, /retired/);
    assert.deepEqual(h.calls.filter(name => name !== 'local-cleanup'), before);
    assert.equal(h.localCleanups(), ['auth', 'owner-read'].includes(stage) ? 0 : 1,
      'Temporary file cleanup still runs after invalidation');
  });
}

for (const readbackCommitted of [false, true]) {
  test(`Clip cover starts no cleanup after replacement during ambiguous metadata readback (${readbackCommitted})`, async () => {
    const h = harness({ stage: 'metadata-readback', metadataError: true, readbackCommitted }), operation = h.cover();
    await h.reached;
    const before = [...h.calls];
    h.replace(); h.release();
    await assert.rejects(operation, /retired/);
    assert.deepEqual(h.calls, before);
    assert.equal(h.calls.includes('remote-delete'), false);
  });
}

test('Clip cover never acknowledges pending remote cleanup after replacement', async () => {
  const h = harness({ stage: 'remote-delete' }), operation = h.cover();
  await h.reached; h.replace(); h.release();
  await assert.rejects(operation, /retired/);
  assert.equal(h.calls.filter(name => name === 'remote-delete').length, 1,
    'Already-dispatched cleanup is not claimed canceled or retried');
});

for (const stage of ['cover-upload', 'remote-delete']) {
  test(`Clip cover suppresses downstream work after retired ${stage} rejects`, async () => {
    const h = harness({ stage, failureStage: stage }), operation = h.cover();
    await h.reached;
    const before = h.calls.filter(name => name !== 'local-cleanup');
    h.replace(); h.release();
    await assert.rejects(operation, /retired/);
    assert.deepEqual(h.calls.filter(name => name !== 'local-cleanup'), before);
    assert.equal(h.localCleanups(), 1);
  });
}

test('Clip cover preserves current-session ambiguous-commit readback and cleanup', async () => {
  const committed = harness({ metadataError: true, readbackCommitted: true });
  const cover = await committed.cover();
  assert.ok(cover.storagePath.includes('/cover-'));
  assert.equal(committed.calls.at(-1), 'remote-delete');
  assert.equal(committed.forwarded.at(-1).objectKey, 'owner/video/cover-old.jpg');
  const notCommitted = harness({ metadataError: true });
  await assert.rejects(notCommitted.cover(), /Metadata response lost/);
  assert.equal(notCommitted.calls.at(-1), 'remote-delete');
  assert.notEqual(notCommitted.forwarded.at(-1).objectKey, 'owner/video/cover-old.jpg');
});

for (const [label, readbackResult] of [
  ['unavailable', { data: null, error: new Error('Read unavailable') }],
  ['error with stale row', { data: { thumb_storage_path: 'owner/video/cover-old.jpg' }, error: new Error('Read failed') }],
  ['absent row', { data: null, error: null }],
  ['missing pointer', { data: {}, error: null }],
  ['malformed pointer', { data: { thumb_storage_path: 123 }, error: null }],
]) {
  test(`Clip cover preserves uploaded bytes after ambiguous write and ${label} readback`, async () => {
    const h = harness({ metadataError: true, readbackResult });
    await assert.rejects(h.cover(), /Metadata response lost/);
    assert.equal(h.calls.at(-1), 'metadata-readback');
    assert.equal(h.calls.includes('remote-delete'), false);
    assert.equal(h.localCleanups(), 1);
  });
}

test('Clip cover cleans new bytes only after successful readback proves a different pointer, including null', async () => {
  const h = harness({ metadataError: true, readbackResult: { data: { thumb_storage_path: null }, error: null } });
  await assert.rejects(h.cover(), /Metadata response lost/);
  assert.equal(h.calls.at(-1), 'remote-delete');
  assert.notEqual(h.forwarded.at(-1).objectKey, 'owner/video/cover-old.jpg');
});

test('Clip cover and edit allow same-session token refresh and retain initiating transport token', async () => {
  for (const operationName of ['cover', 'save']) {
    const h = harness({ stage: operationName === 'cover' ? 'cover-upload' : 'auth' });
    const operation = h[operationName]();
    await h.reached; h.refreshToken(); h.release();
    await operation;
    assert.deepEqual(h.authTokens, ['initiating-token']);
    for (const request of h.requests) assert.equal(request.header, 'Bearer initiating-token');
    for (const input of h.forwarded) {
      assert.equal(input.accessToken, 'initiating-token');
      assert.equal(input.assertOperationCurrent, h.assertOperationCurrent);
    }
  }
});

test('Bound Clip cover skips unpinnable legacy cleanup; unbound callers retain existing behavior', async () => {
  const bound = harness({ provider: 'supabase' });
  await bound.cover();
  assert.equal(bound.calls.includes('legacy-delete'), false);
  const unbound = harness({ provider: 'supabase', bound: false });
  await unbound.cover();
  assert.equal(unbound.calls.at(-1), 'legacy-delete');
  await unbound.save();
  assert.equal(unbound.calls.at(-1), 'edit-write');
});

test('Clip edit freezes the real Supabase SDK token across delayed auth resolution', async () => {
  let current = true, authReads = 0;
  const started = deferred(), release = deferred(), requests = [], authTokens = [];
  const client = createClient('https://ci.invalid', 'ci-placeholder-not-a-secret', {
    accessToken: async () => {
      if (++authReads === 1) return 'setup-fixture-token';
      started.resolve(); await release.promise; return 'replacement-fixture-token';
    },
    global: { fetch: async (url, options) => {
      requests.push({ url: String(url), authorization: new Headers(options.headers).get('Authorization') });
      return new Response(JSON.stringify({ video_id: 'video', owner_user_id: 'owner' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const api = loadStubbed(source, {
    './supabase': { supabase: { from: client.from.bind(client), auth: { getUser: async token => {
      authTokens.push(token); return { data: { user: { id: 'owner' } }, error: null };
    } } } },
    './creatorVideos': { CREATOR_VIDEO_BUCKET: 'private', formatCreatorVideoFileSize: String },
  });
  const operation = api.saveClipStudioEdit('video', {}, {
    accessToken: 'initiating-fixture-token', assertOperationCurrent: () => { if (!current) throw new Error('retired'); },
  });
  await started.promise; current = false; release.resolve();
  await assert.rejects(operation, /retired/);
  assert.deepEqual(authTokens, ['initiating-fixture-token']);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/rest\/v1\/creator_clip_edits/);
  assert.equal(requests[0].authorization, 'Bearer initiating-fixture-token');
});


test('HEIC cover uploads converted JPEG but retains original preview and cleans converted cache', async () => {
  const h = harness();
  const file = { uri: 'file:///original.heic', name: 'original.heic', mimeType: 'image/heic', size: 100 };
  const result = await h.cover(file);
  assert.equal(result.signedUrl, file.uri); assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(h.forwarded[0].uri, 'file:///converted.jpg');
  assert.equal(h.forwarded[0].mimeType, 'image/jpeg'); assert.equal(h.forwarded[0].sizeBytes, 120);
  assert.ok(h.forwarded[0].objectKey.endsWith('.jpg'));
  assert.ok(h.calls.includes('normalization-cleanup'));
});

test('gallery URI-only PNG metadata remains PNG through cover storage upload', async () => {
  const picker = loadStubbed(`${root}/_lib/deviceImagePicker.ts`, {
    'expo-image-picker': { UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
      launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///photo.png' }] }) },
  });
  const selected = await picker.pickDeviceImage('photos');
  const h = harness(), result = await h.cover(selected);
  assert.equal(result.mimeType, 'image/png'); assert.equal(h.forwarded[0].mimeType, 'image/png');
  assert.ok(h.forwarded[0].objectKey.endsWith('.png'));
});
