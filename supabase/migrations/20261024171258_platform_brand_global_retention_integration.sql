begin;
-- Source-only integration. Existing Brand incarnation, scanner proof, 720-hour
-- clock, permanent key fence and exact-version transport remain authoritative.
-- No provider calls, schedules, qualification evidence or activation are added.

-- Drain pre-integration removals before adopting generic archives or changing
-- their catalog. Source-before-archive order matches the real removal path;
-- every prior removal is visible to the backfill and no in-flight capture can
-- commit between the backfill and installation of the delegating successor.
-- Take the eventual DROP TRIGGER lock strength now, rather than upgrading it
-- after a new removal reader obtains ROW SHARE and waits to become a writer.
lock table public.platform_brand_assets in access exclusive mode;

-- All Brand paths enter the established global latch BEFORE the shared Brand
-- advisory lock. In particular, activation/re-enable owns UPDATE on this latch
-- before inspecting Brand; an upload/proof/hold must never take the inverse.
create or replace function private.platform_brand_retention_lock() returns void
language plpgsql security definer set search_path='' as $$ begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'brand_retention_read_committed_required' using errcode='25000'; end if;
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
end $$;

alter table private.platform_brand_retention_settings
 add column batch_enabled boolean not null default false;
create table private.platform_brand_retention_work_dispatch (
 asset_id uuid primary key references private.platform_brand_object_incarnations(asset_id),
 next_attempt_at timestamptz not null
);
create table private.platform_brand_retention_worker_health (
 singleton boolean primary key default true check(singleton),
 last_completed_at timestamptz not null,
 enabled boolean not null, qualified boolean not null
);
-- This link also adopts matching pre-integration generic bookkeeping without
-- mutating its immutable historical row or restarting the authoritative clock.
create table private.deleted_content_brand_delegations (
 deletion_id uuid primary key,
 asset_id uuid not null references private.platform_brand_object_incarnations(asset_id),
 owner_id text not null, source_created_at timestamptz not null,
 removed_at timestamptz not null, retain_until timestamptz not null,
 check(retain_until=removed_at+interval '720 hours')
);
create index deleted_content_brand_delegation_asset on private.deleted_content_brand_delegations(asset_id);
do $$ declare t text; begin
 foreach t in array array['platform_brand_retention_work_dispatch','platform_brand_retention_worker_health','deleted_content_brand_delegations'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
create trigger brand_delegation_immutable before update or delete on private.deleted_content_brand_delegations
 for each row execute function private.platform_brand_retention_immutable();
create trigger brand_delegation_no_truncate before truncate on private.deleted_content_brand_delegations
 for each statement execute function private.platform_brand_retention_immutable();
insert into private.deleted_content_brand_delegations(deletion_id,asset_id,owner_id,source_created_at,removed_at,retain_until)
select d.id,r.asset_id,r.owner_id,r.source_created_at,r.removed_at,r.retain_until
from private.deleted_content_records d join private.platform_brand_object_incarnations r
 on d.target_type='platform_brand_asset' and d.target_id=r.asset_id::text
 and d.author=r.owner_id and d.source_created_at=r.source_created_at
where d.deletion_kind='soft' and d.content is null and r.removed_at is not null;

alter table private.deleted_content_records drop constraint deleted_content_records_media_disposition_check;
alter table private.deleted_content_records add constraint deleted_content_records_media_disposition_check
 check(media_disposition in ('unknown','text_only','metadata_only','retained_original','reviewed_external_reference','delegated_brand_original'));

-- Coverage is NOT deletion eligibility. A published asset or a legal hold may
-- have exact protocol/proof coverage while remaining ineligible for expiry.
create function private.deleted_content_brand_source_coverage(p_source jsonb,p_require_proof boolean default true)
returns text language plpgsql security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype; p private.platform_brand_object_proofs%rowtype;
 o storage.objects%rowtype; b jsonb;
begin
 perform private.platform_brand_retention_lock();
 if not (private.deleted_media_locator_columns('public.platform_brand_assets'::regclass)
  <@ array['storage_path','storage_object_key']::text[]) then return 'brand_source_schema_unreviewed'; end if;
 if p_source->>'storage_provider' is distinct from 'supabase' then return 'brand_unsupported_provider'; end if;
 if p_source->>'storage_bucket' is distinct from 'platform-brand-assets' then return 'brand_unsupported_bucket'; end if;
 select * into r from private.platform_brand_object_incarnations where asset_id::text=p_source->>'id';
 if r.asset_id is null or r.storage_object_id is null or nullif(r.storage_version,'') is null
  or r.storage_path is distinct from r.object_key
  or (p_source->>'owner_user_id',(p_source->>'created_at')::timestamptz,p_source->>'storage_provider',
      p_source->>'storage_bucket',p_source->>'storage_object_key',p_source->>'storage_path')
   is distinct from (r.owner_id,r.source_created_at,r.provider,r.bucket,r.object_key,r.storage_path)
  or (r.removed_at is null) is distinct from (p_source->>'deleted_at' is null)
  or (r.removed_at is not null and r.removal_clock='server_observed_removal'
      and r.removed_at is distinct from (p_source->>'deleted_at')::timestamptz)
 then return 'brand_incarnation_unavailable'; end if;
 -- Legacy aliases are never promoted into a one-owner exact object binding.
 if exists(select 1 from private.platform_brand_object_incarnations x where x.asset_id<>r.asset_id
  and x.provider=r.provider and x.bucket=r.bucket and x.object_key=r.object_key) then return 'brand_shared_key_unsupported'; end if;
 select * into o from storage.objects where bucket_id=r.bucket and name=r.object_key for share nowait;
 if o.id is not null and (o.id is distinct from r.storage_object_id or to_jsonb(o)->>'version' is distinct from r.storage_version)
 then return 'brand_storage_generation_changed'; end if;
 if o.id is null and not exists(select 1 from private.platform_brand_expiry_claims c where c.asset_id=r.asset_id)
 then return 'brand_storage_incarnation_missing'; end if;
 if not p_require_proof then return 'brand_exact_incarnation'; end if;
 select * into p from private.platform_brand_object_proofs where asset_id=r.asset_id;
 if p.asset_id is null then return 'brand_scan_proof_required'; end if;
 if o.id is null then
  if private.platform_brand_claimed_scan_evidence_matches(r.asset_id,p.scan_receipt_id,p.binding,p.origin_sha256,p.origin_size_bytes)
  then return 'brand_claimed_original'; else return 'brand_claimed_scan_evidence_unavailable'; end if;
 end if;
 b:=public.read_platform_brand_retention_binding(r.asset_id);
 if b is distinct from p.binding or not private.platform_brand_scan_byte_receipt_matches(p.scan_receipt_id,p.binding,p.origin_sha256,p.origin_size_bytes)
 then return 'brand_scan_proof_no_longer_current'; end if;
 return 'brand_verified_original';
exception when lock_not_available then return 'brand_contended';
end $$;

create function private.guard_deleted_content_brand_admission() returns trigger
language plpgsql security definer set search_path='' as $$ declare coverage text;
begin
 perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then return new; end if;
 if not (private.deleted_media_locator_columns('public.platform_brand_assets'::regclass)
  <@ array['storage_path','storage_object_key']::text[]) then
  raise exception 'brand_source_schema_unreviewed' using errcode='55000'; end if;
 -- Existing unsupported legacy rows stay protected and editable; they remain
 -- explicit readiness blockers. Identity/key mutation is independently fenced.
 if tg_op='UPDATE' and (new.id,new.owner_user_id,new.created_at,new.storage_provider,new.storage_bucket,new.storage_object_key,new.storage_path)
  is not distinct from (old.id,old.owner_user_id,old.created_at,old.storage_provider,old.storage_bucket,old.storage_object_key,old.storage_path)
 then return new; end if;
 coverage:=private.deleted_content_brand_source_coverage(to_jsonb(new),false);
 if coverage<>'brand_exact_incarnation' then raise exception 'brand_retention_admission_required: %',coverage using errcode='55000'; end if;
 -- The scan job is enqueued AFTER source registration. Requiring a completed
 -- proof here would deadlock that bootstrap. Pending scans cannot expire.
 return new;
end $$;
-- Do not replace the shared secondary function or any rendition/transcode hook.
drop trigger zzz_deleted_content_secondary_coverage on public.platform_brand_assets;
create trigger zzz_deleted_content_brand_admission before insert or update on public.platform_brand_assets
 for each row execute function private.guard_deleted_content_brand_admission();

create function private.deleted_content_brand_guards_ready() returns boolean
language plpgsql volatile security definer set search_path='' as $$ begin
 if to_regclass('public.platform_brand_publications') is null then return false; end if;
 if not (private.deleted_media_locator_columns('public.platform_brand_assets'::regclass)
  <@ array['storage_path','storage_object_key']::text[]) then return false; end if;
 if exists(select 1 from (values
  ('storage.objects','private.guard_platform_brand_storage_incarnation()',31),
  ('public.platform_brand_assets','private.guard_platform_brand_retained_asset()',31),
  ('public.platform_brand_assets','private.guard_deleted_content_brand_admission()',23),
  ('public.legal_holds','private.guard_platform_brand_retention_hold()',23),
  ('public.platform_brand_profiles','private.guard_platform_brand_retention_profile()',23),
  ('public.platform_brand_publications','private.guard_platform_brand_retention_profile()',23)
 ) required(relation,func,mask) where not exists(select 1 from pg_trigger g
  where g.tgrelid=to_regclass(required.relation) and g.tgfoid=to_regprocedure(required.func)
   and g.tgenabled in ('O','A') and (g.tgtype::int & required.mask)=required.mask
   and g.tgqual is null and cardinality(g.tgattr::smallint[])=0)) then return false; end if;
 return not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0
   and not exists(select 1 from pg_trigger g where g.tgrelid=c.oid
    and g.tgfoid='private.guard_platform_brand_retention_references()'::regprocedure
    and g.tgenabled in ('O','A') and (g.tgtype::int & 23)=23 and g.tgqual is null and cardinality(g.tgattr::smallint[])=0));
