import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js';

// Mount the complete production provider with real React effects, the actual
// authority singleton, mutation guard, and deletion request parser. Only native
// services, auth events, and RPC transport are modeled; no live account writes.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container();
globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const owner = (userId = 'a', sessionGeneration = 'session-a', restoreOnly = true) => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly });
const session = (binding, version = 1) => binding && ({ access_token: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: binding.userId, session_id: binding.sessionGeneration, version })).toString('base64url'), 'fixture'].join('.'), user: { id: binding.userId } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const plain = value => JSON.parse(JSON.stringify(value));

async function mount(t, { initial = owner(), oldSource = false, restoreScreen = false, oldScreen = false, oldSignOut = false, noCallerGuards = false } = {}) {
  const state = { binding: initial, session: session(initial), view: null, providerRead: null, transport: null, requests: [], revoked: [], screen: null, refreshes: [], publicSignOuts: [], exactSignOuts: [], signOutGate: null, signOutError: null, storageReadGate: null, sessionReadGate: null };
  const storageValues = new Map(initial ? [['fixture-auth', JSON.stringify(state.session)]] : []);
  let authListener; const timers = new Map(); let timerId = 0;
  const supabase = {
    auth: { getSession: async () => { if (state.sessionReadGate) await state.sessionReadGate.promise; return { data: { session: state.session } }; },
      initializePromise: Promise.resolve(), lockAcquireTimeout: 1000,
      _acquireLock: async (_timeout, operation) => operation(),
      _notifyAllSubscribers: async event => { assert.equal(event, 'SIGNED_OUT'); state.session = null; state.binding = null; authListener?.(event, null); },
      admin: { signOut: async (token, scope) => { state.exactSignOuts.push({ token, scope }); if (state.signOutGate) await state.signOutGate.promise; return { error: state.signOutError }; } },
      refreshSession: async () => { state.refreshes.push(state.session?.user.id); return { data: { session: state.session }, error: null }; },
      onAuthStateChange(callback) { authListener = callback; return { data: { subscription: { unsubscribe() { authListener = null; } } } }; },
      signOut: async () => { state.publicSignOuts.push(state.session?.user.id); } },
    rpc: async name => {
      assert.equal(name, 'wave1_session_authority_readback');
      const binding = state.binding;
      if (state.providerRead) return state.providerRead(binding);
      return { data: binding && { ...binding, authoritative: true }, error: null };
    },
  };
  const storage = { getItem: async () => null, removeItem: async () => {}, setItem: async () => {} };
  const mocks = {
    '@supabase/supabase-js': { isAuthApiError, isAuthSessionMissingError },
    react: React, 'react-native': { Platform: { OS: 'web' } },
    '@react-native-async-storage/async-storage': storage,
    './supabase': { supabase, SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture' },
    './entitlementAuthority': { withAuthorityReadDeadline: async promise => promise },
    './accountAccess': { readAccountAccessStatus: async () => ({ scheduledDeletion: state.binding?.restoreOnly === true, restricted: state.binding?.restoreOnly === true, authSuspended: false }) },
    './analytics': { clearUser: noop, identifyUser: noop, trackEvent: noop },
    './devDebug': { reportDebugAuth: noop }, './mediaSessionLifecycle': { stopActiveMediaSessions: async () => {} },
    './notifications': { revokePushOwnershipForSession: async binding => { state.revoked.push(binding); return { status: 'ok' }; } },
    './revenuecat': { syncRevenueCatCustomerIdentity: async () => {} },
    './accountBoundSupabaseRpc.mjs': {
      isAccountBoundSupabaseRpcOutcomeAmbiguous: () => false,
      invokeAccountBoundSupabaseRpc: async request => {
        state.requests.push(request);
        if (state.transport) return state.transport(request);
        return { data: request.functionName === 'wave1_session_authority_readback' ? { ...state.binding, authoritative: true } : { restored: true }, error: null };
      },
    },
  };
  function load(file) {
    let source;
    if (file === '_restore-screen.tsx') {
      const layout = fs.readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
      const ast = ts.createSourceFile('layout.tsx', layout, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AccountRestoreOnlyScreen');
      assert.ok(declaration); source = declaration.getText(ast);
      if (oldScreen) {
        source = source.replace('    if (!authority || authorityStatus !== "restore_only" || !authority.restoreOnly\n      || scope.pending || !isCurrent()\n      || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return;', '    if (busy) return;')
          .replace('restoreScheduledAccountDeletion(authority, isCurrent)', 'restoreScheduledAccountDeletion()')
          .replace('      if (!isCurrent()) return;\n', '');
      }
      if (oldSignOut) source = source.replace('onPress={() => { void signOut(); }} disabled={busy}', 'onPress={() => { void supabase.auth.signOut(); }}');
      source = `import React, { useState, useEffect, useRef } from 'react';
        import { useSession } from './session';
        import { restoreScheduledAccountDeletion } from './accountDeletionRequests';
        import { signOutExactAccountSession } from './accountSessionActions';
        import { getAccountNavigationTreeKey, getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, sameAccountSessionIdentity, subscribeToAccountSessionAuthority } from './accountSessionAuthority';
        import { supabase } from './supabase';
        export ${source.replace('  return (\n    <ChillywoodBrandedSurface', '  return capture(\n    <ChillywoodBrandedSurface')}`;
    } else source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    if (noCallerGuards && ['_lib/accountSessionActions.ts', '_lib/accountBoundSupabaseMutation.ts'].includes(file)) {
      source = source.replaceAll('!isCurrent()', 'false');
    }
    if (oldSource && file === '_lib/session.tsx') {
      const boundary = 'publishAccountSessionAuthoritySnapshot(nextAuthority);\n            setAuthority(nextAuthority); setSession(currentSession); setUser(null);';
      assert.ok(source.includes(boundary), 'negative control removes only restoration publication');
      source = source.replace(boundary, 'setAuthority(nextAuthority); setSession(currentSession); setUser(null);');
    }
    const context = { exports: {}, console, atob, capture: tree => { state.screen = tree; return null; }, styles: {},
      ...Object.fromEntries(['ChillywoodBrandedSurface', 'ChillywoodGlassPanel', 'Text', 'TouchableOpacity', 'ChillywoodPrimaryActionFill'].map(name => [name, name])),
      setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
      clearTimeout(id) { timers.delete(id); }, require(name) { assert.ok(name in mocks, `unmodeled import ${name}`); return mocks[name]; } };
    vm.runInNewContext(ts.transpileModule(source, { fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, context);
    return context.exports;
  }
  const authority = mocks['./accountSessionAuthority'] = load('_lib/accountSessionAuthority.ts');
  const accountStorage = load('_lib/accountSessionStorage.ts').createAccountSessionStorage({
    getItem: async key => { if (state.storageReadGate) { const gate = state.storageReadGate; state.storageReadGate = null; await gate.promise; } return storageValues.get(key) ?? null; },
    setItem: async (key, value) => { storageValues.set(key, value); },
    removeItem: async key => { storageValues.delete(key); },
  });
  Object.assign(mocks['./supabase'], { accountSessionStorage: accountStorage, ACCOUNT_SESSION_STORAGE_KEY: 'fixture-auth' });
  mocks['./accountSessionActions'] = load('_lib/accountSessionActions.ts');
  const mutations = mocks['./accountBoundSupabaseMutation'] = load('_lib/accountBoundSupabaseMutation.ts');
  const deletion = load('_lib/accountDeletionRequests.ts');
  const provider = load('_lib/session.tsx');
  mocks['./session'] = provider; mocks['./accountDeletionRequests'] = deletion;
  const Screen = restoreScreen ? load('_restore-screen.tsx').AccountRestoreOnlyScreen : null;
  function Consumer() { state.view = provider.useSession(); return Screen ? React.createElement(Screen) : null; }
  const root = createRoot(container()); let mounted = true;
  const flush = async () => React.act(async () => {
    await settle();
    for (const [id, timer] of timers) if (timer.delay === 0) { timers.delete(id); timer.callback(); }
    await settle();
  });
  const unmount = async () => { if (!mounted) return; mounted = false; await React.act(async () => root.unmount()); };
  t.after(unmount);
  await React.act(async () => { root.render(React.createElement(provider.SessionProvider, null, React.createElement(Consumer))); await settle(); });
  await flush();
  return { state, authority, mutations, deletion, flush, unmount, storageValues,
    restoreButton() {
      const find = node => !node ? null : Array.isArray(node) ? node.map(find).find(Boolean)
        : node.type === 'TouchableOpacity' && Object.hasOwn(node.props, 'disabled') ? node.props
          : find(node.props?.children);
      return find(state.screen);
    },
    signOutButton() {
      const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : text(node?.props?.children ?? '');
      const find = node => !node ? null : Array.isArray(node) ? node.map(find).find(Boolean)
        : node.type === 'TouchableOpacity' && /Sign(?:ing)? out/.test(text(node)) ? node.props : find(node.props?.children);
      return find(state.screen);
    },
    async press(button) { await React.act(async () => { button.onPress(); await settle(); }); },
    async change(binding, event = 'SIGNED_IN', version = 1) {
      await React.act(async () => {
        state.binding = binding; state.session = session(binding, version);
        if (state.session) await accountStorage.storage.setItem('fixture-auth', JSON.stringify(state.session));
        else await accountStorage.storage.removeItem('fixture-auth');
        authListener(event, state.session); await settle();
      });
      await flush();
    },
  };
}

for (const initial of [null, owner('b', 'session-b', false)]) test(`fresh/replacement login publishes restore-only authority (${initial ? 'replacement' : 'fresh'})`, async t => {
  const h = await mount(t, { initial }); await h.change(owner());
  assert.equal(h.state.view.authorityStatus, 'restore_only');
  assert.equal(h.state.view.user, null); assert.equal(h.state.view.isSignedIn, false);
  assert.deepEqual(plain(h.authority.getCurrentAccountSessionAuthoritySnapshot()), owner());
  assert.equal((await h.deletion.restoreScheduledAccountDeletion(h.state.view.authority)).restored, true);
  assert.deepEqual(h.state.requests.map(r => r.functionName), ['wave1_session_authority_readback', 'restore_scheduled_account_deletion']);
  assert.ok(h.state.requests.every(r => r.accessToken === session(owner()).access_token));
  await assert.rejects(h.mutations.captureAccountBoundSupabaseMutationSubject(), /account changed/i);
  await assert.rejects(h.mutations.runExactSessionAccountBoundSupabaseMutationRpc('join_communication_room_session'), /account changed/i);
  assert.equal(h.state.requests.length, 2, 'ordinary actions never dispatch');
});

test('same-session deletion transition replaces active snapshot, and token refresh preserves restoration', async t => {
  const h = await mount(t, { initial: owner('a', 'session-a', false) });
  await h.change(owner(), 'TOKEN_REFRESHED', 2);
  assert.deepEqual(plain(h.authority.getCurrentAccountSessionAuthoritySnapshot()), owner());
  await assert.rejects(h.mutations.captureAccountBoundSupabaseMutationSubject(), /account changed/i);
  await h.deletion.restoreScheduledAccountDeletion(h.state.view.authority);
  assert.ok(h.state.requests.every(r => r.accessToken === session(owner(), 2).access_token));
});

for (const replacement of [owner('b', 'session-b'), owner('a', 'new-session')]) test(`retained restore intent cannot target ${replacement.userId}:${replacement.sessionGeneration}`, async t => {
  const h = await mount(t); const expected = h.state.view.authority;
  await h.change(replacement);
  await assert.rejects(h.deletion.restoreScheduledAccountDeletion(expected), /account changed/i);
  assert.equal(h.state.requests.length, 0);
});

test('late provider read cannot overwrite a newer account or republish after unmount', async t => {
  const h = await mount(t); const gate = deferred();
  h.state.providerRead = binding => binding.userId === 'a' ? gate.promise : Promise.resolve({ data: { ...binding, authoritative: true }, error: null });
  await h.change(owner(), 'TOKEN_REFRESHED', 2);
  await h.change(owner('b', 'session-b'));
  await React.act(async () => { gate.resolve({ data: { ...owner(), authoritative: true }, error: null }); await settle(); });
  assert.equal(h.authority.getCurrentAccountSessionAuthoritySnapshot().userId, 'b');
  const late = deferred(); h.state.providerRead = () => late.promise;
  await h.change(owner('b', 'session-b'), 'TOKEN_REFRESHED', 2); await h.unmount();
  late.resolve({ data: { ...owner('b', 'session-b'), authoritative: true }, error: null }); await settle();
  assert.equal(h.authority.getCurrentAccountSessionAuthoritySnapshot(), null);
});

test('replacement during restoration readback prevents dispatch, replacement after dispatch retires completion', async t => {
  const h = await mount(t); const gate = deferred();
  h.state.transport = () => gate.promise;
  const pending = h.deletion.restoreScheduledAccountDeletion(h.state.view.authority);
  const rejected = assert.rejects(pending, /account changed/i); await settle();
  await h.change(owner('b', 'session-b'));
  gate.resolve({ data: { ...owner(), authoritative: true }, error: null }); await rejected;
  assert.deepEqual(h.state.requests.map(r => r.functionName), ['wave1_session_authority_readback']);
  const completion = deferred();
  h.state.transport = request => request.functionName === 'wave1_session_authority_readback'
    ? Promise.resolve({ data: { ...h.state.binding, authoritative: true }, error: null }) : completion.promise;
  const next = h.deletion.restoreScheduledAccountDeletion(h.state.view.authority);
  const nextRejected = assert.rejects(next, /account changed/i); await settle();
  await h.change(owner('c', 'session-c'));
  completion.resolve({ data: { restored: true }, error: null }); await nextRejected;
  assert.equal(h.state.requests.at(-1).accessToken, session(owner('b', 'session-b')).access_token);
});

test('restoration completion accepts only the same-session restoreOnly-to-active transition', async t => {
  const h = await mount(t); const completion = deferred();
  h.state.transport = request => request.functionName === 'wave1_session_authority_readback'
    ? Promise.resolve({ data: { ...h.state.binding, authoritative: true }, error: null }) : completion.promise;
  const pending = h.deletion.restoreScheduledAccountDeletion(h.state.view.authority); await settle();
  await h.change(owner('a', 'session-a', false), 'TOKEN_REFRESHED', 2);
  completion.resolve({ data: { restored: true }, error: null });
  assert.equal((await pending).restored, true);
  assert.equal(h.state.view.authorityStatus, 'active');
  assert.equal(h.authority.getCurrentAccountSessionAuthoritySnapshot().restoreOnly, false);
});

test('pre-fix negative control: provider renders restore-only but restoration cannot reach RPC', async t => {
  const h = await mount(t, { oldSource: true });
  assert.equal(h.state.view.authorityStatus, 'restore_only');
  assert.equal(h.authority.getCurrentAccountSessionAuthoritySnapshot(), null);
  await assert.rejects(h.deletion.restoreScheduledAccountDeletion(h.state.view.authority), /account changed/i);
  assert.equal(h.state.requests.length, 0);
});

test('pre-fix negative control: same-session transition leaves old active snapshot published', async t => {
  const h = await mount(t, { oldSource: true, initial: owner('a', 'session-a', false) });
  await h.change(owner(), 'TOKEN_REFRESHED');
  assert.equal(h.state.view.authorityStatus, 'restore_only');
  assert.equal(h.authority.getCurrentAccountSessionAuthoritySnapshot().restoreOnly, false);
  await assert.rejects(h.deletion.restoreScheduledAccountDeletion(h.state.view.authority), /account changed/i);
  assert.equal(h.state.requests.length, 0);
});

test('actual restore screen passes rendered authority, single-flights same-turn taps, and refreshes once', async t => {
  const h = await mount(t, { restoreScreen: true }); const button = h.restoreButton();
  const gate = deferred(); h.state.transport = request => request.functionName === 'wave1_session_authority_readback'
    ? Promise.resolve({ data: { ...owner(), authoritative: true }, error: null }) : gate.promise;
  await React.act(async () => { button.onPress(); button.onPress(); await settle(); });
  assert.deepEqual(h.state.requests.map(r => r.functionName), ['wave1_session_authority_readback', 'restore_scheduled_account_deletion']);
  assert.equal(h.restoreButton().disabled, true);
  await React.act(async () => { gate.resolve({ data: { restored: true }, error: null }); await settle(); });
  assert.deepEqual(h.state.refreshes, ['a']); assert.equal(h.restoreButton().disabled, false);
});

for (const next of [owner('b', 'session-b'), owner('a', 'replacement'), null]) test(`actual restore screen retained callback rejects ${JSON.stringify(next)}`, async t => {
  const h = await mount(t, { restoreScreen: true }); const button = h.restoreButton();
  await h.change(next, next ? 'SIGNED_IN' : 'SIGNED_OUT'); await h.press(button);
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.refreshes.length, 0);
});

test('actual restore screen rejects ABA authority changes without a React rerender', async t => {
  const h = await mount(t, { restoreScreen: true }); const button = h.restoreButton();
  h.authority.publishAccountSessionAuthoritySnapshot(owner('b', 'session-b'));
  h.authority.publishAccountSessionAuthoritySnapshot(owner());
  await h.press(button); assert.equal(h.state.requests.length, 0);
});

for (const retirement of ['account', 'unmount']) for (const success of [true, false]) test(`actual restore screen suppresses late ${success ? 'success' : 'failure'} after ${retirement}`, async t => {
  const h = await mount(t, { restoreScreen: true }); const gate = deferred();
  h.state.transport = request => request.functionName === 'wave1_session_authority_readback'
    ? Promise.resolve({ data: { ...owner(), authoritative: true }, error: null }) : gate.promise;
  await h.press(h.restoreButton());
  if (retirement === 'account') await h.change(owner('b', 'session-b')); else await h.unmount();
  const before = h.state.screen;
  await React.act(async () => { gate.resolve({ data: { restored: success }, error: null }); await settle(); });
  assert.equal(h.state.refreshes.length, 0); assert.equal(h.state.screen, before, 'no late UI write');
});

test('actual restore screen permits same-session restoreOnly-to-active receipt and token refresh', async t => {
  const h = await mount(t, { restoreScreen: true }); const button = h.restoreButton();
  await h.change(owner(), 'TOKEN_REFRESHED', 2);
  const gate = deferred(); h.state.transport = request => request.functionName === 'wave1_session_authority_readback'
    ? Promise.resolve({ data: { ...owner(), authoritative: true }, error: null }) : gate.promise;
  await h.press(button); assert.equal(h.state.requests.at(-1).accessToken, session(owner(), 2).access_token);
  await h.change(owner('a', 'session-a', false), 'TOKEN_REFRESHED', 3);
  await React.act(async () => { gate.resolve({ data: { restored: true }, error: null }); await settle(); });
  assert.deepEqual(h.state.refreshes, ['a']);
});

test('actual restore screen shows current failure and permits explicit retry', async t => {
  const h = await mount(t, { restoreScreen: true });
  h.state.transport = request => Promise.resolve({ data: request.functionName === 'wave1_session_authority_readback' ? { ...owner(), authoritative: true } : { restored: false }, error: null });
  await h.press(h.restoreButton()); assert.equal(h.restoreButton().disabled, false);
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : text(node?.props?.children ?? '');
  assert.match(text(h.state.screen), /server did not confirm restoration/);
  h.state.transport = null; await h.press(h.restoreButton()); assert.deepEqual(h.state.refreshes, ['a']);
});

test('old restore screen callback negative control restores replacement account', async t => {
  const h = await mount(t, { restoreScreen: true, oldScreen: true }); const button = h.restoreButton();
  await h.change(owner('b', 'session-b')); await h.press(button);
  assert.equal(h.state.requests.at(-1).functionName, 'restore_scheduled_account_deletion');
  assert.equal(h.state.requests.at(-1).accessToken, session(owner('b', 'session-b')).access_token);
  assert.deepEqual(h.state.refreshes, ['b']);
});

test('actual restore-screen signout calls real exact helper once with initiating token and global scope', async t => {
  const h = await mount(t, { restoreScreen: true }); const gate = deferred(); h.state.signOutGate = gate;
  const logout = h.signOutButton(), restore = h.restoreButton();
  await React.act(async () => { logout.onPress(); logout.onPress(); restore.onPress(); await settle(); });
  assert.equal(h.state.exactSignOuts.length, 1); assert.equal(h.state.requests.length, 0);
  assert.deepEqual(h.state.exactSignOuts[0], { token: session(owner()).access_token, scope: 'global' });
  assert.equal(h.signOutButton().disabled, true);
  await React.act(async () => { gate.resolve(); await settle(); });
  assert.equal(h.storageValues.has('fixture-auth'), false); assert.equal(h.state.view.authorityStatus, 'signed_out');
  assert.equal(h.state.publicSignOuts.length, 0);
});

for (const transition of ['replacement', 'generation', 'unknown', 'ABA', 'restored']) test(`actual restore-screen signout rejects retained ${transition} intent without React rerender`, async t => {
  const h = await mount(t, { restoreScreen: true }); const button = h.signOutButton();
  const next = transition === 'replacement' || transition === 'ABA' ? owner('b', 'session-b')
    : transition === 'generation' ? owner('a', 'replacement') : transition === 'restored' ? owner('a', 'session-a', false) : null;
  h.authority.publishAccountSessionAuthoritySnapshot(next);
  if (transition === 'ABA') h.authority.publishAccountSessionAuthoritySnapshot(owner());
  await h.press(button); assert.equal(h.state.exactSignOuts.length, 0); assert.equal(h.state.publicSignOuts.length, 0);
  assert.ok(h.storageValues.has('fixture-auth'));
});

test('actual restore-screen retained signout tolerates same-generation token refresh', async t => {
  const h = await mount(t, { restoreScreen: true }); const button = h.signOutButton();
  await h.change(owner(), 'TOKEN_REFRESHED', 2); await h.press(button);
  assert.deepEqual(h.state.exactSignOuts, [{ token: session(owner(), 2).access_token, scope: 'global' }]);
  assert.equal(h.storageValues.has('fixture-auth'), false);
});

for (const fail of [false, true]) test(`actual restore-screen exact logout preserves B at late ${fail ? 'error' : 'success'} and suppresses stale UI`, async t => {
  const h = await mount(t, { restoreScreen: true }); const gate = deferred(); h.state.signOutGate = gate;
  await h.press(h.signOutButton()); await h.change(owner('b', 'session-b'));
  const before = h.state.screen; if (fail) h.state.signOutError = new Error('fixture network failure');
  await React.act(async () => { gate.resolve(); await settle(); });
  assert.equal(h.state.exactSignOuts.length, 1); assert.equal(h.state.exactSignOuts[0].token, session(owner()).access_token);
  assert.equal(JSON.parse(h.storageValues.get('fixture-auth')).user.id, 'b');
  assert.equal(h.state.view.authority.userId, 'b'); assert.equal(h.state.screen, before);
  assert.equal(h.state.publicSignOuts.length, 0);
});

test('actual restore-screen exact logout cannot remove B saved while storage capture is held', async t => {
  const h = await mount(t, { restoreScreen: true }); const gate = deferred(); h.state.storageReadGate = gate;
  await h.press(h.signOutButton()); const switching = h.change(owner('b', 'session-b'));
  gate.resolve(); await switching; await h.flush();
  assert.ok(h.state.exactSignOuts.every(request => request.token === session(owner()).access_token));
  assert.equal(JSON.parse(h.storageValues.get('fixture-auth')).user.id, 'b');
  assert.equal(h.state.view.authority.userId, 'b'); assert.equal(h.state.publicSignOuts.length, 0);
});

test('actual restore-screen signout failure is retryable only for the current owner', async t => {
  const h = await mount(t, { restoreScreen: true }); h.state.signOutError = new Error('fixture network failure');
  await h.press(h.signOutButton()); assert.equal(h.signOutButton().disabled, false);
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : text(node?.props?.children ?? '');
  assert.match(text(h.state.screen), /Sign out was not confirmed/); assert.ok(h.storageValues.has('fixture-auth'));
  h.state.signOutError = null; await h.press(h.signOutButton()); assert.equal(h.storageValues.has('fixture-auth'), false);
});

test('old restore-screen signout negative control targets replacement B', async t => {
  const h = await mount(t, { restoreScreen: true, oldSignOut: true }); const button = h.signOutButton();
  h.state.session = session(owner('b', 'session-b')); h.authority.publishAccountSessionAuthoritySnapshot(owner('b', 'session-b'));
  await h.press(button); assert.deepEqual(h.state.publicSignOuts, ['b']); assert.equal(h.state.exactSignOuts.length, 0);
});

for (const action of ['restore', 'signout']) test(`actual restore screen fresh ${action} intent works after no-render ABA without reviving old callback`, async t => {
  const h = await mount(t, { restoreScreen: true }); const old = action === 'restore' ? h.restoreButton() : h.signOutButton();
  h.authority.publishAccountSessionAuthoritySnapshot(null); h.authority.publishAccountSessionAuthoritySnapshot(owner());
  await h.press(old); assert.equal(h.state.requests.length + h.state.exactSignOuts.length, 0);
  await h.change(owner(), 'TOKEN_REFRESHED', 2);
  await h.press(action === 'restore' ? h.restoreButton() : h.signOutButton());
  assert.equal(action === 'restore' ? h.state.refreshes.length : h.state.exactSignOuts.length, 1);
});

for (const transient of [null, owner('b', 'session-b')]) for (const stage of ['session capture', 'restore readback', 'signout storage']) {
  test(`actual screen retires ${stage} before dispatch across ${transient ? 'B' : 'null'} ABA`, async t => {
    const h = await mount(t, { restoreScreen: true }); const gate = deferred();
    if (stage === 'session capture') h.state.sessionReadGate = gate;
    else if (stage === 'restore readback') h.state.transport = () => gate.promise;
    else h.state.storageReadGate = gate;
    await h.press(stage === 'signout storage' ? h.signOutButton() : h.restoreButton());
    await React.act(async () => {
      h.authority.publishAccountSessionAuthoritySnapshot(transient); h.authority.publishAccountSessionAuthoritySnapshot(owner());
      await settle();
    });
    const before = h.state.screen;
    await React.act(async () => { gate.resolve({ data: { ...owner(), authoritative: true }, error: null }); await settle(); });
    assert.equal(h.state.requests.filter(r => r.functionName === 'restore_scheduled_account_deletion').length, 0);
    assert.equal(h.state.exactSignOuts.length, 0); assert.equal(h.state.refreshes.length, 0);
    assert.equal(h.state.screen, before, 'retired completion cannot update UI');
    assert.ok(h.storageValues.has('fixture-auth'));
  });
}

for (const action of ['restore', 'signout']) test(`missing helper caller-retirement guard negative control dispatches retired ${action}`, async t => {
  const h = await mount(t, { restoreScreen: true, noCallerGuards: true }); const gate = deferred();
  if (action === 'restore') h.state.transport = request => request.functionName === 'wave1_session_authority_readback' ? gate.promise : Promise.resolve({ data: { restored: true }, error: null });
  else h.state.storageReadGate = gate;
  await h.press(action === 'restore' ? h.restoreButton() : h.signOutButton());
  await React.act(async () => { h.authority.publishAccountSessionAuthoritySnapshot(null); h.authority.publishAccountSessionAuthoritySnapshot(owner()); await settle(); });
  await React.act(async () => { gate.resolve({ data: { ...owner(), authoritative: true }, error: null }); await settle(); });
  assert.equal(action === 'restore' ? h.state.requests.filter(r => r.functionName === 'restore_scheduled_account_deletion').length : h.state.exactSignOuts.length, 1);
});
