#!/usr/bin/env node
// Synthetic-only retained-fixture benchmark. Setup and runtime are separate;
// every measured complete call retains the hard 30-second application budget.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {brandReferenceNativeContainer,brandNativeSpawnSync,brandNativeSpawn,brandNativePreflight} from './helpers/brand-reference-native-target.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=fileURLToPath(new URL('../../',import.meta.url));
const mode=process.argv[2];assert.ok(['--setup','--measure','--measure-query-revision'].includes(mode));
const originalReportPath=evidence+'brand-reference-index-performance-results.json';
const reportPath=mode==='--measure-query-revision'?evidence+'brand-reference-index-performance-cte-results.json':originalReportPath;
assert.equal(process.argv.length,3);
const prior=JSON.parse(readFileSync(evidence+'brand-reference-index-native-guards.json','utf8'));
const races=JSON.parse(readFileSync(evidence+'brand-reference-index-native-races.json','utf8'));
assert.equal(prior.status,'passed');assert.equal(races.status,'passed');
const {container,database}=prior;
brandReferenceNativeContainer(container);assert.match(database,/^brand_guard_[0-9]+_[0-9a-f]{12}$/);
const migration='supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql';
const source=readFileSync(root+migration,'utf8');
const sha=x=>createHash('sha256').update(x).digest('hex');
if(mode==='--setup'){
 const pilot=JSON.parse(readFileSync(evidence+'brand-reference-normalized-pilot-native.json','utf8'));
 assert.equal(pilot.status,'passed');assert.equal(pilot.container,container);assert.equal(pilot.database,database);
 assert.equal(pilot.migrationSHA256,sha(source));
 assert.deepEqual(pilot.tables.map(x=>[x.rows,x.passed,x.rollbackVerified]),[[3599,true,true],[429749,true,true]],
  'both default-planner native pilots and rollback readbacks must pass before full setup');
}
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const ident=x=>`"${String(x).replaceAll('"','""')}"`;
const args=['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','/tmp','-U','postgres','-d',database];
const prefix=`set application_name='brand_index_performance';set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';set track_functions='none';`;
const checkpoint=phase=>{report.phase=phase;report.updatedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(`${report.updatedAt} ${phase}`);};
let report;
if(mode==='--setup'){
 assert.ok(!existsSync(reportPath),'Do not repeat setup: reconcile the existing report and retained fixture first.');
 const head=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});assert.equal(head.status,0);
 report={status:'running',stage:'setup',container,database,head:head.stdout.trim(),migrationSHA256:sha(source),harnessSHA256:sha(readFileSync(new URL(import.meta.url))),
  startedAt:new Date().toISOString(),syntheticOnly:true,totalRows:1700000,populatedTables:354,largestRows:429749,encodedEvery:100,
  completedBatches:[],target:{id:randomUUID()},measurements:[],limitations:[
   'Synthetic local PostgreSQL measurements are not production latency guarantees.',
   '354 populated synthetic tables are added to the complete source schema; existing source tables remain in the clearance inventory.',
   'Bounded percent-containing documents are normalized in the index; uncertain rows remain mandatory exact candidates.',
   'Managed infrastructure doubles supply no scanner, media-byte, provider, or deployment evidence.',
   'Actual pathological JSONB serialization overflow requires the separate isolated native proof.'
  ]};
 report.target.key='brand-index-perf/'+report.target.id+'.png';
}else if(mode==='--measure-query-revision'){
 assert.ok(!existsSync(reportPath),'Reconcile an existing query-revision measurement before another attempt.');
 const original=JSON.parse(readFileSync(originalReportPath,'utf8'));
 assert.equal(original.status,'failed');assert.equal(original.measurements.length,1);
 assert.equal(original.measurements[0].timeout,true);assert.equal(original.fixture.rows,1700000);
 assert.equal(original.catalog.syntheticAvailable,354);assert.equal(original.container,container);assert.equal(original.database,database);
 const head=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});assert.equal(head.status,0);
 report={...original,status:'running',stage:'measure',head:head.stdout.trim(),migrationSHA256:sha(source),harnessSHA256:sha(readFileSync(new URL(import.meta.url))),
  priorMeasurement:{report:originalReportPath,head:original.head,migrationSHA256:original.migrationSHA256,measurements:original.measurements,installedBodySHA256:original.installedBodySHA256},
  measurements:[],measurementStartedAt:new Date().toISOString(),error:null};
}else{
 report=JSON.parse(readFileSync(reportPath,'utf8'));assert.equal(report.status,'setup_complete');
 assert.equal(report.migrationSHA256,sha(source));assert.equal(report.container,container);assert.equal(report.database,database);
 report.stage='measure';report.status='running';report.measurementStartedAt=new Date().toISOString();
}
const raw=(sql,{timeout=45000,budget='30s'}={})=>brandNativeSpawnSync(args,{input:prefix+`set statement_timeout='${budget}';\n`+sql+'\n',encoding:'utf8',timeout,maxBuffer:16*1024*1024});
const q=(sql,options)=>{const r=raw(sql,options);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
const batchSnapshot=tables=>JSON.parse(q(`select jsonb_build_object(
 'objects',(select coalesce(jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relkind) order by c.oid),'[]'::jsonb)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
  and c.relname=any(array[${tables.flatMap(t=>[t.name,t.name+'_pkey',t.name+'_created_at',t.name+'_gin']).map(lit).join(',')}])),
 'registry',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by table_oid)::text,'[]')) from private.platform_brand_reference_indexes_v1 r))::text;`,{budget:'10s',timeout:15000}));
async function batch(sql,label){
 checkpoint(label);const started=Date.now();let stdout='',stderr='',pending='';
 const child=brandNativeSpawn(args,{stdio:['pipe','pipe','pipe']});
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',chunk=>{stdout+=chunk;pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines){
  if(line.startsWith('PROGRESS:')){report.nativeProgress=JSON.parse(line.slice(9));report.nativeProgress.observedAt=new Date().toISOString();report.updatedAt=report.nativeProgress.observedAt;writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
 }});
 child.stderr.on('data',chunk=>stderr+=chunk);child.stdin.on('error',()=>{});
 const result=await new Promise(resolve=>{const timer=setTimeout(()=>child.kill('SIGTERM'),600000);child.on('error',error=>{clearTimeout(timer);resolve({code:-1,error:error.message});});child.on('close',code=>{clearTimeout(timer);resolve({code});});child.stdin.end(prefix+"set statement_timeout='180s';\n"+sql+'\n');});
 report.lastBatch={label,elapsedMs:Date.now()-started,exitCode:result.code,stderr,error:result.error??null};
 assert.equal(result.code,0,stderr||result.error||'setup process failed; inspect existing transaction before any retry');
 return stdout;
}
const body=(text,name)=>{const match=text.match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,'i'));assert.ok(match,`source body ${name}`);return match[1];};
function installedProof(){
 const earlier=readFileSync(root+'supabase/migrations/20261025121430_platform_brand_reference_scan_performance.sql','utf8');
 const normalizer=readFileSync(root+'supabase/migrations/20261020201310_deleted_content_stage_recovery.sql','utf8');
 const names=['platform_brand_retention_references_clear','platform_brand_index_spec_v1','platform_brand_index_expression_v1','platform_brand_index_environment_v1'];
 const expected=Object.fromEntries(names.map(n=>[n,body(source,n)]));
 expected.platform_brand_retention_row_mentions=body(earlier,'platform_brand_retention_row_mentions');
 expected.deleted_media_normalize_locator=body(normalizer,'deleted_media_normalize_locator');
 const actual=JSON.parse(q(`select jsonb_object_agg(proname,prosrc)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and proname=any(array[${Object.keys(expected).map(lit).join(',')}]);`));
 for(const [name,value] of Object.entries(expected))assert.equal(actual[name],value,`installed definition equals measured source: ${name}`);
 return Object.fromEntries(Object.entries(actual).map(([n,s])=>[n,sha(s)]));
}
function installQueryRevision(){
 const names=Object.keys(report.priorMeasurement.installedBodySHA256);
 const before=JSON.parse(q(`select jsonb_object_agg(proname,prosrc)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and proname=any(array[${names.map(lit).join(',')}]);`));
 const hashes=Object.fromEntries(Object.entries(before).map(([name,value])=>[name,sha(value)]));
 assert.deepEqual(hashes,report.priorMeasurement.installedBodySHA256,'retained database must still have the measured prior definitions');
 for(const name of ['platform_brand_index_spec_v1','platform_brand_index_expression_v1','platform_brand_index_environment_v1'])assert.equal(body(source,name),before[name],'query revision must not change index construction or eligibility');
 const definition=source.match(/create or replace function private\.platform_brand_retention_references_clear\([\s\S]*?\$\$;/)[0];
 assert.notEqual(sha(body(source,'platform_brand_retention_references_clear')),hashes.platform_brand_retention_references_clear);
 q('begin;'+definition+'commit;');
 report.queryRevision={beforeBodySHA256:hashes.platform_brand_retention_references_clear,afterBodySHA256:sha(body(source,'platform_brand_retention_references_clear')),installedAt:new Date().toISOString(),scope:'only the exact source clearance function in this synthetic disposable database; no index rebuild'};
 checkpoint('query revision installed; retained rows and native indexes reused');
}
function registration(table,index){return `do $$ declare s record;i oid;begin
 select * into s from private.platform_brand_index_spec_v1('public.${table}'::regclass);if not found then raise exception 'synthetic table not eligible';end if;
 execute format('create index ${index} on public.${table} using gin ((%s) extensions.gin_trgm_ops)',s.scan_expression);
 i:='public.${index}'::regclass;
 insert into private.platform_brand_reference_indexes_v1(table_oid,index_oid,row_schema,scan_expression,index_expression,environment)
 select 'public.${table}'::regclass,i,s.row_schema,s.scan_expression,pg_get_expr(indexprs,indrelid,false),private.platform_brand_index_environment_v1() from pg_index where indexrelid=i;
 end $$;`;}
function measured(sql,label,calls){
 checkpoint(label);const r=raw(`select 'SETTINGS:'||jsonb_build_object('statement_timeout',current_setting('statement_timeout'),'track_functions',current_setting('track_functions'),'isolation',current_setting('transaction_isolation'))::text;\n\\timing on\n${sql};\n\\timing off\n`);
 const settings=JSON.parse(r.stdout.match(/^SETTINGS:(.+)$/m)?.[1]??'null');assert.deepEqual(settings,{statement_timeout:'30s',track_functions:'none',isolation:'read committed'});
 const result={label,calls,settings,exitCode:r.status,processError:r.error?.message??null,stderr:r.stderr,psqlElapsedMs:Number(r.stdout.match(/^Time:\s+([0-9.]+)\s+ms/m)?.[1]??NaN),sql};
 if(r.status===0){result.value=JSON.parse(r.stdout.split('\n').find(x=>x.startsWith('{')));assert.equal(result.value.calls,calls);assert.equal(result.value.allAuthorized,true);result.completed=true;result.withinBudget=result.psqlElapsedMs<30000;}
 else{result.completed=false;result.withinBudget=false;result.timeout=/statement timeout/.test(r.stderr);}
 report.measurements.push(result);checkpoint(label+' finished');
 assert.ok(result.completed&&result.withinBudget,`${label} did not complete within 30 seconds; no further full-path repetition`);
}
try{
 checkpoint('verify existing isolated source fixture and installed definitions');
 report.runtime=brandNativePreflight(container);
 assert.equal(q("select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid();"),'0','do not benchmark concurrently with other fixture sessions');
 if(mode==='--measure-query-revision')installQueryRevision();
 report.installedBodySHA256=installedProof();
 if(mode==='--setup'){
  assert.equal(q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'brand_reference_perf_%';"),'0');
  checkpoint('create one synthetic historical archived target using the existing test fixture protocol');
  q(`begin;alter table public.platform_brand_assets disable trigger queue_platform_brand_asset_scan_before;alter table public.platform_brand_assets disable trigger enqueue_platform_brand_asset_scan_after;
   insert into storage.objects(id,bucket_id,name,version,metadata) values(gen_random_uuid(),'platform-brand-assets',${lit(report.target.key)},'fixture-v1','{"size":23}');
   insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes,scan_status) values(${lit(report.target.id)},'brand-index-perf','logo',${lit(report.target.key)},${lit(report.target.key)},'image/png',23,'manual_review');
   alter table public.platform_brand_assets enable trigger queue_platform_brand_asset_scan_before;alter table public.platform_brand_assets enable trigger enqueue_platform_brand_asset_scan_after;
   update public.platform_brand_assets set deleted_at=clock_timestamp(),asset_state='archived' where id=${lit(report.target.id)};commit;`);
  assert.equal(q(`select private.platform_brand_retention_references_clear(${lit(report.target.id)});`),'t','empty-source preflight');
  const tables=[];let offset=0;for(let n=0;n<354;n++){const rows=n===0?429749:3598+(n<=157?1:0);const name='brand_reference_perf_'+String(n).padStart(3,'0');tables.push({n,name,rows,offset});offset+=rows;}assert.equal(offset,1700000);report.tables=tables;
  // Bulk fixture construction precedes installation of each new synthetic
  // table's actual reference guard. No existing guard is disabled or bypassed.
  const groups=[[tables[0]],...Array.from({length:Math.ceil(353/25)},(_,i)=>tables.slice(1+i*25,1+(i+1)*25))];
  for(const [groupNo,group] of groups.entries()){
   report.pendingBatch={groupNo,tables:group,before:batchSnapshot(group)};
   assert.deepEqual(report.pendingBatch.before.objects,[],'only new synthetic objects may be created');
   let sql='begin;\n';for(const t of group){const index=t.name+'_gin';
    sql+=`select 'PROGRESS:'||jsonb_build_object('stage','fixture insert','table',${lit(t.name)},'rows',${t.rows})::text;
    create unlogged table public.${ident(t.name)}(id bigint primary key,created_at timestamptz not null,event_type text not null,metadata jsonb not null,unrelated text);
    create index ${ident(t.name+'_created_at')} on public.${ident(t.name)}(created_at);
    insert into public.${ident(t.name)} select n,timestamptz '2026-01-01 00:00:00+00'+n*interval '1 second','route_decision',
     jsonb_build_object('status','routed','route','primary','transport','webrtc','session','synthetic-${t.n}-'||n,'latencyMs',n%90,'attempt',1,'region','local','details',repeat('synthetic routing status ',3),'nested',jsonb_build_object('note',case when (${t.offset}+n)%100=0 then '%2569rrelevant' else 'irrelevant' end)),${lit(report.target.key)} from generate_series(1,${t.rows}) n;
    select 'PROGRESS:'||jsonb_build_object('stage','native index build','table',${lit(t.name)})::text;
    ${registration(t.name,index)}
    create trigger zzz_platform_brand_retention_reference before insert or update on public.${ident(t.name)} for each row execute function private.guard_platform_brand_retention_references();
    analyze public.${ident(t.name)};
    `;
   }sql+='commit;';await batch(sql,`setup batch ${groupNo+1}/${groups.length}: ${group[0].name} through ${group.at(-1).name}`);
   report.completedBatches.push({groupNo,tables:group.map(x=>x.name),rows:group.reduce((s,x)=>s+x.rows,0),elapsedMs:report.lastBatch.elapsedMs});
   report.pendingBatch=null;checkpoint(`setup batch ${groupNo+1}/${groups.length} committed`);
  }
  checkpoint('verify exact synthetic row counts, encoded mix, coverage and native index registration');
  const counts=JSON.parse(q(`select jsonb_agg(s order by table_name)::text from (${tables.map(t=>`select ${lit(t.name)} as table_name,count(*) as rows,count(*) filter(where metadata->'nested'->>'note'='%2569rrelevant') as encoded_rows,pg_total_relation_size('public.${t.name}') as bytes from public.${ident(t.name)}`).join(' union all ')}) s;`,{budget:'180s',timeout:210000}));
  assert.equal(counts.length,354);for(const [i,c] of counts.entries())assert.equal(Number(c.rows),tables[i].rows);
  report.fixture={rows:counts.reduce((s,x)=>s+Number(x.rows),0),encodedRows:counts.reduce((s,x)=>s+Number(x.encoded_rows),0),totalBytes:counts.reduce((s,x)=>s+Number(x.bytes),0),tables:counts};assert.equal(report.fixture.rows,1700000);assert.equal(report.fixture.encodedRows,17000);
  report.catalog=JSON.parse(q(`select jsonb_build_object('locatorTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0),'registeredIndexes',(select count(*) from private.platform_brand_reference_indexes_v1),'syntheticAvailable',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'brand_reference_perf_%' and private.platform_brand_index_expression_v1(c.oid) is not null),'guardsReady',private.deleted_content_brand_guards_ready())::text;`));
  assert.equal(report.catalog.syntheticAvailable,354);assert.equal(report.catalog.guardsReady,true);
  report.status='setup_complete';report.setupCompletedAt=new Date().toISOString();checkpoint('setup complete; fixture retained; no performance measurement yet');
 }else{
  // One wrapper per complete call batch; no per-row counters or statistics.
  q(`create or replace function private.native_measure_brand_index_clearance_v1(p_asset uuid,p_calls integer) returns jsonb language plpgsql as $$
   declare started timestamptz:=clock_timestamp();n integer;allowed boolean;begin
    for n in 1..p_calls loop allowed:=private.platform_brand_retention_references_clear(p_asset);if allowed is distinct from true then raise exception 'synthetic clearance not true';end if;end loop;
    return jsonb_build_object('calls',p_calls,'elapsedMs',extract(epoch from clock_timestamp()-started)*1000,'allAuthorized',true);end $$;
   create or replace function private.native_measure_brand_archived_rpc_v1(p_attempt jsonb,p_calls integer) returns jsonb language plpgsql as $$
   declare started timestamptz:=clock_timestamp();n integer;answer jsonb;begin
    for n in 1..p_calls loop answer:=public.read_platform_brand_archived_verification_attempt((p_attempt->>'attemptId')::uuid,(p_attempt->>'claimToken')::uuid,p_attempt->>'workerId');if answer->>'status' is distinct from 'authorized' then raise exception 'synthetic archived RPC not authorized';end if;end loop;
    return jsonb_build_object('calls',p_calls,'elapsedMs',extract(epoch from clock_timestamp()-started)*1000,'allAuthorized',true);end $$;`);
  for(const calls of [1,3])measured(`select private.native_measure_brand_index_clearance_v1(${lit(report.target.id)},${calls})`,'complete clearance '+calls+' call(s)',calls);
  // This local-only fixture follows archived-brand-fixture.mjs. Its gate,
  // request and attempt changes exist only in one rolled-back transaction;
  // no expiry/provider setting, external scanner, media read or transport runs.
  checkpoint('prepare rolled-back synthetic archived request/attempt and measure actual read RPC');
  const rpcSQL=`begin;update private.platform_brand_retention_settings set archived_verification_enabled=true;
   create temp table perf_archived_request as select public.request_platform_brand_archived_verification(${lit(report.target.id)},public.read_platform_brand_retention_binding(${lit(report.target.id)})) as id;
   create temp table perf_archived_attempt as select public.claim_platform_brand_archived_verification(array[id],'brand-index-perf-native')->'attempts'->0 as payload from perf_archived_request;
   select 'SETTINGS:'||jsonb_build_object('statement_timeout',current_setting('statement_timeout'),'track_functions',current_setting('track_functions'),'isolation',current_setting('transaction_isolation'))::text;
   \\timing on
   select private.native_measure_brand_archived_rpc_v1((select payload from perf_archived_attempt),1);
   select private.native_measure_brand_archived_rpc_v1((select payload from perf_archived_attempt),3);
   \\timing off
   rollback;`;
  const rpc=raw(rpcSQL,{timeout:150000});report.archivedRPC={exitCode:rpc.status,stderr:rpc.stderr,processError:rpc.error?.message??null,sql:rpcSQL};
  report.archivedRPC.settings=JSON.parse(rpc.stdout.match(/^SETTINGS:(.+)$/m)?.[1]??'null');
  report.archivedRPC.results=rpc.stdout.split('\n').filter(x=>x.startsWith('{')).map(JSON.parse);
  report.archivedRPC.clientTimesMs=[...rpc.stdout.matchAll(/^Time:\s+([0-9.]+)\s+ms/gm)].map(x=>Number(x[1]));
  checkpoint('archived RPC measurements returned; transaction rolled back or connection closed');
  assert.equal(rpc.status,0,rpc.stderr||rpc.error?.message);assert.equal(report.archivedRPC.results.length,2);
  assert.deepEqual(report.archivedRPC.results.map(x=>x.calls),[1,3]);assert.ok(report.archivedRPC.results.every(x=>x.allAuthorized&&x.elapsedMs<30000));
  assert.deepEqual(report.archivedRPC.settings,{statement_timeout:'30s',track_functions:'none',isolation:'read committed'});
  assert.equal(q('select archived_verification_enabled from private.platform_brand_retention_settings;'),'f','synthetic local gate rollback');
  checkpoint('collect separate native EXPLAIN ANALYZE and execution counts for largest indexed audit');
  const table=report.tables[0].name;const expr=q(`select private.platform_brand_index_expression_v1('public.${table}'::regclass);`);
  const oid=q(`select 'public.${table}'::regclass::oid;`);const pattern='%'+report.target.key.replaceAll('!','!!').replaceAll('%','!%').replaceAll('_','!_')+'%';
  const candidate=`((${expr}) like ${lit(pattern)} escape '!' or (${expr}) like ${lit(pattern)} escape '!' or (${expr})='!brand-reference-exact-fallback-v1!')`;
  const scan=`with candidates as materialized (select * from public.${table} x where ${candidate}) select exists(select 1 from candidates x where true and private.platform_brand_retention_row_mentions(to_jsonb(x),(select private.deleted_media_locator_columns(${oid}::oid))::text[],${lit(report.target.key)},${lit(report.target.key)}))`;
  const statistics=()=>JSON.parse(q("select coalesce(jsonb_object_agg(funcname,calls),'{}'::jsonb)::text from pg_stat_user_functions where schemaname='private' and funcname in ('platform_brand_retention_row_mentions','deleted_media_locator_columns','deleted_media_normalize_locator');"));
  const before=statistics();
  const plan=JSON.parse(q("set track_functions='all';explain (analyze,buffers,format json) "+scan+';select pg_stat_force_next_flush();'));
  const after=statistics();const calls=Object.fromEntries(Object.entries(after).map(([name,count])=>[name,Number(count)-Number(before[name]??0)]));
  report.plan={sql:scan,result:plan,instrumented:true,functionCalls:calls};
  const nodes=[];const visit=n=>{nodes.push(n);for(const p of n.Plans??[])visit(p);};visit(plan[0].Plan);
  assert.ok(nodes.some(x=>x['Node Type']==='Bitmap Index Scan'||x['Node Type']==='Index Scan'),'native plan actually uses an index');
  assert.equal(calls.deleted_media_locator_columns??0,0,'empty normalized candidate set needs no exact-check locator lookup');
  assert.equal(calls.platform_brand_retention_row_mentions??0,0,'irrelevant encoded documents produce no exact matcher calls');
  assert.equal(calls.deleted_media_normalize_locator??0,0,'normalization is maintained by the index rather than repeated on absent scans');
  report.installedBodySHA256After=installedProof();assert.deepEqual(report.installedBodySHA256After,report.installedBodySHA256);
  report.status='passed';report.completedAt=new Date().toISOString();checkpoint('native end-to-end measurement complete; fixture and evidence retained');
 }
}catch(error){
 report.status='failed';report.error=String(error.message);
 if(report.pendingBatch){
  const rollback={scope:'Only the failed synthetic setup transaction; earlier committed batches remain.',verified:false};
  report.failedBatchRollback=rollback;
  try{
   rollback.before=report.pendingBatch.before;rollback.after=batchSnapshot(report.pendingBatch.tables);
   rollback.verified=JSON.stringify(rollback.after)===JSON.stringify(rollback.before);
   rollback.checkedAt=new Date().toISOString();
  }catch(auditError){rollback.error=String(auditError.message);}
 }
 checkpoint('stopped after failure; saved explicit rollback state, no automatic retry');throw error;
}
