import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container();
globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/live/new-live-streams-button.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, {
  exports,
  require(name) {
    if (name === 'react') return React;
    if (name === 'react-native') return { View: 'View', Pressable: 'Pressable', Text: 'Text', StyleSheet: { create: value => value } };
    throw new Error(name);
  },
});

async function mount(t, initial) {
  let props = initial, element;
  function Host() { element = exports.NewLiveStreamsButton(props); return null; }
  const root = createRoot(container());
  const render = () => React.act(async () => { root.render(React.createElement(Host)); });
  await render();
  t.after(() => React.act(async () => root.unmount()));
  return {
    element: () => element,
    button: () => element.props.children,
    update: async next => { props = { ...props, ...next }; await render(); },
  };
}

test('arrival reserves identical layout space and does not refresh automatically', async t => {
  let reads = 0;
  const h = await mount(t, { pendingItemCount: 0, onRefresh: async () => { reads++; } });
  const slot = h.element().props.style;
  assert.equal(h.button(), null);
  await h.update({ pendingItemCount: 3 });
  assert.equal(h.element().props.style, slot);
  assert.equal(slot.height, 44);
  assert.equal(slot.width, 164);
  assert.equal(h.button().props.accessibilityRole, 'button');
  assert.equal(h.button().props.accessibilityLabel, 'New live streams');
  assert.equal(reads, 0);
});

test('explicit tap refreshes once, disables while pending, and can retry', async t => {
  let resolve, reads = 0;
  const h = await mount(t, { pendingItemCount: 2, onRefresh: () => { reads++; return new Promise(r => { resolve = r; }); } });
  const tap = h.button().props.onPress;
  await React.act(async () => { tap(); tap(); });
  assert.equal(reads, 1);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.button().props.accessibilityState.busy, true);
  await React.act(async () => resolve());
  assert.equal(h.button().props.disabled, false);
  await h.update({ pendingItemCount: 0 });
  assert.equal(h.button(), null);
});

test('reader rejection does not strand the button or cause unhandled rejection', async t => {
  const h = await mount(t, { pendingItemCount: 1, onRefresh: async () => { throw new Error('offline'); } });
  await React.act(async () => h.button().props.onPress());
  assert.equal(h.button().props.disabled, false);
  assert.equal(h.button().props.accessibilityLabel, 'New live streams');
});

test('missing legacy mocked count, zero, and negative counts expose no action', async t => {
  const h = await mount(t, { onRefresh: async () => {} });
  assert.equal(h.button(), null);
  for (const pendingItemCount of [0, -1, NaN]) {
    await h.update({ pendingItemCount }); assert.equal(h.button(), null);
  }
});

test('live discovery surfaces no longer require the legacy manual new-items affordance', () => {
  for (const file of [
    'app/(tabs)/index.tsx',
    'app/(tabs)/explore.tsx',
    'app/(tabs)/live.tsx',
    'components/live/platform-live-now.tsx',
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(source.includes('useLiveDiscoveryFeed'), file);
    assert.ok(!source.includes('<NewLiveStreamsButton'), file);
  }
});
