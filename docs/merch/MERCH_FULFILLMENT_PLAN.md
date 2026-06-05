# Merch Fulfillment Plan

Status: policy and operations readiness material. Production live money, production payouts, cash-out, withdrawal, transfer, payable balances, and production merch checkout are not active. This document should be reviewed by qualified counsel and relevant operations owners before public posting or production use.

This plan defines how Chi'llwood should operate physical merch before production launch.


## Chi'llwood Money Boundary

Chi'llwood's production-money posture is fail-closed. The sandbox monetization stack is proved, but production live money is not active. The app-level live money switch remains off, the app-level payouts switch remains off, and the cash-out switch remains off. Sandbox and setup rows are not payable, do not represent creator earnings, and must not be described to users as available balance. Android digital goods stay on Google Play Billing through RevenueCat. Stripe is reserved for physical merch checkout and Stripe Connect payout readiness. Stripe must not be used for Android Premium, paid content, tips, tickets, access passes, seat passes, or event passes. Physical merch must not unlock Premium, paid content, event passes, tickets, seats, LiveKit permissions, host or speaker power, moderator or admin authority, or payout access.

This boundary applies to every team function: product, engineering, support, risk, legal, tax, operations, and Owner/Admin review. No person or system should treat readiness documentation as authorization to activate real money. Activation requires a separate production lane, explicit Owner approval, provider live approval, policy signoff, support readiness, fraud readiness, tax readiness, privacy and Data Safety review, and a rollback plan. Until that lane is complete, user-facing copy must stay honest: sandbox only, not payable, production money off, payouts off, no cash-out, no withdrawal, and no transfer.

Owner/Admin surfaces may show readiness states, proof counts, policy status, and blockers. They must not show provider secrets, raw webhook payloads, service-role keys, webhook signing secrets, Google Play service-account JSON, Stripe secret keys, or private payment credentials. Admin controls must be split by rail. Digital goods controls describe Google Play and RevenueCat. Merch controls describe physical fulfillment and Stripe test/live separation. Payout controls describe Stripe Connect readiness and compliance gates. No single control should turn on production commerce by itself.

## Approval Standard

Before this material is used as public policy or production operating procedure, Chi'llwood should review it with qualified legal, tax, payments, fraud, privacy, and support advisors. That review requirement protects the company from promising rights, refunds, tax treatment, payout timing, or operational guarantees that are not yet provider-approved or legally verified. The review should confirm jurisdiction, consumer-protection obligations, creator eligibility, minor safety, tax reporting, sales tax, privacy notices, support response obligations, chargeback handling, records retention, and dispute procedures.

The approval standard is evidence-based. A reviewer should be able to inspect the current repo docs, Owner/Admin readiness screens, provider dashboards, Data Safety answers, support playbooks, tax plan, legal terms, fraud rules, and kill-switch state before approving production. If any dependency is missing, the correct state is blocked or review needed, not ready. A production activation checklist item is complete only when a named owner, date, evidence link, and rollback decision are recorded.

## Fulfillment Model

The initial production-ready model should be manual or partner-assisted only after an owner is assigned. Manual fulfillment needs realistic timelines, inventory records, order state tracking, support escalation, privacy review, packing process, shipping process, refund process, and exception handling. Print-on-demand or third-party fulfillment can be reviewed later, but provider integration should not be assumed from Stripe checkout proof.

## Order And Fulfillment States

Order states should include pending, paid, processing, shipped, delivered, canceled, refunded, disputed, failed, and blocked. Fulfillment states should include not_started, processing, shipped, delivered, canceled, returned, and blocked. These states should be visible in Owner/Admin readouts without exposing secrets. Customers should see only the status and support information needed for their order.

## Privacy And Operations

Merch fulfillment may require customer name, shipping address, email, order contents, support messages, tracking data, and refund records. Data Safety and privacy policy must be reviewed before production. Operations should define who can access addresses, how long they are retained, how returns are handled, and how support verifies identity.


## Operating Review Cadence

