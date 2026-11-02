import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const initial = { userId: userA, accountId: userA, sessionGeneration: 'one', state: 'ACTIVE', restoreOnly: false };
const file = { uri: 'file:///fixture.pdf', name: 'fixture.pdf', mimeType: 'application/pdf', size: 10 };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// Execute production services, attachment orchestration, exact-session capture
// and authority comparisons. Only Auth/PostgREST and native media I/O are fake.
function harness(surface, { stage, attachmentFailure, wrongParent, wrongAttachment, legacy = false } = {}) {
  const entered = deferred(), held = deferred();
  const state = { scope: true, writes: [], deletes: [], uploads: [], objectDeletes: [], authReads: 0, cleanups: 0 };
  const pause = async at => { if (at === stage) { entered.resolve(); await held.promise; } };
  const parentTable = surface === 'chat' ? 'chat_messages' : surface === 'comment' ? 'creator_video_comments' : 'watch_party_room_messages';
  const client = token => ({
    from(table) {
      let payload, action = 'read'; const filters = {};
      const execute = async () => {
        if (action === 'delete') { state.deletes.push({ table, token, filters }); return { data: null, error: null }; }
        if (action === 'insert') {
          state.writes.push({ table, token, payload });
          await pause(table === 'social_attachments' ? 'attachment-insert' : 'parent-insert');
          if (table === 'social_attachments' && attachmentFailure) return { data: null, error: { code: attachmentFailure === 'rejected' ? '42501' : '' } };
          const row = { id: `${table}-id`, ...payload };
          if (table === 'social_attachments' && wrongAttachment) {
            row[wrongAttachment === 'owner' ? 'owner_user_id' : 'surface_id'] = 'replacement-target';
          }
          if (table === parentTable && wrongParent) {
            if (wrongParent === 'owner') row[surface === 'chat' ? 'sender_user_id' : 'user_id'] = userB;
            else row[surface === 'chat' ? 'thread_id' : surface === 'comment' ? 'video_id' : 'party_id'] = 'replacement-target';
          }
          return { data: row, error: null };
        }
        if (table === 'chat_thread_activity') {
          await pause('thread-read');
          return { data: { id: 'thread-A', participant_pair_key: `${userA}::${userB}`, created_by: userA,
            members: [{ thread_id: 'thread-A', user_id: userA }, { thread_id: 'thread-A', user_id: userB }] }, error: null };
        }
        if (table === 'user_profiles') { await pause('author-read'); return { data: [{ user_id: userA, display_name: 'A' }], error: null }; }
        throw new Error(`unexpected read ${table}`);
      };
      const query = { select: () => query, returns: () => query, in: () => query,
        insert: value => { payload = value; action = 'insert'; return query; },
        delete: () => { action = 'delete'; return query; },
        eq: (key, value) => { filters[key] = value; return query; },
        single: execute, maybeSingle: execute, then: (yes, no) => execute().then(yes, no) };
      return query;
    },
  });
  const bootstrap = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture', supabase: client('shared') };
  const authority = loadStubbed('_lib/accountSessionAuthority.ts', { './supabase': bootstrap });
  authority.publishAccountSessionAuthoritySnapshot(initial);
  const subject = { accessToken: 'token-A-one', authority: { ...initial } };
  bootstrap.supabase.auth = { getSession: async () => {
    state.authReads++;
    const current = authority.getCurrentAccountSessionAuthoritySnapshot();
    await pause('capture');
    return { data: { session: { user: { id: current.userId }, access_token: `token-${current.userId === userA ? 'A' : 'B'}-${current.sessionGeneration}` } } };
  } };
  const mutation = loadStubbed('_lib/accountBoundSupabaseMutation.ts', {
    './accountSessionAuthority': authority, './supabase': bootstrap,
    './entitlementAuthority': { withAuthorityReadDeadline: async operation => await operation },
    'react-native': { Platform: { OS: 'ios' } },
    './accountBoundSupabaseRpc.mjs': { invokeAccountBoundSupabaseRpc: async () => {
      await pause('readback'); return { data: { authoritative: true, ...authority.getCurrentAccountSessionAuthoritySnapshot() }, error: null };
    } },
  });
  const errors = loadStubbed('_lib/userFacingErrors.ts');
  const deps = { './supabase': bootstrap, './accountSessionAuthority': authority,
    './accountBoundSupabaseMutation': mutation, './userFacingErrors': errors,
    '@supabase/supabase-js': { createClient: (_url, _key, options) => client(options.global.headers.Authorization) } };
  const attachments = loadStubbed('_lib/socialAttachments.ts', {
    ...deps,
    './imageUploadNormalization': { normalizeImageUploadFile: async value => {
      await pause('normalize'); return { file: value, cleanup: async () => { state.cleanups++; await pause('cleanup'); } };
    } },
    './mediaStorage': {
      uploadFileToMediaStorage: async input => {
        input.assertOperationCurrent(); state.uploads.push(input); await pause('upload');
        return { provider: 's3', bucket: 'fixture', objectKey: input.objectKey, sizeBytes: 10 };
      },
      deleteStoredMediaObject: async input => { state.objectDeletes.push(input); },
      normalizeMediaStorageProvider: value => value, getMediaStorageProviderBucket: input => input.bucket,
      usesPrivateOriginMediaGateway: () => true,
      createSignedMediaDownload: () => { throw new Error('mutation must not sign with a shared replacement session'); },
    },
  });
  deps['./socialAttachments'] = attachments;
  const serviceFile = surface === 'chat' ? '_lib/chat.ts' : surface === 'comment' ? '_lib/creatorVideoComments.ts' : '_lib/watchParty.ts';
  const api = loadStubbed(`${process.env.ATTACHMENT_MUTATION_SERVICE_ROOT ?? '.'}/${serviceFile}`, deps);
  const options = { ...(legacy ? {} : { mutationSubject: subject }), isCurrent: () => state.scope };
  const run = () => surface === 'chat'
    ? api.sendChatMessage('thread-A', 'draft', file, options)
    : surface === 'comment'
      ? api.createCreatorVideoComment({ videoId: 'video-A', body: 'draft', attachmentFile: file, ...options })
      : api.sendPartyMessageRecord('party-a', userA, 'chat', 'draft', { username: 'A', ...options });
  return { state, subject, api, errors, run, isParentSaved: attachments.isAttachmentParentSavedError, entered: entered.promise, release: held.resolve,
    retire(kind) {
      if (kind === 'scope') state.scope = false;
      else authority.publishAccountSessionAuthoritySnapshot(kind === 'session' ? { ...initial, sessionGeneration: 'two' }
        : { ...initial, userId: userB, accountId: userB });
    },
    async noResult(pending) {
      if (surface === 'party') assert.equal(await pending, null);
      else await assert.rejects(pending);
    },
  };
}

