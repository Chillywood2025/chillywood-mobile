import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const viewer = '10000000-0000-4000-8000-000000000001';
const owner = (generation = 'one') => ({ userId: viewer, accountId: viewer, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
function fixture(push = true) {
  let authority = owner();
  let finishRemoval;
  let removalWait = null;
  const channels = [], removed = [], timers = new Map(), accounts = new Set(), apps = new Set(), activities = new Set();
  const app = { currentState: 'active', addEventListener: (_, fn) => { apps.add(fn); return { remove: () => apps.delete(fn) }; } };
  const same = (a,b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/sharedLiveUpdates.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, process: { env: { EXPO_PUBLIC_LIVE_DISCOVERY_PUSH_ENABLED: String(push) } }, Math: { ...Math, random: () => 0, floor: Math.floor },
    setTimeout: (fn, ms) => { timers.set(fn,ms); return fn; }, clearTimeout: fn => timers.delete(fn),
    require(name) {
      if(name === './liveDiscoveryInvalidation') {
        const result = { exports: {} };
        vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/liveDiscoveryInvalidation.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, result);
        return result.exports;
      }
      if(name === 'react-native') return { AppState: app };
      if(name === './accountSessionAuthority') return { getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority: same,
        subscribeToAccountSessionAuthority: fn => { accounts.add(fn); return () => accounts.delete(fn); } };
      if(name === './notificationActivity') return { getNotificationActivityOwnerKey: a => JSON.stringify(a),
        subscribeToNotificationActivity: (_, fn) => { activities.add(fn); return () => activities.delete(fn); } };
      if(name === './supabase') return { supabase: {
        channel(topic,options) { const ch = { topic,options,on: (_,filter,fn) => { ch.hint = fn; ch.filter = filter; return ch; }, subscribe: fn => { ch.status = fn; return ch; } }; channels.push(ch); return ch; },
        removeChannel: async ch => { removed.push(ch); if(removalWait) await removalWait; },
      } };
      throw Error(name);
    },
  });
  // Existing lifecycle assertions address the public scope. The independent
  // shared own-viewer transport is asserted explicitly below, not hidden in a
  // per-creator subscription count.
  return { get channels() { return channels.filter(ch=>!ch.topic.startsWith('discovery:v1:viewer:')); }, allChannels: channels,
    get removed() { return removed.filter(ch=>!ch.topic.startsWith('discovery:v1:viewer:')); }, allRemoved: removed,
    timers,accounts,apps,activities, interest: exports.getDiscoveryLiveUpdateInterest,
    holdRemoval() { removalWait = new Promise(resolve=>{finishRemoval=resolve;}); }, releaseRemoval() { finishRemoval();removalWait=null; },
    subscribe: (callback,interest) => exports.subscribeToLiveUpdates(authority,'discovery',callback,interest),
    flush() { const pending = [...timers.keys()]; timers.clear(); pending.forEach(fn => fn()); },
    activity() { for(const fn of activities) fn(); },
    account(value) { authority = value; for(const fn of [...accounts]) fn(value); },
    state(value) { app.currentState = value; for(const fn of apps) fn(value); },
  };
}
test('one private scoped subscription shares coalesced hints and reconnect invalidation', () => {
  const h=fixture(); let a=0,b=0; const da=h.subscribe(()=>a++), db=h.subscribe(()=>b++);
  assert.equal(h.channels.length,1); assert.equal(h.channels[0].options.config.private,true);
  for(let i=0;i<100;i++) h.channels[0].hint({ payload: { ignored: 'not authority' } });
  h.channels[0].status('SUBSCRIBED'); assert.equal(h.timers.size,1); h.flush();
  assert.equal(a,1); assert.equal(b,1); da(); h.channels[0].hint();h.flush();assert.equal(a,1);assert.equal(b,2);
  db(); assert.equal(h.removed.length,1);assert.equal(h.accounts.size,0);assert.equal(h.apps.size,0);assert.equal(h.activities.size,0);
});
test('same-user session replacement fences pending timers and removed-channel callbacks', async () => {
  const h=fixture();let a=0;h.subscribe(()=>a++);const old=h.channels[0];old.hint();h.account(owner('two'));h.flush();old.hint();old.status('SUBSCRIBED');h.flush();assert.equal(a,0);
  h.subscribe(()=>a++);await new Promise(resolve=>setImmediate(resolve));h.channels[1].status('SUBSCRIBED');h.flush();assert.equal(a,1);
});
test('background disconnect cancels pending delivery; foreground reconnect reconciles', async () => {
  const h=fixture();let a=0;const stop=h.subscribe(()=>a++);h.channels[0].hint();h.state('background');h.flush();assert.equal(a,0);
  h.activity();assert.equal(h.timers.size,0);h.state('active');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.channels.length,2);
  h.channels[0].status('SUBSCRIBED');h.flush();assert.equal(a,0);h.channels[1].status('SUBSCRIBED');h.flush();assert.equal(a,1);stop();
});
test('disabled transport uses existing activity only and does not open a socket', () => {
  const h=fixture(false);let a=0;const stop=h.subscribe(()=>a++);assert.equal(h.channels.length,0);h.activity();h.activity();h.flush();assert.equal(a,1);stop();
});
test('listener failure isolated and removed listener never receives delayed hint', () => {
  const h=fixture();let a=0;const d1=h.subscribe(()=>{throw Error('consumer');}),d2=h.subscribe(()=>a++);h.activity();h.flush();assert.equal(a,1);
  h.activity();d2();h.flush();assert.equal(a,1);d1();
});
test('signed-out or restore-only sessions cannot subscribe', () => {
  const h=fixture();h.account(null);h.subscribe(()=>{});h.account({...owner(),restoreOnly:true});h.subscribe(()=>{});assert.equal(h.channels.length,0);assert.equal(h.activities.size,0);
});
test('replacement waits for old asynchronous removal before creating same-topic channel', async () => {
  const h=fixture();let a=0;h.holdRemoval();h.subscribe(()=>a++);const old=h.channels[0];h.account(owner('replacement'));const stop=h.subscribe(()=>a++);
  assert.equal(h.channels.length,1);old.hint();h.flush();assert.equal(a,0);h.releaseRemoval();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.channels.length,2);h.channels[1].status('SUBSCRIBED');h.flush();assert.equal(a,1);stop();
});
test('creator rails use one scoped public interest, not one channel per followed creator', () => {
  const h=fixture(),id='10000000-0000-4000-8000-000000000001';
  assert.equal(h.interest({creatorUserId:id}).creatorUserId,id);
  assert.equal(h.interest({creatorUserIds:[id,'20000000-0000-4000-8000-000000000002'],surface:'profile'}).surface,'profile');
  const a=h.subscribe(()=>{}, {creatorUserId:id}),b=h.subscribe(()=>{}, {surface:'home'});
  assert.equal(h.channels[0].topic,`discovery:v1:creator:${id}`);assert.equal(h.channels[1].topic,'discovery:v1:surface:home');a();b();
});
test('100listeners and1000hint burst share one transport and one bounded delivery timer', () => {
  const h=fixture();let delivered=0;const stops=Array.from({length:100},()=>h.subscribe(()=>delivered++));
  assert.equal(h.channels.length,1);for(let i=0;i<1000;i++)h.channels[0].hint();assert.equal(h.timers.size,1);h.flush();assert.equal(delivered,100);
  h.state('background');for(let i=0;i<1000;i++)h.channels[0].hint();h.flush();assert.equal(delivered,100);stops.forEach(stop=>stop());
});
test('interest count is bounded even if a screen mounts many distinct creator rails', () => {
  const h=fixture();const stops=Array.from({length:100},(_,i)=>h.subscribe(()=>{}, {creatorUserId:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`}));
  assert.equal(h.channels.length,4);assert.equal(h.allChannels.length,5);stops.forEach(stop=>stop());assert.equal(h.activities.size,0);
});
test('all interests share one exact-own viewer channel, including consumers beyond the public-interest cap', () => {
  const h=fixture();let delivered=0;
  const stops=Array.from({length:100},(_,i)=>h.subscribe(()=>delivered++,{creatorUserId:`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`}));
  const privateChannels=h.allChannels.filter(ch=>ch.topic.startsWith('discovery:v1:viewer:'));
  assert.equal(privateChannels.length,1);assert.equal(privateChannels[0].topic,`discovery:v1:viewer:${viewer}`);
  assert.equal(privateChannels[0].options.config.private,true);
  for(let i=0;i<1000;i++)privateChannels[0].hint({payload:{id:'opaque'}});
  assert.equal(h.timers.size,1);assert.deepEqual([...h.timers.values()],[100]);h.flush();assert.equal(delivered,100);
  const before=h.allChannels.length;h.subscribe(()=>{}, {viewerUserId:'30000000-0000-4000-8000-000000000003'});
  assert.equal(h.allChannels.length,before,'caller cannot select another viewer topic');
  h.account(owner('replacement'));privateChannels[0].hint();h.flush();assert.equal(delivered,100,'retired private callbacks cannot reconcile replacement account');
  stops.forEach(stop=>stop());assert.equal(h.accounts.size,0);assert.equal(h.apps.size,0);
});
test('scoped opaque keys coalesce without payload metadata; malformed and overflowing input fails closed', () => {
  const h=fixture(),received=[];h.subscribe(value=>received.push(value));
  const a='a0000000-0000-4000-8000-000000000001',b='b0000000-0000-4000-8000-000000000002';
  h.channels[0].hint({payload:{id:'random',keys:[a],title:'must not pass through'}});
  h.channels[0].hint({payload:{id:'random2',keys:[a,b]}});h.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(received.pop())),{keys:[a,b]});
  h.channels[0].hint({payload:{keys:['not-an-opaque-uuid']}});h.flush();assert.equal(received.pop().keys,null);
  for(let i=0;i<257;i++)h.channels[0].hint({payload:{keys:[`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`]}});
  h.flush();assert.equal(received.pop().keys,null);
  h.activity();h.flush();assert.equal(received.pop().keys.length,0,'secondary CDC is a wakeup, not a fabricated whole-world privacy change');
});
