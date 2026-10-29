# Creator backend rollout preparation

The replay deadlock repair is merged in #626, at
`dd7f4a79c40e39210c7f33a74715bc838b815539`. Its tree matches qualified source
`8d1ca9efe4ec78f1e0a5e9a7b4413933b8f3ae29`. Production lacks the feature's
tables and functions, so applying only the two lock repairs cannot work.
The user authorized the broader backend rollout while keeping live money and
payouts off. This document records preparation, not a deployment receipt.

## Cutover boundary

Old and new payment handlers cannot safely overlap a naive sequence of schema
changes: legacy tip facts lack settlement fields, merch uses separate writes,
Connect has a later eligibility upsert, and RevenueCat needs the purchase-time
overload. The temporary Edge handler returns retryable HTTP503 without reading
the body or acknowledging a provider event. Fifteen existing endpoints are
covered; ten source endpoints receive their final bundles (including one new
broadcast endpoint), and six unchanged writers restore their exact captures.

`ops/creator-backend-rollout/prepare-edge.mjs` builds tool arguments from a full
Git SHA and hash-bound deployed captures, preserving each function's JWT setting.
Keep captures and prepared bundles private. This helper does not deploy anything.

Verify bridge versions and marker responses, allow regional propagation, then
drain longer than the hosted400-second worker lifetime. Check versioned execution
logs and active database transactions; a clock delay alone is insufficient.
Do not disable provider webhook endpoints. Restore final webhooks before
initiators, and remove every temporary bridge. Retry budgets are finite; compare
unfinished receipts before/after and retain any missed deliveries for verified
reconciliation. These helpers do not fabricate or resend provider events.

The database payload combines25 exact source components into one transaction.
It removes only ten parser-identified top-level BEGIN/COMMIT statements and
changes one SET to SET LOCAL. Function bodies otherwise retain source bytes.
The reviewed offsets, input/output hashes and37 sorted predecessor table locks
are in `database-manifest.json`. `prepare-database.mjs` fails if any byte differs.
It uses5-second lock and120-second per-statement limits. Standalone payload SHA256:
`044888d2c4cd005259974bdd71c7845a9c55fbb61f17fffa8c6d296e19ec895b`.
The canonical-tool input omits only that standalone outer BEGIN/COMMIT; the
executor owns the transaction and appends its history record. Tool-input SHA256:
`cb7c21435e3eee37dd1d03144a9b05b34ba0cb518e35067dc44905ed517af8ca`.
Native single-transaction tests model this ownership; they do not establish the
hosted migration API's internal history-commit implementation. Immediate schema
and history readback is required, and an ambiguous outcome must not be reapplied.

Atomic commit prevents direct clients seeing intermediate schema states.
Table locks alone are not proof that every previously compiled RPC body drained.
The retained16-function predecessor ACL review found four directly authenticated
targets: two serializers, an access reader and `set_creator_content_price`.
The old price writer already enforces its single supported USD catalog tier and
first reads a fenced catalog table. The incompatible service RPC callers are
covered by the Edge boundary. Older clients may receive guarded errors for event
edits or missing durable tip request IDs; this backend work does not publish a
client upgrade or enable live transactions.

## Qualification and recovery

Existing final-state evidence: two clean canonical database CI runs,
153 SQL files /5533 assertions, and ten native concurrency schedules /175 checks.
The previous final-three atomic qualification passed25 checks. The new combined
payload adds an intentional failure after all454 runtime statements, complete
catalog/data rollback comparison, and successful catalog comparison against
independently replayed source. The standalone PostgreSQL17.6 run passed34 checks,
including16 event identity anchors, an empty pending queue and unchanged roles.
The executor-owned transaction variant passed15 checks: an injected P0001 after
the full query and synthetic history insertion restores all predecessor schema
and rows with zero history rows; success commits exactly one history row and
matches the independently verified final catalog. Local payload reproduction
and bridge/bundler tests pass10 checks.

Fresh read-only production checks found16 unchanged predecessor definitions,
owners, signatures, settings and ACLs;473 history entries; no creator-related
cron jobs; and no unfinished Stripe tip/merch receipts. Two RevenueCat records
in received state date from June12 and are pre-existing reconciliation debt.
Money switches remain off; provider webhooks remain sandbox-only.

Before the first production change, retain all final and restore bundles and
refresh history, predecessor fingerprints, activity and switches. Apply through
the canonical Supabase migration tool. Read its actual assigned version/name and
ordered statements immediately. Preserve existing history exactly. Reconcile
the25 source components with that single deployed identity in source before a
client release; never insert history rows or execute the25 aliases again.

If SQL fails and readback confirms complete rollback, restore captured original
Edge bundles. After confirmed SQL commit, restore only the compatible final
payment handlers; old payment handlers are not a safe database rollback. Keep
their retry bridge until compatible restoration succeeds. Database recovery is
forward-only. No provider worker schedule, live payment, payout, OTA or store
release is part of this operation.

References: [Supabase worker limits](https://supabase.com/docs/guides/functions/limits),
[Supabase deployment propagation](https://supabase.com/docs/guides/functions/error-codes),
[Stripe delivery behavior](https://docs.stripe.com/webhooks),
[RevenueCat retries](https://www.revenuecat.com/docs/integrations/webhooks).
