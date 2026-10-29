import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {client} from './event-ticket-policy-fixture.mjs';

test('approved ticket schedule policy runs through real purchase, revisions, choices, notices and history', {timeout:600_000}, async t=>{
  const {db,replayReport}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  let checks=0;
  const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    await db.exec("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
    const actors=Object.fromEntries((await db.query('select kind,user_id,session_id from event_reservation_fixture.actors')).rows.map(a=>[a.kind,a]));
    const events=Object.fromEntries((await db.query('select name,id from event_reservation_fixture.events')).rows.map(e=>[e.name,e.id]));
    const as=async(actor,query,params=[])=>{
      await db.exec('begin');
      try {
        const a=actors[actor];
        await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[
          JSON.stringify(a?{role:'authenticated',sub:a.user_id,session_id:a.session_id}:{role:'service_role'}),JSON.stringify({'x-chillywood-platform':'ios'})]);
        await db.exec(`set local role ${a?'authenticated':'service_role'}`);
        const result=await db.query(query,params);await db.exec('commit');return result.rows[0]?.result;
      } catch(error) {await db.exec('rollback');throw error;}
    };
    const configure=(event)=>as('creator',`select public.configure_paid_creator_event_sale($1,'Online live only',99,5,'sandbox','America/New_York',now()-interval '1 hour',least((select ends_at from public.creator_events where id=$1),now()+interval '1 day')) result`,[event]);
    const buy=async(actor,offer)=>{
      const intent=await as(actor,'select public.create_reserved_creator_event_purchase_intent($1,$2) result',[offer.id,offer.termsRevisionId]);
      const claim=await as(actor,'select public.begin_creator_event_checkout($1,$2) result',[intent.id,randomUUID()]);
      check(claim.startAuthorized,true,'real store checkout dispatch is claimed before provider callback');
      return intent;
    };
    const pay=(actor,intent,label)=>as(null,`select public.process_revenuecat_app_store_event_atomic($1,'NON_RENEWING_PURCHASE',$2,$3,'sandbox',now(),null,99,'usd',repeat('a',64),$4,null,$5) result`,
      [label,actors[actor].user_id,intent.providerProductId,`tx-${label}`,intent.createdAt]);
    const policy=(actor,event,purchase)=>as(actor,'select public.read_my_creator_event_ticket_policy($1,$2) result',[event,purchase]);
    const choice=(actor,event,purchase,revision,value)=>as(actor,'select public.respond_creator_event_schedule_change($1,$2,$3,$4) result',[event,purchase,revision,value]);
    const move=(event,seconds,zone=null)=>as('creator',`select public.manage_creator_event_lifecycle(id,'reschedule',updated_at,starts_at+make_interval(secs=>$2),null,$3,'New schedule',false) result from public.creator_events where id=$1`,[event,seconds,zone]);
    const cancel=(event)=>as('creator',`select public.manage_creator_event_lifecycle(id,'cancel',updated_at,null,null,null,'Canceled by creator',false) result from public.creator_events where id=$1`,[event]);
    const event=events.show1,offer=await configure(event),intent=await buy('buyer1',offer);
    check((await pay('buyer1',intent,'ticket-policy-paid')).status,'processed','real atomic receipt issues ticket');
    let result=await policy('buyer1',event,intent.id);
    check(result.choiceRequired,false,'initial schedule requires no consent');
    check(result.refundEligibility,null,'initial ticket has no invented remedy');
    const parsed=client().api.parseEventTicketPolicy(result,event,intent.id,actors.buyer1.user_id);
    check(parsed.purchaseId,intent.id,'SQL result round trips through strict production client parser');
    const original=JSON.stringify(result.originalSchedule);
    await move(event,1799);result=await policy('buyer1',event,intent.id);
    check(result.choiceRequired,false,'29:59 delay is below approved threshold');
    await move(event,1);result=await policy('buyer1',event,intent.id);
    check(result.choiceRequired,true,'cumulative 30:00 delay requires choice');
    check(result.refundEligibility.reasons,['material_schedule_change'],'verified purchase is eligible for review only');
    check(Boolean(result.notice?.id),true,'buyer has durable notice without reminder subscription');
    const revision=result.currentRevision.id;
    result=await choice('buyer1',event,intent.id,revision,'keep_ticket');
    check(result.acceptedRevisionId,revision,'exact accepted revision persisted');
    check(result.choiceRequired,false,'explicit acceptance resolves only that schedule');
    check(result.refundEligibility,null,'accepted schedule no longer claims current material review');
    check(JSON.stringify(result.originalSchedule),original,'original purchase schedule immutable');
    check((await choice('buyer1',event,intent.id,revision,'keep_ticket')).history.length,1,'duplicate choice idempotent');
    await assert.rejects(choice('buyer1',event,intent.id,revision,'request_refund_review'),/event_ticket_choice_already_recorded/);checks++;
    await move(event,-1);result=await policy('buyer1',event,intent.id);
    check(result.choiceRequired,true,'one second earlier requires new explicit choice');
    await assert.rejects(choice('buyer1',event,intent.id,revision,'keep_ticket'),/event_ticket_revision_changed/);checks++;
    await choice('buyer1',event,intent.id,result.currentRevision.id,'keep_ticket');
    await assert.rejects(as('creator',`select public.manage_creator_event_lifecycle(id,'reschedule',updated_at,starts_at+interval '1 minute',ends_at+interval '2 minutes',time_zone,'Changed duration',false) result from public.creator_events where id=$1`,[event]),/purchased_event_duration_immutable/);checks++;
    await cancel(event);result=await policy('buyer1',event,intent.id);
    check(result.refundEligibility.reasons,['event_canceled'],'later cancellation remains protected after acceptance');
    check(result.choiceRequired,false,'cancellation cannot be silently accepted as a schedule');
    await assert.rejects(choice('buyer1',event,intent.id,result.currentRevision.id,'keep_ticket'),/event_ticket_choice_unavailable/);checks++;
    check(result.history.length,2,'full prior choices remain visible');
    check(client().api.parseEventTicketPolicy(result,event,intent.id,actors.buyer1.user_id).history.length,2,'immutable choice schedules round trip to client');
    const wallet=await as('buyer1','select public.read_my_creator_purchases(50,null,null,\'event\',$1) result',[event]);
    check(wallet.items[0].refundEligibility.reasons,['event_canceled'],'outer wallet agrees with ticket policy');
    await assert.rejects(policy('buyer2',event,intent.id),/event_ticket_purchase_required/);checks++;
    await db.exec('begin');
    await db.query('delete from auth.sessions where id=$1',[actors.buyer1.session_id]);
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:actors.buyer1.user_id,session_id:actors.buyer1.session_id})]);
    await assert.rejects(db.query('select public.read_my_creator_event_ticket_policy($1,$2)',[event,intent.id]),/event_ticket_buyer_session_required/);checks++;
    await db.exec('rollback');

    const pendingEvent=events.show2,pendingOffer=await configure(pendingEvent),pending=await buy('buyer2',pendingOffer);
    await move(pendingEvent,1800);
    check((await policy('buyer2',pendingEvent,pending.id)).refundEligibility,null,'pending attempt is not proof of payment');
    check((await pay('buyer2',pending,'ticket-policy-late-paid')).status,'ignored','changed original terms use reconciliation, not silent fulfillment');
    result=await policy('buyer2',pendingEvent,pending.id);
    check(result.refundEligibility?.reasons,['material_schedule_change'],`exact ignored paid reconciliation receives review eligibility: ${JSON.stringify(result)}`);
    check(result.purchaseIntentId,pending.id,'pending history retains exact original intent');

    const missedEvent=events.show3;
    await db.query("update public.creator_events set starts_at=clock_timestamp()-interval '31 minutes',ends_at=clock_timestamp()+interval '1 hour' where id=$1",[missedEvent]);
    const missedOffer=await configure(missedEvent),missedIntent=await buy('buyer3',missedOffer);
    await pay('buyer3',missedIntent,'ticket-policy-no-show');
    // Historical fixture: absence before policy observation is UNKNOWN, even
    // when a historical source is ended and its original schedule is known.
    await db.exec('begin;set local session_replication_role=replica');
    await db.query("update public.creator_events set status='ended' where id=$1",[missedEvent]);
    await db.exec('commit');
    check((await policy('buyer3',missedEvent,missedIntent.id)).refundEligibility,null,'pre-observation completed show does not fabricate no-show');
    // Deterministic clock fixture only: a start before cutover but a deadline
    // after cutover still lacks complete observation of the grace interval.
    await db.exec("begin;set local session_replication_role=replica;update private.creator_event_ticket_policy_observation set started_at=clock_timestamp()-interval '30 minutes';commit;");
    check((await policy('buyer3',missedEvent,missedIntent.id)).refundEligibility,null,'cross-cutover grace window remains unknown');
    // Simulate an already-observing deployment in this isolated database; all
    // immutable production guards are restored before calling application SQL.
    await db.exec("begin;set local session_replication_role=replica;update private.creator_event_ticket_policy_observation set started_at=clock_timestamp()-interval '1 day';commit;");
    result=await policy('buyer3',missedEvent,missedIntent.id);
    check(result.refundEligibility.reasons,['event_no_show'],'observed-period buyer read earns no-show protection; an ended status alone is not delivery');
    check((await db.query('select count(*)::int n from public.creator_event_purchase_remedies where purchase_intent_id=$1 and reason=\'event_no_show\'',[missedIntent.id])).rows[0].n,1,'no-show protection is durable');
    await policy('buyer3',missedEvent,missedIntent.id);
    check((await db.query('select count(*)::int n from private.creator_event_ticket_notices where event_id=$1 and buyer_id=$2 and kind=\'event_no_show\'',[missedEvent,actors.buyer3.user_id])).rows[0].n,1,'read retry does not duplicate notice');

    // Synthetic historical ledger-only purchases: exact receipt/grant identity
    // must win over another newer pass for the same buyer and event.
    const legacyEvent=events.show5,legacyOffer=await configure(legacyEvent);
    const product=(await db.query('select p.* from public.monetization_products p join public.money_purchase_intents i on i.product_id=p.id where i.id=$1',[intent.id])).rows[0];
    const legacy=[];
    await db.exec('begin;set local session_replication_role=replica');
    for(let index=0;index<2;index++){
      const row={receipt:randomUUID(),grant:randomUUID(),ledger:randomUUID(),pass:randomUUID()};legacy.push(row);
      await db.query(`insert into public.provider_events(id,provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
        values($1,$2,'revenuecat_app_store',$3,$4,$5::uuid,$5::text,'sandbox','NON_RENEWING_PURCHASE','processed',now()-interval '1 hour',$2,repeat('a',64),$6)`,
        [row.receipt,`legacy-policy-${index}`,product.id,product.product_key,actors.buyer5.user_id,JSON.stringify({original_transaction_id:`legacy-policy-original-${index}`,provider_product_id:product.provider_product_id})]);
      await db.query(`insert into public.access_grants(id,user_id,grant_type,source_type,source_id,product_id,provider,provider_event_id,environment,status,starts_at,expires_at,metadata)
        values($1,$2,'event_pass','provider_event',$3,$4,'revenuecat_app_store',$5,'sandbox','sandbox_only',now()-interval '1 hour',now()+interval '10 days',$6)`,
        [row.grant,actors.buyer5.user_id,legacyEvent,product.id,row.receipt,JSON.stringify({original_transaction_id:`legacy-policy-original-${index}`})]);
      await db.query(`insert into public.money_access_ledger_events(id,user_id,creator_id,product_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id)
        values($1,$2,$3,$4,$5,'NON_RENEWING_PURCHASE',99,'usd','sandbox','not_payable','sandbox_only','event',$6)`,
        [row.ledger,actors.buyer5.user_id,actors.creator.user_id,product.id,row.receipt,legacyEvent]);
      await db.query(`insert into public.paid_creator_event_passes(id,event_id,creator_event_id,buyer_id,creator_id,access_grant_id,status)
        values($1,$2,$3,$4,$5,$6,$7)`,[row.pass,legacyOffer.id,legacyEvent,actors.buyer5.user_id,actors.creator.user_id,row.grant,index?'active':'expired']);
    }
    await db.query(`insert into public.creator_event_purchase_remedies(event_id,buyer_id,pass_id,access_grant_id,reason)
      values($1,$2,$3,$4,'material_schedule_change')`,[legacyEvent,actors.buyer5.user_id,legacy[0].pass,legacy[0].grant]);
    await db.exec('commit');
    const legacyFirst=await policy('buyer5',legacyEvent,legacy[0].ledger);
    check(legacyFirst.originalSchedule,null,'legacy receipt never invents an original schedule');
    check(legacyFirst.refundEligibility.reasons,['material_schedule_change'],'exact historical pass retains its own recorded remedy');
    check((await policy('buyer5',legacyEvent,legacy[1].ledger)).refundEligibility,null,'second same-event purchase cannot inherit the first pass remedy');
    const legacyKeep=await choice('buyer5',legacyEvent,legacy[0].ledger,legacyFirst.currentRevision.id,'keep_ticket');
    check(legacyKeep.originalSchedule,null,'accepting current schedule does not fabricate original legacy terms');
    check(legacyKeep.history[0].schedule.timeZone,'America/New_York','explicit legacy acceptance binds the known current schedule zone');

    const cases=[
      ['2026-11-01T05:00Z','America/New_York','2026-11-01T05:29:59Z','America/New_York',false],
      ['2026-11-01T05:00Z','America/New_York','2026-11-01T05:30Z','America/New_York',true],
      ['2026-11-01T05:30Z','America/New_York','2026-11-01T06:30Z','America/New_York',true],
      ['2026-01-02T07:59:59Z','America/Los_Angeles','2026-01-02T08:00Z','America/Los_Angeles',true],
      ['2026-01-01T23:30Z','UTC','2026-01-01T23:30Z','Pacific/Kiritimati',true],
    ];
    for(const row of cases){const expected=row.pop();check((await db.query('select private.creator_event_schedule_is_material($1,$2,$3,$4) result',row)).rows[0].result,expected,'instant and event-local date materiality');}
    for(const [at,start,expected] of [['00:29:59',null,false],['00:30:00',null,true],['00:30:00','00:30:00',false],['00:30:01','00:30:01',true]]){
      check((await db.query("select private.creator_event_no_show_due('2030-01-01T00:00Z',$1,$2) result",[start?`2030-01-01T${start}Z`:null,`2030-01-01T${at}Z`])).rows[0].result,expected,'no-show exact deadline and late verified start');
    }
    for(const terms of [{startsAt:'2030-01-01T00:00Z'},{startsAt:'not-a-date',timeZone:'UTC'},{startsAt:'infinity',timeZone:'UTC'},{startsAt:'2030-01-01T00:00Z',timeZone:'Mars/Olympus'}]){
      check((await db.query('select private.creator_event_original_ticket_schedule($1) result',[JSON.stringify({terms})])).rows[0].result,null,'missing/invalid legacy schedule never invents UTC or a deadline');
    }
    await db.query('delete from public.creator_events where id=$1',[events.show16]);
    check((await db.query('select count(*)::int n from public.creator_events where id=$1',[events.show16])).rows[0].n,0,'unoffered free-event deletion has no new history restriction');
    // A notice persistence failure must roll back the event revision as well.
    const retryEvent=events.show4,retryOffer=await configure(retryEvent),retryIntent=await buy('buyer4',retryOffer);
    const before=(await db.query('select starts_at from public.creator_events where id=$1',[retryEvent])).rows[0].starts_at;
    await db.exec("create function private.fixture_policy_notice_failure() returns trigger language plpgsql as $$begin raise exception 'injected_notice_failure';end$$; create trigger fixture_policy_notice_failure before insert on private.creator_event_ticket_notices for each row execute function private.fixture_policy_notice_failure();");
    await assert.rejects(move(retryEvent,1800),/injected_notice_failure/);checks++;
    check((await db.query('select starts_at from public.creator_events where id=$1',[retryEvent])).rows[0].starts_at,before,'failed notice does not publish a changed schedule');
    await db.exec('drop trigger fixture_policy_notice_failure on private.creator_event_ticket_notices;drop function private.fixture_policy_notice_failure()');
    await move(retryEvent,1800);
    check((await policy('buyer4',retryEvent,retryIntent.id)).choiceRequired,true,'retry commits one complete schedule/notice pair');
    await assert.rejects(db.query('update private.creator_event_schedule_choices set choice=\'request_refund_review\''),/event_ticket_policy_history_immutable/);checks++;
    await assert.rejects(db.exec("update private.creator_event_ticket_policy_observation set started_at=clock_timestamp()"),/event_ticket_policy_history_immutable/);checks++;
    check((await db.query("select count(*)::int n from pg_class where oid in('private.creator_event_schedule_revisions'::regclass,'private.creator_event_schedule_choices'::regclass,'private.creator_event_ticket_notices'::regclass,'private.creator_event_verified_start_facts'::regclass,'private.creator_event_ticket_policy_observation'::regclass) and relrowsecurity and relforcerowsecurity")).rows[0].n,5,'private policy evidence has forced RLS');
    t.diagnostic(`${checks} policy assertions; ${replayReport.files.length} migration files; ${replayReport.skipped.length} managed-infrastructure substitutions, no provider calls`);
  } catch(error) {t.diagnostic(`${checks} assertions completed before failure`);if(error.where)error.message+=`\n${error.where}`;throw error;} finally {await db.close();}
});
