import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { deferred, owner, same, premiumRuntime } from './helpers/premium-runtime-harness.mjs';

const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const code = ts.transpileModule(fs.readFileSync(process.env.PREMIUM_SETTINGS_SOURCE || new URL('../app/settings.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  transformers: { before: [context => root => ts.visitEachChild(root, node => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== 'SettingsScreen') return node;
    const visit = n => {
      if (ts.isFunctionLike(n)) return n;
      if (ts.isReturnStatement(n) && n.expression) return ts.factory.updateReturnStatement(n, ts.factory.createCallExpression(ts.factory.createIdentifier('capture'), undefined, [n.expression]));
      return ts.visitEachChild(n, visit, context);
    };
    return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type,
      ts.factory.updateBlock(node.body, node.body.statements.map(visit)));
  }, context)] },
}).outputText;
const walk = (tree, predicate) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(n => walk(n, predicate))
  : [...(predicate(tree) ? [tree] : []), ...walk(tree.props?.children, predicate)];
const settle = async () => { for (let i = 0; i < 70; i++) await Promise.resolve(); };

// Mount the actual screen and actual monetization owner. Only unrelated screen
// services and the account/database/store boundaries are modeled. No purchase,
// phone, provider, backend or native qualification is performed.
async function mount(t, { active = false, holdInitial = false } = {}) {
  const h = premiumRuntime(); h.state.active = active;
  if (holdInitial) { h.state.held = deferred(); h.state.entered = deferred(); }
  const state = { authority: h.state.authority, focused: true, reads: 0, rejectRead: false };
  let tree, unmounted = false;
  const appListeners = new Set(), router = { push: noop, replace: noop, back: noop, canGoBack: () => true };
  const appState = { currentState: 'active', addEventListener(_, listener) { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
  const mocks = {
    react: React,
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({}),
      useFocusEffect(callback) { const focused = state.focused; React.useEffect(() => focused ? callback() : undefined, [callback, focused]); } },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'ImageBackground', 'ScrollView', 'Text', 'TextInput', 'TouchableOpacity', 'Switch', 'View'].map(x => [x, x])),
      Platform: { OS: 'android' }, StyleSheet: { create: x => x }, AppState: appState, Alert: { alert: noop }, Linking: {}, Vibration: {} },
    'expo-clipboard': {}, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../_lib/session': { useSession: () => ({ isLoading: false, isSignedIn: !!state.authority, user: state.authority ? { id: state.authority.userId } : null,
      authority: state.authority, authorityStatus: state.authority ? 'active' : 'signed_out' }) },
    '../_lib/accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same, sameAccountSessionIdentity: same,
      subscribeToAccountSessionAuthority: h.subscribeAuthority },
    '../_lib/monetization': { ...h.monetary, readMonetizationSnapshot: options => { state.reads++; return state.rejectRead ? Promise.reject(Error('read unavailable')) : h.monetary.readMonetizationSnapshot(options); } },
    '../_lib/accountSessionActions': { accountSessionActionIdentity: () => null },
    '../_lib/accountDeletionRequests': { readMyAccountDeletionStatus: async () => ({ scheduled: false }) },
    '../_lib/analytics': { trackEvent: noop }, '../_lib/userFacingErrors': { getUserFacingErrorMessage: (_, fallback) => fallback },
    '../_lib/notifications': { readNotificationPreferences: async () => null, readCurrentPushRegistration: async () => null, readNativeCallAlertStatus: async () => null,
      hasPendingNotificationPreferenceWrite: () => false, subscribeToNotificationPreferenceWrites: () => noop,
      hasPendingNotificationPushRegistration: () => false, subscribeToNotificationPushRegistrations: () => noop,
      withNotificationPushPreferenceChange: async (_owner, operation) => await operation() },
    '../_lib/chillyChatCalls': { CHILLY_CHAT_RINGTONE_OPTIONS: [] }, '../_lib/chillyChatCallSoundAssets': { stopChillyChatCallSound: async () => {} },
    '../_lib/moderation': { getModerationAccess: () => ({}), canAccessAdminConsole: () => false, readMyPlatformRoleMemberships: async () => [] },
    '../_lib/legalPolicies': { LEGAL_POLICY_ROUTES: [] }, '../_lib/accessVisibility': { ACCESS_VISIBILITY_OPTIONS: [], getAccessVisibilityLabel: x => x },
    '../_lib/runtimeConfig': { getRuntimeLegalConfig: () => ({}) }, '../_lib/iosNativeCalls': {},
    '../_lib/releaseDiagnostics': { readReleaseDiagnostics: () => ({}), sanitizeReleaseDiagnosticsForDisplay: x => x, formatReleaseDiagnosticsSummary: () => '' },
    '../_lib/supabase': { supabase: {} }, '../_lib/displayText': { maskEmailAddress: () => '' },
    '../_lib/usernameHandles': { formatUsernameHandle: x => x || '', normalizeUsernameHandle: x => x || '', validateUsernameHandle: () => ({ available: false, username: '' }) },
    '../_lib/userData': { isProfileMediaActive: () => false, readMyProfileAccessVisibility: async () => 'public', readUserProfile: async () => ({}) },
    '../_lib/profileMedia': {}, '../components/profile/profile-media-sheets': {},
    '../components/navigation/app-back-button': { AppBackButton: 'Back' }, '../components/ui/ProfileMediaImage': { ProfileMediaImage: 'Image' },
    '../components/ui/chillywood-visual-system': { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: 'Fill' },
  };
  const context = { exports: {}, require: name => { if (name.endsWith('.png')) return 1; assert.ok(name in mocks, `unmodeled import ${name}`); return mocks[name]; }, capture: value => { tree = value; return null; }, console, setTimeout, clearTimeout };
  vm.runInNewContext(code, context);
  const root = createRoot(container()), act = async fn => React.act(async () => { await fn(); await settle(); });
  const render = () => act(() => root.render(React.createElement(context.exports.default)));
  const unmount = async () => { if (!unmounted) { unmounted = true; await React.act(async () => root.unmount()); } };
  await render(); t.after(unmount);
  const section = () => { const found = walk(tree, n => n.props?.id === 'premium'); assert.equal(found.length, 1); return found[0]; };
  const refresh = () => walk(section(), n => n.type === 'TouchableOpacity')[0].props;
  return { h, state, appListeners, act, render, unmount, refresh,
    status: () => section().props.value, summary: () => section().props.summary,
    async focus(focused) { state.focused = focused; await render(); },
    async app(next) { appState.currentState = next; await act(() => { for (const listener of appListeners) listener(next); }); },
    async replace(authority, activeValue) { state.authority = authority; h.state.active = activeValue; await act(() => h.replace(authority)); await render(); },
  };
}

