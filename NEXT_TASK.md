# NEXT TASK

## Recommended Lane: Provider Credentials Linking And Sandbox Proof

Provider-link readiness scaffolding is now in place. The next monetization lane should link and prove real provider setup one provider at a time, without turning on live money by default.

Closed truth:

- Backend-owned readiness source of truth exists in `provider_readiness_status` with append-only `provider_readiness_audit_log`.
- Sanitized UI read path exists through `get_provider_readiness_summary()` and `_lib/providerReadiness.ts`.
- Platform Studio Monetization reads readiness for Premium, Revenue, Payouts, Stripe Setup, Google Play / RevenueCat Status, Future Tools, and owner/dev Technical checks.
- Fail-closed Edge shells exist for `provider-readiness`, `revenuecat-webhook`, and `google-play-webhook`; existing Stripe Connect webhook policy remains separate and guarded.
- No seeded readiness row is `active`, and no seeded row enables live money.
- No purchases, checkout, tips, paid content, balances, earnings, withdrawals, transfers, payouts, revenue imports, or fake Premium access were added.
- No packages, native Android/Gradle config, Expo config, LiveKit, Watch-Party, Clip Studio, Brand Studio, creator upload/publish/delete, public renderer, Premium entitlement decision, RevenueCat purchase/restore behavior, or Stripe live-money behavior changed.
- Android proof on `R5CR120QCBF` is outside the repo at `/tmp/chillywood-proof-2026-05-25T21-33-35Z-provider-link-readiness/`.
- Provider-link runbook is `docs/PROVIDER_LINK_READINESS_RUNBOOK.md`.

Recommended next lane:

- Link provider secrets only in approved server/provider secret stores, never in repo.
- Prove RevenueCat webhook signature handling with valid and invalid events.
- Prove Google Play webhook/Pub/Sub handling with valid and invalid events.
- Prove Stripe/Stripe Connect webhook readiness in test mode only.
- Confirm Premium entitlement behavior remains the existing RevenueCat path.
- Keep `CHILLYWOOD_LIVE_MONEY_ENABLED`, payout release, checkout, tips, paid content, balances, and revenue imports disabled unless a later exact lane proves them.
- Update readiness rows to `configured`, `ready_for_review`, or `sandbox_ready` only when the proof supports that status; do not set `active` without provider proof, owner approval, rollback proof, audit proof, and product/legal/accounting sign-off.

Validation should include `npm run typecheck`, `npm run validate:runtime`, all monetization/payment/Stripe/provider readiness guards, existing Brand Studio and Clip Studio guards, existing Watch-Party LiveKit and old-room handling guards, Supabase migration/lint/dry-run checks if schema changes, valid/invalid webhook proof, no-secret-output proof, no-live-money proof, Android Monetization proof if UI changes, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Clip Studio Metadata-Only Trim Preview remains a valid later lane: add `trim_start_ms` / `trim_end_ms` metadata-only controls only if product wants preview range before launch, keep public Player unchanged unless a separate VOD renderer lane owns it, and do not claim export or permanent cuts.

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty.

Security Request Context follow-ups remain valid: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
