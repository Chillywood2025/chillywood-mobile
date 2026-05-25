-- Provider-link sandbox proof closeout.
-- Records the May 25, 2026 sandbox proof boundary without enabling live money,
-- purchases, checkout, balances, transfers, payouts, tips, paid content, or
-- creator revenue imports.

insert into public."provider_readiness_status" (
  "provider",
  "capability",
  "status",
  "environment",
  "proof_source",
  "proof_summary",
  "last_checked_at",
  "is_live_money_enabled",
  "is_client_visible"
)
values (
  'stripe',
  'stripe_webhook_signature',
  'sandbox_ready',
  'production',
  'provider_link_sandbox_proof_2026_05_25',
  'Stripe CLI test-mode payment_intent.succeeded event reached the enabled test webhook endpoint with pending_webhooks=0; unsigned direct POST was rejected with invalid_signature.',
  timezone('utc'::text, now()),
  false,
  true
)
on conflict ("provider", "capability", "environment")
do update set
  "status" = excluded."status",
  "proof_source" = excluded."proof_source",
  "proof_summary" = excluded."proof_summary",
  "last_checked_at" = excluded."last_checked_at",
  "last_error_code" = null,
  "last_error_message" = null,
  "is_live_money_enabled" = false,
  "is_client_visible" = true;

insert into public."provider_readiness_audit_log" (
  "provider",
  "capability",
  "action",
  "status_before",
  "status_after",
  "reason",
  "proof_source",
  "metadata"
)
values
  (
    'stripe',
    'stripe_webhook_signature',
    'stripe_webhook_sandbox_ready_proved',
    'setup_needed',
    'sandbox_ready',
    'Stripe test-mode webhook delivery was proved while live money stayed disabled.',
    'provider_link_sandbox_proof_2026_05_25',
    jsonb_build_object(
      'stripe_event_type', 'payment_intent.succeeded',
      'stripe_livemode', false,
      'stripe_pending_webhooks', 0,
      'enabled_endpoint_livemode', false,
      'unsigned_post_rejected', true,
      'signature_required', true,
      'checkout_created', false,
      'charge_created_by_app', false,
      'balance_created_by_app', false,
      'transfer_created', false,
      'payout_created', false,
      'premium_granted', false,
      'secret_values_logged', false,
      'raw_provider_payload_stored', false,
      'live_money_action', false
    )
  ),
  (
    'revenuecat',
    'premium_entitlement',
    'revenuecat_webhook_setup_required_proved',
    'configured',
    'setup_needed',
    'RevenueCat webhook/API secrets were not configured in Supabase by name-only inventory; webhook returned setup_required with no Premium grant.',
    'provider_link_sandbox_proof_2026_05_25',
    jsonb_build_object(
      'secret_inventory_names_only', true,
      'webhook_secret_configured', false,
      'signature_verified', false,
      'webhook_processed', false,
      'premium_granted', false,
      'secret_values_logged', false,
      'raw_provider_payload_stored', false,
      'live_money_action', false
    )
  ),
  (
    'google_play',
    'google_play_subscription_product',
    'google_play_webhook_setup_required_proved',
    'configured',
    'setup_needed',
    'Google Play server/API/webhook secrets were not configured in Supabase by name-only inventory; webhook returned setup_required with no subscription grant.',
    'provider_link_sandbox_proof_2026_05_25',
    jsonb_build_object(
      'secret_inventory_names_only', true,
      'webhook_secret_configured', false,
      'signature_verified', false,
      'webhook_processed', false,
      'subscription_granted', false,
      'secret_values_logged', false,
      'raw_provider_payload_stored', false,
      'live_money_action', false
    )
  ),
  (
    'internal_policy',
    'creator_monetization_policy',
    'provider_readiness_live_money_disabled_proved',
    'configured',
    'configured',
    'Provider-link sandbox proof confirmed live money and creator monetization provider flags remain missing/disabled.',
    'provider_link_sandbox_proof_2026_05_25',
    jsonb_build_object(
      'CHILLYWOOD_LIVE_MONEY_ENABLED', 'missing',
      'CHILLYWOOD_PAYMENT_RAILS_ENABLED', 'missing',
      'CHILLYWOOD_CREATOR_MONETIZATION_ENABLED', 'missing',
      'CHILLYWOOD_PAYOUTS_ENABLED', 'missing',
      'checkout_created', false,
      'tips_enabled', false,
      'paid_content_enabled', false,
      'revenue_import_enabled', false,
      'balance_created', false,
      'transfer_created', false,
      'payout_created', false,
      'secret_values_logged', false,
      'live_money_action', false
    )
  );
