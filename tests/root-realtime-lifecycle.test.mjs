import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
function harness() {
  let barrier = null, remove = async () => {}, sequence = 0;
  const timers = new Map(), removals = [];
  const context = { exports: {}, setTimeout(callback, ms) {
    const id = ++sequence; timers.set(id, { callback, ms }); return id;
  }, clearTimeout(id) { timers.delete(id); }, require(name) {
    assert.equal(name, './supabase');
    return { getRealtimeDisconnectBarrier: () => barrier, supabase: { removeChannel(channel) {
      removals.push(channel); return remove(channel);
    } } };
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync('_lib/rootRealtimeLifecycle.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { ...context.exports, timers, removals,
    barrier(value) { barrier = value; }, remove(operation) { remove = operation; },
    async next() { const [id, timer] = [...timers][0]; timers.delete(id); timer.callback(); await settle(); return timer.ms; },
  };
}

test('root coordinator waits owned removal then the newly observed actual teardown, without touching peers', async () => {
  const h = harness(), removal = deferred(), close = deferred(), channel = {};
  h.remove(() => removal.promise.then(() => { h.barrier(close.promise); }));
  const first = h.retireRootRealtimeChannel(channel);
  assert.equal(h.retireRootRealtimeChannel(channel), first);
  let starts = 0;
  h.startAfterRootRealtimeRetirement(() => true, () => starts++);
  assert.equal(starts, 0);
  removal.resolve(); await settle(); assert.equal(starts, 0);
  h.barrier(null); close.resolve(); await settle();
  assert.equal(starts, 1);
  assert.deepEqual(h.removals, [channel]);
  assert.equal(h.timers.size, 0);
});

test('late added root removals are reread before starting and retired wait owners cannot resume', async () => {
  const h = harness(), first = deferred(), second = deferred();
  h.barrier(first.promise);
  let current = true, starts = 0;
  const cancel = h.startAfterRootRealtimeRetirement(() => current, () => starts++);
  h.remove(() => second.promise); h.retireRootRealtimeChannel({});
  h.barrier(null); first.resolve(); await settle(); assert.equal(starts, 0);
  current = false; cancel(); second.resolve(); await settle();
  assert.equal(starts, 0); assert.equal(h.timers.size, 0);
});

test('failed teardown retries a finite read-only budget and never assumes timeout means ready', async () => {
  const h = harness();
  const failure = Promise.reject(Error('unconfirmed teardown')); failure.catch(() => {});
  h.barrier(failure);
  let starts = 0;
  h.startAfterRootRealtimeRetirement(() => true, () => starts++);
  await settle();
  const delays = [];
  while (h.timers.size) delays.push(await h.next());
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000]);
  assert.equal(starts, 0); assert.deepEqual(h.removals, []);
  h.barrier(null); await settle();
  assert.equal(starts, 0, 'exhausted wait never silently extends its budget');
});

test('same owned waiter recovers once proof clears; cancellation removes scheduled recovery', async () => {
  const h = harness();
  const failure = Promise.reject(Error('unconfirmed teardown')); failure.catch(() => {});
  h.barrier(failure);
  let starts = 0;
  const stop = h.startAfterRootRealtimeRetirement(() => true, () => starts++);
  await settle(); assert.equal(h.timers.size, 1);
  stop(); assert.equal(h.timers.size, 0);
  const current = h.startAfterRootRealtimeRetirement(() => true, () => starts++);
  await settle(); h.barrier(null); await h.next();
  assert.equal(starts, 1); assert.equal(h.timers.size, 0);
  current(); await settle(); assert.equal(starts, 1);
});

test('deferred startup exceptions use the finite owned recovery path, never unhandled rejections', async () => {
  const h = harness(), close = deferred();
  h.barrier(close.promise);
  let attempts = 0;
  const cancel = h.startAfterRootRealtimeRetirement(() => true, () => {
    if (++attempts === 1) throw Error('modeled subscription setup failure');
  });
  h.barrier(null); close.resolve(); await settle();
  assert.equal(attempts, 1); assert.equal(h.timers.size, 1);
  await h.next(); assert.equal(attempts, 2); assert.equal(h.timers.size, 0);
  cancel();
});

test('actual root subscription owners retire partial channels and cancel their pending setup retries', async () => {
  for (const target of ['notification', 'callee']) {
    const timers = new Map(), channels = [], accounts = new Set();
    let timerId = 0;
    const binding = { userId: 'account-a', accountId: 'account-a', sessionGeneration: 'one', state: 'ACTIVE', restoreOnly: false };
    const accountAPI = { getCurrentAccountSessionAuthoritySnapshot: () => binding,
      sameAccountSessionAuthority: (a, b) => a === b,
      subscribeToAccountSessionAuthority(callback) { accounts.add(callback); return () => accounts.delete(callback); } };
    const bootstrap = { getRealtimeDisconnectBarrier: () => null, supabase: {
      channel() {
        const channel = { removed: false, on() { return channel; }, subscribe() { throw Error('modeled subscribe failure'); } };
        channels.push(channel); return channel;
      }, async removeChannel(channel) { channel.removed = true; },
    } };
    const load = (file, imports) => {
      const context = { exports: {}, setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
        clearTimeout(id) { timers.delete(id); }, require(name) { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; } };
      vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText, context);
      return context.exports;
    };
    const lifecycle = load('_lib/rootRealtimeLifecycle.ts', { './supabase': bootstrap });
    const imports = { './supabase': bootstrap, './rootRealtimeLifecycle': lifecycle, './accountSessionAuthority': accountAPI,
      'react-native': { AppState: { currentState: 'active', addEventListener() { return { remove() {} }; } } },
      './chillyChatCallDispatchSchema': {}, './chatActivity': {}, './accountBoundSupabaseMutation': {},
    };
    const api = load(target === 'notification' ? '_lib/notificationActivity.ts' : '_lib/chillyChatCalls.ts', imports);
    const stop = target === 'notification' ? api.subscribeToNotificationActivityChanges(binding)
      : api.subscribeToIncomingChillyChatCallInvites(binding.userId, () => {});
    await settle();
    assert.equal(channels.length, 1, target);
    assert.equal(channels[0].removed, true, `${target} owns cleanup of partial channel`);
    assert.equal(timers.size, 1, target);
    stop();
    assert.equal(timers.size, 0, `${target} cancels retry on disposal`);
    assert.equal(accounts.size, 0, `${target} releases authority listener`);
  }
});
