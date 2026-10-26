#!/usr/bin/env node
// Bounded native index/writer/DDL proof on a retained source-replayed fixture.
// No benchmark, production data, transport, or permission expansion.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {brandReferenceNativeContainer,brandNativeSpawnSync,brandNativeSpawn,brandNativePreflight} from './helpers/brand-reference-native-target.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const reportRoot=fileURLToPath(new URL('../../',import.meta.url));
const prior=JSON.parse(readFileSync(reportRoot+'brand-reference-index-native-guards.json','utf8'));
assert.equal(prior.status,'passed','complete source guard replay must pass first');
const {container,database}=prior;
brandReferenceNativeContainer(container);
assert.match(database,/^brand_guard_[0-9]+_[0-9a-f]{12}$/);
const table='brand_reference_index_guard_consumer';
const index='brand_reference_index_guard_gin';
const invalidIndex='brand_reference_index_guard_invalid';
const migration='supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql';
const source=readFileSync(root+migration,'utf8');
const sha=x=>createHash('sha256').update(x).digest('hex');
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const args=()=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','/tmp','-U','postgres','-d',database];
const docker=(a,input,timeout=45000)=>brandNativeSpawnSync(a,{input,encoding:'utf8',timeout,maxBuffer:8*1024*1024});
const prefix=`set statement_timeout='30s';set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';`;
const raw=sql=>docker(args(),prefix+sql);
const q=sql=>{const r=raw(sql);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
const report={status:'running',container,database,syntheticOnly:true,startedAt:new Date().toISOString(),migrationSHA256:sha(source),harnessSHA256:sha(readFileSync(new URL(import.meta.url))),checks:[],pgtapPrior:prior.pgtap};
const output=reportRoot+'brand-reference-index-native-races.json';
const checkpoint=phase=>{report.phase=phase;report.updatedAt=new Date().toISOString();writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(`${report.updatedAt} ${phase}`);};
const pass=label=>{report.checks.push(label);checkpoint(`PASS ${label}`);};
function session(name,sql,{transaction=true}={}){
 const child=brandNativeSpawn(args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);child.stdin.on('error',()=>{});
 const done=new Promise(resolve=>{child.on('error',e=>resolve({code:-1,stdout,stderr:e.message}));child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`${prefix}set application_name=${lit(name)};${transaction?"begin;set local idle_in_transaction_session_timeout='45s';":''}${sql};\n`);
 return {child,done,out:()=>stdout,err:()=>stderr};
}
async function until(predicate,label,sessions=[]){
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){if(predicate())return;for(const s of sessions)assert.equal(s.child.exitCode,null,`${label}: ${s.err()}`);await delay(25);}
 throw Error(`timeout: ${label}`);
}
async function ordered(holderSQL,waiterSQL,verify,{rollback=false}={}){
 const suffix=randomUUID().slice(0,8),hn='brand_index_holder_'+suffix,wn='brand_index_waiter_'+suffix;let holder,waiter;
 try{
  holder=session(hn,holderSQL+";select 'HOLDER_READY'");await until(()=>holder.out().includes('HOLDER_READY'),'holder ready',[holder]);
  waiter=session(wn,waiterSQL);waiter.child.stdin.end('commit;\n\\q\n');
  await until(()=>q(`select exists(select 1 from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(hn)} where w.application_name=${lit(wn)} and w.datname=current_database() and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid)));`)==='t','actual independent backend lock wait',[holder,waiter]);
  holder.child.stdin.end(`${rollback?'rollback':'commit'};\n\\q\n`);
  const [a,b]=await Promise.all([holder.done,waiter.done]);assert.equal(a.code,0,a.stderr);verify(b);
 }finally{
  for(const [name,s] of [[hn,holder],[wn,waiter]])if(s&&s.child.exitCode===null){q(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(name)};`);await s.done;}
 }
}
const available=()=>q(`select private.platform_brand_index_expression_v1('public.${table}'::regclass) is not null;`)==='t';
const register=()=>q(`do $$ declare s record;i oid;begin
 select * into s from private.platform_brand_index_spec_v1('public.${table}'::regclass);if not found then raise exception 'test table not eligible';end if;
 execute format('create index ${index} on public.${table} using gin ((%s) extensions.gin_trgm_ops)',s.scan_expression);
 i:='public.${index}'::regclass;
 insert into private.platform_brand_reference_indexes_v1(table_oid,index_oid,row_schema,scan_expression,index_expression,environment)
 select 'public.${table}'::regclass,i,s.row_schema,s.scan_expression,pg_get_expr(indexprs,indrelid,false),private.platform_brand_index_environment_v1() from pg_index where indexrelid=i
 on conflict(table_oid) do update set index_oid=excluded.index_oid,row_schema=excluded.row_schema,scan_expression=excluded.scan_expression,index_expression=excluded.index_expression,environment=excluded.environment;
 end $$;`);
const fixture=()=>{
 const id=randomUUID(),key=`brand-native-index-fixture/logo/${id}.png`;
 q(`alter table public.platform_brand_assets disable trigger queue_platform_brand_asset_scan_before;alter table public.platform_brand_assets disable trigger enqueue_platform_brand_asset_scan_after;
 insert into storage.objects(id,bucket_id,name,version,metadata) values(gen_random_uuid(),'platform-brand-assets',${lit(key)},'fixture-v1','{"size":23}');
 insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes) values(${lit(id)},'brand-native-index-fixture','logo',${lit(key)},${lit(key)},'image/png',23);
 alter table public.platform_brand_assets enable trigger queue_platform_brand_asset_scan_before;alter table public.platform_brand_assets enable trigger enqueue_platform_brand_asset_scan_after;`);return{id,key};
};
const remove=f=>`update public.platform_brand_assets set deleted_at=clock_timestamp(),asset_state='archived' where id=${lit(f.id)}`;
const clear=f=>`select private.platform_brand_retention_references_clear(${lit(f.id)})`;
let created=false;
try{
 checkpoint('verify exact installed candidate and retained synthetic cluster');
 assert.equal(sha(source),prior.sourceHashes[migration],'migration must be the exact source replayed');
 report.runtime=brandNativePreflight(container);
 report.installedBodies={};
 for(const name of ['platform_brand_index_environment_v1','platform_brand_index_spec_v1','platform_brand_index_expression_v1','platform_brand_retention_references_clear']){
  const expected=source.match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`))[1];
  const actual=JSON.parse(q(`select to_json(prosrc)::text from pg_proc where pronamespace='private'::regnamespace and proname=${lit(name)};`));
  assert.equal(actual,expected,`${name} installed body`);report.installedBodies[name]=sha(actual);
 }
 q(`create table public.${table}(id uuid primary key default gen_random_uuid(),media_url text,metadata jsonb default '{}',unrelated text,created_at timestamptz default timestamptz '2026-01-01 00:00:00+00');
 create trigger zzz_platform_brand_retention_reference before insert or update on public.${table} for each row execute function private.guard_platform_brand_retention_references();
 alter table public.${table} enable row level security;alter table public.${table} force row level security;
 create policy index_fixture_authorized on public.${table} to authenticated,service_role using(true) with check(true);
 grant select,insert,update,delete,truncate on public.${table} to authenticated,service_role;`);created=true;register();assert.ok(available());
 const expr=q(`select private.platform_brand_index_expression_v1('public.${table}'::regclass);`);
 assert.match(expr,/private\.platform_brand_index_normalize_v1/);
 pass('native normalized index expression validates against its registry');
 assert.equal(q(`begin;set local gin_fuzzy_search_limit=1;select private.platform_brand_index_expression_v1('public.${table}'::regclass) is null;rollback;`),'t');
 assert.equal(available(),true);pass('lossy GIN settings force exact fallback and reset restores the proven index');
 for(const role of ['authenticated','service_role']){
  assert.equal(q(`select has_function_privilege(${lit(role)},'private.platform_brand_retention_row_mentions(jsonb,text[],text,text)','EXECUTE');`),'f');
  assert.equal(q(`select has_schema_privilege(${lit(role)},'private','USAGE');`),'f');
  for(const signature of ['private.platform_brand_index_jsonb_bytes_v1(jsonb)','private.platform_brand_index_normalize_v1(text)'])
   assert.equal(q(`select has_function_privilege(${lit(role)},${lit(signature)},'EXECUTE');`),'t');
  q(`set role ${role};insert into public.${table}(media_url,metadata) values('ordinary-writer','{"status":"ok"}');update public.${table} set metadata='{"status":"updated%20value"}';delete from public.${table};insert into public.${table}(metadata) values('{}');truncate public.${table};reset role;`);
  pass(`${role} INSERT/UPDATE/DELETE/TRUNCATE maintains normalized indexes with pure helper EXECUTE and no private schema/matcher authority`);
 }
 for(const rollback of [false,true]){
  const f=fixture();
  await ordered(`set local role service_role;insert into public.${table}(media_url) values(${lit(f.key)})`,`${remove(f)};${clear(f)}`,r=>{assert.equal(r.code,0,r.stderr);assert.equal(r.stdout.trim(),rollback?'t':'f');pass(`indexed writer ${rollback?'rollback clears':'commit blocks'} after serialized retirement wait`);},{rollback});
 }
 for(const rollback of [false,true]){
  const f=fixture();
  await ordered(`${remove(f)};${clear(f)}`,`set local role service_role;insert into public.${table}(media_url) values(${lit(f.key)})`,r=>{
   if(rollback)assert.equal(r.code,0,r.stderr);else{assert.notEqual(r.code,0);assert.match(r.stderr,/brand_retained_reference_forbidden/);}
   pass(`indexed retirement ${rollback?'rollback permits':'commit rejects'} waiting authorized writer`);
  },{rollback});
 }
 q(`truncate public.${table};`);
 const f=fixture();q(remove(f));report.clearanceFixture=f;
 assert.equal(q(clear(f)),'t');pass('complete indexed baseline absence clears under source guards');
 await ordered(`lock table public.${table} in access share mode;select private.platform_brand_index_expression_v1('public.${table}'::regclass) is not null`,
  `alter table public.${table} add column "new locator" text`,r=>{assert.equal(r.code,0,r.stderr);pass('scan relation lock blocks concurrent ADD COLUMN until its transaction ends');});
 assert.equal(available(),false);pass('new locator column invalidates index fingerprint and selects exact fallback');
 q(`alter table public.${table} disable trigger zzz_platform_brand_retention_reference;insert into public.${table}("new locator") values(${lit(f.key)});alter table public.${table} enable trigger zzz_platform_brand_retention_reference;`);
 assert.equal(q(clear(f)),'f');pass('reference in newly added column blocks complete clearance via exact fallback');
 q(`truncate public.${table};alter table public.${table} drop column "new locator";drop index public.${index};`);register();assert.ok(available());
 for(const ddl of [`alter table public.${table} rename column unrelated to unrelated_renamed`,`alter table public.${table} alter column unrelated type varchar(300)`,`alter table public.${table} add column custom_array text[]`]){
  assert.equal(q(`begin;${ddl};select private.platform_brand_index_expression_v1('public.${table}'::regclass) is null;rollback;`),'t');
 }
 pass('column rename/type change/unsupported-array addition each invalidates the whole-row fingerprint');
 q(`drop index public.${index};`);assert.equal(available(),false);assert.equal(q(clear(f)),'t');pass('missing index falls back to exact clearance without cached absence');register();

 for(const rollback of [false,true]){
  q(`insert into public.${table}(metadata) values('{}');`);
  // A DDL default changes existing rows without invoking their DML trigger.
  // Clearance must wait for ACCESS EXCLUSIVE and then discover fresh columns.
  await ordered(`alter table public.${table} add column "ddl URL" text default ${lit(f.key)}`,
   clear(f),r=>{assert.equal(r.code,0,r.stderr);assert.equal(r.stdout.trim(),rollback?'t':'f');pass(`DDL-first ADD ${rollback?'rollback preserves indexed absence':'commit exposes new reference through fresh exact fallback'}`);},{rollback});
  q(`truncate public.${table};`);
  if(!rollback){q(`alter table public.${table} drop column "ddl URL";drop index public.${index};`);register();}
  assert.ok(available());
 }
 await ordered(`lock table public.${table} in access share mode`,
  `alter table public.${table} rename column unrelated to unrelated_renamed`,r=>{assert.equal(r.code,0,r.stderr);});
 assert.equal(available(),false);q(`alter table public.${table} rename column unrelated_renamed to unrelated;`);assert.ok(available());
 pass('scan relation lock blocks RENAME and fresh fingerprint follows the committed name');
 await ordered(`lock table public.${table} in access share mode`,
  `alter table public.${table} drop column unrelated cascade`,r=>{assert.equal(r.code,0,r.stderr);});
 assert.equal(available(),false);assert.equal(q(clear(f)),'t');q(`alter table public.${table} add column unrelated text;`);register();
 pass('scan relation lock blocks DROP and dropped index cannot suppress exact fallback');

 // A cancelled concurrent native build leaves a real invalid GIN index. Hold
 // an actual writer transaction so the cancellation happens before building.
 let holder,builder;const hn='brand_index_invalid_holder',bn='brand_index_invalid_builder';
 try{
  holder=session(hn,`insert into public.${table}(metadata) values('{}');select 'HOLDER_READY'`);await until(()=>holder.out().includes('HOLDER_READY'),'invalid-build holder ready',[holder]);
  const invalidExpr=q(`select private.platform_brand_index_expression_v1('public.${table}'::regclass);`);
  builder=session(bn,`create index concurrently ${invalidIndex} on public.${table} using gin ((${invalidExpr}) extensions.gin_trgm_ops)`,{transaction:false});builder.child.stdin.end('\\q\n');
  await until(()=>q(`select exists(select 1 from pg_index where indexrelid=to_regclass('public.${invalidIndex}') and not indisvalid);`)==='t','native invalid index catalog entry',[holder,builder]);
  q(`select pg_cancel_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(bn)};`);
  const b=await builder.done;assert.notEqual(b.code,0);assert.match(b.stderr,/canceling statement due to user request/);
  holder.child.stdin.end('rollback;\n\\q\n');assert.equal((await holder.done).code,0);
  assert.equal(q(`select indisvalid from pg_index where indexrelid='public.${invalidIndex}'::regclass;`),'f');
  assert.equal(q(`begin;update private.platform_brand_reference_indexes_v1 set index_oid='public.${invalidIndex}'::regclass,index_expression=(select pg_get_expr(indexprs,indrelid,false) from pg_index where indexrelid='public.${invalidIndex}'::regclass) where table_oid='public.${table}'::regclass;select private.platform_brand_index_expression_v1('public.${table}'::regclass) is null;rollback;`),'t');
  pass('real cancelled concurrent GIN build is invalid and cannot authorize indexed clearance');
 }finally{
  for(const [name,s] of [[hn,holder],[bn,builder]])if(s&&s.child.exitCode===null){q(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(name)};`);await s.done;}
  q(`drop index if exists public.${invalidIndex};`);
 }
 q(`alter table public.${table} disable trigger zzz_platform_brand_retention_reference;`);assert.equal(q(clear(f)),'f');q(`alter table public.${table} enable trigger zzz_platform_brand_retention_reference;`);pass('valid index does not bypass disabled reference-guard coverage');
 for(const isolation of ['repeatable read','serializable']){const r=raw(`begin isolation level ${isolation};${clear(f)};`);assert.notEqual(r.status,0);assert.match(r.stderr,/brand_retention_read_committed_required/);}
 pass('indexed clearance retains unsupported-isolation failures');
 report.status='passed';checkpoint('all bounded native index writer/DDL/failure guards complete');
}catch(error){report.status='failed';report.error=String(error.message);checkpoint('native indexed guard failure; retain diagnostics');throw error;
}finally{
 if(created){q(`delete from private.platform_brand_reference_indexes_v1 where table_oid='public.${table}'::regclass;drop table public.${table};`);report.ownedTableDropped=true;}
 report.retainedSyntheticFixture={container,database,socket:'/tmp'};writeFileSync(output,JSON.stringify(report,null,2)+'\n');
}
