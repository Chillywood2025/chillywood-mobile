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
]);
