import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {referenceScanCases} from './helpers/brand-reference-scan-corpus.mjs';

const directory=new URL('../supabase/migrations/',import.meta.url);
const read=name=>readFileSync(new URL(name,directory),'utf8');
const reference=read('20261020141554_deleted_media_reference_retirement.sql');
const normalizer=read('20261020201310_deleted_content_stage_recovery.sql');
const matcher=read('20261025121430_platform_brand_reference_scan_performance.sql');
const migration=read('20261025141347_platform_brand_reference_candidate_indexes.sql');
const sentinel='!brand-reference-exact-fallback-v1!';
const definition=(source,name)=>{
 const match=source.match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?\\$\\$;`));
 assert.ok(match,`source defines ${name}`);return match[0];
};
const lit=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`;
const ident=value=>`"${value.replaceAll('"','""')}"`;
const pattern=value=>value===null?null:`%${value.replaceAll('!','!!').replaceAll('%','!%').replaceAll('_','!_')}%`;

async function setup(){
 const db=new PGlite({extensions:{pg_trgm}});
 await db.exec('create schema private;create schema extensions;create role anon;create role authenticated;create role service_role;');
 await db.exec(definition(normalizer,'deleted_media_normalize_locator'));
 for(const name of ['deleted_media_locator_columns','deleted_media_locator_document','deleted_media_mentions'])await db.exec(definition(reference,name));
 await db.exec(definition(matcher,'platform_brand_retention_row_mentions'));
 await db.exec(matcher.match(/revoke all on function private\.platform_brand_retention_row_mentions[^;]+;/i)[0]);
 // Load exact component definitions and grants. The native guard suite covers
 // the event-trigger installer and full migration; this embedded suite does
 // not substitute fake locks, guards or installer-permission results.
 await db.exec('create extension pg_trgm with schema extensions;');
 for(const name of ['platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1'])await db.exec(definition(migration,name));
 for(const grant of migration.matchAll(/^(?:grant|revoke)\s+[^;]*?on function\s+private\.platform_brand_index_(?:jsonb_bytes|normalize)_v1[^;]*;/gmi))await db.exec(grant[0]);
 await db.exec(migration.match(/create table private\.platform_brand_reference_indexes_v1[\s\S]*?revoke all on private\.platform_brand_reference_indexes_v1[^;]+;/)[0]);
 for(const name of ['platform_brand_index_environment_v1','platform_brand_index_spec_v1','platform_brand_index_expression_v1'])await db.exec(definition(migration,name));
 await db.exec(migration.match(/revoke all on function private\.platform_brand_index_environment_v1[^;]+;/)[0]);
 return db;
}
async function scalar(db,sql,args=[]){return Object.values((await db.query(sql,args)).rows[0])[0];}
async function expression(db,table){
 return (await db.query('select scan_expression from private.platform_brand_index_spec_v1($1::regclass)',[table])).rows[0]?.scan_expression??null;
}
async function register(db,table,indexName='brand_index_test'){
 const spec=(await db.query('select * from private.platform_brand_index_spec_v1($1::regclass)',[table])).rows[0];
 assert.ok(spec,`eligible fixture ${table}`);
 await db.exec(`create index ${ident(indexName)} on ${table} using gin ((${spec.scan_expression}) extensions.gin_trgm_ops)`);
 await db.query(`insert into private.platform_brand_reference_indexes_v1(table_oid,index_oid,row_schema,scan_expression,index_expression,environment)
  select $1::regclass,$2::regclass,$3::jsonb,$4,pg_get_expr(indexprs,indrelid,false),private.platform_brand_index_environment_v1()
  from pg_index where indexrelid=$2::regclass`,[table,'public.'+indexName,JSON.stringify(spec.row_schema),spec.scan_expression]);
 return spec.scan_expression;
}
async function available(db,table){return scalar(db,'select private.platform_brand_index_expression_v1($1::regclass)',[table]);}
async function rollbackCase(db,sql,check){
 await db.exec('begin');try{await db.exec(sql);await check();}finally{await db.exec('rollback');}
}

test('indexed expression preserves the independently evaluated canonical document and both literal needles',async(t)=>{
 const db=await setup();
 try{
  await db.exec(`create table public.brand_index_corpus(
   id integer primary key,metadata jsonb,payload jsonb,media_url text,
   "Odd URL ""雪""" text,
   unrelated text,created_at timestamptz);
   create table public.brand_index_percent_columns(like public.brand_index_corpus including all);
   alter table public.brand_index_percent_columns add column "percent%path" text,add column "percent%2Fpath" text;
   create table private.brand_index_needles(id integer,key text,path text);`);
  // Physical rows include SQL NULLs for absent fields. The independent legacy
  // oracle below sees those exact rows, not reconstructed expected documents.
  const cases=referenceScanCases.filter(c=>c.table==='public.brand_reference_matcher_fixture');
  t.diagnostic(`migrationSHA256=${createHash('sha256').update(migration).digest('hex')}; physicalCorpusCases=${cases.length}; literalLIKEControls=70`);
  const fixtures=['public.brand_index_corpus','public.brand_index_percent_columns'];
  const rows=cases.map((c,i)=>({...JSON.parse(c.document??'{}'),id:i+1,created_at:'2026-01-01T00:00:00Z'}));
  const usesPercentColumn=row=>Object.keys(row).some(key=>key.includes('%'));
  for(const [i,table] of fixtures.entries())await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(rows.filter(row=>usesPercentColumn(row)===(i===1)))]);
  await db.exec(`insert into private.brand_index_needles values ${cases.map((c,i)=>`(${i+1},${lit(c.key)},${lit(c.path)})`).join(',')}`);
  let completed=0,percentFree=0,encoded=0;
  for(const [i,table] of fixtures.entries()){
   const expr=await register(db,table,`brand_index_corpus_${i}`);
   assert.equal(await available(db,table),expr);
   const privateCalls=[...expr.matchAll(/private\.([a-z_0-9]+)\(/g)].map(match=>match[1]);
   assert.ok(privateCalls.length>0);
   for(const name of privateCalls)assert.ok(['platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1'].includes(name),'only approved pure computation appears in the index expression');
   const result=await db.query(`with documents as (
    select x.id,n.key,n.path,${expr} candidate_document,
      private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass)::text projected_document,
      private.deleted_media_normalize_locator(private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass)::text) original_document,
      private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass),n.key)
       or private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),${lit(table)}::regclass),n.path) original,
      private.platform_brand_retention_row_mentions(to_jsonb(x),private.deleted_media_locator_columns(${lit(table)}::regclass),n.key,n.path) exact
    from ${table} x join private.brand_index_needles n on n.id=x.id
   ),matches as (select *,candidate_document like '%'||replace(replace(replace(key,'!','!!'),'%','!%'),'_','!_')||'%' escape '!'
      or candidate_document like '%'||replace(replace(replace(path,'!','!!'),'%','!%'),'_','!_')||'%' escape '!'
      or candidate_document=${lit(sentinel)} candidate from documents)
   select id,position('%' in projected_document)=0 percent_free,
     candidate_document is not distinct from original_document document_equal,
     original is not distinct from (candidate and exact) result_equal from matches order by id`);
   completed+=result.rows.length;
   for(const row of result.rows){
    assert.equal(row.document_equal,true,cases[row.id-1].label);assert.equal(row.result_equal,true,cases[row.id-1].label);
    if(row.percent_free)percentFree++;else encoded++;
   }
  }
  assert.equal(completed,cases.length);assert.ok(percentFree>0);assert.ok(encoded>0);
  t.diagnostic(`percentFreeCanonicalRows=${percentFree}; exactNormalizedPercentRows=${encoded}`);
  // Adversarial LIKE metacharacters are independent of the media-key corpus.
  const needles=['%','_','!','\\','!!%_\\','a%b_c!d\\e','雪/é/😀','"x", "y"','',null];
  const values=['a%b_c!d\\e','literal % and _ ! \\','雪/é/😀','"x", "y"','no match','',null];
  for(const value of values)for(const needle of needles){
   const row=(await db.query(`select strpos($1,$2)>0 original,$1 like $3 escape '!' candidate`,[value,needle,pattern(needle)])).rows[0];
   assert.equal(row.candidate,row.original,`literal value=${JSON.stringify(value)} needle=${JSON.stringify(needle)}`);
  }
 }finally{await db.close();}
});

