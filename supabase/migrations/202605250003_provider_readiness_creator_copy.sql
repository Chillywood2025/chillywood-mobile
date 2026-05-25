-- Creator-facing copy polish for provider readiness summaries.
-- Keeps the provider-link scaffold fail-closed while removing implementation
-- phrasing from normal Platform Studio cards.

create or replace function public."get_provider_readiness_summary"()
returns table (
  "provider" text,
  "capability" text,
  "status" text,
  "display_label" text,
  "display_summary" text,
  "next_step" text,
  "last_checked_at" timestamptz,
  "is_live_money_enabled" boolean,
  "public_safe" boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public."provider_readiness_audit_log" (
    "actor_user_id",
    "action",
    "reason",
    "metadata"
  )
  values (
    auth.uid(),
    'provider_readiness_summary_requested',
    'Sanitized provider readiness summary requested; no secret values returned.',
    jsonb_build_object(
      'sanitized_summary', true,
      'secret_values_returned', false,
      'live_money_enabled_by_summary', false
    )
  );

  return query
  select
    status_row."provider",
    status_row."capability",
    status_row."status",
    case status_row."status"
      when 'missing' then 'Setup needed'
      when 'setup_needed' then 'Setup needed'
      when 'configured' then 'Configured'
      when 'ready_for_review' then 'Ready for review'
      when 'sandbox_ready' then 'Sandbox ready'
      when 'active' then 'Active'
      when 'disabled' then 'Not active yet'
      when 'blocked' then 'Temporarily unavailable'
      else 'Temporarily unavailable'
    end as "display_label",
    case status_row."capability"
      when 'premium_entitlement' then 'Premium entitlement checks stay on the existing RevenueCat-backed path.'
      when 'google_play_subscription_product' then 'Google Play subscription setup is tracked for Premium readiness only.'
      when 'revenuecat_offering' then 'RevenueCat offering setup is tracked without granting access from this summary.'
      when 'revenuecat_entitlement' then 'RevenueCat entitlement setup is tracked without changing Premium gates.'
      when 'stripe_connect_account' then 'Stripe account setup is tracked for future payout readiness.'
      when 'stripe_webhook_signature' then 'Stripe webhook signature checks stay server-side.'
      when 'payout_setup' then 'Payout setup remains unavailable until payment, review, and policy checks are complete.'
      when 'payout_release' then 'Payout release remains disabled until a future payout rollout is approved.'
      when 'creator_revenue_imports' then 'Creator revenue imports remain disabled until a real revenue source is linked.'
      when 'tips' then 'Tips remain planned until payment, policy, and review checks are complete.'
      when 'paid_content' then 'Paid content remains planned until store/payment, refund, tax, and access checks are complete.'
      when 'platform_commerce' then 'Platform commerce remains planned until checkout, fulfillment, refund, tax, and payout checks are complete.'
      when 'ad_revenue' then 'Ad revenue remains planned until real ad reporting and payout checks are complete.'
      else 'Creator monetization policy is tracked without enabling live money.'
    end as "display_summary",
    case status_row."status"
      when 'active' then 'Keep provider checks, audit, and rollback review current.'
      when 'sandbox_ready' then 'Run production review before enabling any live capability.'
      when 'ready_for_review' then 'Complete owner review before enabling.'
      when 'configured' then 'Run provider review before enabling.'
      when 'disabled' then 'Link the required setup and complete review in a later lane.'
      when 'blocked' then 'Resolve the block before retrying setup.'
      when 'error' then 'Review the server-side error and retry safely.'
      else 'Add the required setup before review.'
    end as "next_step",
    status_row."last_checked_at",
    status_row."is_live_money_enabled",
    true as "public_safe"
  from public."provider_readiness_status" status_row
  where status_row."is_client_visible" = true
  order by
    case status_row."provider"
      when 'revenuecat' then 10
      when 'google_play' then 20
      when 'stripe' then 30
      when 'stripe_connect' then 40
      when 'stripe_webhook' then 50
      when 'ads' then 60
      else 70
    end,
    status_row."capability";
end;
$$;

revoke all on function public."get_provider_readiness_summary"() from public;
grant execute on function public."get_provider_readiness_summary"() to authenticated;
grant execute on function public."get_provider_readiness_summary"() to service_role;
