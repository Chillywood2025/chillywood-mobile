-- Wave 1 identity, entitlement, legal, push, and creator authority foundation.
-- Source only: this migration performs no provider call, payout, or production deployment.

create table if not exists public."wave1_authority_audit_events" (
  "id" uuid primary key default gen_random_uuid(), "domain" text not null,
  "subject_hash" text not null, "object_hash" text,
  "from_state" text, "to_state" text not null,
  "reason" text not null, "authority_source" text not null,
  "operation_key" text not null, "created_at" timestamptz not null default timezone('utc'::text, now()),
  "retention_expires_at" timestamptz not null default (timezone('utc'::text, now()) + interval '7 years'),
  constraint "wave1_authority_audit_domain_check" check ("domain" in ('LEGAL_ACCEPTANCE', 'PUSH_INSTALLATION_OWNERSHIP', 'CREATOR_ELIGIBILITY')),
  constraint "wave1_authority_audit_operation_unique" unique ("domain", "subject_hash", "operation_key"),
  constraint "wave1_authority_audit_retention_check" check ("retention_expires_at" > "created_at" and "retention_expires_at" <= "created_at" + interval '7 years')
);

create table if not exists public."wave1_legal_document_versions" (
  "document_key" text not null, "version" text not null,
  "market" text not null, "capability" text not null,
  "active" boolean not null default true, "effective_at" timestamptz not null,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  primary key ("document_key", "version", "market", "capability"),
  constraint "wave1_legal_document_key_check" check ("document_key" in ('terms', 'privacy', 'community_guidelines', 'creator_terms', 'money_terms')),
  constraint "wave1_legal_document_market_check" check ("market" = 'UNITED_STATES'),
  constraint "wave1_legal_document_capability_check" check ("capability" in ('account', 'creator', 'creator_money'))
);

create unique index if not exists "wave1_legal_document_one_active_version"
  on public."wave1_legal_document_versions" ("document_key", "market", "capability") where "active";

create table if not exists public."wave1_legal_acceptances" (
  "id" uuid primary key default gen_random_uuid(), "user_id" uuid references auth.users(id) on delete set null,
  "subject_hash" text not null, "document_key" text not null,
  "document_version" text not null, "market" text not null,
  "role_key" text not null, "capability" text not null,
  "session_generation" text not null, "authority_source" text not null,
  "accepted_at" timestamptz not null default timezone('utc'::text, now()), "invalidated_at" timestamptz,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "retention_expires_at" timestamptz not null default (timezone('utc'::text, now()) + interval '7 years'),
  constraint "wave1_legal_acceptance_document_fkey" foreign key ("document_key", "document_version", "market", "capability")
    references public."wave1_legal_document_versions" ("document_key", "version", "market", "capability") on delete restrict,
  constraint "wave1_legal_acceptance_source_check" check ("authority_source" in ('authenticated_rpc', 'service_reconciliation')),
  constraint "wave1_legal_acceptance_retention_check" check ("retention_expires_at" > "accepted_at" and "retention_expires_at" <= "accepted_at" + interval '7 years')
);

create unique index if not exists "wave1_legal_acceptance_exact_unique"
  on public."wave1_legal_acceptances" ("user_id", "document_key", "document_version", "market", "role_key", "capability")
  where "user_id" is not null and "invalidated_at" is null;
create index if not exists "wave1_legal_acceptance_user_fkey_idx" on public."wave1_legal_acceptances" ("user_id");

create table if not exists public."wave1_push_installation_ownership" (
  "platform" text not null, "install_id" text not null,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "account_id" uuid not null references auth.users(id) on delete cascade,
  "session_generation" text not null, "ownership_state" text not null,
  "revocation_credential_hash" text not null, "ownership_version" bigint not null default 1,
  "revocation_attempts" integer not null default 0, "last_operation_key" text not null,
  "last_reason" text not null, "last_transition_at" timestamptz not null default timezone('utc'::text, now()),
  "revoked_at" timestamptz, "created_at" timestamptz not null default timezone('utc'::text, now()),
  primary key ("platform", "install_id"),
  constraint "wave1_push_owner_platform_check" check ("platform" in ('android', 'ios')),
  constraint "wave1_push_owner_account_check" check ("account_id" = "user_id"),
  constraint "wave1_push_owner_state_check" check ("ownership_state" in ('UNBOUND', 'ACCOUNT_BOUND', 'REVOCATION_PENDING', 'REVOKED', 'INVALID')),
  constraint "wave1_push_owner_credential_check" check ("revocation_credential_hash" ~ '^[0-9a-f]{64}$'),
  constraint "wave1_push_owner_attempts_check" check ("revocation_attempts" >= 0)
);

create table if not exists public."wave1_creator_eligibility" (
  "creator_user_id" uuid primary key references auth.users(id) on delete cascade,
  "state" text not null default 'PENDING_VERIFICATION', "account_status" text not null default 'UNKNOWN',
  "age_18_plus" boolean, "legal_accepted" boolean, "creator_role" boolean,
  "moderation_state" text not null default 'PENDING', "market" text not null default 'UNKNOWN',
  "rollout_eligible" boolean, "platform_capability" boolean, "provider_eligible" boolean,
  "kyc_complete" boolean, "tax_complete" boolean, "sanctions_clear" boolean, "payout_eligible" boolean,
  "reason_codes" text[] not null default '{}'::text[], "input_versions" jsonb not null default '{}'::jsonb,
  "authority_source" text not null, "last_operation_key" text not null, "version" bigint not null default 1,
  "evaluated_at" timestamptz not null default timezone('utc'::text, now()),
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "wave1_creator_state_check" check ("state" in ('INELIGIBLE', 'PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED', 'REVOKED')),
  constraint "wave1_creator_account_check" check ("account_status" in ('ACTIVE', 'RESTRICTED', 'DELETED', 'UNKNOWN')),
  constraint "wave1_creator_moderation_check" check ("moderation_state" in ('CLEAR', 'PENDING', 'SUSPENDED', 'REVOKED')),
  constraint "wave1_creator_market_check" check ("market" in ('UNITED_STATES', 'EXCLUDED_TERRITORY', 'OTHER', 'UNKNOWN')),
  constraint "wave1_creator_input_versions_safe" check ("input_versions"::text !~* '(secret|token|password|private_key|raw_payload|tax_id|document)')
);

