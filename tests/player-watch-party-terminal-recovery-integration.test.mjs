import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.env.PARTY_RECOVERY_SOURCE_ROOT || process.cwd();
const HOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_HOST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TITLE = '11111111-1111-4111-8111-111111111111';
const OTHER_TITLE = '22222222-2222-4222-8222-222222222222';
const owner = (sessionGeneration = 'session-a', userId = HOST) => ({
  userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false,
});
const noop = () => {};
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
const settle = async () => { for (let index = 0; index < 40; index += 1) await Promise.resolve(); };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({
  addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml',
  nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV',
});
doc.documentElement = container();
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};

// Each harness loads the whole production Player hook and watchParty adapter into
// one module graph. React mounts share its real held-creation registry; Supabase's
// real query builders and frozen-token transport cross only the modeled HTTP
// boundary below. No production action, recovery predicate, or latch is copied.
function harness(t) {
  const FocusContext = React.createContext(true);
  const appStateListeners = new Set();
  const state = {
    authority: owner(), token: 'token-a', authUser: HOST,
    tokenOwners: new Map([['token-a', owner()]]), rows: new Map(),
    requests: [], inserts: [], roomReads: [], navigations: [], alerts: [], events: [],
    gates: new Map(), roomRead: row => json(row),
  };
  const checkpoint = async stage => {
    const queue = state.gates.get(stage);
    const gate = queue?.shift();
    if (gate) { gate.entered.resolve(); await gate.release.promise; }
  };
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const request = { method, url, authorization: headers.get('Authorization') };
    state.requests.push(request);
    if (url.pathname.endsWith('/rpc/wave1_session_authority_readback')) {
      assert.equal(method, 'POST');
      const authority = state.tokenOwners.get(request.authorization?.replace(/^Bearer /, ''));
      await checkpoint('authority-readback');
      return json(authority ? { ...authority, authoritative: true } : null);
    }
    if (url.pathname.endsWith('/titles')) {
      assert.equal(method, 'GET');
      const id = url.searchParams.get('id')?.replace(/^eq\./, '') ?? TITLE;
      return json({ id, is_published: true, status: 'published' });
    }
    assert.ok(url.pathname.endsWith('/watch_party_rooms'), `Unexpected endpoint ${url.pathname}`);
    if (method === 'POST') {
      const payload = JSON.parse(init.body);
      state.inserts.push({ ...request, payload });
      // Model a committed insert whose successful acknowledgement is delayed.
      state.rows.set(payload.party_id, { ...payload });
      await checkpoint('insert');
      return json(payload, 201);
    }
    assert.equal(method, 'GET', 'Player recovery must not heartbeat, publish, or mutate an existing room');
    const partyId = url.searchParams.get('party_id')?.replace(/^eq\./, '');
    assert.ok(partyId, 'Recovery must read one exact party ID');
    state.roomReads.push({ ...request, partyId });
    const row = state.rows.get(partyId);
    const snapshot = row ? { ...row } : null;
    const respond = state.roomRead;
    await checkpoint('room-read');
    return respond(snapshot, request);
  };
  const client = createClient('https://party-recovery.invalid', 'fixture-anon-key', {
    accessToken: async () => state.token,
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const supabase = {
    from: client.from.bind(client), rpc: client.rpc.bind(client),
    auth: {
      async getSession() {
        return { data: { session: { access_token: state.token, user: { id: state.authUser } } }, error: null };
      },
      async getUser() { return { data: { user: { id: state.authUser } }, error: null }; },
    },
  };
  const AppState = {
    currentState: 'active',
    addEventListener: (_event, callback) => {
      appStateListeners.add(callback);
      return { remove: () => appStateListeners.delete(callback) };
    },
  };
  const allowed = async () => ({ allowed: true, reason: 'allowed', monetization: { issues: [] } });
  const mocks = {
    react: React,
    'react-native': { Platform: { OS: 'android' }, AppState, Alert: { alert: (...args) => state.alerts.push(args) } },
    'expo-router': {
      router: { push: navigation => state.navigations.push(navigation) },
      useFocusEffect: callback => {
        const focused = React.useContext(FocusContext);
        React.useEffect(() => focused ? callback() : undefined, [callback, focused]);
      },
    },
    '@react-native-async-storage/async-storage': {},
    './supabase': { supabase, SUPABASE_URL: 'https://party-recovery.invalid', SUPABASE_ANON_KEY: 'fixture-anon-key' },
    './logger': { debugLog: noop, reportRuntimeError: noop },
    './analytics': { trackEvent: (...args) => state.events.push(args) },
    './appConfig': {
      readAppConfig: async () => ({}),
      resolveRoomDefaultConfig: () => ({ watchParty: {
        joinPolicy: 'open', reactionsPolicy: 'enabled', contentAccessRule: 'open', capturePolicy: 'best_effort',
      } }),
    },
    './userData': { readUserProfile: async () => ({}) },
    './monetization': {
      readCreatorPermissions: async () => ({}), sanitizeCreatorRoomAccessRule: rule => rule,
    },
    './premiumWatchPartyAccess': {
      requireLiveFirstPremium: allowed, requireWatchPartyLivePremium: allowed,
      isRuntimeControlBlockedAccess: () => false,
      getRuntimeControlBlockedCopy: () => ({ title: 'Unavailable', message: 'Unavailable' }),
      LIVE_FIRST_PREMIUM_UPSELL_COPY: { message: 'Premium required' },
      WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY: { message: 'Premium required' },
    },
    './watchPartyContentSources': {
      getCreatorVideoWatchPartyBlockCopy: () => null, getCreatorVideoWatchPartyBlockReason: () => null,
    },
    './paidWatchPartyTickets': {}, './socialAttachments': {},
  };
  const actual = new Map([
    ['./watchParty', '_lib/watchParty.ts'],
    ['./accountSessionAuthority', '_lib/accountSessionAuthority.ts'],
    ['./accountBoundSupabaseMutation', '_lib/accountBoundSupabaseMutation.ts'],
    ['./accountBoundSupabaseRpc.mjs', '_lib/accountBoundSupabaseRpc.mjs'],
    ['./entitlementAuthority', '_lib/entitlementAuthority.ts'],
    ['./actionSingleFlight.mjs', '_lib/actionSingleFlight.mjs'],
    ['./roomRules', '_lib/roomRules.ts'], ['./publicTitles', '_lib/publicTitles.ts'],
    ['./performancePolicy', '_lib/performancePolicy.ts'],
    ['./watch-party/room-shared', '_lib/watch-party/room-shared.ts'],
    ['./watch-party/watch-party-live-source-truth', '_lib/watch-party/watch-party-live-source-truth.ts'],
  ]);
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const sourcePath = file === '_lib/usePlayerWatchPartyActions.ts' && process.env.PLAYER_ACTION_SOURCE
      ? process.env.PLAYER_ACTION_SOURCE
      : file === '_lib/watchParty.ts' && process.env.PARTY_CREATE_SOURCE
        ? process.env.PARTY_CREATE_SOURCE : path.join(ROOT, file);
    const source = fs.readFileSync(sourcePath, 'utf8');
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText, {
      exports, fetch, URL, Headers, Date, Promise, console, setTimeout, clearTimeout,
      require(id) {
        if (Object.hasOwn(mocks, id)) return mocks[id];
        assert.ok(actual.has(id), `Unmodeled dependency ${file}: ${id}`);
        return load(actual.get(id));
      },
    }, { filename: file });
    return exports;
  }
  const authorityApi = load('_lib/accountSessionAuthority.ts');
  authorityApi.publishAccountSessionAuthoritySnapshot(state.authority);
  const api = load('_lib/watchParty.ts');
  const { usePlayerWatchPartyActions } = load('_lib/usePlayerWatchPartyActions.ts');
  const act = async operation => React.act(async () => { await operation(); await settle(); });
  const mounts = new Set();
  t.after(async () => {
    for (const mount of mounts) await mount.unmount();
    // Supabase may turn thrown fetch errors into returned failures. Check the
    // recorded boundary too, so a swallowed mutation assertion cannot pass.
    for (const { method, url } of state.requests) {
      assert.ok((method === 'GET' && ['/rest/v1/titles', '/rest/v1/watch_party_rooms'].includes(url.pathname))
        || (method === 'POST' && ['/rest/v1/watch_party_rooms', '/rest/v1/rpc/wave1_session_authority_readback'].includes(url.pathname)),
      `Player recovery must not issue unexpected reads or side effects: ${method} ${url.pathname}`);
    }
  });
  async function mount(overrides = {}) {
    let latest;
    let mounted = true;
    const props = {
      cleanId: TITLE, creatorVideo: null, displayItem: { id: TITLE }, hasResolvedPlatformTitle: true,
      inWatchParty: false, isFocused: true, isPlaying: false, isSignedIn: true,
      item: { id: TITLE, title: 'Fixture title' }, localTitle: null, playbackSourceKind: 'title',
      titleId: TITLE, titleLoading: false, currentPositionRef: { current: 17 },
      sessionAuthority: state.authority, ...overrides,
    };
    function Probe() {
      const [gate, setGate] = React.useState(null);
      const [visible, setVisible] = React.useState(false);
      const [retry, setRetry] = React.useState(0);
      const [error, setError] = React.useState(null);
      latest = { ...usePlayerWatchPartyActions({
        ...props, watchPartyPremiumGate: gate, watchPartyPremiumSheetVisible: visible,
        setWatchPartyPremiumGate: setGate, setWatchPartyPremiumSheetVisible: setVisible,
        setWatchPartyEntryRetryToken: setRetry, setWatchPartyEntryError: setError,
      }), gate, visible, retry, error };
      return null;
    }
    const root = createRoot(container());
    const render = () => root.render(React.createElement(FocusContext.Provider,
      { value: props.isFocused }, React.createElement(Probe)));
    await act(render);
    const instance = {
      get current() { return latest; },
      async update(patch) { Object.assign(props, patch); await act(render); },
      async start() { await act(() => latest.onWatchParty()); },
      async beginStart() {
        let promise;
        await act(() => { promise = latest.onWatchParty(); });
        return { promise };
      },
      async unmount() {
        if (!mounted) return;
        mounted = false; await act(() => root.unmount()); mounts.delete(instance);
      },
    };
    mounts.add(instance);
    return instance;
  }
  return {
    state, api, act, mount,
    hold(stage) {
      const gate = { entered: deferred(), release: deferred() };
      const queue = state.gates.get(stage) ?? [];
      queue.push(gate); state.gates.set(stage, queue);
      return { entered: gate.entered.promise, release: gate.release.resolve };
    },
    async authority(next, render = true) {
      state.authority = next; state.authUser = next?.userId ?? '';
      state.token = next ? `token-${next.userId}-${next.sessionGeneration}` : 'signed-out';
      if (next) state.tokenOwners.set(state.token, next);
      await act(() => authorityApi.publishAccountSessionAuthoritySnapshot(next));
      if (render) {
        for (const instance of mounts) await instance.update({ sessionAuthority: next, isSignedIn: !!next });
      }
    },
    async appState(next) {
      await act(() => { AppState.currentState = next; appStateListeners.forEach(callback => callback(next)); });
    },
  };
}

