import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const {createRoot} = require('react-dom/client');
const source = fs.readFileSync(new URL('../app/profile/[userId].tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('profile.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hook = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'useProfileAudienceState');
const screen = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'ProfileScreen');
const effects = screen.body.statements.filter(n => ts.isExpressionStatement(n)
  && ts.isCallExpression(n.expression) && n.expression.expression.getText(ast) === 'useEffect');
// The fallback executes the original production effects, so the retained-screen
// regression fails behaviorally on the pre-repair source rather than on wiring.
const legacy = hook ? '' : `
 const {userId,isOfficialProfile,isSelfProfile,channelAccessReady,profileVisibility}=input;
 const currentUserId=useSession().authority?.userId??'';
 const channelAccessProfile={profileVisibility};
 const [friendState,setFriendState]=useState(null);
 const [chillyCircleLoading,setChillyCircleLoading]=useState(false);
 const [profilePrivacyReady,setProfilePrivacyReady]=useState(false);
 const [profilePrivacyAccess,setProfilePrivacyAccess]=useState(null);
 ${effects.find(n=>n.getText(ast).includes('setProfilePrivacyReady(false)')).getText(ast)}
 ${effects.find(n=>n.getText(ast).includes('readFriendRelationshipState(userId)')).getText(ast)}
 return {friendState,chillyCircleLoading,profilePrivacyReady,profilePrivacyAccess};`;
