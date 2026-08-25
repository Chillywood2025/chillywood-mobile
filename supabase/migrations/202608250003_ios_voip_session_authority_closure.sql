-- Whole-app closure: bind every deliverable iOS PushKit token to the exact
-- authenticated account/session generation that registered it.
--
-- Source only. This migration does not enable VoIP dispatch, contact APNs,
-- deploy a database, submit a build, or change any production provider.

set check_function_bodies = false;

alter table public."user_voip_push_tokens"
  add column if not exists "account_id" uuid references auth.users(id) on delete cascade,
  add column if not exists "session_generation" uuid references auth.sessions(id) on delete set null,
  add column if not exists "ownership_state" text not null default 'INVALID',
  add column if not exists "revocation_credential_hash" text,
  add column if not exists "ownership_operation_key" text,
  add column if not exists "last_revocation_reason" text;

-- Rows created before exact account/session ownership existed cannot be
-- promoted by inference. A fresh authenticated registration is required.
update public."user_voip_push_tokens"
set "enabled" = false,
    "ownership_state" = 'INVALID',
    "revoked_at" = coalesce("revoked_at", timezone('utc'::text, now())),
    "updated_at" = timezone('utc'::text, now())
where "enabled"
   or "ownership_state" <> 'INVALID'
   or "account_id" is not null
   or "session_generation" is not null;

alter table public."user_voip_push_tokens"
  drop constraint if exists "user_voip_push_tokens_account_binding_check";
alter table public."user_voip_push_tokens"
  add constraint "user_voip_push_tokens_account_binding_check" check (
    "account_id" is null or "account_id" = "user_id"
  );

alter table public."user_voip_push_tokens"
  drop constraint if exists "user_voip_push_tokens_ownership_state_check";
alter table public."user_voip_push_tokens"
  add constraint "user_voip_push_tokens_ownership_state_check" check (
    "ownership_state" in ('ACCOUNT_BOUND', 'REVOKED', 'INVALID')
  );

alter table public."user_voip_push_tokens"
  drop constraint if exists "user_voip_push_tokens_revocation_credential_check";
alter table public."user_voip_push_tokens"
  add constraint "user_voip_push_tokens_revocation_credential_check" check (
    "revocation_credential_hash" is null
    or "revocation_credential_hash" ~ '^[0-9a-f]{64}$'
  );

alter table public."user_voip_push_tokens"
  drop constraint if exists "user_voip_push_tokens_operation_key_check";
alter table public."user_voip_push_tokens"
  add constraint "user_voip_push_tokens_operation_key_check" check (
    "ownership_operation_key" is null
    or length(btrim("ownership_operation_key")) between 8 and 160
  );

alter table public."user_voip_push_tokens"
  drop constraint if exists "user_voip_push_tokens_exact_authority_check";
alter table public."user_voip_push_tokens"
  add constraint "user_voip_push_tokens_exact_authority_check" check (
    (
      "enabled"
      and "ownership_state" = 'ACCOUNT_BOUND'
      and "account_id" = "user_id"
      and "session_generation" is not null
      and "revocation_credential_hash" is not null
      and "ownership_operation_key" is not null
      and "revoked_at" is null
    )
    or (
      not "enabled"
      and "ownership_state" in ('REVOKED', 'INVALID')
      and "revoked_at" is not null
    )
  );

create unique index if not exists "user_voip_push_tokens_active_install_environment_unique"
  on public."user_voip_push_tokens" ("install_id", "apns_environment")
  where "enabled" and "ownership_state" = 'ACCOUNT_BOUND' and "revoked_at" is null;

create index if not exists "user_voip_push_tokens_session_authority_idx"
  on public."user_voip_push_tokens" ("user_id", "account_id", "session_generation", "enabled");

