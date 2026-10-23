import { createClient } from "npm:@supabase/supabase-js@2";
import {runDeletedContentRetentionWorker} from "../_shared/deleted-content-retention-worker.ts";
import {createRetiredMediaOriginCleanup} from "../_shared/deleted-content-origin.ts";

// No cron. Manual trusted service invocation only; all settings start disabled.
// Media calls are limited to permanently retired, non-reusable proven keys.
Deno.serve(async (req) => {
  const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method!=="POST") return reply(405,{error:"method_not_allowed"});
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const url=Deno.env.get("SUPABASE_URL") ?? "";
  if(!key || !url || req.headers.get("Authorization")!==`Bearer ${key}`) {
    // Keep denial details server-side. Never log credentials, request values,
    // token derivatives, or exceptions; correlation is generated here, not supplied.
    let requestId:string|undefined;
    try {
      requestId=crypto.randomUUID();
      const authorization=req.headers.get("Authorization"),apiKey=req.headers.get("apikey");
      console.warn(JSON.stringify({event:"deleted_content_retention_auth_denied",requestId,
        reason:!key || !url ? "configuration_missing" : "bearer_mismatch",
        serviceRoleKeyConfigured:Boolean(key),supabaseUrlConfigured:Boolean(url),
        authorizationPresent:authorization!==null,
        authorizationMatchesApiKey:Boolean(apiKey) && authorization===`Bearer ${apiKey}`,
        apiKeyMatchesServiceRoleKey:Boolean(apiKey) && Boolean(key) && apiKey===key}));
    } catch {/* Diagnostics must not change the denial or reach worker side effects. */}
    return reply(403,{error:"not_allowed",...(requestId ? {requestId} : {})});
  }
  try {
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
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
