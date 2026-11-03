import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Buffer} from 'node:buffer';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {loadBundle,projectFunctions,splitSQL,readbackSql,finalReadbackSql,buildApplySql,classifyState,deploy,sourceBinding,TOOL,MANIFEST,VERSIONS,diagnosticManagementQuery,safeHelperError,MANAGEMENT_CONTEXT_SQL,validateManagementContext,finalContractChecks} from '../scripts/live-room-exact-deploy.mjs';

const bundle=loadBundle();
const readContext={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
const ready=()=>({schema:1,database:'postgres',context:{...readContext},historySha256:'a'.repeat(64),catalogSha256:'b'.repeat(64),historyCount:574,historyMaximum:'20261101215711',holds:true,baselineFunctions:true,defaults:true,objectsAbsent:true,targets:[]});
const applied=()=>({...ready(),historyCount:583,targets:bundle.migrations.map(({version,name,statementsSha256})=>({version,name,statementsSha256}))});
const final=()=>({context:{...readContext},functions:true,holds:true,privacy:true,privateTables:true,schema:true});
const context={currentPostgres:true,currentReadOnly:false,sessionPostgres:true,sessionReadOnly:false,sessionAdmin:false,transactionReadOnly:true};

test('management diagnostics preserve request and expose only finite HTTP or transport categories',async()=>{
  const secret='synthetic-private-error';
  for(const [status,code] of [[400,'BAD_REQUEST'],[401,'AUTH_REJECTED'],[403,'FORBIDDEN'],[429,'RATE_LIMITED'],[500,'SERVER_ERROR'],[503,'SERVER_ERROR'],[418,'OTHER']]){
    let called=0,consumed=0;
    const query=diagnosticManagementQuery('synthetic-token',async(url,options)=>{
      called++;assert.equal(url,'https://api.supabase.com/v1/projects/bmkkhihfbmsnnmcqkoly/database/query');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{query:'SELECT 1',read_only:true});
      return {ok:false,status,body:{cancel:async()=>{}},text:async()=>{consumed++;return secret;}};
    });
    await assert.rejects(query('SELECT 1',true),new RegExp('^Error: MANAGEMENT_HTTP_'+code+'$'));assert.equal(called,1);assert.equal(consumed,0);
  }
  for(const [error,expected] of [[{cause:{code:'EAI_AGAIN'}},'DNS'],[{cause:{code:'SELF_SIGNED_CERT_IN_CHAIN'}},'TLS'],[{name:'TimeoutError'},'TIMEOUT'],[{cause:{code:secret}},'FAILED']]){
    await assert.rejects(diagnosticManagementQuery('synthetic-token',async()=>{throw error;})('SELECT 1',true),new RegExp('^Error: MANAGEMENT_TRANSPORT_'+expected+'$'));
  }
  const value=await diagnosticManagementQuery('synthetic-token',async()=>new Response(JSON.stringify([{state:ready()}]),{status:200}))('SELECT 1',true);
  assert.deepEqual(value,ready());
  assert.equal(safeHelperError(Error('ARBITRARY_UPPERCASE_SECRET')),'LIVE_ROOM_DEPLOY_BLOCKED');
  assert.equal(safeHelperError(Error('PRODUCTION_HOLDS_MISMATCH')),'PRODUCTION_HOLDS_MISMATCH');
  assert.deepEqual(validateManagementContext(context),context);
  for(const changed of [{...context,extra:true},{...context,currentPostgres:'true'},{...context,currentPostgres:false},{...context,currentReadOnly:true},{...context,sessionPostgres:false}])assert.throws(()=>validateManagementContext(changed),/MANAGEMENT_CONTEXT_INVALID|MANAGEMENT_CONTEXT_ROLE_UNKNOWN/);
});