test('Settings shows checking for an unfinished authority read, then the authoritative state', async t => {
  const m = await mount(t, { active: true, holdInitial: true });
  await m.h.state.entered.promise;
  assert.equal(m.status(), 'Checking'); assert.doesNotMatch(m.summary(), /stay locked|is active/);
  await m.act(() => m.h.state.held.resolve()); assert.equal(m.status(), 'Active');
});

test('Settings checks current authority when focused again and when returning from background', async t => {
  const m = await mount(t); assert.equal(m.status(), 'Not active');
  await m.focus(false); m.h.state.active = true; await m.focus(true);
  assert.equal(m.status(), 'Active');
  await m.app('background'); m.h.state.active = false; await m.app('active');
  assert.equal(m.status(), 'Not active');
});

test('Settings cannot apply an old account result or clear a newer account refresh', async t => {
  const m = await mount(t, { holdInitial: true }); await m.h.state.entered.promise;
  await m.replace(owner('session-b', 'second-user'), true);
  await m.act(() => m.h.read()); // Another real surface may refresh the shared cache.
  assert.equal(m.status(), 'Active');
  await m.act(() => m.h.state.held.resolve()); assert.equal(m.status(), 'Active');
  assert.equal(m.h.monetary.getCachedMonetizationSnapshot().userId, 'second-user');
});

