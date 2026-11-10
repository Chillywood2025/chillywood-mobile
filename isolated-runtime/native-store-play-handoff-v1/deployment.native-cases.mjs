// Local PG17.6 only. External facts are synthetic; actual forward payload comes
// only from fixedDeploymentBody(). No target URL, credentials or transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {localManagedFixture} from './deployment-fixture.mjs';
import {ROOT,IDENTITY,quote,sha,snapshotReadSQL,validateObservation,verifySource,allowlist} from './deployment.mjs';
import {buildLocalFixtureDeploymentEnvelope,classifyLocalFixtureDeploymentOutcome as classifyDeploymentOutcome,classifyDeploymentOutcome as classifyPublicOutcome,fixedDeploymentBody,verifyFixedArtifact} from './deployment-envelope.mjs';
import {playPrivateStateReadSQL,validatePlayPrivateState} from './private-state-readback.mjs';
export async function runPlayDeploymentNativeCases({bin}){
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'play-deployment-proof-')),cases=[];
 const f=await localManagedFixture({sourceRoot:ROOT,bin,output,eventParity:true,oidPadding:true});
 try{
  const rename=f.run('psql',f.args('fixture_admin','template1'),'alter database postgres rename to original_postgres;alter database play_catalog_fixture rename to postgres;');assert.equal(rename.status,0,rename.stderr);
  const run=(sql,user='fixture_admin')=>f.run('psql',f.args(user,'postgres'),sql);
  const q=(sql,user='fixture_admin')=>{const r=run(sql,user);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
  const reject=(sql,pattern,user='postgres')=>{const r=run(sql,user);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
  const observe=()=>JSON.parse(q(snapshotReadSQL(),'supabase_read_only_user'));
  const fixtureToken=randomUUID();
  const buildDeploymentEnvelope=args=>buildLocalFixtureDeploymentEnvelope({...args,fixtureToken});
  const base=f.profile.sql.replace(/^begin;\n/u,'').replace(/\ncommit;\n$/u,'');
  q(`create schema play_deployment_local_fixture;create table play_deployment_local_fixture.marker(token uuid primary key);
   insert into play_deployment_local_fixture.marker values(${quote(fixtureToken)});revoke all on schema play_deployment_local_fixture from public;
   grant usage on schema play_deployment_local_fixture to postgres;grant select on play_deployment_local_fixture.marker to postgres;
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]);
   alter table supabase_migrations.schema_migrations owner to postgres;
   insert into supabase_migrations.schema_migrations(version,name,statements) values('20261109151349','native_store_sandbox_source_bound_48',array[${quote(base)}]);
   insert into public.platform_money_kill_switches select k,case when k in('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end from unnest(array['live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled']) k on conflict(key) do update set state=excluded.state;
   grant usage on schema public,supabase_migrations to supabase_read_only_user;grant select on all tables in schema public,supabase_migrations to supabase_read_only_user;
   grant usage on schema supabase_migrations to postgres;grant select,insert,maintain on supabase_migrations.schema_migrations to postgres;`);
  verifySource();verifyFixedArtifact();cases.push('exact frozen source and generated artifact integrity');
  // Actual six-column target shape. Reject same-name changed definitions and
  // any previously unknown trigger/default/rule before adopting a baseline.
  q('alter table supabase_migrations.schema_migrations drop constraint schema_migrations_idempotency_key_key;alter table supabase_migrations.schema_migrations add constraint schema_migrations_idempotency_key_key unique(created_by);');
  assert.throws(()=>validateObservation(observe(),{before:true}));
  q('alter table supabase_migrations.schema_migrations drop constraint schema_migrations_idempotency_key_key;alter table supabase_migrations.schema_migrations add constraint schema_migrations_idempotency_key_key unique(idempotency_key);');
  q("alter table supabase_migrations.schema_migrations alter column created_by set default 'unexpected';");assert.throws(()=>validateObservation(observe(),{before:true}));
  q('alter table supabase_migrations.schema_migrations alter column created_by drop default;');
  q('create function supabase_migrations.fixture_history_trigger() returns trigger language plpgsql as $$begin return new;end$$;create trigger fixture_history after insert on supabase_migrations.schema_migrations for each row execute function supabase_migrations.fixture_history_trigger();');assert.throws(()=>validateObservation(observe(),{before:true}));
  q('drop trigger fixture_history on supabase_migrations.schema_migrations;drop function supabase_migrations.fixture_history_trigger();');
  q('create rule fixture_history_rule as on insert to supabase_migrations.schema_migrations do instead nothing;');assert.throws(()=>validateObservation(observe(),{before:true}));
  q('drop rule fixture_history_rule on supabase_migrations.schema_migrations;');cases.push('same-named history constraint changes and unexpected defaults/triggers/rules rejected');
  q('alter table supabase_migrations.schema_migrations drop constraint schema_migrations_pkey;alter table supabase_migrations.schema_migrations add constraint fixture_duplicate_unique unique(idempotency_key);');
  assert.throws(()=>validateObservation(observe(),{before:true}));
  q('alter table supabase_migrations.schema_migrations drop constraint fixture_duplicate_unique;alter table supabase_migrations.schema_migrations add primary key(version);');cases.push('two duplicate UNIQUE constraints cannot replace the exact PK/UNIQUE pair');
  for(const value of ['array[null]::text[]',"array[repeat('x',8388609)]", "array_fill('x'::text,array[257])", "array[['one','two'],['three','four']]"]){
   q(`update supabase_migrations.schema_migrations set rollback=${value};`);
   assert.throws(()=>validateObservation(observe(),{before:true}));
  }
  q('update supabase_migrations.schema_migrations set rollback=array[]::text[];');validateObservation(observe(),{before:true});
  q('update supabase_migrations.schema_migrations set rollback=null;');cases.push('nullable and empty rollback accepted; NULL elements dimensionality and byte/count overflow rejected');
  q("update supabase_migrations.schema_migrations set statements=array[['one','two'],['three','four']];");
  assert.equal(observe().withinBounds,false);
  q(`update supabase_migrations.schema_migrations set statements=array_fill(${quote(base)}::text,array[1],array[0]);`);
  const shifted=observe();assert.equal(shifted.withinBounds,false);assert.equal(shifted.baseReceiptExact,false);
  q(`update supabase_migrations.schema_migrations set statements=array[${quote(base)}]::text[];`);cases.push('statement arrays must be 1D and original48 exact receipt cannot shift its lower bound');
  q("insert into supabase_migrations.schema_migrations(version,name,statements) values('202604190004','fixture_exact_legacy_version',array_fill('select 1;'::text,array[1023]));");
  for(const statementCount of [1023,1024,1025]){
   q(`update supabase_migrations.schema_migrations set statements=array_fill('select 1;'::text,array[${statementCount}]) where version='202604190004';`);
   const observed=observe();assert.equal(observed.withinBounds,statementCount<=1024);
   if(statementCount<=1024){validateObservation(observed,{before:true});assert.equal(observed.historyReceipts.find(row=>row.version==='202604190004').statementsCount,statementCount);}
   else assert.throws(()=>validateObservation(observed,{before:true}),/observation_controls_invalid/u);
  }
  q("delete from supabase_migrations.schema_migrations where version='202604190004';");cases.push('exact 12-digit legacy receipt and 1024-statement ceiling preserve strings and reject overflow');
  q("insert into supabase_migrations.schema_migrations(version,name,statements) select '202605'||lpad(i::text,6,'0'),'fixture_total_'||i,array_fill('select 1;'::text,array[case when i<=19 then 1024 else 542 end]) from generate_series(1,20)i;");
  for(const total of [19999,20000,20001]){
   q(`update supabase_migrations.schema_migrations set statements=array_fill('select 1;'::text,array[${total-19457}]) where version='202605000020';`);
   const observed=observe();assert.equal(observed.withinBounds,total<=20000);
   if(total<=20000){validateObservation(observed,{before:true});assert.equal(observed.historyReceipts.reduce((sum,row)=>sum+row.statementsCount,0),total);}
   else{assert.deepEqual(observed.historyReceipts,[]);assert.throws(()=>validateObservation(observed,{before:true}),/observation_controls_invalid/u);}
  }
  q("delete from supabase_migrations.schema_migrations where name like 'fixture_total_%';");cases.push('aggregate history output is complete below/at 20000 and filtered before hash-array construction above it');
  q("insert into supabase_migrations.schema_migrations(version,name,statements) values('20261111000000','fixture_later',array['fixture only']);");
  assert.throws(()=>buildDeploymentEnvelope({baseline:observe()}),/play_history_order_invalid/u);
  q("delete from supabase_migrations.schema_migrations where version='20261111000000';");
  q(`insert into supabase_migrations.schema_migrations(version,name,statements) values('20261109000000',${quote(IDENTITY.name)},array['fixture only']);`);
  assert.throws(()=>buildDeploymentEnvelope({baseline:observe()}),/play_history_collision/u);
  q("delete from supabase_migrations.schema_migrations where version='20261109000000';");cases.push('later history and duplicate migration name reject forward preparation');
  const before=observe();validateObservation(before,{before:true});assert.equal(before.addedPresent,0);assert.equal(before.beforeChangedExact,true);cases.push('bounded genuine-reader consistent baseline and exact old nine objects');
  const packet=buildDeploymentEnvelope({baseline:before});
  reject(packet.sql.replaceAll(fixtureToken,randomUUID()),/play_local_fixture_required/u);
  assert.equal(classifyPublicOutcome({before,after:before,packet}).status,'outcome_unknown');cases.push('local fixture SQL marker required and public recovery rejects fixture packets');
  const many=structuredClone(before);many.historyReceipts=[...Array.from({length:629},(_,i)=>({...before.historyReceipts[0],version:String(20260000000000+i)})),before.historyReceipts[0]];many.historyCount=630;
  const large=buildDeploymentEnvelope({baseline:many});
  assert.ok(Buffer.byteLength(large.sql)<Buffer.byteLength(packet.sql)+1024,'history inventory must not be repeated in SQL');cases.push('630-receipt baseline changes envelope size by less than 1 KB');
  assert.equal(q(`select array_to_json(array[${quote(fixedDeploymentBody())}]::text[])::text;`),packet.receipt.statementsText);cases.push('independent PostgreSQL statement-array serialization exact');
  assert.equal(packet.sql.match(/set local transaction_timeout='25s'/gu).length,1);assert.equal(packet.sql.match(/insert into supabase_migrations\.schema_migrations/gu).length,1);cases.push('single original transaction budget and one fixed history insert');
  assert.equal(classifyDeploymentOutcome({before,after:before,packet}).status,'unchanged_observed');
  assert.equal(classifyDeploymentOutcome({before,after:{...before,database:'another'},packet}).status,'outcome_unknown');
  assert.equal(classifyDeploymentOutcome({before,after:{...before,serverStartedAt:'2020-01-01'},packet}).status,'outcome_unknown');
  assert.equal(classifyDeploymentOutcome({before,after:null,packet}).retryAllowed,false);cases.push('same physical target and restart bound; uncertainty never retries');
  for(const [column,value] of [['created_by',"'someone'"],['idempotency_key',"'unexpected-key'"],['rollback',"array['unexpected rollback']::text[]"]]){
   q(`update supabase_migrations.schema_migrations set ${column}=${value} where version='20261109151349';`);
   reject(packet.sql,/play_target_baseline_changed/u);
   q(`update supabase_migrations.schema_migrations set ${column}=null where version='20261109151349';`);
   reject(packet.sql.replace('-- History triggers may alter state:',`update supabase_migrations.schema_migrations set ${column}=${value} where version='20261109151349';\n-- History triggers may alter state:`),/play_exact_history_receipt_mismatch/u);
   assert.equal(classifyDeploymentOutcome({before,after:observe(),packet}).status,'unchanged_observed');
  }cases.push('all extra history columns preserved before and after receipt with atomic rollback');
  for(const field of ['catalogSha256','retainedSha256','retainedOidSha256','historySha256','moneyControlsSha256']){
   const stale=structuredClone(before);stale[field]='0'.repeat(64);
   reject(buildDeploymentEnvelope({baseline:stale}).sql,/play_target_baseline_changed/u);
  }cases.push('stale catalog OID history and money baseline rejected atomically');
  reject(packet.sql.replace('begin isolation level repeatable read;','begin isolation level repeatable read read only;'),/play_writer_invalid/u);cases.push('read-only writer context rejected');
  // Fail after all source DDL and receipt insertion; every new object and receipt
  // must disappear and original changed function/OIDs remain exact.
  reject(packet.sql.replace('drop table play_forward_before;','do $$begin raise exception \'fixture_forced_late_failure\';end$$;\ndrop table play_forward_before;'),/fixture_forced_late_failure/u);
  let unchanged=observe();assert.equal(classifyDeploymentOutcome({before,after:unchanged,packet}).status,'unchanged_observed');cases.push('late failure rolls back all DDL source replacements and receipt');
  reject(packet.sql.replace('-- History triggers may alter state:', 'create rule fixture_late_history_rule as on update to supabase_migrations.schema_migrations do instead nothing;\n-- History triggers may alter state:'),/play_exact_catalog_mismatch/u);
  assert.equal(classifyDeploymentOutcome({before,after:observe(),packet}).status,'unchanged_observed');cases.push('post-receipt history rule is rejected and atomically removed');
  // An independently generated target change must invalidate the pinned baseline.
  q('create table public.play_deployment_unexpected(id integer);');reject(packet.sql,/play_target_baseline_changed/u);q('drop table public.play_deployment_unexpected;');cases.push('unlisted same-target catalog change rejected');
  // Existing controls are checked under the installation owner in the same
  // transaction, with no persistent reader or raw grant added by the envelope.
  q('update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=true;');
  reject(packet.sql,/play_control_not_disabled:native_store_quote_controls/u);
  q('update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=false;');cases.push('fresh disabled core controls required under owner');
  q(packet.sql,'postgres');
  const after=observe();assert.equal(after.catalogCount-before.catalogCount,allowlist.added.length);
  assert.equal(after.retainedOidSha256,before.retainedOidSha256);assert.equal(after.retainedSha256,before.retainedSha256);
  assert.equal(after.historyCount,before.historyCount+1);
  assert.equal(classifyDeploymentOutcome({before,after,packet}).status,'exact_source_receipt_observed_committed_install_state_only');cases.push('exact forward-only source receipt catalog and original OID preservation');
  assert.equal(validatePlayPrivateState(JSON.parse(q(playPrivateStateReadSQL,'supabase_read_only_user'))).defaultOffAndEmptyObserved,true);cases.push('new genuine reader independently observes default-off nine-empty state');
  reject(packet.sql,/play_target_baseline_changed|play_history_collision/u);cases.push('duplicate dispatch rejected with no retry');
  for(const field of ['statementArraySha256','name']){
   const altered=structuredClone(after),row=altered.historyReceipts.find(r=>r.version===IDENTITY.version);row[field]='wrong';
   assert.equal(classifyDeploymentOutcome({before,after:altered,packet}).status,'outcome_unknown');
  }cases.push('wrong exact receipt body or identity fails recovery');
  q(`update sandbox_commerce_v1.native_store_play_handoff_control set enabled=true;`);
  const current=validatePlayPrivateState(JSON.parse(q(playPrivateStateReadSQL,'supabase_read_only_user')));assert.equal(current.handoffEnabled,true);
  assert.equal(classifyDeploymentOutcome({before,after:observe(),packet}).currentPrivateRuntimeState,'UNQUALIFIED');cases.push('receipt classification never claims current runtime disabled state');
  return {protocol:'native-store-play-deployment-local-proof-v1',cases:cases.length,passed:cases,sourceBodySha256:sha(fixedDeploymentBody()),localOnly:true};
 }finally{f.stop();fs.rmSync(output,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
 console.log(JSON.stringify(await runPlayDeploymentNativeCases({bin:process.argv[3]})));
}
