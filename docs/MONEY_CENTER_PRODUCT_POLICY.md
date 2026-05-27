# Money Center Product Policy

Last updated: May 27, 2026

Money Center is the creator-facing source of truth for money readiness in Platform Studio. It consolidates the old Monetize, Revenue, Payouts, provider-readiness, Premium, Stripe, RevenueCat, Google Play, tips, paid content, Watch-Party seats, merch, creator balance, tax/legal, and payout-readiness surfaces into one collapsible readiness area.

This is a readiness, consolidation, and Owner/Admin control layer only. It does not activate live money, checkout, paid access, tips, merch sales, balances, withdrawals, transfers, payouts, or purchase verification.

## Payment Rules

- Android digital access inside the app uses Google Play Billing and RevenueCat where required by policy. Google Play's Payments policy says Play-distributed apps charging for in-app features, services, digital content, or digital goods must use Google Play billing unless an eligible policy path applies: https://support.google.com/googleplay/android-developer/answer/9858738
- RevenueCat remains the Premium/subscription entitlement integration. Webhooks must be authenticated and idempotent because RevenueCat may deliver duplicate events: https://www.revenuecat.com/docs/integrations/webhooks
- Stripe Connect is for creator payout onboarding and future payout operations, not Android digital purchase collection. Stripe documents Connect as a platform/marketplace system for connected accounts, balances, and payouts: https://docs.stripe.com/connect
- Physical merch can use Stripe, Shopify, or another approved merch checkout later because physical goods are separate from Android digital app access.
- Chi'llwood's internal ledger is the source of future creator-balance truth. Provider balances alone are not creator payable balance truth.
- Refunds, reversals, fraud holds, taxes, provider fees, app-store fees, disputes, moderation holds, and policy checks can reduce pending or available balances.
- No payout is available until purchase verification, refund/reversal handling, fraud checks, payout setup, tax/legal/KYC readiness, provider checks, and owner-approved policy checks pass.

## Owner/Admin Kill Switches

Migration `202605270001_platform_money_kill_switches.sql` adds backend-enforced Money Center switches and append-only audit:

- `platform_money_kill_switches`
- `platform_money_kill_switch_audit`
- creator-safe `get_money_feature_flags_summary()`
- owner/operator `get_platform_money_kill_switches()`
- owner/operator `list_platform_money_kill_switch_audit()`
- audited owner/operator `set_platform_money_kill_switch_state()`
- backend action guards `is_money_feature_allowed()` and `assert_money_feature_allowed()`

Allowed states are `off`, `on`, `locked`, `maintenance`, and `sandbox_only`.

Required switch defaults:

| Switch | Default |
| --- | --- |
| `money_center_visible` | `on` |
| `digital_sales_enabled` | `off` |
| `tips_enabled` | `off` |
| `watch_party_seats_enabled` | `off` |
| `paid_content_enabled` | `off` |
| `merch_enabled` | `off` |
| `creator_balance_visible` | `on` |
| `payouts_enabled` | `off` |
| `stripe_connect_enabled` | `sandbox_only` |
| `revenuecat_google_play_enabled` | `sandbox_only` |
| `provider_webhooks_enabled` | `sandbox_only` |
| `live_money_enabled` | `off` |

Optional scaffold switches default to `sandbox_only` for creator monetization readiness and `off` for creator revenue imports, tax/KYC collection, ads revenue, and sponsorships.

Rules:

- `off` shows disabled/setup copy to creators.
- `locked` and owner-only reasons are visible only in Owner/Admin controls.
- `maintenance` shows temporary unavailability.
- `sandbox_only` allows provider test proof and readiness review but no production money.
- `on` still requires provider readiness and, for live-money actions, `live_money_enabled=on`.
- `live_money_enabled` stays off unless a later explicit launch lane documents provider proof, legal/accounting approval, rollback proof, and owner approval.
- High-risk switches require confirmation and a reason: `live_money_enabled`, `payouts_enabled`, `digital_sales_enabled`, `tips_enabled`, `watch_party_seats_enabled`, `paid_content_enabled`, `stripe_connect_enabled`, and `provider_webhooks_enabled`.
- High-risk switch changes write both Money switch audit and immutable admin audit; future money actions must call backend guards and fail closed if the switch or audit path blocks.

## Money Center Sections