test('uncertain rows remain mandatory candidates before exact recheck',async()=>{
 const db=await setup();
 try{
  await db.exec(`create table public.brand_index_uncertain(id integer,metadata jsonb,media_url text,unrelated text,other_text text,created_at timestamptz);`);
  const expr=await register(db,'public.brand_index_uncertain');
  const nested=depth=>{let value='irrelevant';for(let i=0;i<depth;i++)value={nested:value};return value;};
  const cases=[
   {label:'ordinary',metadata:{value:'irrelevant'},unrelated:'small',created_at:'2026-01-01',sentinel:false},
   {label:'NULL JSON and time',metadata:null,created_at:null,sentinel:false},
   {label:'oversized unrelated text',metadata:{value:'irrelevant'},unrelated:'a'.repeat(1048577),created_at:'2026-01-01',sentinel:true},
   {label:'combined unrelated fields',metadata:{value:'irrelevant'},unrelated:'a'.repeat(600000),other_text:'b'.repeat(600000),created_at:'2026-01-01',sentinel:true},
   {label:'multibyte unrelated field',metadata:{value:'irrelevant'},unrelated:'雪'.repeat(350000),created_at:'2026-01-01',sentinel:true},
   {label:'large selected JSONB',metadata:{value:'a'.repeat(1048577)},created_at:'2026-01-01',sentinel:true},
   {label:'deep selected JSONB',metadata:nested(8),created_at:'2026-01-01',sentinel:true},
   {label:'bounded selected JSONB',metadata:nested(7),created_at:'2026-01-01',sentinel:false},
   {label:'encoded selected value',metadata:{value:'brand%2Flogo.png'},created_at:'2026-01-01',sentinel:false,exact:true},
   {label:'malformed percent selected value',metadata:{value:'irrelevant%XZ'},created_at:'2026-01-01',sentinel:false},
   {label:'percent in nested key',metadata:{'percent%key':'irrelevant'},created_at:'2026-01-01',sentinel:false},
   {label:'percent only in unrelated field',metadata:{value:'irrelevant'},unrelated:'100% unrelated',created_at:'2026-01-01',sentinel:false},
   {label:'out of range datetime',metadata:{value:'irrelevant'},created_at:'1800-01-01',sentinel:true},
   {label:'infinite datetime',metadata:{value:'irrelevant'},created_at:'infinity',sentinel:true},
  ];
  for(let i=0;i<cases.length;i++){
   const item=cases[i];await db.query(`insert into public.brand_index_uncertain select * from jsonb_populate_record(null::public.brand_index_uncertain,$1::jsonb)`,[JSON.stringify({...item,id:i+1})]);
   const row=(await db.query(`select ${expr}=$2 sentinel,
    ((${expr}) like $3 escape '!' or (${expr}) like $4 escape '!' or (${expr})=$2) candidate,
    private.platform_brand_retention_row_mentions(to_jsonb(x),private.deleted_media_locator_columns('public.brand_index_uncertain'::regclass),$5,$6) exact
    from public.brand_index_uncertain x where id=$1`,[i+1,sentinel,pattern('brand/logo.png'),pattern('storage/brand/logo.png'),'brand/logo.png','storage/brand/logo.png'])).rows[0];
   assert.equal(row.sentinel,item.sentinel,item.label);assert.equal(row.exact,item.exact??false,item.label);
   assert.equal(row.candidate,item.sentinel||Boolean(item.exact),`${item.label}: uncertain or matching row cannot disappear from exact checking`);
  }
  for(const zone of ['UTC','Pacific/Apia','Etc/GMT+12'])for(const style of ['ISO, MDY','SQL, DMY','Postgres, MDY']){
   await db.exec(`set timezone=${lit(zone)};set datestyle=${lit(style)}`);
   assert.equal(await scalar(db,`select (${expr})=private.deleted_media_normalize_locator(private.deleted_media_locator_document(to_jsonb(x),'public.brand_index_uncertain'::regclass)::text) from public.brand_index_uncertain x where id=1`),true,`${zone}/${style}`);
  }
 }finally{await db.close();}
});

