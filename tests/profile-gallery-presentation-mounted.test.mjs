import assert from 'node:assert/strict';
import { loadPickedMediaResources } from './helpers/picked-media-resources-host.mjs';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml',
  nodeName: 'DIV', nodeType: 1, ownerDocument: document, parentNode: null, tagName: 'DIV' });
document.documentElement = container(); globalThis.document = document; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};

async function mount(t, platform, review = false, kind = 'avatar') {
  const state = { modal: null, buttons: new Map(), launches: 0, frames: new Map() };
  let frameId = 0;
  const native = name => function NativeHost(props) {
    if (name === 'Modal') state.modal = props;
    if (props.testID) state.buttons.set(props.testID, props);
    return React.createElement(React.Fragment, null, React.Children.toArray(props.children).filter(React.isValidElement));
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/profile/profile-media-sheets.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports,
    requestAnimationFrame: callback => { state.frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => state.frames.delete(id),
    require(name) {
      if (name === 'react') return React;
      if (name === 'react-native') return { Platform: { OS: platform }, StyleSheet: { create: x => x },
        ...Object.fromEntries(['Modal', 'View', 'Text', 'Pressable', 'TouchableOpacity', 'ActivityIndicator'].map(name => [name, native(name)])) };
      if (name.includes('MaterialIcons')) return () => null;
      if (name.includes('ProfileMediaImage')) return { ProfileMediaImage: () => null };
      throw Error(name);
    },
  });
  const Component = review ? exports.ProfileMediaReviewSheet : exports.ProfileAppearanceSheet;
  const root = createRoot(container()); let disposed = false;
  const choose = () => { state.launches++; };
  const render = async visible => React.act(async () => root.render(React.createElement(Component, {
    visible, kind, onChoose: choose, onChooseAnother: choose, onView: noop, onRemove: noop, onSelectFitMode: noop,
    onClose: noop, onCancel: noop, onSave: noop,
  })));
  const unmount = async () => { if (!disposed) { disposed = true; await React.act(async () => root.unmount()); } };
  t.after(unmount); await render(true);
  const button = review ? 'profile-media-choose-another-action' : `profile-${kind}-choose-action`;
  return { state, render, unmount, press: async () => React.act(async () => {
    const press = state.buttons.get(button).onPress; press(); press();
  }), flush: async () => React.act(async () => { const frames = [...state.frames.values()]; state.frames.clear(); frames.forEach(fn => fn()); }) };
}

for (const review of [false, true]) for (const kind of ['avatar', 'background']) {
  test(`iOS ${kind} ${review ? 'choose different' : 'change photo'} waits for real dismissal and is single-flight`, async t => {
    const h = await mount(t, 'ios', review, kind);
    await h.press(); assert.equal(h.state.modal.visible, false); assert.equal(h.state.launches, 0);
    assert.equal(h.state.frames.size, 0);
    await React.act(async () => { h.state.modal.onDismiss(); h.state.modal.onDismiss(); });
    assert.equal(h.state.launches, 1);
  });
}
test('Android closes a non-animated Modal before the native library activity', async t => {
  const h = await mount(t, 'android'); await h.press();
  assert.equal(h.state.modal.visible, false); assert.equal(h.state.modal.animationType, 'none'); assert.equal(h.state.launches, 0);
  await h.flush(); assert.equal(h.state.launches, 1);
});
test('external close and unmount retire pending iOS launches', async t => {
  const h = await mount(t, 'ios'); await h.press(); const oldDismiss = h.state.modal.onDismiss;
  await h.render(false); oldDismiss(); assert.equal(h.state.launches, 0);
  await h.render(true); await h.press(); await h.unmount(); oldDismiss(); assert.equal(h.state.launches, 0);
});
test('external close cancels pending Android frame', async t => {
  const h = await mount(t, 'android'); await h.press(); await h.render(false); await h.flush();
  assert.equal(h.state.launches, 0);
});
test('dismissal from a retired sheet cannot launch a later request', async t => {
  const h = await mount(t, 'ios'); await h.press(); const staleDismiss = h.state.modal.onDismiss;
  await h.render(false); await h.render(true); await h.press();
  staleDismiss(); assert.equal(h.state.launches, 0);
  h.state.modal.onDismiss(); assert.equal(h.state.launches, 1);
});

