// Disposable local fixture only, deliberately absent from install-profile.
import fs from 'node:fs';import assert from 'node:assert/strict';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
export function installEventTriggerParity(q){
 const fixture=JSON.parse(fs.readFileSync(new URL('./event-trigger.fixture.json',import.meta.url),'utf8'));
 const migration=fs.readFileSync(new URL('../../supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql',import.meta.url),'utf8');
 q('create role supabase_admin nologin superuser;create schema extensions authorization postgres;revoke all on schema extensions from public;grant usage on schema extensions to anon,authenticated,service_role;create schema private authorization postgres;');
 // Same helpers and guard template, with actual LOCAL OIDs/catalog rows.
 const start=migration.indexOf('create function private.platform_brand_index_jsonb_bytes_v1('),end=migration.indexOf('create event trigger platform_brand_index_helper_ddl_v1');
 assert.ok(start>0&&end>start);q(migration.slice(start,end),'postgres');
 for(const t of fixture.triggers){
  assert.equal(t.prosecdef,false);assert.deepEqual(t.proconfig,['search_path=""']);assert.equal(t.evtenabled,'O');
  q(t.definition);const signature=t.definition.match(/FUNCTION (extensions\.\w+\(\))/u)?.[1];assert.ok(signature);
  q(`alter function ${signature} owner to supabase_admin;grant execute on function ${signature} to public;
   create event trigger ${t.evtname} on ${t.evtevent}${t.evttags?' when tag in ('+t.evttags.map(literal).join(',')+')':''} execute function ${signature};alter event trigger ${t.evtname} owner to supabase_admin;`);
 }
 // Local event-trigger OWNER is fixture_admin: PostgreSQL requires a superuser
 // event owner. Function owner/ACL/invoker behavior matches hosted postgres;
 // no temporary elevation of the modeled installer is used or implied.
 q('create event trigger platform_brand_index_helper_ddl_v1 on ddl_command_end execute function extensions.guard_platform_brand_index_helper_ddl_v1();create event trigger platform_brand_index_helper_drop_v1 on sql_drop execute function extensions.guard_platform_brand_index_helper_ddl_v1();');
 assert.equal(q('select count(*) from pg_event_trigger;'),'8');
}
