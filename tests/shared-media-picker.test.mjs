import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createMediaPickerModules } from './helpers/media-picker-modules.mjs';

const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const owner = (sessionGeneration = 'one', userId = 'owner') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
const same = (a, b) => !!a && !!b && Object.keys(owner()).every(k => a[k] === b[k]);
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const asset = { uri: 'file:///photo.webp', mimeType: 'image/webp', fileSize: 123 };

function runtime(platform = 'ios') {
  const listeners = new Set(), frames = new Map(), calls = [];
  let frame = 0;
  const state = { authority: owner(), native: async () => ({ canceled: false, assets: [asset] }), permission: async () => ({ granted: true }), camera: null, document: null, gallery: null };
  const account = { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same,
    subscribeToAccountSessionAuthority: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  const sdk = { UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' }, VideoExportPreset: { HighestQuality: 'highest' },
    launchImageLibraryAsync: options => { calls.push(['photos', options]); return state.native(options); },
    launchCameraAsync: options => { calls.push(['camera', options]); return (state.camera ?? state.native)(options); },
    requestCameraPermissionsAsync: () => { calls.push(['permission']); return state.permission(); } };
  const native = { Platform: { OS: platform }, StyleSheet: { create: value => value, absoluteFillObject: {} },
    ...Object.fromEntries(['Pressable', 'ScrollView', 'Text', 'View'].map(x => [x, x])),
    // The Modal intentionally does not render children. This native View
    // boundary proves pending feedback really mounts OUTSIDE the hidden Modal.
    View: props => {
      React.useLayoutEffect(() => {
        if (props.testID !== 'media-picker-preparing') return;
        state.preparingProps = props;
        return () => { if (state.preparingProps === props) state.preparingProps = null; };
      }, [props]);
      return null;
    },
    Modal: props => { state.modalProps = props; return null; } };
  const load = createMediaPickerModules({ react: React, 'react-native': native, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 20 }) },
    'icon-symbol': { IconSymbol: 'IconSymbol' },
    'react-native-svg': { __esModule: true, default: 'Svg', Defs: 'Defs', LinearGradient: 'LinearGradient', Rect: 'Rect', Stop: 'Stop' },
    'expo-modules-core': { requireOptionalNativeModule: () => state.gallery },
    accountSessionAuthority: account, 'expo-image-picker': sdk,
    'expo-document-picker': { getDocumentAsync: options => { calls.push(['files', options]); return state.document ? state.document(options) : Promise.resolve({ canceled: true }); } } });
  globalThis.requestAnimationFrame = fn => { frames.set(++frame, fn); return frame; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  return { state, calls, load, frames, sdk, async frame() { for (const [id, fn] of frames) { frames.delete(id); fn(); } await tick(); },
    publish(value) { state.authority = value; for (const listener of listeners) listener(value); } };
}

async function mount(t, r = runtime()) {
  const { useMediaPicker } = r.load('hooks/useMediaPicker.tsx');
  const state = { key: 'thread:one', hostVisible: true }; let picker, other;
  const root = createRoot(container()); let unmounted = false;
  function Harness() { picker = useMediaPicker(state.key); other = useMediaPicker('other-screen'); return state.hostVisible ? picker.mediaPickerSheet : null; }
  const act = fn => React.act(async () => { await fn(); await tick(); });
  const render = () => act(() => root.render(React.createElement(Harness)));
  const unmount = async () => { if (!unmounted) { unmounted = true; await act(() => root.unmount()); } };
  await render(); t.after(unmount);
  const start = async options => { let result; await act(() => { result = picker.pickMedia(options); }); return { result }; };
  const choose = async (source = 'photos') => { const props = picker.mediaPickerSheet.props; await act(() => props.onChoose(source)); return props; };
  const dismiss = () => act(() => picker.mediaPickerSheet?.props.onDismiss());
  return { ...r, state: r.state, screen: state, act, render, unmount, start, choose, dismiss, picker: () => picker, other: () => other };
}

test('actual iOS sheet waits for native dismissal, single-flights repeated taps and returns selected file', async t => {
  const h = await mount(t); let launches = 0;
  const operation = await h.start({ pick: async () => { launches++; return asset; } });
  const old = h.picker().mediaPickerSheet.props;
  assert.equal(await h.picker().pickMedia({ pick: async () => assert.fail() }), null);
  assert.equal(await h.other().pickMedia({ pick: async () => assert.fail() }), null);
  await h.choose(); await h.act(() => old.onChoose('files'));
  assert.equal(launches, 0, 'neither frames nor a hidden prop proves iOS native dismissal');
  await h.act(() => h.frame()); assert.equal(launches, 0);
  await h.dismiss(); assert.equal(await operation.result, asset); assert.equal(launches, 1);
});

