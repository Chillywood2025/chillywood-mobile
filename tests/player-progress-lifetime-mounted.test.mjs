import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container();
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
const source = fs.readFileSync(process.env.PLAYER_PROGRESS_SOURCE ?? new URL('../app/player/[id].tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hook = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'usePlayerProgressLifetime');
assert.ok(hook, 'tests mount the production Player lifetime hook');
const hookSource = hook.getText(ast);
const owner = (userId = 'a', sessionGeneration = 'one') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function mount(t, transform = value => value) {
  const runtime = { authority: owner(), writes: [], attempts: [], barrier: null, listeners: new Set(), completionFailures: 0, logs: [] };
  // The helper boundary enforces explicit expected authority. Omitting it
  // deliberately models the old helper's late account capture.
  const record = async (kind, title, position, duration, ...expected) => {
    const binding = expected.length ? expected[0] : runtime.authority;
    runtime.attempts.push({ kind, title, position, duration, binding });
    if (JSON.stringify(binding) !== JSON.stringify(runtime.authority)) return;
    const operation = { kind, title, position, duration, binding };
    if (runtime.barrier) await runtime.barrier.promise;
    if (JSON.stringify(binding) !== JSON.stringify(runtime.authority)) return;
    if (kind === 'complete' && runtime.completionFailures > 0) {
      runtime.completionFailures -= 1;
      throw new Error('local storage unavailable');
    }
    runtime.writes.push(operation);
  };
  const code = ts.transpileModule(`${transform(hookSource)}\nexports.useLifetime = usePlayerProgressLifetime;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { ...React, exports,
    debugLog: (...args) => runtime.logs.push(args),
    getCurrentAccountSessionAuthoritySnapshot: () => runtime.authority,
    sameAccountSessionAuthority: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    subscribeToAccountSessionAuthority: listener => { runtime.listeners.add(listener); return () => runtime.listeners.delete(listener); },
    writeProgressForTitle: (...args) => record('progress', ...args),
    clearProgressForTitle: (title, ...expected) => record('complete', title, undefined, undefined, ...expected),
  });
  const props = { title: 'first-title', authority: runtime.authority };
  let current, mounted = true;
  function Probe() { current = exports.useLifetime(props.title, props.authority); return null; }
  const root = createRoot(container());
  const act = fn => React.act(async () => { await fn(); await Promise.resolve(); });
  const render = () => root.render(React.createElement(Probe));
  await act(render);
  t.after(async () => { if (mounted) await act(() => root.unmount()); });
  return { runtime, act, get current() { return current; },
    update: patch => act(() => { Object.assign(props, patch); render(); }),
    unmount: () => act(() => { root.unmount(); mounted = false; }),
  };
}

test('live progress preserves backward seek; cleanup retains the last observation', async t => {
  const h = await mount(t);
  await h.act(() => { h.current.persist(600, 1000); h.current.persist(200, 1000); h.current.observe(230, 1000); });
  await h.unmount();
  assert.deepEqual(h.runtime.writes.map(row => row.position), [600, 200, 230]);
  assert.ok(h.runtime.writes.every(row => row.title === 'first-title' && row.binding.userId === 'a'));
});

for (const change of ['account', 'generation', 'guest-sign-in']) {
  test(`delayed callbacks and unmount cannot acquire a replacement ${change}`, async t => {
    const h = await mount(t);
    if (change === 'guest-sign-in') { h.runtime.authority = null; await h.update({ authority: null }); }
    const old = h.current;
    await h.act(() => old.observe(250, 1000));
    h.runtime.authority = change === 'generation' ? owner('a', 'two') : owner('b');
    // Intentionally do not rerender: these callbacks run before React receives
    // the session change, the hole that render-time invalidation alone misses.
    await h.act(() => { old.persist(260, 1000); old.complete(); });
    await h.unmount();
    assert.equal(h.runtime.writes.length, 0);
    assert.ok(h.runtime.attempts.every(row => row.binding?.userId !== 'b'));
  });
}

test('a deferred write settling after account replacement is still account-bound', async t => {
  const h = await mount(t), barrier = deferred(); h.runtime.barrier = barrier;
  await h.act(() => h.current.persist(200, 1000));
  h.runtime.authority = owner('b');
  await h.update({ authority: h.runtime.authority });
  await h.act(() => barrier.resolve());
  assert.equal(h.runtime.writes.length, 0);
  assert.equal(h.runtime.attempts[0].binding.userId, 'a');
});

test('title replacement flushes only its own observation and retires old callbacks', async t => {
  const h = await mount(t), old = h.current;
  await h.act(() => old.observe(300, 1000));
  await h.update({ title: 'second-title' });
  await h.act(() => { h.current.observe(80, 900); old.persist(700, 1000); old.restart(1000); old.complete(); });
  await h.unmount();
  assert.deepEqual(h.runtime.writes.map(({ title, position }) => [title, position]), [['first-title', 300], ['second-title', 80]]);
});

for (const completion of ['threshold', 'finish']) {
  test(`${completion} completion rejects trailing progress and cleanup until explicit rewatch`, async t => {
    const h = await mount(t), old = h.current;
    await h.act(() => {
      old.persist(400, 1000);
      if (completion === 'threshold') old.persist(960, 1000); else old.complete();
      old.observe(500, 1000); old.persist(500, 1000); old.complete();
    });
    assert.deepEqual(h.runtime.writes.map(row => row.kind), ['progress', 'complete']);
    await h.act(() => old.restart(1000));
    await h.act(() => { old.persist(800, 1000); old.complete(); old.restart(1000); h.current.persist(100, 1000); });
    await h.unmount();
    assert.deepEqual(h.runtime.writes.map(row => [row.kind, row.position]), [
      ['progress', 400], ['complete', undefined], ['progress', 0], ['progress', 100], ['progress', 100],
    ]);
  });
}

test('pending replay completion after unmount cannot revive the old lifetime', async t => {
  const h = await mount(t), old = h.current, replay = deferred();
  const callback = replay.promise.then(() => old.restart(1000));
  await h.act(() => old.complete());
  await h.unmount();
  await h.act(async () => { replay.resolve(); await callback; });
  assert.deepEqual(h.runtime.writes.map(row => row.kind), ['complete']);
});

test('equivalent authority snapshots do not reopen a completed lifetime', async t => {
  const h = await mount(t), old = h.current;
  await h.act(() => old.complete());
  await h.update({ authority: { ...h.runtime.authority } });
  assert.equal(h.current, old);
  await h.act(() => h.current.persist(200, 1000));
  assert.deepEqual(h.runtime.writes.map(row => row.kind), ['complete']);
});

test('deliberate backward seek after 96% starts rewatch and retires trailing old callbacks', async t => {
  const h = await mount(t), old = h.current;
  await h.act(() => old.persist(960, 1000));
  const commitSeek = old.prepareSeek();
  await h.act(() => commitSeek(200, 1000));
  assert.notEqual(h.current, old);
  await h.act(() => { old.persist(600, 1000); old.complete(); commitSeek(300, 1000); h.current.persist(210, 1000); });
  assert.deepEqual(h.runtime.writes.map(row => [row.kind, row.position]), [
    ['complete', undefined], ['progress', 200], ['progress', 210],
  ]);
});

test('a backward seek pending before completion cannot reopen the completed lifetime', async t => {
  const h = await mount(t), old = h.current, seek = deferred();
  const commitSeek = old.prepareSeek();
  const callback = seek.promise.then(() => commitSeek(200, 1000));
  await h.act(() => old.persist(960, 1000));
  await h.act(async () => { seek.resolve(); assert.equal(await callback, false); });
  assert.deepEqual(h.runtime.writes.map(row => row.kind), ['complete']);
});

test('failed completion persistence retries the completion intent without reopening ordinary progress', async t => {
  const h = await mount(t); h.runtime.completionFailures = 1;
  await h.act(() => h.current.persist(960, 1000));
  assert.equal(h.runtime.writes.length, 0);
  assert.equal(h.runtime.logs.length, 1);
  const barrier = deferred(); h.runtime.barrier = barrier;
  await h.act(() => { h.current.persist(200, 1000); h.current.observe(300, 1000); h.current.complete(); });
  assert.equal(h.runtime.attempts.length, 2, 'one failure and one in-flight retry, without duplicates');
  assert.ok(h.runtime.attempts.every(row => row.kind === 'complete'));
  await h.act(() => barrier.resolve());
  await h.act(() => { h.current.persist(400, 1000); h.current.complete(); });
  await h.unmount();
  assert.equal(h.runtime.attempts.length, 2, 'persisted completion is not retried');
  assert.deepEqual(h.runtime.writes.map(row => row.kind), ['complete']);
});

test('failed completion cannot retry into a replacement account', async t => {
  const h = await mount(t); h.runtime.completionFailures = 1;
  await h.act(() => h.current.complete());
  h.runtime.authority = owner('b');
  await h.act(() => { h.runtime.listeners.forEach(listener => listener()); h.current.complete(); h.current.persist(200, 1000); });
  await h.unmount();
  assert.equal(h.runtime.attempts.length, 1);
  assert.equal(h.runtime.writes.length, 0);
});

test('cleanup retries failed finish persistence even without an observed position', async t => {
  const h = await mount(t); h.runtime.completionFailures = 1;
  await h.act(() => h.current.complete());
  await h.unmount();
  assert.equal(h.runtime.attempts.length, 2);
  assert.deepEqual(h.runtime.writes.map(row => row.kind), ['complete']);
});

for (const retirement of ['title replacement', 'account revocation']) {
  test(`manual seek commit remains bound across ${retirement}`, async t => {
    const h = await mount(t), old = h.current;
    await h.act(() => old.complete());
    const commitSeek = old.prepareSeek();
    if (retirement === 'title replacement') await h.update({ title: 'next-title' });
    else await h.act(() => { h.runtime.authority = owner('b'); h.runtime.listeners.forEach(listener => listener()); });
    await h.act(() => assert.equal(commitSeek(200, 1000), false));
    assert.deepEqual(h.runtime.writes.map(row => row.kind), ['complete']);
  });
}

test('transient account revocation retires callbacks even when authority returns before React rerenders', async t => {
  const h = await mount(t), old = h.current, original = h.runtime.authority;
  await h.act(() => {
    old.observe(200, 1000);
    h.runtime.authority = null;
    h.runtime.listeners.forEach(listener => listener());
    h.runtime.authority = original;
    h.runtime.listeners.forEach(listener => listener());
    old.persist(300, 1000); old.complete(); old.restart(1000);
  });
  await h.unmount();
  assert.equal(h.runtime.writes.length, 0);
  assert.equal(h.runtime.listeners.size, 0);
});

test('Player routes status, finish, both replay paths, and ordinary progress through the lifetime', () => {
  const screen = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'PlayerScreen').getText(ast);
  assert.match(screen, /usePlayerProgressLifetime\(titleId, sessionAuthority\)/);
  assert.match(screen, /progressLifetime\.observe\(position, duration\)/);
  assert.match(screen, /progressLifetime\.complete\(\)/);
  assert.equal((screen.match(/progressLifetime\.restart\(/g) ?? []).length, 2);
  assert.equal((screen.match(/const commitProgress = prepareSeekProgress\(\)/g) ?? []).length, 5);
  assert.equal((screen.match(/commitProgress\((?:next|finalPosition), duration\)/g) ?? []).length, 5);
  assert.doesNotMatch(screen, /(?:writeProgressForTitle|clearProgressForTitle)\(/);
});

test('negative control: omitting expected authority reproduces replacement-account contamination', async t => {
  const h = await mount(t, value => value.replaceAll(', binding)', ')'));
  h.runtime.authority = owner('b');
  await h.act(() => h.current.persist(200, 1000));
  assert.equal(h.runtime.writes[0].binding.userId, 'b');
});

test('negative control: removing completion guard admits a trailing incomplete write', async t => {
  const h = await mount(t, value => value.replace('if (completionRequested) { complete(); return false; }', ''));
  await h.act(() => { h.current.complete(); h.current.persist(200, 1000); });
  assert.deepEqual(h.runtime.writes.map(row => row.kind), ['complete', 'progress']);
});
