import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';

const owner = (userId = 'user-A', generation = 'one') => ({ userId, accountId: userId, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' }, status: 200 });
const publicInput = { reporterName: 'Reporter', reporterEmail: 'reporter@example.invalid', copyrightOwnerName: 'Owner',
  copyrightedWorkDescription: 'Original work', infringingMaterialDescription: 'Material', contentUrl: 'https://example.invalid/content',
  goodFaithStatement: true, accuracyPenaltyPerjuryStatement: true, electronicSignature: 'Reporter', reporterIsOwner: true };
const counterInput = { caseId: 'case-A', submitterName: 'A', submitterEmail: 'a@example.invalid', removedMaterialDescription: 'Material',
  removedMaterialUrlOrLocation: 'https://example.invalid/content', goodFaithMistakeStatement: true,
  jurisdictionConsentStatement: true, serviceAcceptanceStatement: true, electronicSignature: 'A' };

// Real production service, authority and capture code use real Supabase SDK
// Storage/PostgREST requests over a fixture-only fetch. No network/provider IO.
function harness(mode = 'guest', stage, mismatch) {
  const entered = deferred(), held = deferred(), listeners = new Set();
  const state = { scope: true, requests: [], authReads: 0, observers: 0, subject: null };
  let session = mode === 'guest' ? null : { access_token: `token-${mode}-one`, user: { id: mode === 'anonymous' ? 'anonymous-A' : 'user-A', is_anonymous: mode === 'anonymous' } };
  const initialToken = session?.access_token ?? 'anon-fixture-key';
  const initialUser = session?.user.id ?? null;
  const pause = async at => { if (at === stage) { entered.resolve(); await held.promise; } };
  const auth = { onAuthStateChange(callback) { state.observers++; listeners.add(callback); return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } }; },
    async getSession() { state.authReads++; const saved = session; await pause('capture'); return { data: { session: saved }, error: null }; } };
  const bootstrap = { SUPABASE_URL: 'https://dmca-fixture.invalid', SUPABASE_ANON_KEY: 'anon-fixture-key', supabase: { auth } };
  const authority = loadStubbed('_lib/accountSessionAuthority.ts', { './supabase': bootstrap });
  if (mode === 'signed') authority.publishAccountSessionAuthoritySnapshot(owner());
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input)), token = new Headers(init.headers).get('Authorization');
    assert.equal(url.origin, 'https://dmca-fixture.invalid', 'fixture transport only');
    const action = url.pathname.includes('/storage/v1/object/') ? 'upload'
      : url.pathname.endsWith('/submit_dmca_notice') ? 'notice' : 'metadata';
    assert.ok(action !== 'metadata' || url.pathname.endsWith('/submit_dmca_attachment_metadata'));
    const body = action === 'upload' ? null : JSON.parse(init.body);
    state.requests.push({ action, token, body, path: url.pathname }); await pause(action);
    if (action === 'upload') return json({ Id: 'object-A', Key: url.pathname });
    if (action === 'notice') return json([{ id: 'case-A', case_number: 'NOTICE-A', status: 'received', attachment_token: 'intake-token' }]);
    const payload = body.p_payload;
    return json({ id: 'attachment-A', dmca_case_id: mismatch === 'case' ? 'case-B' : payload.caseId,
      counter_notice_id: payload.counterNoticeId, source: payload.source,
      submitted_by_user_id: mismatch === 'owner' ? 'user-B' : initialUser,
      object_path: mismatch === 'path' ? 'another-object' : payload.objectPath,
      original_filename: payload.fileName, mime_type: payload.mimeType, size_bytes: payload.sizeBytes,
      scan_status: 'pending_scan', retention_status: 'active_legal_hold', preserved_for_evidence: true });
  };
  const mutation = loadStubbed('_lib/accountBoundSupabaseMutation.ts', {
    './accountSessionAuthority': authority, './supabase': bootstrap,
    './entitlementAuthority': { withAuthorityReadDeadline: async operation => await operation },
    'react-native': { Platform: { OS: 'ios' } },
    './accountBoundSupabaseRpc.mjs': { invokeAccountBoundSupabaseRpc: async input => {
      if (input.functionName === 'wave1_session_authority_readback') {
        await pause('readback'); return { data: { authoritative: true, ...authority.getCurrentAccountSessionAuthoritySnapshot() }, error: null };
      }
      assert.equal(input.functionName, 'submit_dmca_counter_notice');
      state.requests.push({ action: 'counter', token: `Bearer ${input.accessToken}` }); await pause('counter');
      return { data: { id: 'counter-A', dmca_case_id: mismatch === 'case' ? 'case-B' : 'case-A', submitter_user_id: mismatch === 'owner' ? 'user-B' : 'user-A' }, error: null };
    } },
  });
  const api = loadStubbed(process.env.DMCA_MUTATION_SOURCE ?? '_lib/dmca.ts', {
    './supabase': bootstrap, './accountSessionAuthority': authority, './accountBoundSupabaseMutation': mutation,
    '@supabase/supabase-js': { createClient: (url, key, options) => createClient(url, key, { ...options, global: { ...options.global, fetch } }) },
  });
  const options = () => ({ ...(state.subject ? { mutationSubject: state.subject } : {}), isCurrent: () => state.scope });
  const attachment = { attachmentToken: 'intake-token', caseId: 'case-A', fileData: new Uint8Array([1, 2]), fileName: 'evidence.pdf', mimeType: 'application/pdf', sizeBytes: 2 };
  return { api, state, initialToken, entered: entered.promise, release: held.resolve,
    capture: async () => { state.subject = await api.captureDmcaAttachmentMutationSubject(); return state.subject; },
    run: () => api.uploadDmcaPublicNoticeAttachment({ ...attachment, ...options() }),
    counterAttachment: () => api.uploadDmcaCounterNoticeAttachment({ ...attachment, counterNoticeId: 'counter-A', uploaderUserId: 'user-A', ...options() }),
    notice: () => api.submitDmcaNotice(publicInput, options()),
    counter: () => api.submitUploaderDmcaCounterNotice(counterInput, options()),
    retire(kind) {
      if (kind === 'scope') { state.scope = false; return; }
      if (kind === 'logout-roundtrip') {
        session = { access_token: 'token-signed-replacement', user: { id: 'user-B' } };
        listeners.forEach(fn => fn('SIGNED_IN', session));
        session = null; listeners.forEach(fn => fn('SIGNED_OUT', null)); return;
      }
      if (mode === 'signed') authority.publishAccountSessionAuthoritySnapshot(kind === 'session' ? owner('user-A', 'two') : owner('user-B'));
      session = { access_token: 'token-replacement', user: { id: kind === 'session' ? initialUser : 'user-B', is_anonymous: mode === 'anonymous' && kind === 'session' } };
      listeners.forEach(fn => fn('SIGNED_IN', session));
    },
  };
}

