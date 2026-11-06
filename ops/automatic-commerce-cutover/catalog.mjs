// OID-independent catalog evidence. Use search_path=pg_catalog,public for every
// capture. This module does not connect, qualify a target, or change anything.
import {literal} from './bridge.mjs';
const schemas = "('public','private','auth','supabase_migrations','extensions')";
const relation = "n.nspname||'.'||c.relname";
const policyRelationScope = `(n.nspname in ${schemas} or ${relation} in ('storage.objects','realtime.messages'))`;
const signature = "n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')'";
export const catalogRowsSQL = `
 select 'function:'||${signature} key,jsonb_build_array('function',${signature},pg_get_functiondef(p.oid),p.proowner::regrole::text,p.proacl::text,p.prokind,p.proretset,p.proleakproof,p.proparallel,p.procost,p.prorows,p.prosupport::regproc::text,obj_description(p.oid,'pg_proc')) item
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${schemas} and p.prokind in ('f','p')
 union all select 'relation:'||${relation},jsonb_build_array('relation',${relation},c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relpersistence,c.relreplident,c.relispartition,pg_get_expr(c.relpartbound,c.oid),case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) else null end,obj_description(c.oid,'pg_class'))
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${policyRelationScope} and c.relkind in ('r','p','v','m','S')
 union all select 'column:'||${relation}||'.'||a.attname,jsonb_build_array('column',${relation},a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),col_description(c.oid,a.attnum))
 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ${schemas} and a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m','S')
 union all select 'constraint:'||${relation}||'.'||co.conname,jsonb_build_array('constraint',${relation},co.conname,pg_get_constraintdef(co.oid),co.convalidated)
 from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas}
 union all select 'index:'||n.nspname||'.'||idx.relname,jsonb_build_array('index',${relation},idx.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready)
 from pg_index i join pg_class c on c.oid=i.indrelid join pg_class idx on idx.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas}
 union all select 'policy:'||${relation}||'.'||p.polname,jsonb_build_array('policy',${relation},p.polname,p.polcmd,p.polpermissive,(select array_agg(r::regrole::text order by r::regrole::text collate "C") from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))
 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where ${policyRelationScope}
 union all select 'trigger:'||${relation}||'.'||case when t.tgisinternal then co.conrelid::regclass::text||'.'||co.conname::text||'.'||t.tgfoid::regproc::text else t.tgname::text end,
 jsonb_build_array('trigger',${relation},case when t.tgisinternal then null else t.tgname end,t.tgisinternal,t.tgfoid::regprocedure::text,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred,co.conrelid::regclass::text,co.conname,case when t.tgisinternal then null else pg_get_triggerdef(t.oid) end)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace left join pg_constraint co on co.oid=t.tgconstraint where n.nspname in ${schemas}
 union all select 'sequence:'||${relation},jsonb_build_array('sequence',${relation},format_type(s.seqtypid,null),s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle)
 from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas}
 union all select 'schema:'||nspname,jsonb_build_array('schema',nspname,nspowner::regrole::text,nspacl::text) from pg_namespace where nspname in ${schemas}
 union all select 'default_acl:'||d.defaclrole::regrole::text||'.'||coalesce(n.nspname,'')||'.'||d.defaclobjtype::text,jsonb_build_array('default_acl',d.defaclrole::regrole::text,n.nspname,d.defaclobjtype,d.defaclacl::text) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 union all select 'role:'||rolname,jsonb_build_array('role',rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,encode(sha256(convert_to(coalesce(to_jsonb(rolconfig)::text,'null'),'UTF8')),'hex')) from pg_roles
 union all select 'membership:'||roleid::regrole::text||'.'||member::regrole::text||'.'||grantor::regrole::text,jsonb_build_array('membership',roleid::regrole::text,member::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) from pg_auth_members
 union all select 'event_trigger:'||evtname::text,jsonb_build_array('event_trigger',evtname,evtevent,evtowner::regrole::text,evtfoid::regprocedure::text,evtenabled,evttags) from pg_event_trigger
 union all select 'role_setting:'||coalesce(d.datname,'*')||'.'||coalesce(r.rolname,'*'),jsonb_build_array('role_setting',d.datname,r.rolname,encode(sha256(convert_to(coalesce(to_jsonb(s.setconfig)::text,'null'),'UTF8')),'hex'))
 from pg_db_role_setting s left join pg_database d on d.oid=s.setdatabase left join pg_roles r on r.oid=s.setrole
`;
export const hashSQL = expression => `encode(sha256(convert_to(${expression},'UTF8')),'hex')`;
export function catalogHashSQL({include, exclude, includeReference, excludeReference}={}) {
 if([include,exclude,includeReference,excludeReference].filter(x=>x!==undefined).length>1)throw Error('ONE_CATALOG_FILTER_REQUIRED');
 // Only generator-owned, bare identifiers are permitted, never SQL fragments.
 for(const value of [includeReference,excludeReference])if(value!==undefined&&!/^cutover_(affected|ignored)_keys$/u.test(value))throw Error('CATALOG_REFERENCE_INVALID');
 const filter=include?`where key in (${include.map(literal).join(',')||'null'})`:exclude?`where key not in (${exclude.map(literal).join(',')||'null'})`:
  includeReference?`where key=any(${includeReference})`:excludeReference?`where not(key=any(${excludeReference}))`:'';
 return `(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(key,item) order by key collate \"C\",item::text collate \"C\")::text,'[]')")} from (${catalogRowsSQL}) catalog ${filter})`;
}
export const captureCatalogSQL = `set search_path=pg_catalog,public;select coalesce(jsonb_agg(jsonb_build_object('key',key,'item',item) order by key collate "C",item::text collate "C"),'[]'::jsonb) from (${catalogRowsSQL}) catalog;`;
