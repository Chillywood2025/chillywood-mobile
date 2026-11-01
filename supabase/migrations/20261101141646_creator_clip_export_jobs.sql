-- Private rendering: originals are never overwritten and exports remain drafts.
create table private.creator_clip_export_worker (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 last_heartbeat_at timestamptz,
 worker_version text
);
insert into private.creator_clip_export_worker(singleton) values(true);
create table private.creator_clip_export_jobs (
 id uuid primary key default extensions.gen_random_uuid(),
 owner_id text not null, source_video_id uuid not null,
 request_id uuid not null, source_snapshot jsonb not null, edit_snapshot jsonb not null,
 watermark_snapshot jsonb,
 status text not null default 'queued' check(status in('queued','rendering','ready','failed','canceled','stale')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 lease uuid, lease_until timestamptz, output_video_id uuid,
 output_receipt jsonb, error_code text,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(owner_id,request_id)
);
create index creator_clip_export_due on private.creator_clip_export_jobs(status,created_at);
alter table private.creator_clip_export_jobs enable row level security;
alter table private.creator_clip_export_jobs force row level security;
alter table private.creator_clip_export_worker enable row level security;
alter table private.creator_clip_export_worker force row level security;
revoke all on private.creator_clip_export_jobs,private.creator_clip_export_worker from public,anon,authenticated,service_role;

create function private.clip_export_source_snapshot(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',v.id,'owner_id',v.owner_id,'created_at',v.created_at,
  'storage_provider',v.storage_provider,'storage_bucket',v.storage_bucket,
  'storage_object_key',v.storage_object_key,'storage_path',v.storage_path,
  'file_size_bytes',v.file_size_bytes,'mime_type',v.mime_type,
  'scan_status',v.scan_status,'moderation_status',v.moderation_status,
  'deleted_at',to_jsonb(v)->'deleted_at',
  'sourceBinding',private.deleted_media_legacy_source_binding('creator_video',to_jsonb(v)))
 from public.videos v where v.id=p_id;
$$;
create function private.clip_export_actor() returns text language plpgsql volatile set search_path='' as $$
declare actor text:=auth.uid()::text;
begin
 if actor is null or not public.whole_app_exact_current_session_authority_internal()
  or public.is_account_access_restricted(actor)
  or not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
   where u.id=auth.uid() and u.deleted_at is null and s.id::text=auth.jwt()->>'session_id'
   and (s.not_after is null or s.not_after>clock_timestamp()))
 then raise exception 'clip_export_current_session_required';end if;
 if not public.has_active_premium_creator_tool_access(actor) or not private.clip_export_subject_allowed(actor)
 then raise exception 'clip_export_premium_required';end if;
 return actor;
end $$;
create function private.clip_export_safe_status(j private.creator_clip_export_jobs) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',j.id,'sourceVideoId',j.source_video_id,'status',j.status,
  'outputVideoId',case when j.status='ready' then j.output_video_id else null end,
  'errorCode',j.error_code,'attempts',j.attempts,'createdAt',j.created_at,'updatedAt',j.updated_at);
$$;
create function private.clip_export_subject_allowed(p_owner text) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from auth.users where id::text=p_owner and deleted_at is null)
  and not public.is_account_access_restricted(p_owner)
  and ((public.premium_subject_has_finite_authority_internal(p_owner) and exists(
   select 1 from public.user_entitlements where user_id=p_owner and entitlement_key='premium' and expires_at>clock_timestamp()))
   or (public.platform_subject_has_role_internal(p_owner,array['owner','operator']) and exists(
    select 1 from public.platform_role_memberships where user_id=p_owner and status='active' and role in('owner','operator')
     and (expires_at is null or expires_at>clock_timestamp()))));
$$;

