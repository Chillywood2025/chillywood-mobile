import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import {createRoot} from 'react-dom/client';
import ts from 'typescript';
import { loadMediaPickerHost } from './helpers/media-picker-host.mjs';
import { createRoomAttachmentIntent } from './helpers/party-media-authority.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const noop=()=>{},document={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:document,parentNode:null,tagName:'DIV'});
document.documentElement=container();globalThis.document=document;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
const source=fs.readFileSync('app/watch-party/[partyId].tsx','utf8'),ast=ts.createSourceFile('room.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map(),effects=[],conditions=[];
const visit=node=>{if(ts.isVariableDeclaration(node))declarations.set(node.name.getText(ast),node);
  if(ts.isIfStatement(node))conditions.push(node.expression);
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect')effects.push(node);ts.forEachChild(node,visit);};visit(ast);
const names=['clearUnavailableRoom','retireRoomChannel','roomAuthority','syncRoomFromSnapshot','refreshRoomSnapshot','startChatChannel','startRoomChatRealtimeSync','startRoomRealtimeSync','loadRoomMessageAttachments','isNativeCameraPlatform','allowLocalCameraPreview','onTogglePartyRoomCameraPreview',
 'partyAttachmentIntentRef','selectedPartyAttachmentIntentRef','partyAttachmentContext','partyAttachmentContextRef','retirePartyAttachmentIntent','retireSelectedPartyAttachment','onPickPartyRoomCommentAttachment',
 'commentMediaContext','commentMediaContextRef','commentSendFlightRef', [...declarations.keys()].find(name=>name.startsWith('[chatAttachmentFile,')), [...declarations.keys()].find(name=>name.includes('pickMedia: pickCommentMedia'))];
const selected=names.map(name=>declarations.get(name)).sort((a,b)=>a.pos-b.pos).map(node=>`const ${node.getText(ast)};`).join('\n');
const lifecycle=effects.find(node=>node.getText(ast).includes('roomAuthority.activate()')).getText(ast);
const bootstrap=effects.find(node=>node.getText(ast).includes('const bootstrap = async () =>')).getText(ast);
const unavailableCondition=conditions.find(node=>node.getText(ast).includes('notFound || !room')&&node.getText(ast).includes('verifiedRoomOwner')).getText(ast);
const attachmentEffects=effects.filter(node=>/\[(?:commentMediaContext|partyAttachmentContext)(?:,|\])/.test(node.getText(ast))).map(node=>node.getText(ast)).join(';');
const all=selected+lifecycle+bootstrap+attachmentEffects;
const setterNames=[...new Set(all.match(/\bset[A-Z]\w+/g))].filter(name=>!['setTimeout','setInterval','setChatAttachmentFile'].includes(name));
const refs=[...new Set(all.match(/\b\w+Ref(?=\.current)/g))].filter(name=>name!=='roomChannelRetirementRef'&&!names.includes(name));
const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const authority=(id='viewer',session='one')=>({userId:id,accountId:id,sessionGeneration:session,state:'ACTIVE',restoreOnly:false});
const same=(a,b)=>!!a&&!!b&&['userId','accountId','sessionGeneration'].every(k=>a[k]===b[k]);
const member=(id='viewer')=>({partyId:'ROOM01',userId:id,joinedAt:'admitted-once',role:'viewer',membershipState:'active',leftAt:null,lastSeenAt:new Date().toISOString()});
const snapshot=(members=[member()])=>({room:{partyId:'ROOM01',hostUserId:'host',roomGeneration:'generation-one',startedAt:'room-start',contentAccessRule:'free',roomType:'title',titleId:'title',sourceType:'platform_title',sourceId:'title',isActive:true,updatedAt:'now',joinPolicy:'open',reactionsPolicy:'enabled'},memberships:members});

async function mount(t,{initial=snapshot(),deny=false,strict=false,join=null}={}){
 const runtime={authority:authority(),partyId:'ROOM01',focused:true,appState:'active',retry:0,snapshot:initial,reads:[],read:null,join,permission:null,joinCalls:0,channels:[],removed:[],timers:new Map(),intervals:new Map(),accounts:new Set(),apps:new Set(),hints:new Set(),result:null};
 const media=loadMediaPickerHost({React,native:{Platform:{OS:'ios'}},snapshot:()=>runtime.authority,
  subscribe:fn=>{runtime.accounts.add(fn);return()=>runtime.accounts.delete(fn);}});
 const module={exports:{}};vm.runInNewContext(compile(fs.readFileSync(process.env.PARTY_ROOM_AUTHORITY_HELPER??'_lib/roomSnapshotAuthority.ts','utf8')),{exports:module.exports,setTimeout:(fn,ms)=>{runtime.timers.set(fn,ms);return fn;},clearTimeout:fn=>runtime.timers.delete(fn)});
 const context={...module.exports,React,useMemo:React.useMemo,useRef:React.useRef,useState:React.useState,useEffect:React.useEffect,useCallback:React.useCallback,
  createRoomAttachmentIntent, ...media.resources, ...media.ownedState,
  useMediaPicker:key=>{const picker=media.useMediaPicker(key),cancelMediaPicker=picker.cancelMediaPicker,pickMedia=picker.pickMedia;const cancel=React.useCallback(()=>{runtime.pickerCancellations=(runtime.pickerCancellations??0)+1;cancelMediaPicker();},[cancelMediaPicker]);const pick=React.useCallback(async options=>{const selection=await pickMedia(options);runtime.afterPickerHandoff?.();return selection;},[pickMedia]);return{...picker,pickMedia:pick,cancelMediaPicker:cancel};},
  captureAccountBoundSupabaseMutationSubject:async()=>({authority:runtime.authority,accessToken:'captured-token'}),
  pickSocialAttachmentFile:async(scope,source,operation)=>{runtime.nativeStarts=(runtime.nativeStarts??0)+1;const file=runtime.nativePick?await runtime.nativePick():null;if(file&&runtime.nativeResourceCleanup)operation.ownResource(file,runtime.nativeResourceCleanup);return file;},
  getUserFacingErrorMessage:(error,fallback)=>error?.message??fallback,
  runtime,capture:result=>{runtime.result=result;},getCurrentAccountSessionAuthoritySnapshot:()=>runtime.authority,sameAccountSessionAuthority:same,
  subscribeToAccountSessionAuthority:fn=>{runtime.accounts.add(fn);return()=>runtime.accounts.delete(fn);},
  subscribeToLiveUpdates:(owner,scope,fn,interest)=>{assert.equal(interest.viewerUserId,owner.userId);assert.equal(scope,'discovery');runtime.hints.add(fn);return()=>runtime.hints.delete(fn);},
  AppState:{get currentState(){return runtime.appState;},addEventListener:(_,fn)=>{runtime.apps.add(fn);return{remove:()=>runtime.apps.delete(fn)};}},
  getPartyRoomSnapshot:async id=>{runtime.reads.push(id);return runtime.read?runtime.read():runtime.snapshot;},
  readUserProfile:async()=>({username:'Synthetic viewer'}),getSafePartyUserId:async()=>runtime.authority.userId,
  resolvePaidWatchPartyTicketAccess:async()=>runtime.ticket??({allowed:true,reason:'free_room'}),paidWatchPartyResolutionIsExactFreeRoom:value=>value?.reason==='free_room',
  requireLiveFirstPremium:async()=>({allowed:true}),requireWatchPartyLivePremium:async()=>({allowed:true}),
  resolveRoomAccess:async()=>({isAllowed:!deny&&!runtime.accessDenied}),isRuntimeControlBlockedAccess:()=>false,isAccessSheetReason:()=>false,
  joinPartyRoomSession:async()=>{runtime.joinCalls++;if(runtime.join)return runtime.join();runtime.snapshot={...runtime.snapshot,memberships:[{...member(runtime.authority.userId),partyId:runtime.partyId}]};return runtime.snapshot.memberships[0];},
  Platform:{OS:'ios'},cameraPermission:null,requestCameraPermission:()=>runtime.permission??Promise.resolve({granted:true}),Alert:{alert:noop},Linking:{openSettings:noop},
  touchPartyRoomSession:async()=>null,getActivePartyMemberships:rows=>rows.filter(row=>['active','reconnecting'].includes(row.membershipState)),
  resolveWatchPartyContentDisplay:async()=>({displayName:'Private fixture title',attributionLabel:'Synthetic host'}),
  resolveWatchPartySourceType:room=>room.sourceType,resolveWatchPartySourceId:room=>room.sourceId,resolvePremiumAccessKeyForRoom:room=>room.sourceId,
  readWatchPartyContentDisplayHandoff:()=>null,readSocialAttachmentsForSurfaces:async()=>new Map(),saveLastPartySession:async()=>{},
  resolveIdentityName:(...values)=>values.find(Boolean),trackEvent:noop,reportRuntimeError:noop,debugLog:noop,decodePartySeatRequestMessage:()=>null,
  ROOM_SNAPSHOT_REFRESH_MS:30000,ROOM_HEARTBEAT_INTERVAL_MILLIS:15000,
  setTimeout:(fn,ms)=>{runtime.timers.set(fn,ms);return fn;},clearTimeout:fn=>runtime.timers.delete(fn),
  setInterval:(fn,ms)=>{runtime.intervals.set(fn,ms);return fn;},clearInterval:fn=>runtime.intervals.delete(fn),
  supabase:{auth:{getUser:async()=>({data:{user:{user_metadata:{}}}})},removeChannel:async channel=>{runtime.removed.push(channel);await runtime.removalHold;},
   from:()=>{const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,returns:async()=>({data:[]})};return query;},
   channel:topic=>{const callbacks=[];const channel={topic,callbacks,on:(type,filter,fn)=>{callbacks.push({type,filter,fn});return channel;},
    subscribe:fn=>{channel.status=fn;fn?.('SUBSCRIBED');return channel;},track:async()=>{},send:async()=>{},presenceState:()=>({})};runtime.channels.push(channel);return channel;}}};
 const defaults={room:null,myRole:null,loading:true,notFound:false,titleName:null,sourceAttribution:null,verifiedRoomOwner:null,participants:[],messages:[],partyRoomCameraPreviewIntent:false,partyRoomCameraPreviewSuppressed:false,chatSending:false,chatAttachmentFile:null,chatError:'',chatDraft:''};
 const refInitial=name=>/Map|Timeouts/.test(name)?'{}':/Username|UpdatedAt|PreviewUrl/.test(name)?'""':'null';
 const body=`const ${declarations.get('roomChannelRetirementRef').getText(ast)};
 function Host(){const [ui,setUi]=useState(${JSON.stringify(defaults)});const {room,loading,notFound,verifiedRoomOwner,partyRoomCameraPreviewIntent,partyRoomCameraPreviewSuppressed,chatSending,chatError,chatDraft,accessGate,paidTicketGate,blockedRoomAccess}=ui;
 ${setterNames.map(name=>`const ${name}=value=>setUi(old=>({...old,${JSON.stringify(name.slice(3,4).toLowerCase()+name.slice(4))}:typeof value==='function'?value(old[${JSON.stringify(name.slice(3,4).toLowerCase()+name.slice(4))}]):value}));`).join('\n')}
 ${refs.map(name=>`const ${name}=useRef(${refInitial(name)});`).join('\n')}
 const authority=runtime.authority,authorityStatus=authority?'active':'signed_out',canUseBetaRoom=!!authority&&runtime.betaAllowed!==false,isFocused=runtime.focused,partyRoomAppState=runtime.appState,joinRetryToken=runtime.retry,partyId=runtime.partyId,isLive=true;
 const addMsg=msg=>setMessages(old=>[...(old??[]),msg]),flashReaction=()=>{},attachReactionToParticipant=()=>{},buildPresenceParticipants=()=>Object.values(membershipMapRef.current);
 ${selected}
 roomAuthorityRef.current=roomAuthority;
 partyAttachmentContextRef.current=partyAttachmentContext;commentMediaContextRef.current=commentMediaContext;
 ${attachmentEffects};${lifecycle};${bootstrap};
 const visible=!(${unavailableCondition});
 capture({ui:{...ui,chatAttachmentFile},owner:roomAuthority,refresh:refreshRoomSnapshot,camera:onTogglePartyRoomCameraPreview,allowCamera:allowLocalCameraPreview,pick:onPickPartyRoomCommentAttachment,sheet:commentMediaPickerSheet,refs:{membershipMapRef,myRoleRef,myUserIdRef},visible});return visible?commentMediaPickerSheet:null;}
 globalThis.Host=Host;`;
 vm.runInNewContext(compile(body),context);
 let root=createRoot(container());const render=()=>React.act(async()=>root.render(strict?React.createElement(React.StrictMode,null,React.createElement(context.Host)):React.createElement(context.Host)));
 await render();t.after(()=>React.act(async()=>root.unmount()));
 return{runtime,resources:media.resources,result:()=>runtime.result,render,act:fn=>React.act(async()=>{await fn();}),
  pick:()=>React.act(async()=>{void runtime.result.pick();}),
  choose:async()=>{const sheet=runtime.result.sheet;assert.ok(sheet);await React.act(async()=>sheet.props.onChoose('photos'));await React.act(async()=>sheet.props.onDismiss());},
  refresh:()=>React.act(async()=>{await runtime.result.refresh();}),
  account:async value=>{await React.act(async()=>{runtime.authority=value;for(const fn of [...runtime.accounts])fn(value);});await render();},
  app:async value=>{await React.act(async()=>{runtime.appState=value;for(const fn of [...runtime.apps])fn(value);});await render();},
  retry:async()=>{runtime.retry++;await render();},
  remount:async()=>{await React.act(async()=>root.unmount());root=createRoot(container());await render();}};
}

test('actual Party beta eligibility revocation permanently retires a held native selection',async t=>{
 const h=await mount(t),held=deferred();h.runtime.nativePick=()=>held.promise;
 await h.pick();await h.choose();h.runtime.betaAllowed=false;await h.render();
 h.runtime.betaAllowed=true;await h.render();await h.act(()=>held.resolve({uri:'file:///old.png',name:'old.png',mimeType:'image/png'}));
 assert.equal(h.result().ui.chatAttachmentFile,null);assert.equal(h.runtime.nativeStarts,1);
});

test('actual Party bootstrap permits initial prejoin, then requires canonical joined membership',async t=>{
 const h=await mount(t,{initial:snapshot([])});assert.equal(h.runtime.joinCalls,1);assert.equal(h.result().visible,true);assert.equal(h.result().ui.titleName,'Private fixture title');
 h.runtime.snapshot=snapshot([]);await h.refresh();assert.equal(h.result().visible,false);assert.equal(h.result().ui.room,null);assert.equal(h.result().ui.messages.length,0);
 assert.equal(h.runtime.intervals.size,0);assert.equal(h.runtime.hints.size,0);assert.equal(h.runtime.removed.length,3);assert.equal(h.result().ui.partyRoomCameraPreviewIntent,false);
 assert.ok(h.runtime.pickerCancellations>0,'canonical retirement cancels the shared picker');
});
for(const reason of ['null','failed','ended','removed','left'])test(`actual Party refresh retires metadata, controls and owned channels on ${reason}`,async t=>{
 const h=await mount(t);assert.equal(h.result().visible,true);
 if(reason==='null')h.runtime.snapshot=null;else if(reason==='failed')h.runtime.read=()=>Promise.reject(Error('unavailable'));
 else h.runtime.snapshot=reason==='ended'?{...snapshot(),room:{...snapshot().room,isActive:false}}:snapshot([{...member(),membershipState:reason,leftAt:reason==='left'?'now':null}]);
 await h.refresh();assert.equal(h.result().visible,false);assert.equal(h.result().ui.titleName,null);assert.equal(h.result().refs.myRoleRef.current,null);assert.equal(Object.keys(h.result().refs.membershipMapRef.current).length,0);
 const old=h.runtime.channels[0];await h.act(()=>{for(const event of old.callbacks)if(event.type==='presence')event.fn({newPresences:[{username:'Forbidden stale name'}]});old.status('SUBSCRIBED');});
 assert.equal(h.result().ui.messages.length,0);assert.equal(h.result().visible,false);
});
test('held old read and retained channels cannot revive retired room or remove replacement resources',async t=>{
 const h=await mount(t),held=deferred(),old=h.result().owner;h.runtime.read=()=>held.promise;
 await h.act(()=>{void h.result().refresh();});h.runtime.read=null;h.runtime.snapshot=snapshot([member('replacement')]);await h.account(authority('replacement','two'));
 const newer=h.runtime.channels.slice(-3);await h.act(()=>held.resolve(snapshot()));old.retire();
 assert.equal(h.result().visible,true);assert.equal(h.runtime.removed.some(channel=>newer.includes(channel)),false);assert.equal(h.result().refs.myUserIdRef.current,'replacement');
});
test('background retires locally and foreground freshly verifies; StrictMode replay remains usable',async t=>{
 const h=await mount(t,{strict:true});assert.equal(h.result().visible,true);await h.app('background');assert.equal(h.result().visible,false);assert.equal(h.runtime.intervals.size,0);
 await h.app('active');assert.equal(h.result().visible,true);
});
test('held canonical timeout retires instead of preserving private data; explicit retry owns new read',async t=>{
 const h=await mount(t),held=deferred();h.runtime.read=()=>held.promise;await h.act(()=>{void h.result().refresh();});
 await h.act(()=>{for(const [fn,delay]of [...h.runtime.timers])if(delay===12000)fn();});assert.equal(h.result().visible,false);
 h.runtime.read=null;await h.retry();assert.equal(h.result().visible,true);await h.act(()=>held.resolve(snapshot()));assert.equal(h.result().visible,true);
});
test('same-account session replacement retires held reads; stale permission cannot reopen newer camera',async t=>{
 const h=await mount(t),permission=deferred(),held=deferred();h.runtime.permission=permission.promise;
 await h.act(()=>{void h.result().camera();});h.runtime.read=()=>held.promise;await h.act(()=>{void h.result().refresh();});
 h.runtime.read=null;await h.account(authority('viewer','two'));assert.equal(h.result().visible,true);
 await h.act(()=>{permission.resolve({granted:true});held.resolve(snapshot());});assert.equal(h.result().allowCamera,false);assert.equal(h.result().ui.partyRoomCameraPreviewIntent,false);
});
test('route and focus replacement remove only old channels; missing new room never falls back to old metadata',async t=>{
 const h=await mount(t),old=h.result().owner;h.runtime.partyId='ROOM02';h.runtime.snapshot=null;await h.render();
 assert.equal(h.result().visible,false);assert.equal(h.result().ui.room,null);assert.equal(h.result().ui.titleName,null);assert.equal(h.runtime.intervals.size,0);
 h.runtime.snapshot={...snapshot(),room:{...snapshot().room,partyId:'ROOM02'},memberships:[{...member(),partyId:'ROOM02'}]};await h.retry();assert.equal(h.result().visible,true);
 const newer=h.runtime.channels.slice(-3);old.retire();assert.equal(h.runtime.removed.some(channel=>newer.includes(channel)),false);
 h.runtime.focused=false;await h.render();assert.equal(h.result().visible,false);h.runtime.focused=true;await h.render();assert.equal(h.result().visible,true);
});
test('initial unavailable and denied admission never start channels or load private history',async t=>{
 const missing=await mount(t,{initial:null});assert.equal(missing.runtime.joinCalls,0);assert.equal(missing.runtime.channels.length,0);assert.equal(missing.result().visible,false);
 const denied=await mount(t,{deny:true});assert.equal(denied.runtime.joinCalls,0);assert.equal(denied.runtime.channels.length,0);assert.equal(denied.result().ui.room,null);
});
for(const change of ['source','generation'])test(`held join cannot certify a changed room ${change} or show old content`,async t=>{
 const joining=deferred(),h=await mount(t,{initial:snapshot([]),join:()=>joining.promise});
 h.runtime.snapshot={...snapshot(),room:{...snapshot().room,...(change==='source'?{sourceId:'other-title',titleId:'other-title'}:{roomGeneration:'new-generation'})}};
 await h.act(()=>joining.resolve(member()));assert.equal(h.result().visible,false);assert.equal(h.result().ui.titleName,null);assert.equal(h.runtime.channels.length,0);
});
test('established owner cannot reactivate retained callbacks from a previous effect lifetime',async t=>{
 const h=await mount(t),owned=h.result().owner,old=h.runtime.channels[0];
 await h.act(()=>{owned.retire();owned.activate();for(const event of old.callbacks)if(event.type==='presence')event.fn({newPresences:[{username:'Retired name'}]});});
 assert.equal(owned.current(),false);assert.equal(h.result().ui.messages.length,0);assert.equal(h.result().visible,false);
 await h.retry();assert.equal(h.result().visible,true);
});
test('opaque own-viewer withdrawal refreshes mounted room automatically; bursts queue one trailing canonical read',async t=>{
 const h=await mount(t),held=deferred(),before=h.runtime.reads.length;
 h.runtime.read=()=>held.promise;await h.act(()=>{for(const callback of h.runtime.hints)callback();});
 await h.act(()=>{for(let n=0;n<1000;n++)for(const callback of h.runtime.hints)callback();});assert.equal(h.runtime.reads.length,before+1);
 h.runtime.read=null;h.runtime.snapshot=null;await h.act(()=>held.resolve(snapshot()));
 assert.equal(h.runtime.reads.length,before+2);assert.equal(h.result().visible,false);assert.equal(h.result().ui.room,null);assert.equal(h.runtime.hints.size,0);
});
test('same-topic replacement waits for captured asynchronous channel removal before reacquiring resources',async t=>{
 const h=await mount(t),removal=deferred(),old=[...h.runtime.channels];h.runtime.removalHold=removal.promise;
 await h.account(authority('viewer','replacement'));assert.equal(h.runtime.channels.length,3);
 await h.act(()=>removal.resolve());assert.equal(h.runtime.channels.length,6);
 assert.equal(h.runtime.removed.some(channel=>!old.includes(channel)),false);assert.equal(h.result().visible,true);
});
test('component remount cannot reacquire shared provider topics before old owner removal settles',async t=>{
 const h=await mount(t),removal=deferred();h.runtime.removalHold=removal.promise;
 await h.remount();assert.equal(h.runtime.channels.length,3);
 await h.act(()=>removal.resolve());assert.equal(h.runtime.channels.length,6);assert.equal(h.result().visible,true);
});

const selectedFile={uri:'file:///native-selected.png',name:'native-selected.png',mimeType:'image/png'};
test('actual Party native presentation tears down foreground resources but applies only after fresh admission on return',async t=>{
 const h=await mount(t),native=deferred();h.runtime.nativePick=()=>native.promise;
 await h.pick();await h.choose();assert.equal(h.runtime.nativeStarts,1);
 const old=h.result().owner;await h.app('background');
 assert.equal(old.current(),false);assert.equal(h.result().ui.room,null);assert.equal(h.runtime.removed.length,3);assert.equal(h.runtime.intervals.size,0);
 await h.act(()=>native.resolve(selectedFile));assert.equal(h.result().ui.chatAttachmentFile,null,'background result is not applied');
 await h.app('active');assert.equal(h.result().visible,true);assert.equal(h.result().ui.chatAttachmentFile,selectedFile);
 assert.notEqual(h.result().owner,old);assert.equal(h.runtime.nativeStarts,1);
});
for(const reason of ['source','generation','rejoin','paid','admission'])test(`actual Party post-native ${reason} change cannot be rebound to the new foreground owner`,async t=>{
 const h=await mount(t),native=deferred();h.runtime.nativePick=()=>native.promise;
 await h.pick();await h.choose();await h.app('background');
 if(reason==='source')h.runtime.snapshot.room.sourceId='replacement';
 if(reason==='generation')h.runtime.snapshot.room.roomGeneration='replacement';
 if(reason==='rejoin'){h.runtime.snapshot.memberships[0].joinedAt='replacement';h.runtime.join=async()=>h.runtime.snapshot.memberships[0];}
 if(reason==='paid')h.runtime.ticket={allowed:false,requiresPurchase:true,reason:'ticket_required'};
 if(reason==='admission')h.runtime.accessDenied=true;
 await h.act(()=>native.resolve(selectedFile));await h.app('active');
 assert.equal(h.result().ui.chatAttachmentFile,null);assert.equal(h.runtime.nativeStarts,1);
});
test('actual Party releases a native result when account retirement wins the final caller handoff',async t=>{
 const h=await mount(t),file={...selectedFile};let cleaned=0;
 h.runtime.nativeResourceCleanup=async()=>{cleaned++;};h.runtime.nativePick=async()=>file;
 h.runtime.afterPickerHandoff=()=>{h.runtime.authority=authority('replacement','replacement');};
 await h.pick();await h.choose();
 assert.equal(h.result().ui.chatAttachmentFile,null);assert.equal(cleaned,1,'no staged owner accepts the retired result');
});

test('actual Party selected cache owner survives requested cleanup until canonical revocation clears the preview',async t=>{
 const h=await mount(t),file={...selectedFile};let cleaned=0;
 h.resources.ownPickedMedia(file,async()=>{cleaned++;});h.runtime.nativePick=async()=>file;
 await h.pick();await h.choose();await h.act(()=>h.resources.releasePickedMedia(file));
 assert.equal(cleaned,0);assert.equal(h.result().ui.chatAttachmentFile,file);
 h.runtime.snapshot=null;await h.refresh();assert.equal(h.result().ui.chatAttachmentFile,null);assert.equal(cleaned,1);
 await h.act(()=>h.resources.releasePickedMedia(file));assert.equal(cleaned,1,'exact native cache cleanup is idempotent');
});

test('actual Party canonical revocation clears an already selected file and its account subject',async t=>{
 const h=await mount(t);h.runtime.nativePick=async()=>selectedFile;
 await h.pick();await h.choose();assert.equal(h.result().ui.chatAttachmentFile,selectedFile);
 h.runtime.snapshot=null;await h.refresh();assert.equal(h.result().ui.chatAttachmentFile,null);assert.equal(h.result().visible,false);
});
for(const field of ['sourceId','roomGeneration'])test(`new foreground owner cannot adopt a selected file after canonical ${field} changes`,async t=>{
 const h=await mount(t);h.runtime.nativePick=async()=>selectedFile;
 await h.pick();await h.choose();assert.equal(h.result().ui.chatAttachmentFile,selectedFile);
 h.runtime.snapshot.room[field]='replacement';await h.account({...h.runtime.authority});
 assert.equal(h.result().visible,true);assert.equal(h.result().ui.chatAttachmentFile,null);
});
test('equivalent session snapshot refresh does not discard an unchanged pending native intent',async t=>{
 const h=await mount(t),native=deferred();h.runtime.nativePick=()=>native.promise;
 await h.pick();await h.choose();await h.account({...h.runtime.authority});
 await h.act(()=>native.resolve(selectedFile));assert.equal(h.result().ui.chatAttachmentFile,selectedFile);assert.equal(h.runtime.nativeStarts,1);
});
