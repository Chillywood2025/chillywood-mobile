import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';

const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const act = fn => React.act(async () => { await fn(); for (let i = 0; i < 12; i++) await Promise.resolve(); });
const ready = (id = 'first') => ({ canRenderPlayback: true, state: 'ready', title: `Replay ${id}`, playbackUrl: `https://app.example.test/functions/v1/creator-replay-playback/records/${id}/index.m3u8`, copy: 'Controlled replay', fullRoomTokenForSpectators: false, liveKitPublishAuthorityGranted: false, rawHlsUrlReturned: false });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function mount(t, options = {}) {
  let route = { replayId: 'first' }, mounted = true;
  const nodes = new Map(), players = [], reads = [], signals = [], timers = new Set();
  const host = type => props => {
    const id = React.useId(); nodes.set(id, { type, props });
    React.useLayoutEffect(() => () => nodes.delete(id), [id]);
    return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(x => typeof x === 'object'));
  };
  const native = Object.fromEntries(['View', 'Text', 'TouchableOpacity', 'ActivityIndicator', 'ImageBackground'].map(name => [name, host(name)]));
  native.StyleSheet = { create: x => x, absoluteFillObject: {} };
  const mocks = {
    react: React, 'react-native': native,
    '@expo/vector-icons/MaterialIcons': () => null,
    'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') },
    'expo-router': { useLocalSearchParams: () => route, useRouter: () => ({ back: noop }) },
    '../../../_lib/creatorReplays': { resolveCreatorReplayPlayback: async (id, signal) => { reads.push(id); signals.push(signal); return options.resolve ? options.resolve(id, reads.length) : ready(id); } },
    'expo-video': {
      VideoView: host('VideoView'),
      useVideoPlayer(source, setup) {
        // Matches installed expo-video's source-keyed player creation/release.
        const key = JSON.stringify(source);
        const player = React.useMemo(() => {
          const listeners = new Set();
          const p = { source, status: source ? (options.initialStatus ?? 'loading') : 'idle', played: 0, paused: 0, released: false,
            play() { this.played++; }, pause() { this.paused++; },
            addListener(name, cb) { assert.equal(name, 'statusChange'); listeners.add(cb); return { remove: () => listeners.delete(cb) }; },
            emit(status) { this.status = status; for (const cb of listeners) cb({ status, error: status === 'error' ? { message: 'private-upstream-detail' } : null }); },
            listeners,
          };
          setup(p); players.push(p); return p;
        }, [key]);
        React.useEffect(() => () => { player.released = true; }, [player]);
        return player;
      },
    },
  };
  const source = fs.readFileSync(process.env.REPLAY_PLAYER_SOURCE ?? new URL('../app/player/replay/[replayId].tsx', import.meta.url), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText,
    { exports, AbortController, require: name => name.endsWith('.png') ? 1 : mocks[name], setTimeout: callback => { timers.add(callback); return callback; }, clearTimeout: callback => timers.delete(callback) });
  const root = createRoot(container());
  const render = () => act(() => root.render(React.createElement(exports.default)));
  const unmount = async () => { if (mounted) { mounted = false; await act(() => root.unmount()); } };
  t.after(unmount); await render();
  return { reads, players, signals, timers, unmount, get player() { return players.at(-1); },
    all: () => [...nodes.values()], text: () => [...nodes.values()].filter(n => n.type === 'Text').map(n => n.props.children).join(' '),
    async pressRetry() { const button = [...nodes.values()].find(n => n.props.testID === 'content-library-replay-retry-button'); assert.ok(button, 'accessible Retry must be visible'); await act(() => button.props.onPress()); },
    emit: status => act(() => players.at(-1).emit(status)),
    route: async id => { route = { replayId: id }; await render(); },
    resolve: (d, value) => act(() => d.resolve(value)),
    timeout: () => act(() => { const pending = [...timers]; timers.clear(); pending.forEach(fn => fn()); }),
  };
}

test('actual replay screen distinguishes metadata ready from native loading and error', async t => {
  const h = await mount(t);
  assert.match(h.text(), /Loading replay/);
  await h.emit('error');
  assert.match(h.text(), /Replay couldn.t play/);
  assert.doesNotMatch(h.text(), /private-upstream-detail/);
  assert.equal(h.all().some(n => n.type === 'VideoView'), false);
  await h.pressRetry(); assert.equal(h.reads.length, 2);
});

