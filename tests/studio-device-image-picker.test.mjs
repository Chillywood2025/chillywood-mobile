import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { deferred, loadStudioFunctions } from './helpers/studio-source-harness.mjs';

class UserFacingError extends Error { constructor(_code, message) { super(message); } }
const photo = { uri: 'file:///photo.png', name: 'photo.png', mimeType: 'image/png', size: 12 };
function pickerFixture(result, missingNative = false) {
  const calls = [];
  const cache = new Map();
  const evaluate = file => {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const require = id => {
      if (id.startsWith('expo-') && missingNative) throw Error('Native module missing internal detail');
      if (id === 'expo-image-picker') return { UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
        launchImageLibraryAsync: async options => { calls.push(['photos', options]); return result; } };
      if (id === 'expo-document-picker') return { getDocumentAsync: async options => { calls.push(['files', options]); return result; } };
      if (id === './userFacingErrors') return { UserFacingError };
      return evaluate(`_lib/${id.replace(/^\.\//, '')}.ts`);
    };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(code, { exports, require }); return exports;
  };
  const api = evaluate('_lib/deviceImagePicker.ts');
  return { ...api, calls };
}
test('Photos invokes native image library with image-only, limited-access-friendly SDK options', async () => {
  const f = pickerFixture({ canceled: false, assets: [{ uri: photo.uri, fileName: photo.name, mimeType: photo.mimeType, fileSize: 12 }] });
  assert.equal(JSON.stringify(await f.pickDeviceImage('photos')), JSON.stringify(photo));
  const [source, options] = f.calls[0];
  assert.equal(source, 'photos'); assert.deepEqual(Array.from(options.mediaTypes), ['images']);
  assert.equal(options.legacy, false); // System picker; this does not prove local-only/OEM gallery.
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
function coverFixture(pick = async () => photo, source = 'photos') {
  let authority = { userId: 'owner', state: 'ACTIVE', restoreOnly: false, session: 1 };
  const effects = [], calls = [];
  const context = {
    getUserFacingErrorMessage: (_error, fallback) => fallback,
    user: { id: 'owner' }, clipCoverPickerInFlightRef: { current: false }, creatorVideoPickerInFlightRef: { current: false }, clipSaveInFlightRef: { current: false },
    clipLoading: false, clipLoadError: null, clipEditorGenerationRef: { current: 1 }, replayActionsMountedRef: { current: true },
    studioMediaTargetRef: { current: 'clip:first' }, clipSaveState: 'ready_to_save', selectedClipCoverAuthorityRef: { current: null },
    getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority: (a, b) => a === b,
    pickDeviceImage: async source => { calls.push(source); return pick(); },
    pickMedia: async options => options.pick(source),
    getClipStudioCoverValidationMessage: file => file.size > 20 * 1024 * 1024 ? 'too big' : null,
    ...Object.fromEntries(['setClipSaveState', 'setClipNotice', 'logClipStudioUi', 'setSelectedClipCoverFile', 'setClipSavedVideoId', 'updateClipEditor'].map(key => [key, (...args) => effects.push([key, ...args])])),
  };
  return { ...loadStudioFunctions('app/channel-settings.tsx', ['onPickClipCoverFile'], context), context, calls, effects,
    replaceSession: () => { authority = { ...authority, session: 2 }; } };
}
test('production cover handler uses shared source choice and retains private preview', async () => {
  for (const source of ['photos', 'camera', 'files']) {
    const f = coverFixture(undefined, source); await f.onPickClipCoverFile();
    assert.deepEqual(f.calls, [source]);
    assert.equal(f.effects.filter(x => x[0] === 'setSelectedClipCoverFile').length, 1);
    assert.ok(f.effects.some(x => x[0] === 'updateClipEditor' && x[1].coverPreviewUrl === photo.uri));
  }
});
test('double tap launches only one native picker and unlocks after cancellation', async () => {
  const pending = deferred(), f = coverFixture(() => pending.promise);
  const operation = f.onPickClipCoverFile(); await f.onPickClipCoverFile('files');
  assert.deepEqual(f.calls, ['photos']); pending.resolve(null); await operation;
  assert.equal(f.context.clipCoverPickerInFlightRef.current, false);
  assert.ok(!f.effects.some(x => x[0] === 'setSelectedClipCoverFile'));
});
for (const retire of ['session', 'generation', 'target', 'unmount']) test(`cover ignores native result after ${retire} retirement`, async () => {
  const pending = deferred(), f = coverFixture(() => pending.promise), operation = f.onPickClipCoverFile();
  if (retire === 'session') f.replaceSession();
  if (retire === 'generation') f.context.clipEditorGenerationRef.current++;
  if (retire === 'target') f.context.studioMediaTargetRef.current = 'clip:replacement';
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
test('Studio renders one shared-picker entry per media target, not source button pairs', () => {
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
    const context = { React, TouchableOpacity: 'button', onPickClipCoverFile: (...args) => calls.push(['cover', ...args]), pickPlatformBrandAsset: (...args) => calls.push(args) };
    vm.runInNewContext(js, context); context.element.props.onPress();
  }
  assert.equal(nodes.length, 8); // two mutually exclusive cover states; six Brand targets
  assert.equal(calls.filter(x => x[0] === 'cover').length, 2);
  for (const asset of ['cover', 'hero_image', 'hero_video', 'background_image', 'avatar', 'logo', 'watermark']) {
    assert.ok(calls.some(x => x[0] === asset));
    assert.ok(calls.filter(x => x[0] === asset).every(x => x.length === 1));
  }
});

function brandFixture(pick = async () => photo, source = 'photos') {
  let authority = { userId: 'owner', state: 'ACTIVE', restoreOnly: false, session: 1 };
  const calls = [], effects = [], uploads = [];
  const context = {
    getUserFacingErrorMessage: (_error, fallback) => fallback,
    user: { id: 'owner' }, brandUploadInFlightRef: { current: false }, brandUploadAttemptRef: { current: null },
    setBrandUploadFile: () => {},
    brandProfileSaveInFlightRef: { current: false }, brandSaving: false, studioMediaTargetRef: { current: 'brand:first' },
    formatPlatformBrandAssetTypeLabel: value => value,
    brandSheetDismissal: { waitForDismissal: async () => {} }, setActiveBrandSheetSection: () => {},
    activeBrandSheetSection: 'hero', brandPickerDismissalSectionRef: { current: null },
    replayActionsMountedRef: { current: true }, getCurrentAccountSessionAuthoritySnapshot: () => authority,
    sameAccountSessionAuthority: (a, b) => a === b,
    pickDeviceImage: async source => { calls.push(source); return pick(); },
    pickDeviceVideo: async source => { calls.push(source); return pick(); },
    pickMedia: async options => { await options.beforePresent?.(); return options.pick(source); },
    getPlatformBrandAssetValidationMessage: file => file.size > 20 * 1024 * 1024 ? 'too big' : null,
    uploadPlatformBrandAsset: async input => { input.assertOperationCurrent(); uploads.push(input); return { id: 'asset' }; },
    saveBrandDraftPatch: async patch => { effects.push(['save', patch]); return {}; },
    setBrandNotice: value => effects.push(['notice', value]), setBrandBusyAssetType: value => effects.push(['busy', value]),
  };
  return { ...loadStudioFunctions('app/channel-settings.tsx', ['pickPlatformBrandAsset'], context), calls, effects, uploads, context,
    replaceSession: () => { authority = { ...authority, session: 2 }; } };
}
test('actual Brand picker preserves validated source mapping through the shared sheet', async () => {
  for (const source of ['photos', 'camera', 'files']) {
    const f = brandFixture(undefined, source); await f.pickPlatformBrandAsset('hero_image');
    assert.deepEqual(f.calls, [source]); assert.equal(f.uploads[0].file, photo);
    assert.equal(f.uploads[0].ownerUserId, 'owner');
    assert.ok(f.effects.some(x => x[0] === 'save' && x[1].heroImageAssetId === 'asset'));
  }
});
test('Brand ignores repeated taps and stale-session selection before any upload', async () => {
  const pending = deferred(), f = brandFixture(() => pending.promise);
  const operation = f.pickPlatformBrandAsset('avatar'); await f.pickPlatformBrandAsset('logo', 'files');
  await new Promise(setImmediate);
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
  const api = pickerFixture(null, true);
  await assert.rejects(() => api.pickDeviceImage('photos'), /Photo gallery.*current app build/);
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

for (const kind of ['video', 'cover']) test(`save refuses a ${kind} selected by an earlier same-user session before uploading`, async () => {
  const f = coverFixture();
  const oldAuthority = f.context.getCurrentAccountSessionAuthoritySnapshot();
  Object.assign(f.context, {
    selectedClipVideoFile: kind === 'video' ? { uri: 'file:///clip.mp4' } : null,
    selectedClipCoverFile: kind === 'cover' ? photo : null,
    selectedClipVideoAuthorityRef: { current: oldAuthority }, selectedClipCoverAuthorityRef: { current: oldAuthority },
  });
  f.replaceSession();
  const { saveClipStudio } = loadStudioFunctions('app/channel-settings.tsx', ['saveClipStudio'], f.context);
  await saveClipStudio('draft');
  assert.ok(f.effects.some(x => x[0] === 'setClipNotice' && /Choose your media again/.test(x[1])));
  assert.equal(f.context.clipSaveInFlightRef.current, false);
});

function videoPickerFixture(pick = async () => ({ uri: 'file:///clip.mp4', mimeType: 'video/mp4', size: 100 })) {
  let authority = { userId: 'owner', state: 'ACTIVE', restoreOnly: false, session: 1 };
  const effects = [], calls = [];
  const context = {
    user: { id: 'owner' }, clipLoading: false, clipLoadError: null,
    creatorVideoPickerInFlightRef: { current: false }, clipCoverPickerInFlightRef: { current: false },
    clipSaveInFlightRef: { current: false }, paidVideoSaveInFlightRef: { current: false },
    replayActionsMountedRef: { current: true }, clipEditorGenerationRef: { current: 1 },
    videoEditorGenerationRef: { current: 1 },
    studioMediaTargetRef: { current: 'clip:first' }, clipSaveState: 'ready_to_save', videoLifecycleState: 'ready',
    getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority: (a, b) => a === b,
    getUserFacingErrorMessage: (_error, fallback) => fallback,
    pickMedia: async options => options.pick('photos'),
    pickDeviceVideo: async source => { calls.push(source); return pick(); },
    ...Object.fromEntries(['setClipSaveState', 'setClipNotice', 'logClipStudioUi', 'setVideoNotice',
      'logCreatorVideoUploadUi', 'setVideoLifecycleState', 'applySelectedCreatorVideoFile'].map(key => [key, (...args) => effects.push([key, ...args])])),
  };
  return { ...loadStudioFunctions('app/channel-settings.tsx', ['pickCreatorVideo'], context), context, calls, effects,
    replaceSession: () => { authority = { ...authority, session: 2 }; } };
}
test('video picker is single-flight and cancellation keeps the previous media and state', async () => {
  const pending = deferred(), f = videoPickerFixture(() => pending.promise);
  const operation = f.pickCreatorVideo('clip_video'); await f.pickCreatorVideo('clip_video');
  assert.deepEqual(f.calls, ['photos']); pending.resolve(null); await operation;
  assert.equal(f.context.creatorVideoPickerInFlightRef.current, false);
  assert.ok(!f.effects.some(x => x[0] === 'applySelectedCreatorVideoFile'));
  assert.ok(f.effects.some(x => x[0] === 'setClipSaveState' && x[1] === 'ready_to_save'));
});
for (const outcome of ['result', 'error']) for (const retire of ['session', 'generation', 'target', 'unmount']) {
  test(`video picker ignores stale ${outcome} after ${retire} retirement`, async () => {
    const pending = deferred(), f = videoPickerFixture(() => pending.promise), operation = f.pickCreatorVideo('clip_video');
    if (retire === 'session') f.replaceSession();
    if (retire === 'generation') f.context.clipEditorGenerationRef.current++;
    if (retire === 'target') f.context.studioMediaTargetRef.current = 'clip:replacement';
    if (retire === 'unmount') f.context.replayActionsMountedRef.current = false;
    const count = f.effects.length;
    if (outcome === 'error') pending.resolve(Promise.reject(Error('late cloud import failure')));
    else pending.resolve({ uri: 'file:///late.mp4' });
    await operation;
    assert.equal(f.effects.length, count); assert.equal(f.context.creatorVideoPickerInFlightRef.current, false);
  });
}