async function retainDelayedCreation(h, retirement = 'blur', props = {}) {
  let player = await h.mount(props);
  const inserted = h.hold('insert');
  const pending = await player.beginStart();
  await inserted.entered;
  assert.equal(h.state.inserts.length, 1);
  const row = h.state.rows.get(h.state.inserts[0].payload.party_id);
  if (retirement === 'unmount') await player.unmount();
  else await player.update({ isFocused: false });
  await h.act(inserted.release);
  await pending.promise;
  assert.equal(h.state.navigations.length, 0, 'Retired creation acknowledgement must not navigate');
  if (retirement === 'unmount') player = await h.mount(props);
  else await player.update({ isFocused: true });
  assert.equal(h.state.inserts.length, 1, 'Returning to Player must not implicitly create');
  assert.equal(h.state.roomReads.length, 0, 'Recovery requires a fresh explicit Start');
  return { player, row };
}

function assertExactNavigation(h, row) {
  assert.equal(h.state.navigations.length, 1);
  const navigation = h.state.navigations[0];
  assert.equal(navigation.pathname, '/watch-party');
  assert.equal(navigation.params.roomId, row.party_id);
  assert.equal(navigation.params.sourceType, row.source_type);
  assert.equal(navigation.params.sourceId, row.source_id);
  if (row.source_type === 'platform_title') assert.equal(navigation.params.titleId, row.title_id);
}