end $$;

create function private.deleted_content_brand_transport_qualified() returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce((select version_delete_verified and provider_origin is not null and provider_contract_sha256 is not null
  and writer_drain_evidence_sha256 ~ '^[0-9a-f]{64}$' and reference_review_evidence_sha256 ~ '^[0-9a-f]{64}$'
  and writer_drain_evidence_sha256 is not null and reference_review_evidence_sha256 is not null
  from private.platform_brand_retention_settings where singleton),false)
  and private.deleted_content_brand_guards_ready()
$$;

alter function private.capture_deleted_content_row(text,jsonb,boolean) rename to capture_deleted_content_row_before_brand;
create function private.capture_deleted_content_row(p_type text,v jsonb,p_soft boolean default false) returns uuid
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.platform_brand_object_incarnations%rowtype; d uuid;
begin
 if p_type<>'platform_brand_asset' then return private.capture_deleted_content_row_before_brand(p_type,v,p_soft); end if;
 perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then return null; end if;
 select * into r from private.platform_brand_object_incarnations where asset_id::text=v->>'id';
 if not p_soft or r.asset_id is null or r.removed_at is null
  or (v->>'owner_user_id',(v->>'created_at')::timestamptz,v->>'storage_provider',v->>'storage_bucket',v->>'storage_object_key',v->>'storage_path')
   is distinct from (r.owner_id,r.source_created_at,r.provider,r.bucket,r.object_key,r.storage_path)
 then raise exception 'brand_delegation_exact_removal_required' using errcode='55000'; end if;
 select deletion_id into d from private.deleted_content_brand_delegations where asset_id=r.asset_id order by deletion_id limit 1;
 if d is not null then return d; end if;
 insert into private.deleted_content_records(target_type,target_id,author,owner_protected,content,source_updated_at,source_created_at,deletion_kind,deleted_at,expires_at,media_disposition)
 values(p_type,r.asset_id::text,r.owner_id,exists(select 1 from public.platform_role_memberships where user_id=r.owner_id and role='owner'),
  null,nullif(v->>'updated_at','')::timestamptz,r.source_created_at,'soft',r.removed_at,r.retain_until,'delegated_brand_original') returning id into d;
 insert into private.deleted_content_brand_delegations(deletion_id,asset_id,owner_id,source_created_at,removed_at,retain_until)
 values(d,r.asset_id,r.owner_id,r.source_created_at,r.removed_at,r.retain_until);
 insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
 values('capture',p_type,r.asset_id::text,d,auth.uid()::text);
 return d;
