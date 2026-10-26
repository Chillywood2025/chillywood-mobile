begin;
-- Source-only forward correction; depends on the empty-history protocol and
-- 20261025121430. Deployment/index builds are a separate authorized action.
create extension if not exists pg_trgm with schema extensions;

-- Versioned pure functions accept supplied data only. Ordinary writers must
-- execute index expressions under their existing effective identity. Grant no
-- schema access or data authority; these two functions remain SECURITY INVOKER.
create function private.platform_brand_index_jsonb_bytes_v1(p_value jsonb) returns bigint
language plpgsql immutable security invoker called on null input parallel unsafe cost 100
set search_path='' as $$
declare byte_count bigint;
begin
 if p_value is null then return 4; end if;
 if pg_catalog.jsonb_path_exists(p_value,'strict $.**{8}'::jsonpath) then return 1048577; end if;
 begin
   byte_count:=pg_catalog.octet_length(p_value::text)::bigint;
 exception when sqlstate '54000' then
   -- JSONB can hold a shallow string whose escaped text exceeds the text
   -- buffer limit. It must stay an exact candidate, not newly reject a write.
   -- Cancellation, memory exhaustion and stack-depth errors are not caught.
   -- A category SQLSTATE also matches its subclasses in PL/pgSQL.
   if sqlstate<>'54000' then raise; end if;
   return 1048577;
 end;
 return least(byte_count,1048577::bigint);
end $$;

-- Frozen literal body of deleted_media_normalize_locator at this version.
-- Never replace this body while its indexes exist: use a new version and
-- rebuild. The DDL safeguard below enforces this lifetime requirement.
create function private.platform_brand_index_normalize_v1(p_text text) returns text
language plpgsql immutable security invoker called on null input parallel unsafe cost 100
set search_path='' as $$
declare result text:=coalesce(p_text,''); next_value text; pass integer;
begin
 if result !~ '%[0-9A-Fa-f]{2}' then return result; end if;
 for pass in 1..4 loop
   -- Tokenize a whole pass at once. Sequential replace() would incorrectly
   -- decode nested escapes twice per pass and change the reference contract.
   select string_agg(case when token[1] ~ '^%[0-9A-Fa-f]{2}$' then
       case when get_byte(decode(substr(token[1],2),'hex'),0) between 32 and 126
         then chr(get_byte(decode(substr(token[1],2),'hex'),0)) else token[1] end
       else token[1] end,'' order by ordinal)
     into next_value from regexp_matches(result,'(%[0-9A-Fa-f]{2}|[^%]+|%)','g') with ordinality as parts(token,ordinal);
   next_value:=coalesce(next_value,'');
   exit when next_value=result; result:=next_value;
 end loop;
 return result;
end $$;

revoke all on function private.platform_brand_index_jsonb_bytes_v1(jsonb),
 private.platform_brand_index_normalize_v1(text) from public,anon,authenticated,service_role;
grant execute on function private.platform_brand_index_jsonb_bytes_v1(jsonb),
 private.platform_brand_index_normalize_v1(text) to public;

-- BEGIN immutable normalized helper DDL safeguard
-- Freeze the complete pg_proc rows, including owner and ACL, after grants and
-- before creating any dependent index. Do not inspect only command object IDs:
-- a batched GRANT/REVOKE can report a command without an individual function OID.
-- No application row, cache, new metadata table, or shared guard is involved.
-- Experimental cascade repair: the same private-purpose, non-executable
-- invoker guard lives in the existing extensions schema, so dropping private
-- cannot remove its checker before sql_drop. Namespace change requires review
-- before migration integration. Deliberately removing this guard or its own
-- namespace remains outside the active-guard lifetime guarantee.
do $install_brand_index_guard$
declare
 protected_oids oid[];
 expected jsonb;
begin
 protected_oids:=array[
   'private.platform_brand_index_jsonb_bytes_v1(jsonb)'::regprocedure::oid,
   'private.platform_brand_index_normalize_v1(text)'::regprocedure::oid];
 select jsonb_agg((to_jsonb(p)-'proacl')||jsonb_build_object('namespace_name',n.nspname,
   'acl',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
     from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a)) order by p.oid)
 into expected
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where p.oid=any(protected_oids);
 if jsonb_array_length(expected) is distinct from 2 then
   raise exception using errcode='55000',message='brand_index_helper_install_incomplete';
 end if;
 execute format($guard_definition$
create function extensions.guard_platform_brand_index_helper_ddl_v1()
returns event_trigger
language plpgsql volatile security invoker parallel unsafe set search_path='' as $guard_body$
declare
 protected_oids constant oid[]:=%L::oid[];
 expected constant jsonb:=%L::jsonb;
 actual jsonb;
begin
 select jsonb_agg((to_jsonb(p)-'proacl')||jsonb_build_object('namespace_name',n.nspname,
   'acl',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
     from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a)) order by p.oid)
 into actual
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where p.oid=any(protected_oids);
 if actual is distinct from expected then
   raise exception using errcode='55000',message='brand_index_helper_immutable',
     detail='Versioned Brand index helpers, their owners, ACLs and namespace must remain unchanged while their indexes exist.',
     hint='Introduce a reviewed new helper version and rebuild dependent indexes before retiring this version.';
 end if;
