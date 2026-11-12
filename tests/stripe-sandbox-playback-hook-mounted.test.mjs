import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';

const noop=()=>{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
const video='11111111-1111-4111-8111-111111111111';
const descriptor={protocol:'stripe-sandbox-playback-v1',status:'READY',videoId:video,
 adapter:'stripe-sandbox-etag-range-v1',grantId:'22222222-2222-4222-8222-222222222222',
 sourceVersionId:'33333333-3333-4333-8333-333333333333',assetSha256:'a'.repeat(64),byteLength:100};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function mount(t,{initialDenied=false}={}){
 let denied=initialDenied,observed,interval,lost,accountChanged,released=0;
 const exports={};
 const require=name=>{
  if(name==='react')return React;
  if(name==='react-native')return {Platform:{OS:'web'},AppState:{currentState:'active',addEventListener:()=>({remove:noop})}};
  if(name.endsWith('accountBoundSupabaseMutation'))return {
   captureAccountBoundSupabaseMutationSubject:async()=>({accessToken:'SYNTHETIC',authority:{sessionGeneration:'session'}}),
   assertAccountBoundSupabaseMutationSubjectCurrent:noop,
   invokeAccountBoundSupabaseMutationRpc:async()=>({data:denied?null:descriptor}),
  };
  if(name.endsWith('accountSessionAuthority'))return {subscribeToAccountSessionAuthority:cb=>{accountChanged=cb;return noop}};
  if(name.endsWith('supabase'))return {SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'synthetic'};
  if(name.endsWith('stripeSandboxPlaybackWorker'))return {bindStripeSandboxPlaybackWorker:async args=>{lost=args.onLost;return {uri:'https://app.invalid/_stripe-sandbox-media/synthetic',renew:noop,release:()=>released++}}};
  throw Error(`Unexpected production import ${name}`);
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/useStripeSandboxPaidVideoPlayback.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,require,AbortController,setTimeout,clearTimeout,setInterval:cb=>{interval=cb;return 1},clearInterval:noop});
 function Probe(){observed=exports.useStripeSandboxPaidVideoPlaybackState(video);return null;}
 const root=createRoot(container());t.after(()=>React.act(()=>root.unmount()));
 await React.act(async()=>{root.render(React.createElement(Probe));await flush();});
 return {state:()=>observed,released:()=>released,deny:()=>{denied=true},poll:()=>interval(),lose:()=>lost(),accountChanged:()=>accountChanged()};
}
test('missing initial authority leaves an explicit error and never a media source',async t=>{
 const h=await mount(t,{initialDenied:true});assert.equal(h.state().source,null);assert.equal(h.state().error,'playback_authority_unavailable');
});
test('poll revocation clears bytes but does not overwrite its visible error',async t=>{
 const h=await mount(t);assert.ok(h.state().source);h.deny();
 await React.act(async()=>{h.poll();await flush();});
 assert.equal(h.state().source,null);assert.equal(h.state().error,'playback_authority_unavailable');assert.equal(h.released(),1);
});
test('worker loss retires the source and exposes failure rather than a blank player',async t=>{
 const h=await mount(t);assert.ok(h.state().source);
 await React.act(async()=>{h.lose();await flush();});
 assert.equal(h.state().source,null);assert.equal(h.state().error,'playback_authority_unavailable');assert.equal(h.released(),1);
});
test('account change retires the previous binding before trying current authority',async t=>{
 const h=await mount(t);assert.ok(h.state().source);h.deny();
 await React.act(async()=>{h.accountChanged();await flush();});
 assert.equal(h.state().source,null);assert.equal(h.state().error,'playback_authority_unavailable');assert.equal(h.released(),1);
});
