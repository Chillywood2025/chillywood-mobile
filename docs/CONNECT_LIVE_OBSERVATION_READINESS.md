# Connect live observation, not financial activation

## Implemented contract

The legacy test Express policy remains unchanged. Live existing-account observations use the distinct `stripe_connect_live_express_recipient_controller_v1` policy. There is no live account creation or onboarding in this change.

The reader performs four bounded GETs: exact platform v1 Account, exact connected v2 Account including recipient/defaults, connected v1 Account, then unchanged v2 binding/responsibilities/recipient confirmation. A live credential alone is insufficient: v2 must explicitly return `livemode:true`; v1 responses explicitly contradicting that mode fail. Account IDs come only from the stored creator binding and private platform policy, never client parameters. Redirects, oversized bodies, transport failures and changed bindings fail closed.

Configuration agreement requires Express dashboard, application controller, application fee/loss responsibility in both API representations, and Stripe requirements collection. Provider readiness additionally requires complete observed requirements with no current/past/pending verification items, payouts enabled, active recipient transfers, US/USD and manual payout schedule. Missing currency or requirements are not inferred as ready. Provider readiness is separate from application financial authorization: eligibility remains non-payable, platform holds survive, and no route, fee, tax, destination or payout qualification is manufactured.

The service-only SQL recorder uses exact creator/account/environment/platform and previous-observation compare-and-set. It rejects stale read evidence and changed bindings. External-payment capabilities retain all their independent qualification checks and now require observations newer than 15 minutes.

The existing creator account-sync endpoint verifies the current session before and after provider I/O. Automatic account-change observation has a separate dormant endpoint `stripe-connect-live-observation-webhook`: a distinct live signing secret, bounded body, actual signature verification and explicit live account binding precede any GET. Signed events are hints only; payload state is never projected directly. Provider/read/CAS failures return 503 for retry. Replays may repeat read-only current-state refreshes; they cannot execute money or restore older event snapshots. The legacy test webhook still rejects live events.

## External requirements, not represented as completed

- The authorized live Stripe audit found **zero connected creator accounts**. A real existing creator binding and its actual provider observations are needed to qualify this route. Creating accounts, submitting verification or accepting provider/legal terms is not part of this patch.
- The private `creator_connect_live_observation_policy` table is deliberately empty. Its expected platform account must be established from authenticated provider evidence before enabling read-only observation. No live financial switch is changed by that setting.
- Runtime reuses the existing live read credential name `STRIPE_CASHOUT_LIVE_KEY`. Availability/scope has not been assumed and no key is created or exposed. It needs permission for the exact read endpoints.
- Automatic delivery additionally requires an authorized Stripe account.updated Connect event destination and distinct `STRIPE_CONNECT_LIVE_OBSERVATION_WEBHOOK_SECRET`. Neither is provisioned here; the live audit found no destinations. Missing configuration returns 503, not a false processing success.
- Actual cashout, tax, storefront external-payment permissions, financial rails, fee evidence, bank destination and exclusive payout-writer qualification remain independently required. This source is not proof that any of them is ready.

## Evidence

Disposable full-schema PostgreSQL tests exercise service-only policy access, no-policy denial, positive live projection, same-snapshot CAS rejection, wrong account/platform/read-time rejection, pending verification, preserved fraud hold and absent financial qualifications. Transport tests cover missing/wrong live mode, wrong IDs, changed snapshots, responsibility mismatch and incomplete requirements. Actual signed handler tests cover signature/mode/binding denial, provider failure retry and successful read-only recording. Existing test-mode observation, client and webhook regression tests remain required.
