// Local qualification fixture only. Production gateway modules are unchanged.
// Synthetic S3 protocol fixture never contacts AWS or any external service.
import { createHash, createHmac } from "node:crypto";
const originalFetch=globalThis.fetch, bucket=Deno.env.get('PAID_VIDEO_S3_BUCKET')!, region=Deno.env.get('PAID_VIDEO_S3_REGION')!;
const access=Deno.env.get('PAID_VIDEO_S3_ACCESS_KEY_ID')!, secret=Deno.env.get('PAID_VIDEO_S3_SECRET_ACCESS_KEY')!;
const host=`${bucket}.s3.${region}.amazonaws.com`, stored=new Map<string,{bytes:Uint8Array;version:string;etag:string}>();
let writes=0,reads=0,dropNextPut=false;
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const hmac=(key:Uint8Array|string,value:string)=>createHmac('sha256',key).update(value).digest();
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const origin=Deno.serve({hostname:'127.0.0.1',port:59433},async req=>{
 try{
  const url=new URL(req.url),body=new Uint8Array(await req.arrayBuffer());
  const auth=/^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/u.exec(req.headers.get('authorization')??'');
  if(!auth||auth[1]!==access)throw Error('fixture_signature');
  const names=auth[3].split(';'),datetime=req.headers.get('x-amz-date')!,day=datetime.slice(0,8);
  if(auth[2]!==`${day}/${region}/s3/aws4_request`)throw Error('fixture_scope');
  const canonical=[req.method,url.pathname,url.search.slice(1),names.map(name=>`${name}:${name==='host'?host:req.headers.get(name)}\n`).join(''),names.join(';'),hash(body)].join('\n');
  const key=hmac(hmac(hmac(hmac('AWS4'+secret,day),region),'s3'),'aws4_request');
  if(auth[4]!==hmac(key,['AWS4-HMAC-SHA256',datetime,auth[2],hash(canonical)].join('\n')).toString('hex')||req.headers.get('x-amz-content-sha256')!==hash(body))throw Error('fixture_signature');
  const objectKey=decodeURIComponent(url.pathname);
  if(req.method==='PUT'){
   if(req.headers.get('if-none-match')!=='*'||!names.includes('if-none-match')||req.headers.get('content-type')!=='video/mp4')throw Error('fixture_conditional_put');
   writes++;if(stored.has(objectKey))return new Response(null,{status:412});
   const version=crypto.randomUUID(),etag='"'+hash(body)+'"';stored.set(objectKey,{bytes:body,version,etag});
   return new Response(null,{status:200,headers:{'x-amz-version-id':version,'x-amz-checksum-sha256':req.headers.get('x-amz-checksum-sha256')!}});
  }
  const object=stored.get(objectKey);if(!object)return new Response(null,{status:404});
  const headers=new Headers({'content-type':'video/mp4','content-length':String(object.bytes.length),etag:object.etag,'x-amz-version-id':object.version});
  if(req.method==='HEAD'){if(url.search&&url.searchParams.get('versionId')!==object.version)throw Error('fixture_version');return new Response(null,{status:200,headers});}
  if(req.method!=='GET'||url.searchParams.get('versionId')!==object.version||req.headers.get('if-match')!==object.etag)throw Error('fixture_pinned_read');
  reads++;const range=req.headers.get('range');
  if(range){const match=/^bytes=(\d+)-(\d+)$/u.exec(range);if(!match)throw Error('fixture_range');const start=Number(match[1]),end=Number(match[2]);
   headers.set('content-range',`bytes ${start}-${end}/${object.bytes.length}`);headers.set('content-length',String(end-start+1));return new Response(object.bytes.slice(start,end+1),{status:206,headers});}
  return new Response(new Uint8Array(object.bytes),{headers});
 }catch{return json({error:'synthetic_origin_rejected'},500);}
});
globalThis.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input));
 const options=init as RequestInit|undefined;
 if(url.origin==='https://'+host){
  const headers=new Headers(options?.headers);headers.delete('host');
  const response=await originalFetch('http://127.0.0.1:59433'+url.pathname+url.search,{...options,headers});
  if(options?.method==='PUT'&&dropNextPut){dropNextPut=false;await response.body?.cancel();throw Error('fixture_lost_put_response');}
  return response;
 }
 if(url.origin!=='http://127.0.0.1:59431')throw Error('external_network_forbidden');
 return originalFetch(input,init);
};
const {handler:author}=await import('./snapshot/supabase/functions/isolated-paid-video-authoring-v2/index.ts');
const {handler:upload}=await import('./snapshot/supabase/functions/isolated-paid-video-upload-v2/index.ts');
const {handler:range}=await import('./snapshot/supabase/functions/isolated-paid-video-range-v1/index.ts');
const {handler:checkout}=await import('./snapshot/supabase/functions/isolated-paid-video-checkout-v3/index.ts');
Deno.serve({hostname:'127.0.0.1',port:59432},async req=>{
 const path=new URL(req.url).pathname;
 if(path==='/__ready')return json({ready:true,permissions:{api:(await Deno.permissions.query({name:'net',host:'127.0.0.1:59431'})).state,
  external:(await Deno.permissions.query({name:'net',host:'api.revenuecat.com:443'})).state,run:(await Deno.permissions.query({name:'run'})).state,write:(await Deno.permissions.query({name:'write'})).state}});
 if(path==='/__state')return json({writes,reads,objects:stored.size});
 if(path==='/__drop-next-put'&&req.method==='POST'){dropNextPut=true;return json({armed:true});}
 if(path.startsWith('/functions/v1/isolated-paid-video-authoring-v2'))return author(req);
 if(path.startsWith('/functions/v1/isolated-paid-video-upload-v2'))return upload(req);
 if(path.startsWith('/functions/v1/isolated-paid-video-range-v1'))return range(req);
 if(path.startsWith('/functions/v1/isolated-paid-video-checkout-v3'))return checkout(req);
 return json({status:'not_found'},404);
});
await origin.finished;
