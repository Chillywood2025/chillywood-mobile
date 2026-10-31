import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createActionSingleFlightLatch } from '../_lib/actionSingleFlight.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const walk = (node, predicate) => Array.isArray(node) ? node.flatMap(value => walk(value, predicate)) : node && typeof node === 'object' ? [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)] : [];
const text = node => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' ? node : '';
const bucketExports = {};
vm.runInNewContext(compile('_lib/liveTabDiscoveryBuckets.ts'), { exports: bucketExports });

async function mount(t, upcoming, discoveryItems = []) {
  let tree;
  let discoveryOptions;
  let focusCallback, failNavigation = false;
  const routes = [];
  const native = { StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390, height: 844 }), Alert: { alert: noop } };
  for (const name of ['ActivityIndicator', 'ImageBackground', 'Pressable', 'RefreshControl', 'ScrollView', 'Text', 'TouchableOpacity', 'View']) native[name] = name;
  const imports = {
    react: React,
    'react-native': native,
    'expo-router': { router: { push: route => { if (failNavigation) throw Error('Navigation unavailable'); routes.push(route); } }, useFocusEffect: callback => { focusCallback = callback; React.useEffect(callback, [callback]); } },
    '@expo/vector-icons/MaterialIcons': 'Icon',
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@react-navigation/bottom-tabs': { useBottomTabBarHeight: () => 60 },
    '../../components/ui/chillywood-visual-system': { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: 'Fill' },
    '../../_lib/actionSingleFlight.mjs': { createActionSingleFlightLatch },
    '../../_lib/customerExperiencePresentation': { resolveLiveHubCardWidth: () => 300, resolveMainTabBrandRevealHeight: () => 100 },
    '../../_lib/discoveryFeed': { getDiscoveryAccessLabel: () => "Chi'lly Circle", getDiscoveryItemActionLabel: () => 'Live', getDiscoveryItemDestination: item => `/spectate/${item.id}` },
    '../../_lib/useLiveDiscoveryFeed': { useLiveDiscoveryFeed: options => { discoveryOptions = options; return { items: discoveryItems, loading: false, error: null, reload: async () => {}, pendingItemCount: 0 }; } },
    '../../_lib/useLiveUpcomingEvents': { useLiveUpcomingEvents: () => ({ loading: false, error: null, reload: async () => {}, items: [], ...upcoming }) },
    '../../components/live/new-live-streams-button': { NewLiveStreamsButton: 'NewLiveStreamsButton' },
    '../../_lib/premiumWatchPartyAccess': { requireLiveFirstPremium: async () => ({ allowed: true }) },
    '../../_lib/liveTabDiscoveryBuckets': bucketExports,
    '../../components/monetization/access-sheet': { AccessSheet: 'AccessSheet' },
    '../../components/navigation/main-tab-top-bar': { MainTabTopBar: 'TopBar' },
    '../../assets/images/chillywood-branded-background.png': 1,
  };
  const exports = {};
  vm.runInNewContext(compile('app/(tabs)/live.tsx'), { exports, Intl, require: name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name]; } });
  function Host() { tree = exports.default(); return null; }
  const root = createRoot(container());
  await React.act(async () => root.render(React.createElement(Host)));
  t.after(() => React.act(async () => root.unmount()));
  return { tree: () => tree, routes, discoveryOptions: () => discoveryOptions,
    failNavigation: value => { failNavigation = value; },
    refocus: () => React.act(async () => focusCallback()),
  };
}

