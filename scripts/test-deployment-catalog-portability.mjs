#!/usr/bin/env node
// Catalog serialization regression only: synthetic dependencies, immutable DDL,
// no checkout/payment/provider execution and no production qualification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {redundantNotNull} from './live-room-exact-deploy.mjs';
import {loadBundle as loadIngress, addedCatalogHashSQL} from './native-ingress-exact-deploy.mjs';
import {loadBundle as loadSandbox, addedCatalogSQL} from './sandbox-cashout-exact-deploy.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const IMAGE='public.ecr.aws/supabase/postgres@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f';
const ORIGINAL_PGLITE_HASHES={
  ingress:'573616081f5e04606b1b7a99653b1d06eadcce0347e53729db66183a6cd5bbac',
  sandbox:'0b3bb66ea620551f8ed95acc0d0d431f8bfeaa77ba861c0b50c8f9f271f8e5ad',
};

// Only dependencies needed to CREATE the exact migrations are synthetic. Their
// runtime behavior is intentionally unavailable; financial semantics belong to
// the full database/authority/concurrency suites. No check_function_bodies bypass.
const SETUP=`
create role anon; create role authenticated; create role service_role bypassrls;
create schema private; create schema auth;
alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
create table auth.users(id uuid primary key,deleted_at timestamptz,email_confirmed_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
create table public.provider_events(id uuid primary key,provider_event_id text,raw_payload_hash text,provider text,environment text,event_type text,user_id uuid,metadata jsonb,product_id uuid);
create table public.revenuecat_webhook_ingress_events(provider_event_id text primary key,raw_payload_hash text);
create table public.monetization_products(id uuid primary key,product_type text);
create table public.platform_money_kill_switches(key text primary key,state text);
create table public.money_purchase_intents(id uuid primary key,checkout_attempt_id uuid,checkout_reserved_at timestamptz);
create table public.money_access_ledger_events(id uuid primary key);
create table public.merch_orders(id uuid primary key);
create table public.stripe_merch_events(id uuid primary key);
create table public.monetization_product_store_mappings(id uuid primary key);
create table private.auction_platform_settlement_contracts(id uuid primary key);
create table private.commerce_tax_checkout_bindings(id uuid primary key);
create table public.beta_access_memberships(user_id text,access_status text);
create table public.sandbox_monetization_testers(user_id text,status text,expires_at timestamptz);
create function public.is_account_access_restricted(text) returns boolean language sql as $$select true$$;
create function public.platform_subject_has_role_internal(text,text[]) returns boolean language sql as $$select false$$;
create function private.guard_event_ticket_terms_immutable() returns trigger language plpgsql as $$begin raise exception 'synthetic_immutable';end$$;
create function public.block_revenuecat_webhook_ingress_mutation_internal() returns trigger language plpgsql as $$begin raise exception 'synthetic_immutable';end$$;
create function public.begin_creator_money_checkout(p_intent_id uuid,p_checkout_attempt_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare i record;begin
  update public.money_purchase_intents set checkout_attempt_id=p_checkout_attempt_id,
    checkout_reserved_at=clock_timestamp() where id=p_intent_id;
  return '{}'::jsonb;
end$$;
set search_path=pg_catalog,public;
`;