test('unsupported relations and changed schema/helper/index metadata disable candidate optimization',async(t)=>{
 const db=await setup();
 try{
  t.diagnostic(`migrationSHA256=${createHash('sha256').update(migration).digest('hex')}; activeColumnBoundary=64/65`);
  await db.exec(`create table public.brand_index_metadata(id integer,metadata jsonb,media_url varchar(100),unrelated text,created_at timestamptz);`);
  assert.equal(await available(db,'public.brand_index_metadata'),null,'unregistered table falls back');
  const expr=await register(db,'public.brand_index_metadata');
  const fallback=async label=>assert.equal(await available(db,'public.brand_index_metadata'),null,label);
  for(const [label,sql] of [
   ['new locator','alter table public.brand_index_metadata add column future_path text'],
   ['new nonlocator','alter table public.brand_index_metadata add column future_field text'],
   ['renamed locator','alter table public.brand_index_metadata rename media_url to renamed_uri'],
   ['locator typmod','alter table public.brand_index_metadata alter media_url type varchar(200)'],
   ['locator collation','alter table public.brand_index_metadata alter media_url type varchar(100) collate "C"'],
   ['dropped locator','alter table public.brand_index_metadata drop column media_url'],
   ['array field','alter table public.brand_index_metadata add column flags text[]'],
   ['missing index','drop index public.brand_index_test'],
   ['stored expression mismatch',"update private.platform_brand_reference_indexes_v1 set index_expression='wrong'"],
   ['stored schema mismatch',"update private.platform_brand_reference_indexes_v1 set row_schema='[]'"],
   ['stored scan mismatch',"update private.platform_brand_reference_indexes_v1 set scan_expression='wrong'"],
   ['stored environment mismatch',"update private.platform_brand_reference_indexes_v1 set environment='{}'"],
  ]){await rollbackCase(db,sql,()=>fallback(label));assert.equal(await available(db,'public.brand_index_metadata'),expr,`${label}: rollback restores eligibility`);}
  const changed=definition(normalizer,'deleted_media_normalize_locator').replace(/^create function/,'create or replace function').replace('begin\n','begin\n -- Test-only definition mismatch.\n');
  await rollbackCase(db,changed,()=>fallback('shared normalizer definition mismatch'));
  await rollbackCase(db,'alter function private.platform_brand_retention_row_mentions(jsonb,text[],text,text) stable',()=>fallback('exact matcher attribute mismatch'));
  await rollbackCase(db,`create index wrong_kind on public.brand_index_metadata ((${expr}));update private.platform_brand_reference_indexes_v1 set index_oid='public.wrong_kind'::regclass`,()=>fallback('wrong access method'));
  await rollbackCase(db,`create index wrong_partial on public.brand_index_metadata using gin ((${expr}) extensions.gin_trgm_ops) where id>0;update private.platform_brand_reference_indexes_v1 set index_oid='public.wrong_partial'::regclass`,()=>fallback('partial index'));
  await db.exec(`create domain public.brand_text_domain as text;
   create type public.brand_custom_enum as enum ('value');
   create table public.brand_index_json(id integer,metadata json);
   create table public.brand_index_domain(id integer,metadata jsonb,unrelated public.brand_text_domain);
   create table public.brand_index_array(id integer,metadata jsonb,unrelated integer[]);
   create table public.brand_index_custom(id integer,metadata jsonb,unrelated public.brand_custom_enum);
   create table public.brand_index_numeric(id integer,metadata jsonb,unrelated numeric);
   create table public.brand_index_no_locators(id integer,unrelated text);
   create table public.brand_index_partition(id integer,metadata jsonb) partition by range(id);
   create table public.brand_index_partition_child partition of public.brand_index_partition for values from(0) to(10);
   create table public.brand_index_parent(id integer,metadata jsonb);
   create table public.brand_index_child() inherits(public.brand_index_parent);`);
  await db.exec(`create table public.brand_index_wide(metadata jsonb,${Array.from({length:64},(_,i)=>`extra_${i+1} text`).join(',')})`);
  for(const suffix of ['json','domain','array','custom','numeric','no_locators','partition','partition_child','parent','child'])
   assert.equal(await expression(db,'public.brand_index_'+suffix),null,suffix);
  assert.equal(await expression(db,'public.brand_index_wide'),null,'65 active columns require exact fallback');
  await rollbackCase(db,'alter table public.brand_index_wide drop column extra_64',async()=>{
   assert.equal(typeof await expression(db,'public.brand_index_wide'),'string','64 active columns remain eligible even with a dropped catalog attribute');
  });
  assert.equal(await expression(db,'public.brand_index_wide'),null,'rollback restores the 65-column fallback');
  assert.equal((await db.query('select * from private.platform_brand_index_spec_v1(0::oid)')).rows.length,0,'unknown table');
  // Invalid JSON is accepted as json but not as jsonb. The table must remain on
  // exact fallback; a locator-only index cannot silently discard its error.
  await db.query(`insert into public.brand_index_json values(1,$1::json)`,['"\\u0000"']);
  await assert.rejects(db.query('select to_jsonb(x) from public.brand_index_json x'),error=>error.code==='22P05');
  const acl=(await db.query(`select count(*)::int exposed from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where n.nspname='private' and p.proname like 'platform_brand_index_%' and a.grantee=0 and a.privilege_type='EXECUTE'`)).rows[0];
  assert.equal(acl.exposed,2,'only the two approved pure helpers are publicly executable');
  for(const role of ['anon','authenticated','service_role'])for(const signature of ['platform_brand_index_spec_v1(oid)','platform_brand_index_expression_v1(oid)','platform_brand_retention_row_mentions(jsonb,text[],text,text)'])
   assert.equal(await scalar(db,'select has_function_privilege($1,$2,\'EXECUTE\')',[role,'private.'+signature]),false);
  // Index maintenance uses only the two approved pure EXECUTE permissions. No
  // private schema USAGE or service authority accompanies those grants.
  await db.exec('grant usage on schema public to service_role;grant select,insert,update,delete,truncate on public.brand_index_metadata to service_role;set role service_role');
  try{await db.exec(`insert into public.brand_index_metadata values(1,'{"url":"brand%2Flogo.png"}','other','ordinary','2026-01-01')`);}
  finally{await db.exec('reset role');}
  assert.equal(await scalar(db,'select count(*)::int from public.brand_index_metadata'),1);
  assert.equal(await scalar(db,`select (${expr}) like '%brand/logo.png%' and (${expr})<>${lit(sentinel)} from public.brand_index_metadata`),true,'encoded insert maintains the exact normalized index value');
  await db.exec('set role service_role');
  try{await db.exec(`update public.brand_index_metadata set metadata='{"url":"brand/logo.png"}' where id=1`);}
  finally{await db.exec('reset role');}
  assert.equal(await scalar(db,`select (${expr}) like '%brand/logo.png%' from public.brand_index_metadata`),true,'update maintains canonical index value');
  await db.exec('set role service_role');
  try{await db.exec('delete from public.brand_index_metadata where id=1');}finally{await db.exec('reset role');}
  assert.equal(await scalar(db,'select count(*)::int from public.brand_index_metadata'),0,'delete succeeds with authority-bearing private helpers still revoked');
  await db.exec('set role service_role');
  try{await db.exec(`insert into public.brand_index_metadata values(2,'{"url":"brand/logo.png"}',null,null,'2026-01-01'),(3,'{"url":"brand%2Flogo.png"}',null,null,'2026-01-01');truncate public.brand_index_metadata`);}
  finally{await db.exec('reset role');}
  assert.equal(await scalar(db,'select count(*)::int from public.brand_index_metadata'),0,'truncate clears native index entries');
 }finally{await db.close();}
});

