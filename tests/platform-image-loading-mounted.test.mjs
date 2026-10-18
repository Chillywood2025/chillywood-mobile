import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, deferred, React, video } from './platform-public-mounted-harness.mjs';

const asset = (id = 'avatar', signedUrl = `https://images.example/${id}?signature=first`) => ({
  id, ownerUserId: 'creator', assetType: 'avatar', assetState: 'published',
  storageProvider: 'supabase', storageBucket: 'branding', storagePath: `creator/${id}.jpg`,
  storageObjectKey: `creator/${id}.jpg`, updatedAt: '2026-10-18T10:00:00Z',
  moderationStatus: 'clean', scanStatus: 'clean', deletedAt: null, signedUrl,
});
const branding = (avatar = asset()) => ({ profile: {}, avatar });
const images = h => h.all().filter(n => n.type === 'Image' && n.props.source?.uri);
const hasImage = (h, uri) => images(h).some(n => n.props.source.uri === uri);
const activeSession = (id = 'owner', generation = 'first') => ({
  user: { id, email: `${id}@example.test` }, isSignedIn: true, isLoading: false,
  authority: { userId: id, accountId: id, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false },
  authorityStatus: 'active',
});

test('same-scope focus keeps mounted Platform artwork visible during delayed access and branding reads', async t => {
  const first = branding();
  const h = await mount(t, { route: { userId: 'creator' }, overrides: { readPublicPlatformBranding: async () => first } });
  assert.ok(hasImage(h, first.avatar.signedUrl));
  const read = deferred();
  h.mocks.resolvePlatformVisibilityAccess = () => read.promise;
  await h.focus(false);
  await h.focus(true);
  assert.ok(hasImage(h, first.avatar.signedUrl), 'warm image stays mounted while access revalidates');
  assert.ok(h.find(n => n.props.testID === 'platform-refreshing-state'));
  const next = deferred();
  h.mocks.readPublicPlatformBranding = () => next.promise;
  await h.resolve(read, { allowed: true, visibility: 'public', reason: 'public_allowed' });
  assert.ok(hasImage(h, first.avatar.signedUrl), 'image stays mounted until complete replacement data');
  await h.resolve(next, branding(asset('replacement')));
  assert.equal(hasImage(h, first.avatar.signedUrl), false);
  assert.ok(hasImage(h, asset('replacement').signedUrl));
});

test('current access denial removes previously displayed Platform images during a warm refetch', async t => {
  const h = await mount(t, { route: { userId: 'creator' }, overrides: { readPublicPlatformBranding: async () => branding() } });
  const read = deferred(); h.mocks.resolvePlatformVisibilityAccess = () => read.promise;
  await h.focus(false); await h.focus(true);
  await h.resolve(read, { allowed: false, reason: 'private', visibility: 'private' });
  assert.equal(images(h).length, 0);
  assert.ok(h.find(n => n.props.testID === 'platform-access-denied-state'));
});

test('audience blocking and fresh missing artwork remove an old image rather than masking the state', async t => {
  const h = await mount(t, { route: { userId: 'creator' }, overrides: { readPublicPlatformBranding: async () => branding() } });
  h.mocks.readPublicPlatformBranding = async () => branding(null);
  await h.focus(false); await h.focus(true);
  assert.equal(images(h).length, 0);
  h.mocks.readPublicChannelAudienceState = async () => ({ isViewerBlocked: true });
  await h.focus(false); await h.focus(true);
  assert.equal(images(h).length, 0);
  assert.ok(h.find(n => n.props.testID === 'platform-access-denied-state'));
});

test('failed refresh removes old media, reports the error, and retry recovers fresh artwork', async t => {
  const h = await mount(t, { route: { userId: 'creator' }, overrides: { readPublicPlatformBranding: async () => branding() } });
  h.mocks.readPublicPlatformBranding = async () => { throw new Error('offline'); };
  await h.focus(false); await h.focus(true);
  assert.equal(images(h).length, 0);
  assert.match(h.text(), /could not load|Unable to load/i);
  h.mocks.readPublicPlatformBranding = async () => branding(asset('recovered'));
  await h.press(h.button('Retry'));
  assert.ok(hasImage(h, asset('recovered').signedUrl));
});

test('route changes hide prior artwork immediately and discard a late former-route read', async t => {
  const h = await mount(t, { route: { userId: 'creator' }, overrides: { readPublicPlatformBranding: async () => branding() } });
  const late = deferred(); h.mocks.readPublicPlatformBranding = () => late.promise;
  await h.focus(false); await h.focus(true);
  const current = deferred(); h.mocks.readPublicPlatformBranding = () => current.promise;
  await h.route({ userId: 'other-creator' });
  assert.equal(images(h).length, 0);
  await h.resolve(late, branding(asset('stale')));
  assert.equal(images(h).length, 0);
  await h.resolve(current, branding(asset('current')));
  assert.ok(hasImage(h, asset('current').signedUrl));
  assert.equal(hasImage(h, asset('stale').signedUrl), false);
});

