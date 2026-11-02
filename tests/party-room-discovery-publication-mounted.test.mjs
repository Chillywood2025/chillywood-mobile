import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: document, parentNode: null, tagName: 'DIV' });
document.documentElement = container(); globalThis.document = document; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const authority = (id = 'host', generation = 'session-a') => ({ userId: id, accountId: id, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const same = (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.state === b.state && a.restoreOnly === b.restoreOnly;
const room = () => ({ partyId: 'PARTY42', hostUserId: 'host', roomType: 'title', roomGeneration: 'generation-a', hostSettingsRevision: 0, joinPolicy: 'open', sourceType: 'platform_title', sourceId: 'title-a', discoveryVisibility: 'public', discoveryPaused: false, discoveryTitle: 'Tonight', isActive: true });
const member = () => ({ partyId: 'PARTY42', userId: 'host', role: 'host', membershipState: 'active', lastSeenAt: new Date().toISOString(), leftAt: null });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const result = changes => ({ partyId: 'PARTY42', roomType: 'title', roomGeneration: 'generation-a', settingsRevision: 0, joinPolicy: 'open', sourceType: 'platform_title', sourceId: 'title-a', visibility: 'public', discoveryPaused: false, title: 'Tonight', published: true, startedAt: new Date().toISOString(), projectionId: 'projection-a', ...changes });
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };

async function mount(t, { start = true, joined = true, server, bootstrapJoin = null } = {}) {
  const state = { authority: authority(), room: room(), stored: room(), member: joined ? member() : null, active: true, startIntent: '', calls: [], server, view: null };
  if (bootstrapJoin) state.active = false;
  const appListeners = new Set(), accountListeners = new Set();
  const AppState = { currentState: 'active', addEventListener: (_, fn) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } };
  const account = { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same,
    subscribeToAccountSessionAuthority: fn => { accountListeners.add(fn); return () => accountListeners.delete(fn); } };
  // Execute the production RPC wrappers unchanged. Only transport/session reads
  // are provided at the boundary; payload construction and response rejection
  // are the real watchParty.ts functions, not a test reimplementation.
  const source = fs.readFileSync('_lib/watchParty.ts', 'utf8');
  const ast = ts.createSourceFile('watchParty.ts', source, ts.ScriptTarget.Latest, true);
  const names = new Set(['readOwnedPartyRoomForPreparation', 'getOwnedPartyRoomForPreparation', 'writePartyRoomDiscovery', 'setPartyRoomDiscoverySettings', 'publishPartyRoomDiscovery']);
  const production = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n');
  assert.equal(production.match(/(?:export )?async function /g).length, 5);
  const rpcScope = { exports: {}, getPartyRoom: async () => state.stored,
    getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same,
    // This mounted publication suite models room reads; the separate prepared-owner
    // suite executes actual raw-row fetch/conversion/activity filtering.
    fetchPartyRoomRow: async () => state.stored ? {
      ...state.stored, is_active: state.stored.isActive,
      party_id: state.stored.partyId, host_user_id: state.stored.hostUserId, room_type: state.stored.roomType,
      title_id: state.stored.titleId, source_type: state.stored.sourceType, source_id: state.stored.sourceId,
      last_activity_at: new Date().toISOString(),
    } : null,
    toTimeMillis: value => { const millis = Date.parse(String(value ?? '')); return Number.isFinite(millis) ? millis : null; },
    rowToState: value => value,
    assertAccountBoundSupabaseMutationSubjectCurrent(subject) {
      if (!same(subject.authority, state.authority)) throw Error('account_changed');
    },
    captureAccountBoundSupabaseMutationSubject: async () => ({ authority: state.authority }),
    async invokeAccountBoundSupabaseMutationRpc(subject, name, args) {
      if (!same(subject.authority, state.authority)) throw Error('account_changed');
      state.calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
      const data = state.server ? await state.server({ name, args }) : result({ visibility: args.p_discovery_visibility, discoveryPaused: args.p_discovery_paused, title: args.p_discovery_title,
        published: args.p_publish && args.p_discovery_visibility !== 'private' && !args.p_discovery_paused });
      if (!same(subject.authority, state.authority)) throw Error('account_changed');
      return { data, error: null };
    } };
  vm.runInNewContext(ts.transpileModule(production, { compilerOptions }).outputText, rpcScope);
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const scope = { exports: {}, Date, setTimeout, clearTimeout, require(name) {
      if (name === 'react') return React;
      if (name === 'react-native') return { AppState };
      if (name === './accountSessionAuthority') return account;
      if (name === './session') return { useSession: () => ({ authority: state.authority, authorityStatus: 'active' }) };
      if (name === './watchParty') return { ...rpcScope.exports, getPartyRoom: rpcScope.getPartyRoom };
      if (name === './accountBoundSupabaseMutation') return rpcScope;
      if (name === './watchPartyHostSettings') return load('_lib/watchPartyHostSettings.ts');
      if (name === './partyRoomStartIntent') return load('_lib/partyRoomStartIntent.ts');
      throw Error(`unmodeled production dependency ${name}`);
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions }).outputText, scope);
    modules.set(path, scope.exports); return scope.exports;
  }
  rpcScope.setWatchPartyHostSettings = (...args) => load('_lib/watchPartyHostSettings.ts').setWatchPartyHostSettings(...args);
  const intents = load('_lib/partyRoomStartIntent.ts');
  if (start) state.startIntent = intents.rememberPartyRoomStartIntent(state.room, state.authority);
  const { usePartyRoomDiscoveryPublication } = load('_lib/usePartyRoomDiscoveryPublication.ts');
  let bootstrapEffect = null;
  if (bootstrapJoin) {
    // Run the complete real Party Room bootstrap effect unchanged alongside the
    // real publication hook. This verifies its loading/join boundary; it does
    // not claim a complete native screen or real server/media execution.
    const screen = fs.readFileSync('app/watch-party/[partyId].tsx', 'utf8');
    const screenAst = ts.createSourceFile('room.tsx', screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const effects = [];
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(screenAst) === 'useEffect'
        && node.arguments[0]?.getText(screenAst).includes('const bootstrap = async')) effects.push(node.arguments[0]);
      ts.forEachChild(node, visit);
    }
    visit(screenAst); assert.equal(effects.length, 1);
    const membershipMapRef = { current: {} };
    const snapshot = () => ({ room: state.room, memberships: state.member ? [state.member] : [] });
    state.lifecycle = [];
    const ref = value => ({ current: value });
    const context = {
      canUseBetaRoom: true, partyId: 'PARTY42', authority: state.authority,
      setLoading(value) { state.lifecycle.push(`loading:${value}`); state.active = !value; root.render(React.createElement(Harness)); },
      setNotFound: noop, setConnState: noop, setAccessGate: noop, setBlockedRoomAccess: noop, setPaidTicketGate: noop,
      clearUnavailableRoom: noop, setVerifiedRoomOwner: noop,
      subscribeToLiveUpdates: () => noop,
      setPaidTicketNotice: noop, setAccessSheetVisible: noop, setRoom: noop, setTitleName: noop, setSourceAttribution: noop, setMessages: noop,
      readUserProfile: async () => ({ username: 'Host' }), getSafePartyUserId: async () => 'host',
      getPartyRoomSnapshot: async () => snapshot(), resolvePaidWatchPartyTicketAccess: async () => ({ allowed: true, reason: 'free_room' }),
      paidWatchPartyResolutionIsExactFreeRoom: value => value.reason === 'free_room',
      resolvePremiumAccessKeyForRoom: () => 'PARTY42', requireWatchPartyLivePremium: async () => ({ allowed: true }),
      requireLiveFirstPremium: async () => ({ allowed: true }), isRuntimeControlBlockedAccess: () => false,
      resolveRoomAccess: async () => ({ isAllowed: true }),
      syncRoomFromSnapshot(value) { for (const m of value.memberships) membershipMapRef.current[m.userId] = m; },
      async joinPartyRoomSession(options) {
        state.lifecycle.push('join:started'); assert.equal(options.role, 'host');
        const joinedMembership = await bootstrapJoin(); state.lifecycle.push('join:completed');
        state.member = joinedMembership; return joinedMembership;
      },
      async refreshRoomSnapshot() { if (state.member) membershipMapRef.current.host = state.member; return snapshot(); },
      resolveWatchPartyContentDisplay: async () => ({ displayName: 'Title' }), resolveWatchPartySourceType: () => 'platform_title',
      resolveWatchPartySourceId: () => 'title-a', readWatchPartyContentDisplayHandoff: () => null,
      resolveIdentityName: value => value, isAccessSheetReason: () => false, trackEvent: noop,
      myUserIdRef: ref(null), myProfileUsernameRef: ref(''), myCameraPreviewUrlRef: ref(''), myRoleRef: ref('host'),
      paidTicketAuthoritySeenRef: ref(false), membershipMapRef, pollRef: ref(null), heartbeatRef: ref(null),
      chatChannelRef: ref(null), roomChatRealtimeChannelRef: ref(null), roomRealtimeChannelRef: ref(null), participantReactionTimeoutsRef: ref({}),
      roomChannelRetirementRef: ref(null),
      ROOM_SNAPSHOT_REFRESH_MS: 15000, ROOM_HEARTBEAT_INTERVAL_MILLIS: 15000,
      setInterval: () => 1, clearInterval: noop, clearTimeout: noop,
      saveLastPartySession: async () => {}, startChatChannel: noop, startRoomRealtimeSync: noop, startRoomChatRealtimeSync: noop,
      reportRuntimeError: (_, error) => { throw error; },
      prepareLiveKitJoinBoundary: () => assert.fail('bootstrap must not wait for media-token readiness before publication'),
      supabase: { auth: { getUser: async () => ({ data: { user: {} } }) }, from: () => {
        const query = Object.fromEntries(['select', 'eq', 'order', 'limit'].map(name => [name, () => query]));
        query.returns = async () => ({ data: [] }); return query;
      } },
    };
    context.roomAuthority = load('_lib/roomSnapshotAuthority.ts').createRoomSnapshotAuthority({
      partyId: 'PARTY42', userId: 'host', current: () => true, unavailable: noop, read: async () => snapshot(),
    });
    vm.runInNewContext(ts.transpileModule(`globalThis.effect = ${effects[0].getText(screenAst)}`, { compilerOptions }).outputText, context);
    bootstrapEffect = context.effect;
  }
  function Harness() {
    state.view = usePartyRoomDiscoveryPublication({ room: state.room, membership: state.member, active: state.active, startIntent: state.startIntent, confirmedHostSettings: state.confirmed });
    React.useEffect(() => bootstrapEffect?.(), []);
    return null;
  }
  const root = createRoot(container());
  const render = async () => React.act(async () => { root.render(React.createElement(Harness)); for (let i = 0; i < 20; i++) await Promise.resolve(); });
  await render(); t.after(() => React.act(async () => root.unmount()));
  return { state, render, rpc: rpcScope.exports, intents,
    async mutate(change) { await React.act(async () => { change(); root.render(React.createElement(Harness)); for (let i = 0; i < 20; i++) await Promise.resolve(); }); },
    async resolve(d, value) { await React.act(async () => { d.resolve(value); for (let i = 0; i < 20; i++) await Promise.resolve(); }); },
    async retry() { await React.act(async () => { void state.view.retry(); for (let i = 0; i < 20; i++) await Promise.resolve(); }); },
    async account(next) { await React.act(async () => { state.authority = next; for (const fn of accountListeners) fn(next); root.render(React.createElement(Harness)); }); },
    async app(value) { await React.act(async () => { AppState.currentState = value; for (const fn of [...appListeners]) fn(value); root.render(React.createElement(Harness)); }); },
  };
}

