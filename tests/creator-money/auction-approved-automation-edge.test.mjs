import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import ts from 'typescript';
function load(file,globals={}){const module={exports:{}};new Function('module','exports',...Object.keys(globals),ts.transpileModule(readFileSync('supabase/functions/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,...Object.values(globals));return module.exports;}
const transfers=load('_shared/stripe-auction-transfer.ts'),qualification=load('_shared/auction-qualification-observation.ts');
function harness({enabled=true,recover=false,permit=true,preflightFails=false,postFails=false,persistenceFails=false,qualificationPatch={}}={}){
 const calls=[],contract=randomUUID(),lease=randomUUID(),id=randomUUID();let handler;
 const operation={id,contract_id:contract,platform_account_id:'acct_platform',destination:'acct_recipient',source_charge_id:'ch_source',amount_minor:160,currency:'usd',environment:'test',transfer_group:'auction-contract-'+contract,idempotency_key:'auction-transfer-v1-'+contract,dispatchAuthorized:true};
 const job={contract_id:contract,lease,platform_account_id:'acct_platform',recipient_account_id:'acct_recipient',platform_product_id:'prod_Approved',dispatch_enabled:true,operation_id:recover?id:null};
 const evidence={id:'tr_created',object:'transfer',livemode:false,amount:160,currency:'usd',destination:'acct_recipient',source_transaction:'ch_source',transfer_group:operation.transfer_group,amount_reversed:0,metadata:{auction_operation_id:id,auction_contract_id:contract}};
 const transport=async(url,options)=>{
  const path=url.replace('https://api.stripe.com/v1','');calls.push({path,method:options.method});assert.equal(options.redirect,'error');
  if(url.includes('/functions/v1/')){assert.ok(url.endsWith('/stripe-auction-cost-reconcile'));return new Response(JSON.stringify({status:'held',netMinor:200,holdReasons:[],financialAuthority:false,transferCreated:false}));}
  assert.equal(options.headers.Authorization,'Bearer sk_test_synthetic');
  let value;
  if(path==='/account')value={object:'account',id:'acct_platform'};
  else if(path==='/accounts/acct_recipient')value={object:'account',id:'acct_recipient',capabilities:{transfers:'active'},details_submitted:true,payouts_enabled:true,requirements:{disabled_reason:null,currently_due:[],past_due:[],pending_verification:[]},...qualificationPatch};
  else if(path==='/products/prod_Approved')value={object:'product',id:'prod_Approved',active:true,livemode:false};
  else if(path==='/charges/ch_source'){if(preflightFails)throw Error('synthetic unavailable');value={object:'charge',id:'ch_source',livemode:false,paid:true,captured:true,disputed:false,refunded:false,amount_refunded:0,currency:'usd',amount_captured:237,balance_transaction:'txn_source'};}
  else if(path==='/balance_transactions/txn_source')value={object:'balance_transaction',id:'txn_source',source:'ch_source',type:'charge',currency:'usd',net:200,status:'available'};
  else if(path==='/transfers'){assert.equal(options.method,'POST');assert.equal(options.headers['Idempotency-Key'],operation.idempotency_key);if(postFails)throw Error('ambiguous post');value=evidence;}
  else if(path.startsWith('/transfers?'))value={object:'list',has_more:false,data:[evidence]};
  else throw Error('Unexpected '+path);
  return new Response(JSON.stringify(value));
 };
 const env={SUPABASE_SERVICE_ROLE_KEY:'service_synthetic',SUPABASE_URL:'https://synthetic.supabase.co',STRIPE_AUCTION_PLATFORM_TEST_KEY:'sk_test_synthetic',STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID:'acct_platform'};
 const rpc=async(name,args)=>{
  calls.push({name,args});switch(name){
   case 'claim_auction_automation_batch':return{data:enabled?[job]:[]};
   case 'record_auction_automation_qualification':return{data:{qualificationId:randomUUID()}};
   case 'get_auction_automation_preflight':return{data:{...operation,id:lease,dispatchAuthorized:false,allocation_id:1,status:'preflight_required'}};
   case 'claim_auction_automation_dispatch':return{data:permit?operation:{dispatchAuthorized:false,status:'held',reason:'tax_service_fee_unverified'}};
   case 'read_auction_test_transfer_operation':return{data:{...operation,dispatchAuthorized:false}};
   case 'record_auction_test_transfer_result':return persistenceFails?{error:{message:'synthetic database interruption'}}:{data:{status:'confirmed'}};
   case 'complete_auction_automation_job':return{data:{stale:false}};
   default:throw Error('unexpected RPC '+name);
  }
 };
 load('auction-approved-automation/index.ts',{Deno:{serve:f=>handler=f},fetch:transport,require:name=>{
  if(name.startsWith('jsr:'))return{};if(name.endsWith('stripe-connect.ts'))return{readOptionalEnv:k=>env[k],createAdminClient:()=>({configured:true,client:{rpc}}),jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status})};
  if(name.endsWith('auction-qualification-observation.ts'))return qualification;if(name.endsWith('stripe-auction-transfer.ts'))return transfers;throw Error(name);
 }});
 return {calls,run:(key='service_synthetic')=>handler(new Request('https://local.test',{method:'POST',headers:{Authorization:'Bearer '+key},body:'{}'}))};
}
test('actual endpoint off and user token produce no provider traffic',async()=>{for(const opts of [{enabled:false},{}]){const h=harness(opts);await h.run(opts.enabled===false?'service_synthetic':'user');assert.equal(h.calls.filter(x=>x.path).length,0);}});
test('synthetic permit protocol only: provider preflight precedes sole claim and exactly one POST follows',async()=>{
 // Counterfactual RPC permit fixture, NOT production tax/approval readiness.
 const h=harness();assert.equal((await h.run()).status,200);const claim=h.calls.findIndex(c=>c.name==='claim_auction_automation_dispatch'),preflight=h.calls.findIndex(c=>c.path==='/balance_transactions/txn_source'),post=h.calls.findIndex(c=>c.path==='/transfers');assert.ok(preflight<claim&&claim<post);assert.equal(h.calls.filter(c=>c.path==='/transfers').length,1);
});
test('actual protocol honors hard-held permit and incomplete preflight without POST',async()=>{for(const opts of [{permit:false},{preflightFails:true},{qualificationPatch:{payouts_enabled:false}}]){const h=harness(opts);await h.run();assert.equal(h.calls.filter(c=>c.path==='/transfers').length,0);if(opts.preflightFails)assert.equal(h.calls.filter(c=>c.name==='claim_auction_automation_dispatch').length,0);}});
test('ambiguous POST/persistence never retries; recovery is GET-only under exact original operation',async()=>{
 for(const opts of [{postFails:true},{persistenceFails:true}]){const h=harness(opts);await h.run();assert.equal(h.calls.filter(c=>c.path==='/transfers').length,1);assert.equal(h.calls.find(c=>c.name==='complete_auction_automation_job').args.p_success,false);}
 const h=harness({recover:true});await h.run();assert.equal(h.calls.filter(c=>c.path?.startsWith('/transfers?')).length,1);assert.equal(h.calls.filter(c=>c.path&&c.method==='POST').length,0);assert.equal(h.calls.filter(c=>c.name==='claim_auction_automation_dispatch').length,0);
});