create or replace function public."whole_app_register_ios_voip_push_token"(
  p_expected_user_id uuid,
  p_expected_account_id uuid,
  p_session_generation uuid,
  p_install_id text,
  p_apns_environment text,
  p_token text,
  p_revocation_credential_hash text,
  p_operation_key text,
  p_app_version text default null,
  p_build_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session jsonb;
  v_install_owner public."user_voip_push_tokens"%rowtype;
  v_token_owner public."user_voip_push_tokens"%rowtype;
  v_token_hash text;
  v_token_fingerprint text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_expected_user_id is null
    or p_expected_account_id is distinct from p_expected_user_id
    or p_session_generation is null
    or length(btrim(coalesce(p_install_id, ''))) not between 8 and 200
    or p_apns_environment not in ('development', 'production')
    or coalesce(p_token, '') !~ '^[0-9a-f]{64,200}$'
    or coalesce(p_revocation_credential_hash, '') !~ '^[0-9a-f]{64}$'
    or length(btrim(coalesce(p_operation_key, ''))) not between 8 and 160
    or length(coalesce(p_app_version, '')) > 64
    or length(coalesce(p_build_version, '')) > 64
  then
    raise exception 'ios_voip_registration_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('whole-app-ios-voip-authority', 0));
  v_session := public."wave1_session_authority_readback"();
  if v_session->>'state' <> 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean, false)
    or public."is_account_access_restricted"(v_session->>'userId')
    or (v_session->>'userId')::uuid is distinct from p_expected_user_id
    or (v_session->>'accountId')::uuid is distinct from p_expected_account_id
    or (v_session->>'sessionGeneration')::uuid is distinct from p_session_generation
    or not exists (
      select 1
      from auth.sessions session_row
      where session_row.id = p_session_generation
        and session_row.user_id = p_expected_user_id
    )
  then
    raise exception 'ios_voip_session_binding_mismatch';
  end if;

  v_token_hash := public."wave1_sha256"('apns_voip:' || p_apns_environment || ':' || lower(p_token));
  v_token_fingerprint := left(v_token_hash, 12);

  select token_row.*
  into v_install_owner
  from public."user_voip_push_tokens" token_row
  where token_row."install_id" = p_install_id
    and token_row."apns_environment" = p_apns_environment
    and token_row."enabled"
    and token_row."ownership_state" = 'ACCOUNT_BOUND'
    and token_row."revoked_at" is null
  order by token_row."last_seen_at" desc
  limit 1
  for update;

  if v_install_owner."id" is not null
    and v_install_owner."revocation_credential_hash" is distinct from p_revocation_credential_hash
  then
    raise exception 'ios_voip_registration_credential_mismatch';
  end if;

  select token_row.*
  into v_token_owner
  from public."user_voip_push_tokens" token_row
  where token_row."apns_environment" = p_apns_environment
    and token_row."token_hash" = v_token_hash
  limit 1
  for update;

  if v_token_owner."id" is not null
    and v_token_owner."enabled"
    and v_token_owner."ownership_state" = 'ACCOUNT_BOUND'
    and v_token_owner."revocation_credential_hash" is distinct from p_revocation_credential_hash
  then
    raise exception 'ios_voip_registration_credential_mismatch';
  end if;

  update public."user_voip_push_tokens" token_row
  set "enabled" = false,
      "ownership_state" = 'REVOKED',
      "revoked_at" = coalesce(token_row."revoked_at", v_now),
      "last_revocation_reason" = 'registration_replaced',
      "updated_at" = v_now
  where token_row."apns_environment" = p_apns_environment
    and token_row."enabled"
    and token_row."ownership_state" = 'ACCOUNT_BOUND'
    and token_row."revoked_at" is null
    and (
      token_row."install_id" = p_install_id
      or token_row."token_hash" = v_token_hash
    );

  insert into public."user_voip_push_tokens" (
    "user_id",
    "account_id",
    "session_generation",
    "install_id",
    "token",
    "token_hash",
    "token_fingerprint",
    "apns_environment",
    "app_version",
    "build_version",
    "enabled",
    "ownership_state",
    "revocation_credential_hash",
    "ownership_operation_key",
    "last_revocation_reason",
    "last_seen_at",
    "revoked_at",
    "updated_at"
  ) values (
    p_expected_user_id,
    p_expected_account_id,
    p_session_generation,
    btrim(p_install_id),
    lower(p_token),
    v_token_hash,
    v_token_fingerprint,
    p_apns_environment,
    nullif(btrim(coalesce(p_app_version, '')), ''),
    nullif(btrim(coalesce(p_build_version, '')), ''),
    true,
    'ACCOUNT_BOUND',
    p_revocation_credential_hash,
    btrim(p_operation_key),
    null,
    v_now,
    null,
    v_now
  )
  on conflict ("apns_environment", "token_hash") do update set
    "user_id" = excluded."user_id",
    "account_id" = excluded."account_id",
    "session_generation" = excluded."session_generation",
    "install_id" = excluded."install_id",
    "token" = excluded."token",
    "token_fingerprint" = excluded."token_fingerprint",
    "app_version" = excluded."app_version",
    "build_version" = excluded."build_version",
    "enabled" = true,
    "ownership_state" = 'ACCOUNT_BOUND',
    "revocation_credential_hash" = excluded."revocation_credential_hash",
    "ownership_operation_key" = excluded."ownership_operation_key",
    "last_revocation_reason" = null,
    "last_seen_at" = v_now,
    "revoked_at" = null,
    "updated_at" = v_now;

  return jsonb_build_object(
    'requestAccepted', true,
    'status', 'registered',
    'ownershipState', 'ACCOUNT_BOUND',
    'userId', p_expected_user_id,
    'accountId', p_expected_account_id,
    'sessionGeneration', p_session_generation,
    'installId', btrim(p_install_id),
    'platform', 'ios',
    'provider', 'apns_voip',
    'apnsEnvironment', p_apns_environment,
    'operationKey', btrim(p_operation_key),
    'tokenFingerprint', v_token_fingerprint
  );
