import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import {createRoot} from 'react-dom/client';
import ts from 'typescript';
const noop=()=>{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const settle=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{resolve,promise};};
const actor=sessionGeneration=>({userId:'10000000-0000-4000-8000-000000000001',accountId:'10000000-0000-4000-8000-000000000001',sessionGeneration,state:'ACTIVE',restoreOnly:false});
const notice=(state='live')=>({id:'notice-a',notificationType:'followed_creator_live',title:state==='ended'?'Live ended':'Named private-sensitive creator',body:'Selected room title',
 deepLink:'/watch-party/live-stage/ROOM',target:{route:'/watch-party/live-stage/[partyId]',entityId:'ROOM',context:{live_discovery_state:state,discovery_hint_key:'20000000-0000-4000-8000-000000000001'},supported:true},createdAt:'2026-11-01T10:00:00Z',isRead:false,isDismissed:false,isExpired:state==='ended'});
const textOf=node=>Array.isArray(node)?node.map(textOf).join(''):typeof node==='string'?node:node?.props?textOf(node.props.children):'';
const nodes=(node,predicate,result=[])=>{if(Array.isArray(node))node.forEach(n=>nodes(n,predicate,result));else if(node&&typeof node==='object'){if(predicate(node))result.push(node);nodes(node.props?.children,predicate,result);}return result;};
async function mount(t){
 let authority=actor('one'),enabled=true,refreshKey=0,now=1000,sequence=0,api,cards=[];
 const timers=new Map(),listeners=new Set(),apps=new Set(),channels=[],calls=[],routes=[],renders=[];
 const setTimer=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:now+ms});return id;};
 class Clock extends Date{static now(){return now;}}
 const app={currentState:'active',addEventListener:(_,fn)=>{apps.add(fn);return{remove:()=>apps.delete(fn)};}};
 let read=async id=>({status:'resolved',subjectUserId:id,items:[notice()],nextCursor:null});
 const native={AppState:app,StyleSheet:{create:x=>x,absoluteFillObject:{}},Text:()=>null,TouchableOpacity:()=>null,
   View:props=>{cards.push(props.children);return null;}};
 const cache=new Map();
 const load=file=>{
  if(cache.has(file))return cache.get(file);
  const context={exports:{},AbortController,Date:Clock,setTimeout:setTimer,clearTimeout:id=>timers.delete(id),
   process:{env:{EXPO_PUBLIC_LIVE_DISCOVERY_PUSH_ENABLED:'true'}},Math:{...Math,random:()=>0,floor:Math.floor},URL,URLSearchParams,
   require:name=>{
    if(name==='react')return React;if(name==='react-native')return native;if(name==='@expo/vector-icons/MaterialIcons')return()=>null;
    if(name.endsWith('/accountSessionAuthority'))return{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&JSON.stringify(a)===JSON.stringify(b),subscribeToAccountSessionAuthority:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
    if(name.endsWith('/supabase'))return{supabase:{channel(topic){const ch={topic,handlers:[],on(type,filter,fn){ch.handlers.push({type,filter,fn});return ch;},subscribe(fn){ch.status=fn;return ch;}};channels.push(ch);return ch;},async removeChannel(ch){ch.removed=true;}}};
    if(name.endsWith('/notifications'))return{readNotificationListPage:(...args)=>{calls.push(args);return read(...args);}};
    if(name.includes('conversation-timestamp'))return{ConversationTimestamp:()=>null};
    if(name.endsWith('/discoveryFeed'))return{};
    if(name.includes('creator-video-card')||name.includes('linked-text')||name.includes('social-attachment-card')||name.includes('ProfileMediaImage'))return{};
    const target=new URL(name,new URL(`../${file}`,import.meta.url));const resolved=[target.pathname,`${target.pathname}.ts`,`${target.pathname}.tsx`].find(fs.existsSync);assert.ok(resolved,name);
    return load(resolved.slice(new URL('../',import.meta.url).pathname.length));
   }};
  vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),context);cache.set(file,context.exports);return context.exports;
 };
 const hook=load('_lib/useLiveNotificationPage.ts').useLiveNotificationPage;
 const Card=load('components/ProfileSocialFeedCard.tsx').ProfileSocialFeedCard;
 const live=load('_lib/liveNotificationActivity.ts');const paths=load('_lib/notificationMessageTarget.ts');
 const open=(withoutCurrentLiveGuard=false)=>{
  const source=fs.readFileSync('app/profile/[userId].tsx','utf8');
  const ast=ts.createSourceFile('profile.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration;
  const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='openProfileSocialNotification')declaration=n;ts.forEachChild(n,visit);};visit(ast);assert.ok(declaration);
  let callback=declaration.getText(ast);
  if(withoutCurrentLiveGuard){
   // Mutate the real current callback, not a historical Git checkout.
   // Only remove the live/current-item fence; all actual route branches remain.
   const guards=declaration.initializer.body.statements.filter(n=>ts.isIfStatement(n)
    &&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='isLiveNotificationActivity');
   assert.equal(guards.length,1,'negative control must remove exactly the production live guard');
   const guard=guards[0],start=declaration.getStart(ast);
   callback=callback.slice(0,guard.getStart(ast)-start)+callback.slice(guard.end-start);
  }
  const context={exports:{},...live,profileNotificationActivity:api,normalizeFeedUserId:x=>String(x??'').trim(),resolveNotificationPath:paths.resolveNotificationMessagePath,router:{push:x=>routes.push(x)}};
  vm.runInNewContext(compile(`const ${callback};exports.open=openProfileSocialNotification;`),context);return context.exports.open;
 };
 function Probe(){api=hook({authority,enabled,refreshKey,limit:12});renders.push(api.items.map(n=>n.title).join(" "));cards=[];return api.items.map(n=>React.createElement(Card,{key:n.id,item:{id:n.id,type:'backed_activity_item',notification:n},onOpenNotification:item=>open()(item)}));}
 const root=createRoot(container());const render=()=>root.render(React.createElement(Probe));
 await React.act(async()=>{render();await settle();});t.after(async()=>{await React.act(async()=>root.unmount());});
 return{get api(){return api;},calls,channels,routes,renders,open,read:fn=>{read=fn;},snapshot:()=>({text:cards.map(textOf).join(''),opens:cards.flatMap(c=>nodes(c,n=>n.type===native.TouchableOpacity)).length}),
  async hint(scope='viewer:10000000-0000-4000-8000-000000000001',count=1,keys=null){await React.act(async()=>{const ch=channels.findLast(c=>!c.removed&&c.topic===`discovery:v1:${scope}`);assert.ok(ch);for(let i=0;i<count;i++)ch.handlers.forEach(h=>h.fn({payload:{id:'opaque',...(keys?{keys}:{ignored:'not authority'})}}));await settle();});},
  async advance(ms){await React.act(async()=>{const end=now+ms;for(;;){const due=[...timers].filter(([,x])=>x.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].fn();await settle();}now=end;await settle();});},
  async resolve(gate,value){await React.act(async()=>{gate.resolve(value);await settle();});},
  async enabled(value){enabled=value;await React.act(async()=>{render();await settle();});},
  async replace(){authority=actor('replacement');await React.act(async()=>{listeners.forEach(fn=>fn(authority));render();await settle();});},
  async refresh(){refreshKey++;await React.act(async()=>{render();await settle();});},
 };
}

