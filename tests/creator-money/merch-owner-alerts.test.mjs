import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('actual owner alerts deduplicate, deliver in app, honor preferences, recheck role and report recovery without money', {timeout:240000}, async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
 const owner=randomUUID(), other=randomUUID();
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  await db.query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
   values($1,'operations-owner@example.test',now(),false,false),($2,'operations-other@example.test',now(),false,false)`,[owner,other]);
  await db.query(`insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
   values('owner',$1,'operations-owner@example.test','active','Synthetic fixture','test')`,[owner]);
  const money=await one('select count(*)::int from public.money_access_ledger_events');
  const first=await one('select private.refresh_merch_reconciliation_alerts()');
  assert.equal(first.financialAuthority,false);
  const event=(await db.query(`select * from public.notification_activity_events where recipient_user_id=$1 and event_kind='owner_reconciliation_health'`,[owner])).rows[0];
  assert.ok(event);assert.ok(event.materialized_at);assert.ok(event.notification_id);
  const notice=(await db.query('select * from public.notifications where id=$1',[event.notification_id])).rows[0];
  assert.equal(notice.user_id,owner);assert.equal(notice.deep_link,'/admin?tab=money-center&section=overview');
  assert.match(notice.title,/Chi'llywood/);assert.deepEqual(notice.target_context.alertCodes,['driver_disabled']);
  assert.equal(await one('select count(*)::int from public.notifications where user_id=$1',[other]),0);
  await one('select private.refresh_merch_reconciliation_alerts()');
  assert.equal(await one(`select count(*)::int from public.notification_activity_events where recipient_user_id=$1`,[owner]),1);
  assert.equal(await one(`select (private.resolve_notification_activity(e)->>'eligible')::boolean from public.notification_activity_events e where id=$1`,[event.id]),true);
  await db.query(`insert into public.notification_preferences(user_id,account_activity_enabled) values($1,false)
   on conflict(user_id) do update set account_activity_enabled=false`,[owner]);
  assert.equal(await one(`select (private.resolve_notification_activity(e)->>'eligible')::boolean from public.notification_activity_events e where id=$1`,[event.id]),false);
  await db.query('update public.notification_preferences set account_activity_enabled=true where user_id=$1',[owner]);
  await db.exec(`update private.merch_reconciliation_driver set enabled=true;
   insert into private.merch_reconciliation_run_observations(run_id,started_at) values(extensions.gen_random_uuid(),clock_timestamp());`);
  await one('select private.refresh_merch_reconciliation_alerts()');
  const recovered=(await db.query(`select * from public.notifications where user_id=$1 order by created_at desc,id desc limit 1`,[owner])).rows[0];
  assert.match(recovered.title,/recovered/);assert.deepEqual(recovered.target_context.alertCodes,[]);
  assert.equal(await one(`select (private.resolve_notification_activity(e)->>'eligible')::boolean from public.notification_activity_events e where id=$1`,[event.id]),false,'obsolete alert suppressed before push');
  await db.query(`update public.platform_role_memberships set status='revoked' where user_id=$1 and role='owner'`,[owner]);
  assert.equal(await one(`select (private.resolve_notification_activity(e)->>'eligible')::boolean from public.notification_activity_events e where notification_id=$1`,[recovered.id]),false,'removed owner cannot receive delayed push');
  assert.equal(await one('select count(*)::int from public.money_access_ledger_events'),money);
  for(const role of ['anon','authenticated','service_role']) {
   await db.exec(`set role ${role}`);
   await assert.rejects(db.exec('select private.refresh_merch_reconciliation_alerts()'),/permission denied/);
   await db.exec('reset role');
  }
 } finally {await db.close();}
});
