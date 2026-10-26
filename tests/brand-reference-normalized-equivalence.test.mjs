import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {referenceScanCases,referenceScanErrors,referenceScanFixtureSQL} from './helpers/brand-reference-scan-corpus.mjs';

const directory=new URL('../supabase/migrations/',import.meta.url);
const read=name=>readFileSync(new URL(name,directory),'utf8');
const reference=read('20261020141554_deleted_media_reference_retirement.sql');
const matcher=read('20261025121430_platform_brand_reference_scan_performance.sql');
const migration=read('20261025141347_platform_brand_reference_candidate_indexes.sql');
const sentinel='!brand-reference-exact-fallback-v1!';
const sizeSignature='private.platform_brand_index_jsonb_bytes_v1(jsonb)';
const normalizeSignature='private.platform_brand_index_normalize_v1(text)';
const definition=(source,name)=>{
 const found=source.match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?\\$\\$;`));
 assert.ok(found,`source definition ${name}`);return found[0];
};
const body=sql=>sql.match(/as \$\$([\s\S]*?)\$\$;/)[1];
const currentNormalizer=readdirSync(directory).filter(name=>name.endsWith('.sql')).sort().flatMap(file=>{
 const source=read(file);
 return /create (?:or replace )?function private\.deleted_media_normalize_locator\(/i.test(source)
  ?[{file,sql:definition(source,'deleted_media_normalize_locator')}]:[];
}).at(-1);
assert.ok(currentNormalizer,'latest shared normalizer source');
const lit=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`;
const ident=value=>`"${value.replaceAll('"','""')}"`;
const pattern=value=>value===null?null:`%${value.replaceAll('!','!!').replaceAll('%','!%').replaceAll('_','!_')}%`;
const scalar=async(db,sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];

async function setup(){
 const db=new PGlite({extensions:{pg_trgm}});
 await db.exec('create schema private;create schema extensions;create role anon;create role authenticated;create role service_role;create extension pg_trgm with schema extensions;');
 await db.exec(currentNormalizer.sql);
 for(const name of ['deleted_media_locator_columns','deleted_media_locator_document','deleted_media_mentions'])await db.exec(definition(reference,name));
 await db.exec(definition(matcher,'platform_brand_retention_row_mentions'));
 await db.exec(matcher.match(/revoke all on function private\.platform_brand_retention_row_mentions[^;]+;/i)[0]);
 for(const name of ['platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1'])await db.exec(definition(migration,name));
 // Load exact source grants, not substitutes. Native tests separately cover the
 // event guard, complete migration, ordinary writers and installer capability.
 for(const grant of migration.matchAll(/^(?:grant|revoke)\s+[^;]*?on function\s+private\.platform_brand_index_(?:jsonb_bytes|normalize)_v1[^;]*;/gmi))await db.exec(grant[0]);
 const registry=migration.match(/create table private\.platform_brand_reference_indexes_v1[\s\S]*?revoke all on private\.platform_brand_reference_indexes_v1[^;]+;/);
 assert.ok(registry);await db.exec(registry[0]);
 for(const name of ['platform_brand_index_environment_v1','platform_brand_index_spec_v1','platform_brand_index_expression_v1'])await db.exec(definition(migration,name));
 await db.exec(migration.match(/revoke all on function private\.platform_brand_index_environment_v1[^;]+;/)[0]);
 return db;
}
async function expression(db,table){return (await db.query('select scan_expression from private.platform_brand_index_spec_v1($1::regclass)',[table])).rows[0]?.scan_expression??null;}
async function register(db,table,indexName){
 const spec=(await db.query('select * from private.platform_brand_index_spec_v1($1::regclass)',[table])).rows[0];assert.ok(spec,table);
 await db.exec(`create index ${ident(indexName)} on ${table} using gin ((${spec.scan_expression}) extensions.gin_trgm_ops)`);
 await db.query(`insert into private.platform_brand_reference_indexes_v1(table_oid,index_oid,row_schema,scan_expression,index_expression,environment)
  select $1::regclass,$2::regclass,$3::jsonb,$4,pg_get_expr(indexprs,indrelid,false),private.platform_brand_index_environment_v1()
  from pg_index where indexrelid=$2::regclass`,[table,'public.'+indexName,JSON.stringify(spec.row_schema),spec.scan_expression]);
 return spec.scan_expression;
}

test('lossy GIN search settings disable candidate filtering and restore exact fallback',async()=>{
 const db=await setup();
 try{
  await db.exec('create table public.brand_fuzzy_limit(metadata jsonb);');
  const expr=await register(db,'public.brand_fuzzy_limit','brand_fuzzy_limit_gin');
  assert.equal(await scalar(db,"select private.platform_brand_index_expression_v1('public.brand_fuzzy_limit'::regclass)"),expr);
  await db.exec("set gin_fuzzy_search_limit=1;insert into public.brand_fuzzy_limit values ('{\"url\":\"brand%2Flogo.png\"}');");
  assert.equal(await scalar(db,"select private.platform_brand_index_expression_v1('public.brand_fuzzy_limit'::regclass)"),null);
  assert.equal(await scalar(db,"select exists(select 1 from public.brand_fuzzy_limit x where private.platform_brand_retention_row_mentions(to_jsonb(x),private.deleted_media_locator_columns('public.brand_fuzzy_limit'::regclass),'brand/logo.png','storage/brand/logo.png'))"),true);
  await db.exec('reset gin_fuzzy_search_limit;');
  assert.equal(await scalar(db,"select private.platform_brand_index_expression_v1('public.brand_fuzzy_limit'::regclass)"),expr);
 }finally{await db.close();}
});

test('frozen normalizer remains literal and both pure helpers have only their approved computing authority',async(t)=>{
 const frozen=definition(migration,'platform_brand_index_normalize_v1');
 assert.equal(body(frozen),body(currentNormalizer.sql),'future normalizer changes require a new indexed version, never silently stale normalization');
 assert.doesNotMatch(frozen,/\bstrict\b|security definer|\bcollate\b|private\.deleted_media_|\bpg_(?:proc|class|attribute)\b/i);
 const size=definition(migration,'platform_brand_index_jsonb_bytes_v1');
 assert.match(size,/exception\s+when\s+sqlstate\s+'54000'\s+then/i);
 assert.match(size,/if\s+sqlstate\s*<>\s*'54000'\s+then\s+raise;\s*end if;/i,'PL/pgSQL category matching must rethrow every subclass, including stack-depth 54001');
 assert.doesNotMatch(size,/when\s+(?:others|program_limit_exceeded|query_canceled|out_of_memory)|security definer|\bstrict\s+(?:as|language)/i,'only exact deterministic serialization-limit SQLSTATE is caught');
 const db=await setup();
 try{
  t.diagnostic(`migrationSHA256=${createHash('sha256').update(migration).digest('hex')}; oracle=${currentNormalizer.file}; embedded PostgreSQL component proof only`);
  for(const signature of [sizeSignature,normalizeSignature]){
   const actual=(await db.query(`select p.provolatile,p.proisstrict,p.prosecdef,p.proleakproof,p.proparallel,p.procost,p.proconfig,l.lanname
    from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=$1::regprocedure`,[signature])).rows[0];
   assert.deepEqual(actual,{provolatile:'i',proisstrict:false,prosecdef:false,proleakproof:false,proparallel:'u',procost:100,proconfig:['search_path=""'],lanname:'plpgsql'},signature);
   assert.equal(await scalar(db,`select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=$1::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')`,[signature]),true,`${signature}: PUBLIC has pure computation only`);
   for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar(db,"select has_function_privilege($1,$2,'EXECUTE')",[role,signature]),true);
  }
  for(const role of ['anon','authenticated','service_role']){
   assert.equal(await scalar(db,"select has_schema_privilege($1,'private','USAGE')",[role]),false,'no schema access accompanies pure EXECUTE');
   for(const signature of ['private.platform_brand_retention_row_mentions(jsonb,text[],text,text)','private.platform_brand_index_spec_v1(oid)','private.platform_brand_index_expression_v1(oid)'])
    assert.equal(await scalar(db,"select has_function_privilege($1,$2,'EXECUTE')",[role,signature]),false,`${role}/${signature}`);
  }
 }finally{await db.close();}
});

