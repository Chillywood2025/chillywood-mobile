import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const owner = (generation = 'session-a', id = 'host') => ({ userId: id, accountId: id, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const row = () => ({
  party_id: 'PARTY42', host_user_id: 'host', room_type: 'title', title_id: 'title-a', source_type: 'platform_title', source_id: 'title-a',
  room_generation: '11111111-1111-4111-8111-111111111111', host_settings_revision: 0,
  is_active: true, started_at: new Date(Date.now() - 20 * 60_000).toISOString(), updated_at: new Date().toISOString(),
  last_activity_at: new Date(Date.now() - 20 * 60_000).toISOString(), discovery_visibility: 'private', discovery_paused: false, discovery_title: null,
  discovery_started_at: null, join_policy: 'open', content_access_rule: 'open', reactions_policy: 'enabled', capture_policy: 'best_effort',
});
const extract = (file, names) => {
  const source = fs.readFileSync(file === '_lib/watchParty.ts' ? process.env.PARTY_PREPARED_SOURCE ?? file : file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return ast.statements.filter(node => ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
    ? names.includes(node.name?.text)
    : ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(ast))))
    .map(node => node.getText(ast)).join('\n');
};

// Real production identity/token capture, raw preparation read, refresh, mapper,
// ordinary get, and join guard execute over real Supabase SDK query builders.
// Only the HTTP database/admission boundaries are modeled; no live mutation.
function harness() {
  const state = { authority: owner(), token: 'token-a', authUser: 'host', tokenOwners: new Map([['token-a', owner()]]),
    stored: row(), reads: [], writes: [], hooks: new Map(), response: null, ack: null, current: true, memberships: [], admissionAllowed: true };
  const checkpoint = async name => { const hook = state.hooks.get(name); if (hook) { state.hooks.delete(name); await hook(); } };
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input)), headers = new Headers(init.headers);
    if (url.pathname.endsWith('/rpc/wave1_session_authority_readback')) {
      const binding = state.tokenOwners.get(headers.get('Authorization')?.replace(/^Bearer /, ''));
      await checkpoint('readback'); return json(binding ? { ...binding, authoritative: true } : null);
    }
    assert.ok(url.pathname.endsWith('/watch_party_rooms'));
    if (init.method === 'GET') {
      state.reads.push(url); await checkpoint('read');
      return json(state.stored && url.searchParams.get('party_id') === `eq.${state.stored.party_id}` ? state.stored : null);
    }
    assert.equal(init.method, 'PATCH');
    const payload = JSON.parse(init.body), write = { payload, authorization: headers.get('Authorization'), url, prefer: headers.get('Prefer') };
    state.writes.push(write); await checkpoint('patch');
    if (state.response) return state.response(write);
    const matches = state.stored && [...url.searchParams].every(([key, value]) => {
      if (key === 'select') return true;
      if (value === 'is.null') return state.stored[key] === null;
      if (value.startsWith('eq.')) return String(state.stored[key]) === value.slice(3);
      if (value.startsWith('lte.')) return Date.parse(state.stored[key]) <= Date.parse(value.slice(4));
      assert.fail(`Unexpected filter ${key}=${value}`);
    });
    if (!matches) return json(null);
    state.stored = { ...state.stored, ...payload };
    const ack = state.ack ? await state.ack({ ...state.stored }) : state.stored;
    return json(ack);
  };
  const client = createClient('https://prepared-adapter.invalid', 'fixture-key', {
    accessToken: async () => { await checkpoint('transport-token'); return state.token; }, global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const supabase = { from: client.from.bind(client), auth: { async getSession() {
    await checkpoint('session'); return { data: { session: { access_token: state.token, user: { id: state.authUser } } } };
  } } };
  const modules = new Map();
  const paths = new Map([
    ['./accountSessionAuthority', '_lib/accountSessionAuthority.ts'], ['./accountBoundSupabaseMutation', '_lib/accountBoundSupabaseMutation.ts'],
    ['./accountBoundSupabaseRpc.mjs', '_lib/accountBoundSupabaseRpc.mjs'], ['./entitlementAuthority', '_lib/entitlementAuthority.ts'],
  ]);
  const load = file => {
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, { exports, fetch, URL, Headers, Date, Promise, setTimeout, clearTimeout, require(name) {
      if (name === 'react-native') return { Platform: { OS: 'android' } };
      if (name === './supabase') return { supabase, SUPABASE_URL: 'https://prepared-adapter.invalid', SUPABASE_ANON_KEY: 'fixture-key' };
      assert.ok(paths.has(name), `Unmodeled import ${name}`); return load(paths.get(name));
    } }); return exports;
  };
  const authority = load('_lib/accountSessionAuthority.ts'); authority.publishAccountSessionAuthoritySnapshot(state.authority);
  const mutation = load('_lib/accountBoundSupabaseMutation.ts');
  const production = extract('_lib/watchParty.ts', [
    'PARTY_ROOMS_TABLE', 'PARTY_ROOMS_LEGACY_BASE_SELECT', 'PARTY_ROOMS_BASE_SELECT', 'PARTY_ROOMS_POLICY_SELECT', 'PARTY_ROOMS_HOST_SETTINGS_SELECT',
    'normalizeWatchPartyContentSourceType', 'normalizeWatchPartyDiscoveryVisibility', 'isMissingColumnError',
    'toTimeMillis', 'getWatchPartyRoomActivityMillis', 'isWatchPartyRoomActive', 'rowToState', 'fetchPartyRoomRow', 'getPartyRoom',
    'readOwnedPartyRoomForPreparation', 'getOwnedPartyRoomForPreparation', 'refreshOwnedPartyRoomForStart', 'getPartyRoomSnapshot', 'joinPartyRoomSession',
  ]);
  const rules = extract('_lib/roomRules.ts', ['normalizeJoinPolicy', 'normalizeContentAccessRule', 'normalizeReactionsPolicy', 'normalizeCapturePolicy']);
  const scope = { exports: {}, Date, supabase, ...authority, ...mutation, WATCH_PARTY_ROOM_ACTIVE_WINDOW_MILLIS: 15 * 60_000,
    resolvePartyRoomSessionAdmission: async () => state.admissionAllowed ? { source: 'premium' } : null,
    listPartyRoomMemberships: async () => state.memberships,
    upsertMembership: async options => { state.memberships.push(options); return options; }, touchActivePartyRoomHeartbeat: async () => {},
  };
  vm.runInNewContext(ts.transpileModule(`${rules}\n${production}\nObject.assign(exports, { rowToState });`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope);
  const api = scope.exports, expected = api.rowToState(state.stored);
  return { state, api, expected,
    read: () => api.getOwnedPartyRoomForPreparation(expected, state.authority),
    refresh: () => api.refreshOwnedPartyRoomForStart(expected, state.authority, () => state.current),
    join: () => api.joinPartyRoomSession({ partyId: expected.partyId, userId: 'host', role: 'host' }),
    replace(next) {
      state.authority = next; state.token = next ? `token-${next.userId}-${next.sessionGeneration}` : 'signed-out';
      state.authUser = next?.userId ?? ''; if (next) state.tokenOwners.set(state.token, next);
      authority.publishAccountSessionAuthoritySnapshot(next);
    },
    hold(name) { const entered = deferred(), release = deferred(); state.hooks.set(name, async () => { entered.resolve(); await release.promise; }); return { entered: entered.promise, release: release.resolve }; },
  };
}

test('age-expired owned preparation is read-only; acknowledged explicit Start admits the same row through ordinary get and join', async () => {
  const h = harness(); assert.equal(await h.api.getPartyRoom('PARTY42'), null); assert.equal(await h.join(), null);
  assert.equal(await h.api.getPartyRoomSnapshot('PARTY42'), null);
  assert.equal((await h.read()).partyId, 'PARTY42'); assert.equal(h.state.writes.length, 0);
  const refreshed = await h.refresh(); assert.equal(refreshed.partyId, 'PARTY42');
  assert.equal(h.state.writes.length, 1); const write = h.state.writes[0];
  assert.deepEqual(Object.keys(write.payload), ['last_activity_at']); assert.equal(write.authorization, 'Bearer token-a');
  assert.match(write.prefer, /return=representation/);
  assert.equal(write.url.searchParams.get('party_id'), 'eq.PARTY42');
  for (const [key, value] of [['host_user_id', 'host'], ['room_type', 'title'], ['title_id', 'title-a'], ['source_type', 'platform_title'], ['source_id', 'title-a'], ['is_active', 'true'], ['room_generation', h.expected.roomGeneration], ['host_settings_revision', '0']]) {
    assert.equal(write.url.searchParams.get(key), `eq.${value}`);
  }
  assert.equal(write.url.searchParams.get('last_activity_at'), `lte.${write.payload.last_activity_at}`);
  assert.equal((await h.api.getPartyRoom('PARTY42')).partyId, 'PARTY42'); assert.equal((await h.join()).partyId, 'PARTY42');
  assert.equal((await h.api.getPartyRoomSnapshot('PARTY42')).room.lastActivityAt, refreshed.lastActivityAt);
  h.state.admissionAllowed = false; assert.equal(await h.join(), null); assert.equal(h.state.memberships.length, 1);
  h.state.stored.is_active = false; assert.equal(await h.join(), null);
});

for (const [field, value] of [['room_generation', '22222222-2222-4222-8222-222222222222'], ['host_settings_revision', 2]]) {
  test(`Start rejects a same-source pause/restart ABA ${field} before renewing room activity`, async () => {
    const h = harness(), held = h.hold('patch'), pending = h.refresh(); await held.entered;
    h.state.stored[field] = value; const before = h.state.stored.last_activity_at; held.release();
    assert.equal(await pending, null); assert.equal(h.state.stored.last_activity_at, before); assert.equal(h.state.memberships.length, 0);
  });
}

test('creator video renewal filters null title exactly', async () => {
  const h = harness(); Object.assign(h.expected, { titleId: null, sourceType: 'creator_video', sourceId: 'creator-a' });
  Object.assign(h.state.stored, { title_id: null, source_type: 'creator_video', source_id: 'creator-a' });
  assert.ok(await h.refresh()); assert.equal(h.state.writes[0].url.searchParams.get('title_id'), 'is.null');
});

for (const value of [null, 'invalid']) test(`missing or malformed activity (${value}) may be prepared from fallback time but cannot claim a renewal`, async () => {
  const h = harness(); h.state.stored.last_activity_at = value;
  assert.ok(await h.read(), 'valid updated_at can identify the existing active owner row');
  assert.equal(await h.refresh(), null, 'conditional update does not manufacture a matched row for an unusable last_activity_at');
  assert.equal(h.state.stored.last_activity_at, value); assert.equal(h.state.memberships.length, 0);
});

for (const [field, value] of [['is_active', false], ['host_user_id', 'other'], ['party_id', 'OTHER'], ['room_type', 'live'], ['title_id', 'other-title'], ['source_id', 'other-title'], ['source_type', 'creator_video']]) {
  test(`exact owner hydration rejects fresh ${field} mismatch without mutation`, async () => {
    const h = harness(); h.state.stored[field] = value; assert.equal(await h.read(), null); assert.equal(h.state.writes.length, 0);
  });
  test(`terminal or identity transition at PATCH (${field}) affects zero rows and never revives or joins`, async () => {
    const h = harness(); assert.ok(await h.read()); const held = h.hold('patch'), pending = h.refresh(); await held.entered;
    h.state.stored[field] = value; const before = h.state.stored.last_activity_at; held.release();
    assert.equal(await pending, null); assert.equal(h.state.stored.last_activity_at, before); assert.equal(h.state.memberships.length, 0);
  });
}

for (const [field, value] of [['is_active', false], ['is_active', null], ['party_id', 'OTHER'], ['host_user_id', 'other'], ['room_type', 'live'], ['title_id', 'other'], ['source_type', null], ['source_id', 'other'], ['discovery_visibility', 'public'], ['discovery_title', 'other'], ['last_activity_at', 'invalid'], ['last_activity_at', new Date(0).toISOString()]])
  test(`refresh acknowledgement must retain exact ${field} and freshness`, async () => {
    const h = harness(); h.state.ack = row => ({ ...row, [field]: value }); assert.equal(await h.refresh(), null); assert.equal(h.state.memberships.length, 0);
  });

for (const outcome of ['zero-row', 'provider-error', 'lost-response']) test(`${outcome} refresh stays unacknowledged and retries only the same room`, async () => {
  const h = harness(); h.state.response = write => {
    if (outcome === 'zero-row') return json([]);
    if (outcome === 'provider-error') return json({ message: 'unavailable', code: '42501' }, 403);
    h.state.stored = { ...h.state.stored, ...write.payload }; throw Error('response lost after commit');
  };
  assert.equal(await h.refresh(), null); assert.equal(h.state.writes.length, 1); assert.equal(h.state.memberships.length, 0);
  h.state.response = null; assert.ok(await h.refresh()); assert.equal(h.state.writes.length, 2);
  assert.ok(h.state.writes.every(write => write.url.searchParams.get('party_id') === 'eq.PARTY42'));
});

test('newer concurrent heartbeat is not overwritten by a delayed refresh', async () => {
  const h = harness(), held = h.hold('patch'), pending = h.refresh(); await held.entered;
  const newer = new Date(Date.parse(h.state.writes[0].payload.last_activity_at) + 1_000).toISOString();
  h.state.stored.last_activity_at = newer; held.release(); assert.equal(await pending, null); assert.equal(h.state.stored.last_activity_at, newer);
});

for (const stage of ['readback', 'patch']) for (const next of [null, owner('session-b'), owner('session-a', 'other'), { ...owner(), restoreOnly: true }])
  test(`session change at ${stage} retires refresh completion (${next?.userId ?? 'logout'}:${next?.sessionGeneration ?? ''}:${next?.restoreOnly ?? ''})`, async () => {
    const h = harness(), held = h.hold(stage), pending = h.refresh().catch(() => null); await held.entered;
    h.replace(next); held.release(); assert.equal(await pending, null);
    assert.equal(h.state.writes.length, stage === 'patch' ? 1 : 0);
    if (stage === 'patch') assert.equal(h.state.writes[0].authorization, 'Bearer token-a');
  });

for (const stage of ['readback', 'patch']) test(`waiting lifetime retirement at ${stage} suppresses dispatch or completion`, async () => {
  const h = harness(), held = h.hold(stage), pending = h.refresh(); await held.entered; h.state.current = false; held.release();
  assert.equal(await pending, null); assert.equal(h.state.writes.length, stage === 'patch' ? 1 : 0);
});

test('a transport token switch cannot replace the frozen initiating credential', async () => {
  const h = harness(); h.state.hooks.set('transport-token', async () => { h.state.token = 'token-b'; });
  // Initial SDK token hydration is already complete by the preparation read.
  assert.ok(await h.read()); h.state.token = 'token-a';
  h.state.hooks.set('transport-token', async () => { h.state.token = 'token-b'; });
  assert.ok(await h.refresh()); assert.equal(h.state.writes[0].authorization, 'Bearer token-a');
});
