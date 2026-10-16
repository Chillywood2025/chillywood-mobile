import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createActionSingleFlightLatch } from '../_lib/actionSingleFlight.mjs';

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
const productionSource = fs.readFileSync(process.env.PLAYER_ACTION_SOURCE ?? new URL('../_lib/usePlayerWatchPartyActions.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(productionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const title = '11111111-1111-4111-8111-111111111111';
const owner = (userId = 'host', sessionGeneration = 'generation-a') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
const allowed = () => ({ allowed: true, reason: 'allowed', monetization: { issues: [] } });
const denied = () => ({ allowed: false, reason: 'premium_required', accessKey: title, monetization: { issues: [] } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

// Mount the complete production hook with real React hooks. Only platform, router
// and provider adapters are replaced. No action body or ownership predicate is copied.
async function mount(t, overrides = {}) {
  const FocusContext = React.createContext(true);
  const stateListeners = new Set(), authorityListeners = new Set();
  const runtime = { focused: true, authority: owner(), gates: [], creates: [], navigations: [], alerts: [], events: [],
    gate: async () => allowed(), host: async () => 'host', lookup: async () => ({ data: { id: title } }),
    create: async () => ({ partyId: 'ROOM-A', roomCode: 'ROOM-A', titleId: title, sourceType: 'platform_title', sourceId: title, hostUserId: 'host', isActive: true }),
    readRoom: async () => ({ partyId: 'ROOM-A', roomCode: 'ROOM-A', titleId: title, sourceType: 'platform_title', sourceId: title, hostUserId: 'host', isActive: true }) };
  const AppState = { currentState: 'active', addEventListener: (_event, callback) => {
    stateListeners.add(callback); return { remove: () => stateListeners.delete(callback) };
  } };
  const deps = {
    react: React,
    'react-native': { AppState, Alert: { alert: (...args) => runtime.alerts.push(args) } },
    'expo-router': { router: { push: arg => runtime.navigations.push(arg) },
      useFocusEffect: callback => {
        const focused = React.useContext(FocusContext);
        React.useEffect(() => focused ? callback() : undefined, [callback, focused]);
      } },
    './actionSingleFlight.mjs': { createActionSingleFlightLatch },
    './analytics': { trackEvent: (...args) => runtime.events.push(args) },
    './logger': { debugLog: noop },
    './supabase': { supabase: { from: () => ({ select: () => ({ eq: () => ({ returns: () => ({ maybeSingle: () => runtime.lookup() }) }) }) }) } },
    './watchPartyContentSources': { getCreatorVideoWatchPartyBlockCopy: () => null, getCreatorVideoWatchPartyBlockReason: () => null },
    './watchParty': { getSafePartyUserId: () => runtime.host(), getPartyRoom: id => runtime.readRoom(id), createPartyRoom: (...args) => { runtime.creates.push(args); return runtime.create(...args); } },
    './watch-party/room-shared': { PLAYER_WATCH_PARTY_SOURCE: 'player-watch-party-live' },
    './premiumWatchPartyAccess': { requireWatchPartyLivePremium: args => { runtime.gates.push(args); return runtime.gate(args); },
      isRuntimeControlBlockedAccess: value => value?.reason === 'feature_disabled' || value?.reason === 'entitlement_unknown',
      getRuntimeControlBlockedCopy: () => ({ title: 'Unavailable', message: 'Current access is unavailable.' }) },
    './accountSessionAuthority': {
      getCurrentAccountSessionAuthoritySnapshot: () => runtime.authority,
      sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId
        && a.sessionGeneration === b.sessionGeneration && a.state === 'ACTIVE' && b.state === 'ACTIVE' && a.restoreOnly === b.restoreOnly,
      subscribeToAccountSessionAuthority: listener => { authorityListeners.add(listener); return () => authorityListeners.delete(listener); },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { exports: module.exports, module, require: id => {
    assert.ok(id in deps, `unexpected production import ${id}`); return deps[id];
  }, console, setTimeout, clearTimeout });
  const useActions = module.exports.usePlayerWatchPartyActions;
  let latest, controls, mounted = true;
  const props = { cleanId: title, creatorVideo: null, displayItem: { id: title }, hasResolvedPlatformTitle: true,
    inWatchParty: false, isFocused: true, isPlaying: false, isSignedIn: true, item: { id: title, title: 'Title' },
    localTitle: null, playbackSourceKind: 'title', titleId: title, titleLoading: false, currentPositionRef: { current: 17 },
    sessionAuthority: runtime.authority, ...overrides };
  function Probe() {
    const [gate, setGate] = React.useState(denied());
    const [visible, setVisible] = React.useState(true);
    const [retry, setRetry] = React.useState(0);
    const [error, setError] = React.useState(null);
    const actions = useActions({ ...props, watchPartyPremiumGate: gate, watchPartyPremiumSheetVisible: visible,
      setWatchPartyPremiumGate: setGate, setWatchPartyPremiumSheetVisible: setVisible,
      setWatchPartyEntryRetryToken: setRetry, setWatchPartyEntryError: setError });
    latest = { ...actions, gate, visible, retry, error };
    controls = { setGate, setVisible };
    return null;
  }
  const root = createRoot(container());
  const act = async fn => { await React.act(async () => { await fn(); await settle(); }); };
  const render = () => root.render(React.createElement(FocusContext.Provider, { value: props.isFocused }, React.createElement(Probe)));
  await act(render);
  t.after(async () => { if (mounted) await act(() => root.unmount()); });
  const update = async patch => { Object.assign(props, patch); runtime.focused = props.isFocused; await act(render); };
  const begin = async action => { let promise; await act(() => { promise = latest[action]('purchase'); }); return { promise }; };
  return { runtime, act, update, authorityListeners, get current() { return latest; },
    beginStart: () => begin('onWatchParty'), beginContinue: () => begin('refreshWatchPartyPremiumAfterSheetAction'),
    start: () => act(() => latest.onWatchParty()), continue: () => act(() => latest.refreshWatchPartyPremiumAfterSheetAction('purchase')),
    replaceGate: gate => act(() => { controls.setGate(gate); controls.setVisible(true); }),
    dismiss: () => act(() => latest.closeWatchPartyPremiumSheet ? latest.closeWatchPartyPremiumSheet() : controls.setVisible(false)),
    authority: async next => { runtime.authority = next; await act(() => { authorityListeners.forEach(callback => callback(next)); }); await update({ sessionAuthority: next, isSignedIn: !!next }); },
    state: next => act(() => { AppState.currentState = next; stateListeners.forEach(callback => callback(next)); }),
    unmount: async () => { await act(() => root.unmount()); mounted = false; },
  };
}

test('active Continue rechecks without creating or navigating; a fresh Start creates once', async t => {
  const h = await mount(t); await h.continue();
  assert.equal(h.runtime.gates.length, 1); assert.equal(h.runtime.creates.length, 0); assert.equal(h.runtime.navigations.length, 0);
  assert.equal(h.current.visible, false); assert.equal(h.current.retry, 0);
  await h.start(); assert.equal(h.runtime.creates.length, 1); assert.equal(h.runtime.navigations.length, 1);
});

test('same-turn Continue presses share one current recheck', async t => {
  const h = await mount(t), d = deferred(); h.runtime.gate = () => d.promise;
  let first, second; await h.act(() => { const action = h.current.refreshWatchPartyPremiumAfterSheetAction; first = action('purchase'); second = action('purchase'); });
  assert.equal(h.runtime.gates.length, 1);
  await h.act(() => d.resolve(allowed())); await Promise.all([first, second]);
});

for (const retirement of ['account', 'generation', 'focus', 'background', 'target', 'dismiss']) {
  test(`Continue cannot settle over a newer gate after ${retirement}`, async t => {
    const h = await mount(t), d = deferred(); h.runtime.gate = () => d.promise;
    const pending = await h.beginContinue();
    if (retirement === 'account') await h.authority(owner('other'));
    if (retirement === 'generation') await h.authority(owner('host', 'generation-b'));
    if (retirement === 'focus') { await h.update({ isFocused: false }); await h.update({ isFocused: true }); }
    if (retirement === 'background') { await h.state('background'); await h.state('active'); }
    if (retirement === 'target') await h.update({ cleanId: 'next-title', titleId: 'next-title', item: { id: 'next-title' } });
    if (retirement === 'dismiss') await h.dismiss();
    const nextGate = { ...denied(), accessKey: 'newer-gate' }; await h.replaceGate(nextGate);
    await h.act(() => d.resolve(allowed())); await pending.promise;
    assert.equal(h.current.gate, nextGate); assert.equal(h.current.visible, true);
    assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.creates.length, 0);
  });
}

test('same-turn Start presses dispatch a single creation', async t => {
  const h = await mount(t), d = deferred(); h.runtime.gate = () => d.promise;
  let first, second; await h.act(() => { const action = h.current.onWatchParty; first = action(); second = action(); });
  assert.equal(h.runtime.gates.length, 1);
  await h.act(() => d.resolve(allowed())); await Promise.all([first, second]);
  assert.equal(h.runtime.creates.length, 1); assert.equal(h.runtime.navigations.length, 1);
});

for (const retirement of ['account', 'generation', 'focus', 'background', 'target', 'unmount']) {
  test(`Start's pending Premium read cannot create after ${retirement}`, async t => {
    const h = await mount(t), d = deferred(); h.runtime.gate = () => d.promise;
    const pending = await h.beginStart();
    if (retirement === 'account') await h.authority(owner('other'));
    if (retirement === 'generation') await h.authority(owner('host', 'generation-b'));
    if (retirement === 'focus') { await h.update({ isFocused: false }); await h.update({ isFocused: true }); }
    if (retirement === 'background') { await h.state('background'); await h.state('active'); }
    if (retirement === 'target') await h.update({ cleanId: 'next-title', titleId: 'next-title', item: { id: 'next-title' } });
    if (retirement === 'unmount') await h.unmount();
    await h.act(() => d.resolve(allowed())); await pending.promise;
    assert.equal(h.runtime.creates.length, 0); assert.equal(h.runtime.navigations.length, 0);
  });
}

for (const boundary of ['host', 'title']) test(`Start retires before creation after pending ${boundary} resolution`, async t => {
  const h = await mount(t, boundary === 'title' ? { item: { id: 'legacy-title', title: 'Title' } } : {}), d = deferred();
  if (boundary === 'host') h.runtime.host = () => d.promise; else h.runtime.lookup = () => d.promise;
  const pending = await h.beginStart(); await h.update({ isFocused: false });
  await h.act(() => d.resolve(boundary === 'host' ? 'host' : { data: { id: title } })); await pending.promise;
  assert.equal(h.runtime.creates.length, 0); assert.equal(h.runtime.navigations.length, 0);
});

test('a dispatched create remains blocked across blur/refocus and cannot navigate after retirement', async t => {
  const h = await mount(t), d = deferred(); h.runtime.create = () => d.promise;
  const pending = await h.beginStart(); assert.equal(h.runtime.creates.length, 1);
  await h.update({ isFocused: false }); await h.update({ isFocused: true });
  const retry = await h.beginStart(); assert.equal(h.runtime.creates.length, 1);
  await h.act(() => d.resolve({ partyId: 'ROOM-A', roomCode: 'ROOM-A', sourceType: 'platform_title', sourceId: title, hostUserId: 'host', isActive: true }));
  await Promise.all([pending.promise, retry.promise]);
  assert.equal(h.runtime.navigations.length, 0);
  await h.start(); assert.equal(h.runtime.creates.length, 1, 'retired successful creation needs exact reconciliation before another create');
});

test('preflight denial stays retryable without creating a room', async t => {
  const h = await mount(t); h.runtime.gate = async () => denied(); await h.start();
  assert.equal(h.runtime.creates.length, 0); assert.equal(h.current.visible, true);
  h.runtime.gate = async () => allowed(); await h.start();
  assert.equal(h.runtime.creates.length, 1); assert.equal(h.runtime.navigations.length, 1);
});

test('successful navigation stays latched until a fresh focus return', async t => {
  const h = await mount(t); await h.start(); await h.start();
  assert.equal(h.runtime.creates.length, 1); assert.equal(h.runtime.navigations.length, 1);
  assert.equal(h.current.watchPartyTransitionInFlight, true);
  await h.update({ isFocused: false }); await h.update({ isFocused: true });
  assert.equal(h.current.watchPartyTransitionInFlight, false);
  await h.start(); assert.equal(h.runtime.creates.length, 2); assert.equal(h.runtime.navigations.length, 2);
});

test('retired preflight can finish before a fresh ordinary Start succeeds', async t => {
  const h = await mount(t), d = deferred(); h.runtime.gate = () => d.promise;
  const pending = await h.beginStart(); await h.update({ isFocused: false }); await h.update({ isFocused: true });
  await h.act(() => d.resolve(allowed())); await pending.promise;
  assert.equal(h.runtime.creates.length, 0); assert.equal(h.current.watchPartyTransitionInFlight, false);
  h.runtime.gate = async () => allowed(); await h.start();
  assert.equal(h.runtime.creates.length, 1); assert.equal(h.runtime.navigations.length, 1);
});

test('older Continue cleanup cannot release or overwrite a newer recheck', async t => {
  const h = await mount(t), old = deferred(), fresh = deferred(); h.runtime.gate = () => old.promise;
  const oldRun = await h.beginContinue(); await h.dismiss(); await h.replaceGate(denied());
  h.runtime.gate = () => fresh.promise;
  const newRun = await h.beginContinue();
  await h.act(() => old.resolve(allowed())); await oldRun.promise;
  assert.equal(h.current.visible, true);
  const duplicate = await h.beginContinue(); assert.equal(h.runtime.gates.length, 2);
  await h.act(() => fresh.resolve(allowed())); await Promise.all([newRun.promise, duplicate.promise]);
  assert.equal(h.current.visible, false); assert.equal(h.runtime.creates.length, 0);
});

for (const result of ['reject', 'error', 'wrong-owner']) test(`unconfirmed create (${result}) never falls through to a new implicit preparation`, async t => {
  const h = await mount(t);
  h.runtime.create = async () => {
    if (result === 'reject') throw new Error('response lost');
    if (result === 'error') return { error: { code: 'unknown', message: 'unconfirmed' } };
    return { partyId: 'OTHER', roomCode: 'OTHER', sourceType: 'platform_title', sourceId: title, hostUserId: 'other', isActive: true };
  };
  h.runtime.readRoom = async () => null;
  await h.start(); await h.start();
  assert.equal(h.runtime.creates.length, 1); assert.equal(h.runtime.navigations.length, 0);
  assert.ok(h.runtime.alerts.length > 0);
});

test('retired creation resumes only the exact current owned room on fresh Start', async t => {
  const h = await mount(t), d = deferred(); h.runtime.create = () => d.promise;
  const pending = await h.beginStart(); await h.update({ isFocused: false });
  await h.act(() => d.resolve({ partyId: 'ROOM-A', roomCode: 'ROOM-A', sourceType: 'platform_title', sourceId: title, hostUserId: 'host', isActive: true }));
  await pending.promise; await h.update({ isFocused: true });
  h.runtime.readRoom = async () => ({ partyId: 'OTHER', roomCode: 'OTHER', sourceType: 'platform_title', sourceId: title, hostUserId: 'host', isActive: true });
  await h.start(); assert.equal(h.runtime.navigations.length, 0); assert.equal(h.runtime.creates.length, 1);
  h.runtime.readRoom = async () => ({ partyId: 'ROOM-A', roomCode: 'ROOM-A', sourceType: 'platform_title', sourceId: title, hostUserId: 'host', isActive: true });
  await h.start(); assert.equal(h.runtime.creates.length, 1); assert.equal(h.runtime.navigations.length, 1);
  assert.equal(h.runtime.navigations[0].params.roomId, 'ROOM-A');
});

test('creator-video Start retains the creator source and uses no platform title', async t => {
  const h = await mount(t, { playbackSourceKind: 'creator-video', creatorVideo: { id: 'creator-source' }, item: null });
  h.runtime.create = async () => ({ partyId: 'CREATOR', roomCode: 'CREATOR', hostUserId: 'host', sourceType: 'creator_video', sourceId: 'creator-source', isActive: true });
  await h.start(); assert.equal(h.runtime.creates.length, 1);
  assert.equal(h.runtime.creates[0][0], null); assert.equal(h.runtime.creates[0][4].sourceType, 'creator_video');
  assert.equal(h.runtime.navigations[0].params.sourceId, 'creator-source');
});

test('in-room Continue retains its explicit entry retry behavior without creating', async t => {
  const h = await mount(t, { inWatchParty: true, partyId: 'EXISTING' }); await h.continue();
  assert.equal(h.current.retry, 1); assert.equal(h.runtime.creates.length, 0); assert.equal(h.runtime.navigations.length, 0);
});

test('unavailable runtime authority never creates or enters', async t => {
  const h = await mount(t); h.runtime.gate = async () => ({ ...denied(), reason: 'entitlement_unknown' });
  await h.start(); assert.equal(h.runtime.creates.length, 0); assert.equal(h.runtime.navigations.length, 0);
  assert.equal(h.current.visible, false); assert.equal(h.runtime.alerts.length, 1);
});

test('a proved pre-insert Premium denial stays retryable after access recovers', async t => {
  const h = await mount(t); const ordinaryCreate = h.runtime.create;
  h.runtime.create = async () => ({ error: { code: 'premium_required', message: 'Premium required', payload: { monetizationReason: 'premium_required' } } });
  await h.start(); assert.equal(h.runtime.navigations.length, 0);
  h.runtime.create = ordinaryCreate; await h.start();
  assert.equal(h.runtime.creates.length, 2); assert.equal(h.runtime.navigations.length, 1);
});

test('a proved server rejection permits only a fresh Start after recovery', async t => {
  const h = await mount(t), ordinaryCreate = h.runtime.create;
  h.runtime.create = async () => ({ error: { code: '42501', message: 'Permission denied',
    payload: { mutationDispatched: true, mutationRejected: true } } });
  await h.start(); assert.equal(h.runtime.creates.length, 1); assert.equal(h.runtime.navigations.length, 0);
  h.runtime.create = ordinaryCreate; await h.start();
  assert.equal(h.runtime.creates.length, 2); assert.equal(h.runtime.navigations.length, 1);
});

for (const invalid of ['signed-out', 'restore-only', 'inactive']) test(`Start refuses ${invalid} owner`, async t => {
  const authority = invalid === 'signed-out' ? null : invalid === 'restore-only'
    ? { ...owner(), restoreOnly: true } : { ...owner(), state: 'REVOKED' };
  const h = await mount(t, { sessionAuthority: authority, isSignedIn: invalid !== 'signed-out' });
  h.runtime.authority = authority;
  await h.start(); assert.equal(h.runtime.gates.length, 0); assert.equal(h.runtime.creates.length, 0); assert.equal(h.runtime.navigations.length, 0);
});

for (const action of ['Start', 'Continue']) for (const transient of [false, true])
  test(`${action} retires snapshot revocation without hook rerender, transient=${transient}`, async t => {
    const h = await mount(t), d = deferred(); h.runtime.gate = () => d.promise;
    const pending = await h[`begin${action}`](), old = h.runtime.authority;
    h.runtime.authority = null; h.authorityListeners.forEach(fn => fn(null));
    if (transient) { h.runtime.authority = old; h.authorityListeners.forEach(fn => fn(old)); }
    await h.act(() => d.resolve(allowed())); await pending.promise;
    assert.equal(h.runtime.creates.length, 0); assert.equal(h.runtime.navigations.length, 0);
    assert.equal(h.current.visible, true); assert.equal(h.current.retry, 0);
  });
