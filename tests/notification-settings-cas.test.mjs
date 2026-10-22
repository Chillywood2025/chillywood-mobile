import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, owner, deferred, createPreferenceBackend, holdPreferenceWrite, preferenceRow, preferenceRead } from './helpers/notification-settings-mounted-harness.mjs';

const read = async m => {
  let value;
  await m.act(async () => { value = await m.notifications.readNotificationPreferences(m.state.authority.userId); });
  return value;
};
const operation = m => {
  const authority = m.state.authority;
  return { authority, isCurrent: () => m.authority.sameAccountSessionAuthority(authority, m.authority.getCurrentAccountSessionAuthoritySnapshot()) };
};
const update = (m, patch, intent, binding = operation(m)) => m.notifications.updateNotificationPreferences(patch, binding.authority.userId, binding, intent);
const alertText = m => m.state.alerts.flat().filter(value => typeof value === 'string').join(' ');

// Each mount evaluates the whole production helper in a separate VM. Only
// the modeled database is shared: no shared preference lease or UI closure.
test('CAS rejects delayed older false after a separate runtime saves newer no-op true', async t => {
  const backend = createPreferenceBackend(), held = deferred();
  const first = await mount(t, { preferenceBackend: backend, write: holdPreferenceWrite(held) });
  const second = await mount(t, { preferenceBackend: backend });
  await first.act(() => first.toggle('Messages').onValueChange(false));
  assert.equal(first.state.writes.length, 1);
  assert.equal(first.notifications.hasPendingNotificationPreferenceWrite('owned-user'), true);
  assert.equal(second.notifications.hasPendingNotificationPreferenceWrite('owned-user'), false);
  await second.act(() => second.toggle('Messages').onValueChange(true));
  assert.equal(backend.rows.get('owned-user').messages_enabled, true);
  assert.equal(backend.rows.get('owned-user').revision, '1', 'explicit no-op true is a durable new intent');
  await first.act(() => held.resolve());
  assert.equal(backend.rows.get('owned-user').messages_enabled, true, 'late old write cannot overwrite the newer accepted intent');
  assert.equal(backend.rows.get('owned-user').revision, '1', 'conflict performs no preference mutation');
  assert.equal(first.toggle('Messages').value, true, 'conflicting UI reconciles server truth, not its unsaved false');
  assert.equal(second.toggle('Messages').value, true);
  assert.match(alertText(first), /not saved.*changed elsewhere/i);
  assert.match(first.row('Notification settings unavailable').props.subtitle, /not saved/i);
  assert.equal(first.state.writes.length, 1, 'conflicting intent never silently rebases or retries');
  assert.deepEqual(backend.commits.map(commit => commit.receipt.status), ['applied', 'conflict']);
  assert.equal(first.state.writes[0].args.p_expected_revision, '0');
  assert.equal(second.state.writes[0].args.p_expected_revision, '0');
  assert.notEqual(first.state.writes[0].args.p_operation_id, second.state.writes[0].args.p_operation_id);
});

test('CAS still protects a restarted runtime after the old screen unmounts with transport pending', async t => {
  const backend = createPreferenceBackend(), held = deferred();
  const retired = await mount(t, { preferenceBackend: backend, write: holdPreferenceWrite(held) });
  await retired.act(() => retired.toggle('Messages').onValueChange(false));
  await retired.unmount();
  const restarted = await mount(t, { preferenceBackend: backend });
  await restarted.act(() => restarted.toggle('Messages').onValueChange(true));
  await retired.act(() => held.resolve());
  assert.equal(backend.rows.get('owned-user').messages_enabled, true);
  assert.equal(backend.rows.get('owned-user').revision, '1');
  assert.equal(restarted.toggle('Messages').value, true);
  assert.deepEqual(retired.state.alerts, [], 'dead screen cannot alert the successor runtime');
  assert.equal(retired.notifications.hasPendingNotificationPreferenceWrite('owned-user'), false);
});

test('a cross-runtime push-disable conflict never revokes the newer accepted enabled preference', async t => {
  const backend = createPreferenceBackend(), held = deferred();
  const first = await mount(t, { preferenceBackend: backend, write: holdPreferenceWrite(held) });
  const second = await mount(t, { preferenceBackend: backend });
  await first.act(() => first.toggle('Push alerts').onValueChange(false));
  await second.act(() => second.toggle('Push alerts').onValueChange(true));
  await first.act(() => held.resolve());
  assert.equal(backend.rows.get('owned-user').push_enabled, true);
  assert.equal(backend.rows.get('owned-user').revision, '1');
  assert.equal(first.toggle('Push alerts').value, true);
  assert.equal(first.state.revocations, 0, 'a failed CAS is not authority for follow-on device revocation');
  assert.match(alertText(first), /not saved/i);
});