const compiled = ts.transpileModule(hook ? hook.getText(ast) : `function useProfileAudienceState(input){${legacy}}`, {
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;
const declaration = name => screen.body.statements.find(n=>ts.isVariableStatement(n)
  && n.declarationList.declarations.some(d=>d.name.getText(ast)===name || (name==='audienceFields' && d.initializer?.getText(ast)==='profileAudience')))?.getText(ast);
const routeBindings = hook ? `function useRouteBindings(input){
 const {userId,isOfficialProfile,isSelfProfile,channelAccessReady}=input;
 const channelAccessProfile={profileVisibility:input.profileVisibility};
 ${declaration('profileAudience')}
 ${declaration('audienceFields')}
 ${declaration('canViewFullProfile')}
 ${declaration('profileLive')}
 return {...profileAudience,liveEnabled:profileLive.enabled};
}` : 'const useRouteBindings=useProfileAudienceState;';
const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const owner=(userId='viewer',generation='one')=>({userId,accountId:userId,sessionGeneration:generation,state:'ACTIVE',restoreOnly:false});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

async function mount(t, initial={}) {
  let authority=owner(), authorityStatus='active', focused=true, snapshot, accepted=false;
  let input={userId:'creator',isOfficialProfile:false,isSelfProfile:false,channelAccessReady:true,profileVisibility:'everyone',...initial};
  const readers={friend:[],privacy:[]}, reads={friend:[],privacy:[]}, mutations=[], listeners=new Set(), timers=new Set();
  const friend=(status=accepted?'active':'pending',peer=input.userId,viewer=authority?.userId??null)=>({
    viewerUserId:viewer,otherUserId:peer,availability:viewer?'available':'signed_out',status,
    isFriend:status==='active',canRequest:status==='none',canAccept:false,canDecline:false,
    canCancel:status==='pending',canRemove:status==='active',pendingDirection:status==='pending'?'outgoing':null,
  });
  const privacy=(allowed=accepted,peer=input.userId,viewer=authority?.userId??null)=>({
    ownerUserId:peer,viewerUserId:viewer,canViewFullProfile:allowed,isLocked:!allowed,
    visibility:'everyone',accessVisibility:'private',reason:allowed?'chilly_circle':'chilly_circle_required',relationshipState:null,
  });
  const reader=async(kind,options)=>{reads[kind].push(options);const value=readers[kind].length?readers[kind].shift():kind==='friend'?friend():privacy();if(value instanceof Error)throw value;return value;};
  const native={currentState:'active',addEventListener:(_,listener)=>{listeners.add(listener);return{remove:()=>listeners.delete(listener)};}};
  const context={
    ...React, useSession:()=>({authority,authorityStatus}),useIsFocused:()=>focused,AppState:native,
    getCurrentAccountSessionAuthoritySnapshot:()=>authority,
    sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&JSON.stringify(a)===JSON.stringify(b),
    useProfileLiveState:(_owner,enabled)=>({enabled}),
    readFriendRelationshipState:peer=>reader('friend',peer),resolveProfilePrivacyAccess:options=>reader('privacy',options),
    setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn),
    sendChillyCircleRequest:async peer=>{mutations.push(['request',peer]);return friend('pending',peer);},
    cancelChillyCircleRequest:async peer=>{mutations.push(['cancel',peer]);return friend('none',peer);},
    acceptChillyCircleRequest:async peer=>{mutations.push(['accept',peer]);return friend('active',peer);},
    declineChillyCircleRequest:async peer=>{mutations.push(['decline',peer]);return friend('none',peer);},
    removeFromChillyCircle:async peer=>{mutations.push(['remove',peer]);return friend('none',peer);},
  };
  vm.runInNewContext(`${compiled}\n${routeBindings};this.useAudience=useRouteBindings`,context);
  function Host(){snapshot=context.useAudience(input);return null;}
  const root=createRoot(container()),render=()=>React.act(async()=>root.render(React.createElement(Host)));
  let unmounted=false;
  const unmount=async()=>{if(!unmounted){unmounted=true;await React.act(async()=>root.unmount());}};
  t.after(unmount);await render();
  return{
    snapshot:()=>snapshot,reads,readers,friend,privacy,listeners,timers,mutations,context,unmount,
    accept:()=>{accepted=true;},
    async focus(value){focused=value;await render();},
    async route(value){input={...input,userId:value};await render();},
    async session(value,status='active'){authority=value;authorityStatus=status;await render();},
    async appState(value){await React.act(async()=>{native.currentState=value;for(const listener of listeners)listener(value);});},
    async refresh(){await React.act(async()=>snapshot.refreshProfileAudience());},
    async run(fn){await React.act(fn);},
    async timeout(){await React.act(async()=>{for(const fn of [...timers])fn();});},
  };
}

test('retained Profile refocus refreshes accepted Circle and canonical privacy without remount',async t=>{
  const h=await mount(t);
  assert.equal(h.snapshot().friendState.status,'pending');assert.equal(h.snapshot().profilePrivacyAccess.isLocked,true);
  await h.focus(false);h.accept();await h.focus(true);
  assert.equal(h.snapshot().friendState.status,'active','refocus must reread the accepted relationship');
  assert.equal(h.snapshot().profilePrivacyAccess.canViewFullProfile,true,'canonical privacy must unlock without remount');
  assert.equal(h.snapshot().liveEnabled,true,'actual Profile route enables its canonical Live reader');
});

test('foreground refreshes access only while focused and clears background presentation',async t=>{
  const h=await mount(t);await h.appState('background');h.accept();
  assert.equal(h.snapshot().profilePrivacyAccess,null);
  await h.appState('active');assert.equal(h.snapshot().friendState.status,'active');
  await h.focus(false);const count=h.reads.friend.length;
  await h.appState('background');await h.appState('active');assert.equal(h.reads.friend.length,count);
});

for(const transition of ['focus','background','route','session'])test(`late ${transition} read cannot restore the previous Profile access`,async t=>{
  const h=await mount(t),heldFriend=deferred(),heldPrivacy=deferred();
  const oldFriend=h.friend('active'),oldPrivacy=h.privacy(true);
  h.readers.friend.push(heldFriend.promise);h.readers.privacy.push(heldPrivacy.promise);
  await h.run(()=>{void h.snapshot().refreshProfileAudience();});
  if(transition==='focus'){await h.focus(false);await h.focus(true);}
  if(transition==='background'){await h.appState('background');await h.appState('active');}
  if(transition==='route')await h.route('next-creator');
  if(transition==='session')await h.session(owner('viewer','renewed'));
  await h.run(async()=>{heldFriend.resolve(oldFriend);heldPrivacy.resolve(oldPrivacy);});
  assert.equal(h.snapshot().friendState.status,'pending');assert.equal(h.snapshot().profilePrivacyAccess.isLocked,true);
  if(transition==='route')assert.equal(h.snapshot().friendState.otherUserId,'next-creator');
});

test('failed reads remove stale actions/access and an explicit retry recovers',async t=>{
  const h=await mount(t);h.accept();await h.refresh();
  h.readers.friend.push(new Error('offline'));h.readers.privacy.push(new Error('offline'));await h.refresh();
  assert.equal(h.snapshot().friendState,null);assert.equal(h.snapshot().profilePrivacyAccess,null);
  assert.equal(h.snapshot().friendError,true);assert.equal(h.snapshot().privacyError,true);
  assert.equal(h.snapshot().profilePrivacyReady,true);
  await h.refresh();assert.equal(h.snapshot().friendState.status,'active');assert.equal(h.snapshot().profilePrivacyAccess.canViewFullProfile,true);
});

test('hung reads time out truthfully and their later results cannot beat a retry',async t=>{
  const h=await mount(t),held=deferred();h.readers.privacy.push(held.promise);
  await h.run(()=>{void h.snapshot().refreshProfileAudience();});await h.timeout();
  assert.equal(h.snapshot().privacyError,true);assert.equal(h.snapshot().profilePrivacyAccess,null);
  await h.refresh();await h.run(async()=>held.resolve(h.privacy(true)));
  assert.equal(h.snapshot().profilePrivacyAccess.isLocked,true);
});

test('wrong-pair and unavailable canonical results stay non-actionable',async t=>{
  const h=await mount(t);h.readers.friend.push(h.friend('active','wrong-peer'));
  h.readers.privacy.push({...h.privacy(false),reason:'unavailable'});await h.refresh();
  assert.equal(h.snapshot().friendState,null);assert.equal(h.snapshot().friendError,true);
  assert.equal(h.snapshot().privacyError,true);assert.equal(h.snapshot().profilePrivacyAccess,null);
});

test('signed-out public resolution is preserved; unknown and restore-only sessions do not read',async t=>{
  const h=await mount(t);await h.session(null,'signed_out');
  assert.equal(h.reads.privacy.at(-1).viewerUserId,null);
  assert.equal(h.snapshot().friendState,null);assert.equal(h.snapshot().friendError,false);
  let count=h.reads.privacy.length;await h.session(null,'unknown');assert.equal(h.reads.privacy.length,count);
  await h.session({...owner(),restoreOnly:true},'restore_only');assert.equal(h.reads.privacy.length,count);
  assert.equal(h.snapshot().profilePrivacyAccess,null);
});

test('owner and official profiles retain canonical resolution without a Circle read',async t=>{
  for(const flags of [{isSelfProfile:true},{isOfficialProfile:true}]){
    const h=await mount(t,{...flags,profileVisibility:'private'});assert.equal(h.reads.friend.length,0);assert.equal(h.reads.privacy.length,1);
    assert.equal(h.reads.privacy[0].visibility,'everyone');
  }
});

test('unmount removes listeners/timers and discards held completion',async t=>{
  const h=await mount(t),held=deferred();h.readers.friend.push(held.promise);
  await h.run(()=>{void h.snapshot().refreshProfileAudience();});assert.equal(h.timers.size,1);
  await h.unmount();assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);
  await h.run(async()=>held.resolve(h.friend('active')));
});

