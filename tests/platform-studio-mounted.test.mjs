import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {mount,React,ROOT,ts,deferred,video,edit,textOf} from './platform-studio-mounted-harness.mjs';
import {loadStubbed} from './customer-experience-adversarial-helpers.mjs';
const singleFlight=await import(`${ROOT}/_lib/actionSingleFlight.mjs`);
async function openClip(h,id){await h.press(h.button(`Open actions for Title ${id}`));await h.press(h.button('Edit details'));}
test('mounted Content card/action sheet opens Clip; stale A cannot overwrite B metadata or preview',async t=>{
 const requests=new Map();const h=await mount(t,{overrides:{readClipStudioEdit:id=>{const d=deferred();requests.set(id,d);return d.promise;}}});
 await openClip(h,'A');assert.equal(h.input('Clip title').props.value,'Title A');
 await h.press(h.button('Content'));await openClip(h,'B');await h.resolve(requests.get('B'),edit('B'));
 assert.equal(h.input('Title text').props.value,'Overlay B');await h.resolve(requests.get('A'),edit('A'));
 assert.equal(h.input('Clip title').props.value,'Title B');assert.equal(h.input('Title text').props.value,'Overlay B');
 assert.equal(h.find(n=>n.type==='Video').props.source.uri,'loaded:B');
});
test('mounted Content new-clip action invalidates a pending previous Clip read',async t=>{
 const pending=deferred();const h=await mount(t,{overrides:{readClipStudioEdit:()=>pending.promise}});
 await openClip(h,'A');await h.press(h.button('Content'));await h.press(h.button('Open Clip Studio'));
 await h.resolve(pending,edit('A'));assert.equal(h.input('Clip title').props.value,'');assert.equal(h.input('Title text').props.value,'');assert.equal(h.find(n=>n.type==='Video'),undefined);
});
test('mounted Clip read failure is visible, blocks destructive save, and Retry recovers',async t=>{
 const pending=deferred();let writes=0;const h=await mount(t,{overrides:{readClipStudioEdit:()=>pending.promise,saveClipStudioEdit:async()=>{writes++;}}});
 await openClip(h,'A');await h.reject(pending,Error('modeled unavailable metadata'));
 assert.match(h.text(),/Clip settings unavailable/);assert.equal(h.button('Save Draft').props.disabled,true);assert.equal(h.button('Publish Clip').props.disabled,true);assert.equal(writes,0);assert.equal(h.input('Clip title').props.editable,false);
 h.mocks.readClipStudioEdit=async()=>edit('A');await h.press(h.button('Retry'));assert.equal(h.input('Title text').props.value,'Overlay A');assert.equal(h.button('Save Draft').props.disabled,false);
});
test('mounted paid manager routes to the exact requested video beyond initial first four',async t=>{
 const h=await mount(t,{route:{tab:'monetization',focus:'offers',manage:'paid_videos',videoId:'target'},videos:Array.from({length:6},(_,i)=>video(`${i}`))});
 assert.ok(h.find(n=>n.props.testID==='money-paid-video-save-button'),'exact target has a visible save action');
 assert.match(h.text(),/Title target/);assert.ok(h.button('Manage paid unlock for Title 5'),'sixth loaded video is selectable');
 assert.ok(h.calls.some(([name,id])=>name==='readCreatorVideoForOwner'&&id==='target'));
});
function eventServices(){
 let creates=0,updates=0,readFail=false,stored;const gate=deferred();
 const supabase={from:()=>{let result;const chain={insert:payload=>{creates++;result={id:`event-${creates}`,...payload};return chain;},update:payload=>{updates++;result={...stored,...payload};return chain;},eq:()=>chain,select:()=>chain,returns:()=>chain,maybeSingle:async()=>({data:stored,error:null}),single:async()=>{await gate.promise;stored=result;return {data:result,error:null};}};return chain;}};
 const ctx={exports:{},Date,Promise,Map,require:name=>{if(name==='./supabase')return {supabase};if(name==='./actionSingleFlight.mjs')return singleFlight;throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${ROOT}/_lib/liveEvents.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,ctx);
 return {gate,create:ctx.exports.createCreatorEvent,update:ctx.exports.updateCreatorEvent,creates:()=>creates,updates:()=>updates,failRead:()=>{readFail=true;},read:async()=>{if(readFail)throw Error('modeled refresh offline');return [];}};
}
test('mounted Event form uses production event service; durable create plus read failure retries same id',async t=>{
 const s=eventServices();const h=await mount(t,{route:{tab:'live'},overrides:{createCreatorEvent:s.create,updateCreatorEvent:s.update,readCreatorEventReminderSummaries:s.read}});
 await h.change(h.input('Event title'),'Launch');await h.change(h.input('Starts at (YYYY-MM-DDTHH:mm)'),'2026-11-01T12:00');
 const save=h.button('Create Event');await h.press(save);await React.act(async()=>{void save.props.onPress();});assert.equal(s.creates(),1);
 const inputWasLocked=h.input('Event title').props.editable===false;s.failRead();await h.resolve(s.gate);
 assert.match(h.text(),/Event saved.*schedule could not refresh/);assert.ok(h.button('Update Event'));
 await h.press(h.button('Update Event'));assert.equal(s.creates(),1);assert.equal(s.updates(),1);assert.ok(inputWasLocked,'held save locks keyboard edits');
});
test('all nine mounted Studio tabs remain reachable with selected tab accessibility state',async t=>{
 const h=await mount(t);for(const label of ['Home','Content','Clip','Live','Audience','Moderation','Insights','Monetization','Brand']){
  const b=h.button(label);assert.ok(b,`${label} tab exists`);await h.press(b);const active=h.button(label);assert.equal(active.props.accessibilityRole,'tab');assert.equal(active.props.accessibilityState.selected,true);
 }
});

for(const outcome of ['success','wrong-target','unavailable','rejected']){
 test(`mounted paid-video visible save proves exact input and truthful ${outcome} readback`,async t=>{
  let saved=false,writes=0;const gate=deferred();const h=await mount(t,{route:{tab:'monetization',manage:'paid_videos'},overrides:{
   savePaidVideoOffer:async input=>{writes++;assert.equal(input.videoId,'B');assert.equal(input.priceCents,99);assert.equal(input.isPaid,true);await gate.promise;if(outcome==='rejected')throw Error('rejected');saved=true;return {status:'saved',id:'offer-B'};},
   listMyPaidVideoOffers:async()=>{if(!saved)return [];if(outcome==='unavailable')throw Error('offline');return [{id:'offer-B',videoId:outcome==='wrong-target'?'A':'B',creatorId:'owner',isPaid:true,priceCents:99,currency:'usd',status:'sandbox'}];},
   saveCreatorSandboxMonetizationConfig:async()=>({id:'config-B'}),
  }});
  await h.press(h.button('Manage paid unlock for Title B'));await h.press(h.button('Paid'));
  const save=h.find(n=>n.props.testID==='money-paid-video-save-button');await h.press(save);await React.act(async()=>{void save.props.onPress();});assert.equal(writes,1);
  await h.resolve(gate);if(outcome==='success')assert.match(h.text(),/Paid Video setup saved at \$0.99/);else {assert.doesNotMatch(h.text(),/Paid Video setup saved at/);assert.match(h.text(),/could not be confirmed/);}
  assert.ok(h.find(n=>n.props.testID==='money-paid-video-editor'),'selection stays visible after result');
 });
}

test('mounted Content queries Drafts and oldest globally, and advances server offset independently',async t=>{
 const first=Array.from({length:51},(_,i)=>video(String(i)));
 const older=video('older-draft','draft');const h=await mount(t,{videos:first,overrides:{readCreatorVideos:async(_id,options)=>{
  if(options.visibility==='draft')return [older];if(options.sort==='oldest')return [video('oldest')];if(options.offset===50)return [video('50'),video('51')];return first;
 }} });
 await h.press(h.button('Drafts'));await h.timers();assert.ok(h.button('Open actions for Title older draft'));assert.equal(h.button('Open actions for Title 0'),undefined);
 assert.ok(h.calls.some(([name,_id,o])=>name==='readCreatorVideos'&&o.visibility==='draft'));
 await h.press(h.button('All'));await h.press(h.button('Oldest'));await h.timers();assert.ok(h.button('Open actions for Title oldest'));
 await h.press(h.button('Newest'));await h.timers();const more=h.button('Load more content')||h.button('Load more videos');assert.ok(more,'visible paging action');await h.press(more);
 assert.ok(h.calls.some(([name,_id,o])=>name==='readCreatorVideos'&&o.offset===50));assert.ok(h.button('Open actions for Title 51'));
});

const brandProfile=()=>({ownerUserId:'owner',heroImageAssetId:null,heroVideoAssetId:null,heroPosterAssetId:null,backgroundImageAssetId:null,avatarAssetId:null,logoAssetId:null,watermarkAssetId:null,spotlightVideoId:null,themePreset:'city_night',accentColor:'#DC143C',heroFitMode:'fill',heroFocalX:0.5,heroFocalY:0.5,heroCropScale:1,backgroundFitMode:'fill',backgroundFocalX:0.5,backgroundFocalY:0.5,overlayStrength:0.62,blurStrength:0,publishedAt:null,updatedAt:'2026-10-01T00:00:00Z'});
const brandBundle=profile=>({profile,assets:[],heroImage:null,heroVideo:null,heroPoster:null,backgroundImage:null,avatar:null,logo:null,watermark:null});
test('mounted Brand draft uses production compatibility guard, preserves edits, and retries once after recovery',async t=>{
 const errors=loadStubbed(`${ROOT}/_lib/userFacingErrors.ts`);
 let profile=brandProfile(),writes=0,profileSaves=0,reads=0;
 const authority={userId:'owner',accountId:'owner',state:'ACTIVE',restoreOnly:false,sessionGeneration:'first'};
 const gate=deferred();let capability=gate.promise;
 const api=loadStubbed(`${ROOT}/_lib/platformBranding.ts`,{
  './userFacingErrors':errors,
  './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a===b},
  './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async owner=>{
   assert.equal(owner,'owner');return {accessToken:'fixture-token',authority};
  },invokeAccountBoundSupabaseMutationRpc:async(subject,name,args)=>{
   reads++;assert.equal(name,'read_public_platform_identity');assert.equal(args.profile_user_id,'owner');assert.equal(subject.authority.userId,'owner');return await capability;
  }},
  './supabase':{supabase:{from:table=>({upsert:payload=>{
   writes++;assert.equal(table,'platform_brand_profiles');assert.equal(payload.owner_user_id,'owner');assert.equal(Object.hasOwn(payload,'published_at'),false);
   return {setHeader(name,value){assert.equal(name,'Authorization');assert.equal(value,'Bearer fixture-token');return this;},select:()=>({returns:()=>({single:async()=>({data:{...payload,published_at:'existing-server-publication'},error:null})})})};
  }})}},
 });
 const h=await mount(t,{route:{tab:'brand',focus:'theme'},overrides:{
  getUserFacingErrorMessage:errors.getUserFacingErrorMessage,
  readPlatformBrandStudio:async()=>brandBundle(profile),
  savePlatformBrandProfileDraft:async(...args)=>{const saved=await api.savePlatformBrandProfileDraft(...args);profile=saved;return saved;},
  saveUserProfileRemote:async(p,id)=>{profileSaves++;assert.equal(id,'owner');assert.equal(p.displayName,'Preserved edit');return p;},
 }});
 await h.change(h.input('Platform Name'),'Preserved edit');
 const save=h.button('Save Brand Studio Draft');await h.press(save);await React.act(async()=>{void save.props.onPress();});
 assert.equal(reads,1);assert.equal(writes,0);assert.equal(profileSaves,0);assert.equal(h.input('Platform Name').props.editable,false);
 await h.resolve(gate,{data:null,error:{code:'PGRST202',message:'private_schema_detail'}});
 assert.match(h.text(),/Brand draft saving is temporarily unavailable/);assert.match(h.text(),/name and tagline were not saved/);
 assert.doesNotMatch(h.text(),/Draft changes saved|private_schema_detail/);assert.equal(h.input('Platform Name').props.value,'Preserved edit');
 assert.equal(h.input('Platform Name').props.editable,true);assert.equal(writes,0);assert.equal(profileSaves,0);
 capability={data:[{user_id:'owner'}],error:null};await h.press(h.button('Save Brand Studio Draft'));
 assert.equal(reads,2);assert.equal(writes,1);assert.equal(profileSaves,1);assert.match(h.text(),/Draft changes saved/);
 assert.equal(h.input('Platform Name').props.editable,true);
 capability={data:null,error:{code:'PGRST202'}};await h.press(h.button('Save Brand Studio Draft'));
 assert.equal(reads,3);assert.equal(writes,1);assert.equal(profileSaves,1);assert.match(h.text(),/temporarily unavailable/);
});
test('mounted Brand profile save failure stays visible and Publish retries unsaved identity',async t=>{
 let profile=brandProfile(),saves=0,publishes=0;const gate=deferred();const h=await mount(t,{route:{tab:'brand',focus:'theme'},overrides:{
  readPlatformBrandStudio:async()=>brandBundle(profile),savePlatformBrandProfileDraft:async(_owner,draft)=>{profile=draft;return profile;},
  saveUserProfileRemote:async(p,id)=>{saves++;assert.equal(id,'owner');assert.equal(p.displayName,'Edited name');if(saves===1){await gate.promise;throw Error('modeled remote rejection');}return p;},
  publishPlatformBrandProfile:async(_owner,draft)=>{publishes++;profile={...draft,publishedAt:'2026-10-15T00:00:00Z'};return profile;},
  resolveBrandPublishReadbackStatus:async()=>({selectedCount:0,publicReturnedCount:0}),
 }});
 await h.change(h.input('Platform Name'),'Edited name');const save=h.button('Save Brand Studio Draft');await h.press(save);await React.act(async()=>{void save.props.onPress();});assert.equal(saves,1);assert.equal(h.input('Platform Name').props.editable,false);
 await h.resolve(gate);assert.match(h.text(),/name or tagline changes could not be saved/);assert.equal(h.input('Platform Name').props.value,'Edited name');
 await h.press(h.button('Publish Brand Studio Changes'));assert.equal(saves,2,'failed identity was not marked saved');assert.equal(publishes,1);assert.match(h.text(),/settings published/);
});
test('mounted Brand load failure exposes Retry and no destructive editor or publish action',async t=>{
 const h=await mount(t,{route:{tab:'brand'},overrides:{readPlatformBrandStudio:async()=>{throw Error('offline');}}});
 assert.match(h.text(),/Brand Studio unavailable/);assert.equal(h.button('Publish Brand Studio Changes'),undefined);
 await h.press(h.button('Retry'));assert.match(h.text(),/Brand Studio could not load Platform media right now/);
 h.mocks.readPlatformBrandStudio=async()=>brandBundle(brandProfile());await h.press(h.button('Retry'));assert.ok(h.button('Publish Brand Studio Changes'));
 assert.doesNotMatch(h.text(),/Brand Studio could not load|Brand Studio unavailable/);
});
const uploadedBrandAsset=(id,assetType='hero_image')=>({id,ownerUserId:'owner',assetType,assetState:'published',moderationStatus:'clean',scanStatus:'clean',deletedAt:null,signedUrl:`fixture:${id}`,mimeType:'image/jpeg',fileSizeBytes:123,originalFileName:`${id}.jpg`});
async function mountedBrandLibrary(t,{saveFails=false,removeFails=false,oldSelected=false,refreshFails=false,removeGate=null,uncertainOutcome=null,exactReadFails=false,exactReadGate=null,exactRow=undefined,omitFromRecent=false,staleBundle=false,profileSaveGate=null,profileSaveFails=false,brandSaveGate=null,brandPublishGate=null}={}){
 const errors=loadStubbed(`${ROOT}/_lib/userFacingErrors.ts`);
 const hero=uploadedBrandAsset('hero-asset'),background=uploadedBrandAsset('background-asset','background_image'),unused=uploadedBrandAsset('older-upload','logo');
 let profile={...brandProfile(),heroImageAssetId:hero.id,backgroundImageAssetId:background.id},published={...profile};
 let assets=[hero,background,unused],saves=0,publishes=0,removes=0,reads=0,exactReads=0,profileWrites=0,removed=false;const exactStatuses=[];
 let authority={userId:'owner',accountId:'owner',state:'ACTIVE',restoreOnly:false,sessionGeneration:'first'};
 const api=loadStubbed(`${ROOT}/_lib/platformBranding.ts`,{
  './userFacingErrors':errors,
  './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a===b},
  './supabase':{supabase:{from:table=>{
   assert.equal(table,'platform_brand_assets');const filters={};
   const chain={select:columns=>{assert.equal(columns,'id,owner_user_id,deleted_at,asset_state');return chain;},
    eq:(key,value)=>{filters[key]=value;return chain;},maybeSingle:async()=>{
     exactReads++;assert.equal(filters.owner_user_id,'owner');assert.equal(filters.id,'older-upload');
     if(exactReadGate)await exactReadGate.promise;
     if(exactReadFails)return {data:null,error:{message:'private_exact_read_failure'}};
     return {data:exactRow===undefined?{id:filters.id,owner_user_id:filters.owner_user_id,deleted_at:removed?'2026-10-21T00:00:00Z':null,asset_state:removed?'archived':'draft'}:exactRow,error:null};
    }};return chain;
  }}},
  './accountBoundSupabaseMutation':{runCurrentAccountBoundSupabaseMutationRpc:async(name,args,owner)=>{
   assert.equal(name,'remove_platform_brand_asset');assert.equal(owner,'owner');removes++;if(removeGate)await removeGate.promise;
   if([profile.heroImageAssetId,profile.backgroundImageAssetId,published.heroImageAssetId,published.backgroundImageAssetId].includes(args.p_asset_id))return {data:null,error:{message:'brand_asset_in_use'}};
   if(removeFails)return {data:null,error:{message:'private_storage_detail'}};
   assets=assets.filter(a=>a.id!==args.p_asset_id);removed=true;
   if(uncertainOutcome==='lost-response')throw Error('account_bound_rpc_outcome_unknown');
   if(uncertainOutcome==='unavailable')return {data:null,error:{message:'account_bound_rpc_unavailable'}};
   if(uncertainOutcome==='numeric-ack')return {data:{assetId:args.p_asset_id,deletedAt:123},error:null};
   if(uncertainOutcome==='object-ack')return {data:{assetId:args.p_asset_id,deletedAt:{}},error:null};
   if(uncertainOutcome==='nondate-ack')return {data:{assetId:args.p_asset_id,deletedAt:'not-a-date'},error:null};
   if(uncertainOutcome==='malformed-ack')return {data:{assetId:'wrong-target',deletedAt:null},error:null};
   return {data:{assetId:args.p_asset_id,deletedAt:'2026-10-21T00:00:00Z'},error:null};
  }},
 });
 const h=await mount(t,{route:{tab:'brand',focus:'theme'},overrides:{
  getUserFacingErrorMessage:errors.getUserFacingErrorMessage,
  getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a===b,
  readPlatformBrandStudio:async()=>{
   reads++;if(refreshFails&&removed)throw Error('offline');
   if(staleBundle&&removed)return {...brandBundle(profile),assets:[hero,background,unused],logo:unused};
   return {...brandBundle(profile),assets:assets.filter(a=>(!omitFromRecent||!removes||a.id!=='older-upload')&&(!oldSelected||a.id!==hero.id||profile.heroImageAssetId===hero.id)),heroImage:assets.find(a=>a.id===profile.heroImageAssetId)??null,backgroundImage:assets.find(a=>a.id===profile.backgroundImageAssetId)??null};
  },
  formatPlatformBrandFileSize:()=> '123 bytes',removePlatformBrandAsset:api.removePlatformBrandAsset,
  readPlatformBrandAssetRemovalStatus:async asset=>{const status=await api.readPlatformBrandAssetRemovalStatus(asset);exactStatuses.push(status);return status;},
  savePlatformBrandProfileDraft:async(owner,next)=>{assert.equal(owner,'owner');saves++;if(brandSaveGate)await brandSaveGate.promise;if(saveFails)throw Error('modeled draft write rejection');profile={...next};return profile;},
  publishPlatformBrandProfile:async(owner,next)=>{assert.equal(owner,'owner');publishes++;if(brandPublishGate)await brandPublishGate.promise;profile={...next,publishedAt:'2026-10-21T00:00:00Z'};published={...profile};return profile;},
  resolveBrandPublishReadbackStatus:async()=>({selectedCount:0,publicReturnedCount:0}),saveUserProfileRemote:async p=>{profileWrites++;if(profileSaveGate)await profileSaveGate.promise;if(profileSaveFails)throw Error('profile save rejected');return p;},
 }});
 const removeButton=id=>h.find(n=>n.type==='TouchableOpacity'&&n.props.testID===`brand-uploaded-remove-${id}`);
 const remove=async id=>{await h.press(removeButton(id));const alert=h.alerts.at(-1);assert.equal(alert[0],'Remove uploaded media?');await React.act(async()=>alert[2].find(b=>b.text==='Remove uploaded media').onPress());};
 return {h,remove,removeButton,setAuthority:value=>{authority=value;},readExact:()=>api.readPlatformBrandAssetRemovalStatus(unused),authority:()=>authority,state:()=>({profile,published,assets,saves,publishes,removes,reads,exactReads,exactStatuses,profileWrites})};
}
for(const type of ['hero','background'])for(const outcome of ['rejected','saved']){
 test(`mounted Brand ${type} remove from design keeps truthful ${outcome} draft feedback without deleting`,async t=>{
  const f=await mountedBrandLibrary(t,{saveFails:outcome==='rejected'}),{h}=f;
  await h.press(h.button(type==='hero'?'Open Hero Media':'Open Brand Studio Background'));await h.press(h.button(type==='hero'?'Remove Hero Image from design':'Remove Background Image from design'));
  assert.equal(f.state().removes,0);assert.equal(f.state().publishes,0);assert.equal(f.state().saves,1);
  assert.equal(h.button('Save Brand Studio Draft').props.disabled,false);
  const field=type==='hero'?'heroImageAssetId':'backgroundImageAssetId';
  if(outcome==='rejected'){
   assert.match(h.text(),/Unable to save Brand Studio changes right now/);assert.equal(f.state().profile[field],`${type}-asset`);
   assert.ok(h.button(type==='hero'?'Remove Hero Image from design':'Remove Background Image from design'));
  }else{
   assert.match(h.text(),/Removed from your saved design.*upload is retained/);assert.equal(f.state().profile[field],null);
   assert.ok(f.removeButton(`${type}-asset`),'cleared upload stays in owner library');
  }
  assert.equal(f.state().published[field],`${type}-asset`,'public design changes only through explicit Publish');
 });
}
for(const type of ['hero','background']){
 test(`mounted queued ${type} design-clear callback cannot dispatch into replacement session`,async t=>{
  const f=await mountedBrandLibrary(t),{h}=f;
  await h.press(h.button(type==='hero'?'Open Hero Media':'Open Brand Studio Background'));
  const queued=h.button(type==='hero'?'Remove Hero Image from design':'Remove Background Image from design');
  const replacement={...f.authority(),sessionGeneration:'replacement'};f.setAuthority(replacement);
  await h.account({user:{id:'owner',email:'clear-replacement@example.test'},isSignedIn:true,isLoading:false,authority:replacement,authorityStatus:'active'});
  await React.act(async()=>queued.props.onPress());
  assert.equal(f.state().saves,0,'not even one old draft write may dispatch');
  assert.equal(f.state().publishes,0);assert.equal(f.state().removes,0);
  assert.equal(f.state().profile.heroImageAssetId,'hero-asset');assert.equal(f.state().profile.backgroundImageAssetId,'background-asset');
  assert.equal(h.button('Save Brand Studio Draft').props.disabled,false);
  assert.doesNotMatch(h.text(),/Removed from your saved design|Draft changes saved/);
 });
 test(`mounted ${type} design-clear late read cannot release replacement save lock or show old success`,async t=>{
  const f=await mountedBrandLibrary(t),{h}=f,oldRead=deferred(),newRead=deferred();
  await h.press(h.button(type==='hero'?'Open Hero Media':'Open Brand Studio Background'));
  const original=h.mocks.readPlatformBrandStudio;h.mocks.readPlatformBrandStudio=()=>oldRead.promise;
  await h.press(h.button(type==='hero'?'Remove Hero Image from design':'Remove Background Image from design'));
  assert.equal(f.state().saves,1,'the initiating session may dispatch exactly one authorized clear');
  const replacement={...f.authority(),sessionGeneration:'replacement'};f.setAuthority(replacement);
  h.mocks.readPlatformBrandStudio=original;
  await h.account({user:{id:'owner',email:'clear-read-replacement@example.test'},isSignedIn:true,isLoading:false,authority:replacement,authorityStatus:'active'});
  await h.route({focus:'theme'});await h.change(h.input('Platform Name'),'Replacement edit');
  h.mocks.readPlatformBrandStudio=()=>newRead.promise;await h.press(h.button('Save Brand Studio Draft'));
  await h.resolve(oldRead,await original());
  assert.equal(h.button('Save Brand Studio Draft').props.disabled,true);
  assert.equal(h.input('Platform Name').props.value,'Replacement edit');
  assert.doesNotMatch(h.text(),/Removed from your saved design|Draft changes saved|Account changed/);
  assert.equal(f.state().profileWrites,0);assert.equal(f.state().saves,2);
  await h.resolve(newRead,await original());assert.equal(f.state().profileWrites,1);
  assert.equal(f.state().publishes,0);assert.equal(f.state().removes,0);
 });
}
test('mounted Brand clears saved design, explicitly publishes, then removes older upload through real helper',async t=>{
 const f=await mountedBrandLibrary(t,{oldSelected:true}),{h}=f;
 assert.ok(f.removeButton('hero-asset'));assert.ok(f.removeButton('older-upload'));
 await h.press(h.button('Open Hero Media'));await h.press(h.button('Remove Hero Image from design'));
 assert.equal(f.state().saves,1);assert.equal(f.state().publishes,0);assert.equal(f.state().removes,0);
 assert.ok(f.removeButton('hero-asset'),'old selection stays reachable after leaving the bounded recent list');
 await f.remove('hero-asset');assert.match(h.text(),/Remove this media from your Platform design and publish/);
 assert.equal(f.state().published.heroImageAssetId,'hero-asset');assert.ok(f.removeButton('hero-asset'));
 await h.press(h.button('Publish Brand Studio Changes'));assert.equal(f.state().publishes,1);assert.equal(f.state().published.heroImageAssetId,null);
 const saves=f.state().saves,reads=f.state().reads;await f.remove('hero-asset');
 assert.equal(f.state().saves,saves,'library removal does not save draft');assert.equal(f.state().publishes,1,'library removal does not publish');
 assert.equal(f.state().reads,reads+1,'successful removal refreshes bounded owner bundle');assert.equal(f.removeButton('hero-asset'),undefined);
 assert.match(h.text(),/removed from your library and retained/);assert.ok(f.removeButton('older-upload'));
});
test('mounted Brand in-use upload removal preserves selected media and unsaved identity with actionable notice',async t=>{
 const f=await mountedBrandLibrary(t),{h}=f;await h.route({focus:'theme'});await h.change(h.input('Platform Name'),'Unsaved identity');
 await f.remove('hero-asset');assert.match(h.text(),/Remove this media from your Platform design and publish the change/);
 assert.equal(h.input('Platform Name').props.value,'Unsaved identity');assert.equal(f.state().profile.heroImageAssetId,'hero-asset');
 assert.equal(f.state().saves,0);assert.equal(f.state().publishes,0);assert.ok(f.removeButton('hero-asset'));
 assert.doesNotMatch(h.text(),/brand_asset_in_use|Uploaded media removed from/);
});
test('mounted Brand library transport failure reconciles exact present row and does not expose backend details',async t=>{
 const f=await mountedBrandLibrary(t,{removeFails:true}),{h}=f;await h.route({focus:'theme'});await h.change(h.input('Platform Name'),'Keep my edits');
 const before=f.state();await f.remove('older-upload');assert.equal(h.input('Platform Name').props.value,'Keep my edits');
 assert.deepEqual(f.state().assets,before.assets);assert.deepEqual(f.state().profile,before.profile);assert.equal(f.state().saves,0);assert.equal(f.state().publishes,0);
 assert.equal(f.state().reads,before.reads+1);assert.equal(f.state().exactReads,1);assert.ok(f.removeButton('older-upload'));assert.match(h.text(),/Removal could not be confirmed.*still present/);assert.doesNotMatch(h.text(),/private_storage_detail|library are unchanged/);
});
test('mounted Brand removal refresh failure reports committed removal without discarding edits',async t=>{
 const f=await mountedBrandLibrary(t,{refreshFails:true}),{h}=f;await h.route({focus:'theme'});await h.change(h.input('Platform Name'),'Keep through refresh');
 await f.remove('older-upload');assert.match(h.text(),/removal was saved, but the library could not refresh/);
 assert.equal(h.input('Platform Name').props.value,'Keep through refresh');assert.equal(f.state().saves,0);assert.equal(f.state().publishes,0);assert.equal(f.removeButton('older-upload'),undefined,'validated acknowledgement hides removed media even if refresh fails');
});
for(const uncertainOutcome of ['lost-response','malformed-ack','nondate-ack','numeric-ack','object-ack','unavailable'])test(`mounted real Brand helper reconciles committed ${uncertainOutcome} through exact tombstone without retry`,async t=>{
 const f=await mountedBrandLibrary(t,{uncertainOutcome}),{h}=f;
 await h.change(h.input('Platform Name'),'Keep uncertain edits');await h.press(h.button('Gold accent'));
 const reads=f.state().reads;await f.remove('older-upload');
 assert.equal(f.state().removes,1);assert.equal(f.state().reads,reads+1);assert.equal(f.state().exactReads,1);
 assert.equal(f.state().saves,0);assert.equal(f.state().publishes,0);assert.equal(f.removeButton('older-upload'),undefined);
 assert.match(h.text(),/removal was confirmed/);assert.doesNotMatch(h.text(),/library are unchanged|Please try again|account_bound_rpc/);
 assert.equal(h.input('Platform Name').props.value,'Keep uncertain edits');
 await h.press(h.button('Save Brand Studio Draft'));assert.equal(f.state().profile.accentColor,'#F2C25B');assert.equal(f.state().removes,1);
});
for(const uncertainOutcome of [null,'lost-response'])test(`mounted ${uncertainOutcome??'valid-ack'} removal overrides stale recent and selected bundle without changing design`,async t=>{
 const f=await mountedBrandLibrary(t,{uncertainOutcome,staleBundle:true}),{h}=f;
 await h.change(h.input('Platform Name'),'Keep race edits');await h.press(h.button('Gold accent'));
 const before=f.state();await f.remove('older-upload');
 assert.match(h.text(),/removal was confirmed|Uploaded media removed/);
 assert.equal(f.removeButton('older-upload'),undefined,'stale list and selected logo must not restore removed row');
 assert.ok(f.removeButton('hero-asset'));assert.ok(f.removeButton('background-asset'));
 assert.equal(f.state().removes,1);assert.equal(f.state().exactReads,uncertainOutcome?1:0);
 assert.equal(f.state().saves,0);assert.equal(f.state().publishes,0);
 assert.deepEqual(f.state().profile,before.profile);assert.deepEqual(f.state().published,before.published);
 assert.equal(h.input('Platform Name').props.value,'Keep race edits');
 await h.press(h.button('Save Brand Studio Draft'));assert.equal(f.state().profile.accentColor,'#F2C25B');
 assert.equal(f.state().removes,1);
});
for(const order of ['list-first','tombstone-first'])test(`mounted uncertain removal retains tombstone across ${order} reconciliation ordering`,async t=>{
 const gate=deferred(),f=await mountedBrandLibrary(t,{uncertainOutcome:'lost-response',staleBundle:true,...(order==='list-first'?{exactReadGate:gate}:{})}),{h}=f;
 const stale={...brandBundle(f.state().profile),assets:[...f.state().assets],logo:f.state().assets.find(a=>a.id==='older-upload')};
 if(order==='tombstone-first')h.mocks.readPlatformBrandStudio=()=>gate.promise;
 await f.remove('older-upload');await h.resolve(gate,stale);
 assert.equal(f.removeButton('older-upload'),undefined);assert.match(h.text(),/removal was confirmed/);
 assert.equal(f.state().removes,1);
});
for(const uncertainOutcome of [null,'lost-response'])test(`mounted ${uncertainOutcome??'valid-ack'} earlier in-flight owner read preserves tombstone and unsaved edits`,async t=>{
 const f=await mountedBrandLibrary(t,{uncertainOutcome}),{h}=f,earlier=deferred();
 const stale={...brandBundle(f.state().profile),assets:[...f.state().assets],logo:f.state().assets.find(a=>a.id==='older-upload')};
 const read=h.mocks.readPlatformBrandStudio;let held=false;
 h.mocks.readPlatformBrandStudio=()=>{if(!held){held=true;return earlier.promise;}return read();};
 // Same session, updated email retriggers the real initial owner bundle load.
 await h.account({user:{id:'owner',email:'updated@example.test'},isSignedIn:true,isLoading:false,authority:f.authority(),authorityStatus:'active'});
 assert.equal(held,true);await h.change(h.input('Platform Name'),'Keep late read edits');await h.press(h.button('Gold accent'));
 await f.remove('older-upload');assert.match(h.text(),/removal was confirmed|Uploaded media removed/);
 await h.resolve(earlier,stale);
 assert.ok(h.button('Gold accent').props.style[1],'late read preserves unrelated unsaved accent');
 assert.equal(h.input('Platform Name').props.value,'Keep late read edits');
 assert.equal(f.removeButton('older-upload'),undefined);assert.ok(f.removeButton('hero-asset'));
 assert.equal(f.state().removes,1);assert.equal(f.state().saves,0);assert.equal(f.state().publishes,0);
 // Replacement session must not inherit prior session's local tombstone IDs.
 const replacement={...f.authority(),sessionGeneration:'replacement'};f.setAuthority(replacement);
 h.mocks.readPlatformBrandStudio=async()=>stale;
 await h.account({user:{id:'owner',email:'updated@example.test'},isSignedIn:true,isLoading:false,authority:replacement,authorityStatus:'active'});
 assert.ok(f.removeButton('older-upload'),'same-owner replacement session has fresh evidence scope');
});
for(const timing of ['before-edit','after-edit','after-failed-save'])test(`mounted owner read begun ${timing} preserves dirty Brand draft and refreshes media`,async t=>{
 const f=await mountedBrandLibrary(t,{saveFails:timing==='after-failed-save'}),{h}=f,gate=deferred();
 const fresh={...brandBundle(f.state().profile),assets:[...f.state().assets,uploadedBrandAsset('newly-read')]};
 if(timing!=='before-edit')await h.press(h.button('Gold accent'));
 if(timing==='after-failed-save')await h.press(h.button('Save Brand Studio Draft'));
 h.mocks.readPlatformBrandStudio=()=>gate.promise;
 await h.account({user:{id:'owner',email:`${timing}@example.test`},isSignedIn:true,isLoading:false,authority:f.authority(),authorityStatus:'active'});
 if(timing==='before-edit')await h.press(h.button('Gold accent'));
 await h.resolve(gate,fresh);
 assert.ok(h.button('Gold accent').props.style[1],'dirty accent is not overwritten');
 assert.ok(f.removeButton('newly-read'),'fresh media evidence is still rendered');
 assert.equal(f.state().saves,timing==='after-failed-save'?1:0);
 const replacement={...f.authority(),sessionGeneration:'next'};f.setAuthority(replacement);
 h.mocks.readPlatformBrandStudio=async()=>fresh;
 await h.account({user:{id:'owner',email:'next@example.test'},isSignedIn:true,isLoading:false,authority:replacement,authorityStatus:'active'});
 assert.equal(!!h.button('Gold accent').props.style[1],false,'replacement session does not inherit dirty edits');
});
for(const profileSaveFails of [false,true])test(`mounted same-session profile save overlap preserves local name on ${profileSaveFails?'failure':'success'}`,async t=>{
 const saveGate=deferred(),f=await mountedBrandLibrary(t,{profileSaveGate:saveGate,profileSaveFails}),{h}=f;
 await h.change(h.input('Platform Name'),'Keep overlapping name');await h.press(h.button('Gold accent'));
 await h.press(h.button('Save Brand Studio Draft'));
 // A fresh owner load while the explicit save is unresolved must not hydrate
 // the older server name over the locally owned edit.
 await h.account({user:{id:'owner',email:'during-save@example.test'},isSignedIn:true,isLoading:false,authority:f.authority(),authorityStatus:'active'});
 assert.equal(h.input('Platform Name').props.value,'Keep overlapping name');
 await h.resolve(saveGate);
 assert.equal(h.input('Platform Name').props.value,'Keep overlapping name');
 assert.ok(h.button('Gold accent').props.style[1]);
});
test('mounted older read cannot replace acknowledged same-session profile and Brand save',async t=>{
 const f=await mountedBrandLibrary(t),{h}=f,readGate=deferred();
 const stale={...brandBundle(f.state().profile),assets:[...f.state().assets]};
 await h.change(h.input('Platform Name'),'Saved newer name');await h.press(h.button('Gold accent'));
 const original=h.mocks.readPlatformBrandStudio;let held=false;
 h.mocks.readPlatformBrandStudio=()=>{if(!held){held=true;return readGate.promise;}return original();};
 await h.account({user:{id:'owner',email:'before-save@example.test'},isSignedIn:true,isLoading:false,authority:f.authority(),authorityStatus:'active'});
 await h.press(h.button('Save Brand Studio Draft'));assert.equal(f.state().saves,1);
 await h.resolve(readGate,stale);
 assert.equal(h.input('Platform Name').props.value,'Saved newer name');
 assert.ok(h.button('Gold accent').props.style[1]);
});
test('mounted replacement session discards pending profile edit but reads already saved Brand draft',async t=>{
 const gate=deferred(),f=await mountedBrandLibrary(t,{profileSaveGate:gate}),{h}=f;
 await h.change(h.input('Platform Name'),'Old session edits');await h.press(h.button('Gold accent'));
 await h.press(h.button('Save Brand Studio Draft'));
 const replacement={...f.authority(),sessionGeneration:'replacement'};f.setAuthority(replacement);
 await h.account({user:{id:'owner',email:'new-session@example.test'},isSignedIn:true,isLoading:false,authority:replacement,authorityStatus:'active'});
 assert.equal(h.input('Platform Name').props.value,'Owner');assert.ok(h.button('Gold accent').props.style[1],'Brand save already committed before profile save began');
 await h.resolve(gate);
 assert.equal(h.input('Platform Name').props.value,'Owner');assert.ok(h.button('Gold accent').props.style[1],'Brand save already committed before profile save began');
 assert.equal(f.state().saves,1,'late profile completion must not repeat the already committed Brand save');
});
for(const action of ['draft','publish'])test(`mounted stale ${action} Brand acknowledgement aborts chained profile write after same-owner session replacement`,async t=>{
 const gate=deferred(),f=await mountedBrandLibrary(t,action==='draft'?{brandSaveGate:gate}:{brandPublishGate:gate}),{h}=f;
 await h.change(h.input('Platform Name'),'Old session name');await h.press(h.button('Gold accent'));
 await h.press(h.button(action==='draft'?'Save Brand Studio Draft':'Publish Brand Studio Changes'));
 assert.equal(f.state().profileWrites,0);
 const replacement={...f.authority(),sessionGeneration:'replacement'};f.setAuthority(replacement);
 await h.account({user:{id:'owner',email:'replacement@example.test'},isSignedIn:true,isLoading:false,authority:replacement,authorityStatus:'active'});
 await h.resolve(gate);
 assert.equal(f.state().profileWrites,0,'old Brand continuation cannot initiate profile mutation in replacement session');
 assert.equal(h.input('Platform Name').props.value,'Owner');assert.equal(!!h.button('Gold accent').props.style[1],false);
 assert.equal(f.state().saves,action==='draft'?1:0);assert.equal(f.state().publishes,action==='publish'?1:0);
});
for(const stage of ['draft-library','publish-library','publish-readback'])test(`mounted session replacement during ${stage} aborts remaining profile write`,async t=>{
 const f=await mountedBrandLibrary(t),{h}=f,gate=deferred();
 await h.change(h.input('Platform Name'),'Old readback name');await h.press(h.button('Gold accent'));
 const original=h.mocks.readPlatformBrandStudio;
 if(stage==='publish-readback')h.mocks.resolveBrandPublishReadbackStatus=()=>gate.promise;
 else h.mocks.readPlatformBrandStudio=()=>gate.promise;
 await h.press(h.button(stage==='draft-library'?'Save Brand Studio Draft':'Publish Brand Studio Changes'));
 assert.equal(f.state().profileWrites,0);
 const replacement={...f.authority(),sessionGeneration:'replacement'};f.setAuthority(replacement);
 h.mocks.readPlatformBrandStudio=original;
 await h.account({user:{id:'owner',email:'readback-replacement@example.test'},isSignedIn:true,isLoading:false,authority:replacement,authorityStatus:'active'});
 await h.change(h.input('Platform Name'),'New session edit');
 const newRead=deferred();h.mocks.readPlatformBrandStudio=()=>newRead.promise;
 await h.press(h.button('Save Brand Studio Draft'));
 await h.resolve(gate,stage==='publish-readback'?{selectedCount:0,publicReturnedCount:0}:await original());
 assert.equal(f.state().profileWrites,0,'readback continuation must not reacquire new authority');
 assert.equal(h.input('Platform Name').props.value,'New session edit');
 assert.equal(h.button('Save Brand Studio Draft').props.disabled,true,'old finally cannot release replacement session save lock');
 assert.doesNotMatch(h.text(),/Platform name and tagline saved|Brand changes could not be published|Account changed/);
 await h.resolve(newRead,await original());assert.equal(f.state().profileWrites,1,'new session can finish its independent authorized save');
});
for(const action of ['draft','publish'])test(`mounted detached queued ${action} callback cannot dispatch after session replacement`,async t=>{
 const f=await mountedBrandLibrary(t),{h}=f;
 await h.change(h.input('Platform Name'),'Detached callback edit');
 const detached=h.button(action==='draft'?'Save Brand Studio Draft':'Publish Brand Studio Changes');
 const replacement={...f.authority(),sessionGeneration:'replacement'};f.setAuthority(replacement);
 await h.account({user:{id:'owner',email:'queued-replacement@example.test'},isSignedIn:true,isLoading:false,authority:replacement,authorityStatus:'active'});
 await React.act(async()=>detached.props.onPress());
 assert.equal(f.state().saves,0);assert.equal(f.state().publishes,0);assert.equal(f.state().profileWrites,0);
 assert.equal(h.input('Platform Name').props.value,'Owner');
 assert.equal(h.button('Save Brand Studio Draft').props.disabled,false);
});
for(const options of [{exactReadFails:true},{refreshFails:true},{exactRow:null},
 {exactRow:{id:'wrong',owner_user_id:'owner',deleted_at:'2026-10-21T00:00:00Z',asset_state:'archived'}},
 {exactRow:{id:'older-upload',owner_user_id:'other',deleted_at:'2026-10-21T00:00:00Z',asset_state:'archived'}},
 {exactRow:{id:'older-upload',owner_user_id:'owner',deleted_at:'invalid',asset_state:'archived'}}]) {
 test(`mounted uncertain removal never treats recent-list absence as proof: ${JSON.stringify(options)}`,async t=>{
  const f=await mountedBrandLibrary(t,{uncertainOutcome:'lost-response',...options}),{h}=f;
  await h.change(h.input('Platform Name'),'Keep unknown edits');await f.remove('older-upload');
  assert.equal(f.state().removes,1);assert.equal(f.state().exactReads,1);assert.equal(f.state().saves,0);assert.equal(f.state().publishes,0);
  assert.match(h.text(),/removal outcome is unknown/i);assert.match(h.text(),/Reopen Brand Studio/);
  assert.doesNotMatch(h.text(),/removal was confirmed|library are unchanged|private_exact_read_failure/);
  assert.equal(h.input('Platform Name').props.value,'Keep unknown edits');
 });
}
test('mounted uncertain removal with absent recent item but exact present row stays unconfirmed',async t=>{
 const f=await mountedBrandLibrary(t,{removeFails:true,omitFromRecent:true}),{h}=f;
 await f.remove('older-upload');assert.match(h.text(),/Removal could not be confirmed.*still present/);
 assert.doesNotMatch(h.text(),/removal was confirmed/);assert.equal(f.state().removes,1);assert.equal(f.state().exactReads,1);
 assert.match(h.text(),/Recent uploaded media/);assert.match(h.text(),/up to 50 recent uploads.*not your complete library/);
});
test('mounted uncertain tombstone read cannot cross a replacement account or session',async t=>{
 const readGate=deferred(),f=await mountedBrandLibrary(t,{uncertainOutcome:'lost-response',exactReadGate:readGate}),{h}=f;
 await f.remove('older-upload');assert.equal(f.state().exactReads,1);
 const replacement={userId:'new-owner',accountId:'new-owner',sessionGeneration:'replacement',state:'ACTIVE',restoreOnly:false};
 f.setAuthority(replacement);
 const pending=deferred();h.mocks.readUserProfile=()=>pending.promise;h.mocks.readPlatformBrandStudio=()=>pending.promise;
 await h.account({user:{id:'new-owner',email:'new@example.test'},isSignedIn:true,isLoading:false,authority:replacement,authorityStatus:'active'});
 await h.resolve(readGate);
 assert.deepEqual(f.state().exactStatuses,['unknown'],'real exact helper rejects authority changed during read');
 assert.equal(f.removeButton('older-upload'),undefined);assert.equal(f.removeButton('hero-asset'),undefined);
 assert.doesNotMatch(h.text(),/removal was confirmed|removal outcome is unknown/);assert.equal(f.state().removes,1);
});
test('mounted real exact helper refuses stale-owner or inactive authority before querying',async t=>{
 const f=await mountedBrandLibrary(t);
 for(const authority of [null,{userId:'other',state:'ACTIVE',restoreOnly:false},{userId:'owner',state:'LOCKED',restoreOnly:false},{userId:'owner',state:'ACTIVE',restoreOnly:true}]) {
  f.setAuthority(authority);assert.equal(await f.readExact(),'unknown');
 }
 assert.equal(f.state().exactReads,0);assert.equal(f.state().removes,0);
});
for(const outcome of ['success','failure'])test(`mounted Brand library removal ${outcome} preserves unrelated unsaved brand accent`,async t=>{
 const f=await mountedBrandLibrary(t,{removeFails:outcome==='failure'}),{h}=f;
 await h.press(h.button('Gold accent'));await f.remove('older-upload');
 assert.equal(f.state().profile.accentColor,'#DC143C','library removal never saves local draft');
 assert.equal(f.state().saves,0);assert.equal(f.state().publishes,0);
 await h.press(h.button('Save Brand Studio Draft'));
 assert.equal(f.state().profile.accentColor,'#F2C25B','unsaved accent survives library success or failure');
});
for(const outcome of ['saved','rejected'])test(`mounted Brand design clear ${outcome} explicitly saves current draft and preserves unrelated edit on error`,async t=>{
 const f=await mountedBrandLibrary(t,{saveFails:outcome==='rejected'}),{h}=f;
 await h.press(h.button('Gold accent'));await h.press(h.button('Open Hero Media'));
 assert.match(h.text(),/Saves your current draft without this image. Publish separately/);
 await h.press(h.button('Remove Hero Image from design'));
 assert.equal(f.state().publishes,0);assert.equal(f.state().removes,0);
 if(outcome==='saved')assert.equal(f.state().profile.accentColor,'#F2C25B');
 else {
  let retried;h.mocks.savePlatformBrandProfileDraft=async(_owner,draft)=>{retried=draft;return draft;};
  await h.press(h.button('Save Brand Studio Draft'));assert.equal(retried.accentColor,'#F2C25B');assert.equal(retried.heroImageAssetId,'hero-asset');
 }
});
test('mounted Brand stale upload removal cannot refresh or expose media in replacement account',async t=>{
 const gate=deferred(),f=await mountedBrandLibrary(t,{removeGate:gate}),{h}=f;
 await f.remove('older-upload');assert.equal(f.state().removes,1);
 const held=deferred();h.mocks.readUserProfile=()=>held.promise;h.mocks.readPlatformBrandStudio=()=>held.promise;
 const reads=f.state().reads;
 await h.account({user:{id:'new-owner',email:'new@example.test'},isSignedIn:true,isLoading:false,authority:{userId:'new-owner',accountId:'new-owner',sessionGeneration:'second',state:'ACTIVE',restoreOnly:false},authorityStatus:'active'});
 await h.resolve(gate);
 assert.equal(f.state().reads,reads);assert.equal(f.removeButton('older-upload'),undefined);assert.equal(f.removeButton('hero-asset'),undefined);
 assert.doesNotMatch(h.text(),/Uploaded media removed from your library/);
});
test('mounted Brand old removal completion cannot release replacement session draft save lock',async t=>{
 const removal=deferred(),saving=deferred(),f=await mountedBrandLibrary(t,{removeGate:removal}),{h}=f;
 await f.remove('older-upload');
 const oldConfirmation=h.alerts.at(-1)[2].find(b=>b.text==='Remove uploaded media');
 await React.act(async()=>oldConfirmation.onPress());assert.equal(f.state().removes,1,'duplicate confirmation is single flight');
 await h.account({user:{id:'owner',email:'owner@example.test'},isSignedIn:true,isLoading:false,authority:{userId:'owner',accountId:'owner',sessionGeneration:'replacement',state:'ACTIVE',restoreOnly:false},authorityStatus:'active'});
 h.mocks.savePlatformBrandProfileDraft=async(_owner,draft)=>{await saving.promise;return draft;};
 await h.press(h.button('Save Brand Studio Draft'));assert.equal(h.button('Save Brand Studio Draft').props.disabled,true);
 await h.resolve(removal);assert.equal(h.button('Save Brand Studio Draft').props.disabled,true,'old operation cannot unlock new session save');
 assert.doesNotMatch(h.text(),/Uploaded media removed from your library/);
 await h.resolve(saving);assert.equal(h.button('Save Brand Studio Draft').props.disabled,false);
});
test('mounted same-tab Schedule and Moderation Live safety focus the real editor/defaults wrappers',async t=>{
 const h=await mount(t,{route:{tab:'live'}});
 await h.press(h.find(n=>n.type==='TouchableOpacity'&&textOf(n).startsWith('Schedule Event')));
 assert.ok(h.scrolls.length>0);assert.match(h.measures.at(-1),/Create Event/);assert.doesNotMatch(h.measures.at(-1),/Go Live/);
 await h.press(h.button('Moderation'));await h.press(h.find(n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel?.startsWith('Live safety.')));
 assert.match(h.measures.at(-1),/New room access defaults/);assert.doesNotMatch(h.measures.at(-1),/Create Event/);
});
for(const gate of ['signed-out','inactive-beta','no-premium','settings-disabled']){
 test(`mounted ${gate} gate does not expose Studio mutation actions`,async t=>{
  const overrides={};let session;
  if(gate==='signed-out')session={user:null,isSignedIn:false,isLoading:false};
  if(gate==='inactive-beta')overrides.useBetaProgram=()=>({isLoading:false,isActive:false,accessState:{status:'blocked'}});
  if(gate==='no-premium'){const snapshot={targets:{premium_subscription:{hasEntitlement:false}}};Object.assign(overrides,{readCurrentUserEntitlement:async()=>({isActive:false}),getCachedMonetizationSnapshot:()=>snapshot,readMonetizationSnapshot:async()=>snapshot});}
  if(gate==='settings-disabled')overrides.resolveFeatureConfig=()=>({creatorSettingsEnabled:false});
  const h=await mount(t,{route:{tab:'live'},session,overrides});assert.equal(h.button('Create Event'),undefined);assert.equal(h.button('Save room defaults'),undefined);assert.equal(h.button('Publish Brand Studio Changes'),undefined);
  assert.match(h.text(),gate==='signed-out'?/Sign in/:gate==='inactive-beta'?/Beta required/:gate==='no-premium'?/Premium required/:/Platform Studio is hidden/);
 });
}

