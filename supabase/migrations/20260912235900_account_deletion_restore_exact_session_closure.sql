-- Keep scheduled-deletion recovery available to restore-only sessions while
-- rejecting rotated, expired, wrong-account, and otherwise non-current JWTs.

create or replace function public.restore_scheduled_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  session_generation text := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '');
  session_authority jsonb;
  restored_deletion public."account_deletion_requests"%rowtype;
  now_utc timestamptz := timezone('utc'::text, now());
begin
  if auth.role() <> 'authenticated'
    or requesting_user_id is null
    or session_generation is null
  then
    raise exception 'exact_current_session_required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from auth."sessions" session_row
    where session_row."id"::text = session_generation
      and session_row."user_id" = requesting_user_id
      and (
        session_row."not_after" is null
        or session_row."not_after" > now()
      )
  ) then
    raise exception 'exact_current_session_required' using errcode = '28000';
  end if;

  session_authority := public."wave1_session_authority_readback"();
  if coalesce((session_authority ->> 'authoritative')::boolean, false) is false
    or session_authority ->> 'state' <> 'ACTIVE'
    or nullif(session_authority ->> 'userId', '') <> requesting_user_id::text
    or nullif(session_authority ->> 'accountId', '') <> requesting_user_id::text
    or nullif(session_authority ->> 'sessionGeneration', '') <> session_generation
  then
    raise exception 'exact_current_session_required' using errcode = '28000';
  end if;

  -- restoreOnly is deliberately accepted here: this RPC is the sole recovery
  -- action available while a scheduled deletion quarantines the account.
  update public."account_deletion_requests"
  set
    "status" = 'restored',
    "restored_at" = now_utc,
    "updated_at" = now_utc,
    "metadata" = coalesce("metadata", '{}'::jsonb)
      || jsonb_build_object('restoredFromSettings', true)
  where "id" = (
    select "id"
    from public."account_deletion_requests"
    where "user_id" = requesting_user_id
      and "status" = 'scheduled'
      and coalesce("restore_deadline", "delete_after") > now_utc
    order by "requested_at" desc
    limit 1
  )
  returning * into restored_deletion;

  if restored_deletion."id" is null then
    return jsonb_build_object(
      'status', 'active',
      'restored', false,
      'message', 'No scheduled deletion found.'
    );
  end if;

  return jsonb_build_object(
    'id', restored_deletion."id",
    'status', restored_deletion."status",
    'restored', true,
    'message', 'Account deletion canceled.'
  );
end;
$$;

revoke all on function public.restore_scheduled_account_deletion() from public, anon;
grant execute on function public.restore_scheduled_account_deletion() to authenticated;

comment on function public.restore_scheduled_account_deletion() is
  'Restore a scheduled deletion only for the exact current authenticated session, including its intentional restore-only state.';