test('only explicit Start plus actual joined host publishes, with exact session/source RPC fields', async t => {
  const h = await mount(t, { joined: false }); assert.equal(h.state.calls.length, 0);
  await h.mutate(() => { h.state.member = member(); });
  assert.equal(h.state.view.status, 'published'); assert.equal(h.state.calls.length, 1);
  assert.deepEqual(h.state.calls[0], { name: 'set_watch_party_room_host_settings', args: {
    p_party_id: 'PARTY42', p_expected_source_type: 'platform_title', p_expected_source_id: 'title-a', p_session_generation: 'session-a',
    p_expected_room_generation: 'generation-a', p_expected_settings_revision: 0, p_join_policy: 'open', p_discovery_visibility: 'public', p_discovery_paused: false, p_discovery_title: 'Tonight', p_publish: true, p_allow_owner_discovery: false,
  } });
  await h.render(); await h.retry(); assert.equal(h.state.calls.length, 1);
});

test('actual Party Room bootstrap completes normal host join and clears loading before publication without awaiting media readiness', async t => {
  const joining = deferred();
  const h = await mount(t, { joined: false, bootstrapJoin: () => joining.promise });
  assert.deepEqual(h.state.lifecycle, ['loading:true', 'join:started']); assert.equal(h.state.calls.length, 0);
  await h.resolve(joining, member());
  assert.deepEqual(h.state.lifecycle, ['loading:true', 'join:started', 'join:completed', 'loading:false']);
  assert.equal(h.state.calls.length, 1); assert.equal(h.state.calls[0].name, 'set_watch_party_room_host_settings');
  assert.equal(h.state.view.status, 'published');
});

