import { handler } from './index.ts';
import { createNativeStorePaidVideoRangeHandlerV1 } from '../_shared/native-store-paid-video-range-v1.ts';
const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=id(1),session=id(2),resource='scv1_resource_'+id(3),grant='scv1_grant_'+id(4),asset='scv1_asset_'+id(5),incarnation=id(6);
const req=()=>new Request(`https://fixture.invalid/native-store-paid-video-range-v1/${resource}/${grant}`,{headers:{'X-Chillywood-Auth-Session':session,Range:'bytes=0-0'}});
Deno.test('exact pinned native endpoint defaults off',async()=>{check((await handler(req())).status===503,'endpoint must default off');});
for(const mode of ['allow','wrong-actor','post-origin-hold','legacy-protocol'])Deno.test(`pinned native range source ${mode}`,async()=>{
 let calls=0,reads=0;
 const access=createNativeStorePaidVideoRangeHandlerV1({authenticate:async()=>({actor:{userId:user,sessionId:session,expiresAtMs:Date.now()+60000},authorization:'Bearer synthetic'}),rpc:async(name,parameters)=>{
  check(name==='native_store_paid_video_access_v1'&&parameters.p_user_id===user,'fixed authenticated RPC');calls++;
  if(mode==='post-origin-hold'&&calls===2)throw Error('synthetic hold');
  return {protocol:mode==='legacy-protocol'?'scpv-current-access-gateway-v2':'nssv1-current-access-gateway-v1',actor:{userId:mode==='wrong-actor'?id(8):user,sessionGeneration:session},resourceId:resource,grantId:grant,receiptId:'scv1_receipt_'+id(9),allocationId:'nssv1_allocation_'+id(10),projectId:'synthetic-project',originalTransactionId:'synthetic-transaction',validUntilMs:Date.now()+4000,
   object:{provider:'s3',bucket:'synthetic-private-media',routeId:id(11),objectKey:`sandbox-commerce-v1/${user}/${resource}/${asset}/${incarnation}.mp4`,incarnation,expectedSha256:'a'.repeat(64),expectedByteLength:3,objectVersion:'synthetic-version'},
   media:{assetId:asset,incarnation,sha256:'a'.repeat(64),byteLength:3,resourceRevision:1,profile:'scpv-mp4-h264-aac-v1'}};
 },transport:{readRange:async()=>{reads++;return Uint8Array.of(1);}}});
 const response=await access(req());check(response.status===(mode==='allow'?206:403),'correct response');
 if(mode==='allow'){check(reads===1&&calls===2,'two authority reads');check(response.headers.get('content-range')==='bytes 0-0/3','bounded metadata');check((await response.arrayBuffer()).byteLength===1,'one byte');}
 else check(reads===(mode==='post-origin-hold'?1:0),'no premature origin read');
});
