import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

function harness({valid=true,bound=true,providerDown=false}={}){
 let handler;const calls=[];
 const shared={createAdminClient:()=>({configured:true,client:{}}),readOptionalEnv:key=>key.includes('WEBHOOK')?'whsec_test':'sk_test_value',
  parseStripeEvent:JSON.parse,verifyStripeWebhookSignature:async()=>valid};
 const commerce={videoRpc:async(_admin,name,args)=>{calls.push({name,args});return name.includes('webhook_order')?(bound?{id:'order'}:{}):{};},
  reconcileStripeVideoOrder:async(_admin,order,_secret,event)=>{calls.push({name:'reconcile',order,event});if(providerDown)throw Error('provider_unavailable');return {status:'paid'};}};
 const source=readFileSync('supabase/functions/stripe-paid-video-webhook/index.ts','utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const require=name=>name.includes('edge-runtime')?{}:name.endsWith('stripe-connect.ts')?shared:name.endsWith('stripe-paid-video-checkout.ts')?commerce:(()=>{throw Error(name)})();
 new Function('require','exports','Deno',output)(require,{}, {serve:fn=>{handler=fn;}});
 const send=(type='checkout.session.completed',extra={},item={})=>handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({id:'evt_one',type,livemode:false,data:{object:{id:'cs_test_one',livemode:false,metadata:{chillywoodFlow:'stripe_paid_video_sandbox'},...item}},...extra})}));
 return {calls,send};
}
test('signed sandbox webhook uses exact bound provider identities and shared GET reconciliation',async()=>{
 const h=harness();assert.equal((await h.send()).status,200);
 assert.deepEqual(h.calls,[{name:'read_stripe_sandbox_video_webhook_order',args:{p_object_id:'cs_test_one'}},{name:'reconcile',order:{id:'order'},event:'evt_one'}]);
});
test('invalid signature and live/connected-account events never touch payment authority',async()=>{
 for(const options of [{valid:false},{}]){
  const h=harness(options);assert.equal((await h.send('checkout.session.completed',options.valid===false?{}:{livemode:true})).status,400);assert.equal(h.calls.length,0);
 }
 const h=harness();assert.equal((await h.send('checkout.session.completed',{account:'acct_other'})).status,400);assert.equal(h.calls.length,0);
});
test('unknown identities retry, and signed disputes durably hold rather than claim a refund',async()=>{
 const missing=harness({bound:false});assert.equal((await missing.send('charge.refunded')).status,503);
 assert.equal(missing.calls.length,1);
 const unrelated=harness({bound:false});assert.equal((await unrelated.send('charge.refunded',{}, {metadata:{}})).status,200);
 assert.equal(unrelated.calls.length,1);
 const disputed=harness();assert.equal((await disputed.send('charge.dispute.created',{}, {id:'dp_one',charge:'ch_one'})).status,200);
 assert.deepEqual(disputed.calls,[{name:'read_stripe_sandbox_video_webhook_order',args:{p_object_id:'ch_one'}},{name:'hold_stripe_sandbox_video_order',args:{p_order_id:'order'}}]);
 const refund=harness();assert.equal((await refund.send('charge.refunded',{}, {id:'ch_one'})).status,200);
 assert.deepEqual(refund.calls.map(call=>call.name),['read_stripe_sandbox_video_webhook_order','hold_stripe_sandbox_video_order','reconcile']);
 const outage=harness({providerDown:true});assert.equal((await outage.send('charge.refunded',{}, {id:'ch_one'})).status,503);
 assert.deepEqual(outage.calls.map(call=>call.name),['read_stripe_sandbox_video_webhook_order','hold_stripe_sandbox_video_order','reconcile']);
});
