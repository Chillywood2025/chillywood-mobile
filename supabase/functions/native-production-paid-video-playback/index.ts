import { createClient } from "npm:@supabase/supabase-js@2";
import { createNativeProductionPaidVideoRange } from "../_shared/native-production-paid-video-range.ts";
import { createInspectionOriginReader, inspectionOriginConfig } from "../_shared/content-inspection-private-origin.ts";
import { authenticateNativeProduction } from "../_shared/native-production-auth.ts";

// Ordinary production range/precharge transport, independent of every sandbox
// installation and OFF unless explicitly configured and privately qualified.
// Existing origin credentials are read only. No upload/delete/provider mutation.
Deno.serve(createNativeProductionPaidVideoRange({
 enabled:()=>Deno.env.get("NATIVE_PRODUCTION_PLAYBACK_ENABLED")==="true",
 authenticate:async(req,signal)=>{
  const authorization=req.headers.get("Authorization");
  if(!authorization?.startsWith("Bearer "))return null;
  const client=createClient(Deno.env.get("SUPABASE_URL")??"",Deno.env.get("SUPABASE_ANON_KEY")??"",{
   auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization},fetch:(input,init)=>fetch(input,{...init,signal})}});
  return authenticateNativeProduction(req,client);
 },
 rpc:async(name,args,signal)=>{
  const client=createClient(Deno.env.get("SUPABASE_URL")??"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"",{
   auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal})}});
  const result=await client.rpc(name,args);if(result.error)throw Error("authority_unavailable");return result.data;
 },
 origin:(binding,method,signal,headers)=>createInspectionOriginReader(inspectionOriginConfig(name=>Deno.env.get(name)))(binding,method,headers,signal),
}));
