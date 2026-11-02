import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
const { PostgrestClient } = require('@supabase/postgrest-js');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const compile = file => ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const code = { read: compile('_lib/publicPartyRoomCounts.ts'), hook: compile('_lib/usePublicPartyRoomCounts.ts') };
const actor = '10000000-0000-4000-8000-000000000001', other = '20000000-0000-4000-8000-000000000002';
const title = '30000000-0000-4000-8000-000000000003', another = '40000000-0000-4000-8000-000000000004';
const owner = (id = actor, session = `${id}-session`) => ({ userId: id, accountId: id, sessionGeneration: session, state: 'ACTIVE', restoreOnly: false });
const sameOwner = (a, b) => !!a && !!b && ['userId', 'accountId', 'sessionGeneration', 'restoreOnly'].every(k => a[k] === b[k]);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const response = (count = 1, id = title) => ({ total: count, byTitle: count ? [{ titleId: id, count }] : [] });

async function mount(t, options = {}) {
  let authority = owner(), snapshot = authority, focused = true, ids = options.ids ?? [title], state, now = Date.now();
  let reader = options.reader ?? (() => response());
  const requests = [], hints = new Set(), intervals = new Set(), timers = new Map(), appListeners = new Set(), accounts = new Set();
  const native = { AppState: { currentState: 'active', addEventListener: (_, fn) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } } };
  const evaluate = (source, imports) => {
    const context = { exports: {}, require: name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name]; },
      AbortController, Date: class extends Date { static now() { return now; } }, setTimeout: (f, ms) => { timers.set(f, ms); return f; }, clearTimeout: f => timers.delete(f),
      setInterval: f => { intervals.add(f); return f; }, clearInterval: f => intervals.delete(f),
    };
    vm.runInNewContext(source, context); return context.exports;
  };
  const account = {
    getCurrentAccountSessionAuthoritySnapshot: () => snapshot, sameAccountSessionAuthority: sameOwner,
    subscribeToAccountSessionAuthority: fn => { accounts.add(fn); return () => accounts.delete(fn); },
  };
  const supabase = new PostgrestClient('https://offline.invalid/rest/v1', { fetch: async (url, init) => {
    const request = { url: String(url), body: JSON.parse(init.body), signal: init.signal }; requests.push(request);
    const data = await reader(request);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } });
  const read = evaluate(code.read, { './supabase': { supabase }, './accountSessionAuthority': account });
  const hook = evaluate(code.hook, {
    react: React, 'react-native': native, '@react-navigation/native': { useIsFocused: () => focused },
    './session': { useSession: () => ({ authority, authorityStatus: authority ? 'active' : 'signed_out' }) },
    './accountSessionAuthority': account, './publicPartyRoomCounts': read,
    './liveDiscoveryInvalidation': evaluate(compile('_lib/liveDiscoveryInvalidation.ts'), {}),
    './sharedLiveUpdates': { subscribeToLiveUpdates: (subject, scope, callback, interest) => {
      assert.equal(scope, 'discovery'); assert.equal(interest.surface, 'home'); assert.ok(sameOwner(subject, snapshot));
      hints.add(callback); return () => hints.delete(callback);
    } },
  });
  function Host() { state = hook.usePublicPartyRoomCounts(ids); return null; }
  const root = createRoot(container()), render = () => React.act(async () => root.render(React.createElement(Host)));
  await render(); t.after(() => React.act(async () => root.unmount()));
  return {
    requests, read, state: () => state, count: id => state.counts[id ?? title]?.liveRoomCount ?? 0,
    setReader(value) { reader = value; },
    async tick() { await React.act(async () => { now += 30000; for (const callback of intervals) void callback(); }); },
    async hint() { await React.act(async () => { now += 500; for (const callback of hints) callback(); }); },
    async drain() { await React.act(async () => { now += 500; for (const [callback, ms] of [...timers]) if (ms <= 500) { timers.delete(callback); callback(); } }); },
    async timeout() { await React.act(async () => { for (const [callback, ms] of timers) if (ms === 12_000) callback(); }); },
    async refresh() { await React.act(async () => { await state.reload(); }); },
    async account(value, rerender = true) { await React.act(async () => {
      snapshot = value; for (const callback of accounts) callback(value);
      if (rerender) { authority = value; root.render(React.createElement(Host)); }
    }); },
    async focus(value) { focused = value; await render(); },
    async titles(value) { ids = value; await render(); },
    async appState(value) { await React.act(async () => { native.AppState.currentState = value; for (const callback of appListeners) callback(value); }); },
    async resolve(held, value) { await React.act(async () => held.resolve(value)); },
  };
}

