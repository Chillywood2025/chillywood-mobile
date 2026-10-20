-- SOURCE ONLY. No rollout evidence, flags, worker schedule, grants to consumers,
-- provider settings or legacy objects are changed by this migration.
-- Evidence references are privileged operator assertions, not proof inferred by
-- PostgreSQL. Inventory and admission safety are independently machine checked.
alter table private.deleted_content_retention_settings
 add column legacy_object_deletes_blocked boolean not null default false,
 add column legacy_object_deletes_blocked_at timestamptz,
 add constraint deleted_content_legacy_gate_clock check(legacy_object_deletes_blocked=(legacy_object_deletes_blocked_at is not null)),
 add constraint deleted_content_capture_legacy_gate check(not capture_enabled or legacy_object_deletes_blocked);
create function private.preserve_deleted_content_legacy_gate() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.legacy_object_deletes_blocked and not old.legacy_object_deletes_blocked then
   new.legacy_object_deletes_blocked_at:=clock_timestamp();
 elsif not new.legacy_object_deletes_blocked and old.legacy_object_deletes_blocked then
   if exists(select 1 from private.deleted_media_reference_fence where singleton and armed) then
     raise exception 'retention_legacy_delete_gate_permanent_after_activation' using errcode='55000';
   end if;
   new.legacy_object_deletes_blocked_at:=null;
 elsif new.legacy_object_deletes_blocked_at is distinct from old.legacy_object_deletes_blocked_at then
   raise exception 'retention_legacy_delete_gate_clock_server_owned' using errcode='55000';
 end if;
 return new;
end $$;
create trigger deleted_content_legacy_delete_gate_clock before update on private.deleted_content_retention_settings
for each row execute function private.preserve_deleted_content_legacy_gate();
revoke all on function private.preserve_deleted_content_legacy_gate() from public,anon,authenticated,service_role;

create table private.deleted_content_rollout_qualification (
 singleton boolean primary key default true check(singleton),
 source_revision text check(source_revision ~ '^[0-9a-f]{40}$'),
 client_enforcement_evidence text check(length(btrim(client_enforcement_evidence)) between 1 and 512),
 legacy_delete_drain_evidence text check(length(btrim(legacy_delete_drain_evidence)) between 1 and 512),
 worker_schedule_evidence text check(length(btrim(worker_schedule_evidence)) between 1 and 512),
 origin_cleanup_evidence text check(length(btrim(origin_cleanup_evidence)) between 1 and 512),
 qualified_at timestamptz
);
insert into private.deleted_content_rollout_qualification(singleton) values(true);
create table private.deleted_content_worker_health (
 singleton boolean primary key default true check(singleton),
 last_completed_at timestamptz
);
insert into private.deleted_content_worker_health(singleton) values(true);
alter table private.deleted_content_rollout_qualification enable row level security;
alter table private.deleted_content_rollout_qualification force row level security;
alter table private.deleted_content_worker_health enable row level security;
alter table private.deleted_content_worker_health force row level security;
revoke all on private.deleted_content_rollout_qualification,private.deleted_content_worker_health
 from public,anon,authenticated,service_role;

-- Completion means only that a trusted worker finished a bounded pass, including
-- a disabled probe. It does not prove a schedule exists, origin cleanup works,
-- every object is absent, or consumer rollout has happened.
create function public.record_deleted_content_worker_heartbeat() returns void
language sql security definer set search_path='' as $$
 update private.deleted_content_worker_health set last_completed_at=clock_timestamp() where singleton
$$;
revoke all on function public.record_deleted_content_worker_heartbeat() from public,anon,authenticated;
grant execute on function public.record_deleted_content_worker_heartbeat() to service_role;