for (const outcome of ['success', 'cancel', 'error']) test(`deferred iOS library ${outcome} shows non-modal preparing feedback until real native settlement`, async t => {
  const r = runtime('ios'), native = deferred(); r.state.native = () => native.promise;
  const h = await mount(t, r), { pickDeviceImage } = h.load('_lib/deviceImagePicker.ts');
  const op = await h.start({ pick: pickDeviceImage });
  assert.equal(h.state.preparingProps, undefined);
  await h.choose(); await h.act(() => h.frame());
  assert.equal(h.state.preparingProps, undefined, 'hidden source prop is not actual iOS dismissal');
  assert.equal(h.calls.length, 0);
  await h.dismiss();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][0], 'photos');
  assert.equal(h.state.modalProps.visible, false);
  const status = h.state.preparingProps;
  assert.ok(status, 'status mounts even though the native Modal renders no children');
  assert.equal(status.pointerEvents, 'none'); assert.equal(status.accessible, true);
  assert.equal(status.accessibilityRole, 'text'); assert.equal(status.accessibilityLiveRegion, 'polite');
  assert.equal(status.accessibilityViewIsModal, undefined);
  assert.match(status.accessibilityLabel, /Preparing attachment.*Cloud files may take a moment/);
  assert.doesNotMatch(status.accessibilityLabel, /upload|\d+%/i);
  const style = Object.assign({}, ...status.style.flat());
  assert.equal(style.position, 'absolute'); assert.equal(style.zIndex, 1000);
  for (let i = 0; i < 3; i++) assert.equal(await h.picker().pickMedia({ pick: pickDeviceImage }), null);
  assert.equal(h.calls.length, 1); assert.equal(h.state.preparingProps, status);
  if (outcome === 'error') {
    const rejected = assert.rejects(op.result, /Unable to open or import/);
    await h.act(() => native.reject(Error('cloud unavailable'))); await rejected;
  } else {
    await h.act(() => native.resolve(outcome === 'cancel' ? { canceled: true } : { canceled: false, assets: [asset] }));
    const result = await op.result;
    assert.equal(outcome === 'cancel' ? result : result.uri, outcome === 'cancel' ? null : asset.uri);
  }
  assert.equal(h.state.preparingProps, null);
  assert.equal(h.picker().mediaPickerSheet, null);
});

for (const retirement of ['explicit-cancel', 'account', 'same-account-session', 'target', 'hidden', 'unmount']) {
  for (const outcome of ['resolve', 'reject']) test(`preparing feedback clears on ${retirement} but ${outcome} still owns native until settlement`, async t => {
    const r = runtime('ios'), native = deferred(); r.state.native = () => native.promise;
    const h = await mount(t, r), op = await h.start({ pick: h.load('_lib/deviceImagePicker.ts').pickDeviceImage });
    await h.choose(); await h.dismiss(); assert.ok(h.state.preparingProps);
    if (retirement === 'explicit-cancel') await h.act(() => h.picker().cancelMediaPicker());
    if (retirement === 'account') await h.act(() => h.publish(owner('other', 'other')));
    if (retirement === 'same-account-session') await h.act(() => h.publish(owner('other')));
    if (retirement === 'target') { h.screen.key = 'different-target'; await h.render(); }
    if (retirement === 'hidden') { h.screen.hostVisible = false; await h.render(); }
    if (retirement === 'unmount') await h.unmount();
    assert.equal(h.state.preparingProps, null);
    assert.equal(h.load('_lib/mediaPickerCoordinator.ts').acquireMediaPickerSession(), null);
    await h.act(() => outcome === 'resolve' ? native.resolve({ canceled: false, assets: [asset] }) : native.reject(Error('old private failure')));
    assert.equal(await op.result, null); assert.equal(h.state.preparingProps, null); assert.equal(h.calls.length, 1);
    const release = h.load('_lib/mediaPickerCoordinator.ts').acquireMediaPickerSession(); assert.equal(typeof release, 'function'); release();
  });
}

test('old dismissal cannot clear a later preparing request; sheet cancellation never shows preparing feedback', async t => {
  const r = runtime('ios'), native = deferred(); r.state.native = () => native.promise;
  const h = await mount(t, r), first = await h.start({ pick: h.load('_lib/deviceImagePicker.ts').pickDeviceImage });
  const oldDismiss = h.picker().mediaPickerSheet.props.onDismiss;
  await h.act(() => h.picker().cancelMediaPicker()); await h.dismiss(); assert.equal(await first.result, null);
  assert.equal(h.state.preparingProps, undefined); assert.equal(h.calls.length, 0);
  const second = await h.start({ pick: h.load('_lib/deviceImagePicker.ts').pickDeviceImage }); await h.choose(); await h.dismiss();
  assert.ok(h.state.preparingProps); await h.act(() => oldDismiss()); assert.ok(h.state.preparingProps);
  await h.act(() => native.resolve({ canceled: true })); assert.equal(await second.result, null); assert.equal(h.state.preparingProps, null);
});