test('frozen normalization and exact matcher preserve NULL, encoding, JSON and error behavior',async(t)=>{
 const db=await setup();
 try{
  await db.exec(referenceScanFixtureSQL);
  const inputs=[...referenceScanCases.map(c=>c.document),null,'','雪/é/😀 "quoted" \\path','literal%','%00%1F%7f%80%ff','%252525252F','a%25%32%46b'];
  const values=inputs.map((value,i)=>`(${i},${lit(value)}::text)`).join(',');
  const results=(await db.query(`with inputs(id,value) as (values ${values}) select id,
   private.platform_brand_index_normalize_v1(value) is not distinct from private.deleted_media_normalize_locator(value) equal
   from inputs order by id`)).rows;
  assert.equal(results.length,inputs.length);for(const row of results)assert.equal(row.equal,true,`normalizer ${row.id}: ${JSON.stringify(inputs[row.id])}`);
  assert.equal(await scalar(db,'select private.platform_brand_index_normalize_v1(null)'),'', 'SQL NULL remains empty normalized text');
  for(const item of referenceScanErrors){
   const capture=async sql=>{try{await db.query(sql,[item.document,item.table]);assert.fail(item.label);}catch(error){if(error.code)return{code:error.code,message:error.message};throw error;}};
   const old=await capture(`select private.deleted_media_mentions(private.deleted_media_locator_document($1::jsonb,coalesce($2::regclass::oid,0::oid)),'brand/logo.png') or private.deleted_media_mentions(private.deleted_media_locator_document($1::jsonb,coalesce($2::regclass::oid,0::oid)),'storage/brand/logo.png')`);
   const current=await capture(`select private.platform_brand_retention_row_mentions($1::jsonb,private.deleted_media_locator_columns(coalesce($2::regclass::oid,0::oid)),'brand/logo.png','storage/brand/logo.png')`);
   assert.deepEqual(current,old,item.label);
  }
  t.diagnostic(`textNormalizationCases=${inputs.length}; unchangedMatcherErrorCases=${referenceScanErrors.length}; nondeterministic ICU collation errors require separate native proof`);
 }finally{await db.close();}
});

