# Sandbox Monetization Tester Experience

Date: June 16, 2026

This lane makes sandbox creator-money flows visible to fan/tester accounts without making testers owners or operators.

## Owner Setup

Owner Money Center includes `Sandbox Tester Experience`.

- The owner surface now uses product states instead of backend diagnostics: `Sandbox Testing`, `Live Money: Off`, `Payouts: Off`, `Flow readiness`, and `Next step`.
- A compact safety banner says `Test mode - no payouts` with `No real charges. No creator earnings. No withdrawals.`
- The owner checklist is four steps: configure offers, grant tester, test flows, revoke tester.
- `Set up sandbox offers` creates or updates test-only offers for Tips, Paid Video, Watch-Party Ticket, Event Pass, Channel Subscription, and VIP Pass.
- `Refresh status` reloads offer status, tester status, and transaction/readback rows.
- Setup has deterministic states: idle, setting up, complete, partial, failed, and timed out. The button cannot spin forever.
- Setup is idempotent and keeps rows sandbox-only, not payable, production off, and payout off.
- Watch-Party tickets require an existing valid creator-owned Party Room target; setup reports a blocker instead of creating invalid rows.
- Paid Video requires an existing public/safe creator video; setup reports a blocker instead of faking a video.

Owner cards use these launch-facing meanings:

- `Ready`: tester can see/use the sandbox flow.
- `Needs setup`: run setup or complete the named local setup action.
- `Blocked`: a required creator asset is missing, such as a Party Room target or public video.
- `Tester visible`: configured sandbox offer is available to active sandbox testers.

The Watch-Party Ticket missing state must say `Create a Party Room before testers can buy a ticket` and provide a `Create Party Room target` action. Provider/debug detail belongs behind Advanced provider details, not the primary creator UX.

## Tester Surface

Active non-owner sandbox testers see `Test Creator Purchases` on the creator public Platform.

- Subtitle/copy: `Sandbox only. No real money moves.`
- Tester cards cover Tip creator, Paid video, Watch-Party Ticket, Event Pass, Channel Subscription, and VIP Pass.
- Missing flows show an unavailable state with the exact creator action, not a broken purchase button.
- Channel Subscription copy says it is a creator channel subscription test and not Chi'llywood Premium.
- VIP copy says it is creator-specific and does not unlock Premium or other creators.
- Completed sandbox actions show receipt-style copy such as `Sandbox tip complete. No money moved. No payout created.`

If tester access is revoked, sandbox-only CTAs hide after refresh and direct sandbox purchase intent creation remains blocked by the database guard.

## Tester Access

Sandbox tester access uses `sandbox_monetization_testers`.

- Tester rows can be granted by user id or normalized email.
- Tester rows can be revoked and can expire.
- Testers are not owners, operators, payout users, admins, or service-role-like users.
- Authenticated users can only resolve/read their own active tester status.
- Owners/operators can inspect/manage tester rows through safe RPCs.

Proof scripts:

```sh
node scripts/grant-sandbox-money-tester.mjs --email tester@example.com --ttl-hours 72 --note browserstack
node scripts/revoke-sandbox-money-tester.mjs --email tester@example.com
```

Scripts require local `SUPABASE_SERVICE_ROLE_KEY` and never print the key.

## Flow Behavior

| Flow | Tester sees | Rail | Live payout |
| --- | --- | --- | --- |
| Tips | Sandbox tip sheet | Google Play / RevenueCat | No |
| Paid Video | Sandbox unlock CTA | Google Play / RevenueCat | No |
| Watch-Party Ticket | Sandbox ticket CTA | Google Play / RevenueCat | No |
| Event Pass | Sandbox event pass CTA | Google Play / RevenueCat | No |
| Channel Subscription | Sandbox creator-channel subscription CTA | Google Play / RevenueCat | No |
| VIP Pass | Sandbox creator-specific VIP CTA | Google Play / RevenueCat | No |

Creator tips are Android digital support and use Google Play / RevenueCat only. Physical merchandise is the Stripe sandbox path and remains separate from these six tester flows.

