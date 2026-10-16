import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { deferred, owner, same } from './helpers/premium-runtime-harness.mjs';

const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client'), noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const code = ts.transpileModule(fs.readFileSync(process.env.ACCESS_SHEET_SOURCE || new URL('../components/monetization/access-sheet.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  transformers: { before: [context => root => ts.visitEachChild(root, node => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== 'AccessSheet') return node;
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
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const gate = () => ({ reason: 'premium_required', monetization: { qualifyingTargetIds: ['premium_subscription'], primaryTargetId: 'premium_subscription' } });

// Run every actual AccessSheet handler through the rendered controls. The
// parent's completion is held at its public callback boundary; parent action
// ownership is independently exercised by player-watch-party-actions-mounted.
async function mount(t, overrides = {}) {
  const state = { authority: owner(), focused: true, visible: true, gate: gate(), callbacks: [], reads: 0, purchases: 0, restores: 0, closes: 0,
    callback: null, reader: null, purchase: null, restore: null, manage: null, mode: null, navigations: [],
    entitled: true, primaryAction: 'retry', reason: 'premium_required', ...overrides };
  let tree, unmounted = false;
  const listeners = new Set(), authorityListeners = new Set(), timers = new Map(); let timerId = 0;
  const appState = { currentState: 'active', addEventListener(_, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const currentState = () => ({ snapshot: { userId: state.authority?.userId, status: 'ready', canMakePayments: true, activeEntitlementIds: ['premium'],
    targets: { premium_subscription: { hasEntitlement: state.entitled, entitlementAuthoritative: true } } }, presentation: { title: 'Premium', body: '', kicker: 'PREMIUM', actionLabel: 'Continue' },
    primaryAction: state.primaryAction, primaryLabel: 'Purchase', primaryDisabled: false, canRestore: true, canManage: true });
  const callback = async result => { state.callbacks.push(result); return state.callback ? state.callback(result) : { message: 'Current parent feedback', tone: 'success' }; };
  const mocks = {
    react: React, 'expo-router': { router: { push: x => state.navigations.push(x) }, useFocusEffect(fn) { React.useEffect(() => state.focused ? fn() : undefined, [fn, state.focused]); } },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'Modal', 'Pressable', 'Text', 'TouchableOpacity', 'View'].map(x => [x, x])), StyleSheet: { create: x => x }, AppState: appState },
    '../ui/chillywood-visual-system': { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: 'Fill' }, '../../_lib/analytics': { trackEvent: noop },
    '../../_lib/session': { useSession: () => ({ user: state.authority ? { id: state.authority.userId } : null, authority: state.authority, authorityStatus: state.authority ? 'active' : 'signed_out' }) },
    '../../_lib/accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same,
      subscribeToAccountSessionAuthority: fn => { authorityListeners.add(fn); return () => authorityListeners.delete(fn); } },
    '../../_lib/betaProgram': { useOptionalBetaProgram: () => null }, './MoneyScopeInfoButton': { MoneyScopeInfoButton: 'Scope' }, './money-ui': { MoneyOfferCard: 'Offer' },
    '../../_lib/monetization': { INTERNAL_TESTER_SANDBOX_PURCHASE_MODE: 'internal_tester_sandbox', resolveInternalTesterSandboxPurchaseMode: async () => state.mode ? state.mode() : ({ enabled: false, mode: 'public' }),
      readMonetizationAccessSheetState: async () => { state.reads++; return state.reader ? state.reader() : currentState(); },
      purchaseBlockedAccess: async () => { state.purchases++; return state.purchase ? state.purchase() : { ok: true, snapshot: currentState().snapshot, message: 'Purchase result' }; },
      restoreMonetizationAccess: async () => { state.restores++; return state.restore ? state.restore() : { ok: true, snapshot: currentState().snapshot, message: 'Restore result' }; },
      openManageSubscriptionFlow: async () => state.manage ? state.manage() : true },
  };
  const context = { exports: {}, require: name => { assert.ok(name in mocks, `unmodeled import ${name}`); return mocks[name]; }, capture: value => { tree = value; return null; },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), console };
  vm.runInNewContext(code, context);
  const root = createRoot(container()), act = async fn => React.act(async () => { await fn(); await settle(); });
  const render = () => act(() => root.render(React.createElement(context.exports.AccessSheet, { visible: state.visible, gate: state.gate, reason: state.reason,
    primaryActionTestID: 'purchase', recheckActionTestID: 'continue', onPurchaseResult: callback, onRestoreResult: callback, onClose: () => { state.closes++; state.visible = false; } })));
  const unmount = async () => { if (!unmounted) { unmounted = true; await React.act(async () => root.unmount()); } };
  await render(); t.after(unmount);
  const primary = () => { const buttons = walk(tree, n => n.type === 'TouchableOpacity' && n.props?.testID === 'continue'); assert.equal(buttons.length, 1); return buttons[0].props; };
  const mainAction = () => { const buttons = walk(tree, n => n.type === 'TouchableOpacity' && walk(n, child => child.type === 'Fill').length === 1);
    assert.equal(buttons.length, 1); return buttons[0].props; };
  const button = label => { const buttons = walk(tree, n => n.type === 'TouchableOpacity' && (n.props?.testID === label
    || walk(n, child => child.type === 'Text').some(child => child.props.children === label))); assert.equal(buttons.length, 1, label); return buttons[0].props; };
  return { state, act, render, primary, mainAction, button, listeners, authorityListeners, timers, unmount, currentState, appState,
    close: () => walk(tree, n => n.type === 'Modal')[0].props.onRequestClose(),
    text: () => walk(tree, n => n.type === 'Text').map(n => n.props.children).filter(x => typeof x === 'string').join('\n'),
    async retire(kind) {
      if (kind === 'dismiss') { walk(tree, n => n.type === 'Modal')[0].props.onRequestClose(); await render(); state.visible = true; }
      if (kind === 'account') state.authority = owner('b', 'other-user');
      if (kind === 'generation') state.authority = owner('replacement');
      if (kind === 'gate') state.gate = gate();
      if (kind === 'focus') { state.focused = false; await render(); state.focused = true; }
      if (kind === 'background') { await act(() => { appState.currentState = 'background'; for (const listener of listeners) listener('background'); }); appState.currentState = 'active'; }
      await render();
      if (kind === 'background') await act(() => { for (const listener of listeners) listener('active'); });
    },
  };
}

