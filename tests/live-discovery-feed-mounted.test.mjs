import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const actor = '10000000-0000-4000-8000-000000000001', other = '20000000-0000-4000-8000-000000000002';
const owner = (id = actor) => ({ userId: id, accountId: id, sessionGeneration: `${id}-session`, state: 'ACTIVE', restoreOnly: false });
const sameOwner = (a, b) => !!a && !!b && ['userId', 'accountId', 'sessionGeneration', 'restoreOnly'].every(k => a[k] === b[k]);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const item = (id = 'live', extra = {}) => ({ id, live_state: 'live', ended_at: null, visibility: 'public', is_publicly_discoverable: true, moderation_status: 'clean', rights_status: 'creator_owned', discovery_surface: 'home_profile_channel', ranking_score: 1, owner_user_id: actor, channel_user_id: actor, host_user_id: actor, creator_user_id: actor, item_type: 'live_room', is_spectator_enabled: true, status: 'active', access_type: 'public_free', created_at: '2026-10-10T00:00:00Z', ...extra });

function fixture() {
  let authority = owner(), snapshot = authority, status = 'active', focused = true, response, rows = [item()];
  const queries = [], starts = [], intervals = new Map(), timeouts = new Map(), listeners = new Set(), cache = new Map();
  const app = { currentState: 'active', addEventListener: (_, f) => { listeners.add(f); return { remove: () => listeners.delete(f) }; } };
  let database = { from(table) {
    const operations = [], filters = []; let max = Infinity, signal;
    const q = { select: () => q, order: () => q,
      eq(key, value) { operations.push(['eq', key, value]); filters.push(row => row[key] === value); return q; },
      in(key, values) { operations.push(['in', key, values]); filters.push(row => values.includes(row[key])); return q; },
      or(value) {
        operations.push(['or', value]);
        if (value.startsWith('ended_at.')) filters.push(row => !row.ended_at || Date.parse(row.ended_at) > Date.now());
        else {
          const match = value.match(/^owner_user_id\.in\.\(([^)]+)\),channel_user_id\.in\.\(([^)]+)\)$/);
          assert.ok(match, 'only fixed owner/channel UUID expressions are modeled');
          const ids = match[1].split(','); filters.push(row => ids.includes(row.owner_user_id) || ids.includes(row.channel_user_id));
        }
        return q;
      },
      limit(value) { operations.push(['limit', value]); max = value; return q; },
      abortSignal(value) { signal = value; return q; },
      async returns() {
        const observed = { table, operations, signal }; queries.push(observed);
        if (response) return response(observed);
        const source = table === 'circle_spectator_feed_items' ? rows.filter(r => r.visibility === 'circle') : rows;
        return { data: source.filter(row => filters.every(filter => filter(row))).slice(0, max), error: null };
      },
    }; return q;
  } };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    const context = { exports, console, AbortController,
      setTimeout: (fn, ms) => { timeouts.set(fn, ms); return fn; }, clearTimeout: fn => timeouts.delete(fn),
      setInterval: (fn, ms) => { intervals.set(fn, ms); return fn; }, clearInterval: fn => intervals.delete(fn),
      require(name) {
        if (name === 'react') return React;
        if (name === '@react-navigation/native') return { useIsFocused: () => focused };
        if (name === 'react-native') return { AppState: app };
        if (name === './session') return { useSession: () => ({ authority, authorityStatus: status }) };
        if (name === './accountSessionAuthority') return { getCurrentAccountSessionAuthoritySnapshot: () => snapshot, sameAccountSessionAuthority: sameOwner };
        if (name === './supabase') return { supabase: database };
        if (name === './channelAudience') return { readFollowedChannelUserIds: async () => [] };
        if (name === './friendGraph') return { readActiveFriendUserIds: async () => [] };
        if (name === './discoveryFeed') return load('_lib/discoveryFeed.ts');
        if (name === './circleSpectatorFeed') return load('_lib/circleSpectatorFeed.ts');
        throw new Error(name);
      },
    };
    const baseline = process.env.DISCOVERY_TEST_BASELINE === '1' && /\/(discoveryFeed|circleSpectatorFeed)\.ts$/.test(file);
    const source = baseline ? execFileSync('git', ['show', `f61ce3f965804f96c1f55e6850821295fa2e643f:${file}`], { encoding: 'utf8' }) : fs.readFileSync(file, 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
    cache.set(file, exports); return exports;
  }
  return { load, queries, starts, app, listeners, intervals, timeouts, rows: value => { rows = value; }, response: value => { response = value; }, database: value => { database = value; },
    account: (value, nextStatus = value ? 'active' : 'unknown') => { authority = value; snapshot = value; status = nextStatus; }, snapshot: value => { snapshot = value; }, focus: value => { focused = value; } };
}

