import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const uuid='00000000-0000-4000-8000-000000000001';
function harness({status='prepared',taxCode='txcd_100',networkFails=false,newSession=false}={}){
 let handler;const calls=[];
 const order={session_id:uuid,amount_minor:1000,currency:'usd',price_id:uuid,price_revision:1,...(status==='checkout_ready'?{checkout_session_id:'cs_test_one'}:{}),id:uuid,video_id:uuid,buyer_id:uuid,creator_id:'creator',request_id:uuid,status,stripe_account_id:'acct_test',stripe_product_id:'prod_test'};
 const tax={ready:true,policyId:'policy',taxCode:'txcd_100'};
 const deps={videoRpc:async(_admin,name)=>{calls.push(name);if(name==='bind_stripe_video_tax_checkout_policy')return tax;
  if(name==='dispatch_stripe_sandbox_video_order')return {...order,tax};return order;},
  stripeVideoGet:async(_secret,path)=>path==='/account'?{id:'acct_test'}:path.startsWith('/checkout/sessions/')?{id:'cs_test_one',livemode:false,client_reference_id:uuid,mode:'payment',status:'open',amount_total:1000,currency:'usd',url:'https://checkout.stripe.com/c/pay/existing',metadata:{chillywoodFlow:'stripe_paid_video_sandbox',orderId:uuid,buyerId:uuid,videoId:uuid,priceId:uuid,priceRevision:'1'}}:{id:'prod_test',active:true,livemode:false,tax_code:taxCode},
  videoCheckoutForm:()=>{calls.push('serialize');return new URLSearchParams('mode=payment');},recoverStripeVideoSession:async()=>null,reconcileStripeVideoOrder:async()=>{calls.push('reconcile');}};
 const env={STRIPE_VIDEO_WEB_ORIGIN:'https://example.com',STRIPE_TEST_SECRET_KEY:'sk_test_value',STRIPE_VIDEO_TEST_PRODUCT_ID:'prod_test',STRIPE_VIDEO_SANDBOX_ENABLED:'true'};
 const source=ts.transpileModule(readFileSync('supabase/functions/stripe-paid-video-checkout/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const require=name=>name.startsWith('npm:')?{createClient:()=>({})}:name.includes('stripe-connect')?{authenticateRequest:async()=>({user:{id:uuid,sessionGeneration:newSession?'00000000-0000-4000-8000-000000000002':uuid}})}:deps;
 const fetch=async()=>{calls.push('POST');if(networkFails)throw Error('network');return new Response(JSON.stringify({id:'cs_test_one',livemode:false,client_reference_id:uuid,url:'https://checkout.stripe.com/session'}));};
 new Function('require','exports','Deno','fetch',source)(require,{}, {env:{get:key=>env[key]},serve:fn=>handler=fn},fetch);
 return {calls,send:(origin='https://example.com',body={videoId:uuid,requestId:uuid})=>handler(new Request('https://edge.test',{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)}))};
}
test('checkout validates/serializes before durable claim, then exactly one provider POST',async()=>{
 const h=harness();const response=await h.send();assert.equal(response.status,200);
 assert.deepEqual(h.calls,['read_stripe_sandbox_video_order_by_request','prepare_stripe_sandbox_video_order','bind_stripe_video_tax_checkout_policy','serialize','dispatch_stripe_sandbox_video_order','POST','attach_stripe_sandbox_video_session']);
 assert.equal((await response.json()).status,'checkout_ready');
});
test('unknown dispatched attempt never creates another payment and returns pending',async()=>{
 const h=harness({status:'dispatched'});assert.equal((await h.send()).status,202);assert.ok(!h.calls.includes('POST'));
});
test('wrong product tax code and foreign origin stop before dispatch',async()=>{
 const h=harness({taxCode:'txcd_wrong'});assert.equal((await h.send()).status,503);assert.ok(!h.calls.includes('dispatch_stripe_sandbox_video_order'));
 const foreign=harness();assert.equal((await foreign.send('https://other.com')).status,403);assert.equal(foreign.calls.length,0);
});
test('request recovery without saved order ID never prepares or POSTs a second checkout',async()=>{
 const h=harness({status:'dispatched'});
 const response=await h.send('https://example.com',{action:'recover',videoId:uuid,requestId:uuid});
 assert.equal(response.status,200);assert.equal((await response.json()).orderId,uuid);
 assert.deepEqual(h.calls,['read_stripe_sandbox_video_order_by_request','read_stripe_sandbox_video_order']);
});

test('explicit Unlock after new login resumes existing open checkout by GET, preserving original dispatch',async()=>{
 const h=harness({status:'checkout_ready',newSession:true});const response=await h.send();
 assert.equal(response.status,200);assert.equal((await response.json()).checkoutUrl,'https://checkout.stripe.com/c/pay/existing');
 assert.deepEqual(h.calls,['read_stripe_sandbox_video_order_by_request']);
});
