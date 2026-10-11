import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const compile = file => ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const code = {
  feed: compile('_lib/discoveryFeed.ts'), lifecycle: compile('_lib/useLiveDiscoveryFeed.ts'),
  profile: compile('_lib/useProfileLiveState.ts'), cards: compile('components/live/profile-live-now.tsx'),
};
const creator = '10000000-0000-4000-8000-000000000001', other = '20000000-0000-4000-8000-000000000002';
const owner = id => ({ userId: id, accountId: id, sessionGeneration: `session-${id}`, state: 'ACTIVE', restoreOnly: false });
const row = (extra = {}) => ({
  id: 'stage-one', item_type: 'live_room', source_type: 'live_stage_room', source_id: 'STAGE-ONE', room_id: 'STAGE-ONE',
  title: 'Actual standalone stage', owner_user_id: creator, channel_user_id: creator, visibility: 'public',
  moderation_status: 'clean', rights_status: 'creator_owned', is_publicly_discoverable: true,
  is_spectator_enabled: true, is_spectator_playback_enabled: false, live_state: 'live', ended_at: null,
  starts_at: null, access_type: 'public_free', ...extra,
});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const descendants = (node, predicate) => Array.isArray(node) ? node.flatMap(n => descendants(n, predicate))
  : !node || typeof node !== 'object' ? []
    : [...(predicate(node) ? [node] : []), ...descendants(node.props?.children, predicate)];

async function mount(t, initial = [], initialReader = null) {
  let authority = owner('viewer'), creatorId = creator, enabled = true, focused = true, tree, live;
  let rows = initial, reader = initialReader, displayedEventIds = [];
  const requests = [], routes = [], intervals = new Set(), timers = new Set(), listeners = new Set();
  const native = {
    StyleSheet: { create: x => x },
    AppState: { currentState: 'active', addEventListener: (_, f) => { listeners.add(f); return { remove: () => listeners.delete(f) }; } },
    View: props => { tree = props.children; return null; },
    ActivityIndicator: 'Spinner', Text: 'Text', TouchableOpacity: 'Button',
  };
  const evaluate = (source, imports) => {
    const context = {
      exports: {}, require: name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name]; },
      AbortController, setTimeout: f => { timers.add(f); return f; }, clearTimeout: f => timers.delete(f),
      setInterval: f => { intervals.add(f); return f; }, clearInterval: f => intervals.delete(f),
    };
    vm.runInNewContext(source, context); return context.exports;
  };
  const feed = evaluate(code.feed, { './channelAudience': {}, './friendGraph': {}, './supabase': { supabase: {} } });
  const read = async options => { requests.push(options); return { items: reader ? await reader(options) : rows, signals: {} }; };
  const lifecycle = evaluate(code.lifecycle, {
    react: React, 'react-native': native, '@react-navigation/native': { useIsFocused: () => focused },
    './session': { useSession: () => ({ authority, authorityStatus: authority ? 'active' : 'unknown' }) },
    './accountSessionAuthority': {
      getCurrentAccountSessionAuthoritySnapshot: () => authority,
      sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.sessionGeneration === b.sessionGeneration,
    },
    './discoveryFeed': { ...feed, readRankedPublicDiscoveryFeedItems: read },
    './circleSpectatorFeed': { readRankedCircleSpectatorFeedItems: () => assert.fail('Profile public lane must not broaden into Circle') },
  });
  const profile = evaluate(code.profile, { './discoveryFeed': feed, './useLiveDiscoveryFeed': lifecycle });
  const cards = evaluate(code.cards, {
    react: React, 'react-native': native, 'expo-router': { useRouter: () => ({ push: path => routes.push(path) }) },
    '../../_lib/discoveryFeed': feed,
  });
  function Host() {
    tree = [];
    live = profile.useProfileLiveState(creatorId, enabled);
    return React.createElement(cards.ProfileLiveNow, { live, displayedEventIds });
  }
  const root = createRoot(container()), render = () => React.act(async () => root.render(React.createElement(Host)));
  await render(); t.after(() => React.act(async () => root.unmount()));
  return {
    requests, routes, live: () => live,
    buttons: () => descendants(tree, x => x.props?.testID === 'profile-live-discovery-open-button'),
    retry: () => descendants(tree, x => x.props?.accessibilityLabel === 'Retry profile live sessions')[0],
    setReader: value => { reader = value; },
    async refresh(value = rows) { rows = value; await React.act(async () => { for (const f of intervals) void f(); }); },
    async creator(value) { creatorId = value; await render(); },
    async account(value) { authority = value ? owner(value) : null; await render(); },
    async enable(value) { enabled = value; await render(); },
    async focus(value) { focused = value; await render(); },
    async appState(value) { await React.act(async () => { native.AppState.currentState = value; for (const f of listeners) f(value); }); },
    async events(ids) { displayedEventIds = ids; await render(); },
    async resolve(d, value) { await React.act(async () => d.resolve(value)); },
    async press(button) { await React.act(async () => button.props.onPress()); },
  };
}

