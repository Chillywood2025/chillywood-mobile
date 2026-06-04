create or replace function public."has_access_grant"(
  p_grant_type text,
  p_source_id uuid,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_status text := 'missing';
  v_environment text := null;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'status', 'missing', 'reason', 'auth_required');
  end if;

  select grant_row."status", grant_row."environment"
    into v_status, v_environment
  from public."access_grants" grant_row
  where grant_row."user_id" = v_user_id
    and grant_row."grant_type" = p_grant_type
    and (p_source_id is null or grant_row."source_id" = p_source_id)
    and (
      (grant_row."status" = 'active' and grant_row."environment" = 'production')
      or (grant_row."status" = 'sandbox_only' and grant_row."environment" = 'sandbox')
    )
    and grant_row."starts_at" <= timezone('utc'::text, now())
    and (grant_row."expires_at" is null or grant_row."expires_at" > timezone('utc'::text, now()))
    and grant_row."refunded_at" is null
    and grant_row."revoked_at" is null
  order by grant_row."created_at" desc
  limit 1;

  if v_status in ('active', 'sandbox_only') then
    return jsonb_build_object(
      'allowed', true,
      'status', v_status,
      'environment', v_environment,
      'reason', case when v_status = 'sandbox_only' then 'sandbox_grant' else 'active_grant' end
    );
  end if;

  return jsonb_build_object('allowed', false, 'status', coalesce(v_status, 'missing'), 'reason', 'grant_required');
end;
$$;

comment on function public."has_access_grant"(text, uuid, uuid) is
  'Resolves production active grants and real sandbox-only grants for monetization proof. Sandbox grants remain not payable and do not grant LiveKit publish/host/speaker/admin authority.';
