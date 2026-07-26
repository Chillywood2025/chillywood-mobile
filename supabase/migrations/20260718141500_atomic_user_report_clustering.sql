-- Make User Report Router clustering and duplicate-reporter accounting atomic.
-- The Edge Function still authenticates and sanitizes intake. This service-only
-- RPC owns the race-sensitive cluster/member/count transition in one transaction.

create or replace function public.upsert_user_report_cluster_membership(
  p_report_id uuid,
  p_reporter_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.user_report_intake_events%rowtype;
  v_classification public.user_report_classifications%rowtype;
  v_cluster public.user_report_clusters%rowtype;
  v_member_count integer;
  v_unique_reporters integer;
  v_report_count integer;
  v_duplicate boolean;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_reporter_hash is null or p_reporter_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_reporter_hash';
  end if;

  select report.* into v_report
  from public.user_report_intake_events report
  where report.id = p_report_id
  for update;
  if not found then raise exception 'report_not_found'; end if;

  select classification.* into v_classification
  from public.user_report_classifications classification
  where classification.report_id = p_report_id
  order by classification.created_at desc
  limit 1;
  if not found then raise exception 'classification_required'; end if;
  if v_classification.platform <> v_report.platform
    or v_classification.report_type <> v_report.report_type
    or v_classification.category <> v_report.category then
    raise exception 'classification_scope_mismatch';
  end if;

  if v_report.report_status in ('clustered', 'routed', 'review_required', 'spam', 'closed') then
    select cluster.* into v_cluster
    from public.user_report_clusters cluster
    where cluster.platform = v_report.platform
      and cluster.normalized_fingerprint = v_report.normalized_fingerprint;
    if not found then raise exception 'cluster_missing_for_processed_report'; end if;
    return jsonb_build_object(
      'cluster', to_jsonb(v_cluster),
      'duplicateFlag', v_report.duplicate_flag,
      'idempotentReplay', true
    );
  end if;
  if v_report.report_status <> 'classified' then raise exception 'report_not_classified'; end if;

  insert into public.user_report_clusters (
    platform, normalized_fingerprint, report_type, category, severity,
    surface, route, target_type, target_id_hash, text_summary_redacted,
    unique_reporter_count, report_count, first_seen_at, last_seen_at,
    cluster_status, routed_system_id, action_status, spam_flag, metadata
  ) values (
    v_report.platform, v_report.normalized_fingerprint, v_report.report_type,
    v_report.category, v_report.severity, v_report.surface, v_report.route,
    v_report.target_type, v_report.target_id_hash, v_report.text_summary_redacted,
    0, 0, v_now, v_now,
    case when v_report.spam_flag then 'spam' else 'open' end,
    v_classification.routed_system_id, 'threshold_pending', v_report.spam_flag,
    '{"source":"user_report_intake"}'::jsonb
  )
  on conflict (platform, normalized_fingerprint) do update set
    last_seen_at = excluded.last_seen_at,
    severity = case when excluded.severity = 'critical' then 'critical' else public.user_report_clusters.severity end,
    occurrence_count = public.user_report_clusters.occurrence_count + 1,
    updated_at = excluded.last_seen_at
  returning * into v_cluster;

  insert into public.user_report_cluster_members (
    cluster_id, report_id, reporter_user_id, reporter_hash, metadata
  ) values (
    v_cluster.id, v_report.id, v_report.reporter_user_id, p_reporter_hash,
    '{"source":"user_report_intake"}'::jsonb
  )
  on conflict (cluster_id, reporter_hash) do update set
    report_count = public.user_report_cluster_members.report_count + 1,
    duplicate_flag = true,
    last_seen_at = v_now
  returning report_count into v_member_count;
  v_duplicate := v_member_count > 1;

  update public.user_report_intake_events set
    report_status = 'clustered',
    duplicate_flag = v_duplicate
  where id = v_report.id;

  select count(*)::integer into v_unique_reporters
  from public.user_report_cluster_members member
  where member.cluster_id = v_cluster.id;
  select count(*)::integer into v_report_count
  from public.user_report_intake_events report
  where report.platform = v_report.platform
    and report.normalized_fingerprint = v_report.normalized_fingerprint
    and report.report_status in ('clustered', 'routed', 'review_required', 'spam', 'closed');

  update public.user_report_clusters set
    unique_reporter_count = v_unique_reporters,
    report_count = v_report_count,
    last_seen_at = v_now,
    updated_at = v_now
  where id = v_cluster.id
  returning * into v_cluster;

  return jsonb_build_object(
    'cluster', to_jsonb(v_cluster),
    'duplicateFlag', v_duplicate,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.upsert_user_report_cluster_membership(uuid, text) from public, anon, authenticated;
grant execute on function public.upsert_user_report_cluster_membership(uuid, text) to service_role;

comment on function public.upsert_user_report_cluster_membership(uuid, text) is
  'Service-only atomic User Report Router cluster/member/count transition. No raw text execution, rights change, money movement, or direct high-risk action.';