test('Live offers two matching primary actions, preserving separate Live and Party routes without Explore', async t => {
  const h = await mount(t, {});
  const button = id => walk(h.tree(), node => node.props?.testID === id)[0];
  const live = button('live-tab-open-live-button'), party = button('live-tab-start-watch-party-button');
  assert.equal(party.props.accessibilityLabel, 'Start Watch Party Live');
  assert.deepEqual(party.props.style[0], live.props.style[0]);
  assert.equal(walk(party, node => node.type === 'Fill').length, 1);
  assert.equal(walk(h.tree(), node => node.type === 'Pressable' && text(node) === 'Explore').length, 0);
  assert.equal(button('live-tab-enter-code-button'), undefined);
  await React.act(async () => { party.props.onPress(); party.props.onPress(); });
  assert.equal(h.routes.length, 1, 'same-frame repeated Party taps push once');
  assert.equal(h.routes[0].pathname, '/watch-party');
  assert.equal(h.routes[0].params.source, 'bottom-live-tab');
  assert.equal(h.routes[0].params.mode, undefined, 'Party path must never request Live mode');
  assert.equal(button('live-tab-start-watch-party-button').props.disabled, true);
  await React.act(async () => live.props.onPress());
  assert.equal(h.routes.length, 1, 'a competing Live tap cannot stack another route');
  const other = await mount(t, {});
  await React.act(async () => walk(other.tree(), node => node.props?.testID === 'live-tab-open-live-button')[0].props.onPress());
  assert.equal(other.routes[0].pathname, '/watch-party');
  assert.equal(other.routes[0].params.mode, 'live');
});

test('Live requests authorized Circle discovery and renders its exact existing destination', async t => {
  const h = await mount(t, {}, [{ id: 'circle-stage', title: 'Circle live', visibility: 'circle', live_state: 'live' }]);
  assert.equal(h.discoveryOptions().includeCircle, true);
  const card = walk(h.tree(), node => node.type === 'TouchableOpacity')[0];
  assert.match(card.props.accessibilityLabel, /Circle live/);
  await React.act(async () => card.props.onPress());
  assert.equal(h.routes[0], '/spectate/circle-stage');
});

test('Party action recovers after failed navigation and Back, without retaining a stuck latch', async t => {
  const h = await mount(t, {});
  const button = () => walk(h.tree(), node => node.props?.testID === 'live-tab-start-watch-party-button')[0];
  h.failNavigation(true);
  await React.act(async () => button().props.onPress());
  assert.equal(h.routes.length, 0);
  assert.equal(button().props.disabled, false);
  h.failNavigation(false);
  await React.act(async () => button().props.onPress());
  assert.equal(h.routes.length, 1);
  await h.refocus();
  assert.equal(button().props.disabled, false);
  await React.act(async () => button().props.onPress());
  assert.equal(h.routes.length, 2);
});

test('actual Live screen separates future schedules from awaiting host and preserves Event navigation', async t => {
  const h = await mount(t, { items: [
    { id: 'future', eventTitle: 'Future show', status: 'scheduled', startsAt: '2030-01-01T20:00:00Z', isUpcoming: true, isLiveNow: false },
    { id: 'late', eventTitle: 'Delayed show', status: 'scheduled', startsAt: '2020-01-01T20:00:00Z', isUpcoming: false, isLiveNow: false },
  ] });
  const waiting = walk(h.tree(), node => node.props?.testID === 'live-awaiting-host-section');
  assert.equal(waiting.length, 1);
  assert.match(text(waiting[0]), /Delayed show/);
  assert.doesNotMatch(text(waiting[0]), /Future show/);
  const cards = walk(h.tree(), node => node.type === 'TouchableOpacity');
  assert.equal(cards.length, 2);
  const late = cards.find(node => node.props.accessibilityLabel.includes('Awaiting host, not live'));
  assert.ok(late);
  assert.match(cards.find(node => node !== late).props.accessibilityLabel, /Upcoming public Event/);
  await React.act(async () => late.props.onPress());
  assert.equal(h.routes[0].pathname, '/event/[eventId]');
  assert.equal(h.routes[0].params.eventId, 'late');
});

test('actual Live screen does not misreport schedule read failure as no upcoming events', async t => {
  const h = await mount(t, { error: 'Schedule read failed.' });
  assert.match(text(h.tree()), /Upcoming events unavailable/);
  assert.match(text(h.tree()), /Schedule read failed/);
  assert.doesNotMatch(text(h.tree()), /No upcoming public events yet/);
});

test('actual Live screen distinguishes checking schedules from confirmed empty', async t => {
  const h = await mount(t, { loading: true });
  assert.match(text(h.tree()), /Checking upcoming events/);
  assert.doesNotMatch(text(h.tree()), /No upcoming public events yet/);
});
