import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { deferred, owner, same, premiumRuntime } from './helpers/premium-runtime-harness.mjs';
import { resolvePremiumPurchaseReadiness } from '../_lib/premiumPurchaseReadiness.mjs';

const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const walk = (tree, predicate) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(n => walk(n, predicate))
  : [...(predicate(tree) ? [tree] : []), ...walk(tree.props?.children, predicate)];
const textOf = tree => walk(tree, n => n.type === 'Text').flatMap(n => typeof n.props.children === 'string' ? [n.props.children] : []).join('\n');
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

// Preserve both complete production screen functions, every hook and handler.
// Capture their returned React elements instead of asking the DOM to render RN.
const compile = (file, name, variable) => ts.transpileModule(fs.readFileSync(process.env[variable] || new URL(`../app/${file}.tsx`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  transformers: { before: [context => root => ts.visitEachChild(root, node => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== name) return node;
    const visit = n => {
      if (ts.isFunctionLike(n)) return n;
      if (ts.isReturnStatement(n) && n.expression) return ts.factory.updateReturnStatement(n, ts.factory.createCallExpression(ts.factory.createIdentifier('capture'), undefined, [n.expression]));
      return ts.visitEachChild(n, visit, context);
    };
    return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type,
      ts.factory.updateBlock(node.body, node.body.statements.map(visit)));
  }, context)] },
}).outputText;
const sources = {
  settings: compile('settings', 'SettingsScreen', 'PREMIUM_RETURN_SETTINGS_SOURCE'),
  subscribe: compile('subscribe', 'SubscribeScreen', 'PREMIUM_RETURN_SUBSCRIBE_SOURCE'),
};

