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
  console.log('Run after local Supabase reset: node scripts/test-room-seat-auction-concurrency-postgres.mjs. SUPABASE_DB_CONTAINER may name a local supabase_db_* CLI container. Only generated disposable clone is written.');
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
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261030165913');",'postgres'),'t','full auction migration reset required');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create disposable clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only local source export');
  success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore clone');
  query(readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
  query("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
  const actors=JSON.parse(query("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
  const claims=(who,role='authenticated')=>`set local role ${role};set local request.jwt.claims=${literal(JSON.stringify({role,sub:actors[who].id,session_id:actors[who].session}))};set local request.headers='{"x-chillywood-platform":"ios"}';`;
  const call=(who,sql,role)=>`begin;${claims(who,role)}select ${sql};commit;`;
  const rpc=(who,sql)=>JSON.parse(query(call(who,sql)).split('\n').at(-1));
  const create=party=>`public.create_creator_room_seat_auction('${party}','stage_reserved_seat',100,25,now()+interval '1 hour',now()+interval '2 hours','test',gen_random_uuid(),(public.prepare_creator_room_seat_auction('${party}')->>'roomSessionId')::uuid)`;
  for(const party of ['RACE-STAGE','RACE-CAPACITY','RACE-CAPACITY-TWO']) query(`begin;${claims('creator')}
    insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
    values('${party}','${actors.creator.id}','live','open','open',true,'private');commit;`);
  const auction=rpc('creator',create('RACE-STAGE'));
  query(readFileSync('tests/fixtures/creator-external-payment-authority.sql','utf8'));
  const cap=query(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,platform,storefront,storefront_country,route_kind,currency,
    environment,payment_method,min_amount_minor,max_amount_minor,provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
    values('room_seat_auction','${actors.creator.id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
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
  const bid=(a,n,id=randomUUID())=>`public.place_creator_room_seat_auction_bid('${a.id}',${n},'${id}',null)`;
  await race('two equal room bids serialize; second denied','buyer1',bid(auction,100),'buyer2',bid(auction,100),'auction_bid_below_minimum');
  const request=randomUUID();
  await race('room duplicate bid commits once','buyer2',bid(auction,125,request),'buyer2',bid(auction,125,request));
  assert.equal(query(`select count(*) from private.creator_room_seat_auction_bids where auction_id='${auction.id}'`),'2');
  const promote=(party,who)=>`public.set_creator_room_participant_authority_service('${party}','${actors.creator.id}','${actors.creator.session}','${actors[who].id}','speaker',false,'active')`;
  for(const party of ['RACE-CAPACITY','RACE-CAPACITY-TWO']) {
    for(const who of ['buyer1','buyer2','buyer3'])rpc(who,`public.join_watch_party_room_session('${party}')`);
    for(const who of ['buyer1','buyer2'])query(call('creator',promote(party,who),'service_role'));
  }
  await race('reserved auction hold wins final guest slot against host approval','creator',create('RACE-CAPACITY'),
    'creator',promote('RACE-CAPACITY','buyer3'),'speaker_seats_full','service_role');
  await race('free host approval wins final guest slot against auction hold','creator',promote('RACE-CAPACITY-TWO','buyer3'),
    'creator',create('RACE-CAPACITY-TWO'),'room_seat_sold_out',undefined,'service_role');
  for(const party of ['RACE-CAPACITY','RACE-CAPACITY-TWO']) assert.equal(query(`select private.creator_room_seat_inventory('${party}','stage_reserved_seat')`),'4');
  // Ordinary native-priced Party Room admission and auction inventory share
  // the final slot before either buyer is sent to a payment provider.
  query("insert into public.titles(id,title,video_url,is_published,status) values('12121212-1212-4212-8212-121212121212','Synthetic room title','https://fixture.invalid/title.mp4',true,'published')");
  const partyOffers={};
  for(const party of ['RACE-PARTY','RACE-PARTY-TWO']) {
    query(`begin;${claims('creator')}insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
      values('${party}','12121212-1212-4212-8212-121212121212','${actors.creator.id}','title','open','party_pass',true,'private');commit;`);
    rpc('creator',`public.set_paid_watch_party_offer('${party}','Limited admission',99,1,'sandbox')`);
    partyOffers[party]=query(`select id from public.paid_watch_party_offers where party_id='${party}'`);
  }
  const partyAuction=party=>`public.create_creator_room_seat_auction('${party}','party_admission',100,25,now()+interval '1 hour',now()+interval '2 hours','test',gen_random_uuid(),(public.prepare_creator_room_seat_auction('${party}')->>'roomSessionId')::uuid)`;
  const partyNative=party=>`public.create_money_purchase_intent('watch_party_live_ticket_sandbox_099','watch_party_live','${partyOffers[party]}','{}')`;
  await race('Party auction hold wins final admission against native ticket','creator',partyAuction('RACE-PARTY'),
    'buyer1',partyNative('RACE-PARTY'),'room_admission_sold_out');
  await race('Party native ticket hold wins final admission against auction','buyer1',partyNative('RACE-PARTY-TWO'),
    'creator',partyAuction('RACE-PARTY-TWO'),'room_seat_sold_out');
  for(const party of ['RACE-PARTY','RACE-PARTY-TWO']) assert.equal(query(`select private.creator_room_seat_inventory('${party}','party_admission')`),'1');
  // Deterministic scheduling barrier mirrors the room/auction locks already
  // taken by checkout claim. The real binder must wait WITHOUT taking quote
  // first, otherwise the subsequent real claim recreates the opposite edge.
  query(`begin;${claims('creator')}insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
    values('RACE-BIND','${actors.creator.id}','live','open','open',true,'private');commit;`);
  const bindSetup=rpc('creator',"public.prepare_creator_room_seat_auction('RACE-BIND')");
  const bindAuction=rpc('creator',`public.create_creator_room_seat_auction('RACE-BIND','stage_reserved_seat',100,25,
    clock_timestamp()+interval '2 seconds',clock_timestamp()+interval '1 hour','test','${randomUUID()}','${bindSetup.roomSessionId}')`);
  rpc('buyer1',bid(bindAuction,100));await delay(2100);
  const bindQuote=rpc('buyer1',`public.create_creator_room_seat_auction_award_quote('${bindAuction.id}',null)`);
  const bindAttempt=randomUUID();
  const bindProduct=query(`insert into public.monetization_products(product_key,product_type,display_name,provider,
    provider_product_id,environment,status,is_android_digital,is_physical_good)
    values('room_bind_race_fixture','room_seat_pass','Synthetic race fixture','stripe_room_auction','prod_RaceBind',
      'sandbox','sandbox',false,false) returning id;`);
  query(`insert into private.creator_room_auction_product_bindings values('${cap}','${bindProduct}','synthetic fixture only',now())`);
  query(call('buyer1',`public.prepare_creator_room_auction_checkout('${bindQuote.id}','${actors.buyer1.id}','${actors.buyer1.session}','${bindAttempt}')`,'service_role'));
  const bindHolder=session('room-bind-claim-holder',`begin;
    select party_id from public.watch_party_rooms where party_id='RACE-BIND' for update;
    select id from private.creator_room_seat_auctions where id='${bindAuction.id}' for update;
    select 'HOLDER_READY';`);
  await until(()=>bindHolder.output().includes('HOLDER_READY'),'binder barrier held');
  const binder=session('room-bind-waiter',call('buyer1',`public.bind_creator_room_auction_checkout('${bindQuote.id}','${bindAttempt}',
    'cs_test_RaceBind','pi_RaceBind','acct_fixture',100,'usd')`,'service_role'));binder.child.stdin.end();
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name='room-bind-claim-holder'
    where w.datname=current_database() and w.application_name='room-bind-waiter' and w.wait_event_type='Lock'
      and h.pid=any(pg_blocking_pids(w.pid));`)==='1','binder waits behind production room/auction lock');
  bindHolder.child.stdin.end(`${claims('buyer1','service_role')}
    select public.claim_creator_room_auction_checkout('${bindQuote.id}','${actors.buyer1.id}','${actors.buyer1.session}','${bindAttempt}');commit;\n`);
  const holderResult=await bindHolder.done;assert.equal(holderResult.code,0,holderResult.stderr);
  const binderResult=await binder.done;assert.equal(binderResult.code,0,binderResult.stderr);
  assert.equal(query(`select provider_checkout_session_id from private.creator_room_auction_quotes where id='${bindQuote.id}'`),'cs_test_RaceBind');
  console.log(`ok ${++checks} - provider binder and checkout claim preserve room/auction/quote lock order`);
  assert.equal(query('select count(*) from public.access_grants'),'0','bids/holds never grant access');
  assert.equal(checks,7);console.log('Room auction native concurrency:7 observed production lock races passed; no provider operation.');
} finally {
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try {if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');}
  finally {restore.assertSourceUnchanged();}
}
