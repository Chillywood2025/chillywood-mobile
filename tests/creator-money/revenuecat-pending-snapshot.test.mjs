import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

const exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/revenuecat-pending-snapshot.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
 {exports,URL,TextDecoder,AbortController,setTimeout,clearTimeout,fetch});
const {readPendingRevenueCatSnapshot}=exports;
const user='9b470000-0000-4000-8000-000000000022';
const job={event_id:'reverse',lease:'lease',provider:'revenuecat_app_store',user_id:user,original_transaction_id:'1000001',
 environment:'sandbox',project_id:'proj_test',provider_product_id:'com.chillywood.premium.monthly',provider_base_plan_id:null};
function provider({patch={},changed=false,historyPatch={},foreignPage=false}={}){
 const now=Date.now(),calls=[];let subscriptionReads=0;
 const subscription={object:'subscription',id:'sub_test',customer_id:user,original_customer_id:user,environment:'sandbox',store:'app_store',
  ownership:'purchased',gives_access:true,pending_payment:false,status:'active',product_id:'prod_test',store_subscription_identifier:'1000001',
  starts_at:now-3600000,current_period_starts_at:now-3600000,current_period_ends_at:now+3600000,...patch};
 const transport=async(url,options)=>{
  calls.push([url,options]);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  const path=new URL(url).pathname;let data;
  if(path.endsWith('/subscriptions'))data={object:'list',items:[{id:'sub_test'}],next_page:foreignPage?'https://evil.invalid/secret':null};
  else if(path.endsWith('/transactions'))data={object:'list',items:[{object:'subscription_transaction',id:'1000001',purchased_at:now-3600000,
   product_store_identifier:job.provider_product_id,effective_expiration_date:now+3600000,...historyPatch}],next_page:null};
  else if(path.endsWith('/entitlements'))data={object:'list',items:[{object:'entitlement',lookup_key:'premium'}],next_page:null};
  else if(path.includes('/products/'))data={object:'product',id:'prod_test',type:'subscription',store_identifier:job.provider_product_id};
  else {subscriptionReads++;data=changed&&subscriptionReads>1?{...subscription,gives_access:false}:subscription;}
  return Response.json(data);
 };
 return {transport,now,calls};
}
test('actual pending snapshot reader binds provider origin/current history and refuses changed or ambiguous authority',async()=>{
 const good=provider();const snapshot=await readPendingRevenueCatSnapshot(job,'synthetic-key',good.transport,()=>good.now);
 assert.equal(snapshot.originalTransactionId,'1000001');assert.equal(snapshot.currentTransactionId,'1000001');assert.equal(snapshot.environment,'sandbox');
 assert.equal(good.calls.length,6);
 for(const scenario of [{patch:{customer_id:'other'}},{patch:{original_customer_id:'other'}},{patch:{environment:'production'}},
  {patch:{store:'play_store'}},{patch:{pending_payment:true}},{patch:{ownership:'family_shared'}},{changed:true},
  {historyPatch:{id:'unrelated'}},{historyPatch:{effective_expiration_date:1}},{foreignPage:true}]){
  const h=provider(scenario);await assert.rejects(readPendingRevenueCatSnapshot(job,'synthetic-key',h.transport,()=>h.now),/snapshot_|history_/);
  assert.ok(h.calls.every(([url])=>url.startsWith('https://api.revenuecat.com/v2/projects/proj_test/')));
 }
});

