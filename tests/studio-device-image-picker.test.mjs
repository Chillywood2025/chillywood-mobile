import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { deferred, loadStudioFunctions } from './helpers/studio-source-harness.mjs';

class UserFacingError extends Error { constructor(_code, message) { super(message); } }
const photo = { uri: 'file:///photo.png', name: 'photo.png', mimeType: 'image/png', size: 12 };
function pickerFixture(result) {
  const calls = [];
  const api = loadStudioFunctions('_lib/deviceImagePicker.ts', ['pickDeviceImage'], {
    UserFacingError,
    require: id => id === 'expo-image-picker' ? { UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
      launchImageLibraryAsync: async options => { calls.push(['photos', options]); return result; } } : { getDocumentAsync: async options => { calls.push(['files', options]); return result; } },
  });
  return { ...api, calls };
}
test('Photos invokes native image library with image-only, limited-access-friendly SDK options', async () => {
  const f = pickerFixture({ canceled: false, assets: [{ uri: photo.uri, fileName: photo.name, mimeType: photo.mimeType, fileSize: 12 }] });
  assert.equal(JSON.stringify(await f.pickDeviceImage('photos')), JSON.stringify(photo));
  const [source, options] = f.calls[0];
  assert.equal(source, 'photos'); assert.deepEqual(Array.from(options.mediaTypes), ['images']);
  assert.equal(options.legacy, false); assert.equal(options.defaultTab, 'photos');
  assert.equal(options.allowsMultipleSelection, false); assert.equal(options.preferredAssetRepresentationMode, 'compatible');
  assert.equal(options.exif, false); assert.equal(options.base64, false);
});
test('Files is explicitly separate and does not broaden to videos', async () => {
  const f = pickerFixture({ canceled: false, assets: [photo] });
  assert.equal(JSON.stringify(await f.pickDeviceImage('files')), JSON.stringify(photo));
  assert.equal(f.calls[0][0], 'files');
  assert.ok(f.calls[0][1].type.every(type => type.startsWith('image/')));
  assert.equal(f.calls[0][1].copyToCacheDirectory, true);
});
test('cancel maps to null, unknown MIME is never relabeled JPEG, HEIC metadata is retained', async () => {
  assert.equal(await pickerFixture({ canceled: true }).pickDeviceImage('photos'), null);
  assert.equal(await pickerFixture({ canceled: true }).pickDeviceImage('files'), null);
  await assert.rejects(() => pickerFixture({ canceled: false, assets: [{ uri: 'file:///unknown' }] }).pickDeviceImage('photos'));
  const minimal = await pickerFixture({ canceled: false, assets: [{ uri: 'file:///a.png' }] }).pickDeviceImage('photos');
  assert.equal(minimal.mimeType, undefined); assert.equal(minimal.name, 'a.png');
  await assert.rejects(() => pickerFixture({ canceled: false, assets: [] }).pickDeviceImage('photos'));
  await assert.rejects(() => pickerFixture({ canceled: false, assets: [{ uri: 'file:///fake.png', mimeType: 'video/mp4' }] }).pickDeviceImage('photos'));
  assert.equal((await pickerFixture({ canceled: false, assets: [{ uri: 'file:///a.heic', mimeType: 'image/heic' }] }).pickDeviceImage('photos')).mimeType, 'image/heic');
});
function coverFixture(pick = async () => photo) {
  let authority = { userId: 'owner', state: 'ACTIVE', restoreOnly: false, session: 1 };
  const effects = [], calls = [];
  const context = {
    getUserFacingErrorMessage: (_error, fallback) => fallback,
    user: { id: 'owner' }, clipCoverPickerInFlightRef: { current: false }, clipSaveInFlightRef: { current: false },
    clipLoading: false, clipLoadError: null, clipEditorGenerationRef: { current: 1 }, replayActionsMountedRef: { current: true },
    getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority: (a, b) => a === b,
    pickDeviceImage: async source => { calls.push(source); return pick(); },
    getClipStudioCoverValidationMessage: file => file.size > 20 * 1024 * 1024 ? 'too big' : null,
    ...Object.fromEntries(['setClipSaveState', 'setClipNotice', 'logClipStudioUi', 'setSelectedClipCoverFile', 'setClipSavedVideoId', 'updateClipEditor'].map(key => [key, (...args) => effects.push([key, ...args])])),
  };
  return { ...loadStudioFunctions('app/channel-settings.tsx', ['onPickClipCoverFile'], context), context, calls, effects,
    replaceSession: () => { authority = { ...authority, session: 2 }; } };
}
test('production cover handler dispatches photos by default and Files explicitly, retaining private preview', async () => {
  const f = coverFixture(); await f.onPickClipCoverFile(); await f.onPickClipCoverFile('files');
  assert.deepEqual(f.calls, ['photos', 'files']);
  assert.equal(f.effects.filter(x => x[0] === 'setSelectedClipCoverFile').length, 2);
  assert.ok(f.effects.some(x => x[0] === 'updateClipEditor' && x[1].coverPreviewUrl === photo.uri));
});
test('double tap launches only one native picker and unlocks after cancellation', async () => {
  const pending = deferred(), f = coverFixture(() => pending.promise);
  const operation = f.onPickClipCoverFile(); await f.onPickClipCoverFile('files');
  assert.deepEqual(f.calls, ['photos']); pending.resolve(null); await operation;
  assert.equal(f.context.clipCoverPickerInFlightRef.current, false);
  assert.ok(!f.effects.some(x => x[0] === 'setSelectedClipCoverFile'));
});
for (const retire of ['session', 'generation', 'unmount']) test(`cover ignores native result after ${retire} retirement`, async () => {
  const pending = deferred(), f = coverFixture(() => pending.promise), operation = f.onPickClipCoverFile();
  if (retire === 'session') f.replaceSession();
  if (retire === 'generation') f.context.clipEditorGenerationRef.current++;
  if (retire === 'unmount') f.context.replayActionsMountedRef.current = false;
  const count = f.effects.length; pending.resolve(photo); await operation;
  assert.equal(f.effects.length, count); assert.equal(f.context.clipCoverPickerInFlightRef.current, false);
});
test('permission denial/native failure is safe and unlocks retry; oversize is rejected', async () => {
  const denied = coverFixture(async () => { throw Error('permission denied'); });
  await denied.onPickClipCoverFile(); assert.equal(denied.context.clipCoverPickerInFlightRef.current, false);
  assert.ok(denied.effects.some(x => x[0] === 'setClipNotice' && /Unable to open/.test(x[1])));
  const big = coverFixture(async () => ({ ...photo, size: 21 * 1024 * 1024 })); await big.onPickClipCoverFile();
  assert.ok(big.effects.some(x => x[0] === 'setClipNotice' && x[1] === 'too big'));
});
// Exercise actual JSX onPress props rather than a parallel test implementation.
// This proves source wiring, not a physical OS window or full installed screen.
test('all rendered Studio media actions bind gallery and separate Files callbacks', () => {
  const source = fs.readFileSync('app/channel-settings.tsx', 'utf8');
  const ast = ts.createSourceFile('studio.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = [];
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'TouchableOpacity') {
      const press = node.openingElement.attributes.properties.find(p => p.name?.text === 'onPress');
      if (press && /onPickClipCoverFile|pickPlatformBrandAsset/.test(press.getText(ast))) nodes.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const calls = [];
  for (const node of nodes) {
    const opening = node.openingElement.attributes.properties.filter(p => ['onPress', 'testID'].includes(p.name?.text)).map(p => p.getText(ast)).join(' ');
    const js = ts.transpileModule(`globalThis.element = <TouchableOpacity ${opening} />;`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
    const context = { React, TouchableOpacity: 'button', onPickClipCoverFile: source => calls.push(['cover', source]), pickPlatformBrandAsset: (asset, source = 'photos') => calls.push([asset, source]) };
    vm.runInNewContext(js, context); context.element.props.onPress();
  }
  assert.equal(nodes.length, 15); // two cover states, one Files; six Brand source pairs
  assert.equal(calls.filter(x => x[0] === 'cover' && x[1] === 'photos').length, 2);
  for (const asset of ['cover', 'hero_image', 'hero_video', 'background_image', 'avatar', 'logo', 'watermark']) {
    assert.ok(calls.some(x => x[0] === asset && x[1] === 'photos'));
    assert.ok(calls.some(x => x[0] === asset && x[1] === 'files'));
  }
});

function brandFixture(pick = async () => photo) {
  let authority = { userId: 'owner', state: 'ACTIVE', restoreOnly: false, session: 1 };
  const calls = [], effects = [], uploads = [];
  const context = {
    getUserFacingErrorMessage: (_error, fallback) => fallback,
    user: { id: 'owner' }, brandUploadInFlightRef: { current: false }, brandUploadAttemptRef: { current: null },
    replayActionsMountedRef: { current: true }, getCurrentAccountSessionAuthoritySnapshot: () => authority,
    sameAccountSessionAuthority: (a, b) => a === b,
    pickDeviceImage: async source => { calls.push(source); return pick(); },
    getPlatformBrandAssetValidationMessage: file => file.size > 20 * 1024 * 1024 ? 'too big' : null,
    uploadPlatformBrandAsset: async input => { input.assertOperationCurrent(); uploads.push(input); return { id: 'asset' }; },
    saveBrandDraftPatch: async patch => { effects.push(['save', patch]); return {}; },
    setBrandNotice: value => effects.push(['notice', value]), setBrandBusyAssetType: value => effects.push(['busy', value]),
  };
  return { ...loadStudioFunctions('app/channel-settings.tsx', ['pickPlatformBrandAsset'], context), calls, effects, uploads, context,
    replaceSession: () => { authority = { ...authority, session: 2 }; } };
}
test('actual Brand picker preserves validated source mapping and separate Files', async () => {
  for (const source of ['photos', 'files']) {
    const f = brandFixture(); await f.pickPlatformBrandAsset('hero_image', source);
    assert.deepEqual(f.calls, [source]); assert.equal(f.uploads[0].file, photo);
    assert.equal(f.uploads[0].ownerUserId, 'owner');
    assert.ok(f.effects.some(x => x[0] === 'save' && x[1].heroImageAssetId === 'asset'));
  }
});
test('Brand ignores repeated taps and stale-session selection before any upload', async () => {
  const pending = deferred(), f = brandFixture(() => pending.promise);
  const operation = f.pickPlatformBrandAsset('avatar'); await f.pickPlatformBrandAsset('logo', 'files');
  assert.deepEqual(f.calls, ['photos']); f.replaceSession(); pending.resolve(photo); await operation;
  assert.equal(f.uploads.length, 0); assert.equal(f.context.brandUploadInFlightRef.current, false);
});
test('Brand cancellation and denied picker cause no upload or saved draft', async () => {
  for (const pick of [async () => null, async () => { throw Error('denied'); }]) {
    const f = brandFixture(pick); await f.pickPlatformBrandAsset('avatar');
    assert.equal(f.uploads.length, 0); assert.ok(!f.effects.some(x => x[0] === 'save'));
    assert.equal(f.context.brandUploadInFlightRef.current, false);
  }
});
test('Brand uncertain registration retry retains original selected file without reopening picker', async () => {
  const f = brandFixture();
  f.context.brandUploadAttemptRef.current = { authority: f.context.getCurrentAccountSessionAuthoritySnapshot(), assetType: 'avatar', file: photo, attempt: { payload: { id: 'old' } } };
  await f.pickPlatformBrandAsset('avatar', 'files');
  assert.equal(f.calls.length, 0); assert.equal(f.uploads[0].file, photo);
});

for (const kind of ['cover', 'brand']) test(`${kind} HEIC upload preparation converts bytes and cleans only owned temporary output`, async () => {
  const file = { uri: 'file:///original.heic', name: 'original.heic', mimeType: 'image/heic', size: 10 };
  const converted = { uri: 'file:///converted.jpg', name: 'converted.jpg', mimeType: 'image/jpeg', size: 20 };
  let cleanup = 0, normalized = 0;
  const fn = kind === 'cover' ? 'prepareCoverUploadUri' : 'preparePlatformBrandUploadUri';
  const context = {
    toText: value => String(value ?? '').trim(),
    inferCoverMimeType: value => value.mimeType, inferMimeType: value => value.mimeType,
    COVER_IMAGE_MIME_TYPES: new Set(['image/jpeg']), IMAGE_MIME_TYPES: new Set(['image/jpeg']),
    getClipStudioCoverValidationMessage: () => null, getPlatformBrandAssetValidationMessage: () => null,
    FileSystem: { cacheDirectory: null },
    require: () => ({ normalizeImageUploadFile: async actual => { normalized++; assert.equal(actual, file); return { file: converted, cleanup: async () => { cleanup++; } }; } }),
  };
  const api = loadStudioFunctions(kind === 'cover' ? '_lib/clipStudio.ts' : '_lib/platformBranding.ts', [fn], context);
  const prepared = await api[fn](file, 'avatar');
  assert.equal(prepared.uri, converted.uri); assert.equal(prepared.file.mimeType, 'image/jpeg');
  assert.equal(cleanup, 0); assert.equal(normalized, 1); await prepared.cleanup(); assert.equal(cleanup, 1);
});
for (const kind of ['cover', 'brand']) test(`${kind} conversion validation failure cleans temp and never returns uploadable bytes`, async () => {
  let cleanup = 0;
  const fn = kind === 'cover' ? 'prepareCoverUploadUri' : 'preparePlatformBrandUploadUri';
  const context = {
    toText: value => String(value ?? '').trim(), inferCoverMimeType: value => value.mimeType, inferMimeType: value => value.mimeType,
    COVER_IMAGE_MIME_TYPES: new Set(['image/jpeg']), IMAGE_MIME_TYPES: new Set(['image/jpeg']),
    getClipStudioCoverValidationMessage: () => 'oversize', getPlatformBrandAssetValidationMessage: () => 'oversize',
    require: () => ({ normalizeImageUploadFile: async () => ({ file: { uri: 'file:///big.jpg', mimeType: 'image/jpeg' }, cleanup: async () => { cleanup++; } }) }),
  };
  const api = loadStudioFunctions(kind === 'cover' ? '_lib/clipStudio.ts' : '_lib/platformBranding.ts', [fn], context);
  await assert.rejects(() => api[fn]({ uri: 'file:///a.heic', mimeType: 'image/heic' }, 'avatar'), /oversize/);
  assert.equal(cleanup, 1);
});


test('missing native SDK import returns actionable safe error, not a Files fallback', async () => {
  const api = loadStudioFunctions('_lib/deviceImagePicker.ts', ['pickDeviceImage'], {
    UserFacingError, require: () => { throw Error('Native module missing internal detail'); },
  });
  await assert.rejects(() => api.pickDeviceImage('photos'), /Photo gallery needs the current app build/);
});


test('missing gallery filename/MIME retains known URI extension through actual Studio MIME inference', async () => {
  for (const [extension, expected] of [['png', 'image/png'], ['webp', 'image/webp']]) {
    const selected = await pickerFixture({ canceled: false, assets: [{ uri: `file:///cache/photo.${extension}` }] }).pickDeviceImage('photos');
    const cover = loadStudioFunctions('_lib/clipStudio.ts', ['getExtensionFromName', 'inferCoverMimeType'], { toText: value => String(value ?? '').trim() });
    const brand = loadStudioFunctions('_lib/platformBranding.ts', ['getExtensionFromName', 'inferMimeType'], { toText: value => String(value ?? '').trim() });
    assert.equal(cover.inferCoverMimeType(selected), expected);
    assert.equal(brand.inferMimeType(selected, 'avatar'), expected);
  }
});


test('pending native cover picker blocks save and removal without changing selected intent', async () => {
  const pending = deferred(), f = coverFixture(() => pending.promise);
  const operation = f.onPickClipCoverFile();
  const api = loadStudioFunctions('app/channel-settings.tsx', ['onRemoveClipCoverFile', 'saveClipStudio'], f.context);
  api.onRemoveClipCoverFile(); await api.saveClipStudio('draft');
  assert.ok(!f.effects.some(x => x[0] === 'setSelectedClipCoverFile'));
  assert.ok(f.effects.some(x => x[0] === 'setClipNotice' && /Finish choosing/.test(x[1])));
  pending.resolve(photo); await operation;
  assert.equal(f.effects.filter(x => x[0] === 'setSelectedClipCoverFile').length, 1);
});
