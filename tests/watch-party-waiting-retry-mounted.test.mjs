import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createActionSingleFlightLatch } from '../_lib/actionSingleFlight.mjs';
import { resolvePreparedWatchPartyRoomReuse } from '../_lib/watchPartyPreparedRoomReuse.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container();
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
const source = fs.readFileSync(process.env.WATCH_PARTY_SCREEN_SOURCE ?? new URL('../app/watch-party/index.tsx', import.meta.url), 'utf8');
// Execute the complete production screen with real React hooks. Capture its actual JSX
// instead of rendering native views; no event handler or ownership predicate is copied.
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  transformers: { before: [context => root => ts.visitEachChild(root, node => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== 'WatchPartyIndexScreen') return node;
    const visit = statement => {
      if (ts.isFunctionLike(statement)) return statement;
      if (ts.isReturnStatement(statement) && statement.expression) return ts.factory.updateReturnStatement(statement,
        ts.factory.createCallExpression(ts.factory.createIdentifier('capture'), undefined, [statement.expression]));
      return ts.visitEachChild(statement, visit, context);
    };
    return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type,
      ts.factory.updateBlock(node.body, node.body.statements.map(visit)));
  }, context)] },
}).outputText;
const owner = (id = 'host', generation = 'session-a') => ({ userId: id, accountId: id, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const room = (id = 'ROOM01') => ({ partyId: id, roomCode: id, hostUserId: 'host', roomType: 'live', isActive: true, status: 'active', joinPolicy: 'open', contentAccessRule: 'open', discoveryVisibility: 'private', discoveryTitle: null, titleId: null, sourceType: null, sourceId: null, lastActivityAt: new Date().toISOString() });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const sheetSource = fs.readFileSync(new URL('../components/monetization/access-sheet.tsx', import.meta.url), 'utf8');
const sheetAst = ts.createSourceFile('access-sheet.tsx', sheetSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let sheetPrimary;
const findSheetPrimary = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(sheetAst) === 'onPrimaryPress') sheetPrimary = node.initializer.arguments[0];
  ts.forEachChild(node, findSheetPrimary);
};
findSheetPrimary(sheetAst); assert.ok(sheetPrimary, 'actual AccessSheet primary declaration exists');
const activeSheetContinue = async onPurchaseResult => {
  // This composition witness holds the sheet's local lifetime current; the
  // complete mounted AccessSheet suite separately exercises its retirement and
  // single-flight ownership. The actual primary callback still calls this screen.
  const scope = { renderDeferredUnavailable: false, isPremiumGateSheet: true, freshGateEntitled: true,
    beginAction: () => ({ current: () => true, finish: noop }),
    freshGateEntitledTargetId: 'premium', sheetState: { snapshot: {} }, setLoadingState: noop, setStatusMessage: noop,
    setStatusTone: noop, onPurchaseResult, onCloseTracked: () => assert.fail('current sheet must invoke its parent recheck') };
  vm.runInNewContext(ts.transpileModule(`globalThis.primary = ${sheetPrimary.getText(sheetAst)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope);
  await scope.primary();
};
const walk = (tree, predicate) => {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(value => walk(value, predicate));
  return [...(predicate(tree) ? [tree] : []), ...walk(tree.props?.children, predicate)];
};
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

async function mount(t, { normal = false, prepared = true, viewer = false, roomReader = null, age = 0, offers = [], checkoutAvailable = false, offerSave = null, offerRead = null, setupSave = null } = {}) {
  let tree;
  const runtime = { authority: owner(), focused: true, room: room(), params: { mode: 'live', partyId: 'ROOM01' }, premiumAllowed: true,
    reads: [], preparedReads: [], refreshes: [], writes: [], premium: [], navigations: [], alerts: [], policy: null, gate: null, userReader: null,
    offers, paidWrites: [], setupWrites: [], checkoutCalls: 0 };
  if (normal) {
    runtime.room = { ...room(), roomType: 'title', titleId: 'title-a', sourceType: 'platform_title', sourceId: 'title-a' };
    runtime.params = { source: 'player', titleId: 'title-a', sourceType: 'platform_title', sourceId: 'title-a', ...(prepared ? { partyId: 'ROOM01' } : {}) };
  }
  runtime.created = 0;
  runtime.room.lastActivityAt = new Date(Date.now() - age).toISOString();
  if (viewer) {
    runtime.authority = owner('viewer');
    runtime.params = { partyId: 'ROOM01', source: 'discovery', discoveryItemId: 'projection-a', discoveryLane: 'public' };
  }
  runtime.listed = true; runtime.accessAllowed = true;
  const appListeners = new Set(), authorityListeners = new Set();
  const AppState = { currentState: 'active', addEventListener: (_, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
  const gate = async options => { runtime.premium.push(options); return runtime.gate ? runtime.gate(options) : { allowed: runtime.premiumAllowed, reason: runtime.premiumAllowed ? 'allowed' : 'premium_required' }; };
  const save = async (id, changes) => { runtime.writes.push({ id, changes }); return runtime.policy ? runtime.policy(id, changes) : (runtime.room = { ...runtime.room, ...changes, discoveryTitle: changes.discoveryTitle?.trim() || null }); };
  const intent = { exports: {}, Date, require(name) {
    if (name === 'react-native') return { AppState };
    if (name === './accountSessionAuthority') return { getCurrentAccountSessionAuthoritySnapshot: () => runtime.authority,
      sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration };
    throw Error(`unmodeled intent dependency ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/partyRoomStartIntent.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, intent);
  const mocks = {
    'react': React,
    'expo-router': { useRouter: () => ({ push: value => runtime.navigations.push(value), replace: noop, back: noop, canGoBack: () => true }), useLocalSearchParams: () => runtime.params,
      useFocusEffect(callback) { const focused = runtime.focused; React.useEffect(() => focused ? callback() : undefined, [callback, focused]); } },
    'react-native': { AppState, Platform: { OS: 'android' }, StyleSheet: { create: x => x }, Share: { share: noop }, ...Object.fromEntries(['ActivityIndicator', 'ImageBackground', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'TextInput', 'TouchableOpacity', 'View'].map(x => [x, x])) },
    '../../_lib/session': { useSession: () => ({ user: { id: runtime.authority.userId }, authority: runtime.authority, authorityStatus: 'active', isLoading: false, isSignedIn: true }) },
    '../../_lib/betaProgram': { useBetaProgram: () => ({ accessState: { status: 'active' }, isLoading: false, isActive: true }), getBetaAccessBlockCopy: () => ({ title: '', body: '' }) },
    '../../_lib/appConfig': { DEFAULT_APP_CONFIG: {}, readAppConfig: async () => ({}), resolveBrandingConfig: () => ({ appDisplayName: "Chi'llywood" }), resolveFeatureConfig: () => ({ watchPartyEnabled: true }), resolveMonetizationConfig: () => ({}) },
    '../../_lib/premiumWatchPartyAccess': { requireLiveFirstPremium: gate, requireWatchPartyLivePremium: gate, isRuntimeControlBlockedAccess: a => a?.reason === 'runtime_control_blocked', getRuntimeControlBlockedCopy: () => ({ message: 'Live is temporarily unavailable.' }), LIVE_FIRST_PREMIUM_UPSELL_COPY: { title: 'Premium required', message: 'Premium required' }, WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY: { title: 'Premium required', message: 'Premium required' } },
    '../../_lib/watchParty': { getPartyRoom: async id => { runtime.reads.push(id); return roomReader ? roomReader(runtime) : Date.now() - Date.parse(runtime.room.lastActivityAt) > 15 * 60_000 ? null : { ...runtime.room }; },
      getOwnedPartyRoomForPreparation: async (expected, authority) => {
        runtime.reads.push(expected.partyId); runtime.preparedReads.push(expected);
        const current = runtime.preparation ? await runtime.preparation(expected) : roomReader ? await roomReader(runtime) : { ...runtime.room };
        return authority.userId === runtime.authority.userId && current?.isActive
          && ['partyId', 'hostUserId', 'roomType', 'titleId', 'sourceType', 'sourceId'].every(key => current[key] === expected[key]) ? current : null;
      },
      refreshOwnedPartyRoomForStart: async (expected, authority, isCurrent) => {
        runtime.refreshes.push({ expected, authority });
        if (runtime.refresh) return runtime.refresh(expected, isCurrent);
        if (!isCurrent() || !runtime.room.isActive) return null;
        runtime.room = { ...runtime.room, lastActivityAt: new Date().toISOString() }; return { ...runtime.room };
      }, getSafePartyUserId: async () => runtime.userReader ? runtime.userReader() : runtime.authority.userId,
      setPartyRoomPolicies: save, setPartyRoomDiscoverySettings: save, paidWatchPartyResolutionIsExactFreeRoom: value => value?.reason === 'free_room',
      createPartyRoom: async () => { assert.ok(!prepared, 'prepared-room tests must not create another room'); runtime.created += 1; return { ...runtime.room }; }, touchOwnedPartyRoomActivity: noop },
    '../../_lib/partyRoomStartIntent': intent.exports,
    '../../_lib/accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => runtime.authority,
      subscribeToAccountSessionAuthority: listener => { authorityListeners.add(listener); return () => authorityListeners.delete(listener); },
      sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration },
    '../../_lib/partyRoomDiscoveryDestination': { readCurrentPartyRoomDiscoveryDestination: async () => runtime.listed
      ? { partyId: runtime.room.partyId, hostUserId: runtime.room.hostUserId, sourceType: runtime.room.sourceType, sourceId: runtime.room.sourceId } : null },
    '../../_lib/watchPartyContentSources': { resolveWatchPartyContentDisplay: async () => ({ displayName: null }), resolveWatchPartyContentDisplayByParts: async () => ({ displayName: null }), resolveWatchPartySourceId: () => null, resolveWatchPartySourceType: () => null, rememberWatchPartyContentDisplayHandoff: noop },
    '../../_lib/paidWatchPartyTickets': {
      listMyPaidWatchPartyOffers: async () => offerRead ? offerRead(runtime) : runtime.offers,
      formatPaidWatchPartyTicketPrice: (cents, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100),
      savePaidWatchPartyOffer: async input => { runtime.paidWrites.push(input); return offerSave(input); },
      purchasePaidWatchPartyTicket: async () => { runtime.checkoutCalls += 1; throw Error('host setup must not purchase'); },
      resolvePaidWatchPartyTicketAccess: async () => ({ allowed: true, reason: 'free_room', offer: null }),
    },
    '../../_lib/monetization': { getMonetizationAccessSheetPresentation: () => ({}) },
    '../../_lib/actionSingleFlight.mjs': { createActionSingleFlightLatch },
    '../../_lib/watchPartyPreparedRoomReuse.mjs': { resolvePreparedWatchPartyRoomReuse },
    '../../_lib/watchPartyReturnNavigation.mjs': { WATCH_PARTY_WAITING_ROOM_ENTRY_SOURCE: 'waiting-room' },
    '../../_lib/creatorMoneyPurchaseAuthority': { isCreatorDigitalCheckoutShellAvailable: () => checkoutAvailable },
    '../../_lib/accessEntitlements': { resolveRoomAccess: async () => ({ isAllowed: runtime.accessAllowed }) },
    '../../_lib/analytics': { trackEvent: noop }, '../../_lib/logger': { debugLog: noop, reportRuntimeError: noop },
    '../../_lib/performancePolicy': { ROOM_HEARTBEAT_MS: 15000 }, '../../_data/titles': { titles: [] },
    '../../_lib/creatorMonetizationSetup': { saveCreatorSandboxMonetizationConfig: async input => { runtime.setupWrites.push(input); return setupSave ? setupSave(input) : { id: 'config' }; } }, '../../_lib/watch-party/room-shared': { PLAYER_WATCH_PARTY_SOURCE: 'player' },
    '../../components/monetization/access-sheet': { AccessSheet: 'AccessSheet' },
    '../../components/ui/chillywood-visual-system': { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: 'Fill' },
    './live-stage/[partyId]': { __esModule: true, default: 'LiveStage' },
  };
  for (const [path, name] of [['chat/internal-invite-sheet', 'InternalInviteSheet'], ['monetization/MoneyScopeInfoButton', 'MoneyScopeInfoButton'], ['system/beta-access-screen', 'BetaAccessScreen'], ['room/room-code-invite-card', 'RoomCodeInviteCard'], ['notifications/notification-bell-button', 'NotificationBellButton'], ['navigation/app-back-button', 'AppBackButton'], ['ui/typography', 'AppText']]) mocks[`../../components/${path}`] = { [name]: name };
  const context = { exports: {}, require: name => { assert.ok(name in mocks, `unmodeled import ${name}`); return mocks[name]; }, capture: value => { tree = value; return null; }, setInterval: () => 1, clearInterval: noop, URLSearchParams };
  vm.runInNewContext(code, context);
  const root = createRoot(container());
  const render = async () => React.act(async () => { root.render(React.createElement(context.exports.default)); await settle(); });
  await render(); t.after(() => React.act(async () => root.unmount()));
  const find = (predicate) => { const values = walk(tree, predicate); assert.equal(values.length, 1, 'one actual rendered control'); return values[0].props; };
  return { runtime, find, tree: () => tree,
    text: () => walk(tree, n => n.type === 'AppText').map(n => n.props.children).filter(x => typeof x === 'string').join('\n'),
    audience: value => find(n => n.props?.accessibilityLabel === `Set ${normal ? 'Party audience' : 'Live discovery'} to ${value}`),
    title: () => find(n => n.props?.accessibilityLabel === (normal ? 'Party discovery title' : 'Live discovery title')),
    continue: () => find(n => n.props?.testID === 'watch-party-create-room'),
    sheet: () => find(n => n.type === 'AccessSheet' && n.props.visible),
    entered: () => walk(tree, n => n.type === 'LiveStage').length,
    act: async fn => React.act(async () => { await fn(); await settle(); }),
    publishAuthority(next) { runtime.authority = next; for (const listener of authorityListeners) listener(next); },
    render, async account(id) { runtime.authority = owner(id); await render(); },
    async generation(value) { runtime.authority = owner(runtime.authority.userId, value); await render(); },
    async replaceRoom(id) { runtime.room = room(id); runtime.params = { mode: 'live', partyId: id }; await render(); },
    async focus(value) { runtime.focused = value; await render(); },
    async state(value) { await React.act(async () => { AppState.currentState = value; for (const fn of appListeners) fn(value); await settle(); }); },
  };
}

test('a rejected audience save is visibly unsaved and retry preserves the requested draft', async t => {
  const h = await mount(t); h.runtime.policy = async () => null;
  await h.act(() => h.audience('public').onPress());
  assert.match(h.text(), /not saved|unable to save/i);
  const retry = h.find(n => n.props?.accessibilityLabel === 'Retry saving Live discovery');
  h.runtime.policy = null; await h.act(() => retry.onPress());
  assert.equal(h.runtime.room.discoveryVisibility, 'public');
});

test('normal Party defaults private and audience saves do not navigate or start publication', async t => {
  const h = await mount(t, { normal: true });
  assert.equal(h.audience('private').accessibilityState.selected, true);
  await h.act(() => h.audience('public').onPress());
  assert.equal(h.runtime.room.discoveryVisibility, 'public');
  assert.match(h.text(), /Party audience saved/); assert.equal(h.runtime.navigations.length, 0);
});

test('unavailable normal prepared Start stays denied and directs a fresh Player preparation', async t => {
  const h = await mount(t, { normal: true, roomReader: runtime => runtime.reads.length === 1 ? { ...runtime.room } : null });
  await h.act(() => h.continue().onPress());
  assert.equal(h.runtime.navigations.length, 0);
  assert.equal(h.runtime.created, 0);
  assert.equal(h.runtime.writes.length, 0);
  assert.match(h.text(), /prepared room is no longer available.*Return to the Player/);
});

test('age-expired Player hydration stays read-only and duplicate explicit Start renews exactly once after audience save', async t => {
  const h = await mount(t, { normal: true, age: 20 * 60_000 });
  assert.equal(h.runtime.preparedReads.length, 1); assert.equal(h.runtime.refreshes.length, 0);
  assert.equal(h.runtime.writes.length, 0); assert.equal(h.runtime.created, 0);
  const pending = deferred(); h.runtime.refresh = async expected => {
    assert.equal(h.runtime.writes.length, 1, 'audience persistence precedes activity renewal');
    assert.ok(h.runtime.premium.length > 0, 'fresh Premium gate precedes renewal');
    return pending.promise;
  };
  const start = h.continue().onPress;
  await h.act(() => { void start(); void start(); });
  assert.equal(h.runtime.refreshes.length, 1); assert.equal(h.runtime.navigations.length, 0);
  const renewed = { ...h.runtime.room, lastActivityAt: new Date().toISOString() };
  await h.act(() => pending.resolve(renewed));
  assert.equal(h.runtime.navigations.length, 1); assert.equal(h.runtime.navigations[0].params.partyId, 'ROOM01');
  assert.equal(h.runtime.created, 0);
});

test('ordinary discovery hydration continues to reject an age-expired room without an owner preparation read', async t => {
  const h = await mount(t, { normal: true, viewer: true, age: 20 * 60_000 });
  assert.equal(h.runtime.preparedReads.length, 0); assert.equal(h.runtime.refreshes.length, 0);
  assert.equal(walk(h.tree(), n => n.props?.testID === 'watch-party-preview-join').length, 0);
  assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.created, 0);
});

