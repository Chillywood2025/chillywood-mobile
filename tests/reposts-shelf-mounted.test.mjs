// Real shelf hooks and render output; native hosts and network are test boundaries.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';
const id=n=>`9a130000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const walk=(n,p)=>Array.isArray(n)?n.flatMap(x=>walk(x,p)):n&&typeof n==='object'?[...(p(n)?[n]:[]),...walk(n.props?.children,p)]:[];
const page=(n,next=null)=>({available:true,items:[{videoId:id(n),createdAt:'2026-11-07T00:00:00Z'}],nextCursor:next});
async function mount(t,{userId=id(1),focused=true,strict=false}={}){
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const noop=()=>{};
 const doc={addEventListener:noop,removeEventListener:noop,nodeType:9,defaultView:globalThis};doc.documentElement={nodeType:1,nodeName:'HTML',ownerDocument:doc};
 globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
 const container={nodeType:1,nodeName:'DIV',tagName:'DIV',namespaceURI:'http://www.w3.org/1999/xhtml',ownerDocument:doc,addEventListener:noop,removeEventListener:noop};
 let tree,key='a',authority={},listener,invalidator,answer=()=>page(1),props={userId,enabled:true,onOpen:noop};const calls=[],timers=new Map();let timer=0;
 const native={StyleSheet:{create:x=>x},...Object.fromEntries(['ActivityIndicator','ScrollView','Text','TouchableOpacity','View'].map(x=>[x,x])),AppState:{currentState:'active',addEventListener:(_,fn)=>{listener=fn;return{remove:noop};}}};
 const imports={react:React,'react-native':native,'@react-navigation/native':{useIsFocused:()=>focused},'../../_lib/session':{useSession:()=>({authority,authorityStatus:'active'})},
 '../../_lib/contentSocialEngagement':{contentSocialAuthorityKey:()=>key,readCreatorVideoRepostsPage:async(u,o)=>{calls.push({u,o});return answer(u,o);},subscribeToContentSocialEngagement:fn=>{invalidator=fn;return noop;}},
 '../../_lib/creatorVideos':{readCreatorVideosByIds:async ids=>ids.map(id=>({id}))},'../../_lib/creatorVideoLinks':{isCreatorVideoPubliclyShareable:()=>true},'../creator-media/creator-video-card':{CreatorVideoCard:'VideoCard'},'../ui/chillywood-visual-system':{CHILLYWOOD_VISUAL:{},ChillywoodPanel:'Panel'}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/social/reposts-shelf.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:n=>{if(!(n in imports))throw Error(n);return imports[n];},setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:n=>timers.delete(n)});
 function Probe(){tree=exports.RepostsShelf(props);return null;}
 const root=createRoot(container),render=()=>React.act(async()=>root.render(strict?React.createElement(React.StrictMode,null,React.createElement(Probe)):React.createElement(Probe)));await render();let mounted=true;const unmount=()=>React.act(async()=>{if(mounted){root.unmount();mounted=false;}});t.after(unmount);
 return {calls,unmount,get tree(){return tree;},get ids(){return walk(tree,n=>n.type==='VideoCard').map(n=>n.props.video.id);},get rail(){return walk(tree,n=>n.type==='ScrollView')[0];},setAnswer:x=>{answer=x;},run:fn=>React.act(async()=>{fn();}),render,
 tick:()=>[...timers.values()].forEach(fn=>fn()),more:()=>walk(tree,n=>n.type==='TouchableOpacity'&&n.props.disabled!==undefined)[0].props.onPress(),
 invalidate:()=>invalidator('creator_video:'+id(1),key),profile:x=>{props={...props,userId:x};},account:()=>{key='b';authority={};},renewAuthority:()=>{authority={};},focus:x=>{focused=x;},background:()=>listener('background')};
}
test('pagination and timer refresh preserve loaded extent and visible rail until verified readback',async t=>{
 const h=await mount(t),cursor={videoId:id(1),createdAt:'2026-11-07T00:00:00Z'};
 h.setAnswer((u,o)=>o.cursor?page(2):page(1,cursor));await h.run(h.tick);await h.run(h.more);assert.deepEqual(h.ids,[id(1),id(2)]);
 const held=deferred();h.setAnswer((u,o)=>o.cursor?page(2):held.promise);await h.run(h.tick);assert.ok(h.rail);assert.deepEqual(h.ids,[id(1),id(2)]);
 await h.run(()=>held.resolve(page(1,cursor)));assert.deepEqual(h.ids,[id(1),id(2)]);assert.ok(h.calls.at(-1).o.cursor);
});
test('privacy denial hides shelf; successful invalidation restores it; failed revalidation clears retained images',async t=>{
 const h=await mount(t);h.setAnswer(()=>({available:false,items:[],nextCursor:null}));await h.run(h.invalidate);assert.equal(h.tree,null);
 h.setAnswer(()=>page(2));await h.run(h.invalidate);assert.deepEqual(h.ids,[id(2)]);
 h.setAnswer(()=>{throw Error('offline');});await h.run(h.tick);assert.deepEqual(h.ids,[]);assert.ok(walk(h.tree,n=>n.type==='TouchableOpacity').length);
});
for(const change of ['profile','account','focus','background'])test(`${change} retirement cannot reveal old pending images`,async t=>{
 const h=await mount(t),held=deferred();h.setAnswer(()=>held.promise);await h.run(h.tick);
 if(change==='profile')h.profile(id(8));if(change==='account')h.account();if(change==='focus')h.focus(false);
 const next=deferred();h.setAnswer(()=>next.promise);
 if(change==='background')await h.run(h.background);else await h.render();assert.deepEqual(h.ids,[]);
 await h.run(()=>held.resolve(page(3)));assert.deepEqual(h.ids,[]);
 await h.run(()=>next.resolve(page(9)));assert.ok(!h.ids.includes(id(3)));
});
test('official non-UUID profiles and initially unfocused shelves issue no requests',async t=>{
 const h=await mount(t,{userId:'platform_rachi_official'});assert.equal(h.tree,null);assert.equal(h.calls.length,0);
 const other=await mount(t,{focused:false});assert.equal(other.tree,null);assert.equal(other.calls.length,0);
});

test('invalidation during a pending refresh schedules a fresh authoritative read',async t=>{
 const h=await mount(t),held=deferred();h.setAnswer(()=>held.promise);await h.run(h.tick);
 const before=h.calls.length;h.setAnswer(()=>page(2));await h.run(h.invalidate);
 await h.run(()=>held.resolve(page(1)));assert.ok(h.calls.length>before,'mutation invalidation must not be dropped behind flight');assert.deepEqual(h.ids,[id(2)]);
});
test('same-identity authority object renewal preserves loaded page extent',async t=>{
 const h=await mount(t),cursor={videoId:id(1),createdAt:'2026-11-07T00:00:00Z'};
 h.setAnswer((u,o)=>o.cursor?page(2):page(1,cursor));await h.run(h.tick);await h.run(h.more);assert.deepEqual(h.ids,[id(1),id(2)]);
 h.renewAuthority();await h.render();assert.deepEqual(h.ids,[id(1),id(2)]);
});
test('invalidation during pending pagination revalidates complete loaded extent',async t=>{
 const h=await mount(t),cursor={videoId:id(1),createdAt:'2026-11-07T00:00:00Z'},held=deferred();
 h.setAnswer(()=>page(1,cursor));await h.run(h.tick);h.setAnswer(()=>held.promise);await h.run(h.more);
 const before=h.calls.length;h.setAnswer((u,o)=>o.cursor?page(2):page(9,cursor));await h.run(h.invalidate);
 await h.run(()=>held.resolve(page(2)));assert.ok(h.calls.length>before,'pagination must not discard mutation invalidation');assert.ok(h.ids.includes(id(9)));assert.ok(!h.ids.includes(id(1)));
});

test('repeated pending invalidations coalesce to one current read',async t=>{
 const h=await mount(t),held=deferred();h.setAnswer(()=>held.promise);await h.run(h.tick);const count=h.calls.length;
 h.setAnswer(()=>page(2));await h.run(()=>{h.invalidate();h.invalidate();h.invalidate();});assert.equal(h.calls.length,count);
 await h.run(()=>held.resolve(page(1)));assert.equal(h.calls.length,count+1);assert.deepEqual(h.ids,[id(2)]);
});
for(const retirement of ['account','focus'])test(`queued invalidation cannot revive retired ${retirement} read`,async t=>{
 const h=await mount(t),held=deferred();h.setAnswer(()=>held.promise);await h.run(h.tick);await h.run(h.invalidate);
 const next=deferred();h.setAnswer(()=>next.promise);if(retirement==='account')h.account();else h.focus(false);await h.render();const count=h.calls.length;
 await h.run(()=>held.resolve(page(3)));assert.equal(h.calls.length,count);assert.deepEqual(h.ids,[]);
 await h.run(()=>next.resolve(page(9)));assert.ok(!h.ids.includes(id(3)));
});
for(const button of ['More','Retry'])test(`retained ${button} callback cannot dispatch after unmount`,async t=>{
 const h=await mount(t);
 h.setAnswer(()=>{if(button==='Retry')throw Error('offline');return page(1,{videoId:id(1),createdAt:'2026-11-07T00:00:00Z'});});await h.run(h.tick);
 const callback=walk(h.tree,n=>n.type==='TouchableOpacity')[0].props.onPress;await h.unmount();const count=h.calls.length;
 await h.run(callback);assert.equal(h.calls.length,count);
});

test('StrictMode effect replay leaves one live refresh timer and current shelf',async t=>{
 const h=await mount(t,{strict:true});assert.deepEqual(h.ids,[id(1)]);const before=h.calls.length;
 h.setAnswer(()=>page(2));await h.run(h.tick);assert.equal(h.calls.length,before+1);assert.deepEqual(h.ids,[id(2)]);
});
