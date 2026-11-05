# Creator sandbox cashout notifications

The isolated sandbox execution now observes requested, processing, test-provider
paid, returning, returned, canceled, and needs-review milestones. A funding
transfer is not a paid payout. Existing authenticated provider GET reconciliation
and the canonical observation RPC alone decide payment status. Live payout
tables, provider endpoints, money switches and discovery are unchanged.

Each execution/milestone has one durable activity key. Internal dispatch steps
share a milestone; repeated callbacks do not duplicate it. Queued older states
are suppressed when the authoritative execution has advanced. Already delivered
in-app rows are timestamped history, and a later failure produces a new return
pending update. The authenticated creator alone can read the in-app request ID
and test status. The link opens the current creator's Channel Studio.

Phone text is always “Account update” and “Open Chi'llywood to review your latest
update.” Its data includes only a notification ID, when one exists, and the
Channel Studio route. It contains no amounts, bank/provider IDs, payout state,
request ID, or creator identity. Opening the app still requires its normal
authenticated account controls. iOS and Android use the existing activity
category/channel; no new native permission or capability is introduced.

The existing Account activity, In-app and Push preferences apply. Queue expiry,
restricted/deleting accounts, current session and installation ownership, revoked
tokens, rate-limit backoff, and unknown-delivery protections remain in force.
An outbox write and its source phase commit together. An enqueue failure rolls
back that database transaction, and existing reconciliation retries can recover
the provider state without issuing another payment. A definite rate-limit
rejection can retry under a new lease; ambiguous provider acceptance is not
resent automatically. Provider acceptance is not proof of phone display.

## Validation and activation

- Run `node --test tests/creator-money/sandbox-cashout-notifications.test.mjs`
  for the current full SQL chain, real GET-only engine, real notification worker
  with local provider doubles, both platform payloads, preferences and failures.
- Run `supabase test db` for the native pgTAP boundary checks and the existing
  local-clone sandbox concurrency runner for actual simultaneous commit/rollback
  and repeated-terminal-observation deduplication.
- Run exact-head Required Validation before merge. The source tests do not prove
  deployed migration parity, phone permission, APNs/FCM acceptance, or display.
- Deploy this new migration separately under explicit deployment authorization.
  Do not edit the earlier sandbox deployment packet or migration. It creates no
  scheduled worker, changes no credential/configuration, and backfills nothing.
- Real-device testing additionally requires the existing notification activity
  worker to be authorized/configured and the chosen signed-in test phone to have
  permission and a current account-bound token. Test with authentic test-provider
  activity only; never fabricate a live receipt or mark a payout paid manually.

## Recovery

Keep deployed migration history immutable. If this observer must be withdrawn,
use a separately reviewed forward migration to remove only its trigger and
suppress pending `sandbox_cashout_status_updated` events. Preserve notifications,
delivery outcomes and the cashout ledger as audit history. Do not disable other
notification/discovery lanes or relax any provider or financial gate.
