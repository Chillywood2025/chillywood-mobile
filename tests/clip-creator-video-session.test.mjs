import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { deferred, loadStudioFunctions } from './helpers/studio-source-harness.mjs';

// Production creator-video orchestration, parser and RPC wrapper declarations
// run with synthetic auth, transport and thumbnail IO. No live requests.
const root = process.env.STUDIO_SOURCE_ROOT || process.cwd();
const first = { userId: 'owner', accountId: 'owner', sessionGeneration: 'first', state: 'ACTIVE', restoreOnly: false };
const { sameAccountSessionAuthority } = loadStudioFunctions('_lib/accountSessionAuthority.ts', ['sameAccountSessionAuthority'], {});
const text = value => String(value ?? '').trim();

function harness({ stage, failureStage, bound = true, metadataError = false, runtimeLimit = 5,
  recoverMetadata = false, metadataReadbackResult, metadataReadbackPatch, retainAttempt = false } = {}) {
  let authority = { ...first }, token = 'initiating-token', insertedPayload, generatedIds = 0;
  const state = { metadataError, recoverMetadata, metadataReadbackResult, metadataReadbackPatch, failureStage };
  const attempt = retainAttempt ? {} : undefined;
  const subject = { authority: { ...first }, accessToken: 'initiating-token' };
  const calls = [], rpcCalls = [], requests = [], storageInputs = [], authTokens = [], logs = [];
  const gate = deferred(), reached = deferred();
  const assertOperationCurrent = () => {
    if (!sameAccountSessionAuthority(first, authority)) throw new Error('Clip operation retired');
  };
  const operation = bound ? { assertOperationCurrent, accessToken: subject.accessToken, subject } : undefined;
  const boundary = async name => {
    calls.push(name);
    if (name === stage) { reached.resolve(); await gate.promise; }
    if (name === state.failureStage) throw new Error(`Synthetic ${name} failure`);
  };
  const rpc = async (captured, name, args) => {
    rpcCalls.push({ subject: captured, name, args });
    const stageName = name === 'record_video_original_rendition' ? 'rendition'
      : name === 'record_creator_video_upload_usage' ? 'usage' : 'fanout';
    await boundary(stageName);
    return { data: { video_id: 'video', status: 'recorded', usage_event_recorded: true,
      storage_event_recorded: true, visibility: 'draft' }, error: null };
  };
  const rpcContext = {
    toText: text,
    invokeAccountBoundSupabaseMutationRpc: (captured, name, args) => rpc(captured, name, args),
    runCurrentAccountBoundSupabaseMutationRpc: (name, args) => rpc(undefined, name, args),
  };
  const usage = loadStudioFunctions('_lib/platformUsage.ts', [
    'toUsageText', 'normalizeCreatorVideoUploadUsageResult', 'recordCreatorVideoUploadUsage',
  ], { ...rpcContext, RECORD_CREATOR_VIDEO_UPLOAD_USAGE_RPC: 'record_creator_video_upload_usage' }, root);
  const vod = loadStudioFunctions('_lib/vodQuality.ts', ['recordOriginalVideoRendition'], { ...rpcContext }, root);
  const supabase = {
    auth: { getUser: async accessToken => {
      authTokens.push(accessToken); await boundary('auth');
      return { data: { user: { id: 'owner' } }, error: null };
    } },
    from(table) {
      assert.equal(table, 'videos');
      let action = 'readback', payload, header;
      const filters = [];
      const request = {
        insert(value) { action = 'insert'; payload = value; insertedPayload = value; return request; },
        update(value) { action = 'update'; payload = value; return request; },
        select() { return request; }, eq(key, value) { filters.push([key, value]); return request; },
        returns() { return request; }, single() { return request; }, maybeSingle() { return request; },
        setHeader(name, value) { assert.equal(name, 'Authorization'); header = value; return request; },
        then(resolve, reject) {
          requests.push({ action, header, tokenAtDispatch: token, filters, payload });
          return boundary(action).then(() => {
            if (action === 'readback') return state.metadataReadbackResult ?? {
              data: state.recoverMetadata ? { ...insertedPayload, ...state.metadataReadbackPatch } : null, error: null,
            };
            return state.metadataError && action === 'insert' ? { data: null, error: new Error('Metadata failed') }
              : { data: { id: 'video', owner_id: 'owner', title: 'Title', visibility: 'draft', storage_provider: 's3', ...payload }, error: null };
          }).then(resolve, reject);
        },
      };
      return request;
    },
  };
  const context = {
    ...rpcContext, ...usage, ...vod, supabase, CREATOR_VIDEO_SELECT: '*', CREATOR_VIDEO_BUCKET: 'private',
    toText: text, createClientId: () => ++generatedIds === 1 ? 'video' : `video-new-${generatedIds}`, getFileExtension: file => file.name?.endsWith('.mov') ? 'mov' : 'mp4',
    DEFAULT_APP_CONFIG: { runtimeControls: { max_upload_size_mb: 5 } },
    readAppConfig: async () => { await boundary('config'); return { runtimeControls: { max_upload_size_mb: 5 } }; },
    getCreatorVideoUploadLimitBytes: () => 5 * 1024 * 1024,
    isCreatorVideoFileOverChannelMovieLimit: () => false, getCreatorVideoTooLargeMessage: () => 'Too large',
    logCreatorVideoUpload: (...args) => logs.push(args),
    uploadFileToMediaStorage: async input => {
      storageInputs.push(input); await boundary('storage');
      return { provider: 's3', bucket: 'private', objectKey: input.objectKey, sizeBytes: 100 };
    },
    deleteStoredMediaObject: async input => { storageInputs.push(input); await boundary('cleanup'); },
    normalizeMediaStorageProvider: value => value,
    getMediaStorageProviderBucket: () => 'private',
    createCreatorVideoThumbnailUrl: async () => { await boundary('parse'); return 'fixture:thumbnail'; },
  };
  const api = loadStudioFunctions('_lib/creatorVideos.ts', [
    'normalizeVisibility', 'normalizeModerationStatus', 'getRequiredUserId', 'parseCreatorVideo',
    'uploadCreatorVideo', 'updateCreatorVideoMetadata', 'syncCreatorVideoFeedItems',
  ], context, root);
  return {
    calls, rpcCalls, requests, storageInputs, authTokens, logs, subject, assertOperationCurrent, attempt,
    reached: reached.promise, release: gate.resolve,
    upload: (patch = {}) => api.uploadCreatorVideo({ file: { uri: 'fixture:video', name: 'video.mp4', mimeType: 'video/mp4', size: 100 },
      title: 'Title', visibility: 'draft', maxUploadSizeMb: runtimeLimit, attempt, ...operation, ...patch }),
    update: () => api.updateCreatorVideoMetadata('video', { title: 'Edited', visibility: 'draft' }, operation),
    replace(value = { ...first, sessionGeneration: 'replacement' }) { authority = value; token = 'replacement-token'; },
    refreshToken() { token = 'refreshed-token'; },
    setResponse(patch) { Object.assign(state, patch); },
    generatedIds: () => generatedIds,
  };
}

