-- Source-only, disabled current-text inspection. No consumer policies change.
-- Activation, remote statement parity and deployment require separate approval.
-- No historical snapshots, object URLs, exports or media delivery are provided.
begin;
create schema if not exists private;
create table private.content_inspection_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.content_inspection_settings(singleton,enabled) values(true,false);
create table private.content_inspection_contexts (
  id uuid primary key default gen_random_uuid(),
  creator uuid not null,
  purpose text not null check (char_length(btrim(purpose)) between 6 and 500),
  status text not null default 'open' check(status in ('open','closed')),
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz
);
create table private.content_inspection_context_targets (
  context_id uuid not null references private.content_inspection_contexts(id),
  target_type text not null check(target_type in ('profile_post','profile_post_comment','creator_video_comment','chat_message','room_message','creator_video','social_attachment')),
  target_id uuid not null,
  primary key(context_id,target_type,target_id)
);
create table private.content_inspection_grants (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  grantee uuid not null,
  grantor uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revision bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(context_id,target_type,target_id) references private.content_inspection_context_targets,
  check(expires_at > created_at and expires_at <= created_at + interval '24 hours')
);
create unique index content_inspection_one_unrevoked_grant on private.content_inspection_grants(context_id,target_type,target_id,grantee) where revoked_at is null;
create table private.content_inspection_access_events (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null,
  session_id text not null,
  actor_role text not null,
  request_id uuid not null,
  operation text not null,
  context_id uuid,
  target_type text,
  target_id uuid,
  grant_id uuid,
  grant_revision bigint,
  reason text not null check(char_length(btrim(reason)) between 6 and 500),
  result text not null,
  stored_version text,
  created_at timestamptz not null default clock_timestamp(),
  unique(actor,request_id)
);

-- The database owner is the only direct writer. FORCE RLS is defense in depth;
-- the narrowly checked security-definer RPCs deliberately run as migration owner.
alter table private.content_inspection_settings enable row level security;
alter table private.content_inspection_settings force row level security;
alter table private.content_inspection_contexts enable row level security;
alter table private.content_inspection_contexts force row level security;
alter table private.content_inspection_context_targets enable row level security;
alter table private.content_inspection_context_targets force row level security;
alter table private.content_inspection_grants enable row level security;
alter table private.content_inspection_grants force row level security;
alter table private.content_inspection_access_events enable row level security;
alter table private.content_inspection_access_events force row level security;
revoke all on private.content_inspection_settings, private.content_inspection_contexts,
  private.content_inspection_context_targets, private.content_inspection_grants,
  private.content_inspection_access_events from public,anon,authenticated,service_role;

create function private.content_inspection_immutable_event() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'content_inspection_audit_immutable' using errcode='42501'; end;
$$;
create trigger content_inspection_immutable_event before update or delete or truncate
on private.content_inspection_access_events for each statement execute function private.content_inspection_immutable_event();

create function private.content_inspection_actor(p_reason text,p_request_id uuid,p_check_request boolean default true) returns text
language plpgsql volatile security definer set search_path='' as $$
declare v_role text;
begin
  -- SHARE serializes activation/disable with operations, including audit commit.
  perform 1 from private.content_inspection_settings where singleton and enabled for share;
  if not found then raise exception 'content_inspection_disabled' using errcode='42501'; end if;
  if p_request_id is null or p_reason is null or char_length(btrim(p_reason)) not between 6 and 500 then
    raise exception 'content_inspection_invalid_request' using errcode='22023';
  end if;
  if not public.platform_exact_current_session_authority_internal()
    or not public.wave1_current_caller_authority_internal()
    or not exists(select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id'
      and s.user_id=auth.uid() and (s.not_after is null or s.not_after>clock_timestamp()))
  then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  select m.role into v_role from public.platform_role_memberships m
  where m.user_id=auth.uid()::text and m.status='active'
    and m.role in ('owner','super_admin','operator')
    and (m.expires_at is null or m.expires_at>clock_timestamp())
    and public.platform_subject_has_role_internal(auth.uid()::text,array[m.role])
  order by case m.role when 'owner' then 1 when 'super_admin' then 2 else 3 end limit 1;
  if v_role is null then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if p_check_request and exists(select 1 from private.content_inspection_access_events where actor=auth.uid() and request_id=p_request_id) then
    raise exception 'content_inspection_request_reused' using errcode='22023';
  end if;
  return v_role;
