# Internal Tester Sandbox Purchase Mode

Updated: June 4, 2026

This document explains the bounded purchase mode for approved internal testers and the Owner/Admin controls around it. It does not activate production money.

Creator setup flow addendum: `docs/CREATOR_MONETIZATION_SETUP_COMPLETION_MATRIX.md` completes `/creator-monetization-setup` for approved creators/internal testers. The screen saves real source UUIDs to approved sandbox tiers for paid content, Watch-Party tickets, Live access passes, Live seat passes, event passes, tips, and physical merch. It still uses the same internal tester gate, keeps public/default purchase surfaces closed, and cannot create payout execution, payable balances, production purchases, Stripe Android digital checkout, LiveKit publish, host/speaker/mod/admin authority, fake sales, or safety bypass.

Viewer/Admin QA addendum: `docs/CREATOR_MONETIZATION_VIEWER_GATE_ADMIN_QA.md` confirms the internal tester route remains visible only as a sandbox/not-payable tester tool and that payout readiness is read-only. The same pass captured correct Admin denial for the non-admin tester account; Owner/Admin drilldown screenshots require an active Owner/Admin session.

## Why Premium Looked Unavailable

The default app shell intentionally keeps Premium purchases closed:

- `_lib/monetization.ts`: `PREMIUM_PURCHASE_SHELL_ON_HOLD = true`
- `_lib/creatorMonetization.ts`: `premiumPurchaseEnabled = false`
- `_lib/featureFlags.ts`: `premiumPurchaseEnabled = false`
- `live_money_enabled`: off
- `payouts_enabled`: off

That is why normal/public users see `Premium Unavailable` or `Temporarily unavailable`. The sandbox proof work proved provider rails, but it did not mean every tester should see public-looking production purchase buttons.

## What This Mode Opens

Approved internal testers can use `internal_tester_sandbox` mode to test sandbox purchases:

- Premium through Google Play / RevenueCat sandbox
- Existing sandbox digital products through the sandbox purchase launcher
- Stripe physical merch sandbox checkout where already backed
- Stripe Connect payout-readiness status as read-only status only

Every opened surface must be labeled as:

- Sandbox test
- Not production
- Not payable
- No production money
- Payouts off

## Owner/Admin Controls

Owner/Admin Money Center includes an `Internal Sandbox Testing` section that summarizes:

- internal tester sandbox mode status
- live money off
- payouts off
- payable sandbox/setup rows
- Premium, digital access, physical merch, and payout-readiness boundaries
- each sandbox product's safety rule
- the route to `Sandbox Purchase Testing`

These controls are inspection and routing controls. They cannot grant admin/operator/mod/host power, create provider events, mark sandbox rows payable, enable production purchases, enable payouts, or create cash-out/withdraw/transfer actions.

## Who Can Access It

The current app-side gate allows only approved test identities:

- active Owner or Operator platform role
- runtime-allowlisted tester identity
- active internal beta/tester account

Normal signed-in users and signed-out users remain on public/default mode.

Stripe physical merch checkout also enforces server-side tester access. The `stripe-merch-checkout` Edge Function accepts active Owner/Operator accounts or active `beta_access_memberships` tester rows, then still requires a sandbox physical merch product with `creates_digital_access=false`.

## What Stays Closed

This mode does not enable:

- production live money
- production payouts
- cash-out
- withdrawal
- transfer
- payable creator balance
- public production buy buttons
- Stripe Android digital checkout
- external Android digital payment links
- fake purchases
- fake provider events
- fake balances

Android digital goods remain Google Play / RevenueCat only. Stripe remains physical merch and payout readiness only.

Payout readiness remains read-only. Internal testers cannot request, trigger, simulate, cash out, withdraw, transfer, or activate payouts from this mode.

## Premium Behavior

Public/default user:

- sees Premium inactive or unavailable
- cannot launch the sandbox purchase dialog
- can restore/check status only where provider config allows

Approved internal tester:

- sees `Internal tester sandbox mode`
- can load RevenueCat offerings when the Play-installed build, tester account, and provider products are valid
- can start a Google Play sandbox Premium purchase
- still needs a real RevenueCat/backend `user_entitlements` result for Premium access
- does not get fake Premium from the UI

## Non-Premium Sandbox Digital Products

The sandbox purchase launcher can start already-proved RevenueCat / Google Play sandbox products:

- creator tip
- Watch-Party Live ticket
- Live Watch-Party access pass
- Live Watch-Party seat pass
- paid content access
- event pass

The backend `create_money_purchase_intent` RPC still enforces sandbox-only product rows, real source UUIDs, RevenueCat/Google Play Android digital rails, and not-payable metadata. Tips remain ledger-only. Access products create access grants only through the existing provider webhook path.

## Safety Truth

Tester mode does not bypass content or room safety:

- private, draft, deleted, admin-removed, malware, blocked, canceled, ended, removed, and disabled states still win
- ticket/access/seat grants remain viewer/entry/eligibility only
- host approval still controls mic/camera/publish
- payment does not grant LiveKit publish, host, speaker, mod/admin, payout, or safety-bypass authority

## Tester Tools

`/admin-money-sandbox-purchases` is now rendered as `Sandbox Purchase Testing` for approved users. It includes:

- sandbox mode status
- Premium sandbox test guidance
- digital access sandbox products
- physical merch sandbox checkout for `cw_merch_test_tee_sandbox`
- payout-readiness read-only copy

The screen has no payout execution button and no production purchase button.

## Proof Path

Expected runtime proof path:

- `/tmp/chillywood-internal-tester-sandbox-purchase-mode-proof-20260604/`

Proof should use a Play-installed internal/closed test build when testing Google Play Billing. Do not sideload for final Google Play purchase proof.

## Remaining Gaps

- Device/runtime proof after this code reaches internal testers with Owner/Admin controls.
- Optional fresh Premium sandbox purchase/restore proof on the Play-installed tester build.
- Optional fresh non-Premium sandbox product purchase proof if a valid source fixture is available.
- Real provider refund/revoke and delayed-payment pending remain provider-tooling gaps.
- Production merch and payout launches remain future approval/legal/tax/fraud/support lanes.