// This is a composed iOS production-SOURCE test, not an App Store test. The real
// monetization module, cache, subscriptions, purchase/restore, readiness, and
// authority polling are shared by both screens. SDK/database/session/navigation
// boundaries are modeled. Provider success NEVER grants the modeled DB access.
// Only the independent reconciliation/projection boundary may change that state.
// Public purchase hold is untouched; actual sandbox rail resolution is exercised.
// Poll intervals alone are accelerated; all 12 production attempts still run.
async function mount(t, { active = false, providerActive = false } = {}) {
  const h = premiumRuntime('ios', { independentProjection: true, immediatePolls: true });
  Object.assign(h.state, { active, providerActive });
  const state = { route: 'settings', history: [], settingsReads: 0, subscribeReads: 0 };
  const trees = {}, appListeners = new Set();
  const appState = { currentState: 'active', addEventListener(_, listener) { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
  const root = createRoot(container());
  let screens;
  const render = () => root.render(React.createElement(React.Fragment, null,
    state.route !== 'login' ? React.createElement(screens.settings) : null, state.route === 'subscribe' ? React.createElement(screens.subscribe) : null));
  const router = {
    push(route) { assert.equal(route, '/subscribe'); state.history.push(state.route); state.route = 'subscribe'; render(); },
    back() { assert.equal(state.history.at(-1), 'settings'); state.route = state.history.pop(); render(); },
    canGoBack: () => state.history.length > 0,
    replace(route) {
      assert.equal(route, '/(auth)/login', 'only the genuine signed-out redirect may replace the stack');
      assert.equal(h.state.authority, null); state.route = 'login'; state.history = []; render();
    },
  };
  const common = {
    react: React,
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'ImageBackground', 'ScrollView', 'Text', 'TextInput', 'TouchableOpacity', 'Switch', 'View'].map(x => [x, x])),
      Platform: { OS: 'ios' }, StyleSheet: { create: x => x }, AppState: appState, Alert: { alert: noop }, Linking: {}, Vibration: {} },
    'expo-clipboard': {}, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../_lib/session': { useSession: () => ({ isLoading: false, isSignedIn: !!h.state.authority, user: h.state.authority ? { id: h.state.authority.userId } : null,
      authority: h.state.authority, authorityStatus: h.state.authority ? 'active' : 'signed_out' }) },
    '../_lib/accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => h.state.authority, sameAccountSessionAuthority: same,
      subscribeToAccountSessionAuthority: h.subscribeAuthority },
    '../_lib/betaProgram': { useOptionalBetaProgram: () => null },
    '../_lib/premiumPurchaseReadiness.mjs': { resolvePremiumPurchaseReadiness },
    '../_lib/accountDeletionRequests': { readMyAccountDeletionStatus: async () => ({ scheduled: false }) },
    '../_lib/analytics': { trackEvent: noop }, '../_lib/userFacingErrors': { getUserFacingErrorMessage: (_, fallback) => fallback },
    '../_lib/notifications': { readNotificationPreferences: async () => null, readCurrentPushRegistration: async () => null, readNativeCallAlertStatus: async () => null,
      hasPendingNotificationPreferenceWrite: () => false, subscribeToNotificationPreferenceWrites: () => noop,
      hasPendingNotificationPushRegistration: () => false, subscribeToNotificationPushRegistrations: () => noop,
      withNotificationPushPreferenceChange: async (_owner, operation) => await operation() },
    '../_lib/chillyChatCalls': { CHILLY_CHAT_RINGTONE_OPTIONS: [] }, '../_lib/chillyChatCallSoundAssets': { stopChillyChatCallSound: async () => {} },
    '../_lib/moderation': { getModerationAccess: () => ({}), canAccessAdminConsole: () => false, readMyPlatformRoleMemberships: async () => [] },
    '../_lib/legalPolicies': { LEGAL_POLICY_ROUTES: [] }, '../_lib/accessVisibility': { ACCESS_VISIBILITY_OPTIONS: [], getAccessVisibilityLabel: x => x },
    '../_lib/runtimeConfig': { getRuntimeLegalConfig: () => ({}) },
    '../_lib/iosNativeCalls': { readIosNativeCallsReadiness: async () => ({ available: false, buildEnabled: false, runtimeEnabled: false }), readIosVoipRegistrationStatus: async () => null },
    '../_lib/releaseDiagnostics': { readReleaseDiagnostics: () => ({}), sanitizeReleaseDiagnosticsForDisplay: x => x, formatReleaseDiagnosticsSummary: () => '' },
    '../_lib/supabase': { supabase: {} }, '../_lib/displayText': { maskEmailAddress: () => '' },
    '../_lib/usernameHandles': { formatUsernameHandle: x => x || '', normalizeUsernameHandle: x => x || '', validateUsernameHandle: () => ({ available: false, username: '' }) },
    '../_lib/userData': { isProfileMediaActive: () => false, readMyProfileAccessVisibility: async () => 'public', readUserProfile: async () => ({}) },
    '../_lib/profileMedia': {}, '../components/profile/profile-media-sheets': {},
    '../components/navigation/app-back-button': { AppBackButton: 'Back' }, '../components/ui/ProfileMediaImage': { ProfileMediaImage: 'Image' },
    '../components/ui/chillywood-visual-system': { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: 'Fill' },
  };
  screens = Object.fromEntries(Object.entries(sources).map(([screen, code]) => {
    const mocks = { ...common,
      'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({}),
        useFocusEffect(callback) { const focused = state.route === screen; React.useEffect(() => focused ? callback() : undefined, [callback, focused]); } },
      '../_lib/monetization': { ...h.monetary, readMonetizationSnapshot: options => {
        state[`${screen}Reads`]++; return h.monetary.readMonetizationSnapshot(options);
      } },
    };
    const context = { exports: {}, require: name => { if (name.endsWith('.png')) return 1; assert.ok(name in mocks, `unmodeled import ${name}`); return mocks[name]; },
      capture: value => { trees[screen] = value; return null; }, console, setTimeout, clearTimeout };
    vm.runInNewContext(code, context);
    return [screen, context.exports.default];
  }));
  const act = fn => React.act(async () => { await fn(); await settle(); });
  await act(render); t.after(() => React.act(async () => root.unmount()));
  const one = (tree, predicate) => { const found = walk(tree, predicate); assert.equal(found.length, 1); return found[0].props; };
  const section = () => one(trees.settings, n => n.props?.id === 'premium');
  const button = id => one(trees.subscribe, n => n.props?.testID === id);
  const refresh = () => walk({ props: section() }, n => n.type === 'TouchableOpacity')[0].props;
  const approveProjection = () => { h.state.reconcile = async (name, options) => {
    assert.equal(name, 'revenuecat-premium-reconcile');
    assert.equal(options.body.action, 'reconcile_current_customer');
    h.state.active = true; return { data: { entitlementActive: true }, error: null };
  }; };
  return { h, state, act, button, refresh, approveProjection, section,
    text: () => textOf(trees.subscribe), cache: () => h.monetary.getCachedMonetizationSnapshot(),
    status: () => section().value,
    async open() {
      // The first Manage Premium control is the always-visible utility button,
      // before the optional accordion copy of the same production handler.
      const manage = walk(trees.settings, n => n.type === 'TouchableOpacity' && textOf(n) === 'Manage Premium')[0];
      assert.ok(manage); await act(() => manage.props.onPress());
      assert.equal(state.route, 'subscribe'); assert.deepEqual(state.history, ['settings']);
    },
    async back() {
      await act(() => one(trees.subscribe, n => n.type === 'TouchableOpacity' && textOf(n) === '←').onPress());
      assert.equal(state.route, 'settings'); assert.deepEqual(state.history, []);
    },
    async press(action) { await act(() => button(`premium-${action}-button`).onPress()); },
    async start(action) { let pending; await act(() => { pending = button(`premium-${action}-button`).onPress(); }); return { pending }; },
    async replace(authority, activeValue = false) { await act(() => { h.state.active = activeValue; h.replace(authority); render(); }); },
  };
}