for (const failure of ['ended', 'missing', 'error', 'owner', 'source', 'title']) test(`Player owner hydration ${failure} cannot prepare or renew a room`, async t => {
  const h = await mount(t, { normal: true, age: 20 * 60_000, roomReader: runtime => {
    if (failure === 'error') throw Error('unavailable');
    if (failure === 'missing') return null;
    return { ...runtime.room, ...(failure === 'ended' ? { isActive: false } : failure === 'owner' ? { hostUserId: 'other' }
      : failure === 'source' ? { sourceType: 'creator_video' } : failure === 'title' ? { titleId: 'other-title' } : {}) };
  } });
  assert.match(h.text(), /no longer available|Unable to load this Party/);
  assert.equal(h.runtime.refreshes.length, 0); assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.created, 0);
});

for (const failure of ['ended', 'lost-response', 'provider-error']) test(`Start ${failure} preserves exact prepared target and needs an explicit retry`, async t => {
  const h = await mount(t, { normal: true, age: 20 * 60_000 });
  h.runtime.refresh = async () => {
    if (failure === 'ended') h.runtime.room.isActive = false;
    if (failure === 'lost-response') h.runtime.room.lastActivityAt = new Date().toISOString();
    if (failure === 'provider-error') throw Error('provider failed');
    return null;
  };
  await h.act(() => h.continue().onPress());
  assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.created, 0); assert.equal(h.runtime.refreshes.length, 1);
  assert.match(h.text(), /Unable to confirm this Party is ready/);
  h.runtime.refresh = null;
  await h.act(() => h.continue().onPress());
  assert.equal(h.runtime.navigations.length, failure === 'ended' ? 0 : 1);
  assert.ok(h.runtime.preparedReads.every(value => value.partyId === 'ROOM01'));
  assert.equal(h.runtime.created, 0);
});

