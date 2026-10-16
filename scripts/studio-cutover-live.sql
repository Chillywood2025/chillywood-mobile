-- Private operator capture only. No database writes; never commit the output.
begin transaction isolation level repeatable read read only;
with
profile_candidates as (
  select user_id::text as subject_id from public.user_entitlements where entitlement_key = 'premium'
  union select user_id::text from public.platform_role_memberships where role in ('owner','operator')
),
profile_writers as (
  select subject_id from profile_candidates
  where public.platform_subject_has_role_internal(subject_id, array['owner','operator']::text[])
     or public.premium_subject_has_finite_authority_internal(subject_id)
),
review_candidates as (
  select user_id::text as subject_id from public.platform_role_memberships
  union select target_user_id::text from public.platform_staff_permission_grants
),
reviewers as (
  select subject_id from review_candidates candidate
  where public.platform_subject_has_role_internal(subject_id, array['owner','operator']::text[])
     or (public.platform_subject_has_role_internal(subject_id, array['operator','moderator']::text[])
       and exists (
         select 1 from public.platform_staff_permission_grants grant_row
         where grant_row.target_user_id = candidate.subject_id and grant_row.status = 'active'
           and (grant_row.expires_at is null or grant_row.expires_at > now())
           and (grant_row.permission_key = any(public.platform_admin_scope_legacy_aliases('content_moderation'))
             or grant_row.permission_key = any(public.platform_admin_scope_legacy_aliases('reports_review')))))
),
asset_owners as (select distinct owner_user_id::text as subject_id from public.platform_brand_assets),
profile_owners as (select distinct owner_user_id::text as subject_id from public.platform_brand_profiles),
storage_owners as (select distinct split_part(name, '/', 1) as subject_id from storage.objects where bucket_id = 'platform-brand-assets'),
-- Any registered account can own a channel and acquire an Audience request;
-- today's empty requests table does not bound tomorrow's legacy reviewers.
audience_reviewers as (select id::text as subject_id from auth.users where deleted_at is null
  union select distinct channel_user_id::text from public.channel_audience_requests),
