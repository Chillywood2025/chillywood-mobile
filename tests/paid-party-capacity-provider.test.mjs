import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedCurrentEventCommerceCreator} from './helpers/current-event-commerce-fixture.mjs';

// Actual current migrations, role-scoped application RPCs and provider projector.
// Provider facts are synthetic; this is not a network/store qualification. The
// additional trigger is explicit fault injection, not a production replacement.
test('refused ticket projection rolls back and exact reserved ingress retries successfully', {timeout:240000}, async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true});
  try {
    await db.exec(fs.readFileSync(new URL('./fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
    await seedCurrentEventCommerceCreator(db);
    const actors=Object.fromEntries((await db.query('select * from event_reservation_fixture.actors')).rows.map(a=>[a.kind,a]));
    const as=async(actor,sql,params=[])=>{
      await db.exec('begin');
      try {
        const a=actors[actor],role=a?'authenticated':'service_role';
        await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify(a?{role,sub:a.user_id,session_id:a.session_id}:{role}),JSON.stringify({'x-chillywood-platform':'ios'})]);
        await db.exec(`set local role ${role}`);
        const r=await db.query(sql,params);await db.exec('commit');return r.rows[0]?.value;
      }catch(e){await db.exec('rollback');throw e;}
    };
    await db.exec("insert into public.titles(id,title,video_url,is_published,status) values('34343434-3434-4434-8434-343434343434','Capacity fixture','https://fixture.invalid/title.mp4',true,'published')");
    await as('creator',`insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility) values('CAPACITY-PROVIDER','34343434-3434-4434-8434-343434343434',$1,'title','open','party_pass',true,'private')`,[actors.creator.user_id]);
    const offer=await as('creator',"select public.set_paid_watch_party_offer('CAPACITY-PROVIDER','Capacity fixture',99,1,'sandbox') value");
    const intent=await as('buyer1',"select public.create_ios_app_store_purchase_intent('com.chillywood.seatpass.tier1','watch_party_live',$1,'{}') value",[offer.id]);
    assert.equal((await as('buyer1','select public.begin_creator_money_checkout($1,gen_random_uuid()) value',[intent.id])).startAuthorized,true);
    const event='capacity-provider-retry',hash='a'.repeat(64);
    const reserve=()=>as(null,'select public.reserve_revenuecat_webhook_ingress_event($1,$2) value',[event,hash]);
    const pay=()=>as(null,`select public.process_revenuecat_app_store_event_atomic($1,'NON_RENEWING_PURCHASE',$2,$3,'sandbox',$4,null,99,'usd',$5,$6,null,$7) value`,[event,actors.buyer1.user_id,intent.providerProductId,intent.createdAt,hash,'tx-capacity-provider-retry',intent.createdAt]);
    const snapshot=async()=> (await db.query(`select
      (select count(*)::int from public.provider_events where provider_event_id=$1) providers,
      (select count(*)::int from public.access_grants where source_id=$2) grants,
      (select count(*)::int from public.paid_watch_party_tickets where offer_id=$2) tickets,
      (select count(*)::int from public.creator_room_ticket_transactions where offer_id=$2) transactions,
      (select count(*)::int from public.room_ticket_events where offer_id=$2 and event_type='ticket_verified') verified`,[event,offer.id])).rows[0];
    assert.equal((await reserve()).duplicateEvent,false);
    await db.exec(`create function public.test_capacity_suppress_ticket() returns trigger language plpgsql as $$begin return null;end$$;
      create trigger aa_capacity_fault before insert on public.paid_watch_party_tickets for each row execute function public.test_capacity_suppress_ticket();`);
    const before=await snapshot();
    await assert.rejects(pay(),/room_admission_sold_out/);
    assert.deepEqual(await snapshot(),before,'no falsely acknowledged provider, grant, ticket, transaction or verified event');
    assert.equal((await reserve()).duplicateEvent,true,'immutable ingress survives failed atomic projection and admits exact retry');
    await db.exec('drop trigger aa_capacity_fault on public.paid_watch_party_tickets; drop function public.test_capacity_suppress_ticket()');
    assert.equal((await pay()).status,'processed');
    assert.deepEqual(await snapshot(),{providers:1,grants:1,tickets:1,transactions:1,verified:1});
    assert.equal((await reserve()).duplicateEvent,true);
    await pay();
    assert.deepEqual(await snapshot(),{providers:1,grants:1,tickets:1,transactions:1,verified:1},'exact successful duplicate is idempotent');
  }finally{await db.close();}
});
