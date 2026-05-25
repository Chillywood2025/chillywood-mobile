# NEXT TASK

## Recommended Lane: Monetization Provider Readiness Proof Pass

Platform Studio money navigation is no longer a known UI blocker.

Closed truth:

- Platform Studio now has one user-facing `Monetization` tab instead of separate `Monetize`, `Payouts`, and `Revenue` tabs.
- Monetization contains collapsible sections for Overview, Premium and Subscriptions, Revenue, Payouts, Stripe Setup, Google Play / RevenueCat Status, Future Tools, and owner/dev-only Technical checks.
- Legacy route params map safely: `tab=monetize`, `tab=payouts`, and `tab=revenue` normalize to `tab=monetization`, and section focus params open the relevant Monetization accordion.
- Quick Actions now route money-related entry points into Monetization sections instead of dead duplicate tabs.
- Money tools remain locked unless backed. The UI creates no fake earnings, balances, withdrawals, transfers, checkout, paid products, payout release, fake Premium access, or live money movement.
- Premium gates, RevenueCat entitlement checks, Stripe live-money behavior, creator gates, LiveKit, Watch-Party Live, Live Watch-Party, Clip Studio, Brand Studio, creator video upload/publish/delete, packages, native Android/Gradle config, migrations, and public card rendering were not changed.
- Android proof on `R5CR120QCBF` is outside the repo at `/tmp/chillywood-proof-2026-05-25T19-11-29Z-platform-studio-monetization/`.

The next monetization lane should be proof-only unless product explicitly asks for implementation:

- Verify current Premium store readiness from the existing subscription flow without changing entitlement logic.
- Verify RevenueCat public runtime status and Google Play product/offering status without printing private keys or credentials.
- Verify Stripe Connect setup/readiness state through existing backend/test-mode paths only.
- Keep payouts unavailable unless provider readiness, KYC/tax, legal/accounting review, owner approval, and production-live flags are truly proved.
- Do not add checkout, paid products, tips, paid content, balances, withdrawals, transfers, payout release, creator earnings, fake revenue, or fake Premium access.
- Keep the consolidated Monetization tab as the only creator-facing Platform Studio money area.
- Keep LiveKit, Watch-Party routes, Premium gates, public renderer behavior, creator upload/publish behavior, native Android files, Gradle files, Expo config, and package files untouched unless a future exact lane explicitly owns them.

Validation should include `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, `npm run guard:vod-quality-policy`, `npm run guard:platform-brand-studio-policy`, `npm run guard:clip-studio-policy`, existing Watch-Party LiveKit and old-room handling guards, targeted no-fake-money/no-secret/no-debug-copy/no-old-money-tab proofs, Android proof if UI changes, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Clip Studio Metadata-Only Trim Preview remains a valid later lane: add `trim_start_ms` / `trim_end_ms` metadata-only controls only if product wants preview range before launch, keep public Player unchanged unless a separate VOD renderer lane owns it, and do not claim export or permanent cuts.

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty.

Security Request Context follow-ups remain valid: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
