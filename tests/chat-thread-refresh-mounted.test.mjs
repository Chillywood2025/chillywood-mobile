import assert from 'node:assert/strict';
import test from 'node:test';
import { createDurableChatThreadFixture, mountFullChatThread } from './assurance/helpers/chat-thread-full-mounted-harness.mjs';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';
import * as nativeProvenance from '../_lib/nativeCallTransitionProvenance.mjs';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const message = (id, at = '2026-10-31T20:00:00.123401Z') => ({ id, threadId: 'thread', senderUserId: 'remote-user',
  body: id, createdAt: at, displayCreatedAt: at, attachments: [] });
const emit = h => h.run(() => { for (const fn of h.runtime.threadSubscriptions) fn(); });
async function mount(t, options = {}) {
  const reads = [], marks = [];
  let rows = [];
  const h = await mountFullChatThread({ noActiveCall: true, invite: { status: 'ended' },
    readMessages: async (...args) => { reads.push(args); return rows; },
    markRead: async (...args) => { marks.push(args); }, ...options });
  t.after(() => h.unmount());
  return Object.assign(h, { reads, marks, rows: value => { rows = value; } });
}

test('focused foreground catches background messages and missed realtime using observed message/call cuts', async t => {
  let calls = [];
  const h = await mount(t, { readCallEvents: async () => calls });
  assert.equal(h.reads.length, 1);
  await h.appState('background');
  h.rows([message('missed')]);
  calls = [{ id: 'call', actorUserId: 'remote-user', createdAt: '2026-10-31T20:01:00.123456Z',
    displayCreatedAt: '2026-10-31T20:01:00.123456Z', callType: 'voice', eventType: 'ended' }];
  await emit(h);
  assert.equal(h.reads.length, 1, 'background hint cannot start a read');
  assert.equal(h.marks.length, 0);
  await h.appState('active');
  assert.deepEqual(Array.from(h.runtime.snapshot.messages, m => m.id), ['missed']);
  assert.deepEqual(h.marks.at(-1), ['thread', '2026-10-31T20:00:00.123401Z', '2026-10-31T20:01:00.123456Z']);
  assert.equal(h.reads.at(-1)[1], '2026-10-31T23:59:59Z');
  await h.appState('background');
  h.rows([message('no-hint', '2026-10-31T20:02:00.123456Z')]);
  await h.appState('active');
  assert.equal(h.runtime.snapshot.messages[0].id, 'no-hint');
});

test('initial background mount preserves native bootstrap but never acknowledges messages', async t => {
  const h = await mount(t, { appState: 'background' });
  assert.equal(h.reads.length, 1);
  assert.equal(h.marks.length, 0);
  await h.appState('active');
  assert.equal(h.reads.length, 2);
});

test('actual SDK subscription closes initial fetch gap and reconnects the mounted production screen', async t => {
  const authority = { userId: 'local-user', accountId: 'local-user', sessionGeneration: 'session-1', state: 'ACTIVE', restoreOnly: false };
  let status; let removed = 0;
  const channel = { on() { return this; }, subscribe(callback) { status = callback; return this; } };
  const api = loadStubbed('_lib/chat.ts', {
    './supabase': { supabase: { channel: () => channel, removeChannel: async () => { removed++; } } },
    './accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => authority,
      sameAccountSessionAuthority: (a, b) => a === b },
  });
  const held = deferred(); let reads = 0;
  const h = await mount(t, { subscribeThread: api.subscribeToThread,
    readMessages: async () => ++reads === 1 ? held.promise : [message(`read-${reads}`)] });
  await h.run(() => status('SUBSCRIBED'));
  assert.equal(reads, 1);
  await h.run(() => held.resolve([]));
  assert.equal(reads, 2, 'initial SUBSCRIBED retains the fetch/subscribe gap invalidation');
  await h.run(() => { status('CHANNEL_ERROR'); status('SUBSCRIBED'); });
  assert.equal(h.runtime.snapshot.messages[0].id, 'read-3');
  await h.rerender({ focused: false });
  await h.run(() => status('SUBSCRIBED'));
  assert.equal(reads, 3);
  assert.equal(removed, 1);
});

test('reconnect/invalidation during an in-flight read is coalesced but never dropped', async t => {
  const h = await mount(t);
  const held = deferred(); let count = 0;
  h.runtime.readMessages = async () => ++count === 1 ? held.promise : [message('newer')];
  await emit(h);
  await emit(h); await emit(h); await emit(h);
  assert.equal(count, 1, 'one request in flight');
  await h.run(() => held.resolve([message('older', '2026-10-31T19:00:00Z')]));
  assert.equal(count, 2, 'one trailing read retains newer invalidations');
  assert.equal(h.runtime.snapshot.messages[0].id, 'newer');
  assert.equal(h.marks.at(-1)[1], '2026-10-31T20:00:00.123401Z');
});

