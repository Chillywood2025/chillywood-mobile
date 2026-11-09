// Source-only SQL assembler. No network, database executor, or deployment permission.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {nativeStoreInstallProfile} from './install-profile.mjs';
import {deltaSnapshotSQL,NATIVE_ROLES} from './install-delta.mjs';
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
 create function pg_temp.native_normalize(r jsonb, acls jsonb, bootstrap text) returns jsonb language plpgsql immutable as $body$
 declare k text; i integer;
 begin
 case r->>0
 when 'function' then k:='function:'||(r->>1)||'.'||(r->>2)||'('||(r->>3)||')';i:=5;
 when 'relation' then k:='relation:'||(r->>1)||'.'||(r->>2);i:=5;
 when 'schema' then k:='schema:'||(r->>1);i:=3;
 when 'column' then k:='column:'||(r->>1)||'.'||(r->>2);i:=5;
 else null;end case;
 if k is not null then
 if jsonb_typeof(acls->k) is distinct from 'array' then raise exception 'native_atomic_acl_missing';end if;
 r:=jsonb_set(r,array[i::text],acls->k);end if;
 if r->>0='trigger' and r->3='true'::jsonb then
 if r->>10 is null or r->>11 is null then raise exception 'native_atomic_constraint_missing';end if;
 r:=jsonb_set(r,'{2}','"<internal>"');
 r:=jsonb_set(r,'{9}',to_jsonb(regexp_replace(r->>9,'RI_ConstraintTrigger_[ac]_[0-9]+','RI_ConstraintTrigger_<internal>','g')));
 end if;
 if r->>0='membership' and r->>3=bootstrap then r:=jsonb_set(r,'{3}','"<bootstrap-superuser>"');end if;
 return r;end $body$;
 `;
 const pre=`create temporary table native_atomic_before(snapshot jsonb) on commit drop;
 insert into native_atomic_before ${deltaSnapshotSQL}
 ${helpers}
 do $body$ begin
 if exists(select 1 from native_atomic_before b,jsonb_array_elements(b.snapshot->'rows') r where pg_temp.native_added(r)) then raise exception 'native_atomic_names_not_fresh';end if;
 end $body$;`;
 const post=`reset role;
 -- Force the original immutable default-off/empty-state deferred guards before verification.
 set constraints all immediate;
 do $body$
 declare b jsonb; a jsonb; owner_name text; expected_acl jsonb; expected_rows jsonb := ${literal(JSON.stringify(pin.rows))}::jsonb;
 begin
 select snapshot into strict b from native_atomic_before;
 ${deltaSnapshotSQL.replace(/^select /u,'select ').replace(/;$/u,' into a;')}
 if b->>'bootstrapSuperuser' is null or b->>'bootstrapSuperuser' is distinct from a->>'bootstrapSuperuser' then raise exception 'native_atomic_bootstrap_changed';end if;
 if exists(
 (select case when r->>0='schema' and r->>1='public' then jsonb_set(r,'{3}','null') else r end from jsonb_array_elements(b->'rows') r
 except all select case when r->>0='schema' and r->>1='public' then jsonb_set(r,'{3}','null') else r end from jsonb_array_elements(a->'rows') r where not pg_temp.native_added(r))
 union all
 (select case when r->>0='schema' and r->>1='public' then jsonb_set(r,'{3}','null') else r end from jsonb_array_elements(a->'rows') r where not pg_temp.native_added(r)
 except all select case when r->>0='schema' and r->>1='public' then jsonb_set(r,'{3}','null') else r end from jsonb_array_elements(b->'rows') r)
 ) then raise exception 'native_atomic_existing_catalog_changed';end if;
 select r->>2 into strict owner_name from jsonb_array_elements(b->'rows') r where r->>0='schema' and r->>1='public';
 expected_acl:=(b->'publicAcl')||jsonb_build_array(jsonb_build_array(owner_name,'sbx_v1_core_owner','USAGE',false),jsonb_build_array(owner_name,'native_store_sandbox_v1_owner','USAGE',false));
 if exists((select value from jsonb_array_elements(expected_acl) except all select value from jsonb_array_elements(a->'publicAcl')) union all (select value from jsonb_array_elements(a->'publicAcl') except all select value from jsonb_array_elements(expected_acl))) then raise exception 'native_atomic_public_acl_changed';end if;
 if exists(
 (select pg_temp.native_normalize(r,a->'acls',a->>'bootstrapSuperuser') from jsonb_array_elements(a->'rows') r where pg_temp.native_added(r)
 except all select value from jsonb_array_elements(expected_rows))
 union all
 (select value from jsonb_array_elements(expected_rows)
 except all select pg_temp.native_normalize(r,a->'acls',a->>'bootstrapSuperuser') from jsonb_array_elements(a->'rows') r where pg_temp.native_added(r))
 ) then raise exception 'native_atomic_added_catalog_changed';end if;
 end $body$;
 drop function pg_temp.native_normalize(jsonb,jsonb,text);drop function pg_temp.native_added(jsonb);
 commit;`;
 if(!/^\s*(?:--[^\n]*\n)*begin;/u.test(profile.sql)||!/commit;\s*$/u.test(profile.sql))throw Error('native_atomic_transaction_shape');
 return profile.sql.replace('begin;',()=> 'begin;\n'+pre).replace(/commit;\s*$/u,()=>post);
}