subjects as (
  select subject_id from profile_writers union select subject_id from reviewers
  union select subject_id from asset_owners union select subject_id from profile_owners
  union select subject_id from storage_owners
  union select subject_id from audience_reviewers
),
state_rows as (
  -- Only SHA256 digests leave PostgreSQL, never raw private row contents.
  select 'profiles' as area, encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') as digest from public.platform_brand_profiles r
  union all select 'assets', encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') from public.platform_brand_assets r
  union all select 'storage', encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') from storage.objects r where bucket_id='platform-brand-assets'
  union all select 'requests', encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') from public.channel_audience_requests r
  union all select 'followers', encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') from public.channel_followers r
),
relations as (
  select c.oid, n.nspname, c.relname, c.relkind, c.relowner::regrole::text as owner,
    c.relacl::text as acl, c.relrowsecurity, c.relforcerowsecurity
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','storage','auth','supabase_migrations') and c.relkind in ('r','p','v','m','S')
),
catalog as (
 select jsonb_build_object(
  'relations', (select jsonb_agg(to_jsonb(r) - 'oid' order by nspname,relname) from relations r),
  'columns', (select jsonb_agg(jsonb_build_array(r.nspname,r.relname,a.attname,
    pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,
    pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by r.nspname,r.relname,a.attnum)
    from relations r join pg_catalog.pg_attribute a on a.attrelid=r.oid and a.attnum>0 and not a.attisdropped
    left join pg_catalog.pg_attrdef d on d.adrelid=r.oid and d.adnum=a.attnum),
  'policies', (select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)
    from pg_catalog.pg_policies p where schemaname in ('public','storage','auth')),
  'functions', (select jsonb_agg(jsonb_build_array(n.nspname,p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid),pg_catalog.pg_get_functiondef(p.oid),p.proowner::regrole::text,p.proacl::text)
    order by n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid))
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','storage','auth') and p.prokind in ('f','p')),
  'triggers', (select jsonb_agg(jsonb_build_array(r.nspname,r.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid),t.tgenabled)
    order by r.nspname,r.relname,t.tgname) from relations r join pg_catalog.pg_trigger t on t.tgrelid=r.oid),
  'constraints', (select jsonb_agg(jsonb_build_array(r.nspname,r.relname,c.conname,pg_catalog.pg_get_constraintdef(c.oid))
    order by r.nspname,r.relname,c.conname) from relations r join pg_catalog.pg_constraint c on c.conrelid=r.oid),
  'views', (select jsonb_agg(jsonb_build_array(nspname,relname,pg_catalog.pg_get_viewdef(oid)) order by nspname,relname)
    from relations where relkind in ('v','m')),
  'indexes', (select jsonb_agg(jsonb_build_array(r.nspname,r.relname,pg_catalog.pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready)
    order by r.nspname,r.relname,pg_catalog.pg_get_indexdef(i.indexrelid)) from relations r join pg_catalog.pg_index i on i.indrelid=r.oid),
  'schemas', (select jsonb_agg(jsonb_build_array(nspname,nspowner::regrole::text,nspacl::text) order by nspname)
    from pg_catalog.pg_namespace where nspname in ('public','storage','auth','supabase_migrations')),
  'defaultPrivileges', (select jsonb_agg(jsonb_build_array(defaclrole::regrole::text,defaclnamespace::regnamespace::text,defaclobjtype,defaclacl::text)
    order by defaclrole::regrole::text,defaclnamespace::regnamespace::text,defaclobjtype) from pg_catalog.pg_default_acl),
  'roles', (select jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls) order by rolname) from pg_catalog.pg_roles),
  'memberships', (select jsonb_agg(jsonb_build_array(roleid::regrole::text,member::regrole::text,grantor::regrole::text,
    to_jsonb(m)-'oid'-'roleid'-'member'-'grantor') order by roleid::regrole::text,member::regrole::text,grantor::regrole::text)
    from pg_catalog.pg_auth_members m)
 ) as value
)
select jsonb_build_object(
 'schema', 1,
 'heldObjectsAbsent', to_regclass('public.platform_brand_publications') is null
   and to_regprocedure('public.publish_platform_brand_profile(jsonb)') is null
   and to_regprocedure('public.guard_platform_brand_profile_publication_metadata()') is null
   and to_regprocedure('public.platform_brand_publication_asset_safe_internal(uuid,text)') is null
   and to_regprocedure('public.platform_studio_current_staff_access_internal()') is null
   and to_regprocedure('public.platform_studio_current_creator_tool_access_internal()') is null
   and to_regprocedure('public.read_public_platform_identity(text)') is null
   and to_regprocedure('public.read_public_channel_follower_count(text)') is null
   and to_regprocedure('public.review_channel_audience_request(bigint,text)') is null,
 'history', (select jsonb_agg(to_jsonb(m) order by version) from supabase_migrations.schema_migrations m),
 'catalog', (select value from catalog),
 'stateSha256', (select encode(sha256(convert_to(coalesce(string_agg(area || ':' || digest, ',' order by area,digest),''),'UTF8')),'hex') from state_rows),
 'profileWriters', coalesce((select jsonb_agg(subject_id order by subject_id) from profile_writers),'[]'::jsonb),
 'reviewers', coalesce((select jsonb_agg(subject_id order by subject_id) from reviewers),'[]'::jsonb),
 'assetOwners', coalesce((select jsonb_agg(subject_id order by subject_id) from asset_owners),'[]'::jsonb),
 'profileOwners', coalesce((select jsonb_agg(subject_id order by subject_id) from profile_owners),'[]'::jsonb),
 'storageOwners', coalesce((select jsonb_agg(subject_id order by subject_id) from storage_owners),'[]'::jsonb),
 'audienceReviewers', coalesce((select jsonb_agg(subject_id order by subject_id) from audience_reviewers),'[]'::jsonb),
 'unknownSubjects', (select count(*) from subjects where subject_id is null
    or subject_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
rollback;
