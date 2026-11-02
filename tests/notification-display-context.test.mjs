import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const api={};
new Function('exports',ts.transpileModule(fs.readFileSync('_lib/notificationDisplayContext.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(api);
const row=(type='vip_access_active',extra={})=>({id:'notice-a',notification_type:type,target_route:'/vip-pass/[creatorId]',target_entity_id:'creator-a',title:'VIP Pass active.',body:'Your creator VIP access is active.',created_at:'2026-07-05T12:55:00Z',read_at:null,...extra});
const item=(r,extra={})=>({notificationId:r.id,notificationType:r.notification_type,targetRoute:r.target_route,targetId:r.target_entity_id,creatorId:'creator-a',creatorName:'Rachi (@rachi)',targetTitle:null,resolution:'resolved',liveState:'live',...extra});
const apply=(rows,items)=>api.applyNotificationDisplayContext(rows,{schemaVersion:1,items});
test('attendance never displays cached private identity without current bound context',()=>{
 const r=row('live_room_member_joined',{target_route:'/watch-party/live-stage/[partyId]',target_entity_id:'EXACT-ROOM',title:'PRIVATE PERSON joined',body:'PRIVATE ROOM'});
 const redacted=api.redactUnverifiedLiveAttendance([r]);
 assert.doesNotMatch(JSON.stringify(redacted),/PRIVATE PERSON|PRIVATE ROOM/);
 const actual=apply(redacted,[item(r,{creatorName:'Exact Member',targetTitle:'Exact Room'})])[0];
 assert.match(actual.body,/Exact Member joined Exact Room/);
 const unavailable=apply([actual],[item(r,{resolution:'unavailable',creatorName:null,targetTitle:null})])[0];
 assert.doesNotMatch(unavailable.title+unavailable.body,/Exact Member|Exact Room/);
 assert.equal(actual.target_entity_id,'EXACT-ROOM');
 assert.equal(actual.target_route,'/watch-party/live-stage/[partyId]');
});
test('negative control: live-start rows previously retain private snapshot text on missing display read',()=>{
 const r=row('followed_creator_live',{title:'PRIVATE HOST is live',body:'PRIVATE ROOM',target_context:{display_context:{creator_display_name:'PRIVATE HOST'}}});
 const oldAttendanceOnly=rows=>rows.map(n=>n.notification_type==='live_room_member_joined'?{...n,title:'Live attendance update',body:'Open details'}:n);
 assert.match(JSON.stringify(oldAttendanceOnly([r])),/PRIVATE HOST/);
 const safe=api.redactUnverifiedLiveAttendance([r]);assert.doesNotMatch(JSON.stringify(safe),/PRIVATE HOST|PRIVATE ROOM/);
 assert.equal(safe[0].target_context.live_discovery_state,'unavailable');
 for(const payload of [{schemaVersion:2,items:[]},{schemaVersion:1,items:[item(r),item(r)]}]) {
  assert.equal(api.applyNotificationDisplayContext(safe,payload)[0].target_context.live_discovery_state,'unavailable');
 }
 const legacy=api.applyNotificationDisplayContext(safe,{schemaVersion:1,items:[item(r,{liveState:undefined,creatorName:'PRIVATE HOST',targetTitle:'PRIVATE ROOM'})]});
 assert.doesNotMatch(JSON.stringify(legacy),/PRIVATE HOST|PRIVATE ROOM/,'older metadata-only backend cannot certify a current live disclosure');
});
test('historic VIP identifies its exact creator without claiming current active access',()=>{
 const r=row(),actual=apply([r],[item(r)])[0];
 assert.match(actual.title,/VIP Pass confirmed.*Rachi/);assert.match(actual.body,/Rachi.*was recorded/);
 assert.doesNotMatch(actual.body,/access is active/);assert.equal(actual.created_at,r.created_at);assert.equal(actual.read_at,null);
 assert.equal(actual.target_entity_id,r.target_entity_id);assert.equal(r.title,'VIP Pass active.');
});
test('all related kinds receive exact creator and target while Premium stays distinct',()=>{
 for(const type of ['paid_video_unlocked','watch_party_ticket_ready','live_watch_party_access_ready','live_watch_party_seat_eligible','live_watch_party_seat_approved','live_watch_party_seat_rejected','channel_subscription_active','event_pass_active','tip_sent_receipt','paid_video_sold','watch_party_ticket_sold','live_watch_party_access_sold','live_watch_party_seat_sold','live_watch_party_seat_requested','channel_subscription_started','vip_pass_sold','event_pass_sold','tip_received','public_upload','replay_later','followed_creator_live','circle_friend_live','party_room_live','event_starts_soon','watch_party_starts_soon','creator_event_updated','creator_event_canceled']) {
  const r=row(type),actual=apply([r],[item(r,{targetTitle:'Chicago Night'})])[0];
  assert.match(actual.title,/Chicago Night.*Rachi/);assert.ok(api.needsNotificationDisplayContext(r));
 }
 const subscription=row('channel_subscription_active');assert.match(apply([subscription],[item(subscription)])[0].body,/separate from Chi'llywood Premium/);
 const premium=row('premium_active',{title:'Chi\'llywood Premium active'});assert.deepEqual(apply([premium],[item(premium)]),[premium]);
});
test('different creator/event rows never borrow another row context',()=>{
 const a=row('event_pass_active',{id:'one',target_entity_id:'event-a',target_route:'/event/[eventId]'}),b=row('event_pass_active',{id:'two',target_entity_id:'event-b',target_route:'/event/[eventId]'});
 const actual=apply([a,b],[item(b,{creatorName:'Bea',targetTitle:'Second Event'}),item(a,{targetTitle:'First Event'})]);
 assert.match(actual[0].title,/First Event.*Rachi/);assert.match(actual[1].title,/Second Event.*Bea/);
});
test('auction context identifies the exact item without reviving an expired award or deadline',()=>{
 for(const type of ['auction_outbid','auction_won','auction_creator_award','auction_checkout_deadline','auction_payment_deadline']) {
  const r=row(type,{body:'Pay now before the deadline',target_route:'/event/[eventId]',target_entity_id:'event-a'});
  const actual=apply([r],[item(r,{targetTitle:'Chicago Night'})])[0];
  assert.match(actual.title,/Chicago Night.*Rachi/);assert.match(actual.body,/current status, payment and deadlines/);
  assert.doesNotMatch(actual.title+actual.body,/Pay now|payment pending/);assert.equal(actual.target_entity_id,'event-a');
 }
});
test('historical paid seat preserves the host approval boundary',()=>{
 const r=row('live_watch_party_seat_eligible');
 assert.match(apply([r],[item(r,{targetTitle:'Live Stage'})])[0].body,/Payment alone does not approve speaking, camera or microphone; host approval is required/);
});
test('missing, duplicate, wrong-route/type/target and caller context never substitute names',()=>{
 const r=row('vip_access_active',{target_context:{creatorName:'Forged'}});
 for(const patch of [{notificationId:'other'},{notificationType:'event_pass_active'},{targetRoute:'/event/[eventId]'},{targetId:'other'}])assert.deepEqual(apply([r],[item(r,patch)]),[r]);
 assert.deepEqual(apply([r],[item(r),item(r)]),[r]);assert.deepEqual(apply([r],[]),[r]);
 assert.deepEqual(api.applyNotificationDisplayContext([r],{schemaVersion:2,items:[item(r)]}),[r]);
 const unavailable=apply([r],[item(r,{resolution:'unavailable',creatorName:'Hidden private name',targetTitle:'Secret'})])[0];
 assert.doesNotMatch(unavailable.title+unavailable.body,/Hidden|Secret|Forged|active/);assert.match(unavailable.body,/no longer available/);
});
test('labels remove control/bidi characters and bound display text without exposing identifiers',()=>{
 const r=row(),actual=apply([r],[item(r,{creatorName:'\u202eRachi\n\u0000'+ 'x'.repeat(400)})])[0];
 assert.doesNotMatch(actual.title,/[\u202e\n\u0000]/);assert.ok(actual.title.length<200);assert.doesNotMatch(actual.title,/creator-a/);
});
test('social context identifies the authorized actor without message previews and redacts unavailable snapshots',()=>{
 for(const type of ['social_follow','social_follow_request','social_follow_accepted','circle_request','circle_accepted','circle_added','content_shared','circle_post','profile_post_liked','profile_comment','profile_reply','video_comment','video_reply','chat_message']) {
  const r=row(type,{title:'Former private name',body:'Former private name sent a message'});
  const resolved=apply([r],[item(r)])[0];assert.match(resolved.title,/Rachi/);assert.doesNotMatch(resolved.body,/Former/);
  const hidden=apply([r],[item(r,{resolution:'unavailable'})])[0];assert.doesNotMatch(hidden.title+hidden.body,/Former|Rachi/);
 }
});

test('only current bound context supplies an opaque discovery key; malformed/private labels cannot become a key',()=>{
 const r=row('followed_creator_live'),key='30000000-0000-4000-8000-000000000001';
 assert.equal(apply([r],[item(r,{discoveryHintKey:key})])[0].target_context.discovery_hint_key,key);
 assert.equal(apply([r],[item(r,{discoveryHintKey:'private-room-name'})])[0].target_context.discovery_hint_key,undefined);
 assert.equal(apply([r],[item(r,{resolution:'unavailable',discoveryHintKey:key})])[0].target_context.discovery_hint_key,undefined);
});
