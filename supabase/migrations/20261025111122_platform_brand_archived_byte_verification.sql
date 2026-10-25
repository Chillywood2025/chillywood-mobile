begin;
-- Archived-only evidence, under the existing trusted scanner/service boundary.
-- No ordinary scan job, source scan state, delivery permission, tombstone,
-- removal clock, expiry claim, provider operation or activation is created.
alter table private.platform_brand_retention_settings
 add column archived_verification_enabled boolean not null default false;

create table private.platform_brand_archived_requests (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null unique references private.platform_brand_object_incarnations(asset_id),
 archive_binding jsonb not null check(jsonb_typeof(archive_binding)='object'),
 requested_at timestamptz not null default clock_timestamp()
);
create table private.platform_brand_archived_attempts (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references private.platform_brand_archived_requests(id),
 attempt_number integer not null check(attempt_number between 1 and 3),
 worker_id text not null check(worker_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
 claim_token uuid not null unique default gen_random_uuid(),
 archive_binding jsonb not null,
 claimed_at timestamptz not null,
 expires_at timestamptz not null,
 unique(request_id,attempt_number),
 check(expires_at=claimed_at+interval '20 minutes')
);
create table private.platform_brand_archived_results (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null unique references private.platform_brand_archived_attempts(id),
 result jsonb not null check(jsonb_typeof(result)='object'),
 completed_at timestamptz not null default clock_timestamp()
);
create table private.platform_brand_archived_receipts (
 id uuid primary key default gen_random_uuid(),
 result_id uuid not null unique references private.platform_brand_archived_results(id),
 recorded_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['platform_brand_archived_requests','platform_brand_archived_attempts',
  'platform_brand_archived_results','platform_brand_archived_receipts'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger archived_evidence_immutable before update or delete on private.%I for each row execute function private.platform_brand_retention_immutable()',t);
  execute format('create trigger archived_evidence_no_truncate before truncate on private.%I for each statement execute function private.platform_brand_retention_immutable()',t);
 end loop;
end $$;

create function private.platform_brand_archived_service_required() returns void
language plpgsql security definer set search_path='' as $$ begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'archived_brand_service_role_required'; end if;
end $$;

-- This snapshot intentionally preserves BOTH source deleted_at and the original
-- conservative incarnation removal clock. They need not equal for legacy rows.
-- The absent form is private and usable only AFTER an already-issued claim.
create function private.platform_brand_archived_snapshot(p_asset_id uuid,p_claimed_absent boolean default false)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare a public.platform_brand_assets%rowtype; r private.platform_brand_object_incarnations%rowtype;
 o storage.objects%rowtype; b jsonb;
begin
 perform private.platform_brand_retention_lock();
 select * into a from public.platform_brand_assets where id=p_asset_id for share nowait;
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id for share nowait;
 if a.id is null or r.asset_id is null or a.deleted_at is null or a.asset_state<>'archived'
  or a.file_size_bytes is null or a.file_size_bytes not between 1 and 536870912
  or r.removed_at is null or r.retain_until is distinct from r.removed_at+interval '720 hours'
  or r.removal_clock is null or r.provider<>'supabase' or r.bucket<>'platform-brand-assets'
  or r.object_key is distinct from r.storage_path or r.storage_object_id is null or nullif(r.storage_version,'') is null
  or (a.owner_user_id,a.created_at,a.storage_provider,a.storage_bucket,a.storage_object_key,a.storage_path)
   is distinct from (r.owner_id,r.source_created_at,r.provider,r.bucket,r.object_key,r.storage_path)
  or exists(select 1 from private.platform_brand_object_incarnations x where x.asset_id<>r.asset_id
   and x.provider=r.provider and x.bucket=r.bucket and x.object_key=r.object_key)
 then return null; end if;
 select * into o from storage.objects where bucket_id=r.bucket and name=r.object_key for share nowait;
 if p_claimed_absent then
  if o.id is not null or not exists(select 1 from private.platform_brand_expiry_claims where asset_id=r.asset_id) then return null; end if;
 elsif o.id is distinct from r.storage_object_id or to_jsonb(o)->>'version' is distinct from r.storage_version
  or o.metadata->>'size' is distinct from a.file_size_bytes::text then
  return null;
 end if;
 b:=jsonb_build_object('assetId',r.asset_id,'ownerId',r.owner_id,
  'sourceCreatedAt',to_char(r.source_created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'provider',r.provider,'bucket',r.bucket,'objectKey',r.object_key,
  'storageObjectId',r.storage_object_id,'storageVersion',r.storage_version);
 return jsonb_build_object('binding',b,'assetType',a.asset_type,'assetState',a.asset_state,'expectedSizeBytes',a.file_size_bytes,
  'sourceDeletedAt',to_char(a.deleted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'incarnationObservedAt',to_char(r.observed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'removedAt',to_char(r.removed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'retainUntil',to_char(r.retain_until at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'removalClock',r.removal_clock);
end $$;

create function private.platform_brand_archived_read_allowed(p_asset_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype;
begin
 perform private.platform_brand_retention_lock();
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 return coalesce(r.asset_id is not null
  and not exists(select 1 from private.platform_brand_expiry_claims where asset_id=p_asset_id)
  and not exists(select 1 from public.media_scan_jobs where target_table='platform_brand_assets' and target_id=p_asset_id::text)
  and not exists(select 1 from public.legal_holds h where h.status='active'
   and private.deleted_content_hold_matches(h.target_type,h.target_id,'platform_brand_asset',p_asset_id::text,r.owner_id,null,null))
  and private.deleted_content_brand_guards_ready()
  and private.platform_brand_retention_references_clear(p_asset_id),false);
end $$;

create function public.request_platform_brand_archived_verification(p_asset_id uuid,p_expected_binding jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; request_id uuid; existing private.platform_brand_archived_requests%rowtype;
begin
 perform private.platform_brand_archived_service_required();
 perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.platform_brand_retention_settings where archived_verification_enabled) then
  raise exception 'archived_brand_verification_disabled'; end if;
 snapshot:=private.platform_brand_archived_snapshot(p_asset_id);
 if snapshot is null or snapshot->'binding' is distinct from p_expected_binding
  or not private.platform_brand_archived_read_allowed(p_asset_id) then
  raise exception 'archived_brand_exact_unheld_incarnation_required'; end if;
 select * into existing from private.platform_brand_archived_requests where asset_id=p_asset_id;
 if found then
  if existing.archive_binding is distinct from snapshot then raise exception 'archived_brand_request_conflict'; end if;
  return existing.id;
 end if;
 if exists(select 1 from private.platform_brand_object_proofs where asset_id=p_asset_id) then
  raise exception 'archived_brand_existing_proof_preserved'; end if;
 insert into private.platform_brand_archived_requests(asset_id,archive_binding)
 values(p_asset_id,snapshot) returning id into request_id;
 return request_id;
end $$;

create function private.platform_brand_archived_attempt_current(p_attempt_id uuid,p_claim_token uuid,p_worker_id text)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare a private.platform_brand_archived_attempts%rowtype; r private.platform_brand_archived_requests%rowtype; snapshot jsonb;
begin
 perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.platform_brand_retention_settings where archived_verification_enabled) then return null; end if;
 select * into a from private.platform_brand_archived_attempts where id=p_attempt_id;
 if not found or a.claim_token is distinct from p_claim_token or a.worker_id is distinct from p_worker_id
  or clock_timestamp()<a.claimed_at or clock_timestamp()>=a.expires_at then return null; end if;
 select * into r from private.platform_brand_archived_requests where id=a.request_id;
 snapshot:=private.platform_brand_archived_snapshot(r.asset_id);
 if snapshot is null or snapshot is distinct from r.archive_binding or snapshot is distinct from a.archive_binding
  or not private.platform_brand_archived_read_allowed(r.asset_id) then return null; end if;
 return jsonb_build_object('requestId',r.id,'attemptId',a.id,'claimToken',a.claim_token,'workerId',a.worker_id,
  'expiresAt',a.expires_at,'binding',snapshot->'binding','archiveBinding',snapshot);
end $$;

create function public.claim_platform_brand_archived_verification(p_request_ids uuid[],p_worker_id text)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.platform_brand_archived_requests%rowtype; a private.platform_brand_archived_attempts%rowtype;
 snapshot jsonb; n integer; t timestamptz; attempts jsonb:='[]';
begin
 perform private.platform_brand_archived_service_required();
 perform private.platform_brand_retention_lock();
 if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9_.:-]{1,128}$' or p_request_ids is null
  or cardinality(p_request_ids) not between 1 and 2 or array_position(p_request_ids,null) is not null
  or (select count(distinct x) from unnest(p_request_ids) x)<>cardinality(p_request_ids) then
  raise exception 'archived_brand_exact_bounded_requests_required'; end if;
 if not exists(select 1 from private.platform_brand_retention_settings where archived_verification_enabled) then
  return jsonb_build_object('status','disabled','attempts',attempts); end if;
 for r in select * from private.platform_brand_archived_requests where id=any(p_request_ids) order by id loop
  if exists(select 1 from private.platform_brand_object_proofs where asset_id=r.asset_id)
   or exists(select 1 from private.platform_brand_archived_attempts x join private.platform_brand_archived_results z on z.attempt_id=x.id
    where x.request_id=r.id and z.result->>'status'='malware_detected')
   or exists(select 1 from private.platform_brand_archived_attempts x where x.request_id=r.id and x.expires_at>clock_timestamp()
    and not exists(select 1 from private.platform_brand_archived_results z where z.attempt_id=x.id)) then continue; end if;
  select count(*) into n from private.platform_brand_archived_attempts where request_id=r.id;
  if n>=3 then continue; end if;
  snapshot:=private.platform_brand_archived_snapshot(r.asset_id);
  if snapshot is null or snapshot is distinct from r.archive_binding or not private.platform_brand_archived_read_allowed(r.asset_id) then continue; end if;
  -- A clean acknowledged result awaiting sealing owns its lease too. It cannot
  -- be displaced while another worker may still seal that exact observation.
  if exists(select 1 from private.platform_brand_archived_attempts x join private.platform_brand_archived_results z on z.attempt_id=x.id
   where x.request_id=r.id and x.expires_at>clock_timestamp() and z.result->>'status'='clean') then continue; end if;
  t:=clock_timestamp();
  insert into private.platform_brand_archived_attempts(request_id,attempt_number,worker_id,archive_binding,claimed_at,expires_at)
  values(r.id,n+1,p_worker_id,snapshot,t,t+interval '20 minutes') returning * into a;
  attempts:=attempts||jsonb_build_array(jsonb_build_object('requestId',r.id,'attemptId',a.id,'claimToken',a.claim_token,
   'workerId',a.worker_id,'expiresAt',a.expires_at,'binding',snapshot->'binding','archiveBinding',snapshot));
 end loop;
 return jsonb_build_object('status','claimed','attempts',attempts);
end $$;

create function public.read_platform_brand_archived_verification_attempt(p_attempt_id uuid,p_claim_token uuid,p_worker_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;
begin
 perform private.platform_brand_archived_service_required();
 a:=private.platform_brand_archived_attempt_current(p_attempt_id,p_claim_token,p_worker_id);
 if a is null then return jsonb_build_object('status','unavailable'); end if;
 return a||jsonb_build_object('status','authorized');
exception when lock_not_available then return jsonb_build_object('status','unavailable');
end $$;

create function private.platform_brand_archived_result_valid(p_result jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare fields text[]:=array['status','sha256','sizeBytes','scannerProvider','scannerVersion','signatureVersion',
 'exitCode','durationMs','findingName','errorCode','fullReadback']; status text; full_read boolean; digest_valid boolean;
begin
 if p_result is null or jsonb_typeof(p_result)<>'object' or not p_result ?& fields or (p_result-fields)<>'{}'::jsonb then return false; end if;
 status:=p_result->>'status';
 if status is null or status not in ('clean','malware_detected','scan_failed')
  or p_result->>'scannerProvider' is distinct from 'clamav'
  or jsonb_typeof(p_result->'scannerVersion')<>'string' or length(p_result->>'scannerVersion') not between 1 and 200
  or jsonb_typeof(p_result->'signatureVersion')<>'string' or length(p_result->>'signatureVersion') not between 1 and 200
  or jsonb_typeof(p_result->'exitCode')<>'number' or (p_result->>'exitCode') !~ '^-?[0-9]{1,3}$'
  or (p_result->>'exitCode')::integer not between -128 and 255
  or jsonb_typeof(p_result->'durationMs')<>'number' or (p_result->>'durationMs') !~ '^[0-9]{1,7}$'
  or (p_result->>'durationMs')::integer>1200000
  or jsonb_typeof(p_result->'fullReadback')<>'boolean'
  or jsonb_typeof(p_result->'findingName') not in ('string','null')
  or length(coalesce(p_result->>'findingName',''))>200
  or jsonb_typeof(p_result->'errorCode') not in ('string','null')
  or length(coalesce(p_result->>'errorCode',''))>100 then return false; end if;
 full_read:=(p_result->>'fullReadback')::boolean;
 digest_valid:=coalesce(jsonb_typeof(p_result->'sha256')='string' and p_result->>'sha256' ~ '^[0-9a-f]{64}$'
  and jsonb_typeof(p_result->'sizeBytes')='number' and p_result->>'sizeBytes' ~ '^[0-9]{1,9}$'
  and (p_result->>'sizeBytes')::bigint between 1 and 536870912,false);
 if full_read is distinct from digest_valid then return false; end if;
 if not full_read and (p_result->'sha256'<>'null'::jsonb or p_result->'sizeBytes'<>'null'::jsonb) then return false; end if;
 if status='clean' then
  return full_read and p_result->>'exitCode'='0' and p_result->'findingName'='null'::jsonb
   and p_result->'errorCode'='null'::jsonb and lower(btrim(p_result->>'signatureVersion'))<>'unknown'
   and lower(btrim(p_result->>'scannerVersion'))<>'unknown'
   and nullif(btrim(p_result->>'signatureVersion'),'') is not null and nullif(btrim(p_result->>'scannerVersion'),'') is not null;
 elsif status='malware_detected' then
  return full_read and p_result->>'exitCode'='1' and nullif(btrim(p_result->>'findingName'),'') is not null
   and p_result->'errorCode'='null'::jsonb;
 end if;
 return nullif(btrim(p_result->>'errorCode'),'') is not null;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;

create function public.record_platform_brand_archived_verification_result(p_attempt_id uuid,p_claim_token uuid,p_worker_id text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; r private.platform_brand_archived_results%rowtype;
begin
 perform private.platform_brand_archived_service_required();
 a:=private.platform_brand_archived_attempt_current(p_attempt_id,p_claim_token,p_worker_id);
 if a is null then raise exception 'archived_brand_attempt_unavailable'; end if;
 if not private.platform_brand_archived_result_valid(p_result)
  or ((p_result->>'fullReadback')::boolean and p_result->'sizeBytes' is distinct from a->'archiveBinding'->'expectedSizeBytes')
 then raise exception 'archived_brand_scanner_result_invalid'; end if;
 select * into r from private.platform_brand_archived_results where attempt_id=p_attempt_id;
 if found then
  if r.result is distinct from p_result then raise exception 'archived_brand_result_immutable_conflict'; end if;
 else
  insert into private.platform_brand_archived_results(attempt_id,result) values(p_attempt_id,p_result) returning * into r;
 end if;
 return jsonb_build_object('resultId',r.id,'status',r.result->>'status');
end $$;

create function private.platform_brand_archived_receipt_matches(p_receipt_id uuid,p_binding jsonb,p_sha text,p_size bigint,p_claimed_asset uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare receipt private.platform_brand_archived_receipts%rowtype; result private.platform_brand_archived_results%rowtype;
 attempt private.platform_brand_archived_attempts%rowtype; request private.platform_brand_archived_requests%rowtype; snapshot jsonb;
begin
 perform private.platform_brand_retention_lock();
 select * into receipt from private.platform_brand_archived_receipts where id=p_receipt_id;
 if not found or exists(select 1 from private.media_scan_byte_receipts where id=p_receipt_id) then return false; end if;
 select * into result from private.platform_brand_archived_results where id=receipt.result_id;
 select * into attempt from private.platform_brand_archived_attempts where id=result.attempt_id;
 select * into request from private.platform_brand_archived_requests where id=attempt.request_id;
 if request.id is null or result.result->>'status' is distinct from 'clean'
  or not private.platform_brand_archived_result_valid(result.result)
  or result.result->>'sha256' is distinct from p_sha or (result.result->>'sizeBytes')::bigint is distinct from p_size
  or result.result->'sizeBytes' is distinct from request.archive_binding->'expectedSizeBytes'
  or request.archive_binding->'binding' is distinct from p_binding or attempt.archive_binding is distinct from request.archive_binding
  or attempt.claimed_at<request.requested_at or result.completed_at<attempt.claimed_at or result.completed_at>=attempt.expires_at
  or receipt.recorded_at<result.completed_at or receipt.recorded_at>=attempt.expires_at
  or request.requested_at<(request.archive_binding->>'incarnationObservedAt')::timestamptz then return false; end if;
 if p_claimed_asset is not null and (p_claimed_asset<>request.asset_id or not exists(
  select 1 from private.platform_brand_expiry_claims c where c.asset_id=request.asset_id and c.claimed_at>=receipt.recorded_at)) then return false; end if;
 snapshot:=private.platform_brand_archived_snapshot(request.asset_id,p_claimed_asset is not null);
 return coalesce(snapshot=request.archive_binding,false);
exception when lock_not_available then return false;
end $$;

create function public.seal_platform_brand_archived_verification(p_attempt_id uuid,p_claim_token uuid,p_worker_id text,p_result_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; result private.platform_brand_archived_results%rowtype; receipt private.platform_brand_archived_receipts%rowtype;
 asset uuid; b jsonb; sha text; size bigint;
begin
 perform private.platform_brand_archived_service_required();
 a:=private.platform_brand_archived_attempt_current(p_attempt_id,p_claim_token,p_worker_id);
 if a is null then raise exception 'archived_brand_attempt_unavailable'; end if;
 select * into result from private.platform_brand_archived_results where id=p_result_id and attempt_id=p_attempt_id;
 if not found or result.result->>'status' is distinct from 'clean' or not private.platform_brand_archived_result_valid(result.result) then
  raise exception 'archived_brand_exact_clean_result_required'; end if;
 insert into private.platform_brand_archived_receipts(result_id) values(result.id) on conflict(result_id) do nothing;
 select * into receipt from private.platform_brand_archived_receipts where result_id=result.id;
 b:=a->'binding'; asset:=(b->>'assetId')::uuid; sha:=result.result->>'sha256'; size:=(result.result->>'sizeBytes')::bigint;
 if not private.platform_brand_archived_receipt_matches(receipt.id,b,sha,size) then raise exception 'archived_brand_receipt_unavailable'; end if;
 insert into private.platform_brand_object_proofs(asset_id,binding,origin_sha256,origin_size_bytes,scan_receipt_id)
 values(asset,b,sha,size,receipt.id) on conflict(asset_id) do nothing;
 if not exists(select 1 from private.platform_brand_object_proofs p where p.asset_id=asset and p.binding=b
  and p.origin_sha256=sha and p.origin_size_bytes=size and p.scan_receipt_id=receipt.id) then
  raise exception 'archived_brand_existing_proof_preserved'; end if;
 return jsonb_build_object('receiptId',receipt.id,'proofRecorded',true);
end $$;

-- Preserve normal scan-job behavior byte-for-byte. Only a receipt present in
-- the distinct archived ledger selects the new evidence branch.
create function private.platform_brand_scan_byte_receipt_matches_before_archived(p_receipt_id uuid,p_binding jsonb,p_origin_sha256 text,p_origin_size_bytes bigint)
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
create or replace function private.platform_brand_scan_byte_receipt_matches(p_receipt_id uuid,p_binding jsonb,p_origin_sha256 text,p_origin_size_bytes bigint)
returns boolean language plpgsql security definer set search_path='' as $$ begin
 perform private.platform_brand_retention_lock();
 if exists(select 1 from private.platform_brand_archived_receipts where id=p_receipt_id) then
  return private.platform_brand_archived_receipt_matches(p_receipt_id,p_binding,p_origin_sha256,p_origin_size_bytes);
 end if;
 return private.platform_brand_scan_byte_receipt_matches_before_archived(p_receipt_id,p_binding,p_origin_sha256,p_origin_size_bytes);
end $$;
create function private.platform_brand_claimed_scan_evidence_matches_before_archived(p_asset_id uuid,p_receipt_id uuid,p_binding jsonb,p_sha text,p_size bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare r private.media_scan_byte_receipts%rowtype; o private.media_scan_byte_observations%rowtype;
 j public.media_scan_jobs%rowtype; a public.platform_brand_assets%rowtype; i private.platform_brand_object_incarnations%rowtype;
begin
 perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.platform_brand_expiry_claims where asset_id=p_asset_id) then return false; end if;
 select * into i from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 if i.asset_id is null or exists(select 1 from storage.objects where bucket_id=i.bucket and name=i.object_key) then return false; end if;
 select * into r from private.media_scan_byte_receipts where id=p_receipt_id;
 if not found or r.sha256 is distinct from p_sha or r.size_bytes is distinct from p_size then return false; end if;
 select * into o from private.media_scan_byte_observations where id=r.observation_id;
 if not found or o.binding is distinct from p_binding then return false; end if;
 select * into j from public.media_scan_jobs where id=o.job_id for share nowait;
 if not found then return false; end if;
 select * into a from public.platform_brand_assets where id=p_asset_id for share nowait;
 return coalesce(found and j.target_id=p_asset_id::text and j.status='clean'
  and j.claimed_at=o.claimed_at and j.claimed_by=o.worker_id
  and private.media_scan_byte_result_binding(j)=r.result_binding
  and a.scan_status='clean' and a.scan_provider='clamav' and a.scanned_at=j.completed_at and a.scan_error is null
  and a.deleted_at is not null
  and (a.owner_user_id,a.created_at,a.storage_provider,a.storage_bucket,a.storage_object_key,a.storage_path)
    is not distinct from (i.owner_id,i.source_created_at,i.provider,i.bucket,i.object_key,i.storage_path),false);
exception when lock_not_available then return false;
end $$;
create or replace function private.platform_brand_claimed_scan_evidence_matches(p_asset_id uuid,p_receipt_id uuid,p_binding jsonb,p_sha text,p_size bigint)
returns boolean language plpgsql security definer set search_path='' as $$ begin
 perform private.platform_brand_retention_lock();
 if exists(select 1 from private.platform_brand_archived_receipts where id=p_receipt_id) then
  return private.platform_brand_archived_receipt_matches(p_receipt_id,p_binding,p_sha,p_size,p_asset_id);
 end if;
 return private.platform_brand_claimed_scan_evidence_matches_before_archived(p_asset_id,p_receipt_id,p_binding,p_sha,p_size);
end $$;

revoke all on function private.platform_brand_archived_service_required(),private.platform_brand_archived_snapshot(uuid,boolean),
 private.platform_brand_archived_read_allowed(uuid),private.platform_brand_archived_attempt_current(uuid,uuid,text),
 private.platform_brand_archived_result_valid(jsonb),private.platform_brand_archived_receipt_matches(uuid,jsonb,text,bigint,uuid),
 private.platform_brand_scan_byte_receipt_matches_before_archived(uuid,jsonb,text,bigint),
 private.platform_brand_claimed_scan_evidence_matches_before_archived(uuid,uuid,jsonb,text,bigint),
 private.platform_brand_scan_byte_receipt_matches(uuid,jsonb,text,bigint),private.platform_brand_claimed_scan_evidence_matches(uuid,uuid,jsonb,text,bigint),
 public.request_platform_brand_archived_verification(uuid,jsonb),public.claim_platform_brand_archived_verification(uuid[],text),
 public.read_platform_brand_archived_verification_attempt(uuid,uuid,text),public.record_platform_brand_archived_verification_result(uuid,uuid,text,jsonb),
 public.seal_platform_brand_archived_verification(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_platform_brand_archived_verification(uuid,jsonb),public.claim_platform_brand_archived_verification(uuid[],text),
 public.read_platform_brand_archived_verification_attempt(uuid,uuid,text),public.record_platform_brand_archived_verification_result(uuid,uuid,text,jsonb),
 public.seal_platform_brand_archived_verification(uuid,uuid,text,uuid) to service_role;
commit;
