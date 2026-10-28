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
const actor = '10000000-0000-4000-8000-000000000001', other = '20000000-0000-4000-8000-000000000002';
const owner = (id = actor, generation = 'session') => ({ userId: id, accountId: id, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const sameOwner = (a, b) => !!a && !!b && ['userId', 'accountId', 'sessionGeneration', 'restoreOnly'].every(k => a[k] === b[k]);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const event = (id = 'event', extra = {}) => ({ id, host_user_id: actor, event_title: id, event_type: 'live_first', visibility: 'public', status: 'scheduled', starts_at: '2026-10-28T12:00:00Z', ends_at: null, replay_policy: 'none', reminder_ready: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...extra });

function fixture() {
  let authority = owner(), snapshot = authority, status = 'active', focused = true, response, rows = [event()];
  let now = Date.parse('2026-10-28T10:00:00Z'), timerId = 0;
  const queries = [], timers = new Map(), listeners = new Set(), hints = new Set(), subscriptions = [], cache = new Map();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const app = { currentState: 'active', addEventListener: (_, f) => { listeners.add(f); return { remove: () => listeners.delete(f) }; } };
  let database = { from(table) {
    const operations = [], filters = [], ordering = []; let max = Infinity, signal;
    const q = { select: () => q,
      eq(key, value) { operations.push(['eq', key, value]); filters.push(row => row[key] === value); return q; },
      gt(key, value) { operations.push(['gt', key, value]); filters.push(row => row[key] != null && Date.parse(row[key]) > Date.parse(value)); return q; },
      lte(key, value) { operations.push(['lte', key, value]); filters.push(row => row[key] != null && Date.parse(row[key]) <= Date.parse(value)); return q; },
      in(key, values) { operations.push(['in', key, values]); filters.push(row => values.includes(row[key])); return q; },
      order(key, config) { operations.push(['order', key, config]); ordering.push([key, config]); return q; },
      limit(value) { operations.push(['limit', value]); max = value; return q; },
      abortSignal(value) { signal = value; return q; },
      async returns() {
        const observed = { table, operations, signal }; queries.push(observed);
        if (response) return response(observed);
        const selected = rows.filter(row => filters.every(filter => filter(row))).sort((a, b) => {
          for (const [key, config] of ordering) {
            if (a[key] === b[key]) continue;
            return (a[key] < b[key] ? -1 : 1) * (config.ascending ? 1 : -1);
          }
          return 0;
        });
        return { data: selected.slice(0, max), error: null };
      },
    }; return q;
  } };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}, context = { exports, console, AbortController, Date: Clock,
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id),
      require(name) {
        if (name === 'react') return React;
        if (name === '@react-navigation/native') return { useIsFocused: () => focused };
        if (name === 'react-native') return { AppState: app };
        if (name === './session') return { useSession: () => ({ authority, authorityStatus: status }) };
        if (name === './accountSessionAuthority') return { getCurrentAccountSessionAuthoritySnapshot: () => snapshot, sameAccountSessionAuthority: sameOwner };
        if (name === './supabase') return { supabase: database };
        if (name === './actionSingleFlight.mjs') return {};
        if (name === './liveEvents') return load('_lib/liveEvents.ts');
        if (name === './sharedLiveUpdates') return { getDiscoveryLiveUpdateInterest: options => options.creatorUserIds?.length === 1 ? { creatorUserId: options.creatorUserIds[0] } : { surface: 'home' }, subscribeToLiveUpdates: (binding, domain, listener, interest) => {
          assert.equal(domain, 'discovery'); const record = { binding, listener, interest, active: true }; subscriptions.push(record); hints.add(listener);
          return () => { record.active = false; hints.delete(listener); };
        } };
        throw new Error(name);
      },
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
    cache.set(file, exports); return exports;
  }
  return { load, queries, app, listeners, hints, subscriptions, timers,
    rows: value => { rows = value; }, response: value => { response = value; }, database: value => { database = value; },
    account: (value, nextStatus = value ? 'active' : 'unknown') => { authority = value; snapshot = value; status = nextStatus; },
    snapshot: value => { snapshot = value; }, focus: value => { focused = value; },
    advance: async ms => {
      const end = now + ms;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]);
        await React.act(async () => { due[1].fn(); });
      }
      now = end;
    },
  };
}

