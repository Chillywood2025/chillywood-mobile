import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
function fixture(){
 const handlers={},calls=[];let deny=false;
 const d={videoId:ids[0],grantId:ids[1],sourceVersionId:ids[2],assetSha256:'a'.repeat(64),byteLength:40*1024*1024};
 vm.runInNewContext(readFileSync('public/stripe-sandbox-media-sw.js','utf8'),{URL,Response,ReadableStream,Uint8Array,AbortController,Date,Set,Map,setTimeout,clearTimeout,
 self:{location:{origin:'https://app.test'},addEventListener:(name,cb)=>handlers[name]=cb},
 fetch:async(url,options)=>{calls.push(options);if(deny)return new Response(null,{status:403});const [,a,b]=/bytes=(\d+)-(\d+)/.exec(options.headers.Range);const n=Number(b)-Number(a)+1;
 return new Response(new Uint8Array(n),{status:206,headers:{'Content-Range':`bytes ${a}-${b}/${d.byteLength}`,'Content-Length':String(n),
 'X-Chillywood-Media-Protocol':'stripe-sandbox-range-v1','X-Chillywood-Video-Id':d.videoId,'X-Chillywood-Grant-Id':d.grantId,
 'X-Chillywood-Source-Version':d.sourceVersionId,'X-Chillywood-Asset-Sha256':d.assetSha256,'X-Chillywood-Byte-Length':String(d.byteLength)}});}});
 const message=(action,client='a')=>handlers.message({source:{id:client,url:'https://app.test/player'},data:{action,id:ids[0],descriptor:d,
 endpoint:`https://api.test/functions/v1/stripe-sandbox-paid-video-playback/${d.videoId}/${d.grantId}`,authorization:'Bearer synthetic',sessionId:ids[2],apikey:'public'},ports:[{postMessage:m=>assert.equal(m.ok,true)}]});
 const run=(range='bytes=0-',client='a',path=`/_stripe-sandbox-media/${ids[0]}`)=>{let response;handlers.fetch({clientId:client,request:new Request(`https://app.test${path}`,{headers:{Range:range}}),respondWith:p=>response=p});return response;};
 return {message,run,calls,deny:()=>deny=true};
}
test('streaming worker uses sequential bounded authenticated ranges beyond old32MiB cap',async()=>{
 const f=fixture();f.message('bind');const r=await f.run('bytes=33554432-33554433');assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,2);
 assert.equal(f.calls[0].headers.Authorization,'Bearer synthetic');assert.equal(f.calls[0].cache,'no-store');
 const large=await f.run('bytes=0-8388608');assert.equal((await large.arrayBuffer()).byteLength,8388609);
 for(const c of f.calls){const [,a,b]=/bytes=(\d+)-(\d+)/.exec(c.headers.Range);assert.ok(Number(b)-Number(a)+1<=4*1024*1024);}
});
test('worker isolates clients, denies replay after release and fails next chunk on provider denial',async()=>{
 const f=fixture();f.message('bind');assert.equal((await f.run('bytes=0-1','b')).status,403);
 assert.equal((await f.run('bytes=0-1,3-4')).status,416);assert.equal((await f.run('bytes=9007199254740993-')).status,416);assert.equal(f.run('bytes=0-1','a','/unrelated'),undefined);
 const response=await f.run('bytes=0-8388608'),reader=response.body.getReader();await reader.read();f.deny();await assert.rejects(reader.read());
 f.message('release');assert.equal((await f.run()).status,403);
});
test('worker release after origin read but before stream pull retires buffered chunk',async()=>{
 const f=fixture();f.message('bind');const r=await f.run('bytes=0-1');f.message('release');await assert.rejects(r.arrayBuffer());
});
