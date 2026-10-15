import assert from 'node:assert/strict';
import test from 'node:test';
import {mount,video,deferred,textOf} from './platform-studio-mounted-harness.mjs';
const row=(h,title)=>h.find(n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel?.startsWith(`${title}.`));
test('mounted Drafts refreshes active query after Make Public, without stale draft card',async t=>{
 let row=video('A','draft');const h=await mount(t,{overrides:{
  readCreatorVideos:async(_u,o)=>o.visibility&&o.visibility!==row.visibility?[]:[row],
  updateCreatorVideoMetadata:async(_id,patch)=>{row={...row,...patch};return row;},
 }});
 await h.press(h.button('Drafts'));await h.timers();await h.press(h.button('Open actions for Title A'));await h.press(h.button('Make Public'));await h.timers();
 assert.equal(row.visibility,'public');assert.equal(h.button('Open actions for Title A'),undefined);assert.match(h.text(),/Public on your Platform/);
});
test('failed Clip metadata keeps editor locked until successful retry',async t=>{
 const gate=deferred();const h=await mount(t,{overrides:{readClipStudioEdit:()=>gate.promise}});await h.press(h.button('Open actions for Title A'));await h.press(h.button('Edit details'));await h.reject(gate,Error('offline'));
 assert.equal(h.input('Clip title').props.editable,false);assert.equal(h.input('Title text').props.editable,false);h.mocks.readClipStudioEdit=async()=>null;await h.press(h.button('Retry'));assert.equal(h.input('Clip title').props.editable,true);
});
for (const blocked of ['VIP','hidden'])test(`paid target ${blocked} cannot expose contradictory paid save`,async t=>{
 const target={...video('target'),...(blocked==='VIP'?{vipAccessRequired:true}:{moderationStatus:'hidden'})};
 const h=await mount(t,{route:{tab:'monetization',manage:'paid_videos',videoId:'target'},videos:[target],overrides:{readCreatorVideoForOwner:async()=>target}});
 assert.equal(Boolean(h.find(n=>n.props.testID==='money-paid-video-save-button')),false);
 assert.match(h.text(),blocked==='VIP'?/Remove VIP access first/:/restricted by moderation/);
});

test('Home zero drafts and clear state describe loaded scope when older videos remain',async t=>{
 const h=await mount(t,{route:{tab:'home'},videos:Array.from({length:51},(_,index)=>video(String(index)))});
 assert.match(h.text(),/Drafts in loaded page/);
 assert.match(h.text(),/Open Drafts to check the full library/);
 assert.doesNotMatch(h.text(),/No drafts right now|All clear\. Nothing needs attention/);
});

test('Home Published library scopes an empty loaded page instead of claiming the full library is empty',async t=>{
 const h=await mount(t,{route:{tab:'home'},videos:Array.from({length:51},(_,i)=>video(String(i),'draft'))});
 const published=row(h,'Published library');assert.ok(published);assert.doesNotMatch(textOf(published),/No public videos yet/);assert.match(textOf(published),/loaded/i);
});

test('Home requests and both block actions distinguish unavailable counts from confirmed zero',async t=>{
 const h=await mount(t,{route:{tab:'home'},overrides:{readChannelAudienceSummary:async()=>null}});
 await h.press(row(h,'Audience'));
 assert.match(textOf(row(h,'Requests')),/unavailable|could not|not verified/i);assert.doesNotMatch(textOf(row(h,'Requests')),/No requests waiting/);
 assert.match(textOf(row(h,'Blocked accounts')),/unavailable|could not|not verified/i);assert.doesNotMatch(textOf(row(h,'Blocked accounts')),/No blocked accounts/);
 await h.press(row(h,'Audience'));await h.press(row(h,'Moderation and Safety'));
 assert.match(textOf(row(h,'Blocked accounts')),/unavailable|could not|not verified/i);assert.doesNotMatch(textOf(row(h,'Blocked accounts')),/No blocked accounts/);
});

test('Home latest content exposes failed-read retry rather than an empty library',async t=>{
 let failed=true;const h=await mount(t,{route:{tab:'home'},overrides:{readCreatorVideos:async()=>{if(failed)throw Error('offline');return [video('Recovered')];}}});
 assert.match(h.text(),/Latest content unavailable/);assert.doesNotMatch(textOf(row(h,'Drafts')),/Clear/);
 failed=false;await h.press(h.button('Retry'));assert.doesNotMatch(h.text(),/Latest content unavailable/);assert.match(h.text(),/Title Recovered/);
});

test('Live failed schedule and reminder reads remain unavailable until a confirmed empty retry',async t=>{
 let failed=true;const h=await mount(t,{route:{tab:'live'},overrides:{readCreatorEventReminderSummaries:async()=>{if(failed)throw Error('offline');return [];}}});
 assert.match(h.text(),/Upcoming\nUnavailable/);assert.match(h.text(),/Reminder Enrollments\nUnavailable/);assert.match(h.text(),/Schedule unavailable/);
 assert.doesNotMatch(h.text(),/No viewer has enrolled|No upcoming event scheduled|No creator event currently shows reminder interest/);
 failed=false;await h.press(h.button('Refresh Events'));assert.match(h.text(),/Upcoming\n0/);assert.match(h.text(),/No upcoming event scheduled/);assert.match(h.text(),/No viewer has enrolled/);
});