test('atomic creation races never replace a saved row with defaults or permit an unversioned registration', async t => {
  const backend = createPreferenceBackend(), held = deferred();
  const first = await mount(t, { preferenceBackend: backend, read: async (_request, _row, commit) => { await held.promise; return commit(); } });
  assert.equal(backend.rows.size, 0);
  assert.equal(first.button('Register Device').disabled, true);
  await first.act(() => first.button('Register Device').onPress());
  assert.equal(first.state.registrations, 0);
  const second = await mount(t, { preferenceBackend: backend });
  await second.act(() => second.toggle('Messages').onValueChange(false));
  const incarnation = backend.rows.get('owned-user').incarnation;
  await first.act(() => held.resolve());
  assert.equal(backend.rows.size, 1);
  assert.equal(backend.rows.get('owned-user').incarnation, incarnation);
  assert.equal(backend.rows.get('owned-user').revision, '1');
  assert.equal(first.toggle('Messages').value, false);
  assert.equal(second.toggle('Messages').value, false);
  assert.equal(first.state.writes.length, 0, 'read initialization is not a blind client insert/upsert');
});

test('push registration captures its preference intent before awaiting the provider', async t => {
  const backend = createPreferenceBackend(), held = deferred();
  const first = await mount(t, { preferenceBackend: backend, register: () => held.promise });
  const second = await mount(t, { preferenceBackend: backend });
  await first.act(() => first.button('Register Device').onPress());
  await second.act(() => second.toggle('Messages').onValueChange(false));
  await first.act(() => held.resolve({ status: 'registered' }));
  assert.equal(first.state.writes.length, 1);
  assert.equal(first.state.writes[0].args.p_expected_revision, '0', 'provider completion cannot acquire a fresher revision');
  assert.equal(backend.rows.get('owned-user').revision, '1');
  assert.equal(first.toggle('Messages').value, false);
  assert.equal(first.section().props.value, 'Registered', 'confirmed device registration remains distinct from the conflicting account preference save');
  assert.match(alertText(first), /not saved/i);
  // This tests only preference CAS. The cross-process shared-install
  // registration/revocation ordering gap remains explicitly unresolved.
});

test('confirmed actual registration remains visible when its account preference CAS conflicts', async t => {
  const backend = createPreferenceBackend(), held = deferred();
  const first = await mount(t, { preferenceBackend: backend, actualPush: true });
  const second = await mount(t, { preferenceBackend: backend });
  first.state.backendBarrier = body => body.action === 'register' ? held.promise : undefined;
  await first.act(() => first.button('Register Device').onPress());
  assert.equal(first.state.transport.filter(body => body.action === 'register').length, 2);
  await second.act(() => second.toggle('Messages').onValueChange(false));
  await first.act(() => held.resolve());
  assert.equal(first.section().props.value, 'Registered');
  assert.deepEqual(first.state.installOwner, { userId: 'owned-user', sessionGeneration: 'session-a' });
  assert.equal(first.toggle('Messages').value, false);
  assert.match(alertText(first), /not saved/i);
  assert.equal(backend.rows.get('owned-user').revision, '1');
  assert.equal(first.state.revocations, 0, 'preference conflict cannot undo an independently confirmed device receipt');
});

test('replacement owner never inherits a late registration UI result or its preference write', async t => {
  const held = deferred(), m = await mount(t, { register: () => held.promise });
  await m.act(() => m.button('Register Device').onPress());
  await m.replace(owner('session-b', 'another-user'));
  await m.act(() => held.resolve({ status: 'registered', message: 'registered old owner' }));
  assert.notEqual(m.section().props.value, 'Registered');
  assert.equal(m.toggle('Messages').value, true);
  assert.equal(m.state.writes.length, 0);
  assert.deepEqual(m.state.alerts, []);
});