test('background invalidates held reads and foreground retains a trailing refresh', async t => {
  const h = await mount(t); const held = deferred(); let count = 0;
  h.runtime.readMessages = async () => ++count === 1 ? held.promise : [message('foreground')];
  await emit(h);
  await h.appState('background'); await h.appState('active');
  await h.run(() => held.resolve([message('stale')]));
  assert.equal(count, 2);
  assert.equal(h.runtime.snapshot.messages[0].id, 'foreground');
  assert.equal(h.marks.length, 1, 'invalidated read cannot acknowledge');
});

test('blur discards held results, queued refresh and detached callbacks', async t => {
  const h = await mount(t); const held = deferred(); let count = 0;
  h.runtime.readMessages = async () => { count++; return held.promise; };
  const callback = [...h.runtime.threadSubscriptions][0];
  await emit(h); await emit(h);
  await h.rerender({ focused: false });
  await h.appState('background'); await h.appState('active');
  await h.run(() => { callback(); held.resolve([message('stale')]); });
  assert.equal(count, 1);
  assert.equal(h.runtime.snapshot.messages.length, 0);
  assert.equal(h.marks.length, 0);
  assert.equal(h.runtime.threadSubscriptions.size, 0);
  h.runtime.readMessages = async () => [message('fresh')];
  await h.rerender({ focused: true });
  assert.equal(h.runtime.snapshot.messages[0].id, 'fresh');
});

test('unmount discards held results and releases refresh listeners', async () => {
  const marks = []; const held = deferred(); let count = 0;
  const h = await mountFullChatThread({ noActiveCall: true, invite: { status: 'ended' },
    markRead: async (...args) => marks.push(args) });
  const callback = [...h.runtime.threadSubscriptions][0];
  h.runtime.readMessages = async () => { count++; return held.promise; };
  await emit(h); await emit(h);
  await h.unmount();
  await h.run(() => { callback(); held.resolve([message('stale')]); });
  await h.appState('background'); await h.appState('active');
  assert.equal(count, 1);
  assert.equal(marks.length, 0);
  assert.equal(h.runtime.threadSubscriptions.size, 0);
});

test('live account change before React rerenders blocks old reads and read receipts', async t => {
  const h = await mount(t); const held = deferred(); let count = 0;
  h.runtime.readMessages = async () => { count++; return held.promise; };
  await emit(h);
  h.runtime.liveAuthority = { userId: 'other', accountId: 'other', sessionGeneration: 'new', state: 'ACTIVE', restoreOnly: false };
  await emit(h);
  await h.run(() => held.resolve([message('old-account')]));
  await h.run(() => h.runtime.snapshot.markThreadReadWithThrottle('2026-10-31T20:00:00Z'));
  assert.equal(count, 1);
  assert.equal(h.runtime.snapshot.messages.length, 0);
  assert.equal(h.marks.length, 0);
});

test('session and thread replacement reject held old results', async t => {
  const h = await mount(t); const held = deferred();
  h.runtime.readMessages = async () => held.promise;
  await emit(h);
  h.runtime.readMessages = async id => [{ ...message('replacement'), threadId: id }];
  await h.rerender({ sessionGeneration: 'replacement-session', threadId: 'replacement-thread',
    thread: { ...h.runtime.thread, threadId: 'replacement-thread' } });
  await h.run(() => held.resolve([message('stale')]));
  assert.equal(h.runtime.snapshot.messages[0].id, 'replacement');
  assert.equal(h.marks.length, 1);
  assert.equal(h.marks[0][0], 'replacement-thread');
});

for (const appState of ['background', 'inactive']) {
  test(`trusted native Answer preserves bootstrap without read ACKs on initial ${appState} mount`, async t => {
    const ids = { userId: '10000000-0000-4000-8000-000000000001', remoteUserId: '10000000-0000-4000-8000-000000000002',
      threadId: '10000000-0000-4000-8000-000000000003', inviteId: '10000000-0000-4000-8000-000000000004',
      callUuid: '10000000-0000-4000-8000-000000000005' };
    const marks = [];
    const h = await mountFullChatThread({ ...ids, appState, platform: 'ios',
      invite: { id: ids.inviteId }, nativeAnswer: { callUuid: ids.callUuid },
      readMessages: async () => [{ ...message('unread'), threadId: ids.threadId }],
      markRead: async (...args) => marks.push(args) });
    t.after(() => h.unmount());
    assert.deepEqual(h.runtime.transitions.map(({ status }) => status), ['accepted']);
    assert.deepEqual(h.runtime.nativeCompletions, [{ uuid: ids.callUuid, connected: true }]);
    assert.equal(h.runtime.snapshot.activeCallInvite?.status, 'accepted');
    assert.equal(h.runtime.media.localStreams.length, 0, 'acceptance never fabricates native audio readiness');
    assert.equal(marks.length, 0, 'native call projection cannot acknowledge background messages');
    await h.terminal('ended');
    assert.equal(h.runtime.snapshot.activeCallInvite, null, 'remote End remains independent of deferred transport refresh');
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.equal(marks.length, 0);
  });
}

