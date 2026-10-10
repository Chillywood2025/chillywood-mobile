-- A separate, short-lived read capability for native incoming-call signaling.
-- Issuance bindings never change when the presentation-ack ledger retries.
-- No authenticated/anonymous access, raw secret, publication, or call mutation.
create table public.ios_native_call_state_issuances (
  id uuid primary key,
  attempt_id uuid not null references public.voip_push_delivery_attempts(id) on delete cascade,
  attempt_count integer not null check (attempt_count between 1 and 3),
  capability_hash text not null check (capability_hash ~ '^[0-9a-f]{64}$'),
  token_id uuid not null references public.user_voip_push_tokens(id) on delete cascade,
  token_hash text not null,
  revocation_credential_hash text not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  session_generation uuid not null references auth.sessions(id) on delete cascade,
  install_id text not null,
  call_invite_id uuid not null references public.chat_call_invites(id) on delete cascade,
  thread_id uuid not null,
  call_uuid uuid not null,
  call_type text not null check (call_type in ('voice','video')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(attempt_id, attempt_count),
  check (account_id = recipient_user_id and call_uuid = call_invite_id),
  check (expires_at > created_at and expires_at <= created_at + interval '300 seconds')
);
create index ios_native_call_state_issuances_expiry_idx on public.ios_native_call_state_issuances(expires_at);

-- Mutable connection ownership is deliberately separate from immutable issuance.
create table public.ios_native_call_state_connections (
  issuance_id uuid primary key references public.ios_native_call_state_issuances(id) on delete cascade,
  connection_id uuid not null,
  native_generation uuid not null,
  connection_count integer not null check (connection_count between 1 and 3)
);
alter table public.ios_native_call_state_issuances enable row level security;
alter table public.ios_native_call_state_issuances force row level security;
alter table public.ios_native_call_state_connections enable row level security;
alter table public.ios_native_call_state_connections force row level security;
revoke all on public.ios_native_call_state_issuances, public.ios_native_call_state_connections
  from public, anon, authenticated, service_role;

create function public.whole_app_issue_ios_call_state_observer(
  p_issuance_id uuid, p_attempt_id uuid, p_attempt_count integer, p_capability_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare issued public.ios_native_call_state_issuances;
begin
  if session_user <> 'postgres' and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_issuance_id is null or p_capability_hash is null or p_capability_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  insert into public.ios_native_call_state_issuances (
    id, attempt_id, attempt_count, capability_hash, token_id, token_hash, revocation_credential_hash,
    recipient_user_id, account_id, session_generation, install_id, call_invite_id, thread_id,
    call_uuid, call_type, expires_at
  )
  select p_issuance_id, a.id, a.attempt_count, p_capability_hash, t.id, t.token_hash, t.revocation_credential_hash,
    t.user_id, t.account_id, t.session_generation, t.install_id, i.id, i.thread_id,
    i.id, i.call_type, i.expires_at
  from public.voip_push_delivery_attempts a
  join public.user_voip_push_tokens t on t.id = a.voip_push_token_id
  join public.chat_call_invites i on i.id = a.call_invite_id
  join auth.sessions s on s.id = t.session_generation and s.user_id = t.user_id
  where a.id = p_attempt_id and a.attempt_count = p_attempt_count and a.status = 'attempted'
    and a.recipient_user_id = t.user_id and i.callee_user_id = t.user_id::text
    and t.account_id = t.user_id and t.enabled and t.ownership_state = 'ACCOUNT_BOUND'
    and t.revoked_at is null and t.revocation_credential_hash is not null
    and (s.not_after is null or s.not_after > clock_timestamp())
    and not public.is_account_access_restricted(t.user_id::text)
    and i.status = 'ringing' and i.expires_at > clock_timestamp()
    and i.expires_at <= clock_timestamp() + interval '300 seconds'
    and exists (select 1 from public.chat_thread_members m
      where m.thread_id = i.thread_id and m.user_id = i.callee_user_id)
    and exists (select 1 from public.chat_thread_members m
      where m.thread_id = i.thread_id and m.user_id = i.caller_user_id)
  on conflict do nothing returning * into issued;
  if issued.id is null then return null; end if;
  return jsonb_build_object('observerId', issued.id, 'expiresAt', issued.expires_at);
end;
$$;

-- This internal predicate returns only the exact issued/current binding. It is
-- not granted even to service_role; the bounded public RPCs own its use.
create function public.whole_app_current_ios_call_state_observer(p_issuance_id uuid, p_capability_hash text)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'observerId', q.id, 'inviteId', q.call_invite_id, 'threadId', q.thread_id,
    'callUuid', q.call_uuid, 'callType', q.call_type,
    'recipientUserId', q.recipient_user_id, 'recipientAccountId', q.account_id,
    'recipientSessionGeneration', q.session_generation, 'recipientInstallId', q.install_id,
    'expiresAt', q.expires_at, 'status', i.status
  )
  from public.ios_native_call_state_issuances q
  join public.user_voip_push_tokens t on t.id = q.token_id
  join auth.sessions s on s.id = q.session_generation and s.user_id = q.recipient_user_id
  join public.chat_call_invites i on i.id = q.call_invite_id
  where q.id = p_issuance_id and q.capability_hash = p_capability_hash
    and q.expires_at > clock_timestamp()
    and t.user_id = q.recipient_user_id and t.account_id = q.account_id
    and t.session_generation = q.session_generation and t.install_id = q.install_id
    and t.token_hash = q.token_hash and t.revocation_credential_hash = q.revocation_credential_hash
    and t.enabled and t.ownership_state = 'ACCOUNT_BOUND' and t.revoked_at is null
    and (s.not_after is null or s.not_after > clock_timestamp())
    and not public.is_account_access_restricted(q.recipient_user_id::text)
    and i.thread_id = q.thread_id and i.callee_user_id = q.recipient_user_id::text
    and i.call_type = q.call_type and i.expires_at = q.expires_at
    and i.status in ('ringing','accepted','canceled','declined','missed','ended')
    and exists (select 1 from public.chat_thread_members m
      where m.thread_id = i.thread_id and m.user_id = i.callee_user_id)
    and exists (select 1 from public.chat_thread_members m
      where m.thread_id = i.thread_id and m.user_id = i.caller_user_id)
$$;

create function public.whole_app_claim_ios_call_state_observer(
  p_issuance_id uuid, p_capability_hash text, p_connection_id uuid, p_native_generation uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; claimed uuid;
begin
  if session_user <> 'postgres' and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_connection_id is null or p_native_generation is null then return null; end if;
  snapshot := public.whole_app_current_ios_call_state_observer(p_issuance_id, p_capability_hash);
  if snapshot is null then return null; end if;
  insert into public.ios_native_call_state_connections as c(issuance_id, connection_id, native_generation, connection_count)
  values(p_issuance_id, p_connection_id, p_native_generation, 1)
  on conflict(issuance_id) do update set connection_id = excluded.connection_id,
    connection_count = c.connection_count + 1
  where c.connection_count < 3 and c.native_generation = excluded.native_generation
    and c.connection_id <> excluded.connection_id
  returning connection_id into claimed;
  if claimed is null then return null; end if;
  -- Re-read after connection ownership changes; never return a stale pre-claim row.
  snapshot := public.whole_app_current_ios_call_state_observer(p_issuance_id, p_capability_hash);
  return snapshot;
end;
$$;

create function public.whole_app_read_ios_call_state_observer(
  p_issuance_id uuid, p_capability_hash text, p_connection_id uuid, p_native_generation uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if session_user <> 'postgres' and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if not exists(select 1 from public.ios_native_call_state_connections c
    where c.issuance_id = p_issuance_id and c.connection_id = p_connection_id
      and c.native_generation = p_native_generation) then return null; end if;
  return public.whole_app_current_ios_call_state_observer(p_issuance_id, p_capability_hash);
end;
$$;

revoke all on function public.whole_app_issue_ios_call_state_observer(uuid,uuid,integer,text),
  public.whole_app_current_ios_call_state_observer(uuid,text),
  public.whole_app_claim_ios_call_state_observer(uuid,text,uuid,uuid),
  public.whole_app_read_ios_call_state_observer(uuid,text,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.whole_app_issue_ios_call_state_observer(uuid,uuid,integer,text),
  public.whole_app_claim_ios_call_state_observer(uuid,text,uuid,uuid),
  public.whole_app_read_ios_call_state_observer(uuid,text,uuid,uuid) to service_role;

comment on table public.ios_native_call_state_issuances is
  'Immutable incoming-wake signaling capability bindings. Raw capabilities exist only in the exact native push and request memory, never in rows or logs. No client table grants.';
-- Rollback uses a later forward migration after disabling issuance; revoke RPC
-- execution first. Do not change old migrations or extend issued deadlines.