end $$;

alter function public.expire_deleted_content_text(uuid) rename to expire_deleted_content_text_before_brand;
alter function public.expire_deleted_content_text_before_brand(uuid) set schema private;
create function public.expire_deleted_content_text(p_deletion_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.deleted_content_records%rowtype; b private.deleted_content_brand_delegations%rowtype;
begin
 select * into d from private.deleted_content_records where id=p_deletion_id;
 if d.target_type is distinct from 'platform_brand_asset' then return private.expire_deleted_content_text_before_brand(p_deletion_id); end if;
 perform private.platform_brand_retention_lock();
 select * into b from private.deleted_content_brand_delegations where deletion_id=d.id;
 if b.deletion_id is null or (d.target_id,d.author,d.source_created_at,d.content)
  is distinct from (b.asset_id::text,b.owner_id,b.source_created_at,null::jsonb)
 then return jsonb_build_object('status','brand_delegation_unavailable'); end if;
 -- Never purges the Brand source, proof or nonreuse tombstone. The bounded
 -- Brand worker owns exact transport using this same original deadline.
 return jsonb_build_object('status','delegated_brand_lifecycle','assetId',b.asset_id,
  'removedAt',b.removed_at,'retainUntil',b.retain_until,'permanentlyAbsent',false);
end $$;

create function public.list_platform_brand_retention_expiry_work() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare enabled_now boolean; qualified_now boolean; ids uuid[];
begin
 perform private.platform_brand_retention_lock();
 select coalesce(s.capture_enabled and s.media_expiry_enabled and b.expiry_enabled and b.batch_enabled,false)
 into enabled_now from private.deleted_content_retention_settings s cross join private.platform_brand_retention_settings b
 where s.singleton and b.singleton;
 qualified_now:=private.deleted_content_brand_transport_qualified();
 if not coalesce(enabled_now,false) or not qualified_now then
  return jsonb_build_object('enabled',coalesce(enabled_now,false),'qualified',qualified_now,'assetIds','[]'::jsonb,'limit',25); end if;
 select array_agg(asset_id) into ids from (
  select r.asset_id from private.platform_brand_object_incarnations r
  left join private.platform_brand_retention_work_dispatch q on q.asset_id=r.asset_id
  where r.removed_at is not null and r.retain_until<=clock_timestamp()
   and (q.asset_id is null or q.next_attempt_at<=clock_timestamp())
   and not exists(select 1 from private.platform_brand_expiry_transport_results result
    where result.asset_id=r.asset_id and result.outcome='observed_absent')
  order by coalesce(q.next_attempt_at,r.retain_until),r.asset_id limit 25
 ) work;
 insert into private.platform_brand_retention_work_dispatch(asset_id,next_attempt_at)
 select unnest(ids),clock_timestamp()+interval '1 hour'
 on conflict(asset_id) do update set next_attempt_at=excluded.next_attempt_at;
 -- A lease is not expiry authority. Every asset still uses begin/read, which
 -- rechecks current holds/references/version/proof and qualified transport.
 return jsonb_build_object('enabled',true,'qualified',true,'assetIds',coalesce(to_jsonb(ids),'[]'::jsonb),'limit',25);
end $$;

-- Batch-only bridges recheck the new gates immediately before each existing
-- exact claim/read. Explicit single-asset transport retains its own contract.
create function public.begin_platform_brand_retention_batch_transport(p_asset_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.deleted_content_retention_settings s cross join private.platform_brand_retention_settings b
  where s.singleton and b.singleton and s.capture_enabled and s.media_expiry_enabled and b.expiry_enabled and b.batch_enabled)
  or not private.deleted_content_brand_transport_qualified()
 then return jsonb_build_object('status','batch_disabled_or_unqualified'); end if;
 if not exists(select 1 from private.platform_brand_retention_work_dispatch where asset_id=p_asset_id and next_attempt_at>clock_timestamp())
 then return jsonb_build_object('status','batch_dispatch_unavailable'); end if;
 return public.begin_platform_brand_retention_transport(p_asset_id);
end $$;
create function public.read_platform_brand_retention_batch_claim(p_asset_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.deleted_content_retention_settings s cross join private.platform_brand_retention_settings b
  where s.singleton and b.singleton and s.capture_enabled and s.media_expiry_enabled and b.expiry_enabled and b.batch_enabled)
  or not private.deleted_content_brand_transport_qualified()
 then return jsonb_build_object('status','batch_disabled_or_unqualified'); end if;
 if not exists(select 1 from private.platform_brand_retention_work_dispatch where asset_id=p_asset_id and next_attempt_at>clock_timestamp())
 then return jsonb_build_object('status','batch_dispatch_unavailable'); end if;
 return public.read_platform_brand_retention_expiry_claim(p_asset_id,p_claim_token);
end $$;

create function public.record_platform_brand_retention_worker_heartbeat(p_enabled boolean,p_qualified boolean) returns jsonb
language plpgsql security definer set search_path='' as $$ declare enabled_now boolean; qualified_now boolean;
begin
 perform private.platform_brand_retention_lock();
 select coalesce(s.capture_enabled and s.media_expiry_enabled and b.expiry_enabled and b.batch_enabled,false)
 into enabled_now from private.deleted_content_retention_settings s cross join private.platform_brand_retention_settings b
 where s.singleton and b.singleton;
 qualified_now:=private.deleted_content_brand_transport_qualified();
 if p_enabled is distinct from coalesce(enabled_now,false) or p_qualified is distinct from qualified_now
 then raise exception 'brand_worker_state_changed'; end if;
 insert into private.platform_brand_retention_worker_health(singleton,last_completed_at,enabled,qualified)
 values(true,clock_timestamp(),p_enabled,p_qualified) on conflict(singleton) do update
 set last_completed_at=excluded.last_completed_at,enabled=excluded.enabled,qualified=excluded.qualified;
 return jsonb_build_object('status','recorded','enabled',p_enabled,'qualified',p_qualified,'permanentlyAbsent',false);
end $$;

-- Function ACLs are explicit even under permissive project default privileges.
revoke all on function private.deleted_content_brand_source_coverage(jsonb,boolean),private.guard_deleted_content_brand_admission(),
 private.deleted_content_brand_guards_ready(),private.deleted_content_brand_transport_qualified(),
 private.capture_deleted_content_row_before_brand(text,jsonb,boolean),private.capture_deleted_content_row(text,jsonb,boolean),
 private.expire_deleted_content_text_before_brand(uuid),public.expire_deleted_content_text(uuid),
 public.list_platform_brand_retention_expiry_work(),public.record_platform_brand_retention_worker_heartbeat(boolean,boolean),
 public.begin_platform_brand_retention_batch_transport(uuid),public.read_platform_brand_retention_batch_claim(uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.expire_deleted_content_text(uuid),public.list_platform_brand_retention_expiry_work(),
 public.record_platform_brand_retention_worker_heartbeat(boolean,boolean),
 public.begin_platform_brand_retention_batch_transport(uuid),public.read_platform_brand_retention_batch_claim(uuid,uuid) to service_role;


-- Scanner byte authority uses the same Brand-only lock ordering.
create or replace function public.begin_media_scan_byte_observation(p_job_id uuid,p_worker_id text,p_attempt_count integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.media_scan_jobs%rowtype; b jsonb; observation uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'media_scan_service_role_required'; end if;
 perform private.platform_brand_retention_lock();
 select * into j from public.media_scan_jobs where id=p_job_id for share nowait;
 if not found or j.status<>'scanning' or j.claimed_by is distinct from p_worker_id
   or nullif(btrim(p_worker_id),'') is null or j.attempt_count is distinct from p_attempt_count
   or j.claimed_at is null or j.claimed_at<clock_timestamp()-interval '20 minutes' then
   raise exception 'media_scan_byte_claim_stale'; end if;
 b:=private.media_scan_brand_binding(j);
 if b is null then raise exception 'media_scan_byte_binding_unavailable'; end if;
 insert into private.media_scan_byte_observations(job_id,worker_id,attempt_count,claimed_at,job_created_at,binding)
 values(j.id,p_worker_id,j.attempt_count,j.claimed_at,j.created_at,b)
 on conflict(job_id,attempt_count) do nothing returning id into observation;
 if observation is null then
   select id into observation from private.media_scan_byte_observations
   where job_id=j.id and attempt_count=j.attempt_count and worker_id=p_worker_id
     and claimed_at=j.claimed_at and job_created_at=j.created_at and binding=b;
 end if;
 if observation is null then raise exception 'media_scan_byte_observation_conflict'; end if;
 return observation;
end $$;

create or replace function public.record_media_scan_byte_receipt(p_observation_id uuid,p_job_id uuid,p_worker_id text,p_sha256 text,p_size_bytes bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare s private.media_scan_byte_observations%rowtype; j public.media_scan_jobs%rowtype; receipt uuid; result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'media_scan_service_role_required'; end if;
 perform private.platform_brand_retention_lock();
 if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>536870912 then
   raise exception 'media_scan_byte_digest_invalid'; end if;
 select * into s from private.media_scan_byte_observations where id=p_observation_id;
 if not found or s.job_id is distinct from p_job_id or s.worker_id is distinct from p_worker_id then
   raise exception 'media_scan_byte_observation_mismatch'; end if;
 select * into j from public.media_scan_jobs where id=s.job_id for share nowait;
 if not found or j.created_at<>s.job_created_at or j.attempt_count<>s.attempt_count
   or j.status<>'clean' or j.completed_at is null or j.completed_at<s.observed_at
   or j.completed_at>=s.claimed_at+interval '20 minutes'
   or clock_timestamp()>=s.claimed_at+interval '20 minutes'
   or j.claimed_by is distinct from s.worker_id or j.claimed_at is distinct from s.claimed_at
   or j.scanner_provider is distinct from 'clamav'
   or nullif(j.scanner_version,'') is null or nullif(j.signature_version,'') is null
   or j.signature_version='unknown' or j.finding_name is not null or j.error_message is not null
   or (j.metadata->>'targetPropagationComplete')='false'
   or not exists(select 1 from public.platform_brand_assets a where a.id::text=j.target_id
      and a.scan_status='clean' and a.scan_provider='clamav' and a.scanned_at=j.completed_at and a.scan_error is null)
   or private.media_scan_brand_binding(j) is distinct from s.binding then
   raise exception 'media_scan_byte_result_stale'; end if;
 result:=private.media_scan_byte_result_binding(j);
 insert into private.media_scan_byte_receipts(observation_id,sha256,size_bytes,result_binding)
 values(s.id,p_sha256,p_size_bytes,result) on conflict(observation_id) do nothing returning id into receipt;
 if receipt is null then
   select id into receipt from private.media_scan_byte_receipts where observation_id=s.id
   and sha256=p_sha256 and size_bytes=p_size_bytes and result_binding=result;
 end if;
 if receipt is null then raise exception 'media_scan_byte_receipt_conflict'; end if;
 return receipt;
end $$;

create or replace function private.platform_brand_scan_byte_receipt_matches(p_receipt_id uuid,p_binding jsonb,p_origin_sha256 text,p_origin_size_bytes bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare r private.media_scan_byte_receipts%rowtype; s private.media_scan_byte_observations%rowtype; j public.media_scan_jobs%rowtype;
begin
 perform private.platform_brand_retention_lock();
 select * into r from private.media_scan_byte_receipts where id=p_receipt_id;
 if not found or r.sha256 is distinct from p_origin_sha256 or r.size_bytes is distinct from p_origin_size_bytes then return false; end if;
 select * into s from private.media_scan_byte_observations where id=r.observation_id;
 if not found or s.binding is distinct from p_binding then return false; end if;
 select * into j from public.media_scan_jobs where id=s.job_id for share nowait;
 return coalesce(found and j.status='clean' and j.claimed_at=s.claimed_at and j.claimed_by=s.worker_id
   and exists(select 1 from public.platform_brand_assets a where a.id::text=j.target_id
      and a.scan_status='clean' and a.scan_provider='clamav' and a.scanned_at=j.completed_at and a.scan_error is null)
   and private.media_scan_byte_result_binding(j)=r.result_binding
   and private.media_scan_brand_binding(j)=p_binding,false);
exception when lock_not_available then return false;
end $$;

create or replace function public.list_deleted_content_expiry_work() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ids uuid[]; stages uuid[]; enabled boolean;
begin
 select text_expiry_enabled into enabled from private.deleted_content_retention_settings;
 if not enabled then return jsonb_build_object('enabled',false,'deletionIds','[]'::jsonb,'stageIds','[]'::jsonb); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000';
 end if;
 perform pg_advisory_xact_lock(176214,31);
 select array_agg(id) into ids from (
   select r.id from private.deleted_content_records r
   left join private.deleted_content_work_dispatch q on q.kind='text' and q.work_id=r.id
   where r.target_type<>'platform_brand_asset' and r.expires_at<=clock_timestamp() and (q.work_id is null or q.next_attempt_at<=clock_timestamp())
   order by coalesce(q.next_attempt_at,r.expires_at),r.id limit 20
 ) x;
 select array_agg(id) into stages from (
   select s.id from private.deleted_content_media_stages s
   left join private.deleted_content_work_dispatch q on q.kind='stage' and q.work_id=s.id
   where s.deletion_id is null and s.reconcile_after<=clock_timestamp()
     and (q.work_id is null or q.next_attempt_at<=clock_timestamp())
     and exists(select 1 from private.deleted_content_retention_settings where media_staging_enabled)
   order by coalesce(q.next_attempt_at,s.reconcile_after),s.id limit 20
 ) x;
 insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
 select 'text',unnest(ids),clock_timestamp()+interval '1 minute'
 on conflict(kind,work_id) do update set next_attempt_at=excluded.next_attempt_at;
 insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
 select 'stage',unnest(stages),clock_timestamp()+interval '1 minute'
 on conflict(kind,work_id) do update set next_attempt_at=excluded.next_attempt_at;
 return jsonb_build_object('enabled',true,'deletionIds',coalesce(to_jsonb(ids),'[]'::jsonb),'stageIds',coalesce(to_jsonb(stages),'[]'::jsonb));
end $$;

create or replace function public.deleted_content_expiry_readiness() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare inventory jsonb; uncovered bigint; attached_stages bigint; secondary_count bigint; brand_count bigint;
 outstanding_scans bigint; exhausted_scans bigint; unknown_archives bigint:=0; unsupported_soft_archives bigint:=0;
 unproven_stages bigint; blockers text[]:='{}';
 settings private.deleted_content_retention_settings%rowtype;
 qualification private.deleted_content_rollout_qualification%rowtype;
 heartbeat timestamptz; references_ready boolean; source_guards_ready boolean; protocol_ready boolean; capture_guards_ready boolean;
 brand_uncovered bigint; brand_proof_missing bigint; brand_delegation_missing bigint; brand_guards boolean; brand_qualified boolean;
 brand_settings private.platform_brand_retention_settings%rowtype; brand_health private.platform_brand_retention_worker_health%rowtype;
begin
 perform private.platform_brand_retention_lock();
 select * into brand_settings from private.platform_brand_retention_settings where singleton;
 select * into brand_health from private.platform_brand_retention_worker_health where singleton;
 brand_guards:=private.deleted_content_brand_guards_ready();
 brand_qualified:=private.deleted_content_brand_transport_qualified();
 select * into settings from private.deleted_content_retention_settings where singleton;
 if not found then blockers:=array_append(blockers,'retention_settings_missing'); end if;
 select * into qualification from private.deleted_content_rollout_qualification where singleton;
 select last_completed_at into heartbeat from private.deleted_content_worker_health where singleton;
 with sources as (
   select 'creator_video'::text kind,to_jsonb(v) source from public.videos v
   union all select 'social_attachment',to_jsonb(a) from public.social_attachments a
   union all select 'platform_brand_asset',to_jsonb(a) from public.platform_brand_assets a
 ), classified as (
   select kind,coalesce(source->>'storage_provider','unknown') provider,
     case when kind='platform_brand_asset' then private.deleted_content_brand_source_coverage(source)
      else private.deleted_content_source_coverage(kind,source) end coverage from sources
 ), groups as (
   select kind,provider,coverage,count(*) n from classified group by kind,provider,coverage
 )
 select coalesce(jsonb_agg(jsonb_build_object('targetType',kind,'provider',provider,'coverage',coverage,'count',n)
   order by kind,provider,coverage),'[]'::jsonb),
   coalesce(sum(n) filter(where coverage not in ('eligible_r2_original','retained_r2_original','metadata_only','reviewed_external_reference','brand_verified_original','brand_claimed_original')),0)
 into inventory,uncovered from groups;
 select (select count(*) from public.video_renditions r left join public.videos v on v.id=r.video_id
     where not private.deleted_content_original_rendition_alias(to_jsonb(r),to_jsonb(v)))
   +(select count(*) from public.media_renditions where source_type='creator_video' or video_id is not null)
   +(select count(*) from public.media_transcode_jobs where source_type='creator_video') into secondary_count;
 select count(*),count(*) filter(where private.deleted_content_brand_source_coverage(to_jsonb(a),false)<>'brand_exact_incarnation'),
  count(*) filter(where private.deleted_content_brand_source_coverage(to_jsonb(a)) not in ('brand_verified_original','brand_claimed_original'))
 into brand_count,brand_uncovered,brand_proof_missing from public.platform_brand_assets a;
 select count(*) into brand_delegation_missing from private.deleted_content_records d
 where d.target_type='platform_brand_asset' and not exists(select 1 from private.deleted_content_brand_delegations b
  join private.platform_brand_object_incarnations r on r.asset_id=b.asset_id
  where b.deletion_id=d.id and d.target_id=b.asset_id::text and d.author=b.owner_id and d.source_created_at=b.source_created_at
   and d.content is null and (b.owner_id,b.source_created_at,b.removed_at,b.retain_until)
    is not distinct from (r.owner_id,r.source_created_at,r.removed_at,r.retain_until));
 if exists(select 1 from pg_catalog.pg_attribute where attrelid='private.deleted_content_records'::regclass
   and attname='media_disposition' and not attisdropped) then
   execute $query$select count(*) from private.deleted_content_records d
     where d.target_type in ('creator_video','social_attachment') and
       (d.media_disposition='unknown' or (d.media_disposition='reviewed_external_reference' and not private.deleted_content_external_archive_supported(d.id)) or (d.media_disposition='retained_original' and not exists(
         select 1 from private.deleted_media_key_retirements registry
         join private.deleted_content_media_stages s on s.id=registry.stage_id
         where registry.deletion_id=d.id and s.deletion_id=d.id and registry.status in ('retained','claimed')
           and registry.target_type=d.target_type and registry.target_id=d.target_id and registry.author=d.author
           and registry.provider=s.provider and registry.bucket=s.bucket and registry.object_key=s.object_key
       )))$query$ into unknown_archives;
   execute $query$select count(*) from private.deleted_content_records d
     where d.target_type in ('creator_video','social_attachment') and d.deletion_kind='soft'
       and not private.deleted_content_soft_media_coverage(d.id)$query$ into unsupported_soft_archives;
 end if;
 select count(*) into unproven_stages from private.deleted_content_media_stages s
 where s.deletion_id is not null and not exists(select 1 from private.deleted_media_key_retirements r
   where r.stage_id=s.id and ((r.status in ('retained','claimed') and r.deletion_id=s.deletion_id)
     or r.status='cleanup_claimed'));
 select count(*),count(*) filter(where status in ('scan_failed','manual_review') or attempt_count>=max_attempts)
 into outstanding_scans,exhausted_scans from public.media_scan_jobs
 where target_table in ('videos','social_attachments','video_renditions','platform_brand_assets')
   and status not in ('clean','malware_detected','quarantined');
 select count(*) into attached_stages from private.deleted_content_media_stages s
 left join private.deleted_media_key_retirements registry on registry.stage_id=s.id
 where (s.deletion_id is null or registry.status='staged') and (
   (s.target_type='creator_video' and exists(select 1 from public.videos v where v.id::text=s.target_id
     and s.object_key in (coalesce(nullif(v.storage_object_key,''),v.storage_path,''),coalesce(v.thumb_storage_path,''))))
   or (s.target_type='social_attachment' and exists(select 1 from public.social_attachments a where a.id::text=s.target_id
     and s.object_key=coalesce(nullif(a.storage_object_key,''),a.storage_path,'')))
 );
 references_ready:=private.deleted_media_reference_coverage_ready();
 source_guards_ready:=not exists(select 1 from unnest(array['public.videos'::regclass,'public.social_attachments'::regclass]) rel
   where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=rel
     and t.tgfoid='private.guard_deleted_content_source_coverage()'::regprocedure
     and t.tgenabled in ('O','A') and (t.tgtype::integer & 23)=23 and t.tgqual is null))
   and not exists(select 1 from unnest(array['public.video_renditions'::regclass,'public.media_renditions'::regclass,
     'public.media_transcode_jobs'::regclass]) rel
     where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=rel
       and t.tgfoid='private.guard_deleted_content_secondary_coverage()'::regprocedure
       and t.tgenabled in ('O','A') and (t.tgtype::integer & 23)=23 and t.tgqual is null))
   and brand_guards;
 protocol_ready:=to_regprocedure('public.reconcile_deleted_content_stage(uuid)') is not null
   and to_regprocedure('public.read_deleted_content_stage_cleanup_claim(uuid)') is not null
   and to_regprocedure('public.record_deleted_content_stage_cleanup_result(uuid,text)') is not null
   and to_regprocedure('public.list_deleted_content_stage_cleanup_work()') is not null
   and to_regprocedure('public.delete_retained_content(text,uuid,text,text,text,timestamptz)') is not null
   and to_regprocedure('private.cleanup_expired_deleted_attachment_source(uuid)') is not null
   and to_regprocedure('private.stage_deleted_content_media_internal(text,text,text,text,text,uuid)') is not null
   and exists(select 1 from pg_catalog.pg_attribute where attrelid='private.deleted_content_records'::regclass
     and attname='media_disposition' and not attisdropped);
 capture_guards_ready:=not exists(select 1 from unnest(array[
   'public.profile_posts'::regclass,'public.profile_post_comments'::regclass,'public.creator_video_comments'::regclass,
   'public.chat_messages'::regclass,'public.watch_party_room_messages'::regclass,'public.videos'::regclass,
   'public.social_attachments'::regclass,'public.platform_brand_assets'::regclass]) rel
   where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=rel
     and t.tgfoid='private.capture_deleted_content_trigger()'::regprocedure
     and t.tgenabled in ('O','A') and (t.tgtype::integer & 11)=11 and t.tgqual is null))
   and not exists(select 1 from pg_catalog.pg_attribute a
     where a.attrelid=any(array['public.profile_posts'::regclass,'public.profile_post_comments'::regclass,
       'public.creator_video_comments'::regclass,'public.chat_messages'::regclass,'public.watch_party_room_messages'::regclass,
       'public.videos'::regclass,'public.social_attachments'::regclass,'public.platform_brand_assets'::regclass])
       and a.attname='deleted_at' and not a.attisdropped
       and not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=a.attrelid
         and t.tgfoid='private.capture_deleted_content_trigger()'::regprocedure
         and t.tgenabled in ('O','A') and (t.tgtype::integer & 19)=19 and t.tgqual is null
         and (cardinality(t.tgattr::smallint[])=0 or a.attnum=any(t.tgattr::smallint[]))));
 if uncovered>0 then blockers:=array_append(blockers,'current_media_inventory_not_fully_covered'); end if;
 if secondary_count>0 then blockers:=array_append(blockers,'secondary_media_cleanup_not_covered'); end if;
 if brand_uncovered>0 then blockers:=array_append(blockers,'platform_brand_incarnation_coverage_incomplete'); end if;
 if brand_proof_missing>0 then blockers:=array_append(blockers,'platform_brand_exact_scan_proof_incomplete'); end if;
 if brand_delegation_missing>0 then blockers:=array_append(blockers,'platform_brand_delegation_incomplete'); end if;
 if brand_count>0 and not brand_qualified then blockers:=array_append(blockers,'platform_brand_transport_not_qualified'); end if;
 if brand_count>0 and not coalesce(brand_settings.expiry_enabled,false) then blockers:=array_append(blockers,'platform_brand_expiry_not_enabled'); end if;
 if brand_count>0 and not coalesce(brand_settings.batch_enabled,false) then blockers:=array_append(blockers,'platform_brand_batch_not_enabled'); end if;
 if brand_count>0 and (brand_health.last_completed_at is null or brand_health.last_completed_at<clock_timestamp()-interval '15 minutes'
  or brand_health.last_completed_at>clock_timestamp() or not coalesce(brand_health.qualified,false))
 then blockers:=array_append(blockers,'platform_brand_worker_completion_missing_or_stale'); end if;
 if outstanding_scans>0 then blockers:=array_append(blockers,'outstanding_scan_references_require_resolution'); end if;
 if unknown_archives>0 or unproven_stages>0 then blockers:=array_append(blockers,'historical_media_provenance_requires_resolution'); end if;
 if unsupported_soft_archives>0 then blockers:=array_append(blockers,'unsupported_soft_media_archive_cleanup'); end if;
 if attached_stages>0 then blockers:=array_append(blockers,'attached_legacy_stages_require_fresh_content_delete_intent'); end if;
 if not private.deleted_content_external_guards_ready() then blockers:=array_append(blockers,'external_reference_ownership_guard_coverage_incomplete'); end if;
 if not references_ready or not source_guards_ready then blockers:=array_append(blockers,'media_admission_guard_coverage_incomplete'); end if;
 if not capture_guards_ready then blockers:=array_append(blockers,'content_capture_guard_coverage_incomplete'); end if;
 if not protocol_ready then blockers:=array_append(blockers,'recovery_protocol_missing'); end if;
 if not settings.legacy_object_deletes_blocked then blockers:=array_append(blockers,'legacy_object_delete_gate_open'); end if;
 if qualification.legacy_delete_drain_evidence is null or qualification.qualified_at is null
   or settings.legacy_object_deletes_blocked_at is null
   or qualification.qualified_at<settings.legacy_object_deletes_blocked_at then
   blockers:=array_append(blockers,'pre_gate_provider_requests_not_qualified_drained');
 end if;
 if qualification.source_revision is null or qualification.qualified_at is null or qualification.qualified_at>clock_timestamp()
   or qualification.client_enforcement_evidence is null then blockers:=array_append(blockers,'consumer_rollout_not_qualified'); end if;
 if qualification.worker_schedule_evidence is null then blockers:=array_append(blockers,'worker_schedule_not_qualified'); end if;
 if qualification.origin_cleanup_evidence is null then blockers:=array_append(blockers,'origin_cleanup_not_qualified'); end if;
 if heartbeat is null or heartbeat<clock_timestamp()-interval '15 minutes' or heartbeat>clock_timestamp() then
   blockers:=array_append(blockers,'worker_completion_missing_or_stale');
 end if;
 return jsonb_build_object(
   'ready',cardinality(blockers)=0,'blockers',to_jsonb(blockers),
   'flags',to_jsonb(settings)-'singleton','inventory',inventory,'uncoveredSourceCount',uncovered,
   'secondaryMediaSourceCount',secondary_count,'platformBrandMediaSourceCount',brand_count,
   'outstandingScanReferencesCount',outstanding_scans,'failedOrExhaustedScanReferencesCount',exhausted_scans,
   'unprovenMediaArchiveCount',unknown_archives,'unprovenFinalizedStageCount',unproven_stages,
   'unsupportedSoftMediaArchiveCount',unsupported_soft_archives,
   'platformBrandMediaCoverage','delegated_exact_brand_lifecycle','secondaryMediaCoverage','unsupported',
   'platformBrandUncoveredIncarnationCount',brand_uncovered,'platformBrandMissingCurrentScanProofCount',brand_proof_missing,
   'platformBrandUnboundArchiveCount',brand_delegation_missing,'platformBrandGuardCoverage',brand_guards,
   'platformBrandTransportQualified',brand_qualified,'platformBrandBatchEnabled',brand_settings.batch_enabled,
   'platformBrandExpiryEnabled',brand_settings.expiry_enabled,
   'platformBrandWorkerLastCompletedAt',brand_health.last_completed_at,'platformBrandWorkerEnabledAtCompletion',brand_health.enabled,
   'platformBrandWorkerCompletionProves','bounded_brand_pass_only_not_provider_qualification',
   'attachedLegacyStageCount',attached_stages,'referenceGuardCoverage',references_ready,
   'sourceAdmissionGuardCoverage',source_guards_ready,'protocolInstalled',protocol_ready,
   'contentCaptureGuardCoverage',capture_guards_ready,
   'retentionScope','verified_private_r2_originals_reviewed_external_text_and_exact_brand',
   'reviewedExternalReferenceSourceCount',(select count(*) from public.videos v
     where private.deleted_content_source_coverage('creator_video',to_jsonb(v))='reviewed_external_reference'),
   'reviewedExternalReferenceArchiveCount',(select count(*) from private.deleted_content_records d
     where d.media_disposition='reviewed_external_reference' and private.deleted_content_external_archive_supported(d.id)),
   'externalReferencePhysicalDeletionAllowed',false,'supabaseDirectStorageCoverage','exact_brand_only_other_direct_storage_unsupported',
   'legacyObjectDeleteBehavior','object_only_requests_rejected_after_gate_closure',
   'unattachedUploadCleanupCoverage','outside_retained_original_protocol',
   'physicalDeletionAllowed',false,'perObjectIrreversibleClaimRequired',true,
   'permanentPhysicalAbsenceGuaranteed',false,
   'workerLastCompletedAt',heartbeat,'workerCompletionProves','bounded_worker_pass_only',
   'scheduleObservedByDatabase',false,'rolloutEvidenceAuthority','operator_assertions_not_independently_verified',
   'sourceRevision',qualification.source_revision,'qualifiedAt',qualification.qualified_at);
end $$;


-- Source and Storage UPDATE take row locks before their BEFORE triggers.
-- Never wait on those rows while owning Brand advisory 30: fail with 55P03
-- instead. All actor/session/owner/hold/identity checks are unchanged.
create or replace function private.guard_platform_brand_retained_asset() returns trigger
language plpgsql security definer set search_path='' as $$
declare o storage.objects%rowtype; r private.platform_brand_object_incarnations%rowtype; t timestamptz; referenced boolean;
begin
 perform private.platform_brand_retention_lock();
 if tg_op='DELETE' then raise exception 'brand_retention_soft_delete_required'; end if;
 if tg_op='INSERT' then
   if exists(select 1 from private.platform_brand_object_incarnations where asset_id=new.id
     or (provider=new.storage_provider and bucket=new.storage_bucket and object_key=new.storage_object_key)) then
     raise exception 'brand_retention_key_reuse_forbidden'; end if;
   if new.deleted_at is not null then raise exception 'brand_insert_tombstone_forbidden'; end if;
   if new.storage_provider='supabase' then
     if new.storage_object_key is distinct from new.storage_path then raise exception 'brand_exact_storage_path_required'; end if;
     select * into o from storage.objects where bucket_id=new.storage_bucket and name=new.storage_object_key for update nowait;
     if o.id is null or nullif(to_jsonb(o)->>'version','') is null then raise exception 'brand_storage_incarnation_required'; end if;
   end if;
   insert into private.platform_brand_object_incarnations(asset_id,owner_id,source_created_at,provider,bucket,object_key,storage_path,storage_object_id,storage_version)
   values(new.id,new.owner_user_id,new.created_at,new.storage_provider,new.storage_bucket,new.storage_object_key,new.storage_path,o.id,nullif(to_jsonb(o)->>'version',''));
 else
   if (new.id,new.owner_user_id,new.created_at,new.storage_provider,new.storage_bucket,new.storage_object_key,new.storage_path)
     is distinct from (old.id,old.owner_user_id,old.created_at,old.storage_provider,old.storage_bucket,old.storage_object_key,old.storage_path) then
     raise exception 'brand_retention_asset_identity_immutable'; end if;
   if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then raise exception 'brand_retention_tombstone_permanent'; end if;
   if old.deleted_at is null and new.deleted_at is not null then
     referenced:=exists(select 1 from public.platform_brand_profiles p where old.id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id]));
     if to_regclass('public.platform_brand_publications') is not null then
       referenced:=referenced or exists(select 1 from public.platform_brand_publications p where old.id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id]));
     end if;
     -- Preserve the established, audited reviewer safety archive, not creator
     -- self-review, a caller-supplied context alone, or a service-role bypass.
     if referenced then
     if not coalesce(
       auth.uid() is not null
       and current_setting('app.platform_brand_review_context',true)='review_platform_brand_asset'
       and new.moderation_status='removed' and new.asset_state='archived'
       and new.moderated_by=auth.uid()::text and new.moderated_at is not null
       and length(btrim(coalesce(new.moderation_reason,'')))>=6
       and (public.has_platform_role(array['owner'::text,'operator'::text])
         or public.has_platform_permission('content_moderation')
         or public.has_platform_permission('reports_review')),false) then
       raise exception 'brand_asset_in_use';
     end if;
     end if;
     t:=clock_timestamp(); new.deleted_at:=t; new.asset_state:='archived';
     update private.platform_brand_object_incarnations set removed_at=t,retain_until=t+interval '720 hours',removal_clock='server_observed_removal' where asset_id=old.id and removed_at is null;
   end if;
 end if;
 return new;