test('saved-parent outcome requires the app-owned error class and exact typed discriminant', () => {
  const h = harness('chat');
  assert.equal(h.isParentSaved({ name: 'UserFacingError', code: 'attachment_parent_saved', message: 'provider payload' }), false);
  assert.equal(h.isParentSaved(Object.assign(new Error('provider payload'), { code: 'attachment_parent_saved' })), false);
  assert.equal(h.isParentSaved(new h.errors.UserFacingError('attachment_action', 'Unable to save this attachment.')), false);
  const receipt = new h.errors.UserFacingError('attachment_parent_saved', 'Your comment was saved. Refresh before retrying.');
  assert.equal(h.isParentSaved(receipt), true);
  assert.equal(h.errors.getUserFacingErrorMessage(receipt, 'fallback'), receipt.message);
});

for (const surface of ['comment', 'chat', 'party']) {
  test(`${surface}: original subject binds successful writes and pending-scan attachment`, async () => {
    const h = harness(surface), result = await h.run(); assert.ok(result);
    assert.equal(h.state.authReads, 0, 'caller subject must not be recaptured');
    assert.ok(h.state.writes.every(write => write.token === 'Bearer token-A-one'));
    if (surface !== 'party') { assert.equal(result.attachments[0].scanStatus, 'pending_scan'); assert.equal(result.attachments[0].signedUrl, ''); }
  });
  test(`${surface}: legacy call captures once at entry and freezes all writes`, async () => {
    const h = harness(surface, { legacy: true }); assert.ok(await h.run());
    assert.equal(h.state.authReads, 1); assert.ok(h.state.writes.every(write => write.token === 'Bearer token-A-one'));
  });
  for (const kind of ['account', 'session', 'scope']) {
    test(`${surface}: stale ${kind} subject never starts a parent mutation`, async () => {
      const h = harness(surface); h.retire(kind); await h.noResult(h.run());
      assert.equal(h.state.writes.length, 0); assert.equal(h.state.authReads, 0);
    });
    test(`${surface}: held parent insert cannot acknowledge replacement ${kind}`, async () => {
      const h = harness(surface, { stage: 'parent-insert' }); const pending = h.run();
      await h.entered; h.retire(kind); h.release(); await h.noResult(pending);
      assert.equal(h.state.writes.length, 1); assert.equal(h.state.writes[0].token, 'Bearer token-A-one');
      assert.equal(h.state.uploads.length, 0);
    });
    if (surface !== 'party') for (const stage of [surface === 'chat' ? 'thread-read' : 'author-read', 'normalize', 'upload', 'attachment-insert']) {
      test(`${surface}: ${stage} held across ${kind} replacement cannot leak an artifact`, async () => {
        const h = harness(surface, { stage }); const pending = h.run();
        await h.entered; h.retire(kind); h.release(); await h.noResult(pending);
        assert.ok(h.state.writes.every(write => write.token === 'Bearer token-A-one'));
        assert.ok(h.state.deletes.every(value => value.token === 'Bearer token-A-one'));
        assert.ok(h.state.objectDeletes.every(value => value.accessToken === 'token-A-one'));
        if (stage === 'thread-read') assert.equal(h.state.writes.length, 0);
        if (stage === 'author-read' || stage === 'normalize') assert.equal(h.state.uploads.length, 0);
        if (stage === 'upload') { assert.equal(h.state.writes.length, 1); assert.equal(h.state.objectDeletes.length, 1); }
        if (stage === 'attachment-insert') { assert.equal(h.state.deletes.length, 0, 'committed attachment keeps parent'); assert.equal(h.state.objectDeletes.length, 0); }
      });
    }
  }
  for (const wrongParent of ['owner', 'target']) test(`${surface}: wrong returned parent ${wrongParent} is not attached or acknowledged`, async () => {
    const h = harness(surface, { wrongParent }); await h.noResult(h.run()); assert.equal(h.state.uploads.length, 0);
  });
  for (const stage of ['capture', 'readback']) test(`${surface}: legacy ${stage} cannot adopt a new session`, async () => {
    const h = harness(surface, { legacy: true, stage }); const pending = h.run();
    await h.entered; h.retire('session'); h.release(); await h.noResult(pending); assert.equal(h.state.writes.length, 0);
  });
}
for (const surface of ['comment', 'chat']) {
  for (const wrongAttachment of ['owner', 'target']) test(`${surface}: mismatched attachment ${wrongAttachment} is never acknowledged or destructively compensated`, async () => {
    const h = harness(surface, { wrongAttachment }); await h.noResult(h.run());
    assert.equal(h.state.deletes.length, 0); assert.equal(h.state.objectDeletes.length, 0);
  });
  test(`${surface}: definitive child rejection cleans up only original parent/token`, async () => {
    const h = harness(surface, { stage: 'attachment-insert', attachmentFailure: 'rejected' }); const pending = h.run();
    await h.entered; h.retire('account'); h.release(); await h.noResult(pending);
    assert.equal(h.state.deletes.length, 1); assert.equal(h.state.deletes[0].token, 'Bearer token-A-one');
    assert.equal(h.state.objectDeletes[0].accessToken, 'token-A-one');
    assert.equal(h.state.deletes[0].filters[surface === 'chat' ? 'sender_user_id' : 'user_id'], userA);
  });
  test(`${surface}: uncertain child result retains parent/object for reconciliation`, async () => {
    const h = harness(surface, { attachmentFailure: 'unknown' }); await assert.rejects(h.run(), h.isParentSaved);
    assert.equal(h.state.deletes.length, 0); assert.equal(h.state.objectDeletes.length, 0);
  });
}
test('party cleanup after replacement keeps the initiating token and owner filter', async () => {
  const h = harness('party'); const saved = await h.run(); h.retire('account');
  await h.api.deletePartyMessage(saved.id, { mutationSubject: h.subject });
  assert.equal(h.state.deletes[0].token, 'Bearer token-A-one'); assert.equal(h.state.deletes[0].filters.user_id, userA);
  assert.equal(h.state.authReads, 0);
});
