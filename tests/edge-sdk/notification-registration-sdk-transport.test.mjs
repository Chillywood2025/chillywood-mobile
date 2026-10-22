import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after, before } from 'node:test';
import { setImmediate as flushTransport } from 'node:timers/promises';
import {
  createNotificationRegistrationTransportHarness, makeNotificationRegistrationSqlFixture,
  notificationTransportAuthority, notificationTransportGate, notificationTransportJson,
} from '../helpers/notification-registration-transport-harness.mjs';

const fingerprint = token => createHash('sha256').update(`expo:${token}`).digest('hex').slice(0, 12);
const writes = runtime => runtime.state.requests.filter(request => request.payload.action === 'register');
// These top-level cases run serially. Reuse one WASM engine rather than retain
// one heap per case; reset every mutable authority and registration table, role,
// and request GUC between cases. Every transport/helper/SDK runtime stays fresh.
let sql;
before(async () => { sql = await makeNotificationRegistrationSqlFixture(); });
after(async () => { await sql?.close(); });
async function fixture(t, options = {}) {
  t.after(() => sql.reset());
  const transport = createNotificationRegistrationTransportHarness({ rpc: sql.rpc, ...options });
  assert.deepEqual(transport.versions, { mobile: '2.100.0-chillywood.1', edge: '2.110.6' });
  return { ...sql, ...transport };
}

// Control timer primitives, not the deadline algorithm: the harness loads the
// whole production entitlementAuthority module into each independent runtime.
function controlledTimers() {
  const pending = new Map(); let now = 0, nextId = 0;
  return {
    setTimeout(callback, delay) { const id = ++nextId; pending.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { pending.delete(id); },
    async advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of pending) if (timer.at <= now) { pending.delete(id); timer.callback(); }
      await flushTransport();
    },
  };
}

test('exact mobile and Edge SDKs reject an older token across independent runtimes with shared storage', async t => {
  const h = await fixture(t), install = 'sdk-older-token';
  const oldToken = 'ExpoPushToken[older-token]', newToken = 'ExpoPushToken[newer-token]';
  const older = await h.runtime('older', install, oldToken), newer = await h.runtime('newer', install, newToken);
  assert.equal(older.storage, newer.storage);
  assert.notEqual(older.client, newer.client);
  const gate = older.hold('register'); t.after(() => gate.release.resolve());
  const pending = older.register(); await gate.entered.promise;
  assert.equal(older.api.hasPendingNotificationPushRegistration(), true);
  assert.equal(newer.api.hasPendingNotificationPushRegistration(), false, 'module lease is not cross-runtime');
  assert.equal((await newer.register()).status, 'registered');
  const accepted = await h.snapshot(install);
  assert.equal(accepted.streams[0].revision, '1');
  gate.release.resolve();
  const rejected = await pending;
  assert.equal(rejected.status, 'error'); assert.equal(rejected.registrationOutcome, 'conflict');
  assert.equal(writes(older)[0].response.status, 'conflict');
  assert.equal(writes(older)[0].response.tokenFingerprint, fingerprint(newToken), 'conflict reports actual current token');
  assert.deepEqual(await h.snapshot(install), accepted);
  assert.equal(writes(older).length, 1, 'stale attempt is never silently rebased or retried');
});

for (const boundary of ['native token acquisition', 'permission prompt']) {
test(`late ${boundary} retains the intent captured before a newer runtime registers`, async t => {
  const h = await fixture(t), install = `sdk-late-${boundary}`;
  const older = await h.runtime('late-acquisition', install, 'ExpoPushToken[late-acquisition]');
  const newer = await h.runtime('new-acquisition', install, 'ExpoPushToken[current-acquisition]');
  const gate = boundary === 'permission prompt' ? older.holdPermissionPrompt() : older.holdNativeToken();
  t.after(() => gate.release.resolve());
  const pending = older.register(); await gate.entered.promise;
  const snapshot = older.state.requests.find(request => request.payload.action === 'registration-intent' && request.payload.provider === 'expo');
  assert.equal(snapshot.response.revision, '0'); assert.equal(writes(older).length, 0);
  assert.equal((await newer.register()).status, 'registered');
  gate.release.resolve();
  const result = await pending;
  assert.equal(result.status, 'error'); assert.equal(result.registrationOutcome, 'conflict');
  assert.equal(writes(older)[0].payload.expectedRevision, '0', 'late native result must not capture a newer baseline');
  assert.equal((await h.snapshot(install)).tokens.find(token => token.enabled).token_fingerprint, fingerprint('ExpoPushToken[current-acquisition]'));
});
}

