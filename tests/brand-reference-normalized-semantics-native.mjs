#!/usr/bin/env node
// Native PostgreSQL component semantics in one new synthetic database. Never
// reads the retained performance database. Large overflow testing is separate.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {referenceScanFixtureSQL,referenceScanEquivalenceSQL,referenceScanCases,referenceScanErrors,sqlLiteral as lit} from './helpers/brand-reference-scan-corpus.mjs';
import {brandReferenceNativeContainer,brandNativeSpawnSync,brandNativePreflight} from './helpers/brand-reference-native-target.mjs';

assert.equal(process.argv.length,2,'this bounded component harness accepts no runtime overrides');
const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=fileURLToPath(new URL('../../',import.meta.url));
const reportPath=evidence+'brand-reference-normalized-semantics-native.json';
assert.ok(!existsSync(reportPath),'preserve prior results; reconcile before a new run');
const container=brandReferenceNativeContainer();
const database=`brand_normalized_semantics_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const migrationName='supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql';
const source=readFileSync(root+migrationName,'utf8');
const reference=readFileSync(root+'supabase/migrations/20261020141554_deleted_media_reference_retirement.sql','utf8');
const normalizer=readFileSync(root+'supabase/migrations/20261020201310_deleted_content_stage_recovery.sql','utf8');
const matcher=readFileSync(root+'supabase/migrations/20261025121430_platform_brand_reference_scan_performance.sql','utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const fn=(sql,name)=>{const result=sql.match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?\\$\\$;`));assert.ok(result,name);return result[0];};
const body=sql=>sql.match(/as \$\$([\s\S]*?)\$\$;/)[1];
const ident=value=>`"${value.replaceAll('"','""')}"`;
const sentinel='!brand-reference-exact-fallback-v1!';
const pattern=value=>value===null?null:`%${value.replaceAll('!','!!').replaceAll('%','!%').replaceAll('_','!_')}%`;
const docker=(args,input)=>brandNativeSpawnSync(args,{input,encoding:'utf8',maxBuffer:4*1024*1024,timeout:45000});
const checked=(result,label)=>{assert.equal(result.status,0,`${label}: ${result.stderr||result.error?.message}`);return result.stdout.trim();};
const args=db=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','/tmp','-U','postgres','-d',db];
const q=(sql,db=database)=>checked(docker(args(db),"set statement_timeout='30s';\n"+sql),'synthetic semantic SQL');
const json=sql=>JSON.parse(q(sql));
const report={status:'running',startedAt:new Date().toISOString(),container,database,syntheticOnly:true,
 sourceHead:checked(spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}),'source head'),
 sourceSHA256:sha(source),harnessSHA256:sha(readFileSync(new URL(import.meta.url))),
 corpusSHA256:sha(readFileSync(new URL('./helpers/brand-reference-scan-corpus.mjs',import.meta.url))),
 checks:[],limitations:[
  'Small independent component database, not full-schema Brand or end-to-end timing proof.',
  'No retained benchmark database read or mutation.',
  'Pathological >1GiB text serialization overflow is not run by this harness.',
  'Exception-class injection executes the exact handler fragment, not a forced resource failure in the actual helper.',
 ]};