test('mounted Profile live-state and Live-tab cards update on arrival and end; screen wiring is checked separately', async t => {
  const h = await mount(t);
  assert.equal(h.live().label, 'OFF AIR'); assert.equal(h.buttons().length, 0);
  await h.refresh([row()]);
  assert.equal(h.live().label, 'LIVE NOW'); assert.equal(h.buttons().length, 1);
  assert.equal(h.requests[0].creatorUserId, creator); assert.equal(h.requests[0].surface, 'profile'); assert.equal(h.requests[0].liveOnly, true);
  await h.press(h.buttons()[0]); assert.deepEqual(h.routes, ['/spectate/stage-one']);
  await h.refresh([]); assert.equal(h.live().label, 'OFF AIR'); assert.equal(h.buttons().length, 0);
});

test('held first read is CHECKING LIVE, never a false OFF AIR; failure is unavailable and retry recovers', async t => {
  const held = deferred(), h = await mount(t, [row()], () => held.promise);
  assert.equal(h.live().ready, false); assert.equal(h.live().label, 'CHECKING LIVE');
  await h.resolve(held, [row()]); assert.equal(h.live().isLive, true);
  h.setReader(async () => { throw Error('modeled unavailable read'); }); await h.refresh();
  assert.equal(h.live().label, 'LIVE UNAVAILABLE'); assert.equal(h.live().ready, false); assert.equal(h.buttons().length, 0);
  h.setReader(null); assert.ok(h.retry()); await h.press(h.retry());
  assert.equal(h.live().label, 'LIVE NOW');
});

test('private, Circle, hidden, ended, scheduled and another creator do not make this public Profile live', async t => {
  const h = await mount(t, [
    row({ visibility: 'private' }), row({ visibility: 'circle', is_publicly_discoverable: false }),
    row({ moderation_status: 'hidden' }), row({ ended_at: '2000-01-01T00:00:00Z' }),
    row({ live_state: 'scheduled' }), row({ owner_user_id: other, channel_user_id: other }),
  ]);
  assert.equal(h.live().label, 'OFF AIR'); assert.equal(h.buttons().length, 0);
});

test('same canonical row is shown once; creator Event retains existing detailed event card without duplication', async t => {
  const event = row({ id: 'event-card', item_type: 'creator_event', event_id: 'event-one' });
  const h = await mount(t, [row(), row(), event]);
  assert.equal(h.live().items.length, 2); assert.equal(h.buttons().length, 2);
  await h.events(['event-one']); assert.equal(h.buttons().length, 1);
  assert.equal(h.live().label, 'LIVE NOW'); assert.equal(h.live().items.length, 2);
  await h.events([]); await h.press(h.buttons().find(x => x.key === 'event-card'));
  assert.deepEqual(h.routes, ['/event/event-one']);
});

test('approved public watch-party uses its existing spectator destination', async t => {
  const h = await mount(t, [row({ id: 'party-one', item_type: 'watch_party', source_type: 'watch_party_room', is_spectator_playback_enabled: true })]);
  await h.press(h.buttons()[0]); assert.deepEqual(h.routes, ['/spectate/party-one']);
});

for (const transition of ['creator', 'account', 'focus', 'enable', 'background']) {
  test(`held old read cannot restore a live claim after ${transition}`, async t => {
    const h = await mount(t, [row()]), held = deferred();
    h.setReader(() => held.promise); await h.refresh();
    h.setReader(null);
    if (transition === 'creator') await h.creator(other);
    if (transition === 'account') await h.account(null);
    if (transition === 'focus') await h.focus(false);
    if (transition === 'enable') await h.enable(false);
    if (transition === 'background') await h.appState('background');
    await h.resolve(held, [row({ id: 'late-old-room' })]);
    assert.equal(h.live().isLive, false); assert.equal(h.buttons().length, 0);
  });
}

test('focus and foreground restore fresh rooms; disabled privacy gate never issues a reader call', async t => {
  const h = await mount(t, [row()]);
  await h.focus(false); const blurred = h.requests.length; await h.refresh([]); assert.equal(h.requests.length, blurred);
  assert.equal(h.live().isLive, false);
  await h.focus(true); assert.equal(h.live().label, 'OFF AIR');
  await h.appState('background'); const background = h.requests.length; await h.refresh([row()]); assert.equal(h.requests.length, background);
  await h.appState('active'); assert.equal(h.live().label, 'LIVE NOW');
  await h.enable(false); const denied = h.requests.length; await h.refresh();
  assert.equal(h.requests.length, denied); assert.equal(h.live().label, 'PROFILE'); assert.equal(h.buttons().length, 0);
});

test('public screen, own-profile wrapper and sharing use current creator identity rather than live query claims', () => {
  const screen = fs.readFileSync(new URL('../app/profile/[userId].tsx', import.meta.url), 'utf8');
  const own = fs.readFileSync(new URL('../app/(tabs)/profile.tsx', import.meta.url), 'utf8');
  assert.match(screen, /const profileLive = useProfileLiveState\(userId, !!userId && profilePrivacyReady && canViewFullProfile && !isOfficialProfile\)/);
  assert.match(screen, /const liveStateLabel = profileLive.label/);
  assert.match(screen, /<ProfileLiveNow live=\{profileLive\} displayedEventIds=\{currentPublicEvents.map/);
  assert.doesNotMatch(screen, /profile\.isLive/);
  assert.match(screen, /if \(linkedLiveRoute\)/, 'legacy linked-room routing remains separate from live status');
  assert.match(screen, /buildProfileDeepLink\(userId\)/);
  assert.match(own, /params: \{ userId, self: "1" \}/);
});
