# Creator Monetization Systems Foundation

Last updated: May 14, 2026

This is repo-side foundation only. It does not activate live money, paid-content checkout, tips, merch checkout, cash-out, payouts, production Stripe Connect, or RevenueCat/Google Play purchase proof.

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

## Current Status

- Paid creator checkout: foundation only, disabled.
- Creator pricing: backed RPC foundation, disabled until server flag and Premium entitlement proof are ready.
- Tips: data model and preflight foundation only, disabled.
- Merch/products/clothing: product listing foundation only, disabled.
- Creator earnings: append-only ledger foundation only, no fake rows.
- Cash-out/payouts: request/fee foundation only, disabled.
- Stripe Connect production: not live.
- RevenueCat/Google Play Premium purchase proof: still externally blocked until release-like Android purchase/restore/entitlement proof passes.

## Safety Rules

- Mobile clients cannot directly write earnings ledgers, paid purchase success, access grants, payout paid status, or webhook processed status.
- Owner/Admin visibility is read-only/foundation unless a later server-side workflow explicitly enables an action.
- Moderators have no money access.
- No provider secret belongs in React Native, docs, screenshots, logs, proof artifacts, or committed files.
- Do not claim live money until provider, legal, tax/accounting, fraud, refund/chargeback, webhook, idempotency, and audit proof all pass.
