-- Reports client insert guard.
-- Keeps public/authenticated report intake from setting admin workflow fields while
-- still deriving conservative severity for backed Critical filtering.

create or replace function public."admin_reports_classify_severity"(
  p_category text,
  p_note text,
  p_context jsonb default '{}'::jsonb
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(trim(coalesce(p_category, ''))) = 'safety'
      and coalesce(p_note, '') ~* '(child|minor|self[- ]?harm|suicide|violence|violent|threat|weapon)'
      then 'critical'
    when lower(trim(coalesce(p_category, ''))) in ('abuse', 'harassment')
      then 'high'
    when lower(trim(coalesce(p_category, ''))) = 'safety'
      and coalesce(p_note, '') ~* '(scam|fraud|malware|illegal|spam)'
      then 'medium'
    when lower(trim(coalesce(p_category, ''))) in ('copyright', 'impersonation')
      then 'medium'
    when lower(trim(coalesce(p_category, ''))) = 'other'
      and coalesce(p_context->>'sourceSurface', '') in ('player', 'profile', 'title-detail')
      then 'unknown'
    else 'unknown'
  end;
$$;

create or replace function public."enforce_safety_reports_client_insert_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new."severity" = public."admin_reports_classify_severity"(
      new."category",
      new."note",
      coalesce(new."context", '{}'::jsonb)
    );
    new."status" = 'needs_review';
    new."resolution_type" = null;
    new."resolution_reason" = null;
    new."resolved_by" = null;
    new."resolved_at" = null;
    new."escalated_at" = null;
    new."actioned_at" = null;
  end if;

  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "enforce_safety_reports_client_insert_guard" on public."safety_reports";
create trigger "enforce_safety_reports_client_insert_guard"
  before insert on public."safety_reports"
  for each row execute function public."enforce_safety_reports_client_insert_guard"();

revoke insert on table public."safety_reports" from authenticated;
grant insert (
  "reporter_user_id",
  "target_type",
  "target_id",
  "category",
  "note",
  "room_id",
  "title_id",
  "context"
) on table public."safety_reports" to authenticated;

revoke all on function public."admin_reports_classify_severity"(text, text, jsonb) from public;
revoke all on function public."enforce_safety_reports_client_insert_guard"() from public;

comment on function public."enforce_safety_reports_client_insert_guard"() is
  'For authenticated public report intake, derives severity and clears admin workflow fields before insert.';
