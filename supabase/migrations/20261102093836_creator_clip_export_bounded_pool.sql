-- Forward-only replacement of the global one-job scheduler. No workers are
-- registered or activated by this migration. Limits are resource/work counts,
-- NOT dollar budgets or authority to provision compute.
alter table private.creator_clip_export_worker
 add column max_active_jobs integer not null default 1 check(max_active_jobs between 1 and 32),
 add column max_pending_jobs integer not null default 1000 check(max_pending_jobs between 1 and 100000),
 add column max_pending_media_ms bigint not null default 900000000 check(max_pending_media_ms between 9000000 and 900000000000),
 add column accepting_requests boolean not null default true,
 add column scale_pool_id text check(scale_pool_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
 add column scale_zero_admission_enabled boolean not null default false,
 add column controller_admission_ready boolean not null default false,
 add column health_state text not null default 'unknown' check(health_state in('unknown','healthy','technical_delay')),
 add column health_observed_at timestamptz;
-- A separately qualified operator must activate the new registered runtime.
update private.creator_clip_export_worker set enabled=false,last_heartbeat_at=null;

create table private.creator_clip_export_workers (
 id uuid primary key,
 capacity integer not null default 1 check(capacity between 1 and 8),
 enabled boolean not null default false,
 draining boolean not null default false,
 qualification_note text not null check(length(btrim(qualification_note)) between 1 and 2000),
 session_id uuid, lease_until timestamptz, last_heartbeat_at timestamptz,
 check((session_id is null)=(lease_until is null))
);
create table private.creator_clip_export_fairness (
 owner_id text primary key, last_claimed_at timestamptz not null
);
-- Incarnations are one-use even after close/replacement. A delayed old process
-- cannot reopen its retired identity and regain authority over old work.
create table private.creator_clip_export_worker_sessions (
 worker_id uuid not null references private.creator_clip_export_workers(id),
 session_id uuid not null, created_at timestamptz not null default clock_timestamp(),
 primary key(worker_id,session_id)
);
alter table private.creator_clip_export_workers enable row level security;
alter table private.creator_clip_export_workers force row level security;
alter table private.creator_clip_export_fairness enable row level security;
alter table private.creator_clip_export_fairness force row level security;
alter table private.creator_clip_export_worker_sessions enable row level security;
alter table private.creator_clip_export_worker_sessions force row level security;
revoke all on private.creator_clip_export_workers,private.creator_clip_export_fairness,private.creator_clip_export_worker_sessions from public,anon,authenticated,service_role;
alter table private.creator_clip_export_jobs
 add column worker_id uuid references private.creator_clip_export_workers(id),
 add column worker_session uuid,
 add column started_at timestamptz,
 add column failure_class text check(failure_class in('input_permanent','source_or_cancel','dependency_auth','dependency_storage','dependency_database','worker_resource','output_unknown','unknown')),
 add column requested_media_ms bigint generated always as
  (greatest(1,coalesce((edit_snapshot->>'trim_end_ms')::bigint,9000000)-coalesce((edit_snapshot->>'trim_start_ms')::bigint,0))) stored;
create index creator_clip_export_active_worker on private.creator_clip_export_jobs(worker_id,lease_until) where status='rendering';
create index creator_clip_export_pending_owner on private.creator_clip_export_jobs(owner_id,status) where status in('queued','rendering');
create index creator_clip_export_arrivals on private.creator_clip_export_jobs(created_at);
create index creator_clip_export_recent_terminal on private.creator_clip_export_jobs(updated_at)
 where status in('ready','failed','canceled','stale');

-- Statement trigger takes the same mutex BEFORE any registry row lock. This
-- serializes operator capacity/disable changes with claims without lock inversion.
create function private.clip_export_registry_lock() returns trigger
language plpgsql set search_path='' as $$
begin
 perform 1 from private.creator_clip_export_worker where singleton for update;
 return null;
end $$;
create trigger creator_clip_export_registry_lock before insert or update or delete
 on private.creator_clip_export_workers for each statement execute function private.clip_export_registry_lock();

create function private.clip_export_worker_session_alive(p_worker_id uuid,p_session_id uuid) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.creator_clip_export_workers
  where id=p_worker_id and enabled and session_id=p_session_id and lease_until>clock_timestamp());
