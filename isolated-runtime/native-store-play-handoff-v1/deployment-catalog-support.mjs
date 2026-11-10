// Local source qualification only. No transport and no target baseline.
import {createHash} from 'node:crypto';
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const canonical=value=>JSON.stringify(value);
export const sortRows=rows=>rows.map(canonical).sort().map(JSON.parse);
export const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export const ident=value=>'"'+String(value).replaceAll('"','""')+'"';
export const scope="('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')";
// Complement the repository's catalogItemsSQL with implicit row/array types,
// sequence metadata and type/column collation. No physical/target-local OID is
// used in the normalized portable catalog hash.
export const extraCatalogSQL=`
 select jsonb_build_array('type',n.nspname,t.typname,t.typtype,t.typcategory,t.typowner::regrole::text,t.typnotnull,t.typdefault,case when t.typrelid=0 then null else t.typrelid::regclass::text end,case when t.typelem=0 then null else format_type(t.typelem,null) end,case when t.typbasetype=0 then null else format_type(t.typbasetype,t.typtypmod) end,case when t.typcollation=0 then null else t.typcollation::regcollation::text end,t.typacl::text) item from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ${scope}
 union all select jsonb_build_array('columnMetadata',a.attrelid::regclass::text,a.attname,a.attnum,case when a.attcollation=0 then null else a.attcollation::regcollation::text end,a.attstorage,a.attcompression,a.attoptions,a.attfdwoptions) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${scope} and c.relkind in('r','p','v','m','S') and a.attnum>0 and not a.attisdropped
 union all select jsonb_build_array('sequence',s.seqrelid::regclass::text,format_type(s.seqtypid,null),s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle) from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${scope}
 union all select jsonb_build_array('enum',n.nspname,t.typname,e.enumsortorder,e.enumlabel) from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname in ${scope}
`;
const acl=(value,type,owner)=>`(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type collate "C",a.is_grantable),'[]'::jsonb) from aclexplode(${type?`coalesce(${value},acldefault(${type},${owner}))`:value}) a)`;
export const extraACLItemsSQL=`select 'schema:'||n.nspname k,${acl('n.nspacl',"'n'",'n.nspowner')} v from pg_namespace n where n.nspname in ${scope}
 union all select 'type:'||n.nspname||'.'||t.typname,${acl('t.typacl',"'T'",'t.typowner')} from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ${scope}`;
