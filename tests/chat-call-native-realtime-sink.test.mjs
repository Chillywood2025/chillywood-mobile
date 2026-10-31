import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {callRetryRealtimeSink} from './helpers/chat-call-retry-concurrency-fixture.mjs';

test('clone-local Realtime transport records the actual production invalidation trigger',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema private;
      create table public.communication_rooms(room_id text);
      create table public.communication_room_memberships(room_id text);`);
    await db.exec(callRetryRealtimeSink);
    await db.exec(readFileSync('supabase/migrations/20260929004448_communication_private_state_invalidation.sql','utf8'));
    await db.exec("insert into public.communication_rooms values('CLONE');update public.communication_rooms set room_id='CLONE';delete from public.communication_rooms;");
    const {rows}=await db.query('select * from realtime.fixture_outbox');
    assert.equal(rows.length,3);
    for(const row of rows)assert.deepEqual(row,{payload:{},event:'state:update',topic:'comm-room-CLONE',private:true});
    await db.exec('set role authenticated');
    await assert.rejects(db.query("select realtime.send('{}','state:update','comm-room-CLONE',true)"),/permission denied/);
  }finally{await db.close();}
});

test('native runner installs sink only in generated clone and retains real concurrency checks',()=>{
  const source=readFileSync('scripts/test-chat-call-retry-concurrency-postgres.mjs','utf8');
  assert.ok(source.indexOf('query(callRetryRealtimeSink)')>source.indexOf("'restore isolated clone'"));
  assert.match(source,/--exclude-schema=realtime/);
  assert.match(source,/assert\.equal\(checks,10\)/);
  assert.match(source,/pg_blocking_pids/);
  assert.match(source,/sourceFingerprint,'local template call\/account ledger counts unchanged'/);
  assert.doesNotMatch(source,/disable trigger|session_replication_role/);
});
