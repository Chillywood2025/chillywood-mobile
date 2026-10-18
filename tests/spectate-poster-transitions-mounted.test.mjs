import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
const file = 'app/spectate-live/[itemId].tsx';
const source = process.env.SPECTATE_POSTER_SOURCE_REF
  ? execFileSync('git', ['show', `${process.env.SPECTATE_POSTER_SOURCE_REF}:${file}`], { encoding: 'utf8' })
  : fs.readFileSync(file, 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml',
  nodeName: 'DIV', nodeType: 1, ownerDocument: document, parentNode: null, tagName: 'DIV' });
document.documentElement = container();
globalThis.document = document;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const owner = (id = 'viewer-a', generation = 'session-a') => ({ userId: id, accountId: id, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const row = (changes = {}) => ({ id: 'broadcast-a', item_type: 'live_room', source_type: 'live_broadcast', source_id: 'source-a', room_id: 'room-a',
  owner_user_id: 'creator-a', channel_user_id: 'creator-a', title: 'Current broadcast', subtitle: '', live_state: 'live', ended_at: null,
  visibility: 'public', access_type: 'public_free', rights_status: 'creator_owned', moderation_status: 'clean',
  is_publicly_discoverable: true, is_spectator_enabled: true, is_spectator_playback_enabled: true,
  thumbnail_url: 'https://fixture.invalid/poster-a.jpg', ...changes });
const available = (url = 'https://fixture.invalid/records/a/index.m3u8') => ({ state: 'available', title: 'Live playback', canRenderPlayback: true, playbackUrl: url });
const unavailable = { state: 'unavailable', title: 'This broadcast is unavailable.', canRenderPlayback: false, playbackUrl: null };

async function mount(t, options = {}) {
  let item = options.item ?? row(), itemId = item.id, lane = options.lane ?? 'public';
  let authority = owner(), authorityStatus = 'active', playbackRead = options.playbackRead ?? (async () => available());
  let feedRead = async () => item, focused = true, disposed = false, foreground, listProps;
  const ranked = options.ranked ?? [];
  const nodes = new Map(), mounts = new Map(), focusEntries = new Set(), intervals = new Set(), timers = new Map(), reads = [], progress = [];
  const router = { replace: noop, back: noop, push: noop };
  const native = { StyleSheet: { create: value => value, absoluteFill: { position: 'absolute' }, absoluteFillObject: { position: 'absolute' } },
    Alert: { alert: noop }, Share: { share: async () => {} }, useWindowDimensions: () => ({ height: 800 }) };
  const component = (name, renderChildren = false) => function Native(props) {
    const id = React.useId();
    nodes.set(id, { id, name, props });
    React.useLayoutEffect(() => {
      mounts.set(name, (mounts.get(name) ?? 0) + 1);
      return () => nodes.delete(id);
    }, [id]);
    return renderChildren ? props.children : null;
  };
  for (const name of ['ActivityIndicator', 'Image', 'Text']) native[name] = component(name);
  for (const name of ['View', 'Pressable', 'TouchableOpacity']) native[name] = component(name, true);
  native.Modal = ({ visible, children }) => visible ? children : null;
  native.FlatList = props => {
    listProps = props;
    return React.createElement(React.Fragment, null, props.data.map((entry, index) =>
      React.createElement(React.Fragment, { key: props.keyExtractor(entry) }, props.renderItem({ item: entry, index }))));
  };
  const Video = component('Video');
  const imports = {
    react: React, 'react-native': native, 'expo-av': { ResizeMode: { CONTAIN: 'contain' }, Video },
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({ itemId, lane }),
      useFocusEffect(callback) { React.useEffect(() => {
        const entry = { callback, cleanup: focused ? callback() : undefined };
        focusEntries.add(entry);
        return () => { entry.cleanup?.(); focusEntries.delete(entry); };
      }, [callback]); } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../_lib/discoveryFeed': { getDiscoveryAccessLabel: () => 'Public', readPublicDiscoveryFeedItem: () => feedRead(),
      readRankedPublicDiscoveryFeedItems: async () => ({ items: ranked }) },
    '../../_lib/circleSpectatorFeed': { readCircleSpectatorFeedItem: () => feedRead(), readRankedCircleSpectatorFeedItems: async () => ({ items: ranked }) },
    '../../_lib/spectatorAccess': { resolveSpectatorAccess: value => ({ canShowMetadata: value.moderation_status === 'clean' && value.visibility !== 'private' }) },
    '../../_lib/spectatorPlayback': { resolveSpectatorPlaybackState: () => unavailable,
      readSpectatorPlaybackReadout: (value, decision) => { reads.push(value); return playbackRead(value, decision); } },
    '../../_lib/spectatorChildRooms': {}, '../../_lib/moderation': {},
    '../../_lib/actionSingleFlight.mjs': { createActionSingleFlightLatch: () => ({ release: noop }) },
    '../../_lib/performancePolicy': { SPECTATOR_LIFECYCLE_REFRESH_MS: 15000 },
    '../../_lib/session': { useSession: () => ({ authority, authorityStatus, isSignedIn: !!authority }) },
    '../../_lib/accountSessionAuthority': { sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId
      && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly },
    '../../_lib/useNotificationViewTracking': { useNotificationViewTracking: () => status => progress.push(status) },
    '../../_lib/notificationViewProgress.mjs': { notificationPlaybackRecordId: () => 'record-a' },
    '../../_lib/supabase': { SUPABASE_URL: 'https://fixture.invalid' },
    '../../components/safety/report-sheet': { ReportSheet: () => null },
    '../../hooks/useRefreshOnForeground': { useRefreshOnForeground: callback => { foreground = callback; } },
  };
  const context = { exports: {}, require: name => { assert.ok(name in imports, `Unexpected import ${name}`); return imports[name]; },
    setTimeout: (callback, delay) => { const id = {}; timers.set(id, { callback, delay }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: callback => { intervals.add(callback); return callback; }, clearInterval: callback => intervals.delete(callback) };
  vm.runInNewContext(code, context, { filename: file });
  const root = createRoot(container());
  const render = () => React.act(async () => root.render(React.createElement(context.exports.default)));
  await render();
  const unmount = async () => { if (!disposed) { disposed = true; await React.act(async () => root.unmount()); } };
  t.after(unmount);
  const get = name => [...nodes.values()].filter(node => node.name === name);
  return { get, reads, mounts, progress, unmount,
    texts: () => get('Text').map(node => node.props.children).filter(value => typeof value === 'string'),
    setPlaybackRead: reader => { playbackRead = reader; }, setFeedRead: reader => { feedRead = reader; },
    async refresh(value = { ...item }) { item = value; await React.act(async () => foreground()); },
    async swipe(index) { await React.act(async () => listProps.onMomentumScrollEnd({ nativeEvent: { contentOffset: { y: 800 * index } } })); },
    async route(value, nextLane = lane) { item = value; itemId = value.id; lane = nextLane; await render(); },
    async account(value, status = 'active') { authority = value; authorityStatus = status; await render(); },
    async focus(value) { focused = value; await React.act(async () => { for (const entry of focusEntries) {
      entry.cleanup?.(); entry.cleanup = focused ? entry.callback() : undefined;
    } }); },
    async resolve(d, value) { await React.act(async () => d.resolve(value)); },
    async reject(d) { await React.act(async () => d.reject(Error('modeled unavailable transport'))); },
    async timeout(delay) { await React.act(async () => { for (const [id, timer] of [...timers]) {
      if (timer.delay === delay) { timers.delete(id); timer.callback(); }
    } }); },
    timerCount: delay => delay === undefined ? timers.size : [...timers.values()].filter(timer => timer.delay === delay).length,
    async event(node, name, value) { await React.act(async () => { assert.equal(typeof node.props[name], 'function', `Native ${name} handler exists`); node.props[name](value); }); },
    async retry() { const button = get('TouchableOpacity').find(node => node.props.accessibilityLabel === 'Retry live playback');
      assert.ok(button, 'An accessible retry action is present'); await React.act(async () => button.props.onPress()); },
  };
}

const imageUrls = h => h.get('Image').map(node => node.props.source.uri);
const ready = async h => { await h.event(h.get('Video')[0], 'onReadyForDisplay'); };

test('mounted production route retains its same poster through delayed URL resolution and delayed first frame', async t => {
  const d = deferred(), h = await mount(t, { playbackRead: () => d.promise });
  const posterId = h.get('Image')[0].id;
  assert.deepEqual(imageUrls(h), ['https://fixture.invalid/poster-a.jpg']);
  assert.equal(h.get('Video').length, 0);
  await h.resolve(d, available());
  assert.equal(h.get('Video').length, 1);
  assert.equal(h.get('Image')[0]?.id, posterId, 'URL readiness must not remove or remount the loaded poster');
  assert.ok(h.texts().includes('Opening live…'));
  assert.equal(h.get('Video')[0].props.shouldPlay, true);
  assert.equal(h.get('Video')[0].props.resizeMode, 'contain');
  assert.equal(h.get('Video')[0].props.useNativeControls, false);
  await ready(h);
  assert.equal(h.get('Image').length, 0);
  assert.equal(h.texts().includes('Opening live…'), false);
});

test('warm focus and metadata refetch retain the displayed player without replaying a loading poster', async t => {
  const h = await mount(t); await ready(h);
  const videoId = h.get('Video')[0].id, mountCount = h.mounts.get('Video'), d = deferred();
  h.setPlaybackRead(() => d.promise);
  await h.refresh();
  assert.equal(h.get('Video')[0].id, videoId);
  assert.equal(h.get('Image').length, 0);
  assert.equal(h.texts().includes('Opening live…'), false);
  await h.resolve(d, available());
  await h.focus(false); await h.focus(true);
  assert.equal(h.get('Video')[0].id, videoId);
  assert.equal(h.mounts.get('Video'), mountCount);
  assert.equal(h.get('Image').length, 0);
});

test('replacement URL needs its own first frame; late prior native events cannot hide the poster or fail its replacement', async t => {
  const h = await mount(t); await ready(h);
  const oldVideo = h.get('Video')[0];
  h.setPlaybackRead(async () => available('https://fixture.invalid/records/b/index.m3u8'));
  await h.refresh();
  const nextVideo = h.get('Video')[0];
  assert.notEqual(nextVideo.id, oldVideo.id);
  assert.equal(h.get('Image').length, 1);
  await h.event(oldVideo, 'onReadyForDisplay');
  await h.event(oldVideo, 'onError', 'late prior error');
  await h.event(oldVideo, 'onPlaybackStatusUpdate', { isLoaded: true, positionMillis: 999 });
  assert.equal(h.progress.length, 0);
  assert.equal(h.get('Image').length, 1);
  assert.equal(h.get('Video').length, 1);
  await ready(h); assert.equal(h.get('Image').length, 0);
});

test('out-of-order playback resolution cannot restore a stale URL over a later refetch', async t => {
  const h = await mount(t), stale = deferred(), latest = deferred();
  h.setPlaybackRead(() => stale.promise); await h.refresh();
  h.setPlaybackRead(() => latest.promise); await h.refresh();
  await h.resolve(latest, available('https://fixture.invalid/records/new/index.m3u8'));
  await h.resolve(stale, available('https://fixture.invalid/records/stale/index.m3u8'));
  assert.equal(h.get('Video')[0].props.source.uri, 'https://fixture.invalid/records/new/index.m3u8');
});

test('authoritative playback access denial removes a previously allowed Circle poster and video', async t => {
  const h = await mount(t, { item: row({ visibility: 'circle', access_type: 'circle' }), lane: 'circle' });
  await ready(h);
  h.setPlaybackRead(async () => ({ ...unavailable, state: 'blocked_private', title: 'Spectator playback is private.' }));
  await h.refresh();
  assert.equal(h.get('Video').length, 0);
  assert.equal(h.get('Image').length, 0);
  assert.ok(h.texts().includes('Spectator playback is private.'));
  const retry = deferred(); h.setPlaybackRead(() => retry.promise); await h.retry();
  assert.equal(h.get('Image').length, 0, 'Retry cannot restore a poster after access was denied');
  await h.reject(retry);
  assert.equal(h.get('Image').length, 0);
  h.setPlaybackRead(async () => available()); await h.retry();
  assert.equal(h.get('Image').length, 1, 'A fresh allowed response may restore the poster');
});

for (const [name, change] of [
  ['same-id source replacement', { source_id: 'source-b', thumbnail_url: 'https://fixture.invalid/poster-b.jpg' }],
  ['access restriction', { moderation_status: 'hidden', thumbnail_url: 'https://fixture.invalid/restricted.jpg' }],
]) test(`${name} discards prior player readiness and in-flight callbacks`, async t => {
  const h = await mount(t); await ready(h);
  const oldVideo = h.get('Video')[0], d = deferred();
  h.setPlaybackRead(() => d.promise); await h.refresh(row(change));
  assert.equal(h.get('Video').length, 0);
  await h.event(oldVideo, 'onReadyForDisplay');
  await h.event(oldVideo, 'onError', 'stale');
  if (name === 'access restriction') assert.equal(h.get('Image').length, 0);
  else assert.deepEqual(imageUrls(h), ['https://fixture.invalid/poster-b.jpg']);
  await h.resolve(d, unavailable); assert.equal(h.get('Video').length, 0);
  assert.ok(h.texts().includes(unavailable.title));
});

for (const change of ['account', 'session', 'sign-out', 'route', 'lane']) test(`${change} clears retained Circle images while the new feed is delayed`, async t => {
  const circle = row({ visibility: 'circle', access_type: 'circle' });
  const h = await mount(t, { item: circle, lane: 'circle' });
  const oldVideo = h.get('Video')[0], feed = deferred();
  h.setFeedRead(() => feed.promise);
  if (change === 'account') await h.account(owner('viewer-b'));
  else if (change === 'session') await h.account(owner('viewer-a', 'session-b'));
  else if (change === 'sign-out') await h.account(null, 'anonymous');
  else if (change === 'route') await h.route(row({ ...circle, id: 'broadcast-b' }));
  else await h.route(row(), 'public');
  assert.equal(h.get('Image').length, 0);
  assert.equal(h.get('Video').length, 0);
  await h.event(oldVideo, 'onReadyForDisplay');
  await h.event(oldVideo, 'onError', 'stale');
  await h.resolve(feed, null);
  assert.equal(h.get('Image').length, 0);
  assert.equal(h.get('Video').length, 0);
});

for (const nativeError of ['onError', 'onPlaybackStatusUpdate']) test(`${nativeError} shows genuine failure and retry obtains a fresh URL before waiting for its first frame`, async t => {
  const h = await mount(t); await ready(h);
  const failedVideo = h.get('Video')[0];
  await h.event(failedVideo, nativeError, nativeError === 'onError' ? 'expired source' : { isLoaded: false, error: 'expired source' });
  assert.equal(h.get('Video').length, 0);
  assert.ok(h.texts().includes('Live playback couldn’t load.'));
  assert.equal(h.texts().includes('Opening live…'), false);
  const d = deferred(); h.setPlaybackRead(() => d.promise); await h.retry();
  await h.event(failedVideo, 'onReadyForDisplay');
  assert.equal(h.get('Image').length, 1);
  assert.equal(h.get('Video').length, 0);
  await h.resolve(d, available('https://fixture.invalid/records/retry/index.m3u8'));
  assert.equal(h.get('Image').length, 1);
  await ready(h); assert.equal(h.get('Image').length, 0);
});

test('transport failure is distinct from loading/unavailable; retry revalidates and recovers', async t => {
  const d = deferred(), h = await mount(t, { playbackRead: () => d.promise });
  await h.reject(d);
  assert.ok(h.texts().includes('Live playback couldn’t load.'));
  assert.equal(h.texts().includes('Opening live…'), false);
  h.setPlaybackRead(async () => available()); await h.retry(); await ready(h);
  assert.equal(h.texts().includes('Live playback couldn’t load.'), false);
});

test('a resolver timeout exits loading and its late URL cannot override a retry', async t => {
  const expired = deferred(), h = await mount(t, { playbackRead: () => expired.promise });
  await h.timeout(12_000);
  assert.ok(h.texts().includes('Live playback couldn’t load.'));
  assert.equal(h.texts().includes('Opening live…'), false);
  h.setPlaybackRead(async () => available('https://fixture.invalid/records/retry/index.m3u8'));
  await h.retry();
  await h.resolve(expired, available('https://fixture.invalid/records/expired/index.m3u8'));
  assert.equal(h.get('Video')[0].props.source.uri, 'https://fixture.invalid/records/retry/index.m3u8');
});

test('a missing native first frame times out, ignores late readiness, and can retry the same URL', async t => {
  const h = await mount(t), video = h.get('Video')[0];
  await h.timeout(20_000);
  assert.equal(h.get('Video').length, 0);
  assert.ok(h.texts().includes('Live playback couldn’t load.'));
  await h.event(video, 'onReadyForDisplay');
  assert.equal(h.get('Image').length, 1);
  await h.retry(); await ready(h);
  assert.equal(h.get('Image').length, 0);
  assert.equal(h.texts().includes('Live playback couldn’t load.'), false);
});

test('inactive preloaded pages wait for activation before starting a native first-frame deadline', async t => {
  const h = await mount(t, { ranked: [row({ id: 'broadcast-b', source_id: 'source-b', thumbnail_url: 'https://fixture.invalid/poster-b.jpg' })],
    playbackRead: async item => available(`https://fixture.invalid/records/${item.id}/index.m3u8`) });
  const first = h.get('Video').find(video => video.props.shouldPlay), preloaded = h.get('Video').find(video => !video.props.shouldPlay);
  assert.ok(preloaded, 'A paused offscreen page is preloaded');
  await h.event(first, 'onReadyForDisplay');
  assert.equal(h.timerCount(20_000), 0, 'Paused native video has no first-frame deadline');
  await h.timeout(20_000);
  assert.equal(h.get('Video').some(video => video.id === preloaded.id), true);
  assert.equal(h.texts().includes('Live playback couldn’t load.'), false);
  await h.swipe(1);
  assert.equal(h.get('Video').find(video => video.id === preloaded.id).props.shouldPlay, true);
  assert.equal(h.timerCount(20_000), 1, 'Activation starts the first-frame deadline');
  await h.swipe(0);
  assert.equal(h.timerCount(20_000), 0, 'Leaving the page cancels its deadline');
  await h.timeout(20_000);
  assert.equal(h.get('Video').some(video => video.id === preloaded.id), true);
  await h.swipe(1); await h.timeout(20_000);
  assert.equal(h.get('Video').some(video => video.id === preloaded.id), false);
  assert.ok(h.texts().includes('Live playback couldn’t load.'));
});

test('a cleared unavailable feed shows loading again during a delayed focus retry', async t => {
  const h = await mount(t); await ready(h);
  h.setFeedRead(async () => null); await h.refresh();
  assert.equal(h.get('Video').length, 0);
  assert.equal(h.get('Image').length, 0);
  assert.ok(h.texts().includes('This live isn’t available.'));
  const feed = deferred(); h.setFeedRead(() => feed.promise);
  await h.focus(false); await h.focus(true);
  assert.ok(h.texts().includes('Opening live…'));
  assert.equal(h.texts().includes('This live isn’t available.'), false);
  await h.resolve(feed, row());
  assert.equal(h.get('Video').length, 1);
});

test('a hung warm refetch preserves the already displayed player and retires the late response', async t => {
  const h = await mount(t); await ready(h);
  const videoId = h.get('Video')[0].id, expired = deferred();
  h.setPlaybackRead(() => expired.promise); await h.refresh(); await h.timeout(12_000);
  await h.resolve(expired, available('https://fixture.invalid/records/stale/index.m3u8'));
  assert.equal(h.get('Video')[0].id, videoId);
  assert.equal(h.get('Image').length, 0);
  assert.equal(h.texts().includes('Opening live…'), false);
});

test('missing and failed posters retain native fallback and allow playback/retry recovery', async t => {
  const h = await mount(t), oldPoster = h.get('Image')[0];
  await h.event(oldPoster, 'onError', {});
  assert.equal(h.get('Image').length, 0);
  assert.ok(h.texts().includes('C'));
  await h.event(h.get('Video')[0], 'onError', 'retry');
  await h.retry(); assert.equal(h.get('Image').length, 1);
  await h.event(oldPoster, 'onError', {});
  assert.equal(h.get('Image').length, 1, 'late old poster error must not fail the retry');
  await ready(h); assert.equal(h.get('Image').length, 0);
  await h.refresh(row({ source_id: 'source-without-poster', thumbnail_url: null }));
  assert.equal(h.get('Image').length, 0);
  assert.ok(h.texts().includes('C'));
  await ready(h); assert.equal(h.texts().includes('C'), false);
});

test('unmounted native callbacks cannot report playback progress or mutate retained state', async t => {
  const h = await mount(t), video = h.get('Video')[0]; await h.unmount();
  await h.event(video, 'onReadyForDisplay'); await h.event(video, 'onError', 'late error');
  await h.event(video, 'onPlaybackStatusUpdate', { isLoaded: true, positionMillis: 2000 });
  assert.equal(h.progress.length, 0);
  assert.equal(h.get('Video').length, 0);
  assert.equal(h.timerCount(), 0);
});
