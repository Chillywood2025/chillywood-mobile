import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { createNotificationActivityHandler } from '../supabase/functions/_shared/notification-activity-worker.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const run = (source, extra = {}) => {
  const sandbox = { exports: {}, Date, URL, URLSearchParams, ...extra };
  vm.runInNewContext(compile(source), sandbox);
  return sandbox;
};

// Execute the actual client response handler and complete route resolver. Only
// storage, provider transport and native Notifications boundaries are modeled.
const links = run(read('_lib/appLinks.ts')).exports;
const messageTargets = run(read('_lib/notificationMessageTarget.ts'), { require: name => {
  assert.equal(name, './appLinks'); return links;
} }).exports;
const ast = ts.createSourceFile('_lib/notifications.ts', read('_lib/notifications.ts'), ts.ScriptTarget.Latest, true);
const declaration = name => {
  let found;
  const visit = node => {
    if ((ts.isFunctionDeclaration(node) && node.name?.text === name)
      || (ts.isVariableDeclaration(node) && node.name.getText(ast) === name)) found = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(found, `actual client declaration ${name}`);
  return ts.isVariableDeclaration(found) ? `const ${found.getText(ast)};` : found.getText(ast);
};
const responseSource = ['normalizeText', 'normalizeNotificationPath', 'resolveNotificationPath', 'subscribeToNotificationResponses']
  .map(declaration).join('\n') + '\nglobalThis.subscribe = subscribeToNotificationResponses;';
const threadId = '00000000-0000-4000-8000-000000000111';
const route = `/chat/${threadId}`;
// Matches reserve_notification_activity_push's data contract in
// 20261010180545_notification_activity_outbox.sql; no database runs here.
const baseData = { notificationId: 'notification-one', notificationType: 'chat_message',
  category: 'new_message', route, targetRoute: '/chat/[threadId]', targetEntityId: threadId,
  targetContext: { threadId, messageId: 'message-one' } };

async function emittedData(platform, extraData = {}) {
  const data = { ...baseData, ...extraData };
  const before = structuredClone(data);
  const reservation = { eligible: true, token: 'ExponentPushToken[test-only]', platform, badge: 8,
    title: "New Chi'lly Chat message", body: 'You have a new message.', data };
  const calls = [];
  const sends = [];
  const handler = createNotificationActivityHandler({ adminClient: { async rpc(name, args) {
    calls.push([name, args]);
    const results = { authorize_notification_activity_worker: true,
      claim_notification_activity_batch: [{ eventId: 'event-one', leaseToken: 'lease-one' }],
      prepare_notification_activity: { eligible: true, tokenIds: ['token-one'] },
      reserve_notification_activity_push: reservation, complete_notification_activity_push: true,
      finish_notification_activity: true };
    assert.ok(Object.hasOwn(results, name), `unexpected RPC ${name}`);
    return { data: results[name], error: null };
  } }, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://exp.host/--/api/v2/push/send');
    sends.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ data: { status: 'ok', id: 'ticket-one' } }));
  } });
  const response = await handler(new Request('https://local.invalid', { method: 'POST',
    headers: { 'x-chillywood-activity-token': 'test-only' } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', completed: 1, accepted: 1, unresolved: 0 });
  assert.equal(sends.length, 1);
  assert.deepEqual(data, before, 'the reservation is not mutated');
  for (const [key, value] of Object.entries(JSON.parse(JSON.stringify(data)))) {
    if (key === 'deepLink' && value === null) continue;
    assert.deepEqual(sends[0].data[key], value, `preserved ${key}`);
  }
  assert.equal(calls.find(([name]) => name === 'complete_notification_activity_push')[1].p_status, 'sent');
  return sends[0].data;
}

async function client(data, mode = 'listener') {
  const observed = { paths: [], badgeClears: 0, responseClears: 0 };
  let listener;
  const response = { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: { request: { identifier: 'notification-one', content: { data } } } };
  const sandbox = run(responseSource, { resolveApplicationRoute: links.resolveApplicationRoute,
    resolveNotificationMessagePath: messageTargets.resolveNotificationMessagePath,
    handledNotificationResponseKeys: new Set(),
    clearApplicationNotificationBadge: async () => { observed.badgeClears++; },
    Notifications: {
      getLastNotificationResponseAsync: async () => mode === 'last-response' ? response : null,
      addNotificationResponseReceivedListener: callback => { listener = callback; return { remove() {} }; },
      clearLastNotificationResponseAsync: async () => { observed.responseClears++; },
    } });
  sandbox.subscribe(value => observed.paths.push(value));
  await Promise.resolve();
  await Promise.resolve();
  if (mode === 'listener') listener(response);
  return { observed, repeat: () => listener(response) };
}

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};
const settleResponses = async () => { await Promise.resolve(); await Promise.resolve(); };

// Execute the same production handler across subscription replacement. Native
// removal cannot cancel the already-returned initial-read promise, and a native
// callback may already be queued when its listener is removed.
function responseLifecycle({ callbackDuringRemove = false } = {}) {
  const observed = { paths: [], badgeClears: 0, responseClears: 0 };
  const pendingInitialReads = [], nativeListeners = [], handled = new Set();
  const response = { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: { request: { identifier: 'notification-lifetime', content: { data: { deepLink: route } } } } };
  const sandbox = run(responseSource, {
    resolveApplicationRoute: links.resolveApplicationRoute,
    resolveNotificationMessagePath: messageTargets.resolveNotificationMessagePath,
    handledNotificationResponseKeys: handled,
    clearApplicationNotificationBadge: async () => { observed.badgeClears++; },
    Notifications: {
      getLastNotificationResponseAsync() {
        const read = deferred(); pendingInitialReads.push(read); return read.promise;
      },
      addNotificationResponseReceivedListener(callback) {
        const listener = { callback, removes: 0 }; nativeListeners.push(listener);
        return { remove() {
          listener.removes++;
          if (callbackDuringRemove) callback(response);
        } };
      },
      clearLastNotificationResponseAsync: async () => { observed.responseClears++; },
    },
  });
  return { observed, pendingInitialReads, nativeListeners, handled, response,
    subscribe: label => sandbox.subscribe(path => observed.paths.push({ label, path })) };
}

test('removal retires the pending initial notification before navigation, deduplication or receipt clearing', async () => {
  const h = responseLifecycle(), subscription = h.subscribe('removed');
  subscription.remove();
  h.pendingInitialReads[0].resolve(h.response);
  await settleResponses();
  assert.deepEqual(h.observed, { paths: [], badgeClears: 0, responseClears: 0 });
  assert.equal(h.handled.size, 0);
  assert.equal(h.nativeListeners[0].removes, 1);
});

for (const oldReadFirst of [true, false]) {
  test(`replacement receives the same initial notification exactly once, removed read first=${oldReadFirst}`, async () => {
    const h = responseLifecycle(), old = h.subscribe('removed');
    old.remove();
    const successor = h.subscribe('current');
    for (const index of oldReadFirst ? [0, 1] : [1, 0]) {
      h.pendingInitialReads[index].resolve(h.response);
      await settleResponses();
    }
    h.nativeListeners[0].callback(h.response);
    h.nativeListeners[1].callback(h.response);
    assert.deepEqual(h.observed, { paths: [{ label: 'current', path: route }], badgeClears: 1, responseClears: 1 });
    assert.equal(h.handled.size, 1);
    successor.remove();
  });
}

for (const initialFirst of [true, false]) {
  test(`active initial and live notification responses retain shared deduplication, initial first=${initialFirst}`, async () => {
    const h = responseLifecycle(), subscription = h.subscribe('current');
    if (!initialFirst) h.nativeListeners[0].callback(h.response);
    h.pendingInitialReads[0].resolve(h.response);
    await settleResponses();
    h.nativeListeners[0].callback(h.response);
    assert.deepEqual(h.observed, { paths: [{ label: 'current', path: route }], badgeClears: 1, responseClears: 1 });
    subscription.remove();
  });
}

for (const callbackDuringRemove of [true, false]) {
  test(`repeated teardown retires callbacks before native removal, callback during remove=${callbackDuringRemove}`, async () => {
    const h = responseLifecycle({ callbackDuringRemove }), subscription = h.subscribe('removed');
    subscription.remove(); subscription.remove();
    h.nativeListeners[0].callback(h.response);
    h.pendingInitialReads[0].resolve(h.response);
    await settleResponses();
    subscription.remove();
    assert.deepEqual(h.observed, { paths: [], badgeClears: 0, responseClears: 0 });
    assert.equal(h.handled.size, 0);
    assert.equal(h.nativeListeners[0].removes, 1);
  });
}

test('an initial response read failure preserves current live delivery and teardown', async () => {
  const h = responseLifecycle(), subscription = h.subscribe('current');
  h.pendingInitialReads[0].reject(new Error('modeled native initial-read failure'));
  await settleResponses();
  h.nativeListeners[0].callback(h.response);
  assert.deepEqual(h.observed, { paths: [{ label: 'current', path: route }], badgeClears: 1, responseClears: 1 });
  subscription.remove(); subscription.remove();
  assert.equal(h.nativeListeners[0].removes, 1);
});

for (const platform of ['android', 'ios']) {
  for (const mode of ['listener', 'last-response']) {
    test(`${platform} ${mode}: route-only activity opens the exact conversation once`, async () => {
      const data = await emittedData(platform);
      const { observed, repeat } = await client(data, mode);
      assert.deepEqual(observed, { paths: [route], badgeClears: 1, responseClears: 1 });
      assert.equal(data.deepLink, route);
      repeat();
      assert.deepEqual(observed, { paths: [route], badgeClears: 1, responseClears: 1 });
    });
  }
  for (const mode of ['listener', 'last-response']) {
    test(`${platform} ${mode}: actual worker message metadata reaches the exact presentation target once`, async () => {
      const messageId = '00000000-0000-4000-8000-000000000222';
      const { observed, repeat } = await client(await emittedData(platform, { targetContext: { threadId, messageId } }), mode);
      repeat();
      assert.deepEqual(observed, { paths: [`${route}?messageId=${messageId}`], badgeClears: 1, responseClears: 1 });
    });
  }
  for (const [name, data, expected] of [
    ['existing deepLink', { deepLink: '/chilly-circle' }, '/chilly-circle'],
    ['existing url', { url: '/chilly-circle', deepLink: route }, '/chilly-circle'],
    ['existing path', { path: '/chilly-circle', url: route, deepLink: route }, '/chilly-circle'],
    ['empty path/url fallback', { path: '', url: '' }, route],
    ['null deepLink fallback', { deepLink: null }, route],
  ]) {
    test(`${platform}: preserves ${name}`, async () => {
      const { observed } = await client(await emittedData(platform, data));
      assert.deepEqual(observed.paths, [expected]);
    });
  }
}

for (const unsafe of ['https://untrusted.invalid/chat/one', `${route}?access=paid`, `${route}?userId=other`]) {
  for (const key of ['route', 'deepLink', 'path']) {
    test(`actual client rejects unsafe ${key}: ${unsafe}`, async () => {
      const { observed } = await client(await emittedData('ios', { [key]: unsafe }));
      assert.deepEqual(observed, { paths: [], badgeClears: 0, responseClears: 0 });
    });
  }
}
test('missing concrete route does not promote the targetRoute template into a destination', async () => {
  const data = await emittedData('android', { route: undefined });
  const { observed } = await client(data);
  assert.equal(Object.hasOwn(data, 'deepLink'), false);
  assert.deepEqual(observed.paths, []);
});
test('an explicitly empty existing deepLink keeps its previous no-navigation behavior', async () => {
  const { observed } = await client(await emittedData('ios', { deepLink: '' }));
  assert.deepEqual(observed.paths, []);
});