end;
$$;

create or replace function public."whole_app_ios_voip_push_readback"(
  p_expected_user_id uuid,
  p_expected_account_id uuid,
  p_session_generation uuid,
  p_install_id text,
  p_apns_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session jsonb := public."wave1_session_authority_readback"();
  v_token public."user_voip_push_tokens"%rowtype;
begin
  if p_expected_user_id is null
    or p_expected_account_id is distinct from p_expected_user_id
    or p_session_generation is null
    or length(btrim(coalesce(p_install_id, ''))) not between 8 and 200
    or p_apns_environment not in ('development', 'production')
    or v_session->>'state' <> 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean, false)
    or (v_session->>'userId')::uuid is distinct from p_expected_user_id
    or (v_session->>'accountId')::uuid is distinct from p_expected_account_id
    or (v_session->>'sessionGeneration')::uuid is distinct from p_session_generation
  then
    raise exception 'ios_voip_session_binding_mismatch';
  end if;

  select token_row.*
  into v_token
  from public."user_voip_push_tokens" token_row
  where token_row."user_id" = p_expected_user_id
    and token_row."account_id" = p_expected_account_id
    and token_row."session_generation" = p_session_generation
    and token_row."install_id" = btrim(p_install_id)
    and token_row."apns_environment" = p_apns_environment
    and token_row."enabled"
    and token_row."ownership_state" = 'ACCOUNT_BOUND'
    and token_row."revoked_at" is null
  order by token_row."last_seen_at" desc
  limit 1;

  return jsonb_build_object(
    'requestAccepted', true,
    'status', case when v_token."id" is null then 'not_registered' else 'registered' end,
    'registered', v_token."id" is not null,
    'ownershipState', case when v_token."id" is null then 'UNBOUND' else 'ACCOUNT_BOUND' end,
    'userId', p_expected_user_id,
    'accountId', p_expected_account_id,
    'sessionGeneration', p_session_generation,
    'installId', btrim(p_install_id),
    'platform', 'ios',
    'provider', 'apns_voip',
    'apnsEnvironment', p_apns_environment,
    'tokenFingerprint', case when v_token."id" is null then null else v_token."token_fingerprint" end,
    'lastSeenAt', case when v_token."id" is null then null else v_token."last_seen_at" end
  );
end;
$$;