test('unconfirmed actual provider registration never becomes Registered or saves enabled preferences', async t => {
  const m = await mount(t, { actualPush: true });
  m.state.backendBarrier = () => { throw new Error('no confirmed registration receipt'); };
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.section().props.value, 'Unable to verify');
  assert.equal(m.state.writes.length, 0);
  assert.equal(m.state.installOwner, null);
});

for (const outcome of ['throw', 'error', 'missing', 'wrong operation', 'wrong owner', 'numeric revision', 'partial row', 'wrong applied revision']) {
  test(`a committed write with ${outcome} acknowledgement stays unknown until actual Refresh`, async t => {
    const m = await mount(t, { write: (_request, _row, commit) => {
      const result = commit();
      if (outcome === 'throw') throw new Error('response lost after commit');
      if (outcome === 'error') return { data: null, error: { message: 'transport lost response' } };
      if (outcome === 'missing') return { data: null, error: null };
      if (outcome === 'wrong operation') result.data.operationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      if (outcome === 'wrong owner') result.data.preferences.user_id = 'another-user';
      if (outcome === 'numeric revision') result.data.revision = Number(result.data.revision);
      if (outcome === 'partial row') delete result.data.preferences.messages_enabled;
      if (outcome === 'wrong applied revision') { result.data.revision = '0'; result.data.preferences.revision = '0'; }
      return result;
    } });
    await m.act(() => m.toggle('Messages').onValueChange(false));
    assert.equal(m.state.rows.get('owned-user').messages_enabled, false, 'server did commit despite missing trustworthy acknowledgement');
    assert.equal(m.state.rows.get('owned-user').revision, '1');
    assert.equal(m.row('Messages').props.value, 'Loading', 'neither old value nor assumed success is editable truth');
    assert.equal(m.button('Register Device').disabled, true);
    assert.match(alertText(m), /could not be confirmed.*Refresh/i);
    assert.equal(m.state.writes.length, 1, 'unknown outcome does not cause a blind automatic retry');
    assert.equal(m.notifications.hasPendingNotificationPreferenceWrite('owned-user'), false);
    m.state.write = null;
    await m.act(() => m.button('Refresh').onPress());
    assert.equal(m.toggle('Messages').value, false);
    assert.equal(m.toggle('Messages').disabled, false);
    assert.equal(m.state.writes.length, 1, 'readback recovers without another mutation');
  });
}

test('exact operation retry recovers its receipt once and conflicts rather than reporting stale success later', async t => {
  const m = await mount(t), initial = await read(m);
  const intent = m.notifications.createNotificationPreferenceIntent(initial);
  let first, replay;
  await m.act(async () => { first = await update(m, { messagesEnabled: false }, intent); });
  await m.act(async () => { replay = await update(m, { messagesEnabled: false }, intent); });
  assert.deepEqual(replay, first);
  assert.equal(m.state.rows.get('owned-user').revision, '1', 'same operation is not applied twice');
  const newer = m.notifications.createNotificationPreferenceIntent(first);
  await m.act(() => update(m, { messagesEnabled: true }, newer));
  await m.act(() => assert.rejects(update(m, { messagesEnabled: false }, intent), error => {
    assert.equal(error.outcome, 'conflict');
    assert.equal(error.currentPreferences.messagesEnabled, true);
    assert.equal(error.currentPreferences.revision, '2');
    return true;
  }));
  assert.equal(m.state.rows.get('owned-user').revision, '2');
  await m.act(() => assert.rejects(update(m, { messagesEnabled: true }, intent), error => error.outcome === 'unknown'));
  assert.equal(m.state.rows.get('owned-user').revision, '2', 'operation-id reuse with changed payload never mutates');
});

for (const used of [false, true]) test(`row recreation fences an old ${used ? 'applied receipt' : 'uncommitted intent'} even at the same revision`, async t => {
  const m = await mount(t), before = await read(m), intent = m.notifications.createNotificationPreferenceIntent(before);
  if (used) await m.act(() => update(m, { messagesEnabled: false }, intent));
  const previousIncarnation = m.state.rows.get('owned-user').incarnation;
  m.state.rows.delete('owned-user');
  const recreated = await read(m);
  assert.equal(recreated.revision, '0');
  assert.notEqual(recreated.incarnation, previousIncarnation);
  if (used) {
    const newIntent = m.notifications.createNotificationPreferenceIntent(recreated);
    await m.act(() => update(m, { messagesEnabled: true }, newIntent));
    assert.equal(m.state.rows.get('owned-user').revision, '1', 'new row reaches the same result revision as the old applied receipt');
  }
  await m.act(() => assert.rejects(update(m, { messagesEnabled: false }, intent), error => {
    assert.equal(error.outcome, 'conflict');
    assert.equal(error.currentPreferences.messagesEnabled, true);
    assert.equal(error.currentPreferences.incarnation, recreated.incarnation);
    return true;
  }));
  assert.equal(m.state.rows.get('owned-user').messages_enabled, true);
  assert.equal(m.state.rows.get('owned-user').revision, used ? '1' : '0');
});

