// Explicit reviewed source-only successors. Historical checkpoints defer these
// identities; current full-schema suites must replay every one in order.
export const nativeProductionMigrationFiles=Object.freeze([
 '20261110225744_native_production_paid_video_held_observations.sql',
 '20261110232244_native_production_source_reports_and_cashout_boundary.sql',
 '20261110235044_native_production_linked_earnings_controls.sql',
 '20261111002203_native_production_equivalent_renewals.sql',
 '20261111003631_native_production_signed_correction_ledger.sql',
 '20261111004735_native_production_checkout_authority.sql',
 '20261111014539_native_production_attested_delayed_settlement.sql',
 '20261111014948_native_production_paid_access_renewal.sql',
 '20261111022147_native_production_recovery_and_verified_pricing.sql',
 // Forward convergence depends on the current production wrapper topology;
 // historical pre-production checkpoints must not apply it prematurely.
 '20261112041003_automatic_eligibility_current_topology.sql',
 // The frozen automatic-commerce fixture predates native-only tip admission.
 // Current-schema tests still apply this cutoff and prove native admission.
 '20261112091500_native_only_tip_admission.sql',
 // Catalog identity convergence belongs to the current full-schema topology,
 // not historical checkpoints that predate native tip ownership.
 '20261112103000_android_sandbox_tip_provider_identity.sql',
 // Web-only Stripe video successors require the current source/ledger wrappers.
 '20261112160000_stripe_sandbox_video_creator_prices.sql',
 '20261112161000_stripe_paid_video_sandbox_checkout.sql',
 '20261112183000_stripe_paid_video_sandbox_held_receipts.sql',
 '20261112184000_stripe_paid_video_sandbox_playback.sql',
 '20261112185000_stripe_video_known_cost_held_earnings.sql',
 '20261112190000_stripe_video_protected_classification.sql',
 '20261112191000_stripe_video_player_metadata.sql',
 '20261112192000_stripe_video_request_recovery.sql',
 // Native Stripe transport/reporting and shared history require the current
 // paid-video topology, not the frozen historical checkpoints.
 '20261113010532_stripe_video_test_tax_environment.sql',
 '20261113011831_stripe_video_native_route_admission.sql',
 '20261113012740_stripe_video_google_launch_binding.sql',
 '20261113012744_stripe_video_google_refund_tax_context.sql',
 '20261113013312_stripe_video_google_reporting_repair.sql',
 '20261113013902_stripe_video_atomic_native_prepare.sql',
 '20261113014825_stripe_video_platform_access_read.sql',
 '20261113042617_stripe_video_shared_purchase_history.sql',
 // Checkout market proof wraps the current native dispatch topology only.
 '20261113080000_stripe_video_market_dispatch.sql',
]);
