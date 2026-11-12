import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function handler(observationError){
 let handle;const calls=[];const orderId='11111111-1111-4111-8111-111111111111';
 const descriptor={reportRunId:'frr_one',fileId:'file_one',intervalStart:1,intervalEnd:2};
 const imports={
  '../_shared/stripe-connect.ts':{readOptionalEnv:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?'synthetic_service':'sk_test_synthetic',createAdminClient:()=>({configured:true,client:{}}),jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status})},
  '../_shared/stripe-video-known-costs.ts':{observeStripeVideoKnownCosts:async(order,reports)=>{calls.push({name:'observe',reports});if(observationError)throw Error(observationError);return {input:{verified:true},reports};}},
  '../_shared/stripe-paid-video-checkout.ts':{videoRpc:async(_client,name,args)=>{calls.push({name,args});return name==='get_stripe_video_cost_context'?{id:orderId,previousReports:[descriptor]}:{status:'held'};},reconcileStripeVideoOrder:async()=>{calls.push({name:'reconcileReceipt'});}},
 };
 const code=ts.transpileModule(readFileSync('supabase/functions/stripe-video-cost-reconcile/index.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports','Deno',code)(name=>name.startsWith('jsr:')?{}:imports[name]??(()=>{throw Error(name);})(),{}, {serve:fn=>{handle=fn;}});
 return {calls,orderId,descriptor,send:(body,auth='synthetic_service')=>handle(new Request('https://example.test',{method:'POST',headers:{Authorization:`Bearer ${auth}`},body:JSON.stringify(body)}))};
}
test('cost endpoint rejects user JWT and caller amounts before observing',async()=>{
 const h=handler();assert.equal((await h.send({order_id:h.orderId,reports:[]},'user_jwt')).status,403);assert.equal(h.calls.length,0);
 assert.equal((await h.send({order_id:h.orderId,reports:[],amount:100})).status,409);assert.equal(h.calls.length,0);
});
test('only exact whitelisted history bounds expose safe continuation-required response',async()=>{
 for(const reason of ['video_cost_refund_history_requires_continuation','video_cost_history_read_limit_requires_continuation']){
  const h=handler(reason),response=await h.send({order_id:h.orderId,reports:[]});assert.equal(response.status,409);
  assert.deepEqual(await response.json(),{error:'video_cost_history_requires_continuation',retryable:false,continuationRequired:true,financialAuthority:false,payoutCreated:false});
  assert.ok(!h.calls.some(call=>call.name==='record_stripe_video_known_costs'));
 }
 const h=handler('provider details containing video_cost_refund_history_requires_continuation'),response=await h.send({order_id:h.orderId,reports:[]});
 assert.deepEqual(await response.json(),{error:'video_cost_evidence_incomplete',retryable:true,continuationRequired:false,financialAuthority:false,payoutCreated:false});
});
test('cost endpoint retains old report identities and stores only observer evidence',async()=>{
 const h=handler();assert.equal((await h.send({order_id:h.orderId,reports:[]})).status,200);
 assert.deepEqual(h.calls.map(c=>c.name),['get_stripe_video_cost_context','reconcileReceipt','get_stripe_video_cost_context','observe','record_stripe_video_known_costs']);
 assert.deepEqual(h.calls.at(-1).args,{p_order_id:h.orderId,p_input:{verified:true},p_reports:[h.descriptor]});
 const changed=handler();assert.equal((await changed.send({order_id:changed.orderId,reports:[{...changed.descriptor,fileId:'file_substitute'}]})).status,409);
 assert.ok(!changed.calls.some(c=>c.name==='observe'));
});
