import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {connect} from './stripe-connect-observed-fixture.mjs';

const buyer='eb000000-0000-4000-8000-000000000001',creator='eb000000-0000-4000-8000-000000000002',session='eb000000-0000-4000-8000-000000000003',request='eb000000-0000-4000-8000-000000000004';
const file='supabase/functions/create-creator-tip-checkout/index.ts',source=fs.readFileSync(file,'utf8');
const compile=text=>{
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  return ts.transpileModule(ast.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
};
const code=compile(source);
const copy=x=>JSON.parse(JSON.stringify(x));
const observedPayout=(id='acct_fixture',changes={})=>({
  id:'eb000000-0000-4000-8000-000000000005',creator_user_id:creator,provider_account_id:id,
  provider:'stripe_connect',provider_environment:'test',provider_account_type:'none',provider_controller_type:'application',
  provider_is_controller:true,provider_dashboard_type:'express',provider_fees_payer:'platform',provider_fees_payer_raw:'application',
  provider_losses_collector:'platform',provider_requirements_collection:'stripe',provider_configuration_observed_at:'2026-10-27T00:00:00Z',
  provider_configuration_account_id:id,onboarding_status:'ready_for_payouts',charges_enabled:true,payouts_enabled:true,...changes,
});
function harness(compiled=code){
  let handler,attempt=null,authorityReads=0,payoutReads=0,profile='First name',account='acct_fixture',payout={},payoutSequence=null,retryAllowed=true,failAfterAccept=false,recordFailure=false,retiredAt=Infinity,terminal=false;
  const calls=[],sessions=new Map();
  const settings={creator_id:creator,tips_enabled:true,status:'active',currency:'usd',min_amount_cents:100,max_amount_cents:50000,provider_charges_enabled:true,provider_payouts_enabled:true};
  const admin={from(table){const q={};for(const method of ['select','eq','in','gte','or','limit','update','insert'])q[method]=()=>q;
    q.update=value=>{if(table==='creator_tip_settings')Object.assign(settings,copy(value));return q;};
    const result=()=>({error:null,count:attempt?1:0,data:table==='platform_money_kill_switches'?{state:q.key==='live_money_enabled'?'off':'sandbox_only'}:table==='creator_tip_settings'?settings:table==='user_profiles'?{display_name:profile}:[]});
    q.eq=(key,value)=>{if(key==='key')q.key=value;return q;};q.maybeSingle=q.single=async()=>result();q.then=(ok,fail)=>Promise.resolve(result()).then(ok,fail);return q;},
    async rpc(name,args){if(name==='reserve_creator_tip_checkout_attempt'){
      if(!attempt)attempt={tipId:args.p_quote.tipId,requestId:args.p_request_id,buyerId:args.p_buyer_id,creatorId:creator,amountCents:300,currency:'usd',status:'pending',body:copy(args.p_quote.body),providerSessionId:null,idempotencyKey:'stable-'+args.p_request_id};
      return {data:{...copy(attempt),retryAllowed},error:null};
    }if(name==='record_creator_tip_checkout_session'){
      if(recordFailure)return {data:null,error:{message:'synthetic DB unavailable'}};
      attempt.providerSessionId=args.p_checkout_session_id;attempt.status=terminal?'paid':'checkout_started';
      return {data:{tipId:attempt.tipId,status:attempt.status,providerSessionId:attempt.providerSessionId},error:null};
    }throw new Error(name);}};
  const context={URL,URLSearchParams,Request,Response,AbortSignal,Date,crypto:webcrypto,console,
    Deno:{serve:fn=>{handler=fn;}},createClient:()=>({rpc:async()=>({data:++authorityReads>=retiredAt?null:{authoritative:true,state:'ACTIVE',restoreOnly:false,userId:buyer,accountId:buyer,sessionGeneration:session},error:null})}),
    authenticateRequest:async()=>({user:{id:buyer,email:'synthetic@example.invalid'}}),createAuthClient:()=>({supabaseAnonKey:'synthetic',supabaseUrl:'https://synthetic.invalid'}),createAdminClient:()=>({configured:true,client:admin}),
    jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status}),notConfiguredPayload:()=>({}),optionsResponse:()=>new Response('ok'),parseJsonPayload:async req=>({value:await req.json()}),
    readCreatorPayoutAccount:async()=>copy(payoutSequence?payoutSequence[Math.min(payoutReads++,payoutSequence.length-1)]:observedPayout(account,payout)),
    storedStripeConfiguration:connect.storedStripeConfiguration,
    readStripeTestSecret:()=>({configured:true,secret:'synthetic-test-secret'}),safeWriteAuditLog:async()=>{},sanitizeErrorMessage:error=>String(error),toText:v=>String(v??'').trim(),
    fetch:async(url,init)=>{const body=init.body?Object.fromEntries(init.body):null;calls.push({url,method:init.method,key:init.headers['Idempotency-Key'],body});
      const id='cs_test_fixture';let value=sessions.get(id);
      if(init.method==='POST'&&!value){value={id,livemode:false,status:'open',payment_intent:'pi_fixture',url:'https://checkout.stripe.com/c/pay/synthetic',client_reference_id:body.client_reference_id,amount_total:Number(body['line_items[0][price_data][unit_amount]']),currency:body['line_items[0][price_data][currency]'],metadata:{chillywood_tip_id:body['metadata[chillywood_tip_id]']}};sessions.set(id,value);}
      if(failAfterAccept){failAfterAccept=false;throw new Error('synthetic transport lost after provider acceptance');}
      return new Response(JSON.stringify(value));},
  };
  vm.runInNewContext(compiled,context,{filename:file});
  return {calls,run:async(changes={})=>{const r=await handler(new Request('https://local.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({creator_id:creator,amount_cents:300,currency:'usd',request_id:request,...changes})}));return {status:r.status,body:await r.json()};},
    set:changes=>{if('profile'in changes)profile=changes.profile;if('account'in changes)account=changes.account;if('payout'in changes)payout=changes.payout;if('payoutSequence'in changes){payoutSequence=changes.payoutSequence;payoutReads=0;}if('retryAllowed'in changes)retryAllowed=changes.retryAllowed;if('failAfterAccept'in changes)failAfterAccept=changes.failAfterAccept;if('recordFailure'in changes)recordFailure=changes.recordFailure;if('retiredAt'in changes)retiredAt=changes.retiredAt;if('terminal'in changes)terminal=changes.terminal;},attempt:()=>attempt,settings:()=>copy(settings)};
}

test('actual endpoint freezes first request/key after lost provider reply and retrieves known sessions',async()=>{
  const h=harness();h.set({failAfterAccept:true});const first=await h.run();assert.equal(first.body.status,'pending');assert.equal(first.body.url,null);
  h.set({profile:'Later name'});const second=await h.run({return_url:'https://chillywoodstream.com/changed'});assert.equal(second.body.checkoutCreated,true);
  assert.equal(second.body.requestId,request);assert.equal(second.body.buyerId,buyer);assert.deepEqual(h.calls[1].body,h.calls[0].body);assert.equal(h.calls[1].key,h.calls[0].key);
  await h.run();assert.equal(h.calls[2].method,'GET');assert.equal(h.calls.length,3);
});
test('concurrent actual handler retries share provider key and exact immutable request',async()=>{
  const h=harness();const results=await Promise.all([h.run(),h.run()]);assert.equal(results.every(r=>r.body.tipId===h.attempt().tipId),true);
  const posts=h.calls.filter(c=>c.method==='POST');assert.equal(new Set(posts.map(c=>c.key)).size,1);assert.equal(new Set(posts.map(c=>JSON.stringify(c.body))).size,1);
});
test('unknown attempt beyond retry window never sends another POST',async()=>{
  const h=harness();h.set({failAfterAccept:true});await h.run();h.set({retryAllowed:false});const result=await h.run();assert.equal(result.body.status,'reconciliation_required');assert.equal(result.body.url,null);assert.equal(h.calls.length,1);
});
test('changed recipient blocks unknown retry and withholds a known session payment link',async()=>{
  const h=harness();h.set({failAfterAccept:true});await h.run();h.set({account:'acct_replaced'});const result=await h.run();assert.equal(result.body.status,'reconciliation_required');assert.equal(h.calls.length,1);
  const known=harness();await known.run();known.set({account:'acct_replaced'});const checked=await known.run();assert.equal(known.calls[1].method,'GET');assert.equal(checked.body.url,null);assert.equal(checked.body.checkoutCreated,false);
});
test('lost DB save repeats original provider request and webhook terminal receipt is never presented as new checkout',async()=>{
  const h=harness();h.set({recordFailure:true});await h.run();h.set({recordFailure:false,terminal:true});const result=await h.run();assert.equal(result.body.status,'paid');assert.equal(result.body.url,null);assert.equal(h.calls[0].key,h.calls[1].key);
});
test('session retirement before dispatch and during provider IO never returns a payment link',async()=>{
  const before=harness();before.set({retiredAt:2});const a=await before.run();assert.equal(a.body.url,null);assert.equal(before.calls.length,0);
  const after=harness();after.set({retiredAt:3});const b=await after.run();assert.equal(b.body.url,null);assert.equal(after.calls.length,1);
});
test('missing durable request identity is rejected before any provider request',async()=>{
  const h=harness();const result=await h.run({request_id:null});assert.equal(result.status,400);assert.equal(h.calls.length,0);
});

for(const [label,changes] of [
  ['legacy ready account without an observation',{provider_configuration_observed_at:null,provider_configuration_account_id:null}],
  ['replacement account with cleared observations',{provider_account_id:'acct_replaced',provider_configuration_observed_at:null,provider_configuration_account_id:null}],
  ['configuration mismatch',{provider_dashboard_type:'none'}],
  ['unknown controller configuration',{provider_controller_type:'unknown'}],
  ['observation bound to another account',{provider_configuration_account_id:'acct_previous'}],
  ['non-test account binding',{provider_environment:'live'}],
])test(`new tip admission denies ${label} before reserving or calling the provider`,async()=>{
  const h=harness();h.set({payout:changes});const result=await h.run();
  assert.equal(result.status,403);assert.equal(result.body.error,'provider_not_ready');
  assert.equal(h.settings().status,'setup_incomplete','actual settings update/readback cannot retain active status');
  assert.equal(h.attempt(),null);assert.equal(h.calls.length,0);
});

test('matching observed test account admits exactly one provider checkout',async()=>{
  const h=harness();const result=await h.run();
  assert.equal(result.status,200);assert.equal(result.body.checkoutCreated,true);
  assert.equal(h.settings().status,'active');assert.equal(h.calls.length,1);assert.equal(h.calls[0].method,'POST');
  assert.equal(h.calls[0].body['payment_intent_data[transfer_data][destination]'],'acct_fixture');
});

for(const [label,latest] of [
  ['same-account observation cleared',observedPayout('acct_fixture',{provider_configuration_observed_at:null,provider_configuration_account_id:null})],
  ['same-account configuration changed',observedPayout('acct_fixture',{provider_dashboard_type:'none'})],
  ['same-account controller now unknown',observedPayout('acct_fixture',{provider_controller_type:'unknown'})],
  ['account replaced with cleared observations',observedPayout('acct_replaced',{provider_configuration_observed_at:null,provider_configuration_account_id:null})],
])test(`pre-dispatch admission denies ${label} after an initially verified read`,async()=>{
  const h=harness();h.set({payoutSequence:[observedPayout(),latest]});const result=await h.run();
  assert.equal(result.status,200);assert.equal(result.body.status,'reconciliation_required');assert.equal(result.body.checkoutCreated,false);
  assert.equal(result.body.url,null);assert.ok(h.attempt(),'the original reserved attempt is retained for reconciliation');assert.equal(h.calls.length,0);
});

test('removing the observed configuration predicate reproduces both unsafe provider calls',async()=>{
  const predicate='storedStripeConfiguration(account).configurationStatus === "match"';
  assert.equal(source.split(predicate).length,2,'mutate only the new production predicate');
  const mutant=compile(source.replace(predicate,'true'));
  const missing={provider_configuration_observed_at:null,provider_configuration_account_id:null};
  const initial=harness(mutant);initial.set({payout:missing});assert.equal((await initial.run()).body.checkoutCreated,true);assert.equal(initial.calls.length,1);
  const dispatch=harness(mutant);dispatch.set({payoutSequence:[observedPayout(),observedPayout('acct_fixture',missing)]});
  assert.equal((await dispatch.run()).body.checkoutCreated,true);assert.equal(dispatch.calls.length,1);
});