const bundleIngress=loadIngress(ROOT),bundleSandbox=loadSandbox(ROOT);
const contracts=[
  {name:'ingress',bundle:bundleIngress,sql:addedCatalogHashSQL,alias:'c',suffix:'added_catalog',
    nullability:['private.native_production_ingress_qualifications','project_id'],
    controls:[
      ['lost_not_null','alter table private.native_production_ingress_qualifications alter column project_id drop not null'],
      ['real_check_constraint','alter table private.native_production_ingress_qualifications drop constraint native_production_ingress_qualifications_project_id_check'],
      ['foreign_key','alter table private.native_production_ingress_revocations drop constraint native_production_ingress_revocations_qualification_id_fkey'],
      ['unique_constraint','alter table private.native_production_ingress_qualifications add constraint portability_unique unique(project_id)'],
      ['primary_key','alter table private.native_production_ingress_revocations drop constraint native_production_ingress_revocations_pkey'],
      ['trigger','alter table private.native_production_ingress_qualifications disable trigger native_production_ingress_qualifications_immutable'],
      ['grant_drift','grant select on private.native_production_ingress_qualifications to authenticated'],
      ['rls','alter table private.native_production_ingress_qualifications disable row level security'],
      ['force_rls','alter table private.native_production_ingress_qualifications no force row level security'],
    ]},
  {name:'sandbox',bundle:bundleSandbox,sql:addedCatalogSQL,alias:'co',suffix:'items',
    nullability:['private.sandbox_cashout_executions','gross_minor'],
    controls:[
      ['lost_not_null','alter table private.sandbox_cashout_executions alter column gross_minor drop not null'],
      ['real_check_constraint','alter table private.sandbox_cashout_executions drop constraint sandbox_cashout_executions_gross_minor_check'],
      ['foreign_key','alter table private.sandbox_cashout_executions drop constraint sandbox_cashout_executions_creator_id_fkey'],
      ['unique_constraint','alter table private.sandbox_cashout_executions drop constraint sandbox_cashout_executions_transfer_id_key'],
      ['primary_key','alter table private.sandbox_cashout_control drop constraint sandbox_cashout_control_pkey'],
      ['trigger','alter table private.sandbox_cashout_revocations disable trigger sandbox_cashout_revoke_admission'],
      ['grant_drift','grant select on private.sandbox_cashout_executions to authenticated'],
      ['rls','alter table private.sandbox_cashout_executions disable row level security'],
      ['force_rls','alter table private.sandbox_cashout_executions no force row level security'],
    ]},
];
const metadataSQL=`select jsonb_build_object('version',version(),'serverVersion',current_setting('server_version_num'),
 'locale',(select jsonb_build_object('provider',datlocprovider,'collate',datcollate,'ctype',datctype,
 'locale',to_jsonb(d)->>'datlocale','icuLocale',to_jsonb(d)->>'daticulocale') from pg_database d where datname=current_database())) value`;
const unnormalized=contract=>{
  const predicate=` and not ${redundantNotNull(contract.alias)}`;
  assert.equal(contract.sql.split(predicate).length,2,'expected one precise NOT NULL normalization');
  return contract.sql.replace(predicate,'');
};
const ambient=sql=>sql.replace('order by item::text collate "C"','order by item::text');
const componentSQL=contract=>{
  const match=contract.sql.match(new RegExp(` from \\(([\\s\\S]*)\\) ${contract.suffix}\\)$`));
  assert.ok(match,'recognized exact added catalog SQL');
  return `select coalesce(jsonb_agg(item order by item::text collate "C"),'[]') value from (${match[1]}) portable_components`;
};

