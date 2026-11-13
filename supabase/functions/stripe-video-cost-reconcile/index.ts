import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createAdminClient,readOptionalEnv,jsonResponse} from '../_shared/stripe-connect.ts';
import {observeStripeVideoKnownCosts,type VideoFeeReport} from '../_shared/stripe-video-known-costs.ts';
import {reconcileStripeVideoOrder,videoRpc} from '../_shared/stripe-paid-video-checkout.ts';

// Server observation only. No report creation, provider configuration, money
// release or mutable earning. Ordinary user JWTs cannot submit cost evidence.
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return jsonResponse(405,{error:'method_not_allowed'});
 const service=readOptionalEnv('SUPABASE_SERVICE_ROLE_KEY');
 if(!service||req.headers.get('Authorization')!==`Bearer ${service}`)return jsonResponse(403,{error:'service_authority_required'});
 const secret=readOptionalEnv('STRIPE_TEST_SECRET_KEY');
 if(!secret?.startsWith('sk_test_'))return jsonResponse(503,{error:'test_cost_observer_not_configured'});
 try{
  const raw=await req.text();if(new TextEncoder().encode(raw).length>8192)throw Error('request_too_large');
  const body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['order_id','reports'].includes(k))
   ||typeof body.order_id!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.order_id)
   ||!Array.isArray(body.reports)||body.reports.length>16)throw Error('report_identity_required');
  const configured=createAdminClient();if(!configured.configured)throw Error('service_not_configured');
  const admin=configured.client;
  let order=await videoRpc(admin,'get_stripe_video_cost_context',{p_order_id:body.order_id});
  await reconcileStripeVideoOrder(admin,order,secret);
  order=await videoRpc(admin,'get_stripe_video_cost_context',{p_order_id:body.order_id});
  const identities=new Map<string,VideoFeeReport>();
  for(const descriptor of [...(Array.isArray(order.previousReports)?order.previousReports:[]),...body.reports]){
   if(!descriptor||typeof descriptor!=='object'||Array.isArray(descriptor)||Object.keys(descriptor).sort().join(',')!=='fileId,intervalEnd,intervalStart,reportRunId'
    ||!/^frr_[A-Za-z0-9]+$/.test(descriptor.reportRunId)||!/^file_[A-Za-z0-9]+$/.test(descriptor.fileId)
    ||!Number.isSafeInteger(descriptor.intervalStart)||!Number.isSafeInteger(descriptor.intervalEnd)
    ||descriptor.intervalStart<0||descriptor.intervalEnd<=descriptor.intervalStart)throw Error('report_descriptor_invalid');
   const old=identities.get(descriptor.reportRunId);
   if(old&&(old.fileId!==descriptor.fileId||old.intervalStart!==descriptor.intervalStart||old.intervalEnd!==descriptor.intervalEnd))throw Error('report_descriptor_conflict');
   identities.set(descriptor.reportRunId,descriptor);
  }
  const reports=[...identities.values()].sort((a,b)=>a.reportRunId.localeCompare(b.reportRunId));
  const observed=await observeStripeVideoKnownCosts(order,reports,secret,fetch,{signal:req.signal});
  const result=await videoRpc(admin,'record_stripe_video_known_costs',{p_order_id:order.id,p_input:observed.input,p_reports:reports});
  return jsonResponse(200,{...result,financialAuthority:false,payoutCreated:false});
 }catch(error){
  const continuation=error instanceof Error&&['video_cost_refund_history_requires_continuation','video_cost_history_read_limit_requires_continuation'].includes(error.message);
  return jsonResponse(409,{error:continuation?'video_cost_history_requires_continuation':'video_cost_evidence_incomplete',retryable:!continuation,continuationRequired:continuation,financialAuthority:false,payoutCreated:false});
 }
});