for (const block of ['premium', 'audience', 'reuse']) test(`${block} failure cannot renew prepared-room activity`, async t => {
  const h = await mount(t, { normal: true, age: 20 * 60_000 });
  if (block === 'premium') h.runtime.premiumAllowed = false;
  if (block === 'audience') h.runtime.policy = async () => null;
  if (block === 'reuse') h.runtime.room.sourceId = 'different-title';
  await h.act(() => h.continue().onPress());
  assert.equal(h.runtime.refreshes.length, 0); assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.created, 0);
});

for (const stage of ['preparation', 'refresh']) for (const transition of ['account', 'generation', 'title', 'title-aba', 'source-type', 'focus', 'background', 'authority-aba'])
  test(`held ${stage} cannot navigate after ${transition} retires waiting Start`, async t => {
    const h = await mount(t, { normal: true, age: 20 * 60_000 }), pending = deferred(), old = { ...h.runtime.room };
    h.runtime[stage] = () => pending.promise;
    await h.act(() => { void h.continue().onPress(); });
    if (transition === 'account') await h.account('other');
    if (transition === 'generation') await h.generation('session-b');
    if (transition === 'title' || transition === 'title-aba' || transition === 'source-type') {
      const previous = h.runtime.params;
      h.runtime.params = { ...h.runtime.params, ...(transition.startsWith('title') ? { titleId: 'replacement' } : { sourceType: 'creator_video' }) };
      await h.render();
      if (transition === 'title-aba') { h.runtime.params = previous; await h.render(); }
    }
    if (transition === 'focus') { await h.focus(false); await h.focus(true); }
    if (transition === 'background') { await h.state('background'); await h.state('active'); }
    if (transition === 'authority-aba') {
      const previous = h.runtime.authority;
      h.publishAuthority(null); h.publishAuthority(previous);
    }
    await h.act(() => pending.resolve({ ...old, lastActivityAt: new Date().toISOString() }));
    assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.created, 0);
    if (stage === 'preparation') assert.equal(h.runtime.refreshes.length, 0);
  });