test('a scrolling form can show the same non-modal preparing status inline beside its attach control', async t => {
  const r = runtime('ios'), native = deferred(); r.state.native = () => native.promise;
  const h = await mount(t, r), op = await h.start({ preparingPlacement: 'inline', pick: h.load('_lib/deviceImagePicker.ts').pickDeviceImage });
  await h.choose(); await h.dismiss();
  const status = h.state.preparingProps, style = Object.assign({}, ...status.style.flat());
  assert.equal(status.pointerEvents, 'none'); assert.equal(style.position, undefined); assert.equal(style.marginVertical, 12);
  assert.equal(h.state.modalProps.visible, false);
  await h.act(() => native.resolve({ canceled: true })); assert.equal(await op.result, null); assert.equal(h.state.preparingProps, null);
});

for (const retired of [false, true]) test(`hidden native room intent restores feedback only while still current (retired=${retired})`, async t => {
  const r = runtime('ios'), native = deferred(); r.state.native = () => native.promise;
  const h = await mount(t, r), op = await h.start({ retainNativeResultWhileHidden: () => true,
    pick: h.load('_lib/deviceImagePicker.ts').pickDeviceImage });
  await h.choose(); await h.dismiss(); assert.ok(h.state.preparingProps);
  h.screen.hostVisible = false; await h.render(); assert.equal(h.state.preparingProps, null);
  assert.equal(h.load('_lib/mediaPickerCoordinator.ts').acquireMediaPickerSession(), null);
  if (retired) await h.act(() => h.publish(owner('new-session')));
  h.screen.hostVisible = true; await h.render();
  assert.equal(!!h.state.preparingProps, !retired); assert.equal(h.state.modalProps.visible, false);
  assert.equal(h.calls.length, 1, 'remounting status must not launch another source or native picker');
  await h.act(() => native.resolve({ canceled: false, assets: [asset] }));
  const result = await op.result;
  assert.equal(retired ? result : result.uri, retired ? null : asset.uri);
  assert.equal(h.state.preparingProps, null);
});

test('Android uses no-animation committed dismissal before launching', async t => {
  const h = await mount(t, runtime('android')); let launches = 0;
  const op = await h.start({ pick: async () => { launches++; return asset; } });
  await h.choose(); assert.equal(launches, 0);
  await h.act(() => h.frame()); assert.equal(await op.result, asset); assert.equal(launches, 1);
});

test('a stale native onDismiss from the previous sheet cannot release the next selection', async t => {
  const h = await mount(t); let launches = 0;
  const first = await h.start({ pick: async () => null }); const oldDismiss = h.picker().mediaPickerSheet.props.onDismiss;
  await h.choose(); await h.dismiss(); assert.equal(await first.result, null);
  const next = await h.start({ pick: async () => { launches++; return asset; } }); await h.choose();
  await h.act(() => oldDismiss()); assert.equal(launches, 0);
  await h.dismiss(); assert.equal(await next.result, asset); assert.equal(launches, 1);
});

for (const kind of ['cancel', 'account', 'same-user-session', 'transient-revoke', 'target', 'target-away-back', 'unmount']) {
  for (const outcome of ['resolve', 'reject']) test(`native ${outcome} stays globally single-flight and is ignored after ${kind}`, async t => {
    const h = await mount(t), held = deferred();
    const op = await h.start({ pick: () => held.promise }); await h.choose(); await h.dismiss();
    if (kind === 'cancel') await h.act(() => h.picker().cancelMediaPicker());
    if (kind === 'account') await h.act(() => h.publish(owner('two', 'someone-else')));
    if (kind === 'same-user-session') await h.act(() => h.publish(owner('two')));
    if (kind === 'transient-revoke') await h.act(() => { h.publish(null); h.publish(owner()); });
    if (kind.startsWith('target')) { h.screen.key = 'thread:two'; await h.render(); if (kind === 'target-away-back') { h.screen.key = 'thread:one'; await h.render(); } }
    if (kind === 'unmount') await h.unmount();
    assert.equal(h.load('_lib/mediaPickerCoordinator.ts').acquireMediaPickerSession(), null, 'native settlement owns latch even after retirement');
    await h.act(() => outcome === 'resolve' ? held.resolve(asset) : held.reject(Error('private provider detail')));
    assert.equal(await op.result, null);
    const release = h.load('_lib/mediaPickerCoordinator.ts').acquireMediaPickerSession(); assert.equal(typeof release, 'function'); release();
  });
}