test('actual active Continue calls the parent once without a purchase, and current feedback remains visible', async t => {
  const h = await mount(t), held = deferred(); h.state.callback = () => held.promise;
  const primary = h.primary(); await h.act(() => { primary.onPress(); primary.onPress(); });
  assert.equal(h.state.callbacks.length, 1); assert.equal(h.state.purchases, 0);
  await h.act(() => held.resolve({ message: 'Current parent feedback', tone: 'success' }));
  assert.match(h.text(), /Current parent feedback/); assert.equal(h.primary().disabled, false);
});

for (const action of ['purchase', 'restore', 'continue']) {
  const stages = action === 'continue' ? ['callback'] : ['mode', 'provider', 'callback'];
  for (const stage of stages) test(`equivalent authority republication preserves held ${action} ${stage} ownership`, async t => {
    const h = await mount(t, action === 'continue' ? {} : { entitled: false, primaryAction: 'purchase',
      ...(action === 'restore' ? { reason: 'party_pass_required', gate: { reason: 'party_pass_required', monetization: { qualifyingTargetIds: [] } } } : {}) });
    const held = deferred();
    if (stage === 'mode') h.state.mode = () => held.promise;
    if (stage === 'provider') h.state[action] = () => held.promise;
    if (stage === 'callback') h.state.callback = () => held.promise;
    const control = action === 'continue' ? h.primary() : h.button(action === 'purchase' ? 'purchase' : 'Restore purchases');
    const primary = h.mainAction;
    await h.act(() => { control.onPress(); });
    assert.equal(primary().disabled, true, 'pending action starts busy');
    const reads = h.state.reads, authority = h.state.authority;
    // Session readback clones the object even when the semantic binding is the
    // same. Publish the real listener boundary and rerender the actual component.
    h.state.authority = { ...authority };
    await h.act(() => { for (const listener of h.authorityListeners) listener(h.state.authority); });
    await h.render();
    assert.notEqual(h.state.authority, authority); assert.equal(same(h.state.authority, authority), true);
    assert.equal(primary().disabled, true, 'equivalent authority must not release the in-flight busy latch');
    assert.equal(h.state.reads, reads, 'equivalent authority must not restart the focus read');
    // A retained old control is also single-flight after the harmless readback.
    await h.act(() => { control.onPress(); });
    assert.equal(h.state.callbacks.length, stage === 'callback' ? 1 : 0);
    if (action !== 'continue') assert.equal(h.state[action === 'purchase' ? 'purchases' : 'restores'], stage === 'mode' ? 0 : 1);
    h.state.mode = null;
    await h.act(() => held.resolve(stage === 'mode' ? { enabled: false, mode: 'public' }
      : stage === 'provider' ? { ok: true, snapshot: h.currentState().snapshot, message: 'Current provider result' }
        : { message: 'Current preserved callback', tone: 'success' }));
    assert.equal(h.state.callbacks.length, 1, 'current parent completion must not be dropped');
    if (action !== 'continue') assert.equal(h.state[action === 'purchase' ? 'purchases' : 'restores'], 1);
    assert.match(h.text(), stage === 'callback' ? /Current preserved callback/ : /Current parent feedback/);
    assert.equal(primary().disabled, false, 'current completion releases its own busy state');
    assert.equal(h.state.reads, reads + (action === 'continue' ? 0 : 1));
    assert.deepEqual(h.state.navigations, []);
  });
}

