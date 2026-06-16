# Sandbox Monetization Tester Experience

Date: June 16, 2026

This lane makes sandbox creator-money flows visible to fan/tester accounts without making testers owners or operators.

## Owner Setup

Owner Money Center includes `Sandbox Tester Experience`.

- `Set up sandbox offers` creates or updates test-only offers for Tips, Paid Video, Watch-Party Ticket, Event Pass, Channel Subscription, and VIP Pass.
- `Refresh sandbox status` reloads offer status, tester status, and transaction/readback rows.
- Setup is idempotent and keeps rows sandbox-only, not payable, production off, and payout off.
- Watch-Party tickets require an existing valid creator-owned Party Room target; setup reports a blocker instead of creating invalid rows.
- Paid Video requires an existing public/safe creator video; setup reports a blocker instead of faking a video.

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
- Sandbox offers do not unlock Premium unless the flow is explicitly Premium, which these are not.
- Tips do not unlock content, badges, rooms, subscriptions, VIP, events, or other perks.
- VIP is creator-specific and does not unlock Premium or other creators.
- Channel subscription is creator-channel-specific and is not Chi'llywood Premium.
- Paid video, event pass, and Watch-Party ticket access remain bound to their own safe target.

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
10. Tester no longer sees sandbox-only offers after revoke/refresh.

iOS/TestFlight sandbox proof is later. This lane does not enable live money or Stripe digital checkout on Android.
