# US compliance evidence workflow

This is implemented preparation tooling, not tax advice, a collection engine,
registration, filing, provider approval, or permission to activate money.

## Audit and reuse

The existing `commerce-tax-readiness.ts` and `bind_commerce_tax_checkout_policy`
already bind scoped tax evidence to checkout. Provider metadata preserves the
tax-policy identity. `scripts/live-money-readiness.mjs` inventories live evidence
and money switches without granting activation. Reuse these systems. Do not
create another tax calculator, ledger, checkout gate, or synthetic live tax row.

The missing preparation step was a consistent jurisdiction-by-jurisdiction review
register. The new offline tool distinguishes sales-tax reviews from creator
information reporting and highlights missing, due, and soon-due evidence reviews.
It includes all 50 states plus DC and four business-fact dependencies. It performs
no network requests or database operations and never grants legal clearance.

## Use

```sh
node scripts/compliance-evidence-review.mjs --template > /private/local/review.json
node scripts/compliance-evidence-review.mjs --input /private/local/review.json --as-of 2026-11-14
node --test tests/compliance-evidence-review.test.mjs
```

Choose a real private local directory; the example path is illustrative. Do not
commit populated operational registers. No credentials, TINs, personal names,
addresses, customer transactions or provider payloads belong in this input.
Reviewer and evidence references are opaque internal labels, not identities or
URLs. Actual evidence stays in approved private storage. Output omits references.

Each track starts `unreviewed`. After an actual documented review, record
`reviewed`, an accountable reviewer reference, evidence reference, `reviewedOn`,
and `reviewBy`. Dates use UTC calendar days. Due dates today or earlier need
review; dates within 30 days are due soon. Choose the review horizon based on the
evidence and legal effective date, not an arbitrary far-future expiry. A recorded
review can conclude that responsibility remains unresolved; it is not a ready
status. Preserve that conclusion in the referenced evidence and existing gates.

Re-run when product rights, operating locations, sales history, contracts,
providers or law change. A scheduled invocation is not installed by this PR.
An empty action list means only that review dates/references are recorded. The
tool always returns `activationAuthority: false` and `legalClearance: false`.

## Review contents and handoff to existing systems

Sales tax: document marketplace definition, physical/economic nexus, exact gross
sales basis and time window, SKU rights/bundles, destination sourcing, local taxes,
registration or supported no-collection basis, filing calendar and responsible
party. Do not infer all-state tax exemption from being below one dollar threshold.

Creator reporting: assign the actual payer, form, recipient/source-state test,
effective-year threshold, withholding, transmission route, acceptance evidence,
corrections and retention. Federal combined filing is not automatically enough.
Do not duplicate 1099-K and 1099-NEC for the same settlement payment.

Only separately authorized operational work may configure existing tax/provider
qualification after verifying actual evidence. Readiness remains scoped by
product, account, environment and destination. Do not load this register into a
qualification table or use it to bypass existing policies. Sandbox fixtures never
prove live registration or tax readiness. Keep all live money and payout controls
off until separately approved.

## Research status and known conflicts

See [the corrected research addendum](COMPLIANCE_RESEARCH_ADDENDUM_2026_11_14.md).
It supersedes the historical Pennsylvania $10,000 reporting election warning
(suspended) and Rhode Island's superseded February 2026 $100 reporting guidance.
Nine state reporting rows remain explicitly unverified; other rows are partial or
narrow findings, not clearance. Alabama's exact threshold edge, Kentucky's amended
lookback, Pennsylvania's boundary/period and Texas's exact-edge start date need
documented resolution before those parameters govern live decisions.

Actual entity classification, operating locations, historical sales/registrations,
product rights/bundles and settlement/reporting contracts remain fact-dependent.
Obtain a consolidated professional review rather than registering everywhere or
buying unsupported provider connectors. No public tax promises are made here.
