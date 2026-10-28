import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require=createRequire(import.meta.url), React=require('react'), ts=require('typescript');
const {createRoot}=require('react-dom/client');
let source=fs.readFileSync(new URL('../app/profile/[userId].tsx',import.meta.url),'utf8');
if(process.env.PROFILE_RACE_MUTANT==='feed')source=source.replace(/      if \(startedAtMutation !== mutationRevision.current\) \{[\s\S]*?\n      \}/,'');
const ast=ts.createSourceFile('profile.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const hook=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='useProfileFeedPages');
assert.ok(hook,'The tested hook must be the production route hook');
const compiled=ts.transpileModule(hook.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const owner=(generation='one')=>({userId:'viewer',accountId:'viewer',sessionGeneration:generation,state:'ACTIVE',restoreOnly:false});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const post=id=>({id,userId:'creator',body:id,visibility:'public',attachments:[]});
const page=(ids,cursor=null)=>({items:ids.map(post),nextCursor:cursor,hasMore:!!cursor});

async function mount(t,overrides={}) {
  let authority=owner(), focused=true, snapshot, input={userId:'creator',own:false,enabled:true,postId:'',...overrides};
  const requests=[],details=[],listeners=new Set();
  const reader=(kind,args)=>{const pending=deferred();requests.push({kind,args,...pending});return pending.promise;};
  const context=vm.createContext({...React,exports:{},useSession:()=>({authority,authorityStatus:authority?'active':'signed_out'}),useIsFocused:()=>focused,
    getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration,
    readProfilePostsPage:(id,args)=>reader('public',{id,...args}),readOwnProfileFeedPage:args=>reader('own',args),
    readProfilePostById:id=>{const pending=deferred();details.push({id,...pending});return pending.promise;},
    AppState:{addEventListener:(_event,callback)=>{listeners.add(callback);return{remove:()=>listeners.delete(callback)};}}});
  vm.runInContext(compiled,context);
  function Host(){snapshot=context.exports.useProfileFeedPages(input.userId,input.own,input.enabled,input.postId);return null;}
  const root=createRoot(container());const render=()=>React.act(async()=>root.render(React.createElement(Host)));
  t.after(async()=>{await React.act(async()=>root.unmount());assert.equal(listeners.size,0);});await render();
  return{requests,details,listeners,get:()=>snapshot,render,
    update:async values=>{input={...input,...values};await render();},
    identity:async value=>{authority=value;await render();},focus:async value=>{focused=value;await render();},
    act:async callback=>React.act(async()=>{await callback();}),
  };
}

test('mounted public feed appends cursor pages, deduplicates, preserves data after failed refresh and retries',async t=>{
  const m=await mount(t);await m.act(()=>m.requests[0].resolve(page(['a','b'],'next')));
  assert.equal(m.get().posts.length,2);assert.equal(m.get().hasMore,true);
  await m.act(()=>{void m.get().loadMore();void m.get().loadMore();});
  assert.equal(m.requests.length,2,'rapid pagination taps are single flight');assert.equal(m.requests[1].args.cursor,'next');
  await m.act(()=>m.requests[1].resolve(page(['b','c'])));assert.deepEqual(Array.from(m.get().posts,p=>p.id),['a','b','c']);
  await m.act(()=>{void m.get().refresh();});await m.act(()=>m.requests[2].reject(new Error('offline')));
  assert.equal(m.get().posts.length,3);assert.match(m.get().notice,/Unable/);assert.equal(m.get().ready,true);
  await m.act(()=>{void m.get().refresh();});await m.act(()=>m.requests[3].resolve(page([])));
  assert.equal(m.get().posts.length,0);assert.equal(m.get().notice,null);
});

test('same-user replacement and route switch synchronously hide old data and reject deferred completions',async t=>{
  const m=await mount(t);await m.act(()=>m.requests[0].resolve(page(['old'])));
  await m.act(()=>{void m.get().refresh();});await m.identity(owner('two'));
  assert.equal(m.get().posts.length,0);await m.act(()=>m.requests[1].resolve(page(['stale'])));assert.equal(m.get().posts.length,0);
  await m.act(()=>m.requests[2].resolve(page(['new'])));assert.equal(m.get().posts[0].id,'new');
  await m.update({userId:'other'});assert.equal(m.get().posts.length,0);
  await m.update({enabled:false});await m.act(()=>m.requests[3].resolve(page(['forbidden'])));assert.equal(m.get().posts.length,0);
});

test('own feed uses relationship API and refreshes on foreground/focus without switching to visitor data',async t=>{
  const m=await mount(t,{userId:'viewer',own:true});assert.equal(m.requests[0].kind,'own');
  await m.act(()=>m.requests[0].resolve({items:[{id:'circle:a',type:'chilly_circle_post',post:post('a')}],nextCursor:'next',hasMore:true}));
  assert.equal(m.get().items[0].type,'chilly_circle_post');assert.equal(m.get().posts[0].id,'a');
  await m.act(()=>{for(const listener of m.listeners)listener('active');});assert.equal(m.requests.length,2);
  await m.focus(false);await m.focus(true);assert.equal(m.requests.length,3);
  await m.act(()=>m.requests[1].resolve({items:[],nextCursor:null,hasMore:false}));assert.equal(m.get().ready,false);
});

test('shared post retrieves exact id beyond the first page; unavailable/private does not become a false empty success',async t=>{
  const m=await mount(t,{postId:'old-post'});await m.act(()=>m.requests[0].resolve(page(['recent'])));
  assert.equal(m.details[0].id,'old-post');await m.act(()=>m.details[0].resolve(post('old-post')));
  assert.equal(m.get().posts[0].id,'old-post');
  await m.update({postId:'private'});await m.act(()=>m.requests[1].resolve(page([])));await m.act(()=>m.details[1].resolve(null));
  assert.match(m.get().notice,/unavailable or private/);assert.equal(m.get().posts.length,0);
});

test('initial read failure is explicit, not an empty success, and retry reconnects',async t=>{
  const m=await mount(t);await m.act(()=>m.requests[0].reject(new Error('offline')));
  assert.match(m.get().notice,/Unable/);await m.act(()=>{void m.get().refresh();});await m.act(()=>m.requests[1].resolve(page(['recovered'])));
  assert.equal(m.get().notice,null);assert.equal(m.get().posts[0].id,'recovered');
});
for (const mutation of ['create','delete']) test(`held feed refresh cannot ${mutation==='create'?'erase an acknowledged create':'resurrect an acknowledged delete'}`,async t=>{
  const m=await mount(t);await m.act(()=>m.requests[0].resolve(page(['old'])));
  await m.act(()=>{void m.get().refresh();});await m.act(()=>m.get().setPosts(current=>mutation==='create'?[post('new'),...current]:[]));
  await m.act(()=>m.requests[1].resolve(page(['old'])));
  assert.deepEqual(Array.from(m.get().posts,p=>p.id),mutation==='create'?['new','old']:[],'older snapshot cannot overwrite the mutation');
  assert.equal(m.requests.length,3,'automatically retry from a snapshot newer than the mutation');
  await m.act(()=>m.requests[2].resolve(page(mutation==='create'?['new','old']:[])));
  assert.deepEqual(Array.from(m.get().posts,p=>p.id),mutation==='create'?['new','old']:[]);
  await m.act(()=>{void m.get().refresh();});await m.act(()=>m.requests[3].resolve(page([])));
  assert.equal(m.get().posts.length,0,'later authoritative deletion is not hidden by a permanent local overlay');
});