const checkpoint=phase=>{report.phase=phase;report.updatedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(`${report.updatedAt} ${phase}`);};
const pass=label=>{report.checks.push(label);checkpoint('PASS '+label);};
let created=false;
try{
 checkpoint('read-only isolated container preflight');
 report.runtime=brandNativePreflight(container);
 report.server=JSON.parse(q(`select json_build_object('version',version(),'server_version_num',current_setting('server_version_num'),'encoding',current_setting('server_encoding'),'statement_timeout',current_setting('statement_timeout'),'track_functions',current_setting('track_functions'))::text;`,'postgres'));
 assert.equal(report.server.server_version_num,'170006');
 assert.equal(q(`select count(*) from pg_roles where rolname in ('anon','authenticated','service_role');`,'postgres'),'3');
 q(`create database ${database} template template0;`,'postgres');created=true;
 checkpoint('install exact helper, oracle, catalog components in new database');
 const functionSources=[
  ['deleted_media_normalize_locator',normalizer],
  ...['deleted_media_locator_columns','deleted_media_locator_document','deleted_media_mentions'].map(name=>[name,reference]),
  ['platform_brand_retention_row_mentions',matcher],
  ...['platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1','platform_brand_index_environment_v1','platform_brand_index_spec_v1','platform_brand_index_expression_v1'].map(name=>[name,source]),
 ];
 q('create schema private;create schema extensions;create extension pg_trgm with schema extensions;');
 for(const [name,sql] of functionSources.slice(0,7))q(fn(sql,name));
 assert.equal(body(fn(source,'platform_brand_index_normalize_v1')),body(fn(normalizer,'deleted_media_normalize_locator')),'literal frozen decoder');
 for(const statement of source.matchAll(/^(?:grant|revoke)\s+[^;]*?on function\s+private\.platform_brand_index_(?:jsonb_bytes|normalize)_v1[^;]*;/gmi))q(statement[0]);
 q(matcher.match(/revoke all on function private\.platform_brand_retention_row_mentions[^;]+;/i)[0]);
 q(source.match(/create table private\.platform_brand_reference_indexes_v1[\s\S]*?revoke all on private\.platform_brand_reference_indexes_v1[^;]+;/)[0]);
 for(const [name,sql] of functionSources.slice(7))q(fn(sql,name));
 q(source.match(/revoke all on function private\.platform_brand_index_environment_v1[^;]+;/)[0]);
 report.installedBodySHA256={};
 for(const [name,sql] of functionSources){const installed=json(`select to_json(prosrc)::text from pg_proc where pronamespace='private'::regnamespace and proname=${lit(name)};`);assert.equal(installed,body(fn(sql,name)),name+' installed exact body');report.installedBodySHA256[name]=sha(installed);}
 q(referenceScanFixtureSQL);
 q(`create function private.brand_semantic_capture(p_sql text) returns jsonb language plpgsql set search_path='' as $$
 declare result text;begin
  execute p_sql into result;return jsonb_build_object('status','ok','value',result);
 exception when sqlstate '57014' then return jsonb_build_object('status','error','code',sqlstate,'message',sqlerrm);
 when others then return jsonb_build_object('status','error','code',sqlstate,'message',sqlerrm);
 end $$;
 revoke all on function private.brand_semantic_capture(text) from public,anon,authenticated,service_role;`);
 pass('exact installed helper bodies match current source and only component data exists');

 checkpoint('native legacy matcher and raw normalization corpus');
 const legacy=json(`select jsonb_agg(t)::text from (${referenceScanEquivalenceSQL()}) t;`);
 assert.equal(legacy.length,referenceScanCases.length);assert.deepEqual(legacy.filter(row=>!row.equivalent||!row.expected_matches),[]);
 report.legacyMatcherCases=legacy.length;pass('legacy Boolean and SQL NULL corpus remains equivalent');
 const inputs=[...referenceScanCases.map(c=>c.document),null,'','雪/é/😀 "quoted" \\path','literal%','%00%1F%7f%80%ff','%252525252F','a%25%32%46b'];
 const normalizeRows=json(`with inputs(id,value) as (values ${inputs.map((value,i)=>`(${i},${lit(value)}::text)`).join(',')})
 select jsonb_agg(jsonb_build_object('id',id,'equal',private.platform_brand_index_normalize_v1(value) is not distinct from private.deleted_media_normalize_locator(value)))::text from inputs;`);
 assert.equal(normalizeRows.length,inputs.length);assert.deepEqual(normalizeRows.filter(row=>!row.equal),[]);report.rawNormalizationCases=inputs.length;
 pass('frozen full-text normalization matches current oracle for percent depths, malformed bytes, Unicode, JSON escapes and NULL');
 const errorValues=referenceScanErrors.map(item=>{
  const table=item.table?`${lit(item.table)}::regclass::oid`:'0::oid';
  const old=`select private.deleted_media_mentions(private.deleted_media_locator_document(${lit(item.document)}::jsonb,${table}),'brand/logo.png') or private.deleted_media_mentions(private.deleted_media_locator_document(${lit(item.document)}::jsonb,${table}),'storage/brand/logo.png')`;
  const current=`select private.platform_brand_retention_row_mentions(${lit(item.document)}::jsonb,private.deleted_media_locator_columns(${table}),'brand/logo.png','storage/brand/logo.png')`;
  return `(${lit(item.label)},${lit(old)},${lit(current)})`;
 });
 report.matcherErrors=json(`with inputs(label,old_sql,new_sql) as(values ${errorValues.join(',')}) select jsonb_agg(jsonb_build_object('label',label,'old',private.brand_semantic_capture(old_sql),'current',private.brand_semantic_capture(new_sql)))::text from inputs;`);
 for(const result of report.matcherErrors){assert.equal(result.old.status,'error',result.label);assert.deepEqual(result.current,result.old,result.label);}
 pass('15 scalar/array/JSON-null errors preserve original SQLSTATE and message across selected, empty and unknown table contexts');

 checkpoint('native canonical index projection and literal candidates');
 q(`create table public.brand_normalized_corpus(id integer primary key,metadata jsonb,payload jsonb,media_url text,"Odd URL ""雪""" text,unrelated text,created_at timestamptz);
 create table public.brand_normalized_percent_columns(like public.brand_normalized_corpus including all);
 alter table public.brand_normalized_percent_columns add column "percent%path" text,add column "percent%2Fpath" text;
 create table private.brand_normalized_needles(id integer,key text,path text);`);
 const cases=referenceScanCases.filter(item=>item.table==='public.brand_reference_matcher_fixture');
 const physicalRows=cases.map((item,i)=>({...JSON.parse(item.document??'{}'),id:i+1,created_at:'2026-01-01T00:00:00Z'}));
 q(`insert into private.brand_normalized_needles values ${cases.map((item,i)=>`(${i+1},${lit(item.key)},${lit(item.path)})`).join(',')};`);
 report.physicalDocumentCases=0;report.normalizedPercentRows=0;
 for(const [i,table] of ['public.brand_normalized_corpus','public.brand_normalized_percent_columns'].entries()){
  const subset=physicalRows.filter(row=>Object.keys(row).some(key=>key.includes('%'))===(i===1));
  q(`insert into ${table} select * from jsonb_populate_recordset(null::${table},${lit(JSON.stringify(subset))}::jsonb);`);
  const expr=q(`select scan_expression from private.platform_brand_index_spec_v1(${lit(table)}::regclass);`);assert.ok(expr);
  q(`create index brand_normalized_semantic_${i} on ${table} using gin ((${expr}) extensions.gin_trgm_ops);`);
  const values=json(`with documents as (
   select x.id,n.key,n.path,${expr} candidate_document,
    private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass)::text projected_document,
    private.deleted_media_normalize_locator(private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass)::text) original_document,
    private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass),n.key)
     or private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass),n.path) original,
    private.platform_brand_retention_row_mentions(to_jsonb(x),private.deleted_media_locator_columns(${lit(table)}::regclass),n.key,n.path) exact
   from ${table} x join private.brand_normalized_needles n on n.id=x.id
  ),matches as(select *,candidate_document like '%'||replace(replace(replace(key,'!','!!'),'%','!%'),'_','!_')||'%' escape '!'
    or candidate_document like '%'||replace(replace(replace(path,'!','!!'),'%','!%'),'_','!_')||'%' escape '!'
    or candidate_document=${lit(sentinel)} candidate from documents)
  select jsonb_agg(jsonb_build_object('id',id,'encoded',position('%' in projected_document)>0,'document_equal',candidate_document is not distinct from original_document,
   'result_equal',original is not distinct from(candidate and exact),'sentinel',candidate_document=${lit(sentinel)}))::text from matches;`);
  for(const row of values){assert.equal(row.document_equal,true,cases[row.id-1].label);assert.equal(row.result_equal,true,cases[row.id-1].label);assert.equal(row.sentinel,false,cases[row.id-1].label);if(row.encoded)report.normalizedPercentRows++;}
  report.physicalDocumentCases+=values.length;
 }
 assert.equal(report.physicalDocumentCases,cases.length);assert.equal(report.normalizedPercentRows,279);pass('307 exact canonical physical documents retain nested/property/punctuation semantics, including 279 encoded rows');
 const needles=['%','_','!','\\','!!%_\\','a%b_c!d\\e','雪/é/😀','"x", "y"','',null];
 const texts=['a%b_c!d\\e','literal % and _ ! \\','雪/é/😀','"x", "y"','no match','',null];
 const likeCases=texts.flatMap(value=>needles.map(needle=>`(${lit(value)}::text,${lit(needle)}::text,${lit(pattern(needle))}::text)`));
 const likeResult=json(`with inputs(value,needle,pattern) as(values ${likeCases.join(',')}) select json_build_object('cases',count(*),'mismatches',count(*) filter(where (strpos(value,needle)>0) is distinct from(value like pattern escape '!')))::text from inputs;`);
 assert.deepEqual(likeResult,{cases:70,mismatches:0});report.literalLikeControls=likeResult;pass('70 case-sensitive literal LIKE controls preserve percent, underscore, escape and NULL semantics');

 checkpoint('native byte boundaries and exception handler categories');
 const nested=depth=>{let value='irrelevant';for(let i=0;i<depth;i++)value={nested:value};return value;};
 const sizeInputs=[
  ['SQL NULL','null::jsonb',4],['JSON null',"'null'::jsonb",4],['empty string',"'\"\"'::jsonb",2],['array',"'[]'::jsonb",2],
  ['Unicode',`${lit(JSON.stringify('雪/é/😀'))}::jsonb`,13],
  ['exactly1MiB',"to_jsonb(repeat('a',1048574))",1048576],['over1MiB',"to_jsonb(repeat('a',1048575))",1048577],
  ['controlEscapeExpansion','to_jsonb(repeat(chr(1),174763))',1048577],
  ['depth7',`${lit(JSON.stringify(nested(7)))}::jsonb`,null],['depth8',`${lit(JSON.stringify(nested(8)))}::jsonb`,1048577],
 ];
 report.byteBoundaryCases=json(`with inputs(label,value,expected) as(values ${sizeInputs.map(([label,expr,expected])=>`(${lit(label)},${expr},${expected??'null'}::bigint)`).join(',')})
 select jsonb_agg(jsonb_build_object('label',label,'actual',private.platform_brand_index_jsonb_bytes_v1(value),'expected',coalesce(expected,octet_length(value::text)::bigint)))::text from inputs;`);
 for(const item of report.byteBoundaryCases)assert.equal(item.actual,item.expected,item.label);pass('10 native byte/null/depth boundary cases return exact sizes or mandatory sentinel budget');
 const sizeBody=body(fn(source,'platform_brand_index_jsonb_bytes_v1'));
 const handler=sizeBody.match(/exception when sqlstate '54000' then[\s\S]*?\n end;/)[0];
 assert.match(handler,/if sqlstate<>'54000' then raise; end if;/);
 q(`create function private.brand_semantic_handler_fragment(p_code text) returns bigint language plpgsql set search_path='' as $$begin begin raise exception using errcode=p_code,message='synthetic exception class';${handler}end $$;revoke all on function private.brand_semantic_handler_fragment(text) from public,anon,authenticated,service_role;`);
 report.injectedHandlerCases=json(`with inputs(code) as(values('54000'),('54001'),('53200'),('57014'),('22023')) select jsonb_agg(jsonb_build_object('code',code,'result',private.brand_semantic_capture(format('select private.brand_semantic_handler_fragment(%L)',code))))::text from inputs;`);
 for(const item of report.injectedHandlerCases){if(item.code==='54000')assert.deepEqual(item.result,{status:'ok',value:'1048577'});else{assert.equal(item.result.status,'error');assert.equal(item.result.code,item.code);}}
 pass('source-extracted handler returns sentinel only for exact54000 and rethrows54001/53200/57014/22023; resource errors not induced');

 checkpoint('native deterministic and nondeterministic ICU collation parity');
 assert.ok(Number(q("select count(*) from pg_collation where collprovider='i';"))>0,'native ICU collation provider required');
 q(`create collation public.brand_semantic_deterministic(provider=icu,locale='und',deterministic=true);create collation public.brand_semantic_nondeterministic(provider=icu,locale='und',deterministic=false);`);
 const collationInputs=[null,'','雪/é/😀 "quoted" \\path','brand%252Flogo.png','malformed%XZ','%00%1F%7F%80%ff'];
 report.collationCases=[];
 for(const collation of ['"C"','public.brand_semantic_deterministic','public.brand_semantic_nondeterministic']){
  const casesSQL=collationInputs.map((value,i)=>`(${i},${lit(`select private.deleted_media_normalize_locator(${lit(value)}::text collate ${collation})`)},${lit(`select private.platform_brand_index_normalize_v1(${lit(value)}::text collate ${collation})`)})`).join(',');
  const rows=json(`with inputs(id,old_sql,new_sql) as(values ${casesSQL}) select jsonb_agg(jsonb_build_object('id',id,'old',private.brand_semantic_capture(old_sql),'current',private.brand_semantic_capture(new_sql)))::text from inputs;`);
  for(const item of rows){assert.deepEqual(item.current,item.old,collation+'/'+item.id);if(collation.endsWith('nondeterministic')){assert.equal(item.old.status,'error');assert.equal(item.old.code,'0A000');}else assert.equal(item.old.status,'ok');}
  report.collationCases.push({collation,cases:rows});
 }
 q('create table public.brand_semantic_nd_column(metadata text collate public.brand_semantic_nondeterministic,unrelated text);');
 assert.equal(q("select count(*) from private.platform_brand_index_spec_v1('public.brand_semantic_nd_column'::regclass);"),'0');
 pass('18 native ICU/C collation outcomes preserve exact values or0A000 and nondeterministic selected columns fall back');

 checkpoint('native pure helper attributes and private authority boundaries');
 report.helperAttributes=json(`select jsonb_agg(jsonb_build_object('name',proname,'volatile',provolatile,'strict',proisstrict,'definer',prosecdef,'leakproof',proleakproof,'parallel',proparallel,'cost',procost,'config',proconfig,'publicExecute',exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')))::text from pg_proc where oid in('private.platform_brand_index_jsonb_bytes_v1(jsonb)'::regprocedure,'private.platform_brand_index_normalize_v1(text)'::regprocedure);`);
 for(const item of report.helperAttributes)assert.deepEqual({...item,name:undefined},{name:undefined,volatile:'i',strict:false,definer:false,leakproof:false,parallel:'u',cost:100,config:['search_path=""'],publicExecute:true});
 report.roleBoundaries=json(`select jsonb_agg(jsonb_build_object('role',rolname,'privateUsage',has_schema_privilege(oid,'private','USAGE'),'sizeExecute',has_function_privilege(oid,'private.platform_brand_index_jsonb_bytes_v1(jsonb)','EXECUTE'),'normalizeExecute',has_function_privilege(oid,'private.platform_brand_index_normalize_v1(text)','EXECUTE'),'matcherExecute',has_function_privilege(oid,'private.platform_brand_retention_row_mentions(jsonb,text[],text,text)','EXECUTE'),'specExecute',has_function_privilege(oid,'private.platform_brand_index_spec_v1(oid)','EXECUTE'),'registrySelect',has_table_privilege(oid,'private.platform_brand_reference_indexes_v1','SELECT')))::text from pg_roles where rolname in('anon','authenticated','service_role');`);
 for(const item of report.roleBoundaries)assert.deepEqual({...item,role:undefined},{role:undefined,privateUsage:false,sizeExecute:true,normalizeExecute:true,matcherExecute:false,specExecute:false,registrySelect:false});
 pass('only approved pure EXECUTE is public; schema, catalog helper, matcher and registry authority remain private');
 report.installedBodySHA256After={};for(const [name] of functionSources)report.installedBodySHA256After[name]=sha(json(`select to_json(prosrc)::text from pg_proc where pronamespace='private'::regnamespace and proname=${lit(name)};`));
 assert.deepEqual(report.installedBodySHA256After,report.installedBodySHA256);
 report.otherSessions=Number(q('select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid();'));assert.equal(report.otherSessions,0);
 report.status='passed';report.completedAt=new Date().toISOString();checkpoint('small native semantic proof completed; fixture retained and idle');
}catch(error){report.status='failed';report.error=String(error.message);checkpoint('stopped after component failure; no blind rerun');throw error;
}finally{report.fixture={container,database,created,retained:created,socket:'/tmp'};writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
