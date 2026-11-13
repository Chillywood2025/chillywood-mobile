import {createClient} from 'npm:@supabase/supabase-js@2';
import {authenticateRequest} from '../_shared/stripe-connect.ts';
import {videoCheckoutForm,videoRpc,stripeVideoGet,reconcileStripeVideoOrder,recoverStripeVideoSession,type ObjectMap} from '../_shared/stripe-paid-video-checkout.ts';

// Native routes are separately default-off and require exact database admission.
// Configured HTTPS returns are not proof of an installed associated link.
Deno.serve(async(req:Request)=>{
 const origin=Deno.env.get('STRIPE_VIDEO_WEB_ORIGIN')??'';
 const platform=req.headers.get('x-chillywood-platform');
 const native=platform==='ios'||platform==='android';
 const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
 const httpsOrigin=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.origin===value&&!u.search&&!u.hash?u.origin:null;}catch{return null;}};
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info,x-chillywood-platform','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return httpsOrigin(origin)&&req.headers.get('Origin')===origin?new Response(null,{status:204,headers}):reply(403,{error:'standalone_web_required'});
 if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
 if(platform!=='web'&&!native)return reply(403,{error:'checkout_transport_not_admitted'});
 if(platform==='web'&&(!httpsOrigin(origin)||req.headers.get('Origin')!==origin))return reply(403,{error:'standalone_web_required'});
 if(native&&req.headers.has('Origin'))return reply(403,{error:'native_transport_required'});
 const prefix=native?`STRIPE_VIDEO_${platform.toUpperCase()}`:'';
 const routeId=native?Deno.env.get(`${prefix}_ROUTE_ID`):null;
 const returnOrigin=native?httpsOrigin(Deno.env.get(`${prefix}_RETURN_ORIGIN`)??''):httpsOrigin(origin);
 const accountId=Deno.env.get('STRIPE_VIDEO_TEST_ACCOUNT_ID')??'';
 if(native&&(Deno.env.get(`${prefix}_SANDBOX_ENABLED`)!=='true'||!uuid(routeId)||!returnOrigin||!/^acct_[A-Za-z0-9]+$/.test(accountId)))
  return reply(503,{error:'native_sandbox_not_configured'});
 const secret=Deno.env.get('STRIPE_TEST_SECRET_KEY')??'';
 const productId=Deno.env.get('STRIPE_VIDEO_TEST_PRODUCT_ID')??'';
 const enabled=Deno.env.get('STRIPE_VIDEO_SANDBOX_ENABLED')==='true';
 if(!enabled||!secret.startsWith('sk_test_')||!/^prod_[A-Za-z0-9]+$/.test(productId))return reply(503,{error:'sandbox_not_configured'});
 try {
  const auth=await authenticateRequest(req,Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_ANON_KEY')??'');
  if('error' in auth)return reply(401,{error:'current_session_required'});
  const user=auth.user;
  const admin=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await req.json();
  if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{error:'request_invalid'});
  if(body.action!==undefined&&body.action!=='recover'&&body.action!=='status'&&body.action!=='eligibility')return reply(400,{error:'action_invalid'});
  if(body.action==='eligibility') {
   if(!native||!uuid(body.videoId))return reply(400,{error:'native_video_required'});
   const eligibility=await videoRpc(admin,'read_stripe_video_native_checkout_eligibility',{
    p_buyer_id:user.id,p_session_id:user.sessionGeneration,p_video_id:body.videoId,p_platform:platform,
    p_route:routeId,p_account_id:accountId,p_product_id:productId});
   return reply(200,eligibility);
  }
  const observation=body.nativeObservation;
  if(native&&body.action===undefined&&(!observation||typeof observation!=='object'||Array.isArray(observation)||observation.apiVersion!==1
   ||(platform==='ios'&&(observation.countryCode!=='USA'||observation.externalTransactionToken!==undefined))
   ||(platform==='android'&&(observation.countryCode!==undefined||typeof observation.externalTransactionToken!=='string'
    ||observation.externalTransactionToken.length<1||observation.externalTransactionToken.length>16384))))
   return reply(400,{error:'native_observation_invalid'});
  const project=(o:ObjectMap,checkoutUrl?:string)=>({requestId:o.request_id,videoId:o.video_id,buyerId:o.buyer_id,creatorId:o.creator_id,
   priceId:o.price_id,priceRevision:o.price_revision,amountMinor:o.amount_minor,currency:o.currency,environment:'sandbox',provider:'stripe',
   orderId:o.id,status:o.status,checkoutPlatform:o.checkout_platform??'web',canAccess:o.canAccess===true,...(checkoutUrl?{checkoutUrl}:{})});
  let order:ObjectMap;let nativeAdmission:ObjectMap|null=null;
  if(body.action==='recover') {
   if(!uuid(body.videoId)||!uuid(body.requestId))return reply(400,{error:'video_and_request_required'});
   order=await videoRpc(admin,'read_stripe_sandbox_video_order_by_request',{p_request_id:body.requestId,p_video_id:body.videoId,
    p_buyer_id:user.id,p_session_id:user.sessionGeneration});
   if(!order.id)return reply(200,{found:false,requestId:body.requestId,videoId:body.videoId,buyerId:user.id,environment:'sandbox',provider:'stripe'});
   // Recover only by authenticated GETs. Never pass an old dispatch into prepare
   // or replace its original session with the newly authenticated one.
   if(order.status==='dispatched'&&!order.checkout_session_id)order.checkout_session_id=await recoverStripeVideoSession(admin,order,secret);
   if(order.checkout_session_id)await reconcileStripeVideoOrder(admin,order,secret);
   order=await videoRpc(admin,'read_stripe_sandbox_video_order',{p_order_id:order.id,p_buyer_id:user.id,p_session_id:user.sessionGeneration});
   return reply(200,project(order));
  }
  if(body.action==='status') {
   if(!uuid(body.orderId))return reply(400,{error:'order_required'});
   order=await videoRpc(admin,'read_stripe_sandbox_video_order',{p_order_id:body.orderId,p_buyer_id:user.id,p_session_id:user.sessionGeneration});
   if(order.status==='dispatched'&&!order.checkout_session_id)order.checkout_session_id=await recoverStripeVideoSession(admin,order,secret);
   if(order.checkout_session_id)await reconcileStripeVideoOrder(admin,order,secret);
   order=await videoRpc(admin,'read_stripe_sandbox_video_order',{p_order_id:body.orderId,p_buyer_id:user.id,p_session_id:user.sessionGeneration});
   return reply(200,project(order));
  }
  if(!uuid(body.videoId)||!uuid(body.requestId))return reply(400,{error:'video_and_request_required'});
  const existing=await videoRpc(admin,'read_stripe_sandbox_video_order_by_request',{p_request_id:body.requestId,p_video_id:body.videoId,
   p_buyer_id:user.id,p_session_id:user.sessionGeneration});
  if(existing.id&&(existing.checkout_platform??'web')!==platform)return reply(409,{error:'order_transport_mismatch'});
  let product:ObjectMap={};
  if(existing.id&&(existing.status!=='prepared'||existing.session_id!==user.sessionGeneration)){
   order=existing;
   if(order.status==='prepared'){
    order=await videoRpc(admin,'read_stripe_sandbox_video_order',{p_order_id:order.id,p_buyer_id:user.id,p_session_id:user.sessionGeneration});
    return reply(order.status==='failed'?200:202,project(order)); // old undispatched session must expire, never impersonate it
   }
  }else{
   const account=await stripeVideoGet(secret,'/account');
   product=await stripeVideoGet(secret,`/products/${encodeURIComponent(productId)}`);
   if(!/^acct_[A-Za-z0-9]+$/.test(String(account.id))||(native&&account.id!==accountId)||product.id!==productId||product.livemode!==false||product.active!==true)return reply(503,{error:'test_provider_unqualified'});
   const prepareArgs={p_buyer_id:user.id,p_session_id:user.sessionGeneration,
    p_video_id:body.videoId,p_request_id:body.requestId,p_account_id:account.id,p_product_id:productId};
   if(native){
    const prepared=await videoRpc(admin,'prepare_stripe_video_native_order',{...prepareArgs,p_route:routeId,p_platform:platform,
     p_api_version:observation.apiVersion,p_country:platform==='ios'?observation.countryCode:null,
     p_external_transaction_token:platform==='android'?observation.externalTransactionToken:null});
    if(!prepared.order||typeof prepared.order!=='object'||!prepared.admission||typeof prepared.admission!=='object')throw Error('native_preparation_invalid');
    order=prepared.order as ObjectMap;nativeAdmission=prepared.admission as ObjectMap;
   }else order=await videoRpc(admin,'prepare_stripe_sandbox_video_order',prepareArgs);
   // Covers a concurrent native preparation that committed after our first read.
   if((order.checkout_platform??'web')!==platform)return reply(409,{error:'order_transport_mismatch'});
  }
  if(order.status!=='prepared') {
   if(order.status==='dispatched'&&!order.checkout_session_id)order.checkout_session_id=await recoverStripeVideoSession(admin,order,secret);
   if(native){
    if(order.checkout_session_id)await reconcileStripeVideoOrder(admin,order,secret);
    order=await videoRpc(admin,'read_stripe_sandbox_video_order',{p_order_id:order.id,p_buyer_id:user.id,p_session_id:user.sessionGeneration});
    return reply(200,project(order)); // never reopen a dispatched native URL with a new SDK token
   }
   if(order.checkout_session_id){
    const account=await stripeVideoGet(secret,'/account');if(account.id!==order.stripe_account_id)throw Error('provider_account_mismatch');
    const session=await stripeVideoGet(secret,`/checkout/sessions/${encodeURIComponent(String(order.checkout_session_id))}`);
    const metadata=session.metadata as ObjectMap|undefined;
    if(session.id!==order.checkout_session_id||session.livemode!==false||session.client_reference_id!==order.id
     ||session.mode!=='payment'||session.amount_total!==order.amount_minor||session.currency!==order.currency
     ||!Object.entries({chillywoodFlow:'stripe_paid_video_sandbox',orderId:order.id,buyerId:order.buyer_id,videoId:order.video_id,
       priceId:order.price_id,priceRevision:order.price_revision}).every(([key,value])=>metadata?.[key]===String(value)))throw Error('session_identity_mismatch');
    const url=typeof session.url==='string'?session.url:undefined;
    if(url&&!/^https:\/\/checkout\.stripe\.com\//.test(url))throw Error('checkout_url_invalid');
    return reply(200,project(order,session.status==='open'?url:undefined));
   }
   return reply(202,project(order)); // unknown create outcome, never re-POST
  }
  // Validate return URL before consuming the one durable dispatch claim.
  const returnUrl=new URL(`/player/${order.video_id}`,returnOrigin!).toString();
  const tax=await videoRpc(admin,'bind_stripe_video_tax_checkout_policy',{p_feature:'paid_video',p_identity_id:order.id,
   p_product_id:order.stripe_product_id,p_account_id:order.stripe_account_id,p_environment:'test',p_permitted_scope:'worldwide'});
  const productTax=typeof product.tax_code==='string'?product.tax_code:(product.tax_code as ObjectMap|undefined)?.id;
  if(productTax!==tax.taxCode)throw Error('provider_product_tax_code_mismatch');
  const serialized=videoCheckoutForm(order,tax,returnUrl).toString();
  if(native){
   const admission=nativeAdmission;
   if(!admission||!uuid(admission.admissionId)||admission.orderId!==order.id||admission.platform!==platform||admission.financialAuthority!==false
    ||admission.accessGranted!==false||typeof admission.expiresAt!=='string'||!Number.isFinite(Date.parse(admission.expiresAt))||Date.parse(admission.expiresAt)<=Date.now()
    ||admission.verification!==(platform==='ios'?'native_storefront_observation_unverified':'native_sdk_observation_unverified'))throw Error('native_admission_invalid');
   if(platform==='android'){
    const binding=await videoRpc(admin,'bind_stripe_video_google_checkout',{p_order:order.id,p_buyer:user.id,p_session:user.sessionGeneration,
     p_admission:admission.admissionId,p_external_transaction_token:observation.externalTransactionToken,p_api_version:observation.apiVersion});
    if(!uuid(binding.bindingId)||binding.orderId!==order.id||binding.admissionId!==admission.admissionId
     ||binding.routeKind!=='android_external_content_link'||binding.financialAuthority!==false||binding.accessGranted!==false)throw Error('native_reporting_binding_invalid');
   }
  }
  order=await videoRpc(admin,'dispatch_stripe_sandbox_video_order',{p_order_id:order.id,p_buyer_id:user.id,p_session_id:user.sessionGeneration});
  if((order.tax as ObjectMap).policyId!==tax.policyId)throw Error('tax_policy_changed');
  if((order.checkout_platform??'web')!==platform)throw Error('order_transport_mismatch');
  const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(120000),
   headers:{Authorization:`Bearer ${secret}`,'Stripe-Version':'2026-02-25.clover','Content-Type':'application/x-www-form-urlencoded',
    'Idempotency-Key':`stripe-video:${order.id}`},body:serialized});
  if(!response.ok)return reply(202,{...project({...order,status:'dispatched'}),reason:'provider_create_outcome_requires_reconciliation'});
  const session=await response.json();
  if(session.livemode!==false||!/^cs_test_[A-Za-z0-9]+$/.test(String(session.id))||session.client_reference_id!==order.id
   ||!/^https:\/\/checkout\.stripe\.com\//.test(String(session.url)))throw Error('provider_session_invalid');
  await videoRpc(admin,'attach_stripe_sandbox_video_session',{p_order_id:order.id,p_checkout_session_id:session.id});
  return reply(200,project({...order,status:'checkout_ready'},session.url));
 } catch { return reply(503,{error:'sandbox_checkout_unavailable',message:'No access was granted by this browser response. Reconcile the existing attempt before retrying.'}); }
});
