-- Installed Product QA Firebase Test Lab source classification.
-- Firebase Test Lab uploads an APK/AAB artifact into Google's lab. It is a
-- device-lab proof source, not a Play-installed app proof source.

do $$
declare
  source_values constant text := '''play_installed'', ''browserstack'', ''firebase_test_lab_uploaded_artifact'', ''local_fixture'', ''manual_codex_proof''';
begin
  alter table public.installed_qa_operator_events
    drop constraint if exists installed_qa_operator_events_source_check;
  execute 'alter table public.installed_qa_operator_events add constraint installed_qa_operator_events_source_check check (source in (' || source_values || '))';

  alter table public.installed_traversal_runs
    drop constraint if exists installed_traversal_runs_source_check;
  execute 'alter table public.installed_traversal_runs add constraint installed_traversal_runs_source_check check (source in (' || source_values || '))';

  alter table public.route_behavior_findings
    drop constraint if exists route_behavior_findings_source_check;
  execute 'alter table public.route_behavior_findings add constraint route_behavior_findings_source_check check (source in (' || source_values || '))';

  alter table public.role_behavior_findings
    drop constraint if exists role_behavior_findings_source_check;
  execute 'alter table public.role_behavior_findings add constraint role_behavior_findings_source_check check (source in (' || source_values || '))';

  alter table public.account_fixture_health_findings
    drop constraint if exists account_fixture_health_findings_source_check;
  execute 'alter table public.account_fixture_health_findings add constraint account_fixture_health_findings_source_check check (source in (' || source_values || '))';

  alter table public.device_availability_findings
    drop constraint if exists device_availability_findings_source_check;
  execute 'alter table public.device_availability_findings add constraint device_availability_findings_source_check check (source in (' || source_values || '))';

  alter table public.qa_required_review_flags
    drop constraint if exists qa_required_review_flags_source_check;
  execute 'alter table public.qa_required_review_flags add constraint qa_required_review_flags_source_check check (source in (' || source_values || '))';
end $$;
