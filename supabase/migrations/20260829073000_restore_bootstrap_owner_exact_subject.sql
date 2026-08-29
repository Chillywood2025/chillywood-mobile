-- Recover only the historical bootstrap Owner membership that was quarantined
-- by immutable-subject closure after its auth account already existed. Runtime
-- authority remains bound exclusively to auth.users.id; the stored legacy email
-- is used only inside this one-time migration to prove a unique confirmed auth
-- subject. No email-based runtime authority is restored.

do $$
declare
  v_membership_id constant bigint := 10;
  v_subject_id uuid;
  v_target_email text;
  v_subject_count integer := 0;
begin
  select lower(trim(membership.email))
  into v_target_email
  from public.platform_role_memberships membership
  where membership.id = v_membership_id
    and membership.role = 'owner'
    and membership.status = 'revoked'
    and nullif(trim(coalesce(membership.user_id, '')), '') is null
    and membership.granted_by = 'system-bootstrap'
    and membership.revoked_by = 'platform-exact-subject-closure'
    and nullif(lower(trim(coalesce(membership.email, ''))), '') is not null;

  if v_target_email is null then
    return;
  end if;

  select count(*), min(subject.id)
  into v_subject_count, v_subject_id
  from auth.users subject
  where lower(trim(subject.email)) = v_target_email
    and subject.email_confirmed_at is not null
    and subject.deleted_at is null;

  if v_subject_count <> 1 or v_subject_id is null then
    raise exception 'bootstrap_owner_exact_subject_recovery_requires_one_confirmed_subject';
  end if;

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
    and membership.role = 'owner'
    and membership.status = 'revoked'
    and nullif(trim(coalesce(membership.user_id, '')), '') is null
    and membership.granted_by = 'system-bootstrap'
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