test('materialized candidate rows preserve whole-row JSON, matching and post-candidate exemptions',async(t)=>{
 const db=await setup();
 const table='public.brand_index_cte_rows';
 const columns=['row_id','metadata','media_url','Odd URL "雪"','unrelated','small_value','large_value','owner_id','active','created_at','local_at','exempted','reused_path'];
 let stages=0,comparisons=0;
 try{
  t.diagnostic(`migrationSHA256=${createHash('sha256').update(migration).digest('hex')}; CTE test executes proposed query shapes independently of the installed clearance body`);
  await db.exec(`create table ${table}(
   row_id integer primary key,metadata jsonb,media_url text,"Odd URL ""雪""" text,
   unrelated varchar(100),small_value smallint,large_value bigint,owner_id uuid,active boolean,
   created_at timestamptz,local_at timestamp,exempted boolean,reused_path text,
   generated_path text generated always as (coalesce(media_url,'')||'/generated') stored
  )`);
  const rows=[
   {row_id:1,metadata:{nested:['value',{key:'雪/é/😀'}]},media_url:'brand/logo.png','Odd URL "雪"':'雪/é/😀.png',unrelated:'irrelevant',small_value:-32768,large_value:'9223372036854775807',owner_id:'11111111-1111-4111-8111-111111111111',active:true,created_at:'2026-01-01T12:34:56.123456Z',local_at:'2026-01-01T12:34:56.123456',exempted:false},
   {row_id:2,metadata:{encoded:'storage%2Fbrand%2Flogo.png'},small_value:32767,large_value:'-9223372036854775808',active:false,created_at:'2026-01-02T00:00:00Z',exempted:false},
   {row_id:3,metadata:{quote:'a"b\\c'},'Odd URL "雪"':'quoted-only/logo.png',exempted:false},
   {row_id:4},
   {row_id:5,media_url:'exempt-only/logo.png',exempted:true},
   {row_id:6,media_url:'own-row/logo.png',exempted:false},
   {row_id:7,unrelated:'brand/logo.png',exempted:false},
  ];
  const names=columns.map(ident).join(',');
  await db.query(`insert into ${table}(${names}) select ${names} from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(rows)]);
  await db.exec(`update ${table} set metadata='null'::jsonb where row_id=4`);
  const pairs=[
   ['brand/logo.png','storage/brand/logo.png'],['exempt-only/logo.png','absent'],
   ['own-row/logo.png','absent'],['quoted-only/logo.png','absent'],
   ['readded/logo.png','absent'],['/generated','absent'],[null,null],['',null],
  ];
  // This fixture predicate exercises both a JSON-independent own-row exclusion
  // and an exemption flag. Actual Brand exemption definitions stay covered by
  // the literal-source invariant below and complete native regression tests.
  const exemption='x.row_id<>6 and not coalesce(x.exempted,false)';
  const exact=`private.platform_brand_retention_row_mentions(to_jsonb(x),(select private.deleted_media_locator_columns(${lit(table)}::regclass))::text[],$1,$2)`;
  async function compare(label){
   const expr=await expression(db,table);assert.equal(typeof expr,'string',`${label}: eligible ordinary schema`);
   const documents=(await db.query(`with materialized_rows as materialized(select * from ${table})
    select d.row_id,c.row_id cte_id,to_jsonb(d)::text is not distinct from to_jsonb(c)::text json_equal
    from ${table} d full join materialized_rows c on c.row_id=d.row_id order by d.row_id`)).rows;
   assert.equal(documents.length,rows.length,`${label}: materialization preserves row count`);
   for(const row of documents){assert.equal(row.cte_id,row.row_id,label);assert.equal(row.json_equal,true,`${label}: row ${row.row_id} whole JSON text`);}
   for(const [key,path] of pairs){
    const args=[key,path,pattern(key),pattern(path)];
    const candidate=key!==null&&path!==null&&key!==''&&path!==''
     ?`((${expr}) like $3 escape '!' or (${expr}) like $4 escape '!' or (${expr})=${lit(sentinel)})`
     :'true';
    const matches=(await db.query(`with materialized_rows as materialized(select * from ${table})
     select d.row_id,
      private.platform_brand_retention_row_mentions(to_jsonb(d),(select private.deleted_media_locator_columns(${lit(table)}::regclass))::text[],$1,$2)
      is not distinct from
      private.platform_brand_retention_row_mentions(to_jsonb(c),(select private.deleted_media_locator_columns(${lit(table)}::regclass))::text[],$1,$2) matching_equal
     from ${table} d join materialized_rows c on c.row_id=d.row_id order by d.row_id`,args.slice(0,2))).rows;
    assert.equal(matches.length,rows.length);
    for(const row of matches)assert.equal(row.matching_equal,true,`${label}: row ${row.row_id} matcher ${JSON.stringify([key,path])}`);
    const result=(await db.query(`with candidates as materialized(select * from ${table} x where ${candidate})
     select exists(select 1 from ${table} x where ${candidate} and ${exemption} and ${exact}) original,
      exists(select 1 from candidates x where ${exemption} and ${exact}) materialized`,candidate==='true'?args.slice(0,2):args)).rows[0];
    assert.equal(result.materialized,result.original,`${label}: candidate/exemption ordering ${JSON.stringify([key,path])}`);
    if(key==='exempt-only/logo.png'||key==='own-row/logo.png')assert.equal(result.original,false,`${label}: exempt row is not a live reference`);
    comparisons++;
   }
   stages++;
  }
  await compare('initial typed rows and generated column');
  assert.equal(await scalar(db,`select generated_path from ${table} where row_id=1`),'brand/logo.png/generated');
  await db.exec(`update ${table} set reused_path='readded/logo.png' where row_id=7`);
  await compare('locator before dropping');
  await db.exec(`alter table ${table} drop column reused_path`);
  await compare('dropped locator omitted from both row descriptors');
  await db.exec(`alter table ${table} add column reused_path text;update ${table} set reused_path='readded/logo.png' where row_id=7`);
  await compare('readded locator with a new attribute number');
  await db.exec(`alter table ${table} rename column ${ident('Odd URL "雪"')} to ${ident('Odd note "雪"')}`);
  await compare('quoted Unicode column renamed out of locator selection');
  await db.exec(`alter table ${table} rename column ${ident('Odd note "雪"')} to ${ident('Odd URI "雪"')}`);
  await compare('quoted Unicode column renamed back into locator selection');
  await db.exec(`update ${table} set media_url='updated/logo.png' where row_id=1`);
  await compare('stored generated value changes with base value');
  assert.equal(await scalar(db,`select generated_path from ${table} where row_id=1`),'updated/logo.png/generated');
  t.diagnostic(`schemaStages=${stages}; needlePairsPerStage=${pairs.length}; candidateExistenceComparisons=${comparisons}; wholeRowAndMatcherRowsPerComparison=${rows.length}`);
 }finally{await db.close();}
});

test('indexed clearance retains the exact exemption block and exact matcher after its candidate predicate',()=>{
 const name='platform_brand_retention_references_clear';
 const before=definition(matcher,name),after=definition(migration,name);
 const exemptions=sql=>sql.slice(sql.indexOf("predicate:='true';"),sql.indexOf("\n   execute format('select exists")>=0?sql.indexOf("\n   execute format('select exists"):undefined);
 const oldBlock=exemptions(before).trim();
 const newBlock=exemptions(after).split("   candidate_predicate:='true';")[0].trim();
 assert.equal(newBlock,oldBlock,'all original row exemptions remain literal');
 assert.match(after,/perform private\.platform_brand_retention_lock\(\);/);
 assert.match(after,/lock table public\.%I in access share mode/);
 assert.ok(after.indexOf('lock table public.%I')<after.indexOf('private.platform_brand_index_expression_v1(t.oid)'));
 assert.match(after,/if predicate='true' and r\.object_key is not null/,'special predicates keep their exact original evaluation path');
 assert.match(after,/with candidates as materialized \(select \* from public\.%I x where %s\) select exists\(select 1 from candidates x where %s and private\.platform_brand_retention_row_mentions\(to_jsonb\(x\),\(select private\.deleted_media_locator_columns\(%s::oid\)\)::text\[\],\$1,\$2\)/);
 const originalScan=before.match(/execute format\('select exists[\s\S]*?into found_ref using r\.object_key,r\.storage_path;/)[0];
 assert.ok(after.includes(originalScan.replace(/\n   /g,'\n     ')),'fallback statement and parameters remain the exact prior C scan');
 assert.match(after,/if found_ref then return false; end if/);
 assert.doesNotMatch(after,/\blimit\b|set_config|statement_timeout/i);
 assert.doesNotMatch(migration,/create (?:or replace )?function private\.deleted_media_/i);
 const spec=definition(migration,'platform_brand_index_spec_v1');
 const fragments=[...spec.matchAll(/(?:projected|budget|safe|scan_expression):=[\s\S]*?;/g)].map(match=>match[0]);
 assert.ok(fragments.length>0);
 for(const fragment of fragments)for(const call of fragment.matchAll(/private\.([a-z_0-9]+)\(/g))
  assert.ok(['platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1'].includes(call[1]),'generated index fragments call only the approved pure helpers');
});
