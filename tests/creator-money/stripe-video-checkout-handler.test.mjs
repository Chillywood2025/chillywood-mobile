import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const uuid='00000000-0000-4000-8000-000000000001';
function harness({status='prepared',taxCode='txcd_100',networkFails=false,newSession=false,nativeConfigured=false,existing=true,orderPlatform='web',envOverride={},admissionPatch={},bindingPatch={},providerAccount='acct_test',preparedPlatform,productActive=true}={}){
 let handler;const calls=[],providerCalls=[],rpcArgs=[];let returnUrl,postedBody;
 const order={checkout_platform:orderPlatform,session_id:uuid,amount_minor:1000,currency:'usd',price_id:uuid,price_revision:1,...(status==='checkout_ready'?{checkout_session_id:'cs_test_one'}:{}),id:uuid,video_id:uuid,buyer_id:uuid,creator_id:'creator',request_id:uuid,status,stripe_account_id:'acct_test',stripe_product_id:'prod_test'};
 const tax={ready:true,policyId:'policy',taxCode:'txcd_100'};
 const deps={videoRpc:async(_admin,name,args)=>{calls.push(name);rpcArgs.push({name,args});if(name==='bind_stripe_video_tax_checkout_policy')return tax;
  if(name==='read_stripe_sandbox_video_order_by_request'&&!existing)return {};
  if(name==='prepare_stripe_video_native_order'){order.checkout_platform=args.p_platform;return {order,admission:{admissionId:uuid,orderId:uuid,platform:args.p_platform,expiresAt:'2099-01-01T00:00:00Z',verification:args.p_platform==='ios'?'native_storefront_observation_unverified':'native_sdk_observation_unverified',financialAuthority:false,accessGranted:false,...admissionPatch}};}
  if(name==='prepare_stripe_sandbox_video_order'&&preparedPlatform)order.checkout_platform=preparedPlatform;
  if(name==='bind_stripe_video_google_checkout')return {bindingId:uuid,orderId:uuid,admissionId:uuid,routeKind:'android_external_content_link',financialAuthority:false,accessGranted:false,...bindingPatch};
  if(name==='dispatch_stripe_sandbox_video_order')return {...order,tax};return order;},
  stripeVideoGet:async(_secret,path)=>{providerCalls.push(path);return path==='/account'?{id:providerAccount}:path.startsWith('/checkout/sessions/')?{id:'cs_test_one',livemode:false,client_reference_id:uuid,mode:'payment',status:'open',amount_total:1000,currency:'usd',url:'https://checkout.stripe.com/c/pay/existing',metadata:{chillywoodFlow:'stripe_paid_video_sandbox',orderId:uuid,buyerId:uuid,videoId:uuid,priceId:uuid,priceRevision:'1'}}:{id:'prod_test',active:productActive,livemode:false,tax_code:taxCode};},
  videoCheckoutForm:(_o,_t,url)=>{returnUrl=url;calls.push('serialize');return new URLSearchParams('mode=payment');},recoverStripeVideoSession:async()=>null,reconcileStripeVideoOrder:async()=>{calls.push('reconcile');}};
 const env={STRIPE_VIDEO_WEB_ORIGIN:'https://example.com',STRIPE_TEST_SECRET_KEY:'sk_test_value',STRIPE_VIDEO_TEST_PRODUCT_ID:'prod_test',STRIPE_VIDEO_SANDBOX_ENABLED:'true',...(nativeConfigured?{STRIPE_VIDEO_TEST_ACCOUNT_ID:'acct_test',...Object.fromEntries(['IOS','ANDROID'].flatMap(p=>[[`STRIPE_VIDEO_${p}_SANDBOX_ENABLED`,'true'],[`STRIPE_VIDEO_${p}_ROUTE_ID`,uuid],[`STRIPE_VIDEO_${p}_RETURN_ORIGIN`,'https://native.example.com']]))}:{}),...envOverride};
 const source=ts.transpileModule(readFileSync('supabase/functions/stripe-paid-video-checkout/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const require=name=>name.startsWith('npm:')?{createClient:()=>({})}:name.includes('stripe-connect')?{authenticateRequest:async()=>({user:{id:uuid,sessionGeneration:newSession?'00000000-0000-4000-8000-000000000002':uuid}})}:deps;
 const fetch=async(_url,options)=>{postedBody=options.body;calls.push('POST');if(networkFails)throw Error('network');return new Response(JSON.stringify({id:'cs_test_one',livemode:false,client_reference_id:uuid,url:'https://checkout.stripe.com/c/pay/test_session'}));};
 new Function('require','exports','Deno','fetch',source)(require,{}, {env:{get:key=>env[key]},serve:fn=>handler=fn},fetch);
 return {calls,providerCalls,rpcArgs,returnUrl:()=>returnUrl,postedBody:()=>postedBody,send:(origin='https://example.com',body={videoId:uuid,requestId:uuid},platform='web')=>handler(new Request('https://edge.test',{method:'POST',headers:{...(origin===null?{}:{Origin:origin}),...(platform?{'x-chillywood-platform':platform}:{})},body:JSON.stringify(body)}))};
}
test('unadmitted native and unknown transports stop before database or provider calls',async()=>{
 for(const platform of ['ios','android','unknown','']){const h=harness();assert.equal((await h.send('https://example.com',undefined,platform)).status,403);assert.equal(h.calls.length,0);}
});
test('archived products remain unavailable for every new checkout transport',async()=>{
 for(const platform of ['web','ios','android']){
  const h=harness({productActive:false,nativeConfigured:true,existing:false});
  const body={videoId:uuid,requestId:uuid,...(platform==='ios'?{nativeObservation:{apiVersion:1,countryCode:'USA'}}:
   platform==='android'?{nativeObservation:{apiVersion:1,externalTransactionToken:'opaque-test-token'}}:{})};
  const response=await h.send(platform==='web'?'https://example.com':null,body,platform);
  assert.equal(response.status,503);assert.equal((await response.json()).error,'test_provider_unqualified');
  assert.equal(h.calls.some(name=>name.startsWith('prepare_')),false);
  assert.equal(h.calls.includes('dispatch_stripe_sandbox_video_order'),false);assert.equal(h.calls.includes('POST'),false);
 }
});
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
const nativeBody=platform=>({videoId:uuid,requestId:uuid,nativeObservation:platform==='ios'?{apiVersion:1,countryCode:'USA'}:{apiVersion:1,externalTransactionToken:'opaque-test-token'}});
test('each separately configured native platform admits exact order before one dispatch',async()=>{
 for(const platform of ['ios','android']){
  const h=harness({nativeConfigured:true,existing:false});const response=await h.send(null,nativeBody(platform),platform);const body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.checkoutPlatform,platform);assert.equal(body.status,'checkout_ready');assert.ok(body.checkoutUrl);
  const admission=h.rpcArgs.find(c=>c.name==='prepare_stripe_video_native_order');assert.equal(admission.args.p_platform,platform);assert.equal(admission.args.p_route,uuid);
  assert.equal(admission.args.p_external_transaction_token,platform==='android'?'opaque-test-token':null);
  assert.ok(h.calls.indexOf('prepare_stripe_video_native_order')<h.calls.indexOf('dispatch_stripe_sandbox_video_order'));
  if(platform==='android')assert.ok(h.calls.indexOf('bind_stripe_video_google_checkout')<h.calls.indexOf('dispatch_stripe_sandbox_video_order'));
  else assert.equal(h.calls.includes('bind_stripe_video_google_checkout'),false);
  assert.equal(h.calls.filter(c=>c==='POST').length,1);assert.equal(h.returnUrl(),`https://native.example.com/player/${uuid}`);
  assert.equal(JSON.stringify(body).includes('opaque-test-token'),false);assert.equal(h.postedBody().includes('opaque-test-token'),false);
 }
});
test('native configuration and malformed observations reject before any database/provider call',async()=>{
 const cases=[{}, {STRIPE_VIDEO_ANDROID_SANDBOX_ENABLED:'false'}, {STRIPE_VIDEO_ANDROID_ROUTE_ID:'bad'}, {STRIPE_VIDEO_TEST_ACCOUNT_ID:'bad'},
  ...['http://native.example.com','https://u:p@native.example.com','https://native.example.com/path','https://native.example.com?x=1','https://native.example.com#x'].map(value=>({STRIPE_VIDEO_ANDROID_RETURN_ORIGIN:value}))];
 for(const [index,envOverride]of cases.entries()){
  const h=harness({nativeConfigured:index!==0,envOverride});assert.equal((await h.send(null,nativeBody('android'),'android')).status,503);
  assert.equal(h.calls.length,0);assert.equal(h.providerCalls.length,0);
 }
 for(const [platform,observation]of [['ios',{apiVersion:1,countryCode:'CAN'}],['android',{apiVersion:2,externalTransactionToken:'token'}],['android',{apiVersion:1}],['ios',{apiVersion:1,countryCode:'USA',externalTransactionToken:'token'}]]){
  const h=harness({nativeConfigured:true});assert.equal((await h.send(null,{...nativeBody(platform),nativeObservation:observation},platform)).status,400);assert.equal(h.calls.length,0);assert.equal(h.providerCalls.length,0);
 }
});
test('native provider account mismatch and substituted admission/binding never dispatch',async()=>{
 for(const options of [{providerAccount:'acct_wrong'},{admissionPatch:{orderId:'wrong'}},{admissionPatch:{expiresAt:'not-a-date'}},{bindingPatch:{admissionId:'wrong'}}]){
  const h=harness({nativeConfigured:true,existing:false,...options});assert.equal((await h.send(null,nativeBody('android'),'android')).status,503);
  assert.equal(h.calls.includes('dispatch_stripe_sandbox_video_order'),false);assert.equal(h.calls.includes('POST'),false);
 }
});
test('native dispatched and open-checkout replay reconciles without old URL or another dispatch',async()=>{
 for(const platform of ['ios','android'])for(const status of ['dispatched','checkout_ready']){
  const h=harness({nativeConfigured:true,orderPlatform:platform,status});const response=await h.send(null,nativeBody(platform),platform);const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.checkoutUrl,undefined);assert.equal(body.checkoutPlatform,platform);
  assert.equal(h.calls.includes('POST'),false);assert.equal(h.calls.includes('admit_stripe_video_native_order'),false);assert.equal(h.calls.includes('dispatch_stripe_sandbox_video_order'),false);
 }
});
test('native status/recovery needs no replacement observation and never returns checkout URL',async()=>{
 for(const action of ['status','recover']){
  const h=harness({nativeConfigured:true,orderPlatform:'android',status:'checkout_ready',newSession:true});const response=await h.send(null,{action,orderId:uuid,videoId:uuid,requestId:uuid},'android');
  assert.equal(response.status,200);assert.equal((await response.json()).checkoutUrl,undefined);assert.equal(h.calls.includes('admit_stripe_video_native_order'),false);assert.equal(h.calls.includes('POST'),false);
 }
});
test('web/native and iOS/Android creation cannot change existing order transport',async()=>{
 for(const [stored,platform]of [['android','web'],['web','ios'],['ios','android']]){
  const h=harness({nativeConfigured:true,orderPlatform:stored,status:'checkout_ready'});const response=await h.send(platform==='web'?'https://example.com':null,platform==='web'?undefined:nativeBody(platform),platform);
  assert.equal(response.status,409);assert.equal(h.calls.includes('POST'),false);assert.equal(h.providerCalls.length,0);
 }
});
test('web prepare race returning a committed native order blocks before tax or dispatch',async()=>{
 const h=harness({existing:false,preparedPlatform:'android'});const response=await h.send();assert.equal(response.status,409);
 assert.equal(h.calls.includes('bind_stripe_video_tax_checkout_policy'),false);assert.equal(h.calls.includes('dispatch_stripe_sandbox_video_order'),false);assert.equal(h.calls.includes('POST'),false);
});

test('native eligibility needs exact config but no SDK observation or order/provider calls',async()=>{
 const h=harness({nativeConfigured:true});const response=await h.send(null,{action:'eligibility',videoId:uuid},'android');assert.equal(response.status,200);
 assert.deepEqual(h.calls,['read_stripe_video_native_checkout_eligibility']);assert.equal(h.providerCalls.length,0);
 const args=h.rpcArgs[0].args;assert.equal(args.p_route,uuid);assert.equal(args.p_account_id,'acct_test');assert.equal(args.p_product_id,'prod_test');assert.equal(args.p_platform,'android');
 const disabled=harness();assert.equal((await disabled.send(null,{action:'eligibility',videoId:uuid},'android')).status,503);assert.equal(disabled.calls.length,0);
});
