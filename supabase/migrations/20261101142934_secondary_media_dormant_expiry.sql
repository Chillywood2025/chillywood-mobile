begin;
-- Executable but dormant exact-object consumer. No activation, qualification,
-- scheduler, provider request or deletion is performed by this migration.
alter table private.secondary_media_sources add column parent_type text,add column parent_id text;
create table private.secondary_media_expiry_settings(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into private.secondary_media_expiry_settings default values;
create table private.secondary_media_transport_qualification(
 provider text not null check(provider in ('cloudflare_r2','hetzner_s3')),bucket text not null,
 private_delivery boolean not null check(private_delivery),
 contract_sha256 text not null check(contract_sha256 ~ '^[a-f0-9]{64}$'),
 writer_fence_sha256 text not null check(writer_fence_sha256 ~ '^[a-f0-9]{64}$'),
 deletion_mode text not null check((provider='cloudflare_r2' and deletion_mode='permanent_key_retirement')
  or (provider='hetzner_s3' and deletion_mode='immutable_version')),
 qualified_until timestamptz not null,primary key(provider,bucket)
);
create table private.secondary_media_expiry_claims(
 id uuid primary key default gen_random_uuid(),object_id uuid not null unique references private.secondary_media_objects(id),
 claimed_at timestamptz not null default clock_timestamp(),
 provider text not null,bucket text not null,object_key text not null,provider_version text,provider_etag text not null,
 sha256 text not null,size_bytes bigint not null,write_token uuid not null,
 contract_sha256 text not null,writer_fence_sha256 text not null,deletion_mode text not null,unique(provider,bucket,object_key)
);
create table private.secondary_media_expiry_receipts(
 id uuid primary key default gen_random_uuid(),claim_id uuid not null references private.secondary_media_expiry_claims(id),
 result text not null check(result in ('observed_absent','delete_acknowledged','failed','identity_changed')),
 observed_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['secondary_media_expiry_settings','secondary_media_transport_qualification','secondary_media_expiry_claims','secondary_media_expiry_receipts'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
 foreach t in array array['secondary_media_expiry_claims','secondary_media_expiry_receipts'] loop
  execute format('create trigger secondary_media_expiry_immutable before update or delete on private.%I for each row execute function private.platform_brand_retention_immutable()',t);
  execute format('create trigger secondary_media_expiry_no_truncate before truncate on private.%I for each statement execute function private.platform_brand_retention_immutable()',t);
 end loop;
end $$;

-- Sources admitted before this forward migration have no inferred parent.
-- Parent-less creator videos are exact; attachments need their persisted parent
-- at admission before they can become eligible (see qualification predicate).
create function private.secondary_media_bind_parent() returns trigger
language plpgsql security definer set search_path='' as $$ declare b jsonb; begin
 b:=private.secondary_media_read_source(new.source_type,new.source_id);
 new.parent_type:=b->>'parentType';new.parent_id:=b->>'parentId';return new;
end $$;
create trigger secondary_media_parent before insert on private.secondary_media_sources
 for each row execute function private.secondary_media_bind_parent();

create function private.secondary_media_retired_reference_guard() returns trigger
language plpgsql security definer set search_path='' as $$ declare doc jsonb; begin
 if not private.deleted_media_reference_fence_armed() then return new; end if;
 perform private.platform_brand_retention_lock();
 doc:=private.deleted_media_locator_document(to_jsonb(new),tg_relid);
 if exists(select 1 from private.secondary_media_expiry_claims c where private.deleted_media_mentions(doc,c.object_key))
 then raise exception 'secondary_media_key_permanently_retired' using errcode='55000'; end if;
 return new;
end $$;
do $$ declare t record; begin
 for t in select c.oid,n.nspname,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
  execute format('create trigger zzzz_secondary_media_retired before insert or update on %I.%I for each row execute function private.secondary_media_retired_reference_guard()',t.nspname,t.relname);
 end loop;
end $$;
create function private.secondary_media_reference_coverage_ready() returns boolean
language sql stable set search_path='' as $$
 select not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0
   and not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=c.oid
    and t.tgfoid='private.secondary_media_retired_reference_guard()'::regprocedure and t.tgenabled in ('O','A')
    and (t.tgtype::integer & 23)=23 and t.tgqual is null))
$$;
create function private.secondary_media_has_live_reference(p_key text) returns boolean
language plpgsql security definer set search_path='' as $$ declare t record; found_reference boolean; begin
 if not private.secondary_media_reference_coverage_ready() then return true; end if;
 for t in select c.oid,n.nspname,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
  execute format('select exists(select 1 from %I.%I r where private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(r),%s::oid),$1))',t.nspname,t.relname,t.oid)
   into found_reference using p_key;
  if found_reference then return true; end if;
 end loop;
 return false;
end $$;
create function private.secondary_media_expiry_activation_guard() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.enabled then
  -- UPDATE drains every prior public locator writer's retained SHARE latch,
  -- before the global advisory lock is acquired. The latch never disarms.
  update private.deleted_media_reference_fence set armed=true where singleton;
  perform private.platform_brand_retention_lock();
  if not private.deleted_media_reference_coverage_ready() or not private.secondary_media_reference_coverage_ready()
   then raise exception 'secondary_media_reference_coverage_required'; end if;
 end if;
 return new;
end $$;
create trigger secondary_media_expiry_activation before insert or update on private.secondary_media_expiry_settings
 for each row execute function private.secondary_media_expiry_activation_guard();
create function private.secondary_media_object_blocker(p_object_id uuid) returns text
language plpgsql security definer set search_path='' as $$ declare o private.secondary_media_objects%rowtype; begin
 select * into o from private.secondary_media_objects where id=p_object_id;
 if o.id is null or o.receipt is null then return 'verified_object_required'; end if;
 if exists(select 1 from private.secondary_media_objects where producer_id=o.producer_id and write_token is not null and receipt is null)
  then return 'producer_not_drained'; end if;
 if not exists(select 1 from private.secondary_media_bindings where object_id=o.id) then return 'source_binding_required'; end if;
 if exists(select 1 from private.secondary_media_bindings b join private.secondary_media_sources s on s.id=b.source_incarnation
  where b.object_id=o.id and (s.deleted_at is null or s.expires_at>clock_timestamp())) then return 'live_or_retained_binding'; end if;
 if exists(select 1 from private.secondary_media_bindings b join private.secondary_media_sources s on s.id=b.source_incarnation
  where b.object_id=o.id and (s.owner_protected or exists(select 1 from public.platform_role_memberships r where r.user_id::text=s.owner_id and r.role='owner')))
  then return 'owner_protected'; end if;
 if exists(select 1 from private.secondary_media_bindings b join private.secondary_media_sources s on s.id=b.source_incarnation
  where b.object_id=o.id and s.source_type='social_attachment' and (s.parent_type is null or s.parent_id is null)) then return 'parent_binding_required'; end if;
 if exists(select 1 from private.secondary_media_bindings b join private.secondary_media_sources s on s.id=b.source_incarnation
  join public.legal_holds h on h.status='active' and private.deleted_content_hold_matches(h.target_type,h.target_id,s.source_type,s.source_id::text,s.owner_id,s.parent_type,s.parent_id)
  where b.object_id=o.id) then return 'legal_hold'; end if;
 if not private.secondary_media_reference_coverage_ready() then return 'reference_guard_coverage_incomplete'; end if;
 if private.secondary_media_has_live_reference(o.object_key) then return 'live_reference'; end if;
 return null;
end $$;

create function public.claim_secondary_media_expiry(p_object_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.secondary_media_objects%rowtype; c private.secondary_media_expiry_claims%rowtype;
 q private.secondary_media_transport_qualification%rowtype; blocker text; begin
 perform private.secondary_media_require_worker();perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.secondary_media_expiry_settings where enabled) then return jsonb_build_object('status','disabled'); end if;
 select * into o from private.secondary_media_objects where id=p_object_id;
 select * into q from private.secondary_media_transport_qualification where provider=o.provider and bucket=o.bucket
  and private_delivery and qualified_until>clock_timestamp();
 if q.provider is null then return jsonb_build_object('status','transport_unqualified'); end if;
 blocker:=private.secondary_media_object_blocker(p_object_id);
 if blocker is not null then return jsonb_build_object('status',blocker); end if;
 select * into c from private.secondary_media_expiry_claims where object_id=o.id;
 if c.id is null then
  insert into private.secondary_media_expiry_claims(object_id,provider,bucket,object_key,provider_version,provider_etag,sha256,size_bytes,write_token,contract_sha256,writer_fence_sha256,deletion_mode)
   values(o.id,o.provider,o.bucket,o.object_key,o.provider_version,o.provider_etag,o.sha256,o.size_bytes,o.write_token,q.contract_sha256,q.writer_fence_sha256,q.deletion_mode) returning * into c;
 end if;
 return jsonb_build_object('status','claimed','claimId',c.id);
end $$;
create function public.read_secondary_media_expiry_claim(p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.secondary_media_expiry_claims%rowtype; blocker text; begin
 perform private.secondary_media_require_worker();perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.secondary_media_expiry_settings where enabled) then return jsonb_build_object('status','disabled'); end if;
 select * into c from private.secondary_media_expiry_claims where id=p_claim_id;
 if c.id is null then return jsonb_build_object('status','claim_missing'); end if;
 if not exists(select 1 from private.secondary_media_transport_qualification where provider=c.provider and bucket=c.bucket
  and private_delivery and qualified_until>clock_timestamp() and contract_sha256=c.contract_sha256
  and writer_fence_sha256=c.writer_fence_sha256 and deletion_mode=c.deletion_mode)
 then return jsonb_build_object('status','transport_unqualified'); end if;
 blocker:=private.secondary_media_object_blocker(c.object_id);
 if blocker is not null then return jsonb_build_object('status',blocker); end if;
 return jsonb_build_object('status','authorized','claimId',c.id,'objectId',c.object_id,'provider',c.provider,'bucket',c.bucket,
  'objectKey',c.object_key,'versionId',c.provider_version,'etag',c.provider_etag,'sha256',c.sha256,'sizeBytes',c.size_bytes,
  'writeToken',c.write_token,'contractSha256',c.contract_sha256,'writerFenceSha256',c.writer_fence_sha256,'deletionMode',c.deletion_mode,'permanentlyAbsent',false);
end $$;
create function public.record_secondary_media_expiry_result(p_claim_id uuid,p_result text) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform private.secondary_media_require_worker();perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.secondary_media_expiry_claims where id=p_claim_id) then raise exception 'secondary_media_claim_required'; end if;
 insert into private.secondary_media_expiry_receipts(claim_id,result) values(p_claim_id,p_result);
 return jsonb_build_object('status',p_result,'permanentlyAbsent',false);
