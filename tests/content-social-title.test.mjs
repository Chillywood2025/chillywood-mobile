// Production title-branch + existing title mutation helper, mocked transport only.
// This does not claim title-card UI wiring or database authorization coverage.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file,imports){
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,{exports,require:name=>{if(!(name in imports))throw Error(`Unexpected import ${name}`);return imports[name];},
    setTimeout,clearTimeout,AbortController,Date});
  return exports;
}
const target=id=>({kind:'title',id});
const plain=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};

function harness({guest=false}={}){
  let authority=guest?null:{userId:'viewer-a',accountId:'account-a',sessionGeneration:'session-a',restoreOnly:false};
  const calls=[],tokens=[],captures=[];
  let responder=call=>call.table==='titles'?{data:[{id:'Chicago Streets'},{id:'TITLE-2'}],error:null}:
    call.action==='upsert'||call.action==='delete'?{data:null,error:null}:
      {data:[{title_id:'Chicago Streets',relationship_type:'like',user_id:'viewer-a',updated_at:'2026-11-07T00:00:00Z'}],error:null};
  const assertCurrent=subject=>{if(!authority||subject.authority!==authority)throw Error('account changed');};
  const mutationBoundary={
    captureAccountBoundSupabaseMutationSubject:async()=>{
      if(!authority||authority.restoreOnly)throw Error('active account required');
      const subject={authority,accessToken:`token:${authority.userId}`};captures.push(subject);return subject;
    },
    assertAccountBoundSupabaseMutationSubjectCurrent:assertCurrent,
    invokeAccountBoundSupabaseMutationRpc:async()=>{throw Error('title must not use video mutation RPC');},
  };
  const createClient=(_url,_key,options)=>({
    rpc:()=>{throw Error('title path must not use video RPC');},
    from:table=>{
      const call={table,action:'select',columns:null,filters:[],payload:null,onConflict:null,signal:null};
      const query={
        select(columns){call.columns=columns;return query;},
        in(column,value){call.filters.push(['in',column,plain(value)]);return query;},
        eq(column,value){call.filters.push(['eq',column,value]);return query;},
        abortSignal(signal){call.signal=signal;return query;},
        upsert(payload,config){call.action='upsert';call.payload=plain(payload);call.onConflict=config?.onConflict;return query;},
        delete(){call.action='delete';return query;},
        returns(){return query;},
        then(yes,no){
          const pending=(async()=>{
            tokens.push(options.accessToken?await options.accessToken():null);
            calls.push(call);return responder(call);
          })();
          return pending.then(yes,no);
        },
      };return query;
    },
  });
  const supabase={auth:{getSession:async()=>({data:{session:authority?{user:{id:authority.userId}}:null},error:null})}};
  const imports={
    '@supabase/supabase-js':{createClient},
    './accountBoundSupabaseMutation':mutationBoundary,
    './supabase':{supabase,SUPABASE_URL:'https://transport.test',SUPABASE_ANON_KEY:'public-anon'},
  };
  const contentEngagement=load('_lib/contentEngagement.ts',imports);
  const api=load('_lib/contentSocialEngagement.ts',{
    ...imports,'./contentEngagement':contentEngagement,
    './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority},
  });
  return{api,calls,tokens,captures,setResponder:fn=>{responder=fn;},switch:()=>{authority={...authority,userId:'viewer-b',accountId:'account-b',sessionGeneration:'session-b'};},
    signOut:()=>{authority=null;},restoreOnly:()=>{authority={...authority,restoreOnly:true};}};
}

test('title batch reads published sources and exact own like relationships, not aggregate activity',async()=>{
  const h=harness();const rows=await h.api.readContentSocialEngagementBatch([target(' Chicago Streets '),target('TITLE-2'),target('missing'),target('Chicago Streets')]);
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[0].table,'titles');assert.equal(h.calls[0].columns,'id');
  assert.deepEqual(h.calls[0].filters,[['in','id',['Chicago Streets','TITLE-2','missing']],['eq','is_published',true],['eq','status','published']]);
  assert.equal(h.calls[1].table,'user_content_relationships');assert.equal(h.calls[1].columns,'title_id');
  assert.deepEqual(h.calls[1].filters,[['in','title_id',['Chicago Streets','TITLE-2']],['eq','user_id','viewer-a'],['eq','relationship_type','like']]);
  assert.deepEqual(plain(rows['title:Chicago Streets']),{likeCount:null,commentCount:null,shareCount:null,viewCount:null,liked:true,canLike:true,reposted:false,canRepost:false});
  assert.equal(rows['title:TITLE-2'].liked,false);assert.equal(rows['title:missing'],undefined);
  assert.deepEqual(h.tokens,['token:viewer-a','token:viewer-a']);
});

