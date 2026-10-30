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
  console.log('Run after local Supabase reset: node scripts/test-subscription-bindings-native-postgres.mjs. SUPABASE_DB_CONTAINER may name a local supabase_db_* CLI container. Only generated disposable clone is written.');
  process.exit(0);
}
assert.equal(process.argv.length,2,'no remote URL or positional arguments accepted');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/mu)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_subscription`;
const restore=createBrandGuardCloneRestorer({container});
const literal=x=>`'${String(x).replaceAll("'","''")}'`;
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';set time zone 'UTC';${sql}`),'fixture query').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','subscription-fixture-admin',...a],input,encoding);
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
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261030155923');",'postgres'),'t','full subscription migration reset required');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create disposable clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only local source export');
  success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore clone');
  query(readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
  const actors=JSON.parse(query("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
  const claims=who=>`set local role authenticated;set local request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:actors[who].id,session_id:actors[who].session}))};set local request.headers='{"x-chillywood-platform":"ios"}';`;
  const call=(who,sql)=>`begin;${claims(who)}select ${sql};commit;`;
  const rpc=(who,sql)=>JSON.parse(query(call(who,sql)).split('\n').at(-1));
  let checks=0;
  async function race(label,holderActor,holderCall,waiterActor,waiterCall,expectedError) {
    const holder=session(`subscription-holder-${checks}`,`begin;${claims(holderActor)}select ${holderCall};select 'HOLDER_READY';`);
    await until(()=>holder.output().includes('HOLDER_READY'),`${label}: holder`);
    const waiter=session(`subscription-waiter-${checks}`,call(waiterActor,waiterCall));waiter.child.stdin.end();
    await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${literal(holder.name)}
      where w.datname=current_database() and w.application_name=${literal(waiter.name)} and w.wait_event_type='Lock'
      and h.pid=any(pg_blocking_pids(w.pid));`)==='1',`${label}: observed lock`);
    holder.child.stdin.end('commit;\n');assert.equal((await holder.done).code,0);
    const result=await waiter.done;
    if(expectedError){assert.notEqual(result.code,0);assert.match(result.stderr,new RegExp(expectedError));}
    else assert.equal(result.code,0,result.stderr);
    console.log(`ok ${++checks} - ${label}`);return result;
  }
  const offer=rpc('creator',"public.set_creator_channel_subscription_offer('Native cohorts','Monthly','sandbox')");
  const ids={1299:'cb100000-0000-4000-8000-000000000001',1599:'cb100000-0000-4000-8000-000000000002'};
  for(const [amount,id] of Object.entries(ids)){
    query(`insert into public.monetization_product_store_mappings select
      (jsonb_populate_record(null::public.monetization_product_store_mappings,to_jsonb(m)||jsonb_build_object(
        'id','${id}'::uuid,'provider_product_id','fixture.native.subscription.${amount}','tier','fixture${amount}',
        'apple_subscription_group','fixture_native_subscription','reference_price_minor',${amount},
        'metadata',jsonb_build_object('subscription_period','P1M','creator_subscription_catalog_approved',true)))).*
      from public.monetization_product_store_mappings m where provider_product_id='com.chillywood.channel.subscription.slot1';
      set role service_role;
      select public.approve_creator_channel_subscription_catalog_binding('${offer.id}','${id}','ios','sandbox');`);
  }
  rpc('creator',`public.set_creator_channel_subscription_offer_at_price('Native cohorts','Monthly','sandbox','${ids[1299]}')`);
  await race('duplicate buyer requests serialize one pending intent','buyer16',
    `public.create_creator_channel_subscription_purchase_intent('${offer.id}')`,'buyer16',
    `public.create_creator_channel_subscription_purchase_intent('${offer.id}')`,'source_purchase_intent_already_pending');
  assert.equal(query(`select count(*) from public.money_purchase_intents where source_id='${offer.id}' and user_id='${actors.buyer16.id}'`),'1');
  const result=await race('creator price edit blocks buyer until committed cohort','creator',
    `public.set_creator_channel_subscription_offer_at_price('New cohort','Monthly','sandbox','${ids[1599]}')`,'buyer17',
    `public.create_creator_channel_subscription_purchase_intent('${offer.id}')`);
  const intent=JSON.parse(result.stdout.split('\n').find(line=>line.startsWith('{')));
  assert.equal(intent.amountMinor,1599);assert.equal(intent.subscriptionCatalogBinding.priceId,ids[1599]);
  assert.deepEqual(intent.quote.terms.subscriptionCatalogBinding,intent.subscriptionCatalogBinding);
  assert.equal(query(`select count(*) from public.money_purchase_intents i join public.creator_money_purchase_quotes q on q.purchase_intent_id=i.id
    join public.creator_channel_subscription_catalog_bindings b on b.id=i.subscription_catalog_binding_id
    where i.source_id='${offer.id}' and (i.amount_minor<>b.amount_minor or q.amount_minor<>b.amount_minor
      or i.provider_product_id<>b.provider_product_id or q.subscription_catalog_binding_id<>b.id)`),'0');
  assert.equal(checks,2);console.log('Native subscription bindings: 2 observed lock races passed; exact cohort snapshots; no provider transport.');
} finally {
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try {if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');}
  finally {restore.assertSourceUnchanged();}
}
