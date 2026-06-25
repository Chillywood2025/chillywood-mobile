-- Reporting moderation duplicate guard.
-- Blocks exact repeat reports from the same authenticated reporter against the
-- same target/category inside a short window. This complements the existing
-- abuse rate-limit trigger without auto-hiding, deleting, or notifying targets.

create or replace function public."enforce_safety_reports_duplicate_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval := interval '10 minutes';
begin
  if auth.uid() is null then
    raise exception 'safety_report_auth_required';
  end if;

  if exists (
    select 1
    from public."safety_reports" existing
    where existing."reporter_user_id" = new."reporter_user_id"
      and existing."target_type" = new."target_type"
      and existing."target_id" = new."target_id"
      and existing."category" = new."category"
      and existing."created_at" >= timezone('utc'::text, now()) - v_window
      and existing."status" in ('needs_review', 'reviewing', 'escalated')
    limit 1
  ) then
    raise exception 'safety_report_duplicate_window';
  end if;

  return new;
end;
$$;

drop trigger if exists "enforce_safety_reports_duplicate_guard" on public."safety_reports";
create trigger "enforce_safety_reports_duplicate_guard"
  before insert on public."safety_reports"
  for each row execute function public."enforce_safety_reports_duplicate_guard"();

revoke all on function public."enforce_safety_reports_duplicate_guard"() from public;

comment on function public."enforce_safety_reports_duplicate_guard"() is
  'Blocks exact duplicate safety reports from the same authenticated reporter against the same target/category in a short window. Does not expose reporter identity or mutate target content.';
