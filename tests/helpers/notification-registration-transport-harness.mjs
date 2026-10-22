import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { sqlFunction, table } from './studio-authority-fixture.mjs';
import { splitSQL } from './database-runtime-authority-fixture.mjs';
import { loadExactNotificationSdks } from '../../isolated-runtime/notification-edge-sdk/verify.mjs';

export const notificationTransportAuthority = Object.freeze({
  userId: '88000000-0000-4000-8000-000000000001', accountId: '88000000-0000-4000-8000-000000000001',
  sessionGeneration: '87000000-0000-4000-8000-000000000001', restoreOnly: false, state: 'ACTIVE',
});
export const notificationTransportCredential = 'a'.repeat(64);
export const notificationTransportJson = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
});
export function notificationTransportGate() {
  const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
  return { entered: deferred(), release: deferred() };
}
const root = new URL('../../', import.meta.url);
const sourceFile = file => new URL(file, root);
const source = file => fs.readFileSync(sourceFile(file), 'utf8');
const transpile = input => ts.transpileModule(input, { fileName: 'module.ts', compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
} }).outputText;
const flush = async () => { for (let index = 0; index < 100; index++) await Promise.resolve(); };

export const registrationRevisionMigration = 'supabase/migrations/20261022205003_notification_registration_revision_authority.sql';

// Minimal real-SQL schema used by the transport tests. Infrastructure-only
// auth tables are modeled; all push ownership, authority, CAS and revoke
// functions are extracted unmodified from production migration sources.
// PGlite executes explicit request order, not simultaneous PostgreSQL locks.
export async function makeNotificationRegistrationSqlFixture({ applyRepair = true } = {}) {
  const migration = 'supabase/migrations/202608140001_wave1_identity_entitlement_authority.sql';
  const baseline = 'supabase/migrations/202605120003_d9_notifications_activity_production.sql';
  const db = new PGlite({ extensions: { pgcrypto } });
  let queue = Promise.resolve();
  try {
    await db.exec(`set check_function_bodies=false; create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private; create schema extensions; create extension pgcrypto with schema extensions;
      create table auth.users(id uuid primary key,banned_until timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create table public.account_deletion_requests(user_id uuid,status text,restore_deadline timestamptz,delete_after timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth to authenticated;
      ${table(baseline, 'user_push_tokens')}
      create unique index user_push_tokens_provider_token_hash_unique on public.user_push_tokens(provider,token_hash);
      ${table(migration, 'wave1_push_installation_ownership')}
      ${table(migration, 'wave1_authority_audit_events')}
    `);
    for (const statement of splitSQL(source(migration)).filter(statement => /^alter table public\."user_push_tokens"/iu.test(statement.trim()))) {
      await db.exec(statement);
    }
    await db.exec(sqlFunction('supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql', 'is_account_access_restricted'));
    await db.exec(sqlFunction('supabase/migrations/20260603014500_self_service_account_deletion_30_day_restore.sql', 'is_account_deletion_scheduled'));
    await db.exec(sqlFunction('supabase/migrations/20260826055737_exact_current_session_not_after_authority.sql', 'wave1_session_authority_readback'));
    for (const name of ['wave1_sha256', 'wave1_register_push_token', 'wave1_revoke_push_ownership', 'wave1_push_ownership_readback']) {
      await db.exec(sqlFunction(migration, name));
    }
    await db.exec(`revoke all on function public.wave1_revoke_push_ownership(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
      grant execute on function public.wave1_revoke_push_ownership(uuid,uuid,text,text,text,text,text,text) to service_role;
      revoke all on function public.wave1_register_push_token(uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb) from public,anon,service_role;
      grant execute on function public.wave1_register_push_token(uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb) to authenticated;`);
    if (applyRepair) await db.exec(source(registrationRevisionMigration));
    const addAuthority = async authority => {
      await db.query('insert into auth.users(id) values($1) on conflict do nothing', [authority.userId]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2) on conflict do nothing', [authority.sessionGeneration, authority.userId]);
    };
    await addAuthority(notificationTransportAuthority);
    const rpc = (name, args = {}, context = {}) => {
      const run = queue.then(async () => {
        const role = context.service ? 'service_role' : 'authenticated';
        const subject = context.subject ?? notificationTransportAuthority;
        await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role, sub: subject.userId, session_id: subject.sessionGeneration })]);
        await db.exec(`set role ${role}`);
        try {
          const keys = Object.keys(args);
          assert.ok(keys.every(key => /^p_[a-z_]+$/u.test(key)));
          assert.ok(/^(?:wave1_|read_my_push_|register_my_push_)[a-z_]+$/u.test(name));
          const result = await db.query(`select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(',')}) value`,
            keys.map(key => args[key] !== null && typeof args[key] === 'object' ? JSON.stringify(args[key]) : args[key]));
          return result.rows[0].value;
        } finally { await db.exec('reset role'); }
      });
      queue = run.catch(() => {});
      return run;
    };
    const snapshot = async install => {
      await queue;
      const ownership = (await db.query('select ownership_state,ownership_version::text,last_reason from public.wave1_push_installation_ownership where install_id=$1', [install])).rows[0] || null;
      const tokens = (await db.query('select token_fingerprint,enabled,ownership_state from public.user_push_tokens where install_id=$1 order by token_fingerprint', [install])).rows;
      const streams = applyRepair ? (await db.query('select provider,actor_user_id::text,session_generation,incarnation::text,revision::text from private.notification_registration_streams where install_id=$1 order by provider', [install])).rows : [];
      return { ownership, tokens, streams };
    };
    const reset = async () => {
      await queue;
      await db.exec(`reset role; reset all;
        select set_config('request.jwt.claims','{}',false);
        truncate ${applyRepair ? 'private.notification_registration_receipts, private.notification_registration_streams,' : ''}
          public.user_push_tokens, public.wave1_push_installation_ownership,
          public.wave1_authority_audit_events, public.account_deletion_requests,
          auth.sessions, auth.users restart identity cascade;`);
      await addAuthority(notificationTransportAuthority);
    };
    return { db, rpc, snapshot, addAuthority, reset, close: async () => { await queue; await db.close(); } };
  } catch (error) { await db.close(); throw error; }
}

