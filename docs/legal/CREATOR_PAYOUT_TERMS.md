# Creator Payout Terms

Status: policy and operations readiness material. Production live money, production payouts, cash-out, withdrawal, transfer, payable balances, and production merch checkout are not active. This document should be reviewed by qualified counsel and relevant operations owners before public posting or production use.

These terms describe the payout framework Chi'llywood should use only after production payout activation is approved. Payout readiness is currently read-only and no payout execution is available.


## Chi'llywood Money Boundary

Chi'llywood's production-money posture is fail-closed. The sandbox monetization stack is proved, but production live money is not active. The app-level live money switch remains off, the app-level payouts switch remains off, and the cash-out switch remains off. Sandbox and setup rows are not payable, do not represent creator earnings, and must not be described to users as available balance. Android digital goods stay on Google Play Billing through RevenueCat. Stripe is reserved for physical merch checkout and Stripe Connect payout readiness. Stripe must not be used for Android Premium, paid content, tips, tickets, access passes, seat passes, or event passes. Physical merch must not unlock Premium, paid content, event passes, tickets, seats, LiveKit permissions, host or speaker power, moderator or admin authority, or payout access.

This boundary applies to every team function: product, engineering, support, risk, legal, tax, operations, and Owner/Admin review. No person or system should treat readiness documentation as authorization to activate real money. Activation requires a separate production lane, explicit Owner approval, provider live approval, policy signoff, support readiness, fraud readiness, tax readiness, privacy and Data Safety review, and a rollback plan. Until that lane is complete, user-facing copy must stay honest: sandbox only, not payable, production money off, payouts off, no cash-out, no withdrawal, and no transfer.

Owner/Admin surfaces may show readiness states, proof counts, policy status, and blockers. They must not show provider secrets, raw webhook payloads, service-role keys, webhook signing secrets, Google Play service-account JSON, Stripe secret keys, or private payment credentials. Admin controls must be split by rail. Digital goods controls describe Google Play and RevenueCat. Merch controls describe physical fulfillment and Stripe test/live separation. Payout controls describe Stripe Connect readiness and compliance gates. No single control should turn on production commerce by itself.

## Approval Standard

Before this material is used as public policy or production operating procedure, Chi'llywood should review it with qualified legal, tax, payments, fraud, privacy, and support advisors. That review requirement protects the company from promising rights, refunds, tax treatment, payout timing, or operational guarantees that are not yet provider-approved or legally verified. The review should confirm jurisdiction, consumer-protection obligations, creator eligibility, minor safety, tax reporting, sales tax, privacy notices, support response obligations, chargeback handling, records retention, and dispute procedures.

The approval standard is evidence-based. A reviewer should be able to inspect the current repo docs, Owner/Admin readiness screens, provider dashboards, Data Safety answers, support playbooks, tax plan, legal terms, fraud rules, and kill-switch state before approving production. If any dependency is missing, the correct state is blocked or review needed, not ready. A production activation checklist item is complete only when a named owner, date, evidence link, and rollback decision are recorded.

## Payout Eligibility

A creator should become payout eligible only after accepting payout terms, completing required Stripe Connect onboarding, satisfying KYC and tax requirements, clearing fraud and policy review, meeting any minimum payout threshold, and having an approved payout method. Provider status alone is not enough. App-level payout approval, support readiness, refund reserve rules, chargeback handling, and Owner/Admin approval are required before payout execution.

## Tax And Verification

Creators are responsible for accurate tax identity and payment information. Chi'llywood should rely on Stripe Connect where appropriate for identity and tax collection, but the platform must still confirm its own filing responsibilities with tax professionals. U.S. and non-U.S. creators may require different forms, withholding decisions, support processes, and reporting timelines. No document should promise 1099 treatment, payout timing, or withholding outcomes until tax review is complete.

## Payout Holds

Payouts may be held for new creator review, KYC or tax incompleteness, provider requirements, suspicious sales, refund or chargeback spikes, policy reports, blocked accounts, suspicious device changes, negative balance risk, disputes, or legal requests. Holds should be visible as review states, not as available balances. Releasing a hold should require evidence, audit reason, and authorized Owner/Admin action after production activation.

## No Current Payout Execution

Current Chi'llywood payout readiness is sandbox/read-only. Creators cannot request payout, simulate payout, cash out, withdraw, transfer, or access a payable balance. Test-mode Stripe Connect statuses may appear in readiness screens, but they are not approval for real payouts. Sandbox and setup rows are not earnings.


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
