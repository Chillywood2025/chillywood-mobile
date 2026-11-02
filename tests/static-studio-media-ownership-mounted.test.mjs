import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, video, edit, React, deferred } from './platform-studio-mounted-harness.mjs';

// Entire production Studio screen, synthetic owned files and storage responses.
// No device filesystem, native build, provider or backend mutation is involved.
test('Clip Save transfers selected cover ownership into its still-local successful preview', async t => {
  const file = { uri: 'fixture:owned-cover.jpg', name: 'owned-cover.jpg', mimeType: 'image/jpeg', size: 100 };
  let deleted = 0, uploads = 0, stored = video('A', 'draft'), savedEdit = edit('A');
  const h = await mount(t, { videos: [stored], overrides: {
    pickDeviceImage: async () => file,
    readClipStudioEdit: async () => savedEdit,
    updateCreatorVideoMetadata: async (_id, patch) => { stored = { ...stored, ...patch }; return stored; },
    uploadClipStudioCoverImage: async input => { uploads++; assert.equal(input.file, file); stored = { ...stored, thumbStoragePath: 'owned-cover' }; return { storagePath: 'owned-cover', mimeType: 'image/jpeg', fileSizeBytes: 100, signedUrl: input.file.uri }; },
    saveClipStudioEdit: async (_id, patch) => { savedEdit = { ...patch }; return savedEdit; },
    readCreatorVideoForOwner: async () => stored, readCreatorVideoForPlayer: async () => ({ playbackUrl: 'fixture:video' }), readCreatorVideos: async () => [stored], formatCreatorVideoUiError: error => error.message,
  } });
  h.media.ownPickedMedia(file, async () => { deleted++; });
  await h.press(h.button('Open actions for Title A')); await h.press(h.button('Edit details'));
  await h.press(h.find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel?.includes('Cover Image')));
  await h.press(h.find(n => n.props.testID === 'clip-cover-picker-button')); await h.press(h.find(n => n.props.testID === 'media-source-photos'));
  assert.equal(deleted, 0);
  const saveSection = h.button('Save. Confirm details and save the draft.'); if (!saveSection.props.accessibilityState.expanded) await h.press(saveSection);
  const queuedSave = h.button('Save Draft'); await h.press(queuedSave); assert.match(h.text(), /Draft saved and confirmed/);
  assert.ok(h.find(n => n.type === 'Image' && n.props.source?.uri === file.uri)); assert.equal(deleted, 0, 'clearing selected cover must not delete local saved preview');
  const coverSection = h.find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel?.includes('Cover Image'));
  if (!coverSection.props.accessibilityState.expanded) await h.press(coverSection);
  await h.press(h.button('Remove Cover Use fallback art')); assert.equal(deleted, 1);
  await React.act(async () => queuedSave.props.onPress()); assert.equal(uploads, 1);
  assert.equal(h.button('Retry Save Draft').props.disabled, false, 'refused stale retention must release the save latch');
  await h.press(h.button('Retry Save Draft')); assert.match(h.text(), /Draft saved and confirmed/);
});

for (const failure of ['before registration', 'pending registration', 'draft save']) test(`Brand ${failure} retains the exact file and attempt through explicit retry`, async t => {
  const file = { uri: `fixture:brand-${failure}.jpg`, name: 'brand.jpg', mimeType: 'image/jpeg', size: 100 };
  let deleted = 0, picks = 0, uploads = 0, saves = 0;
  let profile = { ownerUserId: 'owner', themePreset: 'city_night', accentColor: '#DC143C', heroFitMode: 'fill', backgroundFitMode: 'fill', heroFocalX: 0.5, heroFocalY: 0.5, heroCropScale: 1, overlayStrength: 0.62, blurStrength: 0 };
  const attempts = [], h = await mount(t, { route: { tab: 'brand', focus: 'hero' }, overrides: {
    readPlatformBrandStudio: async () => ({ profile, assets: [], heroImage: null }),
    getPlatformBrandAssetValidationMessage: () => null, formatPlatformBrandAssetTypeLabel: value => value,
    pickDeviceImage: async () => { picks++; return file; },
    uploadPlatformBrandAsset: async input => {
      uploads++; attempts.push(input.attempt); assert.equal(input.file, file); assert.equal(deleted, 0);
      if (failure !== 'before registration') input.attempt.payload ??= { id: 'asset' };
      if (uploads === 1 && failure !== 'draft save') throw Error('not confirmed'); return { id: 'asset' };
    },
    savePlatformBrandProfileDraft: async (_owner, draft) => { if (++saves === 1 && failure === 'draft save') throw Error('draft write failed'); profile = draft; return profile; },
  } });
  h.media.ownPickedMedia(file, async () => { deleted++; });
  const choose = h.button('Choose Brand Studio Hero Image'); await h.press(choose); await h.press(h.find(n => n.props.testID === 'media-source-photos'));
  assert.equal(uploads, 1); assert.equal(deleted, 0);
  assert.equal(!!h.button('Discard local Brand file selection'), failure === 'before registration', 'only an unregistered local selection can be explicitly discarded');
  // This is the same rendered production callback; the source sheet is skipped
  // because the pending attempt owns the exact prior native selection.
  await React.act(async () => { void choose.props.onPress(); });
  assert.equal(uploads, 2); assert.equal(picks, 1); assert.equal(attempts[0], attempts[1]);
  assert.equal(deleted, 1); assert.match(h.text(), /Platform media saved as draft/);
});

