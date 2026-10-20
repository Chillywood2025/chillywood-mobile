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
  if(!key || !url || req.headers.get("Authorization")!==`Bearer ${key}`) return reply(403,{error:"not_allowed"});
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
