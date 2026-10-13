import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { mountFullChatThread } from './assurance/helpers/chat-thread-full-mounted-harness.mjs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const evaluate = (source, imports = {}) => {
  const context = { exports: {}, URL, URLSearchParams, require: name => {
    assert.ok(name in imports, name); return imports[name];
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, context);
  return context.exports;
};
const links = evaluate(read('_lib/appLinks.ts'));
const targets = evaluate(read('_lib/notificationMessageTarget.ts'), { './appLinks': links });
const threadId = '10000000-0000-4000-8000-000000000001';
const otherThread = '10000000-0000-4000-8000-000000000002';
const id = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const route = `/chat/${threadId}`;
const context = { notificationType: 'chat_message', targetEntityId: threadId,
  targetContext: { threadId, messageId: id(2) } };

test('shared resolver only promotes exact message/thread metadata and retains old conversation links', () => {
  assert.equal(targets.resolveNotificationMessagePath(route, context), `${route}?messageId=${id(2)}`);
  assert.equal(targets.resolveNotificationMessagePath(route), route);
  for (const patch of [
    { notificationType: 'missed_call' }, { targetEntityId: otherThread },
    { targetContext: { threadId: otherThread, messageId: id(2) } },
    { targetContext: { threadId, messageId: 'bad' } },
    { targetContext: { threadId, messageId: `%32${id(2).slice(1)}` } },
    { targetContext: { threadId, messageId: [id(2)] } },
    { targetContext: [] }, { targetContext: null },
  ]) assert.equal(targets.resolveNotificationMessagePath(route, { ...context, ...patch }), route);
  const call = `${route}?callInviteId=${id(7)}&openCall=1`;
  assert.equal(targets.resolveNotificationMessagePath(call, context), call);
  assert.equal(targets.resolveNotificationMessagePath(`/chat/${otherThread}`, context), `/chat/${otherThread}`);
  assert.equal(targets.resolveNotificationMessagePath('/chilly-circle', context), '/chilly-circle');
});

test('actual app-link parser rejects malformed, duplicate, double-encoded and authority targets', () => {
  for (const query of [
    'messageId=bad', `messageId=${id(2)}&messageId=${id(3)}`,
    `messageId=${id(2)}&%6dessageId=${id(3)}`, 'messageId=%252Fother',
    `messageId=${id(2)}&userId=other`, `messageId=${id(2)}&access=paid`,
  ]) assert.equal(links.resolveApplicationRoute(`${route}?${query}`), null, query);
  assert.equal(links.resolveApplicationRoute(`${route}?messageId=${id(2)}`), `${route}?messageId=${id(2)}`);
  assert.equal(targets.normalizeChatMessageId([id(2)]), null);
});

