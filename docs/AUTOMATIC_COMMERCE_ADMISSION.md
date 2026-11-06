# Automatic ordinary commerce admission

## Product boundary

Ordinary viewers may buy paid creator content, subscriptions, tickets and physical
merchandise without Premium. Sandbox buyers use their exact authenticated account,
current session and current account terms, not a tester, beta or staff grant.
Premium applies to designated creator capabilities. Creator authority is finite,
provider-backed and revocation-aware; production Premium can test, but sandbox
Premium never authorizes production creator money.

This change removes only manual ordinary tester membership and the hashed one-percent
creator rollout. It grants no administrator, moderator, owner or operator role.
Global feature switches, targeted account/moderation/fraud restrictions, product
publication, legal acceptance, provider account binding and payment-mode controls
remain authoritative. No migration enables live money or deploys a provider.

## Self-service and unresolved readiness

The creator may explicitly declare adult age and US state/DC residency. These are
private self-declarations, not verified identity, age or residency. A declaration
does not accept terms. Missing creator rows enroll lazily as pending when current
creator authority is checked. Read-only buyer and RLS predicates never write a
seller's eligibility. Repeated unchanged refreshes must not invalidate publication
reviews or churn their authority versions.

Provider observations are account-bound and fresh. They never supply independent
tax or sanctions proof. The canonical test account adapter writes tax_status as
not_connected, and the live observer does not fill all legacy verified fields.
Independent wave1 tax/sanctions evidence remains separate and mandatory for normal
creator money authority. Missing payout legal document configuration is a platform
setup blocker, not a request for individual owner approval. This patch supplies no
legal documents, tax certifications, sanctions certificates or new authority to
assert them. A safe deployment requires resolving those global evidence and legal
sources separately, not changing unknown values to true.

The dormant observer and its separate operational prerequisites are documented in
[AUTOMATIC_CREATOR_PROVIDER_OBSERVATION.md](AUTOMATIC_CREATOR_PROVIDER_OBSERVATION.md).

## Isolated test cashout exception

The retained sandbox cashout simulator uses its own test-only provider qualification
and exclusively sandbox source ledger allocations. It requires Premium creator
session authority, declared/known adult US eligibility, current legal acceptance,
clear moderation, and no explicit tax/sanctions disqualification or account/fraud
hold. Unknown live tax/sanctions evidence does not prevent this isolated test flow.
It never establishes live compliance or a real payable balance.

Its Edge entrypoint requires a test-mode key and an enabled sandbox execution
flag. The shared execution engine checks context environment and key mode before
any provider request, checks the account livemode before claiming dispatch, and
verifies transfer/payout response mode. SQL qualifications are constrained to test
mode and new funding/payout requires live-money, payouts and cashout switches OFF.
These independent fences are retained and tested. No production key or live account
can be selected through this path.

## Recovery and concurrency

New-sale dispatch rechecks current buyer session/account and seller membership,
provider state, holds, legal requirements, publication and mode controls under
matching authority locks. Free buyers are not placed under seller Premium locks.
New fraud holds and terminal quarantines need insertion fences as well as row
locks. Native PostgreSQL tests, not sequential database emulation, must prove
blocking order and refresh/dispatch races.

Owned positively-undispatched abort and historical cashout status remain usable
after creator membership expiry. Current actor account/session restrictions still
apply. Proven reversal and funding-return recovery retain their own independent
qualification and idempotency checks rather than depending on new-sale switches.

## Release boundary

This source requires exact-head Required Validation, review and normal protected
merge. Merge is not deployment, provider configuration, credential provisioning,
scheduling, release or live-money activation. Controlled synthetic provider facts
and test receipts are regression fixtures, never operational verification.