create index if not exists "wave1_push_owner_user_fkey_idx" on public."wave1_push_installation_ownership" ("user_id");
create index if not exists "wave1_push_owner_account_fkey_idx" on public."wave1_push_installation_ownership" ("account_id");

alter table public."user_push_tokens"
  add column if not exists "session_generation" text,
  add column if not exists "ownership_state" text not null default 'INVALID',
  add column if not exists "ownership_operation_key" text;

update public."user_push_tokens"
set "enabled" = false,
    "ownership_state" = 'INVALID',
    "revoked_at" = coalesce("revoked_at", timezone('utc'::text, now())),
    "updated_at" = timezone('utc'::text, now())
where "enabled" or "ownership_state" <> 'INVALID';

alter table public."user_push_tokens" drop constraint if exists "user_push_tokens_wave1_ownership_check";
alter table public."user_push_tokens" add constraint "user_push_tokens_wave1_ownership_check" check (
  "ownership_state" in ('UNBOUND', 'ACCOUNT_BOUND', 'REVOCATION_PENDING', 'REVOKED', 'INVALID')
  and (not "enabled" or ("ownership_state" = 'ACCOUNT_BOUND' and "session_generation" is not null and "install_id" is not null))
);

insert into public."wave1_legal_document_versions" ("document_key", "version", "market", "capability", "effective_at") values
  ('terms', '1.0', 'UNITED_STATES', 'account', '2026-05-21T00:00:00Z'),
  ('privacy', '1.0', 'UNITED_STATES', 'account', '2026-05-21T00:00:00Z'),
  ('community_guidelines', '1.0', 'UNITED_STATES', 'account', '2026-05-21T00:00:00Z'),
  ('creator_terms', '1.0', 'UNITED_STATES', 'creator', '2026-05-21T00:00:00Z'),
  ('money_terms', '1.0', 'UNITED_STATES', 'creator_money', '2026-05-21T00:00:00Z')
on conflict do nothing;

alter table public."wave1_authority_audit_events" enable row level security;
alter table public."wave1_authority_audit_events" force row level security;
alter table public."wave1_legal_document_versions" enable row level security;
alter table public."wave1_legal_document_versions" force row level security;
alter table public."wave1_legal_acceptances" enable row level security;
alter table public."wave1_legal_acceptances" force row level security;
alter table public."wave1_push_installation_ownership" enable row level security;
alter table public."wave1_push_installation_ownership" force row level security;
alter table public."wave1_creator_eligibility" enable row level security;
alter table public."wave1_creator_eligibility" force row level security;

revoke all on table public."wave1_authority_audit_events", public."wave1_legal_document_versions",
  public."wave1_legal_acceptances", public."wave1_push_installation_ownership", public."wave1_creator_eligibility"
  from public, anon, authenticated;
grant select, insert, update, delete on table public."wave1_authority_audit_events", public."wave1_legal_document_versions",
  public."wave1_legal_acceptances", public."wave1_push_installation_ownership", public."wave1_creator_eligibility"
  to service_role;

revoke insert, update, delete on table public."user_account_legal_acceptances" from authenticated;

create or replace function public."wave1_sha256"(p_value text)
returns text language sql immutable set search_path = ''
as $$ select encode(extensions.digest(convert_to(coalesce(p_value, ''), 'UTF8'), 'sha256'), 'hex') $$;

create or replace function public."wave1_session_authority_readback"()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_generation text := nullif(auth.jwt()->>'session_id', '');
  v_state text;
  v_scheduled boolean;
  v_session_active boolean;
begin
  if v_user is null then raise exception 'auth_required'; end if;
  if v_generation is null then raise exception 'session_generation_required'; end if;
  select exists(select 1 from auth.sessions where id::text = v_generation and user_id = v_user) into v_session_active;
  v_scheduled := public."is_account_deletion_scheduled"(v_user::text);
  v_state := case
    when not v_session_active or (public."is_account_access_restricted"(v_user::text) and not v_scheduled) then 'TERMINATED'
    else 'ACTIVE'
  end;
  return jsonb_build_object('authoritative', true, 'userId', v_user, 'accountId', v_user,
    'sessionGeneration', v_generation, 'state', v_state, 'restoreOnly', v_scheduled,
    'observedAt', timezone('utc'::text, now()));
end;
$$;

create or replace function public."wave1_legal_requirements_readback"(p_capability text default 'account')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session jsonb := public."wave1_session_authority_readback"();
  v_user uuid := (v_session->>'userId')::uuid;
  v_capability text := lower(trim(coalesce(p_capability, 'account')));
  v_role text;
  v_requirements jsonb;
