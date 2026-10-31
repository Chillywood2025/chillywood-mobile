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
import {observeApprovedAuctionQualification} from "../_shared/auction-qualification-observation.ts";
import {preflightAuctionTestTransfer,dispatchPreflightedAuctionTestTransfer,reconcileAuctionTestTransfer,type AuctionTransferOperation} from "../_shared/stripe-auction-transfer.ts";

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return jsonResponse(405,{error:"method_not_allowed"});
 const service=readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
 if(!service||req.headers.get("Authorization")!==`Bearer ${service}`)return jsonResponse(403,{error:"service_authority_required"});
 const project=readOptionalEnv("SUPABASE_URL"),key=readOptionalEnv("STRIPE_AUCTION_PLATFORM_TEST_KEY"),account=readOptionalEnv("STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID"),admin=createAdminClient();
 if(!project||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(project)||!key||!account||!admin.configured)return jsonResponse(503,{error:"automation_not_configured"});
 const deadline=AbortSignal.timeout(110000);
 const transport:typeof fetch=(url,options)=>fetch(url,{...options,signal:AbortSignal.any([deadline,...(options?.signal?[options.signal]:[])])});
 const rpc=async(name:string,args?:Record<string,unknown>)=>{if(deadline.aborted)throw Error("deadline");const result=await bounded(admin.client.rpc(name,args));if(result.error||!result.data)throw Error("rpc_incomplete");return result.data;};
 try{
  const body=await bounded(tinyBody(req));if(body.trim()&&body.trim()!=="{}")return jsonResponse(400,{error:"empty_body_required"});
  const jobs=await rpc("claim_auction_automation_batch");if(!Array.isArray(jobs)||jobs.length>3)throw Error("batch_invalid");
  const results=await Promise.all(jobs.map(async(job)=>{
   let success=false;
   try{
    if(job.platform_account_id!==account||!/^[0-9a-f-]{36}$/i.test(job.lease)||!/^[0-9a-f-]{36}$/i.test(job.contract_id))throw Error("scope_mismatch");
    if(job.operation_id){
     // Revocation/disabled dispatch does not erase an in-flight obligation.
     // This branch has no route back to POST, even for an empty provider list.
     const operation=await rpc("read_auction_test_transfer_operation",{p_operation_id:job.operation_id});
     if(operation.contract_id!==job.contract_id)throw Error("operation_mismatch");
     const evidence=await reconcileAuctionTestTransfer(operation as AuctionTransferOperation,key,account,transport);
     await rpc("record_auction_test_transfer_result",{p_operation_id:job.operation_id,p_evidence:evidence});success=true;
    }else{
     const scope={platform_account_id:job.platform_account_id,recipient_account_id:job.recipient_account_id,platform_product_id:job.platform_product_id};
     const facts=await observeApprovedAuctionQualification(scope,key,transport);
     await rpc("record_auction_automation_qualification",{p_lease:job.lease,p_facts:facts});
     const response=await transport(`${project.replace(/\/$/,"")}/functions/v1/stripe-auction-cost-reconcile`,{method:"POST",redirect:"error",headers:{Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify({contract_id:job.contract_id}),signal:AbortSignal.timeout(60000)});
     const cost=await response.json();if(!response.ok||cost?.error||cost?.financialAuthority!==false||cost?.transferCreated!==false||!["held","duplicate"].includes(cost.status))throw Error("cost_unknown");
     if(job.dispatch_enabled===true){
      const context=await rpc("get_auction_automation_preflight",{p_lease:job.lease});
      if(context.status==="preflight_required"){
       if(context.contract_id!==job.contract_id)throw Error("preflight_scope_changed");
       const ready=await preflightAuctionTestTransfer(context as AuctionTransferOperation,key,account,transport);
       const operation=await rpc("claim_auction_automation_dispatch",{p_lease:job.lease,p_facts:{...ready,allocation_id:context.allocation_id}});
       if(operation.dispatchAuthorized===true){
        if(deadline.aborted||operation.contract_id!==job.contract_id)throw Error("dispatch_interrupted");
        // Sole permit has committed. ANY failure from here is GET-only recovery.
        const evidence=await dispatchPreflightedAuctionTestTransfer(operation as AuctionTransferOperation,key,account,transport);
        await rpc("record_auction_test_transfer_result",{p_operation_id:operation.id,p_evidence:evidence});
       }
      }
     }
     success=true;
    }
   }catch{/* Unknown facts/results remain held; no blind dispatch retry. */}
   try{await rpc("complete_auction_automation_job",{p_lease:job.lease,p_success:success});}catch{/* Expired lease safely retries observation only. */}
   return success;
  }));
  return jsonResponse(200,{processed:jobs.length,completed:results.filter(Boolean).length,environment:"test",bankPayoutCreated:false});
 }catch{return jsonResponse(503,{error:"automation_incomplete",environment:"test",bankPayoutCreated:false});}
});
