// Exact production entrypoint + real pinned SDK; only loopback HTTP is synthetic.
import { handler } from "./index.ts";
const uuid=(n:number)=>`e0000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const user=uuid(1),session=uuid(2),requestId=uuid(3);
const token=`${btoa(JSON.stringify({alg:"HS256",typ:"JWT"}))}.${btoa(JSON.stringify({sub:user,session_id:session,exp:4102444800}))}.synthetic`;
const check=(v:unknown,message="assertion failed")=>{if(!v)throw Error(message);};
type Mode="ok"|"auth-failed"|"session-mismatch"|"wrong-user"|"rpc-loss"|"forged-result";
async function fixture(mode:Mode,command="offer",payload:Record<string,unknown>={offerId:`scv1_offer_${uuid(4)}`,store:"APP_STORE"}){
 const calls:{path:string;authorization:string|null;apikey:string|null;body:unknown}[]=[];
 const respond=async(req:Request):Promise<Response|null>=>{
  const path=new URL(req.url).pathname,body=req.method==="POST"?await req.json():null;
  calls.push({path,body,authorization:req.headers.get("authorization"),apikey:req.headers.get("apikey")});
  if(path==="/auth/v1/user")return Response.json(mode==="auth-failed"?{message:"invalid token"}:{id:user,email:"synthetic@example.invalid"},{status:mode==="auth-failed"?401:200});
  if(path==="/rest/v1/rpc/wave1_session_authority_readback")return Response.json({authoritative:true,state:"ACTIVE",restoreOnly:false,userId:mode==="wrong-user"?uuid(8):user,accountId:user,sessionGeneration:mode==="session-mismatch"?uuid(9):session});
  if(path==="/rest/v1/rpc/native_store_sandbox_command_v1"||path==="/rest/v1/rpc/native_store_sandbox_reservation_v1"||path==="/rest/v1/rpc/native_store_sandbox_dispatch_v1"){
   if(mode==="rpc-loss")return null;
   const reservation=command==="reserve-recover";
   const dispatch=command.startsWith("dispatch-");
   return Response.json({protocol:reservation?"native-store-sandbox-reservation-v1":"native-store-sandbox-command-v1",command,requestId,actor:{userId:mode==="forged-result"?uuid(8):user,accountId:user,sessionGeneration:session},
    status:reservation?"unknown":"held",data:reservation?{reservation:null,reason:"reservation_unknown"}:dispatch?command==="dispatch-qualification"?{qualification:null,reason:"qualification_unavailable"}:{attempt:null,qualification:null,newlyConsumed:false,reason:"qualification_unavailable"}:{quote:null,reason:"catalog_unavailable"},dispatchAllowed:false,...reservation?{providerQualified:false}:{correlation:"unsupported"}});
  }
  return new Response("unexpected route",{status:500});
 };
 const listener=Deno.listen({hostname:"127.0.0.1",port:0}),connections=new Set<Deno.TcpConn>();
 const accept=(async()=>{try{for await(const conn of listener){connections.add(conn);void(async()=>{try{
  let raw="";const buf=new Uint8Array(8192);let end=-1,length=0;
  while(end<0||raw.length<end+4+length){const n=await conn.read(buf);if(n===null)return;raw+=new TextDecoder().decode(buf.subarray(0,n));end=raw.indexOf("\r\n\r\n");if(end>=0)length=Number(raw.slice(0,end).match(/content-length: *(\d+)/iu)?.[1]??0);}
  const [line,...lines]=raw.slice(0,end).split("\r\n"),[method,path]=line.split(" "),headers=new Headers();for(const line of lines){const i=line.indexOf(":");headers.append(line.slice(0,i),line.slice(i+1).trim());}
  const response=await respond(new Request(`http://127.0.0.1:${listener.addr.port}${path}`,{method,headers,...method==="POST"?{body:raw.slice(end+4,end+4+length)}:{}}));
  if(!response)return; // Close socket without HTTP response: genuine transport loss.
  const body=await response.text(),wire=new TextEncoder().encode(`HTTP/1.1 ${response.status} Test\r\nContent-Type: application/json\r\nContent-Length: ${new TextEncoder().encode(body).length}\r\nConnection: close\r\n\r\n${body}`);
  let offset=0;while(offset<wire.length)offset+=await conn.write(wire.subarray(offset));
 }finally{connections.delete(conn);conn.close();}})();}}catch(error){if(!(error instanceof Deno.errors.BadResource))throw error;}})();
 Deno.env.set("SUPABASE_URL",`http://127.0.0.1:${listener.addr.port}`);Deno.env.set("SUPABASE_ANON_KEY","synthetic-anon");Deno.env.set("SUPABASE_SERVICE_ROLE_KEY","synthetic-service");
 try{
  const response=await handler(new Request("http://127.0.0.1/native-store-sandbox-command-v1",{method:"POST",headers:{authorization:`Bearer ${token}`},body:JSON.stringify({protocol:"native-store-sandbox-command-v1",command,requestId,payload})}));
  return{response:await response.json(),status:response.status,calls};
 }finally{listener.close();for(const conn of connections)conn.close();await accept;Deno.env.delete("SUPABASE_URL");Deno.env.delete("SUPABASE_ANON_KEY");Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");}
}
Deno.test("exact SDK uses caller auth for verification/readback and service auth only for command",async()=>{
 const r=await fixture("ok");check(r.status===200);check(r.calls.length===3);
 for(const c of r.calls.slice(0,2)){check(c.authorization===`Bearer ${token}`);check(c.apikey==="synthetic-anon");}
 const command=r.calls[2];check(command.authorization==="Bearer synthetic-service");check(command.apikey==="synthetic-service");
 check(JSON.stringify(command.body)===JSON.stringify({p_user_id:user,p_session_id:session,p_command:"offer",p_request_id:requestId,p_payload:{offerId:`scv1_offer_${uuid(4)}`,store:"APP_STORE"}}));
 check(r.response.dispatchAllowed===false&&r.response.correlation==="unsupported");
});
for(const mode of ["auth-failed","session-mismatch","wrong-user"] as const)Deno.test(`exact SDK blocks ${mode} before service RPC`,async()=>{const r=await fixture(mode);check(r.status===401);check(r.calls.every(c=>c.apikey!=="synthetic-service"));});
Deno.test("exact endpoint rejects client-authored buyer or service scope",async()=>{const r=await fixture("ok","offer",{offerId:`scv1_offer_${uuid(4)}`,store:"APP_STORE",p_user_id:uuid(8),serviceRole:true});check(r.status===400);check(r.calls.length===2);});
Deno.test("exact endpoint adapts reservation RPC with no dispatch authority",async()=>{const r=await fixture("ok","reserve-recover",{selectionId:`nssv1_selection_${uuid(5)}`});check(r.status===200);check(r.calls[2].path.endsWith("native_store_sandbox_reservation_v1"));check(r.response.status==="unknown"&&r.response.dispatchAllowed===false&&r.response.correlation==="unsupported");});
for(const mode of ["rpc-loss","forged-result"] as const)Deno.test(`exact endpoint keeps ${mode} uncertain without retry`,async()=>{const r=await fixture(mode);check(r.status===503);check(r.response.retryPurchase===false);check(r.calls.length===3);});

for(const command of ["dispatch-qualification","dispatch-consume"] as const)Deno.test(`exact SDK routes ${command} to server-owned qualification RPC without caller authority`,async()=>{
 const payload=command==="dispatch-qualification"?{selectionId:`nssv1_selection_${uuid(5)}`}:{selectionId:`nssv1_selection_${uuid(5)}`,reservationId:`nssv1_reservation_${uuid(6)}`};
 const r=await fixture("ok",command,payload);check(r.status===200);check(r.calls.length===3);const c=r.calls[2];check(c.path.endsWith("native_store_sandbox_dispatch_v1"));check(c.authorization==="Bearer synthetic-service");
 check(JSON.stringify(c.body)===JSON.stringify({p_user_id:user,p_session_id:session,p_command:command,p_request_id:requestId,p_payload:payload}));check(r.response.status==="held"&&r.response.dispatchAllowed===false&&r.response.data.qualification===null);
 const bad=await fixture("ok",command,{...payload,verified:true});check(bad.status===400);check(bad.calls.length===2);
});