test('normalized indexed documents equal the legacy full projection for both literal needles',async(t)=>{
 const db=await setup();
 try{
  await db.exec(`create table public.brand_normalized_corpus(id integer primary key,metadata jsonb,payload jsonb,media_url text,"Odd URL ""雪""" text,unrelated text,created_at timestamptz);
   create table public.brand_normalized_percent_columns(like public.brand_normalized_corpus including all);
   alter table public.brand_normalized_percent_columns add column "percent%path" text,add column "percent%2Fpath" text;
   create table private.brand_normalized_needles(id integer,key text,path text);`);
  const cases=referenceScanCases.filter(c=>c.table==='public.brand_reference_matcher_fixture');
  const fixtures=['public.brand_normalized_corpus','public.brand_normalized_percent_columns'];
  const rows=cases.map((c,i)=>({...JSON.parse(c.document??'{}'),id:i+1,created_at:'2026-01-01T00:00:00Z'}));
  for(const [i,table] of fixtures.entries())await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(rows.filter(row=>Object.keys(row).some(key=>key.includes('%'))===(i===1)))]);
  await db.exec(`insert into private.brand_normalized_needles values ${cases.map((c,i)=>`(${i+1},${lit(c.key)},${lit(c.path)})`).join(',')}`);
  let completed=0,encoded=0;
  for(const [i,table] of fixtures.entries()){
   const expr=await register(db,table,`brand_normalized_corpus_${i}`);
   assert.match(expr,/private\.platform_brand_index_normalize_v1/);
   assert.equal(await scalar(db,'select private.platform_brand_index_expression_v1($1::regclass)',[table]),expr);
   const result=await db.query(`with documents as (
    select x.id,n.key,n.path,${expr} candidate_document,
     private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass)::text projected_document,
     private.deleted_media_normalize_locator(private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass)::text) original_document,
     private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass),n.key)
      or private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass),n.path) original,
     private.platform_brand_retention_row_mentions(to_jsonb(x),private.deleted_media_locator_columns(${lit(table)}::regclass),n.key,n.path) exact
    from ${table} x join private.brand_normalized_needles n on n.id=x.id
   ),matches as (select *,candidate_document like '%'||replace(replace(replace(key,'!','!!'),'%','!%'),'_','!_')||'%' escape '!'
    or candidate_document like '%'||replace(replace(replace(path,'!','!!'),'%','!%'),'_','!_')||'%' escape '!'
    or candidate_document=${lit(sentinel)} candidate from documents)
   select id,position('%' in projected_document)>0 encoded,candidate_document is not distinct from original_document document_equal,
    original is not distinct from (candidate and exact) result_equal,candidate_document=${lit(sentinel)} is_sentinel from matches order by id`);
   completed+=result.rows.length;
   for(const row of result.rows){const label=cases[row.id-1].label;assert.equal(row.document_equal,true,label);assert.equal(row.result_equal,true,label);assert.equal(row.is_sentinel,false,`${label}: bounded percent content is normalized, not excluded or sentinel`);if(row.encoded)encoded++;}
  }
  assert.equal(completed,cases.length);assert.ok(encoded>0);
  const needles=['%','_','!','\\','!!%_\\','a%b_c!d\\e','雪/é/😀','"x", "y"','',null];
  const strings=['a%b_c!d\\e','literal % and _ ! \\','雪/é/😀','"x", "y"','no match','',null];
  for(const value of strings)for(const needle of needles){
   const row=(await db.query(`select strpos($1,$2)>0 original,$1 like $3 escape '!' candidate`,[value,needle,pattern(needle)])).rows[0];
   assert.equal(row.candidate,row.original,JSON.stringify({value,needle}));
  }
  t.diagnostic(`physicalRows=${completed}; encodedRowsNormalized=${encoded}; literalLIKEControls=${needles.length*strings.length}`);
 }finally{await db.close();}
});