test('prepared/direct viewer route cannot manufacture Start from a query string', async t => {
  const h = await mount(t, { start: false });
  await h.mutate(() => { h.state.startIntent = 'party-start-forged'; });
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.view.canRetry, false);
  assert.match(h.state.view.message, /Return to the waiting room/);
});

test('fresh joined membership tolerates small server clock skew but rejects stale or implausible times', async t => {
  const h = await mount(t, { joined: false });
  for (const offset of [-60_000, 60_000]) {
    await h.mutate(() => { h.state.member = { ...member(), lastSeenAt: new Date(Date.now() + offset).toISOString() }; });
    assert.equal(h.state.calls.length, 0);
  }
  await h.mutate(() => { h.state.member = { ...member(), lastSeenAt: new Date(Date.now() + 2_000).toISOString() }; });
  assert.equal(h.state.calls.length, 1); assert.equal(h.state.view.status, 'published');
});

test('normal private Party and audience-only save do not publish', async t => {
  const h = await mount(t, { start: false });
  h.state.stored = { ...room(), discoveryVisibility: 'private' };
  h.state.server = () => result({ visibility: 'private', published: false, startedAt: null, projectionId: null });
  const saved = await h.rpc.setPartyRoomDiscoverySettings('PARTY42', { discoveryVisibility: 'private', discoveryTitle: 'Tonight' }, h.state.stored);
  assert.equal(saved.discoveryVisibility, 'private'); assert.equal(h.state.calls.length, 1);
  assert.equal(h.state.calls[0].name, 'set_watch_party_room_host_settings'); assert.equal(h.state.calls[0].args.p_publish, false);
  assert.equal(h.intents.rememberPartyRoomStartIntent(h.state.stored, h.state.authority), null);
});