## Safety

- No production live money is enabled.
- No payout, withdrawal, cash-out, transfer, or payable creator balance is enabled.
- No service-role key is used in the mobile app.
- Sandbox purchase intents require an active sandbox tester, beta/internal account, owner, or operator; revoked testers are blocked by `sandbox_monetization_tester_required`.
- Sandbox offers do not unlock Premium unless the flow is explicitly Premium, which these are not.
- Tips do not unlock content, badges, rooms, subscriptions, VIP, events, or other perks.
- VIP is creator-specific and does not unlock Premium or other creators.
- Channel subscription is creator-channel-specific and is not Chi'llywood Premium.
- Paid video, event pass, and Watch-Party ticket access remain bound to their own safe target.

## Production Proof: June 16, 2026

Proof folder:

```text
/tmp/chillywood-sandbox-money-tester-proof-20260616-063426
```

Production-safe readback used proof accounts only:

- Owner/setup account: `paid-videos-fixture-creator@chillywood.test`
- Non-owner tester account: `paid-videos-unpaid-fan-20260611@chillywood.test`

Result:

- Owner setup produced all six sandbox configs: Tips, Paid Video, Watch-Party Ticket, Event Pass, Channel Subscription, and VIP Pass.
- The tester resolver returned active while the tester row was active.
- The tester could start six sandbox purchase intents, all `environment=sandbox`, `status=pending`, and not payable.
- Config readback showed `environment=sandbox`, `payable_state=not_payable`, `production_enabled=false`, `payout_enabled=false`, and no LiveKit publish/host authority.
- Revocation was proven: after tester revoke, `resolve_sandbox_monetization_tester` returned false and `create_money_purchase_intent` returned `sandbox_monetization_tester_required`.

During proof, two narrow production migrations were required so Channel Subscription and VIP can be linked into `creator_monetization_configs`, plus one hardening migration so revoked testers cannot start sandbox purchase intents:

- `20260616120810_support_channel_vip_sandbox_config.sql`
- `20260616120924_allow_channel_vip_config_product_types.sql`
- `20260616121739_require_sandbox_tester_for_purchase_intents.sql`

Play-installed UI proof is now closed for the Android sandbox tester path. Later proof used local-only proof credentials and stable selectors; no coordinate taps were needed for the launch-critical money actions.

## Proof Readiness

Android-first proof should use a Play-installed internal-test build and a sandbox monetization tester account.

Required proof:

1. Owner opens Money Center.
2. Owner opens `Sandbox Tester Experience`.
3. Owner taps `Set up sandbox offers`.
4. Owner grants a fan/tester row with a TTL.
5. Tester opens the creator Platform.
6. Tester sees only sandbox/test-only money CTAs.
7. Tester completes each available sandbox flow through Google Play / RevenueCat.
8. Owner refreshes Money Center and sees sandbox/not-payable readback.
9. Tester grant is revoked.
10. Tester no longer sees sandbox-only offers after revoke/refresh, and direct sandbox intent creation fails with `sandbox_monetization_tester_required`.

Do not call live money production-ready from this proof. This proof closes Android sandbox tester readiness only: no real charges, no payouts, no creator earnings, no withdrawals, no service-role-in-mobile, and no Premium or LiveKit authority changes.

iOS/TestFlight sandbox proof is later. This lane does not enable live money or Stripe digital checkout on Android.

## Play-Installed Fixture Closeout: June 16, 2026

Proof folder:

```text
/tmp/chillywood-sandbox-money-fixtures-proof-20260616-135025
```

Device: `R5CR120QCBF` / `SM-N986U1`, Play-installed `com.chillywood.mobile`, version `1.0.0` versionCode `53`.

Latest OTA used for proof:

- Commit `e6f5508421d45246c60cf71099fd6bcab4b9b804`
- Branch `production`
- Runtime `1.0.0`
- Update group `00933c8b-2807-4471-b9bd-c1d08f3d5883`
- Android update `019ed1e1-a009-7a66-905a-04c2068981f1`

Result:

