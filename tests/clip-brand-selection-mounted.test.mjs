import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, video, edit, deferred } from './platform-studio-mounted-harness.mjs';
import { loadStudioFunctions } from './helpers/studio-source-harness.mjs';

// Production Studio rendering and save handlers. Native media and persistence
// remain explicit fixtures; no renderer, provider, or activation is exercised.
const asset = (id, patch = {}) => ({ id, ownerUserId: 'owner', assetType: 'watermark',
  assetState: 'published', moderationStatus: 'clean', scanStatus: 'clean',
  deletedAt: null, signedUrl: `fixture:${id}`, ...patch });
const profile = { ownerUserId: 'owner', themePreset: 'city_night', accentColor: '#DC143C', heroFitMode: 'fill',
  backgroundFitMode: 'fill', heroFocalX: 0.5, heroFocalY: 0.5, heroCropScale: 1, overlayStrength: 0.62, blurStrength: 0 };

async function fixture(t, { selected = asset('saved'), enabled = true, savedId = 'saved', current = asset('current'), readFailure = false } = {}) {
  let storedVideo = video('A', 'draft');
  let storedEdit = { ...edit('A'), brandMarkEnabled: enabled, brandAssetId: savedId };
  let brandAssets = current ? [current] : [], brandCurrent = current, brandReads = 0;
  const writes = [];
  const h = await mount(t, { videos: [storedVideo], overrides: {
    readPlatformBrandStudio: async () => { brandReads++; return { profile, assets: brandAssets, watermark: brandCurrent,
      heroImage: null, heroVideo: null, heroPoster: null, backgroundImage: null, avatar: null, logo: null }; },
    savePlatformBrandProfileDraft: async (_owner, draft) => draft,
    saveUserProfileRemote: async value => value,
    readClipStudioEdit: async () => storedEdit,
    readClipPlatformBrandAsset: async (owner, id) => {
      assert.equal(owner, 'owner'); assert.equal(id, savedId);
      if (readFailure) throw Error('modeled read failure');
      return selected;
    },
    updateCreatorVideoMetadata: async (_id, patch) => { storedVideo = { ...storedVideo, ...patch }; return storedVideo; },
    saveClipStudioEdit: async (_id, patch) => { writes.push({ ...patch }); storedEdit = { ...patch }; return storedEdit; },
    readCreatorVideoForOwner: async () => storedVideo,
    readCreatorVideos: async () => [storedVideo],
  } });
  await h.press(h.button('Open actions for Title A'));
  await h.press(h.button('Edit details'));
  await h.change(h.input('Title text'), 'Unrelated title edit');
  return { h, writes, async refreshBrand(assets, currentMark = current) {
    brandAssets = assets; brandCurrent = currentMark;
    const before = brandReads;
    await h.press(h.button('Open Brand Studio'));
    await h.press(h.button('Save Brand Studio Draft'));
    assert.ok(brandReads > before, 'production Brand save refreshes the library');
    await h.press(h.button('Clip'));
  } };
}

