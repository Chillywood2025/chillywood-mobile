import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const {PostgrestClient}=require('@supabase/postgrest-js');
const source=ts.transpileModule(fs.readFileSync('_lib/discoveryRankingSignals.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const viewer='viewer', candidate=id=>({owner_user_id:id,channel_user_id:id,host_user_id:id});
const authority=(id=viewer,generation='one')=>({userId:id,accountId:id,state:'ACTIVE',restoreOnly:false,sessionGeneration:generation});
function setup(data={}) {
  let account=authority(),respond;
  const requests=[];
  const db=new PostgrestClient('https://offline.invalid/rest/v1',{fetch:async (input,options)=>{
    const url=new URL(input);requests.push({url,options});
    if(respond)return respond(url,options);
    let rows=data[url.pathname.split('/').at(-1)]??[];
    for(const [key,value] of url.searchParams){
      if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3));
      if(value.startsWith('in.(')){const ids=value.slice(4,-1).split(',');rows=rows.filter(row=>ids.includes(String(row[key])));}
    }
    rows=rows.slice(0,Number(url.searchParams.get('limit')??Infinity));
    return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json'}});
  }});
  const exports={};
  vm.runInNewContext(source,{exports,require:name=>{
    if(name==='./supabase')return {supabase:db};
    if(name==='./accountSessionAuthority')return {getCurrentAccountSessionAuthoritySnapshot:()=>account,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&['userId','accountId','sessionGeneration','restoreOnly'].every(key=>a[key]===b[key])};
    throw Error(name);
  }});
  return {read:exports.readDiscoveryCandidateRankingSignals,requests,account:value=>{account=value;},respond:value=>{respond=value;}};
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('actual PostgREST reads classify both friendship directions and honor both block directions',async()=>{
  const h=setup({
    channel_followers:['a','b','c','d','outside'].map(channel_user_id=>({channel_user_id,follower_user_id:viewer})),
    user_friendships:[
      {user_low_id:viewer,user_high_id:'a',status:'active'},
      {user_low_id:'b',user_high_id:viewer,status:'active'},
      {user_low_id:viewer,user_high_id:'c',status:'active'},
      {user_low_id:'d',user_high_id:viewer,status:'active'},
      {user_low_id:viewer,user_high_id:'pending',status:'pending'},
    ],
    channel_audience_blocks:[{channel_user_id:viewer,blocked_user_id:'c'},{channel_user_id:'d',blocked_user_id:viewer}],
  });
  const result=plain(await h.read(['a','b','c','d','pending'].map(candidate)));
  assert.deepEqual(result,{followedChannelIds:['a','b'],chillyCircleUserIds:['a','b'],categoryKeys:[]});
  assert.equal(h.requests.length,5);
  const byTable=name=>h.requests.filter(r=>r.url.pathname.endsWith('/'+name)).map(r=>r.url.searchParams);
  assert.equal(byTable('channel_followers')[0].get('follower_user_id'),'eq.viewer');
  assert.equal(byTable('channel_followers')[0].get('channel_user_id'),'in.(a,b,c,d,pending)');
  assert.equal(byTable('user_friendships')[0].get('user_low_id'),'eq.viewer');
  assert.equal(byTable('user_friendships')[1].get('user_high_id'),'eq.viewer');
  for(const params of byTable('user_friendships'))assert.equal(params.get('status'),'eq.active');
  assert.equal(byTable('channel_audience_blocks')[0].get('channel_user_id'),'eq.viewer');
  assert.equal(byTable('channel_audience_blocks')[1].get('blocked_user_id'),'eq.viewer');
});
test('a 10000-edge graph remains five candidate-bounded queries with shared abort signal',async()=>{
  const h=setup({user_friendships:Array.from({length:10000},(_,i)=>({user_low_id:viewer,user_high_id:`id${i}`,status:'active'}))});
  const controller=new AbortController();
  const items=Array.from({length:50},(_,i)=>({owner_user_id:`id${i*3}`,channel_user_id:`id${i*3+1}`,host_user_id:`id${i*3+2}`}));
  const result=await h.read(items,controller.signal);
  assert.equal(result.chillyCircleUserIds.length,150);
  assert.equal(h.requests.length,5);
  for(const {url,options} of h.requests){
    assert.equal(url.searchParams.get('limit'),'300');
    assert.equal([...url.searchParams.values()].filter(value=>value.startsWith('in.(')).length,1);
    assert.equal(options.signal,controller.signal);
  }
});
test('candidate identity deduplication/self exclusion and size guards occur before transport',async()=>{
  const h=setup();await h.read([candidate(' a '),candidate('a'),candidate(viewer),candidate(null)]);
  assert.ok(h.requests.every(r=>[...r.url.searchParams.values()].some(v=>v==='in.(a)')));
  const before=h.requests.length;
  await assert.rejects(h.read(Array.from({length:301},(_,i)=>candidate(String(i)))),/Too many/);
  await assert.rejects(h.read(Array.from({length:101},(_,i)=>({owner_user_id:`a${i}`,channel_user_id:`b${i}`,host_user_id:`c${i}`}))),/Too many/);
  assert.equal(h.requests.length,before);
});
test('signed out/recovery authority or pre-aborted read makes no queries',async()=>{
  const h=setup();
  for(const account of [null,{...authority(),restoreOnly:true},{...authority(),accountId:'different'}]){
    h.account(account);assert.deepEqual(plain(await h.read([candidate('a')])),{followedChannelIds:[],chillyCircleUserIds:[],categoryKeys:[]});
  }
  const controller=new AbortController();controller.abort();
  await assert.rejects(h.read([candidate('a')],controller.signal),/aborted/);
  assert.equal(h.requests.length,0);
});
test('a failed block read is not interpreted as unblocked relationships',async()=>{
  const h=setup();h.respond(url=>new Response(url.pathname.endsWith('channel_audience_blocks')?'{}':'[]',{status:url.pathname.endsWith('channel_audience_blocks')?503:200,headers:{'Content-Type':'application/json'}}));
  await assert.rejects(h.read([candidate('a')]),/unavailable/);
});
test('late old-session result and midflight abort cannot return ranking identities',async()=>{
  for(const action of ['account','abort']){
    const h=setup(),controller=new AbortController();let release;
    const held=new Promise(resolve=>{release=resolve;});
    h.respond(async()=>{await held;return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});});
    const reading=h.read([candidate('a')],controller.signal);
    await Promise.resolve();
    if(action==='account')h.account(authority(viewer,'replacement'));else controller.abort();
    release();await assert.rejects(reading,action==='account'?/account changed/:/aborted/);
  }
});
