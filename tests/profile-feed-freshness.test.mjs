import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),ts=require('typescript');
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const load=(file,mocks={})=>{const c={exports:{},Date,Math,AbortController,setTimeout,clearTimeout,require:name=>{assert.ok(name in mocks,`unmodeled import ${name}`);return mocks[name];}};vm.runInNewContext(compile(read(file)),c);return c.exports;};
const api=load('_lib/profileFeedFreshness.ts');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function clock(check=async()=>{}){let time=0,sequence=0,current=true,calls=0;const timers=new Map();
 const controller=api.startProfileFeedFreshness({check:signal=>{calls++;return check(signal);},isCurrent:()=>current,now:()=>time,random:()=>0.5,
 schedule:(fn,delay)=>{timers.set(++sequence,{fn,due:time+delay});return sequence;},cancel:id=>timers.delete(id)});
 return{controller,timers,get calls(){return calls;},retire:()=>{current=false;},async advance(ms){const end=time+ms;while(true){const next=[...timers].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)break;time=next[1].due;timers.delete(next[0]);next[1].fn();for(let i=0;i<8;i++)await Promise.resolve();}time=end;},time:()=>time};}
test('active fallback is jitter-bounded, single flight, and never schedules after disposal',async()=>{
 const hold=deferred(),h=clock(()=>hold.promise);await h.advance(149999);assert.equal(h.calls,0);await h.advance(1);assert.equal(h.calls,1);
 for(let i=0;i<100;i++)h.controller.hint();await h.advance(19999);assert.equal(h.calls,1);h.controller.dispose();hold.resolve();for(let i=0;i<8;i++)await Promise.resolve();assert.equal(h.timers.size,0);
});
test('continuous hints cannot starve the bounded check or create a notification storm',async()=>{
 const h=clock();for(let i=0;i<60;i++){h.controller.hint();await h.advance(500);}assert.equal(h.calls,1);assert.equal(h.time(),30000);
 for(let i=0;i<60;i++){h.controller.hint();await h.advance(500);}assert.equal(h.calls,2);h.controller.dispose();
});
test('errors back off and retired background/account lifetime cannot dispatch a probe',async()=>{
 const h=clock(async()=>{throw new Error('offline');});await h.advance(150000);assert.equal(h.calls,1);await h.advance(299999);assert.equal(h.calls,1);await h.advance(1);assert.equal(h.calls,2);
 h.retire();h.controller.hint();await h.advance(600000);assert.equal(h.calls,2);assert.equal(h.timers.size,0);
});
test('twenty-second deadline aborts a hung request without overlapping a source that ignores abort',async()=>{
 const signals=[],hold=deferred(),h=clock(signal=>{signals.push(signal);return hold.promise;});
 await h.advance(150000);assert.equal(signals[0].aborted,false);await h.advance(20000);assert.equal(signals[0].aborted,true);
 await h.advance(600000);assert.equal(h.calls,1);assert.equal(h.timers.size,0);
 hold.resolve();for(let i=0;i<8;i++)await Promise.resolve();
 await h.advance(299999);assert.equal(h.calls,1);await h.advance(1);assert.equal(h.calls,2);
 h.controller.dispose();assert.equal(h.timers.size,0);
});
test('early failure aborts the sibling request rather than leaving transport pending',async()=>{
 let signal;const hold=deferred(),h=clock(value=>{signal=value;return Promise.all([Promise.reject(new Error('head failed')),hold.promise]);});
 await h.advance(150000);assert.equal(signal.aborted,true);h.controller.dispose();hold.resolve();
});
test('actual engagement reader forwards abort and rejects late transport success',async()=>{
 const file=read('_lib/profilePosts.ts'),tree=ts.createSourceFile('posts.ts',file,ts.ScriptTarget.Latest,true);
 const fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='readProfilePostEngagementStates');
 const hold=deferred();let received;
 const request={abortSignal:signal=>{received=signal;return request;},then:(yes,no)=>hold.promise.then(yes,no)};
 const c={exports:{},normalizeText:value=>String(value),getSignedInUserId:async()=> 'viewer',supabase:{rpc:()=>request}};
 vm.runInNewContext(compile(fn.getText(tree)),c);const controller=new AbortController();
 const pending=c.exports.readProfilePostEngagementStates(['p'],controller.signal);await new Promise(resolve=>setImmediate(resolve));assert.equal(received,controller.signal);
 controller.abort();hold.resolve({data:[{post_id:'p',like_count:5,comment_count:1,liked_by_viewer:true}],error:null});await assert.rejects(pending,/retired/);
});
test('head comparison preserves microsecond/tie order, ignores local posts and old replacement heads',()=>{
 const old={id:'old',createdAt:'2026-10-27T22:00:00.123456Z',rowId:'b'};
 assert.equal(api.hasNewProfileFeedHead({...old,id:'new',createdAt:'2026-10-27T22:00:00.123455Z'},[],old),false);
 assert.equal(api.hasNewProfileFeedHead({...old,id:'new',rowId:'a'},[],old),false);
 assert.equal(api.hasNewProfileFeedHead({...old,id:'new',rowId:'c'},[],old),true);
 assert.equal(api.hasNewProfileFeedHead({...old,id:'local',rowId:'c'},[{id:'local',createdAt:old.createdAt}],old),false);
 assert.equal(api.hasNewProfileFeedHead({...old,id:'new',rowId:'c'},[{id:'local',createdAt:'2026-10-27T22:00:01Z'}],old),false);
 assert.equal(api.hasNewProfileFeedHead(null,[],old),false);assert.equal(api.hasNewProfileFeedHead(old,[],null),true);
 const canonical={id:'baseline',createdAt:'2026-10-27T22:00:00.123456+00:00',rowId:'00000000-0000-4000-8000-000000000001'};
 assert.equal(api.hasNewProfileFeedHead({id:'later',createdAt:'2026-10-28T00:30:00.123456+02:30',rowId:'00000000-0000-4000-8000-000000000002'},[],canonical),true);
 assert.equal(api.hasNewProfileFeedHead({id:'earlier',createdAt:'2026-10-27T17:00:00.123455-05:00',rowId:'ffffffff-ffff-4fff-8fff-ffffffffffff'},[],canonical),false);
});
function reader(){let authority={userId:'a',sessionGeneration:'one'},result={data:[],error:null},hold=null;const calls=[];
 const module=load('_lib/profileFeedReader.ts',{'./supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});if(hold)await hold;return result;},from:()=>{throw new Error('head must not hydrate');}}},
 './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration},
 './creatorVideos':{},'./discoveryFeed':{},'./profilePosts':{},'./profileFeedPagination':{}});
 return{module,calls,set:value=>result=value,switch:()=>authority={...authority,sessionGeneration:'two'},hold:value=>hold=value,signOut:()=>authority=null};}
