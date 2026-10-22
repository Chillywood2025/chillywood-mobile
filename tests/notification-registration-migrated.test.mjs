import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { createDatabase, splitSQL } from './helpers/database-runtime-authority-fixture.mjs';
import { registrationRevisionMigration } from './helpers/notification-registration-transport-harness.mjs';

test('registration protocol applies and rolls back over the full fresh-schema chain without altering held revoke authority', { timeout: 120000 }, async t => {
  const migrationName = registrationRevisionMigration.split('/').at(-1);
  const { db, replayReport } = await createDatabase({ implicitApiGrants: false, applyRepair: true,
    includeHeldStudio: true, excludeMigrations: [migrationName] });
  t.after(() => db.close());
  const held = async () => (await db.query(`select pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p
    where p.oid='public.wave1_revoke_push_ownership(uuid,uuid,text,text,text,text,text,text)'::regprocedure`)).rows;
  const publicTables = async () => (await db.query(`select relname,relacl::text,relrowsecurity,relforcerowsecurity from pg_class
    where oid in ('public.user_push_tokens'::regclass,'public.wave1_push_installation_ownership'::regclass) order by relname`)).rows;
  const policies = async () => (await db.query("select * from pg_policies where tablename in ('user_push_tokens','wave1_push_installation_ownership') order by tablename,policyname")).rows;
  const beforeHeld = await held(), beforeTables = await publicTables(), beforePolicies = await policies();
  const migration = fs.readFileSync(registrationRevisionMigration, 'utf8');
  const body = splitSQL(migration).filter(statement => !/^(begin|commit);$/iu.test(statement.replace(/--[^\n]*/gu, '').trim())).join('\n');
  await db.exec('begin'); try { await db.exec(body); } finally { await db.exec('rollback'); }
  assert.equal((await db.query("select to_regclass('private.notification_registration_streams') value")).rows[0].value, null);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.wave1_register_push_token(uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)','EXECUTE') allowed")).rows[0].allowed, true);
  await db.exec(migration);
  assert.deepEqual(await held(), beforeHeld); assert.deepEqual(await publicTables(), beforeTables); assert.deepEqual(await policies(), beforePolicies);
  const actor=randomUUID(), session=randomUUID(), operation=randomUUID();
  await db.query('insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,$2,now(),false,false)', [actor,'registration-fixture@example.test']);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,actor]);
  const invoke=async(sql,args=[])=>{
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:actor,session_id:session})]);
    await db.exec('set role authenticated');try{return (await db.query(sql,args)).rows[0].value;}finally{await db.exec('reset role');}
  };
  const credential=createHash('sha256').update('fixture-only-capability').digest('hex');
  const snapshot=await invoke('select public.read_my_push_registration_intent($1,$1,$2,$3,$4,$5,$6) value',[actor,session,'ios','expo','migrated-fixture',credential]);
  assert.equal(snapshot.revision,'0');
  const registered=await invoke('select public.register_my_push_token($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,null,null,$10,$11,$12,$13) value',
    [actor,session,'ios','expo','migrated-fixture','ExpoPushToken[migrated-fixture]',credential,`register:${operation}`,'granted','{}',operation,snapshot.incarnation,snapshot.revision]);
  assert.equal(registered.status,'registered');assert.equal(registered.revision,'1');
  assert.equal(replayReport.files.length+2,fs.readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).length);
  t.diagnostic(`${replayReport.files.length} historical migrations plus runtime repair and registration protocol executed as SQL. Managed infrastructure doubles, not native concurrency or production evidence.`);
});
