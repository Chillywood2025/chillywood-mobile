type Json = Record<string, unknown>;
type Entry = {path:string;facts:Json;status:number;observedAt:number};
export type StripeHistoryCheckpoint = {version:1;phase:'collect'|'verify';cursor:number;entries:Entry[];verificationStartedAt:number|null};
const object=(v:unknown):v is Json=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fields=(v:Json,names:string[])=>Object.fromEntries(names.filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]]));
const line=(v:unknown)=>{if(!object(v))throw Error('history_shape_invalid');return fields(v,['id','object','livemode','type','amount','amount_tax','tax_behavior']);};
const canonical=(v:unknown):string=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:object(v)?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
const empty=():StripeHistoryCheckpoint=>({version:1,phase:'collect',cursor:0,entries:[],verificationStartedAt:null});

/** Only the fields consumed by the existing strict observers are persisted.
 * Addresses, payment methods, descriptions, secrets and raw provider bodies are
 * excluded. These projections are revalidated; never immutable-cache authority. */
export function projectStripeHistoryFacts(path:string,value:unknown):Json{
 if(!object(value))throw Error('history_shape_invalid');
 const pathname=new URL(path,'https://api.stripe.com').pathname;
 if(pathname==='/v1/account')return fields(value,['id','object']);
 if(/^\/v1\/checkout\/sessions\/cs_(test|live)_/.test(pathname))return {...fields(value,['id','object','livemode','mode','status','payment_status','client_reference_id','currency','amount_total','payment_intent']),
  metadata:object(value.metadata)?fields(value.metadata,['chillywood_order_id','buyer_user_id','environment','rail','auction_quote_id','settlement_contract_id','settlement_policy','provider_product_id']):value.metadata,
  automatic_tax:object(value.automatic_tax)?fields(value.automatic_tax,['enabled','status']):value.automatic_tax,
  total_details:object(value.total_details)?fields(value.total_details,['amount_tax']):value.total_details};
 if(/^\/v1\/payment_intents\/pi_/.test(pathname))return fields(value,['id','object','livemode','status','currency','amount','amount_received','latest_charge','transfer_data','application_fee_amount','on_behalf_of']);
 if(/^\/v1\/charges\/ch_/.test(pathname))return fields(value,['id','object','livemode','payment_intent','paid','captured','currency','amount','amount_captured','disputed','amount_refunded','refunded','balance_transaction']);
 if(/^\/v1\/balance_transactions\/txn_/.test(pathname))return fields(value,['id','object','source','type','currency','amount','fee','net','status']);
 if(pathname==='/v1/refunds')return {...fields(value,['object','has_more']),data:Array.isArray(value.data)?value.data.map(v=>{
  if(!object(v))throw Error('history_shape_invalid');return {...fields(v,['id','object','charge','payment_intent','currency','status','amount']),balance_transaction:object(v.balance_transaction)?fields(v.balance_transaction,['id','object','source','type','currency','amount','fee','net','status']):v.balance_transaction};}):value.data};
 if(pathname==='/v1/tax/associations/find')return {...fields(value,['id','object','payment_intent']),
  tax_transaction_attempts:Array.isArray(value.tax_transaction_attempts)?value.tax_transaction_attempts.map(v=>{
   if(!object(v))throw Error('history_shape_invalid');return {...fields(v,['source','status']),committed:object(v.committed)?fields(v.committed,['transaction']):v.committed};}):value.tax_transaction_attempts};
 if(/^\/v1\/tax\/transactions\/tax_[A-Za-z0-9_]+\/line_items$/.test(pathname))return {...fields(value,['object','has_more']),data:Array.isArray(value.data)?value.data.map(line):value.data};
 if(/^\/v1\/tax\/transactions\/tax_[A-Za-z0-9_]+$/.test(pathname))return {...fields(value,['id','object','livemode','currency','type']),
  reversal:object(value.reversal)?fields(value.reversal,['original_transaction']):value.reversal,
  shipping_cost:value.shipping_cost===null?null:line(value.shipping_cost)};
 throw Error('history_path_not_allowed');
}
const frontier=(path:string)=>/\/v1\/(account$|checkout\/sessions\/|payment_intents\/|charges\/|balance_transactions\/|refunds\?|tax\/associations\/find\?)/.test(path);

