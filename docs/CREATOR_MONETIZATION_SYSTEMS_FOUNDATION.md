# Creator Monetization Systems Foundation

Last updated: May 15, 2026

This is repo-side and live-schema foundation only. Remote migration `202605140011_creator_monetization_systems_foundation.sql` is applied on the linked Chi'llywood Supabase project, but it does not activate live money, paid-content checkout, tips, merch checkout, cash-out, payouts, production Stripe Connect, or RevenueCat/Google Play purchase proof.

## Doctrine

- Premium is `$9.99/month` through Google Play plus RevenueCat entitlement `premium`.
- Premium subscription revenue belongs to Chi'llywood/platform and is not split with creators.
- Channel is the public creator mini platform. Platform Studio is the owner command center for managing it.
- Premium creators may later mark eligible content free or paid and set prices where backed.
- Viewers do not need Premium to buy creator paid content or products.
- Premium subscription alone does not unlock creator paid content.
- Paid creator content uses creator 80% net and Chi'llywood 20% net after fees, taxes, refunds, chargebacks, and adjustments.
- Creators keep 100% of the tip amount/net tip. Any service, platform, provider, cash-out, or instant-payout fee must be separate and disclosed where allowed.
- Tips do not unlock badges, emojis, rankings, VIP perks, paid access, special content, or digital goods.
- Scheduled payouts are free. Optional instant cash-out is planned at 1.5% with no default cap, subject to Stripe/provider/legal/accounting review.
- Stripe Connect is the creator payout/commerce direction. RevenueCat remains Premium subscription entitlement truth.

## Payment Rail Policy Foundation

Repo-side rail policy is explicit in `_lib/paymentRailPolicy.ts` for app/readout callers and `supabase/functions/_shared/payment-rail-policy.ts` for future server-side checkout functions:

- Premium subscription: Google Play plus RevenueCat only. Stripe must not sell or grant Premium.
- Android digital paid creator content: Google Play Billing or an explicitly approved Play billing/external-offers path is required before checkout can open. Stripe is default-blocked for Android in-app digital access.
- Creator-support tips: Stripe/checkout may be used only if tips unlock nothing: no paid access, VIP treatment, badges, rankings, emojis, special content, or other digital goods/perks.
- Physical merch/products/clothing: Stripe or another commerce provider can be used later when provider, tax, shipping, refund, dispute, and legal readiness are proved.
- Creator payout/cash-out: Stripe Connect is the planned rail, but payouts and cash-out remain disabled until Connect, KYC/tax, webhook, legal/accounting, and Owner-approved payout proof pass.

`npm run guard:payment-rail-policy` prevents drift in those rail boundaries. The guard does not enable checkout, payment intents, transfers, payouts, or RevenueCat purchases.

## Implemented Foundation

Migration `202605140011_creator_monetization_systems_foundation.sql` adds:

- server-backed monetization settings with every live-money flag defaulted off;
- creator monetization profiles;
- creator content prices;
- paid content purchases;
- content access grants;
- creator product listings;
- creator product orders;
- creator tip transactions;
- append-only creator earnings ledger;
- creator payout requests;
- monetization webhook event idempotency table;
- monetization audit log.

The migration also adds RPC foundations:

- `set_creator_content_price`
- `resolve_creator_content_access`
- `create_creator_product_listing`
- `calculate_creator_payout_balances`
- `calculate_creator_instant_cashout_fee`
- `request_creator_payout`
- `creator_monetization_checkout_preflight`

These RPCs fail closed while server flags are off. They do not trust client-side purchase success, do not mark money paid, do not write fake earnings, and do not execute provider payouts.

Client helpers in `_lib/creatorMonetization.ts` now expose the safe repo-side paths for:

- reading default-off runtime flags and foundation counts;
- resolving creator-paid content access;
- reading public mini platform commerce rows without checkout;
- preflighting paid-content, tip, and product checkout while live money is off;
- calculating creator balances from immutable ledger rows;
- calculating the 1.5% no-cap instant cash-out fee;
- requesting payout/cash-out only through server-side RPCs that remain disabled while live-money flags are off.

## App Surfaces

- Platform Studio has a `Monetize` tab with disabled/foundation states for paid content pricing, tips/support, merch/products, checkout, cash-out, payout rows, split doctrine, and Premium/Paid-content separation.
- The public Channel route is product-copy framed as the creator `Mini Platform` and can show a real active product shelf if backed product rows exist. It still says checkout is pending and does not create product orders.
- The standalone Player checks the creator-paid-content resolver for creator videos. If a backed active paid-content price requires purchase, regular playback does not receive a playable URL and the Player shows a locked paid-creator-content state instead of guessing from the client.
- Platform Studio remains the creator command center; Channel remains the public mini platform. Technical route/table names are unchanged in this lane.

## Current Status

- Live schema: installed. `supabase migration list` shows `202605140011` local and remote, post-apply `supabase db push --dry-run` reports the remote database is up to date, and `supabase db lint --linked --schema public --fail-on error` passes.
- Live safety proof: `monetization_settings_json` returns every live-money flag as `false`; anon REST direct writes to `creator_earnings_ledger`, `paid_content_purchases`, `creator_tip_transactions`, and `creator_payout_requests` are denied; anon paid-content access resolver calls return safe unavailable/free/locked decisions without granting money access.
- Paid creator checkout: foundation only, disabled.
- Creator pricing: backed RPC foundation, disabled until server flag and Premium entitlement proof are ready.
- Tips: data model and preflight foundation only, disabled.
- Merch/products/clothing: product listing foundation only, disabled.
- Creator earnings: append-only ledger foundation only, no fake rows.
- Cash-out/payouts: request/fee foundation only, disabled.
- Paid creator content playback enforcement: repo-side Player/resolver integration exists; live proof still requires remote migration apply, backed price rows, real purchase/access grants, and provider webhook proof.
- Stripe Connect production: not live.
- RevenueCat/Google Play Premium purchase proof: still externally blocked until release-like Android purchase/restore/entitlement proof passes.

## Safety Rules

- Mobile clients cannot directly write earnings ledgers, paid purchase success, access grants, payout paid status, or webhook processed status.
- Owner/Admin visibility is read-only/foundation unless a later server-side workflow explicitly enables an action.
- Moderators have no money access.
- No provider secret belongs in React Native, docs, screenshots, logs, proof artifacts, or committed files.
- Do not claim live money until provider, legal, tax/accounting, fraud, refund/chargeback, webhook, idempotency, and audit proof all pass.
