# Paid Events V1 End-to-End Proof

Last updated: June 12, 2026

## Status

Paid Events V1 is sandbox-proven end to end on a Play/internal runtime.

The flow is sandbox-only. Live money remains disabled.

## Provider Path

- Provider rail: RevenueCat / Google Play sandbox-compatible dynamic purchase path.
- Product key: `event_pass_sandbox_099`
- Provider product id: `cw_event_pass_sandbox_099`
- Stripe Tips is not used.
- Premium is separate and does not unlock creator paid events.

The product row already existed remotely as a sandbox Android digital product with purchase intents required. Paid Events V1 reuses that approved product instead of introducing a new provider product.

## Implemented

- Canonical event model:
  - Existing `creator_events` remains the event schedule/source of truth.
- New tables:
  - `paid_creator_events`
  - `paid_creator_event_passes`
  - `creator_event_transactions`
  - `paid_event_events`
- RPCs:
  - `set_paid_creator_event_offer`
  - `resolve_paid_creator_event_pass_access`
  - `create_paid_creator_event_pass_purchase_intent`
  - `list_my_paid_creator_event_offers`
  - `list_my_paid_creator_event_transactions`
- Provider bridge:
  - Existing `revenuecat-webhook` verifies RevenueCat / Google Play events.
  - Verified `event_pass` access grants are mirrored into event passes and creator event-pass transactions.
  - Capacity-limit oversell guard blocks active pass creation when the event is sold out.
- Client:
  - Existing creator event cards in Platform Studio can save a sandbox Paid Event offer.
  - Creator profile event cards link to `/event/[eventId]`.
  - `/event/[eventId]` is now a real paid-event gate, not only a visual proof page.
  - Fan CTA is `Buy Event Pass`.
  - Money Center Offers and Transactions read Paid Event rows separately from Tips, Paid Videos, Paid Watch-Party Seat Passes, and Premium.

## Gate Truth

Paid event access is enforced on `/event/[eventId]` before the paid event surface is shown.

Unpaid users see `Event pass required` plus this copy:

`This pass unlocks this creator event only. It does not include Premium, subscriptions, VIP, paid videos, Watch-Party rooms, other events, or other creator content.`

Paid Events V1 does not route Watch-Party rooms, does not route to Live Stage, and does not initialize LiveKit controls.

## Security

- Creators save paid-event offers through guarded RPC only.
- Authenticated clients have `SELECT` only on paid-event offer/pass/transaction tables.
- Clients cannot directly create active event passes.
- Clients cannot directly mark event transactions paid.
- Clients cannot directly increase `passes_sold`.
- Verified provider events are required before active passes are created.
- Pass metadata is constrained to avoid secrets, raw provider payloads, LiveKit publish authority, host controls, or admin power.
- Sandbox rows are not payable and do not create payout, cash-out, withdrawal, transfer, Premium, Tips, Paid Video, Watch-Party Seat Pass, VIP, subscription, or LiveKit authority.

## Remote Apply Status

Applied remotely and migration history repaired:

- `20260612201011_paid_events_v1_sandbox.sql`
- `20260612213500_paid_events_metadata_safe_keys.sql`
- `20260612215000_paid_events_access_grant_trigger_schema_fix.sql`

During proof, the first two RevenueCat provider events reached Supabase but stayed `received` because the deployed event-pass access-grant trigger still referenced an old `NEW.access_type` field. The fix replaced `sync_paid_creator_event_pass_from_access_grant()` so it uses the current `access_grants.grant_type/source_id` schema. A rolled-back test insert proved the corrected trigger no longer throws before the final successful purchase proof.

Remote readback confirmed:

- `paid_creator_events`
- `paid_creator_event_passes`
- `creator_event_transactions`
- `paid_event_events`
- `set_paid_creator_event_offer`
- `resolve_paid_creator_event_pass_access`
- `create_paid_creator_event_pass_purchase_intent`
- `list_my_paid_creator_event_offers`
- `list_my_paid_creator_event_transactions`
- `sync_paid_creator_event_pass_from_access_grant`

