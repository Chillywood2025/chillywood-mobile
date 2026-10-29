import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import * as singleFlight from '../../_lib/actionSingleFlight.mjs';

function loadProduction(path, imports) {
  const module={exports:{}};
  const source=ts.transpileModule(fs.readFileSync(path,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  new Function('module','exports','require',source)(module,module.exports,name=>{
    assert.ok(Object.hasOwn(imports,name),`unexpected dependency ${name}`);
    return imports[name];
  });
  return module.exports;
}
const liveEvents=loadProduction('_lib/liveEvents.ts',{
  './supabase':{supabase:{}},'./actionSingleFlight.mjs':singleFlight,
});

const owner='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222';
const event='33333333-3333-4333-8333-333333333333',pass='44444444-4444-4444-8444-444444444444';
const grant='55555555-5555-4555-8555-555555555555',intent='66666666-6666-4666-8666-666666666666';

test('production lifecycle enforces exact owner, immutable paid terms, explicit remedies and real broadcast boundary', async () => {
  const db=new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.actor',true),'')::uuid$$;
      create function public.wave1_current_caller_authority_internal() returns boolean language sql stable as $$select coalesce(current_setting('fixture.current',true),'true')='true'$$;
      create function public.is_account_access_restricted(text) returns boolean language sql stable as $$select false$$;
      create table public.creator_events(id uuid primary key,host_user_id uuid,event_title text,event_type text,visibility text,status text,
        starts_at timestamptz,ends_at timestamptz,time_zone text,replay_policy text,replay_available_at timestamptz,replay_expires_at timestamptz,
        reminder_ready boolean default true,updated_at timestamptz default clock_timestamp());
      create table public.paid_creator_events(id uuid default gen_random_uuid(),creator_event_id uuid,status text,sales_paused boolean default false,updated_at timestamptz);
      create table public.paid_creator_event_passes(id uuid primary key,creator_event_id uuid,buyer_id uuid,access_grant_id uuid,status text,refunded_at timestamptz,revoked_at timestamptz);
      create table public.event_ticket_reservations(access_grant_id uuid,buyer_id uuid,purchase_intent_id uuid,creator_event_id uuid);
      create table public.fixture_broadcasts(event_id uuid,host_id uuid,active boolean);
      create function public.creator_event_broadcast_ready_internal(uuid,uuid,boolean) returns table(broadcast_id uuid,record_id uuid,replay_id uuid)
        language sql stable as $$select event_id,event_id,null::uuid from public.fixture_broadcasts where event_id=$1 and host_id=$2 and active$$;
      insert into public.creator_events(id,host_user_id,event_title,event_type,visibility,status,starts_at,ends_at,time_zone,replay_policy)
        values('${event}','${owner}','Sunday show','live_first','public','scheduled','2099-01-04T01:00Z','2099-01-04T02:00Z','America/New_York','none');
      insert into public.paid_creator_events(creator_event_id,status) values('${event}','active');
      insert into public.paid_creator_event_passes values('${pass}','${event}','${buyer}','${grant}','active',null,null);
      insert into public.event_ticket_reservations values('${grant}','${buyer}','${intent}','${event}');`);
    await db.exec(fs.readFileSync('supabase/migrations/20261026165705_creator_event_lifecycle_controls.sql','utf8'));
    assert.equal((await db.query("select relforcerowsecurity from pg_class where oid='private.creator_event_lifecycle_permits'::regclass")).rows[0].relforcerowsecurity,true);
    const actor=async id=>db.query("select set_config('fixture.actor',$1,false)",[id]);
    // PostgREST returns timestamps in JSON with PostgreSQL precision. A native
    // JS Date row decoder would hide the production version-token regression.
    const row=async()=> (await db.query('select to_jsonb(e) event from public.creator_events e where id=$1',[event])).rows[0].event;
    const act=async(action,{start=null,end=null,message='Update for ticket holders',material=false,expected}={})=>{
      const current=await row();
      return (await db.query('select public.manage_creator_event_lifecycle($1,$2,$3,$4,$5,$6,$7,$8) result',
        [event,action,expected??current.updated_at,start,end,'America/New_York',message,material])).rows[0].result;
    };
    await actor(buyer); await assert.rejects(act('cancel'),/event_creator_required/);
    await actor(owner); await db.exec("select set_config('fixture.current','false',false)");
    await assert.rejects(act('cancel'),/event_creator_session_required/);
    await db.exec("select set_config('fixture.current','true',false)");
    const lifecycle=loadProduction('_lib/creatorEventJourney.ts',{
      './liveEvents':liveEvents,'./supabase':{supabase:{}},'./entitlementAuthority':{},
      './accountBoundSupabaseMutation':{async runCurrentAccountBoundSupabaseMutationRpc(name,args,host){
        assert.equal(name,'manage_creator_event_lifecycle');assert.equal(host,owner);
        const result=await db.query('select public.manage_creator_event_lifecycle($1,$2,$3,$4,$5,$6,$7,$8) result',
          [args.p_creator_event_id,args.p_action,args.p_expected_updated_at,args.p_starts_at,args.p_ends_at,
            args.p_time_zone,args.p_message,args.p_material_change]);
        return {data:result.rows[0].result,error:null};
      }},
    });
    await db.query("update public.creator_events set updated_at='2026-10-26T18:00:00.123456+00:00' where id=$1",[event]);
    const preciseEvent=liveEvents.buildCreatorEventSummary(liveEvents.parseCreatorEventRow(await row()));
    assert.match(preciseEvent.updatedAt,/\.123456/);
    await assert.rejects(act('stop_sales',{expected:new Date(preciseEvent.updatedAt).toISOString()}),
      /event_changed_refresh_required/,'negative control: millisecond truncation rejects the current server row');
    const paused=await lifecycle.manageCreatorEventLifecycle(preciseEvent,'stop_sales');
    assert.equal(paused.managementStatus,'sales_paused');
    const delayed=await lifecycle.manageCreatorEventLifecycle(paused,'delay',{message:'The show is preparing'});
    assert.equal(delayed.managementStatus,'delayed','the production parser can reuse the returned version on the next action');
    await assert.rejects(lifecycle.manageCreatorEventLifecycle(preciseEvent,'stop_sales'),/event_changed_refresh_required/,
      'an actually stale version remains rejected');
    await assert.rejects(act(null),/event_action_invalid/);
    await assert.rejects(act('reschedule',{start:'infinity',material:true}),/event_finite_schedule_required/);
    await assert.rejects(db.query("update public.creator_events set starts_at='infinity' where id=$1",[event]),/event_finite_schedule_required/);
    await assert.rejects(db.query("insert into public.creator_events(id,host_user_id,status,management_status) values(gen_random_uuid(),$1,'draft','no_show')",[owner]),/event_lifecycle_management_required/);
    await assert.rejects(act('cancel',{expected:'2000-01-01T00:00Z'}),/event_changed_refresh_required/);
    await assert.rejects(db.query("update public.creator_events set starts_at='2099-01-11T01:00Z' where id=$1",[event]),/purchased_event_lifecycle_management_required/);
    await assert.rejects(db.query("update public.creator_events set status='canceled' where id=$1",[event]),/purchased_event_lifecycle_management_required/);
    for (const status of ['draft','ended','expired','replay_available']) {
      await assert.rejects(db.query('update public.creator_events set status=$1 where id=$2',[status,event]),
        /purchased_event_lifecycle_management_required/,
        `legacy status edits cannot withdraw or prematurely finish a purchased event as ${status}`);
    }
    await assert.rejects(db.query("update public.creator_events set replay_policy='indefinite' where id=$1",[event]),/purchased_event_lifecycle_management_required/);
    await assert.rejects(db.query("update public.creator_events set management_status='no_show',status_message='No show' where id=$1",[event]),/event_lifecycle_management_required/);
    await assert.rejects(act('start'),/event_verified_broadcast_required/);
    await db.query('insert into public.fixture_broadcasts values($1,$2,true)',[event,buyer]);
    await assert.rejects(act('start'),/event_verified_broadcast_required/);
    const before=await row();
    const revisionBefore=(await db.query('select private.discovery_notification_event_revision(e) revision from public.creator_events e')).rows[0].revision;
    await assert.rejects(act('reschedule',{start:'2099-01-11T01:00Z'}),/event_material_change_confirmation_required/);
    await assert.rejects(act('reschedule',{start:'2099-01-04T01:00Z',end:'2099-01-04T01:30Z'}),/event_material_change_confirmation_required/);
    const rescheduled=await act('reschedule',{start:'2099-01-11T01:00Z',material:true});
    assert.equal(rescheduled.management_status,'rescheduled');
    assert.equal(Date.parse(rescheduled.ends_at)-Date.parse(rescheduled.starts_at),3600000,'declared duration preserved');
    assert.equal((await db.query('select sales_paused from public.paid_creator_events')).rows[0].sales_paused,true);
    let remedies=(await db.query('select * from public.creator_event_purchase_remedies')).rows;
    assert.equal(remedies.length,1);assert.equal(remedies[0].reason,'material_schedule_change');
    assert.equal(remedies[0].purchase_intent_id,intent);assert.equal(remedies[0].refund_eligibility,'eligible');
    assert.equal(remedies[0].status,'provider_review_required');
    assert.equal((await db.query('select status from public.paid_creator_event_passes')).rows[0].status,'active','eligibility is not a refund');
    assert.notEqual((await db.query('select private.discovery_notification_event_revision(e) revision from public.creator_events e')).rows[0].revision,revisionBefore);
    await assert.rejects(act('cancel',{expected:before.updated_at}),/event_changed_refresh_required/);
    await db.query('insert into public.fixture_broadcasts values($1,$2,true)',[event,owner]);
    await assert.rejects(db.query("update public.creator_events set status='live_now' where id=$1",[event]),
      /purchased_event_lifecycle_management_required/,'a ready source does not bypass the lifecycle action');
    assert.equal((await act('start')).status,'live_now');
    await assert.rejects(db.query("update public.creator_events set status='scheduled' where id=$1",[event]),
      /purchased_event_lifecycle_management_required/,'a live purchased event cannot be rewound by the old editor');
    await db.exec('begin');
    assert.equal((await act('end')).status,'ended','the authorized end action remains available');
    await db.exec('rollback');
    const pendingIntent='99999999-9999-4999-8999-999999999999';
    await db.query('insert into public.event_ticket_reservations values(null,$1,$2,$3)',[buyer,pendingIntent,event]);
    const canceled=await act('cancel');assert.equal(canceled.status,'canceled');assert.equal(canceled.reminder_ready,false);
    await assert.rejects(db.query("update public.creator_events set status='scheduled' where id=$1",[event]),
      /purchased_event_lifecycle_management_required/,'cancellation cannot be silently undone');
    remedies=(await db.query('select * from public.creator_event_purchase_remedies where pass_id is not null order by reason')).rows;
    assert.deepEqual(remedies.map(r=>r.reason),['event_canceled','material_schedule_change']);
    const conditional=(await db.query('select * from public.creator_event_purchase_remedies where purchase_intent_id=$1',[pendingIntent])).rows[0];
    assert.equal(conditional.pass_id,null);assert.equal(conditional.reason,'event_canceled');assert.equal(conditional.buyer_id,buyer);
    await assert.rejects(act('cancel'),/event_already_terminal/);
    assert.equal((await db.query('select count(*)::int n from private.creator_event_lifecycle_permits')).rows[0].n,0,'private edit permit is consumed');
    await actor(buyer);await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::int n from public.creator_event_purchase_remedies')).rows[0].n,2);
    await actor(owner);assert.equal((await db.query('select count(*)::int n from public.creator_event_purchase_remedies')).rows[0].n,0);
    await assert.rejects(db.exec("update public.creator_event_purchase_remedies set status='provider_review_required'"),/permission denied/);
    await db.exec('reset role');
    // Negative control proves the direct-write assertion detects removal of the guard.
    await db.exec('begin; alter table public.creator_events disable trigger guard_creator_event_lifecycle');
    await db.query("update public.creator_events set starts_at='2099-02-01T01:00Z' where id=$1",[event]);
    assert.equal(new Date((await row()).starts_at).toISOString(),'2099-02-01T01:00:00.000Z');
    await db.query("update public.creator_events set status='draft' where id=$1",[event]);
    assert.equal((await row()).status,'draft','negative control: removing the guard permits the hidden-event bypass');
    await db.exec('rollback');
    const missed='77777777-7777-4777-8777-777777777777',missedPass='88888888-8888-4888-8888-888888888888';
    await db.query(`insert into public.creator_events(id,host_user_id,event_title,event_type,visibility,status,starts_at,ends_at,time_zone,replay_policy)
      values($1,$2,'Next show','live_first','public','draft',now()+interval '1 day',now()+interval '2 days','America/New_York','none')`,[missed,owner]);
    const missedAction=async(action)=> (await db.query(`select public.manage_creator_event_lifecycle(id,$2,updated_at,null,null,time_zone,'Creator update',false) result
      from public.creator_events where id=$1`,[missed,action])).rows[0].result;
    assert.equal((await missedAction('publish')).status,'scheduled');
    await assert.rejects(missedAction('mark_no_show'),/event_started_schedule_required/);
    await db.query("update public.creator_events set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[missed]);
    await db.query('insert into public.paid_creator_event_passes values($1,$2,$3,null,\'active\',null,null)',[missedPass,missed,buyer]);
    await db.query('insert into public.fixture_broadcasts values($1,$2,true)',[missed,owner]);
    await assert.rejects(missedAction('mark_no_show'),/event_active_broadcast_not_no_show/);
    await db.query('delete from public.fixture_broadcasts where event_id=$1',[missed]);
    const noShow=await missedAction('mark_no_show');assert.equal(noShow.management_status,'no_show');assert.equal(noShow.status,'canceled');
    assert.equal((await db.query('select reason from public.creator_event_purchase_remedies where event_id=$1',[missed])).rows[0].reason,'event_no_show');
  } finally { await db.close(); }
});