async function inspect(database,contract,major){
  const raw=unnormalized(contract);
  const hashes=await database.value(`select jsonb_build_object('normalizedC',${contract.sql},
    'normalizedAmbient',${ambient(contract.sql)},'rawC',${raw},'rawAmbient',${ambient(raw)}) value`);
  const components=await database.value(componentSQL(contract));
  const [relation,column]=contract.nullability;
  assert.equal(components.find(item=>item[0]==='column'&&item[1]===relation&&item[2]===column)?.[4],true,'explicit attnotnull remains fingerprinted');
  const unusualNotNull=['not valid','no inherit'].map(suffix=>{
    const name=`portability_not_null_${suffix.replaceAll(' ','_')}`;
    return [name,`alter table ${relation} alter column ${column} drop not null;alter table ${relation} add constraint ${name} not null ${column} ${suffix}`,name];
  });
  const negativeControls=[];
  for(const [name,change,preservedConstraint] of [...contract.controls,...(major>=18?unusualNotNull:[])]){
    await database.exec('begin;'+change+';');
    try{
      const hash=await database.value(`select to_jsonb(${contract.sql}) value`);
      assert.notEqual(hash,hashes.normalizedC,`${contract.name} ${name} must alter the exact hash`);
      if(preservedConstraint){
        const changed=await database.value(componentSQL(contract));
        assert.ok(changed.some(item=>item[0]==='constraint'&&item[1]===relation&&item[2]===preservedConstraint),'noncanonical NOT NULL row remains fingerprinted');
      }
      negativeControls.push({case:name,detected:true});
    }finally{await database.exec('rollback;');}
    assert.equal(await database.value(`select to_jsonb(${contract.sql}) value`),hashes.normalizedC,'control rollback restores exact catalog');
  }
  return {migrationSha256:contract.bundle.manifest.migration.sha256,
    expectedAddedCatalog:contract.bundle.manifest.addedCatalogSha256,...hashes,
    componentCount:components.length,components,negativeControls,
    unavailableControls:major<18?unusualNotNull.map(([name])=>({case:name,reason:'PostgreSQL 17 has no NOT NULL constraint syntax'})):[]};
}
async function runFixture(database){
  await database.exec(SETUP);
  const metadata=await database.value(metadataSQL),result={metadata,catalogs:{}};
  for(const contract of contracts){
    await database.exec(contract.bundle.body);
    result.catalogs[contract.name]=await inspect(database,contract,Math.floor(Number(metadata.serverVersion)/10000));
  }
  return result;
}
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']});
async function nativeFixture(){
  const name=`chillywood-catalog-portability-${process.pid}-${Date.now()}`;
  // The immutable image must already exist. --pull=never prevents registry access.
  docker(['image','inspect',IMAGE,'--format','{{.Id}}']);
  let attempted=false;
  const sql=text=>docker(['exec','-i',name,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','/tmp','-U','postgres','-d','postgres'],text).trim();
  const cleanup=()=>{
    if(!attempted)return;
    // Reconcile uncertain docker run output, and only remove this unique fixture.
    const existing=docker(['ps','-aq','--filter',`name=^/${name}$`]).trim();
    if(existing)docker(['rm','-f',name]);
    assert.equal(docker(['ps','-aq','--filter',`name=^/${name}$`]).trim(),'','disposable fixture cleanup');
    attempted=false;
  };
  const signals=new Map([['SIGINT',130],['SIGTERM',143]].map(([signal,code])=>[signal,()=>{
    try{cleanup();}catch(error){console.error(`fixture_cleanup_failed: ${error.message}`);process.exit(1);}
    process.exit(code);
  }]));
  for(const [signal,handler] of signals)process.once(signal,handler);
  try{
    attempted=true;
    docker(['run','-d','--rm','--pull=never','--name',name,'--network','none','--memory','1g','--cpus','2',
      '--pids-limit','128','--read-only','--tmpfs','/tmp:rw,exec,size=536870912,mode=1777','--user','postgres',
      '--entrypoint','/bin/sh',IMAGE,'-c',
      "initdb -D /tmp/portability-pgdata --auth-local=trust --auth-host=reject --encoding=UTF8 --locale-provider=icu --icu-locale=en-US --locale=en_US.UTF-8 >/tmp/portability-init.log 2>&1 && exec postgres -D /tmp/portability-pgdata -c listen_addresses='' -c unix_socket_directories=/tmp -c shared_buffers=32MB -c max_connections=10"]);
    const deadline=Date.now()+30000;
    while(true){
      try{sql('select 1;');break;}catch{if(Date.now()>deadline)throw Error('native_postgres_start_timeout');await new Promise(r=>setTimeout(r,200));}
    }
    // Each query about a control runs its mutation, digest and rollback together
    // in one psql session. No transaction spans separate docker exec calls.
    let pending='';
    const database={
      exec:async text=>{
        if(text.startsWith('begin;')){pending=text;return;}
        if(text==='rollback;'){pending='';return;}
        sql('set search_path=pg_catalog,public;'+text);
      },
      value:async text=>JSON.parse(sql(`set search_path=pg_catalog,public;${pending}${text};${pending?'rollback;':''}`)),
    };
    const result=await runFixture(database);
    assert.equal(Number(result.metadata.serverVersion),170006,'native fixture must use PostgreSQL 17.6');
    assert.equal(result.metadata.locale.provider,'i','native fixture exercises ICU locale');
    return {image:IMAGE,container:name,...result};
  }finally{
    try{cleanup();}finally{for(const [signal,handler] of signals)process.removeListener(signal,handler);}
  }
}

async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){
    console.log('Usage: node scripts/test-deployment-catalog-portability.mjs [--pglite-only] [--output DIR]\nDefault compares PGlite against cached isolated PostgreSQL 17.6 with ICU. --pglite-only is explicitly partial evidence. No provider access or deployment qualification.');return;
  }
  const pgliteOnly=args.includes('--pglite-only'),index=args.indexOf('--output');
  const output=index<0?null:args[index+1];
  const rest=args.filter((arg,i)=>arg!=='--pglite-only'&&(index<0||(i!==index&&i!==index+1)));
  assert.ok(rest.length===0&&(index<0||output),'invalid arguments');
  if(output)fs.mkdirSync(output,{recursive:false});
  const db=new PGlite();let pglite;
  try{pglite=await runFixture({exec:text=>db.exec(text),value:async text=>(await db.query(text)).rows[0].value});}
  finally{await db.close();}
  assert.equal(Math.floor(Number(pglite.metadata.serverVersion)/10000),18,'PGlite fixture must exercise PostgreSQL 18 NOT NULL rows');
  for(const contract of contracts)assert.equal(pglite.catalogs[contract.name].rawAmbient,ORIGINAL_PGLITE_HASHES[contract.name],`${contract.name}: synthetic dependencies reproduce original fixture catalog`);
  const native=pgliteOnly?null:await nativeFixture();
  const result={scope:'Synthetic catalog-only regression; unchanged migrations; no runtime/provider/production qualification',
    nativeExecuted:!pgliteOnly,cleanup:true,pglite,native};
  if(native){
    for(const contract of contracts){
      const local=pglite.catalogs[contract.name],postgres=native.catalogs[contract.name];
      assert.equal(postgres.normalizedC,local.normalizedC,`${contract.name}: native17/PGlite18 normalized hashes match`);
      assert.deepEqual(postgres.components,local.components,`${contract.name}: every normalized component matches`);
      assert.notEqual(postgres.rawC,local.rawC,`${contract.name}: original constraint catalogs differ by PostgreSQL major`);
      assert.notEqual(postgres.normalizedAmbient,postgres.normalizedC,`${contract.name}: ICU ordering exercises locale difference`);
    }
  }
  // Do not publish a complete result unless the committed contracts also match.
  for(const contract of contracts)assert.equal(pglite.catalogs[contract.name].normalizedC,contract.bundle.manifest.addedCatalogSha256,`${contract.name}: manifest binds exact portable catalog`);
  if(output)fs.writeFileSync(path.join(output,'catalog-portability.json'),JSON.stringify(result,null,2)+'\n');
  // Keep CLI output compact; the optional artifact preserves all compared rows.
  const summary=engine=>engine&&{metadata:engine.metadata,catalogs:Object.fromEntries(Object.entries(engine.catalogs).map(([name,{components,...catalog}])=>[name,catalog]))};
  console.log(JSON.stringify({...result,pglite:summary(pglite),native:summary(native)}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
  console.error(error.message);if(error.stderr)console.error(String(error.stderr).slice(0,2000));process.exitCode=1;
});
