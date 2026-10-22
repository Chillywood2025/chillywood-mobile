import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { makeNotificationRegistrationSqlFixture, notificationTransportAuthority as actor } from './helpers/notification-registration-transport-harness.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const subject = (install, overrides = {}) => ({ p_expected_user_id: actor.userId, p_expected_account_id: actor.userId,
  p_session_generation: actor.sessionGeneration, p_platform: 'ios', p_provider: 'expo', p_install_id: install,
  p_revocation_credential_hash: digest('a'.repeat(64)), ...overrides });
const request = (s, baseline, token = 'ExpoPushToken[sql-token]', operationId = randomUUID()) => ({ ...s,
  p_token: token, p_operation_key: `register:${operationId}`, p_permission_status: 'granted', p_app_version: null,
  p_build_version: null, p_metadata: {}, p_operation_id: operationId,
  p_expected_incarnation: baseline.incarnation, p_expected_revision: baseline.revision });
const read = (f, s) => f.rpc('read_my_push_registration_intent', s);
const register = (f, r, context) => f.rpc('register_my_push_token', r, context);
const revoke = (f, s) => f.rpc('wave1_revoke_push_ownership', {
  ...Object.fromEntries(Object.entries(s).filter(([key]) => key !== 'p_provider')),
  p_operation_key: `revoke:${randomUUID()}`, p_reason: 'user_request',
}, { service: true });

test('registration SQL: first-accepted CAS, no-op fence and payload-bound current-truth receipts', async t => {
  const f = await makeNotificationRegistrationSqlFixture(); t.after(() => f.close());
  const s = subject('sql-cas'), baseline = await read(f, s);
  assert.equal(baseline.revision, '0'); assert.equal(baseline.registered, false);
  assert.deepEqual(await read(f, s), baseline);
  const accepted = request(s, baseline), stale = request(s, baseline, 'ExpoPushToken[older-result]');
  assert.equal((await register(f, accepted)).revision, '1');
  assert.equal((await register(f, stale)).status, 'conflict');
  assert.equal((await register(f, accepted)).status, 'registered');
  const current = await read(f, s), noop = request(s, current);
  const beforeOwner = (await f.snapshot(s.p_install_id)).ownership;
  assert.equal((await register(f, noop)).revision, '2');
  assert.deepEqual((await f.snapshot(s.p_install_id)).ownership, beforeOwner, 'legacy same-token no-op remains unchanged');
  assert.equal((await register(f, accepted)).status, 'conflict', 'historical success cannot claim current');
  assert.equal((await register(f, request(s, current, 'ExpoPushToken[stale-noop]'))).status, 'conflict');
  for (const patch of [{ p_token: 'ExpoPushToken[changed]' }, { p_metadata: { nativeCallStyle: true } },
    { p_permission_status: 'provisional' }, { p_app_version: '2' }, { p_build_version: '3' },
    { p_expected_revision: '1' }, { p_expected_incarnation: randomUUID() }, { p_revocation_credential_hash: digest('b'.repeat(64)) }]) {
    await assert.rejects(register(f, { ...accepted, ...patch }), /operation_key_conflict|credential_mismatch/);
  }
  const receipts = (await f.db.query('select request_hash,result_payload::text payload from private.notification_registration_receipts')).rows;
  assert.ok(receipts.every(r => /^[0-9a-f]{64}$/.test(r.request_hash) && !r.payload.includes('ExpoPushToken') && !r.payload.includes('a'.repeat(64))));
  const beforeRevoke = await read(f, s); await revoke(f, s);
  const retired = await register(f, noop);
  assert.equal(retired.status, 'retired'); assert.equal(retired.requestAccepted, false); assert.equal(retired.registered, false);
  assert.equal(retired.revision, beforeRevoke.revision); assert.equal(retired.incarnation, beforeRevoke.incarnation);
  assert.equal((await read(f, s)).revision, '2', 'revoke neither resets nor advances registration stream');
});

test('registration SQL: transaction rollback and receipt failure never partially mutate token/stream', async t => {
  const f = await makeNotificationRegistrationSqlFixture(); t.after(() => f.close());
  const s = subject('sql-atomic'), baseline = await read(f, s), operation = request(s, baseline);
  const before = await f.snapshot(s.p_install_id);
  await f.db.exec('begin');
  assert.equal((await register(f, operation)).status, 'registered');
  await f.db.exec('rollback');
  assert.deepEqual(await f.snapshot(s.p_install_id), before);
  await f.db.exec(`create function private.fixture_receipt_failure() returns trigger language plpgsql as $$begin raise exception 'fixture_receipt_failure'; end$$;
    create trigger fixture_receipt_failure before insert on private.notification_registration_receipts for each row execute function private.fixture_receipt_failure();`);
  await assert.rejects(register(f, operation), /fixture_receipt_failure/);
  assert.deepEqual(await f.snapshot(s.p_install_id), before);
  await f.db.exec('drop trigger fixture_receipt_failure on private.notification_registration_receipts;');
  assert.equal((await register(f, operation)).revision, '1');
  assert.equal((await f.db.query('select count(*)::int n from private.notification_registration_receipts')).rows[0].n, 1);
});

