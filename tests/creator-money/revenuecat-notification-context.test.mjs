import assert from 'node:assert/strict';
import test from 'node:test';
import {createRevenueCatNotificationHarness,ids} from './revenuecat-notification-harness.mjs';

for (const platform of ['android','ios']) for (const productType of [
  'paid_content_access','watch_party_live_ticket','channel_subscription','vip_pass','event_pass','creator_tip',
  'live_watch_party_access_pass','live_watch_party_seat_pass',
]) test(`${platform} ${productType}: exact creator/subject reaches stored row and push without changing destination`,async()=>{
  const h=createRevenueCatNotificationHarness({platform,productType,writer:productType.startsWith('live_watch_party_')?'live':undefined});
  await h.run();
  assert.equal(h.tables.notifications.length,2);
  for(const n of h.tables.notifications){
    assert.match(n.title+' '+n.body,/Rachi/);
    assert.doesNotMatch(n.title,/active|unlocked/);
    if(!['channel_subscription','vip_pass','creator_tip'].includes(productType))assert.match(n.body,/Chicago Stories/);
    const send=h.sends().find(s=>s.body.data.notificationId===n.id);
    assert.equal(send.body.title,n.title);assert.equal(send.body.body,n.body);
    assert.equal(n.target_context.display_context.creator_id,ids.creator);
    assert.equal(n.target_context.display_context.target_id,n.target_entity_id);
  }
  if(productType==='channel_subscription'){assert.match(h.tables.notifications[0].title,/Platform Subscription/);assert.match(h.tables.notifications[0].body,/not Chi'llywood Premium/);}
  if(productType==='live_watch_party_seat_pass')assert.match(h.tables.notifications[0].body,/Host approval is still required/);
  assert.equal(h.tables.notifications[1].target_route,'/channel-studio');
  await h.run();assert.equal(h.sends().length,2,'same event remains deduped');
});

test('names from provider metadata cannot replace exact server context; second creator label stays distinct',async()=>{
  for(const name of ['Rachi','Another Creator']){
    const h=createRevenueCatNotificationHarness({productType:'vip_pass',displayContext:{creator_display_name:name}});
    h.tables.money_purchase_intents[0].metadata.creator_display_name='Spoofed Name';
    await h.run();assert.match(h.tables.notifications[0].title,new RegExp(name));
    assert.doesNotMatch(JSON.stringify(h.sends()),/Spoofed Name/);
  }
});
test('missing/private context and mismatched target do not invent names or assert current access',async()=>{
  for(const displayContext of [null,{target_id:'another-target',creator_display_name:'Wrong Creator'},{target_route:'/channel/[userId]',creator_display_name:'Wrong Creator'}]){
    const h=createRevenueCatNotificationHarness({productType:'vip_pass',displayContext});await h.run();
    const row=h.tables.notifications[0];assert.match(row.body,/Creator details unavailable/);
    assert.doesNotMatch(row.title+' '+row.body,/Wrong Creator|active/);
    assert.equal(row.target_context.display_context,null);
    assert.equal(row.target_entity_id,ids.creator);
  }
});
test('long display identity preserves the disambiguating handle in receipt and push',async()=>{
  const identity='N'.repeat(80)+' (@unique_handle)';
  const h=createRevenueCatNotificationHarness({productType:'vip_pass',displayContext:{creator_display_name:identity}});
  await h.run();assert.match(h.tables.notifications[0].title,/@unique_handle/);assert.match(h.sends()[0].body.title,/@unique_handle/);
});
test('failed server display lookup reserves or sends nothing and preserves completed purchase receipt',async()=>{
  const h=createRevenueCatNotificationHarness({displayFailure:true});
  await assert.rejects(h.run(),/display_unavailable/);
  assert.equal(h.rpcs().length,1);assert.equal(h.tables.notification_event_dedupes.length,0);assert.equal(h.sends().length,0);
});
test('bounded display text removes control and bidi impersonation while preserving normal names',async()=>{
  const h=createRevenueCatNotificationHarness({productType:'paid_content_access',displayContext:{
    creator_display_name:'Rachi\n\u202eVerified',subject_title:'Chicago\r\nStories',
  }});await h.run();
  assert.match(h.tables.notifications[0].body,/Chicago Stories/);
  assert.doesNotMatch(h.tables.notifications[0].body,/[\u0000-\u001f\u202a-\u202e]/);
});
