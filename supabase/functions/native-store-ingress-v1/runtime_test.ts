import {fixture} from "../native-store-reconcile-v1/runtime_fixture.ts";
import {handler} from "./index.ts";
const check=(v:unknown)=>{if(!v)throw Error("assertion failed");};
const id="a0000000-0000-4000-8000-000000000001",secret="synthetic-not-real-provider-secret-".repeat(2),service="synthetic-service-only-fixture";
async function run(mode:string){
 const calls:{path:string;authorization:string|null;apikey:string|null;body:Record<string,unknown>}[]=[];
 const server=Deno.serve({hostname:"127.0.0.1",port:0,onListen:()=>{}},async request=>{
  const path=new URL(request.url).pathname,body=await request.json();calls.push({path,body,authorization:request.headers.get("authorization"),apikey:request.headers.get("apikey")});
  const intake=body.p_intake,envelope=intake.envelope;
  if(mode==="loss")return Response.json({message:"PRIVATE_STORAGE_FAILURE"},{status:500});
  return Response.json({protocol:"native-store-sandbox-journal-result-v1",receiptId:"a0000000-0000-4000-8000-000000000003",connectionId:intake.connectionId,connectionRevision:intake.connectionRevision,projectId:intake.projectId,rawSha256:envelope.rawSha256,status:mode==="duplicate"?"duplicate":mode==="conflict"?"conflict":"recorded",durable:true,correlation:"unsupported",acknowledgementAllowed:mode==="forged",dispatchAllowed:false,grantsAccess:false,financialAuthority:false});
 });
 const config={connectionId:id,connectionRevision:1,projectId:"synthetic-project",appId:"synthetic-app",store:"APP_STORE",environment:"SANDBOX",authentication:{method:"shared_secret",keyVersion:"synthetic-v1",secret},encryption:{keyId:"synthetic-key",keyBase64:btoa(String.fromCharCode(...new Uint8Array(32).fill(5)))}};
 Deno.env.set("SUPABASE_URL",`http://127.0.0.1:${server.addr.port}`);Deno.env.set("SUPABASE_SERVICE_ROLE_KEY",service);Deno.env.set("NATIVE_STORE_INGRESS_ENABLED",mode==="disabled"?"false":"true");Deno.env.set("NATIVE_STORE_CONNECTIONS_JSON",JSON.stringify({connections:[config]}));Deno.env.set("NATIVE_STORE_INGRESS_CONNECTION_ID",id);Deno.env.set("NATIVE_STORE_INGRESS_CONNECTION_REVISION",mode==="unknown-revision"?"2":"1");
 const raw=mode==="malformed"?'{bad json':JSON.stringify({event:{id:"synthetic-event",type:"NON_RENEWING_PURCHASE",app_id:config.appId,store:"APP_STORE",environment:mode==="production"?"PRODUCTION":"SANDBOX",app_user_id:"synthetic-user",transaction_id:"synthetic-private-transaction",product_id:"synthetic-product"}});
 try{const response=await handler(new Request("http://127.0.0.1/native-store-ingress-v1",{method:"POST",headers:{authorization:mode==="unauthorized"?"incorrect":secret},body:raw}));return{status:response.status,body:await response.json(),calls,raw};}
 finally{await server.shutdown();for(const name of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","NATIVE_STORE_INGRESS_ENABLED","NATIVE_STORE_CONNECTIONS_JSON","NATIVE_STORE_INGRESS_CONNECTION_ID","NATIVE_STORE_INGRESS_CONNECTION_REVISION"])Deno.env.delete(name);}
}
for(const mode of ["disabled","unauthorized","unknown-revision"])Deno.test(`exact ingress ${mode} never reaches journal RPC`,async()=>{const r=await run(mode);check(r.status>=400);check(r.calls.length===0);});
for(const mode of ["recorded","duplicate","conflict","production","malformed"])Deno.test(`exact ingress ${mode} retains original bytes once and never acknowledges provider delivery`,async()=>{
 const r=await run(mode);check(r.status===503&&r.body.durable===true&&r.body.acknowledgementAllowed===false);check(r.calls.length===1);const call=r.calls[0];check(call.path==="/rest/v1/rpc/native_store_sandbox_journal_v1"&&call.authorization===`Bearer ${service}`&&call.apikey===service);
 const intake=call.body.p_intake as {envelope:{rawSha256:string};connectionId:string;connectionRevision:number;disposition:string};
 const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(r.raw)))].map(v=>v.toString(16).padStart(2,"0")).join("");check(intake.envelope.rawSha256===digest);check(intake.connectionId===id&&intake.connectionRevision===1);if(["production","malformed"].includes(mode))check(intake.disposition==="reconciliation_required");check(!JSON.stringify(r.body).includes("synthetic-private-transaction"));
});
for(const mode of ["loss","forged"])Deno.test(`exact ingress ${mode} remains non-success and never repeats journal write`,async()=>{const r=await run(mode);check(r.status===503&&r.calls.length===1);check(r.body.durable===undefined&&r.body.acknowledgementAllowed===false);check(!JSON.stringify(r.body).includes("PRIVATE_STORAGE_FAILURE"));});
for(const mode of ['purchase','refund','held','effect-loss','duplicate','conflict','worker-disabled'])Deno.test(`exact ingress inline ${mode} preserves durable parent and consumer boundaries`,async()=>{
 const f=await fixture(mode==='refund'),calls:string[]=[];
 const server=Deno.serve({hostname:'127.0.0.1',port:0,onListen:()=>{}},async request=>{
  const path=new URL(request.url).pathname,body=await request.json();calls.push(path);
  if(path.endsWith('native_store_sandbox_journal_v1')){
   const intake=body.p_intake;check(intake.envelope.rawSha256===f.journal.receipt.raw_sha256);
   return Response.json({protocol:'native-store-sandbox-journal-result-v1',receiptId:f.work.rawReceiptId,connectionId:intake.connectionId,connectionRevision:intake.connectionRevision,projectId:intake.projectId,rawSha256:intake.envelope.rawSha256,status:mode==='duplicate'?'duplicate':mode==='conflict'?'conflict':'recorded',durable:true,correlation:'unsupported',acknowledgementAllowed:false,dispatchAllowed:false,grantsAccess:false,financialAuthority:false});
  }
  if(path.endsWith('native_store_sandbox_effect_candidate_v1')){check(body.p_raw_receipt_id===f.work.rawReceiptId);return Response.json({protocol:'native-store-effect-candidate-v1',rawReceiptId:f.work.rawReceiptId,status:mode==='held'?'held':'candidate',work:mode==='held'?null:f.work,acknowledgementAllowed:false});}
  if(path.endsWith('native_store_sandbox_effect_context_v1'))return Response.json(f.context);
  if(path.endsWith('native_store_sandbox_journal_read_v1'))return Response.json(f.journal);
  if(path.endsWith('native_store_sandbox_effect_v1')){check(body.p_raw_receipt_id===f.work.rawReceiptId);check(body.p_projection.kind===(mode==='refund'?'refund':'purchase'));return mode==='effect-loss'?Response.json({message:'PRIVATE_APPLY_FAILURE'},{status:500}):Response.json(f.result);}
  return new Response('unknown',{status:500});
 });
 const configured={connectionId:f.config.connectionId,connectionRevision:1,projectId:f.config.projectId,appId:f.config.appId,store:f.config.store,environment:'SANDBOX',authentication:f.config.authentication,encryption:{keyId:f.config.encryption.keyId,keyBase64:btoa(String.fromCharCode(...f.config.encryption.key))}};
 Deno.env.set('SUPABASE_URL',`http://127.0.0.1:${server.addr.port}`);Deno.env.set('SUPABASE_SERVICE_ROLE_KEY',service);Deno.env.set('NATIVE_STORE_INGRESS_ENABLED','true');Deno.env.set('NATIVE_STORE_RECONCILE_ENABLED',mode==='worker-disabled'?'false':'true');Deno.env.set('NATIVE_STORE_CONNECTIONS_JSON',JSON.stringify({connections:[configured]}));Deno.env.set('NATIVE_STORE_INGRESS_CONNECTION_ID',f.config.connectionId);Deno.env.set('NATIVE_STORE_INGRESS_CONNECTION_REVISION','1');
 try{
  const response=await handler(new Request('http://127.0.0.1/native-store-ingress-v1',{method:'POST',headers:{authorization:f.config.authentication.secret},body:JSON.stringify({api_version:'1.0',event:f.event})})),body=await response.json();
  check(response.status===503&&body.durable===true&&body.acknowledgementAllowed===false&&body.grantsAccess===false);
  check(calls[0]==='/rest/v1/rpc/native_store_sandbox_journal_v1');check(calls.length===(['conflict','worker-disabled'].includes(mode)?1:mode==='held'?2:5));
  check(calls.filter(x=>x.endsWith('native_store_sandbox_effect_v1')).length===(['conflict','worker-disabled','held'].includes(mode)?0:1));
  check(!JSON.stringify(body).includes('synthetic-tx')&&!JSON.stringify(body).includes('PRIVATE_APPLY_FAILURE'));
 }finally{await server.shutdown();for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NATIVE_STORE_INGRESS_ENABLED','NATIVE_STORE_RECONCILE_ENABLED','NATIVE_STORE_CONNECTIONS_JSON','NATIVE_STORE_INGRESS_CONNECTION_ID','NATIVE_STORE_INGRESS_CONNECTION_REVISION'])Deno.env.delete(name);}
});
