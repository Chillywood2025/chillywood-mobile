begin;
-- Source only: observed bytes are not clean/provenance authority on their own.
-- Existing claim, completion, propagation, retry and recovery APIs are unchanged.
create table private.media_scan_byte_observations (
 id uuid primary key default gen_random_uuid(), job_id uuid not null,
 worker_id text not null, attempt_count integer not null, claimed_at timestamptz not null,
 job_created_at timestamptz not null, binding jsonb not null,
 observed_at timestamptz not null default clock_timestamp(),
 unique(job_id,attempt_count)
);
create table private.media_scan_byte_receipts (
 id uuid primary key default gen_random_uuid(),
 observation_id uuid not null unique references private.media_scan_byte_observations(id),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=536870912),
 result_binding jsonb not null, recorded_at timestamptz not null default clock_timestamp()
);
create function private.media_scan_byte_immutable() returns trigger
language plpgsql set search_path='' as $$ begin
 raise exception 'media_scan_byte_receipt_immutable';
end $$;
do $$ declare t text; begin
 foreach t in array array['media_scan_byte_observations','media_scan_byte_receipts'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger immutable before update or delete on private.%I for each row execute function private.media_scan_byte_immutable()',t);
 execute format('create trigger no_truncate before truncate on private.%I for each statement execute function private.media_scan_byte_immutable()',t);
 end loop;
end $$;

-- The source and storage incarnation must independently still exist. Lock both
-- while observing/recording so a concurrent replacement cannot cross the check.
create function private.media_scan_brand_binding(p_job public.media_scan_jobs) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.platform_brand_assets%rowtype; o storage.objects%rowtype;
begin
 if p_job.target_table<>'platform_brand_assets'
   or p_job.storage_provider<>'supabase' or p_job.storage_bucket<>'platform-brand-assets' then return null; end if;
 select * into a from public.platform_brand_assets where id::text=p_job.target_id for share nowait;
 if not found or a.created_at>p_job.created_at or a.asset_type is distinct from p_job.target_column
   or a.owner_user_id is distinct from p_job.owner_user_id
   or a.storage_provider is distinct from p_job.storage_provider
   or a.storage_bucket is distinct from p_job.storage_bucket
   or a.storage_object_key is distinct from p_job.storage_object_key
   or a.storage_path is distinct from p_job.storage_object_key then return null; end if;
 select * into o from storage.objects where bucket_id=p_job.storage_bucket and name=p_job.storage_object_key for share nowait;
 if not found or nullif(to_jsonb(o)->>'version','') is null then return null; end if;
 return jsonb_build_object('assetId',a.id,'ownerId',a.owner_user_id,
   'sourceCreatedAt',to_char(a.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'provider',a.storage_provider,'bucket',a.storage_bucket,'objectKey',a.storage_object_key,
   'storageObjectId',o.id,'storageVersion',to_jsonb(o)->>'version');
exception when lock_not_available then return null;
end $$;

create function private.media_scan_byte_result_binding(p_job public.media_scan_jobs) returns jsonb
language sql immutable set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('id',p_job.id,'createdAt',p_job.created_at,'attempt',p_job.attempt_count,
 'status',p_job.status,'completedAt',p_job.completed_at,'updatedAt',p_job.updated_at,'claimedAt',p_job.claimed_at,'claimedBy',p_job.claimed_by,
 'provider',p_job.scanner_provider,'scannerVersion',p_job.scanner_version,'signatureVersion',p_job.signature_version,
 'propagated',p_job.metadata->'targetPropagationComplete','finding',p_job.finding_name,'error',p_job.error_message);
$$;

create function public.begin_media_scan_byte_observation(p_job_id uuid,p_worker_id text,p_attempt_count integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.media_scan_jobs%rowtype; b jsonb; observation uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'media_scan_service_role_required'; end if;
 perform pg_advisory_xact_lock(176214,30);
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

create function public.record_media_scan_byte_receipt(p_observation_id uuid,p_job_id uuid,p_worker_id text,p_sha256 text,p_size_bytes bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare s private.media_scan_byte_observations%rowtype; j public.media_scan_jobs%rowtype; receipt uuid; result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'media_scan_service_role_required'; end if;
 perform pg_advisory_xact_lock(176214,30);
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

create function private.platform_brand_scan_byte_receipt_matches(p_receipt_id uuid,p_binding jsonb,p_origin_sha256 text,p_origin_size_bytes bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare r private.media_scan_byte_receipts%rowtype; s private.media_scan_byte_observations%rowtype; j public.media_scan_jobs%rowtype;
begin
 perform pg_advisory_xact_lock(176214,30);
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

revoke all on function private.media_scan_byte_immutable() from public,anon,authenticated,service_role;
revoke all on function private.media_scan_brand_binding(public.media_scan_jobs) from public,anon,authenticated,service_role;
revoke all on function private.media_scan_byte_result_binding(public.media_scan_jobs) from public,anon,authenticated,service_role;
revoke all on function private.platform_brand_scan_byte_receipt_matches(uuid,jsonb,text,bigint) from public,anon,authenticated,service_role;
revoke all on function public.begin_media_scan_byte_observation(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.record_media_scan_byte_receipt(uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.begin_media_scan_byte_observation(uuid,text,integer) to service_role;
grant execute on function public.record_media_scan_byte_receipt(uuid,uuid,text,text,bigint) to service_role;

commit;
