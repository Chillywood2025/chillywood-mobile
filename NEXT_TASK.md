# NEXT TASK

## Recommended Lane: RevenueCat / Google Play Webhook Credential Link And Sandbox Event Proof

Provider-Link sandbox proof is now closed for the Stripe webhook boundary, Android Monetization readiness UI, and fail-closed RevenueCat/Google Play webhook shells.

Closed truth:

- `provider_readiness_status` and `provider_readiness_audit_log` remain the backend-owned readiness source.
- Supabase Edge secrets are configured for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` only.
- RevenueCat server/webhook secrets and Google Play server/webhook secrets are missing in Supabase by names-only inventory.
- RevenueCat and Google Play webhook shells return setup-required with no Premium/subscription grant and no live-money action.
- Stripe has sandbox proof: an enabled test-mode webhook endpoint received a Stripe CLI `payment_intent.succeeded` test event with `livemode=false` and `pending_webhooks=0`; unsigned direct POST is rejected as `invalid_signature`.
- Migration `202605250004_provider_link_sandbox_proof_status.sql` marks only `stripe / stripe_webhook_signature` as `sandbox_ready`; no provider is production active.
- Signed-in readiness summary returns sanitized rows only, no forbidden raw fields, no active rows, and no live-money rows.
- Android proof on `R5CR120QCBF` is outside the repo at `/tmp/chillywood-proof-2026-05-25T-provider-link-sandbox-proof-android/` and shows Monetization Overview, Premium, Revenue, Payouts, Stripe Setup, Google Play / RevenueCat Status, Future Tools, and owner/dev Technical checks with no active money claim and no secret-like values in captured XML.
- No checkout, tips, paid content, revenue imports, balances, transfers, payouts, fake earnings, fake Premium access, or live money movement was added.
- No Premium gate, RevenueCat entitlement, Google Play purchase, Stripe Connect account/onboarding, LiveKit, Watch-Party, Clip Studio, Brand Studio, creator upload/publish/delete, public renderer, package, native Android/Gradle, Expo config, or lockfile behavior changed.

Recommended next lane:

- Add/link `REVENUECAT_WEBHOOK_SECRET` or approved RevenueCat webhook auth secret in Supabase and RevenueCat dashboard.
- Add/link RevenueCat server metadata names only as needed: entitlement, offering, and product identifiers.
- Add/link Google Play server/Pub/Sub/webhook secret references in Supabase and Play Console without committing service-account JSON.
- Send valid and invalid RevenueCat/Google Play sandbox webhook events.
- Move only the proved capability rows to `configured` or `sandbox_ready`; do not set `active`.
- Capture updated Android Platform Studio Monetization screenshots only if RevenueCat/Google Play readiness statuses change.
- Keep `CHILLYWOOD_LIVE_MONEY_ENABLED`, payout release, checkout, tips, paid content, balances, and revenue imports disabled.

Validation should include the full monetization/payment/Stripe/provider-readiness guard stack, Supabase migration/lint/dry-run checks if schema changes, valid/invalid webhook proof, signed-in sanitized readiness proof, no-secret-output proof, no-live-money proof, Android Monetization proof, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Clip Studio Metadata-Only Trim Preview remains a valid later lane: add `trim_start_ms` / `trim_end_ms` metadata-only controls only if product wants preview range before launch, keep public Player unchanged unless a separate VOD renderer lane owns it, and do not claim export or permanent cuts.

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty.

Security Request Context follow-ups remain valid: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