test('paused Circle has no Start publication intent or retry, while real room entry remains separate', async t => {
  const h = await mount(t, { start: false });
  await h.mutate(() => { h.state.room = { ...room(), discoveryVisibility: 'circle', discoveryPaused: true }; h.state.stored = h.state.room; });
  assert.equal(h.intents.rememberPartyRoomStartIntent(h.state.room, h.state.authority), null);
  await h.retry(); assert.equal(h.state.calls.length, 0); assert.equal(h.state.view.canRetry, false);
  assert.match(h.state.view.message, /Circle-only entry is unchanged/);
});

test('pause then resume cannot accept an old Start intent at a newer settings revision', async t => {
  const h = await mount(t, { joined: false });
  await h.mutate(() => { h.state.room = { ...h.state.room, discoveryPaused: true, hostSettingsRevision: 1 }; });
  await h.mutate(() => { h.state.room = { ...h.state.room, discoveryPaused: false, hostSettingsRevision: 2 }; h.state.member = member(); });
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.view.status, 'failed');
});

test('explicit null title clears saved metadata without creating a listing', async t => {
  const h = await mount(t, { start: false }); h.state.server = () => result({ title: null, settingsRevision: 1, published: false, startedAt: null, projectionId: null });
  const saved = await h.rpc.setPartyRoomDiscoverySettings('PARTY42', { discoveryVisibility: 'public', discoveryPaused: false, discoveryTitle: null }, room());
  assert.equal(saved.discoveryTitle, null); assert.equal(h.state.calls[0].args.p_discovery_title, null);
  assert.equal(h.state.calls[0].name, 'set_watch_party_room_host_settings');
});

test('publication failure is visible and retry is single-flight through the same room', async t => {
  const h = await mount(t, { server: () => null }); assert.equal(h.state.view.status, 'failed');
  assert.equal(h.state.view.canRetry, true);
  const d = deferred(); h.state.server = () => d.promise;
  await h.retry(); await h.retry(); assert.equal(h.state.calls.length, 2);
  await h.resolve(d, result()); assert.equal(h.state.view.status, 'published');
});

