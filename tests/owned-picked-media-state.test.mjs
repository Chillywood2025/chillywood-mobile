import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { loadMediaPickerHost } from './helpers/media-picker-host.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

async function mount(t, { strict = false, initial = null } = {}) {
  const media = loadMediaPickerHost({ React, native: {Platform: {OS: 'ios'}}, snapshot: () => null });
  const released = [], files = new Map();
  const owned = name => { const file = {uri: `file:///owned-${name}`, name}; files.set(name, file); media.ownPickedMedia(file, async () => { released.push(name); }); return file; };
  const first = initial ? owned(initial) : null;
  let view, mounted = true;
  function Probe() {
    const [staged, setStaged] = media.useOwnedPickedMediaState(first);
    const [recoveries, setRecoveries] = media.useOwnedPickedMediaState([], list => list.map(item => item.file));
    React.useLayoutEffect(() => { view = {staged, setStaged, recoveries, setRecoveries}; });
    return null;
  }
  const root = createRoot(container()), act = fn => React.act(async () => { await fn(); });
  await act(() => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null, React.createElement(Probe))));
  t.after(async () => { if (mounted) await act(() => root.unmount()); });
  return {media, released, owned, files, act, get view() {return view;}, unmount: async () => { await act(() => root.unmount()); mounted = false; }};
}

test('owned state retains exact selected identities and retires the previous preview only after replacement commits', async t => {
  const h = await mount(t), first = h.owned('first'), second = h.owned('second');
  await h.act(() => h.view.setStaged(first));
  await h.act(() => { h.view.setStaged(second); assert.deepEqual(h.released, [], 'old rendered preview is still owned before commit'); });
  assert.deepEqual(h.released, ['first']); assert.equal(h.view.staged, second);
  await h.act(() => h.view.setStaged(current => current)); assert.deepEqual(h.released, ['first']);
  await h.act(() => h.view.setStaged(null)); assert.deepEqual(h.released, ['first', 'second']);
});

for (const transfer of ['restore', 'recovery']) test(`synchronous ${transfer} ownership survives the send finally in the same React batch`, async t => {
  const h = await mount(t), file = h.owned(transfer); await h.act(() => h.view.setStaged(file));
  const dropSend = h.media.retainPickedMedia(file);
  await h.act(() => h.view.setStaged(null)); assert.deepEqual(h.released, []);
  await h.act(() => {
    if (transfer === 'restore') h.view.setStaged(file); else h.view.setRecoveries([{file}]);
    dropSend();
  });
  assert.deepEqual(h.released, []);
  assert.equal(transfer === 'restore' ? h.view.staged : h.view.recoveries[0].file, file);
  await h.act(() => transfer === 'restore' ? h.view.setStaged(null) : h.view.setRecoveries([]));
  assert.deepEqual(h.released, [transfer]);
});

test('overlapping recovery identities transfer without deleting still-visible copies', async t => {
  const h = await mount(t), first = h.owned('first'), second = h.owned('second');
  await h.act(() => h.view.setRecoveries([{file: first}]));
  await h.act(() => h.view.setRecoveries(current => [...current, {file: second}])); assert.deepEqual(h.released, []);
  await h.act(() => h.view.setRecoveries(current => current.slice(1))); assert.deepEqual(h.released, ['first']);
  await h.unmount(); assert.deepEqual(h.released, ['first', 'second']);
});

test('raw reader can start after composer retirement and survives all UI/send owners until actual settlement', async t => {
  const h = await mount(t), file = h.owned('raw'), raw = deferred();
  await h.act(() => h.view.setStaged(file)); const dropSend = h.media.retainPickedMedia(file);
  await h.act(() => h.view.setStaged(null));
  const read = h.media.withPickedMediaRead(file.uri, () => raw.promise);
  await h.act(() => dropSend()); await h.unmount(); assert.deepEqual(h.released, []);
  await h.act(() => raw.resolve('finished')); assert.equal(await read, 'finished'); assert.deepEqual(h.released, ['raw']);
});

test('Strict Mode replay does not destroy an active selected file; real unmount retires exactly once', async t => {
  const h = await mount(t, {strict: true, initial: 'strict'});
  assert.equal(h.view.staged, h.files.get('strict')); assert.deepEqual(h.released, []);
  await h.unmount(); assert.deepEqual(h.released, ['strict']);
});

