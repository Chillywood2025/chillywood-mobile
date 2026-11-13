import {createClient} from 'npm:@supabase/supabase-js@2';
import {authenticateRequest} from '../_shared/stripe-connect.ts';
import {videoCheckoutForm,videoRpc,stripeVideoGet,reconcileStripeVideoOrder,recoverStripeVideoSession,type ObjectMap} from '../_shared/stripe-paid-video-checkout.ts';

// Standalone web only. No native ECL adapter, production key, transfer or payout.
Deno.serve(async(req:Request)=>{
 const origin=Deno.env.get('STRIPE_VIDEO_WEB_ORIGIN')??'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info,x-chillywood-platform','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(!/^https:\/\//.test(origin)||req.headers.get('Origin')!==origin)return reply(403,{error:'standalone_web_required'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
 // A native app must use its qualified native admission, never the web fallback.
 // This marker is not proof of platform eligibility; Origin/auth remain required.
 if(req.headers.get('x-chillywood-platform')!=='web')return reply(403,{error:'checkout_transport_not_admitted'});
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
  const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const project=(o:ObjectMap,checkoutUrl?:string)=>({requestId:o.request_id,videoId:o.video_id,buyerId:o.buyer_id,creatorId:o.creator_id,
   priceId:o.price_id,priceRevision:o.price_revision,amountMinor:o.amount_minor,currency:o.currency,environment:'sandbox',provider:'stripe',
   orderId:o.id,status:o.status,canAccess:o.canAccess===true,...(checkoutUrl?{checkoutUrl}:{})});
  let order:ObjectMap;
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
   if(!/^acct_[A-Za-z0-9]+$/.test(String(account.id))||product.id!==productId||product.livemode!==false||product.active!==true)return reply(503,{error:'test_provider_unqualified'});
   order=await videoRpc(admin,'prepare_stripe_sandbox_video_order',{p_buyer_id:user.id,p_session_id:user.sessionGeneration,
    p_video_id:body.videoId,p_request_id:body.requestId,p_account_id:account.id,p_product_id:productId});
  }
  if(order.status!=='prepared') {
   if(order.status==='dispatched'&&!order.checkout_session_id)order.checkout_session_id=await recoverStripeVideoSession(admin,order,secret);
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
  const returnUrl=new URL(`/player/${order.video_id}`,origin).toString();
  const tax=await videoRpc(admin,'bind_stripe_video_tax_checkout_policy',{p_feature:'paid_video',p_identity_id:order.id,
   p_product_id:order.stripe_product_id,p_account_id:order.stripe_account_id,p_environment:'test',p_permitted_scope:'worldwide'});
  const productTax=typeof product.tax_code==='string'?product.tax_code:(product.tax_code as ObjectMap|undefined)?.id;
  if(productTax!==tax.taxCode)throw Error('provider_product_tax_code_mismatch');
  const serialized=videoCheckoutForm(order,tax,returnUrl).toString();
  order=await videoRpc(admin,'dispatch_stripe_sandbox_video_order',{p_order_id:order.id,p_buyer_id:user.id,p_session_id:user.sessionGeneration});
  if((order.tax as ObjectMap).policyId!==tax.policyId)throw Error('tax_policy_changed');
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
