// Explicit synthetic history identity and local baseline. Never target evidence.
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import path from 'node:path';import {setTimeout as delay} from 'node:timers/promises';
import {buildNativeInstallEnvelope,classifyNativeInstallOutcome,envelopeHistorySQL} from './install-envelope.mjs';
import {readbackSQL} from '../../scripts/native-store-install-prepare.mjs';
import {deltaSnapshotSQL} from './install-delta.mjs';import {nativeStoreInstallProfile} from './install-profile.mjs';
export async function prepareEnvelopeNativeProof({q,args,bin,env,attempt,absent}){
 let cases=0;
 // Fixture privilege only: managed installer has normal migration-writer access.
 q('grant insert,update,delete,maintain on supabase_migrations.schema_migrations to postgres;');
 const baseline=JSON.parse(q('begin read only;'+readbackSQL()+'rollback;','supabase_read_only_user'));
 const review={baseline,migration:{version:'20010101000000',name:'native_store_sandbox_synthetic_fixture',sourceDigest:nativeStoreInstallProfile().sourceDigest}};
 const bundle=buildNativeInstallEnvelope(review);
 // One statement in one repeatable-read transaction: never compose evidence
 // from separate requests that might straddle a concurrent commit.
 const snapshot=()=>{const s=JSON.parse(q(`begin isolation level repeatable read read only;
 set local jit=off;set local statement_timeout='20s';set local work_mem='8MB';set local max_parallel_workers_per_gather=0;
 with readiness(value) as (${readbackSQL().replace(/;$/u,'')}),catalog(value) as (${deltaSnapshotSQL.replace(/;$/u,'')}),history(value) as (${envelopeHistorySQL})
 select jsonb_build_object('read',(select value from readiness),'history',(select value from history),'catalog',(select value from catalog));rollback;`,'supabase_read_only_user'));
 return {context:s.read.context,serverVersionNum:s.read.serverVersionNum,moneyControlsSha256:s.read.moneyControlsSha256,history:s.history,catalog:s.catalog};};
 const before=snapshot();
 const reject=(sql,pattern)=>{const r=attempt(sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);absent();assert.deepEqual(snapshot(),before);};
 const stale=structuredClone(review);stale.baseline.catalogSha256='0'.repeat(64);reject(buildNativeInstallEnvelope(stale).sql,/native_envelope_baseline_changed/u);cases++;
 const collision=structuredClone(review);collision.migration.version=baseline.historyMaximum;reject(buildNativeInstallEnvelope(collision).sql,/native_envelope_history_collision/u);cases++;
 reject(bundle.sql.replace('\n -- Force the original',()=>"\ncreate function public.envelope_unexpected() returns integer language sql as $$select 1$$;\n -- Force the original"),/native_atomic_existing_catalog_changed/u);cases++;
 const oldHistory=structuredClone(review);oldHistory.baseline.historySha256='1'.repeat(64);reject(buildNativeInstallEnvelope(oldHistory).sql,/native_envelope_baseline_changed/u);cases++;
 const oldMoney=structuredClone(review);oldMoney.baseline.moneyControlsSha256='2'.repeat(64);reject(buildNativeInstallEnvelope(oldMoney).sql,/native_envelope_baseline_changed/u);cases++;
 reject(bundle.sql.replace('do $native_envelope_after$',()=>"update supabase_migrations.schema_migrations set name='mutated_existing_history' where version='20260101000000';do $native_envelope_after$"),/native_envelope_history_changed/u);cases++;
 reject(bundle.sql.replace("statement_timeout='20s'","statement_timeout='1ms'"),/statement timeout/u);cases++;
 assert.equal(classifyNativeInstallOutcome({before,after:snapshot(),receipt:bundle.receipt}).status,'unchanged_observed');cases++;
 // Separate actual session holds history mutation lock. The installer must fail
 // NOWAIT before any source DDL, and must never silently retry after release.
 let out='',err='';const child=spawn(path.join(bin,'psql'),args('postgres'),{env,stdio:['pipe','pipe','pipe']});
 child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);const done=new Promise(resolve=>child.once('exit',resolve));
 try{child.stdin.write("begin;lock table supabase_migrations.schema_migrations in row exclusive mode;select 'history_lock_ready';\n");
  const until=Date.now()+3000;while(!out.includes('history_lock_ready')&&Date.now()<until)await delay(10);assert.ok(out.includes('history_lock_ready'),err);
  reject(bundle.sql,/could not obtain lock on relation/u);cases++;
 }finally{child.stdin.end('rollback;\n');assert.equal(await done,0,err);}
 return {sql:bundle.sql,verifyCommitted(){
  const after=snapshot();assert.equal(after.history.length,before.history.length+1);
  assert.equal(classifyNativeInstallOutcome({before,after,receipt:bundle.receipt}).status,'exact_source_receipt_observed_runtime_unqualified');cases++;
  const altered=structuredClone(after);altered.history.at(-1)[1]='wrong';assert.equal(classifyNativeInstallOutcome({before,after:altered,receipt:bundle.receipt}).status,'outcome_unknown');cases++;
  assert.equal(classifyNativeInstallOutcome({before,after:null,receipt:bundle.receipt}).retryAllowed,false);cases++;
  const replay=attempt(bundle.sql);assert.notEqual(replay.status,0);assert.match(replay.stderr,/native_envelope_baseline_changed/u);assert.deepEqual(snapshot(),after);cases++;
  console.log(JSON.stringify({protocol:'native-store-envelope-local-proof-v1',cases,passed:cases,deploymentAllowed:false,administrativeConcurrencyExcluded:false}));
 }};
}
