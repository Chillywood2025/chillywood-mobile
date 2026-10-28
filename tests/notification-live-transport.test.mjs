import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';

const binding = (sessionGeneration = 'session-a', userId = 'account-a') => ({
  userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false,
});
function harness() {
  let authority = binding();
  const lifecycle = new Set(), authorities = new Set(), channels = [];
  const api = loadStubbed('_lib/notificationActivity.ts', {
    'react-native': { AppState: { currentState: 'active', addEventListener(_name, callback) {
      lifecycle.add(callback); return { remove: () => lifecycle.delete(callback) };
    } } },
    './accountSessionAuthority': {
      getCurrentAccountSessionAuthoritySnapshot: () => authority,
      subscribeToAccountSessionAuthority(callback) { authorities.add(callback); return () => authorities.delete(callback); },
    },
    './supabase': { supabase: {
      channel(name) {
        const channel = { name, handlers: [], removed: false,
          on(kind, filter, callback) { channel.handlers.push({ kind, filter, callback }); return channel; },
          subscribe(callback) { channel.status = callback; return channel; },
        };
        channels.push(channel); return channel;
      },
      async removeChannel(channel) { channel.removed = true; },
    } },
  });
  return { api, channels, lifecycle, authorities, get authority() { return authority; },
    app(state) { lifecycle.forEach(callback => callback(state)); },
    replace(value) { authority = value; authorities.forEach(callback => callback(value)); },
    row(index = channels.length - 1, userId = 'account-a') {
      channels[index].handlers.forEach(handler => handler.callback({ new: { user_id: userId } }));
    },
  };
}

test('notification consumers refcount one recipient-filtered RLS transport', () => {
  const h = harness(), reasons = [];
  const owner = h.api.getNotificationActivityOwnerKey(h.authority);
  const listen = h.api.subscribeToNotificationActivity(owner, reason => reasons.push(reason));
  const first = h.api.subscribeToNotificationActivityChanges(h.authority);
  const second = h.api.subscribeToNotificationActivityChanges(h.authority);
  assert.equal(h.channels.length, 1);
  assert.deepEqual(h.channels[0].handlers.map(({ filter }) => filter), ['INSERT', 'UPDATE'].map(event => ({
    event, schema: 'public', table: 'notifications', filter: 'user_id=eq.account-a',
  })));
  h.row(0, 'account-b'); assert.equal(reasons.length, 0);
  h.row(); assert.deepEqual(reasons, ['hint', 'hint']);
  h.api.invalidateNotificationActivity(owner, 'confirmed'); assert.equal(reasons.at(-1), 'confirmed');
  first(); first(); assert.equal(h.channels[0].removed, false);
  second(); assert.equal(h.channels[0].removed, true);
  assert.equal(h.lifecycle.size, 0); assert.equal(h.authorities.size, 0);
  const previous = reasons.length;
  h.row(); h.channels[0].status('SUBSCRIBED'); assert.equal(reasons.length, previous);
  listen();
});

test('foreground reconnect uses unique channels and fences retired callbacks', () => {
  const h = harness(); let hints = 0;
  const owner = h.api.getNotificationActivityOwnerKey(h.authority);
  const listen = h.api.subscribeToNotificationActivity(owner, () => hints++);
  const stop = h.api.subscribeToNotificationActivityChanges(h.authority);
  h.app('background'); assert.equal(h.channels[0].removed, true);
  h.row(0); h.channels[0].status('SUBSCRIBED'); assert.equal(hints, 0);
  h.app('active'); h.app('active'); assert.equal(h.channels.length, 2);
  assert.notEqual(h.channels[0].name, h.channels[1].name);
  h.row(0); h.channels[0].status('SUBSCRIBED'); assert.equal(hints, 0);
  h.channels[1].status('SUBSCRIBED'); assert.equal(hints, 1);
  h.replace(binding('session-b'));
  assert.equal(h.channels[1].removed, true);
  h.row(1); h.channels[1].status('SUBSCRIBED'); assert.equal(hints, 1);
  h.app('background'); h.app('active'); assert.equal(h.channels.length, 2);
  const replacement = h.api.subscribeToNotificationActivityChanges(h.authority);
  assert.equal(h.channels.length, 3);
  stop(); replacement(); listen();
});

test('restored exact authority does not reuse a retired transport with outstanding holders', () => {
  const h = harness();
  const first = h.api.subscribeToNotificationActivityChanges(h.authority);
  const second = h.api.subscribeToNotificationActivityChanges(h.authority);
  h.replace(null); assert.equal(h.channels[0].removed, true);
  h.replace(binding());
  const replacement = h.api.subscribeToNotificationActivityChanges(h.authority);
  assert.equal(h.channels.length, 2, 'A to null to A starts a new live channel before old refs settle');
  first(); second();
  assert.equal(h.channels[1].removed, false, 'retired cleanup cannot dispose replacement transport');
  const peer = h.api.subscribeToNotificationActivityChanges(h.authority);
  assert.equal(h.channels.length, 2);
  replacement(); assert.equal(h.channels[1].removed, false);
  peer(); assert.equal(h.channels[1].removed, true);
});