end $$;

create function private.secondary_media_hold_guard() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if not private.deleted_media_reference_fence_armed() then return new; end if;
 perform private.platform_brand_retention_lock();
 if new.status='active' and exists(select 1 from private.secondary_media_expiry_claims c
  join private.secondary_media_bindings b on b.object_id=c.object_id join private.secondary_media_sources s on s.id=b.source_incarnation
  where private.deleted_content_hold_matches(new.target_type,new.target_id,s.source_type,s.source_id::text,s.owner_id,s.parent_type,s.parent_id))
 then raise exception 'retention_preservation_unavailable_deletion_already_claimed' using errcode='55000'; end if;
 return new;
end $$;
create trigger secondary_media_hold_guard before insert or update on public.legal_holds
 for each row execute function private.secondary_media_hold_guard();
create function private.secondary_media_owner_preservation_guard() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if not private.deleted_media_reference_fence_armed() then return new; end if;
 perform private.platform_brand_retention_lock();
 if new.role='owner' and coalesce(to_jsonb(new)->>'status','active')='active'
  and (nullif(to_jsonb(new)->>'expires_at','') is null or (to_jsonb(new)->>'expires_at')::timestamptz>clock_timestamp())
  and exists(select 1 from private.secondary_media_expiry_claims c
  join private.secondary_media_bindings b on b.object_id=c.object_id join private.secondary_media_sources s on s.id=b.source_incarnation
  where s.owner_id=new.user_id::text)
 then raise exception 'retention_owner_preservation_unavailable_deletion_already_claimed' using errcode='55000'; end if;
 return new;
