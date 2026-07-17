-- Route a qualified report cluster and create its governed control-plane records
-- in one transaction. The cluster row lock prevents duplicate owner commands or
-- approval requests when multiple reports cross a threshold concurrently.

create unique index if not exists user_report_routing_actions_cluster_uidx
  on public.user_report_routing_actions (cluster_id);

create or replace function public.route_user_report_cluster(
  p_cluster_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cluster public.user_report_clusters%rowtype;
  v_existing public.user_report_routing_actions%rowtype;
  v_command_id uuid;
  v_approval_id uuid;
  v_action_id uuid;
  v_finding_id uuid;
  v_approval_level integer;
  v_action_type text;
  v_action_status text;
  v_command_status text;
  v_immediate boolean;
begin
  select * into v_cluster
  from public.user_report_clusters
  where id = p_cluster_id
  for update;

  if not found then
    raise exception 'user_report_cluster_not_found' using errcode = 'P0002';
  end if;

  if v_cluster.spam_flag or v_cluster.false_positive then
    return jsonb_build_object('routed', false, 'reason', 'cluster_not_routable');
  end if;

  v_immediate := v_cluster.severity = 'critical'
    or v_cluster.report_type in (
      'safety_abuse', 'illegal_or_dangerous_content', 'security_access',
      'premium_or_billing', 'payout_or_money', 'privacy_data'
    );

  if not v_immediate and (
    v_cluster.unique_reporter_count < v_cluster.threshold_unique_reporters
    or v_cluster.first_seen_at < timezone('utc'::text, now()) - interval '7 days'
  ) then
    return jsonb_build_object('routed', false, 'reason', 'threshold_not_met');
  end if;

  select * into v_existing
  from public.user_report_routing_actions
  where cluster_id = p_cluster_id;

  if found then
    return jsonb_build_object(
      'routed', false,
      'reason', 'already_routed',
      'routingActionId', v_existing.id,
      'ownerCommandId', v_existing.owner_command_id,
      'approvalRequestId', v_existing.approval_request_id
    );
  end if;

  v_approval_level := case when v_immediate then 3 else 2 end;
  v_action_type := case when v_immediate then 'immediate_escalation' else 'threshold_owner_command' end;
  v_action_status := case when v_immediate then 'approval_request_created' else 'owner_command_created' end;
  v_command_status := case when v_immediate then 'approval_required' else 'planned' end;
  v_command_id := extensions.gen_random_uuid();

  insert into public.owner_command_requests (
    id, owner_user_id, command_text, normalized_intent, platform, target_systems,
    approval_level, status, allowed_scope, forbidden_scope, preflight_plan,
    execution_plan, rollback_plan, proof_plan, validation_plan, metadata
  ) values (
    v_command_id,
    null,
    format(
      'User report cluster requires safe operator review: %s with %s unique reporters routed to %s.',
      v_cluster.report_type, v_cluster.unique_reporter_count, v_cluster.routed_system_id
    ),
    'user_report_cluster_routing',
    v_cluster.platform,
    case when v_cluster.routed_system_id = 'money_flow_control'
      then array[v_cluster.routed_system_id, 'support_success_operator']
      else array[v_cluster.routed_system_id]
    end,
    v_approval_level,
    v_command_status,
    '["read sanitized report cluster summary","write routed operator finding","create scoped approval request"]'::jsonb,
    '["money movement","manual Premium grant","auth or RLS mutation","direct moderation enforcement","provider product mutation","OTA publication","raw report text execution"]'::jsonb,
    '["confirm cluster fingerprint and unique reporter count","review sanitized reproduction details","confirm target operator scope"]'::jsonb,
    '["record a target-operator finding","propose a bounded fix or blocker","route high-risk work to approval"]'::jsonb,
    '["supersede finding or command rows","retain immutable intake and audit history"]'::jsonb,
    '["run User Report Router and target-operator guards"]'::jsonb,
    '["verify high-risk, money, and user-rights side-effect flags remain false"]'::jsonb,
    jsonb_build_object(
      'source', 'user_report_router',
      'cluster_id', v_cluster.id,
      'normalized_fingerprint', v_cluster.normalized_fingerprint,
      'raw_user_text_executed', false
    )
  );

  insert into public.owner_command_events (
    command_id, platform, event_type, actor_type, status, event_summary, metadata
  ) values (
    v_command_id, v_cluster.platform, v_command_status,
    'support_success_operator', v_command_status,
    'User Report Router created a governed review command from sanitized cluster state.',
    jsonb_build_object('source', 'user_report_router', 'cluster_id', v_cluster.id)
  );

  if v_immediate then
    v_approval_id := extensions.gen_random_uuid();
    insert into public.autonomous_approval_requests (
      id, system_id, action_id, platform, requested_by_actor_type,
      requested_by_actor_id, approval_level, status, title, reason,
      risk_summary, proposed_action, allowed_write_scope, forbidden_scope,
      rollback_plan, kill_switch_plan, proof_plan, validation_plan,
      expires_at, metadata
    ) values (
      v_approval_id,
      v_cluster.routed_system_id,
      'user_report_cluster_review',
      v_cluster.platform,
      'support_success_operator',
      null,
      v_approval_level,
      'pending',
      format('User report cluster review for %s', v_cluster.report_type),
      'Critical or sensitive report cluster requires owner review before any high-risk action.',
      'Untrusted reports cannot directly execute money, access, enforcement, provider, release, or infrastructure changes.',
      'Review the sanitized cluster and route work through the approved target-operator scope.',
      '["sanitized finding rows","owner command evidence","approval request rows"]'::jsonb,
      '["money movement","Premium grant","auth or RLS mutation","direct enforcement","provider product mutation","raw report text execution"]'::jsonb,
      'Cancel the approval and supersede mutable findings; retain immutable history.',
      'Support Success and the target operator emergency stops block execution.',
      'Run User Report Router, target-operator, and Owner Command guards.',
      'Confirm high-risk, money, and user-rights side-effect flags remain false.',
      timezone('utc'::text, now()) + interval '24 hours',
      jsonb_build_object('source', 'user_report_router', 'cluster_id', v_cluster.id, 'owner_command_id', v_command_id)
    );

    insert into public.autonomous_approval_request_events (
      request_id, platform, event_type, actor_type, actor_id, event_summary, metadata
    ) values (
      v_approval_id, v_cluster.platform, 'created', 'support_success_operator', null,
      'User Report Router requested owner review for a critical or sensitive report cluster.',
      jsonb_build_object('source', 'user_report_router', 'cluster_id', v_cluster.id)
    );

    update public.owner_command_requests
    set approval_request_id = v_approval_id, updated_at = timezone('utc'::text, now())
    where id = v_command_id;
  end if;

  insert into public.user_report_routing_actions (
    cluster_id, platform, action_type, routed_system_id, owner_command_id,
    approval_request_id, action_status, reason, unique_reporter_count,
    report_count, metadata
  ) values (
    v_cluster.id, v_cluster.platform, v_action_type, v_cluster.routed_system_id,
    v_command_id, v_approval_id, v_action_status,
    case when v_immediate then 'critical_or_sensitive_immediate_escalation'
      else 'three_unique_reporter_threshold_met' end,
    v_cluster.unique_reporter_count, v_cluster.report_count,
    '{"source":"user_report_router","raw_user_text_executed":false}'::jsonb
  ) returning id into v_action_id;

  insert into public.user_report_operator_findings (
    cluster_id, platform, system_id, finding_type, severity, routed_system_id,
    text_summary_redacted, unique_reporter_count, report_count, owner_command_id,
    approval_request_id, finding_status, finding_key, metadata
  ) values (
    v_cluster.id, v_cluster.platform, 'support_success_operator',
    v_cluster.report_type, v_cluster.severity, v_cluster.routed_system_id,
    v_cluster.text_summary_redacted, v_cluster.unique_reporter_count,
    v_cluster.report_count, v_command_id, v_approval_id, v_action_status,
    format('user_report:%s:%s', v_cluster.platform, v_cluster.id),
    '{"source":"user_report_router","prompt_injection_executed":false}'::jsonb
  ) returning id into v_finding_id;

  update public.user_report_clusters
  set cluster_status = case when v_immediate then 'review_required' else 'routed' end,
      action_status = v_action_status,
      owner_command_id = v_command_id,
      approval_request_id = v_approval_id,
      updated_at = timezone('utc'::text, now())
  where id = v_cluster.id;

  return jsonb_build_object(
    'routed', true,
    'routingActionId', v_action_id,
    'ownerCommandId', v_command_id,
    'approvalRequestId', v_approval_id,
    'findingId', v_finding_id
  );
end;
$$;

revoke all on function public.route_user_report_cluster(uuid) from public, anon, authenticated;
grant execute on function public.route_user_report_cluster(uuid) to service_role;

comment on function public.route_user_report_cluster(uuid) is
  'Atomically routes one qualified sanitized report cluster. Creates no product, provider, money, rights, moderation, or release side effect.';
