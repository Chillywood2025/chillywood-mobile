# Creator Monetization Systems Foundation

Last updated: May 25, 2026

This is repo-side and live-schema foundation only. Remote migration `202605140011_creator_monetization_systems_foundation.sql` is applied on the linked Chi'llywood Supabase project, but it does not activate live money, paid-content checkout, tips, merch checkout, cash-out, payouts, production Stripe Connect, or RevenueCat/Google Play purchase proof.

## Doctrine

- Premium is `$9.99/month` through Google Play plus RevenueCat entitlement `premium`.
- Premium subscription revenue belongs to Chi'llywood/platform and is not split with creators.
- Channel is the public creator Platform. Platform Studio is the owner command center for managing it.
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
- reading public Platform commerce rows without checkout;
- preflighting paid-content, tip, and product checkout while live money is off;
- calculating creator balances from immutable ledger rows;
- calculating scheduled payout fee as `$0`;
- calculating the 1.5% no-cap instant cash-out fee;
- requesting payout/cash-out only through server-side RPCs that remain disabled while live-money flags are off.

## Stripe CLI / Connect Proof Status

As of May 16, 2026, Stripe CLI is installed and logged into the Chi'llywood sandbox/test account. CLI read proof can list test-mode Connect accounts and test-mode provider events without printing or committing secret keys. The current local shell does not export `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `STRIPE_CONNECT_CLIENT_ID`, so local Edge Function payment/webhook replay proof cannot be honestly rerun from this shell. Existing deployed Stripe Connect Edge Function secrets remain documented only by secret name/digest in Supabase, not by value.

The Stripe Connect Edge webhook foundation now explicitly recognizes the provider event classes needed by future creator monetization lanes: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `account.updated`, `payout.paid`, `payout.failed`, `transfer.created`, `transfer.reversed`, and `transfer.canceled`. In this foundation state, non-`account.updated` events are signature-verified and idempotently recorded/ignored for audit only; they do not create checkout success, product orders, paid-content access grants, tip earnings, ledger rows, transfers, payouts, or live money.

Live proof after the May 16, 2026 secret repair: Supabase Edge Function secrets include `STRIPE_SECRET_KEY` and a valid-format `STRIPE_WEBHOOK_SECRET` by digest only; `stripe-connect-account`, `stripe-connect-onboarding-link`, and `stripe-connect-account-sync` are deployed as ACTIVE version 32; `stripe-connect-webhook` is deployed as ACTIVE version 34; the stale May 8 test webhook endpoint is disabled; the active May 16 test webhook endpoint points at `stripe-connect-webhook` and is test-mode only; unsigned webhook POST returns `400 invalid_signature`; no-auth account setup returns `401 missing_authorization`; and a Stripe CLI `payment_intent.succeeded` test fixture delivered to the endpoint with pending webhooks returning to zero. That fixture is provider test data only and did not create an app purchase, tip, order, access grant, ledger earning, transfer, payout, or live money action.

Connect readiness proof after the payout-readiness pass: Stripe CLI test-mode account reads show provider accounts with `charges_enabled=false`, `payouts_enabled=false`, requirements due, and no completed KYC/tax readiness. `_lib/creatorPayouts.ts` now derives explicit blocked reasons and next actions from provider readiness, KYC, tax/1099, hold, minimum payout, live-money, payout, cash-out, and Stripe production flags. Platform Studio now shows this in `Monetization > Payouts` and `Monetization > Stripe Setup`; existing backend-created test-mode Stripe setup links and status refresh remain available only where already backed, while payouts/cash-out stay disabled and provider ids, raw requirement JSON, available balances, withdrawals, transfers, and payout release remain hidden. Admin Payouts remains read-only and calls out that provider readiness, KYC, tax/1099, hold clearance, legal/accounting approval, and Owner-approved payout workflow are required before any payout can be called available.

Preproduction test proof on May 16, 2026 moved this from copy-only readiness into real app-test readiness without live money. Using a normal signed-in test creator session, `stripe-connect-account` created a real Stripe test connected account, returned `liveMoneyAction: false`, and created no payout, transfer, or checkout. `stripe-connect-onboarding-link` created a short-lived `connect.stripe.com` onboarding URL when given allowlisted HTTPS return/refresh URLs and did not store the URL long-term. `stripe-connect-account-sync` synced the account back as non-payable: `charges_enabled=false`, `payouts_enabled=false`, `details_submitted=false`, `provider_ready=false`, and `onboarding_status=payouts_disabled`. The same signed-in creator can read only their own payout eligibility row, which remains `provider_ready=false`, `kyc_ready=false`, `tax_ready=false`, `eligible_for_payouts=false`, `minimum_payout_met=false`, and `hold_period_cleared=false`; attempts to directly insert ledger rows are denied by RLS. `request_creator_payout` returns `blocked/payouts_disabled` while live-money flags are off. `calculate_creator_instant_cashout_fee` returns `150` cents for `$100` and `1500` cents for `$1,000`, proving the 1.5% no-cap instant cash-out formula. No fake earnings, balances, payout rows, transfers, payouts, checkout sessions, bank payouts, or live money were created.

