// Only provider-retrieved objects may enter these validators, never return URLs.
import { googlePlayStripeTaxEvidence } from './google-play-stripe-tax-evidence.ts';
export type ObjectMap = Record<string, unknown>;
export interface VideoRpc {rpc(name:string,args:ObjectMap):PromiseLike<{data:unknown;error:unknown}>}
const object = (value: unknown): ObjectMap => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectMap : {};
const id = (value: unknown): unknown => typeof value === 'string' ? value : object(value).id;
export function videoCheckoutForm(order: ObjectMap, tax: ObjectMap, returnUrl: string): URLSearchParams {
  const url = new URL(returnUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw Error('https_return_url_required');
  if (order.environment !== 'sandbox' || !Number.isSafeInteger(order.amount_minor) || Number(order.amount_minor) <= 0 || order.currency !== 'usd') throw Error('sandbox_price_required');
  if (tax.ready !== true || tax.taxBehavior !== 'inclusive' || !/^txcd_[0-9]+$/.test(String(tax.taxCode)) || !['automatic','verified_no_collection'].includes(String(tax.collectionMode))) throw Error('tax_qualification_required');
  const form = new URLSearchParams({mode:'payment', 'payment_method_types[0]':'card',
    'line_items[0][price_data][currency]':'usd', 'line_items[0][price_data][unit_amount]':String(order.amount_minor),
    'line_items[0][price_data][product]':String(order.stripe_product_id),
    'line_items[0][price_data][tax_behavior]':'inclusive','line_items[0][quantity]':'1',
    success_url:`${returnUrl}?orderId=${order.id}`,cancel_url:`${returnUrl}?orderId=${order.id}`,
    client_reference_id:String(order.id),'billing_address_collection':'required','automatic_tax[enabled]':String(tax.collectionMode==='automatic'),
    expires_at:String(Math.floor(Date.now()/1000)+60*60),
  });
  if(tax.collectionMode==='automatic') {
    if(tax.liabilityType==='self') form.set('automatic_tax[liability][type]','self');
    else if(tax.liabilityType==='account' && /^acct_[A-Za-z0-9]+$/.test(String(tax.liabilityAccountId))) {
      form.set('automatic_tax[liability][type]','account');form.set('automatic_tax[liability][account]',String(tax.liabilityAccountId));
    } else throw Error('tax_liability_required');
  }
  for (const [key,value] of Object.entries({chillywoodFlow:'stripe_paid_video_sandbox',orderId:order.id,buyerId:order.buyer_id,videoId:order.video_id,priceId:order.price_id,priceRevision:order.price_revision,commerce_tax_policy_id:tax.policyId})) {
    form.set(`metadata[${key}]`,String(value));form.set(`payment_intent_data[metadata][${key}]`,String(value));
  }
  return form;
}

export function paidVideoFacts(order:ObjectMap, session:ObjectMap, intent:ObjectMap, charge:ObjectMap, product:ObjectMap):ObjectMap {
  const metadata=object(session.metadata); const piMetadata=object(intent.metadata);
  if (session.livemode !== false || intent.livemode !== false || charge.livemode !== false || product.livemode !== false || product.active !== true
    || session.id !== order.checkout_session_id || session.mode !== 'payment' || session.payment_status !== 'paid'
    || session.status !== 'complete' || session.client_reference_id !== order.id
    || intent.status !== 'succeeded' || charge.paid !== true || charge.captured !== true
    || id(session.payment_intent) !== intent.id || id(intent.latest_charge) !== charge.id || id(charge.payment_intent) !== intent.id
    || session.amount_total !== order.amount_minor || intent.amount_received !== order.amount_minor || charge.amount !== order.amount_minor
    || session.currency !== order.currency || intent.currency !== order.currency || charge.currency !== order.currency
    || intent.transfer_data != null || intent.on_behalf_of != null || intent.application_fee_amount != null
    || charge.transfer != null || charge.transfer_data != null || charge.on_behalf_of != null || charge.application_fee != null || charge.application_fee_amount != null
    || product.id !== order.stripe_product_id || charge.disputed === true
    || !Number.isSafeInteger(charge.amount_refunded) || Number(charge.amount_refunded)<0 || Number(charge.amount_refunded)>Number(order.amount_minor)) throw Error('provider_payment_not_exact');
  for(const [key,value] of Object.entries({chillywoodFlow:'stripe_paid_video_sandbox',orderId:order.id,buyerId:order.buyer_id,videoId:order.video_id,priceId:order.price_id,priceRevision:order.price_revision})) {
    if(metadata[key]!==String(value)||piMetadata[key]!==String(value))throw Error('provider_metadata_not_exact');
  }
  if(order.tax_policy_id && (metadata.commerce_tax_policy_id!==order.tax_policy_id || piMetadata.commerce_tax_policy_id!==order.tax_policy_id))throw Error('provider_tax_policy_mismatch');
  return {livemode:false,accountId:order.stripe_account_id,checkoutSessionId:session.id,orderId:order.id,buyerId:order.buyer_id,
    videoId:order.video_id,productId:product.id,currency:order.currency,amountMinor:order.amount_minor,paymentStatus:'paid',
    paymentIntentStatus:'succeeded',platformHeld:true,chargePaid:true,paymentIntentId:intent.id,chargeId:charge.id,
    refundAmountMinor:charge.amount_refunded};
}

export async function videoRpc(admin:VideoRpc,name:string,args:ObjectMap):Promise<ObjectMap> {
 const result=await admin.rpc(name,args); if(result.error)throw Error('video_authority_unavailable');return object(result.data);
}
export async function stripeVideoGet(secret:string,path:string):Promise<ObjectMap> {
 const response=await fetch(`https://api.stripe.com/v1${path}`,{headers:{Authorization:`Bearer ${secret}`,'Stripe-Version':'2026-02-25.clover'},redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error('provider_read_unavailable');return object(await response.json());
}
export async function reconcileStripeVideoOrder(admin:VideoRpc,order:ObjectMap,secret:string,eventId?:string,get:(secret:string,path:string)=>Promise<ObjectMap>=stripeVideoGet):Promise<ObjectMap> {
 if(!/^sk_test_/.test(secret)||order.environment!=='sandbox'||!/^cs_test_[A-Za-z0-9]+$/.test(String(order.checkout_session_id)))throw Error('sandbox_order_required');
 const account=await get(secret,'/account');if(account.id!==order.stripe_account_id)throw Error('provider_account_mismatch');
 const session=await get(secret,`/checkout/sessions/${encodeURIComponent(String(order.checkout_session_id))}`);
 if(session.livemode!==false||session.id!==order.checkout_session_id||session.client_reference_id!==order.id)throw Error('provider_session_mismatch');
 if(session.payment_status!=='paid'){
  if(session.status==='expired'&&session.payment_status==='unpaid'){
   const intentStatus=session.payment_intent==null?'absent':(await get(secret,`/payment_intents/${encodeURIComponent(String(id(session.payment_intent)))}`)).status;
   if(intentStatus==='absent'||intentStatus==='canceled'){
    await videoRpc(admin,'expire_stripe_sandbox_video_order',{p_order_id:order.id,p_checkout_session_id:session.id,p_intent_status:intentStatus});
    return {status:'failed'};
   }
  }
  return {status:order.status};
 }
 const intent=await get(secret,`/payment_intents/${encodeURIComponent(String(id(session.payment_intent)))}`);
 const charge=await get(secret,`/charges/${encodeURIComponent(String(id(intent.latest_charge)))}`);
 const product=await get(secret,`/products/${encodeURIComponent(String(order.stripe_product_id))}`);
 const lines=await get(secret,`/checkout/sessions/${encodeURIComponent(String(session.id))}/line_items?limit=2`);
 const line=Array.isArray(lines.data)&&lines.data.length===1?object(lines.data[0]):{};
 if(lines.has_more!==false||line.quantity!==1||id(object(line.price).product)!==product.id||object(line.price).unit_amount!==order.amount_minor
 ||object(line.price).tax_behavior!=='inclusive')throw Error('provider_line_item_mismatch');
 const facts=paidVideoFacts(order,session,intent,charge,product);
 const observed=await videoRpc(admin,'observe_stripe_sandbox_video_payment',{p_order_id:order.id,
 p_event_id:eventId??`poll:${charge.id}:${facts.refundAmountMinor}`,p_facts:facts});
 if(order.checkout_platform==='android') {
  // Financial observation and refund/access revocation commit FIRST. Reporting
  // enrichment cannot roll them back, and repeated verified reads can repair it.
  const evidence=await stripeVideoGoogleReportEvidence(session,charge,path=>get(secret,path));
  await videoRpc(admin,'repair_stripe_video_google_reporting',{p_order_id:order.id,
   p_payment_intent_id:intent.id,p_charge_id:charge.id,p_refund_amount_minor:facts.refundAmountMinor,
   p_original_occurred_at:evidence.paidOccurredAt,p_refund_occurred_at:evidence.refundOccurredAt,p_tax:evidence.tax});
 }
 return observed;
}

/** Only authenticated provider GET results enter here. Missing/oversized refund
 * history leaves a durable blocked reporting obligation, never an invented time. */
export async function stripeVideoGoogleReportEvidence(session:ObjectMap,charge:ObjectMap,get:(path:string)=>Promise<ObjectMap>) {
 const timestamp=(value:unknown):string|null=>Number.isSafeInteger(value)&&Number(value)>0&&Number(value)<=Math.floor(Date.now()/1000)
  ?new Date(Number(value)*1000).toISOString():null;
 const paidOccurredAt=timestamp(charge.created),tax=googlePlayStripeTaxEvidence(session);
 let refundOccurredAt:string|null=null;
 if(Number(charge.amount_refunded)>0)try{
  let after:string|undefined,sum=0,latest=0,complete=false;const seen=new Set<string>();
  for(let page=0;page<10;page++){
   const query=new URLSearchParams({charge:String(charge.id),limit:'100'});if(after)query.set('starting_after',after);
   const list=await get(`/refunds?${query}`);
   if(list.object!=='list'||!Array.isArray(list.data)||list.data.length>100||typeof list.has_more!=='boolean')throw Error('refund_history_incomplete');
   for(const value of list.data){const refund=object(value);
    if(refund.object!=='refund'||typeof refund.id!=='string'||!/^re_[A-Za-z0-9_]+$/.test(refund.id)||seen.has(refund.id)
     ||refund.charge!==charge.id||refund.payment_intent!==id(charge.payment_intent)||refund.currency!=='usd')throw Error('refund_identity_invalid');
    seen.add(refund.id);
    if(refund.status==='succeeded'){
     if(!Number.isSafeInteger(refund.amount)||Number(refund.amount)<=0||!timestamp(refund.created)
      ||(paidOccurredAt!==null&&Number(refund.created)<Number(charge.created)))throw Error('refund_evidence_invalid');
     sum+=Number(refund.amount);if(!Number.isSafeInteger(sum)||sum>Number(charge.amount_refunded))throw Error('refund_total_changed');
     latest=Math.max(latest,Number(refund.created));
    }
   }
   if(!list.has_more){complete=true;break;}
   after=String(object(list.data.at(-1)).id??'');if(!/^re_[A-Za-z0-9_]+$/.test(after))throw Error('refund_cursor_invalid');
  }
  if(complete&&sum===charge.amount_refunded)refundOccurredAt=timestamp(latest);
 }catch{/* Keep reporting blocked; financial refund has already committed. */}
 return {paidOccurredAt,refundOccurredAt,tax};
}

// Read-only recovery of a lost create response. Exhaust the bounded interval
// before binding: an arbitrary first match is not evidence of uniqueness.
export async function recoverStripeVideoSession(admin:VideoRpc,order:ObjectMap,secret:string,
 get:(secret:string,path:string)=>Promise<ObjectMap>=stripeVideoGet):Promise<string|null> {
 if(order.status!=='dispatched'||order.checkout_session_id!=null||order.environment!=='sandbox'||!secret.startsWith('sk_test_'))return null;
 const account=await get(secret,'/account');if(account.id!==order.stripe_account_id)throw Error('provider_account_mismatch');
 const created=Math.floor(Date.parse(String(order.created_at))/1000)-5;
 if(!Number.isFinite(created))throw Error('order_creation_time_required');
 let after:string|undefined;const candidates:ObjectMap[]=[];let exhausted=false;
 for(let page=0;page<10;page++){
  const query=new URLSearchParams({limit:'100','created[gte]':String(created)});if(after)query.set('starting_after',after);
  const list=await get(secret,`/checkout/sessions?${query}`);
  if(!Array.isArray(list.data)||typeof list.has_more!=='boolean')throw Error('provider_recovery_page_invalid');
  for(const value of list.data){const session=object(value),metadata=object(session.metadata);
   if(session.livemode===false&&session.mode==='payment'&&session.client_reference_id===order.id&&session.amount_total===order.amount_minor
   &&session.currency===order.currency&&/^cs_test_[A-Za-z0-9]+$/.test(String(session.id))
   &&Object.entries({chillywoodFlow:'stripe_paid_video_sandbox',orderId:order.id,buyerId:order.buyer_id,videoId:order.video_id,priceId:order.price_id,priceRevision:order.price_revision})
    .every(([key,value])=>metadata[key]===String(value)))candidates.push(session);
  }
  if(!list.has_more){exhausted=true;break;}
  after=String(object(list.data.at(-1)).id??'');if(!/^cs_test_[A-Za-z0-9]+$/.test(after))throw Error('provider_recovery_cursor_invalid');
 }
 if(!exhausted||candidates.length!==1)return null;
 const session=candidates[0];
 const lines=await get(secret,`/checkout/sessions/${encodeURIComponent(String(session.id))}/line_items?limit=2`);
 const line=Array.isArray(lines.data)&&lines.data.length===1?object(lines.data[0]):{};
 if(lines.has_more!==false||line.quantity!==1||id(object(line.price).product)!==order.stripe_product_id
 ||object(line.price).unit_amount!==order.amount_minor||object(line.price).tax_behavior!=='inclusive')return null;
 await videoRpc(admin,'attach_stripe_sandbox_video_session',{p_order_id:order.id,p_checkout_session_id:session.id});
 return String(session.id);
}
