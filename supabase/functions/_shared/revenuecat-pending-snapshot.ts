type RecordValue = Record<string, unknown>;
export type PendingSnapshotJob = {
 event_id: string; lease: string; provider: string; user_id: string; original_transaction_id: string;
 environment: 'sandbox'|'production'; project_id: string; provider_product_id: string; provider_base_plan_id: string|null;
};
const object = (v: unknown): v is RecordValue => !!v && typeof v==='object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v==='string' && /^[A-Za-z0-9_.:-]{1,512}$/.test(v);
const millis = (v: unknown): v is number => typeof v==='number' && Number.isSafeInteger(v) && v>0;
export const canonicalSnapshot = (v: unknown): string => Array.isArray(v)?`[${v.map(canonicalSnapshot).join(',')}]`
 :object(v)?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalSnapshot(v[k])}`).join(',')}}`:JSON.stringify(v);

/** GET-only, project-bound and aggregate-bounded. No body/client fact is authority.
 * Complete history plus an unchanged second exact subscription read are required.
 * Missing/ambiguous/oversized evidence is deferred; never interpreted as access. */
export async function readPendingRevenueCatSnapshot(job:PendingSnapshotJob,key:string,transport:typeof fetch=fetch,now=()=>Date.now()) {
 if(!id(job.project_id)||!id(job.original_transaction_id)||!id(job.user_id)
  ||!['sandbox','production'].includes(job.environment)||!['revenuecat_app_store','revenuecat_google_play'].includes(job.provider))throw Error('snapshot_ineligible');
 const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),60000);
 const bounded=async<T>(work:Promise<T>):Promise<T>=>{
  if(controller.signal.aborted)throw Error('provider_unavailable');
  let abort:()=>void=()=>{};
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{abort=()=>reject(Error('provider_unavailable'));controller.signal.addEventListener('abort',abort,{once:true});})]);}
  finally{controller.signal.removeEventListener('abort',abort);}
 };
 const root=`/v2/projects/${encodeURIComponent(job.project_id)}`;let reads=0;
 const get=async(path:string)=>{
  const url=new URL(path,'https://api.revenuecat.com');
  if(url.origin!=='https://api.revenuecat.com'||url.username||url.password||url.hash||!url.pathname.startsWith(`${root}/`)
   ||++reads>24||controller.signal.aborted)throw Error('history_incomplete');
  const response=await bounded(transport(url.toString(),{method:'GET',headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},
   signal:controller.signal,redirect:'error',cache:'no-store'}));
  if(!response.ok)throw Error('provider_unavailable');
  // Bound bodies as well as request count; a slow body shares the deadline.
  if(!response.body)throw Error('provider_unavailable');
  const reader=response.body.getReader();let size=0,body='';const decoder=new TextDecoder();
  try{for(;;){const chunk=await bounded(reader.read());if(chunk.done)break;size+=chunk.value.length;if(size>2*1024*1024)throw Error('history_incomplete');body+=decoder.decode(chunk.value,{stream:true});}body+=decoder.decode();}
  finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
  const value:unknown=JSON.parse(body);if(!object(value))throw Error('snapshot_ineligible');return value;
 };
 const list=async(first:string)=>{
  const all:RecordValue[]=[],seen=new Set<string>();let path=first;
  for(let page=0;page<10;page++){
   if(seen.has(path))throw Error('history_incomplete');seen.add(path);
   const value=await get(path);
   if(value.object!=='list'||!Array.isArray(value.items)||value.items.some(x=>!object(x)))throw Error('snapshot_ineligible');
   all.push(...value.items as RecordValue[]);if(all.length>1000)throw Error('history_incomplete');
   if(value.next_page===null||value.next_page===undefined||value.next_page==='')return all;
   if(typeof value.next_page!=='string')throw Error('history_incomplete');
   const next=new URL(value.next_page,'https://api.revenuecat.com'),original=new URL(first,'https://api.revenuecat.com');
   if(next.origin!==original.origin||next.pathname!==original.pathname)throw Error('history_incomplete');
   path=next.toString();
  }throw Error('history_incomplete');
 };
 try{
  // Discovery is customer-scoped. Do not assume the original transaction is
  // the subscription's latest store_subscription_identifier after renewal.
  const found=await list(`${root}/customers/${encodeURIComponent(job.user_id)}/subscriptions?environment=${job.environment}&limit=100`);
  if(found.length>10||found.some(s=>!id(s.id))||new Set(found.map(s=>s.id)).size!==found.length)throw Error('history_incomplete');
  const store=job.provider==='revenuecat_app_store'?'app_store':'play_store';
  const candidates:{subscription:RecordValue;transactions:RecordValue[];observed:number;path:string}[]=[];
  for(const candidate of found){
   const candidatePath=`${root}/subscriptions/${encodeURIComponent(String(candidate.id))}`;
   const subscription=await get(candidatePath),observed=now();
   if(subscription.object!=='subscription'||subscription.id!==candidate.id||subscription.customer_id!==job.user_id
   ||subscription.original_customer_id!==job.user_id||subscription.environment!==job.environment||subscription.store!==store
   ||subscription.ownership!=='purchased'||subscription.gives_access!==true||subscription.pending_payment!==false||subscription.status!=='active'
   ||!id(subscription.product_id)||!id(subscription.store_subscription_identifier)||!millis(subscription.starts_at)
   ||!millis(subscription.current_period_starts_at)||!millis(subscription.current_period_ends_at)
   ||subscription.starts_at>subscription.current_period_starts_at||subscription.current_period_starts_at>observed
   ||subscription.current_period_ends_at<=observed||subscription.current_period_ends_at<=subscription.current_period_starts_at)continue;
   const transactions=await list(`${candidatePath}/transactions?limit=100&sort=purchased_at&direction=asc`);
   if(!transactions.length||transactions.some(t=>t.object!=='subscription_transaction'||!id(t.id)||!millis(t.purchased_at)
     ||t.purchased_at<Number(subscription.starts_at)||t.purchased_at>observed)
    ||new Set(transactions.map(t=>t.id)).size!==transactions.length)throw Error('snapshot_ineligible');
   transactions.sort((a,b)=>Number(a.purchased_at)-Number(b.purchased_at));
   if(transactions[0].id===job.original_transaction_id)candidates.push({subscription,transactions,observed,path:candidatePath});
  }
  if(candidates.length!==1)throw Error('snapshot_ineligible');
  const {subscription,transactions,observed,path:subscriptionPath}=candidates[0];
  const product=await get(`${root}/products/${encodeURIComponent(String(subscription.product_id))}`);
  const expectedProduct=job.provider_base_plan_id?`${job.provider_product_id}:${job.provider_base_plan_id}`:job.provider_product_id;
  if(product.object!=='product'||product.id!==subscription.product_id||product.type!=='subscription'||product.store_identifier!==expectedProduct)throw Error('snapshot_ineligible');
  const entitlements=await list(`${subscriptionPath}/entitlements?limit=100`);
  if(!entitlements.some(e=>e.lookup_key==='premium'))throw Error('snapshot_ineligible');
  const original=transactions[0],current=transactions.at(-1)!;
  if(original.id!==job.original_transaction_id||original.purchased_at!==subscription.starts_at
   ||current.id!==subscription.store_subscription_identifier||current.purchased_at!==subscription.current_period_starts_at
   ||![job.provider_product_id,expectedProduct].includes(String(current.product_store_identifier))
   ||!millis(current.effective_expiration_date)||current.effective_expiration_date!==subscription.current_period_ends_at
   ||(transactions.length>1&&(transactions[1].purchased_at===original.purchased_at||transactions.at(-2)!.purchased_at===current.purchased_at)))throw Error('snapshot_ineligible');
  if(canonicalSnapshot(await get(subscriptionPath))!==canonicalSnapshot(subscription))throw Error('snapshot_changed');
  return {contract:'rc-exact-current-subscription-v1',projectId:job.project_id,customerId:job.user_id,originalCustomerId:job.user_id,
   environment:job.environment,store,originalTransactionId:job.original_transaction_id,currentTransactionId:current.id,
   productIdentifier:job.provider_product_id,basePlanId:job.provider_base_plan_id,subscriptionId:subscription.id,
   status:'active',givesAccess:true,ownership:'purchased',pendingPayment:false,
   startsAt:new Date(Number(subscription.current_period_starts_at)).toISOString(),expiresAt:new Date(Number(subscription.current_period_ends_at)).toISOString(),
   observedAt:new Date(observed).toISOString()};
 }finally{clearTimeout(deadline);controller.abort();}
}
