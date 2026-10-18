// Production Circle screen and shared presentation hook, with native hosts and
// network/focus modeled. No native drawing or installed-device timing claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: document, parentNode: null, tagName: 'DIV' });
document.documentElement = container(); globalThis.document = document; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const owner = (userId = 'viewer', generation = 'one') => ({ userId, accountId: userId, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const profile = avatarUrl => ({ avatarUrl, displayName: 'Rachi', profileAvatarMediaStatus: 'active' });
const official = { userId: 'platform_rachi_official', displayName: 'Rachi', handle: '@chillywood.rachi' };

function environment() {
  let authority = owner(), authorityStatus = 'active', focused = true, circleError = null;
  const queue = [], reads = [], listReads = [], nodes = new Map(), timers = new Map(), cache = new Map();
  let timerId = 0;
  const nativeHost = name => function Host(props) {
    const id = React.useId(); nodes.set(id, { type: name, props });
    React.useLayoutEffect(() => () => nodes.delete(id), [id]);
    return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(value => typeof value === 'object'));
  };
  const native = Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'TouchableOpacity', 'View', 'Image'].map(name => [name, nativeHost(name)]));
  native.StyleSheet = { create: value => value }; native.Alert = { alert: noop };
  const read = async id => { reads.push(id); const next = queue.length ? queue.shift() : profile('https://images.example/rachi.jpg'); if (next instanceof Error) throw next; return next; };
  const getOfficial = id => id === official.userId ? official : null;
  const list = async name => { listReads.push(name); if (circleError) throw circleError; return []; };
  const session = () => ({ authority, authorityStatus, user: authority ? { id: authority.userId } : null, isLoading: false, isSignedIn: !!authority });
  const hookBindings = {
    react: React, '@react-navigation/native': { useIsFocused: () => focused },
    '../../_lib/accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority: (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b) },
    '../../_lib/officialAccounts': { getOfficialPlatformAccount: getOfficial },
    '../../_lib/session': { useSession: session },
    '../../_lib/userData': { readUserProfile: () => read(authority?.userId), readUserProfileByUserId: read },
    '../../_lib/monetization': { readCreatorPermissions: async () => null },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const source = file === 'app/chilly-circle.tsx' && process.env.RACHI_CIRCLE_BASELINE
      ? execFileSync('git', ['show', `${process.env.RACHI_CIRCLE_BASELINE}:${file}`], { encoding: 'utf8' }) : fs.readFileSync(file, 'utf8');
    const require = name => {
      if (name in hookBindings && file.endsWith('use-profile-presentation.ts')) return hookBindings[name];
      if (name === 'react') return React;
      if (name === 'react-native') return native;
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
      if (name === 'expo-router') return { useRouter: () => ({ push: noop, replace: noop, back: noop }) };
      if (name.endsWith('/friendGraph')) return { listMyChillyCircle: () => list('circle'), listIncomingChillyCircleRequests: () => list('incoming'), listOutgoingChillyCircleRequests: () => list('outgoing') };
      if (name.endsWith('/officialAccounts')) return { RACHI_OFFICIAL_ACCOUNT: official, getOfficialPlatformAccount: getOfficial };
      if (name.endsWith('/peopleSearchNormalization')) return { getPrimaryPeopleSearchCandidate: value => value, matchesPeopleSearchValues: (values, needle) => values.some(value => String(value || '').toLowerCase().includes(needle)), normalizePeopleSearchQuery: value => ({ cleaned: value, searchable: false, candidates: [] }), PEOPLE_SEARCH_NO_RESULTS_COPY: 'No people' };
      if (name.endsWith('/publicPeopleSearch')) return { searchPublicPeople: async () => [] };
      if (name.endsWith('/session')) return { useSession: session };
      if (name.endsWith('/userData')) return { readUserProfileByUserId: read, buildUserChannelProfile: ({ profile }) => ({ avatarUrl: profile?.avatarUrl ?? null }) };
      if (name.endsWith('/userFacingErrors')) return { getUserFacingErrorMessage: (_error, fallback) => fallback };
      if (name.endsWith('/ProfileMediaImage')) return { ProfileMediaImage: native.Image };
      if (name.endsWith('/StableImage')) return { StableImage: nativeHost('StableImage') };
      if (name.endsWith('/Skeleton')) return { Skeleton: nativeHost('Skeleton') };
      if (name.endsWith('/chillywood-visual-system')) return { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: () => null };
      if (name.endsWith('/use-profile-presentation')) return load('components/profile/use-profile-presentation.ts');
      throw new Error(`Unmodeled dependency: ${name}`);
    };
    vm.runInNewContext(compile(source), { exports, require, console, Date, Promise, JSON, setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id) });
    return exports;
  }
  async function mount(t, kind = 'circle') {
    let presentation;
    const Screen = kind === 'circle' ? load('app/chilly-circle.tsx').default : function ProfileConsumer() {
      // Same production hook/scope that Profile's official-account binding uses.
      presentation = load('components/profile/use-profile-presentation.ts').useProfilePresentation(official.userId, false); return null;
    };
    const root = createRoot(container()); let unmounted = false;
    const render = () => React.act(async () => root.render(React.createElement(Screen)));
    const unmount = async () => { if (!unmounted) { unmounted = true; await React.act(async () => root.unmount()); } };
    t.after(unmount); await render();
    const all = () => [...nodes.values()];
    return { all, presentation: () => presentation, unmount, render,
      image: () => all().find(node => ['Image', 'StableImage'].includes(node.type) && node.props.source?.uri),
      find: id => all().find(node => node.props.testID === id),
      initial: () => all().find(node => node.type === 'Text' && node.props.children === 'R'),
      async run(fn) { await React.act(async () => { await fn(); }); },
      async resolve(held, value) { await React.act(async () => held.resolve(value)); },
      async focus(value) { focused = value; await render(); },
      async session(value, status = 'active') { authority = value; authorityStatus = status; await render(); },
      async timers(ms) { await React.act(async () => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } }); },
    };
  }
  return { queue, reads, listReads, mount, failCircle: error => { circleError = error; } };
}

