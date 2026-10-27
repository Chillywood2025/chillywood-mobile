import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url),ts=require('typescript');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const at='2026-10-27T12:00:00.123456+00:00';
function load(file,mocks={}) {
 const context={exports:{},console,Date,Map,Set,Promise,encodeURIComponent,decodeURIComponent,require:key=>{assert.ok(key in mocks,`unmocked ${key}`);return mocks[key];}};
 const selected=process.env.PROFILE_FEED_TEST_SOURCE_ROOT && !file.endsWith('profileFeedPagination.ts') ? `${process.env.PROFILE_FEED_TEST_SOURCE_ROOT}/${file}`:file;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(selected,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context,{filename:file});return context.exports;
}
const pagination=load('_lib/profileFeedPagination.ts');
function harness() {
 let current='a',fail=false,failCode='',commitBeforeFailure=false,gate=null,attachmentFailure=false,rollbackFailure=false,ambiguousAttachment=false,attachmentReadFailure=false;
 const calls=[],attachments=[],committed=[];
 const posts=Array.from({length:73},(_,i)=>({id:id(i+1),user_id:'owner',body:`post${i+1}`,created_at:at,updated_at:at,visibility:'public',moderation_status:'clean'}));
 const comments=posts.map(p=>({...p,post_id:id(999),user_id:'author',parent_comment_id:null}));
 function client(token='shared') {return {auth:{getSession:async()=>({data:{session:{user:{id:current}}}})},from(table){
   const call={table,token,orders:[],filters:[]};calls.push(call);
   const q={select(){return q;},eq(k,v){call.filters.push([k,v]);return q;},is(){return q;},in(){return q;},order(k,o){call.orders.push([k,o.ascending]);return q;},limit(n){call.limit=n;return q;},or(v){call.or=v;return q;},insert(v){call.write=v;return q;},delete(){call.delete=true;return q;},upsert(v){call.write=v;return q;},returns(){return q;},single(){return q;},then(resolve,reject){return (async()=>{
      if(gate)await gate;
      if(fail){if(call.write&&commitBeforeFailure)committed.push(call.write);return {data:null,error:Object.assign(new Error('offline'),{code:failCode})};}
      if(call.write)return {data:{...call.write,id:id(123),created_at:at},error:null};
      if(call.delete)return {data:null,error:rollbackFailure?new Error('rollback failed'):null};
      if(table==='user_profiles')return {data:[],error:null};
      let rows=table==='profile_post_comments'?[...comments]:[...posts];
      const ascending=call.orders[0]?.[1];rows.sort((a,b)=>ascending?a.id.localeCompare(b.id):b.id.localeCompare(a.id));
      if(call.or){const boundary=call.or.match(/id\.(?:lt|gt)\.([^)]*)/)[1];rows=rows.filter(r=>ascending?r.id>boundary:r.id<boundary);}
      return {data:rows.slice(0,call.limit??rows.length),error:null};
   })().then(resolve,reject);}};return q;},rpc:async()=>({data:[],error:null})};}
 const shared=client();
 const subject=()=>({accessToken:`token-${current}`,authority:{userId:current}});
 const assertCurrent=s=>{if(s.authority.userId!==current)throw new Error('account_changed');};
 const api=load('_lib/profilePosts.ts',{
  '@supabase/supabase-js':{createClient:(_u,_k,o)=>client(o.global.headers.Authorization)},
  './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async expected=>{if(expected&&expected!==current)throw new Error('account_changed');return subject();},assertAccountBoundSupabaseMutationSubjectCurrent:assertCurrent},
  './supabase':{supabase:shared,SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'public'},
  './profileFeedPagination':pagination,
  './userFacingErrors':{UserFacingError:class extends Error {constructor(_code,message){super(message);}}},
  './socialAttachments':{isSocialAttachmentOutcomeAmbiguous:error=>error?.uncertain===true,readSocialAttachmentsForSurfaces:async(_s,_ids,options)=>{if(attachmentReadFailure&&options?.throwOnUnavailable)throw new Error('attachment read unavailable');return new Map();},createSocialAttachmentForSurface:async input=>{attachments.push(input);assertCurrent(input.mutationSubject);if(ambiguousAttachment)throw Object.assign(new Error('unknown commit'),{uncertain:true});if(attachmentFailure){current='b';throw new Error('attachment unavailable');}return {id:'attachment'};}},
 });
 return {api,calls,attachments,committed,fail:(code='',commit=false)=>{fail=true;failCode=code;commitBeforeFailure=commit;},failAttachment:(rollback=false)=>{attachmentFailure=true;rollbackFailure=rollback;},ambiguousAttachment:()=>{ambiguousAttachment=true;},failAttachmentRead:()=>{attachmentReadFailure=true;},switch:()=>{current='b';},pause:()=>{let release;gate=new Promise(r=>{release=r;});return()=>{gate=null;release();};}};
}
test('real post reader keysets all 73 equal-timestamp posts without omission/duplicate',async()=>{
 const h=harness();let cursor=null;const ids=[];
 do{const p=await h.api.readProfilePostsPage('owner',{limit:20,cursor});ids.push(...p.items.map(x=>x.id));cursor=p.nextCursor;}while(cursor);
 assert.equal(ids.length,73);assert.equal(new Set(ids).size,73);assert.equal(ids[0],id(73));
 assert.ok(h.calls.filter(x=>x.table==='profile_posts').every(x=>x.limit===21));
});
test('real comment reader traverses beyond first24 and preserves microsecond keyset',async()=>{
 const h=harness();let cursor=null;const ids=[];
 do{const p=await h.api.readProfilePostCommentsPage(id(999),{limit:24,cursor});ids.push(...p.items.map(x=>x.id));cursor=p.nextCursor;}while(cursor);
 assert.equal(ids.length,73);assert.equal(new Set(ids).size,73);assert.equal(ids[0],id(1));
 assert.ok(h.calls.some(x=>x.or?.includes(at)));
});
test('cursor rejects cross-owner use, injection and malformed dates before transport',async()=>{
 const h=harness();const first=await h.api.readProfilePostsPage('owner',{limit:1});const before=h.calls.length;
 await assert.rejects(h.api.readProfilePostsPage('other',{cursor:first.nextCursor}),/Invalid feed cursor/);
 for(const patch of [{id:'x),or(user_id.neq.x)'},{at:'not-a-date'},{version:2}]){
  const value={...JSON.parse(decodeURIComponent(first.nextCursor)),...patch};
  await assert.rejects(h.api.readProfilePostsPage('owner',{cursor:encodeURIComponent(JSON.stringify(value))}),/Invalid feed cursor/);
 }
 assert.equal(h.calls.length,before);
});
test('all production post/comment list paths propagate unavailable reads, never empty success',async()=>{
 const h=harness();h.fail();for(const run of [()=>h.api.readProfilePosts('owner'),()=>h.api.readProfilePostsByIds([id(1)]),()=>h.api.readProfilePostComments(id(999)),()=>h.api.readProfilePostsPage('owner'),()=>h.api.readProfilePostCommentsPage(id(999))])await assert.rejects(run(),/offline/);
});
test('create post and comment use frozen bearer and pass identical subject to attachment helper',async()=>{
 const h=harness();await h.api.createProfilePost({body:'hello',attachmentFile:{uri:'file'}});await h.api.createProfilePostComment({postId:id(999),body:'reply',attachmentFile:{uri:'file'}});
 assert.ok(h.calls.filter(x=>x.write).every(x=>x.token==='Bearer token-a'&&x.write.user_id==='a'));
 assert.equal(h.attachments.length,2);assert.ok(h.attachments.every(x=>x.mutationSubject.accessToken==='token-a'));
});
test('post create cannot publish stale completion after account switch',async()=>{
 const h=harness(),release=h.pause();const pending=h.api.createProfilePost({body:'hello'});await new Promise(r=>setImmediate(r));h.switch();release();await assert.rejects(pending,/account_changed/);
 assert.equal(h.calls.find(x=>x.write).token,'Bearer token-a');
});
test('old account handler cannot start a create, comment, like or delete as replacement account',async()=>{
 const h=harness();h.switch();
 for(const run of [()=>h.api.createProfilePost({body:'old draft',expectedUserId:'a'}),()=>h.api.createProfilePostComment({postId:id(999),body:'old reply',expectedUserId:'a'}),()=>h.api.deleteProfilePost(id(1),'a'),()=>h.api.deleteProfilePostComment(id(1),'a'),()=>h.api.setProfilePostLike(id(1),true,'a')])await assert.rejects(run(),/account_changed/);
 assert.equal(h.calls.length,0);
});
test('delete uses initiating token and rejects stale completion',async()=>{
 const h=harness(),release=h.pause();const pending=h.api.deleteProfilePost(id(1));await new Promise(r=>setImmediate(r));h.switch();release();await assert.rejects(pending,/account_changed/);
 assert.equal(h.calls.find(x=>x.delete).token,'Bearer token-a');
});
test('attachment rollback cannot delete as replacement account; uncertain rollback explicitly warns of existing post',async()=>{
 const h=harness();h.failAttachment();await assert.rejects(h.api.createProfilePost({body:'hello',attachmentFile:{uri:'file'}}),/attachment unavailable/);
 assert.equal(h.calls.find(x=>x.delete).token,'Bearer token-a');
 const uncertain=harness();uncertain.failAttachment(true);await assert.rejects(uncertain.api.createProfilePostComment({postId:id(999),body:'hello',attachmentFile:{uri:'file'}}),/comment was created.*Refresh before retrying/);
 assert.equal(uncertain.calls.find(x=>x.delete).token,'Bearer token-a');
});
test('unknown attachment commit never triggers destructive parent rollback',async()=>{
 for(const kind of ['post','comment']){
  const h=harness();h.ambiguousAttachment();
  await assert.rejects(kind==='post'?h.api.createProfilePost({body:'hello',attachmentFile:{uri:'file'}}):h.api.createProfilePostComment({postId:id(999),body:'hello',attachmentFile:{uri:'file'}}),/was saved.*could not be confirmed.*Refresh/);
  assert.equal(h.calls.filter(x=>x.delete).length,0);
 }
});
test('strict profile attachment reads propagate unavailable media, not a false text-only post',async()=>{
 const h=harness();h.failAttachmentRead();
 for(const run of [()=>h.api.readProfilePosts('owner'),()=>h.api.readProfilePostsByIds([id(1)]),()=>h.api.readProfilePostComments(id(999)),()=>h.api.readProfilePostsPage('owner'),()=>h.api.readProfilePostCommentsPage(id(999))])await assert.rejects(run(),/attachment read unavailable/);
});
test('unconfirmed parent INSERT warns to refresh rather than silently inviting duplicate submission',async()=>{
 for(const code of ['', '08007', '40003']){const h=harness();h.fail(code,true);await assert.rejects(h.api.createProfilePost({body:'hello'}),/may already be saved.*Refresh/);assert.equal(h.committed.length,1);assert.equal(h.calls.filter(x=>x.write).length,1);assert.equal(h.calls.filter(x=>x.delete).length,0);}
 const rejected=harness();rejected.fail('42501');await assert.rejects(rejected.api.createProfilePost({body:'hello'}),error=>error.code==='42501');
});
test('rank production function does not pin old owner content above fresh following',()=>{
 const module=load('_lib/profileSocialFeed.ts',{'./profileFeedReader':{}});
 const result=module.sortProfileSocialFeedItems([
  {id:'own',type:'my_post',post:{id:'old'},rankScore:980,rankTime:'2025-01-01T00:00:00Z'},
  {id:'following',type:'followed_user_post',post:{id:'new'},rankScore:800,rankTime:'2026-01-01T00:00:00Z'},
 ]);assert.equal(result[0].id,'following');
});