test('mounted public count hook uses exact RPC SDK transport and removes ended/unlisted counts on canonical refresh', async t => {
  const h = await mount(t);
  assert.equal(h.count(), 1);
  assert.match(h.requests[0].url, /\/rpc\/read_public_party_room_counts$/);
  assert.deepEqual(h.requests[0].body, { p_title_ids: [title] });
  h.setReader(() => response(0)); await h.hint(); assert.equal(h.count(), 0);
  h.setReader(() => response(3)); await h.tick(); assert.equal(h.count(), 3);
  h.setReader(() => response(0)); await h.refresh(); assert.equal(h.count(), 0);
});
test('canonical count scopes bind exact requested titles and malformed or missing positive scopes fail closed',async t=>{
  const h=await mount(t),key='a0000000-0000-4000-8000-000000000001';
  h.setReader(()=>({...response(3),scopes:[{titleId:title,key}]}));await h.refresh();
  assert.equal(h.state().counts[title].discoveryHintKey,key);
  for(const scopes of [null,[],[{titleId:another,key}],[{titleId:title,key:'bad'}],[{titleId:title,key},{titleId:title,key}]]) {
    h.setReader(()=>({...response(9),scopes}));await h.refresh();assert.equal(h.count(),0);
  }
});

test('held read cannot repopulate after logout, account replacement, or exact-session replacement', async t => {
  for (const next of [null, owner(other), owner(actor, 'replacement-session')]) {
    const held = deferred(), h = await mount(t, { reader: () => held.promise });
    assert.equal(h.count(), 0);
    h.setReader(() => response(0)); await h.account(next);
    await h.resolve(held, response(91)); assert.equal(h.count(), 0);
  }
});

test('authoritative account retirement hides saved counts before React session context catches up', async t => {
  const h = await mount(t); assert.equal(h.count(), 1);
  await h.account(owner(other), false); assert.equal(h.count(), 0);
  const before = h.requests.length; await h.tick(); assert.equal(h.requests.length, before);
});

test('background, loss of focus and changed title identity retire pending counts and revalidate when resumed', async t => {
  const h = await mount(t), held = deferred();
  h.setReader(() => held.promise); await h.hint();
  await h.appState('background'); assert.equal(h.count(), 0);
  h.setReader(() => response(0)); await h.appState('active');
  await h.resolve(held, response(44)); assert.equal(h.count(), 0);
  h.setReader(() => response(2)); await h.tick(); assert.equal(h.count(), 2);
  await h.focus(false); assert.equal(h.count(), 0);
  h.setReader(() => response(0)); await h.focus(true); assert.equal(h.count(), 0);
  const old = deferred(); h.setReader(() => old.promise); await h.hint();
  h.setReader(() => response(4, another)); await h.titles([another]); assert.equal(h.count(another), 4);
  await h.resolve(old, response(99)); assert.equal(h.count(), 0); assert.equal(h.count(another), 4);
});

test('timeout and malformed response fail closed; a hint during an in-flight read triggers canonical reconciliation', async t => {
  const h = await mount(t), held = deferred();
  h.setReader(() => held.promise); await h.hint(); await h.timeout(); assert.equal(h.count(), 0);
  h.setReader(() => response(0)); await h.tick();
  await h.resolve(held, response(22)); assert.equal(h.count(), 0);
  for (const value of [null, { total: 1, byTitle: [{ titleId: other, count: 1 }] }, { total: 1, byTitle: [{ titleId: title, count: -1 }] },
    { total: 2, byTitle: [{ titleId: title, count: 1 }, { titleId: title, count: 1 }] }]) {
    h.setReader(() => value); await h.hint(); assert.equal(h.count(), 0);
  }
  const queued = deferred(); h.setReader(() => queued.promise); await h.hint(); await h.hint();
  h.setReader(() => response(0)); await h.resolve(queued, response(8)); assert.equal(h.count(), 0); await h.drain(); assert.equal(h.count(), 0);
});

test('large title sets are batched, local-only IDs never scan all rooms, and batches commit all-or-nothing', async t => {
  const ids = Array.from({ length: 101 }, (_, i) => `50000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const h = await mount(t, { ids, reader: request => ({ total: request.body.p_title_ids.length,
    byTitle: request.body.p_title_ids.map(titleId => ({ titleId, count: 1 })) }) });
  assert.deepEqual(h.requests.map(request => request.body.p_title_ids.length), [100, 1]);
  assert.equal(Object.keys(h.state().counts).length, 101);
  h.setReader(request => request.body.p_title_ids.length === 1 ? null : { total: 100,
    byTitle: request.body.p_title_ids.map(titleId => ({ titleId, count: 1 })) });
  await h.refresh(); assert.equal(Object.keys(h.state().counts).length, 0);
  const before = h.requests.length; await h.titles(['local-title', '', 'not-a-uuid']);
  assert.equal(h.requests.length, before); assert.equal(h.count(), 0);
});

test('Home, Explore and Title no longer enumerate raw room or chat metadata; public-only profile/platform remains unchanged', () => {
  for (const file of ['app/(tabs)/index.tsx', 'app/(tabs)/explore.tsx', 'app/title/[id].tsx']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.from\(["']watch_party_(?:rooms|room_messages)["']\)/, file);
    if (!file.endsWith('index.tsx')) assert.match(source, /usePublicPartyRoomCounts\(/);
  }
  const home = fs.readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /includeCircle: true/);
  for (const file of ['_lib/useProfileLiveState.ts', 'components/live/platform-live-now.tsx'])
    assert.match(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /includeCircle: false/);
});
