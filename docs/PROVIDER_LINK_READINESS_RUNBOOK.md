# Provider-Link Readiness Runbook

Last updated: May 25, 2026

This runbook records the provider-link readiness scaffold for Premium, RevenueCat, Google Play Billing, Stripe, Stripe Connect, payouts, revenue imports, tips, paid content, ads, and future commerce.

No implementation in this lane activates purchases, payouts, balances, withdrawals, transfers, checkout, tips, paid content, revenue imports, or live money movement.

## Readiness Source Of Truth

Migration `202605250002_provider_link_readiness_scaffold.sql` adds:

- `provider_readiness_status`: backend-owned readiness rows by provider, capability, status, and environment.
- `provider_readiness_audit_log`: append-only sanitized readiness audit rows.
- `get_provider_readiness_summary()`: authenticated sanitized read path for creator/Admin UI.

Allowed statuses are:

- `missing`
- `setup_needed`
- `configured`
- `ready_for_review`
- `sandbox_ready`
- `active`
- `disabled`
- `blocked`
- `error`

Rules:

- `active` requires proof source, proof summary, and `last_checked_at`.
- `is_live_money_enabled` defaults to `false` and can only be true with `status='active'`.
- This lane seeds no active rows and no live-money rows.
- Normal creators and normal users cannot write readiness rows.
- UI reads sanitized summaries only and never receives secrets, raw provider payloads, raw storage paths, customer payment identifiers, card data, bank data, or service-role values.

## Seeded Providers And Capabilities

| Provider | Capability | Seeded Status | Live Money |
| --- | --- | --- | --- |
| RevenueCat | Premium entitlement | configured | false |
| RevenueCat | Offering | configured | false |
| RevenueCat | Entitlement | configured | false |
| Google Play | Subscription product | configured | false |
| Stripe | Webhook signature | setup_needed | false |
| Stripe Connect | Account setup | setup_needed | false |
| Stripe Connect | Payout setup | setup_needed | false |
| Stripe Connect | Payout release | disabled | false |
| Internal policy | Creator revenue imports | disabled | false |
| Stripe | Tips | disabled | false |
| Google Play | Paid content | setup_needed | false |
| Stripe | Platform commerce | disabled | false |
| Ads | Ad revenue | disabled | false |
| Internal policy | Creator monetization policy | configured | false |

`configured` means the repo has a named contract or policy row. It is not active. It does not grant access, create money, or enable a provider call.

## Server-Only Env Contract

Document names only. Do not commit values.

RevenueCat:

- `REVENUECAT_SECRET_API_KEY`
- `REVENUECAT_WEBHOOK_SECRET`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- `REVENUECAT_ENTITLEMENT_ID`
- `REVENUECAT_OFFERING_ID`
- `REVENUECAT_PRODUCT_ID`

Google Play:

- `GOOGLE_PLAY_PACKAGE_NAME`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_SECRET_REF`
- `GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID`
- `GOOGLE_PLAY_PUBSUB_TOPIC`
- `GOOGLE_PLAY_WEBHOOK_SECRET`

Stripe:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CONNECT_CLIENT_ID`
- `STRIPE_CONNECT_REFRESH_URL`
- `STRIPE_CONNECT_RETURN_URL`
- `STRIPE_PLATFORM_ACCOUNT_ID`
- `STRIPE_ENVIRONMENT`

Internal flags:

- `CHILLYWOOD_PAYMENT_RAILS_ENABLED`
- `CHILLYWOOD_LIVE_MONEY_ENABLED`
- `CHILLYWOOD_CREATOR_MONETIZATION_ENABLED`
- `CHILLYWOOD_PAYOUTS_ENABLED`

Only public-safe keys may use an `EXPO_PUBLIC_` prefix. Secret env vars must stay server-side in Supabase/EAS/provider consoles and must never be rendered in the mobile app.

## Edge Function Shells

Added or confirmed fail-closed paths:

- `provider-readiness`: authenticated sanitized readiness summary. Returns no secrets and no raw provider payloads.
- `revenuecat-webhook`: requires `REVENUECAT_WEBHOOK_SECRET` before accepting events. Records verified events for readiness only and does not grant Premium.
- `google-play-webhook`: requires `GOOGLE_PLAY_WEBHOOK_SECRET` before accepting events. Records verified events for readiness only and does not grant subscriptions.
- Existing `stripe-connect-webhook`: requires Stripe webhook signature verification, rejects live-mode events in the current test-mode shell, records supported foundation events idempotently, and creates no checkout, orders, ledger earnings, transfers, payouts, or live money.

The RevenueCat and Google Play webhook shells intentionally do not process entitlement changes. A later provider-link lane must implement provider-specific verification, idempotency, entitlement reconciliation, rollback proof, and audit proof before any active behavior can be claimed.

## Provider Dashboard Setup Steps

RevenueCat:

1. Confirm Chi'llywood project and app.
2. Confirm Android public SDK key and server API key are stored only in approved provider/server env locations.
3. Confirm entitlement id `premium`.
4. Confirm offering id `premium`.
5. Confirm product id `premium_subscription:monthly` or current approved equivalent.
6. Configure webhook target only after the `REVENUECAT_WEBHOOK_SECRET` is set.
7. Run sandbox purchase, restore, active entitlement, revoked/expired entitlement, and webhook proof.

Google Play:

1. Confirm package name `com.chillywood.mobile`.
2. Confirm subscription product id `premium_subscription`.
3. Confirm base plan and price.
4. Confirm service account access and Pub/Sub/webhook path are server-only.
5. Set `GOOGLE_PLAY_WEBHOOK_SECRET` only in server-side provider config.
6. Run product-load, purchase sheet, purchase, restore, renewal/expiration, and webhook proof.

