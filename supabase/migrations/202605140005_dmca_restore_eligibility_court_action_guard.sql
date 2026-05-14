-- Prevent Admin restore eligibility from being recorded on a counter-notice
-- that has already been blocked by a court-action notice.

create or replace function public."admin_dmca_mark_restore_eligible"(
  p_case_id uuid,
  p_counter_notice_id uuid,
  p_reason text
)
returns public."dmca_cases"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public."dmca_cases";
  v_counter public."dmca_counter_notices";
begin
  perform public."dmca_assert_owner_operator"();

  select *
    into v_counter
  from public."dmca_counter_notices"
  where "id" = p_counter_notice_id
    and "dmca_case_id" = p_case_id;

  if v_counter."id" is null then
    raise exception 'counter_notice_not_found';
  end if;

  if v_counter."status" = 'blocked_by_court_action'
    or v_counter."court_action_notice_received_at" is not null
  then
    raise exception 'dmca_restore_blocked_by_court_action';
  end if;

  update public."dmca_counter_notices"
    set "status" = 'eligible_for_restore',
        "updated_at" = timezone('utc'::text, now())
    where "id" = p_counter_notice_id
      and "dmca_case_id" = p_case_id;

  update public."dmca_cases"
    set "status" = 'eligible_for_restore',
        "updated_at" = timezone('utc'::text, now())
    where "id" = p_case_id
  returning * into v_case;

  if v_case."id" is null then
    raise exception 'dmca_case_not_found';
  end if;

  perform public."dmca_write_audit"(
    p_case_id,
    'restore_eligible',
    'admin',
    p_reason,
    jsonb_build_object('counter_notice_id', p_counter_notice_id)
  );

  return v_case;
end;
$$;

grant execute on function public."admin_dmca_mark_restore_eligible"(uuid, uuid, text) to "authenticated";
