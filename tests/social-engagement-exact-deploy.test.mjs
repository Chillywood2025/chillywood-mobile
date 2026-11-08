import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {loadBundle,readbackSql,classifyState,buildApplySql,deploy,sourceBinding,safeError,MIGRATIONS,MANIFEST,CLOSURE,TOOL,migrationStatements} from '../scripts/social-engagement-exact-deploy.mjs';

const bundle=loadBundle();
const context={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
const ready=()=>({schema:1,database:'postgres',context:{...context},priorHistorySha256:'a'.repeat(64),catalogSha256:'b'.repeat(64),controlsSha256:'c'.repeat(64),targetCatalogSha256:'d'.repeat(64),holds:true,prerequisites:true,absent:true,targets:[]});
const applied=()=>({...ready(),absent:false,targetCatalogSha256:bundle.manifest.targetCatalogSha256,targets:bundle.migrations.map(({version,name,statementsSha256})=>({version,name,statementsSha256}))});

test('native fixture verifies its generated database before adapting management-only identity',()=>{
 const source=fs.readFileSync('scripts/test-social-engagement-exact-deploy-postgres.mjs','utf8');
 const start=source.indexOf('const read=()=>{'),end=source.indexOf('const fail=',start);
 assert.ok(start>=0&&end>start,'exact native read adapter is exercised');
 const database='runtime_authority_123_abcdef123456_social';
 let raw={...ready(),database};
 const read=new Function('assert','query','readbackSql','bundle','context','database',source.slice(start,end)+'return read;')
   (assert,()=>JSON.stringify(raw),readbackSql,bundle,context,database);
 const state=read();assert.equal(classifyState(bundle,state),'ready');
 assert.deepEqual(state,{...raw,database:'postgres',context});
 assert.throws(()=>classifyState(bundle,raw),/READBACK_INVALID/,'production identity requirement stays strict');
 raw={...raw,database:'unowned_database'};assert.throws(read,/readback must come from this owned clone/);
 raw={...ready(),database,holds:false};assert.throws(()=>classifyState(bundle,read()),/PRODUCTION_HOLDS_MISMATCH/,'no actual safety predicate is substituted');
});

test('two immutable migrations, exact source closure, and strict transaction envelope',t=>{
 assert.equal(bundle.migrations.length,2);
 for(const e of bundle.migrations)assert.equal(e.body,fs.readFileSync(e.path,'utf8'));
 for(const sql of ['select 1;','begin;commit;','begin;savepoint x;commit;','begin;commit;select 1;commit;','begin;rollback;commit;'])assert.throws(()=>migrationStatements(sql),/TRANSACTION_ENVELOPE_INVALID/);
 assert.deepEqual(migrationStatements("begin;do $$ begin perform 1; end $$;commit;"),['do $$ begin perform 1; end $$;']);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'social-source-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:'pipe'}).trim();
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 for(const file of CLOSURE){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(file,path.join(dir,file));}
 git('add','.');git('commit','-m','synthetic exact closure');const source=git('rev-parse','HEAD');
 assert.equal(sourceBinding(dir,source).source,source);assert.equal(loadBundle(dir,source).migrations[0].body,bundle.migrations[0].body);
 assert.throws(()=>sourceBinding(dir,'0'.repeat(40)),/SOURCE_HEAD_MISMATCH/);
 fs.appendFileSync(path.join(dir,MIGRATIONS[0].path),'\n-- changed');
 assert.throws(()=>sourceBinding(dir,source),/TRACKED_SOURCE_DIRTY/);assert.throws(()=>loadBundle(dir),/MIGRATION_HASH_MISMATCH/);
 fs.writeFileSync(path.join(dir,MIGRATIONS[0].path),bundle.migrations[0].body);
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,MANIFEST),'utf8'));manifest.migrations.reverse();fs.writeFileSync(path.join(dir,MANIFEST),JSON.stringify(manifest));
 assert.throws(()=>loadBundle(dir),/MANIFEST_INVALID/);assert.equal(safeError(Error('secret provider text')),'SOCIAL_DEPLOY_BLOCKED');
});