test('late inactive Player hydration stays unavailable and Start cannot refresh its activity', async t => {
  const pending = deferred();
  const h = await mount(t, { normal: true, age: 20 * 60_000, roomReader: () => pending.promise });
  assert.equal(h.runtime.refreshes.length, 0);
  await h.act(() => pending.resolve({ ...h.runtime.room, isActive: false }));
  assert.match(h.text(), /no longer available/);
  await h.act(() => h.continue().onPress());
  assert.equal(h.runtime.refreshes.length, 0); assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.created, 0);
});

for (const change of [{ partyId: 'ROOM02' }, { titleId: 'different-title' }])
  test(`route replacement with stable lookup and changed ${Object.keys(change)[0]} reloads exact owner hydration`, async t => {
    const h = await mount(t, { normal: true });
    h.runtime.params = { ...h.runtime.params, roomCode: 'ROOM01' }; await h.render();
    const reads = h.runtime.preparedReads.length;
    h.runtime.params = { ...h.runtime.params, ...change }; await h.render();
    assert.ok(h.runtime.preparedReads.length > reads);
    await h.act(() => h.continue().onPress());
    assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.refreshes.length, 0); assert.equal(h.runtime.created, 0);
  });

test('discovery opens actual viewer preview and Join Now preserves ordinary admission without Start intent', async t => {
  const h = await mount(t, { normal: true, viewer: true });
  const join = h.find(n => n.props?.testID === 'watch-party-preview-join');
  await h.act(() => join.onPress());
  assert.equal(h.runtime.navigations.length, 1); assert.equal(h.runtime.writes.length, 0);
  assert.equal(h.runtime.navigations[0].params.startIntent, undefined);
  assert.ok(h.runtime.premium.length > 0);
});

test('replacing a discovery route reloads the actual waiting preview before joining', async t => {
  const h = await mount(t, { normal: true, viewer: true });
  h.runtime.room = { ...h.runtime.room, partyId: 'ROOM02', roomCode: 'ROOM02' };
  h.runtime.params = { ...h.runtime.params, partyId: 'ROOM02', discoveryItemId: 'projection-b' };
  await h.render();
  await h.act(() => h.find(n => n.props?.testID === 'watch-party-preview-join').onPress());
  assert.equal(h.runtime.navigations.length, 1); assert.equal(h.runtime.navigations[0].params.partyId, 'ROOM02');
  assert.equal(h.runtime.navigations[0].params.startIntent, undefined);
});

test('account replacement reloads discovery as viewer and retires old host audience controls', async t => {
  const h = await mount(t, { normal: true });
  h.runtime.params = { partyId: 'ROOM01', source: 'discovery', discoveryItemId: 'projection-a', discoveryLane: 'public' };
  await h.account('viewer');
  assert.equal(walk(h.tree(), n => n.props?.accessibilityLabel === 'Set Party audience to public').length, 0);
  assert.ok(h.find(n => n.props?.testID === 'watch-party-preview-join'));
  assert.equal(h.runtime.writes.length, 0);
});

for (const transition of ['foreground', 'focus', 'same-authority']) test(`held initial discovery load recovers after ${transition} without accepting its old completion`, async t => {
  const oldRead = deferred(); let hold = true;
  const h = await mount(t, { normal: true, viewer: true, roomReader: runtime => hold ? oldRead.promise : { ...runtime.room } });
  assert.equal(walk(h.tree(), n => n.props?.testID === 'watch-party-preview-join').length, 0);
  if (transition === 'foreground') await h.state('background');
  if (transition === 'focus') await h.focus(false);
  hold = false;
  if (transition === 'foreground') await h.state('active');
  else if (transition === 'focus') await h.focus(true);
  else { h.runtime.authority = { ...h.runtime.authority }; await h.render(); }
  assert.ok(h.find(n => n.props?.testID === 'watch-party-preview-join'));
  await h.act(() => oldRead.resolve({ ...h.runtime.room, partyId: 'OBSOLETE', roomCode: 'OBSOLETE' }));
  await h.act(() => h.find(n => n.props?.testID === 'watch-party-preview-join').onPress());
  assert.equal(h.runtime.navigations.length, 1); assert.equal(h.runtime.navigations[0].params.partyId, 'ROOM01');
});

for (const failure of ['ended', 'missing', 'error']) test(`initial discovery ${failure} is visibly unavailable without a stale Join action`, async t => {
  const h = await mount(t, { normal: true, viewer: true, roomReader: runtime => {
    if (failure === 'error') throw Error('read unavailable');
    return failure === 'missing' ? null : { ...runtime.room, isActive: false };
  } });
  assert.match(h.text(), /no longer available|Unable to load this Party/);
  assert.equal(walk(h.tree(), n => n.props?.testID === 'watch-party-preview-join').length, 0);
  assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.writes.length, 0);
});

for (const blocked of ['listing', 'premium', 'access']) test(`discovery preview Join cannot bypass current ${blocked} denial`, async t => {
  const h = await mount(t, { normal: true, viewer: true });
  if (blocked === 'listing') h.runtime.listed = false;
  if (blocked === 'premium') h.runtime.premiumAllowed = false;
  if (blocked === 'access') h.runtime.accessAllowed = false;
  await h.act(() => h.find(n => n.props?.testID === 'watch-party-preview-join').onPress());
  assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.writes.length, 0);
});

test('normal explicit Start carries one process-owned intent through the existing Party Room route', async t => {
  const h = await mount(t, { normal: true });
  await h.act(() => h.audience("Chi'lly Circle").onPress());
  const start = h.continue().onPress;
  await h.act(() => { void start(); void start(); });
  assert.equal(h.runtime.navigations.length, 1);
  const route = h.runtime.navigations[0];
  assert.equal(route.pathname, '/watch-party/[partyId]');
  assert.match(route.params.startIntent, /^party-start-/);
  assert.equal(route.params.sourceType, 'platform_title'); assert.equal(route.params.sourceId, 'title-a');
  assert.equal(h.runtime.created, 0);
});