for (const action of ['purchase', 'restore', 'continue']) for (const transient of [false, true])
  test(`actual authority revocation retires held ${action} without rerender, transient=${transient}`, async t => {
    const h = await mount(t, action === 'continue' ? {} : { entitled: false, primaryAction: 'purchase',
      ...(action === 'restore' ? { reason: 'party_pass_required', gate: { reason: 'party_pass_required', monetization: { qualifyingTargetIds: [] } } } : {}) });
    const held = deferred();
    if (action === 'continue') h.state.callback = () => held.promise; else h.state[action] = () => held.promise;
    const control = action === 'continue' ? h.primary() : h.button(action === 'purchase' ? 'purchase' : 'Restore purchases');
    await h.act(() => { control.onPress(); });
    const initial = h.state.authority, reads = h.state.reads;
    await h.act(() => {
      h.state.authority = null;
      for (const listener of h.authorityListeners) listener(null);
      if (transient) {
        h.state.authority = { ...initial };
        for (const listener of h.authorityListeners) listener(h.state.authority);
      }
      // No component rerender or focus event is needed to revoke a held action.
      control.onPress();
    });
    await h.act(() => held.resolve(action === 'continue' ? { message: 'STALE revoked feedback' }
      : { ok: true, snapshot: h.currentState().snapshot, message: 'STALE revoked provider result' }));
    assert.equal(h.state.callbacks.length, action === 'continue' ? 1 : 0, 'revocation must prevent old provider delivery');
    if (action !== 'continue') assert.equal(h.state[action === 'purchase' ? 'purchases' : 'restores'], 1);
    assert.equal(h.state.reads, reads); assert.doesNotMatch(h.text(), /STALE/);
  });

for (const action of ['purchase', 'restore']) for (const stage of ['mode', 'provider', 'callback'])
  for (const kind of ['dismiss', 'account', 'generation', 'gate', 'focus', 'background'])
    test(`${action} ${stage} completion retires after ${kind}`, async t => {
      const h = await mount(t, { entitled: false, primaryAction: 'purchase',
        ...(action === 'restore' ? { reason: 'party_pass_required', gate: { reason: 'party_pass_required', monetization: { qualifyingTargetIds: [] } } } : {}) });
      const held = deferred();
      if (stage === 'mode') h.state.mode = () => held.promise;
      if (stage === 'provider') h.state[action] = () => held.promise;
      if (stage === 'callback') h.state.callback = () => held.promise;
      const control = h.button(action === 'purchase' ? 'purchase' : 'Restore purchases');
      await h.act(() => { control.onPress(); control.onPress(); });
      assert.equal(h.state[action === 'purchase' ? 'purchases' : 'restores'], stage === 'mode' ? 0 : 1);
      assert.equal(h.state.callbacks.length, stage === 'callback' ? 1 : 0);
      // Replacement sheet reads must not wait behind the retired mode lookup.
      h.state.mode = null;
      await h.retire(kind);
      const reads = h.state.reads;
      await h.act(() => held.resolve(stage === 'mode' ? { enabled: false, mode: 'public' }
        : stage === 'provider' ? { ok: true, snapshot: h.currentState().snapshot, message: 'STALE provider result' }
          : { message: 'STALE callback feedback', tone: 'error' }));
      assert.equal(h.state[action === 'purchase' ? 'purchases' : 'restores'], stage === 'mode' ? 0 : 1);
      assert.equal(h.state.callbacks.length, stage === 'callback' ? 1 : 0);
      assert.equal(h.state.reads, reads, 'retired action must not refresh a replacement sheet');
      assert.doesNotMatch(h.text(), /STALE/);
      assert.deepEqual(h.state.navigations, []);
    });