end $$;

create or replace function public.remove_platform_brand_asset(p_asset_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.platform_brand_assets%rowtype;
begin
 perform private.platform_brand_retention_lock();
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
   or public.is_account_access_restricted(auth.uid()::text) is distinct from false
   or not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
     where u.id=auth.uid() and u.deleted_at is null and s.id::text=auth.jwt()->>'session_id'
     and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception 'brand_remove_current_session_required'; end if;
 select * into a from public.platform_brand_assets where id=p_asset_id and owner_user_id=auth.uid()::text for update nowait;
 if a.id is null then raise exception 'brand_remove_owner_required'; end if;
 -- Preserve the existing owner UPDATE policy's Premium/provider/path authority,
 -- and recheck session expiry after any row-lock wait. No new staff/official-owner
 -- impersonation route is introduced by this SECURITY DEFINER endpoint.
 if public.whole_app_exact_current_session_authority_internal() is distinct from true
   or public.is_account_access_restricted(auth.uid()::text) is distinct from false
   or not exists(select 1 from auth.users u join auth.sessions session_row on session_row.user_id=u.id
     where u.id=auth.uid() and u.deleted_at is null and session_row.id::text=auth.jwt()->>'session_id'
     and (session_row.not_after is null or session_row.not_after>clock_timestamp()))
   or public.has_active_premium_creator_tool_access(a.owner_user_id) is distinct from true
   or lower(btrim(coalesce(a.storage_provider,'')))<>'supabase'
   or a.storage_bucket<>'platform-brand-assets' or a.storage_object_key is distinct from a.storage_path
   or (storage.foldername(a.storage_path))[1] is distinct from a.owner_user_id then
   raise exception 'brand_remove_current_owner_access_required'; end if;
 if a.deleted_at is null then
   if exists(select 1 from public.platform_brand_profiles p where a.id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id])) then
     raise exception 'brand_asset_in_use';
   end if;
   if to_regclass('public.platform_brand_publications') is not null then
     if exists(select 1 from public.platform_brand_publications p where a.id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id])) then
       raise exception 'brand_asset_in_use';
     end if;
   end if;
   update public.platform_brand_assets set deleted_at=clock_timestamp(),asset_state='archived' where id=a.id returning * into a;
 end if;
 return jsonb_build_object('assetId',a.id,'deletedAt',a.deleted_at);
end $$;

commit;