// Whole production helpers in independent module contexts/client instances.
// Only native, auth HTTP, storage and PostgREST transport are fixture boundaries.
// rpc(name, args, context) executes the caller's real extracted SQL and returns
// the raw scalar result. context identifies the frozen bearer and database role.
// No RPC behavior, CAS decision, registration envelope, or revoke is reimplemented.
export function createNotificationRegistrationTransportHarness({
  rpc, authority = notificationTransportAuthority, sharedStorage = new Map(),
  helperSource = '_lib/notifications.ts', edgeSource = 'supabase/functions/notification-device-tokens/index.ts',
  timers = { setTimeout, clearTimeout },
} = {}) {
  assert.equal(typeof rpc, 'function', 'provide an actual SQL RPC adapter');
  const sdks = loadExactNotificationSdks();
  const base = 'https://notification-registration-fixture.invalid';
  const serviceKey = 'fixture-only-service-role-key', anonKey = 'fixture-only-anon-key';
  const initialBearer = 'fixture-only-access-token';
  const tokenOwners = new Map([[initialBearer, authority]]), requests = [];
  const context = new AsyncLocalStorage();
  const state = { rpcHook: null, authHook: null };
  let edge;
  const transport = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    assert.equal(url.origin, base, 'SDK transport must never leave the local fixture');
    const headers = new Headers(options.headers || input.headers);
    const authorization = headers.get('Authorization');
    const bearer = authorization?.replace(/^Bearer /u, '');
    const subject = tokenOwners.get(bearer);
    const service = bearer === serviceKey;
    if (url.pathname === '/auth/v1/user') {
      const request = { kind: 'auth', authorization, subject, runtime: context.getStore()?.label ?? null };
      requests.push(request);
      if (state.authHook) return state.authHook(request);
      return subject ? notificationTransportJson({ id: subject.userId, aud: 'authenticated', role: 'authenticated',
        email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {} })
        : notificationTransportJson({ message: 'fixture token not recognized' }, 401);
    }
    assert.ok(url.pathname.startsWith('/rest/v1/rpc/'), `unmodeled SDK URL ${url.pathname}`);
    const name = url.pathname.split('/').at(-1);
    const args = JSON.parse(options.body || (input instanceof Request ? await input.clone().text() : '{}'));
    const request = { kind: 'rpc', name, args, authorization, subject, service,
      runtime: context.getStore()?.label ?? null };
    requests.push(request);
    assert.ok(service || subject, 'RPC bearer must resolve to an explicit fixture principal');
    const commit = async () => {
      try { return notificationTransportJson(await rpc(name, args, request)); }
      catch (error) { return notificationTransportJson({ code: error.code, message: error.message }, 400); }
    };
    return state.rpcHook ? state.rpcHook(request, commit) : commit();
  };
  vm.runInNewContext(transpile(source(edgeSource)), {
    exports: {}, crypto: webcrypto, TextEncoder, Response, Request, Headers, console,
    Deno: { env: { get: key => ({ SUPABASE_URL: base, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey })[key] },
      serve(handler) { edge = handler; } },
    require(id) {
      if (id === 'jsr:@supabase/functions-js/edge-runtime.d.ts') return {};
      assert.equal(id, 'npm:@supabase/supabase-js@2.110.6');
      return { createClient: (url, key, options) => sdks.createEdgeClient(url, key, { ...options,
        global: { ...options.global, fetch: transport },
        auth: { ...options.auth, autoRefreshToken: false, detectSessionInUrl: false },
      }) };
    },
  });
  assert.equal(typeof edge, 'function');

  async function runtime(label, install, token, initialAuthority = authority) {
    const runtimeState = { token, fcmToken: null, tokenReads: { expo: 0, fcm: 0 }, authority: initialAuthority, bearer: initialBearer, gate: null, storageGate: null,
      accessTokenGate: null, functionTokenGate: null, sessionGate: null, nativeTokenGate: null, permissionGate: null,
      permissionGranted: true, permissionReadGate: null, afterEdge: null, requests: [] };
    if (initialAuthority !== authority) {
      runtimeState.bearer = `fixture-only-${label}-access-token`;
      tokenOwners.set(runtimeState.bearer, initialAuthority);
    }
    if (!sharedStorage.has(install)) sharedStorage.set(install, new Map([
      ['chillywood.notification.install_id.v1', install], ['chillywood.notification.revoke_credential.v1', notificationTransportCredential],
    ]));
    const storage = sharedStorage.get(install);
    const http = async (input, options = {}) => context.run({ label }, async () => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
      assert.equal(url.origin, base, 'mobile transport must never leave the local fixture');
      if (!url.pathname.startsWith('/functions/v1/')) return transport(input, options);
      assert.equal(url.pathname, '/functions/v1/notification-device-tokens');
      const payload = JSON.parse(options.body);
      const headers = Object.fromEntries(new Headers(options.headers));
      const request = { kind: 'edge', runtime: label, payload, headers, authorization: new Headers(headers).get('Authorization'), response: null };
      requests.push(request); runtimeState.requests.push(request);
      if (runtimeState.gate?.action === payload.action && (!runtimeState.gate.predicate || runtimeState.gate.predicate(payload))) {
        const gate = runtimeState.gate; runtimeState.gate = null;
        gate.entered.resolve(request); await gate.release.promise;
      }
      const response = await edge(new Request(input, options));
      request.response = await response.clone().json();
      request.responseStatus = response.status;
      return runtimeState.afterEdge ? runtimeState.afterEdge(request, response) : response;
    });
    const client = sdks.createMobileClient(base, anonKey, {
      accessToken: async () => {
        if (runtimeState.accessTokenGate) {
          const gate = runtimeState.accessTokenGate; runtimeState.accessTokenGate = null;
          gate.entered.resolve(); await gate.release.promise;
        }
        return runtimeState.bearer;
      }, global: { fetch: http }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await flush(); // Let the SDK's initial realtime token lookup settle before gates.
    const supabase = { rpc: client.rpc.bind(client), from: client.from.bind(client), functions: { invoke(name, options) {
      if (runtimeState.functionTokenGate?.action === options.body.action) {
        runtimeState.accessTokenGate = runtimeState.functionTokenGate;
        runtimeState.functionTokenGate = null;
      }
      return client.functions.invoke(name, options);
    } },
      auth: { getSession: async () => {
        if (runtimeState.sessionGate) {
          const gate = runtimeState.sessionGate; runtimeState.sessionGate = null;
          gate.entered.resolve(); await gate.release.promise;
        }
        return { data: { session: { access_token: runtimeState.bearer, user: { id: runtimeState.authority?.userId } } }, error: null };
      } },
    };
    const mocks = {
      '@react-native-async-storage/async-storage': {
        getItem: async key => {
          if (runtimeState.storageGate?.key === key) {
            const gate = runtimeState.storageGate; runtimeState.storageGate = null;
            gate.entered.resolve(); await gate.release.promise;
          }
          return storage.get(key) ?? null;
        }, setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key),
      },
      'expo-constants': { easConfig: { projectId: 'fixture-project' } }, 'expo-device': { isDevice: true }, 'expo-application': {},
      'expo-notifications': { AndroidImportance: {}, AndroidNotificationPriority: {}, setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
        getPermissionsAsync: async () => {
          if (runtimeState.permissionReadGate) {
            const gate = runtimeState.permissionReadGate; runtimeState.permissionReadGate = null;
            gate.entered.resolve(); await gate.release.promise;
          }
          return { granted: runtimeState.permissionGranted, canAskAgain: true };
        },
        requestPermissionsAsync: async () => {
          if (runtimeState.permissionGate) {
            const gate = runtimeState.permissionGate; runtimeState.permissionGate = null;
            gate.entered.resolve(); await gate.release.promise;
          }
          runtimeState.permissionGranted = true;
          return { granted: true, canAskAgain: true };
        },
        getExpoPushTokenAsync: async () => {
          runtimeState.tokenReads.expo++;
          if (runtimeState.nativeTokenGate) {
            const gate = runtimeState.nativeTokenGate; runtimeState.nativeTokenGate = null;
            gate.entered.resolve(); await gate.release.promise;
          }
          return { data: runtimeState.token };
        }, getDevicePushTokenAsync: async () => { runtimeState.tokenReads.fcm++; return { data: runtimeState.fcmToken }; } },
      'react-native': { Platform: { OS: 'android' }, NativeModules: {} }, './liveEvents': {},
      './supabase': { supabase, SUPABASE_URL: base, SUPABASE_ANON_KEY: anonKey }, './userFacingProductCopy': {},
      './chillyChatCalls': { normalizeChillyChatRingtoneKey: value => value || 'chilly_ring' }, './chillyChatCallSoundAssets': {},
      './appLinks': {}, './notificationMessageTarget': {},
    };
    const actual = new Map([['./accountSessionAuthority', '_lib/accountSessionAuthority.ts'],
      ['./entitlementAuthority', '_lib/entitlementAuthority.ts'],
      ['./accountBoundSupabaseMutation', '_lib/accountBoundSupabaseMutation.ts'], ['./accountBoundSupabaseRpc.mjs', '_lib/accountBoundSupabaseRpc.mjs']]);
    const cache = new Map();
    function load(file) {
      if (cache.has(file)) return cache.get(file);
      const exports = {}; cache.set(file, exports);
      vm.runInNewContext(transpile(source(file === '_lib/notifications.ts' ? helperSource : file)), {
        exports, crypto: webcrypto, console, process, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, fetch: http, URL, Headers,
        require(id) { if (id in mocks) return mocks[id]; assert.ok(actual.has(id), `unmodeled production import ${id}`); return load(actual.get(id)); },
      });
      return exports;
    }
    const authorityModule = load('_lib/accountSessionAuthority.ts');
    authorityModule.publishAccountSessionAuthoritySnapshot(initialAuthority);
    const api = load('_lib/notifications.ts');
    const owner = { authority: initialAuthority,
      isCurrent: () => authorityModule.sameAccountSessionAuthority(initialAuthority, authorityModule.getCurrentAccountSessionAuthoritySnapshot()) };
    return {
      state: runtimeState, api, owner, label, storage, client,
      hold(action, predicate) { return runtimeState.gate = { action, predicate, ...notificationTransportGate() }; },
      holdStorage(key) { return runtimeState.storageGate = { key, ...notificationTransportGate() }; },
      holdAccessToken() { return runtimeState.accessTokenGate = notificationTransportGate(); },
      holdSdkToken(action) { return runtimeState.functionTokenGate = { action, ...notificationTransportGate() }; },
      holdSession() { return runtimeState.sessionGate = notificationTransportGate(); },
      holdNativeToken() { return runtimeState.nativeTokenGate = notificationTransportGate(); },
      holdPermissionRead() { return runtimeState.permissionReadGate = notificationTransportGate(); },
      holdPermissionPrompt() { runtimeState.permissionGranted = false; return runtimeState.permissionGate = notificationTransportGate(); },
      replace(nextAuthority, nextBearer = `fixture-only-${label}-replacement`, publish = true) {
        runtimeState.authority = nextAuthority; runtimeState.bearer = nextBearer; tokenOwners.set(nextBearer, nextAuthority);
        if (publish) authorityModule.publishAccountSessionAuthoritySnapshot(nextAuthority);
      },
      register: () => api.requestPushPermissionAndRegister(owner),
      refresh: () => api.refreshPushRegistrationIfGranted(owner),
      revoke: () => api.revokeCurrentPushInstall('user_request', owner),
    };
  }
  const replay = async (request, { payload = request.payload, headers = request.headers } = {}) => context.run({ label: 'exact-replay' },
    () => edge(new Request(`${base}/functions/v1/notification-device-tokens`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload),
    })));
  return {
    runtime, replay, requests, state, sharedStorage, tokenOwners, versions: sdks.versions,
    provenance: [helperSource, edgeSource, '_lib/entitlementAuthority.ts'].map(file => ({ file, sha256: createHash('sha256').update(source(file)).digest('hex') })),
  };
}