test('actual query selects live rows before its limit; ranked Home still includes uploads', async () => {
  const h = fixture(); h.rows([...Array.from({ length: 60 }, (_, i) => item(`upload${i}`, { live_state: 'not_live', item_type: 'creator_upload', media_id: `media${i}` })), item()]);
  const reader = h.load('_lib/discoveryFeed.ts');
  assert.equal((await reader.readPublicDiscoveryFeedItems({ liveOnly: true, limit: 8 }))[0]?.id, 'live');
  assert.ok(h.queries[0].operations.findIndex(op => op[0] === 'eq' && op[1] === 'live_state') < h.queries[0].operations.findIndex(op => op[0] === 'limit'));
  assert.equal((await reader.readPublicDiscoveryFeedItems({ limit: 8 }))[0].item_type, 'creator_upload');
});
test('actual query excludes ended high-ranked live rows before limiting', async () => {
  const h = fixture(); h.rows([item('ended', { ended_at: '2020-01-01T00:00:00Z' }), item()]);
  assert.equal((await h.load('_lib/discoveryFeed.ts').readPublicDiscoveryFeedItems({ liveOnly: true, limit: 1 }))[0]?.id, 'live');
});
test('actual Circle query applies live and creator restrictions before the limit', async () => {
  const h = fixture(); h.rows([item('scheduled', { visibility: 'circle', access_type: 'circle', live_state: 'scheduled' }), item('circle-live', { visibility: 'circle', access_type: 'circle' })]);
  const result = await h.load('_lib/circleSpectatorFeed.ts').readCircleSpectatorFeedItems({ liveOnly: true, creatorUserId: actor, limit: 1 });
  assert.equal(result[0]?.id, 'circle-live');
});
for (const module of ['discoveryFeed', 'circleSpectatorFeed']) test(`actual query ${module} distinguishes database failure from genuine empty results`, async () => {
  const h = fixture(), reader = h.load(`_lib/${module}.ts`)[module === 'discoveryFeed' ? 'readPublicDiscoveryFeedItems' : 'readCircleSpectatorFeedItems'];
  h.response(async () => ({ data: null, error: new Error('offline') })); await assert.rejects(reader(), /offline/);
  h.response(async () => ({ data: [], error: null })); assert.equal((await reader()).length, 0);
});
test('creator mapping accepts owner or channel once and rejects empty or injected identifiers', async () => {
  const h = fixture(); h.rows([item('owner', { channel_user_id: other }), item('channel', { owner_user_id: other }), item('unrelated', { channel_user_id: other, owner_user_id: other })]);
  const reader = h.load('_lib/discoveryFeed.ts').readPublicDiscoveryFeedItems;
  assert.equal((await reader({ creatorUserId: actor })).map(r => r.id).join(','), 'owner,channel');
  const count = h.queries.length;
  for (const creatorUserId of ['', 'owner),visibility.eq.private', 'not-a-uuid']) await assert.rejects(reader({ creatorUserId }), /Invalid discovery creator/);
  assert.equal(h.queries.length, count);
});
test('actual PostgREST URL retains both live-expiry and creator predicates', async () => {
  const { PostgrestClient } = require('@supabase/postgrest-js'), urls = [];
  const h = fixture();
  h.database(new PostgrestClient('https://offline.invalid/rest/v1', { fetch: async url => {
    urls.push(new URL(url)); return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  } }));
  await h.load('_lib/discoveryFeed.ts').readPublicDiscoveryFeedItems({ liveOnly: true, creatorUserId: actor, surface: 'channel', limit: 8 });
  const query = urls[0].searchParams;
  assert.equal(query.get('live_state'), 'eq.live'); assert.equal(query.get('limit'), '8');
  assert.equal(query.get('visibility'), 'eq.public'); assert.equal(query.get('is_publicly_discoverable'), 'eq.true');
  assert.equal(query.getAll('or').length, 2);
  assert.match(query.getAll('or')[0], /^\(ended_at.is.null,ended_at.gt./);
  assert.equal(query.getAll('or')[1], `(owner_user_id.in.(${actor}),channel_user_id.in.(${actor}))`);
});

async function mount(t, setup = () => {}) {
  const h = fixture(); setup(h); let result, options = { surface: 'home', liveOnly: true, limit: 8 };
  const hook = h.load('_lib/useLiveDiscoveryFeed.ts').useLiveDiscoveryFeed;
  function Host() { result = hook(options); return null; }
  const root = createRoot(container()), render = () => React.act(async () => { root.render(React.createElement(Host)); });
  await render(); t.after(() => React.act(async () => root.unmount()));
  return { ...h, result: () => result, render,
    options: async value => { options = { ...options, ...value }; await render(); },
    changeAccount: async (value, status) => { h.account(value, status); await render(); },
    changeFocus: async value => { h.focus(value); await render(); },
    appState: async state => React.act(async () => { h.app.currentState = state; for (const f of h.listeners) f(state); }),
    tick: async ms => React.act(async () => { for (const [fn, delay] of [...h.intervals, ...h.timeouts]) if (delay === ms) fn(); }),
    resolve: async (d, value) => React.act(async () => { d.resolve(value); }),
  };
}
test('mounted feed refreshes only focused foreground and removes an ended item', async t => {
  const h = await mount(t); assert.equal(h.result().items[0]?.id, 'live');
  h.rows([]); await h.tick(30000); assert.equal(h.result().items.length, 0);
  await h.changeFocus(false); const before = h.queries.length; await h.tick(30000); assert.equal(h.queries.length, before);
  h.rows([item('new')]); await h.changeFocus(true); assert.equal(h.result().items[0]?.id, 'new');
  await h.appState('background'); assert.equal(h.result().items.length, 0);
  const background = h.queries.length; await h.tick(30000); assert.equal(h.queries.length, background);
  await h.appState('active'); assert.equal(h.result().items[0]?.id, 'new');
});
for (const transition of ['account', 'creator', 'blur', 'background', 'disabled']) test(`held read cannot repopulate after ${transition}`, async t => {
  const held = deferred(); const h = await mount(t, h => h.response(() => held.promise));
  h.response(async () => ({ data: [], error: null }));
  if (transition === 'account') await h.changeAccount(owner(other));
  if (transition === 'creator') await h.options({ creatorUserId: other });
  if (transition === 'blur') await h.changeFocus(false);
  if (transition === 'background') await h.appState('background');
  if (transition === 'disabled') await h.options({ enabled: false });
  await h.resolve(held, { data: [item('old')], error: null }); assert.equal(h.result().items.length, 0);
  assert.equal(h.queries[0].signal.aborted, true);
});
test('held read times out honestly, ignores late results, and can retry', async t => {
  const held = deferred(), h = await mount(t, h => h.response(() => held.promise));
  await h.tick(12000); assert.ok(h.result().error); assert.equal(h.result().loading, false);
  assert.equal(h.queries[0].signal.aborted, true);
  h.response(async () => ({ data: [item('fresh')], error: null }));
  await React.act(async () => h.result().reload()); assert.equal(h.result().items[0]?.id, 'fresh');
  await h.resolve(held, { data: [item('late')], error: null }); assert.equal(h.result().items[0]?.id, 'fresh');
});
test('reload and interval coalesce while a read is held; old reload cannot read a new owner', async t => {
  const held = deferred(), h = await mount(t, h => h.response(() => held.promise));
  const oldReload = h.result().reload; void oldReload(); await h.tick(30000); assert.equal(h.queries.length, 1);
  h.response(async () => ({ data: [], error: null })); await h.changeAccount(owner(other));
  const before = h.queries.length; await oldReload(); assert.equal(h.queries.length, before);
  await h.resolve(held, { data: [], error: null });
});
test('authority loss clears visible data and cannot trigger a query', async t => {
  const h = await mount(t); await h.changeAccount(null); assert.equal(h.result().items.length, 0);
  const before = h.queries.length; await React.act(async () => h.result().reload()); assert.equal(h.queries.length, before);
});
test('query failure is visible and retry recovers without fabricated fallback items', async t => {
  const h = await mount(t, h => h.response(async () => ({ data: null, error: new Error('network') })));
  assert.ok(h.result().error); assert.equal(h.result().items.length, 0);
  h.response(async () => ({ data: [item()], error: null })); await React.act(async () => h.result().reload());
  assert.equal(h.result().error, null); assert.equal(h.result().items.length, 1);
});
test('Circle rows are opt-in and deduped against public rows', async t => {
  const h = await mount(t, h => h.rows([item(), item('circle', { visibility: 'circle', access_type: 'circle' })]));
  assert.equal(h.result().circleItems.length, 0); await h.options({ includeCircle: true });
  assert.equal(h.result().items.length, 2); assert.equal(h.result().circleItems[0]?.id, 'circle');
});
test('explicit signed-out guests retain public feeds but cannot load Circle rows', async t => {
  const h = await mount(t, h => h.account(null, 'signed_out'));
  await h.options({ includeCircle: true });
  assert.equal(h.result().items[0]?.id, 'live');
  assert.ok(h.queries.every(q => q.table === 'discovery_feed_items'));
});
for (const status of ['loading', 'unknown', 'restricted', 'recovery_only', 'restore_only']) test(`${status} is not guest authority`, async t => {
  const h = await mount(t, h => h.account(null, status));
  assert.equal(h.queries.length, 0); assert.equal(h.result().items.length, 0);
});
test('a held guest read cannot replace the signed-in result', async t => {
  const held = deferred(), h = await mount(t, h => { h.account(null, 'signed_out'); h.response(() => held.promise); });
  h.response(async () => ({ data: [item('signed-in')], error: null })); await h.changeAccount(owner());
  await h.resolve(held, { data: [item('guest-late')], error: null }); assert.equal(h.result().items[0]?.id, 'signed-in');
});
test('a periodic foreground refresh preserves currently loaded cards while its read is pending', async t => {
  const h = await mount(t), held = deferred(); h.response(() => held.promise);
  await h.tick(30000); assert.equal(h.result().loading, false); assert.equal(h.result().items[0]?.id, 'live');
  await h.resolve(held, { data: [], error: null }); assert.equal(h.result().items.length, 0);
});