test('production upcoming query filters terminal/private rows before limit and retains late scheduled truth', async () => {
  const h = fixture();
  h.rows([...Array.from({ length: 60 }, (_, i) => event(`retired-${i}`, { status: ['ended', 'canceled', 'draft', 'expired', 'replay_available', 'live_now'][i % 6], starts_at: '2020-01-01T00:00:00Z' })),
    event('private', { visibility: 'private', starts_at: '2020-01-01T00:00:00Z' }), event('missing', { starts_at: null }),
    event('late', { starts_at: '2026-10-28T09:00:00Z' }), event('future')]);
  const result = await h.load('_lib/liveEvents.ts').readPublicUpcomingEventSummaries({ limit: 2 });
  assert.equal(result.map(e => e.id).join(','), 'future,late');
  assert.equal(result[1].isUpcoming, false); assert.equal(result[1].status, 'scheduled'); assert.equal(result[1].isLiveNow, false);
  const operations = h.queries[0].operations, limited = operations.findIndex(op => op[0] === 'limit');
  assert.ok(operations.findIndex(op => op[0] === 'eq' && op[1] === 'status') < limited);
  assert.ok(operations.findIndex(op => op[0] === 'gt' && op[1] === 'starts_at') < limited);
});
test('more than a page of stale scheduled events cannot swallow future events or invent terminal status', async () => {
  const h = fixture();
  h.rows([...Array.from({ length: 60 }, (_, i) => event(`late-${i}`, { starts_at: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 60000).toISOString() })), event('future')]);
  const result = await h.load('_lib/liveEvents.ts').readPublicUpcomingEventSummaries({ limit: 32 });
  assert.equal(result[0].id, 'future'); assert.equal(result.length, 9);
  assert.equal(result[1].id, 'late-59'); assert.equal(result.at(-1).id, 'late-52');
  assert.ok(result.slice(1).every(e => e.status === 'scheduled' && !e.isLiveNow));
  const buckets = h.load('_lib/liveTabDiscoveryBuckets.ts').buildLiveTabDiscoveryBuckets([], result);
  assert.equal(buckets.upcomingEvents[0].id, 'future'); assert.equal(buckets.awaitingEvents.length, 8);
  assert.equal(h.queries.length, 2);
});
test('production upcoming query has stable ID ties, explicit host scope and bounded limits', async () => {
  const h = fixture(), reader = h.load('_lib/liveEvents.ts').readPublicUpcomingEventSummaries;
  h.rows([event('z'), event('a'), event('other-host', { host_user_id: other })]);
  assert.equal((await reader({ hostUserIds: [actor], limit: 1 }))[0].id, 'a');
  const before = h.queries.length;
  for (const hostUserIds of [[], [''], ['not-a-host'], [')or(visibility.eq.private']]) await assert.rejects(reader({ hostUserIds }), /Invalid upcoming/);
  assert.equal(h.queries.length, before);
  await reader({ limit: Infinity }); assert.deepEqual(h.queries.at(-2).operations.find(op => op[0] === 'limit'), ['limit', 50]);
  assert.deepEqual(h.queries.at(-1).operations.find(op => op[0] === 'limit'), ['limit', 8]);
});
test('rescheduling across concurrent lane reads deduplicates by newest canonical row', async () => {
  for (const newestLane of ['future', 'awaiting']) {
    const h = fixture();
    h.response(async query => {
      const future = query.operations.some(op => op[0] === 'gt');
      return { data: [event('rescheduled', {
        starts_at: future ? '2026-10-29T12:00:00Z' : '2026-10-28T09:00:00Z',
        updated_at: future === (newestLane === 'future') ? '2026-10-28T10:00:01Z' : '2026-10-28T10:00:00Z',
      })], error: null };
    });
    const result = await h.load('_lib/liveEvents.ts').readPublicUpcomingEventSummaries();
    assert.equal(result.length, 1); assert.equal(result[0].isUpcoming, newestLane === 'future');
  }
});
test('same-millisecond PostgreSQL revisions choose the latest row independent of lane or completion order', async () => {
  for (const newestLane of ['future', 'awaiting']) for (const firstLane of ['future', 'awaiting']) {
    const h = fixture(), future = deferred(), awaiting = deferred();
    h.response(query => query.operations.some(op => op[0] === 'gt') ? future.promise : awaiting.promise);
    const read = h.load('_lib/liveEvents.ts').readPublicUpcomingEventSummaries();
    const result = lane => ({ data: [event('rescheduled-micros', {
      starts_at: lane === 'future' ? '2026-10-29T12:00:00.000001Z' : '2026-10-28T09:00:00.000002Z',
      updated_at: lane === newestLane ? '2026-10-28T10:00:00.123999+00:00' : '2026-10-28T10:00:00.123001+00:00',
    })], error: null });
    (firstLane === 'future' ? future : awaiting).resolve(result(firstLane));
    await Promise.resolve();
    const lastLane = firstLane === 'future' ? 'awaiting' : 'future';
    (lastLane === 'future' ? future : awaiting).resolve(result(lastLane));
    const rows = await read; assert.equal(rows.length, 1); assert.equal(rows[0].isUpcoming, newestLane === 'future');
  }
});
test('same-millisecond scheduled starts retain exact PostgreSQL time order before ID ties', async () => {
  const h = fixture(); h.response(async query => ({ data: query.operations.some(op => op[0] === 'gt')
    ? [event('a-later', { starts_at: '2026-10-29T12:00:00.123999Z' }), event('z-earlier', { starts_at: '2026-10-29T12:00:00.123001Z' })] : [], error: null }));
  const result = await h.load('_lib/liveEvents.ts').readPublicUpcomingEventSummaries();
  assert.equal(result.map(row => row.id).join(','), 'z-earlier,a-later');
});
test('real PostgREST request binds public scheduled selection, stable order and abort signal', async () => {
  const { PostgrestClient } = require('@supabase/postgrest-js'), requests = [], h = fixture(), controller = new AbortController();
  h.database(new PostgrestClient('https://offline.invalid/rest/v1', { fetch: async (url, options) => {
    requests.push({ url: new URL(url), signal: options.signal }); return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  } }));
  await h.load('_lib/liveEvents.ts').readPublicUpcomingEventSummaries({ hostUserIds: [actor], limit: 32, signal: controller.signal });
  const query = requests[0].url.searchParams;
  assert.equal(query.get('visibility'), 'eq.public'); assert.equal(query.get('status'), 'eq.scheduled');
  assert.equal(query.get('starts_at'), 'gt.2026-10-28T10:00:00.000Z'); assert.equal(query.get('order'), 'starts_at.asc.nullslast,id.asc');
  assert.equal(query.get('host_user_id'), `in.(${actor})`); assert.equal(query.get('limit'), '32'); assert.equal(requests[0].signal, controller.signal);
  const awaiting = requests[1].url.searchParams;
  assert.equal(awaiting.get('starts_at'), 'lte.2026-10-28T10:00:00.000Z'); assert.equal(awaiting.get('order'), 'starts_at.desc.nullslast,id.asc');
  assert.equal(awaiting.get('status'), 'eq.scheduled'); assert.equal(awaiting.get('visibility'), 'eq.public');
  assert.equal(awaiting.get('limit'), '8'); assert.equal(requests[1].signal, controller.signal);
});
test('production upcoming reader reports errors/null distinctly from successful empty and rechecks returned visibility/status', async () => {
  const h = fixture(), read = h.load('_lib/liveEvents.ts').readPublicUpcomingEventSummaries;
  for (const result of [{ data: null, error: new Error('offline') }, { data: null, error: null }]) {
    h.response(async () => result); await assert.rejects(read(), /Upcoming events could not be loaded/);
  }
  h.response(async () => ({ data: [], error: null })); assert.equal((await read()).length, 0);
  h.response(async () => ({ data: [event('private', { visibility: 'private' }), event('canceled', { status: 'canceled' }), event('invalid', { starts_at: 'nonsense' }), event()], error: null }));
  assert.equal((await read()).map(e => e.id).join(','), 'event');
});
test('production Live buckets retain a delayed scheduled event but never synthesize live state', () => {
  const h = fixture(), { parseCreatorEventRow, buildCreatorEventSummary } = h.load('_lib/liveEvents.ts');
  const summaries = [event('late', { starts_at: '2020-01-01T00:00:00Z' }), event('future'), event('canceled', { status: 'canceled' }), event('ended', { status: 'ended' })]
    .map(row => buildCreatorEventSummary(parseCreatorEventRow(row)));
  const buckets = h.load('_lib/liveTabDiscoveryBuckets.ts').buildLiveTabDiscoveryBuckets([], summaries);
  assert.equal(buckets.upcomingEvents.map(e => e.id).join(','), 'future'); assert.equal(buckets.awaitingEvents.map(e => e.id).join(','), 'late'); assert.equal(buckets.liveEvents.length, 0);
});