end;
$$;

create function private.content_inspection_audit(p_role text,p_request uuid,p_operation text,p_context uuid,p_type text,p_target uuid,p_grant uuid,p_revision bigint,p_reason text,p_result text,p_version text default null) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
  -- Explicit product policy: exact active Owner view/list operations do not
  -- create inspection access events. Mutations and every other role do.
  -- This does not change operational, authentication or security logging.
  if not (p_role='owner' and p_operation in ('read','list_contexts','list_scope','list_subject_targets','prepare_media','authorize_media')) then
    insert into private.content_inspection_access_events(actor,session_id,actor_role,request_id,operation,context_id,target_type,target_id,grant_id,grant_revision,reason,result,stored_version)
    values(auth.uid(),auth.jwt()->>'session_id',p_role,p_request,p_operation,p_context,p_type,p_target,p_grant,p_revision,p_reason,p_result,p_version);
  end if;
  if private.content_inspection_actor(p_reason,p_request,false) is distinct from p_role then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
end;
$$;

-- Explicit, fixed adapters: never accept a table, column, path, bucket or URL.
-- The stored version is an equality token for this read, not retained history.
create function private.content_inspection_source(p_type text,p_target uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v jsonb;
begin
  case p_type
  when 'profile_post' then
    select jsonb_build_object('author',user_id,'content',jsonb_build_object('body',body),'sourceUpdatedAt',updated_at,'deletedAt',deleted_at,
      'restrictionLabels',jsonb_build_array(visibility,moderation_status,case when deleted_at is not null then 'soft_deleted' else 'stored' end))
      into v from public.profile_posts where id=p_target;
  when 'profile_post_comment' then
    select jsonb_build_object('author',user_id,'content',jsonb_build_object('body',body),'sourceUpdatedAt',updated_at,'deletedAt',deleted_at,
      'restrictionLabels',jsonb_build_array(moderation_status,case when deleted_at is not null then 'soft_deleted' else 'stored' end))
      into v from public.profile_post_comments where id=p_target;
  when 'creator_video_comment' then
    select jsonb_build_object('author',user_id,'content',jsonb_build_object('body',body),'sourceUpdatedAt',updated_at,'deletedAt',deleted_at,
      'restrictionLabels',jsonb_build_array(moderation_status,case when deleted_at is not null then 'soft_deleted' else 'stored' end))
      into v from public.creator_video_comments where id=p_target;
  when 'chat_message' then
    select jsonb_build_object('author',sender_user_id,'content',jsonb_build_object('body',body),'sourceUpdatedAt',null,
      'restrictionLabels',jsonb_build_array('private_chat',moderation_status)) into v from public.chat_messages where id=p_target;
  when 'room_message' then
    select jsonb_build_object('author',user_id,'content',jsonb_build_object('body',text),'sourceUpdatedAt',null,
      'restrictionLabels',jsonb_build_array('room_message')) into v from public.watch_party_room_messages where id=p_target;
  when 'creator_video' then
    select jsonb_build_object('author',owner_id::text,'content',jsonb_build_object('title',title,'description',description),'sourceUpdatedAt',null,
      'restrictionLabels',jsonb_build_array('video_text_only')) into v from public.videos where id=p_target;
  when 'social_attachment' then
    select jsonb_build_object('author',owner_user_id,'content',null,'sourceUpdatedAt',updated_at,'deletedAt',deleted_at,
      'restrictionLabels',jsonb_build_array('media_only',moderation_status)) into v from public.social_attachments where id=p_target;
  else raise exception 'content_inspection_unsupported_target' using errcode='22023';
  end case;
  return v;
end;
$$;

create function private.content_inspection_owner_target(p_type text,p_target uuid) returns boolean
language sql volatile security definer set search_path='' as $$
  select exists(select 1 from public.platform_role_memberships m
    where m.user_id=private.content_inspection_source(p_type,p_target)->>'author' and m.role='owner');
$$;

create function private.content_inspection_grant_valid(p_grant private.content_inspection_grants) returns boolean
language sql volatile security definer set search_path='' as $$
  select p_grant.grantee=auth.uid() and p_grant.revoked_at is null and p_grant.expires_at>clock_timestamp()
    and public.platform_subject_has_role_internal(p_grant.grantor::text,array['owner'])
    and exists(select 1 from public.platform_role_memberships m where m.user_id=p_grant.grantor::text
      and m.role='owner' and m.status='active' and (m.expires_at is null or m.expires_at>clock_timestamp()))
    and not private.content_inspection_owner_target(p_grant.target_type,p_grant.target_id);
$$;

create function private.content_inspection_context_owned(p_context uuid,p_role text) returns boolean
language sql volatile security definer set search_path='' as $$
  select p_role='owner' or (p_role='super_admin' and exists(
    select 1 from private.content_inspection_contexts where id=p_context and creator=auth.uid()));
$$;

create function public.admin_create_content_inspection_context(p_purpose text,p_targets jsonb,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text; v_id uuid; v_target jsonb;
begin
  v_role:=private.content_inspection_actor(p_purpose,p_request_id);
  if v_role not in ('owner','super_admin') then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if jsonb_typeof(p_targets) is distinct from 'array' then raise exception 'content_inspection_invalid_targets' using errcode='22023'; end if;
  if jsonb_array_length(p_targets) not between 1 and 50 then raise exception 'content_inspection_invalid_targets' using errcode='22023'; end if;
  insert into private.content_inspection_contexts(creator,purpose) values(auth.uid(),p_purpose) returning id into v_id;
  for v_target in select value from jsonb_array_elements(p_targets) loop
    if jsonb_typeof(v_target) is distinct from 'object' or not (v_target ? 'targetType' and v_target ? 'targetId')
      or (v_target - 'targetType' - 'targetId') <> '{}'::jsonb then raise exception 'content_inspection_invalid_targets' using errcode='22023'; end if;
    insert into private.content_inspection_context_targets(context_id,target_type,target_id)
      values(v_id,v_target->>'targetType',(v_target->>'targetId')::uuid);
  end loop;
  perform private.content_inspection_audit(v_role,p_request_id,'create_context',v_id,null,null,null,null,p_purpose,'created');
  return jsonb_build_object('contextId',v_id);
end;
$$;

create function public.admin_close_content_inspection_context(p_context_id uuid,p_reason text,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text;
begin
  perform 1 from private.content_inspection_contexts where id=p_context_id for update;
  if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_role:=private.content_inspection_actor(p_reason,p_request_id);
  if not private.content_inspection_context_owned(p_context_id,v_role) then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  update private.content_inspection_contexts set status='closed',closed_at=coalesce(closed_at,clock_timestamp()) where id=p_context_id;
  perform private.content_inspection_audit(v_role,p_request_id,'close_context',p_context_id,null,null,null,null,p_reason,'closed');
  return jsonb_build_object('contextId',p_context_id,'status','closed');
end;
$$;

create function public.admin_grant_content_inspection_access(p_context_id uuid,p_target_type text,p_target_id text,p_grantee_user_id uuid,p_expires_at timestamptz,p_reason text,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text; v_id uuid; v_target uuid:=p_target_id::uuid;
begin
  perform 1 from private.content_inspection_contexts where id=p_context_id and status='open' for update;
  if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_role:=private.content_inspection_actor(p_reason,p_request_id);
  if v_role<>'owner' or p_grantee_user_id is null or p_grantee_user_id=auth.uid()
    or not public.platform_subject_has_role_internal(p_grantee_user_id::text,array['operator'])
    or not exists(select 1 from public.platform_role_memberships m where m.user_id=p_grantee_user_id::text and m.role='operator'
      and m.status='active' and (m.expires_at is null or m.expires_at>clock_timestamp()))
    or private.content_inspection_owner_target(p_target_type,v_target)
    or not exists(select 1 from private.content_inspection_context_targets where context_id=p_context_id and target_type=p_target_type and target_id=v_target)
  then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '24 hours' then
    raise exception 'content_inspection_invalid_expiry' using errcode='22023'; end if;
  -- Expired grants must be explicitly revoked first; never silently renew them.
  if exists(select 1 from private.content_inspection_grants where context_id=p_context_id
    and target_type=p_target_type and target_id=v_target and grantee=p_grantee_user_id and revoked_at is null) then
    raise exception 'content_inspection_grant_exists' using errcode='22023'; end if;
  insert into private.content_inspection_grants(context_id,target_type,target_id,grantee,grantor,expires_at)
    values(p_context_id,p_target_type,v_target,p_grantee_user_id,auth.uid(),p_expires_at) returning id into v_id;
  perform private.content_inspection_audit(v_role,p_request_id,'grant',p_context_id,p_target_type,v_target,v_id,1,p_reason,'granted');
  return jsonb_build_object('grantId',v_id);
end;
$$;

create function public.admin_revoke_content_inspection_access(p_grant_id uuid,p_reason text,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text; v_context uuid; v_grant private.content_inspection_grants;
begin
  select context_id into v_context from private.content_inspection_grants where id=p_grant_id;
  perform 1 from private.content_inspection_contexts where id=v_context for update;
  if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_role:=private.content_inspection_actor(p_reason,p_request_id);
  if v_role<>'owner' then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  update private.content_inspection_grants set revoked_at=coalesce(revoked_at,clock_timestamp()),revision=revision+1
    where id=p_grant_id returning * into v_grant;
  perform private.content_inspection_audit(v_role,p_request_id,'revoke',v_context,v_grant.target_type,v_grant.target_id,p_grant_id,v_grant.revision,p_reason,'revoked');
  return jsonb_build_object('grantId',p_grant_id,'revoked',true);
end;
$$;

create function public.admin_read_content_inspection(p_context_id uuid,p_target_type text,p_target_id text,p_reason text,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text; v_target uuid:=p_target_id::uuid; v_grant private.content_inspection_grants; v_source jsonb; v_version text; v_result text;
begin
  -- All grant/read/revoke/close decisions serialize here. Authority checks are
  -- deliberately AFTER waiting for this lock, using fresh volatile statements.
  perform 1 from private.content_inspection_contexts where id=p_context_id and status='open' for update;
  if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_role:=private.content_inspection_actor(p_reason,p_request_id);
  if not exists(select 1 from private.content_inspection_context_targets where context_id=p_context_id and target_type=p_target_type and target_id=v_target) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if not private.content_inspection_context_owned(p_context_id,v_role) then
    select g.* into v_grant from private.content_inspection_grants g where g.context_id=p_context_id
      and g.target_type=p_target_type and g.target_id=v_target and private.content_inspection_grant_valid(g);
    if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  end if;
  v_source:=private.content_inspection_source(p_target_type,v_target);
  if v_role<>'owner' and exists(select 1 from public.platform_role_memberships where user_id=v_source->>'author' and role='owner') then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_result:=case when v_source is null then 'unavailable_current' when p_target_type='social_attachment' then 'media_only' else 'available' end;
  v_version:=case when v_source is not null then md5(v_source::text) end;
  perform private.content_inspection_audit(v_role,p_request_id,'read',p_context_id,p_target_type,v_target,v_grant.id,v_grant.revision,p_reason,v_result,v_version);
  -- Audit insertion can wait. Recheck current session/role and wall-clock grant
  -- expiry afterwards; failure rolls back the event and releases no content.
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role
    or (v_grant.id is not null and not private.content_inspection_grant_valid(v_grant)) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if v_role<>'owner' and exists(select 1 from public.platform_role_memberships
    where user_id=v_source->>'author' and role='owner') then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if md5(private.content_inspection_source(p_target_type,v_target)::text) is distinct from v_version then
    raise exception 'content_inspection_stale_version' using errcode='42501'; end if;
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  return jsonb_build_object('contextId',p_context_id,'targetType',p_target_type,'targetId',v_target,
    'availability',v_result,'storedVersion',v_version,'sourceUpdatedAt',v_source->'sourceUpdatedAt',
    'content',v_source->'content','restrictionLabels',coalesce(v_source->'restrictionLabels','[]'::jsonb),
    'deletedRetentionAvailability','not_implemented','mediaAvailability','unsupported_media_inspection');
end;
$$;

create function public.admin_list_content_inspection_contexts(p_reason text,p_request_id uuid,p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text; v_rows jsonb; v_more boolean; v_last jsonb;
begin
  v_role:=private.content_inspection_actor(p_reason,p_request_id);
  if (p_before is null)<>(p_before_id is null) then raise exception 'content_inspection_invalid_cursor' using errcode='22023'; end if;
  -- Persist the staff audit before the fresh scoped metadata query. A queued
  -- audit must not allow a previously selected revoked scope to escape.
  perform private.content_inspection_audit(v_role,p_request_id,'list_contexts',null,null,null,null,null,p_reason,'listed');
  with page as (
    select c.* from private.content_inspection_contexts c
    where (p_before is null or (c.created_at,c.id)<(p_before,p_before_id))
      and (private.content_inspection_context_owned(c.id,v_role) or (c.status='open' and exists(select 1 from private.content_inspection_grants g
        where g.context_id=c.id and private.content_inspection_grant_valid(g))))
    order by c.created_at desc,c.id desc limit 51
  ) select coalesce(jsonb_agg(jsonb_build_object('contextId',id,'purpose',purpose,'status',status,'createdAt',created_at) order by created_at desc,id desc),'[]'::jsonb)
    into v_rows from page;
  v_more:=jsonb_array_length(v_rows)>50;
  if v_more then v_rows:=v_rows-50; end if;
  v_last:=v_rows->(jsonb_array_length(v_rows)-1);
  if exists(select 1 from jsonb_array_elements(v_rows) item
    where not private.content_inspection_context_owned((item->>'contextId')::uuid,v_role)
      and not exists(select 1 from private.content_inspection_contexts c
        join private.content_inspection_grants g on g.context_id=c.id
        where c.id=(item->>'contextId')::uuid and c.status='open' and private.content_inspection_grant_valid(g))) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  return jsonb_build_object('contexts',v_rows,'hasMore',v_more,
    'nextCursor',case when v_more then jsonb_build_object('createdAt',v_last->'createdAt','id',v_last->'contextId') else null end,
    'canCreateContext',v_role in ('owner','super_admin'),'canBrowseUsers',v_role in ('owner','super_admin'),'canDelegate',v_role='owner',
    'accessAuditMode',case when v_role='owner' then 'owner_view_exempt' else 'staff_view_logged' end);
end;
$$;

create function public.admin_list_content_inspection_scope(p_context_id uuid,p_reason text,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text; v_targets jsonb; v_grants jsonb; v_more boolean;
begin
  perform 1 from private.content_inspection_contexts where id=p_context_id for update;
  if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_role:=private.content_inspection_actor(p_reason,p_request_id);
  if not private.content_inspection_context_owned(p_context_id,v_role) and not exists(select 1 from private.content_inspection_contexts c
    join private.content_inspection_grants g on g.context_id=c.id where c.id=p_context_id and c.status='open' and private.content_inspection_grant_valid(g)) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  perform private.content_inspection_audit(v_role,p_request_id,'list_scope',p_context_id,null,null,null,null,p_reason,'listed');
  select coalesce(jsonb_agg(jsonb_build_object('targetType',t.target_type,'targetId',t.target_id) order by t.target_type,t.target_id),'[]'::jsonb)
    into v_targets from private.content_inspection_context_targets t where t.context_id=p_context_id
    and (private.content_inspection_context_owned(p_context_id,v_role) or exists(select 1 from private.content_inspection_grants g
      where g.context_id=t.context_id and g.target_type=t.target_type and g.target_id=t.target_id and private.content_inspection_grant_valid(g)));
  select coalesce(jsonb_agg(jsonb_build_object('grantId',g.id,'granteeUserId',g.grantee,'targetType',g.target_type,'targetId',g.target_id,
    'expiresAt',g.expires_at,'revokedAt',g.revoked_at,'revision',g.revision) order by g.created_at desc,g.id desc),'[]'::jsonb)
    into v_grants from (select g.* from private.content_inspection_grants g where g.context_id=p_context_id
    and (private.content_inspection_context_owned(p_context_id,v_role) or private.content_inspection_grant_valid(g))
    order by g.created_at desc,g.id desc limit 201) g;
  v_more:=jsonb_array_length(v_grants)>200;
  if v_more then v_grants:=v_grants-200; end if;
  if not private.content_inspection_context_owned(p_context_id,v_role) and (
    not exists(select 1 from private.content_inspection_contexts c join private.content_inspection_grants g on g.context_id=c.id
      where c.id=p_context_id and c.status='open' and private.content_inspection_grant_valid(g))
    or exists(select 1 from jsonb_array_elements(v_grants) item where not exists(
      select 1 from private.content_inspection_grants g where g.id=(item->>'grantId')::uuid and private.content_inspection_grant_valid(g)))
    or exists(select 1 from jsonb_array_elements(v_targets) item where not exists(
      select 1 from private.content_inspection_grants g where g.context_id=p_context_id
        and g.target_type=item->>'targetType' and g.target_id=(item->>'targetId')::uuid
        and private.content_inspection_grant_valid(g)))) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  return jsonb_build_object('targets',v_targets,'grants',v_grants,'grantsHasMore',v_more);
end;
$$;

revoke all on function private.content_inspection_immutable_event(),private.content_inspection_actor(text,uuid,boolean),
  private.content_inspection_audit(text,uuid,text,uuid,text,uuid,uuid,bigint,text,text,text),
  private.content_inspection_source(text,uuid),private.content_inspection_owner_target(text,uuid),
  private.content_inspection_context_owned(uuid,text),
  private.content_inspection_grant_valid(private.content_inspection_grants) from public,anon,authenticated,service_role;
revoke all on function public.admin_create_content_inspection_context(text,jsonb,uuid),
  public.admin_close_content_inspection_context(uuid,text,uuid),
  public.admin_grant_content_inspection_access(uuid,text,text,uuid,timestamptz,text,uuid),
  public.admin_revoke_content_inspection_access(uuid,text,uuid),
  public.admin_read_content_inspection(uuid,text,text,text,uuid),
  public.admin_list_content_inspection_contexts(text,uuid,timestamptz,uuid),
  public.admin_list_content_inspection_scope(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_create_content_inspection_context(text,jsonb,uuid),
  public.admin_close_content_inspection_context(uuid,text,uuid),
  public.admin_grant_content_inspection_access(uuid,text,text,uuid,timestamptz,text,uuid),
  public.admin_revoke_content_inspection_access(uuid,text,uuid),
  public.admin_read_content_inspection(uuid,text,text,text,uuid),
  public.admin_list_content_inspection_contexts(text,uuid,timestamptz,uuid),
  public.admin_list_content_inspection_scope(uuid,text,uuid) to authenticated;
commit;
