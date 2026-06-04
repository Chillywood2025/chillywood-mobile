# Money Center Launch Review Packet

Updated June 4, 2026.

This packet summarizes Chi'llywood's sandbox monetization proof for Google Play review prep, owner/operator review, and investor-readiness discussions. It does not activate production money.

Latest RC regression sweep: `docs/PUBLIC_V1_MONEY_PROOF_RC_SWEEP.md`. Android proof path: `/tmp/chillywood-public-v1-money-proof-rc-sweep-20260604/`.

Stripe merch/payout readiness addendum: `docs/STRIPE_MERCH_PAYOUT_SANDBOX_RUNBOOK.md`, `docs/MERCH_PHYSICAL_GOODS_POLICY.md`, and `docs/STRIPE_CONNECT_PAYOUT_READINESS.md` document the sandbox-only Stripe physical-merch and Connect readiness posture. Stripe remains forbidden for Android digital goods; merch creates no access grants or RevenueCat entitlements; payout readiness creates no cash-out, withdrawal, transfer, or payable creator balance.

Latest Stripe Connect payout-readiness proof: `docs/STRIPE_CONNECT_SANDBOX_PAYOUT_PROOF.md`. Proof path: `/tmp/chillywood-stripe-connect-payout-readiness-proof-20260604/`. Existing test-mode Connect functions reused a real Stripe Express connected account, created a sandbox onboarding link with an HTTPS Chi'llwood return/refresh origin, and refreshed the account into `pending_kyc` / `onboarding_in_progress` with `charges_enabled=false` and `payouts_enabled=false`. App-level `payouts_enabled` and `live_money_enabled` remain off; no cash-out, withdrawal, transfer, payable balance, digital access grant, RevenueCat/Premium entitlement, or payout simulation was created.

## Current Truth

- Production live money: off.
- Payouts, cash-out, withdrawal, and transfer: off.
- Stripe Android digital checkout: absent.
- Sandbox and setup ledger rows: not payable.
- Creator balance: no verified payable earnings yet.
- Premium, creator tips, Watch-Party Live tickets, Live Watch-Party access passes, Live Watch-Party seat passes, paid content access, and event passes have real Google Play / RevenueCat sandbox proof.
- Merch is physical goods separate; sandbox Stripe readiness is physical-only and does not create Android digital access.
- Stripe Connect payout readiness is sandbox-only; onboarding may show pending KYC/verification but payouts are not active.
- Payment creates access records only. Access records do not grant LiveKit publish permission, host power, speaker authority, moderator/admin power, payout access, or safety bypass.

## Product Proof Summary

| Product | Provider | Sandbox purchase | Access grant | Ledger | Resolver / authority proof | Production status |
| --- | --- | --- | --- | --- | --- | --- |
| Premium | Google Play / RevenueCat | Proved | `user_entitlements` remains strict source | Sandbox/setup not payable | Premium gates still win | Purchase shell closed by default |
| Creator tip | Google Play / RevenueCat | Proved | None, correctly ledger-only | Sandbox only / Not payable | No room/content/Premium access | Not production-active |
| Watch-Party Live ticket | Google Play / RevenueCat | Proved | `watch_party_live_ticket` | Sandbox only / Not payable | Viewer/listener only, `canPublish:false`, host approval wins | Not production-active |
| Live Watch-Party access pass | Google Play / RevenueCat | Proved | `live_watch_party_access_pass` | Sandbox only / Not payable | Viewer/listener only, no host/speaker/mod/admin | Not production-active |
| Live Watch-Party seat pass | Google Play / RevenueCat | Proved | `live_watch_party_seat_pass` | Sandbox only / Not payable | Seat eligibility only, host approval required | Not production-active |
| Paid content access | Google Play / RevenueCat | Proved | `paid_content_access` | Sandbox only / Not payable | Content safety/private/draft/deleted/malware states still win | Not production-active |
| Event pass | Google Play / RevenueCat | Proved | `event_pass` | Sandbox only / Not payable | Viewing/entry only; canceled event denied even with grant | Not production-active |
| Merch physical good | Future physical provider | Not applicable | None | None | No Android digital entitlement | Planned only |

## Backend Proof

Final remote readback after the June 4 launch-polish Android proof:

- `provider_events`: 6
- `money_purchase_intents`: 8
- `access_grants`: 5
- `money_access_ledger_events`: 7
- payable/paid money-access rows: 0
- active temporary proof roles: 0

