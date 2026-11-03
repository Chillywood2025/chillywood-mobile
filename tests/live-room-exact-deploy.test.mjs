import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {loadBundle,projectFunctions,splitSQL,readbackSql,finalReadbackSql,buildApplySql,classifyState,deploy,sourceBinding,TOOL,MANIFEST,VERSIONS} from '../scripts/live-room-exact-deploy.mjs';

const bundle=loadBundle();
const ready=()=>({schema:1,database:'postgres',historySha256:'a'.repeat(64),catalogSha256:'b'.repeat(64),historyCount:574,historyMaximum:'20261101215711',holds:true,baselineFunctions:true,defaults:true,objectsAbsent:true,targets:[]});
const applied=()=>({...ready(),historyCount:583,targets:bundle.migrations.map(({version,name,statementsSha256})=>({version,name,statementsSha256}))});
const final=()=>({functions:true,holds:true,privacy:true,privateTables:true,schema:true});

test('immutable nine-only and eight-file closure, exact ordered function projection',()=>{
  assert.equal(bundle.migrations.length,9);assert.equal(bundle.sourceFiles.length,18);
  assert.deepEqual(bundle.migrations.map(x=>x.version),VERSIONS);assert.equal(bundle.functions.length,104);
  assert.equal(bundle.migrations.reduce((n,x)=>n+Buffer.byteLength(x.body),0),197812);
  assert.deepEqual(bundle.functions.find(x=>x.signature==='public.publish_live_stage_discovery(text,uuid)').roles,['postgres']);
  for(const x of bundle.migrations)assert.equal(x.body,fs.readFileSync(x.path,'utf8'));
  assert.throws(()=>projectFunctions([{body:'revoke all on function public.unknown() from public;'}],[]),/UNKNOWN_FUNCTION_ACL_TARGET/);
  assert.throws(()=>projectFunctions([{body:'begin; select 1; commit;'}],[]),/TRANSACTION_CONTROL_FORBIDDEN/);
  assert.throws(()=>projectFunctions([{body:'alter function public.unknown() owner to anon;'}],[]),/UNSUPPORTED_FUNCTION_ALTER/);
  assert.throws(()=>splitSQL("select 'unterminated"),/UNTERMINATED_SQL/);
  assert.equal(splitSQL("-- commit;\nselect 'a;''b'; /* nested /* ; */ ; */ select $$begin;commit;$$;").length,2);
  assert.equal(splitSQL("select 'ordinary\\'; commit;").length,2,'standard_conforming_strings=on');
  assert.equal(splitSQL("select E'escaped\\\';still-string'; select 2;").length,2,'explicit E strings');
});

test('read-only/idempotent, all partial or changed boundaries fail before writes',async()=>{
  let writes=0;
  const query=async(_sql,readOnly)=>{if(!readOnly)writes++;return ready();};
  assert.equal((await deploy({bundle,query})).status,'plan_ready');assert.equal(writes,0);
  for(const bad of [{...ready(),holds:false},{...ready(),defaults:false},{...ready(),baselineFunctions:false},{...ready(),objectsAbsent:false},{...applied(),targets:applied().targets.slice(1)}]){
    await assert.rejects(deploy({bundle,apply:true,query:async(sql,readOnly)=>{if(!readOnly)writes++;return sql===finalReadbackSql(bundle)?final():bad;}}));
  }
  assert.equal(writes,0);
  assert.equal(classifyState(bundle,applied(),final()),'applied');
  assert.throws(()=>classifyState(bundle,applied(),{...final(),privacy:false}),/FINAL_CATALOG_MISMATCH/);
  await assert.rejects(deploy({bundle,apply:true,query,recheckSource:()=>{throw Error('SOURCE_CHANGED');}}),/SOURCE_CHANGED/);assert.equal(writes,0);
});

test('uncertain writes are never retried or declared absent on an old snapshot',async()=>{
  for(const after of [ready(),applied()]){
    const calls=[];const result=await deploy({bundle,apply:true,query:async(sql,readOnly)=>{
      calls.push(readOnly);if(!readOnly)throw Error('private-provider-payload');
      if(sql===finalReadbackSql(bundle))return final();return calls.length===1?ready():after;
    }});
    assert.equal(result.status,after.targets.length?'applied_verified':'apply_unconfirmed');assert.equal(result.responseConfirmed,false);
    assert.equal(calls.filter(x=>!x).length,1);
  }
});

