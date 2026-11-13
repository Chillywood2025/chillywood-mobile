import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createAdminClient, readOptionalEnv, parseStripeEvent, verifyStripeWebhookSignature} from "../_shared/stripe-connect.ts";
import {reconcileStripeVideoOrder, videoRpc, type ObjectMap} from "../_shared/stripe-paid-video-checkout.ts";

const response=(status:number,body:ObjectMap)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const object=(value:unknown):ObjectMap=>value&&typeof value==='object'&&!Array.isArray(value)?value as ObjectMap:{};
const id=(value:unknown)=>typeof value==='string'?value:object(value).id;
const supported=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','payment_intent.succeeded','charge.refunded','charge.dispute.created']);

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return response(405,{error:'method_not_allowed'});
 const signing=readOptionalEnv('STRIPE_PAID_VIDEO_WEBHOOK_SECRET');
 const secret=readOptionalEnv('STRIPE_TEST_SECRET_KEY');
 if(!signing?.startsWith('whsec_')||!secret?.startsWith('sk_test_'))return response(503,{error:'sandbox_webhook_not_configured'});
 // A dedicated signature is mandatory. JWTs, browser redirects and metadata
 // are never payment evidence. No raw body or key is logged or persisted.
 let raw:string;
 try {raw=await req.text();}catch{return response(400,{error:'invalid_body'});}
 if(new TextEncoder().encode(raw).byteLength>262144)return response(413,{error:'body_too_large'});
 if(!await verifyStripeWebhookSignature(raw,req.headers.get('stripe-signature'),signing))return response(400,{error:'invalid_signature'});
 let event:ReturnType<typeof parseStripeEvent>;
 try {event=parseStripeEvent(raw);}catch{return response(400,{error:'invalid_event'});}
 const wire=event as unknown as ObjectMap;
 const item=object(object(wire.data).object);
 if(wire.livemode!==false||item.livemode!==false||wire.account!=null)return response(400,{error:'platform_test_event_required'});
 if(!supported.has(String(wire.type)))return response(200,{status:'ignored'});
 if(!/^evt_[A-Za-z0-9]+$/.test(String(wire.id)))return response(400,{error:'event_identity_invalid'});
 const objectId=wire.type==='charge.dispute.created'?id(item.charge):id(item);
 try {
  const configured=createAdminClient();
  if(!configured.configured)return response(503,{error:'sandbox_service_not_configured'});
  const admin=configured.client;
  const order=await videoRpc(admin,'read_stripe_sandbox_video_webhook_order',{p_object_id:objectId});
  // Retry unbound identities rather than acknowledging and losing a refund
  // delivered before the Checkout completion webhook.
  if(!order.id){
   // A dedicated endpoint can still receive other flows from this account.
   // The marker only filters unrelated events; it never supplies authority.
   if(wire.type!=='charge.dispute.created'&&object(item.metadata).chillywoodFlow!=='stripe_paid_video_sandbox')
    return response(200,{status:'ignored'});
   return response(503,{error:'order_binding_pending'});
  }
  if(wire.type==='charge.dispute.created'){
   await videoRpc(admin,'hold_stripe_sandbox_video_order',{p_order_id:order.id});
   return response(200,{status:'held',orderId:order.id});
  }
  // A signed refund notice immediately suspends access even if a later
  // provider GET is unavailable or a product has since been archived. Only
  // the authenticated GET supplies refund amounts for the financial ledger.
  if(wire.type==='charge.refunded')await videoRpc(admin,'hold_stripe_sandbox_video_order',{p_order_id:order.id});
  const result=await reconcileStripeVideoOrder(admin,order,secret,String(wire.id));
  return response(200,{status:'processed',orderId:order.id,result});
 }catch{return response(503,{error:'provider_reconciliation_pending'});}
});