create or replace function public."whole_app_revoke_ios_voip_push_ownership"(
  p_expected_user_id uuid,
  p_expected_account_id uuid,
  p_session_generation uuid,
  p_install_id text,
  p_apns_environment text,
  p_revocation_credential_hash text,
  p_operation_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exact_count integer := 0;
  v_active_count integer := 0;
  v_credential_mismatch boolean := false;
  v_now timestamptz := timezone('utc'::text, now());
  v_receipt jsonb;
begin
  if p_expected_user_id is null
    or p_expected_account_id is distinct from p_expected_user_id
    or p_session_generation is null
    or length(btrim(coalesce(p_install_id, ''))) not between 8 and 200
    or p_apns_environment not in ('development', 'production', 'all')
    or coalesce(p_revocation_credential_hash, '') !~ '^[0-9a-f]{64}$'
    or length(btrim(coalesce(p_operation_key, ''))) not between 8 and 160
    or p_reason not in (
      'sign_out',
      'account_switch',
      'auth_invalidation',
      'account_deletion',
      'recovery_replacement',
      'auth_loss',
      'user_request',
      'provider_invalid'
    )
  then
    raise exception 'ios_voip_revocation_invalid';
  end if;

  v_receipt := jsonb_build_object(
    'userId', p_expected_user_id,
    'accountId', p_expected_account_id,
    'sessionGeneration', p_session_generation,
    'installId', btrim(p_install_id),
    'platform', 'ios',
    'provider', 'apns_voip',
    'apnsEnvironment', p_apns_environment,
    'operationKey', btrim(p_operation_key)
  );

  perform pg_advisory_xact_lock(hashtextextended('whole-app-ios-voip-authority', 0));

  select count(*)::integer,
         count(*) filter (
           where token_row."enabled"
             and token_row."ownership_state" = 'ACCOUNT_BOUND'
             and token_row."revoked_at" is null
         )::integer,
         coalesce(bool_or(
           token_row."revocation_credential_hash" is distinct from p_revocation_credential_hash
         ), false)
  into v_exact_count, v_active_count, v_credential_mismatch
  from public."user_voip_push_tokens" token_row
  where token_row."user_id" = p_expected_user_id
    and token_row."account_id" = p_expected_account_id
    and token_row."session_generation" = p_session_generation
    and token_row."install_id" = btrim(p_install_id)
    and (p_apns_environment = 'all' or token_row."apns_environment" = p_apns_environment);

  if v_exact_count = 0 then
    return v_receipt || jsonb_build_object(
      'status', 'revoked',
      'requestAccepted', true,
      'disposition', 'already_detached',
      'idempotent', true
    );
  end if;

  if v_credential_mismatch then
    return v_receipt || jsonb_build_object(
      'status', 'retry_required',
      'requestAccepted', false,
      'disposition', 'credential_mismatch',
      'idempotent', false
    );
  end if;

  update public."user_voip_push_tokens" token_row
  set "enabled" = false,
      "ownership_state" = 'REVOKED',
      "revoked_at" = coalesce(token_row."revoked_at", v_now),
      "ownership_operation_key" = btrim(p_operation_key),
      "last_revocation_reason" = p_reason,
      "updated_at" = v_now
  where token_row."user_id" = p_expected_user_id
    and token_row."account_id" = p_expected_account_id
    and token_row."session_generation" = p_session_generation
    and token_row."install_id" = btrim(p_install_id)
    and (p_apns_environment = 'all' or token_row."apns_environment" = p_apns_environment);

  return v_receipt || jsonb_build_object(
    'status', 'revoked',
    'requestAccepted', true,
    'disposition', case when v_active_count > 0 then 'revoked' else 'already_revoked' end,
    'idempotent', v_active_count = 0
  );
end;
$$;

create or replace function public."whole_app_read_deliverable_ios_voip_tokens"(
  p_recipient_user_id uuid
)
returns table (
  id uuid,
  token text,
  token_fingerprint text,
  apns_environment text,
  user_id uuid,
  account_id uuid,
  session_generation uuid,
  install_id text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if session_user <> 'postgres'
    and coalesce(auth.jwt()->>'role', '') <> 'service_role'
  then
    raise exception 'service_role_required';
  end if;
  if p_recipient_user_id is null
    or public."is_account_access_restricted"(p_recipient_user_id::text)
  then
    return;
  end if;

  return query
  select token_row."id",
         token_row."token",
         token_row."token_fingerprint",
         token_row."apns_environment",
         token_row."user_id",
         token_row."account_id",
         token_row."session_generation",
         token_row."install_id"
  from public."user_voip_push_tokens" token_row
  where token_row."user_id" = p_recipient_user_id
    and token_row."account_id" = p_recipient_user_id
    and token_row."enabled"
    and token_row."ownership_state" = 'ACCOUNT_BOUND'
    and token_row."revoked_at" is null
    and token_row."session_generation" is not null
    and exists (
      select 1
      from auth.sessions session_row
      where session_row.id = token_row."session_generation"
        and session_row.user_id = p_recipient_user_id
    )
  order by token_row."last_seen_at" desc
  limit 5;
end;
$$;

create or replace function public."whole_app_revoke_ios_voip_on_session_delete"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public."user_voip_push_tokens" token_row
  set "enabled" = false,
      "ownership_state" = 'REVOKED',
      "revoked_at" = coalesce(token_row."revoked_at", timezone('utc'::text, now())),
      "last_revocation_reason" = 'session_deleted',
      "updated_at" = timezone('utc'::text, now())
  where token_row."session_generation" = old.id;
  return old;
end;
$$;

drop trigger if exists "whole_app_revoke_ios_voip_on_session_delete" on auth.sessions;
create trigger "whole_app_revoke_ios_voip_on_session_delete"
before delete on auth.sessions
for each row execute function public."whole_app_revoke_ios_voip_on_session_delete"();

create or replace function public."whole_app_revoke_ios_voip_on_account_deletion"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."status" = 'scheduled'
    and (tg_op = 'INSERT' or old."status" is distinct from new."status")
  then
    update public."user_voip_push_tokens" token_row
    set "enabled" = false,
        "ownership_state" = 'REVOKED',
        "revoked_at" = coalesce(token_row."revoked_at", timezone('utc'::text, now())),
        "last_revocation_reason" = 'account_deletion',
        "updated_at" = timezone('utc'::text, now())
    where token_row."user_id" = new."user_id";
  end if;
  return new;
end;
$$;

drop trigger if exists "whole_app_revoke_ios_voip_on_account_deletion" on public."account_deletion_requests";
create trigger "whole_app_revoke_ios_voip_on_account_deletion"
after insert or update of "status" on public."account_deletion_requests"
for each row execute function public."whole_app_revoke_ios_voip_on_account_deletion"();

create or replace function public."whole_app_revoke_ios_voip_on_auth_restriction"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."banned_until" is not null
    and new."banned_until" > timezone('utc'::text, now())
    and new."banned_until" is distinct from old."banned_until"
  then
    update public."user_voip_push_tokens" token_row
    set "enabled" = false,
        "ownership_state" = 'REVOKED',
        "revoked_at" = coalesce(token_row."revoked_at", timezone('utc'::text, now())),
        "last_revocation_reason" = 'account_restricted',
        "updated_at" = timezone('utc'::text, now())
    where token_row."user_id" = new."id";
  end if;
  return new;
end;
$$;

drop trigger if exists "whole_app_revoke_ios_voip_on_auth_restriction" on auth.users;
create trigger "whole_app_revoke_ios_voip_on_auth_restriction"
after update of "banned_until" on auth.users
for each row execute function public."whole_app_revoke_ios_voip_on_auth_restriction"();

-- Revoke any already-scheduled account rows present when this migration lands.
update public."user_voip_push_tokens" token_row
set "enabled" = false,
    "ownership_state" = 'REVOKED',
    "revoked_at" = coalesce(token_row."revoked_at", timezone('utc'::text, now())),
    "last_revocation_reason" = 'account_deletion',
    "updated_at" = timezone('utc'::text, now())
where exists (
  select 1
  from public."account_deletion_requests" deletion
  where deletion."user_id" = token_row."user_id"
    and deletion."status" = 'scheduled'
);

revoke all on function public."whole_app_register_ios_voip_push_token"(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public."whole_app_ios_voip_push_readback"(
  uuid, uuid, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public."whole_app_revoke_ios_voip_push_ownership"(
  uuid, uuid, uuid, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public."whole_app_read_deliverable_ios_voip_tokens"(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public."whole_app_revoke_ios_voip_on_session_delete"()
  from public, anon, authenticated, service_role;
revoke all on function public."whole_app_revoke_ios_voip_on_account_deletion"()
  from public, anon, authenticated, service_role;
revoke all on function public."whole_app_revoke_ios_voip_on_auth_restriction"()
  from public, anon, authenticated, service_role;

grant execute on function public."whole_app_register_ios_voip_push_token"(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public."whole_app_ios_voip_push_readback"(
  uuid, uuid, uuid, text, text
) to authenticated;
grant execute on function public."whole_app_revoke_ios_voip_push_ownership"(
  uuid, uuid, uuid, text, text, text, text, text
) to service_role;
grant execute on function public."whole_app_read_deliverable_ios_voip_tokens"(uuid)
  to service_role;

comment on table public."user_voip_push_tokens" is
  'Server-owned PushKit tokens. Deliverability requires exact account/install/session-generation ownership; legacy rows are quarantined until fresh authenticated registration.';
comment on function public."whole_app_register_ios_voip_push_token"(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) is 'Binds a PushKit token to the exact current non-restore authenticated session and a device-held revocation credential.';
comment on function public."whole_app_read_deliverable_ios_voip_tokens"(uuid)
  is 'Service-only PushKit delivery readback. Returns only exact account-bound tokens whose session generation still exists and whose account is unrestricted.';
