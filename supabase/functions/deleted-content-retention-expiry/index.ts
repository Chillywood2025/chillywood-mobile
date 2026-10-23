import { createClient } from "npm:@supabase/supabase-js@2";
import {timingSafeEqual} from "node:crypto";
import {runDeletedContentRetentionWorker} from "../_shared/deleted-content-retention-worker.ts";
import {createRetiredMediaOriginCleanup} from "../_shared/deleted-content-origin.ts";

const projectUrl="https://bmkkhihfbmsnnmcqkoly.supabase.co";

// No cron. Manual trusted service invocation only; all settings start disabled.
// Media calls are limited to permanently retired, non-reusable proven keys.
Deno.serve(async (req) => {
  const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method!=="POST") return reply(405,{error:"method_not_allowed"});
  // Pin the owner-verified canonical key, not the differing injected runtime key.
  // Configuration is read per request; missing/invalid pins never enable fallback.
  let key:string|undefined;
  let reason="configuration_invalid";
  try {
    const verifier=Deno.env.get("RETENTION_WORKER_SERVICE_KEY_SHA256") ?? "";
    const url=Deno.env.get("SUPABASE_URL") ?? "";
    if(url===projectUrl && /^[a-f0-9]{64}$/.test(verifier)) {
      reason="bearer_mismatch";
      const authorization=req.headers.get("Authorization") ?? "";
      const bearer=authorization.length<=4103 ? /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization) : null;
      if(bearer) {
        const expected=Uint8Array.from({length:32},(_,i)=>parseInt(verifier.slice(i*2,i*2+2),16));
        const actual=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer[1])));
        if(timingSafeEqual(actual,expected)) key=bearer[1];
      }
    }
  } catch {reason="verification_failed";}
  if(!key) {
    // Keep denial details server-side. Never log credentials, request values,
    // token derivatives, or exceptions; correlation is generated here, not supplied.
    let requestId:string|undefined;
    try {
      requestId=crypto.randomUUID();
      console.warn(JSON.stringify({event:"deleted_content_retention_auth_denied",requestId,reason}));
    } catch {/* Diagnostics must not change the denial or reach worker side effects. */}
    return reply(403,{error:"not_allowed",...(requestId ? {requestId} : {})});
  }
  try {
    const client=createClient(projectUrl,key,{
      auth:{persistSession:false,autoRefreshToken:false},
      global:{fetch:async(input,init)=>{
        const target=new URL(input instanceof Request ? input.url : String(input));
        if(target.origin!==projectUrl || target.username || target.password) throw Error("retention_database_target_invalid");
        // Never forward the verified credential through a redirect or another origin.
        return fetch(input,{...init,redirect:"error"});
      }},
    });
    // Lazy origin construction: disabled media does not require provider setup.
    let cleanup:ReturnType<typeof createRetiredMediaOriginCleanup>|undefined;
    const result=await runDeletedContentRetentionWorker(async (name,args)=>await client.rpc(name,args),(binding,method)=>{
      cleanup??=createRetiredMediaOriginCleanup(name=>Deno.env.get(name));
      return cleanup(binding,method);
    });
    return reply(200,result);
  } catch {
    return reply(503,{error:"retention_work_failed",permanentPhysicalAbsenceGuaranteed:false});
  }
});
