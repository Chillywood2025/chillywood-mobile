-- Test/proof DMCA hygiene.
-- Existing proof/demo cases stay available in dev for verification, but production
-- clients filter them out and canary checks flag any unmarked proof rows.

alter table if exists public."dmca_cases"
  add column if not exists "is_test_case" boolean not null default false;

create index if not exists "dmca_cases_is_test_case_idx"
  on public."dmca_cases" ("is_test_case", "updated_at" desc);

create or replace function public."dmca_detect_test_case"(
  p_reporter_name text,
  p_reporter_email text,
  p_source text default null
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(p_reporter_name, '')) like '%proof%'
    or lower(coalesce(p_reporter_name, '')) like '%demo%'
    or lower(coalesce(p_reporter_name, '')) like '%canary%'
    or lower(coalesce(p_reporter_email, '')) like '%proof%'
    or lower(coalesce(p_reporter_email, '')) like '%demo%'
    or lower(coalesce(p_reporter_email, '')) like '%canary%'
    or lower(coalesce(p_reporter_email, '')) like 'liveops.proof+%'
    or lower(coalesce(p_source, '')) = 'test';
$$;

create or replace function public."dmca_apply_test_case_marker"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public."dmca_detect_test_case"(new."reporter_name", new."reporter_email", new."source") then
    new."is_test_case" := true;
  end if;
  return new;
end;
$$;

drop trigger if exists "dmca_cases_apply_test_case_marker" on public."dmca_cases";
create trigger "dmca_cases_apply_test_case_marker"
  before insert or update of "reporter_name", "reporter_email", "source", "is_test_case"
  on public."dmca_cases"
  for each row
  execute function public."dmca_apply_test_case_marker"();

update public."dmca_cases"
set
  "is_test_case" = true,
  "admin_notes" = trim(both from concat(coalesce("admin_notes", ''), case when coalesce("admin_notes", '') = '' then '' else E'\n' end, 'DEV/TEST proof case marked test-only for production DMCA hygiene.')),
  "updated_at" = timezone('utc'::text, now())
where public."dmca_detect_test_case"("reporter_name", "reporter_email", "source");

comment on column public."dmca_cases"."is_test_case" is
  'Marks proof/demo/canary DMCA rows so production clients hide them while dev tools can verify them explicitly.';
