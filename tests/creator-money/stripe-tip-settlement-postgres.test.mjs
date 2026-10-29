import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

// Real reservation, receipt, event lease and atomic projector over the complete
// local migration chain. Only managed infrastructure is doubled; no provider IO.
test('Stripe tip settlement requires raw provider authority and survives reorder/retry', {timeout:240_000}, async t => {
  const {db,replayReport}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  let checks=0,eventNumber=0;
  const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
  const ok=(actual,label)=>{assert.ok(actual,label);checks++;};
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
    const buyer=actors.find(a=>a.kind==='buyer1'),other=actors.find(a=>a.kind==='buyer2'),creator=actors.find(a=>a.kind==='creator');
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    const tip='ec000000-0000-4000-8000-000000000001',request='ec000000-0000-4000-8000-000000000002';
    const checkout='cs_test_settlement1',intent='pi_settlement1';
    const quote={tipId:tip,creatorId:creator.user_id,amountCents:300,currency:'usd',providerAccountId:'acct_fixture',body:{
      client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,
      'metadata[creator_user_id]':creator.user_id,'line_items[0][price_data][currency]':'usd',
      'line_items[0][price_data][unit_amount]':300,'payment_intent_data[transfer_data][destination]':'acct_fixture',
      mode:'payment',success_url:'chillywoodmobile://tip-status',expires_at:Math.floor(Date.now()/1000)+3600}};
    const receipt=(paymentIntent=intent)=>one('select public.record_creator_tip_checkout_session($1,$2,$3,$4,$5)',[buyer.user_id,buyer.session_id,request,checkout,paymentIntent]);
    const seed=async({bindSession=true,bindIntent=true}={})=>{
      await one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[buyer.user_id,buyer.session_id,request,quote]);
      if(bindSession)await receipt(bindIntent?intent:null);
    };
    const row=async()=> (await db.query('select status,payment_status,creator_net_cents,total_paid_cents,tip_amount_cents,refunded_amount_cents,paid_at,refunded_at,payout_status,provider_payment_intent_id,metadata from public.creator_tip_transactions where id=$1',[tip])).rows[0];
    const common={event_livemode:false,event_account:null,object_livemode:false,amount_cents:300,currency:'usd',
      payment_intent_id:intent,metadata_tip_id:tip,metadata_sender_id:buyer.user_id,metadata_creator_id:creator.user_id};
    const checkoutFacts={...common,object_type:'checkout.session',object_id:checkout,client_reference_id:tip,
      object_status:'complete',checkout_mode:'payment',payment_status:'paid'};
    const intentFacts={...common,object_type:'payment_intent',object_id:intent,object_status:'succeeded',amount_received_cents:300};
    const refundFacts=amount=>({...common,object_type:'charge',object_id:'ch_settlement1',amount_refunded_cents:amount,refunded:amount===300});
    const disputeFacts={...common,object_type:'dispute',object_id:'dp_settlement1'};
    const reserve=(id,type,attempt=randomUUID())=>one('select public.reserve_stripe_tip_webhook_event($1,$2,$3,$4)',[id,type,'d'.repeat(64),attempt]);
    const project=(id,attempt,facts)=>one("select public.process_stripe_tip_webhook_lifecycle($1,$2,$3,$4,'{\"metadata\":{\"provider_completion_exact\":true}}','{}')",[id,attempt,tip,facts]);
    const settle=async(type,facts,id=`evt_tipSettlement${++eventNumber}`)=>{
      const attempt=randomUUID();eq((await reserve(id,type,attempt)).disposition,'claimed');
      return {id,attempt,result:await project(id,attempt,facts)};
    };
    const scenario=async(name,body)=>t.test(name,async()=>{await db.exec('begin');try{await body();}finally{await db.exec('rollback');}});

    await scenario('unpaid completion binds its exact PI without credit, then delayed paid settlement is idempotent',async()=>{
      await seed({bindIntent:false});
      const pending=await settle('checkout.session.completed',{...checkoutFacts,payment_status:'unpaid'});
      eq(pending.result.reason,'tip_payment_pending');eq((await row()).status,'checkout_started');
      eq((await row()).provider_payment_intent_id,intent);eq((await row()).creator_net_cents,300);eq((await row()).paid_at,null);
      const paid=await settle('checkout.session.async_payment_succeeded',checkoutFacts);
      eq(paid.result.status,'paid');eq(paid.result.buyerAuthorityValid,true);eq((await row()).creator_net_cents,300);
      const paidAt=(await row()).paid_at;eq((await reserve(paid.id,'checkout.session.async_payment_succeeded')).disposition,'duplicate');
      await settle('checkout.session.completed',checkoutFacts);eq((await row()).paid_at,paidAt);
      await settle('checkout.session.async_payment_failed',{...checkoutFacts,payment_status:'unpaid'});eq((await row()).status,'paid');
      eq((await row()).payout_status,'not_payable');eq((await row()).total_paid_cents,300);
    });

    await scenario('SQL rejects malformed success independently of claimed Edge approval',async()=>{
      await seed();
      const invalid=[
        {payment_status:undefined},{payment_status:null},{payment_status:'no_payment_required'},{payment_status:'unknown'},
        {object_status:'open'},{object_type:'payment_intent'},{checkout_mode:'subscription'},
        {client_reference_id:undefined},{client_reference_id:other.user_id},{object_id:'cs_test_wrong'},
        {payment_intent_id:'pi_wrong'},{payment_intent_id:undefined},{amount_cents:0},{amount_cents:299},
        {amount_cents:'300'},{amount_cents:300.5},{amount_cents:2147483648},{currency:'eur'},
        {metadata_tip_id:other.user_id},{metadata_sender_id:other.user_id},{metadata_creator_id:other.user_id},
        {event_livemode:true},{event_livemode:undefined},{event_livemode:'false'},
        {object_livemode:true},{object_livemode:undefined},{event_account:'acct_connected'},
      ];
      for(const patch of invalid){
        const value=await settle('checkout.session.completed',{...checkoutFacts,...patch});
        eq(value.result.reason,'tip_provider_lifecycle_identity_mismatch',JSON.stringify(patch));
        eq(value.result.updated,false);eq((await row()).status,'checkout_started');eq((await row()).creator_net_cents,300);
      }
      for(const status of ['unpaid','no_payment_required',undefined]){
        const value=await settle('checkout.session.async_payment_succeeded',{...checkoutFacts,payment_status:status});
        eq(value.result.updated,false);eq((await row()).paid_at,null);
      }
    });

    await scenario('delayed failure records no credit and valid later paid authority can settle',async()=>{
      await seed({bindIntent:false});
      for(const status of ['paid','no_payment_required',undefined]){
        eq((await settle('checkout.session.async_payment_failed',{...checkoutFacts,payment_status:status})).result.updated,false);
      }
      eq((await settle('checkout.session.async_payment_failed',{...checkoutFacts,payment_status:'unpaid'})).result.status,'failed');
      eq((await row()).provider_payment_intent_id,intent);eq((await row()).creator_net_cents,300);eq((await row()).paid_at,null);
      eq((await settle('checkout.session.async_payment_succeeded',checkoutFacts)).result.status,'paid');
      eq((await row()).creator_net_cents,300);
    });

    await scenario('separately confirmed PaymentIntent must have exactly the requested and received amount',async()=>{
      await seed();
      for(const patch of [
        {object_status:'processing'},{object_status:'requires_capture'},{amount_received_cents:undefined},
        {amount_received_cents:0},{amount_received_cents:299},{amount_received_cents:301},{amount_received_cents:'300'},
        {object_id:'pi_wrong'},{payment_intent_id:'pi_wrong'},{amount_cents:299},{event_account:'acct_connected'},
      ]){
        eq((await settle('payment_intent.succeeded',{...intentFacts,...patch})).result.updated,false,JSON.stringify(patch));
        eq((await row()).creator_net_cents,300);
      }
      eq((await settle('payment_intent.succeeded',intentFacts)).result.status,'paid');eq((await row()).creator_net_cents,300);
      await settle('payment_intent.payment_failed',{...intentFacts,object_status:'requires_payment_method',amount_received_cents:0});
      eq((await row()).status,'paid','late failure cannot undo recognized success');
    });

    await scenario('PaymentIntent before receipt binding remains retryable and cannot credit from metadata alone',async()=>{
      await seed({bindIntent:false});
      const early=await settle('payment_intent.succeeded',intentFacts);
      eq(early.result.reason,'tip_provider_identity_pending');eq((await row()).creator_net_cents,300);
      eq(await one('select status from public.monetization_webhook_events where event_id=$1',[early.id]),'failed');
      // The earlier unpaid session completion supplies exact session authority.
      await settle('checkout.session.completed',{...checkoutFacts,payment_status:'unpaid'});
      const retry=randomUUID();eq((await reserve(early.id,'payment_intent.succeeded',retry)).disposition,'claimed');
      eq((await project(early.id,retry,intentFacts)).status,'paid');eq((await row()).creator_net_cents,300);
      eq(await one("select count(*)::integer from public.creator_tip_events where provider_event_id=$1 and event_type='payment_succeeded'",[early.id]),1);
    });

    await scenario('Checkout callback before initial receipt cannot grant and retries after exact receipt',async()=>{
      await seed({bindSession:false});
      const early=await settle('checkout.session.completed',checkoutFacts);
      eq(early.result.reason,'tip_provider_identity_pending');eq((await row()).paid_at,null);
      await receipt();const retry=randomUUID();eq((await reserve(early.id,'checkout.session.completed',retry)).disposition,'claimed');
      eq((await project(early.id,retry,checkoutFacts)).status,'paid');eq((await row()).creator_net_cents,300);
    });

    for(const [eventType,removalFacts,expectedStatus,expectedNet] of [
      ['charge.refunded',refundFacts(100),'paid',200],
      ['charge.dispute.created',disputeFacts,'disputed',300],
    ]) await scenario(`${eventType} before PI binding retries and retains precedence over later success`,async()=>{
      await seed({bindIntent:false});
      const early=await settle(eventType,removalFacts);
      eq(early.result.reason,'tip_provider_identity_pending');eq(early.result.updated,false);
      eq((await row()).provider_payment_intent_id,null);eq((await row()).refunded_amount_cents,0);
      eq(await one('select status from public.monetization_webhook_events where event_id=$1',[early.id]),'failed');
      await receipt();const retry=randomUUID();eq((await reserve(early.id,eventType,retry)).disposition,'claimed');
      eq((await project(early.id,retry,removalFacts)).updated,true);
      await settle('checkout.session.async_payment_succeeded',checkoutFacts);
      eq((await row()).status,expectedStatus);eq((await row()).creator_net_cents,expectedNet);
      eq((await reserve(early.id,eventType)).disposition,'duplicate');
    });

    await scenario('disabled new sales do not discard a legitimate bound callback or activate payouts/live money',async()=>{
      await seed();
      await db.exec("update public.platform_money_kill_switches set state='off' where key in ('tips_enabled','digital_sales_enabled','creator_monetization_enabled','live_money_enabled','payouts_enabled')");
      eq((await settle('checkout.session.async_payment_succeeded',checkoutFacts)).result.status,'paid');
      eq((await row()).creator_net_cents,300);eq((await row()).payout_status,'not_payable');
      eq(await one("select count(*)::integer from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled') and state<>'off'"),0);
    });

    await scenario('retired original buyer session records payment with sticky compensation and zero creator credit',async()=>{
      await seed();await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[buyer.session_id]);
      const paid=await settle('checkout.session.async_payment_succeeded',checkoutFacts);
      eq(paid.result.status,'paid');eq(paid.result.compensationRequired,true);eq((await row()).creator_net_cents,0);
      await db.query('update auth.sessions set not_after=null where id=$1',[buyer.session_id]);
      await settle('payment_intent.succeeded',intentFacts);eq((await row()).metadata.compensation_required,true);eq((await row()).creator_net_cents,0);
    });

    await scenario('refunds are cumulative and monotonic before/after success, preserving dispute precedence',async()=>{
      await seed();await settle('checkout.session.completed',checkoutFacts);
      await settle('charge.refunded',refundFacts(100));eq((await row()).status,'paid');eq((await row()).refunded_amount_cents,100);eq((await row()).creator_net_cents,200);
      await settle('charge.refunded',refundFacts(50));eq((await row()).refunded_amount_cents,100);eq((await row()).creator_net_cents,200);
      await settle('payment_intent.succeeded',intentFacts);eq((await row()).creator_net_cents,200);
      const full=await settle('charge.refunded',refundFacts(300));eq((await row()).status,'refunded');eq((await row()).creator_net_cents,0);
      eq((await reserve(full.id,'charge.refunded')).disposition,'duplicate');
      await settle('checkout.session.async_payment_succeeded',checkoutFacts);eq((await row()).status,'refunded');
      await settle('charge.dispute.created',disputeFacts);eq((await row()).status,'disputed');
      await settle('charge.refunded',refundFacts(100));await settle('payment_intent.succeeded',intentFacts);
      eq((await row()).status,'disputed');eq((await row()).payment_status,'charged_back');eq((await row()).refunded_amount_cents,300);
      eq((await row()).tip_amount_cents,300);eq((await row()).total_paid_cents,300);
    });

    await scenario('partial refund arriving before first success credits only the unrefunded balance once',async()=>{
      await seed();await settle('charge.refunded',refundFacts(100));
      eq((await row()).creator_net_cents,200);eq((await row()).paid_at,null);eq((await row()).refunded_amount_cents,100);
      await settle('checkout.session.async_payment_succeeded',checkoutFacts);
      eq((await row()).creator_net_cents,200,'first recognized success accounts for the already-refunded amount');
      const paidAt=(await row()).paid_at;await settle('payment_intent.succeeded',intentFacts);
      eq((await row()).creator_net_cents,200);eq((await row()).paid_at,paidAt);
      await settle('charge.refunded',refundFacts(50));eq((await row()).creator_net_cents,200);
      await settle('charge.refunded',refundFacts(200));eq((await row()).creator_net_cents,100);
    });

    await scenario('full refund before success is terminal and invalid refund identity/economics cannot change accounting',async()=>{
      await seed();
      for(const patch of [{object_id:'dp_wrong'},{object_type:'dispute'},{payment_intent_id:'pi_wrong'},
        {amount_cents:301},{amount_refunded_cents:301},{amount_refunded_cents:-1},{amount_refunded_cents:'100'},
        {refunded:true},{currency:'eur'},{object_livemode:true},{event_account:'acct_connected'}]){
        eq((await settle('charge.refunded',{...refundFacts(100),...patch})).result.updated,false);
        eq((await row()).refunded_amount_cents,0);
      }
      await settle('charge.refunded',refundFacts(300));await settle('checkout.session.async_payment_succeeded',checkoutFacts);
      eq((await row()).status,'refunded');eq((await row()).creator_net_cents,0);eq((await row()).paid_at,null);
    });

    await scenario('only unpaid expired Checkout cancels a pending attempt',async()=>{
      await seed();
      for(const payment_status of ['paid','no_payment_required',undefined]){
        eq((await settle('checkout.session.expired',{...checkoutFacts,object_status:'expired',payment_status})).result.updated,false);
        eq((await row()).status,'checkout_started');
      }
      eq((await settle('checkout.session.expired',{...checkoutFacts,object_status:'expired',payment_status:'unpaid'})).result.status,'canceled');
      await settle('checkout.session.async_payment_succeeded',checkoutFacts);eq((await row()).status,'canceled');eq((await row()).creator_net_cents,300);
    });

    await scenario('event finalization fault rolls back payment and audit, then the same delivery can reclaim and finish once',async()=>{
      await seed();
      const id=`evt_tipSettlement${++eventNumber}`,attempt=randomUUID();await reserve(id,'checkout.session.completed',attempt);
      await db.exec(`create function event_reservation_fixture.fail_tip_finalize() returns trigger language plpgsql as $$
        begin if new.provider='stripe_tip' and new.status='processed' then raise exception 'injected_tip_finalize_failure'; end if; return new; end; $$;
        create trigger test_tip_finalize_failure before update on public.monetization_webhook_events for each row execute function event_reservation_fixture.fail_tip_finalize();`);
      await db.exec('savepoint failed_projection');
      await assert.rejects(()=>project(id,attempt,checkoutFacts),/injected_tip_finalize_failure/);checks++;
      await db.exec('rollback to savepoint failed_projection');
      eq((await row()).status,'checkout_started');eq((await row()).creator_net_cents,300);eq((await row()).paid_at,null);
      eq(await one('select count(*)::integer from public.creator_tip_events where provider_event_id=$1',[id]),0);
      eq(await one('select status from public.monetization_webhook_events where event_id=$1',[id]),'received');
      await db.exec('drop trigger test_tip_finalize_failure on public.monetization_webhook_events');
      await one("select public.finalize_stripe_tip_webhook_event($1,$2,'failed')",[id,attempt]);
      const retry=randomUUID();eq((await reserve(id,'checkout.session.completed',retry)).disposition,'claimed');
      eq((await project(id,retry,checkoutFacts)).status,'paid');
      eq(await one('select count(*)::integer from public.creator_tip_events where provider_event_id=$1',[id]),1);
      eq((await reserve(id,'checkout.session.completed')).disposition,'duplicate');
    });

    for(const role of ['anon','authenticated'])eq(await one("select has_function_privilege($1,'public.process_stripe_tip_webhook_lifecycle(text,uuid,uuid,jsonb,jsonb,jsonb)','execute')",[role]),false);
    ok(await one("select has_function_privilege('service_role','public.process_stripe_tip_webhook_lifecycle(text,uuid,uuid,jsonb,jsonb,jsonb)','execute')"));
    t.diagnostic(`${checks} explicit authority/accounting assertions; ${replayReport.files.length} migrations replayed; managed-infrastructure substitutions=${replayReport.skipped.length}`);
  } finally {await db.close();}
});
