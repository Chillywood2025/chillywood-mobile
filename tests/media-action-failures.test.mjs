import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { createRoot } from 'react-dom/client';

function load(file, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, URL, Date });
  return exports;
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function query(result, calls = []) {
  const q = { then: (yes, no) => Promise.resolve(result).then(yes, no) };
  for (const method of ['select', 'eq', 'neq', 'order', 'returns', 'maybeSingle', 'in', 'delete', 'upsert', 'update']) {
    q[method] = (...args) => { calls.push([method, ...args]); return q; };
  }
  return q;
}
function replays(result) {
  return load('_lib/creatorReplays.ts', { './supabase': { SUPABASE_FUNCTIONS_URL: 'https://example.test', supabase: { from: () => query(result) } } });
}
test('replay reads distinguish empty from resolved errors, thrown errors and malformed results', async () => {
  assert.equal((await replays({ data: [], error: null }).readCreatorReplayLibraryItems('a')).length, 0);
  for (const result of [{ error: { message: 'offline' } }, { data: null }, Promise.reject(new Error('transport'))]) {
    await assert.rejects(replays(result).readCreatorReplayLibraryItems('a'));
  }
});
test('replay mutations require the returned row and exact requested state', async () => {
  for (const data of [null, { id: 'other', visibility: 'public' }, { id: 'r', visibility: 'draft' }]) {
    await assert.rejects(replays({ data }).updateCreatorReplayLibraryItem('r', { visibility: 'public' }), /could not be confirmed/);
  }
  await replays({ data: { id: 'r', visibility: 'public' } }).updateCreatorReplayLibraryItem('r', { visibility: 'public' });
  await assert.rejects(replays({ error: { message: 'denied' } }).updateCreatorReplayLibraryItem('r', { saveStatus: 'deleted' }), /denied/);
});
test('a failed follower lookup cannot report unfollow noop or not-following', async () => {
  for (const result of [{ error: new Error('offline') }, Promise.reject(new Error('transport'))]) {
    const api = load('_lib/channelAudience.ts', {
      './moderation': { readMyPlatformRoleMemberships: async () => [], hasPlatformRoleMembership: () => false },
      './accountBoundSupabaseMutation': {},
      './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'viewer' } } } }) }, rpc: async () => ({ data: false }),
        from: table => query(table === 'channel_followers' ? result : { data: null }) } },
    });
    await assert.rejects(api.unfollowChannel('channel'));
    await assert.rejects(api.readMyChannelFollowState('channel'));
  }
});
function engagement(results) {
  let generation = 'a';
  const calls = [], captures = [];
  const subject = () => ({ accessToken: generation, authority: { userId: generation } });
  const check = value => { if (value.accessToken !== generation) throw new Error('account changed'); };
  const api = load('_lib/contentEngagement.ts', {
    './supabase': { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', supabase: {} },
    './accountBoundSupabaseMutation': { captureAccountBoundSupabaseMutationSubject: async () => { const value = subject(); captures.push(value); return value; }, assertAccountBoundSupabaseMutationSubjectCurrent: check },
    '@supabase/supabase-js': { createClient: (_url, _key, options) => ({ from: () => {
      const result = results.shift();
      return query(options.accessToken().then(() => typeof result === 'function' ? result() : result), calls);
    } }) },
  });
  return { api, calls, captures, switch: () => { generation = 'b'; } };
}
test('toggle uses one captured account for read, write and readback', async () => {
  const h = engagement([{ data: [] }, { data: null }, { data: [{ relationship_type: 'like' }] }]);
  const value = await h.api.toggleTitleLike('title');
  assert.equal(value.liked, true);
  assert.equal(value.viewerUserId, 'a');
  assert.equal(h.captures.length, 1);
  assert.equal(h.calls.find(call => call[0] === 'upsert')[1].user_id, 'a');
});
test('switch during toggle read prevents write and during write rejects old settlement', async () => {
  for (const phase of ['read', 'write']) {
    const held = deferred();
    const h = engagement(phase === 'read' ? [held.promise] : [{ data: [] }, held.promise]);
    const pending = h.api.toggleTitleLike('title');
    for (let i = 0; i < 12; i++) await Promise.resolve();
    h.switch(); held.resolve({ data: [] });
    await assert.rejects(pending, /account changed/);
    if (phase === 'read') assert.equal(h.calls.some(call => call[0] === 'upsert'), false);
    assert.equal(h.captures.length, 1);
  }
});
test('engagement propagates resolved and thrown read errors without writing', async () => {
  for (const result of [{ error: new Error('offline') }, () => { throw new Error('transport'); }]) {
    const h = engagement([result]);
    await assert.rejects(h.api.toggleTitleLike('title'));
    assert.equal(h.calls.some(call => call[0] === 'upsert'), false);
  }
});

async function mountFollow(t) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const noop = () => {};
  const doc = { addEventListener: noop, removeEventListener: noop, nodeType: 9, defaultView: globalThis };
  doc.documentElement = { nodeType: 1, nodeName: 'HTML', ownerDocument: doc };
  globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
  const container = { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: doc, addEventListener: noop, removeEventListener: noop };
  let account = 'a', notify, snapshot, target = 'one';
  const reads = [], mutations = [], alerts = [];
  const hook = load('hooks/use-channel-follow-action.ts', {
    react: React, 'react-native': { Alert: { alert: (...args) => alerts.push(args) } },
    '../_lib/accountSessionAuthority': { getAccountNavigationTreeKey: x => x, getCurrentAccountSessionAuthoritySnapshot: () => account,
      subscribeToAccountSessionAuthority: fn => { notify = fn; return noop; } },
    '../_lib/channelAudience': { readMyChannelFollowState: async () => reads.length ? reads.shift() : 'not_following',
      followChannel: async id => { mutations.push(id); return mutation.promise; }, unfollowChannel: async () => { throw new Error('unexpected'); } },
  }).useChannelFollowAction;
  const mutation = deferred();
  function Probe() { snapshot = hook({ channelUserId: target }); return null; }
  const root = createRoot(container);
  await React.act(async () => root.render(React.createElement(Probe)));
  t.after(async () => { await React.act(async () => root.unmount()); });
  return { get snapshot() { return snapshot; }, reads, mutations, alerts, mutation,
    run: fn => React.act(async () => { fn(); }),
    change: next => React.act(async () => { target = next; root.render(React.createElement(Probe)); }),
    account: () => React.act(async () => { account = 'b'; notify(); }),
  };
}
test('mounted follow hook blocks same-render double taps and stale target settlements', async t => {
  const h = await mountFollow(t);
  const oldToggle = h.snapshot.toggle;
  await h.run(() => { oldToggle(); oldToggle(); });
  assert.equal(h.mutations.length, 1);
  await h.change('two');
  await h.run(() => oldToggle());
  assert.equal(h.mutations.length, 1);
  await h.run(() => h.mutation.resolve({ status: 'completed', action: 'follow' }));
  assert.equal(h.snapshot.state, 'not_following');
  assert.equal(h.snapshot.busy, false);
});
test('mounted follow hook discards stale refresh and account-change mutation alerts', async t => {
  const h = await mountFollow(t);
  const held = deferred(); h.reads.push(held.promise);
  await h.run(() => h.snapshot.refresh());
  await h.change('two');
  await h.run(() => held.resolve('following'));
  assert.equal(h.snapshot.state, 'not_following');
  await h.run(() => h.snapshot.toggle());
  await h.account();
  await h.run(() => h.mutation.reject(new Error('old account failure')));
  assert.equal(h.snapshot.state, 'not_following');
  assert.equal(h.alerts.length, 0);
});
test('mounted follow hook defers refresh while mutation is unsettled', async t => {
  const h = await mountFollow(t);
  await h.run(() => h.snapshot.toggle());
  h.reads.push('following');
  await h.run(() => h.snapshot.refresh());
  assert.equal(h.reads.length, 1, 'locked refresh must not start a pre-write read');
  await h.run(() => h.mutation.resolve({ status: 'completed', action: 'follow' }));
  assert.equal(h.snapshot.state, 'following');
  assert.equal(h.snapshot.busy, false);
});

