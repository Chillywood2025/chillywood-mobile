import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';

function load(file,imports){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports,require:name=>{if(!(name in imports))throw Error(`Unexpected import ${name}`);return imports[name];},setTimeout,clearTimeout,setInterval,clearInterval,AbortController,URL,Date});return exports;}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const id=n=>`9a130000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const target=n=>({kind:'creator_video',id:id(n)});
const record=n=>({video_id:id(n),like_count:4,comment_count:2,liked_by_viewer:false,can_like:true,repost_count:0,reposted_by_viewer:false,can_repost:true});
function apiHarness(){
  let authority={userId:'a',accountId:'a',sessionGeneration:'one',restoreOnly:false};
  let result=({p_video_ids})=>({data:p_video_ids.map(value=>({...record(1),video_id:value})),error:null});
  let mutation={data:true,error:null}; const calls=[],writes=[],tokens=[];
  const check=subject=>{if(subject.authority!==authority)throw Error('account changed');};
  const api=load('_lib/contentSocialEngagement.ts',{
    './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority},
    './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority,accessToken:authority.userId}),
      assertAccountBoundSupabaseMutationSubjectCurrent:check,
      invokeAccountBoundSupabaseMutationRpc:async(subject,name,args)=>{check(subject);writes.push({name,args});return mutation;}},
    './contentEngagement':{setTitleLike:async()=>{}},
    './supabase':{SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon'},
    '@supabase/supabase-js':{createClient:(_url,_key,options)=>({rpc:(name,args)=>{
      calls.push({name,args});const pending=(async()=>{tokens.push(await options.accessToken?.());return result(args);})();
      return{then:(a,b)=>pending.then(a,b),abortSignal(){return this;}};
    }})},
  });
  return{api,calls,writes,tokens,setResult:value=>{result=typeof value==='function'?value:()=>value;},setMutation:value=>{mutation=value;},switch:()=>{authority={...authority,userId:'b',accountId:'b'};},signOut:()=>{authority=null;}};
}
test('bounded reads preserve real zero, unknown view counts and unavailable targets',async()=>{
  const h=apiHarness(); h.setResult({data:[{...record(1),like_count:0}],error:null});
  const rows=await h.api.readContentSocialEngagementBatch([target(1),target(2)]);
  assert.equal(rows[`creator_video:${id(1)}`].likeCount,0);
  assert.equal(rows[`creator_video:${id(1)}`].viewCount,null);
  assert.equal(rows[`creator_video:${id(1)}`].shareCount,0);
  assert.equal(rows[`creator_video:${id(2)}`],undefined);
  await assert.rejects(h.api.readContentSocialEngagementBatch(Array(51).fill(target(1))),/at most 50/);
});
test('malformed count, unexpected target and transport error do not become zero',async()=>{
  for(const response of [{data:null},{error:new Error('offline')},{data:[{...record(1),like_count:null}]},{data:[{...record(1),comment_count:-1}]},{data:[record(9)]}]){
    const h=apiHarness();h.setResult(response);await assert.rejects(h.api.readContentSocialEngagementBatch([target(1)]));
  }
});
test('coalescer makes one request for duplicate mounted cards and sequential batches for large grids',async()=>{
  const h=apiHarness();const all=await Promise.all(Array.from({length:76},(_,n)=>h.api.readCoalescedContentSocialEngagement([target(n%75+1)])));
  assert.equal(h.calls.length,2);assert.equal(h.calls[0].args.p_video_ids.length,50);assert.equal(h.calls[1].args.p_video_ids.length,25);
  assert.equal(all.length,76);assert.ok(all[0][`creator_video:${id(1)}`]);
});
test('account switch before dispatch and while response pending retires results',async()=>{
  const first=apiHarness();const queued=first.api.readCoalescedContentSocialEngagement([target(1)]);first.switch();await assert.rejects(queued,/retired/);assert.equal(first.calls.length,0);
  const h=apiHarness(),held=deferred();h.setResult(held.promise);const request=h.api.readContentSocialEngagementBatch([target(1)]);
  await Promise.resolve();await Promise.resolve();h.switch();held.resolve({data:[record(1)]});await assert.rejects(request,/retired|account changed/);
});
test('explicit cancellation rejects even when the transport ignores abort',async()=>{
  const h=apiHarness(),held=deferred(),controller=new AbortController();h.setResult(held.promise);
  const result=h.api.readContentSocialEngagementBatch([target(1)],controller.signal);
  await Promise.resolve();controller.abort();await assert.rejects(result,/retired/);
  held.resolve({data:[record(1)]});
});
test('mutations send explicit desired state and invalidate only after confirmed success',async()=>{
  const h=apiHarness(),events=[];const unsubscribe=h.api.subscribeToContentSocialEngagement((...args)=>events.push(args));
  await h.api.setContentSocialLike(target(1),true);
  assert.equal(h.writes[0].name,'set_creator_video_like');assert.equal(h.writes[0].args.p_liked,true);assert.equal(events.length,1);
  h.setMutation({data:null,error:{message:'timeout'}});await assert.rejects(h.api.setContentSocialLike(target(1),false));assert.equal(events.length,1);unsubscribe();
});

async function mount(t,{inactive=false}={}){
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;const noop=()=>{};
  const doc={addEventListener:noop,removeEventListener:noop,nodeType:9,defaultView:globalThis};doc.documentElement={nodeType:1,nodeName:'HTML',ownerDocument:doc};
  globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
  const container={nodeType:1,nodeName:'DIV',tagName:'DIV',namespaceURI:'http://www.w3.org/1999/xhtml',ownerDocument:doc,addEventListener:noop,removeEventListener:noop};
  let authority='a',notify,state,currentId=id(1),enabled=true,invalidator;const reads=[],writes=[],held=deferred();
  const value={likeCount:1,commentCount:2,shareCount:0,viewCount:null,liked:false,canLike:true,reposted:false,canRepost:true};
  let nextRead=null,readCount=0;
  const appState={currentState:inactive?'background':'active',addEventListener:(_name,fn)=>{appState.listener=fn;return{remove:noop};}};
  const hook=load('hooks/use-content-social-engagement.ts',{
    react:React,'react-native':{AppState:appState},
    '../_lib/accountSessionAuthority':{subscribeToAccountSessionAuthority:fn=>{notify=fn;return noop;}},
    '../_lib/contentSocialEngagement':{contentSocialAuthorityKey:()=>authority,contentSocialKey:x=>`${x.kind}:${x.id}`,
      readCoalescedContentSocialEngagement:async targets=>{readCount++;reads.push(targets);return nextRead??{[`creator_video:${targets[0].id}`]:value};},
      setContentSocialLike:async(target,liked)=>{writes.push({target,liked});return held.promise;},
      setContentSocialRepost:async(target,reposted)=>{writes.push({target,reposted});return held.promise;},
      subscribeToContentSocialEngagement:fn=>{invalidator=fn;return noop;}},
  }).useContentSocialEngagement;
  function Probe(){state=hook({kind:'creator_video',id:currentId,enabled});return null;}
  const root=createRoot(container);await React.act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Probe))));
  t.after(async()=>{await React.act(async()=>root.unmount());});
  return{get state(){return state;},get readCount(){return readCount;},writes,held,
    run:fn=>React.act(async()=>{fn();}),
    rerender:()=>React.act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Probe)))),
    setRead:value=>{nextRead=value;},setId:value=>{currentId=value;},disable:()=>{enabled=false;},
    switch:()=>{authority='b';notify();},foreground:()=>{appState.currentState='active';appState.listener('active');},invalidate:()=>invalidator(`creator_video:${currentId}`,authority)};
}
test('mounted hook survives StrictMode replay, blocks double taps and retires old target completions',async t=>{
  const h=await mount(t);assert.equal(h.state.likeCount,1);const toggle=h.state.toggleLike;
  await h.run(()=>{void toggle();void toggle();});assert.equal(h.writes.length,1);
  h.setId(id(2));await h.rerender();await h.run(()=>{void toggle();});assert.equal(h.writes.length,1);
  await h.run(()=>h.held.resolve());assert.equal(h.state.busy,false);assert.equal(h.state.likeCount,1);
});
test('account changes retire pending reads; failures clear old counts rather than inventing zero',async t=>{
  const h=await mount(t),held=deferred();h.setRead(held.promise);await h.run(()=>{void h.state.refresh();});
  await h.run(()=>h.switch());await h.run(()=>held.resolve({}));assert.equal(h.state.likeCount,null);assert.ok(h.state.error);
});
test('background initial mount makes no read; foreground and content invalidation refresh',async t=>{
  const h=await mount(t,{inactive:true});assert.equal(h.readCount,0);await h.run(()=>h.foreground());assert.equal(h.state.likeCount,1);
  const before=h.readCount;await h.run(()=>h.invalidate());assert.equal(h.readCount,before+1);
  h.disable();await h.rerender();const stopped=h.readCount;await h.run(()=>h.invalidate());assert.equal(h.readCount,stopped);
});
test('like and repost share one in-flight mutation fence',async t=>{
  const h=await mount(t);await h.run(()=>{void h.state.toggleRepost();void h.state.toggleLike();});
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].reposted,true);await h.run(()=>h.held.resolve());
});