create function public.request_creator_clip_export(p_video_id uuid,p_request_id uuid,p_edit jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:=private.clip_export_actor();v public.videos;e public.creator_clip_edits;
 j private.creator_clip_export_jobs;snapshot jsonb;mark jsonb;
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
 if not exists(select 1 from private.creator_clip_export_worker where singleton and enabled
  and last_heartbeat_at>clock_timestamp()-interval '2 minutes') then raise exception 'clip_export_worker_unavailable';end if;
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
  and status in('queued','rendering','ready') order by created_at desc,id desc limit 1;
 if j.id is not null then return private.clip_export_safe_status(j);end if;
 if (select count(*) from private.creator_clip_export_jobs where owner_id=actor and status in('queued','rendering'))>=3
 then raise exception 'clip_export_queue_full';end if;
 insert into private.creator_clip_export_jobs(owner_id,source_video_id,request_id,source_snapshot,edit_snapshot,watermark_snapshot)
 values(actor,p_video_id,p_request_id,snapshot,to_jsonb(e),mark) returning * into j;
 return private.clip_export_safe_status(j);
end $$;

create function public.read_creator_clip_export(p_video_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:=private.clip_export_actor();j private.creator_clip_export_jobs;
begin
 select * into j from private.creator_clip_export_jobs where source_video_id=p_video_id and owner_id=actor order by created_at desc,id desc limit 1;
 if j.id is null then return null;end if;
 return private.clip_export_safe_status(j);
end $$;
create function public.cancel_creator_clip_export(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:=private.clip_export_actor();j private.creator_clip_export_jobs;
begin
 select * into j from private.creator_clip_export_jobs where id=p_job_id and owner_id=actor for update;
 actor:=private.clip_export_actor();
 if j.id is null then raise exception 'clip_export_not_found';end if;
 if j.status in('queued','rendering') then
  update private.creator_clip_export_jobs set status='canceled',lease=null,lease_until=null,updated_at=clock_timestamp()
   where id=j.id returning * into j;
 end if;
 return private.clip_export_safe_status(j);
end $$;

create function public.claim_creator_clip_export() returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.creator_clip_export_jobs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 perform 1 from private.creator_clip_export_worker where singleton for update;
 if not exists(select 1 from private.creator_clip_export_worker where singleton and enabled) then return null;end if;
 update private.creator_clip_export_worker set last_heartbeat_at=clock_timestamp(),worker_version='clip-render-v1' where singleton;
 if exists(select 1 from private.creator_clip_export_jobs where status='rendering' and lease_until>clock_timestamp()) then return null;end if;
 update private.creator_clip_export_jobs set status='failed',error_code='retry_limit',lease=null,lease_until=null
  where status='rendering' and lease_until<=clock_timestamp() and attempts>=3;
 select * into j from private.creator_clip_export_jobs where (status='queued' or (status='rendering' and lease_until<=clock_timestamp()))
  and attempts<3 order by created_at,id limit 1 for update skip locked;
 if j.id is null then return null;end if;
 if j.source_snapshot is distinct from private.clip_export_source_snapshot(j.source_video_id)
  or not private.clip_export_subject_allowed(j.owner_id)
 then
  update private.creator_clip_export_jobs set status='stale',error_code='source_changed',updated_at=clock_timestamp() where id=j.id;
  return null;
 end if;
 update private.creator_clip_export_jobs set status='rendering',attempts=attempts+1,lease=extensions.gen_random_uuid(),
  lease_until=clock_timestamp()+interval '2 minutes',output_video_id=extensions.gen_random_uuid(),updated_at=clock_timestamp()
  where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

create function public.heartbeat_creator_clip_export(p_job_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.creator_clip_export_jobs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 perform 1 from private.creator_clip_export_worker where singleton for update;
 select * into j from private.creator_clip_export_jobs where id=p_job_id for update;
 if j.status is distinct from 'rendering' or j.lease is distinct from p_lease or j.lease_until<=clock_timestamp()
  or not exists(select 1 from private.creator_clip_export_worker where singleton and enabled)
  or j.source_snapshot is distinct from private.clip_export_source_snapshot(j.source_video_id)
  or not private.clip_export_subject_allowed(j.owner_id)
  or (j.watermark_snapshot is not null and j.watermark_snapshot is distinct from
    (select to_jsonb(a) from public.platform_brand_assets a where a.id=(j.edit_snapshot->>'brand_asset_id')::uuid))
 then return false;end if;
 update private.creator_clip_export_jobs set lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() where id=j.id;
 update private.creator_clip_export_worker set last_heartbeat_at=clock_timestamp() where singleton;
 return true;
end $$;

create function public.fail_creator_clip_export(p_job_id uuid,p_lease uuid,p_error_code text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 update private.creator_clip_export_jobs set status='failed',error_code=case when p_error_code in
  ('invalid_source_probe','trim_outside_source','render_timeout','render_output_mismatch','source_changed','worker_failed')
  then p_error_code else 'worker_failed' end,lease_until=null,updated_at=clock_timestamp()
 where id=p_job_id and lease=p_lease and status='rendering';
 return found;
end $$;

create function public.finish_creator_clip_export(p_job_id uuid,p_lease uuid,p_object_key text,p_result jsonb) returns jsonb
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

revoke all on function private.clip_export_source_snapshot(uuid),private.clip_export_actor(),private.clip_export_subject_allowed(text),private.clip_export_safe_status(private.creator_clip_export_jobs) from public,anon,authenticated,service_role;
revoke all on function public.request_creator_clip_export(uuid,uuid,jsonb),public.read_creator_clip_export(uuid),public.cancel_creator_clip_export(uuid),public.claim_creator_clip_export(),public.heartbeat_creator_clip_export(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_creator_clip_export(uuid,uuid,jsonb),public.read_creator_clip_export(uuid),public.cancel_creator_clip_export(uuid) to authenticated;
grant execute on function public.claim_creator_clip_export(),public.heartbeat_creator_clip_export(uuid,uuid) to service_role;
revoke all on function public.fail_creator_clip_export(uuid,uuid,text),public.finish_creator_clip_export(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fail_creator_clip_export(uuid,uuid,text),public.finish_creator_clip_export(uuid,uuid,text,jsonb) to service_role;