- Tips: passed through Google Play sandbox and showed `Sandbox tip complete. No money moved. No payout created.`
- Paid Video: passed after replacing the dead proof video with playable fixture `f8ef0e22-14f0-4ff7-a838-f133f11a1d20`; Player opened a playable 9:56 video after unlock.
- Watch-Party Ticket: passed after adding the public tester CTA, routing it to `/watch-party/[partyId]`, and fixing the ticket-owned route hook-order crash. Ticket offer `290bf6f9-67ec-4073-8b88-32a1b167bb9e` targets room `W3JJHH`.
- Event Pass: passed with event `a9167135-d3cc-4349-bf8a-46dfd9068806`; Google Play sandbox completed and the event screen showed `Event pass confirmed`.
- Channel Subscription: passed through Google Play sandbox and showed creator-channel subscription only, not Premium.
- VIP: CTA is wired and reaches Google Play, but the available Play tester already owns `cw_vip_pass_sandbox_499`. First-time VIP completion still requires a clean Play license tester or provider-side proof ownership reset.
- Revoke: passed. `resolve_sandbox_monetization_tester` returned false, direct purchase intent returned `sandbox_monetization_tester_required`, and fresh app restart hid sandbox CTAs.

No live money, payout request, provider transfer, payout batch, withdrawal, cash-out, transfer, or payable creator balance was enabled. The Watch-Party room fixture needs a fresh `last_activity_at` during proof because normal room activity windows remain 15 minutes; that is a fixture freshness requirement, not a LiveKit authority change.

## VIP Clean-Tester Proof: June 16, 2026

Proof folder:

```text
/tmp/chillywood-vip-after-play-refund-proof-20260616-180235
```

Result:

- Google Play opened the first-time VIP sandbox purchase sheet.
- Purchase completed with the Google Play test card.
- The app landed on VIP Area and showed VIP active for this creator channel only.
- Backend readback confirmed VIP pass active, purchase intent sandbox/consumed, access grant `sandbox_only`, `not_payable=true`, no Premium unlock, no payout/payment authority, and no LiveKit/room authority.
- Revoke passed: sandbox tester access was revoked, resolver returned false, fresh app restart hid `Test Creator Purchases` and the VIP CTA, and direct stale purchase intent was blocked with `sandbox_monetization_tester_required`.

## Final Three-Flow Proof: June 16, 2026

Proof folder:

```text
/tmp/chillywood-sandbox-money-final-three-proof-20260616-183633
```

Device: `R5CR120QCBF` / `SM-N986U1`, Play-installed `com.chillywood.mobile`, installer `com.android.vending`, version `1.0.0` versionCode `53`.

Result:

- Paid Video passed with selector `tester-paid-video-unlock-button`. Google Play sandbox purchase completed for `paid_content_access_sandbox_099`, backend readback stayed sandbox/not-payable/no-payout, and Player opened playable 9:56 media for fixture video `f8ef0e22-14f0-4ff7-a838-f133f11a1d20`.
- Watch-Party Ticket passed with selector `tester-watch-party-ticket-button`. Offer `290bf6f9-67ec-4073-8b88-32a1b167bb9e` targets room `W3JJHH`; Google Play sandbox purchase completed, ticket access was granted, and the app reached the room permission path. Camera/mic permissions were denied, so no LiveKit media join or room publish authority is claimed from this proof.
- Event Pass passed with selector `tester-event-pass-button`. Event `a9167135-d3cc-4349-bf8a-46dfd9068806` showed scheduled pass copy, Google Play sandbox purchase completed, and the app showed `Event pass confirmed`.
- Regression readback kept Tips, Channel Subscription, and VIP in sandbox/not-payable/no-payout states from accepted proofs.
- Revoke passed again: resolver returned false, direct stale purchase intent returned `sandbox_monetization_tester_required`, and fresh app restart hid sandbox CTAs.

Final Android sandbox tester label: `6/6 Play-installed sandbox flows proven`. This does not enable live money, payouts, withdrawals, cash-out, payable balances, Premium, or LiveKit authority.
