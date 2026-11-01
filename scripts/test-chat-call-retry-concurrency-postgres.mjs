#!/usr/bin/env node
// Independent native PostgreSQL backends in a generated LOCAL clone only.
// --fixture-preflight uses PGlite for SQL validity, never concurrency evidence.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {callRetryFixture, chatActivityConcurrencyFixture, callRetryMigration, callRetryRealtimeSink, literal} from '../tests/helpers/chat-call-retry-concurrency-fixture.mjs';

if (process.argv.includes('--help')) {
  console.log('After local Supabase reset, runs real lock schedules in a generated disposable clone. --fixture-preflight validates SQL with PGlite only. No remote URL accepted.');
  process.exit(0);
}
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--fixture-preflight'));
const jsonRows = output => output.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
if (process.argv[2] === '--fixture-preflight') {
  const {createDatabase} = await import('../tests/helpers/database-runtime-authority-fixture.mjs');
  const {db} = await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  const run = async sql => {
    try { return (await db.exec(`begin;${sql}commit;`)).flatMap(result => result.rows).at(-1); }
    catch (error) { await db.exec('rollback'); throw error; }
  };
  try {
    const f = callRetryFixture(1);
    await db.exec(f.setup);
    for (let serial = 1; serial <= 2; serial++) {
      await db.exec(f.room(serial));
      const invite = (await run(f.begin(serial))).begin_chilly_chat_call.invite;
      await run(f.transition(invite.id, f.caller, 'canceled'));
    }
    await db.exec(f.room(3) + f.room(4));
    const start = (await run(f.begin(3))).begin_chilly_chat_call;
    const reuse = (await run(f.begin(4))).begin_chilly_chat_call;
    assert.equal(reuse.invite.id, start.invite.id); assert.equal(reuse.created, false);
    assert.equal(Number((await db.query(f.ledger)).rows[0].count), 3);
    await run(f.transition(start.invite.id, f.callee, 'accepted'));
    await run(f.transition(start.invite.id, f.caller, 'ended'));
    await db.exec(f.room(5));
    const retry = (await run(f.begin(5))).begin_chilly_chat_call;
    await run(f.transition(retry.invite.id, f.caller, 'canceled'));
    // Separate actors keep this call-budget fixture below the independent
    // five-room-creation/ten-minute infrastructure limit; never relax that guard.
    const canceled = callRetryFixture(2);
    await db.exec(canceled.setup);
    for (let serial = 1; serial <= 3; serial++) {
      await db.exec(canceled.room(serial));
      const invite = (await run(canceled.begin(serial))).begin_chilly_chat_call.invite;
      await run(canceled.transition(invite.id, canceled.caller, 'canceled'));
    }
    await db.exec(canceled.room(4));
    await assert.rejects(run(canceled.begin(4)), /rate_limited/);
    const activity=chatActivityConcurrencyFixture(31);await db.exec(activity.setup);
    await run(activity.message(1));
    const cut=(await run(activity.cut)).jsonb_build_object.cut;
    await run(activity.message(2));await run(activity.mark(cut));
    assert.deepEqual((await db.query(activity.member)).rows[0].jsonb_build_object,{messages:1,calls:0});
    const expired=chatActivityConcurrencyFixture(32);await db.exec(expired.setup+expired.expired);
    await run(expired.expire);
    assert.equal((await db.query(`select status from public.chat_call_invites where id='${expired.expiredInvite}'`)).rows[0].status,'missed');
    assert.equal((await run(expired.atomic(2))).start_chilly_chat_call.created,true);
    console.log('Call retry fixture SQL preflight PASS; independent native concurrency NOT RUN.');
  } finally { await db.close(); }
  process.exit(0);
}