test('Brand local discard checks the exact current attempt and rechecks pending registration at click time', async t => {
  const files = ['first', 'second'].map(name => ({ uri: `fixture:discard-${name}.jpg`, name, mimeType: 'image/jpeg', size: 100 })), deleted = [], attempts = [];
  let picks = 0;
  const profile = { ownerUserId: 'owner', themePreset: 'city_night', accentColor: '#DC143C', heroFitMode: 'fill', backgroundFitMode: 'fill', heroFocalX: 0.5, heroFocalY: 0.5, heroCropScale: 1, overlayStrength: 0.62, blurStrength: 0 };
  const h = await mount(t, { route: { tab: 'brand', focus: 'hero' }, overrides: {
    readPlatformBrandStudio: async () => ({ profile, assets: [], heroImage: null }), getPlatformBrandAssetValidationMessage: () => null, formatPlatformBrandAssetTypeLabel: value => value,
    pickDeviceImage: async () => files[picks++], uploadPlatformBrandAsset: async input => { attempts.push(input.attempt); throw Error('pre-registration failure'); },
  } });
  files.forEach(file => h.media.ownPickedMedia(file, async () => { deleted.push(file.name); }));
  const choose = h.button('Choose Brand Studio Hero Image');
  await h.press(choose); await h.press(h.find(n => n.props.testID === 'media-source-photos'));
  const staleDiscard = h.button('Discard local Brand file selection'); await h.press(staleDiscard); assert.deepEqual(deleted, ['first']);
  await React.act(async () => { void choose.props.onPress(); }); await h.press(h.find(n => n.props.testID === 'media-source-photos'));
  await React.act(async () => staleDiscard.props.onPress()); assert.deepEqual(deleted, ['first']);
  const pendingDiscard = h.button('Discard local Brand file selection');
  attempts[1].payload = { id: 'pending-registration' };
  await React.act(async () => pendingDiscard.props.onPress()); assert.deepEqual(deleted, ['first'], 'a stale enabled button cannot discard newly registered pending media');
  await h.unmount(); assert.deepEqual(deleted, ['first', 'second']);
});

test('Clip Save flight keeps a retired selection alive while its raw native read remains pending', async t => {
  const file = { uri: 'fixture:late-cover.jpg', name: 'late-cover.jpg', mimeType: 'image/jpeg', size: 100 }, native = deferred();
  let deleted = 0, savedEdit = edit('A'), stored = video('A', 'draft');
  const h = await mount(t, { videos: [stored], overrides: {
    pickDeviceImage: async () => file, readClipStudioEdit: async () => savedEdit,
    updateCreatorVideoMetadata: async (_id, patch) => { stored = { ...stored, ...patch }; return stored; },
    uploadClipStudioCoverImage: async () => { void h.media.withPickedMediaRead(file.uri, () => native.promise); throw Error('native read timed out'); },
    formatCreatorVideoUiError: error => error.message,
  } });
  h.media.ownPickedMedia(file, async () => { deleted++; });
  await h.press(h.button('Open actions for Title A')); await h.press(h.button('Edit details'));
  await h.press(h.find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel?.includes('Cover Image')));
  await h.press(h.find(n => n.props.testID === 'clip-cover-picker-button')); await h.press(h.find(n => n.props.testID === 'media-source-photos'));
  const saveSection = h.button('Save. Confirm details and save the draft.'); if (!saveSection.props.accessibilityState.expanded) await h.press(saveSection);
  await h.press(h.button('Save Draft')); await h.unmount(); assert.equal(deleted, 0);
  await h.resolve(native); assert.equal(deleted, 1);
});
