begin;

-- Source-only coordinated client/Edge/SQL cutover. This fences only competing
-- registrations in the same provider/install/user/session stream. Revocation,
-- lifecycle cleanup and cross-install transfer semantics are NOT changed.
create table private.notification_registration_streams (
  platform text not null check (platform in ('android', 'ios')),
  install_id text not null check (length(install_id) between 1 and 256),
  provider text not null check (provider in ('expo', 'fcm') and (platform <> 'ios' or provider = 'expo')),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  session_generation text not null,
  incarnation uuid not null default gen_random_uuid(),
  revision bigint not null default 0 check (revision >= 0),
  last_token_hash text,
  primary key (platform, install_id, provider, actor_user_id, session_generation)
);
create table private.notification_registration_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null,
  result_payload jsonb not null,
  primary key (actor_user_id, operation_id)
);
alter table private.notification_registration_streams enable row level security;
alter table private.notification_registration_streams force row level security;
alter table private.notification_registration_receipts enable row level security;
alter table private.notification_registration_receipts force row level security;
revoke all on private.notification_registration_streams, private.notification_registration_receipts
  from public, anon, authenticated, service_role;

create function private.assert_push_registration_subject(
  p_expected_user_id uuid, p_expected_account_id uuid, p_session_generation text,
  p_platform text, p_provider text, p_install_id text, p_revocation_credential_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare session_state jsonb;
begin
  if p_expected_user_id is null or p_expected_account_id is distinct from p_expected_user_id
    or auth.uid() is distinct from p_expected_user_id
    or nullif(p_session_generation, '') is null
    or p_session_generation is distinct from auth.jwt()->>'session_id'
    or p_platform is null or p_platform not in ('android','ios')
    or p_provider is null or p_provider not in ('expo','fcm')
    or (p_platform = 'ios' and p_provider <> 'expo')
    or nullif(trim(p_install_id), '') is null or length(p_install_id) > 256
    or p_revocation_credential_hash is null or p_revocation_credential_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'push_registration_subject_invalid' using errcode = '22023'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'push_registration_requires_read_committed' using errcode = '25000';
  end if;
  session_state := public.wave1_session_authority_readback();
  if session_state->>'state' is distinct from 'ACTIVE'
    or coalesce((session_state->>'restoreOnly')::boolean, true)
    or public.is_account_access_restricted(p_expected_user_id::text)
    or not exists (select 1 from auth.sessions s
      where s.id::text = p_session_generation and s.user_id = p_expected_user_id
        and (s.not_after is null or s.not_after > clock_timestamp()))
  then raise exception 'push_registration_current_session_required' using errcode = '42501'; end if;
  if exists (select 1 from public.wave1_push_installation_ownership o
    where o.platform = p_platform and o.install_id = p_install_id
      and o.ownership_state in ('ACCOUNT_BOUND','REVOCATION_PENDING')
      and o.revocation_credential_hash is distinct from p_revocation_credential_hash)
  then raise exception 'push_registration_credential_mismatch' using errcode = '42501'; end if;
end $$;

create function private.push_registration_current(p_stream private.notification_registration_streams)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_token public.user_push_tokens;
begin
  select t.* into current_token from public.user_push_tokens t
    join public.wave1_push_installation_ownership o
      on o.platform = t.platform and o.install_id = t.install_id
      and o.user_id = t.user_id and o.account_id = t.user_id
      and o.session_generation = t.session_generation and o.ownership_state = 'ACCOUNT_BOUND'
    where t.platform = p_stream.platform and t.install_id = p_stream.install_id
      and t.provider = p_stream.provider and t.user_id = p_stream.actor_user_id
      and t.session_generation = p_stream.session_generation
      and t.enabled and t.ownership_state = 'ACCOUNT_BOUND' and t.revoked_at is null
    order by t.last_seen_at desc, t.id limit 1;
  return jsonb_build_object('userId', p_stream.actor_user_id::text, 'accountId', p_stream.actor_user_id::text,
    'sessionGeneration', p_stream.session_generation, 'platform', p_stream.platform,
    'provider', p_stream.provider, 'installId', p_stream.install_id,
    'incarnation', p_stream.incarnation::text, 'revision', p_stream.revision::text,
    'registered', found, 'tokenFingerprint', case when found then current_token.token_fingerprint else null end);
end $$;

create function public.read_my_push_registration_intent(
  p_expected_user_id uuid, p_expected_account_id uuid, p_session_generation text,
  p_platform text, p_provider text, p_install_id text, p_revocation_credential_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare stream private.notification_registration_streams;
begin
  perform private.assert_push_registration_subject(p_expected_user_id,p_expected_account_id,p_session_generation,
    p_platform,p_provider,p_install_id,p_revocation_credential_hash);
  -- Match every existing ownership mutation: global lock BEFORE stream rows.
  perform pg_advisory_xact_lock(hashtextextended('wave1-push-authority',0));
  perform private.assert_push_registration_subject(p_expected_user_id,p_expected_account_id,p_session_generation,
    p_platform,p_provider,p_install_id,p_revocation_credential_hash);
  insert into private.notification_registration_streams(platform,install_id,provider,actor_user_id,session_generation)
    values(p_platform,p_install_id,p_provider,p_expected_user_id,p_session_generation) on conflict do nothing;
  select s.* into strict stream from private.notification_registration_streams s
    where s.platform=p_platform and s.install_id=p_install_id and s.provider=p_provider
      and s.actor_user_id=p_expected_user_id and s.session_generation=p_session_generation for update;
  perform private.assert_push_registration_subject(p_expected_user_id,p_expected_account_id,p_session_generation,
    p_platform,p_provider,p_install_id,p_revocation_credential_hash);
  return private.push_registration_current(stream) || jsonb_build_object('status','ready','requestAccepted',true);
end $$;

create function public.register_my_push_token(
  p_expected_user_id uuid, p_expected_account_id uuid, p_session_generation text,
  p_platform text, p_provider text, p_install_id text, p_token text,
  p_revocation_credential_hash text, p_operation_key text, p_permission_status text,
  p_app_version text, p_build_version text, p_metadata jsonb,
  p_operation_id uuid, p_expected_incarnation uuid, p_expected_revision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stream private.notification_registration_streams; expected bigint; request_hash text;
  prior private.notification_registration_receipts; current_state jsonb; result jsonb;
  v_token_hash text; outcome text; actual_registration jsonb;
begin
  perform private.assert_push_registration_subject(p_expected_user_id,p_expected_account_id,p_session_generation,
    p_platform,p_provider,p_install_id,p_revocation_credential_hash);
  if p_operation_id is null or p_expected_incarnation is null or p_expected_revision is null
    or p_expected_revision !~ '^(0|[1-9][0-9]{0,18})$'
    or p_expected_revision::numeric > 9223372036854775807
    or p_operation_key is distinct from 'register:' || p_operation_id::text
    or nullif(trim(p_token),'') is null or length(p_token)>2048
    or p_permission_status is null or p_permission_status not in ('granted','provisional','ephemeral')
    or p_metadata is null or jsonb_typeof(p_metadata) <> 'object' or pg_column_size(p_metadata)>8192
    or length(coalesce(p_app_version,''))>64 or length(coalesce(p_build_version,''))>64
  then raise exception 'push_registration_request_invalid' using errcode = '22023'; end if;
  expected := p_expected_revision::bigint;
  v_token_hash := public.wave1_sha256(p_provider || ':' || p_token);
  -- Hash every semantically relevant input; no raw provider token or device
  -- capability is retained in receipts. A reused UUID cannot change its target.
  request_hash := public.wave1_sha256(jsonb_build_array(p_expected_user_id,p_expected_account_id,
    p_session_generation,p_platform,p_provider,p_install_id,v_token_hash,p_revocation_credential_hash,
    p_operation_key,p_permission_status,p_app_version,p_build_version,p_metadata,
    p_expected_incarnation,p_expected_revision)::text);
  perform pg_advisory_xact_lock(hashtextextended('wave1-push-authority',0));
  perform private.assert_push_registration_subject(p_expected_user_id,p_expected_account_id,p_session_generation,
    p_platform,p_provider,p_install_id,p_revocation_credential_hash);
  -- Never initialize/reset a stream from a mutation, including after revoke.
  select s.* into stream from private.notification_registration_streams s
    where s.platform=p_platform and s.install_id=p_install_id and s.provider=p_provider
      and s.actor_user_id=p_expected_user_id and s.session_generation=p_session_generation for update;
  if not found then raise exception 'push_registration_snapshot_required' using errcode='22023'; end if;
  perform private.assert_push_registration_subject(p_expected_user_id,p_expected_account_id,p_session_generation,
    p_platform,p_provider,p_install_id,p_revocation_credential_hash);
  current_state := private.push_registration_current(stream);
  select r.* into prior from private.notification_registration_receipts r
    where r.actor_user_id=p_expected_user_id and r.operation_id=p_operation_id;
  if found then
    if prior.request_hash is distinct from request_hash then
      raise exception 'push_registration_operation_key_conflict' using errcode='22023'; end if;
    outcome := 'conflict';
    if prior.result_payload->>'status'='registered'
      and prior.result_payload->>'incarnation'=stream.incarnation::text
      and prior.result_payload->>'revision'=stream.revision::text then
      outcome := case when (current_state->>'registered')::boolean and exists (
        select 1 from public.user_push_tokens t where t.platform=p_platform and t.install_id=p_install_id
          and t.provider=p_provider and t.user_id=p_expected_user_id and t.session_generation=p_session_generation
          and t.token_hash=v_token_hash and t.enabled and t.ownership_state='ACCOUNT_BOUND' and t.revoked_at is null
      ) then 'registered' else 'retired' end;
    end if;
    -- Replays report CURRENT truth, never reapply and never resurrect a token.
    return current_state || jsonb_build_object('status',outcome,'requestAccepted',outcome='registered',
      'operationId',p_operation_id::text,'operationKey',p_operation_key,
      'expectedIncarnation',p_expected_incarnation::text,'expectedRevision',p_expected_revision);
  end if;
  if stream.incarnation is distinct from p_expected_incarnation or stream.revision<>expected then
    outcome := 'conflict';
  else
    if stream.revision=9223372036854775807 then
      raise exception 'push_registration_revision_exhausted' using errcode='22003'; end if;
    -- Existing token ownership/credential/session checks and all lifecycle
    -- behavior remain in the original function, whose body is unchanged.
    actual_registration := public.wave1_register_push_token(p_expected_user_id,p_expected_account_id,p_session_generation,
      p_platform,p_provider,p_install_id,p_token,p_revocation_credential_hash,p_operation_key,p_permission_status,
      p_app_version,p_build_version,p_metadata);
    if actual_registration->>'status' is distinct from 'registered'
      or actual_registration->>'ownershipState' is distinct from 'ACCOUNT_BOUND'
      or actual_registration->>'sessionGeneration' is distinct from p_session_generation
      or actual_registration->>'tokenFingerprint' is distinct from left(v_token_hash,12)
    then raise exception 'push_registration_confirmation_failed'; end if;
    update private.notification_registration_streams s set revision=s.revision+1,last_token_hash=v_token_hash
      where s.platform=p_platform and s.install_id=p_install_id and s.provider=p_provider
        and s.actor_user_id=p_expected_user_id and s.session_generation=p_session_generation returning s.* into stream;
    outcome := 'registered';
    current_state := private.push_registration_current(stream);
  end if;
  result := current_state || jsonb_build_object('status',outcome,'requestAccepted',outcome='registered',
    'operationId',p_operation_id::text,'operationKey',p_operation_key,
    'expectedIncarnation',p_expected_incarnation::text,'expectedRevision',p_expected_revision);
  insert into private.notification_registration_receipts(actor_user_id,operation_id,request_hash,result_payload)
    values(p_expected_user_id,p_operation_id,request_hash,result);
  perform private.assert_push_registration_subject(p_expected_user_id,p_expected_account_id,p_session_generation,
    p_platform,p_provider,p_install_id,p_revocation_credential_hash);
  return result;
end $$;

revoke all on function private.assert_push_registration_subject(uuid,uuid,text,text,text,text,text),
  private.push_registration_current(private.notification_registration_streams),
  public.read_my_push_registration_intent(uuid,uuid,text,text,text,text,text),
  public.register_my_push_token(uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.read_my_push_registration_intent(uuid,uuid,text,text,text,text,text),
  public.register_my_push_token(uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb,uuid,uuid,text)
  to authenticated;

-- Always-on protocol boundary: the old unfenced register RPC becomes internal.
-- Matching client + Edge rollout is mandatory. Existing old-client register
-- calls fail closed. This is not authority to apply production ACL changes.
revoke all on function public.wave1_register_push_token(uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)
  from public,anon,authenticated,service_role;
-- No revoke RPC, trigger, ownership table, cleanup helper or default reason is
-- changed. Registration-versus-revocation races remain explicitly unresolved.
commit;