for (const opened of [true, false, 'reject']) for (const kind of ['dismiss', 'account', 'generation', 'gate', 'focus', 'background'])
  test(`management ${opened} completion retires after ${kind}`, async t => {
    const h = await mount(t, { reason: 'party_pass_required', gate: { reason: 'party_pass_required', monetization: { qualifyingTargetIds: [] } } });
    const held = deferred(); let calls = 0; h.state.manage = () => { calls++; return held.promise; };
    const control = h.button('Manage subscription');
    await h.act(() => { control.onPress(); control.onPress(); }); assert.equal(calls, 1);
    await h.retire(kind);
    await h.act(() => opened === 'reject' ? held.reject(Error('retired')) : held.resolve(opened));
    assert.deepEqual(h.state.navigations, []); assert.doesNotMatch(h.text(), /management opened|Unable to open/);
  });

test('dismissal synchronously retires retained controls before a parent rerender', async t => {
  const h = await mount(t), old = h.primary();
  await h.act(() => { h.close(); old.onPress(); old.onPress(); });
  assert.equal(h.state.callbacks.length, 0); assert.equal(h.state.purchases, 0);
});

test('transient authority change retires Continue even when initiating authority returns', async t => {
  const h = await mount(t), held = deferred(); h.state.callback = () => held.promise;
  await h.act(() => h.primary().onPress());
  for (const listener of h.authorityListeners) { listener(null); listener(h.state.authority); }
  await h.act(() => held.resolve({ message: 'STALE transient authority' }));
  assert.doesNotMatch(h.text(), /STALE/);
});

for (const action of ['purchase', 'restore']) test(`current ${action} result calls its parent once and refreshes the sheet`, async t => {
  const h = await mount(t, { entitled: false, primaryAction: 'purchase',
    ...(action === 'restore' ? { reason: 'party_pass_required', gate: { reason: 'party_pass_required', monetization: { qualifyingTargetIds: [] } } } : {}) });
  const held = deferred(); h.state[action] = () => held.promise;
  const control = h.button(action === 'purchase' ? 'purchase' : 'Restore purchases');
  await h.act(() => { control.onPress(); control.onPress(); });
  const reads = h.state.reads;
  await h.act(() => held.resolve({ ok: true, snapshot: h.currentState().snapshot, message: 'Result' }));
  assert.equal(h.state[action === 'purchase' ? 'purchases' : 'restores'], 1);
  assert.equal(h.state.callbacks.length, 1); assert.equal(h.state.reads, reads + 1);
  assert.match(h.text(), /Current parent feedback/);
});

for (const action of ['purchase', 'restore']) test(`unmount retires pending ${action} and removes all observers`, async t => {
  const h = await mount(t, { entitled: false, primaryAction: 'purchase',
    ...(action === 'restore' ? { reason: 'party_pass_required', gate: { reason: 'party_pass_required', monetization: { qualifyingTargetIds: [] } } } : {}) });
  const held = deferred(); h.state[action] = () => held.promise;
  await h.act(() => h.button(action === 'purchase' ? 'purchase' : 'Restore purchases').onPress());
  await h.unmount();
  await h.act(() => held.resolve({ ok: true, snapshot: h.currentState().snapshot, message: 'Retired' }));
  assert.equal(h.state.callbacks.length, 0); assert.equal(h.listeners.size, 0);
  assert.equal(h.authorityListeners.size, 0); assert.equal(h.timers.size, 0);
});

test('purchase and restore share the same synchronous action latch', async t => {
  const h = await mount(t, { entitled: false, primaryAction: 'purchase', reason: 'party_pass_required',
    gate: { reason: 'party_pass_required', monetization: { qualifyingTargetIds: [] } } });
  const held = deferred(); h.state.restore = () => held.promise;
  const restore = h.button('Restore purchases'), purchase = h.button('Purchase'), manage = h.button('Manage subscription');
  await h.act(() => { restore.onPress(); purchase.onPress(); manage.onPress(); });
  assert.equal(h.state.restores, 1); assert.equal(h.state.purchases, 0); assert.deepEqual(h.state.navigations, []);
  await h.act(() => held.resolve({ ok: true, snapshot: h.currentState().snapshot, message: 'Restored' }));
});

