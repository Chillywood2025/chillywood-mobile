-- Keep one mutable open typed observability finding per platform/condition.
-- Older duplicates are retained as superseded audit evidence; nothing is deleted.

do $dedupe_observability_findings$
declare
  table_name text;
  index_name text;
begin
  foreach table_name in array array[
    'crash_cluster_findings',
    'js_error_findings',
    'performance_regression_findings',
    'analytics_delivery_findings',
    'release_health_findings',
    'backend_error_rate_findings',
    'observability_required_review_flags'
  ] loop
    execute format($sql$
      with ranked as (
        select id,
          row_number() over (
            partition by system_id, platform, flag_type, coalesce(target_id, '')
            order by updated_at desc, created_at desc, id desc
          ) as duplicate_rank
        from public.%I
        where review_status = 'open'
      )
      update public.%I finding
      set review_status = 'superseded', updated_at = timezone('utc'::text, now())
      from ranked
      where finding.id = ranked.id and ranked.duplicate_rank > 1
    $sql$, table_name, table_name);

    index_name := 'observability_open_' || substr(md5(table_name), 1, 12) || '_uidx';
    execute format(
      'create unique index if not exists %I on public.%I (system_id, platform, flag_type, coalesce(target_id, '''')) where review_status = ''open''',
      index_name,
      table_name
    );
  end loop;
end;
$dedupe_observability_findings$;
