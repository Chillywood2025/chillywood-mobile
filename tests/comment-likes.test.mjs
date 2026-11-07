import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';
function load(file,imports){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports,require:name=>{if(!(name in imports))throw Error(`Unexpected import ${name}`);return imports[name];},setTimeout,clearTimeout,setInterval,clearInterval,Date,AbortController});return exports;}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const id=n=>`9a130000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const target=n=>({kind:'creator_video_comment',id:id(n)});
const row=n=>({comment_id:id(n),like_count:0,liked_by_viewer:false,can_like:true});
function harness(){
  let authority={userId:'a',accountId:'a',sessionGeneration:'one',restoreOnly:false};
  let result=({p_comment_ids})=>({data:p_comment_ids.map(comment_id=>({...row(1),comment_id})),error:null});
  let mutation={data:true,error:null};const calls=[],writes=[],tokens=[];
  const check=s=>{if(s.authority!==authority)throw Error('account changed');};
  const api=load('_lib/commentLikes.ts',{
    './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority},
    './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority,accessToken:authority?.userId}),
      assertAccountBoundSupabaseMutationSubjectCurrent:check,
      invokeAccountBoundSupabaseMutationRpc:async(s,name,args)=>{check(s);writes.push({name,args});return mutation;}},
    './supabase':{SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon'},
    '@supabase/supabase-js':{createClient:(_u,_k,o)=>({rpc:(name,args)=>{
      calls.push({name,args});const pending=(async()=>{tokens.push(await o.accessToken?.());return result(args);})();
      return{then:(a,b)=>pending.then(a,b),abortSignal(){return this;}};
    }})},
  });
  return{api,calls,writes,setResult:value=>{result=typeof value==='function'?value:()=>value;},setMutation:value=>{mutation=value;},switch:()=>{authority={...authority,userId:'b',accountId:'b'};}};
}
test('real zero preserved; absent, malformed and failed counts are not fabricated',async()=>{
  const h=harness();h.setResult({data:[row(1)],error:null});const rows=await h.api.readCommentLikesBatch([target(1),target(2)]);
  assert.equal(rows[`creator_video_comment:${id(1)}`].likeCount,0);assert.equal(rows[`creator_video_comment:${id(2)}`],undefined);
  for(const data of [null,[{...row(1),like_count:null}],[{...row(1),like_count:-1}],[row(9)],[row(1),row(1)]]){
    h.setResult({data,error:null});await assert.rejects(h.api.readCommentLikesBatch([target(1)]));
  }
});
test('coalescing bounds 76 visible comment rows into batches and retains kind separation',async()=>{
  const h=harness();await Promise.all(Array.from({length:76},(_,n)=>h.api.readCoalescedCommentLikes([target(n%75+1)])));
  assert.equal(h.calls.length,2);assert.equal(h.calls[0].args.p_comment_ids.length,50);assert.equal(h.calls[1].args.p_comment_ids.length,25);
  await assert.rejects(h.api.readCommentLikesBatch(Array(51).fill(target(1))),/at most 50/);
  await h.api.readCommentLikesBatch([{kind:'profile_post_comment',id:id(1)},target(1)]);assert.equal(h.calls.length,4);
});
test('account changes retire queued and in-flight requests',async()=>{
  const h=harness();const queued=h.api.readCoalescedCommentLikes([target(1)]);h.switch();await assert.rejects(queued,/retired/);assert.equal(h.calls.length,0);
  const held=deferred();h.setResult(held.promise);const reading=h.api.readCommentLikesBatch([target(1)]);await Promise.resolve();await Promise.resolve();h.switch();held.resolve({data:[row(1)],error:null});await assert.rejects(reading,/retired|account changed/);
});
test('cancellation retires even a transport that ignores its abort signal',async()=>{
  const h=harness(),held=deferred(),controller=new AbortController();h.setResult(held.promise);
  const pending=h.api.readCommentLikesBatch([target(1)],controller.signal);await Promise.resolve();await Promise.resolve();controller.abort();
  await assert.rejects(pending,/retired/);held.resolve({data:[row(1)],error:null});
});
test('explicit desired state, no blind retries or successful invalidation on uncertain write',async()=>{
  const h=harness(),events=[];h.api.subscribeToCommentLikes((...args)=>events.push(args));await h.api.setCommentLike(target(1),true);
  assert.equal(h.writes[0].name,'set_comment_like');assert.equal(h.writes[0].args.p_liked,true);assert.equal(events.length,1);
  h.setMutation({data:null,error:new Error('timeout')});await assert.rejects(h.api.setCommentLike(target(1),false));assert.equal(events.length,1);assert.equal(h.writes.length,2);
});

async function mount(t,{inactive=false}={}){
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;const noop=()=>{};
  const doc={addEventListener:noop,removeEventListener:noop,nodeType:9,defaultView:globalThis};doc.documentElement={nodeType:1,nodeName:'HTML',ownerDocument:doc};
  globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
  const container={nodeType:1,nodeName:'DIV',tagName:'DIV',namespaceURI:'http://www.w3.org/1999/xhtml',ownerDocument:doc,addEventListener:noop,removeEventListener:noop};
  let authority='a',notify,state,currentId=id(1),enabled=true,invalidator,nextRead=null,readCount=0;const writes=[],held=deferred();
  const value={likeCount:1,liked:false,canLike:true};
  const appState={currentState:inactive?'background':'active',addEventListener:(_n,fn)=>{appState.listener=fn;return{remove:noop};}};
  const hook=load('hooks/use-comment-like.ts',{
    react:React,'react-native':{AppState:appState},
    '../_lib/accountSessionAuthority':{subscribeToAccountSessionAuthority:fn=>{notify=fn;return noop;}},
    '../_lib/commentLikes':{commentLikeAuthorityKey:()=>authority,commentLikeKey:t=>`${t.kind}:${t.id}`,
      readCoalescedCommentLikes:async targets=>{readCount++;return nextRead??{[`creator_video_comment:${targets[0].id}`]:value};},
      setCommentLike:async(t,liked)=>{writes.push({t,liked});return held.promise;},
      subscribeToCommentLikes:fn=>{invalidator=fn;return noop;}},
  }).useCommentLike;
  function Probe(){state=hook({kind:'creator_video_comment',id:currentId,enabled});return null;}
  const root=createRoot(container);await React.act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Probe))));
  t.after(async()=>{await React.act(async()=>root.unmount());});
  return{get state(){return state;},get readCount(){return readCount;},writes,held,run:fn=>React.act(async()=>{fn();}),
    rerender:()=>React.act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Probe)))),
    setRead:value=>{nextRead=value;},setId:value=>{currentId=value;},disable:()=>{enabled=false;},
    switch:()=>{authority='b';notify();},foreground:()=>{appState.currentState='active';appState.listener('active');},invalidate:()=>invalidator(`creator_video_comment:${currentId}`,authority)};
}
test('mounted comment likes survive StrictMode and fence double taps, stale closures and late writes',async t=>{
  const h=await mount(t);assert.equal(h.state.likeCount,1);const toggle=h.state.toggleLike;
  await h.run(()=>{void toggle();void toggle();});assert.equal(h.writes.length,1);
  h.setId(id(2));await h.rerender();await h.run(()=>{void toggle();});assert.equal(h.writes.length,1);
  await h.run(()=>h.held.resolve());assert.equal(h.state.busy,false);
});
test('mounted failed reads clear previous counts; background/disabled surfaces do not refresh',async t=>{
  const h=await mount(t,{inactive:true});assert.equal(h.readCount,0);await h.run(()=>h.foreground());assert.equal(h.state.likeCount,1);
  h.setRead({});await h.run(()=>{void h.state.refresh();});assert.equal(h.state.likeCount,null);assert.ok(h.state.error);
  h.disable();await h.rerender();const before=h.readCount;await h.run(()=>h.invalidate());assert.equal(h.readCount,before);
});