-- The ordinary upload flow records a video_renditions "original" alias. Accept
-- only the exact same proven object; a label is not proof of original bytes.
create function private.deleted_content_original_rendition_alias(p_alias jsonb,p_source jsonb) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(
   p_alias->>'quality_label'='original'
   and p_source->>'storage_provider'='cloudflare_r2'
   and p_source->>'storage_bucket'='chillywood-media-origin'
   and p_alias->>'video_id'=p_source->>'id' and p_alias->>'owner_id'=p_source->>'owner_id'
   and p_alias->>'storage_bucket'=p_source->>'storage_bucket'
   and p_alias->>'storage_path'=coalesce(nullif(p_source->>'storage_object_key',''),p_source->>'storage_path')
   and left(p_alias->>'storage_path',length((p_source->>'owner_id')||'/'||(p_source->>'id')||'/source.'))
     =(p_source->>'owner_id')||'/'||(p_source->>'id')||'/source.'
   and substr(p_alias->>'storage_path',length((p_source->>'owner_id')||'/'||(p_source->>'id')||'/source.')+1) ~ '^[a-z0-9]{1,10}$'
   and nullif(p_source->>'created_at','') is not null
   and not exists(select 1 from jsonb_each(private.deleted_media_locator_document(p_alias,'public.video_renditions'::regclass)) x(k,v)
     where k<>'storage_path' and v not in ('null'::jsonb,'""'::jsonb))
   and exists(select 1 from public.media_upload_reservations r
     where r.surface_type='creator_video' and r.owner_user_id::text=p_source->>'owner_id'
       and r.attached_record_id=p_source->>'id' and r.storage_provider='cloudflare_r2'
       and r.storage_bucket='chillywood-media-origin' and r.storage_object_key=p_alias->>'storage_path'
       and r.verified_at is not null and r.attached_at is not null
       and (r.status='verified' or (r.status='deleted' and exists(
         select 1 from private.deleted_media_key_retirements registry
         where registry.reservation_id=r.id and registry.status='staged'
           and registry.target_type='creator_video' and registry.target_id=p_source->>'id'
           and registry.author=p_source->>'owner_id' and registry.provider=r.storage_provider
           and registry.bucket=r.storage_bucket and registry.object_key=r.storage_object_key
           and registry.verified_at=r.verified_at and registry.attached_at=r.attached_at
           and registry.source_created_at is not distinct from p_source->>'created_at'
       )))),false)