test('mounted account change clears old creator state while the next account reads are held',async t=>{
 const h=await mount(t,{route:{tab:'home'},videos:[video('private-account-A','draft')]});assert.match(h.text(),/Owner/);
 const held=deferred();h.mocks.readUserProfile=()=>held.promise;h.mocks.readCreatorVideos=()=>held.promise;
 const snapshot={targets:{premium_subscription:{hasEntitlement:false}}};h.mocks.getCachedMonetizationSnapshot=()=>snapshot;h.mocks.readMonetizationSnapshot=()=>held.promise;h.mocks.readCurrentUserEntitlement=()=>held.promise;
 await h.account({user:{id:'new-owner',email:'new@example.test'},isSignedIn:true,isLoading:false,authority:{userId:'new-owner',accountId:'new-owner',sessionGeneration:'second',state:'ACTIVE',restoreOnly:false},authorityStatus:'active'});
 assert.doesNotMatch(h.text(),/\nOwner\n/,'previous identity must disappear before new reads settle');assert.equal(h.button('Create Event'),undefined);
});
test('unmounted Clip late read cannot return a disposed screen to the mounted host tree',async t=>{
 const gate=deferred();const h=await mount(null,{overrides:{readClipStudioEdit:()=>gate.promise}});await openClip(h,'A');await h.unmount();await h.resolve(gate,edit('A'));assert.equal(h.all().length,0);
});