for (const terminal of ['cancel', 'End', 'remote End']) {
  test(`${terminal} cleanup survives a held/coalesced refresh and background transition`, async t => {
    const store = createDurableChatThreadFixture();
    const h = await mountFullChatThread({ durableThread: store });
    t.after(() => h.unmount());
    await h.run(() => h.runtime.snapshot.handleStartCall('voice'));
    if (terminal !== 'cancel') await h.run(() => store.transition('remote-user', store.invite, 'accepted'));
    const held = deferred(); let reads = 0;
    h.runtime.readMessages = async () => ++reads === 1 ? held.promise : [];
    await emit(h); await emit(h);
    await h.appState('background');
    if (terminal === 'remote End') await h.run(() => store.transition('remote-user', store.invite, 'ended'));
    else await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
    assert.equal(store.invite.status, terminal === 'cancel' ? 'canceled' : 'ended');
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    await h.run(() => held.resolve([message('stale')]));
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.snapshot.messages.some(row => row.id === 'stale'), false);
    for (const stream of h.runtime.media.localStreams) for (const track of stream.getTracks()) assert.equal(track.readyState, 'ended');
  });
}

for (const routeKind of ['trusted', 'wrong owner', 'untrusted']) {
  test(`initial background Android Decline honors ${routeKind} provenance`, async t => {
    nativeProvenance.clearNativeCallTransitionClaims('android');
    const userId = '81000000-0000-4000-8000-000000000001';
    const remoteUserId = '81000000-0000-4000-8000-000000000002';
    const threadId = '81000000-0000-4000-8000-000000000003';
    const inviteId = '81000000-0000-4000-8000-000000000004';
    const created = nativeProvenance.registerTrustedAndroidNativeActionStorePayload({ authenticated: true,
      authenticatedUserId: routeKind === 'wrong owner' ? remoteUserId : userId,
      schemaVersion: 2, captureGeneration: 1, nativeCallAction: 'decline',
      callInviteId: inviteId, threadId, requestKey: 'a'.repeat(64) });
    assert.equal(created.status, 'created');
    const routeParams = Object.fromEntries(new URL(created.destination, 'https://fixture.invalid').searchParams);
    if (routeKind === 'untrusted') routeParams.nativeCallClaim = 'b'.repeat(64);
    const marks = [];
    const h = await mountFullChatThread({ userId, remoteUserId, threadId, platform: 'android', appState: 'background',
      invite: { id: inviteId }, routeParams, markRead: async (...args) => marks.push(args) });
    t.after(() => h.unmount());
    assert.deepEqual(h.runtime.transitions.map(({ status }) => status), routeKind === 'trusted' ? ['declined'] : []);
    assert.equal(h.runtime.media.localStreams.length, 0);
    assert.equal(marks.length, 0);
    if (routeKind === 'trusted') assert.equal(h.runtime.snapshot.incomingCallInvite, null);
    else assert.equal(h.runtime.clears.length, 0, 'untrusted/stale route cannot authorize cleanup');
  });
}

for (const state of ['active', 'background']) {
  test(`same-thread notification target replacement while ${state} cannot duplicate held expiry cleanup`, async t => {
    let now = Date.now();
    class ScreenDate extends Date { static now() { return now; } }
    const h = await mountFullChatThread({ screenDate: ScreenDate,
      invite: { expiresAt: new Date(now + 60_000).toISOString() } });
    t.after(() => h.unmount());
    await h.appState('background');
    const timer = h.runtime.timers.find(item => !item.canceled && item.delay === 60_000 && item.fn.constructor.name === 'AsyncFunction');
    assert.ok(timer);
    now += 210_000;
    const held = deferred(); let reconciliation;
    h.runtime.invite = { ...h.runtime.invite, status: 'missed' };
    h.runtime.clearThread = () => held.promise;
    await h.run(() => { reconciliation = timer.fn(); });
    if (state === 'active') await h.appState('active');
    await h.rerender({ params: { messageId: '10000000-0000-4000-8000-000000000009' } });
    assert.equal(h.runtime.clears.length, 1, 'scroll-target changes cannot acquire a second cleanup owner');
    h.runtime.thread.activeCommunicationRoomId = null;
    h.runtime.thread.activeCallType = null;
    await h.run(async () => { held.resolve({ cleared: true, reason: 'ended' }); await reconciliation; });
    await h.appState('active');
    assert.equal(h.runtime.clears.length, 1);
    assert.equal(h.runtime.snapshot.activeCallRoomId, '');
  });
}

test('retired expiry callback cannot dispatch an old-session invite read', async t => {
  const h = await mountFullChatThread({ invite: { expiresAt: new Date(Date.now() + 60_000).toISOString() } });
  t.after(() => h.unmount());
  const timer = h.runtime.timers.find(item => !item.canceled && item.fn.constructor.name === 'AsyncFunction');
  assert.ok(timer);
  let reads = 0;
  h.runtime.readInvite = async () => { reads++; return h.runtime.invite; };
  await h.rerender({ sessionGeneration: 'replacement-session' });
  const before = reads;
  await h.run(() => timer.fn());
  assert.equal(reads, before);
});
