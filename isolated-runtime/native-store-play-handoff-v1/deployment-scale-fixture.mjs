// Disposable loopback PG17.6 only. Replays the real complete legacy schema and
// immutable native48, not a small catalog or stubbed native implementation.
// Managed auth/storage/cron infrastructure uses the existing replay fixture.
// No target URL, credentials, provider calls or deploy transport are accepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../../tests/helpers/database-runtime-authority-fixture.mjs';
import {splitSQL} from '../../scripts/live-room-exact-deploy.mjs';
import {nativeStoreInstallProfile} from '../native-store-sandbox-v1/install-profile.mjs';
import {ROOT,BASE_DIGEST,quote,sha} from './deployment.mjs';

export async function localFullCatalogFixture({bin,output,onProgress=()=>{}}){
 assert.ok(path.isAbsolute(bin)&&path.isAbsolute(output));
 fs.mkdirSync(output,{recursive:true});
 const work=fs.mkdtempSync(path.join(output,'full-catalog-pg-')),data=path.join(work,'data');
 const port=await new Promise((resolve,reject)=>{
  const server=createServer();server.once('error',reject);
  server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{
   const address=server.address();server.close(error=>error?reject(error):resolve(String(address.port)));
  });
 });
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')&&key!=='DATABASE_URL'));
 const args=(user='fixture_admin',database='postgres')=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U',user,'-d',database];
 // SQL's original 20s statement / 25s transaction guards are never changed.
 // Only the unguarded, complete legacy setup needs the longer client deadline.
 const run=(tool,argv,input,timeout=30000)=>spawnSync(path.join(bin,tool),argv,{env,input,encoding:'utf8',timeout,maxBuffer:64*1024*1024});
 const invoke=(tool,argv,input,timeout)=>{
  const result=run(tool,argv,input,timeout);assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();
 };
 const q=(sql,user='fixture_admin')=>invoke('psql',args(user),sql);
 let started=false,startAttempted=false;
 const stop=()=>{
  if(startAttempted&&!started){const state=run('pg_ctl',['-D',data,'status']);assert.ok([0,3,4].includes(state.status));started=state.status===0;}
  if(started){invoke('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);started=false;}
  startAttempted=false;fs.rmSync(work,{recursive:true,force:true});
 };
 try{
  assert.match(invoke('postgres',['--version']),/PostgreSQL\) 17\.6/u);
  invoke('initdb',['-D',data,'-U','fixture_admin','--encoding=UTF8','--no-locale','--auth=trust']);
  startAttempted=true;
  invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(work,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c shared_buffers=32MB -c autovacuum=off`,'start']);started=true;
  q('create role postgres login superuser;alter database postgres owner to postgres;');
  const replay=[];
  const {replayReport}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false,
   databaseFactory:async()=>({async exec(sql){replay.push(sql);},async close(){}})});
  assert.equal(replayReport.files.length,630,'Update the actual-scale proof when the complete legacy chain changes');
  assert.deepEqual(replayReport.excludedMigrations,[]);assert.deepEqual(replayReport.overlayFiles,[]);
  const replayStart=performance.now();
  invoke('psql',args('postgres'),replay.join('\n'),120000);
  const replayWallMs=Math.round(performance.now()-replayStart);
  onProgress({phase:'legacy-replayed',legacyMigrations:replayReport.files.length,replayUnits:replay.length,wallMs:replayWallMs});
  q('create role supabase_read_only_user login nosuperuser nocreaterole nocreatedb noreplication bypassrls;alter role supabase_admin superuser;');
  // Two real brand-protection event triggers already came from the legacy
  // migration. Add the six captured managed-service definitions unchanged.
  const parity=JSON.parse(fs.readFileSync(new URL('../native-store-sandbox-v1/event-trigger.fixture.json',import.meta.url),'utf8'));
  for(const trigger of parity.triggers){
   assert.equal(trigger.prosecdef,false);assert.deepEqual(trigger.proconfig,['search_path=""']);assert.equal(trigger.evtenabled,'O');
   const signature=trigger.definition.match(/FUNCTION (extensions\.\w+\(\))/u)?.[1];assert.ok(signature);
   q(`${trigger.definition};alter function ${signature} owner to supabase_admin;grant execute on function ${signature} to public;
    create event trigger ${trigger.evtname} on ${trigger.evtevent}${trigger.evttags?' when tag in ('+trigger.evttags.map(quote).join(',')+')':''} execute function ${signature};
    alter event trigger ${trigger.evtname} owner to supabase_admin;`);
  }
  assert.equal(q('select count(*) from pg_event_trigger;'),'8');
  q('alter role postgres nosuperuser nocreatedb noreplication createrole bypassrls noinherit;');
  const profile=nativeStoreInstallProfile();assert.equal(profile.files.length,48);assert.equal(profile.sourceDigest,BASE_DIGEST);
  const installStart=performance.now();q(profile.sql,'postgres');
  const installWallMs=Math.round(performance.now()-installStart);
  assert.equal(q("select rolsuper,rolcreatedb,rolreplication,rolcreaterole,rolbypassrls,rolinherit from pg_roles where rolname='postgres';"),'f|f|f|t|t|f');
  const fixtureToken=randomUUID(),base=profile.sql.replace(/^begin;\n/u,'').replace(/\ncommit;\n$/u,'');
  q(`create schema play_deployment_local_fixture;create table play_deployment_local_fixture.marker(token uuid primary key);
   insert into play_deployment_local_fixture.marker values(${quote(fixtureToken)});revoke all on schema play_deployment_local_fixture from public;
   grant usage on schema play_deployment_local_fixture to postgres;grant select on play_deployment_local_fixture.marker to postgres;
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]);
   alter table supabase_migrations.schema_migrations owner to postgres;
   insert into supabase_migrations.schema_migrations(version,name,statements) values('20261109151349','native_store_sandbox_source_bound_48',array[${quote(base)}]);
   grant usage on schema public,supabase_migrations to supabase_read_only_user;
   grant select on public.platform_money_kill_switches,supabase_migrations.schema_migrations to supabase_read_only_user;
   grant usage on schema supabase_migrations to postgres;grant select,insert,maintain on supabase_migrations.schema_migrations to postgres;
   alter role supabase_read_only_user set default_transaction_read_only=on;`);
  // Preserve real historical 12- and 14-digit IDs and source names. The same
  // SQL-aware splitter used by exact deployment retains each complete source
  // statement, including multipart receipts with 395 and 619 statements.
  // This local history is not a claim about any hosted inventory.
  const receipts=replayReport.files.map(file=>{
   const match=file.match(/^(\d{12}|\d{14})_(.+)\.sql$/u);assert.ok(match,file);
   const source=fs.readFileSync(path.join(ROOT,'supabase/migrations',file),'utf8'),statements=splitSQL(source);
   assert.equal(statements.join('').trimEnd(),source.trimEnd());assert.ok(statements.length>0);
   return {file,version:match[1],name:match[2],statements};
  });
  assert.equal(new Set(receipts.map(receipt=>receipt.version)).size,receipts.length);
  assert.equal(receipts.find(receipt=>receipt.version==='202604190004')?.statements.length,395);
  assert.equal(receipts.find(receipt=>receipt.version==='20260824034109')?.statements.length,619);
  q('insert into supabase_migrations.schema_migrations(version,name,statements) values '+receipts.map(receipt=>
   `(${quote(receipt.version)},${quote(receipt.name)},array[${receipt.statements.map(quote).join(',')}])`).join(',')+';');
  const expectedHistory=receipts.map(receipt=>({version:receipt.version,name:receipt.name,
   statementArraySha256:sha(JSON.stringify(receipt.statements)),
   statementsCount:receipt.statements.length,extraMetadataNull:true})).sort((a,b)=>a.version<b.version?-1:a.version>b.version?1:0);
  assert.deepEqual(JSON.parse(q(`select jsonb_agg(jsonb_build_object('version',version,'name',name,
   'statementArraySha256',encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex'),'statementsCount',cardinality(statements),
   'extraMetadataNull',created_by is null and idempotency_key is null and rollback is null) order by version collate "C")
   from supabase_migrations.schema_migrations where version<>'20261109151349';`)),expectedHistory);
  // LOCAL synthetic controls only. Preserve actual source SQL and all legacy
  // history bytes; this is not a target hold or authority to change one.
  q(`update public.platform_money_kill_switches set state=case when key in('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end
   where key in('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled');`);
  assert.equal(q('select count(*) from supabase_migrations.schema_migrations;'),'631');
  const setup={legacyMigrations:replayReport.files.length,replayUnits:replay.length,managedReplaySubstitutions:replayReport.skipped,
   nativeModules:profile.files.length,nativeSourceDigest:profile.sourceDigest,eventTriggers:8,historyRows:631,
   exactLegacyHistoryObserved:true,historyVersionsFromSourceFilenames:true,
   legacy12DigitVersions:receipts.filter(receipt=>receipt.version.length===12).length,
   legacyHistoryStatements:receipts.reduce((total,receipt)=>total+receipt.statements.length,0),
   maximumLegacyStatements:Math.max(...receipts.map(receipt=>receipt.statements.length)),replayWallMs,installWallMs};
  onProgress({phase:'full-fixture-ready',...setup});
  return {q,run,args,profile,fixtureToken,setup,stop};
 }catch(error){stop();throw error;}
}
