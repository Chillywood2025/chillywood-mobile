# Prefunded custom-tip source checkpoint — not enabled

This isolated follow-on starts at PR653 `8fb79aadc169bf18a78be7fe90b1dc4cdcd362de`.
It does not admit Stripe destination-charge tips to the fund-first source list.
Buyer-selected integer cents are preserved; no fixed native SKU substitutes for
custom tips. No provider, database, deployment or live-money settings changed.

Implemented foundations:
- Explicit test-only standard payout mode in the existing engine. Forbidden
  funding/reversal phases fail before provider access, with a second POST guard.
- Actual connected payout debit and return-credit facts retain observed costs;
  no simulated return fee or missing-fee-as-zero inference.
- Pure allowlisted test Checkout → PaymentIntent → charge → transfer → connected
  destination payment → available connected-credit normalizer. The source
  transfer is evidence, never a cashout funding transfer. `py_` is supported.
- Fixed-host bounded GET collector; no public endpoint accepts these facts.

Additional unqualified WIP integration now includes future-only atomic checkout
platform binding, private receipt/allocation/execution/return/probe tables,
source/qualification holds, shared execution routing, a GET-only receipt endpoint,
and a nested exact-session-gated panel. Existing unbound historical attempts are
not backfilled. The PR653 migration remains unchanged.

Connected payout balance-transaction fees and separately billed provider costs
are distinct. The narrow qualifier requires independently evidenced **approved
cost-ownership policy** before any platform-absorbed treatment; being billed to
the platform does not establish that policy. Unknown creator allocation or later
billing blocks eligibility. No qualification or cost policy is seeded.

**Still required before readiness/end-to-end claims:** native contention proof
for the new cross-lane/tip locks and identity uniqueness; full frozen-head source
validation; independent financial-path review; actual provider fee completeness,
account/writer qualification, webhook and installed-device commissioning.
Current mocked and disposable SQL fixtures are not actual provider proof.

The owner is considering an alternative **future-only** platform-charge pattern
to retain actual qualified creator fees before funding. No charge-pattern switch
has been made or approved by this WIP. Either pattern needs actual settlement
authority: PR653's simulated deductions cannot substitute for it.

All new execution remains unqualified and deployment/activation is outside this
checkpoint. Existing real-money switches remain OFF. Do not merge this WIP as a
completed payment flow or advertise a permanent manual hold as readiness.
