-- Installed Product QA Firebase Test Lab cost-capped policy.
-- This supersedes the earlier zero-cost-only blocker without claiming a
-- Firebase matrix ran or that uploaded-artifact proof is Play-installed proof.

update public.device_availability_findings
set
  finding_status = 'superseded',
  next_safe_action = 'Superseded by owner-approved cost-capped cheap mode; run only bounded virtual-device smoke under per-run/monthly caps, and keep Play-installed/Premium/two-device proof separate.',
  metadata = metadata || jsonb_build_object(
    'supersededBy', 'firebase-cost-capped-cheap-mode',
    'supersededReason', 'Owner approved low-cost bounded Firebase virtual smoke instead of zero-cost-only blocking.',
    'updatedMode', 'cost_capped',
    'monthlyBudgetUsd', 5,
    'maxAllowedCostUsd', 0.25,
    'billingRisk', 'low_when_bounded',
    'quotaMode', 'cost_capped_worst_case'
  ),
  updated_at = timezone('utc'::text, now())
where system_id = 'installed_product_qa_operator'
  and metadata ->> 'findingId' = 'firebase-free-quota-unknown'
  and finding_status = 'open';

insert into public.installed_qa_operator_events (
  system_id,
  source,
  action_id,
  result,
  blocker_classification,
  discovered_by,
  metadata
)
select
  'installed_product_qa_operator',
  'local_fixture',
  'firebase_test_lab_cost_capped_policy',
  'cost_capped_policy_ready',
  'unknown_requires_review',
  'autonomous_operator',
  jsonb_build_object(
    'policyId', 'firebase-cost-capped-cheap-mode',
    'device_lab_provider', 'firebase_test_lab',
    'proofSource', 'firebase_test_lab_uploaded_artifact',
    'notPlayInstalledProof', true,
    'mode', 'cost_capped',
    'qaTiers', jsonb_build_object(
      'tier0', 'source_backend_operator_only',
      'tier1', 'firebase_virtual_smoke_cost_capped',
      'tier2', 'owner_approved_broader_firebase',
      'tier3', 'physical_play_installed_provider_device_proof'
    ),
    'monthlyBudgetUsd', 5,
    'maxAllowedCostUsd', 0.25,
    'monthlySpentEstimateUsd', 0,
    'billingRisk', 'low_when_bounded',
    'quotaMode', 'cost_capped_worst_case',
    'deviceType', 'virtual',
    'runReason', 'policy_update',
    'physicalDeviceAllowedByDefault', false,
    'broadCrawlAllowedByDefault', false,
    'twoDeviceFirebaseAllowedByDefault', false,
    'maxScheduledRunsPerDay', 1,
    'premiumProofClosed', false,
    'twoDeviceProofClosed', false,
    'fakeProof', false,
    'moneyMoved', false,
    'userRightsChanged', false,
    'highRiskExecuted', false,
    'secretsLogged', false
  )
where not exists (
  select 1
  from public.installed_qa_operator_events
  where system_id = 'installed_product_qa_operator'
    and action_id = 'firebase_test_lab_cost_capped_policy'
    and metadata ->> 'policyId' = 'firebase-cost-capped-cheap-mode'
);