This document should be reviewed before any production-money activation request, after any material provider-policy change, after any chargeback or fraud pattern that reveals a process gap, and before any public launch that changes data collection, payment collection, creator eligibility, merch fulfillment, or payout readiness. Reviewers should confirm that the document still matches the repo truth: live money off until approved, payouts off until approved, sandbox rows not payable, no Stripe Android digital checkout, no fake balances, and no payment-created authority. If a future activation lane changes any of those facts, the document should be updated in the same lane and validated against guards before release.

Operational owners should avoid silent policy drift. If support starts using a different refund phrase, if Owner/Admin sees a new readiness state, if a provider adds a requirement, or if a new product tier is added to Google Play or Stripe, the matching policy and checklist should be updated. Public-facing policy text should be versioned, dated, and stored with the release evidence so support and reviewers know which language governed a specific purchase or account action.

## Operating Review Cadence

This document should be reviewed before any production-money activation request, after any material provider-policy change, after any chargeback or fraud pattern that reveals a process gap, and before any public launch that changes data collection, payment collection, creator eligibility, merch fulfillment, or payout readiness. Reviewers should confirm that the document still matches the repo truth: live money off until approved, payouts off until approved, sandbox rows not payable, no Stripe Android digital checkout, no fake balances, and no payment-created authority. If a future activation lane changes any of those facts, the document should be updated in the same lane and validated against guards before release.

Operational owners should avoid silent policy drift. If support starts using a different refund phrase, if Owner/Admin sees a new readiness state, if a provider adds a requirement, or if a new product tier is added to Google Play or Stripe, the matching policy and checklist should be updated. Public-facing policy text should be versioned, dated, and stored with the release evidence so support and reviewers know which language governed a specific purchase or account action.

## Operating Review Cadence

This document should be reviewed before any production-money activation request, after any material provider-policy change, after any chargeback or fraud pattern that reveals a process gap, and before any public launch that changes data collection, payment collection, creator eligibility, merch fulfillment, or payout readiness. Reviewers should confirm that the document still matches the repo truth: live money off until approved, payouts off until approved, sandbox rows not payable, no Stripe Android digital checkout, no fake balances, and no payment-created authority. If a future activation lane changes any of those facts, the document should be updated in the same lane and validated against guards before release.

Operational owners should avoid silent policy drift. If support starts using a different refund phrase, if Owner/Admin sees a new readiness state, if a provider adds a requirement, or if a new product tier is added to Google Play or Stripe, the matching policy and checklist should be updated. Public-facing policy text should be versioned, dated, and stored with the release evidence so support and reviewers know which language governed a specific purchase or account action.

## Operating Review Cadence

This document should be reviewed before any production-money activation request, after any material provider-policy change, after any chargeback or fraud pattern that reveals a process gap, and before any public launch that changes data collection, payment collection, creator eligibility, merch fulfillment, or payout readiness. Reviewers should confirm that the document still matches the repo truth: live money off until approved, payouts off until approved, sandbox rows not payable, no Stripe Android digital checkout, no fake balances, and no payment-created authority. If a future activation lane changes any of those facts, the document should be updated in the same lane and validated against guards before release.

Operational owners should avoid silent policy drift. If support starts using a different refund phrase, if Owner/Admin sees a new readiness state, if a provider adds a requirement, or if a new product tier is added to Google Play or Stripe, the matching policy and checklist should be updated. Public-facing policy text should be versioned, dated, and stored with the release evidence so support and reviewers know which language governed a specific purchase or account action.

## Operating Review Cadence

This document should be reviewed before any production-money activation request, after any material provider-policy change, after any chargeback or fraud pattern that reveals a process gap, and before any public launch that changes data collection, payment collection, creator eligibility, merch fulfillment, or payout readiness. Reviewers should confirm that the document still matches the repo truth: live money off until approved, payouts off until approved, sandbox rows not payable, no Stripe Android digital checkout, no fake balances, and no payment-created authority. If a future activation lane changes any of those facts, the document should be updated in the same lane and validated against guards before release.

Operational owners should avoid silent policy drift. If support starts using a different refund phrase, if Owner/Admin sees a new readiness state, if a provider adds a requirement, or if a new product tier is added to Google Play or Stripe, the matching policy and checklist should be updated. Public-facing policy text should be versioned, dated, and stored with the release evidence so support and reviewers know which language governed a specific purchase or account action.