for (const method of ['register', 'refresh']) for (const stalled of ['expo', 'fcm']) {
  test(`actual SDK ${method} retains the ready peer when ${stalled} snapshot exceeds the real deadline`, async t => {
    const timers = controlledTimers(), h = await fixture(t, { timers });
    const install = `sdk-peer-timeout-${method}-${stalled}`, healthy = stalled === 'expo' ? 'fcm' : 'expo';
    const runtime = await h.runtime('peer-timeout', install, `ExpoPushToken[${install}]`);
    runtime.state.fcmToken = `fixture-fcm-${install}`;
    const held = runtime.hold('registration-intent', body => body.provider === stalled);
    t.after(() => held.release.resolve());
    const ready = notificationTransportGate(), late = notificationTransportGate();
    runtime.state.afterEdge = (request, response) => {
      if (request.payload.action === 'registration-intent') (request.payload.provider === healthy ? ready : late).entered.resolve(request);
      return response;
    };
    const pending = runtime[method]();
    await Promise.all([held.entered.promise, ready.entered.promise]); await flushTransport();
    assert.deepEqual(runtime.state.tokenReads, { expo: 0, fcm: 0 }, 'providers wait for the snapshot capture window to close');
    await timers.advance(15000);
    const registered = await pending;
    assert.equal(registered.status, 'registered'); assert.equal(registered.provider, healthy);
    assert.equal(runtime.state.tokenReads[healthy], 1); assert.equal(runtime.state.tokenReads[stalled], 0);
    assert.equal(writes(runtime).length, 1); assert.equal(writes(runtime)[0].payload.expectedRevision, '0');
    const accepted = await h.snapshot(install);
    assert.equal(accepted.streams.find(stream => stream.provider === healthy).revision, '1');
    held.release.resolve(); await late.entered.promise; await flushTransport();
    assert.equal(writes(runtime).length, 1, 'the late peer cannot start a registration mutation');
    assert.equal(runtime.state.tokenReads[stalled], 0, 'the late peer cannot even acquire its native token');
    const afterLate = await h.snapshot(install);
    assert.deepEqual(afterLate.tokens, accepted.tokens); assert.deepEqual(afterLate.ownership, accepted.ownership);
    assert.equal(afterLate.streams.find(stream => stream.provider === stalled).revision, '0');
  });
}

for (const stalled of ['expo', 'fcm']) {
  test(`late ${stalled} snapshot during permission work cannot join or rebase the exact SQL intent`, async t => {
    const timers = controlledTimers(), h = await fixture(t, { timers });
    const install = `sdk-late-peer-${stalled}`, healthy = stalled === 'expo' ? 'fcm' : 'expo';
    const older = await h.runtime('late-peer-older', install, `ExpoPushToken[older-${stalled}]`);
    older.state.fcmToken = `fixture-fcm-older-${install}`;
    const held = older.hold('registration-intent', body => body.provider === stalled);
    const permission = older.holdPermissionRead();
    t.after(() => { held.release.resolve(); permission.release.resolve(); });
    const ready = notificationTransportGate(), late = notificationTransportGate();
    older.state.afterEdge = (request, response) => {
      if (request.payload.action === 'registration-intent') (request.payload.provider === healthy ? ready : late).entered.resolve(request);
      return response;
    };
    const pending = older.register();
    const [, initial] = await Promise.all([held.entered.promise, ready.entered.promise]); await flushTransport();
    assert.equal(initial.response.revision, '0');
    await timers.advance(15000); await permission.entered.promise;
    const newer = await h.runtime('late-peer-newer', install, `ExpoPushToken[newer-${stalled}]`);
    newer.state.fcmToken = `fixture-fcm-newer-${install}`;
    const committed = { expo: notificationTransportGate(), fcm: notificationTransportGate() };
    newer.state.afterEdge = (request, response) => {
      if (request.payload.action === 'register') committed[request.payload.provider].entered.resolve(request);
      return response;
    };
    assert.equal((await newer.register()).status, 'registered');
    const receipts = await Promise.all(Object.values(committed).map(gate => gate.entered.promise)); await flushTransport();
    assert.ok(receipts.every(request => request.response.status === 'registered'));
    const accepted = await h.snapshot(install);
    assert.equal(accepted.streams.length, 2);
    assert.ok(accepted.streams.every(stream => stream.revision === '1'));
    held.release.resolve(); const lateSnapshot = await late.entered.promise; await flushTransport();
    assert.equal(lateSnapshot.response.revision, '1', 'late peer observes a newer real SQL baseline');
    assert.deepEqual(older.state.tokenReads, { expo: 0, fcm: 0 });
    permission.release.resolve(); const rejected = await pending;
    assert.equal(rejected.status, 'error');
    // Preserve the existing aggregate policy: unavailable Expo keeps the public
    // result unknown even when the FCM provider proves a definite conflict.
    assert.equal(rejected.registrationOutcome, healthy === 'expo' ? 'conflict' : 'unknown');
    assert.equal(writes(older).length, 1); assert.equal(writes(older)[0].payload.provider, healthy);
    assert.equal(writes(older)[0].response.status, 'conflict');
    assert.equal(writes(older)[0].response.requestAccepted, false);
    assert.equal(writes(older)[0].payload.expectedRevision, '0', 'the ready peer retains its original immutable baseline');
    assert.equal(older.state.tokenReads[stalled], 0, 'late snapshot never joins the frozen provider set');
    assert.deepEqual(await h.snapshot(install), accepted);
  });
}

