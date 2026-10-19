import assert from 'node:assert/strict';
import test from 'node:test';
import {mount as mountStudio, productionFunctions, textOf} from './platform-studio-mounted-harness.mjs';
import {mount as mountPublic} from './platform-public-mounted-harness.mjs';

const {hasCreatorVideoPreviewSource} = productionFunctions('_lib/creatorVideoPreview.ts', ['hasCreatorVideoPreviewSource'], {});
const {parseCreatorVideo} = productionFunctions('_lib/creatorVideos.ts', ['toText', 'normalizeVisibility', 'normalizeModerationStatus', 'parseCreatorVideo'], {
  normalizeMediaStorageProvider: value => value,
  getMediaStorageProviderBucket: ({bucket, fallbackBucket}) => bucket || fallbackBucket,
  CREATOR_VIDEO_BUCKET: 'creator-videos',
  createCreatorVideoThumbnailUrl: async () => '',
});
const {isCreatorVideoPubliclyShareable} = productionFunctions('_lib/creatorVideoLinks.ts', ['isCreatorVideoPubliclyShareable'], {});
const paidSetup = productionFunctions('app/channel-settings.tsx', ['hasPlayableCreatorVideoSource', 'getPaidVideoSetupUnavailableReason'], {});

const row = {
  id: 'preview-source-fixture', owner_id: 'owner', title: 'Canonical object source',
  visibility: 'public', moderation_status: 'clean', storage_provider: 'b2',
  storage_bucket: 'fixture-bucket', playback_url: '', storage_path: '', storage_object_key: '',
  created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z',
};
const ownerVideo = changes => parseCreatorVideo({...row, ...changes});
const contentCard = h => h.find(node => node.type === 'TouchableOpacity'
  && node.props.accessibilityLabel?.startsWith('Canonical object source.'));
const assertPlayerRoute = h => assert.ok(h.routes.some(route => route.pathname === '/player/[id]'
  && route.params.id === row.id && route.params.source === 'creator-video'));
const assertNoWrites = h => assert.equal(h.calls.some(([name]) => /^(save|upload|delete|update|publish)/.test(name)), false);

test('owner list parsing retains canonical object references without pre-resolving playback', async () => {
  const video = await ownerVideo({storage_object_key: 'creator/video.mp4'});
  assert.equal(video.playbackUrl, '');
  assert.equal(video.storagePath, '');
  assert.equal(video.storageObjectKey, 'creator/video.mp4');
  assert.equal(hasCreatorVideoPreviewSource(video), true);
});

test('mounted owner card opens Player for an object-key-only source without claiming resolved playback', async t => {
  const video = await ownerVideo({storage_object_key: 'creator/video.mp4'});
  const h = await mountStudio(t, {route: {tab: 'content'}, videos: [video]});
  const card = contentCard(h);
  assert.ok(card);
  assert.doesNotMatch(card.props.accessibilityLabel, /Media unavailable/);
  await h.press(card);
  assertPlayerRoute(h);
  assertNoWrites(h);
  assert.equal(h.calls.some(([name]) => name === 'readCreatorVideoForPlayer'), false,
    'navigation leaves access and actual playback resolution to Player');
});

test('mounted Home offers Open Player for the same source metadata', async t => {
  const video = await ownerVideo({storage_object_key: 'creator/video.mp4'});
  const h = await mountStudio(t, {route: {tab: 'home'}, videos: [video]});
  await h.press(h.button('Open Player'));
  assertPlayerRoute(h);
  h.routes.length = 0;
  await h.press(h.button('Live and Events. Go live, schedule events, and manage reminders.'));
  await h.press(h.find(node => node.type === 'TouchableOpacity'
    && textOf(node).startsWith('Watch-Party Live from content')));
  assertPlayerRoute(h);
  assertNoWrites(h);
});

test('legacy HTTP placeholders and source-less rows stay unavailable in owner cards', async () => {
  for (const changes of [
    {},
    {playback_url: 'https://example.invalid/fixture.mp4'},
    {playback_url: 'https://media.example.test/legacy.mp4'},
    {storage_object_key: '//example.invalid/fixture.mp4'},
    {storage_object_key: 'fixture:unresolved-media'},
    {storage_object_key: '   '},
  ]) {
    const video = await ownerVideo(changes);
    assert.equal(hasCreatorVideoPreviewSource(video), false);
    const h = await mountStudio(null, {route: {tab: 'content'}, videos: [video]});
    try {
      const card = contentCard(h);
      assert.match(card.props.accessibilityLabel, /Media unavailable/);
      await h.press(card);
      assert.equal(h.routes.some(route => route.pathname === '/player/[id]'), false);
      assertNoWrites(h);
    } finally { await h.unmount(); }
  }
});

