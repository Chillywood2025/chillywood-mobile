import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStudioFunctions } from './helpers/studio-source-harness.mjs';
import { mount, video, edit, deferred } from './platform-studio-mounted-harness.mjs';

const { sameAccountSessionAuthority } = loadStudioFunctions('_lib/accountSessionAuthority.ts', ['sameAccountSessionAuthority'], {});

// Production handlers/screens with synthetic picker, upload and save boundaries.
// These probes do not exercise native devices or send provider/database requests.
function fixture(initial, bindings) {
  const authority = { userId: 'owner', accountId: 'owner', state: 'ACTIVE', restoreOnly: false, sessionGeneration: 'fixture-session' };
  const state = { ...initial }, context = { Promise, Date, Map, Set,
    getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority,
    replayActionsMountedRef: { current: true }, brandDraftOwnershipRef: { current: { revision: 0, dirty: false } },
    brandUploadAttemptRef: { current: null }, brandUploadInFlightRef: { current: false },
    ...bindings };
  for (const name of Object.keys(initial)) {
    Object.defineProperty(context, name, { get: () => state[name], configurable: true });
    context[`set${name[0].toUpperCase()}${name.slice(1)}`] = value => {
      state[name] = typeof value === 'function' ? value(state[name]) : value;
    };
  }
  return { state, context, load: names => loadStudioFunctions('app/channel-settings.tsx', names, context) };
}

for (const outcome of ['unavailable', 'write-rejected', 'saved']) {
  test(`Brand picker keeps truthful ${outcome} draft result and releases busy state`, async () => {
    let uploads = 0, saves = 0, readbacks = 0;
    const failure = outcome === 'unavailable'
      ? 'Brand draft saving is temporarily unavailable. Your edits have not been saved. Please try again later.'
      : 'Unable to save Brand Studio changes right now.';
    const h = fixture({ brandSaving: false, brandNotice: null, brandBusyAssetType: null, brandDraft: { ownerUserId: 'owner', heroImageAssetId: null } }, {
      user: { id: 'owner' }, brandProfileSaveInFlightRef: { current: false },
      getCurrentBrandDraft: () => h.state.brandDraft,
      normalizePlatformBrandFitMode: value => value, normalizePlatformBrandThemePreset: value => value,
      DocumentPicker: { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'fixture:image', name: 'fixture.jpg', mimeType: 'image/jpeg', size: 123 }] }) },
      getPlatformBrandAssetValidationMessage: () => null,
      uploadPlatformBrandAsset: async () => { uploads++; return { id: 'uploaded-asset' }; },
      savePlatformBrandProfileDraft: async (_owner, draft) => { saves++; if (outcome !== 'saved') throw Error(failure); return draft; },
      loadPlatformBranding: async () => { readbacks++; },
      getUserFacingErrorMessage: error => error.message,
    });
    const api = h.load(['persistBrandDraftPatch', 'saveBrandDraftPatch', 'pickPlatformBrandAsset']);
    await api.pickPlatformBrandAsset('hero_image');
    assert.equal(uploads, 1); assert.equal(saves, 1);
    if (outcome === 'saved') {
      assert.equal(h.state.brandDraft.heroImageAssetId, 'uploaded-asset');
      assert.match(h.state.brandNotice, /^Platform media saved as draft/);
      assert.equal(readbacks, 1);
    } else {
      assert.equal(h.state.brandDraft.heroImageAssetId, null);
      assert.equal(h.state.brandNotice, failure, 'failed draft selection must keep its failure notice');
      assert.equal(readbacks, 0);
    }
    assert.equal(h.state.brandSaving, false);
    assert.equal(h.state.brandBusyAssetType, null);
    assert.equal(h.context.brandProfileSaveInFlightRef.current, false);
  });
}

for (const outcome of ['rejected', 'response-lost']) {
  test(`mounted Clip metadata ${outcome} preserves intent and confirms the exact retry`, async t => {
    let storedVideo = video('A', 'draft'), storedEdit = edit('A');
    const attempts = [], updateIds = [], gate = deferred();
    const h = await mount(t, { videos: [storedVideo], overrides: {
      readClipStudioEdit: async () => storedEdit,
      updateCreatorVideoMetadata: async (id, patch) => { updateIds.push(id); storedVideo = { ...storedVideo, ...patch }; return storedVideo; },
      saveClipStudioEdit: async (id, patch) => {
        attempts.push({ id, patch: { ...patch } });
        if (attempts.length === 1) {
          await gate.promise;
          if (outcome === 'response-lost') storedEdit = { ...patch };
          throw Error('modeled settings-save failure');
        }
        storedEdit = { ...patch };
        return storedEdit;
      },
      readCreatorVideoForOwner: async () => storedVideo,
      readCreatorVideos: async () => [storedVideo],
    } });
    await h.press(h.button('Open actions for Title A'));
    await h.press(h.button('Edit details'));
    await h.change(h.input('Title text'), 'Intended changed overlay');
    await h.change(h.input('Subtitle text'), 'Intended changed subtitle');
    await h.press(h.button('Save Draft'));
    assert.equal(attempts.length, 1);
    assert.equal(h.input('Title text').props.editable, false, 'save keeps the attempted intent locked');
    await h.resolve(gate);
    assert.equal(h.input('Title text').props.value, 'Intended changed overlay');
    assert.equal(h.input('Subtitle text').props.value, 'Intended changed subtitle');
    if (outcome === 'rejected') {
      assert.match(h.text(), /Retry Save Draft to finish it/);
      assert.equal(h.input('Title text').props.editable, true);
      await h.press(h.button('Retry Save Draft'));
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts[1], attempts[0], 'retry keeps the original video and complete intended settings');
    } else {
      assert.equal(attempts.length, 1, 'readback-confirmed response loss does not need another settings write');
    }
    assert.ok(updateIds.every(id => id === 'A'), 'retry does not create or change targets');
    assert.equal(storedEdit.titleOverlayText, 'Intended changed overlay');
    assert.equal(storedEdit.titleOverlaySubtitle, 'Intended changed subtitle');
    assert.match(h.text(), /Draft saved and confirmed in Content Library/);
    assert.ok(h.button('View Draft'));
  });
}
