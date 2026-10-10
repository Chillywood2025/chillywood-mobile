import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {EventEmitter} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {createNativeCallStateHandler, snapshotBinding} from '../supabase/functions/_shared/ios-native-call-state-observer.mjs';
const REPO = fileURLToPath(new URL('..', import.meta.url));
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U=id(1), CALLER=id(2), SESSION=id(3), TOKEN=id(4), INVITE=id(5), THREAD=id(6), ATTEMPT=id(7), OBSERVER=id(8), GENERATION=id(9), CONNECTION=id(10);
const SECRET='Z'.repeat(43), sha256=async value => createHash('sha256').update(value).digest('hex');
const settle=async () => {for(let i=0;i<30;i++) await Promise.resolve();};
function timerHarness() {
  let time=0, serial=0; const jobs=new Map();
  return {now:()=>time, count:()=>jobs.size,
    set:(fn,ms)=>{const key=++serial; jobs.set(key,{fn,at:time+ms}); return key;}, clear:key=>jobs.delete(key),
    advance:async ms=>{const end=time+ms; for(;;){const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break; time=next[1].at; jobs.delete(next[0]); next[1].fn(); await settle();}time=end; await settle();}};
}
function harness(snapshot, suppliedRpc, rejectKeepAlive = false) {
  const timers=timerHarness(), frames=[], calls=[]; let upgraded=0, closed=0, kept, final=false;
  const events=new EventEmitter();
  const base=Date.now(); const socket={send:v=>{frames.push(JSON.parse(v));events.emit('send');},close:()=>{closed++;events.emit('close');}};
  const observed = (event, alreadyObserved) => {
    if(alreadyObserved())return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timeout);events.off(event,done);if(event!=='close')events.off('close',failed);};
      const done=()=>{cleanup();resolve();};
      const failed=()=>{cleanup();reject(new Error('socket closed before expected frame'));};
      const timeout=setTimeout(()=>{cleanup();reject(new Error(`socket ${event} boundary was not observed`));},5000);
      events.once(event,done);if(event!=='close')events.once('close',failed);
      if(alreadyObserved())done();else if(closed && event!=='close')failed();
    });
  };
  const rpc=async(name,args,signal)=>{calls.push({name,args,signal}); return suppliedRpc ? suppliedRpc(name,args,signal) : snapshot;};
  const handle=createNativeCallStateHandler({rpc,sha256,now:()=>base+timers.now(),monotonic:timers.now,
    setTimer:timers.set,clearTimer:timers.clear,
    upgradeWebSocket:()=>{upgraded++;return {socket,response:{status:101}};},
    keepAlive:p=>{kept=p; p.then(()=>{final=true;});if(rejectKeepAlive)throw new Error('runtime_unavailable');}});
  return {timers,frames,calls,socket,handle,upgraded:()=>upgraded,closed:()=>closed,final:()=>final,
    firstFrame:()=>observed('send',()=>frames.length>0), closedEvent:()=>observed('close',()=>closed>0),
    async request(changes={}) { const headers={upgrade:'websocket','x-chilly-call-observer':OBSERVER,
      'x-chilly-call-connection':CONNECTION,'x-chilly-call-generation':GENERATION,
      'x-chilly-call-capability':SECRET,'x-chilly-call-binding':await snapshotBinding(snapshot,sha256),...changes};
      return new Request('https://example.test/functions/v1/ios-native-call-state',{headers});},
    async open(){socket.onopen();await settle();}, async stop(){socket.onclose?.();await kept;await settle();}};
}
const model=()=>({observerId:OBSERVER,inviteId:INVITE,threadId:THREAD,callUuid:INVITE,callType:'voice',
  recipientUserId:U,recipientAccountId:U,recipientSessionGeneration:SESSION,recipientInstallId:'exact-install',
  expiresAt:new Date(Date.now()+90000).toISOString(),status:'ringing'});

