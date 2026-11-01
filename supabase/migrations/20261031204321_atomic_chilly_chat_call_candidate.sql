-- Direct-call candidate creation and invite admission are one transaction.
-- Old clients retain begin_chilly_chat_call; this new API never falls back to
-- a separately committed room insert. No provider call occurs here.
create table private.chat_call_start_requests (
  candidate_room_id text primary key,
  actor_user_id uuid not null,
  session_id uuid not null,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  call_type text not null check (call_type in ('voice','video')),
  capture_policy text not null check (capture_policy in ('best_effort','host_managed')),
  invite_id uuid not null references public.chat_call_invites(id) on delete cascade,
  created_invite boolean not null,
  created_at timestamptz not null default now()
);
create index chat_call_start_requests_thread_idx on private.chat_call_start_requests(thread_id);
create index chat_call_start_requests_invite_idx on private.chat_call_start_requests(invite_id);
alter table private.chat_call_start_requests enable row level security;
alter table private.chat_call_start_requests force row level security;
revoke all on private.chat_call_start_requests from public, anon, authenticated, service_role;

create or replace function public.start_chilly_chat_call(
  p_thread_id uuid, p_communication_room_id text, p_call_type text,
  p_capture_policy text default 'best_effort'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_session uuid;
  v_room text := upper(btrim(coalesce(p_communication_room_id,'')));
  v_type text := lower(btrim(coalesce(p_call_type,'')));
  v_capture text := lower(btrim(coalesce(p_capture_policy,'')));
  v_thread public.chat_threads%rowtype;
  v_request private.chat_call_start_requests%rowtype;
  v_invite public.chat_call_invites%rowtype;
  v_result jsonb;
begin
  if not public.whole_app_exact_current_session_authority_internal() then
    raise exception 'chat_call_current_session_required';
  end if;
  v_session := (auth.jwt()->>'session_id')::uuid;
  if p_thread_id is null or v_room !~ '^[A-Z0-9][A-Z0-9_-]{5,63}$'
    or v_type not in ('voice','video') or v_capture not in ('best_effort','host_managed') then
    raise exception 'chat_call_begin_invalid_scope';
  end if;
  -- Preserve begin's thread-first order; room guard acquires host budget next.
  perform pg_advisory_xact_lock(hashtextextended(p_thread_id::text,0));
  select * into v_thread from public.chat_threads where id=p_thread_id for update;
  if v_thread.id is null or v_thread.thread_kind<>'direct'
    or not public.can_access_chat_thread(p_thread_id) then
    raise exception 'chat_call_thread_access_required';
  end if;
  if (select count(*) from public.chat_thread_members where thread_id=p_thread_id)<>2
    or not exists(select 1 from public.chat_thread_members where thread_id=p_thread_id and user_id=v_actor::text) then
    raise exception 'chat_call_direct_participants_required';
  end if;
  -- Recheck after waiting; revoked/replaced sessions cannot inherit admission.
  if not public.whole_app_exact_current_session_authority_internal() then
    raise exception 'chat_call_current_session_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('chat-call-start-key:'||v_room,0));
  select * into v_request from private.chat_call_start_requests where candidate_room_id=v_room;
  if found then
    if v_request.actor_user_id<>v_actor or v_request.session_id<>v_session
      or v_request.thread_id<>p_thread_id or v_request.call_type<>v_type or v_request.capture_policy<>v_capture then
      raise exception 'chat_call_start_key_conflict';
    end if;
    select * into v_invite from public.chat_call_invites where id=v_request.invite_id;
    return jsonb_build_object('created',v_request.created_invite and v_invite.status='ringing',
      'role',case when v_invite.caller_user_id=v_actor::text then 'caller' else 'callee' end,
      'invite',to_jsonb(v_invite));
  end if;
  -- Reuse before allocation: simultaneous starts must not charge/create a
  -- losing candidate. Match existing begin's active-room authority predicate.
  select invite.* into v_invite from public.chat_call_invites invite
  where invite.thread_id=p_thread_id and (
    (invite.status='ringing' and invite.expires_at>clock_timestamp()) or
    (invite.status='accepted' and v_thread.active_communication_room_id=invite.communication_room_id
      and exists(select 1 from public.communication_rooms room where room.room_id=invite.communication_room_id
        and room.status='active' and coalesce(room.last_activity_at,room.updated_at,room.created_at)>=clock_timestamp()-interval '15 minutes')))
  order by invite.created_at,invite.id limit 1 for update;
  if found then
    v_result:=jsonb_build_object('created',false,
      'role',case when v_invite.caller_user_id=v_actor::text then 'caller' else 'callee' end,'invite',to_jsonb(v_invite));
  else
    insert into public.communication_rooms(room_id,room_code,host_user_id,status,content_access_rule,capture_policy)
    values(v_room,v_room,v_actor::text,'active','open',v_capture);
    v_result:=public.begin_chilly_chat_call(p_thread_id,v_room,v_type);
    -- Any rejection above rolls back candidate AND room/invite rate ledgers.
    select * into v_invite from public.chat_call_invites where id=(v_result->'invite'->>'id')::uuid;
  end if;
  insert into private.chat_call_start_requests(candidate_room_id,actor_user_id,session_id,thread_id,call_type,capture_policy,invite_id,created_invite)
  values(v_room,v_actor,v_session,p_thread_id,v_type,v_capture,v_invite.id,(v_result->>'created')::boolean);
  return v_result;
end;
$$;
revoke all on function public.start_chilly_chat_call(uuid,text,text,text) from public, anon, service_role;
grant execute on function public.start_chilly_chat_call(uuid,text,text,text) to authenticated;