test('actual Profile Activity hook/card/route expire labels on own-viewer hints and reject retained old Open callback',async t=>{
 const h=await mount(t);assert.match(h.snapshot().text,/Named private-sensitive creator/);assert.equal(h.snapshot().opens,1);
 const oldItem={type:'backed_activity_item',notification:notice()};const retained=h.open();
 const gate=deferred();h.read(()=>gate.promise);const before=h.calls.length;
 await h.hint(undefined,1000);await h.advance(100);
 assert.equal(h.calls.length,before+1);assert.doesNotMatch(h.snapshot().text,/Named private-sensitive creator|Selected room title/);assert.equal(h.snapshot().opens,0);
 retained(oldItem);assert.equal(h.routes.length,0,'retained closure resolves the current item, not its old authorization');
 h.open(true)({...oldItem,notification:notice('ended')});assert.equal(h.routes.length,1,'negative control proves removing the live fence bypasses ended/unavailable state');
 await h.hint(undefined,1000);await h.advance(600);assert.equal(h.calls.length,before+1,'source remains single-flight across bursts');
 h.read(async id=>({status:'resolved',subjectUserId:id,items:[],nextCursor:null}));await h.resolve(gate,{status:'unavailable',items:[],nextCursor:null});
 assert.equal(h.api.items.length,0);assert.ok(h.calls.length<=before+2);
});
test('Profile failed current reads keep sensitive names hidden; fallback restores only verified non-joinable ended history',async t=>{
 const h=await mount(t);h.read(async()=>{throw new Error('unavailable');});await h.hint('surface:profile');await h.advance(100);
 assert.match(h.api.notice,/could not be refreshed/);assert.equal(h.snapshot().opens,0);assert.doesNotMatch(h.snapshot().text,/Named private-sensitive creator/);
 h.read(async id=>({status:'resolved',subjectUserId:id,items:[notice('ended')],nextCursor:null}));await h.advance(30000);
 assert.match(h.snapshot().text,/Live ended/);assert.equal(h.snapshot().opens,0);h.open()({type:'backed_activity_item',notification:notice('ended')});assert.equal(h.routes.length,0);
});
test('Profile authority replacement/focus retirement retain actual read ownership and cannot revive previous names',async t=>{
 const h=await mount(t),gate=deferred();h.read(()=>gate.promise);await h.hint();await h.advance(100);const before=h.calls.length;
 await h.enabled(false);assert.equal(h.api.items.length,0);await h.replace();await h.enabled(true);await h.refresh();assert.equal(h.calls.length,before);
 h.read(async id=>({status:'resolved',subjectUserId:id,items:[],nextCursor:null}));await h.resolve(gate,{status:'resolved',subjectUserId:actor('one').userId,items:[notice()],nextCursor:null});
 assert.equal(h.calls.length,before+1);assert.equal(h.api.items.length,0);assert.doesNotMatch(h.snapshot().text,/Named private-sensitive creator/);
});
test('Profile uses the live-aware own-page data and no longer performs an unowned duplicate read',()=>{
 const source=fs.readFileSync('app/profile/[userId].tsx','utf8');assert.match(source,/notifications: profileNotificationActivity\.items/);
 assert.match(source,/enabled: focused && feedAppActive && isSelfProfile/);assert.doesNotMatch(source,/readNotificationListPage\(currentUserId/);
});

test('Profile focus return hides previous verified names before effects and deadline keeps abort-ignoring read ownership',async t=>{
 const h=await mount(t),oldItem={type:'backed_activity_item',notification:notice()},retained=h.open();
 await h.enabled(false);const gate=deferred();h.read(()=>gate.promise);h.renders.length=0;
 await h.enabled(true);assert.ok(h.renders.every(text=>!text.includes('Named private-sensitive creator')),
  'even the first reopened render cannot reuse old session availability');
 const before=h.calls.length;await h.advance(10000);assert.match(h.api.notice,/could not be refreshed/);
 retained(oldItem);assert.equal(h.routes.length,0);await h.refresh();assert.equal(h.calls.length,before,'deadline abort is not settlement');
 h.read(async id=>({status:'resolved',subjectUserId:id,items:[],nextCursor:null}));
 await h.resolve(gate,{status:'resolved',subjectUserId:actor('one').userId,items:[notice()],nextCursor:null});
 assert.equal(h.calls.length,before+1);assert.equal(h.api.items.length,0);
});

test('Profile canonical refreshes converge during sustained shared hints without a global dirty-result discard',async t=>{
 const h=await mount(t);let pending=[];h.read(()=>{const gate=deferred();pending.push(gate);return gate.promise;});
 const before=h.calls.length;let completed=0;
 for(let tick=0;tick<30;tick++){
  await h.hint('surface:profile',10,['30000000-0000-4000-8000-000000000001']);await h.advance(100);
  if(tick%5===4&&pending.length){
   const gate=pending.shift();completed++;
   await h.resolve(gate,{status:'resolved',subjectUserId:actor('one').userId,items:[{...notice(),title:`Canonical settled ${completed}`}],nextCursor:null});
   assert.ok(h.renders.includes(`Canonical settled ${completed}`),'unrelated aggregate traffic cannot discard every canonical result');
  }
 }
 assert.equal(completed,6);assert.ok(h.calls.length<=before+7,'one source in flight plus a bounded trailing refresh');
});

test('Profile known-key withdrawal fences only affected in-flight rows and accepts a new canonical read after the hint',async t=>{
 const h=await mount(t),old=deferred(),fresh=deferred();h.read(()=>old.promise);
 await h.hint('surface:profile',1,['30000000-0000-4000-8000-000000000001']);await h.advance(100);
 assert.match(h.snapshot().text,/Named private-sensitive creator/,'unrelated key does not blank a verified row');
 await h.hint(undefined,1,['20000000-0000-4000-8000-000000000001']);await h.advance(600);
 assert.doesNotMatch(h.snapshot().text,/Named private-sensitive creator/);
 h.read(()=>fresh.promise);await h.resolve(old,{status:'resolved',subjectUserId:actor('one').userId,
  items:[notice(),{...notice(),id:'other',title:'Unaffected canonical notice',target:{...notice().target,context:{live_discovery_state:'live',discovery_hint_key:'40000000-0000-4000-8000-000000000001'}}}],nextCursor:null});
 assert.doesNotMatch(h.snapshot().text,/Named private-sensitive creator/,'old query cannot resurrect the specifically withdrawn row');
 assert.match(h.snapshot().text,/Unaffected canonical notice/,'unrelated canonical row continues to converge');
 await h.resolve(fresh,{status:'resolved',subjectUserId:actor('one').userId,items:[notice()],nextCursor:null});
 assert.match(h.snapshot().text,/Named private-sensitive creator/,'new post-hint canonical read is authoritative without a permanent tombstone');
});

test('raw authoritative key prevents a pre-hint Profile read restoring names during the callback coalescing window',async t=>{
 const h=await mount(t),gate=deferred();h.read(()=>gate.promise);
 await h.hint('surface:profile',1,['30000000-0000-4000-8000-000000000001']);await h.advance(100);
 await h.hint(undefined,1,['20000000-0000-4000-8000-000000000001']); // Do not advance callback timer.
 await h.resolve(gate,{status:'resolved',subjectUserId:actor('one').userId,items:[notice()],nextCursor:null});
 assert.doesNotMatch(h.snapshot().text,/Named private-sensitive creator/);
 assert.equal(h.snapshot().opens,0);
});