const assertActive = m => {
  assert.equal(m.status(), 'Active', 'settled Settings must reflect verified active access');
  assert.equal(m.section().summary, 'Premium is active on this account.');
  assert.equal(m.cache().targets.premium_subscription.hasEntitlement, true);
};
const assertInactive = m => {
  assert.equal(m.status(), 'Not active', 'settled Settings must not promote provider or stale state to access');
  assert.match(m.section().summary, /stay locked/);
  assert.equal(m.cache().targets.premium_subscription.hasEntitlement, false);
};

for (const action of ['purchase', 'restore']) test(`iOS ${action} returns to Settings with independently verified active truth`, async t => {
  const m = await mount(t, { providerActive: action === 'restore' });
  assertInactive(m); await m.open();
  assert.equal(m.cache().configuration.mode, 'ios-release');
  assert.equal(m.h.monetary.isPremiumPurchaseShellAvailable(), false, 'public hold stays intact');
  const held = deferred(), entered = deferred();
  m.h.state.reconcile = async () => { entered.resolve(); await held.promise; m.h.state.active = true; return { data: { entitlementActive: true }, error: null }; };
  const { pending } = await m.start(action); await entered.promise;
  assert.equal(m.h.state.active, false, 'SDK purchase/restore has no DB authority');
  assert.doesNotMatch(m.text(), /Premium is active\.|purchase completed|Purchases restored/);
  await m.act(() => held.resolve()); await m.act(() => pending);
  assert.match(m.text(), /Premium is active\./);
  const reads = m.state.settingsReads; await m.back();
  assert.equal(m.state.settingsReads, reads + 1, 'Back/focus performs a real authoritative refresh');
  assertActive(m);
  assert.equal(m.h.state.purchases, action === 'purchase' ? 1 : 0);
  assert.equal(m.h.state.restores, action === 'restore' ? 1 : 0);
  assert.equal(m.h.state.reconciles, 1);
  const request = action === 'purchase' ? m.h.state.purchaseRequests[0] : m.h.state.restoreRequests[0];
  if (action === 'purchase') assert.equal(request[0].product.identifier, 'com.chillywood.premium.monthly');
  assert.equal(same(request.at(-1).authority, m.h.state.authority), true);
  assert.equal(m.h.state.reconcileRequests[0][0], 'revenuecat-premium-reconcile');
  assert.equal(m.h.state.reconcileRequests[0][1].body.action, 'reconcile_current_customer');
});

