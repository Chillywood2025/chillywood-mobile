import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
function fixture({foreign=false,ready=true}={}){
 const sw=new EventTarget(),messages=[];let registered=0;
 sw.controller={scriptURL:foreign?'https://app.test/other.js':'https://app.test/stripe-sandbox-media-sw.js',postMessage:(m,ports)=>{messages.push(m);if(ports)ports[0].postMessage({ok:true});}};
 sw.getRegistrations=async()=>[];sw.register=async()=>{registered++;};sw.ready=ready?Promise.resolve({}):new Promise(()=>{});
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('_lib/stripeSandboxPlaybackWorker.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
 {exports,URL,MessageChannel,setTimeout,clearTimeout,crypto:webcrypto,navigator:{serviceWorker:sw},window:{isSecureContext:true},location:{origin:'https://app.test'}});
 const abort=new AbortController();let lost=0;
 const options={endpoint:'https://api.test/functions/v1/stripe-sandbox-paid-video-playback/a/b',descriptor:{},headers:{Authorization:'Bearer fixture',apikey:'public','X-Chillywood-Auth-Session':'session'},signal:abort.signal,onLost:()=>lost++};
 return {bind:()=>exports.bindStripeSandboxPlaybackWorker(options),messages,sw,abort,registered:()=>registered,lost:()=>lost};
}
test('client refuses unrelated service worker without replacing it',async()=>{const f=fixture({foreign:true});await assert.rejects(f.bind(),/conflict/);assert.equal(f.registered(),0);});
test('client activation waits honor cancellation',async()=>{const f=fixture({ready:false});const pending=f.bind();await new Promise(r=>setTimeout(r,1));f.abort.abort();await assert.rejects(pending,/cancelled/);});
test('client releases memory binding on controller change and does not put bearer in URL',async()=>{const f=fixture(),binding=await f.bind();assert.ok(!binding.uri.includes('Bearer'));assert.equal(f.messages[0].action,'bind');binding.renew();assert.equal(f.messages.at(-1).action,'renew');f.sw.dispatchEvent(new Event('controllerchange'));assert.equal(f.messages.at(-1).action,'release');assert.equal(f.lost(),1);});
