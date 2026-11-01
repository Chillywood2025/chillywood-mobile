begin;
-- Prospective exact-output bookkeeping. No provider operation, legacy adoption,
-- retention activation, schedule or deletion authority is installed here.
-- The existing retirement/Brand latch is shared; source rows are never locked
-- by these RPCs after taking it. Source row triggers serialize their committed
-- mutation with admission, including while the global capture switch is off.
create table private.secondary_media_registry_gate(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into private.secondary_media_registry_gate default values;
alter table private.secondary_media_registry_gate enable row level security;
alter table private.secondary_media_registry_gate force row level security;
revoke all on private.secondary_media_registry_gate from public,anon,authenticated,service_role;
create function private.secondary_media_statement_fence() returns trigger
language plpgsql security definer set search_path='' as $$ declare enabled_now boolean; begin
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
 select enabled into enabled_now from private.secondary_media_registry_gate where singleton for share;
 if enabled_now and current_setting('transaction_isolation')<>'read committed' then
  raise exception 'secondary_media_read_committed_required' using errcode='25000'; end if;
 return null;
end $$;
create trigger aa_secondary_media_statement before insert or update or delete or truncate on public.videos
 for each statement execute function private.secondary_media_statement_fence();
create trigger aa_secondary_media_statement before insert or update or delete or truncate on public.social_attachments
 for each statement execute function private.secondary_media_statement_fence();
create table private.secondary_media_sources (
 id uuid primary key default gen_random_uuid(),
 source_type text not null check(source_type in ('creator_video','social_attachment')),
 source_id uuid not null, owner_id text not null,
 source_created_at text not null, admitted_at timestamptz not null default clock_timestamp(),
 deleted_at timestamptz, expires_at timestamptz, owner_protected boolean not null,
 check ((deleted_at is null and expires_at is null) or expires_at=deleted_at+interval '720 hours')
);
create unique index secondary_media_live_source on private.secondary_media_sources(source_type,source_id) where deleted_at is null;
create table private.secondary_media_producers (
 id uuid primary key, source_incarnation uuid not null references private.secondary_media_sources(id),
 claim_token uuid not null default gen_random_uuid(), source_binding jsonb not null,
 provider text not null check(provider in ('cloudflare_r2','hetzner_s3')),
 bucket text not null check(length(bucket) between 1 and 128),
 output_prefix text not null unique,
 state text not null default 'open' check(state in ('open','sealed','invalidated')),
 inventory_sha256 text, object_count integer,
 admitted_at timestamptz not null default clock_timestamp(), sealed_at timestamptz,
 invalidated_at timestamptz,
 check (inventory_sha256 is null or inventory_sha256 ~ '^[a-f0-9]{64}$'),
 check (object_count is null or object_count between 1 and 32768)
);
create table private.secondary_media_objects (
 id uuid primary key default gen_random_uuid(), producer_id uuid not null references private.secondary_media_producers(id),
 provider text not null, bucket text not null, object_key text not null,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), size_bytes bigint not null check(size_bytes between 1 and 5368709120),
 object_role text not null check(object_role in ('playlist','media','original','thumbnail','render')),
 check(size_bytes<=134217728 or object_role in ('render','original')),
 dependencies jsonb not null default '[]',
 write_token uuid, dispatch_started_at timestamptz,
 provider_version text, provider_etag text, receipt jsonb, verified_at timestamptz,
 unique(provider,bucket,object_key),
 check ((write_token is null)=(dispatch_started_at is null)),
 check ((receipt is null)=(verified_at is null))
);
create index secondary_media_producer_objects on private.secondary_media_objects(producer_id);
create table private.secondary_media_bindings (
 object_id uuid not null references private.secondary_media_objects(id),
 source_incarnation uuid not null references private.secondary_media_sources(id),
 bound_at timestamptz not null default clock_timestamp(),
 primary key(object_id,source_incarnation)
);
do $$ declare t text; begin
 foreach t in array array['secondary_media_sources','secondary_media_producers','secondary_media_objects','secondary_media_bindings'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function private.secondary_media_preserve_identity() returns trigger
language plpgsql set search_path='' as $$ begin
 if tg_op in ('DELETE','TRUNCATE') then raise exception 'secondary_media_identity_permanent'; end if;
 if tg_table_name='secondary_media_registry_gate' then
  if old.singleton is distinct from new.singleton or (old.enabled and not new.enabled) then raise exception 'secondary_media_gate_monotonic'; end if;
 elsif tg_table_name='secondary_media_sources' then
  if (to_jsonb(new)-array['deleted_at','expires_at']) is distinct from (to_jsonb(old)-array['deleted_at','expires_at'])
   or old.deleted_at is not null or new.deleted_at is null then raise exception 'secondary_media_source_immutable'; end if;
 elsif tg_table_name='secondary_media_producers' then
  if (to_jsonb(new)-array['state','inventory_sha256','object_count','sealed_at','invalidated_at'])
    is distinct from (to_jsonb(old)-array['state','inventory_sha256','object_count','sealed_at','invalidated_at'])
   or (old.inventory_sha256 is not null and (new.inventory_sha256,new.object_count) is distinct from (old.inventory_sha256,old.object_count))
   or (old.state='invalidated' and new.state<>'invalidated') or (old.state='sealed' and new.state='open')
   or (old.sealed_at is not null and new.sealed_at is distinct from old.sealed_at)
   or (old.invalidated_at is not null and new.invalidated_at is distinct from old.invalidated_at)
  then raise exception 'secondary_media_producer_immutable'; end if;
 elsif tg_table_name='secondary_media_objects' then
  if (to_jsonb(new)-array['write_token','dispatch_started_at','provider_version','provider_etag','receipt','verified_at'])
    is distinct from (to_jsonb(old)-array['write_token','dispatch_started_at','provider_version','provider_etag','receipt','verified_at'])
   or (old.write_token is not null and (new.write_token,new.dispatch_started_at) is distinct from (old.write_token,old.dispatch_started_at))
   or (old.receipt is not null and to_jsonb(new) is distinct from to_jsonb(old))
  then raise exception 'secondary_media_object_immutable'; end if;
 else raise exception 'secondary_media_binding_immutable'; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['secondary_media_registry_gate','secondary_media_sources','secondary_media_producers','secondary_media_objects','secondary_media_bindings'] loop
  execute format('create trigger secondary_media_identity before update or delete on private.%I for each row execute function private.secondary_media_preserve_identity()',t);
  execute format('create trigger secondary_media_no_truncate before truncate on private.%I for each statement execute function private.secondary_media_preserve_identity()',t);
 end loop;
end $$;

create function private.secondary_media_read_source(p_type text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare s jsonb; begin
 if p_type='creator_video' then select to_jsonb(v) into s from public.videos v where id=p_id;
 elsif p_type='social_attachment' then select to_jsonb(a) into s from public.social_attachments a where id=p_id;
 else raise exception 'secondary_media_source_type_invalid'; end if;
 if s is null or nullif(s->>'deleted_at','') is not null or nullif(s->>'hard_deleted_at','') is not null then
  raise exception 'secondary_media_source_unavailable'; end if;
 return private.deleted_media_legacy_source_binding(p_type,s);
end $$;

create function private.secondary_media_require_worker() returns void
language plpgsql security definer set search_path='' as $$ begin
 if auth.role() is distinct from 'service_role' then raise exception 'secondary_media_service_role_required' using errcode='42501'; end if;
end $$;

create function public.begin_secondary_media_producer(p_source_type text,p_source_id uuid,p_producer_id uuid,
 p_expected_source_binding jsonb,p_provider text,p_bucket text,p_output_prefix text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b jsonb; s private.secondary_media_sources%rowtype; p private.secondary_media_producers%rowtype; begin
 perform private.secondary_media_require_worker();
 perform private.platform_brand_retention_lock();
 update private.secondary_media_registry_gate set enabled=true where singleton and not enabled;
 b:=private.secondary_media_read_source(p_source_type,p_source_id);
 if b is distinct from p_expected_source_binding then raise exception 'secondary_media_source_changed'; end if;
 if p_producer_id is null or p_provider not in ('cloudflare_r2','hetzner_s3') or p_bucket !~ '^[a-z0-9][a-z0-9.-]{1,126}[a-z0-9]$'
  or p_output_prefix !~ '^[A-Za-z0-9_/-]+/$' or p_output_prefix not like '%'||p_producer_id::text||'/'
  or length(p_output_prefix)>768 then raise exception 'secondary_media_output_identity_invalid'; end if;
 select * into s from private.secondary_media_sources where source_type=p_source_type and source_id=p_source_id and deleted_at is null;
 if s.id is null then
  if nullif(b->>'author','') is null or nullif(b->>'createdAt','') is null then raise exception 'secondary_media_source_identity_required'; end if;
  insert into private.secondary_media_sources(source_type,source_id,owner_id,source_created_at,owner_protected)
   values(p_source_type,p_source_id,b->>'author',b->>'createdAt',exists(select 1 from public.platform_role_memberships where user_id::text=b->>'author' and role='owner')) returning * into s;
 end if;
 if (s.owner_id,s.source_created_at) is distinct from (b->>'author',b->>'createdAt') then raise exception 'secondary_media_incarnation_changed'; end if;
 select * into p from private.secondary_media_producers where id=p_producer_id;
 if p.id is not null then
  if (p.source_incarnation,p.source_binding,p.provider,p.bucket,p.output_prefix) is distinct from
   (s.id,b,p_provider,p_bucket,p_output_prefix) then raise exception 'secondary_media_producer_conflict'; end if;
  if p.state<>'open' then raise exception 'secondary_media_producer_closed'; end if;
 else
  insert into private.secondary_media_producers(id,source_incarnation,source_binding,provider,bucket,output_prefix)
   values(p_producer_id,s.id,b,p_provider,p_bucket,p_output_prefix) returning * into p;
 end if;
 return jsonb_build_object('producerId',p.id,'claimToken',p.claim_token,'sourceIncarnation',s.id,'state',p.state);
end $$;

create function private.secondary_media_open_producer(p_id uuid,p_token uuid) returns private.secondary_media_producers
language plpgsql security definer set search_path='' as $$
declare p private.secondary_media_producers%rowtype; s private.secondary_media_sources%rowtype; begin
 perform private.secondary_media_require_worker();
 perform private.platform_brand_retention_lock();
 select * into p from private.secondary_media_producers where id=p_id and claim_token=p_token;
 if p.id is null or p.state<>'open' then raise exception 'secondary_media_producer_closed'; end if;
 select * into s from private.secondary_media_sources where id=p.source_incarnation;
 if s.deleted_at is not null or p.source_binding is distinct from private.secondary_media_read_source(s.source_type,s.source_id)
  then raise exception 'secondary_media_source_changed'; end if;
 return p;
end $$;

create function public.reserve_secondary_media_objects(p_producer_id uuid,p_claim_token uuid,p_inventory jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.secondary_media_producers%rowtype; o jsonb; k text; n integer; total bigint; begin
 perform private.secondary_media_require_worker();
 perform private.platform_brand_retention_lock();
 select * into p from private.secondary_media_producers where id=p_producer_id and claim_token=p_claim_token;
 if p.state is distinct from 'sealed' then p:=private.secondary_media_open_producer(p_producer_id,p_claim_token); end if;
 if jsonb_typeof(p_inventory->'objects') is distinct from 'array' or not coalesce(p_inventory->>'inventorySha256' ~ '^[a-f0-9]{64}$',false) then raise exception 'secondary_media_inventory_invalid'; end if;
 n:=jsonb_array_length(p_inventory->'objects');
 if n<1 or n>32768 or (p_inventory->>'objectCount')::integer is distinct from n then raise exception 'secondary_media_inventory_count_invalid'; end if;
 if p.inventory_sha256 is not null then
  if p.inventory_sha256=p_inventory->>'inventorySha256' and p.object_count=n
   and not exists(select 1 from jsonb_array_elements(p_inventory->'objects') x where not exists(
    select 1 from private.secondary_media_objects r where r.producer_id=p.id and r.object_key=x->>'objectKey'
     and r.sha256=x->>'sha256' and r.size_bytes=(x->>'sizeBytes')::bigint and r.object_role=x->>'kind'
     and r.dependencies=coalesce(x->'dependencies','[]'::jsonb)))
   then return jsonb_build_object('reserved',true,'objectCount',n); end if;
  raise exception 'secondary_media_inventory_conflict';
 end if;
 select sum((x->>'sizeBytes')::bigint) into total from jsonb_array_elements(p_inventory->'objects') x;
 if total>68719476736 then raise exception 'secondary_media_inventory_size_exceeded'; end if;
 for o in select value from jsonb_array_elements(p_inventory->'objects') loop
  k:=o->>'objectKey';
  if k is null or left(k,length(p.output_prefix))<>p.output_prefix or length(k)>1024
   or k !~ '^[A-Za-z0-9_./-]+$' or k ~ '(^|/)[.]{1,2}(/|$)' or k like '%//%'
   or jsonb_typeof(coalesce(o->'dependencies','[]'::jsonb))<>'array' then raise exception 'secondary_media_object_key_invalid'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(o->'dependencies','[]'::jsonb)) d where not exists(
    select 1 from jsonb_array_elements(p_inventory->'objects') z where z->>'objectKey'=p.output_prefix||d)) then raise exception 'secondary_media_dependency_missing'; end if;
  insert into private.secondary_media_objects(producer_id,provider,bucket,object_key,sha256,size_bytes,object_role,dependencies)
   values(p.id,p.provider,p.bucket,k,o->>'sha256',(o->>'sizeBytes')::bigint,o->>'kind',coalesce(o->'dependencies','[]'::jsonb));
 end loop;
 insert into private.secondary_media_bindings(object_id,source_incarnation)
  select id,p.source_incarnation from private.secondary_media_objects where producer_id=p.id;
 update private.secondary_media_producers set inventory_sha256=p_inventory->>'inventorySha256',object_count=n where id=p.id;
 return jsonb_build_object('reserved',true,'objectCount',n);
end $$;

create function public.read_secondary_media_object_write(p_producer_id uuid,p_claim_token uuid,p_object_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.secondary_media_producers%rowtype; o private.secondary_media_objects%rowtype; begin
 perform private.secondary_media_require_worker();
 perform private.platform_brand_retention_lock();
 select * into p from private.secondary_media_producers where id=p_producer_id and claim_token=p_claim_token;
 select * into o from private.secondary_media_objects where producer_id=p.id and object_key=p_object_key;
 if o.id is null then raise exception 'secondary_media_object_not_reserved'; end if;
 return jsonb_build_object('status',case when o.receipt is not null then 'verified' when o.write_token is not null then 'dispatched' else 'unwritten' end,
  'identity',jsonb_build_object('objectId',o.id,'writeToken',o.write_token,'sha256',o.sha256,'sizeBytes',o.size_bytes,
   'provider',o.provider,'bucket',o.bucket,'objectKey',o.object_key));
end $$;

-- Dispatch is one-shot. A timeout or lost response leaves a durable unresolved
-- write. Neither a negative HEAD nor lease expiry can turn it into a safe retry.
create function public.begin_secondary_media_object_write(p_producer_id uuid,p_claim_token uuid,p_object_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.secondary_media_producers%rowtype; o private.secondary_media_objects%rowtype; begin
 p:=private.secondary_media_open_producer(p_producer_id,p_claim_token);
 select * into o from private.secondary_media_objects where producer_id=p.id and object_key=p_object_key;
 if o.id is null then raise exception 'secondary_media_object_not_reserved'; end if;
 if o.write_token is not null then raise exception 'secondary_media_write_already_dispatched'; end if;
 update private.secondary_media_objects set write_token=gen_random_uuid(),dispatch_started_at=clock_timestamp() where id=o.id returning * into o;
 return jsonb_build_object('objectId',o.id,'writeToken',o.write_token,'sha256',o.sha256,'sizeBytes',o.size_bytes,
  'provider',o.provider,'bucket',o.bucket,'objectKey',o.object_key);
end $$;

create function public.record_secondary_media_object_receipt(p_producer_id uuid,p_claim_token uuid,p_object_key text,p_write_token uuid,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.secondary_media_producers%rowtype; o private.secondary_media_objects%rowtype; begin
 perform private.secondary_media_require_worker();
 perform private.platform_brand_retention_lock();
 select * into p from private.secondary_media_producers where id=p_producer_id and claim_token=p_claim_token;
 select * into o from private.secondary_media_objects where producer_id=p.id and object_key=p_object_key and write_token=p_write_token;
 if o.id is null then raise exception 'secondary_media_write_identity_invalid'; end if;
 -- Accept completion after source removal only to settle the already-dispatched
 -- writer. Invalidated generations can never seal or publish afterwards.
 if p_receipt->>'protocol' is distinct from 'secondary-media-create-only-v1'
  or p_receipt->>'sha256' is distinct from o.sha256 or (p_receipt->>'sizeBytes')::bigint is distinct from o.size_bytes
  or p_receipt->>'createOnly' is distinct from 'true' or p_receipt->>'fullReadback' is distinct from 'true'
  or p_receipt->>'writeCompleted' is distinct from 'true' or p_receipt->>'provider' is distinct from o.provider
  or p_receipt->>'bucket' is distinct from o.bucket or p_receipt->>'objectKey' is distinct from o.object_key
  or nullif(p_receipt->>'etag','') is null or length(p_receipt::text)>8192
  or (o.provider='hetzner_s3' and (nullif(p_receipt->>'versionId','') is null or p_receipt->>'versionId'='null'))
 then raise exception 'secondary_media_receipt_invalid'; end if;
 if o.receipt is not null then
  if o.receipt is distinct from p_receipt then raise exception 'secondary_media_receipt_conflict'; end if;
 else
  update private.secondary_media_objects set receipt=p_receipt,provider_version=p_receipt->>'versionId',provider_etag=p_receipt->>'etag',verified_at=clock_timestamp() where id=o.id;
 end if;
 return jsonb_build_object('recorded',true,'objectId',o.id,'publishable',p.state='open');
end $$;

create function public.seal_secondary_media_producer(p_producer_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.secondary_media_producers%rowtype; begin
 perform private.secondary_media_require_worker();
 perform private.platform_brand_retention_lock();
 select * into p from private.secondary_media_producers where id=p_producer_id and claim_token=p_claim_token;
 if p.id is not null and p.state='sealed' then return jsonb_build_object('sealed',true,'producerId',p.id); end if;
 p:=private.secondary_media_open_producer(p_producer_id,p_claim_token);
 if p.object_count is null or p.object_count<>(select count(*) from private.secondary_media_objects where producer_id=p.id)
  or exists(select 1 from private.secondary_media_objects where producer_id=p.id and (receipt is null or write_token is null))
 then raise exception 'secondary_media_writer_not_drained'; end if;
 update private.secondary_media_producers set state='sealed',sealed_at=clock_timestamp() where id=p.id;
 return jsonb_build_object('sealed',true,'producerId',p.id);
end $$;

-- Called from the same transaction that creates the reviewed output draft.
-- It cannot attach someone else's bytes or adopt a historical unproven key.
create function private.attach_secondary_media_output(p_producer_id uuid,p_object_key text,p_target_type text,
 p_target_id uuid,p_expected_binding jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p private.secondary_media_producers%rowtype; o private.secondary_media_objects%rowtype;
 original private.secondary_media_sources%rowtype; target private.secondary_media_sources%rowtype; b jsonb; begin
 perform private.platform_brand_retention_lock();
 select * into p from private.secondary_media_producers where id=p_producer_id;
 select * into o from private.secondary_media_objects where producer_id=p.id and object_key=p_object_key and receipt is not null;
 select * into original from private.secondary_media_sources where id=p.source_incarnation;
 if p.state is distinct from 'sealed' or o.id is null or original.deleted_at is not null then raise exception 'secondary_media_output_not_sealed'; end if;
 b:=private.secondary_media_read_source(p_target_type,p_target_id);
 if b is distinct from p_expected_binding or (b->>'author',b->>'provider',b->>'bucket',b->>'objectKey')
  is distinct from (original.owner_id,o.provider,o.bucket,o.object_key)
  then raise exception 'secondary_media_output_target_mismatch'; end if;
 select * into target from private.secondary_media_sources where source_type=p_target_type and source_id=p_target_id and deleted_at is null;
 if target.id is null then
  insert into private.secondary_media_sources(source_type,source_id,owner_id,source_created_at,owner_protected)
   values(p_target_type,p_target_id,b->>'author',b->>'createdAt',original.owner_protected or exists(
    select 1 from public.platform_role_memberships where user_id::text=b->>'author' and role='owner')) returning * into target;
 end if;
 if (target.owner_id,target.source_created_at) is distinct from (b->>'author',b->>'createdAt') then raise exception 'secondary_media_output_incarnation_conflict'; end if;
 insert into private.secondary_media_bindings(object_id,source_incarnation) values(o.id,target.id) on conflict do nothing;
 return o.id;
end $$;

create function private.secondary_media_source_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare typ text:=case when tg_table_name='videos' then 'creator_video' else 'social_attachment' end;
 s private.secondary_media_sources%rowtype; old_binding jsonb; new_binding jsonb; is_deletion boolean; t timestamptz:=clock_timestamp(); begin
 if not exists(select 1 from private.secondary_media_registry_gate where singleton and enabled) then return case when tg_op='DELETE' then old else new end; end if;
 perform private.platform_brand_retention_lock();
 if tg_op='TRUNCATE' then
  if exists(select 1 from private.secondary_media_sources where source_type=typ and deleted_at is null) then raise exception 'secondary_media_explicit_delete_required'; end if;
  return null;
 end if;
 select * into s from private.secondary_media_sources where source_type=typ and source_id=old.id and deleted_at is null;
 if s.id is null then return case when tg_op='DELETE' then old else new end; end if;
 old_binding:=private.deleted_media_legacy_source_binding(typ,to_jsonb(old));
 if tg_op='UPDATE' then
  new_binding:=private.deleted_media_legacy_source_binding(typ,to_jsonb(new));
  if (new.id,new_binding->>'author',new_binding->>'createdAt') is distinct from (old.id,s.owner_id,s.source_created_at)
   then raise exception 'secondary_media_source_identity_immutable'; end if;
 end if;
 is_deletion:=tg_op='DELETE' or (nullif(to_jsonb(old)->>'deleted_at','') is null and nullif(to_jsonb(new)->>'deleted_at','') is not null);
 if is_deletion or new_binding is distinct from old_binding then
  update private.secondary_media_producers set state='invalidated',invalidated_at=coalesce(invalidated_at,t)
   where source_incarnation=s.id and state<>'invalidated';
 end if;
 if is_deletion then
  update private.secondary_media_sources set deleted_at=t,expires_at=t+interval '720 hours' where id=s.id;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger zz_secondary_media_source before update or delete on public.videos
 for each row execute function private.secondary_media_source_changed();
create trigger zz_secondary_media_source before update or delete on public.social_attachments
 for each row execute function private.secondary_media_source_changed();
create trigger zz_secondary_media_no_truncate before truncate on public.videos
 for each statement execute function private.secondary_media_source_changed();
create trigger zz_secondary_media_no_truncate before truncate on public.social_attachments
 for each statement execute function private.secondary_media_source_changed();

create function private.secondary_media_publication_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare p private.secondary_media_producers%rowtype; s private.secondary_media_sources%rowtype;
 r jsonb:=to_jsonb(new); job uuid; k text; begin
 job:=case when tg_table_name='media_transcode_jobs' then (r->>'id')::uuid else nullif(r->>'job_id','')::uuid end;
 select * into p from private.secondary_media_producers where id=job;
 if p.id is null then return new; end if; -- legacy remains explicitly uncovered
 select * into s from private.secondary_media_sources where id=p.source_incarnation;
 -- A stale worker may record terminal failure, but cannot change identity or
 -- resurrect ready output after its source has gone away.
 if tg_op='UPDATE' and tg_table_name='media_transcode_jobs' and r->>'status' in ('failed','canceled')
  and (r-array['status','error_code','error_message','updated_at','completed_at'])
   =(to_jsonb(old)-array['status','error_code','error_message','updated_at','completed_at']) then return new; end if;
 if p.state='invalidated' or s.deleted_at is not null
  or (r->>'source_type',r->>'source_id') is distinct from (s.source_type,s.source_id::text)
  or p.source_binding is distinct from private.secondary_media_read_source(s.source_type,s.source_id)
 then raise exception 'secondary_media_publication_source_changed'; end if;
 if tg_table_name='media_transcode_jobs' then
  if (r->>'output_provider',r->>'output_bucket',r->>'output_prefix') is distinct from (p.provider,p.bucket,p.output_prefix)
   then raise exception 'secondary_media_job_output_mismatch'; end if;
  if r->>'status'='ready' and p.state<>'sealed' then raise exception 'secondary_media_publication_not_sealed'; end if;
 else
  if p.state<>'sealed' or (r->>'storage_provider',r->>'storage_bucket') is distinct from (p.provider,p.bucket)
   then raise exception 'secondary_media_publication_not_sealed'; end if;
  for k in select value from jsonb_each_text(r) where key in ('storage_path','manifest_path','variant_playlist_path','public_playback_path','protected_playback_path') and nullif(value,'') is not null loop
   if not exists(select 1 from private.secondary_media_objects where producer_id=p.id and object_key=k and receipt is not null)
    then raise exception 'secondary_media_publication_object_unbound'; end if;
  end loop;
 end if;
 return new;
end $$;
create trigger aa_secondary_media_statement before insert or update or delete or truncate on public.media_transcode_jobs
 for each statement execute function private.secondary_media_statement_fence();
create trigger aa_secondary_media_statement before insert or update or delete or truncate on public.media_renditions
 for each statement execute function private.secondary_media_statement_fence();
create trigger zz_secondary_media_publication before insert or update on public.media_transcode_jobs
 for each row execute function private.secondary_media_publication_guard();
create trigger zz_secondary_media_publication before insert or update on public.media_renditions
 for each row execute function private.secondary_media_publication_guard();

-- Readiness is diagnostic, never a delete claim. Existing global coverage gates
-- remain unchanged until historical bindings and provider transport are proven.
create function public.read_secondary_media_retention_readiness() returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform private.secondary_media_require_worker();
 perform private.platform_brand_retention_lock();
 return jsonb_build_object('physicalDeletionAllowed',false,
  'producerCount',(select count(*) from private.secondary_media_producers),
  'unresolvedWrites',(select count(*) from private.secondary_media_objects where write_token is not null and receipt is null),
  'unwrittenObjects',(select count(*) from private.secondary_media_objects where write_token is null),
  'unsealedProducers',(select count(*) from private.secondary_media_producers where sealed_at is null),
  'sharedObjects',(select count(*) from (select object_id from private.secondary_media_bindings group by object_id having count(*)>1) x),
  'expiredObjectsWithoutLiveBindings',(select count(*) from private.secondary_media_objects o where receipt is not null
    and not exists(select 1 from private.secondary_media_bindings b join private.secondary_media_sources s on s.id=b.source_incarnation
      where b.object_id=o.id and (s.deleted_at is null or s.expires_at>clock_timestamp() or s.owner_protected
       or exists(select 1 from public.legal_holds h where h.status='active' and private.deleted_content_hold_matches(h.target_type,h.target_id,s.source_type,s.source_id::text,s.owner_id,null,null))))));
end $$;
revoke all on function private.secondary_media_publication_guard(),private.secondary_media_require_worker(),private.attach_secondary_media_output(uuid,text,text,uuid,jsonb),private.secondary_media_statement_fence(),private.secondary_media_preserve_identity(),private.secondary_media_read_source(text,uuid),
 private.secondary_media_open_producer(uuid,uuid),private.secondary_media_source_changed() from public,anon,authenticated,service_role;
revoke all on function public.begin_secondary_media_producer(text,uuid,uuid,jsonb,text,text,text),
 public.read_secondary_media_object_write(uuid,uuid,text),
 public.reserve_secondary_media_objects(uuid,uuid,jsonb),public.begin_secondary_media_object_write(uuid,uuid,text),
 public.record_secondary_media_object_receipt(uuid,uuid,text,uuid,jsonb),public.seal_secondary_media_producer(uuid,uuid),
 public.read_secondary_media_retention_readiness() from public,anon,authenticated;
grant execute on function public.begin_secondary_media_producer(text,uuid,uuid,jsonb,text,text,text),
 public.read_secondary_media_object_write(uuid,uuid,text),
 public.reserve_secondary_media_objects(uuid,uuid,jsonb),public.begin_secondary_media_object_write(uuid,uuid,text),
 public.record_secondary_media_object_receipt(uuid,uuid,text,uuid,jsonb),public.seal_secondary_media_producer(uuid,uuid),
 public.read_secondary_media_retention_readiness() to service_role;
commit;