test('bounded sizing and uncertain-row sentinel preserve exact fallback instead of dropping rows',async(t)=>{
 const db=await setup();
 try{
  const nested=depth=>{let value='irrelevant';for(let i=0;i<depth;i++)value={nested:value};return value;};
  const sizes=[
   {label:'SQL NULL',value:null,expected:4},{label:'JSON null',value:'null',expected:4},
   {label:'scalar empty string',value:'""',expected:2},{label:'array',value:'[]',expected:2},
   {label:'Unicode exact bytes',value:JSON.stringify('雪/é/😀'),expected:13},
   {label:'serialized exactly 1MiB',value:JSON.stringify('a'.repeat(1048574)),expected:1048576},
   {label:'serialized over 1MiB',value:JSON.stringify('a'.repeat(1048575)),expected:1048577},
   {label:'control escape expansion',value:JSON.stringify('\u0001'.repeat(174763)),expected:1048577},
   {label:'depth seven',value:JSON.stringify(nested(7))},{label:'depth eight',value:JSON.stringify(nested(8)),expected:1048577},
  ];
  for(const item of sizes){const row=(await db.query('select private.platform_brand_index_jsonb_bytes_v1($1::jsonb) actual,octet_length($1::jsonb::text)::bigint original',[item.value])).rows[0];assert.equal(Number(row.actual),item.expected??Number(row.original),item.label);}
  await db.exec('create table public.brand_normalized_uncertain(id integer,metadata jsonb,media_url text,unrelated text,other_text text,created_at timestamptz);');
  const table='public.brand_normalized_uncertain',expr=await register(db,table,'brand_normalized_uncertain_gin');
  const cases=[
   {label:'ordinary',metadata:{value:'irrelevant'},sentinel:false},
   {label:'SQL NULL selected fields',metadata:null,sentinel:false},
   {label:'oversized unrelated text',metadata:{value:'irrelevant'},unrelated:'a'.repeat(1048577),sentinel:true},
   {label:'combined unrelated fields',metadata:{value:'irrelevant'},unrelated:'a'.repeat(600000),other_text:'b'.repeat(600000),sentinel:true},
   {label:'multibyte unrelated field',metadata:{value:'irrelevant'},unrelated:'雪'.repeat(350000),sentinel:true},
   {label:'large selected JSONB',metadata:{value:'a'.repeat(1048577)},sentinel:true},
   {label:'deep selected JSONB',metadata:nested(8),sentinel:true},
   {label:'bounded selected JSONB',metadata:nested(7),sentinel:false},
   {label:'encoded real reference',metadata:{value:'brand%2Flogo.png'},sentinel:false,exact:true},
   {label:'malformed percent selected value',metadata:{value:'irrelevant%XZ'},sentinel:false},
   {label:'percent in nested key',metadata:{'percent%key':'irrelevant'},sentinel:false},
   {label:'reference only in unrelated field',metadata:{value:'irrelevant'},unrelated:'brand/logo.png',sentinel:false},
   {label:'out of range datetime',metadata:{value:'irrelevant'},created_at:'1800-01-01',sentinel:true},
   {label:'infinite datetime',metadata:{value:'irrelevant'},created_at:'infinity',sentinel:true},
  ];
  for(let i=0;i<cases.length;i++){
   const item=cases[i];await db.query(`insert into ${table} select * from jsonb_populate_record(null::${table},$1::jsonb)`,[JSON.stringify({created_at:'2026-01-01',...item,id:i+1})]);
   const row=(await db.query(`select (${expr})=$2 sentinel,((${expr}) like $3 escape '!' or (${expr}) like $4 escape '!' or (${expr})=$2) candidate,
    private.platform_brand_retention_row_mentions(to_jsonb(x),private.deleted_media_locator_columns(${lit(table)}::regclass),$5,$6) exact from ${table} x where id=$1`,[i+1,sentinel,pattern('brand/logo.png'),pattern('storage/brand/logo.png'),'brand/logo.png','storage/brand/logo.png'])).rows[0];
   assert.equal(row.sentinel,item.sentinel,item.label);assert.equal(row.exact,item.exact??false,item.label);assert.equal(row.candidate,item.sentinel||Boolean(item.exact),item.label);
  }
  for(const zone of ['UTC','Pacific/Apia','Etc/GMT+12'])for(const style of ['ISO, MDY','SQL, DMY','Postgres, MDY']){
   await db.exec(`set timezone=${lit(zone)};set datestyle=${lit(style)}`);
   assert.equal(await scalar(db,`select (${expr}) is not distinct from private.deleted_media_normalize_locator(private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass)::text) from ${table} x where id=1`),true,`${zone}/${style}`);
  }
  await db.exec('create table public.brand_normalized_json(metadata jsonb,unrelated json);create table public.brand_normalized_array(metadata jsonb,unrelated text[]);create domain public.brand_normalized_domain as text;create table public.brand_normalized_domain_table(metadata jsonb,unrelated public.brand_normalized_domain);create table public.brand_normalized_empty(id integer,unrelated text);');
  for(const name of ['brand_normalized_json','brand_normalized_array','brand_normalized_domain_table','brand_normalized_empty'])assert.equal(await expression(db,'public.'+name),null,name);
  assert.equal((await db.query('select * from private.platform_brand_index_spec_v1(0::oid)')).rows.length,0,'unknown table');
  await db.query('insert into public.brand_normalized_json values($1::jsonb,$2::json)',['{}','"\\u0000"']);
  await assert.rejects(db.query('select to_jsonb(x) from public.brand_normalized_json x'),error=>error.code==='22P05');
  await db.exec(`alter table ${table} add column future_uri text`);
  assert.equal(await scalar(db,'select private.platform_brand_index_expression_v1($1::regclass)',[table]),null,'new selected column invalidates the index snapshot');
  t.diagnostic(`sizeCases=${sizes.length}; candidateFallbackCases=${cases.length}; timezoneStyleCases=9; pathological >1GiB serialization and noncaught failure classes require separate native proof`);
 }finally{await db.close();}
});