begin
  if v_session->>'state' <> 'ACTIVE' or coalesce((v_session->>'restoreOnly')::boolean, false)
    or public."is_account_access_restricted"(v_user::text) then raise exception 'account_access_restricted'; end if;
  if v_capability not in ('account', 'creator', 'creator_money', 'payout') then raise exception 'legal_capability_invalid'; end if;
  select coalesce(nullif(lower(trim("channel_role")), ''), 'member') into v_role
  from public."user_profiles" where "user_id" = v_user;
  v_role := coalesce(v_role, 'member');
  select coalesce(jsonb_agg(jsonb_build_object(
    'documentKey', doc."document_key", 'version', doc."version",
    'state', case when accepted."id" is null then 'REQUIRED_UNACCEPTED' else 'CURRENT_ACCEPTED' end,
    'accepted', accepted."id" is not null, 'acceptedAt', accepted."accepted_at"
  ) order by doc."document_key"), '[]'::jsonb) into v_requirements
  from public."wave1_legal_document_versions" doc
  left join lateral (
    select acceptance."id", acceptance."accepted_at"
    from public."wave1_legal_acceptances" acceptance
    where acceptance."user_id" = v_user and acceptance."document_key" = doc."document_key"
      and acceptance."document_version" = doc."version" and acceptance."market" = doc."market"
      and acceptance."capability" = doc."capability" and acceptance."role_key" = v_role
      and acceptance."invalidated_at" is null
    order by acceptance."accepted_at" desc limit 1
  ) accepted on true
  where doc."active" and doc."market" = 'UNITED_STATES'
    and (doc."capability" = 'account'
      or (v_capability in ('creator', 'creator_money', 'payout') and doc."capability" = 'creator')
      or (v_capability in ('creator_money', 'payout') and doc."capability" = 'creator_money'));
  return v_session || jsonb_build_object('market', 'UNITED_STATES', 'roleKey', v_role,
    'capability', v_capability, 'requirements', v_requirements,
    'allAccepted', not jsonb_path_exists(v_requirements, '$[*] ? (@.accepted == false)'));
end;
$$;

