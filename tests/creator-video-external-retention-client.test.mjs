import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStudioFunctions } from './helpers/studio-source-harness.mjs';
import { createClient } from '@supabase/supabase-js';

// Execute the actual client deletion function. IO/session boundaries are
// synthetic: this is not installed-client, provider or live retention proof.
const video = { id: '11111111-1111-4111-8111-111111111111', createdAt: '2026-10-23T00:00:00Z',
  storageProvider: 'supabase', storageBucket: 'creator-videos', storageObjectKey: '', storagePath: '', thumbStoragePath: '' };
function fixture({ response = { data: { status: 'deleted', retentionHandled: true }, error: null },
  captureError, rpcError, checkErrorAt, onCapture, onRpc, legacy = { data: [{ id: video.id }], error: null } } = {}) {
  const calls = [], subject = { accessToken: 'synthetic-only', authority: { userId: 'synthetic-owner' } };
  let checks = 0;
  const builder = { then(resolve, reject) { return Promise.resolve(legacy).then(resolve, reject); } };
  for (const name of ['delete', 'eq', 'is', 'select', 'setHeader']) {
    builder[name] = (...args) => { calls.push([name, ...args]); return builder; };
  }
  const { deleteCreatorVideo } = loadStudioFunctions('_lib/creatorVideos.ts', ['deleteCreatorVideo'], {
    toText: value => String(value ?? '').trim(), normalizeMediaStorageProvider: value => value,
    usesPrivateOriginMediaGateway: value => ['s3', 'cloudflare_r2'].includes(value),
    captureAccountBoundSupabaseMutationSubject: async () => { calls.push(['capture']); if (captureError) throw captureError; await onCapture?.(); return subject; },
    invokeAccountBoundSupabaseMutationRpc: async (...args) => { calls.push(['rpc', ...args]); if (rpcError) throw rpcError; await onRpc?.(); return response; },
    assertAccountBoundSupabaseMutationSubjectCurrent: received => {
      assert.equal(received, subject); calls.push(['current']); if (++checks === checkErrorAt) throw Error('account_changed');
    },
    deleteRetainedMediaContent: async () => { calls.push(['gateway']); return true; },
    deleteStoredMediaObject: async () => { throw Error('unexpected_provider_delete'); },
    supabase: { from: table => { calls.push(['from', table]); return builder; },
      storage: { from: () => { throw Error('unexpected_storage_delete'); } } },
  });
  return { calls, subject, run: (source = video) => deleteCreatorVideo(source) };
}
for (const status of ['deleted', 'already_deleted']) test(`${status} ends exact no-key deletion without provider or legacy DELETE`, async () => {
  const f = fixture({ response: { data: { status, retentionHandled: true }, error: null } }); await f.run();
  assert.deepEqual(f.calls.map(x => x[0]), ['capture', 'rpc']);
  const [, subject, name, args] = f.calls[1]; assert.equal(subject, f.subject); assert.equal(name, 'delete_retained_content');
  assert.deepEqual(JSON.parse(JSON.stringify(args)), { p_type: 'creator_video', p_target: video.id, p_provider: 'supabase',
    p_bucket: 'creator-videos', p_object_key: null, p_source_created_at: video.createdAt });
});
for (const response of [null, {}, { data: null }, { data: [] }, { error: { code: '42501' } },
  { data: { status: 'unsupported', retentionHandled: false } }, { data: { status: 'deleted', retentionHandled: false } },
  { data: { status: 'disabled', retentionHandled: true } }, { data: { status: 'deleted', retentionHandled: 'true' } }]) {
  test(`unconfirmed response never falls back: ${JSON.stringify(response)}`, async () => {
    const f = fixture({ response }); await assert.rejects(f.run()); assert.equal(f.calls.some(x => x[0] === 'from'), false);
  });
}
for (const error of ['network', 'timeout', 'account_changed', 'invalid_action']) test(`${error} never authorizes legacy delete`, async () => {
  const f = fixture({ rpcError: Error(error) }); await assert.rejects(f.run()); assert.equal(f.calls.some(x => x[0] === 'from'), false);
});
test('missing session prevents RPC and deletion', async () => {
  const f = fixture({ captureError: Error('account_changed') }); await assert.rejects(f.run()); assert.deepEqual(f.calls, [['capture']]);
});
const disabled = { data: { status: 'disabled', retentionHandled: false }, error: null };
test('only explicit disabled permits exact frozen-session no-owned-locator legacy deletion', async () => {
  const f = fixture({ response: disabled }); await f.run();
  assert.ok(f.calls.some(x => x[0] === 'setHeader' && x[1] === 'Authorization' && x[2] === 'Bearer synthetic-only'));
  for (const [key, value] of [['id', video.id], ['owner_id', 'synthetic-owner'], ['created_at', video.createdAt]]) {
    assert.ok(f.calls.some(x => x[0] === 'eq' && x[1] === key && x[2] === value));
  }
  for (const key of ['storage_object_key', 'storage_path', 'thumb_storage_path']) assert.ok(f.calls.some(x => x[0] === 'is' && x[1] === key && x[2] === null));
  assert.equal(f.calls.filter(x => x[0] === 'current').length, 2);
});
for (const legacy of [{ data: [], error: null }, { data: [{ id: 'other' }], error: null }, { data: null, error: null },
  { data: [{ id: video.id }], error: { code: '55000' } }]) test('failed or stale disabled-path delete is never acknowledged', async () => {
  await assert.rejects(fixture({ response: disabled, legacy }).run());
});
for (const checkErrorAt of [1, 2]) test(`account switch at legacy boundary ${checkErrorAt} fails closed`, async () => {
  const f = fixture({ response: disabled, checkErrorAt }); await assert.rejects(f.run(), /account_changed/);
  if (checkErrorAt === 1) assert.equal(f.calls.some(x => x[0] === 'from'), false);
});
test('unknown incarnation never requests deletion', async () => {
  const f = fixture(); await assert.rejects(f.run({ ...video, createdAt: '' })); assert.equal(f.calls.length, 0);
});
test('existing private original remains on its original gateway path', async () => {
  const f = fixture(); await f.run({ ...video, storageProvider: 'cloudflare_r2', storageObjectKey: 'synthetic/original.mp4' });
  assert.deepEqual(f.calls, [['gateway']]);
});
for (const boundary of ['onCapture', 'onRpc']) test(`source identity stays frozen across ${boundary}`, async () => {
  const source = { ...video };
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture({ response: disabled, [boundary]: () => pending });
  const deletion = f.run(source);
  // Let the actual function reach the asynchronous boundary before replacing
  // the caller-owned object's incarnation and provider metadata in place.
  await Promise.resolve(); await Promise.resolve();
  source.createdAt = '2026-10-24T00:00:00Z'; source.storageBucket = 'replacement-bucket';
  release(); await deletion;
  const args = f.calls.find(x => x[0] === 'rpc')[3];
  assert.equal(args.p_source_created_at, video.createdAt); assert.equal(args.p_bucket, video.storageBucket);
  assert.ok(f.calls.some(x => x[0] === 'eq' && x[1] === 'created_at' && x[2] === video.createdAt));
});