test('iOS already-owned purchase restores once and returns verified Settings truth', async t => {
  const m = await mount(t); await m.open(); m.approveProjection();
  m.h.state.purchase = async () => { m.h.state.providerActive = true; throw { code: '6' }; };
  await m.press('purchase'); assert.match(m.text(), /Premium is active\./);
  await m.back(); assertActive(m);
  assert.equal(m.h.state.purchases, 1); assert.equal(m.h.state.restores, 1); assert.equal(m.h.state.reconciles, 1);
});

for (const action of ['purchase', 'restore']) test(`iOS ${action} failed reconciliation stays inactive on Settings return`, async t => {
  const m = await mount(t, { providerActive: action === 'restore' }); await m.open();
  m.h.state.reconcile = async () => ({ data: null, error: { message: 'modeled reconciliation failure' } });
  await m.press(action);
  assert.equal(m.h.state.active, false);
  assert.match(m.text(), /verification is pending/);
  assert.doesNotMatch(m.text(), /purchase completed|Purchases restored|Premium is active\./);
  assert.equal(m.h.state.pollDelays.length, 11, 'all 12 production authority attempts run');
  assert.ok(m.h.state.pollDelays.every(delay => delay === 1250));
  await m.back(); assertInactive(m);
  await m.open(); const purchases = m.h.state.purchases;
  assert.equal(m.button('premium-purchase-button').accessibilityLabel, 'Recheck Premium status');
  await m.press('purchase'); assert.equal(m.h.state.purchases, purchases, 'recheck never dispatches a second purchase');
});

for (const action of ['purchase', 'restore']) test(`iOS ${action} reconciliation response alone cannot grant Settings access`, async t => {
  const m = await mount(t, { providerActive: action === 'restore' }); await m.open();
  m.h.state.reconcile = async () => ({ data: { entitlementActive: true }, error: null });
  await m.press(action);
  assert.equal(m.h.state.active, false, 'response acknowledgment is separate from authoritative projection');
  assert.match(m.text(), /verification is pending/);
  assert.doesNotMatch(m.text(), /purchase completed|Purchases restored|Premium is active\./);
  await m.back(); assertInactive(m);
});

for (const action of ['purchase', 'restore']) test(`iOS ${action} unknown account authority returns Unable to verify in Settings`, async t => {
  const m = await mount(t, { providerActive: action === 'restore' }); await m.open();
  m.h.state.reconcile = async () => {
    m.h.state.entitlementReader = async keys => keys.map(entitlementKey => ({ entitlementKey, authoritative: false,
      state: 'UNKNOWN', isActive: false, grantsProtectedAccess: false }));
    return { data: null, error: { message: 'modeled projection unavailable' } };
  };
  await m.press(action); assert.doesNotMatch(m.text(), /purchase completed|Purchases restored|Premium is active\./);
  await m.back(); assert.equal(m.status(), 'Unable to verify');
  assert.doesNotMatch(m.section().summary, /is active|stay locked/);
  m.h.state.entitlementReader = null; await m.act(() => m.refresh().onPress()); assertInactive(m);
});

