// Exact source-only install delta. No transport or mutation. The before snapshot
// must come from the same actual database as after; never use fixture baselines
// as hosted evidence. Added catalog pin is source-derived, not a target baseline.
import fs from 'node:fs';import {createHash} from 'node:crypto';
import {catalogItemsSQL} from '../../scripts/native-store-install-prepare.mjs';
import {nativeStoreInstallProfile} from './install-profile.mjs';
export const NATIVE_ROLES=Object.freeze(['native_store_sandbox_v1_owner','sbx_v1_authority_owner','sbx_v1_core_owner','sbx_v1_operator']);
const schemas=['sandbox_commerce_v1','native_store_sandbox_v1'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>{throw Error(code);};
const sort=rows=>rows.map(x=>JSON.stringify(x)).sort();
export const catalogRowsSQL=`select coalesce(jsonb_agg(item order by item::text collate "C"),'[]'::jsonb) from (${catalogItemsSQL}) native_catalog;`;
// Parse actual catalog ACL via SQL rather than guessing quoted PostgreSQL names.
export const publicAclSQL=`select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb) from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='public';`;
const relationSchema=x=>typeof x==='string'?schemas.find(s=>x.startsWith(s+'.')):null;
const acl=(value,type,owner)=>`(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb) from aclexplode(${type?`coalesce(${value},acldefault(${type},${owner}))`:value}) a)`;
export const aclItemsSQL=`
 select 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k,${acl('p.proacl',"'f'",'p.proowner')} v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1','public') and p.prokind in('f','p')
 union all select 'relation:'||n.nspname||'.'||c.relname,${acl('c.relacl',"case when c.relkind='S' then 'S'::\"char\" else 'r'::\"char\" end",'c.relowner')} from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1') and c.relkind in('r','p','v','m','S')
 union all select 'schema:'||n.nspname,${acl('n.nspacl',"'n'",'n.nspowner')} from pg_namespace n where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1')
 union all select 'column:'||a.attrelid::regclass::text||'.'||a.attname,${acl('a.attacl')} from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1') and a.attnum>0 and not a.attisdropped and c.relkind in('r','p','v','m','S')
 `;
export const aclRowsSQL=`select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) from (${aclItemsSQL}) acl_items;`;
export const deltaSnapshotSQL=`select jsonb_build_object('bootstrapSuperuser',(select rolname from pg_roles where oid=10 and rolsuper),'rows',(${catalogRowsSQL.replace(/;$/u,'')}),'publicAcl',(${publicAclSQL.replace(/;$/u,'')}),'acls',(${aclRowsSQL.replace(/;$/u,'')}));`;
export function normalizeAdded(row,acls,bootstrap){
 const copy=[...row];let key,index;
 if(row[0]==='function'){key=`function:${row[1]}.${row[2]}(${row[3]})`;index=5;}
 if(row[0]==='relation'){key=`relation:${row[1]}.${row[2]}`;index=5;}
 if(row[0]==='schema'){key=`schema:${row[1]}`;index=3;}
 if(row[0]==='column'){key=`column:${row[1]}.${row[2]}`;index=5;}
 if(key){if(!Array.isArray(acls?.[key]))fail('native_delta_acl_snapshot_missing');copy[index]=acls[key];}
 if(row[0]==='trigger'&&row[3]===true){
  if(!row[10]||!row[11])fail('native_delta_internal_constraint_missing');
  copy[2]='<internal>';copy[9]=String(row[9]).replace(/RI_ConstraintTrigger_[ac]_\d+/gu,'RI_ConstraintTrigger_<internal>');
 }
 if(row[0]==='membership'&&row[3]===bootstrap)copy[3]='<bootstrap-superuser>';
 return copy;
}
function added(row,publicNames){
 switch(row[0]){
  case 'function':return schemas.includes(row[1])||(row[1]==='public'&&publicNames.includes(row[2]));
  case 'relation':case 'constraint':case 'schema':return schemas.includes(row[1]);
  case 'column':case 'index':case 'policy':case 'trigger':return !!relationSchema(row[1]);
  case 'role':return NATIVE_ROLES.includes(row[1]);
  case 'membership':return NATIVE_ROLES.includes(row[1])||NATIVE_ROLES.includes(row[2])||NATIVE_ROLES.includes(row[3]);
  case 'defaultAcl':return NATIVE_ROLES.includes(row[1])||schemas.includes(row[2]);
  default:return false;
 }
}
export function describeNativeInstallDelta(before,after){
 const profile=nativeStoreInstallProfile();
 const publicNames=[...new Set([...profile.sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(/giu)].map(m=>m[1]))].sort();
 if(!before||!after||!Array.isArray(before.rows)||!Array.isArray(after.rows)||!Array.isArray(before.publicAcl)||!Array.isArray(after.publicAcl))fail('native_delta_snapshot_invalid');
 if(before.rows.some(r=>added(r,publicNames))||before.publicAcl.some(r=>NATIVE_ROLES.includes(r[1])))fail('native_delta_names_not_fresh');
 const normalizeExisting=r=>r[0]==='schema'&&r[1]==='public'?[...r.slice(0,3),'<ACL separately compared>']:r;
 if(JSON.stringify(sort(before.rows.map(normalizeExisting)))!==JSON.stringify(sort(after.rows.filter(r=>!added(r,publicNames)).map(normalizeExisting))))fail('native_delta_existing_catalog_changed');
 const publicBefore=before.rows.find(r=>r[0]==='schema'&&r[1]==='public');
 if(!publicBefore)fail('native_delta_public_schema_missing');
 // Schema owner grants these two exact fresh-owner USAGE entries. No other
 // old ACL change, CREATE privilege or grant option is accepted.
 const expectedAcl=[...before.publicAcl,...['sbx_v1_core_owner','native_store_sandbox_v1_owner'].map(r=>[publicBefore[2],r,'USAGE',false])];
 if(JSON.stringify(sort(after.publicAcl))!==JSON.stringify(sort(expectedAcl)))fail('native_delta_public_acl_changed');
 const newRows=after.rows.filter(r=>added(r,publicNames));
 const roles=newRows.filter(r=>r[0]==='role');
 if(JSON.stringify(sort(roles))!==JSON.stringify(sort(NATIVE_ROLES.map(r=>['role',r,false,false,false,false,false,false,false,null]))))fail('native_delta_role_authority_changed');
 const memberships=newRows.filter(r=>r[0]==='membership');
 if(typeof before.bootstrapSuperuser!=='string'||before.bootstrapSuperuser!==after.bootstrapSuperuser)fail('native_delta_bootstrap_owner_changed');
 // PG17 CREATEROLE adds an ADMIN-only bootstrap-superuser grant. The explicit
 // source grants are a SECOND postgres-granted row, both INHERIT/SET disabled.
 const expectedMemberships=NATIVE_ROLES.flatMap(r=>[['membership',r,'postgres',before.bootstrapSuperuser,true,false,false],['membership',r,'postgres','postgres',false,false,false]]);
 if(JSON.stringify(sort(memberships))!==JSON.stringify(sort(expectedMemberships)))fail('native_delta_membership_changed');
 if(newRows.some(r=>r[0]==='defaultAcl'))fail('native_delta_default_acl_added');
 const publicFunctions=newRows.filter(r=>r[0]==='function'&&r[1]==='public').map(r=>`${r[2]}(${r[3]})`).sort();
 if(new Set(newRows.filter(r=>r[0]==='function'&&r[1]==='public').map(r=>r[2])).size!==publicNames.length)fail('native_delta_public_wrapper_missing');
 const counts={};for(const r of newRows)counts[r[0]]=(counts[r[0]]??0)+1;
 return {protocol:'native-store-install-delta-v1',sourceDigest:profile.sourceDigest,addedCatalogSha256:sha(JSON.stringify(sort(newRows.map(r=>normalizeAdded(r,after.acls,after.bootstrapSuperuser))))),counts:Object.fromEntries(Object.entries(counts).sort()),publicFunctions,
  publicUsageRecipients:['native_store_sandbox_v1_owner','sbx_v1_core_owner'],qualification:'source_delta_only',deploymentAllowed:false};
}
export function verifyNativeInstallDelta(before,after){
 const actual=describeNativeInstallDelta(before,after),expected=JSON.parse(fs.readFileSync(new URL('./install-delta.json',import.meta.url),'utf8'));
 if(JSON.stringify(actual)!==JSON.stringify(expected))fail('native_delta_added_catalog_mismatch');return actual;
}