test('customer-scoped discovery binds multi-renewal Apple and Google histories without confusing unrelated subscriptions',async()=>{
 for(const store of ['app_store','play_store'])for(const scenario of ['match','unrelated_only','ambiguous']){
  const now=Date.now(),google=store==='play_store',original=google?'GPA.1234-5678-9012-34567':'2000001';
  const target={...job,provider:google?'revenuecat_google_play':'revenuecat_app_store',original_transaction_id:original,
   provider_product_id:google?'premium_subscription':job.provider_product_id,provider_base_plan_id:google?'monthly':null};
  const calls=[];
  const transport=async(url)=>{
   calls.push(url);const path=new URL(url).pathname;
   const ids=scenario==='unrelated_only'?['sub_other']:scenario==='ambiguous'?['sub_match','sub_duplicate']:['sub_other','sub_match'];
   if(path.includes('/customers/')){
    assert.ok(path.includes(`/customers/${user}/subscriptions`));assert.equal(new URL(url).searchParams.get('environment'),'sandbox');
    return Response.json({object:'list',items:ids.map(id=>({id})),next_page:null});
   }
   const sid=path.split('/subscriptions/')[1]?.split('/')[0];const origin=sid==='sub_other'?'unrelated_original':original;
   if(path.endsWith('/transactions'))return Response.json({object:'list',items:[0,1,2].map(i=>({object:'subscription_transaction',
    id:i===0?origin:`${origin}.renewal${i}`,purchased_at:now-(3-i)*86400000,
    product_store_identifier:target.provider_product_id,effective_expiration_date:now+(i+1)*86400000})),next_page:null});
   if(path.endsWith('/entitlements'))return Response.json({object:'list',items:[{lookup_key:'premium'}],next_page:null});
   if(path.includes('/products/'))return Response.json({object:'product',id:'prod_target',type:'subscription',
    store_identifier:google?'premium_subscription:monthly':target.provider_product_id});
   return Response.json({object:'subscription',id:sid,customer_id:user,original_customer_id:user,environment:'sandbox',store,
    ownership:'purchased',gives_access:true,pending_payment:false,status:'active',product_id:'prod_target',
    store_subscription_identifier:`${origin}.renewal2`,starts_at:now-3*86400000,current_period_starts_at:now-86400000,current_period_ends_at:now+3*86400000});
  };
  if(scenario==='match'){
   const result=await readPendingRevenueCatSnapshot(target,'synthetic-key',transport,()=>now);
   assert.equal(result.originalTransactionId,original);assert.equal(result.currentTransactionId,`${original}.renewal2`);
   assert.equal(result.subscriptionId,'sub_match');assert.equal(result.store,store);
  }else await assert.rejects(readPendingRevenueCatSnapshot(target,'synthetic-key',transport,()=>now),/snapshot_ineligible/);
  assert.ok(calls.every(url=>!url.includes('store_subscription_identifier=')));
 }
});

test('production aggregate deadline rejects stalled transport, body and cancel even when the transport ignores AbortSignal',async()=>{
 const api={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/revenuecat-pending-snapshot.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
  {exports:api,URL,TextDecoder,AbortController,fetch,clearTimeout,
   // Controlled clock boundary; production deadline remains60seconds.
   setTimeout:(callback,delay)=>setTimeout(callback,Math.min(delay,20))});
 const never=()=>new Promise(()=>{});
 for(const transport of [never,async()=>new Response(new ReadableStream({pull:never,cancel:never}))]){
  await assert.rejects(api.readPendingRevenueCatSnapshot(job,'synthetic-key',transport),/provider_unavailable/);
 }
});