for (const stage of ['auth', 'config', 'storage', 'insert', 'rendition', 'parse', 'usage']) {
  test(`Clip creator upload stops downstream work after session replacement during ${stage}`, async () => {
    const h = harness({ stage, runtimeLimit: stage === 'config' ? null : 5 }), operation = h.upload();
    await h.reached;
    const before = [...h.calls]; h.replace(); h.release();
    await assert.rejects(operation, /retired/);
    assert.deepEqual(h.calls, before);
  });
}

for (const stage of ['update', 'fanout', 'parse']) {
  test(`Clip creator metadata update stops downstream work after session replacement during ${stage}`, async () => {
    const h = harness({ stage }), operation = h.update();
    await h.reached;
    const before = [...h.calls]; h.replace(); h.release();
    await assert.rejects(operation, /retired/);
    assert.deepEqual(h.calls, before);
  });
}

test('Retired Clip creator operations cannot begin IO', async () => {
  for (const name of ['upload', 'update']) {
    const h = harness(); h.replace();
    await assert.rejects(h[name](), /retired/);
    assert.deepEqual(h.calls, []);
  }
});

for (const replacement of [null, { ...first, userId: 'other', accountId: 'other' }, { ...first, restoreOnly: true }]) {
  test(`Clip creator upload rejects deferred auth for ${JSON.stringify(replacement)}`, async () => {
    const h = harness({ stage: 'auth' }), operation = h.upload();
    await h.reached; h.replace(replacement); h.release();
    await assert.rejects(operation, /retired/);
    assert.deepEqual(h.calls, ['auth']);
  });
}