`npm run guard:stripe-connect-policy` now pins the Stripe Connect boundary: test-mode-only provider functions, server-side-only Stripe secrets, signed webhook verification, idempotent event storage, no client-owned provider ids, no client money instructions, no transfer/payout/checkout creation, explicit payout-readiness blockers, preproduction dry-run/test labels, owner-approval requirements, scheduled payout fee `$0`, instant cash-out `1.5%` with no cap, and production payouts remain disabled.

## App Surfaces

- Platform Studio has one `Monetization` tab instead of separate `Monetize`, `Payouts`, and `Revenue` tabs. It uses collapsible Overview, Premium and Subscriptions, Revenue, Payouts, Stripe Setup, Google Play / RevenueCat Status, Future Tools, and owner/dev-only Technical checks sections.
- Premium and Subscriptions stays tied to the existing Google Play plus RevenueCat Premium flow; Revenue is read-only with no earnings yet; Payouts and Stripe Setup show setup/readiness only; Google Play / RevenueCat Status shows public-safe store readiness; Future Tools are labeled planned; Technical checks show only public-safe owner/dev details.
- Legacy `tab=monetize`, `tab=payouts`, and `tab=revenue` route params map into the consolidated Monetization tab with the matching section expanded. Normal navigation no longer has duplicate money tabs.
- The public Channel route is product-copy framed as the creator Platform and can show a real active product shelf if backed product rows exist. It still says checkout is pending and does not create product orders.
- The standalone Player checks the creator-paid-content resolver for creator videos. If a backed active paid-content price requires purchase, regular playback does not receive a playable URL and the Player shows a locked paid-creator-content state instead of guessing from the client.
- Platform Studio remains the creator command center; Channel remains the public Platform. Technical route/table names are unchanged in this lane.
- A new AAB was not built in this lane. Because Platform Studio/Admin copy changed, a later batched internal-test AAB is needed before device testers see the updated payout readiness wording.

## Current Status

- Live schema: installed. `supabase migration list` shows `202605140011` local and remote, post-apply `supabase db push --dry-run` reports the remote database is up to date, and `supabase db lint --linked --schema public --fail-on error` passes.
- Live safety proof: `monetization_settings_json` returns every live-money flag as `false`; anon REST direct writes to `creator_earnings_ledger`, `paid_content_purchases`, `creator_tip_transactions`, and `creator_payout_requests` are denied; anon paid-content access resolver calls return safe unavailable/free/locked decisions without granting money access.
- Paid creator checkout: foundation only, disabled.
- Creator pricing: backed RPC foundation, disabled until server flag and Premium entitlement proof are ready.
- Tips: data model and preflight foundation only, disabled.
- Merch/products/clothing: product listing foundation only, disabled.
- Creator earnings: append-only ledger foundation only, no fake rows.
- Cash-out/payouts: fee and request foundation is preproduction-testable, but execution remains disabled. Test proof can create/reuse Connect test accounts, generate onboarding links, sync readiness, and prove blocked payout requests; no live payout or cash-out exists.
- Stripe CLI/Connect: sandbox CLI read proof is available; deployed webhook proof is repaired; unsigned webhook and no-auth account setup fail closed; authenticated test creator account creation, onboarding-link creation, and account sync are proved; payout readiness is explicit and non-payable. Real KYC/tax completion, production Connect, owner-approved execution, provider/legal/accounting approval, and live money remain blocked.
- Paid creator content playback enforcement: repo-side Player/resolver integration exists; live proof still requires remote migration apply, backed price rows, real purchase/access grants, and provider webhook proof.
- Stripe Connect production: not live.
- RevenueCat/Google Play Premium purchase proof: current internal-test proof exists from the Premium lane, but this Monetization consolidation did not change purchase, restore, or entitlement logic.

## Production Payout Readiness Checklist

Production payout and live cash-out remain closed until every item below is proved and documented:

- Stripe production account active and production secrets stored server-side only;
- production webhook endpoint live with signature verification and idempotency;
- production Connect onboarding works for real creators;
- connected account KYC, tax, transfer, and payout capabilities are complete;
- 1099/reporting plan and Chi'llywood legal/accounting responsibility are approved;
- Owner-approved payout workflow is backed and audited;
- refund, chargeback, reserve, fraud, DMCA, suspension, hold, and minimum payout policy is enforced;
- failed payout reconciliation is proved;
- `LIVE_MONEY_ENABLED`, `PAYOUTS_ENABLED`, `CASHOUT_ENABLED`, and `STRIPE_CONNECT_PRODUCTION_ENABLED` are reviewed and server-controlled;
- no Stripe secret, service account JSON, or provider secret appears in the mobile bundle, repo, docs, proof artifacts, or logs.

Until then, production payouts closed: **no**. Live cash-out closed: **no**. Full creator monetization production-live: **no**.

## Safety Rules

- Mobile clients cannot directly write earnings ledgers, paid purchase success, access grants, payout paid status, or webhook processed status.
- Owner/Admin visibility is read-only/foundation unless a later server-side workflow explicitly enables an action.
- Moderators have no money access.
- No provider secret belongs in React Native, docs, screenshots, logs, proof artifacts, or committed files.
- Do not claim live money until provider, legal, tax/accounting, fraud, refund/chargeback, webhook, idempotency, and audit proof all pass.
