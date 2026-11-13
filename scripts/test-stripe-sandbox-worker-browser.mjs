#!/usr/bin/env node
// Actual Chromium media + Service Worker test, synthetic local evidence only.
// The test-only fetch shim maps a reserved fake HTTPS origin to localhost; no
// TLS exceptions, external provider, account credentials, or deployment needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(new URL('../tests/integration/real-peer-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'stripe-sandbox-browser-'));
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
let browser,server,denied=false;const requests=[],errors=[];
try{
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=320x240:rate=24','-t','4','-pix_fmt','yuv420p','-c:v','libx264','-movflags','+faststart','-y',path.join(temp,'fixture.mp4')],{timeout:120000});
 // Legal ISO-BMFF free atom makes this a >32MiB source without a large fixture
 // in Git. Actual video frames still come from ffmpeg and are decoded below.
 const free=Buffer.alloc(36*1024*1024);free.writeUInt32BE(free.length,0);free.write('free',4,'ascii');
 const media=Buffer.concat([fs.readFileSync(path.join(temp,'fixture.mp4')),free]);
 const descriptor={videoId:ids[0],grantId:ids[1],sourceVersionId:ids[2],assetSha256:createHash('sha256').update(media).digest('hex'),byteLength:media.length};
 const originalWorker=fs.readFileSync(path.join(root,'public/stripe-sandbox-media-sw.js'),'utf8');
 const worker="const fixtureFetch=self.fetch.bind(self);self.fetch=(url,init)=>fixtureFetch(typeof url==='string'?url.replace('https://stripe-playback-fixture.invalid',self.location.origin):url,init);\n"+originalWorker;
 const bridge='var exports={};'+ts.transpileModule(fs.readFileSync(path.join(root,'_lib/stripeSandboxPlaybackWorker.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 server=http.createServer((req,res)=>{
  try{
   if(req.url==='/stripe-sandbox-media-sw.js'){res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});return res.end(worker);}
   if(req.url==='/bridge.js'){res.writeHead(200,{'Content-Type':'application/javascript'});return res.end(bridge);}
   if(req.url?.startsWith('/functions/v1/stripe-sandbox-paid-video-playback/')){
    assert.equal(req.url,`/functions/v1/stripe-sandbox-paid-video-playback/${ids[0]}/${ids[1]}`);
    assert.equal(req.headers.authorization,'Bearer SYNTHETIC_TEST_ONLY');assert.equal(req.headers['x-chillywood-auth-session'],ids[2]);
    assert.equal(req.headers.apikey,'public-fixture');
    const match=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range??'');assert.ok(match);
    const start=Number(match[1]),end=Number(match[2]);assert.ok(end>=start&&end<media.length&&end-start+1<=4*1024*1024);
    requests.push({start,end,denied});
    if(denied){res.writeHead(403,{'Cache-Control':'no-store'});return res.end();}
    res.writeHead(206,{'Content-Type':'video/mp4','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${media.length}`,'Cache-Control':'no-store',
     'X-Chillywood-Media-Protocol':'stripe-sandbox-range-v1','X-Chillywood-Video-Id':ids[0],'X-Chillywood-Grant-Id':ids[1],
     'X-Chillywood-Source-Version':ids[2],'X-Chillywood-Asset-Sha256':descriptor.assetSha256,'X-Chillywood-Byte-Length':String(media.length)});
    return res.end(media.subarray(start,end+1));
   }
   res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><title>Local synthetic playback proof</title><video muted controls></video><script src="/bridge.js"></script>');
  }catch(error){errors.push(error.message);res.writeHead(500);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,timeout:120000});
 const context=await browser.newContext({serviceWorkers:'allow'});context.setDefaultTimeout(60000);
 const page=await context.newPage();await page.goto(origin);
 const bind=async()=>page.evaluate(async({descriptor,ids})=>{
  window.proofBinding=await exports.bindStripeSandboxPlaybackWorker({endpoint:`https://stripe-playback-fixture.invalid/functions/v1/stripe-sandbox-paid-video-playback/${ids[0]}/${ids[1]}`,
   descriptor,headers:{Authorization:'Bearer SYNTHETIC_TEST_ONLY',apikey:'public-fixture','X-Chillywood-Auth-Session':ids[2]},signal:new AbortController().signal,onLost:()=>{window.proofLost=true;}});
  return window.proofBinding.uri;
 },{descriptor,ids});
 const uri=await bind();assert.ok(!uri.includes('SYNTHETIC')&&!uri.includes('Bearer'));
 await page.evaluate(async uri=>{const video=document.querySelector('video');video.src=uri;await video.play();},uri);
 await page.waitForFunction(()=>document.querySelector('video').currentTime>0.15,{},{timeout:60000});
 await page.evaluate(()=>{const video=document.querySelector('video');video.currentTime=2;});
 await page.waitForFunction(()=>{const v=document.querySelector('video');return !v.seeking&&v.currentTime>=2&&v.readyState>=2;},{},{timeout:60000});
 // Stop and unload decoded media before testing access retirement, matching
 // the player state change. Delivered bytes are not remotely retractable.
 await page.evaluate(()=>{const v=document.querySelector('video');v.pause();v.removeAttribute('src');v.load();});
 const largeRange=await page.evaluate(async uri=>{const r=await fetch(uri,{headers:{Range:'bytes=33554432-33554433'}});return {status:r.status,length:(await r.arrayBuffer()).byteLength};},uri);
 assert.deepEqual(largeRange,{status:206,length:2});
 const joinedRange=await page.evaluate(async uri=>{const r=await fetch(uri,{headers:{Range:'bytes=0-8388608'}});return {status:r.status,length:(await r.arrayBuffer()).byteLength};},uri);
 assert.deepEqual(joinedRange,{status:206,length:8388609});
 const other=await context.newPage();await other.goto(origin);
 assert.equal(await other.evaluate(async uri=>(await fetch(uri,{headers:{Range:'bytes=0-1'}})).status,uri),403,'another document cannot replay the opaque media URL');
 denied=true;
 assert.equal(await page.evaluate(async uri=>(await fetch(uri,{headers:{Range:'bytes=0-1'}})).status,uri),403,'new range must reject revoked backend authority');
 denied=false;
 // release() is the hook's account-switch/unmount retirement boundary.
 await page.evaluate(()=>window.proofBinding.release());
 assert.equal(await page.evaluate(async uri=>(await fetch(uri,{headers:{Range:'bytes=0-1'}})).status,uri),403,'retired account/unmounted binding must not replay');
 const nextUri=await bind();assert.notEqual(nextUri,uri);
 assert.equal(await page.evaluate(async uri=>(await fetch(uri,{headers:{Range:'bytes=0-1'}})).status,uri),403,'rebinding must not revive prior URL');
 await page.reload();
 assert.equal(await page.evaluate(async uri=>(await fetch(uri,{headers:{Range:'bytes=0-1'}})).status,nextUri),403,'new document cannot inherit prior document credentials');
 assert.ok(requests.length>2);assert.ok(requests.some(r=>r.start>=32*1024*1024));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'passed',actualHtmlVideoPlayback:true,seek:true,over32MiB:true,boundedMultiChunkRange:true,clientIsolation:true,revocation:true,releaseAndRebind:true,reloadIsolation:true,rangeRequests:requests.length,sourceBytes:media.length}));
}finally{
 await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 fs.rmSync(temp,{recursive:true,force:true});
}
