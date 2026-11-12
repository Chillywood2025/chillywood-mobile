/* Source-only sandbox transport. No offline caching or persistent credentials. */
const bindings=new Map();
const prefix='/_stripe-sandbox-media/';
const validId=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v);
const release=key=>{const b=bindings.get(key);if(b){for(const a of b.readers)a.abort();bindings.delete(key);}};
const purge=()=>{for(const [key,b] of bindings)if(Date.now()>=b.expires)release(key);};
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 purge();
 const source=event.source,m=event.data;
 if(!source?.id||!source.url||new URL(source.url).origin!==self.location.origin||!m||!validId(m.id))return;
 const key=source.id+':'+m.id;
 if(m.action==='release'){release(key);return;}
 if(m.action==='renew'){const b=bindings.get(key);if(b)b.expires=Date.now()+60000;return;}
 if(m.action!=='bind')return;
 try{
 const endpoint=new URL(m.endpoint),d=m.descriptor;
 if(endpoint.protocol!=='https:'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password
  ||!d||!validId(d.videoId)||!validId(d.grantId)||!validId(d.sourceVersionId)
  ||endpoint.pathname!==`/functions/v1/stripe-sandbox-paid-video-playback/${d.videoId}/${d.grantId}`
  ||!Number.isSafeInteger(d.byteLength)||d.byteLength<1||!/^([0-9a-f]{64})$/.test(d.assetSha256)
  ||typeof m.authorization!=='string'||!m.authorization.startsWith('Bearer ')||!validId(m.sessionId)||typeof m.apikey!=='string')throw Error();
 release(key);bindings.set(key,{endpoint:endpoint.href,d,headers:{Authorization:m.authorization,apikey:m.apikey,'X-Chillywood-Auth-Session':m.sessionId},expires:Date.now()+60000,readers:new Set()});
 event.ports[0]?.postMessage({ok:true});
 }catch{event.ports[0]?.postMessage({ok:false});}
});
const responseHeaders={'Cache-Control':'private, no-store','Content-Type':'video/mp4','Accept-Ranges':'bytes'};
function bounds(raw,length){
 if(!raw)return {start:0,end:length-1,partial:false};
 const m=/^bytes=(\d*)-(\d*)$/.exec(raw);if(!m||(!m[1]&&!m[2]))throw Error();
 const start=m[1]?Number(m[1]):Math.max(0,length-Number(m[2]));
 const end=m[1]?(m[2]?Math.min(Number(m[2]),length-1):length-1):length-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=length||end<start||(!m[1]&&Number(m[2])<=0))throw Error();
 return {start,end,partial:true};
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||!url.pathname.startsWith(prefix))return;
 event.respondWith(deliver(event,url));
});
async function deliver(event,url){
 purge();
 const id=url.pathname.slice(prefix.length),key=event.clientId+':'+id,b=bindings.get(key);
 if(!validId(id)||url.search||!event.clientId||!b||Date.now()>=b.expires||event.request.method!=='GET')return new Response(null,{status:403,headers:{'Cache-Control':'no-store'}});
 let range;try{range=bounds(event.request.headers.get('Range'),b.d.byteLength);}catch{return new Response(null,{status:416,headers:{'Content-Range':`bytes */${b.d.byteLength}`,'Cache-Control':'no-store'}});}
 const abort=new AbortController();b.readers.add(abort);event.request.signal.addEventListener('abort',()=>abort.abort(),{once:true});
 let cursor=range.start;
 async function chunk(){
  if(abort.signal.aborted||bindings.get(key)!==b||Date.now()>=b.expires)throw Error('authorization_expired');
  const end=Math.min(range.end,cursor+4*1024*1024-1);
  const timeout=setTimeout(()=>abort.abort(),60000);
  try{
  const r=await fetch(b.endpoint,{headers:{...b.headers,Range:`bytes=${cursor}-${end}`},signal:abort.signal,redirect:'error',cache:'no-store',credentials:'omit'});
  const d=b.d,length=end-cursor+1;
  if(r.status!==206||r.headers.get('Content-Range')!==`bytes ${cursor}-${end}/${d.byteLength}`||r.headers.get('Content-Length')!==String(length)
   ||r.headers.get('X-Chillywood-Media-Protocol')!=='stripe-sandbox-range-v1'||r.headers.get('X-Chillywood-Video-Id')!==d.videoId
   ||r.headers.get('X-Chillywood-Grant-Id')!==d.grantId||r.headers.get('X-Chillywood-Source-Version')!==d.sourceVersionId
   ||r.headers.get('X-Chillywood-Asset-Sha256')!==d.assetSha256||r.headers.get('X-Chillywood-Byte-Length')!==String(d.byteLength))throw Error('identity_changed');
  const reader=r.body?.getReader();if(!reader)throw Error('body_missing');const bytes=new Uint8Array(length);let offset=0;
  try{for(;;){const next=await reader.read();if(next.done)break;if(offset+next.value.length>length)throw Error('body_overflow');bytes.set(next.value,offset);offset+=next.value.length;}}
  finally{await reader.cancel().catch(()=>{});}
  if(offset!==length||abort.signal.aborted||bindings.get(key)!==b||Date.now()>=b.expires)throw Error('authority_changed');
  cursor=end+1;return bytes;
  }finally{clearTimeout(timeout);}
 }
 try{
 const first=await chunk();let initial=first;
 const stream=new ReadableStream({async pull(controller){try{
  if(abort.signal.aborted||bindings.get(key)!==b||Date.now()>=b.expires)throw Error('authorization_expired');
  if(initial){controller.enqueue(initial);initial=null;}else if(cursor<=range.end)controller.enqueue(await chunk());
  if(cursor>range.end){controller.close();b.readers.delete(abort);}
 }catch(error){abort.abort();b.readers.delete(abort);controller.error(error);}},cancel(){abort.abort();b.readers.delete(abort);}}, {highWaterMark:0});
 return new Response(stream,{status:range.partial?206:200,headers:{...responseHeaders,'Content-Length':String(range.end-range.start+1),
 ...(range.partial?{'Content-Range':`bytes ${range.start}-${range.end}/${b.d.byteLength}`}:{})}});
 }catch{abort.abort();b.readers.delete(abort);return new Response(null,{status:403,headers:{'Cache-Control':'no-store'}});}
}
