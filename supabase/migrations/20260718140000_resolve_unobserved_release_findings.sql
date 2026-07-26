-- Resolve only release findings that were created by the former
-- expected-as-observed fallback while provider readback was incomplete.
-- Genuine observed mismatches and provider-unavailable findings are retained.

with corrected as (
  update public.autonomous_current_findings
  set current_status = 'resolved',
      resolved_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where system_id = 'release_ota_operator'
    and platform = 'ios'
    and current_status = 'open'
    and coalesce((metadata ->> 'readback_complete')::boolean, false) = false
    and finding_type in (
      'appVersion_mismatch',
      'bundleIdentifier_mismatch',
      'channel_mismatch',
      'distributionSource_mismatch',
      'nativeBuild_mismatch',
      'runtimeVersion_mismatch',
      'sourceCommit_mismatch',
      'rollback_target_missing'
    )
  returning finding_key, system_id, platform
)
insert into public.autonomous_finding_lifecycle_events (
  finding_key,
  system_id,
  platform,
  event_type,
  event_summary,
  metadata
)
select
  finding_key,
  system_id,
  platform,
  'resolved',
  'Unobserved identity fallback corrected; provider blocker retained.',
  jsonb_build_object('correction', 'expected_identity_was_not_observed')
from corrected;
