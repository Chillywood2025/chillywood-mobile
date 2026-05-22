create or replace function public."list_staff_scoped_permissions_by_email"(
  p_target_email text
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_role text := public.platform_staff_actor_role();
  v_actor_email text := public.platform_staff_normalize_email(auth.jwt() ->> 'email');
  v_target_email text := public.platform_staff_normalize_email(p_target_email);
  v_permissions text[];
begin
  if auth.uid() is null then
    raise exception 'platform_staff_auth_required';
  end if;

  if v_target_email is null then
    raise exception 'platform_staff_email_required';
  end if;

  if v_actor_role is null then
    raise exception 'platform_staff_permission_denied';
  end if;

  if v_actor_role <> 'owner' and v_target_email <> v_actor_email then
    raise exception 'platform_staff_permission_owner_required';
  end if;

  select coalesce(array_agg(distinct grant_row."permission_key" order by grant_row."permission_key"), array[]::text[])
  into v_permissions
  from public."platform_staff_permission_grants" grant_row
  where grant_row."status" = 'active'
    and lower(grant_row."target_email") = v_target_email
    and (
      grant_row."expires_at" is null
      or grant_row."expires_at" > timezone('utc'::text, now())
    );

  return coalesce(v_permissions, array[]::text[]);
end;
$$;

revoke all on function public."list_staff_scoped_permissions_by_email"(text) from public;
grant execute on function public."list_staff_scoped_permissions_by_email"(text) to authenticated;

comment on function public."list_staff_scoped_permissions_by_email"(text) is
  'Returns active scoped staff permission keys for owner-managed staff detail views; unauthenticated and non-staff callers fail closed.';
