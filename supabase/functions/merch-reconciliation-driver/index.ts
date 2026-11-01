import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createAdminClient,jsonResponse,readOptionalEnv} from "../_shared/stripe-connect.ts";
// Bound SDK/body waits as well as provider requests. A timed-out server write
// may still finish; leases and exact tokens make the next invocation safe.
async function bounded<T>(work:PromiseLike<T>,milliseconds=5000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve(work),new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(Error("deadline")),milliseconds);})]);}
 finally{if(timer)clearTimeout(timer);}
}
async function tinyBody(req:Request){
 if(Number(req.headers.get("content-length")??0)>64)throw Error("body_too_large");
 if(!req.body)return "";
 const reader=req.body.getReader();let text="",size=0,timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{});},5000);
 try{
  while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>64)throw Error("body_too_large");text+=new TextDecoder().decode(item.value);}
  if(timedOut)throw Error("body_deadline");return text;
 }finally{clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
// No caller-supplied URLs, order IDs, credentials, or enable switch.
Deno.serve(async(req:Request)=>{
 const deadline=Date.now()+100000;
 if(req.method!=="POST")return jsonResponse(405,{error:"method_not_allowed"});
 const service=readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
 if(!service||req.headers.get("Authorization")!==`Bearer ${service}`)return jsonResponse(403,{error:"service_authority_required"});
 const project=readOptionalEnv("SUPABASE_URL"),admin=createAdminClient();
 if(!project||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(project)||!admin.configured)return jsonResponse(503,{error:"driver_not_configured"});
 try{
  const body=await bounded(tinyBody(req));if(body.trim()&&body.trim()!=="{}")return jsonResponse(400,{error:"empty_body_required"});
  const claimed=await bounded(admin.client.rpc("claim_merch_reconciliation_batch"));
  if(claimed.error||!claimed.data)return jsonResponse(503,{error:"queue_unavailable"});
  if(claimed.data.claimed!==true)return jsonResponse(200,{claimed:false,financialAuthority:false});
  const runId=claimed.data.runId;
  if(typeof runId!=="string"||!/^[0-9a-f-]{36}$/i.test(runId))throw Error("invalid_run");
  let batch=claimed.data,orders=0,completed=0;
  const seen=new Set<string>();
  const validBatch=(value:typeof batch)=>{
   const jobs=value.jobs as {order_id:string;lease:string}[];
   if(!Array.isArray(jobs)||jobs.length>3||orders+jobs.length>30||value.runId!==runId
    ||jobs.some(job=>!job||! /^[0-9a-f-]{36}$/i.test(job.order_id)||! /^[0-9a-f-]{36}$/i.test(job.lease)||seen.has(job.order_id))
    ||new Set(jobs.map(job=>job.order_id)).size!==jobs.length)throw Error("invalid_batch");
   return jobs;
  };
  validBatch(batch);
  const invoke=async(name:string,key:string,body:Record<string,unknown>)=>{
   try{
    const remaining=Math.min(85000,Math.max(1,deadline-Date.now()-5000));
    const data=await bounded((async()=>{
     const response=await fetch(`${project.replace(/\/$/,"")}/functions/v1/${name}`,{method:"POST",redirect:"error",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(remaining)});
     if(!response.ok)return null;
     return await response.json();
    })(),remaining);
    if(!data||data.error||data.financialAuthority!==false)return false;
    if(name==="stripe-merch-cost-reconcile"){
     if(data.status==='history_pending'&&data.payoutCreated===false)return 'history_pending';
     return ["held","duplicate"].includes(data.status)&&typeof data.observationId==="string"&&/^[0-9a-f-]{36}$/i.test(data.observationId)&&data.payoutCreated===false;
    }
    return Number.isInteger(data.claimed)&&data.claimed>=0&&data.claimed<=5&&data.completed===data.claimed;
   }catch{return false;}
  };
  // Three cost workers plus one tracking worker, never unbounded fan-out.
  // Each cost worker independently caps all provider reads at 64 GETs / 75s.
  const worker=readOptionalEnv("MERCH_TRACKING_WORKER_SECRET");
  const tracking=worker?invoke("merch-tracking-reconcile",worker,{}):Promise.resolve(false);
  while(true){
   const jobs=validBatch(batch);
   if(jobs.length===0||deadline-Date.now()<85000)break;
   jobs.forEach(job=>seen.add(job.order_id));orders+=jobs.length;
   const results=await Promise.all(jobs.map(async(job)=>{
    const outcome=await invoke("stripe-merch-cost-reconcile",service,{order_id:job.order_id}),ok=outcome===true;
    const saved=await bounded(admin.client.rpc(outcome==='history_pending'?"continue_merch_cost_history_refresh":"complete_merch_cost_refresh",
     {p_order_id:job.order_id,p_lease:job.lease,...(outcome==='history_pending'?{}:{p_complete:ok})}));
    return ok&&!saved.error&&saved.data?.stale===false;
   }));
   completed+=results.filter(Boolean).length;
   if(orders>=30||deadline-Date.now()<90000)break;
   const next=await bounded(admin.client.rpc("continue_merch_reconciliation_batch",{p_run_id:runId}));
   if(next.error||!next.data)throw Error("queue_unavailable");
   if(next.data.claimed!==true)break;
   batch=next.data;
  }
  return jsonResponse(200,{claimed:true,orders,completed,health:batch.health,
   budget:{maxOrders:30,maxStripeGetsPerOrder:64,maxStripeGets:1920,deadlineSeconds:100,capacityGuaranteed:false},
   trackingComplete:await tracking,financialAuthority:false});
 }catch{return jsonResponse(503,{error:"reconciliation_incomplete",financialAuthority:false});}
});
