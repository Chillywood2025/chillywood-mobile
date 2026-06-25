# Creator Money One-Time Product Readback

Date: 2026-06-25

Verdict: Closed for the five one-time product readback.

Five one-time creator-money products: Verified. Products remain Draft unless explicitly activated later. Creator-money switches remain OFF. `live_money_enabled` remains OFF. Premium remains separate. No creator-money product maps to Premium. Payouts remain OFF. Provider refunds remain manual/external. Activation requires a separate owner-approved proof lane.

This is a read-only provider verification lane. No Google Play product was created, edited, saved, activated, submitted, or repriced. No RevenueCat product, entitlement, offering, package, or mapping was changed. No Premium, creator-money, live-money, payout, Stripe, merch, or provider-refund behavior was activated.

## Google Play Readback Matrix

Browser dashboard evidence was read from Google Play Console for package `com.chillywood.mobile`. No private dashboard screenshots or provider account private identifiers were saved.

| Flow | Product ID | Purchase option ID | Product type | Status | Price | Region / availability | Public display name | Public short description | Warning / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099` | `tip-099` | One-time product / Buy purchase option | Draft | `USD 0.99` | United States available; new countries/regions not available | Creator Tip | Send optional support to a creator. Tips do not unlock content. | None visible; not active |
| Paid Video | `cw_paid_content_access_099` | `paid-video-099` | One-time product / Buy purchase option | Draft | `USD 0.99` | United States available; new countries/regions not available | Paid Video Access | Unlock access to one paid creator video. | None visible; not active |
| Watch-Party Ticket | `cw_watch_party_ticket_099` | `ticket-099` | One-time product / Buy purchase option | Draft | `USD 0.99` | United States available; new countries/regions not available | Watch-Party Ticket | Unlock access to one ticketed Watch-Party room. | None visible; not active |
| VIP | `cw_vip_pass_499` | `vip-499` | One-time product / Buy purchase option | Draft | `USD 4.99` | United States available; new countries/regions not available | Creator VIP Pass | Unlock creator-specific VIP access. | None visible; not active |
| Event Pass | `cw_event_pass_099` | `event-099` | One-time product / Buy purchase option | Draft | `USD 0.99` | United States available; new countries/regions not available | Creator Event Pass | Unlock access to one paid creator event. | None visible; not active |

Google Play list readback also showed each of the five products with `0` active purchase options/offers. The product detail pages showed each expected purchase option in `Draft` state and did not show any unexpected public activation.

## RevenueCat Readback Matrix

Browser dashboard evidence was read from the RevenueCat Product Catalog for the Android Play Store app. No RevenueCat mapping was changed.

| Flow | Product ID | Store status | Product type | Entitlement attachment | Offering/package attachment | Premium mapping safe? | Readback status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099` | Draft | Consumable | None; `Attach` is shown | None visible | Yes, not attached to `premium` | Verified |
| Paid Video | `cw_paid_content_access_099` | Draft | Consumable | None; `Attach` is shown | None visible | Yes, not attached to `premium` | Verified |
| Watch-Party Ticket | `cw_watch_party_ticket_099` | Draft | Consumable | None; `Attach` is shown | None visible | Yes, not attached to `premium` | Verified |
| VIP | `cw_vip_pass_499` | Draft | Consumable | None; `Attach` is shown | None visible | Yes, not attached to `premium` | Verified |
| Event Pass | `cw_event_pass_099` | Draft | Consumable | None; `Attach` is shown | None visible | Yes, not attached to `premium` | Verified |

RevenueCat Premium separation was preserved: Premium remains represented by `premium_subscription:monthly` with entitlement `premium`; none of the five creator-money one-time products appeared as a Premium entitlement or Premium offering/package attachment.

## Switch / Off-State Proof

| Control | State | Evidence |
| --- | --- | --- |
| Creator-money switches | OFF | Switchboard/proof docs keep Tips, Paid Video, Watch-Party Ticket, VIP, and Event Pass disabled by default. |
| `live_money_enabled` | OFF | Money switchboard and proof scripts keep global live-money activation off. |
| Premium public activation | OFF | Premium purchase shell remains closed by default; this lane did not touch Premium setup. |
| Payouts/payable balances/withdrawals/cash-out/transfers | OFF | Money Center policy and proof scripts keep payout movement off. |
| Stripe payout/merch | OFF | Stripe remains future-only for creator payouts and physical merch. |
| Provider refunds | Manual/external | Refund/support policy remains manual/external; no provider refund was executed. |
| RevenueCat mappings | Unchanged | Five one-time products remain Draft consumables with no entitlement attachment and no Premium mapping. |

## Blocker / Warning List

| Item | Status | Impact |
| --- | --- | --- |
| Five one-time creator-money products | Verified as Draft/read-only | Safe for future owner-approved activation planning, not active for public purchase. |
| Channel Subscription | Provider-blocked | Google Play product exists but the monthly base plan remains blocked; not part of this one-time product readback. |
| Premium annual | Provider-blocked | Annual base plan remains blocked; not part of this one-time product readback. |
| RevenueCat entitlement mapping | Not attached for the five one-time products | Intentional safety state; no Premium mapping and no long-lived entitlement. |
| Activation smoke | Not run | Requires separate owner-approved activation/proof lane. |

## Owner Action List

1. Keep all five one-time creator-money products Draft until a separate owner-approved activation lane.
2. Before activation, confirm support/refund copy, monitoring/readback, exact-target grant/revoke behavior, and Play-installed smoke for each flow.
3. Do not attach any one-time creator-money product to `premium`.
4. Do not enable creator-money switches or `live_money_enabled` until owner approval and controlled proof.
5. Keep payouts, payable balances, withdrawals, cash-out, transfers, Stripe payout/merch, and provider refund automation off unless separate lanes approve them.

## Safety Confirmation

- No provider mutation.
- No Premium public activation.
- No creator-money switches enabled.
- No `live_money_enabled`.
- No payouts, payable balances, withdrawals, cash-out, transfers, payout batches, Stripe Connect, or merch checkout.
- No provider refunds.
- No RevenueCat mapping changes.
- No Premium product, pricing, entitlement, or offering change.
- No RLS weakening.
- No LiveKit authority loosening.
- No auth/reset weakening.
- No scan-gate weakening.
- No abuse-throttle removal.
- No block-enforcement weakening.
- No provider secrets, service-role keys, payment keys, Stripe keys, push tokens, LiveKit tokens, signed URLs, proof passwords, local env files, private dashboard screenshots, tax IDs, bank details, or private provider account data added.