test('read-only planning and already-applied reconciliation never write',async()=>{
 for(const [state,status] of [[ready(),'plan_ready'],[applied(),'already_applied_verified']]){
  let calls=0;const result=await deploy({bundle,apply:status!=='plan_ready',query:async(sql,readOnly)=>{calls++;assert.equal(readOnly,true);assert.match(sql,/begin isolation level read committed read only/);return state;}});
  assert.equal(result.status,status);assert.equal(result.wrote,false);assert.equal(calls,1);
 }
 assert.equal(classifyState(bundle,ready()),'ready');assert.equal(classifyState(bundle,applied()),'applied');
 assert.throws(()=>buildApplySql(bundle,applied()),/APPLY_REQUIRES_ABSENT_TARGETS/);
});

test('partial history, source drift, bad authority and malformed readback stop before write',async()=>{
 const bad=[null,{...ready(),holds:false},{...ready(),prerequisites:false},{...ready(),absent:false},{...ready(),schema:2},{...ready(),database:'other'},{...ready(),catalogSha256:'invalid'},{...ready(),context:{...context,transactionReadOnly:false}},{...applied(),targets:applied().targets.slice(0,1)},{...applied(),targets:[applied().targets[0],applied().targets[0]]},{...applied(),targetCatalogSha256:'e'.repeat(64)},{...applied(),targets:applied().targets.map(x=>({...x,name:'wrong'}))}];
 for(const state of bad)await assert.rejects(deploy({bundle,apply:true,query:async(_sql,ro)=>{assert.equal(ro,true);return state;}}));
 let writes=0;await assert.rejects(deploy({bundle,apply:true,recheckSource:()=>{throw Error('changed source');},query:async(_sql,ro)=>{if(!ro)writes++;return ready();}}),/changed source/);assert.equal(writes,0);
});

test('exact write is one bounded transaction with two receipts, locks and immutable bodies',()=>{
 const sql=buildApplySql(bundle,ready());assert.match(sql,/^begin isolation level read committed;/);assert.match(sql,/notify pgrst,'reload schema';commit;$/);
 assert.match(sql,/lock_timeout='5s'/);assert.match(sql,/statement_timeout='60s'/);assert.match(sql,/pg_try_advisory_xact_lock\(176214,683\)/);assert.match(sql,/pg_try_advisory_xact_lock\(176214,707\)/);
 assert.equal((sql.match(/insert into supabase_migrations.schema_migrations/gu)??[]).length,2);
 assert.match(sql,/social_baseline_changed/);assert.match(sql,/social_backfill_failed/);assert.match(sql,/social_postcheck_failed/);
 for(const e of bundle.migrations)assert.ok(sql.includes(e.body.replaceAll("'","''")));
 assert.ok(!sql.includes('20261105010859'));assert.match(readbackSql(bundle),/pg_try_advisory_xact_lock_shared/);
});

test('uncertain write receives one read-only reconciliation, never blind retry',async()=>{
 for(const confirm of [false,true])for(const after of [applied(),ready(),null,{...applied(),controlsSha256:'e'.repeat(64)},{...applied(),catalogSha256:'e'.repeat(64)},{...applied(),priorHistorySha256:'e'.repeat(64)}]){
  let calls=0,writes=0,rechecks=0;
  const result=await deploy({bundle,apply:true,recheckSource:()=>rechecks++,query:async(_sql,ro)=>{calls++;if(!ro){writes++;if(!confirm)throw Error('private transport failure');return {};}if(calls===1)return ready();if(after===null)throw Error('private read failure');return after;}});
  assert.equal(calls,3);assert.equal(writes,1);assert.equal(rechecks,1);assert.equal(result.responseConfirmed,confirm);
  assert.equal(result.status,after?.catalogSha256===ready().catalogSha256&&after?.controlsSha256===ready().controlsSha256&&after?.priorHistorySha256===ready().priorHistorySha256&&after?.targets?.length===2?'applied_verified':'apply_unconfirmed');
  assert.ok(!JSON.stringify(result).includes('private transport failure'));
 }
});

test('CLI rejects overrides and missing source before contacting a provider',()=>{
 const env={...process.env,SUPABASE_ACCESS_TOKEN:''};
 for(const args of [[],['--apply'],['--source','invalid'],['--source','0'.repeat(40),'--project','other'],['--source','0'.repeat(40),'--baseline','forged']]){
  const result=spawnSync(process.execPath,[TOOL,...args],{encoding:'utf8',env});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/SOCIAL_DEPLOY_BLOCKED/);
 }
 const help=spawnSync(process.execPath,[TOOL,'--help'],{encoding:'utf8',env});assert.equal(help.status,0);assert.match(help.stdout,/Read-only by default/);
});
