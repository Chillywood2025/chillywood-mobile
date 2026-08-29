-- Recover only a legacy bootstrap Owner that was quarantined by the immutable-
-- subject closure after its auth account already existed. Runtime authority
-- remains bound exclusively to the immutable auth.users.id; email is used only
-- by this one-time migration to prove the historical bootstrap row corresponds
-- to exactly one confirmed, non-deleted auth subject.

do $$
declare
  v_candidate_count integer := 0;
  v_membership_id bigint;
  v_subject_id uuid;
  v_target_email text;
begin
  select count(*)
  into v_candidate_count
  from public.platform_role_memberships membership
  where membership.role = 'owner'
    and membership.status = 'revoked'
    and nullif(trim(coalesce(membership.user_id, '')), '') is null
    and membership.granted_by = 'system-bootstrap'
    and membership.revoked_by = 'platform-exact-subject-closure'
    and nullif(lower(trim(coalesce(membership.email, ''))), '') is not null
    and (
      select count(*)
      from auth.users subject
      where lower(trim(subject.email)) = lower(trim(membership.email))
        and subject.email_confirmed_at is not null
        and subject.deleted_at is null
    ) = 1;

  if v_candidate_count > 1 then
    raise exception 'bootstrap_owner_exact_subject_recovery_ambiguous';
  end if;

  if v_candidate_count = 0 then
    return;
  end if;

  select
    membership.id,
    subject.id,
    lower(trim(membership.email))
  into
    v_membership_id,
    v_subject_id,
    v_target_email
  from public.platform_role_memberships membership
  join auth.users subject
    on lower(trim(subject.email)) = lower(trim(membership.email))
   and subject.email_confirmed_at is not null
   and subject.deleted_at is null
  where membership.role = 'owner'
    and membership.status = 'revoked'
    and nullif(trim(coalesce(membership.user_id, '')), '') is null
    and membership.granted_by = 'system-bootstrap'
    and membership.revoked_by = 'platform-exact-subject-closure'
  limit 1;

  if exists (
    select 1
    from public.platform_role_memberships existing
    where existing.user_id = v_subject_id::text
      and existing.status = 'active'
      and existing.role = 'owner'
      and (existing.expires_at is null or existing.expires_at > timezone('utc'::text, now()))
  ) then
    return;
  end if;

  update public.platform_role_memberships membership
  set user_id = v_subject_id::text,
      status = 'active',
      revoked_by = null,
      revoked_at = null,
      updated_at = timezone('utc'::text, now())
  where membership.id = v_membership_id
    and membership.status = 'revoked'
    and nullif(trim(coalesce(membership.user_id, '')), '') is null
    and membership.revoked_by = 'platform-exact-subject-closure';

  if not found then
    raise exception 'bootstrap_owner_exact_subject_recovery_raced';
  end if;

  insert into public.platform_staff_role_audit (
    actor_user_id,
    actor_role,
    target_user_id,
    target_email,
    action,
    role,
    reason,
    metadata
  ) values (
    'system-migration',
    'system',
    v_subject_id::text,
    v_target_email,
    'bootstrap',
    'owner',
    'Bind the quarantined historical bootstrap Owner to its unique confirmed immutable auth subject.',
    jsonb_build_object(
      'membership_id', v_membership_id,
      'recovery', 'bootstrap_owner_exact_subject',
      'runtime_email_authority', false,
      'source_revocation', 'platform-exact-subject-closure'
    )
  );
end
$$;
