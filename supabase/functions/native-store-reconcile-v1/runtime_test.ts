import {processConfiguredNativeStoreReceiptV1} from "../_shared/native-store-configured-process-v1.ts";
import {handler,exactNativeReconciliationServiceBearer} from "./index.ts";
import {fixture} from "./runtime_fixture.ts";
const check=(v:unknown)=>{if(!v)throw Error("assertion failed");};
const b64=(s:string)=>btoa(s).replace(/=/gu,'').replace(/\+/gu,'-').replace(/\//gu,'_');
const key=`${b64('{"alg":"HS256","typ":"JWT"}')}.${b64('{"role":"service_role","fixture":true}')}.synthetic_signature_not_real`;
async function run(mode:string){
 const f=await fixture(mode==="refund"),calls:{path:string;authorization:string|null;apikey:string|null;body:Record<string,unknown>}[]=[];
 if(mode==="refund"){f.context.raw.intakeEnabled=false;f.context.raw.originalRevisionRevoked=true;f.journal.revoked=true;}
 const server=Deno.serve({hostname:"127.0.0.1",port:0,onListen:()=>{}},async request=>{
  const path=new URL(request.url).pathname,body=await request.json();calls.push({path,body,authorization:request.headers.get("authorization"),apikey:request.headers.get("apikey")});
  if(path.endsWith("native_store_sandbox_effect_candidate_v1"))return Response.json({protocol:"native-store-effect-candidate-v1",rawReceiptId:f.work.rawReceiptId,status:mode==="held"?"held":"candidate",work:mode==="held"?null:f.work,acknowledgementAllowed:false});
  if(path.endsWith("native_store_sandbox_effect_context_v1"))return Response.json(f.context);
  if(path.endsWith("native_store_sandbox_journal_read_v1"))return Response.json(f.journal);
  if(path.endsWith("native_store_sandbox_effect_v1"))return mode==="effect-loss"?Response.json({message:"PRIVATE_DATABASE_ERROR"},{status:500}):Response.json(f.result);
  return new Response("unknown",{status:500});
 });
 const configured={connectionId:f.config.connectionId,connectionRevision:1,projectId:f.config.projectId,appId:f.config.appId,store:f.config.store,environment:f.config.environment,authentication:f.config.authentication,encryption:{keyId:f.config.encryption.keyId,keyBase64:btoa(String.fromCharCode(...f.config.encryption.key))}};
 const newer={...configured,connectionRevision:2,encryption:{keyId:"new-key",keyBase64:btoa(String.fromCharCode(...new Uint8Array(32).fill(18)))}};
 Deno.env.set("SUPABASE_URL",`http://127.0.0.1:${server.addr.port}`);Deno.env.set("SUPABASE_SERVICE_ROLE_KEY",key);
 Deno.env.set("NATIVE_STORE_RECONCILE_ENABLED",mode==="disabled"?"false":"true");
 Deno.env.set("NATIVE_STORE_CONNECTIONS_JSON",JSON.stringify({connections:mode==="missing-original"?[newer]:[newer,configured]}));
 try{
  if(mode==="setup-budget"){
   const original=Deno.env.get;let rejected=false;
   Deno.env.get=(name:string)=>{if(name==="NATIVE_STORE_CONNECTIONS_JSON")Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,110);return original(name);};
   try{await processConfiguredNativeStoreReceiptV1(f.work.rawReceiptId,70);}catch{rejected=true;}finally{Deno.env.get=original;}
   check(rejected);return{status:503,body:{},calls,f};
  }
  const response=await handler(new Request("http://127.0.0.1/native-store-reconcile-v1",{method:"POST",headers:{authorization:mode==="unauthorized"?"Bearer not-service":`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify({rawReceiptId:f.work.rawReceiptId,...mode==="injected"?{claimId:f.work.claimId}:{}})}));
  return{status:response.status,body:await response.json(),calls,f};
 }finally{await server.shutdown();for(const name of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","NATIVE_STORE_RECONCILE_ENABLED","NATIVE_STORE_CONNECTIONS_JSON"])Deno.env.delete(name);}
}
for(const mode of ["disabled","unauthorized","injected"])Deno.test(`exact endpoint ${mode} makes no admin RPC`,async()=>{const r=await run(mode);check(r.status>=400);check(r.calls.length===0);});
Deno.test("real pinned SDK routes encrypted original receipt through four exact service RPCs without identity leakage",async()=>{
 const r=await run("purchase");check(r.status===200&&r.body.status==="processed");check(r.calls.length===4);
 for(const c of r.calls){check(c.authorization===`Bearer ${key}`);check(c.apikey===key);}
 check(JSON.stringify(r.calls[0].body)===JSON.stringify({p_raw_receipt_id:r.f.work.rawReceiptId}));
 check(JSON.stringify(r.calls[2].body)===JSON.stringify({p_receipt_id:r.f.work.rawReceiptId}));
 const write=r.calls[3].body;check(write.p_claim_id===r.f.work.claimId&&write.p_protocol_id===r.f.work.protocolId&&write.p_protocol_revision===1);
 const projection=write.p_projection as Record<string,unknown>;check(projection.kind==="purchase"&&projection.amountMinor===199);
 check(r.body.acknowledgementAllowed===false&&r.body.retryAllowed===false);check(!JSON.stringify(r.body).includes("synthetic-tx"));check(!Object.hasOwn(r.body,"nativeConsumerEffect"));
});
Deno.test("original revoked/off refund still uses exact retained key instead of latest revision",async()=>{const r=await run("refund");check(r.status===200&&r.body.status==="processed");check(r.calls.length===4);check((r.calls[3].body.p_projection as Record<string,unknown>).kind==="refund");});
for(const mode of ["held","missing-original"])Deno.test(`exact endpoint ${mode} never applies effects or selects latest key`,async()=>{const r=await run(mode);check(r.status===200&&r.body.status==="held");check(!r.calls.some(c=>c.path.endsWith("native_store_sandbox_effect_v1")));});
Deno.test("effect transport failure stays unknown and is never retried or acknowledged",async()=>{const r=await run("effect-loss");check(r.status===503&&r.body.status==="unknown");check(r.calls.filter(c=>c.path.endsWith("native_store_sandbox_effect_v1")).length===1);check(!JSON.stringify(r.body).includes("PRIVATE_DATABASE_ERROR"));check(r.body.retryAllowed===false&&r.body.acknowledgementAllowed===false);});
Deno.test("service authority requires exact bounded configured legacy bearer, not role claims or new secret fallback",()=>{for(const configured of [undefined,"sb_secret_not_supported", "short"]){check(!exactNativeReconciliationServiceBearer(new Request("http://local.invalid",{headers:{authorization:`Bearer ${configured}`}}),configured));}check(!exactNativeReconciliationServiceBearer(new Request("http://local.invalid",{headers:{authorization:`Bearer ${key}x`}}),key));check(exactNativeReconciliationServiceBearer(new Request("http://local.invalid",{headers:{authorization:`Bearer ${key}`}}),key));});

Deno.test("synchronous configuration work cannot restart an expired worker budget",async()=>{const r=await run("setup-budget");check(r.status===503&&r.calls.length===0);});