for (const [label, session] of [
  ['viewer', activeSession('other')],
  ['session generation', activeSession('owner', 'renewed')],
  ['authority restriction', { ...activeSession(), authorityStatus: 'restricted' }],
  ...['unknown', 'recovery_only', 'restore_only', 'signed_out'].map(authorityStatus => [authorityStatus, { ...activeSession(), authorityStatus }]),
  ['authority user', { ...activeSession(), authority: { ...activeSession().authority, userId: 'different-user' } }],
  ['authority account', { ...activeSession(), authority: { ...activeSession().authority, accountId: 'different-account' } }],
  ['authority state', { ...activeSession(), authority: { ...activeSession().authority, state: 'RESTRICTED' } }],
  ['restore-only authority', { ...activeSession(), authority: { ...activeSession().authority, restoreOnly: true } }],
  ['session loading', { ...activeSession(), isLoading: true }],
]) test(`${label} change hides prior Platform artwork while the next scope is unresolved`, async t => {
  const h = await mount(t, { route: { userId: 'creator' }, overrides: { readPublicPlatformBranding: async () => branding() } });
  const read = deferred(); h.mocks.resolvePlatformVisibilityAccess = () => read.promise;
  await h.account(session);
  assert.equal(images(h).length, 0);
});

test('preview mode changes cannot retain owner draft artwork in the public presentation', async t => {
  const h = await mount(t, { route: { userId: 'owner', preview: 'brand-draft' }, overrides: { readPlatformBrandStudio: async () => branding(asset('draft')) } });
  assert.ok(hasImage(h, asset('draft').signedUrl));
  const read = deferred(); h.mocks.readPublicPlatformBranding = () => read.promise;
  await h.route({ preview: 'public' });
  assert.equal(images(h).length, 0);
  await h.resolve(read, branding(null));
  assert.equal(images(h).length, 0);
});

test('restoring the same session after unresolved loading requires a fresh complete presentation', async t => {
  const h = await mount(t, { route: { userId: 'creator' }, overrides: { readPublicPlatformBranding: async () => branding() } });
  await h.account({ ...activeSession(), isLoading: true });
  const read = deferred(); h.mocks.resolvePlatformVisibilityAccess = () => read.promise;
  await h.account(activeSession());
  assert.equal(images(h).length, 0);
  assert.ok(h.find(n => n.props.testID === 'platform-loading-state'));
});

test('branding signed URL renewal has exact asset continuity and retry obtains a new URL', async t => {
  const first = asset();
  const h = await mount(t, { route: { userId: 'creator' }, overrides: { readPublicPlatformBranding: async () => branding(first) } });
  const before = images(h).find(n => n.props.source.uri === first.signedUrl);
  assert.ok(before.props.identityKey, 'caller supplies a versioned identity for a signed asset');
  const renewed = { ...first, signedUrl: 'https://images.example/avatar?signature=renewed' };
  h.mocks.readPublicPlatformBranding = async () => branding(renewed);
  await h.focus(false); await h.focus(true);
  const after = images(h).find(n => n.props.source.uri === renewed.signedUrl);
  assert.equal(after.props.identityKey, before.props.identityKey);
  assert.equal(after.props.source.uri, renewed.signedUrl, 'new transport URL is used rather than stale URL caching');
  const retry = deferred(); h.mocks.readPublicPlatformBranding = () => retry.promise;
  await React.act(async () => after.props.onRetry());
  await h.resolve(retry, branding({ ...renewed, signedUrl: 'https://images.example/avatar?signature=retried' }));
  assert.ok(images(h).some(n => n.props.source.uri.endsWith('signature=retried')));
  assert.equal(images(h)[0].props.retryKey, after.props.retryKey + 1);
  h.mocks.readPublicPlatformBranding = async () => branding({ ...renewed, updatedAt: '2026-10-18T11:00:00Z' });
  await h.focus(false); await h.focus(true);
  assert.notEqual(images(h)[0].props.identityKey, before.props.identityKey, 'replacement version cannot retain previous bitmap');
});

test('creator thumbnail identities follow exact object/version and clear continuity on visibility changes', async t => {
  const first = { ...video('thumb'), storageProvider: 'supabase', storageBucket: 'creator-video', thumbStoragePath: 'creator/thumb.jpg', thumbnailUrl: 'https://images.example/thumb?signature=one' };
  const h = await mount(t, { route: { userId: 'creator' }, videos: [first] });
  const before = images(h).find(n => n.props.source.uri === first.thumbnailUrl);
  assert.ok(before.props.identityKey);
  const renewed = { ...first, thumbnailUrl: 'https://images.example/thumb?signature=two' };
  h.mocks.readCreatorVideos = async () => [renewed];
  await h.focus(false); await h.focus(true);
  const after = images(h).find(n => n.props.source.uri === renewed.thumbnailUrl);
  assert.equal(after.props.identityKey, before.props.identityKey);
  h.mocks.readCreatorVideos = async () => [{ ...renewed, visibility: 'circle' }];
  await h.focus(false); await h.focus(true);
  assert.notEqual(images(h)[0].props.identityKey, before.props.identityKey);
});
