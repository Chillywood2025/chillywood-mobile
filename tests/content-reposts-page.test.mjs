import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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
const cursor={videoId:id(1),createdAt:'2026-11-07T00:00:00Z'};
test('page forwards exact profile, cursor and limit with account-bound token; guest omits token',async()=>{
 const h=apiHarness();h.setResult({data:{items:[cursor],nextCursor:cursor}});
 const page=await h.api.readCreatorVideoRepostsPage(id(8),{cursor,limit:24});
 assert.equal(page.available,true);assert.equal(page.items[0].videoId,id(1));assert.equal(page.nextCursor.createdAt,cursor.createdAt);
 assert.equal(h.calls[0].name,'read_creator_video_reposts');assert.equal(h.calls[0].args.p_user_id,id(8));assert.equal(h.calls[0].args.p_before_video_id,id(1));assert.equal(h.calls[0].args.p_limit,24);assert.equal(h.tokens[0],'a');
 h.signOut();await h.api.readCreatorVideoRepostsPage(id(8));assert.equal(h.tokens[1],undefined);
});
test('policy null is unavailable while valid empty page is available; network error is not emptiness',async()=>{
 const h=apiHarness();h.setResult({data:null});assert.equal((await h.api.readCreatorVideoRepostsPage(id(8))).available,false);
 h.setResult({data:{items:[],nextCursor:null}});assert.equal((await h.api.readCreatorVideoRepostsPage(id(8))).available,true);
 h.setResult({data:null,error:new Error('offline')});await assert.rejects(h.api.readCreatorVideoRepostsPage(id(8)),/offline/);
});
test('malformed and oversized pages never enter the receiving library',async()=>{
 for(const data of [[],{}, {items:[cursor]}, {items:Array(51).fill(cursor),nextCursor:null}, {items:[{...cursor,videoId:'invalid'}],nextCursor:null}, {items:[{...cursor,createdAt:'invalid'}],nextCursor:null}, {items:[],nextCursor:{videoId:id(1)}}]){
  const h=apiHarness();h.setResult({data});await assert.rejects(h.api.readCreatorVideoRepostsPage(id(8)));
 }
});
test('account replacement and explicit abort retire page responses even if transport ignores cancellation',async()=>{
 const h=apiHarness(),held=deferred();h.setResult(held.promise);const p=h.api.readCreatorVideoRepostsPage(id(8));
 await Promise.resolve();await Promise.resolve();h.switch();held.resolve({data:{items:[cursor],nextCursor:null}});await assert.rejects(p,/retired|account changed/);
 const other=apiHarness(),pending=deferred(),controller=new AbortController();other.setResult(pending.promise);
 const request=other.api.readCreatorVideoRepostsPage(id(8),{signal:controller.signal});controller.abort();await assert.rejects(request,/retired/);pending.resolve({data:{items:[],nextCursor:null}});
});
