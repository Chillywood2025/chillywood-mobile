#!/usr/bin/env node
// Two real PostgreSQL sessions, only in an owned disposable clone of a local
// Supabase CLI reset. Synthetic provider facts; no Google/Stripe HTTP or money.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';

if(process.argv.includes('--help')){
  console.log('Run after local Supabase reset. Only generated local clone is written; no remote URLs accepted.');process.exit(0);
}
assert.equal(process.argv.length,2);
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/mu)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_google`;
const restore=createBrandGuardCloneRestorer({container});
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';set time zone 'UTC';${sql}`),'fixture query').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc',
  'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','google-fixture-admin',...a],input,encoding);
const sessions=[];
function session(name,sql){
  const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
  child.stdin.write(`set application_name=${lit(name)};set statement_timeout='30s';set time zone 'UTC';${sql}\n`);
  const s={child,done,output:()=>stdout,name};sessions.push(s);return s;
}
async function until(predicate,label){const deadline=Date.now()+20000;while(Date.now()<deadline){if(predicate())return;await delay(25);}throw Error(label);}
const service="set local request.jwt.claims='{\"role\":\"service_role\"}';";
let cloned=false;
try{
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
  assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
  const containers=success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n');
  assert.ok(containers.includes(container));
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261030165642');",'postgres'),'t');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create disposable clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only local source export');
  success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore clone');
  const cap=query(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,platform,storefront,storefront_country,
    route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
    values('creator_tip','${randomUUID()}','acct_fixture','android','fixture','US','android_external_content_link','usd','test','card',50,100000,
      'synthetic only','synthetic only',now(),now()+interval '1 hour',true) returning id;`);
  const program=query(`insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,
    license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,verified_at,expires_at,enabled)
    values('com.chillywood.mobile','test','synthetic only','synthetic only','synthetic only','synthetic only','synthetic only',now(),now()+interval '1 hour',true) returning id;`);
  query(`insert into private.google_play_external_capability_program_bindings(capability_id,program_id) values('${cap}','${program}');`);
  const quote=randomUUID();
  query(`insert into private.google_play_external_launch_bindings(feature,quote_id,buyer_id,session_id,capability_id,program_id,amount_minor,currency,
    external_transaction_token,token_hash) values('creator_tip','${quote}','${randomUUID()}','${randomUUID()}','${cap}','${program}',237,'usd',
    'synthetic-native-input','${'a'.repeat(64)}');`);
  const evidence={eventId:'evt_fixturePaid',outcome:'paid',occurredAt:'2026-10-30T12:00:00Z',amountMinor:237,currency:'usd',
    googlePlayTax:{provenance:'stripe_checkout_automatic_tax_complete',countryCode:'US',preTaxAmountMinor:237,taxAmountMinor:0}};
  const enqueue=e=>`private.enqueue_google_play_external_report('creator_tip','${quote}',${lit(JSON.stringify(e))}::jsonb,'${'b'.repeat(64)}')`;
  query(`select ${enqueue(evidence)};`);
  const lease=randomUUID();
  const holder=session('google-claim-holder',`begin;${service}select public.claim_google_play_external_report('${lease}');select 'HOLDER_READY';`);
  await until(()=>holder.output().includes('HOLDER_READY'),'claim holder never acquired lease');
  const waiter=session('google-claim-waiter',`begin;${service}select coalesce(public.claim_google_play_external_report('${randomUUID()}')::text,'NO_JOB');commit;`);
  waiter.child.stdin.end();
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name='google-claim-holder'
    where w.datname=current_database() and w.application_name='google-claim-waiter' and w.wait_event_type='Lock'
      and h.pid=any(pg_blocking_pids(w.pid));`)==='1','second claimant did not wait on real lock');
  holder.child.stdin.end('commit;\n');assert.equal((await holder.done).code,0);
  const waited=await waiter.done;assert.equal(waited.code,0);assert.match(waited.stdout,/NO_JOB/);
  const row=JSON.parse(query(`select jsonb_build_object('id',o.id,'transaction',t.id) from private.google_play_external_report_outbox o
    join private.google_play_external_transactions t on t.id=o.transaction_id where t.quote_id='${quote}'`));
  assert.equal(query(`select count(*) from private.google_play_external_report_outbox where state='leased' and transaction_id='${row.transaction}'`),'1');
  const receipt={externalTransactionId:row.transaction,packageName:'com.chillywood.mobile',testPurchase:{},transactionTime:evidence.occurredAt,
    transactionState:'TRANSACTION_REPORTED',userTaxAddress:{regionCode:'US'},externalContentLinkDetails:{linkType:'LINK_TO_DIGITAL_CONTENT_OFFER'},
    originalPreTaxAmount:{currency:'USD',priceMicros:'2370000'},originalTaxAmount:{currency:'USD',priceMicros:'0'},
    currentPreTaxAmount:{currency:'USD',priceMicros:'2370000'},currentTaxAmount:{currency:'USD',priceMicros:'0'}};
  const duplicate=session('google-enqueue-holder',`begin;select ${enqueue({...evidence,eventId:'evt_fixtureDuplicate'})};select 'HOLDER_READY';`);
  await until(()=>duplicate.output().includes('HOLDER_READY'),'duplicate enqueue holder');
  const completion=session('google-finish-waiter',`begin;${service}select public.finish_google_play_external_report('${row.id}','${lease}',
    ${lit(JSON.stringify({status:'reported',reason:'synthetic_fixture_only',receipt}))}::jsonb);commit;`);
  completion.child.stdin.end();
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name='google-enqueue-holder'
    where w.datname=current_database() and w.application_name='google-finish-waiter' and w.wait_event_type='Lock'
      and h.pid=any(pg_blocking_pids(w.pid));`)==='1','completion did not serialize behind enqueue');
  duplicate.child.stdin.end('commit;\n');assert.equal((await duplicate.done).code,0);
  const finished=await completion.done;assert.equal(finished.code,0,finished.stderr);assert.match(finished.stdout,/t/);
  assert.equal(query(`select count(*) from private.google_play_external_report_outbox where transaction_id='${row.transaction}'`),'1');
  assert.equal(query(`select state from private.google_play_external_report_outbox where id='${row.id}'`),'reported');
  console.log('Google reporting: two observed native PostgreSQL lock races passed; all provider receipts synthetic, no provider calls.');
}finally{
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try{if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');}
  finally{restore.assertSourceUnchanged();}
}