for (const opened of [true, false]) test(`current subscription management ${opened} keeps its expected result`, async t => {
  const h = await mount(t, { reason: 'party_pass_required', gate: { reason: 'party_pass_required', monetization: { qualifyingTargetIds: [] } } });
  h.state.manage = async () => opened;
  await h.act(() => h.button('Manage subscription').onPress());
  if (opened) { assert.match(h.text(), /Subscription management opened/); assert.deepEqual(h.state.navigations, []); }
  else { assert.deepEqual(h.state.navigations, ['/subscribe']); assert.equal(h.state.closes, 1); }
});

test('an older failed initial read cannot replace a newer convergence result', async t => {
  const old = deferred(), h = await mount(t, { reader: () => old.promise });
  h.state.reader = async () => h.currentState();
  await h.act(() => [...h.timers.values()][0]());
  assert.match(h.text(), /Premium is active/);
  await h.act(() => old.reject(Error('old read failed')));
  assert.match(h.text(), /Premium is active/); assert.doesNotMatch(h.text(), /Unable to load/);
  assert.equal(h.primary().disabled, false);
});

test('a snapshot for another account cannot advertise active Premium or Continue', async t => {
  const held = deferred(), h = await mount(t, { reader: () => held.promise });
  const wrong = h.currentState(); wrong.snapshot.userId = 'other-user';
  await h.act(() => held.resolve(wrong));
  assert.doesNotMatch(h.text(), /Premium is active|Continue/);
  assert.match(h.text(), /Premium required/); assert.equal(h.state.callbacks.length, 0);
});

test('the current sheet remains dismissible when account authority is unavailable', async t => {
  const h = await mount(t, { authority: null });
  await h.act(() => h.close());
  assert.equal(h.state.closes, 1); assert.equal(h.state.purchases, 0);
  assert.equal(h.state.restores, 0); assert.equal(h.state.callbacks.length, 0);
});

test('a sheet hidden in the background refreshes, rechecks and closes after an unseen foreground transition', async t => {
  const h = await mount(t);
  await h.act(() => {
    h.appState.currentState = 'background';
    for (const listener of h.listeners) listener('background');
  });
  h.state.visible = false; await h.render(); assert.equal(h.listeners.size, 0);
  h.appState.currentState = 'active';
  h.state.visible = true; await h.render();
  assert.equal(h.state.reads, 2); assert.equal(h.primary().disabled, false);
  await h.act(() => h.primary().onPress()); assert.equal(h.state.callbacks.length, 1);
  await h.act(() => h.close()); assert.equal(h.state.closes, 1);
});

for (const kind of ['dismiss', 'account', 'generation', 'gate', 'focus', 'background']) test(`late Continue feedback cannot overwrite a replacement sheet after ${kind}`, async t => {
  const h = await mount(t), held = deferred(); h.state.callback = () => held.promise;
  await h.act(() => h.primary().onPress()); await h.retire(kind);
  await h.act(() => held.resolve({ message: 'STALE parent feedback', tone: 'error' }));
  assert.doesNotMatch(h.text(), /STALE parent feedback/); assert.equal(h.primary().disabled, false);
  h.state.callback = null; await h.act(() => h.primary().onPress());
  assert.match(h.text(), /Current parent feedback/); assert.equal(h.state.purchases, 0);
});

test('retired Continue rejection cannot replace a newer message or release its busy state', async t => {
  const h = await mount(t), old = deferred(), current = deferred(); h.state.callback = () => old.promise;
  await h.act(() => h.primary().onPress()); await h.retire('dismiss'); h.state.callback = () => current.promise;
  await h.act(() => h.primary().onPress()); assert.equal(h.primary().disabled, true);
  await h.act(() => old.reject(Error('old callback failed')));
  assert.equal(h.primary().disabled, true); assert.doesNotMatch(h.text(), /could not be rechecked/);
  await h.act(() => current.resolve({ message: 'Current parent feedback' })); assert.equal(h.primary().disabled, false);
});

test('unmount removes observers and convergence timers while a parent callback is pending', async t => {
  const h = await mount(t), held = deferred(); h.state.callback = () => held.promise;
  await h.act(() => h.primary().onPress()); assert.equal(h.listeners.size, 1);
  await h.unmount(); await h.act(() => held.resolve({ message: 'unused' }));
  assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.state.purchases, 0);
});
