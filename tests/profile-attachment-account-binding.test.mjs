import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';
const ts = createRequire(import.meta.url)('typescript');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness(stage, failed = false, realStorage = false) {
  let scopeCurrent = true;
  let current = { userId: 'A', sessionGeneration: 'one' };
  const subject = { authority: { ...current }, accessToken: 'token-A-one' };
  const entered = deferred(), held = deferred(), uploads = [], writes = [], deletes = [], warnings = [], committed = new Map(), requests = [];
  let cleanups = 0, sharedReads = 0;
  const pause = async at => { if (at === stage) { entered.resolve(); await held.promise; } };
  const client = token => ({ from: () => {
    let row;
    const query = { insert: value => { row = value; return query; }, select: () => query, returns: () => query,
      eq: () => query, in: () => query, is: () => query, order: () => query, limit: () => query,
      then: resolve => Promise.resolve({ data: failed ? null : [], error: failed ? { code: '503' } : null }).then(resolve),
      single: async () => {
        writes.push({ token, row });
        if (!failed || failed === 'lost-response' || failed === 'throw-response') committed.set(row.id, row);
        await pause('row');
        if (failed === 'throw-response') throw new Error('transport failure after commit');
        return { data: failed ? null : row, error: failed ? { message: 'fixture failure', code: failed === 'lost-response' ? '' : '42501' } : null };
      } };
    return query;
  } });
  const mocks = {
    '@supabase/supabase-js': { createClient: (_url, _key, options) => client(options.global.headers.Authorization) },
    './supabase': { supabase: { ...client('shared'), auth: { getSession: async () => { sharedReads++; return { data: { session: { user: { id: current.userId } } } }; } } }, SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture' },
    './accountBoundSupabaseMutation': {
      captureAccountBoundSupabaseMutationSubject: async () => subject,
      assertAccountBoundSupabaseMutationSubjectCurrent: value => { if (JSON.stringify(value.authority) !== JSON.stringify(current)) throw new Error('account changed'); },
    },
    './imageUploadNormalization': { normalizeImageUploadFile: async file => { await pause('normalize'); return { file, cleanup: async () => { cleanups++; await pause('after-upload'); } }; } },
    './userFacingErrors': { UserFacingError: class extends Error { constructor(code, message) { super(message); this.code = code; } } },
    './mediaStorage': {
      uploadFileToMediaStorage: async input => { uploads.push(input); input.assertOperationCurrent?.(); await pause('upload'); return { provider: 's3', bucket: 'bucket', objectKey: input.objectKey, sizeBytes: 10 }; },
      deleteStoredMediaObject: async input => { deletes.push(input); if (failed === 'cleanup') throw new Error('private provider error'); },
      normalizeMediaStorageProvider: value => value, getMediaStorageProviderBucket: input => input.bucket,
      usesPrivateOriginMediaGateway: () => true,
      createSignedMediaDownload: () => { throw new Error('unexpected shared signing'); },
    },
  };
  if (realStorage) {
    const load = (file, dependencies, globals = {}) => {
      const context = { exports: {}, Error, ...globals, require: name => {
        if (name === './prepareMediaUploadCopy') return load('_lib/prepareMediaUploadCopy.ts', dependencies);
        assert.ok(name in dependencies, name); return dependencies[name]; } };
      vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
      return context.exports;
    };
    let objectKey;
    mocks['./mediaStorage'] = load('_lib/mediaStorage.ts', {
      './mediaPickerResources': loadStubbed('_lib/mediaPickerResources.ts'),
      'expo-file-system': { File: class {} },
      'expo-file-system/legacy': { FileSystemUploadType: { BINARY_CONTENT: 0 },
        uploadAsync: async () => { requests.push({ action: 'put' }); await pause('native-put'); return { status: 200 }; },
        getInfoAsync: async () => ({ exists: true, size: 10 }),
      },
      './mediaUploadSize': load('_lib/mediaUploadSize.ts', {}),
      './supabase': { ...mocks['./supabase'], SUPABASE_FUNCTIONS_URL: 'https://gateway.invalid' },
    }, { AbortController, setTimeout, clearTimeout, fetch: async (_url, input) => {
      const body = JSON.parse(input.body); requests.push({ action: body.action, token: input.headers.Authorization, objectKey: body.objectKey });
      if (body.action === 'create_upload_url') objectKey = body.objectKey;
      const object = { provider: 's3', bucket: 'bucket', objectKey };
      return { ok: true, status: 200, json: async () => body.action === 'create_upload_url'
        ? { ...object, uploadUrl: 'https://upload.invalid', expiresAt: '2099-01-01', reservationExpiresAt: '2099-01-02', uploadHeaders: { 'Content-Type': 'application/pdf', 'Content-Length': '10', 'If-None-Match': '*' } }
        : body.action === 'verify_upload' ? { ...object, verified: true, observedMimeType: 'application/pdf', observedSizeBytes: 10, verifiedAt: '2099-01-01' }
          : { ok: true } };
    } });
  }
  const context = { exports: {}, console: { warn: value => warnings.push(value) }, require: name => { assert.ok(name in mocks, name); return mocks[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/socialAttachments.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { uploads, writes, deletes, warnings, committed, requests, api: context.exports, entered: entered.promise, release: held.resolve,
    retireScope: () => { scopeCurrent = false; },
    switch: generation => { current = generation ? { userId: 'A', sessionGeneration: 'two' } : { userId: 'B', sessionGeneration: 'one' }; },
    run: (surfaceType = 'profile_post') => context.exports.createSocialAttachmentForSurface({ surfaceType, surfaceId: 'parent-A', file: { uri: 'file:///fixture.pdf', name: 'fixture.pdf', size: 10 }, isCurrent: () => scopeCurrent, ...(surfaceType === 'chat_message' ? {} : { mutationSubject: subject }) }),
    state: () => ({ cleanups, sharedReads }) };
}
for (const generation of [false, true]) {
  test(`normalization held across ${generation ? 'session' : 'account'} replacement never uploads`, async () => {
    const h = harness('normalize'); const pending = h.run(); await h.entered; h.switch(generation); h.release();
    await assert.rejects(pending); assert.equal(h.uploads.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.state().cleanups, 1);
  });
  test(`returned upload stub crossing ${generation ? 'session' : 'account'} replacement rolls back only with original token`, async () => {
    const h = harness('upload'); const pending = h.run(); await h.entered; h.switch(generation); h.release();
    await assert.rejects(pending); assert.equal(h.writes.length, 0); assert.equal(h.deletes.length, 1);
    assert.equal(h.uploads[0].accessToken, 'token-A-one'); assert.equal(h.deletes[0].accessToken, 'token-A-one');
    assert.match(h.deletes[0].objectKey, /^A\/profile_post\/parent-A\//); assert.equal(h.state().sharedReads, 0);
  });
  test(`successful row held across ${generation ? 'session' : 'account'} replacement cannot acknowledge replacement`, async () => {
    const h = harness('row'); const pending = h.run(); await h.entered; h.switch(generation); h.release();
    await assert.rejects(pending, h.api.isSocialAttachmentOutcomeAmbiguous); assert.equal(h.writes[0].token, 'Bearer token-A-one'); assert.equal(h.writes[0].row.owner_user_id, 'A');
    assert.equal(h.deletes.length, 0, 'do not destroy a committed attachment on stale acknowledgement');
  });
}
for (const surface of ['creator_video_comment', 'chat_message', 'watch_party_room_message']) {
  test(`real uploader ${surface} scope retired during PUT never verifies or saves`, async () => {
    const h = harness('native-put', false, true), pending = h.run(surface);
    await h.entered; h.retireScope(); h.release(); await assert.rejects(pending);
    assert.deepEqual(h.requests.map(r => r.action), ['create_upload_url', 'put']);
    assert.equal(h.requests[0].token, 'Bearer token-A-one'); assert.equal(h.writes.length, 0);
    assert.equal(h.state().cleanups, 1); assert.equal(h.state().sharedReads, 0);
  });
}
test('failed row uses original-token rollback even after account replacement', async () => {
  const h = harness('row', true); const pending = h.run('profile_post_comment'); await h.entered; h.switch(false); h.release();
  await assert.rejects(pending); assert.equal(h.deletes[0].accessToken, 'token-A-one'); assert.equal(h.writes[0].token, 'Bearer token-A-one');
});
for (const mode of ['lost-response', 'throw-response']) test(`committed insert with ${mode} retains its object rather than destructive rollback`, async () => {
  const h = harness('row', mode); const pending = h.run(); await h.entered; h.release();
  await assert.rejects(pending, h.api.isSocialAttachmentOutcomeAmbiguous); assert.equal(h.writes.length, 1); assert.equal(h.deletes.length, 0);
  assert.equal(h.committed.size, 1);
  assert.deepEqual(h.warnings, ['Attachment save outcome could not be confirmed; upload retained.']);
});
test('rollback failure is observable without logging private provider details', async () => {
  const h = harness(undefined, 'cleanup'); await assert.rejects(h.run());
  assert.equal(h.deletes.length, 1);
  assert.deepEqual(h.warnings, ['Attachment upload cleanup could not be confirmed.']);
});
test('successful profile attachment acknowledges initiating owner', async () => {
  const h = harness(); const result = await h.run(); assert.equal(result.ownerUserId, 'A'); assert.equal(result.scanStatus, 'pending_scan');
  assert.equal(h.deletes.length, 0); assert.equal(h.state().sharedReads, 0);
});
test('stale initiating subject is rejected before normalization or shared session recapture', async () => {
  const h = harness(); h.switch(false); await assert.rejects(h.run());
  assert.equal(h.uploads.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.state().sharedReads, 0);
});
test('direct chat attachment captures an exact subject rather than using the shared client', async () => {
  const h = harness(); const result = await h.run('chat_message'); assert.equal(result.ownerUserId, 'A');
  assert.equal(h.uploads[0].accessToken, 'token-A-one'); assert.equal(h.writes[0].token, 'Bearer token-A-one'); assert.equal(h.state().sharedReads, 0);
});
test('strict profile reads reject unavailable attachment data while legacy callers retain fallback', async () => {
  const h = harness(undefined, true);
  await assert.rejects(h.api.readSocialAttachmentsForSurfaces('profile_post', ['parent-A'], { throwOnUnavailable: true }), /could not be loaded/);
  assert.equal((await h.api.readSocialAttachmentsForSurfaces('chat_message', ['parent-A'])).size, 0);
});
test('strict profile reads accept a successful empty attachment result', async () => {
  const h = harness();
  assert.equal((await h.api.readSocialAttachmentsForSurfaces('profile_post', ['parent-A'], { throwOnUnavailable: true })).size, 0);
});
test('ambiguity predicate does not trust provider objects or ordinary errors with the same text', () => {
  const h = harness(), message = 'This attachment may have been saved. Refresh before posting again.';
  assert.equal(h.api.isSocialAttachmentOutcomeAmbiguous(new Error(message)), false);
  assert.equal(h.api.isSocialAttachmentOutcomeAmbiguous({ code: 'attachment_action', message }), false);
});
for (const generation of [false, true]) {
  test(`real uploader retired during PUT retains reservation and sends no later request (${generation ? 'session' : 'account'})`, async () => {
    const h = harness('native-put', false, true), pending = h.run();
    await h.entered; h.switch(generation); h.release(); await assert.rejects(pending);
    assert.deepEqual(h.requests.map(r => r.action), ['create_upload_url', 'put']);
    assert.equal(h.requests[0].token, 'Bearer token-A-one'); assert.equal(h.writes.length, 0);
    assert.equal(h.state().cleanups, 1); assert.equal(h.state().sharedReads, 0);
  });
  test(`real completed uploader then normalization cleanup handoff rolls back original object (${generation ? 'session' : 'account'})`, async () => {
    const h = harness('after-upload', false, true), pending = h.run();
    await h.entered; h.switch(generation); h.release(); await assert.rejects(pending);
    assert.deepEqual(h.requests.map(r => r.action), ['create_upload_url', 'put', 'verify_upload', 'delete_object']);
    for (const request of h.requests.filter(r => r.action !== 'put')) assert.equal(request.token, 'Bearer token-A-one');
    assert.equal(h.requests[3].objectKey, h.requests[0].objectKey);
    assert.match(h.requests[3].objectKey, /^A\/profile_post\/parent-A\//);
    assert.equal(h.writes.length, 0); assert.equal(h.state().sharedReads, 0);
  });
}