test('Settings refresh retires on blur, retries on focus and does not replay duplicate refresh taps', async t => {
  const m = await mount(t), hold = deferred(), entered = deferred();
  m.h.state.providerReader = async () => { entered.resolve(); await hold.promise; return { activeSubscriptions: [], entitlements: { active: {} } }; };
  await m.act(() => { m.refresh().onPress(); m.refresh().onPress(); }); await entered.promise;
  assert.equal(m.state.reads, 2, 'mount plus one explicit refresh');
  await m.focus(false); m.h.state.providerReader = null; m.h.state.active = true; await m.focus(true);
  assert.equal(m.status(), 'Active'); await m.act(() => hold.resolve()); assert.equal(m.status(), 'Active');
});

test('Settings exposes unknown/error authority honestly and a real Refresh recovers', async t => {
  const m = await mount(t, { active: true }); assert.equal(m.status(), 'Active');
  m.h.state.providerError = true; await m.act(() => m.refresh().onPress());
  assert.equal(m.status(), 'Unable to verify'); assert.doesNotMatch(m.summary(), /is active|stay locked/);
  m.h.state.providerError = false; await m.act(() => m.refresh().onPress()); assert.equal(m.status(), 'Active');
  m.state.rejectRead = true; await m.act(() => m.refresh().onPress()); assert.equal(m.status(), 'Unable to verify');
  m.state.rejectRead = false; await m.act(() => m.refresh().onPress()); assert.equal(m.status(), 'Active');
});

test('Settings refreshes for same-user session replacement and removes foreground listeners on unmount', async t => {
  const m = await mount(t, { active: true });
  const previousReads = m.state.reads;
  await m.replace(owner('replacement-session'), false); assert.equal(m.status(), 'Not active');
  assert.equal(m.state.reads, previousReads + 1);
  assert.equal(m.appListeners.size, 2); await m.unmount(); assert.equal(m.appListeners.size, 0);
  assert.equal(m.h.state.purchases, 0); assert.equal(m.h.state.restores, 0); assert.equal(m.h.state.reconciles, 0);
});

test('retired account completion cannot stop the successor account loading indicator', async t => {
  const m = await mount(t, { holdInitial: true }); await m.h.state.entered.promise;
  const nextRead = deferred(), nextEntered = deferred();
  m.h.state.providerReader = () => { nextEntered.resolve(); return nextRead.promise; };
  await m.replace(owner('session-b', 'second-user'), true); assert.equal(m.state.reads, 2); await nextEntered.promise;
  assert.equal(m.status(), 'Checking');
  await m.act(() => m.h.state.held.resolve()); assert.equal(m.status(), 'Checking');
  await m.act(() => nextRead.resolve({ activeSubscriptions: [], entitlements: { active: {} } }));
  assert.equal(m.status(), 'Active');
});

test('background completion is retired and foreground does not refresh an unfocused Settings screen', async t => {
  const m = await mount(t, { holdInitial: true }); await m.h.state.entered.promise;
  await m.app('background'); m.h.state.active = true;
  await m.act(() => m.h.state.held.resolve());
  await m.focus(false); const reads = m.state.reads;
  await m.app('active'); assert.equal(m.state.reads, reads);
  await m.focus(true); assert.equal(m.status(), 'Active');
});

test('restore-only and signed-out owners cannot retain an active Premium display or trigger a read', async t => {
  const m = await mount(t, { active: true });
  const reads = m.state.reads;
  await m.replace({ ...owner('restore-only'), restoreOnly: true }, true);
  assert.equal(m.status(), 'Unable to verify');
  await m.act(() => m.refresh().onPress()); assert.equal(m.state.reads, reads);
  await m.replace(null, true); assert.equal(m.status(), 'Unable to verify');
  await m.app('active'); assert.equal(m.state.reads, reads);
});