Final Stripe Connect payout-readiness readback after the June 4 backend proof:

- `creator_payout_accounts`: 2
- Stripe Connect accounts: 1 test-mode Express account
- onboarding sessions: 2
- provider charges-enabled accounts: 0
- provider payout-enabled accounts: 0
- payout requests: 0
- payable/paid creator payout ledger rows: 0
- payable/paid money-access rows: 0
- payout-readiness access grants: 0
- Stripe Connect RevenueCat/Premium entitlements: 0
- app-level `live_money_enabled`: off
- app-level `payouts_enabled`: off

Remote-applied money migrations include:

- `20260603165000_money_access_grants_product_catalog.sql`
- `20260603190000_money_purchase_intents.sql`
- `20260603225500_sandbox_digital_product_mappings.sql`
- `20260604011000_allow_sandbox_access_grants_in_resolvers.sql`
- `20260604015548_money_failure_paths_event_pass.sql`
- `20260604015818_allow_admin_sql_revoke_proof.sql`
- `20260604015941_safe_admin_revoke_metadata.sql`

`supabase/database.types.ts` is refreshed. No new migration was required for this launch-polish lane.

## Failure Paths

- Duplicate/idempotency: proved by remote readback and unique DB protections; duplicate provider/grant/ledger/payable rows were 0.
- Admin revoke: proved on a sandbox Watch-Party ticket grant; resolver access became denied and the ledger row stayed sandbox/reversed, not payable.
- Failed/expired intent: proved with a clearly labeled non-sale expired intent fixture; no provider event, grant, ledger, or payable money was created.
- Real provider refund/revoke: remaining provider-tooling gap.
- Real delayed-payment pending: remaining Google Play device/provider support gap.

## Money Center UX Status

Creator Money Center now foregrounds:

- sandbox digital access proof complete
- live money not active
- no verified payable earnings yet
- payouts not active
- sandbox activity not payable
- product readiness for Premium, tips, paid content, tickets, live access, seats, event passes, and merch
- remaining provider-tooling gaps

Owner/Admin Money Center now foregrounds:

- live money off
- payouts off
- provider webhooks and RevenueCat / Google Play sandbox posture
- Product Catalog, Provider Events, Purchase Intents, Access Grants, and Ledger Events counts
- payable sandbox/setup rows count
- duplicate/idempotency, admin revoke, failed/expired intent, provider-tooling gap, delayed-payment gap, and event-pass safety status
- sanitized drilldowns only

## Evidence Paths

Screenshots and recordings are local proof artifacts and are not committed unless a future convention requires it.

- `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`
- `/tmp/chillywood-googleplay-item-availability-real-purchase-proof-20260603/`
- `/tmp/chillywood-real-sandbox-access-products-proof-20260603/`
- `/tmp/chillywood-money-failure-and-event-pass-proof-20260604/`
- `/tmp/chillywood-money-center-launch-polish-review-packet-20260604/`
- `/tmp/chillywood-stripe-merch-sandbox-checkout-proof-20260603/`
- `/tmp/chillywood-stripe-connect-payout-readiness-proof-20260604/`

Latest Android proof target:

- Device: `R5CR120QCBF`
- Package: `com.chillywood.mobile`
- Version: versionCode `23`, versionName `1.0.0`
- Installer: `com.android.vending`
- EAS Update group: `4bccfb67-1cea-47ac-a346-f4b26bd50672`
- Android update id: `019e90a3-23c0-7086-9f76-33aa7ad30215`
- Runtime: `1.0.0`
- Captured screenshots include Creator Money Center header/readiness/product/balance sections, Owner/Admin Money Center overview/counts/failure-path sections, and post-revoke Admin denial after temporary proof roles were revoked.

## Reviewer Notes

- Android digital goods use Google Play Billing / RevenueCat.
- Stripe is not used for Android Premium, paid content, digital tickets, digital seats, event passes, or tips.
- Merch is physical goods separate/planned.
- Production live money is not active.
- Payouts and cash-out are not active.
- Sandbox purchases are not payable.
- No fake creator balance is shown.
- Admin/Owner money drilldowns are permission-gated and sanitized.

## Remaining Gaps

- Real provider refund/revoke event proof requires provider tooling support.
- Real delayed-payment pending purchase proof requires Google Play tester/device support.
- Production money activation, payout setup, tax/legal readiness, and public buy buttons require a future explicit live-money approval lane.
