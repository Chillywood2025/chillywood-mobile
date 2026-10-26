#!/usr/bin/env node
// Two bounded pilots in a newly created recovery fixture. Each transaction
// always rolls back, including its rows, index registration and writer guard.
// No historical benchmark database or retained source rows are used.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {brandReferenceNativeContainer,brandNativeSpawnSync,brandNativeSpawn,brandNativePreflight} from './helpers/brand-reference-native-target.mjs';

assert.equal(process.argv.length,2);
const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=fileURLToPath(new URL('../../',import.meta.url));
const reportPath=evidence+'brand-reference-normalized-pilot-native.json';
assert.ok(!existsSync(reportPath),'Preserve prior attempts; reconcile the report before another run.');
const fixture=JSON.parse(readFileSync(evidence+'brand-reference-index-native-guards.json','utf8'));
assert.equal(fixture.status,'passed');assert.equal(fixture.keepFixture,true);
const {container,database}=fixture;
brandReferenceNativeContainer(container);assert.match(database,/^brand_guard_[0-9]+_[0-9a-f]{12}$/);
const ddl=JSON.parse(readFileSync(evidence+'brand-reference-normalized-ddl-native.json','utf8'));
assert.equal(ddl.status,'passed');assert.equal(ddl.checks.length,28);
const migration='supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql';
const source=readFileSync(root+migration,'utf8');
const sha=x=>createHash('sha256').update(x).digest('hex');
assert.equal(ddl.sourceSHA256,sha(source),'native helper DDL checks must cover the measured source');
assert.equal(fixture.sourceHashes[migration],sha(source),'source fixture must cover the measured migration');
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const args=['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','/tmp','-U','postgres','-d',database];
const prefix="set application_name='brand_normalized_recovery_pilot';set track_functions='none';set request.jwt.claims='{\"role\":\"service_role\"}';set request.jwt.claim.role='service_role';";
const q=sql=>{
 const r=brandNativeSpawnSync(args,{input:prefix+"set statement_timeout='10s';\n"+sql+'\n',encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
 assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();
};
const report={status:'running',startedAt:new Date().toISOString(),syntheticOnly:true,container,database,
 migrationSHA256:sha(source),harnessSHA256:sha(readFileSync(new URL(import.meta.url))),tables:[],
 target:{key:'brand-recovery-pilot/'+randomUUID()+'.png'},
 limitations:['Synthetic two-size native pilots only; no full clearance or archived-RPC performance claim.',
  'Setup statements retain the 180-second limit and measured queries retain the 30-second limit.',
  'All pilot objects and generated rows are rolled back, with independent catalog readback.']};
const checkpoint=phase=>{report.phase=phase;report.updatedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(report.updatedAt+' '+phase);};
const snapshot=table=>JSON.parse(q(`select jsonb_build_object(
 'objects',(select coalesce(jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relkind) order by c.oid),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(array[${[table,table+'_pkey',table+'_created_at',table+'_gin'].map(lit).join(',')}])),
 'registry', (select md5(coalesce(jsonb_agg(to_jsonb(r) order by table_oid)::text,'[]')) from private.platform_brand_reference_indexes_v1 r))::text;`));
async function run(sql){
 const child=brandNativeSpawn(args,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.stdin.on('error',()=>{});
 const result=await new Promise(resolve=>{
  const timer=setTimeout(()=>child.kill('SIGTERM'),600000);
  child.on('error',error=>{clearTimeout(timer);resolve({code:-1,error:error.message});});
  child.on('close',code=>{clearTimeout(timer);resolve({code});});
  child.stdin.end(prefix+sql+'\n');
 });
 return {...result,stdout,stderr};
}
try{
 checkpoint('verify new isolated source fixture and unchanged native-tested source');
 report.runtime=brandNativePreflight(container);
 assert.equal(q('select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid();'),'0');
 assert.equal(q('select archived_verification_enabled from private.platform_brand_retention_settings;'),'f');
 for(const name of ['platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1','platform_brand_index_environment_v1','platform_brand_index_spec_v1','platform_brand_index_expression_v1','platform_brand_retention_references_clear']){
  const expected=source.match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`))?.[1];assert.ok(expected,name);
  assert.equal(JSON.parse(q(`select to_json(prosrc)::text from pg_proc where pronamespace='private'::regnamespace and proname=${lit(name)};`)),expected,name+' installed body');
 }
 const settings=JSON.parse(q("select jsonb_build_object('maintenance_work_mem',current_setting('maintenance_work_mem'),'work_mem',current_setting('work_mem'),'gin_fuzzy_search_limit',current_setting('gin_fuzzy_search_limit'))::text;"));
 assert.equal(settings.gin_fuzzy_search_limit,'0');report.settings=settings;
 for(const [label,rows] of [['small',3599],['large',429749]]){
  const table='brand_reference_recovery_pilot_'+label;
  const entry={table,rows,before:snapshot(table)};report.tables.push(entry);assert.deepEqual(entry.before.objects,[]);
  const pattern='%'+report.target.key.replaceAll('!','!!').replaceAll('%','!%').replaceAll('_','!_')+'%';
  const sql=`set statement_timeout='180s';begin;
   create unlogged table public.${table}(id bigint primary key,created_at timestamptz not null,event_type text not null,metadata jsonb not null,unrelated text);
   create index ${table}_created_at on public.${table}(created_at);
   insert into public.${table} select n,timestamptz '2026-01-01 00:00:00+00'+n*interval '1 second','route_decision',
    jsonb_build_object('status','routed','route','primary','transport','webrtc','session','synthetic-'||n,'latencyMs',n%90,'attempt',1,'region','local','details',repeat('synthetic routing status ',3),'nested',jsonb_build_object('note',case when n%100=0 then '%2569rrelevant' else 'irrelevant' end)),${lit(report.target.key)} from generate_series(1,${rows}) n;
   do $$ declare s record;i oid;begin
    select * into strict s from private.platform_brand_index_spec_v1('public.${table}'::regclass);
    execute format('create index ${table}_gin on public.${table} using gin ((%s) extensions.gin_trgm_ops)',s.scan_expression);
    i:='public.${table}_gin'::regclass;
    insert into private.platform_brand_reference_indexes_v1(table_oid,index_oid,row_schema,scan_expression,index_expression,environment)
    select 'public.${table}'::regclass,i,s.row_schema,s.scan_expression,pg_get_expr(indexprs,indrelid,false),private.platform_brand_index_environment_v1() from pg_index where indexrelid=i;
   end $$;
   create trigger zzz_platform_brand_retention_reference before insert or update on public.${table} for each row execute function private.guard_platform_brand_retention_references();
   analyze public.${table};set statement_timeout='30s';
   select 'COUNTS:'||jsonb_build_object('rows',count(*),'encodedRows',count(*) filter(where metadata->'nested'->>'note'='%2569rrelevant'),'indexBytes',pg_relation_size('public.${table}_gin'),'eligible',private.platform_brand_index_expression_v1('public.${table}'::regclass) is not null)::text from public.${table};
   select format('with candidates as materialized (select * from public.${table} x where ((%1$s) like %2$L escape ''!'' or (%1$s)=''!brand-reference-exact-fallback-v1!'')) select exists(select 1 from candidates x where private.platform_brand_retention_row_mentions(to_jsonb(x),(select private.deleted_media_locator_columns(''public.${table}''::regclass))::text[],%3$L,%3$L))',private.platform_brand_index_expression_v1('public.${table}'::regclass),${lit(pattern)},${lit(report.target.key)}) as query \\gset
   explain (analyze,buffers,format json) :query;
   :query;
   rollback;`;
  entry.sql=sql;checkpoint(`run ${rows}-row native pilot with unchanged setup/runtime budgets`);
  const start=Date.now();const result=await run(sql);entry.wallMs=Date.now()-start;entry.execution=result;
  // A process exit alone is insufficient rollback evidence, especially after
  // cancellation. Read the original catalog state from another connection.
  entry.after=snapshot(table);entry.rollbackVerified=JSON.stringify(entry.after)===JSON.stringify(entry.before);
  assert.equal(entry.rollbackVerified,true,'rows, tables, indexes and registry must roll back together');
  assert.equal(result.code,0,result.stderr||result.error);
  const counts=JSON.parse(result.stdout.match(/^COUNTS:(.+)$/m)?.[1]??'null');entry.counts=counts;
  assert.equal(counts.rows,rows);assert.equal(counts.encodedRows,Math.floor(rows/100));assert.equal(counts.eligible,true);
  const begin=result.stdout.indexOf('[\n');const end=result.stdout.lastIndexOf('\n]');assert.ok(begin>=0&&end>begin,'native JSON EXPLAIN result');
  entry.plan=JSON.parse(result.stdout.slice(begin,end+2));
  const nodes=[];const visit=n=>{nodes.push(n);for(const p of n.Plans??[])visit(p);};visit(entry.plan[0].Plan);
  assert.ok(nodes.some(n=>n['Node Type']==='Bitmap Index Scan'||n['Node Type']==='Index Scan'),'default native planner must use an index');
  assert.ok(entry.plan[0]['Execution Time']<30000);assert.match(result.stdout,/\nf\s*$/,'exact absent reference result');
  entry.passed=true;checkpoint(`PASS ${rows}-row native pilot and independent rollback readback`);
 }
 report.status='passed';checkpoint('both native pilots passed; full 1.7-million-row clearance remains a separate gate');
}catch(error){report.status='failed';report.error=String(error.message);checkpoint('pilot stopped; no automatic retry or complete performance claim');throw error;}
finally{report.completedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