for (const retirement of ['blur', 'unmount']) {
  test(`whole production Player replaces an exact terminal held creation after ${retirement}`, async t => {
    const h = harness(t), { player, row } = await retainDelayedCreation(h, retirement);
    row.is_active = false;
    await player.start();
    assert.equal(h.state.inserts.length, 2);
    const replacement = h.state.inserts[1].payload;
    assert.notEqual(replacement.party_id, row.party_id);
    assert.equal(replacement.host_user_id, HOST);
    assert.equal(h.state.inserts[1].authorization, 'Bearer token-a');
    assertExactNavigation(h, replacement);
    await player.start(); await player.start();
    assert.equal(h.state.inserts.length, 2, 'Repeated Start must not create again after accepted navigation');
    assert.equal(h.state.navigations.length, 1);
    assert.deepEqual(h.state.roomReads.map(read => read.partyId), [row.party_id]);
  });
}

for (const age of ['recent', 'age-expired']) {
  test(`whole production Player resumes its exact ${age} active preparation without another insert`, async t => {
    const h = harness(t), { player, row } = await retainDelayedCreation(h, 'unmount');
    if (age === 'age-expired') {
      const expired = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      row.last_activity_at = expired; row.updated_at = expired; row.started_at = expired;
      assert.equal(await h.api.getPartyRoom(row.party_id), null, 'General discovery still hides age-expired rooms');
    }
    const before = JSON.stringify(row);
    await player.start();
    assert.equal(h.state.inserts.length, 1);
    assertExactNavigation(h, row);
    assert.equal(JSON.stringify(row), before, 'Player resume must not renew, publish, or modify the old preparation');
  });
}

