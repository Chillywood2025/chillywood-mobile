import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';
import { WebSocketServer } from 'ws';

const root = fileURLToPath(new URL('../', import.meta.url));
const viewer = '10000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const owner = (generation, userId = viewer) => ({ userId, accountId: userId, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
async function until(predicate, label, timeout = 4000) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, label);
    await delay(5);
  }
}

// Real installed SDK/native WebSocket and unchanged production subscription,
// retirement and observer modules. Loopback models only Phoenix joins/leaves;
// it does NOT qualify managed CDC/RLS, React navigation or installed devices.
// Discovery is deliberately never mounted: these root transports must recover
// independently. No injected SUBSCRIBED status or custom transport class.
async function fixture({ ignoreBarrier = false } = {}) {
  const http = createServer(), server = new WebSocketServer({ server: http });
  const peers = [], removals = [], stops = [], callbacks = [];
  let holdClose = false;
  server.on('connection', socket => {
    const peer = { socket, topics: new Map(), paused: false };
    peers.push(peer);
    socket.on('message', raw => {
      const [join, ref, topic, event, payload] = JSON.parse(raw.toString());
      if (event === 'phx_join') peer.topics.set(topic, join);
      if (event === 'phx_leave') peer.topics.delete(topic);
      if (event === 'phx_join' || event === 'phx_leave' || event === 'heartbeat') {
        const postgres_changes = (payload?.config?.postgres_changes ?? []).map((filter, index) => ({ ...filter, id: index + 1 }));
        socket.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes } }]));
      }
      if (event === 'phx_leave' && holdClose && peer.topics.size === 0) {
        // Deliver the genuine leave reply, then hold the real close handshake.
        peer.paused = true;
        socket._socket.pause();
      }
    });
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const client = createClient(`http://127.0.0.1:${http.address().port}`, 'synthetic-loopback-noncredential', {
    auth: { persistSession: false, autoRefreshToken: false }, realtime: { timeout: 300 },
  });
  assert.equal(client.realtime.transport, globalThis.WebSocket);
  const remove = client.removeChannel.bind(client);
  client.removeChannel = channel => {
    const promise = remove(channel), record = { channel, settled: false, status: null };
    removals.push(record);
    void promise.then(status => { record.settled = true; record.status = status; });
    return promise;
  };
  let authority = owner('initial'), getBarrier;
  const accounts = new Set(), apps = new Set(), cache = new Map();
  const app = { currentState: 'active', addEventListener: (_, callback) => {
    apps.add(callback); return { remove: () => apps.delete(callback) };
  } };
  const accountAPI = {
    getCurrentAccountSessionAuthoritySnapshot: () => authority,
    sameAccountSessionAuthority: (a, b) => Boolean(a && b && JSON.stringify(a) === JSON.stringify(b)),
    subscribeToAccountSessionAuthority: callback => { accounts.add(callback); return () => accounts.delete(callback); },
  };
  const unused = label => new Proxy({}, { get(_target, name) { throw Error(`out-of-scope ${label}.${String(name)}`); } });
  const load = filename => {
    const absolute = path.resolve(root, filename);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {}; cache.set(absolute, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      exports, setTimeout, clearTimeout, console,
      require(name) {
        if (name === 'react-native') return { AppState: app };
        if (name === './supabase') return { supabase: client, getRealtimeDisconnectBarrier: ignoreBarrier ? () => null : getBarrier };
        if (name === './accountSessionAuthority') return accountAPI;
        if (['./chillyChatCallDispatchSchema', './chatActivity', './accountBoundSupabaseMutation'].includes(name)) return unused(name);
        assert.ok(['./rootRealtimeLifecycle'].includes(name), `unexpected production import ${name}`);
        return load(path.resolve(path.dirname(absolute), `${name}.ts`));
      },
    }, { filename: absolute });
    return exports;
  };
  getBarrier = load('_lib/realtimeDisconnectBarrier.ts').observeRealtimeDisconnect(client.realtime);
  const notifications = load('_lib/notificationActivity.ts'), calls = load('_lib/chillyChatCalls.ts');
  const release = () => {
    holdClose = false;
    for (const peer of peers) if (peer.paused) { peer.paused = false; peer.socket._socket.resume(); }
  };
  return {
    client, peers, removals, callbacks, getBarrier,
    mount() {
      const binding = authority;
      const listen = notifications.subscribeToNotificationActivity(notifications.getNotificationActivityOwnerKey(binding), () => callbacks.push(binding));
      const notification = notifications.subscribeToNotificationActivityChanges(binding);
      const callee = calls.subscribeToIncomingChillyChatCallInvites(binding.userId, () => callbacks.push(binding));
      const stop = () => { notification(); callee(); listen(); };
      stops.push(stop); return stop;
    },
    joined: () => client.getChannels().length === 2 && client.getChannels().every(channel => channel.state === 'joined'),
    account(next) { authority = next; for (const callback of [...accounts]) callback(next); },
    state(state) { app.currentState = state; for (const callback of [...apps]) callback(state); },
    hold: () => { holdClose = true; }, release,
    async close() {
      release(); for (const stop of stops) stop();
      await client.removeAllChannels();
      for (const peer of peers) peer.socket.terminate();
      await getBarrier()?.catch(() => {});
      await new Promise(resolve => server.close(resolve));
      await new Promise(resolve => http.close(resolve));
    },
  };
}