test('Retired Clip metadata failure starts no storage cleanup', async () => {
  const h = harness({ stage: 'insert', metadataError: true }), operation = h.upload();
  await h.reached; h.replace(); h.release();
  await assert.rejects(operation, /retired/);
  assert.equal(h.calls.includes('cleanup'), false);
});

test('Current Clip metadata failure with unknown commit outcome preserves uploaded bytes', async () => {
  const h = harness({ metadataError: true });
  await assert.rejects(h.upload(), /Metadata failed/);
  assert.equal(h.calls.at(-1), 'readback');
  assert.equal(h.calls.includes('cleanup'), false);
  assert.equal(h.requests.at(-1).header, 'Bearer initiating-token');
  assert.deepEqual(h.requests.at(-1).filters, [['id', 'video'], ['owner_id', 'owner']]);
  assert.deepEqual(h.rpcCalls, []);
});

for (const [label, options] of [
  ['unavailable', { metadataReadbackResult: { data: null, error: new Error('Read unavailable') } }],
  ['malformed', { metadataReadbackResult: { data: {}, error: null } }],
  ['wrong id', { metadataReadbackPatch: { id: 'other' } }],
  ['wrong owner', { metadataReadbackPatch: { owner_id: 'other' } }],
  ['wrong provider', { metadataReadbackPatch: { storage_provider: 'cloudflare_r2' } }],
  ['wrong bucket', { metadataReadbackPatch: { storage_bucket: 'other' } }],
  ['wrong object', { metadataReadbackPatch: { storage_object_key: 'owner/video/other.mp4' } }],
]) {
  test(`Ambiguous Clip insert preserves bytes for ${label} readback`, async () => {
    const h = harness({ metadataError: true, recoverMetadata: true, ...options });
    await assert.rejects(h.upload(), /Metadata failed/);
    assert.equal(h.calls.at(-1), 'readback');
    assert.equal(h.calls.includes('cleanup'), false);
    assert.deepEqual(h.rpcCalls, []);
  });
}

test('Ambiguous Clip insert recovers only an exact owned object before continuing', async () => {
  const h = harness({ metadataError: true, recoverMetadata: true });
  const video = await h.upload();
  assert.equal(video.id, 'video');
  assert.deepEqual(h.calls, ['auth', 'storage', 'insert', 'readback', 'rendition', 'parse', 'usage']);
  assert.equal(h.calls.includes('cleanup'), false);
  assert.equal(h.requests.at(-1).header, 'Bearer initiating-token');
  for (const call of h.rpcCalls) assert.equal(call.subject, h.subject);
});

test('Clip insert readback cannot resume after session replacement even when it confirms commit', async () => {
  const h = harness({ stage: 'readback', metadataError: true, recoverMetadata: true }), operation = h.upload();
  await h.reached;
  const before = [...h.calls]; h.replace(); h.release();
  await assert.rejects(operation, /retired/);
  assert.deepEqual(h.calls, before);
});