for (const [action, error, notice] of [
  ['purchase', { userCancelled: true }, /purchase was canceled/],
  ['purchase', Error('modeled store failure'), /purchase result is not verified/],
  ['restore', Error('modeled restore failure'), /Unable to restore purchases/],
]) test(`iOS ${action} ${notice.source} does not invent access on Settings return`, async t => {
  const m = await mount(t); await m.open();
  m.h.state[action] = async () => { throw error; };
  await m.press(action); assert.match(m.text(), notice);
  await m.back(); assertInactive(m); assert.equal(m.h.state.reconciles, 0);
});

test('iOS empty Restore returns settled inactive truth without a success receipt', async t => {
  const m = await mount(t); await m.open(); await m.press('restore');
  assert.match(m.text(), /did not verify an active Premium/);
  assert.doesNotMatch(m.text(), /Purchases restored|Premium is active\./);
  await m.back(); assertInactive(m); assert.equal(m.h.state.reconciles, 0);
});

test('iOS failed Restore preserves active Settings truth without claiming the restore succeeded', async t => {
  const m = await mount(t, { active: true, providerActive: true }); await m.open();
  m.h.state.restore = async () => { throw Error('modeled restore failure'); };
  await m.press('restore');
  assert.match(m.text(), /Unable to restore purchases right now/, 'failed Restore must retain its actual outcome');
  assert.doesNotMatch(m.text(), /Purchases restored/);
  await m.back(); assertActive(m);
  assert.equal(m.h.state.restores, 1); assert.equal(m.h.state.reconciles, 0);
});

for (const action of ['purchase', 'restore']) test(`iOS ${action} active cache cannot override expiry discovered on Settings return`, async t => {
  const m = await mount(t, { providerActive: action === 'restore' }); await m.open(); m.approveProjection(); await m.press(action);
  assert.equal(m.cache().targets.premium_subscription.hasEntitlement, true);
  m.h.state.active = false; m.h.state.providerActive = false;
  await m.back(); assertInactive(m);
});

test('iOS purchase return exposes a failed authority refresh and genuine Refresh recovers', async t => {
  const m = await mount(t); await m.open(); m.approveProjection(); await m.press('purchase');
  m.h.state.providerError = true; await m.back();
  assert.equal(m.status(), 'Unable to verify'); assert.doesNotMatch(m.section().summary, /is active|stay locked/);
  m.h.state.providerError = false; await m.act(() => m.refresh().onPress()); assertActive(m);
});

test('iOS purchase retires a held pre-navigation inactive Settings read', async t => {
  const m = await mount(t), held = deferred(), entered = deferred();
  const inactiveCustomer = m.h.customer();
  m.h.state.providerReader = () => { entered.resolve(); return held.promise; };
  await m.act(() => m.refresh().onPress()); await entered.promise;
  m.h.state.providerReader = null;
  await m.open(); m.approveProjection(); await m.press('purchase'); await m.back(); assertActive(m);
  await m.act(() => held.resolve(inactiveCustomer)); assertActive(m);
});

test('iOS Restore retires a held pre-navigation active Settings read after expiry', async t => {
  const m = await mount(t, { active: true, providerActive: true }), held = deferred(), entered = deferred();
  const oldCustomer = m.h.customer();
  m.h.state.providerReader = () => { entered.resolve(); return held.promise; };
  await m.act(() => m.refresh().onPress()); await entered.promise;
  m.h.state.providerReader = null; m.h.state.active = false; m.h.state.providerActive = false;
  await m.open(); await m.press('restore'); await m.back(); assertInactive(m);
  await m.act(() => held.resolve(oldCustomer)); assertInactive(m);
});

for (const fails of [false, true]) test(`iOS held return read cannot erase a newer expired shared snapshot, fails=${fails}`, async t => {
  const m = await mount(t); await m.open(); m.approveProjection(); await m.press('purchase');
  const held = deferred(), entered = deferred(), oldCustomer = m.h.customer();
  m.h.state.providerReader = () => { entered.resolve(); return held.promise; };
  await m.back(); await entered.promise;
  assert.equal(m.status(), 'Checking'); assert.doesNotMatch(m.section().summary, /is active|stay locked/);
  m.h.state.providerReader = null; m.h.state.active = false; m.h.state.providerActive = false;
  await m.act(() => m.h.read());
  await m.act(() => fails ? held.reject(Error('old read failed')) : held.resolve(oldCustomer));
  assertInactive(m);
});