$$;
revoke all on function private.deleted_content_original_rendition_alias(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Restart inventory must recognize a retained attachment whose delivery was
-- revoked during an actual parent deletion. This is diagnostic coverage only;
-- it never admits a new locator or grants a cleanup claim.
create function private.deleted_content_soft_media_coverage(p_deletion_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare d private.deleted_content_records%rowtype; registry private.deleted_media_key_retirements%rowtype;
 source jsonb; parent jsonb; parent_kind text; parent_table text;
begin
 select * into d from private.deleted_content_records where id=p_deletion_id;
 if d.id is null or d.target_type<>'social_attachment' or d.deletion_kind<>'soft'
   or to_jsonb(d)->>'media_disposition' is distinct from 'retained_original'
   or d.source_created_at is null then return false; end if;
 select r.* into registry from private.deleted_media_key_retirements r
 join private.deleted_content_media_stages s on s.id=r.stage_id and s.deletion_id=d.id
 where r.deletion_id=d.id and r.status in ('retained','claimed')
   and r.target_type=d.target_type and r.target_id=d.target_id and r.author=d.author
   and r.source_created_at::timestamptz=d.source_created_at
   and r.deleted_at=d.deleted_at and r.expires_at=d.expires_at
   and s.target_type=r.target_type and s.target_id=r.target_id and s.author=r.author
   and s.provider=r.provider and s.bucket=r.bucket and s.object_key=r.object_key and s.reservation_id=r.reservation_id;
 if registry.id is null then return false; end if;
 select to_jsonb(a) into source from public.social_attachments a where a.id::text=d.target_id;
 -- A completed metadata cleanup needs no further source deletion authority.
 -- Its permanent registry governs retries even if account removal cascades
 -- through the mutable upload reservation.
 if source is null then return true; end if;
 -- Retained provenance is the immutable registry's verified/attached tuple.
 -- Reservation removal cannot reopen that authority or make worker restart
 -- depend on an account row that may have been deleted.
 if registry.status<>'retained'
   or (source->>'created_at')::timestamptz is distinct from d.source_created_at
   or source->>'owner_user_id' is distinct from d.author
   or source->>'surface_type' is distinct from d.parent_type or source->>'surface_id' is distinct from d.parent_id
   or source->>'storage_provider' is distinct from registry.provider
   or source->>'storage_bucket' is distinct from registry.bucket
   or coalesce(nullif(source->>'storage_object_key',''),source->>'storage_path') is distinct from registry.object_key
   or (nullif(source->>'storage_path','') is not null and source->>'storage_path'<>registry.object_key) then return false; end if;
 parent_kind:=case d.parent_type when 'watch_party_room_message' then 'room_message' else d.parent_type end;
 parent_table:=case parent_kind when 'profile_post' then 'profile_posts'
   when 'profile_post_comment' then 'profile_post_comments' when 'creator_video_comment' then 'creator_video_comments'
   when 'chat_message' then 'chat_messages' when 'room_message' then 'watch_party_room_messages' end;
 if parent_table is null or d.parent_id is null then return false; end if;
 execute format('select to_jsonb(p) from public.%I p where id::text=$1',parent_table) into parent using d.parent_id;
 if parent is not null and parent->>'deleted_at' is null then return false; end if;
 return exists(select 1 from private.deleted_content_records p
   where p.target_type=parent_kind and p.target_id=d.parent_id and p.deleted_at<=d.deleted_at
     and (parent is null or (p.deletion_kind='soft'
       and (parent->>'created_at')::timestamptz is not distinct from p.source_created_at)));
end $$;
revoke all on function private.deleted_content_soft_media_coverage(uuid) from public,anon,authenticated,service_role;

create function private.deleted_content_source_coverage(p_type text,p_source jsonb) returns text
language plpgsql volatile security definer set search_path='' as $$
declare k text:=coalesce(nullif(p_source->>'storage_object_key',''),p_source->>'storage_path');
 a text:=coalesce(p_source->>'owner_id',p_source->>'owner_user_id');
 target text:=p_source->>'id'; prefix text;
begin
 if nullif(p_source->>'created_at','') is null then return 'unproven_source_incarnation'; end if;
 if p_type='creator_video' and (
   exists(select 1 from public.video_renditions r where r.video_id::text=target
     and not private.deleted_content_original_rendition_alias(to_jsonb(r),p_source))
   or exists(select 1 from public.media_renditions r where r.video_id::text=target
     or (r.source_type='creator_video' and r.source_id=target))
   or exists(select 1 from public.media_transcode_jobs j where j.source_type='creator_video' and j.source_id=target)
 ) then return 'secondary_media_uncovered'; end if;
 -- Empty drafts have no object to retain. Once any locator is assigned, the
 -- whole canonical original contract is required; remote URLs are not ignored.
 if not exists(select 1 from unnest(array['storage_object_key','storage_path','thumb_storage_path','thumb_url','playback_url']) c
   where nullif(btrim(p_source->>c),'') is not null) then return 'metadata_only'; end if;
 if p_source->>'storage_provider' is distinct from 'cloudflare_r2' then return 'unsupported_provider'; end if;
 if p_source->>'storage_bucket' is distinct from 'chillywood-media-origin' then return 'unsupported_bucket'; end if;
 if a is null or a !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or target is null or target !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or k is null then return 'unproven_original_key'; end if;
 if p_type='creator_video' then prefix:=a||'/'||target||'/source.';
 elsif p_type='social_attachment' then
   if coalesce(p_source->>'surface_type','') !~ '^[a-z_]+$'
     or coalesce(p_source->>'surface_id','') !~ '^[0-9a-f-]{36}$' then return 'unproven_original_key'; end if;
   prefix:=a||'/'||(p_source->>'surface_type')||'/'||(p_source->>'surface_id')||'/'||target||'.';
 else return 'unsupported_target'; end if;
 if left(k,length(prefix))<>prefix or substr(k,length(prefix)+1)!~'^[a-z0-9]{1,10}$' then
   return 'unproven_original_key';
 end if;
 if nullif(p_source->>'storage_path','') is not null and p_source->>'storage_path'<>k then
   return 'secondary_media_uncovered';
 end if;
 if exists(select 1 from unnest(array['thumb_storage_path','thumb_url','playback_url']) c
   where nullif(btrim(p_source->>c),'') is not null) then return 'secondary_media_uncovered'; end if;
 -- Deliberately distinct from eligible_r2_original: the admission trigger must
 -- never treat an already-retained object as permission to create a new source.
 if p_type='social_attachment' and exists(
   select 1 from private.deleted_content_records d join private.deleted_media_key_retirements registry on registry.deletion_id=d.id
   where d.target_type=p_type and d.target_id=target and d.author=a
     and d.source_created_at=(p_source->>'created_at')::timestamptz
     and d.parent_type=p_source->>'surface_type' and d.parent_id=p_source->>'surface_id'
     and registry.provider=p_source->>'storage_provider' and registry.bucket=p_source->>'storage_bucket'
     and registry.object_key=k and registry.source_created_at=p_source->>'created_at'
     and private.deleted_content_soft_media_coverage(d.id)
 ) then return 'retained_r2_original'; end if;
 if not exists(select 1 from public.media_upload_reservations r
   where r.surface_type=p_type and r.owner_user_id::text=a and r.attached_record_id=target
     and r.storage_provider='cloudflare_r2' and r.storage_bucket='chillywood-media-origin'
     and r.storage_object_key=k and r.verified_at is not null and r.attached_at is not null
     and (r.status='verified' or (r.status='deleted' and exists(
       select 1 from private.deleted_media_key_retirements registry
       where registry.reservation_id=r.id and registry.status='staged'
         and registry.target_type=p_type and registry.target_id=target and registry.author=a
         and registry.provider=r.storage_provider and registry.bucket=r.storage_bucket and registry.object_key=k
         and registry.verified_at=r.verified_at and registry.attached_at=r.attached_at
         and registry.source_created_at is not distinct from p_source->>'created_at'
     )))) then
   return 'unverified_original_binding';
 end if;
 return 'eligible_r2_original';
end $$;
revoke all on function private.deleted_content_source_coverage(text,jsonb) from public,anon,authenticated,service_role;

-- Name sorts after existing zz_guard_* attachment authority triggers, which
-- consume the verified upload reservation. The monotonic latch serializes these
-- checks with first enable AND re-enable; inactive consumers retain behavior.
create function private.guard_deleted_content_source_coverage() returns trigger
language plpgsql security definer set search_path='' as $$
declare reason text;
begin
 perform private.deleted_media_reference_fence_armed();
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then return new; end if;
 if tg_op='UPDATE' and
   private.deleted_media_locator_document(to_jsonb(new),tg_relid)=private.deleted_media_locator_document(to_jsonb(old),tg_relid)
   and private.deleted_media_reference_identity(to_jsonb(new))=private.deleted_media_reference_identity(to_jsonb(old))
   and (to_jsonb(new)->>'storage_provider') is not distinct from (to_jsonb(old)->>'storage_provider')
   and (to_jsonb(new)->>'storage_bucket') is not distinct from (to_jsonb(old)->>'storage_bucket') then
   return new;
 end if;
 reason:=private.deleted_content_source_coverage(case tg_table_name when 'videos' then 'creator_video' else 'social_attachment' end,to_jsonb(new));
 if reason not in ('eligible_r2_original','metadata_only') then
   raise exception 'retention_source_coverage_required: %',reason using errcode='55000';
 end if;
 return new;
end $$;
create trigger zzz_deleted_content_source_coverage before insert or update on public.videos
for each row execute function private.guard_deleted_content_source_coverage();
create trigger zzz_deleted_content_source_coverage before insert or update on public.social_attachments
for each row execute function private.guard_deleted_content_source_coverage();
revoke all on function private.guard_deleted_content_source_coverage() from public,anon,authenticated,service_role;

-- These producers have no deleted-original retention adapter. The prospective
-- original-only contract must not silently grow a second uncovered media class.
-- Existing rows and ordinary metadata/status edits are left untouched.
create function private.guard_deleted_content_secondary_coverage() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.deleted_media_reference_fence_armed();
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then return new; end if;
 if tg_table_name='video_renditions' and private.deleted_content_original_rendition_alias(to_jsonb(new),
   (select to_jsonb(v) from public.videos v where v.id::text=to_jsonb(new)->>'video_id')) then return new; end if;
 if tg_table_name in ('media_renditions','media_transcode_jobs')
   and coalesce(to_jsonb(new)->>'source_type','')<>'creator_video'
   and to_jsonb(new)->>'video_id' is null then return new; end if;
 if tg_op='UPDATE'
   and private.deleted_media_locator_document(to_jsonb(new),tg_relid)=private.deleted_media_locator_document(to_jsonb(old),tg_relid)
   and private.deleted_media_reference_identity(to_jsonb(new))=private.deleted_media_reference_identity(to_jsonb(old))
   and (to_jsonb(new)->>'storage_provider') is not distinct from (to_jsonb(old)->>'storage_provider')
   and (to_jsonb(new)->>'storage_bucket') is not distinct from (to_jsonb(old)->>'storage_bucket') then
   return new;
 end if;
 raise exception 'retention_secondary_media_coverage_required' using errcode='55000';
end $$;
create trigger zzz_deleted_content_secondary_coverage before insert or update on public.video_renditions
for each row execute function private.guard_deleted_content_secondary_coverage();
create trigger zzz_deleted_content_secondary_coverage before insert or update on public.media_renditions
for each row execute function private.guard_deleted_content_secondary_coverage();
create trigger zzz_deleted_content_secondary_coverage before insert or update on public.media_transcode_jobs
for each row execute function private.guard_deleted_content_secondary_coverage();
create trigger zzz_deleted_content_secondary_coverage before insert or update on public.platform_brand_assets
for each row execute function private.guard_deleted_content_secondary_coverage();
revoke all on function private.guard_deleted_content_secondary_coverage() from public,anon,authenticated,service_role;

create or replace function public.deleted_content_expiry_readiness() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare inventory jsonb; uncovered bigint; attached_stages bigint; secondary_count bigint; brand_count bigint;
 outstanding_scans bigint; exhausted_scans bigint; unknown_archives bigint:=0; unsupported_soft_archives bigint:=0;
 unproven_stages bigint; blockers text[]:='{}';
 settings private.deleted_content_retention_settings%rowtype;
 qualification private.deleted_content_rollout_qualification%rowtype;
 heartbeat timestamptz; references_ready boolean; source_guards_ready boolean; protocol_ready boolean; capture_guards_ready boolean;
begin
 select * into settings from private.deleted_content_retention_settings where singleton;
 if not found then blockers:=array_append(blockers,'retention_settings_missing'); end if;
 select * into qualification from private.deleted_content_rollout_qualification where singleton;
 select last_completed_at into heartbeat from private.deleted_content_worker_health where singleton;
 with sources as (
   select 'creator_video'::text kind,to_jsonb(v) source from public.videos v
   union all select 'social_attachment',to_jsonb(a) from public.social_attachments a
 ), classified as (
   select kind,coalesce(source->>'storage_provider','unknown') provider,
     private.deleted_content_source_coverage(kind,source) coverage from sources
 ), groups as (
   select kind,provider,coverage,count(*) n from classified group by kind,provider,coverage
 )
 select coalesce(jsonb_agg(jsonb_build_object('targetType',kind,'provider',provider,'coverage',coverage,'count',n)
   order by kind,provider,coverage),'[]'::jsonb),
   coalesce(sum(n) filter(where coverage not in ('eligible_r2_original','retained_r2_original','metadata_only')),0)
 into inventory,uncovered from groups;
 select (select count(*) from public.video_renditions r left join public.videos v on v.id=r.video_id
     where not private.deleted_content_original_rendition_alias(to_jsonb(r),to_jsonb(v)))
   +(select count(*) from public.media_renditions where source_type='creator_video' or video_id is not null)
   +(select count(*) from public.media_transcode_jobs where source_type='creator_video') into secondary_count;
 select count(*) into brand_count from public.platform_brand_assets;
 if exists(select 1 from pg_catalog.pg_attribute where attrelid='private.deleted_content_records'::regclass
   and attname='media_disposition' and not attisdropped) then
   execute $query$select count(*) from private.deleted_content_records d
     where d.target_type in ('creator_video','social_attachment') and
       (d.media_disposition='unknown' or (d.media_disposition='retained_original' and not exists(
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
     'public.media_transcode_jobs'::regclass,'public.platform_brand_assets'::regclass]) rel
     where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=rel
       and t.tgfoid='private.guard_deleted_content_secondary_coverage()'::regprocedure
       and t.tgenabled in ('O','A') and (t.tgtype::integer & 23)=23 and t.tgqual is null));
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
 if brand_count>0 then blockers:=array_append(blockers,'platform_brand_media_not_covered'); end if;
 if outstanding_scans>0 then blockers:=array_append(blockers,'outstanding_scan_references_require_resolution'); end if;
 if unknown_archives>0 or unproven_stages>0 then blockers:=array_append(blockers,'historical_media_provenance_requires_resolution'); end if;
 if unsupported_soft_archives>0 then blockers:=array_append(blockers,'unsupported_soft_media_archive_cleanup'); end if;
 if attached_stages>0 then blockers:=array_append(blockers,'attached_legacy_stages_require_fresh_content_delete_intent'); end if;
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
   'platformBrandMediaCoverage','unsupported','secondaryMediaCoverage','unsupported',
   'attachedLegacyStageCount',attached_stages,'referenceGuardCoverage',references_ready,
   'sourceAdmissionGuardCoverage',source_guards_ready,'protocolInstalled',protocol_ready,
   'contentCaptureGuardCoverage',capture_guards_ready,
   'retentionScope','verified_private_r2_originals_only','supabaseDirectStorageCoverage','unsupported',
   'legacyObjectDeleteBehavior','object_only_requests_rejected_after_gate_closure',
   'unattachedUploadCleanupCoverage','outside_retained_original_protocol',
   'physicalDeletionAllowed',false,'perObjectIrreversibleClaimRequired',true,
   'permanentPhysicalAbsenceGuaranteed',false,
   'workerLastCompletedAt',heartbeat,'workerCompletionProves','bounded_worker_pass_only',
   'scheduleObservedByDatabase',false,'rolloutEvidenceAuthority','operator_assertions_not_independently_verified',
   'sourceRevision',qualification.source_revision,'qualifiedAt',qualification.qualified_at);