test('actual status-only handler validates real SQL capability authority before upgrade', async t=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      create table public.restricted_accounts(id text primary key);
      create function public.is_account_access_restricted(p_user text) returns boolean language sql stable as
        $$select exists(select 1 from public.restricted_accounts where id=p_user)$$;
      create table user_voip_push_tokens(id uuid primary key,user_id uuid,account_id uuid,session_generation uuid,
        install_id text,token_hash text,revocation_credential_hash text,enabled boolean,ownership_state text,revoked_at timestamptz);
      create table chat_call_invites(id uuid primary key,thread_id uuid,caller_user_id text,callee_user_id text,call_type text,status text,expires_at timestamptz);
      create table chat_thread_members(thread_id uuid,user_id text);
      create table voip_push_delivery_attempts(id uuid primary key,voip_push_token_id uuid,call_invite_id uuid,recipient_user_id uuid,attempt_count integer,status text);`);
    await db.exec(fs.readFileSync(`${REPO}/supabase/migrations/20261010180514_ios_native_call_state_observer.sql`,'utf8'));
    await db.query('insert into auth.users values($1),($2)',[U,CALLER]);
    await db.query('insert into auth.sessions values($1,$2,null)',[SESSION,U]);
    await db.query(`insert into user_voip_push_tokens values($1,$2,$2,$3,'exact-install',repeat('b',64),repeat('c',64),true,'ACCOUNT_BOUND',null)`,[TOKEN,U,SESSION]);
    await db.query(`insert into chat_call_invites values($1,$2,$3,$4,'voice','ringing',clock_timestamp()+interval '90 seconds')`,[INVITE,THREAD,CALLER,U]);
    await db.query('insert into chat_thread_members values($1,$2),($1,$3)',[THREAD,U,CALLER]);
    await db.query(`insert into voip_push_delivery_attempts values($1,$2,$3,$4,1,'attempted')`,[ATTEMPT,TOKEN,INVITE,U]);
    const hash=await sha256(SECRET);
    await db.query('select whole_app_issue_ios_call_state_observer($1,$2,1,$3)',[OBSERVER,ATTEMPT,hash]);
    const snap=(await db.query('select whole_app_current_ios_call_state_observer($1,$2) as v',[OBSERVER,hash])).rows[0].v;
    const rpc=async(name,a)=>(await db.query(`select ${name}($1,$2,$3,$4) as v`,
      [a.p_issuance_id,a.p_capability_hash,a.p_connection_id,a.p_native_generation])).rows[0].v;
    const isolated=async(name,fn)=>t.test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}});
    await isolated('missing or malformed credential never reaches SQL or upgrade',async()=>{
      for(const value of ['', 'wrong', SECRET+'x']){const h=harness(snap,rpc);const result=await h.handle(await h.request({'x-chilly-call-capability':value}));
        assert.equal(result.status,403);assert.equal(h.calls.length,0);assert.equal(h.upgraded(),0);}
    });
    await isolated('validly shaped wrong capability is denied by actual SQL before upgrade',async()=>{
      const h=harness(snap,rpc); assert.equal((await h.handle(await h.request({'x-chilly-call-capability':'Y'.repeat(43)}))).status,403);
      assert.equal(h.calls.length,1);assert.equal(h.upgraded(),0);
    });
    await isolated('capability from another local call binding is rejected before upgrade',async()=>{
      const h=harness(snap,rpc);assert.equal((await h.handle(await h.request({'x-chilly-call-binding':'f'.repeat(64)}))).status,403);assert.equal(h.upgraded(),0);
    });
    for(const [name,sql] of [
      ['revoked',`update user_voip_push_tokens set revoked_at=now()`],
      ['reassigned install',`update user_voip_push_tokens set install_id='other'`],
      ['replaced account',`update user_voip_push_tokens set account_id='${CALLER}'`],
      ['expired session',`update auth.sessions set not_after=now()-interval '1 second'`],
      ['expired issuance',`update ios_native_call_state_issuances set created_at=now()-interval '91 seconds',expires_at=now()-interval '1 second'; update chat_call_invites set expires_at=(select expires_at from ios_native_call_state_issuances)`],
    ]) await isolated(`${name} capability cannot upgrade`,async()=>{
      await db.exec(sql);const h=harness(snap,rpc);assert.equal((await h.handle(await h.request())).status,403);assert.equal(h.upgraded(),0);
    });
    await isolated('only bounded status/connection identifiers leave the server; revocation closes existing socket',async()=>{
      const h=harness(snap,rpc);assert.equal((await h.handle(await h.request())).status,101);await h.open();
      // Real PGlite crosses scheduling boundaries: synchronize on the actual
      // socket event, with a real-time hang guard independent of virtual clocks.
      await h.firstFrame();
      assert.deepEqual(h.frames,[{observerId:OBSERVER,connectionId:CONNECTION,nativeGeneration:GENERATION,sequence:1,status:'ringing'}]);
      await db.exec('update user_voip_push_tokens set revoked_at=now()');await h.timers.advance(1000);
      await h.closedEvent();
      assert.equal(h.frames.length,1);assert.equal(h.closed(),1);assert.equal(h.timers.count(),0);await h.stop();
    });
  } finally {await db.close();}
});

test('actual handler bounds closure and never emits an old or malformed response',async t=>{
  await t.test('worker lifetime registration failure closes owned socket and timers',async()=>{
    const h=harness(model(),undefined,true);
    assert.equal((await h.handle(await h.request())).status,503);
    assert.equal(h.closed(),1);assert.equal(h.timers.count(),0);assert.equal(h.frames.length,0);await h.stop();
  });
  for(const status of ['accepted','canceled','declined','missed','ended'])await t.test(`${status} sends one exact status then closes without a command`,async()=>{
    const s=model();s.status=status;const h=harness(s);assert.equal((await h.handle(await h.request())).status,101);await h.open();
    assert.equal(h.frames.length,1);assert.equal(h.frames[0].status,status);assert.equal(h.closed(),1);assert.equal(h.timers.count(),0);await h.stop();
  });
  await t.test('held pre-upgrade claim has two-second timeout and no upgrade after late success',async()=>{
    let release;const h=harness(model(),()=>new Promise(r=>{release=r;}));const result=h.handle(await h.request());await settle();await h.timers.advance(2000);
    assert.equal((await result).status,503);release(model());await settle();assert.equal(h.upgraded(),0);assert.equal(h.timers.count(),0);
  });
  await t.test('new connection retires old in-flight read and closure drops late terminal',async()=>{
    let release;let n=0;const s=model(),h=harness(s,()=>++n===1?s:new Promise(r=>{release=r;}));await h.handle(await h.request());await h.open();
    await h.stop();release({...s,status:'canceled'});await settle();assert.equal(h.frames.length,0);assert.equal(h.closed(),1);assert.equal(h.timers.count(),0);
    assert.equal(h.calls[1].signal.aborted,true);
  });
  await t.test('original deadline closes held read without requiring its promise to settle',async()=>{
    const s=model();s.expiresAt=new Date(Date.now()+1000).toISOString();let n=0;
    const h=harness(s,()=>++n===1?s:new Promise(()=>{}));await h.handle(await h.request());await h.open();await h.timers.advance(1000);
    assert.equal(h.closed(),1);assert.equal(h.final(),true);assert.equal(h.timers.count(),0);assert.equal(h.frames.length,0);
  });
  await t.test('three failed reads retire; no free-form error or fabricated terminal frame',async()=>{
    const s=model();let n=0;const h=harness(s,()=>{if(++n===1)return s;throw new Error('private token/account diagnostic');});
    await h.handle(await h.request());await h.open();await h.timers.advance(2000);assert.equal(h.closed(),1);assert.equal(h.frames.length,0);await h.stop();
  });
  await t.test('inbound payload immediately closes and cannot mutate a call',async()=>{
    const h=harness(model());await h.handle(await h.request());h.socket.onmessage({data:'{"status":"accepted"}'});await settle();
    assert.equal(h.calls.length,1);assert.equal(h.closed(),1);assert.equal(h.frames.length,0);await h.stop();
  });
  await t.test('malformed state or changed identity closes with no leaked fields',async()=>{
    for(const mutation of [{status:'secret-error'},{recipientInstallId:'other'},{inviteId:id(90)},{expiresAt:new Date(Date.now()+400000).toISOString()}]){
      const s=model();let n=0;const h=harness(s,()=>++n===1?s:{...s,...mutation});await h.handle(await h.request());await h.open();
      assert.equal(h.closed(),1);assert.equal(h.frames.length,0);await h.stop();}
  });
  await t.test('query capabilities and non-upgrade requests are refused before authentication',async()=>{
    const h=harness(model());const r=await h.request();assert.equal((await h.handle(new Request(r.url+'?secret=x',{headers:r.headers}))).status,400);
    assert.equal((await h.handle(new Request(r.url))).status,400);assert.equal(h.calls.length,0);assert.equal(h.upgraded(),0);
  });
  await t.test('socket never opening expires in eight seconds with bounded retained worker',async()=>{
    const h=harness(model());await h.handle(await h.request());await h.timers.advance(8000);assert.equal(h.closed(),1);assert.equal(h.final(),true);assert.equal(h.timers.count(),0);
  });
});
