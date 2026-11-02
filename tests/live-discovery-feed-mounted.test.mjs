import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
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
const hintKey = id => { const hex = createHash('sha256').update(id).digest('hex'); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`; };
const item = (id = 'live', extra = {}) => ({ id, discovery_hint_key: hintKey(id), live_state: 'live', ended_at: null, visibility: 'public', is_publicly_discoverable: true, moderation_status: 'clean', rights_status: 'creator_owned', discovery_surface: 'home_profile_channel', ranking_score: 1, owner_user_id: actor, channel_user_id: actor, host_user_id: actor, creator_user_id: actor, item_type: 'live_room', is_spectator_enabled: true, status: 'active', access_type: 'public_free', created_at: '2026-10-10T00:00:00Z', ...extra });

function fixture({ actualUpdates = false, pushEnabled = false } = {}) {
  let now = Date.now();
  let healthy = false;
  let rankingRows = {};
  let rankingResponse;
  const hints = new Set(), accountListeners = new Set(), activityListeners = new Set(), channels = [], countReads = [];
  let countResponse = () => ({ data: { total: 0, byTitle: [] }, error: null });
  let authority = owner(), snapshot = authority, status = 'active', focused = true, response, rows = [item()];
  const queries = [], rankingQueries = [], starts = [], intervals = new Map(), timeouts = new Map(), listeners = new Set(), cache = new Map();
  const app = { currentState: 'active', addEventListener: (_, f) => { listeners.add(f); return { remove: () => listeners.delete(f) }; } };
  let database = {
    channel(topic, options) {
      let callback;
      const channel = { topic, options, on: (_event, _filter, fn) => { callback = fn; return channel; },
        subscribe: fn => { channel.status = fn; fn('SUBSCRIBED'); return channel; }, hint: keys => callback?.({ payload: { id: 'opaque', ...(keys ? { keys } : {}) } }) };
      channels.push(channel); return channel;
    },
    removeChannel: async () => {},
    rpc(name, args) { return { abortSignal: async signal => { countReads.push({ name, args, signal }); return countResponse(); } }; },
    from(table) {
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
        const observed = { table, operations, signal };
        if (!['discovery_feed_items','circle_spectator_feed_items'].includes(table)) {
          rankingQueries.push(observed);
          if (rankingResponse) return rankingResponse(observed);
          return { data: (rankingRows[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(0,max), error: null };
        }
        queries.push(observed);
        if (response) return response(observed);
        const source = table === 'circle_spectator_feed_items' ? rows.filter(r => r.visibility === 'circle') : rows;
        return { data: source.filter(row => filters.every(filter => filter(row))).slice(0, max), error: null };
      },
    }; return q;
  } };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    const context = { exports, console, AbortController, Date: class extends Date { static now() { return now; } },
      process: { env: { EXPO_PUBLIC_LIVE_DISCOVERY_PUSH_ENABLED: String(pushEnabled) } }, Math: Object.assign(Object.create(Math), { random: () => 0 }),
      setTimeout: (fn, ms) => { timeouts.set(fn, ms); return fn; }, clearTimeout: fn => timeouts.delete(fn),
      setInterval: (fn, ms) => { intervals.set(fn, ms); return fn; }, clearInterval: fn => intervals.delete(fn),
      require(name) {
        if (name === 'react') return React;
        if (name === '@react-navigation/native') return { useIsFocused: () => focused };
        if (name === 'react-native') return { AppState: app };
        if (name === './session') return { useSession: () => ({ authority, authorityStatus: status }) };
        if (name === './sharedLiveUpdates') return actualUpdates ? load('_lib/sharedLiveUpdates.ts') : { getDiscoveryLiveUpdateInterest: options => options, isDiscoveryLiveUpdateConnected: () => healthy, subscribeToLiveUpdates: (_, scope, callback) => { assert.equal(scope, 'discovery'); hints.add(callback); return () => hints.delete(callback); } };
        if (['./useLiveDiscoveryFeed', './publicPartyRoomCounts', './liveDiscoveryInvalidation'].includes(name)) return load(`_lib/${name.slice(2)}.ts`);
        if (name === './notificationActivity') return { getNotificationActivityOwnerKey: value => value.sessionGeneration,
          subscribeToNotificationActivity: (_, fn) => { activityListeners.add(fn); return () => activityListeners.delete(fn); } };
        if (name === './sharedLiveRead') return load('_lib/sharedLiveRead.ts');
        if (name === './discoveryRankingSignals') return load('_lib/discoveryRankingSignals.ts');
        if (name === './accountSessionAuthority') return { getCurrentAccountSessionAuthoritySnapshot: () => snapshot, sameAccountSessionAuthority: sameOwner,
          subscribeToAccountSessionAuthority: fn => { accountListeners.add(fn); return () => accountListeners.delete(fn); } };
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
  return { load, queries, rankingQueries, rankingRows: value => { rankingRows=value; }, rankingResponse: value => { rankingResponse=value; }, starts, app, listeners, intervals, timeouts, hints, channels, countReads, activityListeners, countResponse: value => { countResponse = value; }, healthy: value => { healthy = value; }, advance: ms => { now += ms; }, rows: value => { rows = value; }, response: value => { response = value; }, database: value => { database = value; },
    account: (value, nextStatus = value ? 'active' : 'unknown') => { authority = value; snapshot = value; status = nextStatus; for (const fn of [...accountListeners]) fn(value); }, snapshot: value => { snapshot = value; }, focus: value => { focused = value; } };
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

async function mount(t, setup = () => {}, instances = 1) {
  const h = fixture(); setup(h); let result, options = { surface: 'home', liveOnly: true, limit: 8 };
  const hook = h.load('_lib/useLiveDiscoveryFeed.ts').useLiveDiscoveryFeed;
  function Host() { const results = []; for (let i = 0; i < instances; i++) results.push(hook(options)); result = results[0]; return null; }
  const root = createRoot(container()), render = () => React.act(async () => { root.render(React.createElement(Host)); });
  await render(); t.after(() => React.act(async () => root.unmount()));
  return { ...h, result: () => result, render,
    options: async value => { options = { ...options, ...value }; await render(); },
    changeAccount: async (value, status) => { h.account(value, status); await render(); },
    changeFocus: async value => { h.focus(value); await render(); },
    appState: async state => React.act(async () => { h.app.currentState = state; for (const f of h.listeners) f(state); }),
    tick: async ms => React.act(async () => { h.advance(ms); for (const [fn, delay] of [...h.intervals, ...h.timeouts]) if (delay === ms) fn(); }),
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
test('held read times out honestly, blocks overlapping retries, and retries after source settlement', async t => {
  const held = deferred(), h = await mount(t, h => h.response(() => held.promise));
  await h.tick(12000); assert.ok(h.result().error); assert.equal(h.result().loading, false);
  assert.equal(h.queries[0].signal.aborted, true);
  h.response(async () => ({ data: [item('fresh')], error: null }));
  for(let i=0;i<3;i++)await React.act(async () => h.result().reload());
  assert.equal(h.queries.length,1,'a source that ignores abort still owns its transport');assert.ok(h.result().error);
  await h.resolve(held, { data: [item('late')], error: null }); assert.equal(h.result().items.length,0);
  await React.act(async () => h.result().reload()); assert.equal(h.result().items[0]?.id, 'fresh');assert.equal(h.queries.length,2);
});
test('failed public source cannot release a shared read while an abort-ignoring Circle sibling is held',async t=>{
  const held=deferred(),h=await mount(t);
  h.response(({table})=>table==='discovery_feed_items'?Promise.reject(new Error('public failed')):held.promise);
  await h.options({includeCircle:true});const count=h.queries.length;
  await h.tick(12000);assert.ok(h.result().error);
  for(let i=0;i<3;i++)await React.act(async()=>h.result().reload());
  assert.equal(h.queries.length,count,'failed sibling cannot release the still-running source');
  assert.equal(h.queries.at(-1).signal.aborted,true);
  await h.resolve(held,{data:[],error:null});assert.equal(h.result().items.length,0);
  h.response(({table})=>Promise.resolve({data:table==='discovery_feed_items'?[item('fresh')]:[],error:null}));
  await React.act(async()=>h.result().reload());assert.equal(h.result().items[0]?.id,'fresh');assert.equal(h.queries.length,count+2);
});
test('failed ranking source retains shared ownership until every bounded graph reader settles',async t=>{
  const held=deferred(),h=await mount(t,h=>{
    h.rows([item('candidate',{owner_user_id:other,channel_user_id:other,host_user_id:other})]);
    h.rankingResponse(({table})=>table==='channel_followers'?Promise.reject(new Error('ranking failed')):held.promise);
  });
  assert.equal(h.rankingQueries.length,5);await h.tick(12000);assert.ok(h.result().error);
  for(let i=0;i<3;i++)await React.act(async()=>h.result().reload());
  assert.equal(h.queries.length,1);assert.equal(h.rankingQueries.length,5);
  assert.ok(h.rankingQueries.every(query=>query.signal.aborted));
  await h.resolve(held,{data:[],error:null});assert.equal(h.result().items.length,0);
  h.rankingResponse(null);await React.act(async()=>h.result().reload());
  assert.equal(h.result().items[0]?.id,'candidate');assert.equal(h.queries.length,2);assert.equal(h.rankingQueries.length,10);
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

test('stable live rail revalidates old IDs beyond top K and automatically appends new cards without a tap', async t => {
  const h = await mount(t); await h.options({ preserveBrowsePosition: true, limit: 1 });
  h.rows([item('new'), item('live', { title: 'Updated existing title' })]); await h.tick(30000);
  assert.equal(h.result().items.map(x=>x.id).join(','), 'live,new'); assert.equal(h.result().items[0].title, 'Updated existing title');
  assert.equal(h.result().pendingItemCount, 0);
  assert.ok(h.queries.some(q=>q.operations.some(op=>op[0]==='in' && op[1]==='id')));
  await React.act(async()=>h.result().reload());assert.equal(h.result().items[0].id,'new');assert.equal(h.result().pendingItemCount,0);
});
test('withdrawal clears existing card and fills the now-empty rail from its fresh canonical head', async t => {
  const h=await mount(t);await h.options({preserveBrowsePosition:true});h.rows([item('new')]);await h.tick(30000);
  assert.equal(h.result().items[0]?.id,'new');assert.equal(h.result().pendingItemCount,0);
  h.rows([]);await h.tick(30000);assert.equal(h.result().pendingItemCount,0);
});
test('initially empty stable rail automatically shows newly live rows without a manual new-items tap', async t => {
  const h=await mount(t,h=>h.rows([]));await h.options({preserveBrowsePosition:true});
  assert.equal(h.result().items.length,0);h.rows([item('started')]);await h.tick(30000);
  assert.equal(h.result().items[0]?.id,'started');assert.equal(h.result().pendingItemCount,0);
});
test('healthy public transport cannot slow Circle head reconciliation or revive a cached withdrawn public row', async t => {
  const h=await mount(t);await h.options({preserveBrowsePosition:true,includeCircle:true});h.healthy(true);
  const before=h.queries.filter(q=>q.table==='circle_spectator_feed_items').length;
  h.rows([item('circle-started',{visibility:'circle',is_publicly_discoverable:false,access_type:'circle'})]);await h.tick(30000);
  assert.ok(h.queries.filter(q=>q.table==='circle_spectator_feed_items').length>before);
  assert.equal(h.result().items.map(item=>item.id).join(','),'circle-started');
  assert.equal(h.result().publicItems.length,0,'old public head is not adopted after pinned authority withdrew it');
});
test('a privacy/end hint arriving while an empty-rail read is held prevents the stale result from appearing', async t => {
  const h=await mount(t,h=>h.rows([]));await h.options({preserveBrowsePosition:true});const held=deferred();
  h.response(()=>held.promise);await h.tick(30000);
  await React.act(async()=>{for(const fn of h.hints)fn();});
  h.response(async()=>({data:[],error:null}));await h.resolve(held,{data:[item('now-private')],error:null});
  assert.equal(h.result().items.length,0);await h.tick(500);assert.equal(h.result().items.length,0);
});
test('a due hint waits for a held source instead of creating a1ms timer spin', async t => {
  const h=await mount(t),held=deferred();h.response(()=>held.promise);await h.tick(30000);
  await React.act(async()=>{for(const fn of h.hints)fn();});await h.tick(500);
  assert.ok(![...h.timeouts.values()].includes(1),'the source owns its read deadline, not a repeated zero-delay poll');
  const before=h.queries.length;for(let i=0;i<1000;i++)await h.tick(1);assert.equal(h.queries.length,before);
  h.response(async()=>({data:[item('current-after-hint')],error:null}));await h.resolve(held,{data:[item('stale')],error:null});
  assert.equal(h.result().items[0].id,'live');await h.tick(1);assert.equal(h.result().items[0].id,'current-after-hint');
});
test('stable rails never reorder surviving cards on rank changes', async t => {
  const h=await mount(t,h=>h.rows([item('first'),item('second')]));await h.options({preserveBrowsePosition:true});
  const original=h.result().items.map(x=>x.id).join(',');h.rows([item('second',{ranking_score:999}),item('first')]);await h.tick(30000);
  assert.equal(h.result().items.map(x=>x.id).join(','),original);
});
for(const lane of ['public','circle']) test(`${lane} pinned withdrawal defeats a stale concurrent head snapshot`, async t => {
  const row=id=>item(id,lane==='circle'?{visibility:'circle',access_type:'circle',is_publicly_discoverable:false}:{});
  const h=await mount(t,h=>h.rows([row('withdrawn'),row('surviving')]));await h.options({preserveBrowsePosition:true,includeCircle:lane==='circle'});
  h.response(async({table,operations})=>({data:table===(lane==='public'?'discovery_feed_items':'circle_spectator_feed_items')
    ? operations.some(operation=>operation[0]==='in'&&operation[1]==='id') ? [row('surviving')] : [row('withdrawn'),row('surviving'),row('new')]
    : [],error:null}));
  await h.tick(30000);assert.equal(h.result().items.map(row=>row.id).join(','),'surviving,new');
});
test('stable ordering is opt-in and mixed non-live feeds adopt current ranking', async t => {
  const h=await mount(t);await h.options({preserveBrowsePosition:true,liveOnly:false});h.rows([item('new')]);await h.tick(30000);
  assert.equal(h.result().items[0].id,'new');assert.equal(h.result().pendingItemCount,0);
});
test('hint arriving within read budget has trailing reconciliation, not a dropped change', async t => {
  const h=await mount(t);h.rows([item('new')]);const before=h.queries.length;
  await React.act(async()=>{for(let i=0;i<100;i++)for(const fn of h.hints)fn();});assert.equal(h.queries.length,before);
  await h.tick(500);assert.equal(h.queries.length,before+1);assert.equal(h.result().items[0].id,'new');
});
test('manual acceptance during held automatic refresh rereads instead of accepting stale result', async t => {
  const h=await mount(t);await h.options({preserveBrowsePosition:true});const held=deferred();h.response(()=>held.promise);
  await h.tick(30000);let accepted;await React.act(async()=>{accepted=h.result().reload();});
  h.response(async()=>({data:[item('latest')],error:null}));await h.resolve(held,{data:[item('stale')],error:null});await React.act(async()=>accepted);
  assert.equal(h.result().items[0].id,'latest');assert.equal(h.result().pendingItemCount,0);
});
test('same-user session rotation retires automatic additions and old reload callback', async t => {
  const h=await mount(t);await h.options({preserveBrowsePosition:true});h.rows([item('new'),item()]);await h.tick(30000);assert.equal(h.result().items.length,2);
  const old=h.result().reload;h.rows([item('current')]);await h.changeAccount({...owner(),sessionGeneration:'replacement'});
  const before=h.queries.length;await React.act(async()=>old());assert.equal(h.queries.length,before);assert.equal(h.result().items[0].id,'current');assert.equal(h.result().pendingItemCount,0);
});
test('bounded pinned-ID reads reject empty or oversized sets and preserve surface/live filters', async () => {
  const h=fixture(),reader=h.load('_lib/discoveryFeed.ts').readPublicDiscoveryFeedItems;
  for(const itemIds of [[],Array.from({length:51},(_,i)=>String(i)),['']])await assert.rejects(reader({itemIds}),/Invalid discovery items/);
  assert.equal(h.queries.length,0);await reader({itemIds:['live'],surface:'home',liveOnly:true});
  assert.ok(h.queries[0].operations.some(op=>op[1]==='discovery_surface'));assert.ok(h.queries[0].operations.some(op=>op[1]==='live_state'));
});
test('healthy transport still has complete30s fallback for a lost start/withdrawal hint', async t => {
  const h=await mount(t);await h.options({preserveBrowsePosition:true});h.healthy(true);
  const headCount=()=>h.queries.filter(q=>!q.operations.some(op=>op[0]==='in'&&op[1]==='id')).length;
  const before=headCount();h.rows([item('new'),item('live',{title:'Changed'})]);await h.tick(30000);
  assert.equal(headCount(),before+1);assert.equal(h.result().items[0].title,'Changed');assert.equal(h.result().pendingItemCount,0);
  assert.equal(h.result().items.map(row=>row.id).join(','),'live,new');
  h.rows([]);await h.tick(30000);assert.equal(h.result().items.length,0,'withdrawal does not wait for head fallback');
});
test('disconnected transport restores30s full reconciliation and hints bypass healthy head interval', async t => {
  const h=await mount(t);await h.options({preserveBrowsePosition:true});h.healthy(true);await h.tick(30000);
  h.rows([item('new'),item()]);h.advance(10000);await React.act(async()=>{for(let i=0;i<1000;i++)for(const fn of h.hints)fn();});
  // Hints arriving during the first read invalidate it; the retained trailing
  // read, not that possibly stale response, adopts the new head.
  await h.tick(500);
  assert.equal(h.result().items.length,2);assert.equal(h.result().pendingItemCount,0);const before=h.queries.length;h.healthy(false);await h.tick(30000);assert.equal(h.queries.length,before+2);
  await h.appState('background');const background=h.queries.length;await React.act(async()=>{for(const fn of h.hints)fn();});await h.tick(30000);assert.equal(h.queries.length,background);
});
test('actual mounted hook classifies combined public/Circle candidates once with bounded graph reads', async t => {
  const h=await mount(t,h=>{
    h.rows([item('public',{owner_user_id:other,channel_user_id:other,host_user_id:other}),item('circle',{visibility:'circle',access_type:'circle',owner_user_id:other,channel_user_id:other,host_user_id:other,creator_user_id:other})]);
    h.rankingRows({channel_followers:[{channel_user_id:other,follower_user_id:actor}],user_friendships:[{user_low_id:actor,user_high_id:other,status:'active'}]});
  });
  await h.options({includeCircle:true});const before=h.rankingQueries.length;await h.tick(30000);
  assert.equal(h.rankingQueries.length-before,5,'one combined classifier, not duplicate graph enrichment per lane');
  assert.equal(h.result().signals.followedChannelIds.join(','),other);assert.equal(h.result().signals.chillyCircleUserIds.join(','),other);
  h.rankingRows({channel_followers:[{channel_user_id:other,follower_user_id:actor}],user_friendships:[{user_low_id:actor,user_high_id:other,status:'active'}],channel_audience_blocks:[{channel_user_id:other,blocked_user_id:actor}]});
  await h.tick(30000);assert.equal(h.result().signals.followedChannelIds.length,0);assert.equal(h.result().signals.chillyCircleUserIds.length,0);
});
test('two mounted consumers of one account/query share actual source and ranking transport', async t => {
  const h=await mount(t,h=>h.rows([item('public',{owner_user_id:other,channel_user_id:other,host_user_id:other})]),2);
  assert.equal(h.queries.length,1);assert.equal(h.rankingQueries.length,5);
  const before=h.queries.length;h.advance(10000);await React.act(async()=>{for(const hint of h.hints)hint();});
  assert.equal(h.queries.length-before,1);assert.equal(h.rankingQueries.length,10);
});
for (const lane of ['public','circle']) test(`legacy ranked ${lane} reader uses the same bounded candidate classifier`, async () => {
  const h=fixture();h.rows([item('candidate',{owner_user_id:other,channel_user_id:other,host_user_id:other,creator_user_id:other,
    ...(lane==='circle'?{visibility:'circle',access_type:'circle'}:{})})]);
  const reader=lane==='public'?h.load('_lib/discoveryFeed.ts').readRankedPublicDiscoveryFeedItems:h.load('_lib/circleSpectatorFeed.ts').readRankedCircleSpectatorFeedItems;
  const result=await reader({liveOnly:true});assert.equal(result.items.length,1);assert.equal(h.queries.length,1);assert.equal(h.rankingQueries.length,5);
});

const titleId = '30000000-0000-4000-8000-000000000003';
test('legacy unkeyed invalidation conservatively waits for a clean canonical read window', async t => {
  const h = await mount(t);
  const first = h.result().items[0].id;
  for (let i = 0; i < 30; i++) {
    const held = deferred(); h.response(() => held.promise);
    h.advance(1000);
    await React.act(async () => { for (const hint of h.hints) hint(); });
    h.advance(100);
    await React.act(async () => { for (const hint of h.hints) hint(); });
    await h.resolve(held, { data: [item(`new-${i}`)], error: null });
    assert.equal(h.result().items[0].id, first, 'hinted in-flight snapshot is not committed');
  }
  h.response(async () => ({ data: [item('after-quiet')], error: null }));
  await h.tick(400);
  assert.equal(h.result().items[0].id, 'after-quiet');
});
async function mountDiscoverySurfaces(t, pushEnabled) {
  const h = fixture({ actualUpdates: true, pushEnabled }); h.rows([]);
  const useFeed = h.load('_lib/useLiveDiscoveryFeed.ts').useLiveDiscoveryFeed;
  const useProfile = h.load('_lib/useProfileLiveState.ts').useProfileLiveState;
  const useCounts = h.load('_lib/usePublicPartyRoomCounts.ts').usePublicPartyRoomCounts;
  const reconcile = h.load('_lib/profileFeedDiscovery.ts').reconcileProfileFeedDiscovery;
  let results, paged = [];
  function Host() {
    results = {
      home: useFeed({ surface: 'home', liveOnly: true, includeCircle: true, preserveBrowsePosition: true, limit: 8 }),
      live: useFeed({ surface: 'home', liveOnly: true, includeCircle: true, preserveBrowsePosition: true, limit: 40 }),
      explore: useFeed({ surface: 'home', liveOnly: true, includeCircle: false, preserveBrowsePosition: true, limit: 40 }),
      platform: useFeed({ surface: 'channel', creatorUserId: actor, liveOnly: true, includeCircle: false, preserveBrowsePosition: true, limit: 24 }),
      profile: useProfile(actor, true), exploreCounts: useCounts([titleId]), titleCounts: useCounts([titleId]),
      suggestions: useFeed({ surface: 'profile', limit: 8 }),
    };
    results.profileCards = reconcile(paged, results.suggestions.items, actor);
    return null;
  }
  const root = createRoot(container()), render = () => React.act(async () => root.render(React.createElement(Host)));
  await render(); t.after(() => React.act(async () => root.unmount()));
  return { ...h, results: () => results, render, paged: value => { paged = value; },
    currentRows(rows, count = 0) {
      h.rows(rows); h.countResponse(() => ({ data: { total: count, byTitle: count ? [{ titleId, count }] : [] }, error: null }));
    },
    hint: (scope = 'public', keys) => React.act(async () => { for (const channel of h.channels) {
      const viewer = channel.topic.startsWith('discovery:v1:viewer:');
      if (scope === 'all' || (scope === 'viewer' ? viewer : !viewer)) channel.hint(keys);
    } }),
    tick: ms => React.act(async () => {
      h.advance(ms);
      for (const [fn, delay] of [...h.timeouts]) if (delay === ms) { h.timeouts.delete(fn); fn(); }
      for (const [fn, delay] of [...h.intervals]) if (delay === ms) fn();
    }),
    resolve: (held, value) => React.act(async () => held.resolve(value)),
    changeAccount: value => React.act(async () => { h.account(value); root.render(React.createElement(Host)); }),
  };
}
const feedSurfaces = ['home', 'live', 'explore', 'platform', 'profile'];
function assertSurfaceIds(h, ids) {
  for (const surface of feedSurfaces) assert.deepEqual(Array.from(h.results()[surface].items, row => row.id).sort(), [...ids].sort(), surface);
}
function assertSurfaceCounts(h, count) {
  for (const surface of ['exploreCounts', 'titleCounts']) assert.equal(h.results()[surface].counts[titleId]?.liveRoomCount ?? 0, count, surface);
}
test('continuous keyed global churn makes progress across mounted views before hints stop, without reviving withdrawn rows', async t => {
  const h = await mountDiscoverySurfaces(t, true);
  await h.tick(100); await h.tick(400);
  for (let round = 0; round < 12; round++) {
    const held = deferred(), heldCount = deferred(), id = `continuous-start-${round}`;
    h.response(() => held.promise); h.countResponse(() => heldCount.promise);
    h.advance(1000); await h.hint('public', [hintKey(id)]); await h.tick(100);
    // The global stream never gives the read a clean window. Only unrelated
    // rows and one explicitly withdrawn row change during this request.
    await h.hint('public', [hintKey(`unrelated-${round}`), hintKey('withdrawn')]); await h.tick(100);
    await h.resolve(held, { data: [item(id), item('withdrawn')], error: null });
    await h.resolve(heldCount, { data: { total: round + 1, byTitle: [{ titleId, count: round + 1 }],
      scopes: [{ titleId, key: hintKey(titleId) }] }, error: null });
    assertSurfaceIds(h, [id]); assertSurfaceCounts(h, round + 1);
  }
  // A title-specific privacy withdrawal cannot restore its stale held count,
  // while an unrelated eligible live still progresses in the same snapshot.
  const held = deferred(), heldCount = deferred();
  h.response(() => held.promise); h.countResponse(() => heldCount.promise);
  h.advance(1000); await h.hint('public', [hintKey('last-start')]); await h.tick(100);
  await h.hint('viewer', [hintKey('withdrawn'), hintKey(titleId)]); await h.tick(100);
  await h.resolve(held, { data: [item('last-start'), item('withdrawn')], error: null });
  await h.resolve(heldCount, { data: { total: 99, byTitle: [{ titleId, count: 99 }], scopes: [{ titleId, key: hintKey(titleId) }] }, error: null });
  assertSurfaceIds(h, ['last-start']); assertSurfaceCounts(h, 0);
});

test('relationship-only key withdrawal fences held Circle rows but a later canonical rejoin can return unchanged source', async t => {
  const h = await mount(t); await h.options({ includeCircle: true });
  const row = item('circle', { visibility: 'circle', access_type: 'circle' }), held = deferred();
  h.response(() => held.promise); h.advance(1000);
  await React.act(async () => { for (const fn of h.hints) fn({ keys: [hintKey('unrelated')] }); });
  await React.act(async () => { for (const fn of h.hints) fn({ keys: [hintKey('circle')] }); });
  await h.resolve(held, { data: [row], error: null }); assert.equal(h.result().items.length, 0);
  h.response(async () => ({ data: [row], error: null })); await h.tick(500);
  assert.equal(h.result().items[0]?.id, 'circle', 'fresh current-server authorization, not a permanent source-revision tombstone');
});
test('a consumer mounting after a withdrawal cannot join another consumers pre-hint shared source flight', async t => {
  const h=fixture({actualUpdates:true,pushEnabled:true});h.rows([]);
  const useFeed=h.load('_lib/useLiveDiscoveryFeed.ts').useLiveDiscoveryFeed, results={};
  function Host({name}) { results[name]=useFeed({surface:'home',liveOnly:true,limit:8});return null; }
  let second=false;
  const root=createRoot(container()),render=()=>React.act(async()=>root.render(React.createElement(React.Fragment,null,
    React.createElement(Host,{name:'first',key:'first'}),second?React.createElement(Host,{name:'late',key:'late'}):null)));
  t.after(()=>React.act(async()=>root.unmount()));await render();
  const tick=ms=>React.act(async()=>{h.advance(ms);for(const [fn,delay] of [...h.timeouts])if(delay===ms){h.timeouts.delete(fn);fn();}});
  await tick(100);await tick(400);
  const held=deferred();h.response(()=>held.promise);h.advance(1000);
  await React.act(async()=>h.channels[0].hint([hintKey('start')]));await tick(100);
  const before=h.queries.length;
  await React.act(async()=>h.channels[0].hint([hintKey('withdrawn')]));await tick(100);
  h.response(async()=>({data:[],error:null}));second=true;await render();
  assert.equal(h.queries.length,before+1,'post-hint mount owns a fresh source snapshot, not the pre-hint flight');
  await React.act(async()=>held.resolve({data:[item('withdrawn')],error:null}));
  assert.equal(results.first.items.length,0);assert.equal(results.late.items.length,0);
});
test('raw scoped hint fences held rows before its coalesced refresh callback, without vetoing unrelated rows', async t => {
  const h=await mountDiscoverySurfaces(t,true);await h.tick(100);await h.tick(400);
  const held=deferred();h.response(()=>held.promise);h.advance(1000);
  await h.hint('public',[hintKey('start')]);await h.tick(100);
  await h.hint('public',[hintKey('withdrawn')]); // Do NOT advance the100ms callback timer.
  await h.resolve(held,{data:[item('safe'),item('withdrawn')],error:null});
  assertSurfaceIds(h,['safe']);
});

test('actual Circle adapter retains scoped keys and converges during continuous unrelated public churn', async t => {
  const h=await mountDiscoverySurfaces(t,true);await h.tick(100);await h.tick(400);
  for(let i=0;i<8;i++) {
    const held=deferred(),id=`circle-${i}`;h.response(()=>held.promise);h.advance(1000);
    await h.hint('viewer',[hintKey(id)]);await h.tick(100);
    await h.hint('public',[hintKey(`public-unrelated-${i}`)]);await h.tick(100);
    await h.resolve(held,{data:[item(id,{visibility:'circle',access_type:'circle'})],error:null});
    for(const surface of ['home','live']) {
      assert.equal(h.results()[surface].circleItems[0]?.id,id,surface);
      assert.equal(h.results()[surface].circleItems[0]?.discovery_hint_key,hintKey(id));
    }
    for(const surface of ['explore','platform','profile'])assert.equal(h.results()[surface].items.length,0,'public-only lane remains private-safe');
  }
});
test('all mounted discovery surfaces and title counts poll starts/settings/end without any push flag or manual reload', async t => {
  const h = await mountDiscoverySurfaces(t, false);
  assert.equal(h.channels.length, 0); assertSurfaceIds(h, []);
  h.currentRows([item('started', { title: 'Original' })], 1); await h.tick(30000);
  assertSurfaceIds(h, ['started']); assertSurfaceCounts(h, 1);
  h.currentRows([item('started', { title: 'Host changed the name' })], 1); await h.tick(30000);
  for (const surface of feedSurfaces) assert.equal(h.results()[surface].items[0].title, 'Host changed the name', surface);
  h.currentRows([item('started', { visibility: 'private', is_publicly_discoverable: false })]); await h.tick(30000);
  assertSurfaceIds(h, []); assertSurfaceCounts(h, 0);
  h.currentRows([item('replacement')], 1); await h.tick(30000); assertSurfaceIds(h, ['replacement']);
  h.currentRows([item('replacement', { ended_at: '2020-01-01T00:00:00Z' })]); await h.tick(30000);
  assertSurfaceIds(h, []); assertSurfaceCounts(h, 0);
});
test('real shared scoped Broadcast updates every mounted public consumer; only opaque private-channel hints are needed', async t => {
  const h = await mountDiscoverySurfaces(t, true);
  assert.deepEqual(h.channels.map(channel => channel.topic).sort(), [`discovery:v1:creator:${actor}`, 'discovery:v1:surface:home', 'discovery:v1:surface:profile', `discovery:v1:viewer:${actor}`]);
  assert.ok(h.channels.every(channel => channel.options.config.private === true));
  await h.tick(100); await h.tick(400); // Initial subscription reconciliation +500ms reader budget.
  h.advance(10000); h.currentRows([item('started')], 1);
  await h.hint(); assertSurfaceIds(h, []); await h.tick(100);
  assertSurfaceIds(h, ['started']); assertSurfaceCounts(h, 1);
  h.advance(500); h.currentRows([item('second-start'), item('started')], 2); await h.hint(); await h.tick(100);
  assertSurfaceIds(h, ['started','second-start']); assertSurfaceCounts(h, 2);
  for (const surface of feedSurfaces) assert.equal(h.results()[surface].pendingItemCount, 0, 'no manual New Live Streams gate');
  h.advance(10000); h.currentRows([item('started', { title: 'Updated' })], 1); await h.hint(); await h.tick(100);
  for (const surface of feedSurfaces) assert.equal(h.results()[surface].items[0].title, 'Updated', surface);
  h.advance(10000); h.currentRows([]); await h.hint(); await h.tick(100);
  assertSurfaceIds(h, []); assertSurfaceCounts(h, 0);
});
test('own-viewer hints update authorized Circle immediately without any public hint; reconnect and bursts reconcile all views', async t => {
  const h = await mountDiscoverySurfaces(t, true);
  await h.tick(100); await h.tick(400); h.advance(500);
  h.currentRows([item('anchor')], 1); await h.hint(); await h.tick(100); assertSurfaceIds(h, ['anchor']);
  h.currentRows([item('anchor'), item('circle-new', { visibility: 'circle', access_type: 'circle', is_publicly_discoverable: false })], 1);
  await h.hint('viewer'); await h.tick(100); await h.tick(400);
  for (const surface of ['home','live']) assert.deepEqual(Array.from(h.results()[surface].items, row=>row.id), ['anchor','circle-new']);
  for (const surface of ['explore','platform','profile']) assert.deepEqual(Array.from(h.results()[surface].items, row=>row.id), ['anchor']);
  assertSurfaceCounts(h, 1);
  h.currentRows([item('anchor')], 1); await h.hint('viewer'); await h.tick(100); await h.tick(400);
  assertSurfaceIds(h, ['anchor']); // Former audience gets no card/room payload, only current revalidation.
  h.advance(500); h.currentRows([item('reconnected')], 1);
  await React.act(async()=>{for(const channel of h.channels){channel.status('CLOSED');channel.status('SUBSCRIBED');}});
  await h.tick(100); await h.tick(500); assertSurfaceIds(h, ['reconnected']);
  h.advance(500); h.currentRows([item('burst-start'),item('reconnected')],2); const before=h.queries.length, countBefore=h.countReads.length;
  await React.act(async()=>{for(let i=0;i<1000;i++)for(const channel of h.channels)channel.hint();});
  await h.tick(100); await h.tick(500);
  assertSurfaceIds(h, ['reconnected','burst-start']); assertSurfaceCounts(h,2);
  assert.ok(h.queries.length-before<=32, '1000 events cannot create1000 canonical reads; each query remains single-flight with one trailing reconciliation');
  assert.ok(h.countReads.length-countBefore<=4, 'two count consumers each perform at most one read plus one trailing reconciliation');
});
test('automatic live additions stay bounded while retaining leading browse anchors', async t => {
  const h=await mount(t);await h.options({preserveBrowsePosition:true,limit:8});let rows=[item()];
  for(let generation=0;generation<9;generation++) {
    const additions=Array.from({length:8},(_,index)=>item(`new-${generation}-${index}`));rows=[...additions,...rows];h.rows(rows);await h.tick(30000);
    assert.ok(h.result().items.length<=50);assert.equal(h.result().items[0].id,'live');
    assert.ok(additions.every(row=>h.result().items.some(visible=>visible.id===row.id)),'latest starts never wait behind a tap');
  }
});
test('actual Explore and Home Circle live selectors do not truncate automatically appended starts', () => {
  const select = (file, variable, values) => {
    const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration;
    const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===variable)declaration=node;ts.forEachChild(node,visit);};visit(ast);
    assert.ok(declaration,variable);return vm.runInNewContext(ts.transpileModule(`result=${declaration.initializer.getText(ast)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
      {result:null,useMemo:fn=>fn(),...values});
  };
  const rows=Array.from({length:9},(_,i)=>item(`start-${i}`));
  const explore=select('app/(tabs)/explore.tsx','liveDiscoveryItems',{liveDiscovery:{items:rows},debouncedSearchQuery:'',matchesTextSearch:()=>true});
  assert.equal(explore.length,9);assert.equal(explore.at(-1).id,'start-8');
  const circle=select('app/(tabs)/index.tsx','circleLiveSpectatorItems',{liveDiscovery:{circleItems:rows}});
  assert.equal(circle.length,9);assert.equal(circle.at(-1).id,'start-8');
});
test('existing browse anchors retain order while additions, replacement and Circle revocation update without taps', async t => {
  const h = await mountDiscoverySurfaces(t, false);
  h.currentRows([item('anchor')], 1); await h.tick(30000);
  h.currentRows([item('new'), item('anchor')], 2); await h.tick(30000);
  for (const surface of feedSurfaces.filter(value => value !== 'profile')) {
    assert.deepEqual(Array.from(h.results()[surface].items, row => row.id), ['anchor','new'], surface);
    assert.equal(h.results()[surface].pendingItemCount, 0, surface);
  }
  assert.equal(h.results().profile.items.length, 2); assertSurfaceCounts(h, 2);
  h.currentRows([item('new')], 1); await h.tick(30000); assertSurfaceIds(h, ['new']);
  h.currentRows([item('authorized-circle', { visibility: 'circle', access_type: 'circle' })]); await h.tick(30000);
  for (const surface of ['home', 'live']) assert.deepEqual(Array.from(h.results()[surface].items, row => row.id), ['authorized-circle']);
  for (const surface of ['explore', 'platform', 'profile']) assert.equal(h.results()[surface].items.length, 0);
  assertSurfaceCounts(h, 0);
  h.currentRows([]); await h.tick(30000); assertSurfaceIds(h, []); // Canonical view removes an audience member.
});
test('privacy hint during held reads cannot flash stale cards/counts across mounted views; account rotation retires all', async t => {
  const h = await mountDiscoverySurfaces(t, true);
  await h.tick(100); await h.tick(400); h.advance(10000);
  const held = deferred(), heldCount = deferred(); h.response(() => held.promise); h.countResponse(() => heldCount.promise);
  await h.hint(); await h.tick(100);
  h.response(async () => ({ data: [], error: null })); h.currentRows([]);
  await h.hint(); await h.tick(100);
  await h.resolve(held, { data: [item('now-private')], error: null });
  await h.resolve(heldCount, { data: { total: 1, byTitle: [{ titleId, count: 1 }] }, error: null });
  assertSurfaceIds(h, []); assertSurfaceCounts(h, 0);
  await h.tick(400); assertSurfaceIds(h, []); assertSurfaceCounts(h, 0);
  h.response(null); h.currentRows([item('current')], 1); await h.tick(30000); assertSurfaceIds(h, ['current']);
  h.currentRows([]); await h.changeAccount({ ...owner(), sessionGeneration: 'new-session' });
  assertSurfaceIds(h, []); assertSurfaceCounts(h, 0);
});
test('own Profile paged suggestions never override current public discovery after rename, Off, ended or account changes', async t => {
  const h = await mountDiscoverySurfaces(t, false);
  const external = (id, extra = {}) => item(id, { owner_user_id: other, channel_user_id: other, host_user_id: other, creator_user_id: other, ...extra });
  const posts = Array.from({ length: 10 }, (_, i) => ({ id: `post${i}`, type: 'my_post', post: { id: `post${i}` } }));
  const old = { id: 'suggested-old', type: 'spectator_entry', discoveryItem: external('old', { title: 'Stale title' }) };
  h.paged([...posts, old]); await h.render();
  assert.equal(h.results().profileCards.length, 10, 'cached page alone is not current discovery authority');
  h.currentRows([external('old', { title: 'Current title' })]); await h.tick(30000);
  const cards = () => h.results().profileCards.filter(row => 'discoveryItem' in row);
  assert.equal(cards().length, 1); assert.equal(cards()[0].discoveryItem.title, 'Current title');
  assert.deepEqual(h.results().profileCards.filter(row => 'post' in row).map(row => row.id), posts.map(row => row.id));
  for (const replacement of [external('old', { visibility: 'private', is_publicly_discoverable: false }), external('old', { live_state: 'ended', is_publicly_discoverable: false, ended_at: '2020-01-01T00:00:00Z' })]) {
    h.currentRows([replacement]); await h.tick(30000); assert.equal(cards().length, 0);
  }
  h.currentRows([external('replacement')]); await h.tick(30000); assert.equal(cards()[0].discoveryItem.id, 'replacement');
  const held = deferred(); h.response(() => held.promise); await h.tick(30000);
  h.response(async () => ({ data: [], error: null })); await h.changeAccount({ ...owner(), sessionGeneration: 'replacement-session' });
  await h.resolve(held, { data: [external('old')], error: null }); assert.equal(cards().length, 0);
  const route = fs.readFileSync('app/profile/[userId].tsx', 'utf8');
  assert.match(route, /readOwnProfileFeedPage\(\{[^\n]+includeDiscovery: false/);
  assert.match(route, /reconcileProfileFeedDiscovery\(feedPages\.items[\s\S]*?profileSuggestedDiscovery\.items, userId\)/);
});
