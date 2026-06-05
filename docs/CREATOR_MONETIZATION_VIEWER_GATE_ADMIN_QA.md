# Creator Monetization Viewer Gate And Admin QA

Date: June 5, 2026

This QA lane verifies the completed creator monetization setup system on the Play-installed Android app and remote backend. It does not add monetization architecture and does not activate production money.

Supersession note: this doc records the first focused QA pass and the blockers it found. The contextual viewer-gate and Owner/Admin drilldown blockers are now closed by `docs/ROUTE_BACKED_MONETIZATION_VISUAL_PROOF.md`, with proof at `/tmp/chillywood-route-backed-monetization-visual-proof-20260605/`.

Stabilization follow-up: `docs/INTERNAL_TESTING_STABILIZATION_SWEEP.md` rechecked the route-backed viewer fixtures after EAS Update group `4cd86764-44c4-4a93-bd0b-274473b36cdc`. Watch-Party ticket, Live access, and Live seat unavailable branches now show their sandbox proof cards when the sanitized setup config exists. This does not change backend/provider proof, purchase intents, access grants, ledger rows, Owner/Admin authority, or money state.

## Scope

- Confirm real in-app setup, internal tester sandbox launcher, merch readiness, payout-readiness read-only copy, and admin denial on Android.
- Confirm backend/provider/order/readiness state through sanitized remote readback.
- Identify the remaining visual QA blockers for contextual viewer gates and Owner/Admin UI drilldowns.

Proof path:

`/tmp/chillywood-creator-monetization-gates-admin-qa-proof-20260605/`

Device:

- `R5CR120QCBF`
- package `com.chillywood.mobile`
- installer `com.android.vending`
- versionName `1.0.0`
- versionCode `25`

No new EAS Update was needed for this QA pass. The prior relevant update remains group `e4378f87-73eb-40d7-a77f-7d242f6753cd`, Android update `019e9576-87fd-7270-bfbc-492634e9028f`.

## Screenshot Proof

- `01-creator-setup-top.png`: creator setup route active; internal tester sandbox setup mode active; live money off; payouts off; cash-out, withdrawal, transfer, Stripe Android digital checkout absent; arbitrary Android prices blocked.
- `02-creator-setup-product-tiers.png`: approved product tiers visible for paid content, Watch-Party Live ticket, Live access pass, and Live seat pass; copy states sandbox-only/no arbitrary Android price and no publish authority from access products.
- `03-creator-setup-completion-rows.png`: creator tip, event pass, physical merch readiness, and completion rows visible; payout/cash-out and digital merch access remain absent.
- `04-internal-sandbox-route-top.png`: internal sandbox purchase route active with Sandbox Purchase Testing, Internal test mode, No real charge, Not payable, production money off, and payouts off.
- `05-internal-sandbox-digital-products-a.png`: internal tester sandbox launcher shows Watch-Party Live ticket, Live access pass, Live seat pass, paid content, creator tip, and event pass with Google Play / RevenueCat sandbox product IDs.
- `06-internal-sandbox-digital-products-b.png`: physical merch Stripe sandbox checkout and payout readiness read-only surfaces visible; payout execution, cash-out, withdrawal, transfer, and payable balance are absent.
- `07-internal-sandbox-merch-payout.png`: repeated merch/readiness lower route proof after scroll.
- `08-paid-content-player-route.png`: direct player route for the saved paid-content proof source returns `Title unavailable`; this proves the saved setup source is not a currently route-backed playable Player fixture for contextual gate capture.
- `09-admin-money-attempt.png`: Admin route denies the current tester because the account lacks an active owner/operator/moderator role.

## QA Matrix

