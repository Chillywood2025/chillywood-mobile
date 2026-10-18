// Real React hooks and production Profile header expressions; native drawing,
// network and focus are modeled. This is not installed-device performance proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import {createRoot} from 'react-dom/client';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop=()=>{}, document={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:document,parentNode:null,tagName:'DIV'});
document.documentElement=container();globalThis.document=document;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
const root=process.env.PROFILE_IMAGE_SOURCE_ROOT || process.cwd();
const source=fs.readFileSync(path.join(root,'app/profile/[userId].tsx'),'utf8');
const ast=ts.createSourceFile('profile.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const screen=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ProfileScreen');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const declarations=new Map();let avatar;
function visit(n){
  if(ts.isVariableDeclaration(n))declarations.set(n.name.getText(ast),n.getText(ast));
  if(ts.isJsxElement(n)&&n.openingElement.getText(ast)==='<View style={styles.avatarCircle}>')avatar=n.getText(ast);
  ts.forEachChild(n,visit);
}visit(screen);
assert.ok(avatar,'actual Profile avatar JSX');
const projectionNames=['profileMediaLoading','canShowProfileMedia','visibleProfileAvatarUrl','visibleProfileBackgroundUrl'];
const projection=projectionNames.filter(n=>declarations.has(n)).map(n=>`const ${declarations.get(n)};`).join('\n');
const profile=avatarUrl=>({username:'rachi',displayName:'Rachi',avatarUrl,profileAvatarMediaStatus:'active',profileBackgroundMediaStatus:'active'});
const owner=(userId='viewer',generation='one')=>({userId,accountId:userId,sessionGeneration:generation,state:'ACTIVE',restoreOnly:false});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function find(node,predicate){if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node&&typeof node==='object'){if(predicate(node))return node;return find(node.props?.children,predicate);}return null;}

