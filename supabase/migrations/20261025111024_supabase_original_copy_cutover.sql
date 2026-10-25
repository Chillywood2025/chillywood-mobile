-- Forward-only copy provenance. No provider calls, activation, schedule, data
-- cutover, evidence enrollment, or deletion is executed by this migration.
begin;

create table private.supabase_original_copy_cutovers (
 id uuid primary key references private.supabase_original_copy_receipts(id),
 table_name text not null check(table_name in ('videos','social_attachments')),
 row_id uuid not null, owner_id uuid not null,
 source_storage_id uuid not null, source_storage_version text not null,
 old_binding jsonb not null, new_binding jsonb not null,
 target_key text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes bigint not null check(size_bytes between 1 and 536870912),
 scan_job_id uuid not null unique, scan_job_created_at timestamptz not null,
 readback_assertions jsonb not null,
 committed_at timestamptz not null default clock_timestamp(),
 unique(table_name,row_id),
 check(length(source_storage_version) between 1 and 256)
);
create table private.supabase_copy_scan_observations (
 id uuid primary key default gen_random_uuid(),
 cutover_id uuid not null references private.supabase_original_copy_cutovers(id),
 job_id uuid not null, job_created_at timestamptz not null,
 attempt_count integer not null, worker_id text not null, claimed_at timestamptz not null,
 binding jsonb not null, observed_at timestamptz not null default clock_timestamp(),
 unique(job_id,attempt_count)
);
create table private.supabase_copy_scan_receipts (
 id uuid primary key default gen_random_uuid(),
 observation_id uuid not null unique references private.supabase_copy_scan_observations(id),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes bigint not null check(size_bytes between 1 and 536870912),
 result_binding jsonb not null, recorded_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['supabase_original_copy_cutovers','supabase_copy_scan_observations','supabase_copy_scan_receipts'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger immutable before update or delete on private.%I for each row execute function private.preserve_supabase_original_copy_receipt()',t);
  execute format('create trigger no_truncate before truncate on private.%I for each statement execute function private.preserve_supabase_original_copy_receipt()',t);
 end loop;
end $$;


-- Reject contention rather than invert capture/scan/source row lock order.
-- Lock every existing reference producer before reading the alias snapshot.
-- This neither changes nor bypasses any held secondary/reference trigger.
create function private.lock_supabase_copy_cutover() returns void
language plpgsql security definer set search_path='' as $$
declare t record;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'copy_cutover_requires_read_committed' using errcode='25000'; end if;
 perform private.deleted_media_reference_fence_armed();
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
   and (cardinality(private.deleted_media_locator_columns(c.oid))>0
     or c.relname in ('legal_holds','media_transcode_jobs','media_renditions','video_renditions'))
  order by c.oid loop
  execute format('lock table %I.%I in share row exclusive mode nowait',t.nspname,t.relname);
 end loop;
 perform pg_advisory_xact_lock(176214,30);
 if not private.deleted_media_reference_coverage_ready() then raise exception 'copy_cutover_reference_coverage_incomplete'; end if;
end $$;

create function private.supabase_copy_cutover_source(p_cutover private.supabase_original_copy_cutovers)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare s jsonb;
begin
 if p_cutover.table_name='videos' then
  select to_jsonb(v) into s from public.videos v where id=p_cutover.row_id for share nowait;
 elsif p_cutover.table_name='social_attachments' then
  select to_jsonb(v) into s from public.social_attachments v where id=p_cutover.row_id for share nowait;
 end if;
 if s is null or s->>'hard_deleted_at' is not null
  or private.deleted_media_legacy_source_binding(case p_cutover.table_name when 'videos' then 'creator_video' else 'social_attachment' end,s)
    is distinct from p_cutover.new_binding then return null; end if;
 return s;
end $$;

create function public.read_supabase_original_copy_cutover(p_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.supabase_original_copy_receipts; o storage.objects; preflight jsonb; c private.supabase_original_copy_cutovers; s jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'copy_cutover_service_role_required'; end if;
 perform private.lock_supabase_copy_cutover();
 select * into c from private.supabase_original_copy_cutovers where id=p_receipt_id;
 if c.id is not null then
  return jsonb_build_object('state','committed','receiptId',c.id,'scanJobId',c.scan_job_id,
    'sourceMatches',private.supabase_copy_cutover_source(c) is not null,'oldObjectDeletionAllowed',false);
 end if;
 select * into r from private.supabase_original_copy_receipts where id=p_receipt_id;
 if r.id is null then raise exception 'copy_receipt_required'; end if;
 preflight:=public.preflight_supabase_original_copy_cutover(p_receipt_id);
 if preflight->>'reason' is distinct from 'fresh_scan_required_after_locator_cutover'
  or preflight->>'sourceMatches' is distinct from 'true' then
  raise exception 'copy_cutover_preflight_blocked: %',preflight->>'reason'; end if;
 s:=private.read_supabase_original_copy_source(r.table_name,r.row_id);
 if (case r.table_name when 'videos' then (s->>'file_size_bytes')::bigint else (s->>'size_bytes')::bigint end)
   is distinct from r.size_bytes then raise exception 'copy_cutover_source_size_metadata_mismatch'; end if;
 select * into o from storage.objects where bucket_id=r.old_bucket and name=r.old_object_key for share nowait;
 if not found or nullif(to_jsonb(o)->>'version','') is null then raise exception 'copy_cutover_source_storage_missing'; end if;
 return jsonb_build_object('state','readback_required','receiptId',r.id,'tableName',r.table_name,'rowId',r.row_id,
  'sourceBucket',r.old_bucket,'sourceKey',r.old_object_key,'sourceStorageId',o.id,'sourceStorageVersion',to_jsonb(o)->>'version',
  'targetKey',r.target_key,'sha256',r.sha256,'sizeBytes',r.size_bytes,'oldObjectDeletionAllowed',false);
end $$;

create function public.commit_supabase_original_copy_cutover(p_receipt_id uuid,p_source_storage_id uuid,
 p_source_storage_version text,p_readback_assertions jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.supabase_original_copy_receipts; c private.supabase_original_copy_cutovers; o storage.objects;
 preflight jsonb; s jsonb; j public.media_scan_jobs; kind text; expected jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'copy_cutover_service_role_required'; end if;
 perform private.lock_supabase_copy_cutover();
 select * into r from private.supabase_original_copy_receipts where id=p_receipt_id;
 if r.id is null then raise exception 'copy_receipt_required'; end if;
 expected:=jsonb_build_object('protocol','supabase-copy-cutover-v1','sourceSha256',r.sha256,'targetSha256',r.sha256,
  'sourceSizeBytes',r.size_bytes,'targetSizeBytes',r.size_bytes,'independentReadback',true,'sourcePreserved',true);
 if p_readback_assertions is distinct from expected then raise exception 'copy_cutover_readback_required'; end if;
 select * into c from private.supabase_original_copy_cutovers where id=r.id;
 if c.id is not null then
  if (c.source_storage_id,c.source_storage_version,c.readback_assertions)
    is distinct from (p_source_storage_id,p_source_storage_version,p_readback_assertions)
    or private.supabase_copy_cutover_source(c) is null then raise exception 'copy_cutover_retry_conflict'; end if;
  return jsonb_build_object('state','committed','receiptId',c.id,'scanJobId',c.scan_job_id,'alreadyCommitted',true,
   'oldObjectDeletionAllowed',false);
 end if;
 preflight:=public.preflight_supabase_original_copy_cutover(r.id);
 if preflight->>'reason' is distinct from 'fresh_scan_required_after_locator_cutover'
  or preflight->>'sourceMatches' is distinct from 'true' then
  raise exception 'copy_cutover_preflight_blocked: %',preflight->>'reason'; end if;
 s:=private.read_supabase_original_copy_source(r.table_name,r.row_id);
 if (case r.table_name when 'videos' then (s->>'file_size_bytes')::bigint else (s->>'size_bytes')::bigint end)
   is distinct from r.size_bytes then raise exception 'copy_cutover_source_size_metadata_mismatch'; end if;
 select * into o from storage.objects where bucket_id=r.old_bucket and name=r.old_object_key for share nowait;
 if not found or (o.id,to_jsonb(o)->>'version') is distinct from (p_source_storage_id,p_source_storage_version)
  or nullif(p_source_storage_version,'') is null then raise exception 'copy_cutover_source_generation_changed'; end if;
 -- An unused target key must produce a NEW job, never an enqueue upsert.
 if exists(select 1 from public.media_scan_jobs where storage_object_key=r.target_key)
  or exists(select 1 from private.supabase_original_copy_cutovers where target_key=r.target_key or (table_name=r.table_name and row_id=r.row_id)) then
  raise exception 'copy_cutover_target_reused'; end if;
 if r.table_name='videos' then
  update public.videos set storage_provider='cloudflare_r2',storage_bucket='chillywood-media-origin',
    storage_object_key=r.target_key,storage_path=r.target_key where id=r.row_id returning to_jsonb(videos) into s;
 else
  update public.social_attachments set storage_provider='cloudflare_r2',storage_bucket='chillywood-media-origin',
    storage_object_key=r.target_key,storage_path=r.target_key where id=r.row_id returning to_jsonb(social_attachments) into s;
 end if;
 kind:=case r.table_name when 'videos' then 'creator_video' else 'social_attachment' end;
 select * into strict j from public.media_scan_jobs where target_table=r.table_name and target_id=r.row_id::text
  and target_column=case r.table_name when 'videos' then 'source' else 'attachment' end
  and storage_provider='cloudflare_r2' and storage_bucket='chillywood-media-origin' and storage_object_key=r.target_key;
 if s->>'scan_status' is distinct from 'pending_scan' or s->>'scanned_at' is not null
  or s->>'scan_result' is not null or s->>'scan_error' is not null or s->>'quarantined_at' is not null
  or j.status<>'pending_scan' or j.attempt_count<>0 or j.claimed_at is not null or j.completed_at is not null
  or j.size_bytes is distinct from r.size_bytes
  or j.owner_user_id is distinct from r.owner_id::text then raise exception 'copy_cutover_fresh_scan_not_queued'; end if;
 insert into private.supabase_original_copy_cutovers(id,table_name,row_id,owner_id,source_storage_id,source_storage_version,
  old_binding,new_binding,target_key,sha256,size_bytes,scan_job_id,scan_job_created_at,readback_assertions)
 values(r.id,r.table_name,r.row_id,r.owner_id,o.id,p_source_storage_version,r.source_binding,
  private.deleted_media_legacy_source_binding(kind,s),r.target_key,r.sha256,r.size_bytes,j.id,j.created_at,p_readback_assertions);
 update public.media_scan_jobs set metadata=metadata||jsonb_build_object('supabaseCopyCutoverId',r.id) where id=j.id;
 return jsonb_build_object('state','committed','receiptId',r.id,'scanJobId',j.id,'alreadyCommitted',false,
  'retentionEnrolled',false,'oldObjectDeletionAllowed',false);
end $$;


create function public.begin_supabase_copy_scan_observation(p_job_id uuid,p_worker_id text,p_attempt_count integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare c private.supabase_original_copy_cutovers; j public.media_scan_jobs; s jsonb; result uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'copy_cutover_service_role_required'; end if;
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
 select * into c from private.supabase_original_copy_cutovers where scan_job_id=p_job_id;
 if c.id is null then raise exception 'copy_scan_cutover_required'; end if;
 select * into j from public.media_scan_jobs where id=p_job_id for share nowait;
 s:=private.supabase_copy_cutover_source(c);
 if s is null or s->>'deleted_at' is not null or j.status is distinct from 'scanning' or j.claimed_by is distinct from p_worker_id
  or nullif(btrim(p_worker_id),'') is null or j.attempt_count is distinct from p_attempt_count
  or j.claimed_at is null or j.claimed_at<clock_timestamp()-interval '20 minutes'
  or j.created_at is distinct from c.scan_job_created_at
  or (j.target_table,j.target_id,j.owner_user_id,j.storage_provider,j.storage_bucket,j.storage_object_key)
    is distinct from (c.table_name,c.row_id::text,c.owner_id::text,'cloudflare_r2','chillywood-media-origin',c.target_key)
  or j.target_column is distinct from (case c.table_name when 'videos' then 'source' else 'attachment' end)
  or j.metadata->>'supabaseCopyCutoverId' is distinct from c.id::text then raise exception 'copy_scan_claim_stale'; end if;
 insert into private.supabase_copy_scan_observations(cutover_id,job_id,job_created_at,attempt_count,worker_id,claimed_at,binding)
 values(c.id,j.id,j.created_at,j.attempt_count,p_worker_id,j.claimed_at,c.new_binding)
 on conflict(job_id,attempt_count) do nothing returning id into result;
 if result is null then select id into result from private.supabase_copy_scan_observations
  where cutover_id=c.id and job_id=j.id and attempt_count=j.attempt_count and worker_id=p_worker_id
   and claimed_at=j.claimed_at and job_created_at=j.created_at and binding=c.new_binding; end if;
 if result is null then raise exception 'copy_scan_observation_conflict'; end if;
 return result;
end $$;

create function public.record_supabase_copy_scan_receipt(p_observation_id uuid,p_job_id uuid,p_worker_id text,
 p_sha256 text,p_size_bytes bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare o private.supabase_copy_scan_observations; c private.supabase_original_copy_cutovers;
 j public.media_scan_jobs; s jsonb; result uuid; v_result_binding jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'copy_cutover_service_role_required'; end if;
 perform private.deleted_media_reference_fence_armed(); perform pg_advisory_xact_lock(176214,30);
 select * into o from private.supabase_copy_scan_observations where id=p_observation_id;
 if o.id is null or (o.job_id,o.worker_id) is distinct from (p_job_id,p_worker_id) then raise exception 'copy_scan_observation_mismatch'; end if;
 select * into c from private.supabase_original_copy_cutovers where id=o.cutover_id;
 select * into j from public.media_scan_jobs where id=o.job_id for share nowait;
 s:=private.supabase_copy_cutover_source(c);
 if s is null or s->>'deleted_at' is not null or (c.sha256,c.size_bytes) is distinct from (p_sha256,p_size_bytes)
  or (j.target_table,j.target_id,j.owner_user_id,j.storage_provider,j.storage_bucket,j.storage_object_key)
    is distinct from (c.table_name,c.row_id::text,c.owner_id::text,'cloudflare_r2','chillywood-media-origin',c.target_key)
  or j.target_column is distinct from (case c.table_name when 'videos' then 'source' else 'attachment' end)
  or j.metadata->>'supabaseCopyCutoverId' is distinct from c.id::text
  or (j.id,j.created_at,j.attempt_count,j.claimed_at,j.claimed_by)
    is distinct from (c.scan_job_id,o.job_created_at,o.attempt_count,o.claimed_at,o.worker_id)
  or j.status is distinct from 'clean' or j.completed_at is null or j.completed_at<o.observed_at
  or j.completed_at>=o.claimed_at+interval '20 minutes' or clock_timestamp()>=o.claimed_at+interval '20 minutes'
  or j.scanner_provider is distinct from 'clamav' or nullif(j.scanner_version,'') is null
  or nullif(j.signature_version,'') is null or j.signature_version='unknown' or j.finding_name is not null
  or j.error_message is not null or j.metadata->>'targetPropagationComplete' is distinct from 'true'
  or s->>'scan_status' is distinct from 'clean' or s->>'scan_provider' is distinct from 'clamav'
  or (s->>'scanned_at')::timestamptz is distinct from j.completed_at or s->>'scan_error' is not null
  or o.binding is distinct from c.new_binding then raise exception 'copy_scan_result_stale'; end if;
 v_result_binding:=private.media_scan_byte_result_binding(j);
 insert into private.supabase_copy_scan_receipts(observation_id,sha256,size_bytes,result_binding)
 values(o.id,p_sha256,p_size_bytes,v_result_binding) on conflict(observation_id) do nothing returning id into result;
 if result is null then select id into result from private.supabase_copy_scan_receipts where observation_id=o.id
  and sha256=p_sha256 and size_bytes=p_size_bytes and result_binding=v_result_binding; end if;
 if result is null then raise exception 'copy_scan_receipt_conflict'; end if;
 return result;
end $$;

create function private.supabase_copy_scan_receipt_matches(p_cutover_id uuid,p_scan_receipt_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare c private.supabase_original_copy_cutovers; r private.supabase_copy_scan_receipts;
 o private.supabase_copy_scan_observations; j public.media_scan_jobs; s jsonb;
begin
 select * into c from private.supabase_original_copy_cutovers where id=p_cutover_id;
 select * into r from private.supabase_copy_scan_receipts where id=p_scan_receipt_id;
 select * into o from private.supabase_copy_scan_observations where id=r.observation_id;
 if c.id is null or r.id is null or o.cutover_id is distinct from c.id
  or (r.sha256,r.size_bytes,o.binding) is distinct from (c.sha256,c.size_bytes,c.new_binding) then return false; end if;
 select * into j from public.media_scan_jobs where id=o.job_id for share nowait;
 s:=private.supabase_copy_cutover_source(c);
 return coalesce(s is not null and j.id=c.scan_job_id and j.created_at=o.job_created_at and j.attempt_count=o.attempt_count
  and j.created_at=c.scan_job_created_at
  and (j.target_table,j.target_id,j.owner_user_id,j.storage_provider,j.storage_bucket,j.storage_object_key)
    is not distinct from (c.table_name,c.row_id::text,c.owner_id::text,'cloudflare_r2','chillywood-media-origin',c.target_key)
  and j.target_column=case c.table_name when 'videos' then 'source' else 'attachment' end
  and j.metadata->>'supabaseCopyCutoverId'=c.id::text
  and j.claimed_at=o.claimed_at and j.claimed_by=o.worker_id and j.status='clean'
  and private.media_scan_byte_result_binding(j)=r.result_binding
  and s->>'scan_status'='clean' and s->>'scan_provider'='clamav'
  and (s->>'scanned_at')::timestamptz=j.completed_at and s->>'scan_error' is null,false);
exception when lock_not_available then return false;
end $$;

-- Tagged evidence, never an invented historical audit. Existing insert callers
-- default to the exact historical contract; proofless NULL audits are forbidden.
alter table private.deleted_media_legacy_provenance
 add column provenance_kind text not null default 'historical_migration',
 add column copy_cutover_id uuid references private.supabase_original_copy_cutovers(id),
 add column copy_scan_receipt_id uuid references private.supabase_copy_scan_receipts(id),
 alter column migration_audit_id drop not null,
 alter column migration_audit_binding drop not null,
 add constraint deleted_media_provenance_kind_exact check(
  (provenance_kind='historical_migration' and migration_audit_id is not null and migration_audit_binding is not null
    and copy_cutover_id is null and copy_scan_receipt_id is null)
  or (provenance_kind='supabase_copy_cutover' and migration_audit_id is null and migration_audit_binding is null
    and copy_cutover_id is not null and copy_scan_receipt_id is not null));

create function public.enroll_supabase_copy_retention_provenance(p_cutover_id uuid,p_scan_receipt_id uuid,
 p_writer_drain_evidence_sha256 text,p_reviewed_by text) returns uuid
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare c private.supabase_original_copy_cutovers; l private.deleted_media_legacy_provenance; s jsonb;
 kind text; result uuid; t record; shared boolean; predicate text; digest text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'copy_cutover_service_role_required'; end if;
 perform private.lock_supabase_copy_cutover();
 select * into c from private.supabase_original_copy_cutovers where id=p_cutover_id;
 if c.id is null or not private.supabase_copy_scan_receipt_matches(c.id,p_scan_receipt_id) then raise exception 'copy_retention_genuine_scan_required'; end if;
 if p_writer_drain_evidence_sha256 is null or p_writer_drain_evidence_sha256 !~ '^[a-f0-9]{64}$'
  or p_reviewed_by is null or length(btrim(p_reviewed_by)) not between 1 and 256 then raise exception 'copy_retention_writer_review_required'; end if;
 s:=private.supabase_copy_cutover_source(c);
 kind:=case c.table_name when 'videos' then 'creator_video' else 'social_attachment' end;
 if exists(select 1 from public.legal_holds h where h.status='active' and private.deleted_content_hold_matches(
   h.target_type,h.target_id,kind,c.row_id::text,c.owner_id::text,s->>'surface_type',s->>'surface_id'))
  or exists(select 1 from private.deleted_media_key_retirements where object_key=c.target_key)
  or exists(select 1 from private.deleted_media_legacy_delivery_revocations where object_key=c.target_key)
  or exists(select 1 from public.media_upload_reservations where storage_object_key=c.target_key)
  or exists(select 1 from private.media_object_storage_migration_audit where new_storage_object_key=c.target_key)
  or (c.table_name='videos' and exists(select 1 from public.video_renditions where video_id=c.row_id))
  or exists(select 1 from public.media_renditions where video_id=c.row_id or (source_type=kind and source_id=c.row_id::text))
  or exists(select 1 from public.media_transcode_jobs where source_type=kind and source_id=c.row_id::text)
 then raise exception 'copy_retention_hold_history_or_secondary_conflict'; end if;
 -- The exact source and exact completed new scan are the only target references.
 for t in select c1.oid,c1.relname from pg_class c1 join pg_namespace n on n.oid=c1.relnamespace
   where n.nspname='public' and c1.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c1.oid))>0 loop
  predicate:='true';
  if t.relname=c.table_name then predicate:=format('id<>%L::uuid',c.row_id); end if;
  if t.relname='media_scan_jobs' then predicate:=format('id<>%L::uuid',c.scan_job_id); end if;
  execute format('select exists(select 1 from public.%I x where %s and private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$1))',t.relname,predicate,t.oid)
   into shared using c.target_key;
  if shared then raise exception 'copy_retention_shared_reference'; end if;
 end loop;
 digest:=private.supabase_original_copy_snapshot_sha256(jsonb_build_object('copyCutoverId',c.id,'oldBinding',c.old_binding,'newBinding',c.new_binding));
 select * into l from private.deleted_media_legacy_provenance where target_type=kind and target_id=c.row_id;
 if l.id is not null then
  if (l.provenance_kind,l.copy_cutover_id,l.copy_scan_receipt_id,l.source_binding,l.writer_drain_evidence_sha256,l.reviewed_by)
    is not distinct from ('supabase_copy_cutover',c.id,p_scan_receipt_id,c.new_binding,p_writer_drain_evidence_sha256,btrim(p_reviewed_by)) then return l.id; end if;
  raise exception 'copy_retention_provenance_conflict'; end if;
 insert into private.deleted_media_legacy_provenance(target_type,target_id,author,source_created_at,parent_type,parent_id,
  provider,bucket,object_key,source_binding,provenance_kind,copy_cutover_id,copy_scan_receipt_id,
  ownership_evidence_sha256,origin_sha256,origin_size_bytes,scan_evidence_sha256,writer_drain_evidence_sha256,reviewed_by)
 values(kind,c.row_id,c.owner_id,c.new_binding->>'createdAt',c.new_binding->>'parentType',(c.new_binding->>'parentId')::uuid,
  'cloudflare_r2','chillywood-media-origin',c.target_key,c.new_binding,'supabase_copy_cutover',c.id,p_scan_receipt_id,
  digest,c.sha256,c.size_bytes,private.supabase_original_copy_snapshot_sha256(to_jsonb((select r from private.supabase_copy_scan_receipts r where r.id=p_scan_receipt_id))),
  p_writer_drain_evidence_sha256,btrim(p_reviewed_by)) returning id into result;
 return result;
end $$;

-- Runtime adapters and explicit grants follow. No historical receipt is edited.

create function private.supabase_copy_provenance_current(p private.deleted_media_legacy_provenance)
returns boolean language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare c private.supabase_original_copy_cutovers; r private.supabase_original_copy_receipts; s jsonb; kind text;
 t record; shared boolean; predicate text; scan private.supabase_copy_scan_receipts;
begin
 if p.provenance_kind is distinct from 'supabase_copy_cutover' or p.migration_audit_id is not null
  or p.migration_audit_binding is not null then return false; end if;
 select * into c from private.supabase_original_copy_cutovers where id=p.copy_cutover_id;
 select * into r from private.supabase_original_copy_receipts where id=c.id;
 select * into scan from private.supabase_copy_scan_receipts where id=p.copy_scan_receipt_id;
 if c.id is null or r.id is null then return false; end if;
 kind:=case c.table_name when 'videos' then 'creator_video' else 'social_attachment' end;
 s:=private.supabase_copy_cutover_source(c);
 if s is null or (p.target_type,p.target_id,p.author,p.source_created_at,p.parent_type,p.parent_id::text,
    p.provider,p.bucket,p.object_key,p.source_binding,p.origin_sha256,p.origin_size_bytes)
   is distinct from (kind,c.row_id,c.owner_id,c.new_binding->>'createdAt',c.new_binding->>'parentType',c.new_binding->>'parentId',
    'cloudflare_r2','chillywood-media-origin',c.target_key,c.new_binding,c.sha256,c.size_bytes)
  or (c.table_name,c.row_id,c.owner_id,c.old_binding,c.target_key,c.sha256,c.size_bytes)
   is distinct from (r.table_name,r.row_id,r.owner_id,r.source_binding,r.target_key,r.sha256,r.size_bytes)
  or not private.supabase_copy_scan_receipt_matches(c.id,p.copy_scan_receipt_id)
  or p.ownership_evidence_sha256 is distinct from private.supabase_original_copy_snapshot_sha256(
    jsonb_build_object('copyCutoverId',c.id,'oldBinding',c.old_binding,'newBinding',c.new_binding))
  or p.scan_evidence_sha256 is distinct from private.supabase_original_copy_snapshot_sha256(to_jsonb(scan))
  or exists(select 1 from jsonb_each(s) x(k,v) where k ~* '(url|uri|path|object_key|locator|manifest|playback)'
    and k not in ('storage_object_key','storage_path') and v not in ('null'::jsonb,'""'::jsonb))
  or (c.table_name='videos' and exists(select 1 from public.video_renditions where video_id=c.row_id))
  or exists(select 1 from public.media_renditions where video_id=c.row_id or (source_type=kind and source_id=c.row_id::text))
  or exists(select 1 from public.media_transcode_jobs where source_type=kind and source_id=c.row_id::text)
 then return false; end if;
 for t in select c1.oid,c1.relname from pg_class c1 join pg_namespace n on n.oid=c1.relnamespace
   where n.nspname='public' and c1.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c1.oid))>0 loop
  predicate:='true';
  if t.relname=c.table_name then predicate:=format('id<>%L::uuid',c.row_id); end if;
  if t.relname='media_scan_jobs' then predicate:=format('id<>%L::uuid',c.scan_job_id); end if;
  execute format('select exists(select 1 from public.%I x where %s and private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$1))',t.relname,predicate,t.oid)
   into shared using c.target_key;
  if shared then return false; end if;
 end loop;
 return true;
exception when lock_not_available then return false;
end $$;

alter function private.deleted_media_legacy_source_supported(text,jsonb) rename to deleted_media_legacy_source_supported_before_copy_cutover;
create function private.deleted_media_legacy_source_supported(p_type text,p_source jsonb) returns boolean
language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare p private.deleted_media_legacy_provenance;
begin
 select * into p from private.deleted_media_legacy_provenance where target_type=p_type and target_id::text=p_source->>'id'
  and provenance_kind='supabase_copy_cutover';
 if p.id is null then
  if exists(select 1 from private.supabase_original_copy_cutovers c
    where c.target_key=coalesce(nullif(p_source->>'storage_object_key',''),p_source->>'storage_path')) then return false; end if;
  return private.deleted_media_legacy_source_supported_before_copy_cutover(p_type,p_source);
 end if;
 return p.source_binding=private.deleted_media_legacy_source_binding(p_type,p_source)
  and private.deleted_media_reference_coverage_ready() and private.supabase_copy_provenance_current(p);
end $$;

alter function public.has_verified_legacy_media_object_provenance(text,text,text,text,text)
 rename to has_verified_legacy_media_object_provenance_before_copy_cutover;
create function public.has_verified_legacy_media_object_provenance(p_table_name text,p_row_id text,p_provider text,p_bucket text,p_object_key text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare p private.deleted_media_legacy_provenance;
begin
 if private.deleted_media_legacy_delivery_revoked(p_provider,p_bucket,p_object_key) then return false; end if;
 select * into p from private.deleted_media_legacy_provenance where provenance_kind='supabase_copy_cutover'
  and target_type=case p_table_name when 'videos' then 'creator_video' when 'social_attachments' then 'social_attachment' end
  and target_id::text=p_row_id and provider=p_provider and bucket=p_bucket and object_key=p_object_key;
 if p.id is not null then return private.supabase_copy_provenance_current(p); end if;
 if exists(select 1 from private.supabase_original_copy_cutovers where target_key=btrim(p_object_key)) then return false; end if;
 return public.has_verified_legacy_media_object_provenance_before_copy_cutover(p_table_name,p_row_id,p_provider,p_bucket,p_object_key);
end $$;
alter function public.has_verified_legacy_video_object_provenance(uuid,text,text,text)
 rename to has_verified_legacy_video_object_provenance_before_copy_cutover;
create function public.has_verified_legacy_video_object_provenance(p_video_id uuid,p_provider text,p_bucket text,p_object_key text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare p private.deleted_media_legacy_provenance;
begin
 if private.deleted_media_legacy_delivery_revoked(p_provider,p_bucket,p_object_key) then return false; end if;
 select * into p from private.deleted_media_legacy_provenance where provenance_kind='supabase_copy_cutover'
  and target_type='creator_video' and target_id=p_video_id and provider=p_provider and bucket=p_bucket and object_key=p_object_key;
 if p.id is not null then return private.supabase_copy_provenance_current(p); end if;
 if exists(select 1 from private.supabase_original_copy_cutovers where target_key=btrim(p_object_key)) then return false; end if;
 return public.has_verified_legacy_video_object_provenance_before_copy_cutover(p_video_id,p_provider,p_bucket,p_object_key);
end $$;

create or replace function private.revoke_deleted_media_legacy_delivery(p_stage_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare s private.deleted_content_media_stages; r private.deleted_media_key_retirements;
 p private.deleted_media_legacy_provenance; receipt private.deleted_media_legacy_delivery_revocations;
 b jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'legacy_provenance_requires_read_committed' using errcode='25000'; end if;
 if not private.deleted_media_reference_fence_armed() then
  raise exception 'retirement_fence_not_armed' using errcode='55000'; end if;
 select * into s from private.deleted_content_media_stages where id=p_stage_id;
 select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id;
 select * into p from private.deleted_media_legacy_provenance where id=s.legacy_provenance_id;
 if s.id is null or r.id is null or p.id is null or s.reservation_id is not null or r.reservation_id is not null
  or r.legacy_provenance_id is distinct from p.id
  or (s.target_type,s.target_id,s.author,s.provider,s.bucket,s.object_key)
    is distinct from (p.target_type,p.target_id::text,p.author::text,p.provider,p.bucket,p.object_key)
  or (r.target_type,r.target_id,r.author,r.provider,r.bucket,r.object_key,r.source_created_at)
    is distinct from (p.target_type,p.target_id::text,p.author::text,p.provider,p.bucket,p.object_key,p.source_created_at) then
  raise exception 'legacy_delivery_revocation_binding_required' using errcode='55000'; end if;
 select * into receipt from private.deleted_media_legacy_delivery_revocations where legacy_provenance_id=p.id;
 if receipt.legacy_provenance_id is not null then
  if (receipt.stage_id,receipt.target_type,receipt.target_id,receipt.author,receipt.source_created_at,
    receipt.provider,receipt.bucket,receipt.object_key,receipt.source_binding)
    is distinct from (s.id,p.target_type,p.target_id,p.author,p.source_created_at,p.provider,p.bucket,p.object_key,p.source_binding) then
   raise exception 'legacy_delivery_revocation_identity_conflict' using errcode='55000'; end if;
  return jsonb_build_object('revoked',true,'source','legacy_provenance','alreadyRevoked',true);
 end if;
 -- Source before advisory matches capture's ordering. The source lock prevents
 -- source replacement while the immutable snapshot is bound to this revoke.
 b:=private.read_deleted_media_legacy_source(p.target_type,p.target_id);
 if b is distinct from p.source_binding then
  raise exception 'legacy_provenance_source_changed' using errcode='55000'; end if;
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 select * into s from private.deleted_content_media_stages where id=p_stage_id;
 select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id;
 if s.id is null or r.id is null or s.deletion_id is not null or r.status<>'staged'
  or s.reservation_id is not null or r.reservation_id is not null
  or s.legacy_provenance_id is distinct from p.id or r.legacy_provenance_id is distinct from p.id
  or (s.target_type,s.target_id,s.author,s.provider,s.bucket,s.object_key)
    is distinct from (p.target_type,p.target_id::text,p.author::text,p.provider,p.bucket,p.object_key)
  or (r.target_type,r.target_id,r.author,r.provider,r.bucket,r.object_key,r.source_created_at)
    is distinct from (p.target_type,p.target_id::text,p.author::text,p.provider,p.bucket,p.object_key,p.source_created_at)
  or exists(select 1 from public.media_upload_reservations u
    where u.storage_provider=p.provider and u.storage_bucket=p.bucket and u.storage_object_key=p.object_key) then
  raise exception 'legacy_delivery_revocation_staged_binding_required' using errcode='55000'; end if;
 -- Audit-only revocation does not lock the source. Keep the exact still-active
 -- historical receipt locked through first revocation; NOWAIT avoids inversion
 -- with migration writers. A durable exact retry above needs no mutable audit.
 if p.provenance_kind='supabase_copy_cutover' then
  if not private.supabase_copy_provenance_current(p) then raise exception 'copy_delivery_revocation_active_proof_required' using errcode='55000'; end if;
 else
 perform a.id from private.media_object_storage_migration_audit a
 where a.id=p.migration_audit_id and a.status='updated'
  and a.table_name=case p.target_type when 'creator_video' then 'videos' else 'social_attachments' end
  and a.row_id=p.target_id::text and a.new_storage_provider=p.provider
  and a.new_storage_bucket=p.bucket and a.new_storage_object_key=p.object_key
  and private.deleted_media_legacy_source_binding(p.target_type,a.row_after)=p.source_binding
  and jsonb_build_object('auditId',a.id,'binding',p.source_binding,'copiedVerifiedAt',a.copied_verified_at)=p.migration_audit_binding
 for share nowait;
 if not found then raise exception 'legacy_delivery_revocation_active_audit_required' using errcode='55000'; end if;
 end if;
 insert into private.deleted_media_legacy_delivery_revocations(legacy_provenance_id,stage_id,target_type,target_id,
  author,source_created_at,provider,bucket,object_key,source_binding)
 values(p.id,s.id,p.target_type,p.target_id,p.author,p.source_created_at,p.provider,p.bucket,p.object_key,p.source_binding)
 on conflict(legacy_provenance_id) do nothing;
 select * into receipt from private.deleted_media_legacy_delivery_revocations where legacy_provenance_id=p.id;
 if receipt.stage_id is distinct from s.id or receipt.source_binding is distinct from p.source_binding
  or (receipt.provider,receipt.bucket,receipt.object_key) is distinct from (p.provider,p.bucket,p.object_key) then
  raise exception 'legacy_delivery_revocation_identity_conflict' using errcode='55000'; end if;
 return jsonb_build_object('revoked',true,'source','legacy_provenance','alreadyRevoked',false);
end $$;

-- The predecessor implementations remain internal only. New entrypoints use
-- the same existing service-role trust boundary, not a new client permission.
revoke all on function
 private.lock_supabase_copy_cutover(),
 private.supabase_copy_cutover_source(private.supabase_original_copy_cutovers),
 private.supabase_copy_scan_receipt_matches(uuid,uuid),
 private.supabase_copy_provenance_current(private.deleted_media_legacy_provenance),
 private.deleted_media_legacy_source_supported(text,jsonb),
 private.deleted_media_legacy_source_supported_before_copy_cutover(text,jsonb),
 public.has_verified_legacy_media_object_provenance_before_copy_cutover(text,text,text,text,text),
 public.has_verified_legacy_video_object_provenance_before_copy_cutover(uuid,text,text,text)
 from public,anon,authenticated,service_role;
revoke all on function
 public.read_supabase_original_copy_cutover(uuid),
 public.commit_supabase_original_copy_cutover(uuid,uuid,text,jsonb),
 public.begin_supabase_copy_scan_observation(uuid,text,integer),
 public.record_supabase_copy_scan_receipt(uuid,uuid,text,text,bigint),
 public.enroll_supabase_copy_retention_provenance(uuid,uuid,text,text),
 public.has_verified_legacy_media_object_provenance(text,text,text,text,text),
 public.has_verified_legacy_video_object_provenance(uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function
 public.read_supabase_original_copy_cutover(uuid),
 public.commit_supabase_original_copy_cutover(uuid,uuid,text,jsonb),
 public.begin_supabase_copy_scan_observation(uuid,text,integer),
 public.record_supabase_copy_scan_receipt(uuid,uuid,text,text,bigint),
 public.enroll_supabase_copy_retention_provenance(uuid,uuid,text,text),
 public.has_verified_legacy_media_object_provenance(text,text,text,text,text),
 public.has_verified_legacy_video_object_provenance(uuid,text,text,text)
 to service_role;
commit;
