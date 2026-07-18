-- Firebase Test Lab is an Android-only proof source. Older host adapters did
-- not send platform explicitly, so the operator truthfully stored `unknown`.
-- Backfill only rows whose source proves Android and prevent recurrence.

update public.installed_traversal_runs
set platform = 'android'
where platform = 'unknown'
  and source = 'firebase_test_lab_uploaded_artifact';

update public.installed_qa_operator_events
set platform = 'android'
where platform = 'unknown'
  and source = 'firebase_test_lab_uploaded_artifact';

update public.device_availability_findings
set platform = 'android',
    updated_at = now()
where platform = 'unknown'
  and source = 'firebase_test_lab_uploaded_artifact';

update public.qa_required_review_flags
set platform = 'android',
    updated_at = now()
where platform = 'unknown'
  and source = 'firebase_test_lab_uploaded_artifact';

do $$
declare
  target_table regclass;
  constraint_name text;
begin
  foreach target_table in array array[
    'public.installed_traversal_runs'::regclass,
    'public.installed_qa_operator_events'::regclass,
    'public.device_availability_findings'::regclass,
    'public.qa_required_review_flags'::regclass
  ] loop
    constraint_name := replace(target_table::text, '.', '_') || '_firebase_test_lab_android_check';
    if not exists (
      select 1
      from pg_constraint
      where conrelid = target_table
        and conname = constraint_name
    ) then
      execute format(
        'alter table %s add constraint %I check (coalesce(source, '''') <> ''firebase_test_lab_uploaded_artifact'' or platform = ''android'') not valid',
        target_table,
        constraint_name
      );
      execute format('alter table %s validate constraint %I', target_table, constraint_name);
    end if;
  end loop;
end
$$;
