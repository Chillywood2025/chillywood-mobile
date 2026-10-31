import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('real merchandise RPC reconciles exact payments and cumulative refunds atomically', {timeout:240_000}, async t=>{
  const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  let serial=0,events=0,checks=0;
  const buyer='e7000000-0000-4000-8000-000000000001',other='e7000000-0000-4000-8000-000000000002';
  const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const row=async id=>(await db.query('select * from public.merch_orders where id=$1',[id])).rows[0];
  const make=async(patch={})=>{
    const n=++serial,id=`e7110000-0000-4000-8000-${String(n).padStart(12,'0')}`;
    const order={id,buyer_id:buyer,provider:'stripe_physical_goods',environment:'sandbox',order_status:'pending',
      fulfillment_status:'not_started',payment_status:'pending',amount_subtotal_minor:1000,amount_total_minor:1000,
      currency:'usd',stripe_checkout_session_id:`cs_test_merch_${n}`,stripe_payment_intent_id:`pi_merch_${n}`,...patch};
    const keys=Object.keys(order);
    await db.query(`insert into public.merch_orders(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(order));
    return order;
  };
  const facts=(o,patch={})=>({event_livemode:false,object_livemode:false,object_id:o.stripe_checkout_session_id,
    object_type:'checkout.session',payment_intent_id:o.stripe_payment_intent_id,metadata_order_id:o.id,
    client_reference_id:o.id,mode:'payment',status:'complete',payment_status:'paid',amount_minor:1000,currency:'usd',...patch});
  const pi=(o,patch={})=>facts(o,{object_id:o.stripe_payment_intent_id,object_type:'payment_intent',
    status:'succeeded',amount_received_minor:1000,...patch});
  const refund=(o,amount=250,patch={})=>facts(o,{object_id:`ch_${o.id.replaceAll('-','')}`,object_type:'charge',
    refunded_amount_minor:amount,refunded:amount===1000,...patch});
  const dispute=(o,patch={})=>facts(o,{object_id:`dp_${o.id.replaceAll('-','')}`,object_type:'dispute',
    charge_id:`ch_${o.id.replaceAll('-','')}`,...patch});
  const send=async(type,f,id=`evt_merch_${++events}`,hash=createHash('sha256').update(JSON.stringify({type,f})).digest('hex'))=>
    one('select public.process_stripe_merch_webhook_lifecycle($1,$2,$3,$4)',[id,type,hash,f]);
  try {
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    await t.test('only paid positive-price Checkout and fully received succeeded PI can credit',async()=>{
      for(const payment_status of [null,'unknown','unpaid','no_payment_required','PAID']){
        const o=await make();await send('checkout.session.completed',facts(o,{payment_status}));
        eq((await row(o.id)).payment_status,'pending');eq((await row(o.id)).paid_at,null);
      }
      for(const patch of [{status:'processing'},{amount_received_minor:null},{amount_received_minor:500},{amount_received_minor:1001}]){
        const o=await make();await send('payment_intent.succeeded',pi(o,patch));eq((await row(o.id)).payment_status,'pending');
      }
      const o=await make();eq((await send('payment_intent.succeeded',pi(o))).reason,'payment_confirmed');
      eq((await row(o.id)).amount_total_minor,1000);eq((await row(o.id)).fulfillment_status,'processing');
      const pending=await make({stripe_payment_intent_id:null});
      const completed=facts(pending,{payment_status:'unpaid',payment_intent_id:'pi_delayed'});
      eq((await send('checkout.session.completed',completed)).reason,'payment_pending');
      eq((await row(pending.id)).stripe_payment_intent_id,'pi_delayed');eq((await row(pending.id)).payment_status,'pending');
      await send('checkout.session.async_payment_succeeded',{...completed,payment_status:'paid'});
      eq((await row(pending.id)).payment_status,'paid');
    });
    await t.test('failed delayed payment grants nothing; reordered failures cannot erase settled value',async()=>{
      const o=await make();await send('checkout.session.async_payment_failed',facts(o,{payment_status:'unpaid'}));
      eq((await row(o.id)).payment_status,'failed');eq((await row(o.id)).fulfillment_status,'not_started');
      await send('checkout.session.async_payment_succeeded',facts(o,{payment_status:'unpaid'}));
      eq((await row(o.id)).payment_status,'failed');
      await send('checkout.session.async_payment_succeeded',facts(o));eq((await row(o.id)).payment_status,'paid');
      await send('checkout.session.async_payment_failed',facts(o,{payment_status:'unpaid'}));
      await send('payment_intent.payment_failed',pi(o,{status:'requires_payment_method',amount_received_minor:0}));
      eq((await row(o.id)).payment_status,'paid');
    });
    await t.test('identity, environment and economics mismatches cannot alter order authority',async()=>{
      const bad=[{object_id:'cs_test_other'},{payment_intent_id:'pi_other'},{client_reference_id:other},
        {metadata_buyer_id:other},{metadata_environment:'production'},{metadata_rail:'digital'},
        {currency:'eur'},{amount_minor:999},{amount_minor:0},{amount_minor:1.5},{amount_minor:'1000'},
        {event_livemode:true},{event_livemode:null},{object_livemode:true},{object_livemode:null},{event_account_id:'acct_other'},
        {object_type:'payment_intent'},{mode:'subscription'}];
      for(const patch of bad){const o=await make();await send('checkout.session.completed',facts(o,patch));
        eq((await row(o.id)).payment_status,'pending');eq((await row(o.id)).amount_total_minor,1000);}
      const otherEnv=await make({environment:'production'});await send('checkout.session.completed',facts(otherEnv));
      eq((await row(otherEnv.id)).payment_status,'pending');
      const a=await make(),b=await make();await send('checkout.session.completed',facts(b,{metadata_order_id:a.id}));
      eq((await row(a.id)).payment_status,'pending');eq((await row(b.id)).payment_status,'pending');
    });
    await t.test('partial-to-full and stale refunds preserve original economics and shipping history',async()=>{
      for(const fulfillment_status of ['processing','shipped','delivered','returned']){
        const o=await make({fulfillment_status,payment_status:'paid',order_status:fulfillment_status==='delivered'?'fulfilled':'paid',paid_at:new Date().toISOString()});
        await send('charge.refunded',refund(o,250));let current=await row(o.id);
        eq(current.refunded_amount_minor,250);eq(current.payment_status,'paid');eq(current.fulfillment_status,fulfillment_status);
        await send('charge.refunded',refund(o,1000));await send('charge.refunded',refund(o,100));
        await send('payment_intent.succeeded',pi(o));current=await row(o.id);
        eq(current.refunded_amount_minor,1000);eq(current.amount_total_minor,1000);eq(current.payment_status,'refunded');
        eq(current.fulfillment_status,fulfillment_status==='processing'?'canceled':fulfillment_status);
        await send('charge.dispute.created',dispute(o));await send('charge.refunded',refund(o,1000));
        eq((await row(o.id)).payment_status,'disputed');
        eq((await row(o.id)).fulfillment_status,fulfillment_status==='processing'?'blocked':fulfillment_status);
      }
    });
    await t.test('invalid refunds and wrong charge/PI facts cannot replace cumulative evidence',async()=>{
      const o=await make({payment_status:'paid',order_status:'paid'});await send('charge.refunded',refund(o,250));
      for(const patch of [{refunded_amount_minor:1001},{refunded_amount_minor:0},{refunded_amount_minor:1.5},
        {refunded:true},{payment_intent_id:'pi_other'},{object_id:'ch_other'},{amount_minor:999},{currency:'eur'}]){
        await send('charge.refunded',refund(o,250,patch));eq((await row(o.id)).refunded_amount_minor,250);
      }
    });
    await t.test('refund/dispute before success and unknown historical refunds never reopen removed fulfillment',async()=>{
      for(const kind of ['refund','dispute']){
        const o=await make();await send(kind==='refund'?'charge.refunded':'charge.dispute.created',kind==='refund'?refund(o,1000):dispute(o));
        await send('checkout.session.completed',facts(o));eq((await row(o.id)).paid_at,null);
        eq((await row(o.id)).payment_status,kind==='refund'?'refunded':'disputed');
      }
      const partial=await make();await send('charge.refunded',refund(partial,250));
      eq((await row(partial.id)).payment_status,'pending');await send('payment_intent.succeeded',pi(partial));
      eq((await row(partial.id)).payment_status,'paid');eq((await row(partial.id)).refunded_amount_minor,250);
      const legacy=await make({payment_status:'refunded',order_status:'refunded',fulfillment_status:'canceled',refunded_at:new Date().toISOString()});
      eq((await row(legacy.id)).refunded_amount_minor,null,'historical refund amount remains unknown');
      await send('payment_intent.succeeded',pi(legacy));await send('charge.refunded',refund(legacy,250));
      eq((await row(legacy.id)).payment_status,'refunded');eq((await row(legacy.id)).fulfillment_status,'canceled');
    });
    await t.test('initial payment identity and unavailable orders stay retryable, not permanently ignored',async()=>{
      const o=await make({stripe_payment_intent_id:null});const f=pi(o,{object_id:'pi_late',payment_intent_id:'pi_late'});
      eq((await send('payment_intent.succeeded',f,'evt_early_pi')).retryable,true);
      eq(await one("select status from public.stripe_merch_events where stripe_event_id='evt_early_pi'"),'received');
      await send('checkout.session.completed',facts(o,{payment_status:'unpaid',payment_intent_id:'pi_late'}));
      eq((await send('payment_intent.succeeded',f,'evt_early_pi')).reason,'payment_confirmed');
      const missing={...o,id:'e7110000-0000-4000-8000-000000999999',stripe_checkout_session_id:'cs_test_missing',stripe_payment_intent_id:'pi_missing'};
      eq((await send('checkout.session.completed',facts(missing),'evt_missing_order')).retryable,true);
      await make(missing);eq((await send('checkout.session.completed',facts(missing),'evt_missing_order')).reason,'payment_confirmed');
    });
    await t.test('duplicate event/hash is idempotent and conflicting reuse is rejected',async()=>{
      const o=await make(),f=facts(o);await send('checkout.session.completed',f,'evt_exact_duplicate');const before=await row(o.id);
      eq((await send('checkout.session.completed',f,'evt_exact_duplicate')).status,'duplicate');eq(await row(o.id),before);
      await assert.rejects(()=>send('checkout.session.completed',f,'evt_exact_duplicate','b'.repeat(64)),/merch_event_identity_conflict/);checks++;
      eq(await row(o.id),before);
    });
    await t.test('final receipt failure rolls back order and event; legacy unfinished events recover once',async()=>{
      await db.exec(`create schema merch_reconciliation_fixture;
        create function merch_reconciliation_fixture.fail_finalization() returns trigger language plpgsql as $$begin
          if new.status='processed' and current_setting('test.merch_fail',true)='on' then raise exception 'modeled_receipt_failure'; end if;
          return new;end$$;
        create trigger merch_test_finalization_fault before update on public.stripe_merch_events
          for each row execute function merch_reconciliation_fixture.fail_finalization();`);
      for(const legacyStatus of [null,'received','failed','duplicate']){
        const o=await make(),id=`evt_rollback_${++events}`,f=facts(o);
        if(legacyStatus)await db.query(`insert into public.stripe_merch_events(stripe_event_id,event_type,environment,status,object_id)
          values($1,'checkout.session.completed','sandbox',$2,$3)`,[id,legacyStatus,o.stripe_checkout_session_id]);
        await db.exec("select set_config('test.merch_fail','on',false)");
        await assert.rejects(()=>send('checkout.session.completed',f,id),/modeled_receipt_failure/);checks++;
        eq((await row(o.id)).payment_status,'pending');eq((await row(o.id)).paid_at,null);
        const records=(await db.query('select status,raw_event_hash from public.stripe_merch_events where stripe_event_id=$1',[id])).rows;
        eq(records,legacyStatus?[{status:legacyStatus,raw_event_hash:null}]:[]);
        await db.exec("select set_config('test.merch_fail','off',false)");
        eq((await send('checkout.session.completed',f,id)).status,'processed');
        eq((await send('checkout.session.completed',f,id)).status,'duplicate');
      }
      await db.exec('drop trigger merch_test_finalization_fault on public.stripe_merch_events');
    });
    await t.test('sales disabled and viewer account changes do not rewrite the original callback authority',async()=>{
      const product='e7220000-0000-4000-8000-000000000001';
      await db.query(`insert into public.merch_products(id,display_name,product_key,provider,status,environment,price_minor,currency,inventory_status,shipping_tracking_mode)
        values($1,'Synthetic merch','merch_reconciliation_fixture','stripe_physical_goods','sandbox','sandbox',1000,'usd','in_stock','tracked')`,[product]);
      const o=await make({product_id:product});
      eq((await row(o.id)).shipping_tracking_mode,'tracked');
      await db.query("update public.merch_products set status='disabled',inventory_status='disabled' where id=$1",[product]);
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role',sub:other})]);
      await send('payment_intent.succeeded',pi(o));eq((await row(o.id)).payment_status,'paid');eq((await row(o.id)).buyer_id,buyer);
      eq((await row(o.id)).shipping_tracking_mode,'tracked');
      eq(await one('select status from public.merch_products where id=$1',[product]),'disabled');
      eq(await one('select count(*)::integer from public.merch_orders where id=$1',[o.id]),1);
    });
    await t.test('RPC grants and runtime authority exclude anonymous and authenticated callers',async()=>{
      for(const role of ['anon','authenticated']){
        eq(await one("select has_function_privilege($1,'public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb)','EXECUTE')",[role]),false);
        await db.exec(`set role ${role}`);
        await assert.rejects(()=>send('checkout.session.completed',{}),/permission denied/);checks++;
        await db.exec('reset role');
      }
      await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
      await assert.rejects(()=>send('checkout.session.completed',{}),/service_role_required/);checks++;
    });
    t.diagnostic(`${checks} real SQL assertions; no provider transport or changed guard/deadline`);
  } finally {await db.close();}
});