for (const failureStage of ['insert', 'readback']) {
  test(`Thrown Clip ${failureStage} preserves bytes and never retries the insert`, async () => {
    const h = harness({ failureStage, metadataError: failureStage === 'readback' });
    await assert.rejects(h.upload(), /Synthetic/);
    assert.equal(h.calls.includes('cleanup'), false);
    assert.equal(h.calls.filter(name => name === 'insert').length, 1);
    assert.deepEqual(h.rpcCalls, []);
  });
}

test('Retained Clip attempt reuses an acknowledged object when unknown insert later confirms committed', async () => {
  const h = harness({ metadataError: true, retainAttempt: true });
  await assert.rejects(h.upload(), /Metadata failed/);
  const identity = JSON.parse(JSON.stringify(h.attempt));
  assert.deepEqual(Object.keys(identity).sort(), ['id', 'ownerId', 'uploadedObject']);
  assert.equal(identity.id, 'video'); assert.equal(identity.ownerId, 'owner');
  assert.equal(identity.uploadedObject.objectKey, 'owner/video/source.mp4');
  assert.equal(JSON.stringify(identity).includes('token'), false);
  h.setResponse({ recoverMetadata: true }); h.refreshToken();
  const saved = await h.upload();
  assert.equal(saved.id, 'video');
  assert.deepEqual(JSON.parse(JSON.stringify(h.attempt)), identity);
  assert.equal(h.generatedIds(), 1);
  assert.equal(h.calls.filter(name => name === 'storage').length, 1);
  assert.equal(h.calls.filter(name => name === 'insert').length, 1);
});

test('Retained Clip attempt retries only the same id and object after confirmed absent readback', async () => {
  const h = harness({ metadataError: true, retainAttempt: true });
  await assert.rejects(h.upload(), /Metadata failed/);
  h.setResponse({ metadataError: false });
  const before = h.calls.length;
  const saved = await h.upload();
  assert.equal(saved.id, 'video');
  assert.deepEqual(h.calls.slice(before), ['auth', 'readback', 'insert', 'rendition', 'parse', 'usage']);
  assert.equal(h.calls.filter(name => name === 'storage').length, 1);
  const inserts = h.requests.filter(request => request.action === 'insert');
  assert.equal(inserts.length, 2);
  assert.equal(inserts[1].payload.id, inserts[0].payload.id);
  assert.equal(inserts[1].payload.storage_object_key, inserts[0].payload.storage_object_key);
  assert.equal(h.generatedIds(), 1);
});

for (const [label, readback] of [
  ['unavailable', { data: null, error: new Error('Read unavailable') }],
  ['missing result', { data: undefined, error: null }],
  ['malformed row', { data: {}, error: null }],
]) {
  test(`Retained Clip attempt with ${label} outcome starts no replacement upload or insert`, async () => {
    const h = harness({ metadataError: true, retainAttempt: true });
    await assert.rejects(h.upload(), /Metadata failed/);
    h.setResponse({ metadataReadbackResult: readback });
    const before = h.calls.length;
    await assert.rejects(h.upload(), /could not be confirmed/);
    assert.deepEqual(h.calls.slice(before), ['auth', 'readback']);
    assert.equal(h.calls.filter(name => name === 'storage').length, 1);
    assert.equal(h.calls.filter(name => name === 'insert').length, 1);
    assert.equal(h.generatedIds(), 1);
  });
}

test('Retained Clip attempt applies current explicit retry edits only after confirming the owned object', async () => {
  const h = harness({ metadataError: true, retainAttempt: true });
  await assert.rejects(h.upload(), /Metadata failed/);
  h.setResponse({ recoverMetadata: true });
  const before = h.calls.length;
  const saved = await h.upload({ title: 'Current title', description: 'Current description', visibility: 'public' });
  assert.equal(saved.title, 'Current title'); assert.equal(saved.description, 'Current description');
  assert.equal(saved.visibility, 'public');
  assert.deepEqual(h.calls.slice(before), ['auth', 'readback', 'rendition', 'update', 'fanout', 'parse', 'usage']);
  const update = h.requests.find(request => request.action === 'update');
  assert.equal(update.payload.title, 'Current title'); assert.equal(update.payload.description, 'Current description');
  assert.equal(update.payload.visibility, 'public'); assert.equal(update.header, 'Bearer initiating-token');
  for (const call of h.rpcCalls) assert.equal(call.subject, h.subject);
  assert.equal(h.calls.filter(name => name === 'storage').length, 1);
  assert.equal(h.calls.filter(name => name === 'insert').length, 1);
});