test('mounted same-account session generation replacement resets pending creator edits',async t=>{
 const h=await mount(t);await openClip(h,'A');await h.change(h.input('Clip title'),'Unsaved previous session');
 await h.account({user:{id:'owner',email:'owner@example.test'},isSignedIn:true,isLoading:false,authority:{userId:'owner',accountId:'owner',sessionGeneration:'replacement',state:'ACTIVE',restoreOnly:false},authorityStatus:'active'});
 assert.notEqual(h.input('Clip title')?.props.value,'Unsaved previous session');
});

test('mounted server search ignores late prior-query results and clear restores the library',async t=>{
 const one=deferred(),two=deferred();
 const h=await mount(t,{overrides:{readCreatorVideos:async(_id,options)=>options.searchQuery==='one'?one.promise:options.searchQuery==='two'?two.promise:[video('A'),video('B')]}});
 await h.change(h.input('Search your content'),'one');await h.timers();
 await h.change(h.input('Search your content'),'two');await h.timers();
 await h.resolve(two,[video('two')]);assert.ok(h.button('Open actions for Title two'));
 await h.resolve(one,[video('one')]);assert.ok(h.button('Open actions for Title two'));assert.equal(h.button('Open actions for Title one'),undefined);
 await h.change(h.input('Search your content'),'');assert.ok(h.button('Open actions for Title A'));
});

