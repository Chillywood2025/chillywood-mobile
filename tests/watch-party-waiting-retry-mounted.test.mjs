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
const source = fs.readFileSync(new URL('../app/watch-party/index.tsx', import.meta.url), 'utf8');
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
const room = (id = 'ROOM01') => ({ partyId: id, roomCode: id, hostUserId: 'host', roomType: 'live', status: 'active', joinPolicy: 'open', contentAccessRule: 'open', discoveryVisibility: 'private', discoveryTitle: null, titleId: null, sourceType: null, sourceId: null });
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
  const scope = { renderDeferredUnavailable: false, isPremiumGateSheet: true, freshGateEntitled: true,
    freshGateEntitledTargetId: 'premium', sheetState: { snapshot: {} }, setLoadingState: noop, setStatusMessage: noop,
    setStatusTone: noop, onPurchaseResult, onClose: () => assert.fail('current sheet must invoke its parent recheck') };
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

async function mount(t) {
  let tree;
  const runtime = { authority: owner(), focused: true, room: room(), params: { mode: 'live', partyId: 'ROOM01' }, premiumAllowed: true,
    reads: [], writes: [], premium: [], navigations: [], alerts: [], policy: null, gate: null, userReader: null };
  const appListeners = new Set();
  const AppState = { currentState: 'active', addEventListener: (_, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
  const gate = async options => { runtime.premium.push(options); return runtime.gate ? runtime.gate(options) : { allowed: runtime.premiumAllowed, reason: runtime.premiumAllowed ? 'allowed' : 'premium_required' }; };
  const mocks = {
    'react': React,
    'expo-router': { useRouter: () => ({ push: value => runtime.navigations.push(value), replace: noop, back: noop, canGoBack: () => true }), useLocalSearchParams: () => runtime.params,
      useFocusEffect(callback) { const focused = runtime.focused; React.useEffect(() => focused ? callback() : undefined, [callback, focused]); } },
    'react-native': { AppState, Platform: { OS: 'android' }, StyleSheet: { create: x => x }, Share: { share: noop }, ...Object.fromEntries(['ActivityIndicator', 'ImageBackground', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'TextInput', 'TouchableOpacity', 'View'].map(x => [x, x])) },
    '../../_lib/session': { useSession: () => ({ user: { id: runtime.authority.userId }, authority: runtime.authority, authorityStatus: 'active', isLoading: false, isSignedIn: true }) },
    '../../_lib/betaProgram': { useBetaProgram: () => ({ accessState: { status: 'active' }, isLoading: false, isActive: true }), getBetaAccessBlockCopy: () => ({ title: '', body: '' }) },
    '../../_lib/appConfig': { DEFAULT_APP_CONFIG: {}, readAppConfig: async () => ({}), resolveBrandingConfig: () => ({ appDisplayName: "Chi'llywood" }), resolveFeatureConfig: () => ({ watchPartyEnabled: true }), resolveMonetizationConfig: () => ({}) },
    '../../_lib/premiumWatchPartyAccess': { requireLiveFirstPremium: gate, requireWatchPartyLivePremium: gate, isRuntimeControlBlockedAccess: a => a?.reason === 'runtime_control_blocked', getRuntimeControlBlockedCopy: () => ({ message: 'Live is temporarily unavailable.' }), LIVE_FIRST_PREMIUM_UPSELL_COPY: { title: 'Premium required', message: 'Premium required' }, WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY: { title: 'Premium required', message: 'Premium required' } },
    '../../_lib/watchParty': { getPartyRoom: async id => { runtime.reads.push(id); return { ...runtime.room }; }, getSafePartyUserId: async () => runtime.userReader ? runtime.userReader() : runtime.authority.userId,
      setPartyRoomPolicies: async (id, changes) => { runtime.writes.push({ id, changes }); return runtime.policy ? runtime.policy(id, changes) : (runtime.room = { ...runtime.room, ...changes, discoveryTitle: changes.discoveryTitle?.trim() || null }); },
      createPartyRoom: async () => { throw new Error('prepared-room tests must not create another room'); }, touchOwnedPartyRoomActivity: noop },
    '../../_lib/watchPartyContentSources': { resolveWatchPartyContentDisplay: async () => ({ displayName: null }), resolveWatchPartyContentDisplayByParts: async () => ({ displayName: null }), resolveWatchPartySourceId: () => null, resolveWatchPartySourceType: () => null, rememberWatchPartyContentDisplayHandoff: noop },
    '../../_lib/paidWatchPartyTickets': { listMyPaidWatchPartyOffers: async () => [], formatPaidWatchPartyTicketPrice: () => '' },
    '../../_lib/monetization': { getMonetizationAccessSheetPresentation: () => ({}) },
    '../../_lib/actionSingleFlight.mjs': { createActionSingleFlightLatch },
    '../../_lib/watchPartyPreparedRoomReuse.mjs': { resolvePreparedWatchPartyRoomReuse },
    '../../_lib/watchPartyReturnNavigation.mjs': { WATCH_PARTY_WAITING_ROOM_ENTRY_SOURCE: 'waiting-room' },
    '../../_lib/creatorMoneyPurchaseAuthority': { isCreatorDigitalCheckoutShellAvailable: () => false },
    '../../_lib/accessEntitlements': { resolveRoomAccess: async () => ({ allowed: true }) },
    '../../_lib/analytics': { trackEvent: noop }, '../../_lib/logger': { debugLog: noop, reportRuntimeError: noop },
    '../../_lib/performancePolicy': { ROOM_HEARTBEAT_MS: 15000 }, '../../_data/titles': { titles: [] },
    '../../_lib/creatorMonetizationSetup': {}, '../../_lib/watch-party/room-shared': { PLAYER_WATCH_PARTY_SOURCE: 'player' },
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
    audience: value => find(n => n.props?.accessibilityLabel === `Set Live discovery to ${value}`),
    title: () => find(n => n.props?.accessibilityLabel === 'Live discovery title'),
    continue: () => find(n => n.props?.testID === 'watch-party-create-room'),
    sheet: () => find(n => n.type === 'AccessSheet' && n.props.visible),
    entered: () => walk(tree, n => n.type === 'LiveStage').length,
    act: async fn => React.act(async () => { await fn(); await settle(); }),
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
    assert.doesNotMatch(h.text(), /Live discovery saved/); assert.notEqual(h.title().value, 'obsolete');
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
