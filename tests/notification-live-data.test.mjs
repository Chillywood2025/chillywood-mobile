import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createClient as createSdkClient } from '@supabase/supabase-js';

const source = ts.transpileModule(fs.readFileSync('_lib/notifications.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const binding = (generation = 'session-a') => ({ userId: 'account-a', accountId: 'account-a',
  sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const row = (extra = {}) => ({ id: '00000000-0000-4000-8000-000000000001', user_id: 'account-a',
  category: 'chilly_chat_call', notification_type: 'chilly_chat_call', title: 'Call',
  body: null, deep_link: '/chat/thread-a', status: 'pending', source_id: 'invite-a',
  target_route: '/chat/[threadId]', target_entity_id: 'thread-a', target_context: {},
  read_at: null, dismissed_at: null, created_at: '2026-01-01T00:00:00.000Z', delivered_at: null, ...extra });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const response = (data, count = 1) => new Response(JSON.stringify(data), {
  status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': `0-0/${count}` },
});
function harness({ fetcher, capture, afterScopedToken, omitDispatchFence = false } = {}) {
  let authority = binding();
  const calls = [], timers = new Map(), subscribers = new Set();
  let timerId = 0, captures = 0, clients = 0, dispatchGapVisits = 0;
  const fetchImpl = async (input, init) => {
    const call = { url: new URL(input), method: init?.method ?? 'GET', signal: init?.signal,
      authorization: new Headers(init?.headers).get('authorization'), body: init?.body };
    calls.push(call);
    const result = fetcher?.(call, calls);
    if (result) return await result;
    if (call.method === 'PATCH') return response(null);
    if (call.url.pathname.endsWith('/chat_call_invites')) return response([{ id: 'invite-a', status: 'missed', expires_at: '2026-01-01T00:00:00Z' }]);
    if (call.method === 'HEAD') return response(null, 135);
    return response([row()]);
  };
  const createClient = (url, key, options) => {
    const scoped = ++clients > 1;
    let tokenReads = 0;
    return createSdkClient(url, key, {
      ...options,
      accessToken: () => {
        const token = options.accessToken();
        // The first token read initializes Realtime. Retire in the actual
        // mutation's token-await gap, after the production callback checked.
        if (scoped && ++tokenReads === 2 && afterScopedToken) {
          void token.then(() => { dispatchGapVisits++; afterScopedToken(); });
        }
        return token;
      },
      global: { ...options?.global,
        fetch: omitDispatchFence ? fetchImpl : options?.global?.fetch ?? fetchImpl },
    });
  };
  const supabase = createClient('https://notifications.invalid', 'test-anon-key', {
    accessToken: async () => `mutable-${authority.sessionGeneration}`,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const deps = {
    '@supabase/supabase-js': { createClient },
    'react-native': { NativeModules: {}, Platform: { OS: 'ios' } },
    './supabase': { supabase, SUPABASE_URL: 'https://notifications.invalid', SUPABASE_ANON_KEY: 'test-anon-key' },
    './userFacingProductCopy': { normalizeProductNotificationCopy: value => String(value ?? '') },
    './chillyChatCalls': { CHAT_CALL_INVITES_TABLE: 'chat_call_invites' },
    './accountSessionAuthority': {
      getCurrentAccountSessionAuthoritySnapshot: () => ({ ...authority }),
      sameAccountSessionAuthority: (a, b) => !!a && !!b && Object.keys(a).every(key => a[key] === b[key]),
      subscribeToAccountSessionAuthority(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
    },
    './accountBoundSupabaseMutation': { async captureAccountBoundSupabaseMutationSubject(userId, options) {
      captures++; assert.equal(userId, 'account-a');
      assert.equal(options.waitForReadSettlement, true); assert.ok(options.signal instanceof AbortSignal);
      const subject = { accessToken: `frozen-${authority.sessionGeneration}`, authority: { ...authority } };
      await capture?.(); return subject;
    } },
  };
  const exports = {};
  new Function('exports', 'require', 'setTimeout', 'clearTimeout', 'fetch', source)(exports,
    name => deps[name] ?? {},
    (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    id => timers.delete(id), fetchImpl);
  return { api: exports, calls, timers, subscribers, get captures() { return captures; },
    get dispatchGapVisits() { return dispatchGapVisits; },
    expire() { for (const { callback, delay } of [...timers.values()]) { assert.equal(delay, 8000); callback(); } },
    replace() { authority = binding('session-b'); subscribers.forEach(callback => callback(authority)); },
  };
}

test('notification reads abort SDK transport at the deadline and retain abort-ignoring ownership', async () => {
  const held = deferred(), controller = new AbortController();
  const h = harness({ fetcher: () => held.promise });
  let finished = false;
  const pending = h.api.readNotificationListPage('account-a', 30, null, controller.signal)
    .then(result => { finished = true; return result; });
  await settle(); assert.equal(h.calls.length, 1);
  h.expire(); await settle();
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(finished, false, 'display cancellation does not falsely settle ignored transport');
  held.resolve(response([row()]));
  const result = await pending;
  assert.equal(result.status, 'unavailable'); assert.equal(h.captures, 0);
  assert.equal(h.timers.size, 0); assert.equal(h.subscribers.size, 0);
});

test('legacy Profile-style no-signal read releases its observer at eight seconds and fences the late read', async () => {
  const held = deferred();
  const h = harness({ fetcher: () => held.promise });
  const pending = h.api.readNotificationListPage('account-a', 12);
  await settle(); assert.equal(h.calls.length, 1);
  h.expire();
  assert.equal((await pending).status, 'unavailable');
  assert.equal(h.calls[0].signal.aborted, true);
  held.resolve(response([row()])); await settle();
  assert.equal(h.captures, 0);
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 0);
});

test('legacy no-signal deadline during auth capture releases observer and cannot dispatch a late reconciliation write', async () => {
  const held = deferred();
  const h = harness({ capture: () => held.promise });
  const pending = h.api.readNotificationListPage('account-a', 12);
  await settle(); assert.equal(h.captures, 1);
  h.expire(); assert.equal((await pending).status, 'unavailable');
  held.resolve(); await settle();
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 0);
  assert.equal(h.subscribers.size, 0); assert.equal(h.timers.size, 0);
});

test('legacy observer deadline does not abort or undo an already-dispatched reconciliation write', async () => {
  const held = deferred();
  const h = harness({ fetcher: call => call.method === 'PATCH' ? held.promise : null });
  const pending = h.api.readNotificationListPage('account-a', 12);
  await settle();
  const write = h.calls.find(call => call.method === 'PATCH');
  assert.ok(write); assert.equal(write.signal, undefined);
  h.expire(); assert.equal((await pending).status, 'unavailable');
  held.resolve(response(null)); await settle();
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 1);
});

test('already cancelled reads dispatch nothing and same-user replacement aborts SDK queries', async () => {
  const before = new AbortController(); before.abort();
  const h = harness();
  assert.equal((await h.api.readNotificationListPage('account-a', 30, null, before.signal)).status, 'unavailable');
  assert.equal(h.calls.length, 0);
  const held = deferred(), pendingHarness = harness({ fetcher: () => held.promise });
  const pending = pendingHarness.api.readNotificationListPage('account-a');
  await settle(); pendingHarness.replace();
  assert.equal(pendingHarness.calls[0].signal.aborted, true);
  held.resolve(response([row()]));
  assert.equal((await pending).status, 'unavailable');
  assert.equal(pendingHarness.captures, 0);
});

for (const retirement of ['cancel', 'session']) test(`reconciliation ${retirement} during awaited auth capture dispatches no UPDATE`, async () => {
  const held = deferred(), controller = new AbortController();
  const h = harness({ capture: () => held.promise });
  const pending = h.api.readNotificationListPage('account-a', 30, null, controller.signal);
  await settle(); assert.equal(h.captures, 1);
  if (retirement === 'cancel') controller.abort(); else h.replace();
  held.resolve();
  assert.equal((await pending).status, 'unavailable');
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 0);
});

for (const retirement of ['cancel', 'session']) {
  for (const omitDispatchFence of [false, true]) test(`reconciliation ${retirement} in SDK token-to-fetch microtask gap ${omitDispatchFence ? 'negative control reaches UPDATE without dispatch fence' : 'dispatches no UPDATE'}`, async () => {
    const controller = new AbortController();
    const h = harness({ omitDispatchFence,
      afterScopedToken: () => { if (retirement === 'cancel') controller.abort(); else h.replace(); },
    });
    const result = await h.api.readNotificationListPage('account-a', 30, null, controller.signal);
    assert.equal(h.dispatchGapVisits, 1, 'retirement must hit the actual SDK mutation-token await');
    assert.equal(result.status, 'unavailable');
    const writes = h.calls.filter(call => call.method === 'PATCH');
    assert.equal(writes.length, omitDispatchFence ? 1 : 0);
    if (omitDispatchFence) {
      assert.equal(writes[0].authorization, 'Bearer frozen-session-a');
      assert.equal(writes[0].signal, undefined, 'read cancellation must not be attached to dispatched writes');
    }
  });
}

test('reconciliation freezes initiating token and awaits already-dispatched UPDATE without pretending cancellation undid it', async () => {
  const held = deferred(), controller = new AbortController();
  const h = harness({ fetcher: call => call.method === 'PATCH' ? held.promise : null });
  let finished = false;
  const pending = h.api.readNotificationListPage('account-a', 30, null, controller.signal)
    .then(result => { finished = true; return result; });
  await settle();
  const write = h.calls.find(call => call.method === 'PATCH');
  assert.ok(write); assert.equal(write.authorization, 'Bearer frozen-session-a');
  assert.equal(write.url.searchParams.get('user_id'), 'eq.account-a');
  assert.equal(write.signal, undefined, 'do not attach read cancellation to a dispatched mutation');
  controller.abort(); h.replace(); await settle(); assert.equal(finished, false);
  held.resolve(response(null)); assert.equal((await pending).status, 'unavailable');
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 1);
});

test('summary waits for every transport sibling and preserves exact counts plus call reconciliation', async () => {
  const held = deferred();
  const h = harness({ fetcher: (call, calls) => call.method === 'HEAD' && calls.filter(c => c.method === 'HEAD').length === 1
    ? held.promise : null });
  let finished = false;
  const pending = h.api.readNotificationSummary('account-a').then(result => { finished = true; return result; });
  await settle(); assert.equal(finished, false);
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 1);
  held.resolve(response(null, 135));
  const result = await pending;
  assert.equal(result.totalCount, 135); assert.equal(result.unreadCount, 135);
  assert.deepEqual(result.categories, ['chilly_chat_call']);
  assert.equal(result.latestCreatedAt, row().created_at);
  assert.equal(h.calls.find(call => call.method === 'GET' && call.url.pathname.endsWith('/notifications')).url.searchParams.get('limit'), '100');
});

test('failed summary sibling cannot release an abort-ignoring sibling before settlement', async () => {
  const held = deferred(), controller = new AbortController();
  const h = harness({ fetcher: (call, calls) => {
    if (call.method === 'HEAD' && calls.filter(c => c.method === 'HEAD').length === 1) return held.promise;
    if (call.method === 'HEAD') return Promise.reject(new Error('read failed'));
    return response([]);
  } });
  let finished = false;
  const pending = h.api.readNotificationSummary('account-a', controller.signal).catch(error => { finished = true; return error; });
  await settle(); controller.abort(); await settle(); assert.equal(finished, false);
  held.resolve(response(null));
  assert.match((await pending).message, /could not be refreshed/);
});