end
$guard_body$;
$guard_definition$,protected_oids,expected);
end
$install_brand_index_guard$;
revoke all on function extensions.guard_platform_brand_index_helper_ddl_v1()
 from public,anon,authenticated,service_role;
create event trigger platform_brand_index_helper_ddl_v1
 on ddl_command_end execute function extensions.guard_platform_brand_index_helper_ddl_v1();
create event trigger platform_brand_index_helper_drop_v1
 on sql_drop execute function extensions.guard_platform_brand_index_helper_ddl_v1();
-- END immutable normalized helper DDL safeguard

-- Metadata about index construction only: no source rows, references, or
-- clearance decisions are cached. Unknown/new/changed tables still scan.
create table private.platform_brand_reference_indexes_v1 (
 table_oid oid primary key, index_oid oid not null unique,
 row_schema jsonb not null, scan_expression text not null,
 index_expression text not null, environment jsonb not null
);
alter table private.platform_brand_reference_indexes_v1 enable row level security;
alter table private.platform_brand_reference_indexes_v1 force row level security;
revoke all on private.platform_brand_reference_indexes_v1 from public,anon,authenticated,service_role;

create function private.platform_brand_index_environment_v1() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('server',current_setting('server_version_num'),
   'encoding',current_setting('server_encoding'),
   'collation',(select jsonb_build_array(datcollate,datctype,datlocprovider,datcollversion,
      pg_database_collation_actual_version(oid)) from pg_database where datname=current_database()),
   'functions',(select jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))
      from pg_proc p where p.oid in (
       'private.deleted_media_normalize_locator(text)'::regprocedure,
       'private.platform_brand_index_jsonb_bytes_v1(jsonb)'::regprocedure,
       'private.platform_brand_index_normalize_v1(text)'::regprocedure,
       'private.platform_brand_retention_row_mentions(jsonb,text[],text,text)'::regprocedure)))
$$;

create function private.platform_brand_index_spec_v1(p_table oid)
returns table(row_schema jsonb,scan_expression text)
language plpgsql stable security invoker set search_path='' as $$
declare a record; columns text[]; text_names text[]:='{}'; text_values text[]:='{}';
 json_names text[]:='{}'; projected text; budget text:='0::bigint'; safe text:='true'; k text;