for (const timestamps of [null, 'invalid']) {
  test(`explicit terminal state recovers even with ${timestamps === null ? 'missing' : 'malformed'} activity timestamps`, async t => {
    const h = harness(t), { player, row } = await retainDelayedCreation(h);
    row.is_active = false;
    row.last_activity_at = timestamps; row.updated_at = timestamps; row.started_at = timestamps;
    await player.start();
    assert.equal(h.state.inserts.length, 2);
    assertExactNavigation(h, h.state.inserts[1].payload);
  });
}

const unknownReads = [
  ['null', () => json(null)],
  ['missing row', () => json([])],
  ['RLS denied', () => json({ code: '42501', message: 'row-level security denied' }, 403)],
  ['transient HTTP failure', () => json({ message: 'temporarily unavailable' }, 503)],
  ['transport failure', () => { throw new Error('read connection lost'); }],
  ['wrong party', row => json({ ...row, party_id: 'OTHER-PARTY' })],
  ['wrong host', row => json({ ...row, host_user_id: OTHER_HOST })],
  ['wrong source type', row => json({ ...row, source_type: 'creator_video' })],
  ['wrong source ID', row => json({ ...row, source_id: OTHER_TITLE })],
  ['wrong title', row => json({ ...row, title_id: OTHER_TITLE })],
  ['wrong room type', row => json({ ...row, room_type: 'live' })],
  ['missing active state', row => { const copy = { ...row }; delete copy.is_active; return json(copy); }],
  ['null active state', row => json({ ...row, is_active: null })],
  ['missing source type', row => { const copy = { ...row }; delete copy.source_type; return json(copy); }],
  ['missing source ID', row => { const copy = { ...row }; delete copy.source_id; return json(copy); }],
  ['active row without timestamps', row => json({ ...row, is_active: true,
    last_activity_at: null, updated_at: null, started_at: null })],
  ['active row with malformed timestamps', row => json({ ...row, is_active: true,
    last_activity_at: 'invalid', updated_at: 'invalid', started_at: 'invalid' })],
  ['legacy schema fallback without source identity', (row, request) => {
    if (request.url.searchParams.get('select').includes('source_type')) {
      return json({ code: '42703', message: 'column source_type does not exist' }, 400);
    }
    const legacy = { ...row }; delete legacy.source_type; delete legacy.source_id;
    return json(legacy);
  }],
];
for (const [name, respond] of unknownReads) {
  test(`whole production Player retains the held creation on ${name}`, async t => {
    const h = harness(t), { player, row } = await retainDelayedCreation(h);
    row.is_active = false;
    h.state.roomRead = respond;
    await player.start(); await player.start();
    assert.equal(h.state.inserts.length, 1, 'Unknown readback must never authorize a duplicate');
    assert.equal(h.state.navigations.length, 0);
    assert.ok(h.state.alerts.length >= 2);
    h.state.roomRead = row => json(row);
    await player.start();
    assert.equal(h.state.inserts.length, 2, 'A later exact terminal read may recover the retained record');
    assertExactNavigation(h, h.state.inserts[1].payload);
  });
}

