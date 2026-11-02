# Internal sandbox creator payout source path

This is source implementation, not deployment or provider readiness evidence.
Real-money flags, the live worker, and production earnings are unchanged.

## Actual UI and authority

`app/channel-settings.tsx` mounts `SandboxCreatorCashoutPanel` in payout
readiness, separately from the existing live panel. The related historical
feature manifest is `creator-money-ledger`; its old payout-execution non-goal
is not proof of this new task's readiness.

The panel supports quote, exact quote confirmation, isolated history,
explicit provider-stage continuation/reconciliation, and cancellation. Every
action captures the initiating session. Blur, logout, account/session changes,
editing and stale controls retire earlier UI intent. Duplicate active clicks
are latched. Accessible labels, radio state and status announcements are used.
No new native modules are added; Android and iOS still require separate
installed-device verification, including Back/navigation and interruption.

Sandbox earning fee/tax/net deductions are labeled simulated. A quote is not
a payout. Reservation, connected-account funding, pending payout and provider
test-paid status are distinct; none proves a real bank deposit.

## Server dependencies

The database companion migration owns all `*_sandbox_creator_cashout*` RPCs,
private qualifications, tester/exact-session checks, reservations, dispatch
claims, refund holds and provider observations. The Edge adapter first calls
the user's `get_my_sandbox_creator_cashout_execution` with the initiating JWT,
then invokes the existing cashout engine using only the isolated test store.
Client-controlled mode, amount, account and destination are rejected at this
endpoint. Credentials never enter the client. Context must be test mode.

The new function is dormant unless `SANDBOX_CREATOR_CASHOUT_ENABLED=true` and
`STRIPE_CASHOUT_TEST_KEY` is a test credential. These names document deployment
prerequisites, not authorization to change secrets or enable execution.
The dedicated webhook uses `STRIPE_CASHOUT_TEST_WEBHOOK_SECRET`, rejects live
events and wrong connected-account/execution bindings, and only reconciles
current provider state with GETs. It cannot dispatch a transfer or payout.
It can reconcile existing attempts even while new dispatch is disabled.

Each explicit continuation executes at most one shared-engine dispatch stage.
Unknown results remain reconcile-only; an empty provider lookup does not
authorize another payout. No background scheduler is introduced here.

## Evidence and remaining gates

Focused automated tests cover test credentials/mode binding, authorization
before service reads, isolated RPC routing, shared engine transfer/payout
stages, webhook boundaries, stale-session/client controls, duplicate clicks,
and ambiguous responses. They mock provider transport and do not prove actual
Stripe configuration, bank delivery or installed behavior.

Before declaring end-to-end readiness: integrate and validate the companion
database migration; inspect actual test account/capability/destination and
qualification readiness; verify the dedicated webhook; exercise real sandbox
purchase/access, earnings, refunds/late failures and test payout on Android
and iOS. Full exact-head Required Validation remains a merge gate. No provider
setup, credential changes, tester enrollment, deployment or release is part of
this checkpoint. Rollback is to remove the new UI mount/adapter deployment;
existing unknown executions must retain their isolated reconciliation records.