for (const patch of [{ owner_id: 'other' }, { storage_object_key: 'owner/video/other.mp4' }]) {
  test(`Retained Clip attempt never overwrites a confirmed different identity ${JSON.stringify(patch)}`, async () => {
    const h = harness({ metadataError: true, retainAttempt: true });
    await assert.rejects(h.upload(), /Metadata failed/);
    h.setResponse({ recoverMetadata: true, metadataReadbackPatch: patch });
    const before = h.calls.length;
    await assert.rejects(h.upload({ title: 'Current title', visibility: 'public' }), /could not be confirmed/);
    assert.deepEqual(h.calls.slice(before), ['auth', 'readback']);
    assert.equal(h.calls.includes('update'), false);
    assert.equal(h.calls.filter(name => name === 'storage').length, 1);
    assert.equal(h.calls.filter(name => name === 'insert').length, 1);
  });
}

test('Retained Clip attempt rejects changed source identity and initiating owner before remote work', async () => {
  const h = harness({ metadataError: true, retainAttempt: true });
  await assert.rejects(h.upload(), /Metadata failed/);
  let before = h.calls.length;
  await assert.rejects(h.upload({ file: { uri: 'fixture:other', name: 'other.mov', mimeType: 'video/quicktime', size: 100 } }), /source changed/);
  assert.deepEqual(h.calls.slice(before), ['auth']);
  h.attempt.ownerId = 'other'; before = h.calls.length;
  await assert.rejects(h.upload(), /account changed/);
  assert.deepEqual(h.calls.slice(before), ['auth']);
});

test('Retained Clip attempt retries failed storage with a new immutable key before any metadata insert', async () => {
  const h = harness({ failureStage: 'storage', retainAttempt: true });
  await assert.rejects(h.upload(), /Synthetic storage failure/);
  assert.equal(h.attempt.id, undefined); assert.equal(h.attempt.ownerId, undefined);
  assert.equal(h.attempt.uploadedObject, undefined);
  assert.equal(h.calls.includes('insert'), false);
  const originalKey = h.storageInputs[0].objectKey;
  h.setResponse({ failureStage: undefined });
  const saved = await h.upload();
  assert.equal(saved.id, 'video-new-2');
  assert.equal(h.storageInputs.length, 2);
  assert.notEqual(h.storageInputs[1].objectKey, originalKey);
  assert.equal(h.attempt.uploadedObject.objectKey, h.storageInputs[1].objectKey);
  assert.equal(h.calls.filter(name => name === 'insert').length, 1);
});

for (const [name, stage] of [['upload', 'rendition'], ['upload', 'usage'], ['update', 'fanout']]) {
  test(`Retired ${name} cannot recover after best-effort ${stage} failure`, async () => {
    const h = harness({ stage, failureStage: stage }), operation = h[name]();
    await h.reached;
    const before = [...h.calls]; h.replace(); h.release();
    await assert.rejects(operation, /retired/);
    assert.deepEqual(h.calls, before);
  });
}

