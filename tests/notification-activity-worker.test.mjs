import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationActivityHandler, sendActivityPush, withActivityDeadline } from '../supabase/functions/_shared/notification-activity-worker.mjs';

const reservation = { eligible: true, token: 'ExponentPushToken[test-only]', platform: 'ios', badge: 8,
  title: 'New activity', body: 'Open the app to view it.', data: { notificationId: 'notification-one', route: '/chilly-circle' } };
const request = () => new Request('https://local.invalid', { method: 'POST', headers: { 'x-chillywood-activity-token': 'test-only' } });
const ticket = () => new Response(JSON.stringify({ data: { status: 'ok', id: 'ticket-one' } }));

test('actual payload preserves badge, route and iOS category without exporting recipient identity', async () => {
  let sent;
  const outcome = await sendActivityPush(reservation, { fetchImpl: async (_, options) => { sent = JSON.parse(options.body); return ticket(); } });
  assert.deepEqual(outcome, { status: 'sent', providerMessageId: 'ticket-one' });
  assert.equal(sent.badge, 8); assert.equal(sent.categoryId, 'chillywood_activity');
  assert.equal(sent.data.route, '/chilly-circle'); assert.equal('recipientUserId' in sent.data, false);
});
test('Android ordinary activity uses its existing channel', async () => {
  let sent;
  await sendActivityPush({ ...reservation, platform: 'android' }, { fetchImpl: async (_, options) => { sent = JSON.parse(options.body); return ticket(); } });
  assert.equal(sent.channelId, 'default'); assert.equal(sent.sound, 'default');
});
for (const [name, fetchImpl] of [
  ['lost response', async () => { throw new Error('private provider message'); }],
  ['HTTP failure', async () => new Response('private response', { status: 503 })],
  ['unrecognized ticket', async () => new Response(JSON.stringify({ data: { status: 'error', message: 'private error' } }))],
  ['malformed body', async () => new Response('not JSON')],
  ['body stalls', async () => ({ ok: true, json: () => new Promise(() => {}) })],
  ['fetch ignores abort', async () => new Promise(() => {})],
]) test(`${name} is bounded and recorded unknown`, async () => {
  const result = await sendActivityPush(reservation, { fetchImpl, deadlineMs: 15 });
  assert.equal(result.status, 'unknown'); assert.doesNotMatch(JSON.stringify(result), /private/);
});
test('explicit unregistered-device ticket is a definite failure', async () => {
  assert.deepEqual(await sendActivityPush(reservation, { fetchImpl: async () => new Response(JSON.stringify({
    data: { status: 'error', details: { error: 'DeviceNotRegistered' } },
  })) }), { status: 'failed', errorCode: 'DeviceNotRegistered' });
});

function harness(overrides = {}) {
  const calls = []; let sends = 0;
  const adminClient = { rpc: async (name, args) => {
    calls.push([name, args]);
    if (overrides[name]) return overrides[name](args);
    const result = {
      authorize_notification_activity_worker: true,
      claim_notification_activity_batch: [{ eventId: 'event-one', leaseToken: 'lease-one' }],
      prepare_notification_activity: { eligible: true, tokenIds: ['token-one'] },
      reserve_notification_activity_push: reservation,
      complete_notification_activity_push: true, finish_notification_activity: true,
    };
    return { data: result[name], error: null };
  } };
  const handler = createNotificationActivityHandler({ adminClient, deadlineMs: 20,
    fetchImpl: async () => { sends++; return ticket(); } });
  return { handler, calls, sends: () => sends };
}
test('authentication precedes any source read or provider action', async () => {
  const h = harness({ authorize_notification_activity_worker: () => ({ data: false }) });
  assert.equal((await h.handler(request())).status, 401);
  assert.deepEqual(h.calls.map(([name]) => name), ['authorize_notification_activity_worker']); assert.equal(h.sends(), 0);
  h.calls.length = 0;
  assert.equal((await h.handler(new Request('https://local.invalid', { method: 'POST' }))).status, 401);
  assert.equal(h.calls.length, 0);
});
test('exact lease accompanies every read, reservation and completion', async () => {
  const h = harness(); const response = await h.handler(request());
  assert.equal(response.status, 200); assert.equal(h.sends(), 1);
  for (const [name, args] of h.calls.slice(2)) {
    assert.equal(args.p_event_id, 'event-one', name); assert.equal(args.p_lease_token, 'lease-one', name);
  }
  assert.equal(h.calls.find(([name]) => name === 'complete_notification_activity_push')[1].p_status, 'sent');
});
test('read failure is retryable without sending or finishing', async () => {
  const h = harness({ prepare_notification_activity: () => ({ error: { message: 'private' } }) });
  const body = await (await h.handler(request())).json();
  assert.equal(h.sends(), 0); assert.equal(body.unresolved, 1);
  assert.equal(h.calls.some(([name]) => name === 'finish_notification_activity'), false);
  assert.doesNotMatch(JSON.stringify(body), /private/);
});
test('uncertain reservation response never sends and never releases reservation', async () => {
  const h = harness({ reserve_notification_activity_push: () => new Promise(() => {}) });
  assert.equal((await h.handler(request())).status, 200); assert.equal(h.sends(), 0);
  assert.equal(h.calls.some(([name]) => name === 'finish_notification_activity'), false);
});
test('source or preference suppression sends nothing', async () => {
  const h = harness({ prepare_notification_activity: () => ({ data: { eligible: false } }) });
  await h.handler(request()); assert.equal(h.sends(), 0); assert.equal(h.calls.length, 3);
});
test('completion storage failure leaves lease recoverable and continues next recipient', async () => {
  const h = harness({ claim_notification_activity_batch: () => ({ data: [
    { eventId: 'event-one', leaseToken: 'lease-one' }, { eventId: 'event-two', leaseToken: 'lease-two' },
  ] }), complete_notification_activity_push: args => args.p_event_id === 'event-one'
    ? { error: { message: 'storage failed' } } : { data: true } });
  const body = await (await h.handler(request())).json();
  assert.equal(h.sends(), 2); assert.equal(body.completed, 1);
  assert.deepEqual(h.calls.filter(([name]) => name === 'finish_notification_activity').map(([, a]) => a.p_event_id), ['event-two']);
});
test('duplicate token IDs cannot duplicate sends', async () => {
  const h = harness({ prepare_notification_activity: () => ({ data: { eligible: true, tokenIds: ['token-one', 'token-one'] } }) });
  await h.handler(request()); assert.equal(h.sends(), 1);
});
test('deadline includes deferred operation rejection', async () => {
  await assert.rejects(withActivityDeadline(() => { throw new Error('test failure'); }, 20), /test failure/);
});