## Play/Internal Runtime

June 12, 2026:

- Commit: `79dbec2cb4a5fad195b2b068ebf1fd7a9b8ae4ea`
- EAS build id: `685b4d11-a23c-4f1f-add8-13b04fe22f48`
- App version: `1.0.0`
- VersionCode: `46`
- Runtime version: `1.0.0`
- Build profile: `production`
- Distribution: `STORE`
- Artifact type requested: AAB
- Internal-track submission id: `3d4c4556-006f-4fb8-9dfc-c68d160dbf74`
- Device: `R5CR120QCBF`
- Package: `com.chillywood.mobile`
- Installer: `com.android.vending`

## Sandbox Proof

Passed on June 12, 2026:

1. Creator setup passed using creator account `TIPS_FAN_TEST`.
2. Event id: `a100f88d-6bf5-4272-838d-2d0d83f800eb`.
3. Paid event offer id: `85b2a1ae-90cd-4b75-a91f-39c42c3dad43`.
4. Product key/id: `event_pass_sandbox_099` / `cw_event_pass_sandbox_099`.
5. Unpaid direct-link gate passed before purchase: `/event/[eventId]` showed `Event pass required` and `Buy Event Pass`.
6. Google Play Billing launched and showed `Event pass sandbox`, `$0.99`, and test-card copy.
7. RevenueCat/Supabase webhook processed provider event `95c22a83-85a1-4f5a-b6e4-e6f2cb72ad10` / provider transaction `6EC95995-6308-4A2F-9962-6A1CF9BBFDBA`.
8. Purchase intent `d9076cf4-cd98-4480-af0a-690f5bcc06df` was consumed.
9. Shared `event_pass` access grant `bce269bc-7469-484f-b82f-992437a7c7f6` was created with `environment=sandbox`, `status=sandbox_only`.
10. Paid event pass `3a9b2d07-d04b-45ad-b7cd-9766566e9a04` was created as `active`.
11. Creator event transaction `0dc99303-baeb-489c-b5a5-8e608b63f583` was created as `paid`, `payout_status=not_payable`, amount `$0.99`.
12. Paid fan access passed: app showed `Passes: 1`, `Event pass confirmed`, and no Premium/VIP/Watch-Party/LiveKit authority copy.
13. Second authenticated unpaid tester `PAID_EVENTS_UNPAID_GENERATED` was created for proof, confirmed in Supabase Auth, and direct-linked to the same event. It remained blocked with `Event pass required`, `Buy Event Pass`, and zero active passes.
14. Money Center Transactions visual readback passed: creator saw `$0.99 event pass`, `Paid`, `Sandbox`, and `Payout status: not_payable`, separate from Tips.
15. RLS safety passed: authenticated client writes to `paid_creator_event_passes`, `creator_event_transactions`, and `paid_creator_events.passes_sold` were denied with `42501`.

Proof screenshots/logs are under `/tmp/chillywood-paid-events-v1-proof/`.

## Deferred

- Capacity proof is deferred because the current creator UI does not expose `capacity_limit`; the DB model and oversell guard exist, but no UI-safe fixture can set capacity yet.
- Provider refund/revoke proof until RevenueCat / Google Play tooling and safe order identifiers are available.
- BrowserStack final regression remains deferred until all creator monetization flows have local/manual proof.

## Boundaries

- No Stripe Tips path is used for Paid Events.
- No Premium entitlement unlocks creator paid events.
- No Tips, Paid Videos, Paid Watch-Party Seats, Channel Subscriptions, VIP, LiveKit token logic, Watch-Party routing, Party Room routing, Live Stage routing, or Premium gates changed.
- Sandbox rows are not payable and do not create payout, cash-out, withdrawal, transfer, or available creator balance.