create or replace function public."wave1_accept_legal_documents"(
  p_acceptances jsonb, p_market text, p_capability text default 'account'
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_session jsonb := public."wave1_session_authority_readback"();
  v_user uuid := (v_session->>'userId')::uuid;
  v_generation text := v_session->>'sessionGeneration';
  v_capability text := lower(trim(coalesce(p_capability, 'account')));
  v_role text;
  v_requirement record;
  v_expected_count integer := 0;
  v_operation_key text;
begin
  if v_session->>'state' <> 'ACTIVE' or coalesce((v_session->>'restoreOnly')::boolean, false)
    or public."is_account_access_restricted"(v_user::text) then raise exception 'account_access_restricted'; end if;
  if p_market <> 'UNITED_STATES' then raise exception 'legal_market_invalid'; end if;
  if jsonb_typeof(p_acceptances) <> 'object' then raise exception 'legal_acceptances_invalid'; end if;
  if v_capability not in ('account', 'creator', 'creator_money', 'payout') then raise exception 'legal_capability_invalid'; end if;
  select coalesce(nullif(lower(trim("channel_role")), ''), 'member') into v_role
  from public."user_profiles" where "user_id" = v_user;
  v_role := coalesce(v_role, 'member');
  for v_requirement in
    select * from public."wave1_legal_document_versions" doc
    where doc."active" and doc."market" = 'UNITED_STATES'
      and (doc."capability" = 'account'
        or (v_capability in ('creator', 'creator_money', 'payout') and doc."capability" = 'creator')
        or (v_capability in ('creator_money', 'payout') and doc."capability" = 'creator_money'))
  loop
    v_expected_count := v_expected_count + 1;
    if p_acceptances->>v_requirement."document_key" is distinct from v_requirement."version" then
      raise exception 'legal_version_mismatch:%', v_requirement."document_key";
    end if;
    insert into public."wave1_legal_acceptances" (
      "user_id", "subject_hash", "document_key", "document_version", "market", "role_key",
      "capability", "session_generation", "authority_source"
    ) values (
      v_user, public."wave1_sha256"(v_user::text), v_requirement."document_key", v_requirement."version",
      'UNITED_STATES', v_role, v_requirement."capability", v_generation, 'authenticated_rpc'
    ) on conflict do nothing;
  end loop;
  if (select count(*) from jsonb_object_keys(p_acceptances)) <> v_expected_count then
    raise exception 'legal_acceptance_set_mismatch';
  end if;
  v_operation_key := public."wave1_sha256"(v_user::text || ':' || v_generation || ':' || v_capability || ':' || p_acceptances::text);
  insert into public."wave1_authority_audit_events" (
    "domain", "subject_hash", "to_state", "reason", "authority_source", "operation_key"
  ) values ('LEGAL_ACCEPTANCE', public."wave1_sha256"(v_user::text), 'CURRENT_ACCEPTED',
    'exact_versions_accepted', 'authenticated_rpc', v_operation_key) on conflict do nothing;
  return public."wave1_legal_requirements_readback"(v_capability);
end;
$$;

create or replace function public."wave1_entitlement_authority_readback"(p_entitlement_key text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session jsonb := public."wave1_session_authority_readback"();
  v_row public."user_entitlements"%rowtype;
  v_state text := 'INACTIVE';
  v_key text := lower(trim(coalesce(p_entitlement_key, '')));
begin
  if v_session->>'state' <> 'ACTIVE' or coalesce((v_session->>'restoreOnly')::boolean, false)
    or public."is_account_access_restricted"(v_session->>'userId') then raise exception 'account_access_restricted'; end if;
  if v_key not in ('premium', 'premium_watch_party', 'premium_live', 'paid_content') then raise exception 'entitlement_key_invalid'; end if;
  select * into v_row from public."user_entitlements"
  where "user_id" = ((v_session->>'userId')::uuid)::text and "entitlement_key" = v_key limit 1;
  if found then
    v_state := case
      when v_row."metadata"->>'revenuecat_event_type' = 'REFUND' then 'REFUNDED'
      when v_row."revoked_at" is not null or v_row."status" = 'revoked' then 'REVOKED'
      when v_row."status" = 'grace_period' and (v_row."expires_at" is null or v_row."expires_at" > now()) then 'GRACE'
      when v_row."status" in ('active', 'trialing') and (v_row."expires_at" is null or v_row."expires_at" > now()) then 'ACTIVE'
      when v_row."status" = 'expired' or (v_row."expires_at" is not null and v_row."expires_at" <= now()) then 'EXPIRED'
      when v_row."status" in ('inactive', 'canceled', 'cancelled') then 'INACTIVE'
      else 'UNKNOWN'
    end;
  end if;
  return v_session || jsonb_build_object('entitlementKey', v_key, 'state', v_state,
    'grantsProtectedAccess', v_state in ('ACTIVE', 'GRACE'),
    'source', case when found then v_row."source" else 'server_absence' end,
    'expiresAt', case when found then v_row."expires_at" else null end,
    'revokedAt', case when found then v_row."revoked_at" else null end,
    'authoritativeAt', case when found then v_row."updated_at" else (v_session->>'observedAt')::timestamptz end);
end;
$$;

create or replace function public."wave1_push_ownership_readback"(p_platform text, p_provider text, p_install_id text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session jsonb := public."wave1_session_authority_readback"();
  v_token public."user_push_tokens"%rowtype;
begin
  if v_session->>'state' <> 'ACTIVE' or coalesce((v_session->>'restoreOnly')::boolean, false)
    or public."is_account_access_restricted"(v_session->>'userId') then raise exception 'account_access_restricted'; end if;
  select * into v_token from public."user_push_tokens"
  where "user_id" = (v_session->>'userId')::uuid and "platform" = p_platform and "provider" = p_provider
    and "install_id" = p_install_id and "session_generation" = v_session->>'sessionGeneration'
    and "ownership_state" = 'ACCOUNT_BOUND' and "enabled" and "revoked_at" is null
  order by "last_seen_at" desc limit 1;
  return v_session || jsonb_build_object('platform', p_platform, 'provider', p_provider,
    'registered', found, 'status', case when found then 'registered' else 'not_registered' end,
    'ownershipState', case when found then 'ACCOUNT_BOUND' else 'UNBOUND' end,
    'tokenFingerprint', case when found then v_token."token_fingerprint" else null end,
    'lastSeenAt', case when found then v_token."last_seen_at" else null end);
end;
$$;

create or replace function public."wave1_register_push_token"(
  p_expected_user_id uuid, p_expected_account_id uuid, p_session_generation text,
  p_platform text, p_provider text, p_install_id text, p_token text,
  p_revocation_credential_hash text, p_operation_key text, p_permission_status text,
  p_app_version text, p_build_version text, p_metadata jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_session jsonb := public."wave1_session_authority_readback"();
  v_owner public."wave1_push_installation_ownership"%rowtype;
  v_token_hash text;
  v_fingerprint text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_session->>'state' <> 'ACTIVE' or coalesce((v_session->>'restoreOnly')::boolean, false)
    or public."is_account_access_restricted"(v_session->>'userId')
    or (v_session->>'userId')::uuid <> p_expected_user_id
    or p_expected_account_id <> p_expected_user_id or v_session->>'sessionGeneration' <> p_session_generation
  then raise exception 'push_session_binding_mismatch'; end if;
  if p_platform not in ('android', 'ios') or p_provider not in ('expo', 'fcm')
    or (p_platform = 'ios' and p_provider <> 'expo') then raise exception 'push_provider_invalid'; end if;
  if nullif(trim(p_install_id), '') is null or length(p_install_id) > 256
    or nullif(trim(p_token), '') is null or length(p_token) > 2048
    or p_revocation_credential_hash !~ '^[0-9a-f]{64}$'
    or nullif(trim(p_operation_key), '') is null or length(p_operation_key) > 160
    or p_permission_status not in ('granted', 'provisional', 'ephemeral')
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
    or length(coalesce(p_app_version, '')) > 64 or length(coalesce(p_build_version, '')) > 64
  then raise exception 'push_registration_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wave1-push:' || p_platform || ':' || p_install_id, 0));
  v_token_hash := public."wave1_sha256"(p_provider || ':' || p_token);
  v_fingerprint := left(v_token_hash, 12);
  select * into v_owner from public."wave1_push_installation_ownership"
  where "platform" = p_platform and "install_id" = p_install_id for update;
  if found and v_owner."user_id" = p_expected_user_id and v_owner."account_id" = p_expected_account_id
    and v_owner."session_generation" = p_session_generation and v_owner."ownership_state" = 'ACCOUNT_BOUND'
    and v_owner."revocation_credential_hash" = p_revocation_credential_hash
    and exists (select 1 from public."user_push_tokens" where "provider" = p_provider and "token_hash" = v_token_hash
      and "platform" = p_platform and "install_id" = p_install_id and "user_id" = p_expected_user_id
      and "session_generation" = p_session_generation and "enabled")
  then return jsonb_build_object('status', 'registered', 'ownershipState', 'ACCOUNT_BOUND',
    'tokenFingerprint', v_fingerprint, 'sessionGeneration', p_session_generation, 'idempotent', true); end if;
  update public."user_push_tokens" set "enabled" = false, "ownership_state" = 'REVOKED',
    "revoked_at" = coalesce("revoked_at", v_now), "updated_at" = v_now
  where "platform" = p_platform and "install_id" = p_install_id
    and ("user_id" <> p_expected_user_id or "session_generation" is distinct from p_session_generation
      or ("provider" = p_provider and "token_hash" <> v_token_hash));
  insert into public."wave1_push_installation_ownership" (
    "platform", "install_id", "user_id", "account_id", "session_generation", "ownership_state",
    "revocation_credential_hash", "last_operation_key", "last_reason", "last_transition_at", "revoked_at"
  ) values (p_platform, p_install_id, p_expected_user_id, p_expected_account_id, p_session_generation,
    'ACCOUNT_BOUND', p_revocation_credential_hash, p_operation_key, 'authenticated_registration', v_now, null)
  on conflict ("platform", "install_id") do update set
    "user_id" = excluded."user_id", "account_id" = excluded."account_id",
    "session_generation" = excluded."session_generation", "ownership_state" = 'ACCOUNT_BOUND',
    "revocation_credential_hash" = excluded."revocation_credential_hash",
    "ownership_version" = public."wave1_push_installation_ownership"."ownership_version" + 1,
    "last_operation_key" = excluded."last_operation_key", "last_reason" = excluded."last_reason",
    "last_transition_at" = v_now, "revoked_at" = null;
  insert into public."user_push_tokens" (
    "user_id", "platform", "provider", "token", "token_hash", "token_fingerprint", "install_id",
    "app_version", "build_version", "enabled", "last_seen_at", "revoked_at", "metadata", "updated_at",
    "session_generation", "ownership_state", "ownership_operation_key"
  ) values (p_expected_user_id, p_platform, p_provider, p_token, v_token_hash, v_fingerprint, p_install_id,
    nullif(trim(coalesce(p_app_version, '')), ''), nullif(trim(coalesce(p_build_version, '')), ''), true,
    v_now, null, jsonb_strip_nulls(jsonb_build_object('permissionStatus', p_permission_status,
      'nativeCallStyle', case when jsonb_typeof(p_metadata->'nativeCallStyle') = 'boolean' then p_metadata->'nativeCallStyle' end)),
    v_now, p_session_generation, 'ACCOUNT_BOUND', p_operation_key)
  on conflict ("provider", "token_hash") do update set
    "user_id" = excluded."user_id", "platform" = excluded."platform", "install_id" = excluded."install_id",
    "app_version" = excluded."app_version", "build_version" = excluded."build_version", "enabled" = true,
    "last_seen_at" = v_now, "revoked_at" = null, "metadata" = excluded."metadata", "updated_at" = v_now,
    "session_generation" = excluded."session_generation", "ownership_state" = 'ACCOUNT_BOUND',
    "ownership_operation_key" = excluded."ownership_operation_key";
  insert into public."wave1_authority_audit_events" (
    "domain", "subject_hash", "object_hash", "from_state", "to_state", "reason", "authority_source", "operation_key"
  ) values ('PUSH_INSTALLATION_OWNERSHIP', public."wave1_sha256"(p_expected_user_id::text),
    public."wave1_sha256"(p_platform || ':' || p_install_id), 'UNBOUND', 'ACCOUNT_BOUND',
    'authenticated_registration', 'notification-device-tokens', p_operation_key) on conflict do nothing;
  return jsonb_build_object('status', 'registered', 'ownershipState', 'ACCOUNT_BOUND',
    'tokenFingerprint', v_fingerprint, 'sessionGeneration', p_session_generation);
end;
$$;

create or replace function public."wave1_revoke_push_ownership"(
  p_expected_user_id uuid, p_expected_account_id uuid, p_session_generation text,
  p_platform text, p_install_id text, p_revocation_credential_hash text,
  p_operation_key text, p_reason text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_owner public."wave1_push_installation_ownership"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_platform not in ('android', 'ios') or nullif(trim(p_install_id), '') is null
    or p_revocation_credential_hash !~ '^[0-9a-f]{64}$'
    or nullif(trim(p_operation_key), '') is null
    or p_reason not in ('sign_out', 'account_switch', 'auth_invalidation', 'account_deletion', 'recovery_replacement', 'auth_loss', 'user_request')
  then raise exception 'push_revocation_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wave1-push:' || p_platform || ':' || p_install_id, 0));
  select * into v_owner from public."wave1_push_installation_ownership"
  where "platform" = p_platform and "install_id" = p_install_id for update;
  if not found then return jsonb_build_object('status', 'revoked'); end if;
  if v_owner."revocation_credential_hash" <> p_revocation_credential_hash then
    return jsonb_build_object('status', 'revoked');
  end if;
  if v_owner."user_id" <> p_expected_user_id or v_owner."account_id" <> p_expected_account_id
    or v_owner."session_generation" <> p_session_generation
  then return jsonb_build_object('status', 'revoked'); end if;
  if v_owner."ownership_state" in ('REVOKED', 'INVALID', 'UNBOUND') then
    return jsonb_build_object('status', 'revoked');
  end if;
  update public."wave1_push_installation_ownership" set "ownership_state" = 'REVOCATION_PENDING',
    "revocation_attempts" = "revocation_attempts" + 1, "last_operation_key" = p_operation_key,
    "last_reason" = p_reason, "last_transition_at" = v_now where "platform" = p_platform and "install_id" = p_install_id;
  update public."user_push_tokens" set "enabled" = false, "ownership_state" = 'REVOKED',
    "revoked_at" = coalesce("revoked_at", v_now), "updated_at" = v_now, "ownership_operation_key" = p_operation_key
  where "platform" = p_platform and "install_id" = p_install_id and "user_id" = p_expected_user_id
    and "session_generation" = p_session_generation;
  update public."wave1_push_installation_ownership" set "ownership_state" = 'REVOKED', "revoked_at" = v_now,
    "last_transition_at" = v_now where "platform" = p_platform and "install_id" = p_install_id;
  insert into public."wave1_authority_audit_events" (
    "domain", "subject_hash", "object_hash", "from_state", "to_state", "reason", "authority_source", "operation_key"
  ) values ('PUSH_INSTALLATION_OWNERSHIP', public."wave1_sha256"(p_expected_user_id::text),
    public."wave1_sha256"(p_platform || ':' || p_install_id), v_owner."ownership_state", 'REVOKED',
    p_reason, 'notification-device-tokens', p_operation_key) on conflict do nothing;
  return jsonb_build_object('status', 'revoked');
end;
$$;

create or replace function public."wave1_compute_creator_eligibility"(p_inputs jsonb, p_previous_state text default 'INELIGIBLE')
returns jsonb language plpgsql immutable set search_path = ''
as $$
declare
  v_state text;
  v_reasons text[] := '{}'::text[];
begin
  if p_inputs::text ~* '(secret|token|password|private_key|raw_payload|tax_id|document)' then raise exception 'creator_inputs_unsafe'; end if;
  if p_previous_state = 'REVOKED' or p_inputs->>'accountStatus' = 'DELETED' or p_inputs->>'moderationState' = 'REVOKED' then
    v_state := 'REVOKED'; v_reasons := array['authority_revoked'];
  elsif p_inputs->>'accountStatus' = 'RESTRICTED' or p_inputs->>'moderationState' = 'SUSPENDED' then
    v_state := 'SUSPENDED'; v_reasons := array['authority_suspended'];
  elsif coalesce((p_inputs->>'age18Plus')::boolean, true) is false
    or coalesce((p_inputs->>'legalAccepted')::boolean, true) is false
    or coalesce((p_inputs->>'creatorRole')::boolean, true) is false
    or coalesce((p_inputs->>'platformCapability')::boolean, true) is false
    or coalesce((p_inputs->>'providerEligible')::boolean, true) is false
    or coalesce((p_inputs->>'kycComplete')::boolean, true) is false
    or coalesce((p_inputs->>'taxComplete')::boolean, true) is false
    or coalesce((p_inputs->>'sanctionsClear')::boolean, true) is false
    or coalesce((p_inputs->>'payoutEligible')::boolean, true) is false
    or coalesce((p_inputs->>'rolloutEligible')::boolean, true) is false
    or p_inputs->>'market' in ('EXCLUDED_TERRITORY', 'OTHER')
  then v_state := 'INELIGIBLE'; v_reasons := array['definitive_input_failure'];
  elsif p_inputs->>'accountStatus' is distinct from 'ACTIVE'
    or p_inputs->>'moderationState' is distinct from 'CLEAR'
    or p_inputs->>'market' is distinct from 'UNITED_STATES'
    or not (p_inputs ?& array['age18Plus','legalAccepted','creatorRole','rolloutEligible','platformCapability',
      'providerEligible','kycComplete','taxComplete','sanctionsClear','payoutEligible'])
    or (p_inputs->>'age18Plus')::boolean is not true or (p_inputs->>'legalAccepted')::boolean is not true
    or (p_inputs->>'creatorRole')::boolean is not true or (p_inputs->>'rolloutEligible')::boolean is not true
    or (p_inputs->>'platformCapability')::boolean is not true or (p_inputs->>'providerEligible')::boolean is not true
    or (p_inputs->>'kycComplete')::boolean is not true or (p_inputs->>'taxComplete')::boolean is not true
    or (p_inputs->>'sanctionsClear')::boolean is not true or (p_inputs->>'payoutEligible')::boolean is not true
  then v_state := 'PENDING_VERIFICATION'; v_reasons := array['evidence_pending'];
  else v_state := 'VERIFIED'; v_reasons := array['all_authoritative_inputs_verified'];
  end if;
  if p_previous_state = 'SUSPENDED' and v_state = 'VERIFIED' then
    v_state := 'PENDING_VERIFICATION'; v_reasons := array['suspension_lift_requires_reevaluation'];
  end if;
  return jsonb_build_object('state', v_state, 'reasonCodes', to_jsonb(v_reasons),
    'canCreateMoneyExposure', v_state = 'VERIFIED', 'canProcessHistoricalObligations', true);
end;
$$;

create or replace function public."wave1_revoke_push_on_session_delete"()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  with targets as (
    select "platform", "install_id", "ownership_state" from public."wave1_push_installation_ownership"
    where "user_id" = old."user_id" and "session_generation" = old."id"::text
      and "ownership_state" in ('ACCOUNT_BOUND', 'REVOCATION_PENDING') for update
  ), revoked as (
    update public."wave1_push_installation_ownership" owner set "ownership_state" = 'REVOKED',
      "revocation_attempts" = owner."revocation_attempts" + 1, "last_reason" = 'auth_invalidation',
      "last_operation_key" = 'auth-session-delete:' || old."id"::text, "last_transition_at" = now(), "revoked_at" = coalesce(owner."revoked_at", now())
    from targets where owner."platform" = targets."platform" and owner."install_id" = targets."install_id"
    returning owner."platform", owner."install_id", targets."ownership_state"
  ) insert into public."wave1_authority_audit_events" ("domain","subject_hash","object_hash","from_state","to_state","reason","authority_source","operation_key")
    select 'PUSH_INSTALLATION_OWNERSHIP', public."wave1_sha256"(old."user_id"::text), public."wave1_sha256"("platform"||':'||"install_id"),
      "ownership_state", 'REVOKED', 'auth_invalidation', 'auth.sessions_delete', 'auth-session-delete:'||old."id"::text||':'||"platform"||':'||"install_id" from revoked on conflict do nothing;
  update public."user_push_tokens" set "enabled" = false, "ownership_state" = 'REVOKED', "revoked_at" = coalesce("revoked_at", now()), "updated_at" = now()
  where "user_id" = old."user_id" and "session_generation" = old."id"::text;
  return old;
end;
$$;
revoke all on function public."wave1_revoke_push_on_session_delete"() from public, anon, authenticated, service_role;
drop trigger if exists "wave1_revoke_push_on_session_delete" on auth.sessions;
create trigger "wave1_revoke_push_on_session_delete" after delete on auth.sessions
  for each row execute function public."wave1_revoke_push_on_session_delete"();

create or replace function public."wave1_evaluate_creator_eligibility"(
  p_creator_user_id uuid, p_inputs jsonb, p_operation_key text, p_authority_source text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_previous public."wave1_creator_eligibility"%rowtype;
  v_result jsonb;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_creator_user_id is null or jsonb_typeof(p_inputs) <> 'object'
    or nullif(trim(p_operation_key), '') is null
    or p_authority_source not in ('money_flow_control', 'moderation_safety_operator', 'security_owner_operator', 'local_pgtap')
  then raise exception 'creator_evaluation_invalid'; end if;
  p_inputs := p_inputs || jsonb_build_object('rolloutEligible',
    mod(hashtextextended('chillywood-wave1-us-rollout-v1:' || p_creator_user_id::text, 20260814), 100) = 0);
  select * into v_previous from public."wave1_creator_eligibility" where "creator_user_id" = p_creator_user_id for update;
  if found and v_previous."last_operation_key" = p_operation_key then
    return jsonb_build_object('state', v_previous."state", 'reasonCodes', to_jsonb(v_previous."reason_codes"),
      'canCreateMoneyExposure', v_previous."state" = 'VERIFIED', 'canProcessHistoricalObligations', true,
      'idempotent', true, 'version', v_previous."version");
  end if;
  v_result := public."wave1_compute_creator_eligibility"(p_inputs, coalesce(v_previous."state", 'INELIGIBLE'));
  insert into public."wave1_creator_eligibility" (
    "creator_user_id", "state", "account_status", "age_18_plus", "legal_accepted", "creator_role",
    "moderation_state", "market", "rollout_eligible", "platform_capability", "provider_eligible",
    "kyc_complete", "tax_complete", "sanctions_clear", "payout_eligible", "reason_codes",
    "input_versions", "authority_source", "last_operation_key", "evaluated_at"
  ) values (p_creator_user_id, v_result->>'state', coalesce(p_inputs->>'accountStatus', 'UNKNOWN'), (p_inputs->>'age18Plus')::boolean,
    (p_inputs->>'legalAccepted')::boolean, (p_inputs->>'creatorRole')::boolean, coalesce(p_inputs->>'moderationState', 'PENDING'),
    coalesce(p_inputs->>'market', 'UNKNOWN'), (p_inputs->>'rolloutEligible')::boolean, (p_inputs->>'platformCapability')::boolean,
    (p_inputs->>'providerEligible')::boolean, (p_inputs->>'kycComplete')::boolean,
    (p_inputs->>'taxComplete')::boolean, (p_inputs->>'sanctionsClear')::boolean,
    (p_inputs->>'payoutEligible')::boolean, array(select jsonb_array_elements_text(v_result->'reasonCodes')),
    coalesce(p_inputs->'inputVersions', '{}'::jsonb), p_authority_source, p_operation_key, v_now)
  on conflict ("creator_user_id") do update set "state" = excluded."state", "account_status" = excluded."account_status",
    "age_18_plus" = excluded."age_18_plus", "legal_accepted" = excluded."legal_accepted",
    "creator_role" = excluded."creator_role", "moderation_state" = excluded."moderation_state", "market" = excluded."market",
    "rollout_eligible" = excluded."rollout_eligible", "platform_capability" = excluded."platform_capability",
    "provider_eligible" = excluded."provider_eligible", "kyc_complete" = excluded."kyc_complete",
    "tax_complete" = excluded."tax_complete", "sanctions_clear" = excluded."sanctions_clear",
    "payout_eligible" = excluded."payout_eligible", "reason_codes" = excluded."reason_codes",
    "input_versions" = excluded."input_versions", "authority_source" = excluded."authority_source",
    "last_operation_key" = excluded."last_operation_key", "version" = public."wave1_creator_eligibility"."version" + 1,
    "evaluated_at" = v_now;
  insert into public."wave1_authority_audit_events" (
    "domain", "subject_hash", "from_state", "to_state", "reason", "authority_source", "operation_key"
  ) values ('CREATOR_ELIGIBILITY', public."wave1_sha256"(p_creator_user_id::text),
    coalesce(v_previous."state", 'INELIGIBLE'), v_result->>'state', v_result->'reasonCodes'->>0,
    p_authority_source, p_operation_key) on conflict do nothing;
  return v_result || jsonb_build_object('idempotent', false,
    'version', coalesce(v_previous."version", 0) + 1, 'evaluatedAt', v_now);
end;
$$;

create or replace function public."wave1_creator_eligibility_readback"()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session jsonb := public."wave1_session_authority_readback"();
  v_row public."wave1_creator_eligibility"%rowtype;
begin
  select * into v_row from public."wave1_creator_eligibility"
  where "creator_user_id" = (v_session->>'userId')::uuid;
  if v_session->>'state' <> 'ACTIVE' or coalesce((v_session->>'restoreOnly')::boolean, false)
    or public."is_account_access_restricted"(v_session->>'userId') then
    return v_session || jsonb_build_object('state', 'SUSPENDED', 'reasonCodes', jsonb_build_array('account_restricted'),
      'canCreateMoneyExposure', false, 'canProcessHistoricalObligations', true);
  end if;
  if not found then
    return v_session || jsonb_build_object('state', 'PENDING_VERIFICATION', 'reasonCodes', jsonb_build_array('evidence_pending'),
      'canCreateMoneyExposure', false, 'canProcessHistoricalObligations', true,
      'market', 'UNKNOWN', 'minimumAge', 18, 'rollout', 'CONTROLLED_1_PERCENT_UNITED_STATES');
  end if;
  return v_session || jsonb_build_object(
    'state', v_row."state", 'accountStatus', v_row."account_status", 'age18Plus', v_row."age_18_plus",
    'legalAccepted', v_row."legal_accepted", 'creatorRole', v_row."creator_role",
    'moderationState', v_row."moderation_state", 'market', v_row."market",
    'rolloutEligible', v_row."rollout_eligible", 'platformCapability', v_row."platform_capability",
    'providerEligible', v_row."provider_eligible", 'kycComplete', v_row."kyc_complete",
    'taxComplete', v_row."tax_complete", 'sanctionsClear', v_row."sanctions_clear",
    'payoutEligible', v_row."payout_eligible", 'reasonCodes', to_jsonb(v_row."reason_codes"),
    'authoritySource', v_row."authority_source", 'version', v_row."version", 'evaluatedAt', v_row."evaluated_at",
    'canCreateMoneyExposure', v_row."state" = 'VERIFIED', 'canProcessHistoricalObligations', true,
    'minimumAge', 18, 'rollout', 'CONTROLLED_1_PERCENT_UNITED_STATES');
end;
$$;

create or replace function public."wave1_enforce_creator_money_exposure"()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (tg_op = 'UPDATE' and tg_table_name = 'creator_monetization_configs' and new."status" in ('disabled', 'revoked'))
    or (tg_table_name = 'money_purchase_intents' and new."creator_id" is null) then return new; end if;
  if new."creator_id" is null or not exists (
    select 1 from public."wave1_creator_eligibility" where "creator_user_id" = new."creator_id"
      and "state" = 'VERIFIED' and "account_status" = 'ACTIVE' and "age_18_plus" and "legal_accepted"
      and "creator_role" and "moderation_state" = 'CLEAR' and "market" = 'UNITED_STATES'
      and "rollout_eligible" and "platform_capability" and "provider_eligible" and "kyc_complete"
      and "tax_complete" and "sanctions_clear" and "payout_eligible"
  ) then raise exception 'creator_eligibility_required' using errcode = '42501'; end if;
  return new;
end;
$$;
revoke all on function public."wave1_enforce_creator_money_exposure"() from public, anon, authenticated, service_role;
drop trigger if exists "wave1_creator_config_eligibility" on public."creator_monetization_configs";
create trigger "wave1_creator_config_eligibility" before insert or update on public."creator_monetization_configs"
  for each row execute function public."wave1_enforce_creator_money_exposure"();
drop trigger if exists "wave1_purchase_intent_creator_eligibility" on public."money_purchase_intents";
create trigger "wave1_purchase_intent_creator_eligibility" before insert on public."money_purchase_intents"
  for each row execute function public."wave1_enforce_creator_money_exposure"();

create or replace function public."wave1_purge_expired_authority_evidence"()
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_count integer := 0; v_step integer;
begin
  delete from public."wave1_legal_acceptances" where "retention_expires_at" <= timezone('utc'::text, now());
  get diagnostics v_count = row_count;
  delete from public."wave1_authority_audit_events" where "retention_expires_at" <= timezone('utc'::text, now());
  get diagnostics v_step = row_count;
  return v_count + v_step;
end;
$$;

revoke all on function public."wave1_sha256"(text), public."wave1_session_authority_readback"(),
  public."wave1_legal_requirements_readback"(text), public."wave1_accept_legal_documents"(jsonb, text, text),
  public."wave1_entitlement_authority_readback"(text), public."wave1_push_ownership_readback"(text, text, text),
  public."wave1_register_push_token"(uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb),
  public."wave1_revoke_push_ownership"(uuid, uuid, text, text, text, text, text, text),
  public."wave1_compute_creator_eligibility"(jsonb, text),
  public."wave1_evaluate_creator_eligibility"(uuid, jsonb, text, text),
  public."wave1_creator_eligibility_readback"(),
  public."wave1_purge_expired_authority_evidence"() from public, anon, authenticated;

grant execute on function public."wave1_session_authority_readback"(),
  public."wave1_legal_requirements_readback"(text), public."wave1_accept_legal_documents"(jsonb, text, text),
  public."wave1_entitlement_authority_readback"(text), public."wave1_push_ownership_readback"(text, text, text),
  public."wave1_register_push_token"(uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb),
  public."wave1_creator_eligibility_readback"() to authenticated;
grant execute on function public."wave1_sha256"(text),
  public."wave1_revoke_push_ownership"(uuid, uuid, text, text, text, text, text, text),
  public."wave1_compute_creator_eligibility"(jsonb, text),
  public."wave1_evaluate_creator_eligibility"(uuid, jsonb, text, text),
  public."wave1_purge_expired_authority_evidence"() to service_role;

comment on table public."wave1_legal_acceptances" is
  'Server-timestamped exact-version acceptance. Account deletion removes direct identity while retaining bounded pseudonymous audit.';
comment on table public."wave1_push_installation_ownership" is
  'One installation owner and exact JWT session generation; revocation is credential-bound, stale-safe, and idempotent.';
comment on table public."wave1_creator_eligibility" is
  'Five-state server authority. VERIFIED requires independent 18+, legal, role, moderation, US market, 1% rollout, platform, provider, KYC, tax, sanctions, and payout inputs.';
