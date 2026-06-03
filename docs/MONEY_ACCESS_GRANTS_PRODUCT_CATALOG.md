# Money Access Grants Product Catalog

Updated June 3, 2026.

Chi'llwood now has an additive money-access readiness architecture:

RevenueCat / Google Play event -> `provider_events` -> `monetization_products` -> `access_grants` -> content/room resolver RPCs -> `money_access_ledger_events` -> Money Center readout.

This is not live-money activation. `live_money_enabled`, payouts, tips, paid content, Watch-Party tickets, Live Watch-Party access passes, Live Watch-Party seat passes, and merch checkout remain off/setup-only.

Remote proof status on June 3, 2026:

- `supabase db lint --local` passed with no schema errors.
- `supabase db push --dry-run` showed only `20260603165000_money_access_grants_product_catalog.sql` pending before apply.
- `supabase db push` applied the migration, and a post-apply dry-run reported the remote database up to date.
- `supabase gen types typescript --linked > supabase/database.types.ts` refreshed generated types.
- `supabase migration list` remains unavailable in this shell because the linked CLI login role hits the known SASL authentication failure; no password or secret was printed.
- Android remote proof path is `/tmp/chillywood-money-access-grants-remote-proof-20260603/`. Signed-in proof path is `/tmp/chillywood-money-center-signed-in-proof-20260603/`. `R5CR120QCBF` has a Play/EAS-signed `com.chillywood.mobile` versionCode `21`; replacing it with the local current-source APK failed with signature mismatch. A temporary audited operator upgrade on the proof account captured Creator Money Center readiness and not-payable states, then the grant was revoked and post-revoke Admin denial was captured. Android EAS update group `5008f2c5-e002-40bd-8f6e-fcd1fa95e633` was published from current `main`, but this installed v21 client still did not pick up the current Admin Money Center JS, so Owner/Admin Product Catalog / Provider Events / Access Grants / Ledger screenshots remain a follow-up until a fresh Play/EAS-signed build or explicit local replacement path is available.

## Product Catalog

`monetization_products` is the shared sellable product map. It supports:

- product types: `premium_subscription`, `paid_content_access`, `watch_party_live_ticket`, `live_watch_party_access_pass`, `live_watch_party_seat_pass`, `creator_tip`, `merch_physical_good`, and `event_pass`
- statuses: `setup`, `sandbox`, `active`, `disabled`, `retired`
- environments: `setup`, `sandbox`, `production`
- provider mapping fields for RevenueCat, Google Play, and future physical merch providers
- safe metadata checks that block secret-like/provider-private data

Android digital products must use RevenueCat / Google Play. Physical merch uses `merch_provider_later`, Shopify, or Stripe physical-goods readiness later and cannot create digital access grants.

Seeded catalog status:

- Premium: `sandbox`, RevenueCat/Google Play, `premium_subscription`, entitlement `premium`, sandbox proved, purchase shell closed by default.
- Paid content: `setup`, no active buy button.
- Watch-Party Live ticket: `setup`, viewing entry only, no speaker/publish authority.
- Live Watch-Party access pass: `setup`, viewer entry only.
- Live Watch-Party seat pass: `setup`, seat eligibility only; host approval and LiveKit token rules still win.
- Creator tip: `setup`, no active tip button, not payable.
- Merch physical good: `setup`, physical goods only, no digital entitlement.
- Event pass: `setup`, future digital event access placeholder.

## Access Grants

`access_grants` records user access by grant type and source. Normal users cannot write grants. Provider/webhook/admin paths are required. Active production grants require a provider event. Setup and sandbox grants are labeled `setup_only` or `sandbox_only`.

Access grant statuses are `active`, `pending`, `expired`, `revoked`, `refunded`, `blocked`, `sandbox_only`, and `setup_only`.

Access grants never grant:

- LiveKit publish permission
- host, cohost, moderator, speaker, or admin authority
- payout access
- fake creator balance
- bypass over private/blocked/moderated/deleted/malware content
- bypass over Premium gates where Premium is required

Premium remains sourced from `user_entitlements`; the shared grant system may mirror Premium later but does not replace the proved entitlement guard.

## Provider Events And Ledger

`provider_events` stores sanitized provider event identity, product mapping, status, idempotency, and payload hash. Raw private provider payloads and secrets are not exposed to clients.

`money_access_ledger_events` records setup/sandbox/production money-access events. Setup and sandbox rows are `not_payable`. `payable` and `paid` are allowed only for production rows with provider-event and payout-readiness proof.

Refunds, reversals, chargebacks, revokes, and expirations are represented as grant/ledger states. Historical access can remain auditable while content or room playback is blocked.

## Resolver RPCs

Read-only resolver helpers were added:

- `has_premium_access(user_id)`
- `has_paid_content_access(user_id, content_id)`
- `has_watch_party_live_ticket(user_id, party_id)`
- `has_live_watch_party_access(user_id, party_id)`
- `has_live_watch_party_seat_eligibility(user_id, party_id)`
- `resolve_money_access_room_entry(user_id, party_id, required_grant_type)`

Room entry results are viewer-only for paid access grants and return `canPublish=false`. Host approval and the existing LiveKit token issuer remain authoritative.

## Money Center

Creator Money Center remains compact and honest:

- Premium: sandbox proved / test-ready, production not overclaimed
- Digital Sales, Paid Content, Tips, Watch-Party tickets/seats: setup needed / not active
- Merch: physical goods separate / planned
- Creator Balance: no verified earnings yet
- Payouts and Tax & Legal: setup needed

Owner/Admin Money Center now surfaces shared Product Catalog, Provider Events, Access Grants, Access Ledger, setup/sandbox not-payable counts, and merch readiness alongside older creator monetization foundations. It remains read-only and does not expose secrets or raw provider payloads.

## Google Play Policy Posture

Android Premium, paid content, digital tickets, digital seats, event passes, and creator tips stay on Google Play Billing / RevenueCat. Stripe is not used for Android digital checkout. Stripe/Shopify/merch providers are reserved for physical merch and future payout readiness.

Data Safety should be revisited before any tips, paid content, tickets, seats, event passes, merch checkout, or payout feature becomes active.

## Validation

Primary guard:

```bash
npm run guard:money-access-grants-policy
```

Closeout validation also includes runtime, Premium, payment rail, creator monetization, provider readiness, Money Center, Stripe Connect, Watch-Party LiveKit, old-room handling, content rights, Spectator child-room, navigation terminology, and typecheck guards.

## Remaining Gaps

- No live provider activation for paid content, tickets, seats, tips, event passes, or merch checkout.
- No production payable ledger proof.
- No payout activation.
- Fresh signed-in Owner/Admin Product Catalog / Provider Events / Access Grants / Ledger screenshot proof still needs a fresh Play/EAS-signed build carrying current `main` or an explicit local replacement path.
- The next sales lane must use real RevenueCat / Google Play sandbox purchase events for tickets/seats; do not insert fake sales, fake provider events, or fake ledger rows.
- Remote migration apply and typegen are complete; `supabase migration list` remains the only unavailable Supabase readback command in this shell.
