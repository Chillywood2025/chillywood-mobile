import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, loadStudioFunctions } from './helpers/studio-source-harness.mjs';

const { sameAccountSessionAuthority } = loadStudioFunctions('_lib/accountSessionAuthority.ts', ['sameAccountSessionAuthority'], {});
const originalAuthority = { userId: 'owner', accountId: 'owner', state: 'ACTIVE', restoreOnly: false, sessionGeneration: 'first' };

// Execute the actual UI handler; picker/storage/profile IO is synthetic here.
// Real SQL registration and storage-policy coverage lives in the adjacent suite.
function fixture(options = {}) {
  let authority = { ...originalAuthority };
  const state = { busy: null, notice: null, picks: 0, saves: [], uploads: [] };
  const attemptRef = { current: null }, inFlightRef = { current: false }, mountedRef = { current: true };
  const file = { uri: 'file:///selected.png', name: 'selected.png', mimeType: 'image/png', size: 79 };
  const context = {
    user: { id: 'owner' }, brandUploadAttemptRef: attemptRef, brandUploadInFlightRef: inFlightRef,
    replayActionsMountedRef: mountedRef,
    getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority,
    setBrandBusyAssetType: value => { state.busy = value; }, setBrandNotice: value => { state.notice = value; },
    getUserFacingErrorMessage: (_error, fallback) => fallback,
    async pickDeviceImage() {
      state.picks++; await options.picker?.();
      return options.cancel ? null : file;
    },
    getPlatformBrandAssetValidationMessage: () => options.invalid ? 'Invalid fixture file' : null,
    async uploadPlatformBrandAsset(input) {
      state.uploads.push(input);
      if (options.beforeUpload) await options.beforeUpload(input);
      if (options.preUploadFailure) throw new Error('storage failed before acknowledgement');
      input.attempt.payload ??= { id: 'registered-asset' };
      if (options.upload) return options.upload(input);
      return { id: 'registered-asset' };
    },
    async saveBrandDraftPatch(patch) { state.saves.push(patch); return { ...patch }; },
  };
  const api = loadStudioFunctions('app/channel-settings.tsx', ['pickPlatformBrandAsset'], context);
  return { ...api, state, attemptRef, inFlightRef, mountedRef,
    replace: value => { authority = value; },
  };
}

test('Unconfirmed upload keeps exact file/attempt and same-option retry skips picker', async () => {
  let calls = 0;
  const h = fixture({ upload: async () => { if (++calls === 1) throw new Error('unconfirmed'); return { id: 'registered-asset' }; } });
  await h.pickPlatformBrandAsset('avatar');
  const retained = h.attemptRef.current;
  assert.ok(retained?.attempt.payload); assert.match(h.state.notice, /same media option/);
  assert.equal(h.state.busy, null); assert.equal(h.inFlightRef.current, false);
  await h.pickPlatformBrandAsset('avatar');
  assert.equal(h.state.picks, 1); assert.equal(h.state.uploads.length, 2);
  assert.equal(h.state.uploads[0].file, h.state.uploads[1].file);
  assert.equal(h.state.uploads[0].attempt, h.state.uploads[1].attempt);
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.saves)), [{ avatarAssetId: 'registered-asset' }]);
  assert.equal(h.attemptRef.current, null); assert.equal(h.inFlightRef.current, false);
});

test('An unresolved upload prevents a different media option from replacing it', async () => {
  const h = fixture({ upload: async () => { throw new Error('unconfirmed'); } });
  await h.pickPlatformBrandAsset('avatar');
  const retained = h.attemptRef.current;
  await h.pickPlatformBrandAsset('logo');
  assert.equal(h.attemptRef.current, retained); assert.equal(h.state.picks, 1);
  assert.equal(h.state.uploads.length, 1); assert.equal(h.state.saves.length, 0);
  assert.match(h.state.notice, /previous media selection/);
});

test('Duplicate taps cannot race the pending picker or create another upload', async () => {
  const gate = deferred(), reached = deferred();
  const h = fixture({ picker: async () => { reached.resolve(); await gate.promise; } });
  const first = h.pickPlatformBrandAsset('avatar'); await reached.promise;
  const duplicate = h.pickPlatformBrandAsset('avatar'), different = h.pickPlatformBrandAsset('logo');
  try { assert.equal(h.state.picks, 1); assert.equal(h.state.uploads.length, 0); }
  finally { gate.resolve(); await Promise.all([first, duplicate, different]); }
  assert.equal(h.state.uploads.length, 1); assert.equal(h.state.saves.length, 1);
  assert.equal(h.state.busy, null); assert.equal(h.inFlightRef.current, false);
});

for (const stage of ['picker', 'upload']) {
  for (const replacement of [null, { ...originalAuthority, userId: 'other', accountId: 'other' },
    { ...originalAuthority, sessionGeneration: 'replacement' }, { ...originalAuthority, restoreOnly: true }]) {
    test(`Stale ${stage} completion cannot save a profile: ${JSON.stringify(replacement)}`, async () => {
      const gate = deferred(), reached = deferred();
      const pause = async () => { reached.resolve(); await gate.promise; };
      const h = fixture(stage === 'picker' ? { picker: pause } : { beforeUpload: pause });
      const operation = h.pickPlatformBrandAsset('avatar'); await reached.promise;
      h.replace(replacement); gate.resolve(); await operation;
      assert.equal(h.state.saves.length, 0);
      assert.equal(h.state.uploads.length, stage === 'picker' ? 0 : 1);
      assert.equal(h.inFlightRef.current, false); assert.equal(h.state.busy, null);
      assert.doesNotMatch(h.state.notice ?? '', /saved as draft/);
    });
  }
}

for (const options of [{ preUploadFailure: true }, { cancel: true }, { invalid: true }]) {
  test(`Pre-registration interruption clears retry identity and busy state: ${JSON.stringify(options)}`, async () => {
    const h = fixture(options); await h.pickPlatformBrandAsset('avatar');
    assert.equal(h.attemptRef.current, null); assert.equal(h.inFlightRef.current, false);
    assert.equal(h.state.busy, null); assert.equal(h.state.saves.length, 0);
  });
}

test('New session cannot reuse the previous session upload attempt', async () => {
  let calls = 0;
  const h = fixture({ upload: async () => { if (++calls === 1) throw new Error('unconfirmed'); return { id: 'new-asset' }; } });
  await h.pickPlatformBrandAsset('avatar');
  const prior = h.attemptRef.current;
  h.replace({ ...originalAuthority, sessionGeneration: 'new-session' });
  await h.pickPlatformBrandAsset('avatar');
  assert.equal(h.state.picks, 2);
  assert.notEqual(h.state.uploads[1].attempt, prior.attempt);
});
