-- Keep the immutable scan/audit queue durable even when a target-table trigger
-- rejects propagation. Target content remains fail-closed because it is never
-- marked clean when propagation fails.

alter function public.complete_media_scan_job(uuid, text, text, text, text, text, text, integer)
  rename to complete_media_scan_job_with_target_propagation;
alter function public.complete_media_scan_job_with_target_propagation(uuid, text, text, text, text, text, text, integer)
  set search_path = '';

revoke all on function public.complete_media_scan_job_with_target_propagation(uuid, text, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.complete_media_scan_job_with_target_propagation(uuid, text, text, text, text, text, text, integer)
  to service_role;

comment on function public.complete_media_scan_job_with_target_propagation(uuid, text, text, text, text, text, text, integer) is
  'Legacy target-propagating media scan completion. Called only by the service-role wrapper so target trigger failures cannot strand the queue lease.';

create function public.complete_media_scan_job(
  p_job_id uuid,
  p_status text,
  p_scanner_provider text default 'clamav',
  p_scanner_version text default null,
  p_signature_version text default null,
  p_finding_name text default null,
  p_error_message text default null,
  p_duration_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.media_scan_jobs%rowtype;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_now timestamptz := now();
  v_result jsonb;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'media_scan_service_role_required';
  end if;

  if v_status not in ('clean', 'malware_detected', 'scan_failed', 'manual_review', 'quarantined') then
    raise exception 'media_scan_result_status_invalid';
  end if;

  select *
  into v_job
  from public.media_scan_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'media_scan_job_not_found';
  end if;

  begin
    v_result := public.complete_media_scan_job_with_target_propagation(
      p_job_id,
      v_status,
      p_scanner_provider,
      p_scanner_version,
      p_signature_version,
      p_finding_name,
      p_error_message,
      p_duration_ms
    );
    return v_result || jsonb_build_object('targetPropagationComplete', true);
  exception
    when others then
      -- The nested block is a PostgreSQL subtransaction. A target trigger can
      -- roll back propagation without rolling back the durable queue outcome.
      -- Deliberately do not persist SQLERRM or target data.
      null;
  end;

  update public.media_scan_jobs
  set status = v_status,
      claimed_by = null,
      claimed_at = null,
      completed_at = case when v_status = 'scan_failed' then null else v_now end,
      scanner_provider = nullif(btrim(coalesce(p_scanner_provider, '')), ''),
      scanner_version = nullif(btrim(coalesce(p_scanner_version, '')), ''),
      signature_version = nullif(btrim(coalesce(p_signature_version, '')), ''),
      finding_name = nullif(btrim(coalesce(p_finding_name, '')), ''),
      error_message = nullif(btrim(coalesce(p_error_message, '')), ''),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'durationMs', p_duration_ms,
        'completedAt', v_now,
        'targetPropagationComplete', false,
        'targetPropagationFailure', 'target_update_blocked',
        'targetPropagationFailedAt', v_now
      ),
      updated_at = v_now
  where id = v_job.id;

  return jsonb_build_object(
    'status', v_status,
    'jobId', v_job.id,
    'targetTable', v_job.target_table,
    'targetId', v_job.target_id,
    'targetPropagationComplete', false,
    'targetPropagationFailure', 'target_update_blocked'
  );
end;
$$;

revoke all on function public.complete_media_scan_job(uuid, text, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.complete_media_scan_job(uuid, text, text, text, text, text, text, integer)
  to service_role;

comment on function public.complete_media_scan_job(uuid, text, text, text, text, text, text, integer) is
  'Service-role-only durable media scan completion. Target propagation is attempted in a subtransaction; blocked propagation is sanitized and content remains fail-closed.';

-- Finish any leases that were stranded by the old transaction coupling. The
-- existing recovery RPC remains bounded and preserves the attempt cap.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.recover_media_scan_jobs(5, 100);
select set_config('request.jwt.claims', '{}', true);
