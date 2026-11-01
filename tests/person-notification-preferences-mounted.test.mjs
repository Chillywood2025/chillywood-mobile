import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), React = require('react'), { createRoot } = require('react-dom/client'), ts = require('typescript');
const noop = () => {}; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: document, parentNode: null, tagName: 'DIV' });
document.documentElement = container(); globalThis.document = document; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const authority = { state: 'ACTIVE', userId: 'me', accountId: 'account', sessionGeneration: 'one', restoreOnly: false };
const row = { actorUserId: 'person', revision: 0, liveStarts: null, watchPartyStarts: null, joinedLive: false, following: false, circle: true };
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
async function mount(t) {
  const state = { authority, buttons: new Map(), modal: null, reads: 0, writes: [], pendingSave: false, retries: [], read: async () => row, save: async (_previous, next) => ({ ...row, ...next, revision: 1 }), retry: async () => ({ ...row, revision: 1, joinedLive: true }) };
  class PreferenceError extends Error { constructor(kind) { super(kind); this.kind = kind; } }
  const native = name => function Host(props) { if (name === 'Modal') state.modal = props; if (props.testID) state.buttons.set(props.testID, props);
    return React.createElement(React.Fragment, null, React.Children.toArray(props.children).filter(React.isValidElement)); };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/notifications/person-notification-preferences.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name === 'react') return React;
    if (name === 'react-native') return { StyleSheet: { create: x => x }, ...Object.fromEntries(['Modal', 'View', 'Text', 'Pressable', 'ScrollView'].map(n => [n, native(n)])) };
    if (name.includes('MaterialIcons')) return () => null;
    if (name.endsWith('/session')) return { useSession: () => ({ authority: state.authority, authorityStatus: 'active' }) };
    if (name.endsWith('/accountSessionAuthority')) return { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: (a, b) => JSON.stringify(a) === JSON.stringify(b) };
    if (name.endsWith('/personNotificationPreferences')) return { PersonNotificationPreferenceError: PreferenceError, hasPendingPersonNotificationSave: () => state.pendingSave,
      retryPersonNotificationPreferences: async (...args) => { state.retries.push(args); return state.retry(...args); },
      readPersonNotificationPreferences: async (...args) => { state.reads++; return state.read(...args); },
      savePersonNotificationPreferences: async (...args) => { state.writes.push(args); return state.save(...args); } };
    if (name.endsWith('/chillywood-visual-system')) return { CHILLYWOOD_VISUAL: {} };
    throw Error(name);
  } });
  const root = createRoot(container()); let disposed = false;
  const render = async () => React.act(async () => { state.buttons.clear(); root.render(React.createElement(exports.PersonNotificationPreferencesButton, { actorUserId: 'person', displayName: 'Creator' })); });
  const unmount = async () => { if (!disposed) { disposed = true; await React.act(async () => root.unmount()); } };
  t.after(unmount); await render();
  const press = async (id, twice = false) => React.act(async () => { const action = state.buttons.get(id).onPress; action(); if (twice) action(); });
  return { state, render, press, unmount };
}
test('production sheet stages choices, explicit joined opt-in and double save is single-flight', async t => {
  const h = await mount(t); await h.press('person-notifications-open', true); assert.equal(h.state.reads, 1);
  assert.equal(h.state.buttons.get('person-liveStarts-Default').accessibilityState.checked, true);
  assert.equal(h.state.buttons.get('person-joinedLive-Off').accessibilityState.checked, true);
  await h.press('person-joinedLive-On'); assert.equal(h.state.writes.length, 0);
  const pending = deferred(); h.state.save = () => pending.promise;
  await h.press('person-notifications-save', true); assert.equal(h.state.writes.length, 1);
  assert.equal(h.state.writes[0][1].joinedLive, true);
  await React.act(async () => pending.resolve({ ...row, revision: 1, joinedLive: true }));
  assert.equal(h.state.buttons.get('person-notifications-message').children, 'Notification choices saved.');
});
test('cancel discards staged choices without a write; native back closes sheet', async t => {
  const h = await mount(t); await h.press('person-notifications-open'); await h.press('person-joinedLive-On');
  await React.act(async () => h.state.modal.onRequestClose()); assert.equal(h.state.modal.visible, false); assert.equal(h.state.writes.length, 0);
  await h.press('person-notifications-open'); assert.equal(h.state.buttons.get('person-joinedLive-Off').accessibilityState.checked, true);
});
test('late read after close cannot reopen or populate replacement sheet', async t => {
  const h = await mount(t), old = deferred(); h.state.read = () => old.promise;
  await h.press('person-notifications-open'); await h.press('person-notifications-close');
  h.state.read = async () => ({ ...row, liveStarts: false }); await h.press('person-notifications-open');
  await React.act(async () => old.resolve({ ...row, liveStarts: true }));
  assert.equal(h.state.buttons.get('person-liveStarts-Off').accessibilityState.checked, true);
});
test('retired modal close, radio and save callbacks cannot change a reopened sheet', async t => {
  const h = await mount(t); await h.press('person-notifications-open');
  const close = h.state.modal.onRequestClose, choose = h.state.buttons.get('person-joinedLive-On').onPress, save = h.state.buttons.get('person-notifications-save').onPress;
  await h.press('person-notifications-close'); await h.press('person-notifications-open');
  await React.act(async () => { close(); choose(); save(); });
  assert.equal(h.state.modal.visible, true); assert.equal(h.state.buttons.get('person-joinedLive-Off').accessibilityState.checked, true); assert.equal(h.state.writes.length, 0);
});
test('unknown save blocks further saves until an explicit reload, without optimistic success', async t => {
  const h = await mount(t); await h.press('person-notifications-open'); h.state.save = async () => { throw Error('lost response'); };
  await h.press('person-notifications-save'); assert.equal(h.state.buttons.get('person-notifications-save').disabled, true);
  await h.press('person-notifications-save'); assert.equal(h.state.writes.length, 1);
  await h.press('person-notifications-reload'); assert.equal(h.state.reads, 2); assert.equal(h.state.buttons.get('person-notifications-save').disabled, false);
});
test('account replacement retires native modal and late saved response', async t => {
  const h = await mount(t), old = deferred(); await h.press('person-notifications-open'); h.state.save = () => old.promise;
  await h.press('person-notifications-save'); h.state.authority = { ...authority, sessionGeneration: 'two' }; await h.render();
  assert.equal(h.state.modal.visible, false);
  await React.act(async () => old.resolve({ ...row, revision: 1 })); assert.equal(h.state.modal.visible, false);
});
test('explicit retry sends only retained actor identity, never edits or submits a different draft', async t => {
  const h = await mount(t); await h.press('person-notifications-open'); await h.press('person-joinedLive-On');
  h.state.save = async () => { h.state.pendingSave = true; throw Error('unknown'); };
  await h.press('person-notifications-save'); await h.press('person-liveStarts-Off');
  await h.press('person-notifications-retry', true); assert.equal(h.state.retries.length, 1);
  assert.equal(h.state.retries[0][0], 'person'); assert.equal(h.state.retries[0].length, 2);
  assert.equal(h.state.buttons.get('person-joinedLive-On').accessibilityState.checked, true);
});
test('own profile, signed-out and restore-only state expose no preference action', async t => {
  const h = await mount(t);
  for (const value of [null, { ...authority, userId: 'person' }, { ...authority, restoreOnly: true }]) {
    h.state.authority = value; await h.render(); assert.equal(h.state.buttons.size, 0);
  }
});
test('failed load never displays fabricated default controls; unmount retires read', async t => {
  const h = await mount(t); h.state.read = async () => { throw Error('missing backend'); }; await h.press('person-notifications-open');
  assert.equal(h.state.buttons.has('person-notifications-save'), false);
  const pending = deferred(); h.state.read = () => pending.promise; await h.press('person-notifications-reload'); await h.unmount();
  await React.act(async () => pending.resolve(row)); assert.equal(h.state.writes.length, 0);
});
