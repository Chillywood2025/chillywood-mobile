import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createAdminClient,jsonResponse,readOptionalEnv} from "../_shared/stripe-connect.ts";
// Bound SDK/body waits as well as provider requests. A timed-out server write
// may still finish; leases and exact tokens make the next invocation safe.
async function bounded<T>(work:PromiseLike<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve(work),new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(Error("deadline")),5000);})]);}
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
// Source-only observer. Never calls reservation, dispatch, reversal or renewal.
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return jsonResponse(405,{error:"method_not_allowed"});
 const service=readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
 if(!service||req.headers.get("Authorization")!==`Bearer ${service}`)return jsonResponse(403,{error:"service_authority_required"});
 const project=readOptionalEnv("SUPABASE_URL"),admin=createAdminClient();
 if(!project||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(project)||!admin.configured)return jsonResponse(503,{error:"observer_not_configured"});
 try{
  const body=await bounded(tinyBody(req));if(body.trim()&&body.trim()!=="{}")return jsonResponse(400,{error:"empty_body_required"});
  const claimed=await bounded(admin.client.rpc("claim_auction_observation_batch"));
  if(claimed.error||!claimed.data)return jsonResponse(503,{error:"queue_unavailable"});
  if(claimed.data.claimed!==true)return jsonResponse(200,{claimed:false,financialAuthority:false});
  const jobs=claimed.data.jobs as {contract_id:string;lane:"event"|"room";lease:string}[];
  if(!Array.isArray(jobs)||jobs.length>3||jobs.some(j=>!["event","room"].includes(j.lane)||!/^[0-9a-f-]{36}$/i.test(j.contract_id)||!/^[0-9a-f-]{36}$/i.test(j.lease)))throw Error("invalid_batch");
  const results=await Promise.all(jobs.map(async(job)=>{
   let complete=false,domainStatus="unknown";
   try{
    const response=await fetch(`${project.replace(/\/$/,"")}/functions/v1/stripe-auction-cost-reconcile`,{method:"POST",redirect:"error",
     headers:{Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify({contract_id:job.contract_id}),signal:AbortSignal.timeout(90000)});
    const data=await response.json();
    if(response.ok&&data&&!data.error&&data.financialAuthority===false&&data.transferCreated===false&&["held","duplicate"].includes(data.status)
     &&((data.status==="duplicate"&&typeof data.observationId==="string"&&/^[0-9a-f-]{36}$/i.test(data.observationId))
      ||(data.status==="held"&&Object.hasOwn(data,"netMinor")&&Array.isArray(data.holdReasons)))){
     const qualified=await bounded(admin.client.rpc(job.lane==="event"?"qualify_auction_event_release_from_domain":"qualify_auction_room_release_from_domain",{p_contract_id:job.contract_id}));
     if(!qualified.error&&["held","qualified_test_only"].includes(qualified.data?.status)){
      domainStatus=qualified.data.status;complete=true;
     }
    }
   }catch{/* Unknown is held; never follow an error with a financial POST. */}
   const saved=await bounded(admin.client.rpc("complete_auction_observation",{p_contract_id:job.contract_id,p_lease:job.lease,p_complete:complete,p_domain_status:domainStatus}));
   return complete&&!saved.error&&saved.data?.stale===false;
  }));
  return jsonResponse(200,{claimed:true,contracts:jobs.length,completed:results.filter(Boolean).length,financialAuthority:false,transferCreated:false});
 }catch{return jsonResponse(503,{error:"observation_incomplete",financialAuthority:false,transferCreated:false});}
});