end $$;
create trigger secondary_media_owner_preservation before insert or update on public.platform_role_memberships
 for each row execute function private.secondary_media_owner_preservation_guard();

alter function public.check_deleted_media_retirement(text,text,text,text) rename to check_deleted_media_retirement_before_secondary;
alter function public.check_deleted_media_retirement_before_secondary(text,text,text,text) set schema private;
revoke all on function private.check_deleted_media_retirement_before_secondary(text,text,text,text) from public,anon,authenticated,service_role;
create function public.check_deleted_media_retirement(p_provider text,p_bucket text,p_object_key text,p_purpose text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare previous jsonb; o private.secondary_media_objects%rowtype; begin
 previous:=private.check_deleted_media_retirement_before_secondary(p_provider,p_bucket,p_object_key,p_purpose);
 if previous->>'allowed' is distinct from 'true' then return previous; end if;
 perform private.platform_brand_retention_lock();
 select * into o from private.secondary_media_objects where object_key=p_object_key;
 if o.id is null then return previous; end if;
 if (o.provider,o.bucket) is distinct from (p_provider,p_bucket) or p_purpose='upload'
  or exists(select 1 from private.secondary_media_expiry_claims where object_id=o.id) then return jsonb_build_object('allowed',false); end if;
 if p_purpose in ('read','publish') and not exists(select 1 from private.secondary_media_bindings b
  join private.secondary_media_sources s on s.id=b.source_incarnation where b.object_id=o.id and s.deleted_at is null)
  then return jsonb_build_object('allowed',false); end if;
 return previous;
end $$;
revoke all on function public.check_deleted_media_retirement(text,text,text,text) from public,anon,authenticated;
grant execute on function public.check_deleted_media_retirement(text,text,text,text) to service_role;

revoke all on function private.secondary_media_owner_preservation_guard(),private.secondary_media_expiry_activation_guard(),private.secondary_media_bind_parent(),private.secondary_media_retired_reference_guard(),
 private.secondary_media_reference_coverage_ready(),private.secondary_media_has_live_reference(text),
 private.secondary_media_object_blocker(uuid),private.secondary_media_hold_guard() from public,anon,authenticated,service_role;
revoke all on function public.claim_secondary_media_expiry(uuid),public.read_secondary_media_expiry_claim(uuid),
 public.record_secondary_media_expiry_result(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_secondary_media_expiry(uuid),public.read_secondary_media_expiry_claim(uuid),
 public.record_secondary_media_expiry_result(uuid,text) to service_role;
commit;
