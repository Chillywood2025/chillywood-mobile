# Order-linked merch support cases

Source-only sandbox implementation. This is not a deployment, physical-return
shipping service, automatic refund, provider-dispute clearance, or payout release.

## Usable paths

- Buyer order card → **View return cases** → **Request return** or **Report
  non-delivery**. Exact order ownership and active session are checked by SQL.
  The recorded deadline is shown in local time and UTC. The return RPC uses the
  frozen tracked delivery / untracked successful-purchase clock, not the generic
  refund resolver that excludes shipped products. A non-delivery claim can exist
  before verified delivery without inventing a delivery timestamp or waiving a
  return deadline.
- Creator order card → view claims → routine response or staff escalation.
  Creator responses never close claims. Buyer may explicitly close their case
  or ask staff to review it.
- Support screen → **Open staff merch case review** → escalated cases → reasoned
  support resolution. SQL requires exact current session plus BOTH existing
  `admin.support.manage` and `admin.refund_status.record` permissions. Generic
  moderator membership alone is insufficient. Staff cannot resolve their own
  buyer/creator order. Resolution does not record a refund or change payment,
  carrier, address, provider-dispute or adjustment evidence.
- Existing `/support?orderId=…` preserves the exact order via a validated order
  link. Generic support intake receives fixed safe text, with a private case
  linking the intake record to the order. No address, tracking payload or free
  case notes enter generic support metadata. Case notes are shared only through
  authorized party/staff RPCs; UI warns not to enter addresses/payment details.

## Authority and accounting

New orders freeze `return_case_protocol=app_merch_cases_v1`. Historical orders
are not backfilled and retain unknown app-return clearance. For prospectively
enrolled orders the complete immutable case ledger establishes app-return state
`none`, `open`, or `resolved`. Only its app-return unknown hold can be removed;
known external open-return facts, unknown/open provider disputes, carrier
confidence and all other financial holds stay independent.

All submissions, responses and immutable aggregate hold snapshots serialize on
the order row, the same lock used by existing delivery evidence. Every unresolved
case contributes; resolving one does not clear another. Frozen terms and original
timestamps are never rewritten. Past allocation/snapshot records remain immutable;
current order projections recompute case holds so a stale allocation snapshot
cannot erase a new case or retain a resolved case hold forever. Remaining provider
holds are not cleared by this calculation.

Request UUIDs are actor-bound and exact-payload checked. Retrying a committed
request returns the same case without another report/event. UI retains UUID and
payload after uncertain failure and suppresses retired account/order/focus results.
New requests after a remount may be separate claims; each remains visible and held,
never treated as an automatic refund. Case closure is not `refund complete`:
verified provider refund receipts remain the only payment-state authority.

## Explicit limits / decisions still needed before live operation

- Return destination and logistics, item inspection/receipt, and the operational
  handoff from an approved remedy to a separately authorized provider refund are
  not defined here. No return label purchase, outbound email, postage charge,
  restocking fee, blanket waiver or invented appeal deadline is introduced.
- Cases/notes need a reviewed retention/deletion policy before production; this
  source intentionally preserves auditable history and does not silently erase
  claims on account or creator changes.
- Carrier and provider-dispute/adjustment coverage remain independent qualified
  evidence gates. App-case clearance is not global no-dispute proof or cash-out
  readiness. Existing sandbox/not-payable gates remain enforced.
- Staff queue is a bounded oldest-first escalation queue (up to 100); after
  resolving records, refreshing exposes later records. It is not an external
  support-ticket notification service.

## Verification

`tests/creator-money/merch-return-cases-postgres.test.mjs` runs the real migration
chain and actual authenticated/anon/service roles, including SQL-backed mounted
buyer submission, frozen protocol/history, scoped staff permission revocation,
exact-session rejection, idempotency conflicts, multiple case aggregation,
immutable snapshots, expired tracked clock, untracked purchase clock, and provider
dispute independence. Mounted client tests cover stale completions and uncertain
retry payloads. Catalog and mutation inventories explicitly list the migration
and exact function identities. Native race source is separately qualified in
hosted Database CI; no local native database/server was started for this work.

Confirmed atomic SQL rejection of invalid details, an unavailable return window,
unverified payment, or an already-closed case unlocks editing and a fresh request.
The helper recognizes only the exact SQL code/message pair. Transport timeouts,
unknown failures, request conflicts, and permission denials retain the frozen
UUID and payload: a permission denial can precede idempotency readback and cannot
disprove an earlier uncertain attempt. Once any outcome was uncertain, even a
later known rejection retains the original request: the first server call may
still be pending. Mounted tests exercise both recovery and
unchanged-payload retry behavior; raw provider errors never reach the UI.