test('new normal Party retains its created room and requested audience when saving fails', async t => {
  const h = await mount(t, { normal: true, prepared: false });
  await h.act(() => h.audience('public').onPress()); h.runtime.policy = async () => null;
  await h.act(() => h.continue().onPress());
  assert.equal(h.runtime.created, 1); assert.equal(h.runtime.navigations.length, 0);
  assert.equal(h.audience('public').accessibilityState.selected, true); assert.match(h.text(), /not saved/);
  h.runtime.policy = null;
  await h.act(() => h.continue().onPress());
  assert.equal(h.runtime.created, 1); assert.equal(h.runtime.navigations.length, 1);
});

for (const transition of ['account', 'generation', 'focus', 'state']) test(`normal Party audience save cannot finish after ${transition} retirement`, async t => {
  const h = await mount(t, { normal: true }), d = deferred(); h.runtime.policy = () => d.promise;
  await h.act(() => h.audience('public').onPress());
  await h[transition](transition === 'focus' ? false : transition === 'state' ? 'background' : 'replacement');
  await h.act(() => d.resolve({ ...h.runtime.room, discoveryVisibility: 'public' }));
  assert.doesNotMatch(h.text(), /Party audience saved/); assert.equal(h.runtime.navigations.length, 0);
});

test('a rejected title save reports failure without discarding the typed title', async t => {
  const h = await mount(t); await h.act(() => h.title().onChangeText('My live room')); h.runtime.policy = async () => null;
  await h.act(() => h.title().onBlur());
  assert.match(h.text(), /not saved|unable to save/i); assert.equal(h.title().value, 'My live room');
});

test('active Premium Continue repeats the ordinary entry gate and exact prepared-room save', async t => {
  const h = await mount(t); h.runtime.premiumAllowed = false;
  await h.act(() => h.continue().onPress()); assert.equal(h.entered(), 0);
  const sheet = h.sheet(); const before = h.runtime.premium.length; h.runtime.premiumAllowed = true;
  await h.act(() => activeSheetContinue(sheet.onPurchaseResult));
  assert.equal(h.runtime.premium.length, before + 1); assert.equal(h.entered(), 1); assert.equal(h.runtime.writes.length, 1);
});

test('a pending save visibly disables Continue and cannot dispatch a second write', async t => {
  const h = await mount(t), d = deferred(); h.runtime.policy = () => d.promise;
  const first = h.audience('public').onPress;
  await h.act(() => { first(); first(); });
  assert.equal(h.runtime.writes.length, 1); assert.equal(h.continue().disabled, true); assert.match(h.text(), /Saving Live discovery/);
  await h.act(() => h.continue().onPress()); assert.equal(h.entered(), 0);
  await h.act(() => d.resolve({ ...room(), discoveryVisibility: 'public' }));
  assert.equal(h.continue().disabled, false); assert.match(h.text(), /Live discovery saved/);
});

for (const [field, value] of [['partyId', 'OTHER'], ['hostUserId', 'other'], ['roomType', 'title'], ['discoveryVisibility', 'private']]) {
  test(`save response with different ${field} cannot claim success`, async t => {
    const h = await mount(t); h.runtime.policy = async () => ({ ...room(), discoveryVisibility: 'public', [field]: value });
    await h.act(() => h.audience('public').onPress()); assert.match(h.text(), /not saved/);
    assert.equal(h.audience('public').accessibilityState.selected, true);
  });
}

for (const transition of ['account', 'generation', 'replaceRoom', 'focus', 'state']) {
  test(`held save cannot update a retired ${transition} screen`, async t => {
    const h = await mount(t), d = deferred(); h.runtime.policy = () => d.promise;
    await h.act(() => h.audience('public').onPress());
    await h[transition](transition === 'focus' ? false : transition === 'state' ? 'background' : 'replacement');
    await h.act(() => d.resolve({ ...room(), discoveryVisibility: 'public', discoveryTitle: 'obsolete' }));
    assert.doesNotMatch(h.text(), /Live discovery saved/);
    assert.equal(walk(h.tree(), n => n.props?.accessibilityLabel === 'Live discovery title' && n.props.value === 'obsolete').length, 0);
    if (transition === 'account') assert.equal(walk(h.tree(), n => n.props?.accessibilityLabel === 'Live discovery title').length, 0);
  });
}

test('account replacement during the identity read cannot begin the policy write', async t => {
  const h = await mount(t), d = deferred(); h.runtime.userReader = () => d.promise;
  await h.act(() => h.audience('public').onPress()); await h.account('other');
  await h.act(() => d.resolve('host')); assert.equal(h.runtime.writes.length, 0);
});

test('the sheet saying Premium is active does not bypass an expired fresh gate', async t => {
  const h = await mount(t); h.runtime.premiumAllowed = false;
  await h.act(() => h.continue().onPress()); const sheet = h.sheet();
  await h.act(() => sheet.onPurchaseResult({ ok: true }));
  assert.equal(h.entered(), 0); assert.equal(h.runtime.writes.length, 0); assert.ok(h.sheet());
});

test('sheet retry does not bypass a runtime shutdown', async t => {
  const h = await mount(t); h.runtime.premiumAllowed = false;
  await h.act(() => h.continue().onPress()); const sheet = h.sheet();
  h.runtime.gate = async () => ({ allowed: false, reason: 'runtime_control_blocked' });
  await h.act(() => sheet.onPurchaseResult({ ok: true }));
  assert.equal(h.entered(), 0); assert.equal(h.runtime.writes.length, 0); assert.match(h.text(), /temporarily unavailable/);
});

test('duplicate sheet callbacks share one normal entry attempt', async t => {
  const h = await mount(t); h.runtime.premiumAllowed = false;
  await h.act(() => h.continue().onPress()); const sheet = h.sheet(), d = deferred();
  h.runtime.gate = () => d.promise; const before = h.runtime.premium.length;
  let first;
  await h.act(() => { first = sheet.onPurchaseResult({ ok: true }); void sheet.onPurchaseResult({ ok: true }); });
  assert.equal(h.runtime.premium.length, before + 1);
  await h.act(async () => { d.resolve({ allowed: true }); await first; });
  assert.equal(h.entered(), 1); assert.equal(h.runtime.writes.length, 1);
});

test('retired sheet callback cannot retry entry for a replacement account', async t => {
  const h = await mount(t); h.runtime.premiumAllowed = false;
  await h.act(() => h.continue().onPress()); const sheet = h.sheet(), before = h.runtime.premium.length;
  await h.account('other'); const afterAccount = h.runtime.premium.length;
  await h.act(() => sheet.onPurchaseResult({ ok: true }));
  assert.ok(afterAccount >= before); assert.equal(h.runtime.premium.length, afterAccount); assert.equal(h.entered(), 0);
});

