-- Close the retained-session time-box gap at the shared authority root.
--
-- Supabase may retain an auth.sessions row after its optional not_after cutoff
-- while an access token is still cryptographically valid.  Row existence alone
-- is therefore insufficient for privileged current-session authority.  A null
-- not_after remains the provider's canonical "no explicit time-box" state;
-- otherwise the database clock must still be strictly before the cutoff.
create or replace function public."wave1_session_authority_readback"()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_generation text := nullif(auth.jwt() ->> 'session_id', '');
  v_state text;
  v_scheduled boolean;
  v_session_active boolean;
begin
  if v_user is null then
    raise exception 'auth_required';
  end if;
  if v_generation is null then
    raise exception 'session_generation_required';
  end if;

  select exists (
    select 1
    from auth.sessions session_row
    where session_row.id::text = v_generation
      and session_row.user_id = v_user
      and (
        session_row.not_after is null
        or session_row.not_after > now()
      )
  )
  into v_session_active;

  v_scheduled := public."is_account_deletion_scheduled"(v_user::text);
  v_state := case
    when not v_session_active
      or (
        public."is_account_access_restricted"(v_user::text)
        and not v_scheduled
      )
      then 'TERMINATED'
    else 'ACTIVE'
  end;

  return jsonb_build_object(
    'authoritative', true,
    'userId', v_user,
    'accountId', v_user,
    'sessionGeneration', v_generation,
    'state', v_state,
    'restoreOnly', v_scheduled,
    'observedAt', timezone('utc'::text, now())
  );
end;
$$;

revoke all on function public."wave1_session_authority_readback"()
from public, anon, authenticated, service_role;

grant execute on function public."wave1_session_authority_readback"()
to authenticated;