test('creator-video terminal recovery keeps the exact creator source and null platform title', async t => {
  const h = harness(t);
  const { player, row } = await retainDelayedCreation(h, 'unmount', {
    playbackSourceKind: 'creator-video', creatorVideo: { id: 'creator-source' }, item: null,
  });
  assert.equal(row.source_type, 'creator_video'); assert.equal(row.title_id, null);
  row.is_active = false;
  await player.start();
  assert.equal(h.state.inserts.length, 2);
  assert.equal(h.state.inserts[1].payload.title_id, null);
  assert.equal(h.state.inserts[1].payload.source_id, 'creator-source');
  assertExactNavigation(h, h.state.inserts[1].payload);
  assert.equal(h.state.navigations[0].params.titleId, undefined);
});

test('same-turn repeated Start during terminal readback permits only one replacement', async t => {
  const h = harness(t), { player, row } = await retainDelayedCreation(h);
  row.is_active = false;
  const read = h.hold('room-read');
  const first = await player.beginStart();
  await read.entered;
  const duplicate = await player.beginStart();
  assert.equal(h.state.roomReads.length, 1);
  await h.act(read.release);
  await Promise.all([first.promise, duplicate.promise]);
  assert.equal(h.state.inserts.length, 2);
  assertExactNavigation(h, h.state.inserts[1].payload);
});

for (const replacementState of ['pending', 'already navigated']) {
  test(`overlapping terminal reads on simultaneous mounts cannot consume the ${replacementState} replacement`, async t => {
    const h = harness(t), { player: firstPlayer, row } = await retainDelayedCreation(h, 'unmount');
    row.is_active = false;
    const secondPlayer = await h.mount();
    const firstRead = h.hold('room-read'), secondRead = h.hold('room-read');
    const first = await firstPlayer.beginStart(); await firstRead.entered;
    const second = await secondPlayer.beginStart(); await secondRead.entered;
    assert.equal(h.state.roomReads.length, 2, 'Both mounts must overlap on the same old terminal record');
    const replacementInsert = h.hold('insert');
    await h.act(firstRead.release); await replacementInsert.entered;
    assert.equal(h.state.inserts.length, 2);
    if (replacementState === 'already navigated') {
      await h.act(replacementInsert.release); await first.promise;
    }
    await h.act(secondRead.release); await second.promise;
    assert.equal(h.state.inserts.length, 2, 'Stale terminal read must not retire a replacement held record');
    if (replacementState === 'pending') {
      const repeated = await secondPlayer.beginStart(); await repeated.promise;
      assert.equal(h.state.inserts.length, 2, 'Fresh Start must also honor the replacement still pending');
      await h.act(replacementInsert.release); await first.promise;
    }
    assertExactNavigation(h, h.state.inserts[1].payload);
  });
}