test('actual Profile backed-notification action preserves the same message presentation target', () => {
  const source = read('app/profile/[userId].tsx');
  const ast = ts.createSourceFile('profile.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ['normalizeFeedUserId', 'openProfileSocialNotification'].includes(node.name.getText(ast))) {
      declarations.set(node.name.getText(ast), `const ${node.getText(ast)};`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.equal(declarations.size, 2);
  const routes = [], context = { exports: {}, router: { push: path => routes.push(path) },
    resolveNotificationPath: targets.resolveNotificationMessagePath };
  vm.runInNewContext(ts.transpileModule([...declarations.values()].join('\n')
    + '\nglobalThis.open = openProfileSocialNotification;', { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText, context);
  context.open({ notification: { notificationType: 'chat_message',
    target: { route: '/chat/[threadId]', entityId: threadId, context: { threadId, messageId: id(2) } } } });
  assert.deepEqual(routes, [`${route}?messageId=${id(2)}`]);
});

const message = (n, extra = {}) => ({ id: id(n), threadId, senderUserId: 'remote-user',
  body: `Authorized message ${n}`, createdAt: new Date(1700000000000 + n).toISOString(),
  attachments: [], moderationStatus: 'clean', isModerationHidden: false, ...extra });
const layout = (y, height) => ({ nativeEvent: { layout: { x: 0, y, width: 300, height } } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function mount(t, options = {}) {
  const rows = options.rows ?? Array.from({ length: 240 }, (_, i) => message(i + 1));
  const h = await mountFullChatThread({ noActiveCall: true, threadId,
    routeParams: options.target === null ? {} : { messageId: options.target ?? id(210) },
    readMessages: async () => rows,
    readThread: async () => ({ threadId, members: [], currentMember: { userId: 'local-user' },
      otherMember: { userId: 'remote-user', displayName: 'Other' } }), ...options,
  });
  t.after(() => h.unmount());
  const commands = [];
  const nativeScroll = { scrollTo: command => commands.push({ ...command }) };
  const measure = async (bindings = h.runtime.snapshot.messageBindings, measured = rows) => {
    await h.run(() => {
      bindings.ref(nativeScroll);
      bindings.onLayout(layout(0, 400));
      measured.forEach((row, index) => bindings.bubble(row)(layout(index * 50, 50)));
      bindings.onContentSizeChange(300, measured.length * 50 + 700); // trailing call history is not the message target
    });
  };
  return { ...h, rows, commands, measure, nativeScroll };
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: actual screen layout positions a long authorized collection once and does not yank on realtime`, async t => {
    const h = await mount(t, { platform });
    await h.measure();
    assert.deepEqual(h.commands, [{ animated: false, y: 10450 }]);
    await h.run(() => h.runtime.snapshot.loadThreadState());
    await h.measure();
    assert.equal(h.commands.length, 1);
    await h.rerender({ focused: false }); await h.rerender({ focused: true }); await h.measure();
    assert.equal(h.commands.length, 1, 'same entry survives loading/refocus without a second jump');
  });
}

for (const [name, target, patch] of [
  ['old thread-only link', null, {}],
  ['deleted or missing target', id(999), {}],
  ['moderation-hidden target', id(1), { isModerationHidden: true }],
  ['wrong-thread target', id(1), { threadId: otherThread }],
]) test(`${name}: latest authorized message is visible, not trailing call history`, async t => {
  const rows = Array.from({ length: 240 }, (_, i) => message(i + 1, i === 0 ? patch : {}));
  const h = await mount(t, { target, rows });
  await h.measure(undefined, rows);
  assert.deepEqual(h.commands, [{ animated: false, y: 11600 }]);
});

for (const transition of ['drag', 'blur', 'background']) {
  test(`pending native layout cannot override ${transition}`, async t => {
    const h = await mount(t);
    const old = h.runtime.snapshot.messageBindings;
    if (transition === 'drag') await h.run(() => old.onScrollBeginDrag());
    if (transition === 'blur') { await h.rerender({ focused: false }); await h.rerender({ focused: true }); }
    if (transition === 'background') { await h.appState('background'); await h.appState('active'); }
    await h.measure(old);
    assert.deepEqual(h.commands, []);
  });
}

test('a notification mounted before foreground activation uses its owned geometry when active', async t => {
  const h = await mount(t, { appState: 'inactive' });
  await h.measure(); assert.deepEqual(h.commands, []);
  await h.appState('active');
  assert.deepEqual(h.commands, [{ animated: false, y: 10450 }]);
});

for (const changedCollection of [false, true]) {
  test(`actual screen key remounts the native list for a fresh target, changed collection=${changedCollection}`, async t => {
    const h = await mount(t);
    const old = h.runtime.snapshot.messageBindings, held = deferred();
    const root = createRoot({ ...document.documentElement });
    t.after(() => React.act(async () => root.unmount()));
    let mounts = 0, unmounts = 0;
    // Native layout is modeled only on actual React mount. Keeping the same
    // key deliberately supplies no further layout events, reproducing the bug.
    function NativeList({ bindings, rows }) {
      React.useLayoutEffect(() => {
        mounts++;
        const node = { scrollTo: command => h.commands.push({ ...command }) };
        bindings.ref(node);
        bindings.onLayout(layout(0, 400));
        rows.forEach((row, index) => bindings.bubble(row)(layout(index * 50, 50)));
        bindings.onContentSizeChange(300, rows.length * 50 + 700);
        return () => { unmounts++; bindings.ref(null); };
      }, []);
      return null;
    }
    const renderNative = (bindings, rows) => React.act(async () => root.render(
      React.createElement(NativeList, { key: bindings.key, bindings, rows })));
    await renderNative(old, h.rows);
    assert.deepEqual(h.commands, [{ animated: false, y: 10450 }]);
    await h.rerender({ params: { messageId: id(3) }, readMessages: () => held.promise });
    assert.equal(h.commands.length, 1, 'new target waits for the fresh owned reader');
    await renderNative(h.runtime.snapshot.messageBindings, h.rows);
    assert.equal(mounts, 1, 'pending old data cannot consume the new target native mount');
    const nextRows = changedCollection ? h.rows.slice(1) : h.rows;
    await h.run(() => held.resolve(nextRows));
    assert.equal(h.commands.length, 1, 'the old target coordinates cannot be consumed by the new read');
    const next = h.runtime.snapshot.messageBindings;
    assert.notEqual(next.key, old.key);
    await renderNative(next, nextRows);
    assert.deepEqual(h.commands, [{ animated: false, y: 10450 }, { animated: false, y: changedCollection ? 50 : 100 }]);
    assert.equal(mounts, 2); assert.equal(unmounts, 1);
    await h.run(() => h.runtime.snapshot.loadThreadState());
    await renderNative(h.runtime.snapshot.messageBindings, nextRows);
    assert.equal(mounts, 2, 'ordinary realtime read preserves the same native list');
    assert.equal(h.commands.length, 2);
  });
}

test('a remounted native list must not reuse the previous instance geometry', async t => {
  const h = await mount(t); await h.measure();
  const held = deferred(), old = h.runtime.snapshot.messageBindings;
  await h.rerender({ params: { messageId: id(3) }, readMessages: () => held.promise });
  await h.run(() => { old.ref(null); old.ref({ scrollTo: command => h.commands.push({ ...command }) }); });
  await h.run(() => held.resolve(h.rows));
  assert.equal(h.commands.length, 1);
  await h.measure();
  assert.deepEqual(h.commands, [{ animated: false, y: 10450 }, { animated: false, y: 100 }]);
});

test('native content must include the measured target before its one layout action', async t => {
  const h = await mount(t), bindings = h.runtime.snapshot.messageBindings;
  await h.run(() => {
    bindings.ref(h.nativeScroll);
    bindings.onLayout(layout(0, 400));
    bindings.bubble(h.rows[209])(layout(10450, 50));
    bindings.onContentSizeChange(300, 400);
  });
  assert.deepEqual(h.commands, []);
  await h.run(() => bindings.onContentSizeChange(300, 12700));
  assert.deepEqual(h.commands, [{ animated: false, y: 10450 }]);
});

for (const transition of ['account', 'session', 'thread']) {
  test(`held old read and layout cannot position after ${transition} replacement`, async t => {
    const held = deferred();
    const h = await mount(t, { readMessages: () => held.promise });
    const old = h.runtime.snapshot.messageBindings;
    const patch = transition === 'account' ? { userId: 'replacement' }
      : transition === 'session' ? { sessionGeneration: 'replacement' } : { threadId: otherThread };
    await h.rerender({ ...patch, readThread: async () => null, readMessages: async () => [] });
    await h.run(() => held.resolve(h.rows));
    await h.measure(old); await h.measure();
    assert.deepEqual(h.commands, []);
  });
}

test('missing membership and an empty authorized thread issue no native positioning request', async t => {
  const denied = await mount(t, { readThread: async () => ({ threadId, members: [], currentMember: null }) });
  await denied.measure(); assert.deepEqual(denied.commands, []);
  const empty = await mount(t, { rows: [] }); await empty.measure(); assert.deepEqual(empty.commands, []);
});
