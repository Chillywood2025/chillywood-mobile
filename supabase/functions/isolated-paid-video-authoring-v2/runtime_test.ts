// Exact production entrypoints/runtime and pinned SDK. Loopback facts only.
import {handler as disabledAuthoring} from './index.ts';
import {handler as disabledUpload} from '../isolated-paid-video-upload-v2/index.ts';
import {paidVideoRuntime} from '../_shared/isolated-paid-video-runtime.ts';
const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=id(1),session=id(2),requestId=id(3),upload='scpv_upload_'+id(4);
const configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0';
const token=`${btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))}.${btoa(JSON.stringify({sub:user,session_id:session,role:'authenticated',exp:4102444800}))}.synthetic`;
const authorRequest=(extra={})=>new Request('http://127.0.0.1/isolated-paid-video-authoring-v2',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
 body:JSON.stringify({protocol:'isolated-paid-video-v2',command:'offer.publish',requestId,expectedSessionId:session,configurationDigest:configuration,
  payload:{uploadId:upload,expectedRevision:1,amountMinor:99,currency:'usd',...extra}})});
const uploadRequest=()=>new Request(`http://127.0.0.1/isolated-paid-video-upload-v2/${upload}`,{headers:{authorization:`Bearer ${token}`,
 'x-chillywood-auth-session':session,'x-chillywood-request-id':requestId,'x-chillywood-native-configuration':configuration}});
const resource='scv1_resource_'+id(10),grant='scv1_grant_'+id(11),asset='scv1_asset_'+id(12),incarnation=id(13);
const rangeRequest=()=>new Request(`http://127.0.0.1/isolated-paid-video-range-v1/${resource}/${grant}`,{headers:{authorization:`Bearer ${token}`,
 'x-chillywood-auth-session':session,range:'bytes=0-0'}});
