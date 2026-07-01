# Money Failure Paths Proof

Updated June 4, 2026.

Proof path: `/tmp/chillywood-money-failure-and-event-pass-proof-20260604/`

Launch review packet: `docs/MONEY_CENTER_LAUNCH_REVIEW_PACKET.md`.

Canonical final money truth: `docs/MONETIZATION_STACK_FINAL_TRUTH.md`.

Money Center UI polish proof: `docs/MONEY_CENTER_UI_POLISH_PROOF.md`.

Public V1 RC sweep: `docs/PUBLIC_V1_MONEY_PROOF_RC_SWEEP.md` confirms these failure-path guarantees still hold in the release-candidate money sweep, with final payable/paid rows `0` and active proof roles `0`.

## Scope

This lane proved sandbox money failure paths without activating live money:

- duplicate/idempotency surfaces cannot duplicate provider/grant/ledger rows
- admin revoke blocks access and appends a sandbox reversal ledger row
- expired purchase intents do not create provider events, grants, ledgers, or payable money
- event pass is backed by `creator_events` through a sandbox resolver and a real RevenueCat / Google Play sandbox purchase

## Remote Schema

Remote-applied migrations:

- `20260604015548_money_failure_paths_event_pass.sql`
- `20260604015818_allow_admin_sql_revoke_proof.sql`
- `20260604015941_safe_admin_revoke_metadata.sql`

`supabase db lint --local` passed and `supabase db push --dry-run` reported the remote database up to date after local filenames were aligned to the connector-recorded remote versions.

## Proof Results

Baseline readback before this lane:

- `provider_events`: 5
- `money_purchase_intents`: 6
- consumed intents: 5
- failed intents: 1
- expired intents: 0
- `access_grants`: 4
- `money_access_ledger_events`: 5
- payable/paid money-access rows: 0
- active proof roles: 0

Final readback:

- `provider_events`: 6, all sandbox `NON_RENEWING_PURCHASE`
- `money_purchase_intents`: 8
- consumed intents: 6
- failed intents: 1
- expired intents: 1
- `access_grants`: 5
- active/sandbox grants: 4
- revoked/refunded/expired grants: 1
- `money_access_ledger_events`: 7
- ledger status: 6 `sandbox_only`, 1 `reversed`
- ledger payable state: 6 `not_payable`, 1 `reversed`
- payable/paid money-access rows: 0
- active proof roles after revoke: 0

## Idempotency

Remote readback found:

- duplicate provider idempotency keys: 0
- duplicate access grants for the same provider event/user/grant type: 0
- duplicate ledger rows for the same provider event: 0

The lane added unique indexes for access grants and ledger rows by provider event. Existing `provider_events_idempotency_unique` remains in force.

## Revoke

Real provider refund/revoke tooling was not triggered in this lane. Instead, an honest admin revoke proof revoked sandbox Watch-Party Seat Pass grant `f782b2be-9561-4b15-b591-f5e28465064c`.

Result:

- grant status became `revoked`
- one `ADMIN_REVOKE` ledger row was appended
- ledger environment stayed `sandbox`
- payable state became `reversed`, not `payable`
- resolver denied the revoked ticket with `allowed:false`
- room resolver still returned `viewerOnly:true`, `speakerApprovalRequired:true`, and `canPublish:false`

Remaining gap: real provider refund/revoke event proof still requires provider dashboard/tooling support.

## Pending / Expired

Google Play delayed-payment pending proof was not available on the device. The lane used a clearly labeled non-sale expired intent fixture:

- fixture intent `4cc571af-b458-470a-92ba-0dd5b53d06bd`
- status became `expired`
- provider events for fixture: 0
- access grants for fixture: 0
- ledger events for fixture: 0
- payable/paid rows: 0

Remaining gap: real delayed-payment pending proof still requires Google Play tester/device support.

## Safety

No fake sale, fake provider event, fake payable ledger, fake balance, payout, cash-out, Stripe Android digital checkout, production live money, LiveKit publish grant, host/speaker/mod/admin grant, or safety bypass was introduced.