test('committed exact HEAD and immutable Git inputs are required; dirty/untracked tools fail',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-deployment-source-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:'pipe'}).trim();
  git('init','-q');git('config','user.name','Synthetic fixture');git('config','user.email','fixture@example.invalid');
  for(const file of [...bundle.sourceFiles.map(x=>x.file),TOOL,'scripts/studio-rolling-deploy.mjs']){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(file,path.join(dir,file));}
  git('add',...bundle.sourceFiles.map(x=>x.file),'scripts/studio-rolling-deploy.mjs');git('commit','-qm','synthetic source');
  assert.throws(()=>sourceBinding(dir,git('rev-parse','HEAD')));
  git('add',TOOL);git('commit','-qm','synthetic tool');const source=git('rev-parse','HEAD');
  assert.equal(sourceBinding(dir,source).source,source);assert.equal(loadBundle(dir,source).functions.length,104);
  assert.throws(()=>sourceBinding(dir,'0'.repeat(40)),/SOURCE_HEAD_MISMATCH/);
  fs.appendFileSync(path.join(dir,bundle.migrations[0].path),'\n-- uncommitted bytes');
  assert.equal(loadBundle(dir,source).migrations[0].body,bundle.migrations[0].body);
  assert.throws(()=>loadBundle(dir),/MIGRATION_HASH_MISMATCH/);assert.throws(()=>sourceBinding(dir,source),/TRACKED_SOURCE_DIRTY/);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,MANIFEST),'utf8'));manifest.migrations.push(manifest.migrations[0]);fs.writeFileSync(path.join(dir,MANIFEST),JSON.stringify(manifest));
  assert.throws(()=>loadBundle(dir),/MANIFEST_INVALID/);
});

test('real nine bodies atomically roll back failures, preserve exact history, and verify final closure',{timeout:180000},async t=>{
  const excluded=[...bundle.migrations.map(x=>x.path.split('/').at(-1)),'20261102093836_creator_clip_export_bounded_pool.sql','20261102094308_creator_clip_scale_lifecycle_ledger.sql','20261102194000_sandbox_creator_cashout_execution.sql'];
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,excludeMigrations:excluded});t.after(()=>db.close());
  // Synthetic local configuration aligns the approved live hold contract. No
  // provider network, real users, secrets, or production fixtures are accessed.
  await db.exec(`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
    insert into supabase_migrations.schema_migrations values('20261101215711','synthetic_fixture_predecessor',array['select 1;']);
    alter default privileges in schema public grant execute on functions to postgres;
    update private.discovery_invalidation_worker_config set enabled=true,collecting=true,token_sha256=repeat('a',64);
    update public.platform_money_kill_switches set state=case when key='stripe_connect_enabled' then 'sandbox_only' else 'off' end where key in ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled');`);
  const local={...bundle,manifest:{...bundle.manifest,baselineHistory:{count:1,maximum:'20261101215711'}}};
  const read=async()=> (await db.exec(readbackSql(local))).at(-1).rows[0].state;
  const readFinal=async()=> (await db.exec(finalReadbackSql(local))).at(-1).rows[0].state;
  const before=await read();assert.equal(classifyState(local,before),'ready');
  const sql=buildApplySql(local,before);
  const broken=sql.replace(bundle.migrations[4].body.replaceAll("'","''"),()=>"do $$begin raise exception ''synthetic_middle_failure'';end$$;");
  await assert.rejects(db.exec(broken),/synthetic_middle_failure/);await db.exec('rollback');
  assert.equal(classifyState(local,await read()),'ready');
  assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,1);
  const privacyRegression=sql.replace('-- live-room-postflight',"create policy synthetic_broad_read on public.watch_party_rooms for select to authenticated using(true);\n-- live-room-postflight");
  await assert.rejects(db.exec(privacyRegression),/live_room_final_catalog_mismatch/);await db.exec('rollback');
  assert.equal(classifyState(local,await read()),'ready');
  const missingAuthTrigger=sql.replace('-- live-room-postflight','drop trigger discovery_host_session_after_loss on auth.sessions;\n-- live-room-postflight');
  await assert.rejects(db.exec(missingAuthTrigger),/live_room_final_catalog_mismatch/);await db.exec('rollback');
  assert.equal(classifyState(local,await read()),'ready');
  await db.exec('grant execute on function public.publish_live_stage_discovery(text,uuid) to anon');
  await assert.rejects(db.exec(sql),/live_room_baseline_changed/);await db.exec('rollback');
  await db.exec('revoke execute on function public.publish_live_stage_discovery(text,uuid) from anon');
  await db.exec("insert into supabase_migrations.schema_migrations values('synthetic_drift','fixture',array['select 1;'])");
  await assert.rejects(db.exec(sql),/live_room_baseline_changed/);await db.exec('rollback');
  await db.exec("delete from supabase_migrations.schema_migrations where version='synthetic_drift'");
  await db.exec(buildApplySql(local,await read()));
  const after=await read(),checks=await readFinal();assert.deepEqual(checks,final());assert.equal(classifyState(local,after,checks),'applied');
  const records=(await db.query("select version,name,statements from supabase_migrations.schema_migrations where name<>'synthetic_fixture_predecessor' order by version")).rows;
  assert.equal(records.length,9);for(let i=0;i<9;i++)assert.deepEqual(records[i],{version:bundle.migrations[i].version,name:bundle.migrations[i].name,statements:[bundle.migrations[i].body]});
  let writes=0;assert.equal((await deploy({bundle:local,apply:true,query:async(query,readOnly)=>{if(!readOnly)writes++;return query===finalReadbackSql(local)?readFinal():read();}})).status,'already_applied_verified');assert.equal(writes,0);
});
