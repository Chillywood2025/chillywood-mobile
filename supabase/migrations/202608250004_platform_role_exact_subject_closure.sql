-- Whole-app immutable-subject closure for staff, beta, and sandbox authority.
-- Email remains audit/invitation data only. Every active authority row binds a
-- single confirmed auth.users.id and every caller-authority read requires the
-- exact live Supabase Auth session generation.

alter table public."platform_role_memberships"
  add column if not exists "expires_at" timestamptz;

create index if not exists "platform_role_memberships_role_status_expires_idx"
  on public."platform_role_memberships" ("role", "status", "expires_at");

-- Quarantine legacy authority that cannot identify one confirmed immutable
-- subject. Rows remain available for audit and are never silently rebound by
-- an email that may since have been reassigned.
update public."platform_role_memberships" membership
set "status" = 'revoked',
    "revoked_at" = coalesce(membership."revoked_at", timezone('utc'::text, now())),
    "revoked_by" = coalesce(membership."revoked_by", 'platform-exact-subject-closure'),
    "updated_at" = timezone('utc'::text, now())
where membership."status" = 'active'
  and (
    nullif(trim(coalesce(membership."user_id", '')), '') is null
    or not exists (
      select 1
      from auth.users subject
      where subject.id::text = trim(membership."user_id")
        and subject.email_confirmed_at is not null
        and subject.deleted_at is null
    )
    or (
      membership."expires_at" is not null
      and membership."expires_at" <= timezone('utc'::text, now())
    )
  );

update public."platform_staff_permission_grants" grant_row
set "status" = case
      when grant_row."expires_at" is not null
       and grant_row."expires_at" <= timezone('utc'::text, now()) then 'expired'
      else 'revoked'
    end,
    "revoked_at" = coalesce(grant_row."revoked_at", timezone('utc'::text, now())),
    "revoked_by" = coalesce(grant_row."revoked_by", 'platform-exact-subject-closure'),
    "updated_at" = timezone('utc'::text, now())
where grant_row."status" = 'active'
  and (
    nullif(trim(coalesce(grant_row."target_user_id", '')), '') is null
    or not exists (
      select 1
      from auth.users subject
      where subject.id::text = trim(grant_row."target_user_id")
        and subject.email_confirmed_at is not null
        and subject.deleted_at is null
    )
    or not exists (
      select 1
      from public."platform_role_memberships" membership
      where membership."user_id" = trim(grant_row."target_user_id")
        and membership."status" = 'active'
        and membership."role" in ('owner', 'operator', 'moderator')
        and (membership."expires_at" is null
          or membership."expires_at" > timezone('utc'::text, now()))
    )
    or (grant_row."expires_at" is not null
      and grant_row."expires_at" <= timezone('utc'::text, now()))
  );

update public."beta_access_memberships" membership
set "access_status" = 'revoked',
    "last_seen_at" = timezone('utc'::text, now())
where membership."access_status" = 'active'
  and (
    nullif(trim(coalesce(membership."user_id", '')), '') is null
    or not exists (
      select 1
      from auth.users subject
      where subject.id::text = trim(membership."user_id")
        and subject.email_confirmed_at is not null
        and subject.deleted_at is null
    )
  );

update public."sandbox_monetization_testers" tester
set "status" = 'revoked',
    "revoked_at" = coalesce(tester."revoked_at", timezone('utc'::text, now())),
    "updated_at" = timezone('utc'::text, now())
where tester."status" = 'active'
  and (
    nullif(trim(coalesce(tester."user_id", '')), '') is null
    or not exists (
      select 1
      from auth.users subject
      where subject.id::text = trim(tester."user_id")
        and subject.email_confirmed_at is not null
        and subject.deleted_at is null
    )
    or (tester."expires_at" is not null
      and tester."expires_at" <= timezone('utc'::text, now()))
  );

create or replace function public."platform_exact_current_session_authority_internal"()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_generation text := nullif(trim(coalesce(auth.jwt() ->> 'session_id', '')), '');
  v_readback jsonb;
begin
  if v_user_id is null or v_session_generation is null then
    return false;
  end if;

  if not exists (
    select 1
    from auth.users subject
    where subject.id = v_user_id
      and subject.email_confirmed_at is not null
      and subject.deleted_at is null
  ) then
    return false;
  end if;

  -- Supabase retains time-box-expired session rows for a cleanup window.
  -- Existence therefore is not sufficient for sensitive staff authority: the
  -- exact bearer generation must still be within its canonical row-level
  -- not_after bound. A missing, malformed, deleted, cross-user, or explicitly
  -- time-box-expired generation fails closed before Wave 1 readback. Remote
  -- inactivity configuration is evaluated by GoTrue during refresh and is not
  -- inferred here because this repository declares no canonical timeout.
  if not exists (
    select 1
    from auth.sessions session_row
    where session_row.id::text = v_session_generation
      and session_row.user_id = v_user_id
      and (
        session_row.not_after is null
        or session_row.not_after > now()
      )
  ) then
    return false;
  end if;

  begin
    v_readback := public."wave1_session_authority_readback"();
  exception when others then
    return false;
  end;

  return coalesce((v_readback ->> 'authoritative')::boolean, false)
    and v_readback ->> 'state' = 'ACTIVE'
    and coalesce((v_readback ->> 'restoreOnly')::boolean, true) is false
    and nullif(v_readback ->> 'userId', '') is not distinct from v_user_id::text
    and nullif(v_readback ->> 'sessionGeneration', '') is not distinct from v_session_generation;
exception when others then
  return false;
end;
$$;

