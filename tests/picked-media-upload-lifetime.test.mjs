import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Complete production service/resource modules. Only auth, storage, filesystem,
// fetch and time are synthetic: no device, provider or backend requests occur.
const root = process.env.STUDIO_SOURCE_ROOT || process.cwd();
const code = new Map();
function load(file, imports = {}, globals = {}) {
  if (!code.has(file)) code.set(file, ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText);
  const context = { exports: {}, Error, ...globals, require(name) {
    assert.ok(Object.hasOwn(imports, name), `Unmodeled production dependency: ${name}`);
    return imports[name];
  } };
  vm.runInNewContext(code.get(file), context, { filename: file });
  return context.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const authority = { userId: 'owner', accountId: 'owner', state: 'ACTIVE', restoreOnly: false, sessionGeneration: 'first' };
const pickedUri = 'file:///synthetic-native-gallery/opaque-selection.jpg';
const uploadUrl = 'https://upload.invalid/exact-signed-fixture';
const storageObject = { provider: 'cloudflare_r2', bucket: 'fixture-bucket', objectKey: 'owner/selected.jpg' };

function fixture(service, options = {}) {
  let current = true, nextTimer = 0;
  let reservedObject = storageObject;
  const timers = new Map(), trace = [], deleted = [], native = deferred(), entered = deferred();
  const copy = deferred(), copying = deferred(), localDeleted = [];
  const fallback = deferred(), fallbackEntered = deferred();
  const resources = load('_lib/mediaPickerResources.ts');
  const file = { uri: options.uri || pickedUri, name: 'selected.jpg', mimeType: 'image/jpeg', size: 79 };
  if (!options.unowned) resources.ownPickedMedia(file, () => {
    deleted.push(file.uri);
    if (options.cleanupError) throw options.cleanupError;
    return Promise.resolve();
  });
  const assertCurrent = () => { if (!current) throw new Error('initiating operation retired'); };
  const fallbackUpload = async (uri, headers) => {
    trace.push({ name: 'fallback', uri, headers }); fallbackEntered.resolve();
    if (options.holdFallback) await fallback.promise;
    if (options.fallbackError) throw options.fallbackError;
  };
  class LocalFile { constructor(uri) { this.uri = uri; } }
  const fileSystem = {
    cacheDirectory: 'file:///synthetic-cache/', FileSystemUploadType: { BINARY_CONTENT: 0 },
    getInfoAsync: async () => ({ exists: true, size: 79 }),
    copyAsync: input => {
      assert.equal(input.from, file.uri);
      trace.push({ name: 'copy', ...input }); copying.resolve();
      if (options.copyError) throw options.copyError;
      return options.holdCopy ? copy.promise : Promise.resolve();
    },
    deleteAsync: async (uri, config) => {
      assert.ok(trace.some(entry => entry.name === 'copy' && entry.to === uri), 'only our exact generated copy destination may be deleted');
      assert.notEqual(uri, file.uri, 'copy cleanup never deletes the original');
      assert.equal(config.idempotent, true); localDeleted.push(uri);
      if (options.cleanupError) throw options.cleanupError;
    },
    uploadAsync: (url, uri, config) => {
      trace.push({ name: 'native', url, uri, config }); entered.resolve();
      if (options.syncError) throw options.syncError;
      return native.promise;
    },
  };
  const storage = { from: () => ({
    upload: async (_key, body, config) => {
      await fallbackUpload(body.uri, config.headers);
      return { error: null };
    },
    createSignedUrl: async () => ({ data: { signedUrl: 'https://preview.invalid/fixture' }, error: null }),
    remove: async () => { trace.push({ name: 'remove' }); return { error: null }; },
  }) };
  const client = { storage, auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) }, from: table => {
    let payload, single = false;
    const query = {
      insert(value) { payload = value; return query; },
      update(value) { payload = value; return query; },
      select: () => query, eq: () => query, is: () => query, setHeader: () => query, returns: () => query,
      single() { single = true; return query; },
      maybeSingle() { return query; },
      then(resolve, reject) {
        const name = table === 'videos' ? (payload ? 'write' : 'owner-read') : single ? 'register' : 'write';
        trace.push({ name, table, payload });
        const data = table === 'videos' ? payload || { id: 'video', owner_id: 'owner', thumb_storage_path: null }
          : single ? { ...payload, deleted_at: null } : { user_id: 'owner' };
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const imports = {
    './mediaPickerResources': resources,
    './prepareMediaUploadCopy': load('_lib/prepareMediaUploadCopy.ts', {
      'expo-file-system/legacy': fileSystem, './mediaPickerResources': resources,
    }),
    'expo-file-system': { File: LocalFile }, 'expo-file-system/legacy': fileSystem,
    './supabase': { supabase: client, SUPABASE_URL: 'https://storage.invalid', SUPABASE_ANON_KEY: 'fixture-public', SUPABASE_FUNCTIONS_URL: 'https://gateway.invalid' },
    '@supabase/supabase-js': { createClient: (_url, _key, config) => {
      assert.equal(config.global.headers.Authorization, 'Bearer initiating-token'); return client;
    } },
    './accountBoundSupabaseMutation': {
      captureAccountBoundSupabaseMutationSubject: async () => ({ authority, accessToken: 'initiating-token' }),
      assertAccountBoundSupabaseMutationSubjectCurrent: assertCurrent,
      invokeAccountBoundSupabaseMutationRpc: async (_subject, name, request) => {
        assertCurrent(); trace.push({ name: 'official-rpc', rpc: name, request });
        return { data: { avatarUrl: request.p_avatar_url }, error: null };
      },
      isAccountBoundSupabaseMutationOutcomeAmbiguous: () => false,
    },
    './accountSessionAuthority': { sameAccountSessionAuthority: (a, b) => a === b, getCurrentAccountSessionAuthoritySnapshot: () => authority },
    './officialAccounts': { RACHI_OFFICIAL_ACCOUNT: { userId: 'official' } },
    './creatorVideos': { CREATOR_VIDEO_BUCKET: 'creator-videos', formatCreatorVideoFileSize: size => String(size) }, './profilePosts': {},
    './profileMedia': { pickProfileMediaImage: async () => file, PROFILE_AVATAR_MAX_BYTES: 10 * 1024 * 1024, PROFILE_MEDIA_BUCKET: 'profile-media' },
    './userFacingErrors': {}, './deviceImagePicker': {}, './logger': { reportRuntimeError() {} },
    './imageUploadNormalization': { normalizeImageUploadFile: async value => ({ file: value, cleanup: async () => {} }) },
    './userData': {
      USER_PROFILES_TABLE: 'user_profiles', readUserProfile: async () => ({}),
      normalizeProfileAppearanceFitMode: value => value || 'fill', normalizeProfileMediaStatus: value => value,
      normalizeUserProfile: value => value, cacheAcknowledgedUserProfile: async patch => patch,
    },
    './mediaUploadSize': load('_lib/mediaUploadSize.ts'),
  };
  const globals = {
    AbortController: options.noAbortController ? undefined : AbortController,
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, input = {}) => {
      if (url === 'https://preview.invalid/fixture') return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
      if (url === uploadUrl) {
        if (options.skipBlob && input.body instanceof LocalFile) throw new Error('Blob-style upload unsupported');
        await fallbackUpload(input.body.uri, input.headers);
        return { ok: true, status: 200 };
      }
      assert.equal(url, 'https://gateway.invalid/functions/v1/media-storage');
      assert.equal(input.headers.Authorization, 'Bearer initiating-token');
      const request = JSON.parse(input.body); trace.push({ name: request.action, request });
      assert.ok(['create_upload_url', 'verify_upload', 'delete_object'].includes(request.action));
      if (request.action === 'create_upload_url') reservedObject = { ...storageObject, objectKey: request.objectKey };
      const payload = request.action === 'create_upload_url' ? {
        ...reservedObject, uploadUrl,
        uploadHeaders: { 'Content-Length': '79', 'Content-Type': 'image/jpeg', 'If-None-Match': '*' },
        expiresAt: '2099-01-01T00:00:00Z', reservationExpiresAt: '2099-01-02T00:00:00Z',
      } : request.action === 'verify_upload' ? {
        ...reservedObject, verified: true, observedMimeType: 'image/jpeg', observedSizeBytes: 79, verifiedAt: '2099-01-01T00:00:00Z',
      } : { ok: true };
      return { ok: true, status: 200, json: async () => payload };
    },
  };
  if (service === 'clipStudio') imports['./mediaStorage'] = load('_lib/mediaStorage.ts', imports, globals);
  const module = load(`_lib/${service}.ts`, imports, globals);
  const run = () => service === 'clipStudio' ? module.uploadClipStudioCoverImage({ videoId: 'video', file, accessToken: 'initiating-token', assertOperationCurrent: assertCurrent })
    : service === 'officialRachi' ? module.chooseOfficialRachiProfileImageFromGallery()
    : service === 'profileMedia' ? module.uploadProfileMedia('avatar', file, { owner: { authority, isCurrent: () => current } })
    : service === 'platformBranding' ? module.uploadPlatformBrandAsset({ ownerUserId: 'owner', assetType: 'avatar', file, accessToken: 'initiating-token', assertOperationCurrent: assertCurrent })
      : module.uploadFileToMediaStorage({ ...storageObject, surfaceType: 'creator_video', ...file, sizeBytes: 79, accessToken: 'initiating-token', assertOperationCurrent: assertCurrent });
  return { resources, file, run, native, entered: entered.promise, fallback, fallbackEntered: fallbackEntered.promise, trace, deleted,
    copy, copying: copying.promise, localDeleted,
    retire() { current = false; }, release: () => resources.releasePickedMedia(file),
    timeout(phase = 'upload') {
      const active = [...timers.entries()].filter(([, timer]) => phase === 'copy' ? [20000, 30000].includes(timer.delay) : timer.delay >= 45000);
      assert.equal(active.length, 1, `one native ${phase} timeout is active`);
      const [id, timer] = active[0]; timers.delete(id); timer.callback();
    },
  };
}

for (const service of ['profileMedia', 'platformBranding', 'mediaStorage']) {
  for (const outcome of ['resolve', 'reject']) test(`${service}: completed timeout fallback cannot delete a still-reading native upload (${outcome})`, async () => {
    const f = fixture(service), result = f.run();
    await f.entered; f.timeout(); await result;
    assert.equal(f.trace.filter(entry => entry.name === 'fallback').length, 1);
    await f.release(); await f.release();
    assert.deepEqual(f.deleted, [], 'UI/helper completion is not native transport completion');
    if (outcome === 'resolve') f.native.resolve({ status: 200 });
    else f.native.reject(new Error('late original native failure'));
    await settle();
    assert.deepEqual(f.deleted, [f.file.uri], 'only the exact registered native cleanup runs, once');
    await f.release(); assert.equal(f.deleted.length, 1);
  });

  test(`${service}: retirement plus timeout rejects helper but keeps native bytes until raw settlement`, async () => {
    const f = fixture(service), result = f.run();
    const rejected = assert.rejects(result, /operation retired|action is no longer current/);
    await f.entered; f.retire(); await f.release(); f.timeout(); await rejected;
    assert.deepEqual(f.deleted, []);
    assert.equal(f.trace.some(entry => ['fallback', 'register', 'write', 'verify_upload'].includes(entry.name)), false);
    f.native.reject(new Error('late transport rejection')); await settle();
    assert.deepEqual(f.deleted, [f.file.uri]);
  });

  test(`${service}: native completion cannot delete a still-reading fallback after UI retirement`, async () => {
    const f = fixture(service, { holdFallback: true }), result = f.run();
    const rejected = assert.rejects(result, /operation retired|action is no longer current/);
    await f.entered; f.timeout(); await f.fallbackEntered;
    f.retire(); await f.release();
    f.native.resolve({ status: 200 }); await settle();
    assert.deepEqual(f.deleted, [], 'fallback holds an independent raw reader lease');
    f.fallback.resolve(); await rejected;
    assert.deepEqual(f.deleted, [f.file.uri]);
    assert.equal(f.trace.some(entry => ['register', 'write', 'verify_upload'].includes(entry.name)), false);
  });

  test(`${service}: synchronous native failure releases its reader and preserves fallback error`, async () => {
    const fallbackError = new Error('original fallback failure');
    const f = fixture(service, { syncError: new Error('native sync throw'), fallbackError, cleanupError: new Error('cleanup failure') });
    await assert.rejects(f.run(), service === 'profileMedia' ? /original fallback failure/ : error => error === fallbackError);
    await f.release(); await f.release();
    assert.deepEqual(f.deleted, [f.file.uri]);
  });

  test(`${service}: successful raw upload does not release a still-owned preview`, async () => {
    const f = fixture(service), result = f.run();
    await f.entered; f.native.resolve({ status: 200 }); await result;
    assert.deepEqual(f.deleted, []);
    assert.equal(f.trace.some(entry => entry.name === 'fallback'), false);
    if (service === 'platformBranding') assert.equal(f.trace.find(entry => entry.name === 'register').payload.moderation_status, 'pending_review');
    if (service === 'profileMedia') assert.equal(f.trace.find(entry => entry.name === 'write').payload.profile_avatar_scan_status, 'pending_scan');
    if (service === 'mediaStorage') assert.equal(f.trace.filter(entry => entry.name === 'verify_upload').length, 1);
    await f.release(); assert.deepEqual(f.deleted, [f.file.uri]);
  });

  test(`${service}: unknown URI and same-prefix files never grant cleanup ownership`, async () => {
    const f = fixture(service, { unowned: true, uri: `${pickedUri}-not-owned` }), result = f.run();
    await f.entered; await f.release(); f.timeout(); await result;
    f.native.reject(new Error('late unowned failure')); await settle();
    assert.deepEqual(f.deleted, []);
  });

  test(`${service}: copied file properties do not grant release ownership`, async () => {
    const f = fixture(service), result = f.run();
    await f.entered;
    await f.resources.releasePickedMedia({ ...f.file });
    f.native.resolve({ status: 200 }); await result;
    assert.deepEqual(f.deleted, []);
    await f.release(); assert.deepEqual(f.deleted, [f.file.uri]);
  });
}

test('mediaStorage: React Native body fallback retains its own raw reader until settlement', async () => {
  const f = fixture('mediaStorage', { holdFallback: true, skipBlob: true }), result = f.run();
  const rejected = assert.rejects(result, /operation retired/);
  await f.entered; f.native.reject(new Error('native unavailable')); await f.fallbackEntered;
  f.retire(); await f.release(); await settle();
  assert.deepEqual(f.deleted, []);
  f.fallback.resolve(); await rejected;
  assert.deepEqual(f.deleted, [f.file.uri]);
});

test('mediaStorage: fetch without AbortController keeps raw URI lease after its timeout rejects the helper', async () => {
  const f = fixture('mediaStorage', { holdFallback: true, noAbortController: true }), result = f.run();
  const rejected = assert.rejects(result, /operation retired/);
  await f.entered; f.timeout(); await f.fallbackEntered;
  f.retire(); await f.release(); f.timeout(); await rejected;
  f.native.reject(new Error('late native rejection')); await settle();
  assert.deepEqual(f.deleted, [], 'a timed-out raw fetch still owns its file bytes');
  f.fallback.resolve(); await settle();
  assert.deepEqual(f.deleted, [f.file.uri]);
});

test('mediaStorage: fetch abort request alone cannot drop the lease of an unsettled raw transport', async () => {
  const f = fixture('mediaStorage', { holdFallback: true }), result = f.run();
  const rejected = assert.rejects(result, /operation retired/);
  await f.entered; f.native.reject(new Error('native unavailable')); await f.fallbackEntered;
  f.retire(); await f.release(); f.timeout(); await settle();
  assert.deepEqual(f.deleted, [], 'abort signal is not proof of native completion');
  f.fallback.resolve(); await rejected;
  assert.deepEqual(f.deleted, [f.file.uri]);
});

for (const lateResult of ['resolve', 'reject']) test(`officialRachi: helper timeout never releases a still-reading native profile upload (${lateResult})`, async () => {
  const f = fixture('officialRachi'), pending = f.run();
  const rejected = assert.rejects(pending, /upload took too long/);
  await f.entered; f.timeout(); await rejected; await f.release();
  assert.deepEqual(f.deleted, []);
  assert.equal(f.trace.some(entry => entry.name === 'official-rpc'), false);
  if (lateResult === 'resolve') f.native.resolve({ status: 200, body: '{}' });
  else f.native.reject(new Error('late native failure'));
  await settle(); assert.deepEqual(f.deleted, [f.file.uri]);
});

test('officialRachi: settled stale native upload cannot publish using a replacement authority', async () => {
  const f = fixture('officialRachi'), pending = f.run();
  const rejected = assert.rejects(pending, /operation retired/);
  await f.entered; f.retire(); await f.release();
  assert.deepEqual(f.deleted, []);
  f.native.resolve({ status: 200, body: '{}' }); await rejected;
  assert.deepEqual(f.deleted, [f.file.uri]);
  assert.equal(f.trace.some(entry => entry.name === 'official-rpc'), false);
});

test('officialRachi: successful upload retains exact provider identity and initiating bearer', async () => {
  const f = fixture('officialRachi'), pending = f.run(); await f.entered;
  const request = f.trace.find(entry => entry.name === 'native');
  assert.equal(request.config.headers.Authorization, 'Bearer initiating-token');
  const key = decodeURIComponent(request.url.split('/profile-media/')[1]);
  f.native.resolve({ status: 200, body: JSON.stringify({ Key: `profile-media/${key}`, Id: 'fixture-object' }) });
  await pending;
  assert.equal(f.trace.filter(entry => entry.name === 'official-rpc').length, 1);
  assert.deepEqual(f.deleted, []);
  await f.release(); assert.deepEqual(f.deleted, [f.file.uri]);
});

const contentUri = 'content://external-provider/selected.jpg';
const copyDestination = f => f.trace.find(entry => entry.name === 'copy').to;
const downstream = f => f.trace.filter(entry => ['native', 'fallback', 'create_upload_url', 'verify_upload', 'register', 'write', 'official-rpc'].includes(entry.name));

for (const service of ['profileMedia', 'platformBranding', 'mediaStorage', 'officialRachi', 'clipStudio']) {
  for (const outcome of ['resolve', 'reject']) test(`${service}: content copy timeout defers destination cleanup until raw ${outcome} without dispatching upload`, async () => {
    const f = fixture(service, { uri: contentUri, unowned: true, holdCopy: true }), pending = f.run();
    const rejected = assert.rejects(pending, /took too long to prepare|preparation took too long/);
    await f.copying; f.timeout('copy'); await rejected;
    assert.deepEqual(f.localDeleted, []);
    assert.deepEqual(downstream(f), []);
    if (outcome === 'resolve') f.copy.resolve(); else f.copy.reject(new Error('late raw copy rejection'));
    await settle();
    assert.deepEqual(f.localDeleted, [copyDestination(f)]);
    assert.deepEqual(downstream(f), [], 'late copy completion cannot resurrect a timed-out operation');
    await f.release(); await f.release();
    assert.deepEqual(f.deleted, [], 'unowned provider original is not adopted or deleted');
    assert.equal(f.localDeleted.length, 1);
  });

  test(`${service}: synchronous raw copy failure preserves its error and retires only the generated destination`, async () => {
    const error = new Error('original synchronous copy failure');
    const f = fixture(service, { uri: contentUri, unowned: true, copyError: error, cleanupError: new Error('cleanup failure') });
    await assert.rejects(f.run(), value => value === error);
    assert.deepEqual(f.localDeleted, [copyDestination(f)]);
    assert.deepEqual(downstream(f), []); assert.deepEqual(f.deleted, []);
  });

  test(`${service}: account retirement during copy cleans its destination after raw completion and never starts upload`, async () => {
    const f = fixture(service, { uri: contentUri, unowned: true, holdCopy: true }), pending = f.run();
    const rejected = assert.rejects(pending, /operation retired|action is no longer current/);
    await f.copying; f.retire(); await f.release();
    assert.deepEqual(f.localDeleted, []);
    f.copy.resolve(); await rejected;
    assert.deepEqual(f.localDeleted, [copyDestination(f)]);
    assert.deepEqual(downstream(f), []); assert.deepEqual(f.deleted, []);
  });

  test(`${service}: prepared-copy upload timeout cannot delete bytes still read by native`, async () => {
    const f = fixture(service, { uri: contentUri, unowned: true }), pending = f.run();
    const completed = service === 'officialRachi' ? assert.rejects(pending, /upload took too long/) : pending;
    await f.entered;
    assert.equal(f.trace.find(entry => entry.name === 'native').uri, copyDestination(f));
    f.timeout(); await completed;
    assert.deepEqual(f.localDeleted, [], 'helper finally requests release without racing the raw native reader');
    f.native.reject(new Error('late prepared-copy upload failure')); await settle();
    assert.deepEqual(f.localDeleted, [copyDestination(f)]);
    assert.deepEqual(f.deleted, []);
  });
}

for (const service of ['profileMedia', 'platformBranding', 'mediaStorage', 'clipStudio']) test(`${service}: prepared-copy SDK/fetch fallback owns bytes independently of original native upload`, async () => {
  const f = fixture(service, { uri: contentUri, unowned: true, holdFallback: true }), pending = f.run();
  const rejected = assert.rejects(pending, /operation retired|action is no longer current/);
  await f.entered; f.timeout(); await f.fallbackEntered;
  assert.equal(f.trace.find(entry => entry.name === 'fallback').uri, copyDestination(f));
  f.retire(); f.native.resolve({ status: 200 }); await settle();
  assert.deepEqual(f.localDeleted, []);
  f.fallback.resolve(); await rejected;
  assert.deepEqual(f.localDeleted, [copyDestination(f)]); assert.deepEqual(f.deleted, []);
});

test('owned content source is independently retained until raw copy settles but never released by the preparer', async () => {
  const f = fixture('mediaStorage', { uri: contentUri, holdCopy: true }), pending = f.run();
  const rejected = assert.rejects(pending, /preparation took too long/);
  await f.copying; await f.release(); f.timeout('copy'); await rejected;
  assert.deepEqual(f.deleted, []); assert.deepEqual(f.localDeleted, []);
  f.copy.resolve(); await settle();
  assert.deepEqual(f.deleted, [contentUri]);
  assert.deepEqual(f.localDeleted, [copyDestination(f)]);
});

test('prepared-copy cleanup is idempotent while a raw reader outlives repeated release requests', async () => {
  const resources = load('_lib/mediaPickerResources.ts'), reads = deferred(), deleted = [];
  const destinationUri = 'file:///synthetic-cache/fresh-generated-copy.jpg';
  const helper = load('_lib/prepareMediaUploadCopy.ts', {
    './mediaPickerResources': resources,
    'expo-file-system/legacy': {
      copyAsync: async ({ from, to }) => { assert.equal(from, contentUri); assert.equal(to, destinationUri); },
      deleteAsync: async uri => deleted.push(uri),
    },
  });
  const prepared = await helper.prepareMediaUploadCopy({ sourceUri: contentUri, destinationUri, waitForCopy: async copy => copy });
  const reading = resources.withPickedMediaRead(prepared.uri, () => reads.promise);
  await prepared.cleanup(); await prepared.cleanup(); assert.deepEqual(deleted, []);
  reads.resolve(); await reading; await prepared.cleanup();
  assert.deepEqual(deleted, [destinationUri]);
});