export function createStripeHistoryCheckpoint(saved:unknown,transport:typeof fetch,remaining:()=>number,now=()=>Date.now()){
 let state=empty(),position=0;
 if(object(saved)&&saved.version===1&&['collect','verify'].includes(String(saved.phase))&&Number.isInteger(saved.cursor)
  &&Array.isArray(saved.entries)&&saved.entries.length<=10000&&Number(saved.cursor)>=0&&Number(saved.cursor)<=saved.entries.length){
  state=JSON.parse(JSON.stringify(saved)) as StripeHistoryCheckpoint;
  for(const e of state.entries)if(!object(e)||typeof e.path!=='string'||!object(e.facts)||!Number.isSafeInteger(e.observedAt)||![200,404].includes(e.status))throw Error('history_checkpoint_invalid');
 }else if(saved!==null&&saved!==undefined&&(!object(saved)||Object.keys(saved).length))throw Error('history_checkpoint_invalid');
 const reset=():never=>{state=empty();position=0;throw Error('history_snapshot_changed');};
 const fresh=async(input:string,init:RequestInit|undefined)=>{
  const controller=new AbortController();
  const signal=AbortSignal.any([controller.signal,...(init?.signal?[init.signal]:[])]);
  if(signal.aborted)throw Error('history_body_deadline');
  // Own a referenced deadline until the entire GET/body operation settles.
  // AbortSignal.timeout alone can disappear with an otherwise idle event loop.
  const timer=setTimeout(()=>controller.abort(),15000);
  const bounded=async<T>(work:()=>Promise<T>):Promise<T>=>{
   if(signal.aborted)throw Error('history_body_deadline');let abort:()=>void=()=>{};
   const aborted=new Promise<never>((_,reject)=>{abort=()=>reject(Error('history_body_deadline'));signal.addEventListener('abort',abort,{once:true});});
   try{return await Promise.race([Promise.resolve().then(work),aborted]);}
   finally{signal.removeEventListener('abort',abort);}
  };
  try{
   const response=await bounded(async()=>{
    const value=await transport(input,{...init,signal});
    if(signal.aborted){void value.body?.cancel().catch(()=>{});throw Error('history_body_deadline');}
    return value;
   });
   if(response.status===404&&new URL(input).pathname==='/v1/tax/associations/find'){
    void response.body?.cancel().catch(()=>{});return {response:Response.json({object:'history.missing'},{status:404}),facts:{object:'history.missing'},status:404};
   }
   if(!response.ok){void response.body?.cancel().catch(()=>{});return {response,facts:null,status:response.status};}
   if(!response.body)throw Error('history_shape_invalid');
   const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,body='';
   try{for(;;){const part=await bounded(()=>reader.read());if(part.done)break;size+=part.value.length;if(size>2*1024*1024)throw Error('history_body_limit');body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();}
   finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
   const facts=projectStripeHistoryFacts(new URL(input).pathname+new URL(input).search,JSON.parse(body));
   return {response:Response.json(facts,{status:response.status}),facts,status:response.status};
  }finally{clearTimeout(timer);}
 };
 const wrapped:typeof fetch=async(input,init)=>{
  if(typeof input!=='string'||init?.method!=='GET')throw Error('history_get_only');
  const url=new URL(input);if(url.origin!=='https://api.stripe.com'||url.username||url.password||url.hash)throw Error('history_origin_invalid');
  const path=url.pathname+url.search,index=position++,prior=state.entries[index];
  if(prior&&prior.path!==path)return reset();
  if(index<state.cursor){if(!prior)throw Error('history_checkpoint_invalid');return Response.json(prior.facts,{status:prior.status});}
  const {response,facts,status}=await fresh(input,init);
  if(!facts)return response; // explicit 404 remains unknown; no manufactured success
  if(state.phase==='verify'&&(!prior||prior.status!==status||canonical(prior.facts)!==canonical(facts)))return reset();
  state.entries[index]={path,facts,status,observedAt:now()};state.cursor=index+1;
  if(state.entries.length>10000||JSON.stringify(state).length>8*1024*1024)throw Error('history_capacity_review_required');
  return response;
 };
 return {
  transport:wrapped,
  checkpoint:()=>JSON.parse(JSON.stringify(state)) as StripeHistoryCheckpoint,
  verificationReadCount:()=>state.entries.length+new Set(state.entries.filter(e=>frontier(e.path)).map(e=>e.path)).size,
  invalidate:()=>{state=empty();position=0;},
  async finish(init:RequestInit){
   if(position!==state.entries.length)return reset();
   if(state.phase==='collect'){state.phase='verify';state.cursor=0;state.verificationStartedAt=now();position=0;return false;}
   if(state.verificationStartedAt===null||now()-state.verificationStartedAt>6*60*60*1000)throw Error('history_verification_window_exceeded');
   // All values were fetched twice. Re-read mutable boundaries again in this
   // final invocation; source/list changes invalidate even a completed cursor.
   const anchors=[...new Map(state.entries.filter(e=>frontier(e.path)).map(e=>[e.path,e])).values()];
   if(remaining()<anchors.length)return false;
   for(const anchor of anchors){
    const {facts,status}=await fresh(`https://api.stripe.com${anchor.path}`,init);
    if(!facts||status!==anchor.status||canonical(facts)!==canonical(anchor.facts))return reset();
   }
   return true;
  },
 };
}
