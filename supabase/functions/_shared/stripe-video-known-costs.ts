import {calculateKnownCommerceCosts, KNOWN_COST_POLICY, ITEMIZED_FEE_SEMANTICS, type KnownCostInput} from './commerce-known-cost-accounting.ts';
import {observeStripeFeeReport, type FeeReportContext} from './stripe-fee-report-evidence.ts';
import {observeStripeRefundTax} from './stripe-refund-tax-evidence.ts';
import {paidVideoFacts, type ObjectMap} from './stripe-paid-video-checkout.ts';

export type VideoFeeReport = {reportRunId:string;fileId:string;intervalStart:number;intervalEnd:number};
const obj=(v:unknown):ObjectMap=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('video_cost_object_invalid');return v as ObjectMap;};
const integer=(v:unknown):number=>{if(typeof v!=='number'||!Number.isSafeInteger(v))throw Error('video_cost_amount_unknown');return v;};
const identifier=(v:unknown,prefix:string):string=>{if(typeof v!=='string'||!new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(v))throw Error('video_cost_identity_invalid');return v;};
const match=(value:boolean)=>{if(!value)throw Error('video_cost_binding_invalid');};

/** GET-only evidence collector. Caller supplies report identities, never amounts.
 * Previous report identities must be retained by the database context. Every
 * report is re-read against the current complete refund set before accounting.
 */
export async function observeStripeVideoKnownCosts(order:ObjectMap,reports:VideoFeeReport[],secret:string,transport:typeof fetch=fetch,options:{signal?:AbortSignal}={}){
 match(order.environment==='sandbox'&&order.currency==='usd'&&/^sk_test_[A-Za-z0-9_]+$/.test(secret));
 match(Array.isArray(reports)&&reports.length>0&&reports.length<=16);
 // Bound this non-resumable sandbox observation: eight complete refunds and
 // 64 provider GETs within 20 minutes. An exceeded bound is an explicit pending
 // history, never partial accounting. Preserve all nested/caller cancellation.
 const budgetSignal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(1200000)]):AbortSignal.timeout(1200000);
 let reads=0;
 const getTransport:typeof fetch=(url,init)=>{
  if(++reads>64)throw Error('video_cost_history_read_limit_requires_continuation');
  const signals=[budgetSignal,AbortSignal.timeout(60000)];if(init?.signal)signals.push(init.signal);
  const signal=AbortSignal.any(signals);signal.throwIfAborted();
  return transport(url,{...init,signal});
 };
 const get=async(path:string)=>{
  const result=await getTransport(`https://api.stripe.com/v1${path}`,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${secret}`,'Stripe-Version':'2026-10-28.endive'}});
  if(!result.ok)throw Error('video_cost_provider_read_failed');return obj(await result.json());
 };
 const account=await get('/account');match(account.id===order.stripe_account_id);
 const session=await get(`/checkout/sessions/${identifier(order.checkout_session_id,'cs_test')}`);
 const intent=await get(`/payment_intents/${identifier(order.payment_intent_id,'pi')}`);
 const charge=await get(`/charges/${identifier(order.charge_id,'ch')}`);
 const product=await get(`/products/${identifier(order.stripe_product_id,'prod')}`);
 paidVideoFacts(order,session,intent,charge,product);
 const tax=integer(obj(session.total_details).amount_tax);
 const automatic=obj(session.automatic_tax);
 const noCollection=order.taxCollectionMode==='verified_no_collection';
 match((noCollection?automatic.enabled===false&&tax===0:
  order.taxCollectionMode==='automatic'&&automatic.enabled===true&&automatic.status==='complete')&&tax>=0&&tax<=Number(order.amount_minor));
 const balances:KnownCostInput['balances']=[];
 const balance=async(id:unknown,source:string,amount:number)=>{
  const b=await get(`/balance_transactions/${identifier(id,'txn')}`);
  const fee=integer(b.fee);match(b.id===id&&b.source===source&&b.currency==='usd'&&b.amount===amount
   &&integer(b.net)===amount-fee&&['pending','available'].includes(String(b.status)));
  balances.push({id:String(id),objectId:source,feeMinor:fee});
 };
 await balance(charge.balance_transaction,String(charge.id),Number(order.amount_minor));
 const refunds:{id:string;amount:number}[]=[];let cursor='';const seen=new Set<string>();
 for(let page=0;;page++){
  if(page>=2)throw Error('video_cost_refund_history_requires_continuation');
  const list=await get(`/refunds?charge=${charge.id}&limit=100${cursor?`&starting_after=${cursor}`:''}`);
  match(list.object==='list'&&Array.isArray(list.data)&&typeof list.has_more==='boolean');
  if(refunds.length+(list.data as unknown[]).length>8)throw Error('video_cost_refund_history_requires_continuation');
  for(const raw of list.data as unknown[]){
   const r=obj(raw),rid=identifier(r.id,'re'),amount=integer(r.amount);
   match(!seen.has(rid)&&r.charge===charge.id&&r.payment_intent===intent.id&&r.currency==='usd'&&r.status==='succeeded'&&amount>0);
   seen.add(rid);refunds.push({id:rid,amount});await balance(r.balance_transaction,rid,-amount);
  }
  if(list.has_more===false)break;
  match((list.data as unknown[]).length>0);const next=identifier(obj((list.data as unknown[]).at(-1)).id,'re');match(next!==cursor);cursor=next;
 }
 const refunded=refunds.reduce((total,r)=>total+r.amount,0);match(Number.isSafeInteger(refunded)&&refunded===charge.amount_refunded);
 let reversal=0;
 if(refunded>0&&!noCollection){
  const evidence=await observeStripeRefundTax({paymentIntentId:String(intent.id),currency:'usd',grossMinor:Number(order.amount_minor),taxMinor:tax,refunds,livemode:false},secret,getTransport,{timeoutMs:60000,signal:budgetSignal});
  if(!evidence)throw Error('video_cost_refund_tax_unknown');reversal=evidence.tax_reversal_minor;
 }
 const refundIds=refunds.map(r=>r.id).sort();
 const observed=[];
 for(const report of reports){
  observed.push(await observeStripeFeeReport({...report,accountId:String(order.stripe_account_id),environment:'test',chargeId:String(charge.id),refundIds,currency:'usd',reportType:'all_fees.incurred_at.itemized.2'} as FeeReportContext,secret,getTransport,{timeoutMs:60000,signal:budgetSignal}));
 }
 // Revalidate payment/refund history after reading all fees and tax pages.
 const finalCharge=await get(`/charges/${charge.id}`);
 paidVideoFacts(order,session,intent,finalCharge,product);
 match(finalCharge.amount_refunded===refunded&&finalCharge.balance_transaction===charge.balance_transaction
  &&finalCharge.payment_intent===intent.id&&finalCharge.disputed===false&&finalCharge.livemode===false);
 const input:KnownCostInput={policyVersion:KNOWN_COST_POLICY,feeSemantics:ITEMIZED_FEE_SEMANTICS,
  accountId:String(order.stripe_account_id),environment:'test',chargeId:String(charge.id),currency:'usd',
  grossMinor:Number(order.amount_minor),taxMinor:tax,refundedMinor:refunded,taxReversalMinor:reversal,platformBps:2000,balances,reports:observed};
 return {input,calculation:calculateKnownCommerceCosts(input),reports};
}