const project = readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/mu)?.[1];
assert.ok(project);
const container = process.env.SUPABASE_DB_CONTAINER ?? `supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database = `runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_call_retry`;
const restore = createBrandGuardCloneRestorer({container});
const args = (db = database) => ['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const docker = (a,input,encoding='utf8') => spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success = (r,label) => {assert.equal(r.status,0,`${label}: ${r.error?.message ?? r.stderr ?? ''}`);return r.stdout;};
const query = (sql,db=database) => success(docker(args(db),`${db==='postgres'?'set default_transaction_read_only=on;':''}set statement_timeout='20s';set time zone 'UTC';${sql}`),'local fixture query').trim();
const admin = (a,input,encoding='utf8') => docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','call-retry-fixture-admin',...a],input,encoding);
const sessions = new Set();
function session(name,sql,finish=false) {
  const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);child.stdin.on('error',()=>{});
  const done=new Promise(resolve=>{child.on('error',error=>resolve({code:-1,stdout,stderr:error.message}));child.on('close',code=>resolve({code,stdout,stderr}));});
  const s={child,done,output:()=>stdout,name};sessions.add(s);
  child.stdin.write(`set application_name=${literal(name)};begin isolation level read committed;set local statement_timeout='35s';set local idle_in_transaction_session_timeout='45s';${sql}\n`);
  if(finish)child.stdin.end('commit;\n\\q\n');
  return s;
}
async function until(predicate,label,peers) {
  const deadline=Date.now()+20000;
  while(Date.now()<deadline) {
    if(predicate())return;
    for(const s of peers)if(s.child.exitCode!==null)throw Error(`${label}: session exited: ${(await s.done).stderr}`);
    await delay(25);
  }
  throw Error(`Timed out observing ${label}`);
}
let checks=0,cloned=false,sourceFingerprint;
const fingerprintSql = `select jsonb_build_object(
  'users',(select count(*) from auth.users),
  'calls',(select count(*) from public.chat_call_invites),
  'rooms',(select count(*) from public.communication_rooms),
  'ledger',(select count(*) from public.abuse_rate_limit_events),
  'receipts',(select count(*) from public.chat_call_transition_deliveries))::text;`;
async function race(label,first,second,{reject=false,rollback=false,holderAfterQueue=''}={}) {
  const holder=session(`call-retry-holder-${process.pid}-${checks}`,`${first}select 'HOLDER_READY';`);
  await until(()=>holder.output().includes('HOLDER_READY'),'holder ready',[holder]);
  const waiter=session(`call-retry-waiter-${process.pid}-${checks}`,second,true);
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${literal(holder.name)}
    where w.datname=current_database() and w.application_name=${literal(waiter.name)} and w.wait_event_type='Lock'
      and h.pid=any(pg_blocking_pids(w.pid));`)==='1','independent backend lock edge',[holder,waiter]);
  holder.child.stdin.end(`${holderAfterQueue}\n${rollback?'rollback':'commit'};\n\\q\n`);
  const [a,b]=await Promise.all([holder.done,waiter.done]);sessions.delete(holder);sessions.delete(waiter);
  assert.equal(a.code,0,a.stderr);
  if(reject){assert.notEqual(b.code,0);assert.match(b.stderr,/rate_limited/);}else assert.equal(b.code,0,b.stderr);
  console.log(`ok ${++checks} - ${label}`);return [jsonRows(a.stdout).at(-1),jsonRows(b.stdout).at(-1)];
}
try {
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
  assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
  assert.ok(success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'local CLI discovery').split('\n').includes(container));
  assert.equal(query(`select exists(select 1 from supabase_migrations.schema_migrations where version='${callRetryMigration}');`,'postgres'),'t','full migrated local template required');
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261031205522');",'postgres'),'t','activity ordering migration required');
  sourceFingerprint=query(fingerprintSql,'postgres');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create generated clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only template export');
  success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore isolated clone');
  query(callRetryRealtimeSink);
  const run=sql=>jsonRows(query(`begin;${sql}commit;`)).at(-1);
  async function fixture(n,{candidates=true}={}) {
    const f=callRetryFixture(n);query(f.setup);
    for(let serial=1;serial<=2;serial++) {query(f.room(serial));const invite=run(f.begin(serial)).invite;run(f.transition(invite.id,f.caller,'canceled'));}
    if(candidates)query(f.room(3)+f.room(4));return f;
  }
  const reuse=await fixture(1);
  const [winner,loser]=await race('simultaneous starts reuse one invite and charge once',reuse.begin(3),reuse.begin(4));
  assert.equal(winner.created,true);assert.equal(loser.created,false);assert.equal(loser.invite.id,winner.invite.id);
  assert.equal(query(reuse.ledger),'3');
  query(reuse.room(5));
  const [,retry]=await race('callee acceptance plus End releases exactly one completed-call slot',
    reuse.transition(winner.invite.id,reuse.callee,'accepted')+reuse.transition(winner.invite.id,reuse.caller,'ended'),reuse.begin(5));
  assert.equal(retry.created,true);assert.equal(query(reuse.ledger),'4','completed event is retained');
  run(reuse.transition(retry.invite.id,reuse.caller,'canceled'));
  const cancel=await fixture(2);
  await race('committed third caller cancellation cannot admit a fourth ring',cancel.begin(3)+cancel.cancelLatest,cancel.begin(4),{reject:true});
  assert.equal(query(cancel.ledger),'3');
  const rolled=await fixture(3);
  const [,afterRollback]=await race('rolled-back invitation does not consume a budget slot',rolled.begin(3),rolled.begin(4),{rollback:true});
  assert.equal(afterRollback.created,true);assert.equal(query(rolled.ledger),'3');
  const atomic=await fixture(4,{candidates:false});
  const [atomicWinner,atomicReuse]=await race('atomic competing starts allocate one room and one invitation',atomic.atomic(3),atomic.atomic(4));
  assert.equal(atomicWinner.created,true);assert.equal(atomicReuse.created,false);assert.equal(atomicWinner.invite.id,atomicReuse.invite.id);
  assert.equal(query(atomic.ledger),'3');
  assert.equal(query(`select count(*) from public.communication_rooms where host_user_id='${atomic.caller}'`),'3');
  const rejection=await fixture(5,{candidates:false});
  await race('atomic rejected waiter rolls back room and room rate event',rejection.atomic(3)+rejection.cancelLatest,rejection.atomic(4),{reject:true});
  assert.equal(query(rejection.ledger),'3');
  assert.equal(query(`select count(*) from public.communication_rooms where host_user_id='${rejection.caller}'`),'3');
  assert.equal(query(`select count(*) from public.abuse_rate_limit_events where actor_user_id='${rejection.caller}' and action_key='communication_room_create'`),'3');
  assert.equal(query(`select count(*) from private.chat_call_start_requests where candidate_room_id='RETRY5X4'`),'0');
  const activity=chatActivityConcurrencyFixture(31);query(activity.setup);run(activity.message(1));
  const [observedCut,sent]=await race('reader cut holds thread before queued message admission',activity.cut,activity.message(2));
  assert.ok(Date.parse(sent.createdAt)>=Date.parse(observedCut.cut));
  assert.equal(query(`select created_at>${literal(observedCut.cut)}::timestamptz from public.chat_messages where id=${literal(sent.id)}`),'t','queued message must be strictly beyond fixed cut, including microseconds');
  run(activity.mark(observedCut.cut));
  assert.deepEqual(JSON.parse(query(activity.member)),{messages:1,calls:0},'old cut acknowledges only observed message stream');
  const readCut=run(activity.cut).cut;
  const [newest]=await race('sender insert holds thread before old-cut read acknowledgement',activity.message(3),activity.mark(readCut));
  assert.equal(query(`select created_at>${literal(readCut)}::timestamptz from public.chat_messages where id=${literal(newest.id)}`),'t');
  assert.deepEqual(JSON.parse(query(activity.member)),{messages:1,calls:0},'queued reader must not acknowledge the unseen message');
  run(activity.mark(run(activity.cut).cut));
  assert.deepEqual(JSON.parse(query(activity.member)),{messages:0,calls:0});

  const accepting=chatActivityConcurrencyFixture(33);query(accepting.setup);
  const ringing=run(accepting.atomic(1));
  const [sameCall,accepted]=await race('Start thread ownership cannot deadlock queued acceptance on invite ownership',
    accepting.cut,accepting.transition(ringing.invite.id,accepting.callee,'accepted'),{holderAfterQueue:accepting.atomic(2)});
  assert.equal(sameCall.invite.id,ringing.invite.id);assert.equal(sameCall.created,false);
  assert.equal(accepted.invite?.status??query(`select status from public.chat_call_invites where id='${ringing.invite.id}'`),'accepted');
  assert.equal(query(`select count(*) from public.communication_rooms where host_user_id='${accepting.caller}'`),'1');

  // The expiry worker is global. Retire prior synthetic ringing fixtures
  // through the real lifecycle RPC before testing its selection, even on CI
  // slow enough to cross their original 45-second deadlines.
  run(rolled.transition(afterRollback.invite.id,rolled.caller,'canceled'));
  run(atomic.transition(atomicWinner.invite.id,atomic.caller,'canceled'));
  assert.equal(query("select count(*) from public.chat_call_invites where status='ringing' and expires_at<=clock_timestamp()"),'0','expiry schedule requires no unrelated eligible fixture');
  const expiring=chatActivityConcurrencyFixture(34);query(expiring.setup+expiring.expired);
  const [,fresh]=await race('expiry terminal transition holds thread before fresh Start',expiring.expire,expiring.atomic(2));
  assert.equal(query(`select status from public.chat_call_invites where id='${expiring.expiredInvite}'`),'missed');
  assert.equal(fresh.created,true);assert.notEqual(fresh.invite.id,expiring.expiredInvite);
  assert.equal(query(`select active_communication_room_id from public.chat_threads where id='${expiring.thread}'`),fresh.invite.communication_room_id);
  run(expiring.transition(fresh.invite.id,expiring.caller,'canceled'));

  // SKIP LOCKED has no waiter by design: hold the actual cut lock, execute the
  // worker in another backend, and prove it did not mutate the locked invite.
  const skipped=chatActivityConcurrencyFixture(35);query(skipped.setup+skipped.expired);
  const available=chatActivityConcurrencyFixture(36);query(available.setup+available.expired);
  const busy=session(`call-expiry-skip-${process.pid}`,`${skipped.cut}select 'HOLDER_READY';`);
  await until(()=>busy.output().includes('HOLDER_READY'),'expiry skip holder ready',[busy]);
  run(skipped.expireOne);
  assert.equal(query(`select status from public.chat_call_invites where id='${skipped.expiredInvite}'`),'ringing','expiry skips rather than taking invite before thread');
  assert.equal(query(`select status from public.chat_call_invites where id='${available.expiredInvite}'`),'missed','limit one counts an available thread, not the oldest busy thread');
  busy.child.stdin.end('commit;\n\\q\n');const released=await busy.done;sessions.delete(busy);assert.equal(released.code,0,released.stderr);
  run(skipped.expire);assert.equal(query(`select status from public.chat_call_invites where id='${skipped.expiredInvite}'`),'missed');
  assert.equal(checks,10);
  assert.ok(Number(query('select count(*) from realtime.fixture_outbox'))>0,'production invalidation triggers exercised the clone-local transport sink');
  assert.equal(query("select count(*) from realtime.fixture_outbox where payload<>'{}'::jsonb or event<>'state:update' or topic not like 'comm-room-%' or private is distinct from true"),'0','invalidation hints remain private and contain no row payload');
  console.log('Call retry/activity native concurrency PASS: 10 observed PostgreSQL lock schedules plus expired-call SKIP LOCKED; no calls or notifications dispatched.');
} finally {
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try {if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');}
  finally {
    restore.assertSourceUnchanged();
    if(sourceFingerprint!==undefined)assert.equal(query(fingerprintSql,'postgres'),sourceFingerprint,'local template call/account ledger counts unchanged');
  }
}