test('actual replay screen retries same URL with a fresh native player and can recover', async t => {
  const h = await mount(t); const old = h.player;
  await h.emit('error'); await h.pressRetry();
  assert.notEqual(h.player, old); assert.equal(old.released, true); assert.equal(old.listeners.size, 0);
  await h.emit('readyToPlay');
  assert.doesNotMatch(h.text(), /Replay couldn.t play|Loading replay/);
  assert.ok(h.all().some(n => n.type === 'VideoView' && n.props.nativeControls));
});

test('actual replay screen bounds native loading with a visible retry state', async t => {
  const h = await mount(t);
  await h.timeout();
  assert.match(h.text(), /Replay couldn.t play/);
  assert.ok(h.player.paused > 0);
  await h.pressRetry(); assert.equal(h.reads.length, 2);
});

test('actual replay screen releases old media immediately on route change and ignores stale resolution', async t => {
  const second = deferred(), third = deferred();
  const h = await mount(t, { resolve: id => id === 'second' ? second.promise : id === 'third' ? third.promise : ready(id) });
  const old = h.player;
  await h.route('second'); assert.equal(old.released, true); assert.equal(h.player.source, null);
  await h.route('third'); await h.resolve(second, ready('second'));
  assert.equal(h.player.source, null);
  await h.resolve(third, ready('third')); assert.match(h.player.source.uri, /third/);
});

test('actual replay screen displays resolver failures and retries without mounting media', async t => {
  const h = await mount(t, { resolve: (_id, attempt) => attempt === 1 ? Promise.reject(new Error('network failure')) : ready() });
  assert.equal(h.player.source, null); await h.pressRetry();
  assert.ok(h.player.source); assert.equal(h.reads.length, 2);
});

test('actual replay screen cleans native listeners and loading timer on unmount', async t => {
  const h = await mount(t); const player = h.player;
  await h.unmount(); assert.equal(player.released, true); assert.equal(player.listeners.size, 0); assert.equal(h.timers.size, 0);
});

test('a player already ready when listeners attach stays playable without a loading timeout', async t => {
  const h = await mount(t, { initialStatus: 'readyToPlay' });
  assert.doesNotMatch(h.text(), /Loading replay/); assert.equal(h.timers.size, 0);
  assert.equal(h.player.played, 1);
});

test('late callbacks from a released player cannot break the newer replay', async t => {
  const h = await mount(t); const old = h.player; const callbacks = [...old.listeners];
  await h.route('second'); await h.emit('readyToPlay');
  await act(() => callbacks.forEach(callback => callback({ status: 'error' })));
  assert.doesNotMatch(h.text(), /Replay couldn.t play/); assert.match(h.player.source.uri, /second/);
  assert.equal(h.timers.size, 0);
});

test('ready clears a pending loading timeout and native failures still show Retry', async t => {
  const h = await mount(t); assert.equal(h.timers.size, 1);
  await h.emit('readyToPlay'); assert.equal(h.timers.size, 0);
  await h.timeout(); assert.doesNotMatch(h.text(), /Replay couldn.t play/);
  await h.emit('error'); assert.match(h.text(), /Replay couldn.t play/);
});

test('metadata timeout cancels a stalled read, permits retry and ignores the late result', async t => {
  const pending = deferred();
  const h = await mount(t, { resolve: (_id, attempt) => attempt === 1 ? pending.promise : ready('fresh') });
  await h.timeout();
  assert.match(h.text(), /took too long/); assert.equal(h.signals[0].aborted, true);
  await h.pressRetry(); assert.match(h.player.source.uri, /fresh/);
  await h.resolve(pending, ready('stale')); assert.match(h.player.source.uri, /fresh/);
});

test('leaving a pending metadata read cancels it and cannot mount late media', async t => {
  const pending = deferred(); const h = await mount(t, { resolve: () => pending.promise });
  await h.unmount(); assert.equal(h.signals[0].aborted, true); assert.equal(h.timers.size, 0);
  await h.resolve(pending, ready()); assert.ok(h.players.every(p => p.source === null));
});

test('production replay resolver forwards cancellation to its metadata HTTP request', async () => {
  const controller = new AbortController(); controller.abort();
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(process.env.REPLAY_HELPER_SOURCE ?? new URL('../_lib/creatorReplays.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL,
    require: () => ({ SUPABASE_FUNCTIONS_URL: 'https://app.example.test', SUPABASE_ANON_KEY: 'synthetic-public', supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }),
    fetch: async (_url, init) => { assert.equal(init.signal, controller.signal); assert.equal(init.signal.aborted, true); throw new Error('synthetic-aborted-request'); },
  });
  await assert.rejects(exports.resolveCreatorReplayPlayback('fixture', controller.signal), /synthetic-aborted-request/);
});
