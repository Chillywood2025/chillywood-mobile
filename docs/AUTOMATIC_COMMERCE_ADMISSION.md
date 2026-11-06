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
Independent wave1 tax/sanctions evidence remains separate and mandatory for live
financial authority. The strict one-argument financial predicate retains its
verification requirements and also requires current creator Premium. Missing
payout legal document configuration is a platform
setup blocker, not a request for individual owner approval. This patch supplies no
legal documents, tax certifications, sanctions certificates or new authority to
assert them. A safe deployment requires resolving those global evidence and legal
sources separately, not changing unknown values to true.

The dormant observer and its separate operational prerequisites are documented in
[AUTOMATIC_CREATOR_PROVIDER_OBSERVATION.md](AUTOMATIC_CREATOR_PROVIDER_OBSERVATION.md).

## Separate Sandbox creator capability

The readback reports a separate sandboxCapability with environment sandbox and
financialAuthority false. Unknown live tax, sanctions, KYC or payout evidence is
not promoted to verified. The normal eligibility state stays pending and
canCreateMoneyExposure stays false. The UI accepts Sandbox tool access only from
the current server readback bound to the exact signed-in account and session.

Only consumers with their own authoritative stored sandbox/test mode use the
separate capability. It requires current mode-appropriate Premium, account and
legal authority, adult US declaration/known facts, clear moderation, no explicit
negative independent evidence, and no fraud/admin hold. Live money, payouts and
cashout must all be explicitly off. Production-only publication, tax setup and
financial paths retain their strict guards; global mode alone never relabels a
production operation as Sandbox.

Store simulations still bind the exact sandbox catalog, provider event, purchase
intent and original transaction. Their access is sandbox_only and their ledger
is not_payable. Physical merchandise test checkout selects a test secret and
rejects live-mode responses. Native App Store/Play test tips need no Connect
account. Their separate server-native capability never changes external canTip
or setup status. External Stripe test tipping selects the test Connect account
even when a separate live account exists, and retains its actual provider
readiness checks. Missing live-only compliance is not a reason to require an owner grant,
but a provider-required test capability that is genuinely unavailable still
blocks that specific flow. Global test feature switches remain authoritative.

## Isolated test cashout exception

The retained sandbox cashout simulator uses its own test-only provider qualification
and exclusively sandbox source ledger allocations. It requires Premium creator
session authority, declared/known adult US eligibility, current legal acceptance,
clear moderation, and no explicit independent tax/sanctions/provider/KYC/payout disqualification or
account/fraud hold. Unknown live tax/sanctions evidence does not prevent this isolated test flow.
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
New fraud holds and terminal quarantines need insertion fences, not just locks
on rows that already exist. Native PostgreSQL tests, not sequential SQL tests, must prove
blocking order and refresh/dispatch races.

Participating commerce entrypoints take one exclusive transaction advisory gate
before their existing identity, Premium, provider, creator, retention and source
locks. Direct authority writes enter before acquiring their target rows.
Covered authority membership is protected by the same gate, including a first
disqualifying account or hold. Ordinary admission no longer waits on authority
tuples or conflicting table SHARE locks while holding the gate. Separate tax and
other membership fences remain where their writers are not covered by this
protocol. The gate is lock-only: historical receipt, reconciliation and refund
entrypoints gain no fresh Premium or new-sale eligibility requirement.

The gate is deliberately exclusive from entry. Nested refreshes and writes must
not upgrade a shared lock. Authoritative predicates are evaluated in separate
commands after waits under READ COMMITTED, and time-based expiry is rechecked at
the final admission point. Existing current-session, mode, legal and provider
checks remain in addition to the gate.

This is conservative serialization across users, not a throughput optimization.
A slow source-row wait can delay unrelated participating transactions. Provider
network requests never run inside a gate-holding database transaction. Realistic
load and operational capacity must be qualified before enablement. Hosted native
validation must establish actual blocking, both transaction orders, post-wait
denials, rollback and idempotency. Sequential fixtures alone cannot prove these
properties. The supported protocol does not promise freedom from deadlocks for
arbitrary multi-statement SQL or uninspected external Auth prelocks.

Profile scan metadata has a narrow exception so existing media recovery does not
join the commerce gate. Only an UPDATE changing the fixed scan/status metadata
fields and timestamps may use it. Role, user ID, visibility, URLs and every other
field remain protected. Naming a protected column in an UPDATE still takes the
gate even if its value is unchanged. A final assert-only check examines the
actual row after all BEFORE triggers; a late protected change or an unknown new
field cannot silently use the exception. Media provenance, moderation, retention
and enqueue triggers are unchanged. This removes a commerce-lock dependency; it
does not claim to repair every pre-existing media-job concurrency problem.

Owned positively-undispatched abort and historical cashout status remain usable
after creator membership expiry. Current actor account/session restrictions still
apply. Proven reversal and funding-return recovery retain their own independent
qualification and idempotency checks rather than depending on new-sale switches.

Already-purchased viewer delivery is separate from new-sale admission. Exact
nonrefunded receipt, source, captured mode and finite access terms still bind.
Creator Premium expiry, logout, stale payout observations or a later money-mode
switch do not revoke those paid rights. Current account, moderation, age/market,
sanctions, legal invalidation and fraud/admin restrictions still deny delivery.
Retained legal acceptance is checked against current required documents without
requiring the seller to stay logged in. Host authoring and new checkout keep
their current Premium and mode requirements. Paid-order shipping/support actions
likewise retain their exact current actor checks without becoming new sales.

## Release boundary

First live merchandise publication keeps the original draft in Sandbox until
the reviewed transaction finishes its ordinary photo, variant and rights checks.
Only its existing private transaction/product confirmation context selects strict
production creator authority for that inner validation. The generic Sandbox
writer cannot borrow this context. A failed validation rolls back the listing,
mode, private context and publication receipt together.

This source requires exact-head Required Validation, review and normal protected
merge. Merge is not deployment, provider configuration, credential provisioning,
scheduling, release or live-money activation. Controlled synthetic provider facts
and test receipts are regression fixtures, never operational verification.