$$;

-- Additive safe presentation truth: old clients still receive the same status.
-- A missing/stale controller observation is never presented as healthy. Manual
-- one-worker operation may remain unbound and uses actual session liveness.
create or replace function private.clip_export_safe_status(j private.creator_clip_export_jobs) returns jsonb
language sql volatile set search_path='' as $$
 -- Completion history stays immutable in presentation: losing/deleting the
 -- draft does not undo the original completion or authorize its replay.
 select jsonb_build_object('id',j.id,'sourceVideoId',j.source_video_id,
  'status',case when j.status='ready' and not output.present then 'stale' else j.status end,
  'outputVideoId',case when j.status='ready' and output.present then j.output_video_id else null end,
  'errorCode',case when j.status='ready' and not output.present then 'output_unavailable' else j.error_code end,
  'attempts',j.attempts,'createdAt',j.created_at,'updatedAt',j.updated_at,
  'displayState',case
   when j.status not in('queued','rendering') then 'terminal'
   when not c.enabled then 'technical_delay'
   when j.status='rendering' then case when j.lease_until>clock_timestamp()
    and private.clip_export_worker_session_alive(j.worker_id,j.worker_session) then 'rendering' else 'technical_delay' end
   when c.scale_pool_id is not null and (c.health_state<>'healthy' or c.health_observed_at is null
    or c.health_observed_at<=clock_timestamp()-interval '2 minutes') then 'technical_delay'
   when not exists(select 1 from private.creator_clip_export_workers where enabled and not draining and lease_until>clock_timestamp())
    and not(c.scale_zero_admission_enabled and c.scale_pool_id is not null and c.controller_admission_ready
     and c.health_state='healthy' and c.health_observed_at<=clock_timestamp()
     and c.health_observed_at>clock_timestamp()-interval '2 minutes') then 'technical_delay'
   else 'queued' end)
 from private.creator_clip_export_worker c cross join lateral (
  select exists(select 1 from public.videos v where v.id=j.output_video_id
   and v.owner_id::text=j.owner_id and nullif(to_jsonb(v)->>'deleted_at','') is null) as present
 ) output where singleton;
$$;