test('held Premium recheck cannot enter after foreground lifetime ends', async t => {
  const h = await mount(t), d = deferred(); h.runtime.gate = () => d.promise;
  let result; await h.act(() => { result = h.continue().onPress(); }); await h.state('background');
  await h.act(async () => { d.resolve({ allowed: true }); await result; });
  assert.equal(h.runtime.writes.length, 0); assert.equal(h.entered(), 0);
});

test('entry remains in the waiting room when the retried policy save fails', async t => {
  const h = await mount(t); h.runtime.premiumAllowed = false;
  await h.act(() => h.continue().onPress()); const sheet = h.sheet(); h.runtime.premiumAllowed = true; h.runtime.policy = async () => null;
  await h.act(() => sheet.onRestoreResult({ ok: true }));
  assert.equal(h.entered(), 0); assert.match(h.text(), /Unable to save Live discovery/);
});

test('a held entry retires across account replacement and releases the pending UI when it settles', async t => {
  const h = await mount(t), d = deferred(); h.runtime.gate = () => d.promise;
  let result; await h.act(() => { result = h.continue().onPress(); }); await h.account('other');
  await h.act(async () => { d.resolve({ allowed: true }); await result; });
  assert.equal(h.entered(), 0); assert.equal(h.continue().disabled, false); assert.equal(h.runtime.writes.length, 0);
});

test('entry cannot navigate with a policy response that did not save the requested draft', async t => {
  const h = await mount(t); await h.act(() => h.title().onChangeText('Requested title'));
  h.runtime.policy = async () => room();
  await h.act(() => h.continue().onPress());
  assert.equal(h.entered(), 0); assert.match(h.text(), /Unable to save Live discovery/); assert.equal(h.title().value, 'Requested title');
});

test('same focused account and room can finish a store round trip through fresh Premium authority', async t => {
  const h = await mount(t); h.runtime.premiumAllowed = false;
  await h.act(() => h.continue().onPress()); const sheet = h.sheet(), before = h.runtime.premium.length;
  await h.state('background'); await h.state('active'); h.runtime.premiumAllowed = true;
  await h.act(() => sheet.onPurchaseResult({ ok: true }));
  assert.equal(h.runtime.premium.length, before + 1); assert.equal(h.entered(), 1);
});

test('blur and refocus retires the old Premium entry intent even on the same account and room', async t => {
  const h = await mount(t); h.runtime.premiumAllowed = false;
  await h.act(() => h.continue().onPress()); const sheet = h.sheet();
  await h.focus(false); await h.focus(true); h.runtime.premiumAllowed = true;
  const before = h.runtime.premium.length;
  await h.act(() => sheet.onPurchaseResult({ ok: true }));
  assert.equal(h.runtime.premium.length, before); assert.equal(h.entered(), 0);
});

test('manual dismissal retires the pending entry before a late purchase success', async t => {
  const h = await mount(t); h.runtime.premiumAllowed = false;
  await h.act(() => h.continue().onPress()); const sheet = h.sheet();
  await h.act(() => sheet.onClose()); h.runtime.premiumAllowed = true; const before = h.runtime.premium.length;
  await h.act(() => sheet.onPurchaseResult({ ok: true }));
  assert.equal(h.runtime.premium.length, before); assert.equal(h.entered(), 0);
});

test('a dismissed sheet cannot consume a newer Continue intent', async t => {
  const h = await mount(t); h.runtime.premiumAllowed = false;
  await h.act(() => h.continue().onPress()); const old = h.sheet(); await h.act(() => old.onClose());
  await h.act(() => h.continue().onPress()); const current = h.sheet(); h.runtime.premiumAllowed = true;
  const before = h.runtime.premium.length; await h.act(() => old.onPurchaseResult({ ok: true }));
  assert.equal(h.runtime.premium.length, before); assert.equal(h.entered(), 0);
  await h.act(() => current.onPurchaseResult({ ok: true })); assert.equal(h.entered(), 1);
});

test('unavailable fresh Premium authority is a visible retry error, not a successful entry or purchase diagnosis', async t => {
  const h = await mount(t); h.runtime.gate = async () => null;
  await h.act(() => h.continue().onPress());
  assert.equal(h.entered(), 0); assert.equal(h.runtime.writes.length, 0);
  assert.match(h.text(), /Unable to confirm current Premium access/);
  assert.equal(walk(h.tree(), n => n.type === 'AccessSheet' && n.props.visible).length, 0);
});

test('a thrown policy transport failure remains retryable without claiming success', async t => {
  const h = await mount(t); h.runtime.policy = async () => { throw new Error('modeled network failure'); };
  await h.act(() => h.audience('public').onPress()); assert.match(h.text(), /not saved/);
  assert.equal(h.continue().disabled, false); assert.equal(h.audience('public').accessibilityState.selected, true);
});

test('Continue saves text entered in the same React turn before blur or render', async t => {
  const h = await mount(t); const title = h.title(), enter = h.continue();
  await h.act(async () => { title.onChangeText('Latest draft'); await enter.onPress(); });
  assert.equal(h.runtime.writes[0].changes.discoveryTitle, 'Latest draft'); assert.equal(h.entered(), 1);
});

test('a save result settling before React commits does not overwrite a newer typed draft', async t => {
  const h = await mount(t), d = deferred(); h.runtime.policy = () => d.promise;
  await h.act(() => h.audience('public').onPress()); const title = h.title();
  await h.act(async () => { d.resolve({ ...room(), discoveryVisibility: 'public' }); await settle(); title.onChangeText('Newer draft'); });
  assert.equal(h.title().value, 'Newer draft'); assert.doesNotMatch(h.text(), /Live discovery saved/);
});

test('an old audience control cannot change discovery after the waiting screen enters its embedded Live Room', async t => {
  const h = await mount(t); const audience = h.audience('public'), enter = h.continue();
  await h.act(async () => { await enter.onPress(); audience.onPress(); await settle(); });
  assert.equal(h.entered(), 1); assert.equal(h.runtime.writes.length, 1);
  assert.equal(h.runtime.room.discoveryVisibility, 'private');
});

test('refocusing an embedded Live Room does not rearm retained waiting-room controls', async t => {
  const h = await mount(t); const audience = h.audience('public'), title = h.title(), enter = h.continue();
  await h.act(() => enter.onPress());
  await h.focus(false); await h.focus(true);
  await h.act(async () => { title.onChangeText('Stale title'); title.onBlur(); audience.onPress(); await settle(); });
  assert.equal(h.entered(), 1); assert.equal(h.runtime.writes.length, 1);
  assert.equal(h.runtime.room.discoveryVisibility, 'private'); assert.equal(h.runtime.room.discoveryTitle, null);
});

