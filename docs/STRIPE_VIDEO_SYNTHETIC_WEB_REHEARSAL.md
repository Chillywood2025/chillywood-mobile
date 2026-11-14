# Explicit synthetic web checkout rehearsal

This source-only lane tests checkout, receipt/refund and playback mechanics with
real Stripe **test-mode** responses. It does not establish tax compliance,
registration, tax exemption, native-store eligibility or production readiness.

No fixture policy, provider setting, credential or enablement flag is installed
by the migration. Existing application and Edge default-off controls remain.
There is no client or service-role table write API to create a policy. Any
future policy provisioning needs its own authorized, reviewed setup step.

Each policy identifies one account, product, buyer, creator and video, and is
explicitly labeled `synthetic_test_no_collection`. It is web-only, USD-only,
expires within 24 hours, permits at most 20 orders and caps each order at at most
100,000 cents (the setup can choose lower limits). Policy creation defaults off;
identity and budgets cannot be changed afterward. Revocation is supported.
Bindings are immutable, counted under a policy row lock, and a retry of the
same order does not consume another slot. Failed/abandoned orders still count.
The immutable `product_tax_code` records the actual test catalog value; the
handler still compares it to the provider-retrieved product. This is catalog
identity evidence only, not a professional tax-classification opinion.

The Stripe-hosted page identifies the synthetic test. Provider receipts must
retain the exact synthetic metadata, have `livemode=false`, disabled automatic
tax and an observed zero tax amount. This is not relabeled
`verified_no_collection`: no claim of legal exemption is made. Actual amount,
account, product, payment, refund, fee and access validation still applies.

Native readiness never reads fixture policies. Ordinary tax qualifications,
Android reporting/refunds and all production tax gates remain unchanged.
Historical fixture bindings survive revocation/expiry so refunds and evidence
reconciliation can finish without authorizing another purchase.

Local focused tests cover explicit labels, wrong identities/platforms/live
receipts, positive tax rejection, default-off, expiry/budget/immutability, and
separate qualification tables. Required Validation is still needed for merging.
