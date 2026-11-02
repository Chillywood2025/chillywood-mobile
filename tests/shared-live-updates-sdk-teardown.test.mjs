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
const owner = generation => ({ userId: viewer, accountId: viewer, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const home = { surface: 'home' };
async function until(predicate, label, timeout = 4000) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, label);
    await delay(5);
  }
}

// A real loopback WebSocket/Phoenix protocol fixture, NOT Supabase Auth, RLS,
// managed Broadcast or installed-device qualification. The actual installed SDK,
// native global WebSocket, production discovery module and disconnect observer
// execute unchanged except the explicitly labeled timeout callback-pause below.
// No custom transport class or fabricated SUBSCRIBED callback.
async function fixture({ ignoreDisconnectBarrier = false } = {}) {
  const http = createServer();
  const server = new WebSocketServer({ server: http });
  const peers = [], frames = [], removals = [], subscriptions = [];
  let holdClose = false;
  server.on('connection', socket => {
    const peer = { socket, topics: new Map(), paused: false };
    peers.push(peer);
    socket.on('message', raw => {
      const [join, ref, topic, event, payload] = JSON.parse(raw.toString());
      frames.push({ peer, topic, event, payload });
      if (event === 'phx_join') peer.topics.set(topic, join);
      if (event === 'phx_leave') peer.topics.delete(topic);
      if (event === 'phx_join' || event === 'phx_leave' || event === 'heartbeat') {
        socket.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }]));
      }
      if (event === 'phx_leave' && holdClose && peer.topics.size === 0) {
        // Writes (including the real leave reply) proceed, but the actual TCP
        // reads stop before accepting the client's WebSocket close handshake.
        peer.paused = true;
        socket._socket.pause();
      }
    });
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const client = createClient(`http://127.0.0.1:${http.address().port}`, 'synthetic-loopback-noncredential', {
    auth: { persistSession: false, autoRefreshToken: false }, realtime: { timeout: 2000 },
  });
  assert.equal(client.realtime.transport, globalThis.WebSocket, 'actual native transport, never a custom WebSocket class');
  const remove = client.removeChannel.bind(client);
  client.removeChannel = channel => {
    const promise = remove(channel), record = { channel, promise, settled: false, status: null };
    removals.push(record);
    void promise.then(status => { record.settled = true; record.status = status; });
    return promise; // Observation only; preserve exact SDK return promise.
  };
  let authority = owner('initial');
  const accounts = new Set(), apps = new Set(), cache = new Map();
  const app = { currentState: 'active', addEventListener: (_, callback) => {
    apps.add(callback); return { remove: () => apps.delete(callback) };
  } };
  let getBarrier;
  const load = filename => {
    const absolute = path.resolve(root, filename);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {}; cache.set(absolute, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      exports, setTimeout, clearTimeout, console, process: { env: { EXPO_PUBLIC_LIVE_DISCOVERY_PUSH_ENABLED: 'true' } },
      require(name) {
        if (name === 'react-native') return { AppState: app };
        if (name === './supabase') return { supabase: client, getRealtimeDisconnectBarrier: ignoreDisconnectBarrier ? () => null : getBarrier };
        if (name === './accountSessionAuthority') return {
          getCurrentAccountSessionAuthoritySnapshot: () => authority,
          sameAccountSessionAuthority: (a, b) => Boolean(a && b && JSON.stringify(a) === JSON.stringify(b)),
          subscribeToAccountSessionAuthority: callback => { accounts.add(callback); return () => accounts.delete(callback); },
        };
        if (name === './notificationActivity') return {
          getNotificationActivityOwnerKey: binding => JSON.stringify(binding), subscribeToNotificationActivity: () => () => {},
        };
        assert.ok(name.startsWith('.'), `unexpected production dependency: ${name}`);
        return load(path.resolve(path.dirname(absolute), `${name}.ts`));
      },
    }, { filename: absolute });
    return exports;
  };
  getBarrier = load('_lib/realtimeDisconnectBarrier.ts').observeRealtimeDisconnect(client.realtime);
  const api = load('_lib/sharedLiveUpdates.ts');
  const release = () => {
    holdClose = false;
    for (const peer of peers) if (peer.paused) { peer.paused = false; peer.socket._socket.resume(); }
  };
  return {
    client, peers, frames, removals, getBarrier,
    subscribe(callback = () => {}) {
      const stop = api.subscribeToLiveUpdates(authority, 'discovery', callback, home);
      subscriptions.push(stop); return stop;
    },
    connected: () => api.isDiscoveryLiveUpdateConnected(authority, home),
    state(state) { app.currentState = state; for (const callback of [...apps]) callback(state); },
    account(next) { authority = next; for (const callback of [...accounts]) callback(next); },
    hold: () => { holdClose = true; }, release,
    broadcast(topic, payload) {
      for (const peer of peers) if (peer.topics.has(topic) && peer.socket.readyState === 1) {
        peer.socket.send(JSON.stringify([peer.topics.get(topic), null, topic, 'broadcast', { event: 'discovery:invalidate', payload }]));
      }
    },
    async close() {
      release(); for (const stop of subscriptions) stop();
      await client.removeAllChannels();
      for (const peer of peers) peer.socket.terminate();
      await getBarrier()?.catch(() => {});
      await new Promise(resolve => server.close(resolve));
      await new Promise(resolve => http.close(resolve));
    },
  };
}