test('same-token registration is a new accepted intent that fences a delayed competitor', async t => {
  const h = await fixture(t), install = 'sdk-same-token', token = 'ExpoPushToken[same-token]';
  const older = await h.runtime('older', install, token), newer = await h.runtime('newer', install, token);
  assert.equal((await newer.register()).status, 'registered');
  const gate = older.hold('register'); t.after(() => gate.release.resolve());
  const pending = older.register(); await gate.entered.promise;
  assert.equal((await newer.register()).status, 'registered');
  assert.equal((await h.snapshot(install)).streams[0].revision, '2');
  gate.release.resolve(); assert.equal((await pending).status, 'error');
  assert.equal(writes(older)[0].response.status, 'conflict');
  assert.equal((await h.snapshot(install)).streams[0].revision, '2');
});

test('lost commit acknowledgement is not success and the exact SDK retry applies once', async t => {
  const h = await fixture(t), install = 'sdk-lost-ack';
  const runtime = await h.runtime('lost-ack', install, 'ExpoPushToken[lost-ack]');
  runtime.state.afterEdge = (request, response) => {
    if (request.payload.action === 'register') throw new Error('synthetic postcommit transport loss');
    return response;
  };
  const unknown = await runtime.register();
  assert.equal(unknown.status, 'error'); assert.equal(unknown.registrationOutcome, 'unknown');
  assert.equal((await h.snapshot(install)).streams[0].revision, '1');
  const original = writes(runtime)[0]; runtime.state.afterEdge = null;
  const replay = await runtime.client.functions.invoke('notification-device-tokens', { body: original.payload, headers: original.headers });
  assert.equal(replay.error, null);
  assert.equal(replay.data.status, 'registered');
  assert.equal(replay.data.revision, '1');
  assert.equal(replay.data.operationId, original.payload.operationId);
  assert.equal((await h.snapshot(install)).streams[0].revision, '1');
});

test('an exact old registration retry reports current conflict without replacing its successor', async t => {
  const h = await fixture(t), install = 'sdk-stale-replay';
  const runtime = await h.runtime('replay', install, 'ExpoPushToken[first-replay]');
  assert.equal((await runtime.register()).status, 'registered');
  const original = writes(runtime)[0];
  runtime.state.token = 'ExpoPushToken[successor-replay]';
  assert.equal((await runtime.register()).status, 'registered');
  const accepted = await h.snapshot(install);
  const replay = await runtime.client.functions.invoke('notification-device-tokens', { body: original.payload, headers: original.headers });
  assert.equal(replay.error, null); assert.equal(replay.data.status, 'conflict');
  assert.equal(replay.data.requestAccepted, false);
  assert.equal(replay.data.tokenFingerprint, fingerprint(runtime.state.token));
  assert.deepEqual(await h.snapshot(install), accepted);
});