test('canceling the sheet or a native selection preserves previous caller state', async t => {
  const h = await mount(t); let selected = asset, launched = 0;
  const op = await h.start({ pick: async () => { launched++; return null; } });
  await h.act(() => h.picker().mediaPickerSheet.props.onCancel()); await h.dismiss();
  const result = await op.result; if (result) selected = result;
  assert.equal(selected, asset); assert.equal(launched, 0);
  const next = await h.start({ pick: async () => null }); await h.choose(); await h.dismiss();
  if (await next.result) selected = await next.result;
  assert.equal(selected, asset);
});

test('equivalent authority republication does not retire current selection; current errors reject', async t => {
  const h = await mount(t), held = deferred();
  const op = await h.start({ pick: () => held.promise }); await h.choose(); await h.dismiss();
  await h.act(() => h.publish({ ...owner() }));
  const error = new Error('readable failure'); const rejected = assert.rejects(op.result, e => e === error);
  await h.act(() => held.reject(error)); await rejected;
});

test('advanced action runs once only after actual dismissal; beforePresent also gates opening', async t => {
  const h = await mount(t), parent = deferred(); let advanced = 0;
  const op = await h.start({ beforePresent: () => parent.promise, advancedAction: { label: 'Use image link', onPress: () => advanced++ }, pick: async () => assert.fail() });
  assert.equal(h.picker().mediaPickerSheet, null);
  await h.act(() => parent.resolve()); await h.choose('advanced'); assert.equal(advanced, 0);
  await h.dismiss(); assert.equal(await op.result, null); assert.equal(advanced, 1);
});

test('anonymous evidence is explicit and retires when account changes; restore-only cannot select', async t => {
  const h = await mount(t); await h.act(() => h.publish(null));
  assert.equal(await h.picker().pickMedia({ pick: async () => assert.fail() }), null);
  const op = await h.start({ allowUnauthenticated: true, pick: async () => assert.fail() });
  await h.act(() => h.publish(owner())); await h.dismiss(); assert.equal(await op.result, null);
  await h.act(() => h.publish({ ...owner(), restoreOnly: true }));
  assert.equal(await h.picker().pickMedia({ allowUnauthenticated: true, pick: async () => assert.fail() }), null);
});

test('production image adapter preserves unknown MIME and real URI name; no broad permission or OEM choice', async () => {
  const r = runtime(), { pickDeviceImage } = r.load('_lib/deviceImagePicker.ts');
  r.state.native = async () => ({ canceled: false, assets: [{ uri: 'file:///photo.png?secret=removed' }] });
  const file = await pickDeviceImage('photos'); assert.equal(file.name, 'photo.png'); assert.equal(file.mimeType, undefined);
  const options = r.calls[0][1]; assert.deepEqual(options.mediaTypes, ['images']); assert.equal(options.legacy, false);
  assert.equal(options.allowsEditing, false); assert.equal(options.allowsMultipleSelection, false);
  assert.equal(r.calls.length, 1); assert.equal(options.defaultTab, undefined);
});

test('camera permission is explicit, denied access is actionable, and retirement before native launch is safe', async () => {
  const r = runtime(), { pickDeviceImage } = r.load('_lib/deviceImagePicker.ts'), { runMediaPickerSelection, acquireMediaPickerSession } = r.load('_lib/mediaPickerCoordinator.ts');
  r.state.permission = async () => ({ granted: false, canAskAgain: false });
  await assert.rejects(pickDeviceImage('camera'), /device settings/); assert.equal(r.calls.filter(x => x[0] === 'camera').length, 0);
  const held = deferred(); let current = true; r.state.permission = () => held.promise;
  const release = acquireMediaPickerSession();
  const pending = runMediaPickerSelection(() => current, operation => pickDeviceImage('camera', operation)); await tick(); current = false; held.resolve({ granted: true });
  assert.equal(await pending, null); assert.equal(r.calls.filter(x => x[0] === 'camera').length, 0);
  release();
});

test('direct native helpers share single-flight until resolution and support cancel/retry', async () => {
  const r = runtime(), { pickDeviceImage } = r.load('_lib/deviceImagePicker.ts'), held = deferred(); r.state.native = () => held.promise;
  const pending = pickDeviceImage('photos'); await tick(); assert.equal(await pickDeviceImage('files'), null);
  held.resolve({ canceled: true }); assert.equal(await pending, null);
  r.state.native = async () => ({ canceled: false, assets: [asset] }); assert.equal((await pickDeviceImage('photos')).uri, asset.uri);
});

