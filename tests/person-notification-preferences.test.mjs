import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const authority = { state: 'ACTIVE', userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', accountId: 'account', sessionGeneration: 'one', restoreOnly: false };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const row = (changes = {}) => ({ actorUserId: actor, revision: 0, liveStarts: null, watchPartyStarts: null, joinedLive: false, following: true, circle: false, ...changes });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness() {
  const state = { authority: { ...authority }, reads: [], writes: [], timers: new Map(), capture: null, read: null, write: null };
  let timer = 0;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/personNotificationPreferences.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, setTimeout(fn) { state.timers.set(++timer, fn); return timer; }, clearTimeout(id) { state.timers.delete(id); },
    require(name) {
      if (name === './accountSessionAuthority') return { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same };
      if (name === './accountBoundSupabaseMutation') return {
        captureAccountBoundSupabaseMutationSubject: async () => state.capture ? state.capture() : ({ authority: state.authority, accessToken: 'test-only' }),
        invokeAccountBoundSupabaseMutationRpc: async (...args) => { state.reads.push(args); return state.read ? state.read() : { data: row(), error: null }; },
      };
      if (name === './accountBoundSupabaseRpc.mjs') return { isAccountBoundSupabaseRpcOutcomeAmbiguous: error => error.message === 'account_bound_rpc_outcome_unknown', invokeAccountBoundSupabaseRpc: async input => { state.writes.push(input); return state.write ? state.write(input) : { data: row({ revision: 1, joinedLive: true }), error: null }; } };
      if (name === './supabase') return { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test-public' };
      if (name === 'react-native') return { Platform: { OS: 'ios' } };
      throw Error(name);
    },
  });
  return { state, ...exports, expire() { const timers = [...state.timers.values()]; state.timers.clear(); timers.forEach(fn => fn()); } };
}
test('missing backend, malformed and wrong-actor reads never invent disabled defaults', async () => {
  const h = harness();
  for (const data of [null, {}, row({ actorUserId: authority.userId }), row({ revision: -1 }), row({ joinedLive: null }), row({ liveStarts: undefined })]) {
    h.state.read = () => ({ data, error: null });
    await assert.rejects(h.readPersonNotificationPreferences(actor, authority));
  }
  h.state.read = () => ({ data: null, error: { message: 'missing RPC' } });
  await assert.rejects(h.readPersonNotificationPreferences(actor, authority));
});
test('confirmed defaults and CAS payload are exact; no Follow/Circle mutation is sent', async () => {
  const h = harness();
  const current = await h.readPersonNotificationPreferences(actor, authority);
  assert.equal(current.liveStarts, null); assert.equal(current.joinedLive, false);
  const result = await h.savePersonNotificationPreferences(current, { ...current, joinedLive: true }, authority);
  assert.equal(result.revision, 1); assert.equal(h.state.writes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.writes[0].args)), { p_actor_user_id: actor, p_live_starts: null, p_watch_party_starts: null, p_joined_live: true, p_expected_revision: 0 });
  assert.equal(h.state.writes[0].functionName, 'set_person_notification_preferences');
});
test('account replacement during capture prevents dispatch', async () => {
  const h = harness(); h.state.capture = async () => { h.state.authority = { ...authority, sessionGeneration: 'two' }; return { authority: h.state.authority }; };
  await assert.rejects(h.savePersonNotificationPreferences(row(), row(), authority)); assert.equal(h.state.writes.length, 0);
});
test('captured CAS intent is immutable while session capture is awaiting', async () => {
  const h = harness(), capture = deferred(), before = row(), next = row({ joinedLive: true }); h.state.capture = () => capture.promise;
  const saved = h.savePersonNotificationPreferences(before, next, authority);
  before.revision = 99; next.joinedLive = false; next.liveStarts = false;
  capture.resolve({ authority, accessToken: 'test-only' }); await saved;
  assert.equal(h.state.writes[0].args.p_expected_revision, 0); assert.equal(h.state.writes[0].args.p_joined_live, true); assert.equal(h.state.writes[0].args.p_live_starts, null);
});
test('timeout retains write ownership, blocks duplicate/contradictory writes and stale reload until actual settlement', async () => {
  const h = harness(), pending = deferred(); h.state.write = () => pending.promise;
  const write = h.savePersonNotificationPreferences(row(), row({ joinedLive: true }), authority);
  await new Promise(setImmediate); h.expire();
  await assert.rejects(write, error => error.kind === 'unknown');
  await assert.rejects(h.savePersonNotificationPreferences(row(), row({ joinedLive: false }), authority), error => error.kind === 'unknown');
  const read = h.readPersonNotificationPreferences(actor, authority); h.expire();
  await assert.rejects(read); assert.equal(h.state.reads.length, 0); assert.equal(h.state.writes.length, 1);
  pending.resolve({ data: row({ joinedLive: true, revision: 1 }), error: null }); await new Promise(setImmediate);
  h.state.read = () => ({ data: row({ joinedLive: true, revision: 1 }), error: null });
  const recovered = await h.readPersonNotificationPreferences(actor, authority);
  assert.equal(recovered.revision, 1); assert.equal(recovered.joinedLive, true); assert.equal(h.state.writes.length, 1);
});
test('conflict and malformed save acknowledgement never report success', async () => {
  const h = harness(); h.state.write = () => ({ data: null, error: { message: 'person_notification_conflict' } });
  await assert.rejects(h.savePersonNotificationPreferences(row(), row(), authority), error => error.kind === 'conflict');
  for (const data of [null, row(), row({ revision: 2 }), row({ revision: 1, joinedLive: true })]) {
    h.state.write = () => ({ data, error: null });
    await assert.rejects(h.savePersonNotificationPreferences(row(), row(), authority), error => error.kind === 'unknown');
  }
});
test('settled network-unknown is not server cancellation; explicit retry retains exactly the prior CAS intent', async () => {
  const h = harness(); h.state.write = () => ({ data: null, error: { message: 'account_bound_rpc_outcome_unknown' } });
  await assert.rejects(h.savePersonNotificationPreferences(row(), row({ joinedLive: true }), authority));
  assert.equal(h.hasPendingPersonNotificationSave(actor, authority), true);
  await assert.rejects(h.readPersonNotificationPreferences(actor, authority), error => error.kind === 'unknown');
  await assert.rejects(h.savePersonNotificationPreferences(row(), row({ liveStarts: false }), authority));
  assert.equal(h.state.writes.length, 1);
  h.state.write = () => ({ data: row({ revision: 1, joinedLive: true }), error: null });
  const saved = await h.retryPersonNotificationPreferences(actor, authority);
  assert.equal(saved.joinedLive, true); assert.equal(h.hasPendingPersonNotificationSave(actor, authority), false);
  assert.equal(JSON.stringify(h.state.writes[0].args), JSON.stringify(h.state.writes[1].args));
});
test('a definitively rejected retry cannot erase uncertainty of the original request', async () => {
  const h = harness(); h.state.write = () => ({ data: null, error: { message: 'account_bound_rpc_outcome_unknown' } });
  await assert.rejects(h.savePersonNotificationPreferences(row(), row({ joinedLive: true }), authority));
  h.state.write = () => ({ data: null, error: { message: 'person_notification_access_required' } });
  await assert.rejects(h.retryPersonNotificationPreferences(actor, authority));
  assert.equal(h.hasPendingPersonNotificationSave(actor, authority), true);
  await assert.rejects(h.readPersonNotificationPreferences(actor, authority), error => error.kind === 'unknown');
  await assert.rejects(h.savePersonNotificationPreferences(row(), row({ liveStarts: false }), authority));
  h.state.read = () => ({ data: row({ revision: 1, joinedLive: true }), error: null });
  assert.equal((await h.readPersonNotificationPreferences(actor, authority)).joinedLive, true);
  assert.equal(h.hasPendingPersonNotificationSave(actor, authority), false);
});
test('old sessions settled uncertainty does not exhaust a replacement session save budget', async () => {
  const h = harness(); h.state.write = () => ({ data: null, error: { message: 'account_bound_rpc_outcome_unknown' } });
  await assert.rejects(h.savePersonNotificationPreferences(row(), row({ joinedLive: true }), authority));
  const second = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await assert.rejects(h.savePersonNotificationPreferences(row({ actorUserId: second }), row({ joinedLive: true }), authority));
  const replacement = { ...authority, sessionGeneration: 'two' }; h.state.authority = replacement;
  h.state.write = () => ({ data: row({ revision: 1, joinedLive: true }), error: null });
  assert.equal((await h.savePersonNotificationPreferences(row(), row({ joinedLive: true }), replacement)).revision, 1);
});