test('exact registration retry after revocation reports retired and never revives ownership', async t => {
  const h = await fixture(t), install = 'sdk-retired-replay';
  const runtime = await h.runtime('retired', install, 'ExpoPushToken[retired-replay]');
  assert.equal((await runtime.register()).status, 'registered');
  const original = writes(runtime)[0];
  assert.equal((await runtime.revoke()).status, 'not_registered');
  const revoked = await h.snapshot(install);
  const replay = await runtime.client.functions.invoke('notification-device-tokens', { body: original.payload, headers: original.headers });
  assert.equal(replay.error, null); assert.equal(replay.data.status, 'retired');
  assert.equal(replay.data.registered, false); assert.equal(replay.data.requestAccepted, false);
  assert.deepEqual(await h.snapshot(install), revoked);
});

for (const field of ['operationId', 'expectedIncarnation', 'expectedRevision', 'provider', 'revision']) {
  test(`actual mobile SDK rejects malformed registration acknowledgement: ${field}`, async t => {
    const h = await fixture(t), install = `sdk-malformed-${field}`;
    const runtime = await h.runtime('malformed', install, `ExpoPushToken[malformed-${field}]`);
    runtime.state.afterEdge = (request, response) => {
      if (request.payload.action !== 'register') return response;
      const data = { ...request.response, [field]: field === 'revision' ? 1 : 'not-the-exact-value' };
      return notificationTransportJson(data);
    };
    const unknown = await runtime.register();
    assert.equal(unknown.status, 'error'); assert.equal(unknown.registrationOutcome, 'unknown');
    assert.equal(writes(runtime).length, 1);
    assert.equal((await h.snapshot(install)).streams[0].revision, '1', 'malformed acknowledgement cannot prove rollback');
  });
}

for (const damage of [
  { name: 'accepted conflict', patch: { status: 'conflict', requestAccepted: true } },
  { name: 'untyped current truth', patch: { status: 'conflict', requestAccepted: false, registered: 'yes' } },
  { name: 'missing current fingerprint', patch: { status: 'conflict', requestAccepted: false, registered: true, tokenFingerprint: null } },
]) {
  test(`incoherent current-truth registration acknowledgement stays unknown: ${damage.name}`, async t => {
    const h = await fixture(t), install = `sdk-incoherent-${damage.name}`;
    const runtime = await h.runtime('incoherent', install, `ExpoPushToken[incoherent-${damage.name}]`);
    runtime.state.afterEdge = (request, response) => request.payload.action === 'register'
      ? notificationTransportJson({ ...request.response, ...damage.patch }) : response;
    const result = await runtime.register();
    assert.equal(result.status, 'error'); assert.equal(result.registrationOutcome, 'unknown');
    assert.equal((await h.snapshot(install)).streams[0].revision, '1');
  });
}

for (const field of ['operationId', 'revision']) {
  test(`exact Edge SDK rejects malformed SQL acknowledgement after commit: ${field}`, async t => {
    const h = await fixture(t), install = `sdk-sql-ack-${field}`;
    const runtime = await h.runtime('sql-ack', install, `ExpoPushToken[sql-ack-${field}]`);
    h.state.rpcHook = async (request, commit) => {
      const response = await commit();
      if (request.name !== 'register_my_push_token') return response;
      return notificationTransportJson({ ...await response.json(), [field]: field === 'revision' ? 1 : 'wrong-operation' });
    };
    const result = await runtime.register();
    assert.equal(result.status, 'error'); assert.equal(result.registrationOutcome, 'unknown');
    assert.equal(writes(runtime)[0].responseStatus, 503);
    assert.equal((await h.snapshot(install)).streams[0].revision, '1');
  });
}

test('malformed registration-intent snapshot prevents mutation dispatch', async t => {
  const h = await fixture(t), install = 'sdk-bad-snapshot';
  const runtime = await h.runtime('snapshot', install, 'ExpoPushToken[bad-snapshot]');
  runtime.state.afterEdge = (request, response) => request.payload.action === 'registration-intent'
    ? notificationTransportJson({ ...request.response, revision: 0 }) : response;
  assert.equal((await runtime.register()).status, 'error');
  assert.equal(writes(runtime).length, 0);
  assert.equal((await h.snapshot(install)).streams[0].revision, '0');
});