test('mounted Clip Save Draft commits exact selected video and metadata then verifies rendered readback',async t=>{
 let stored=video('A'),savedEdit=edit('A'),updates=0,metadataWrites=0;const gate=deferred();
 const h=await mount(t,{videos:[stored],overrides:{
  readClipStudioEdit:async()=>savedEdit,
  updateCreatorVideoMetadata:async(id,patch)=>{assert.equal(id,'A');assert.equal(patch.title,'Edited clip');updates++;await gate.promise;stored={...stored,...patch};return stored;},
  saveClipStudioEdit:async(id,patch)=>{assert.equal(id,'A');metadataWrites++;savedEdit={...patch,videoId:id};return savedEdit;},
  readCreatorVideoForOwner:async()=>stored,readCreatorVideos:async()=>[stored],
 }});
 await openClip(h,'A');await h.change(h.input('Clip title'),'Edited clip');
 const save=h.button('Save Draft');await h.press(save);await React.act(async()=>{void save.props.onPress();});
 assert.equal(updates,1);assert.equal(h.input('Clip title').props.editable,false);
 await h.resolve(gate);assert.equal(metadataWrites,1);assert.match(h.text(),/Draft saved and confirmed in Content Library/);
 assert.equal(h.input('Clip title').props.value,'Edited clip');assert.ok(h.button('View Draft'));
});