if (typeof globalThis.WebSocket !== 'function') {
  test('root teardown proof runs all real socket cases under Node 20 native WebSocket flag', () => {
    assert.notEqual(process.env.ROOT_REALTIME_NATIVE_CHILD, '1');
    const env = { ...process.env, ROOT_REALTIME_NATIVE_CHILD: '1' };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--experimental-websocket', '--test', '--test-reporter=tap', fileURLToPath(import.meta.url)], {
      cwd: root, env, encoding: 'utf8', timeout: 90000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /# tests 6\b/u);
    assert.match(result.stdout, /# pass 6\b/u);
    assert.doesNotMatch(result.stderr, /skipping running files|called recursively/u);
  });
} else {
  test('root authority recovery waits owned removal and actual buffered/closing SDK teardown', { timeout: 15000 }, async () => {
    const h = await fixture();
    try {
      const old = h.mount(); await until(h.joined, 'initial root subscriptions');
      h.hold(); h.account(null); old();
      await until(() => h.removals.length === 2 && h.removals.every(item => item.settled), 'old root removals resolve');
      assert.ok(h.removals.every(item => item.status === 'ok'));
      assert.ok(h.getBarrier());
      h.account(owner('recovered')); h.mount();
      assert.equal(h.client.getChannels().length, 0, 'no root replacements while actual teardown remains pending');
      await until(() => h.client.realtime.isDisconnecting(), 'actual native close held');
      h.release();
      await until(() => h.joined() && h.peers.length === 2, 'both root subscriptions recover without discovery or manual connect');
      assert.ok(h.callbacks.some(binding => binding.sessionGeneration === 'recovered'));
    } finally { await h.close(); }
  });

  test('negative control: omitting only actual teardown barrier reproduces old stranded root helpers', { timeout: 15000 }, async () => {
    const h = await fixture({ ignoreBarrier: true });
    try {
      const old = h.mount(); await until(h.joined, 'initial root subscriptions');
      h.hold(); h.account(null); old();
      await until(() => h.removals.length === 2 && h.removals.every(item => item.settled), 'old removals resolve');
      h.account(owner('unprotected')); h.mount();
      await until(() => h.client.getChannels().length === 2, 'unprotected replacements created');
      await until(() => h.client.realtime.isDisconnecting(), 'held native close');
      h.release(); await until(() => h.client.realtime.connectionState() === 'closed', 'old socket closed');
      await delay(1600); // Includes actual 300ms join timeout and first retry.
      assert.equal(h.peers.length, 1);
      assert.equal(h.joined(), false);
      h.client.realtime.connect(); // Diagnostic control only, never production.
      await until(() => h.joined() && h.peers.length === 2, 'explicit connect distinguishes stranded helpers from denial');
    } finally { await h.close(); }
  });

  test('owner replacement and disposed root waiters never reconnect after a pending close', { timeout: 15000 }, async () => {
    const h = await fixture();
    try {
      const old = h.mount(); await until(h.joined, 'initial root subscriptions');
      h.hold(); h.account(null); old();
      // These replacements also precede removal settlement: pending same-topic
      // callee ownership cannot be reused by an impatient root remount.
      h.account(owner('cancelled')); const cancelled = h.mount(); cancelled();
      h.account(owner('retired')); h.mount();
      h.account(owner('current', other)); h.mount();
      await until(() => h.client.realtime.isDisconnecting(), 'held native close');
      const count = h.callbacks.length;
      h.release(); await until(() => h.joined() && h.peers.length === 2, 'only current root recovers');
      assert.ok(h.client.getChannels().some(channel => channel.topic.endsWith(other)));
      assert.ok(h.client.getChannels().every(channel => !channel.topic.endsWith(viewer)));
      await until(() => h.callbacks.length > count, 'current notification readiness');
      assert.ok(h.callbacks.slice(count).every(binding => binding.sessionGeneration === 'current'));
    } finally { await h.close(); }
  });

  test('stable signed-in background retains callee keeper and foreground notification rejoins it', { timeout: 15000 }, async () => {
    const h = await fixture();
    try {
      h.mount(); await until(h.joined, 'initial root subscriptions');
      const callee = h.client.getChannels().find(channel => channel.topic.includes('chat-call-invites-callee-'));
      h.hold(); h.state('background');
      await until(() => h.removals.length === 1 && h.removals[0].settled, 'notification removed');
      assert.deepEqual(h.client.getChannels(), [callee]);
      assert.equal(h.getBarrier(), null);
      assert.equal(h.client.realtime.isConnected(), true);
      h.state('active'); await until(h.joined, 'foreground notification rejoins persistent callee');
      assert.equal(h.peers.length, 1);
      assert.ok(h.client.getChannels().includes(callee));
    } finally { await h.close(); }
  });

  test('root authority retirement preserves an unrelated live Chat/media channel', { timeout: 15000 }, async () => {
    const h = await fixture();
    try {
      const peer = h.client.channel('unrelated-live-owner').subscribe();
      const old = h.mount(); await until(() => h.client.getChannels().length === 3 && h.client.getChannels().every(channel => channel.state === 'joined'), 'all owners joined');
      h.hold(); h.account(null); old();
      h.account(owner('replacement')); h.mount();
      await until(() => h.removals.length === 2 && h.removals.every(item => item.settled), 'root retirement settled');
      await until(() => h.client.getChannels().length === 3 && h.client.getChannels().every(channel => channel.state === 'joined'), 'root rejoins existing peer connection');
      assert.ok(h.client.getChannels().includes(peer));
      assert.equal(h.peers.length, 1);
      assert.equal(h.getBarrier(), null);
    } finally { await h.close(); }
  });

  test('same foreground root recovers after genuine ten-second SDK timeout and late close completion', { timeout: 25000 }, async () => {
    const h = await fixture();
    const phoenix = h.client.realtime.socketAdapter.getSocket(), originalTeardown = phoenix.teardown;
    let releaseCompletion;
    try {
      const old = h.mount(); await until(h.joined, 'initial root subscriptions');
      // Leave exactly the persistent callee keeper before retiring the root.
      // Otherwise two simultaneous removals may independently initiate genuine
      // SDK teardowns, and a second completion legitimately clears the first.
      h.state('background');
      await until(() => h.removals.length === 1 && h.removals[0].settled, 'notification retired, callee keeper remains');
      await until(() => phoenix.conn?.bufferedAmount === 0, 'native send buffer drained');
      // Only pause the original Phoenix completion callback AFTER actual
      // native close/detachment. Keep native transport and real 10s timeout.
      phoenix.teardown = function (callback, ...args) {
        phoenix.teardown = originalTeardown;
        return originalTeardown.call(this, () => { releaseCompletion = () => callback?.(); }, ...args);
      };
      const started = performance.now();
      h.account(null); old(); h.state('active');
      h.account(owner('same-foreground')); h.mount();
      await until(() => releaseCompletion && phoenix.conn === null, 'native close completed, callback held');
      const barrier = h.getBarrier(); assert.ok(barrier);
      await assert.rejects(barrier, /realtime_disconnect_unconfirmed/u);
      assert.ok(performance.now() - started >= 9900);
      assert.equal(phoenix.disconnecting, true);
      assert.equal(h.client.getChannels().length, 0);
      releaseCompletion(); releaseCompletion = null;
      // No AppState change, account update, remount, manual connect or getter
      // clearing after release. The original bounded production wait retries.
      await until(() => h.joined() && h.peers.length === 2, 'same root joins after genuine late completion');
      assert.ok(h.callbacks.some(binding => binding.sessionGeneration === 'same-foreground'));
    } finally {
      phoenix.teardown = originalTeardown; releaseCompletion?.();
      await h.close();
    }
  });
}