create function public.open_creator_clip_export_worker(p_worker_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w private.creator_clip_export_workers;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 perform 1 from private.creator_clip_export_worker where singleton for update;
 select * into w from private.creator_clip_export_workers where id=p_worker_id for update;
 if p_session_id is null or w.id is null or not w.enabled or w.draining
  or not exists(select 1 from private.creator_clip_export_worker where singleton and enabled)
  or (w.lease_until>clock_timestamp() and w.session_id is distinct from p_session_id)
  or (w.session_id=p_session_id and w.lease_until<=clock_timestamp())
  or (w.session_id is distinct from p_session_id and exists(select 1 from private.creator_clip_export_worker_sessions
   where worker_id=p_worker_id and session_id=p_session_id))
 then return jsonb_build_object('accepted',false);end if;
 -- A fresh process never borrows the old process's session or active slots.
 -- Expired sessions cannot be resurrected, even by replaying their old open.
 insert into private.creator_clip_export_worker_sessions(worker_id,session_id) values(p_worker_id,p_session_id) on conflict do nothing;
 update private.creator_clip_export_workers set session_id=p_session_id,
  lease_until=clock_timestamp()+interval '2 minutes',last_heartbeat_at=clock_timestamp() where id=w.id;
 return jsonb_build_object('accepted',true,'capacity',w.capacity,'draining',false);
end $$;

create function public.heartbeat_creator_clip_export_worker(p_worker_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w private.creator_clip_export_workers;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 perform 1 from private.creator_clip_export_worker where singleton for update;
 select * into w from private.creator_clip_export_workers where id=p_worker_id for update;
 if not private.clip_export_worker_session_alive(p_worker_id,p_session_id)
  or not exists(select 1 from private.creator_clip_export_worker where singleton and enabled)
 then return jsonb_build_object('accepted',false);end if;
 update private.creator_clip_export_workers set lease_until=clock_timestamp()+interval '2 minutes',
  last_heartbeat_at=clock_timestamp() where id=w.id;
 update private.creator_clip_export_worker set last_heartbeat_at=clock_timestamp(),worker_version='clip-pool-v1' where singleton;
 return jsonb_build_object('accepted',true,'capacity',w.capacity,'draining',w.draining);
end $$;

create function public.close_creator_clip_export_worker(p_worker_id uuid,p_session_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 perform 1 from private.creator_clip_export_worker where singleton for update;
 if exists(select 1 from private.creator_clip_export_jobs where worker_id=p_worker_id
  and worker_session=p_session_id and status='rendering' and lease_until>clock_timestamp()) then return false;end if;
 update private.creator_clip_export_workers set session_id=null,lease_until=null
  where id=p_worker_id and session_id=p_session_id;
 return found;
end $$;

-- Old binaries cannot bypass registration. Retained only as a fail-closed
-- compatibility endpoint, not as a second scheduler.
create or replace function public.claim_creator_clip_export() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 return null;
end $$;

create function public.claim_creator_clip_export(p_worker_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.creator_clip_export_jobs;c private.creator_clip_export_worker;w private.creator_clip_export_workers;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 -- Same order as finish/output-begin and the immutable producer registry.
 -- Expiry must not race a late output dispatch into an automatic replacement.
 perform private.platform_brand_retention_lock();
 select * into c from private.creator_clip_export_worker where singleton for update;
 select * into w from private.creator_clip_export_workers where id=p_worker_id;
 if c.enabled is distinct from true or not private.clip_export_worker_session_alive(p_worker_id,p_session_id) or w.draining then return null;end if;
 if (select count(*) from private.creator_clip_export_jobs where status='rendering' and lease_until>clock_timestamp())>=c.max_active_jobs
  or (select count(*) from private.creator_clip_export_jobs where worker_id=p_worker_id and status='rendering' and lease_until>clock_timestamp())>=w.capacity
 then return null;end if;
 -- Once output production began, even an apparently unwritten producer can
 -- have uncertain dispatch. Preserve its records for explicit reconciliation.
 update private.creator_clip_export_jobs q set status='failed',error_code='output_reconciliation_required',failure_class='output_unknown',
  lease_until=null,updated_at=clock_timestamp()
  where q.status='rendering' and q.lease_until<=clock_timestamp()
   and exists(select 1 from private.secondary_media_producers p where p.id=q.lease);
 update private.creator_clip_export_jobs set status='failed',error_code='retry_limit',failure_class='unknown',lease=null,lease_until=null,updated_at=clock_timestamp()
  where status='rendering' and lease_until<=clock_timestamp() and attempts>=3;
 -- Round robin among admitted creators, FIFO within a creator. One creator
 -- can hold only one live lease even if all three pending requests are theirs.
 select q.* into j from private.creator_clip_export_jobs q
 left join private.creator_clip_export_fairness f on f.owner_id=q.owner_id
 where (q.status='queued' or (q.status='rendering' and q.lease_until<=clock_timestamp())) and q.attempts<3
  and not exists(select 1 from private.creator_clip_export_jobs a where a.owner_id=q.owner_id
   and a.status='rendering' and a.lease_until>clock_timestamp())
 -- New creators join at their enqueue time, not negative infinity: continuous
 -- new arrivals cannot indefinitely jump a previously served waiting creator.
 order by coalesce(f.last_claimed_at,q.created_at),q.created_at,q.id limit 1 for update of q skip locked;
 if j.id is null then return null;end if;
 if j.source_snapshot is distinct from private.clip_export_source_snapshot(j.source_video_id)
  or not private.clip_export_subject_allowed(j.owner_id)
 then
  update private.creator_clip_export_jobs set status='stale',error_code='source_changed',lease=null,lease_until=null,updated_at=clock_timestamp() where id=j.id;
  return null;
 end if;
 update private.creator_clip_export_jobs set status='rendering',attempts=attempts+1,lease=extensions.gen_random_uuid(),
  lease_until=clock_timestamp()+interval '2 minutes',output_video_id=extensions.gen_random_uuid(),updated_at=clock_timestamp(),
  worker_id=p_worker_id,worker_session=p_session_id,started_at=clock_timestamp() where id=j.id returning * into j;
 insert into private.creator_clip_export_fairness(owner_id,last_claimed_at) values(j.owner_id,clock_timestamp())
  on conflict(owner_id) do update set last_claimed_at=excluded.last_claimed_at;
 return to_jsonb(j);
end $$;

create function public.begin_creator_clip_export_output(p_job_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.creator_clip_export_jobs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 perform private.platform_brand_retention_lock();
 perform 1 from private.creator_clip_export_worker where singleton for update;
 select * into j from private.creator_clip_export_jobs where id=p_job_id for update;
 if j.id is null or j.lease is distinct from p_lease or j.status<>'rendering' or j.lease_until<=clock_timestamp()
  or not private.clip_export_worker_session_alive(j.worker_id,j.worker_session)
  or not exists(select 1 from private.creator_clip_export_worker where singleton and enabled)
 then raise exception 'clip_export_stale_lease';end if;
 if not public.heartbeat_creator_clip_export(p_job_id,p_lease) then raise exception 'clip_export_source_changed';end if;
 return public.begin_secondary_media_producer('creator_video',j.source_video_id,p_lease,
  j.source_snapshot->'sourceBinding','cloudflare_r2','chillywood-media-origin',
  j.owner_id||'/'||j.output_video_id::text||'/'||p_lease::text||'/');
end $$;
revoke all on function public.begin_creator_clip_export_output(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.begin_creator_clip_export_output(uuid,uuid) to service_role;

create function public.read_creator_clip_export_pool_metrics() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.creator_clip_export_worker;result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into c from private.creator_clip_export_worker where singleton;
 select jsonb_build_object('enabled',c.enabled,'acceptingRequests',c.accepting_requests,
  'globalCapacity',c.max_active_jobs,'pendingLimit',c.max_pending_jobs,'pendingMediaMsLimit',c.max_pending_media_ms,
  'queued',count(*) filter(where status='queued'),'active',count(*) filter(where status='rendering' and lease_until>clock_timestamp()),
  'expired',count(*) filter(where status='rendering' and lease_until<=clock_timestamp()),
  'pendingMediaMs',coalesce(sum(requested_media_ms) filter(where status in('queued','rendering')),0),
  'oldestQueuedSeconds',coalesce(extract(epoch from clock_timestamp()-min(created_at) filter(where status='queued')),0))
 into result from private.creator_clip_export_jobs where status in('queued','rendering');
 return result||jsonb_build_object('observedAt',clock_timestamp(),'outcomesLastHour',(select jsonb_build_object(
  'completed',count(*) filter(where status='ready'),'failed',count(*) filter(where status='failed'),
  'stale',count(*) filter(where status='stale'),'canceled',count(*) filter(where status='canceled'),
  'meanProcessingSeconds',avg(extract(epoch from updated_at-started_at)) filter(where status='ready' and started_at is not null),
  'p95ProcessingSeconds',percentile_cont(0.95) within group(order by extract(epoch from updated_at-started_at)) filter(where status='ready' and started_at is not null),
  'meanQueueWaitSeconds',avg(extract(epoch from started_at-created_at)) filter(where status='ready' and started_at is not null))
  from private.creator_clip_export_jobs where status in('ready','failed','canceled','stale') and updated_at>clock_timestamp()-interval '1 hour'),
 'failedByClassLastHour',(select coalesce(jsonb_object_agg(failure_class,n),'{}'::jsonb) from
  (select coalesce(failure_class,'unknown') as failure_class,count(*) as n from private.creator_clip_export_jobs
   where status='failed' and updated_at>clock_timestamp()-interval '1 hour' group by coalesce(failure_class,'unknown')) failures),
 'workers',(select jsonb_build_object(
  'ready',count(*) filter(where enabled and not draining and lease_until>clock_timestamp()),
  'draining',count(*) filter(where enabled and draining and lease_until>clock_timestamp()),
  'approvedCapacity',coalesce(sum(capacity) filter(where enabled),0)) from private.creator_clip_export_workers));
end $$;

revoke all on function private.clip_export_registry_lock(),private.clip_export_worker_session_alive(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.open_creator_clip_export_worker(uuid,uuid),public.heartbeat_creator_clip_export_worker(uuid,uuid),public.close_creator_clip_export_worker(uuid,uuid),public.claim_creator_clip_export(uuid,uuid),public.read_creator_clip_export_pool_metrics() from public,anon,authenticated,service_role;
grant execute on function public.open_creator_clip_export_worker(uuid,uuid),public.heartbeat_creator_clip_export_worker(uuid,uuid),public.close_creator_clip_export_worker(uuid,uuid),public.claim_creator_clip_export(uuid,uuid),public.read_creator_clip_export_pool_metrics() to service_role;

-- Preserve only typed, non-sensitive failure codes. Classification is server
-- derived; a render worker cannot turn an outage into successful throughput.
create function private.clip_export_failure_class(p_code text) returns text
language sql immutable set search_path='' as $$
 select case
 when p_code in('invalid_render_format','invalid_trim_range','invalid_watermark_choice','invalid_source_probe','trim_outside_source','invalid_watermark_probe','probe_output_limit') then 'input_permanent'
 when p_code in('render_canceled','source_changed','clip_export_stale_lease','clip_export_source_changed','clip_source_identity_invalid','watermark_bytes_required') then 'source_or_cancel'
 when p_code in('clip_source_auth_failed','worker_rpc_auth_failed','clip_origin_configuration_invalid') then 'dependency_auth'
 when p_code in('clip_source_download_failed') then 'dependency_storage'
 when p_code in('worker_rpc_unavailable') then 'dependency_database'
 when p_code in('clip_worker_disk_full','clip_worker_filesystem_denied','media_binary_unavailable','worker_disk_capacity_exhausted','worker_oom') then 'worker_resource'
 when p_code in('clip_output_write_unknown','clip_output_conflict','clip_output_readback_failed','clip_output_identity_changed','clip_output_size_mismatch','clip_output_digest_mismatch','completion_unknown','output_reconciliation_required','producer_not_admitted','output_not_reserved','output_not_sealed') then 'output_unknown'
 when p_code in('media_process_failed','render_timeout','invalid_probe_json','render_output_mismatch','clip_source_download_invalid','clip_source_size_mismatch','clip_source_size_exceeded','clip_file_size_invalid','clip_file_changed','clip_output_changed','clip_output_identity_invalid','immutable_source_required','render_output_exists','worker_failed') then 'unknown'
 else 'unknown' end;
$$;
revoke all on function private.clip_export_failure_class(text) from public,anon,authenticated,service_role;

create or replace function public.fail_creator_clip_export(p_job_id uuid,p_lease uuid,p_error_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare code text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 code:=case when p_error_code in('invalid_render_format','invalid_trim_range','invalid_watermark_choice','invalid_source_probe','trim_outside_source','invalid_watermark_probe','probe_output_limit','render_canceled','source_changed','clip_export_stale_lease','clip_export_source_changed','clip_source_identity_invalid','watermark_bytes_required','clip_source_auth_failed','worker_rpc_auth_failed','clip_origin_configuration_invalid','clip_source_download_failed','worker_rpc_unavailable','clip_worker_disk_full','clip_worker_filesystem_denied','media_binary_unavailable','worker_disk_capacity_exhausted','worker_oom','clip_output_write_unknown','clip_output_conflict','clip_output_readback_failed','clip_output_identity_changed','clip_output_size_mismatch','clip_output_digest_mismatch','completion_unknown','output_reconciliation_required','producer_not_admitted','output_not_reserved','output_not_sealed','media_process_failed','render_timeout','invalid_probe_json','render_output_mismatch','clip_source_download_invalid','clip_source_size_mismatch','clip_source_size_exceeded','clip_file_size_invalid','clip_file_changed','clip_output_changed','clip_output_identity_invalid','immutable_source_required','render_output_exists','worker_failed') then p_error_code else 'worker_failed' end;
 update private.creator_clip_export_jobs set status='failed',error_code=code,
  failure_class=private.clip_export_failure_class(code),lease_until=null,updated_at=clock_timestamp()
 where id=p_job_id and lease=p_lease and status='rendering';
 return found;
end $$;

create or replace function public.request_creator_clip_export(p_video_id uuid,p_request_id uuid,p_edit jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:=private.clip_export_actor();v public.videos;e public.creator_clip_edits;
 j private.creator_clip_export_jobs;snapshot jsonb;mark jsonb;c private.creator_clip_export_worker;pending_count bigint;pending_media bigint;request_media bigint;
begin
 if p_request_id is null then raise exception 'clip_export_request_id_required';end if;
 -- Owner serialization bounds queue size and makes lost-response retries exact.
 perform pg_advisory_xact_lock(hashtextextended('clip-export:'||actor,0));
 actor:=private.clip_export_actor();
 select * into j from private.creator_clip_export_jobs where owner_id=actor and request_id=p_request_id;
 if j.id is not null then
  if j.source_video_id is distinct from p_video_id or p_edit is distinct from jsonb_build_object(
    'clip_format',j.edit_snapshot->'clip_format','fit_mode',j.edit_snapshot->'fit_mode',
    'trim_start_ms',j.edit_snapshot->'trim_start_ms','trim_end_ms',j.edit_snapshot->'trim_end_ms',
    'brand_mark_enabled',j.edit_snapshot->'brand_mark_enabled','brand_asset_id',j.edit_snapshot->'brand_asset_id')
   then raise exception 'clip_export_request_mismatch';end if;
  return private.clip_export_safe_status(j);
 end if;
 if not exists(select 1 from private.creator_clip_export_worker where singleton and enabled)
 then raise exception 'clip_export_worker_unavailable';end if;
 select * into v from public.videos where id=p_video_id for share;
 if v.id is null or v.owner_id::text is distinct from actor or coalesce(to_jsonb(v)->>'deleted_at','')<>''
  or v.scan_status is distinct from 'clean' or coalesce(v.moderation_status,'') not in('clean','reported')
  or coalesce(v.storage_provider,'') not in('supabase','cloudflare_r2','s3')
  or coalesce(v.file_size_bytes,0) not between 1 and 5368709120
  or lower(coalesce(v.mime_type,'')) not in('video/mp4','video/quicktime','video/webm','video/x-m4v')
  or nullif(v.storage_bucket,'') is null or nullif(coalesce(v.storage_object_key,v.storage_path),'') is null
 then raise exception 'clip_export_source_not_ready';end if;
 select * into e from public.creator_clip_edits where video_id=p_video_id and owner_user_id=actor for share;
 if e.video_id is null then raise exception 'clip_export_save_edit_first';end if;
 if p_edit is distinct from jsonb_build_object('clip_format',e.clip_format,'fit_mode',e.fit_mode,
  'trim_start_ms',e.trim_start_ms,'trim_end_ms',e.trim_end_ms,
  'brand_mark_enabled',e.brand_mark_enabled,'brand_asset_id',e.brand_asset_id)
 then raise exception 'clip_export_edit_changed';end if;
 if coalesce(e.trim_start_ms,0)>=9000000 or coalesce(e.trim_end_ms,9000000)>9000000
  or (e.trim_end_ms is not null and e.trim_end_ms<=coalesce(e.trim_start_ms,0))
 then raise exception 'clip_export_invalid_trim';end if;
 if e.brand_mark_enabled then
  select to_jsonb(a) into mark from public.platform_brand_assets a where a.id=e.brand_asset_id
   and a.owner_user_id=actor and a.asset_type in('logo','avatar','watermark')
   and a.asset_state='published' and a.moderation_status in('clean','reported')
   and a.scan_status='clean' and a.deleted_at is null
   and a.mime_type in('image/png','image/jpeg','image/webp') and a.file_size_bytes between 1 and 20971520 for share;
  if mark is null then raise exception 'clip_export_watermark_not_ready';end if;
 end if;
 snapshot:=private.clip_export_source_snapshot(p_video_id);
 -- Reopening a screen after a lost response may lose the local request UUID.
 -- The exact saved source/edit still identifies the already-running result.
 select * into j from private.creator_clip_export_jobs where owner_id=actor and source_video_id=p_video_id
  and source_snapshot=snapshot and edit_snapshot=to_jsonb(e) and watermark_snapshot is not distinct from mark
  -- A fresh explicit request may replace a deleted draft, but an existing
  -- owned draft (including one awaiting scan/review) still deduplicates.
  and (status in('queued','rendering') or (status='ready' and exists(
   select 1 from public.videos output where output.id=output_video_id
    and output.owner_id::text=actor and nullif(to_jsonb(output)->>'deleted_at','') is null)))
  order by created_at desc,id desc limit 1;
 if j.id is not null then return private.clip_export_safe_status(j);end if;
 if (select count(*) from private.creator_clip_export_jobs where owner_id=actor and status in('queued','rendering'))>=3
 then raise exception 'clip_export_queue_full';end if;
 -- Take the short admission mutex AFTER source/edit/mark row locks. Taking it
 -- before those rows can invert the retention/finish lock order. Claims never
 -- wait for this owner's advisory lock; media I/O never happens in a transaction.
 select * into c from private.creator_clip_export_worker where singleton for update;
 actor:=private.clip_export_actor();
 if c.enabled is distinct from true then raise exception 'clip_export_worker_unavailable';end if;
 if not c.accepting_requests then
  raise exception 'clip_export_admission_paused' using detail='{"reason":"admission_paused","retryAfterSeconds":30,"jobCreated":false}';
 end if;
 if not exists(select 1 from private.creator_clip_export_workers where enabled and not draining and lease_until>clock_timestamp()) then
  -- Min-zero needs real demand to wake, but binding alone is not readiness.
  -- Only a separately opted-in, currently healthy authorized controller may
  -- accept bounded backlog without a renderer. No completion is required.
  if c.scale_zero_admission_enabled and c.scale_pool_id is not null then
   if c.controller_admission_ready is distinct from true or c.health_state<>'healthy'
    or c.health_observed_at is null or c.health_observed_at>clock_timestamp()
    or c.health_observed_at<=clock_timestamp()-interval '2 minutes'
    or not exists(select 1 from private.creator_clip_scale_ledger where pool_id=c.scale_pool_id)
   then raise exception 'clip_export_admission_paused'
    using detail='{"reason":"processing_technical_delay","retryAfterSeconds":30,"jobCreated":false}';end if;
  else raise exception 'clip_export_worker_unavailable';end if;
 end if;
 request_media:=greatest(1,coalesce(e.trim_end_ms,9000000)-coalesce(e.trim_start_ms,0));
 select count(*),coalesce(sum(requested_media_ms),0) into pending_count,pending_media
  from private.creator_clip_export_jobs where status in('queued','rendering');
 if pending_count>=c.max_pending_jobs or pending_media+request_media>c.max_pending_media_ms then
  raise exception 'clip_export_capacity_exhausted' using detail='{"reason":"capacity_exhausted","retryAfterSeconds":30,"jobCreated":false}';
 end if;
 insert into private.creator_clip_export_jobs(owner_id,source_video_id,request_id,source_snapshot,edit_snapshot,watermark_snapshot)
 values(actor,p_video_id,p_request_id,snapshot,to_jsonb(e),mark) returning * into j;
 return private.clip_export_safe_status(j);
end $$;

create or replace function public.heartbeat_creator_clip_export(p_job_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.creator_clip_export_jobs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 perform 1 from private.creator_clip_export_worker where singleton for update;
 select * into j from private.creator_clip_export_jobs where id=p_job_id for update;
 if j.status is distinct from 'rendering' or j.lease is distinct from p_lease or j.lease_until<=clock_timestamp()
  or not exists(select 1 from private.creator_clip_export_worker where singleton and enabled)
  or not private.clip_export_worker_session_alive(j.worker_id,j.worker_session)
  or j.source_snapshot is distinct from private.clip_export_source_snapshot(j.source_video_id)
  or not private.clip_export_subject_allowed(j.owner_id)
  or (j.watermark_snapshot is not null and j.watermark_snapshot is distinct from
    (select to_jsonb(a) from public.platform_brand_assets a where a.id=(j.edit_snapshot->>'brand_asset_id')::uuid))
 then return false;end if;
 update private.creator_clip_export_jobs set lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() where id=j.id;
 update private.creator_clip_export_worker set last_heartbeat_at=clock_timestamp() where singleton;
 return true;
end $$;

create or replace function public.finish_creator_clip_export(p_job_id uuid,p_lease uuid,p_object_key text,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.creator_clip_export_jobs;v public.videos;output public.videos;
 producer private.secondary_media_producers;obj private.secondary_media_objects;mark jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 perform private.platform_brand_retention_lock();
 perform 1 from private.creator_clip_export_worker where singleton for update;
 select * into j from private.creator_clip_export_jobs where id=p_job_id for update;
 if j.id is null or j.lease is distinct from p_lease then raise exception 'clip_export_stale_lease';end if;
 if j.status='ready' then return private.clip_export_safe_status(j);end if;
 if j.status<>'rendering' or j.lease_until<=clock_timestamp()
  or not exists(select 1 from private.creator_clip_export_worker where singleton and enabled)
  or not private.clip_export_worker_session_alive(j.worker_id,j.worker_session)
 then raise exception 'clip_export_stale_lease';end if;
 select * into v from public.videos where id=j.source_video_id for share;
 if j.source_snapshot is distinct from private.clip_export_source_snapshot(j.source_video_id)
  or not private.clip_export_subject_allowed(j.owner_id)
  or not exists(select 1 from auth.users where id::text=j.owner_id and deleted_at is null)
 then raise exception 'clip_export_source_changed';end if;
 if (j.edit_snapshot->>'brand_mark_enabled')::boolean then
  select to_jsonb(a) into mark from public.platform_brand_assets a where id=(j.edit_snapshot->>'brand_asset_id')::uuid for share;
  if mark is distinct from j.watermark_snapshot then raise exception 'clip_export_watermark_changed';end if;
 end if;
 select * into producer from private.secondary_media_producers where id=p_lease;
 select * into obj from private.secondary_media_objects where producer_id=p_lease and object_key=p_object_key;
 if producer.state is distinct from 'sealed' or producer.source_binding is distinct from j.source_snapshot->'sourceBinding'
  or obj.id is null or obj.receipt is null or obj.object_role<>'render'
  or p_object_key is distinct from j.owner_id||'/'||j.output_video_id::text||'/'||p_lease::text||'/export.mp4'
  or obj.sha256 is distinct from p_result->>'sha256' or obj.size_bytes is distinct from (p_result->>'sizeBytes')::bigint
  or p_result->>'workerVersion' is distinct from 'clip-render-v1' or p_result->>'mimeType' is distinct from 'video/mp4'
  or coalesce((p_result->>'durationMs')::integer,0) not between 1 and 9000000
  or coalesce((p_result->>'width')::integer,0) not between 2 and 1080
  or coalesce((p_result->>'height')::integer,0) not between 2 and 1080
 then raise exception 'clip_export_output_not_verified';end if;
 insert into public.videos(id,owner_id,title,description,visibility,moderation_status,scan_status,
  storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
 values(j.output_video_id,v.owner_id,left(v.title||' · Export',200),v.description,'draft',v.moderation_status,'pending_scan',
  case when obj.provider='hetzner_s3' then 's3' else obj.provider end,obj.bucket,obj.object_key,obj.object_key,'video/mp4',obj.size_bytes)
 returning * into output;
 perform private.attach_secondary_media_output(p_lease,p_object_key,'creator_video',output.id,
  private.deleted_media_legacy_source_binding('creator_video',to_jsonb(output)));
 update private.creator_clip_export_jobs set status='ready',output_receipt=p_result,lease_until=null,
  updated_at=clock_timestamp() where id=j.id returning * into j;
 return private.clip_export_safe_status(j);
end $$;
