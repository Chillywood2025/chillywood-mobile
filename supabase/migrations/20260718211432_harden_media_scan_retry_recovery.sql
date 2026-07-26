-- Recover abandoned malware-scan leases and fail closed after the bounded
-- attempt cap. The worker invokes this before claiming new work.

create index if not exists media_scan_jobs_recovery_idx
  on public.media_scan_jobs (claimed_at, updated_at)
  where status in ('scanning', 'scan_failed');

create or replace function public.recover_media_scan_jobs(
  p_stale_after_minutes integer default 20,
  p_max_jobs integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stale_after_minutes integer := greatest(5, least(coalesce(p_stale_after_minutes, 20), 1440));
  v_max_jobs integer := greatest(1, least(coalesce(p_max_jobs, 25), 100));
  v_stale_requeued integer := 0;
  v_capped_manual_review integer := 0;
  v_job_id uuid;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'media_scan_service_role_required';
  end if;

  with stale_jobs as (
    select job.id
    from public.media_scan_jobs job
    where job.status = 'scanning'
      and job.claimed_at < now() - make_interval(mins => v_stale_after_minutes)
    order by job.claimed_at, job.created_at
    for update skip locked
    limit v_max_jobs
  )
  update public.media_scan_jobs job
  set status = 'scan_failed',
      claimed_by = null,
      claimed_at = null,
      error_message = 'stale_scan_lease_recovered',
      updated_at = now()
  from stale_jobs
  where job.id = stale_jobs.id;
  get diagnostics v_stale_requeued = row_count;

  for v_job_id in
    select job.id
    from public.media_scan_jobs job
    where job.status = 'scan_failed'
      and job.attempt_count >= job.max_attempts
    order by job.updated_at, job.created_at
    for update skip locked
    limit v_max_jobs
  loop
    perform public.complete_media_scan_job(
      v_job_id,
      'manual_review',
      'clamav',
      'bounded_recovery',
      null,
      null,
      'scan_attempt_cap_reached',
      0
    );
    v_capped_manual_review := v_capped_manual_review + 1;
  end loop;

  return jsonb_build_object(
    'readbackComplete', true,
    'staleRequeuedCount', v_stale_requeued,
    'cappedManualReviewCount', v_capped_manual_review,
    'attemptCapPreserved', true,
    'moneyMoved', false,
    'userRightsChanged', false,
    'highRiskExecuted', false
  );
end;
$$;

revoke all on function public.recover_media_scan_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.recover_media_scan_jobs(integer, integer) to service_role;

comment on function public.recover_media_scan_jobs(integer, integer) is
  'Service-role-only bounded recovery for stale media-scan leases and capped failures. It retains audit rows and routes capped failures to manual review.';

-- Repair the bounded historical backlog during deployment without exposing a
-- recurring database scheduler or weakening the service-role-only RPC.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.recover_media_scan_jobs(20, 100);
select set_config('request.jwt.claims', '{}', true);