function replaySettings({ mutation = async () => {}, refresh = async () => { throw new Error('offline'); } } = {}) {
  const file = 'app/channel-settings.tsx';
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ['updateReplayVisibility', 'deleteReplay'].includes(node.name.getText(source))) declarations.push(`const ${node.getText(source)};`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  let account = 'a', items = [{ id: 'r', ownerUserId: 'a', visibility: 'draft' }], notice, error, saving, confirm;
  const context = {
    exports: {}, replayActionsMountedRef: { current: true },
    getCurrentAccountSessionAuthoritySnapshot: () => ({ userId: account }),
    sameAccountSessionAuthority: (a, b) => a.userId === b.userId,
    updateCreatorReplayLibraryItem: mutation, readCreatorReplayLibraryItems: refresh,
    setCreatorReplays: value => { items = typeof value === 'function' ? value(items) : value; },
    setVideoNotice: value => { notice = value; }, setVideosLoadError: value => { error = value; }, setVideoSaving: value => { saving = value; },
    Alert: { alert: (_title, _text, buttons) => { confirm = buttons[1].onPress; } },
  };
  vm.runInNewContext(ts.transpileModule(`${declarations.join('\n')} exports.update = updateReplayVisibility; exports.remove = deleteReplay;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { ...context.exports, get items() { return items; }, get notice() { return notice; }, get error() { return error; }, get saving() { return saving; },
    switch: () => { account = 'b'; }, unmount: () => { context.replayActionsMountedRef.current = false; }, confirm: () => confirm() };
}
test('actual Studio visibility handler preserves confirmed save when refresh fails', async () => {
  const h = replaySettings();
  await h.update(h.items[0], 'public');
  assert.equal(h.items[0].visibility, 'public');
  assert.match(h.notice, /saved.*refresh is unavailable/i);
  assert.match(h.error, /Retry/);
  assert.equal(h.saving, false);
});
test('actual Studio visibility handler preserves old list on mutation failure and discards stale account settlement', async () => {
  const failed = replaySettings({ mutation: async () => { throw new Error('denied'); } });
  await failed.update(failed.items[0], 'public');
  assert.equal(failed.items[0].visibility, 'draft');
  const held = deferred(), h = replaySettings({ mutation: () => held.promise });
  const pending = h.update(h.items[0], 'public');
  h.switch(); held.resolve(); await pending;
  assert.equal(h.items[0].visibility, 'draft');
  assert.equal(h.error, undefined);
});
test('actual Studio delete confirmation cannot execute after account switch', () => {
  let writes = 0;
  const h = replaySettings({ mutation: async () => { writes++; } });
  h.remove(h.items[0]); h.switch(); h.confirm();
  assert.equal(writes, 0);
});
test('actual Studio replay refresh cannot replace list after unmount or account replacement', async () => {
  for (const change of ['unmount', 'switch']) {
    const held = deferred(), started = deferred(), h = replaySettings({ refresh: () => { started.resolve(); return held.promise; } });
    const pending = h.update(h.items[0], 'public');
    await started.promise;
    h[change](); held.resolve([{ id: 'stale', ownerUserId: 'a' }]);
    await pending;
    assert.equal(h.items[0].id, 'r');
    assert.equal(h.items[0].visibility, 'public');
  }
});
test('actual Studio deletion reports saved deletion separately from unavailable refresh', async () => {
  const h = replaySettings();
  h.remove(h.items[0]); h.confirm();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(h.items.length, 0);
  assert.match(h.notice, /deleted.*refresh is unavailable/i);
  assert.match(h.error, /Retry/);
});