test('registration SQL: strict revision parsing, high bigint precision, overflow and missing baseline fail closed', async t => {
  const f = await makeNotificationRegistrationSqlFixture(); t.after(() => f.close());
  const s = subject('sql-precision'), baseline = await read(f, s);
  for (const revision of ['', '-1', '01', '1.0', '1e2', ' 1', '9223372036854775808', null]) {
    await assert.rejects(register(f, { ...request(s, baseline), p_expected_revision: revision }));
  }
  await assert.rejects(register(f, request(subject('never-read'), baseline)), /snapshot_required/);
  assert.equal((await register(f, { ...request(s, baseline), p_expected_incarnation: randomUUID() })).status, 'conflict');
  await f.db.query('update private.notification_registration_streams set revision=$1 where install_id=$2', ['9007199254740993', s.p_install_id]);
  const high = await read(f, s); assert.equal(high.revision, '9007199254740993');
  assert.equal((await register(f, request(s, high))).revision, '9007199254740994');
  await f.db.query('update private.notification_registration_streams set revision=$1 where install_id=$2', ['9223372036854775807', s.p_install_id]);
  await assert.rejects(register(f, request(s, await read(f, s))), /revision_exhausted/);
});

test('registration SQL: independent provider streams and cross-install retired current truth', async t => {
  const f = await makeNotificationRegistrationSqlFixture(); t.after(() => f.close());
  const expo = subject('sql-dual', { p_platform: 'android' }), fcm = { ...expo, p_provider: 'fcm' };
  const e = request(expo, await read(f, expo)); const native = request(fcm, await read(f, fcm), 'native-fcm-token-'.repeat(4));
  await register(f, e); await register(f, native);
  assert.equal((await register(f, e)).status, 'registered', 'other provider ownership-version advance does not retire still-active Expo');
  const nextInstall = subject('sql-transferred', { p_platform: 'android' });
  await register(f, request(nextInstall, await read(f, nextInstall), e.p_token));
  assert.equal((await register(f, e)).status, 'retired', 'cross-install token transfer is not fenced but replay reports truth');
});

test('registration SQL: exact active session required, read and mutation ACLs are minimal, legacy bypass is closed', async t => {
  const f = await makeNotificationRegistrationSqlFixture(); t.after(() => f.close());
  const s = subject('sql-authority'), baseline = await read(f, s), operation = request(s, baseline);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await f.db.query("select has_function_privilege($1,'public.wave1_register_push_token(uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)','EXECUTE') allowed", [role])).rows[0].allowed, false);
    for (const table of ['notification_registration_streams','notification_registration_receipts']) {
      assert.equal((await f.db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed", [role, `private.${table}`])).rows[0].allowed, false);
    }
  }
  assert.equal((await f.db.query("select has_function_privilege('service_role','public.wave1_revoke_push_ownership(uuid,uuid,text,text,text,text,text,text)','EXECUTE') allowed")).rows[0].allowed, true);
  await assert.rejects(f.rpc('wave1_register_push_token', Object.fromEntries(Object.entries(operation).filter(([key]) => !['p_operation_id','p_expected_incarnation','p_expected_revision'].includes(key)))), e => e.code === '42501');
  await assert.rejects(register(f, operation, { service: true }), e => e.code === '42501');
  await assert.rejects(read(f, { ...s, p_expected_account_id: randomUUID() }), e => e.code === '22023');
  await assert.rejects(read(f, { ...s, p_session_generation: randomUUID() }), e => e.code === '22023');
  await f.db.exec('begin isolation level repeatable read');
  await assert.rejects(f.db.query('select public.read_my_push_registration_intent($1,$2,$3,$4,$5,$6,$7)', Object.values(s)), e => e.code === '25000');
  await f.db.exec('rollback');
  await f.db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1", [actor.sessionGeneration]);
  await assert.rejects(register(f, operation), e => e.code === '42501');
  await f.db.query('update auth.sessions set not_after=null where id=$1', [actor.sessionGeneration]);
  await register(f, operation);
  await f.db.query('delete from auth.sessions where id=$1', [actor.sessionGeneration]);
  await assert.rejects(register(f, operation), e => e.code === '42501');
  await assert.rejects(read(f, s), e => e.code === '42501');
});