test('immutable nine-only and eight-file closure, exact ordered function projection',()=>{
  assert.equal(bundle.migrations.length,9);assert.equal(bundle.sourceFiles.length,18);
  assert.deepEqual(bundle.migrations.map(x=>x.version),VERSIONS);assert.equal(bundle.functions.length,104);
  assert.equal(bundle.migrations.reduce((n,x)=>n+Buffer.byteLength(x.body),0),197812);
  assert.deepEqual(bundle.functions.find(x=>x.signature==='public.publish_live_stage_discovery(text,uuid)').roles,['postgres']);
  const contracts=finalContractChecks(bundle);assert.equal(contracts.length,185);assert.equal(new Set(contracts.map(x=>x.id)).size,185);
  for(const c of contracts)assert.match(c.id,/^(?:write_authority|privacy|privateTables|holds|function_\d{3}|schema_\d{3}|history_\d{3})$/u);
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
  for(const bad of [{...ready(),context},{...ready(),context:{...readContext,transactionReadOnly:false}},{...ready(),context:{...readContext,currentReadOnly:false}},{...ready(),holds:false},{...ready(),defaults:false},{...ready(),baselineFunctions:false},{...ready(),objectsAbsent:false},{...applied(),targets:applied().targets.slice(1)}]){
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
  const mock=path.join(dir,'synthetic-network.mjs');
  fs.writeFileSync(mock,`globalThis.fetch=async()=>new Response('synthetic-provider-secret',{status:401});`);
  try{execFileSync(process.execPath,['--import',mock,path.join(dir,TOOL),'--source',source],{cwd:dir,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:dir,SUPABASE_ACCESS_TOKEN:'synthetic-token'},encoding:'utf8',stdio:'pipe'});assert.fail('actual helper must reject');}
  catch(e){assert.equal(e.status,1);assert.equal(e.stdout,'');assert.equal(e.stderr,JSON.stringify({status:'blocked',code:'MANAGEMENT_HTTP_AUTH_REJECTED'})+'\n');}
  for(const holds of [true,false]){
    fs.writeFileSync(mock,`globalThis.fetch=async(url,options)=>{const q=JSON.parse(options.body);if(q.read_only!==true)throw Error('unexpected write');return new Response(JSON.stringify([{state:q.query===${JSON.stringify(MANAGEMENT_CONTEXT_SQL)}?${JSON.stringify(context)}:${JSON.stringify({...ready(),holds})}}]),{status:200});};`);
    try{const stdout=execFileSync(process.execPath,['--import',mock,path.join(dir,TOOL),'--source',source],{cwd:dir,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:dir,SUPABASE_ACCESS_TOKEN:'synthetic-token'},encoding:'utf8',stdio:'pipe'});assert.equal(holds,true);const actual=JSON.parse(stdout);assert.equal(actual.status,'plan_ready');assert.deepEqual(actual.context,readContext);}
    catch(e){assert.equal(holds,false);assert.equal(e.status,1);assert.equal(e.stderr,JSON.stringify({status:'blocked',code:'PRODUCTION_HOLDS_MISMATCH',context:readContext})+'\n');}
  }
  for(const observed of [context,{...readContext,currentReadOnly:false}]){
    fs.writeFileSync(mock,`globalThis.fetch=async(url,options)=>new Response(JSON.stringify([{state:JSON.parse(options.body).query===${JSON.stringify(MANAGEMENT_CONTEXT_SQL)}?${JSON.stringify(readContext)}:${JSON.stringify({...ready(),context:observed})}}]),{status:200});`);
    try{execFileSync(process.execPath,['--import',mock,path.join(dir,TOOL),'--source',source],{cwd:dir,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:dir,SUPABASE_ACCESS_TOKEN:'synthetic-token'},encoding:'utf8',stdio:'pipe'});assert.fail('full readback role must control admission');}
    catch(e){assert.equal(e.status,1);const error=JSON.parse(e.stderr);assert.equal(error.code,observed===context?'MANAGEMENT_READ_CONTEXT_MISMATCH':'MANAGEMENT_CONTEXT_ROLE_UNKNOWN');assert.deepEqual(error.context,observed===context?context:undefined);}
  }
  assert.throws(()=>sourceBinding(dir,'0'.repeat(40)),/SOURCE_HEAD_MISMATCH/);
  fs.appendFileSync(path.join(dir,bundle.migrations[0].path),'\n-- uncommitted bytes');
  assert.equal(loadBundle(dir,source).migrations[0].body,bundle.migrations[0].body);
  assert.throws(()=>loadBundle(dir),/MIGRATION_HASH_MISMATCH/);assert.throws(()=>sourceBinding(dir,source),/TRACKED_SOURCE_DIRTY/);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,MANIFEST),'utf8'));manifest.migrations.push(manifest.migrations[0]);fs.writeFileSync(path.join(dir,MANIFEST),JSON.stringify(manifest));
  assert.throws(()=>loadBundle(dir),/MANIFEST_INVALID/);
});

