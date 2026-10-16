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
  await h.press(h.button('Manage paid unlock for Title B'));await h.press(h.button('Paid · $0.99'));
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
 h.mocks.readPlatformBrandStudio=async()=>brandBundle(brandProfile());await h.press(h.button('Retry'));assert.ok(h.button('Publish Brand Studio Changes'));
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