test('Circle failure does not override an independently successful canonical privacy decision',async t=>{
  const h=await mount(t);h.accept();h.readers.friend.push(new Error('Circle read failed'));await h.refresh();
  assert.equal(h.snapshot().friendError,true);assert.equal(h.snapshot().privacyError,false);
  assert.equal(h.snapshot().profilePrivacyAccess.canViewFullProfile,true);
});

test('refresh immediately retires the old rendered Circle action before React commits',async t=>{
  const h=await mount(t),held=deferred();const oldAction=h.snapshot().performCircleAction;
  h.readers.friend.push(held.promise);
  await h.run(async()=>{void h.snapshot().refreshProfileAudience();await oldAction('cancel');});
  assert.equal(h.mutations.length,0);
  await h.run(async()=>held.resolve(h.friend()));
});

test('same-turn refreshed result retires an old pending action before React commits',async t=>{
  const h=await mount(t),oldAction=h.snapshot().performCircleAction;h.accept();
  await h.run(async()=>{await h.snapshot().refreshProfileAudience();await oldAction('cancel');});
  assert.equal(h.mutations.length,0);assert.equal(h.snapshot().friendState.status,'active');
});

test('duplicate Circle taps execute once and reread canonical access after completion',async t=>{
  const h=await mount(t),held=deferred();let calls=0;
  h.context.cancelChillyCircleRequest=()=>{calls++;return held.promise;};
  await h.run(()=>{void h.snapshot().performCircleAction('cancel');void h.snapshot().performCircleAction('cancel');});
  assert.equal(calls,1);assert.equal(h.snapshot().chillyCircleActionBusy,'cancel');
  const reads=h.reads.privacy.length;
  await h.run(async()=>held.resolve(h.friend('none')));
  assert.equal(h.snapshot().chillyCircleActionBusy,null);assert.ok(h.reads.privacy.length>reads);
});