for (const mode of ['guest', 'anonymous', 'signed']) {
  test(`${mode}: public legal evidence needs no replacement login and preserves scanner/legal hold`, async () => {
    const h = harness(mode); const result = await h.run();
    assert.equal(result.scanStatus, 'pending_scan'); assert.equal(result.retentionStatus, 'active_legal_hold'); assert.equal(result.preservedForEvidence, true);
    assert.deepEqual(h.state.requests.map(r => r.action), ['upload', 'metadata']);
    assert.ok(h.state.requests.every(r => r.token === `Bearer ${h.initialToken}`));
    assert.equal(h.state.authReads, 1, 'one subject across upload and metadata');
  });
  test(`${mode}: capture is reusable without accumulating per-file auth observers`, async () => {
    const h = harness(mode); await h.capture(); await h.capture(); await h.notice(); await h.run();
    assert.equal(h.state.observers, 1); assert.equal(h.state.authReads, 2);
  });
  for (const kind of mode === 'guest' ? ['account', 'logout-roundtrip', 'scope'] : ['account', 'session', 'scope']) {
    test(`${mode}: captured evidence rejects stale ${kind} before storage`, async () => {
      const h = harness(mode); await h.capture(); h.retire(kind); await assert.rejects(h.run()); assert.equal(h.state.requests.length, 0);
    });
    for (const stage of ['upload', 'metadata', 'notice']) test(`${mode}: ${stage} held across ${kind} replacement retains old bearer and suppresses stale result`, async () => {
      const h = harness(mode, stage); await h.capture(); const pending = stage === 'notice' ? h.notice() : h.run();
      await h.entered; h.retire(kind); h.release(); await assert.rejects(pending);
      assert.ok(h.state.requests.every(r => r.token === `Bearer ${h.initialToken}`));
      if (stage === 'upload') assert.deepEqual(h.state.requests.map(r => r.action), ['upload'], 'no metadata for retired upload');
    });
  }
  test(`${mode}: capture held across login never recaptures a replacement`, async () => {
    const h = harness(mode, 'capture'); const pending = h.run();
    await h.entered; h.retire('account'); h.release(); await assert.rejects(pending); assert.equal(h.state.requests.length, 0);
  });
  for (const mismatch of ['case', 'owner', 'path']) test(`${mode}: returned metadata with wrong ${mismatch} cannot become an attachment`, async () => {
    const h = harness(mode, undefined, mismatch); await assert.rejects(h.run(), /confirm this evidence/);
    assert.equal(h.state.requests.length, 2, 'legal evidence is not destructively deleted on uncertain acknowledgement');
  });
}
for (const mode of ['guest', 'anonymous']) test(`${mode}: counter-notice still requires exact uploader authority`, async () => {
  const h = harness(mode); await assert.rejects(h.counter()); await assert.rejects(h.counterAttachment()); assert.equal(h.state.requests.length, 0);
});
test('signed uploader counter-notice and attachment retain the same captured credential', async () => {
  const h = harness('signed'); await h.capture(); assert.equal((await h.counter()).id, 'counter-A');
  assert.equal((await h.counterAttachment()).counterNoticeId, 'counter-A');
  assert.equal(h.state.authReads, 1); assert.ok(h.state.requests.every(r => r.token === `Bearer ${h.initialToken}`));
});
for (const kind of ['account', 'session', 'scope']) test(`counter-notice held across ${kind} replacement is never acknowledged`, async () => {
  const h = harness('signed', 'counter'); await h.capture(); const pending = h.counter();
  await h.entered; h.retire(kind); h.release(); await assert.rejects(pending);
  assert.equal(h.state.requests[0].token, `Bearer ${h.initialToken}`);
});
for (const mismatch of ['case', 'owner']) test(`counter-notice mismatched ${mismatch} cannot contaminate the initiating case`, async () => {
  const h = harness('signed', undefined, mismatch); await assert.rejects(h.counter(), /confirm this counter-notice/);
});
