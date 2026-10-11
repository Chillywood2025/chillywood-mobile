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
const responseSource = ['normalizeText', 'normalizeNotificationPath', 'subscribeToNotificationResponses']
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