Stripe / Stripe Connect:

1. Use server-side Stripe secret keys only.
2. Keep test-mode proof separate from production.
3. Confirm Connect account controller/dashboard/requirements model before production.
4. Configure signed webhook endpoint with `STRIPE_WEBHOOK_SECRET`.
5. Prove account creation/reuse, onboarding, account sync, requirements, KYC/tax readiness, duplicate event idempotency, and invalid signature rejection.
6. Keep transfers, payouts, balances, checkout, cash-out, and release disabled until a later live-money lane proves every required gate.

Ads:

1. Keep provider-neutral wrapper direction.
2. Do not add ad SDK IDs or provider init until an ads provider lane owns it.
3. Do not create ad revenue rows or creator earnings from placeholder ad surfaces.

## Sandbox Proof Checklist

- Readiness rows exist and all seeded rows have `is_live_money_enabled=false`.
- Normal authenticated creator can read sanitized `get_provider_readiness_summary()` output.
- Normal authenticated creator cannot insert or update `provider_readiness_status`.
- Anonymous direct reads are denied.
- RevenueCat webhook without secret returns setup required.
- RevenueCat webhook with invalid secret is rejected.
- Google Play webhook without secret returns setup required.
- Google Play webhook with invalid secret is rejected.
- Stripe webhook invalid signature remains rejected.
- Premium entitlement behavior is unchanged.
- Non-Premium users remain denied by existing Premium gates.
- No creator earnings, payout balances, transfers, withdrawals, checkout sessions, tips, paid products, or paid access grants are created.

## Production Proof Checklist

Before any status can become `active`:

- Provider dashboard setup is complete.
- Provider secret values exist only in server/provider secret stores.
- Webhook signature verification is proved with valid and invalid events.
- Provider idempotency is proved.
- Audit rows prove accepted, rejected, blocked, and duplicate events.
- Rollback plan is tested.
- Legal/accounting/tax/fraud/support requirements are approved.
- Owner/operator approval is recorded.
- Android proof shows locked and active states honestly.
- Public UI still exposes no secrets or raw provider payloads.

## Rollback Plan

1. Set affected readiness rows to `blocked` or `disabled`.
2. Keep `is_live_money_enabled=false`.
3. Disable provider dashboard webhooks if needed.
4. Rotate affected secrets.
5. Verify UI returns locked/unavailable states.
6. Verify Premium gates, creator gates, and payout gates remain fail-closed.
7. Record audit rows for rollback reason and affected capability.

## Secret Rotation Plan

1. Add new provider secret in the server/provider secret store.
2. Deploy or restart only the server-side function that needs it.
3. Run valid and invalid signature proof.
4. Revoke the old secret in the provider dashboard.
5. Confirm no old secret value is printed in logs or screenshots.
6. Record an audit row with secret name only, never value.

## Future Implementation Boundaries

Do not touch these areas in provider-link work unless a future exact lane explicitly owns them:

- LiveKit token issuer, registry, room routing, or egress.
- Watch-Party Live route.
- Live Watch-Party route.
- Premium gate decisions except the existing RevenueCat entitlement path.
- Creator upload/publish/delete behavior.
- Clip Studio rendering/export behavior.
- Brand Studio behavior.
- Public Player behavior for paid content unless a dedicated VOD monetization renderer/access lane owns it.
- Native Android/Gradle files or packages unless a provider SDK lane owns release-build proof.

## Android Proof And Validation

Android proof on device `R5CR120QCBF` is outside the repo at:

`/tmp/chillywood-proof-2026-05-25T21-33-35Z-provider-link-readiness/`

Captured proof includes:

- Platform Studio Monetization Overview.
- Premium and Subscriptions.
- Revenue.
- Payouts.
- Stripe Setup.
- Google Play / RevenueCat Status.
- Future Tools.
- Owner/dev Technical checks.
- Locked/unavailable/planned states.
- No secret values displayed.
- No live-money, checkout, payout, balance, tip, paid-content, or revenue-import action.

Validation run for the scaffold:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:vod-quality-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:provider-readiness-policy`
- `supabase migration list`
- `supabase db lint --linked`
- `supabase db push --dry-run`
- deployed function list proof for `provider-readiness`, `revenuecat-webhook`, and `google-play-webhook`
- unauthenticated readiness curl proof returning auth required
- RevenueCat and Google Play webhook curl proof returning setup required with no grants and no live-money action while webhook secrets are missing
- scoped no-forbidden-copy/no-client-secret/no-fake-activation greps for the changed creator-facing surface
- changed-file proof showing no native Android/Gradle, lockfile, Expo config, LiveKit, Watch-Party, Clip Studio, or Brand Studio behavior files changed
- `git diff --check`
- `git diff --cached --check`

## Current Status

- Provider readiness model: repo-added in migrations `202605250002_provider_link_readiness_scaffold.sql` and `202605250003_provider_readiness_creator_copy.sql`.
- Provider adapters: typed fail-closed interfaces/shells in `supabase/functions/_shared/provider-readiness.ts`.
- Platform Studio: Monetization tab reads sanitized readiness summaries and falls back closed if the summary is unavailable.
- Edge Functions: `provider-readiness`, `revenuecat-webhook`, and `google-play-webhook` are deployed as ACTIVE version 1.
- Webhook shells: RevenueCat and Google Play fail closed; Stripe Connect signed webhook foundation already exists.
- Live money: not active.
- Purchases: unchanged.
- Payouts: unavailable.
- Revenue imports: disabled.
- Tips, paid content, commerce, ad revenue: planned or setup-needed only.
