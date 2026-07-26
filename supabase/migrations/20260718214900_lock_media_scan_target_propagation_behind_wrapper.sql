-- The target-propagating implementation is an internal helper. Only the
-- security-definer durable wrapper may reach it; even service-role callers must
-- use complete_media_scan_job so propagation failures cannot strand leases.

revoke all on function public.complete_media_scan_job_with_target_propagation(uuid, text, text, text, text, text, text, integer)
  from public, anon, authenticated, service_role;

comment on function public.complete_media_scan_job_with_target_propagation(uuid, text, text, text, text, text, text, integer) is
  'Internal implementation reachable only through complete_media_scan_job. Direct caller execution is revoked to preserve durable queue completion.';
