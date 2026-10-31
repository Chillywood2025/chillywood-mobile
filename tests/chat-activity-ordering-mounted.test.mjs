import assert from 'node:assert/strict';
import test from 'node:test';
import {loadStubbed} from './customer-experience-adversarial-helpers.mjs';
import {mountFullChatThread} from './assurance/helpers/chat-thread-full-mounted-harness.mjs';
const api=loadStubbed('_lib/chatActivity.ts');
const event=(id,time,actor='remote-user')=>({id,actorUserId:actor,createdAt:time,displayCreatedAt:time,callType:'voice',eventType:'ended'});
test('actual call-event SDK requests latest bounded fifty in deterministic descending order',async()=>{
 const orders=[],filters=[];let limit;
 const query={select(){return this;},eq(){return this;},order(...args){orders.push(args);return this;},
  limit(value){limit=value;return this;},lte(...args){filters.push(args);return this;},
  async returns(){return {error:null,data:[{id:'a',thread_id:'thread',actor_user_id:'remote',call_type:'voice',event_type:'started',created_at:'2026-10-31T20:00:00.123400Z'},
    {id:'b',thread_id:'thread',actor_user_id:'remote',call_type:'voice',event_type:'ended',created_at:'2026-10-31T20:00:00.123456Z'}]};}};
 const calls=loadStubbed('_lib/chillyChatCalls.ts',{'./supabase':{supabase:{from:()=>query}}});
 const result=await calls.listChillyChatCallEvents('thread','2026-10-31T20:15:00Z');
 assert.deepEqual(orders,[['created_at',{ascending:false}],['id',{ascending:false}]]);
 assert.deepEqual(filters,[['created_at','2026-10-31T20:15:00Z']]);
 assert.equal(limit,50);
 assert.deepEqual(result.map(e=>e.id),['b','a']);
});
test('unread call highlighting respects recipient watermark, actor and microseconds',()=>{
 const e=event('one','2026-10-31T20:15:00.123456Z');
 assert.equal(api.isUnreadChatCallEvent(e,'local-user','2026-10-31T20:15:00.123400Z'),true);
 assert.equal(api.isUnreadChatCallEvent(e,'local-user',e.createdAt),false);
 assert.equal(api.isUnreadChatCallEvent(e,'remote-user',null),false);
 assert.equal(api.isUnreadChatCallEvent({...e,displayCreatedAt:null},'local-user',null),false);
 assert.equal(api.isUnreadChatCallEvent(e,null,null),false);
 assert.equal(api.latestObservedChatTimestamp([null,'bad']),null);
});
test('mounted recent-call binding shows newest first; acknowledgements use observed boundary and retry failures',async t=>{
 const calls=[event('old','2026-08-01T00:00:00Z'),event('early','2026-10-31T20:15:00.123400Z'),event('z','2026-10-31T20:15:00.123456Z'),event('a','2026-10-31T20:15:00.123456Z')];
 const reads=[];
 const h=await mountFullChatThread({readCallEvents:async()=>calls,markRead:async(...args)=>reads.push(args)});
 t.after(()=>h.unmount());
 assert.deepEqual(Array.from(h.runtime.snapshot.recentCalls,e=>e.id),['z','a','early']);
 assert.equal(reads.at(-1)[1],null,'call timestamp cannot acknowledge unseen messages');
 assert.equal(reads.at(-1)[2],'2026-10-31T20:15:00.123456Z');
 const count=reads.length;
 await h.run(()=>h.runtime.snapshot.markThreadReadWithThrottle(null,'2026-10-31T20:15:00.123400Z'));
 assert.equal(reads.length,count,'older reload does not manufacture read progression');
 let attempts=0;
 h.runtime.markRead=async()=>{if(++attempts===1)throw Error('offline');};
 await h.run(()=>h.runtime.snapshot.markThreadReadWithThrottle('2026-10-31T20:16:00Z'));
 await h.run(()=>h.runtime.snapshot.markThreadReadWithThrottle('2026-10-31T20:16:00Z'));
 assert.equal(attempts,2,'failed acknowledgement stays retryable');
 await h.appState('background');
 await h.run(()=>h.runtime.snapshot.markThreadReadWithThrottle('2026-10-31T20:17:00Z'));
 assert.equal(attempts,2,'background screen cannot acknowledge new activity');
 await h.appState('active');
 await h.rerender({focused:false});
 await h.run(()=>h.runtime.snapshot.markThreadReadWithThrottle('2026-10-31T20:17:00Z'));
 assert.equal(attempts,2,'blurred screen cannot acknowledge new activity');
});