test('actual worker handler requires service authority, uses only claimed identity, and defers unknown completion',async()=>{
 const file='supabase/functions/revenuecat-pending-reconcile/index.ts',source=fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 const code=ts.transpileModule(ast.statements.filter(n=>!ts.isImportDeclaration(n)&&!n.getText(ast).includes('import.meta.main'))
  .map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 for(const outcome of ['off','ready','unknown']){
  const api={},calls=[],h=provider();
  const client={rpc:async(name,args)=>{calls.push([name,args]);
   if(name==='claim_revenuecat_nonpurchase_snapshot')return {data:outcome==='off'?null:job,error:null};
   if(name==='complete_revenuecat_nonpurchase_snapshot')return outcome==='unknown'?{data:null,error:{message:'network'}}:{data:{status:'applied'},error:null};
   if(name==='defer_revenuecat_nonpurchase_snapshot')return {data:true,error:null};throw Error(name);
  }};
  vm.runInNewContext(code,{exports:api,Request,Response,setTimeout,clearTimeout,
   createAdminClient:()=>({configured:true,client}),readOptionalEnv:name=>({SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',
    REVENUECAT_PROJECT_ID:'proj_test',REVENUECAT_SECRET_API_KEY:'synthetic-key',REVENUECAT_RECONCILIATION_ENVIRONMENT:'sandbox'})[name],
   jsonResponse:(status,value)=>Response.json(value,{status}),hashText:async text=>createHash('sha256').update(text).digest('hex'),
   canonicalSnapshot:exports.canonicalSnapshot,readPendingRevenueCatSnapshot:(claimed,key)=>readPendingRevenueCatSnapshot(claimed,key,h.transport,()=>h.now),
  });
  assert.equal((await api.handler(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer client-jwt'}}))).status,403);
  assert.equal(calls.length,0);
  const response=await api.handler(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer synthetic-service'},
   body:JSON.stringify({environment:'production',user_id:'attacker',snapshot:{givesAccess:true}})}));
  assert.equal(response.status,outcome==='unknown'?503:200);assert.equal(calls[0][1].p_environment,'sandbox');
  assert.equal((await response.json()).financialAuthority,false);
  if(outcome==='off'){assert.equal(h.calls.length,0);assert.equal(calls.length,1);}
  else{assert.equal(calls[1][1].p_snapshot.customerId,user);assert.match(calls[1][1].p_snapshot_hash,/^[a-f0-9]{64}$/);}
  if(outcome==='unknown')assert.equal(calls.at(-1)[0],'defer_revenuecat_nonpurchase_snapshot');
 }
});

test('full schema restores only exact refunded Premium access from later stable provider proof, preserving financial evidence', {timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try{
  await db.exec(`insert into auth.users(id,is_sso_user,is_anonymous) values('${user}',false,false);
   update public.platform_money_kill_switches set state=case when key in('revenuecat_app_store_enabled','provider_webhooks_enabled') then 'sandbox_only' else 'off' end;
   select set_config('request.jwt.claims','{"role":"service_role"}',false);`);
  const times=(await db.query(`select clock_timestamp()-interval '1 hour' start,clock_timestamp()+interval '1 hour' expiry,
   clock_timestamp()-interval '30 minutes' initial,clock_timestamp()-interval '10 minutes' refund,clock_timestamp()-interval '1 minute' reversal`)).rows[0];
  const initial=await one(`select public.process_revenuecat_premium_event_atomic('revenuecat_app_store','snapshot-initial','INITIAL_PURCHASE',
   $1::uuid,provider_product_id,provider_base_plan_id,'sandbox','active',$2::timestamptz,$3::timestamptz,$4::timestamptz,
   999,'usd',repeat('a',64),'NORMAL','app_store','ios',id,product_id,'1000001') from public.monetization_product_store_mappings
   where provider_product_id='com.chillywood.premium.monthly' and provider='revenuecat_app_store' and environment='sandbox' limit 1`,[user,times.start,times.expiry,times.initial]);
  assert.equal(initial.entitlementActive,true,JSON.stringify(initial));
  await one(`select public.process_revenuecat_terminal_event_atomic('revenuecat_app_store','snapshot-refund','REFUND',$1::uuid,
   'com.chillywood.premium.monthly',null,'sandbox','revoked',null,null,$2::timestamptz,repeat('b',64),'NORMAL','app_store','ios','1000001')`,[user,times.refund]);
  assert.equal(await one('select public.premium_subject_has_finite_authority_internal($1)',[user]),false);
  const money=await one('select count(*)::int from public.money_access_ledger_events');
  const terminal=await one(`select to_jsonb(e) from public.provider_events e where provider_event_id='snapshot-refund'`);
  const event=await one(`select public.process_revenuecat_nonpurchase_lifecycle_atomic('revenuecat_app_store','snapshot-reversal','REFUND_REVERSED',
   $1::uuid,'com.chillywood.premium.monthly',null,'sandbox','1000001',null,null,$2::timestamptz,repeat('c',64))`,[user,times.reversal]);
  assert.equal(event.status,'pending');
  assert.equal(await one(`select public.claim_revenuecat_nonpurchase_snapshot('sandbox','proj_test')`),null);
  await db.exec(`update private.revenuecat_snapshot_worker_modes set enabled=true,project_id='proj_test' where environment='sandbox'`);
  const claim=await one(`select public.claim_revenuecat_nonpurchase_snapshot('sandbox','proj_test')`);assert.ok(claim?.lease,JSON.stringify(claim));
  const snapshot={contract:'rc-exact-current-subscription-v1',projectId:'proj_test',customerId:user,originalCustomerId:user,
   environment:'sandbox',store:'app_store',originalTransactionId:'1000001',currentTransactionId:'1000001',productIdentifier:job.provider_product_id,
   basePlanId:null,subscriptionId:'sub_test',status:'active',givesAccess:true,ownership:'purchased',pendingPayment:false,
   startsAt:times.start,expiresAt:times.expiry,observedAt:new Date().toISOString()};
  const complete=patch=>one(`select public.complete_revenuecat_nonpurchase_snapshot('snapshot-reversal',$1::uuid,$2::jsonb,repeat('d',64))`,[claim.lease,JSON.stringify({...snapshot,...patch})]);
  for(const patch of [{customerId:'other'},{environment:'production'},{productIdentifier:'other'},{basePlanId:'wrong'},{givesAccess:false},
   {observedAt:'2020-01-01T00:00:00Z'}])await assert.rejects(complete(patch),/snapshot_/);
  for(const change of [
   `update public.revenuecat_premium_transaction_authority set current_provider_base_plan_id='changed' where original_transaction_id='1000001'`,
   `update private.revenuecat_nonpurchase_reconciliation set lease_until=clock_timestamp()-interval '1 second' where event_id='snapshot-reversal'`,
   `update private.revenuecat_nonpurchase_reconciliation set lease_until=null where event_id='snapshot-reversal'`,
   `update private.revenuecat_snapshot_worker_modes set enabled=false where environment='sandbox'`,
   `update public.access_grants set revoke_reason='different financial marker' where user_id='${user}' and grant_type='premium'`,
   `select public.process_revenuecat_terminal_event_atomic('revenuecat_app_store','refund-between-claim-and-complete','REFUND','${user}'::uuid,
     'com.chillywood.premium.monthly',null,'sandbox','revoked',null,null,clock_timestamp(),repeat('f',64),'NORMAL','app_store','ios','1000001')`,
  ]){
   await db.exec(`begin;${change}`);await assert.rejects(complete({}),/snapshot_/);await db.exec('rollback');
  }
  const result=await complete({});assert.equal(result.status,'applied');assert.equal(result.financialAuthority,false);
  assert.equal(await one('select public.premium_subject_has_finite_authority_internal($1)',[user]),true);
  assert.equal(await one('select count(*)::int from public.money_access_ledger_events'),money);
  assert.deepEqual(await one(`select to_jsonb(e) from public.provider_events e where provider_event_id='snapshot-refund'`),terminal);
  assert.equal(await one(`select previous_binding->>'authority_state' from private.revenuecat_nonpurchase_snapshot_receipts where event_id='snapshot-reversal'`),'financial_terminal');
  assert.equal((await complete({})).duplicate,true);
  // A genuinely later refund must still revoke; retrying an older completed
  // snapshot only returns its receipt and cannot reapply it over the terminal.
  await one(`select public.process_revenuecat_terminal_event_atomic('revenuecat_app_store','snapshot-later-refund','REFUND',$1::uuid,
   'com.chillywood.premium.monthly',null,'sandbox','revoked',null,null,clock_timestamp(),repeat('e',64),'NORMAL','app_store','ios','1000001')`,[user]);
  assert.equal(await one('select public.premium_subject_has_finite_authority_internal($1)',[user]),false);
  assert.equal((await complete({})).duplicate,true);
  assert.equal(await one('select public.premium_subject_has_finite_authority_internal($1)',[user]),false);
  for(const role of ['anon','authenticated'])assert.equal(await one(`select has_function_privilege($1,'public.complete_revenuecat_nonpurchase_snapshot(text,uuid,jsonb,text)','execute')`,[role]),false);
  assert.equal(await one(`select private.revenuecat_snapshot_mode_allowed('production','proj_test')`),false);
  await db.exec(`update private.revenuecat_snapshot_worker_modes set enabled=true,project_id='proj_test' where environment='production'`);
  assert.equal(await one(`select private.revenuecat_snapshot_mode_allowed('production','proj_test')`),false,'enabled is not qualification');
  await db.exec(`update private.revenuecat_snapshot_worker_modes set qualification_hash=repeat('f',64),qualified_at=clock_timestamp()-interval '31 days' where environment='production'`);
  assert.equal(await one(`select private.revenuecat_snapshot_mode_allowed('production','proj_test')`),false,'expired qualification is not live proof');
 }finally{await db.close();}
});