test('overlapping active recovery reads on simultaneous mounts navigate the exact room only once', async t => {
  const h = harness(t), { player: firstPlayer, row } = await retainDelayedCreation(h, 'unmount');
  const secondPlayer = await h.mount();
  const firstRead = h.hold('room-read'), secondRead = h.hold('room-read');
  const first = await firstPlayer.beginStart(); await firstRead.entered;
  const second = await secondPlayer.beginStart(); await secondRead.entered;
  assert.equal(h.state.roomReads.length, 2);
  await h.act(firstRead.release); await first.promise;
  assertExactNavigation(h, row);
  await h.act(secondRead.release); await second.promise;
  assert.equal(h.state.inserts.length, 1);
  assertExactNavigation(h, row);
});

const retirements = [
  ...['session', 'account', 'title', 'blur', 'background', 'unmount'].map(retirement => [retirement, false]),
  ...['session', 'account', 'title', 'signout'].map(retirement => [retirement, true]),
];
for (const [retirement, restoreBeforeResponse] of retirements) {
  test(`pending terminal recovery cannot clear, mutate, or navigate after ${retirement} ${restoreBeforeResponse ? 'ABA before response' : 'changes'}`, async t => {
    const h = harness(t), retained = await retainDelayedCreation(h);
    let player = retained.player;
    const { row } = retained;
    row.is_active = false;
    const read = h.hold('room-read');
    const pending = await player.beginStart(); await read.entered;
    // Authority ABA deliberately does not rerender Player. Only its real
    // subscription can invalidate a transient authority event before React
    // observes a new props snapshot. Title ABA does exercise actual rerenders.
    if (retirement === 'session') await h.authority(owner('session-b'), !restoreBeforeResponse);
    if (retirement === 'account') await h.authority(owner('session-b', OTHER_HOST), !restoreBeforeResponse);
    if (retirement === 'signout') await h.authority(null, !restoreBeforeResponse);
    if (retirement === 'title') await player.update({
      cleanId: OTHER_TITLE, titleId: OTHER_TITLE, item: { id: OTHER_TITLE }, displayItem: { id: OTHER_TITLE },
    });
    if (retirement === 'blur') await player.update({ isFocused: false });
    if (retirement === 'background') await h.appState('background');
    if (retirement === 'unmount') await player.unmount();
    const restore = async () => {
      if (retirement === 'session' || retirement === 'account' || retirement === 'signout') {
        await h.authority(owner(), !restoreBeforeResponse);
      }
      if (retirement === 'title') await player.update({
        cleanId: TITLE, titleId: TITLE, item: { id: TITLE }, displayItem: { id: TITLE },
      });
      if (retirement === 'blur') await player.update({ isFocused: true });
      if (retirement === 'background') await h.appState('active');
      if (retirement === 'unmount') player = await h.mount();
    };
    if (restoreBeforeResponse) await restore();
    await h.act(read.release); await pending.promise;
    assert.equal(h.state.inserts.length, 1);
    assert.equal(h.state.navigations.length, 0);
    if (!restoreBeforeResponse) await restore();
    h.state.roomRead = () => json(null);
    await player.start();
    assert.equal(h.state.inserts.length, 1, 'Retired recovery must not have removed the old held record');
    assert.equal(h.state.navigations.length, 0);
    h.state.roomRead = row => json(row);
    await player.start();
    assert.equal(h.state.inserts.length, 2);
    assertExactNavigation(h, h.state.inserts[1].payload);
  });
}
