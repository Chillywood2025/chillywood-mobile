import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createNotificationViewProgress} from '../_lib/notificationViewProgress.mjs';
const require=createRequire(import.meta.url),React=require('react'),ts=require('typescript');
const {createRoot}=require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class {};
const source=fs.readFileSync(new URL('../_lib/useNotificationViewTracking.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const owner=(id='a')=>({userId:id,accountId:id,sessionGeneration:`${id}-session`,state:'ACTIVE',restoreOnly:false});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function mount(t){
  let authority=owner(),sourceId='video-a',focused=true,time=0,result,reader=async()=>authority;
  const calls=[],listeners=new Set(),app={currentState:'active',addEventListener:(_,fn)=>{listeners.add(fn);return {remove:()=>listeners.delete(fn)};}};
  const current={exports:{},require:name=>{
    if(name==='react')return React;
    if(name==='@react-navigation/native')return {useIsFocused:()=>focused};
    if(name==='react-native')return {AppState:app};
    if(name==='./session')return {useSession:()=>({authority,authorityStatus:'active'})};
    if(name==='./notificationViewProgress.mjs')return {createNotificationViewProgress:args=>createNotificationViewProgress({...args,now:()=>time})};
    if(name==='./accountSessionAuthority')return {readCurrentAccountSessionAuthority:()=>reader(),sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.accountId===b.accountId&&a.sessionGeneration===b.sessionGeneration&&a.restoreOnly===b.restoreOnly};
    if(name==='./supabase')return {supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:name.startsWith('begin')?`${sourceId}-view`:true,error:null};}}};
    throw new Error(name);
  }};vm.runInNewContext(compiled,current);
  function Host(){result=current.exports.useNotificationViewTracking('video',sourceId,true);return null;}
  const root=createRoot(container());const render=async()=>React.act(async()=>{root.render(React.createElement(Host));});
  await render();t.after(()=>React.act(async()=>root.unmount()));
  return {calls,callback:()=>result,read:fn=>{reader=fn;},async source(id){sourceId=id;await render();},async account(id){authority=owner(id);await render();},
    async focus(value){focused=value;await render();},async state(value){await React.act(async()=>{app.currentState=value;for(const f of listeners)f(value);});},
    async sample(callback=result,position=time){time+=1000;await React.act(async()=>callback({isLoaded:true,isPlaying:true,isBuffering:false,positionMillis:position}));},
    async resolve(d,value){await React.act(async()=>d.resolve(value));}};
}
test('actual mounted tracker uses current source and ten seconds of active playback',async t=>{
  const h=await mount(t);for(let i=0;i<=10;i++)await h.sample(undefined,i*1000);
  assert.equal(h.calls.filter(x=>x.name==='begin_video_notification_view').length,1);
  assert.equal(h.calls.filter(x=>x.name==='complete_content_notification_view').length,1);
});
for(const replacement of ['source','account'])test(`retained old playback callback cannot advance replacement ${replacement}`,async t=>{
  const h=await mount(t),old=h.callback();await h[replacement](`${replacement}-b`);
  for(let i=0;i<15;i++)await h.sample(old,i*1000);
  assert.equal(h.calls.length,0,'only the replacement player callback may advance its view');
  await h.sample();assert.equal(h.calls.length,1);
});
for(const transition of ['source','focus','state'])test(`held authority read cannot begin after ${transition} retires playback`,async t=>{
  const h=await mount(t),d=deferred();h.read(()=>d.promise);await h.sample();
  if(transition==='source')await h.source('video-b');else if(transition==='focus')await h.focus(false);else await h.state('background');
  await h.resolve(d,owner());assert.equal(h.calls.length,0,'late authority is insufficient after playback ownership retires');
});
test('held exact-authority read cannot cross an account replacement',async t=>{
  const h=await mount(t),d=deferred();h.read(()=>d.promise);await h.sample();await h.account('b');await h.resolve(d,owner('b'));
  assert.equal(h.calls.length,0);
});
test('held completion authority cannot complete the old source after replacement',async t=>{
  const h=await mount(t);await h.sample(undefined,0);
  for(let i=1;i<10;i++)await h.sample(undefined,i*1000);
  const d=deferred();h.read(()=>d.promise);await h.sample(undefined,10000);await h.source('video-b');
  await h.resolve(d,owner());assert.equal(h.calls.filter(x=>x.name==='complete_content_notification_view').length,0);
});