for (const mutation of ['account', 'generation', 'source', 'private', 'ended', 'membership']) test(`held publication cannot claim success after ${mutation} changes`, async t => {
  const d = deferred(), h = await mount(t, { server: () => d.promise });
  if (mutation === 'account') await h.account(authority('other'));
  else if (mutation === 'generation') await h.account(authority('host', 'session-b'));
  else await h.mutate(() => {
    if (mutation === 'source') h.state.room = { ...h.state.room, sourceId: 'replacement' };
    if (mutation === 'private') h.state.room = { ...h.state.room, discoveryVisibility: 'private' };
    if (mutation === 'ended') h.state.room = { ...h.state.room, isActive: false };
    if (mutation === 'membership') h.state.member = { ...member(), membershipState: 'left', leftAt: new Date().toISOString() };
  });
  await h.resolve(d, result()); assert.notEqual(h.state.view.status, 'published');
  assert.equal(h.state.calls.length, 1);
});

test('background invalidates a held result and requires an explicit fresh retry', async t => {
  const d = deferred(), h = await mount(t, { server: () => d.promise });
  await h.app('background'); await h.app('active'); await h.resolve(d, result());
  assert.equal(h.state.view.status, 'failed'); assert.equal(h.state.calls.length, 1);
  h.state.server = () => result(); await h.retry(); assert.equal(h.state.calls.length, 2); assert.equal(h.state.view.status, 'published');
});

test('leaving the room screen retires a held publication result until explicit retry', async t => {
  const d = deferred(), h = await mount(t, { server: () => d.promise });
  await h.mutate(() => { h.state.active = false; });
  await h.resolve(d, result()); assert.notEqual(h.state.view.status, 'published');
  await h.mutate(() => { h.state.active = true; });
  assert.equal(h.state.view.status, 'failed'); assert.equal(h.state.calls.length, 1);
});

test('already-confirmed state is hidden when current host membership is no longer active', async t => {
  const h = await mount(t); assert.equal(h.state.view.status, 'published');
  await h.mutate(() => { h.state.member = { ...member(), membershipState: 'left' }; });
  assert.notEqual(h.state.view.status, 'published');
});

for (const [field, value] of [['sourceId', 'replacement'], ['hostUserId', 'other'], ['discoveryVisibility', 'private'], ['isActive', false]])
  test(`fresh room ${field} change blocks RPC before dispatch`, async t => {
    const h = await mount(t, { start: false }); h.state.stored = { ...room(), [field]: value };
    assert.equal(await h.rpc.publishPartyRoomDiscovery(room()), null); assert.equal(h.state.calls.length, 0);
  });

for (const [field, value] of [['partyId', 'wrong'], ['sourceId', 'wrong'], ['sourceType', 'creator_video'], ['visibility', 'circle'], ['projectionId', null], ['startedAt', null]])
  test(`RPC ${field} mismatch cannot confirm publication`, async t => {
    const h = await mount(t, { server: () => result({ [field]: value }) }); assert.equal(h.state.view.status, 'failed');
  });

test('actual Party Room screen supplies membership/access/lifecycle state and visible retry', () => {
  const source = fs.readFileSync('app/watch-party/[partyId].tsx', 'utf8');
  assert.match(source, /usePartyRoomDiscoveryPublication\(\{/);
  assert.match(source, /membership: roomAuthority\.current\(\) && verifiedRoomOwner === roomAuthority && room\?\.hostUserId \? membershipMapRef\.current\[room\.hostUserId\]/);
  assert.match(source, /active: isFocused && partyRoomAppState === "active" && !loading && !notFound/);
  assert.match(source, /!accessGate && !blockedRoomAccess && isSignedIn/);
  assert.match(source, /testID="party-room-discovery-retry"/);
});

test('explicit owner consent-only acknowledgement replaces failed Start without a new audience revision', async t => {
  const h = await mount(t, { server: () => null }); assert.equal(h.state.view.status, 'failed');
  await h.mutate(() => { h.state.confirmed = { room: h.state.room, authority: h.state.authority,
    published: true, ownerDiscoveryConsent: true, projectionId: 'projection-a' }; });
  assert.equal(h.state.view.status, 'published'); assert.equal(h.state.calls.length, 1, 'acknowledged in-room publication is not republished');
});