create or replace function public."platform_resolve_exact_confirmed_subject_by_email_internal"(
  p_email text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_subject_ids uuid[];
begin
  if v_email is null then
    raise exception 'platform_exact_confirmed_subject_required';
  end if;

  select array_agg(subject.id order by subject.id)
  into v_subject_ids
  from auth.users subject
  where lower(trim(subject.email)) = v_email
    and subject.email_confirmed_at is not null
    and subject.deleted_at is null;

  if coalesce(cardinality(v_subject_ids), 0) <> 1 then
    raise exception 'platform_exact_confirmed_subject_required';
  end if;

  return v_subject_ids[1];
end;
$$;

-- RLS cannot execute a fully revoked helper directly. Expose only this narrow
-- subject predicate: callers can prove that their own current live session is
-- exact, but cannot nominate another identity or read any authority row.
create or replace function public."platform_exact_current_session_subject"(
  p_user_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."platform_exact_current_session_authority_internal"()
    and nullif(trim(coalesce(p_user_id, '')), '') = auth.uid()::text;
$$;

create or replace function public."platform_subject_has_role_internal"(
  p_user_id text,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(trim(coalesce(p_user_id, '')), '') is not null
    and coalesce(cardinality(p_roles), 0) > 0
    and exists (
      select 1
      from auth.users subject
      where subject.id::text = trim(p_user_id)
        and subject.email_confirmed_at is not null
        and subject.deleted_at is null
    )
    and not public."is_account_access_restricted"(trim(p_user_id))
    and exists (
      select 1
      from public."platform_role_memberships" membership
      where membership."user_id" = trim(p_user_id)
        and membership."status" = 'active'
        and membership."role" = any(p_roles)
        and (membership."expires_at" is null
          or membership."expires_at" > timezone('utc'::text, now()))
    );
$$;

create or replace function public."enforce_platform_role_exact_subject_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new."user_id" := nullif(trim(coalesce(new."user_id", '')), '');
  new."email" := nullif(lower(trim(coalesce(new."email", ''))), '');

  if tg_op = 'UPDATE'
    and nullif(trim(coalesce(old."user_id", '')), '') is not null
    and new."user_id" is distinct from nullif(trim(coalesce(old."user_id", '')), '')
  then
    raise exception 'platform_role_immutable_subject_required';
  end if;

  if new."status" = 'active' and (
    new."user_id" is null
    or not exists (
      select 1
      from auth.users subject
      where subject.id::text = new."user_id"
        and subject.email_confirmed_at is not null
        and subject.deleted_at is null
    )
    or public."is_account_access_restricted"(coalesce(new."user_id", ''))
    or (new."expires_at" is not null
      and new."expires_at" <= timezone('utc'::text, now()))
  ) then
    raise exception 'platform_role_exact_confirmed_subject_required';
  end if;

  return new;
end;
$$;

drop trigger if exists "enforce_platform_role_exact_subject"
  on public."platform_role_memberships";
create trigger "enforce_platform_role_exact_subject"
before insert or update of "email", "user_id", "role", "status", "expires_at"
on public."platform_role_memberships"
for each row execute function public."enforce_platform_role_exact_subject_internal"();

create or replace function public."enforce_platform_staff_permission_exact_subject_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new."target_user_id" := nullif(trim(coalesce(new."target_user_id", '')), '');
  new."target_email" := nullif(lower(trim(coalesce(new."target_email", ''))), '');

  if tg_op = 'UPDATE'
    and nullif(trim(coalesce(old."target_user_id", '')), '') is not null
    and new."target_user_id" is distinct from nullif(trim(coalesce(old."target_user_id", '')), '')
  then
    raise exception 'platform_staff_permission_immutable_subject_required';
  end if;

  if new."status" = 'active' and (
    new."target_user_id" is null
    or not public."platform_subject_has_role_internal"(
      new."target_user_id",
      array['owner'::text, 'operator'::text, 'moderator'::text]
    )
    or (new."expires_at" is not null
      and new."expires_at" <= timezone('utc'::text, now()))
  ) then
    raise exception 'platform_staff_permission_exact_confirmed_subject_required';
  end if;

  return new;
end;
$$;

drop trigger if exists "enforce_platform_staff_permission_exact_subject"
  on public."platform_staff_permission_grants";
create trigger "enforce_platform_staff_permission_exact_subject"
before insert or update of "target_email", "target_user_id", "permission_key", "status", "expires_at"
on public."platform_staff_permission_grants"
for each row execute function public."enforce_platform_staff_permission_exact_subject_internal"();

create or replace function public."has_platform_role"(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."platform_exact_current_session_authority_internal"()
    and public."platform_subject_has_role_internal"(auth.uid()::text, required_roles);
$$;

create or replace function public."is_platform_owner_user"(target_user_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."platform_subject_has_role_internal"(
    nullif(trim(coalesce(target_user_id, '')), ''),
    array['owner'::text]
  );
$$;

-- The cognitive governance owner gate predates live-session generation
-- authority.  Keep its public signatures stable, but make every downstream
-- Owner SECURITY DEFINER RPC consume the same exact confirmed, unrestricted,
-- active/unexpired subject and current auth.session as the platform controls.
create or replace function public."governance_exact_owner"(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and public."platform_subject_has_role_internal"(
      p_user_id::text,
      array['owner'::text]
    );
$$;

create or replace function public."governance_assert_exact_owner"()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
begin
  if v_actor_user_id is null
    or not public."platform_exact_current_session_authority_internal"()
    or not public."governance_exact_owner"(v_actor_user_id)
  then
    raise exception 'governance_owner_identity_required' using errcode = '42501';
  end if;

  return v_actor_user_id;
exception
  when sqlstate '42501' then
    raise;
  when others then
    raise exception 'governance_owner_identity_required' using errcode = '42501';
end;
$$;

revoke all on function public."governance_exact_owner"(uuid)
  from public, anon;
grant execute on function public."governance_exact_owner"(uuid)
  to authenticated, service_role;
revoke all on function public."governance_assert_exact_owner"()
  from public, anon, service_role;
grant execute on function public."governance_assert_exact_owner"()
  to authenticated;

create or replace function public."platform_staff_target_has_role"(
  p_target_email text,
  p_allowed_roles text[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target_user_id uuid;
begin
  begin
    v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(p_target_email);
  exception when others then
    return false;
  end;

  return public."platform_subject_has_role_internal"(v_target_user_id::text, p_allowed_roles);
end;
$$;

create or replace function public."has_platform_permission"(p_permission_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_permission_key text := public."platform_staff_normalize_permission_key"(p_permission_key);
  v_aliases text[] := public."platform_admin_scope_legacy_aliases"(p_permission_key);
begin
  if not public."platform_exact_current_session_authority_internal"()
    or v_permission_key is null
  then
    return false;
  end if;

  if public."platform_subject_has_role_internal"(
    v_actor_user_id, array['owner'::text]
  ) then
    return true;
  end if;

  return public."platform_subject_has_role_internal"(
      v_actor_user_id, array['operator'::text, 'moderator'::text]
    )
    and exists (
      select 1
      from public."platform_staff_permission_grants" grant_row
      where grant_row."status" = 'active'
        and grant_row."target_user_id" = v_actor_user_id
        and grant_row."permission_key" = any(v_aliases)
        and (grant_row."expires_at" is null
          or grant_row."expires_at" > timezone('utc'::text, now()))
    );
end;
$$;

-- Cognitive source-safe RLS remains scoped by signed app_metadata, but the
-- staff predicate is now the same exact live subject used everywhere else.
create or replace function public."cognitive_can_read_scope"(
  p_project_id uuid,
  p_task_id uuid,
  p_platform public.cognitive_platform
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''), '{}'
  )::jsonb;
  actor_user_id text := auth.uid()::text;
  metadata jsonb := coalesce(claims -> 'app_metadata', '{}'::jsonb);
  project_ids jsonb := coalesce(metadata -> 'cognitive_project_ids', '[]'::jsonb);
  task_ids jsonb := coalesce(metadata -> 'cognitive_task_ids', '[]'::jsonb);
  platforms jsonb := coalesce(metadata -> 'cognitive_platforms', '[]'::jsonb);
begin
  if not public."platform_exact_current_session_authority_internal"() then
    return false;
  end if;

  if public."platform_subject_has_role_internal"(
    actor_user_id, array['owner'::text, 'super_admin'::text]
  ) then
    return true;
  end if;

  return public."platform_subject_has_role_internal"(
      actor_user_id, array['operator'::text, 'moderator'::text]
    )
    and exists (
      select 1
      from public."platform_staff_permission_grants" permission_grant
      where permission_grant."status" = 'active'
        and permission_grant."permission_key" = 'admin.cognitive.read'
        and permission_grant."target_user_id" = actor_user_id
        and (permission_grant."expires_at" is null
          or permission_grant."expires_at" > timezone('utc'::text, now()))
    )
    and jsonb_typeof(project_ids) = 'array'
    and project_ids ? p_project_id::text
    and (
      p_task_id is null
      or (jsonb_typeof(task_ids) = 'array' and task_ids ? p_task_id::text)
    )
    and (
      p_platform is null
      or (jsonb_typeof(platforms) = 'array' and platforms ? p_platform::text)
    );
exception when others then
  return false;
end;
$$;

-- These eleven authenticated Owner read policies predate exact live-session
-- authority.  Keep governance_exact_owner(uuid) subject-only for trusted
-- service/provenance validation, while requiring the caller-facing RLS path to
-- bind that immutable Owner subject to the current, unexpired auth.session.
drop policy if exists "cognitive_product_sentinel_platform_scopes_owner_read"
  on public."cognitive_product_sentinel_platform_scopes";
create policy "cognitive_product_sentinel_platform_scopes_owner_read"
  on public."cognitive_product_sentinel_platform_scopes"
  for select to authenticated
  using (
    public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

drop policy if exists "product_experience_baseline_owner_source_amendments_owner_read"
  on public."product_experience_baseline_owner_source_amendments";
create policy "product_experience_baseline_owner_source_amendments_owner_read"
  on public."product_experience_baseline_owner_source_amendments"
  for select to authenticated
  using (
    (select auth.uid()) = "owner_user_id"
    and public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

drop policy if exists "product_experience_baseline_owner_tls_revision_owner_read"
  on public."product_experience_baseline_owner_tls_source_revisions";
create policy "product_experience_baseline_owner_tls_revision_owner_read"
  on public."product_experience_baseline_owner_tls_source_revisions"
  for select to authenticated
  using (
    (select auth.uid()) = "owner_user_id"
    and public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

drop policy if exists "cognitive_provider_independent_visual_canary_authorizations_own"
  on public."cognitive_provider_independent_visual_canary_authorizations";
create policy "cognitive_provider_independent_visual_canary_authorizations_own"
  on public."cognitive_provider_independent_visual_canary_authorizations"
  for select to authenticated
  using (
    (select auth.uid()) = "owner_user_id"
    and public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

drop policy if exists "cognitive_provider_independent_visual_activation_outcomes_owner"
  on public."cognitive_provider_independent_visual_activation_outcomes";
create policy "cognitive_provider_independent_visual_activation_outcomes_owner"
  on public."cognitive_provider_independent_visual_activation_outcomes"
  for select to authenticated
  using (
    (select auth.uid()) = "owner_user_id"
    and public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

drop policy if exists "cognitive_deferred_evidence_v2_decisions_owner_read"
  on public."cognitive_deferred_evidence_v2_decision_receipts";
create policy "cognitive_deferred_evidence_v2_decisions_owner_read"
  on public."cognitive_deferred_evidence_v2_decision_receipts"
  for select to authenticated
  using (
    (select auth.uid()) = "owner_user_id"
    and public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

drop policy if exists "cognitive_ios_visual_canary_preflight_receipts_owner_read"
  on public."cognitive_ios_visual_canary_preflight_receipts";
create policy "cognitive_ios_visual_canary_preflight_receipts_owner_read"
  on public."cognitive_ios_visual_canary_preflight_receipts"
  for select to authenticated
  using (
    (select auth.uid()) = "owner_user_id"
    and public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

drop policy if exists "product_experience_livekit_no_finding_consumptions_owner_read"
  on public."product_experience_livekit_no_finding_attestation_consumptions";
create policy "product_experience_livekit_no_finding_consumptions_owner_read"
  on public."product_experience_livekit_no_finding_attestation_consumptions"
  for select to authenticated
  using (
    public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

drop policy if exists "cognitive_livekit_platform_preflight_receipts_owner_read"
  on public."cognitive_livekit_platform_preflight_receipts";
create policy "cognitive_livekit_platform_preflight_receipts_owner_read"
  on public."cognitive_livekit_platform_preflight_receipts"
  for select to authenticated
  using (
    (select auth.uid()) = "owner_user_id"
    and public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

drop policy if exists "cognitive_livekit_platform_canary_authorizations_owner_read"
  on public."cognitive_livekit_platform_canary_authorizations";
create policy "cognitive_livekit_platform_canary_authorizations_owner_read"
  on public."cognitive_livekit_platform_canary_authorizations"
  for select to authenticated
  using (
    (select auth.uid()) = "owner_user_id"
    and public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

drop policy if exists "cognitive_livekit_platform_activation_outcomes_owner_read"
  on public."cognitive_livekit_platform_activation_outcomes";
create policy "cognitive_livekit_platform_activation_outcomes_owner_read"
  on public."cognitive_livekit_platform_activation_outcomes"
  for select to authenticated
  using (
    (select auth.uid()) = "owner_user_id"
    and public."platform_exact_current_session_subject"((select auth.uid())::text)
    and public."governance_exact_owner"((select auth.uid()))
  );

create or replace function public."autonomous_actor_authority_role"(
  p_actor_user_id text,
  p_actor_email text default null
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership."role"
  from public."platform_role_memberships" membership
  where public."platform_exact_current_session_authority_internal"()
    and nullif(trim(coalesce(p_actor_user_id, '')), '') = auth.uid()::text
    and membership."user_id" = auth.uid()::text
    and membership."status" = 'active'
    and membership."role" in ('owner', 'super_admin')
    and (membership."expires_at" is null
      or membership."expires_at" > timezone('utc'::text, now()))
  order by case membership."role" when 'owner' then 0 else 1 end
  limit 1;
$$;

create or replace function public."autonomous_actor_has_owner_authority"(
  p_actor_user_id text,
  p_actor_email text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."autonomous_actor_authority_role"(
    p_actor_user_id, p_actor_email
  ) is not null;
$$;

drop policy if exists "platform_role_memberships_select_own"
  on public."platform_role_memberships";
create policy "platform_role_memberships_select_own"
  on public."platform_role_memberships"
  for select to authenticated
  using (
    public."platform_exact_current_session_subject"("user_id")
    and "status" = 'active'
    and ("expires_at" is null
      or "expires_at" > timezone('utc'::text, now()))
  );

drop policy if exists "platform_staff_permission_grants_select_owner_or_self"
  on public."platform_staff_permission_grants";
create policy "platform_staff_permission_grants_select_owner_or_self"
  on public."platform_staff_permission_grants"
  for select to authenticated
  using (
    public."has_platform_role"(array['owner'::text])
    or (
      public."platform_exact_current_session_subject"("target_user_id")
      and "status" = 'active'
      and ("expires_at" is null
        or "expires_at" > timezone('utc'::text, now()))
    )
  );

-- These authority tables are API-readable only through their exact-subject
-- SELECT policies. Legacy baseline grants included write-adjacent table
-- privileges that do not participate in RLS (notably TRUNCATE), so close the
-- table surface here while preserving the service-role mutation boundary.
revoke all on table public."platform_role_memberships" from anon, authenticated;
grant select on table public."platform_role_memberships" to authenticated;
revoke all on table public."platform_staff_permission_grants" from anon, authenticated;
grant select on table public."platform_staff_permission_grants" to authenticated;

-- Keep the former role-grant implementation only as inaccessible historical
-- code. The public compatibility RPC below performs the full immutable-subject
-- operation and never delegates authority to the predecessor.
do $migration$
begin
  if to_regprocedure(
    'public.admin_grant_platform_role_by_email_pre_exact_subject_closure(text,text,text)'
  ) is null then
    execute 'alter function public.admin_grant_platform_role_by_email(text,text,text) rename to admin_grant_platform_role_by_email_pre_exact_subject_closure';
  end if;
end;
$migration$;

create or replace function public."admin_grant_platform_role_by_email"(
  p_target_email text,
  p_role text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := public."platform_staff_actor_role"();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_role text := public."platform_staff_normalize_role"(p_role);
  v_target_user_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_membership_ids bigint[];
  v_membership_id bigint;
begin
  if not public."platform_exact_current_session_authority_internal"() then
    raise exception 'platform_staff_auth_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_target_role is null then raise exception 'platform_staff_role_invalid'; end if;
  if v_target_role = 'owner' then raise exception 'platform_staff_owner_grant_not_supported'; end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );
  if public."is_account_access_restricted"(v_target_user_id::text) then
    raise exception 'target_not_active';
  end if;
  if v_actor_role <> 'owner' and v_target_user_id::text = v_actor_user_id then
    raise exception 'platform_staff_self_grant_denied';
  end if;
  if v_actor_role is null or not (
    (v_actor_role = 'owner' and v_target_role in ('operator', 'moderator'))
    or (v_actor_role = 'operator' and v_target_role = 'moderator'
      and public."has_platform_permission"('manage_moderators'))
  ) then
    raise exception 'platform_staff_permission_denied';
  end if;

  select array_agg(membership."id" order by membership."id")
  into v_membership_ids
  from public."platform_role_memberships" membership
  where membership."role" = v_target_role
    and (
      membership."user_id" = v_target_user_id::text
      or lower(trim(coalesce(membership."email", ''))) = v_target_email
    );

  if coalesce(cardinality(v_membership_ids), 0) > 1 then
    raise exception 'platform_role_membership_subject_ambiguous';
  end if;
  v_membership_id := v_membership_ids[1];

  if v_membership_id is not null and exists (
    select 1
    from public."platform_role_memberships" membership
    where membership."id" = v_membership_id
      and nullif(trim(coalesce(membership."user_id", '')), '') is not null
      and membership."user_id" <> v_target_user_id::text
  ) then
    raise exception 'platform_role_membership_subject_conflict';
  end if;

  if v_membership_id is null then
    insert into public."platform_role_memberships" (
      "role", "user_id", "email", "status", "notes", "granted_by",
      "granted_at", "updated_at", "revoked_by", "revoked_at", "expires_at"
    ) values (
      v_target_role, v_target_user_id::text, v_target_email, 'active',
      v_reason, v_actor_user_id, timezone('utc'::text, now()),
      timezone('utc'::text, now()), null, null, null
    ) returning "id" into v_membership_id;
  else
    update public."platform_role_memberships"
    set "user_id" = v_target_user_id::text,
        "email" = v_target_email,
        "status" = 'active',
        "notes" = v_reason,
        "granted_by" = v_actor_user_id,
        "granted_at" = timezone('utc'::text, now()),
        "updated_at" = timezone('utc'::text, now()),
        "revoked_by" = null,
        "revoked_at" = null,
        "expires_at" = null
    where "id" = v_membership_id;
  end if;

  perform public."platform_staff_write_audit"(
    v_actor_user_id, v_actor_email, v_actor_role, v_target_email,
    'grant', v_target_role, v_reason,
    jsonb_build_object('target_user_id', v_target_user_id, 'exact_subject', true)
  );

  return jsonb_build_object(
    'id', v_membership_id,
    'userId', v_target_user_id,
    'email', v_target_email,
    'role', v_target_role,
    'displayRole', case when v_target_role = 'operator' then 'admin' else v_target_role end,
    'status', 'active'
  );
end;
$$;

create or replace function public."admin_revoke_platform_role_by_email"(
  p_target_email text,
  p_role text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := public."platform_staff_actor_role"();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_role text := public."platform_staff_normalize_role"(p_role);
  v_target_user_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_membership_id bigint;
begin
  if not public."platform_exact_current_session_authority_internal"() then
    raise exception 'platform_staff_auth_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_target_role is null then raise exception 'platform_staff_role_invalid'; end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );

  if v_target_role = 'owner' then
    if not public."is_first_owner"(v_actor_user_id, null) then
      raise exception 'first_owner_required';
    end if;
    return public."first_owner_revoke_owner_by_email"(v_target_email, v_reason);
  end if;

  if v_actor_role is null or not (
    (v_actor_role = 'owner' and v_target_role in ('operator', 'moderator'))
    or (v_actor_role = 'operator' and v_target_role = 'moderator'
      and public."has_platform_permission"('manage_moderators'))
  ) then
    raise exception 'platform_staff_permission_denied';
  end if;

  select membership."id"
  into v_membership_id
  from public."platform_role_memberships" membership
  where membership."status" = 'active'
    and membership."role" = v_target_role
    and membership."user_id" = v_target_user_id::text
    and (membership."expires_at" is null
      or membership."expires_at" > timezone('utc'::text, now()));

  if v_membership_id is null then
    raise exception 'platform_staff_role_not_found';
  end if;

  update public."platform_role_memberships"
  set "status" = 'revoked',
      "revoked_by" = v_actor_user_id,
      "revoked_at" = timezone('utc'::text, now()),
      "updated_at" = timezone('utc'::text, now()),
      "notes" = v_reason
  where "id" = v_membership_id;

  if v_target_role = 'operator' then
    update public."platform_staff_permission_grants"
    set "status" = 'revoked',
        "revoked_by" = v_actor_user_id,
        "revoked_at" = timezone('utc'::text, now()),
        "updated_at" = timezone('utc'::text, now()),
        "reason" = v_reason
    where "status" = 'active'
      and "target_user_id" = v_target_user_id::text;
  end if;

  perform public."platform_staff_write_audit"(
    v_actor_user_id, v_actor_email, v_actor_role, v_target_email,
    'revoke', v_target_role, v_reason,
    jsonb_build_object('target_user_id', v_target_user_id, 'exact_subject', true)
  );

  return jsonb_build_object(
    'id', v_membership_id,
    'userId', v_target_user_id,
    'email', v_target_email,
    'role', v_target_role,
    'displayRole', case when v_target_role = 'operator' then 'admin' else v_target_role end,
    'status', 'revoked'
  );
end;
$$;

create or replace function public."admin_grant_platform_staff_permission_by_email"(
  p_target_email text,
  p_permission_key text,
  p_reason text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := public."platform_staff_actor_role"();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_user_id uuid;
  v_permission_key text := public."platform_staff_normalize_permission_key"(p_permission_key);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_grant_id uuid;
begin
  if not public."platform_exact_current_session_authority_internal"()
    or v_actor_role <> 'owner'
  then
    raise exception 'platform_staff_permission_owner_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_permission_key is null then raise exception 'platform_staff_permission_invalid'; end if;
  if p_expires_at is not null
    and p_expires_at <= timezone('utc'::text, now())
  then
    raise exception 'platform_staff_permission_expiry_invalid';
  end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );

  if v_permission_key in ('manage_moderators', 'admin_grants') then
    if not public."platform_subject_has_role_internal"(
      v_target_user_id::text, array['operator'::text]
    ) then
      raise exception 'platform_staff_permission_target_admin_required';
    end if;
  elsif not public."platform_subject_has_role_internal"(
    v_target_user_id::text, array['operator'::text, 'moderator'::text]
  ) then
    raise exception 'platform_staff_permission_target_role_required';
  end if;

  if exists (
    select 1
    from public."platform_staff_permission_grants" grant_row
    where grant_row."status" = 'active'
      and grant_row."permission_key" = v_permission_key
      and lower(grant_row."target_email") = v_target_email
      and grant_row."target_user_id" is distinct from v_target_user_id::text
  ) then
    raise exception 'platform_staff_permission_subject_conflict';
  end if;

  select grant_row."id"
  into v_grant_id
  from public."platform_staff_permission_grants" grant_row
  where grant_row."status" = 'active'
    and grant_row."target_user_id" = v_target_user_id::text
    and grant_row."permission_key" = v_permission_key
  order by grant_row."granted_at" desc
  limit 1;

  if v_grant_id is null then
    insert into public."platform_staff_permission_grants" (
      "target_user_id", "target_email", "permission_key", "status",
      "reason", "granted_by", "granted_at", "expires_at",
      "revoked_by", "revoked_at", "updated_at"
    ) values (
      v_target_user_id::text, v_target_email, v_permission_key, 'active',
      v_reason, v_actor_user_id, timezone('utc'::text, now()), p_expires_at,
      null, null, timezone('utc'::text, now())
    ) returning "id" into v_grant_id;
  else
    update public."platform_staff_permission_grants"
    set "target_email" = v_target_email,
        "status" = 'active',
        "reason" = v_reason,
        "granted_by" = v_actor_user_id,
        "granted_at" = timezone('utc'::text, now()),
        "expires_at" = p_expires_at,
        "revoked_by" = null,
        "revoked_at" = null,
        "updated_at" = timezone('utc'::text, now())
    where "id" = v_grant_id;
  end if;

  perform public."platform_staff_write_permission_audit"(
    v_actor_user_id, v_actor_email, v_actor_role,
    v_target_user_id::text, v_target_email, v_permission_key,
    'grant', v_reason,
    jsonb_build_object('expires_at', p_expires_at, 'exact_subject', true)
  );

  return jsonb_build_object(
    'id', v_grant_id,
    'userId', v_target_user_id,
    'email', v_target_email,
    'permissionKey', v_permission_key,
    'status', 'active',
    'expiresAt', p_expires_at
  );
end;
$$;

create or replace function public."admin_revoke_platform_staff_permission_by_email"(
  p_target_email text,
  p_permission_key text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := public."platform_staff_actor_role"();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_user_id uuid;
  v_permission_key text := public."platform_staff_normalize_permission_key"(p_permission_key);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_grant_id uuid;
begin
  if not public."platform_exact_current_session_authority_internal"()
    or v_actor_role <> 'owner'
  then
    raise exception 'platform_staff_permission_owner_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_permission_key is null then raise exception 'platform_staff_permission_invalid'; end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );

  select grant_row."id"
  into v_grant_id
  from public."platform_staff_permission_grants" grant_row
  where grant_row."status" = 'active'
    and grant_row."target_user_id" = v_target_user_id::text
    and grant_row."permission_key" = v_permission_key
  order by grant_row."granted_at" desc
  limit 1;

  if v_grant_id is null then
    raise exception 'platform_staff_permission_not_found';
  end if;

  update public."platform_staff_permission_grants"
  set "status" = 'revoked',
      "revoked_by" = v_actor_user_id,
      "revoked_at" = timezone('utc'::text, now()),
      "updated_at" = timezone('utc'::text, now()),
      "reason" = coalesce(v_reason, "reason")
  where "id" = v_grant_id;

  perform public."platform_staff_write_permission_audit"(
    v_actor_user_id, v_actor_email, v_actor_role,
    v_target_user_id::text, v_target_email, v_permission_key,
    'revoke', v_reason, jsonb_build_object('exact_subject', true)
  );

  return jsonb_build_object(
    'id', v_grant_id,
    'userId', v_target_user_id,
    'email', v_target_email,
    'permissionKey', v_permission_key,
    'status', 'revoked'
  );
end;
$$;

create or replace function public."read_my_platform_staff_permission_keys"()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with known(permission_key) as (
    select unnest(array[
      'support_inbox','user_lookup','content_moderation','reports_review',
      'live_ops','billing_support_read','creator_support','legal_review',
      'evidence_preview','dmca_review','copyright_review','evidence_export',
      'legal_hold','legal_ops','emergency_break_glass','admin_grants',
      'manage_moderators','audit_review','security_review',
      'staff_permission_templates','legal_request_intake',
      'admin.user.search','admin.user.view','admin.user.suspend',
      'admin.user.restore','admin.support.view','admin.support.manage',
      'admin.dmca.view','admin.dmca.manage','admin.payment_status.view',
      'admin.refund_status.record','admin.profile_private.view',
      'admin.room_private.view','admin.chat_evidence.view',
      'admin.content.hide','admin.content.restore','admin.content.remove',
      'admin.comment.moderate','admin.room.moderate','admin.live.force_end',
      'admin.audit.view','admin.lower_role.manage'
    ]::text[])
  )
  select case
    when not public."platform_exact_current_session_authority_internal"()
      then array[]::text[]
    when public."has_platform_role"(array['owner'::text])
      then array(select permission_key from known order by permission_key)
    else coalesce(array(
      select distinct grant_row."permission_key"
      from public."platform_staff_permission_grants" grant_row
      where grant_row."status" = 'active'
        and grant_row."target_user_id" = auth.uid()::text
        and grant_row."permission_key" in (select permission_key from known)
        and (grant_row."expires_at" is null
          or grant_row."expires_at" > timezone('utc'::text, now()))
      order by grant_row."permission_key"
    ), array[]::text[])
  end;
$$;

create or replace function public."admin_update_platform_staff_permissions_by_email"(
  p_target_email text,
  p_permission_keys text[],
  p_reason text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := public."platform_staff_actor_role"();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_user_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_old_permissions text[] := array[]::text[];
  v_requested_permissions text[] := array[]::text[];
  v_granted_permissions text[] := array[]::text[];
  v_revoked_permissions text[] := array[]::text[];
  v_unchanged_permissions text[] := array[]::text[];
  v_invalid_keys text[] := array[]::text[];
  v_permission_key text;
  v_grant_id uuid;
begin
  if not public."platform_exact_current_session_authority_internal"()
    or v_actor_role <> 'owner'
  then
    raise exception 'platform_staff_permission_owner_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;
  if p_expires_at is not null
    and p_expires_at <= timezone('utc'::text, now())
  then
    raise exception 'platform_staff_permission_expiry_invalid';
  end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );
  if not public."platform_subject_has_role_internal"(
    v_target_user_id::text, array['operator'::text, 'moderator'::text]
  ) then
    raise exception 'platform_staff_permission_target_staff_required';
  end if;

  select coalesce(array_agg(distinct raw_key order by raw_key), array[]::text[])
  into v_invalid_keys
  from (
    select nullif(trim(coalesce(raw_entry, '')), '') as raw_key,
           public."platform_staff_normalize_permission_key"(raw_entry) as normalized_key
    from unnest(coalesce(p_permission_keys, array[]::text[])) raw_entry
  ) normalized
  where raw_key is not null and normalized_key is null;
  if cardinality(v_invalid_keys) > 0 then
    raise exception 'platform_staff_permission_invalid';
  end if;

  select coalesce(array_agg(distinct normalized_key order by normalized_key), array[]::text[])
  into v_requested_permissions
  from (
    select public."platform_staff_normalize_permission_key"(raw_entry) as normalized_key
    from unnest(coalesce(p_permission_keys, array[]::text[])) raw_entry
  ) normalized
  where normalized_key is not null;

  if (
    ('admin_grants' = any(v_requested_permissions)
      or 'manage_moderators' = any(v_requested_permissions))
    and not public."platform_subject_has_role_internal"(
      v_target_user_id::text, array['operator'::text]
    )
  ) then
    raise exception 'platform_staff_permission_target_admin_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'platform-staff-permission:' || v_target_user_id::text,
      0
    )
  );

  if exists (
    select 1
    from public."platform_staff_permission_grants" grant_row
    where grant_row."status" = 'active'
      and lower(trim(coalesce(grant_row."target_email", ''))) = v_target_email
      and grant_row."target_user_id" is distinct from v_target_user_id::text
  ) then
    raise exception 'platform_staff_permission_subject_conflict';
  end if;

  select coalesce(array_agg(distinct grant_row."permission_key"
    order by grant_row."permission_key"), array[]::text[])
  into v_old_permissions
  from public."platform_staff_permission_grants" grant_row
  where grant_row."status" = 'active'
    and grant_row."target_user_id" = v_target_user_id::text
    and (grant_row."expires_at" is null
      or grant_row."expires_at" > timezone('utc'::text, now()));

  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
  into v_granted_permissions
  from unnest(v_requested_permissions) permission_key
  where not (permission_key = any(v_old_permissions));
  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
  into v_revoked_permissions
  from unnest(v_old_permissions) permission_key
  where not (permission_key = any(v_requested_permissions));
  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
  into v_unchanged_permissions
  from unnest(v_requested_permissions) permission_key
  where permission_key = any(v_old_permissions);

  update public."platform_staff_permission_grants"
  set "status" = 'revoked',
      "revoked_by" = v_actor_user_id,
      "revoked_at" = timezone('utc'::text, now()),
      "updated_at" = timezone('utc'::text, now()),
      "reason" = v_reason,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object('bulk_update', true, 'exact_subject', true)
  where "status" = 'active'
    and "target_user_id" = v_target_user_id::text
    and not ("permission_key" = any(v_requested_permissions));

  foreach v_permission_key in array v_requested_permissions loop
    select grant_row."id"
    into v_grant_id
    from public."platform_staff_permission_grants" grant_row
    where grant_row."status" = 'active'
      and grant_row."target_user_id" = v_target_user_id::text
      and grant_row."permission_key" = v_permission_key
    order by grant_row."granted_at" desc, grant_row."id" desc
    limit 1;

    if v_grant_id is null then
      insert into public."platform_staff_permission_grants" (
        "target_user_id", "target_email", "permission_key", "status",
        "reason", "granted_by", "granted_at", "expires_at",
        "revoked_by", "revoked_at", "updated_at", "metadata"
      ) values (
        v_target_user_id::text, v_target_email, v_permission_key, 'active',
        v_reason, v_actor_user_id, timezone('utc'::text, now()), p_expires_at,
        null, null, timezone('utc'::text, now()),
        jsonb_build_object('bulk_update', true, 'exact_subject', true)
      ) returning "id" into v_grant_id;
    else
      update public."platform_staff_permission_grants"
      set "target_user_id" = v_target_user_id::text,
          "target_email" = v_target_email,
          "status" = 'active',
          "reason" = v_reason,
          "granted_by" = v_actor_user_id,
          "granted_at" = timezone('utc'::text, now()),
          "expires_at" = p_expires_at,
          "revoked_by" = null,
          "revoked_at" = null,
          "updated_at" = timezone('utc'::text, now()),
          "metadata" = coalesce("metadata", '{}'::jsonb)
            || jsonb_build_object('bulk_update', true, 'exact_subject', true)
      where "id" = v_grant_id;

      update public."platform_staff_permission_grants"
      set "status" = 'revoked',
          "revoked_by" = v_actor_user_id,
          "revoked_at" = timezone('utc'::text, now()),
          "updated_at" = timezone('utc'::text, now()),
          "reason" = v_reason
      where "status" = 'active'
        and "target_user_id" = v_target_user_id::text
        and "permission_key" = v_permission_key
        and "id" <> v_grant_id;
    end if;
  end loop;

  foreach v_permission_key in array v_granted_permissions loop
    perform public."platform_staff_write_permission_audit"(
      v_actor_user_id, v_actor_email, v_actor_role,
      v_target_user_id::text, v_target_email, v_permission_key,
      'grant', v_reason,
      jsonb_build_object('bulk_update', true, 'exact_subject', true,
        'old_permissions', v_old_permissions,
        'new_permissions', v_requested_permissions,
        'expires_at', p_expires_at)
    );
  end loop;
  foreach v_permission_key in array v_revoked_permissions loop
    perform public."platform_staff_write_permission_audit"(
      v_actor_user_id, v_actor_email, v_actor_role,
      v_target_user_id::text, v_target_email, v_permission_key,
      'revoke', v_reason,
      jsonb_build_object('bulk_update', true, 'exact_subject', true,
        'old_permissions', v_old_permissions,
        'new_permissions', v_requested_permissions)
    );
  end loop;

  return jsonb_build_object(
    'userId', v_target_user_id,
    'email', v_target_email,
    'oldPermissions', v_old_permissions,
    'newPermissions', v_requested_permissions,
    'grantedPermissions', v_granted_permissions,
    'revokedPermissions', v_revoked_permissions,
    'unchangedPermissions', v_unchanged_permissions,
    'auditWritten', true,
    'updatedAt', timezone('utc'::text, now())
  );
end;
$$;

create or replace function public."list_staff_scoped_permissions_by_email"(
  p_target_email text
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_role text := public."platform_staff_actor_role"();
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_user_id uuid;
  v_permissions text[];
begin
  if not public."platform_exact_current_session_authority_internal"()
    or v_actor_role is null
  then
    raise exception 'platform_staff_permission_denied';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );
  if v_actor_role <> 'owner' and v_target_user_id::text <> auth.uid()::text then
    raise exception 'platform_staff_permission_owner_required';
  end if;

  select coalesce(array_agg(distinct grant_row."permission_key"
    order by grant_row."permission_key"), array[]::text[])
  into v_permissions
  from public."platform_staff_permission_grants" grant_row
  where grant_row."status" = 'active'
    and grant_row."target_user_id" = v_target_user_id::text
    and (grant_row."expires_at" is null
      or grant_row."expires_at" > timezone('utc'::text, now()));

  return coalesce(v_permissions, array[]::text[]);
end;
$$;

-- First Owner is the exact confirmed user_id on the active owner membership.
-- Marker email remains audit data and is never a matching predicate.
update public."platform_first_owner_authority" marker
set "is_active" = false,
    "retired_at" = coalesce(marker."retired_at", timezone('utc'::text, now())),
    "retired_by" = coalesce(marker."retired_by", 'platform-exact-subject-closure'),
    "retired_reason" = coalesce(marker."retired_reason", 'Exact confirmed owner subject missing.')
where marker."is_active"
  and not exists (
    select 1
    from public."platform_role_memberships" membership
    join auth.users subject on subject.id::text = membership."user_id"
      and subject.email_confirmed_at is not null
      and subject.deleted_at is null
    where membership."id" = marker."owner_membership_id"
      and membership."role" = 'owner'
      and membership."status" = 'active'
      and membership."user_id" = marker."owner_user_id"
      and marker."owner_user_id" is not null
      and (membership."expires_at" is null
        or membership."expires_at" > timezone('utc'::text, now()))
  );

update public."platform_owner_succession_challenges" challenge
set "status" = 'expired'
where challenge."status" = 'active'
  and (
    challenge."expires_at" <= timezone('utc'::text, now())
    or not exists (
      select 1
      from public."platform_role_memberships" successor
      join auth.users subject on subject.id::text = successor."user_id"
        and subject.email_confirmed_at is not null
        and subject.deleted_at is null
      where successor."id" = challenge."successor_owner_membership_id"
        and successor."role" = 'owner'
        and successor."status" = 'active'
        and successor."user_id" = challenge."successor_user_id"
        and (successor."expires_at" is null
          or successor."expires_at" > timezone('utc'::text, now()))
    )
    or not exists (
      select 1
      from public."platform_role_memberships" target
      where target."id" = challenge."target_owner_membership_id"
        and target."role" = 'owner'
        and target."status" = 'active'
        and target."user_id" = challenge."actor_user_id"
        and (target."expires_at" is null
          or target."expires_at" > timezone('utc'::text, now()))
    )
  );

create or replace function public."platform_first_owner_marker_guard"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new."owner_user_id" := nullif(trim(coalesce(new."owner_user_id", '')), '');
  new."owner_email" := nullif(lower(trim(coalesce(new."owner_email", ''))), '');

  if new."is_active" and (
    new."owner_user_id" is null
    or not public."platform_subject_has_role_internal"(
      new."owner_user_id", array['owner'::text]
    )
    or not exists (
      select 1
      from public."platform_role_memberships" membership
      where membership."id" = new."owner_membership_id"
        and membership."user_id" = new."owner_user_id"
        and membership."role" = 'owner'
        and membership."status" = 'active'
        and (membership."expires_at" is null
          or membership."expires_at" > timezone('utc'::text, now()))
    )
  ) then
    raise exception 'first_owner_exact_confirmed_subject_required';
  end if;

  return new;
end;
$$;

create or replace function public."first_owner_active_marker"()
returns table (
  id uuid,
  owner_membership_id bigint,
  owner_user_id text,
  owner_email text,
  established_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select marker."id", marker."owner_membership_id", marker."owner_user_id",
         marker."owner_email", marker."established_at"
  from public."platform_first_owner_authority" marker
  join public."platform_role_memberships" membership
    on membership."id" = marker."owner_membership_id"
   and membership."user_id" = marker."owner_user_id"
   and membership."role" = 'owner'
   and membership."status" = 'active'
   and (membership."expires_at" is null
     or membership."expires_at" > timezone('utc'::text, now()))
  join auth.users subject
    on subject.id::text = membership."user_id"
   and subject.email_confirmed_at is not null
   and subject.deleted_at is null
  where marker."is_active" = true
    and marker."owner_user_id" is not null
    and not public."is_account_access_restricted"(marker."owner_user_id")
  order by marker."established_at" asc
  limit 1;
$$;

create or replace function public."is_first_owner"(
  p_actor_user_id text default auth.uid()::text,
  p_actor_email text default (auth.jwt() ->> 'email')
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select nullif(trim(coalesce(p_actor_user_id, '')), '') as actor_user_id
  )
  select (select actor_user_id from normalized) is not null
    and (
      auth.uid() is null
      or (select actor_user_id from normalized) <> auth.uid()::text
      or public."platform_exact_current_session_authority_internal"()
    )
    and exists (
      select 1
      from public."first_owner_active_marker"() marker
      where marker.owner_user_id = (select actor_user_id from normalized)
    );
$$;

create or replace function public."platform_first_owner_only_break_glass"(
  p_actor_user_id text default auth.uid()::text,
  p_actor_email text default (auth.jwt() ->> 'email')
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."platform_exact_current_session_authority_internal"()
    and nullif(trim(coalesce(p_actor_user_id, '')), '') = auth.uid()::text
    and public."is_first_owner"(auth.uid()::text, null);
$$;

drop trigger if exists "platform_first_owner_marker_guard_trigger"
  on public."platform_first_owner_authority";
create trigger "platform_first_owner_marker_guard_trigger"
before insert or update on public."platform_first_owner_authority"
for each row execute function public."platform_first_owner_marker_guard"();

create or replace function public."first_owner_authority_status"()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_marker record;
  v_active_owner_count integer := 0;
  v_actor_is_owner boolean := false;
  v_actor_is_first_owner boolean := false;
begin
  if not public."platform_exact_current_session_authority_internal"() then
    raise exception 'first_owner_auth_required';
  end if;

  v_actor_is_owner := public."platform_subject_has_role_internal"(
    auth.uid()::text, array['owner'::text]
  );
  if not v_actor_is_owner then
    raise exception 'owner_required';
  end if;
  v_actor_is_first_owner := public."is_first_owner"(auth.uid()::text, null);

  select * into v_marker
  from public."first_owner_active_marker"()
  limit 1;

  select count(*)::integer into v_active_owner_count
  from public."platform_role_memberships" membership
  join auth.users subject
    on subject.id::text = membership."user_id"
   and subject.email_confirmed_at is not null
   and subject.deleted_at is null
  where membership."role" = 'owner'
    and membership."status" = 'active'
    and (membership."expires_at" is null
      or membership."expires_at" > timezone('utc'::text, now()))
    and not public."is_account_access_restricted"(membership."user_id");

  return jsonb_build_object(
    'status', case when v_marker.id is null
      then 'blocked_pending_first_owner_seed' else 'enabled' end,
    'actorIsFirstOwner', v_actor_is_first_owner,
    'actorIsOwner', v_actor_is_owner,
    'activeOwnerCount', coalesce(v_active_owner_count, 0),
    'firstOwnerMarkerExists', v_marker.id is not null,
    'firstOwnerMembershipId', v_marker.owner_membership_id,
    'firstOwnerUserIdPresent', v_marker.owner_user_id is not null,
    'firstOwnerEmailPresent', v_marker.owner_email is not null,
    'establishedAt', v_marker.established_at,
    'controlsEnabled', v_marker.id is not null and v_actor_is_first_owner,
    'normalOwnerCanGrantOwner', false,
    'normalOwnerCanRevokeOwner', false,
    'breakGlassFirstOwnerOnly', true
  );
end;
$$;

-- Break Glass is never inherited through email and never remains active
-- without a bounded future expiry. The email column is audit display only.
update public."platform_break_glass_sessions" session
set "status" = 'expired',
    "ended_at" = coalesce(session."ended_at", timezone('utc'::text, now())),
    "metadata" = coalesce(session."metadata", '{}'::jsonb)
      || jsonb_build_object('exact_subject_quarantined', true)
where session."status" = 'active'
  and (
    nullif(trim(coalesce(session."actor_user_id", '')), '') is null
    or session."expires_at" is null
    or session."expires_at" <= timezone('utc'::text, now())
    or not public."is_first_owner"(session."actor_user_id", null)
  );

create or replace function public."enforce_platform_break_glass_exact_subject_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new."actor_user_id" := nullif(trim(coalesce(new."actor_user_id", '')), '');
  new."actor_email" := nullif(lower(trim(coalesce(new."actor_email", ''))), '');

  if new."status" = 'active' and (
    new."actor_user_id" is null
    or new."expires_at" is null
    or new."expires_at" <= timezone('utc'::text, now())
    or not public."is_first_owner"(new."actor_user_id", null)
  ) then
    raise exception 'break_glass_exact_first_owner_subject_required';
  end if;

  return new;
end;
$$;

drop trigger if exists "enforce_platform_break_glass_exact_subject"
  on public."platform_break_glass_sessions";
create trigger "enforce_platform_break_glass_exact_subject"
before insert or update of "actor_user_id", "actor_email", "status", "expires_at"
on public."platform_break_glass_sessions"
for each row execute function public."enforce_platform_break_glass_exact_subject_internal"();

create or replace function public."platform_current_break_glass_session_id"(
  p_actor_user_id text default auth.uid()::text,
  p_actor_email text default (auth.jwt() ->> 'email')
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select session."id"
  from public."platform_break_glass_sessions" session
  where nullif(trim(coalesce(p_actor_user_id, '')), '') is not null
    and session."actor_user_id" = nullif(trim(coalesce(p_actor_user_id, '')), '')
    and session."status" = 'active'
    and session."expires_at" is not null
    and session."expires_at" > timezone('utc'::text, now())
    and public."is_first_owner"(session."actor_user_id", null)
  order by session."activated_at" desc
  limit 1;
$$;

create or replace function public."platform_break_glass_active_for_actor"(
  p_actor_user_id text,
  p_actor_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."platform_current_break_glass_session_id"(
    p_actor_user_id, null
  ) is not null;
$$;

create or replace function public."first_owner_grant_owner_by_email"(
  p_target_email text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_user_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_membership_ids bigint[];
  v_membership_id bigint;
begin
  if not public."platform_exact_current_session_authority_internal"() then
    raise exception 'first_owner_auth_required';
  end if;
  if not public."is_first_owner"(v_actor_user_id, null) then
    raise exception 'first_owner_required';
  end if;
  if v_target_email is null then raise exception 'target_email_required'; end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'first_owner_reason_required';
  end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );
  if public."is_account_access_restricted"(v_target_user_id::text) then
    raise exception 'target_not_active';
  end if;

  select array_agg(membership."id" order by membership."id")
  into v_membership_ids
  from public."platform_role_memberships" membership
  where membership."role" = 'owner'
    and (
      membership."user_id" = v_target_user_id::text
      or lower(trim(coalesce(membership."email", ''))) = v_target_email
    );
  if coalesce(cardinality(v_membership_ids), 0) > 1 then
    raise exception 'platform_role_membership_subject_ambiguous';
  end if;
  v_membership_id := v_membership_ids[1];
  if v_membership_id is not null and exists (
    select 1 from public."platform_role_memberships" membership
    where membership."id" = v_membership_id
      and nullif(trim(coalesce(membership."user_id", '')), '') is not null
      and membership."user_id" <> v_target_user_id::text
  ) then
    raise exception 'platform_role_membership_subject_conflict';
  end if;

  if v_membership_id is null then
    insert into public."platform_role_memberships" (
      "role", "user_id", "email", "status", "notes", "granted_by",
      "granted_at", "updated_at", "expires_at"
    ) values (
      'owner', v_target_user_id::text, v_target_email, 'active', v_reason,
      v_actor_user_id, timezone('utc'::text, now()),
      timezone('utc'::text, now()), null
    ) returning "id" into v_membership_id;
  else
    update public."platform_role_memberships"
    set "user_id" = v_target_user_id::text,
        "email" = v_target_email,
        "status" = 'active',
        "notes" = v_reason,
        "granted_by" = v_actor_user_id,
        "granted_at" = timezone('utc'::text, now()),
        "updated_at" = timezone('utc'::text, now()),
        "revoked_by" = null,
        "revoked_at" = null,
        "expires_at" = null
    where "id" = v_membership_id;
  end if;

  perform public."platform_staff_write_audit"(
    v_actor_user_id, v_actor_email, 'owner', v_target_email,
    'grant', 'owner', v_reason,
    jsonb_build_object('target_user_id', v_target_user_id,
      'first_owner_authority', true, 'exact_subject', true)
  );
  perform public."platform_first_owner_write_audit"(
    v_actor_user_id, v_actor_email, 'owner', 'grant_owner',
    v_target_user_id::text, v_target_email, v_membership_id, v_reason,
    'success', jsonb_build_object('exact_subject', true)
  );

  return jsonb_build_object(
    'ok', true, 'membershipId', v_membership_id,
    'targetUserId', v_target_user_id, 'role', 'owner', 'status', 'active'
  );
end;
$$;

create or replace function public."first_owner_revoke_owner_by_email"(
  p_target_email text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_user_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_membership_id bigint;
  v_active_owner_count integer;
begin
  if not public."platform_exact_current_session_authority_internal"() then
    raise exception 'first_owner_auth_required';
  end if;
  if not public."is_first_owner"(v_actor_user_id, null) then
    raise exception 'first_owner_required';
  end if;
  if v_target_email is null then raise exception 'target_email_required'; end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'first_owner_reason_required';
  end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );
  if v_target_user_id::text = v_actor_user_id then
    raise exception 'first_owner_self_revoke_requires_succession';
  end if;

  select membership."id"
  into v_membership_id
  from public."platform_role_memberships" membership
  where membership."role" = 'owner'
    and membership."status" = 'active'
    and membership."user_id" = v_target_user_id::text
    and (membership."expires_at" is null
      or membership."expires_at" > timezone('utc'::text, now()));
  if v_membership_id is null then raise exception 'owner_role_not_found'; end if;

  select count(*)::integer
  into v_active_owner_count
  from public."platform_role_memberships" membership
  join auth.users subject on subject.id::text = membership."user_id"
    and subject.email_confirmed_at is not null
    and subject.deleted_at is null
  where membership."role" = 'owner'
    and membership."status" = 'active'
    and (membership."expires_at" is null
      or membership."expires_at" > timezone('utc'::text, now()));
  if coalesce(v_active_owner_count, 0) <= 1 then
    raise exception 'last_owner_required';
  end if;

  update public."platform_role_memberships"
  set "status" = 'revoked',
      "revoked_by" = v_actor_user_id,
      "revoked_at" = timezone('utc'::text, now()),
      "updated_at" = timezone('utc'::text, now()),
      "notes" = v_reason
  where "id" = v_membership_id;

  perform public."platform_staff_write_audit"(
    v_actor_user_id, v_actor_email, 'owner', v_target_email,
    'revoke', 'owner', v_reason,
    jsonb_build_object('target_user_id', v_target_user_id,
      'first_owner_authority', true, 'exact_subject', true)
  );
  perform public."platform_first_owner_write_audit"(
    v_actor_user_id, v_actor_email, 'owner', 'revoke_owner',
    v_target_user_id::text, v_target_email, v_membership_id, v_reason,
    'success', jsonb_build_object('exact_subject', true)
  );

  return jsonb_build_object(
    'ok', true, 'membershipId', v_membership_id,
    'targetUserId', v_target_user_id, 'role', 'owner', 'status', 'revoked'
  );
end;
$$;

create or replace function public."first_owner_create_self_step_down_challenge"(
  p_successor_owner_email text,
  p_passcode_hash text,
  p_passcode_salt text,
  p_reason text,
  p_expires_at timestamptz default timezone('utc'::text, now()) + interval '10 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_successor_email text := public."platform_staff_normalize_email"(p_successor_owner_email);
  v_successor_user_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_target_membership_id bigint;
  v_successor_membership_id bigint;
  v_active_owner_count integer;
  v_challenge_id uuid;
begin
  if not public."platform_exact_current_session_authority_internal"() then
    raise exception 'first_owner_auth_required';
  end if;
  if not public."is_first_owner"(v_actor_user_id, null) then
    raise exception 'first_owner_required';
  end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'first_owner_reason_required';
  end if;
  if v_successor_email is null then raise exception 'successor_required'; end if;

  v_successor_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_successor_email
  );
  if v_successor_user_id::text = v_actor_user_id then
    raise exception 'successor_must_be_different_owner';
  end if;
  if length(trim(coalesce(p_passcode_hash, ''))) < 32
    or length(trim(coalesce(p_passcode_salt, ''))) < 16
  then
    raise exception 'passcode_hash_required';
  end if;
  if p_expires_at is null
    or p_expires_at <= timezone('utc'::text, now())
    or p_expires_at > timezone('utc'::text, now()) + interval '15 minutes'
  then
    raise exception 'passcode_expiry_invalid';
  end if;

  select membership."id" into v_target_membership_id
  from public."platform_role_memberships" membership
  where membership."role" = 'owner'
    and membership."status" = 'active'
    and membership."user_id" = v_actor_user_id
    and (membership."expires_at" is null
      or membership."expires_at" > timezone('utc'::text, now()));
  select membership."id" into v_successor_membership_id
  from public."platform_role_memberships" membership
  where membership."role" = 'owner'
    and membership."status" = 'active'
    and membership."user_id" = v_successor_user_id::text
    and (membership."expires_at" is null
      or membership."expires_at" > timezone('utc'::text, now()));
  if v_target_membership_id is null or v_successor_membership_id is null then
    raise exception 'successor_owner_required';
  end if;

  select count(*)::integer into v_active_owner_count
  from public."platform_role_memberships" membership
  join auth.users subject on subject.id::text = membership."user_id"
    and subject.email_confirmed_at is not null
    and subject.deleted_at is null
  where membership."role" = 'owner'
    and membership."status" = 'active'
    and (membership."expires_at" is null
      or membership."expires_at" > timezone('utc'::text, now()));
  if coalesce(v_active_owner_count, 0) < 2 then
    raise exception 'successor_owner_required';
  end if;

  update public."platform_owner_succession_challenges"
  set "status" = 'expired'
  where "actor_user_id" = v_actor_user_id
    and "status" = 'active'
    and "action" = 'first_owner_self_step_down';

  insert into public."platform_owner_succession_challenges" (
    "actor_user_id", "actor_email", "successor_owner_membership_id",
    "successor_user_id", "successor_email", "target_owner_membership_id",
    "passcode_hash", "passcode_salt", "expires_at", "reason", "metadata"
  ) values (
    v_actor_user_id, v_actor_email, v_successor_membership_id,
    v_successor_user_id::text, v_successor_email, v_target_membership_id,
    trim(p_passcode_hash), trim(p_passcode_salt), p_expires_at, v_reason,
    jsonb_build_object('password_reauth_required', true,
      'passcode_plaintext_stored', false, 'single_use', true,
      'rate_limited', true, 'exact_subject', true)
  ) returning "id" into v_challenge_id;

  perform public."platform_first_owner_write_audit"(
    v_actor_user_id, v_actor_email, 'owner', 'challenge_created',
    v_successor_user_id::text, v_successor_email, v_successor_membership_id,
    v_reason, 'success', jsonb_build_object('challenge_id', v_challenge_id,
      'expires_at', p_expires_at, 'exact_subject', true)
  );

  return jsonb_build_object(
    'ok', true, 'challengeId', v_challenge_id,
    'successorUserId', v_successor_user_id,
    'expiresAt', p_expires_at,
    'typedConfirmationRequired', 'STEP DOWN FIRST OWNER'
  );
end;
$$;

create or replace function public."first_owner_complete_self_step_down"(
  p_challenge_id uuid,
  p_passcode_hash text,
  p_typed_confirmation text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_challenge record;
  v_new_marker_id uuid;
  v_affected integer := 0;
begin
  if not public."platform_exact_current_session_authority_internal"() then
    raise exception 'first_owner_auth_required';
  end if;
  if not public."is_first_owner"(v_actor_user_id, null) then
    raise exception 'first_owner_required';
  end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'first_owner_reason_required';
  end if;

  select * into v_challenge
  from public."platform_owner_succession_challenges" challenge
  where challenge."id" = p_challenge_id
    and challenge."actor_user_id" = v_actor_user_id
    and challenge."action" = 'first_owner_self_step_down'
  for update;

  if v_challenge.id is null then raise exception 'challenge_not_found'; end if;
  if v_challenge.status <> 'active' or v_challenge.consumed_at is not null then
    raise exception 'challenge_not_active';
  end if;
  if v_challenge.expires_at <= timezone('utc'::text, now()) then
    raise exception 'challenge_expired';
  end if;
  if v_challenge.attempt_count >= v_challenge.max_attempts then
    raise exception 'challenge_locked';
  end if;

  if not exists (
    select 1
    from public."first_owner_active_marker"() marker
    where marker.owner_user_id = v_actor_user_id
      and marker.owner_membership_id = v_challenge.target_owner_membership_id
  ) or not exists (
    select 1
    from public."platform_role_memberships" target
    join auth.users subject
      on subject.id::text = target."user_id"
     and subject.email_confirmed_at is not null
     and subject.deleted_at is null
    where target."id" = v_challenge.target_owner_membership_id
      and target."user_id" = v_actor_user_id
      and target."role" = 'owner'
      and target."status" = 'active'
      and (target."expires_at" is null
        or target."expires_at" > timezone('utc'::text, now()))
      and not public."is_account_access_restricted"(target."user_id")
  ) then
    raise exception 'first_owner_target_subject_invalid';
  end if;

  if nullif(trim(coalesce(v_challenge.successor_user_id, '')), '') is null
    or not exists (
      select 1
      from public."platform_role_memberships" successor
      join auth.users subject
        on subject.id::text = successor."user_id"
       and subject.email_confirmed_at is not null
       and subject.deleted_at is null
      where successor."id" = v_challenge.successor_owner_membership_id
        and successor."user_id" = v_challenge.successor_user_id
        and successor."role" = 'owner'
        and successor."status" = 'active'
        and (successor."expires_at" is null
          or successor."expires_at" > timezone('utc'::text, now()))
        and not public."is_account_access_restricted"(successor."user_id")
    )
  then
    raise exception 'successor_owner_required';
  end if;

  if trim(coalesce(p_typed_confirmation, ''))
    <> v_challenge.typed_confirmation_required
  then
    update public."platform_owner_succession_challenges"
    set "attempt_count" = "attempt_count" + 1,
        "last_attempt_at" = timezone('utc'::text, now())
    where "id" = p_challenge_id;
    perform public."platform_first_owner_write_audit"(
      v_actor_user_id, v_actor_email, 'owner', 'challenge_failed',
      v_challenge.successor_user_id, v_challenge.successor_email,
      v_challenge.successor_owner_membership_id, v_reason, 'failed',
      jsonb_build_object('challenge_id', p_challenge_id,
        'failed_reason', 'typed_confirmation_mismatch', 'exact_subject', true)
    );
    raise exception 'typed_confirmation_required';
  end if;

  if trim(coalesce(p_passcode_hash, '')) <> v_challenge.passcode_hash then
    update public."platform_owner_succession_challenges"
    set "attempt_count" = "attempt_count" + 1,
        "last_attempt_at" = timezone('utc'::text, now()),
        "status" = case when "attempt_count" + 1 >= "max_attempts"
          then 'locked' else "status" end
    where "id" = p_challenge_id;
    perform public."platform_first_owner_write_audit"(
      v_actor_user_id, v_actor_email, 'owner', 'challenge_failed',
      v_challenge.successor_user_id, v_challenge.successor_email,
      v_challenge.successor_owner_membership_id, v_reason, 'failed',
      jsonb_build_object('challenge_id', p_challenge_id,
        'failed_reason', 'passcode_mismatch', 'exact_subject', true)
    );
    raise exception 'passcode_invalid';
  end if;

  update public."platform_first_owner_authority" marker
  set "is_active" = false,
      "retired_at" = timezone('utc'::text, now()),
      "retired_by" = v_actor_user_id,
      "retired_reason" = v_reason
  where marker."is_active" = true
    and marker."owner_membership_id" = v_challenge.target_owner_membership_id
    and marker."owner_user_id" = v_actor_user_id;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'first_owner_target_subject_invalid'; end if;

  insert into public."platform_first_owner_authority" (
    "owner_membership_id", "owner_user_id", "owner_email", "is_active",
    "established_by", "established_reason", "metadata"
  ) values (
    v_challenge.successor_owner_membership_id,
    v_challenge.successor_user_id,
    v_challenge.successor_email,
    true,
    v_actor_user_id,
    v_reason,
    jsonb_build_object(
      'succession_challenge_id', p_challenge_id, 'exact_subject', true
    )
  ) returning "id" into v_new_marker_id;

  update public."platform_break_glass_sessions" session
  set "status" = 'expired',
      "ended_at" = coalesce(session."ended_at", timezone('utc'::text, now())),
      "metadata" = coalesce(session."metadata", '{}'::jsonb)
        || jsonb_build_object('ended_by_first_owner_succession', true)
  where session."actor_user_id" = v_actor_user_id
    and session."status" = 'active';

  update public."platform_role_memberships" membership
  set "status" = 'revoked',
      "revoked_by" = v_actor_user_id,
      "revoked_at" = timezone('utc'::text, now()),
      "updated_at" = timezone('utc'::text, now()),
      "notes" = v_reason
  where membership."id" = v_challenge.target_owner_membership_id
    and membership."user_id" = v_actor_user_id
    and membership."role" = 'owner'
    and membership."status" = 'active';
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'first_owner_target_subject_invalid'; end if;

  update public."platform_owner_succession_challenges" challenge
  set "status" = 'consumed',
      "consumed_at" = timezone('utc'::text, now())
  where challenge."id" = p_challenge_id
    and challenge."actor_user_id" = v_actor_user_id
    and challenge."status" = 'active';
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'challenge_not_active'; end if;

  perform public."platform_first_owner_write_audit"(
    v_actor_user_id, v_actor_email, 'owner', 'challenge_consumed',
    v_challenge.successor_user_id, v_challenge.successor_email,
    v_challenge.successor_owner_membership_id, v_reason, 'success',
    jsonb_build_object('challenge_id', p_challenge_id,
      'new_marker_id', v_new_marker_id, 'exact_subject', true)
  );
  perform public."platform_first_owner_write_audit"(
    v_actor_user_id, v_actor_email, 'owner', 'first_owner_succession',
    v_challenge.successor_user_id, v_challenge.successor_email,
    v_challenge.successor_owner_membership_id, v_reason, 'success',
    jsonb_build_object(
      'previous_owner_membership_id', v_challenge.target_owner_membership_id,
      'new_marker_id', v_new_marker_id, 'exact_subject', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'newFirstOwnerMarkerId', v_new_marker_id,
    'successorMembershipId', v_challenge.successor_owner_membership_id,
    'successorUserId', v_challenge.successor_user_id,
    'previousOwnerStatus', 'revoked'
  );
end;
$$;

-- Beta invitation email is a one-time locator only while the row is unbound
-- and invited. Once bound, every read/update is exact user_id only.
create or replace function public."enforce_beta_active_exact_subject_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new."user_id" := nullif(trim(coalesce(new."user_id", '')), '');
  new."email" := nullif(lower(trim(coalesce(new."email", ''))), '');
  if new."access_status" = 'active' and (
    new."user_id" is null
    or not exists (
      select 1 from auth.users subject
      where subject.id::text = new."user_id"
        and subject.email_confirmed_at is not null
        and subject.deleted_at is null
    )
  ) then
    raise exception 'beta_access_exact_confirmed_subject_required';
  end if;
  return new;
end;
$$;

drop trigger if exists "enforce_beta_active_exact_subject"
  on public."beta_access_memberships";
create trigger "enforce_beta_active_exact_subject"
before insert or update of "email", "user_id", "access_status"
on public."beta_access_memberships"
for each row execute function public."enforce_beta_active_exact_subject_internal"();

create or replace function public."has_active_beta_access"()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."platform_exact_current_session_authority_internal"()
    and exists (
      select 1
      from public."beta_access_memberships" membership
      where membership."access_status" = 'active'
        and membership."user_id" = auth.uid()::text
    );
$$;

create or replace function public."activate_beta_membership"()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text := auth.uid()::text;
  v_email text;
  v_membership public."beta_access_memberships"%rowtype;
begin
  if not public."platform_exact_current_session_authority_internal"() then
    return null;
  end if;

  select lower(trim(subject.email)) into v_email
  from auth.users subject
  where subject.id = auth.uid()
    and subject.email_confirmed_at is not null
    and subject.deleted_at is null;

  select * into v_membership
  from public."beta_access_memberships" membership
  where membership."user_id" = v_user_id
  order by membership."invited_at" desc
  limit 1;

  if not found and v_email is not null then
    select * into v_membership
    from public."beta_access_memberships" membership
    where nullif(trim(coalesce(membership."user_id", '')), '') is null
      and membership."access_status" = 'invited'
      and lower(trim(membership."email")) = v_email
    order by membership."invited_at" desc
    limit 1
    for update;
  end if;

  if not found then return null; end if;

  update public."beta_access_memberships"
  set "user_id" = v_user_id,
      "email" = coalesce(nullif(trim("email"), ''), v_email),
      "access_status" = case when "access_status" = 'invited'
        then 'active' else "access_status" end,
      "activated_at" = case when "access_status" = 'invited'
        then coalesce("activated_at", timezone('utc'::text, now()))
        else "activated_at" end,
      "last_seen_at" = timezone('utc'::text, now())
  where "id" = v_membership."id"
    and (
      "user_id" = v_user_id
      or (nullif(trim(coalesce("user_id", '')), '') is null
        and "access_status" = 'invited')
    )
  returning * into v_membership;

  if not found then return null; end if;
  return to_jsonb(v_membership);
end;
$$;

create or replace function public."acknowledge_beta_onboarding"()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public."beta_access_memberships"%rowtype;
begin
  if not public."platform_exact_current_session_authority_internal"() then
    return null;
  end if;
  update public."beta_access_memberships"
  set "onboarding_ack_at" = coalesce("onboarding_ack_at", timezone('utc'::text, now())),
      "last_seen_at" = timezone('utc'::text, now())
  where "access_status" = 'active'
    and "user_id" = auth.uid()::text
  returning * into v_membership;
  if not found then return null; end if;
  return to_jsonb(v_membership);
end;
$$;

drop policy if exists "beta_access_memberships_select_own"
  on public."beta_access_memberships";
create policy "beta_access_memberships_select_own"
  on public."beta_access_memberships"
  for select to authenticated
  using (public."platform_exact_current_session_subject"("user_id"));

revoke all on table public."beta_access_memberships" from anon, authenticated;
grant select on table public."beta_access_memberships" to authenticated;

-- Sandbox tester authority is an exact confirmed subject and remains sandbox
-- only. Caller-supplied resolver arguments are compatibility inputs and never
-- select authority.
create or replace function public."enforce_sandbox_tester_exact_subject_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new."user_id" := nullif(trim(coalesce(new."user_id", '')), '');
  new."email" := nullif(lower(trim(coalesce(new."email", ''))), '');
  if new."status" = 'active' and (
    new."user_id" is null
    or not exists (
      select 1 from auth.users subject
      where subject.id::text = new."user_id"
        and subject.email_confirmed_at is not null
        and subject.deleted_at is null
    )
    or public."is_account_access_restricted"(coalesce(new."user_id", ''))
    or (new."expires_at" is not null
      and new."expires_at" <= timezone('utc'::text, now()))
  ) then
    raise exception 'sandbox_tester_exact_confirmed_subject_required';
  end if;
  return new;
end;
$$;

drop trigger if exists "enforce_sandbox_tester_exact_subject"
  on public."sandbox_monetization_testers";
create trigger "enforce_sandbox_tester_exact_subject"
before insert or update of "email", "user_id", "status", "expires_at"
on public."sandbox_monetization_testers"
for each row execute function public."enforce_sandbox_tester_exact_subject_internal"();

drop policy if exists "sandbox_money_tester_self_select"
  on public."sandbox_monetization_testers";
create policy "sandbox_money_tester_self_select"
  on public."sandbox_monetization_testers"
  for select to authenticated
  using (
    "status" = 'active'
    and ("expires_at" is null or "expires_at" > timezone('utc'::text, now()))
    and public."platform_exact_current_session_subject"("user_id")
  );

revoke all on table public."sandbox_monetization_testers" from anon, authenticated;
grant select on table public."sandbox_monetization_testers" to authenticated;

create or replace function public."resolve_sandbox_monetization_tester"(
  p_user_id text default null,
  p_email text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."platform_exact_current_session_authority_internal"()
    and (
      public."has_platform_role"(array['owner'::text, 'operator'::text])
      or public."has_active_beta_access"()
      or exists (
        select 1
        from public."sandbox_monetization_testers" tester
        where tester."status" = 'active'
          and tester."user_id" = auth.uid()::text
          and (tester."expires_at" is null
            or tester."expires_at" > timezone('utc'::text, now()))
      )
    );
$$;

create or replace function public."grant_sandbox_monetization_tester"(
  p_email text default null,
  p_user_id text default null,
  p_expires_at timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := auth.uid()::text;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_requested_user_id text := nullif(trim(coalesce(p_user_id, '')), '');
  v_target_user_id uuid;
  v_subject_email text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_row public."sandbox_monetization_testers"%rowtype;
begin
  if not public."has_platform_role"(array['owner'::text, 'operator'::text]) then
    raise exception 'owner_operator_required';
  end if;
  if v_requested_user_id is null and v_email is null then
    raise exception 'tester_identity_required';
  end if;
  if p_expires_at is not null and p_expires_at <= timezone('utc'::text, now()) then
    raise exception 'tester_expiry_invalid';
  end if;
  if v_note is not null and v_note ~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|authorization)' then
    raise exception 'unsafe_note';
  end if;

  if v_requested_user_id is not null then
    begin
      v_target_user_id := v_requested_user_id::uuid;
    exception when others then
      raise exception 'platform_exact_confirmed_subject_required';
    end;
    select lower(trim(subject.email)) into v_subject_email
    from auth.users subject
    where subject.id = v_target_user_id
      and subject.email_confirmed_at is not null
      and subject.deleted_at is null;
    if not found then raise exception 'platform_exact_confirmed_subject_required'; end if;
    if v_email is not null and v_email is distinct from v_subject_email then
      raise exception 'sandbox_tester_subject_conflict';
    end if;
    v_email := coalesce(v_email, v_subject_email);
  else
    v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
      v_email
    );
    select lower(trim(subject.email)) into v_subject_email
    from auth.users subject where subject.id = v_target_user_id;
    v_email := v_subject_email;
  end if;

  if public."is_account_access_restricted"(v_target_user_id::text) then
    raise exception 'target_not_active';
  end if;
  if exists (
    select 1 from public."sandbox_monetization_testers" tester
    where tester."status" = 'active'
      and tester."email" = v_email
      and tester."user_id" is distinct from v_target_user_id::text
  ) then
    raise exception 'sandbox_tester_subject_conflict';
  end if;

  update public."sandbox_monetization_testers"
  set "status" = 'revoked',
      "revoked_at" = timezone('utc'::text, now())
  where "status" = 'active'
    and "user_id" = v_target_user_id::text;

  insert into public."sandbox_monetization_testers" (
    "user_id", "email", "status", "note", "expires_at", "created_by"
  ) values (
    v_target_user_id::text, v_email, 'active', v_note, p_expires_at, v_actor
  ) returning * into v_row;

  return jsonb_build_object(
    'id', v_row."id", 'userId', v_row."user_id", 'email', v_row."email",
    'status', v_row."status", 'expiresAt', v_row."expires_at",
    'createdAt', v_row."created_at", 'sandboxOnly', true,
    'notPayable', true, 'ownerRoleGranted', false,
    'payoutAccessGranted', false
  );
end;
$$;

create or replace function public."revoke_sandbox_monetization_tester"(
  p_id uuid default null,
  p_email text default null,
  p_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_user_id text := nullif(trim(coalesce(p_user_id, '')), '');
  v_target_user_id uuid;
  v_count integer := 0;
begin
  if not public."has_platform_role"(array['owner'::text, 'operator'::text]) then
    raise exception 'owner_operator_required';
  end if;
  if p_id is null and v_email is null and v_user_id is null then
    raise exception 'tester_identity_required';
  end if;

  if p_id is not null then
    select tester."user_id"::uuid into v_target_user_id
    from public."sandbox_monetization_testers" tester
    where tester."id" = p_id;
  elsif v_user_id is not null then
    begin v_target_user_id := v_user_id::uuid;
    exception when others then raise exception 'platform_exact_confirmed_subject_required'; end;
  else
    v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
      v_email
    );
  end if;
  if v_target_user_id is null then raise exception 'tester_identity_required'; end if;

  update public."sandbox_monetization_testers"
  set "status" = 'revoked',
      "revoked_at" = timezone('utc'::text, now())
  where "status" = 'active'
    and "user_id" = v_target_user_id::text
    and (p_id is null or "id" = p_id);
  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'revokedCount', v_count, 'status', 'revoked', 'sandboxOnly', true,
    'ownerRoleGranted', false, 'payoutAccessGranted', false
  );
end;
$$;

-- Exact execution ACLs. Internal helpers and triggers are never callable by
-- API roles; compatibility APIs retain only their intended callers.
revoke all on function public."platform_exact_current_session_authority_internal"()
  from public, anon, authenticated, service_role;
revoke all on function public."platform_exact_current_session_subject"(text)
  from public, anon, authenticated, service_role;
grant execute on function public."platform_exact_current_session_subject"(text)
  to authenticated, service_role;
revoke all on function public."platform_resolve_exact_confirmed_subject_by_email_internal"(text)
  from public, anon, authenticated, service_role;
revoke all on function public."platform_subject_has_role_internal"(text, text[])
  from public, anon, authenticated, service_role;
revoke all on function public."enforce_platform_role_exact_subject_internal"()
  from public, anon, authenticated, service_role;
revoke all on function public."enforce_platform_staff_permission_exact_subject_internal"()
  from public, anon, authenticated, service_role;
revoke all on function public."enforce_beta_active_exact_subject_internal"()
  from public, anon, authenticated, service_role;
revoke all on function public."enforce_sandbox_tester_exact_subject_internal"()
  from public, anon, authenticated, service_role;
revoke all on function public."platform_first_owner_marker_guard"()
  from public, anon, authenticated, service_role;
revoke all on function public."enforce_platform_break_glass_exact_subject_internal"()
  from public, anon, authenticated, service_role;
revoke all on function public."first_owner_active_marker"()
  from public, anon, authenticated, service_role;
revoke all on function public."admin_grant_platform_role_by_email_pre_exact_subject_closure"(text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."platform_staff_target_has_role"(text,text[])
  from public, anon, authenticated, service_role;

revoke all on function public."has_platform_role"(text[])
  from public, anon, authenticated, service_role;
grant execute on function public."has_platform_role"(text[])
  to authenticated, service_role;
revoke all on function public."is_platform_owner_user"(text)
  from public, anon, authenticated, service_role;
grant execute on function public."is_platform_owner_user"(text)
  to anon, authenticated, service_role;
revoke all on function public."has_platform_permission"(text)
  from public, anon, authenticated, service_role;
grant execute on function public."has_platform_permission"(text)
  to authenticated, service_role;
revoke all on function public."cognitive_can_read_scope"(uuid,uuid,public.cognitive_platform)
  from public, anon, authenticated, service_role;
grant execute on function public."cognitive_can_read_scope"(uuid,uuid,public.cognitive_platform)
  to authenticated, service_role;
revoke all on function public."autonomous_actor_authority_role"(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."autonomous_actor_has_owner_authority"(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public."autonomous_actor_authority_role"(text,text)
  to service_role;
grant execute on function public."autonomous_actor_has_owner_authority"(text,text)
  to service_role;

revoke all on function public."admin_grant_platform_role_by_email"(text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."admin_revoke_platform_role_by_email"(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public."admin_grant_platform_role_by_email"(text,text,text)
  to authenticated, service_role;
grant execute on function public."admin_revoke_platform_role_by_email"(text,text,text)
  to authenticated, service_role;

revoke all on function public."admin_grant_platform_staff_permission_by_email"(text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public."admin_revoke_platform_staff_permission_by_email"(text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."read_my_platform_staff_permission_keys"()
  from public, anon, authenticated, service_role;
revoke all on function public."admin_update_platform_staff_permissions_by_email"(text,text[],text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public."list_staff_scoped_permissions_by_email"(text)
  from public, anon, authenticated, service_role;
grant execute on function public."admin_grant_platform_staff_permission_by_email"(text,text,text,timestamptz)
  to authenticated, service_role;
grant execute on function public."admin_revoke_platform_staff_permission_by_email"(text,text,text)
  to authenticated, service_role;
grant execute on function public."read_my_platform_staff_permission_keys"()
  to authenticated, service_role;
grant execute on function public."admin_update_platform_staff_permissions_by_email"(text,text[],text,timestamptz)
  to authenticated, service_role;
grant execute on function public."list_staff_scoped_permissions_by_email"(text)
  to authenticated, service_role;

revoke all on function public."is_first_owner"(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."platform_first_owner_only_break_glass"(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."first_owner_grant_owner_by_email"(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."first_owner_revoke_owner_by_email"(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."first_owner_create_self_step_down_challenge"(text,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public."first_owner_complete_self_step_down"(uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."first_owner_authority_status"()
  from public, anon, authenticated, service_role;
revoke all on function public."platform_current_break_glass_session_id"(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."platform_break_glass_active_for_actor"(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."platform_first_owner_write_audit"(text,text,text,text,text,text,bigint,text,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public."is_first_owner"(text,text)
  to authenticated, service_role;
grant execute on function public."platform_first_owner_only_break_glass"(text,text)
  to authenticated, service_role;
grant execute on function public."first_owner_grant_owner_by_email"(text,text)
  to authenticated, service_role;
grant execute on function public."first_owner_revoke_owner_by_email"(text,text)
  to authenticated, service_role;
grant execute on function public."first_owner_create_self_step_down_challenge"(text,text,text,text,timestamptz)
  to authenticated, service_role;
grant execute on function public."first_owner_complete_self_step_down"(uuid,text,text,text)
  to authenticated, service_role;
grant execute on function public."first_owner_authority_status"()
  to authenticated, service_role;
grant execute on function public."platform_current_break_glass_session_id"(text,text)
  to service_role;
grant execute on function public."platform_break_glass_active_for_actor"(text,text)
  to service_role;
grant execute on function public."platform_first_owner_write_audit"(text,text,text,text,text,text,bigint,text,text,jsonb)
  to service_role;

revoke all on function public."has_active_beta_access"()
  from public, anon, authenticated, service_role;
revoke all on function public."activate_beta_membership"()
  from public, anon, authenticated, service_role;
revoke all on function public."acknowledge_beta_onboarding"()
  from public, anon, authenticated, service_role;
grant execute on function public."has_active_beta_access"()
  to authenticated, service_role;
grant execute on function public."activate_beta_membership"()
  to authenticated, service_role;
grant execute on function public."acknowledge_beta_onboarding"()
  to authenticated, service_role;

revoke all on function public."resolve_sandbox_monetization_tester"(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public."grant_sandbox_monetization_tester"(text,text,timestamptz,text)
  from public, anon, authenticated, service_role;
revoke all on function public."revoke_sandbox_monetization_tester"(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public."resolve_sandbox_monetization_tester"(text,text)
  to authenticated, service_role;
grant execute on function public."grant_sandbox_monetization_tester"(text,text,timestamptz,text)
  to authenticated, service_role;
grant execute on function public."revoke_sandbox_monetization_tester"(uuid,text,text)
  to authenticated, service_role;