test('same-session token refresh cannot substitute the initiating bearer during SDK token lookup', async t => {
  const h = await fixture(t), install = 'sdk-refresh-bearer';
  const runtime = await h.runtime('refresh', install, 'ExpoPushToken[refresh-bearer]');
  const gate = runtime.holdSdkToken('register'); t.after(() => gate.release.resolve());
  const pending = runtime.register(); await gate.entered.promise;
  assert.equal(writes(runtime).length, 0, 'gate is inside actual SDK auth lookup before transport dispatch');
  runtime.replace(notificationTransportAuthority, 'fixture-only-refreshed-access-token');
  gate.release.resolve(); assert.equal((await pending).status, 'registered');
  const registration = writes(runtime)[0];
  assert.equal(registration.authorization, 'Bearer fixture-only-access-token');
  const sqlWrite = h.requests.find(request => request.kind === 'rpc' && request.name === 'register_my_push_token');
  assert.equal(sqlWrite.authorization, registration.authorization, 'Edge SDK forwards the exact initiating bearer to SQL');
});

// Deliberately preserved limitations, NOT remediation claims. These fixtures
// exercise the original user_request revoke API through unchanged source and
// real SQL. Registration-only CAS must not silently broaden lifecycle semantics.
test('HELD boundary unchanged: delayed registration can follow an accepted same-session revoke', async t => {
  const h = await fixture(t), install = 'held-register-revoke';
  const older = await h.runtime('older-register', install, 'ExpoPushToken[held-register-revoke]');
  const newer = await h.runtime('newer-revoke', install, 'ExpoPushToken[held-register-revoke]');
  assert.equal((await newer.register()).status, 'registered');
  const gate = older.hold('register'); t.after(() => gate.release.resolve());
  const pending = older.register(); await gate.entered.promise;
  assert.equal((await newer.revoke()).status, 'not_registered');
  assert.equal((await h.snapshot(install)).tokens[0].enabled, false);
  gate.release.resolve(); assert.equal((await pending).status, 'registered');
  assert.equal((await h.snapshot(install)).tokens[0].enabled, true);
});

test('HELD boundary unchanged: delayed same-session revoke can disable newer registration', async t => {
  const h = await fixture(t), install = 'held-revoke-register';
  const older = await h.runtime('older-revoke', install, 'ExpoPushToken[held-revoke-register]');
  const newer = await h.runtime('newer-register', install, 'ExpoPushToken[held-revoke-register]');
  assert.equal((await older.register()).status, 'registered');
  const storageGate = older.holdStorage('chillywood.notification.install_id.v1');
  const revokeGate = older.hold('revoke'); t.after(() => { storageGate.release.resolve(); revokeGate.release.resolve(); });
  const pending = older.revoke(); await storageGate.entered.promise;
  const registerGate = newer.hold('register'); t.after(() => registerGate.release.resolve());
  const registration = newer.register(); await registerGate.entered.promise;
  storageGate.release.resolve(); await revokeGate.entered.promise;
  registerGate.release.resolve(); assert.equal((await registration).status, 'registered');
  assert.equal((await h.snapshot(install)).tokens[0].enabled, true);
  revokeGate.release.resolve(); assert.equal((await pending).status, 'not_registered');
  assert.equal((await h.snapshot(install)).tokens[0].enabled, false);
});

test('HELD boundary unchanged: exact revoke replay can disable a later ownership epoch', async t => {
  const h = await fixture(t), install = 'held-revoke-replay';
  const runtime = await h.runtime('replay-revoke', install, 'ExpoPushToken[held-revoke-replay]');
  assert.equal((await runtime.register()).status, 'registered');
  assert.equal((await runtime.revoke()).status, 'not_registered');
  const request = runtime.state.requests.find(value => value.payload.action === 'revoke');
  assert.equal((await runtime.register()).status, 'registered');
  assert.equal((await h.snapshot(install)).tokens[0].enabled, true);
  const replay = await h.replay(request);
  assert.equal((await replay.json()).requestAccepted, true);
  assert.equal((await h.snapshot(install)).tokens[0].enabled, false);
});

test('HELD boundary unchanged: absent-install revoke creates no barrier to an in-flight first registration', async t => {
  const h = await fixture(t), install = 'held-absent-revoke';
  const older = await h.runtime('first-register', install, 'ExpoPushToken[held-absent-revoke]');
  const newer = await h.runtime('absent-revoke', install, 'ExpoPushToken[held-absent-revoke]');
  const gate = older.hold('register'); t.after(() => gate.release.resolve());
  const pending = older.register(); await gate.entered.promise;
  assert.equal((await newer.revoke()).status, 'not_registered');
  assert.equal((await h.snapshot(install)).ownership, null);
  gate.release.resolve(); assert.equal((await pending).status, 'registered');
  assert.equal((await h.snapshot(install)).tokens[0].enabled, true);
});
