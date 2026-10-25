import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {splitSQL} from './helpers/database-runtime-authority-fixture.mjs';
import {referenceScanFixtureSQL,referenceScanCases,referenceScanErrors,referenceScanEquivalenceSQL} from './helpers/brand-reference-scan-corpus.mjs';

const directory = new URL('../supabase/migrations/',import.meta.url);
const read = name => readFileSync(new URL(name,directory),'utf8');
const baseline = read('20261025114152_platform_brand_empty_test_disposition.sql');
const reference = read('20261020141554_deleted_media_reference_retirement.sql');
const migrationName = readdirSync(directory).find(name => name.endsWith('_platform_brand_reference_scan_performance.sql'));
assert.ok(migrationName,'forward Brand reference performance migration exists');
const migration = read(migrationName);
const definition = (source,name) => {
 const match = source.match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?\\$\\$;`));
 assert.ok(match,`source definition of ${name} exists`);return match[0];
};
// Use the final source definition, including future forward replacements. The
// Brand no-percent identity branch must fail differential validation if shared
// normalization ever stops being identity on those inputs.
const normalizers = readdirSync(directory).filter(name=>name.endsWith('.sql')).sort().flatMap(file=>
 splitSQL(read(file)).filter(sql=>/^create\s+(?:or\s+replace\s+)?function\s+private\.deleted_media_normalize_locator\s*\(/i.test(
  sql.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'').trim()
 )).map(sql=>({file,sql})));
assert.ok(normalizers.length,'current shared normalizer source exists');
const normalizer = normalizers.at(-1);

test('forward migration changes only Brand scan expression and keeps every existing guard',()=>{
 const name = 'platform_brand_retention_references_clear';
 const before = definition(baseline,name), after = definition(migration,name);
 const scan = /execute format\('select exists\(select 1 from public\.%I x where[\s\S]*?\n\s*into found_ref using r\.object_key,r\.storage_path;/;
 assert.match(before,scan);assert.match(after,scan);
 // A compact source invariant supplements dynamic cases: changing a table,
 // predicate, trigger check, error/locking path or exemption must fail here.
 const strip = sql => sql.replace(scan,'SCAN_EXPRESSION').replace(/--[^\n]*/g,'').replace(/\s+/g,' ').trim();
 assert.equal(strip(after),strip(before));
 const expression = after.match(scan)[0];
 assert.match(expression,/private\.platform_brand_retention_row_mentions\(to_jsonb\(x\),\s*\(select private\.deleted_media_locator_columns\(%s::oid\)\)::text\[\],\s*\$1,\s*\$2\)/);
 assert.doesNotMatch(expression,/deleted_media_mentions|deleted_media_locator_document|\blimit\b/i);
 assert.equal((expression.match(/deleted_media_locator_columns/g)||[]).length,1);
 assert.doesNotMatch(migration,/create (?:or replace )?function private\.deleted_media_/i,'shared helpers are unchanged');
 assert.match(migration,/revoke all on function private\.platform_brand_retention_row_mentions\(jsonb,text\[\],text,text\)\s+from public,anon,authenticated,service_role/i);
});

test('Brand matcher preserves independently executed legacy Boolean, error and grant behavior', async()=>{
 const db = new PGlite();
 try {
  await db.exec('create schema private;create role anon;create role authenticated;create role service_role;');
  await db.exec(normalizer.sql);
  for(const name of ['deleted_media_locator_columns','deleted_media_locator_document','deleted_media_mentions']) await db.exec(definition(reference,name));
  await db.exec(definition(migration,'platform_brand_retention_row_mentions'));
  await db.exec(migration.match(/revoke all on function private\.platform_brand_retention_row_mentions[^;]+;/i)[0]);
  await db.exec(referenceScanFixtureSQL);
  const {rows} = await db.query(referenceScanEquivalenceSQL());
  assert.equal(rows.length,referenceScanCases.length);
  for(const result of rows) {
   assert.equal(result.equivalent,true,`${result.label}: old ${result.original}, new ${result.optimized}`);
   assert.equal(result.expected_matches,true,`${result.label}: expected ${result.expected}, got ${result.optimized}`);
  }
  for(const item of referenceScanErrors) {
   const capture = async sql => {
    try {await db.query(sql,[item.document,item.table]);assert.fail(`${item.label} must reject`);}
    catch(error) {if(error.code) return {code:error.code,message:error.message};throw error;}
   };
   const original = await capture(`select private.deleted_media_mentions(private.deleted_media_locator_document($1::jsonb,coalesce($2::regclass::oid,0::oid)),'brand/logo.png') or private.deleted_media_mentions(private.deleted_media_locator_document($1::jsonb,coalesce($2::regclass::oid,0::oid)),'storage/brand/logo.png')`);
   const optimized = await capture(`select private.platform_brand_retention_row_mentions($1::jsonb,private.deleted_media_locator_columns(coalesce($2::regclass::oid,0::oid)),'brand/logo.png','storage/brand/logo.png')`);
   assert.deepEqual(optimized,original,`${item.label}: preserve original error`);
  }
  // Exact arrays are an input boundary, including NULL/empty/duplicate entries.
  // This oracle constructs the old projected document independently, not by
  // copying the new function body or a JavaScript normalizer.
  const arrays = [
   ['NULL','null::text[]'],['empty',"'{}'::text[]"],['NULL element','array[null]::text[]'],
   ['duplicate and NULL',"array['metadata',null,'metadata']::text[]"],['empty name',"array['']::text[]"],
   ['unrelated',"array['unrelated']::text[]"],['missing',"array['missing']::text[]"],
   ['weird name',"array['Odd URL \"雪\"']::text[]"],['JSON null',"array['present_null']::text[]"],
   ['two dimensions',"array[['metadata',''],['unrelated',null]]::text[]"],
   ['three dimensions',"array[[['metadata'],['unrelated']],[['missing'],['metadata']]]::text[]"],
   ['zero lower bound',"'[0:2]={metadata,NULL,metadata}'::text[]"],
   ['negative lower bound',"'[-3:-1]={metadata,unrelated,missing}'::text[]"],
  ];
  for(const [label,columns] of arrays) {
   const result=(await db.query(`with projected as (select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) document from jsonb_each($1::jsonb) x(k,v) where k=any(${columns}))
    select (private.deleted_media_mentions(document,$2) or private.deleted_media_mentions(document,$3)) is not distinct from private.platform_brand_retention_row_mentions($1::jsonb,${columns},$2,$3) equivalent,
     private.platform_brand_retention_row_mentions($1::jsonb,${columns},document::text,null) serialized_document_preserved from projected`,[JSON.stringify({metadata:'brand/logo.png','':'empty-name',unrelated:'other','Odd URL "雪"':'brand/logo.png',present_null:null}),'brand/logo.png',null])).rows[0];
   assert.equal(result.equivalent,true,`exact columns: ${label}`);
   assert.equal(result.serialized_document_preserved,true,`whole projected serialization: ${label}`);
  }
  const catalogChange = async () => (await db.query(`select
   private.deleted_media_mentions(private.deleted_media_locator_document($1::jsonb,'public.brand_reference_empty_fixture'::regclass),$2) original,
   private.platform_brand_retention_row_mentions($1::jsonb,(select private.deleted_media_locator_columns('public.brand_reference_empty_fixture'::regclass))::text[],$2,$2) optimized`,[JSON.stringify({future_media_url:'brand/logo.png'}),'brand/logo.png'])).rows[0];
  assert.deepEqual(await catalogChange(),{original:false,optimized:false});
  await db.exec('alter table public.brand_reference_empty_fixture add column future_media_url text');
  assert.deepEqual(await catalogChange(),{original:true,optimized:true},'next statement discovers a new locator column without a lasting cache');
  await db.exec('alter table public.brand_reference_empty_fixture drop column future_media_url');
  assert.deepEqual(await catalogChange(),{original:false,optimized:false},'dropped columns do not remain in projection');
  const metadata=(await db.query(`select provolatile,proisstrict,prosecdef,proconfig from pg_proc where oid='private.platform_brand_retention_row_mentions(jsonb,text[],text,text)'::regprocedure`)).rows[0];
  assert.equal(metadata.provolatile,'i');assert.equal(metadata.proisstrict,false);assert.equal(metadata.prosecdef,false);
  assert.deepEqual(metadata.proconfig,['search_path=""']);
  for(const role of ['anon','authenticated','service_role']) {
   assert.equal((await db.query("select has_function_privilege($1,'private.platform_brand_retention_row_mentions(jsonb,text[],text,text)','EXECUTE') allowed",[role])).rows[0].allowed,false);
  }
  assert.equal((await db.query("select exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='private.platform_brand_retention_row_mentions(jsonb,text[],text,text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') allowed")).rows[0].allowed,false);
 } finally {await db.close();}
});