begin
 -- Parent/child inheritance projections differ. Their existing full scan is
 -- retained, as are all domains, arrays, custom types and unproved casts.
 if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where c.oid=p_table and n.nspname='public' and c.relkind='r' and not c.relispartition)
 or exists(select 1 from pg_inherits where inhrelid=p_table or inhparent=p_table)
 -- Bound generated SQL/expression depth as well as each row's payload.
 or (select count(*) from pg_attribute where attrelid=p_table and attnum>0 and not attisdropped)>64
 or not (select collisdeterministic from pg_collation where oid='default'::regcollation)
 then return; end if;
 columns:=private.deleted_media_locator_columns(p_table);
 if cardinality(columns)=0 then return; end if;
 select jsonb_agg(jsonb_build_array(attnum,attname,atttypid,atttypmod,attcollation,
   attnotnull,attgenerated,attidentity,attisdropped) order by attnum)
 into row_schema from pg_attribute where attrelid=p_table and attnum>0;
 for a in select * from pg_attribute where attrelid=p_table and attnum>0 and not attisdropped order by attnum loop
   if a.atttypid not in ('text'::regtype,'varchar'::regtype,'jsonb'::regtype,
     'bool'::regtype,'int2'::regtype,'int4'::regtype,'int8'::regtype,'uuid'::regtype,
     'timestamp'::regtype,'timestamptz'::regtype) then return; end if;
   if a.atttypid in ('text'::regtype,'varchar'::regtype) then
     budget:=budget||format('+coalesce(octet_length(%I::text),0)::bigint',a.attname);
   elsif a.atttypid='jsonb'::regtype then
     budget:=budget||format('+private.platform_brand_index_jsonb_bytes_v1(%I)',a.attname);
   elsif a.atttypid in ('timestamp'::regtype,'timestamptz'::regtype) then
     -- Discarded datetime output is bounded for this central range under any
     -- valid timezone/DateStyle. Other values go through the original checker.
     safe:=safe||format(' and (%1$I is null or %1$I between %2$L::%3$s and %4$L::%3$s)',
       a.attname,'1900-01-01 00:00:00+00',a.atttypid::regtype,'2100-01-01 00:00:00+00');
   end if;
   if a.attname=any(columns) then
     if a.atttypid in ('text'::regtype,'varchar'::regtype) then
       if not (select collisdeterministic from pg_collation where oid=a.attcollation) then return; end if;
       text_names:=array_append(text_names,a.attname::text);
       text_values:=array_append(text_values,format('%I::text',a.attname));
     elsif a.atttypid='jsonb'::regtype then json_names:=array_append(json_names,a.attname::text);
     else return; end if;
   end if;
 end loop;
 projected:=format('pg_catalog.jsonb_object(%L::text[],ARRAY[%s]::text[])',text_names,array_to_string(text_values,','));
 foreach k in array json_names loop
   projected:=format('pg_catalog.jsonb_set(%s,ARRAY[%L]::text[],coalesce(%I,''null''::jsonb),true)',projected,k,k);
 end loop;
 -- The CASE guards construction, so oversized values are never packed into
 -- an intermediate text array/JSON object before reaching the sentinel.
 -- <=1MiB variable payload plus <=64 bounded fields/names is far below both
 -- JSONB string and aggregate-object limits, including worst-case escaping.
 -- The pure size helper also bounds depth and handles only serialization's
 -- exact program-limit error. Normalize the complete canonical document once,
 -- including property names and punctuation, with the frozen four-pass body.
 scan_expression:=format('(case when (%1$s) then case when (%2$s)<=1048576::bigint then private.platform_brand_index_normalize_v1((%3$s)::text) else %4$L::text end else %4$L::text end)',
   safe,budget,projected,'!brand-reference-exact-fallback-v1!');
 return next;
end $$;

create function private.platform_brand_index_expression_v1(p_table oid) returns text
language plpgsql stable security invoker set search_path='' as $$
declare registered private.platform_brand_reference_indexes_v1%rowtype; spec record; gin_ops oid;
begin
 -- GIN's optional fuzzy limit deliberately returns a random subset of matches.
 -- Such a plan cannot prove absence. Keep the original exact scan whenever a
 -- caller enables that setting; do not silently change its session settings.
 if current_setting('gin_fuzzy_search_limit')::integer<>0 then return null; end if;
 select * into registered from private.platform_brand_reference_indexes_v1 where table_oid=p_table;
 if not found then return null; end if;
 select * into spec from private.platform_brand_index_spec_v1(p_table);
 if not found or spec.row_schema is distinct from registered.row_schema
   or spec.scan_expression is distinct from registered.scan_expression
   or registered.environment is distinct from private.platform_brand_index_environment_v1() then return null; end if;
 select o.oid into gin_ops from pg_opclass o join pg_am a on a.oid=o.opcmethod
 where a.amname='gin' and o.opcname='gin_trgm_ops' and o.opcintype='text'::regtype
   and o.opcnamespace=(select extnamespace from pg_extension where extname='pg_trgm');
 if not exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am am on am.oid=c.relam
   where i.indexrelid=registered.index_oid and i.indrelid=p_table and am.amname='gin'
   and i.indisvalid and i.indisready and i.indislive and not i.indisunique
   and i.indnatts=1 and i.indnkeyatts=1 and i.indkey[0]=0 and i.indpred is null
   and i.indclass[0]=gin_ops and i.indcollation[0]='default'::regcollation
   and pg_get_expr(i.indexprs,i.indrelid,false)=registered.index_expression) then return null; end if;
 return registered.scan_expression;
end $$;

revoke all on function private.platform_brand_index_environment_v1(),private.platform_brand_index_spec_v1(oid),
 private.platform_brand_index_expression_v1(oid) from public,anon,authenticated,service_role;

-- Construction is a separately authorized, resumable concurrent rollout via
-- scripts/brand-reference-index-installer.mjs. An empty or partial registry
-- retains the existing exact scan for every unregistered table. No Brand latch
-- is held across index construction, and no activation setting is changed.