test('cold Circle Rachi photo uses loading instead of a missing-photo initial while metadata is delayed', async t => {
  const e = environment(), held = deferred(); e.queue.push(held.promise); const h = await e.mount(t);
  assert.ok(h.find('circle-rachi-avatar-loading')); assert.equal(h.initial(), undefined); assert.equal(h.image(), undefined);
  assert.deepEqual(e.listReads, ['circle', 'incoming', 'outgoing']);
  await h.resolve(held, profile('https://images.example/current.jpg'));
  assert.equal(h.image().type, 'StableImage'); assert.equal(h.image().props.source.uri, 'https://images.example/current.jpg');
  assert.equal(h.find('circle-rachi-avatar-loading'), undefined); assert.equal(e.reads.length, 1);
});

test('warm Circle mount keeps the known URL while refreshing its shared official metadata', async t => {
  const e = environment(), first = await e.mount(t); await first.unmount();
  const held = deferred(); e.queue.push(held.promise); const next = await e.mount(t);
  assert.equal(next.image()?.props.source.uri, 'https://images.example/rachi.jpg'); assert.equal(next.initial(), undefined);
  await next.resolve(held, profile('https://images.example/replaced.jpg')); assert.equal(next.image().props.source.uri, 'https://images.example/replaced.jpg');
});

test('Circle and Profile reuse the same public official metadata cache across navigation', async t => {
  const e = environment(), first = await e.mount(t); await first.unmount();
  const held = deferred(); e.queue.push(held.promise); const next = await e.mount(t, 'profile');
  assert.equal(next.presentation().profile?.avatarUrl, 'https://images.example/rachi.jpg'); assert.equal(next.presentation().ready, true);
  await next.resolve(held, profile('https://images.example/from-profile.jpg')); await next.unmount();
  const again = deferred(); e.queue.push(again.promise); const circle = await e.mount(t);
  assert.equal(circle.image()?.props.source.uri, 'https://images.example/from-profile.jpg');
});

