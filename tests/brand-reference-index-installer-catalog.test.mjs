// SQL catalog acceptance only. PGlite is PostgreSQL 18 and cannot qualify
// concurrent native builds or session/lock behavior on PostgreSQL 17.6.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {runBrandReferenceIndexInstaller,validateCatalog,sourceContract} from '../scripts/brand-reference-index-installer.mjs';

test('real SQL reconstructs the exact guard and rejects a changed initial guard or permission catalog',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});let captured;
 const files=['20261020141554_deleted_media_reference_retirement.sql','20261020201310_deleted_content_stage_recovery.sql','20261025121430_platform_brand_reference_scan_performance.sql','20261025141347_platform_brand_reference_candidate_indexes.sql'].map(n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8'));
 const candidate=files[3];
 try{
  await db.exec('create schema private;create schema extensions;create role anon;create role authenticated;create role service_role;create extension pg_trgm with schema extensions;set check_function_bodies=off;');
  for(const expected of sourceContract().functions){
   const definitions=files.flatMap(source=>[...source.matchAll(new RegExp(`create (?:or replace )?function private\\.${expected.name}\\([\\s\\S]*?\\$\\$;`,'g'))]);
   assert.ok(definitions.length);await db.exec(definitions.at(-1)[0]);
   await db.exec(`revoke all on function ${expected.name==='platform_brand_index_spec_v1'?'private.platform_brand_index_spec_v1(oid)':{
    deleted_media_locator_columns:'private.deleted_media_locator_columns(oid)',deleted_media_normalize_locator:'private.deleted_media_normalize_locator(text)',
    platform_brand_retention_row_mentions:'private.platform_brand_retention_row_mentions(jsonb,text[],text,text)',platform_brand_index_jsonb_bytes_v1:'private.platform_brand_index_jsonb_bytes_v1(jsonb)',
    platform_brand_index_normalize_v1:'private.platform_brand_index_normalize_v1(text)',platform_brand_index_environment_v1:'private.platform_brand_index_environment_v1()',
    platform_brand_index_expression_v1:'private.platform_brand_index_expression_v1(oid)',platform_brand_retention_references_clear:'private.platform_brand_retention_references_clear(uuid)',
   }[expected.name]} from public,anon,authenticated,service_role;`);
  }
  await db.exec('set check_function_bodies=on;grant execute on function private.platform_brand_index_jsonb_bytes_v1(jsonb),private.platform_brand_index_normalize_v1(text) to public;');
  await db.exec(candidate.match(/create table private\.platform_brand_reference_indexes_v1[\s\S]*?revoke all on private\.platform_brand_reference_indexes_v1[^;]+;/)[0]);
  await db.exec(candidate.split('-- BEGIN immutable normalized helper DDL safeguard')[1].split('-- END immutable normalized helper DDL safeguard')[0]);
  const adapter={cancel:async()=>{},connect:async()=>({end:async()=>{},query:async sql=>{
   if(/^select/i.test(sql.trim())){const result=await db.query(sql);if(result.rows[0]?.value?.database)captured=result.rows[0].value;return result;}
   await db.exec(sql);return{rows:[]};
  }})};
  const inspect=async()=>{captured=undefined;await assert.rejects(runBrandReferenceIndexInstaller({adapter,checkpoint:async()=>{}}));assert.ok(captured);return captured;};
  const actual=await inspect();assert.equal(actual.database.version,'180003');
  assert.deepEqual(actual.guards.map(g=>g.expected),[true,true]);
  // Change only the version field in this component assertion. The real
  // installer above rejects this engine and is never used to build an index.
  validateCatalog({...actual,database:{...actual.database,version:'170006'}});
  await db.exec('grant select on private.platform_brand_reference_indexes_v1 to authenticated;');
  assert.equal((await inspect()).registry.ownerOnly,false);
  await db.exec("create or replace function extensions.guard_platform_brand_index_helper_ddl_v1() returns event_trigger language plpgsql security invoker set search_path='' as $$begin null;end$$;");
  assert.deepEqual((await inspect()).guards.map(g=>g.expected),[false,false]);
 }finally{await db.close();}
});
