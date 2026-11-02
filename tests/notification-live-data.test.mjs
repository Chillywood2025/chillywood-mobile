import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import ts from 'typescript';
import { createClient as createSdkClient } from '@supabase/supabase-js';

const source = ts.transpileModule(process.env.NOTIFICATION_ORDER_BASELINE === '1'
  ? execFileSync('git', ['show', 'HEAD:_lib/notifications.ts'], { encoding: 'utf8' })
  : fs.readFileSync('_lib/notifications.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const displayContext = {};
new Function('exports', ts.transpileModule(fs.readFileSync('_lib/notificationDisplayContext.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(displayContext);
const binding = (generation = 'session-a') => ({ userId: 'account-a', accountId: 'account-a',
  sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const row = (extra = {}) => ({ id: '00000000-0000-4000-8000-000000000001', user_id: 'account-a',
  category: 'chilly_chat_call', notification_type: 'chilly_chat_call', title: 'Call',
  body: null, deep_link: '/chat/thread-a', status: 'pending', source_id: 'invite-a',
  target_route: '/chat/[threadId]', target_entity_id: 'thread-a', target_context: {},
  read_at: null, dismissed_at: null, created_at: '2026-01-01T00:00:00.000Z', delivered_at: null, ...extra });
test('notification keyset cursor preserves PostgreSQL microseconds across pages and timezone normalization', async () => {
  const at = '2026-01-01T01:00:00.123456+01:00';
  const h = harness({ fetcher: call => call.url.pathname.endsWith('/notifications')
    ? response([row({ notification_type: 'system_notice', category: 'system', created_at: at })]) : undefined });
  const first = await h.api.readNotificationListPage('account-a', 1);
  assert.equal(first.status, 'resolved');
  assert.equal(first.nextCursor.createdAt, '2026-01-01T00:00:00.123456Z');
  assert.equal(first.items[0].createdAt, first.nextCursor.createdAt);
  await h.api.readNotificationListPage('account-a', 1, first.nextCursor);
  const pageCalls = h.calls.filter(call => call.url.pathname.endsWith('/notifications'));
  assert.equal(pageCalls[1].url.searchParams.get('or'),
    `(created_at.lt.${first.nextCursor.createdAt},and(created_at.eq.${first.nextCursor.createdAt},id.lt.${first.nextCursor.id}))`);
  assert.equal(pageCalls[1].url.searchParams.get('order'), 'created_at.desc,id.desc');
});
test('notification cursor traverses adjacent microseconds and equal-timestamp IDs without omissions', async () => {
  const records = [
    row({ id: '00000000-0000-4000-8000-000000000003', created_at: '2026-01-01T00:00:00.123456Z' }),
    row({ id: '00000000-0000-4000-8000-000000000002', created_at: '2026-01-01T00:00:00.123456Z' }),
    row({ id: '00000000-0000-4000-8000-000000000001', created_at: '2026-01-01T00:00:00.123400Z' }),
  ].map(record => ({ ...record, notification_type: 'system_notice', category: 'system' }));
  const h = harness({ fetcher: call => {
    if (!call.url.pathname.endsWith('/notifications')) return;
    const filter = call.url.searchParams.get('or');
    const cursor = filter?.match(/^\(created_at\.lt\.(.+),and\(created_at\.eq\..+,id\.lt\.([0-9a-f-]+)\)\)$/);
    // Canonical timestamps are fixed-width here, matching PostgreSQL tuple order.
    const at = cursor?.[1].replace(/\.(\d+)Z$/, (_, digits) => `.${digits.padEnd(6, '0')}Z`);
    const eligible = cursor ? records.filter(record => record.created_at < at || (record.created_at === at && record.id < cursor[2])) : records;
    return response(eligible.slice(0, 1));
  } });
  const found = []; let cursor = null;
  for (let i = 0; i < 4; i++) {
    const page = await h.api.readNotificationListPage('account-a', 1, cursor);
    assert.equal(page.status, 'resolved'); found.push(...page.items.map(item => item.id));
    cursor = page.nextCursor; if (!cursor) break;
  }
  assert.deepEqual(found, records.map(record => record.id));
});
test('malformed notification cursors cannot become a filter or dispatch a list read', async () => {
  for (const createdAt of ['not-a-date', '2026-01-01T00:00:00.123456Z),id.gt.0', '']) {
    const h = harness();
    assert.equal((await h.api.readNotificationListPage('account-a', 1, { createdAt, id: row().id })).status, 'unavailable');
    assert.equal(h.calls.length, 0);
  }
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const response = (data, count = 1) => new Response(JSON.stringify(data), {
  status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': `0-0/${count}` },
});
const vipRow = () => row({category:'creator_money_purchase',notification_type:'vip_access_active',title:'VIP Pass active.',
  body:'Your creator VIP access is active.',target_route:'/vip-pass/[creatorId]',target_entity_id:'creator-a',source_id:'purchase-a'});
const displayPayload = () => ({schemaVersion:1,items:[{notificationId:vipRow().id,notificationType:'vip_access_active',
  targetRoute:'/vip-pass/[creatorId]',targetId:'creator-a',creatorId:'creator-a',creatorName:'Rachi (@rachi)',targetTitle:null,resolution:'resolved'}]});
function harness({ fetcher, capture, afterScopedToken, omitDispatchFence = false } = {}) {
  let authority = binding();
  const calls = [], timers = new Map(), subscribers = new Set();
  let timerId = 0, captures = 0, clients = 0, dispatchGapVisits = 0;
  const fetchImpl = async (input, init) => {
    const call = { url: new URL(input), method: init?.method ?? 'GET', signal: init?.signal,
      authorization: new Headers(init?.headers).get('authorization'), body: init?.body };
    calls.push(call);
    const result = fetcher?.(call, calls);
    if (result) return await result;
    if (call.method === 'PATCH') return response(null);
    if (call.url.pathname.endsWith('/chat_call_invites')) return response([{ id: 'invite-a', status: 'missed', expires_at: '2026-01-01T00:00:00Z' }]);
    if (call.method === 'HEAD') return response(null, 135);
    return response([row()]);
  };
  const createClient = (url, key, options) => {
    const scoped = ++clients > 1;
    let tokenReads = 0;
    return createSdkClient(url, key, {
      ...options,
      accessToken: () => {
        const token = options.accessToken();
        // The first token read initializes Realtime. Retire in the actual
        // mutation's token-await gap, after the production callback checked.
        if (scoped && ++tokenReads === 2 && afterScopedToken) {
          void token.then(() => { dispatchGapVisits++; afterScopedToken(); });
        }
        return token;
      },
      global: { ...options?.global,
        fetch: omitDispatchFence ? fetchImpl : options?.global?.fetch ?? fetchImpl },
    });
  };
  const supabase = createClient('https://notifications.invalid', 'test-anon-key', {
    accessToken: async () => `mutable-${authority.sessionGeneration}`,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const deps = {
    '@supabase/supabase-js': { createClient },
    'react-native': { NativeModules: {}, Platform: { OS: 'ios' } },
    './supabase': { supabase, SUPABASE_URL: 'https://notifications.invalid', SUPABASE_ANON_KEY: 'test-anon-key' },
    './userFacingProductCopy': { normalizeProductNotificationCopy: value => String(value ?? '') },
    './notificationDisplayContext': displayContext,
    './chillyChatCalls': { CHAT_CALL_INVITES_TABLE: 'chat_call_invites' },
    './accountSessionAuthority': {
      getCurrentAccountSessionAuthoritySnapshot: () => ({ ...authority }),
      sameAccountSessionAuthority: (a, b) => !!a && !!b && Object.keys(a).every(key => a[key] === b[key]),
      subscribeToAccountSessionAuthority(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
    },
    './accountBoundSupabaseMutation': { async captureAccountBoundSupabaseMutationSubject(userId, options) {
      captures++; assert.equal(userId, 'account-a');
      assert.equal(options.waitForReadSettlement, true); assert.ok(options.signal instanceof AbortSignal);
      const subject = { accessToken: `frozen-${authority.sessionGeneration}`, authority: { ...authority } };
      await capture?.(); return subject;
    } },
  };
  const exports = {};
  new Function('exports', 'require', 'setTimeout', 'clearTimeout', 'fetch', source)(exports,
    name => deps[name] ?? {},
    (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    id => timers.delete(id), fetchImpl);
  return { api: exports, calls, timers, subscribers, get captures() { return captures; },
    get dispatchGapVisits() { return dispatchGapVisits; },
    expire(wantedDelay = 8000) { for (const { callback, delay } of [...timers.values()]) { assert.ok([1500,8000].includes(delay)); if (delay === wantedDelay) callback(); } },
    replace() { authority = binding('session-b'); subscribers.forEach(callback => callback(authority)); },
  };
}

test('actual notification page and important reads hydrate exact creator without changing history or delivery state',async()=>{
 const h=harness({fetcher:call=>response(call.url.pathname.endsWith('/rpc/read_my_notification_display_context')?displayPayload():[vipRow()])});
 const page=await h.api.readNotificationListPage('account-a',30);
 assert.equal(page.status,'resolved');assert.match(page.items[0].title,/Rachi/);assert.doesNotMatch(page.items[0].body,/access is active/);
 assert.equal(page.items[0].createdAt,'2026-01-01T00:00:00.000Z');assert.equal(page.items[0].isRead,false);assert.equal(page.items[0].target.entityId,'creator-a');
 const important=await h.api.readImportantNotificationList('account-a',20);assert.match(important[0].title,/Rachi/);
 const requests=h.calls.filter(c=>c.url.pathname.endsWith('/rpc/read_my_notification_display_context'));
 assert.equal(requests.length,2);assert.ok(requests.every(c=>JSON.parse(c.body).p_notification_ids[0]===vipRow().id));
 assert.ok(h.calls.every(c=>c.method==='GET'||c.url.pathname.endsWith('/rpc/read_my_notification_display_context')));
});
test('unavailable optional label RPC preserves existing working notification and target',async()=>{
 const h=harness({fetcher:call=>call.url.pathname.endsWith('/rpc/read_my_notification_display_context')
  ?new Response(JSON.stringify({message:'function not deployed'}),{status:404,headers:{'Content-Type':'application/json'}}):response([vipRow()])});
 const page=await h.api.readNotificationListPage('account-a',30);assert.equal(page.status,'resolved');assert.equal(page.items[0].title,'VIP Pass active.');assert.equal(page.items[0].target.entityId,'creator-a');
});
for (const route of ['/watch-party/live-stage/[partyId]', '/watch-party/[partyId]']) test(`attendance SDK read keeps exact ${route} and redacts unverified stored names`, async()=>{
 const attendance = row({category:'circle_activity',notification_type:'live_room_member_joined',title:'PRIVATE ACTOR joined',body:'PRIVATE ROOM',target_route:route,target_entity_id:'EXACT-ROOM',target_context:{},source_id:'join-event'});
 let available = false;
 const h=harness({fetcher:call=>call.url.pathname.endsWith('/rpc/read_my_notification_display_context')
  ? available ? response({schemaVersion:1,items:[{notificationId:attendance.id,notificationType:'live_room_member_joined',targetRoute:route,targetId:'EXACT-ROOM',creatorName:'Exact Member',targetTitle:'Exact Room',resolution:'resolved',liveState:'live'}]})
   : new Response(JSON.stringify({message:'unavailable'}),{status:503,headers:{'Content-Type':'application/json'}})
  : response([attendance])});
 const first=await h.api.readNotificationListPage('account-a',30);
 assert.equal(first.status,'resolved');assert.doesNotMatch(first.items[0].title+first.items[0].body,/PRIVATE ACTOR|PRIVATE ROOM/);
 assert.equal(first.items[0].target.entityId,'EXACT-ROOM');assert.equal(first.items[0].target.route,route);
 available=true;
 const verified=await h.api.readNotificationListPage('account-a',30);
 assert.match(verified.items[0].body,/Exact Member joined Exact Room/);
 assert.equal(verified.items[0].target.route,route);
});
for (const type of ['followed_creator_live','circle_friend_live']) test(`${type} SDK fallback redacts cached private names and ended read is non-joinable history`,async()=>{
 const live=row({category:'creator_went_live',notification_type:type,title:'PRIVATE HOST is live',body:'PRIVATE ROOM',target_route:'/watch-party/live-stage/[partyId]',target_entity_id:'LIVE-ROOM',deep_link:'/watch-party/live-stage/LIVE-ROOM',target_context:{display_context:{creator_display_name:'PRIVATE HOST',subject_title:'PRIVATE ROOM'}}});
 let state='missing';
 const h=harness({fetcher:call=>call.url.pathname.endsWith('/rpc/read_my_notification_display_context')
  ? state==='missing'?new Response('{}',{status:503,headers:{'Content-Type':'application/json'}})
   : response({schemaVersion:1,items:[{notificationId:live.id,notificationType:type,targetRoute:live.target_route,targetId:live.target_entity_id,
      creatorName:state==='unavailable'?null:'Exact Host',targetTitle:state==='unavailable'?null:'Exact Room',resolution:state==='unavailable'?'unavailable':'resolved',liveState:state}]})
  :response([live])});
 const fallback=(await h.api.readNotificationListPage('account-a',30)).items[0];
 assert.doesNotMatch(JSON.stringify(fallback),/PRIVATE HOST|PRIVATE ROOM/);
 assert.equal(fallback.target.context.live_discovery_state,'unavailable');
 state='live';const active=(await h.api.readNotificationListPage('account-a',30)).items[0];
 assert.match(active.title,/Exact Host/);assert.equal(active.target.context.live_discovery_state,'live');
 state='ended';const ended=(await h.api.readNotificationListPage('account-a',30)).items[0];
 assert.match(ended.title,/Live ended/);assert.match(ended.body,/not an invitation to join/);assert.equal(ended.isExpired,true);
 state='unavailable';const hidden=(await h.api.readNotificationListPage('account-a',30)).items[0];
 assert.doesNotMatch(hidden.title+hidden.body,/Exact Host|Exact Room|PRIVATE/);assert.equal(hidden.target.context.live_discovery_state,'unavailable');
});
test('label RPC response cannot follow an account replacement or a canceled screen',async()=>{
 for(const mode of ['replace','abort']){
  const held=deferred(),controller=new AbortController();
  const h=harness({fetcher:call=>call.url.pathname.endsWith('/rpc/read_my_notification_display_context')?held.promise:response([vipRow()])});
  const pending=h.api.readNotificationListPage('account-a',30,null,controller.signal);await settle();
  assert.equal(h.calls.length,2);if(mode==='replace')h.replace();else controller.abort();
  held.resolve(response(displayPayload()));const page=await pending;assert.equal(page.status,'unavailable');assert.deepEqual(page.items,[]);
 }
});

test('hung optional labels return first-page history promptly while retaining bounded transport ownership',async()=>{
 const held=[deferred(),deferred()];let labelReads=0;
 const h=harness({fetcher:call=>call.url.pathname.endsWith('/rpc/read_my_notification_display_context')
  ? (++labelReads<=2?held[labelReads-1].promise:response(displayPayload())) : response([vipRow()])});
 for(let i=0;i<2;i++){
  const pending=h.api.readNotificationListPage('account-a',30,null,new AbortController().signal);await settle();
  h.expire(1500);const page=await pending;
  assert.equal(page.status,'resolved');assert.equal(page.items[0].title,'VIP Pass active.');
  assert.equal(page.items[0].target.entityId,'creator-a');assert.equal(h.timers.size,0);
 }
 assert.equal(labelReads,2);
 assert.ok(h.calls.filter(c=>c.url.pathname.includes('display_context')).every(c=>c.signal.aborted));
 for(let i=0;i<5;i++)assert.equal((await h.api.readNotificationListPage('account-a',30)).status,'resolved');
 assert.equal(labelReads,2,'hung abort-ignoring transports retain both slots; refreshes cannot accumulate more');
 held[0].resolve(response(displayPayload()));await settle();
 const next=await h.api.readNotificationListPage('account-a',30);assert.match(next.items[0].title,/Rachi/);
 assert.equal(labelReads,3,'actual source settlement releases a slot');
 held[1].resolve(response(displayPayload()));await settle();
 assert.equal(h.subscribers.size,0);assert.equal(h.timers.size,0);
});

test('canceled optional observer releases promptly but replacement cannot reuse hung transport slots or stale labels',async()=>{
 const held=[deferred(),deferred()];let reads=0;
 const h=harness({fetcher:call=>call.url.pathname.endsWith('/rpc/read_my_notification_display_context')
  ?held[reads++].promise:response([vipRow()])});
 const controllers=[new AbortController(),new AbortController()];
 const pending=controllers.map(c=>h.api.readNotificationListPage('account-a',30,null,c.signal));await settle();
 h.replace();for(const result of await Promise.all(pending)){assert.equal(result.status,'unavailable');assert.deepEqual(result.items,[]);}
 const replacement=await h.api.readNotificationListPage('account-a',30);
 assert.equal(replacement.status,'resolved');assert.doesNotMatch(replacement.items[0].title,/Rachi/);assert.equal(reads,2);
 for(const source of held)source.resolve(response(displayPayload()));await settle();
 assert.doesNotMatch(replacement.items[0].title,/Rachi/,'late original-session labels cannot mutate returned replacement rows');
 assert.equal(h.subscribers.size,0);assert.equal(h.timers.size,0);
});

test('notification reads abort SDK transport at the deadline and retain abort-ignoring ownership', async () => {
  const held = deferred(), controller = new AbortController();
  const h = harness({ fetcher: () => held.promise });
  let finished = false;
  const pending = h.api.readNotificationListPage('account-a', 30, null, controller.signal)
    .then(result => { finished = true; return result; });
  await settle(); assert.equal(h.calls.length, 1);
  h.expire(); await settle();
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(finished, false, 'display cancellation does not falsely settle ignored transport');
  held.resolve(response([row()]));
  const result = await pending;
  assert.equal(result.status, 'unavailable'); assert.equal(h.captures, 0);
  assert.equal(h.timers.size, 0); assert.equal(h.subscribers.size, 0);
});

test('legacy Profile-style no-signal read releases its observer at eight seconds and fences the late read', async () => {
  const held = deferred();
  const h = harness({ fetcher: () => held.promise });
  const pending = h.api.readNotificationListPage('account-a', 12);
  await settle(); assert.equal(h.calls.length, 1);
  h.expire();
  assert.equal((await pending).status, 'unavailable');
  assert.equal(h.calls[0].signal.aborted, true);
  held.resolve(response([row()])); await settle();
  assert.equal(h.captures, 0);
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 0);
});

test('legacy no-signal deadline during auth capture releases observer and cannot dispatch a late reconciliation write', async () => {
  const held = deferred();
  const h = harness({ capture: () => held.promise });
  const pending = h.api.readNotificationListPage('account-a', 12);
  await settle(); assert.equal(h.captures, 1);
  h.expire(); assert.equal((await pending).status, 'unavailable');
  held.resolve(); await settle();
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 0);
  assert.equal(h.subscribers.size, 0); assert.equal(h.timers.size, 0);
});

test('legacy observer deadline does not abort or undo an already-dispatched reconciliation write', async () => {
  const held = deferred();
  const h = harness({ fetcher: call => call.method === 'PATCH' ? held.promise : null });
  const pending = h.api.readNotificationListPage('account-a', 12);
  await settle();
  const write = h.calls.find(call => call.method === 'PATCH');
  assert.ok(write); assert.equal(write.signal, undefined);
  h.expire(); assert.equal((await pending).status, 'unavailable');
  held.resolve(response(null)); await settle();
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 1);
});

test('already cancelled reads dispatch nothing and same-user replacement aborts SDK queries', async () => {
  const before = new AbortController(); before.abort();
  const h = harness();
  assert.equal((await h.api.readNotificationListPage('account-a', 30, null, before.signal)).status, 'unavailable');
  assert.equal(h.calls.length, 0);
  const held = deferred(), pendingHarness = harness({ fetcher: () => held.promise });
  const pending = pendingHarness.api.readNotificationListPage('account-a');
  await settle(); pendingHarness.replace();
  assert.equal(pendingHarness.calls[0].signal.aborted, true);
  held.resolve(response([row()]));
  assert.equal((await pending).status, 'unavailable');
  assert.equal(pendingHarness.captures, 0);
});

for (const retirement of ['cancel', 'session']) test(`reconciliation ${retirement} during awaited auth capture dispatches no UPDATE`, async () => {
  const held = deferred(), controller = new AbortController();
  const h = harness({ capture: () => held.promise });
  const pending = h.api.readNotificationListPage('account-a', 30, null, controller.signal);
  await settle(); assert.equal(h.captures, 1);
  if (retirement === 'cancel') controller.abort(); else h.replace();
  held.resolve();
  assert.equal((await pending).status, 'unavailable');
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 0);
});

for (const retirement of ['cancel', 'session']) {
  for (const omitDispatchFence of [false, true]) test(`reconciliation ${retirement} in SDK token-to-fetch microtask gap ${omitDispatchFence ? 'negative control reaches UPDATE without dispatch fence' : 'dispatches no UPDATE'}`, async () => {
    const controller = new AbortController();
    const h = harness({ omitDispatchFence,
      afterScopedToken: () => { if (retirement === 'cancel') controller.abort(); else h.replace(); },
    });
    const result = await h.api.readNotificationListPage('account-a', 30, null, controller.signal);
    assert.equal(h.dispatchGapVisits, 1, 'retirement must hit the actual SDK mutation-token await');
    assert.equal(result.status, 'unavailable');
    const writes = h.calls.filter(call => call.method === 'PATCH');
    assert.equal(writes.length, omitDispatchFence ? 1 : 0);
    if (omitDispatchFence) {
      assert.equal(writes[0].authorization, 'Bearer frozen-session-a');
      assert.equal(writes[0].signal, undefined, 'read cancellation must not be attached to dispatched writes');
    }
  });
}

test('reconciliation freezes initiating token and awaits already-dispatched UPDATE without pretending cancellation undid it', async () => {
  const held = deferred(), controller = new AbortController();
  const h = harness({ fetcher: call => call.method === 'PATCH' ? held.promise : null });
  let finished = false;
  const pending = h.api.readNotificationListPage('account-a', 30, null, controller.signal)
    .then(result => { finished = true; return result; });
  await settle();
  const write = h.calls.find(call => call.method === 'PATCH');
  assert.ok(write); assert.equal(write.authorization, 'Bearer frozen-session-a');
  assert.equal(write.url.searchParams.get('user_id'), 'eq.account-a');
  assert.equal(write.signal, undefined, 'do not attach read cancellation to a dispatched mutation');
  controller.abort(); h.replace(); await settle(); assert.equal(finished, false);
  held.resolve(response(null)); assert.equal((await pending).status, 'unavailable');
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 1);
});

test('summary waits for every transport sibling and preserves exact counts plus call reconciliation', async () => {
  const held = deferred();
  const h = harness({ fetcher: (call, calls) => call.method === 'HEAD' && calls.filter(c => c.method === 'HEAD').length === 1
    ? held.promise : null });
  let finished = false;
  const pending = h.api.readNotificationSummary('account-a').then(result => { finished = true; return result; });
  await settle(); assert.equal(finished, false);
  assert.equal(h.calls.filter(call => call.method === 'PATCH').length, 1);
  held.resolve(response(null, 135));
  const result = await pending;
  assert.equal(result.totalCount, 135); assert.equal(result.unreadCount, 135);
  assert.deepEqual(result.categories, ['chilly_chat_call']);
  assert.equal(result.latestCreatedAt, row().created_at);
  assert.equal(h.calls.find(call => call.method === 'GET' && call.url.pathname.endsWith('/notifications')).url.searchParams.get('limit'), '100');
});

test('failed summary sibling cannot release an abort-ignoring sibling before settlement', async () => {
  const held = deferred(), controller = new AbortController();
  const h = harness({ fetcher: (call, calls) => {
    if (call.method === 'HEAD' && calls.filter(c => c.method === 'HEAD').length === 1) return held.promise;
    if (call.method === 'HEAD') return Promise.reject(new Error('read failed'));
    return response([]);
  } });
  let finished = false;
  const pending = h.api.readNotificationSummary('account-a', controller.signal).catch(error => { finished = true; return error; });
  await settle(); controller.abort(); await settle(); assert.equal(finished, false);
  held.resolve(response(null));
  assert.match((await pending).message, /could not be refreshed/);
});

test('summary detects sensitive attendance outside its recent category window with an exact owner-bound ID-only probe',async()=>{
 const h=harness({fetcher:call=>call.url.pathname.endsWith('/notifications')&&call.url.searchParams.get('select')==='id'
  ?response([{id:'old-live-attendance'}]):undefined});
 const summary=await h.api.readNotificationSummary('account-a');
 assert.equal(summary.hasLiveActivity,true);assert.deepEqual(summary.categories,['chilly_chat_call']);
 const probe=h.calls.find(c=>c.url.searchParams.get('select')==='id');
 assert.equal(probe.url.searchParams.get('limit'),'1');assert.equal(probe.url.searchParams.get('user_id'),'eq.account-a');
 assert.equal(probe.url.searchParams.get('notification_type'),'in.(followed_creator_live,circle_friend_live,live_room_member_joined)');
 assert.equal(probe.url.searchParams.get('dismissed_at'),'is.null');assert.ok(probe.signal);
});

const footprintKey='30000000-0000-4000-8000-000000000001';
for(const [name,payload,complete] of [
 ['current-complete',{schemaVersion:1,subjectUserId:'account-a',keys:[footprintKey],complete:true},true],
 ['overflow-incomplete',{schemaVersion:1,subjectUserId:'account-a',keys:[footprintKey],complete:false},false],
 ['foreign-subject',{schemaVersion:1,subjectUserId:'other',keys:[footprintKey],complete:true},false],
 ['malformed-key',{schemaVersion:1,subjectUserId:'account-a',keys:['private-room-name'],complete:true},false],
 ['oversized',{schemaVersion:1,subjectUserId:'account-a',keys:Array(257).fill(footprintKey),complete:true},false],
])test(`actual SDK summary parses canonical footprint ${name} without trusting a loaded-row sample`,async()=>{
 const h=harness({fetcher:call=>call.url.pathname.endsWith('/rpc/read_my_live_notification_hint_footprint')?response({totalCount:7,unreadCount:7,undismissedCount:7,hasLiveActivity:true,...payload}):undefined});
 const summary=await h.api.readNotificationSummary('account-a');assert.equal(summary.liveHintKeysComplete,complete);
 if(complete){assert.deepEqual(summary.liveHintKeys,[footprintKey]);assert.equal(summary.unreadCount,7,'atomic SQL count wins over independently stale135 HEAD count');}
 assert.equal(h.calls.filter(c=>c.url.pathname.endsWith('/rpc/read_my_live_notification_hint_footprint')).length,1);
});

test('separate old HEAD counts cannot restore a newly hidden source omitted from the atomic footprint',async()=>{
 const h=harness({fetcher:call=>call.url.pathname.endsWith('/rpc/read_my_live_notification_hint_footprint')
  ?response({schemaVersion:1,subjectUserId:'account-a',keys:[],complete:true,totalCount:0,unreadCount:0,undismissedCount:0,hasLiveActivity:false}):undefined});
 const result=await h.api.readNotificationSummary('account-a');
 assert.equal(result.unreadCount,0);assert.equal(result.hasLiveActivity,false);assert.equal(result.liveHintKeysComplete,true);
 assert.ok(!h.calls.some(c=>c.method==='HEAD'),'valid atomic protocol never dispatches redundant legacy HEAD queries that would return135');
});
