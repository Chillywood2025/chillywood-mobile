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

**Still required before admission or end-to-end claims:**
1. Future-only immutable platform binding at atomic checkout reservation. Existing
   checkout attempts bind recipient but not historical platform; unknown old
   dispatches must not be retrospectively relabeled.
2. Forward-only private receipts, allocations, executions, actual payout-cost
   qualification, observations and returns. Reject funding/reversal SQL claims.
3. Reuse existing provider-account uniqueness and creator lock, adding tip-row
   locks before creator advisory locks and durable cross-lane unknown/held-write
   exclusion. Prove native contention and refund/late-paid holds.
4. Authorized exact-session server routing and shared sandbox panel states.
5. Trusted provider readiness, actual sandbox buyer/creator/device flow, and
   exact-head Required Validation. Current mock fixtures are not provider proof.

No endpoint or SQL adapter currently emits `prefunded_destination`; these helpers
are dormant. PR653 migration is unchanged. Existing real-money switches remain OFF.