test('saved Clip brand mark outside the recent library remains exact after the Platform watermark changes', async t => {
  const { h, writes } = await fixture(t);
  assert.ok(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:saved'), 'preview uses the saved mark');
  assert.equal(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:current'), undefined);
  await h.press(h.button('Save Draft'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].brandAssetId, 'saved');
  assert.equal(writes[0].brandMarkEnabled, true);
});

for (const [name, selected] of [
  ['missing', null], ['deleted', asset('saved', { deletedAt: '2026-11-01T00:00:00Z' })],
  ['unscanned', asset('saved', { scanStatus: 'pending_scan' })],
  ['rejected', asset('saved', { moderationStatus: 'rejected' })],
  ['archived', asset('saved', { assetState: 'archived' })],
  ['wrong owner', asset('saved', { ownerUserId: 'other' })],
  ['wrong kind', asset('saved', { assetType: 'hero_video' })],
  ['wrong ID', asset('unexpected')],
]) test(`${name} saved Clip mark cannot silently fall back and can be explicitly removed`, async t => {
  const { h, writes } = await fixture(t, { selected });
  assert.equal(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:current'), undefined);
  assert.equal(h.button('Save Draft').props.disabled, true);
  assert.equal(h.button('Publish Clip').props.disabled, true);
  const section = h.all().find(n => n.props.accessibilityLabel?.startsWith('Platform Brand.'));
  if (section) await h.press(section);
  await h.press(h.find(n => n.props.testID === 'clip-brand-mark-toggle'));
  assert.equal(h.button('Save Draft').props.disabled, false);
  await h.press(h.button('Save Draft'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].brandMarkEnabled, false);
  assert.equal(writes[0].brandAssetId, null);
});

test('failed saved-mark read stays visibly unavailable and does not substitute a current mark', async t => {
  const { h, writes } = await fixture(t, { readFailure: true });
  assert.equal(h.button('Save Draft').props.disabled, true);
  assert.match(h.text(), /saved brand mark is unavailable/);
  assert.equal(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:current'), undefined);
  assert.equal(writes.length, 0);
});

for (const retirement of ['other clip', 'new clip', 'account']) {
  test(`late saved-mark read cannot populate ${retirement}`, async t => {
    const pending = deferred();
    const h = await mount(t, { overrides: {
      readClipStudioEdit: async id => ({ ...edit(id), brandMarkEnabled: id === 'A', brandAssetId: id === 'A' ? 'saved-A' : null }),
      readClipPlatformBrandAsset: () => pending.promise,
    } });
    await h.press(h.button('Open actions for Title A')); await h.press(h.button('Edit details'));
    assert.equal(h.input('Title text').props.editable, false);
    if (retirement === 'account') {
      await h.account({ user: { id: 'owner' }, isSignedIn: true, isLoading: false, authorityStatus: 'active',
        authority: { userId: 'owner', accountId: 'owner', state: 'ACTIVE', restoreOnly: false, sessionGeneration: 'next' } });
    } else {
      await h.press(h.button('Content'));
      if (retirement === 'other clip') {
        await h.press(h.button('Open actions for Title B')); await h.press(h.button('Edit details'));
      } else await h.press(h.button('Open Clip Studio'));
    }
    await h.resolve(pending, asset('saved-A'));
    assert.equal(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:saved-A'), undefined);
    if (retirement === 'other clip') assert.equal(h.input('Title text').props.value, 'Overlay B');
  });
}

test('production exact mark lookup retains owner, publication and safety filters and surfaces read failure', async () => {
  const calls = []; let response = { data: { id: 'saved' }, error: null };
  const query = {};
  for (const method of ['select', 'eq', 'in', 'is', 'maybeSingle']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.returns = async () => response;
  const { readClipPlatformBrandAsset } = loadStudioFunctions('_lib/platformBranding.ts', ['readClipPlatformBrandAsset'], {
    toText: x => String(x ?? '').trim(), PLATFORM_BRAND_ASSET_SELECT: '*', parseAsset: async x => x,
    supabase: { from: table => { assert.equal(table, 'platform_brand_assets'); return query; } },
  });
  assert.equal((await readClipPlatformBrandAsset('owner', 'saved')).id, 'saved');
  for (const expected of [['eq', 'id', 'saved'], ['eq', 'owner_user_id', 'owner'], ['eq', 'asset_state', 'published'],
    ['eq', 'scan_status', 'clean'], ['is', 'deleted_at', null], ['in', 'asset_type', ['watermark', 'logo', 'avatar']],
    ['in', 'moderation_status', ['clean', 'reported']]]) {
    assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(expected)), JSON.stringify(expected));
  }
  response = { data: null, error: null }; assert.equal(await readClipPlatformBrandAsset('owner', 'saved'), null);
  response = { data: null, error: Error('offline') };
  await assert.rejects(readClipPlatformBrandAsset('owner', 'saved'), /could not be loaded/);
});

test('turning a Clip brand mark on explicitly chooses the current safe Platform mark', async t => {
  const { h, writes } = await fixture(t, { selected: null, enabled: false, savedId: null });
  const section = h.all().find(n => n.props.accessibilityLabel?.startsWith('Platform Brand.'));
  if (section) await h.press(section);
  await h.press(h.find(n => n.props.testID === 'clip-brand-mark-toggle'));
  assert.ok(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:current'));
  await h.press(h.button('Save Draft'));
  assert.equal(writes[0].brandMarkEnabled, true);
  assert.equal(writes[0].brandAssetId, 'current');
});

test('turning the saved mark off then on explicitly replaces it with the current Platform mark', async t => {
  const { h, writes } = await fixture(t);
  const section = h.all().find(n => n.props.accessibilityLabel?.startsWith('Platform Brand.'));
  if (section) await h.press(section);
  await h.press(h.find(n => n.props.testID === 'clip-brand-mark-toggle'));
  assert.equal(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:saved'), undefined);
  await h.press(h.find(n => n.props.testID === 'clip-brand-mark-toggle'));
  assert.ok(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:current'));
  assert.equal(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:saved'), undefined);
  await h.press(h.button('Save Draft'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].brandMarkEnabled, true);
  assert.equal(writes[0].brandAssetId, 'current');
});

for (const [name, patch] of [
  ['rejected', { moderationStatus: 'rejected' }],
  ['quarantined', { scanStatus: 'quarantined' }],
  ['archived', { assetState: 'archived' }],
]) test(`a newer ${name} same-ID Brand library refresh invalidates the saved mark without fallback`, async t => {
  const { h, writes, refreshBrand } = await fixture(t);
  assert.ok(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:saved'));
  await refreshBrand([asset('current'), asset('saved', patch)]);
  assert.equal(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:saved'), undefined);
  assert.equal(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:current'), undefined);
  assert.equal(h.button('Save Draft').props.disabled, true);
  assert.equal(h.button('Publish Clip').props.disabled, true);
  assert.match(h.text(), /saved brand mark is unavailable/);
  assert.equal(writes.length, 0);
});

test('absence from a refreshed recent library does not invalidate an older exact saved mark', async t => {
  const { h, writes, refreshBrand } = await fixture(t);
  await refreshBrand([asset('current')]);
  assert.ok(h.find(n => n.type === 'Image' && n.props.source?.uri === 'fixture:saved'));
  await h.press(h.button('Save Draft'));
  assert.equal(writes[0].brandAssetId, 'saved');
  assert.equal(writes[0].brandMarkEnabled, true);
});