- Overview: active/locked/next-step summary plus short payment rules.
- Digital Sales: Premium, digital passes, paid creator content, and other app digital access readiness.
- Tips: planned digital-support readiness with no fake tip totals or checkout.
- Watch-Party Seats: planned viewer/VIP/speaker/event/room-access seat readiness without changing room authority.
- Paid Content: planned paid videos, replays, posts, and collections with entitlement checks required.
- Merch: physical goods only, separate from digital app unlocks.
- Creator Balance: ledger-first pending/available/paid/refunded/reversed/blocked status.
- Payouts: Stripe Connect setup/readiness only, no payout execution.
- Tax & Legal: tax profile, identity/KYC, payout terms, refunds/reversals, and policy links.
- Provider Status: sanitized provider readiness from the backend-owned readiness summary.
- Future Tools: planned subscriptions, sponsorships, ads, and revenue imports.
- Technical Checks: owner/dev-only public-safe readiness details, never secret values.

## Surface Audit And Consolidation

| Path | Current purpose | Backing | Consolidation decision |
| --- | --- | --- | --- |
| `app/channel-settings.tsx` | Platform Studio, old Monetization tab, payout setup UI, provider readiness readout | UI plus safe helpers/RPCs | Kept as the single Money Center surface; old Revenue/Payouts/Store/Stripe sections are section anchors inside Money Center. |
| `app/monetize.tsx` | Old route compatibility | Redirect only | Redirects to `Money Center > Overview`. |
| `app/revenue.tsx` | Old route compatibility | Redirect only | Redirects to `Money Center > Creator Balance`. |
| `app/payouts.tsx` | Old route compatibility | Redirect only | Redirects to `Money Center > Payouts`. |
| `app/creator-monetization.tsx` | Creator monetization policy page | Static legal/policy copy | Kept as the Tax & Legal policy destination. |
| `app/subscribe.tsx` | Premium subscription UI | Existing RevenueCat/Google Play flow | Kept; Money Center links to it without changing Premium gates. |
| `app/channel/[userId].tsx` | Public Platform store/product readout | Public-safe rows only | Kept outside Money Center; no checkout is activated. |
| `app/player/[id].tsx` | Creator-paid content access lock/read path | Existing resolver/RPC foundation | Kept; Money Center documents paid-content readiness without changing Player behavior. |
| `app/admin.tsx` | Owner/admin Revenue/Payouts/finance readiness readouts | Admin-only/foundation helpers | Kept owner/admin-only; not a creator-facing duplicate Money Center. |
| `_lib/moneyFeatureFlags.ts` | Sanitized Money switch reader and owner/admin writer helpers | Money kill-switch RPCs | Added; normal creators read sanitized states only, owner/admin writes require backend RPC and audit. |
| `_lib/providerReadiness.ts` | Sanitized readiness summary reader | `get_provider_readiness_summary()` | Kept as the visible readiness source for Money Center. |
| `_lib/paymentRailPolicy.ts` | Client-side payment rail doctrine | Static policy helper | Kept; Money Center copy follows it. |
| `_lib/creatorMonetization.ts` | Default-off monetization foundation helpers | Fail-closed RPCs/tables | Kept; no live money flags changed. |
| `_lib/creatorPayouts.ts` | Creator payout readiness, Stripe test-mode setup helpers | Edge Functions/RPCs | Kept; Money Center shows readiness and no payout execution. |
| `_lib/monetization.ts`, `_lib/revenuecat.ts`, `_lib/premiumEntitlements.ts` | Premium/RevenueCat entitlement configuration | Existing Premium path | Kept unchanged. |
| `_lib/platformFinance.ts` | Admin finance foundation readouts | Admin/foundation tables | Kept admin-only; not creator-facing balance truth. |
| `supabase/functions/provider-readiness` | Sanitized provider readiness Edge Function | Authenticated server read | Kept; returns no secrets and no live money action. |
| `supabase/functions/revenuecat-webhook` | Fail-closed RevenueCat webhook shell | Server secret required | Kept; must be idempotent before active purchase handling. |
| `supabase/functions/google-play-webhook` | Fail-closed Google Play webhook shell | Server secret required | Kept; grants no subscription while setup is incomplete. |
| `supabase/functions/stripe-connect-*` | Stripe Connect test-mode setup/sync/webhook foundations | Backend-only Edge Functions | Kept for payout readiness; no Android digital checkout. |
| `supabase/functions/stripe-connect-transfer-create`, `payout-release-preflight` | Admin/operator preflight refusals | Backend-only | Kept closed; no transfer or payout execution. |
| `supabase/migrations/202605140011_creator_monetization_systems_foundation.sql` | Default-off money tables/RPCs including ledger/idempotency | Remote-applied schema | Kept; no fake entries or active live-money rows. |
| `supabase/migrations/202605250002_provider_link_readiness_scaffold.sql` and `202605250004_provider_link_sandbox_proof_status.sql` | Provider readiness source and sandbox proof rows | Remote-applied schema | Kept as readiness truth; only Stripe webhook signature is sandbox-ready. |
| `supabase/migrations/202605270001_platform_money_kill_switches.sql` | Backend Money switch state, audit, sanitized creator RPC, owner/admin write RPC, backend action guards | New schema | Added; defaults are fail-closed and no live money is enabled. |
| `docs/CREATOR_MONETIZATION_SYSTEMS_FOUNDATION.md` | Monetization foundation docs | Documentation | Updated to point creator-facing UI to Money Center. |
| `docs/PROVIDER_LINK_READINESS_RUNBOOK.md` | Provider readiness runbook | Documentation | Updated to point provider status to Money Center. |
| `scripts/guard-*money*` and related policy guards | Static safety checks | Node scripts | Updated/added Money Center guard coverage. |