test('mounted Live Player shortcut accepts object references but rejects source-less media', async () => {
  for (const [changes, expectedPlayer] of [
    [{storage_object_key: 'creator/video.mp4'}, true],
    [{playback_url: 'https://example.invalid/fixture.mp4'}, false],
    [{}, false],
    [{storage_object_key: 'creator/video.mp4', visibility: 'draft'}, false],
  ]) {
    const video = await ownerVideo(changes);
    const h = await mountStudio(null, {route: {tab: 'live'}, videos: [video]});
    try {
      await h.press(h.find(node => node.type === 'TouchableOpacity'
        && textOf(node).startsWith('Watch-Party Tools')));
      if (expectedPlayer) assertPlayerRoute(h);
      else {
        assert.equal(h.routes.some(route => route.pathname === '/player/[id]'), false);
        assert.ok(h.alerts.some(([title]) => title === 'Setup required'));
      }
      assertNoWrites(h);
    } finally { await h.unmount(); }
  }
});

test('existing storage-path and resolved playback sources remain eligible', async () => {
  const sourceVideo = await ownerVideo({storage_path: 'creator/video.mp4'});
  for (const video of [sourceVideo, {...sourceVideo, storagePath: '', storageObjectKey: '', playbackUrl: 'https://resolved.example.test/video'}]) {
    assert.equal(hasCreatorVideoPreviewSource(video), true);
    const h = await mountStudio(null, {route: {tab: 'content'}, videos: [video]});
    try { await h.press(contentCard(h)); assertPlayerRoute(h); }
    finally { await h.unmount(); }
  }
});

test('object references do not broaden paid setup eligibility or remove its other controls', async () => {
  const video = await ownerVideo({storage_object_key: 'creator/video.mp4'});
  assert.equal(hasCreatorVideoPreviewSource(video), true);
  assert.match(paidSetup.getPaidVideoSetupUnavailableReason(video), /must be playable/);
  const existing = {...video, storagePath: 'creator/video.mp4'};
  assert.equal(paidSetup.getPaidVideoSetupUnavailableReason(existing), null);
  assert.match(paidSetup.getPaidVideoSetupUnavailableReason({...existing, vipAccessRequired: true}), /Remove VIP access/);
  assert.match(paidSetup.getPaidVideoSetupUnavailableReason({...existing, visibility: 'draft'}), /Publish this video/);
  assert.match(paidSetup.getPaidVideoSetupUnavailableReason({...existing, moderationStatus: 'hidden'}), /restricted by moderation/);
});

test('public cards preserve moderation eligibility even when an object reference exists', async t => {
  const video = await ownerVideo({owner_id: 'creator', storage_object_key: 'creator/video.mp4', moderation_status: 'hidden'});
  const h = await mountPublic(t, {route: {userId: 'creator'}, videos: [video], overrides: {isCreatorVideoPubliclyShareable}});
  const card = h.find(node => node.props.testID === 'platform-content-open-button');
  assert.ok(card);
  assert.equal(card.props.disabled, true);
  assert.equal(h.routes.length, 0);
});

test('public metadata cards need no private object reference to navigate through Player access checks', async t => {
  const video = await ownerVideo({owner_id: 'creator'});
  assert.equal(hasCreatorVideoPreviewSource(video), false);
  const h = await mountPublic(t, {route: {userId: 'creator'}, videos: [video], overrides: {isCreatorVideoPubliclyShareable}});
  await h.press(h.find(node => node.props.testID === 'platform-content-open-button'));
  assertPlayerRoute(h);
  assertNoWrites(h);
});

test('owner content read failure stays an error and Retry can recover an object-key-only source', async t => {
  const video = await ownerVideo({storage_object_key: 'creator/video.mp4'});
  let fail = true;
  const h = await mountStudio(t, {route: {tab: 'content'}, overrides: {
    readCreatorVideos: async () => { if (fail) throw new Error('modeled unavailable'); return [video]; },
  }});
  assert.match(h.text(), /Content couldn't refresh/);
  assert.equal(contentCard(h), undefined);
  fail = false;
  await h.press(h.button('Retry'));
  await h.press(contentCard(h));
  assertPlayerRoute(h);
  assertNoWrites(h);
});