test('unmount retires staged ownership but cannot delete a pending send owner', async t => {
  const h = await mount(t), file = h.owned('in-flight'); await h.act(() => h.view.setStaged(file));
  const dropSend = h.media.retainPickedMedia(file); await h.unmount(); assert.deepEqual(h.released, []);
  dropSend(); await h.act(noop); assert.deepEqual(h.released, ['in-flight']);
});

test('a detached state setter cannot adopt a newly returned native file after unmount', async t => {
  const h = await mount(t), setter = h.view.setStaged; await h.unmount();
  const late = h.owned('late'); await h.act(() => setter(late)); assert.deepEqual(h.released, ['late']);
});

test('an urgent unrelated commit cannot release the preview still visible during a suspended selection transition', async t => {
  const media = loadMediaPickerHost({React, native: {Platform: {OS: 'ios'}}, snapshot: () => null});
  const first = {uri: 'file:///first'}, next = {uri: 'file:///next'}, released = [], pending = deferred();
  media.ownPickedMedia(first, async () => { released.push('first'); }); media.ownPickedMedia(next, async () => { released.push('next'); });
  let ready = false, view;
  function Preview({file}) { if (file === next && !ready) throw pending.promise; return null; }
  function Probe() {
    const [file, setFile] = media.useOwnedPickedMediaState(first), [other, setOther] = React.useState(0);
    React.useLayoutEffect(() => { view = {file, setFile, bump: () => setOther(other + 1)}; });
    return React.createElement(Preview, {file});
  }
  const root = createRoot(container()); t.after(() => React.act(async () => { root.unmount(); }));
  await React.act(async () => { root.render(React.createElement(React.Suspense, {fallback: null}, React.createElement(Probe))); });
  await React.act(async () => { React.startTransition(() => view.setFile(next)); });
  assert.equal(view.file, first); assert.deepEqual(released, []);
  await React.act(async () => { flushSync(() => view.bump()); });
  assert.equal(view.file, first); assert.deepEqual(released, [], 'old UI owner survives the unrelated urgent commit');
  await React.act(async () => { ready = true; pending.resolve(); });
  assert.equal(view.file, next); assert.deepEqual(released, ['first']);
});

test('picker preparing and settlement rerenders cannot retire the preview in a suspended owned-state transition', async t => {
  const media = loadMediaPickerHost({React, native: {Platform: {OS: 'ios'}}, snapshot: () => null});
  const first = {uri: 'file:///preparing-first'}, next = {uri: 'file:///preparing-next'}, released = [];
  const transition = deferred(), native = deferred();
  media.ownPickedMedia(first, async () => { released.push('first'); });
  media.ownPickedMedia(next, async () => { released.push('next'); });
  let ready = false, view, result;
  function Preview({file}) { if (file === next && !ready) throw transition.promise; return null; }
  function Probe() {
    const [file, setFile] = media.useOwnedPickedMediaState(first);
    const picker = media.useMediaPicker('preparing-target');
    React.useLayoutEffect(() => { view = {file, setFile, picker}; });
    return React.createElement(React.Fragment, null, React.createElement(Preview, {file}), picker.mediaPickerSheet);
  }
  const root = createRoot(container()); t.after(() => React.act(async () => { root.unmount(); }));
  await React.act(async () => { root.render(React.createElement(React.Suspense, {fallback: null}, React.createElement(Probe))); });
  await React.act(async () => { React.startTransition(() => view.setFile(next)); });
  assert.equal(view.file, first); assert.deepEqual(released, []);
  await React.act(async () => { result = view.picker.pickMedia({allowUnauthenticated: true, pick: () => native.promise}); });
  await React.act(async () => { view.picker.mediaPickerSheet.props.onChoose('photos'); });
  await React.act(async () => { view.picker.mediaPickerSheet.props.onDismiss(); });
  assert.equal(view.picker.mediaPickerSheet.props.preparing, true);
  assert.equal(view.file, first); assert.deepEqual(released, [], 'preparing update is not the suspended replacement commit');
  await React.act(async () => { native.resolve(null); }); assert.equal(await result, null);
  assert.equal(view.picker.mediaPickerSheet, null);
  assert.equal(view.file, first); assert.deepEqual(released, [], 'settlement update must not retire visible old bytes either');
  await React.act(async () => { ready = true; transition.resolve(); });
  assert.equal(view.file, next); assert.deepEqual(released, ['first']);
});