test('video uses explicit highest-quality compatible export, Files preserves provider bytes, cloud failure does not select', async () => {
  const r = runtime(), { pickDeviceVideo } = r.load('_lib/deviceVideoPicker.ts');
  r.state.native = async () => ({ canceled: true }); assert.equal(await pickDeviceVideo('photos'), null);
  assert.equal(r.calls[0][1].videoExportPreset, 'highest'); assert.deepEqual(r.calls[0][1].mediaTypes, ['videos']);
  r.state.native = async () => { throw Error('iCloud import unavailable internal metadata'); };
  await assert.rejects(pickDeviceVideo('photos'), /download it to your device/);
  r.state.document = async () => ({ canceled: false, assets: [{ uri: 'file:///original.mov', name: 'original.mov', mimeType: 'video/quicktime', size: 1234 }] });
  assert.equal((await pickDeviceVideo('files')).name, 'original.mov'); assert.equal(r.calls.at(-1)[0], 'files');
});

test('evidence preserves multiple metadata and rejects provider overflow rather than silently dropping files', async () => {
  const r = runtime(), { pickDeviceAttachments } = r.load('_lib/deviceAttachmentPicker.ts');
  r.state.native = async () => ({ canceled: false, assets: [asset, { ...asset, uri: 'file:///second.png' }] });
  const files = await pickDeviceAttachments('photos', { mimeTypes: ['image/png'], multiple: true, selectionLimit: 2 });
  assert.equal(files.length, 2); assert.equal(r.calls[0][1].selectionLimit, 2);
  await assert.rejects(pickDeviceAttachments('photos', { mimeTypes: ['image/png'], multiple: true, selectionLimit: 1 }), /up to 1/);
  const count = r.calls.length; assert.equal(await pickDeviceAttachments('photos', { mimeTypes: [], selectionLimit: 0 }), null); assert.equal(r.calls.length, count);
});

test('shared sheet exposes compact accessible sources, cancel, and advanced link; never promises local-only', async t => {
  const h = await mount(t);
  const op = await h.start({ title: 'Change photo', advancedAction: { label: 'Advanced image link', onPress: noop }, pick: async () => null });
  const serialized = JSON.stringify(h.state.modalProps, (key, value) => ['_owner', '_store'].includes(key) ? undefined : value);
  for (const id of ['media-source-photos', 'media-source-camera', 'media-source-files', 'media-source-cancel', 'media-source-advanced']) assert.ok(serialized.includes(id));
  assert.equal(h.state.modalProps.animationType, 'none'); assert.doesNotMatch(serialized, /local.only|Google Photos|Samsung Gallery/i);
  await h.unmount(); assert.equal(await op.result, null);
});

test('a direct competing helper cannot borrow a sheet operation during async work before native launch', async t => {
  const h = await mount(t), paused = deferred(); let ownedOperation;
  const { pickDeviceImage } = h.load('_lib/deviceImagePicker.ts');
  const op = await h.start({ pick: async (source, operation) => { ownedOperation = operation; await paused.promise; return pickDeviceImage(source, operation); } });
  await h.choose(); await h.dismiss();
  assert.equal(await pickDeviceImage('files'), null);
  assert.equal(await pickDeviceImage('photos', { isCurrent: () => true }), null, 'a forged callback cannot claim identity');
  assert.equal(h.calls.length, 0);
  await h.act(() => paused.resolve()); assert.equal((await op.result).uri, asset.uri); assert.equal(h.calls.length, 1);
  assert.equal(await pickDeviceImage('photos', ownedOperation), null, 'a completed token cannot be replayed');
});

test('video sheet excludes camera; adapter rejects unsupported recording without permission request', async t => {
  const h = await mount(t);
  const op = await h.start({ mediaKind: 'video', pick: async () => null });
  assert.deepEqual(h.picker().mediaPickerSheet.props.sources, ['photos', 'files']);
  await h.unmount(); assert.equal(await op.result, null);
  await assert.rejects(h.load('_lib/deviceVideoPicker.ts').pickDeviceVideo('camera'), /Video recording is not available/);
  assert.equal(h.calls.length, 0);
});

test('new Android binary adds Gallery app without replacing system Photos/Files; explicit native token reaches importer', async t => {
  const r = runtime('android'), calls = [];
  r.state.gallery = { capabilities: kind => ({ apiVersion: 1, available: true, maximumSelection: 1, localOnly: false }),
    launchGalleryAsync: async options => { calls.push(options); return { canceled: false, selectionId: 'owned', asset: { uri: 'file:///gallery.webp', mimeType: 'image/webp', size: 123 } }; },
    discardSelectionAsync: async () => assert.fail() };
  const h = await mount(t, r), { pickDeviceImage } = h.load('_lib/deviceImagePicker.ts');
  const op = await h.start({ sources: ['photos', 'files'], pick: pickDeviceImage });
  assert.deepEqual(h.picker().mediaPickerSheet.props.sources, ['gallery', 'photos', 'files']);
  await h.choose('gallery'); await h.act(() => h.frame());
  assert.equal((await op.result).uri, 'file:///gallery.webp'); assert.equal(calls.length, 1); assert.equal(h.calls.length, 0);
});

