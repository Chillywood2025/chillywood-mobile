import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('exact signed extension advances only a bound finite Premium period, not earnings or refund authority', {timeout:240000}, async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
 const user='9b470000-0000-4000-8000-000000000011';
 const one=async(sql,values=[])=>Object.values((await db.query(sql,values)).rows[0])[0];
 try {
  await db.exec(`insert into auth.users(id,is_sso_user,is_anonymous) values('${user}',false,false);
   update public.platform_money_kill_switches set state=case when key in ('revenuecat_google_play_enabled','provider_webhooks_enabled') then 'sandbox_only' else 'off' end
   where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled','live_money_enabled','payouts_enabled','cashout_enabled');`);
  const times=(await db.query(`select now()-interval '1 hour' start,now()+interval '1 hour' expiry,now()+interval '2 hours' extended,now()-interval '30 minutes' initial,now()-interval '1 minute' extension`)).rows[0];
  const initial=await one(`select public.process_revenuecat_premium_event_atomic(
   'revenuecat_google_play','extension-initial','INITIAL_PURCHASE',$1::uuid,provider_product_id,provider_base_plan_id,
   'sandbox','active',$2::timestamptz,$3::timestamptz,$4::timestamptz,999,'usd',repeat('a',64),'NORMAL','google_play','android',null,id,'extension-original')
   from public.monetization_products where product_key='premium_subscription_monthly' and provider='revenuecat_google_play'
    and provider_product_id='premium_subscription' and provider_base_plan_id='monthly' and environment='sandbox'`,[user,times.start,times.expiry,times.initial]);
  assert.equal(initial.entitlementActive,true,JSON.stringify(initial));
  const money=await one('select count(*)::int from public.money_access_ledger_events');
  const call=async(id,patch={})=>{
   const p={type:'SUBSCRIPTION_EXTENDED',user,product:'premium_subscription',plan:'monthly',env:'sandbox',original:'extension-original',start:times.start,expiry:times.extended,occurred:times.extension,hash:'b'.repeat(64),...patch};
   return one(`select public.process_revenuecat_nonpurchase_lifecycle_atomic('revenuecat_google_play',$1,$2,$3::uuid,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::timestamptz,$11)`,
    [id,p.type,p.user,p.product,p.plan,p.env,p.original,p.start,p.expiry,p.occurred,p.hash]);
  };
  for(const [key,value] of [['product','wrong'],['plan','wrong'],['original','wrong'],['env','production'],['start',null],['expiry',times.expiry],['occurred',times.initial]]) {
   const result=await call(`invalid-${key}`,{[key]:value});
   assert.equal(result.status,'pending',key);assert.equal(result.accessStateChanged,false,key);
  }
  const extended=await call('extension-valid');
  assert.equal(extended.status,'applied',JSON.stringify(extended));
  assert.equal(extended.financialAuthority,false);
  assert.equal(await one('select count(*)::int from public.money_access_ledger_events'),money);
  assert.equal(await one('select public.premium_subject_has_finite_authority_internal($1)',[user]),true);
  const duplicate=await call('extension-valid');assert.equal(duplicate.duplicateEvent,true);
  await assert.rejects(call('extension-valid',{hash:'c'.repeat(64)}),/identity_mismatch/);
  const graph=await one(`select jsonb_build_object('entitlement',(select to_jsonb(e) from public.user_entitlements e where user_id=$1),
   'binding',(select to_jsonb(b) from public.revenuecat_premium_transaction_authority b where user_id=$1::uuid))`,[user]);
  const reversal=await call('refund-reversed',{type:'REFUND_REVERSED'});
  assert.equal(reversal.status,'pending');assert.equal(reversal.accessStateChanged,false);
  assert.deepEqual(await one(`select jsonb_build_object('entitlement',(select to_jsonb(e) from public.user_entitlements e where user_id=$1),
   'binding',(select to_jsonb(b) from public.revenuecat_premium_transaction_authority b where user_id=$1::uuid))`,[user]),graph);
  await one(`select public.process_revenuecat_terminal_event_atomic('revenuecat_google_play','extension-refund','REFUND',$1::uuid,
   'premium_subscription','monthly','sandbox','revoked',null,null,now(),repeat('d',64),'NORMAL','google_play','android','extension-original')`,[user]);
  const afterTerminal=await call('extension-after-refund',{occurred:new Date().toISOString()});
  assert.equal(afterTerminal.status,'pending');
  assert.equal(await one('select public.premium_subject_has_finite_authority_internal($1)',[user]),false);
  for(const role of ['anon','authenticated']) assert.equal(await one(`select has_function_privilege($1,
   'public.process_revenuecat_nonpurchase_lifecycle_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)','execute')`,[role]),false);
 } finally {await db.close();}
});