No separate creator-facing Monetize, Revenue, or Payouts top-level tabs remain in Platform Studio. Admin Revenue and Admin Payouts remain admin-only operational/foundation readouts, not normal creator dashboards.

## Ledger Model

The repo already has an append-only `creator_earnings_ledger` foundation from `202605140011_creator_monetization_systems_foundation.sql`. Money Center treats ledger rows as the only future source for creator balance display. The UI shows `No verified earnings yet` until real verified ledger rows exist.

Future ledger rows must retain:

- creator id;
- provider/source event id and idempotency key;
- product type and product id;
- gross amount, taxes, provider/app-store fees, platform fee, creator share, refunds, reversals, and net amounts;
- status: `pending`, `available`, `paid`, `refunded`, `reversed`, or `blocked`;
- available date, payout batch id, and immutable audit timestamps.

Normal mobile clients must not write ledger rows, payout paid states, provider processed states, or balance totals.

## Webhook And Idempotency Rules

- Every provider event must have a provider event id.
- Duplicate provider events must not create duplicate ledger rows.
- Refunds/reversals must adjust prior entries before payout availability.
- Webhook shells fail closed without valid signature/auth.
- `provider_webhooks_enabled=off` means webhooks may audit readiness only and must not activate money.
- Sandbox events cannot mark production readiness active.
- `live_money_enabled=off` blocks all live-money claims/actions.
- No event can create a payout without a separate owner-approved payout workflow.

## Android Proof

Money Center Android proof should capture Platform Studio tab row, first view, each collapsed/expanded Money Center section, Provider Status, Technical Checks hidden or owner/dev-only, old Monetize/Revenue/Payouts route redirects, locked/setup-needed states, no fake money, and no secrets.

Screenshots must stay outside the repo.

May 26, 2026 proof result: `R5CR120QCBF` captured the consolidated tab row, Money Center first view, Overview, Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Payouts, Tax & Legal, Provider Status, Future Tools, and owner/dev Technical Checks at `/tmp/chillywood-money-center-proof-20260526-r5/`. The screenshots show locked/setup-needed/sandbox-ready states, no duplicate money tabs, no fake money actions, no Stripe checkout for Android digital access, and no provider secret values.

May 27, 2026 proof status: repo-side switch integration is implemented and validated by typecheck/guards. Android screenshots for Owner/Admin Money Controls, high-risk confirmation, and kill-switch-off reflection in creator Money Center remain pending unless captured in a later `/tmp` proof folder.

## Remaining Limitations

- RevenueCat and Google Play server/webhook secrets still need provider credential linking and sandbox event proof before production-active status.
- Stripe Connect production payout readiness, tax/KYC completion, owner approval, and payout execution remain blocked.
- Paid content, tips, Watch-Party seats, merch checkout, sponsorships, ads, and revenue imports remain planned/readiness-only.
- No live money was activated by this consolidation.
- Owner/Admin switches are a control scaffold, not payout or checkout activation.