function environment(){
  let authority=owner(),authorityStatus='active',focused=true,userId='official',self=false,privacyReady=true,allowed=true;
  let now=1_000;
  const queue=[],calls=[],timers=new Map();let timerId=0;
  const read=async id=>{calls.push(id);const next=queue.length?queue.shift():profile('image:rachi');if(next instanceof Error)throw next;return next;};
  const bindings={
    react:React,'@react-navigation/native':{useIsFocused:()=>focused},
    '../../_lib/accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&JSON.stringify(a)===JSON.stringify(b)},
    '../../_lib/officialAccounts':{getOfficialPlatformAccount:id=>id==='official'?{userId:id}:null},
    '../../_lib/session':{useSession:()=>({authority,authorityStatus})},
    '../../_lib/userData':{readUserProfile:()=>read(authority?.userId),readUserProfileByUserId:read},
    '../../_lib/monetization':{readCreatorPermissions:async()=>({canUsePartyPassRooms:true})},
  };
  const context={exports:{},require:name=>{assert.ok(name in bindings,`modeled dependency ${name}`);return bindings[name];},
    console,Date:{now:()=>now},Promise,JSON,setTimeout:f=>{timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id)};
  let usePresentation;
  const hookPath=path.join(root,'components/profile/use-profile-presentation.ts');
  if(fs.existsSync(hookPath)){
    vm.runInNewContext(compile(fs.readFileSync(hookPath,'utf8')),context);
    // Execute the route's actual binding too: an unwired helper cannot pass.
    const binding=[...declarations.values()].find(value=>value.includes('= useProfilePresentation('));
    assert.ok(binding,'Profile route uses the production presentation hook');
    Object.assign(context,{useProfilePresentation:context.exports.useProfilePresentation,
      getOfficialPlatformAccount:bindings['../../_lib/officialAccounts'].getOfficialPlatformAccount});
    vm.runInNewContext(compile(`exports.routePresentation=function(userId,currentUserId){const officialAccount=getOfficialPlatformAccount(userId);const ${binding};return {profile:channelAccessProfile,permissions:channelAccessPermissions,ready:channelAccessReady,error:profilePresentationError,refresh:refreshProfilePresentation,setProfile:setChannelAccessProfile};}`),context);
    usePresentation=(id,isSelf)=>context.exports.routePresentation(id,isSelf?id:authority?.userId??'');
  }else{
    // Negative control runs the original route's state and read effect, not a
    // hand-written approximation of the defective lifecycle.
    const names=['[channelAccessProfile, setChannelAccessProfile]','[channelAccessPermissions, setChannelAccessPermissions]','[channelAccessReady, setChannelAccessReady]'];
    const effects=screen.body.statements.filter(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='useEffect');
    const effect=effects.find(n=>n.getText(ast).includes('setChannelAccessReady(false)')&&n.getText(ast).includes('readUserProfileByUserId'));
    assert.ok(effect,'original production read effect');
    Object.assign(context,React,{readUserProfile:bindings['../../_lib/userData'].readUserProfile,readUserProfileByUserId:read,readCreatorPermissions:async()=>({})});
    vm.runInNewContext(compile(`function oldPresentation(userId,isSelfProfile){const isOfficialProfile=userId==='official';${names.map(n=>`const ${declarations.get(n)};`).join('\n')}${effect.getText(ast)}return {profile:channelAccessProfile,permissions:channelAccessPermissions,ready:channelAccessReady,error:false,setProfile:setChannelAccessProfile,refresh:()=>{}};}exports.oldPresentation=oldPresentation;`),context);
    usePresentation=context.exports.oldPresentation;
  }
  const jsxContext={exports:{},React,View:'View',Skeleton:'Skeleton',Pressable:'Pressable',AppText:'Text',StableImage:'StableImage',
    styles:{avatarCircle:{},avatarImage:{},avatarInitial:{}},resolveProfileImageResizeMode:()=> 'cover',isProfileMediaActive:s=>s==='active'};
  vm.runInNewContext(compile(`exports.project=function(input){const {profile,isOfficialProfile,profilePrivacyReady,canViewFullProfile,channelAccessReady,shouldShowLockedShell,profilePresentationError,refreshProfilePresentation}=input;${projection}return ${avatar};}`),jsxContext);
  async function mount(t){
    let state,tree;
    function Host(){state=usePresentation(userId,self);tree=jsxContext.exports.project({profile:state.profile??profile(undefined),isOfficialProfile:userId==='official',profilePrivacyReady:privacyReady,canViewFullProfile:allowed,channelAccessReady:state.ready,shouldShowLockedShell:privacyReady&&!allowed,profilePresentationError:state.error,refreshProfilePresentation:state.refresh});return null;}
    const mounted=createRoot(container());let unmounted=false;
    const render=()=>React.act(async()=>mounted.render(React.createElement(Host)));
    const unmount=async()=>{if(!unmounted){unmounted=true;await React.act(async()=>mounted.unmount());}};
    t.after(unmount);await render();
    return{state:()=>state,tree:()=>tree,render,unmount,
      image:()=>find(tree,n=>n.type==='StableImage'),loading:()=>find(tree,n=>n.props?.testID==='profile-avatar-loading'),
      async retry(){await React.act(async()=>state.refresh());},async resolve(d,value){await React.act(async()=>d.resolve(value));},
      async focus(value){focused=value;await render();},async route(id){userId=id;await render();},
      async session(value,status='active'){authority=value;authorityStatus=status;await render();},
      async privacy(ready,canView){privacyReady=ready;allowed=canView;await render();},
      async update(value){await React.act(async()=>state.setProfile(value));},
      async timeout(){await React.act(async()=>{for(const timer of [...timers.values()])timer();});},
    };
  }
  return {queue,calls,timers,mount,advance:ms=>{now+=ms;}};
}