Deno.test('both exact entrypoints stay unavailable without explicit server configuration',async()=>{
 check((await disabledAuthoring(authorRequest())).status===503,'authoring default off');
 check((await disabledUpload(uploadRequest())).status===503,'upload default off');
});
type Mode='ok'|'auth-failed'|'session-mismatch'|'rpc-error'|'forged-result';
async function fixture(kind:'authoring'|'upload'|'range',mode:Mode,extra={},overrides:Record<string,string>={}){
 const calls:{path:string;authorization:string|null;apikey:string|null;body:Record<string,unknown>|null}[]=[];
 const originCalls:string[]=[];
 const server=Deno.serve({hostname:'127.0.0.1',port:0,onListen:()=>{}},async req=>{
  const path=new URL(req.url).pathname,body=req.method==='POST'?await req.json():null;
  calls.push({path,body,authorization:req.headers.get('authorization'),apikey:req.headers.get('apikey')});
  if(path==='/auth/v1/user')return Response.json(mode==='auth-failed'?{message:'invalid token'}:{id:user,email:'synthetic@example.invalid'},{status:mode==='auth-failed'?401:200});
  if(path==='/rest/v1/rpc/wave1_session_authority_readback')return Response.json({authoritative:true,state:'ACTIVE',restoreOnly:false,userId:user,accountId:user,sessionGeneration:mode==='session-mismatch'?id(9):session});
  if(mode==='rpc-error')return new Response('synthetic unavailable',{status:503});
  if(path==='/rest/v1/rpc/isolated_paid_video_v2')return Response.json({protocol:'isolated-paid-video-v2',command:'offer.publish',requestId,configurationDigest:configuration,
   capabilityExpiresAtMs:Date.now()+4000,actor:{userId:mode==='forged-result'?id(9):user,accountId:user,sessionGeneration:session},status:'held',data:{reason:'native_catalog_unavailable'}});
  if(path==='/rest/v1/rpc/isolated_paid_video_probe_v2')return Response.json({protocol:'scpv-object-receipt-v2',state:'recorded',uploadId:upload,userId:mode==='forged-result'?id(9):user,
   originalSessionId:session,originalConfigurationDigest:configuration,requestId,transferId:id(5),incarnation:id(6),sha256:'a'.repeat(64),byteLength:3,objectVersion:'synthetic-version'});
  if(path==='/rest/v1/rpc/isolated_paid_video_gateway_access_v2')return Response.json({protocol:'scpv-current-access-gateway-v2',actor:{userId:user,sessionGeneration:session},
   resourceId:resource,grantId:grant,receiptId:'scv1_receipt_'+id(14),originalTransactionId:'synthetic-test-store-transaction',customerId:'synthetic-test-store-customer',projectId:'synthetic-test-store-project',validUntilMs:Date.now()+4000,
   object:{provider:'s3',bucket:'synthetic-private-media',routeId:id(7),objectKey:`sandbox-commerce-v1/${user}/${resource}/${asset}/${incarnation}.mp4`,incarnation,expectedSha256:'a'.repeat(64),expectedByteLength:3,objectVersion:'synthetic-version'},
   media:{assetId:asset,incarnation,sha256:'a'.repeat(64),byteLength:3,resourceRevision:1,profile:'scpv-mp4-h264-aac-v1'}});
  return new Response('unexpected route',{status:500});
 });
 const values:Record<string,string>={SUPABASE_URL:`http://127.0.0.1:${server.addr.port}`,SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',
  PAID_VIDEO_GATEWAY_V2_ENABLED:'true',PAID_VIDEO_S3_ROUTE_ID:id(7),PAID_VIDEO_S3_BUCKET:'synthetic-private-media',PAID_VIDEO_S3_REGION:'us-east-1',
  PAID_VIDEO_S3_ACCESS_KEY_ID:'A'.repeat(20),PAID_VIDEO_S3_SECRET_ACCESS_KEY:'synthetic-not-a-key-'.repeat(3),PAID_VIDEO_UPLOAD_VERIFIER_ID:id(8),PAID_VIDEO_UPLOAD_VERIFIER_KEY_HEX:'b'.repeat(64),...overrides};
 for(const [key,value]of Object.entries(values))Deno.env.set(key,value);
 const realFetch=globalThis.fetch;
 if(kind==='range')globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.hostname==='127.0.0.1')return realFetch(input,init);
  // Synthetic origin responses only. The pinned runtime still has no external
  // network permission; exercise the real SigV4/VersionId/range adapter locally.
  check(url.hostname==='synthetic-private-media.s3.us-east-1.amazonaws.com'&&url.searchParams.get('versionId')==='synthetic-version','fixed S3 origin and exact version');
  check(url.pathname===`/sandbox-commerce-v1/${user}/${resource}/${asset}/${incarnation}.mp4`,'exact original object');
  const headers=new Headers(init?.headers),method=init?.method??'GET';originCalls.push(method);
  check(headers.get('authorization')?.startsWith('AWS4-HMAC-SHA256 '),'real signed S3 transport');
  const responseHeaders={'content-type':'video/mp4','x-amz-version-id':'synthetic-version',etag:'"synthetic-etag"'};
  if(method==='HEAD')return new Response(null,{status:200,headers:{...responseHeaders,'content-length':'3'}});
  check(method==='GET'&&headers.get('range')==='bytes=0-0'&&headers.get('if-match')==='"synthetic-etag"','conditional bounded original read');
  return new Response(Uint8Array.of(7),{status:206,headers:{...responseHeaders,'content-length':'1','content-range':'bytes 0-0/3'}});
 };
 try{
  const handler=paidVideoRuntime(kind),response=await handler(kind==='authoring'?authorRequest(extra):kind==='range'?rangeRequest():uploadRequest());
  return {status:response.status,value:kind==='range'&&response.status===206?new Uint8Array(await response.arrayBuffer()):await response.json(),headers:response.headers,calls,originCalls};
 }finally{globalThis.fetch=realFetch;await server.shutdown();for(const key of Object.keys(values))Deno.env.delete(key);}
}
Deno.test('normal authoring uses caller JWT and exact configuration, not service or client-selected product authority',async()=>{
 const r=await fixture('authoring','ok');check(r.status===200&&r.value.data.reason==='native_catalog_unavailable','native held envelope');check(r.calls.length===3,'one auth/readback/command');
 for(const c of r.calls)check(c.authorization===`Bearer ${token}`&&c.apikey==='synthetic-anon','caller-scoped authoring RPC');
 const p=r.calls[2].body;check(p?.p_configuration_digest===configuration&&p.p_expected_account_id===user&&p.p_expected_session_generation===session,'exact RPC binding');
 const bad=await fixture('authoring','ok',{wireProductId:'caller-product'});check(bad.status===400&&bad.calls.length===2,'unknown client product rejected before command');
});
Deno.test('normal upload recovery authenticates caller then uses only fixed service probe, with no origin access',async()=>{
 const r=await fixture('upload','ok');check(r.status===200&&r.value.state==='recorded','recorded object receipt');check(r.calls.length===3,'one auth/readback/probe');
 for(const c of r.calls.slice(0,2))check(c.authorization===`Bearer ${token}`&&c.apikey==='synthetic-anon','caller authentication');
 const probe=r.calls[2];check(probe.path.endsWith('isolated_paid_video_probe_v2')&&probe.authorization==='Bearer synthetic-service'&&probe.apikey==='synthetic-service','server-only fixed probe');
 check(probe.body?.p_user_id===user&&probe.body.p_session_id===session&&probe.body.p_configuration_digest===configuration,'bound user/session/mode');
});
for(const kind of ['authoring','upload']as const)for(const mode of ['auth-failed','session-mismatch']as const)Deno.test(`${kind} refuses ${mode} before command or service authority`,async()=>{
 const r=await fixture(kind,mode);check(r.status===401,'auth rejection');check(r.calls.every(c=>!c.path.includes('isolated_paid_video_')),'no privileged RPC');
});
for(const kind of ['authoring','upload']as const)for(const mode of ['rpc-error','forged-result']as const)Deno.test(`${kind} holds ${mode} without retry or storage fallback`,async()=>{
 const r=await fixture(kind,mode);check(r.status===503&&r.calls.length===3,'single failed RPC, no retry');
 if(kind==='authoring')check(r.value.status==='unknown','dispatched mutation remains uncertain');
});
Deno.test('invalid or unavailable R2 mode cannot fall back to the configured S3 upload route',async()=>{
 for(const overrides of [
  {PAID_VIDEO_STORAGE_MODE:'unrecognized'},
  {PAID_VIDEO_STORAGE_MODE:'r2-native-v1',PAID_VIDEO_R2_GATEWAY_V1_ENABLED:'false'},
  {PAID_VIDEO_STORAGE_MODE:'r2-native-v1',PAID_VIDEO_R2_GATEWAY_V1_ENABLED:'true'},
 ]as Record<string,string>[]){const r=await fixture('upload','ok',{},overrides);check(r.status===503&&r.calls.length===0,'no authentication, RPC or origin before configured route');}
});
Deno.test('Test Store range preserves its exact S3 handler when native R2 mode is enabled or held',async()=>{
 for(const enabled of ['true','false']){
  const r=await fixture('range','ok',{}, {PAID_VIDEO_STORAGE_MODE:'r2-native-v1',PAID_VIDEO_R2_GATEWAY_V1_ENABLED:enabled});
  check(r.status===206&&r.value.length===1&&r.value[0]===7,'successful Test Store S3 byte range despite R2 mode');
  check(r.headers.get('content-range')==='bytes 0-0/3'&&r.headers.get('x-chillywood-media-protocol')==='scpv-range-metadata-v2','unchanged public metadata');
  check(r.originCalls.join(',')==='HEAD,GET','one version-pinned S3 read');
  const access=r.calls.filter(c=>c.path==='/rest/v1/rpc/isolated_paid_video_gateway_access_v2');
  check(access.length===2&&r.calls.length===4,'current Test Store access checked before and after origin');
  check(access.every(c=>c.authorization==='Bearer synthetic-service'&&c.body?.p_user_id===user&&c.body?.p_session_id===session),'fixed scoped Test Store authority');
 }
});