test('confirmed missing Rachi artwork uses the initial; metadata failure exposes retry and recovers', async t => {
  const e = environment(); e.queue.push(profile(null)); const h = await e.mount(t);
  assert.ok(h.initial()); assert.equal(h.image(), undefined); assert.equal(h.find('circle-rachi-avatar-loading'), undefined);
  await h.focus(false); e.queue.push(new Error('offline')); await h.focus(true);
  assert.equal(h.initial(), undefined); assert.ok(h.find('circle-rachi-avatar-retry'));
  e.queue.push(profile('https://images.example/retried.jpg')); let stopped = false;
  await h.run(() => h.find('circle-rachi-avatar-retry').props.onPress({ stopPropagation: () => { stopped = true; } }));
  assert.equal(stopped, true); assert.equal(h.image().props.source.uri, 'https://images.example/retried.jpg');
});

for (const transition of ['account', 'generation', 'restricted']) test(`${transition} changes clear old Circle artwork and reject stale metadata`, async t => {
  const e = environment(), h = await e.mount(t), old = deferred(), next = deferred();
  await h.focus(false); e.queue.push(old.promise); await h.focus(true);
  e.queue.push(next.promise);
  await h.session(owner(transition === 'account' ? 'other' : 'viewer', transition === 'generation' ? 'two' : 'one'), transition === 'restricted' ? 'restricted' : 'active');
  assert.equal(h.image(), undefined); assert.equal(h.initial(), undefined); assert.ok(h.find('circle-rachi-avatar-loading'));
  await h.resolve(old, profile('https://images.example/stale.jpg')); assert.equal(h.image(), undefined);
  if (transition !== 'restricted') { await h.resolve(next, profile('https://images.example/new-scope.jpg')); assert.equal(h.image().props.source.uri, 'https://images.example/new-scope.jpg'); }
});

test('Circle relationship loading failures do not erase or relabel the separate official photo', async t => {
  const e = environment(); e.failCircle(new Error('offline')); const h = await e.mount(t);
  assert.equal(h.image()?.props.source.uri, 'https://images.example/rachi.jpg');
  assert.equal(e.reads.length, 1); assert.deepEqual(e.listReads, ['circle', 'incoming', 'outgoing']);
});

test('official Circle search suggestion uses the same loading and known-image renderer', async t => {
  const e = environment(), held = deferred(); e.queue.push(held.promise); const h = await e.mount(t);
  await h.run(() => h.find('chilly-circle-search-input').props.onChangeText('rachi')); await h.timers(280);
  assert.ok(h.find('chilly-circle-suggestion-row-official-0'));
  assert.equal(h.all().filter(node => node.props.testID === 'circle-rachi-avatar-loading').length, 2);
  assert.equal(h.initial(), undefined);
  await h.resolve(held, profile('https://images.example/search.jpg'));
  assert.equal(h.all().filter(node => node.type === 'StableImage' && node.props.source?.uri === 'https://images.example/search.jpg').length, 2);
  assert.equal(e.reads.length, 1);
});

test('explicit Circle refresh revalidates both relationships and the known official photo', async t => {
  const e = environment(), h = await e.mount(t), held = deferred(); e.queue.push(held.promise);
  const button = h.all().find(node => node.type === 'TouchableOpacity' && node.props.children?.props?.children === 'Refresh');
  assert.ok(button); await h.run(() => button.props.onPress());
  assert.equal(e.listReads.length, 6); assert.equal(e.reads.length, 2);
  assert.equal(h.image()?.props.source.uri, 'https://images.example/rachi.jpg');
  await h.resolve(held, profile('https://images.example/refreshed.jpg'));
  assert.equal(h.image().props.source.uri, 'https://images.example/refreshed.jpg');
});