create or replace function private.platform_brand_retention_references_clear(p_asset_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype; t record; found_ref boolean; predicate text;
 candidate_expression text; candidate_predicate text; key_pattern text; path_pattern text;
begin
 perform private.platform_brand_retention_lock();
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 if r.asset_id is null or r.removed_at is null or to_regclass('public.platform_brand_publications') is null then return false; end if;
 if exists(select 1 from public.platform_brand_profiles p where r.asset_id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id]))
 or exists(select 1 from public.platform_brand_publications p where r.asset_id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id])) then return false; end if;
 key_pattern:='%'||replace(replace(replace(r.object_key,'!','!!'),'%','!%'),'_','!_')||'%';
 path_pattern:='%'||replace(replace(replace(r.storage_path,'!','!!'),'%','!%'),'_','!_')||'%';
 for t in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
   -- Same relation mode/order as the old SELECT, now acquired before checking
   -- its index/schema fingerprint. The lock lasts through exact rechecking.
   execute format('lock table public.%I in access share mode',t.relname);
   if to_regclass(format('public.%I',t.relname))::oid is distinct from t.oid then raise exception 'brand_reference_relation_changed'; end if;
   if not exists(select 1 from pg_trigger g where g.tgrelid=t.oid and g.tgfoid='private.guard_platform_brand_retention_references()'::regprocedure
     and g.tgenabled in ('O','A') and (g.tgtype::int & 23)=23 and g.tgqual is null) then return false; end if;
   predicate:='true';
   if t.oid in (to_regclass('public.platform_brand_asset_review_events'),to_regclass('public.platform_admin_audit_logs')) then predicate:=format('not private.platform_brand_review_evidence_matches(%s::oid,to_jsonb(x),%L::uuid)',t.oid,r.asset_id); end if;
   if t.relname='platform_brand_assets' then predicate:=format('id<>%L::uuid',r.asset_id); end if;
   -- Only the exact proved terminal scan is evidence, not a live delivery alias.
   -- All other scans/reservations and unexpected references remain blockers.
   if t.relname='media_scan_jobs' and to_regclass('private.media_scan_byte_receipts') is not null then
     predicate:=format('not private.platform_brand_empty_history_matches(%L::uuid,to_jsonb(x)) and id not in (select observation.job_id from private.platform_brand_object_proofs proof join private.media_scan_byte_receipts receipt on receipt.id=proof.scan_receipt_id join private.media_scan_byte_observations observation on observation.id=receipt.observation_id where proof.asset_id=%L::uuid and (private.platform_brand_scan_byte_receipt_matches(receipt.id,proof.binding,proof.origin_sha256,proof.origin_size_bytes) or private.platform_brand_claimed_scan_evidence_matches(proof.asset_id,receipt.id,proof.binding,proof.origin_sha256,proof.origin_size_bytes)))',r.asset_id,r.asset_id);
   end if;
   candidate_predicate:='true';
   candidate_expression:=null;
   -- Special exemptions can read external tuples and raise their own errors.
   -- Preserve their exact full-scan evaluation path, including future predicates.
   if predicate='true' and r.object_key is not null and r.storage_path is not null and r.object_key<>'' and r.storage_path<>'' then
     candidate_expression:=private.platform_brand_index_expression_v1(t.oid);
   end if;
   if candidate_expression is not null then
     candidate_predicate:=format('((%1$s) like $3 escape ''!'' or (%1$s) like $4 escape ''!'' or (%1$s)=%2$L)',
       candidate_expression,'!brand-reference-exact-fallback-v1!');
     -- Plan the complete conservative candidate producer independently of
     -- EXISTS' early-match estimate. SELECT * preserves the exact row document;
     -- the outer consumer retains the original exact matcher and column InitPlan.
     execute format('with candidates as materialized (select * from public.%I x where %s) select exists(select 1 from candidates x where %s and private.platform_brand_retention_row_mentions(to_jsonb(x),(select private.deleted_media_locator_columns(%s::oid))::text[],$1,$2))',t.relname,candidate_predicate,predicate,t.oid)
       into found_ref using r.object_key,r.storage_path,key_pattern,path_pattern;
   else
     execute format('select exists(select 1 from public.%I x where %s and private.platform_brand_retention_row_mentions(to_jsonb(x),(select private.deleted_media_locator_columns(%s::oid))::text[],$1,$2))',t.relname,predicate,t.oid)
       into found_ref using r.object_key,r.storage_path;
   end if;
   if found_ref then return false; end if;
 end loop;
 return true;
end $$;
commit;