async function mount(t, setup = () => {}) {
  const h = fixture(); setup(h); let result, options = { limit: 32 };
  const hook = h.load('_lib/useLiveUpcomingEvents.ts').useLiveUpcomingEvents;
  function Host() { result = hook(options); return null; }
  const root = createRoot(container()), render = () => React.act(async () => { root.render(React.createElement(Host)); });
  await render(); t.after(() => React.act(async () => root.unmount()));
  return { ...h, result: () => result, render,
    options: async value => { options = { ...options, ...value }; await render(); },
    changeAccount: async (value, status) => { h.account(value, status); await render(); },
    changeFocus: async value => { h.focus(value); await render(); },
    appState: async state => React.act(async () => { h.app.currentState = state; for (const f of h.listeners) f(state); }),
    hint: async (count = 1) => React.act(async () => { for (let i = 0; i < count; i++) for (const listener of h.hints) listener(); }),
    resolve: async (d, value) => React.act(async () => { d.resolve(value); }),
  };
}
test('1000 hints coalesce at the 10s minimum; absent hints polling remains 30s from the last read', async t => {
  const h = await mount(t); assert.equal(h.queries.length, 2);
  await h.hint(1000); assert.equal(h.timers.size, 1);
  await h.advance(9999); assert.equal(h.queries.length, 2);
  h.rows([event('changed')]); await h.advance(1); assert.equal(h.queries.length, 4); assert.equal(h.result().items[0].id, 'changed');
  assert.equal(h.timers.size, 1); await h.advance(29999); assert.equal(h.queries.length, 4);
  await h.advance(1); assert.equal(h.queries.length, 6);
  await h.hint(1000); assert.equal(h.queries.length, 6); assert.equal(h.timers.size, 1);
  await React.act(async () => h.result().reload()); assert.equal(h.queries.length, 8);
});
test('hints during a held read retain one trailing refresh without a timer loop or concurrent reads', async t => {
  const h = await mount(t), held = deferred(); await h.advance(5000); h.response(() => held.promise);
  await h.hint(); await h.advance(5000); assert.equal(h.queries.length, 4);
  await h.hint(1000); assert.equal(h.timers.size, 2, 'one read deadline plus one trailing hint');
  await h.advance(10000); assert.equal(h.queries.length, 4); assert.equal(h.timers.size, 1, 'due hint waits on the request, not a zero-delay loop');
  h.response(async () => ({ data: [event('after-hint')], error: null }));
  await h.resolve(held, { data: [event('before-hint')], error: null }); assert.equal(h.timers.size, 1);
  await h.advance(0); assert.equal(h.queries.length, 6); assert.equal(h.result().items[0].id, 'after-hint');
  assert.equal(h.timers.size, 1); await h.advance(29999); assert.equal(h.queries.length, 6);
});
test('mounted fallback recovers lost hints and applies rescheduling/cancellation/end/private transitions', async t => {
  const h = await mount(t);
  h.rows([event('event', { starts_at: '2026-10-29T12:00:00Z' })]); await h.advance(30000);
  assert.equal(h.result().items[0].startsAt, '2026-10-29T12:00:00.000Z');
  for (const change of [{ status: 'canceled' }, { status: 'ended' }, { visibility: 'private' }, { visibility: 'circle' }, { status: 'live_now' }]) {
    h.rows([event('event', change)]); await h.advance(30000); assert.equal(h.result().items.length, 0);
    h.rows([event()]); await h.advance(30000); assert.equal(h.result().items.length, 1);
  }
  h.rows([]); await h.advance(30000); assert.equal(h.result().items.length, 0);
});
test('scheduled start time moves between bounded lanes without synthesizing live or canceled state', async t => {
  const h = await mount(t, h => h.rows([event('starting', { starts_at: '2026-10-28T10:00:10Z' })]));
  assert.equal(h.result().items[0].isUpcoming, true);
  await h.advance(30000);
  const item = h.result().items[0]; assert.equal(item.id, 'starting'); assert.equal(item.isUpcoming, false);
  assert.equal(item.status, 'scheduled'); assert.equal(item.isLiveNow, false);
  const buckets = h.load('_lib/liveTabDiscoveryBuckets.ts').buildLiveTabDiscoveryBuckets([], h.result().items);
  assert.equal(buckets.upcomingEvents.length, 0); assert.equal(buckets.awaitingEvents[0].id, 'starting');
});
test('mounted foreground/focus reconnect reconciles without background subscriptions or reads', async t => {
  const h = await mount(t); await h.appState('background'); assert.equal(h.hints.size, 0); assert.equal(h.result().items.length, 0);
  const before = h.queries.length; await h.advance(90000); assert.equal(h.queries.length, before);
  h.rows([event('missed')]); await h.appState('active'); assert.equal(h.result().items[0].id, 'missed'); assert.equal(h.hints.size, 1);
  await h.changeFocus(false); assert.equal(h.hints.size, 0); const blurred = h.queries.length;
  await h.advance(90000); assert.equal(h.queries.length, blurred);
  h.rows([]); await h.changeFocus(true); assert.equal(h.result().items.length, 0); assert.equal(h.hints.size, 1);
});
for (const transition of ['account', 'generation', 'hosts', 'blur', 'background', 'disabled']) test(`held upcoming result cannot cross ${transition} ownership`, async t => {
  const held = deferred(), h = await mount(t, h => h.response(() => held.promise));
  const oldReload = h.result().reload, oldListener = h.subscriptions[0].listener;
  h.response(async () => ({ data: [], error: null }));
  if (transition === 'account') await h.changeAccount(owner(other));
  if (transition === 'generation') await h.changeAccount(owner(actor, 'replacement'));
  if (transition === 'hosts') await h.options({ hostUserIds: [other] });
  if (transition === 'blur') await h.changeFocus(false);
  if (transition === 'background') await h.appState('background');
  if (transition === 'disabled') await h.options({ enabled: false });
  assert.equal(h.queries[0].signal.aborted, true);
  if (['blur', 'background', 'disabled'].includes(transition)) assert.equal(h.timers.size, 0, 'retiring a held read also retires its deadline');
  const before = h.queries.length;
  await React.act(async () => { oldListener(); await oldReload(); }); assert.equal(h.queries.length, before);
  await h.resolve(held, { data: [event('stale')], error: null }); assert.equal(h.result().items.length, 0);
});
test('held upcoming timeout fails honestly, aborts, retries and rejects a late completion', async t => {
  const held = deferred(), h = await mount(t, h => h.response(() => held.promise));
  await h.advance(12000); assert.ok(h.result().error); assert.equal(h.result().loading, false); assert.equal(h.queries[0].signal.aborted, true);
  h.response(async () => ({ data: [event('fresh')], error: null })); await React.act(async () => h.result().reload());
  await h.resolve(held, { data: [event('late')], error: null }); assert.equal(h.result().items[0].id, 'fresh');
});
test('guest upcoming reads stay public with no subscription; ambiguous/restricted sessions cannot read', async t => {
  const h = await mount(t, h => h.account(null, 'signed_out')); assert.equal(h.result().items.length, 1); assert.equal(h.hints.size, 0);
  for (const status of ['unknown', 'loading', 'restricted', 'restore_only', 'recovery_only']) {
    await h.changeAccount(null, status); const before = h.queries.length;
    await React.act(async () => h.result().reload()); await h.advance(30000); assert.equal(h.queries.length, before); assert.equal(h.result().items.length, 0);
  }
});
test('a guest held response and retired hint cannot replace the newly signed-in schedule', async t => {
  const held = deferred(), h = await mount(t, h => { h.account(null, 'signed_out'); h.response(() => held.promise); });
  h.response(async () => ({ data: [event('signed-in')], error: null })); await h.changeAccount(owner());
  await h.resolve(held, { data: [event('guest-late')], error: null }); assert.equal(h.result().items[0].id, 'signed-in');
});
test('periodic upcoming read keeps verified cards while pending, then removes them on unavailable read', async t => {
  const h = await mount(t), held = deferred(); h.response(() => held.promise); await h.advance(30000);
  assert.equal(h.result().loading, false); assert.equal(h.result().items.length, 1);
  await h.resolve(held, { data: null, error: new Error('offline') }); assert.ok(h.result().error); assert.equal(h.result().items.length, 0);
});
