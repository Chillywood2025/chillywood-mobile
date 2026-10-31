#!/usr/bin/env node
// Native contention proof ONLY in an owned disposable clone of a local CLI DB.
// Synthetic carrier/payment facts; no HTTP, credential provisioning or payouts.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';

if(process.argv.includes('--help')){
  console.log('Run after local Supabase reset. Writes only a generated local clone. No remote URLs or provider calls.');process.exit(0);
}
assert.equal(process.argv.length,2);
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/mu)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_merch_tracking`;
const restore=createBrandGuardCloneRestorer({container});
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const json=x=>`${lit(JSON.stringify(x))}::jsonb`;
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';set time zone 'UTC';${sql}`),'fixture query').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc',
  'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','merch-tracking-fixture-admin',...a],input,encoding);
const sessions=[];let serial=0,checks=0;
function session(sql){
  const name=`merch-tracking-${++serial}`;
  const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
  child.stdin.write(`set application_name=${lit(name)};set statement_timeout='30s';set time zone 'UTC';${sql}\n`);
  const s={child,done,output:()=>stdout,name};sessions.push(s);return s;
}
async function until(predicate,label){const deadline=Date.now()+20000;while(Date.now()<deadline){if(predicate())return;await delay(25);}throw Error(label);}
const parsed=s=>JSON.parse(s.trim().split('\n').findLast(line=>line.startsWith('{')||line.startsWith('[')));
let cloned=false;
try{
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
  assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
  assert.ok(success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n').includes(container));
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261030202330');",'postgres'),'t','reset must include tracking migration');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create owned clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only local source export');
  success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore owned clone');
  query(readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
  const actors=JSON.parse(query("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
  const auth=(who='creator',role='authenticated')=>`set local role ${role};set local request.jwt.claims=${json({role,sub:actors[who].id,session_id:actors[who].session}).replace(/::jsonb$/u,'')};set local request.headers='{"x-chillywood-platform":"ios"}';`;
  const tx=(sql,role='service_role',who='creator')=>`begin;${auth(who,role)}select ${sql};commit;`;
  const rpc=(sql,role='service_role',who='creator')=>parsed(query(tx(sql,role,who)));
  async function race(label,first,second,{error}={}){
    const holder=session(`begin;${first}select 'HOLDER_READY';`);
    await until(()=>holder.output().includes('HOLDER_READY'),`${label}: holder not ready`);
    const waiter=session(`begin;${second}commit;`);waiter.child.stdin.end();
    await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(holder.name)}
      where h.datname=current_database() and w.datname=current_database() and w.application_name=${lit(waiter.name)}
       and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1',`${label}: no actual blocking edge`);
    const evidence=JSON.parse(query(`select jsonb_build_object('holderPid',h.pid,'waiterPid',w.pid,'waitEvent',w.wait_event,
      'blockers',pg_blocking_pids(w.pid)) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(holder.name)}
      where h.datname=current_database() and w.datname=current_database() and w.application_name=${lit(waiter.name)}`));
    assert.notEqual(evidence.holderPid,evidence.waiterPid);assert.ok(evidence.blockers.includes(evidence.holderPid));
    console.log(JSON.stringify({schedule:label,...evidence}));
    holder.child.stdin.end('commit;\n');const a=await holder.done;assert.equal(a.code,0,a.stderr);
    const b=await waiter.done;if(error){assert.notEqual(b.code,0);assert.match(b.stderr,error);}else assert.equal(b.code,0,b.stderr);
    console.log(`ok ${++checks} - ${label}`);return b;
  }
  const product=randomUUID(),creator=actors.creator.id,buyer=actors.buyer1.id;
  query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,
    environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
    values('${product}','${creator}','Concurrency fixture','Concurrency fixture','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,'tracked');`);
  const paid=Math.floor(Date.now()/1000)-35*86400;
  function make(){
    const id=randomUUID(),suffix=id.replaceAll('-',''),pi=`pi_${suffix}`,cs=`cs_test_${suffix}`;
    query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,
      amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id,created_at)
      values('${id}','${product}','${buyer}','${creator}','stripe_physical_goods','sandbox','pending','not_started','pending',1000,1000,'usd','${cs}','${pi}',clock_timestamp()-interval '40 days');`);
    const facts={event_livemode:false,object_livemode:false,event_account_id:null,metadata_order_id:id,payment_intent_id:pi,
      amount_minor:1000,currency:'usd',metadata_environment:'sandbox',metadata_rail:'physical_merch'};
    assert.equal(rpc(`public.process_stripe_merch_webhook_lifecycle('evt_ck_${suffix}','checkout.session.completed','${'a'.repeat(64)}',${json({...facts,object_id:cs,object_type:'checkout.session',mode:'payment',status:'complete',payment_status:'paid',client_reference_id:id,shipping_country:'US',shipping_postal_code:'12345'})})`).reason,'payment_confirmed');
    assert.equal(rpc(`public.process_stripe_merch_webhook_lifecycle('evt_pi_${suffix}','payment_intent.succeeded','${'b'.repeat(64)}',${json({...facts,object_id:pi,object_type:'payment_intent',status:'succeeded',amount_received_minor:1000,event_created_seconds:paid})})`).reason,'payment_confirmed');
    return id;
  }
  const firstOrder=make(),secondOrder=make(),number='CONCURRENT123456';
  const assign=id=>`public.assign_merch_tracking('${id}','usps','${number}')`;
  await race('two orders cannot share carrier and tracking identity',`${auth()}select ${assign(firstOrder)};`,`${auth()}select ${assign(secondOrder)};`,{error:/merch_tracking_reused/u});
  assert.equal(query(`select count(*) from private.merch_tracking_assignments where carrier='usps' and tracking_number='${number}'`),'1');
  assert.equal(query(`select count(*) from private.merch_tracking_assignments where order_id='${secondOrder}'`),'0');
  const assignment=query(`select id from private.merch_tracking_assignments where order_id='${firstOrder}'`);
  const denied=docker(args(),tx(assign(firstOrder),'authenticated','buyer1'));assert.notEqual(denied.status,0);assert.match(denied.stderr,/merch_tracking_order_unavailable/u);
  const wrongSession=docker(args(),`begin;set local role authenticated;set local request.jwt.claims=${lit(JSON.stringify({role:'authenticated',sub:creator,session_id:actors.buyer1.session}))};select ${assign(firstOrder)};commit;`);
  assert.notEqual(wrongSession.status,0);assert.match(wrongSession.stderr,/merch_tracking_order_unavailable/u);
  // Synthetic qualification exists ONLY in this generated clone, never source DB.
  query(`insert into private.merch_tracking_qualification values(true,true,'SYNTHETIC native fixture',clock_timestamp()+interval '1 day');
    insert into private.merch_tracking_accounts values('${creator}','managed_native_fixture',true,'SYNTHETIC native fixture',clock_timestamp()+interval '1 day');`);
  const holder=session(`begin;${auth('creator','service_role')}select public.claim_merch_tracking_jobs(1);select 'CLAIM_READY';`);
  await until(()=>holder.output().includes('CLAIM_READY'),'first claim not ready');
  const claimed=parsed(holder.output());assert.equal(claimed.length,1);assert.equal(claimed[0].id,assignment);
  const peer=session(`begin;${auth('creator','service_role')}select jsonb_build_object('workerPid',pg_backend_pid());select public.claim_merch_tracking_jobs(1);commit;`);peer.child.stdin.end();const peerResult=await peer.done;
  assert.equal(peerResult.code,0,peerResult.stderr);assert.deepEqual(parsed(peerResult.stdout),[],'SKIP LOCKED must not hand same assignment to peer');
  const owner=JSON.parse(query(`select jsonb_build_object('pid',pid,'transactionOpen',xact_start is not null,'state',state)
    from pg_stat_activity where datname=current_database() and application_name=${lit(holder.name)}`));
  assert.equal(owner.transactionOpen,true);assert.match(owner.state,/idle in transaction/u);
  const peerPid=JSON.parse(peerResult.stdout.trim().split('\n').find(line=>line.startsWith('{'))).workerPid;
  assert.notEqual(peerPid,owner.pid);
  console.log(JSON.stringify({schedule:'worker SKIP LOCKED exclusion',...owner,peerPid,peerClaimCount:0}));
  holder.child.stdin.end('commit;\n');const holderResult=await holder.done;assert.equal(holderResult.code,0,holderResult.stderr);checks++;
  const lease=claimed[0].lease;
  assert.deepEqual(rpc('public.claim_merch_tracking_jobs(1)'),[],'committed unexpired lease remains exclusive');
  const hint=`public.receive_merch_tracking_hint('${'c'.repeat(64)}','usps','${number}')`;
  const duplicate=await race('duplicate durable inbox insertion',`${auth('creator','service_role')}select ${hint};`,`${auth('creator','service_role')}select ${hint};`);
  assert.equal(parsed(duplicate.stdout).duplicate,true);assert.equal(query(`select count(*) from private.merch_tracking_inbox where assignment_id='${assignment}'`),'1');
  const facts={status:'DELIVERED',status_date:new Date((paid+4*86400)*1000).toISOString(),first_event_at:new Date((paid+86400)*1000).toISOString(),
    carrier:'usps',tracking_number:number,test:true,destination_zip:'12345',destination_country:'US',review_reason:null,payload_hash:'d'.repeat(64)};
  const finish=(token,patch={})=>`public.complete_merch_tracking_job('${assignment}',${token?lit(token):'null'},${json({...facts,...patch})},true)`;
  assert.equal(rpc(finish(null)).stale,true);
  const collision=await race('same lease delivery versus revoked snapshot serializes once',`${auth('creator','service_role')}select ${finish(lease)};`,`${auth('creator','service_role')}select ${finish(lease,{status:'RETURNED'})};`);
  assert.equal(parsed(collision.stdout).stale,true);assert.equal(rpc(finish(lease)).stale,true,'replay cannot mutate evidence');
  assert.equal(query(`select count(*) from private.merch_tracking_observations where assignment_id='${assignment}'`),'1');
  assert.equal(query(`select delivery_state from private.merch_return_evidence where order_id='${firstOrder}' order by id desc limit 1`),'verified');
  query(`update private.merch_tracking_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where assignment_id='${assignment}';`);
  const newer=rpc('public.claim_merch_tracking_jobs(1)')[0];assert.ok(newer);assert.notEqual(newer.lease,lease);
  // An actual order-row blocking edge forces the worker to observe the committed
  // qualification expiry. No production function or trigger is replaced.
  const expiry=await race('qualification expires before blocked completion',
    `select id from public.merch_orders where id='${firstOrder}' for update;update private.merch_tracking_qualification set valid_until=clock_timestamp()-interval '1 second';`,
    `${auth('creator','service_role')}select ${finish(newer.lease)};`);
  assert.equal(parsed(expiry.stdout).confidence,'unverified');
  assert.equal(query(`select delivery_state from private.merch_return_evidence where order_id='${firstOrder}' order by id desc limit 1`),'revoked');
  assert.equal(query(`select count(*) from private.merch_tracking_observations where assignment_id='${assignment}'`),'2');
  assert.equal(rpc(finish(newer.lease)).stale,true);assert.equal(rpc(finish(null)).stale,true);
  query(`update private.merch_tracking_qualification set valid_until=clock_timestamp()+interval '1 day';
    update private.merch_tracking_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where assignment_id='${assignment}';`);
  const expired=rpc('public.claim_merch_tracking_jobs(1)')[0];assert.ok(expired);
  query(`update private.merch_tracking_jobs set lease_until=clock_timestamp()-interval '1 second' where assignment_id='${assignment}';`);
  assert.equal(rpc(finish(expired.lease)).stale,true,'expired lease cannot restore verified evidence');
  assert.equal(query(`select count(*) from private.merch_tracking_observations where assignment_id='${assignment}'`),'2');
  assert.equal(query('select count(*) from public.creator_earnings_ledger'),'0','tracking never creates earnings');
  assert.equal(checks,5);
  console.log('PASS native: 4 observed PostgreSQL lock races + simultaneous SKIP LOCKED exclusion; null/stale/expired lease and actor negatives. Synthetic providers only.');
}finally{
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try{if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop owned clone');}
  finally{restore.assertSourceUnchanged();}
}