| Type | Setup config exists | Viewer gate screenshot | Tester action screenshot | Owner/Admin UI screenshot | Remote readback | Safety result | QA status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `paid_content_access` | Yes | Blocked: proof source is not a route-backed playable title in the current session; direct Player route shows `Title unavailable` | Generic internal sandbox launcher and product tier captured | Blocked: current device account lacks Admin role | Provider events `2`; consumed intent `1`; pending intent `1`; sandbox-only grant `1`; sandbox/not-payable ledger `1` | production/payable/publish/host flags false | Backend proved; contextual gate screenshot blocked |
| `watch_party_live_ticket` | Yes | Blocked: proof party source is not available as a contextual room gate in the current session | Generic launcher captured with `cw_watch_party_live_ticket_sandbox_099` | Blocked by non-admin session | Provider event `1`; consumed intent `1`; grant currently `revoked` from prior admin-revoke proof; sandbox/not-payable purchase ledger `1`; reversed revoke ledger `1` | no mic/camera/publish or host power config | Backend proved; contextual gate screenshot blocked |
| `live_watch_party_access_pass` | Yes | Blocked: proof live access source is not available as a contextual room gate in the current session | Generic launcher captured with `cw_live_watch_party_access_sandbox_099` | Blocked by non-admin session | Provider event `1`; consumed intent `1`; sandbox-only grant `1`; sandbox/not-payable ledger `1` | publish and host-power flags false; host approval required | Backend proved; contextual gate screenshot blocked |
| `live_watch_party_seat_pass` | Yes | Blocked: proof seat source is not available as a contextual seat gate in the current session | Generic launcher captured with `cw_live_watch_party_seat_sandbox_099` | Blocked by non-admin session | Provider event `1`; consumed intent `1`; sandbox-only grant `1`; sandbox/not-payable ledger `1` | publish and host-power flags false; host approval required | Backend proved; contextual gate screenshot blocked |
| `event_pass` | Yes | Blocked: proof event source is not available as a contextual event gate in the current session | Generic launcher captured with `cw_event_pass_sandbox_099` | Blocked by non-admin session | Provider event `1`; consumed intent `1`; sandbox-only grant `1`; sandbox/not-payable ledger `1` | publish and host-power flags false | Backend proved; contextual gate screenshot blocked |
| `creator_tip` | Yes | Not applicable as an access gate; tip does not unlock content/room/event access | Generic launcher and setup tier captured with `cw_creator_tip_sandbox_099` | Blocked by non-admin session | Provider event `1`; consumed intent `1`; failed intent `1`; sandbox/not-payable ledger `1`; no access grant expected | no access grant, payable balance, cash-out, withdrawal, or transfer | Fully proved for sandbox readiness; contextual creator-tip button screenshot still useful |
| `merch_physical_good` | Yes | Not an Android digital access gate | Physical merch Stripe sandbox checkout surface captured | Blocked by non-admin session | Merch products `1`; sandbox merch orders `4`; order items `4`; processed Stripe merch events `1`; merch digital-access products `0`; Stripe/merch access grants `0` | no digital access, RevenueCat entitlement, Premium entitlement, payout activation, or real fulfillment | Tester-facing merch readiness proved; Admin UI screenshot blocked |
| `payout_readiness` | Read-only only | Not a purchase gate | Read-only payout readiness section captured | Blocked by non-admin session | test payout accounts `2`; provider payout-enabled accounts `0`; payout requests `0`; payable/paid payout ledger rows `0` | no payout request, simulation, cash-out, withdrawal, transfer, or payable balance | Fully proved read-only; Admin UI screenshot blocked |

## Remote Readback

Creator monetization configs:

- one sandbox/not-payable setup row exists for each `paid_content_access`, `watch_party_live_ticket`, `live_watch_party_access_pass`, `live_watch_party_seat_pass`, `creator_tip`, `event_pass`, and `merch_physical_good`.
- every setup row has `production_enabled=false`, `payout_enabled=false`, `payable_state=not_payable`, `grants_livekit_publish=false`, and `grants_host_authority=false`.
- live access, live seat, and Watch-Party ticket configs require host approval where expected.

Google Play / RevenueCat:

- processed sandbox provider events: creator tip `1`, event pass `1`, live access pass `1`, live seat pass `1`, paid content access `2`, Watch-Party Live ticket `1`.
- purchase intents: creator tip consumed `1` and failed `1`; event pass consumed `1`; live access consumed `1`; live seat consumed `1`; paid content consumed `1` and pending `1`; Watch-Party ticket consumed `1`.
- access grants: event pass sandbox-only `1`; live access sandbox-only `1`; live seat sandbox-only `1`; paid content sandbox-only `1`; Watch-Party ticket revoked `1`; creator tip intentionally has no access grant.
- money ledger: sandbox/not-payable purchase rows exist for all six digital products; Watch-Party ticket also has one sandbox reversed admin-revoke row.

Global safety:

- `live_money_enabled=false`
- `payouts_enabled=false`
- `cashout_enabled=false`
- production purchase switches false
- payable/paid money-access rows `0`
- production-enabled creator configs `0`
- payout-enabled creator configs `0`
- publish-enabled creator configs `0`
- host-power creator configs `0`
- payable creator configs `0`
- Stripe/merch access grants `0`

Merch and payout readiness:

- sandbox merch product `1`
- sandbox merch orders `4`
- sandbox merch order items `4`
- processed Stripe merch events `1`
- merch products creating digital access `0`
- creator payout test accounts `2`
- provider payout-enabled accounts `0`
- payout requests `0`
- payable/paid creator payout ledger rows `0`

Temporary access cleanup:

- active temporary/proof permission grants `0`
- active temporary/proof role memberships `0`

## Remaining QA Gaps

- Fresh contextual viewer-gate screenshots remain blocked for paid content, room access/ticket/seat, and event pass because the saved proof source IDs are backend setup fixtures and were not discoverable as route-backed contextual screens in the current signed-in tester session.
- Fresh Owner/Admin UI drilldown screenshots remain blocked because the current Play-installed tester account does not have an active owner/operator/moderator role; the app correctly denied Admin access.
- A future QA lane should use an active Owner/Admin session plus route-backed public/safe room, event, and content fixtures if those screenshots are required for reviewer packets.

## Non-Goals Preserved

- No production live money.
- No payout execution.
- No cash-out, withdrawal, or transfer.
- No payable sandbox/setup rows.
- No arbitrary unmapped Android prices.
- No Stripe Android digital checkout.
- No fake purchases, provider events, balances, or creator sales.
- No LiveKit publish authority, host power, speaker power, mod/admin power, route ownership, Player behavior, old-room handling, Premium gate, or content safety changes.
