#!/usr/bin/env node
// Real backends in an owned disposable clone of a local reset Supabase DB.
// No remote endpoints, provider calls, altered production functions or Mac.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';

if(process.argv.includes('--help')) {
  console.log('Run after local Supabase reset: node scripts/test-event-auction-concurrency-postgres.mjs. SUPABASE_DB_CONTAINER may name a local supabase_db_* CLI container. Only generated disposable clone is written.');
  process.exit(0);
}
assert.equal(process.argv.length,2,'no remote URL or positional arguments accepted');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/mu)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_auction`;
const restore=createBrandGuardCloneRestorer({container});
const literal=x=>`'${String(x).replaceAll("'","''")}'`;
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';set time zone 'UTC';${sql}`),'fixture query').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','auction-fixture-admin',...a],input,encoding);
const sessions=[];
function session(name,sql) {
  const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
  child.stdin.write(`set application_name=${literal(name)};set statement_timeout='30s';set time zone 'UTC';${sql}\n`);
  const s={child,done,output:()=>stdout,name};sessions.push(s);return s;
}
async function until(predicate,label){const deadline=Date.now()+20000;while(Date.now()<deadline){if(predicate())return;await delay(25);}throw Error(`queue timeout: ${label}`);}
let cloned=false;
try {
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
  assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
  const containers=success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n');
  assert.ok(containers.includes(container));
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261030155931');",'postgres'),'t','full auction migration reset required');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create disposable clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only local source export');
  success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore clone');
  query(readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
  query("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
  const actors=JSON.parse(query("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
  const events=JSON.parse(query('select jsonb_object_agg(name,id) from event_reservation_fixture.events'));
  const claims=(who,role='authenticated')=>`set local role ${role};set local request.jwt.claims=${literal(JSON.stringify({role,sub:actors[who].id,session_id:actors[who].session}))};set local request.headers='{"x-chillywood-platform":"ios"}';`;
  const call=(who,sql,role)=>`begin;${claims(who,role)}select ${sql};commit;`;
  const rpc=(who,sql)=>JSON.parse(query(call(who,sql)).split('\n').at(-1));
  const configure=name=>rpc('creator',`public.configure_paid_creator_event_sale('${events[name]}','One virtual ticket',99,1,'sandbox','UTC',now()-interval '1 hour',now()+interval '1 day')`);
  const create=(name,o)=>`public.create_creator_event_auction('${events[name]}','${o.termsRevisionId}',100,25,now()+interval '1 hour',now()+interval '2 hours','test')`;
  const offer=configure('show1');const auction=rpc('creator',create('show1',offer));
  query(readFileSync('tests/fixtures/creator-external-payment-authority.sql','utf8'));
  const cap=query(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,platform,storefront,storefront_country,route_kind,currency,
    environment,payment_method,min_amount_minor,max_amount_minor,provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
    values('event_auction','${actors.creator.id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
    'synthetic fixture','synthetic fixture',now()-interval '1 minute',now()+interval '1 hour',true) returning id;`);
  query(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
    select '${cap}',user_id,session_id,'synthetic fixture',now()-interval '1 minute',now()+interval '10 minutes'
    from event_reservation_fixture.actors where kind like 'buyer%';`);
  let checks=0;
  async function race(label,holderActor,holderCall,waiterActor,waiterCall,expectedError,waiterRole,holderRole) {
    const holder=session(`auction-holder-${checks}`,`begin;${claims(holderActor,holderRole)}select ${holderCall};select 'HOLDER_READY';`);
    await until(()=>holder.output().includes('HOLDER_READY'),`${label}: holder`);
    const waiter=session(`auction-waiter-${checks}`,call(waiterActor,waiterCall,waiterRole));waiter.child.stdin.end();
    await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${literal(holder.name)}
      where w.datname=current_database() and w.application_name=${literal(waiter.name)} and w.wait_event_type='Lock'
      and h.pid=any(pg_blocking_pids(w.pid));`)==='1',`${label}: observed lock`);
    holder.child.stdin.end('commit;\n');assert.equal((await holder.done).code,0);
    const result=await waiter.done;
    if(expectedError){assert.notEqual(result.code,0);assert.match(result.stderr,new RegExp(expectedError));}
    else assert.equal(result.code,0,result.stderr);
    console.log(`ok ${++checks} - ${label}`);
  }
  const bid=(a,n,id=randomUUID())=>`public.place_creator_event_auction_bid('${a.id}',${n},'${id}',null)`;
  await race('two equal bids serialize; second is rejected','buyer1',bid(auction,100),'buyer2',bid(auction,100),'auction_bid_below_minimum');
  assert.equal(query(`select count(*) from private.creator_event_auction_bids where auction_id='${auction.id}'`),'1');
  const request=randomUUID();
  await race('duplicate request commits exactly one increment','buyer2',bid(auction,125,request),'buyer2',bid(auction,125,request));
  assert.equal(query(`select count(*) from private.creator_event_auction_bids where auction_id='${auction.id}'`),'2');
  const o2=configure('show2');
  await race('auction hold beats competing fixed-price final ticket','creator',create('show2',o2),'buyer1',
    `public.create_reserved_creator_event_purchase_intent('${o2.id}','${o2.termsRevisionId}')`,'event_sold_out');
  const o3=configure('show3');
  await race('fixed-price hold beats competing auction final ticket','buyer1',
    `public.create_reserved_creator_event_purchase_intent('${o3.id}','${o3.termsRevisionId}')`,'creator',create('show3',o3),'event_sold_out');
  for(const name of ['show1','show2','show3'])assert.equal(query(`select public.event_ticket_inventory_internal('${events[name]}')`),'1');
  const o4=configure('show4');
  const short=rpc('creator',`public.create_creator_event_auction('${events.show4}','${o4.termsRevisionId}',100,25,clock_timestamp()+interval '10 seconds',now()+interval '2 hours','test')`);
  const capHolder=session('auction-capability-holder',`begin;select id from private.creator_external_payment_capabilities where id='${cap}' for update;select 'HOLDER_READY';`);
  await until(()=>capHolder.output().includes('HOLDER_READY'),'capability evidence lock');
  const lateBid=session('auction-capability-waiter',call('buyer1',bid(short,100)));lateBid.child.stdin.end();
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name='auction-capability-holder'
    where w.datname=current_database() and w.application_name='auction-capability-waiter' and w.wait_event_type='Lock'
    and h.pid=any(pg_blocking_pids(w.pid));`)==='1','bid waits for trusted capability evidence');
  await delay(Math.max(0,Date.parse(short.closesAt)-Date.now())+50);
  capHolder.child.stdin.end('commit;\n');assert.equal((await capHolder.done).code,0);
  const late=await lateBid.done;assert.notEqual(late.code,0);assert.match(late.stderr,/auction_bidding_closed/);
  assert.equal(query(`select count(*) from private.creator_event_auction_bids where auction_id='${short.id}'`),'0');
  console.log(`ok ${++checks} - capability wait cannot admit a bid after hard close`);
  const o5=configure('show5');
  const recover=rpc('creator',`public.create_creator_event_auction('${events.show5}','${o5.termsRevisionId}',100,25,clock_timestamp()+interval '3 seconds',now()+interval '2 hours','test')`);
  rpc('buyer1',bid(recover,100));
  await delay(Math.max(0,Date.parse(recover.closesAt)-Date.now())+50);
  const original=rpc('buyer1',`public.create_creator_event_auction_award_quote('${recover.id}',null)`);
  actors.buyer1new={...actors.buyer1,session:randomUUID()};
  query(`insert into auth.sessions(id,user_id) values('${actors.buyer1new.session}','${actors.buyer1.id}');
    insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select '${actors.buyer1.id}',public.wave1_sha256('${actors.buyer1.id}'),document_key,version,market,'member',capability,
      '${actors.buyer1new.session}','service_reconciliation' from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account';
    insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
    values('${cap}','${actors.buyer1.id}','${actors.buyer1new.session}','synthetic refreshed login',now()-interval '1 minute',now()+interval '10 minutes');`);
  await race('new-login quote replacement fences queued old-login dispatch','buyer1new',
    `public.create_creator_event_auction_award_quote('${recover.id}',null)`,'buyer1',
    `public.claim_creator_event_auction_checkout('${original.id}','${actors.buyer1.id}','${actors.buyer1.session}','${randomUUID()}')`,
    'auction_quote_superseded','service_role');
  assert.equal(query(`select count(*) from private.creator_event_auction_quotes where auction_id='${recover.id}'`),'2','obsolete quote retained');
  assert.equal(query(`select count(*) from private.creator_event_auction_quotes where auction_id='${recover.id}' and superseded_at is null`),'1');
  assert.equal(query(`select count(*) from private.creator_event_auction_quotes where auction_id='${recover.id}' and checkout_attempt_id is not null`),'0','queued obsolete claim cannot dispatch');
  const o6=configure('show6');
  const started=rpc('creator',`public.create_creator_event_auction('${events.show6}','${o6.termsRevisionId}',100,25,clock_timestamp()+interval '3 seconds',now()+interval '2 hours','test')`);
  rpc('buyer1',bid(started,100));await delay(Math.max(0,Date.parse(started.closesAt)-Date.now())+50);
  const startedQuote=rpc('buyer1',`public.create_creator_event_auction_award_quote('${started.id}',null)`);
  await race('started dispatch fences queued new-login quote replacement','buyer1',
    `public.claim_creator_event_auction_checkout('${startedQuote.id}','${actors.buyer1.id}','${actors.buyer1.session}','${randomUUID()}')`,
    'buyer1new',`public.create_creator_event_auction_award_quote('${started.id}',null)`,
    'auction_quote_session_changed',undefined,'service_role');
  assert.equal(query(`select count(*) from private.creator_event_auction_quotes where auction_id='${started.id}'`),'1');
  assert.equal(query(`select count(*) from private.creator_event_auction_quotes where auction_id='${started.id}' and checkout_attempt_id is not null and superseded_at is null`),'1');
  assert.equal(query('select count(*) from public.access_grants where source_id in(select id from event_reservation_fixture.events)'),'0','bids/holds never grant access');
  assert.equal(checks,7);console.log('Auction native concurrency: 7 observed production lock races passed; no provider or live money operation.');
} finally {
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try {if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');}
  finally {restore.assertSourceUnchanged();}
}
