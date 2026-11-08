# Prepared-only allocation closure candidate

This inactive add-on closes an exact registered allocation only when the server
has never recorded a dispatch marker, attempt or receipt. Install `close.sql`
after the combined commands and checkout abandonment modules, before the final
permissions pass, in the same fresh inactive installation transaction. It adds
one service-only RPC; it does not replace any frozen function.

The client first persists a native prepared-only tombstone that invalidates old
invocation handles. It then durably records an explicit `close_prepared` action.
The server independently locks reservation then intent with NOWAIT, verifies the
original customer, allocation, registration, session, configuration, full asset
quote and reservation revision, and records an immutable closure. Native proof
is not accepted as server economic authority. Any historical claim, including
an expired or unknown one, disqualifies this operation.

The payload is exactly `customerBindingId`, `intentId`, `dispatchId`,
`registrationId`, `originalSessionId`, `expectedReservationRevision` and
`expectedQuote`. Successful data contains the expired historical intent,
`closure` of kind `unclaimed_allocation`, and `replayed`. The closure retains
the old and released reservation revisions; a replay cannot clear a subsequent
reservation. A new explicit action can acknowledge the same immutable closure
from a fresh authenticated session without changing its original allocation
session or quote.

`recover_close_prepared` takes only `originalRequestId`. A known result retains
the original close actor session separately from the allocation session inside
the original payload. Missing or uncommitted actions return `unknown`, with
null intent and closure. Unknown is not evidence of no effect. Clients must not
automatically resend an uncertain mutation.

This is not provider cancellation or a no-charge claim. Provider plans, tickets,
raw events and negative evidence remain retained; the provider-object ceiling
stays 32. Existing explicit unknown-outcome continuation remains separate.

Qualification: the local PG17.6 managed-owner fixture passed 26 groups, including
both close/claim race orders, expired-claim rejection, lost-response recovery,
fresh-session acknowledgment, immutable records, exact ACLs, post-retirement
history and prevention of releasing a newer reservation. The frozen proof is
`test-store-v3-prepared-closure-managed-5567c12de5ca.json`, SHA256
`5567c12de5ca9ea9497bf76ccd7865f6c4b0d5d5a4659b8eb1e3045d75cd26d2`.
Provider traffic, receipts and scanner observations in this fixture are synthetic.
The proof does not qualify a device build, actual provider, target permissions,
deployment or activation.
