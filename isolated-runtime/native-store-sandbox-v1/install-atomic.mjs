// Source-only SQL assembler. No network, database executor, or deployment permission.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {nativeStoreInstallProfile} from './install-profile.mjs';
import {aclItemsSQL,publicAclSQL,NATIVE_ROLES} from './install-delta.mjs';
import {catalogItemsSQL} from '../../scripts/native-store-install-prepare.mjs';
const literal=x=>"'"+x.replaceAll("'","''")+"'";
export function nativeStoreAtomicInstallSQL(){
 const profile=nativeStoreInstallProfile();
 const pin=JSON.parse(gunzipSync(fs.readFileSync(new URL('./install-atomic-rows.json.gz',import.meta.url)),{maxOutputLength:8*1024*1024}).toString('utf8'));
 const delta=JSON.parse(fs.readFileSync(new URL('./install-delta.json',import.meta.url),'utf8'));
 const hash=createHash('sha256').update(JSON.stringify(pin.rows.map(r=>JSON.stringify(r)).sort())).digest('hex');
 if(pin.sourceDigest!==profile.sourceDigest||pin.addedCatalogSha256!==delta.addedCatalogSha256||hash!==delta.addedCatalogSha256)throw Error('native_atomic_pin_mismatch');
 const names=[...new Set([...profile.sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(/giu)].map(m=>m[1]))];
 const list=a=>a.map(literal).join(',');
 const added=`case r->>0
 when 'function' then r->>1 in('sandbox_commerce_v1','native_store_sandbox_v1') or (r->>1='public' and r->>2 in(${list(names)}))
 when 'relation' then r->>1 in('sandbox_commerce_v1','native_store_sandbox_v1')
 when 'constraint' then r->>1 in('sandbox_commerce_v1','native_store_sandbox_v1')
 when 'schema' then r->>1 in('sandbox_commerce_v1','native_store_sandbox_v1')
 when 'role' then r->>1 in(${list(NATIVE_ROLES)})
 when 'membership' then r->>1 in(${list(NATIVE_ROLES)}) or r->>2 in(${list(NATIVE_ROLES)}) or r->>3 in(${list(NATIVE_ROLES)})
 when 'defaultAcl' then r->>1 in(${list(NATIVE_ROLES)}) or r->>2 in('sandbox_commerce_v1','native_store_sandbox_v1')
 else r->>0 in('column','index','policy','trigger') and (r->>1 like 'sandbox\\_commerce\\_v1.%' or r->>1 like 'native\\_store\\_sandbox\\_v1.%') end`;
 const helpers=`
 create function pg_temp.native_added(r jsonb) returns boolean language sql immutable as $body$ select ${added} $body$;
 create function pg_temp.native_normalize(r jsonb, acl_value jsonb, bootstrap text) returns jsonb language plpgsql immutable as $body$
 declare k text; i integer;
 begin
 case r->>0
 when 'function' then k:='function:'||(r->>1)||'.'||(r->>2)||'('||(r->>3)||')';i:=5;
 when 'relation' then k:='relation:'||(r->>1)||'.'||(r->>2);i:=5;
 when 'schema' then k:='schema:'||(r->>1);i:=3;
 when 'column' then k:='column:'||(r->>1)||'.'||(r->>2);i:=5;
 else null;end case;
 if k is not null then
 if jsonb_typeof(acl_value) is distinct from 'array' then raise exception 'native_atomic_acl_missing';end if;
 r:=jsonb_set(r,array[i::text],acl_value);end if;
 if r->>0='trigger' and r->3='true'::jsonb then
 if r->>10 is null or r->>11 is null then raise exception 'native_atomic_constraint_missing';end if;
 r:=jsonb_set(r,'{2}','"<internal>"');
 r:=jsonb_set(r,'{9}',to_jsonb(regexp_replace(r->>9,'RI_ConstraintTrigger_[ac]_[0-9]+','RI_ConstraintTrigger_<internal>','g')));
 end if;
 if r->>0='membership' and r->>3=bootstrap then r:=jsonb_set(r,'{3}','"<bootstrap-superuser>"');end if;
 return r;end $body$;
 `;
 // Each expected row is a separate bounded JSONB value. No whole-catalog
 // JSONB aggregate or PL/pgSQL array is retained. Sort-based EXCEPT ALL can
 // spill within the caller's work_mem; PostgreSQL's hashed SetOp cannot.
 const expectedInserts=[];
 for(let i=0;i<pin.rows.length;i+=32)expectedInserts.push('insert into native_atomic_expected(r) values '+pin.rows.slice(i,i+32).map(r=>'('+literal(JSON.stringify(r))+'::jsonb)').join(',')+';');
 const pre=`set local enable_hashagg=off;
 create temporary table native_atomic_before(r jsonb not null) on commit drop;
 create temporary table native_atomic_meta(bootstrap text,public_acl jsonb) on commit drop;
 with captured as (insert into native_atomic_before ${catalogItemsSQL})
 insert into native_atomic_meta select (select rolname from pg_roles where oid=10 and rolsuper),(${publicAclSQL.replace(/;$/u,'')});
 ${helpers}
 do $body$ begin
 if exists(select 1 from native_atomic_before where pg_temp.native_added(r)) then raise exception 'native_atomic_names_not_fresh';end if;
 end $body$;`;
 const post=`reset role;
 -- Force the original immutable default-off/empty-state deferred guards before verification.
 set constraints all immediate;
 create temporary table native_atomic_after(r jsonb not null) on commit drop;
 create temporary table native_atomic_acls(k text primary key,v jsonb not null) on commit drop;
 create temporary table native_atomic_after_meta(bootstrap text,public_acl jsonb) on commit drop;
 with captured as (insert into native_atomic_after ${catalogItemsSQL}),
 captured_acls as (insert into native_atomic_acls ${aclItemsSQL})
 insert into native_atomic_after_meta select (select rolname from pg_roles where oid=10 and rolsuper),(${publicAclSQL.replace(/;$/u,'')});
 create temporary table native_atomic_expected(r jsonb not null) on commit drop;
 ${expectedInserts.join('\n')}
 create temporary table native_atomic_added_rows(r jsonb not null) on commit drop;
 insert into native_atomic_added_rows
 select pg_temp.native_normalize(a.r,acl.v,(select bootstrap from native_atomic_after_meta))
 from native_atomic_after a left join native_atomic_acls acl on acl.k=case a.r->>0
 when 'function' then 'function:'||(a.r->>1)||'.'||(a.r->>2)||'('||(a.r->>3)||')'
 when 'relation' then 'relation:'||(a.r->>1)||'.'||(a.r->>2)
 when 'schema' then 'schema:'||(a.r->>1)
 when 'column' then 'column:'||(a.r->>1)||'.'||(a.r->>2) end
 where pg_temp.native_added(a.r);
 do $body$
 declare bootstrap text;owner_name text;expected_acl jsonb;actual_acl jsonb;
 begin
 select m.bootstrap,m.public_acl into strict bootstrap,expected_acl from native_atomic_meta m;
 if bootstrap is null or bootstrap is distinct from (select m.bootstrap from native_atomic_after_meta m) then raise exception 'native_atomic_bootstrap_changed';end if;
 if exists(
 (select case when r->>0='schema' and r->>1='public' then jsonb_set(r,'{3}','null') else r end from native_atomic_before
 except all select case when r->>0='schema' and r->>1='public' then jsonb_set(r,'{3}','null') else r end from native_atomic_after where not pg_temp.native_added(r))
 union all
 (select case when r->>0='schema' and r->>1='public' then jsonb_set(r,'{3}','null') else r end from native_atomic_after where not pg_temp.native_added(r)
 except all select case when r->>0='schema' and r->>1='public' then jsonb_set(r,'{3}','null') else r end from native_atomic_before)
 ) then raise exception 'native_atomic_existing_catalog_changed';end if;
 select r->>2 into strict owner_name from native_atomic_before where r->>0='schema' and r->>1='public';
 expected_acl:=expected_acl||jsonb_build_array(jsonb_build_array(owner_name,'sbx_v1_core_owner','USAGE',false),jsonb_build_array(owner_name,'native_store_sandbox_v1_owner','USAGE',false));
 select m.public_acl into strict actual_acl from native_atomic_after_meta m;
 if exists((select value from jsonb_array_elements(expected_acl) except all select value from jsonb_array_elements(actual_acl)) union all (select value from jsonb_array_elements(actual_acl) except all select value from jsonb_array_elements(expected_acl))) then raise exception 'native_atomic_public_acl_changed';end if;
 if exists(
 (select r from native_atomic_added_rows except all select r from native_atomic_expected)
 union all
 (select r from native_atomic_expected except all select r from native_atomic_added_rows)
 ) then raise exception 'native_atomic_added_catalog_changed';end if;
 end $body$;
 drop function pg_temp.native_normalize(jsonb,jsonb,text);drop function pg_temp.native_added(jsonb);
 commit;`;
 if(!/^\s*(?:--[^\n]*\n)*begin;/u.test(profile.sql)||!/commit;\s*$/u.test(profile.sql))throw Error('native_atomic_transaction_shape');
 return profile.sql.replace('begin;',()=> 'begin;\n'+pre).replace(/commit;\s*$/u,()=>post);
}