for (const replacement of [owner('replacement'), owner('other-session', 'other-user')]) test(`iOS held return read preserves successor loading and settled truth for ${replacement.userId}`, async t => {
  const m = await mount(t); await m.open(); m.approveProjection(); await m.press('purchase');
  const held = deferred(), entered = deferred(), oldCustomer = m.h.customer();
  m.h.state.providerReader = () => { entered.resolve(); return held.promise; };
  await m.back(); await entered.promise; assert.equal(m.status(), 'Checking');
  const next = deferred(), nextEntered = deferred();
  m.h.state.providerReader = () => { nextEntered.resolve(); return next.promise; };
  m.h.state.providerActive = false; await m.replace(replacement); await nextEntered.promise;
  await m.act(() => held.resolve(oldCustomer));
  assert.equal(m.status(), 'Checking', 'retired return cannot clear successor loading');
  assert.equal(m.cache().targets.premium_subscription.hasEntitlement, false);
  await m.act(() => next.resolve(m.h.customer())); assertInactive(m);
  assert.equal(m.cache().userId, replacement.userId);
});

for (const action of ['purchase', 'restore']) test(`iOS ${action} finishing after Back updates the focused Settings shared cache`, async t => {
  const m = await mount(t, { providerActive: action === 'restore' }); await m.open(); m.approveProjection();
  const held = deferred(), entered = deferred();
  m.h.state[action] = async () => { entered.resolve(); await held.promise; m.h.state.providerActive = true;
    return action === 'purchase' ? { customerInfo: m.h.customer(), productIdentifier: m.h.product } : m.h.customer(); };
  const { pending } = await m.start(action); await entered.promise; await m.back(); assertInactive(m);
  const reads = m.state.settingsReads;
  await m.act(() => held.resolve()); await m.act(() => pending); assertActive(m);
  assert.equal(m.state.settingsReads, reads, 'cache notification updates Settings without a manual refresh');
});

for (const replacement of [owner('replacement'), owner('other-session', 'other-user'), null]) {
  for (const action of ['purchase', 'restore']) test(`iOS held ${action} return retires ${replacement?.userId ?? 'logout'}/${replacement?.sessionGeneration ?? ''}`, async t => {
    const m = await mount(t, { providerActive: action === 'restore' }); await m.open(); m.approveProjection();
    const held = deferred(), entered = deferred();
    const oldCustomer = { entitlements: { active: { premium: {} } }, activeSubscriptions: [m.h.product] };
    m.h.state[action] = async () => { entered.resolve(); await held.promise;
      return action === 'purchase' ? { customerInfo: oldCustomer, productIdentifier: m.h.product } : oldCustomer; };
    const { pending } = await m.start(action); await entered.promise;
    m.h.state.providerActive = false; await m.replace(replacement);
    if (replacement) await m.back(); else assert.equal(m.state.route, 'login', 'logout redirects instead of exposing old Settings');
    const reads = m.state.settingsReads;
    await m.act(() => held.resolve()); await m.act(() => pending);
    assert.equal(m.h.state.reconciles, 0, 'retired operation must not reconcile the successor account');
    assert.equal(m.h.state.active, false);
    if (replacement) assert.equal(m.status(), 'Not active'); else assert.equal(m.state.route, 'login');
    assert.equal(m.cache().userId, replacement?.userId ?? null);
    assert.equal(m.cache().targets.premium_subscription.hasEntitlement, false);
    assert.equal(m.state.settingsReads, reads);
  });
}