for(const transition of ['focus','background','session','route'])test(`Circle mutation spanning ${transition} cannot publish its old result`,async t=>{
  const h=await mount(t),held=deferred(),oldResult=h.friend('none');let result;
  h.context.cancelChillyCircleRequest=()=>held.promise;
  await h.run(()=>{void h.snapshot().performCircleAction('cancel').then(value=>{result=value;});});
  if(transition==='focus'){await h.focus(false);await h.focus(true);}
  if(transition==='background'){await h.appState('background');await h.appState('active');}
  if(transition==='session')await h.session(owner('viewer','next'));
  if(transition==='route')await h.route('next-creator');
  await h.run(async()=>held.resolve(oldResult));
  assert.equal(result,null);assert.equal(h.snapshot().chillyCircleActionBusy,null);
  assert.equal(h.snapshot().friendState.status,'pending');
  if(transition==='route')assert.equal(h.snapshot().friendState.otherUserId,'next-creator');
});

test('failed current Circle mutation releases its latch and rereads without inventing success',async t=>{
  const h=await mount(t);h.context.cancelChillyCircleRequest=async()=>{throw new Error('modeled mutation failure');};
  const reads=h.reads.privacy.length;
  await h.run(async()=>assert.rejects(h.snapshot().performCircleAction('cancel'),/modeled mutation failure/));
  assert.equal(h.snapshot().chillyCircleActionBusy,null);assert.ok(h.reads.privacy.length>reads);
  assert.equal(h.snapshot().friendState.status,'pending');
});

for(const action of ['request','accept','decline','cancel','remove'])test(`current ${action} uses its existing Circle operation and refreshes canonical privacy`,async t=>{
  const h=await mount(t);
  const eligibility={request:'canRequest',accept:'canAccept',decline:'canDecline',cancel:'canCancel',remove:'canRemove'};
  h.readers.friend.push({...h.friend('none'),[eligibility[action]]:true});await h.refresh();
  const before=h.reads.privacy.length;
  await h.run(async()=>{assert.ok(await h.snapshot().performCircleAction(action));});
  assert.deepEqual(h.mutations,[[action,'creator']]);assert.ok(h.reads.privacy.length>before);
});

test('accepted Circle flags never unlock a canonical denied Profile or its Live reader',async t=>{
  const h=await mount(t);h.readers.friend.push(h.friend('active'));h.readers.privacy.push(h.privacy(false));await h.refresh();
  assert.equal(h.snapshot().friendState.isFriend,true);assert.equal(h.snapshot().profilePrivacyAccess.canViewFullProfile,false);
  assert.equal(h.snapshot().liveEnabled,false);
});

test('Profile uses refreshed audience state for Live and renders accessible retry controls',()=>{
  assert.match(source,/const profileAudience = useProfileAudienceState\(/);
  assert.match(source,/const canViewFullProfile = profilePrivacyAccess\?\.canViewFullProfile \?\? false/);
  assert.match(source,/useProfileLiveState\(userId, !!userId && profilePrivacyReady && canViewFullProfile/);
  assert.match(source,/accessibilityLabel="Retry Profile access"/);
  assert.match(source,/accessibilityLabel="Retry Chi'lly Circle status"/);
});
