# Money Support Workflow

Status: policy and operations readiness material. Production live money, production payouts, cash-out, withdrawal, transfer, payable balances, and production merch checkout are not active. This document should be reviewed by qualified counsel and relevant operations owners before public posting or production use.

Money admin authority and activation governance is closed in `docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md`: provider refunds remain manual/external; manual refund support status can be recorded only with exact scope and audit; Admin can view/manage only exact money-support scopes; Moderator cannot activate money; provider transaction/customer/order data is masked/scoped; access grant revoke/removal requires exact scope, reason, target, and audit; no Google Play, RevenueCat, Stripe, payout, purchase, refund, or product mutation happened.

This document defines support categories, evidence, escalation, and response limits for Chi'llywood money features.


## Chi'llywood Money Boundary

Chi'llywood's production-money posture is fail-closed. The sandbox monetization stack is proved, but production live money is not active. The app-level live money switch remains off, the app-level payouts switch remains off, and the cash-out switch remains off. Sandbox and setup rows are not payable, do not represent creator earnings, and must not be described to users as available balance. Android digital goods stay on Google Play Billing through RevenueCat. Stripe is reserved for physical merch checkout and Stripe Connect payout readiness. Stripe must not be used for Android Premium, paid content, tips, tickets, access passes, seat passes, or event passes. Physical merch must not unlock Premium, paid content, event passes, tickets, seats, LiveKit permissions, host or speaker power, moderator or admin authority, or payout access.

This boundary applies to every team function: product, engineering, support, risk, legal, tax, operations, and Owner/Admin review. No person or system should treat readiness documentation as authorization to activate real money. Activation requires a separate production lane, explicit Owner approval, provider live approval, policy signoff, support readiness, fraud readiness, tax readiness, privacy and Data Safety review, and a rollback plan. Until that lane is complete, user-facing copy must stay honest: sandbox only, not payable, production money off, payouts off, no cash-out, no withdrawal, and no transfer.

Owner/Admin surfaces may show readiness states, proof counts, policy status, and blockers. They must not show provider secrets, raw webhook payloads, service-role keys, webhook signing secrets, Google Play service-account JSON, Stripe secret keys, or private payment credentials. Admin controls must be split by rail. Digital goods controls describe Google Play and RevenueCat. Merch controls describe physical fulfillment and Stripe test/live separation. Payout controls describe Stripe Connect readiness and compliance gates. No single control should turn on production commerce by itself.

## Approval Standard

Before this material is used as public policy or production operating procedure, Chi'llywood should review it with qualified legal, tax, payments, fraud, privacy, and support advisors. That review requirement protects the company from promising rights, refunds, tax treatment, payout timing, or operational guarantees that are not yet provider-approved or legally verified. The review should confirm jurisdiction, consumer-protection obligations, creator eligibility, minor safety, tax reporting, sales tax, privacy notices, support response obligations, chargeback handling, records retention, and dispute procedures.

The approval standard is evidence-based. A reviewer should be able to inspect the current repo docs, Owner/Admin readiness screens, provider dashboards, Data Safety answers, support playbooks, tax plan, legal terms, fraud rules, and kill-switch state before approving production. If any dependency is missing, the correct state is blocked or review needed, not ready. A production activation checklist item is complete only when a named owner, date, evidence link, and rollback decision are recorded.

## Support Categories

Support categories include Premium purchase issue, paid content access issue, Watch-Party Seat Pass issue, Live access pass issue, Live seat pass issue, event pass issue, creator tip issue, merch order issue, refund request, chargeback or dispute, creator payout status, KYC/tax onboarding help, fraud hold appeal, account payment safety, and internal sandbox tester issue. Each case should be tagged with rail, user, source, provider, and safety state where available.

Fraud/payment concerns submitted through the report sheet route to money/refund/access support as a separated work area. Reporting and moderation workflow: Closed after validation. Reporter identity stays private by default, reported users are not notified merely because a report was filed, and payment/access reports do not execute provider refunds or money movement.

Content takedown decisions: Closed for production decision policy and current backed enforcement after validation. Paid-access history is preserved when content is hidden, removed, restricted, canceled, unavailable, malware-blocked, DMCA-disabled, or otherwise inaccessible. Takedown does not execute provider refunds, enable payouts, move money, or create payable balances. Support can review access/refund status and record manual/external refund support status only with exact permission.

## What Support Can Do

Support can explain current status, collect evidence, verify account identity through approved support process, check safe readouts, escalate to Owner/Admin, explain refund or access process, confirm that sandbox rows are not payable, and route provider-specific issues to the correct provider path. Support can correct misleading copy or missing docs by opening an internal issue.

Account restriction and appeals operations: Closed for current production policy and existing backed enforcement. Support can route suspension/deactivation/restore appeals through support/escalation workflow in V1, but support is not a separate role and cannot independently suspend, deactivate, restore, purge, de-identify, refund, move money, or enable payouts. Appeals do not expose reporter identity or private evidence.

Support is a work area, not a separate role. Moderator role scope: Closed. Moderator includes support duties when granted exact support scopes such as `support_inbox`, `creator_support`, `billing_support_read`, `admin.support.view`, `admin.support.manage`, `admin.payment_status.view`, or `admin.refund_status.record`. Admin may also receive support scopes when granted by Owner/First Owner. Do not create a separate Support role and do not add `support` to `platform_role_memberships`.

Moderator can record manual/external refund support status only with permission. Moderator cannot issue refunds, trigger Google Play refunds, trigger RevenueCat refunds, approve payouts, move money, enable Stripe Connect, enable creator-money, enable `live_money_enabled`, or enable Premium public activation.

## What Support Cannot Do

Support cannot promise guaranteed payout, guaranteed refund, guaranteed access if the content or room is unsafe, guaranteed merch delivery without fulfillment proof, tax advice, legal advice, provider approval, KYC approval, cash-out, withdrawal, transfer, balance availability, or production activation. Support cannot bypass content safety, Premium gates, LiveKit authority, host approval, admin authority, or provider policy.

## Response Targets

Chi'llywood should set practical response targets by severity: payment-access blockers, merch delivery issues, disputes, payout-readiness questions, and policy appeals may need different timelines. Until formal staffing exists, public policy should avoid hard service-level promises that cannot be met. Every escalation should include evidence and audit notes.


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