for (const kind of ['old-binary', 'no-handler', 'ios']) test(`${kind} never advertises a working Android Gallery-app chooser`, async t => {
  const r = runtime(kind === 'ios' ? 'ios' : 'android');
  if (kind !== 'old-binary') r.state.gallery = { capabilities: () => ({ apiVersion: 1, available: kind === 'ios', maximumSelection: 1, localOnly: false }) };
  const h = await mount(t, r), op = await h.start({ pick: async () => assert.fail() });
  assert.equal(h.picker().mediaPickerSheet.props.sources.includes('gallery'), false);
  await h.unmount(); assert.equal(await op.result, null);
});

test('Gallery-app cancellation preserves selection and stale import is discarded without falling back to another picker', async () => {
  const r = runtime('android'), held = deferred(), discarded = [];
  r.state.gallery = { capabilities: () => ({ apiVersion: 1, available: true, maximumSelection: 1, localOnly: false }),
    launchGalleryAsync: () => held.promise, discardSelectionAsync: async id => discarded.push(id) };
  const { pickDeviceImage } = r.load('_lib/deviceImagePicker.ts');
  const { acquireMediaPickerSession, runMediaPickerSelection } = r.load('_lib/mediaPickerCoordinator.ts');
  let current = true; const release = acquireMediaPickerSession();
  const op = runMediaPickerSelection(() => current, operation => pickDeviceImage('gallery', operation)); await tick(); current = false;
  held.resolve({ canceled: false, selectionId: 'owned', asset: { uri: 'file:///gallery.webp', mimeType: 'image/webp', size: 123 } });
  assert.equal(await op, null); assert.deepEqual(discarded, ['owned']); assert.equal(r.calls.length, 0); release();
  r.state.gallery.launchGalleryAsync = async () => ({ canceled: true });
  assert.equal(await pickDeviceImage('gallery'), null);
});

test('multi-evidence never offers or silently truncates through the one-item Gallery contract', async t => {
  const r = runtime('android');
  r.state.gallery = { capabilities: () => ({ apiVersion: 1, available: true, maximumSelection: 1, localOnly: false }), launchGalleryAsync: () => assert.fail() };
  const h = await mount(t, r), op = await h.start({ multiple: true, sources: ['gallery', 'photos', 'files'], pick: async () => assert.fail() });
  assert.deepEqual(h.picker().mediaPickerSheet.props.sources, ['photos', 'files']);
  await h.unmount(); assert.equal(await op.result, null);
  await assert.rejects(h.load('_lib/deviceAttachmentPicker.ts').pickDeviceAttachments('gallery', { multiple: true, mimeTypes: ['image/png'] }), /multiple attachments/);
});

test('native Gallery import receives surface-specific limit and supports the full existing creator video bound', async () => {
  const r = runtime('android'), limits = [];
  r.state.gallery = { capabilities: () => ({ apiVersion: 1, available: true, maximumSelection: 1, localOnly: false }),
    launchGalleryAsync: async options => { limits.push(options); return { canceled: true }; } };
  await r.load('_lib/deviceImagePicker.ts').pickDeviceImage('gallery', undefined, { maximumBytes: 10 * 1024 * 1024 });
  await r.load('_lib/deviceVideoPicker.ts').pickDeviceVideo('gallery');
  await r.load('_lib/deviceImagePicker.ts').pickDeviceImage('gallery', undefined, { maximumBytes: 10 * 1024 * 1024, allowHeicNormalization: true });
  assert.deepEqual(limits.map(option => option.maximumBytes), [10 * 1024 * 1024, 5 * 1024 * 1024 * 1024, 10 * 1024 * 1024]);
  assert.equal(limits[0].heicMaximumBytes, undefined); assert.equal(limits[2].heicMaximumBytes, 250 * 1024 * 1024);
});