end $$;
revoke all on function public.deleted_content_expiry_readiness() from public,anon,authenticated;
grant execute on function public.deleted_content_expiry_readiness() to service_role;

create function private.guard_deleted_content_activation() returns trigger
language plpgsql security definer set search_path='' as $$
declare readiness jsonb;
begin
 if (new.activation_ready and not old.activation_ready) or (new.capture_enabled and not old.capture_enabled)
   or (new.media_staging_enabled and not old.media_staging_enabled)
   or (new.text_expiry_enabled and not old.text_expiry_enabled)
   or (new.media_expiry_enabled and not old.media_expiry_enabled) then
   if current_setting('transaction_isolation')<>'read committed' then
     raise exception 'retention_requires_read_committed' using errcode='25000';
   end if;
   -- Taking UPDATE even after the monotonic latch is already armed prevents a
   -- disabled-period legacy admission racing a later re-enable/inventory scan.
   perform 1 from private.deleted_media_reference_fence where singleton for update;
   readiness:=public.deleted_content_expiry_readiness();
   if readiness->>'ready' is distinct from 'true' then
     raise exception 'retention_activation_blocked: %',readiness->'blockers' using errcode='55000';
   end if;
 end if;
 return new;
end $$;
-- The existing latch armer runs first. A failed qualification rolls that arming
-- back with the settings update; no unsupported flag transition can commit.
create trigger zzz_deleted_content_activation_readiness before update on private.deleted_content_retention_settings
for each row execute function private.guard_deleted_content_activation();
revoke all on function private.guard_deleted_content_activation() from public,anon,authenticated,service_role;
