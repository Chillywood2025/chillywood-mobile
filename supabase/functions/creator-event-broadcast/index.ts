import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { readExactCurrentSessionAuthority } from '../_shared/exact-subject-authority.ts';
import { runCreatorEventBroadcast } from '../_shared/creator-event-broadcast-producer.ts';
import { createEventBroadcastRuntime, runEventBroadcastDeadlineWorker } from '../_shared/creator-event-broadcast-runtime.ts';

const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-chillywood-platform','Cache-Control':'no-store'};
const json=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers});
const required=(name:string)=>{const value=Deno.env.get(name)?.trim();if(!value)throw new Error('event_broadcast_unavailable');return value;};
const matchesSecret=async(a:string,b:string)=>{
  const bytes=new TextEncoder();const [left,right]=await Promise.all([a,b].map(value=>crypto.subtle.digest('SHA-256',bytes.encode(value))));
  const x=new Uint8Array(left),y=new Uint8Array(right);let different=0;for(let i=0;i<x.length;i++)different|=x[i]^y[i];return different===0;
};
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers});
  if(request.method!=='POST')return json(405,{reason:'method_not_allowed'});
  try{
    const body=await request.json();
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['action','creatorEventId'].includes(key)))return json(400,{reason:'event_broadcast_request_invalid'});
    const authorization=request.headers.get('authorization')??'';
    const serviceKey=required('SUPABASE_SERVICE_ROLE_KEY'),url=required('SUPABASE_URL');
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const runtime=createEventBroadcastRuntime(admin,name=>Deno.env.get(name));
    if(body.action==='worker'){
      if(!await matchesSecret(authorization,`Bearer ${serviceKey}`))return json(403,{reason:'event_broadcast_worker_authority_required'});
      return json(200,await runEventBroadcastDeadlineWorker(admin,runtime));
    }
    if(!['start','refresh','stop'].includes(body.action)||typeof body.creatorEventId!=='string')return json(400,{reason:'event_broadcast_request_invalid'});
    const client=createClient(url,required('SUPABASE_ANON_KEY'),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
    const auth=await client.auth.getUser();if(auth.error||!auth.data.user)return json(401,{reason:'session_authority_not_current'});
    const authority=await readExactCurrentSessionAuthority(client,auth.data.user.id);if(!authority)return json(401,{reason:'session_authority_not_current'});
    return json(200,await runCreatorEventBroadcast(body.action,body.creatorEventId,{userId:authority.userId,sessionId:authority.sessionGeneration},runtime));
  }catch{return json(503,{state:'unavailable',reason:'event_broadcast_unconfirmed',canStart:false,rawHlsUrlReturned:false,fullRoomTokenForSpectators:false});}
});