if (typeof globalThis.WebSocket !== 'function') {
  test('run real SDK teardown proof with Node 20 native WebSocket enabled', () => {
    assert.notEqual(process.env.DISCOVERY_NATIVE_WEBSOCKET_CHILD, '1', 'native WebSocket flag must provide the actual implementation');
    const env = { ...process.env, DISCOVERY_NATIVE_WEBSOCKET_CHILD: '1' };
    delete env.NODE_TEST_CONTEXT; // A nested runner must not silently skip its files.
    const result = spawnSync(process.execPath, ['--experimental-websocket', '--test', '--test-reporter=tap', fileURLToPath(import.meta.url)], {
      cwd: root, env, encoding: 'utf8', timeout: 60000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /# tests 6\b/u, 'all six actual socket cases executed in the native-flag child');
    assert.match(result.stdout, /# pass 6\b/u);
    assert.doesNotMatch(result.stderr, /skipping running files|called recursively/u);
  });
} else {
  test('production discovery waits for actual SDK socket teardown, including buffered-send and closing phases', { timeout: 15000 }, async () => {
    const h = await fixture(), delivered = [];
    try {
      h.subscribe(value => delivered.push(value));
      await until(() => h.connected() && h.client.getChannels().every(channel => channel.state === 'joined'), 'initial actual joins');
      assert.equal(h.client.getChannels().length, 2);
      h.hold(); h.state('background');
      await until(() => h.removals.length === 2 && h.removals.every(item => item.settled), 'actual removeChannel promises resolve');
      assert.ok(h.removals.every(item => item.status === 'ok'));
      assert.ok(h.getBarrier(), 'SDK disconnect promise outlives removeChannel (including buffered drain)');
      h.state('active');
      assert.equal(h.client.getChannels().length, 0, 'no replacement during pending real teardown');
      await until(() => h.peers.some(peer => peer.paused) && h.client.realtime.isDisconnecting(), 'native socket closing is held by actual TCP reads');
      assert.equal(await h.client.realtime.disconnect(), 'ok', 'SDK redundant disconnect returns early');
      assert.equal(h.client.realtime.isDisconnecting(), true, 'early ok is not close completion');
      assert.ok(h.getBarrier(), 'observer retains the first real close despite redundant early ok');
      await delay(40);
      assert.equal(h.client.getChannels().length, 0);
      assert.equal(h.peers.length, 1);
      h.release();
      await until(() => h.connected() && h.peers.length === 2 && h.client.getChannels().every(channel => channel.state === 'joined'),
        'fresh real socket and joins after teardown completes');
      // Let the initial whole-scope reconnect reconciliation drain before the
      // keyed hint; merging with that initial invalidation intentionally yields null.
      await delay(220);
      const key = 'a0000000-0000-4000-8000-000000000001';
      h.broadcast('realtime:discovery:v1:surface:home', { id: 'b0000000-0000-4000-8000-000000000001', keys: [key] });
      await until(() => delivered.some(value => value?.keys?.includes(key)), 'actual protocol frame reaches production reconciliation listener');
    } finally { await h.close(); }
  });

  test('negative control: ignoring only disconnect barrier strands replacement until explicit connect', { timeout: 15000 }, async () => {
    const h = await fixture({ ignoreDisconnectBarrier: true });
    try {
      h.subscribe(); await until(h.connected, 'initial join');
      h.hold(); h.state('background');
      await until(() => h.removals.length === 2 && h.removals.every(item => item.settled), 'old channel removal settled');
      h.state('active');
      await until(() => h.client.getChannels().length === 2, 'unprotected replacement attempted too early');
      await until(() => h.peers.some(peer => peer.paused) && h.client.realtime.isDisconnecting(), 'old native socket held closing');
      h.release();
      await until(() => h.client.realtime.connectionState() === 'closed', 'old native close finishes');
      await delay(200);
      assert.equal(h.peers.length, 1, 'clean disconnect does not reconnect the prematurely subscribed channel');
      assert.equal(h.connected(), false);
      h.client.realtime.connect();
      await until(() => h.connected() && h.peers.length === 2, 'explicit connect demonstrates stranded subscription, not server denial');
    } finally { await h.close(); }
  });

  test('account retirement while actual teardown waits cannot reconnect the stale generation', { timeout: 15000 }, async () => {
    const h = await fixture();
    try {
      h.subscribe(); await until(h.connected, 'initial join');
      h.hold(); h.state('background'); h.state('active');
      await until(() => h.client.realtime.isDisconnecting(), 'held native close');
      h.account(owner('replacement')); h.release();
      await until(() => h.getBarrier() === null, 'real teardown completes');
      await delay(40);
      assert.equal(h.client.getChannels().length, 0);
      assert.equal(h.peers.length, 1, 'retired waiting generation never opens another socket');
      h.subscribe(); await until(() => h.connected() && h.peers.length === 2, 'only newly mounted current generation reconnects');
    } finally { await h.close(); }
  });

  test('discovery retirement never disconnects an unrelated live SDK channel', { timeout: 15000 }, async () => {
    const h = await fixture();
    try {
      let unrelatedJoined = false;
      const unrelated = h.client.channel('unrelated-owner').subscribe(status => { unrelatedJoined = status === 'SUBSCRIBED'; });
      h.subscribe(); await until(() => unrelatedJoined && h.connected(), 'both actual channel owners joined');
      h.hold(); h.state('background');
      await until(() => h.removals.length === 2 && h.removals.every(item => item.settled), 'discovery channels removed');
      assert.equal(h.getBarrier(), null, 'no SDK disconnect was initiated with a peer still present');
      assert.equal(h.client.realtime.isConnected(), true);
      assert.deepEqual(h.client.getChannels(), [unrelated]);
      h.state('active'); await until(h.connected, 'discovery rejoins existing socket');
      assert.equal(unrelatedJoined, true);
      assert.equal(h.peers.length, 1, 'peer transport was neither closed nor replaced');
    } finally { await h.close(); }
  });

  test('actual native close rejection recovers only after a later genuine SDK teardown for the new account', { timeout: 15000 }, async () => {
    const h = await fixture();
    let oldCallbacks = 0, currentCallbacks = 0;
    try {
      h.subscribe(() => oldCallbacks++);
      await until(() => h.connected() && h.client.getChannels().every(channel => channel.state === 'joined'), 'initial actual joins');
      const phoenix = h.client.realtime.socketAdapter.getSocket();
      await until(() => phoenix.conn?.bufferedAmount === 0, 'native send buffer drained before invalid close');
      // WHATWG WebSocket permits 1000 or 3000..4999, not 1001. This is the real
      // installed SDK/native rejection, not a replaced disconnect implementation.
      await assert.rejects(h.client.realtime.disconnect(1001, 'fixture invalid code'), error => error.name === 'InvalidAccessError');
      await assert.rejects(h.getBarrier(), /realtime_disconnect_unconfirmed/u);
      assert.notEqual(phoenix.conn, null);
      assert.equal(phoenix.disconnecting, true);
      assert.equal(h.client.realtime.connectionState(), 'open');
      assert.ok(h.getBarrier(), 'reading failed barrier cannot falsely certify the still-attached socket');
      assert.equal(h.peers.length, 1);

      // A separate, genuine SDK lifecycle operation owns recovery. The observer
      // itself must not initiate it or let the prior rejection poison it forever.
      const completion = h.client.realtime.disconnect(1000, 'fixture genuine recovery');
      h.account(owner('after-rejection'));
      const retiredCallbacks = oldCallbacks;
      h.subscribe(() => currentCallbacks++);
      assert.equal(await completion, 'ok');
      await until(() => h.getBarrier() === null && h.connected() && h.peers.length === 2, 'later real teardown permits current-account actual join');
      await until(() => currentCallbacks > 0, 'current-account reconciliation delivered');
      assert.equal(oldCallbacks, retiredCallbacks, 'failed old generation never reconnects or receives replacement callbacks');
    } finally { await h.close(); }
  });

  test('actual ten-second SDK timeout recovers the same foreground reader after exact late teardown completion', { timeout: 25000 }, async () => {
    const h = await fixture();
    const phoenix = h.client.realtime.socketAdapter.getSocket();
    const originalTeardown = phoenix.teardown;
    let releaseCompletion = null, oldCallbacks = 0, recoveryCallbacks = 0;
    try {
      let probeJoined = false;
      const probe = h.client.channel('external-timeout-owner').subscribe(status => { probeJoined = status === 'SUBSCRIBED'; });
      await until(() => probeJoined && phoenix.conn?.bufferedAmount === 0, 'real external owner initially joined');
      // Fault injection ONLY pauses Phoenix's original completion callback after
      // real native close/detachment. Its disconnecting flag consequently remains
      // true. The original SocketAdapter timeout, native transport, public return
      // status and all production observer/discovery logic are unchanged.
      phoenix.teardown = function (callback, ...args) {
        phoenix.teardown = originalTeardown;
        return originalTeardown.call(this, () => { releaseCompletion = () => callback?.(); }, ...args);
      };
      const started = performance.now();
      const operation = h.client.realtime.disconnect(1000, 'fixture paused completion');
      h.subscribe(() => oldCallbacks++);
      await until(() => releaseCompletion !== null && phoenix.conn === null, 'real native socket closed and detached before held callback');
      assert.equal(h.client.realtime.connectionState(), 'closed');
      assert.equal(phoenix.disconnecting, true, 'public closed alone is not a completed Phoenix lifecycle');
      assert.ok(h.getBarrier(), 'active original promise cannot be bypassed by public closed state');
      assert.deepEqual(h.client.getChannels(), [probe], 'no discovery channel while true teardown is pending');
      assert.equal(await operation, 'timeout', 'unchanged installed SocketAdapter produces its real timeout');
      assert.ok(performance.now() - started >= 9900, 'real ten-second deadline, not shortened/faked timers');
      await assert.rejects(h.getBarrier(), /realtime_disconnect_unconfirmed/u);
      assert.equal(phoenix.disconnecting, true);
      h.account(owner('blocked-after-timeout')); h.subscribe(() => recoveryCallbacks++);
      await delay(20);
      assert.deepEqual(h.client.getChannels(), [probe], 'settled failure still blocks while internal teardown is incomplete');
      assert.equal(h.peers.length, 1);

      releaseCompletion(); releaseCompletion = null;
      assert.equal(phoenix.conn, null);
      assert.equal(phoenix.disconnecting, false);
      assert.equal(h.client.realtime.connectionState(), 'closed');
      // No account switch, remount, AppState cycle, getter-driven clearing or
      // manual connect after release: the mounted foreground reader must retry.
      await until(() => h.connected() && h.peers.length === 2, 'same foreground reader retries and joins after genuine late completion');
      await until(() => recoveryCallbacks > 0, 'same mounted reader receives actual reconnect reconciliation');
      assert.equal(h.getBarrier(), null, 'production retry cleared only the settled, exactly detached failure');
      assert.equal(oldCallbacks, 0, 'retired generation was never connected through the failed barrier');
    } finally {
      phoenix.teardown = originalTeardown;
      releaseCompletion?.();
      await h.close();
    }
  });
}