test('real nine bodies atomically roll back failures, preserve exact history, and verify final closure',{timeout:300000},async t=>{
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
  await db.exec(`create role supabase_read_only_user bypassrls;
    grant usage on schema public,private,auth,supabase_migrations to supabase_read_only_user;
    grant select on all tables in schema public,private,supabase_migrations to supabase_read_only_user;`);
  const asReadOnly=async sql=>{
    await db.exec('set session authorization supabase_read_only_user;begin read only;');
    try{return await db.exec(sql);}finally{await db.exec('rollback;set session authorization postgres;');}
  };
  const read=async()=> (await asReadOnly(readbackSql(local))).at(-1).rows[0].state;
  const readFinal=async()=> (await asReadOnly(finalReadbackSql(local))).at(-1).rows[0].state;
  const before=await read();assert.equal(classifyState(local,before),'ready');
  const postgresContext=validateManagementContext((await db.query(MANAGEMENT_CONTEXT_SQL)).rows[0].state);assert.equal(postgresContext.currentPostgres,true);
  assert.deepEqual(before.context,readContext);assert.equal(before.defaults,true);
  // Retain every original contract expression; only add exact indexed OID lookup.
  const optimized=readbackSql(local),originalShape=optimized.replaceAll(/p\.oid=pg_catalog\.to_regprocedure\('[^']+'\) and /gu,'');
  const originalStart=performance.now(),original=(await asReadOnly(originalShape)).at(-1).rows[0].state,originalMs=performance.now()-originalStart;
  const optimizedStart=performance.now(),indexed=await read(),indexedMs=performance.now()-optimizedStart;
  assert.deepEqual(indexed,original);
  t.diagnostic(`Full read-only fixture equivalent output: original shape ${originalMs.toFixed(1)}ms; indexed shape ${indexedMs.toFixed(1)}ms`);
  const explain=(await asReadOnly('set local search_path=pg_catalog,public;explain (analyze,format json) '+optimized.split(';').slice(1).join(';'))).at(-1).rows[0]['QUERY PLAN'];
  assert.match(JSON.stringify(explain),/pg_proc_oid_index/);
  // OID lookup must not substitute a same-named overload or hide contract drift.
  const target='public.publish_live_stage_discovery(text,uuid)';
  const definition=(await db.query(`select pg_get_functiondef('${target}'::regprocedure) definition`)).rows[0].definition;
  const equivalent=async expected=>{
    const indexedState=await read(),scanState=(await asReadOnly(originalShape)).at(-1).rows[0].state;
    assert.deepEqual(indexedState,scanState);assert.equal(indexedState.baselineFunctions,expected);
  };
  await db.exec('create function public.publish_live_stage_discovery(integer) returns integer language sql as $$select $1$$;');
  await equivalent(true);
  await db.exec('alter function '+target+' rename to synthetic_missing_publication;');
  await equivalent(false);
  await db.exec('alter function public.synthetic_missing_publication(text,uuid) rename to publish_live_stage_discovery;drop function public.publish_live_stage_discovery(integer);');
  assert.match(definition,/\$function\$/u);
  await db.exec(definition.replace('$function$','$function$\n-- synthetic body drift\n'));
  await equivalent(false);await db.exec(definition);
  await db.exec('grant execute on function '+target+' to anon;');
  await equivalent(false);await db.exec('revoke execute on function '+target+' from anon;');
  await db.exec('alter function '+target+" set search_path='public';");
  await equivalent(false);await db.exec(definition);
  assert.deepEqual(await read(),before);
  // Defaults belong to the deployment owner, never the API reader.
  await db.exec('alter default privileges for role supabase_read_only_user in schema public grant execute on functions to anon;');
  assert.equal((await read()).defaults,true);
  await db.exec('alter default privileges for role postgres in schema public revoke execute on functions from anon;');
  assert.equal((await read()).defaults,false);
  await db.exec('alter default privileges for role postgres in schema public grant execute on functions to anon;');
  assert.deepEqual(await read(),before);
  const sql=buildApplySql(local,before);
  await db.exec('set session authorization supabase_read_only_user;');
  try{await assert.rejects(db.exec(sql),/live_room_write_authority_required/);}finally{await db.exec('rollback;set session authorization postgres;');}
  assert.deepEqual(await read(),before);
  await assert.rejects(db.exec(sql.replace('begin;','begin read only;')),/live_room_write_authority_required/);await db.exec('rollback');
  await db.exec('update private.discovery_invalidation_worker_config set collecting=false;');
  await assert.rejects(db.exec(sql),/live_room_baseline_changed/);await db.exec('rollback');
  await db.exec('update private.discovery_invalidation_worker_config set collecting=true;');
  const broken=sql.replace(bundle.migrations[4].body.replaceAll("'","''"),()=>"do $$begin raise exception ''synthetic_middle_failure'';end$$;");
  await assert.rejects(db.exec(broken),/synthetic_middle_failure/);await db.exec('rollback');
  assert.equal(classifyState(local,await read()),'ready');
  assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,1);
  const privacyRegression=sql.replace('-- live-room-postflight',"create policy synthetic_broad_read on public.watch_party_rooms for select to authenticated using(true);\n-- live-room-postflight");
  await assert.rejects(db.exec(privacyRegression),/live_room_final_catalog_mismatch:privacy$/);await db.exec('rollback');
  assert.equal(classifyState(local,await read()),'ready');
  const missingAuthTrigger=sql.replace('-- live-room-postflight','drop trigger discovery_host_session_after_loss on auth.sessions;\n-- live-room-postflight');
  const triggerId=finalContractChecks(local).find(x=>x.target==='trigger:auth.sessions:discovery_host_session_after_loss').id;
  await assert.rejects(db.exec(missingAuthTrigger),new RegExp('live_room_final_catalog_mismatch:'+triggerId+'$'));await db.exec('rollback');
  assert.equal(classifyState(local,await read()),'ready');
  const functionId=finalContractChecks(local).find(x=>x.target==='public.can_browse_watch_party_room(text)').id;
  for(const [injection,id] of [
    ['revoke execute on function public.can_browse_watch_party_room(text) from authenticated;',functionId],
    ['update private.discovery_invalidation_worker_config set collecting=false;','holds'],
    [`delete from supabase_migrations.schema_migrations where version='${VERSIONS[0]}';`,'history_000'],
    ['set local role supabase_read_only_user;','write_authority'],
  ]){
    await assert.rejects(db.exec(sql.replace('-- live-room-postflight',injection+'\n-- live-room-postflight')),new RegExp('live_room_final_catalog_mismatch:'+id+'$'));
    await db.exec('rollback;set session authorization postgres;');assert.equal(classifyState(local,await read()),'ready');
  }
  await db.exec('grant execute on function public.publish_live_stage_discovery(text,uuid) to anon');
  await assert.rejects(db.exec(sql),/live_room_baseline_changed/);await db.exec('rollback');
  await db.exec('revoke execute on function public.publish_live_stage_discovery(text,uuid) from anon');
  await db.exec("insert into supabase_migrations.schema_migrations values('synthetic_drift','fixture',array['select 1;'])");
  await assert.rejects(db.exec(sql),/live_room_baseline_changed/);await db.exec('rollback');
  await db.exec("delete from supabase_migrations.schema_migrations where version='synthetic_drift'");
  await db.exec(buildApplySql(local,await read()));
  const after=await read(),checks=await readFinal();assert.deepEqual(checks,final());assert.equal(classifyState(local,after,checks),'applied');
  const version=Number((await db.query("select current_setting('server_version_num') n")).rows[0].n);
  const alterations=[
    'alter table public.watch_party_rooms alter column discovery_paused drop not null;',
    'alter table public.watch_party_rooms add constraint synthetic_changed_check check(host_settings_revision>42) not valid;',
    ...(version>=180000?[
      'alter table public.watch_party_rooms alter column discovery_paused drop not null;alter table public.watch_party_rooms add constraint synthetic_not_valid not null discovery_paused not valid;',
      'alter table public.watch_party_rooms alter column discovery_paused drop not null;alter table public.watch_party_rooms add constraint synthetic_no_inherit not null discovery_paused no inherit;',
    ]:[]),
  ];
  for(const alteration of alterations){
    await db.exec('begin;'+alteration);
    try{const changed=(await db.exec(finalReadbackSql(local))).at(-1).rows[0].state;assert.equal(changed.schema,false);}
    finally{await db.exec('rollback');}
    assert.deepEqual(await readFinal(),final());
  }
  const records=(await db.query("select version,name,statements from supabase_migrations.schema_migrations where name<>'synthetic_fixture_predecessor' order by version")).rows;
  assert.equal(records.length,9);for(let i=0;i<9;i++)assert.deepEqual(records[i],{version:bundle.migrations[i].version,name:bundle.migrations[i].name,statements:[bundle.migrations[i].body]});
  let writes=0;assert.equal((await deploy({bundle:local,apply:true,query:async(query,readOnly)=>{if(!readOnly)writes++;return query===finalReadbackSql(local)?readFinal():read();}})).status,'already_applied_verified');assert.equal(writes,0);
});