test('Gallery import storage/size/deadline failures preserve the explicit Files alternative', async () => {
  const r = runtime('android');
  r.state.gallery = { capabilities: () => ({ apiVersion: 1, available: true, maximumSelection: 1, localOnly: false }),
    launchGalleryAsync: async () => { throw { code: r.failure }; } };
  for (const code of ['GALLERY_TOO_LARGE', 'GALLERY_CACHE_FULL', 'GALLERY_IMPORT_TIMEOUT']) {
    r.failure = code;
    await assert.rejects(r.load('_lib/deviceImagePicker.ts').pickDeviceImage('gallery'), /Files/);
  }
  assert.equal(r.calls.length, 0, 'never silently reroute an error into another picker');
});

test('retirement requests exact native cancellation but does not release the chooser/import latch', async () => {
  const r = runtime('android'), held = deferred(), cancellations = [], discarded = [];
  r.state.gallery = { capabilities: () => ({ apiVersion: 1, available: true, maximumSelection: 1, localOnly: false }),
    launchGalleryAsync: options => { r.request = options.requestId; return held.promise; },
    cancelRequestAsync: async id => cancellations.push(id), discardSelectionAsync: async id => discarded.push(id) };
  const coordinator = r.load('_lib/mediaPickerCoordinator.ts'), picker = r.load('_lib/deviceImagePicker.ts');
  let current = true; const release = coordinator.acquireMediaPickerSession();
  const pending = coordinator.runMediaPickerSelection(() => current, operation => picker.pickDeviceImage('gallery', operation));
  await tick(); current = false;
  await new Promise(resolve => setTimeout(resolve, 280));
  assert.deepEqual(cancellations, [r.request]); assert.equal(coordinator.acquireMediaPickerSession(), null);
  held.resolve({ canceled: false, selectionId: 'retired', asset: { uri: 'file:///retired.webp', mimeType: 'image/webp' } });
  assert.equal(await pending, null); assert.deepEqual(discarded, ['retired']); release();
});

test('cleanup handle survives later callback rejection, late retirement and confirmed consumption without deleting other files', async () => {
  for (const outcome of ['reject', 'retire', 'consume']) {
    const r = runtime('android'), discarded = [];
    r.state.gallery = { capabilities: () => ({ apiVersion: 1, available: true, maximumSelection: 1, localOnly: false }),
      launchGalleryAsync: async () => ({ canceled: false, selectionId: outcome, asset: { uri: 'file:///owned.webp', mimeType: 'image/webp' } }),
      discardSelectionAsync: async id => discarded.push(id) };
    const coordinator = r.load('_lib/mediaPickerCoordinator.ts'), resources = r.load('_lib/mediaPickerResources.ts');
    let current = true; const release = coordinator.acquireMediaPickerSession();
    const pending = coordinator.runMediaPickerSelection(() => current, async operation => {
      const value = await r.load('_lib/deviceImagePicker.ts').pickDeviceImage('gallery', operation);
      if (outcome === 'reject') throw new Error('later validation');
      if (outcome === 'retire') current = false;
      return value;
    });
    if (outcome === 'reject') await assert.rejects(pending, /later validation/);
    else {
      const value = await pending;
      if (outcome === 'consume') {
        assert.deepEqual(discarded, []);
        await resources.releasePickedMedia([value, { uri: 'file:///unowned.webp' }]);
        await resources.releasePickedMedia(value);
      } else assert.equal(value, null);
    }
    assert.deepEqual(discarded, [outcome]); release();
  }
});

test('wrapped mutation-subject result retains exact cleanup across the coordinator-to-hook acceptance gap', async t => {
  const r = runtime('android'), discarded = [];
  r.state.gallery = { capabilities: () => ({ apiVersion: 1, available: true, maximumSelection: 1, localOnly: false }),
    launchGalleryAsync: async () => ({ canceled: false, selectionId: 'wrapped', asset: { uri: 'file:///wrapped.webp', mimeType: 'image/webp' } }),
    discardSelectionAsync: async id => discarded.push(id) };
  const h = await mount(t, r); let current = true, finalCoordinatorCheck = false;
  const op = await h.start({ sources: ['photos'], isCurrent: () => {
    if (finalCoordinatorCheck) {
      finalCoordinatorCheck = false;
      // After coordinator's successful check, before hook's awaited result.
      queueMicrotask(() => { current = false; });
    }
    return current;
  }, pick: async (source, operation) => {
    const file = await h.load('_lib/deviceImagePicker.ts').pickDeviceImage(source, operation);
    finalCoordinatorCheck = true;
    return { file, mutationSubject: { immutable: true } };
  } });
  await h.choose('gallery'); await h.act(() => h.frame());
  assert.equal(await op.result, null); assert.deepEqual(discarded, ['wrapped']);
});

