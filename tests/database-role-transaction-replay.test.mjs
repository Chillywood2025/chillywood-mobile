import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {migrationReplayUnits, captureCurrentDatabaseReplay} from './helpers/database-runtime-authority-fixture.mjs';

test('role-sensitive replay retains owner, invoker restoration and owner-scoped default ACL', async () => {
  const db = new PGlite();
  try {
    const source = `create role fixture_owner; create role anon;
      create schema owned authorization fixture_owner;
      begin; set local role fixture_owner;
      alter default privileges revoke execute on functions from public;
      create function owned.closed_probe() returns integer language sql as $$select 1$$;
      commit;
      create function public.open_probe() returns integer language sql as $$select 2$$;`;
    for (const sql of migrationReplayUnits(source)) await db.exec(sql);
    assert.deepEqual((await db.query('select current_user,session_user')).rows[0], {current_user:'postgres', session_user:'postgres'});
    assert.equal((await db.query("select proowner::regrole::text owner from pg_proc where oid='owned.closed_probe()'::regprocedure")).rows[0].owner, 'fixture_owner');
    assert.equal((await db.query("select has_function_privilege('anon','owned.closed_probe()','execute') allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('anon','public.open_probe()','execute') allowed")).rows[0].allowed, true);
    assert.deepEqual((await db.query("select defaclrole::regrole::text owner from pg_default_acl where defaclobjtype='f'")).rows, [{owner:'fixture_owner'}]);
  } finally { await db.close(); }
});

test('role-sensitive replay rejects missing boundaries and managed substitutions', () => {
  for (const source of [
    'set local role fixture_owner;',
    'begin; set local role fixture_owner;',
    'begin; set local role fixture_owner; begin; commit; commit;',
    'begin; set local role fixture_owner; rollback;',
    'begin; set local role fixture_owner; create extension pg_net; commit;',
    'begin; set local role fixture_owner; select public.recover_media_scan_jobs(20,100); commit;',
  ]) assert.throws(() => migrationReplayUnits(source));
});

test('captured native replay preserves original role-sensitive transaction blocks', async () => {
  const {sql} = await captureCurrentDatabaseReplay();
  for (const name of ['20261107233954_isolated_test_store_capture_v1.sql', '202608250001_chilly_chat_room_authority_closure.sql']) {
    const source = readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
    const blocks = migrationReplayUnits(source).filter(unit => /set local role/u.test(unit));
    assert.ok(blocks.length > 0);
    for (const block of blocks) {
      assert.ok(source.includes(block), 'atomic block bytes are literal source bytes');
      assert.ok(sql.includes(block), 'captured replay retains every literal atomic block');
    }
  }
  assert.match(sql, /begin;set local lock_timeout='250ms';[\s\S]*?set local role rcq_v1_owner;[\s\S]*?commit;/u);
  assert.match(sql, /begin;[\s\S]*?set local role service_role;[\s\S]*?set local role postgres;[\s\S]*?commit;/u);
});