function pickerCallback(file, context) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'onChooseProfileMedia') {
      callback = (ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer).getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(callback);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`export const choose = ${callback}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...loadPickedMediaResources(), ...context });
  return exports.choose;
}
for (const file of ['app/profile/[userId].tsx', 'app/settings.tsx']) {
  for (const outcome of ['selected', 'cancelled', 'account changed', 'session changed', 'unmounted', 'denied', 'stale denial', 'changed before launch', 'unmounted before launch', 'route changed before launch']) {
    test(`${file} actual gallery handler: ${outcome}`, async () => {
      let resolve, reject, calls = 0;
      const result = new Promise((yes, no) => { resolve = yes; reject = no; });
      const authority = { userId: 'owner', accountId: 'owner', sessionGeneration: 'one', restoreOnly: false, state: 'ACTIVE' };
      let current = { ...authority };
      const mounted = { current: true }, pending = { current: false }, reviews = [], alerts = [];
      const mediaRemovalScope = { revision: 0 };
      const context = {
        isSelfProfile: true, userId: 'owner', profileAppearanceBusy: null, profileGalleryPending: pending,
        profileMediaReview: null, profileReviewRevision: { current: 0 },
        focused: true, mediaRemovalScope, mediaRemovalScopeRef: { current: mediaRemovalScope },
        pickMedia: ({ pick }) => pick('photos', 'picker-operation'),
        authority, getCurrentAccountSessionAuthoritySnapshot: () => current,
        sameAccountSessionAuthority: (a, b) => JSON.stringify(a) === JSON.stringify(b),
        profileGalleryMounted: mounted, mountedRef: mounted, isSocialIdentityCurrent: () => outcome !== 'route changed before launch',
        setProfilePhotoSheetVisible: noop, setProfileBackgroundSheetVisible: noop, setProfileAppearanceSheetKind: noop,
        pickProfileMediaImage: (_kind, source, operation) => { assert.equal(source, 'photos'); assert.equal(operation, 'picker-operation'); calls++; return result; },
        setProfileMediaReview: review => reviews.push(review),
        profile: { profileAvatarFitMode: 'fit' }, myProfile: { profileAvatarFitMode: 'fit' },
        Alert: { alert: (...args) => alerts.push(args) }, getUserFacingErrorMessage: error => error.message,
      };
      const choose = pickerCallback(file, context);
      if (outcome === 'changed before launch') current = { ...authority, sessionGeneration: 'two' };
      if (outcome === 'unmounted before launch') mounted.current = false;
      if (outcome.endsWith('before launch') && (outcome !== 'route changed before launch' || file.includes('/profile/'))) {
        await choose('avatar'); assert.equal(calls, 0); assert.equal(reviews.length, 0); return;
      }
      const first = choose('avatar'); await choose('avatar'); assert.equal(calls, 1);
      if (outcome === 'account changed' || outcome === 'stale denial') current = { ...authority, userId: 'other', accountId: 'other' };
      if (outcome === 'session changed') current = { ...authority, sessionGeneration: 'two' };
      if (outcome === 'unmounted') mounted.current = false;
      if (outcome.includes('deni')) reject(Error('Permission denied'));
      else resolve(outcome === 'cancelled' ? null : { uri: 'file://photo.jpg' });
      await first;
      assert.equal(reviews.length, outcome === 'selected' || outcome === 'route changed before launch' ? 1 : 0);
      assert.equal(alerts.length, outcome === 'denied' ? 1 : 0);
      assert.equal(pending.current, false);
      if (reviews.length) assert.equal(reviews[0].fitMode, 'fit');
    });
  }
}
