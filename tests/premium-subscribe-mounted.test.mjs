import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolvePremiumPurchaseReadiness } from '../_lib/premiumPurchaseReadiness.mjs';
import { deferred, owner, same, premiumRuntime } from './helpers/premium-runtime-harness.mjs';

const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const code = ts.transpileModule(fs.readFileSync(process.env.PREMIUM_SUBSCRIBE_SOURCE || new URL('../app/subscribe.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  transformers: { before: [context => root => ts.visitEachChild(root, node => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== 'SubscribeScreen') return node;
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
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

async function mount(t, { active = false, providerActive = true } = {}) {
  const h = premiumRuntime(); h.state.active = active; h.state.providerActive = providerActive;
  let cache = await h.read(), tree;
  const state = { authority: owner(), focused: true, reads: 0, purchases: 0, restores: 0, reader: null, purchase: null, restore: null };
  const appListeners = new Set(), snapshotListeners = new Set();
  const mode = { enabled: false, mode: 'public', reason: '', storePurchaseRailReadbackComplete: true, storePurchaseRailState: 'on' };
  const mocks = {
    react: React,
    'expo-router': { useRouter: () => ({ push: noop, replace: noop, back: noop, canGoBack: () => true }),
      useFocusEffect(callback) { const focused = state.focused; React.useEffect(() => focused ? callback() : undefined, [callback, focused]); } },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'ImageBackground', 'ScrollView', 'Text', 'TouchableOpacity', 'View'].map(x => [x, x])),
      Platform: { OS: 'android' }, StyleSheet: { create: x => x }, AppState: { addEventListener(_, listener) { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../_lib/session': { useSession: () => ({ isLoading: false, isSignedIn: !!state.authority, user: state.authority ? { id: state.authority.userId } : null, authority: state.authority, authorityStatus: state.authority ? 'active' : 'signed_out' }) },
    '../_lib/accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same },
    '../_lib/betaProgram': { useOptionalBetaProgram: () => null }, '../_lib/analytics': { trackEvent: noop },
    '../_lib/premiumPurchaseReadiness.mjs': { resolvePremiumPurchaseReadiness },
    '../_lib/monetization': { getCachedMonetizationSnapshot: () => cache, hasCurrentStorePremiumSubscription: h.monetary.hasCurrentStorePremiumSubscription,
      subscribeToMonetizationSnapshot(listener) { snapshotListeners.add(listener); return () => snapshotListeners.delete(listener); },
      readMonetizationSnapshot: async options => { state.reads++; return state.reader ? state.reader(options) : cache; },
      resolveInternalTesterSandboxPurchaseMode: async () => mode, isPremiumPurchaseShellAvailableForMode: () => true, INTERNAL_TESTER_SANDBOX_PURCHASE_MODE: 'internal_tester_sandbox',
      purchaseMonetizationTarget: async () => { state.purchases++; return state.purchase ? state.purchase() : { snapshot: cache, message: 'purchase result' }; },
      restoreMonetizationAccess: async () => { state.restores++; return state.restore ? state.restore() : { snapshot: cache, message: 'restore result' }; }, openManageSubscriptionFlow: async () => true },
    '../components/ui/chillywood-visual-system': { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: 'Fill' },
  };
  const context = { exports: {}, require: name => { if (name.endsWith('.png')) return 1; assert.ok(name in mocks, `unmodeled import ${name}`); return mocks[name]; }, capture: value => { tree = value; return null; }, console };
  vm.runInNewContext(code, context);
  const root = createRoot(container());
  const act = async fn => React.act(async () => { await fn(); await settle(); });
  const render = () => act(() => root.render(React.createElement(context.exports.default)));
  await render(); t.after(() => React.act(async () => root.unmount()));
  const button = id => { const found = walk(tree, n => n.props?.testID === id); assert.equal(found.length, 1); return found[0].props; };
  return { state, act, render, button, text: () => walk(tree, n => n.type === 'Text').flatMap(n => typeof n.props.children === 'string' ? [n.props.children] : []).join('\n'),
    cache: () => cache, async snapshot(activeValue, provider = true) { h.state.active = activeValue; h.state.providerActive = provider; return h.read(); },
    emit: value => { cache = value; for (const listener of snapshotListeners) listener(); },
    foreground: () => { for (const listener of appListeners) listener('active'); },
    replace: async authority => { state.authority = authority; h.replace(authority); cache = h.monetary.getCachedMonetizationSnapshot(); await render(); },
  };
}

test('actual Subscribe screen offers verification and Restore instead of another active-store purchase', async t => {
  const h = await mount(t);
  assert.match(h.text(), /verification is pending/);
  assert.equal(h.button('premium-purchase-button').accessibilityLabel, 'Recheck Premium status');
  assert.equal(h.button('premium-restore-button').disabled, false);
  await h.act(() => h.button('premium-purchase-button').onPress());
  assert.equal(h.state.purchases, 0); assert.doesNotMatch(h.text(), /Premium is active\./);
  await h.act(() => h.button('premium-restore-button').onPress()); assert.equal(h.state.restores, 1);
});

test('actual screen drops an older refresh after a newer active refresh', async t => {
  const h = await mount(t, { providerActive: false }), old = deferred(), newer = deferred();
  const expired = h.cache(), active = await h.snapshot(true); let read = 0;
  h.state.reader = () => ++read === 1 ? old.promise : newer.promise;
  await h.act(h.foreground); await h.act(h.foreground);
  await h.act(() => newer.resolve(active)); assert.match(h.text(), /Premium is active\./);
  await h.act(() => old.resolve(expired)); assert.match(h.text(), /Premium is active\./);
});

test('actual screen cannot restore old active state after a newer expired refresh', async t => {
  const h = await mount(t, { active: true }), old = deferred(), newer = deferred();
  const active = h.cache(), expired = await h.snapshot(false, false); let read = 0;
  h.state.reader = () => ++read === 1 ? old.promise : newer.promise;
  await h.act(h.foreground); await h.act(h.foreground);
  await h.act(() => newer.resolve(expired)); await h.act(() => old.resolve(active));
  assert.doesNotMatch(h.text(), /Premium is active\./);
});

for (const replacement of [owner('replacement'), owner('b', 'other-user'), null]) test(`actual screen retires held read for ${replacement?.userId ?? 'logout'}/${replacement?.sessionGeneration ?? ''}`, async t => {
  const h = await mount(t, { active: true }), held = deferred(), active = h.cache();
  let reads = 0;
  h.state.reader = () => ++reads === 1 ? held.promise : h.cache(); await h.act(h.foreground);
  await h.replace(replacement); await h.act(() => held.resolve(active));
  assert.doesNotMatch(h.text(), /Premium is active\./);
});

test('captured purchase handler cannot dispatch for a replacement session', async t => {
  const h = await mount(t, { providerActive: false }), old = h.button('premium-purchase-button').onPress;
  await h.replace(owner('replacement')); await h.act(old); assert.equal(h.state.purchases, 0);
});

test('late Restore result does not overwrite a replacement account', async t => {
  const h = await mount(t), held = deferred(); h.state.restore = () => held.promise;
  let pending; await h.act(() => { pending = h.button('premium-restore-button').onPress(); });
  await h.replace(owner('replacement', 'other-user'));
  await h.act(() => held.resolve({ snapshot: h.cache(), message: 'old private account result' })); await pending;
  assert.doesNotMatch(h.text(), /old private account result|Purchases restored/);
});

test('double purchase tap uses one current-account operation', async t => {
  const h = await mount(t, { providerActive: false }), held = deferred(); h.state.purchase = () => held.promise;
  const press = h.button('premium-purchase-button').onPress; let pending, duplicate;
  await h.act(() => { pending = press(); duplicate = press(); });
  const purchaseCount = h.state.purchases;
  await h.act(() => held.resolve({ snapshot: h.cache(), message: 'done' })); await Promise.all([pending, duplicate]);
  assert.equal(purchaseCount, 1);
});

test('a newer refresh failure cannot be overwritten by a held older active result', async t => {
  const h = await mount(t, { providerActive: false }), held = deferred(), active = await h.snapshot(true); let reads = 0;
  h.state.reader = () => ++reads === 1 ? held.promise : Promise.reject(Error('unavailable'));
  await h.act(h.foreground); await h.act(h.foreground); await h.act(() => held.resolve(active));
  assert.doesNotMatch(h.text(), /Premium is active\./); assert.match(h.text(), /Unable to check Premium/);
});

test('an unexpected current read failure leaves active access unconfirmed until a successful recheck', async t => {
  const h = await mount(t, { active: true });
  h.state.reader = () => Promise.reject(Error('unavailable')); await h.act(h.foreground);
  assert.doesNotMatch(h.text(), /Premium is active\./);
  h.state.reader = null; await h.act(h.foreground); assert.match(h.text(), /Premium is active\./);
});

test('pending Recheck can reveal a ready new purchase but never opens the store itself', async t => {
  const h = await mount(t), freshInactive = await h.snapshot(false, false);
  assert.equal(h.button('premium-purchase-button').accessibilityLabel, 'Recheck Premium status');
  h.state.reader = () => freshInactive;
  await h.act(() => h.button('premium-purchase-button').onPress());
  assert.equal(h.state.purchases, 0, 'status-only Recheck never becomes a purchase action');
  assert.match(h.text(), /Start Premium/);
  await h.act(() => h.button('premium-purchase-button').onPress());
  assert.equal(h.state.purchases, 1, 'a separate explicit Start action remains available');
});