test('Clip creator happy paths preserve exact captured RPC subject and initiating token through refresh', async () => {
  for (const [name, stage] of [['upload', 'storage'], ['update', 'update']]) {
    const h = harness({ stage }), operation = h[name]();
    await h.reached; h.refreshToken(); h.release();
    const saved = await operation;
    assert.equal(saved.id, 'video');
    assert.equal(saved.title, name === 'upload' ? 'Title' : 'Edited');
    assert.deepEqual(h.calls, name === 'upload'
      ? ['auth', 'storage', 'insert', 'rendition', 'parse', 'usage'] : ['update', 'fanout', 'parse']);
    if (name === 'upload') assert.deepEqual(h.authTokens, ['initiating-token']);
    for (const request of h.requests) assert.equal(request.header, 'Bearer initiating-token');
    for (const input of h.storageInputs) {
      assert.equal(input.accessToken, 'initiating-token');
      assert.equal(input.assertOperationCurrent, h.assertOperationCurrent);
    }
    assert.deepEqual(h.rpcCalls.map(call => call.name), name === 'upload'
      ? ['record_video_original_rendition', 'record_creator_video_upload_usage'] : ['sync_creator_video_feed_items']);
    for (const call of h.rpcCalls) assert.equal(call.subject, h.subject);
    assert.deepEqual(h.rpcCalls.map(call => JSON.parse(JSON.stringify(call.args))), name === 'upload'
      ? [{ p_video_id: 'video' }, { target_video_id: 'video' }] : [{ p_video_id: 'video' }]);
  }
});

test('Non-Clip callers retain default current-account RPC and unpinned transport behavior', async () => {
  for (const name of ['upload', 'update']) {
    const h = harness({ bound: false });
    const saved = await h[name]();
    assert.equal(saved.id, 'video');
    for (const call of h.rpcCalls) assert.equal(call.subject, undefined);
    for (const request of h.requests) assert.equal(request.header, undefined);
    for (const input of h.storageInputs) {
      assert.equal(input.accessToken, undefined); assert.equal(input.assertOperationCurrent, undefined);
    }
  }
});

for (const name of ['uploadCreatorVideo', 'updateCreatorVideoMetadata']) {
  test(`Clip ${name} pins the real Supabase SDK token across delayed request auth`, async () => {
    let current = true, authReads = 0;
    const started = deferred(), release = deferred(), requests = [], downstream = [];
    const client = createClient('https://ci.invalid', 'ci-placeholder-not-a-secret', {
      accessToken: async () => {
        if (++authReads === 1) return 'setup-fixture-token';
        started.resolve(); await release.promise; return 'replacement-fixture-token';
      },
      global: { fetch: async (url, options) => {
        requests.push({ url: String(url), authorization: new Headers(options.headers).get('Authorization') });
        return new Response(JSON.stringify({ id: 'video', owner_id: 'owner', title: 'Title' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } },
    });
    const context = {
      toText: text, normalizeVisibility: value => value, createClientId: () => 'video', getFileExtension: () => 'mp4',
      getRequiredUserId: async () => 'owner', getCreatorVideoUploadLimitBytes: () => 1000,
      isCreatorVideoFileOverChannelMovieLimit: () => false, getCreatorVideoTooLargeMessage: () => 'Too large',
      logCreatorVideoUpload() {}, CREATOR_VIDEO_SELECT: '*',
      uploadFileToMediaStorage: async () => ({ provider: 's3', bucket: 'private', objectKey: 'owner/video/source.mp4', sizeBytes: 100 }),
      supabase: { from: client.from.bind(client) },
      syncCreatorVideoFeedItems: async () => downstream.push('fanout'),
      recordOriginalVideoRendition: async () => downstream.push('rendition'),
      parseCreatorVideo: async row => row,
    };
    const api = loadStudioFunctions('_lib/creatorVideos.ts', [name], context, root);
    const operation = { accessToken: 'initiating-fixture-token', assertOperationCurrent: () => { if (!current) throw new Error('retired'); } };
    const pending = name === 'uploadCreatorVideo'
      ? api[name]({ file: { uri: 'fixture:video', size: 100 }, title: 'Title', visibility: 'draft', maxUploadSizeMb: 5, ...operation })
      : api[name]('video', { title: 'Title' }, operation);
    await started.promise; current = false; release.resolve();
    await assert.rejects(pending, /retired/);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/rest\/v1\/videos/);
    assert.equal(requests[0].authorization, 'Bearer initiating-fixture-token');
    assert.deepEqual(downstream, []);
  });
}
