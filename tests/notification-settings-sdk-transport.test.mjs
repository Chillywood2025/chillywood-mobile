import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';
import { createPreferenceBackend } from './helpers/notification-preference-cas-backend.mjs';

const owner = (sessionGeneration = 'session-a', userId = 'owned-user') => ({ userId, accountId: userId, sessionGeneration, restoreOnly: false, state: 'ACTIVE' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

// Actual installed Supabase SDK query builders/auth-fetch, whole notifications,
// authority, and account-bound token capture modules. Only HTTP/native/account
// storage boundaries are modeled; no provider, production or device calls.
async function harness(backend = createPreferenceBackend()) {
  const initial = owner(), requests = [];
  const state = { authority: initial, token: 'fixture-token-a', tokenOwners: new Map([['fixture-token-a', initial]]),
    tokenGate: null, registerGate: null, insertGate: null, missing: false, readHeld: null, sessionHeld: null };
  const fetch = async (input, options = {}) => {
    const url = new URL(String(input)), headers = new Headers(options.headers);
    const token = headers.get('Authorization')?.replace(/^Bearer /, '');
    if (url.pathname.endsWith('/rpc/wave1_session_authority_readback')) {
      const authority = state.tokenOwners.get(token);
      return json(authority ? { ...authority, authoritative: true } : null);
    }
    if (url.pathname.endsWith('/rpc/read_my_notification_preferences')) {
      if (state.readHeld) { state.readHeld.entered.resolve(); await state.readHeld.release.promise; }
      const subject = state.tokenOwners.get(token);
      requests.push({ payload: { user_id: subject?.userId, read: true }, authorization: headers.get('Authorization') });
      return json(backend.read(subject.userId).data);
    }
    const payload = JSON.parse(options.body);
    if (url.pathname.endsWith('/rpc/mutate_my_notification_preferences')) {
      const subject = state.tokenOwners.get(token);
      requests.push({ payload: { ...payload, user_id: subject?.userId }, authorization: headers.get('Authorization') });
      const commit = () => backend.mutate(subject.userId, payload);
      const result = state.mutate ? await state.mutate(payload, commit) : commit();
      return json(result.data);
    }
    assert.ok(url.pathname.endsWith('/notification-device-tokens'));
    requests.push({ payload, authorization: headers.get('Authorization') });
    // Envelope-only transport double. Registration CAS behavior is exercised
    // against real SQL in notification-registration-sdk-transport.test.mjs.
    if (payload.action === 'registration-intent') return json({ ...payload, requestAccepted: true, status: 'ready',
      incarnation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revision: '0', registered: false, tokenFingerprint: null });
    return json(payload.action ? { ...payload, requestAccepted: true, disposition: 'revoked',
      status: payload.action === 'register' ? 'registered' : 'revoked', tokenFingerprint: '123456abcdef',
      ...(payload.action === 'register' ? { registered: true, incarnation: payload.expectedIncarnation,
        revision: String(BigInt(payload.expectedRevision) + 1n) } : {}) } : payload);
  };
  const client = createClient('https://notification-sdk.invalid', 'fixture-anon-key', {
    accessToken: async () => {
      if (state.tokenGate) { const gate = state.tokenGate; state.tokenGate = null; gate.entered.resolve(); await gate.release.promise; }
      return state.token;
    }, global: { fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await flush(); // Finish the SDK's initial Realtime token lookup before gating.
  const supabase = { from: client.from.bind(client), rpc(name, args) {
      if (name === 'read_my_notification_preferences' && state.insertGate) {
        state.tokenGate = state.insertGate; state.insertGate = null;
      }
      return client.rpc(name, args);
    },
    auth: { async getSession() {
      if (state.sessionHeld) { state.sessionHeld.entered.resolve(); await state.sessionHeld.release.promise; }
      return { data: { session: { access_token: state.token, user: { id: state.authority?.userId } } }, error: null };
    } },
    functions: { invoke(name, options) {
      if (options.body.action === 'register' && state.registerGate) { state.tokenGate = state.registerGate; state.registerGate = null; }
      return client.functions.invoke(name, options);
    } },
  };
  const storage = new Map([['chillywood.notification.install_id.v1', 'fixture-install'],
    ['chillywood.notification.revoke_credential.v1', 'f'.repeat(64)]]);
  const mocks = {
    '@supabase/supabase-js': { createClient },
    '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key) || null, setItem: async (key, value) => storage.set(key, value) },
    'expo-constants': { easConfig: { projectId: 'fixture-project' } }, 'expo-device': { isDevice: true }, 'expo-application': {},
    'expo-notifications': { AndroidImportance: {}, AndroidNotificationPriority: {}, setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }), getExpoPushTokenAsync: async () => ({ data: 'fixture-expo-token' }),
      getDevicePushTokenAsync: async () => ({ data: null }) },
    'react-native': { Platform: { OS: 'android' }, NativeModules: {} }, './liveEvents': {},
    './supabase': { supabase, SUPABASE_URL: 'https://notification-sdk.invalid', SUPABASE_ANON_KEY: 'fixture-anon-key' }, './userFacingProductCopy': {},
    './notificationDisplayContext': {}, // Settings does not read Activity rows.
    './chillyChatCalls': { normalizeChillyChatRingtoneKey: value => value || 'chilly_ring' }, './chillyChatCallSoundAssets': {},
    './appLinks': {}, './notificationMessageTarget': {}, './entitlementAuthority': { withAuthorityReadDeadline: async promise => promise },
  };
  const actual = new Map([['./accountSessionAuthority', '_lib/accountSessionAuthority.ts'],
    ['./accountBoundSupabaseMutation', '_lib/accountBoundSupabaseMutation.ts'], ['./accountBoundSupabaseRpc.mjs', '_lib/accountBoundSupabaseRpc.mjs']]);
  const cache = new Map();
  const load = file => {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const source = fs.readFileSync(file === '_lib/notifications.ts' && process.env.NOTIFICATION_HELPER_SOURCE
      ? process.env.NOTIFICATION_HELPER_SOURCE : new URL(`../${file}`, import.meta.url), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { fileName: 'module.ts', compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    } }).outputText, { exports, crypto: webcrypto, console, process, setTimeout, clearTimeout, fetch, URL, Headers,
      require(id) { if (id in mocks) return mocks[id]; assert.ok(actual.has(id), `unmodeled import ${id}`); return load(actual.get(id)); } });
    return exports;
  };
  const authority = load('_lib/accountSessionAuthority.ts'); authority.publishAccountSessionAuthoritySnapshot(initial);
  const api = load('_lib/notifications.ts');
  const operation = { authority: initial, isCurrent: () => authority.sameAccountSessionAuthority(initial, authority.getCurrentAccountSessionAuthoritySnapshot()) };
  return { state, api, requests, operation, backend,
    intent() { const row = backend.ensure('owned-user'); return api.createNotificationPreferenceIntent({ revision: row.revision, incarnation: row.incarnation }); },
    gate() { return { entered: deferred(), release: deferred() }; },
    replace(next = owner('session-b'), token = 'fixture-token-b', publish = true) {
      state.authority = next; state.token = token; state.tokenOwners.set(token, next);
      if (publish) authority.publishAccountSessionAuthoritySnapshot(next);
    },
  };
}

for (const action of ['save', 'register', 'insert']) {
  for (const replacement of ['same-user session', 'other account', 'same-session token refresh']) {
    test(`SDK ${action} freezes initiating bearer across ${replacement}`, async () => {
      const h = await harness(), gate = h.gate();
      if (action === 'save') h.state.tokenGate = gate;
      else if (action === 'register') h.state.registerGate = gate;
      else { h.state.missing = true; h.state.insertGate = gate; }
      const pending = action === 'save' ? h.api.updateNotificationPreferences({ messagesEnabled: false }, 'owned-user', h.operation, h.intent())
        : action === 'register' ? h.api.requestPushPermissionAndRegister(h.operation)
          : h.api.readNotificationPreferences('owned-user', h.operation);
      const outcome = pending.then(value => ({ value }), error => ({ error }));
      await gate.entered.promise;
      h.replace(replacement === 'other account' ? owner('session-b', 'other-user')
        : replacement === 'same-session token refresh' ? owner() : owner('session-b'));
      gate.release.resolve(); const settled = await outcome;
      if (action !== 'register' && replacement !== 'same-session token refresh') {
        assert.match(settled.error?.message || '', /no longer current/);
      } else assert.equal(settled.error, undefined);
      const writes = h.requests.filter(r => !['revoke', 'registration-intent'].includes(r.payload.action));
      assert.equal(writes.length, 1);
      assert.equal(writes[0].authorization, 'Bearer fixture-token-a', 'SDK must not substitute the successor bearer');
      assert.equal(writes[0].payload.user_id || writes[0].payload.userId, 'owned-user');
      if (action === 'register') assert.equal(writes[0].payload.sessionGeneration, 'session-a');
      if (action === 'register') assert.ok(h.requests.filter(r => r.payload.action === 'registration-intent')
        .every(r => r.authorization === 'Bearer fixture-token-a'), 'snapshot and mutation share the initiating bearer');
    });
  }
}

test('SDK capture rejects a replacement session before any preference dispatch', async () => {
  const h = await harness(), gate = h.gate(); h.state.sessionHeld = gate;
  const pending = h.api.updateNotificationPreferences({ messagesEnabled: false }, 'owned-user', h.operation, h.intent());
  const outcome = assert.rejects(pending, /account changed|owner changed|no longer current/i);
  await gate.entered.promise; h.replace(); gate.release.resolve(); await outcome;
  assert.equal(h.requests.length, 0);
});

test('SDK exact server readback rejects unpublished same-user session replacement', async () => {
  const h = await harness(); h.replace(owner('session-b'), 'fixture-token-b', false);
  await assert.rejects(h.api.updateNotificationPreferences({ messagesEnabled: false }, 'owned-user', h.operation, h.intent()), /account changed/i);
  assert.equal(h.requests.length, 0);
});

test('separate real SDK runtimes reject delayed older intent after a successful same-value save', async () => {
  const backend = createPreferenceBackend(), first = await harness(backend), second = await harness(backend);
  const older = first.intent(), newer = second.intent(), gate = first.gate();
  first.state.mutate = async (_request, commit) => { gate.entered.resolve(); await gate.release.promise; return commit(); };
  const pending = first.api.updateNotificationPreferences({ messagesEnabled: false }, 'owned-user', first.operation, older);
  const rejected = assert.rejects(pending, error => error.outcome === 'conflict' && error.currentPreferences.messagesEnabled === true);
  await gate.entered.promise;
  const current = await second.api.updateNotificationPreferences({ messagesEnabled: true }, 'owned-user', second.operation, newer);
  assert.equal(current.revision, '1', 'successful no-op expresses a new accepted intent');
  gate.release.resolve(); await rejected;
  assert.equal(backend.rows.get('owned-user').messages_enabled, true);
  assert.equal(backend.rows.get('owned-user').revision, '1');
  assert.equal(first.requests.length, 1, 'conflict is not silently rebased or retried');
});

test('real SDK lost acknowledgement remains unknown and exact retry does not increment twice', async () => {
  const h = await harness(), intent = h.intent();
  h.state.mutate = (_request, commit) => { commit(); throw new Error('synthetic transport loss'); };
  await assert.rejects(h.api.updateNotificationPreferences({ messagesEnabled: false }, 'owned-user', h.operation, intent),
    error => error.outcome === 'unknown' && error.currentPreferences === null);
  assert.equal(h.backend.rows.get('owned-user').revision, '1');
  h.state.mutate = null;
  const retried = await h.api.updateNotificationPreferences({ messagesEnabled: false }, 'owned-user', h.operation, intent);
  assert.equal(retried.revision, '1');
  assert.equal(h.backend.rows.get('owned-user').revision, '1');
});

for (const damage of ['wrong subject', 'numeric revision', 'wrong operation', 'wrong incarnation']) {
  test(`real SDK malformed acknowledgement stays unknown: ${damage}`, async () => {
    const h = await harness(), intent = h.intent();
    h.state.mutate = (_request, commit) => {
      const result = commit();
      if (damage === 'wrong subject') result.data.preferences.user_id = 'another-user';
      if (damage === 'numeric revision') result.data.revision = 1;
      if (damage === 'wrong operation') result.data.operationId = webcrypto.randomUUID();
      if (damage === 'wrong incarnation') result.data.expectedIncarnation = webcrypto.randomUUID();
      return result;
    };
    await assert.rejects(h.api.updateNotificationPreferences({ messagesEnabled: false }, 'owned-user', h.operation, intent),
      error => error.outcome === 'unknown' && error.currentPreferences === null);
    assert.equal(h.backend.rows.get('owned-user').messages_enabled, false, 'bad acknowledgement is not proof of noncommit');
  });
}