test('cold Rachi header shows loading, not the missing-photo initial, until metadata resolves',async t=>{
  const e=environment(),wait=deferred();e.queue.push(wait.promise);const h=await e.mount(t);
  assert.ok(h.loading());assert.equal(find(h.tree(),n=>n.type==='Text'),null);assert.equal(h.image(),null);
  await h.resolve(wait,profile('image:rachi'));assert.equal(h.image().props.source.uri,'image:rachi');assert.equal(h.loading(),null);
});
test('warm Rachi navigation seeds the known URL and continues the authoritative refresh',async t=>{
  const e=environment(),first=await e.mount(t);await first.unmount();
  const wait=deferred();e.queue.push(wait.promise);const next=await e.mount(t);
  assert.equal(next.image()?.props.source.uri,'image:rachi');assert.equal(next.loading(),null);assert.equal(e.calls.length,2);
  await next.resolve(wait,profile('image:new'));assert.equal(next.image().props.source.uri,'image:new');
});
test('refocus preserves a known photo during read; confirmed removal clears it',async t=>{
  const e=environment(),h=await e.mount(t);await h.focus(false);const wait=deferred();e.queue.push(wait.promise);await h.focus(true);
  assert.equal(h.image().props.source.uri,'image:rachi');await h.resolve(wait,profile(undefined));
  assert.equal(h.image(),null);assert.equal(h.loading(),null);assert.ok(find(h.tree(),n=>n.type==='Text'));
});
test('route recycling clears old private presentation before the next read completes',async t=>{
  const e=environment(),h=await e.mount(t);const wait=deferred();e.queue.push(wait.promise);await h.route('private-peer');
  assert.equal(h.image(),null);assert.equal(h.state().profile,null);await h.resolve(wait,profile('image:private'));
  await h.privacy(false,false);assert.equal(h.image(),null);await h.privacy(true,false);assert.equal(h.image(),null);
});
for(const transition of ['account','generation','restricted','signed_out'])test(`${transition} change discards previous presentation and stale read`,async t=>{
  const e=environment(),h=await e.mount(t),old=deferred(),next=deferred();e.queue.push(old.promise);await h.retry();
  e.queue.push(next.promise);
  await h.session(transition==='signed_out'?null:owner(transition==='account'?'other':'viewer',transition==='generation'?'two':'one'),transition==='restricted'?'restricted':transition==='signed_out'?'signed_out':'active');
  assert.equal(h.image(),null);await h.resolve(old,profile('image:stale'));assert.equal(h.image(),null);
  if(transition!=='restricted'){await h.resolve(next,profile('image:current'));assert.equal(h.image().props.source.uri,'image:current');}
});
test('error clears the prior photo, exposes retry and recovers',async t=>{
  const e=environment(),h=await e.mount(t);e.queue.push(new Error('offline'));await h.retry();
  assert.equal(h.image(),null);assert.ok(find(h.tree(),n=>n.props?.testID==='profile-avatar-retry'));
  e.queue.push(profile('image:recovered'));let stopped=false;
  await React.act(async()=>find(h.tree(),n=>n.props?.testID==='profile-avatar-retry').props.onPress({stopPropagation:()=>{stopped=true;}}));
  assert.equal(stopped,true);assert.equal(h.image().props.source.uri,'image:recovered');
});
test('timeout settles loading and late completion cannot replace successful retry',async t=>{
  const e=environment(),wait=deferred();e.queue.push(wait.promise);const h=await e.mount(t);await h.timeout();
  assert.equal(h.state().error,true);e.queue.push(profile('image:retry'));await h.retry();await h.resolve(wait,profile('image:late'));
  assert.equal(h.image().props.source.uri,'image:retry');assert.equal(e.timers.size,0);
});
test('replacement/removal invalidate an in-flight older profile read',async t=>{
  const e=environment(),h=await e.mount(t),wait=deferred();e.queue.push(wait.promise);await h.retry();
  await h.update(profile(undefined));await h.resolve(wait,profile('image:removed'));
  assert.equal(h.image(),null);await h.unmount();const next=deferred();e.queue.push(next.promise);const again=await e.mount(t);assert.equal(again.image(),null);
});
test('unmounted late read cannot poison the warm navigation snapshot',async t=>{
  const e=environment(),h=await e.mount(t),old=deferred();e.queue.push(old.promise);await h.retry();await h.unmount();
  e.queue.push(profile('image:latest'));const next=await e.mount(t);await next.resolve(old,profile('image:obsolete'));await next.unmount();
  const wait=deferred();e.queue.push(wait.promise);const third=await e.mount(t);assert.equal(third.image().props.source.uri,'image:latest');
});
test('an expired public metadata snapshot returns to deliberate cold loading',async t=>{
  const e=environment(),first=await e.mount(t);await first.unmount();e.advance(60_001);
  const wait=deferred();e.queue.push(wait.promise);const next=await e.mount(t);
  assert.equal(next.image(),null);assert.ok(next.loading());await next.resolve(wait,profile('image:revalidated'));
  assert.equal(next.image().props.source.uri,'image:revalidated');
});
test('a concurrent older response cannot resurrect a confirmed removed photo in the cache',async t=>{
  const e=environment(),old=deferred();e.queue.push(old.promise);const first=await e.mount(t);
  e.queue.push(null);const second=await e.mount(t);await first.resolve(old,profile('image:removed'));
  await first.unmount();await second.unmount();const wait=deferred();e.queue.push(wait.promise);const next=await e.mount(t);
  assert.equal(next.image(),null);assert.ok(next.loading());
});