test('guest reads public source only, no session capture or relationship query',async()=>{
  const h=harness({guest:true});const rows=await h.api.readContentSocialEngagementBatch([target('Chicago Streets'),target('TITLE-2')]);
  assert.equal(h.calls.length,1);assert.equal(h.captures.length,0);assert.deepEqual(h.tokens,[null]);
  for(const value of Object.values(rows)){
    assert.equal(value.liked,false);assert.equal(value.canLike,false);assert.equal(value.likeCount,null);assert.equal(value.shareCount,null);
  }
});

test('empty title results do not query relationships; read failures stay unavailable',async()=>{
  const h=harness();h.setResponder(()=>({data:[],error:null}));assert.deepEqual(plain(await h.api.readContentSocialEngagementBatch([target('missing')])),{});assert.equal(h.calls.length,1);
  for(const bad of [{data:null,error:null},{data:null,error:new Error('offline')}]){
    const missing=harness();missing.setResponder(()=>bad);await assert.rejects(missing.api.readContentSocialEngagementBatch([target('Chicago Streets')]));assert.equal(missing.calls.length,1);
  }
  const denied=harness();denied.setResponder(call=>call.table==='titles'?{data:[{id:'Chicago Streets'}],error:null}:{data:null,error:new Error('relationship unavailable')});
  await assert.rejects(denied.api.readContentSocialEngagementBatch([target('Chicago Streets')]),/relationship unavailable/);
});

test('account switch while title or relationship transport is pending retires results',async()=>{
  for(const heldTable of ['titles','user_content_relationships']){
    const h=harness(),held=deferred(),started=deferred();
    h.setResponder(call=>{if(call.table===heldTable){started.resolve();return held.promise;}return{data:[{id:'Chicago Streets'}],error:null};});
    const request=h.api.readContentSocialEngagementBatch([target('Chicago Streets')]);await started.promise;h.switch();
    held.resolve({data:heldTable==='titles'?[{id:'Chicago Streets'}]:[{title_id:'Chicago Streets'}],error:null});
    await assert.rejects(request,/retired|account changed/);
    if(heldTable==='titles')assert.equal(h.calls.length,1,'old source response cannot start relationship query');
  }
});

test('title desired-state mutations delegate through actual legacy helper and notify only confirmed account',async()=>{
  const h=harness(),events=[];h.api.subscribeToContentSocialEngagement((...args)=>events.push(args));
  await h.api.setContentSocialLike(target(' Chicago Streets '),true);
  assert.equal(h.calls[0].action,'upsert');assert.equal(h.calls[0].table,'user_content_relationships');
  assert.equal(h.calls[0].payload.title_id,'Chicago Streets');assert.equal(h.calls[0].payload.relationship_type,'like');assert.equal(h.calls[0].payload.user_id,'viewer-a');
  assert.equal(h.calls[0].onConflict,'user_id,title_id,relationship_type');
  assert.deepEqual(h.calls[1].filters,[['eq','user_id','viewer-a'],['eq','title_id','Chicago Streets'],['in','relationship_type',['like','share']]]);
  assert.deepEqual(events,[['title:Chicago Streets','viewer-a:account-a:session-a:false']]);
  await h.api.setContentSocialLike(target('Chicago Streets'),false);
  assert.equal(h.calls[2].action,'delete');assert.deepEqual(h.calls[2].filters,[['eq','user_id','viewer-a'],['eq','title_id','Chicago Streets'],['eq','relationship_type','like']]);
  assert.equal(events.length,2);
});

test('unconfirmed and retired title writes never emit successful invalidation or retry blindly',async()=>{
  const h=harness(),events=[],held=deferred(),started=deferred();h.api.subscribeToContentSocialEngagement((...args)=>events.push(args));
  h.setResponder(call=>{assert.equal(call.action,'upsert');started.resolve();return held.promise;});
  const pending=h.api.setContentSocialLike(target('Chicago Streets'),true);await started.promise;h.switch();held.resolve({data:null,error:null});
  await assert.rejects(pending,/account changed/);assert.equal(events.length,0);assert.equal(h.calls.length,1);
  const failed=harness(),notices=[];failed.api.subscribeToContentSocialEngagement((...args)=>notices.push(args));
  failed.setResponder(()=>({data:null,error:new Error('write outcome unknown')}));
  await assert.rejects(failed.api.setContentSocialLike(target('Chicago Streets'),true),/outcome unknown/);assert.equal(failed.calls.length,1);assert.equal(notices.length,0);
});

test('guest and restore-only subjects cannot mutate and invalid title targets do not reach transport',async()=>{
  const guest=harness({guest:true}),restoring=harness();restoring.restoreOnly();
  for(const h of [guest,restoring]){
    await assert.rejects(h.api.setContentSocialLike(target('Chicago Streets'),true),/active account/);assert.equal(h.calls.length,0);
  }
  const h=harness();await assert.rejects(h.api.setContentSocialLike(target(' '),true),/Invalid content/);assert.equal(h.calls.length,0);
  await assert.rejects(h.api.setContentSocialRepost(target('Chicago Streets'),true),/creator videos/);assert.equal(h.calls.length,0);
});