test('revision remains exact decimal text above the JavaScript safe integer boundary', async t => {
  const backend = createPreferenceBackend();
  backend.rows.set('owned-user', preferenceRow({}, 'owned-user', '9007199254740993'));
  const m = await mount(t, { preferenceBackend: backend });
  await m.act(() => m.toggle('Messages').onValueChange(false));
  assert.equal(m.state.writes[0].args.p_expected_revision, '9007199254740993');
  assert.equal(backend.rows.get('owned-user').revision, '9007199254740994');
  assert.deepEqual(m.state.writes[0].payload, { messages_enabled: false }, 'revision/incarnation/owner never leak into the preference patch');
});

for (const [description, response] of [['null', null], ['empty', {}], ['missing row', { revision: '0' }], ['wrong owner', preferenceRead({}, 'another-user').data]]) {
  test(`malformed authenticated read never becomes editable defaults: ${description}`, async t => {
    const m = await mount(t, { read: () => ({ data: response, error: null }) });
    assert.ok(m.row('Notification settings unavailable'));
    assert.equal(m.row('Messages').props.value, 'Loading');
    assert.equal(m.button('Register Device').disabled, true);
    assert.equal(m.state.writes.length, 0);
    assert.equal(m.state.rows.size, 0);
  });
}

test('missing revision intent and wrong-owner calls cannot dispatch preference writes', async t => {
  const m = await mount(t), settings = await read(m), intent = m.notifications.createNotificationPreferenceIntent(settings);
  await m.act(() => assert.rejects(update(m, { messagesEnabled: false }, undefined), /Refresh/i));
  const other = { authority: owner('session-a', 'other-user'), isCurrent: () => true };
  await m.act(() => assert.rejects(m.notifications.updateNotificationPreferences({ messagesEnabled: false }, 'owned-user', other, intent), /owner|current|account/i));
  assert.equal(m.state.writes.length, 0);
});

test('helper freezes revision and patch before awaited session capture instead of rebasing the intent', async t => {
  const backend = createPreferenceBackend();
  const first = await mount(t, { preferenceBackend: backend }), second = await mount(t, { preferenceBackend: backend });
  const intent = first.notifications.createNotificationPreferenceIntent(await read(first));
  const patch = { messagesEnabled: false }, gate = deferred(), entered = deferred();
  first.state.sessionReader = async () => { entered.resolve(); await gate.promise; };
  let rejection;
  await first.act(() => {
    rejection = assert.rejects(update(first, patch, intent), error => error.outcome === 'conflict');
  });
  await entered.promise;
  await second.act(() => second.toggle('Messages').onValueChange(true));
  intent.expectedRevision = '1'; patch.messagesEnabled = true;
  first.state.sessionReader = null;
  await first.act(() => gate.resolve());
  await rejection;
  assert.equal(first.state.writes[0].args.p_expected_revision, '0');
  assert.deepEqual(first.state.writes[0].payload, { messages_enabled: false });
  assert.equal(backend.rows.get('owned-user').revision, '1');
});

test('same-user session replacement during subject capture cannot dispatch the old intent', async t => {
  const m = await mount(t), intent = m.notifications.createNotificationPreferenceIntent(await read(m));
  const gate = deferred(), entered = deferred(), binding = operation(m);
  m.state.sessionReader = async () => { entered.resolve(); await gate.promise; };
  let pending, rejection;
  await m.act(() => {
    pending = update(m, { messagesEnabled: false }, intent, binding);
    rejection = assert.rejects(pending, /owner|account|current/i);
  });
  await entered.promise;
  m.state.sessionReader = null;
  await m.replace(owner('session-b'));
  await m.act(() => gate.resolve());
  await rejection;
  assert.equal(m.state.writes.length, 0);
  assert.equal(m.state.rows.get('owned-user').revision, '0');
});
