-- Prospective deletion-only retention. No backfill, edit history, cron or activation.
-- Physical media expiry is blocked pending a proven provider claim protocol.
-- Do not enable capture/staging until that protocol and bounded stage reconciliation
-- have been deployed and verified. Supabase direct-storage media is unsupported.
create schema if not exists private;
create table private.deleted_content_retention_settings (
  singleton boolean primary key default true check(singleton),
  capture_enabled boolean not null default false,
  media_staging_enabled boolean not null default false,
  text_expiry_enabled boolean not null default false,
  activation_ready boolean not null default false,
  check(not capture_enabled or activation_ready),
  check(not media_staging_enabled or (activation_ready and capture_enabled)),
  check(not text_expiry_enabled or (activation_ready and capture_enabled))
);
insert into private.deleted_content_retention_settings default values;
create table private.deleted_content_records (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  author text not null,
  owner_protected boolean not null default false,
  content jsonb,
  source_updated_at timestamptz,
  source_created_at timestamptz,
  parent_type text,
  parent_id text,
  deletion_kind text not null check(deletion_kind in ('hard','soft')),
  deleted_at timestamptz not null,
  expires_at timestamptz not null,
  check(expires_at=deleted_at+interval '720 hours'),
  check(target_type in ('profile_post','profile_post_comment','creator_video_comment',
    'chat_message','room_message','creator_video','social_attachment','platform_brand_asset','platform_brand_profile'))
);
create index deleted_content_target_latest on private.deleted_content_records(target_type,target_id,deleted_at desc,id);
create table private.deleted_content_media_stages (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check(target_type in ('creator_video','social_attachment')),
  target_id text not null,
  author text not null,
  provider text not null check(provider in ('s3','cloudflare_r2')),
  bucket text not null,
  object_key text not null,
  reservation_id uuid not null,
  staged_at timestamptz not null default clock_timestamp(),
  reconcile_after timestamptz not null default clock_timestamp()+interval '1 hour',
  deletion_id uuid references private.deleted_content_records(id),
  unique(provider,bucket,object_key),
  check(reconcile_after>staged_at and reconcile_after<=staged_at+interval '2 hours')
);
create table private.deleted_content_retention_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  operation text not null check(operation in ('capture','stage','finalize','hold_change','claim','purge','reconcile')),
  target_type text not null,
  target_id text not null,
  deletion_id uuid,
  actor text
);
do $$ declare t text; begin
  foreach t in array array['deleted_content_retention_settings','deleted_content_records','deleted_content_media_stages','deleted_content_retention_events'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('alter table private.%I force row level security',t);
    execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  end loop;
end $$;

create function private.deleted_content_immutable() returns trigger
language plpgsql set search_path='' as $$ begin
  raise exception 'deleted_content_immutable' using errcode='42501';
end $$;
create trigger deleted_content_immutable before update on private.deleted_content_records
for each row execute function private.deleted_content_immutable();
create trigger deleted_content_events_immutable before update or delete on private.deleted_content_retention_events
for each row execute function private.deleted_content_immutable();

-- Exact database source binding is checked again under a source row lock. The
-- gateway must still perform its existing actor authorization and revocation.
create function public.stage_deleted_content_media(
  p_type text,p_target text,p_provider text,p_bucket text,p_object_key text,p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; r public.media_upload_reservations%rowtype; s private.deleted_content_media_stages%rowtype; registered boolean:=false; stage_id uuid;
begin
  if not exists(select 1 from private.deleted_content_retention_settings where media_staging_enabled) then
    return jsonb_build_object('decision','delete_now','retention','disabled');
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'retention_requires_read_committed' using errcode='25000';
  end if;
  if p_provider<>'cloudflare_r2' or p_bucket<>'chillywood-media-origin'
    or to_regclass('private.deleted_media_key_retirements') is null then
    return jsonb_build_object('decision','delete_now','retention','unsupported_provider');
  end if;
  -- Lock ordering: source row, then stage. DELETE's trigger uses that same order.
  if p_type='creator_video' then
    select to_jsonb(x) into v from public.videos x where x.id::text=p_target for update;
  elsif p_type='social_attachment' then
    select to_jsonb(x) into v from public.social_attachments x where x.id::text=p_target for update;
  else raise exception 'deleted_content_unsupported_target'; end if;
  select * into s from private.deleted_content_media_stages where provider=p_provider and bucket=p_bucket and object_key=p_object_key for update;
  if s.id is not null then
    if s.target_type<>p_type or s.target_id<>p_target then raise exception 'deleted_content_binding_conflict'; end if;
    execute 'select exists(select 1 from private.deleted_media_key_retirements where stage_id=$1)' into registered using s.id;
    if not registered then return jsonb_build_object('decision','delete_now','retention','unsupported_key_class'); end if;
    -- Expired or abandoned stages never authorize physical destruction. Their
    -- reconciliation remains blocked until the hold-safe worker is implemented.
    return jsonb_build_object('decision','defer','retention',case when s.deletion_id is null then 'staged' else 'deleted' end);
  end if;
  if v is null or coalesce(v->>'storage_provider','')<>p_provider
    or coalesce(v->>'storage_bucket','')<>p_bucket
    or p_object_key not in (coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path',''),coalesce(v->>'thumb_storage_path','')) then
    return jsonb_build_object('decision','delete_now','retention','detached_or_unattached');
  end if;
  select * into r from public.media_upload_reservations
    where surface_type=p_type and storage_provider=p_provider and storage_bucket=p_bucket
      and storage_object_key=p_object_key and attached_record_id=p_target
      and owner_user_id::text=coalesce(v->>'owner_id',v->>'owner_user_id')
      and status='verified' and verified_at is not null and attached_at is not null
    for update;
  if r.id is null then
    return jsonb_build_object('decision','delete_now','retention','unverified_binding');
  end if;
  insert into private.deleted_content_media_stages(target_type,target_id,author,provider,bucket,object_key,reservation_id)
    values(p_type,p_target,coalesce(v->>'owner_id',v->>'owner_user_id'),p_provider,p_bucket,p_object_key,r.id) returning id into stage_id;
  execute 'select exists(select 1 from private.deleted_media_key_retirements where stage_id=$1)' into registered using stage_id;
  if not registered then
    delete from private.deleted_content_media_stages where id=stage_id;
    return jsonb_build_object('decision','delete_now','retention','unsupported_key_class');
  end if;
  insert into private.deleted_content_retention_events(operation,target_type,target_id,actor)
    values('stage',p_type,p_target,p_actor::text);
  return jsonb_build_object('decision','defer','retention','staged');
end $$;
revoke all on function public.stage_deleted_content_media(text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.stage_deleted_content_media(text,text,text,text,text,uuid) to service_role;

create function private.capture_deleted_content_row(p_type text,v jsonb,p_soft boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare d uuid; a text; b jsonb; k text; t timestamptz:=clock_timestamp();
begin
  if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then return null; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'retention_requires_read_committed' using errcode='25000';
  end if;
  k:=coalesce(v->>'id',v->>'owner_user_id');
  a:=coalesce(v->>'user_id',v->>'sender_user_id',v->>'owner_id',v->>'owner_user_id');
  if k is null or a is null then raise exception 'deleted_content_missing_identity'; end if;
  -- A soft tombstone followed by physical row cleanup is one deletion. A new
  -- row reusing the same ID with a new creation time is a new deletion event.
  select id into d from private.deleted_content_records where target_type=p_type and target_id=k
      and deletion_kind='soft' and source_created_at is not distinct from nullif(v->>'created_at','')::timestamptz
      order by deleted_at desc,id limit 1;
  if d is not null then return d; end if;
  case p_type
    when 'profile_post','profile_post_comment','creator_video_comment','chat_message' then b:=jsonb_build_object('body',v->'body');
    when 'room_message' then b:=jsonb_build_object('body',v->'text');
    when 'creator_video' then b:=jsonb_build_object('title',v->'title','description',v->'description');
    when 'social_attachment','platform_brand_asset' then b:=null;
    -- Brand profiles currently store styling and references, not authored prose.
    -- No whole-row snapshot (or account/profile identity copy) is permitted.
    when 'platform_brand_profile' then return null;
    else raise exception 'deleted_content_unsupported_target';
  end case;
  insert into private.deleted_content_records(target_type,target_id,author,owner_protected,content,source_updated_at,source_created_at,parent_type,parent_id,deletion_kind,deleted_at,expires_at)
    values(p_type,k,a,exists(select 1 from public.platform_role_memberships where user_id=a and role='owner'),b,nullif(v->>'updated_at','')::timestamptz,
      nullif(v->>'created_at','')::timestamptz,v->>'surface_type',v->>'surface_id',case when p_soft then 'soft' else 'hard' end,t,t+interval '720 hours') returning id into d;
  update private.deleted_content_media_stages set deletion_id=d where target_type=p_type and target_id=k and deletion_id is null;
  insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
    values('capture',p_type,k,d,auth.uid()::text);
  return d;
end $$;

create function private.capture_deleted_content_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare v jsonb:=to_jsonb(old); a record;
begin
  if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then
    if tg_op='UPDATE' then return new; end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    -- Status removed/hidden is reversible moderation, not deletion. Never
    -- snapshot ordinary edits, replaced assets or a restored/updated tombstone.
    if v->>'deleted_at' is not null or to_jsonb(new)->>'deleted_at' is null then return new; end if;
    v:=to_jsonb(new);
  end if;
  perform private.capture_deleted_content_row(tg_argv[0],v,tg_op='UPDATE');
  -- Attachments use polymorphic parent keys rather than an ON DELETE cascade.
  if tg_argv[0] in ('profile_post','profile_post_comment','creator_video_comment','chat_message','room_message') then
    for a in select x.* from public.social_attachments x
      where x.surface_id::text=v->>'id'
        and x.surface_type=case tg_argv[0] when 'room_message' then 'watch_party_room_message' else tg_argv[0] end
      for update loop
      -- Parent deletion hides the attachment even if polymorphic metadata stays.
      perform private.capture_deleted_content_row('social_attachment',to_jsonb(a),true);
    end loop;
  end if;
  if tg_op='UPDATE' then return new; end if;
  return old;
end $$;
do $$ declare t text; kind text; begin
  for t,kind in select * from (values
    ('profile_posts','profile_post'),('profile_post_comments','profile_post_comment'),
    ('creator_video_comments','creator_video_comment'),('chat_messages','chat_message'),
    ('watch_party_room_messages','room_message'),('videos','creator_video'),
    ('social_attachments','social_attachment'),('platform_brand_assets','platform_brand_asset')) x(t,k)
  loop
    execute format('create trigger capture_deleted_content before delete on public.%I for each row execute function private.capture_deleted_content_trigger(%L)',t,kind);
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='deleted_at') then
      execute format('create trigger capture_soft_deleted_content before update of deleted_at on public.%I for each row execute function private.capture_deleted_content_trigger(%L)',t,kind);
    end if;
  end loop;
end $$;

-- Internal source adapter only: public inspection RPCs retain exact session,
-- context, target, role and staff-audit authority. Stages and paths never appear.
create function private.read_deleted_content_inspection(p_type text,p_target uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select jsonb_build_object('author',r.author,'content',r.content,'sourceUpdatedAt',r.source_updated_at,
    'restrictionLabels',jsonb_build_array('retained_deleted_content'),
    'isRetainedDeletion',true,'ownerProtected',r.owner_protected,'deletedAt',r.deleted_at,'retentionExpiresAt',r.expires_at,
    'retainedMediaAvailability','unsupported')
  from private.deleted_content_records r
  where r.target_type=p_type and r.target_id=p_target::text and r.expires_at>clock_timestamp()
    and exists(select 1 from private.deleted_content_retention_settings where capture_enabled)
  order by r.deleted_at desc,r.id limit 1
$$;

-- Physical media deletion remains unsupported even after text expiry's hold
-- serialization below. A pretend provider boolean would permit a key race.
create function public.deleted_content_expiry_readiness() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('ready',false,'physicalDeletionAllowed',false,
    'blocker','provider_exact_delete_and_stage_reconciliation_required',
    'supabaseDirectStorageCoverage','unsupported')
$$;
revoke all on function public.deleted_content_expiry_readiness() from public,anon,authenticated;
grant execute on function public.deleted_content_expiry_readiness() to service_role;
revoke all on function private.deleted_content_immutable(),private.capture_deleted_content_row(text,jsonb,boolean),
  private.capture_deleted_content_trigger(),private.read_deleted_content_inspection(text,uuid)
  from public,anon,authenticated,service_role;

-- Every existing legal_holds INSERT/UPDATE passes this database boundary,
-- including the existing admin-legal-evidence service-role path. A common lock
-- serializes preservation intent against irreversible deletion claims.
create table private.deleted_content_expiry_claims (
  id uuid primary key default gen_random_uuid(),
  deletion_id uuid not null unique,
  target_type text not null,target_id text not null,author text not null,
  parent_type text,parent_id text,
  claimed_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  kind text not null check(kind='text_only')
);
alter table private.deleted_content_expiry_claims enable row level security;
alter table private.deleted_content_expiry_claims force row level security;
revoke all on private.deleted_content_expiry_claims from public,anon,authenticated,service_role;
create function private.deleted_content_hold_matches(
 h_type text,h_id text,t_type text,t_id text,a text,parent_type text,parent_id text
) returns boolean language sql immutable set search_path='' as $$
 select case
   when h_type in ('user','account','user_profile') then h_id=a
   when h_type in ('profile_post','profile_post_comment','creator_video_comment','chat_message','room_message',
     'watch_party_room_message','creator_video','video','social_attachment','platform_brand_asset') then
      (replace(replace(h_type,'watch_party_room_message','room_message'),'creator_video','video')=
       replace(replace(t_type,'watch_party_room_message','room_message'),'creator_video','video') and h_id=t_id)
      or (replace(replace(h_type,'watch_party_room_message','room_message'),'creator_video','video')=
          replace(replace(parent_type,'watch_party_room_message','room_message'),'creator_video','video') and h_id=parent_id)
   -- An unrecognized legal scope cannot safely be declared irrelevant.
   else true end
$$;
create function private.deleted_content_legal_hold_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'retention_requires_read_committed' using errcode='25000';
  end if;
  perform pg_advisory_xact_lock(176214,30);
  if new.status='active' and exists(select 1 from private.deleted_content_expiry_claims c
    where private.deleted_content_hold_matches(new.target_type,new.target_id,c.target_type,c.target_id,c.author,c.parent_type,c.parent_id)) then
    raise exception 'retention_preservation_unavailable_deletion_already_claimed' using errcode='55000';
  end if;
  -- Do not create new logging when retention has never been enabled; after a
  -- claim exists, mutations remain accountable regardless of runtime stop.
  if exists(select 1 from private.deleted_content_retention_settings where capture_enabled)
    or exists(select 1 from private.deleted_content_expiry_claims) then
    insert into private.deleted_content_retention_events(operation,target_type,target_id,actor)
      values('hold_change',new.target_type,new.target_id,coalesce(new.released_by_user_id,new.placed_by_user_id));
  end if;
  return new;
end $$;
create trigger deleted_content_legal_hold_guard before insert or update on public.legal_holds
for each row execute function private.deleted_content_legal_hold_guard();

create function public.expire_deleted_content_text(p_deletion_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.deleted_content_records%rowtype; claim uuid; source_table text; source_row jsonb;
begin
  if not exists(select 1 from private.deleted_content_retention_settings where text_expiry_enabled) then
    return jsonb_build_object('status','disabled');
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'retention_requires_read_committed' using errcode='25000';
  end if;
  perform pg_advisory_xact_lock(176214,30);
  select * into r from private.deleted_content_records where id=p_deletion_id for update;
  if r.id is null then return jsonb_build_object('status','already_absent'); end if;
  if r.expires_at>clock_timestamp() then return jsonb_build_object('status','not_due'); end if;
  if exists(select 1 from public.legal_holds h where h.status='active'
    and private.deleted_content_hold_matches(h.target_type,h.target_id,r.target_type,r.target_id,r.author,r.parent_type,r.parent_id)) then
    return jsonb_build_object('status','held');
  end if;
  -- All media targets and staged/shared objects require the provider-specific
  -- immutable delete protocol. No conditional request capability is assumed.
  if r.target_type in ('creator_video','social_attachment','platform_brand_asset')
    or exists(select 1 from private.deleted_content_media_stages where deletion_id=r.id)
    or exists(select 1 from public.social_attachments a where a.surface_id::text=r.target_id
      and a.surface_type=case r.target_type when 'room_message' then 'watch_party_room_message' else r.target_type end) then
    return jsonb_build_object('status','provider_exact_delete_unproven');
  end if;
  if r.deletion_kind='soft' then
    source_table:=case r.target_type when 'profile_post' then 'profile_posts'
      when 'profile_post_comment' then 'profile_post_comments'
      when 'creator_video_comment' then 'creator_video_comments' end;
    if source_table is null then return jsonb_build_object('status','soft_source_cleanup_required'); end if;
    -- Locator admission triggers may own a source row before requesting the
    -- shared retirement lock. Do not wait in the inverse lock order.
    begin
      execute format('select to_jsonb(x) from public.%I x where id::text=$1 for update nowait',source_table)
        into source_row using r.target_id;
    exception when lock_not_available then
      return jsonb_build_object('status','source_busy');
    end;
    -- Never remove a restored source or a new incarnation sharing its old ID.
    if source_row is not null and source_row->>'deleted_at' is not null
      and nullif(source_row->>'created_at','')::timestamptz is not distinct from r.source_created_at then
      execute format('delete from public.%I where id::text=$1',source_table) using r.target_id;
    end if;
  end if;
  insert into private.deleted_content_expiry_claims(deletion_id,target_type,target_id,author,parent_type,parent_id,kind)
    values(r.id,r.target_type,r.target_id,r.author,r.parent_type,r.parent_id,'text_only') returning id into claim;
  insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
    values('claim',r.target_type,r.target_id,r.id,auth.uid()::text);
  delete from private.deleted_content_records where id=r.id;
  update private.deleted_content_expiry_claims set completed_at=clock_timestamp() where id=claim;
  insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
    values('purge',r.target_type,r.target_id,r.id,auth.uid()::text);
  return jsonb_build_object('status','purged','claimId',claim);
end $$;
revoke all on function public.expire_deleted_content_text(uuid) from public,anon,authenticated;
grant execute on function public.expire_deleted_content_text(uuid) to service_role;

-- A bounded reconciliation classifier, not a hidden restore/delete action.
-- The attached-source case cannot infer a whole-content deletion from an old
-- delete_object call; it exposes repair_required instead of silently extending
-- an inspection window or manufacturing a deletion snapshot.
create function public.reconcile_deleted_content_stage(p_stage_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.deleted_content_media_stages%rowtype; v jsonb; result text;
begin
  select * into s from private.deleted_content_media_stages where id=p_stage_id;
  if s.id is null then return jsonb_build_object('status','absent'); end if;
  if s.target_type='creator_video' then select to_jsonb(x) into v from public.videos x where id::text=s.target_id for update;
  else select to_jsonb(x) into v from public.social_attachments x where id::text=s.target_id for update; end if;
  select * into s from private.deleted_content_media_stages where id=p_stage_id for update;
  if s.id is null then return jsonb_build_object('status','absent'); end if;
  if s.deletion_id is not null then return jsonb_build_object('status','finalized'); end if;
  if s.reconcile_after>clock_timestamp() then return jsonb_build_object('status','not_due'); end if;
  result:=case when v is null then 'missing_deletion_commit_repair_required'
    when s.object_key in (coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path',''),coalesce(v->>'thumb_storage_path','')) then 'attached_metadata_delete_missing_repair_required'
    else 'replacement_cleanup_provider_proof_required' end;
  -- The deadline is never reset. This remains an explicit activation blocker,
  -- not an automatically renewed retention period or an inspectable archive.
  return jsonb_build_object('status',result,'retainedContent',false,'automaticRepairAllowed',false);
end $$;
revoke all on function public.reconcile_deleted_content_stage(uuid) from public,anon,authenticated;
grant execute on function public.reconcile_deleted_content_stage(uuid) to service_role;
revoke all on function private.deleted_content_hold_matches(text,text,text,text,text,text,text),
  private.deleted_content_legal_hold_guard() from public,anon,authenticated,service_role;

-- Dispatch leases advance past held/unsupported work without changing retention
-- clocks. Crashed or blocked batches become eligible again after one minute.
create table private.deleted_content_work_dispatch (
 kind text not null check(kind in ('text','stage','media')), work_id uuid not null,
 next_attempt_at timestamptz not null, primary key(kind,work_id)
);
alter table private.deleted_content_work_dispatch enable row level security;
alter table private.deleted_content_work_dispatch force row level security;
revoke all on private.deleted_content_work_dispatch from public,anon,authenticated,service_role;
create function public.list_deleted_content_expiry_work() returns jsonb
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
   where r.expires_at<=clock_timestamp() and (q.work_id is null or q.next_attempt_at<=clock_timestamp())
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
revoke all on function public.list_deleted_content_expiry_work() from public,anon,authenticated;
grant execute on function public.list_deleted_content_expiry_work() to service_role;