test('real head reader requests one source-authorized metadata page, no hydration, post/video coverage and current session',async()=>{
 const h=reader();for(const type of ['profile_post','creator_video']){h.set({data:[{id:'row',source_id:'source',source_type:type,created_at:'2026-10-27T22:00:00Z'}],error:null});const head=await h.module.readOwnProfileFeedHead();assert.equal(head.id,`relationship-${type}-source`);assert.equal(head.rowId,'row');}
 assert.ok(h.calls.every(c=>c.name==='read_profile_relationship_feed_page'&&c.args.p_limit===1&&c.args.p_snapshot_at===null));
 const pending=deferred();h.hold(pending.promise);const p=h.module.readOwnProfileFeedHead();h.switch();pending.resolve();await assert.rejects(p,/account changed/);
 h.signOut();await assert.rejects(h.module.readOwnProfileFeedHead(),/Sign in/);
});
test('head reader failures are not interpreted as no new posts',async()=>{const h=reader();h.set({data:null,error:new Error('offline')});await assert.rejects(h.module.readOwnProfileFeedHead(),/offline/);h.set({data:null,error:null});await assert.rejects(h.module.readOwnProfileFeedHead(),/unavailable/);});
let route=read('app/profile/[userId].tsx');
if(process.env.PROFILE_FRESHNESS_MUTANT==='identity')route=route.replace('if (signal.aborted || !current() || revision !== freshnessSnapshotRef.current.refreshRevision) return;', '').replace('if (signal.aborted || !current() || revision !== freshnessSnapshotRef.current.refreshRevision) return previous;', '');
const ast=ts.createSourceFile('profile.tsx',route,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const screen=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ProfileScreen');
const effect=screen.body.statements.find(n=>ts.isExpressionStatement(n)&&n.getText(ast).startsWith('useEffect(')&&n.getText(ast).includes('startProfileFeedFreshness'));
assert.ok(effect,'test must execute production freshness effect');
function mountedEffect(overrides={}){let cleanup,options,unsubscribe=0,disposed=0,current=true;const prompts=[],calls=[];
 const c={exports:{},AbortController,currentUserId:'viewer',focused:true,feedAppActive:true,activeTab:'home',profilePostsReady:true,canViewFullProfile:true,isOfficialProfile:false,isSelfProfile:true,socialIdentity:'viewer:one',authority:{userId:'viewer',accountId:'viewer',sessionGeneration:'one'},AppState:{currentState:'active'},
 isSocialIdentityCurrent:()=>current,freshnessSnapshotRef:{current:{refreshRevision:1,items:[],posts:[],head:null}},freshnessReadPendingRef:{current:false},visibleFeedPostIdsRef:{current:Array.from({length:20},(_,i)=>`p${i}`)},engagementRevisionsRef:{current:new Map()},
 profilePostUiById:{p0:{engagement:{likeCount:1,commentCount:1},commentsOpen:true,comments:[{id:'old'}],commentDraft:'unsent',commentAttachmentFile:{uri:'local'},commentsCursor:'next'}},
 readOwnProfileFeedHead:async()=>{calls.push('head');return{id:'new',createdAt:'2026-10-27T22:00:00Z',rowId:'row'};},readProfilePostEngagementStates:async ids=>{calls.push(ids);return{p0:{likeCount:2,commentCount:2}};},
 setFeedFreshness:value=>prompts.push(typeof value==='function'?value(prompts.at(-1)??{identity:'viewer:one',available:false}):value),hasNewProfileFeedHead:api.hasNewProfileFeedHead,
 startProfileFeedFreshness:value=>{options={...value,check:(signal=new AbortController().signal)=>value.check(signal)};return{hint:()=>{},dispose:()=>disposed++};},getNotificationActivityOwnerKey:binding=>JSON.stringify([binding.userId,binding.accountId,binding.sessionGeneration]),
 readSharedLiveSnapshot:load('_lib/sharedLiveRead.ts').readSharedLiveSnapshot,
 subscribeToNotificationActivity:()=>()=>unsubscribe++,useEffect:fn=>{cleanup=fn();},...overrides};
 c.freshnessAuthorityRef={current:c.authority};c.freshnessIdentityCurrentRef={current:c.isSocialIdentityCurrent};
 c.setProfilePostUiById=fn=>{c.profilePostUiById=fn(c.profilePostUiById);};vm.runInNewContext(compile(effect.getText(ast)),c);
 return{c,prompts,calls,get options(){return options;},stop:()=>cleanup?.(),retire:()=>current=false,get disposed(){return disposed;},get unsubscribe(){return unsubscribe;}};}
test('production effect only probes active authenticated feed and visitor never reads owner news feed',async()=>{
 for(const overrides of [{focused:false},{feedAppActive:false},{activeTab:'about'},{currentUserId:''},{canViewFullProfile:false},{profilePostsReady:false}])assert.equal(mountedEffect(overrides).options,undefined);
 const m=mountedEffect({isSelfProfile:false});await m.options.check();assert.equal(m.calls.includes('head'),false);assert.equal(m.prompts.length,0);assert.equal(m.calls[0].length,12);m.stop();assert.equal(m.disposed,1);assert.equal(m.unsubscribe,1);
});
test('production quiet refresh preserves thread/draft/paging and exposes changed-comment prompt without replacing feed',async()=>{
 const m=mountedEffect();await m.options.check();assert.equal(m.prompts[0].available,true);const p=m.c.profilePostUiById.p0;
 assert.equal(p.engagement.likeCount,2);assert.equal(p.commentsRefreshAvailable,true);assert.equal(p.commentDraft,'unsent');assert.equal(p.commentAttachmentFile.uri,'local');assert.equal(p.comments[0].id,'old');assert.equal(p.commentsCursor,'next');m.stop();
});
test('overlapping production consumers share only metadata while engagement revisions remain local',async()=>{
 const head=deferred(),counts=deferred(),shared=load('_lib/sharedLiveRead.ts').readSharedLiveSnapshot;
 let headReads=0,engagementReads=0;
 const overrides={readSharedLiveSnapshot:shared,readOwnProfileFeedHead:()=>{headReads++;return head.promise;},readProfilePostEngagementStates:ids=>{engagementReads++;assert.equal(ids.length,12);return counts.promise;}};
 const a=mountedEffect(overrides),b=mountedEffect(overrides),p=a.options.check(),q=b.options.check();
 await Promise.resolve();assert.equal(headReads,1);assert.equal(engagementReads,2);
 a.c.engagementRevisionsRef.current.set('viewer:one:p0',1);
 head.resolve({id:'new',createdAt:'2026-10-27T22:00:00Z',rowId:'row'});counts.resolve({p0:{likeCount:8,commentCount:2}});
 await Promise.all([p,q]);assert.equal(a.c.profilePostUiById.p0.engagement.likeCount,1);assert.equal(b.c.profilePostUiById.p0.engagement.likeCount,8);
 for(const m of [a,b]){assert.equal(m.prompts.at(-1).available,true);assert.equal(m.c.profilePostUiById.p0.commentDraft,'unsent');m.stop();}
});
test('production head sharing is separated by exact account, session, social identity and refresh revision',async()=>{
 const head=deferred(),shared=load('_lib/sharedLiveRead.ts').readSharedLiveSnapshot;let calls=0;
 const common={readSharedLiveSnapshot:shared,readOwnProfileFeedHead:()=>{calls++;return head.promise;}};
 const consumers=[mountedEffect(common),mountedEffect(common),
  mountedEffect({...common,authority:{userId:'viewer',accountId:'other-account',sessionGeneration:'one'}}),
  mountedEffect({...common,authority:{userId:'viewer',accountId:'viewer',sessionGeneration:'two'}}),
  mountedEffect({...common,socialIdentity:'other-profile:one'}),
  mountedEffect({...common,freshnessSnapshotRef:{current:{refreshRevision:2,items:[],posts:[],head:null}}})];
 const pending=consumers.map(m=>m.options.check());await Promise.resolve();assert.equal(calls,5);
 head.resolve(null);await Promise.all(pending);for(const m of consumers)m.stop();
});
test('aborting one production consumer does not cancel another consumer metadata read',async()=>{
 const head=deferred(),shared=load('_lib/sharedLiveRead.ts').readSharedLiveSnapshot;let sharedSignal;
 const common={readSharedLiveSnapshot:shared,readOwnProfileFeedHead:signal=>{sharedSignal=signal;return head.promise;}};
 const a=mountedEffect(common),b=mountedEffect(common),controller=new AbortController();
 const p=a.options.check(controller.signal),q=b.options.check();await Promise.resolve();
 const rejected=assert.rejects(p,/retired/);controller.abort();await rejected;assert.equal(sharedSignal.aborted,false);
 head.resolve({id:'new',createdAt:'2026-10-27T22:00:00Z',rowId:'row'});await q;
 assert.equal(a.prompts.length,0);assert.equal(b.prompts.at(-1).available,true);a.stop();b.stop();
});
test('failed production head cancels engagement but retains its flight until abort-ignoring engagement settles',async()=>{
 const counts=deferred();let signal,settled=false;
 const m=mountedEffect({readOwnProfileFeedHead:async()=>{throw new Error('head offline');},readProfilePostEngagementStates:(_ids,value)=>{signal=value;return counts.promise;}});
 const pending=m.options.check().finally(()=>{settled=true;});const rejected=assert.rejects(pending,/head offline/);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(signal.aborted,true);assert.equal(settled,false);
 counts.resolve({p0:{likeCount:9,commentCount:2}});await rejected;assert.equal(m.c.profilePostUiById.p0.engagement.likeCount,1);m.stop();
});
test('detected prompt remains sticky when a newer known local post becomes head',async()=>{
 const m=mountedEffect();await m.options.check();assert.equal(m.prompts.at(-1).available,true);
 m.c.freshnessSnapshotRef.current.posts=[{id:'local',createdAt:'2026-10-27T22:00:01Z'}];
 m.c.readOwnProfileFeedHead=async()=>({id:'relationship-profile_post-local',createdAt:'2026-10-27T22:00:01Z',rowId:'local-row'});
 await m.options.check();assert.equal(m.prompts.at(-1).available,true);m.stop();
});
test('late response from a transport ignoring abort cannot publish after deadline',async()=>{
 const hold=deferred(),m=mountedEffect({readOwnProfileFeedHead:()=>hold.promise}),request=new AbortController();
 const pending=m.options.check(request.signal);await Promise.resolve();const rejected=assert.rejects(pending,/retired/);request.abort();hold.resolve({id:'new',createdAt:'2026-10-27T22:00:00Z',rowId:'row'});await rejected;
 assert.equal(m.prompts.length,0);assert.equal(m.c.profilePostUiById.p0.engagement.likeCount,1);m.stop();
});
test('actual captured route identity rejects replacement render before cleanup, including viewer-specific likes',async()=>{
 const declaration=screen.body.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='isSocialIdentityCurrent'));
 const identityRef={current:'viewer:one'};let snapshot={userId:'viewer',sessionGeneration:'one'};
 const context={exports:{}};vm.runInNewContext(compile(`exports.bind=function(authority,socialIdentity,socialIdentityRef,getCurrentAccountSessionAuthoritySnapshot,sameAccountSessionAuthority,useCallback){${declaration.getText(ast)};return isSocialIdentityCurrent;};`),context);
 const bind=(authority,identity)=>context.exports.bind(authority,identity,identityRef,()=>snapshot,(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration,fn=>fn);
 const oldPredicate=bind(snapshot,'viewer:one'),hold=deferred();
 const m=mountedEffect({isSocialIdentityCurrent:oldPredicate,readOwnProfileFeedHead:()=>hold.promise,readProfilePostEngagementStates:async()=>({p0:{likeCount:50,commentCount:1,likedByViewer:true}})});
 const pending=m.options.check();identityRef.current='other:two';snapshot={userId:'other',sessionGeneration:'two'};
 m.c.freshnessIdentityCurrentRef.current=bind(snapshot,'other:two');assert.equal(m.c.freshnessIdentityCurrentRef.current(),true);assert.equal(oldPredicate(),false);
 m.c.profilePostUiById={p0:{engagement:{likeCount:2,commentCount:1,likedByViewer:false},commentDraft:'B draft'}};
 hold.resolve({id:'new',createdAt:'2026-10-27T22:00:00Z',rowId:'row'});await pending;
 assert.equal(m.prompts.length,0);assert.equal(m.c.profilePostUiById.p0.engagement.likedByViewer,false);assert.equal(m.c.profilePostUiById.p0.commentDraft,'B draft');m.stop();
});
for(const change of ['account','replacement-ref-before-cleanup','background','refresh','dispose','mutation'])test(`production held freshness response cannot overwrite ${change}`,async()=>{
 const hold=deferred(),m=mountedEffect({readOwnProfileFeedHead:()=>hold.promise});const pending=m.options.check();
 if(change==='account')m.retire();if(change==='background')m.c.AppState.currentState='background';if(change==='refresh')m.c.freshnessSnapshotRef.current.refreshRevision++;
 if(change==='replacement-ref-before-cleanup'){m.retire();m.c.freshnessIdentityCurrentRef.current=()=>true;}
 if(change==='dispose')m.stop();if(change==='mutation')m.c.engagementRevisionsRef.current.set('viewer:one:p0',1);
 hold.resolve({id:'new',createdAt:'2026-10-27T22:00:00Z',rowId:'row'});await pending;assert.equal(m.c.profilePostUiById.p0.engagement.likeCount,1);if(change!=='mutation')assert.equal(m.prompts.length,0);m.stop();
});
test('negative control removing actual publication guards is detected',()=>{
 if(process.env.PROFILE_FRESHNESS_MUTANT)return;
 const env={...process.env,PROFILE_FRESHNESS_MUTANT:'identity'};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--test','--test-name-pattern=production held freshness response cannot overwrite account',fileURLToPath(import.meta.url)],{env,encoding:'utf8'});
 assert.notEqual(result.status,0,'removing production account/refresh guard must fail race test');
 assert.match(result.stdout,/production held freshness response cannot overwrite account/);
});
test('actual New posts button only scrolls after acknowledged refresh and current identity',async()=>{
 let button;
 function visit(node){if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='accessibilityLabel'&&p.initializer?.text==='Refresh feed updates'))button=node;ts.forEachChild(node,visit);}
 visit(ast);assert.ok(button,'actual production prompt button');
 for(const outcome of ['failed','success','retired']){
  const hold=deferred(),calls=[];const c={exports:{},React:{createElement:(type,props,...children)=>({type,props:{...props,children}})},TouchableOpacity:'button',Text:'text',styles:{},profilePostsReady:true,feedFreshness:{retry:false},
   feedPages:{refresh:()=>hold.promise},isSocialIdentityCurrent:()=>outcome!=='retired',setSocialRefresh:()=>calls.push('social'),scrollViewRef:{current:{scrollToOffset:()=>calls.push('scroll')}}};
  vm.runInNewContext(ts.transpileModule(`exports.button=(${button.getText(ast)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,c);
  c.exports.button.props.onPress();assert.equal(calls.length,0);hold.resolve(outcome==='failed'?undefined:true);await hold.promise;await Promise.resolve();
  assert.deepEqual(calls,outcome==='success'?['social','scroll']:[]);
 }
});
test('actual explicit comment refresh preserves draft and attachment, clears prompt only on success',async()=>{
 const declaration=screen.body.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='loadProfilePostComments'));
 assert.ok(declaration);
 for(const failure of [false,true]){
  let state={comments:[{id:'old'}],commentsCursor:'older-page',commentsRefreshAvailable:true,commentDraft:'unsent',commentAttachmentFile:{uri:'local'},replyTargetCommentId:'reply'};
  const c={exports:{},socialIdentity:'viewer:one',socialActionKeysRef:{current:new Set()},commentRevisionsRef:{current:new Map()},profilePostUiById:{p:state},
   updateProfilePostUiState:(_id,updater)=>state=updater(state),readProfilePostCommentsPage:async()=>{if(failure)throw new Error('offline');return{items:[{id:'new'}],nextCursor:'new-page',hasMore:true};}};
  vm.runInNewContext(compile(declaration.getText(ast)+';exports.load=loadProfilePostComments;'),c);await c.exports.load('p');
  assert.equal(state.commentDraft,'unsent');assert.equal(state.commentAttachmentFile.uri,'local');assert.equal(state.replyTargetCommentId,'reply');
  assert.equal(state.commentsRefreshAvailable,failure);assert.equal(state.comments[0].id,failure?'old':'new');
 }
});
test('actual shared comment UI publisher rejects queued updater after identity replacement',()=>{
 const declaration=screen.body.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='updateProfilePostUiState'));
 let current=true,queued;
 const c={exports:{},isSocialIdentityCurrent:()=>current,setProfilePostUiById:updater=>queued=updater};
 vm.runInNewContext(compile(declaration.getText(ast)+';exports.update=updateProfilePostUiState;'),c);
 c.exports.update('p',state=>({...state,comments:[{id:'A'}],commentDraft:''}));assert.equal(typeof queued,'function');current=false;
 const replacement={p:{comments:[{id:'B'}],commentDraft:'B draft'}};assert.equal(queued(replacement),replacement);
});
test('mounted production effect survives typing and replacement authority object rerenders without resetting timer',async()=>{
 const React=require('react'),{createRoot}=require('react-dom/client');
 const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
 const container={addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'};
 doc.documentElement=container;globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const m=mountedEffect();m.stop();let starts=0,stops=0;
 m.c.useEffect=React.useEffect;m.c.startProfileFeedFreshness=()=>{starts++;return{hint:noop,dispose:()=>stops++};};
 const context=vm.createContext(m.c),code=compile(effect.getText(ast));
 function Host(){vm.runInContext(code,context);return null;}
 const root=createRoot(container);
 try{
  await React.act(async()=>root.render(React.createElement(Host)));
  for(let i=0;i<5;i++){
   m.c.profilePostUiById.p0.commentDraft+='x';m.c.authority={userId:'viewer'};
   m.c.freshnessAuthorityRef.current=m.c.authority;m.c.freshnessIdentityCurrentRef.current=()=>true;
   await React.act(async()=>root.render(React.createElement(Host)));
  }
  assert.equal(starts,1);assert.equal(stops,0);
  m.c.focused=false;await React.act(async()=>root.render(React.createElement(Host)));assert.equal(stops,1);
 }finally{await React.act(async()=>root.unmount());}
});
for(const transition of ['blur','background'])test(`mounted ${transition} and resume retains local engagement ownership until source settlement`,async()=>{
 const React=require('react'),{createRoot}=require('react-dom/client');
 const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
 const container={addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'};
 doc.documentElement=container;globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const held=deferred();let reads=0,options,request,lastSignal;
 const m=mountedEffect({readProfilePostEngagementStates:(_ids,signal)=>{reads++;lastSignal=signal;return reads===1?held.promise:Promise.resolve({p0:{likeCount:4,commentCount:3}});}});m.stop();
 m.c.useEffect=React.useEffect;
 m.c.startProfileFeedFreshness=value=>{options=value;const owned=new AbortController();request=owned;return{hint:noop,dispose:()=>owned.abort()};};
 const context=vm.createContext(m.c),code=compile(effect.getText(ast));
 function Host(){vm.runInContext(code,context);return null;}
 const root=createRoot(container),render=()=>React.act(async()=>root.render(React.createElement(Host)));
 try{
  await render();const pending=options.check(request.signal);await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,1);
  if(transition==='blur')m.c.focused=false;else{m.c.feedAppActive=false;m.c.AppState.currentState='background';}
  await render();assert.equal(lastSignal.aborted,true);
  m.c.focused=true;m.c.feedAppActive=true;m.c.AppState.currentState='active';await render();
  for(let i=0;i<3;i++)await options.check(request.signal);
  assert.equal(reads,1,'resume cannot overlap an abort-ignoring local engagement reader');
  held.resolve({p0:{likeCount:99,commentCount:99}});await pending;
  assert.equal(m.c.profilePostUiById.p0.engagement.likeCount,1,'retired response cannot publish');
  await options.check(request.signal);assert.equal(reads,2);assert.equal(m.c.profilePostUiById.p0.engagement.likeCount,4);
  assert.equal(m.c.profilePostUiById.p0.commentDraft,'unsent');
 }finally{held.resolve({});await React.act(async()=>root.unmount());}
});
