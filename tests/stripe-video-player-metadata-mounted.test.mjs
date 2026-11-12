import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {productionFunctions} from './platform-studio-mounted-harness.mjs';
const videoId='11111111-1111-4111-8111-111111111111',creatorId='22222222-2222-4222-8222-222222222222';
const metadata={videoId,creatorId,title:'Verified paid video',description:'Metadata only',createdAt:'2026-11-12',updatedAt:'2026-11-12'};
function reader({available=true,changed=false,owner=false}={}) {
 let raw=0,legacy=0;
 const access={allowed:true,reason:owner?'owner':'sandbox_grant',stripeSandboxDeliveryOnly:!owner,requiresPurchase:false,creatorId,resolverStatus:'resolved'};
 const row={id:videoId,ownerId:creatorId,visibility:'public',vipAccessRequired:false};
 const chain={select(){return this},eq(){return this},in(){return this},returns(){return this},async maybeSingle(){return {data:row}}};
 const functions=productionFunctions('_lib/creatorVideos.ts',['toText','createPaidContentLockedCreatorVideo','readCreatorVideoForPlayer'],{
  resolveCreatorVideoVisibilityAccess:async()=>({allowed:true}),resolveCreatorVipVideoAccess:async()=>({allowed:true,vipRequired:false}),resolveCreatorContentAccess:async()=>access,
  captureAccountBoundSupabaseMutationSubject:async()=>({}),assertAccountBoundSupabaseMutationSubjectCurrent:()=>{if(changed)throw Error('changed')},
  invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{assert.equal(name,'read_stripe_sandbox_video_player_metadata');assert.equal(args.p_video_id,videoId);return {data:available?metadata:null}},
  createUnavailableVodPlaybackResolution:()=>null,
  supabase:{from(){raw++;if(!owner)assert.fail('Stripe buyer cannot read raw video row');return chain},auth:{getUser:async()=>({data:{user:{id:creatorId}}})}},
  CREATOR_VIDEO_SELECT:'source-bearing',parseCreatorVideo:async()=>row,
  resolveSignedVideoPlaybackSource:async()=>{legacy++;return {defaultPlaybackUrl:'owner-preview',renditionStatuses:[]}},
 });
 return {read:()=>functions.readCreatorVideoForPlayer(videoId),raw:()=>raw,legacy:()=>legacy};
}
const noop=()=>{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
// Mount the production player declarations selecting the protected hook, fed by
// the actual production reader with a denied raw-row boundary.
const player=fs.readFileSync('app/player/[id].tsx','utf8');
const start=player.indexOf('  const stripeSandboxDeliveryOnly =');
const end=player.indexOf('  const nativeProductionDeliveryOnly =',start);
const selection=player.slice(start,end);
test('paid buyer metadata reaches protected player hook without raw row or legacy URL',async t=>{
 const api=reader();const calls=[];const exports={};
 const source=`export function Probe({creatorVideo}) {${selection}\nreturn null;}`;
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,useStripeSandboxPaidVideoPlaybackState:id=>{calls.push(id);return {source:null,error:null}}});
 const value=await api.read();assert.ok(value);assert.equal(value.playbackUrl,'');assert.equal(value.storageObjectKey,'');
 const root=createRoot(container());t.after(()=>React.act(()=>root.unmount()));
 await React.act(async()=>root.render(React.createElement(exports.Probe,{creatorVideo:value})));
 assert.ok(calls.includes(videoId));assert.equal(api.raw(),0);assert.equal(api.legacy(),0);
});
test('missing/revoked metadata and account change stay closed before raw source',async()=>{
 for(const options of [{available:false},{changed:true}]){const api=reader(options);assert.equal(await api.read(),null);assert.equal(api.raw(),0);assert.equal(api.legacy(),0)}
});
test('explicit owner preview uses existing owner-authorized path, not self purchase',async()=>{
 const api=reader({owner:true});const value=await api.read();assert.equal(value.playbackUrl,'owner-preview');assert.equal(value.paidContentAccess.stripeSandboxDeliveryOnly,false);assert.equal(api.raw(),1);assert.equal(api.legacy(),1);
});