function feedHarness() {
 let authority={userId:'viewer',sessionGeneration:'session1'},rpcFailure=false,discoveryFailure=false,release;
 const calls=[],profileReads=[],hydrations=[];
 let gate=null;
 const sourceRows=Array.from({length:61},(_,i)=>({id:id(100-i),source_id:id(200-i),source_type:i%2?'creator_video':'profile_post',creator_user_id:`creator${i}`,source_context:i%3?'following':'chilly_circle',created_at:at,snapshot_at:at}));
 const module=load('_lib/profileFeedReader.ts',{
  './supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});if(gate)await gate;if(rpcFailure)return {error:new Error('RPC unavailable')};const candidates=sourceRows.filter(row=>!args.p_before_id||row.id<args.p_before_id);return {data:candidates.slice(0,args.p_limit+1),error:null};},from:()=>({select:()=>({in:(_key,ids)=>({returns:async()=>{profileReads.push(ids);return {data:ids.map(user_id=>({user_id,display_name:user_id,profile_avatar_media_status:'flagged',avatar_url:'must-not-render'})),error:null};}})})})}},
  './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a?.userId===b?.userId&&a?.sessionGeneration===b?.sessionGeneration},
  './creatorVideos':{readCreatorVideosByIds:async ids=>{hydrations.push({type:'videos',ids});return ids.map(id=>({id,visibility:'public',ownerId:sourceRows.find(r=>r.source_id===id).creator_user_id}));}},
  './profilePosts':{readProfilePostsByIds:async ids=>{hydrations.push({type:'posts',ids});return ids.map(id=>({id,userId:sourceRows.find(r=>r.source_id===id).creator_user_id}));}},
  './discoveryFeed':{rankDiscoveryFeedItems:items=>items,readPublicDiscoveryFeedItems:async()=>{if(discoveryFailure)throw new Error('Discovery unavailable');return [{id:'outside',owner_user_id:'outsider',created_at:at}];}},
  './profileFeedPagination':pagination,
 });
 return {module,calls,profileReads,hydrations,fail:()=>{rpcFailure=true;},failDiscovery:()=>{discoveryFailure=true;},switch:()=>{authority={userId:'other',sessionGeneration:'session2'};},pause:()=>{gate=new Promise(r=>{release=r;});return()=>{gate=null;release();};}};
}
test('news reader uses one relationship RPC and batch hydration, includes outsider suggestions, paginates >10 actors',async()=>{
 const h=feedHarness();let cursor=null;const ids=[];
 do{const page=await h.module.readOwnProfileFeedPage({limit:20,cursor});ids.push(...page.items.map(x=>x.id));cursor=page.nextCursor;
  assert.ok(page.items.filter(x=>x.actor).every(x=>x.actor.avatarUrl===null),'flagged avatars never hydrate');
 }while(cursor);
 assert.equal(h.calls.length,4);assert.equal(h.profileReads.length,4);assert.equal(h.hydrations.length,8);
 assert.equal(ids.length,62);assert.equal(new Set(ids).size,62);assert.ok(ids.includes('suggested-outside'));
 assert.equal(h.calls[0].args.p_snapshot_at,null);assert.ok(h.calls.slice(1).every(c=>c.args.p_snapshot_at===at));
 assert.ok(h.profileReads.every(ids=>ids.length<=20));
});
test('news reader propagates relationship/discovery failures rather than claiming empty',async()=>{
 const a=feedHarness();a.fail();await assert.rejects(a.module.readOwnProfileFeedPage(),/RPC unavailable/);
 const b=feedHarness();b.failDiscovery();await assert.rejects(b.module.readOwnProfileFeedPage(),/Discovery unavailable/);
});
test('news reader discards response on session switch before hydration',async()=>{
 const h=feedHarness(),release=h.pause();const pending=h.module.readOwnProfileFeedPage();h.switch();release();await assert.rejects(pending,/account changed/);assert.equal(h.hydrations.length,0);
});