test('explicit send/recovery owners and raw native readers outlive composer release and timeout without deleting the file', async () => {
  const r = runtime(), resources = r.load('_lib/mediaPickerResources.ts'), raw = deferred(), discarded = [];
  const file = { uri: 'file:///owned-send.webp' }, wrapper = { file, subject: {} };
  resources.ownPickedMedia(file, async () => discarded.push(file.uri));
  resources.bindPickedMediaResult(wrapper, new Set([file]));
  const sendOwner = resources.retainPickedMedia(wrapper);
  await resources.releasePickedMedia(file); // Composer cleared before reader starts.
  assert.deepEqual(discarded, []);
  const read = resources.withPickedMediaRead(file.uri, () => raw.promise);
  const timedOut = Promise.race([read, Promise.resolve('timeout')]);
  assert.equal(await timedOut, 'timeout');
  sendOwner(); sendOwner(); await resources.releasePickedMedia(wrapper);
  assert.deepEqual(discarded, [], 'Timeout and cleared owners are not raw native reader completion');
  raw.resolve('uploaded'); assert.equal(await read, 'uploaded');
  assert.deepEqual(discarded, [file.uri]);
  await resources.releasePickedMedia(file); assert.deepEqual(discarded, [file.uri]);
});

test('resource reader sync/rejection paths preserve errors and unknown files are never deleted', async () => {
  const r = runtime(), resources = r.load('_lib/mediaPickerResources.ts');
  assert.equal(await resources.withPickedMediaRead('file:///unowned', async () => 3), 3);
  const file = { uri: 'file:///raw-error.webp' }, raw = deferred();
  resources.ownPickedMedia(file, () => { throw new Error('cleanup failed'); });
  const read = resources.withPickedMediaRead(file.uri, () => raw.promise);
  await resources.releasePickedMedia(file);
  raw.reject(new Error('raw upload failed'));
  await assert.rejects(read, /raw upload failed/);
  const synchronous = { uri: 'file:///sync-error.webp' }; let releases = 0;
  resources.ownPickedMedia(synchronous, async () => { releases++; });
  await assert.rejects(resources.withPickedMediaRead(synchronous.uri, () => { throw new Error('sync start'); }), /sync start/);
  await resources.releasePickedMedia(synchronous); assert.equal(releases, 1);
});

for (const phase of ['choosing', 'dismissing', 'native']) test(`host early-return/unmount retires ${phase} without hanging or releasing an open native picker`, async t => {
  const h = await mount(t), held = deferred(); let calls = 0;
  const op = await h.start({ pick: () => { calls++; return held.promise; } });
  if (phase !== 'choosing') await h.choose();
  if (phase === 'native') await h.dismiss();
  h.screen.hostVisible = false; await h.render();
  if (phase === 'native') {
    assert.equal(h.load('_lib/mediaPickerCoordinator.ts').acquireMediaPickerSession(), null);
    await h.act(() => held.resolve(asset));
  }
  assert.equal(await op.result, null); assert.equal(calls, phase === 'native' ? 1 : 0);
  const release = h.load('_lib/mediaPickerCoordinator.ts').acquireMediaPickerSession(); assert.equal(typeof release, 'function'); release();
});

test('explicit native intent may survive host hiding but retains its global lease until validated selection settles', async t => {
  const h = await mount(t), native = deferred(), verification = deferred(); let started = false, applied = false;
  const op = await h.start({ retainNativeResultWhileHidden: () => started,
    pick: async () => { started = true; const result = await native.promise; await verification.promise; applied = true; return result; } });
  await h.choose(); await h.dismiss(); h.screen.hostVisible = false; await h.render();
  await h.act(() => native.resolve(asset)); assert.equal(applied, false);
  assert.equal(h.load('_lib/mediaPickerCoordinator.ts').acquireMediaPickerSession(), null);
  await h.act(() => verification.resolve()); assert.equal(await op.result, asset);
});

for (const phase of ['choosing', 'dismissing']) test(`native hidden retention cannot keep a ${phase} source sheet alive before native dispatch`, async t => {
  const h = await mount(t); let started = false;
  const op = await h.start({ retainNativeResultWhileHidden: () => started,
    pick: async () => { started = true; return asset; } });
  if (phase === 'dismissing') await h.choose();
  h.screen.hostVisible = false; await h.render();
  assert.equal(await op.result, null); assert.equal(started, false);
});

test('native hidden retention never overrides exact account retirement or explicit cancel', async t => {
  for (const cancel of [false, true]) {
    const h = await mount(t), held = deferred();
    const op = await h.start({ retainNativeResultWhileHidden: () => true, pick: () => held.promise });
    await h.choose(); await h.dismiss(); h.screen.hostVisible = false; await h.render();
    await h.act(() => cancel ? h.picker().cancelMediaPicker() : h.publish(owner('replacement')));
    await h.act(() => held.resolve(asset)); assert.equal(await op.result, null);
  }
});
