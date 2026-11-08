import { authenticateRequest,createAuthClient,createAdminClient } from "../_shared/stripe-connect.ts";
import { readVerifiedSupabaseSessionGeneration } from "../_shared/livekit-session-generation.ts";
import { createNativeStoreSandboxCommandHandlerV1 } from "../_shared/native-store-sandbox-command-v1.ts";
export const handler=createNativeStoreSandboxCommandHandlerV1({
 authenticate:async request=>{
  const authorization=request.headers.get("authorization");if(!authorization||authorization.length>8192)return null;
  const {supabaseUrl,supabaseAnonKey}=createAuthClient();
  const verified=await authenticateRequest(new Request(request.url,{method:request.method,headers:{authorization}}),supabaseUrl,supabaseAnonKey);
  if(!("user" in verified))return null;
  const session=readVerifiedSupabaseSessionGeneration(authorization);
  return session&&session===verified.user.sessionGeneration?{userId:verified.user.id,accountId:verified.user.id,sessionGeneration:session}:null;
 },
 execute:async({actor,request})=>{
  const admin=createAdminClient();if(!admin.configured)throw Error("native_store_backend_unavailable");
  const {data,error}=await admin.client.rpc("native_store_sandbox_command_v1",{p_user_id:actor.userId,p_session_id:actor.sessionGeneration,
   p_command:request.command,p_request_id:request.requestId,p_payload:request.payload});
  if(error)throw Error("native_store_preparation_uncertain");return data;
 },
});
if(import.meta.main)Deno.serve(handler);
