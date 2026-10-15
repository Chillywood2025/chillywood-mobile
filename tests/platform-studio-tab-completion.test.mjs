import assert from 'node:assert/strict';
import test from 'node:test';
import {mount,video,productionFunctions,deferred} from './platform-studio-mounted-harness.mjs';

test('Live room defaults use the real permission sanitizer and preserve a rejected save for retry',async t=>{
 const {sanitizeCreatorRoomAccessRule}=productionFunctions('_lib/monetization.ts',['DEFAULT_CREATOR_PERMISSION_SET','normalizeMonetizationAccessRule','normalizeCreatorPermissionSet','sanitizeCreatorRoomAccessRule'],{Date});
 let writes=0;const gate=deferred();const h=await mount(t,{route:{tab:'live'},overrides:{
  sanitizeCreatorRoomAccessRule,readCreatorPermissions:async()=>({canUsePartyPassRooms:false,canUsePremiumRooms:true}),
  saveUserProfileRemote:async(p,id)=>{writes++;assert.equal(id,'owner');assert.equal(p.defaultWatchPartyContentAccessRule,'premium');assert.equal(p.defaultCommunicationContentAccessRule,'open');if(writes===1){await gate.promise;throw Error('offline');}return p;}
 }});
 assert.equal(h.button('Watch parties: party pass').props.disabled,true);await h.press(h.button('Watch parties: premium'));
 await h.press(h.button('Save room defaults'));assert.equal(h.button('Watch parties: open').props.disabled,true);await h.resolve(gate);assert.match(h.text(),/Unable to save Platform Studio changes/);
 assert.equal(h.button('Watch parties: premium').props.accessibilityState.selected,true);await h.press(h.button('Save room defaults'));assert.equal(writes,2);assert.match(h.text(),/Room defaults saved/);
});
test('Audience visible filters and unavailable-read retry distinguish requests, blocks, and followers',async t=>{
 const members=['pending_request','blocked','follower'].map((kind,i)=>({id:String(i),userId:`u${i}`,kind,displayName:`Person ${i}`,requestId:i+1,username:''}));let fail=true;
 const h=await mount(t,{route:{tab:'audience'},overrides:{readChannelAudienceMembers:async()=>{if(fail)throw Error('offline');return members;}}});
 assert.match(h.text(),/Audience unavailable/);assert.doesNotMatch(h.text(),/No audience actions waiting/);fail=false;await h.press(h.button('Retry'));
 await h.press(h.button('Requests'));assert.ok(h.button('Manage Person 0'));assert.equal(h.button('Manage Person 1'),undefined);
 await h.press(h.button('Blocked'));assert.ok(h.button('Manage Person 1'));assert.equal(h.button('Manage Person 0'),undefined);
 await h.press(h.button('All people'));assert.ok(h.button('Manage Person 2'));
});
test('Insights Retry sources clears source-unavailable states after confirmed recovery',async t=>{
 let fail=true;const h=await mount(t,{route:{tab:'insights'},overrides:{readCreatorVideos:async()=>{if(fail)throw Error('offline');return [video('A')];},readCreatorEventReminderSummaries:async()=>{if(fail)throw Error('offline');return [];},readChannelAudienceMembers:async()=>{if(fail)throw Error('offline');return [];}}});
 assert.match(h.text(),/Some metrics are unavailable/);assert.match(h.text(),/Unavailable/);fail=false;await h.press(h.button('Retry sources'));assert.doesNotMatch(h.text(),/Some metrics are unavailable/);assert.match(h.text(),/Published Videos\n1/);
});
test('Tips Pause visible action disables the acknowledged setting and leaves sandbox configuration intact',async t=>{
 let settings={tipsEnabled:true,currency:'usd',defaultAmountCents:300,minAmountCents:100,maxAmountCents:50000,suggestedAmountsCents:[100,300],status:'sandbox'},writes=0;
 const h=await mount(t,{route:{tab:'monetization',manage:'tips'},overrides:{readMyCreatorTipSettings:async()=>settings,saveMyCreatorTipSettings:async input=>{writes++;assert.equal(input.tipsEnabled,false);settings={...settings,...input};return settings;}}});
 await h.press(h.button('Pause Tips'));assert.equal(writes,1);assert.ok(h.button('Enable Tips'));assert.match(h.text(),/Tips setup is paused/);assert.equal(h.calls.some(([name])=>name==='saveCreatorSandboxMonetizationConfig'),false);
});