test('refocusing the actual waiting room still permits a fresh discovery save', async t => {
  const h = await mount(t); await h.focus(false); await h.focus(true);
  await h.act(() => h.audience('public').onPress());
  assert.equal(h.runtime.writes.length, 1); assert.equal(h.runtime.room.discoveryVisibility, 'public');
  assert.match(h.text(), /Live discovery saved/);
});

const sandboxOffer = { id: 'offer-a', partyId: 'ROOM01', status: 'sandbox', priceCents: 99, currency: 'usd', seatLimit: 12 };

test('Party Room sandbox setup stays explicitly test-only after save and a fresh screen mount', async t => {
  const h = await mount(t, { normal: true, checkoutAvailable: true, offerSave: async () => sandboxOffer });
  const paid = () => h.find(n => n.props?.testID === 'party-room-entry-paid');
  assert.equal(paid().accessibilityLabel, 'Set up sandbox Party Room entry at 99 cents');
  assert.match(h.text(), /Sandbox · \$0\.99/);
  await h.act(() => paid().onPress());
  assert.equal(h.runtime.paidWrites.length, 1);
  assert.equal(h.runtime.paidWrites[0].partyId, 'ROOM01');
  assert.equal(h.runtime.paidWrites[0].status, 'sandbox');
  assert.equal(h.runtime.paidWrites[0].priceCents, 99);
  assert.equal(h.runtime.setupWrites.length, 1);
  assert.equal(h.runtime.checkoutCalls, 0);
  assert.equal(paid().accessibilityState.selected, true);
  assert.match(h.text(), /Saved sandbox entry: \$0\.99\. Test-only; live money is not active/);
  assert.match(h.text(), /Sandbox Party Room entry saved/);

  const reopened = await mount(t, { normal: true, offers: [sandboxOffer] });
  assert.match(reopened.text(), /Saved sandbox entry: \$0\.99\. Test-only; live money is not active/);
  assert.doesNotMatch(reopened.text(), /Sandbox Party Room entry saved/); // No transient success notice on reload.
  assert.equal(reopened.runtime.paidWrites.length, 0);
  assert.equal(reopened.runtime.checkoutCalls, 0);
});

test('Party Room sandbox summary binds the persisted status and price to this exact room', async t => {
  const h = await mount(t, { normal: true, offers: [
    { ...sandboxOffer, partyId: 'OTHER', priceCents: 799 },
    { ...sandboxOffer, priceCents: 249 },
  ] });
  assert.match(h.text(), /Saved sandbox entry: \$2\.49/);
  assert.doesNotMatch(h.text(), /\$7\.99|Viewer preview: Join Party Room — \$0\.99/);
  assert.match(h.text(), /Party Room Pass gives entry to this exact Party Room only/);
});

for (const [status, expected] of [['active', 'Saved paid entry: $2.49.'], ['sold_out', 'Saved Party Room entry: Sold out at $2.49.']]) {
  test(`Party Room sandbox setup does not relabel an existing ${status} offer as a saved sandbox offer`, async t => {
    const h = await mount(t, { normal: true, offers: [{ ...sandboxOffer, status, priceCents: 249 }] });
    assert.ok(h.text().includes(expected));
    assert.doesNotMatch(h.text(), /Saved sandbox entry:/);
    assert.equal(h.find(n => n.props?.testID === 'party-room-entry-paid').accessibilityState.selected, false);
    assert.equal(h.runtime.paidWrites.length, 0);
  });
}

test('Party Room sandbox save failure preserves Free entry and never claims a saved sandbox offer', async t => {
  let attempts = 0;
  const h = await mount(t, { normal: true, checkoutAvailable: true, offerSave: async () => {
    if (++attempts === 1) throw Error('modeled save failure');
    return sandboxOffer;
  } });
  await h.act(() => h.find(n => n.props?.testID === 'party-room-entry-paid').onPress());
  assert.match(h.text(), /Viewer preview: Free entry/);
  assert.doesNotMatch(h.text(), /Saved sandbox entry:|Sandbox Party Room entry saved/);
  assert.equal(h.runtime.setupWrites.length, 0);
  assert.equal(h.runtime.checkoutCalls, 0);
  await h.act(() => h.find(n => n.props?.testID === 'party-room-entry-paid').onPress());
  assert.equal(h.runtime.paidWrites.length, 2);
  assert.equal(h.runtime.setupWrites.length, 1);
  assert.match(h.text(), /Saved sandbox entry: \$0\.99/);
  assert.equal(h.runtime.checkoutCalls, 0);
});

test('Party Room sandbox lookup failure keeps the saved setting unknown', async t => {
  const h = await mount(t, { normal: true, offerRead: async () => { throw Error('modeled read failure'); } });
  assert.match(h.text(), /Checking the current Party Room entry setting/);
  assert.doesNotMatch(h.text(), /Saved sandbox entry:|Saved paid entry:|Viewer preview: Free entry/);
});

for (const rejects of [false, true]) test(`Party Room sandbox saved state survives an older pending offer read (rejects=${rejects})`, async t => {
  let finish;
  const pending = new Promise((resolve, reject) => { finish = rejects ? () => reject(Error('obsolete read failure')) : () => resolve([]); });
  const h = await mount(t, { normal: true, checkoutAvailable: true, offerRead: () => pending, offerSave: async () => sandboxOffer });
  assert.match(h.text(), /Checking the current Party Room entry setting/);
  await h.act(() => h.find(n => n.props?.testID === 'party-room-entry-paid').onPress());
  assert.match(h.text(), /Saved sandbox entry: \$0\.99/);
  await h.act(() => finish());
  assert.match(h.text(), /Saved sandbox entry: \$0\.99/);
  assert.doesNotMatch(h.text(), /Viewer preview: Free entry|Checking the current Party Room entry setting/);
});

test('Party Room sandbox status clears only after a successful Free save', async t => {
  const h = await mount(t, { normal: true, offers: [sandboxOffer], offerSave: async () => ({ ...sandboxOffer, status: 'canceled' }) });
  assert.match(h.text(), /Saved sandbox entry: \$0\.99/);
  await h.act(() => h.find(n => n.props?.testID === 'party-room-entry-free').onPress());
  assert.equal(h.runtime.paidWrites[0].status, 'canceled');
  assert.equal(h.find(n => n.props?.testID === 'party-room-entry-free').accessibilityState.selected, true);
  assert.match(h.text(), /Viewer preview: Free entry/);
  assert.doesNotMatch(h.text(), /Saved sandbox entry:|Saved paid entry:/);
  assert.equal(h.runtime.setupWrites.length, 0);
  assert.equal(h.runtime.checkoutCalls, 0);
});