test('pinned SDK sends disabled legacy DELETE with frozen token and exact filters', async () => {
  const requests = [];
  const client = createClient('https://synthetic.invalid', 'synthetic-anon', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      requests.push({ url: new URL(url), method: init.method, headers: new Headers(init.headers) });
      return new Response(JSON.stringify([{ id: video.id }]), { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  const subject = { accessToken: 'synthetic-frozen-session', authority: { userId: 'synthetic-owner' } };
  const { deleteCreatorVideo } = loadStudioFunctions('_lib/creatorVideos.ts', ['deleteCreatorVideo'], {
    toText: value => String(value ?? '').trim(), normalizeMediaStorageProvider: value => value,
    captureAccountBoundSupabaseMutationSubject: async () => subject,
    invokeAccountBoundSupabaseMutationRpc: async () => disabled,
    assertAccountBoundSupabaseMutationSubjectCurrent: received => assert.equal(received, subject),
    supabase: client,
  });
  await deleteCreatorVideo(video);
  assert.equal(requests.length, 1);
  const request = requests[0]; assert.equal(request.method, 'DELETE');
  assert.equal(request.headers.get('authorization'), 'Bearer synthetic-frozen-session');
  assert.equal(request.url.searchParams.get('id'), `eq.${video.id}`);
  assert.equal(request.url.searchParams.get('owner_id'), 'eq.synthetic-owner');
  assert.equal(request.url.searchParams.get('created_at'), `eq.${video.createdAt}`);
  for (const key of ['storage_object_key', 'storage_path', 'thumb_storage_path']) assert.equal(request.url.searchParams.get(key), 'is.null');
});
