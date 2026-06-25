# Creator-Money Custom Pricing Policy

Date: 2026-06-25

Verdict: Prepared / fail-closed.

This policy prepares future creator-configurable prices for the app without enabling arbitrary checkout amounts, live money, creator-money switches, payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect payouts, merch checkout, provider refunds, Premium changes, or public purchase activation.

Custom pricing is allowed only through verified provider-supported price paths.

Approved starting prices are launch defaults, not the only future prices.

Future custom pricing requires provider-backed price tiers/products/base plans/offers.

Unsupported custom amounts fail closed.

Creator-money switches remain OFF.

Premium remains unchanged.

United States only first.

Stripe payouts remain OFF.

Stripe merch checkout remains OFF.

Provider refunds remain manual/external.

No creator-money product maps to Premium.

Current provider setup status: Blocked. Google Play has the channel subscription product record `cw_channel_subscription_monthly_499`, but the `monthly` base plan is missing because the approved US-only auto-renewing Monthly USD 4.99 draft failed with `Your changes couldn't be saved`. The one-time production product IDs are absent from the Google Play catalog because Google Play rejects the owner-approved purchase-option IDs with underscores; the field accepts lowercase letters, numbers, and hyphens only. RevenueCat import/mapping remains blocked until matching Google Play products/base plans exist.

Creator-money tax/legal/compliance plan: Partial. `docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md` documents provider-backed/fail-closed custom pricing boundaries, must-stop tax/legal/compliance fields, allowed proceed fields, and the rule that Codex must not guess tax/legal/compliance fields.

## Policy Rules

1. The app must not accept arbitrary custom amounts that do not map to a verified Google Play / RevenueCat product, price tier, base plan, offer, or owner-approved product catalog entry.
2. Creator-facing custom price controls must show only approved provider-backed prices.
3. Each creator-money flow must fail closed if the selected price is not provider-backed.
4. Owner/operator can add more price tiers later only by creating provider products, base plans, offers, or approved catalog entries and mapping them in the app catalog.
5. Sandbox/test product IDs must remain separate from production product IDs.
6. Production-labeled IDs must not be called sandbox.
7. No custom price may imply payouts are live while payouts remain OFF.
8. No future custom price may imply Premium access unless it is the Premium product.

## Flow Matrix

| Flow | Launch default | Future custom method | Provider-backed? | Fail-closed? | Status |
| --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099`, `$0.99`, United States only first | Additional tip products or approved provider-backed price tiers | Yes | Yes | Prepared / blocked until provider products exist |
| Paid Video | `cw_paid_content_access_099`, `$0.99`, United States only first | Creator selects from approved paid-video price tiers mapped to provider products | Yes | Yes | Prepared / blocked until provider products exist |
| Watch-Party Ticket | `cw_watch_party_ticket_099`, `$0.99`, United States only first | Creator selects from approved ticket price tiers mapped to provider products | Yes | Yes | Prepared / blocked until provider products exist |
| Channel Subscription | `cw_channel_subscription_monthly_499`, base plan `monthly`, `$4.99/month`, United States only first | Approved subscription products, base plans, or offers only | Yes | Yes | Prepared / blocked until provider products exist |
| VIP | `cw_vip_pass_499`, `$4.99`, United States only first | Approved VIP price tiers mapped to provider products | Yes | Yes | Prepared / blocked until provider products exist |
| Event Pass | `cw_event_pass_099`, `$0.99`, United States only first | Approved event pass price tiers mapped to provider products | Yes | Yes | Prepared / blocked until provider products exist |

## Failure Behavior

If a selected creator price is not present in the approved provider-backed catalog:

- do not create a purchase intent;
- do not open Google Play or RevenueCat purchase UI;
- do not create an access grant, ledger row, payout, payable balance, or creator earning;
- show safe unavailable/setup copy;
- record sanitized support/readback evidence only where already allowed.

## Future Owner Actions

1. Create the required Google Play products, base plans, offers, or price tiers for every future price.
2. Import or map the exact products in RevenueCat.
3. Update the app catalog with only verified provider-backed entries.
4. Re-run provider verification and Play-installed smoke before activation.
5. Keep all creator-money switches OFF until owner approval and controlled proof.