test('Party Room sandbox offer remains visibly saved when follow-up setup fails, and retry completes setup', async t => {
  let attempts = 0;
  const h = await mount(t, { normal: true, checkoutAvailable: true, offerSave: async () => sandboxOffer, setupSave: async () => {
    if (++attempts === 1) throw Error('modeled setup failure after offer persisted');
    return { id: 'config' };
  } });
  await h.act(() => h.find(n => n.props?.testID === 'party-room-entry-paid').onPress());
  assert.match(h.text(), /Saved sandbox entry: \$0\.99/);
  assert.match(h.text(), /entry is saved, but setup could not finish\. Retry sandbox setup/);
  assert.doesNotMatch(h.text(), /Viewer preview: Free entry|Sandbox Party Room entry saved at/);
  assert.equal(h.find(n => n.props?.testID === 'party-room-entry-paid').disabled, false);
  await h.act(() => h.find(n => n.props?.testID === 'party-room-entry-paid').onPress());
  assert.equal(h.runtime.paidWrites.length, 2);
  assert.equal(h.runtime.setupWrites.length, 2);
  assert.match(h.text(), /Sandbox Party Room entry saved at \$0\.99/);
  assert.doesNotMatch(h.text(), /setup could not finish/);
  assert.equal(h.runtime.checkoutCalls, 0);
});

for (const [field, value] of [['partyId', 'OTHER'], ['status', 'active'], ['status', 'canceled']]) {
  test(`Party Room sandbox save with mismatched ${field}=${value} cannot claim the requested setting`, async t => {
    const h = await mount(t, { normal: true, checkoutAvailable: true, offerSave: async () => ({ ...sandboxOffer, [field]: value }) });
    await h.act(() => h.find(n => n.props?.testID === 'party-room-entry-paid').onPress());
    assert.match(h.text(), /entry change could not be confirmed/);
    assert.doesNotMatch(h.text(), /Saved sandbox entry:|Sandbox Party Room entry saved|Viewer preview: Free entry/);
    assert.equal(h.runtime.setupWrites.length, 0);
    assert.equal(h.runtime.checkoutCalls, 0);
  });
}

const replaceNormalRoom = async h => {
  h.runtime.room = { ...h.runtime.room, partyId: 'ROOM02', roomCode: 'ROOM02' };
  h.runtime.params = { ...h.runtime.params, partyId: 'ROOM02' };
  h.runtime.offers = [];
  await h.render();
};

for (const transition of ['room', 'account', 'generation', 'focus']) {
  test(`Party Room sandbox save completion cannot project onto a retired ${transition}`, async t => {
    const pending = deferred();
    const h = await mount(t, { normal: true, checkoutAvailable: true, offerSave: () => pending.promise });
    let save;
    await h.act(() => { save = h.find(n => n.props?.testID === 'party-room-entry-paid').onPress(); });
    if (transition === 'room') await replaceNormalRoom(h);
    else if (transition === 'focus') { await h.focus(false); await h.focus(true); }
    else await h[transition]('replacement');
    await h.act(async () => { pending.resolve(sandboxOffer); await save; });
    assert.doesNotMatch(h.text(), /Saved sandbox entry:|Sandbox Party Room entry saved/);
    assert.equal(h.runtime.setupWrites.length, 0);
    assert.equal(h.runtime.checkoutCalls, 0);
  });
}

test('Party Room sandbox follow-up setup completion cannot publish success on a replacement room', async t => {
  const pending = deferred();
  const h = await mount(t, { normal: true, checkoutAvailable: true, offerSave: async () => sandboxOffer, setupSave: () => pending.promise });
  let save;
  await h.act(() => { save = h.find(n => n.props?.testID === 'party-room-entry-paid').onPress(); });
  assert.match(h.text(), /Saved sandbox entry: \$0\.99/);
  await replaceNormalRoom(h);
  await h.act(async () => { pending.resolve({ id: 'config' }); await save; });
  assert.doesNotMatch(h.text(), /Saved sandbox entry:|Sandbox Party Room entry saved/);
  assert.equal(h.runtime.setupWrites.length, 1);
  assert.equal(h.runtime.checkoutCalls, 0);
});

test('Party Room sandbox duplicate saved callbacks dispatch only one offer and setup write', async t => {
  const pending = deferred();
  const h = await mount(t, { normal: true, checkoutAvailable: true, offerSave: () => pending.promise });
  const save = h.find(n => n.props?.testID === 'party-room-entry-paid').onPress;
  let first;
  await h.act(() => { first = save(); void save(); });
  assert.equal(h.runtime.paidWrites.length, 1);
  await h.act(async () => { pending.resolve(sandboxOffer); await first; });
  assert.equal(h.runtime.setupWrites.length, 1);
  assert.match(h.text(), /Saved sandbox entry: \$0\.99/);
});

test('Party Room sandbox save remains current when the same room audience changes', async t => {
  const pending = deferred();
  const h = await mount(t, { normal: true, checkoutAvailable: true, offerSave: () => pending.promise });
  let save;
  await h.act(() => { save = h.find(n => n.props?.testID === 'party-room-entry-paid').onPress(); });
  await h.act(() => h.audience('public').onPress());
  await h.act(async () => { pending.resolve(sandboxOffer); await save; });
  assert.match(h.text(), /Saved sandbox entry: \$0\.99/);
  assert.equal(h.runtime.paidWrites.length, 1);
  assert.equal(h.runtime.setupWrites.length, 1);
  assert.equal(h.runtime.room.discoveryVisibility, 'public');
});

for (const transition of ['focus', 'background']) {
  for (const settleBeforeReturn of [true, false]) {
    test(`Party Room reconciles durable sandbox save across ${transition}, settle before return=${settleBeforeReturn}`, async t => {
      const pending = deferred();
      const h = await mount(t, { normal: true, checkoutAvailable: true, offerSave: () => pending.promise });
      let save;
      await h.act(() => { save = h.find(n => n.props?.testID === 'party-room-entry-paid').onPress(); });
      if (transition === 'focus') await h.focus(false); else await h.state('background');
      const finish = async () => {
        h.runtime.offers = [sandboxOffer];
        await h.act(async () => { pending.resolve(sandboxOffer); await save; });
      };
      if (settleBeforeReturn) await finish();
      if (transition === 'focus') await h.focus(true); else await h.state('active');
      if (!settleBeforeReturn) {
        // Resuming cannot release the in-flight write latch or advertise Free.
        await h.act(() => h.find(n => n.props?.testID === 'party-room-entry-paid').onPress());
        assert.equal(h.runtime.paidWrites.length, 1);
        assert.doesNotMatch(h.text(), /Viewer preview: Free entry/);
        await finish();
      }
      assert.match(h.text(), /Saved sandbox entry:/);
      assert.doesNotMatch(h.text(), /Sandbox Party Room entry saved|Viewer preview: Free entry/);
      assert.equal(h.runtime.setupWrites.length, 0);
      assert.equal(h.runtime.checkoutCalls, 0);
    });
  }
}
